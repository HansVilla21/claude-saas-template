# Spec: SET-1 — Cablear el bot N8N para que respete los toggles de `agencies.settings`

**Fecha:** 2026-06-04
**Autor:** n8n-architect
**Workflow afectado:** `crm-v2/n8n/workflows/chatbot-momentum-bot-v6-v1.json` (LIVE) → próxima versión `chatbot-momentum-bot-v6-v2.json` (work-in-progress en branch `feat/admin-master-adm-4`).
**Versión actual → propuesta:** bot-v6 v1 + bot-actions v0.5.0 → bot-v6 v2 (SET-1 changes) + bot-actions v0.6.0.
**Trigger del cambio:** Founder pide cerrar deuda técnica de los toggles en `/a/[slug]/settings` que aparecen con badge SOON. Pero **la auditoría del código vigente revela que ~90% del trabajo YA está hecho** (F4 del 2026-05-30 + P1.1 del 2026-06-04). SET-1 es un cierre de cabos sueltos, NO una construcción nueva.
**Specs predecesoras:** `memory/n8n-changes/2026-05-30-sofia-v6-F4-bot-schedule-auto-actions.md` (F4 → cableo original), `memory/spec-p1-1-roles.md` (round-robin), `memory/spec-bug-a-session-key.md` (sessionKey fix en v2).

---

## 0. Resumen ejecutivo

**Hallazgo central del audit pre-spec:** El cableado de toggles + horario que el founder describe como "deuda técnica disfrazada de feature" **ya está implementado y funcionando en producción** desde F4 (2026-05-30) y P1.1 (2026-06-04). Específicamente:

- ✅ **Horario del bot (OOH):** nodos `Calcular Estado de Horario` + `¿Fuera de Horario?` + `Send Out of Office via YCloud` + `Log Out of Office en Messages` + `Pausar Bot Hasta Hora Hábil` existen y están cableados en el workflow LIVE (líneas 1856-1996 del JSON).
- ✅ **Idempotencia del OOH:** resuelta de facto por el gate `Chatbot Activado?` (línea 466), que chequea `bot_paused_until > now()` y corta el flujo en mensajes 2-N durante el wait. **NO se manda el OOH dos veces al mismo lead en el mismo bloque OOH.** Verificado por análisis de flujo en §3.1.
- ✅ **Capa A (system prompt) de auto-acciones:** el nodo `Componer System Prompt` (línea 1655) ya inyecta bloque `## AUTO-ACCIONES PERMITIDAS` dinámico basado en `settings.auto_actions.*` (líneas internas 130-180 del jsCode F4).
- ✅ **Capa B (edge function) de auto-acciones:** `bot-actions/index.ts` v0.5.0 ya tiene `TOGGLE_BY_OPERATION` (línea 143) + gate sistemático (línea 1583-1602) que devuelve `200 + { ok:true, skipped:[{reason:'auto_action_disabled', toggle}] }` cuando el toggle está off.
- ✅ **Round-robin RPC atómico:** existe `assign_round_robin(p_conversation_id)` en migración 0019 con FOR UPDATE SKIP LOCKED + idempotencia.

**Lo que SET-1 realmente cierra (cabos sueltos identificados):**

1. **DT2-C — `handoff.escalate` ignora el toggle `auto_actions.assign`:** el handler dispara `assign_round_robin` siempre que la conv quedó sin asignar, sin chequear el toggle. Esto contradice la promesa del badge SOON. Fix: gate explícito en `handleHandoffEscalate`.
2. **DT2-D — `assign.set` reimplementa round_robin manual** (líneas 633-657 del edge function) en vez de usar la RPC `assign_round_robin` que es atómica y trackea `last_assigned_at` en `agency_memberships`. Resultado: dos vías de asignación inconsistentes (`assign.set` "naive" + handoff via RPC). Fix: refactor `handleAssignSet` para delegar en la RPC.
3. **DT2-E — `note.write` permite duplicados consecutivos** (riesgo R8 de spec F4, nunca resuelto). Si el LLM llama `note.write` dos veces seguidas con body idéntico (o casi), se acumulan filas en `lead_notes`. Fix: SELECT última nota antes del INSERT, skip si body normalizado idéntico en ventana corta.
4. **DT1-C — Hardening de idempotencia OOH (defensa adicional):** hoy depende 100% del gate `Chatbot Activado?`. Si por race condition o reset de `bot_paused_until` el flujo llega a `Calcular Estado de Horario` de nuevo dentro del mismo bloque OOH, manda OOH duplicado. Riesgo bajo pero documentado. Mitigación: agregar chequeo "última fila en `messages` con `kind='text' AND sender_kind='system' AND body=out_of_office_message AND created_at > now() - interval '6 hours'` → skip envío" en el nodo `Send Out of Office via YCloud` (o nuevo Code node `¿OOH ya enviado?` previo).

**Lo que NO se toca en SET-1:**

- La lógica de `Calcular Estado de Horario` (acepta el ±1-2h DST documentado como R4 en F4).
- El system prompt — Capa A ya está vigente.
- Migraciones nuevas (todo se hace con tablas/funciones existentes).
- El workflow LIVE v1 no se reescribe; los cambios van directamente al v2 (work-in-progress en la branch actual).

**Versiones resultantes:** workflow `bot-v6 v2` (cerrado), edge function `bot-actions v0.6.0`. **No requiere migration nueva.**

---

## 1. Problema / requerimiento

El founder ve en `/a/[slug]/settings` 5 toggles de auto-acciones + un selector de `bot_schedule.mode` (24/7 vs office_hours) con badge **SOON**. Cree que el bot los ignora. La auditoría del repo demuestra que NO los ignora, pero:

- **No es obvio para el founder** porque el badge SOON está hardcodeado en la UI (heredado de cuando F4 no existía).
- **Hay 4 cabos sueltos reales** (enumerados en §0) que sí son deuda técnica pendiente.

Después de SET-1:
- Cada toggle de `auto_actions.*` corta el comportamiento del bot tanto en capa LLM (Capa A) como en capa server (Capa B). **Sin doble vía de asignación inconsistente.**
- `handoff.escalate` respeta el toggle `assign` para el round-robin (el handoff sigue, pero queda sin asignar para que un admin manualmente lo tome).
- `note.write` no acumula duplicados consecutivos.
- El OOH es bullet-proof contra cualquier escenario de race condition.
- El badge SOON se puede remover del UI (tarea trivial fuera de scope de SET-1; el architect frontend lo hace en un PR aparte).

---

## 2. Estado actual relevante (auditado código por código)

### 2.1 Workflow `chatbot-momentum-bot-v6-v1.json` (LIVE, 2778 líneas)

