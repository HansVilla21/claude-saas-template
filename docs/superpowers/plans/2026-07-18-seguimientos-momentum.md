# Seguimientos automáticos Momentum — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un workflow n8n independiente que, cada 15 min, detecta conversaciones de la agency Momentum donde el bot habló último y el lead no respondió, y manda hasta 3 follow-ups personalizados por IA dentro de la ventana de 24h de WhatsApp, guardando cada uno como audit.

**Architecture:** Cron n8n stateless que escanea `conversations` vía una query SQL de elegibilidad (toda la lógica de cadencia/ventana/silencio nocturno/streak vive en el SQL). Por cada conversación elegible: trae el historial → LLM redacta el follow-up → envía por YCloud (mismo endpoint que el bot) → inserta fila en `followups`. La persistencia en `messages` la hace el webhook `ycloud-webhook` ya existente (no auto-insertamos → cero riesgo de duplicado). El guard anti-doble-envío es la tabla `followups`.

**Tech Stack:** n8n (Schedule Trigger, Postgres node, LangChain LLM node, HTTP Request), Supabase Postgres, YCloud WhatsApp API, build-script JS reproducible (convención del repo, skill `n8n-workflow-build-script`).

**Spec:** `docs/superpowers/specs/2026-07-18-seguimientos-momentum-design.md`

## Constantes (verificadas contra la DB viva 2026-07-18)

| Cosa | Valor |
|---|---|
| Agency Momentum | `dc000e2f-2cde-4c28-8d06-ebf70ae3411d` |
| `from` (business phone) | `50689839490` (de `agency_channels`, `provider='ycloud'`, `is_active=true`) |
| `to` (lead) | `leads.whatsapp_phone` (formato `50683984732`, sin `+`) |
| Credencial Postgres n8n | **CRM System** — id `pMsxqUvr0wDZsjIt` (tipo `postgres`) |
| Credencial YCloud n8n | **Momentum AI** — id `jfwQ9Rp74VHhXDsH` (tipo `httpHeaderAuth`) |
| Credencial LLM n8n | reusar la del bot (**OpenAI - General**, tipo `openAiApi`). Ver Task 5 (decisión modelo). |
| Endpoint YCloud | `POST https://api.ycloud.com/v2/whatsapp/messages` |
| Cadencia (por paso, desde el ancla) | `[4h, 8h, 6h]` · máximo **3** |
| Silencio nocturno | enviar solo si hora `America/Costa_Rica` ∈ [7, 20] (silencio 21:00–06:59) |
| Ventana WhatsApp | `now() < last_inbound_at + 24h` |
| Enums | `conversation_handler`: bot/human/unassigned · `conversation_handoff_status`: none/pending/handled · `followup_status`: scheduled/sent/cancelled/failed |

## Estructura de archivos

- Crear: `crm-v2/scripts/build-seguimientos-momentum-v1.js` — build script reproducible que autora el JSON del workflow.
- Crear: `crm-v2/n8n/workflows/seguimientos-momentum-v1.json` — output del build script (workflow n8n, `active:false`).
- Crear: `crm-v2/memory/n8n-changes/2026-07-18-seguimientos-momentum-v1.md` — bitácora del cambio.
- Modificar: `crm-v2/n8n/workflow-ids.json` — agregar el id del workflow nuevo tras crearlo en n8n.
- Modificar: `crm-v2/memory/backlog.md` — mover Seguimientos de post-MVP a Hecho al cerrar.

## Nodos del workflow (mapa de responsabilidades)

1. `Cron 15min` — `n8n-nodes-base.scheduleTrigger` (cada 15 min).
2. `Conversaciones elegibles` — `n8n-nodes-base.postgres` (query de elegibilidad; Task 1).
3. `Loop` — `n8n-nodes-base.splitInBatches` (batchSize 1, pacing).
4. `Historial de la conversación` — `n8n-nodes-base.postgres` (query de contexto; Task 2).
5. `Armar prompt` — `n8n-nodes-base.code` (ensambla historial + paso + datos del lead).
6. `Redactar follow-up (LLM)` — `@n8n/n8n-nodes-langchain.chainLlm` + sub-nodo `lmChatOpenAi` (Task 5).
7. `Enviar por YCloud` — `n8n-nodes-base.httpRequest` (Task 6).
8. `Registrar en followups` — `n8n-nodes-base.postgres` (INSERT audit; Task 7).
9. `Pausa` — `n8n-nodes-base.wait` (opcional, entre items).

---

## Task 1: Query de elegibilidad (el cerebro) — validar contra la DB viva

**Files:**
- Test (scratchpad SQL, no se commitea): correr vía MCP `execute_sql` contra la DB.

- [ ] **Step 1: Correr la query de elegibilidad contra la DB viva**

Ejecutar tal cual (vía Supabase MCP `execute_sql`):

