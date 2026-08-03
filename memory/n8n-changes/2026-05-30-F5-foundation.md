# Spec: F5 — Foundation (golden set + eval harness + prompt caching + audit log + idempotencia)

**Fecha:** 2026-05-30
**Autor:** n8n-architect
**Workflow afectado:**
- **NUEVO:** `crm-v2/n8n/workflows/eval-harness-v1.json` (workflow separado, NO toca producción).
- **MODIFICADO aditivamente:** `crm-v2/n8n/workflows/chatbot-momentum-bot-v6-v2.json` (sucesor versionado de `bot-v6-v1`; F5 NO cambia arquitectura del bot, solo agrega 4 Code Nodes de instrumentación + 1 HTTP node de cierre del trace).
- **Edge function bot-actions:** v0.2.0 → v0.3.0 (agrega idempotencia + handler nuevo `audit.write_turn`).

**Versión actual → propuesta:**
- `bot-v6-v1` (active, 70 nodos, sin trace_id, sin idempotencia) → `bot-v6-v2` (active tras F5, ~75 nodos: +4 Code + 1 HTTP, idempotencia upstream en edge function).
- `bot-actions` v0.2.0 (7 operations sin idempotencia) → **v0.3.0** (7 operations idempotentes + nueva `audit.write_turn`).
- `eval-harness` no existe → **v1** (workflow nuevo, inactivo por default).

**Trigger del cambio:** Decisión arquitectónica del 2026-05-30 (mesa multi-agente, `memory/research/14-mesa-arquitectura-sofia-v6.md`): migrar a arquitectura C (híbrido determinista) en 4 semanas. F5 = Semana 1 = entregables que sirven a CUALQUIER arquitectura futura (A o C) y se construyen ANTES de tocar el bot. Inversión que no se pierde, mide A vs C en tokens/latencia/accuracy, asegura que NO duplicamos handoffs/tags/etc. cuando empiece el cutover.

**Specs predecesoras:**
- `2026-05-30-sofia-v6-F4-bot-schedule-auto-actions.md` (cierra el cableado, 7 handlers reales, modelo de formato para esta spec).
- `memory/decisions.md` entrada 2026-05-30 tarde (lock-in mesa multi-agente).

---

## 0. Resumen ejecutivo

F5 entrega 5 piezas atómicas — golden set, harness, prompt caching, audit log con trace_id, idempotencia — que **no cambian el comportamiento del bot ante el lead** pero le dan al founder y al builder de C las herramientas para medir y migrar sin volar producción. Filosofía: "instrument first, refactor second". Si F6 falla y hay que rollback, F5 sigue valioso porque mide y deja trazabilidad sobre A.

**Lo que F5 NO hace:**
- NO cambia la arquitectura del bot (sigue siendo A: 1 LangChain Agent con 7 tools + el extractor_tool ya cableado).
- NO cambia el comportamiento conversacional (sin cambios de prompt salvo reordenar bloques para cache).
- NO toca el handoff por detector ni el office_hours branch (ya cerrados en F4).
- NO arranca el A/B test entre A y C (eso es F6 + F7).

**Decisiones rectoras lock-in (justificadas en §3):**

- **R1 — Golden set file-based en `crm-v2/eval/golden-set/v1.jsonl`** (NO tabla Postgres). Versionado git, diffable en PRs, reproducible offline, sin friction de auth/RLS. Total 80 turnos, distribuidos por categoría según §3.1 tabla. Justificación detallada §3.1.
- **R2 — Tabla `bot_turns`** (singular del concepto, plural de la entidad) es el audit log canónico. Trace_id UUID generado en N8N al inicio, propagado por TODA la rama, escrito por UPSERT incremental desde 4 nodos del workflow + 1 desde edge function. RLS multi-tenant con `is_member_of(agency_id) + master bypass`. Justificación §3.4.
- **R3 — Idempotencia con tabla nueva `bot_action_dedupe`** (NO columna nueva en `bot_action_results`, que no existe). TTL 15 min vía índice + cron de limpieza diario. Unique key `(turn_id, tool, params_hash)` con `params_hash = sha256(canonicalJSON(params))`. Si hit, devuelve la respuesta cacheada con `idempotent_replay: true`. Justificación §3.5.
- **R4 — Prompt caching SIN reordenar el bloque B de bot_config**. OpenAI cachea prefix idéntico desde el `system` message. El bloque A (core, global) ya está arriba. La inversión es: mover `## CONTEXTO DEL LEAD` y `## DATOS YA CAPTURADOS` (dinámicos por turno) FUERA del system prompt → al `user` message como prefijo. Así el system queda inmutable por agency y el cache funciona. Más detalle §3.3 (cambio de paradigma — el founder y el reviewer deben aprobar esta decisión específicamente porque toca el modelo mental del compositor).
- **R5 — Eval harness corre standalone (CLI wrapper `scripts/eval-runner.mjs`)** que dispara el workflow N8N vía webhook test. NO se integra al CI (overkill ahora, lo evaluamos en F7). El runner imprime tabla a stdout + persiste a `eval_runs` y `eval_run_turns`. Justificación §3.2.

**Compatibilidad A ↔ C:** los 5 entregables funcionan idénticos sobre A (hoy) y C (futuro). El harness solo conoce "workflow_id_target" — no le importa la arquitectura interna. La tabla `bot_turns` tiene 2 columnas opcionales que solo C poblará (`extractor_output_json`, `schema_version_hash`); A las deja NULL. Idempotencia + prompt caching son agnósticos.

**Riesgo macro:** F5 mete instrumentación en el camino caliente del bot. Si un Code Node nuevo tira excepción → el turno entero falla. Mitigación: TODOS los nodos de F5 son **try/catch silenciosos** que loggean a stderr de N8N pero NUNCA abortan la rama del bot. Confirmado en cada Code Node de §6.

---

## 1. Problema / requerimiento

Hoy el founder ve el bot Sofia v6 v1 corriendo en producción de pruebas con 70 nodos y 7 tools, pero NO tiene:

1. **Forma de medir** si el LLM llama las tools correctas. La queja del founder ("a veces no llama las tools que debería") es anecdótica; no hay número.
2. **Forma de comparar** dos arquitecturas (A vs C) sin meter ambas en producción.
3. **Visibilidad** de qué pasó EN un turno cuando algo sale mal. Hoy hay logs sueltos en N8N y en `bot-actions`; no hay trace_id que correlacione.
4. **Protección contra duplicados.** N8N hace retries automáticos en HTTP 5xx + Supabase Edge tiene 503s ocasionales. Sin idempotencia: doble-tag, doble-handoff, doble-nota cuando el primer mes corra en producción real.
5. **Optimización de costo.** El system prompt actual tiene ~3-5k tokens por turno, idénticos turno a turno para el mismo agency. OpenAI cachea prefix automático cuando hay >1024 tokens estáticos; hoy no estamos aprovechando.

F5 cierra los 5 gaps en una sola Semana 1 antes de mover una sola línea de la arquitectura del bot. Después de F5:

- Hay un golden set v1 (80 turnos etiquetados con tools esperadas) commiteado en git.
- Un harness N8N independiente que itera el set contra el workflow target y mide.
- El system prompt está reordenado para que >1024 tokens estáticos arriba activen cache automático de OpenAI.
- Cada turno deja un row en `bot_turns` con trace_id, latencias por nodo, tokens, tools invocadas vs evaluables, hash del prompt usado.
- Cada call a `bot-actions` es idempotente por 15 min.

---

## 2. Estado actual relevante

### 2.1 En N8N (workflow `Chatbot Momentum - bot-v6 v1`, id `p3h7tx6UiGBQ9Tzb`, active)

Nodos relevantes para F5 (citando nombres exactos):

| Nodo | Tipo | Estado | Rol en F5 |
|---|---|---|---|
| `Webhook - YCloud Inbound` | webhook | entry point | trace_id se genera aquí (primer Code Node nuevo lo crea). |
| `Extract Variables`, `Set Normalize - *`, `ID y Mensaje` | set/code | normalización | el trace_id se propaga como JSON field. |
| `Resolve Agency` | postgres | query maestra | F5 agrega un SELECT extra para `agencies.id` (ya devuelto). |
| `Buscar Lead (Supabase)` | postgres | resuelve lead | lead_id disponible para audit log. |
| `Get Conversation State` | postgres | resuelve conv | conversation_id disponible. |
| `Componer System Prompt` | code | construye prompt | **MODIFICAR** — F5 reordena bloques para prompt caching (R4). |
| `Agente Principal - Sofia` | langchain.agent | LLM call | F5 NO toca. El nodo de trace post-agent captura tokens del output. |
| `Extractor_Tool_bot_actions`, `Stage_Tool_*`, `Qualify_Tool_*`, `Assign_Tool_*`, `Tag_Tool_*`, `Note_Tool_*`, `Request_Handoff_Tool` | toolHttpRequest | 7 tools | F5 NO toca el body. La idempotencia se agrega upstream en `bot-actions`. |
| `Formateador de Mensajes`, `Split Out`, `Loop Over Items`, `Send Chunk via YCloud` | varios | salida | F5 NO toca. |
| `Detector de Descalificacion`, `Apagar Chatbot — Conversation`, `Apagar Chatbot — Lead Summary`, `Notificar Agente (Telegram)` | langchain.informationExtractor + postgres + telegram | handoff route | F5 NO toca. Se loggea en audit_log igual via trace_id propagado. |
| `Calcular Estado de Horario`, `¿Fuera de Horario?`, `Send Out of Office via YCloud`, `Log Out of Office en Messages`, `Pausar Bot Hasta Hora Hábil` | code + if + httpRequest + postgres | office_hours branch (F4) | F5 NO toca. |

### 2.2 En `bot-actions` (edge function, v0.2.0, deployed Supabase v3)

Estado actual del código (verificado en `crm-v2/supabase/functions/bot-actions/index.ts`):

- 7 operations operativas + healthcheck: `extractor.write`, `stage.set`, `qualify.set`, `assign.set`, `tag.add`, `note.write`, `handoff.escalate`, `conversation.pause_until`.
- Envelope: auth Bearer (BOT_ACTIONS_SECRET, constant-time), cross-tenant guard (`lead.agency_id === agency_id`), gates por toggle (`auto_actions.<key>`), kill-switch del extractor (`bot_extractor_enabled`).
- Sin idempotencia. `tag.add` es idempotente por DB constraint (`UNIQUE(tag_id, entity_type, entity_id)`), `handoff.escalate` es idempotente por guard (`WHERE handoff_status <> 'pending'`); los demás NO lo son. Doble UPDATE de stage / qualify / assign / pause es safe en términos de daño (idempotent business-wise) PERO el iconito bot y el timestamp se renuevan cada vez, lo que ensucia auditoría. `note.write` SÍ duplica.
- Catch global: cualquier excepción → 200 con `ok:false`. NO 500.
- Logging: `console.log` con event + agency_id + lead_id por operation. Sin trace_id.

### 2.3 En Supabase migrations

Última migración aplicada: `0014_lead_notes.sql`. F5 introduce **`0015_bot_observability.sql`** (numeración continua) que crea las 3 tablas nuevas (`bot_turns`, `bot_action_dedupe`, `eval_runs`, `eval_run_turns`) + RLS + índices.

### 2.4 En el repo

- Estructura `crm-v2/n8n/workflows/` con `chatbot-momentum-bot-v6-v1.json`.
- Estructura `crm-v2/scripts/` con `build-bot-v6-v1.js` (modelo) + `n8n-pull.mjs` + `n8n-push.mjs` + `validate-n8n-expressions.js`.
- NO existe `crm-v2/eval/`. F5 lo crea.

---

## 3. Decisiones rectoras (lock-in) — justificación detallada de R1-R5

### 3.1 R1 — Golden set file-based en `crm-v2/eval/golden-set/v1.jsonl`

**Decisión:** archivos JSONL en repo, versionados git, NO tabla Postgres.

**Estructura de archivos:**

```
crm-v2/eval/
├── golden-set/
│   ├── v1.jsonl              # 80 turnos labelados (1 turno por línea)
│   ├── v1.README.md          # cómo se construyó, distribución, glossary
│   └── synthetic-fixtures/
│       ├── agency-robert-fisio.json    # snapshot de bot_config para repro
│       ├── lead-frio-genérico.json
│       └── lead-hot-completo.json
├── runs/
│   └── .gitkeep              # outputs del runner se persisten a DB, no acá
└── README.md
```

**Por qué file-based gana:**

| Criterio | File-based (R1, elegido) | Tabla Postgres |
|---|---|---|
| Diffeable en PRs | sí, jsonl diffea limpio | no, hay que mirar via SQL |
| Versionado git | sí, free | no, hay que orquestar dumps |
| Acceso del builder offline | sí | no, requiere DB up |
| Friction al editar | bajo, editor de texto | medio (cliente SQL + RLS) |
| Tamaño esperado (80 turnos) | ~150KB total | overkill para esto |
| Multi-tenant relevante? | NO, golden set es global de Hans | sí |
| Queryable cross-cuts | con jq / scripts | sí (SQL nativo) |

El único pro de la DB era queryable cross-cuts, que se cubre con `jq` o un script Node ad-hoc cuando se necesite (probablemente nunca; el harness ya hace todo el cross-cut que necesitamos).

**Schema por turno (cada línea del jsonl):**

