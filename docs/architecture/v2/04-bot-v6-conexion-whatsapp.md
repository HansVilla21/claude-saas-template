# Momentum AI CRM — Bot v6: Conexión WhatsApp en Vivo + Bot Conversacional

**Fecha:** 2026-05-28
**Estado:** Draft de arquitectura — para review del founder ANTES de tocar código
**Autor:** Arquitecto (diseño, no implementación)
**Alcance:** la pieza más delicada del sistema — bot conversacional multi-tenant + integración de canal WhatsApp real, conectado al inbox v2 ya construido.
**Principio rector:** *diseñar el rascacielos, construir el primer piso.* La arquitectura escala a N agencies / N módulos; el plan de fases construye lo mínimo para probar en vivo lo antes posible reusando el v5.5.

**Fuentes leídas:** migraciones `0001`–`0009` del schema v2; `01-schema-db-v2.md`, `02-core-vs-modulos.md`; skills `ycloud-webhook-to-supabase`, `n8n-langchain-agent-postgres-memory`, `bot-handoff-system-end-to-end`, `whatsapp-image-delivery-ycloud`, `supabase-edge-function-secret-auth`, `n8n-pipeline-rapido-vs-pesado`, `bot-anti-loop-detector`, `bot-llm-marker-expand-pattern`; `memory/n8n-pipeline.md`, `integraciones.md`, `decisions.md` (28-may); código del inbox v2 (`actions.ts`, `inbox-client.tsx`, `chat-panel.tsx`).

---

## 0. Resumen ejecutivo

El bot v6 es la evolución multi-tenant del bot Sofia v5.5 (en producción single-tenant inmobiliario). Reusamos ~85% de la mecánica probada y agregamos **tres capas nuevas**: (1) resolución de agency por número de WhatsApp, (2) construcción del system prompt en runtime desde la DB (Prompt Compositor práctico), (3) tools que ejecutan auto-acciones respetando procedencia `'bot'` + toggles por agency.

**Las 5 decisiones más importantes (detalle en §4):**

1. **El bot se queda en n8n** evolucionado a UN workflow genérico multi-tenant (no Edge Functions, no un workflow por cliente). Reusa la inversión existente (v5.5 + agentes + skills + memoria Postgres).
2. **El webhook intake y la entrega outbound viven en Edge Functions** (no en n8n). El webhook ya existe en v1 y es el patrón correcto (HMAC + raw storage + idempotencia). La entrega outbound es un **Edge Function disparada por trigger** sobre `messages` (cubre mensajes de agente Y de bot con un solo mecanismo).
3. **Las tools del bot son HTTP → Edge Functions con secret auth** (patrón `request-handoff` ya probado), NO escrituras SQL directas desde n8n. Centraliza la lógica de procedencia y toggles en un solo lugar auditado.
4. **Falta una tabla de mapeo canal→agency** (`agency_channels`). El schema v2 actual NO la tiene. Es bloqueante para multi-tenant: sin ella el webhook no sabe a qué agency pertenece un número entrante. Hay que crearla (migración `0010`).
5. **El Prompt Compositor se implementa en versión práctica de 3 capas efectivas** (núcleo global + slots de `bot_config` + fragmentos de módulo), no las 7 completas. Respeta la decisión post-red-team.

**Lo que el inbox v2 dejó cableado y el bot v6 enciende:** columnas de procedencia (`*_set_by/at/by_user`), `agencies.settings.auto_actions` (toggles), `bot_schedule`, `business_hours`, `agencies.bot_config` (capas del prompt). El Realtime ya funciona solo vía Broadcast Changes (migración `0008`) — el bot no hace nada extra para que el inbox se actualice en vivo.

---

## 1. Flujo end-to-end (diagrama en texto)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ INBOUND: lead → WhatsApp → bot                                                │
└─────────────────────────────────────────────────────────────────────────────┘

[Lead manda WhatsApp]
      │
      ▼
[YCloud]  evento: whatsapp.inbound_message.received  (to = número del business)
      │
      ▼
┌──────────────────────────────────────────────────────────────────────┐
│ EDGE FUNCTION: ycloud-webhook  (verify_jwt=false)                      │   ← reusa skill
│  1. req.text() (raw, sin parsear)                                      │     ycloud-webhook-
│  2. verifySignature(raw, ycloud-signature, secret)  HMAC + replay 5min │     to-supabase
│  3. INSERT webhook_events_raw (raw + signature_valid)  ← paranoid      │
│  4. si !valid → return 200 (loguea, no procesa)                        │
│  5. RESOLVER AGENCY por `to` → agency_channels (número → agency_id)    │   ← NUEVO (0010)
│  6. UPSERT lead (agency_id, channel='whatsapp', wa_user_id)            │
│  7. UPSERT conversation (agency_id, lead_id, channel)                  │
│  8. INSERT message (service_role, idempotente por                      │
│       UNIQUE(agency_id, channel, external_id))                         │
│       → dispara trigger denorm + trigger broadcast_agency_change       │
│  9. si kind=audio → encolar transcripción (ver §8.3)                   │
│ 10. return 200 SIEMPRE                                                  │
└──────────────────────────────────────────────────────────────────────┘
      │ (el INSERT del message ya hizo broadcast → el inbox del agente
      │  ve el mensaje entrante EN VIVO, sin que el bot intervenga)
      │
      ▼
   ¿El bot debe responder?  ← decisión tomada por el webhook O por n8n (ver §1.1)
      │
      ├── NO (handler='human' / bot_enabled=false / fuera de bot_schedule)
      │      └── fin del inbound. (si fuera de horario con out_of_office_message → §6)
      │
      └── SÍ → DISPARAR n8n
                 │  (HTTP POST al webhook de producción del workflow n8n,
                 │   con { conversation_id, agency_id, message_id, lead_id, channel })
                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│ N8N WORKFLOW GENÉRICO (bot v6) — UN solo workflow multi-tenant         │
