# Spec: Cablear bot_config en runtime + Extractor + Atribución (Prompt Compositor vivo)

**Fecha:** 2026-05-29
**Autor:** n8n-architect
**Workflow afectado:** `n8n/workflows/chatbot-inmobiliaria-demo-ycloud-sofia-v5.4-v2db.json` (base portada al schema v2, id N8N `yqSol7HvYrR9Pl1A`)
**Versión actual → propuesta:** Sofia v5.4-v2db (prompt hardcodeado, sin extractor, sin atribución) → **bot-v6 v1** (`chatbot-momentum-bot-v6-v1.json`)
**Trigger del cambio:** Nueva feature. El Panel Admin ya guarda `agencies.bot_config` por negocio; falta que el bot LO LEA en runtime y SE ADAPTE, y que de la misma pasada ESCRIBA inteligencia extraída (`extractor_field_values`) + atribución (`leads.attribution`) para que Insights y Dashboard de Embudo corran sobre data real, no sembrada.

---

## 0. Resumen ejecutivo

Esta spec convierte el Sofia v5.4-v2db (un bot inmobiliario con prompt hardcodeado en n8n) en un **bot genérico multi-tenant que se configura solo desde la DB**. Cubre dos mitades que comparten UNA misma pasada de "cargar contexto de la agency":

1. **Adaptación por negocio (lectura):** el bot resuelve `agency_id` por el número (`agency_channels`), carga `bot_config` + `settings` + `pipeline_stages` + `extractor_field_defs` + fragmentos de módulos en **una sola query**, y **compone el system prompt en runtime** (Prompt Compositor) replicando conceptualmente `composePreview()` de `crm-v2/src/lib/admin/bot-config.ts`.

2. **Inteligencia escrita (escritura — el "boom"):** cada turno el bot extrae los campos definidos en `extractor_field_defs` y los persiste en `extractor_field_values` (procedencia `'bot'`), y el intake captura el objeto `referral` de los anuncios click-to-WhatsApp de Meta y lo escribe en `leads.attribution`.

**Decisión rectora:** UN solo workflow genérico multi-tenant (NO uno por cliente). Refina el spec `04-bot-v6-conexion-whatsapp.md` (Prompt Compositor §5, tools §4) en vez de reinventarlo.

**Dato que cambia supuestos previos:** el bot Sofia **NO está en producción** (confirmado founder 2026-05-29). El doc 04 que dice "Sofia v5.5 en producción" está desactualizado. **No hay riesgo de romper un bot vivo** → se construye y prueba con libertad; no se exige número de prueba separado por miedo a prod (sí se mantiene la disciplina multi-tenant).

**Las 3 decisiones de diseño más importantes:**

- **D1 — El Compositor es UN Code node nuevo (`Componer System Prompt`)** que concatena 4 fuentes (núcleo fijo `bot_prompt_templates` core + capas `bot_config` renderizadas exactamente como `composePreview` + fragmentos de módulos + reglas finales `system_rules`) e inyecta el resultado en el campo `system message` del LangChain Agent vía expresión. Esto mata el prompt hardcodeado del v5.4.
- **D2 — El Extractor es una TOOL del agente (`extraer_datos`), NO output estructurado separado.** Se invoca contra la Edge Function `bot-actions` (router, secret auth, service_role, procedencia `'bot'`). Razón: reusa la doble capa de toggles/procedencia ya decidida en doc 04 §4, evita un segundo parser frágil, y upsertea por `(lead_id, field_def_id)` en un solo lugar auditado.
- **D3 — La Atribución se captura en el Edge Function de intake (`ycloud-webhook`), NO en n8n.** El objeto `referral` de Meta solo viene en el webhook inbound; n8n recibe un payload ya normalizado. Se escribe con **merge no destructivo** (`attribution = leads.attribution || nuevo` solo si el lead no tenía atribución previa con `ad_id`), para no pisar la atribución del primer toque.

**Plan de fases (resumen):** F1 Compositor en runtime (ver el bot adaptarse al `bot_config` del demo) → F2 Extractor como tool → F3 Atribución en intake → F4 Auto-acciones con toggles + módulos. F1 es el primer entregable visible: cambiás el tono en el Panel Admin y el bot cambia de personalidad sin tocar n8n.

---

## 1. Problema / requerimiento

El Panel Admin (master) ya persiste, por negocio, las capas configurables del prompt en `agencies.bot_config` (jsonb tipado: `business_info`, `tone`, `sales_close_behavior`, `conversation_flow`, `custom_instructions`). Pero el bot de n8n (Sofia v5.4-v2db) tiene el prompt **hardcodeado** y es inmobiliario fijo: ignora por completo esa config. Además NO escribe los datos extraídos en `extractor_field_values` (sigue dependiendo del `bot_reasoning` jsonb estilo v1) ni captura atribución de campañas. Resultado: los Insights por contacto y el Dashboard de Embudo del CRM corren sobre **data sembrada**, no sobre lo que el bot realmente entiende y atribuye.

El objetivo es cablear el bot a la DB en runtime: que **lea** la config y se adapte por negocio, y que de la misma pasada **escriba** la inteligencia (extracción + atribución), para que el CRM muestre datos reales.

---

## 2. Estado actual relevante (nodos del Sofia v5.4-v2db que se ven afectados)

Citando nombres exactos del workflow portado (ver `2026-05-29-port-sofia-v5.4-a-schema-v2.md`):