```json
{
  "turn_id": "gs-v1-001",
  "category": "extractor_capture",
  "agency_fixture": "agency-robert-fisio",
  "lead_fixture": "lead-frio-generico",
  "conversation_history_summary": "Lead saludó, bot se presentó. Lead preguntó qué hace el negocio. Bot explicó.",
  "lead_msg": "Tengo dolor crónico de espalda desde hace 2 años, presupuesto como 80mil al mes",
  "expected_tools": [
    {
      "tool": "Extractor_Tool_bot_actions",
      "params_partial": {
        "fields": [
          { "field_key": "dolor_principal", "value_contains": "espalda" },
          { "field_key": "presupuesto", "value_contains": "80" }
        ]
      },
      "required": true
    },
    {
      "tool": "Qualify_Tool_bot_actions",
      "params_partial": { "is_qualified": true },
      "required": false,
      "rationale": "Dio dolor + budget = criterio mínimo de calificación según bot_config de Robert. Aceptable que el LLM lo marque o lo deje para próximo turno."
    }
  ],
  "expected_response_constraints": {
    "must_not_promise_imperative": true,
    "should_acknowledge_pain": true
  },
  "notes": "Caso clásico de captura compuesta en un solo mensaje. Si el LLM solo captura uno de los dos campos, FAIL parcial."
}
```

**Categorías (distribución target sobre 80 turnos):**

| Categoría | Conteo | Descripción |
|---|---|---|
| `greeting_smalltalk` | 8 | Saludos, "qué tal", "hola"; bot debe responder sin tools. |
| `extractor_capture` | 20 | Lead da datos relevantes; bot debe llamar `Extractor_Tool_bot_actions`. |
| `stage_advance` | 8 | Lead avanzó claramente en pipeline; debe disparar `Stage_Tool_bot_actions`. |
| `qualify_signal` | 8 | Criterios de calificación cumplidos según `bot_config`; `Qualify_Tool_bot_actions`. |
| `tag_signal` | 6 | Señal clara para tag (VIP, urgente, frio); `Tag_Tool_bot_actions`. |
| `assign_signal` | 4 | Bot debe asignar a un agente del equipo; `Assign_Tool_bot_actions`. |
| `note_signal` | 4 | Contexto no estructurado que el agente humano debe ver; `Note_Tool_bot_actions`. |
| `handoff_request` | 8 | Las 6 condiciones SPSP del Request_Handoff_Tool, 1-2 por condición. |
| `off_topic` | 4 | Lead pregunta algo fuera del negocio (clima, fútbol); bot pivot suave, sin tools. |
| `request_clarification` | 4 | Lead manda mensaje ambiguo; bot pregunta para aclarar, sin tools. |
| `frustrated_no_handoff` | 4 | Lead expresa frustración leve pero NO pide humano explícito; bot debe NO escalar. |
| `compound_multi_tool` | 6 | Lead manda mensaje rico que dispara 2-3 tools (ej. extractor + qualify + stage). |
| **Total** | **80** | |

**Cómo se construye:**

1. **20 turnos reales del proyecto v2 Supabase (`fahujscodhqlopycorzn`):** SELECT de `messages` (direction='inbound') + `extractor_field_values` + `leads` + `conversations` del agency demo de Robert + agency demo inmobiliaria. Filtrar por mensajes donde haya un `extractor_field_values.extracted_at` correlacionable (para inferir qué tool se disparó). Etiquetado manual por el founder + Claude (sesión de label).
2. **60 turnos sintéticos** generados por Claude con instrucción de cubrir cada categoría según la tabla. Cada caso pasa por revisión rápida del founder antes de mergear a v1.

**Versionado del set:** `v1.jsonl` es inmutable después de mergeo a main. Cambios → `v2.jsonl`. El nombre del archivo se pasa al harness, queda en `eval_runs.golden_set_version`.

### 3.2 R5 — Harness corre standalone (NO en CI)

**Decisión:** el harness es un workflow N8N (`eval-harness-v1`) disparado por un CLI wrapper Node (`scripts/eval-runner.mjs`). Inactivo por default; se activa solo para correr el set.

**Por qué no CI:**
- El golden set tarda 5-10 min en correrse end-to-end (80 turnos × ~3-6s).
- Cada run cuesta tokens ($0.50-$2 según modelo target). Correrlo en cada PR es plata tirada.
- Frecuencia esperada: 1 run/semana (post-calibración del prompt) + 1 run pre-cutover (F7).
- F7 puede agregarlo a CI cuando A/B test esté estable.

**Cómo se invoca:**

```bash
node scripts/eval-runner.mjs \
  --arch=A \
  --workflow-id=<id de bot-v6-v2 en N8N> \
  --golden-set=crm-v2/eval/golden-set/v1.jsonl \
  --label="A baseline F5 deploy"
```

El runner: (a) abre el archivo jsonl, (b) inserta una fila en `eval_runs` con `status='running'`, (c) por cada turno hace POST al webhook del harness con el payload normalizado, (d) recibe el output, lo compara contra `expected_tools`, computa métricas, (e) inserta fila en `eval_run_turns`, (f) al final UPDATE `eval_runs` con totales + status='done', (g) imprime tabla resumen a stdout.

**Tabla resumen esperada al stdout:**

```
Run: eval-A-baseline-2026-05-30-14h22 (arch=A, wf=p3h7tx6UiGBQ9Tzb, set=v1.jsonl)
─────────────────────────────────────────────────────────────────────────────
Total turns: 80
Pass: 72 (90.0%)
Partial: 5 (6.3%)  — tool requerida llamada con params parciales
Fail: 3 (3.7%)     — tool requerida NO llamada o tool sobrante invocada

Por categoría:
  greeting_smalltalk      8/8 (100%)
  extractor_capture       18/20 (90%)
  stage_advance           6/8 (75%) ← worst
  qualify_signal          8/8 (100%)
  ...

Latencia: p50=2.1s, p95=4.8s, p99=8.2s
Tokens: in=482k, out=68k, cached=312k (64.7%) ← prompt cache hit rate
Costo estimado: $0.94 USD
Duración total: 7m22s

Detalle de FAILs en: SELECT * FROM eval_run_turns WHERE run_id='<uuid>' AND status='fail';
```

### 3.3 R4 — Prompt caching: mover bloques dinámicos al `user` message

**Esta es la decisión más invasiva de F5 y requiere aprobación explícita del founder + reviewer.**

**Estado actual del compositor (`Componer System Prompt`):**

El Code Node produce 1 string `system_prompt` que el `Agente Principal - Sofia` usa en `systemMessage`. Estructura:

```
[A] core (global, idéntico siempre)
[B] bot_config layers (SOBRE ESTE NEGOCIO, TONO, COMPORTAMIENTO DE VENTA, FLUJO, INSTRUCCIONES)
[C] módulos (## MÓDULO: properties si aplica)
[DATOS A CAPTURAR] extractor field defs de la agency
[AUTO-ACCIONES PERMITIDAS] toggles (F4)
[HORARIO DE ATENCIÓN] business_hours (F4, si office_hours)
[CONTEXTO DEL LEAD] dinámico: stage actual, attributes ya capturados, mensaje_count
[DATOS YA CAPTURADOS] dinámico: lista de extractor_field_values del lead
[D] rules (global, idéntico siempre)
```

Los bloques `[CONTEXTO DEL LEAD]` y `[DATOS YA CAPTURADOS]` cambian **CADA TURNO** (mensaje_count++, lista de attributes crece). Eso significa que el prompt string completo es diferente turno a turno → **OpenAI no cachea nada**.

**Cambio propuesto (R4):**

Sacar `[CONTEXTO DEL LEAD]` y `[DATOS YA CAPTURADOS]` del `systemMessage` y meterlos en el `user` message como **prefix** del mensaje del lead. Patrón estándar OpenAI:

- `system` → 100% estático por agency (core + bot_config + modules + DATOS A CAPTURAR + AUTO-ACCIONES + HORARIO + rules). Ahora el prefix es idéntico turno a turno → OpenAI cachea automático (>1024 tokens) → cached_tokens > 0 visible en `usage.prompt_tokens_details.cached_tokens`.
- `user` → "`[CONTEXTO DEL LEAD]\n<bloque dinámico>\n[DATOS YA CAPTURADOS]\n<bloque dinámico>\n\n[MENSAJE DEL LEAD]\n<mensaje crudo del lead>`".

**Justificación:**
- El cache aplica al prefix EXACTAMENTE idéntico. El system_prompt actual cambia turno a turno por los bloques dinámicos → cache off siempre.
- Tras el cambio, el system es deterministic por agency_id. Mismo agency, mismo system. 100% cache hit a partir del 2do turno.
- El "contexto dinámico" sigue llegando al LLM via user message — semánticamente equivalente, el agente puede leerlo igual. El único cambio es DÓNDE viene.

**Riesgo:** los modelos OpenAI Chat tratan `system` y `user` distintos. El `system` es "instrucciones rígidas"; el `user` es "input variable". Mover `[CONTEXTO DEL LEAD]` al user puede leerse como "esto es input del lead" — el LLM podría confundir el contexto operativo con el mensaje literal. **Mitigación:** prefijos claros `[CONTEXTO DEL LEAD] ... [FIN DE CONTEXTO]\n\n[MENSAJE DEL LEAD] ...` para que el LLM distinga.

**Verificación post-deploy (criterio PASS):**
- Después del 2do turno del mismo agency en una sesión, `usage.prompt_tokens_details.cached_tokens > 1024`.
- Si no aparece cache hit: expandir bloque A (core template) hasta superar 1024 tokens estáticos. Pero el founder reportó que el system actual está en 3-5k tokens, así que NO debería ser necesario.
- Tool nueva en bot-actions: `audit.write_turn` recibe `tokens_cached` y lo persiste en `bot_turns.tokens_cached` para auditar.

**Alternativa rechazada:** dejar el system inmutable y meter ambos bloques arriba del user, pero seguir mandando `[CONTEXTO DEL LEAD]` también en system. Razón del rechazo: el cache requiere prefix idéntico; si `[CONTEXTO]` aparece en system también, el cache vuelve a romperse.

### 3.4 R2 — Tabla `bot_turns` (singular: 1 row por turno)

**Schema propuesto** (detalle SQL completo en §4):

```
bot_turns
├── id (uuid, pk)
├── trace_id (uuid, unique, NOT NULL)        ← generado en N8N al inicio
├── agency_id (uuid, NOT NULL)
├── lead_id (uuid, NULL)                     ← null si el webhook llegó pero no resolvimos lead
├── conversation_id (uuid, NULL)
├── started_at (timestamptz, NOT NULL)
├── finished_at (timestamptz, NULL)          ← null si el turno crasheó mid-flight
├── arch (text, NOT NULL)                    ← 'A' | 'C' | 'eval-A' | 'eval-C'
├── model (text, NULL)                       ← 'gpt-4o' | 'gpt-4o-mini' | etc.
├── tokens_in (int, NULL)
├── tokens_out (int, NULL)
├── tokens_cached (int, NULL)
├── latency_total_ms (int, NULL)
├── latency_per_node (jsonb, default '{}')   ← { "Resolve Agency": 145, "Agente Principal - Sofia": 2310, ... }
├── system_prompt_hash (text, NULL)          ← sha256 del system prompt usado (post-R4 será stable por agency)
├── system_prompt_excerpt (text, NULL)       ← primeros 500 chars del prompt, para debug humano
├── tools_invocadas (jsonb, default '[]')    ← [ { tool, params, response_status, response_skipped_reason }, ... ]
├── tools_no_invocadas_evaluables (jsonb, default '[]')  ← C: tools que el extractor sugirió pero no se ejecutaron
├── extractor_output_json (jsonb, NULL)      ← C: JSON tipado del Information Extractor
├── schema_version_hash (text, NULL)         ← C: sha256 del schema dinámico de la agency en ese turno
├── input_crudo (text, NULL)                 ← mensaje del lead (puede ser texto, "[AUDIO transcripción: ...]", etc.)
├── output_crudo (text, NULL)                ← respuesta del bot tal como se manda al lead
├── status (text, NOT NULL, default 'running')   ← 'running' | 'done' | 'failed'
├── error_msg (text, NULL)                   ← si status='failed', el primer error
├── metadata (jsonb, default '{}')
└── created_at, updated_at (timestamptz)
```

**Quién escribe a `bot_turns`:**

| Quién | Cuándo | Qué campos UPSERTea |
|---|---|---|
| Code Node `Crear Trace de Turno` (N8N, primer Code Node después de webhook) | Inicio del turno | `trace_id, started_at, status='running', input_crudo, metadata.webhook_event` |
| Code Node `Enriquecer Trace con IDs` (N8N, después de Resolve Agency + Buscar Lead + Get Conversation State) | Mid-turno | `agency_id, lead_id, conversation_id` |
| `Componer System Prompt` (N8N, modificado) | Después de armar el prompt | `system_prompt_hash, system_prompt_excerpt, model` (model viene del config del agente) |
| Edge function `bot-actions` (cada handler) | Cada call que el LLM hace | Append a `tools_invocadas` (NO replace; UPSERT con función SQL que appendea) |
| Code Node `Cerrar Trace de Turno` (N8N, último Code Node antes del Send WhatsApp) | Fin del turno | `finished_at, status='done', tokens_in, tokens_out, tokens_cached, latency_total_ms, latency_per_node, output_crudo` |
| HTTP node `Trace Failure` (N8N, conectado a error outputs) | Si algo crashea mid-flight | `status='failed', error_msg, finished_at` |

