# Spec: Sofia v6 — base v2 limpia + Prompt Compositor F1 (workflow canónico)

**Fecha:** 2026-05-29
**Autor:** n8n-architect
**Workflow afectado:** base = `n8n/workflows/chatbot-inmobiliaria-demo-ycloud-sofia-v5.5.json` (id N8N `lPHyQvdwCI7zEtcm`, 57 nodos). Output = `chatbot-momentum-bot-v6-v1.json`.
**Versión actual → propuesta:** Sofia v5.5 (capa de datos v1 + prompt inmobiliario hardcodeado) → **bot-v6 v1** (capa de datos v2 limpia + system prompt compuesto en runtime desde la DB)
**Trigger del cambio:** Cerrar F1 al 100%. No existe una base v2 limpia; la port de v5.4 nunca se construyó y la rama evolucionada (v5.5) apunta a Supabase v1 en 3 lugares. Esta spec unifica: elige base canónica, porta su capa de datos a v2, neutraliza/repunta las 3 edge functions v1, y cabla el Prompt Compositor F1 que lee `agencies.bot_config` + `bot_prompt_templates` en runtime.

---

## 0. DECISIÓN DE BASE CANÓNICA (entrega #1)

**Base canónica elegida: `chatbot-inmobiliaria-demo-ycloud-sofia-v5.5.json`.**

**Justificación (verificada leyendo ambos JSON):**

| Criterio | v5.4 (`crm-v2/_n8n-current.json`) | v5.5 (`n8n/workflows/...sofia-v5.5.json`) |
|---|---|---|
| Tools `ai_tool` cableadas al agente | **NINGUNA** (port spec §2.2 hallazgo 1) | **DOS**: `Supabase Properties Tool` + `Request Handoff Tool` (conexiones `ai_tool` verificadas, líneas 2230-2251) |
| `Expand Property Images` | sí | sí (v5.5, normalizeImageUrl string-ops) |
| Handoff por tool LLM | no | sí (`Request Handoff Tool` → edge function `request-handoff`) |
| Handoff por detector anti-loop | sí (`Detector de Descalificacion` → `Apagar Chatbot`) | sí (idéntico) |
| Prompt del agente | hardcodeado inmobiliario | hardcodeado inmobiliario (idéntico bloque) |
| Capa de datos | v1 | v1 |

v5.5 es **superset estricto** de v5.4: tiene todo lo de v5.4 más las 2 tools del agente cableadas. Partir de v5.4 implicaría re-cablear las tools que v5.5 ya tiene. La port de v5.4 (`2026-05-29-port-sofia-v5.4-a-schema-v2.md`) sigue siendo válida como **fuente de las queries v1→v2 exactas** (las reuso al pie de la letra abajo), pero la TOPOLOGÍA base es v5.5.

**Consecuencia de elegir v5.5:** además de portar la capa de datos (igual que v5.4), hay que tratar las **2 tools `ai_tool`** que v5.4 no tenía:
- `Request Handoff Tool` → URL v1 + depende de un trigger Postgres que **v2 NO tiene** (ver §3.3, BLOQUEANTE).
- `Supabase Properties Tool` → URL v1 + módulo properties no existe en v2 (ver §3.4, se DESCONECTA).

---

## 1. Problema / requerimiento

El founder quiere F1 al 100%: el bot corriendo contra una base **v2 limpia** Y leyendo su system prompt en runtime desde la DB (Prompt Compositor), de modo que cambiar `agencies.bot_config` en el Panel Admin cambie la personalidad del bot sin tocar n8n. Hoy no hay base v2 limpia: la única rama evolucionada (v5.5) apunta a Supabase v1 en queries Postgres, en 2 tools del agente y en el Expand node, y tiene el prompt inmobiliario clavado en el nodo del agente.

Esta spec produce, de una sola pasada construible: (a) la base v2 limpia y (b) el compositor F1 encima de ella.

**Hecho que corrige supuestos:** Sofia **NO está en producción** (confirmado founder 2026-05-29). No hay bot vivo que romper; se construye y prueba con libertad.

---

## 2. Estado actual relevante (nodos de v5.5 que se ven afectados — nombres exactos del JSON)

| Nodo | Tipo | Estado en v5.5 (v1) | Qué le pasa en esta spec |
|---|---|---|---|
| `Resolve Agency` | postgres executeQuery | query v1 (`whatsapp_numbers`, `bot_enabled`, `archived_at`); cred `pMsxqUvr0wDZsjIt` | **MODIFICAR** → query maestra v2 `Cargar Contexto Agency` (§3.5). NO renombrar (riesgo R-rename). |
| `Buscar Lead (Supabase)` | postgres executeQuery | `phone_e164`, `status` | **MODIFICAR** → query v2 (§3.2.B) |
| `Get Conversation State` | postgres executeQuery | `id, handler, bot_paused_until, archived_at` | **MODIFICAR** → +`channel='whatsapp'` (§3.2.C) |
| `Chatbot Activado?` | if | lee `Resolve Agency.bot_enabled` | **SIN cambios** (alias `bot_enabled` se preserva) |
| `Conversation` | postgres select | `n8n_chat_histories` | **SIN cambios SQL** (tabla idéntica) |
| `Delete Postgres historial` | postgres deleteTable | `n8n_chat_histories` | **SIN cambios SQL** |
| `Postgres Chat Memory - Sofia` | langchain memoryPostgresChat | cred Postgres | **SIN cambios** (session_id = `Telefono@businessPhone`) |
| `Agente Principal - Sofia` | langchain.agent | `systemMessage` = prompt inmobiliario HARDCODEADO (línea 898) | **MODIFICAR** → `systemMessage` = expresión al Compositor (§3.6) |
| `Detector de Descalificacion` | langchain (chat model json) | anti-loop, produce `output.apagar_bot/razon/resumen_lead` | **SIN cambios** |
| `Apagar Chatbot — Conversation` | postgres executeQuery | UPDATE handler='human' + CASE enum | **SIN cambios SQL** (enum v2 compatible) — ver §3.3 |
| `Apagar Chatbot — Lead Summary` | postgres executeQuery | UPDATE `leads.bot_summary` | **SIN cambios SQL** (depende de 0012 ya aplicada) |
| `Request Handoff Tool` | langchain toolHttpRequest (`ai_tool`) | URL v1 `request-handoff`; auth `$env.HANDOFF_INTERNAL_SECRET` | **MODIFICAR URL → v2** (§3.3, BLOQUEANTE) |
| `Supabase Properties Tool` | langchain toolHttpRequest (`ai_tool`) | URL v1 `properties-search` con secret literal en URL | **DESCONECTAR del agente** (§3.4) |
| `Expand Property Images` | code | hardcode v1 `SUPABASE_URL`+`SEARCH_SECRET` | **MODIFICAR** → guard `PROPERTIES_MODULE_ENABLED=false` (§3.4) |