| Nodo existente | Tipo | Estado actual | Qué le pasa en esta spec |
|---|---|---|---|
| `Resolve Agency` | postgres (executeQuery) | Resuelve `agency_id` + `bot_enabled` por número (v2). | **Se MODIFICA y absorbe en una query maestra** (§3.6, query `Cargar Contexto Agency`). |
| `Buscar Lead (Supabase)` | postgres (executeQuery) | Trae el lead por phone. | Se conserva; se le suman columnas de procedencia para que el agente sepa quién seteó qué. |
| `Get Conversation State` | postgres | handler/bot_paused_until/handoff. | Sin cambios. |
| `Chatbot Activado?` | if | Gating bot. | Sin cambios. |
| `Agente Principal - Sofia` | langchain.agent | **system prompt HARDCODEADO inmobiliario v5.4.** | **Se MODIFICA:** su `system message` pasa a ser `={{ $('Componer System Prompt').first().json.system_prompt }}`. Pierde el texto fijo. |
| `Postgres Chat Memory - Sofia` | langchain.memoryPostgresChat | session_id estable. | Sin cambios (skill `n8n-langchain-agent-postgres-memory`). |
| `Detector de Descalificacion` | langchain.informationExtractor | anti-loop. | Sin cambios (skill `bot-anti-loop-detector`). |
| `Expand Property Images` | code | Marker `[IMG:CR-XXXX]` → fail-safe; `PROPERTIES_MODULE_ENABLED=false`. | Sin cambios en esta spec (módulo properties es F5 fuera de alcance). |
| `Apagar Chatbot — Conversation` / `— Lead Summary` | postgres | handoff. | Sin cambios. |

**Hallazgos heredados del port (relevantes acá):**
- El agente NO tiene tools `ai_tool` conectadas hoy. **Esta spec agrega la primera tool real conectada al agente: `extraer_datos`** (y sienta el patrón para las auto-acciones de F4).
- `session_id` = `ID + "@" + businessPhone`. No cambia.
- El prompt v5.4 lee `message_count` con `|| 0`; esa columna no existe en v2 a propósito. No tocar.

---

## 3. Cambio propuesto

### 3.1 Nodos a CREAR

| Nombre | Type | typeVersion | Posición aprox. | Propósito / parámetros críticos |
|---|---|---|---|---|
| `Cargar Contexto Agency` | `n8n-nodes-base.postgres` (executeQuery) | 2.5 | reemplaza a `Resolve Agency` en el flujo, justo tras `Extract Variables` | **Query maestra (§3.6):** una sola query que devuelve agency + bot_config + settings + pipeline_stages (agregadas a json) + extractor_field_defs activos (core+módulos) + fragmentos de módulos prendidos. Output = 1 row con sub-arrays jsonb. |
| `Componer System Prompt` | `n8n-nodes-base.code` (runOnceForAllItems) | 2 | entre `Cargar Contexto Agency`/`Buscar Lead` y `Agente Principal` | **El Compositor (§3.7, pseudocódigo).** Lee el output de `Cargar Contexto Agency`, arma `A + B + C + D` + bloque extractor, devuelve `{ system_prompt, extractor_defs_for_tool, modules_enabled }`. |
| `Extractor Tool (bot-actions)` | `@n8n/n8n-nodes-langchain.toolHttpRequest` | 1.1 | sub-nodo `ai_tool` del agente | **Tool `extraer_datos`** (§4.2). POST a `bot-actions` con `Authorization: Bearer {{ $env.BOT_ACTIONS_SECRET }}`. Params por `$fromAI()` + `agency_id`/`lead_id` del flujo (NO por `$fromAI`). |

> Nota de naming al builder: si preferís minimizar el diff topológico, `Cargar Contexto Agency` puede ser el `Resolve Agency` renombrado con la query expandida (un solo nodo, mismas conexiones de entrada/salida). **Recomendado** para no recablear. El reviewer confirma que el `agency_id` downstream sigue resolviéndose por `$('Cargar Contexto Agency').first().json.agency_id` (renombrar implica actualizar TODAS las referencias `$('Resolve Agency')` en el workflow — ver riesgo R6).

### 3.2 Nodos a MODIFICAR

| Nombre | Qué cambia | Por qué |
|---|---|---|
| `Agente Principal - Sofia` | `parameters.options.systemMessage` pasa de texto fijo a `={{ $('Componer System Prompt').first().json.system_prompt }}`. Se conecta la tool `extraer_datos` al sub-input `ai_tool`. | Mata el prompt hardcodeado; habilita adaptación por negocio + extracción. |
| `Resolve Agency` → `Cargar Contexto Agency` | Query reescrita a la maestra (§3.6). Mismo `queryReplacement` (`businessPhone`). Mantiene el alias `bot_enabled` para no tocar `Chatbot Activado?`. | Una sola pasada de carga de contexto. |
| `Buscar Lead (Supabase)` | Agregar al SELECT: `stage_set_by`, `qualified_set_by`, `is_qualified`. | El compositor/agente necesitan saber procedencia para no re-actuar sobre lo que un humano ya fijó (F4). En F1 es solo contexto. |

### 3.3 Nodos a BORRAR

| Nombre | Razón |
|---|---|
| (ninguno) | El prompt hardcodeado NO se borra como nodo; se vacía su valor al apuntar a la expresión del Compositor. La topología no pierde nodos. |

