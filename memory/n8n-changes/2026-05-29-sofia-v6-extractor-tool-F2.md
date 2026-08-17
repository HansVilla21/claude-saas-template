# Spec: bot-v6 F2 — Extractor Tool (edge function `bot-actions` v0.1 + tool LLM)

**Fecha:** 2026-05-29
**Autor:** n8n-architect
**Workflow afectado:** `n8n/workflows/chatbot-momentum-bot-v6-v1.json` (id N8N `p3h7tx6UiGBQ9Tzb`, activo).
**Versión actual → propuesta:** bot-v6 v1 (F1: compositor lee bot_config; bloque `## DATOS A CAPTURAR` INERTE) → **bot-v6 v2** (F2: extractor escribe `extractor_field_values` en cada turno; bloque activado).
**Trigger del cambio:** Nueva feature. El "boom" del moat de Insights por contacto. Hoy el panel `/a/[slug]/leads/[id]` pestaña Insights muestra data SEMBRADA; con F2 pasa a mostrar data REAL del bot.
**Specs predecesoras:** `2026-05-29-cablear-bot-config-runtime.md` §4.1-§4.2 (diseñó el patrón a alto nivel) · `2026-05-29-sofia-v6-base-v2-plus-compositor-F1.md` (workflow base) · `memory/research/13-bot-v6-compositor-code.md` (jsCode actual del compositor con markers).

---

## 0. Resumen ejecutivo

F2 convierte el bloque `## DATOS A CAPTURAR` del prompt (inerte en F1 — solo "tenelos presentes") en una **instrucción activa de llamar tool** + entrega la tool real cableada al agente + entrega el endpoint que persiste los datos.

**Tres entregables atómicos:**
1. **Edge function `bot-actions` v0.1** (nueva, `crm-v2/supabase/functions/bot-actions/index.ts`). Router preparado para crecer (F4 agrega `stage.set`, `qualify.set`, `assign.set`, `tag.add`, `note.write`, `handoff.escalate`); en F2 implementa SOLO la action `extractor.write`. Secret-auth (Bearer + `BOT_ACTIONS_SECRET`), service_role, valida + coerciona + upsertea contra `extractor_field_values` con UNIQUE `(lead_id, field_def_id)`.
2. **Tool node `Extractor Tool (bot-actions)`** (`@n8n/n8n-nodes-langchain.toolHttpRequest`) conectada como `ai_tool` al `Agente Principal - Sofia`. URL al edge function v2, Bearer `{{ $env.BOT_ACTIONS_SECRET }}`, `agency_id`/`lead_id` del flujo (NUNCA por `$fromAI`), `fields` por `$fromAI('fields', ..., 'json')`.
3. **Modificación del Code node `Componer System Prompt`** (`memory/research/13-bot-v6-compositor-code.md`): el bloque `## DATOS A CAPTURAR` deja de decir "tenelos presentes" y pasa a decir "llamá la tool `extraer_datos` apenas el lead REVELE uno de estos datos. Solo cuando el lead DA un dato, no cuando pregunta. Un solo llamado puede incluir varios campos.".

**Decisiones rectoras (lock-in):**
- **D1 — Router operations con namespace dotted** (`extractor.write`, `stage.set`, …). Coherente con el camino F4 que ya está escrito en doc 04 §4.3. F2 implementa solo `extractor.write` + un 501 explícito para el resto ("not implemented yet, scheduled F4"), para que el día que el LLM intente otra action sin estar lista, devuelva un error legible que el LLM ignora sin abortar.
- **D2 — El extractor NO se gatea por `settings.auto_actions.*`.** Captura de datos = lectura silenciosa que enriquece Insights internos; el cliente nunca ve el efecto en la conversación. Toggles `auto_actions` SÍ aplican a F4 (acciones que mutan al lead: cambio de etapa, calificación, asignación, tag, nota, handoff). El extractor queda siempre on por defecto, opcionalmente apagable con un nuevo flag `settings.bot_extractor_enabled` (default true) que se valida en `bot-actions` antes de upsertear — barato de implementar, ya queda listo si mañana un cliente pide apagarlo. **Requiere confirmación del founder (§7 D-A).**
- **D3 — Field_keys desconocidos: SKIP silencioso, NO crear defs desde el bot.** El extractor solo escribe contra defs que ya existen en `extractor_field_defs` para esa agency (con `is_active=true`). Si el LLM inventa `field_key='budget'` cuando el def es `presupuesto` → skip + log `skipped_unknown_field`, response 200 con detalle. Esto previene contaminación del schema por alucinación + da observabilidad cuando el prompt necesita ajuste.
- **D4 — Procedencia `'bot'` se documenta sin migración nueva en F2.** La migración 0005 (verificada) NO tiene columna de procedencia en `extractor_field_values`. Decisión: NO crear migración aditiva acá. La procedencia 'bot' queda implícita (todo lo escrito por `bot-actions` es bot por definición — no hay otro path que escriba esta tabla). Si el founder quiere observabilidad explícita más adelante, F4 puede agregar `extracted_by` text DEFAULT 'bot' con migración aditiva. **Requiere confirmación del founder (§7 D-B).**
- **D5 — Multi-field en UN solo llamado.** El input es `fields: [{field_key, value}, ...]` (lista) y NO `{field_key, value}` singular. Razón: un turno típico puede revelar 2-3 campos a la vez ("busco en Escazú, 250 mil, urgente"). Forzar 3 llamadas tool secuenciales infla latencia + tokens + costo. La transacción dentro del edge function procesa la lista en bloque (un solo round-trip).
- **D6 — Idempotencia por UPSERT.** La UNIQUE `(lead_id, field_def_id)` del schema 0005 garantiza que si el LLM reenvía el mismo `field_key` con el mismo `value` (ej. el lead repite "Escazú" en otro turno), `ON CONFLICT DO UPDATE SET value, updated_at=now()` lo trata sin crear filas duplicadas. Es seguro reintentar; ningún side-effect mutante adicional.

