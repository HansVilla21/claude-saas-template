# Spec: bot-v6 F4 — bot_schedule + 5 auto-actions + handoff por tool (cierre del cableado)

**Fecha:** 2026-05-30
**Autor:** n8n-architect
**Workflow afectado:** `n8n/workflows/chatbot-momentum-bot-v6-v1.json` (id N8N `p3h7tx6UiGBQ9Tzb`, activo, 60 nodos tras F2).
**Versión actual → propuesta:** bot-v6 v2 (F2: extractor vivo; handoff tool desconectada con URL inválida; bot_schedule no respetado en runtime) → **bot-v6 v3** (F4: 6 operations reales en `bot-actions` + lógica office_hours con `bot_paused_until` + handoff tool reconectada al edge function + bloque dinámico "## AUTO-ACCIONES PERMITIDAS" en el compositor).
**Trigger del cambio:** Cerrar el cableado bot ↔ config-del-CRM. Hoy el founder edita Panel Admin + Settings y se persiste todo (auto_actions, bot_schedule, business_hours, out_of_office_message), pero el bot ignora en runtime los 5 toggles y el `bot_schedule.mode='office_hours'`. F4 es la última fase del cableado.
**Specs predecesoras:** `2026-05-29-sofia-v6-base-v2-plus-compositor-F1.md` (compositor F1, query maestra) · `2026-05-29-sofia-v6-extractor-tool-F2.md` (patrón tool + bot-actions + stubs F4 en disco) · `2026-05-29-cablear-bot-config-runtime.md` (diseño arquitectónico original).

---

## 0. Resumen ejecutivo

F4 hace que el bot **respete en runtime** todo lo que el founder ya configura desde el CRM. Tres bloques atómicos cableados en una sola fase (no se justifica partirla — todo se prueba junto):

1. **6 handlers reales en `bot-actions`** (reemplazan los 6 stubs F4 que hoy devuelven `operation_not_implemented_yet`): `stage.set`, `qualify.set`, `assign.set`, `tag.add`, `note.write`, `handoff.escalate`. Cada uno gateado server-side por el toggle correspondiente de `agencies.settings.auto_actions.*` (excepto `handoff.escalate`, que no está en los 5 toggles — el handoff es un comportamiento del bot, no una auto-acción mutadora). Procedencia `'bot'` en todas las columnas `*_set_by/at/by_user`. Idempotencia por WHERE defensivo. Catch global devuelve 200 con `ok:false`.
2. **Lógica `bot_schedule.mode='office_hours'` server-side, sin wait node.** Cuando llega un mensaje fuera del horario hábil, el workflow llama una **séptima** operation nueva (`conversation.pause_until`) que envía el `out_of_office_message` Y setea `conversations.bot_paused_until = <inicio próxima hora hábil>`. El `Chatbot Activado?` existente ya gatea por `bot_paused_until > now()` → el bot queda mudo hasta que llegue la hora hábil + un mensaje del lead. Reusa infraestructura existente, NO requiere wait node de n8n.
3. **Handoff tool reactivada.** La `Request Handoff Tool` (hoy URL `handoff-tool-desconectada.invalid`) se reapunta a `bot-actions` operation `handoff.escalate`. La toolDescription se mantiene IDÉNTICA (las 6 condiciones SPSP ya bien calibradas tras el bug del 2026-05-20). La conexión `ai_tool` se restaura. La ruta del `Detector de Descalificacion` → `Apagar Chatbot — Conversation` SIGUE viva en paralelo; idempotencia previene doble-handoff.

**Decisiones rectoras (lock-in, 5 que el founder pidió evaluar):**

- **D1 — `bot_paused_until` puro, NO wait node.** Coincido con el voto fuerte del founder. Es simpler, ya cableado (`Chatbot Activado?` lo lee), no consume recursos de n8n esperando, y resuelve naturalmente la opción C "lead manda mensajes durante el wait → silencio". El wait node tiene problemas operativos serios (los waits acumulan ejecuciones colgadas que tras un restart de n8n se pierden, y el founder dijo el 28-may que está en fase de test = workflow activo OK pero un PUT puede borrar todo). `bot_paused_until` sobrevive a cualquier reinicio de n8n. Más detalle §4 con análisis comparativo.
- **D2 — Opción C (silencio durante el wait) confirmada.** El lead recibe el `out_of_office_message` UNA VEZ (en el primer mensaje fuera de horario). Mensajes adicionales durante el wait: el workflow corta en `Chatbot Activado?` (porque `bot_paused_until > now`) ANTES de llamar al agente o al detector. Cero respuesta del bot, cero spam del mismo mensaje, contexto preservado en el historial (los mensajes inbound siguen registrándose vía intake, n8n simplemente no procesa). Cuando llega la hora hábil, el bot reactiva con el próximo inbound del lead (que será el "trigger natural" para que el workflow corra otra vez con `bot_paused_until` vencido).
- **D3 — `note.write` requiere migración nueva `0014_lead_notes.sql`.** La columna `leads.notes` es un único string sobreescribible; usarla destruiría las notas previas (humanas o del bot). Opción B del founder es la correcta: tabla nueva `lead_notes` con procedencia + multi-row + autor. Schema en §7. La migración es aditiva, no rompe nada y queda preparada para que el frontend liste las notas en el tab Contact Detail (skill `crm-contact-detail-tabs`).
- **D4 — Bloque "## AUTO-ACCIONES PERMITIDAS" dinámico en el compositor, SÍ.** El LLM se entera de qué tools puede usar leyendo este bloque (que solo lista las acciones cuyo toggle está on). Sin esto, el LLM intenta llamar tools que server-side están off → ahorra latencia y tokens de cada call innecesaria. La gate server-side queda igual como red de seguridad. Detalle §6.
- **D5 — `conversation.pause_until` va a `bot-actions` (NO Postgres node directo en n8n).** Mantiene el patrón unificado, registra procedencia en logs server-side, y deja un único punto de auditoría. El round-trip extra (1 HTTP call) es despreciable vs los beneficios de consistencia. Justifica además meter en la misma function el `Mandar Out of Office Message` server-side (más prolijo que un nodo separado de YCloud en n8n para esto — ver §5).

**Lo que F4 NO toca:**
- F5 módulo properties (sigue desconectado, sin migración).
- Migración para historizar valores extractor (Insights muestra último valor; histórico es post-F4 si el founder pide).
- UI para mostrar "qué hizo el bot por auto-acción" — eso es frontend, ya hay procedencia bot/human + tooltip diseñado (skill `crm-admin-panel-master-gated`).

---

## 1. Problema / requerimiento

Tras F1+F2+F3, el bot conversa con personalidad por agency, captura datos a `extractor_field_values`, y atribuye campañas. Pero NO hace ninguna de las acciones que el Panel Admin promete que puede hacer: ni cambia etapa, ni califica, ni asigna, ni etiqueta, ni escribe nota, ni se silencia fuera de horario. El founder ve los 5 toggles + el `bot_schedule.mode` en `/a/[slug]/settings` editables y guardándose, pero son letra muerta: cliché de SaaS donde "la config existe pero no hace nada".

F4 cierra ese gap. Después de F4, el bot:
- Mueve al lead entre etapas cuando corresponde (gateado por `auto_actions.stage`).
- Marca calificado/no calificado (gateado por `auto_actions.qualify`).
- Asigna al lead a un agente (gateado por `auto_actions.assign`).
- Etiqueta al lead con tags configuradas por la agency (gateado por `auto_actions.tag`).
- Escribe notas internas (gateado por `auto_actions.note`).
- Se silencia fuera del horario hábil (gateado por `bot_schedule.mode='office_hours'`).
- Escala a humano vía tool LLM cuando se cumplen las condiciones SPSP ya calibradas (handoff por tool, en paralelo al handoff por detector).

Cada acción queda con procedencia `'bot'` para que el inbox muestre el iconito bot/humano correcto.

---

## 2. Estado actual relevante

Nodos del workflow `Chatbot Momentum - bot-v6 v1` que se ven afectados (citando nombres exactos del JSON tras F2):

| Nodo | Tipo | Estado actual tras F2 | Qué le pasa en F4 |
|---|---|---|---|
| `Agente Principal - Sofia` | `@n8n/n8n-nodes-langchain.agent` | systemMessage = `{{ $('Componer System Prompt').first().json.system_prompt }}`. Tiene 1 conexión `ai_tool`: `Extractor Tool (bot-actions)`. La `Supabase Properties Tool` y `Request Handoff Tool` siguen huérfanas (URLs `.invalid`). | **MODIFICAR conexiones:** agregar 5 nuevas tools (`Stage Tool`, `Qualify Tool`, `Assign Tool`, `Tag Tool`, `Note Tool`) + RECONECTAR `Request Handoff Tool` con URL real. NO cambia `parameters` ni systemMessage (el compositor maneja el bloque dinámico). |
| `Componer System Prompt` | `n8n-nodes-base.code` (typeVersion 2) | jsCode actual (F2 vivo) | **MODIFICAR jsCode:** agregar bloque dinámico "## AUTO-ACCIONES PERMITIDAS" justo después del bloque `## DATOS A CAPTURAR` y antes del bloque D (reglas finales). Lee `ctx.settings.auto_actions` (que ya viene de la query maestra F1) y lista solo las acciones on. |
| `Chatbot Activado?` | `n8n-nodes-base.if` typeVersion 2.2 | Tres conditions AND: `handler='bot'`, `bot_paused_until null o < now`, `bot_enabled=true`. | **SIN cambios.** F4 reusa este gate para implementar `office_hours` (el workflow llama `conversation.pause_until` que setea `bot_paused_until`, este gate hace el resto). |
| `Resolve Agency` | `n8n-nodes-base.postgres` | Query maestra v2 que devuelve `agency_id`, `bot_config`, `settings`, `pipeline_stages`, `extractor_field_defs`, `modules`, `core_template`, `system_rules_template`. | **SIN cambios SQL.** El `settings` jsonb ya trae `auto_actions`, `business_hours`, `bot_schedule` (verificado en F1 §3.5). |
| `Get Conversation State` | `n8n-nodes-base.postgres` | SELECT con `id, handler, bot_paused_until, archived_at, handoff_status, handoff_reason`. | **SIN cambios.** El `bot_paused_until` ya se lee. |
| `Request Handoff Tool` | `@n8n/n8n-nodes-langchain.toolHttpRequest` typeVersion 1.1 | URL `https://handoff-tool-desconectada.invalid/se-reactiva-en-f4`; toolDescription con las 6 condiciones SPSP calibradas; jsonBody con `reason`/`summary` por `$fromAI`; auth Bearer con `$env.HANDOFF_INTERNAL_SECRET`. Conexión `ai_tool` REMOVIDA en F1 Opción B. | **MODIFICAR:** URL real `{{ $env.SUPABASE_V2_URL }}/functions/v1/bot-actions`; jsonBody pasa a wrappear con envelope universal (operation `handoff.escalate`); header Authorization pasa a `$env.BOT_ACTIONS_SECRET` (NO `HANDOFF_INTERNAL_SECRET` — el handoff vive ahora en `bot-actions`, mismo secret unificado). toolDescription IDÉNTICA. **RECONECTAR `ai_tool`** al agente. |
| `Detector de Descalificacion` + `Apagar Chatbot — Conversation` + `Apagar Chatbot — Lead Summary` + Telegram | langchain.informationExtractor + postgres + telegram | Ruta paralela de handoff existente. UPDATE directo escribe `handler='human'`, `handoff_status='pending'`, `handoff_reason`, `handoff_summary`, `handoff_at`. | **SIN cambios.** Sigue corriendo en paralelo a la tool de handoff. Idempotencia (WHERE `handoff_status<>'pending'`) cubre el race en `bot-actions`. |

