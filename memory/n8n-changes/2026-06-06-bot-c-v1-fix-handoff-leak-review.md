# Review: bot-c v1 — Fix leak de format-instructions + recalibración handoff (SET7)

**Fecha:** 2026-06-06
**Reviewer:** n8n-reviewer
**Spec:** memory/n8n-changes/2026-06-06-bot-c-v1-fix-handoff-leak.md
**Build:** crm-v2/scripts/build-bot-c-v1-set7-fix-handoff-leak.js → crm-v2/n8n/workflows/chatbot-momentum-bot-c-v1.json (in-place, LIVE id `Jsh4krhC9HRUh7Ly`, active=true)
**Resultado:** 🟡 **PASS CON OBSERVACIONES** — el cambio SET7 es correcto y SEGURO de deployar. No bloqueo. Las observaciones son bugs PRE-EXISTENTES (no introducidos por SET7) y mejoras de proceso.

---

## TL;DR para el founder

El SET7 hace exactamente lo que la spec dice, y lo hace bien. **Verifiqué los 6 cambios contra el JSON real, corrí el validador de expresiones (0 violaciones), re-corrí el build (32/32 smoke tests, idempotente byte-idéntico), y validé los 3 enums + columnas contra la DB viva con psql.** El leak está muerto (defense-in-depth real), el handoff apaga el bot de verdad (P0b arregla un query roto desde set2), y la recalibración del handoff (P1a/P1a-extra/P1c) es coherente entre Router y Extractor.

**No hay bug clase A (handoff falso positivo) ni clase B (improvisación de info) introducido por este cambio.**

Encontré **1 bug IMPORTANTE pre-existente** que SET7 deja al descubierto (no lo causa): el nodo `Notificar Equipo Handoff` manda el reason con el nombre de campo equivocado (`params.handoff_reason` en vez de `params.reason`), por lo que la edge function `bot-actions` lo rechaza con `invalid_reason` y **NO hace el auto-assign round-robin ni escribe el summary**. El apagado SÍ ocurre (lo hace el SQL de P0b ahora). Efecto: tras un handoff por el Router, la conversación queda en "Sin Asignar" y un admin la toma a mano. Degradado, no catastrófico. Recomiendo arreglarlo en un set8 chico, **no bloquea SET7**.

---

## 1. Checklist (skill n8n-workflow-audit) — 15 puntos