│                                                                        │
│  [1] Cargar contexto de la agency desde Supabase (1 query):           │
│       - agencies.bot_config (tone/sales/business_info/custom/notify)  │
│       - agencies.settings (auto_actions toggles, bot_schedule,        │
│         business_hours)                                                │
│       - bot_prompt_templates (núcleo + system_rules, is_active)       │
│       - agency_modules enabled + module_definitions (prompt_fragment, │
│         tool_config, extractor_schema)                                │
│       - extractor_field_defs de la agency                              │
│                                                                        │
│  [2] COMPONER system prompt en runtime (Prompt Compositor, §5)        │
│                                                                        │
│  [3] Detector de descalificación (gpt-4.1-mini)  ← skill anti-loop    │
│       └─ si should_apagar_bot → request-handoff / silenciar → FIN      │
│                                                                        │
│  [4] Agente Principal (LangChain Agent)                                │
│       - modelo confiable para el core (ver decisión §11)              │
│       - Postgres Chat Memory (session_id = conversation_id)  ← skill   │
│       - tools expuestas SEGÚN toggles + módulos (§4.4)                 │
│            cambiar_etapa · calificar · asignar_agente ·                │
│            agregar_etiqueta · agregar_nota · escalar_handoff ·         │
│            buscar_[modulo] (solo si módulo prendido)                   │
│                                                                        │
│  [5] Formateador / chunker (preserva markers [IMG:...]) ← skill marker│
│                                                                        │
│  [6] Expand markers → items tipados (text / image / location)         │
│                                                                        │
│  [7] INSERT del/los message(s) outbound del bot en Supabase            │
│       (service_role: direction='outbound', sender_kind='bot',          │
│        is_bot_generated=true, status='queued')                         │
│       → dispara broadcast (inbox ve la respuesta del bot en vivo)      │
│       → dispara trigger de ENTREGA (ver siguiente bloque)              │
└──────────────────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ OUTBOUND: message en DB → WhatsApp  (mismo mecanismo para bot Y agente)        │
└─────────────────────────────────────────────────────────────────────────────┘

[INSERT en messages con direction='outbound' AND status='queued']
      │ (lo inserta el bot v6 §7, O el composer del inbox cuando un humano responde)
      ▼
[Trigger AFTER INSERT en messages]  → si direction=outbound y status=queued
      │   pg_net.http_post →  EDGE FUNCTION: deliver-outbound  (verify_jwt=false)
      ▼
┌──────────────────────────────────────────────────────────────────────┐
│ EDGE FUNCTION: deliver-outbound  (secret auth interno)                 │   ← NUEVO
│  1. lee message + conversation + agency_channels (número from + token) │
│  2. ventana 24h? (conversations.last_inbound_at)  ← §6                 │
│       - dentro → manda mensaje libre (text/image/location)            │
│       - fuera   → solo template aprobado (o no manda + marca failed)  │
│  3. POST api.ycloud.com/v2/whatsapp/messages  (skill image-delivery)  │
│       - normaliza URL de imagen a JPG/PNG                              │
│  4. UPDATE message.status = 'sent' | 'failed' (+ wa_message_id)        │
└──────────────────────────────────────────────────────────────────────┘
      │
      ▼
[Lead recibe en WhatsApp]
      │
      ▼
[YCloud] evento: whatsapp.message.updated (sent/delivered/read/failed)
      │
      ▼
[EDGE FUNCTION ycloud-webhook] → UPDATE message.status + timestamps  (skill webhook)
```

### 1.1 ¿El bot responde? — dónde vive esa decisión

La decisión de "¿debe responder el bot?" tiene tres condiciones que se evalúan **en el webhook intake** (Edge Function), no dentro de n8n, para no gastar una invocación de n8n en mensajes que el bot debe ignorar:

```
debe_responder_bot =
      conversations.handler = 'bot'                    -- no en handoff humano
  AND agencies.settings.bot_enabled != false           -- kill switch global de la agency
  AND conversation no está en bot_paused_until futuro  -- pausa temporal
  AND dentro_de_bot_schedule(agencies.settings)        -- 24/7 o fuera-de-horario (§6)
```

Si todas se cumplen → el webhook dispara n8n. Si no, el mensaje ya quedó persistido y visible en el inbox (el agente lo ve), pero el bot no corre. La excepción de horario (fuera de horario con `out_of_office_message`) se maneja como un caso especial: ver §6.

**Trade-off de poner esto en el webhook vs n8n:** ponerlo en el webhook ahorra invocaciones de n8n (costo/ruido) y mantiene n8n enfocado en "razonar y responder". El costo es que la lógica de gating queda en dos lenguajes (TS en el webhook). Mitigación: la condición es declarativa y pequeña; se documenta como contrato único. Alternativa descartada: gating dentro de n8n — gasta una ejecución por cada mensaje aunque el bot esté apagado, y mezcla responsabilidades.

---

## 2. Modelo de datos — lo que falta y lo que ya está

### 2.1 Lo que YA está (no se toca)

- `messages` con `UNIQUE(agency_id, channel, external_id)` → idempotencia de webhooks. **Listo.**
- `conversations` con `handler`, `bot_paused_until`, `handoff_*`, `last_inbound_at`, `last_outbound_at`, `assigned_*_set_by/at/by_user`. **Listo.**
- `leads` con `stage_set_by/at/by_user`, `qualified_set_by/at/by_user`, `wa_user_id`, `is_qualified`, `stage_id`, `assigned_user_id`. **Listo.**
- `tag_assignments.created_by_kind`. **Listo.**
- `agencies.settings` (auto_actions, business_hours, bot_schedule) + `agencies.bot_config` (tone/sales/business_info/custom/notify_on). **Listo.**
- `bot_prompt_templates` (núcleo global + system_rules, una versión activa por layer). **Listo.**
- `extractor_field_defs` / `extractor_field_values`. **Listo.**
- `agency_modules` + `module_definitions` (prompt_fragment, tool_config, extractor_schema). **Listo.**
- `n8n_chat_histories` (memoria LangChain). **Listo.**
- Triggers `denorm_conversation_on_message` (0009) + `broadcast_agency_change` (0008). **Listos — el inbox se actualiza solo.**

### 2.2 Lo que FALTA (bloqueante para multi-tenant) — migración `0010`

**Hallazgo crítico:** el schema v2 NO tiene mapeo de número de WhatsApp → agency. El `01-schema-db-v2.md` menciona `agency_channels` pero la migración nunca la creó. `leads.whatsapp_phone` existe pero es el número del LEAD, no del business. **Sin esto, el webhook multi-tenant no funciona** (no sabe a qué agency atribuir un mensaje entrante).

```sql
-- migración 0010 (PROPUESTA, para review)

