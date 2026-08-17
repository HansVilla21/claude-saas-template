# Spec: Portar la capa de datos de Sofia v5.4 al schema v2 (Momentum AI CRM)

**Fecha:** 2026-05-29
**Autor:** n8n-architect
**Workflow afectado:** `crm-v2/_n8n-current.json` (workflow N8N id `yqSol7HvYrR9Pl1A`, "Chatbot Inmobiliaria Demo - YCloud (Sofia) v5.4", 57 nodos)
**Versión actual → propuesta:** Sofia v5.4 (capa de datos v1) → Sofia v5.4-v2db (mismo flujo, capa de datos v2)
**Trigger del cambio:** Migración de proyecto Supabase. El bot apunta al proyecto v1 (`ugkunpsohrimxetofawv`); hay que repuntarlo al v2 (`fahujscodhqlopycorzn`) y remapear nombres de tabla/columna que cambiaron entre schemas.

---

## 0. Alcance (leé esto primero)

**EN alcance (esta spec):** SOLO la capa de datos. El MISMO flujo inmobiliario corriendo contra la DB v2.
- Repuntar la credencial Postgres de N8N al v2.
- Reescribir las 6 queries Postgres (`Resolve Agency`, `Buscar Lead`, `Get Conversation State`, `Apagar Chatbot — Conversation`, `Apagar Chatbot — Lead Summary`, `Delete Postgres historial` + el select `Conversation`) por sus equivalentes v2.
- Remapear la resolución agency-por-número (`whatsapp_numbers` → `agency_channels`).
- Remapear `leads.status` → `pipeline_stages.slug` y `leads.phone_e164` → `leads.phone`.
- Migración aditiva `0012` para `leads.bot_summary`.
- Dejar el path de `properties` INERTE y seguro (sin romper el loop core).
- Repuntar el hardcode v1 del nodo `Expand Property Images` (URL + secret de la edge function `properties-search`).

**FUERA de alcance (NO tocar acá — es Bot v6 después):**
- Generalizar el flujo (sacarle lo inmobiliario / Prompt Compositor multi-nicho).
- Multi-tenant real (RLS, varias agencies sirviendo a la vez).
- Auto-acciones con procedencia `*_set_by='bot'` (columnas de migración 0009): el bot NO escribe `stage_id`, `is_qualified`, `stage_set_by`, etc. en esta fase. Solo lee/escribe lo que ya escribía en v1 (handoff + summary).
- Reescribir el system prompt (sigue siendo el v5.4 inmobiliario tal cual).
- Construir el módulo `properties` en v2.

---

## 1. Problema / requerimiento

El workflow de Sofia (el bot de WhatsApp del demo inmobiliario) hoy lee y escribe contra el Supabase **v1** (`ugkunpsohrimxetofawv`), usando una credencial Postgres de N8N llamada `CRM System` (id `pMsxqUvr0wDZsjIt`) y queries escritas para el schema viejo (Casa CRM v1). El founder migró el producto al schema **v2** (`fahujscodhqlopycorzn`, "Momentum AI CRM"), donde varias tablas y columnas se renombraron o se reemplazaron por estructuras configurables (ej. el enum fijo `leads.status` pasó a ser `stage_id` FK a `pipeline_stages`; `whatsapp_numbers` pasó a `agency_channels`).

El objetivo de este cambio es **portar la capa de datos** del bot al v2 SIN cambiar la lógica del flujo inmobiliario. Es el mismo Sofia v5.4; solo cambia contra qué base corre. Cuando esté listo, el demo inmobiliario será el primer "cliente" (agency `inmobiliaria-demo`) del CRM v2.

---

## 2. Estado actual relevante

### 2.1 Cómo la capa de datos vive HOY en el workflow

Todos los nodos de datos usan UNA sola credencial Postgres de N8N: `CRM System` (id `pMsxqUvr0wDZsjIt`) → apunta al v1. Nodos afectados (verificado leyendo el JSON):

| Nodo | Tipo | Qué hace hoy (v1) |
|---|---|---|
| `Resolve Agency` | postgres (executeQuery) | Resuelve agency + flag bot por número del business. Lee `whatsapp_numbers` JOIN `agencies`. |
| `Buscar Lead (Supabase)` | postgres (executeQuery) | Busca el lead por `(agency_id, phone_e164)`. Trae `status`, `bot_summary`, `last_inbound_at`. |
| `Get Conversation State` | postgres (executeQuery) | Lee `conversations.{id, handler, bot_paused_until, archived_at}` por `(agency_id, lead_id)`. |
| `Chatbot Activado?` | if | AND: `handler='bot'` Y `bot_paused_until` vencido Y `Resolve Agency.bot_enabled===true`. |
| `Conversation` | postgres (select) | Lee `n8n_chat_histories` por `session_id`. |
| `Delete Postgres historial` | postgres (deleteTable) | Borra `n8n_chat_histories` por `session_id` (flujo REINICIAR). |
| `Postgres Chat Memory - Sofia` | langchain memoryPostgresChat | Memoria conversacional del agente. Usa la credencial Postgres. |
| `Apagar Chatbot — Conversation` | postgres (executeQuery) | UPDATE `conversations` → `handler='human'`, `handoff_status='pending'`, mapea `handoff_reason`, set `handoff_summary`/`handoff_at`. |
| `Apagar Chatbot — Lead Summary` | postgres (executeQuery) | UPDATE `leads SET bot_summary=$1`. |
| `Expand Property Images` | code | Hace HTTP POST a la edge function `properties-search` del v1 (URL + secret HARDCODEADOS). Es el ÚNICO path de "properties" del workflow. |

### 2.2 Hallazgos al leer el JSON (importantes, cambian supuestos)

