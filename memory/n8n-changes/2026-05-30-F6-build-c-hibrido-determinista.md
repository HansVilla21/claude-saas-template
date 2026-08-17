# Spec: F6 — Build C (Híbrido determinista, workflow paralelo a A)

**Fecha:** 2026-05-30
**Autor:** n8n-architect
**Workflow afectado:**
- **NUEVO (build greenfield desde `bot-v6-v2`):** `crm-v2/n8n/workflows/chatbot-momentum-bot-c-v1.json`. Workflow SEPARADO. NO toca `bot-v6-v2`.
- **Edge function `bot-actions`:** v0.3.0 → **v0.4.0** (handler nuevo `clarification.log` + advisory lock por `lead_id` + tag `arch:'C'` en audit append).
- **Edge function NUEVA (decidida en F6 — ver §3.6):** ninguna. La escape hatch usa el handler nuevo dentro de `bot-actions` (mismo router).

**Versión actual → propuesta:**
- `bot-v6-v2` (arch A, 77 nodos, active, baseline F5) → **se queda igual** como baseline mensurable.
- `bot-c-v1` no existe → **v1** (workflow nuevo, arch C, ~55-60 nodos, active=false; el founder lo activa cuando quiere empezar el A/B test).
- `bot-actions` v0.3.0 → **v0.4.0** (1 handler nuevo + advisory lock + 1 ENUM agregado a `clarification_reason`).

**Trigger del cambio:** Decisión arquitectónica del 2026-05-30 (mesa multi-agente, `memory/research/14-mesa-arquitectura-sofia-v6.md`): migrar de A (1 LangChain Agent con 7 tools) a C (Información Extractor + IF/Switch deterministas). F6 = Semana 2 del plan de migración = construir C en paralelo a A, reusando 100% de la edge function de F5 y agregando los 5 fixes obligatorios de reliability que el panel adversarial detectó.

**Specs predecesoras:**
- `2026-05-30-F5-foundation.md` (LIVE: bot-v6-v2 + bot-actions v0.3.0 + migración 0015 + eval-harness-v1 + golden set v1.jsonl). F6 reusa TODO.
- `memory/decisions.md` entrada 2026-05-30 (tarde): "Mesa arquitectónica Sofia v6 — migrar a C con 5 fixes obligatorios".

**Tag de rollback existente:** `bot-v6-pre-migracion-C-2026-05-30`. Si F6 falla → desactivar `bot-c-v1`, reactivar `bot-v6-v2` (que está sin tocar) → estado idéntico a F5 cerrada.

---

## 0. Resumen ejecutivo

F6 entrega el workflow C (`bot-c-v1`) como **workflow N8N separado**, construido encima de la infraestructura de F5 (audit log con trace_id, idempotency cache, golden set, eval-harness). C NO toca `bot-v6-v2`. El founder puede activar uno u otro manualmente para comparar.

**Núcleo arquitectónico de C (vs A):**

| Aspecto | A (baseline, `bot-v6-v2`) | C (esta spec, `bot-c-v1`) |
|---|---|---|
| Sofia conversador | LangChain Agent con 7 toolHttpRequest + memoria Postgres + GPT-4-class | LangChain Agent con **1 sola tool escape hatch** (`Request_Clarification_Tool`) + memoria Postgres + **`gpt-4o-mini` por default** (downgrade conservador) |
| Prompt de Sofia | ~3000 tokens con bloque `## AUTO-ACCIONES PERMITIDAS` + `## CUANDO USAR CADA TOOL` | ~1800 tokens, SIN bloques de tools. Solo conversa. |
| ¿Cómo se decide qué escribir a DB? | El LLM decide tool calls. No determinista. | **Information Extractor** corre en SERIE después de Sofia. JSON tipado. Validación regex/enum. IF/Switch + HTTP. Determinista. |
| Latencia esperada | 3-6s p50 | **3-6s p50** (sin cambio: Sofia con prompt corto + mini ~1.5s + extractor ~1.5s + escrituras paralelas; se compensa con menor tiempo conversacional) |
| Costo por turno (estimado) | ~$0.04 (GPT-4 + tools metadata) | **~$0.0015** (mini conversador + mini extractor) — **~27x más barato** |
| Race condition multi-turno | sin protección | **Advisory lock `pg_advisory_xact_lock(hashtext(lead_id::text))`** en cada handler de bot-actions |
| Promesa rota al lead | posible (LLM dice "te asigno", tool falla) | **prevenida en el prompt**: regla dura "NUNCA prometer en imperativo" + golden set valida con `must_not_promise_imperative` |
| Auditabilidad | tools_invocadas en bot_turns (F5) | **lo mismo + `extractor_output_json` + `schema_version_hash`** (F5 dejó los campos preparados) |
| Tools fuera-de-schema | el LLM puede invocarlas (toda la flexibilidad) | **1 escape hatch** (`Request_Clarification_Tool`) que persiste a `bot_clarification_events` para que el founder revise |

**Los 5 fixes obligatorios (cerrados en esta spec):**

1. **Sofia NO promete imperativo** → §7.1 (prompt) + §10 (golden set valida).
2. **Advisory lock por `lead_id`** → §5.3 (en cada handler de bot-actions v0.4.0).
3. **Validación determinista post-extractor** → §6.3 (Code Node "Validar Extractor Output" con regex/enums).
4. **Idempotencia en bot-actions** → ya hecho en F5 v0.3.0; C lo reusa pasando `trace_id` en cada call.
5. **Escape hatch conversacional** → §3.6 (1 sola `toolHttpRequest` conectada a Sofia C, llama `clarification.log` en bot-actions v0.4.0).

**Lo que F6 NO hace:**

- NO toca `bot-v6-v2`. **CONFIRMADO §8.**
- NO mete canary ni feature flag por agency. El founder confirmó que NO hay producción real, solo pruebas internas; cutover directo.
- NO agrega un Information Extractor a `bot-v6-v2`. Eso es contradictorio con la decisión de la mesa (no mezclar A y C).
- NO modifica el golden set v1.jsonl ni el eval-harness-v1 (ambos siguen sirviendo). F6 solo cambia el `EVAL_TARGET_WEBHOOK_URL` cuando corre el harness contra C.
- NO toca `agency.pipeline_stages` / `agency.extractor_field_defs` (los lee en runtime, no los modifica).
- NO migra el módulo de propiedades (sigue desactivado igual que en v2).

**Riesgo macro:** el Information Extractor corre en serie DESPUÉS de Sofia. Si falla (timeout OpenAI, JSON inválido, 503), el bot ya respondió al lead pero las acciones de DB no se ejecutan. Mitigación documentada en §12: cada falla se loggea como `extractor_failed=true` en `bot_turns.metadata` + UPDATE `bot_turns.status='partial'` (estado nuevo agregado en la migración 0016). El siguiente turno re-evalúa contexto acumulado en la memoria.

---

## 1. Problema / requerimiento

El bot Sofia v6 actual (`bot-v6-v2`, arquitectura A) funciona, pero el founder identificó en la mesa multi-agente del 2026-05-30 que la arquitectura tiene **3 modos de falla estructurales** que no se resuelven mejorando el prompt:

1. **El LLM es SPOF en tool-calling.** Cuando GPT-4 decide "no llamo Extractor_Tool en este turno aunque el lead dijo su presupuesto", no hay safety net. El prompt mitiga, no elimina.
2. **Costo escalable mal.** A $0.04/turno con GPT-4, una agencia con 1000 leads activos = $1200/mes solo bot. Sin caching agresivo + sin downgrade de modelo, no escala a 50 agencias.
3. **Debugging caro.** Cuando algo falla, hay que reconstruir tool calls de los logs de OpenAI + correlacionar con bot-actions. F5 cerró parte (trace_id), pero el problema raíz — "qué decidió el LLM" — sigue siendo opaco.

F6 ataca los 3 con **arquitectura C**: separar "conversar" de "actuar". Sofia solo conversa (sin tools, prompt corto, mini). Un Information Extractor convierte el turno en JSON tipado. Nodos IF/Switch + HTTP escriben a Supabase con las MISMAS edge functions que ya existen. El LLM dice "QUÉ hacer" como output estructurado, no "CÓMO hacerlo" como tool call.

Post-F6 el founder tendrá:

- `bot-v6-v2` (A) activo o desactivable.
- `bot-c-v1` (C) activo o desactivable.
- Eval-harness corre los 80 turnos del golden set contra cualquiera de los dos y produce métricas comparables (`pass_count`, `p50_ms`, `total_cost_usd`).
- 2 rows en `eval_runs` (uno por arch) listos para comparar manualmente.
- Decisión informada en mano: si C iguala o supera A en accuracy con costo ~27x menor, C gana y A se desactiva en F7. Si C falla algo del golden set que A pasaba, debugueamos C en lugar de descartarlo (no rollback completo: ya tenemos baseline).

---

## 2. Estado actual relevante

### 2.1 En N8N (workflow `Chatbot Momentum - bot-v6 v2`, id `p3h7tx6UiGBQ9Tzb`, active)

Es el baseline arch A post-F5. **F6 NO lo toca**, lo cita aquí solo para mapear qué nodos C reusa (mismas queries SQL, mismo formateador, mismo office_hours branch).

Nodos del v2 que C **reusa idénticos** (copy nodal por el build script, no referencias):

| Nodo en v2 | Reuso en C | Comentario |
|---|---|---|
| `Webhook - YCloud Inbound` | sí | Entry point. Mismo path. |
| `Extract Variables` | sí | Normaliza payload YCloud. |
| `Is Text or Audio or Image?` (Switch) | sí | Routing por tipo. |
| `Mark As Read`, `Download Audio`, `Transcribe Audio (Whisper)` | sí | Audio pipeline. |
| `Set Normalize - Audio/Text/Image` | sí | Convergencia. |
| `ID y Mensaje` | sí | Tras estos sale el `Mensaje` unificado. |
| `Resolve Agency` | sí | Query maestra. |
| `Buscar Lead (Supabase)` + `Lead Encontrado?` + `Abort - Lead No Encontrado` | sí | Resuelve lead. |
| `Get Conversation State` | sí | Resuelve conversación + handler + pause. |
| `Chatbot Activado?` | sí | Gate handler/bot_enabled/pause. |
| `Detectar Link en Mensaje` → `Tiene Link?` → `Apify - Scrape Link` → `Mensaje Enriquecido` | sí | Apify branch. |
| `REINICIAR?` → `Vacia Redis` → `Delete Postgres historial` → `Send Reinicio via YCloud` | sí | Reset manual. |
| `Variables`, `Conversation`, `Code Formatear Historial`, `Unificacion de Variables` | sí | Pre-LLM setup. |
| `Componer System Prompt` (Code) | sí, **MODIFICADO §7.1** | Reduce a ~1800 tokens. Quita bloques `## AUTO-ACCIONES PERMITIDAS` y `## CUANDO USAR CADA TOOL`. Agrega regla dura "NUNCA prometer en imperativo". |
| `Calcular Estado de Horario` + `¿Fuera de Horario?` + `Send Out of Office via YCloud` + `Log Out of Office en Messages` + `Pausar Bot Hasta Hora Hábil` | sí | Office hours branch. |
| `Formateador de Mensajes` + `Split Out` + `Loop Over Items` + `Expand Property Images` + `Mensaje no vacio?` + `Send Chunk via YCloud` + `Pausa entre Mensajes` | sí | Output pipeline. **Importante:** el Formateador en v2 espera el output del agent en `$json.output`. En C, después del extractor, el output del agent vivirá en otra ruta — ver §6.4 conexiones. |
| `Crear Trace de Turno`, `Enriquecer Trace con IDs`, `Capturar Prompt Hash`, `Cerrar Trace de Turno`, `Cerrar Trace (Office Hours)`, `¿Eval Synthetic?` | sí, **arch='C' en lugar de 'A'** | Los 5 Code Nodes F5 se reusan; el único cambio en cada uno es `arch: 'C'` en el `payload` del audit.write_turn. Build script cubre el rename. |

Nodos del v2 que C **NO reusa** (los borra el build script al copiar):

- `Agente Principal - Sofia` con sus 7 tools conectadas (`Extractor_Tool_bot_actions`, `Stage_Tool_bot_actions`, `Qualify_Tool_bot_actions`, `Assign_Tool_bot_actions`, `Tag_Tool_bot_actions`, `Note_Tool_bot_actions`, `Request_Handoff_Tool`, `Supabase_Properties_Tool` desconectado). C tiene su propio `Sofia C` SIN tools (excepto escape hatch).
- `Detector de Descalificacion` (informationExtractor para handoff) + `Apagar bot?` + `Apagar Chatbot — Conversation` + `Apagar Chatbot — Lead Summary` + `Notificar Agente (Telegram)`. **DECISIÓN §3.5:** en C el handoff lo decide el Information Extractor principal (no hay rama paralela duplicada). Telegram lo dispara el handler de `bot-actions.handoff.escalate` (esto requiere agregar Telegram allá — ver §5.4).

### 2.2 En `bot-actions` (edge function, v0.3.0 deployada)

- 8 operations operativas: `extractor.write`, `stage.set`, `qualify.set`, `assign.set`, `tag.add`, `note.write`, `handoff.escalate`, `conversation.pause_until`, `audit.write_turn`.
- Idempotency wrapper activo (F5): 7 operations idempotentes por `(trace_id, tool, params_hash)` con ventana lógica 15 min, cache en `bot_action_dedupe`.
- `audit.write_turn` sistémica, sin gate ni cross-tenant, UPSERT a `bot_turns`.
- Cross-tenant guard: lead.agency_id === agency_id.
- Toggle gating por `agencies.settings.auto_actions.{stage,qualify,assign,tag,note}`.
- Auth Bearer `BOT_ACTIONS_SECRET`.

**Lo que F6 le agrega (v0.4.0):**