**Hallazgos al leer el JSON (cambian supuestos):**
1. v5.5 tiene **DOS rutas de handoff coexistiendo**: (a) la tool LLM `Request Handoff Tool` → edge function `request-handoff`; (b) el `Detector de Descalificacion` → `Apagar Chatbot — Conversation` (UPDATE directo). Hacen cosas DISTINTAS en v2 (§3.3).
2. El `Request Handoff Tool` ya usa `Authorization: Bearer {{ $env.HANDOFF_INTERNAL_SECRET }}` (correcto, no literal). Solo la URL es v1.
3. El `Supabase Properties Tool` lleva el secret **literal en la URL** (`?secret=86eae...`) — es secret v1, queda muerto al desconectar.
4. El agente lee `conversation_id` de `$('Get Conversation State').first().json.id`, `agency_id` de `$('Resolve Agency')...`, `Telefono` de `$('Variables')`. El compositor debe respetar esas referencias.
5. `message_count` lo lee el prompt con `|| 0`; la columna no existe en v2 a propósito. NO agregarla.

---

## 3. Cambio propuesto

### 3.0 Diagrama de flujo (post-cambio, parte afectada)

```
Webhook YCloud → Extract Variables → Switch(texto/audio/imagen) → ID y Mensaje
   → [Resolve Agency*]  (query maestra v2: agency + bot_config + pipeline + extractor_defs + core/rules)
   → Buscar Lead (v2)   → Lead Encontrado? → Get Conversation State (v2)
   → Chatbot Activado?  → Detectar Link → Tiene Link? → (Apify) → Mensaje Enriquecido
   → REINICIAR? → Variables → Conversation → Code Formatear Historial → Unificacion de Variables
   → [Componer System Prompt]  ◄── NUEVO Code node (lee Resolve Agency*)
   → Agente Principal - Sofia  (systemMessage = {{ Componer System Prompt }})
        ├─ ai_languageModel: OpenAI Chat Model - Sofia
        ├─ ai_memory: Postgres Chat Memory - Sofia
        └─ ai_tool: Request Handoff Tool (URL v2)     [Supabase Properties Tool DESCONECTADA]
   → Formateador → Split Out → Expand Property Images (guard) → Loop → Send Chunk YCloud
   (rama paralela)  Agente → Detector de Descalificacion → Apagar bot? → Apagar Chatbot —
                     Conversation (v2) → Apagar Chatbot — Lead Summary (v2) → Telegram
```
`*` `Resolve Agency` conserva su NOMBRE (no se renombra a "Cargar Contexto Agency") para no romper las ~6 referencias `$('Resolve Agency')` downstream. Solo se expande su query.

### 3.1 Nodos a CREAR

| Nombre | Type | typeVersion | Posición aprox. | Parámetros críticos |
|---|---|---|---|---|
| `Componer System Prompt` | `n8n-nodes-base.code` (runOnceForAllItems) | 2 | entre `Unificacion de Variables` y `Agente Principal - Sofia` (≈ x=-450, y=816) | Lee `$('Resolve Agency').first().json` (output de la query maestra), compone A+B+C+Extractor+D, devuelve `{ system_prompt, modules_enabled }`. Pseudocódigo §3.6. |

> Solo se crea UN nodo. El compositor F1 NO crea la tool extractor (eso es F2). La query maestra trae `extractor_field_defs` igual (para que el bloque `## DATOS A CAPTURAR` exista en el prompt y el founder lo vea), pero SIN tool no se persiste nada todavía — es contexto inerte. Documentado en §5.

### 3.2 Nodos a MODIFICAR (capa de datos v1→v2)

> Todas las queries usan **doble-normalización del teléfono** (regexp_replace en ambos lados) por el riesgo R3. La credencial Postgres (id `pMsxqUvr0wDZsjIt`, name "Inmobiliaria" en v5.5) NO cambia su id en el JSON; el founder repunta su contenido a v2 (§6, precondición P1).

#### `Resolve Agency` (A) — se convierte en la QUERY MAESTRA del compositor

Ver §3.5 (query completa). Reemplaza la query v1. Mantiene el alias `bot_enabled` para no tocar `Chatbot Activado?`. `queryReplacement` SIN cambios: `={{ $('Extract Variables').first().json.businessPhone }}`.

#### `Buscar Lead (Supabase)` (B)

Query v1 actual: `SELECT ... phone_e164, status ... FROM leads WHERE agency_id=$1 AND phone_e164=$2`.