### 3.4 Conexiones a CREAR

- `Extract Variables` → `Cargar Contexto Agency` (main) — si se renombró `Resolve Agency`, la conexión existente se preserva con el nuevo nombre.
- `Cargar Contexto Agency` → `Componer System Prompt` (main) — nueva, en el punto donde el contexto ya está cargado y antes del agente.
- `Componer System Prompt` → `Agente Principal - Sofia` (main) — nueva (insertar el Compositor en la cadena que hoy va directo al agente).
- `Extractor Tool (bot-actions)` → `Agente Principal - Sofia` (**`ai_tool`**) — nueva. PRIMERA conexión `ai_tool` del workflow.

### 3.5 Conexiones a BORRAR

- La conexión `main` directa que hoy alimenta `Agente Principal - Sofia` desde el nodo inmediatamente anterior, **redirigida** a pasar por `Componer System Prompt`. (El builder identifica el predecesor exacto en el JSON; el Compositor se intercala, no se agrega en paralelo.)

### 3.6 Query maestra `Cargar Contexto Agency` (EXACTA, lista para pegar)

> Una sola query por mensaje. Devuelve 1 row. Los sub-conjuntos (pipeline, extractor defs, módulos) se agregan como arrays jsonb vía subqueries correlacionadas para no multiplicar filas con JOINs.

```sql
WITH ag AS (
  SELECT ac.agency_id,
         ac.phone_number,
         a.is_active,
         a.bot_config,
         a.settings,
         (a.is_active AND COALESCE((a.settings->>'bot_enabled')::boolean, true)) AS bot_enabled
  FROM public.agency_channels ac
  JOIN public.agencies a ON a.id = ac.agency_id
  WHERE ac.channel = 'whatsapp'
    AND regexp_replace(ac.phone_number, '\D', '', 'g') = regexp_replace($1, '\D', '', 'g')
    AND ac.is_active = true
    AND a.is_active = true
  LIMIT 1
)
SELECT
  ag.agency_id,
  ag.phone_number,
  ag.bot_enabled,
  ag.bot_config,
  ag.settings,
  -- pipeline_stages ordenadas
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'id', ps.id, 'name', ps.name, 'slug', ps.slug,
             'position', ps.position, 'is_won', ps.is_won, 'is_lost', ps.is_lost)
             ORDER BY ps.position)
    FROM public.pipeline_stages ps WHERE ps.agency_id = ag.agency_id
  ), '[]'::jsonb) AS pipeline_stages,
  -- extractor_field_defs activos: core (module_id null) + de módulos prendidos
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'id', d.id, 'field_key', d.field_key, 'label', d.label,
             'field_type', d.field_type, 'extraction_hint', d.extraction_hint,
             'options', d.options, 'module_id', d.module_id)
             ORDER BY d.module_id NULLS FIRST, d.field_key)
    FROM public.extractor_field_defs d
    WHERE d.agency_id = ag.agency_id
      AND d.is_active = true
      AND (d.module_id IS NULL OR d.module_id IN (
            SELECT am.module_id FROM public.agency_modules am
            WHERE am.agency_id = ag.agency_id AND am.enabled = true))
  ), '[]'::jsonb) AS extractor_field_defs,
  -- fragmentos de los módulos prendidos (override de agency_modules.config si existe)
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'slug', md.slug, 'name', md.name,
             'prompt_fragment', COALESCE(am.config->>'prompt_override', md.prompt_fragment),
             'tool_config', md.tool_config)
             ORDER BY md.slug)
    FROM public.agency_modules am
    JOIN public.module_definitions md ON md.id = am.module_id
    WHERE am.agency_id = ag.agency_id AND am.enabled = true AND md.is_active = true
  ), '[]'::jsonb) AS modules,
  -- capas fijas globales del Prompt Compositor
  (SELECT content FROM public.bot_prompt_templates
     WHERE layer = 'core' AND is_active = true LIMIT 1)         AS core_template,
  (SELECT content FROM public.bot_prompt_templates
     WHERE layer = 'system_rules' AND is_active = true LIMIT 1) AS system_rules_template
FROM ag;
```

`queryReplacement`: `={{ $('Extract Variables').first().json.businessPhone }}` (SIN cambios respecto al port).

**Notas críticas al builder:**
- **Doble normalización del número** ya incorporada (`regexp_replace` en ambos lados) — blinda contra seed con/sin `+` (riesgo heredado del port).
- `core_template` / `system_rules_template` pueden venir **NULL** si no hay fila activa en `bot_prompt_templates`. El Compositor DEBE tener fallback (§3.7, paso 0). NO romper si falta.
- `bot_config` puede venir `{}` (default de la columna). El Compositor parsea defensivamente igual que `parseBotConfig()`.
- El nodo conserva `onError: continueRegularOutput` para que un fallo de carga no aborte sin diagnóstico.

### 3.7 Pseudocódigo del Code node `Componer System Prompt`

> Replica conceptualmente `composePreview()` de `crm-v2/src/lib/admin/bot-config.ts` (mismos encabezados de bloque), pero con contenido REAL (no placeholders) para A/C/D y agregando el bloque del Extractor. JavaScript puro, sin `new URL()`, sin librerías externas (skill `n8n-code-node-debug-pattern`).