```sql
WITH streak AS (
  SELECT f.conversation_id, COUNT(*) AS sent_count, MAX(f.sent_at) AS last_fu_at
  FROM public.followups f
  JOIN public.conversations c2 ON c2.id = f.conversation_id
  WHERE f.agency_id = 'dc000e2f-2cde-4c28-8d06-ebf70ae3411d'
    AND f.status = 'sent'
    AND f.sent_at > c2.last_inbound_at
  GROUP BY f.conversation_id
),
last_msg AS (
  SELECT DISTINCT ON (m.conversation_id) m.conversation_id, m.is_bot_generated
  FROM public.messages m
  WHERE m.agency_id = 'dc000e2f-2cde-4c28-8d06-ebf70ae3411d'
  ORDER BY m.conversation_id, m.created_at DESC
)
SELECT
  c.id AS conversation_id, c.lead_id, c.agency_id,
  l.whatsapp_phone AS lead_phone, l.full_name AS lead_name,
  ch.phone_number AS business_phone,
  COALESCE(s.sent_count, 0) AS step_index
FROM public.conversations c
JOIN public.leads l           ON l.id = c.lead_id
JOIN public.agency_channels ch ON ch.agency_id = c.agency_id AND ch.channel = 'whatsapp' AND ch.is_active = true
LEFT JOIN streak s            ON s.conversation_id = c.id
LEFT JOIN last_msg lm         ON lm.conversation_id = c.id
WHERE c.agency_id = 'dc000e2f-2cde-4c28-8d06-ebf70ae3411d'
  AND c.channel = 'whatsapp'
  AND c.handler = 'bot'
  AND c.handoff_status = 'none'
  AND (c.bot_paused_until IS NULL OR c.bot_paused_until < now())
  AND c.archived_at IS NULL
  AND c.last_inbound_at IS NOT NULL
  AND c.last_outbound_at IS NOT NULL
  AND c.last_outbound_at > c.last_inbound_at
  AND lm.is_bot_generated IS TRUE
  AND now() < c.last_inbound_at + interval '24 hours'
  AND COALESCE(s.sent_count, 0) < 3
  AND l.whatsapp_phone IS NOT NULL
  AND extract(hour from (now() at time zone 'America/Costa_Rica')) BETWEEN 7 AND 20
  AND now() >= greatest(c.last_outbound_at, coalesce(s.last_fu_at, c.last_outbound_at))
             + (array[interval '4 hours', interval '8 hours', interval '6 hours'])[COALESCE(s.sent_count,0)+1];
```

Expected: 0 o más filas. `followups` está vacía, así que `step_index` = 0 en todas. Como la ventana de 24h es estrecha, es normal que devuelva pocas o 0 filas según la hora.

- [ ] **Step 2: Verificar la lógica sin la restricción de ventana/horario (sanity)**

Correr la misma query pero comentando las 2 líneas `AND now() < ... 24 hours` y `AND extract(hour ...)` y `AND now() >= greatest(...)`. Debe devolver TODAS las conversaciones de Momentum donde el bot habló último y el lead no respondió (sin importar cuándo). Inspeccionar 2-3 filas manualmente en `conversations` para confirmar que efectivamente `last_outbound_at > last_inbound_at` y `handler='bot'`. Objetivo: confirmar que los JOINs y el filtro de "bot habló último" están bien.

- [ ] **Step 3: Probar el contador de streak con una fila sintética**

Insertar un `followups` de prueba para una conversación que aparezca en Step 2, y confirmar que sube su `step_index` y/o la saca por intervalo:

```sql
-- usar un conversation_id/lead_id real de Step 2
INSERT INTO public.followups (agency_id, conversation_id, lead_id, status, scheduled_for, sent_at, rendered_body)
VALUES ('dc000e2f-2cde-4c28-8d06-ebf70ae3411d', '<CONV_ID>', '<LEAD_ID>', 'sent', now(), now(), 'test streak');
```

Re-correr la query de Step 1. Expected: esa conversación ahora tiene `step_index = 1` (o desaparece si el intervalo de 8h todavía no pasó — correcto, porque el ancla `last_fu_at` es `now()`).

- [ ] **Step 4: Limpiar la fila sintética**

```sql
DELETE FROM public.followups WHERE rendered_body = 'test streak';
```

Expected: `DELETE 1`. Confirmar `SELECT count(*) FROM followups;` = 0.

- [ ] **Step 5: Commit del avance del plan (marcar Task 1)**

No hay archivo aún; commitear el plan actualizado con Task 1 tildada:

```bash
git add "docs/superpowers/plans/2026-07-18-seguimientos-momentum.md"
git commit -m "plan(seguimientos): task 1 validada — query de elegibilidad contra DB viva"
```

---

## Task 2: Query de contexto (historial para la IA) — validar contra una conversación real

**Files:**
- Test (SQL vía MCP).

- [ ] **Step 1: Escribir y correr la query de historial**

Con un `conversation_id` real (de Task 1 Step 2):

```sql
SELECT direction, sender_kind, body, created_at
FROM public.messages
WHERE conversation_id = '<CONV_ID>'
  AND kind = 'text'
  AND body IS NOT NULL
ORDER BY created_at ASC
LIMIT 40;
```