**Por qué UPSERT incremental y no INSERT al final:** si el turno crashea mid-flight (ej. el agente excede timeout), perdemos el trace entero si esperamos al final. UPSERT incremental garantiza que al menos los datos que llegaron a ese punto quedan persistidos.

**RLS multi-tenant:** mismo patrón que `messages` y `conversations`: policy `select_member_or_master` con `is_member_of(agency_id) OR is_master()`. Sin policy de DELETE para usuarios (solo service_role borra via cron de retención). SQL completo en §4.

**Cómo escribe el edge function:** nueva operation `audit.write_turn` en `bot-actions` que acepta `{ trace_id, patch: { ...campos a setear } }` y hace UPDATE en `bot_turns` (NO crea la fila — la fila la crea N8N al inicio). Si trace_id no existe → log warning + skip silencioso (no abortar). Detalle en §5.

### 3.5 R3 — Idempotencia con tabla `bot_action_dedupe`

**Decisión:** tabla nueva, NO columna en tabla existente.

**Schema** (SQL completo en §4):

```
bot_action_dedupe
├── id (uuid, pk)
├── trace_id (uuid, NOT NULL)               ← apunta a bot_turns.trace_id, ON DELETE CASCADE
├── tool (text, NOT NULL)                   ← 'stage.set' | 'qualify.set' | ...
├── params_hash (text, NOT NULL)            ← sha256(canonicalJSON(params))
├── response_body (jsonb, NOT NULL)         ← la respuesta original que se devolvió
├── response_status (int, NOT NULL)         ← 200, 401, 403, etc.
├── created_at (timestamptz, NOT NULL, default now())
└── UNIQUE (trace_id, tool, params_hash)
```

**Por qué tabla nueva y no columna en `bot_turns` o `tag_assignments`:**
- `bot_turns` ya tiene `tools_invocadas` como jsonb array; meter idempotencia ahí mezclaría auditoría con lookup transaccional — performance mala.
- `tag_assignments` solo cubre tags; necesitamos cubrir las 7 operations.
- Tabla nueva permite TTL clean (DELETE WHERE created_at < now() - interval '15 min') sin afectar nada más.

**TTL:**
- Índice `(created_at)` para clean fast.
- Cron diario (Postgres pg_cron extension; agendar para 04:00 UTC) que ejecuta `DELETE FROM bot_action_dedupe WHERE created_at < now() - interval '24 hours'`. Mantenemos 24h en lugar de 15min porque: el storage es trivial (estimado: 1k turnos/día × 3 tools/turno × 500 bytes = 1.5MB/día), y 24h da margen para debug si algo raro pasa.
- El "TTL de 15 min" del brief original lo aplico solo a la LÓGICA de hit (la query del check pregunta `WHERE created_at > now() - interval '15 min'`); el cleanup físico va más relajado.

**Canonicalización de params para hash estable:**

```javascript
// Función auxiliar en bot-actions/index.ts
function canonicalJSON(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJSON).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalJSON(value[k])).join(',') + '}';
}
function paramsHash(params) {
  return sha256Hex(canonicalJSON(params));
}
```

**Lógica de check en cada handler:**

```typescript
// Pseudo (TypeScript real en §5.3)
const hash = paramsHash(params);
const { data: existing } = await sb
  .from('bot_action_dedupe')
  .select('response_body, response_status, created_at')
  .eq('trace_id', ctx.trace_id)
  .eq('tool', operation)
  .eq('params_hash', hash)
  .gt('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString())
  .maybeSingle();

if (existing) {
  // Hit: devolver la respuesta cacheada con flag idempotent_replay
  return jsonResponse(
    { ...existing.response_body, idempotent_replay: true, original_status: existing.response_status },
    existing.response_status
  );
}

// Miss: ejecutar el handler normal, capturar la respuesta, persistir hash
const responseObj = await handlerLogic(...);
await sb.from('bot_action_dedupe').insert({
  trace_id: ctx.trace_id,
  tool: operation,
  params_hash: hash,
  response_body: responseObj.body,
  response_status: responseObj.status,
});
return jsonResponse(responseObj.body, responseObj.status);
```

**Edge cases cubiertos:**

| Edge case | Comportamiento |
|---|---|
| 1er call: hash miss | ejecuta normal, persiste hash, devuelve normal. |
| 2do call idéntico dentro de 15 min | hit, devuelve respuesta cacheada + `idempotent_replay:true`. |
| 2do call 16 min después | miss (created_at fuera de ventana), ejecuta normal, persiste hash nuevo (UNIQUE(trace_id,tool,hash) → conflict; usar UPSERT). |
| 2do call con `trace_id` nuevo (turno distinto) | miss (trace_id distinto), ejecuta normal. Esto es lo que evita marcar "duplicado" cuando el lead manda el MISMO contenido en turnos consecutivos legítimamente. |
| Race: 2 workers reciben el mismo retry exactamente al mismo tiempo | el INSERT con conflict puede dejar 2 ejecutadas. Mitigación: el `tag.add` y `handoff.escalate` ya son idempotentes a nivel DB. Para los demás, el segundo INSERT al dedupe table fallaría con conflict pero la lógica ya se ejecutó → resultado idempotente (UPDATE con mismos valores). Acceptable. |
| `trace_id` viene NULL del N8N | log warning, skip dedupe check (ejecuta normal pero no persiste). Compatibilidad con calls legacy o tests. |

**Caveat clave:** la idempotencia es por `trace_id`, NO por `lead_id`. Si el lead manda 2 mensajes idénticos en 2 turnos distintos, cada uno tiene su `trace_id` propio y NO se deduplica. Esto es lo correcto — el segundo mensaje es semánticamente "el lead repitió", merece nuevo análisis del bot.

---

## 4. Cambios SQL — Migración `0015_bot_observability.sql`

Migración nueva aditiva. NO toca tablas existentes. Lista para aplicar.

```sql
-- =============================================================================
-- Momentum AI CRM — Migration 0015: Bot Observability (F5 Foundation)
-- =============================================================================
-- 4 tablas nuevas + RLS + índices + funciones auxiliares para:
--   1. bot_turns           — audit log canónico por turno (trace_id end-to-end).
--   2. bot_action_dedupe   — idempotency cache (TTL 15 min lógico, 24h físico).
--   3. eval_runs           — 1 fila por ejecución del harness sobre golden set.
--   4. eval_run_turns      — 1 fila por turno evaluado, link a bot_turns.
--
-- Trigger de F5 (spec 2026-05-30): mesa multi-agente decidió migrar a C en 4 sem.
-- F5 = semana 1 = instrumentación que sirve a A y C. Sin esto, F6 mide a ciegas.
--
-- Aditiva: NO modifica tablas previas. Idempotente (if not exists / or replace).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. bot_turns — audit log canónico
-- -----------------------------------------------------------------------------
create table if not exists public.bot_turns (
    id                              uuid primary key default gen_random_uuid(),
    trace_id                        uuid not null,
    agency_id                       uuid references public.agencies(id) on delete cascade,
    lead_id                         uuid references public.leads(id) on delete set null,
    conversation_id                 uuid references public.conversations(id) on delete set null,
    started_at                      timestamptz not null default now(),
    finished_at                     timestamptz,
    arch                            text not null default 'A',
    model                           text,
    tokens_in                       int,
    tokens_out                      int,
    tokens_cached                   int,
    latency_total_ms                int,
    latency_per_node                jsonb not null default '{}'::jsonb,
    system_prompt_hash              text,
    system_prompt_excerpt           text,
    tools_invocadas                 jsonb not null default '[]'::jsonb,
    tools_no_invocadas_evaluables   jsonb not null default '[]'::jsonb,
    extractor_output_json           jsonb,
    schema_version_hash             text,
    input_crudo                     text,
    output_crudo                    text,
    status                          text not null default 'running',
    error_msg                       text,
    metadata                        jsonb not null default '{}'::jsonb,
    created_at                      timestamptz not null default now(),
    updated_at                      timestamptz not null default now(),
    constraint bot_turns_trace_id_unique unique (trace_id),
    constraint bot_turns_status_chk check (status in ('running','done','failed')),
    constraint bot_turns_arch_chk check (arch in ('A','C','eval-A','eval-C'))
);

create index if not exists idx_bot_turns_agency_started
    on public.bot_turns(agency_id, started_at desc);
create index if not exists idx_bot_turns_lead_started
    on public.bot_turns(lead_id, started_at desc) where lead_id is not null;
create index if not exists idx_bot_turns_conversation_started
    on public.bot_turns(conversation_id, started_at desc) where conversation_id is not null;
create index if not exists idx_bot_turns_status_running
    on public.bot_turns(started_at desc) where status = 'running';
create index if not exists idx_bot_turns_arch_started
    on public.bot_turns(arch, started_at desc);

comment on table public.bot_turns is
    'Audit log canónico de bot turns. 1 fila por turno (webhook inbound del lead → respuesta del bot). trace_id correlaciona n8n + bot-actions edge function. F5 spec 2026-05-30.';
comment on column public.bot_turns.arch is
    'Arquitectura del bot que procesó: A (LangChain Agent + tools), C (Information Extractor + N8N IF), eval-A/eval-C (corridas del harness).';
comment on column public.bot_turns.tools_no_invocadas_evaluables is
    'Solo C: tools que el extractor sugirió pero no se ejecutaron (auto_actions toggle off, gate, etc.). Permite medir si C ahorra calls.';

-- Trigger para updated_at
create or replace function public.tg_bot_turns_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists trg_bot_turns_updated_at on public.bot_turns;
create trigger trg_bot_turns_updated_at
    before update on public.bot_turns
    for each row execute function public.tg_bot_turns_updated_at();

-- RLS
alter table public.bot_turns enable row level security;

drop policy if exists bot_turns_select on public.bot_turns;
create policy bot_turns_select on public.bot_turns
    for select using (
        public.is_master() or public.is_member_of(agency_id)
    );

drop policy if exists bot_turns_insert on public.bot_turns;
create policy bot_turns_insert on public.bot_turns
    for insert with check (
        public.is_master() or public.is_member_of(agency_id)
    );

drop policy if exists bot_turns_update on public.bot_turns;
create policy bot_turns_update on public.bot_turns
    for update using (
        public.is_master() or public.is_member_of(agency_id)
    );

-- service_role bypasses RLS automáticamente — bot-actions y n8n usan ese rol.

-- Función auxiliar: append a tools_invocadas SIN race (concurrent UPDATEs en mismo trace_id)
create or replace function public.bot_turns_append_tool_call(
    p_trace_id uuid,
    p_tool_entry jsonb
) returns void language plpgsql security definer
set search_path = public as $$
begin
    update public.bot_turns
       set tools_invocadas = tools_invocadas || jsonb_build_array(p_tool_entry),
           updated_at = now()
     where trace_id = p_trace_id;
end;
$$;

grant execute on function public.bot_turns_append_tool_call(uuid, jsonb) to service_role;

-- -----------------------------------------------------------------------------
-- 2. bot_action_dedupe — idempotency cache
-- -----------------------------------------------------------------------------
create table if not exists public.bot_action_dedupe (
    id              uuid primary key default gen_random_uuid(),
    trace_id        uuid not null,
    tool            text not null,
    params_hash     text not null,
    response_body   jsonb not null,
    response_status int not null,
    created_at      timestamptz not null default now(),
    constraint bot_action_dedupe_uniq unique (trace_id, tool, params_hash)
);

create index if not exists idx_bot_action_dedupe_created
    on public.bot_action_dedupe(created_at);
create index if not exists idx_bot_action_dedupe_trace
    on public.bot_action_dedupe(trace_id, tool);

comment on table public.bot_action_dedupe is
    'Idempotency cache para bot-actions edge function. TTL lógico 15 min (en la query del check), TTL físico 24h (cron de limpieza). Spec F5 §3.5.';

alter table public.bot_action_dedupe enable row level security;

-- service_role only: ningún usuario humano debería leer esta tabla.
drop policy if exists bot_action_dedupe_service_only on public.bot_action_dedupe;
create policy bot_action_dedupe_service_only on public.bot_action_dedupe
    for all using (false);  -- nadie except service_role (que bypasea RLS).

-- Cron de limpieza (TTL físico 24h)
-- Requiere pg_cron extension. Si no está, agregar:
-- create extension if not exists pg_cron;
do $$
begin
    if exists (select 1 from pg_extension where extname = 'pg_cron') then
        -- Schedule cleanup at 04:00 UTC every day
        perform cron.schedule(
            'bot-action-dedupe-cleanup',
            '0 4 * * *',
            $cron$delete from public.bot_action_dedupe where created_at < now() - interval '24 hours';$cron$
        );
    else
        raise notice 'pg_cron extension not installed — manual cleanup of bot_action_dedupe required (DELETE WHERE created_at < now() - interval ''24 hours'')';
    end if;
end$$;

-- -----------------------------------------------------------------------------
-- 3. eval_runs — 1 fila por corrida del harness
-- -----------------------------------------------------------------------------
create table if not exists public.eval_runs (
    id                  uuid primary key default gen_random_uuid(),
    label               text,
    arch                text not null,
    workflow_id_target  text not null,
    golden_set_version  text not null,
    golden_set_total    int not null default 0,
    pass_count          int not null default 0,
    partial_count       int not null default 0,
    fail_count          int not null default 0,
    p50_ms              int,
    p95_ms              int,
    p99_ms              int,
    total_tokens_in     bigint not null default 0,
    total_tokens_out    bigint not null default 0,
    total_tokens_cached bigint not null default 0,
    total_cost_usd      numeric(10, 4) not null default 0,
    status              text not null default 'running',
    started_at          timestamptz not null default now(),
    finished_at         timestamptz,
    notes               text,
    constraint eval_runs_status_chk check (status in ('running','done','failed','cancelled')),
    constraint eval_runs_arch_chk check (arch in ('A','C','eval-A','eval-C'))
);

create index if not exists idx_eval_runs_started on public.eval_runs(started_at desc);

comment on table public.eval_runs is
    'Resumen de cada ejecución del eval-harness sobre el golden set. 1 fila = 1 corrida. Spec F5 §3.2.';

alter table public.eval_runs enable row level security;
drop policy if exists eval_runs_master_only on public.eval_runs;
create policy eval_runs_master_only on public.eval_runs
    for all using (public.is_master());

-- -----------------------------------------------------------------------------
-- 4. eval_run_turns — 1 fila por turno evaluado
-- -----------------------------------------------------------------------------
create table if not exists public.eval_run_turns (
    id                          uuid primary key default gen_random_uuid(),
    run_id                      uuid not null references public.eval_runs(id) on delete cascade,
    turn_id_golden              text not null,
    category                    text,
    bot_turn_id                 uuid references public.bot_turns(id) on delete set null,
    status                      text not null,
    expected_tools              jsonb not null default '[]'::jsonb,
    actual_tools                jsonb not null default '[]'::jsonb,
    accuracy_score              numeric(4, 3),
    latency_ms                  int,
    tokens_in                   int,
    tokens_out                  int,
    tokens_cached               int,
    fail_reasons                jsonb,
    bot_response                text,
    created_at                  timestamptz not null default now(),
    constraint eval_run_turns_status_chk check (status in ('pass','partial','fail','error'))
);

create index if not exists idx_eval_run_turns_run on public.eval_run_turns(run_id);
create index if not exists idx_eval_run_turns_status on public.eval_run_turns(run_id, status);

comment on table public.eval_run_turns is
    'Detalle por turno de una corrida del harness. Linkea bot_turn_id para drill-down al audit log. Spec F5.';

alter table public.eval_run_turns enable row level security;
drop policy if exists eval_run_turns_master_only on public.eval_run_turns;
create policy eval_run_turns_master_only on public.eval_run_turns
    for all using (public.is_master());

-- -----------------------------------------------------------------------------
-- Notas para el operator
-- -----------------------------------------------------------------------------
-- - is_member_of(agency_id) y is_master() ya existen desde 0006_rls.sql.
-- - pg_cron puede no estar habilitado en algunos planes Supabase. Verificar con
--   SELECT * FROM pg_extension WHERE extname = 'pg_cron'. Si no, ejecutar
--   manualmente el DELETE diario o agregarlo como una edge function programada.
-- - El secret_role de Supabase bypasea RLS, así que bot-actions edge function y
--   n8n (via service_role) pueden escribir libremente. Los humanos del CRM ven
--   bot_turns solo de sus agencies; eval_* solo si son master.
```