1. **Nueva operation `clarification.log`** — recibe `{ topic, raw_question, suggested_resolution }`, INSERTA a tabla nueva `bot_clarification_events`. NO idempotente (cada llamada cuenta como evento distinto, aunque el topic sea repetido). NO tiene toggle.
2. **Advisory lock por `lead_id`** — al inicio de los 7 handlers idempotentes, `SELECT pg_advisory_xact_lock(hashtext(lead_id::text))` antes de cualquier write. El lock se libera automáticamente al commit/rollback de la transacción. Detalle §5.3.
3. **Telegram alert dentro de `handoff.escalate`** — actualmente el Telegram lo manda el `Detector de Descalificacion` en N8N. En C ese nodo no existe. La alerta se mueve al handler de `bot-actions.handoff.escalate`. Detalle §5.4.
4. **Tag `arch:'C'`** en cada audit append — el handler `bot_turns_append_tool_call` recibe el entry de la tool. C agrega `arch:'C'` al entry para distinguir invocaciones de A vs C en queries.

### 2.3 En Supabase migrations

Última aplicada: `0015_bot_observability.sql` (F5). F6 introduce **`0016_bot_clarifications_and_advisory.sql`**:

- Tabla `bot_clarification_events` (id, agency_id, lead_id, conversation_id, trace_id, topic, raw_question, suggested_resolution, status, reviewed_by, reviewed_at, created_at).
- Función SQL `bot_acquire_lead_lock(uuid)` que aplica `pg_advisory_xact_lock(hashtext(...))`. Wrapper para que el código TS sea claro.
- ENUM `clarification_status` ('open','reviewed','dismissed').
- Status agregado a `bot_turns`: 'partial' (turno donde Sofia respondió pero el extractor falló). Constraint update.
- RLS multi-tenant en `bot_clarification_events`: master + miembros del agency. INSERT solo service_role.

### 2.4 En el repo

- `crm-v2/n8n/workflows/chatbot-momentum-bot-v6-v2.json` (LIVE).
- `crm-v2/n8n/workflows/eval-harness-v1.json` (inactive, listo para usar).
- `crm-v2/eval/golden-set/v1.jsonl` (80 turnos, listo).
- `crm-v2/scripts/build-bot-v6-v2.js` (modelo para `build-bot-c-v1.js`).
- `crm-v2/supabase/migrations/0015_bot_observability.sql` (aplicada).

F6 agrega:

- `crm-v2/n8n/workflows/chatbot-momentum-bot-c-v1.json` (output del build).
- `crm-v2/scripts/build-bot-c-v1.js` (transforma `bot-v6-v2` → `bot-c-v1` con las mutaciones de §6).
- `crm-v2/supabase/migrations/0016_bot_clarifications_and_advisory.sql`.
- `crm-v2/supabase/functions/bot-actions/index.ts` v0.4.0 (modificación in-place + bump FN_VERSION).

---

## 3. Decisiones rectoras (lock-in)

### 3.1 R1 — Workflow separado vs branch dentro de v2

**Decisión:** **workflow nuevo, separado** (`chatbot-momentum-bot-c-v1.json`).

**Por qué:** La decisión 2026-05-30 explícita lo dice: "No mezcles A y C en el mismo workflow. Si A queda como puente, son DOS workflows separados con switch por agency_id o feature flag, nunca el mismo Agent decidiendo a veces y un extractor decidiendo otras veces. Duplica debugging."

Una variante "rama" dentro de `bot-v6-v2` tendría:
- Un IF al principio que enruta por feature flag.
- Dos sub-flows que terminan en el mismo `Send Chunk via YCloud`.
- 130+ nodos en un solo workflow. Inmanejable.

**Trade-off aceptado:** los nodos compartidos (Resolve Agency, Buscar Lead, etc.) se DUPLICAN en disco. Bug fix en uno requiere fix en otro. Mitigación: el build script `build-bot-c-v1.js` copia desde `bot-v6-v2.json` cada vez que se rebuilde, así un fix en v2 → rebuild C → fix propagado.

### 3.2 R2 — Naming del workflow

**Decisión:** **`chatbot-momentum-bot-c-v1.json`** (NO `bot-v6-v3`).

**Por qué:** El lineage `bot-v6-vN` describe iteraciones de **la misma arquitectura A**. C es una arquitectura distinta — meterla en el lineage de A confunde el modelo mental. Si dentro de 1 mes C gana el A/B test y se vuelve la única, renombramos a `bot-v7-v1` (nueva era). Por ahora, `bot-c-v1` marca explícitamente que es la arquitectura C, primera iteración.

Convención del skill `n8n-workflow-versioning`: cambios estructurales = nuevo archivo `vN.json`. C es un cambio estructural masivo (cambia el modelo de razonamiento entero) → archivo NUEVO con nombre que refleja la arquitectura, no la iteración del baseline.

**Build script:** `scripts/build-bot-c-v1.js` (coherente con el archivo).

**Tag git tras deploy (no parte de F6 sino del cutover):** `bot-c-v1-deployed-YYYY-MM-DD`.

### 3.3 R3 — Information Extractor en serie vs paralelo a Sofia

**Decisión:** **SERIE.** Sofia responde primero. El extractor corre DESPUÉS, recibiendo `(lead_msg, sofia_reply, lead_context)`.

**Por qué:**

| Criterio | Paralelo | Serie (elegido) |
|---|---|---|
| Latencia al lead | +0ms (responde en paralelo al extractor) | +1-2s (el reply al lead va al final, después del extractor) |
| Riqueza del input del extractor | solo `lead_msg` (el extractor no ve la respuesta del bot) | `lead_msg + sofia_reply + lead_state` (mucho más rico) |
| Race condition multi-turno | peor (las 2 ramas corren a velocidades distintas y la segunda llegada del lead puede leer state stale) | igual, pero el lock por `lead_id` lo cierra (§3.4) |
| Coherencia "lo que dice Sofia coincide con lo que se hace" | baja (el extractor podría capturar algo que Sofia no mencionó y disparar acción contradictoria) | alta (el extractor lee lo que Sofia dijo y decide en función de eso) |
| Debug | 2 ramas paralelas en N8N (difícil seguir el orden) | flujo lineal (trivial) |

**Latencia neta vs A:**
- A: 3-6s (GPT-4 con tools).
- C serie: ~1.5s (Sofia mini sin tools) + ~1.5s (extractor mini con schema) + 0.3-1s (HTTP a bot-actions, paralelos entre sí) + 0.3-1s (Send Chunk YCloud) = **3-5s p50**. Igual o ligeramente mejor que A.

**Reordenamiento del flow** (vs lo que sería paralelo):

```
... → Sofia C → Capturar Output → Information Extractor → Validar Extractor Output
   → Switch por campo → HTTP a bot-actions (en paralelo entre sí, no entre sí y Sofia)
   → Esperar a que terminen las HTTP (Merge) → Cerrar Trace de Turno → Formateador → Send Chunk
```

**Nota crítica:** las HTTP a bot-actions SÍ corren en paralelo entre sí (Switch dispara N ramas paralelas). El Merge las espera. Luego sigue el Send Chunk. Latencia de escrituras paralelas = max(latencia individual) ~0.5-1s.

### 3.4 R4 — Orden semántico de las acciones de DB

**Decisión:** **paralelo entre sí, NO secuencial.** Pero con dos excepciones obligatorias:

- `extractor.write` (escribir field_values) DEBE correr ANTES que `qualify.set` y `stage.set`. Razón: qualify/stage pueden depender de field_values recién escritos (ej. "is_qualified=true porque budget>X y X recién entró en extractor_field_values").
- `handoff.escalate` DEBE correr ÚLTIMO. Razón: el handoff cierra la conversación (handler='human'); si corre antes y otra acción intenta UPDATE al lead, race.

**Estructura concreta:**

```
Validar Extractor Output → Switch1 (extractor_data presente?) → HTTP bot-actions/extractor.write
                                                                    ↓
                                                              Merge (wait)
                                                                    ↓
                       → Switch2 (paralelo, cada uno opcional según JSON):
                             - HTTP bot-actions/qualify.set
                             - HTTP bot-actions/stage.set
                             - HTTP bot-actions/tag.add
                             - HTTP bot-actions/assign.set
                             - HTTP bot-actions/note.write
                                                                    ↓
                                                              Merge (wait)
                                                                    ↓
                       → Switch3 (handoff presente?) → HTTP bot-actions/handoff.escalate
```

3 Switches en cascada (extractor → grupo medio → handoff). Cada uno con un Merge wait. Es más nodos que un solo Switch con 6 outputs paralelos, pero garantiza el orden semántico que el panel adversarial exigió:

> "No ejecutes las acciones del extractor en paralelo sin orden semántico. Extractor → Qualify → Stage → Tag → Assign → Note → Handoff. Performance no es el cuello de botella aca; consistencia sí."

La spec del panel listaba 7 pasos secuenciales. Yo lo simplifico a 3 grupos secuenciales con paralelo dentro de cada grupo (extractor solo, medio en paralelo, handoff solo) porque qualify/stage/tag/assign/note NO se afectan entre sí en bot-actions (cada uno UPDATE una tabla distinta o columna distinta). El advisory lock por `lead_id` (§3.5) protege contra cualquier race residual.

### 3.5 R5 — Advisory lock por `lead_id` en bot-actions

**Decisión:** **lock en el edge function**, no en N8N.

**Por qué edge function y no N8N:**
- N8N no tiene lock primitive nativo. Habría que hacerlo via SELECT FOR UPDATE en una tabla auxiliar — más nodos, más latencia, más fragilidad.
- Postgres `pg_advisory_xact_lock(bigint)` es atómico, no requiere tabla, libera automático al commit/rollback.
- TODAS las escrituras del bot pasan por bot-actions. Locking ahí cubre 100% de las race conditions multi-turno del MISMO `lead_id`.

**Implementación SQL (en `0016_*.sql`):**

```sql
create or replace function public.bot_acquire_lead_lock(p_lead_id uuid)
returns void language plpgsql security definer
set search_path = public as $$
begin
    -- pg_advisory_xact_lock(bigint) usa el hash del UUID como key.
    -- Se libera automaticamente al final de la transaccion (commit o rollback).
    -- Bloquea otras transacciones que pidan el MISMO lock; libera cuando termina.
    perform pg_advisory_xact_lock(hashtext(p_lead_id::text));
end;
$$;

grant execute on function public.bot_acquire_lead_lock(uuid) to service_role;
```

**Uso desde TypeScript (en cada handler de bot-actions v0.4.0):**

```typescript
// En cada handler que escribe a leads/conversations/tag_assignments/lead_notes
// (extractor.write, stage.set, qualify.set, assign.set, tag.add, note.write, handoff.escalate),
// llamar PRIMERO:
const { error: lockErr } = await sb.rpc("bot_acquire_lead_lock", {
  p_lead_id: ctx.lead_id,
});
if (lockErr) {
  // Lock falla solo si la función SQL no existe (migración no aplicada) o
  // si el rpc falla por conexión. Loguear + continuar sin lock (degradación
  // graciosa, prefiero seguir que abortar).
  console.warn("bot_acquire_lead_lock failed (continuing without lock):", lockErr.message);
}
// ... resto del handler ...
```

**Edge cases del lock:**

| Caso | Comportamiento |
|---|---|
| 2 turnos del mismo lead llegan en 5s, ambos abren transacción | el 2do espera al 1ro (lock bloqueante). Latencia +200-500ms en el 2do. Aceptable. |
| Edge function reusa la conexión Postgres entre invocaciones | el lock NO es por conexión, es por transacción. Cada `await sb.rpc(...)` abre y cierra su propia transacción. **WARNING:** esto significa que el lock dura SOLO la rpc call, no todo el handler. Para que dure todo el handler, hay que envolver todo el handler en una sola transacción explícita o usar `pg_advisory_lock` (NO `_xact_lock`) + release manual al final. **DECISIÓN: usar `pg_advisory_lock(bigint)` + `pg_advisory_unlock(bigint)` explícito al final con try/finally.** Actualizar el SQL en consecuencia. |
| Handler tira excepción mid-flight | el lock se libera (try/finally captura). Si no, queda colgado. Mitigación: timeout de seguridad en Postgres (`SET LOCAL lock_timeout = '5s'`) — agregar al SQL. |

**Actualización del SQL:**

```sql
create or replace function public.bot_acquire_lead_lock(p_lead_id uuid)
returns void language plpgsql security definer
set search_path = public as $$
begin
    -- pg_advisory_lock (no _xact): persiste hasta release explícito.
    perform pg_advisory_lock(hashtext(p_lead_id::text));
end;
$$;

create or replace function public.bot_release_lead_lock(p_lead_id uuid)
returns void language plpgsql security definer
set search_path = public as $$
begin
    perform pg_advisory_unlock(hashtext(p_lead_id::text));
end;
$$;

grant execute on function public.bot_acquire_lead_lock(uuid) to service_role;
grant execute on function public.bot_release_lead_lock(uuid) to service_role;
```

Y en TS:

```typescript
let lockAcquired = false;
try {
  await sb.rpc("bot_acquire_lead_lock", { p_lead_id: ctx.lead_id });
  lockAcquired = true;
  // ... handler real ...
} finally {
  if (lockAcquired) {
    await sb.rpc("bot_release_lead_lock", { p_lead_id: ctx.lead_id })
      .catch(e => console.warn("release_lead_lock failed:", e.message));
  }
}
```

### 3.6 R6 — Escape hatch: `clarification.log` en bot-actions v0.4.0 vs endpoint nuevo

**Decisión:** **agregar `clarification.log` como operation dentro de bot-actions v0.4.0**, parte de F6 (NO postergarlo).

**Por qué entregarlo en F6:**

- El panel adversarial marcó "perder toda capacidad de tool call" como riesgo (Sofia se vuelve rígida ante preguntas fuera-de-schema). El escape hatch lo cierra.
- Sin él, C entra a prueba con un riesgo identificado sin mitigar. Mal precedente.
- Es UN handler chico (10-20 líneas) + 1 tabla con 4 columnas + 1 toolHttpRequest node + 1 línea en el prompt. ~2h de trabajo. NO justifica postergarlo.