```
ENTRADA: ctx = $('Cargar Contexto Agency').first().json
SALIDA: [{ json: { system_prompt, extractor_defs_for_tool, modules_enabled } }]

// ---- Paso 0: defensivo + fallbacks ----
core   = ctx.core_template
       ?? "Sos un asistente conversacional de atención por WhatsApp. Respondé con claridad,
           usá las herramientas disponibles cuando aplique, escalá a un humano si el lead lo
           pide o si te trabás, y nunca inventes información."   // FALLBACK si no hay fila core activa
rules  = ctx.system_rules_template
       ?? "Mantené respuestas breves. No repitas la misma pregunta. Si el lead se frustra o pide
           humano, escalá. No reveles que sos un sistema automatizado más de lo necesario."  // FALLBACK

bc = parseBotConfig(ctx.bot_config)   // re-implementar el parseo defensivo de bot-config.ts:
     // business_info: string | ''
     // tone: { preset ∈ {vendedor,consultivo,amigable,formal} (default 'amigable'), notes }
     // sales_close_behavior ∈ {cerrar_en_chat, mandar_link, derivar_humano} (default derivar_humano)
     // conversation_flow: string[] (trim, sin vacíos)
     // custom_instructions: string | ''

TONE_DESC = { vendedor:'Proactivo, orientado a cerrar...', consultivo:'Asesor experto...',
              amigable:'Cercano y cálido...', formal:'Profesional y sobrio...' }   // de TONE_PRESETS
SALES_DESC = { cerrar_en_chat:'Intentá cerrar la venta dentro de la conversación.',
               mandar_link:'Cuando hay interés, enviá un link de pago o reserva.',
               derivar_humano:'Al momento de cerrar, escalá a un humano (tool escalar_handoff) y avisá.' }

// ---- Paso 1: armar bloques en ORDEN (A → B → C → Extractor → D) ----
blocks = []

// [A] NÚCLEO GLOBAL (fijo)
blocks.push(core)

// [B] CAPAS DE AGENCY (de bot_config) — mismos headers que composePreview
if (bc.business_info)        blocks.push("## SOBRE ESTE NEGOCIO\n" + bc.business_info)
blocks.push("## TONO\n" + toneLabel(bc.tone.preset) + " — " + TONE_DESC[bc.tone.preset]
            + (bc.tone.notes ? "\nMatices: " + bc.tone.notes : ""))
blocks.push("## COMPORTAMIENTO DE VENTA\n" + SALES_DESC[bc.sales_close_behavior])
if (bc.conversation_flow.length)
   blocks.push("## FLUJO DE CONVERSACIÓN\nSeguí estos pasos en orden:\n"
               + bc.conversation_flow.map((s,i) => (i+1)+". "+s).join("\n"))
if (bc.custom_instructions)  blocks.push("## INSTRUCCIONES ADICIONALES\n" + bc.custom_instructions)

// [C] FRAGMENTOS DE MÓDULOS (automático)
for (m of ctx.modules ?? [])
   if (m.prompt_fragment) blocks.push("## MÓDULO: " + m.name + "\n" + m.prompt_fragment)

// [Extractor] instrucción de captura — sólo si hay defs
defs = ctx.extractor_field_defs ?? []
if (defs.length) {
   lines = defs.map(d => "- " + d.field_key + " (" + d.field_type + "): " + (d.label||'')
                  + (d.extraction_hint ? " — " + d.extraction_hint : "")
                  + (d.options ? " Opciones: " + JSON.stringify(d.options) : ""))
   blocks.push("## DATOS A CAPTURAR\n"
     + "Cuando el lead revele alguno de estos datos en su mensaje, llamá la tool `extraer_datos` "
     + "con field_key y value. Extraé sólo lo que el lead dijo explícitamente; NO inventes. "
     + "Un solo llamado puede incluir varios campos.\n" + lines.join("\n"))
}

// [D] REGLAS FINALES (fijo, va al final para 'ganar' sobre instrucciones de cliente)
blocks.push(rules)

system_prompt = blocks.join("\n\n")

// defs para que la tool description sepa los field_key válidos (defensa)
extractor_defs_for_tool = defs.map(d => ({ field_key:d.field_key, type:d.field_type, label:d.label }))
modules_enabled = (ctx.modules ?? []).map(m => m.slug)

return [{ json: { system_prompt, extractor_defs_for_tool, modules_enabled } }]
```

**Por qué A y D son fijos y globales:** son la estructura protegida (rol base, anti-loop, seguridad). Mejorar el núcleo beneficia a TODOS los clientes. Esto es la diferencia entre "prompt editable entero" (inmantenible) y compositor (mejorable centralmente). El bug histórico del 2026-05-20 (handoff con regla vaga) vivía en estas capas; mantenerlas globales evita que cada cliente lo reintroduzca.

---

## 4. Contratos de tools / Edge Functions

### 4.1 Edge Function `bot-actions` (router) — contrato general

Patrón: `verify_jwt:false` + `Authorization: Bearer <BOT_ACTIONS_SECRET>` (skill `supabase-edge-function-secret-auth`). Service_role (bypassa RLS → SIEMPRE filtra por `agency_id`). Toda action registra procedencia `'bot'`.

Payload base:
```json
{ "action": "<nombre>", "agency_id": "<uuid>", "conversation_id": "<uuid>",
  "lead_id": "<uuid>", "params": { } }
```