---

## 5. Cambios en `bot-actions` edge function — v0.2.0 → v0.3.0

### 5.1 Archivos que cambian

- `crm-v2/supabase/functions/bot-actions/index.ts` (modificación in-place, bump FN_VERSION).
- NO se crean archivos nuevos en `supabase/functions/`.

### 5.2 Constantes y helpers nuevos (al tope del archivo, debajo de los imports actuales)

```typescript
// F5 Foundation — idempotency + audit log
const FN_VERSION = "0.3.0";   // ← bumpear (era 0.2.0)
const IDEMPOTENCY_WINDOW_MIN = 15;  // ventana lógica de hit

// Operations idempotentes (las 7 actuales). conversation.pause_until NO va
// porque es server-to-server desde n8n, no se retrye automáticamente.
const IDEMPOTENT_OPERATIONS = new Set<string>([
  "extractor.write",
  "stage.set",
  "qualify.set",
  "assign.set",
  "tag.add",
  "note.write",
  "handoff.escalate",
]);

// Operations que NO requieren toggle gate ni cross-tenant guard (sistémicas)
const SYSTEMIC_OPERATIONS = new Set<string>([
  "conversation.pause_until",
  "audit.write_turn",  // ← NUEVA
]);

// Canonical JSON (claves ordenadas) para hashing stable de params.
function canonicalJSON(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + (value as unknown[]).map(canonicalJSON).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return "{" + keys.map(k => JSON.stringify(k) + ":" + canonicalJSON(obj[k])).join(",") + "}";
}

async function sha256Hex(s: string): Promise<string> {
  const data = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function paramsHash(params: unknown): Promise<string> {
  return await sha256Hex(canonicalJSON(params));
}
```

### 5.3 Wrapper de idempotencia (función nueva)

Se ejecuta DESPUÉS de la validación de envelope + auth + cross-tenant + gate de toggle, JUSTO ANTES de invocar el handler concreto.

```typescript
type IdempotencyCheckResult =
  | { hit: true; cached_body: unknown; cached_status: number }
  | { hit: false; hash: string };

async function checkIdempotency(
  sb: SupabaseClient,
  trace_id: string | null,
  tool: string,
  params: unknown,
): Promise<IdempotencyCheckResult> {
  if (!trace_id || !IDEMPOTENT_OPERATIONS.has(tool)) {
    return { hit: false, hash: "" };  // skip dedupe
  }

  const hash = await paramsHash(params);
  const windowStart = new Date(Date.now() - IDEMPOTENCY_WINDOW_MIN * 60_000).toISOString();

  const { data: existing, error } = await sb
    .from("bot_action_dedupe")
    .select("response_body, response_status, created_at")
    .eq("trace_id", trace_id)
    .eq("tool", tool)
    .eq("params_hash", hash)
    .gt("created_at", windowStart)
    .maybeSingle();

  if (error) {
    console.warn("idempotency check failed (non-fatal):", { trace_id, tool, error: error.message });
    return { hit: false, hash };
  }
  if (existing) {
    return {
      hit: true,
      cached_body: existing.response_body,
      cached_status: existing.response_status,
    };
  }
  return { hit: false, hash };
}

async function persistIdempotencyEntry(
  sb: SupabaseClient,
  trace_id: string | null,
  tool: string,
  hash: string,
  response_body: unknown,
  response_status: number,
): Promise<void> {
  if (!trace_id || !hash) return;
  const { error } = await sb
    .from("bot_action_dedupe")
    .upsert(
      { trace_id, tool, params_hash: hash, response_body, response_status },
      { onConflict: "trace_id,tool,params_hash", ignoreDuplicates: true },
    );
  if (error) {
    console.warn("idempotency persist failed (non-fatal):", { trace_id, tool, error: error.message });
  }
}
```

### 5.4 Integración al router principal (modificación del switch)

Modificar la función `Deno.serve(...)` para insertar:

1. **Extraer `trace_id` del envelope.** Después de parsear el body:
   ```typescript
   const trace_id = typeof body.trace_id === "string" ? body.trace_id : null;
   // ... resto de validaciones ...
   ```

2. **Check idempotencia ANTES del switch.** Inmediatamente antes del `switch (operation)`:
   ```typescript
   // F5: idempotency check
   const idem = await checkIdempotency(supabase, trace_id, operation, params);
   if (idem.hit) {
     // Marcar la respuesta con idempotent_replay para que el caller sepa.
     const body = (idem.cached_body && typeof idem.cached_body === "object")
       ? { ...(idem.cached_body as Record<string, unknown>), idempotent_replay: true }
       : { ok: true, idempotent_replay: true };
     return jsonResponse(body, idem.cached_status);
   }
   ```

3. **Capturar response del handler, persistir hash.** Cambiar el `return await handle*(...)` a:
   ```typescript
   // Pattern para cada case:
   case "stage.set": {
     const resp = await handleStageSet(supabase, params as StageSetParams, ctx);
     const body = await resp.clone().json();
     await persistIdempotencyEntry(supabase, trace_id, operation, idem.hash, body, resp.status);
     return resp;
   }
   ```

   Esto se repite para los 7 handlers idempotentes. El builder debe NO romper el flow de `extractor.write` (que tiene su propia lógica skip-by-flag dentro del handler — el wrap externo SOLO captura la respuesta final).

4. **Caso especial `conversation.pause_until` y `audit.write_turn`:** NO van por el wrap idempotente. El switch las maneja directo sin persistir hash.

### 5.5 Handler nuevo: `audit.write_turn`

```typescript
type AuditWriteTurnParams = {
  trace_id?: unknown;
  patch?: unknown;
};

async function handleAuditWriteTurn(
  sb: SupabaseClient,
  params: AuditWriteTurnParams,
  _ctx: OperationContext,
): Promise<Response> {
  const trace_id = typeof params.trace_id === "string" ? params.trace_id.trim() : "";
  if (!trace_id) {
    return jsonResponse({ ok: false, error: "missing_trace_id" }, 400);
  }
  const patch = (params.patch && typeof params.patch === "object")
    ? params.patch as Record<string, unknown>
    : {};

  // Lista blanca de columnas escribibles (defensa contra SQL injection vía
  // patch values arbitrarias y contra el LLM escribiendo a campos sensibles).
  const WRITABLE = new Set([
    "agency_id", "lead_id", "conversation_id",
    "finished_at", "arch", "model",
    "tokens_in", "tokens_out", "tokens_cached",
    "latency_total_ms", "latency_per_node",
    "system_prompt_hash", "system_prompt_excerpt",
    "tools_invocadas", "tools_no_invocadas_evaluables",
    "extractor_output_json", "schema_version_hash",
    "input_crudo", "output_crudo",
    "status", "error_msg", "metadata",
  ]);

  const filteredPatch: Record<string, unknown> = {};
  for (const k of Object.keys(patch)) {
    if (WRITABLE.has(k)) filteredPatch[k] = patch[k];
  }

  if (Object.keys(filteredPatch).length === 0) {
    return jsonResponse({ ok: true, skipped: [{ reason: "empty_patch" }] });
  }

  // UPSERT: si no existe la fila (caso ad-hoc), la creamos con datos mínimos.
  // En el flujo normal, n8n crea la fila al inicio del turno via INSERT directo
  // o via esta misma operation con patch={status:'running', started_at}.
  const { data: existing } = await sb
    .from("bot_turns")
    .select("id")
    .eq("trace_id", trace_id)
    .maybeSingle();

  if (existing) {
    const { error } = await sb
      .from("bot_turns")
      .update({ ...filteredPatch, updated_at: new Date().toISOString() })
      .eq("trace_id", trace_id);
    if (error) {
      console.error("audit.write_turn update failed:", error.message);
      return jsonResponse({ ok: false, error: "db_error", detail: error.message });
    }
  } else {
    // Insert con trace_id; arch default 'A'.
    const { error } = await sb
      .from("bot_turns")
      .insert({ trace_id, ...filteredPatch });
    if (error) {
      console.error("audit.write_turn insert failed:", error.message);
      return jsonResponse({ ok: false, error: "db_error", detail: error.message });
    }
  }

  console.log({ event: "audit.write_turn", trace_id, fields: Object.keys(filteredPatch) });
  return jsonResponse({ ok: true, trace_id });
}
```

**Caso especial cross-tenant:** `audit.write_turn` puede recibir el envelope sin `lead_id`/`conversation_id` (en los Code Nodes iniciales del workflow todavía no se resolvieron). El builder DEBE eximir esta operation del cross-tenant guard. Pseudo:

```typescript
// En el router, antes del cross-tenant guard:
if (operation !== "audit.write_turn") {
  // ... cross-tenant guard actual ...
}
```

### 5.6 Append a `tools_invocadas` desde cada handler

Cada handler (stage.set, qualify.set, ...) debe llamar a la función SQL `bot_turns_append_tool_call(trace_id, jsonb)` al final con el resumen de qué hizo. Pseudo agregado al final de cada handler:

```typescript
// Pegar al final de cada handler (post-UPDATE/INSERT/etc., antes del return)
if (trace_id) {
  const toolEntry = {
    tool: operation,
    params,
    response_status: 200,
    response_summary: { updated: ..., skipped: ..., warnings: ... }, // según handler
    invoked_at: new Date().toISOString(),
  };
  await sb.rpc("bot_turns_append_tool_call", {
    p_trace_id: trace_id,
    p_tool_entry: toolEntry,
  });
}
```

**Cómo pasar `trace_id` al handler:** modificar la signature de cada handler para aceptar `trace_id: string | null` como parámetro extra (o agregar a `OperationContext`). Recomendado: agregar a `OperationContext`:

```typescript
type OperationContext = {
  agency_id: string;
  lead_id: string;
  conversation_id: string | null;
  trace_id: string | null;   // ← NUEVO
};
```

Y en el router, pasar `trace_id` al armar el `ctx`.

---

## 6. Cambios en N8N — workflow `eval-harness-v1` (NUEVO)

Workflow separado, NO toca producción. Inactivo por default. Se activa cuando se va a correr el set y se desactiva al terminar.

### 6.1 Metadata

- **Name:** `eval-harness-v1`
- **active:** `false`
- **versionId:** generado fresco
- **tags:** `eval`, `foundation`