Cadena del flujo crítico (líneas del JSON entre paréntesis):

```
Webhook YCloud (17) → Extract Variables (95) → Is Text/Audio/Image? (220)
  → Mark As Read + (Set Normalize) → ID y Mensaje (418)
  → Resolve Agency (1470, query maestra con settings, bot_config, etc.)
  → Buscar Lead (Supabase) (435) → Lead Encontrado? (1512)
  [true] → Get Conversation State (1540, trae bot_paused_until)
       → Chatbot Activado? (496, IF con 3 conditions AND)
            [true] → Calcular Estado de Horario (1868, JS puro Intl.DateTimeFormat)
                 → ¿Fuera de Horario? (1912, IF)
                      [true] → Send Out of Office via YCloud (1932)
                           → Log Out of Office en Messages (1956)
                                → Pausar Bot Hasta Hora Hábil (1994, HTTP POST a bot-actions)
                                → END (no continúa)
                      [false] → Detectar Link en Mensaje → ... → Sofia Agent
```

**`Chatbot Activado?` (línea 496) — 3 conditions AND:**
- `handler === 'bot'`
- `bot_paused_until === null || bot_paused_until === undefined || new Date(bot_paused_until) < new Date()`
- `Resolve Agency.bot_enabled === true`

**`Componer System Prompt` (línea 1655) — bloque AUTO-ACCIONES PERMITIDAS dinámico:** lee `settings.auto_actions.{stage,qualify,assign,tag,note}` y solo lista las descripciones de las tools cuyo toggle está `=== true`. Cuando todos los toggles están off, inyecta una frase explicando que el bot no puede modificar al lead y solo queda `handoff_escalate`. Verificado en jsCode interno (línea 1646).

**Tools conectadas como `ai_tool` al `Agente Principal - Sofia`:**
- `Extractor_Tool_bot_actions` (1688) — sin gate
- `Stage_Tool_bot_actions` (1721) — gate via toggle
- `Qualify_Tool_bot_actions` (1754) — gate via toggle
- `Assign_Tool_bot_actions` (1787) — gate via toggle
- `Tag_Tool_bot_actions` (1820) — gate via toggle
- `Note_Tool_bot_actions` (1853) — gate via toggle
- `Request_Handoff_Tool` (1625) — sin gate (handoff es comportamiento sistémico)
- `Supabase_Properties_Tool` (1591) — no relacionada a SET-1

**Diferencia v1 vs v2 (work-in-progress):**
- v2 cambia el `sessionKey` del `Postgres Chat Memory - Sofia` (fix de bug A — usa el `businessPhone` del webhook en vez del `agency_id` para separar memorias por línea WhatsApp). Esto es ortogonal a SET-1 y no se toca acá.

### 2.2 Edge function `bot-actions/index.ts` v0.5.0 (1741 líneas)

**Estructura relevante:**
- `TOGGLE_BY_OPERATION` map (143-149): cada operation auto-action mapeada a su toggle.
- `readAgencySettings` (192-207): SELECT defensivo de `agencies.settings`.
- `isAutoActionEnabled` (211-220): solo el explícito `=== false` apaga; default-on si la key no existe.
- Gate sistemático en router (1583-1602): SI `TOGGLE_BY_OPERATION[operation]` → chequea `isAutoActionEnabled` → si off, devuelve `200 + skipped:[{reason:'auto_action_disabled',toggle}]` antes de invocar el handler.
- `handleHandoffEscalate` (904-1016): NO chequea toggle. Si `wasUnassigned` (línea 974), dispara `assign_round_robin` vía RPC. **Es donde se debe agregar el gate de `auto_actions.assign`.**
- `handleAssignSet` (561-725): implementación manual de round_robin (633-657) y least_loaded (660-685). **Es donde se debe refactorizar a usar la RPC.**
- `handleNoteWrite` (850-896): INSERT directo sin dedupe. **Es donde se debe agregar el chequeo de duplicados.**

### 2.3 Migración `0019_agency_role_rls.sql` — RPC `assign_round_robin`

Función `public.assign_round_robin(p_conversation_id uuid) returns uuid`:
- `SECURITY DEFINER`, idempotente (devuelve `assigned_user_id` existente si no es NULL sin tocar `last_assigned_at`).
- Pool: `owner|admin|agent` activos, ordenado por `agency_memberships.last_assigned_at ASC NULLS FIRST`.
- `FOR UPDATE SKIP LOCKED` para no-bloqueo en paralelos.
- Marca el elegido `last_assigned_at = now()`.
- Marca la conv `assigned_set_by = 'system'` (NO `'bot'`).

**Decisión semántica importante:** la RPC usa `assigned_set_by='system'`, no `'bot'`. Esto está bien porque cuando el handoff dispara round-robin, técnicamente es "el sistema asignó porque el handoff llegó sin assignee", no "el bot decidió asignar a Pedro". Mantener consistente.

### 2.4 Schema `agencies.settings` (tipado en `crm-v2/src/lib/settings/types.ts`)

```ts
{
  auto_actions: { stage, qualify, assign, tag, note }: Record<key, boolean>;
  business_hours: { tz, days: number[], from: 'HH:MM', to: 'HH:MM' };
  bot_schedule: { mode: '24_7'|'office_hours', out_of_office_message: string };
  response_time: { green_max_min, yellow_max_min };  // NO aplica a SET-1
}
```

Defaults: todos los toggles en `true`, mode `24_7`, business_hours lun-vie 08:00-18:00 CR.

### 2.5 Sticky notes en el workflow

El JSON tiene sticky notes (líneas 1320-1424) que documentan cada sección. Cuando agreguemos nodos nuevos en SET-1 (mínimo cambio), actualizar el sticky relevante.

---

## 3. DTs resueltas (análisis decisional)

### 3.1 DT1-A — ¿`Calcular Estado de Horario` en SQL function o Code node JS?

**Resuelto en F4: Code node JS puro con `Intl.DateTimeFormat` y manejo manual de DST.** Vigente, no se toca.

Razón histórica: evita roundtrip SQL extra, mantiene la lógica visible en el workflow, no requiere migration. El bug C1 de F4 (fix de DST en `getTzOffsetMinutes`) ya está aplicado.

**Action SET-1:** NINGUNA.

### 3.2 DT1-B — ¿Gate de horario antes o después de `Resolve Agency`?

**Resuelto en F4: después de `Resolve Agency` (settings ya disponible) y, crucialmente, después de `Chatbot Activado?` (para que el segundo+ mensaje en OOH muera ANTES de re-evaluar horario).** Vigente.

