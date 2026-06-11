# 01 — Arquitectura del stack

## Resumen

Chatbot conversacional multi-canal (WhatsApp + Instagram) con ManyChat como capa intermedia, Supabase como backend (CRM + RAG + memoria), n8n self-hosted como orquestador.

## Stack en una sola línea

```
ManyChat (WA + IG) → Webhook → n8n → [Redis batching + Supabase CRM + RAG] → AI Agent + Formateador → ManyChat (response)
```

## Componentes

| Capa | Componente | Función |
|---|---|---|
| Canal | ManyChat | Recibe mensajes de WhatsApp e Instagram bajo el mismo subscriber_id. Filtra spam básico. Envía respuesta del bot via custom fields + flow trigger. |
| Webhook | n8n public webhook | Entrada única para WA + IG. Discrimina por campo `body.canal` del payload. |
| Batching | Redis | Agrupa mensajes consecutivos del user (3-4 mensajes en pocos segundos) para que el LLM responda una sola vez. |
| CRM | Supabase Postgres | Tablas: agencies, agency_channels, leads, conversations, messages, tasks, webhook_events_raw. Schema CORE de `chatbot-db-schema-supabase`. |
| Memoria | Supabase Postgres (n8n_chat_histories) | Memoria conversacional de LangChain. Una row por mensaje entre lead y bot. |
| RAG | Supabase Vector Store (documents) | Embeddings de info del negocio (catálogo de villas, productos, FAQs, etc.) que el AI Agent consulta como tool. |
| LLM | OpenAI gpt-4.1-mini (router, classifier, agent) + gpt-4o-mini (formateador) | Configuración Momentum: router temp 0.1, agent temp 0.4, max tokens 300-400. |

## Diagrama del flujo del workflow n8n

```
Webhook (ManyChat POST)
   │
   ├─→ [PARALELO] Persist webhook raw (Postgres webhook_events_raw)
   │
   └─→ Edit Fields2: extrae body.data.X + body.canal
        │
        ↓
       Check killswitch (agencies.settings.bot_enabled)
        │
        ↓ (si bot_enabled = true)
       ID y Mensaje
        │
        ↓
       REINICIAR? (regex "REINICIO/reinicio/etc")
        ├─ SÍ → Vacía Redis + Delete n8n_chat_histories + Reset conversation + ManyChat reinicio flow
        └─ NO ↓
       Buscar Lead (Postgres por manychat_id)
        │
        ↓
       Existe? (manychat_id matches)
        ├─ NO → Information Extractor1 (clasificador inicial v3)
        │       │
        │       ↓
        │      Classifier dice continuar?
        │       ├─ TRUE  → Crear Lead → Crear Conversation (handler=bot) → Guardar mensajes (batching)
        │       └─ FALSE → Crear Lead (Handoff) → Crear Conversation (Handoff) → FIN (no responde)
        │
        └─ SÍ → Get or Create Conversation (UPSERT)
                │
                ↓
                IN OFF?1 (handler != bot)
                ├─ SÍ → FIN (bot apagado para este lead)
                └─ NO → Guardar mensajes (batching)

                          [Batching Redis]
                          Guardar mensajes → Wait → Revisar → ¿Es último mensaje?
                                                                  ├─ NO → FIN (espera el siguiente)
                                                                  └─ SÍ → Juntar mensajes
                                                                          │
                          ┌───────────────────────────────────────────────┘
                          │
                          ├─→ [PARALELO] Persist inbound message (Postgres)
                          │
                          └─→ Conversation (select n8n_chat_histories) → Code → Unificación de Variables
                              │
                              ↓
                              Information Extractor (router AGENTE_PRINCIPAL vs HANDOFF_HUMANO)
                              │
                              ↓
                              Switch1
                              ├─ AGENTE_PRINCIPAL → AI Agent + RAG + Postgres Chat Memory
                              │                    │
                              │                    ↓
                              │                    Basic LLM Chain4 (Formateador) → Split Out → Loop Over Items
                              │                                                                  │
                              │                              ┌───────────────────────────────────┘ (output 1: loop)
                              │                              │
                              │                              ↓
                              │                              If5 (output ≠ vacío)
                              │                              ├─→ [PARALELO] Persist outbound message
                              │                              ├─→ Set Respuesta Chatbot 2 (ManyChat custom field)
                              │                              │   │
                              │                              │   ↓
                              │                              │   Send Respuest Chatbot (ManyChat trigger flow)
                              │                              │   │   flow_ns = condicional WA/IG
                              │                              │   ↓
                              │                              │   Wait2 → vuelve a Loop
                              │                              │
                              │                              (Loop output 0 = done = fin)
                              │
                              └─ HANDOFF_HUMANO → Handoff: update conversation → FIN
```