### 6.2 Nodos

Total esperado: ~12 nodos. Diseño determinístico, sin LLM dentro del harness.

| # | Nodo | Type | typeVersion | Posición | Parámetros clave |
|---|---|---|---|---|---|
| 1 | `Webhook Eval` | `n8n-nodes-base.webhook` | 2 | x=0, y=0 | path=`eval-runner`, method=POST, response=lastNode. Recibe `{ turn_id, agency_fixture, lead_fixture, conversation_history_summary, lead_msg, expected_tools, run_id }`. |
| 2 | `Validate Input` | `n8n-nodes-base.code` | 2 | x=200, y=0 | jsCode: validar que llegaron los campos requeridos del payload. Si falta algo → throw (responde 400). Genera `trace_id = crypto.randomUUID()`. |
| 3 | `Get Workflow Target` | `n8n-nodes-base.set` | 3.4 | x=400, y=0 | Lee env var `EVAL_TARGET_WEBHOOK_URL` (apunta al webhook test del workflow target — `bot-v6-v2` o futuro `bot-v6-c`). |
| 4 | `Forge Synthetic Payload` | `n8n-nodes-base.code` | 2 | x=600, y=0 | jsCode: arma un payload YCloud-shaped a partir del `lead_msg + agency_fixture + lead_fixture`. Estructura: `{ type:'message.received', wamId:'<sintético>', phone:'<lead_fixture.phone>', body:'<lead_msg>', businessPhone:'<agency_fixture.business_phone>' }`. Inyecta `trace_id` y `__eval_synthetic:true`. |
| 5 | `Dispatch to Target` | `n8n-nodes-base.httpRequest` | 4.2 | x=800, y=0 | POST a `EVAL_TARGET_WEBHOOK_URL` con el synthetic payload. Header `X-Eval-Run-Id: <run_id>`, `X-Eval-Trace-Id: <trace_id>`. Timeout 30s. |
| 6 | `Wait For Trace` | `n8n-nodes-base.wait` | 1.1 | x=1000, y=0 | Wait 8s (margen para que el target termine el turno y persista a `bot_turns`). |
| 7 | `Read Bot Turn` | `n8n-nodes-base.postgres` | 2.5 | x=1200, y=0 | `SELECT * FROM bot_turns WHERE trace_id = '{{ $('Validate Input').first().json.trace_id }}'`. |
| 8 | `Compute Accuracy` | `n8n-nodes-base.code` | 2 | x=1400, y=0 | jsCode: compara `expected_tools` (del input) con `tools_invocadas` (de bot_turns). Computa: status (pass/partial/fail/error), accuracy_score (0.0-1.0), fail_reasons (array de strings). Detalle del scoring §6.3. |
| 9 | `Insert Run Turn` | `n8n-nodes-base.postgres` | 2.5 | x=1600, y=0 | INSERT a `eval_run_turns` con `run_id, turn_id_golden, category, bot_turn_id, status, expected_tools, actual_tools, accuracy_score, latency_ms, tokens_in, tokens_out, tokens_cached, fail_reasons, bot_response`. |
| 10 | `Respond With Result` | `n8n-nodes-base.respondToWebhook` | 1.1 | x=1800, y=0 | Devuelve al CLI runner: `{ trace_id, status, accuracy_score, fail_reasons, tokens, latency_ms }`. |
| 11 | `Handle Error` | `n8n-nodes-base.code` | 2 | x=1200, y=200 | conectado a error outputs de Dispatch/Read. Inserta `eval_run_turns` con `status='error'` + el error. |
| 12 | `Sticky - Harness` | `n8n-nodes-base.stickyNote` | 1 | x=0, y=-200 | Documentación inline: "F5 Harness v1. Inactivo por default. Activar antes de correr, desactivar al terminar. EVAL_TARGET_WEBHOOK_URL = webhook test del workflow target." |

### 6.3 Scoring del `Compute Accuracy` (lógica del jsCode)

```javascript
// Compute Accuracy — Eval Harness v1
// Compara expected_tools (del golden set) con tools_invocadas (de bot_turns).
//
// PASS:    todas las tools required del expected están en actual, con params_partial match.
// PARTIAL: todas las required están pero params parciales no matchean al 100%.
// FAIL:    falta alguna tool required, o sobra una tool no esperada con required=false.
// ERROR:   no se pudo leer bot_turns (timeout, crash, etc.).

const input = $('Validate Input').first().json;
const turn = $('Read Bot Turn').first()?.json ?? null;

if (!turn) {
  return [{ json: {
    status: 'error',
    fail_reasons: ['bot_turn_not_found_after_8s_wait'],
    accuracy_score: 0,
  }}];
}

const expected = Array.isArray(input.expected_tools) ? input.expected_tools : [];
const actual = Array.isArray(turn.tools_invocadas) ? turn.tools_invocadas : [];

const required = expected.filter(e => e.required === true);
const optional = expected.filter(e => e.required !== true);

const fail_reasons = [];
let matched_required = 0;
let partial_required = 0;

function paramsPartialMatch(expectedPartial, actualParams) {
  // Match shallow + value_contains support
  if (!expectedPartial || typeof expectedPartial !== 'object') return true;
  if (!actualParams || typeof actualParams !== 'object') return false;
  for (const k of Object.keys(expectedPartial)) {
    const e = expectedPartial[k];
    const a = actualParams[k];
    if (Array.isArray(e)) {
      // ej: fields: [{ field_key, value_contains }]
      if (!Array.isArray(a)) return false;
      for (const eitem of e) {
        const found = a.find(aitem => {
          if (eitem.field_key && aitem.field_key !== eitem.field_key) return false;
          if (eitem.value_contains && String(aitem.value || '').toLowerCase().indexOf(String(eitem.value_contains).toLowerCase()) === -1) return false;
          return true;
        });
        if (!found) return false;
      }
    } else if (typeof e === 'object') {
      if (!paramsPartialMatch(e, a)) return false;
    } else {
      if (e !== a) return false;
    }
  }
  return true;
}

for (const req of required) {
  const found = actual.find(a => a.tool === req.tool);
  if (!found) {
    fail_reasons.push(`required_tool_not_invoked:${req.tool}`);
    continue;
  }
  if (paramsPartialMatch(req.params_partial, found.params)) {
    matched_required++;
  } else {
    partial_required++;
    fail_reasons.push(`required_tool_partial_params:${req.tool}`);
  }
}

// Tools invocadas que no estaban en expected — solo fail si TODAS las invocadas son
// off-topic (sugiere LLM disparó tools sin sentido). Permisivo: si invoca 1 extra
// pero matchea todas las required, sigue siendo pass.
const expectedToolNames = new Set(expected.map(e => e.tool));
const extras = actual.filter(a => !expectedToolNames.has(a.tool));
if (extras.length > 0) {
  fail_reasons.push(`extra_tools_invoked:${extras.map(e => e.tool).join(',')}`);
}

let status;
if (matched_required === required.length && extras.length === 0) {
  status = 'pass';
} else if (matched_required + partial_required === required.length && extras.length <= 1) {
  status = 'partial';
} else {
  status = 'fail';
}

const accuracy_score = required.length > 0
  ? (matched_required + 0.5 * partial_required) / required.length
  : (status === 'pass' ? 1.0 : 0.0);

return [{ json: {
  status,
  accuracy_score: Math.round(accuracy_score * 1000) / 1000,
  fail_reasons,
  actual_tools: actual,
  latency_ms: turn.latency_total_ms || 0,
  tokens_in: turn.tokens_in || 0,
  tokens_out: turn.tokens_out || 0,
  tokens_cached: turn.tokens_cached || 0,
  bot_turn_id: turn.id,
  bot_response: turn.output_crudo || null,
}}];
```

### 6.4 Conexiones del harness

```
Webhook Eval → Validate Input → Get Workflow Target → Forge Synthetic Payload
    → Dispatch to Target → Wait For Trace → Read Bot Turn → Compute Accuracy
    → Insert Run Turn → Respond With Result

Dispatch to Target (error) → Handle Error → (no continuation; webhook responds via mainline)
Read Bot Turn (error) → Handle Error
```

### 6.5 Variables de entorno requeridas para el harness

- `EVAL_TARGET_WEBHOOK_URL` — URL del webhook del workflow target. Para A, apunta al webhook test del `bot-v6-v2`. Para C en el futuro, apunta al webhook test de `bot-v6-c`. Configurada en N8N env vars.

---

## 7. Cambios en N8N — workflow Sofia v6 v1 → v2 (modificaciones aditivas)

**Importante:** F5 NO cambia la arquitectura del bot. Los 5 Code Nodes nuevos son **observers** que escriben a `bot_turns` SIN alterar el flujo principal. Si todos fallan, el bot sigue funcionando idéntico — solo perderíamos el audit log.

### 7.1 Nodos a CREAR en `bot-v6-v2`

| # | Nombre | Type | typeVersion | Posición aprox. | Propósito |
|---|---|---|---|---|---|
| 1 | `Crear Trace de Turno` | `n8n-nodes-base.code` | 2 | x=-3400, y=600 (entre `ID y Mensaje` y `Buscar Lead (Supabase)`) | Genera `trace_id = crypto.randomUUID()`. Inserta fila inicial en `bot_turns` con `trace_id, started_at, status='running', input_crudo`. Try/catch silencioso. Propaga el `trace_id` como JSON field en el item. |
| 2 | `Enriquecer Trace con IDs` | `n8n-nodes-base.code` | 2 | x=-2950, y=750 (después de `Get Conversation State`) | UPDATE `bot_turns` con `agency_id, lead_id, conversation_id`. Try/catch silencioso. |
| 3 | `Capturar Prompt Hash` | `n8n-nodes-base.code` | 2 | x=-2300, y=400 (justo después de `Componer System Prompt`) | UPDATE `bot_turns` con `system_prompt_hash = sha256(system_prompt)`, `system_prompt_excerpt = first 500 chars`, `model` (del config del agent). Try/catch silencioso. |
| 4 | `Cerrar Trace de Turno` | `n8n-nodes-base.code` | 2 | x=-1600, y=400 (después del `Agente Principal - Sofia` y antes de `Formateador de Mensajes`) | UPDATE `bot_turns` con `finished_at, status='done', tokens_in, tokens_out, tokens_cached, latency_total_ms, latency_per_node (jsonb computado), output_crudo`. Try/catch silencioso. |
| 5 | `Trace Failure Handler` | `n8n-nodes-base.code` | 2 | x=-1600, y=900 (conectado a error outputs del agente y de Apify) | UPDATE `bot_turns` con `status='failed', error_msg, finished_at`. |

### 7.2 jsCode de cada Code Node (esqueleto)

**Crear Trace de Turno:**

```javascript
// F5 — Crear trace de turno. Genera trace_id, escribe row inicial a bot_turns.
// SAFE: try/catch silencioso. Si esto falla, el bot sigue normal.

const trace_id = crypto.randomUUID();
const started_at = new Date().toISOString();
const input_raw = $('ID y Mensaje').first().json.Mensaje || '';

const payload = {
  trace_id,
  started_at,
  status: 'running',
  arch: 'A',
  input_crudo: input_raw.slice(0, 4000),  // cap defensivo
  metadata: {
    webhook_event: $('Extract Variables').first().json.eventType || null,
    ycloud_message_id: $('Extract Variables').first().json.ycloudMessageId || null,
    user_phone: $('Extract Variables').first().json.userPhone || null,
    is_eval_synthetic: $('Webhook - YCloud Inbound').first().json.__eval_synthetic === true,
  },
};

try {
  // Invocar bot-actions audit.write_turn (insert si no existe)
  const url = $env.SUPABASE_V2_URL + '/functions/v1/bot-actions';
  const body = {
    operation: 'audit.write_turn',
    agency_id: '00000000-0000-0000-0000-000000000000',  // placeholder antes de Resolve Agency
    lead_id: '00000000-0000-0000-0000-000000000000',     // placeholder
    trace_id,
    params: { trace_id, patch: payload },
  };

  await $helpers.httpRequest({
    method: 'POST',
    url,
    headers: {
      'Authorization': `Bearer ${$env.BOT_ACTIONS_SECRET}`,
      'Content-Type': 'application/json',
    },
    body,
    json: true,
    timeout: 3000,  // no bloquear el bot por audit log
  });
} catch (err) {
  console.warn('[F5] Crear Trace de Turno failed (non-fatal):', err.message);
}

// Propagar trace_id + node_start_time para mediciones de latencia.
const item = items[0];
item.json.__trace_id = trace_id;
item.json.__trace_node_starts = { 'Crear Trace de Turno': Date.now() };
return [item];
```

**Enriquecer Trace con IDs:**

```javascript
const trace_id = $input.first().json.__trace_id;
if (!trace_id) return $input.all();  // sin trace, no-op

const agency_id = $('Resolve Agency').first().json.agency_id || null;
const lead_id = $('Buscar Lead (Supabase)').first().json.id || null;
const conversation_id = $('Get Conversation State').first().json.id || null;

try {
  await $helpers.httpRequest({
    method: 'POST',
    url: $env.SUPABASE_V2_URL + '/functions/v1/bot-actions',
    headers: {
      'Authorization': `Bearer ${$env.BOT_ACTIONS_SECRET}`,
      'Content-Type': 'application/json',
    },
    body: {
      operation: 'audit.write_turn',
      agency_id: agency_id || '00000000-0000-0000-0000-000000000000',
      lead_id: lead_id || '00000000-0000-0000-0000-000000000000',
      trace_id,
      params: {
        trace_id,
        patch: { agency_id, lead_id, conversation_id },
      },
    },
    json: true,
    timeout: 3000,
  });
} catch (err) {
  console.warn('[F5] Enriquecer Trace failed (non-fatal):', err.message);
}

return $input.all();
```