Query v2 (EXACTA, lista para pegar):
```sql
SELECT l.id,
       l.agency_id,
       l.full_name,
       l.display_name,
       l.phone,
       l.phone        AS phone_e164,
       ps.slug        AS status,
       l.stage_id,
       l.notes,
       l.bot_summary,
       l.created_at,
       c.last_inbound_at
FROM public.leads l
LEFT JOIN public.pipeline_stages ps ON ps.id = l.stage_id
LEFT JOIN public.conversations c
       ON c.lead_id = l.id
      AND c.agency_id = l.agency_id
      AND c.channel = 'whatsapp'
WHERE l.agency_id = $1
  AND (regexp_replace(l.phone, '\D', '', 'g') = regexp_replace($2, '\D', '', 'g')
       OR l.wa_user_id = $2)
  AND l.deleted_at IS NULL
LIMIT 1
```
`queryReplacement` SIN cambios: `={{ $('Resolve Agency').first().json.agency_id }}, ={{ $('ID y Mensaje').first().json.ID }}`.
Notas: alias `phone AS phone_e164` (defensa downstream); `status` via LEFT JOIN (NULL si lead sin stage, tolerado); `bot_summary` requiere 0012 (ya en disco como migración, verificar aplicada — P3); `last_inbound_at` desde conversations.

#### `Get Conversation State` (C)

Query v2 (EXACTA):
```sql
SELECT id, handler, bot_paused_until, archived_at,
       handoff_status, handoff_reason
FROM public.conversations
WHERE agency_id = $1
  AND lead_id = $2
  AND channel = 'whatsapp'
LIMIT 1
```
`queryReplacement` SIN cambios. Agregar `AND channel='whatsapp'` (UNIQUE v2 es `(agency_id, lead_id, channel)`).

#### `Agente Principal - Sofia` (D)

`parameters.options.systemMessage`: de texto hardcodeado → `={{ $('Componer System Prompt').first().json.system_prompt }}`.
El campo `parameters.text` (contexto del lead) NO cambia: sigue armando `nombre_lead`, `conversation_id`, `agency_id`, `telefono`, `message_count || 0`, y el mensaje del usuario. Solo cambia el `systemMessage`.

#### `Request Handoff Tool` (E) — solo la URL

`url`: `https://ugkunpsohrimxetofawv.supabase.co/functions/v1/request-handoff` → **`https://fahujscodhqlopycorzn.supabase.co/functions/v1/request-handoff`** (o `{{ $env.SUPABASE_V2_URL }}/functions/v1/request-handoff` si el founder prefiere parametrizar — recomendado). Auth header ya es `$env.HANDOFF_INTERNAL_SECRET`, NO cambia. Ver §3.3 (BLOQUEANTE: la función debe existir en v2 Y silenciar el bot).

#### `Expand Property Images` (F)

`SUPABASE_URL` → v2 + agregar al inicio del jsCode:
```js
const PROPERTIES_MODULE_ENABLED = false; // v2: módulo properties no construido
```
y al detectar marker, si `!PROPERTIES_MODULE_ENABLED` → saltar el fetch HTTP, limpiar el marker (`cleanMarkers`), empujar el texto. Evita los 5s de timeout por mensaje con marker (R5). El `SEARCH_SECRET` queda como placeholder claramente marcado (módulo inerte). NO inventar secret real.

### 3.3 Las 3 edge functions v1 → v2 — manejo del HANDOFF (CORE, BLOQUEANTE)

**Estado verificado:** en `crm-v2/supabase/functions/` SOLO existe `ycloud-webhook`. **NO existe `request-handoff` ni `properties-search` ni `bot-actions` en v2.** Las versiones v1 viven en `supabase/functions/` (raíz del repo).

**Hallazgo crítico que cambia el diseño del handoff:** el v1 `request-handoff` (`supabase/functions/request-handoff/index.ts`) hace SOLO `UPDATE conversations SET handoff_status='pending', handoff_reason, handoff_summary, handoff_at`. Delega TODO lo demás a **dos triggers Postgres**: `tg_handoff_create_task` (crea la task de 30 min, **flip `handler='human'`**, linkea task) y `tg_handoff_mark_handled`. **Esos triggers NO existen en v2** (verificado: no aparecen en migraciones 0007 ni 0009; v2 solo tiene `denorm_conversation_on_message`, `broadcast_message`, `set_updated_at`, `handle_new_user`).

**Implicación grave:** si se porta el v1 `request-handoff` tal cual a v2, escribe `handoff_status='pending'` pero **NADIE pone `handler='human'`** → el bot SIGUE en `handler='bot'` → `Chatbot Activado?` sigue dando true → **el bot sigue respondiendo después del handoff.** Doble-handoff / bot que no se calla. Inaceptable.

**Las DOS rutas de handoff de v5.5 en v2 (qué hace cada una):**
- **Ruta detector** (`Detector de Descalificacion` → `Apagar Chatbot — Conversation`): UPDATE directo que **SÍ pone `handler='human'`** explícitamente. En v2 funciona y silencia el bot (verificado: la query setea `handler='human'`). Esta es la ruta que REALMENTE apaga el bot.
- **Ruta tool LLM** (`Request Handoff Tool` → edge function): en v1 silenciaba vía trigger; en v2, sin trigger, NO silencia. Quedaría a medias.

**DECISIÓN del architect (handoff en F1) — marcar al founder, requiere su OK (BLOQUEANTE):**

Opción recomendada **A (mínima, segura, sin edge function nueva en F1):**
> **Desplegar `request-handoff` en v2 PERO modificada** para que el UPDATE incluya `handler='human'` además de `handoff_status='pending'` (replicando lo que en v1 hacía el trigger). Así la ruta tool LLM también silencia el bot. NO se depende de triggers ausentes. El builder deja la URL apuntando a v2 con un comentario "REQUIERE request-handoff v2 que setee handler='human'".

Opción **B (más conservadora para F1):**
> **Desconectar `Request Handoff Tool` del agente en F1** y dejar SOLO la ruta detector (`Apagar Chatbot — Conversation`), que ya silencia el bot correctamente en v2. El handoff por tool LLM se reintroduce en F2/F4 junto con `bot-actions` y `escalar_handoff`. Esto es coherente con el split del prompt (doc split §3.3 / §4.1): en F1 el handoff lo gobierna el detector + las condiciones narrativas del núcleo, NO un enum de tool. El núcleo agnóstico (capa A) describe el handoff narrativamente; sin tool, el detector ejecuta.

