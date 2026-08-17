# Spec BOT-CTX-2 — Sync coexistencia + distinguir bot vs humano-desde-app

> Fecha: 2026-06-05
> Estado: SPEC (no implementada)
> Owner: arquitecto + backend-builder
> Implementación: ANTES de BOT-CTX-1 (BOT-CTX-1 depende de esta)
> Branch sugerida: `feat/bot-ctx-2-coexistence-sync`

---

## 1. Problema

WhatsApp Business activó "coexistencia": el mismo número del bot puede usarse simultáneamente vía API (lo manda el workflow N8N) y vía la app de WhatsApp Business del founder/agentes. YCloud emite `whatsapp.message.updated` IDÉNTICO en ambos casos — no hay campo en el payload que distinga origen.

Hoy el flujo es:

1. Bot N8N hace POST directo a YCloud Send API (sin crear row previo en `messages`).
2. YCloud dispara `whatsapp.message.updated`.
3. El handler `handleMessageUpdated` busca por `(agency_id, channel, external_id=wamid)`. **No encuentra match** → cae al "backfill outbound" (líneas 768-887 de `ycloud-webhook/index.ts`) e inserta hardcoded `sender_kind='bot', is_bot_generated=true`.

Cuando el founder envía desde la app coexistencia ocurre exactamente lo mismo → queda mal clasificado como `bot`. Verificado en producción 2026-06-05.

**Hallazgo de auditoría que ajusta el scope:** `sendMessageViaYCloud` (server action del CRM, líneas 266-420 de `inbox/actions.ts`) ya hace pre-registro correcto. Setea `external_id=wamid` después de la respuesta YCloud (línea 407), por eso esos mensajes SÍ matchean el SELECT del webhook y nunca llegan al backfill. La solución es replicar ese patrón en el workflow N8N.

## 2. Solución técnica — Pre-registro desde N8N + reclasificar backfill

### 2.1 Diagrama de flujo (post-BOT-CTX-2)

```
A) Bot N8N envía un chunk
   ┌────────────────────────────────┐
   │ Loop Over Items (chunk N)      │
   └─────────────┬──────────────────┘
                 ▼
   ┌────────────────────────────────┐
   │ Mensaje no vacio?              │ (existente)
   └─────────────┬──────────────────┘
                 ▼ (true)
   ┌────────────────────────────────┐
   │ NUEVO: Pre-registro Message    │ ← Postgres INSERT
   │ INSERT messages (status=queued,│   sender_kind='bot'
   │   sender_kind='bot',           │   is_bot_generated=true
   │   is_bot_generated=true,       │   external_id NULL (aún no se sabe)
   │   external_id=NULL) RETURNING id│  status='queued'
   └─────────────┬──────────────────┘
                 ▼
   ┌────────────────────────────────┐
   │ Send Chunk via YCloud (POST)   │ (existente — onError: continueRegularOutput)
   └─────────────┬──────────────────┘
                 ▼
   ┌────────────────────────────────┐
   │ NUEVO: Reconciliar wamid       │ ← Postgres UPDATE
   │ UPDATE messages SET            │   external_id=wamid
   │   external_id=wamid,           │   wa_message_id=wamid
   │   wa_message_id=wamid,         │   status='sent'
   │   status='sent', sent_at=NOW() │
   │ WHERE id = $pre_register_id    │
   │ ON CONFLICT (23505) → marcar   │
   │   sent sin external_id         │
   └─────────────┬──────────────────┘
                 ▼
   ┌────────────────────────────────┐
   │ Pausa entre Mensajes           │ (existente)
   └────────────────────────────────┘

B) Webhook `whatsapp.message.updated` llega después
   ┌────────────────────────────────┐
   │ SELECT messages WHERE          │
   │ (agency_id, channel,           │
   │  external_id=wamid)            │
   └─────────────┬──────────────────┘
                 ├── match → UPDATE status (caso bot + caso CRM)
                 └── no match → BACKFILL:
                                  · sender_kind = 'agent' (cambio — fix CRIT-1
                                    del code-review 2026-06-05: 'human' NO es
                                    valor del enum message_sender_kind, que es
                                    lead|bot|agent|system)
                                  · is_bot_generated = false (cambio)
                                  · sender_user_id = NULL
                                  · sent_via = 'coexistence'

C) Server action del CRM (sin cambios)
   sendMessageViaYCloud ya hace pre-registro → match siempre → UPDATE status.
```