**Por qué dentro de bot-actions y no edge function nueva:**

- Mismo auth (`BOT_ACTIONS_SECRET`), mismo router, mismo deploy. Cero infra nueva.
- Mismo trace_id flow: el handler appendea a `tools_invocadas` igual que los demás.
- Sin idempotencia (cada clarification es un evento distinto) — pero el wrapper `checkIdempotency` ya skip por `IDEMPOTENT_OPERATIONS`; basta NO agregar `clarification.log` a ese Set.

**Cómo el LLM la invoca:** una `toolHttpRequest` con `toolDescription`:

> "Usá esta tool SOLO si el lead te pregunta algo importante para tu rol pero que NO encaja en tu conocimiento actual del negocio (ejemplos: una promo que el founder no documentó, un servicio que no mencionaste antes, una pregunta legal). NO la uses para smalltalk ni para casos típicos del flujo de calificación. Argumentos: topic (1-3 palabras categóricas), raw_question (el texto literal del lead), suggested_resolution (qué creés que el founder debería responder en el bot_config)."

El LLM la llama, el evento queda en `bot_clarification_events`, el founder revisa el dashboard (no-parte-de-F6, viene en F7+).

### 3.7 R7 — Schema dinámico del Information Extractor

**Decisión:** **construido en runtime en un Code Node** ("Construir Schema Extractor") que lee `Resolve Agency` y arma el JSON Schema con `pipeline_stages.slug`, `extractor_field_defs.field_key`, `tags.name` específicos de la agency.

**Por qué dinámico:**

- Una agencia inmobiliaria tiene `pipeline_stages = ['nuevo', 'contactado', 'interesado', 'visita_agendada', 'oferta', 'cerrado']`.
- Una agencia de fisio (caso Robert) tiene `pipeline_stages = ['nuevo', 'cita_agendada', 'paciente_activo', 'baja']`.
- Si el schema fuera estático, el extractor podría devolver `stage_change='visita_agendada'` para Robert (no existe en su pipeline) → bot-actions skip por enum match → silent fail.
- El schema dinámico fuerza al LLM extractor a elegir SOLO de los slugs reales de la agency.

**Cómo se construye:**

```javascript
// Construir Schema Extractor — Code Node
const ag = $('Resolve Agency').first().json;

// 1. Pipeline stages → enum de stage_change
const stageSlugs = Array.isArray(ag.pipeline_stages)
  ? ag.pipeline_stages.map(s => s.slug).filter(Boolean)
  : [];
stageSlugs.push('none'); // valor sentinel para "no hay cambio"

// 2. Extractor field defs → propiedades de captured_data
const fieldDefs = Array.isArray(ag.extractor_field_defs)
  ? ag.extractor_field_defs.filter(f => f.is_active)
  : [];

// 3. Tags permitidos → enum de tags_to_add (items)
const allowedTags = Array.isArray(ag.allowed_tags) ? ag.allowed_tags : [];
// Si la agency no tiene tags definidos, dejar array vacío permitido pero sin enum
// (el extractor no propondrá tags inventados).

// 4. Construir schema
const captured_data_props = {};
for (const def of fieldDefs) {
  let jsType = 'string';
  if (def.field_type === 'number') jsType = 'number';
  else if (def.field_type === 'boolean') jsType = 'boolean';
  // date, jsonb, enum → string (el extractor devuelve string; el handler coerce)
  captured_data_props[def.field_key] = {
    type: ['string', 'number', 'boolean', 'null'].includes(jsType) ? jsType : 'string',
    description: def.description || `Valor de ${def.field_key} si el lead lo dijo literal en el mensaje. null si no apareció.`,
  };
}

const schema = {
  type: 'object',
  properties: {
    captured_data: {
      type: 'object',
      description: 'Datos del lead capturados en ESTE turno. SOLO si aparecen literal en el mensaje. NO inventar.',
      properties: captured_data_props,
    },
    stage_change: {
      type: 'string',
      enum: stageSlugs,
      description: 'Slug del stage al que el lead avanzó en ESTE turno. "none" si no hay cambio claro.',
    },
    qualified: {
      type: 'string',
      enum: ['yes', 'no', 'unknown'],
      description: "'yes' SOLO si el lead dijo algo que lo califica explícito según los criterios del negocio (presupuesto encima del mínimo, fecha concreta, intención de compra). 'no' SOLO si descartó explícito. 'unknown' por default.",
    },
    tags_to_add: {
      type: 'array',
      items: allowedTags.length > 0
        ? { type: 'string', enum: allowedTags }
        : { type: 'string' }, // si la agency no tiene tags, no proponer
      description: `Tags a agregar al lead. SOLO de la lista permitida: ${allowedTags.join(', ') || '(ninguno)'}. Array vacío si no aplica ninguno.`,
    },
    should_assign: {
      type: 'boolean',
      description: 'true SOLO si el lead pidió hablar con alguien específico o si calificó y debe asignarse a un agente. false por default.',
    },
    note_to_write: {
      type: 'string',
      description: 'Nota de contexto para el agente humano. Solo si hay info no estructurada relevante (ej. "el lead mencionó que es referido de Pedro"). String vacío si no aplica.',
    },
    handoff_reason: {
      type: 'string',
      enum: ['qualified', 'scheduling', 'objection_complex', 'bot_stuck', 'user_requested', 'manual', 'none'],
      description: "'qualified' si el lead califica y debe pasar a agente humano. 'scheduling' si pidió agendar. 'user_requested' si pidió hablar con humano. 'bot_stuck' si Sofia ya no puede ayudar. 'none' (default) si la conversación sigue.",
    },
    extractor_failed: {
      type: 'boolean',
      description: 'true si el lead dijo algo importante que no pudiste capturar. Para auditoría.',
    },
  },
  required: ['stage_change', 'qualified', 'tags_to_add', 'should_assign', 'note_to_write', 'handoff_reason'],
};

const schemaHash = require('node:crypto').createHash('sha256').update(JSON.stringify(schema)).digest('hex');

return [{
  json: {
    extractor_schema: schema,
    schema_version_hash: schemaHash,
    schema_meta: { stageSlugs, allowedTags, fieldKeys: Object.keys(captured_data_props) },
  }
}];
```

**`schema_version_hash`** se propaga al audit log (`bot_turns.schema_version_hash`) para que cuando un turno tenga un comportamiento raro podamos correlacionar con el schema EXACTO usado.

### 3.8 R8 — Validación determinista post-extractor

**Decisión:** Code Node "Validar Extractor Output" entre el Information Extractor y los Switches. Aplica reglas determinísticas, NO confía en `confidence` del LLM.

**Reglas (en orden):**

1. **`captured_data.<field_key>` con `field_type='number'`**: regex `/-?\d{1,3}(?:[.,]?\d{3})*(?:[.,]\d+)?/` sobre el mensaje literal del lead. Si el valor que devolvió el extractor NO aparece (o un número equivalente) en el mensaje → descartar.
2. **`captured_data.<field_key>` con `field_key='phone'` o `field_key` que contenga 'tel'**: regex `/(\+?\d[\d\s\-()]{7,}\d)/`. Si no aparece literal → descartar.
3. **`captured_data.<field_key>` con `field_key='email'` o que contenga 'email'**: regex `/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/`. Si no aparece literal → descartar.
4. **`stage_change`**: enum match contra `schema_meta.stageSlugs`. Si no matchea (raro post-extractor, pero defensive) → forzar a 'none'.
5. **`tags_to_add`**: enum match contra `schema_meta.allowedTags`. Filtrar los que no matchean. Log warning.
6. **`handoff_reason`**: enum match contra `['qualified','scheduling','objection_complex','bot_stuck','user_requested','manual','none']`. Si no matchea → forzar a 'none'.
7. **`qualified`**: enum match contra `['yes','no','unknown']`. Si no matchea → forzar a 'unknown'.

**Output del Code Node:**

```json
{
  "extractor_output_clean": { ... JSON limpio ... },
  "validation_warnings": [
    { "field": "captured_data.budget", "reason": "value_not_literal_in_message", "raw_value": 80000 },
    { "field": "tags_to_add[1]", "reason": "tag_not_in_allowed_list", "raw_value": "vip" }
  ]
}
```

Los `validation_warnings[]` se appendean a `bot_turns.metadata.validation_warnings` via `audit.write_turn`. Visible para debug.

**Caso edge:** si todo el JSON queda vacío post-validación (todos los campos descartados), el output_clean tiene solo los defaults (`stage_change: 'none'`, `handoff_reason: 'none'`, etc.). Los Switches no disparan ninguna HTTP. El turno se cierra como `done` sin acciones, lo cual es válido (muchos turnos son smalltalk).

### 3.9 R9 — Modelo del Sofia C conversador

**Decisión:** **`gpt-4o-mini` por default** en `bot-c-v1`. El A/B test del eval-harness define si se queda o sube a `gpt-4o` full.

**Por qué default mini:**

- El argumento de mantener GPT-4 era el tool-calling (la dificultad de elegir tools correctas). C QUITA las tools — el problema desaparece.
- La conversación pura inmobiliaria (descubrir necesidades, calificar conversacionalmente, mantener tono) está perfectamente al alcance de `gpt-4o-mini`.
- Ahorro: ~25x en tokens del conversador.
- El golden set v1 (80 turnos) tiene `expected_response_constraints` que mide si el reply es coherente. Si Sofia mini falla el constraint en >10% de los turnos en una corrida → subir a `gpt-4o`.

**Caveat documentado al builder:** si el founder al ver C corriendo siente que la calidad conversacional bajó, cambio del modelo en el nodo `OpenAI Chat Model - Sofia C` es 1 línea (`gpt-4o-mini` → `gpt-4o`), sin tocar nada más. **NO** justifica volver a A.

### 3.10 R10 — Modelo del Information Extractor

**Decisión:** **`gpt-4o-mini`** (sin opción de subir por ahora).

**Por qué:**
- El extractor solo devuelve JSON tipado contra schema enforced (no genera lenguaje natural).
- gpt-4o-mini con structured output es perfectamente capaz en tareas de extracción.
- Costo y latencia minimizan riesgo (extractor mal calibrado solo agrega ~$0.0005/turno y ~1-2s).
- Si en F7 vemos que el extractor falla casos importantes, subir a `gpt-4o-mini-2024-07-18` (versión específica más estable) o a `gpt-4o`.

---

## 4. Cambios SQL — Migración `0016_bot_clarifications_and_advisory.sql`

Migración aditiva. NO toca tablas existentes salvo agregar 'partial' al check constraint de `bot_turns.status`.

```sql
-- =============================================================================
-- Momentum AI CRM — Migration 0016: Bot Clarifications + Advisory Lock (F6 Build C)
-- =============================================================================
-- 2 piezas nuevas + 1 update al check constraint de bot_turns:
--   1. bot_clarification_events — eventos donde Sofia C invocó la escape hatch
--      Request_Clarification_Tool. Founder revisa para mejorar bot_config.
--   2. bot_acquire_lead_lock(uuid) + bot_release_lead_lock(uuid) — advisory lock
--      por lead_id para evitar race condition multi-turno (mesa adversarial fix #2).
--   3. bot_turns.status check: agregar 'partial' (extractor falló pero Sofia
--      respondió OK — estado nuevo introducido por arch C).
--
-- Aditiva. NO bloquea queries existentes. Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ENUM clarification_status + bot_clarification_events
-- -----------------------------------------------------------------------------

do $$ begin
    create type public.clarification_status as enum ('open', 'reviewed', 'dismissed');
exception when duplicate_object then null; end $$;

create table if not exists public.bot_clarification_events (
    id                      uuid primary key default gen_random_uuid(),
    agency_id               uuid not null references public.agencies(id) on delete cascade,
    lead_id                 uuid references public.leads(id) on delete set null,
    conversation_id         uuid references public.conversations(id) on delete set null,
    trace_id                uuid,
    topic                   text not null,
    raw_question            text not null,
    suggested_resolution    text,
    status                  public.clarification_status not null default 'open',
    reviewed_by             uuid references auth.users(id) on delete set null,
    reviewed_at             timestamptz,
    created_at              timestamptz not null default now()
);

create index if not exists idx_bot_clarification_agency_status
    on public.bot_clarification_events(agency_id, status, created_at desc);
create index if not exists idx_bot_clarification_trace
    on public.bot_clarification_events(trace_id) where trace_id is not null;

comment on table public.bot_clarification_events is
    'Eventos donde Sofia C invocó Request_Clarification_Tool (escape hatch). Founder los revisa para mejorar bot_config. Spec F6 §3.6.';

alter table public.bot_clarification_events enable row level security;

drop policy if exists bot_clarification_select on public.bot_clarification_events;
create policy bot_clarification_select on public.bot_clarification_events
    for select using (
        public.is_master() or public.is_member_of(agency_id)
    );

drop policy if exists bot_clarification_update on public.bot_clarification_events;
create policy bot_clarification_update on public.bot_clarification_events
    for update using (
        public.is_master() or public.is_member_of(agency_id)
    );

-- INSERT solo service_role (bot-actions edge function).
drop policy if exists bot_clarification_insert_service on public.bot_clarification_events;
create policy bot_clarification_insert_service on public.bot_clarification_events
    for insert with check (false);  -- bypaseado por service_role.

-- -----------------------------------------------------------------------------
-- 2. Advisory lock por lead_id (Postgres pg_advisory_lock)
-- -----------------------------------------------------------------------------

-- bot_acquire_lead_lock: aplica lock NO-transaccional (pg_advisory_lock).
-- Persiste hasta release explícito. Usado por handlers de bot-actions v0.4.0.
create or replace function public.bot_acquire_lead_lock(p_lead_id uuid)
returns void language plpgsql security definer
set search_path = public as $$
begin
    -- hashtext(uuid::text) -> int4 dentro del rango de pg_advisory_lock(bigint).
    -- Mismo lead_id -> mismo lock -> queue serializada.
    perform pg_advisory_lock(hashtext(p_lead_id::text));
end;
$$;

create or replace function public.bot_release_lead_lock(p_lead_id uuid)
returns void language plpgsql security definer
set search_path = public as $$
begin
    perform pg_advisory_unlock(hashtext(p_lead_id::text));
end;
$$;

grant execute on function public.bot_acquire_lead_lock(uuid) to service_role;
grant execute on function public.bot_release_lead_lock(uuid) to service_role;

comment on function public.bot_acquire_lead_lock(uuid) is
    'F6 — Advisory lock por lead_id para serializar escrituras del bot en turnos paralelos. SIEMPRE pair con bot_release_lead_lock en finally block. Spec F6 §3.5.';

-- -----------------------------------------------------------------------------
-- 3. bot_turns.status: agregar 'partial' al check constraint
-- -----------------------------------------------------------------------------

alter table public.bot_turns
    drop constraint if exists bot_turns_status_chk;

alter table public.bot_turns
    add constraint bot_turns_status_chk check (status in ('running','done','failed','partial'));

comment on column public.bot_turns.status is
    'Estado del turno. running=en proceso. done=completo OK. failed=crash mid-flight. partial=Sofia respondió pero extractor falló (solo C). Spec F6.';
```