En ESTA spec se implementa solo la action `extraer_datos`. Las auto-acciones (`cambiar_etapa`, `calificar`, `asignar_agente`, `agregar_etiqueta`, `agregar_nota`, `escalar_handoff`) quedan especificadas en doc 04 §4.3 y se construyen en **F4** (fuera del MVP de esta spec). El router se diseña extensible desde ya.

### 4.2 Action `extraer_datos` (el "boom")

**Input (lo que manda la tool desde n8n):**
```json
{
  "action": "extraer_datos",
  "agency_id": "<uuid>",
  "lead_id": "<uuid>",
  "params": {
    "fields": [
      { "field_key": "presupuesto", "value": 250000 },
      { "field_key": "zona", "value": "Escazú" }
    ]
  }
}
```

**Lógica server-side:**
1. Validar secret + method POST + `agency_id`/`lead_id` presentes.
2. Por cada `field` en `params.fields`:
   a. Resolver `field_def_id`: `SELECT id, field_type FROM extractor_field_defs WHERE agency_id=$1 AND field_key=$2 AND is_active=true`. Si no existe → **skip ese campo** (no crear defs desde el bot; loguear `skipped_unknown_field`).
   b. Coercionar `value` al `field_type` (number/text/enum/boolean/date). Si `enum`, validar contra `options`; si no matchea → guardar como text crudo + flag `coerce_warning`.
   c. Upsert: `INSERT INTO extractor_field_values (agency_id, lead_id, field_def_id, value, extracted_at, updated_at) VALUES (...) ON CONFLICT (lead_id, field_def_id) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`.
3. (Opcional, recomendado) escribir un breadcrumb en `messages.bot_reasoning` del último mensaje para debug/replay.

**Output esperado:**
```json
{ "ok": true, "upserted": ["presupuesto","zona"], "skipped": [], "warnings": [] }
```

**Tool n8n `Extractor Tool (bot-actions)` (`toolHttpRequest`):**
- `toolDescription`: "Guardá datos que el lead reveló sobre sí mismo o su necesidad (presupuesto, zona, intención, etc.). Usala apenas el lead diga un dato relevante. NO la uses para info que el lead pregunta, solo para info que el lead DA. Pasá los datos como lista de field_key + value."
- `agency_id`, `lead_id` → del flujo: `={{ $('Cargar Contexto Agency').first().json.agency_id }}`, `={{ $('Buscar Lead (Supabase)').first().json.id }}`. **NUNCA por `$fromAI()`** (riesgo de inventar IDs — gotcha de la skill properties-search).
- `params.fields` → por `$fromAI('fields', 'Lista de objetos {field_key, value} con los datos que el lead reveló en este mensaje. field_key debe ser uno de los definidos en DATOS A CAPTURAR del prompt.', 'json')`.
- URL: `https://<v2>.supabase.co/functions/v1/bot-actions`. Auth: `Bearer {{ $env.BOT_ACTIONS_SECRET }}` (expresión segura, nunca literal — gotcha skill secret-auth).

### 4.3 Atribución en el intake (`ycloud-webhook`) — NO en n8n

Vive en el Edge Function de intake (skill `ycloud-webhook-to-supabase`), porque el objeto `referral` SOLO viene en el evento `whatsapp.inbound_message.received` de Meta y n8n recibe un payload ya normalizado sin él.

**De dónde sale (payload YCloud / Meta CTWA):** `whatsappInboundMessage.referral` con claves típicas `source_url`, `source_id` (ad_id), `headline`/`body` (ad_name), `ctwa_clid`, y/o parámetros UTM si vienen en `source_url`.

**Mapeo a `leads.attribution` (jsonb, migración 0013):**
```json
{ "utm_source": "...", "utm_medium": "...", "utm_campaign": "...", "utm_content": "...",
  "ad_id": "<source_id>", "ad_name": "<headline>", "ctwa_clid": "...", "source_url": "..." }
```

**Regla de NO pisar atribución previa (first-touch):**
```
si payload tiene referral:
  attr_nuevo = mapReferral(referral)   // + parsear UTMs del source_url
  // merge no destructivo: solo escribir si el lead NO tenía atribución con ad_id
  UPDATE leads
     SET attribution = attr_nuevo
   WHERE id = <lead_id> AND agency_id = <agency_id>
     AND COALESCE(attribution->>'ad_id','') = ''   // first-touch wins
```
> Decisión: **first-touch** (no last-touch). El primer anuncio que trajo al lead es la atribución comercial que alimenta "qué campaña trae clientes que cierran". Si el founder prefiere last-touch, es un cambio de una línea (quitar el guard del WHERE) — documentarlo, no asumir.

**Dónde en el flujo:** en `handleInbound`, después del UPSERT lead y antes/junto al INSERT message. Si NO hay `referral` (lead orgánico o recurrente), no se toca `attribution` (queda `{}` o el valor previo).

---

## 5. Variables de entorno requeridas

| Var | Para qué | Dónde se setea |
|---|---|---|
| `BOT_ACTIONS_SECRET` | Auth Bearer de la tool `extraer_datos` (y futuras auto-acciones) → `bot-actions`. | Supabase Edge Function Secrets (v2) **+** N8N env vars (mismo valor). Generar con `openssl rand -hex 32`. |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | `bot-actions` escribe con service_role. | Supabase Edge Function Secrets (auto-inyectadas por Supabase). |
| `YCLOUD_WEBHOOK_SECRET` | HMAC del intake (ya existe del port). | Supabase Edge Function Secrets (v2). |
| (n8n) credencial Postgres `CRM System` | Ya repuntada al v2 en el port. | N8N UI (manual founder, ya hecho). |