### 2.2 Decisiones técnicas

| # | Decisión | Justificación |
|---|---------|---------------|
| D1 | **Patrón pre-registro: dentro del loop, no antes.** Insertar UN row de `messages` POR chunk inmediatamente antes de cada `Send Chunk via YCloud`, no un row único para el turno. | El bot ya chunkea respuestas. Cada chunk genera un `wamid` distinto en YCloud, así que cada chunk necesita su propio row. Replica el modelo del Send Out of Office + Log Out of Office que YA funciona (líneas 1380-1428 del workflow). |
| D2 | **`sender_kind='bot'` (NO `'system'`)** para los chunks del bot. | El precedente OOH usa `'system'` porque es output autogenerado del workflow sin intervención del LLM. Los chunks del bot son output del LLM Sofia C → conceptualmente `'bot'`. Alinea con la convención que ya hardcodeaba el backfill anterior. |
| D3 | **Aceptar herencia: NO migrar rows viejos.** Los rows pre-deploy con `sender_kind='bot'` que en realidad eran del founder desde la app quedan mal clasificados para siempre. | Sin tráfico real previo (Pérez Luna en onboarding sin leads procesados aún). Volumen del bug << 100 mensajes. Migración correctiva por heurística (ej. detectar texto humano vs LLM) introduce riesgo de mis-clasificación inversa. Trade-off claro: cero esfuerzo, contaminación bounded. |
| D4 | **Race condition INSERT → webhook → SELECT: resolverla en el webhook, no en N8N.** | Si el webhook llega antes del UPDATE del wamid en N8N, el SELECT no matchea → backfill. Tres opciones evaluadas: A) Delay 200ms en webhook (frágil). B) Lock optimista (complejidad alta). C) **SELECT con 1 retry corto si NULL.** Elegida C: si el primer SELECT da NULL, esperar 500ms (subido de 300ms tras MED-7 del code-review) y reintentar UNA vez. Si sigue NULL → backfill como agente-coexistencia (que es el comportamiento correcto si realmente vino de la app). |
| D5 | **Columna nueva `sent_via` en `messages`** con enum suelto (text + CHECK). | Permite atribuir el origen del backfill explícitamente: `'coexistence'` para los nuevos backfill, `'api'` para mensajes con match (futuro: opcional setearlo en bot N8N + sendMessageViaYCloud para que sea consistente). V2: usar para identificar agente específico en app coexistencia (requiere integración con linked-devices API de Meta que YCloud no expone hoy). |
| D6 | **`sender_user_id=NULL` en backfill coexistencia (V1).** | YCloud no expone qué dispositivo linked envió. Imposible attribution individual. Documentado como limitation. V2 explora linked-device fingerprinting cuando YCloud lo soporte. |
| D7 | **Continue on fail en el nodo de pre-registro N8N.** | Trade-off: si el INSERT falla (DB caída, conexión perdida) y el flujo se detuviera, el lead queda sin respuesta. Si continuamos, el chunk se envía pero queda como "bot que no registró su mensaje" — caerá al backfill como humano (clasificación incorrecta para ese caso edge). Decisión: **`onError: continueRegularOutput`** en el pre-registro. Mejor enviar mal-clasificado que dejar al lead sin respuesta. |
| D8 | **Reconciliación post-Send: también `onError: continueRegularOutput`.** | El chunk YA salió; si falla el UPDATE del wamid, queda un row con `external_id=NULL, status='queued'`. El webhook va a backfillar uno nuevo correctamente. Es duplicación temporal aceptable (1 row "fantasma" del INSERT inicial + 1 row del backfill webhook). Mitigación V2: cleanup job que borra rows `status='queued', external_id IS NULL, sent_kind='bot'` con `created_at < NOW() - 1h`. |
| D9 | **Snapshot OBLIGATORIO antes del PUT del workflow.** Tag git `bot-c-v1-PRE-BOT-CTX-2-2026-06-05`. | Política de la skill `n8n-workflow-versioning`. PUT sin commit prohibido. Rollback = `git checkout bot-c-v1-PRE-BOT-CTX-2-2026-06-05 -- crm-v2/n8n/workflows/chatbot-momentum-bot-c-v1.json && node scripts/n8n-push.mjs Jsh4krhC9HRUh7Ly crm-v2/n8n/workflows/chatbot-momentum-bot-c-v1.json`. |