**Notas para el operator:**

- Aplicar con `npx supabase migration up --linked` (project v2: `fahujscodhqlopycorzn`) o vía MCP `apply_migration`.
- La migración es idempotente: re-aplicarla no rompe nada.
- Si la migración falla en el `alter table ... drop constraint`, revisar primero si `bot_turns_status_chk` existe (debería desde 0015).

---

## 5. Cambios en `bot-actions` edge function — v0.3.0 → v0.4.0

### 5.1 Archivos que cambian

- `crm-v2/supabase/functions/bot-actions/index.ts` (modificación in-place, bump FN_VERSION).
- NO se crean archivos nuevos.

### 5.2 Constantes y helpers nuevos (al tope, debajo de los imports actuales)

```typescript
// F6 — Build C
const FN_VERSION = "0.4.0";   // ← bumpear (era 0.3.0)

// F6: nueva operation. NO va al Set de IDEMPOTENT_OPERATIONS (cada clarification
// es un evento distinto incluso si el topic es igual).
const CLARIFICATION_REASONS = new Set<string>([
  "out_of_schema",
  "ambiguous_request",
  "unknown_feature",
  "legal_question",
  "pricing_unknown",
  "other",
]);

// F6: ampliación del Set sistémico para no aplicar cross-tenant ni gate.
// audit.write_turn ya estaba; clarification.log se agrega.
const SYSTEMIC_OPERATIONS_V4 = new Set<string>([
  "audit.write_turn",
  "clarification.log",
]);
```

**Reemplazar el `SYSTEMIC_OPERATIONS` actual por `SYSTEMIC_OPERATIONS_V4`** o renombrar para mantener compat. Decisión: **renombrar `SYSTEMIC_OPERATIONS` y agregar `clarification.log` al Set existente** (1 línea de cambio, no romper).

### 5.3 Advisory lock wrapper

Funciones helper al tope:

```typescript
async function acquireLeadLock(sb: SupabaseClient, lead_id: string): Promise<boolean> {
  if (!lead_id || lead_id === "00000000-0000-0000-0000-000000000000") return false;
  const { error } = await sb.rpc("bot_acquire_lead_lock", { p_lead_id: lead_id });
  if (error) {
    console.warn("[F6] bot_acquire_lead_lock failed (continuing without lock):", {
      lead_id,
      error: error.message,
    });
    return false;
  }
  return true;
}

async function releaseLeadLock(sb: SupabaseClient, lead_id: string): Promise<void> {
  if (!lead_id || lead_id === "00000000-0000-0000-0000-000000000000") return;
  const { error } = await sb.rpc("bot_release_lead_lock", { p_lead_id: lead_id });
  if (error) {
    console.warn("[F6] bot_release_lead_lock failed:", {
      lead_id,
      error: error.message,
    });
  }
}
```

**Integración al router principal:** envolver el switch en try/finally:

```typescript
// En Deno.serve(...), después del cross-tenant guard, antes del switch:
let lockAcquired = false;
const shouldLock = !SYSTEMIC_OPERATIONS.has(operation);  // sistemics no lockean
if (shouldLock) {
  lockAcquired = await acquireLeadLock(supabase, lead_id);
}

try {
  // ... el switch existente con todos los handlers ...
} finally {
  if (lockAcquired) {
    await releaseLeadLock(supabase, lead_id);
  }
}
```

**Importante:** el lock NO bloquea entre `trace_id` distintos del mismo `lead_id`. Si el lead manda 2 mensajes que generan 2 turnos paralelos en N8N, cada uno con su trace_id propio, ambos van a competir por el mismo lock → el 2do espera al 1ro (correcto: serializa, evita race).

### 5.4 Handler nuevo: `clarification.log`

```typescript
type ClarificationLogParams = {
  topic?: unknown;
  raw_question?: unknown;
  suggested_resolution?: unknown;
  reason_category?: unknown;
};

async function handleClarificationLog(
  sb: SupabaseClient,
  params: ClarificationLogParams,
  ctx: OperationContext,
): Promise<Response> {
  const topic = typeof params.topic === "string" ? params.topic.trim().slice(0, 100) : "";
  const raw_question = typeof params.raw_question === "string"
    ? params.raw_question.trim().slice(0, 2000)
    : "";
  const suggested_resolution = typeof params.suggested_resolution === "string"
    ? params.suggested_resolution.trim().slice(0, 2000)
    : null;
  const reason_cat = typeof params.reason_category === "string"
    && CLARIFICATION_REASONS.has(params.reason_category)
    ? params.reason_category
    : "out_of_schema";

  if (!topic || !raw_question) {
    return jsonResponse({ ok: false, error: "missing_topic_or_question" }, 400);
  }

  const { error } = await sb.from("bot_clarification_events").insert({
    agency_id: ctx.agency_id,
    lead_id: ctx.lead_id || null,
    conversation_id: ctx.conversation_id,
    trace_id: ctx.trace_id,
    topic: `${reason_cat}:${topic}`,
    raw_question,
    suggested_resolution,
  });

  if (error) {
    console.error("clarification.log insert failed:", error.message);
    return jsonResponse({ ok: false, error: "db_error", detail: error.message });
  }

  console.log({
    event: "clarification.log",
    agency_id: ctx.agency_id,
    lead_id: ctx.lead_id,
    topic,
    reason_cat,
  });

  return jsonResponse({ ok: true, logged: true, topic, reason_category: reason_cat });
}
```

Agregar al switch (después de `case "audit.write_turn":`):

```typescript
case "clarification.log":
  return await handleClarificationLog(supabase, params as ClarificationLogParams, ctx);
```

### 5.5 Telegram alert dentro de `handoff.escalate`

**Contexto:** en `bot-v6-v2` (arch A), Telegram lo manda el `Notificar Agente (Telegram)` node DESPUÉS del `Detector de Descalificacion`. En arch C ese nodo no existe. La alerta DEBE mandarse desde algún lado. **Decisión: moverla al handler `handoff.escalate`** (server-to-server).

**Cambios al handler existente:**