**Lo que F2 NO toca (queda explícito):** F3 atribución en `ycloud-webhook` (vive en PR #2), F4 auto-acciones + toggles + handoff por tool, F5 módulo properties.

---

## 1. Problema / requerimiento

Hoy el founder ve el panel Insights por contacto (`/a/[slug]/leads/[id]`) y la data viene de seeds porque el bot NO escribe en `extractor_field_values`. El moat del producto ("el bot piensa y captura inteligencia mientras conversa") no es real hasta F2. F1 ya cargó la base: la query maestra trae `extractor_field_defs` activos de la agency, el compositor los pinta en el prompt; falta el último cable (tool + endpoint) para que el LLM emita y la DB guarde.

El demo fisio de Robert ya tiene 7 defs core sembradas (intención, temperatura, urgencia, objeciones, datos clave, próximo paso, resumen — agnósticos de nicho). En cuanto F2 esté vivo, una conversación real de prueba poblará esas filas y el panel cambia de "demo" a "real" sin más cambio que activar el workflow.

---

## 2. Estado actual relevante

Nodos del workflow `Chatbot Momentum - bot-v6 v1` que se ven afectados (citando nombres exactos del JSON):

| Nodo | Tipo | Estado actual | Qué le pasa en F2 |
|---|---|---|---|
| `Agente Principal - Sofia` | `@n8n/n8n-nodes-langchain.agent` | systemMessage = `{{ $('Componer System Prompt').first().json.system_prompt }}`. Hoy tiene 0 conexiones `ai_tool` reales conectadas (la `Supabase Properties Tool` está huérfana desde F1; `Request Handoff Tool` puede estar conectada o no según opción A/B del founder en P6 de F1). | **MODIFICAR conexiones:** agregar `Extractor Tool (bot-actions)` como NUEVA conexión `ai_tool`. NO cambia `parameters`. |
| `Componer System Prompt` | `n8n-nodes-base.code` (typeVersion 2) | Compone el system prompt con bloque `## DATOS A CAPTURAR` INERTE ("tenelos presentes en la conversación / sin herramienta de guardado"). | **MODIFICAR jsCode:** el texto del bloque `## DATOS A CAPTURAR` pasa a instrucción ACTIVA de llamar la tool `extraer_datos`. Mismo orden de bloques, misma estructura. Solo cambia ese sub-string. |
| `Resolve Agency` | `n8n-nodes-base.postgres` | Query maestra v2 trae `extractor_field_defs` con `field_key`, `field_type`, `label`, `extraction_hint`, `options`. | **SIN cambios.** F2 reusa el mismo output. |
| `Buscar Lead (Supabase)` | postgres | Devuelve `id` del lead (alias `id` en row). | **SIN cambios.** `lead_id` ya disponible para la tool. |
| `Get Conversation State` | postgres | Devuelve `id` (conversation_id). | **SIN cambios.** Lo pasa la tool al edge function (útil para observabilidad/auditoría futura). |

**Estado fuera de n8n:**
- En `crm-v2/supabase/functions/`: SOLO existe `ycloud-webhook`. **NO existe `bot-actions`** — F2 lo crea desde cero.
- `extractor_field_defs` para agency demo: **YA SEMBRADAS** (7 core, agnósticas — confirmado por contexto inicial del founder).
- `BOT_ACTIONS_SECRET`: **NO existe todavía**. El founder lo genera (`openssl rand -hex 32`) y lo setea en Supabase Edge Function Secrets + N8N env vars (P1 en §9).

---

## 3. Cambio propuesto

### 3.1 Nodos a CREAR (n8n)

| Nombre | Type | typeVersion | Posición aprox. | Parámetros críticos |
|---|---|---|---|---|
| `Extractor Tool (bot-actions)` | `@n8n/n8n-nodes-langchain.toolHttpRequest` | 1.1 | sub-nodo `ai_tool` del `Agente Principal - Sofia` (≈ x=-280, y=1080, debajo o al costado de la `Request Handoff Tool` para mantener consistencia visual) | Method POST · URL al edge function v2 · Auth Bearer en header (NO usar el campo Authentication del nodo — usar `sendHeaders=true` + headerParameters) · jsonBody con shape de §4.2 · `toolDescription` literal §4.3 · `optimizeResponse=false` (queremos JSON parseable, no markdown) · `placeholderDefinitions` para los `$fromAI` (ver §4.2). |

### 3.2 Nodos a MODIFICAR (n8n)

| Nombre | Qué cambia | Por qué |
|---|---|---|
| `Componer System Prompt` | jsCode: el sub-string del bloque `## DATOS A CAPTURAR` cambia. Resto del código IDÉNTICO. Texto literal nuevo en §5. | Activar la captura. El compositor ya tiene los defs; solo cambia la instrucción al LLM. |
| `Agente Principal - Sofia` (conexiones) | Agregar conexión `ai_tool` desde `Extractor Tool (bot-actions)`. NO cambia `parameters`. | Cablear la tool al agente. |

### 3.3 Nodos a BORRAR

Ninguno.

### 3.4 Conexiones a CREAR

- `Extractor Tool (bot-actions)` → `Agente Principal - Sofia` (**`ai_tool`**) — NUEVA. Si la `Request Handoff Tool` ya está conectada, esta es la segunda; si no, es la primera real del workflow.

### 3.5 Conexiones a BORRAR

Ninguna.

### 3.6 Output `extractor_field_defs` (recordatorio — ya viene de F1)

La query maestra ya devuelve, dentro de `$('Resolve Agency').first().json.extractor_field_defs`, un array de objetos con:

```json
[
  { "id": "<uuid>", "field_key": "intencion", "label": "Intención de compra/contratación",
    "field_type": "enum", "extraction_hint": "qué quiere el lead concretamente",
    "options": ["explorar","comparar","decidir","avanzar"], "module_id": null },
  { "id": "<uuid>", "field_key": "presupuesto", "label": "Presupuesto",
    "field_type": "number", "extraction_hint": "rango en CRC o USD",
    "options": null, "module_id": null }
  /* ...resto de defs core + de módulos prendidos */
]
```

El compositor (paso "DATOS A CAPTURAR" del jsCode) recorre esto y arma las líneas `- field_key (field_type): label — extraction_hint [Opciones: ...]`. En F2 NO cambia ese render; solo cambia el header instructivo.

---

## 4. Diseño del edge function `bot-actions` v0.1

### 4.1 Contrato general (router)

**Path:** `crm-v2/supabase/functions/bot-actions/index.ts`
**Auth:** Bearer secret (`BOT_ACTIONS_SECRET`) — patrón skill `supabase-edge-function-secret-auth`.
**Deploy:** `supabase functions deploy bot-actions --no-verify-jwt`.
**Service role:** SÍ (bypassa RLS; SIEMPRE filtra por `agency_id` server-side, defensa contra cross-tenant).

**Input (request body — shape universal del router):**
```json
{
  "operation": "extractor.write",
  "agency_id": "<uuid>",
  "lead_id": "<uuid>",
  "conversation_id": "<uuid>",
  "params": { /* shape específico de la operation */ }
}
```

**Validación de envelope (antes de routear a operation handler):**
1. `HANDOFF_INTERNAL_SECRET`-style: si `BOT_ACTIONS_SECRET` no está en env → 500 `server misconfigured`.
2. `req.method !== 'POST'` → 405.
3. `req.headers.get('authorization') !== 'Bearer ' + BOT_ACTIONS_SECRET` → 401 (texto opaco "unauthorized", sin filtrar info).
4. Parse JSON, si falla → 400 `invalid json`.
5. Validar UUIDs (`operation`, `agency_id`, `lead_id` siempre requeridos; `conversation_id` opcional pero recomendado) → 400 con detalle del campo faltante.
6. **Defensa cross-tenant:** verificar que `lead.agency_id === input.agency_id` con un SELECT defensivo antes de upsertear. Si no matchea → 403 `lead_not_in_agency`. Esto blinda contra un bot/agency mal configurado escribiendo en leads de otra agency.
7. **Toggle global del extractor (D2):** leer `agencies.settings->>'bot_extractor_enabled'`. Si `=== 'false'` explícito → 200 `{ ok: true, skipped: 'extractor_disabled_by_settings' }` (no es error; el bot no debe abortar). Default (NULL o ausente) = enabled.

**Router de operations:**
```typescript
switch (operation) {
  case 'extractor.write': return await handleExtractorWrite(params, ctx);
  // F4 — placeholders explícitos para que un LLM que invoque algo no listo
  // reciba 200 con mensaje legible y siga conversando, en vez de 404/500
  case 'stage.set':
  case 'qualify.set':
  case 'assign.set':
  case 'tag.add':
  case 'note.write':
  case 'handoff.escalate':
    return ok({ skipped: 'operation_not_implemented_yet', operation, phase: 'F4' });
  default:
    return ok({ skipped: 'unknown_operation', operation });
}
```

**Output universal:** `200 { ok: true, ... }` también para skips (NO 4xx — el agente LangChain NO debe abortar el turno por una extracción fallida; doc 04 §7 caso 4). Solo devolver no-200 ante envelope malformado / auth fail / cross-tenant violation (que son bugs del workflow, no del LLM).

### 4.2 Handler `handleExtractorWrite(params, ctx)`

**Input específico de `params`:**
```json
{
  "fields": [
    { "field_key": "intencion", "value": "decidir" },
    { "field_key": "presupuesto", "value": 250000 },
    { "field_key": "zona", "value": "Escazú" }
  ]
}
```

**Validación:**
- `params.fields` debe ser array no vacío de ≤ 20 elementos (cap defensivo anti-abuso). Si vacío → 200 `{ ok: true, upserted: [], skipped: [] }`.
- Cada `field.field_key` string no vacío; cada `field.value` JSON-serializable (string, number, boolean, array, object — NO `undefined`).

**Lógica por field (loop, single transaction):**
1. **Resolver def:** `SELECT id, field_type, options FROM extractor_field_defs WHERE agency_id=$1 AND field_key=$2 AND is_active=true LIMIT 1`.
   - Si no encuentra → push a `skipped` con `{field_key, reason: 'unknown_field'}` y `continue`. NUNCA crear defs desde el bot (D3).
2. **Coerción al `field_type`:**
   | field_type | Coerción | Falla → |
   |---|---|---|
   | `text` | `String(value)` | nunca falla |
   | `number` | `Number(value)`; si `isNaN` → fallback `null` con warning | warning, NO skip |
   | `boolean` | `value === true \|\| value === 'true' \|\| value === 1 \|\| value === '1'` → true; resto false | nunca falla |
   | `date` | parsear ISO; si inválido → guardar string crudo + warning | warning, NO skip |
   | `enum` | si def tiene `options` array, validar `String(value)` ∈ options; si no matchea → guardar string crudo + warning `coerce_warning_enum_no_match` | warning, NO skip |
3. **Value null/empty:** si `value === null` o `value === ''` después de coerción → push a `skipped` con `{field_key, reason: 'empty_value'}` (no upsertear; preferimos no escribir basura sobre un valor previo bueno). El LLM no debería mandar valores vacíos, pero defensa.
4. **Upsert:**
   ```sql
   INSERT INTO public.extractor_field_values
     (agency_id, lead_id, field_def_id, value, extracted_at, updated_at)
   VALUES ($1, $2, $3, $4::jsonb, now(), now())
   ON CONFLICT (lead_id, field_def_id)
   DO UPDATE SET value = EXCLUDED.value, updated_at = now();
   ```
   Como `value` es `jsonb`, serializar el valor coercionado a JSON: `JSON.stringify(coercedValue)`.
5. Push a `upserted` con `field_key`.

**Output:**
```json
{
  "ok": true,
  "upserted": ["intencion", "presupuesto", "zona"],
  "skipped": [
    { "field_key": "frutadelmes", "reason": "unknown_field" }
  ],
  "warnings": [
    { "field_key": "intencion", "warning": "coerce_warning_enum_no_match",
      "value": "yo no sé qué quiero", "options": ["explorar","comparar","decidir","avanzar"] }
  ]
}
```

**Logging server-side (sin secrets):**
- `console.log({ event: 'extractor.write', agency_id, lead_id, conversation_id, upserted_count, skipped_count, warnings_count })`. NO loggear los valores (PII potencial).
- `console.warn(...)` por cada skip/warning con `field_key` (sin value).

### 4.3 Pseudocódigo TypeScript completo (referencia para el builder)

```typescript
// crm-v2/supabase/functions/bot-actions/index.ts
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BOT_ACTIONS_SECRET = Deno.env.get('BOT_ACTIONS_SECRET');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  // 1. Envelope auth + method
  if (!BOT_ACTIONS_SECRET) {
    console.error('BOT_ACTIONS_SECRET not configured');
    return new Response('server misconfigured', { status: 500 });
  }
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  if (req.headers.get('authorization') !== `Bearer ${BOT_ACTIONS_SECRET}`) {
    return new Response('unauthorized', { status: 401 });
  }

  // 2. Parse + envelope validation
  let body: any;
  try { body = await req.json(); } catch { return new Response('invalid json', { status: 400 }); }
  const { operation, agency_id, lead_id, conversation_id, params } = body ?? {};
  if (!operation) return json({ ok: false, error: 'missing operation' }, 400);
  if (!agency_id) return json({ ok: false, error: 'missing agency_id' }, 400);
  if (!lead_id)   return json({ ok: false, error: 'missing lead_id' }, 400);

  // 3. Cross-tenant defense
  const { data: lead, error: leadErr } = await supabase
    .from('leads').select('id, agency_id').eq('id', lead_id).maybeSingle();
  if (leadErr || !lead) return json({ ok: false, error: 'lead_not_found' }, 404);
  if (lead.agency_id !== agency_id) return json({ ok: false, error: 'lead_not_in_agency' }, 403);

  // 4. Global toggle (D2)
  const { data: ag } = await supabase
    .from('agencies').select('settings').eq('id', agency_id).maybeSingle();
  const extractorDisabled = ag?.settings?.bot_extractor_enabled === false;
  if (extractorDisabled && operation === 'extractor.write') {
    return json({ ok: true, skipped: 'extractor_disabled_by_settings' });
  }

  // 5. Router
  const ctx = { agency_id, lead_id, conversation_id };
  switch (operation) {
    case 'extractor.write':
      return await handleExtractorWrite(params, ctx);
    case 'stage.set':
    case 'qualify.set':
    case 'assign.set':
    case 'tag.add':
    case 'note.write':
    case 'handoff.escalate':
      return json({ ok: true, skipped: 'operation_not_implemented_yet', operation, phase: 'F4' });
    default:
      return json({ ok: true, skipped: 'unknown_operation', operation });
  }
});

async function handleExtractorWrite(params: any, ctx: any) {
  const fields = Array.isArray(params?.fields) ? params.fields.slice(0, 20) : [];
  if (!fields.length) return json({ ok: true, upserted: [], skipped: [], warnings: [] });

  const upserted: string[] = [];
  const skipped: any[] = [];
  const warnings: any[] = [];

  for (const f of fields) {
    const field_key = String(f?.field_key ?? '').trim();
    if (!field_key) { skipped.push({ reason: 'empty_field_key' }); continue; }

    const { data: def, error: defErr } = await supabase
      .from('extractor_field_defs')
      .select('id, field_type, options')
      .eq('agency_id', ctx.agency_id)
      .eq('field_key', field_key)
      .eq('is_active', true)
      .maybeSingle();

    if (defErr || !def) { skipped.push({ field_key, reason: 'unknown_field' }); continue; }

    const { coerced, warning } = coerceValue(f.value, def.field_type, def.options);
    if (warning) warnings.push({ field_key, warning, value: f.value, options: def.options });

    if (coerced === null || coerced === '') {
      skipped.push({ field_key, reason: 'empty_value' });
      continue;
    }

    const { error: upErr } = await supabase
      .from('extractor_field_values')
      .upsert({
        agency_id: ctx.agency_id,
        lead_id: ctx.lead_id,
        field_def_id: def.id,
        value: coerced,                  // jsonb (la lib serializa)
        extracted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'lead_id,field_def_id' });

    if (upErr) {
      console.error('upsert_failed', { field_key, error: upErr.message });
      skipped.push({ field_key, reason: 'db_error' });
      continue;
    }
    upserted.push(field_key);
  }

  console.log({ event: 'extractor.write', agency_id: ctx.agency_id, lead_id: ctx.lead_id,
                conversation_id: ctx.conversation_id, upserted: upserted.length,
                skipped: skipped.length, warnings: warnings.length });

  return json({ ok: true, upserted, skipped, warnings });
}

function coerceValue(raw: any, type: string, options: any[] | null) {
  if (raw === null || raw === undefined) return { coerced: null };
  switch (type) {
    case 'text': return { coerced: String(raw).trim() };
    case 'number': {
      const n = Number(raw);
      return Number.isFinite(n)
        ? { coerced: n }
        : { coerced: String(raw), warning: 'coerce_warning_not_a_number' };
    }
    case 'boolean':
      return { coerced: raw === true || raw === 'true' || raw === 1 || raw === '1' };
    case 'date': {
      const d = new Date(raw);
      return isNaN(d.getTime())
        ? { coerced: String(raw), warning: 'coerce_warning_invalid_date' }
        : { coerced: d.toISOString() };
    }
    case 'enum': {
      const s = String(raw).trim();
      if (Array.isArray(options) && options.length && !options.includes(s)) {
        return { coerced: s, warning: 'coerce_warning_enum_no_match' };
      }
      return { coerced: s };
    }
    default: return { coerced: raw };
  }
}
```

---

## 5. Tool node `Extractor Tool (bot-actions)` — configuración n8n

### 5.1 toolDescription literal (este texto se lo come el LLM directo — calibrar bien)

```text
Guardá datos REALES que el lead reveló sobre sí mismo o sobre lo que necesita
(intención, presupuesto, urgencia, zona, objeciones, datos clave, próximo paso, etc.).
USALA apenas el lead DA un dato relevante, en ese mismo turno.
NO la uses para datos que el lead PREGUNTA o para info que vos le diste a él.
NO inventes datos: solo lo que el lead dijo explícitamente en sus palabras.
Podés pasar varios campos juntos en una sola llamada (es preferible: menos latencia).
Cada campo: field_key (uno de los listados en ## DATOS A CAPTURAR del prompt) y value.
Si la tool falla o devuelve error, NO abortes la respuesta al lead: seguí conversando
normal, el dato se re-extrae el próximo turno.
```

### 5.2 Configuración del nodo (parámetros completos)

```yaml
type: '@n8n/n8n-nodes-langchain.toolHttpRequest'
typeVersion: 1.1
name: 'Extractor Tool (bot-actions)'
parameters:
  toolDescription: <ver §5.1>
  method: POST
  url: '={{ $env.SUPABASE_V2_URL }}/functions/v1/bot-actions'
  authentication: none           # auth se hace por header manual, no por el campo Authentication
  sendHeaders: true
  headerParameters:
    parameters:
      - name: Authorization
        value: '=Bearer {{ $env.BOT_ACTIONS_SECRET }}'
      - name: Content-Type
        value: application/json
  sendBody: true
  specifyBody: json
  jsonBody: |
    ={
      "operation": "extractor.write",
      "agency_id": "{{ $('Resolve Agency').first().json.agency_id }}",
      "lead_id": "{{ $('Buscar Lead (Supabase)').first().json.id }}",
      "conversation_id": "{{ $('Get Conversation State').first().json.id }}",
      "params": {
        "fields": {{ $fromAI('fields', 'Lista JSON de objetos {field_key, value} con los datos que el lead REVELÓ en este turno. field_key debe ser EXACTAMENTE uno de los listados en la sección ## DATOS A CAPTURAR del system prompt — no inventes nombres nuevos. value puede ser string, number, boolean, array u objeto, según el field_type listado.', 'json') }}
      }
    }
  optimizeResponse: false
```

**Notas críticas al builder (NO obvias):**
- `agency_id` / `lead_id` / `conversation_id` van **del flujo**, NUNCA por `$fromAI` (gotcha skill `n8n-properties-search-tool-pattern`: el LLM puede inventar UUIDs si los expones a su libre llenado).
- El único `$fromAI` es `fields` — y su descripción (segundo arg) es lo que el LLM lee para decidir el formato. Mantenerla específica (mencionar EXACTAMENTE los `field_key` del prompt → previene `field_key` inventados; mencionar que value respeta `field_type` → previene strings cuando se esperaban numbers).
- Auth header LITERAL: `=Bearer {{ $env.BOT_ACTIONS_SECRET }}` (el `=` inicial activa expresión n8n). NUNCA hardcodear el secret en el JSON.
- `optimizeResponse: false` — queremos que el response JSON crudo entre al agente para que pueda razonar sobre `skipped`/`warnings` si quisiera (típicamente lo ignora, lo cual está bien). Si `true`, n8n intenta convertir a markdown y arruina el contrato.
- **`SUPABASE_V2_URL` debe existir como env var de n8n** (P1 §9). Si no, hardcodear `https://fahujscodhqlopycorzn.supabase.co` con comentario; preferible la env var.
- **Nombre exacto `Buscar Lead (Supabase)` con paréntesis y mayúsculas.** Si la referencia falla, el `n8n-expression-validator` lo detecta como violation.

---

## 6. Modificación al Code node `Componer System Prompt`

El jsCode actual vive en `memory/research/13-bot-v6-compositor-code.md` entre markers `<!-- COMPOSITOR_V6_START -->` / `<!-- COMPOSITOR_V6_END -->`. El builder edita ese archivo (la fuente de verdad) y el script de build lo re-extrae.

### 6.1 Lo único que cambia

Líneas 152-167 del archivo de research (bloque `## DATOS A CAPTURAR`). Hoy dice:

```js
// [DATOS A CAPTURAR] — INERTE en F1 (sin tool extractor; es solo contexto)
const defs = Array.isArray(ctx.extractor_field_defs) ? ctx.extractor_field_defs : [];
if (defs.length) {
  const lines = defs.map(function (d) {
    let line = '- ' + d.field_key + ' (' + d.field_type + '): ' + (d.label || '');
    if (d.extraction_hint) line += ' — ' + d.extraction_hint;
    if (d.options) line += ' Opciones: ' + JSON.stringify(d.options);
    return line;
  });
  blocks.push(
    '## DATOS A CAPTURAR\n'
    + 'Si el lead revela alguno de estos datos, tenelos presentes en la conversación '
    + '(en esta fase NO hay herramienta de guardado todavía; solo usalos como contexto). '
    + 'Extraé solo lo explícito, no inventes.\n'
    + lines.join('\n')
  );
}
```

**Reemplazar por:**

```js
// [DATOS A CAPTURAR] — ACTIVO en F2 (instrucción de llamar la tool extraer_datos)
const defs = Array.isArray(ctx.extractor_field_defs) ? ctx.extractor_field_defs : [];
if (defs.length) {
  const lines = defs.map(function (d) {
    let line = '- ' + d.field_key + ' (' + d.field_type + '): ' + (d.label || '');
    if (d.extraction_hint) line += ' — ' + d.extraction_hint;
    if (d.options) line += ' Opciones: ' + JSON.stringify(d.options);
    return line;
  });
  blocks.push(
    '## DATOS A CAPTURAR\n'
    + 'Cuando el lead REVELE alguno de estos datos en su mensaje, llamá la herramienta '
    + '`extraer_datos` (tool Extractor Tool (bot-actions)) con la lista de campos extraídos. '
    + 'Usá EXACTAMENTE los field_key listados abajo, no inventes nombres nuevos. '
    + 'Llamala SOLO cuando el lead DA un dato (no cuando pregunta, no cuando vos le das info). '
    + 'Podés pasar varios campos juntos en una sola llamada — es preferible. '
    + 'Extraé únicamente lo explícito; si dudás del valor, no lo mandes.\n'
    + lines.join('\n')
  );
}
```

**Comentario del bloque arriba (línea 23 del archivo de research)** también se actualiza para reflejar F2: cambiar `INERTE en F1` por `ACTIVO en F2`.

### 6.2 Cambios al script de build

El builder ya tiene `scripts/build-bot-v6-v1.js` que extrae markers. F2 produce `scripts/build-bot-v6-v2.js` (NUEVO, parte del v1):

- Lee el v1 JSON como base.
- Re-extrae el compositor del archivo de research actualizado (`13-bot-v6-compositor-code.md` con el nuevo bloque DATOS A CAPTURAR).
- Inserta el nodo `Extractor Tool (bot-actions)` con la config de §5.2.
- Agrega la conexión `ai_tool` desde el nodo nuevo al `Agente Principal - Sofia`.
- Fuerza `active:false` en el output.
- Valida con `JSON.parse` + corre `scripts/validate-n8n-expressions.js` (0 violations).

Output: `n8n/workflows/chatbot-momentum-bot-v6-v2.json`.

---

## 7. Decisiones que requieren confirmación del founder

| # | Decisión | Recomendación architect | Por qué |
|---|---|---|---|
| **D-A** | ¿El extractor se gatea por `settings.auto_actions.*` (como F4) o queda siempre on con flag propio opcional `settings.bot_extractor_enabled`? | **Siempre on, flag propio opcional** (default true). | Captura de datos = lectura silenciosa que enriquece Insights internos; NUNCA afecta lo que el cliente ve en el chat. Los toggles `auto_actions` son para acciones mutantes visibles (cambio de etapa, calificación, etc.). Apagar el extractor por defecto destruye el moat sin razón. El flag propio queda como kill-switch raro para clientes que pidan máxima privacidad / no quieran analytics. |
| **D-B** | ¿Agregar columna `extracted_by text DEFAULT 'bot'` a `extractor_field_values` ahora (migración aditiva) o postergar a F4? | **Postergar a F4.** | En F2 NO hay otro path que escriba esta tabla (solo `bot-actions` → siempre 'bot'). La columna no aporta info nueva todavía. F4 puede agregarla si un humano del CRM también puede setear campos extractor manualmente desde Insights (decisión de producto pendiente). Evita migración innecesaria. |
| **D-C** | ¿Implementar rate limit en `bot-actions` (ej. máx 30 calls/min por agency)? | **NO en F2.** | El secret no es público; solo n8n llama. El cap de 20 fields por call ya limita la escritura por turno. Si en F4 se agregan auto-acciones que un mal prompt podría disparar en loop, evaluar entonces. Documentado como riesgo R5. |
| **D-D** | Si el founder eligió Opción B de F1 (desconectar `Request Handoff Tool`), ¿F2 lo reconecta o sigue desconectada? | **F2 lo deja como esté.** | F2 toca SOLO extractor. La reconexión del handoff es F4. Esta spec no agrega/quita conexiones de la handoff tool. |

---

## 8. Variables de entorno requeridas

| Var | Para qué | Dónde se setea | Estado |
|---|---|---|---|
| `BOT_ACTIONS_SECRET` | Auth Bearer de la tool `extraer_datos` (y futuras acciones F4) → edge function. Mínimo 32 chars hex (`openssl rand -hex 32`). | **Supabase Edge Function Secrets v2** + **N8N env vars** (mismo valor, exactamente igual). | NUEVA — el founder la genera y setea (P1 §9). |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | `bot-actions` escribe con service_role. | Supabase Edge Function Secrets (auto-inyectadas). | ✅ ya existe. |
| `SUPABASE_V2_URL` | URL base del proyecto v2 usada por el tool node n8n (`{{ $env.SUPABASE_V2_URL }}/functions/v1/bot-actions`). Si no querés env var, hardcodear `https://fahujscodhqlopycorzn.supabase.co`. | N8N env vars. | Verificar si ya está (lo introdujo F1 si se siguió esa spec). |

---

## 9. Cambios fuera del workflow (solo lista, NO implementar acá)

1. **Generar secret:** `openssl rand -hex 32` → `BOT_ACTIONS_SECRET`. Setear en Supabase v2 Edge Function Secrets + N8N env vars.
2. **Crear edge function `bot-actions`:** archivo `crm-v2/supabase/functions/bot-actions/index.ts` con código §4.3. Deploy `supabase functions deploy bot-actions --no-verify-jwt`. (Backend-builder / supabase-edge-function skill.)
3. **Verificar columnas reales** de `extractor_field_defs` (`id, field_key, field_type, options, is_active, agency_id`) y de `extractor_field_values` (`agency_id, lead_id, field_def_id, value jsonb, extracted_at, updated_at`, UNIQUE `(lead_id, field_def_id)`) → ya confirmadas en migración 0005 leída.
4. **(Opcional) Seed adicional de defs por nicho** — solo si Robert/fisio necesita campos extra más allá de los 7 core. F2 NO requiere esto; los 7 core son suficientes para validar el flujo.
5. **(Opcional D-A on)** Migración aditiva para `settings.bot_extractor_enabled` no necesaria — `settings` es jsonb existente, solo se lee defensivamente.

---

## 10. Riesgos previstos (mínimo 3 — OBLIGATORIO)

1. **El LLM llama `extraer_datos` de más / de menos (probabilidad MEDIA, costo alto).** "De más" = cada turno trivial → ruido + tokens. "De menos" = pierde datos clave porque el prompt no fue claro. **Mitigación:** (a) toolDescription explícita §5.1 con "solo cuando DA un dato, no cuando pregunta"; (b) bloque `## DATOS A CAPTURAR` del compositor refuerza la regla; (c) upsert idempotente (un llamado de más con mismo value no crea duplicados); (d) skip silencioso (no rompe nada). **Monitoreo F2:** revisar logs de `bot-actions` post-tests para calibrar si el LLM llama bien.

2. **LLM alucina `field_key` inexistentes (probabilidad MEDIA-ALTA en defs no-obvias).** "presupuesto" vs "budget", "intencion" vs "intent". **Mitigación doble:** (a) `## DATOS A CAPTURAR` lista los `field_key` EXACTOS con su `field_type`; (b) `bot-actions` skip silencioso + warning loguea cada unknown_field. Nunca rompe schema, nunca rompe conversación. **Iteración esperada:** si los logs muestran muchos `unknown_field`, ajustar nombres en seed (más natural-language) o reforzar la regla en toolDescription.

3. **Cross-tenant write si el workflow se mal-configura (probabilidad BAJA — alto impacto).** Si el workflow llamara `bot-actions` con `agency_id` de A y `lead_id` de B, el extractor escribiría en lead de otra agency. **Mitigación:** defensa server-side §4.1 paso 6 (`lead.agency_id === input.agency_id`); response 403 si no matchea. Reviewer walkthrough escenario K.

4. **Edge function caída / 401 por secret mal sincronizado (probabilidad MEDIA al inicio).** Secret en Supabase distinto al de N8N. **Mitigación:** (a) el agente NO aborta por error de tool (regla universal capa A núcleo + toolDescription §5.1); (b) el lead nunca ve error; (c) verificación manual del founder: hacer un POST con curl + secret de N8N → debe dar 200 (sin body válido, 400 está bien; lo importante es NO 401). Reviewer escenario H.

5. **Loop tool ↔ agente que infla costos (probabilidad BAJA con cap).** Si el agente llama la tool, el response no es lo que esperaba, y vuelve a llamarla, podría loopear. **Mitigación:** (a) toolDescription dice "si falla, seguí conversando, no reintentes"; (b) cap de 20 fields por call; (c) el agente LangChain de n8n tiene su propio cap de iterations por turno (verificar valor — típicamente 5-10). Bajo riesgo dado D5 (multi-field por call ya minimiza llamadas).

6. **Tokens/latencia inflados por el bloque `## DATOS A CAPTURAR` con muchas defs (probabilidad BAJA-MEDIA).** Si una agency tiene 30+ defs (core + 5 módulos), el bloque puede pesar 1-2k tokens en cada turno. **Mitigación:** F2 actual = 7 defs core (manejable). Cuando se construyan módulos (F5+), evaluar paginación o solo-relevantes-según-flow (fuera de F2). Monitorear.

7. **`value` jsonb con tipos raros rompe el upsert (probabilidad BAJA).** Si el LLM manda `value` como objeto anidado para un def `field_type=text`, la coerción string da `[object Object]` — feo pero no rompe. **Mitigación:** coerción §4.2 nunca tira excepción; siempre devuelve algo serializable o warning. Reviewer escenario M.

8. **Builder pega el secret en el JSON del workflow (probabilidad BAJA, impacto alto si pasa).** Si alguien copia el valor literal en `Authorization: Bearer abc123...` en lugar de la expresión, el secret queda en el JSON commiteado. **Mitigación:** §5.2 instrucción explícita; reviewer Check 9 (grep del workflow buscando strings de 32+ chars hex). NO commitear secret nunca.

---

## 11. Casos edge a contemplar (mínimo 4 — OBLIGATORIO)

1. **Happy path — lead da 3 datos en un turno.** Lead: "ando buscando algo en Escazú para mí y mi pareja, 250 mil máximo, urgente porque ya nos vencen donde estamos". El agente clasifica perfil + responde + llama `extraer_datos` con `[{intencion:"avanzar"}, {zona:"Escazú"}, {presupuesto:250000}, {urgencia:"alta"}]`. `bot-actions` upsertea 4 filas, devuelve `{ok:true, upserted:[4 keys]}`. Panel Insights del lead muestra los 4 valores. **Verificable:** SELECT en `extractor_field_values` por `lead_id` → 4 filas.

2. **Lead curioso / info-only que NO da datos.** "qué hacen ustedes?". El agente responde con `business_info` del bot_config, NO llama `extraer_datos` (porque la regla del prompt/toolDescription dice "solo cuando DA"). **Verificable:** logs del edge function sin entries para ese turno; tabla sin filas nuevas.

3. **Lead da un dato, el agente alucina field_key.** Lead: "tengo presupuesto de 200 mil". Agente llama `extraer_datos` con `[{field_key:"budget", value:200000}]`. `bot-actions` skip silencioso (def es `presupuesto`, no `budget`), responde `{ok:true, upserted:[], skipped:[{field_key:"budget", reason:"unknown_field"}]}`. **Verificable:** log warn server-side `unknown_field`, NO se crea def nueva, lead NUNCA ve error, conversación sigue normal. Reviewer ajusta toolDescription si pasa repetido.

4. **Lead frustrado / pide humano.** "ya me cansaste, quiero hablar con una persona". El `Detector de Descalificacion` dispara handoff por anti-loop (camino independiente del extractor). El agente PUEDE en el mismo turno extraer algo (ej. `[{objeciones:"frustración con cuestionario"}]`) — válido y útil para el handoff context — pero NO es requerido. **Verificable:** `conversations.handler='human'` + posiblemente fila nueva en extractor con objeción. Bot se silencia siguientes turnos.

5. **Tool falla — edge function caída / 401 / timeout.** `bot-actions` devuelve no-200 o no responde en N segundos. El agente recibe el error como tool output. **Comportamiento esperado:** sigue conversando normalmente con el lead (regla capa A núcleo + toolDescription §5.1). Lead NUNCA ve error técnico. El dato se re-extrae el próximo turno (idempotencia D6). **Verificable:** matar temporalmente `bot-actions` (rotar secret en Supabase sin actualizar n8n) → mandar mensaje con datos → bot responde igual; restaurar secret → próximo mensaje con mismos datos → upsert exitoso.

6. **Lead manda audio / imagen / link.** El switch `Is Text or Audio or Image?` normaliza ANTES del agente. Audio → Whisper → texto. La extracción opera sobre la transcripción. Imagen → mensaje placeholder ("mandó foto"), el agente puede extraer "datos clave: lead envió foto de su lesión" o nada (depende del prompt). **Verificable:** sin cambios vs F1; el contrato del extractor no depende del tipo de input.

7. **Lead da el mismo dato 2 veces en turnos distintos.** Turno 1: "Escazú". Turno 5: "ah, y aclaro, Escazú centro, no Bajos". Llamadas: turno 1 upsertea `{zona:"Escazú"}`, turno 5 upsertea `{zona:"Escazú centro"}` (UPSERT por UNIQUE → UPDATE, `updated_at=now()`). **Resultado esperado:** una sola fila en `extractor_field_values` con el valor más reciente. Panel Insights refleja último valor (decisión simple, sin histórico — si el founder quiere histórico, F4+).

8. **Lead da un valor que no matchea un enum.** Def `intencion` con `options=["explorar","comparar","decidir","avanzar"]`. Lead: "yo no sé qué quiero todavía". Agente llama `[{field_key:"intencion", value:"no sé"}]`. `bot-actions` upsertea `"no sé"` como string crudo + warning `coerce_warning_enum_no_match`. **Verificable:** fila escrita con value="no sé", log warning. Panel Insights muestra el valor crudo. Reviewer puede después decidir si agregar opciones o si el LLM debe mapear (ajuste de prompt, no de código).

9. **Lead no resolvible (Buscar Lead devuelve vacío).** El workflow tiene `Lead Encontrado?` que aborta antes del agente si no hay lead. Pero por defensa: si por bug llegara al edge function con `lead_id` inválido, `bot-actions` paso 3 devuelve 404 `lead_not_found`. Bot ignora, sigue conversando. **Probabilidad:** muy baja (gate upstream). Documentado por defensa en profundidad.

10. **Agency con `bot_extractor_enabled=false` en settings.** Lead da datos, agente llama tool, `bot-actions` toggle gate responde `{ok:true, skipped:'extractor_disabled_by_settings'}`. Bot NO escribe nada. **Verificable:** SELECT por lead → 0 filas nuevas. Útil para clientes con requerimientos de privacidad estrictos.

---

## 12. Triggers de handoff (si el cambio los toca)

**F2 NO modifica triggers de handoff.** El extractor es ortogonal al handoff: puede haber extracción sin handoff (caso 1), handoff sin extracción (caso 4 sin objeción), o ambos simultáneos (caso 4 con objeción extraída). El `Detector de Descalificacion` sigue siendo el único disparador en F2.

Nota operacional: si el founder eligió Opción B en F1 (desconectar `Request Handoff Tool`), F2 NO la reconecta. La reconexión + el enum configurable de `reason` por agency = F4 (operation `handoff.escalate` de `bot-actions`, ya con placeholder 501 en el router).

---

## 13. Tests manuales que el reviewer/founder debe correr

**Pre-flight (P1-P3 de §9 cumplidos):**
- A. **Smoke test del edge function (sin tool):** `curl -X POST https://<v2>.supabase.co/functions/v1/bot-actions -H "Authorization: Bearer $BOT_ACTIONS_SECRET" -H "Content-Type: application/json" -d '{"operation":"extractor.write","agency_id":"<demo>","lead_id":"<lead-real>","params":{"fields":[{"field_key":"presupuesto","value":250000}]}}'` → debe devolver `{ok:true, upserted:["presupuesto"], skipped:[], warnings:[]}`. Verificar fila en DB.
- B. **Smoke test 401:** mismo curl SIN header `Authorization` → 401.
- C. **Smoke test cross-tenant:** mismo curl con `agency_id` distinto al del lead → 403 `lead_not_in_agency`.

**Tests end-to-end (workflow activo):**
- D. **Happy path:** mandar WhatsApp al `50689839490` con "busco fisio para mi espalda, presupuesto 50 mil al mes, urgente". Esperar respuesta del bot. Verificar `extractor_field_values` por lead → filas con intencion/presupuesto/urgencia (o equivalentes según seed real).
- E. **Info-only:** mandar "qué hacen?". Bot responde, NO debe escribir en extractor.
- F. **Multi-turno UPSERT:** mandar "zona Escazú", esperar; mandar "perdón, Escazú centro", esperar. Verificar UNA sola fila zona con valor "Escazú centro" y `updated_at` actualizado.
- G. **Frustración:** "ya me cansé, quiero a Robert". Verificar handoff + (opcional) fila objeciones.
- H. **Tool caída:** rotar `BOT_ACTIONS_SECRET` en Supabase sin actualizar n8n. Mandar mensaje con datos. Bot debe responder igual al lead (sin mostrar error). Restaurar secret. Mandar de nuevo. Verificar upsert.
- I. **Validator:** `node scripts/validate-n8n-expressions.js n8n/workflows/chatbot-momentum-bot-v6-v2.json` → 0 violations.
- J. **Audit logs:** revisar `supabase functions logs bot-actions --limit 50` post-tests; confirmar entries con `event: 'extractor.write'`, sin secrets logueados, sin stack traces.
- K. **Toggle off:** UPDATE agency setteando `settings = settings || '{"bot_extractor_enabled":false}'::jsonb`. Mandar mensaje con datos. Bot responde, edge function recibe pero skipea. Verificar 0 filas nuevas. Revertir setting.

---

## 14. Handoff al builder

- **Archivos a crear/modificar:**
  - **NUEVO:** `crm-v2/supabase/functions/bot-actions/index.ts` (código §4.3, deploy `--no-verify-jwt`).
  - **MODIFICAR:** `memory/research/13-bot-v6-compositor-code.md` — cambiar el bloque `## DATOS A CAPTURAR` por el de §6.1 (mantener markers `<!-- COMPOSITOR_V6_START/END -->` intactos). Actualizar comentario línea 23.
  - **NUEVO:** `scripts/build-bot-v6-v2.js` (parte del v1 JSON, re-extrae compositor actualizado, agrega tool node + conexión `ai_tool`, fuerza `active:false`, valida).
  - **OUTPUT:** `n8n/workflows/chatbot-momentum-bot-v6-v2.json`.

- **Notas especiales al builder (NO obvias):**
  1. **El secret NUNCA va literal en el JSON.** Solo `=Bearer {{ $env.BOT_ACTIONS_SECRET }}` (expresión n8n). Si el secret aparece en el JSON commiteado, está comprometido. Reviewer Check: grep del JSON por strings de 32+ hex.
  2. **`agency_id`, `lead_id`, `conversation_id` van del FLUJO, NUNCA por `$fromAI()`.** Solo `fields` es `$fromAI`. Gotcha conocida — skill `n8n-properties-search-tool-pattern`.
  3. **`optimizeResponse: false`** — sin esto n8n convierte el JSON response a markdown y arruina el contrato.
  4. **No tocar la query maestra** — F1 ya trae todo. Si querés agregar columnas al output de `extractor_field_defs`, requiere actualizar también el compositor (cuidado de no romper F1).
  5. **El router del edge function debe responder 200 también para `skipped` / `unknown_operation` / `operation_not_implemented_yet`.** El agente LangChain NO debe abortar el turno por una tool que devuelve 4xx — eso solo es para envelope malformado / auth fail / cross-tenant.
  6. **Deploy con `--no-verify-jwt` explícito.** Sin el flag, Supabase Gateway rechaza el request antes de tu validación Bearer.
  7. **`active:false` forzado en el JSON output.** El founder activa después de smoke tests A-C.
  8. **Si el founder eligió Opción B en F1 (handoff desconectado)**, F2 NO toca eso. Solo agrega Extractor.
  9. **Confirmá decisiones D-A y D-B del §7 con el founder ANTES de construir.** D-A define si implementás el toggle `bot_extractor_enabled` (10 líneas más de código); D-B confirma que NO hay migración nueva en F2.

- **Dependencia de prompt-designer:** el contenido del bloque `## DATOS A CAPTURAR` (header + instrucción de uso de la tool) lo escribí YO acá (§6.1 texto literal) porque es prosa corta y cableada al diseño del edge function. NO requiere intervención del prompt-designer salvo que el founder quiera variantes de tono. Los `field_key` y `extraction_hint` reales viven en el seed de `extractor_field_defs` — si Robert quiere ajustarlos, es edición de DB, no de prompt.

- **Validación post-build:**
  1. `JSON.parse` del workflow output.
  2. `node scripts/validate-n8n-expressions.js n8n/workflows/chatbot-momentum-bot-v6-v2.json` → 0 violations.
  3. Smoke tests A-C de §13 (sin tocar n8n).
  4. Si pasa todo, entregar al `n8n-reviewer` con la skill `n8n-workflow-audit` (checklist 15 puntos).