---

## 6. Riesgos previstos (OBLIGATORIO)

1. **No hay fila activa en `bot_prompt_templates` (probabilidad ALTA en v2 recién migrado).** Las capas A (core) y D (system_rules) globales podrían no estar sembradas en el proyecto v2 todavía → la query devuelve `core_template`/`system_rules_template` NULL → sin fallback, el system prompt arrancaría con `null` y el agente se comportaría errático. **Mitigación:** el Compositor TIENE fallbacks hardcodeados (§3.7 paso 0). Además, el founder debe sembrar las filas `core` + `system_rules` activas en v2 (paso §9). El reviewer marca esto como precondición fuerte: sin core sembrado, el bot funciona pero "genérico de fábrica".

2. **El agente alucina `field_key` inexistentes al llamar `extraer_datos` (probabilidad MEDIA).** El LLM podría pasar `field_key:'budget'` cuando el def es `presupuesto`. **Mitigación doble:** (a) el bloque `## DATOS A CAPTURAR` del prompt lista los `field_key` EXACTOS válidos; (b) `bot-actions` hace skip silencioso de field_keys desconocidos (no crea defs desde el bot) y los loguea. Nunca rompe, nunca contamina el schema.

3. **Atribución pisada en cada mensaje (probabilidad MEDIA si se implementa mal).** Si el intake escribiera `attribution` en cada inbound sin guard, un lead que primero vino por un ad y luego escribe orgánico perdería su atribución original. **Mitigación:** el `UPDATE ... WHERE COALESCE(attribution->>'ad_id','')=''` (first-touch). Solo el primer toque con ad_id escribe. El reviewer verifica el guard.

4. **`bot_config` malformado o parcial rompe el Compositor (probabilidad MEDIA).** El jsonb puede venir `{}`, con `tone` ausente, o con un preset inválido. **Mitigación:** el Compositor re-implementa `parseBotConfig()` (defaults completos: tono `amigable`, sales `derivar_humano`, arrays filtrados). Nunca accede a `bc.tone.preset` sin garantizar que existe.

5. **Latencia / costo de tokens por inyectar TODO el contexto cada turno (probabilidad MEDIA).** El system prompt compuesto + extractor defs + fragmentos de módulos se reenvía en cada invocación del agente. Con muchos módulos/campos crece. **Mitigación:** el prompt es estático por agency (cacheable conceptualmente); mantener `conversation_flow` y `business_info` concisos (responsabilidad del master en el Panel). El Context Window de la memoria sigue en 15-20 (skill memoria). Monitorear costo en F1.

6. **Renombrar `Resolve Agency` → `Cargar Contexto Agency` deja referencias muertas (probabilidad ALTA si no se hace con cuidado).** Múltiples nodos referencian `$('Resolve Agency').first().json.agency_id` (Buscar Lead, Apagar Chatbot, etc.). Si se renombra el nodo sin actualizar TODAS las referencias, el `n8n-expression-validator` detecta `$('Resolve Agency')` huérfano. **Mitigación:** o NO renombrar (dejar el nodo como `Resolve Agency` y solo expandir su query — **recomendado**), o el builder hace replace-all de las referencias y corre el validator (debe dar 0 violations).

7. **La tool `extraer_datos` se invoca de más (cada turno trivial) (probabilidad MEDIA).** El LLM podría llamarla incluso cuando el lead no dio datos nuevos → ruido + costo. **Mitigación:** `toolDescription` explícita ("solo cuando el lead DA un dato, no cuando pregunta"). Si persiste, ajuste de prompt en pipeline rápido. No rompe nada (upsert idempotente).

8. **Secret `BOT_ACTIONS_SECRET` filtrado en logs de n8n (probabilidad BAJA).** **Mitigación:** usar `{{ $env.BOT_ACTIONS_SECRET }}` (no string literal), rotación 90d (skill secret-auth), nunca en código ni en el JSON del workflow.

---

## 7. Casos edge a contemplar (OBLIGATORIO)

1. **Happy path — agency con bot_config completo.** Lead escribe → `Cargar Contexto Agency` resuelve agency + trae `bot_config` (tono `consultivo`, flow de 4 pasos, business_info), 5 extractor defs core, 0 módulos, core+rules sembrados → Compositor arma el prompt con TODOS los bloques → el agente responde con la personalidad configurada y, al recibir un dato, llama `extraer_datos` → `extractor_field_values` upserteado. **Resultado:** el bot suena como lo configuró el master y el Insight del contacto se puebla.

2. **Lead curioso / info-only.** Lead pregunta "¿qué hacen ustedes?" sin dar datos. El agente responde con `business_info` del prompt, NO llama `extraer_datos` (no hay dato que guardar). **Resultado:** respuesta informativa, sin escritura espuria en `extractor_field_values`.

3. **Lead frustrado / pide humano.** "quiero hablar con una persona" → `Detector de Descalificacion` marca `should_apagar_bot=true`, `razon=pide_humano` → `Apagar Chatbot — Conversation` pone `handler='human'`, `handoff_status='pending'`, reason `manual` → bot se silencia + Telegram avisa. **Resultado:** handoff correcto (sin cambios vs port; el compositor no interfiere).