```typescript
// Al final del handler handleHandoffEscalate, después del UPDATE exitoso a conversations:
// Mandar alerta Telegram al canal del agency (settings.telegram_chat_id si existe).

// 1. Leer agency settings para obtener telegram_chat_id
const { data: ag } = await sb
  .from("agencies")
  .select("settings, name")
  .eq("id", ctx.agency_id)
  .maybeSingle();

const telegramChatId = (ag?.settings as any)?.telegram_chat_id;
const telegramBotToken = Deno.env.get("TELEGRAM_BOT_TOKEN_INMOBILIARIA_DEMO_2026");

if (telegramChatId && telegramBotToken) {
  // 2. Leer datos del lead para el mensaje
  const { data: lead } = await sb
    .from("leads")
    .select("full_name, phone, display_name")
    .eq("id", ctx.lead_id)
    .maybeSingle();

  const leadName = lead?.full_name || lead?.display_name || "Lead sin nombre";
  const leadPhone = lead?.phone || "sin telefono";

  const text = [
    `Nuevo lead listo para handoff [arch C]`,
    ``,
    `Razon: ${(params as any).reason || "qualified"}`,
    `Resumen: ${(params as any).summary || "(sin resumen)"}`,
    `Telefono: ${leadPhone}`,
    `Nombre: ${leadName}`,
    `Agency: ${ag?.name || ctx.agency_id}`,
    ``,
    `El chatbot quedo apagado para este lead. Escribile directamente por WhatsApp.`,
  ].join("\n");

  try {
    const tgUrl = `https://api.telegram.org/bot${telegramBotToken}/sendMessage`;
    await fetch(tgUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: telegramChatId, text }),
    });
  } catch (e) {
    console.warn("Telegram alert failed (non-fatal):", (e as Error).message);
  }
}
```

**Env var nueva en Supabase secrets:** `TELEGRAM_BOT_TOKEN_INMOBILIARIA_DEMO_2026`. El founder ya tiene el bot creado (`inmobiliaria_demo_2026_bot`). Setear con `supabase secrets set TELEGRAM_BOT_TOKEN_INMOBILIARIA_DEMO_2026=<token>` en el proyecto v2.

**`agencies.settings.telegram_chat_id`:** seedeado manualmente por el founder en el record de la agency demo. Si no está, no se manda Telegram (degradación graciosa).

### 5.6 Tag `arch:'C'` en cada audit append

En la sección del router que llama a `bot_turns_append_tool_call` (introducido en F5), agregar el arch:

```typescript
// En el router, después del handler exitoso:
if (IDEMPOTENT_OPERATIONS.has(operation) && trace_id) {
  // Leer el arch del bot_turn row (puede ser A o C).
  const { data: turn } = await supabase
    .from("bot_turns")
    .select("arch")
    .eq("trace_id", trace_id)
    .maybeSingle();

  const archTag = turn?.arch || "A";

  await supabase.rpc("bot_turns_append_tool_call", {
    p_trace_id: trace_id,
    p_tool_entry: {
      tool: operation,
      params,
      response_status: 200,
      arch: archTag,  // ← NUEVO: distingue C invocations
      invoked_at: new Date().toISOString(),
    },
  });
}
```

---

## 6. Cambios en N8N — workflow C nuevo (`chatbot-momentum-bot-c-v1.json`)

### 6.1 Metadata

- **Name:** `Chatbot Momentum - bot-c v1`
- **active:** `false` (founder activa manual cuando quiera empezar A/B test).
- **versionId:** generado fresco (N8N lo asigna en PUT).
- **tags:** `bot-c`, `f6`, `hibrido-determinista`.

### 6.2 Estrategia del build script

`scripts/build-bot-c-v1.js` parte de `bot-v6-v2.json` (input) y aplica las siguientes mutaciones, en orden:

1. **Copiar** todos los nodos de v2.
2. **Borrar** nodos no-reusables (lista §6.3).
3. **Crear** nodos nuevos (lista §6.4).
4. **Modificar** nodos existentes (Componer System Prompt §7.1, Crear Trace de Turno §6.6).
5. **Recablear** conexiones (§6.5).
6. **Validar** con smoke tests (count, presencia de nodos críticos, sin tools en agent C, etc.).
7. **Escribir** `chatbot-momentum-bot-c-v1.json`.

### 6.3 Nodos a BORRAR (del baseline v2 al copiar)

| Nodo en v2 | Razón |
|---|---|
| `Agente Principal - Sofia` (LangChain Agent con 7 tools) | Reemplazado por `Sofia C` (LangChain Agent con 1 tool escape hatch). |
| `OpenAI Chat Model - Sofia` (sub-input del Agent) | Reemplazado por `OpenAI Chat Model - Sofia C` (`gpt-4o-mini`). |
| `Postgres Chat Memory - Sofia` | Reemplazado por `Postgres Chat Memory - Sofia C` (mismo schema, mismo session_id). |
| `Extractor_Tool_bot_actions`, `Stage_Tool_bot_actions`, `Qualify_Tool_bot_actions`, `Assign_Tool_bot_actions`, `Tag_Tool_bot_actions`, `Note_Tool_bot_actions`, `Request_Handoff_Tool`, `Supabase_Properties_Tool` | C NO usa toolHttpRequest para acciones; los 7 se borran. (Properties ya estaba desconectada en v2.) |
| `Detector de Descalificacion` (informationExtractor para handoff route) | C tiene UN solo extractor principal que decide handoff_reason. La rama paralela se borra. |
| `OpenAI Chat Model - Detector` | Sub-input del Detector. |
| `Apagar bot?` (IF) | La decisión de apagar bot la toma el extractor principal + bot-actions.handoff.escalate. |
| `Apagar Chatbot — Conversation` (postgres) | Lo hace bot-actions.handoff.escalate. |
| `Apagar Chatbot — Lead Summary` (postgres) | El summary lo escribe el extractor (campo `note_to_write`) → bot-actions.note.write. |
| `Notificar Agente (Telegram)` | Telegram movido al handler de bot-actions.handoff.escalate (§5.5). |

**Total borrados: ~14 nodos.**

### 6.4 Nodos a CREAR en `bot-c-v1`

**Importante:** las posiciones x/y son **aproximadas** (el builder las ajusta para no overlapear con stickies; estos números asumen el origen relativo del v2 baseline).

| # | Nombre | Type | typeVersion | Posición aprox. | Parámetros clave |
|---|---|---|---|---|---|
| C1 | `Sofia C` | `@n8n/n8n-nodes-langchain.agent` | 2.2 | x=-1300, y=400 | `text={{ $('Unificacion de Variables').first().json['Mensaje actual del usuario'] }}`. `options.systemMessage={{ $('Componer System Prompt').first().json.system_prompt }}`. NO promptType extra; usa default. **Tool input: SOLO Request_Clarification_Tool conectado.** |
| C2 | `OpenAI Chat Model - Sofia C` | `@n8n/n8n-nodes-langchain.lmChatOpenAi` | 1.3 | x=-1280, y=580 | `model.value='gpt-4o-mini'`. `options.temperature=0.3`. `options.maxTokens=400`. Credenciales: `Optimiza AI` (misma que v2). |
| C3 | `Postgres Chat Memory - Sofia C` | `@n8n/n8n-nodes-langchain.memoryPostgresChat` | 1.3 | x=-1100, y=580 | `sessionIdType='customKey'`. `sessionKey={{ $('Variables').first().json.conversation_id }}`. `contextWindowLength=20`. `tableName='n8n_chat_histories'`. Credenciales: `Inmobiliaria`. |
| C4 | `Request_Clarification_Tool` | `@n8n/n8n-nodes-langchain.toolHttpRequest` | 1.1 | x=-900, y=580 | `toolDescription="Usá esta tool SOLO si el lead te pregunta algo importante para tu rol que NO encaja en tu conocimiento actual del negocio. Ejemplos: una promo no documentada, un servicio que no mencionaste, una pregunta legal específica. NO la uses para smalltalk, calificación normal, o casos típicos. Va a registrar el evento para que el founder lo revise."`. `method=POST`. `url={{ $env.SUPABASE_V2_URL }}/functions/v1/bot-actions`. `sendHeaders=true`, headers: `Authorization: Bearer {{ $env.BOT_ACTIONS_SECRET }}`, `Content-Type: application/json`. `sendBody=true`, `specifyBody=json`, `jsonBody={{ JSON.stringify({ operation: 'clarification.log', agency_id: $('Resolve Agency').first().json.agency_id, lead_id: $('Buscar Lead (Supabase)').first().json.id, conversation_id: $('Get Conversation State').first().json.id, trace_id: $('Unificacion de Variables').first().json.__trace_id, params: { topic: $fromAI('topic', 'Categoria 1-3 palabras de la pregunta', 'string'), raw_question: $fromAI('raw_question', 'El texto literal del lead', 'string'), suggested_resolution: $fromAI('suggested_resolution', 'Qué creés que el founder debería responder', 'string'), reason_category: $fromAI('reason_category', "Una de: out_of_schema, ambiguous_request, unknown_feature, legal_question, pricing_unknown, other", 'string') } }) }}`. |
| C5 | `Construir Schema Extractor` | `n8n-nodes-base.code` | 2 | x=-700, y=400 | jsCode: §3.7 completo. Output: `{ extractor_schema, schema_version_hash, schema_meta }`. |
| C6 | `Capturar Contexto Para Extractor` | `n8n-nodes-base.set` | 3.4 | x=-500, y=400 | Set fields: `lead_msg={{ $('Variables').first().json['Mensaje actual del usuario'] }}`, `sofia_reply={{ $('Sofia C').first().json.output }}`, `lead_attributes={{ JSON.stringify($('Buscar Lead (Supabase)').first().json) }}`. |
| C7 | `Information Extractor C` | `@n8n/n8n-nodes-langchain.informationExtractor` | 1.2 | x=-300, y=400 | `text={{ '## Ultimo mensaje del lead\n' + $('Capturar Contexto Para Extractor').first().json.lead_msg + '\n\n## Respuesta que dio Sofia\n' + $('Capturar Contexto Para Extractor').first().json.sofia_reply + '\n\n## Datos ya capturados del lead\n' + $('Capturar Contexto Para Extractor').first().json.lead_attributes }}`. `schemaType=fromJson`. `inputSchema={{ JSON.stringify($('Construir Schema Extractor').first().json.extractor_schema) }}`. `options.systemPromptTemplate=` (prompt del extractor §7.2). |
| C8 | `OpenAI Chat Model - Extractor` | `@n8n/n8n-nodes-langchain.lmChatOpenAi` | 1.3 | x=-280, y=580 | `model.value='gpt-4o-mini'`. `options.temperature=0`. `options.maxTokens=600`. `options.responseFormat=json_object`. |
| C9 | `Validar Extractor Output` | `n8n-nodes-base.code` | 2 | x=-100, y=400 | jsCode: §3.8 completo (regex + enum match). Output: `{ extractor_output_clean, validation_warnings }`. |
| C10 | `Audit Extractor Output` | `n8n-nodes-base.code` | 2 | x=100, y=400 | Code que llama `bot-actions.audit.write_turn` con `patch: { extractor_output_json, schema_version_hash, metadata.validation_warnings, arch: 'C' }`. Try/catch silencioso. |
| C11 | `Switch1 — extractor_data presente?` | `n8n-nodes-base.if` | 2.2 | x=300, y=400 | Condition: `{{ Object.keys($('Validar Extractor Output').first().json.extractor_output_clean.captured_data || {}).length > 0 }}`. True → HTTP extractor.write. False → siguiente (skip a Merge1). |
| C12 | `HTTP — extractor.write` | `n8n-nodes-base.httpRequest` | 4.2 | x=500, y=300 | POST a `{{ $env.SUPABASE_V2_URL }}/functions/v1/bot-actions`. Headers: Authorization + Content-Type. JSON body: `{ operation: 'extractor.write', agency_id, lead_id, conversation_id, trace_id, params: { fields: [...mapping desde captured_data] } }`. Timeout 10s. `onError: continueRegularOutput`. **El mapeo `captured_data → fields` requiere un mini transform inline en la expresión.** Detalle §6.7. |
| C13 | `Merge1 — Wait Extractor Write` | `n8n-nodes-base.merge` | 3 | x=700, y=400 | Mode: `combineAll` (wait both branches). Inputs: rama HTTP extractor + rama skip. |
| C14 | `Switch2 — Acciones Medias` (qualify/stage/tag/assign/note) | `n8n-nodes-base.switch` | 3.2 | x=900, y=400 | 5 outputs paralelos. Cada output va a su HTTP correspondiente, condition es presencia del campo en el JSON limpio. Detalle outputs en §6.7 tabla. |
| C15 | `HTTP — qualify.set` | `n8n-nodes-base.httpRequest` | 4.2 | x=1100, y=200 | POST bot-actions con `operation:'qualify.set'`, params: `{ is_qualified: <yes/no/unknown del extractor> }`. |
| C16 | `HTTP — stage.set` | `n8n-nodes-base.httpRequest` | 4.2 | x=1100, y=320 | `operation:'stage.set'`, params: `{ stage_slug: <stage_change del extractor> }`. |
| C17 | `HTTP — tag.add` | `n8n-nodes-base.httpRequest` | 4.2 | x=1100, y=440 | `operation:'tag.add'`, params: `{ tags: <tags_to_add[]> }`. |
| C18 | `HTTP — assign.set` | `n8n-nodes-base.httpRequest` | 4.2 | x=1100, y=560 | `operation:'assign.set'`, params: `{ strategy: 'round_robin' }` (si should_assign=true). |
| C19 | `HTTP — note.write` | `n8n-nodes-base.httpRequest` | 4.2 | x=1100, y=680 | `operation:'note.write'`, params: `{ body: <note_to_write> }`. |
| C20 | `Merge2 — Wait Acciones Medias` | `n8n-nodes-base.merge` | 3 | x=1300, y=400 | Mode: `combineAll`. Espera las 5 ramas (o no-disparadas). |
| C21 | `Switch3 — handoff_reason ≠ none?` | `n8n-nodes-base.if` | 2.2 | x=1500, y=400 | Condition: `{{ $('Validar Extractor Output').first().json.extractor_output_clean.handoff_reason !== 'none' }}`. |
| C22 | `HTTP — handoff.escalate` | `n8n-nodes-base.httpRequest` | 4.2 | x=1700, y=300 | `operation:'handoff.escalate'`, params: `{ reason: <handoff_reason>, summary: <auto-resumen del extractor>, summary_source:'extractor' }`. |
| C23 | `Merge3 — Final` | `n8n-nodes-base.merge` | 3 | x=1900, y=400 | Junta rama handoff + skip. Output → `Cerrar Trace de Turno`. |
| C24 | `Sticky — Sofia C` | `n8n-nodes-base.stickyNote` | 1 | x=-1400, y=200 | Descripción del cambio arquitectónico: "C: Sofia sin tools, gpt-4o-mini. Solo conversa. Las acciones de DB las dispara el extractor + Switches → bot-actions." |
| C25 | `Sticky — Extractor + Validación` | `n8n-nodes-base.stickyNote` | 1 | x=-300, y=200 | "Information Extractor convierte el turno en JSON tipado contra schema dinámico por agency. Validar Extractor Output aplica regex + enum match. NO confiamos en confidence del LLM." |
| C26 | `Sticky — Cascada de Switches` | `n8n-nodes-base.stickyNote` | 1 | x=500, y=140 | "3 grupos secuenciales: Extractor → Acciones medias (paralelas) → Handoff. Cada grupo termina en Merge wait. Orden semántico obligatorio." |

**Total nodos C: ~26 nuevos + 51 reusados de v2 (sin los 14 borrados) = ~63 nodos.** Más manejable que A (77).

### 6.5 Conexiones — cambios al recablear

Conexiones **borradas** (las que llegaban o salían de los nodos eliminados):

- `Unificacion de Variables` → `Agente Principal - Sofia` (borrada).
- `Agente Principal - Sofia` → `Cerrar Trace de Turno` (borrada — la cadena de cierre cambia).
- `Cerrar Trace de Turno` → `Formateador de Mensajes` (queda igual, pero se reconecta vía nueva cadena).
- `Sofia` → `Detector de Descalificacion` (borrada).
- `Detector de Descalificacion` → `Apagar bot?` → `Apagar Chatbot — Conversation` → `Apagar Chatbot — Lead Summary` → `Notificar Agente (Telegram)` (toda la rama borrada).
- Las 8 conexiones ai_tool del `Agente Principal - Sofia` (a las 7 tools + 1 properties) (borradas).
- `OpenAI Chat Model - Sofia` ai_languageModel → `Agente Principal - Sofia` (borrada).
- `Postgres Chat Memory - Sofia` ai_memory → `Agente Principal - Sofia` (borrada).

Conexiones **nuevas**:

- `Unificacion de Variables` → `Sofia C` (main).
- `OpenAI Chat Model - Sofia C` (ai_languageModel) → `Sofia C`.
- `Postgres Chat Memory - Sofia C` (ai_memory) → `Sofia C`.
- `Request_Clarification_Tool` (ai_tool) → `Sofia C`.
- `Sofia C` (main) → `Construir Schema Extractor`.
- `Construir Schema Extractor` (main) → `Capturar Contexto Para Extractor`.
- `Capturar Contexto Para Extractor` (main) → `Information Extractor C`.
- `OpenAI Chat Model - Extractor` (ai_languageModel) → `Information Extractor C`.
- `Information Extractor C` (main) → `Validar Extractor Output`.
- `Validar Extractor Output` (main) → `Audit Extractor Output`.
- `Audit Extractor Output` (main) → `Switch1 — extractor_data presente?`.
- `Switch1 - true` → `HTTP — extractor.write`.
- `Switch1 - false` → `Merge1 — Wait Extractor Write` (input 1).
- `HTTP — extractor.write` → `Merge1 — Wait Extractor Write` (input 2).
- `Merge1` (main) → `Switch2 — Acciones Medias`.
- `Switch2 - output 1` (qualify) → `HTTP — qualify.set` → `Merge2`.
- `Switch2 - output 2` (stage) → `HTTP — stage.set` → `Merge2`.
- `Switch2 - output 3` (tag) → `HTTP — tag.add` → `Merge2`.
- `Switch2 - output 4` (assign) → `HTTP — assign.set` → `Merge2`.
- `Switch2 - output 5` (note) → `HTTP — note.write` → `Merge2`.
- `Switch2 - fallback` (ninguno) → directo a `Merge2`.
- `Merge2` (main) → `Switch3 — handoff_reason ≠ none?`.
- `Switch3 - true` → `HTTP — handoff.escalate`.
- `Switch3 - false` → `Merge3`.
- `HTTP — handoff.escalate` → `Merge3`.
- `Merge3` (main) → `Cerrar Trace de Turno`.

### 6.6 Modificaciones a Code Nodes reusados de v2

**`Crear Trace de Turno`:** cambiar `arch: 'A'` → `arch: 'C'` (línea 118 del jsCode actual). Eval synthetic flag se mantiene → `arch: 'eval-C'` cuando aplica.

**`Componer System Prompt`:** §7.1 (rewrite del jsCode).

**`Cerrar Trace de Turno`:** sin cambio funcional, pero hay que verificar que el output del agent C tenga `$json.output` (igual que v2 — el `LangChain Agent` node siempre expone `output`).

### 6.7 Mapping `captured_data → fields` en `HTTP — extractor.write`

El extractor devuelve `captured_data` como objeto plano: `{ nombre_lead: "Juan", presupuesto: 200000, telefono: "+50688887777" }`. El handler `extractor.write` espera `params.fields` como array `[{ field_key, value }, ...]`.

**Transform inline en la expresión del jsonBody del nodo HTTP — extractor.write:**

```
={{ JSON.stringify({
  operation: 'extractor.write',
  agency_id: $('Resolve Agency').first().json.agency_id,
  lead_id: $('Buscar Lead (Supabase)').first().json.id,
  conversation_id: $('Get Conversation State').first().json.id,
  trace_id: $('Unificacion de Variables').first().json.__trace_id,
  params: {
    fields: Object.entries($('Validar Extractor Output').first().json.extractor_output_clean.captured_data || {})
      .filter(([k, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => ({ field_key: k, value: v }))
  }
}) }}
```

**Validación esencial:** este mapping asume que las keys de `captured_data` matchean `field_def.field_key` 1-a-1. Por eso §3.7 construye `captured_data.properties` desde los `field_def.field_key` reales — los nombres están sincronizados por construcción.

---

## 7. Cambios a los 2 prompts (conversador C + extractor C)

### 7.1 Prompt de Sofia C (modificación al jsCode de `Componer System Prompt`)

**Cambios respecto al jsCode actual de v2:**

1. **QUITAR** los siguientes bloques del system_prompt:
   - `## AUTO-ACCIONES PERMITIDAS` (bloque F4 que listaba las 5 auto-actions toggleables).
   - `## DATOS A CAPTURAR` (bloque F2 que instruía sobre Extractor_Tool).
   - `## CUANDO USAR CADA TOOL` (si existía explícito).
   - Cualquier mención a `Extractor_Tool_bot_actions`, `Stage_Tool_bot_actions`, etc.

2. **AGREGAR** al bloque `## REGLAS DURAS` (o crearlo si no existe):

```
## REGLAS DURAS

1. NUNCA prometas acciones imperativas como "te asigno con Pedro", "te creo un ticket",
   "ya marqué tu lead como caliente". El sistema decide eso DESPUES de tu respuesta,
   por su cuenta. Vos solo conversa.

2. Usá lenguaje CONDICIONAL para acciones:
   - MAL: "Te asigno con Pedro ahora."
   - BIEN: "Voy a registrar tu interes para que un agente del equipo te contacte."
   - MAL: "Listo, te agendé la visita para el sabado."
   - BIEN: "Perfecto, voy a pasar tu interes en agendar visita para el sabado. Un agente
            del equipo confirma horario contigo."

3. Si el lead pide hablar con humano explicito → respondé con la frase condicional
   ("voy a pasar tu solicitud para que un agente te escriba directamente") y NO
   intentes seguir calificando.

4. Si el lead te pregunta algo IMPORTANTE que no sabés (promo nueva, servicio no
   documentado, pregunta legal), usá la tool Request_Clarification_Tool para
   registrar el evento. Despues respondé al lead con "dejame validar eso y te
   confirmo en un momento".

5. NO inventes precios, direcciones, nombres de agentes, fechas. Si no lo sabés,
   decilo: "no tengo ese dato a mano, dejame consultar".

6. Mantené tono [tono de bot_config]. Máximo 3 lineas por mensaje.
```

3. **AGREGAR** un bloque corto `## CONTEXTO DEL TURNO`:

```
## CONTEXTO DEL TURNO

- Stage actual del lead: [valor de leads.stage o "nuevo"]
- Datos ya capturados: [lista de extractor_field_values del lead]
- Cantidad de mensajes en la conversación: [conversations.message_count]
```

4. **REDUCIR** el bloque `## CORE` (texto global de Sofia) si tiene >800 tokens — quedan ~1500 efectivos.

**Resultado esperado:** prompt ~1800 tokens vs ~3000 actual (-40%). Sin tools metadata (~150 tokens más ahorrados).

**Anti-patterns críticos (NO hacer):**

- NO mencionar las edge functions ni los handlers de bot-actions en el prompt. El LLM no debe saber qué pasa "atrás". Solo conversa.
- NO darle few-shots de tool calls. C no usa tools de DB.
- NO meter "checklist de calificación" como instrucción imperativa al LLM. Eso lo hace el extractor.

### 7.2 Prompt del Information Extractor C (parámetro `systemPromptTemplate` del nodo C7)

```
Sos un extractor de datos estructurados. Recibís el ultimo mensaje del lead, la
respuesta que dio el bot, y los datos ya capturados del lead. Devolvés JSON
tipado contra el schema dado.

REGLAS NO NEGOCIABLES:

1. Solo extraés información PRESENTE LITERAL en el mensaje del lead o que se
   pueda inferir SIN AMBIGUEDAD del contexto del turno. NO INVENTAS.

2. Si un campo no aparece, omitilo o devolvelo null. No completes con guesses.

3. Para captured_data:
   - Cada field key viene del schema. Solo lleñá los que el lead mencionó EN ESTE
     turno. NO repitas datos que ya estan en "Datos ya capturados".
   - Numbers solo si el lead dijo un numero literal o lo escribió con palabras
     (ej. "dos mil dolares" -> 2000).
   - Booleans solo si el lead dijo si/no explicito.
   - Strings solo si el lead lo dijo textual; nunca infieras nombres ni datos.

4. Para stage_change:
   - Solo cambiá si el turno demuestra clara progresión en el pipeline.
   - Default 'none'. Cuando dudes, usá 'none'.

5. Para qualified:
   - 'yes' SOLO si el lead dijo algo que califica según el negocio (budget >
     mínimo, intención clara de compra, fecha concreta). El bot_config define
     que califica.
   - 'no' SOLO si descartó explícito ("no me interesa", "ya no busco").
   - 'unknown' por default.

6. Para handoff_reason:
   - 'qualified' si el lead califica completamente.
   - 'scheduling' si pidió agendar visita o cita concreta.
   - 'user_requested' si pidió hablar con humano explicito.
   - 'objection_complex' si hay objeción que Sofia no puede resolver.
   - 'bot_stuck' si la conversación está dando vueltas sin avanzar.
   - 'none' por default. Cuando dudes, 'none'.

7. Para should_assign: true SOLO si handoff_reason != 'none' o si el lead pidió
   específicamente hablar con alguien. false por default.

8. Para tags_to_add: solo de la lista permitida en el schema enum. Array vacío si
   no aplica ninguno claramente.

9. Para extractor_failed: true SOLO si el lead dijo algo importante que vos
   detectaste pero no pudiste mapear a ningún campo del schema. Esto ayuda al
   founder a saber que hay que ampliar el schema.

10. Si la respuesta de Sofia contiene una promesa explícita ("voy a registrar
    tu interés para que un agente te contacte"), debés disparar la acción
    correspondiente (en este caso handoff_reason='user_requested' o
    'scheduling' según contexto). Sofia y vos están coordinados.

FORMATO: JSON real con llaves estándar, NO YAML, NO texto suelto. El schema
forzado del system te valida la estructura.
```

---

## 8. Cambios en N8N — workflow `bot-v6-v2` actual

**CERO.** F6 NO toca el workflow A.

Verificación que el reviewer DEBE hacer: `git diff main -- crm-v2/n8n/workflows/chatbot-momentum-bot-v6-v2.json` → debe ser vacío.

---

## 9. Scripts nuevos

### 9.1 `crm-v2/scripts/build-bot-c-v1.js`

Build script idempotente. Patrón: lee `bot-v6-v2.json`, aplica mutaciones, escribe `chatbot-momentum-bot-c-v1.json`.

**Estructura esperada (sketch, no es el código completo):**

```javascript
// build-bot-c-v1.js
//
// Transforma  n8n/workflows/chatbot-momentum-bot-v6-v2.json
//        →    n8n/workflows/chatbot-momentum-bot-c-v1.json
//
// Spec: memory/n8n-changes/2026-05-30-F6-build-c-hibrido-determinista.md
//
// F6 = Build C (arquitectura híbrida determinista). Workflow SEPARADO, no toca
// bot-v6-v2. Reusa nodos no-LLM (entry, normalize, resolve agency, lead,
// conversation, formateador, office_hours, F5 instrumentación) y reemplaza la
// rama LLM por: Sofia C (sin tools, con escape hatch) → Information Extractor
// → Validar → 3 grupos secuenciales de Switches + HTTP a bot-actions.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const IN_PATH = path.join(ROOT, 'n8n', 'workflows', 'chatbot-momentum-bot-v6-v2.json');
const OUT_PATH = path.join(ROOT, 'n8n', 'workflows', 'chatbot-momentum-bot-c-v1.json');

const wf = JSON.parse(fs.readFileSync(IN_PATH, 'utf8'));

// 1. Metadata
wf.name = 'Chatbot Momentum - bot-c v1';
wf.active = false;
wf.tags = [
  ...(wf.tags || []).filter(t => t.name !== 'inmobiliaria-demo'),
  { name: 'bot-c' },
  { name: 'f6' },
  { name: 'hibrido-determinista' },
];
delete wf.versionId;
delete wf.id;

// 2. Borrar nodos de la lista §6.3
const NODES_TO_DELETE = [
  'Agente Principal - Sofia',
  'OpenAI Chat Model - Sofia',
  'Postgres Chat Memory - Sofia',
  'Extractor_Tool_bot_actions',
  'Stage_Tool_bot_actions',
  'Qualify_Tool_bot_actions',
  'Assign_Tool_bot_actions',
  'Tag_Tool_bot_actions',
  'Note_Tool_bot_actions',
  'Request_Handoff_Tool',
  'Supabase_Properties_Tool',
  'Detector de Descalificacion',
  'OpenAI Chat Model - Detector',
  'Apagar bot?',
  'Apagar Chatbot — Conversation',
  'Apagar Chatbot — Lead Summary',
  'Notificar Agente (Telegram)',
];
wf.nodes = wf.nodes.filter(n => !NODES_TO_DELETE.includes(n.name));

// Limpiar conexiones que apunten a esos nodos
for (const fromName of Object.keys(wf.connections)) {
  if (NODES_TO_DELETE.includes(fromName)) {
    delete wf.connections[fromName];
    continue;
  }
  const outs = wf.connections[fromName];
  for (const outType of Object.keys(outs)) {
    outs[outType] = outs[outType].map(arr =>
      arr.filter(conn => !NODES_TO_DELETE.includes(conn.node))
    );
  }
}

// 3. Crear nodos nuevos §6.4 (C1-C26)
// ... (~600 líneas de definiciones de nodos. El builder los define usando los
//      typeVersions/parameters del spec §6.4)

// 4. Modificar Componer System Prompt §7.1
const composer = wf.nodes.find(n => n.name === 'Componer System Prompt');
composer.parameters.jsCode = NEW_COMPOSER_JSCODE; // del spec §7.1

// 5. Modificar Crear Trace de Turno §6.6 — cambiar 'A' por 'C'
const tracer = wf.nodes.find(n => n.name === 'Crear Trace de Turno');
tracer.parameters.jsCode = tracer.parameters.jsCode.replace(
  /arch:\s*is_eval_synthetic\s*\?\s*'eval-A'\s*:\s*'A'/,
  "arch: is_eval_synthetic ? 'eval-C' : 'C'"
);

// 6. Crear conexiones nuevas §6.5
function addConn(from, to, type = 'main', index = 0) {
  if (!wf.connections[from]) wf.connections[from] = {};
  if (!wf.connections[from][type]) wf.connections[from][type] = [];
  while (wf.connections[from][type].length <= index) {
    wf.connections[from][type].push([]);
  }
  wf.connections[from][type][index].push({ node: to, type, index: 0 });
}

addConn('Unificacion de Variables', 'Sofia C');
addConn('OpenAI Chat Model - Sofia C', 'Sofia C', 'ai_languageModel');
addConn('Postgres Chat Memory - Sofia C', 'Sofia C', 'ai_memory');
addConn('Request_Clarification_Tool', 'Sofia C', 'ai_tool');
addConn('Sofia C', 'Construir Schema Extractor');
// ... resto de las conexiones nuevas (§6.5)

// 7. Smoke tests
const nodeNames = wf.nodes.map(n => n.name);
const REQUIRED_NEW = [
  'Sofia C', 'OpenAI Chat Model - Sofia C', 'Postgres Chat Memory - Sofia C',
  'Request_Clarification_Tool', 'Construir Schema Extractor',
  'Capturar Contexto Para Extractor', 'Information Extractor C',
  'OpenAI Chat Model - Extractor', 'Validar Extractor Output',
  'Audit Extractor Output', 'Switch1 — extractor_data presente?',
  'HTTP — extractor.write', 'Merge1 — Wait Extractor Write',
  'Switch2 — Acciones Medias', 'HTTP — qualify.set', 'HTTP — stage.set',
  'HTTP — tag.add', 'HTTP — assign.set', 'HTTP — note.write',
  'Merge2 — Wait Acciones Medias', 'Switch3 — handoff_reason ≠ none?',
  'HTTP — handoff.escalate', 'Merge3 — Final',
];
const missing = REQUIRED_NEW.filter(n => !nodeNames.includes(n));
if (missing.length > 0) throw new Error(`Missing nodes: ${missing.join(', ')}`);

// Verificar que Sofia C tiene SOLO 1 tool (Request_Clarification_Tool)
const sofiaConns = Object.entries(wf.connections)
  .filter(([_, outs]) => outs.ai_tool?.some(arr => arr.some(c => c.node === 'Sofia C')))
  .map(([from]) => from);
if (sofiaConns.length !== 1 || sofiaConns[0] !== 'Request_Clarification_Tool') {
  throw new Error(`Sofia C debe tener exactamente 1 tool (Request_Clarification_Tool). Tiene: ${sofiaConns}`);
}

// Verificar que no quedan referencias a las 7 tools eliminadas
const wfStr = JSON.stringify(wf);
for (const deleted of NODES_TO_DELETE) {
  if (wfStr.includes(deleted)) {
    throw new Error(`Nodo eliminado "${deleted}" todavía aparece en el JSON (residuo de conexión o referencia).`);
  }
}

// 8. Escribir
fs.writeFileSync(OUT_PATH, JSON.stringify(wf, null, 2));
console.log(`OK — ${OUT_PATH} (${wf.nodes.length} nodos, ${Object.keys(wf.connections).length} sources)`);
```

### 9.2 Nada más

No hace falta otro script. El eval-runner (`scripts/eval-runner.mjs`) ya existe de F5 y solo cambia su flag `--workflow-id` cuando se corre contra C.

---

## 10. Plan de deploy paso a paso

**Asunción:** sesión de un solo agente (n8n-builder) ejecutando la spec. Founder confirma "go" en cada bloque (a, b, c, d).

### Bloque (a) — Migración SQL + edge function v0.4.0

1. Aplicar migración `0016_bot_clarifications_and_advisory.sql` en proyecto v2 (`fahujscodhqlopycorzn`) via MCP `apply_migration` o `npx supabase migration up --linked`.
2. Setear secret `TELEGRAM_BOT_TOKEN_INMOBILIARIA_DEMO_2026` en Supabase secrets del proyecto v2.
3. Validar (vía MCP `execute_sql`):
   - `SELECT * FROM pg_proc WHERE proname IN ('bot_acquire_lead_lock','bot_release_lead_lock')` → 2 filas.
   - `SELECT * FROM bot_clarification_events LIMIT 0` → ok (tabla existe).
   - `SELECT con.consrc FROM pg_constraint con WHERE conname='bot_turns_status_chk'` → debe incluir 'partial'.
4. Actualizar `crm-v2/supabase/functions/bot-actions/index.ts` con cambios §5 (bump FN_VERSION="0.4.0", helpers de lock, handler clarification.log, Telegram alert en handoff, tag arch).
5. Deploy: MCP `deploy_edge_function` (project_id `fahujscodhqlopycorzn`, function_name `bot-actions`).
6. Smoke test edge function:
   ```bash
   curl -X POST https://fahujscodhqlopycorzn.supabase.co/functions/v1/bot-actions \
     -H "Authorization: Bearer $BOT_ACTIONS_SECRET" \
     -H "Content-Type: application/json" \
     -d '{"operation":"healthcheck"}' | jq
   ```
   Esperado: `{ok:true, version:"0.4.0", ...}`.

### Bloque (b) — Build y commit del workflow C

7. Ejecutar `node crm-v2/scripts/build-bot-c-v1.js`.
8. Smoke test del JSON: count nodos ≥55, presencia de los 23 nodos nuevos requeridos, Sofia C con 1 tool, etc. (el script lo hace).
9. Validar expresiones N8N: `node crm-v2/scripts/validate-n8n-expressions.js crm-v2/n8n/workflows/chatbot-momentum-bot-c-v1.json` → 0 errores.
10. `git add crm-v2/n8n/workflows/chatbot-momentum-bot-c-v1.json crm-v2/scripts/build-bot-c-v1.js crm-v2/supabase/functions/bot-actions/index.ts crm-v2/supabase/migrations/0016_*.sql`.
11. Commit con mensaje:
    ```
    feat(n8n+bot-actions): F6 build C - hibrido determinista

    - Migracion 0016: bot_clarification_events + advisory lock por lead_id
    - bot-actions v0.4.0: clarification.log + lock wrapper + telegram en handoff
    - Workflow nuevo bot-c-v1 (no toca bot-v6-v2)

    Spec: memory/n8n-changes/2026-05-30-F6-build-c-hibrido-determinista.md
    Tag rollback: bot-v6-pre-migracion-C-2026-05-30
    ```
12. Push branch `feat/f6-build-c`. Crear PR + Vercel preview.

### Bloque (c) — Deploy a N8N (sin activar)

13. PUT workflow a N8N: `node crm-v2/scripts/n8n-push.mjs <NEW_WORKFLOW_ID_OR_NEW> crm-v2/n8n/workflows/chatbot-momentum-bot-c-v1.json`. **N8N asigna un ID nuevo.** Capturar el ID. Anotarlo en la spec actualizada o en `memory/decisions.md`.
14. Verificar en N8N UI:
    - Workflow `Chatbot Momentum - bot-c v1` visible.
    - `active: false`.
    - 1 Sofia C, 1 tool (escape hatch), 1 Information Extractor C.
    - Sin las 7 tools de A.

### Bloque (d) — Smoke test conversacional

15. **Founder activa manualmente** `bot-v6-v2` (lo mantiene activo como baseline) Y `bot-c-v1` (lo activa para test) — ambos workflows recibirán mensajes si están suscritos al mismo webhook YCloud. **PROBLEMA:** YCloud manda el inbound a UN solo webhook. Decisión: **deshabilitar `bot-v6-v2` antes de activar `bot-c-v1`** (testing serializado).
16. Founder manda 5 mensajes de prueba (smoke set, distinto al golden set automático):
    - "hola"
    - "tengo 200 mil de presupuesto, busco casa en Heredia"
    - "me podes mandar fotos?"
    - "quiero hablar con un humano por favor"
    - "ok perfecto chau"
17. Verificar en bot_turns:
    ```sql
    SELECT trace_id, arch, status, tokens_in, tokens_out, tokens_cached,
           latency_total_ms, jsonb_array_length(tools_invocadas) AS tools_count,
           extractor_output_json IS NOT NULL AS has_extractor_output,
           schema_version_hash
    FROM bot_turns
    WHERE arch = 'C'
    ORDER BY started_at DESC LIMIT 10;
    ```
    Esperado: 5 filas con `arch='C'`, `status='done'`, `extractor_output_json` poblado.

### Bloque (e) — Eval harness contra C

18. Cambiar env var en N8N: `EVAL_TARGET_WEBHOOK_URL` apunta al webhook test del workflow C nuevo.
19. Activar `eval-harness-v1`.
20. Correr: `node crm-v2/scripts/eval-runner.mjs --arch=C --workflow-id=<id_de_bot_c_v1> --golden-set=crm-v2/eval/golden-set/v1.jsonl --label="C baseline F6 deploy"`.
21. Esperado: 80 turnos procesados, tabla resumen en stdout (pass/partial/fail counts + p50/p95 + cost).
22. Comparar contra el run de F5 sobre A:
    ```sql
    SELECT arch, label, pass_count, partial_count, fail_count,
           p50_ms, p95_ms, total_cost_usd, golden_set_total
    FROM eval_runs
    WHERE label ILIKE '%baseline%'
    ORDER BY started_at DESC LIMIT 2;
    ```
23. Founder review: si pass_count(C) ≥ pass_count(A) * 0.95 → C aprobado, continuar al siguiente F7. Sino → debug C (no rollback A).

### Bloque (f) — Tag git

24. `git tag -a bot-c-v1-deployed-2026-05-30 -m "F6: bot-c-v1 deployed to N8N, awaiting A/B test results"`.
25. `git push origin bot-c-v1-deployed-2026-05-30`.

---

## 11. Plan de A/B test post-deploy (procedimiento detallado)

El A/B test es **manual sobre golden set**, NO sobre tráfico real (no hay tráfico real en pruebas).

### 11.1 Pre-condiciones

- `eval-harness-v1` deployado y testeable.
- `bot-v6-v2` (arch A) activo y testeable.
- `bot-c-v1` (arch C) activo y testeable.
- Golden set v1.jsonl con 80 turnos.

### 11.2 Procedimiento

**Run sobre A:**

1. Si `bot-v6-v2` no está active, activarlo. Desactivar `bot-c-v1`.
2. En env var de N8N: `EVAL_TARGET_WEBHOOK_URL` → webhook test de `bot-v6-v2`.
3. Activar `eval-harness-v1`.
4. `node crm-v2/scripts/eval-runner.mjs --arch=A --workflow-id=p3h7tx6UiGBQ9Tzb --golden-set=crm-v2/eval/golden-set/v1.jsonl --label="A baseline F6 abtest"`.
5. Esperar 7-10 min. Capturar `run_id` del output.

**Run sobre C:**

6. Desactivar `bot-v6-v2`. Activar `bot-c-v1`.
7. En env var de N8N: `EVAL_TARGET_WEBHOOK_URL` → webhook test de `bot-c-v1` (id distinto).
8. `node crm-v2/scripts/eval-runner.mjs --arch=C --workflow-id=<id_bot_c_v1> --golden-set=crm-v2/eval/golden-set/v1.jsonl --label="C baseline F6 abtest"`.
9. Esperar 7-10 min. Capturar `run_id`.

**Comparación:**

10. SQL:
```sql
SELECT
  arch, label,
  pass_count, partial_count, fail_count,
  (pass_count::float / NULLIF(golden_set_total, 0) * 100)::int AS pass_pct,
  p50_ms, p95_ms,
  total_cost_usd,
  total_tokens_in, total_tokens_out, total_tokens_cached,
  (total_tokens_cached::float / NULLIF(total_tokens_in, 0) * 100)::int AS cache_hit_pct
FROM eval_runs
WHERE label IN ('A baseline F6 abtest', 'C baseline F6 abtest')
ORDER BY arch;
```

11. Drill-down de fails:
```sql
SELECT er.arch, ert.turn_id_golden, ert.category, ert.status, ert.fail_reasons,
       ert.accuracy_score, ert.bot_response
FROM eval_run_turns ert
JOIN eval_runs er ON er.id = ert.run_id
WHERE er.label IN ('A baseline F6 abtest', 'C baseline F6 abtest')
  AND ert.status IN ('fail','partial')
ORDER BY ert.turn_id_golden, er.arch;
```

12. Criterio de "C gana" (decisión founder informada):
- `pass_count(C) >= pass_count(A) * 0.95`, AND
- `p50_ms(C) <= p50_ms(A) * 1.20`, AND
- `total_cost_usd(C) < total_cost_usd(A) * 0.30`, AND
- Cero fails en categoría `handoff_request` (es la categoría más crítica).

**Si C gana:** F7 desactiva A en producción y C se vuelve único.
**Si C pierde:** los `fail_reasons` por categoría son input para iterar (sub-spec F6.1).

---

## 12. Smoke tests post-deploy

Lista verificable que el reviewer corre en orden:

1. **Edge function v0.4.0 viva:** `curl healthcheck` devuelve `version:"0.4.0"`.
2. **Migración aplicada:** 3 SQL checks de §10 paso 3.
3. **Telegram secret seteado:** `supabase secrets list` (no expone valor, solo existencia).
4. **Workflow C presente en N8N:** GET `bot-c-v1` por nombre, `active:false`, 60+ nodos.
5. **Sofia C tiene exactamente 1 tool:** grep en JSON local: `ai_tool` connections targeting `Sofia C` → solo `Request_Clarification_Tool`.
6. **bot-v6-v2 sin cambios:** `git diff main crm-v2/n8n/workflows/chatbot-momentum-bot-v6-v2.json` → vacío.
7. **Smoke conversacional sobre C:** 5 mensajes del set §10.16 → bot responde, bot_turns tiene arch='C' con extractor_output_json.
8. **Advisory lock funciona:** mandar 3 mensajes en burst (<2s entre cada uno). Verificar en `bot_turns`: 3 trace_ids distintos, latencias del 2do y 3er turno ligeramente más altas que el 1ro (200-500ms extra por lock wait). Sin duplicación en `leads.attributes`.
9. **Clarification logging funciona:** mandar mensaje raro tipo "¿cuál es la política de devolución de seña?" (algo fuera del bot_config). El bot debería responder "dejame validar" y aparecer 1 row en `bot_clarification_events`.
10. **A/B test eval-harness corre sobre C sin crashear:** §11 procedimiento corrido al menos 1 vez.
11. **Sin regresión en handoff:** un turno del golden set categoría `handoff_request` → bot dispara `handoff.escalate` → Telegram llega al chat del founder.

Cada smoke test = PASS/FAIL en el reporte del reviewer.

---

## 13. Casos edge y riesgos previstos (mínimo cubierto, todos con mitigación explícita)

### Riesgos previstos

1. **(ALTA) Information Extractor devuelve JSON inválido / timeout.** Sofia ya respondió al lead pero las acciones no se ejecutan. Mitigación: Code Node "Audit Extractor Output" loggea `extractor_failed=true` + UPDATE `bot_turns.status='partial'`. El siguiente turno del lead re-evalúa contexto vía memoria. NO se dispara handoff por esto. Documentado en §3.1 (status partial agregado en migración 0016).

2. **(MEDIA) Race condition entre turnos paralelos del mismo lead.** Mitigado por advisory lock §3.5 + §5.3. El 2do turno espera al 1ro (latencia +200-500ms aceptable). Si el lock-acquire falla por error de RPC, se loguea y continúa sin lock (degradación graciosa que prefiere disponibilidad sobre consistencia perfecta).

3. **(MEDIA) Sofia C downgrade a `gpt-4o-mini` degrada calidad conversacional.** Detectable en eval-harness via `expected_response_constraints`. Mitigación inmediata: cambiar 1 línea en el nodo `OpenAI Chat Model - Sofia C` para subir a `gpt-4o`. Costo sube ~6x pero sigue siendo más barato que GPT-4 de A.

4. **(MEDIA) Schema dinámico mal construido para una agency.** Si `agency.pipeline_stages` o `agency.extractor_field_defs` están mal seedeados, el extractor devuelve enums fallidos → validación post-extractor descarta todo → turno queda sin acciones. Mitigación: Code Node "Construir Schema Extractor" devuelve `schema_meta` con los keys/enums efectivos; auditable en cada bot_turns row vía schema_version_hash. Si una agency repite el mismo hash en cada turno y nunca dispara acciones, eso es la señal del bug.

5. **(MEDIA) Telegram alert depende de env var del secret + `agencies.settings.telegram_chat_id`.** Si cualquiera falta, la alerta no se manda. Mitigación: degradación graciosa (handler `handoff.escalate` igual escribe a DB, solo no manda Telegram); log warning. Documentar en `memory/decisions.md` que el founder tiene que seedear `telegram_chat_id` por agency.

6. **(MEDIA) Idempotency cache solo protege re-tries DENTRO de 15min con MISMO trace_id.** Si N8N hace replay del workflow 30min después (caso raro), el trace_id es el mismo pero la ventana expiró → puede re-disparar acciones. Mitigación: la ventana 15min cubre 99% de retries de N8N (suelen ser inmediatos). Para el 1% restante, las acciones idempotentes a nivel DB (tag.add unique constraint, handoff.escalate guard `handoff_status<>'pending'`) cubren. Stage/Qualify/Assign son idempotent-business-wise (re-UPDATE con mismos valores es no-op).

7. **(BAJA) Escape hatch abuse: el LLM invoca `Request_Clarification_Tool` para cualquier pregunta vaga.** Inflación de la tabla `bot_clarification_events`. Mitigación: `toolDescription` muy restrictiva (§6.4 C4). Eval harness puede chequear que la tool NO se llama en categoría `greeting_smalltalk` ni `off_topic`. Si se invoca >2 veces por conversación, log warning.

8. **(BAJA) El extractor mini puede repetir captura de datos ya capturados.** Ej. el lead ya dio el nombre en turno 1, el extractor turno 2 lo extrae de nuevo. Mitigación: `extractor.write` ya es UPSERT por `(lead_id, field_def_id)` (no se duplica). El prompt del extractor §7.2 instruye explícito "NO repitas datos ya capturados" y le pasa la lista en el contexto.

9. **(BAJA) Costo del lock-bypass cuando lead_id=0...0 (placeholder).** El `Crear Trace de Turno` y `Enriquecer Trace` antes de resolver lead pasan placeholders. `acquireLeadLock` short-circuit (devuelve false sin RPC). 0 overhead.

### Casos edge a contemplar

1. **Happy path:** lead dice "tengo 200k presupuesto, busco casa en Heredia, me llamo Juan, tel 88887777". Sofia C responde con BIEN ("Buenísimo Juan, voy a registrar tu interés..."). Extractor devuelve `captured_data: {nombre_lead:'Juan', presupuesto:200000, telefono:'+50688887777', zona_interest:'Heredia'}`. Validador acepta todos. extractor.write upsertea 4 fields. Switch2 dispara qualify.set + stage.set + tag.add (si "Heredia" matchea un tag). Cierre del turno: ~3-5s, status='done'.

2. **Lead curioso / info-only:** "hola, qué propiedades tenés?". Sofia C responde "te puedo ayudar! ¿Estás buscando casa, apto, o algo más específico? ¿Zona?". Extractor devuelve todo en defaults (stage_change='none', qualified='unknown', handoff_reason='none', captured_data vacío). Ninguna HTTP se dispara. Turno: ~2-3s, status='done', tools_invocadas=[].

3. **Lead frustrado / pide humano:** "ya me cansé, quiero hablar con una persona". Sofia C responde "perfecto, voy a pasar tu solicitud para que un agente te escriba directamente". Extractor devuelve `handoff_reason='user_requested', should_assign:true`. Switch3 dispara handoff.escalate → bot-actions UPDATE conversations.handler='human' + Telegram al founder. Turno: status='done', tools_invocadas=[handoff.escalate].

4. **Tool falla / timeout / 401:** HTTP a bot-actions/stage.set timeout 10s. N8N marca el nodo como error → `onError:'continueRegularOutput'` → la rama continúa al Merge2. El resto de las acciones se ejecutan. Turno: status='done' pero tools_invocadas no incluye stage. Reviewer puede ver en N8N execution la falla. Mitigación adicional posible (no en F6): retry exponencial — se posterga a F7 si la frecuencia de fails > 1%.

5. **Lead manda audio:** se procesa por la rama de Whisper igual que en v2 (sin cambios). El texto transcrito sale como `Mensaje` y entra a Sofia C como user message. Extractor lee lo mismo. Funciona igual.

6. **Lead manda link a propiedad externa:** se procesa por la rama de Apify igual que en v2 (sin cambios). El mensaje enriquecido entra a Sofia C. Funciona igual.

7. **Lead manda imagen:** se procesa por la rama de imagen igual que en v2 (sin cambios). El `imageLink` se setea pero NO se procesa para extracción (limitación heredada). Sofia C ve el placeholder "[Imagen recibida]" en el mensaje.

8. **Burst de 3 mensajes en 5s:** ver §13 riesgo #2 (advisory lock serializa).

9. **Extractor devuelve `handoff_reason` válido pero `should_assign:false`.** Es contradictorio (handoff implica asignación). Mitigación: el handler `handoff.escalate` SIEMPRE asigna también (lógica unificada en bot-actions; ya existe en v0.3.0). Si la conversación tenía `assigned_user_id` previo, lo respeta. Sino, asigna por round_robin.

10. **`agency.settings.auto_actions.handoff` está en false** (toggle apagado): el handler `handoff.escalate` NO tiene gate (decisión F4 explícita). El handoff se ejecuta igual. Si el founder quiere apagar handoff, lo hace via otro mecanismo (kill switch del bot entero). NO es bug de F6.

11. **Sofia C no devuelve `output` por error del LLM:** el nodo `Sofia C` falla → rama `Cerrar Trace (Failure)` (la del F5) actualiza bot_turns con status='failed'. El extractor no se ejecuta. El lead no recibe respuesta. **Mitigación obvia que F6 NO cubre:** mensaje de fallback "ups, tuve un problema, dejame un momento". Posterga a F7.

12. **`Request_Clarification_Tool` se invoca pero el handler `clarification.log` falla (DB down):** la tool HTTP devuelve error. El LLM ya recibió el output del tool (`{ok:true}` falso). Sofia C podría decir "ya registré tu pregunta" cuando no se registró. Mitigación: handler clarification.log es defensivo (catch global, devuelve 200 con ok:false en lugar de 500). El LLM no nota la diferencia. El evento no queda registrado pero el flujo no rompe.

---

## 14. Criterios de PASS para reviewer

El n8n-reviewer corre el audit usando `.agent/skills/n8n-workflow-audit/SKILL.md` + `.claude/skills/n8n-expression-validator/`. Adicionalmente, F6 exige los siguientes criterios **ESPECÍFICOS**:

### Criterios obligatorios (todos PASS)

1. **`bot-v6-v2.json` sin cambios.** `git diff main -- crm-v2/n8n/workflows/chatbot-momentum-bot-v6-v2.json` → vacío.
2. **Migración 0016 aplicada.** 3 SQL checks de §10 paso 3.
3. **Edge function v0.4.0 deployed.** Healthcheck devuelve `version:"0.4.0"`.
4. **Handler `clarification.log` operativo.** Smoke call con payload válido → 200 + row en bot_clarification_events.
5. **Advisory lock funcional.** Test de burst (§12 punto 8): 3 turnos paralelos del mismo lead → latencias seriales observables, sin duplicaciones.
6. **Workflow C en N8N.** `active:false` por default. 60+ nodos.
7. **Sofia C con SOLO 1 tool.** Grep al JSON: solo `Request_Clarification_Tool` conectada como ai_tool a Sofia C.
8. **Information Extractor C con schema dinámico.** Code Node "Construir Schema Extractor" lee `Resolve Agency`, no hay schema hardcodeado.
9. **Validar Extractor Output presente.** Code Node entre extractor y switches, con regex/enums según §3.8.
10. **Cascada de 3 grupos secuenciales.** Switch1 (extractor) → Merge1 → Switch2 (medio paralelo) → Merge2 → Switch3 (handoff) → Merge3.
11. **Smoke conversacional pasa.** 5 mensajes del set §10.16 producen bot_turns con arch='C' y extractor_output_json poblado.
12. **Eval harness corre sobre C sin crashear.** Min 1 corrida con `--arch=C` que termina con `status='done'` en eval_runs.
13. **Sin regresiones en categorías críticas.** En la corrida sobre C, `fail_count` en categoría `handoff_request` debe ser 0.

### Criterios condicionales (PASS para go-live, WARN si fallan)

14. **C tasa de pass ≥ A * 0.95** en el A/B test del golden set.
15. **C p50 ≤ A * 1.20** (latencia no degrada >20%).
16. **C costo ≤ A * 0.30** (mínimo 70% ahorro confirmado).
17. **Cache hit rate ≥ 40%** post-3er turno consecutivo (heredado de F5; verifica que el prompt nuevo de Sofia C sigue cacheable).

### Si algún criterio FALLA

- Criterios 1-13 obligatorios: **bloquean entrega**. Fixes mandatorios.
- Criterios 14-17 condicionales: **NO bloquean entrega** pero generan iteración (sub-spec F6.1). Founder decide si activa C o sigue con A mientras se itera.

---

## 15. Estimación de esfuerzo en jornadas-dev

Por entregable:

| Entregable | Jornadas | Notas |
|---|---|---|
| Migración 0016 (SQL + lock + tabla) | 0.5 | Aditiva, idempotente, copy-paste del modelo de F5. |
| bot-actions v0.4.0 (clarification + lock wrapper + telegram + tag arch) | 1.0 | Modificaciones in-place; el patrón handler está claro. |
| Build script `build-bot-c-v1.js` (~600 líneas) | 1.5 | Es el entregable más grande; ~26 definiciones de nodos + ~30 reconexiones + smoke tests. |
| Prompt de Sofia C (modificación al jsCode de Componer System Prompt) | 0.5 | Quitar 3 bloques + agregar regla de prompt condicional + REGLAS DURAS. |
| Prompt del Information Extractor C (texto en parameters del nodo) | 0.3 | §7.2 dado completo; el builder lo pega literal. |
| Smoke tests + validación expresiones + deploy a N8N | 0.5 | El skill `n8n-workflow-build-script` cubre el patrón. |
| Eval harness corrida + comparación A vs C | 0.5 | Solo cambiar env var y ejecutar CLI; espera ~15min total. |
| Sticky notes + doc inline | 0.2 | 3 stickies nuevos, mensajes claros. |
| **TOTAL F6** | **~5 jornadas-dev** | Coherente con la estimación de la mesa (4-5 jornadas Semana 2). |

**Riesgo de overrun:** +1-2 jornadas si el extractor falla con casos edge no anticipados del golden set y hay que iterar el prompt §7.2. El golden set v1 ya tiene 80 turnos labelados → debugging informado, no a ciegas.

---

## 16. Handoff al builder

**Archivo de output esperado:**

- `crm-v2/supabase/migrations/0016_bot_clarifications_and_advisory.sql` (nuevo, §4)
- `crm-v2/supabase/functions/bot-actions/index.ts` (modificado, v0.4.0, §5)
- `crm-v2/scripts/build-bot-c-v1.js` (nuevo, §9.1)
- `crm-v2/n8n/workflows/chatbot-momentum-bot-c-v1.json` (output del build, §6)

**Recursos a leer ANTES de empezar:**

- Esta spec entera. **No se admite "salté la sección X".**
- `memory/n8n-changes/2026-05-30-F5-foundation.md` — entender qué dejó F5 en piedra (bot_turns schema, idempotency cache, prompt caching, eval-harness).
- `crm-v2/supabase/functions/bot-actions/index.ts` actual (v0.3.0) — sobre esto se modifica.
- `crm-v2/n8n/workflows/chatbot-momentum-bot-v6-v2.json` — el baseline a copiar.
- `crm-v2/scripts/build-bot-v6-v2.js` — modelo de build script.

**Skills obligatorias a invocar (ya hay tools y schemas listos):**

- `n8n-workflow-build-script` — para estructura del build script.
- `n8n-workflow-versioning` — para snapshot pre-PUT + tag git post.
- `n8n-langchain-agent-postgres-memory` — para configurar `Postgres Chat Memory - Sofia C`.
- `n8n-properties-search-tool-pattern` — para `Request_Clarification_Tool` (toolHttpRequest + $fromAI).
- `n8n-expression-syntax` — al escribir las expresiones de los HTTP nodes.
- `n8n-expression-validator` — al final del build, validar el JSON.
- `supabase-edge-function-secret-auth` — al modificar el handler de bot-actions.

**Notas críticas al builder:**

1. **NO TOQUES `bot-v6-v2.json`.** Si tu build script intenta modificarlo, abortá. C es paralelo.
2. **El extractor corre en SERIE después de Sofia.** Ver §3.3. No te tiente paralelizar para "ganar latencia" — la coherencia importa más.
3. **Las HTTP a bot-actions van en 3 GRUPOS secuenciales** (extractor solo → medios paralelos → handoff solo). No las paralelices todas. Ver §3.4.
4. **El advisory lock requiere `pg_advisory_lock` (NO `_xact_lock`).** Ver §3.5 actualización. Si usás `_xact_lock`, el lock dura solo la RPC call individual, no el handler entero — bug sutil.
5. **El prompt del Extractor (§7.2) tiene una regla específica sobre "respuesta de Sofia"** (item 10): si Sofia prometió algo condicional, el extractor debe disparar la acción correspondiente. NO la borres por "redundancia".
6. **El schema dinámico (§3.7) usa `gen_random_uuid()`-free metadata** (`schema_meta` que incluye stageSlugs/allowedTags/fieldKeys). Esto se serializa al audit log y permite debugging cuando una agency tiene comportamiento raro.
7. **El Telegram alert dentro de bot-actions (§5.5)** requiere env var `TELEGRAM_BOT_TOKEN_INMOBILIARIA_DEMO_2026`. Si no está seteada, el handler no rompe pero no manda Telegram. Validá en smoke test.
8. **Reuso de la instrumentación F5 NO debe romperse.** Los 5 Code Nodes `Crear Trace`, `Enriquecer Trace`, `Capturar Prompt Hash`, `Cerrar Trace`, `Cerrar Trace (Office Hours)` se mantienen IDÉNTICOS salvo el cambio de `arch:'A'` → `arch:'C'` en el primer Code Node. Si tu build script no detecta el regex de §6.6, abortá.
9. **El nodo `Sofia C` debe tener `text` y `systemMessage` (en `options`) exactamente como §6.4 C1.** Si N8N v2.2 del agent node tiene una API distinta de "Define Below" para `text`, ajustá pero documentá el cambio.
10. **Si en algún punto del build el smoke test "Sofia C tiene solo 1 tool" falla**, NO hagas que pase forzando. Revisar las conexiones a mano y entender qué está sucediendo. Probablemente residuo de una conexión no-borrada de las 7 tools eliminadas.

**Lo que el builder NO debe hacer:**

- NO improvisar nodos no listados en §6.4. Si te falta algo, parar y reportar al architect.
- NO mover entregables a sub-fases (F6.1, F6.2) por motu propio. Esta spec es el alcance acordado.
- NO modificar el prompt del Sofia C más allá de lo prescrito en §7.1. Sin few-shots, sin "yo mejoraría esto". Eso es trabajo de `langchain-prompt-designer` después del primer feedback del founder.
- NO commit con changes a `bot-v6-v2.json`. Validar `git diff` antes de commit.
- NO push directo a main. PR + Vercel preview + merge a main (política github del founder).

**Cuándo retornar control al architect:**

- Si descubrís que `agencies.settings.pipeline_stages` no existe (o tiene otro nombre) — el schema dinámico se rompe. Reportar para que ajuste §3.7 con el nombre real.
- Si descubrís que el handler `extractor.write` actual NO acepta `fields:[{field_key, value}]` sino otra forma — ajustar §6.7.
- Si en smoke test el bot C tarda >10s p50 — el A/B test va a perder por latencia, reportar.

---

## Fin de la spec F6