**Action SET-1:** NINGUNA.

### 3.3 DT1-C — ¿Cómo evitamos repetir el OOH al mismo lead en el mismo bloque OOH?

**Resuelto de facto en F4 vía el gate `Chatbot Activado?` que chequea `bot_paused_until > now()`.** Funciona en el 99% de casos.

**Riesgo residual (probabilidad BAJA, impacto MEDIO):**
- Si por race el `Pausar Bot Hasta Hora Hábil` falla (HTTP error a bot-actions), `bot_paused_until` no se setea, el OOH ya se envió, y el siguiente mensaje del lead vuelve a entrar al branch `is_outside=true` → segundo OOH.
- Si un admin manualmente hace `UPDATE conversations SET bot_paused_until = NULL` durante un bloque OOH (caso `claim` o `release`), el próximo mensaje vuelve a mandar OOH.
- Si el cron de cleanup borra `bot_paused_until` vencido pero la fecha actual aún es OOH (improbable, pero).

**Mi decisión SET-1: agregar defensa adicional explícita.** Es 10 líneas de JS y cierra el hueco.

**Diseño:** insertar un Code node `¿OOH ya enviado recientemente?` entre `¿Fuera de Horario?` (rama true) y `Send Out of Office via YCloud`. Ese Code node:
- Hace SELECT `messages WHERE conversation_id = $1 AND sender_kind = 'system' AND body = $2 AND created_at > NOW() - INTERVAL '6 hours' LIMIT 1`.
- Si existe → setea `should_send_ooh = false`.
- Si no → setea `should_send_ooh = true`.

Y un IF `¿Send OOH?` que solo deja pasar a `Send Out of Office via YCloud` si `should_send_ooh === true`. La rama false va directo a `Log Out of Office en Messages`? **NO** — ni siquiera al log; salta directo a `Pausar Bot Hasta Hora Hábil` (que es idempotente y reescribe `bot_paused_until` con el nuevo `next_business_start_iso`, lo cual es bueno).

**Alternativa rechazada:** dedupe en `bot-actions` server-side. Razón del rechazo: el envío de OOH no pasa por `bot-actions` (es un nodo HTTP directo a YCloud). Movería el chequeo más lejos del envío y obligaría a refactorear el flujo.

**Ventana de 6 horas:** elegida para cubrir un OOH de viernes 23:00 que dura hasta lunes 8:00 (≈57h). En realidad necesitamos cubrir el bloque OOH más largo razonable. **Recalibrado a 72 horas** (3 días) que cubre fin de semana largo + feriado. Es trivial cambiar.

**Action SET-1: SÍ — agregar gate de dedupe en el branch OOH.** Detalle en §4.1.

### 3.4 DT1-D — ¿OOH se envía vía YCloud directo desde N8N o vía bot-actions?

**Resuelto en F4: vía HTTP node directo a YCloud (`Send Out of Office via YCloud`, línea 1932).** Vigente.

Razón histórica: el `bot-actions` v0.5.0 NO maneja envío de mensajes WhatsApp; solo escribe DB y dispara la RPC. Meter envío de YCloud ahí requiere agregar `YCLOUD_API_KEY` como secret + un nuevo handler. Es deuda menor y rompe la separación "edge function = DB, n8n = orquestación I/O".

**Action SET-1:** NINGUNA. Pero si en el futuro el founder quiere atomicidad transaccional ("o mando el OOH y peggo el pause, o no hago ninguno de los dos"), F5 puede mover esto a bot-actions.

### 3.5 DT2-A — ¿Capa A (system prompt) se construye en `Componer System Prompt`?

**Resuelto en F4: SÍ.** El jsCode del nodo lee `ctx.settings.auto_actions` y arma el bloque `## AUTO-ACCIONES PERMITIDAS` dinámico (verificado líneas 130-180 del jsCode). Cuando un toggle está off, esa tool simplemente no aparece en el bloque.

**Verificación adicional necesaria (tarea para el builder):** el comportamiento cuando TODAS las auto-acciones están off. Hoy el código (línea 174) inyecta:

```
## AUTO-ACCIONES PERMITIDAS
El asistente NO puede modificar al lead directamente (todas las auto-acciones están desactivadas...).
Si necesitás cambiar algo del lead, escalá a un humano usando la tool de handoff.
+ HANDOFF_DESC
```

Esto está bien. NO se toca.

**Action SET-1:** NINGUNA.

### 3.6 DT2-B — ¿Capa B (edge function) qué shape devuelve cuando bloquea?

**Resuelto en F4 + v0.5.0: `200 + { ok: true, skipped: [{reason: 'auto_action_disabled', toggle: '<key>'}] }`.** Vigente.

El LLM lo recibe como respuesta de la tool, lo lee como "skipped: auto_action_disabled, toggle: stage", y sigue conversando normal (NO aborta turno, NO expone al lead).

**Action SET-1:** NINGUNA.

### 3.7 DT2-C — Round-robin del handoff debe respetar `auto_actions.assign`

**Genuinamente pendiente.** Hoy `handleHandoffEscalate` (línea 974 en `bot-actions/index.ts`) ejecuta:

```ts
const wasUnassigned = ...assigned_user_id === null;
if (wasUnassigned) {
  await sb.rpc("assign_round_robin", { p_conversation_id: ctx.conversation_id });
}
```

Sin chequear `auto_actions.assign`. Esto significa que si el cliente apaga el toggle "asignar a un agente", igual el handoff dispara el round-robin.

**Decisión:** **agregar gate explícito.** Si `auto_actions.assign === false`, NO disparar `assign_round_robin`. La conv queda con `handler='human', handoff_status='pending', assigned_user_id=NULL`. Un admin la asigna manualmente desde el inbox (UI ya soporta esto, ver `crm-v2/src/app/(inbox)/inbox/_components/AgentFilter.tsx`).

**Output del handler:** mantener compat. `escalated.assigned_user_id` será `null` cuando el gate apaga el round-robin. Loggear el skip:

```ts
console.log({
  event: 'handoff.escalate.assign_skipped_by_toggle',
  agency_id: ctx.agency_id,
  conversation_id: ctx.conversation_id,
});
```

**Action SET-1: implementar.** Detalle en §5.

### 3.8 DT2-D (NUEVA — no estaba en el brief) — Unificar las dos vías de round-robin

**Descubrimiento durante audit:** existen DOS implementaciones de round-robin paralelas:
1. `handleAssignSet` (líneas 561-725 de bot-actions) — naive, ordena por `conversations.assigned_set_at` ASC.
2. `assign_round_robin` RPC (migración 0019) — atómica, ordena por `agency_memberships.last_assigned_at` ASC NULLS FIRST, `FOR UPDATE SKIP LOCKED`.