**Capturar Prompt Hash:** análogo, computa sha256 del `system_prompt` del nodo anterior y hace UPDATE.

**Cerrar Trace de Turno:** análogo, lee el output del agente, computa tokens (vienen en el `usage` field del response del LangChain Agent), calcula latencias por nodo restando timestamps acumulados en `__trace_node_starts`, hace UPDATE con `status='done'`.

**Trace Failure Handler:** captura error, UPDATE con `status='failed', error_msg`.

### 7.3 Conexiones nuevas en `bot-v6-v2`

- `ID y Mensaje` (main) → `Crear Trace de Turno` (main) → conexión existente `Buscar Lead (Supabase)`.
  - **Borrar:** `ID y Mensaje` → `Buscar Lead (Supabase)` (la directa).
  - **Crear:** `ID y Mensaje` → `Crear Trace de Turno` → `Buscar Lead (Supabase)`.
- `Get Conversation State` (main) → `Enriquecer Trace con IDs` (main) → conexión existente `Chatbot Activado?`.
  - **Borrar:** `Get Conversation State` → `Chatbot Activado?` (directa).
  - **Crear:** `Get Conversation State` → `Enriquecer Trace con IDs` → `Chatbot Activado?`.
- `Componer System Prompt` (main) → `Capturar Prompt Hash` (main) → `Agente Principal - Sofia`.
  - **Borrar:** `Componer System Prompt` → `Agente Principal - Sofia` (directa).
  - **Crear:** `Componer System Prompt` → `Capturar Prompt Hash` → `Agente Principal - Sofia`.
- `Agente Principal - Sofia` (main) → `Cerrar Trace de Turno` (main) → `Formateador de Mensajes`.
  - **Borrar:** `Agente Principal - Sofia` → `Formateador de Mensajes` (directa).
  - **Crear:** `Agente Principal - Sofia` → `Cerrar Trace de Turno` → `Formateador de Mensajes`.
- `Agente Principal - Sofia` (error output, si existe) → `Trace Failure Handler`. Si N8N no expone error output del agent, conectar via on_failure setting del nodo.

### 7.4 Modificación a `Componer System Prompt` (R4 — caching)

El jsCode actual concatena bloques en `system_prompt`. R4 los reorganiza para:

1. Sacar `[CONTEXTO DEL LEAD]` y `[DATOS YA CAPTURADOS]` del array `blocks` que produce el `system_prompt`.
2. Producir DOS strings ahora:
   - `system_prompt` (estático por agency, sin contexto dinámico).
   - `user_message_prefix` (los bloques dinámicos).
3. El nodo devuelve ambos: `return [{ json: { system_prompt, user_message_prefix } }];`.

Y el `Agente Principal - Sofia` cambia:
- `systemMessage` queda igual: `={{ $('Componer System Prompt').first().json.system_prompt }}`.
- `text` (el user message) cambia de:
  ```
  ={{ $('Variables').first().json['Mensaje actual del usuario'] }}
  ```
  a:
  ```
  ={{ $('Componer System Prompt').first().json.user_message_prefix }}{{ $('Variables').first().json['Mensaje actual del usuario'] }}
  ```

**Pseudo del cambio al jsCode:**

```javascript
// ANTES (resumen):
// blocks.push(buildContextoLead());
// blocks.push(buildDatosYaCapturados());
// blocks.push(blockD_rules);
// return [{ json: { system_prompt: blocks.join('\n\n') } }];

// DESPUÉS:
const staticBlocks = [];  // bloques que entran a system_prompt
const dynamicBlocks = []; // bloques que entran a user_message_prefix

staticBlocks.push(blockA_core);
staticBlocks.push(...blocksB_botConfig);
staticBlocks.push(...blocksC_modules);
staticBlocks.push(blockDatosACapturar);
staticBlocks.push(blockAutoAcciones);  // F4
staticBlocks.push(blockHorarioAtencion);  // F4
staticBlocks.push(blockD_rules);

dynamicBlocks.push('[CONTEXTO DEL LEAD]');
dynamicBlocks.push(buildContextoLead());  // stage, attributes, msg_count
dynamicBlocks.push('[FIN DE CONTEXTO]');
dynamicBlocks.push('');
dynamicBlocks.push('[DATOS YA CAPTURADOS]');
dynamicBlocks.push(buildDatosYaCapturados());  // lista
dynamicBlocks.push('[FIN DE DATOS]');
dynamicBlocks.push('');
dynamicBlocks.push('[MENSAJE DEL LEAD]');

return [{ json: {
  system_prompt: staticBlocks.join('\n\n'),
  user_message_prefix: dynamicBlocks.join('\n'),
}}];
```

El builder verifica que `system_prompt` final tenga >1024 tokens (estimar como `length/4`). Si no, expandir el bloque A core hasta superar.

### 7.5 Trace_id propagation desde las tools al edge function

Cada `toolHttpRequest` de las 8 tools necesita pasar `trace_id` en el envelope. Modificación al jsonBody de cada tool:

```json
{
  "operation": "stage.set",
  "trace_id": "={{ $('Crear Trace de Turno').first().json.__trace_id }}",
  "agency_id": "={{ $('Resolve Agency').first().json.agency_id }}",
  "lead_id": "={{ $('Buscar Lead (Supabase)').first().json.id }}",
  "conversation_id": "={{ $('Get Conversation State').first().json.id }}",
  "params": { ... }
}
```

**Esto es CRÍTICO** — sin `trace_id` en el envelope, el edge function no puede appendear a `tools_invocadas` ni hacer dedupe. El builder agrega `trace_id` a las 8 tools (las 7 del LLM + el HTTP node `Pausar Bot Hasta Hora Hábil` de F4).

---

## 8. Scripts nuevos

### 8.1 `crm-v2/scripts/build-eval-harness-v1.js`

Genera el workflow `eval-harness-v1.json` desde un esqueleto en blanco. **NO** parte de un workflow previo (es nuevo). Output: `crm-v2/n8n/workflows/eval-harness-v1.json`.

Modelo a seguir: `build-bot-v6-v1.js` (estructura del header, helpers, smoke tests). Estructura interna:

```javascript
/**
 * build-eval-harness-v1.js
 *
 * Genera el workflow `eval-harness-v1` desde cero (no hay v0). Inactivo por default.
 *
 * Uso: node scripts/build-eval-harness-v1.js
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const OUT_PATH = path.join(ROOT, 'n8n', 'workflows', 'eval-harness-v1.json');

function main() {
  const wf = {
    name: 'eval-harness-v1',
    nodes: [
      // 12 nodos según §6.2
    ],
    connections: {
      // según §6.4
    },
    settings: { executionOrder: 'v1', timezone: 'UTC' },
    versionId: crypto.randomUUID(),
    active: false,
    tags: [{ name: 'eval' }, { name: 'foundation' }],
  };

  // smoke tests
  if (wf.nodes.length < 12) throw new Error('expected at least 12 nodes');
  // ... más checks

  fs.writeFileSync(OUT_PATH, JSON.stringify(wf, null, 2) + '\n', 'utf8');
  console.log('[ok]', OUT_PATH);
}

main();
```

### 8.2 `crm-v2/scripts/build-bot-v6-v2.js`

Lee `bot-v6-v1.json`, aplica los cambios de §7 (crear 5 Code Nodes nuevos + modificar conexiones + modificar Componer System Prompt + agregar trace_id a las 8 tools), escribe `bot-v6-v2.json`. Estructura idéntica a `build-bot-v6-v1.js`. Output: `crm-v2/n8n/workflows/chatbot-momentum-bot-v6-v2.json`.

### 8.3 `crm-v2/scripts/seed-golden-set.js`

Genera `crm-v2/eval/golden-set/v1.jsonl` + los 3 fixtures de agencies/leads sintéticos. Lee de Supabase v2 los 20 turnos reales (SELECT de `messages` + `extractor_field_values`) y los etiqueta interactivamente (prompt al founder para validar cada etiqueta). Los 60 sintéticos los genera Claude vía script (instrucción literal con la tabla de distribución del §3.1).

```javascript
/**
 * seed-golden-set.js
 *
 * Construye crm-v2/eval/golden-set/v1.jsonl desde:
 *   - 20 turnos reales del v2 Supabase (filtra messages + extractor_field_values
 *     correlacionables, etiqueta interactivamente con prompt al founder).
 *   - 60 turnos sintéticos generados con plantillas por categoría.
 *
 * Idempotente: corre dos veces, mismo output (commit hashes en metadata).
 *
 * Uso: node scripts/seed-golden-set.js
 */
```

### 8.4 `crm-v2/scripts/eval-runner.mjs`

CLI wrapper que dispara el harness. Lee el jsonl, hace POST por cada turno al webhook del harness, agrega resultados, crea fila en `eval_runs`, imprime tabla resumen.

```javascript
#!/usr/bin/env node
/**
 * eval-runner.mjs
 *
 * CLI wrapper para el harness eval-harness-v1.
 *
 * Uso: node scripts/eval-runner.mjs --arch=A --workflow-id=p3h7tx6UiGBQ9Tzb \
 *        --golden-set=crm-v2/eval/golden-set/v1.jsonl --label="A baseline"
 *
 * Output: tabla resumen a stdout + fila en eval_runs + N filas en eval_run_turns.
 */

import fs from 'node:fs/promises';
import readline from 'node:readline';
import { createReadStream } from 'node:fs';
import crypto from 'node:crypto';
// ... fetch al harness webhook, persistencia, agregación.
```

---

## 9. Plan de deploy paso a paso

**Orden importa.** Cada paso depende del anterior.

1. **Migración SQL primero.**
   ```sql
   -- Aplicar 0015_bot_observability.sql en v2 vía Management API
   POST /v1/projects/fahujscodhqlopycorzn/database/query
   { query: <contenido de 0015_bot_observability.sql> }
   ```
   - Verificar: `SELECT * FROM bot_turns LIMIT 1; SELECT * FROM bot_action_dedupe LIMIT 1; SELECT * FROM eval_runs LIMIT 1; SELECT * FROM eval_run_turns LIMIT 1;` → todas devuelven 0 rows sin error.
   - Verificar pg_cron schedule existente: `SELECT * FROM cron.job WHERE jobname = 'bot-action-dedupe-cleanup';`. Si NO existe (porque pg_cron no está habilitado), agregar tarea al runbook.

2. **Deploy bot-actions v0.3.0.**
   - `POST /v1/projects/fahujscodhqlopycorzn/functions/deploy?slug=bot-actions` (multipart con metadata + file). Recordatorio: **multipart, NO JSON body** (regla operativa 2026-05-29).
   - Health check: `curl https://fahujscodhqlopycorzn.supabase.co/functions/v1/bot-actions` → `{status:'ok', version:'0.3.0', secret_configured:true}`.
   - Smoke: curl con `audit.write_turn` con trace_id fake → verificar row en `bot_turns`.

3. **Genera + commit golden set v1.**
   - `node crm-v2/scripts/seed-golden-set.js` → genera `crm-v2/eval/golden-set/v1.jsonl` + fixtures.
   - Founder revisa y aprueba la distribución.
   - `git add crm-v2/eval && git commit -m "feat(f5): golden set v1 (80 turnos labelados)"`.

4. **Build + push del harness `eval-harness-v1`.**
   - `node crm-v2/scripts/build-eval-harness-v1.js` → genera el JSON.
   - `node crm-v2/scripts/n8n-push.mjs eval-harness-v1.json` → POST a N8N (workflow nuevo, inactivo).
   - Setear env var en N8N: `EVAL_TARGET_WEBHOOK_URL = <test webhook URL del bot-v6-v2 una vez deployado>`.

5. **Build `bot-v6-v2` (modificaciones aditivas + R4).**
   - `node crm-v2/scripts/build-bot-v6-v2.js` → genera `chatbot-momentum-bot-v6-v2.json` desde `v1`.
   - **Validador:** `node crm-v2/scripts/validate-n8n-expressions.js n8n/workflows/chatbot-momentum-bot-v6-v2.json` → 0 violations.
   - **Snapshot del v1 vivo ANTES de PUT:** `node crm-v2/scripts/n8n-pull.mjs p3h7tx6UiGBQ9Tzb` → guarda en `snapshots/chatbot-momentum-bot-v6-v1-LIVE-2026-05-30.json`.
   - PUT al workflow id `p3h7tx6UiGBQ9Tzb` con `chatbot-momentum-bot-v6-v2.json`. **active permanece true** (el cambio es aditivo y safe). Pero el founder confirma activamente este paso (regla operativa: no auto-activar tras PUT sin OK explícito).

6. **Smoke tests post-deploy** (§10).

7. **Primera corrida del eval:**
   - Activar `eval-harness-v1` en N8N.
   - `node crm-v2/scripts/eval-runner.mjs --arch=A --workflow-id=p3h7tx6UiGBQ9Tzb --golden-set=crm-v2/eval/golden-set/v1.jsonl --label="A baseline post-F5 deploy"`.
   - Esperar 10 min. Revisar tabla stdout.
   - Desactivar `eval-harness-v1`.

