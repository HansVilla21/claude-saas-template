# Skill: Chatbot ManyChat + Supabase + n8n (multi-canal WA + IG)

## Cuándo usar esta skill

- Cliente nuevo de Momentum AI que quiere chatbot por WhatsApp + Instagram bajo el mismo flujo n8n
- ManyChat es la capa intermedia (no YCloud directo, no Evolution API)
- Supabase nativo como CRM (no Airtable)
- Necesitás replicar EXACTAMENTE el patrón que se validó con Jacó Dream Rentals (2026-05)

## Qué provee esta skill

Skill end-to-end para deployar un chatbot completo de Momentum con el stack:

- **Canal:** ManyChat (intermediario para WA + IG con el mismo subscriber_id)
- **DB:** Supabase con schema CORE (leads/conversations/messages/tasks/webhook_events_raw)
- **RAG:** Supabase Vector Store
- **Memory:** Postgres Chat Memory (LangChain n8n_chat_histories)
- **Batching:** Redis (3-4 mensajes seguidos del user → solo el último dispara LLM)
- **Workflow:** n8n con AI Agent + Information Extractor (router + classifier inicial) + Basic LLM Chain (formateador)

Incluye:

- **Documentación tabla por tabla** del schema (referencia a `chatbot-db-schema-supabase`)
- **Payload de ManyChat multicanal** explicado en detalle (`docs/04-payload-manychat-multicanal.md`)
- **Checklist de deployment paso a paso** (`docs/02-deployment-checklist.md`)
- **Errores comunes y sus fixes** (`docs/03-errores-comunes-y-fixes.md`) ← LEER ANTES de tocar nada
- **Scripts reusables** en `scripts/` (referencias a `scripts/n8n-update-node.py` del repo)

## Las 7 reglas no negociables (errores que ya pagamos)

Cualquier Claude que arme este stack debe respetar estas reglas. Cada una viene de un bug real que costó tiempo.

### 1. Prompts en nodos LangChain NO pueden tener llaves literales `{` `}` en exceso

LangChain parsea el `systemPromptTemplate` como template Python `str.format()`. Las llaves se interpretan como variables. Si tu prompt tiene ejemplos JSON inline con `{` `}`, el nodo falla **silenciosamente** y devuelve `[{}]` vacío.

**Aplica a:** `@n8n/n8n-nodes-langchain.informationExtractor`, `chainLlm`, `agent` (en el `systemMessage`).

**Solución:**
- Describí el formato del output en prosa o tablas, no con `{...}` inline.
- Si necesitás un ejemplo del formato JSON, máximo 1-2 pares de llaves en una sección `## FORMATO DE SALIDA`.
- El schema completo va en el campo `inputSchema` del nodo (separado, no rompe).

Ver `docs/03-errores-comunes-y-fixes.md` § "Output vacío en LangChain".

### 2. Queries Postgres con valores nullables → usar patrón JSON deconstruction

El parser de `queryReplacement` de n8n splittea por comas y colapsa valores vacíos consecutivos. Si pasás 10 parámetros separados y 3 vienen vacíos, Postgres recibe 7 y tira `"there is no parameter $N"`.

**Solución:** un solo parámetro JSON deconstruido en SQL:

```sql
WITH data AS (SELECT $1::jsonb AS d)
INSERT INTO public.leads (col1, col2, ...)
SELECT
  d->>'manychat_id',
  NULLIF(d->>'display_name', ''),
  NULLIF(d->>'ig_id', ''),
  ...
FROM data
```

Con `queryReplacement = ={{ JSON.stringify({manychat_id: ..., display_name: ..., ig_id: ...}) }}`.

Ver `docs/03-errores-comunes-y-fixes.md` § "no parameter $N".

### 3. ON CONFLICT con índice parcial debe incluir la cláusula WHERE

Si el UNIQUE en la tabla es parcial (ej. `WHERE external_id IS NOT NULL`), el `ON CONFLICT` también necesita esa cláusula:

```sql
ON CONFLICT (agency_id, channel, external_id)
  WHERE external_id IS NOT NULL
  DO NOTHING
```

Sin la cláusula → Postgres tira `"there is no unique or exclusion constraint matching the ON CONFLICT specification"`.

### 4. Nodos Postgres EN SERIE rompen el flujo del `$json.output` downstream

Si un nodo Postgres está entre el AI Agent / If / Loop y el nodo siguiente que usa `{{ $json.output }}`, el `$json` ahora apunta al output del Postgres (que es `{id}` o vacío), no a lo que esperabas.

**Solución:** poner los nodos de persistencia (insert messages, etc.) EN PARALELO, no en serie. Conectar el If/AI a múltiples nodos desde el mismo output.

### 5. Lead sin conversation → upsert en Get Conversation State

Si un `Crear Lead` falla pero el INSERT pasa (caso de tests previos rotos), queda un lead huérfano sin conversation. El `Get Conversation State` devuelve vacío y rompe el flujo.

**Solución:** `Get or Create Conversation` con UPSERT:

```sql
INSERT INTO public.conversations (agency_id, lead_id, channel, handler, handoff_status)
VALUES ($1::uuid, $2::uuid, $3::message_channel, 'bot', 'none')
ON CONFLICT (agency_id, lead_id, channel) DO UPDATE SET updated_at = NOW()
RETURNING id, handler, handoff_status, bot_paused_until;
```

Garantiza que SIEMPRE devuelve una row.

### 6. Loop Over Items v3: outputs counterintuitive

En `splitInBatches` v3 de n8n:
- **Output 0 = `done`** (cuando terminó)
- **Output 1 = `loop`** (cada item del batch)

Conectar nodos de PROCESAMIENTO al output **1 (loop)**. Conectar nodos POST-loop al output **0 (done)**. El último nodo del loop se conecta de vuelta al `Loop Over Items`.

Visualmente n8n los muestra al revés (loop arriba, done abajo) — confuso pero técnicamente índices 0=done, 1=loop.

### 7. Estilo humano en prompts del bot

Aplica a TODO chatbot Momentum. Los prompts del agente principal NO pueden contener:

- Punto final (`.`) al cerrar oración/mensaje
- Dos puntos (`:`) en chat
- Punto y coma (`;`)
- Signo de pregunta de apertura (`¿`)
- Guion largo (`—`, em-dash)
- Anuncios meta-respuesta ("te paso la info", "te explico")

Estos son tells de IA. Una vendedora humana en WhatsApp no escribe así.

Ver memoria global: `feedback_human_punctuation_style.md`.

## Cómo usar esta skill (orden recomendado)

### Si arrancás un cliente nuevo desde cero

1. Leer **[docs/01-arquitectura.md](docs/01-arquitectura.md)** (10 min) — visión general del stack.
2. Leer **[docs/04-payload-manychat-multicanal.md](docs/04-payload-manychat-multicanal.md)** (5 min) — entender el payload exacto que envía ManyChat.
3. Leer **[docs/03-errores-comunes-y-fixes.md](docs/03-errores-comunes-y-fixes.md)** (10 min) — ANTES de tocar nada, conocer los 12 errores que ya enfrentamos.
4. Ejecutar **[docs/02-deployment-checklist.md](docs/02-deployment-checklist.md)** (60-90 min) — paso a paso.
5. Profundizar en sub-skills cuando necesités:
   - `n8n-postgres-prepared-statements` — patrón JSON deconstruction
   - `n8n-langchain-prompts-rules` — reglas de prompts LangChain
   - `chatbot-db-schema-supabase` — schema CORE (referencia técnica)

### Si estás iterando un cliente existente

- Si hay un error: chequear primero `docs/03-errores-comunes-y-fixes.md` antes de proponer fix nuevo.
- Para modificar el workflow en vivo: usar `scripts/n8n-update-node.py` del repo (no re-importar JSON cada vez).

## Estructura de archivos

```
.claude/skills/chatbot-manychat-supabase-multicanal/
├── SKILL.md                                      ← este archivo (entry point + overview)
└── docs/
    ├── 01-arquitectura.md                        ← stack completo + diagrama
    ├── 02-deployment-checklist.md                ← 30+ pasos ordenados
    ├── 03-errores-comunes-y-fixes.md             ← 12 errores + fix de cada uno
    ├── 04-payload-manychat-multicanal.md         ← payload exacto + cómo extraer
    └── 05-patron-multi-canal.md                  ← un workflow para WA + IG
```

## Output esperado al ejecutar la skill

Cuando alguien aplique esta skill a un cliente nuevo, debería terminar con:

- 1 proyecto Supabase con schema CORE aplicado + 1 agency creada
- 1 workflow n8n llamado `Chatbot {Cliente} - Multi-canal (WA+IG)` con 50-55 nodos
- ManyChat configurado con webhook apuntando al workflow + 2 flows (uno para responder en WA, otro para IG)
- Test end-to-end OK desde WhatsApp Y desde Instagram
- Archivos versionados en `clients/{cliente}/` (prompts + workflow snapshot)
- `clients/{cliente}/.env` con credenciales

## Skills relacionadas

Esta skill cubre el patrón completo de Jacó. Para partes específicas:

- **`chatbot-db-schema-supabase`** — schema CORE genérico de DB (referencia técnica de tablas/triggers/RLS)
- **`n8n-postgres-prepared-statements`** — patrón JSON deconstruction para queries Postgres
- **`n8n-langchain-prompts-rules`** — reglas de prompts para nodos LangChain de n8n

## Origen

Esta skill fue destilada del proyecto Jacó Dream Rentals (mayo 2026), después de una sesión intensiva de debugging que reveló 12 errores distintos. Cada regla y cada patrón documentados aquí viene de un bug real que costó tiempo solucionar. La intención es que **cualquier Claude pueda aplicar este patrón a un cliente nuevo y NO repetir esos errores**.

> "La idea es que yo vaya a otro chat que no tiene todo el contexto que vos tenés, le diga que hagamos esto mismo y lo haga bien a la primera, con toda la información documentada."
> — Hans (founder Momentum AI), 2026-05-27