Expected: filas con el ida y vuelta lead↔bot en orden cronológico, con texto real. Confirmar que el body del bot NO es null (validación del hallazgo de persistencia). Si viene vacío, elegir otra conversación con actividad.

- [ ] **Step 2: Confirmar el formato que consumirá el prompt**

Verificar mentalmente el mapeo: `direction='inbound'` → "Lead", `sender_kind='bot'` → "Bot", `sender_kind='agent'` → "Asesor". Esto es lo que el Code node (Task 4) convierte en el transcript. No hay cambio de archivo — solo confirmar el shape.

- [ ] **Step 3: Commit**

```bash
git add "docs/superpowers/plans/2026-07-18-seguimientos-momentum.md"
git commit -m "plan(seguimientos): task 2 validada — query de historial de contexto"
```

---

## Task 3: Build script — scaffold del workflow (Cron + query elegibilidad)

**Files:**
- Create: `crm-v2/scripts/build-seguimientos-momentum-v1.js`
- Create: `crm-v2/n8n/workflows/seguimientos-momentum-v1.json` (output)

- [ ] **Step 1: Crear el build script con el esqueleto del workflow**

Autora el workflow con 2 nodos (Cron + Postgres elegibilidad) para validar la base antes de agregar el resto. `crm-v2/scripts/build-seguimientos-momentum-v1.js`:

```javascript
/**
 * build-seguimientos-momentum-v1.js
 *
 * Crea el workflow n8n "Seguimientos Momentum v1" desde cero (NO versiona un bot existente).
 * Cron 15min -> Postgres elegibilidad -> Loop -> [historial -> prompt -> LLM -> YCloud -> followups].
 *
 * Uso: node scripts/build-seguimientos-momentum-v1.js
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const OUT_PATH = path.join(ROOT, 'n8n', 'workflows', 'seguimientos-momentum-v1.json');

const AGENCY = 'dc000e2f-2cde-4c28-8d06-ebf70ae3411d';
const PG_CRED = { id: 'pMsxqUvr0wDZsjIt', name: 'CRM System' };

const ELIGIBILITY_SQL = `WITH streak AS (
  SELECT f.conversation_id, COUNT(*) AS sent_count, MAX(f.sent_at) AS last_fu_at
  FROM public.followups f
  JOIN public.conversations c2 ON c2.id = f.conversation_id
  WHERE f.agency_id = '${AGENCY}' AND f.status = 'sent' AND f.sent_at > c2.last_inbound_at
  GROUP BY f.conversation_id
),
last_msg AS (
  SELECT DISTINCT ON (m.conversation_id) m.conversation_id, m.is_bot_generated
  FROM public.messages m WHERE m.agency_id = '${AGENCY}'
  ORDER BY m.conversation_id, m.created_at DESC
)
SELECT c.id AS conversation_id, c.lead_id, c.agency_id,
  l.whatsapp_phone AS lead_phone, l.full_name AS lead_name,
  ch.phone_number AS business_phone, COALESCE(s.sent_count, 0) AS step_index
FROM public.conversations c
JOIN public.leads l ON l.id = c.lead_id
JOIN public.agency_channels ch ON ch.agency_id = c.agency_id AND ch.channel = 'whatsapp' AND ch.is_active = true
LEFT JOIN streak s ON s.conversation_id = c.id
LEFT JOIN last_msg lm ON lm.conversation_id = c.id
WHERE c.agency_id = '${AGENCY}' AND c.channel = 'whatsapp' AND c.handler = 'bot'
  AND c.handoff_status = 'none' AND (c.bot_paused_until IS NULL OR c.bot_paused_until < now())
  AND c.archived_at IS NULL AND c.last_inbound_at IS NOT NULL AND c.last_outbound_at IS NOT NULL
  AND c.last_outbound_at > c.last_inbound_at AND lm.is_bot_generated IS TRUE
  AND now() < c.last_inbound_at + interval '24 hours' AND COALESCE(s.sent_count, 0) < 3
  AND l.whatsapp_phone IS NOT NULL
  AND extract(hour from (now() at time zone 'America/Costa_Rica')) BETWEEN 7 AND 20
  AND now() >= greatest(c.last_outbound_at, coalesce(s.last_fu_at, c.last_outbound_at))
             + (array[interval '4 hours', interval '8 hours', interval '6 hours'])[COALESCE(s.sent_count,0)+1];`;

function node(name, type, typeVersion, position, parameters, extra = {}) {
  return { id: crypto.randomUUID(), name, type, typeVersion, position, parameters, ...extra };
}

function main() {
  const nodes = [
    node('Cron 15min', 'n8n-nodes-base.scheduleTrigger', 1.2, [0, 0], {
      rule: { interval: [{ field: 'minutes', minutesInterval: 15 }] },
    }),
    node('Conversaciones elegibles', 'n8n-nodes-base.postgres', 2.6, [240, 0], {
      operation: 'executeQuery',
      query: ELIGIBILITY_SQL,
    }, { credentials: { postgres: PG_CRED } }),
  ];

  const connections = {
    'Cron 15min': { main: [[{ node: 'Conversaciones elegibles', type: 'main', index: 0 }]] },
  };

  const wf = {
    name: 'Seguimientos Momentum v1',
    nodes,
    connections,
    settings: { executionOrder: 'v1' },
    active: false,
    versionId: crypto.randomUUID(),
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(wf, null, 2) + '\n', 'utf8');
  console.log('[ok]', OUT_PATH);

  const out = fs.readFileSync(OUT_PATH, 'utf8');
  const checks = [
    ['active=false', !out.includes('"active": true')],
    ['tiene Cron', out.includes('scheduleTrigger')],
    ['tiene query elegibilidad', out.includes('last_inbound_at + interval')],
    ['agency correcta', out.includes(AGENCY)],
    ['silencio nocturno CR', out.includes("America/Costa_Rica")],
  ];
  let failed = 0;
  checks.forEach(([n, ok]) => { console.log((ok ? '[pass] ' : '[FAIL] ') + n); if (!ok) failed++; });
  if (failed) process.exit(1);
  console.log('\n[done] scaffold');
}
main();
```