8. **Commit + tag + PR:**
   - Branch: `feat/f5-foundation`.
   - Commits sugeridos:
     - `feat(supabase): migration 0015 bot observability tables`
     - `feat(bot-actions): v0.3.0 idempotency + audit.write_turn handler`
     - `feat(eval): golden set v1 + harness workflow + eval-runner CLI`
     - `feat(n8n): bot-v6-v2 with trace_id propagation + prompt caching`
   - PR a main. Tag tras merge: `bot-v6-F5-foundation-2026-05-30`.

---

## 10. Smoke tests post-deploy

| # | Test | Cómo | PASS |
|---|---|---|---|
| 1 | Healthcheck bot-actions v0.3.0 | `curl https://fahujscodhqlopycorzn.supabase.co/functions/v1/bot-actions` | `version:'0.3.0', secret_configured:true` |
| 2 | Migración 0015 aplicada | `SELECT count(*) FROM information_schema.tables WHERE table_name IN ('bot_turns','bot_action_dedupe','eval_runs','eval_run_turns')` | `4` |
| 3 | `audit.write_turn` insert | curl POST con `operation:'audit.write_turn'`, trace_id ad-hoc, patch={status:'running'} | `{ok:true, trace_id:'...'}` + row visible en `bot_turns` |
| 4 | `audit.write_turn` update | curl POST con mismo trace_id, patch={status:'done'} | `{ok:true}` + status='done' en la row |
| 5 | Idempotencia hit | curl POST con `tag.add` body idéntico 2 veces seguidas (mismo trace_id, mismo params) | 1er call: `{ok:true, added:[...]}`. 2do call: `{...added..., idempotent_replay:true}` |
| 6 | Idempotencia miss después de 16 min | esperar 16 min, repetir tag.add con mismos params | sin idempotent_replay (ejecutó de nuevo) |
| 7 | Mensaje real al bot demo (trace_id end-to-end) | Founder manda WhatsApp al número demo | Row en bot_turns con `status='done'`, `tools_invocadas` con al menos `Extractor_Tool_bot_actions` |
| 8 | Cached tokens > 0 en 2do turno | Mismo lead manda 2 mensajes seguidos al bot | Segunda row en bot_turns con `tokens_cached > 1024` |
| 9 | Harness end-to-end con 1 turno | `node eval-runner.mjs ... --golden-set=fixtures/single-turn-test.jsonl --label="smoke"` | Tabla stdout con 1 turno, status pass/partial/fail según expected |
| 10 | Failure case en bot_turns | Disparar un fallo intencional (env var BOT_ACTIONS_SECRET roto temporalmente) → mandar mensaje | Row en bot_turns con `status='failed', error_msg` no-NULL |
| 11 | Validator de expresiones | `node validate-n8n-expressions.js chatbot-momentum-bot-v6-v2.json` | 0 violations |
| 12 | Performance: no regresión de latencia | Comparar latencia p50 de 10 turnos pre-F5 vs 10 turnos post-F5 | `post-F5 - pre-F5 < 200ms` (los 4 Code Nodes nuevos suman ~50-150ms total) |

---

## 11. Casos edge y riesgos

### Riesgos (obligatorios mínimo 3)

1. **R1 CRÍTICO — R4 (mover bloques al user message) puede degradar la calidad del bot** (probabilidad MEDIA, impacto ALTO). El `[CONTEXTO DEL LEAD]` en el system_message tiene peso semántico distinto que en el user_message. El LLM puede interpretarlo como "este es el lead hablando" en lugar de "este es contexto operativo" → respuestas raras. **Mitigación:** (a) prefijos claros `[CONTEXTO DEL LEAD] ... [FIN DE CONTEXTO]` para que el LLM distinga; (b) NO mergear F5 sin correr el golden set ANTES del cambio (medir A actual) y DESPUÉS (medir A con R4) — el degradación máxima aceptable es 3% en accuracy global. Si baja más, rollback de R4 (mantener bloques en system_message → no hay cache pero el bot funciona como hoy). **Decisión:** founder + reviewer aprueban R4 con esta verificación; si no convence, R4 se pospone a F6 y F5 deploya sin R4.

2. **Code Node de F5 timea-out por edge function lento o bot-actions caído** (probabilidad BAJA, impacto MEDIO). Los 4 Code Nodes nuevos hacen HTTP a bot-actions con timeout 3s. Si bot-actions tarda más → el Code Node tira excepción → captura el catch silencioso → log warn → return $input.all() → bot sigue. **Mitigación:** ya está en el código (try/catch en cada Code Node). Verificable en test 10. **Riesgo residual:** si bot-actions está caído por minutos, las 4 calls de un turno tardan 4×3s = 12s extra. Si el founder ve respuestas lentas en producción, verifica `supabase functions logs bot-actions` para latencia.

3. **trace_id se pierde mid-flight por bug del propagator** (probabilidad MEDIA, impacto BAJO). Si un Code Node devuelve `[{json: {...}}]` sin propagar `__trace_id`, los siguientes lo pierden. **Mitigación:** los Code Nodes nuevos SIEMPRE hacen `item.json.__trace_id = trace_id; return [item];`. Cubrir con test específico: validador secundario que verifica `__trace_id` presente en cada item al final del flujo (agregar al validador de expresiones).

4. **`bot_turns_append_tool_call` race condition con concurrent UPDATEs** (probabilidad BAJA, impacto BAJO). Si dos tools del agente corren en paralelo (LangChain Agent puede hacer multi-tool calls), ambas hacen UPDATE de `tools_invocadas`. Postgres aísla con MVCC pero el `||` JSONB append puede perder uno. **Mitigación:** la función SQL es SECURITY DEFINER y atómica per-row, pero el `update ... set tools_invocadas = tools_invocadas || jsonb_build_array(p_tool_entry)` lee-modifica-escribe sin lock explícito → race possible. **Fix:** usar `FOR UPDATE` row lock dentro de la función. Updated en SQL §4 NO incluye el FOR UPDATE — el builder DEBE agregarlo (lock por id, no por trace_id):
   ```sql
   create or replace function public.bot_turns_append_tool_call(...)
   ... language plpgsql security definer ... as $$
   declare v_id uuid;
   begin
       select id into v_id from public.bot_turns where trace_id = p_trace_id for update;
       update public.bot_turns set tools_invocadas = tools_invocadas || jsonb_build_array(p_tool_entry), updated_at = now() where id = v_id;
   end;
   $$;
   ```
   **Tarea al builder:** agregar el FOR UPDATE.

5. **Idempotencia bloquea un retry legítimo del founder testeando manualmente** (probabilidad BAJA, impacto BAJO). El founder hace un curl con un tag.add para testear, lo hace de nuevo 1 min después con el mismo trace_id (porque copy-paste), el segundo call devuelve idempotent_replay. **Mitigación:** documentar que para tests manuales, generar `trace_id` nuevo cada vez (uuidgen). Acceptable porque en producción el trace_id viene del workflow → único por turno automáticamente.

6. **pg_cron no disponible en plan Supabase actual** (probabilidad MEDIA, impacto BAJO). El cleanup diario de `bot_action_dedupe` requiere pg_cron. Si no está, la tabla crece sin límite. **Mitigación:** la migración 0015 detecta y emite NOTICE. Si no está, el builder agrega una edge function Cron Trigger de Supabase que ejecuta el DELETE diario. Tamaño estimado sin cleanup: ~50MB/mes. Tolerable hasta arreglar.

7. **Golden set sesgado al demo de Robert** (probabilidad ALTA, impacto MEDIO). Los 20 turnos reales vienen casi todos del agency de fisio. Los sintéticos los redactamos sesgados a inmobiliaria/fisio. Cuando agreguemos un cliente nuevo (e-commerce, servicios, etc.), el set v1 mide mal su accuracy. **Mitigación:** v1 es explícitamente "baseline F5" para validar la arquitectura. Cuando llegue cliente vertical nuevo, v2 incorpora sus turnos. Aceptable.

8. **Eval harness se activa por accidente y dispara mensajes synthetic al WhatsApp real** (probabilidad BAJA, impacto ALTO). Si el harness está active y alguien lo dispara, hace POST al webhook del bot, que procesa el "synthetic" payload, eventualmente manda mensaje vía YCloud al lead synthetic. Si el lead synthetic tiene un phone real → desastre. **Mitigación:** (a) los fixtures de leads usan números obviamente fake (`+0000000000001`); (b) el bot-v6-v2 detecta `__eval_synthetic:true` en el webhook payload y NO manda mensaje real (en su lugar, devuelve la respuesta al harness). **Esto es CRÍTICO** — agregar al `Forge Synthetic Payload` la marca `__eval_synthetic`, y modificar el nodo `Send Chunk via YCloud` para skip si esa flag está. **Tarea al builder F5 explícita.** Si el reviewer detecta que falta este guard, FAIL.

9. **Tokens cached aparecen como 0 en producción aunque R4 esté implementado** (probabilidad MEDIA, impacto BAJO). Posibles causas: (a) el system_prompt es <1024 tokens (no cumple el umbral); (b) la versión del modelo no soporta prompt caching (gpt-4o sí, gpt-3.5 no); (c) hay una variable invisible en el prompt (timestamp, randomness) que rompe el prefix. **Mitigación:** test 8 verifica >0; si falla, el builder hace audit del system_prompt comparando 2 turnos consecutivos (hash idéntico esperado).

### Casos edge a contemplar (mínimo 4)

1. **Happy path eval con A baseline.** Corremos `eval-runner.mjs --arch=A` sobre golden v1. Se generan 80 trace_ids únicos, 80 rows en bot_turns con `arch='A'`, 80 rows en eval_run_turns linkeadas. Tabla stdout muestra pass rate. **Verificable:** `SELECT count(*) FROM bot_turns WHERE arch='A' AND started_at > '<run start>'` = 80.

2. **Lead manda mensaje en horario hábil con todos los toggles ON.** Trace_id creado al entrar. Resolve Agency → enriquece. Componer prompt → captura hash. Agent corre, llama 3 tools. Cerrar Trace al final con status='done', tokens computados, latencia total. `tools_invocadas` jsonb tiene 3 entries. Idempotencia se gatilla en las 3 tools (cada una persiste su hash); si N8N hace retry por cualquier razón en el mismo turno, el 2do call devuelve idempotent_replay. **Verificable:** SELECT row de bot_turns muestra todos los campos populados.

3. **Lead manda mensaje fuera de horario (office_hours).** Trace_id creado. Enriquece. NO llega al agente (¿Fuera de Horario? branch). El Code Node "Cerrar Trace" NO se ejecuta (no está en esa rama). **Riesgo:** el trace queda con status='running' para siempre. **Mitigación:** agregar `Cerrar Trace de Turno` al final del branch office_hours también (con status='done', tools_invocadas=[{tool:'conversation.pause_until'}], output_crudo=out_of_office_message). **Tarea al builder.**

4. **bot-actions caído mid-turn.** Crear Trace OK (intentó pero el POST timeout). El bot recibe la respuesta del LLM y trata de mandarla por YCloud → manda OK. Pero el row en bot_turns nunca se creó porque el primer Code Node tiró catch silencioso. **Verificable:** logs N8N stderr muestran "[F5] Crear Trace de Turno failed (non-fatal)". El bot sigue normal pero el turno NO queda auditado. **Aceptable** — los logs de N8N quedan como backup. Si pasa frecuentemente, alertar.

5. **Lead manda mensaje con audio (transcripción).** El input_crudo en bot_turns debería ser `"[AUDIO] <transcripción Whisper>"`. **Verificable:** SELECT input_crudo FROM bot_turns WHERE ... — debe contener el marcador.

6. **Tool falla / 401 (BOT_ACTIONS_SECRET roto).** El handler devuelve 401. La respuesta NO se persiste a `bot_action_dedupe` (porque el flow falla antes del persistIdempotencyEntry). El catch silencioso del Code Node en N8N captura. El audit log queda con `tools_invocadas` faltando esa entry. **Aceptable** — solo hay info de tool si la tool corrió.

7. **Idempotencia bloquea un comportamiento legítimo.** Lead manda "agregame VIP" 2 veces seguidas (mensajes consecutivos). Cada mensaje es un turno separado con trace_id distinto. `tag.add` se ejecuta 2 veces, ambas con `idempotent_replay:false`. El segundo INSERT en `tag_assignments` ignora por UNIQUE constraint del DB. **Verificable:** UI muestra VIP solo 1 vez (correcto).

8. **Eval run interrumpido a mitad.** Founder corta el runner con Ctrl+C en turno 50/80. `eval_runs` queda con `status='running'`. `eval_run_turns` tiene 50 filas. **Mitigación:** el runner detecta SIGINT y hace UPDATE eval_runs SET status='cancelled', finished_at=now() WHERE id=<run_id>. **Tarea al builder del eval-runner.**

9. **Eval run sobre workflow que no tiene F5 instrumentación.** Founder accidentalmente apunta `EVAL_TARGET_WEBHOOK_URL` al workflow viejo (sin trace_id propagation). El harness manda payload, el target lo procesa pero NO escribe a bot_turns. El nodo `Read Bot Turn` no encuentra nada después de 8s → `status='error'` en eval_run_turns. **Verificable:** todos los 80 turnos terminan en error. Founder ajusta la URL.