1. **NO existe un nodo LangChain `Properties Tool` conectado al agente.** El agente `Agente Principal - Sofia` NO tiene ninguna conexión `ai_tool`. La sección "Supabase Properties Tool" del system prompt describe una tool que el workflow real NO tiene cableada. El único acceso a propiedades es el Code node `Expand Property Images`, que detecta el marker `[IMG:CR-XXXX]` en la salida del agente y llama por HTTP a la edge function `properties-search`.

2. **El único hardcode v1 del workflow** (verificado: 1 sola ocurrencia de `ugkunpsohrimxetofawv` en todo el JSON) está en `Expand Property Images`:
   ```
   const SUPABASE_URL = 'https://ugkunpsohrimxetofawv.supabase.co';
   const SEARCH_SECRET = '86eae3d40543b0c713d64fb554c010c16e8399e88fa7ccf5a7cef8dd42af1620';
   ```
   Todo lo demás (queries Postgres, memoria) pasa por la credencial `CRM System` de N8N, así que repuntar esa credencial repunta todo lo Postgres de un solo golpe.

3. **`Expand Property Images` ya es fail-safe por diseño.** Si la edge function da error/timeout, el catch devuelve `{ error: 'fetch_failed' }`, el código limpia el marker del texto (`cleanMarkers`) y empuja igual el texto del bot. **El loop core (recibir → responder → memoria → enviar) NO depende de que properties funcione.** Esto es clave para la decisión de dejar properties inerte.

4. **`message_count` no existe en `conversations` v2** (ni existía como columna en v1; el prompt lo lee con `|| 0`). El prompt arma el contexto con `$('Get Conversation State').first().json.message_count || 0`. No hay que crear esa columna; el `|| 0` la tolera. Se documenta como nota al builder para que NO intente agregarla a la query.

5. **`session_id` de la memoria** se compone como `ID + "@" + businessPhone` (ej. `50612345678@50689839490`). Esto NO cambia entre v1 y v2 — `n8n_chat_histories` es idéntica en ambos schemas.

### 2.3 Diferencias de schema confirmadas (leyendo migraciones v2)

| Concepto | v1 (Casa CRM) | v2 (Momentum AI CRM) | Migración v2 |
|---|---|---|---|
| Tabla número→agency | `whatsapp_numbers (id, agency_id, phone_number, is_active)` | `agency_channels (id, agency_id, channel, phone_number, is_active, ...)` + filtrar `channel='whatsapp'` | 0010 |
| Kill-switch del bot | `agencies.bot_enabled` (boolean) | NO existe. `agencies.is_active` (boolean) + `agencies.settings` jsonb | 0002, 0009 |
| Agency "viva" | `agencies.archived_at IS NULL` | NO existe `archived_at`. Usar `agencies.is_active = true` | 0002 |
| Teléfono del lead | `leads.phone_e164` | `leads.phone` (también `wa_user_id`, `whatsapp_phone`) | 0003 |
| Estado del lead | `leads.status` (enum/string 'nuevo') | NO existe. `leads.stage_id` FK → `pipeline_stages(id)`; etapa por `pipeline_stages.slug` | 0003 |
| Resumen del bot | `leads.bot_summary` | NO existe → **se agrega vía migración 0012** | (nueva) |
| Última entrada | `leads.last_inbound_at` | NO existe en `leads`. `conversations.last_inbound_at` | 0003 |
| Conversación handoff | `conversations.{handler, handoff_status, handoff_reason, handoff_summary, handoff_at, bot_paused_until, archived_at}` | **TODAS existen, compatibles** | 0003 |
| Memoria del bot | `n8n_chat_histories (id, session_id, message)` | **Idéntica** | 0005 |
| Properties | edge function `properties-search` (v1) | NO existe el módulo `properties` en v2 | (no construido) |

**Enums v2 confirmados (migración 0001):**
- `conversation_handoff_status` = `('none', 'pending', 'handled')`. Default de la columna: `'none'`.
- `conversation_handoff_reason` = `('qualified', 'scheduling', 'objection_complex', 'bot_stuck', 'user_requested', 'manual')`. **Los 5 valores que produce el CASE actual (`qualified`, `scheduling`, `objection_complex`, `bot_stuck`, `manual`) son TODOS válidos en v2.** El cast `::conversation_handoff_reason` funciona tal cual.

---

## 3. Cambio propuesto

### 3.1 Nodos a crear
| Nombre | Type | typeVersion | Posición aprox. | Parámetros críticos |
|---|---|---|---|---|
| (ninguno) | — | — | — | Esta es una port de capa de datos: no se crea topología nueva. |

### 3.2 Nodos a modificar
| Nombre | Qué cambia | Por qué |
|---|---|---|
| `Resolve Agency` | Query reescrita a v2 (ver §3.6). Mismo `queryReplacement`. | `whatsapp_numbers`→`agency_channels`; sin `bot_enabled`/`archived_at`. |
| `Buscar Lead (Supabase)` | Query reescrita a v2 (ver §3.6). Mismo `queryReplacement`. | `phone_e164`→`phone`; `status`→slug por JOIN; `last_inbound_at` desde conversations. |
| `Get Conversation State` | Query: agregar `handoff_status, handoff_reason` al SELECT (opcional, ver §3.6). Mismo `queryReplacement`. | Las columnas existen igual en v2; el cambio es menor (compat). |
| `Chatbot Activado?` | El condition `ca-agency-bot-enabled` cambia de `bot_enabled` a `bot_enabled` resuelto en la query v2 (alias, ver §3.4). | El alias `bot_enabled` se preserva en la query v2 para no tocar el `if`. |
| `Apagar Chatbot — Conversation` | Sin cambios en SQL (ya compatible con enums v2). Solo corre contra v2 vía credencial. | Verificado: el CASE produce solo valores válidos en v2. |
| `Apagar Chatbot — Lead Summary` | Sin cambios en SQL (depende de migración 0012). | `bot_summary` se crea en 0012; la query queda igual. |
| `Conversation` (select n8n_chat_histories) | Sin cambios en SQL. Solo credencial. | Tabla idéntica. |
| `Delete Postgres historial` | Sin cambios en SQL. Solo credencial. | Tabla idéntica. |
| `Postgres Chat Memory - Sofia` | Solo cambia la credencial Postgres (ver §3.7). | Tabla idéntica; solo repuntar host. |
| `Expand Property Images` | Cambiar `SUPABASE_URL` y `SEARCH_SECRET` al v2 + guard de "properties no disponible" (ver §3.5). | Hardcode v1 + módulo properties no existe en v2. |