Esto es **inconsistencia técnica seria**: dos caminos de asignación tracking distinto. Si el bot llama `assign.set` no actualiza `last_assigned_at` en `agency_memberships`. El próximo handoff que pase por RPC vuelve a elegir al mismo user (porque su `last_assigned_at` sigue NULL).

**Decisión:** **refactorizar `handleAssignSet` para delegar en la RPC.** El handler queda así:

```ts
// Si strategy === 'round_robin' (default), usar RPC atómica.
if (strategy === 'round_robin') {
  const { data: rrResult, error: rrErr } = await sb.rpc('assign_round_robin', {
    p_conversation_id: ctx.conversation_id,
  });
  if (rrErr) {
    return jsonResponse({ ok: false, error: 'rpc_failed', detail: rrErr.message });
  }
  if (!rrResult) {
    return jsonResponse({ ok: true, skipped: [{ reason: 'no_agents_available' }] });
  }
  // OJO: la RPC ya setea assigned_set_by='system'. Necesitamos overridear a 'bot'.
  await sb.from('conversations').update({
    assigned_set_by: 'bot',
    assigned_set_by_user: null,
  }).eq('id', ctx.conversation_id).eq('agency_id', ctx.agency_id);
  return jsonResponse({ ok: true, updated: { user_id: rrResult } });
}
// least_loaded queda como está (no hay RPC equivalente).
```

**Nota crítica:** la RPC actualiza `assigned_set_by='system'`. Cuando `assign.set` lo invoca el LLM, semánticamente es "el bot decidió asignar", entonces overridemos a `'bot'` con un UPDATE inmediato post-RPC. Este UPDATE es seguro porque solo cambia procedencia (no toca `assigned_user_id`).

**Alternativa rechazada:** parametrizar la RPC con un argumento `p_set_by`. Razón: cambia firma de la RPC (la migración 0019 ya está deployada en producción), requiere migration nueva. El UPDATE post-RPC es más limpio.

**Action SET-1: refactor.** Detalle en §5.

### 3.9 DT2-E (NUEVA — no estaba en el brief) — Dedupe de `note.write`

Riesgo R8 de spec F4 nunca fue resuelto. Hoy si el LLM llama `note.write` con el mismo body dos turnos seguidos (caso común si Sofia re-extrae el mismo contexto), se acumulan filas duplicadas en `lead_notes`.

**Decisión:** **agregar SELECT defensivo antes del INSERT.**

```ts
// Dedupe: skip si la última nota del lead tiene body idéntico (normalizado: lowercase + trim) y fue escrita por bot dentro de las últimas 4 horas.
const normalized = body.toLowerCase().trim();
const { data: lastNote } = await sb
  .from('lead_notes')
  .select('body, created_at')
  .eq('lead_id', ctx.lead_id)
  .eq('created_by_kind', 'bot')
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle();

if (lastNote) {
  const lastBody = (lastNote.body as string).toLowerCase().trim();
  const ageMs = Date.now() - new Date(lastNote.created_at as string).getTime();
  if (lastBody === normalized && ageMs < 4 * 60 * 60 * 1000) {
    return jsonResponse({
      ok: true,
      skipped: [{ reason: 'duplicate_of_recent_note', last_note_age_ms: ageMs }],
    });
  }
}
```

**Ventana de 4 horas:** suficiente para cubrir una conversación típica de Sofia (10-30 min de duración real, 1-3 horas de fenestra entre mensajes del lead). No quiere ser tan corta que un dato re-extraído 2 turnos después lo skipee mal, ni tan larga que un cambio legítimo del lead (que vuelve a comentar lo mismo días después con matices) lo bloquee.

**Action SET-1: implementar.** Detalle en §5.

---

## 4. Cambios al workflow N8N

### 4.1 Nodos a CREAR

| Nombre | Type | typeVersion | Posición aprox. | Parámetros críticos |
|---|---|---|---|---|
| `¿OOH ya enviado recientemente?` | `n8n-nodes-base.postgres` | 2.6 | x=-2144, y=384 (entre `¿Fuera de Horario?` rama true y `Send Out of Office via YCloud`) | `operation: executeQuery`. Query: `SELECT id FROM public.messages WHERE conversation_id = $1 AND sender_kind = 'system' AND body = $2 AND created_at > NOW() - INTERVAL '72 hours' LIMIT 1`. `queryReplacement: {{ $('Get Conversation State').first().json.id }}, {{ $('Calcular Estado de Horario').first().json.out_of_office_message }}`. `alwaysOutputData: true`. `onError: continueRegularOutput`. |
| `¿Send OOH?` | `n8n-nodes-base.if` | 2.2 | x=-2088, y=384 | Single condition: `{{ $json.id === undefined }}` (true si la query no devolvió fila → mandar OOH). |

### 4.2 Nodos a MODIFICAR

Ninguno en el workflow. **TODOS los cambios funcionales van al edge function `bot-actions`** (sección 5).

### 4.3 Nodos a BORRAR

Ninguno.

### 4.4 Conexiones a CREAR

- `¿Fuera de Horario?` (rama true) → `¿OOH ya enviado recientemente?` (main)
- `¿OOH ya enviado recientemente?` → `¿Send OOH?` (main)
- `¿Send OOH?` (rama true) → `Send Out of Office via YCloud` (main) — **conexión actual REUBICADA**
- `¿Send OOH?` (rama false) → `Pausar Bot Hasta Hora Hábil` (main) — **bypass de Send + Log, va directo a pause para asegurar que `bot_paused_until` se reescribe con el nuevo `next_business_start_iso` (idempotente)**

### 4.5 Conexiones a BORRAR

- `¿Fuera de Horario?` (rama true) → `Send Out of Office via YCloud` (main) — **reemplazada por el desvío vía el dedupe gate**

### 4.6 Sticky notes a actualizar

El sticky `Sticky - Entrada` o el más cercano al branch OOH (no existe sticky específico para OOH hoy) debería tener una nota corta:

```
## Anti-duplicado OOH (SET-1, 2026-06-04)
¿OOH ya enviado recientemente? + ¿Send OOH? cierran el hueco del 1% donde
bot_paused_until podría no estar seteado (race con bot-actions caído o reset
manual) y mandaríamos OOH duplicado. Ventana 72h cubre fin de semana largo.
```

(Builder decide si crea un sticky nuevo o extiende uno existente.)

---

## 5. Cambios a edge function `bot-actions`

