# BOT-CTX-2 — Pre-registro N8N + reclasificación de backfill como coexistencia

**Fecha:** 2026-06-05
**Autor:** backend-builder (implementación) sobre spec del arquitecto
**Branch:** `feat/bot-ctx-2-coexistence-sync`
**Estado:** Implementación cerrada — **NO activada en producción** todavía
**Spec completa:** `memory/spec-bot-ctx-2-coexistence-sync.md`

---

## 0. Resumen ejecutivo

Cierra el bug de mis-clasificación de mensajes outbound en presencia de WhatsApp Business "coexistencia" (mismo número usado simultáneamente por el bot N8N vía API y por el founder/agentes desde la app de WhatsApp Business linked-device).

**Antes (bot-c v1, live):**
- El bot N8N hace POST directo a YCloud sin pre-registrar row → webhook `whatsapp.message.updated` no encuentra match → backfill INSERT hardcodeado `sender_kind='bot', is_bot_generated=true`. Cuando el founder responde desde la app, el mismo camino se ejecuta → queda **mal clasificado como `'bot'`**.

**Después (bot-c v2 + edge function 1.2.0):**
1. El bot N8N **pre-registra** un row de `messages` antes de cada llamada a YCloud Send (status='queued', external_id=NULL, sender_kind='bot', sent_via='api_n8n').
2. Tras el POST exitoso, **reconcilia** el row con el wamid devuelto (UPDATE external_id, wa_message_id, status='sent', sent_at).
3. El webhook `whatsapp.message.updated`, cuando no encuentra match, hace **SELECT con 1 retry de 500ms** (cubre la race con el UPDATE de N8N en vuelo). Si tras la retry sigue sin match, hace backfill como `sender_kind='agent', is_bot_generated=false, sent_via='coexistence', sender_user_id=NULL`.

> **Nota:** `'agent'` (no `'human'`) porque el enum `message_sender_kind` es `lead|bot|agent|system`. La distinción CRM-agent vs app-coexistence-agent se hace por `sent_via`. Fix CRIT-1 del code-review independiente 2026-06-05.

Resultado: el bot queda correctamente clasificado como bot; el outbound desde app coexistencia queda correctamente clasificado como humano-coexistencia.

---

## 1. Workflow afectado

- **NUEVO archivo (no toca v1):** `crm-v2/n8n/workflows/chatbot-momentum-bot-c-v2.json`
- **Workflow v1 LIVE (intocado):** `chatbot-momentum-bot-c-v1.json` (id N8N: `Jsh4krhC9HRUh7Ly`)
- **Cutover:** desactivar v1 + activar v2 manualmente desde N8N UI (ventana de baja actividad). El v2 se importa con `active=false` por seguridad.

---

## 2. Snapshot de origen

- **Path:** `crm-v2/n8n/workflows/snapshots/bot-c-v1-PRE-BOT-CTX-2-2026-06-05.json`
- **Nodos:** 87
- **active:** true (estado live)
- **Pulled de:** N8N workflow id `Jsh4krhC9HRUh7Ly` (live producción)

### Tag git de rollback

```
bot-c-v1-pre-bot-ctx-2-2026-06-05
```

Apunta al commit donde el repo coincide bit-a-bit con el live v1 (snapshot committed).

---

## 3. Cambios exactos al workflow (build script aplica determinísticamente)

### Script

`crm-v2/scripts/build-bot-c-v2-pre-register.js`

- Input: snapshot del live
- Output: `crm-v2/n8n/workflows/chatbot-momentum-bot-c-v2.json`
- Idempotente: re-correr produce md5 idéntico (borra los 3 nodos nuevos antes de re-crearlos)
- Smoke tests integrados: 8 chequeos sobre count de nodos, presencia, conexiones del loop preservadas (R-CONEXIONES-LOOP del spec)

### Hallazgo de inspección que afina la spec literal