**Nota sobre la credencial:** TODOS los nodos `n8n-nodes-base.postgres` y el `memoryPostgresChat` usan la MISMA credencial `CRM System` (id `pMsxqUvr0wDZsjIt`). Repuntar esa credencial al v2 (paso manual del founder, §5) afecta a todos. El builder NO toca el `credentials.postgres.id` en el JSON (sigue siendo la misma credencial; solo su contenido cambia en la UI). Ver §3.7.

### 3.3 Nodos a borrar
| Nombre | Razón |
|---|---|
| (ninguno) | No se borra topología. `Expand Property Images` se conserva pero se neutraliza de forma segura (§3.5). |

### 3.4 Conexiones a crear / borrar
- **Ninguna.** La topología del flujo NO cambia. Esto es exclusivamente cambio de queries + credencial + un hardcode. (El reviewer debe confirmar que el diff de `connections` es vacío.)

### 3.5 Manejo de `properties` (módulo no construido en v2) — INERTE Y SEGURO

El módulo `properties` NO existe en v2. El único path es `Expand Property Images` llamando a la edge function `properties-search`. Decisión del founder: dejarlo PENDIENTE pero que NO rompa el loop core.

**Estrategia recomendada (mínima y segura): repuntar URL/secret al v2 + apoyarse en el fail-safe que ya existe.**

1. **Repuntar el hardcode al v2** en `Expand Property Images`:
   - `SUPABASE_URL` → `'https://fahujscodhqlopycorzn.supabase.co'`.
   - `SEARCH_SECRET` → el secret del v2 si la edge function `properties-search` se llegara a desplegar (mientras tanto, queda apuntando a una función que devuelve 404 → cae al catch → fail-safe).

   > Nota de seguridad al builder: el secret va **hardcodeado en el Code node** tal como está hoy (no es ideal, pero es el estado de partida y NO es parte de este alcance arreglarlo). NO inventes un secret; si el founder no tiene la edge function v2 desplegada, dejá un placeholder claramente marcado y documentalo en §5. NO commitees secrets reales en el repo fuera del JSON del workflow (que ya vive en N8N).

2. **El fail-safe ya cubre el caso "properties no disponible".** Como `properties-search` no está desplegada en v2, la llamada HTTP fallará (404/timeout) → el catch devuelve `{ error: 'property_not_found' | 'fetch_failed' }` → `fetchPropertyImages` retorna `fotoUrls: []` → el nodo limpia el marker `[IMG:CR-XXXX]` del texto y empuja igual el texto del bot. **El lead recibe el texto sin foto; el bot NO se rompe.** Esto YA está implementado en el código actual (verificado).

3. **Guard adicional recomendado (defensa explícita):** agregar al inicio de `Expand Property Images` un flag de módulo:
   ```js
   const PROPERTIES_MODULE_ENABLED = false; // v2: módulo properties no construido todavía
   ```
   Y al detectar un marker, si `!PROPERTIES_MODULE_ENABLED`, saltar el fetch directo y tratarlo como `fotoUrls: []` (limpiar marker, empujar texto). Esto evita siquiera intentar la llamada HTTP (más rápido, sin esperar el timeout de 5s por mensaje con marker, y sin logs de error ruidosos). **Recomendado** porque elimina el costo de 5s de latencia por cada mensaje donde Sofia decida poner un marker.

   > El builder elige entre (2) "confiar en el fail-safe" o (3) "guard explícito". El architect recomienda (3) por la latencia. El reviewer debe confirmar que en AMBOS casos el loop core completa con `fotoUrls: []`.

4. **Lo que NO hay que hacer:** NO desconectar el nodo del flujo (rompería la cadena hacia `Split Out`/`Loop Over Items`/`Send Chunk`). NO borrarlo. El nodo debe seguir recibiendo la salida del agente y emitiendo los items `type:'text'` para que los chunks lleguen al lead.

### 3.6 Por cada nodo Postgres: query actual → query v2 propuesta (EXACTAS, listas para pegar)

---

#### `Resolve Agency`

**Query ACTUAL (v1):**
```sql
SELECT w.id, w.agency_id, w.phone_number, a.bot_enabled
FROM public.whatsapp_numbers w
JOIN public.agencies a ON a.id = w.agency_id
WHERE w.phone_number = $1
  AND w.is_active = true
  AND a.archived_at IS NULL
LIMIT 1
```
`queryReplacement` ACTUAL: `={{ $('Extract Variables').first().json.businessPhone }}`

**Query v2 PROPUESTA:**
```sql
SELECT ac.id,
       ac.agency_id,
       ac.phone_number,
       (a.is_active AND COALESCE((a.settings->>'bot_enabled')::boolean, true)) AS bot_enabled
FROM public.agency_channels ac
JOIN public.agencies a ON a.id = ac.agency_id
WHERE ac.channel = 'whatsapp'
  AND ac.phone_number = regexp_replace($1, '\D', '', 'g')
  AND ac.is_active = true
  AND a.is_active = true
LIMIT 1
```
`queryReplacement` v2: **SIN CAMBIOS** → `={{ $('Extract Variables').first().json.businessPhone }}`