**Bump:** v0.5.0 → v0.6.0. Comentario header agregado:
> SCOPE SET-1 (v0.6.0): (1) handoff.escalate gate de auto_actions.assign para round-robin. (2) assign.set delega en RPC assign_round_robin (unifica las dos vías). (3) note.write dedupe defensivo (4h, body normalizado).

### 5.1 `handleHandoffEscalate` — agregar gate de `auto_actions.assign` para el round-robin

**Ubicación:** líneas 904-1016 de `index.ts`. El bloque a modificar es 973-993 (donde dispara `assign_round_robin`).

**Cambio:**

```ts
// SET-1: gate de auto_actions.assign. El handoff (la escalación) NO tiene gate
// (es comportamiento sistémico). Pero el round-robin POST-handoff sí debe respetar
// el toggle `assign`: si el cliente desactivó "asignar a un agente", la conv queda
// sin asignar y un admin la toma manualmente desde el inbox.
let assignedTo: string | null = null;
const wasUnassigned =
  Array.isArray(data) &&
  data[0] &&
  (data[0] as { assigned_user_id: string | null }).assigned_user_id === null;

if (wasUnassigned) {
  // Leer settings para chequear el toggle.
  const settings = await readAgencySettings(supabase, ctx.agency_id);
  if (!isAutoActionEnabled(settings, "assign")) {
    console.log({
      event: "handoff.escalate.round_robin_skipped_by_toggle",
      agency_id: ctx.agency_id,
      conversation_id: ctx.conversation_id,
      toggle: "assign",
    });
    // No dispara round-robin. assignedTo queda null. La conv queda sin asignar.
  } else {
    try {
      const { data: rrResult, error: rrErr } = await sb.rpc(
        "assign_round_robin",
        { p_conversation_id: ctx.conversation_id },
      );
      if (rrErr) {
        console.warn("handoff.escalate round-robin failed (non-fatal):", rrErr.message);
      } else if (typeof rrResult === "string" && rrResult) {
        assignedTo = rrResult;
      }
    } catch (rrThrew) {
      const msg = rrThrew instanceof Error ? rrThrew.message : String(rrThrew);
      console.warn("handoff.escalate round-robin threw (non-fatal):", msg);
    }
  }
}
```

**Output del handler:** sin cambios. `escalated.assigned_user_id` será `null` cuando el toggle skipea.

### 5.2 `handleAssignSet` — refactor para delegar en RPC `assign_round_robin`

**Ubicación:** líneas 561-725 de `index.ts`. Reemplazar el bloque del strategy `round_robin` (633-657).

**Antes (resumen):**
```ts
if (strategy === "round_robin") {
  // 30 líneas de SELECT + sort + pick the oldest.
  ...
  resolved_user_id = sortedPool[0];
} else { /* least_loaded */ ... }
```

**Después:**

```ts
if (strategy === "round_robin") {
  // SET-1: delegar en RPC atómica `assign_round_robin` (migración 0019).
  // Razones: (a) FOR UPDATE SKIP LOCKED → safe en paralelos, (b) trackea
  // last_assigned_at en agency_memberships (la implementación manual ignoraba
  // esto, causando que el próximo handoff via RPC re-elija al mismo user),
  // (c) idempotente (si la conv ya tiene assigned_user_id, devuelve el existente).
  const { data: rrResult, error: rrErr } = await supabase.rpc(
    "assign_round_robin",
    { p_conversation_id: ctx.conversation_id },
  );
  if (rrErr) {
    console.error("assign.set round_robin RPC failed:", rrErr.message);
    return jsonResponse({
      ok: false,
      error: "rpc_failed",
      detail: rrErr.message,
    });
  }
  if (!rrResult || typeof rrResult !== "string") {
    return jsonResponse({
      ok: true,
      skipped: [{ reason: "no_agents_available" }],
    });
  }
  resolved_user_id = rrResult;
  // La RPC setea assigned_set_by='system'. Overrideamos a 'bot' porque
  // semánticamente es el LLM quien decidió asignar.
  const nowIso = new Date().toISOString();
  const { error: provErr } = await supabase
    .from("conversations")
    .update({
      assigned_set_by: "bot",
      assigned_set_at: nowIso,
      assigned_set_by_user: null,
    })
    .eq("id", ctx.conversation_id)
    .eq("agency_id", ctx.agency_id);
  if (provErr) {
    console.warn("assign.set override procedencia failed (non-fatal):", provErr.message);
  }
} else if (strategy === "least_loaded") {
  // Sin cambios — la lógica actual de least_loaded queda como está.
  // No hay RPC equivalente y la implementación es estable.
  ...
}
```

**Importante:** el bloque siguiente del handler original (líneas 696-712, el UPDATE `conversations` SET `assigned_user_id`) se vuelve **redundante para el caso round_robin** (la RPC ya lo hizo) pero **necesario para least_loaded y user_id directo**. Refactor: mover ese UPDATE dentro del `else` (least_loaded y user_id), o agregar un `if (strategy !== 'round_robin')` antes del UPDATE final. El builder decide la estructura más limpia.

### 5.3 `handleNoteWrite` — agregar dedupe defensivo

**Ubicación:** líneas 850-896 de `index.ts`. Insertar el chequeo ENTRE la validación de body (línea 855) y el INSERT (línea 866).

**Cambio:**

```ts
async function handleNoteWrite(
  sb: SupabaseClient,
  params: NoteWriteParams,
  ctx: OperationContext,
): Promise<Response> {
  const raw = typeof params.body === "string" ? params.body.trim() : "";
  if (!raw) {
    return jsonResponse({
      ok: true,
      skipped: [{ reason: "empty_body" }],
    });
  }

  const body = raw.slice(0, MAX_NOTE_BODY_CHARS);
  const truncated = raw.length > MAX_NOTE_BODY_CHARS;

  // SET-1: dedupe defensivo. Si la última nota del lead (por bot) tiene body
  // normalizado idéntico Y fue creada hace < 4h, skip. Cubre el caso donde el
  // LLM re-extrae el mismo contexto en turnos consecutivos. Mide normalizada
  // (lowercase + trim de spaces internos) para no fallar por whitespace trivial.
  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const normalizedBody = normalize(body);
  const DEDUPE_WINDOW_MS = 4 * 60 * 60 * 1000;

  const { data: lastNote } = await sb
    .from("lead_notes")
    .select("body, created_at")
    .eq("lead_id", ctx.lead_id)
    .eq("created_by_kind", "bot")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastNote) {
    const lastBodyNorm = normalize((lastNote as { body: string }).body);
    const ageMs = Date.now() - new Date((lastNote as { created_at: string }).created_at).getTime();
    if (lastBodyNorm === normalizedBody && ageMs < DEDUPE_WINDOW_MS) {
      console.log({
        event: "note.write.duplicate_skipped",
        agency_id: ctx.agency_id,
        lead_id: ctx.lead_id,
        age_ms: ageMs,
      });
      return jsonResponse({
        ok: true,
        skipped: [{
          reason: "duplicate_of_recent_note",
          last_note_age_ms: ageMs,
        }],
      });
    }
  }

  const { data, error } = await sb
    .from("lead_notes")
    .insert({ ... })  // sin cambios
    ...
}
```