- [ ] **Step 2: Correr el build script**

Run: `cd crm-v2 && node scripts/build-seguimientos-momentum-v1.js`
Expected: `[ok] .../seguimientos-momentum-v1.json` y todos los checks en `[pass]`, exit 0.

- [ ] **Step 3: Validar expresiones**

Run: `cd crm-v2 && node scripts/validate-n8n-expressions.js n8n/workflows/seguimientos-momentum-v1.json`
Expected: 0 violations (no hay `$('...')` a nodos inexistentes todavía). Si el validator no existe en esa ruta, buscarlo: `ls crm-v2/scripts/validate*` y usar el nombre real.

- [ ] **Step 4: Commit**

```bash
git add crm-v2/scripts/build-seguimientos-momentum-v1.js crm-v2/n8n/workflows/seguimientos-momentum-v1.json
git commit -m "feat(seguimientos): scaffold workflow n8n (cron + query elegibilidad)"
```

---

## Task 4: Nodo de historial + Code node que arma el prompt

**Files:**
- Modify: `crm-v2/scripts/build-seguimientos-momentum-v1.js` (agregar 2 nodos + conexiones)

- [ ] **Step 1: Agregar el nodo Loop, el de historial y el Code node al array `nodes`**

En el build script, agregar al array `nodes` (después del Postgres elegibilidad):

```javascript
node('Loop', 'n8n-nodes-base.splitInBatches', 3, [480, 0], { batchSize: 1, options: {} }),
node('Historial de la conversación', 'n8n-nodes-base.postgres', 2.6, [720, 120], {
  operation: 'executeQuery',
  query: `SELECT direction, sender_kind, body, created_at
          FROM public.messages
          WHERE conversation_id = $1 AND kind = 'text' AND body IS NOT NULL
          ORDER BY created_at ASC LIMIT 40;`,
  options: { queryReplacement: '={{ $json.conversation_id }}' },
}, { credentials: { postgres: PG_CRED } }),
node('Armar prompt', 'n8n-nodes-base.code', 2, [960, 120], {
  jsCode: ARMAR_PROMPT_CODE,
}),
```

- [ ] **Step 2: Agregar la constante `ARMAR_PROMPT_CODE` arriba en el script**

El Code node corre en modo "Run Once for All Items": recibe todas las filas del historial y arma un solo item con el transcript + metadata del item del Loop. Definir antes de `main()`:

```javascript
const ARMAR_PROMPT_CODE = `
// El historial viene como items de este nodo; los datos del lead/paso vienen del Loop.
const historial = $input.all().map(i => i.json);
const ctx = $('Loop').item.json; // conversation_id, lead_name, lead_phone, business_phone, step_index

const roleOf = (m) => m.direction === 'inbound' ? 'Lead' : (m.sender_kind === 'bot' ? 'Bot' : 'Asesor');
const transcript = historial.map(m => roleOf(m) + ': ' + (m.body || '').trim()).join('\\n');

const paso = Number(ctx.step_index) + 1; // 1..3
const nombre = (ctx.lead_name || '').split(' ')[0] || '';

return [{ json: {
  conversation_id: ctx.conversation_id,
  lead_id: ctx.lead_id,
  agency_id: ctx.agency_id,
  lead_phone: ctx.lead_phone,
  business_phone: ctx.business_phone,
  step_index: ctx.step_index,
  paso,
  nombre,
  transcript,
} }];
`;
```

- [ ] **Step 3: Agregar las conexiones nuevas**

En el objeto `connections`, agregar:

```javascript
connections['Conversaciones elegibles'] = { main: [[{ node: 'Loop', type: 'main', index: 0 }]] };
// Loop tiene 2 salidas: [0]=done, [1]=loop(cada item). Usamos la salida 1 (loop) hacia el historial.
connections['Loop'] = { main: [ [], [{ node: 'Historial de la conversación', type: 'main', index: 0 }] ] };
connections['Historial de la conversación'] = { main: [[{ node: 'Armar prompt', type: 'main', index: 0 }]] };
```