### 2.3 Cambios concretos

#### Cambio 1 — Workflow N8N: nuevo archivo `chatbot-momentum-bot-c-v2.json`

Convención `n8n-workflow-versioning`: cambio estructural = `vN+1`. **NO sobreescribir `v1`.**

Nodos nuevos a insertar:

**Nodo `Pre-registro Message`** (Postgres, intercalado entre `Mensaje no vacio?` (true) y `Send Chunk via YCloud`):

```sql
INSERT INTO public.messages (
  agency_id, conversation_id, lead_id, channel, direction,
  sender_kind, kind, body, status, is_bot_generated,
  created_at, sent_via
)
VALUES (
  $1, $2, $3, 'whatsapp', 'outbound',
  'bot',
  $4,                  -- 'text' | 'image' (depende de $json.type del chunk)
  $5,                  -- body o caption según type
  'queued',
  true,
  NOW(),
  'api'
)
RETURNING id;
```

QueryReplacement (expresiones N8N):

```
{{ $('Resolve Agency').first().json.agency_id }},
{{ $('Get Conversation State').first().json.id }},
{{ $('Buscar Lead (Supabase)').first().json.id }},
{{ $json.type === 'image' ? 'image' : 'text' }},
{{ $json.type === 'image' ? ($json.caption || '') : $json.output }}
```

Opciones: `alwaysOutputData: true`, `onError: continueRegularOutput`.

Output: row con `{ id: <uuid> }`. Se propaga al siguiente nodo.

**Nodo `Reconciliar wamid`** (Postgres, intercalado entre `Send Chunk via YCloud` y `Pausa entre Mensajes`):

```sql
UPDATE public.messages
SET external_id  = $1,
    wa_message_id= $1,
    status       = 'sent',
    sent_at      = NOW()
WHERE id = $2
  AND external_id IS NULL  -- idempotencia: si ya se reconcilió, no pisar
RETURNING id;
```

QueryReplacement:

```
{{ $('Send Chunk via YCloud').item.json.body.messages?.[0]?.wamid || $('Send Chunk via YCloud').item.json.body.wamid }},
{{ $('Pre-registro Message').item.json.id }}
```

Nota: YCloud devuelve `wamid` en distintas ubicaciones según versión; el `||` cubre ambas. Confirmar contra payload real en T4 de testing.

Opciones: `onError: continueRegularOutput` (D8).

**Conexiones a modificar:**

- Eliminar: `Mensaje no vacio? → Send Chunk via YCloud` (rama true)
- Agregar: `Mensaje no vacio? → Pre-registro Message → Send Chunk via YCloud → Reconciliar wamid → Pausa entre Mensajes`
- Mantener: la rama false del `Mensaje no vacio?` sigue saltando directo al merge.

#### Cambio 2 — Build script `scripts/build-bot-c-v2.js`

Patrón idéntico a `scripts/build-bot-c-v1-set1.js`:

- Lee `n8n/workflows/snapshots/bot-c-v1-PRE-BOT-CTX-2-2026-06-05.json` (snapshot del live actual)
- Aplica las mutaciones de Cambio 1
- Escribe `n8n/workflows/chatbot-momentum-bot-c-v2.json` (sobrescribe si existe — idempotente)
- Smoke tests al final: count nodos = original + 2, presencia de `Pre-registro Message` y `Reconciliar wamid`, conexiones bien armadas (path `Mensaje no vacio? → Pre-registro Message → Send Chunk via YCloud → Reconciliar wamid → Pausa entre Mensajes` existe end-to-end)

#### Cambio 3 — Edge function `ycloud-webhook/index.ts` (líneas 768-887)

Modificaciones puntuales al INSERT del backfill (línea 812-835):

```typescript
const insertRow: Record<string, unknown> = {
  agency_id: agencyCtx.agency_id,
  conversation_id: conv.id,
  lead_id: lead.id,
  channel: CHANNEL,
  direction: "outbound",
  // POST-BOT-CTX-2 (2026-06-05): el bot N8N ahora hace pre-registro ANTES de
  // llamar a YCloud. Si caemos a este backfill, significa que el outbound
  // NO fue del bot ni del CRM (ambos pre-registran). Origen probable: app
  // coexistencia (founder/agentes mandando desde WhatsApp Business app).
  sender_kind: "agent",          // antes: "bot" (no "human" — el enum
                                 // message_sender_kind no tiene "human";
                                 // valores válidos: lead|bot|agent|system)
  sender_user_id: null,          // no podemos identificar qué linked-device
  is_bot_generated: false,       // antes: true
  sent_via: "coexistence",       // marca explícita de origen
  kind: mapMessageKind(ycloudType),
  // ...resto igual
};
```