4. **Tool `extraer_datos` falla / timeout / 401.** Si `bot-actions` cae o el secret está mal: la `toolHttpRequest` recibe error. **Mitigación/Resultado:** el agente NO debe abortar la respuesta al lead por una extracción fallida. El builder configura la tool con tolerancia (el agente recibe el error como resultado de tool y sigue conversando; el dato no se persiste ese turno pero se re-extrae el próximo). El lead NUNCA ve el error. Reviewer verifica que un 401 en la tool no rompe el loop conversacional.

5. **Agency SIN `bot_config` (jsonb `{}`) — negocio recién creado en el Panel.** `parseBotConfig({})` → defaults (tono amigable, sales derivar_humano, sin flow, sin business_info). El Compositor arma A + TONO(amigable) + COMPORTAMIENTO(derivar) + D. **Resultado:** el bot funciona "genérico" pero coherente; el master ve que necesita llenar el Panel para personalizarlo. NO crashea.

6. **Lead manda audio / imagen / link.** El switch `Is Text or Audio or Image?` (heredado) normaliza antes de `Cargar Contexto Agency`. El compositor y el extractor operan sobre el texto/transcripción. **Resultado:** sin cambios vs port; si es audio, transcribe y extrae sobre la transcripción.

7. **`bot_prompt_templates` sin fila activa (core NULL).** El Compositor usa el fallback hardcodeado. **Resultado:** el bot responde con un núcleo genérico mínimo + las capas del `bot_config` del negocio. Funciona, pero el founder debería sembrar el core real.

8. **Lead recurrente que ya tenía atribución de un ad previo.** Vuelve a escribir (orgánico, sin referral). El guard first-touch (`WHERE ... ad_id = ''`) NO pisa la atribución original. **Resultado:** `leads.attribution` conserva el ad que lo trajo la primera vez.

9. **Módulo prendido con `prompt_fragment` NULL.** El loop de bloques C salta el fragmento vacío (`if (m.prompt_fragment)`). **Resultado:** no aparece un bloque "## MÓDULO" vacío en el prompt.

---

## 8. Triggers de handoff (si el cambio los toca)

Esta spec **NO modifica los triggers de handoff** — siguen viviendo en el `Detector de Descalificacion` (anti-loop) + las 6 condiciones del núcleo del prompt (capa A, global). El Compositor inyecta el núcleo tal cual viene de `bot_prompt_templates`; NO reescribe reglas de handoff.

**Punto de atención operacional (no implementar acá, marcarlo):** el `sales_close_behavior = 'derivar_humano'` del `bot_config` implica que, al detectar intención de cierre, el bot debe escalar. Hoy ESA condición está descrita en el bloque B (COMPORTAMIENTO DE VENTA) como instrucción, pero el disparo real de handoff por venta requiere la tool `escalar_handoff` (F4). **En F1 el `derivar_humano` solo cambia el TONO de la respuesta del bot, no dispara handoff automático.** Esto debe quedar explícito al founder para que no espere el handoff-por-venta hasta F4. La condición operacional para F4 será: "lead expresó intención de comprar/reservar explícitamente Y `sales_close_behavior='derivar_humano'` → llamar `escalar_handoff` con reason `qualified`" (NO vago: requiere intención explícita de cierre EN ESTE TURNO, no mero interés en info).

---

## 9. Cambios fuera del workflow (solo lista — NO implementar acá)

1. **Edge Function `bot-actions`** (nueva) con router + action `extraer_datos`, secret auth, service_role. Deploy `--no-verify-jwt`. (Backend-builder / supabase-edge-function skill.)
2. **Edge Function `ycloud-webhook`** (modificación): agregar captura de `referral` → `leads.attribution` con guard first-touch (§4.3).
3. **Secret `BOT_ACTIONS_SECRET`**: generar + setear en Supabase Edge Secrets v2 + N8N env vars.
4. **Seed en v2:** filas activas en `bot_prompt_templates` (`layer='core'` y `layer='system_rules'`) — sin esto el bot usa el fallback genérico. (Founder / migración de seed.)
5. **Seed/verificar `extractor_field_defs`** del demo (core: nombre, presupuesto, zona, intención, etc.) para que el extractor tenga qué capturar.
6. **`agencies.bot_config` del demo** lleno desde el Panel Admin (el founder lo edita para ver la adaptación en F1).
7. **(Prompt-designer):** el contenido real de `bot_prompt_templates` core + system_rules debería diseñarlo el `langchain-prompt-designer` (skill `langchain-agent-prompt-design`) — esta spec solo define el formato y el fallback. **Marcado para el prompt-designer.**

---

## 10. Tests manuales que el reviewer debe correr (walkthroughs) y el founder en vivo