-- 2.2.1 Canales conectados por agency (número de WhatsApp del business → agency)
create table public.agency_channels (
    id                    uuid primary key default gen_random_uuid(),
    agency_id             uuid not null references public.agencies(id) on delete cascade,
    channel               message_channel not null,
    -- WhatsApp / YCloud:
    phone_e164            text,            -- '+50689839490' (número del business)
    ycloud_phone_number_id text,           -- id del número en YCloud
    ycloud_waba_id        text,            -- WhatsApp Business Account id
    -- credenciales POR TENANT (no en env): qué API key usar para mandar
    -- como ese número. Encriptar at-rest (pgsodium / vault) — NUNCA plano.
    api_key_ref           text,            -- referencia al secret (no el secret en sí)
    is_active             boolean not null default true,
    connected_at          timestamptz default now(),
    created_at            timestamptz not null default now(),
    unique (channel, phone_e164),          -- un número pertenece a UNA sola agency
    unique (agency_id, channel)            -- una agency, un número por canal (MVP)
);
create index idx_agency_channels_phone on public.agency_channels(channel, phone_e164)
    where is_active = true;

-- 2.2.2 Cola de entrega outbound (status='queued' es el disparador)
-- NO requiere tabla nueva: se reusa messages.status. 'queued' = pendiente de entregar.
-- El trigger de entrega filtra por (direction='outbound' AND status='queued').
```

**Nota sobre `api_key_ref`:** en el MVP con UN solo número de prueba (el WhatsApp del founder, ver §10) se puede usar una API key global de YCloud en env (`YCLOUD_API_KEY`) y dejar `api_key_ref` null. La columna queda lista para cuando cada cliente conecte su propio número con su propia key (modelo Tech Partner, §7). **Diseñar el rascacielos, construir el primer piso.**

### 2.3 Lo que FALTA (no bloqueante, para entrega robusta) — opcional en `0010`

- Trigger `AFTER INSERT on messages` que dispara `deliver-outbound` vía `pg_net` (ver §7). Requiere extensión `pg_net` habilitada.
- Índice parcial `idx_messages_queued on messages(created_at) where status='queued' and direction='outbound'` para el fallback de polling (§7, plan B).

---

## 3. Multi-tenancy del bot — UN workflow genérico

### 3.1 Decisión: un workflow genérico, no uno por cliente

**Recomendación: UN workflow n8n genérico** que resuelve la agency por contexto y carga su configuración desde Supabase en runtime.

| Criterio | Un workflow genérico | Un workflow por cliente |
|---|---|---|
| Mantenimiento | Un fix beneficia a todos (igual que mejorar el núcleo del prompt) | N fixes, drift entre clientes |
| Onboarding cliente nuevo | INSERT en `agency_channels` + config — cero código | Clonar + editar workflow, riesgo de error |
| Costo n8n | Una ejecución por mensaje, sin importar agencies | Igual, pero N workflows que mantener activos |
| Aislamiento de fallos | Un bug afecta a todos | Un bug afecta a un cliente (ventaja) |
| Escala a 10+ clientes | Lineal trivial | Insostenible operativamente |

El único punto a favor del "uno por cliente" (aislamiento de fallos) se mitiga con el pipeline de testing (`n8n-pipeline-rapido-vs-pesado`) y con que el núcleo del prompt es global y probado. La ventaja operativa del genérico es decisiva para un modelo multi-tenant.

### 3.2 Resolución agency-por-número

El número de WhatsApp del business (`to` en el evento inbound) es la llave:

```
evento inbound.to = '+50689839490'
   → SELECT agency_id, channel FROM agency_channels
       WHERE channel='whatsapp' AND phone_e164='+50689839490' AND is_active
   → agency_id resuelto
