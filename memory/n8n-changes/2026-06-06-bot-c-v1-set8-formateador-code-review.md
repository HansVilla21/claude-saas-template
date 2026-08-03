# Review: bot-c v1 — SET8 — Formateador-LLM → Code node determinista

**Fecha:** 2026-06-06
**Reviewer:** n8n-reviewer
**Spec:** memory/n8n-changes/2026-06-06-bot-c-v1-set8-formateador-code.md
**Build:** crm-v2/scripts/build-bot-c-v1-set8-formateador-code.js → crm-v2/n8n/workflows/chatbot-momentum-bot-c-v1.json
**Workflow LIVE:** N8N id `Jsh4krhC9HRUh7Ly` (in-place, active=true)
**Resultado:** ✅ **PASS**

> El riesgo que motivó SET8 está **MUERTO**: ya no hay LLM ni Structured Output Parser en el camino del formateo.
> Es imposible que vuelva a aparecer `Model output doesn't fit required format` o un leak de format-instructions
> en este tramo. El reemplazo es un Code node determinista verificado escenario por escenario contra el JSON
> realmente deployado (no contra el build script). Apto para que el founder active.

---

## 1. Checklist (skill n8n-workflow-audit — 15 puntos)

| # | Check | Resultado | Evidencia |
|---|---|---|---|
| 1 | Integridad referencial `$('NodeName')` | ✅ PASS | `validate-n8n-expressions.js` → 97 nodos, 124 expresiones, **0 violaciones**, exit 0. Recorrido recursivo manual sobre TODO el wf: **0 refs** a `$('Formateador de Mensajes')` / `$('Structured Output Parser1')` / `$('OpenAI Chat Model - Formateador')` (ni `$node[...]`/`$items(...)`). |
| 2 | Conexiones huérfanas | ✅ PASS | Scan completo de `connections`: **0** sources/targets apuntando a nodos inexistentes. Los 3 nodos borrados no quedaron como key ni como destino en ningún slot. |
| 3 | Tools sin agente | ✅ PASS (N/A al cambio) | SET8 no toca tools/agentes. El trío huérfano preexistente (Auto-fixing / Structured Output Parser / OpenAI Chat Model - Parser) sigue intacto — **NO se marca FAIL** (documentado §3.3 spec, preexistente). |
| 4 | Modelo + Memoria + Tools del agente | ✅ PASS (N/A) | Sin cambios en agentes. Credencial compartida `OpenAI - General` sigue usada por 6 nodos vivos (Whisper, Agente Principal, Extractor, Objeciones, Router, +Parser huérfano) — borrar el Chat Model del Formateador NO rompió la credencial compartida. |
| 5 | Schema del input al agente | ✅ PASS | Contrato byte-compatible verificado (ver §3 detalle abajo). |
| 6 | Expressions parseables | ✅ PASS | 0 brackets desbalanceados (validator check C). |
| 7 | Triggers de handoff explícitos | ✅ PASS | `Guard Output Vacio? out#1 → Silent Handoff Apagar Bot` **intacto**. SET8 vive 100% en out#0. Sin clase-A: no hay ruta nueva a handoff. |
| 8 | Fallbacks de tools | ✅ PASS | El Code es determinista, sin llamadas externas. Lectura defensiva de input (`leerTextoAgente`) + `bubbles.length===0 → ['']` garantizan ≥1 MENSAJE siempre. |
| 9 | Walkthrough happy path (cierre largo) | ✅ PASS | Ejecutado: 5 párrafos → 5 MENSAJE, contenido íntegro, Limpiar consume sin warning, Split Out emite 5 strings. |
| 10 | Walkthrough lead curioso / saludo corto | ✅ PASS | "hola..." → 1 MENSAJE. No falla por "falta MENSAJE 2". |
| 11 | Walkthrough lead frustrado | ✅ PASS (N/A) | El frustrado se rutea aguas arriba (Router/Guard); el Code solo formatea el output del agente, agnóstico al sentimiento. Sin ruta a handoff falso. |
| 12 | Walkthrough tool failure / output vacío | ✅ PASS | Output `''`/`null`/`undefined`/whitespace → `{ "MENSAJE 1": "" }`; el IF `Mensaje no vacio?` downstream lo filtra → nada llega al lead. Sin crash, sin leak. |
| 13 | Variables de entorno documentadas | ✅ PASS | El Code no usa env vars/credenciales/APIs (spec §5). Correcto. |
| 14 | Sticky notes actualizados | ✅ PASS | Sticky id `70471216` reescrita a "Code determinista (SET8, 2026-06-06)"; ya NO contiene "v5.2" (nota del LLM viejo removida). |
| 15 | active=false en el JSON | ⚠️ N/A → ✅ PASS | Es un cambio **in-place del LIVE** (no un vN.json nuevo). active=true es **correcto y esperado** por diseño (spec §0/§3). El build NO toca el flag. El check estándar "active=false" no aplica a este patrón. |