> Nota n8n: en `splitInBatches` v3 la salida índice **0 es "done"** y la **1 es "loop"**. El procesamiento por item sale por la 1; el retorno al Loop se conecta al final (Task 7). Verificar este orden al abrir el nodo en el editor (Task 8).

- [ ] **Step 4: Agregar checks al smoke test y correr**

Agregar a `checks`:
```javascript
['tiene historial', out.includes('ORDER BY created_at ASC')],
['tiene armar prompt', out.includes('const transcript')],
```
Run: `cd crm-v2 && node scripts/build-seguimientos-momentum-v1.js` → todos `[pass]`, exit 0.
Run: `cd crm-v2 && node scripts/validate-n8n-expressions.js n8n/workflows/seguimientos-momentum-v1.json` → 0 violations.

- [ ] **Step 5: Commit**

```bash
git add crm-v2/scripts/build-seguimientos-momentum-v1.js crm-v2/n8n/workflows/seguimientos-momentum-v1.json
git commit -m "feat(seguimientos): nodo historial + code node que arma el prompt"
```

---

## Task 5: Nodo LLM que redacta el follow-up

**Decisión de modelo:** por defecto **reusar la credencial OpenAI ya cableada en n8n** (`openAiApi`, "OpenAI - General") con `gpt-4.1` — es lo que corre el bot hoy, sin secreto nuevo. Cambiar a Claude es un cambio de 1 sub-nodo si el founder lo prefiere (usar `@n8n/n8n-nodes-langchain.lmChatAnthropic` + credencial Anthropic). El prompt es idéntico.

**Files:**
- Modify: `crm-v2/scripts/build-seguimientos-momentum-v1.js`

- [ ] **Step 1: Agregar la constante del prompt del redactor**

Definir antes de `main()`:

```javascript
const PROMPT_REDACTOR = `Sos el asistente de WhatsApp de una inmobiliaria en Costa Rica. Un lead dejó de responder y vas a mandarle UN mensaje de seguimiento para reactivar la conversación.

CONTEXTO DE LA CONVERSACIÓN (lo último que hablaron, en orden):
{{ $json.transcript }}

DATOS:
- Nombre del lead: {{ $json.nombre }}
- Número de seguimiento: {{ $json.paso }} de 3

TU TAREA: redactar SOLO el texto del mensaje de seguimiento, enganchando con lo último que se habló (no un genérico "seguís interesado"). Mencioná algo concreto de la conversación.

ESCALADO SEGÚN EL NÚMERO:
- Seguimiento 1: recordatorio suave, retomá el último punto.
- Seguimiento 2: aportá un ángulo o valor nuevo (una duda que podés resolver, un dato útil), no repitas lo del 1.
- Seguimiento 3: cierre respetuoso, sin presión ("cuando quieras retomar me escribís").

REGLAS DE ESTILO (obligatorias):
- Suena a WhatsApp de un conocido, NO a artículo ni a robot.
- Puntuación humana: SIN punto final, SIN punto y coma, SIN dos puntos, SIN signo de apertura de pregunta, SIN raya (—).
- Corto (1-2 líneas). Sin emojis excesivos (máximo 1, opcional).
- No inventes datos, precios ni disponibilidad que no estén en la conversación.
- No prometas mandar cosas que no sean texto o un link.
- Si ya hay seguimientos previos en el transcript, NO repitas el mismo texto.

Respondé ÚNICAMENTE con el texto del mensaje, nada más.`;
```

- [ ] **Step 2: Agregar el nodo LLM (Basic LLM Chain) y su sub-nodo de modelo**

Agregar al array `nodes`:

```javascript
node('Redactar follow-up (LLM)', '@n8n/n8n-nodes-langchain.chainLlm', 1.5, [1200, 120], {
  text: PROMPT_REDACTOR,
  promptType: 'define',
  messages: { messageValues: [] },
}),
node('Modelo OpenAI', '@n8n/n8n-nodes-langchain.lmChatOpenAi', 1, [1200, 320], {
  model: { __rl: true, value: 'gpt-4.1', mode: 'list' },
  options: { temperature: 0.7 },
}, { credentials: { openAiApi: { id: 'REEMPLAZAR_ID_OPENAI', name: 'OpenAI - General' } } }),
```

> ⚠️ `REEMPLAZAR_ID_OPENAI`: obtener el id real de la credencial `openAiApi` desde un nodo LLM del bot. Correr:
> `node -e "const w=require('./n8n/workflows/chatbot-momentum-bot-c-v1.json'); w.nodes.filter(n=>n.credentials&&n.credentials.openAiApi).slice(0,1).forEach(n=>console.log(JSON.stringify(n.credentials.openAiApi)))"`
> y pegar el `{id,name}` exacto en el script.