**Notas críticas para el builder:**
- **Kill-switch del bot (decisión):** v2 no tiene `agencies.bot_enabled`. El alias `bot_enabled` se compone como `a.is_active AND COALESCE((a.settings->>'bot_enabled')::boolean, true)`. Esto preserva la semántica del v1 (decisión 2026-05-21 en `memory/decisions.md`: el flag es un kill-switch global, no un setter). El default `true` cuando la key no existe en `settings` significa "bot prendido por defecto". El founder apaga el bot poniendo `settings.bot_enabled = false` (o `is_active = false` para suspender toda la agency). **El nodo `Chatbot Activado?` NO se toca** porque sigue leyendo `$('Resolve Agency').first().json.bot_enabled === true`.
- **Normalización del número (GOTCHA crítico):** en `agency_channels` v2 el `phone_number` está sembrado como SOLO DÍGITOS (`50689839490`, sin `+`). El `businessPhone` que llega del webhook YCloud (`whatsappInboundMessage.to`) puede venir con o sin `+`. El `regexp_replace($1, '\D', '', 'g')` quita TODO lo no-dígito del input antes de comparar, así matchea con/sin `+`/espacios/guiones. **NO uses `new URL()` ni constructores en SQL — esto es regexp_replace nativo de Postgres, seguro.** Verificá que el seed de `agency_channels` para el demo tenga `phone_number` solo-dígitos (paso founder, §5).

---

#### `Buscar Lead (Supabase)`

**Query ACTUAL (v1):**
```sql
SELECT id, agency_id, full_name, phone_e164, status, notes, bot_summary,
       created_at, last_inbound_at
FROM public.leads
WHERE agency_id = $1
  AND phone_e164 = $2
LIMIT 1
```
`queryReplacement` ACTUAL: `={{ $('Resolve Agency').first().json.agency_id }}, ={{ $('ID y Mensaje').first().json.ID }}`

**Query v2 PROPUESTA:**
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
  AND (l.phone = regexp_replace($2, '\D', '', 'g')
       OR l.phone = $2
       OR l.wa_user_id = $2)
  AND l.deleted_at IS NULL
LIMIT 1
```
`queryReplacement` v2: **SIN CAMBIOS** → `={{ $('Resolve Agency').first().json.agency_id }}, ={{ $('ID y Mensaje').first().json.ID }}`

**Notas críticas para el builder:**
- **`phone_e164` → `phone`:** se mantiene un alias `l.phone AS phone_e164` para que cualquier nodo downstream que aún lea `phone_e164` no rompa (defensa). El campo canónico v2 es `phone`.
- **Matching del teléfono:** `ID` (= `userPhone` del webhook) puede venir con o sin `+`. El OR cubre: solo-dígitos normalizado, valor crudo, y `wa_user_id`. El seed de leads en v2 puede tener `phone` solo-dígitos o E.164 — el OR tolera ambos. **El reviewer debe confirmar que el formato sembrado del demo matchea al menos una rama del OR.**
- **`status` → slug:** v2 no tiene `leads.status`. Se expone `ps.slug AS status` vía LEFT JOIN a `pipeline_stages`. **LEFT JOIN (no INNER)** porque un lead nuevo puede tener `stage_id = NULL` (caso edge §7). Si `stage_id` es NULL, `status` viene NULL — el flujo lo tolera (el prompt no bifurca por status, solo lo trae para contexto).
- **`bot_summary`:** depende de la migración 0012 (§3.8). Si 0012 NO está aplicada, esta query FALLA con "column does not exist". El builder/founder DEBE aplicar 0012 ANTES de importar el workflow. El reviewer debe marcarlo como bloqueante.
- **`last_inbound_at`:** v2 lo tiene en `conversations`, no en `leads`. Se trae por LEFT JOIN al `conversations` de canal whatsapp. Si no hay conversación todavía (lead nuevo), viene NULL — tolerado.
- **`display_name`:** se agrega porque el prompt lo referencia (`full_name || display_name || 'no confirmado'`). En v1 no estaba en el SELECT; el `|| 'no confirmado'` lo cubría. Agregarlo es mejora menor sin riesgo.
- **`onError: continueRegularOutput`** del nodo se conserva (ya está así). Si la query falla por 0012 no aplicada, el nodo no aborta el flujo pero devuelve vacío → `Lead Encontrado?` daría falso → flujo aborta limpio. Aun así, 0012 es bloqueante: sin lead no hay bot.

---

#### `Get Conversation State`

**Query ACTUAL (v1):**
```sql
SELECT id, handler, bot_paused_until, archived_at
FROM public.conversations
WHERE agency_id = $1
  AND lead_id = $2
LIMIT 1
```
`queryReplacement` ACTUAL: `={{ $('Resolve Agency').first().json.agency_id }}, ={{ $('Buscar Lead (Supabase)').first().json.id }}`

**Query v2 PROPUESTA:**
```sql
SELECT id, handler, bot_paused_until, archived_at,
       handoff_status, handoff_reason
FROM public.conversations
WHERE agency_id = $1
  AND lead_id = $2
  AND channel = 'whatsapp'
LIMIT 1
```
`queryReplacement` v2: **SIN CAMBIOS** → `={{ $('Resolve Agency').first().json.agency_id }}, ={{ $('Buscar Lead (Supabase)').first().json.id }}`

**Notas para el builder:**
- Todas las columnas existen igual en v2. El cambio es mínimo: agregar `AND channel = 'whatsapp'` (porque v2 permite múltiples conversations por lead, una por canal — el UNIQUE es `(agency_id, lead_id, channel)`). Sin este filtro, si el lead tuviera también una conv de IG, el `LIMIT 1` podría traer la equivocada.
- `handoff_status, handoff_reason` se agregan al SELECT por si el flujo quiere consultarlos (opcional; el `Chatbot Activado?` no los usa hoy). No rompe nada.

---

#### `Apagar Chatbot — Conversation`

**Query ACTUAL (v1) = Query v2 (SIN CAMBIOS en SQL):**
```sql
UPDATE public.conversations
SET handler = 'human',
    handoff_status = 'pending',
    handoff_reason = (CASE LOWER(COALESCE($1, ''))
      WHEN 'qualified'         THEN 'qualified'
      WHEN 'scheduling'        THEN 'scheduling'
      WHEN 'objection_complex' THEN 'objection_complex'
      WHEN 'bot_stuck'         THEN 'bot_stuck'
      WHEN 'manual'            THEN 'manual'
      WHEN 'agendar'           THEN 'scheduling'
      WHEN 'visita'            THEN 'scheduling'
      WHEN 'agendar_visita'    THEN 'scheduling'
      WHEN 'compra'            THEN 'qualified'
      WHEN 'cierre'            THEN 'qualified'
      WHEN 'listo_para_cerrar' THEN 'qualified'
      WHEN 'objecion'          THEN 'objection_complex'
      WHEN 'objeción'          THEN 'objection_complex'
      WHEN 'descalificado'     THEN 'manual'
      ELSE 'qualified'
    END)::conversation_handoff_reason,
    handoff_summary = $4,
    handoff_at = NOW()