La spec original decía "intercalar `Pre-registro Message` entre `Mensaje no vacio?` y `Send Chunk via YCloud`". Inspección del snapshot reveló que entre esos dos nodos hay un IF intermedio `¿Eval Synthetic?` (guard del eval-harness). La cadena real del live es:

```
Mensaje no vacio? (rama 0=true) → ¿Eval Synthetic?
¿Eval Synthetic? (rama 0=true=synthetic) → Pausa entre Mensajes (skip Send)
¿Eval Synthetic? (rama 1=false=mensaje real) → Send Chunk via YCloud
Send Chunk via YCloud → Pausa entre Mensajes
```

El pre-registro debe ocurrir EXACTAMENTE cuando vamos a llamar a YCloud (no antes), por lo que se intercala entre `¿Eval Synthetic?` rama 1 (false) y `Send Chunk via YCloud`. Los synthetic del eval-harness NO se pre-registran (no se envían a YCloud).

### Cadena post-cambio

```
¿Eval Synthetic? (rama 0=true=synthetic) → Pausa entre Mensajes (sin cambios)
¿Eval Synthetic? (rama 1=false=real)     → Pre-registro Message
                                          → Send Chunk via YCloud
                                          → Reconciliar wamid
                                          → Pausa entre Mensajes
```

### Nodos agregados (3)

| Nombre | Tipo | Función |
|---|---|---|
| `Pre-registro Message` | `n8n-nodes-base.postgres` (2.6) | INSERT INTO public.messages (...) VALUES (..., status='queued', external_id=NULL, sender_kind='bot', is_bot_generated=true, sent_via='api_n8n') RETURNING id. Usa credential `CRM System` (id `pMsxqUvr0wDZsjIt`). `alwaysOutputData=true`, `onError=continueRegularOutput` (D7: fail-open). |
| `Reconciliar wamid` | `n8n-nodes-base.postgres` (2.6) | UPDATE public.messages SET external_id=$wamid, wa_message_id=$wamid, status='sent', sent_at=NOW() WHERE id=$pre_register_id AND external_id IS NULL RETURNING id. `onError=continueRegularOutput` (D8: si falla, el webhook backfill cubre). |
| `Sticky - BOT-CTX-2 Pre-registro` | `n8n-nodes-base.stickyNote` (1) | Documentación visual del cambio en el canvas. |

### Conexiones modificadas

| Acción | Origen | Destino |
|---|---|---|
| ELIMINAR | `¿Eval Synthetic?` rama 1 (false) | `Send Chunk via YCloud` |
| AGREGAR | `¿Eval Synthetic?` rama 1 (false) | `Pre-registro Message` |
| AGREGAR | `Pre-registro Message` | `Send Chunk via YCloud` |
| ELIMINAR | `Send Chunk via YCloud` | `Pausa entre Mensajes` |
| AGREGAR | `Send Chunk via YCloud` | `Reconciliar wamid` |
| AGREGAR | `Reconciliar wamid` | `Pausa entre Mensajes` |

### Stats del workflow generado

- Nodos: 87 → **90** (+3)
- `active`: **false** (importa inactivo a propósito)
- `name`: `Chatbot Momentum - bot-c v2 (BOT-CTX-2)`
- Webhook path: `ycloud-inmobiliaria-demo-v2` (sufijado para evitar colisión con v1 durante cutover — fix CRIT-2/MED-6 del code-review)
- `wf.id`, `wf.versionId`, `wf.meta`, `webhookId` interno BORRADOS — el v2 se importa como workflow nuevo (defensa contra footgun de `n8n-push.mjs Jsh4krhC9HRUh7Ly v2.json` que sobreescribiría el v1 LIVE)

---

## 4. Cambios fuera del workflow

### 4.1 Migration 0022

`crm-v2/supabase/migrations/0022_messages_sent_via.sql`