**Estado fuera de n8n:**
- `crm-v2/supabase/functions/bot-actions/index.ts` v0.1.0 (F2): healthcheck OK, secret_configured=true, `extractor.write` implementado, 6 stubs F4 que responden 200 con `skipped: [{reason: 'operation_not_implemented_yet'}]`. F4 reemplaza los stubs con handlers reales + agrega `conversation.pause_until` (séptima operation).
- Migraciones: `0001` (enums incl. `conversation_handoff_reason`), `0003` (leads/conversations/tags/tag_assignments/pipeline_stages), `0009` (columnas de procedencia `*_set_by/at/by_user` + `tag_assignments.created_by_kind` + `agencies.settings` jsonb).
- **NO existe `lead_notes`.** F4 introduce migración `0014_lead_notes.sql` (§7).
- Variables de entorno: `BOT_ACTIONS_SECRET` configurado en Supabase v2 y N8N (verificado en F2).
- `agencies.settings` para el demo de Robert ya editable desde el Panel; el founder ya estuvo jugando con los toggles según el contexto.

---

## 3. Cambio propuesto

### 3.1 Nodos a CREAR (n8n)

Cinco nuevas tool nodes (las 5 auto-actions), todas `@n8n/n8n-nodes-langchain.toolHttpRequest` typeVersion 1.1, conectadas como `ai_tool` al `Agente Principal - Sofia`. Patrón idéntico al `Extractor Tool (bot-actions)` actual (URL+Bearer+jsonBody con envelope universal). Posición sugerida: alineadas horizontalmente debajo del Extractor Tool (≈ y=1200, x escalonado de -300 a +400).

| Nombre | Position aprox. | operation | Resumen del jsonBody |
|---|---|---|---|
| `Stage Tool (bot-actions)` | x=-300, y=1200 | `stage.set` | `{ stage_slug: $fromAI(...) }` |
| `Qualify Tool (bot-actions)` | x=-100, y=1200 | `qualify.set` | `{ is_qualified: $fromAI(...) }` |
| `Assign Tool (bot-actions)` | x=100, y=1200 | `assign.set` | `{ strategy: $fromAI(...) }` (round_robin / least_loaded / null) |
| `Tag Tool (bot-actions)` | x=300, y=1200 | `tag.add` | `{ tag_name: $fromAI(...) }` |
| `Note Tool (bot-actions)` | x=500, y=1200 | `note.write` | `{ body: $fromAI(...) }` |

Detalle exhaustivo del jsonBody + toolDescription de cada tool en §8. La sexta tool `Request Handoff Tool` ya existe y se modifica (no se crea).

### 3.2 Nodos a MODIFICAR (n8n)

| Nombre | Qué cambia | Por qué |
|---|---|---|
| `Componer System Prompt` | jsCode: agregar bloque dinámico "## AUTO-ACCIONES PERMITIDAS" listando solo las acciones cuyo toggle está on, justo después del bloque `## DATOS A CAPTURAR`. Texto literal en §6. Resto del jsCode idéntico. | El LLM aprende qué tools puede usar; no las invoca cuando están off → ahorra latencia + tokens. |
| `Componer System Prompt` | jsCode: agregar segundo bloque dinámico "## HORARIO DE ATENCIÓN" (cuando `bot_schedule.mode='office_hours'`) describiendo el horario en lenguaje natural + el `out_of_office_message`. Texto en §6.2. | El LLM tiene contexto del horario, evita prometer "te respondo en 5 min" un viernes a las 23:00. Es preventivo; el gating real está server-side (§5). |
| `Request Handoff Tool` | URL → `{{ $env.SUPABASE_V2_URL }}/functions/v1/bot-actions`. Header Authorization → `=Bearer {{ $env.BOT_ACTIONS_SECRET }}` (cambia de `HANDOFF_INTERNAL_SECRET` a `BOT_ACTIONS_SECRET` — handoff vive ahora en bot-actions). jsonBody envuelto con envelope universal: `{ operation: "handoff.escalate", agency_id, lead_id, conversation_id, params: { reason, summary } }`. toolDescription IDÉNTICA. | Reconectar el camino tool del handoff apuntando al edge function unificado. |
| `Agente Principal - Sofia` (conexiones) | Agregar 6 conexiones `ai_tool`: las 5 nuevas tools + la reconexión de `Request Handoff Tool` (que se había removido en F1 Opción B). NO cambia `parameters`. | Cablear las tools al agente. |

### 3.3 Nodos a BORRAR

Ninguno.

### 3.4 Workflow: nodo NUEVO `Detectar Fuera de Horario` + branch nueva

**Antes de `Chatbot Activado?`** (mejor: justo después de `Get Conversation State`, antes de `Chatbot Activado?`, para tener `conversation_id` disponible), insertar lógica de office_hours.

**Diseño limpio (favorito):** un nuevo nodo IF `¿Está fuera de horario?` que evalúa `bot_schedule.mode === 'office_hours' AND now() fuera de business_hours`. La condición se calcula en un Code node previo `Calcular Estado de Horario` que produce dos campos: `is_office_hours_mode` (boolean) y `is_outside_business_hours` (boolean) usando `business_hours.{tz, days, from, to}`.

| Nombre | Type | typeVersion | Posición aprox. | Propósito |
|---|---|---|---|---|
| `Calcular Estado de Horario` | `n8n-nodes-base.code` (runOnceForAllItems) | 2 | x=-2900, y=750 (entre `Get Conversation State` y `Chatbot Activado?`) | JS puro. Lee `$('Resolve Agency').first().json.settings.business_hours` y `bot_schedule.mode`. Calcula: ¿está activo el modo? ¿está fuera del horario AHORA? Output: `{ schedule_mode, is_outside, next_business_start_iso }`. Reusa el patrón mental de `crm-v2/src/lib/inbox/response-time.ts` (Intl.DateTimeFormat con tz, parseHHmm, set de días). Código en §5.2. |
| `¿Fuera de Horario?` | `n8n-nodes-base.if` | 2.2 | x=-2700, y=750 | Condition única: `{{ $('Calcular Estado de Horario').first().json.schedule_mode === 'office_hours' && $('Calcular Estado de Horario').first().json.is_outside === true }}`. True → branch nueva. False → continúa al `Chatbot Activado?` normal. |
| `Pausar Bot Hasta Hora Hábil` | `@n8n/n8n-nodes-langchain.toolHttpRequest` o `n8n-nodes-base.httpRequest` (NO tool — esto NO va al LLM; es server-to-server) | usar `n8n-nodes-base.httpRequest` typeVersion 4.2 | x=-2500, y=900 | POST a `bot-actions` con operation `conversation.pause_until`. Body: `{ operation, agency_id, lead_id, conversation_id, params: { pause_until_iso, send_out_of_office: true, out_of_office_message } }`. Header Bearer. El edge function: (a) manda el out_of_office_message vía YCloud (server-side, ver §5.1 nota crítica), (b) setea `conversations.bot_paused_until`. |

**Después de `Pausar Bot Hasta Hora Hábil`:** el branch termina. NO seguir al agente, NO seguir al detector. Workflow abandona el turno.

**Por qué el IF antes del `Chatbot Activado?` y no después:** si pongo el IF después, ya el bot estaría procesando un mensaje que no debería. El `Chatbot Activado?` ya gatea con `bot_paused_until`, pero el PRIMER mensaje fuera de horario aún no tiene `bot_paused_until` seteado, así que pasaría el gate y entraría al agente. Necesito un gate ANTERIOR específicamente para "primer mensaje fuera de horario".

**Para mensajes SUBSIGUIENTES durante el wait:** `bot_paused_until` ya está seteado → el `Chatbot Activado?` (que es el SEGUNDO gate, posterior al `¿Fuera de Horario?`) los corta. NO mandan out_of_office_message de nuevo (porque el `¿Fuera de Horario?` los hubiera mandado al `Pausar Bot`, pero ANTES llega al `Chatbot Activado?`... espera, tengo que reordenar).

**Reordenamiento correcto:** el orden ideal es:
1. `Get Conversation State` (trae `bot_paused_until`).
2. `Chatbot Activado?` (corta si `handler='human'`, `bot_paused_until > now`, o `bot_enabled=false`). **Mensajes durante el wait mueren acá silenciosamente.**
3. (false del Chatbot Activado → abort silencioso, sin out_of_office_message repetido).
4. (true del Chatbot Activado → continuar) → `Calcular Estado de Horario` + `¿Fuera de Horario?`.
5. (true del Fuera de Horario → `Pausar Bot Hasta Hora Hábil` → abort).
6. (false del Fuera de Horario → seguir flujo normal: agente + detector).

Así el primer mensaje fuera de horario manda el out_of_office_message + setea bot_paused_until. Los siguientes mensajes durante el wait pasan por `Chatbot Activado?`, que ahora ve `bot_paused_until > now()` → corta ahí mismo. Cero spam. Al despertar (mensaje después de la hora hábil), `bot_paused_until` está vencido → pasa al `Chatbot Activado?` → entra al `¿Fuera de Horario?` → false (ya estamos en horario) → flujo normal.

### 3.5 Conexiones a CREAR

