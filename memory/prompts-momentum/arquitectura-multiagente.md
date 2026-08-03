# ARQUITECTURA MULTI-AGENTE — Momentum AI CRM

**Versión:** 1.1
**Fecha:** 2026-06-05 (pasada 2)
**Workflow target:** `Chatbot Momentum - bot-c v2` (nuevo workflow N8N — el `bot-c v1` queda como rollback)
**Estado:** propuesta de rediseño, **NO deployar a producción sin validación del founder + revisión del `n8n-reviewer`**

---

## RESUMEN EJECUTIVO

El bot actual de Momentum es **monolítico**: un solo nodo LangChain Agent maneja saludo, discovery, objeciones, cierre, y handoff con un solo system prompt. Esto genera respuestas genéricas porque el LLM tiene que balancear 5 modos de comportamiento contradictorios en cada turno.

La arquitectura propuesta divide la responsabilidad en **4 agentes especializados** + 1 router clasificador:

```
                        Webhook YCloud (mensaje del lead)
                                    │
                                    ▼
                    [1] Preparar contexto (Code node)
                        - Cargar bot_config de Supabase
                        - Cargar historial reciente
                        - Setear flag objecion_previa_resuelta
                                    │
                                    ▼
                    [2] ROUTER (LLM rápido, Haiku/4o-mini)
                        Clasifica → discovery / objecion / handoff
                                    │
                ┌───────────────────┼───────────────────┐
                ▼                   ▼                   ▼
        [3a] AGENTE PRINCIPAL  [3b] AGENTE      [3c] HANDOFF
             (Sonnet/4o)        OBJECIONES      (notifica equipo,
             Mateo discovery    (Sonnet/4o)      no responde lead)
             + cierre           Mateo objeciones
                │                   │
                └───────────────────┘
                            │
                            ▼
                [4] FORMATEADOR (LLM rápido, Haiku/4o-mini)
                    Convierte markdown, divide en chunks ≤3 líneas
                            │
                            ▼
                [5] Enviar a YCloud (loop sobre mensajes del JSON)
                            │
                            ▼
                [6] Persistir en n8n_chat_histories
                    (incluyendo metadata de objeciones para flag)
```

---

## DIAGRAMA DETALLADO DE NODOS N8N

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Trigger: Webhook YCloud (POST /webhook/ycloud-incoming)                     │
└────────────────────────┬────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Code: parse-incoming-message                                                │
│ - Extrae: phone, message_text, agency_id, contact_id                        │
│ - Genera message_id (UUID v4 manual, sin crypto — ver gotcha N8N 1.121)     │
└────────────────────────┬────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Supabase: load-agency-config                                                │
│ - SELECT bot_config FROM agencies WHERE id = :agency_id                     │
└────────────────────────┬────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Supabase: load-recent-history                                               │
│ - SELECT * FROM n8n_chat_histories                                          │
│   WHERE session_id = :phone AND created_at > now() - interval '24 hours'    │
│   ORDER BY id DESC LIMIT 20                                                 │
└────────────────────────┬────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Code: compute-flags                                                         │
│ - flag_objecion_previa_resuelta: true si el último mensaje del bot          │
│   tiene metadata.was_objection = true                                       │
│ - flag_is_first_message: true si no hay historial previo                    │
│ - flag_post_link_sent: true si último mensaje del bot tiene metadata.       │
│   was_link_send = true (controla "cierre después del link")                 │
└────────────────────────┬────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ LangChain Agent: Router (Haiku 4 / GPT-4o-mini)                             │
│ System prompt: contenido de router-clasificador.md                          │
│ Output: {"route": "discovery" | "objecion" | "handoff", "reason": "...",    │
│          "confidence": 0.0-1.0}                                             │
└────────────────────────┬────────────────────────────────────────────────────┘
                         │
            ┌────────────┼────────────┐
            ▼            ▼            ▼
          discovery   objecion     handoff
            │            │            │
            ▼            ▼            ▼
┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐
│ LangChain Agent:     │ │ LangChain Agent:     │ │ Code: handoff-trigger │
│ Mateo Principal      │ │ Mateo Objeciones     │ │ - Marca conversation  │
│ (Sonnet 4 / GPT-4o)  │ │ (Sonnet 4 / GPT-4o)  │ │   en Supabase como    │
│                      │ │                      │ │   needs_human         │
│ System prompt:       │ │ System prompt:       │ │ - Dispara notif a     │
│ agente-principal.md  │ │ agente-objeciones.md │ │   equipo (push/email) │
│                      │ │                      │ │ - Envía mensaje fijo  │
│ Inputs:              │ │ Inputs:              │ │   "Te paso con Hans"  │
│ - bot_config         │ │ - bot_config         │ │                       │
│ - historial          │ │ - historial          │ │ Output: mensaje fijo  │
│ - mensaje actual     │ │ - mensaje actual     │ │ (no formateador)      │
│                      │ │ - flag_post_link     │ │                       │
│ Output: texto libre  │ │ Output: texto libre  │ └──────────┬───────────┘
└──────────┬───────────┘ └──────────┬───────────┘            │
           │                        │                        │
           └─────────┬──────────────┘                        │
                     ▼                                       │
┌─────────────────────────────────────────────────────────┐  │
│ LangChain Agent: Formateador (Haiku 4 / GPT-4o-mini)    │  │
│ System prompt: formateador.md                           │  │
│ Output: {"MENSAJE 1": "...", "MENSAJE 2": "...", ...}   │  │
│ JSON parseado por nodo siguiente                        │  │
└──────────────────────┬──────────────────────────────────┘  │
                       │                                     │
                       ▼                                     │
┌─────────────────────────────────────────────────────────┐  │
│ Code: parse-formatter-output                            │  │
│ - JSON.parse output                                     │  │
│ - Si parse falla: fallback = mensaje sin formatear      │  │
│ - Output: array de strings, uno por mensaje a enviar    │  │
└──────────────────────┬──────────────────────────────────┘  │
                       │                                     │
                       ▼                                     │
┌─────────────────────────────────────────────────────────┐  │
│ SplitInBatches (batch size 1)                           │  │
│ Itera sobre cada mensaje del array                      │  │
└──────────────────────┬──────────────────────────────────┘  │
                       │                                     │
                       ▼                                     │