**Trade-off documentado:** el SELECT extra antes del INSERT agrega ~30ms de latencia por call. Aceptable: `note.write` es la auto-acción menos frecuente (1-3 por conversación) y el costo de duplicados ruido en el CRM del cliente es mayor.

### 5.4 Test de regresión del gate genérico

**No es un cambio de código.** El gate sistemático ya existente en el router (líneas 1583-1602) corre ANTES del handler. Esto significa que cuando `auto_actions.assign=false` y el LLM llama `assign.set`, el gate corta antes de invocar `handleAssignSet` (refactorizado o no). El refactor de 5.2 NO cambia esto.

Pero el gate del handoff (5.1) es **post-UPDATE** (después de marcar handoff_status=pending). El order matters:

```
HTTP POST handoff.escalate
  → Gate genérico? Operation handoff.escalate NO está en TOGGLE_BY_OPERATION → pasa.
  → handleHandoffEscalate ejecuta:
    → UPDATE conversations handler=human, handoff_status=pending  (ya hecho, no rollbackable)
    → if (wasUnassigned)
        → SET-1: leer settings, chequear auto_actions.assign
            → si false → skip RPC
            → si true → RPC assign_round_robin
```

Esto es correcto. El handoff (escalación) se ejecuta SIEMPRE. El round-robin posterior solo si el toggle lo permite.

---

## 6. Migration nueva

**Ninguna.** SET-1 reusa `assign_round_robin` (0019) y `lead_notes` (0014). No introduce schema nuevo.

---

## 7. Plan de cutover

### 7.1 Pre-flight checks (builder)

1. Confirmar que `bot-actions/index.ts` v0.5.0 está deployado (`GET https://fahujscodhqlopycorzn.supabase.co/functions/v1/bot-actions` → `version: "0.5.0"`).
2. Confirmar branch actual `feat/admin-master-adm-4` y que `chatbot-momentum-bot-v6-v2.json` (work-in-progress) está consistente con `v1.json` (LIVE) excepto por el fix de sessionKey.
3. Backup de la `bot-actions/index.ts` actual: copiar a `bot-actions/index.ts.v0.5.0.bak` (queda en disco, no en git).

### 7.2 Snapshot pre-cambio

```bash
cp crm-v2/n8n/workflows/chatbot-momentum-bot-v6-v1.json \
   crm-v2/n8n/workflows/snapshots/bot-v6-v1-PRE-SET1-2026-06-04.json
```

(Si el builder está iterando en v2 directamente, snapshot del v2 también:
`bot-v6-v2-PRE-SET1-2026-06-04.json`.)

### 7.3 Edit JSON workflow

Aplicar cambios §4.1 y §4.4 al `chatbot-momentum-bot-v6-v2.json` (NO al v1; el v1 es LIVE). El script de build sigue patrón establecido (skill `n8n-workflow-build-script`).

Builder crea `scripts/build-bot-v6-v2-set1.js` que:
1. Parsea `chatbot-momentum-bot-v6-v2.json`.
2. Agrega los 2 nodos nuevos (`¿OOH ya enviado recientemente?`, `¿Send OOH?`).
3. Modifica las conexiones (borra la de `¿Fuera de Horario?` rama true → `Send OOO`, agrega la cadena nueva).
4. Asegura `active: false`.
5. Valida con `node scripts/validate-n8n-expressions.js`.
6. Escribe el output.

### 7.4 Edit edge function

Aplicar cambios §5.1, §5.2, §5.3 a `crm-v2/supabase/functions/bot-actions/index.ts`. Bump `FN_VERSION = "0.6.0"`.

### 7.5 PUT al N8N (manual o vía CLI)

El founder hace el PUT del workflow nuevo via N8N UI (la v2 sigue en `active:false` hasta tests OK). **NO activar todavía.**

### 7.6 Deploy edge function

```bash
supabase functions deploy bot-actions --project-ref fahujscodhqlopycorzn --no-verify-jwt
```

### 7.7 Smoke tests

Ver §10.

### 7.8 Tag git

```bash
git tag bot-v6-v2-set1-2026-06-04
git push origin bot-v6-v2-set1-2026-06-04
```

### 7.9 Activación

Tras smoke tests OK, el founder activa el workflow v2 en N8N (toggle UI). Desactiva v1 en el mismo paso (importante: una sola línea WhatsApp por agency, dos workflows activos = race de webhooks).

### 7.10 Remover badge SOON del UI (post-SET-1, fuera de scope)

Ticket separado para el frontend-builder. Una vez SET-1 esté en prod estable (mínimo 48h sin issues), remover el badge `SOON` de los toggles en `/a/[slug]/settings` (componente vive en `crm-v2/src/app/a/[slug]/settings/_components/*`). Sin esto, el founder/cliente seguirá viendo SOON aunque ya funcione.

---

## 8. Rollback plan

### 8.1 Rollback workflow N8N

Re-importar `snapshots/bot-v6-v1-LIVE-2026-05-30.json` en N8N (UI: Import from File). Activar. **NO requiere PUT por API.**

Si el v2 ya estaba activo y rompió producción:
1. Desactivar v2 (toggle UI).
2. Activar v1 (toggle UI).
3. Cualquier conversación en flight pierde el turno actual (`Webhook YCloud` ya entregó al v2 que se desactivó), pero las próximas entran al v1. Aceptable porque el riesgo de SET-1 está en handlers post-message, no en intake.

### 8.2 Rollback edge function

```bash
# Restaurar el .bak (debe existir desde 7.1).
cp crm-v2/supabase/functions/bot-actions/index.ts.v0.5.0.bak \
   crm-v2/supabase/functions/bot-actions/index.ts
supabase functions deploy bot-actions --project-ref fahujscodhqlopycorzn --no-verify-jwt
```

**Tiempo de rollback:** ~2 minutos (workflow) + ~3 minutos (edge function) = **~5 minutos total.**

### 8.3 Data rollback