**Recomendación del architect: Opción B para F1.** Razones: (1) NO requiere desplegar/portar una edge function en F1 (menos superficie, F1 es "ver el bot adaptarse al bot_config"); (2) elimina el riesgo de doble-handoff por trigger ausente; (3) es exactamente lo que el split del prompt asume (handoff por detector en F1, tool en F4); (4) el `Apagar Chatbot — Conversation` ya está verificado compatible con el enum v2 y silencia el bot. **El founder debe confirmar B vs A.** Si elige A, agrega como precondición desplegar `request-handoff` v2 modificada (§6 P5) y el `Request Handoff Tool` queda conectado con URL v2.

> Cualquiera de las dos: el handoff DEBE silenciar el bot. Con B, el camino verificado es el detector. El reviewer debe walkthrough que tras handoff el bot deja de responder (caso edge §8.6).

**`properties-search` (la otra edge function v1):** módulo properties NO existe en v2 → ver §3.4. Se desconecta la tool y se neutraliza el Expand node. NO se despliega `properties-search` en v2 (fuera de alcance, F5).

### 3.4 Módulo `properties` — INERTE Y SEGURO

El módulo properties no existe en v2 (sin tabla `properties`, sin edge function `properties-search`). En v5.5 el agente lo toca por DOS vías: la tool `Supabase Properties Tool` (ai_tool) y el `Expand Property Images` (Code node tras Split Out).

**Decisión: DESCONECTAR la `Supabase Properties Tool` del agente + neutralizar el Expand node con guard.**

1. **`Supabase Properties Tool`:** **BORRAR la conexión `ai_tool`** `Supabase Properties Tool → Agente Principal - Sofia` (líneas 2230-2239). El nodo se CONSERVA en el canvas (para reconectarlo en F5) pero queda huérfano (sin conexión). Razón: sin catálogo en v2, exponerla al agente solo invita a que el LLM la llame y reciba 404/error. Sin la tool, el agente no tiene de dónde sacar códigos `CR-XXXX` y (con el bot_config de fisio sembrado, que no menciona propiedades) no debería emitir markers.
2. **`Expand Property Images`:** conservar en el flujo (NO desconectar — rompería la cadena `Split Out → Expand → Loop → Send Chunk`). Agregar guard `PROPERTIES_MODULE_ENABLED=false` (§3.2.F): ante un marker, saltar el fetch y limpiar el marker. Esto es defensa: aunque el agente nunca emita marker (sin tool ni catálogo), si lo hiciera, el texto sale limpio sin 5s de latencia.
3. **NO desplegar `properties-search` en v2.** El `SEARCH_SECRET` del Expand queda como placeholder muerto (nunca se llama por el guard).

> El reviewer confirma: (a) `Supabase Properties Tool` SIN conexión `ai_tool`; (b) el loop core completa con texto aunque haya marker; (c) no quedan referencias `$('Supabase Properties Tool')` en otros nodos (no las hay).

### 3.5 Query maestra `Cargar Contexto Agency` (en el nodo `Resolve Agency`) — EXACTA

> Una sola query por mensaje, devuelve 1 row con sub-arrays jsonb. Reusa la query maestra de la spec del compositor (`2026-05-29-cablear-bot-config-runtime.md` §3.6), reconciliada con el schema v2 real verificado (0005 `bot_prompt_templates`/`extractor_field_defs`, 0004 `module_definitions`/`agency_modules`, 0010 `agency_channels`).

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
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'id', ps.id, 'name', ps.name, 'slug', ps.slug,
             'position', ps.position, 'is_won', ps.is_won, 'is_lost', ps.is_lost)
             ORDER BY ps.position)
    FROM public.pipeline_stages ps WHERE ps.agency_id = ag.agency_id
  ), '[]'::jsonb) AS pipeline_stages,
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
  (SELECT content FROM public.bot_prompt_templates
     WHERE layer = 'core' AND is_active = true LIMIT 1)         AS core_template,
  (SELECT content FROM public.bot_prompt_templates
     WHERE layer = 'system_rules' AND is_active = true LIMIT 1) AS system_rules_template
FROM ag;
```
`queryReplacement`: `={{ $('Extract Variables').first().json.businessPhone }}` (SIN cambios).

**Notas críticas al builder:**
- **VERIFICAR columnas reales antes de pegar (R7):** la query asume `module_definitions.{slug,name,prompt_fragment,tool_config,is_active}`, `agency_modules.{module_id,enabled,config}`, `pipeline_stages.{name,slug,position,is_won,is_lost}`. Están en migraciones 0004/0003. **El builder DEBE abrir 0004_modules.sql y 0003_core_crm.sql y confirmar los nombres EXACTOS** (esta spec no leyó 0004 al detalle). Si `agency_modules` usa `is_enabled` en vez de `enabled`, o `module_definitions` no tiene `tool_config`, ajustar. El `n8n-expression-validator` no detecta errores SQL — el reviewer corre la query contra v2 (founder con acceso) antes de activar.
- `core_template`/`system_rules_template` pueden venir NULL → el Compositor tiene fallback (§3.6 paso 0). Pero el seed YA los sembró (P4 ✓), así que en el demo vienen poblados.
- `bot_config` viene poblado con la config fisio de Robert (seed ejecutado, P4 ✓).
- Conservar `onError: continueRegularOutput` y `alwaysOutputData: true` del nodo.

### 3.6 Pseudocódigo del Code node `Componer System Prompt`

> Replica `composePreview()` de `crm-v2/src/lib/admin/bot-config.ts` (mismos encabezados de bloque, MISMOS textos de TONE_PRESETS/SALES_BEHAVIORS) pero con contenido REAL para A/C/D. JS puro, sin `new URL()`, sin libs externas. Reusa el pseudocódigo de la spec compositor §3.7, ajustado: en F1 NO se construye la tool extractor, pero el bloque `## DATOS A CAPTURAR` SÍ se arma (queda como instrucción inerte; sin tool no persiste, pero el founder lo ve y el prompt queda listo para F2).