- ADD COLUMN `sent_via text NULL`
- CHECK `sent_via IS NULL OR sent_via IN ('api_crm','api_n8n','coexistence')`
- Index parcial `messages_sent_via_coexistence_idx ON (agency_id, conversation_id, created_at) WHERE sent_via = 'coexistence'`
- Backward compatible: NULL para inbound y rows pre-deploy. No rompe v1.
- Idempotente.

### 4.2 Edge function `ycloud-webhook` → 1.2.0

`crm-v2/supabase/functions/ycloud-webhook/index.ts`

Tres cambios puntuales:

1. **`FN_VERSION = "1.2.0"`** (de 1.1.1).
2. **SELECT con 1 retry 500ms** en `handleMessageUpdated` (cierra race contra el UPDATE wamid del workflow N8N en vuelo). Solo se ejecuta el sleep cuando el primer SELECT da NULL — path normal sin penalidad de latencia. 500ms (subido de 300ms tras MED-7 del code-review) cubre p99 del UPDATE bajo presión de DB.
3. **Backfill outbound reclasificado:** cuando el mensaje no existe tras el retry, el INSERT ya NO usa `sender_kind='bot', is_bot_generated=true`. Ahora:
   - `sender_kind='agent'` (valor válido del enum `message_sender_kind`; 'human' NO existe en el enum — fix CRIT-1)
   - `sender_user_id=null` (D6: YCloud no expone linked-device en V1)
   - `is_bot_generated=false`
   - `sent_via='coexistence'`

---

## 5. Archivos tocados (lista final)

| Path absoluto | Acción |
|---|---|
| `d:/Antigravity/0. Proyectos Personales/Inmobilioaria CRM/crm-v2/scripts/build-bot-c-v2-pre-register.js` | CREATE |
| `d:/Antigravity/0. Proyectos Personales/Inmobilioaria CRM/crm-v2/n8n/workflows/chatbot-momentum-bot-c-v2.json` | CREATE (vía build script) |
| `d:/Antigravity/0. Proyectos Personales/Inmobilioaria CRM/crm-v2/supabase/migrations/0022_messages_sent_via.sql` | CREATE |
| `d:/Antigravity/0. Proyectos Personales/Inmobilioaria CRM/crm-v2/supabase/functions/ycloud-webhook/index.ts` | MODIFY |
| `d:/Antigravity/0. Proyectos Personales/Inmobilioaria CRM/memory/n8n-changes/2026-06-05-bot-ctx-2-pre-register.md` | CREATE (este doc) |

El snapshot `bot-c-v1-PRE-BOT-CTX-2-2026-06-05.json` y el tag git `bot-c-v1-pre-bot-ctx-2-2026-06-05` ya estaban committeados antes de esta sesión.

---

## 6. Orden de deploy (CUTOVER ATÓMICO)

**El plan original era secuencial (migration → edge → import → cutover). Eso tiene un bug:** entre el deploy del edge function v1.2.0 y la activación del v2, los mensajes del bot v1 (que NO pre-registra) caen al backfill como `sender_kind='agent'` (mis-clasificados). Por eso reordenamos.

**El plan completo y operativo paso-a-paso vive en:** `memory/cutover-bot-ctx-2.md`

Resumen del orden correcto:

### Fase 1 — Sin riesgo
1. Aplicar **Migration 0022** (aditiva, instant ALTER, sin impacto al bot)
2. **Importar workflow v2** a N8N como **inactivo** (cero impacto)
3. **Smoke v2 inactivo** (manual trigger en N8N UI)

### Fase 2 — Cutover atómico (ventana ~5 min)
4. **Activar workflow v2** en N8N
5. **Actualizar URL del webhook en YCloud Dashboard** → cambiar sufijo a `-v2` (PASO CRÍTICO fix CRIT-3 del code-review — sin esto el bot queda dormido en producción)
6. **Verificar tráfico llega al v2** (enviar mensaje desde tu personal al bot, confirmar en DB row con `sent_via='api_n8n'`)
7. **Desactivar workflow v1** en N8N