```

A partir de ese `agency_id`, **todo** lo que el workflow carga (prompt, toggles, módulos, tools, número de salida, API key) es agency-scoped. El `conversation_id` que el webhook pasa a n8n es el `session_id` de la memoria (cada conversación aislada, skill `n8n-langchain-agent-postgres-memory`).

### 3.3 Qué pasa el webhook a n8n

```json
{
  "agency_id": "<uuid>",
  "conversation_id": "<uuid>",   // = session_id de la memoria
  "lead_id": "<uuid>",
  "message_id": "<uuid>",        // el inbound recién insertado
  "channel": "whatsapp",
  "body": "<texto del lead>",    // o transcripción si era audio
  "lead_display_name": "<nombre>"
}
```

n8n NO re-resuelve la agency ni re-inserta el inbound (ya está en DB). Solo carga config + razona + responde.

---

## 4. Decisiones con trade-offs

### 4.1 ¿Dónde corre el bot? n8n vs Edge Functions

**Recomendación: el bot (razonamiento + tools + memoria) se queda en n8n. El intake y la entrega van en Edge Functions.**

| Componente | Dónde | Por qué |
|---|---|---|
| Webhook intake (recibir de YCloud) | **Edge Function** | Ya existe en v1, patrón correcto (HMAC, raw storage, idempotencia, 200 siempre). Latencia baja, sin warm-up. |
| Razonamiento del bot (LLM + tools + memoria) | **n8n** | Inversión existente: v5.5 funciona, Postgres Chat Memory, Information Extractor (detector), agentes n8n-architect/builder/reviewer, 11 skills capturadas. Reescribir en Edge sería tirar meses de know-how probado. |
| Entrega outbound (mandar a YCloud) | **Edge Function** | Debe cubrir mensajes de agente Y de bot con un solo mecanismo (disparado por trigger). Si viviera en n8n, los mensajes del agente humano no se entregarían (n8n solo corre cuando el bot responde). |

**Trade-offs del bot en n8n:**
- (−) Dependencia de n8n self-hosted/cloud: si n8n cae, el bot no responde (pero el inbox sigue vivo y el agente puede tomar manual).
- (−) n8n es un cuello operativo (versionado vía scripts, no es código en git puro).
- (+) Velocidad de iteración del prompt y de los flujos sin redeploy de código.
- (+) Visual debugging de cada ejecución (invaluable para un bot que "hace cosas solo").
- (+) Reuso inmediato del v5.5 → MVP en vivo en días, no semanas.

**Alternativa descartada (bot full en Edge Functions):** mejor para git/CI y menos vendor lock-in, pero descarta toda la inversión n8n y obliga a reconstruir memoria conversacional, orquestación de tools y detector desde cero. El costo de migración no se justifica para el MVP. **Reevaluar post-validación** si n8n se vuelve un cuello (decisión futura, no ahora).

### 4.2 Mecanismo de las tools: HTTP → Edge Functions con secret auth

**Recomendación: las auto-acciones del bot son HTTP requests a Edge Functions internas con secret auth (patrón `request-handoff` ya probado), NO escrituras SQL directas desde n8n.**

| Opción | Pros | Contras |
|---|---|---|
| **A. Tools → Edge Functions (secret auth)** ✅ | Lógica de procedencia + toggles + validación centralizada y auditada; idempotencia; un solo lugar para cambiar reglas; testeable | Una Edge Function por familia de acción (o una con router) |
| B. Tools → Supabase REST directo (service_role desde n8n) | Menos componentes | El bot tendría que conocer las reglas de procedencia/toggles → se duplican en el prompt/nodos; fácil de romper; sin auditoría central |
| C. Tools → SQL directo en nodo Postgres de n8n | Simple | Misma duplicación que B + riesgo de UPDATE mal escrito sin guardas |

La opción A es la única que garantiza que **toda auto-acción respete los toggles y escriba la procedencia `'bot'` correctamente** sin confiar en que el LLM (o el armador de nodos) lo haga bien. Es el mismo patrón que ya funciona para `request-handoff`.

**Diseño concreto:** UNA Edge Function `bot-actions` con un router por `action`, en vez de N funciones. Reduce superficie de deploy y centraliza el secret. (El `request-handoff` existente puede mantenerse separado por compatibilidad o absorberse en `bot-actions`; recomiendo absorberlo para tener un solo punto de auto-acciones del bot.)

### 4.3 Contrato de las TOOLS (auto-acciones) — el diferenciador

Cada tool es una `action` de la Edge Function `bot-actions`. El bot la invoca vía HTTP (n8n tool node) con `Authorization: Bearer <BOT_ACTIONS_SECRET>`. **Toda action escribe con `service_role`** (bypassa RLS, debe incluir `agency_id` siempre) y **registra procedencia `'bot'`**.

Payload base de toda action:
```json
{
  "action": "cambiar_etapa",
  "agency_id": "<uuid>",
  "conversation_id": "<uuid>",
  "lead_id": "<uuid>",
  "params": { ... }              // específico de cada action
}
```

| Tool / action | Escribe en | Procedencia `'bot'` | Respeta toggle |
|---|---|---|---|
| `cambiar_etapa` | `leads.stage_id` | `leads.stage_set_by='bot'`, `stage_set_at=now()`, `stage_set_by_user=null` | `settings.auto_actions.stage` |
| `calificar` | `leads.is_qualified` | `leads.qualified_set_by='bot'`, `qualified_set_at=now()`, `qualified_set_by_user=null` | `settings.auto_actions.qualify` |
| `asignar_agente` | `conversations.assigned_user_id` (+ `leads.assigned_user_id`) | `conversations.assigned_set_by='bot'`, `assigned_set_at=now()` | `settings.auto_actions.assign` |
| `agregar_etiqueta` | `tag_assignments` (entity_type='lead') | `tag_assignments.created_by_kind='bot'`, `created_by=null` | `settings.auto_actions.tag` |
| `agregar_nota` | `leads.notes` (append con autor+fecha) o tabla de notas si existe | nota marcada como autor 'bot' + timestamp | `settings.auto_actions.note` |
| `escalar_handoff` | `conversations.handoff_status='pending'` (+reason+summary) | dispara trigger `handle_handoff_pending` (task + handler='human') | siempre permitido (no es toggle de auto-acción, es seguridad) |
| `extraer_datos` | `extractor_field_values` (upsert por lead_id + field_def_id) | `value` jsonb por campo | siempre (es la captura, no auto-acción visible) |
| `buscar_<modulo>` | solo lectura del catálogo del módulo (ej. propiedades) | — | solo si el módulo está prendido (§5) |

**Mecanismo del toggle (crítico):** hay DOS capas de defensa, no una:

1. **En la composición del prompt / exposición de tools (n8n):** si `settings.auto_actions.stage = false`, la tool `cambiar_etapa` **no se expone al agente** (no aparece en su toolset). El bot literalmente no puede llamarla. Esto es lo limpio: el LLM no "ve" lo que no debe hacer.
2. **En la Edge Function (server-side, defensa en profundidad):** aunque el bot llame la action, `bot-actions` re-verifica el toggle leyendo `agencies.settings` y si está `false` retorna `{ skipped: true, reason: 'toggle_off' }` sin escribir. Esto protege contra prompts mal compuestos o llamadas residuales.

**Por qué doble capa:** el toggle off debe ser inviolable (es una promesa al cliente: "el bot NO cambia estados si yo lo apago"). Confiar solo en el prompt es frágil (el LLM puede alucinar la tool). Confiar solo en el server gasta tokens en llamadas que se descartan. Ambas = barato y robusto.

### 4.4 Resumen de la decisión de tools

- Tools = `bot-actions` Edge Function, secret auth, service_role, procedencia `'bot'` automática.
- Toggles aplicados en n8n (no exponer) + re-verificados en la Edge (no actuar). Doble capa.
- `escalar_handoff` reusa el sistema de handoff existente (skill `bot-handoff-system-end-to-end`).
- `buscar_<modulo>` reusa el patrón `properties-search` del v1 (skill `n8n-properties-search-tool-pattern`), expuesta solo si el módulo está prendido.

---

## 5. Prompt Compositor en la práctica (versión de 3 capas efectivas)

El doc `02-core-vs-modulos.md` define 7 capas conceptuales. La **versión práctica** (decisión post-red-team: "se usa versión de 3") las colapsa en 3 fuentes reales que el workflow concatena en runtime:

```
SYSTEM PROMPT FINAL =

  [A] NÚCLEO GLOBAL          ← bot_prompt_templates WHERE layer='core' AND is_active
      (rol base, reglas de operación, formato, anti-loop, seguridad,
       cómo usar las tools, cuándo escalar handoff)
      Mejorar acá = mejora para TODOS los clientes. No editable por cliente.

  +

  [B] SLOTS DE AGENCY        ← agencies.bot_config (jsonb)
      Se renderizan en un bloque "## Sobre este negocio" + "## Tono" +
      "## Comportamiento de venta" + "## Instrucciones adicionales":
        - business_info      → quién es el negocio, qué ofrece, propuesta de valor
        - tone               → preset (vendedor|consultivo|amigable|formal) + matices
        - sales_close_behavior → cerrar en chat | mandar link de pago | derivar+avisar
        - custom_instructions → escape hatch de texto libre
        - notify_on          → no va al prompt; controla qué eventos notifican (config)

  +

  [C] FRAGMENTOS DE MÓDULO   ← agency_modules enabled JOIN module_definitions
      Por cada módulo prendido, su prompt_fragment (o el override de
      agency_modules.config si existe) + la declaración de su tool buscar_<modulo>.
      Acumulativo: 0 módulos = bot conversacional puro; N módulos = N fragmentos.

  +

  [D] REGLAS FINALES GLOBALES ← bot_prompt_templates WHERE layer='system_rules'
      (marker de media [IMG:...], límites de longitud, anti-loop reforzado).
      Va al final para que "gane" sobre instrucciones de cliente mal escritas.