**15/15 sin FAIL** (1 N/A justificado en #15 por el patrón in-place).

---

## 2. Verificaciones específicas pedidas

### 2.1 Conteo de nodos == 97 ✅
`nodes.length === 97`. Los 3 borrados ausentes como nodo (por id y por nombre) **y** ausentes como key en `connections`. El trío huérfano preexistente SÍ sigue (3 nodos), contando dentro de los 97. Smoke tests del build: **34/34 PASS**.

### 2.2 Cadena del formateo ✅
Verificado contra el JSON deployado:
```
Guard Output Vacio? out#0 → Formatear Mensajes (Code) → Limpiar Puntuacion → Split Out
  → Expand Property Images → Loop Over Items → (out#1) Mensaje no vacio? → ...envío
Guard Output Vacio? out#1 → Silent Handoff Apagar Bot   (intacto)
```
> **Nota sobre el downstream final:** el prompt del audit decía `Mensaje no vacio? → Send Chunk via YCloud` directo. El real (preexistente, NO tocado por SET8) es:
> `Mensaje no vacio? out#1 → Pausa entre Mensajes → Loop`, y `out#0 → ¿Eval Synthetic? → (out#1) Send Chunk via YCloud`.
> Es el patrón SplitInBatches del loop de envío + branch synthetic/real, intacto desde antes. No es un hallazgo: SET8 no llega hasta ahí.

### 2.3 Contrato byte-compatible ✅ (el riesgo #1 de la spec)
- El Code produce **OBJETO** `{ output: { "MENSAJE 1": str, ..., "MENSAJE N": str } }`. Verificado en ejecución: `typeof output === 'object' && !Array.isArray(output)`, claves `MENSAJE 1..N` consecutivas.
- `Limpiar Puntuacion` (leído verbatim): rama `if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))` → itera `Object.keys` y limpia cada valor. **Calza exacto.** Ejecutada la cadena Code→Limpiar en el harness: **0 warnings** `[Limpiar Puntuacion] estructura inesperada`.
- `Split Out` con `fieldToSplitOut: "output"` (v1) sobre el objeto → N items, cada uno `output`=string. Verificado N=1, N=2, N=5, N=6.
- **Contra-prueba:** si el Code hubiera devuelto un array o `{messages:[]}`, Limpiar caería al `else` → dropea `output` → rompe Split Out. El Code NO hace eso. Riesgo cerrado.

### 2.4 El Code node (jsCode leído completo + EJECUTADO) ✅
Ejecuté el jsCode **extraído del JSON deployado** (no del build script) en un harness que simula `$input.all()` de n8n:
- **Return shape:** `return out` donde `out` es `[{ json: {...} }, ...]` — válido para `runOnceForAllItems`. ✅
- **Lee bien el texto:** `leerTextoAgente(j)` → `j.output` (string) en el camino normal; ramas defensivas para `j.output.text` / `j.text`. ✅
- **NUNCA trunca:** PASO 5 cap a MAX_BURBUJAS=6 **FUSIONA** el sobrante (`merged.slice(MAX-1).join('\n')`), no descarta. Verificado con 8 párrafos → 6 burbujas, los 8 textos presentes en el output (concat == original mod whitespace). ✅
- **SIEMPRE ≥1 MENSAJE:** `if (bubbles.length===0) bubbles=['']`. Verificado con vacío/null/undefined/whitespace → `{ "MENSAJE 1": "" }`. ✅
- **Vacío/null defensivo:** sí, las 4 variantes resuelven a `''` sin crash. ✅
- **Sin `new URL()` / `crypto` / `URLSearchParams`:** confirmado — los tokens `new URL` y `crypto` aparecen **solo en un comentario de documentación (línea 15)** que dice que NO se usan. Cero uso real (verificado por grep con número de línea + el smoke test del build que strippea comentarios). ✅
- **Lookbehind `(?<=[.!?])\s+`:** ejecutado OK en este runtime (Node 22). Es ES2018 (V8), soportado por N8N 1.121 (Node 20). El Code además trae fallback documentado sin lookbehind por si un runtime futuro fallara. Riesgo #6 de la spec: cerrado. ✅
- **`$input.all()`** (no `.item` frágil) post-IF. ✅
- **Preserva el item:** `{ ...j, output: outputObj }`. Verificado: `lead_id`/`id`/`type` sobreviven. ✅

### 2.5 0 refs huérfanas ✅
Recorrido recursivo sobre `wf.nodes` completo (patrones `$('...')`, `$node[...]`, `$items(...)`) para los 3 nombres borrados: **0 hits**. Confirmado además por `validate-n8n-expressions.js` (0 violaciones).

### 2.6 Sticky note ✅
La sticky del Formateador (id `70471216`) ahora describe el Code determinista de SET8, conserva el contrato del marker `[IMG:CR-XXXX]` en MENSAJE 1, y removió la descripción del LLM v5.2.

---

## 3. Walkthroughs detallados (ejecutados, no mentales)

> Todos corridos con el jsCode REAL del JSON deployado en un harness Node que reproduce `runOnceForAllItems`.

### Escenario 1 — Cierre largo del pitch (5 párrafos)
**Input:** 5 párrafos separados por dobles saltos (pitch + valor + dolor + prueba social + CTA).
**Trayectoria:** Guard out#0 → Code → `{ "MENSAJE 1".."MENSAJE 5" }` → Limpiar (5 limpios) → Split Out (5 items) → 5 bubbles.
**Resultado:** ✅ 5 burbujas [64,133,112,85,81] chars. Contenido íntegro. Sin `Model output doesn't fit required format`. **El bug original está muerto.**

### Escenario 2 — Saludo corto (1 línea)
**Input:** `"hola, claro te ayudo con eso"`.
**Resultado:** ✅ 1 burbuja, `MENSAJE 1` == texto exacto. **Ya NO falla por "esperaba MENSAJE 2"** (era la causa raíz del parser rígido).

### Escenario 3 — Texto largo sin dobles saltos (~471 chars, 1 párrafo)
**Resultado:** ✅ partido por oraciones en 2 burbujas [295,175]. Ninguna palabra cortada (mismo set de palabras que el original). Sin pérdida de texto.

### Escenario 4 — Output vacío del agente (defensivo)
**Input:** `''`, `null`, `undefined`, `'   '`.
**Resultado:** ✅ cada uno → `{ "MENSAJE 1": "" }`. El IF `Mensaje no vacio?` (text requiere `$json.output` truthy) **NO deja pasar** la burbuja vacía → nada llega al lead. Sin crash, sin leak. (En el camino normal el Guard out#1 ya rutea estos a Silent Handoff antes de llegar al Code.)

### Escenarios extra de estrés (defensa en profundidad)
- **8 párrafos → cap 6:** ✅ fusiona el sobrante en la última burbuja, los 8 textos presentes. No trunca (riesgo #7 cerrado).
- **Palabra/URL > 350 chars:** ✅ queda intacta en su propia burbuja, no se rompe.
- **Batch de 3 items:** ✅ procesa los 3, preserva ids.
- **Marker `[IMG:CR-1234]` al inicio:** ✅ queda intacto al inicio de MENSAJE 1 (el contrato de Expand Property Images se mantiene).
- **2 párrafos cortos (`dos\n\ntres`, <35 chars c/u):** ✅ `mergeCortas` los fusiona en 1 burbuja `"dos\ntres"` — comportamiento **intencional** (evita spam de 1-palabra), contenido preservado. (Mi assertion inicial esperaba 2; el código es correcto, la expectativa del test era mía.)

---

## 4. Lo que está bien (reconocimiento)

- **Fix de raíz, no parche.** Sacar el LLM del formateo elimina la clase entera de bug (formato + leak), en vez de subir reintentos o relajar el parser. Cumple "atacar causa raíz" de feedback-n8n-build.
- **Blast radius minimizado.** Mantener `Limpiar Puntuacion` (SET6, probado en prod) separado en vez de fundir fue la decisión correcta (spec §6) — no reintroduce riesgo de regresión en las reglas de puntuación afinadas con el founder.
- **Clon estructural real, no inventado.** El Code node clona `type`/`typeVersion`/keys de `Limpiar Puntuacion` (mismas 6 keys verificadas) — cumple "no armar nodos desde memoria".
- **NUNCA trunca.** El cap fusiona el overflow; ningún escenario pierde texto del lead.
- **Idempotencia real.** Re-corrí el build 2x: MD5 idéntico, 34/34 smoke tests, 97→97 nodos. Sin drift.
- **Borrado por id con guard.** El build aborta si un nombre no matchea su id esperado — protege contra colisiones.
- **Defensa en profundidad sobre burbujas vacías:** el Code no genera vacíos (trim+filter) Y el IF downstream filtra — doble red.

---

## 5. Observaciones (NO bloquean — para el founder y próximos sets)

- 🔵 **Constantes tuneables, validar feeling real (riesgo #4 spec).** MAX_CHARS=350 / MAX_BURBUJAS=6 / MAX_LINEAS=4 / MIN_CHARS_MERGE=35 producen un partido razonable en los tests, pero el "se siente WhatsApp natural" solo se valida con un cierre largo REAL en prod (T1). Si el founder ve burbujas muy largas o muy fragmentadas, ajustar las consts arriba del Code (están documentadas como tuneables). No es bug.
- 🔵 **Bullets pegados en una línea** (`"Tenemos: • A • B • C"`) quedan en una sola burbuja — limitación conocida y documentada (spec §9.5). Este bot no manda listas largas; si aparece feo en prod, es un split determinista por `•` en un set posterior, no un bug de SET8.
- 🔵 **Trío huérfano preexistente** (Auto-fixing / Structured Output Parser / OpenAI Chat Model - Parser) sigue como código muerto. NO es de SET8 (preexistente) y NO debe marcarse FAIL. Candidato a limpieza cosmética en un set9 aparte.
- 🔵 **Line endings:** git avisa LF→CRLF en el próximo touch. Cosmético (el build escribe LF, idempotente). Sin impacto funcional.

---

## 6. Decisión final

### ✅ PASS — listo para entregar al founder

**Qué cambió (2-3 líneas):** SET8 reemplaza la cadena LLM del Formateador (chainLlm + Chat Model + parser rígido de 2 mensajes) por **un Code node determinista** (`Formatear Mensajes (Code)`) que parte el output del agente en burbujas de WhatsApp con conteo variable. Quedan 97 nodos, in-place sobre el LIVE, active=true. El contrato de salida (`{ output: { "MENSAJE N": str } }`) es byte-compatible con `Limpiar Puntuacion` + `Split Out`, verificado en ejecución.

**Por qué PASS:** el riesgo que motivó el cambio está eliminado de raíz — sin LLM ni parser en el formateo, `Model output doesn't fit required format` y el leak de format-instructions **son imposibles** en este tramo. Los 4 walkthroughs obligatorios + 7 casos de estrés se ejecutaron contra el JSON realmente deployado y pasaron; el único FAIL del harness fue una expectativa de test mía equivocada (el merge de cortas es correcto). 0 refs huérfanas, 0 conexiones huérfanas, rama de handoff intacta, build idempotente (34/34, MD5 estable).

**Qué tiene que hacer el founder manualmente (deploy):**
1. **Push del workflow al LIVE** (`Jsh4krhC9HRUh7Ly`) — el reviewer NO deployó (snapshot + tag `bot-c-PRE-SET8-2026-06-06` ya existen para rollback en <60s).
2. **QA post-deploy en WhatsApp** (test +50688217229): correr **T1** (provocar cierre largo de 4-5 burbujas → confirmar N mensajes bien partidos, ninguno vacío, ningún error de formato), **T2** (saludo corto → 1 burbuja), **T5** (output vacío → handoff intacto, lead no recibe nada).
3. **Ajustar las constantes del split** en el Code (MAX_CHARS/MAX_BURBUJAS/etc.) si tras T1 el feeling no es de "WhatsApp natural". Están documentadas como tuneables arriba del jsCode.

**Rollback si algo sale mal:** push del snapshot `bot-c-v1-PRE-SET8-2026-06-06.json` (vuelve el Formateador-LLM, 99 nodos, y con él el bug original — estado seguro temporal).