- **Escenario A (adaptación de tono):** poner `bot_config.tone.preset='formal'` en el Panel para el demo → mandar WhatsApp → confirmar que el bot trata de "usted" / sobrio. Cambiar a `vendedor` → confirmar que empuja al cierre. SIN tocar n8n.
- **Escenario B (flujo de conversación):** definir `conversation_flow` de 3 pasos en el Panel → confirmar que el bot los sigue en orden.
- **Escenario C (extracción real):** mandar "busco algo en Escazú, presupuesto 250 mil" → confirmar fila(s) en `extractor_field_values` con `value` correcto, `field_def_id` resuelto, y que el Insight del contacto en el CRM lo muestra.
- **Escenario D (field_key inválido):** forzar (vía prompt de prueba) que el agente intente `field_key` inexistente → confirmar skip silencioso, sin error al lead, log `skipped_unknown_field`.
- **Escenario E (tool caída):** apagar `bot-actions` (o secret mal) → mandar mensaje con datos → confirmar que el bot RESPONDE igual al lead (la extracción falla en silencio, no rompe el loop).
- **Escenario F (atribución):** simular inbound con `referral` (ad de Meta) → confirmar `leads.attribution` poblado con ad_id/utm. Mandar segundo mensaje orgánico → confirmar que NO se pisó.
- **Escenario G (sin bot_config):** agency nueva con `bot_config={}` → confirmar que el bot responde genérico-coherente sin crashear.
- **Escenario H (sin core sembrado):** quitar la fila activa de `bot_prompt_templates` core → confirmar que el Compositor usa el fallback y el bot sigue respondiendo.
- **Escenario I (validator):** `node scripts/validate-n8n-expressions.js <output>.json` → 0 violations (clave si se renombró algún nodo).

---

## 11. Plan de fases (qué construir primero para ver el bot adaptándose YA)

> Orden optimizado para que el primer entregable visible sea "cambio el Panel y el bot cambia". Cada fase deja algo verificable. Esta spec cubre F1–F3; F4 se especifica aparte (reusa doc 04 §4.3).

### F1 — Compositor en runtime (el primer "wow", 1 sesión, pipeline PESADO)
- Nodo `Cargar Contexto Agency` (query maestra §3.6) + nodo `Componer System Prompt` (§3.7).
- `Agente Principal` apunta su `system message` a la salida del Compositor.
- Seed mínimo: `bot_prompt_templates` core+rules activos (o confiar en fallback) + `bot_config` del demo lleno.
- **Verificable:** cambio el tono/flujo en el Panel Admin → el bot cambia de personalidad SIN tocar n8n. **Este es el entregable que le mostrás al founder primero.**

### F2 — Extractor como tool (el "boom" de datos, 1 sesión)
- Edge Function `bot-actions` con action `extraer_datos` (§4.2).
- Tool `Extractor Tool (bot-actions)` conectada al agente (`ai_tool`).
- Bloque `## DATOS A CAPTURAR` ya lo arma el Compositor.
- **Verificable:** el bot conversa, capta datos del lead → `extractor_field_values` se puebla → el Insight del contacto en el CRM deja de estar sembrado y muestra lo real.

### F3 — Atribución en intake (1/2 sesión, fuera de n8n)
- Modificar `ycloud-webhook` para capturar `referral` → `leads.attribution` con guard first-touch (§4.3).
- **Verificable:** lead que entra por un ad de Meta queda atribuido → el Dashboard de Embudo cruza campaña × cierre con data real.

### F4 — Auto-acciones con toggles + módulos (2 sesiones, fuera de esta spec)
- Resto de actions en `bot-actions` (`cambiar_etapa`, `calificar`, etc.) con doble capa de toggles (doc 04 §4.3) + procedencia `'bot'` (columnas verificadas en migración 0009: `stage_set_by`, `qualified_set_by`, `assigned_set_by`, `tag_assignments.created_by_kind`).
- Fragmentos de módulo (capa C) ya soportados por el Compositor + tool `buscar_<modulo>`.
- **Verificable:** el bot califica/cambia etapa solo → el inbox muestra el iconito 'bot'; toggle off → no actúa.

---

## 12. Handoff al builder

- **Archivo de output esperado:** `n8n/workflows/chatbot-momentum-bot-v6-v1.json` (versión nueva; NO sobrescribir el v5.4-v2db).
- **Script de build esperado:** `scripts/build-bot-v6-v1.js` (idempotente; parte del v5.4-v2db como base; inserta `Cargar Contexto Agency`/`Componer System Prompt`; reapunta el `system message` del agente; conecta `extraer_datos` como `ai_tool`; fuerza `active:false`; valida con `JSON.parse` + smoke tests).
- **Notas especiales al builder (NO obvias):**
  1. **NO renombres `Resolve Agency`** salvo que hagas replace-all de todas las referencias `$('Resolve Agency')` y corras el validator a 0 violations (riesgo R6). Recomendado: dejar el nombre, expandir solo la query.
  2. **El prompt del Compositor (Code node) es largo** → guardalo en `memory/research/<id>-compositor.md` con markers HTML y extraelo en el script (skill `n8n-workflow-build-script` §4), NO lo embebas como string escapado.
  3. **`extraer_datos` es la PRIMERA conexión `ai_tool`** del workflow — verificá que el sub-input del agente la reciba (no como `main`).
  4. **`agency_id`/`lead_id` de la tool van del flujo, NUNCA por `$fromAI()`** (gotcha skill properties-search).
  5. **Secret por `{{ $env.BOT_ACTIONS_SECRET }}`**, nunca literal.
  6. **Fallbacks del Compositor son obligatorios** (core/rules NULL no debe romper).
  7. **El contenido real de `bot_prompt_templates`** (core + system_rules) NO lo escribís vos: lo diseña el `langchain-prompt-designer`. Vos solo cableás el formato + fallback.
  8. **`active:false`** forzado. El founder activa tras sembrar y verificar.