```

**Por qué A y D son fijos y globales:** son la "estructura protegida". El bug del 2026-05-20 (handoff disparado con regla vaga) vivía en estas capas — mantenerlas globales y versionadas evita que cada cliente lo reintroduzca. **Esto es la diferencia entre "prompt editable entero" (inmantenible) y compositor (mejorable centralmente).**

**Cómo se arma en runtime (n8n):** un Code node concatena A + B (renderizado desde `bot_config`) + C (loop sobre módulos) + D, e inyecta el resultado en el campo `system message` del LangChain Agent. Una sola query carga todo lo necesario (§1, paso [1]).

**Lo que NO se construye ahora (rascacielos, no primer piso):** versionado por-agency del prompt (`bot_prompt_versions` del doc 01), editor visual del compositor en el panel master, fork de fragmentos por agency. La capa B (`bot_config` jsonb) y la edición desde la config de la agency alcanzan para el MVP.

**Extractor en el prompt:** los `extractor_field_defs` de la agency (core + de cada módulo) se inyectan como una instrucción "extraé y guardá estos campos cuando aparezcan" + la tool `extraer_datos`. Reemplaza el `messages.bot_reasoning` jsonb del v1 por datos queryables (skill / decisión ya tomada).

---

## 6. Horario del bot + ventana 24h de WhatsApp

Son **dos cosas distintas** que a menudo se confunden:

### 6.1 `bot_schedule` (decisión del negocio: cuándo responde el bot)

`agencies.settings.bot_schedule = { mode: '24_7' | 'office_hours', out_of_office_message, business_hours_ref }`

- **`24_7`:** el bot responde siempre (gating de §1.1 sin restricción horaria).
- **`office_hours`:** el bot solo responde dentro de `business_hours` (`{tz, days, from, to}`).
  - Mensaje entrante DENTRO de horario → bot responde normal.
  - Mensaje entrante FUERA de horario → el webhook NO dispara n8n. En su lugar:
    - Opción 1 (recomendada MVP): inserta un mensaje outbound con `out_of_office_message` ("Gracias, te respondemos a partir de las 9am") → se entrega vía `deliver-outbound`. Una sola vez por ventana (no spamear: marcar en `conversations.extra` que ya se mandó OOO hoy).
    - Opción 2 (futuro): encolar el mensaje y disparar n8n a la apertura del horario (requiere un scheduler — n8n cron o Supabase pg_cron). No-MVP.

El cómputo de "dentro/fuera de horario" se hace en el webhook (TS), respetando `tz` de la agency. **Nota:** el inbox v2 ya tiene la lógica de business-hours para tiempos de respuesta (`response-time.ts`) — reusar la misma definición de horario para no tener dos verdades.

### 6.2 Ventana de 24h de WhatsApp (regla de Meta: cómo se puede mandar)

Independiente de `bot_schedule`. Meta solo permite mensajes "de forma libre" dentro de las 24h del último mensaje del lead. Fuera de esa ventana, **solo templates pre-aprobados**.

- Se mide con `conversations.last_inbound_at`. `windowOpen = now - last_inbound_at < 24h`.
- **El inbox v2 ya tiene `windowOpen`** en `chat-panel.tsx` (bloquea el composer del agente fuera de ventana). El bot v6 debe respetar la misma regla en `deliver-outbound`:
  - Dentro de ventana → manda texto/imagen/location libre.
  - Fuera de ventana → no manda mensaje libre. Marca `status='failed'` con `error_code='outside_24h_window'` (MVP) o manda un template aprobado (post-MVP, requiere catálogo de templates en YCloud).

**MVP:** el bot solo responde a mensajes entrantes (que por definición abren/refrescan la ventana), así que la ventana casi siempre está abierta cuando el bot quiere responder. El caso "fuera de ventana" aplica sobre todo a followups proactivos (CORE futuro), no al flujo conversacional inmediato.

---

## 7. YCloud multi-tenant + entrega outbound

### 7.1 Modelo Tech Partner (contexto, no bloqueante MVP)

El founder aplica al Technical Development Partner Program de YCloud para ser **representante ante Meta** y que cada cliente no tenga que demostrar portafolio comercial propio. Estado (de `integraciones.md`): aplicación en proceso, cuenta empresarial Momentum AI activa, número personal de Hans conectado (sirve para demos).

**Mapeo por agency:** cada número de cliente vive en `agency_channels` (§2.2): `phone_e164`, `ycloud_phone_number_id`, `ycloud_waba_id`, `api_key_ref`. El onboarding del cliente (Embedded Signup de YCloud, ver `03-onboarding-cliente.md`) llena esta row. **MVP:** una sola row (el número de prueba del founder) con la API key global en env.

### 7.2 Entrega outbound — el mecanismo (resuelve el gap del inbox)

**El problema real (verificado en código):** el composer del inbox v2 (`inbox-client.tsx` línea 283) inserta el message outbound del agente con `status='sent'` pero **NO lo entrega al canal** (comentario literal: "la entrega real al canal queda pendiente del bot v6"). Y el bot v6 también producirá outbounds. Necesitamos UN mecanismo que entregue **ambos**.

**Recomendación: trigger sobre `messages` → Edge Function `deliver-outbound`.**

```
INSERT message (direction='outbound', status='queued')   ← lo hace el bot Y el composer
   → trigger AFTER INSERT (filtra direction=outbound AND status=queued)
   → pg_net.http_post a deliver-outbound (con secret auth interno)
   → deliver-outbound: lee número+token de agency_channels, valida ventana 24h,
     POST a YCloud, UPDATE status='sent'|'failed' + wa_message_id