**Y agregar el doble SELECT con retry (D4)** antes del INSERT backfill:

```typescript
// 2. Lookup del mensaje existente por (agency_id, channel, external_id=wamid).
// POST-BOT-CTX-2: doble SELECT con retry 500ms para cerrar race contra
// pre-registro del bot N8N (el INSERT del bot puede no haber UPDATEado el
// external_id aún cuando llega el webhook).
async function lookupWithRetry() {
  const first = await sb.from("messages").select("...").eq(...).maybeSingle();
  if (first.data) return first;
  await new Promise(r => setTimeout(r, 300));
  return await sb.from("messages").select("...").eq(...).maybeSingle();
}
const { data: existing, error: selErr } = await lookupWithRetry();
```

#### Cambio 4 — Migration `0022_add_sent_via_to_messages.sql`

```sql
-- 0022_add_sent_via_to_messages.sql
-- BOT-CTX-2 (2026-06-05): tracker de origen del mensaje outbound.
-- Permite distinguir api (CRM o bot N8N con pre-registro) vs coexistence
-- (app de WhatsApp Business del founder/agentes via linked-device).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'messages'
      AND column_name = 'sent_via'
  ) THEN
    ALTER TABLE public.messages
      ADD COLUMN sent_via text;

    ALTER TABLE public.messages
      ADD CONSTRAINT messages_sent_via_check
      CHECK (sent_via IS NULL OR sent_via IN ('api', 'coexistence', 'template_broadcast'));

    COMMENT ON COLUMN public.messages.sent_via IS
      'BOT-CTX-2: Origen del mensaje outbound. NULL para inbound y rows pre-2026-06-05. '
      'api = pre-registrado por CRM o bot N8N. coexistence = backfill webhook (app WhatsApp Business linked). '
      'template_broadcast = reservado para futuro (outbound proactivo).';
  END IF;
END $$;

-- Index parcial para queries de auditoría futura (V2: dashboard "quién mandó qué")
CREATE INDEX IF NOT EXISTS messages_sent_via_coexistence_idx
  ON public.messages (agency_id, conversation_id, created_at)
  WHERE sent_via = 'coexistence';
```

Migration idempotente (re-corrible).

#### Cambio 5 — Registro del cambio

Crear `memory/n8n-changes/2026-06-05-bot-ctx-2-pre-register.md` siguiendo el formato del directorio existente (descripción del cambio, motivo, archivos tocados, rollback procedure, tag git).

---

## 3. Modelo de datos

Sin cambios estructurales mayores. Solo se agrega 1 columna nullable + 1 index parcial.

```
messages
├── ... (todas las existentes)
└── sent_via text NULL CHECK (sent_via IN ('api','coexistence','template_broadcast'))
   + index parcial sobre WHERE sent_via='coexistence'
```

UNIQUE existente `(agency_id, channel, external_id)` SIGUE siendo la clave de reconciliación. No se toca.

---

## 4. Flujo end-to-end (después del deploy)

### Caso A: Bot N8N responde

1. Webhook YCloud `inbound_message.received` → ycloud-webhook inserta inbound (sin cambios)
2. Workflow `bot-c v2` arranca → procesa hasta `Loop Over Items`
3. Por cada chunk:
   - `Pre-registro Message` INSERT `(status='queued', external_id=NULL, sender_kind='bot', sent_via='api')` → captura `id`
   - `Send Chunk via YCloud` POST → recibe `{wamid: "wamid.X"}`
   - `Reconciliar wamid` UPDATE `external_id=wamid, wa_message_id=wamid, status='sent'` donde `id = pre_register.id AND external_id IS NULL`
4. Webhook YCloud `message.updated` (1-3s después) → SELECT por `(agency_id, channel, external_id=wamid.X)` → **MATCH** → UPDATE status/timestamps. Cero backfill.

### Caso B: Founder envía desde la app coexistencia