**No requerido.** SET-1 no introduce nuevas tablas ni cambia schema. Los cambios son comportamentales. Si el dedupe de `note.write` causara skips falsos (tres turnos similares legítimos), el founder restaura el comportamiento anterior con el rollback de edge function y los notes futuros vuelven a insertarse sin dedupe. **Los notes ya skipeados no se pueden recuperar**, pero como son duplicados literales del último, no es pérdida de info.

---

## 9. Pre-Mortem: 3 escenarios donde sale mal + mitigación

### 9.1 Escenario A: el refactor de `handleAssignSet` rompe el least_loaded (probabilidad MEDIA, impacto BAJO)

**Cómo sale mal:** durante el refactor, el builder mueve el UPDATE final dentro del `else` block, pero deja un edge case (por ej, `params.user_id` directo) sin el UPDATE. Resultado: la asignación no se persiste.

**Mitigación:** smoke test §10.4 cubre cada strategy (round_robin, least_loaded, user_id directo). El builder corre los 3 antes de declarar éxito. Idealmente con la `n8n-workflow-audit` skill aplicada al review.

### 9.2 Escenario B: el dedupe de `note.write` skipea legítimos por matching agresivo (probabilidad BAJA, impacto MEDIO)

**Cómo sale mal:** un lead vuelve a comentar exactamente lo mismo 3 horas después con matices que el LLM resume idéntico. El dedupe lo skipea. El humano no ve la actualización del lead.

**Mitigación:**
- La normalización es lowercase + collapse de spaces, NO stemming ni eliminación de stopwords. Diferencias semánticas pequeñas (puntuación, una palabra distinta) NO matchean.
- Ventana de 4h es conservadora pero ajustable. Si emerge falso-positivo, reducir a 2h o 1h.
- Logging del skip es explícito (`event: 'note.write.duplicate_skipped'`). El founder revisa logs después de 48h y ve patrón.

### 9.3 Escenario C: el gate de handoff round-robin deja conversaciones huérfanas (probabilidad BAJA, impacto ALTO)

**Cómo sale mal:** un cliente apaga `auto_actions.assign=false` para "controlar manualmente la asignación", pero su admin nunca revisa el inbox sin-asignar. Los handoffs entran, quedan `handoff_status=pending, assigned_user_id=NULL`, y nadie los toma. Leads frustrados, oportunidades perdidas.

**Mitigación:**
- El inbox YA muestra conversaciones sin asignar como un filtro visible (skill `crm-inbox-conv-list-filters-strip`).
- Cuando `assigned_user_id=NULL` AND `handler='human'`, la pill `handoff_status=pending` brilla más fuerte (ya implementado en F5/F6).
- **Mitigación adicional para SET-1:** documentar en el UI de Settings que "si apagás 'asignar a un agente', tu equipo verá los handoffs en la pestaña Sin Asignar — alguien debe tomarlos manualmente". Ticket para frontend-builder.
- Nice-to-have post-SET-1: si una conv lleva > X horas con `handoff_status=pending, assigned_user_id=NULL`, mandar email al owner. Fuera de scope.

### 9.4 Escenario D (bonus): la RPC `assign_round_robin` tiene un bug oculto que el handler original (manual) no tenía (probabilidad BAJA, impacto MEDIO)

**Cómo sale mal:** la RPC ordena por `agency_memberships.last_assigned_at`, pero `assign.set` manual ordenaba por `conversations.assigned_set_at`. Si por algún quirk de seeding o migración partial, `agency_memberships.last_assigned_at` está NULL para todos los miembros, la RPC elegirá siempre al primero por `user_id ASC` (el orden secundario es `user_id asc`). Resultado: todas las asignaciones nuevas van al mismo user.

**Mitigación:**
- Smoke test §10.5 verifica con un agency real: hacer 3 `assign.set` consecutivos y verificar que rotan entre miembros.
- Si emerge el problema, el fix es UPDATE `agency_memberships SET last_assigned_at = now() - random() * interval '7 days'` para inicializar timestamps distintos. Manual.

---

## 10. Estimación

| Tarea | Tiempo |
|---|---|
| Snapshot + branch setup | 5 min |
| Script de build N8N (`build-bot-v6-v2-set1.js`) | 30 min |
| Edición edge function (3 handlers) | 45 min |
| Smoke tests A-G | 30 min |
| Review (`n8n-reviewer` con `n8n-workflow-audit`) | 30 min |
| PUT + deploy + activación | 15 min |
| Buffer para bugs encontrados en review | 30 min |
| **Total** | **~3 horas** |

---

## 11. Tests manuales que el reviewer debe correr

### 11.1 Pre-flight

- A. Healthcheck bot-actions v0.6.0: `curl https://fahujscodhqlopycorzn.supabase.co/functions/v1/bot-actions` → `{status:'ok', version:'0.6.0', ...}`.
- B. Workflow v2 deployado en N8N pero `active:false`.

### 11.2 Capa B (edge function aislada vía curl)

- C. Toggle off para `assign`, llamar `assign.set` directo → respuesta `200 + skipped:[{reason:'auto_action_disabled',toggle:'assign'}]`. **Gate funciona pre-handler.**
- D. Toggle on para `assign`, llamar `assign.set` con `strategy=round_robin` en una agency con 3 agents → respuesta `200 + updated.user_id=<agent_X>`. Repetir 2 veces más → verifica rotación entre los 3.
- E. Llamar `note.write` con `body="Lead pidió hablar con Carlos"`. Repetir 2 segundos después con body idéntico → segunda call devuelve `skipped:[{reason:'duplicate_of_recent_note', last_note_age_ms:~2000}]`. Verificar `lead_notes` tiene UNA fila, no dos.

### 11.3 Capa A + B integradas (workflow activo)

- F. **OOH happy path con dedupe:** mandar WhatsApp fuera de horario. Confirmar OOH recibido + `bot_paused_until` futuro. Mandar 2do mensaje 1 minuto después → silencio (gate `Chatbot Activado?`). Bypass del `Chatbot Activado?` manualmente: `UPDATE conversations SET bot_paused_until = NULL WHERE id=<X>`. Mandar 3er mensaje. **Verificación clave:** NO se manda 2do OOH (el dedupe gate filtra) Y el `bot_paused_until` se vuelve a setear (workflow llega a `Pausar Bot`).
- G. **Handoff con assign off:** apagar `auto_actions.assign=false` para una agency con agents. Mandar mensaje que dispare handoff (ej "quiero hablar con alguien ya"). Verificar:
  - `conversations.handler='human', handoff_status='pending'`.
  - `conversations.assigned_user_id=NULL` (sin round-robin).
  - Log server-side: `handoff.escalate.round_robin_skipped_by_toggle`.
  - Conv aparece en inbox filtro "Sin Asignar" con pill handoff brillante.