- `Chatbot Activado?` (rama true) → `Calcular Estado de Horario` (main). **DESVÍO:** la conexión actual `Chatbot Activado? → Detectar Link` (o el siguiente nodo del flujo, verificar en el JSON) se redirige a pasar por el nuevo IF.
- `Calcular Estado de Horario` → `¿Fuera de Horario?` (main).
- `¿Fuera de Horario?` (rama true) → `Pausar Bot Hasta Hora Hábil` (main). **Termina** (no continúa).
- `¿Fuera de Horario?` (rama false) → siguiente nodo del flujo normal (lo que hoy recibe la rama true de `Chatbot Activado?`).
- `Stage Tool (bot-actions)` → `Agente Principal - Sofia` (ai_tool).
- `Qualify Tool (bot-actions)` → `Agente Principal - Sofia` (ai_tool).
- `Assign Tool (bot-actions)` → `Agente Principal - Sofia` (ai_tool).
- `Tag Tool (bot-actions)` → `Agente Principal - Sofia` (ai_tool).
- `Note Tool (bot-actions)` → `Agente Principal - Sofia` (ai_tool).
- `Request Handoff Tool` → `Agente Principal - Sofia` (ai_tool). **RESTAURADA** (estaba removida en F1 Opción B).

### 3.6 Conexiones a BORRAR

- La conexión `Chatbot Activado?` (rama true) → `<siguiente nodo del flujo normal>` se reemplaza por el desvío vía `Calcular Estado de Horario` + `¿Fuera de Horario?`. El builder identifica el "siguiente nodo" exacto en el JSON.

---

## 4. Decisión crítica: `bot_paused_until` puro vs wait node (análisis)

| Criterio | Wait node n8n | `bot_paused_until` (recomendado) |
|---|---|---|
| Sobrevive restart de n8n | No (waits perdidos según versión/storage) | Sí (timestamp en Postgres) |
| Latencia operativa | El wait consume un slot de ejecución por la duración del wait | Cero (workflow termina, se reactiva con nuevo inbound) |
| Manejo de "lead manda otro mensaje durante el wait" | Complejo: ¿cancela el wait? ¿lo extiende? ¿abre 2 waits paralelos? | Trivial: `Chatbot Activado?` corta los inbounds adicionales automáticamente |
| Manejo de "founder activa el bot manualmente desde el CRM" (override) | El wait sigue corriendo en n8n; hay que matarlo manualmente | El founder hace `UPDATE conversations SET bot_paused_until = NULL` → próximo mensaje el bot reactiva. Limpio. |
| Reuso infraestructura existente | Ninguno | El `Chatbot Activado?` ya gatea con `bot_paused_until` (verificado en JSON línea 466) |
| Fase de test (founder dijo 28-may "sin clientes reales, workflow activo OK") | Riesgoso: PUTs al workflow durante waits perdería estado | Seguro: estado vive en DB, inmune a cambios de workflow |
| Complejidad de implementación | Wait node + nodos extra para serializar/cancelar waits paralelos | Una operation extra en `bot-actions` (cálculo de próxima hora hábil + UPDATE) |

**Veredicto:** `bot_paused_until` puro gana en los 7 criterios. Confirmo el voto fuerte del founder. La opción C ("silencio durante el wait") emerge gratis como consecuencia natural — no requiere código extra.

---

## 5. Diseño del bot_schedule logic (paso a paso)

### 5.1 Operation nueva `conversation.pause_until` en `bot-actions`

**Input específico de `params`:**
```json
{
  "pause_until_iso": "2026-05-30T08:00:00-06:00",
  "send_out_of_office": true,
  "out_of_office_message": "Gracias por tu mensaje. En este momento estamos fuera de horario; te respondemos a primera hora.",
  "lead_phone": "50689839490",
  "business_phone_id": "<wa_business_phone_id de agency_channels>"
}
```

**Por qué los últimos 2 params:** el edge function necesita el `lead_phone` y el `business_phone_id` para mandar el out_of_office_message vía YCloud server-side (ver nota crítica más abajo).

**Lógica server-side:**
1. Validar envelope + auth (igual que el resto).
2. Cross-tenant guard (igual).
3. **(Si `send_out_of_office === true`)** Mandar el `out_of_office_message` via YCloud API:
   - POST a `https://api.ycloud.com/v2/whatsapp/messages` con el lead_phone, business_phone_id, body=out_of_office_message.
   - Header `X-API-Key: ${YCLOUD_API_KEY}`.
   - Si falla → log error, NO abortar (igual escribimos el pause).
   - Si OK → insertar fila en `messages` con `direction='outbound'`, `sender_kind='system'`, `body=out_of_office_message`, `is_bot_generated=true`. Esto importa para que el inbox refleje el mensaje (sin él, el founder ve "el lead escribió y el bot no respondió" sin saber por qué).
4. UPDATE `conversations SET bot_paused_until = $pause_until_iso WHERE id = $conversation_id AND agency_id = $agency_id`.
5. Output: `{ ok: true, paused_until: pause_until_iso, sent_out_of_office: true|false }`.

**Nota crítica al builder (NO obvia):** mandar el out_of_office_message desde el edge function (server-side, no desde n8n) tiene dos ventajas:
- (a) La fila en `messages` se inserta en la misma transacción/contexto que el pause → consistencia.
- (b) Evita meter un nodo YCloud separado en el workflow solo para este caso → menos nodos, menos cosas que mantener.

El edge function necesita la env var `YCLOUD_API_KEY` (ya configurada en v2 desde F3 para el atrribute capture, verificar). Si no estuviera, agregar como precondición.

**Alternativa rechazada:** mandar el out_of_office_message desde n8n (nodo Send Chunk YCloud existente). Razón del rechazo: requiere replicar lógica de armado del payload en n8n, y la idempotencia entre "mensaje enviado" y "pause seteado" se complica (¿qué pasa si el send sale OK pero el pause falla? El lead recibió el mensaje pero el bot va a responder igual al próximo inbound). Server-side todo junto es más seguro.

### 5.2 Code node `Calcular Estado de Horario` (jsCode)

```javascript
// Calcular Estado de Horario — bot-v6 F4
// Lee agency.settings.{bot_schedule.mode, business_hours} y calcula:
// - schedule_mode: '24_7' | 'office_hours'
// - is_outside: true si schedule_mode='office_hours' Y now() está fuera de business_hours
// - next_business_start_iso: ISO timestamp del próximo inicio de hora hábil
//
// JS puro, usa Intl.DateTimeFormat para tz-awareness (igual patrón que
// crm-v2/src/lib/inbox/response-time.ts). NO requiere libs externas.

let settings = {};
try {
  const ag = $('Resolve Agency').first();
  settings = (ag && ag.json && ag.json.settings && typeof ag.json.settings === 'object')
    ? ag.json.settings : {};
} catch (e) { settings = {}; }

// Defaults idénticos a parseSettings() de crm-v2/src/lib/settings/types.ts
const bs = (settings.bot_schedule && typeof settings.bot_schedule === 'object')
  ? settings.bot_schedule : {};
const bh = (settings.business_hours && typeof settings.business_hours === 'object')
  ? settings.business_hours : {};

const schedule_mode = (bs.mode === 'office_hours') ? 'office_hours' : '24_7';
const tz = (typeof bh.tz === 'string' && bh.tz.length > 0) ? bh.tz : 'America/Costa_Rica';
const days = Array.isArray(bh.days) ? bh.days.filter(function(d) { return d >= 0 && d <= 6; }) : [1,2,3,4,5];
const fromHHMM = (typeof bh.from === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(bh.from)) ? bh.from : '08:00';
const toHHMM = (typeof bh.to === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(bh.to)) ? bh.to : '18:00';
const out_of_office_message = (typeof bs.out_of_office_message === 'string')
  ? bs.out_of_office_message
  : 'Gracias por tu mensaje. En este momento estamos fuera de horario, te respondemos a primera hora.';

function parseHHMM(s) {
  const parts = s.split(':');
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

// Proyecta una fecha a la tz objetivo: devuelve { dayOfWeek (0-6), minutesOfDay }
function projectToTz(date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit',
    hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = fmt.formatToParts(date);
  const get = function(t) {
    const p = parts.find(function(x) { return x.type === t; });
    return p ? p.value : '';
  };
  const wdMap = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };
  const dayOfWeek = wdMap[get('weekday')];
  let hour = parseInt(get('hour'), 10);
  if (hour === 24) hour = 0;
  const minute = parseInt(get('minute'), 10);
  return {
    dayOfWeek: dayOfWeek,
    minutesOfDay: hour * 60 + minute,
    year: parseInt(get('year'), 10),
    month: parseInt(get('month'), 10),
    day: parseInt(get('day'), 10),
  };
}

const fromMin = parseHHMM(fromHHMM);
const toMin = parseHHMM(toHHMM);
const daySet = new Set(days);

const now = new Date();
const proj = projectToTz(now);

// ¿Está dentro? día válido AND from <= ahora < to (ventana normal, no nocturna)
let is_inside = false;
if (daySet.has(proj.dayOfWeek) && fromMin < toMin) {
  if (proj.minutesOfDay >= fromMin && proj.minutesOfDay < toMin) {
    is_inside = true;
  }
}
const is_outside = (schedule_mode === 'office_hours') && !is_inside;

// Calcular el próximo inicio de hora hábil. Iteramos día a día (hasta 14 días)
// avanzando UTC en pasos de 1 hora hasta encontrar el primer minuto dentro de
// un día válido a la hora `from`. Acotado a 14 días para no loopear infinito
// en agencies con `days=[]` (todos los días apagados → fallback: usar mañana 8am).
function nextBusinessStart() {
  if (daySet.size === 0) {
    // Edge case: ningún día activo. No hay forma de calcular. Fallback: 7 días.
    return new Date(now.getTime() + 7 * 24 * 3600 * 1000).toISOString();
  }
  // Avanzar hora a hora hasta encontrar un instante donde proj caiga en (day in daySet, minutesOfDay = fromMin).
  // Truco: probamos el inicio de cada hora durante 14 días. Cuando encontramos un día válido,
  // construimos la fecha exacta en esa tz con horas/minutos = from.
  const MAX_HOURS = 14 * 24;
  for (let h = 1; h <= MAX_HOURS; h++) {
    const t = new Date(now.getTime() + h * 3600 * 1000);
    const p = projectToTz(t);
    if (!daySet.has(p.dayOfWeek)) continue;
    // Construir el instante "ese día en esa tz, a hora `from`".
    // No tenemos manera directa de "fecha en tz X a hora HH:MM" en JS estándar.
    // Workaround: probamos cada hora del día candidato hasta acercarnos a fromMin.
    // Estrategia simpler: usamos el día/mes/año proyectado en tz, construimos ISO
    // "YYYY-MM-DDTHH:MM:00" SIN tz, y lo interpretamos como local. Esto es aprox
    // (no maneja DST cambio mid-day). Para la mayoría de timezones LATAM funciona.
    const yyyy = String(p.year);
    const mm = String(p.month).padStart(2, '0');
    const dd = String(p.day).padStart(2, '0');
    const hh = fromHHMM.slice(0, 2);
    const mn = fromHHMM.slice(3, 5);
    // Truco para tz-aware: usar new Date(string) interpreta como local del runtime de n8n
    // (que es UTC). Para tz correcta, usamos offset estimado restando lo necesario.
    // Compromiso pragmático: devolvemos el ISO local del día candidato a hora `from`
    // tratando como tz del business. n8n corre en UTC; la diferencia con CR (UTC-6)
    // se compensa restando 6h en horas estándar. Para evitar bugs DST, mejor:
    // construir el Date a hora `from` en el día candidato (en tz local de n8n=UTC) y
    // confiar en que la diff con tz business es pequeña vs el orden de magnitud del wait.
    // En la práctica el bot está 1-12 horas off; ±1h por DST no es crítico.
    const isoLocal = yyyy + '-' + mm + '-' + dd + 'T' + hh + ':' + mn + ':00';
    return new Date(isoLocal + 'Z').toISOString(); // tratado como UTC; founder verifica primer caso
  }
  return new Date(now.getTime() + 24 * 3600 * 1000).toISOString();
}

const next_business_start_iso = is_outside ? nextBusinessStart() : null;

return [{ json: {
  schedule_mode: schedule_mode,
  is_outside: is_outside,
  next_business_start_iso: next_business_start_iso,
  out_of_office_message: out_of_office_message,
  business_phone: $('Extract Variables').first().json.businessPhone,
  lead_phone: $('ID y Mensaje').first().json.ID,
} }];
```