┌─────────────────────────────────────────────────────────┐  │
│ HTTP Request: YCloud send-message                       │◀─┘
│ POST /v2/whatsapp/messages                              │
│ body: { to: phone, body: <mensaje> }                    │
│ delay entre mensajes: 1.5s (para naturalidad)           │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│ Postgres Insert: persistir-mensaje                      │
│ INSERT INTO n8n_chat_histories (session_id, message,    │
│   metadata) VALUES (:phone, :message_text, {            │
│     was_objection: <true si vino de obj agente>,        │
│     was_link_send: <true si contiene URL de calendly o  │
│       payment_link>,                                    │
│     route_used: <discovery|objecion|handoff>,           │
│     confidence: <del router>                            │
│   })                                                    │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
                  END (200 OK al webhook)
```

---

## CONTRATOS ENTRE NODOS

### 1. Router → Switch/IF nodes

```jsonc
// Output del router:
{
  "route": "discovery",
  "reason": "lead respondiendo pregunta de industria",
  "confidence": 0.95
}
```

El nodo siguiente es un **Switch** que rutea según `route`:
- `discovery` → Agente Principal
- `objecion` → Agente Objeciones
- `handoff` → Code de handoff-trigger

### 2. Agente Principal/Objeciones → Formateador

Output libre en string del LLM. El formateador recibe ese string como su input.

### 3. Formateador → SplitInBatches

```jsonc
// Output del formateador:
{
  "MENSAJE 1": "Hola! Soy Mateo, asesor de Momentum AI CRM",
  "MENSAJE 2": "Con quién tengo el gusto?"
}
```

Un Code node parsea y convierte en array:
```javascript
const formatted = JSON.parse($json.output);
const messages = Object.keys(formatted)
  .sort()
  .map(k => formatted[k]);
return messages.map(text => ({ json: { text } }));
```

### 4. SplitInBatches → HTTP YCloud

Cada item del batch tiene `{ text: "mensaje a enviar" }`. El HTTP Request lee `{{ $json.text }}` como body.

### 5. Persistencia → Supabase

```sql
INSERT INTO n8n_chat_histories (session_id, message, metadata)
VALUES ($1, $2, $3::jsonb)
```

Donde `metadata` es:

```jsonc
{
  "was_objection": false,
  "was_link_send": false,
  "route_used": "discovery",
  "confidence": 0.95,
  "model_used": "claude-sonnet-4",
  "tokens_input": 1234,
  "tokens_output": 89
}
```

---

## NODOS NUEVOS A AGREGAR AL WORKFLOW ACTUAL

El workflow actual `bot-c v1` tiene ~87 nodos con **un solo LangChain Agent**. La migración a multi-agente requiere agregar:

| # | Nodo nuevo | Tipo N8N | Rol |
|---|---|---|---|
| 1 | `compute-flags` | Code | Genera `flag_objecion_previa_resuelta`, `flag_post_link_sent` desde historial |
| 2 | `resolve-handoff-target` (v1.1) | Code | Lee `conversations.assigned_handoff_target` o computa round-robin con `assign_round_robin` RPC. Detecta override explícito del lead. Output: `handoff_target_for_this_conversation` (string concreto) |
| 3 | `Router - Mateo` | LangChain Agent | Clasificador, modelo Haiku |
| 4 | `Switch - Route` | Switch | Rutea según `route` del router |
| 5 | `Agente Principal - Mateo` | LangChain Agent | Reemplaza el agente único actual con nuevo prompt (`agente-principal.md`). Emite respuesta de texto + `bant_detected` metadata si `qualification_framework = "bant"` |
| 6 | `Agente Objeciones - Mateo` | LangChain Agent | Nuevo, prompt `agente-objeciones.md` |
| 7 | `handoff-trigger` (v1.1 extendido) | Code | Marca conversación needs_human + lee último `bant_detected` de `n8n_chat_histories` + compone resumen estructurado al humano (con o sin BANT según `qualification_framework`) + notifica equipo |
| 8 | `Formateador` | LangChain Agent | Reemplaza la lógica de formateo actual (si existe) |
| 9 | `parse-formatter-output` | Code | JSON.parse del output del formateador |
| 10 | `SplitInBatches messages` | SplitInBatches | Itera mensajes formateados |
| 11 | `persistir-mensaje-with-metadata` (v1.1 extendido) | Postgres | INSERT con metadata extendida incluyendo `bant_detected` cuando aplica |

**Nodos a remover/modificar:**
- El LangChain Agent monolítico actual → reemplazar por los 4 nuevos agentes
- El nodo de formateo actual (si existe en código) → reemplazar por agente formateador

**Estimación de cambio:** ~11 nodos nuevos (sumando `resolve-handoff-target` en v1.1), 1 nodo a reemplazar (el agente único), 0-2 nodos a refactorizar. Total: ~86-96 nodos finales.

---

## MODELOS Y COSTOS POR MENSAJE

### Por turno del lead:

| Nodo | Modelo | Input tokens | Output tokens | Costo por turno |
|---|---|---|---|---|
| Router | Claude Haiku 4 (o GPT-4o-mini) | ~500 (prompt + último mensaje) | ~50 | ~$0.0006 |
| Agente Principal | Claude Sonnet 4 (o GPT-4o) | ~3000 (prompt + bot_config + historial 20 turnos) | ~150 | ~$0.012 |
| Agente Objeciones | Claude Sonnet 4 | ~2500 (prompt + objeciones catalog + historial) | ~120 | ~$0.010 |
| Formateador | Claude Haiku 4 | ~800 (prompt + mensaje del agente) | ~150 | ~$0.0008 |

**Path típico (discovery + formateo):** ~$0.013 / turno
**Path objeción (router + objeciones + formateo):** ~$0.012 / turno
**Path handoff (solo router + mensaje fijo):** ~$0.0006 / turno

**Por conversación promedio (12 turnos):**
- Costo total: ~$0.15 / conversación
- Para 500 conversaciones/mes: ~$75/mes en LLMs

**Comparación con el monolítico actual:**
- Bot actual con Sonnet en cada turno: ~$0.012 / turno = ~$0.14 / conversación. Casi igual.
- La arquitectura nueva NO sube significativamente el costo porque el router y el formateador usan Haiku (10x más barato).

---

## FLAG `objecion_previa_resuelta` — CONTRATO

Este flag es crítico para que el router detecte objeciones repetidas y derive a handoff. Su contrato:

**Setear a `true`** cuando:
- En el último mensaje del bot persistido en `n8n_chat_histories`, `metadata.was_objection = true`

**Setear a `false`** cuando:
- El bot del último turno fue del agente principal (no objeciones)
- Han pasado >=2 turnos del lead desde la última objeción respondida
- El lead cambió de tema (heurística simple: el último mensaje del lead no contiene keywords de la objeción anterior)

**Implementación en `compute-flags`:**

```javascript
// Pseudocódigo
const history = $('load-recent-history').all();
const lastBotMessage = history.find(m => m.role === 'assistant');