- [ ] **Step 3: Conectar el modelo al chain y el chain al flujo**

En `connections`:

```javascript
connections['Armar prompt'] = { main: [[{ node: 'Redactar follow-up (LLM)', type: 'main', index: 0 }]] };
connections['Modelo OpenAI'] = { ai_languageModel: [[{ node: 'Redactar follow-up (LLM)', type: 'ai_languageModel', index: 0 }]] };
```

- [ ] **Step 4: Smoke checks + build + validate**

Agregar checks:
```javascript
['tiene LLM chain', out.includes('chainLlm')],
['prompt sin dos puntos regla', out.includes('Puntuación humana')],
['id openai reemplazado', !out.includes('REEMPLAZAR_ID_OPENAI')],
```
Run build + validator. Ambos exit 0. El check `id openai reemplazado` FALLA a propósito hasta que pegues el id real (Step 2).

- [ ] **Step 5: Commit**

```bash
git add crm-v2/scripts/build-seguimientos-momentum-v1.js crm-v2/n8n/workflows/seguimientos-momentum-v1.json
git commit -m "feat(seguimientos): nodo LLM redactor de follow-up personalizado"
```

---

## Task 6: Nodo de envío YCloud

**Files:**
- Modify: `crm-v2/scripts/build-seguimientos-momentum-v1.js`

- [ ] **Step 1: Agregar el nodo HTTP de envío**

Agregar al array `nodes`. El body replica el del bot (`Send Chunk via YCloud`), pero `from`/`to` salen del item armado (no del webhook):

```javascript
node('Enviar por YCloud', 'n8n-nodes-base.httpRequest', 4.2, [1440, 120], {
  method: 'POST',
  url: 'https://api.ycloud.com/v2/whatsapp/messages',
  authentication: 'genericCredentialType',
  genericAuthType: 'httpHeaderAuth',
  sendBody: true,
  specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ from: $(\\'Armar prompt\\').item.json.business_phone, to: $(\\'Armar prompt\\').item.json.lead_phone, type: \\'text\\', text: { body: $json.text } }) }}',
  options: { response: { response: { neverError: true, fullResponse: true } } },
}, { credentials: { httpHeaderAuth: { id: 'jfwQ9Rp74VHhXDsH', name: 'Momentum AI' } }, onError: 'continueRegularOutput' }),
```

> El output del `chainLlm` deja el texto en `$json.text`. Confirmar el nombre del campo de salida del chain al probar (Task 8); si el chain devuelve `$json.output` en vez de `text`, ajustar `text: { body: $json.output }`.

- [ ] **Step 2: Conectar el LLM al envío**

```javascript
connections['Redactar follow-up (LLM)'] = { main: [[{ node: 'Enviar por YCloud', type: 'main', index: 0 }]] };
```

- [ ] **Step 3: Smoke checks + build + validate**

```javascript
['tiene envio ycloud', out.includes('api.ycloud.com/v2/whatsapp/messages')],
['from dinamico', out.includes('business_phone')],
```
Run build + validator → exit 0.

- [ ] **Step 4: Commit**

```bash
git add crm-v2/scripts/build-seguimientos-momentum-v1.js crm-v2/n8n/workflows/seguimientos-momentum-v1.json
git commit -m "feat(seguimientos): nodo de envio YCloud (from de la agency, to del lead)"
```

---

## Task 7: INSERT en `followups` (audit + contador) + cerrar el loop

**Files:**
- Modify: `crm-v2/scripts/build-seguimientos-momentum-v1.js`

- [ ] **Step 1: Agregar el nodo Postgres de registro**

```javascript
node('Registrar en followups', 'n8n-nodes-base.postgres', 2.6, [1680, 120], {
  operation: 'executeQuery',
  query: `INSERT INTO public.followups
    (agency_id, conversation_id, lead_id, status, scheduled_for, sent_at, rendered_body)
    VALUES ($1, $2, $3, 'sent', now(), now(), $4);`,
  options: { queryReplacement: '={{ $(\\'Armar prompt\\').item.json.agency_id }},{{ $(\\'Armar prompt\\').item.json.conversation_id }},{{ $(\\'Armar prompt\\').item.json.lead_id }},{{ $json.text }}' },
}, { credentials: { postgres: PG_CRED } }),
```

> `queryReplacement` en el nodo Postgres v2.6 acepta valores separados por coma mapeados a `$1..$4` en orden. Verificar en el editor (Task 8) que los 4 valores se resuelven; si el nodo requiere el modo "Query Parameters" distinto, usar la UI de parámetros. El 4º (`$json.text`) debe ser el MISMO texto que se envió — sale del chain.

- [ ] **Step 2: Conectar envío → registro → de vuelta al Loop**

```javascript
connections['Enviar por YCloud'] = { main: [[{ node: 'Registrar en followups', type: 'main', index: 0 }]] };
connections['Registrar en followups'] = { main: [[{ node: 'Loop', type: 'main', index: 0 }]] };
```