1. (Nada se dispara desde N8N — el mensaje no entra por inbound)
2. Webhook YCloud `message.updated` llega con `wamid.Y, from=businessPhone, to=leadPhone`
3. SELECT por `external_id=wamid.Y` → no encuentra
4. Espera 500ms (D4 + MED-7), reintenta → sigue sin encontrar
5. Backfill outbound: INSERT con `sender_kind='agent', is_bot_generated=false, sent_via='coexistence', sender_user_id=NULL`
6. UI inbox muestra el mensaje correctamente atribuido (lado outbound, badge "humano - app").

### Caso C: Agente humano envía desde el CRM

Sin cambios. Sigue funcionando idéntico a hoy: `sendMessageViaYCloud` pre-registra → MATCH → UPDATE status. El `sent_via` queda NULL (V1 no se setea en server action; V2 setear a `'api'` para consistencia).

---

## 5. Trade-offs y alternativas descartadas

| Alternativa descartada | Por qué se descartó |
|------------------------|---------------------|
| **A. Detectar origen por contenido (heurística LLM)** | Falsos positivos altos. Founder puede escribir prosaico que parezca LLM, y el LLM puede dar respuestas cortas que parezcan humanas. Latencia agregada al webhook. |
| **B. Setear `recipient_id` único por sesión en el bot N8N para distinguir** | YCloud no permite custom headers en Send que vuelvan en el webhook. Único campo disponible para correlación es `wamid` (que ya usamos). |
| **C. Sentinel del bot (texto invisible al inicio de cada chunk)** | Chunks ya contienen markers `[IMG:CR-XXXX]` que el formateador preserva. Otro marker agregaría complejidad. Y el founder podría copy-pasteando incluir el sentinel sin querer. |
| **D. Pre-registro ÚNICO por turno (no por chunk)** | El UNIQUE `(agency_id, channel, external_id=wamid)` exige 1 row por `wamid`. Cada chunk genera un `wamid` distinto. Forzaría un row "padre" + N rows "hijos", que es lo que ya tenemos sin la complejidad. Rechazado. |
| **E. Lock optimista (versionar row antes de UPDATE en webhook)** | Sobrediseño para el race. La retry de 500ms cubre >99% de casos. Lock optimista agrega columna nueva (`version int`) y lógica de retry compleja en código que es path crítico. Rechazado. |
| **F. Migrar rows viejos (reclasificar via heurística)** | Ver D3. Volumen bajo, riesgo de mis-clasificación inversa, costo de validar no compensa. |

---

## 6. Costo estimado (mensual USD)

Sin cambios significativos. La migration es 1 columna + 1 index parcial: <1KB extra por row. Los 2 nodos N8N nuevos por chunk agregan ~2 queries Postgres por chunk:

| Usuarios | Mensajes outbound bot/mes | Queries Postgres extra/mes | Costo extra Supabase |
|---------:|--------------------------:|---------------------------:|---------------------:|
| 100      | 60k                       | 120k                       | ~$0 (free tier holds) |
| 1.000    | 600k                      | 1.2M                       | <$5 (Supabase Pro tier ya cubre) |
| 10.000   | 6M                        | 12M                        | ~$25 (Supabase Pro + compute add-on) |

Asumiendo 30 chunks promedio por sesión y 20 sesiones por usuario/mes. Los nodos N8N self-hosted no agregan costo marginal (Easypanel ya está paid).

---

## 7. Riesgos y mitigaciones

| # | Riesgo | Probabilidad | Impacto | Mitigación |
|---|--------|--------------|---------|------------|
| R1 | **Nodo Postgres pre-registro falla → bot envía sin row** | Baja | Medio (mensaje mal-clasificado como humano-coexistence al llegar webhook) | `onError: continueRegularOutput`. El webhook backfill cubre el caso. Trade-off documentado en D7. |
| R2 | **Race INSERT → webhook → UPDATE NULL → SELECT no matchea → backfill como humano** | Media (latencia variable Supabase) | Medio (mensaje del bot mal-clasificado como humano) | Doble SELECT con retry 500ms en webhook (D4). Latencia adicional aceptable solo en cold path (no afecta UX). |
| R3 | **Build script bot-c-v2 con bug → producción rota** | Baja | Alto (Pérez Luna queda sin bot) | Snapshot OBLIGATORIO + tag git + smoke tests en build script. Rollback <30s vía `git checkout <tag>` + n8n-push.mjs. |
| R4 | **Rows pre-deploy mal-clasificados quedan así** | Cierta (es D3) | Bajo (volumen <100, sin tráfico real) | Aceptado. Documentado. |
| R5 | **YCloud cambia formato del payload (`wamid` ubicación)** | Baja | Alto (backfill se vuelve permanente, todos los mensajes del bot quedan como humanos) | Smoke test post-deploy + alarma OBS-2 si % de mensajes coexistencia >5% (señal de payload roto). |
| R6 | **App coexistencia identifica agente individual (V2 deseado)** | N/A | N/A | Documentado: V1 todos como `sender_user_id=NULL, sent_via='coexistence'`. V2 explora linked-device API cuando YCloud la exponga. |
| R7 | **`Reconciliar wamid` falla → row queda `queued` perpetuo** | Baja | Bajo (1 row fantasma) | Cleanup V2: job que borra rows `(status='queued', external_id IS NULL, sender_kind='bot', created_at < NOW() - 1h)`. Por ahora bounded en volumen. |
| R8 | **Pérez Luna recibe respuesta de bot rota durante el deploy** | Baja-media | Alto (cliente real activo) | Deploy ventana: domingo madrugada (sin actividad esperada). Workflow v2 importado como **inactivo** primero. Switch (desactivar v1 + activar v2) en operación <30s. Rollback inmediato si bot v2 no responde. |