const flag_objecion_previa_resuelta =
  lastBotMessage?.metadata?.was_objection === true;

return [{ json: { flag_objecion_previa_resuelta, /* otros flags */ } }];
```

**Cuando el agente de objeciones genera una respuesta, el INSERT en `n8n_chat_histories` debe llevar `metadata.was_objection = true`.** Esto se hace en el nodo `persistir-mensaje-with-metadata`, leyendo del Switch qué rama tomó.

---

## FLAG `post_link_sent` — CONTRATO

Este flag controla la REGLA DE CIERRE DESPUÉS DEL LINK (el bot no debe seguir preguntando después de mandar Calendly o link de pago).

**Setear a `true`** cuando:
- El último mensaje del bot contiene una URL de `calendly_link` o `payment_link`

**Implementación en `compute-flags`:**

```javascript
const lastBotMessage = history.find(m => m.role === 'assistant');
const containsCalendly = lastBotMessage?.message?.includes($json.bot_config.calendly_link);
const containsPayment = lastBotMessage?.message?.includes($json.bot_config.payment_link);

const flag_post_link_sent = containsCalendly || containsPayment;
```

**Uso:** se pasa al agente principal en el contexto. Si `flag_post_link_sent = true`, el agente debe respetar la regla de "no reiniciar discovery, no proponer nuevas preguntas". El prompt ya tiene esta regla, el flag la refuerza.

---

## HANDOFF — MENSAJE FIJO (sin LLM) Y RESUMEN BANT

Cuando el router decide `handoff`, NO se invoca el agente principal ni el de objeciones. Se envía un mensaje fijo AL LEAD y un resumen estructurado AL HUMANO.

### Mensaje al lead (string fijo)

```javascript
const targetName = $json.handoff_target_for_this_conversation || "el equipo";

const handoffMessage = `Dale, te paso con ${targetName} directo
Apenas pueda te escribe, mientras tanto si querés agendar directo el link es ${$json.bot_config.calendly_link}`;

return [{ json: { text: handoffMessage } }];
```

Razones para mensaje fijo al lead:

- Es determinístico, no hay riesgo de que el LLM mande otra cosa
- Es rápido, no espera otro LLM call
- Es consistente con la promesa al lead

### Resumen al humano (estructurado, con BANT si está activo)

El `handoff-trigger` también compone un mensaje estructurado dirigido al humano (vía push notification / slack / WhatsApp interno). Este mensaje LE LLEGA AL HUMANO, no al lead.

**Si `qualification_framework = "bant"`** (lee `bot_config.qualification_framework`):

```javascript
const bantDetected = lastAssistantMessage?.metadata?.bant_detected || {};

