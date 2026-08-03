# Review: Sofia v5 — Images

**Fecha:** 2026-05-21
**Reviewer:** n8n-reviewer
**Spec:** `memory/n8n-changes/2026-05-21-sofia-v5-images.md`
**Prompt:** `memory/research/09-sofia-v5-prompt-images.md`
**Build:** `scripts/build-workflow-v5.js` → `n8n/workflows/chatbot-inmobiliaria-demo-ycloud-sofia-v5.json`
**Edge function:** `properties-search` v1.5 deployed (Supabase version 14)
**Resultado:** ✅ PASS

---

## 1. Checklist (skill n8n-workflow-audit — 15 checks)

| # | Check | Resultado | Evidencia |
|---|---|---|---|
| 1 | Integridad referencial `$('NodeName')` | ✅ PASS | `node scripts/validate-n8n-expressions.js` → "No violations found", 65 expressions scanned, exit 0 |
| 2 | Conexiones huérfanas | ✅ PASS | El nuevo `Expand Property Images` está bien encadenado (Split Out → Expand → Loop). No quedaron nodos sin entrada salvo triggers (`Webhook - YCloud Inbound`) y sticky notes (esperado) |
| 3 | Tools sin agente | ✅ PASS | `Supabase Properties Tool` y `Request Handoff Tool` siguen conectados a `Agente Principal - Sofia` vía `ai_tool` (sin cambios estructurales) |
| 4 | Agente con modelo + memoria + tools | ✅ PASS | Sofia mantiene `OpenAI Chat Model - Sofia` + `Postgres Chat Memory - Sofia` + 2 tools (sin cambios) |
| 5 | Schema input al agente matchea prompt | ✅ PASS | El `text` del agente Sofia incluye `nombre_lead, conversation_id, agency_id, telefono, message_count` (sin cambios vs v4). El prompt v5 los referencia todos |
| 6 | Expressions parseables | ✅ PASS | Validator script reporta brackets balanceados en los 65 strings escaneados |
| 7 | Triggers de handoff explícitos (NO vagos) | ✅ PASS | Sin cambios vs v4 — las 6 condiciones AND siguen operacionalizadas turn-by-turn |
| 8 | Fallbacks de tools | ✅ PASS | Properties Tool tiene fallback verbal en el prompt v5 (Constraint #3, #8 + DO #5). Code node `Expand Property Images` tiene `try/catch` con timeout 5s. `Send Chunk via YCloud` tiene `onError: continueRegularOutput` |
| 9 | Walkthrough happy path | ✅ PASS | Ver sección 2.1 |
| 10 | Walkthrough lead curioso | ✅ PASS | Ver sección 2.2 |
| 11 | Walkthrough lead frustrado | ✅ PASS | Ver sección 2.3 (sin cambios funcionales vs v4) |
| 12 | Walkthrough tool failure | ✅ PASS | Ver sección 2.4 |
| 13 | Variables de entorno documentadas | ✅ PASS | Sin env vars nuevas. El secret de Properties está hardcodeado en el Code node (mismo patrón que el `Supabase Properties Tool` del v4 que ya hace lo mismo). `agency_id` se obtiene del flow via `$('Resolve Agency')` |
| 14 | Sticky notes actualizados | ✅ PASS | `Sticky - Agentes` reescrito para v5 mencionando capacidad de imágenes y el Code node nuevo |
| 15 | `active: false` en JSON exportado | ✅ PASS | `workflow.active === false` confirmado en JSON |

---

## 2. Walkthroughs detallados

### 2.1 Escenario 1 — Happy path: 1 propiedad con 3 imágenes

**Input:** lead manda *"qué tenés en Escazú hasta $250K"*. Lead ya existe en Buscar Lead (Supabase), chatbot activo.

**Trayectoria:**
1. Webhook → Extract Variables → Set Normalize Text → ID y Mensaje → Buscar Lead (Supabase) → Chatbot Activado? (true) → Detectar Link en Mensaje → Tiene Link? (false) → REINICIAR? (false) → Variables → Conversation → Code Formatear Historial → Unificacion de Variables → **Agente Principal - Sofia**
2. Sofia clasifica como Flow A (Info-only — "qué tenés" sin contexto). Aplica el algoritmo: NO mostrar inventario sin filtro. Pero como el lead dio zona ("Escazú") + rango ("hasta $250K"), llama `Supabase Properties Tool` con `zona: "Escazú"`, `precio_max: 250000`.
3. Tool devuelve 3 propiedades. La top es CR-2031 (la única con `foto_count: 4`).
4. Sofia escribe (según prompt v5 DO #11): `"output": { "MENSAJE 1": "[IMG:CR-2031] Te tengo esta...", "MENSAJE 2": "..." }`.
5. **Formateador de Mensajes** parsea el JSON → emite 2 chunks. **Split Out** → 2 items con `{output: "..."}`.
6. **[NUEVO] Expand Property Images** procesa los 2 items:
   - Chunk 1 contiene `[IMG:CR-2031]` → match. Fetch a edge function v1.5 con `codigo: CR-2031`. Recibe `foto_urls: [u1, u2, u3, u4]` (cap a 3 por la regla del Code node). Emite:
     - `{type:"image", url: u1, caption: "CR-2031 — Casa moderna en Escazú, $185K"}`
     - `{type:"image", url: u2, caption: ""}`
     - `{type:"image", url: u3, caption: ""}`
     - `{type:"text", output: "Te tengo esta..."}` (sin el marker)
     - `alreadyExpandedOne = true`
   - Chunk 2 sin marker → emite `{type:"text", output: "..."}` sin tocar.
7. **Loop Over Items** itera sobre los 5 items: 3 images + 2 text.
8. **Mensaje no vacio?** evalúa cada uno:
   - Items image: `type === 'image' && url notEmpty` → true → Send Chunk
   - Items text: `type === 'text' && output notEmpty` → true → Send Chunk
9. **Send Chunk via YCloud** ramifica por `$json.type`:
   - Image item → POST `{type:'image', image:{link, caption}}`
   - Text item → POST `{type:'text', text:{body}}`
10. **Pausa entre Mensajes** (2s) entre cada → vuelve a Loop.
11. **En paralelo** del agente: Detector de Descalizacion + Apagar bot? (sin cambios funcionales).

**Tiempo total esperado:** 5 mensajes × 2s pausa = 10s. Lead recibe 3 fotos seguidas (la primera con caption del título+precio) + 2 mensajes de texto.

**Hallazgos:** limpio. No identifiqué punto de quiebre.

---

### 2.2 Escenario 2 — Edge: propiedad SIN fotos (0 imágenes)

**Input:** lead pregunta por una propiedad hipotética cuyo `foto_count === 0` (caso futuro cuando entren agencias con specs sin fotos cargadas).

**Trayectoria:**
1. Sofia llama `Supabase Properties Tool` → recibe la propiedad con `foto_count: 0, foto_urls: []`.
2. Sofia (siguiendo CONSTRAINT #8 + DO #11 del prompt v5) **NO debería** poner el marker. Asumamos por defensiva que el LLM falla esta regla y igual escribe `[IMG:CR-XXXX]`.
3. Expand Property Images fetcha → recibe `foto_urls: []` → la condición `if (fotoUrls.length > 0)` no se cumple → no emite items image, solo el `{type:"text", output: cleanText}` con el marker borrado.
4. Lead recibe solo texto. Caso degrada limpiamente.

**Hallazgos:** PASS. Defensa en profundidad — el Code node es la última línea.

---

### 2.3 Escenario 3 — Edge: marker mal escrito por el LLM

**Casos probados:**

| Input del LLM | Match regex `\[IMG:\s*([A-Za-z]+-?\d+)\s*\]/i` | Normalización | Resultado |
|---|---|---|---|
| `[IMG:CR-2071]` | ✅ Captura `CR-2071` | Mantiene | OK |
| `[IMG: CR-2071 ]` | ✅ Captura `CR-2071` (tolera espacios) | Mantiene | OK |
| `[img:cr-2071]` | ✅ Captura `cr-2071` (flag `i`) | `.toUpperCase()` → `CR-2071` | OK |
| `[IMG:CR2071]` | ✅ Captura `CR2071` (sin guión) | Regex `^([A-Z]+)(\d+)$` → `CR-2071` | OK |
| `[IMG : CR-2071]` (espacio antes de `:`) | ❌ no matchea (espacio antes de `:` no permitido) | — | Marker queda literal en texto. Falla VISIBLE pero no crash |
| `[ IMG:CR-2071]` (espacio inicial dentro de `[`) | ❌ no matchea | — | Marker queda literal. Falla VISIBLE |

**Hallazgos:** PASS. Regex tolerante cubre los casos esperables. Los casos extremos quedan visibles pero no crashean.

---

### 2.4 Escenario 4 — Edge: URL muerto (404 desde Meta)

**Trayectoria:**
1. Expand emite 3 items image. URL 2 está caída.
2. Loop manda item 1 → POST YCloud OK → 200.
3. Pausa 2s.
4. Loop manda item 2 → POST YCloud → Meta intenta descargar URL → 404 → YCloud devuelve 4xx (típicamente `{status: "failed", reason: "media_not_available"}`).
5. **Como `Send Chunk via YCloud` tiene `onError: continueRegularOutput`** → el flow continúa. No aborta.
6. Pausa 2s.
7. Loop manda item 3 → OK.
8. Texto se manda al final.

**Resultado al lead:** 2 fotos buenas + texto. La foto 2 simplemente no llega. Degradación elegante.

**Hallazgos:** PASS. Sin `onError: continueRegularOutput`, una imagen mala abortaría toda la conversación. El builder lo agregó correctamente.

---

### 2.5 Escenario 5 — Edge: 2 propiedades en un mensaje (2 markers)

**Input del LLM:** Sofia escribe `"output": "[IMG:CR-2071] CR-2071 te calza. [IMG:CR-2042] o esta CR-2042 también..."`.

**Trayectoria:**
1. Split Out emite el item con el texto completo (asumimos 1 chunk para el escenario).
2. Expand:
   - Match en `IMG_RE` → primer marker `[IMG:CR-2071]`. Fetch para CR-2071. Emite items image + text.
   - `alreadyExpandedOne = true`.
   - El **`cleanText`** usa `IMG_RE_GLOBAL` para borrar TODOS los markers, no solo el primero → resultado limpio sin ningún `[IMG:...]`.

   Pero antes de eso emite las 3 images de CR-2071 + el text limpio.
3. Lead recibe: 3 fotos de CR-2071 + texto que menciona ambas propiedades.

**Hallazgos:** PASS. Regla "solo expandir el primer marker" funciona. El segundo marker se borra del texto silenciosamente (regla del architect sección 6 riesgo 4). El prompt v5 además explicita esta regla al LLM (DON'T #14 + Few-shot conv 4 con marker solo en la primera de 3 props).

---

### 2.6 Escenario 6 — Edge: tool Properties down (timeout 5s)

**Trayectoria:**
1. Expand intenta fetch → timeout 5s o error 500.
2. Catch loguea via `console.error("[Expand Property Images] fetch failed for CR-XXXX: <msg>")`.
3. Retorna `{fotoUrls: [], titulo: '', precio: ''}`.
4. `if (fotoUrls.length > 0)` no se cumple → solo emite text con marker limpio.
5. Lead recibe solo texto. Sin foto pero sin crash.

**Hallazgos:** PASS. El timeout interno (5s) es estricto pero suficiente para Supabase Edge Functions (típico p95 ~200ms).

---

### 2.7 Escenario 7 — Retrocompat v4 (founder no ha migrado todavía)

**Input:** workflow v4 sigue activo. Llama `Supabase Properties Tool` → edge function v1.5.

**Esperado:** la response tiene `foto_url` (primera URL, retrocompat) + nuevos campos `foto_urls`, `foto_count`. El v4 lee `foto_url` (como antes), ignora los nuevos campos. Sin cambios visibles para el lead.

**Verificación curl:**
```
curl -X POST .../properties-search?secret=... -d '{agency_id, codigo:"CR-2031"}'
→ propiedades[0].foto_url = "https://..." (string, no null)  ✅
→ propiedades[0].foto_urls = [...4 URLs...]               ✅ nuevo
→ propiedades[0].foto_count = 4                            ✅ nuevo
```

**Hallazgos:** PASS. Retrocompat 100%. El founder puede tener v4 activo mientras prueba v5 en paralelo.

---

## 3. Issues encontrados

### 🔴 CRÍTICO (bloquea entrega)
Ninguno.

### 🟡 IMPORTANTE (debería corregirse en próximas iteraciones)

1. **`SEARCH_SECRET` hardcodeado en el Code node `Expand Property Images`.** El secret de búsqueda está literal en el JS del nodo. Hoy ya está hardcodeado igual en el `Supabase Properties Tool` (URL contiene el `?secret=...`), así que NO es regresión — pero es deuda técnica de seguridad. Sugerencia para v5.1: rotar el secret a una credential de N8N referenciada por nombre.

2. **No hay tracking de fotos enviadas por conversation_id.** Si el lead pide "más fotos" en turno 3 después de que ya recibió 3 fotos en turno 1, el LLM (según prompt v5) responde "te paso más en un toque" pero si por error pone marker, vuelve a mandar las mismas 3 fotos. Mitigación documentada en Pre-Mortem Escenario E del prompt. Para v5.1: trackear `images_sent_by_code` en `conversations` table + filtrar en el fetch del Code node.

### 🔵 SUGERENCIA (opcional, no bloqueante)

1. El `MAX_IMAGES_PER_PROPERTY = 3` está hardcodeado en el JS del Code node. Si en el futuro el founder quiere 2 o 4, hay que tocar el script de build y re-ejecutar. Aceptable para MVP — extracción a env var es over-engineering ahora.

2. El JS del Code node tiene `console.error` para fallos del fetch. Visible en logs de N8N pero NO se notifica al founder. Para v5.1: agregar branch que envía a Telegram (reusando el patrón del `Notificar Agente (Telegram)` ya presente).

---

## 4. Lo que está bien

1. **Edge function v1.5 retrocompat total** — `foto_url` se mantiene como primera URL del array. v4 sigue funcionando idéntico.
2. **Script de build idempotente** — corrí `node scripts/build-workflow-v5.js` 2 veces consecutivas. Misma cantidad de nodos (58), misma estructura. Ningún warning. Patrón del v4 respetado.
3. **Pre-Mortem del prompt cubre 6 escenarios específicos del marker** — research 09 sección 4. Defensa en profundidad: prompt → few-shot → Code node → onError del HTTP node → edge function retrocompat.
4. **Regla "1 marker por mensaje" enforced por TRES capas:** (a) prompt v5 DO #12 + DON'T #14, (b) few-shot conv 4 modela el caso, (c) Code node valida `alreadyExpandedOne` como red de seguridad.
5. **El Code node usa `this.helpers.httpRequest`** — patrón estándar de n8n typeVersion 2, evita dependencias externas. Timeout 5s evita hangs.
6. **Validador determinístico (`validate-n8n-expressions.js`) pasa con 0 violaciones** sobre 65 expressions escaneadas. Sin nodos referencias rotas, sin `$fromAI()` huérfano, sin brackets desbalanceados, sin nombres duplicados.

---

## 5. Decisión final

✅ **PASS** — listo para entregar al founder.

### Resumen para el founder (qué tiene que activar)

1. **Edge function ya deployada** por el pipeline — Supabase project, versión 14, `properties-search` v1.5.0. Verificado con curl: `foto_urls` array + `foto_count` numérico. El v4 sigue funcionando (retrocompat).

2. **Importar `n8n/workflows/chatbot-inmobiliaria-demo-ycloud-sofia-v5.json`** en N8N — opciones:
   - (a) Importar como **nuevo workflow** y activarlo manualmente. Desactivar el v4 al mismo tiempo.
   - (b) **Sobreescribir** el v4 importando arriba (N8N preserva el ID si coincide). Más arriesgado — preferir (a).

3. **Hacer 1 mensaje real de prueba** desde el WhatsApp del founder al bot pidiendo *"qué tenés en Escazú hasta $250K"*. Confirmar que recibe:
   - 1+ fotos antes del texto (la primera con caption `CR-XXXX — <título>, <precio>`)
   - El texto descriptivo sin ningún `[IMG:...]` literal
   - Pausa de ~2s entre cada mensaje

4. **Si algo falla** (LLM no pone marker, fotos no llegan, marker queda literal): bug clase A → re-entra al pipeline.

5. **NO activar simultáneamente v4 y v5** con el mismo webhook YCloud. Solo uno a la vez.

**Sin items críticos pendientes.** Las 2 mejoras 🟡 marcadas son backlog técnico para v5.1, no bloquean producción.