## Tablas Supabase usadas

Del schema CORE (`chatbot-db-schema-supabase`):

- `agencies` — 1 row por cliente. `settings.bot_enabled` controla el kill switch global.
- `agency_channels` — 2 rows por cliente (whatsapp + instagram) con el mismo manychat_page_id.
- `leads` — con columnas extra ManyChat: `manychat_id`, `manychat_page_id`, `ig_username`, `whatsapp_phone`, `live_chat_url`.
- `conversations` — 1 por `(agency_id, lead_id, channel)`. Channel es 'whatsapp' o 'instagram' según el canal de entrada.
- `messages` — inbound + outbound, con `external_id` para idempotencia.
- `tasks` — auto-creadas por trigger cuando `handoff_status='pending'`.
- `webhook_events_raw` — log paranoid de cada webhook entrante.
- `n8n_chat_histories` — memoria LangChain (la maneja n8n automático).
- `documents` — RAG (vector store).

## Roles y separación de responsabilidades

| Quién | Hace qué |
|---|---|
| **ManyChat** | Recibe el mensaje del user, dispara webhook a n8n. Recibe la respuesta y la envía al user en su canal. NO toma decisiones de bot. |
| **n8n workflow** | Orquesta todo. Decide si el bot responde o hace handoff. Persiste en Supabase. |
| **AI Agent (LangChain en n8n)** | Genera la respuesta del bot usando RAG + memoria + tools. Toma decisiones conversacionales. |
| **Information Extractor (router)** | Decide entre AGENTE_PRINCIPAL y HANDOFF_HUMANO según el contexto de la conversación. |
| **Information Extractor1 (clasificador inicial)** | Solo se dispara para LEADS NUEVOS. Decide si activar el bot o pasar a humano (spam, conversación continuada, soporte post-venta, no relacionado, consulta válida). |
| **Formateador (Basic LLM Chain)** | Divide la respuesta del AI Agent en mensajes de máximo 3 líneas para WhatsApp (excepto listas, que van enteras). |
| **Supabase triggers** | Auto-actualizan denormalizaciones (last_message_at, unread_count), crean tasks auto al handoff, broadcast realtime. |

## Decisiones de diseño clave (por qué este patrón)

### Multi-canal con UN solo workflow (vs uno por canal)

**Razón:** WhatsApp e Instagram via ManyChat tienen IDÉNTICO payload excepto:
- El flow_ns para enviar la respuesta es distinto
- El campo `body.canal` indica `WA` o `IG`

Tener 2 workflows duplicados es waste — la lógica del bot, el routing, el formateador, todo es igual. Único cambio: el flow_ns final. Eso se resuelve con un expression condicional `canal === 'IG' ? FLOW_IG : FLOW_WA`.

### ManyChat como capa intermedia (vs YCloud directo o Evolution API)

**Pros de ManyChat:**
- Unifica WA + IG bajo el mismo subscriber_id
- Maneja Meta Business API por nosotros (no hay que pelear con autenticación Meta)
- Built-in transcripción de audios (no necesitamos Whisper aparte)
- Custom fields para enviar respuestas estructuradas

**Cons:**
- Costo mensual (~$25-100 depending on tier)
- Dependencia de un tercero

### Supabase nativo (vs Airtable + Supabase)

**Razón:** Airtable es solo "vista" para el equipo del founder. La clienta no lo usa. Con `n8n_chat_histories` + el schema CORE + un futuro frontend, Airtable queda redundante. Eliminarlo simplifica el workflow y elimina rate limits.

### Batching Redis (mantener del v1)

Patrón Momentum estándar. Si el user manda 4 mensajes en 5 segundos, no queremos disparar el LLM 4 veces. Esperamos a que termine de escribir.

## Próximos pasos

- [02-deployment-checklist.md](02-deployment-checklist.md) — pasos concretos para deployar
- [03-errores-comunes-y-fixes.md](03-errores-comunes-y-fixes.md) — qué hacer cuando algo rompe
- [04-payload-manychat-multicanal.md](04-payload-manychat-multicanal.md) — estructura exacta del webhook
- [05-patron-multi-canal.md](05-patron-multi-canal.md) — detalles del switch WA/IG