| # | Check | Resultado | Evidencia |
|---|---|---|---|
| 1 | Integridad referencial `$('NodeName')` | ✅ PASS | `validate-n8n-expressions.js`: 99 nodos, 125 expresiones, **0 violaciones**. Guard `$json.output`, Silent Handoff `$('Get Conversation State').first().json.id` (nodo existe). 0 refs huérfanas. |
| 2 | Conexiones huérfanas | ✅ PASS | Ningún nodo quedó sin entrada por el rewire. Formateador sigue alimentando `Limpiar Puntuacion`. Silent Handoff sigue → `Notificar Equipo Handoff`. |
| 3 | Tools sin agente | ✅ PASS | No se tocaron tools/ai_tool. El cambio es 1 IF + 2 prompts + 1 query SQL. |
| 4 | Modelo + Memoria + Tools del agente | ✅ PASS | Agentes Principal/Objeciones intactos (v2.2). El cambio solo rewirea su `main[0]`. |
| 5 | Schema del input al agente | ✅ PASS | Router/IEC con `schemaType: manual` + `inputSchema` presente. No se tocó el shape. |
| 6 | Expressions parseables | ✅ PASS | Guard leftValue `={{ (($json.output ?? '') + '').trim() }}` válida. 0 brackets desbalanceados. |
| 7 | Triggers de handoff explícitos | ✅ PASS | Ver §4 (P1a/P1a-extra/P1c). Condición operacionalizada: handoff SOLO por aceptación explícita del lead, NO por interés/dolor/pregunta/oferta del bot. Sin reglas vagas. |
| 8 | Fallbacks de tools | ✅ PASS | Silent Handoff: `onError: continueRegularOutput` + `alwaysOutputData: true`. Switch tiene BACKUP→AGENTE_PRINCIPAL. IEC tiene rama `Catch Extractor Fail` (out#1). |
| 9 | Walkthrough happy path | ✅ PASS | §2 escenario 5. Guard transparente. |
| 10 | Walkthrough lead curioso (pregunta precio) | ✅ PASS | §2 escenario 1. Router→AGENTE_PRINCIPAL (P1a-extra), IEC handoff_reason='none' (P1c). NO handoff. |
| 11 | Walkthrough lead frustrado / pide humano | ✅ PASS | Router HANDOFF_HUMANO sin cambio (no tocado por SET7), apagado vía P0b. |
| 12 | Walkthrough tool/output failure | ✅ PASS | §2 escenario 4. Guard FALSE → Silent Handoff. Leak muerto. |
| 13 | Variables de entorno documentadas | ✅ PASS | Sin env nuevas. Credencial Postgres `CRM System`, `$env.BOT_ACTIONS_SECRET`, `$env.SUPABASE_V2_URL` ya existentes (spec §5). |
| 14 | Sticky notes actualizados | ✅ PASS | `set2-sticky-agentprincipal-0001` extendido con bloque "SET-7", height 760. Documenta semántica "output vacío == handoff intencional". |
| 15 | active=false en el JSON | ⚠️ N/A → PASS | `active=true` es CORRECTO: es edición in-place del workflow LIVE (`Jsh4krhC9HRUh7Ly`). La spec §14 y el script (línea 37) explícitamente NO tocan `active`. No aplica la regla de "active=false" porque no es un import nuevo. |

**Verificaciones extra solicitadas (el founder ya se quemó con esto):**

| Verificación | Resultado | Evidencia |
|---|---|---|
| Rewire agentes main[0] = exactamente `[Cargar Tags Permitidos, Guard Output Vacio?]` | ✅ PASS | Ambos agentes: `main[0] -> [Cargar Tags Permitidos#0, Guard Output Vacio?#0]`. Sin `Formateador` directo. |
| 0 llaves `{` `}` en Router SPT | ✅ PASS | Router SPT 8888 chars, **0 llaves literales**. Byte-idéntico al .md. |
| 0 llaves `{` `}` en IEC SPT | ✅ PASS | IEC SPT 2908 chars, **0 llaves literales**. |
| P0b enums válidos (`human`/`pending`/`scheduling`) | ✅ PASS — VERIFICADO CONTRA DB VIVA | `handler`: `bot, human, unassigned`. `handoff_status`: `none, pending, handled`. `handoff_reason`: `qualified, scheduling, objection_complex, bot_stuck, user_requested, manual`. Los 3 valores existen. |
| Columnas de P0b existen | ✅ PASS — DB VIVA | `handler, handoff_status, handoff_reason, handoff_at, bot_paused_until, updated_at` todas presentes. `bot_apagado` **NO existe** (count=0) → confirma que el query viejo estaba roto. |
| Query SIN `bot_apagado`/`'active'`/`'router_handoff'` | ✅ PASS | `forbidden.filter(...)` = limpio. |
| Riesgo fail-open (typo de enum tragado por onError) | ✅ PASS | SQL revisado char por char + enums validados contra DB. No hay typo. El `onError` sigue, pero el SQL es correcto. (Ver §5 nota de QA en DB.) |
| Guard no transforma el item (`$json.output` disponible en TRUE) | ✅ PASS | IF v2.2 rutea, no transforma. Formateador `text = Respuesta a formatear: {{ $json.output }}` sigue resolviendo. |
| Coherencia P1a vs P1a-extra vs P1c | ✅ PASS | Sin contradicción. Ver §3. |

---

## 2. Walkthroughs detallados (nodo por nodo)

> **Insight arquitectónico clave para entender los walkthroughs:** el handoff tiene DOS caminos paralelos.
> - **Path A (Router-driven, síncrono):** `Router → Switch Destino out#2 (HANDOFF_HUMANO) → Silent Handoff Apagar Bot → Notificar Equipo Handoff → dead-end`. Lo gobierna P1a/P1a-extra. **El lead no recibe nada.**
> - **Path B (Extractor-driven, corre en PARALELO en cada turno de agente):** `Agente → Cargar Tags Permitidos → ... → Information Extractor C → ... → Switch3 (handoff_reason ≠ none) → HTTP handoff.escalate`. Lo gobierna P1c.
> - **Path C (defense-in-depth, nuevo SET7):** `Agente → Guard Output Vacio? out#1 (vacío) → Silent Handoff`.
>
> Por eso el escenario "cuanto cuesta" depende de QUE LOS DOS (P1a-extra en el Router Y P1c en el Extractor) estén bien — si solo uno estuviera arreglado, el otro path dispararía handoff igual. **Ambos están arreglados y coherentes.**

### Escenario 1 — Lead pregunta "cuanto cuesta?" justo después de que el bot ofreció la llamada
**Rama que toma:** Router lee el bloque "NO es aceptacion, es pregunta" (router-classifier.md L80-83) → `destino=AGENTE_PRINCIPAL`. Switch out#0 → Agente Principal. El Agente deflecta precio (regla de precio del prompt L115-117). **Guard:** output NO vacío → TRUE (out#0) → Formateador → Limpiar Puntuacion → Send YCloud. **En paralelo (Path B):** IEC ve "lead preguntó cuanto cuesta tras oferta". Con P1c item 6 + item 10, `handoff_reason='none'` (pregunta de precio NO es aceptación). Switch3 → `Merge3 — Final` (NO escalate).
**Resultado esperado:** lead recibe el deflect de precio. NO handoff. `handoff_reason` queda en `none`. ✅ **CORRECTO.**
**Hallazgos:** limpio. Este es exactamente el bug verificado en prod, y queda cubierto en sus dos capas.

### Escenario 2 — Lead solo expresa dolor/interés ("se me quedan mensajes sin responder") sin oferta previa
**Rama que toma:** Router → AGENTE_PRINCIPAL (discovery, default seguro). Agente responde con discovery. Guard TRUE → Formateador → Send. **Path B:** IEC, con P1c, NO marca scheduling por un dolor (item 6 lista explícita: "NO marques scheduling porque el lead... mencione un dolor"). `handoff_reason='none'`, `should_assign=false` (item 7: false por default). Switch3 → Merge3 Final.
**Resultado esperado:** discovery normal, NO handoff prematuro. ✅ **CORRECTO.** Este es el otro bug de prod (el dolor que disparaba scheduling=true + should_assign=true) — ahora muerto.
**Hallazgos:** limpio.

### Escenario 3 — Lead acepta de verdad ("miércoles" / "dale me parece") tras la oferta
**Rama que toma:** Router (con P1a, ejemplos L197-203 + EXCEPCION default seguro L126) marca `lead_listo_para_agendar=true` → regla de decisión #1 → `destino=HANDOFF_HUMANO`. Switch out#2 → **Silent Handoff Apagar Bot**. P0b ejecuta: `UPDATE conversations SET handler='human', handoff_status='pending', handoff_reason=COALESCE(handoff_reason,'scheduling'), bot_paused_until=+24h WHERE id=$1 AND handoff_status<>'pending'`. → `Notificar Equipo Handoff` → dead-end. El agente NO participa (handoff se decide antes del agente). Guard NO participa.
**Resultado esperado:** lead NO recibe nada; bot apagado (`handler='human'` — verificado que el gate `Chatbot Activado?` exige `handler='bot'`, así que el próximo turno el bot no responde); inbox muestra pill de pending.
**Hallazgos:** ✅ El apagado funciona (P0b correcto, enums válidos). ⚠️ **PERO** el `Notificar Equipo Handoff` NO hace el round-robin assign ni escribe summary por el bug de nombre de campo (ver §3 IMPORTANTE-1). La conversación queda apagada + pending pero **sin asignar**. No es leak ni handoff falso — es una asignación que no ocurre automáticamente.

### Escenario 4 — Agente devuelve output vacío por cualquier razón (el test que prueba que el leak está muerto)
**Rama que toma:** Agente (Principal u Objeciones) → output `""`/`null`/`"   "`. Guard leftValue `(($json.output ?? '') + '').trim()` = `""` → operator `notEmpty` da FALSE → **out#1 → Silent Handoff Apagar Bot** (NO al Formateador). P0b apaga el bot. → Notificar → dead-end.
**Resultado esperado:** el output vacío NUNCA llega al Formateador → el Structured Output Parser NUNCA filtra sus format-instructions al lead. ✅ **LEAK MUERTO.** Defense-in-depth real.
**Hallazgos:** limpio. La expresión defensiva cubre `null`, `undefined`, `""`, y whitespace-only — los 4 casos. Operator clonado del IF robusto `Mensaje no vacio?` (no del boolean débil), como mandaba la spec.
**Nota MENOR:** con `COALESCE(handoff_reason, 'scheduling')`, un vacío por bug NO-scheduling igual queda etiquetado `'scheduling'`. Aceptable: el único caso legítimo de vacío hoy ES scheduling (verificado: la única instrucción "VOS NO RESPONDES" en ambos prompts de agente es ETAPA 4 = aceptación de llamada). Ver §3 MENOR-1.

### Escenario 5 — Flujo normal (lead pregunta info)
**Rama que toma:** Router → AGENTE_PRINCIPAL → Agente responde texto → Guard TRUE → Formateador → Limpiar Puntuacion → Split Out → Send YCloud.
**Resultado esperado:** respuesta normal, el guard es transparente. ✅ **CORRECTO.** Regression del flujo normal preservada (Formateador→Limpiar Puntuacion→... intacto, verificado en connections).
**Hallazgos:** limpio.

### Escenario 6 — Objeción "es caro" (primera vez)
**Rama que toma:** Router → AGENTE_OBJECIONES (objeciones_count=0). Agente Objeciones responde manejo de objeción. Guard TRUE (output no vacío) → Formateador normal. **Path B:** IEC NO marca handoff por una objeción primera vez (item 6: objection_complex solo si Sofia no puede resolver; primera objeción la resuelve el agente).
**Resultado esperado:** lead recibe manejo de objeción bien formateado. NO handoff. ✅ **CORRECTO.** El Guard cubre el camino de Objeciones igual que el de Principal (ambos rewireados a `[Cargar Tags, Guard]`).
**Hallazgos:** limpio.

### Escenario edge extra — Falso positivo de día (riesgo #3 de la spec)
**Input:** "atienden los miércoles?" SIN que el bot haya propuesto llamada.
**Rama:** el Router condiciona la aceptación a "el bot YA propuso una llamada en algún turno anterior" (L73, L148) + bloque "es pregunta" (L80-83). "atienden los miércoles?" es una pregunta sin oferta previa → AGENTE_PRINCIPAL. `lead_listo_para_agendar=false`.
**Resultado:** NO handoff. ✅ **CORRECTO** (mitigación del riesgo #3 presente en el prompt). *Nota: esto depende de que el LLM gpt-4.1-mini respete la condición de "oferta previa". El prompt la refuerza en 3 lugares + 2 ejemplos. Test T6 del founder debe confirmar empíricamente.*

---

## 3. Issues encontrados

### 🔴 CRÍTICO (bloquea entrega)
**Ninguno.** El cambio SET7 no introduce ningún bug crítico. No hay leak, no hay handoff falso positivo, no hay improvisación de info, no hay ref huérfana, no hay enum inválido, no hay llave literal.

### 🟡 IMPORTANTE (debería corregirse — NO bloquea SET7)

**IMPORTANTE-1 — `Notificar Equipo Handoff` manda el reason con el nombre de campo equivocado → la edge function lo rechaza y NO auto-asigna.**
- **Archivo:** `crm-v2/n8n/workflows/chatbot-momentum-bot-c-v1.json`, nodo `Notificar Equipo Handoff` (id `set2-handoff-notify-equipo-0001`).
- **Qué pasa:** el `jsonBody` manda `params: { handoff_reason: "router_silent_handoff", ... }`. Pero el handler `handleHandoffEscalate` de `bot-actions/index.ts` (L1020) lee `params.reason`, no `params.handoff_reason`. Además `"router_silent_handoff"` ni siquiera es un enum válido (`HANDOFF_REASONS` = qualified/scheduling/objection_complex/bot_stuck/user_requested/manual). Resultado: `rawReason = ""` → L1021 `invalid_reason` → la función retorna `skipped` y **NO ejecuta el UPDATE, NI el round-robin `assign_round_robin`, NI escribe `handoff_summary`**.
- **Por qué NO es crítico ahora:** el apagado real lo hace el nodo `Silent Handoff Apagar Bot` (SQL de P0b), que SÍ corre antes y setea `handler='human'`+`handoff_status='pending'`. Entonces la conversación SÍ se apaga y SÍ aparece como pending en el inbox. Lo único que se pierde es la **auto-asignación a un agente** (queda en "Sin Asignar") y el **summary** de ese call.
- **Por qué es PRE-EXISTENTE, no de SET7:** este nodo no fue tocado por el build script set7. El bug existe desde set2. Antes de SET7 todo Path A estaba muerto igual (el query de apagado estaba roto por `bot_apagado`), así que el bug nunca se notó. SET7 revive Path A (apagado) pero deja el notify roto.
- **Fix concreto (para un set8, fuera de SET7):** en el `jsonBody` de `Notificar Equipo Handoff`, cambiar el `params` a:
  ```json
  "params": {
    "reason": "{{ $('Router').first().json.output.datos_extraidos.lead_listo_para_agendar ? 'scheduling' : 'user_requested' }}",
    "summary": "{{ $('Router').first().json.output.motivo || '' }}"
  }
  ```
  (el handler espera `reason` + `summary`; `reason` debe ser un enum válido). Alternativamente, dado que P0b ya hace el apagado, cambiar este call a `operation: 'assign.set'` con `strategy: 'round_robin'` si lo único que se quiere es la asignación. **Decidir con el founder qué semántica quiere (auto-assign sí/no).**
- **Riesgo si NO se arregla:** cada handoff por aceptación de llamada cae en el inbox sin asignar; un admin debe tomarlo manualmente desde el filtro "Sin Asignar". Operativamente tolerable a corto plazo (Pérez Luna en onboarding, volumen bajo).

### 🔵 MENOR / SUGERENCIA (opcional)

**MENOR-1 — `COALESCE(handoff_reason, 'scheduling')` etiqueta como 'scheduling' los vacíos defense-in-depth que NO sean scheduling.**
- El Guard out#1 (vacío) → Silent Handoff aplica `'scheduling'` como reason a CUALQUIER output vacío, no solo a la aceptación de llamada. Hoy es correcto porque la única causa legítima de vacío es ETAPA 4 (verificado: única instrucción de silencio en ambos prompts de agente). Si en el futuro se agrega otro caso de "agente calla a propósito que NO es scheduling", el reason quedará mal etiquetado. **Mitigación ya presente:** la sticky note SET7 documenta exactamente esta asunción ("output vacío == handoff intencional"). No requiere acción ahora.

**MENOR-2 — Falta el git tag de rollback `bot-c-PRE-SET7-2026-06-06`.**
- El snapshot inmutable SÍ existe y es válido: `crm-v2/n8n/workflows/snapshots/bot-c-v1-PRE-FIX-HANDOFF-LEAK-2026-06-06.json` (98 nodos, sin Guard, con el query roto `bot_apagado` — confirma que es el estado pre-fix correcto). El rollback es ejecutable vía `n8n-push.mjs` con ese archivo. El tag git de la spec §11 no está creado, pero el snapshot file es la red de seguridad real. **Sugerencia:** crear el tag antes del PUT por convención (`git tag -a bot-c-PRE-SET7-2026-06-06`), pero no bloquea.

**MENOR-3 — Nombre del snapshot difiere de la convención de la spec.**
- La spec §11 pidió `bot-c-v1-PRE-SET7-2026-06-06.json`; el archivo real es `bot-c-v1-PRE-FIX-HANDOFF-LEAK-2026-06-06.json`. Mismo contenido, mismo propósito, fecha correcta. Cosmético.

---

## 4. Lo que está bien (reconocimiento)

- **Defense-in-depth real, no teatro.** El Guard cubre los 4 casos de vacío (`null`/`undefined`/`""`/whitespace) con una sola expresión defensiva, clonada del IF robusto correcto (`notEmpty` sobre string, no el boolean débil). El leak no puede volver aunque cualquier nodo upstream falle.
- **P0b ataca causa raíz, no parche.** No solo arregla el query: corrige los 3 errores reales (columna inexistente + 2 enums inválidos) verificados contra la DB. Y entendió que el camino estaba roto desde set2 — eso es diagnóstico, no parche del dato de test.
- **La recalibración del handoff es coherente en sus dos paths.** P1a-extra (Router) y P1c (IEC) atacan el MISMO principio ("handoff solo por aceptación del lead") desde los dos caminos paralelos. Sin esa coherencia, el bug seguiría vivo por el path no arreglado. El builder entendió la arquitectura dual.
- **Idempotencia de verdad.** Re-corrí el build: 32/32 smoke tests, y los md5 del workflow Y del .md quedaron byte-idénticos. El script borra-antes-de-crear y opera por nombre. Re-corrible sin daño.
- **0 llaves literales** en ambos prompts LangChain (la regla del kit que rompe silencioso). Verificado.
- **Sticky note honesta:** documenta la asunción semántica peligrosa ("output vacío == handoff") en vez de esconderla.
- **El handoff es genuinamente silencioso:** confirmé que NO hay ningún path desde la rama de handoff de vuelta al Formateador o a YCloud. Dead-end real.

---

## 5. Decisión final

🟡 **PASS CON OBSERVACIONES — listo para entregar al founder y deployar.**

**Resumen de lo que SET7 cambia (3 líneas):**
1. Mata el leak de format-instructions con un guard de output vacío (`Guard Output Vacio?`) entre los agentes y el Formateador — cualquier output vacío va a handoff silencioso, nunca al parser.
2. Arregla el query del `Silent Handoff Apagar Bot` (estaba roto desde set2 con una columna inexistente y 2 enums inválidos) — ahora el handoff por el Router REALMENTE apaga el bot (`handler='human'`).
3. Recalibra el handoff en Router (P1a/P1a-extra) y Extractor (P1c) para que dispare SOLO por aceptación explícita del lead, nunca por interés/dolor/pregunta de precio/oferta del bot.

**Lo que el founder tiene que activar/hacer manualmente:**
- El workflow YA está `active=true` (es el LIVE in-place). Para que el cambio tome efecto hay que hacer el **PUT a N8N** con este JSON (`Jsh4krhC9HRUh7Ly`).
- **P1b (bot_config del Agente Principal) es un artefacto SEPARADO** — NO está en este JSON. Hay que correr `node crm-v2/scripts/update-momentum-bot-config.js` tras confirmar que `_compiled/agente-principal.txt` tiene el cambio de ETAPA 4 (lo verifiqué: L106 + L134 ya tienen "propone la llamada UNA vez / NO re-pregunta el día"). **Recordatorio: este review NO valida el deploy de P1b, solo que el texto fuente está correcto.**
- **QA en DB obligatorio (riesgo fail-open):** tras disparar un handoff de prueba (T2/T3), correr `SELECT handler, handoff_status, handoff_reason FROM conversations WHERE id=<x>` y confirmar `handler='human'`. NO confiar en que el nodo "ejecutó OK" (está blindado con `onError`). Los enums ya los validé contra la DB, pero el QA en vivo cierra el loop.

**Antes del PUT (recomendado, no bloqueante):**
- Crear el git tag de rollback (`git tag -a bot-c-PRE-SET7-2026-06-06`) — el snapshot file ya existe.

**Para el próximo set8 (no bloquea SET7):**
- Arreglar IMPORTANTE-1 (`Notificar Equipo Handoff` → `params.reason` con enum válido) para recuperar el auto-assign round-robin tras handoff. Hoy las conversaciones handoff caen en "Sin Asignar" y un admin las toma a mano.

---

### Anexo — Evidencia de verificación ejecutada (no asumida)

- `node scripts/validate-n8n-expressions.js`: 99 nodos, 125 expr, **0 violaciones**.
- `node scripts/build-bot-c-v1-set7-fix-handoff-leak.js` (re-run): **32/32 smoke tests passed**, md5 idéntico antes/después → idempotente byte a byte.
- `psql` contra `SUPABASE_DIRECT_URL` (DB viva):
  - `conversation_handler` enum = `bot, human, unassigned` → `'human'` ✓
  - `conversation_handoff_status` enum = `none, pending, handled` → `'pending'` ✓
  - `conversation_handoff_reason` enum = `qualified, scheduling, objection_complex, bot_stuck, user_requested, manual` → `'scheduling'` ✓
  - columnas del UPDATE P0b todas existen; `bot_apagado` count=0 (no existe).
- Connections verificadas: agentes `main[0]=[Cargar Tags, Guard]`; Guard out#0→Formateador, out#1→Silent Handoff; Silent Handoff feeders = `{Switch out#2, Guard out#1}`; Silent Handoff → Notificar → dead-end.
- `bot-actions/index.ts` L1003-1133 leído: `handleHandoffEscalate` lee `params.reason` (confirmando IMPORTANTE-1); L1613 `params = body.params` sin aliasing.
- `Chatbot Activado?` gate leído: exige `handler='bot'` → confirma que `handler='human'` apaga el bot.
- Snapshot rollback `bot-c-v1-PRE-FIX-HANDOFF-LEAK-2026-06-06.json` validado: 98 nodos, sin Guard, query roto → punto de rollback correcto.