WHERE agency_id = $2
  AND lead_id = $3
  AND handoff_status <> 'pending'
```
`queryReplacement` (SIN CAMBIOS): `={{ $('Detector de Descalificacion').first().json.output.razon }}, ={{ $('Resolve Agency').first().json.agency_id }}, ={{ $('Buscar Lead (Supabase)').first().json.id }}, ={{ $('Detector de Descalificacion').first().json.output.resumen_lead }}`

**Notas para el builder:**
- **NO cambia el SQL.** Verificado: los 5 valores destino del CASE (`qualified`, `scheduling`, `objection_complex`, `bot_stuck`, `manual`) son TODOS válidos en el enum `conversation_handoff_reason` de v2. El cast funciona.
- **Compatibilidad del WHERE:** en v2 `handoff_status` default es `'none'`. La condición `handoff_status <> 'pending'` se cumple para conversaciones nuevas (`none`) → el UPDATE pega. Si ya está `pending` (handoff previo), NO re-escribe (idempotente, correcto). Mismo comportamiento que v1.
- **Recomendación (opcional, fuera de alcance estricto):** agregar `AND channel = 'whatsapp'` al WHERE para multi-canal futuro. NO es necesario ahora (un solo canal). El builder puede omitirlo para minimizar cambios. Documentado para Bot v6.

---

#### `Apagar Chatbot — Lead Summary`

**Query ACTUAL (v1) = Query v2 (SIN CAMBIOS en SQL, requiere migración 0012):**
```sql
UPDATE public.leads
SET bot_summary = $1
WHERE id = $2
  AND agency_id = $3
```
`queryReplacement` (verificar en JSON; mismo orden que v1).

**Notas para el builder:**
- **NO cambia el SQL**, PERO depende de que la migración 0012 (§3.8) agregue `leads.bot_summary`. Sin 0012, esta query falla con "column bot_summary does not exist". **Bloqueante.**

---

#### `Conversation` (select n8n_chat_histories) y `Delete Postgres historial`

- **SIN CAMBIOS en SQL.** La tabla `n8n_chat_histories (id serial, session_id varchar, message jsonb)` es idéntica en v2 (migración 0005). Solo cambia la credencial (§3.7).
- El `session_id` se compone como `ID + "@" + businessPhone`. No cambia.

---

### 3.7 Credencial Postgres a repuntar (PASO MANUAL del founder)

- Credencial N8N: `CRM System` (id `pMsxqUvr0wDZsjIt`). Hoy apunta al host Postgres del v1.
- **Acción (founder, en la UI de N8N):** editar esa credencial y cambiar:
  - **Host:** `db.fahujscodhqlopycorzn.supabase.co` (o el pooler `aws-0-<region>.pooler.supabase.com` con el usuario `postgres.fahujscodhqlopycorzn` si usa connection pooling — el founder confirma cuál usa hoy para v1 y replica el formato con el ref v2).
  - **Password:** el del proyecto v2 (Supabase → Settings → Database → connection string).
  - **Database:** `postgres`. **Port:** `5432` (directo) o `6543` (pooler). **SSL:** igual que v1 (normalmente `require`/`allow`).
- **El builder NO toca esto.** El builder NO puede setear secrets de credenciales. El `credentials.postgres.id` en el JSON se MANTIENE igual (`pMsxqUvr0wDZsjIt`); solo el founder cambia el contenido de esa credencial en la UI.
- **Alternativa:** crear una credencial NUEVA `CRM v2` apuntando al v2 y que el builder reapunte cada nodo a la nueva. **NO recomendado** — más superficie de error (10 nodos a reapuntar). Repuntar la credencial existente es 1 cambio, atómico. **Decisión: repuntar la credencial existente.**

> Si el founder prefiere conservar el v1 corriendo en paralelo (no migrar la misma credencial), entonces SÍ hay que crear una credencial v2 nueva y el builder reapunta los nodos. El founder debe decidir esto ANTES del build (ver §5, decisión #0). Por defecto: repuntar la existente.

### 3.8 Migración nueva 0012 (leads.bot_summary) — la aplica el founder/orquestador, NO el builder

**Archivo:** `crm-v2/supabase/migrations/0012_leads_bot_summary.sql`

**Contenido propuesto (aditivo, idempotente):**
```sql
-- =============================================================================
-- Momentum AI CRM — Migration 0012: leads.bot_summary
-- =============================================================================
-- El bot Sofia escribe un resumen del lead al hacer handoff (nodo
-- "Apagar Chatbot — Lead Summary"). v1 tenía leads.bot_summary; v2 no lo portó.
-- Aditiva y segura: no toca nada existente.
-- =============================================================================

alter table public.leads
    add column if not exists bot_summary text;

comment on column public.leads.bot_summary is
    'Resumen del lead generado por el bot al hacer handoff. Lo escribe el workflow N8N (nodo Apagar Chatbot — Lead Summary). Heredado del v1.';