Esto cierra el ciclo: cada item procesado vuelve al `Loop`, que toma el siguiente hasta agotar la salida "done" (índice 0, que queda sin conectar = fin).

- [ ] **Step 3: Smoke checks + build + validate**

```javascript
['tiene insert followups', out.includes('INSERT INTO public.followups')],
['loop cerrado', out.includes("node: 'Loop', type: 'main'") ],
```
Run build + validator → exit 0.

- [ ] **Step 4: Commit**

```bash
git add crm-v2/scripts/build-seguimientos-momentum-v1.js crm-v2/n8n/workflows/seguimientos-momentum-v1.json
git commit -m "feat(seguimientos): insert en followups + cierre del loop del workflow"
```

---

## Task 8: Deploy a n8n + verificación estructural en el editor

**Files:**
- Modify: `crm-v2/n8n/workflow-ids.json`
- Create: `crm-v2/memory/n8n-changes/2026-07-18-seguimientos-momentum-v1.md`

- [ ] **Step 1: Crear el workflow en n8n vía API (POST, workflow nuevo)**

Correr un one-off (leyendo `N8N_HOST`/`N8N_API_KEY` del `.env`, NUNCA hardcodear):

```bash
cd crm-v2 && node -e "
const https=require('https'),fs=require('fs');
require('dotenv').config();
const wf=JSON.parse(fs.readFileSync('n8n/workflows/seguimientos-momentum-v1.json','utf8'));
const payload=JSON.stringify({name:wf.name,nodes:wf.nodes,connections:wf.connections,settings:wf.settings});
const host=process.env.N8N_HOST.replace(/^https?:\/\//,'');
const req=https.request({hostname:host,path:'/api/v1/workflows',method:'POST',headers:{'Content-Type':'application/json','X-N8N-API-KEY':process.env.N8N_API_KEY,'Content-Length':Buffer.byteLength(payload)}},res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>console.log(res.statusCode, d.slice(0,300)));});
req.write(payload);req.end();
"
```

Expected: `200` (o `201`) + JSON con el `id` del workflow nuevo. Guardar ese id.

- [ ] **Step 2: Registrar el id en `workflow-ids.json`**

Agregar la línea `"seguimientos-momentum-v1": "<NUEVO_ID>"` al JSON.

- [ ] **Step 3: Abrir el workflow en el editor de n8n y verificar la estructura**

Manual (o vía screenshot si hay acceso browser): confirmar visualmente que:
- El `Loop` conecta su salida **loop** (no la done) hacia `Historial`.
- `Modelo OpenAI` cuelga del `Redactar follow-up (LLM)` como modelo (línea ai_languageModel).
- El campo de salida del chain LLM es `text` (si es `output`, corregir el build script en Tasks 6/7 y re-deploy).
- `Registrar en followups` vuelve al `Loop`.

Si algo está mal, corregir el build script, re-correr `node scripts/build-seguimientos-momentum-v1.js`, y re-deploy vía PUT:
```bash
# mismo one-off pero method:'PUT' y path:'/api/v1/workflows/<NUEVO_ID>'
```

- [ ] **Step 4: Escribir la bitácora del cambio**

`crm-v2/memory/n8n-changes/2026-07-18-seguimientos-momentum-v1.md`: qué es, nodos, id del workflow, cómo se prueba, qué NO toca (no modifica el bot, no auto-inserta en messages).

- [ ] **Step 5: Commit**

```bash
git add crm-v2/n8n/workflow-ids.json crm-v2/memory/n8n-changes/2026-07-18-seguimientos-momentum-v1.md
git commit -m "chore(seguimientos): crear workflow en n8n + registrar id + bitacora"
```

---

## Task 9: Test controlado end-to-end (con número propio) — antes de activar

**Files:** ninguno (verificación en vivo).

- [ ] **Step 1: Preparar una conversación de prueba controlada**

Usar un lead cuyo `whatsapp_phone` sea un número propio del founder (ej. el de Pietro/Hans de prueba). Forzar que califique: en `conversations` de esa conv, setear a mano un estado elegible:

```sql
UPDATE public.conversations
SET last_inbound_at = now() - interval '5 hours',   -- dentro de 24h
    last_outbound_at = now() - interval '5 hours' + interval '1 minute', -- bot habló último, hace ~5h (>4h del paso 1)
    handler = 'bot', handoff_status = 'none', bot_paused_until = NULL, archived_at = NULL
WHERE id = '<CONV_TEST>';
```

Confirmar que la query de elegibilidad (Task 1) ahora la devuelve (y que la hora local CR está en [7,20]; si no, esperar o ajustar para la prueba).

- [ ] **Step 2: Ejecutar el workflow una vez manualmente desde n8n ("Execute Workflow")**

Expected en la ejecución: `Conversaciones elegibles` devuelve ≥1 fila (la de prueba), el LLM produce un texto que engancha con el historial y cumple el estilo (sin punto final, etc.), `Enviar por YCloud` responde 200/accepted, `Registrar en followups` inserta 1 fila.

- [ ] **Step 3: Verificar la recepción real en WhatsApp**