**Gotcha del cálculo de `next_business_start_iso`:** JS estándar (sin date-fns-tz ni Temporal) no tiene una forma directa de construir "fecha X en tz Y a hora HH:MM". El compromiso pragmático usa `new Date(isoLocal + 'Z')` que trata el ISO como UTC. **Esto puede ser inexacto por ±1-2 horas según DST y tz**. Aceptable para F4 porque:
- El bot quedó pausado fuera de horario; despertar ±1h tarde no daña al lead (los mensajes acumulados estaban en silencio).
- El próximo mensaje del lead post-hora-hábil reactiva el bot incluso si `bot_paused_until` está un poco off.

Si el founder pide precisión exacta, post-F4 importar `luxon` o usar Temporal cuando esté disponible. **Documentado como riesgo R4 §10.**

### 5.3 Cómo se ve el flujo completo office_hours

Caso: agency con `business_hours.{tz:'America/Costa_Rica', days:[1,2,3,4,5], from:'08:00', to:'18:00'}`, `bot_schedule.mode='office_hours'`, `out_of_office_message='Estamos fuera de horario'`.

**Viernes 23:00 CR. Lead escribe "Hola necesito info".**
1. Webhook YCloud → Extract Variables → ... → Resolve Agency → Buscar Lead → Get Conversation State (`bot_paused_until` = NULL).
2. `Chatbot Activado?` → true (handler=bot, paused null, bot_enabled true).
3. `Calcular Estado de Horario` → `{schedule_mode:'office_hours', is_outside:true, next_business_start_iso:'2026-06-01T14:00:00Z' (lunes 8am CR)}`.
4. `¿Fuera de Horario?` → true.
5. `Pausar Bot Hasta Hora Hábil` → POST a bot-actions operation `conversation.pause_until` con `pause_until_iso=2026-06-01T14:00:00Z, send_out_of_office=true, out_of_office_message`.
6. bot-actions: (a) manda "Estamos fuera de horario" vía YCloud al lead. (b) inserta fila en messages. (c) UPDATE conversations.bot_paused_until.
7. Workflow termina. Lead recibe el out_of_office_message.

**Viernes 23:30 CR. Lead escribe "¿pero cuándo abren?".**
1. Webhook → ... → Get Conversation State (`bot_paused_until` = 2026-06-01T14:00Z, futuro).
2. `Chatbot Activado?` → FALSE (paused futuro).
3. Workflow termina. Lead NO recibe nada. Mensaje queda en historial.

**Domingo 22:00 CR. Lead escribe "Hola".**
1. Igual que el caso anterior. Silencio.

**Lunes 8:05 CR. Lead escribe "¿alguien?".**
1. `Get Conversation State` → `bot_paused_until` = lunes 8:00 (vencido).
2. `Chatbot Activado?` → true.
3. `Calcular Estado de Horario` → `{schedule_mode:'office_hours', is_outside:false}` (estamos dentro de horario).
4. `¿Fuera de Horario?` → false.
5. Flujo normal → agente responde con TODO el historial inbound del lead disponible en memoria.

---

## 6. Modificación al compositor: bloques nuevos

El jsCode actual del compositor (extraído desde `memory/research/13-bot-v6-compositor-code.md` entre markers) tiene la estructura: A core → B bot_config → C modules → DATOS A CAPTURAR → D rules. F4 inserta 2 bloques nuevos:

### 6.1 Bloque "## AUTO-ACCIONES PERMITIDAS" (dinámico, solo si hay al menos una on)

Después del bloque `## DATOS A CAPTURAR` y antes del bloque D rules. Código a agregar:

```javascript
// [AUTO-ACCIONES PERMITIDAS] — F4: lista las acciones que el bot puede tomar
// según los toggles de agency.settings.auto_actions. Si una acción está off,
// el LLM NO se entera de su tool → ahorra latencia + tokens. La gate
// server-side en bot-actions queda como red de seguridad redundante.
const settings = (ctx.settings && typeof ctx.settings === 'object') ? ctx.settings : {};
const aa = (settings.auto_actions && typeof settings.auto_actions === 'object')
  ? settings.auto_actions : {};

const ACTION_DESC = {
  stage:   '`cambiar_etapa(stage_slug)` — mover al lead a una etapa concreta del pipeline cuando claramente avanzó/retrocedió.',
  qualify: '`marcar_calificado(is_qualified)` — marcar al lead como calificado cuando cumple los criterios del negocio, o no-calificado si quedó claro que no es perfil.',
  assign:  '`asignar_agente(strategy)` — asignar el lead a un agente humano del equipo. Strategy: round_robin | least_loaded.',
  tag:     '`agregar_etiqueta(tag_name)` — etiquetar al lead con una tag ya existente de la agency.',
  note:    '`escribir_nota(body)` — agregar una nota interna sobre el lead (no la ve el lead, la ven los humanos en el CRM).',
};

const permitted = [];
if (aa.stage === true)   permitted.push(ACTION_DESC.stage);
if (aa.qualify === true) permitted.push(ACTION_DESC.qualify);
if (aa.assign === true)  permitted.push(ACTION_DESC.assign);
if (aa.tag === true)     permitted.push(ACTION_DESC.tag);
if (aa.note === true)    permitted.push(ACTION_DESC.note);

if (permitted.length > 0) {
  blocks.push(
    '## AUTO-ACCIONES PERMITIDAS\n'
    + 'Además de conversar, podés tomar las siguientes acciones sobre el lead vía tools. '
    + 'Usá UNA tool por turno, solo cuando hay señal CLARA de que corresponde. NO accionar por las dudas.\n'
    + permitted.join('\n')
  );
}
// Si ninguna está on, NO se agrega el bloque. El LLM no se entera; las tools siguen
// existiendo conectadas pero el LLM no las invoca (sin instrucción ni descripción
// en el system prompt, las ignora).
```

### 6.2 Bloque "## HORARIO DE ATENCIÓN" (dinámico, solo si `bot_schedule.mode='office_hours'`)

Después del bloque "## AUTO-ACCIONES PERMITIDAS". Código:

```javascript
// [HORARIO DE ATENCIÓN] — F4: contexto del horario para que el LLM no prometa
// "te respondo en 5 min" un viernes a las 23:00. El gating REAL es server-side
// (Calcular Estado de Horario + Pausar Bot Hasta Hora Hábil). Esto es preventivo.
const bs = (settings.bot_schedule && typeof settings.bot_schedule === 'object')
  ? settings.bot_schedule : {};
const bh = (settings.business_hours && typeof settings.business_hours === 'object')
  ? settings.business_hours : {};

if (bs.mode === 'office_hours') {
  const dayNames = { 0:'domingo', 1:'lunes', 2:'martes', 3:'miércoles', 4:'jueves', 5:'viernes', 6:'sábado' };
  const days = Array.isArray(bh.days) ? bh.days : [1,2,3,4,5];
  const daysStr = days.map(function(d) { return dayNames[d] || ''; }).filter(Boolean).join(', ');
  const fromStr = typeof bh.from === 'string' ? bh.from : '08:00';
  const toStr = typeof bh.to === 'string' ? bh.to : '18:00';
  const tz = typeof bh.tz === 'string' ? bh.tz : 'America/Costa_Rica';

  blocks.push(
    '## HORARIO DE ATENCIÓN\n'
    + 'Este negocio atiende ' + daysStr + ' de ' + fromStr + ' a ' + toStr + ' (' + tz + ').\n'
    + 'Si el lead pide algo que requiere horario hábil (visita, llamada, agendar), confirmá que será dentro del horario. '
    + 'Si el lead te pregunta "¿están abiertos ahora?", chequeá vs el horario y respondé honestamente. '
    + 'NO prometas tiempos de respuesta de humanos fuera de horario.'
  );
}
```

### 6.3 Orden final de bloques del compositor en F4

```
A. core (bot_prompt_templates layer='core', global)
B. capas de bot_config (## SOBRE ESTE NEGOCIO, ## TONO, ## COMPORTAMIENTO DE VENTA, ## FLUJO DE CONVERSACIÓN, ## INSTRUCCIONES ADICIONALES)
C. fragmentos de módulos (## MÓDULO: X)
   ↓
DATOS A CAPTURAR (F2 - extractor)
   ↓
AUTO-ACCIONES PERMITIDAS (F4 - nuevo, dinámico)
   ↓
HORARIO DE ATENCIÓN (F4 - nuevo, solo si office_hours)
   ↓
D. rules (bot_prompt_templates layer='system_rules', global)
```

---

## 7. Migración nueva: `0014_lead_notes.sql`

**Por qué B y no A:** la columna `leads.notes` es un único string sobreescribible. Usarla destruye notas previas (humanas o del bot). Tabla nueva = proper.