### Fase 3 — Deploy edge function (post-cutover)
8. **Deploy edge function v1.2.0** (ahora sí, sin riesgo de mis-clasificación porque v1 está apagado)
9. **Smoke coexistencia** desde la app de WhatsApp Business: verificar `sender_kind='agent', sent_via='coexistence'`

### Fase 4 — Cierre
10. Mergear PR a `main`. Tag git post-cutover.

**Por qué este orden:**
- Activar v2 ANTES de tocar URL evita ventana de "ningún workflow procesa"
- Actualizar URL ANTES de desactivar v1 evita ventana de "v1 inactivo, YCloud todavía apunta al path viejo"
- Deploy edge function DESPUÉS evita ventana de mis-clasificación durante el cutover

**Si en cualquier fase 2 algo falla:** ver §7 Rollback. Tiempo: <60s.

---

## 7. Procedimiento de rollback (cutover fallido)

**Si tras T8 algo está raro (bot no responde, mensajes mal clasificados, errores cascada):**

1. **En N8N:** desactivar workflow v2 (nuevo id) + activar workflow v1 (`Jsh4krhC9HRUh7Ly`). Tiempo: <30s, sin re-deploy.
2. (Opcional, si los errores son por el edge function) **Revertir edge function:**
   ```bash
   git checkout bot-c-v1-pre-bot-ctx-2-2026-06-05 -- crm-v2/supabase/functions/ycloud-webhook/index.ts
   cd crm-v2 && supabase functions deploy ycloud-webhook
   ```
   La migration 0022 NO necesita rollback: es backward compatible (columna nullable, CHECK permite NULL, no rompe v1).
3. (Opcional, si el archivo del workflow v1 en repo se modificó por error) restaurarlo del tag:
   ```bash
   git checkout bot-c-v1-pre-bot-ctx-2-2026-06-05 -- crm-v2/n8n/workflows/chatbot-momentum-bot-c-v1.json
   ```

**Garantía de coherencia:** el `messages.sent_via` queda como columna nullable sin rows nuevos con valores no nulos (porque v1 nunca lo seteó). Cero data corruption.

---

## 8. Validaciones corridas en esta sesión

| Validación | Resultado |
|---|---|
| `node --check crm-v2/scripts/build-bot-c-v2-pre-register.js` | exit 0 |
| Build script run #1 | exit 0, 87→90 nodos, smoke PASS |
| Build script run #2 (idempotencia) | md5 idéntico (`2635041fe009d1333d71d57b29c2cbd9`) |
| Smoke tests (8 chequeos en el script) | PASS |
| `npx tsc --noEmit ... supabase/functions/ycloud-webhook/index.ts` | sin errores estructurales (solo runtime Deno-globals esperados) |

---

## 9. Lo que esta sesión NO modificó

- El workflow v1 live (`chatbot-momentum-bot-c-v1.json`): intocado.
- El server action `sendMessageViaYCloud` (`crm-v2/app/.../inbox/actions.ts`): según spec, su flujo ya funciona OK (pre-registra + UPDATE wamid). V2 podría setearle `sent_via='api_crm'` para consistencia, pero no es bloqueante en V1 — los rows del CRM agente quedan con `sent_via=NULL`, semántica intacta.
- Activación del workflow v2: queda en `active=false`. El founder activa manualmente en la ventana de cutover.
- Commit + push: queda para el founder tras revisar este reporte.

---

## 10. Referencias

- Spec arquitecto: `memory/spec-bot-ctx-2-coexistence-sync.md`
- Skill versionado N8N: `.agent/skills/n8n-workflow-versioning/`
- Skill build script N8N: `.agent/skills/n8n-workflow-build-script/`
- Decisión D1-D9 con justificaciones: §2.2 del spec
- Riesgos R1-R8 con mitigaciones: §7 del spec
