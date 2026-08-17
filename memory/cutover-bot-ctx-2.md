# Plan de Cutover Atómico BOT-CTX-2 — 2026-06-05

**Branch:** `feat/bot-ctx-2-coexistence-sync`
**Tag de rollback:** `bot-c-v1-pre-bot-ctx-2-2026-06-05` (en GitHub)
**Snapshot v1:** `crm-v2/n8n/workflows/snapshots/bot-c-v1-PRE-BOT-CTX-2-2026-06-05.json`
**Tiempo total estimado:** ~20-30 min (15 min trabajo + 10-15 min observación post-cutover)

---

## Filosofía del cutover

**Cero ventana donde Pérez Luna queda sin bot.** El orden minimiza riesgo:

- Trabajo INACTIVO primero (cero impacto)
- Cutover con el v2 ACTIVO antes de tocar el v1
- Deploy de edge function DESPUÉS (no es bloqueante para el bot)

Si algo falla en cualquier paso, **rollback < 60s**. Verificado en el snapshot + tag git.

---

## Pre-condiciones a verificar

Antes de empezar, confirmar:

- [ ] **Branch local actualizada:** `git status` muestra working tree limpia en `feat/bot-ctx-2-coexistence-sync`
- [ ] **PR abierto en GitHub** con todo el código del fix (te lo dejo hecho cuando te avise)
- [ ] **Pérez Luna NO en conversación activa con el bot en este momento** (si hay mensajes de la última hora, esperar 10 min de silencio antes del cutover)
- [ ] **Tenés N8N abierto en Dashboard** (https://n8n-n8n.v5qn6d.easypanel.host)
- [ ] **Tenés YCloud abierto en Dashboard** (login app.ycloud.com)
- [ ] **Tenés Supabase abierto en Dashboard** (proyecto fahujscodhqlopycorzn)

---

## Fase 1 — Pre-cutover (sin riesgo, sin ventana)

### T1. Aplicar Migration 0022 (~2 min)

**Acción:** Supabase Dashboard → SQL Editor → New query → pegar el contenido de `crm-v2/supabase/migrations/0022_messages_sent_via.sql` → Run.

**Verificación de éxito:**
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='messages' AND column_name='sent_via';
```
Debe devolver: `sent_via | text | YES`.

```sql
SELECT conname FROM pg_constraint WHERE conname = 'messages_sent_via_check';
```
Debe devolver: 1 row.

**Por qué es seguro:** la columna es nullable, sin DEFAULT. ALTER TABLE es instant (no rewrites). Cero impacto al bot v1.

**Si falla:** investigamos antes de seguir. Sin rollback necesario (cero cambios efectivos).

---

### T2. Importar Workflow v2 a N8N (~3 min)

**Acción:** N8N UI → Workflows → "Import from File" → seleccionar `crm-v2/n8n/workflows/chatbot-momentum-bot-c-v2.json`.

**Verificación de éxito:**
- N8N muestra el workflow nuevo con name "Chatbot Momentum - bot-c v2 (BOT-CTX-2)"
- Toggle de activación: **OFF** (active=false ya viene en el JSON)
- Anotá el `workflow_id` nuevo (te lo da N8N cuando lo importás — algo tipo `aBcDeFg123456`)
- El bot v1 (`Jsh4krhC9HRUh7Ly`) sigue ACTIVO sin cambios

**Por qué es seguro:** el v2 está inactivo. No procesa nada. El v1 sigue atendiendo a Pérez Luna normalmente.

**Si falla la importación:** descartar el JSON, investigar error, sin impacto.

---

### T3. Smoke test del Workflow v2 (inactivo) (~5 min)

**Acción:** En el workflow v2 (todavía inactivo), N8N UI → "Execute workflow" con payload de prueba simulado.

Necesitás un payload de inbound que el founder me pasa o usamos uno de los logs reales — vamos a coordinarlo cuando hagas T3. Lo importante: el nodo `Pre-registro Message` debe ejecutar OK + el nodo `Reconciliar wamid` debe verse skip-eable (porque no hay POST real a YCloud en el test inactivo).

**Verificación de éxito en DB:**
```sql
SELECT id, sender_kind, sent_via, status, external_id, created_at
FROM messages
WHERE sent_via = 'api_n8n'
ORDER BY created_at DESC LIMIT 1;
```
Debe aparecer 1 row test con `sender_kind='bot', sent_via='api_n8n', status='queued', external_id=NULL`.

**Limpieza después del test:**
```sql
DELETE FROM messages WHERE sent_via = 'api_n8n' AND status = 'queued';
```

**Si falla:** investigamos el error del nodo (probablemente bindings de variables). Rollback NO necesario (v2 sigue inactivo).

---

## Fase 2 — Cutover atómico (~5 min, ventana de transición)

### Filosofía de esta fase

El orden es: **activar v2 ANTES de desactivar v1**. Resultado: durante ~30 segundos, ambos están activos pero solo uno recibe tráfico (el v2, después que YCloud redirige).

### T4a. Activar Workflow v2 en N8N (~10 seg)

**Acción:** N8N UI → workflow v2 → toggle "Active" a ON.

**Verificación de éxito:** toggle muestra "Active". Logs de N8N no muestran error.

**Estado del sistema:** ambos v1 y v2 están ACTIVOS, pero solo el v1 está recibiendo tráfico (YCloud apunta al path viejo `ycloud-inmobiliaria-demo`).

---

### T4b. Cambiar URL del Webhook en YCloud (~2 min)

**Acción:** YCloud Dashboard → Webhooks → encontrar el webhook que apunta a `https://n8n-n8n.v5qn6d.easypanel.host/webhook/ycloud-inmobiliaria-demo` → editar → cambiar el sufijo final de `/ycloud-inmobiliaria-demo` a `/ycloud-inmobiliaria-demo-v2`.

**Verificación de éxito:** YCloud guardó la URL nueva. NO necesitás test todavía (sigue siendo cutover en progreso).

**Estado del sistema:** YCloud ahora manda eventos al path `-v2` (=workflow v2). El v1 sigue activo pero ya no recibe nada.

**Si falla:** revert la URL a la original. Sin impacto al bot (v1 sigue atendiendo).

---

### T4c. Verificar tráfico llega al v2 (~1-2 min)

**Acción:** Desde tu número personal, mandá un mensaje cualquier al WhatsApp del bot (+50689839490).

**Verificación de éxito:**
- N8N v2 muestra ejecución reciente en "Executions"
- DB:
  ```sql
  SELECT id, sender_kind, sent_via, status, external_id, created_at
  FROM messages
  WHERE conversation_id IN (SELECT id FROM conversations WHERE lead_id IN (
    SELECT id FROM leads WHERE wa_user_id = '50688217229' LIMIT 1
  ))
  ORDER BY created_at DESC LIMIT 3;
  ```
  - Inbound del lead aparece (direction=inbound, sender_kind=lead)
  - Outbound del bot aparece con `sender_kind='bot', sent_via='api_n8n', external_id=<wamid>` ← este es el PUNTO CLAVE: confirma que el pre-registro funciona
- WhatsApp tuyo recibe la respuesta del bot

**Si falla cualquier verificación:** ROLLBACK INMEDIATO (ver Fase de Rollback abajo). Esto es la ventana donde no podemos esperar.

---

### T4d. Desactivar Workflow v1 en N8N (~10 seg)

**Acción:** N8N UI → workflow v1 (`Jsh4krhC9HRUh7Ly`) → toggle "Active" a OFF.

**Verificación de éxito:** toggle muestra "Inactive".

**Estado del sistema:** solo v2 está activo. Cutover de workflow COMPLETO.

---

## Fase 3 — Deploy edge function v1.2.0 (~5 min)

**IMPORTANTE:** este paso es DESPUÉS del cutover de workflow. Si hacés esto antes, mensajes del bot v1 se marcarían mal. Como el v1 ya está apagado, podemos deployar tranquilos.

### T5. Deploy edge function (~3 min)

**Acción:** Supabase Dashboard → Edge Functions → `ycloud-webhook` → Deploy → pegar el contenido actualizado de `crm-v2/supabase/functions/ycloud-webhook/index.ts`.

**Verificación de éxito:**
```bash
curl https://fahujscodhqlopycorzn.supabase.co/functions/v1/ycloud-webhook
```
Debe devolver `{"status":"ok","function":"ycloud-webhook","version":"1.2.0","secret_configured":true}`.

---

### T6. Smoke test coexistencia (~3 min)

**Acción:** Abrí WhatsApp Business en tu iPhone (la app conectada al número del bot por coexistencia). Mandá un mensaje desde la app a tu número personal (o a cualquier conversación del CRM).

**Verificación de éxito:**
```sql
SELECT id, sender_kind, sent_via, sender_user_id, is_bot_generated, body, created_at
FROM messages
WHERE direction = 'outbound'
ORDER BY created_at DESC LIMIT 1;
```
Debe devolver:
- `sender_kind = 'agent'` ✅ (NO 'bot')
- `sent_via = 'coexistence'` ✅
- `sender_user_id = NULL` ✅
- `is_bot_generated = false` ✅
- `body = "<el texto que mandaste>"`

**Si falla:** ver troubleshooting abajo.

---

## Fase 4 — Cierre

### T7. Merge PR

Una vez todo verificado en producción, hacés el comentario "todo OK" y yo:
1. Mergeo PR a `main` (Vercel auto-deploya, pero sin impacto porque Vercel no toca edge functions ni N8N)
2. Tagueo en git el estado post-cutover
3. Actualizo memory/ (decisions, handoff, etc.)

---

## Rollback procedure (probado mentalmente)

Si en CUALQUIER momento entre T4a y T6 algo se rompe, ejecutar EN ORDEN:

### Rollback de cutover (workflow)

1. **YCloud Dashboard:** revertir URL del webhook → path original `ycloud-inmobiliaria-demo`
2. **N8N UI:** activar v1 (`Jsh4krhC9HRUh7Ly`) → toggle Active ON
3. **N8N UI:** desactivar v2 → toggle Active OFF

**Tiempo:** ~30-60 segundos. Estado del sistema: idéntico al pre-cutover.

### Rollback de edge function (si T5 ya se hizo)

Solo necesario si T5 se hizo Y se está rolleando back todo:

```bash
# En tu máquina:
cd "d:/Antigravity/0. Proyectos Personales/Inmobilioaria CRM/crm-v2"
git checkout bot-c-v1-pre-bot-ctx-2-2026-06-05 -- supabase/functions/ycloud-webhook/index.ts
```

Después: Supabase Dashboard → Edge Functions → ycloud-webhook → Deploy con el código revertido.

**Tiempo:** ~3 min.

### Rollback de migration

**NO necesario.** La migration es backward compatible. La columna `sent_via` queda en la tabla pero queda NULL para todos los rows nuevos. Cero impacto.

---

## Pre-mortem (qué puede salir mal)

### Escenario 1: La migration falla en T1

**Probabilidad:** Baja
**Impacto:** Bajo (no procedemos al resto)
**Causa probable:** error de sintaxis SQL, columna ya existe (idempotente — no debería pasar), permisos
**Mitigación:** ejecutar y verificar en SQL Editor antes de continuar

### Escenario 2: El v2 no responde correctamente al smoke en T4c

**Probabilidad:** Media (es la primera ejecución real)
**Impacto:** Alto si Pérez Luna escribe en esa ventana
**Causa probable:** binding mal en Pre-registro (lead_id, conversation_id), credencial Postgres rota
**Mitigación:** rollback inmediato (T4a inverso). Investigamos con logs de N8N

### Escenario 3: El v2 responde pero el `sender_kind` viene mal

**Probabilidad:** Baja (lo verificamos en code-review)
**Impacto:** Alto (mensajes mal clasificados)
**Causa probable:** enum constraint, typo en build script
**Mitigación:** rollback. Fix. Re-deploy.

### Escenario 4: YCloud no permite cambiar la URL del webhook

**Probabilidad:** Muy baja
**Impacto:** Bloqueante para el cutover
**Causa probable:** permisos en YCloud, plan limit
**Mitigación:** revisar permisos. Como alternativa: NO usar path -v2 (revert al build script), aceptar el riesgo de colisión (los workflows no pueden activarse simultáneamente al mismo path en N8N — falla el segundo)

### Escenario 5: Pérez Luna escribe DURANTE el cutover (T4a-T4d, ~2-3 min)

**Probabilidad:** Baja (Pérez Luna en onboarding, no mucho tráfico)
**Impacto:** Bajo (el mensaje se procesa correctamente)
**Mitigación:** el orden de cutover (activar v2 antes de desactivar v1) garantiza que SIEMPRE haya un workflow activo. El mensaje termina yendo al v2 (que ya está activo). Procesa OK con edge fn v1.1.1 (path normal del SELECT matchea).

### Escenario 6: La edge function v1.2.0 tiene un bug que rompe inbound

**Probabilidad:** Muy baja (typecheck pasó, code-review 2 pasadas)
**Impacto:** Alto (bot no recibe mensajes)
**Mitigación:** rollback de edge function al commit anterior (3 min)

---

## Stats del cambio

- **Archivos nuevos:** 5
  - `supabase/migrations/0022_messages_sent_via.sql`
  - `scripts/build-bot-c-v2-pre-register.js`
  - `n8n/workflows/chatbot-momentum-bot-c-v2.json` (output del build)
  - `n8n/workflows/snapshots/bot-c-v1-PRE-BOT-CTX-2-2026-06-05.json` (snapshot)
  - `memory/n8n-changes/2026-06-05-bot-ctx-2-pre-register.md` (memory doc)
- **Archivos modificados:** 1
  - `supabase/functions/ycloud-webhook/index.ts` (v1.1.1 → v1.2.0, +68 líneas)
- **Nodos N8N nuevos:** 3 (Pre-registro Message + Reconciliar wamid + Sticky)
- **Latencia adicional por chunk del bot:** ~100-200ms (pre-registro + reconcile)