const summary = `Lead: ${contactName} (${contactCity || "ciudad no dada"})
Industria: ${detectedIndustry || "no detectada"}
Stack actual: ${detectedStack || "no detectado"}
Budget: ${formatBantField(bantDetected.budget)}
Authority: ${formatBantField(bantDetected.authority)}
Need: ${formatBantField(bantDetected.need)}
Timeline: ${formatBantField(bantDetected.timeline)}
Pain principal: ${detectedPain || "no detectado"}
Hora propuesta: ${proposedTime || "no propuesta"}
→ ${classifyTemperature(bantDetected)}, ${getRecommendation(bantDetected)}`;
```

Donde `formatBantField({status, value})` devuelve `✅ <value>` / `⚠️ <value>` / `❌ <value>`. Si el campo no fue extraído, `❌ no preguntado`.

**Si `qualification_framework = "none"`:** el resumen omite las 4 líneas BANT y solo lleva industria, stack, pain, hora, temperatura derivada de heurística simple (3 señales = caliente).

### Acciones del handoff-trigger (siempre, independiente de BANT)

- UPDATE en Supabase: `conversations.needs_human = true`, `conversations.handoff_reason = $json.route.reason`, `conversations.assigned_handoff_target = handoff_target_for_this_conversation`
- Push notification al equipo (slack/discord/whatsapp interno) con el resumen estructurado
- Si el lead nombró explícito a otro target del array `handoff_targets`, reasignar `conversations.assigned_handoff_target` ANTES de enviar la notificación (para que llegue al destinatario correcto)

### BANT es transversal — NO agrega nodos N8N nuevos

El campo `bant_detected` se acumula en `metadata` del último mensaje del agente principal en `n8n_chat_histories`. Como el INSERT en esa tabla YA persiste metadata extendida en la arquitectura propuesta (ver sección MEMORIA abajo), agregar `bant_detected` es solo extender el schema del metadata jsonb, NO un nodo nuevo.

**Flujo de la metadata BANT:**

1. Agente principal extrae datos BANT durante la conversación (sin nombrarlos al lead)
2. En cada turno, el agente principal emite su respuesta de texto Y un campo `bant_detected` en metadata (output multi-key del nodo Agent o tool call interno)
3. El INSERT en `n8n_chat_histories` persiste `metadata.bant_detected` junto con `was_objection`, `was_link_send`, etc.
4. Cuando llega un handoff, el `handoff-trigger` lee el ÚLTIMO `bant_detected` persistido y lo formatea en el resumen al humano

**Schema de `bant_detected`:**

```jsonc
{
  "bant_detected": {
    "budget": { "status": "✅", "value": "ManyChat $25 + presupone $150-200 más" },
    "authority": { "status": "⚠️", "value": "es co-decisor con socio Ana" },
    "need": { "status": "✅", "value": "ManyChat se cae 2-3 veces al mes, pierde leads" },
    "timeline": { "status": "✅", "value": "quiere arrancar este mes" }
  }
}
```

Si un campo no se extrajo en el turno actual, el agente principal lo deja con valor del turno anterior (acumulación) o `{ "status": "❌", "value": "no preguntado" }` si nunca se preguntó.

---

## VARIABLES N8N USADAS EN LOS PROMPTS

Los prompts referencian estas expresiones N8N. El workflow debe asegurar que estén disponibles en el contexto del agente:

| Variable en prompt | Origen N8N | Cómo se inyecta |
|---|---|---|
| `{{ $json.bot_config.assistant_name }}` | `load-agency-config` | El bot_config se merge en cada agente |
| `{{ $json.bot_config.sales_methodology }}` | idem | idem |
| `{{ $json.bot_config.qualification_framework }}` (v1.1) | idem | idem (solo agente principal) |
| `{{ $json.bot_config.pricing.* }}` | idem | idem |
| `{{ $json.bot_config.calendly_link }}` | idem | idem |
| `{{ $json.bot_config.payment_link }}` | idem | idem |
| `{{ $json.bot_config.horario_equipo }}` | idem | idem |
| `{{ $json.bot_config.target_industries }}` | idem | idem |
| `{{ $json.bot_config.differentiators }}` | idem | idem |
| `{{ $json.bot_config.pains_to_value_map }}` | idem | idem |
| `{{ $json.bot_config.objections_catalog }}` | idem | idem (solo agente objeciones) |
| `{{ $json.bot_config.handoff_targets }}` (v1.1) | idem | NO va al prompt directo (ver siguiente fila) |
| `{{ $json.handoff_target_for_this_conversation }}` (v1.1) | `resolve-handoff-target` Code node | El nombre ya resuelto (string concreto) va al agente principal y al de objeciones |
| `{{ $now.format('yyyy-MM-dd') }}` | builtin N8N | en agente principal |
| `{{ $json.flag_objecion_previa_resuelta }}` | `compute-flags` | en router |
| `{{ $json.flag_post_link_sent }}` | `compute-flags` | en agente principal |

**Importante:** el nodo LangChain Agent en N8N debe estar configurado con `Prompt with Variables` y todas las expresiones N8N usadas deben estar en el campo de prompt o pasarse como `additional_variables` al agente. Si una expresión no está disponible, el agente verá el placeholder literal (`{{ $json.X }}`) y va a sonar muy raro.

---

## ROUND-ROBIN DE `handoff_target` — CONTRATO Y FLUJO (v1.1)

El campo `bot_config.handoff_targets` es un `array<string>` (ej: `["Hans", "Pietro"]`). El sistema debe seleccionar UN nombre por conversación y persistirlo, para que el lead vea el MISMO nombre durante toda la conversación.

### Reglas operacionales

1. **El nombre se elige al PRIMER mensaje del lead en una conversación nueva**, NO en cada turno.
2. **Se persiste en `conversations.assigned_handoff_target`** (text column). Una vez seteado, es read-only excepto:
   - Override explícito del lead (lead pide a otro nombre que está en `handoff_targets` → reasignar)
   - Override manual de `super_admin` (admin de Momentum reasigna por UI)
3. **En cada turno posterior, el workflow lee `conversations.assigned_handoff_target`** y lo inyecta en el contexto del agente principal y de objeciones como `handoff_target_for_this_conversation`.
4. **Round-robin balanceado por agency:** se reusa el RPC `assign_round_robin` que ya está en producción (P1.1 roles). Le pasás el array `handoff_targets` y el `agency_id`. El RPC mantiene un contador interno por agency y devuelve el próximo nombre.
5. **Si el array tiene 1 solo nombre**, el RPC devuelve ese siempre (round-robin trivial).
6. **Si el array está vacío**, el RPC devuelve `null` y el workflow defaultea a `"el equipo"` (sustantivo colectivo aceptable).

### Nodo nuevo `resolve-handoff-target`

Este Code node se ubica entre `compute-flags` y el Switch al Router. Lógica:

```javascript
// Pseudocódigo
const conversationId = $json.conversation_id;
const agencyId = $json.agency_id;
const handoffTargets = $json.bot_config.handoff_targets || [];

// Step 1: leer asignación existente
const existing = await supabaseQuery(
  "SELECT assigned_handoff_target FROM conversations WHERE id = $1",
  [conversationId]
);

let target;
if (existing?.assigned_handoff_target) {
  target = existing.assigned_handoff_target;
} else {
  // Step 2: primer mensaje de esta conversación, llamar round-robin
  if (handoffTargets.length === 0) {
    target = "el equipo";
  } else if (handoffTargets.length === 1) {
    target = handoffTargets[0];
  } else {
    target = await supabaseRpc("assign_round_robin", {
      pool: handoffTargets,
      agency_id: agencyId
    });
  }
  // Step 3: persistir para los próximos turnos
  await supabaseUpdate(
    "UPDATE conversations SET assigned_handoff_target = $1 WHERE id = $2",
    [target, conversationId]
  );
}

// Step 4: detectar override explícito del lead (nombre mencionado del array)
const leadMessage = $json.message_text.toLowerCase();
const explicitOverride = handoffTargets.find(name =>
  leadMessage.includes(name.toLowerCase())
);
if (explicitOverride && explicitOverride !== target) {
  target = explicitOverride;
  await supabaseUpdate(
    "UPDATE conversations SET assigned_handoff_target = $1 WHERE id = $2",
    [target, conversationId]
  );
}