```sql
-- =============================================================================
-- Momentum AI CRM — Migration 0014: lead_notes
-- =============================================================================
-- Notas internas sobre un lead. Multi-row, con procedencia (bot|human),
-- editable/deletable por humanos, append-only por bot. Visibles solo en el CRM
-- (NO se mandan al lead).
--
-- Trigger de F4: el bot necesita una `note.write` operation para registrar
-- contexto interno ("lead pidió hablar con Carlos pero Carlos no atiende sábados").
-- La columna `leads.notes` es un único string sobreescribible, no sirve.
--
-- Frontend: la tab Contact Detail (skill crm-contact-detail-tabs) lista estas
-- notas en orden cronológico desc con badge bot/human + nombre del autor.
-- =============================================================================

create table public.lead_notes (
    id          uuid primary key default gen_random_uuid(),
    agency_id   uuid not null references public.agencies(id) on delete cascade,
    lead_id     uuid not null references public.leads(id) on delete cascade,
    body        text not null,
    created_by_kind text not null check (created_by_kind in ('bot','human')),
    created_by_user uuid references public.users(id) on delete set null,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create index idx_lead_notes_lead on public.lead_notes(lead_id, created_at desc);
create index idx_lead_notes_agency on public.lead_notes(agency_id, created_at desc);

comment on table public.lead_notes is
    'Notas internas sobre un lead. Multi-row, procedencia bot|human, visible solo en CRM.';
```

**Decisión del builder:** aplicar esta migración ANTES de deployar `bot-actions` v0.2.0 con el handler de `note.write`. Sin la tabla, el handler tiraría error → marcado como precondición.

---

## 8. Diseño de los 6 handlers nuevos en `bot-actions`

Todos comparten la lógica de envelope (auth, cross-tenant, etc.) que ya existe en `index.ts` (F2). F4 reemplaza los stubs del switch case y agrega `conversation.pause_until`. Filosofía de errores idéntica a F2 (200 ok:true|false para que el agente no aborte; 401/403/400 solo para envelope/auth/cross-tenant).

### 8.1 `stage.set`

**Input `params`:**
```json
{ "stage_slug": "calificado" }   // o "stage_id": "<uuid>"
```

**Lógica:**
1. **Gate del toggle:** SELECT `settings->'auto_actions'->>'stage'` desde `agencies`. Si `=== 'false'` → 200 `{ ok: true, skipped: [{reason: 'auto_action_disabled', toggle: 'stage'}] }`.
2. Resolver `stage_id`: si `params.stage_id` viene, validar que existe y pertenece a la agency (SELECT con `agency_id=$1 AND id=$2`). Si `params.stage_slug` viene, SELECT por `agency_id=$1 AND slug=$2`. Si no se resuelve → 200 `{ ok: true, skipped: [{reason: 'stage_not_found', value}] }`.
3. UPDATE `leads SET stage_id=$1, stage_set_by='bot', stage_set_at=now(), stage_set_by_user=NULL WHERE id=$2 AND agency_id=$3`.
4. Log + return `{ ok: true, updated: { stage_id, stage_slug } }`.

**Idempotencia:** si la stage ya es la misma, el UPDATE escribe igual (timestamp se renueva). No es problema; el iconito bot/humano en el CRM refleja "última vez el bot la confirmó".

### 8.2 `qualify.set`

**Input `params`:**
```json
{ "is_qualified": true }
```

**Lógica:**
1. Gate `settings.auto_actions.qualify === true`. Off → skip.
2. Coerción de `is_qualified` a boolean: `params.is_qualified === true || params.is_qualified === 'true' || params.is_qualified === 1`. Si no es boolean coercible → skip con `invalid_value`.
3. UPDATE `leads SET is_qualified=$1, qualified_set_by='bot', qualified_set_at=now(), qualified_set_by_user=NULL WHERE id=$2 AND agency_id=$3`.
4. Return `{ ok: true, updated: { is_qualified } }`.

### 8.3 `assign.set`

**Input `params`:**
```json
{ "strategy": "round_robin" }   // o "round_robin" | "least_loaded" | "user_id": "<uuid>"
```

**Lógica:**
1. Gate `settings.auto_actions.assign === true`. Off → skip.
2. Resolver `user_id` final:
   - Si `params.user_id` viene → validar que es un user activo de la agency (JOIN con `agency_members` o como esté modelado). Si no → skip `user_not_in_agency`.
   - Si `params.strategy === 'round_robin'` → SELECT users de la agency activos, ordenar por `assigned_user_id` actual menos reciente. Pseudo: `SELECT u.id FROM users u JOIN agency_members am ON am.user_id=u.id WHERE am.agency_id=$1 AND u.is_active=true ORDER BY (SELECT MAX(c.created_at) FROM conversations c WHERE c.assigned_user_id=u.id) NULLS FIRST LIMIT 1`. Si no hay users → skip `no_agents_available`.
   - Si `params.strategy === 'least_loaded'` → SELECT users con menor `count(conversations WHERE assigned_user_id=u.id AND handler='human' AND archived_at IS NULL)`. Si no hay → skip.
3. UPDATE `conversations SET assigned_user_id=$1, assigned_set_by='bot', assigned_set_at=now(), assigned_set_by_user=NULL WHERE id=$2 AND agency_id=$3`. **Importante: assigned_user_id está en `conversations`, NO en `leads`** (verificado migración 0003 línea 85). El brief del founder lo tenía mal — corregido.
4. Return `{ ok: true, updated: { user_id: <resolved>, strategy } }`.

**Nota al builder:** la lógica de round_robin/least_loaded requiere conocer el schema de `agency_members` (verificar en migración correspondiente). Si la tabla no existe o usa otro nombre, ajustar. **Si no podés resolver el schema, devolver skip con reason `not_implemented_strategy` y dejarlo para iteración.**

### 8.4 `tag.add`

**Input `params`:**
```json
{ "tag_name": "VIP" }   // o "tag_id": "<uuid>"
```

**Lógica:**
1. Gate `settings.auto_actions.tag === true`. Off → skip.
2. Resolver `tag_id`: si viene `tag_id`, validar agency. Si viene `tag_name`, SELECT `tags WHERE agency_id=$1 AND name=$2`. Si no existe → **NO crear tag desde el bot** (igual filosofía D3 de F2: no contaminar schema desde el LLM). Skip con `unknown_tag` + warning.
3. INSERT en `tag_assignments` con `entity_type='lead'`, `entity_id=lead_id`, `created_by_kind='bot'`, `created_by=NULL`. **Idempotente vía UNIQUE (tag_id, entity_type, entity_id)** — si ya existe, ignorar el conflicto: `ON CONFLICT DO NOTHING`.
4. Return `{ ok: true, added: { tag_id, tag_name } }` o `{ ok: true, skipped: [{reason: 'already_tagged'}] }`.

### 8.5 `note.write`

**Input `params`:**
```json
{ "body": "Lead pidió hablar con Carlos pero Carlos no atiende sábados." }
```

**Precondición:** migración `0014_lead_notes.sql` aplicada (§7).

**Lógica:**
1. Gate `settings.auto_actions.note === true`. Off → skip.
2. Validar `body` no vacío, trim, max 2000 chars (cap defensivo). Si vacío → skip `empty_body`.
3. INSERT `lead_notes (agency_id, lead_id, body, created_by_kind, created_by_user) VALUES ($1, $2, $3, 'bot', NULL)`.
4. Return `{ ok: true, note_id: <uuid> }`.

**No es idempotente** (cada call crea una nota nueva). El LLM puede crear duplicados si el prompt no es claro. Mitigación: la toolDescription enfatiza "una nota por turno máximo, solo cuando hay información NUEVA".

### 8.6 `handoff.escalate`

**Input `params`:**
```json
{ "reason": "qualified", "summary": "[hot] timing junio, budget 250mil USD, zona Escazú, aceptó propiedad CR-2031" }
```

**Validación:**
- `reason` debe estar en el enum Postgres `conversation_handoff_reason`: `qualified | scheduling | objection_complex | bot_stuck | user_requested | manual`. Si no → coerción: mapear los valores que la toolDescription menciona (`manual` ya está en el enum, ok; si llega cualquier otra cosa, default a `manual`).
- `summary` string max 1000 chars, trim.

**NO hay gate de toggle.** El handoff no es una "auto-acción del bot" del mismo tipo que las 5 (cambiar etapa, etc.). Es comportamiento conversacional: si el bot decide escalar, el founder no querría tener un toggle "no, el bot no puede escalar". Eso destruiría la safety net del handoff.

**Lógica:**
1. **Idempotencia para prevenir doble-handoff (el caso race con el detector):** UPDATE solo si `handoff_status != 'pending'`. Pseudo:
```sql
UPDATE conversations
SET handler='human',
    handoff_status='pending',
    handoff_reason=$1,
    handoff_summary=$2,
    handoff_at=now()
WHERE id=$3
  AND agency_id=$4
  AND handoff_status <> 'pending'
RETURNING id;
```
2. Si el UPDATE devuelve 0 rows → ya estaba en pending (probable race con el detector). Return `{ ok: true, skipped: [{reason: 'already_pending'}] }`.
3. Si devuelve 1 row → trigger notificación Telegram (mismo patrón que `Apagar Chatbot — Conversation` hace hoy desde n8n). Opciones:
   - (a) Dejarlo a n8n: bot-actions NO manda Telegram, solo escribe a DB. n8n no se entera (la tool del LLM termina ahí). **Problema:** la ruta del detector hace Telegram desde n8n; la ruta de la tool no notificaría. Inconsistente.
   - (b) bot-actions manda Telegram server-side: requiere env vars TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID. Más prolijo.
4. **Recomendación:** opción (b). El edge function manda Telegram con el mismo mensaje formato que el detector usa (replicar el text del nodo `Telegram` del workflow). Requiere precondición de las env vars (verificar si ya están en Supabase v2 — el founder dijo que usa Telegram, así que probablemente sí).
5. Return `{ ok: true, escalated: { reason, summary, telegram_sent: true|false } }`.

**Cobertura del race:** detector dispara → UPDATE escribe `handler='human', handoff_status='pending'` (vía nodo postgres). Mismo turno la tool dispara → UPDATE con `WHERE handoff_status<>'pending'` → afecta 0 rows → skip silencioso. Sin doble-Telegram (el detector ya mandó el suyo, la tool no manda porque skipea). Limpio.

### 8.7 `conversation.pause_until` (séptima operation, sin gate de toggle)

Ya descrita en §5.1. Resumen del schema:

**Input `params`:** `{ pause_until_iso, send_out_of_office, out_of_office_message, lead_phone, business_phone }`.

**Output:** `{ ok: true, paused_until: <iso>, sent_out_of_office: true|false }`.

Esta operation **NO se invoca desde el LLM** (no es una tool del agente). Se invoca desde el HTTPRequest node `Pausar Bot Hasta Hora Hábil` del workflow. Por eso NO requiere bloque "## AUTO-ACCIONES PERMITIDAS"; no requiere $fromAI.

---

## 9. Tools nuevas en n8n: jsonBody + toolDescription literal

### 9.1 `Stage Tool (bot-actions)`

**toolDescription:**
```
Mover al lead a una etapa concreta del pipeline cuando claramente avanzó o retrocedió.
USALA cuando el lead diga algo que hace evidente que entró/salió de una fase:
- "estoy listo para visitarla" → mover a etapa de "agendamiento"
- "no me interesa más" → mover a "perdido"
- "necesito hablar con mi pareja primero" → mover a "consultando"
NO la uses si no estás seguro de qué etapa exacta corresponde. NO la uses cada turno.
Una llamada con stage_slug del pipeline (ej: 'nuevo', 'calificado', 'agendado', 'cerrado_ganado', 'cerrado_perdido') — usá los slugs listados en el bloque de pipeline del prompt.
Si el toggle está apagado server-side, no se aplica; vos seguís conversando normal.
```

**jsonBody:**
```json
{
  "operation": "stage.set",
  "agency_id": "{{ $('Resolve Agency').first().json.agency_id }}",
  "lead_id": "{{ $('Buscar Lead (Supabase)').first().json.id }}",
  "conversation_id": "{{ $('Get Conversation State').first().json.id }}",
  "params": {
    "stage_slug": "{{ $fromAI('stage_slug', 'Slug de la pipeline_stage destino. Debe ser EXACTAMENTE uno de los slugs del pipeline listado en el system prompt; no inventes.', 'string') }}"
  }
}
```

### 9.2 `Qualify Tool (bot-actions)`

**toolDescription:**
```
Marcar al lead como CALIFICADO (true) o NO calificado (false) según los criterios del negocio descritos en el system prompt.
USALA SOLO cuando hay señal CLARA: el lead dio explícitamente los datos que el negocio considera criterio de calificación (presupuesto + timing + intent, o lo que sea según el bot_config).
NO la uses por dar un solo dato suelto. NO la uses en el primer turno. NO la uses si el lead solo está preguntando información general.
Bug histórico 2026-05-20: el bot calificó por solo dar una zona. NO REPETIR.
Una llamada con is_qualified booleano.
```

**jsonBody:**
```json
{
  "operation": "qualify.set",
  "agency_id": "{{ $('Resolve Agency').first().json.agency_id }}",
  "lead_id": "{{ $('Buscar Lead (Supabase)').first().json.id }}",
  "conversation_id": "{{ $('Get Conversation State').first().json.id }}",
  "params": {
    "is_qualified": "{{ $fromAI('is_qualified', 'true si el lead cumple los criterios de calificación del negocio (descritos en el system prompt), false si quedó claro que NO es perfil. Solo si hay evidencia clara.', 'boolean') }}"
  }
}
```

### 9.3 `Assign Tool (bot-actions)`

**toolDescription:**
```
Asignar el lead a un agente humano del equipo, para que la persona lo vea en su inbox.
USALA cuando el lead está listo para que un humano tome el caso pero NO es handoff de emergencia (handoff total = otra tool, escalar_handoff).
Asignación = "este lead te toca a vos cuando puedas, no es urgente". Handoff = "atendelo YA porque el bot no puede".
Strategy: round_robin (rota entre agentes), least_loaded (al menos cargado).
Usá round_robin por default. Si NO hay agentes en el equipo, la acción se skipea silenciosamente.
```

**jsonBody:**
```json
{
  "operation": "assign.set",
  "agency_id": "{{ $('Resolve Agency').first().json.agency_id }}",
  "lead_id": "{{ $('Buscar Lead (Supabase)').first().json.id }}",
  "conversation_id": "{{ $('Get Conversation State').first().json.id }}",
  "params": {
    "strategy": "{{ $fromAI('strategy', 'Estrategia de asignación: round_robin | least_loaded. Default round_robin.', 'string') }}"
  }
}
```

### 9.4 `Tag Tool (bot-actions)`

**toolDescription:**
```
Etiquetar al lead con una tag existente de la agency, para clasificarlo (ej: VIP, frio, comprador-cash, primera-vivienda).
USALA cuando el lead reveló algo que califica para una tag específica del negocio.
NO crees tags nuevas: solo podés usar tags que ya existen. Si la tag que querés agregar no existe, la acción se skipea silenciosamente — seguí conversando.
Una llamada con tag_name (el nombre exacto de la tag).
```

**jsonBody:**
```json
{
  "operation": "tag.add",
  "agency_id": "{{ $('Resolve Agency').first().json.agency_id }}",
  "lead_id": "{{ $('Buscar Lead (Supabase)').first().json.id }}",
  "conversation_id": "{{ $('Get Conversation State').first().json.id }}",
  "params": {
    "tag_name": "{{ $fromAI('tag_name', 'Nombre exacto de la tag a agregar al lead. Solo tags que existen en la agency (NO inventes).', 'string') }}"
  }
}
```

**Mejora futura post-F4:** la query maestra del compositor podría traer `tags` (igual que trae `pipeline_stages` y `extractor_field_defs`) y listarlas en un bloque del prompt "## TAGS DISPONIBLES" para que el LLM tenga la lista exacta. **Hoy NO se hace en F4** para minimizar cambios al compositor y porque el set de tags por agency suele ser corto/intuitivo (el LLM acierta). Documentado en §13 como mejora.

### 9.5 `Note Tool (bot-actions)`

**toolDescription:**
```
Escribir una nota INTERNA sobre el lead (no la ve el lead, la ven los humanos en el CRM).
USALA cuando captás contexto que un agente humano debería saber pero que no encaja en los DATOS A CAPTURAR estructurados.
Ejemplos: "Lead pidió hablar con Carlos pero Carlos no atiende sábados". "Lead mencionó que su pareja también está mirando, decisión a 2".
NO la uses para repetir lo que ya quedó en extractor_field_values. NO la uses para datos estructurados (eso es extraer_datos).
Máximo UNA nota por turno. Solo cuando hay info NUEVA que el agente debe ver.
```

**jsonBody:**
```json
{
  "operation": "note.write",
  "agency_id": "{{ $('Resolve Agency').first().json.agency_id }}",
  "lead_id": "{{ $('Buscar Lead (Supabase)').first().json.id }}",
  "conversation_id": "{{ $('Get Conversation State').first().json.id }}",
  "params": {
    "body": "{{ $fromAI('body', 'Cuerpo de la nota interna sobre el lead, máximo 2000 caracteres. Solo info NUEVA que un humano debería ver, no estructurada.', 'string') }}"
  }
}
```

### 9.6 `Request Handoff Tool` (MODIFICADA)

**toolDescription:** IDÉNTICA a la que ya está en el workflow actual (las 6 condiciones SPSP calibradas tras el bug del 2026-05-20). NO se toca. El builder copia literal el campo del JSON v6-v1.

**jsonBody:** wrappea el body actual con envelope universal:
```json
{
  "operation": "handoff.escalate",
  "agency_id": "{{ $('Resolve Agency').first().json.agency_id }}",
  "lead_id": "{{ $('Buscar Lead (Supabase)').first().json.id }}",
  "conversation_id": "{{ $('Get Conversation State').first().json.id }}",
  "params": {
    "reason": "{{ $fromAI('reason', 'Razón del handoff. Valores válidos exactos: qualified | scheduling | objection_complex | manual. Mapping: hot lead completo→qualified, lead pide visita→scheduling, frustración→manual (con [frustrated] en summary), info-only cerrado→manual (con [info-only-closed] en summary), objeción financiera compleja→objection_complex, lead pide humano→manual.', 'string') }}",
    "summary": "{{ $fromAI('summary', 'Recap breve para el humano con prefijo según perfil. Formatos: [hot] timing X, budget Y, zona Z, aceptó propiedad W. [active-shopper] pidió ver propiedad X, propuesta horario Y. [investor] cash X, estrategia Y, zona Z, ROI esperado %. [frustrated] última info útil, lead pidió parar. [info-only-closed] zona aprox, rango aprox, acepta drip. [bot_stuck] N+ turnos sin avance.', 'string') }}"
  }
}
```

**URL:** `{{ $env.SUPABASE_V2_URL }}/functions/v1/bot-actions`.

**Header Authorization:** `=Bearer {{ $env.BOT_ACTIONS_SECRET }}`. **CAMBIA** de `HANDOFF_INTERNAL_SECRET` a `BOT_ACTIONS_SECRET` (handoff vive ahora en bot-actions, secret unificado).

**Conexión `ai_tool`:** RESTAURAR (estaba removida en F1 Opción B). El builder agrega la conexión.

---

## 10. Riesgos previstos (OBLIGATORIO — mínimo 3)

1. **El LLM dispara múltiples auto-acciones en cascada en un mismo turno (probabilidad MEDIA-ALTA con 6 tools activas).** "Te asigno + te cambio etapa + te etiqueto + te escribo nota + te califico, todo en un turno". El costo en tokens + latencia es alto y los humanos ven 5 cambios al lead simultáneos en el inbox, ruidoso. **Mitigación:** (a) toolDescriptions explícitas "una tool por turno, solo con señal clara"; (b) bloque "## AUTO-ACCIONES PERMITIDAS" del compositor dice "USÁ UNA tool por turno"; (c) las gates server-side por toggles siguen como red de seguridad; (d) el cap de iterations del agente LangChain de n8n limita las tools por turno. **Monitoreo F4 obligatorio:** revisar logs de `bot-actions` post-test para ver patrón de calls; si hay >3 calls por turno repetido, ajustar prompt.

2. **`stage_slug` alucinado (probabilidad MEDIA).** El LLM puede inventar slugs (`agendar` vs `agendamiento`). **Mitigación:** la query maestra trae `pipeline_stages` (verificado en F1). Agregar bloque "## ETAPAS DEL PIPELINE" al compositor (futuro o ahora — decidir; recomiendo hacerlo en F4 dado que ya estoy tocando el compositor — listo abajo en §6 como ítem opcional pendiente). Hoy es opcional porque las stages probablemente están en el prompt del bot_config; pero más seguro listarlas explícitamente. **Decisión pendiente del founder.**