```

| Opción de entrega | Pros | Contras | Veredicto |
|---|---|---|---|
| **A. Trigger → Edge Function (pg_net)** ✅ | Un solo mecanismo para bot + agente; near-realtime; sin polling | Requiere `pg_net`; manejar reintentos | **Recomendada** |
| B. n8n hace el POST a YCloud para sus propios mensajes | Reusa nodos del v5.5 | NO cubre los mensajes del agente humano (n8n no corre cuando el humano responde) → dos mecanismos distintos | Descartada como único |
| C. El composer del inbox llama directo a YCloud (server action) | Simple para el agente | NO cubre los mensajes del bot; duplica lógica de ventana/credenciales en dos lados | Descartada |
| D. Edge Function con polling de `status='queued'` (cron) | Sin pg_net | Latencia (lead espera el intervalo del cron); más infra | Fallback si pg_net no está disponible |

**Cambio requerido en el composer del inbox:** hoy inserta `status='sent'`. Debe insertar `status='queued'` para que el trigger lo entregue, y `deliver-outbound` lo pasa a `'sent'` tras el POST exitoso. (Cambio chico, frontend, no bloquea el diseño del bot.)

**Reintentos / idempotencia:** `deliver-outbound` es idempotente por `message.id` (no re-entrega un message ya `sent`). Si el POST a YCloud falla, marca `failed` con error; un reintento manual o un cron de barrido de `failed` recientes lo reprocesa (post-MVP).

---

## 8. Pipeline rápido/pesado, anti-loop, audio, imágenes

### 8.1 Pipeline rápido vs pesado (skill `n8n-pipeline-rapido-vs-pesado`)

Construir el bot v6 desde el v5.5 es un cambio **PESADO** (agrega nodos, cambia topología, lógica nueva multi-tenant): aplica el pipeline completo (architect → builder → reviewer) para la primera versión. Los ajustes posteriores de prompt/copy (≤3 nodos) van por pipeline **rápido** (builder directo + validator + founder revisa). El founder es el revisor real (decisión 2026-05-21).

### 8.2 Anti-loop (skill `bot-anti-loop-detector`)

Se reusa tal cual: nodo Information Extractor (gpt-4.1-mini o DeepSeek, modelo barato) tras el Agente Principal, evalúa los últimos 5 turnos, y si `should_apagar_bot` → `escalar_handoff` (reason mapeado: `lead_frustrado→bot_stuck`, `pide_humano→manual`) o silenciar (spam/ofensivo/off_topic, sin handoff). En multi-tenant es idéntico — corre dentro del workflow genérico, agency-scoped por el contexto cargado.

### 8.3 Audio entrante → transcripción

- El webhook detecta `kind='audio'`, persiste el message con `media_url` (igual que v1).
- Para que el bot "lea" el audio: transcribir con Whisper/OpenAI. **Dónde:** en n8n (nodo de transcripción antes del Agente Principal) leyendo `media_url`, o en el webhook (encolar + transcribir async y luego disparar n8n con el texto). **Recomendación MVP:** en n8n — el webhook pasa el `media_url` y n8n transcribe justo antes de razonar (menos componentes, el bot ya corre ahí). El `body` del message se actualiza con la transcripción (o se guarda en `media_metadata.transcript`).
- Costo: Whisper ~$0.006/min. Para el modelo barato, DeepSeek no transcribe audio — la transcripción se queda en Whisper/OpenAI (es "no-core" en el sentido de Pietro, pero no hay alternativa barata equivalente; marcar como costo aceptado).

### 8.4 Imágenes (entrada y salida)

- **Entrada:** el webhook ya mapea `kind='image'` + `media_url` + caption (skill `ycloud-webhook-to-supabase`). El bot puede leer el caption; "ver" la imagen requiere un modelo multimodal (post-MVP, decisión de costo).
- **Salida:** patrón marker (skill `bot-llm-marker-expand-pattern` + `whatsapp-image-delivery-ycloud`). El LLM emite `[IMG:<id>]`; el Code node de expand lo resuelve a item tipado; `deliver-outbound` (o el nodo de envío) postea a YCloud con URL normalizada a JPG/PNG (gotcha del WebP ya documentado). El message se inserta con `kind='image'` + `media_url` para que el inbox lo renderice.

---

## 9. Riesgos y mitigaciones

| # | Riesgo | Severidad | Mitigación |
|---|---|---|---|
| R1 | **Romper el v1 en producción** mientras se prueba el v6 | Alta | El v6 vive en Supabase v2 (`fahujscodhqlopycorzn`) + workflow n8n NUEVO. El v1 (`riznewvshyeqgeajniol` + Sofia v5.5) no se toca. Número de prueba SEPARADO (§10). |
| R2 | **Toggle off violado** — el bot cambia un estado que el cliente apagó | Alta (rompe promesa) | Doble capa (§4.3): no exponer la tool + re-verificar en `bot-actions`. |
| R3 | **Mensaje atribuido a la agency equivocada** (resolución de número falla) | Alta (fuga de datos cross-tenant) | `UNIQUE(channel, phone_e164)` en `agency_channels`. Si no resuelve, el webhook NO procesa (loguea en `webhook_events_raw.processing_error`), no adivina. |
| R4 | **Handoff disparado mal** (bug histórico 2026-05-20) | Media | Triggers operacionalizados en el núcleo del prompt (capa A, global, no editable). Reviewer + walkthroughs en pipeline pesado. |
| R5 | **n8n cae** → el bot no responde | Media | El inbox sigue vivo (Realtime independiente). El agente toma manual. Alerta de salud de n8n (post-MVP). |
| R6 | **Loop infinito** bot↔lead o doble respuesta | Media | Anti-loop detector (§8.2) + idempotencia del inbound (UNIQUE external_id) evita re-procesar el mismo mensaje. |
| R7 | **Imagen rechazada por Meta** (WebP) | Baja | Normalización a JPG/PNG en entrega (gotcha ya capturado). |
| R8 | **Costo IA descontrolado** con cliente de alto volumen | Baja | Core en modelo confiable (~$0.007/msg gpt-4.1-mini validado); detector/clasificador en modelo barato (DeepSeek a evaluar). Tier por volumen es decisión de pricing, no técnica. |
| R9 | **Secret de tools filtrado** | Media | Secret en Supabase Edge Secrets + n8n env (nunca en código/logs). Rotación 90d (skill secret-auth). |
| R10 | **Mensaje fuera de ventana 24h** entregado y rechazado | Baja | `deliver-outbound` valida `windowOpen`; fuera de ventana marca `failed` (MVP) o usa template (post-MVP). |
| R11 | **Pérdida de mensajes si el webhook rompe** | Media | Raw siempre persistido en `webhook_events_raw` ANTES de procesar → re-procesable. |

---

## 10. Modo de prueba en vivo SIN romper el v1

**Principio:** aislamiento total entre v1 (producción) y v6 (pruebas).

| Recurso | v1 (prod, no tocar) | v6 (pruebas) |
|---|---|---|
| Supabase | `riznewvshyeqgeajniol` | `fahujscodhqlopycorzn` (v2) |
| Workflow n8n | Sofia v5.5 (activo) | bot-v6-generico (NUEVO, `active=false` hasta probar) |
| Número WhatsApp | el de prod del v1 | **número de prueba aparte** (a confirmar — §12) |
| Agency | inmobiliaria real | agency demo (`/a/demo`, "Negocio Demo") o agency de Robert en sandbox |
| Edge Functions | las del v1 | nuevas en el proyecto v2 (`ycloud-webhook`, `deliver-outbound`, `bot-actions`) |

**Flujo de prueba en vivo:**
1. Conectar el número de prueba a YCloud apuntando su webhook al `ycloud-webhook` del **proyecto v2**.
2. Crear una row en `agency_channels` (v2) mapeando ese número → agency demo.
3. Mandar un WhatsApp real al número de prueba.
4. Verificar: aparece en `messages` (v2) → el inbox v2 lo muestra en vivo → n8n corre → el bot responde → llega al WhatsApp.
5. Probar cada auto-acción (cambiar etapa, calificar, etc.) con toggles on y off, verificando la procedencia `'bot'` y el iconito en el inbox.

**Flag explícito a confirmar:** ¿qué número de WhatsApp y por cuál cuenta YCloud? El founder mencionó que hay un WhatsApp para probar. Opciones: (a) el número personal de Hans ya conectado a la cuenta Momentum AI (riesgo: si es el mismo que usa el v1, hay colisión — verificar); (b) un número nuevo dedicado a pruebas v2. **Recomendación: número/línea separada del v1** para que un mensaje de prueba nunca caiga en el webhook de producción. → §12.

---

## 11. Plan de implementación por fases

Orden optimizado para **probar en vivo lo antes posible** reusando el v5.5. Cada fase deja algo verificable.

### Fase 0 — Cierre de gaps de datos (1 sesión)
- Migración `0010`: `agency_channels` + (opcional) trigger de entrega + índice de cola.
- Habilitar `pg_net` en Supabase v2.
- Seed: una row en `agency_channels` con el número de prueba → agency demo.
- **Verificable:** SELECT resuelve número → agency_id.

### Fase 1 — Webhook intake v2 + inbound en vivo (1 sesión)
- Desplegar `ycloud-webhook` en proyecto v2 (port del v1: HMAC + raw + resolución agency por `agency_channels` + upsert lead/conv + insert message). `verify_jwt=false`.
- Configurar webhook en YCloud apuntando al v2 (para el número de prueba).
- **Verificable:** mando WhatsApp real → aparece en el inbox v2 EN VIVO (sin bot aún). Esto ya prueba intake + Realtime end-to-end.

### Fase 2 — Entrega outbound (1 sesión)
- Desplegar `deliver-outbound` (Edge, secret auth, lee `agency_channels`, valida ventana 24h, POST YCloud, update status).
- Trigger sobre `messages` (outbound + queued).
- Cambiar el composer del inbox para insertar `status='queued'`.
- **Verificable:** el AGENTE humano responde desde el inbox v2 → el lead lo recibe en WhatsApp. (El inbox ya es bidireccional real, sin bot todavía — entregable vendible por sí solo.)

### Fase 3 — Bot v6 conversacional mínimo (núcleo del MVP) (2-3 sesiones, pipeline PESADO)
- Workflow n8n genérico: webhook trigger → cargar contexto agency → componer prompt (A+B+D, sin módulos aún) → Postgres Chat Memory → Agente Principal → formateador → insert outbound (queued).
- Gating de §1.1 en el webhook (handler/bot_enabled/schedule).
- Detector anti-loop.
- Modelo: el core en modelo confiable (§12).
- **Verificable:** mando WhatsApp → el bot responde conversando (sin auto-acciones ni módulos). Memoria coherente entre mensajes.

### Fase 4 — Auto-acciones (el diferenciador) (2 sesiones)
- Edge Function `bot-actions` (router): `cambiar_etapa`, `calificar`, `asignar_agente`, `agregar_etiqueta`, `agregar_nota`, `extraer_datos`, `escalar_handoff`. Procedencia `'bot'` + re-verificación de toggles.
- Exponer las tools en n8n según toggles + inyectar `extractor_field_defs`.
- **Verificable:** el bot califica/cambia etapa/etiqueta solo → el inbox muestra el iconito 'bot' + tooltip. Toggle off → la acción no ocurre (probar ambas).

### Fase 5 — Módulos + media (1-2 sesiones)
- Fragmentos de módulo en el compositor (capa C) + tool `buscar_<modulo>` (reusa `properties-search`).
- Marker de imágenes salientes + transcripción de audio entrante.
- **Verificable:** con módulo propiedades prendido, el bot busca y manda fotos; audio entrante se transcribe y el bot responde al contenido.

### Fase 6 — Onboarding Robert + hardening (semana 4)
- Conectar el número real de Robert (`agency_channels` con su key/Tech Partner).
- Su `bot_config` + módulo propiedades + catálogo.
- Test E2E + ajuste de prompt.

**Camino crítico para "en vivo ya":** Fases 0→1→2 ya entregan un inbox WhatsApp bidireccional real (vendible). Fase 3 enciende el bot. Fase 4 es el diferenciador. El MVP de Robert necesita 0–5.

---

## 12. Decisiones que necesita confirmar el founder

1. **Número y cuenta de prueba (BLOQUEANTE para Fase 1).** ¿Qué número de WhatsApp se usa para probar el v2 y por cuál cuenta YCloud? Recomendación: número/línea **separada** del v1 para que ningún mensaje de prueba caiga en el webhook de producción. Si es el número personal de Hans ya conectado, confirmar que NO está sirviendo al v1 simultáneamente (colisión de webhook). → ¿número dedicado nuevo, o reusar el de Hans con webhook apuntando solo a v2?

2. **Proveedor de IA del bot core.** Confirmado del contexto: el bot core va en un **modelo confiable** (no DeepSeek). Opciones: (a) seguir con `gpt-4.1-mini` (~$0.007/msg, validado en v1, conocido); (b) Claude (Sonnet) como sugería `integraciones.md`. Pietro propuso DeepSeek solo para lo NO crítico (clasificador/detector/formateador). → ¿core en gpt-4.1-mini (continuidad) o migrar el core a Claude? ¿clasificador + detector + formateador en DeepSeek para bajar costo?

3. **`agency_channels` + entrega outbound vía trigger (confirmar el enfoque).** El diseño crea la tabla faltante y entrega outbound vía trigger→Edge (cubre bot + agente con un mecanismo). Implica habilitar `pg_net` y cambiar el composer a `status='queued'`. → ¿OK con este enfoque, o preferís que la entrega del agente la haga un server action directo (separando bot y agente)?

4. **Alcance del MVP del bot (qué entra a Robert).** Propuesta: Fases 0–5 (conversacional + auto-acciones + módulo propiedades + media). → ¿el MVP del bot para Robert incluye TODAS las auto-acciones, o arrancamos con un subconjunto (ej. solo calificar + escalar_handoff + extraer_datos) y sumamos cambiar_etapa/etiqueta/asignar después?

5. **Tools = Edge Function `bot-actions` (confirmar consolidación).** Recomiendo absorber `request-handoff` dentro de `bot-actions` (un solo punto de auto-acciones). → ¿mantener `request-handoff` separado (compat con v1) o consolidar en v2?

6. **Transcripción de audio en el MVP.** ¿El bot debe entender audios desde el día 1 (Whisper, costo ~$0.006/min), o lo dejamos para post-MVP y por ahora el bot responde "no puedo escuchar audios, escribime por texto"?

---

## Apéndice — Mapa de reuso del v1 → v6

| Componente v1 | Reuso en v6 | Cambio |
|---|---|---|
| Edge `ycloud-webhook` | Sí | + resolución agency por `agency_channels` (era single-tenant) |
| Edge `request-handoff` | Sí | absorber en `bot-actions` (a confirmar) |
| Workflow Sofia v5.5 (clasificador→Sofia→formateador→detector→marker→tools) | Sí, como base topológica | genérico: carga config por agency, prompt compositor en runtime, tools→`bot-actions` |
| Postgres Chat Memory | Sí | idéntico (session_id = conversation_id) |
| Detector anti-loop | Sí | idéntico, agency-scoped por contexto |
| Marker expand de imágenes | Sí | idéntico, URL normalizada |
| `n8n_chat_histories`, `webhook_events_raw`, `messages`, `conversations`, `leads` | Sí | ya migrados a v2 con `agency_id` + procedencia |
| Prompt hardcoded en n8n | NO | reemplazado por compositor desde DB |
| Resolución single-tenant | NO | reemplazado por `agency_channels` |
| Entrega outbound en n8n (solo bot) | Parcial | reemplazado por `deliver-outbound` (bot + agente) |
```