```
ENTRADA: ctx = $('Resolve Agency').first().json   // output de la query maestra
SALIDA:  [{ json: { system_prompt, modules_enabled } }]

// ---- Paso 0: fallbacks ----
core  = ctx.core_template  ?? "<FALLBACK genérico mínimo: asistente de atención cordial,
                                 usa tools si aplica, escala a humano si lo piden o te trabás,
                                 nunca inventes info>"
rules = ctx.system_rules_template ?? "<FALLBACK: respuestas breves, no repetir preguntas,
                                 escalar ante frustración/pedido de humano>"

// ---- Parseo defensivo de bot_config (re-implementa parseBotConfig de bot-config.ts) ----
bc = parseBotConfig(ctx.bot_config)
     // business_info: string|''
     // tone: { preset ∈ {vendedor,consultivo,amigable,formal} (default amigable), notes:string }
     // sales_close_behavior ∈ {cerrar_en_chat,mandar_link,derivar_humano} (default derivar_humano)
     // conversation_flow: string[] (trim, sin vacíos)
     // custom_instructions: string|''

// Textos EXACTOS de bot-config.ts (copiar literal de TONE_PRESETS / SALES_BEHAVIORS):
TONE_LABEL = { vendedor:'Vendedor', consultivo:'Consultivo', amigable:'Amigable', formal:'Formal' }
TONE_DESC  = { vendedor:'Proactivo, orientado a cerrar. Empuja hacia la acción.',
               consultivo:'Asesor experto. Pregunta, entiende y recomienda.',
               amigable:'Cercano y cálido. Conversa como una persona.',
               formal:'Profesional y sobrio. Trato de usted.' }
SALES_LABEL= { cerrar_en_chat:'Cerrar en el chat', mandar_link:'Mandar link de pago',
               derivar_humano:'Derivar a un humano' }
SALES_DESC = { cerrar_en_chat:'El asistente intenta cerrar la venta dentro de la conversación.',
               mandar_link:'Cuando hay interés, envía un link de pago o reserva.',
               derivar_humano:'Al momento de cerrar, pasa la conversación a una persona y te avisa.' }

// ---- Paso 1: bloques en ORDEN (A → B → C → DATOS A CAPTURAR → D) ----
blocks = []
blocks.push(core)                                                            // [A] núcleo

if (bc.business_info)  blocks.push("## SOBRE ESTE NEGOCIO\n" + bc.business_info)
blocks.push("## TONO\n" + TONE_LABEL[bc.tone.preset] + " — " + TONE_DESC[bc.tone.preset]
            + (bc.tone.notes ? "\nMatices: " + bc.tone.notes : ""))
blocks.push("## COMPORTAMIENTO DE VENTA\n" + SALES_LABEL[bc.sales_close_behavior]
            + " — " + SALES_DESC[bc.sales_close_behavior])
if (bc.conversation_flow.length)
   blocks.push("## FLUJO DE CONVERSACIÓN\n"
               + bc.conversation_flow.map((s,i) => (i+1)+". "+s).join("\n"))
if (bc.custom_instructions) blocks.push("## INSTRUCCIONES ADICIONALES\n" + bc.custom_instructions)

for (m of ctx.modules ?? [])                                                  // [C] módulos
   if (m.prompt_fragment) blocks.push("## MÓDULO: " + m.name + "\n" + m.prompt_fragment)

defs = ctx.extractor_field_defs ?? []                                         // [DATOS A CAPTURAR]
if (defs.length) {
   lines = defs.map(d => "- " + d.field_key + " (" + d.field_type + "): " + (d.label||'')
                  + (d.extraction_hint ? " — " + d.extraction_hint : "")
                  + (d.options ? " Opciones: " + JSON.stringify(d.options) : ""))
   blocks.push("## DATOS A CAPTURAR\n"
     + "Si el lead revela alguno de estos datos, tenelos presentes en la conversación "
     + "(en esta fase NO hay herramienta de guardado todavía; solo usalos como contexto). "
     + "Extraé solo lo explícito, no inventes.\n" + lines.join("\n"))
   // NOTA F1: sin tool extractor, este bloque es contexto. En F2 se cambia el texto a
   // "llamá la tool extraer_datos" y se conecta la tool. Documentado en §5.
}

blocks.push(rules)                                                            // [D] reglas finales (gana al final)

system_prompt  = blocks.join("\n\n")
modules_enabled = (ctx.modules ?? []).map(m => m.slug)
return [{ json: { system_prompt, modules_enabled } }]
```

**Por qué A y D fijos y globales:** estructura protegida (rol base, anti-loop, seguridad, contrato de marker). Mejorar el núcleo beneficia a todos los clientes. El bug del 2026-05-20 (handoff con regla vaga) vivía en estas capas; mantenerlas globales evita que cada cliente lo reintroduzca.

### 3.7 Conexiones a CREAR / BORRAR

**Crear:**
- `Unificacion de Variables` → `Componer System Prompt` (main).
- `Componer System Prompt` → `Agente Principal - Sofia` (main).

**Borrar:**
- `Unificacion de Variables` → `Agente Principal - Sofia` (main) — se redirige a pasar por el Compositor.
- `Supabase Properties Tool` → `Agente Principal - Sofia` (ai_tool) — desconexión del módulo properties (§3.4).
- **(Solo si el founder elige Opción B en §3.3)** `Request Handoff Tool` → `Agente Principal - Sofia` (ai_tool).