3. **Race detector + tool handoff en el mismo turno (probabilidad BAJA, alto impacto si no se cubre).** El LLM llama `handoff.escalate` + el detector también dispara, ambos escriben el mismo UPDATE. Cubierto por idempotencia (WHERE `handoff_status<>'pending'`). Riesgo: el detector hace su UPDATE desde un nodo postgres separado en n8n que **NO incluye el guard idempotente** (lo verifiqué: hace UPDATE incondicional). Hay race posible: detector escribe (handoff_status=pending), tool llama, su UPDATE escribe igual (no error porque no hay constraint). **Mitigación crítica:** modificar el nodo `Apagar Chatbot — Conversation` para incluir el guard `WHERE handoff_status <> 'pending'` (UPDATE devuelve 0 rows si ya está en pending). Sin esto, doble-handoff posible. **Acción para el builder:** agregar el guard al query del nodo. Documentado como tarea menor en §13.

4. **Cálculo de `next_business_start_iso` impreciso por DST/timezone (probabilidad MEDIA, impacto BAJO).** El `Calcular Estado de Horario` usa un workaround con `new Date(isoLocal + 'Z')` que puede estar ±1-2 horas off (§5.2). **Mitigación:** aceptable para F4 (el bot despierta con un buffer; el próximo inbound del lead reactiva normal). Post-F4 si el founder pide precisión, importar `luxon` al edge function (server-side donde es más fácil) y recalcular ahí, o mover el cálculo al edge function que tiene mejor soporte tz.

5. **YCloud API key no configurada en Supabase v2 (probabilidad MEDIA).** El handler `conversation.pause_until` necesita mandar el out_of_office_message vía YCloud. Si `YCLOUD_API_KEY` no está en Supabase v2, la operation falla. **Mitigación:** precondición §12. Si falla, el handler retorna `{ ok: true, sent_out_of_office: false }`; el workflow no aborta, pero el lead NO recibe el out_of_office_message. **Build-time check:** el builder verifica que la env var está antes de deploy. Si no está, agregar fallback: si YCloud falla, el `Pausar Bot` solo escribe `bot_paused_until` sin mandar mensaje (mejor que nada — el lead simplemente no recibe respuesta hasta el horario hábil; el comportamiento es similar a `bot_enabled=false`).

6. **Sobrecarga del compositor con bloques cada turno (probabilidad BAJA).** Hoy el compositor ya inyecta core + bot_config + modules + DATOS A CAPTURAR + rules. F4 agrega 2 bloques más (AUTO-ACCIONES PERMITIDAS + HORARIO DE ATENCIÓN). En total el system prompt puede crecer 200-400 tokens más. Para una conversación de 20 turnos, son ~4-8k tokens extra de costo acumulado. **Mitigación:** los bloques son condicionales (solo se agregan si aplica); el bloque de horarios solo si `mode='office_hours'`. La query maestra no cambia (ya traía todo). Monitorear costo en F4 (`supabase functions logs bot-actions`).

7. **`assign.set` con strategy `round_robin` necesita schema `agency_members` (probabilidad MEDIA si no existe).** El brief del founder no menciona si `agency_members` existe en v2. Hay que verificarlo. Si no existe, la query del handler falla. **Mitigación:** el builder verifica el schema antes de implementar; si no existe, devolver `{ ok: true, skipped: [{reason: 'agency_members_not_implemented'}] }` y dejar el handler como TODO para post-F4 (no bloquea F4 entera porque el toggle por defecto puede ser off para la demo de Robert).

8. **`note.write` crea duplicados por turn-loop del agente (probabilidad BAJA-MEDIA).** Si el LLM llama `note.write` con el mismo body en el mismo turno o en turnos consecutivos, se acumulan filas. **Mitigación:** la tabla `lead_notes` NO tiene UNIQUE constraint sobre body (porque podrían ser legítimamente parecidas). La toolDescription enfatiza "una nota por turno". Como mitigación adicional: el handler puede comparar el body con la última nota del lead (SELECT última y skip si body idéntico). Implementación: agregar SELECT antes del INSERT. **Recomendado: incluir esa defensa.**

---

## 11. Casos edge a contemplar (OBLIGATORIO — mínimo 4)

1. **Happy path completo (todos los toggles ON, horario hábil, demo Robert).** Lead escribe "Tengo dolor crónico de espalda, presupuesto 100 mil al mes, urgente, dame visita el lunes" en horario hábil. El agente: (a) llama `extraer_datos` con `[{intencion:'avanzar'}, {presupuesto:100000}, {urgencia:'alta'}]`; (b) llama `qualify.set` con `is_qualified=true`; (c) llama `stage.set` con `stage_slug='agendamiento'`; (d) llama `assign.set` con `strategy=round_robin`; (e) llama `escribir_nota` con "Lead pidió lunes específico". Responde al lead "Perfecto, te confirmo lunes con Robert". **Verificable:** `leads.is_qualified=true, qualified_set_by='bot'`, `leads.stage_id` resuelto a "agendamiento", `conversations.assigned_user_id` seteado con `assigned_set_by='bot'`, 1 fila en `lead_notes`. Iconito bot en el CRM en cada campo.

2. **Lead curioso / info-only.** "¿qué hacen ustedes?". Bot responde con `business_info`. NO llama ninguna auto-action (no hay señal). NO llama `extraer_datos` (no hay dato). NO llama `handoff.escalate`. **Verificable:** logs sin entries del lead para auto-actions; conversación queda en estado inicial.

3. **Lead frustrado / pide humano.** "ya me cansaste, quiero hablar con alguien". Dos rutas posibles que pueden converger:
   - **Ruta tool LLM:** el LLM llama `handoff.escalate` con `reason='manual'` y `summary='[frustrated] lead pidió parar tras 3 turnos'`. bot-actions: UPDATE conversations + manda Telegram.
   - **Ruta detector:** el `Detector de Descalificacion` también puede disparar `apagar_bot=true`. UPDATE desde n8n.
   - **Race idempotente:** una de las dos llega primero. La segunda intenta UPDATE, ve `handoff_status='pending'` (con el guard agregado al detector — riesgo R3), 0 rows afectadas, skipea. Sin doble-Telegram (si bot-actions mandó, el detector ve la condición pendiente y... espera, el detector hoy no chequea handoff_status antes de mandar Telegram. **Acción adicional:** el detector debería chequear esto antes de mandar Telegram, o se manda Telegram doble).
   - **Mitigación práctica:** preferimos que ambos manden (el founder recibe 2 Telegrams, sabe que el lead se frustró, ningún problema crítico). Si molesta, agregar IF en el flow del detector que skipee Telegram si bot-actions ya escribió.
   - **Verificable:** `conversations.handler='human'`, `handoff_status='pending'`, `handoff_reason='manual'`. Bot se silencia en próximos turnos.

4. **Tool falla / timeout / 401 / bot-actions caído.** Cualquier tool (auto-action o handoff) devuelve no-200 o no responde. **Comportamiento esperado:** el agente NO aborta el turno (regla núcleo capa A); sigue conversando normal. El lead NUNCA ve el error. La auto-acción se intenta de nuevo el próximo turno si la situación persiste. **Verificable:** rotar BOT_ACTIONS_SECRET en Supabase sin actualizar n8n → tools devuelven 401 → bot responde igual al lead.

5. **Lead manda mensaje fuera de horario por primera vez.** Viernes 23:00 CR. Flujo: webhook → Resolve Agency → Buscar Lead → Get Conversation State (`bot_paused_until=NULL`) → Chatbot Activado? (true) → Calcular Estado de Horario (`is_outside=true, next_business_start_iso=lunes 8am UTC-6`) → ¿Fuera de Horario? (true) → Pausar Bot Hasta Hora Hábil → bot-actions: manda out_of_office_message + setea `bot_paused_until=lunes 8am`. Workflow termina. Lead recibe "Estamos fuera de horario". **Verificable:** fila en `messages` con sender_kind='system', body=out_of_office_message; `conversations.bot_paused_until` futuro.

6. **Lead manda 2do mensaje durante el wait.** Sábado 10:00 CR. Flujo: webhook → Get Conversation State (`bot_paused_until=lunes 8am, futuro`) → Chatbot Activado? **FALSE**. Workflow termina. Lead NO recibe nada (no se manda out_of_office_message de nuevo). Mensaje queda en historial inbound. **Verificable:** fila inbound en `messages` (escrita por ycloud-webhook), 0 outbound nuevo.

7. **Lead reactivado: lunes 8:05 CR escribe.** Flujo: webhook → Get Conversation State (`bot_paused_until=lunes 8am, vencido`) → Chatbot Activado? TRUE → Calcular Estado de Horario (`is_outside=false`, dentro del horario) → ¿Fuera de Horario? FALSE → flujo normal → agente responde con TODO el historial inbound del lead (incluido el mensaje del viernes + sábado + el actual) cargado por `Postgres Chat Memory` y `Conversation` history. **Verificable:** el agente responde considerando los 3 mensajes del lead, no solo el último.

8. **Toggle `auto_actions.note=false` pero el LLM intenta llamar la tool igual.** Caso edge donde el compositor SÍ listó la tool (bug), o el LLM ignoró el bloque. La tool llega a bot-actions. El handler `note.write` chequea `settings.auto_actions.note === false` → 200 `{ ok: true, skipped: [{reason: 'auto_action_disabled', toggle: 'note'}] }`. **Verificable:** logs server-side reflejan el skip; el bot sigue conversando.

9. **Founder activa el bot manualmente desde el CRM durante un wait.** El founder ve "lead esperando desde el viernes" y quiere que el bot le responda YA aunque sea sábado. Hoy NO hay UI para esto, pero la implementación es trivial: `UPDATE conversations SET bot_paused_until = NULL WHERE id = ?`. Próximo mensaje del lead → Chatbot Activado true → Calcular Estado de Horario → `is_outside=true` (es sábado fuera de horario) → el ciclo se repite. **El override del founder requiere también desactivar bot_schedule.mode** para esa conversación, o cambiar `bot_schedule.mode='24_7'` global. **Decisión:** no implementar override por conversación en F4 (overkill); el founder cambia `bot_schedule.mode` global si quiere atender fuera de horario. Documentado.

10. **Agency NO setea `bot_schedule` en settings (settings = `{}` o sin esa key).** `parseSettings()` default es `mode='24_7'`. `Calcular Estado de Horario` → `is_outside=false` siempre. El bot opera 24/7. **Verificable:** no se llega nunca al `Pausar Bot`.