Confirmar en el teléfono de prueba que llegó el mensaje personalizado. (Es el criterio de "funciona" real, no "corrió 200".)

- [ ] **Step 4: Verificar la persistencia contra la DB (tras unos segundos)**

```sql
SELECT status, rendered_body, sent_at FROM public.followups WHERE conversation_id='<CONV_TEST>' ORDER BY sent_at DESC LIMIT 1;
SELECT direction, sender_kind, is_bot_generated, left(body,60) FROM public.messages
  WHERE conversation_id='<CONV_TEST>' ORDER BY created_at DESC LIMIT 3;
```

Expected:
- 1 fila en `followups` con el texto enviado.
- El mensaje aparece en `messages` (lo insertó el webhook) con `sender_kind='bot'`, `is_bot_generated=true`, `body` = el texto. **UNA sola fila** para ese mensaje (verificar que NO hay duplicado con body null).

- [ ] **Step 5: Verificar el no-doble-envío (idempotencia)**

Ejecutar el workflow OTRA vez inmediatamente. Expected: la conv de prueba **ya NO califica** (porque `followups.sent_count=1` y el intervalo del paso 2 es 8h, que no pasó). `Conversaciones elegibles` devuelve 0 filas para esa conv. No se manda nada.

- [ ] **Step 6: Verificar el corte por respuesta del lead**

Responder desde el teléfono de prueba (llega un inbound → `last_inbound_at` avanza). Ejecutar el workflow. Expected: la conv no califica (streak reseteado: `sent_at < last_inbound_at` ahora, y `last_outbound_at < last_inbound_at`). Confirma el corte por respuesta.

- [ ] **Step 7: Commit del plan (Task 9 tildada)**

```bash
git add "docs/superpowers/plans/2026-07-18-seguimientos-momentum.md"
git commit -m "test(seguimientos): e2e controlado verificado (envio, persistencia, idempotencia, corte)"
```

---

## Task 10: Activación + monitoreo + backlog

**Files:**
- Modify: `crm-v2/memory/backlog.md`

- [ ] **Step 1: Activar el cron en n8n**

En el editor de n8n, activar el workflow "Seguimientos Momentum v1" (toggle Active). Desde ese momento corre cada 15 min sobre conversaciones reales de Momentum.

- [ ] **Step 2: Monitorear las primeras 2-3 corridas**

Revisar el historial de ejecuciones de n8n. Confirmar: sin errores, y que los follow-ups que salen son de calidad (leer 2-3 `rendered_body` reales en `followups`). Si un mensaje sale flojo, iterar el prompt (Task 5) vía build script + re-deploy.

- [ ] **Step 3: Verificar que NO toca conversaciones en handoff**

```sql
SELECT c.id FROM public.conversations c
JOIN public.followups f ON f.conversation_id = c.id
WHERE c.agency_id='dc000e2f-2cde-4c28-8d06-ebf70ae3411d'
  AND (c.handoff_status <> 'none' OR c.handler <> 'bot' OR c.bot_paused_until > now());
```
Expected: 0 filas (ningún follow-up se mandó a una conversación tomada por un humano).

- [ ] **Step 4: Actualizar el backlog**

En `crm-v2/memory/backlog.md`, mover "Seguimientos" de post-MVP a Hecho, con fecha 2026-07-18, alcance (solo Momentum, v1 sin plantillas Meta), y cómo se verificó (Task 9). Anotar como Pendiente v2: plantillas Meta fuera de 24h + generalización multi-tenant (config a `followup_rules`).

- [ ] **Step 5: Commit**

```bash
git add crm-v2/memory/backlog.md
git commit -m "docs(seguimientos): activar v1, monitoreo ok, actualizar backlog"
```

---

## Notas de verificación del plan (self-review)

- **Cobertura del spec:** §1 modelo→Tasks 3-7 · §3 arquitectura cron→Task 3 · §3.1 anclas→query Task 1 (greatest) · §4 elegibilidad/cortes→query Task 1 (todos los WHERE) + Task 9 Steps 5-6 · §5 IA→Tasks 4-5 · §5 persistencia (webhook, no auto-insert)→Task 9 Step 4 · §6 datos followups→Task 7 · §7 envío→Task 6 · §8 idempotencia→Task 9 Step 5 · §9 fuera de alcance→Task 10 Step 4 (v2 anotado) · §10 edge cases→Task 9 Steps 5-6.
- **Sin placeholders** salvo 2 marcados explícitamente que el ejecutor DEBE resolver: `REEMPLAZAR_ID_OPENAI` (Task 5, con el comando para obtenerlo) y `<CONV_TEST>`/`<NUEVO_ID>` (valores runtime).
- **Riesgo residual conocido:** el nombre del campo de salida del `chainLlm` (`text` vs `output`) y el orden de salidas del `splitInBatches` (0=done, 1=loop) se confirman visualmente en Task 8 Step 3 — son las 2 cosas que n8n puede sorprender y por eso hay verificación explícita antes del test e2e.