**Sin cambios:** todas las demás conexiones (memoria, language model, detector, formateador, loop, etc.) quedan idénticas. El `n8n-expression-validator` debe dar 0 violations.

---

## 4. Schemas

### Output de `Resolve Agency` (query maestra v2)
```json
{
  "agency_id": "<uuid>", "phone_number": "50689839490", "bot_enabled": true,
  "bot_config": { "business_info": "...", "tone": {"preset":"consultivo","notes":"..."},
                  "sales_close_behavior": "mandar_link", "conversation_flow": ["..."],
                  "custom_instructions": "..." },
  "settings": {}, "pipeline_stages": [ {"slug":"nuevo","position":0, ...} ],
  "extractor_field_defs": [ {"field_key":"...","field_type":"text", ...} ],
  "modules": [],
  "core_template": "# QUIÉN SOS ...", "system_rules_template": "# REGLAS FINALES ..."
}
```

### Output de `Componer System Prompt`
```json
{ "system_prompt": "<núcleo + ## SOBRE ESTE NEGOCIO + ## TONO + ## COMPORTAMIENTO DE VENTA + ## FLUJO DE CONVERSACIÓN + ## INSTRUCCIONES ADICIONALES + ## DATOS A CAPTURAR + reglas finales>",
  "modules_enabled": [] }
```

### Output de `Buscar Lead (Supabase)` v2
```json
{ "id":"<uuid>", "agency_id":"<uuid>", "full_name":"...", "display_name":null,
  "phone":"50612345678", "phone_e164":"50612345678", "status":null, "stage_id":null,
  "notes":null, "bot_summary":null, "created_at":"...", "last_inbound_at":null }
```

---

## 5. Fuera de alcance de ESTA spec (documentado para después)

- **F2 — Extractor como tool:** edge function `bot-actions` + action `extraer_datos` + tool `Extractor Tool (bot-actions)` conectada como `ai_tool` + cambiar el texto del bloque `## DATOS A CAPTURAR` de "tenelos presentes" a "llamá la tool extraer_datos". La query maestra YA trae `extractor_field_defs` para no re-tocarla. (Spec `2026-05-29-cablear-bot-config-runtime.md` §4.2.)
- **F3 — Atribución en intake:** modificar `ycloud-webhook` v2 para capturar `referral` → `leads.attribution` (migración 0013 YA en disco). Guard first-touch. (Misma spec §4.3.)
- **F4 — Auto-acciones + enum handoff configurable + tool `escalar_handoff`:** resto de actions en `bot-actions` con toggles + procedencia `'bot'` (columnas 0009). Reconecta `Request Handoff Tool` si en F1 se eligió Opción B. (Misma spec §11 F4.)
- **F5 — Módulo Propiedades:** tabla `properties` + edge function `properties-search` v2 + reconectar `Supabase Properties Tool` + `PROPERTIES_MODULE_ENABLED=true` + few-shot inmobiliario en el `prompt_fragment` del módulo (split doc §4.3).

---

## 6. Precondiciones del founder / orquestador (NO las hace el builder)

| # | Precondición | Estado | Bloqueante |
|---|---|---|---|
| **P1** | Repuntar credencial Postgres `pMsxqUvr0wDZsjIt` (host+password) al proyecto v2 `fahujscodhqlopycorzn`. El id NO cambia en el JSON. | Manual (N8N UI). Founder confirma si ya lo hizo. | SÍ — sin esto todo lo Postgres falla |
| **P2** | Setear `$env.SUPABASE_V2_URL` (y `$env.HANDOFF_INTERNAL_SECRET` si Opción A) en N8N env vars. | Manual. | Solo si Opción A handoff |
| **P3** | Aplicar migración 0012 (`leads.bot_summary`) en v2. Archivo YA en disco (`crm-v2/supabase/migrations/0012_leads_bot_summary.sql`). | Verificar si aplicada (MCP sin privilegios). | SÍ — `Buscar Lead` y `Apagar Chatbot — Lead Summary` la usan |
| **P4** | Seeds en v2: `bot_prompt_templates` core+system_rules activos, `bot_config` demo (fisio), `agency_channels` (número `50689839490` solo-dígitos), agency `demo`. | **YA EJECUTADOS** (`seed-bot-config.mjs`, `seed-demo-channel.mjs`, `seed-demo-agency.mjs`). ✓ | NO (hecho) |
| **P5** | **(Solo si Opción A handoff §3.3)** Desplegar `request-handoff` en v2 MODIFICADA para que el UPDATE incluya `handler='human'` (los triggers de handoff v1 NO existen en v2). | Pendiente. Backend-builder. | SÍ si Opción A |
| **P6** | **DECISIÓN del founder:** handoff F1 = Opción A (desplegar request-handoff v2) o **Opción B (recomendada: desconectar tool, usar detector)**. | Pendiente decisión. | SÍ — define la topología del build |
| **P7** | Verificar `extractor_field_defs` del demo sembradas (para que `## DATOS A CAPTURAR` no quede vacío). Opcional en F1 (el bloque se omite si no hay defs). | Verificar. | NO |

---

## 7. Riesgos previstos (OBLIGATORIO)