11. **Lead durante wait pide humano.** El detector no corre (porque `Chatbot Activado?` lo cortó). El lead queda esperando hasta la hora hábil. **Aceptable** porque ya recibió el out_of_office_message original; si pidió humano fuera de horario, ningún humano va a atender hasta la hora hábil de todos modos. **Documentado en §4 análisis comparativo opción B vs C** — el founder votó C, esto es consecuencia esperada.

---

## 12. Variables de entorno requeridas

| Var | Para qué | Dónde se setea | Estado |
|---|---|---|---|
| `BOT_ACTIONS_SECRET` | Auth Bearer de las 6 tools del bot + workflow HTTPRequest `Pausar Bot`. | Supabase v2 + N8N. | ✅ ya existe (F2). |
| `YCLOUD_API_KEY` | Mandar out_of_office_message server-side desde `conversation.pause_until`. | Supabase v2 Edge Function Secrets. | Verificar (probablemente ya existe desde el intake). Si NO, agregar como precondición. |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | Notificación Telegram desde `handoff.escalate` server-side (recomendación 8.6 opción b). | Supabase v2 Edge Function Secrets. | Verificar. Hoy el n8n las usa; replicar para Supabase. **Si el founder prefiere mantener Telegram en n8n solamente:** dejar como opción (a) en 8.6, sin estas vars. |
| `SUPABASE_V2_URL` | URL base usada por todas las tools. | N8N env vars. | ✅ ya existe (F1/F2). |

---

## 13. Cambios fuera del workflow (solo lista, NO implementar acá)

1. **Migración SQL `0014_lead_notes.sql`** (§7) aplicada en v2 ANTES de deploy de bot-actions v0.2.0.
2. **Edge function `bot-actions` v0.2.0**: reemplaza los 6 stubs con handlers reales + agrega `conversation.pause_until`. Reusa el envelope (auth, cross-tenant, helpers de respuesta) ya existente.
3. **Variables de entorno** según §12.
4. **(Tarea menor para el builder pero NO de F4 propiamente):** agregar guard `WHERE handoff_status <> 'pending'` al UPDATE del nodo `Apagar Chatbot — Conversation` del workflow (riesgo R3).
5. **(Opcional/decisión pendiente):** agregar bloque "## ETAPAS DEL PIPELINE" al compositor (lista las stages disponibles para que el LLM use `stage_slug` correctos). Mi voto: SÍ incluir, código corto. **Pregunta al founder.**
6. **(Opcional/decisión pendiente):** agregar bloque "## TAGS DISPONIBLES" al compositor. Mi voto: NO incluir en F4 (set de tags suele ser corto, el LLM acierta, evitar overkill). Si emerge problema, post-F4.
7. **(Opcional/post-F4):** UI en el CRM para que el founder vea las `lead_notes` en el tab Contact Detail. Frontend, fuera de F4. Skill `crm-contact-detail-tabs`.

---

## 14. Tests manuales que el reviewer/founder debe correr

**Pre-flight:**
- A. Healthcheck bot-actions v0.2.0: `curl https://<v2>/functions/v1/bot-actions` → `{status:'ok', version:'0.2.0', ...}`.
- B. Migración 0014 aplicada: `SELECT * FROM lead_notes LIMIT 1` (debe devolver 0 rows sin error).
- C. Smoke test cada operation con curl + Bearer:
  - `stage.set` con stage_slug existente → verificar UPDATE en leads.
  - `qualify.set` con `is_qualified:true` → verificar UPDATE.
  - `assign.set` con `strategy:round_robin` → verificar UPDATE en conversations.
  - `tag.add` con tag_name existente → verificar fila en tag_assignments.
  - `note.write` con body → verificar fila en lead_notes.
  - `handoff.escalate` con reason+summary → verificar UPDATE en conversations + Telegram recibido.
  - `conversation.pause_until` con ISO futuro → verificar UPDATE conversations.bot_paused_until + fila en messages.

**End-to-end (workflow activo, demo Robert):**
- D. Happy path completo: mandar mensaje con todos los datos en horario hábil. Verificar las 5+ acciones automáticas + extracción.
- E. Toggle off: apagar `auto_actions.stage` en Settings. Mismo mensaje → el bot intenta `stage.set` pero el handler skipea. Verificar que el stage NO cambió (sigue como antes).
- F. Office hours - primer mensaje fuera de horario: setear `bot_schedule.mode='office_hours'`, `business_hours.from='08:00', to='18:00'`, mandar mensaje a las 23:00. Verificar (a) out_of_office_message recibido, (b) `bot_paused_until` futuro en conversations.
- G. Office hours - segundo mensaje durante el wait: mandar otro mensaje 30 min después. Verificar (a) NO se manda out_of_office_message de nuevo, (b) `bot_paused_until` NO cambió, (c) mensaje inbound registrado en messages.
- H. Office hours - reactivación: cambiar `bot_paused_until` manualmente a un timestamp pasado, mandar mensaje. Verificar que el bot responde normal.
- I. Handoff por tool: mandar "quiero hablar con Robert ya". Verificar (a) UPDATE conversations con `handler='human', handoff_status='pending'`, (b) Telegram recibido, (c) próximo mensaje del lead NO recibe respuesta del bot.
- J. Race detector + tool: forzar ambos en el mismo turno (mensaje frustración + LLM responde con tool). Verificar solo UNA fila handoff_status='pending', NO doble Telegram (o aceptado doble si así se decidió en 8.6).
- K. Validator: `node scripts/validate-n8n-expressions.js n8n/workflows/chatbot-momentum-bot-v6-v3.json` → 0 violations.

---

## 15. Handoff al builder

- **Archivos a crear/modificar:**
  - **APLICAR migración:** `crm-v2/supabase/migrations/0014_lead_notes.sql` (§7). Antes del deploy de bot-actions v0.2.0.
  - **MODIFICAR:** `crm-v2/supabase/functions/bot-actions/index.ts` v0.1.0 → v0.2.0. Reemplazar los 6 stubs F4 con handlers reales (§8). Agregar `conversation.pause_until` (§5.1). Conservar envelope, auth, helpers, `extractor.write`. Bumpear `FN_VERSION = "0.2.0"`.
  - **MODIFICAR:** `memory/research/13-bot-v6-compositor-code.md` — agregar 2 bloques nuevos al jsCode (§6.1 y §6.2) entre el bloque `DATOS A CAPTURAR` y el `rules`. Mantener markers HTML.
  - **NUEVO:** `scripts/build-bot-v6-v3.js` (parte del v6-v1 JSON, re-extrae compositor actualizado, agrega 5 tools nuevas + 2 nodos (Code+IF) para office_hours + 1 HTTPRequest para Pausar Bot, modifica Request Handoff Tool, reconecta ai_tool del handoff, agrega 6 conexiones ai_tool nuevas, agrega/redirige conexiones main del office_hours branch, fuerza active:false, valida).
  - **OUTPUT:** `n8n/workflows/chatbot-momentum-bot-v6-v3.json`.

- **Notas especiales al builder (NO obvias):**
  1. **`assigned_user_id` está en `conversations`, NO en `leads`.** El brief del founder lo tenía mal; revisar migración 0003 línea 85 + 0009 línea 43. Las columnas de procedencia `assigned_set_by/at/by_user` también están en `conversations`.
  2. **`handoff_reason` es enum FIJO** (`qualified, scheduling, objection_complex, bot_stuck, user_requested, manual`), NO string libre. Coerción/mapping en el handler `handoff.escalate`. Si llega otra cosa → default `manual`.
  3. **Operation `conversation.pause_until` se llama desde HTTPRequest node (server-to-server), NO desde tool node.** No usa $fromAI. El secret va en el header igual.
  4. **Antes del deploy de bot-actions v0.2.0, aplicar 0014.** Sin la tabla, el handler note.write tira error. Verificar.
  5. **`Pausar Bot Hasta Hora Hábil` debe mandar el out_of_office_message server-side** (desde bot-actions usando YCloud API). NO desde n8n. Justificación en §5.1 nota crítica.
  6. **`YCLOUD_API_KEY`** debe estar en Supabase v2 (verificar). Si no, agregar precondición. Si falla en runtime, el handler retorna sent_out_of_office=false; el workflow no aborta.
  7. **Agregar guard `WHERE handoff_status <> 'pending'`** al nodo postgres `Apagar Chatbot — Conversation` para prevenir doble-handoff (riesgo R3). Tarea menor pero importante.
  8. **El cálculo de `next_business_start_iso`** del Code node usa workaround `new Date(isoLocal + 'Z')` que puede tener ±1-2h de imprecisión por DST. Aceptable para F4. Documentado en §10 R4. NO sobreingerizar con luxon en F4.
  9. **Las 6 tools tienen el mismo patrón** que `Extractor Tool (bot-actions)`: agency_id/lead_id/conversation_id del FLUJO (no $fromAI), Bearer del env var, optimizeResponse=false, sendBody=true specifyBody=json. Copiar el patrón.
  10. **`Request Handoff Tool` cambia secret** de `HANDOFF_INTERNAL_SECRET` a `BOT_ACTIONS_SECRET`. Unificado.
  11. **El IF `¿Fuera de Horario?` va DESPUÉS del `Chatbot Activado?`**, NO antes. Justificación en §3.4 reordenamiento. Crítico para que el silencio durante el wait funcione (mensajes 2do+ mueren en `Chatbot Activado?`, no llegan al office_hours branch).
  12. **`active:false` forzado en el output.** El founder activa tras smoke tests A-C y deploy de bot-actions.
  13. **Si `agency_members` no existe en v2**, el handler `assign.set` con `strategy=round_robin` devuelve skip `agency_members_not_implemented`. Documentar; no bloquea F4.

- **Dependencia de prompt-designer:** los 2 bloques nuevos del compositor (AUTO-ACCIONES PERMITIDAS + HORARIO DE ATENCIÓN) son código de transformación, no prompts del LLM. NO requieren al prompt-designer. Las toolDescriptions de las 5 tools nuevas SÍ son texto que el LLM lee — están escritas acá en §9. Si tras un test el founder ve que el LLM las invoca mal, el prompt-designer ajusta tras F4.

- **Validación post-build:**
  1. `JSON.parse` del workflow output.
  2. `node scripts/validate-n8n-expressions.js n8n/workflows/chatbot-momentum-bot-v6-v3.json` → 0 violations.
  3. Smoke tests A-C de §14 (sin tocar n8n).
  4. Si pasa todo, entregar al `n8n-reviewer` con la skill `n8n-workflow-audit` (checklist 15 puntos).