return [{ json: { ...item.json, handoff_target_for_this_conversation: target } }];
```

### Migración de schema `conversations`

Agregar columna:

```sql
ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS assigned_handoff_target text;
```

Sin default — el primer turno setea, los siguientes leen. Idempotente.

### Por qué se persiste en `conversations` y NO en `n8n_chat_histories`

- `conversations` es el nivel correcto de granularidad (1 conversación = 1 target asignado)
- `n8n_chat_histories` es a nivel mensaje individual; pondría redundancia en cada turno
- El round-robin necesita garantía de "una asignación por conversación", no por mensaje

---

## MEMORIA — `n8n_chat_histories`

El workflow actual usa Postgres Memory para LangChain con la tabla `n8n_chat_histories`. La arquitectura nueva mantiene esta tabla pero **extiende el `metadata` jsonb** con campos nuevos:

```jsonc
{
  "was_objection": boolean,        // si el mensaje vino del agente de objeciones
  "was_link_send": boolean,         // si el mensaje contiene URL de cierre
  "route_used": "discovery" | "objecion" | "handoff",
  "confidence": number,
  "model_used": string,
  "tokens_input": number,
  "tokens_output": number,
  "agency_id": string,
  "phone": string,

  // v1.1 — BANT (solo si qualification_framework = "bant" y mensaje vino del agente principal)
  "bant_detected": {
    "budget": { "status": "✅" | "⚠️" | "❌", "value": string },
    "authority": { "status": "✅" | "⚠️" | "❌", "value": string },
    "need": { "status": "✅" | "⚠️" | "❌", "value": string },
    "timeline": { "status": "✅" | "⚠️" | "❌", "value": string }
  }
}
```

**Migración del esquema actual:** la columna `metadata` ya es jsonb (ver skill `n8n-langchain-agent-postgres-memory`), no hace falta migration. Solo el workflow nuevo empieza a guardar metadata extendida.

**Lectura de historial:** los agentes principales y de objeciones leen los últimos 20 turnos vía LangChain Memory (PostgresChatMessageHistory). El router lee solo el último mensaje del bot (vía custom query en `compute-flags`).

---

## DEGRADACIÓN ELEGANTE — QUÉ PASA SI ALGO FALLA

### Si el Router falla / devuelve JSON inválido:
- **Fallback:** ruta a `discovery`. Es el path más seguro.
- **Implementación:** Code node después del router con try/catch:

```javascript
try {
  const routerOutput = JSON.parse($json.output);
  const route = ["discovery", "objecion", "handoff"].includes(routerOutput.route)
    ? routerOutput.route
    : "discovery";
  return [{ json: { route, reason: routerOutput.reason || "fallback", confidence: routerOutput.confidence || 0.5 } }];
} catch (e) {
  return [{ json: { route: "discovery", reason: "router_parse_error", confidence: 0.3 } }];
}
```

### Si el Agente Principal/Objeciones falla:
- **Fallback:** mensaje genérico fijo + handoff a humano.

```javascript
const fallbackMessage = "Disculpame, tuve un problema técnico\nTe paso con el equipo directo, te escriben enseguida";
```

Y se dispara handoff (igual que el path normal de handoff).

### Si el Formateador falla / devuelve JSON inválido:
- **Fallback:** enviar el output del agente principal **sin formatear** (un solo mensaje).
- **Implementación:** Code node con try/catch:

```javascript
try {
  const formatted = JSON.parse($json.output);
  const messages = Object.keys(formatted).sort().map(k => formatted[k]);
  if (messages.length === 0) throw new Error("empty");
  return messages.map(text => ({ json: { text } }));
} catch (e) {
  // Fallback: enviar el output del agente sin formatear
  return [{ json: { text: $('Agente Principal').first().json.output } }];
}
```

### Si YCloud falla al enviar:
- **Retry con backoff:** 3 intentos con 2s, 5s, 10s
- **Si todos fallan:** marcar mensaje como `failed` en `n8n_chat_histories`, notificar al equipo (push). No reintenta el agente porque el lead ya estará confundido si llegan mensajes tardíos.

### Si Supabase `load-agency-config` falla:
- **Fallback:** usar `bot_config` default hardcodeado en el workflow (Code node con constante).
- **Implementación:** Code node `safe-load-config` que retorna config default si la query falla.

### Si el cliente edita `bot_config` mid-conversación con valor inválido:
- **Fallback:** validación backend rechaza la edición ANTES de guardar. Pero si pasara (ej: edit directo en BD), el workflow debería tener try/catch alrededor del merge de bot_config y caer a defaults.

---

## TESTING — ESCENARIOS DE INTEGRACIÓN A VALIDAR

Antes de deployar a producción, validar manualmente estos escenarios end-to-end:

1. **Lead nuevo saluda → bienvenida + pregunta nombre**
2. **Lead da nombre → pregunta contexto**
3. **Lead industria fit + volumen alto + stack roto + pain claro + presupuesto OK → CALIFICADO → propone Calendly**
4. **Lead acepta → manda link Calendly → no sigue preguntando**
5. **Lead industria fuera de target + volumen muy bajo → NO_FIT → descalifica honesto**
6. **Lead industria fit + volumen bajo → EXPLORANDO → valor + puerta abierta (sin Calendly)**
7. **Lead objeta precio → router → objeciones → respuesta + confirmar → vuelve a discovery**
8. **Lead objeta precio + el bot responde + lead vuelve a objetar precio → router con flag → HANDOFF**
9. **Lead pide humano explícito → HANDOFF inmediato**
10. **Lead pregunta técnica fuera de scope → HANDOFF**
11. **Lead manda 4 preguntas a la vez → responde las 4 con sustancia + 1 follow-up**
12. **Lead manda solo "ok" → bot decide siguiente paso natural según fase**
13. **Modo transaccional (cambiando bot_config a Pérez Luna) → saltea discovery → cierra con link_pago**
14. **Lead frustrado pero no pide humano explícito ("esto es lento") → HANDOFF preventivo**
15. **YCloud falla al enviar → retry → si falla 3 veces → marca failed + notifica**
16. **(v1.1) Round-robin de handoff_targets:** primer mensaje del lead → `resolve-handoff-target` ejecuta RPC → `conversations.assigned_handoff_target` se setea con uno del array → próximos turnos leen el mismo valor → handoff llega al humano correcto
17. **(v1.1) Override de handoff_target por lead:** lead dice "pasame con Pietro" después de 5 turnos con Hans asignado → reasigna a Pietro → handoff llega a Pietro
18. **(v1.1) BANT activo: lead caliente con BANT completo positivo** → bot extrae Budget+Authority+Need+Timeline durante discovery → handoff (forzado por testing) lleva resumen estructurado con 4 ✅ al humano
19. **(v1.1) BANT activo: lead con Authority faltante** → bot extrae Authority como ⚠️ (es empleado co-decisor) → cierre FASE 6A con framing "podemos coordinar la llamada con vos y [decisor] juntos" → handoff lleva ⚠️ en Authority
20. **(v1.1) BANT activo: lead con Timeline lejano** → bot extrae Timeline como >3 meses → cierre FASE 6B (no Calendly) → no se dispara handoff, solo se actualiza metadata
21. **(v1.1) BANT desactivado (`qualification_framework = "none"`):** bot NO pregunta Authority ni Timeline → handoff lleva resumen estándar sin las 4 líneas BANT
22. **(v1.1) `handoff_targets` array vacío:** `resolve-handoff-target` defaultea a `"el equipo"` → bot dice "te paso con el equipo" sin nombre propio → handoff dispara notificación a canal genérico
23. **(v1.1) `workflow_version = "v1"`:** webhook YCloud rutea al workflow viejo (monolítico) → conversación procesa con el bot anterior, sin tocar v2

Para el `n8n-reviewer`: agregar estos 23 escenarios al walkthrough mental obligatorio.

---

## RIESGOS DE LA ARQUITECTURA

### Riesgo 1 — Latencia acumulada
Cada llamada LLM agrega ~1-3 segundos. La cadena Router → Agente → Formateador puede sumar 5-8 segundos antes de que el lead vea respuesta. Para WhatsApp esto es notable.

**Mitigación:**
- Router y Formateador usan Haiku (~1s c/u)
- Agente Principal usa modelo bueno (~2-3s)
- Total estimado: 4-6s por turno
- Aceptable porque el lead percibe "typing…" si lo simulamos enviando un indicador inicial

**Si latencia es problema:** colapsar Router + Agente Principal en un solo prompt que clasifica Y responde. Sacrifica claridad y debugging pero reduce 1 LLM call.

### Riesgo 2 — Router clasifica mal y conversación va mal
Si el router manda objeción a discovery o discovery a objeción, la conversación se siente rara.

**Mitigación:**
- Router tiene confidence + fallback seguro a discovery
- El agente principal puede manejar preguntas neutras y suaves
- El agente de objeciones tiene fallback "objeción no catalogada"
- Logs de `route_used` + `confidence` en metadata para auditoría posterior

**Monitoreo:** generar dashboard semanal con casos donde `confidence < 0.7`. Revisar manualmente y ajustar el prompt del router con esos casos como few-shot adicional.

### Riesgo 3 — Costo en escala
500 conversaciones/mes = $75/mes. 5000 conversaciones/mes = $750/mes.

**Mitigación:**
- A escala, evaluar cambiar Sonnet → Haiku para casos simples (caso "ok", "dale", "gracias")
- Cachear `bot_config` en memoria del workflow para no leer Supabase cada turno
- Logs de tokens para detectar runaway

### Riesgo 4 — Sincronización entre los 4 prompts
Si se actualiza el agente principal pero no el formateador, pueden generarse inconsistencias.

**Mitigación:**
- Versionar los 4 archivos juntos en `memory/prompts-momentum/` con versión semántica
- Cualquier cambio mayor (vN+1) requiere review de los 4 archivos a la vez por el `langchain-prompt-designer`
- El `n8n-builder` importa los 4 archivos del mismo commit, no de paths diferentes

### Riesgo 5 — Memoria/contexto del LangChain Postgres Memory
LangChain por defecto resume el historial cuando supera N tokens. Si el resumen pierde info clave (industria del lead, pain, etc.), el bot puede empezar a preguntar de nuevo.

**Mitigación:**
- Configurar PostgresChatMessageHistory con `k=20` mensajes literales (sin resumir)
- Si la conversación supera 20 turnos, el sistema persiste todo pero el LLM solo ve los últimos 20
- A más largo plazo: implementar resumen estructurado custom que preserve la info clave en un campo `conversation_state` jsonb

### Riesgo 6 — `bot_config` se cargó mal y el bot recita placeholders
Si por error el contexto del Agent no recibe `bot_config`, los `{{ $json.bot_config.X }}` van a aparecer literal en los mensajes al lead. Eso destruye la experiencia.

**Mitigación:**
- Validación pre-envío: Code node antes del HTTP YCloud verifica que el texto NO contiene `{{ $json` ni `{{ $node`. Si lo contiene, abortar y enviar fallback fijo + notificar al equipo.
- Tests automatizados con `n8n-expression-validator` (skill ya capturada) en cada deploy.

### Riesgo 7 — Cambios en producción sin versioning
Si el founder edita el prompt directo en N8N y no en el archivo `memory/prompts-momentum/`, el repo queda desactualizado.

**Mitigación:**
- Política: TODOS los cambios al prompt van primero al archivo `memory/prompts-momentum/agente-X.md`, el `n8n-builder` los sincroniza al workflow.
- Skill `n8n-workflow-versioning` para snapshot semanal del workflow.

---

## ASUNCIONES DOCUMENTADAS

Esta arquitectura tiene un mix de asunciones técnicas (que pueden ajustarse en revisión del `n8n-architect`/`n8n-reviewer`) y **decisiones confirmadas del founder** (validadas en sesión 2026-06-05, pasada 2). Las decisiones confirmadas están marcadas con ✅.

1. **El workflow actual usa Postgres Memory de LangChain.** Asumido del input "memoria postgres en tabla `n8n_chat_histories`".
2. ✅ **El workflow usa Anthropic (Claude) como LLM provider.** Confirmado por el founder. Modelos: **Sonnet 4 para los agentes principal y objeciones**; **Haiku 4 para router y formateador**. Razón: el workflow actual ya usa Anthropic, no cambiar provider en esta pasada. Si en el futuro hay que probar OpenAI, será iteración aparte.
3. **YCloud es el provider de WhatsApp Business API.** Confirmado del input.
4. **El `bot_config` se lee desde la tabla `agencies` de Supabase.** Confirmado del input ("la columna `agencies.bot_config` (jsonb)").
5. **El backend de la plataforma Momentum (Next.js?) maneja la UI del bot_config y guarda en Supabase.** Asumido. El prompt no se preocupa por esto, solo consume el bot_config.
6. **El bot atiende un solo idioma por agencia.** Si en el futuro hay multi-idioma por agencia, ese campo se agrega a bot_config.
7. **No hay rate limiting agresivo en YCloud.** Asumido que se pueden enviar 2-4 mensajes con delay de 1.5s sin trigger rate-limits.
8. **El flag `was_link_send` se computa parsing el texto del mensaje buscando las URLs.** Si el mensaje contiene la URL del bot_config, es link. Asume que el agente no inventa URLs.
9. ✅ **`handoff_targets` es un array configurable por agency con round-robin balanceado.** Default Momentum `["Hans", "Pietro"]`. Reusa el RPC `assign_round_robin` que ya está en producción (P1.1 roles). Persistencia en `conversations.assigned_handoff_target`. Override por nombre explícito del lead. Documentado en sección "ROUND-ROBIN DE `handoff_target`" arriba y en `variables-configurables.md` campo #16.
10. **El workflow no necesita test automatizado de regresión por ahora.** Si el founder lo pide, agregar una skill o suite separada.
11. ✅ **Feature flag por agency: `bot_config.workflow_version: "v1" | "v2"`.** Default actual `"v1"` (monolítico actual). El webhook YCloud lee este campo y rutea al workflow N8N correspondiente. **Deploy progresivo:**
    - Fase 1: Momentum como cliente cero en `"v2"`. Validación 48h con conversaciones reales (lead Meta Ads + manual testing).
    - Fase 2: si Fase 1 es estable, migración progresiva de Pérez Luna y agencies siguientes (1 a la vez, validar antes de la siguiente).
    - Fase 3: cuando ≥30 días sin incidentes en producción, retirar `"v1"` del runtime y mantenerlo solo como rollback en git (skill `n8n-workflow-versioning`).
12. 🟡 **Sandbox / test mode en UI:** post-deploy del workflow. Permitiría al cliente enviarse un mensaje de prueba al bot con su `bot_config` editado sin afectar producción. NO bloquea el lanzamiento a Meta Ads — backlog futuro. Mitigación interim: el founder valida cambios al `bot_config` en su propia agency primero antes de exponer la edición masiva a clientes.
13. ✅ **Nombre del bot:** `"Mateo"` default Momentum. Configurable per-agency vía `bot_config.assistant_name`. El founder puede cambiarlo en 1 click en el panel admin. Validación backend: letras + espacios + acento, max 30 chars, no allcaps, no números (ver `variables-configurables.md` campo #1).
14. ✅ **BANT como módulo transversal de calificación.** Campo `bot_config.qualification_framework: "bant" | "none"`. Default Momentum `"bant"`, default Pérez Luna `"none"`. No agrega nodos N8N (solo extiende metadata del agente principal). Schema `bant_detected` documentado arriba.

---

## PRE-MORTEM ARQUITECTÓNICO

### Escenario A — Deploy nuevo workflow rompe conversaciones en curso
Conversaciones activas con el bot viejo no respetan el nuevo flujo. El historial puede tener metadata vieja.

**Mitigación:**
- Deploy en horario bajo (madrugada CR)
- Feature flag por agency: `bot_config.workflow_version = "v1" | "v2"`. El webhook lee y rutea al workflow correspondiente.
- Migración progresiva: 1 agency a la vez, validar antes de la siguiente.

### Escenario B — El router se vuelve lento por cold start del LLM
Si el LLM provider tiene cold start, el router puede tomar 5+ segundos en el primer mensaje del día.

**Mitigación:**
- Cron job que hace ping al LLM cada 10 min para mantener warm
- Aceptar el cold start del primer mensaje y ser conscientes

### Escenario C — Cliente edita bot_config y nadie lo nota hasta que el bot empieza a recitar cosas raras
Sin validación visual del bot_config, el cliente puede romper el bot accidentalmente.

**Mitigación:**
- UI del panel de bot_config tiene "Test mode": envía un mensaje de prueba con la nueva config sin afectar prod
- Validación backend estricta (ver `variables-configurables.md` sección reglas de validación)
- Logs de cambios al bot_config con quién + cuándo + diff

### Escenario D — El formateador empieza a perder contenido en producción
Bug del modelo Haiku con JSON estricto bajo ciertos inputs.

**Mitigación:**
- Validación post-formateador: comparar longitud del input concatenado vs output concatenado. Si difiere >20%, fallback a enviar sin formatear.
- Logs de cada caso donde el fallback se activa
- Revisión semanal de los casos en logs

### Escenario E — Crece la base de agencies y el costo de LLM se dispara
500 conversaciones/mes/agency × 50 agencies = 25k conversaciones = $3.75k/mes en LLMs.

**Mitigación:**

- Pricing del SaaS debe cubrir el LLM cost con margen
- Throttling por agency según plan ($150/mes plan básico = X conversaciones máx, sobre eso surcharge)
- Caché agresivo: si el lead manda el mismo mensaje 2 veces seguidas, no llamar al LLM 2 veces

### Escenario F — Round-robin se desbalancea por bug del RPC (v1.1)

El RPC `assign_round_robin` tiene un bug y todos los leads van a Hans, Pietro queda sin asignaciones. Hans se satura, Pietro mira sus pulgares.

**Mitigación:**

- Dashboard semanal de distribución por target (cuenta de conversaciones por `assigned_handoff_target` por agency en últimos 7 días)
- Si la distribución está sesgada >70/30, alerta automática al super_admin
- Sumar este check al skill `n8n-workflow-audit`

### Escenario G — BANT mal extraído por el modelo (v1.1)

El agente principal extrae Authority como "tiene presupuesto" o confunde Timeline con Need. El humano recibe resumen incoherente.

**Mitigación:**

- Schema estricto en `bant_detected` con campo `status` enumerado (`✅` / `⚠️` / `❌`)
- Validación post-LLM (Code node después del agente principal) que verifica que cada uno de los 4 campos tiene la forma esperada. Si falta o está mal, deja el valor del turno anterior o `{ status: "❌", value: "no preguntado" }`
- Logs de casos donde la validación falló, revisión semanal de los top 10 para mejorar el prompt

### Escenario H — Lead cambia de tema y el bot pierde el contexto BANT (v1.1)

Conversación de 25 turnos. El bot extrajo BANT en turno 6, pero la memoria de LangChain ya resumió esos turnos. El `bant_detected` del último mensaje refleja solo lo del turno 24.

**Mitigación:**

- El agente principal acumula `bant_detected` campo a campo: si un campo se extrajo antes Y no se contradijo, se preserva en el output actual
- Lectura defensiva del `handoff-trigger`: lee TODOS los `bant_detected` de los últimos 10 turnos del agente principal y compone el resumen tomando el valor más reciente con `status != "❌"` por cada campo

### Escenario I — Lead cambia de target a mitad de conversación (v1.1)

Conversación lleva 8 turnos con "Hans" asignado. En turno 9, el lead dice "mejor pasame con Pietro que ya hablé con él antes". El `resolve-handoff-target` detecta el override por nombre del array y reasigna.

**Comportamiento esperado:** los turnos 9+ usan "Pietro". El handoff (si se dispara después) va a Pietro. No hay rollback a Hans.

**Riesgo:** si el override es accidental (el lead solo mencionó a Pietro en pasado, no estaba pidiendo cambio), el sistema reasigna de más.

**Mitigación:** el override solo se activa si el lead dice "pasame con Pietro" / "quiero hablar con Pietro" / "hablar con Pietro" (verbos de pedido en imperativo o subjuntivo), no por mera mención. Heurística en el `resolve-handoff-target` Code node.

---

## CHECKLIST DE IMPLEMENTACIÓN PARA `n8n-builder`

Cuando el `n8n-builder` tome esto y lo lleve al JSON del workflow:

- [ ] Importar `agente-principal.md` al prompt del nodo "Agente Principal - Mateo"
- [ ] Importar `agente-objeciones.md` al prompt del nodo "Agente Objeciones - Mateo"
- [ ] Importar `router-clasificador.md` al prompt del nodo "Router - Mateo"
- [ ] Importar `formateador.md` al prompt del nodo "Formateador"
- [ ] Crear los 11 nodos nuevos listados arriba (incluye `resolve-handoff-target` de v1.1)
- [ ] Conectar las ramas del Switch correctamente
- [ ] Configurar modelos por nodo: **Sonnet 4 para principal/objeciones, Haiku 4 para router/formateador** (todos provider Anthropic)
- [ ] Configurar temperature: 0 para router/formateador, 0.5 para principal/objeciones
- [ ] Setear timeouts: 15s router, 30s agentes, 15s formateador
- [ ] Habilitar `response_format: json_object` en router y formateador si el modelo lo soporta
- [ ] Implementar los Code nodes de fallback (router parse, formateador parse, config load)
- [ ] Implementar `compute-flags` con la lógica de `objecion_previa_resuelta` y `post_link_sent`
- [ ] **(v1.1) Implementar `resolve-handoff-target` Code node** con lógica: leer `conversations.assigned_handoff_target` → si null, llamar RPC `assign_round_robin(pool, agency_id)` → persistir → detectar override por nombre explícito en mensaje del lead
- [ ] **(v1.1) Migración SQL:** `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS assigned_handoff_target text`
- [ ] **(v1.1) Verificar que el RPC `assign_round_robin` acepta `pool` (array de nombres genéricos) además del uso original con roles.** Si no, extender el RPC o crear `assign_round_robin_text(pool text[], scope_id uuid)`.
- [ ] **(v1.1) Extender el agente principal output** para incluir `bant_detected` cuando `qualification_framework = "bant"`. Implementación: instrucción en el prompt + validación post-LLM en Code node que normaliza el schema.
- [ ] **(v1.1) Extender `handoff-trigger` Code node** para componer resumen estructurado con BANT (si activo) o sin BANT (fallback). Push al humano por slack/discord/whatsapp interno con el resumen.
- [ ] Agregar validación pre-envío (no enviar mensaje con `{{ $json` literal — esto detecta también `handoff_target_for_this_conversation` no resuelto)
- [ ] Configurar delay 1.5s entre mensajes del SplitInBatches
- [ ] Implementar retry 3x con backoff en HTTP YCloud
- [ ] Persistir metadata extendida en `n8n_chat_histories` incluyendo `bant_detected` cuando aplica
- [ ] **(v1.1) Webhook YCloud lee `bot_config.workflow_version`** y rutea al workflow N8N correspondiente (`v1` = monolítico actual, `v2` = nuevo multi-agente)
- [ ] Test E2E con los 15 escenarios del bloque TESTING + escenarios BANT y handoff_targets nuevos
- [ ] Snapshot del workflow ANTES del deploy (`n8n-workflow-versioning` skill)
- [ ] Deploy con feature flag por agency (`workflow_version`), NO global. Momentum cliente cero, 48h de validación, después progresivo a Pérez Luna y siguientes.

Para el `n8n-reviewer`: aplicar `n8n-workflow-audit` skill completa antes de marcar como listo.

---

## CHANGELOG

### v1.1 — 2026-06-05 (pasada 2)

- **BANT como módulo transversal documentado:** NO agrega nodos N8N nuevos; solo extiende el schema de `metadata.bant_detected` en `n8n_chat_histories` y la lógica del `handoff-trigger` (resumen estructurado al humano con o sin BANT según `qualification_framework`). Schema de `bant_detected` con `{ status, value }` por cada uno de los 4 campos.
- **NUEVO nodo `resolve-handoff-target`** (Code) entre `compute-flags` y el Router. Lee `conversations.assigned_handoff_target` o computa round-robin con RPC `assign_round_robin` reusado (P1.1 roles). Detecta override por nombre explícito del lead. Output: `handoff_target_for_this_conversation` (string concreto inyectado al contexto del agente principal y de objeciones).
- **Migración SQL nueva:** `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS assigned_handoff_target text`.
- **Tabla de nodos nuevos actualizada:** 11 nodos (era 10). Sumado `resolve-handoff-target` en posición 2.
- **`handoff-trigger` extendido** con composición de resumen BANT estructurado al humano + reasignación de target si el lead nombró explícito a otro.
- **Variables N8N actualizadas:** sumadas `qualification_framework`, `handoff_targets` (no va al prompt directo), `handoff_target_for_this_conversation` (string resuelto, sí va al prompt).
- **Sección dedicada "ROUND-ROBIN DE `handoff_target`"** con reglas operacionales, pseudo-código del Code node, schema, justificación de por qué persiste en `conversations` y no en `n8n_chat_histories`.
- **Asunciones actualizadas con 4 decisiones confirmadas del founder** (marcadas ✅):
  - #2 Modelo LLM: Sonnet 4 (agentes) + Haiku 4 (router/formateador), provider Anthropic
  - #9 `handoff_targets` como array configurable con round-robin RPC reusado
  - #11 Feature flag por agency `workflow_version`, deploy progresivo Momentum primero
  - #13 Nombre del bot configurable per-agency (`assistant_name`)
  - #14 BANT como módulo transversal
- **Pre-Mortem arquitectónico extendido** con escenarios F (round-robin desbalanceado), G (BANT mal extraído), H (BANT pierde contexto en conversación larga), I (lead cambia target a mitad).
- **Escenarios de testing E2E extendidos:** sumados 8 escenarios (16-23) cubriendo round-robin, override, BANT activo en distintos patrones, BANT desactivado, array vacío, workflow_version routing.
- **Checklist del `n8n-builder` extendido** con steps específicos de v1.1: nodo `resolve-handoff-target`, migración SQL, validación del RPC, extensión del agente principal output, extensión del handoff-trigger, webhook YCloud lee `workflow_version`.
- **Header actualizado:** workflow target `bot-c v2` (v1 queda como rollback).

### v1.0 — 2026-06-05 (pasada 1)

- Versión inicial. Spec completa de arquitectura multi-agente.
- Reemplaza el bot monolítico del workflow `bot-c v1`.
- 4 agentes (router + principal + objeciones + formateador) + handoff.
- 3 modos de venta configurables (`consultivo`, `transaccional`, `educativo`).
- Variables configurables centralizadas en `bot_config` jsonb.