---

## 8. Plan de testing y rollout

### Pre-deploy

- [ ] T0a: Crear branch `feat/bot-ctx-2-coexistence-sync` desde `main` (cumple política GitHub).
- [ ] T0b: Snapshot del live: `node crm-v2/scripts/n8n-pull.mjs Jsh4krhC9HRUh7Ly` → genera `crm-v2/n8n/workflows/snapshots/bot-c-v1-PRE-BOT-CTX-2-2026-06-05.json` (verificar size y count de nodos vs el JSON actual: deben ser idénticos).
- [ ] T0c: Tag git: `git tag bot-c-v1-PRE-BOT-CTX-2-2026-06-05 && git push --tags`.
- [ ] T1: Aplicar migration 0022 a Supabase (vía MCP o `supabase db push`). Verificar columna + index.
- [ ] T2: Implementar `build-bot-c-v2.js` siguiendo patrón de `build-bot-c-v1-set1.js`. Correr → produce `chatbot-momentum-bot-c-v2.json`. Validar smoke tests (count nodos, presencia, conexiones).
- [ ] T3: Modificar `ycloud-webhook/index.ts` (Cambio 3). Deploy a Supabase: `supabase functions deploy ycloud-webhook`. Verificar version 1.2.0 en logs.
- [ ] T4: Commit + push de branch + abrir PR. Esperar Vercel preview.

### Smoke en preview (sin afectar producción)

- [ ] T5: Desde la app coexistencia del founder, escribir a un número de prueba (NO Pérez Luna). Verificar en DB que llega como `sender_kind='agent', sent_via='coexistence', is_bot_generated=false`.
- [ ] T6: Importar `chatbot-momentum-bot-c-v2.json` a N8N como **nuevo workflow INACTIVO** (manual desde N8N UI, ID nuevo). Tomar nota del nuevo workflow_id.
- [ ] T7: Simular tráfico al workflow v2 inactivo (manual trigger desde N8N o webhook test). Verificar:
  - Row pre-registrado aparece con `status='queued', external_id=NULL`.
  - Después de Send: row UPDATE a `status='sent', external_id=<wamid>`.
  - Webhook llega y matchea (no backfill).

### Cutover producción

- [ ] T8: Merge PR a `main`. Esperar Vercel production deploy verde.
- [ ] T9: Ventana de cutover (domingo madrugada CR):
  1. `n8n: deactivate workflow Jsh4krhC9HRUh7Ly` (v1)
  2. `n8n: activate workflow <new_id>` (v2)
  3. Esperar 30s
- [ ] T10: Smoke con Pérez Luna real (escribir mensaje al bot, verificar respuesta + verificar DB: row `sender_kind='bot', external_id=<wamid>` correcto).
- [ ] T11: Smoke con app coexistencia del founder a un número de prueba: verificar `sender_kind='agent', sent_via='coexistence'`.
- [ ] T12: Monitorear logs 5min: errores, % backfill (debería ser ~100% coexistencia o 0% si no se usa la app).
- [ ] T13: Si todo OK, archivar workflow v1 (no borrar). Documentar el switch en `memory/n8n-changes/`.

### Rollback (si T10 falla)