```

**Notas:**
- Es **bloqueante** para los nodos `Buscar Lead (Supabase)` (SELECT `bot_summary`) y `Apagar Chatbot — Lead Summary` (UPDATE `bot_summary`). Debe aplicarse ANTES de importar el workflow v2.
- El architect NO aplica migraciones. El orquestador/founder la aplica vía Supabase MCP (`apply_migration`) o `supabase db push`.

---

## 4. Schemas

### Input al workflow (sin cambios — es el webhook de YCloud)
El webhook entrante (`whatsapp.inbound_message.received`) no cambia. El `businessPhone` (= `whatsappInboundMessage.to`) y `userPhone` (= `whatsappInboundMessage.from`) se siguen extrayendo en `Extract Variables`. **No cambia el formato del input.**

### Output esperado de `Resolve Agency` (v2)
```json
{
  "id": "<uuid del agency_channel>",
  "agency_id": "<uuid de la agency>",
  "phone_number": "50689839490",
  "bot_enabled": true
}
```
> `bot_enabled` es ahora un campo COMPUESTO (no una columna). El nodo `Chatbot Activado?` lo lee igual que antes (`=== true`).

### Output esperado de `Buscar Lead (Supabase)` (v2)
```json
{
  "id": "<uuid lead>",
  "agency_id": "<uuid>",
  "full_name": "Juan Pérez",
  "display_name": null,
  "phone": "50612345678",
  "phone_e164": "50612345678",
  "status": "nuevo",
  "stage_id": "<uuid stage o null>",
  "notes": null,
  "bot_summary": null,
  "created_at": "2026-05-29T...",
  "last_inbound_at": "2026-05-29T..."
}
```
> `status` puede ser `null` si el lead no tiene `stage_id`. `bot_summary`/`last_inbound_at` pueden ser `null`.

### Output esperado de `Get Conversation State` (v2)
```json
{
  "id": "<uuid conversation>",
  "handler": "bot",
  "bot_paused_until": null,
  "archived_at": null,
  "handoff_status": "none",
  "handoff_reason": null
}
```

---

## 5. Variables de entorno / pasos manuales del founder

| Var / acción | Para qué | Dónde se setea |
|---|---|---|
| **Decisión #0 (PRE-BUILD):** ¿repuntar credencial existente o crear v2 nueva? | Define si el builder reapunta nodos o no | Founder decide antes del build. Default: repuntar la existente. |
| **Repuntar credencial `CRM System`** (host + password v2) | Que TODO lo Postgres apunte al v2 | N8N UI → Credentials → `CRM System` (id `pMsxqUvr0wDZsjIt`). **MANUAL.** |
| **Aplicar migración 0012** | Crear `leads.bot_summary` | Supabase v2 (MCP `apply_migration` o `supabase db push`). **MANUAL / orquestador.** |
| **Sembrar `agency_channels`** del demo | Resolver número→agency en v2 | INSERT en v2: `(channel='whatsapp', phone_number='50689839490' [SOLO DÍGITOS], agency_id=<demo>, is_active=true)`. **MANUAL.** |
| **Sembrar la agency `inmobiliaria-demo`** + `pipeline_stages` | Que exista la agency y al menos una etapa inicial | INSERT en v2 `agencies` (slug `inmobiliaria-demo`, `is_active=true`, opcional `settings.bot_enabled=true`) + `pipeline_stages` (al menos slug `nuevo` position 0). **MANUAL.** |
| **`SEARCH_SECRET` v2** (si se despliega `properties-search` en v2) | Que el path de properties funcione (futuro) | Hardcode en `Expand Property Images` + secret de la edge function v2. **Por ahora: placeholder, properties queda inerte.** |
| **YCloud webhook endpoint** (n8n) | Que el bot reciba inbound | NO cambia si es la misma cuenta YCloud y el workflow conserva el mismo path `ycloud-inmobiliaria-demo`. **Verificar que no haya doble-proceso v1+v2** (ver §6 riesgo 1). |

---

## 6. Riesgos previstos (OBLIGATORIO)

1. **Doble-proceso v1 + v2 (probabilidad ALTA si no se gestiona).** Si la credencial `CRM System` se repunta al v2 PERO el endpoint YCloud sigue apuntando al workflow viejo del v1 (u otro Supabase con su propio bot activo para el mismo número), dos sistemas escriben y dos bots responden al lead → mensajes duplicados, doble handoff, lead confundido. **Mitigación:** este es el MISMO workflow (id `yqSol7HvYrR9Pl1A`), así que repuntar la credencial lo mueve entero al v2; no hay dos workflows. PERO el founder debe confirmar que NO hay un segundo endpoint/edge-function del v1 procesando el mismo número en paralelo. Si el v1 (Casa CRM) sigue vivo con el mismo número YCloud, hay que decidir: o migrar (apagar v1) o usar un número distinto para el demo v2. **Bloqueante de prod hasta confirmarlo.**

2. **Migración 0012 no aplicada antes de importar (probabilidad MEDIA).** Si el workflow v2 se importa/activa antes de correr 0012, las queries `Buscar Lead` y `Apagar Chatbot — Lead Summary` fallan con "column bot_summary does not exist". `Buscar Lead` tiene `onError: continueRegularOutput` → no aborta pero devuelve vacío → `Lead Encontrado?` falso → bot no responde (silencio). `Apagar Chatbot — Lead Summary` NO tiene onError documentado → el handoff podría romper a mitad. **Mitigación:** 0012 es paso #1 del founder (§5), ANTES de importar. El reviewer marca 0012 como precondición dura.

3. **Número del business sembrado con formato distinto (probabilidad MEDIA).** Si `agency_channels.phone_number` se siembra en E.164 con `+` (`+50689839490`) en vez de solo-dígitos, el `regexp_replace($1,'\D','','g')` normaliza el INPUT pero compara contra el valor crudo de la columna → no matchea → `Resolve Agency` devuelve vacío → bot no responde a NADIE. **Mitigación:** la query normaliza el input; el seed DEBE ser solo-dígitos (`50689839490`) como dicta el hecho confirmado. Alternativa robusta: normalizar AMBOS lados (`regexp_replace(ac.phone_number,'\D','','g') = regexp_replace($1,'\D','','g')`) — **el builder DEBE usar esta variante de doble-normalización** para blindar contra seed inconsistente. (Ajustar la query de §3.6 a doble-normalización: ver nota al builder en §11.)

4. **Kill-switch ambiguo `is_active` vs `settings.bot_enabled` (probabilidad MEDIA).** `agencies.is_active` semánticamente significa "agency activa/suspendida" (tenancy/billing), no "bot prendido". Si el founder apaga el bot esperando `is_active=false` pero eso además rompe otras cosas que dependen de `is_active` (frontend, RLS), efecto colateral. **Mitigación:** el kill-switch del bot es `settings.bot_enabled` (con default `true`), independiente de `is_active`. La query usa `is_active AND COALESCE(settings.bot_enabled, true)` → el founder apaga SOLO el bot poniendo `settings.bot_enabled=false`, sin tocar `is_active`. Documentar al founder que el toggle del bot vive en `settings.bot_enabled`, no en `is_active`.

5. **Properties con latencia de 5s por mensaje con marker (probabilidad ALTA si no se aplica el guard).** Como `properties-search` no existe en v2, cada vez que Sofia emita `[IMG:CR-XXXX]`, el nodo `Expand Property Images` intentará el HTTP, esperará el `FETCH_TIMEOUT_MS=5000` y recién ahí caerá al fail-safe. Eso suma 5s de latencia a cada respuesta con marker (y el prompt v5.4 los emite seguido). **Mitigación:** aplicar el guard `PROPERTIES_MODULE_ENABLED=false` (§3.5 opción 3) que salta el fetch directo. **Recomendado fuertemente.**

6. **Conversación inexistente al momento de `Buscar Lead` (probabilidad MEDIA).** El LEFT JOIN a `conversations` para traer `last_inbound_at` asume que la conversación ya existe. Pero en el primer mensaje del lead la conversación puede no existir todavía (depende de si la edge function de intake la creó antes que el bot la procese — son endpoints paralelos en YCloud). `last_inbound_at` vendría NULL. **Mitigación:** LEFT JOIN (no INNER) ya lo cubre; el flujo no bifurca por `last_inbound_at`. Sin riesgo de ruptura, solo dato faltante en contexto.

---

## 7. Casos edge a contemplar (OBLIGATORIO)

1. **Happy path — lead recurrente, conversación existe, bot activo.** Llega inbound → `Resolve Agency` matchea (número solo-dígitos) → `bot_enabled=true` → `Buscar Lead` encuentra el lead por `phone` con `status` (slug), `bot_summary`, `last_inbound_at` poblados → `Get Conversation State` devuelve `handler='bot'`, `bot_paused_until` null → `Chatbot Activado?` = true → agente responde → memoria lee/escribe en `n8n_chat_histories` v2 → chunks enviados. **Resultado esperado:** respuesta normal del bot contra v2.

2. **Lead NUEVO sin `stage_id` (status NULL).** Primer mensaje de un número desconocido. `Buscar Lead` debe encontrarlo SI la edge function de intake ya lo creó (en v2 el lead lo crea el intake, no el bot). Si existe pero con `stage_id=NULL` → el LEFT JOIN deja `status=NULL`. El prompt arma contexto con `status` ausente (lo tolera, no bifurca por status). Si el lead NO existe todavía (intake aún no corrió) → `Buscar Lead` devuelve vacío → `Lead Encontrado?` falso → `Abort - Lead No Encontrado`. **Resultado esperado:** o responde con `status=NULL` tolerado, o aborta limpio sin romper (NO debe crashear por NULL).

3. **Número con/sin `+` (normalización).** El `businessPhone`/`userPhone` puede venir `+50689839490` o `50689839490`. Las queries `Resolve Agency` y `Buscar Lead` deben matchear en ambos casos vía `regexp_replace(...,'\D','','g')`. **Resultado esperado:** matchea igual con o sin `+`/espacios/guiones. (El builder usa doble-normalización — §11.)

4. **Conversación inexistente.** `Get Conversation State` devuelve vacío (lead existe pero conversación aún no). El nodo tiene `onError`/`alwaysOutputData`. `Chatbot Activado?` leería `$json.handler` undefined → la condición `handler==='bot'` falla → bot NO responde (silencio). **Riesgo:** si el intake crea el lead pero la conversación se crea después, el primer mensaje podría no contestarse. **Resultado esperado a verificar:** o la conversación existe siempre antes que el bot procese (intake la crea), o el flujo debe tolerar conversación ausente. **El reviewer debe walkthrough este caso explícitamente** — es el más frágil del port. Si en v1 funcionaba, es porque el intake crea conversación+lead atómicamente antes; confirmar que v2 hace lo mismo.

5. **`properties` invocado (marker `[IMG:CR-XXXX]`).** Sofia emite un marker. `properties-search` no existe en v2 → con guard `PROPERTIES_MODULE_ENABLED=false`: el nodo salta el fetch, limpia el marker, empuja el texto sin foto. Sin guard: el HTTP falla tras 5s → mismo fail-safe. **Resultado esperado:** el lead recibe el texto del bot SIN foto, el bot NO se rompe, el loop completa. (Sofia dijo "[IMG:...]" pero el lead solo ve texto — aceptable en demo sin módulo properties.)

6. **Lead pide humano / frustrado / handoff (`Apagar Chatbot`).** El `Detector de Descalificacion` produce `razon` + `resumen_lead`. `Apagar Chatbot — Conversation` mapea la razón al enum v2 (todos válidos) y pone `handler='human'`, `handoff_status='pending'`. `Apagar Chatbot — Lead Summary` escribe `bot_summary` (requiere 0012). Telegram notifica. **Resultado esperado:** handoff escrito correctamente en v2, bot deja de responder esa conversación, agente notificado. **Verificar:** el `handoff_reason` cast no falla y `bot_summary` se persiste.

7. **REINICIAR (lead manda "reinicio").** `Delete Postgres historial` borra `n8n_chat_histories` por `session_id` en v2 (tabla idéntica) + `Vacia Redis`. **Resultado esperado:** historial borrado en v2, mensaje de confirmación enviado.

8. **Lead manda audio/imagen.** El switch `Is Text or Audio or Image?` no toca la capa de datos (transcribe/normaliza antes de `Buscar Lead`). **Resultado esperado:** sin cambios vs v1; el audio/imagen se normaliza a texto y sigue el mismo path de datos v2.

---

## 8. Triggers de handoff (NO se tocan en este cambio)

Los triggers de handoff (las 6 condiciones AND del system prompt v5/v5.4 + el `Detector de Descalificacion`) **NO cambian** en esta port. Es capa de datos, no lógica. El mapeo de `razon` → `conversation_handoff_reason` en el SQL de `Apagar Chatbot — Conversation` se conserva idéntico (verificado compatible con el enum v2). **No se reescribe ningún trigger acá.** Cualquier ajuste de triggers es otra spec.

---

## 9. Cambios fuera del workflow

- **Migración SQL 0012** (`crm-v2/supabase/migrations/0012_leads_bot_summary.sql`) — la aplica el orquestador/founder, NO el builder. Contenido en §3.8.
- **Seeds en v2** (founder, §5): agency `inmobiliaria-demo`, `agency_channels` del número, al menos un `pipeline_stages`.
- **Credencial Postgres `CRM System`** repuntada al v2 (founder, §3.7).
- **(Futuro, fuera de alcance)** Desplegar `properties-search` en v2 cuando se construya el módulo properties → ahí se repunta `SEARCH_SECRET` real.
- **(Verificar)** Que el endpoint YCloud no esté duplicando proceso con el v1 (§6 riesgo 1).

---

## 10. Tests manuales que el reviewer debe correr (walkthroughs mentales) y el founder en prod

- **Escenario A (happy path):** mandar WhatsApp de prueba desde un número que YA exista como lead en v2 → confirmar que el bot responde y que `n8n_chat_histories` v2 recibe el turno.
- **Escenario B (lead nuevo):** mandar desde un número NUEVO → confirmar que el intake crea lead+conversación en v2 y el bot responde (o aborta limpio si el lead no existe aún, sin crashear).
- **Escenario C (número con +):** confirmar que `Resolve Agency` matchea aunque el seed esté solo-dígitos y el webhook mande `+`.
- **Escenario D (properties marker):** forzar que Sofia emita `[IMG:CR-2073]` → confirmar que el lead recibe el TEXTO sin foto, sin error, sin 5s de latencia (si se aplicó el guard).
- **Escenario E (handoff):** simular "quiero hablar con un humano" → confirmar `conversations.handler='human'`, `handoff_status='pending'`, `handoff_reason` correcto, `leads.bot_summary` escrito, Telegram notificado.
- **Escenario F (kill-switch):** poner `agencies.settings.bot_enabled=false` → confirmar que el bot deja de responder a TODAS las conversaciones. Volver a `true` → confirmar que responde solo las que están en `handler='bot'`.
- **Escenario G (reiniciar):** mandar "reinicio" → confirmar `n8n_chat_histories` v2 borrado para esa session_id.

---

## 11. Handoff al builder

- **Archivo de output esperado:** `n8n/workflows/chatbot-inmobiliaria-demo-ycloud-sofia-v5.4-v2db.json` (versión nueva; NO sobrescribir el actual).
- **Script de build esperado:** `scripts/build-sofia-v5.4-v2db.js` (idempotente; parte de `crm-v2/_n8n-current.json` como base; aplica los cambios de queries + el hardcode del Expand node; fuerza `active: false`; valida con `JSON.parse`).
- **Notas especiales al builder (NO obvias):**
  1. **Doble-normalización del teléfono (CRÍTICO):** ajustá las queries de §3.6 para normalizar AMBOS lados de la comparación de número, no solo el input. Ejemplo `Resolve Agency`: `WHERE ac.channel='whatsapp' AND regexp_replace(ac.phone_number,'\D','','g') = regexp_replace($1,'\D','','g') AND ...`. Lo mismo en `Buscar Lead` para la rama `phone`. Esto blinda contra seed inconsistente (§6 riesgo 3). El architect dejó la versión simple en §3.6 por legibilidad; vos implementás la doble-normalización.
  2. **NO toques la topología** (`connections` debe quedar idéntica). Solo `parameters.query` / `parameters.jsCode` / `parameters.conditions` de los nodos listados en §3.2.
  3. **NO cambies `credentials.postgres.id`** en ningún nodo — sigue siendo `pMsxqUvr0wDZsjIt`. El repuntado de host/password es manual del founder en la UI (§3.7).
  4. **`Chatbot Activado?` NO se toca** si la query `Resolve Agency` v2 expone el alias `bot_enabled` (lo expone). Verificá que NO haya que tocar el `if`.
  5. **`Expand Property Images`:** cambiá `SUPABASE_URL` al v2 + agregá el guard `PROPERTIES_MODULE_ENABLED=false` (§3.5 opción 3). El `SEARCH_SECRET` queda como placeholder marcado (módulo no construido). NO inventes un secret real.
  6. **`message_count`:** NO lo agregues a ninguna query. El prompt lo lee con `|| 0` y la columna no existe en v2 a propósito. Dejalo así.
  7. **Migración 0012 y seeds NO los hace el builder** — son del founder/orquestador. El builder asume que están aplicados, pero el reviewer debe marcarlos como precondición.
  8. **`active: false`** forzado en el JSON de salida. El founder activa manualmente tras la migración + seeds + repuntado de credencial.