1. **Handoff que no silencia el bot (probabilidad ALTA si Opción A mal implementada).** Los triggers `tg_handoff_create_task`/`tg_handoff_mark_handled` que el v1 `request-handoff` asume NO existen en v2. Si se porta tal cual, `handoff_status='pending'` se escribe pero `handler` queda en `bot` → el bot sigue respondiendo. **Mitigación:** Opción B (usar el detector que sí pone `handler='human'`) o Opción A con `request-handoff` v2 modificada para setear `handler='human'`. Reviewer walkthrough §8.6.
2. **Columnas de la query maestra no coinciden con el schema real (probabilidad MEDIA).** La query asume nombres en `module_definitions`/`agency_modules`/`pipeline_stages` que esta spec NO verificó al 100% (no leí 0004 al detalle). **Mitigación:** el builder abre 0004/0003 y confirma nombres EXACTOS antes de pegar; el founder corre la query contra v2 antes de activar. Si falla, el nodo tiene `onError: continueRegularOutput` pero el bot no respondería (sin contexto).
3. **Número del business sembrado con formato distinto (probabilidad BAJA — ya mitigado).** El seed usa solo-dígitos (`50689839490`) y la query usa doble-normalización (`regexp_replace` ambos lados). Matchea con/sin `+`. Verificado en `seed-demo-channel.mjs`.
4. **`bot_config` malformado rompe el Compositor (probabilidad MEDIA).** El jsonb puede venir `{}` o parcial. **Mitigación:** el Compositor re-implementa `parseBotConfig()` con defaults completos (tono amigable, sales derivar_humano, arrays filtrados). Nunca accede a `bc.tone.preset` sin garantía.
5. **Latencia de 5s por mensaje con marker (probabilidad MEDIA).** Sin guard, un marker dispara HTTP a `properties-search` (404 en v2) y espera el timeout. **Mitigación:** guard `PROPERTIES_MODULE_ENABLED=false` (§3.2.F). Además, con la tool desconectada y bot_config de fisio, el agente no debería emitir markers.
6. **`bot_prompt_templates` sin fila activa (probabilidad BAJA — ya sembrado).** Si faltara, el Compositor usaría el fallback genérico. **Mitigación:** seed P4 ya ejecutado; fallback como red de seguridad.
7. **Inyectar TODO el contexto cada turno (tokens/costo) (probabilidad MEDIA).** El system prompt compuesto se reenvía cada invocación. **Mitigación:** prompt estático por agency; mantener `business_info`/`conversation_flow` concisos (responsabilidad del Panel). Context window de memoria sigue en 15. Monitorear costo en F1.
8. **`Detector de Descalificacion` enum produce valor que el CASE no mapea (probabilidad BAJA).** El CASE de `Apagar Chatbot — Conversation` tiene `ELSE 'qualified'` → siempre cae en un enum válido v2. Verificado compatible (port spec §3.6). Sin riesgo de cast fallido.

---

## 8. Casos edge a contemplar (OBLIGATORIO)

1. **Happy path (demo fisio configurado).** Lead escribe al `50689839490` → `Resolve Agency` resuelve agency `demo` + trae `bot_config` fisio (tono consultivo, flow 8 pasos, business_info de Robert, sales `mandar_link`) + core/rules sembrados → `Componer System Prompt` arma el prompt con TODOS los bloques → `Agente Principal` responde con personalidad de asistente de fisioterapia high-ticket (no inmobiliaria). **Resultado:** el bot suena como Robert configuró, SIN tocar n8n.
2. **Lead curioso / info-only.** "qué hacen ustedes" sin dar datos. El agente responde con `business_info`. **Resultado:** respuesta informativa coherente con el negocio configurado.
3. **Lead frustrado / pide humano.** "quiero hablar con una persona" / "ya me cansé" → `Detector de Descalificacion` marca `apagar_bot=true`, `razon` → `Apagar Chatbot — Conversation` pone `handler='human'`, `handoff_status='pending'` → Telegram avisa → bot se silencia. **Resultado:** handoff correcto vía detector (Opción B), bot deja de responder.
4. **Tool falla / timeout / 401.** En F1 el agente tiene a lo sumo `Request Handoff Tool` (si Opción A). Si falla, el núcleo (capa A regla 4) instruye NO abortar la respuesta al lead; el agente sigue conversando. **Resultado:** el lead NUNCA ve el error.
5. **Lead manda audio / imagen / link.** El switch `Is Text or Audio or Image?` normaliza antes de `Resolve Agency`. Audio → Whisper → texto. Imagen → mensaje placeholder ("mandó foto, pedí zona/código"). Link → Apify enriquece. El compositor opera sobre el texto normalizado. **Resultado:** sin cambios vs v5.5; el prompt compuesto aplica igual.
6. **Handoff debe silenciar el bot (el caso frágil — walkthrough obligatorio).** Tras `Apagar Chatbot — Conversation` (Opción B) o `request-handoff` v2 (Opción A), el siguiente mensaje del lead: `Get Conversation State` devuelve `handler='human'` → `Chatbot Activado?` da FALSE → el bot NO responde. **Resultado esperado:** bot mudo tras handoff. **Reviewer DEBE confirmar que `handler` quedó en 'human'** (el riesgo R1 vive acá).
7. **Agency SIN `bot_config` (jsonb `{}`).** `parseBotConfig({})` → defaults (amigable, derivar_humano, sin flow/business_info). El Compositor arma A + TONO(amigable) + COMPORTAMIENTO(derivar) + D. **Resultado:** bot genérico-coherente, no crashea.
8. **`bot_prompt_templates` core NULL (seed faltante).** Compositor usa el fallback. **Resultado:** bot responde con núcleo genérico mínimo + capas del bot_config. Funciona, "de fábrica".
9. **Lead nuevo sin `stage_id` (status NULL) o lead inexistente.** `Buscar Lead` LEFT JOIN → `status=NULL` tolerado. Si el lead no existe aún (intake no corrió) → `Lead Encontrado?` falso → `Abort - Lead No Encontrado`. **Resultado:** responde con status NULL, o aborta limpio sin crashear.
10. **REINICIAR.** "reinicio" → `Delete Postgres historial` borra `n8n_chat_histories` por session_id (`Telefono@businessPhone`) en v2 + `Vacia Redis`. **Resultado:** historial borrado, confirmación enviada.

---

## 9. Triggers de handoff (el cambio LOS TOCA — §3.3)