1. `n8n: deactivate <new_id>` + `n8n: activate Jsh4krhC9HRUh7Ly` (v1)
2. `git revert` del PR de webhook (mantener migration — es backward compatible: la columna nullable no rompe v1).
3. Documentar incidente.

### R-PRODUCCION-LIVE

Pérez Luna está en onboarding activo. Bot le contesta. Cutover en ventana de baja actividad. Smoke explícito con Pérez Luna en T10. Si cualquier anomalía en T10-T12, rollback inmediato.

---

## 9. Archivos a crear/modificar

| Path absoluto | Acción | Notas |
|---|---|---|
| `d:/Antigravity/0. Proyectos Personales/Inmobilioaria CRM/crm-v2/n8n/workflows/chatbot-momentum-bot-c-v2.json` | CREATE | Output del build script |
| `d:/Antigravity/0. Proyectos Personales/Inmobilioaria CRM/crm-v2/n8n/workflows/snapshots/bot-c-v1-PRE-BOT-CTX-2-2026-06-05.json` | CREATE | Snapshot pull live |
| `d:/Antigravity/0. Proyectos Personales/Inmobilioaria CRM/crm-v2/scripts/build-bot-c-v2.js` | CREATE | Patrón build-bot-c-v1-set1.js |
| `d:/Antigravity/0. Proyectos Personales/Inmobilioaria CRM/crm-v2/supabase/functions/ycloud-webhook/index.ts` | MODIFY | Líneas 729-735 (doble SELECT), 812-835 (backfill sender_kind), bump FN_VERSION a "1.2.0" |
| `d:/Antigravity/0. Proyectos Personales/Inmobilioaria CRM/crm-v2/supabase/migrations/0022_add_sent_via_to_messages.sql` | CREATE | Idempotente |
| `d:/Antigravity/0. Proyectos Personales/Inmobilioaria CRM/memory/n8n-changes/2026-06-05-bot-ctx-2-pre-register.md` | CREATE | Registro del cambio (formato del directorio) |

---

## 10. Hallazgos del audit que ajustan la spec inicial del founder

| # | Founder dijo | Auditoría reveló | Ajuste |
|---|--------------|------------------|--------|
| H1 | "Próxima migration sería 0024" | Última migration en repo es 0021. Próxima libre = **0022**. | Spec usa `0022_add_sent_via_to_messages.sql`. |
| H2 | "session_id formato `<phone>@<agency_id>`" | El bot LIVE usa `Telefono + "@" + whatsappInboundMessage.to` donde `.to` es el **businessPhone** (línea 1608 del workflow), NO agency_id. | **Crítico para BOT-CTX-1.** Reportar al founder. La spec BOT-CTX-1 lo corrige. |
| H3 | "El bot envía mensaje directo, sin row previo" | Confirmado. El workflow tiene `Send Chunk via YCloud` (HTTP directo) + `Log Out of Office en Messages` para OOH (que sí registra con `sender_kind='system'`). Solo OOH pre-registra hoy. | Spec replica el patrón OOH pero para los chunks normales del bot. |
| H4 | "Webhook handler usa SELECT por `wa_message_id`" | El SELECT real es por `(agency_id, channel, external_id=wamid)` — usa `external_id`, no `wa_message_id`. El UNIQUE también es sobre `external_id`. | El pre-registro debe setear `external_id`, no `wa_message_id`. Ambos se setean igual al wamid en la spec (replica del patrón `sendMessageViaYCloud` línea 407). |
| H5 | "Pérez Luna no procesa leads aún" | Confirmado por CLAUDE.md y session-handoffs. | R-PRODUCCION-LIVE aplica pero ventana de riesgo bajo. |
| H6 | "`sender_kind='bot'` siempre para chunks del bot" | El precedente OOH usa `'system'`. | Spec mantiene `'bot'` para Sofia (chunks del LLM) y deja `'system'` solo para OOH. Decisión D2 documenta. |

---

## 11. Próximos pasos sugeridos (no hacer aún)

- BOT-CTX-1 (mirror history) — debe esperar a que BOT-CTX-2 esté deployado y verde.
- V2 de BOT-CTX-2: identificar agente individual desde linked-device (cuando YCloud lo soporte).
- Cleanup job para rows fantasma `(status='queued', external_id IS NULL, sender_kind='bot', created_at < NOW() - 1h)`.
- Setear `sent_via='api'` también en `sendMessageViaYCloud` (server action CRM) para consistencia analítica.