10. **Múltiples corridas del eval simultáneas.** Sobre el mismo target. Cada turno genera su trace_id propio. Sin colisiones. **Verificable:** dos `eval_runs` rows distintas pueden existir en `status='running'` simultáneamente.

---

## 12. Criterios de PASS para reviewer

El `n8n-reviewer` valida con la skill `n8n-workflow-audit`. Específicamente para F5:

| # | Check | Cómo verificar | PASS si |
|---|---|---|---|
| 1 | Migración 0015 sintácticamente válida | parsear el SQL, ejecutar en DB de test si es posible | Sin errores de sintaxis, todas las tablas creadas |
| 2 | bot-actions v0.3.0 compila Deno | `deno check supabase/functions/bot-actions/index.ts` | 0 errores |
| 3 | Idempotencia funciona end-to-end | Smoke test 5 + 6 | Hit del 2do call dentro de 15 min; miss después |
| 4 | trace_id se propaga end-to-end | Smoke test 7 — row en bot_turns con todos los campos de los 4 Code Nodes | Todos populados, status='done' |
| 5 | Prompt caching efectivo | Smoke test 8 — 2do turno mismo agency con `tokens_cached > 1024` | Cumple |
| 6 | Workflow eval-harness-v1 importable a N8N | `node n8n-push.mjs eval-harness-v1.json` sin error | OK + workflow visible en UI |
| 7 | Harness run end-to-end | Smoke test 9 — 1 turno fixture | 1 fila en eval_runs con done, 1 en eval_run_turns |
| 8 | NO regresión de latencia del bot | Smoke test 12 | < 200ms extra |
| 9 | Validador de expresiones | `validate-n8n-expressions.js` sobre bot-v6-v2 y eval-harness-v1 | 0 violations |
| 10 | __eval_synthetic guard en Send Chunk via YCloud | Inspeccionar el JSON post-build | El nodo Send Chunk tiene IF que skip si __eval_synthetic true |
| 11 | Try/catch silencioso en los 5 Code Nodes nuevos | Inspeccionar jsCode | Cada uno tiene try/catch que no aborta |
| 12 | FOR UPDATE en bot_turns_append_tool_call | Inspeccionar SQL | Función incluye SELECT ... FOR UPDATE |
| 13 | Cerrar Trace al final del branch office_hours | Inspeccionar JSON | El branch del Pausar Bot también termina con un Cerrar Trace |
| 14 | Golden set v1 commiteado | `ls crm-v2/eval/golden-set/v1.jsonl` + count lines | Existe, 80 líneas |
| 15 | Audit de R4 (degradación) | Comparar accuracy A pre-F5 vs A post-F5 sobre golden set | Pre y post deltas < 3% |

**Una falla cualquiera de los 15 → FAIL** y vuelve al builder. Los 15 son obligatorios.

---

## 13. Estimación de esfuerzo en jornadas-dev

| Entregable | Builder | Reviewer | Founder (revisión + smoke) | Total |
|---|---|---|---|---|
| 1. Golden set v1 (80 turnos) | 1.0 (script seed + 20 reales + 60 sintéticos) | 0.25 (revisión muestreada) | 0.5 (aprobar distribución + revisar 20 turnos) | **1.75** |
| 2. Harness `eval-harness-v1` + `eval-runner.mjs` | 1.0 (build script + workflow + CLI) | 0.25 | 0.25 (smoke test 9) | **1.5** |
| 3. Prompt caching (R4) + `Componer System Prompt` modificado | 0.5 (refactor jsCode) | 0.25 (audit R4 — comparar accuracy pre/post) | 0.5 (decisión final si degrada >3%) | **1.25** |
| 4. Audit log: migración 0015 + 5 Code Nodes + `audit.write_turn` handler | 1.5 (SQL + bot-actions handler + 5 nodos + propagation) | 0.5 (full audit 15 checks) | 0.25 (smoke 7+10+12) | **2.25** |
| 5. Idempotencia: `bot_action_dedupe` + wrapper en bot-actions | 0.75 (handler + integración al router) | 0.25 | 0.25 (smoke 5+6) | **1.25** |
| Deploy + tag + PR | 0.5 (multipart deploy + migración apply + push + smoke 1-4) | — | 0.25 (validación + activación bot-v6-v2) | **0.75** |
| Buffer (riesgos materializados, fixes loop) | 0.5 | 0.25 | — | **0.75** |
| **Total** | **5.75** | **1.75** | **2.0** | **~9.5 jornadas-dev** |

**Encaja en el rango 4-5 jornadas-dev del builder** que la mesa estimó para F5 (Semana 1) — el resto son tiempos de reviewer y founder, no de builder. Cabe en la semana.

**Alerta:** si el founder no consigue armar el golden set en 0.5 jornadas (porque los 20 turnos reales requieren más tiempo de etiquetado), el camino crítico se extiende. **Mitigación:** ofrecer dispatchar Claude para hacer el etiquetado inicial con review humana solo sobre la muestra.

---

## 14. Handoff al builder

- **Archivos a crear:**
  - **NUEVO:** `crm-v2/supabase/migrations/0015_bot_observability.sql` (§4).
  - **NUEVO:** `crm-v2/eval/golden-set/v1.jsonl` + `crm-v2/eval/golden-set/v1.README.md` + fixtures (§3.1).
  - **NUEVO:** `crm-v2/n8n/workflows/eval-harness-v1.json` (vía build script).
  - **NUEVO:** `crm-v2/n8n/workflows/chatbot-momentum-bot-v6-v2.json` (vía build script desde v1).
  - **NUEVO:** `crm-v2/scripts/build-eval-harness-v1.js` (§8.1).
  - **NUEVO:** `crm-v2/scripts/build-bot-v6-v2.js` (§8.2).
  - **NUEVO:** `crm-v2/scripts/seed-golden-set.js` (§8.3).
  - **NUEVO:** `crm-v2/scripts/eval-runner.mjs` (§8.4).

- **Archivos a modificar:**
  - `crm-v2/supabase/functions/bot-actions/index.ts` — bump v0.3.0, agregar idempotency wrapper + `audit.write_turn` handler + canonical JSON + sha256 + trace_id en OperationContext + append a tools_invocadas en cada handler (§5).
  - `memory/research/13-bot-v6-compositor-code.md` — actualizar entre markers el jsCode del `Componer System Prompt` para producir `{system_prompt, user_message_prefix}` en lugar de solo `system_prompt` (§7.4).

- **Snapshot obligatorio antes de tocar v1:**
  ```bash
  node crm-v2/scripts/n8n-pull.mjs p3h7tx6UiGBQ9Tzb
  # → crm-v2/n8n/workflows/snapshots/chatbot-momentum-bot-v6-v1-LIVE-2026-05-30.json
  git add crm-v2/n8n/workflows/snapshots/
  ```

- **Notas especiales no-obvias:**
  1. **El cross-tenant guard tiene una EXCEPCIÓN para `audit.write_turn`** (§5.5). El Code Node "Crear Trace de Turno" se ejecuta ANTES de Resolve Agency, así que no tiene agency_id real — manda placeholder `00000000-...`. El guard de bot-actions DEBE eximir esa operation. Si no, todos los inserts iniciales fallan con 403.
  2. **El cálculo de `tokens_cached`** viene del response del LangChain Agent node de N8N en el campo `usage.prompt_tokens_details.cached_tokens`. Verificar que typeVersion del agent expone ese campo; si no, el builder hace HTTP directo a OpenAI desde el Code Node "Cerrar Trace" para obtener el last completion's usage. Workaround: el LLM result en N8N expone `response.usage` (verificar en un run real).
  3. **El `__eval_synthetic` flag** es CRÍTICO. El builder agrega al nodo `Send Chunk via YCloud` un IF que skip cuando `$('Webhook - YCloud Inbound').first().json.__eval_synthetic === true`. Sin esto, el harness manda mensajes reales a phones reales. Validar en smoke test (mandar payload con __eval_synthetic:true → NO debe haber call a YCloud).
  4. **`FOR UPDATE` en `bot_turns_append_tool_call`** — agregar al SQL antes de aplicar la migración. El §4 no lo incluye en la versión inicial, pero es OBLIGATORIO (riesgo R4 §11). Builder reescribe el create-or-replace de la función con el row lock.
  5. **`Cerrar Trace de Turno` también al final del branch office_hours.** El §3.4 de la spec F4 termina ese branch con `Pausar Bot Hasta Hora Hábil` y abort. F5 agrega un `Cerrar Trace (office_hours)` Code Node conectado a la salida de `Log Out of Office en Messages` (o donde termine el branch) que UPDATE bot_turns con status='done' + tools_invocadas=[{tool:'conversation.pause_until', tool:'send_out_of_office'}]. Sin esto, esos turnos quedan en status='running' eternos.
  6. **Posición y conexiones de los 5 Code Nodes nuevos:** §7.1 (posiciones) + §7.3 (conexiones). El builder NO inventa posiciones — usa las dadas (aproximadas) y ajusta para no superponer visualmente.
  7. **R4 NO está aprobado por default.** El builder NO mergea R4 sin OK explícito del founder + reviewer post-eval pre/post. Plan B: deploy F5 sin R4 (sin caching, sin reordenar) y agregar R4 en una iteración separada con su propio gate.
  8. **El `eval-runner.mjs` debe usar el service_role_key** para escribir a `eval_runs`/`eval_run_turns` (que tienen RLS master_only). Leer key de `crm-v2/.env.local` (variable `SUPABASE_SERVICE_ROLE_KEY`, ya existe).
  9. **`eval-harness-v1` queda `active:false` por default.** El builder NO lo activa. Founder activa manualmente cuando va a correr.
  10. **El `Trace Failure Handler` (§7.1 nodo 5) conecta al `on_failure` setting de los nodos críticos**, no a un "error output" estándar (LangChain Agent y postgres no lo exponen). Builder agrega el setting en `Agente Principal - Sofia` (continueOnFail=true + un Set node que captura $json.error) o usa el "Error Workflow" feature de N8N apuntando al `Trace Failure Handler`.
  11. **`scripts/seed-golden-set.js` requiere coordinación con el founder.** El script tira un prompt interactivo por turno real ("¿qué tools esperarías acá?"). NO es fire-and-forget. El builder ejecuta en sesión sincrónica con el founder.
  12. **El audit log para los 7 handlers idempotentes:** el wrap del switch (§5.4 punto 3) debe ejecutarse DESPUÉS del check del toggle. Si el toggle apaga la acción → no se llama el handler → no se persiste hash → el caller no obtiene idempotencia para ese caso. **Decisión:** acceptable, porque el "no-op por toggle off" no necesita idempotencia (no hay efecto que duplicar). Documentado.

- **Dependencia de prompt-designer:** NO. F5 no toca prompts del LLM (R4 reorganiza bloques pero el contenido es idéntico). El bloque "[CONTEXTO DEL LEAD]" y "[DATOS YA CAPTURADOS]" se mueve de system a user con prefijos pero su contenido es el mismo. Si tras eval pre/post (R4 verification) el founder ve degradación, el prompt-designer puede iterar el wording de los prefijos en F6.

- **Validación post-build:**
  1. `JSON.parse` de ambos workflows.
  2. `node crm-v2/scripts/validate-n8n-expressions.js` sobre los dos workflows → 0 violations.
  3. `deno check crm-v2/supabase/functions/bot-actions/index.ts` → 0 errores TS.
  4. Smoke tests 1-12 del §10.
  5. Entrega al `n8n-reviewer` con la skill `n8n-workflow-audit` aumentada por los 15 checks de §12.

- **PR + tag:**
  - Branch: `feat/f5-foundation`.
  - PR description debe incluir:
    - Resumen de los 5 entregables.
    - Resultado del eval baseline A (tabla stdout pegada).
    - Confirmación o decisión sobre R4 (mergea con o sin).
    - Link al snapshot del v1 vivo.
  - Tag tras merge: `bot-v6-F5-foundation-2026-05-30`.

---

## 15. Notas finales al orquestador

- **F5 NO desbloquea por sí solo a F6.** F6 (Build C) puede arrancar EN PARALELO al F5 (el builder de C puede empezar a diseñar mientras F5 deploya, siempre que el agency del demo siga corriendo en A). Pero el A/B test de F7 SÍ necesita F5 completo.
- **El golden set v1 es el bloqueante real.** Sin él, F6 mide a ciegas igual que hoy. Si el founder no consigue armarlo en Semana 1, F7 se atrasa.
- **R4 (prompt caching) es la decisión más sensible de F5.** Si el founder no se siente cómodo aprobando el cambio sobre el bot que ya funciona, F5 deploya sin R4 (perdemos el ahorro de tokens pero todo lo demás queda); R4 se puede agregar después con su propio test pre/post.
- **El reviewer debe validar específicamente:**
  - Sin abortar el bot por fallas de F5 (try/catch silenciosos en los 5 Code Nodes).
  - `__eval_synthetic` guard en Send Chunk via YCloud (criticidad ALTA).
  - FOR UPDATE en bot_turns_append_tool_call (concurrency).
  - Cerrar Trace al final del branch office_hours (no dejar status='running' eternos).
- **Próxima spec esperada (F6):** `2026-06-XX-sofia-v6-F6-build-c-hibrido-determinista.md`. La escribe el architect cuando F5 esté deployed y haya datos de A en `bot_turns` y `eval_runs`.