En F1 el handoff lo gobierna (Opción B recomendada) el `Detector de Descalificacion` (anti-loop) + las condiciones NARRATIVAS del núcleo agnóstico (capa A, sección ESCALAR A UN HUMANO del `core.txt` sembrado). Operacionalizadas (del split doc §1, ya en el seed):
- Lead PIDE explícitamente humano/persona/dueño → handoff.
- Lead muestra FRUSTRACIÓN clara (se queja del cuestionario/espera, dice que se cansó) → handoff SIN más preguntas.
- Tema COMPLEJO fuera de alcance (financiero/legal/técnico delicado) → handoff.
- Intención EXPLÍCITA de avanzar/cerrar/agendar EN ESTE TURNO (no mero interés) Y `sales_close_behavior=derivar_humano` → handoff. **En F1 esta última solo afecta TONO** (el disparo automático por venta es F4, tool `escalar_handoff`). El founder no debe esperar handoff-por-venta automático en F1.
- Negativos explícitos (NO escalar): NO por un dato suelto (zona/nombre/presupuesto) sin avance; NO en primer turno por pregunta general; NO por objeción trabajable. (Esto previene el bug 2026-05-20 de `qualified` con solo zona.)

El enum de `reason` configurable por agency es F4. En F1 el `Apagar Chatbot — Conversation` usa el CASE fijo (compatible con enum v2).

---

## 10. Tests manuales que el reviewer/founder debe correr

- **A (adaptación de personalidad):** mandar WhatsApp al `50689839490` → confirmar que el bot responde como asistente de FISIOTERAPIA (no inmobiliaria), tono consultivo, disclaimer médico si piden diagnóstico. Cambiar `bot_config.tone.preset` a `formal` en el Panel → confirmar trato de usted, SIN tocar n8n.
- **B (flujo):** confirmar que sigue los 8 pasos del `conversation_flow` fisio (saluda, pregunta el dolor, etc.) en orden, una pregunta por turno.
- **C (núcleo agnóstico):** confirmar que el prompt compuesto NO contiene "propiedad/Hans/CR-XXXX/Escazú" (el núcleo es agnóstico; lo inmobiliario salió).
- **D (handoff silencia):** "quiero hablar con Robert" → confirmar `conversations.handler='human'`, `handoff_status='pending'`, Telegram avisa, y el SIGUIENTE mensaje NO recibe respuesta del bot.
- **E (sin bot_config):** agency de prueba con `bot_config={}` → confirmar bot genérico-coherente, sin crash.
- **F (sin core):** quitar fila activa de `bot_prompt_templates` core → confirmar fallback, bot sigue respondiendo.
- **G (audio/imagen/link):** mandar audio → transcribe y responde con personalidad fisio; mandar link → Apify enriquece.
- **H (validator):** `node scripts/validate-n8n-expressions.js <output>.json` → 0 violations (clave por la desconexión de tools).
- **I (query maestra real):** correr la query §3.5 contra v2 con el número demo → confirmar 1 row con `bot_config`/`core_template` poblados y columnas de módulos sin error de schema (R2/R7).

---

## 11. Handoff al builder

- **Archivo de output esperado:** `n8n/workflows/chatbot-momentum-bot-v6-v1.json` (NUEVO; NO sobrescribir v5.5).
- **Archivo base del que parte:** `n8n/workflows/chatbot-inmobiliaria-demo-ycloud-sofia-v5.5.json` (NO `_n8n-current.json`).
- **Script de build esperado:** `scripts/build-bot-v6-v1.js` (idempotente; parte de v5.5; reescribe las 3 queries Postgres a v2 con doble-normalización; expande `Resolve Agency` a la query maestra; inserta el Code node `Componer System Prompt` e intercala su conexión; reapunta `systemMessage` del agente al Compositor; desconecta `Supabase Properties Tool` del agente; guard en `Expand Property Images`; trata `Request Handoff Tool` según Opción A/B; fuerza `active:false`; valida con `JSON.parse` + smoke tests).
- **Notas especiales al builder (NO obvias):**
  1. **NO renombrar `Resolve Agency`** — hay ~6 referencias `$('Resolve Agency')` downstream (Buscar Lead, Get Conversation State, Apagar Chatbot, Expand, contexto del agente). Solo expandí su query. Si renombrás, replace-all + validator 0 violations.
  2. **El prompt del Compositor (Code node) es largo** → no lo embebas como string escapado. Guardalo en `memory/research/<id>-compositor-code.md` con markers HTML y extraelo en el script (skill `n8n-workflow-build-script` §4). Los textos EXACTOS de TONE/SALES van copiados literal de `crm-v2/src/lib/admin/bot-config.ts` (§3.6).
  3. **VERIFICÁ los nombres de columna de la query maestra** contra `0004_modules.sql` y `0003_core_crm.sql` ANTES de pegar (R2/R7). Esta spec NO los confirmó al 100%.
  4. **Handoff (§3.3): esperá la decisión P6 del founder** (Opción A vs B) antes de decidir si desconectás `Request Handoff Tool`. Por defecto, Opción B (desconectar). El handoff DEBE silenciar el bot — verificá `handler='human'`.
  5. **`Supabase Properties Tool` se DESCONECTA del agente** (borrar la conexión `ai_tool`), NO se borra el nodo.
  6. **`message_count`:** NO lo agregues a ninguna query (el prompt lo lee con `|| 0`, columna inexistente en v2 a propósito).
  7. **NO toques `credentials.postgres.id`** (`pMsxqUvr0wDZsjIt`). El repunte de host/password es manual del founder (P1).
  8. **Bloque `## DATOS A CAPTURAR` en F1 es inerte** (sin tool extractor). Texto "tenelos presentes", NO "llamá la tool" (eso es F2).
  9. **`active:false`** forzado. El founder activa tras P1+P3+P6 y los tests.
- **Dependencia de prompt-designer:** el contenido de `bot_prompt_templates` core+system_rules YA está diseñado y sembrado (`seed-prompts/core.txt`, `system_rules.txt`). El builder NO los escribe; el Compositor los lee de la DB.