- H. **Handoff con assign on:** prender `auto_actions.assign=true`. Repetir el mensaje. Verificar:
  - `conversations.assigned_user_id` seteado.
  - `agency_memberships.last_assigned_at` actualizado para el agent elegido.
  - `assigned_set_by='bot'` (NO 'system' — el override post-RPC funciona).

### 11.4 Validador automático

- I. `node scripts/validate-n8n-expressions.js crm-v2/n8n/workflows/chatbot-momentum-bot-v6-v2.json` → 0 violations.
- J. `n8n-workflow-audit` skill aplicada (15 checks) → 0 FAILs.

---

## 12. Handoff al builder

- **Archivos a modificar:**
  - `crm-v2/n8n/workflows/chatbot-momentum-bot-v6-v2.json` — agregar 2 nodos + reconectar branch OOH (§4).
  - `crm-v2/supabase/functions/bot-actions/index.ts` v0.5.0 → v0.6.0 — 3 handlers modificados (§5.1, §5.2, §5.3).
  - Bump `FN_VERSION` + comentario header.

- **Archivos a crear:**
  - `crm-v2/n8n/workflows/snapshots/bot-v6-v1-PRE-SET1-2026-06-04.json` — snapshot del LIVE actual.
  - `crm-v2/n8n/workflows/snapshots/bot-v6-v2-PRE-SET1-2026-06-04.json` — snapshot del work-in-progress.
  - `scripts/build-bot-v6-v2-set1.js` — script de build (patron skill `n8n-workflow-build-script`).
  - `crm-v2/supabase/functions/bot-actions/index.ts.v0.5.0.bak` — backup pre-cambio (rollback).

- **Notas especiales al builder (NO obvias):**
  1. **`handleAssignSet` refactor: el UPDATE post-resolución que pone `assigned_user_id`** (líneas 696-712 actuales) es **redundante para round_robin** (la RPC ya lo hizo), pero **necesario para least_loaded y user_id directo**. Estructurar el código para que el UPDATE solo corra cuando `strategy !== 'round_robin'`. Un `if/else` con early return en el branch round_robin es lo más limpio.
  2. **La RPC `assign_round_robin` setea `assigned_set_by='system'`.** Cuando el caller es el handler `assign.set` (LLM decidió), overrideamos a `'bot'` con un UPDATE inmediato post-RPC. **NO override** cuando el caller es `handleHandoffEscalate` (ahí el `system` es semánticamente correcto: el sistema asignó porque el handoff llegó huérfano).
  3. **El gate del handoff (§5.1) es POST-UPDATE de conversations**, NO pre. El handoff (escalación) se ejecuta SIEMPRE, sin gate. Solo el round-robin posterior consulta el toggle.
  4. **El dedupe de `note.write` usa ventana 4h.** No hardcodear; constante con nombre `NOTE_DEDUPE_WINDOW_MS = 4 * 60 * 60 * 1000` al tope del archivo.
  5. **El dedupe normaliza con `s.toLowerCase().replace(/\s+/g, ' ').trim()`.** NO usar regex agresivo (eliminar puntuación, stemming) — el comportamiento debe ser "literalmente lo mismo, modulo whitespace y caps".
  6. **El nuevo nodo `¿OOH ya enviado recientemente?`** usa `alwaysOutputData:true` para que el IF posterior reciba `{}` cuando la query no devuelve filas (sin esto, n8n trata la salida vacía como "abortar branch").
  7. **El IF `¿Send OOH?` chequea `$json.id === undefined`** porque cuando la query devuelve fila trae `{id: '<uuid>'}`, cuando no devuelve nada (`alwaysOutputData`) trae `{}`.
  8. **No tocar `Calcular Estado de Horario` ni `¿Fuera de Horario?`** — están bien.
  9. **El workflow v1 LIVE NO se toca.** Los cambios van al v2. Después de smoke tests OK, el founder activa v2 + desactiva v1.
  10. **El badge SOON en el UI** se remueve en un ticket separado (frontend-builder), NO es responsabilidad del builder de SET-1.

- **Dependencia de prompt-designer:** ninguna. El system prompt ya está bien (la Capa A funciona). Si tras smoke tests el LLM invoca `assign.set` cuando el toggle está off (lo cual sería bug de Capa A), el prompt-designer evalúa si el bloque "AUTO-ACCIONES PERMITIDAS" necesita ser más enfático. **Hipótesis: no es necesario.**

- **Validación post-build:**
  1. `JSON.parse` del workflow output.
  2. `node scripts/validate-n8n-expressions.js crm-v2/n8n/workflows/chatbot-momentum-bot-v6-v2.json` → 0 violations.
  3. Smoke tests C-E de §11 (sin tocar n8n; solo curl al edge function).
  4. Si pasa todo, entregar al `n8n-reviewer` con la skill `n8n-workflow-audit` (15 checks).
  5. Si pasa el review, founder hace PUT + activación + smoke tests F-H end-to-end.

---

## 13. Bloqueantes que requieren input del founder ANTES de construir

**Ninguno crítico.** Tres decisiones que tomé en esta spec que el founder PUEDE querer revertir:

1. **DT2-D (refactor `handleAssignSet` para usar RPC)** — es deuda técnica más allá del scope literal del brief del founder. Si prefiere "tocá lo mínimo posible para cerrar el brief", podemos dejar el handler manual y solo agregar el gate de DT2-C. Mi recomendación es hacerlo ahora: es 30 líneas, cierra inconsistencia clara, el riesgo es bajo, y el founder ya pidió "no tocar dos veces lo mismo".

2. **DT2-E (dedupe `note.write`)** — agrega complejidad al handler que el founder no pidió explícitamente. Pero es riesgo R8 documentado en F4 y se va a manifestar pronto. Mi recomendación es hacerlo ahora.

3. **DT1-C (defensa adicional OOH)** — el riesgo real es bajo (depende de race conditions o resets manuales). Si el founder prefiere "no agregar más nodos al workflow", podemos saltarlo. Mi recomendación es hacerlo: son 2 nodos triviales, el costo es bajo y cierra el último 1%.

**Si el founder dice "hacé las 3"** → SET-1 completo según esta spec.
**Si dice "solo DT2-C"** → ignorar §5.2, §5.3, §4. Estimación cae a ~1 hora.
**Si dice "ninguna, solo DT2-C y armemos un SET-2 después"** → ídem anterior, pero documentar DT2-D y DT2-E como deuda explícita en `memory/decisions.md`.

**Default si el founder no responde antes de que el builder arranque:** **hacer las 3.** El brief original mencionó "deuda técnica disfrazada de feature" — todas estas cierran deuda técnica.
