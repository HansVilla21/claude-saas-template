# Spec: bot-c v1 — SET8 — Reemplazar Formateador-LLM frágil por Code node determinista

**Fecha:** 2026-06-06
**Autor:** n8n-architect
**Workflow afectado:** `crm-v2/n8n/workflows/chatbot-momentum-bot-c-v1.json` (LIVE, id N8N `Jsh4krhC9HRUh7Ly`, name "Chatbot Momentum - bot-c v1", 99 nodos post-SET7)
**Versión actual → propuesta:** in-place via build script `set8` (convención del proyecto: NO se versiona a `vN.json`, se editan secuencialmente `set1..set7`; este es `set8`)
**Trigger del cambio:** bug en producción — el `Formateador de Mensajes` (chainLlm + parser rígido) falla con `Model output doesn't fit required format` cuando el agente produce un conteo de burbujas ≠ 2 (el parser espera EXACTAMENTE MENSAJE 1 + MENSAJE 2). Segundo fallo de este Formateador-LLM (el primero fue el leak de format-instructions, mitigado por el guard de SET7). El kit recomienda "Response Formatter como Code Node, 0 LLM" — fix de raíz.

---

## 0. Resumen ejecutivo (TL;DR para el builder)

Sacar la cadena LLM de formateo (`Formateador de Mensajes` chainLlm + su Chat Model + su parser) y poner UN Code node determinista en su lugar. El Code node parte el texto del agente en burbujas de WhatsApp y produce el MISMO shape que hoy consume `Limpiar Puntuacion`: `{ output: { "MENSAJE 1": "...", ..., "MENSAJE N": "..." } }` con conteo VARIABLE. Sin LLM → no puede volver a fallar por formato ni filtrar instrucciones internas. `Limpiar Puntuacion` (SET6) se mantiene intacto.

**Decisión tomada (ver §6):** minimal-risk → **split-only en el Code nuevo + mantener `Limpiar Puntuacion` separado** (2 Code nodes en serie). NO fundir.

**Cambio neto de nodos:** 99 → 98 (se crea 1 Code, se borran 2: el chainLlm + su Chat Model; se borra también el parser conectado `Structured Output Parser1` = 99 + 1 − 3 = 97... ver §3 para el conteo exacto y el detalle de los nodos huérfanos preexistentes).

---

## 1. Problema / requerimiento

El `Formateador de Mensajes` es un `@n8n/n8n-nodes-langchain.chainLlm` (gpt-4o-mini) con `hasOutputParser: true`, conectado por `ai_outputParser` al `Structured Output Parser1`. Ese parser usa `jsonSchemaExample` con EXACTAMENTE dos claves de ejemplo:

```json
{ "MENSAJE 1": "contenido mensaje 1", "MENSAJE 2": "contenido mensaje 2" }
```

El agente produce burbujas de **largo variable**: el cierre del pitch genera 4-5 burbujas, un saludo o un "ok" genera 1. El parser rígido de LangChain rompe con cualquier conteo ≠ 2 → `Model output doesn't fit required format`. El nodo tiene `retryOnFail: true, maxTries: 5` → gpt-4o-mini reintentó 5 veces y falló las 5.

El founder quiere eliminar la fragilidad de raíz: el formateo de burbujas es una operación **determinista** (partir texto por párrafos/largo), no requiere un LLM. Un Code node no puede fallar por "formato de salida del modelo" ni regenerar/filtrar contenido.

## 2. Estado actual relevante

Verificado contra el JSON real (líneas citadas son del archivo actual post-SET7).

### 2.1 Cadena de formateo actual (la que se reemplaza)

```
Guard Output Vacio?  (IF, id set7-guard-output-vacio-0001, out#0 = TRUE/contenido)
  └─ main[0] → Formateador de Mensajes  (chainLlm v1.5, id c1186d30-893e-4c05-8e21-8f741be9d2af)
                 ├─ ai_languageModel ← OpenAI Chat Model - Formateador  (lmChatOpenAi v1.2, id 886456af-...)
                 ├─ ai_outputParser  ← Structured Output Parser1        (outputParserStructured v1.3, id f3b4c11d-98ba-4992-95fa-27bab9160685)
                 └─ main[0] → Limpiar Puntuacion  (code v2, id set6-limpiar-puntuacion-post-formateador-0001)
                                └─ main[0] → Split Out  (splitOut v1, id f47ac234-..., fieldToSplitOut="output")
                                               └─ main[0] → Expand Property Images  (code v2, id expand-property-images-v5)
                                                              └─ main[0] → Loop Over Items  (splitInBatches v3, id 6cd9942e-...)
                                                                             └─ out#1 → Mensaje no vacio?  (IF v2.2, id 48cc3a86-...)
                                                                                          └─ out#1 → Send Chunk via YCloud (httpRequest v4.2, id f320c5be-...)
```

**Detalles confirmados:**
- `Formateador de Mensajes` (L899-922): `promptType: "define"`, `text: "=Respuesta a formatear: {{ $json.output }}"`, `hasOutputParser: true`, `retryOnFail: true`, `maxTries: 5`. Su `messageValues[0].message` es el prompt de formateo (el que ya NO se necesita).
- `OpenAI Chat Model - Formateador` (L923-946): gpt-4o-mini, credencial `OpenAI - General` (id `9Rn3IRmVHsztMOQC`). Conectado por `ai_languageModel` SOLO al Formateador (connections L3032-3041).
- `Structured Output Parser1` (L2716-2728): `jsonSchemaExample` rígido de 2 mensajes, typeVersion 1.3. Conectado por `ai_outputParser` SOLO al Formateador (connections L3814-3823).
- `Limpiar Puntuacion` (L2729-2743, id `set6-...`): lee `$json.output`, lo trata como objeto `{ "MENSAJE N": str }` (o string JSON parseable), limpia cada valor, devuelve `{ ...j, output: {cleaned}, output_raw_pre_limpieza: rawOutput }`. **Se mantiene SIN cambios.**
- `Split Out` (L1000-1013): `fieldToSplitOut: "output"`. Splittea el OBJETO `output` por sus claves → un item por clave, cada item con `output` = el VALUE (string).
- `Expand Property Images` (L1296-1308): lee `item.json.output` como **STRING** (`.toString()`), busca markers `[IMG:...]`, empuja `{ type:'text', output: cleanText }` o `{ type:'image', url, caption }`.

### 2.2 Sub-grafo huérfano PREEXISTENTE (no tocado por SET8, pero documentado)

Hay un trío de nodos de parser que NO está conectado a ninguna cadena viva (es código muerto que quedó de una iteración previa):

- `Auto-fixing Output Parser` (outputParserAutofixing v1, id `1ea7eb92-...`, L947-961) → su `ai_outputParser` está **vacío** (`[[]]`, connections L3043-3046). No alimenta a nadie.
- `Structured Output Parser` (outputParserStructured v1.2, id `c2430bec-...`, L962-975, schema con envoltorio `output`) → `ai_outputParser` → `Auto-fixing Output Parser` (L3048-3057). Pero como el Auto-fixing no va a ningún chainLlm, está muerto.
- `OpenAI Chat Model - Parser` (lmChatOpenAi v1.2, id `03a5eb15-...`, L976-999) → `ai_languageModel` → `Auto-fixing Output Parser` (L3059-3068). También muerto.

> **Estos 3 nodos YA están huérfanos hoy.** NO los crea ni los conecta nada vivo. SET8 NO los toca (no son el `Structured Output Parser1` que sí está conectado al Formateador). Ver §3.3 para la recomendación sobre limpiarlos o dejarlos (recomendación: dejarlos en este set para minimizar el blast radius; limpiarlos es un refactor cosmético aparte).

## 3. Cambio propuesto

### 3.1 Nodos a crear

| Nombre | Type | typeVersion | Posición aprox. | Parámetros críticos |
|---|---|---|---|---|
| `Formatear Mensajes (Code)` | `n8n-nodes-base.code` | **2** | `[2176, 920]` (misma posición que ocupaba el `Formateador de Mensajes`, para no desordenar el canvas) | `mode: "runOnceForAllItems"`, `language: "javaScript"`, `jsCode` = algoritmo de §4. **Clonar la estructura del Code node `Limpiar Puntuacion`** (id `set6-...`, typeVersion 2, `mode: runOnceForAllItems`) para `type`/`typeVersion`/forma de `parameters` — NO inventar. |

> **Por qué typeVersion 2:** los 3 Code nodes existentes del workflow (`Limpiar Puntuacion` id set6, `Expand Property Images` id expand-..., `Code Formatear Historial` id 026c...) usan `n8n-nodes-base.code` typeVersion 2. Clonar de uno de esos, NO usar 2.1/2.2 desde memoria.

### 3.2 Nodos a modificar

| Nombre | Qué cambia | Por qué |
|---|---|---|
| (ninguno) | `Limpiar Puntuacion`, `Split Out`, `Expand Property Images`, `Guard Output Vacio?` quedan **sin cambios de parámetros**. Solo cambian conexiones (§3.4/§3.5). | El contrato de shape se mantiene byte-compatible (ver §4.2). |

### 3.3 Nodos a borrar

| Nombre | id | Razón |
|---|---|---|
| `Formateador de Mensajes` | `c1186d30-893e-4c05-8e21-8f741be9d2af` | chainLlm reemplazado por el Code determinista. |
| `OpenAI Chat Model - Formateador` | `886456af-f7d8-4c4e-a148-2203742ceab5` | Queda huérfano al sacar el chainLlm (solo lo alimentaba a él vía `ai_languageModel`). |
| `Structured Output Parser1` | `f3b4c11d-98ba-4992-95fa-27bab9160685` | Queda huérfano al sacar el chainLlm (solo lo alimentaba a él vía `ai_outputParser`). **Es el parser rígido de 2 mensajes — la causa raíz.** |

> **Recomendación sobre el trío huérfano preexistente** (`Auto-fixing Output Parser`, `Structured Output Parser`, `OpenAI Chat Model - Parser`, §2.2): **NO borrarlos en SET8.** Ya están muertos y desconectados; borrarlos no cambia el comportamiento y agranda el diff del build script (más nodos a tocar = más superficie de error en un cambio que ya borra 3 nodos vivos). Limpiarlos es un refactor cosmético que puede ir en un `set9` aparte o en el próximo pull manual. **Decisión documentada: dejarlos.** El reviewer NO debe marcar FAIL por su existencia (preexistente a este cambio).

> **Conteo de nodos resultante:** 99 (post-SET7) − 3 (borrados) + 1 (Code nuevo) = **97 nodos**. El smoke test del build debe afirmar `nodes.length === 97`. (Los 3 huérfanos preexistentes siguen contando dentro de los 97.)

### 3.4 Conexiones a crear

- `Guard Output Vacio?` main **out#0** (TRUE = tiene contenido) → `Formatear Mensajes (Code)` (main, index 0)
- `Formatear Mensajes (Code)` main out#0 → `Limpiar Puntuacion` (main, index 0)

### 3.5 Conexiones a borrar

- `Guard Output Vacio?` main out#0 → `Formateador de Mensajes`  *(reemplazada por la conexión al Code nuevo)*
- `Formateador de Mensajes` main out#0 → `Limpiar Puntuacion`  *(el Code nuevo asume este edge de salida)*
- `OpenAI Chat Model - Formateador` `ai_languageModel` → `Formateador de Mensajes`  *(se elimina junto con el nodo borrado; al borrar el nodo source, su entrada de connections desaparece)*
- `Structured Output Parser1` `ai_outputParser` → `Formateador de Mensajes`  *(idem)*

> **NO TOCAR:**
> - `Guard Output Vacio?` main **out#1** → `Silent Handoff Apagar Bot` (rama de handoff de SET7 — intacta).
> - `Limpiar Puntuacion` main out#0 → `Split Out` (intacta).
> - Todo el downstream desde `Split Out` (intacto).

> **Estado final del subgrafo (post-SET8):**
> ```
> Guard Output Vacio? out#0 ──► Formatear Mensajes (Code) ──► Limpiar Puntuacion ──► Split Out ──► Expand Property Images ──► ...
> Guard Output Vacio? out#1 ──► Silent Handoff Apagar Bot  (sin cambios)
> ```

### 3.6 Verificación de refs huérfanas (regla del proyecto — principios-desarrollo §rename)

El arquitecto ya corrió el recorrido recursivo sobre el JSON: **0 expresiones** en `parameters` de otros nodos referencian `$('Formateador de Mensajes')`, `$('Structured Output Parser1')`, `$('OpenAI Chat Model - Formateador')`, `$node["..."]`, ni `$items("...")`. (Grep recursivo: sin matches.) El downstream consume los items por el flujo `main`, no por cross-reference de nodo. **Aun así el builder DEBE re-correr este check post-build** (los nombres viejos deben aparecer 0 veces en cualquier expresión `$('...')`/`$node[...]`/`$items(...)` del workflow resultante) y el reviewer lo verifica como check explícito.

## 4. Algoritmo de split (EXACTO — pseudocódigo para el builder)

> **Regla de oro:** el Code node **solo divide**, NUNCA modifica el contenido del texto (eso lo hace `Limpiar Puntuacion` downstream). No reescribe puntuación, no traduce, no resume. Determinista puro.

### 4.1 Pseudocódigo

```
mode: runOnceForAllItems
para cada item de $input.all():
  j = item.json || {}
  raw = leer el texto del agente:
        candidato1 = j.output
        si typeof candidato1 === 'string'  -> texto = candidato1
        si candidato1 es objeto y tiene .text/.output anidado -> usar ese (defensivo, ver §4.4)
        si no hay texto -> texto = ''
  texto = String(texto)   // nunca null/undefined

  // --- SPLIT DETERMINISTA ---
  bubbles = splitEnBurbujas(texto)   // ver función abajo
  si bubbles.length === 0 -> bubbles = ['']  // SIEMPRE al menos MENSAJE 1 (defensivo; el guard ya filtró vacíos, pero por seguridad)

  // --- NUMERAR ---
  outputObj = {}
  para i de 0..bubbles.length-1:
     outputObj['MENSAJE ' + (i+1)] = bubbles[i]

  push { json: { ...j, output: outputObj } }   // preservar el resto del item; pisar output con el objeto
return los items
```

### 4.2 Contrato de shape (byte-compatible con `Limpiar Puntuacion`)

**INPUT al Code** (lo que entrega `Guard Output Vacio?` out#0):
```json
{ "output": "<texto crudo del agente, string>", "...otros campos del item...": "..." }
```

**OUTPUT del Code** (lo que `Limpiar Puntuacion` espera leer en `$json.output`):
```json
{
  "output": { "MENSAJE 1": "<bubble1>", "MENSAJE 2": "<bubble2>", "...": "...", "MENSAJE N": "<bubbleN>" },
  "...otros campos preservados del item...": "..."
}
```

> **Por qué esto es byte-compatible:** `Limpiar Puntuacion` (id set6) hace `const rawOutput = j.output;` y luego: si `rawOutput` es objeto → itera `Object.keys(rawOutput)` y limpia cada valor → devuelve `output: cleaned` (objeto con las mismas claves). Después `Split Out` con `fieldToSplitOut: "output"` splittea ese objeto por claves → N items, cada uno con `output` = string. `Expand Property Images` lee `item.json.output` como string. **La cadena entera ya está diseñada para recibir el objeto `{ "MENSAJE N": str }` con N variable** — el Formateador-LLM producía exactamente eso (cuando no fallaba). El Code nuevo produce lo mismo, sin el LLM. **NO cambiar el shape: debe ser objeto `{ "MENSAJE 1":.., "MENSAJE N":.. }`, NO un array, NO `{ messages: [...] }`** (feedback-n8n-build #14: no inventar estructuras que rompen el downstream).

### 4.3 Función `splitEnBurbujas(texto)` — reglas exactas

```
CONSTANTES:
  MAX_CHARS_POR_BURBUJA = 350
  MAX_LINEAS_POR_BURBUJA = 4
  MAX_BURBUJAS = 6
  MIN_CHARS_MERGE = 35   // burbujas más cortas que esto se intentan fusionar con la adyacente del mismo bloque

PASO 1 — Normalizar saltos:
  t = texto.replace(/\r\n/g, '\n')   // CRLF -> LF
  t = t.trim()
  si t === '' -> return []

PASO 2 — Split por párrafos (doble salto de línea):
  parrafos = t.split(/\n\s*\n+/)            // uno o más renglones en blanco = separador de párrafo
              .map(p => p.trim())
              .filter(p => p.length > 0)
  si parrafos.length === 0 -> return [t]    // no había dobles saltos: tratar todo como un bloque

PASO 3 — Para cada párrafo, sub-split si es muy largo:
  bloques = []
  para cada p de parrafos:
     si p.length <= MAX_CHARS_POR_BURBUJA  Y  contarLineas(p) <= MAX_LINEAS_POR_BURBUJA:
        bloques.push(p)
     si no:
        bloques.push( ...subSplitLargo(p) )   // ver PASO 3b

PASO 3b — subSplitLargo(p):  (cuando un párrafo excede el cap)
  // 3b.1 intentar por oraciones (cierre . ! ? seguido de espacio o fin), SIN cortar a mitad de palabra
  oraciones = dividirEnOraciones(p)   // ver §4.5 (regex segura, NO new URL, NO lookbehind exótico)
  // acumular oraciones hasta acercarse a MAX_CHARS_POR_BURBUJA, luego cerrar burbuja
  chunks = []
  buffer = ''
  para cada o de oraciones:
     si (buffer + ' ' + o).trim().length <= MAX_CHARS_POR_BURBUJA:
        buffer = (buffer ? buffer + ' ' : '') + o
     si no:
        si buffer -> chunks.push(buffer)
        // si una sola oración ya excede el cap, cortar por palabras (hard wrap, sin partir palabras)
        si o.length > MAX_CHARS_POR_BURBUJA -> chunks.push( ...wrapPorPalabras(o, MAX_CHARS_POR_BURBUJA) )
        si no -> buffer = o
  si buffer -> chunks.push(buffer)
  return chunks

PASO 4 — Merge de burbujas muy cortas adyacentes:
  // evita mandar burbujas de 1 palabra. Fusiona una burbuja < MIN_CHARS_MERGE con la SIGUIENTE
  // (o con la anterior si es la última), SOLO si la fusión no excede MAX_CHARS_POR_BURBUJA.
  merged = mergeCortas(bloques, MIN_CHARS_MERGE, MAX_CHARS_POR_BURBUJA)

PASO 5 — Cap a MAX_BURBUJAS:
  si merged.length > MAX_BURBUJAS:
     // fusionar el sobrante en la última burbuja permitida (no descartar contenido)
     cabeza = merged.slice(0, MAX_BURBUJAS - 1)
     cola   = merged.slice(MAX_BURBUJAS - 1).join('\n')
     merged = [...cabeza, cola]

return merged
```

> **Notas de implementación obligatorias:**
> - `contarLineas(s)` = `s.split('\n').length`.
> - `wrapPorPalabras(s, max)`: acumular palabras separadas por espacio hasta `max`, sin partir ninguna palabra; si una sola palabra/URL excede `max`, dejarla sola en su burbuja (no romperla).
> - **NUNCA descartar contenido.** Si hay overflow de burbujas o de chars, se FUSIONA, nunca se trunca el texto del lead.

### 4.4 Lectura defensiva del texto del agente (input)

El item que llega del `Guard Output Vacio?` trae `$json.output` que SET7 garantiza presente. Pero por defensa-en-profundidad, leer así (orden de preferencia):
```
1. si typeof j.output === 'string'                          -> usar j.output
2. si j.output && typeof j.output === 'object' && j.output.text  -> usar j.output.text   (caso anidado raro)
3. si typeof j.text === 'string'                            -> usar j.text
4. else                                                     -> ''
```
> Esto cubre el caso (improbable, ya filtrado por el guard) de que `output` venga anidado. **No agregar más ramas que estas** — over-engineering. El guard de SET7 ya garantiza que el caso normal es `j.output` = string no vacío.

### 4.5 `dividirEnOraciones` — regex segura (gotcha N8N sandbox)

```
// NO usar lookbehind exótico ni new RegExp dinámico. Patrón simple y testeado:
function dividirEnOraciones(p) {
  // separa después de . ! ? (y variantes con cierre) seguidos de espacio
  const partes = p.split(/(?<=[\.\!\?])\s+/);   // lookbehind simple OK en el runtime n8n 1.121 (Node 20)
  return partes.map(s => s.trim()).filter(Boolean);
}
```
> **Si el lookbehind diera problemas en el runtime** (verificar en el build con un test rápido del Code node sobre un input de 2 oraciones): fallback sin lookbehind →
> ```
> const partes = p.replace(/([\.\!\?])\s+/g, '$1').split('');
> ```
> (usa un separador centinela `` que no aparece en texto natural). El builder elige el que funcione en el runtime real y lo deja documentado en un comment del Code node.

## 5. Variables de entorno requeridas

- **Ninguna.** El Code node no llama APIs externas, no usa credenciales, no usa env vars. (A diferencia del chainLlm que consumía la credencial `OpenAI - General` — esa credencial sigue usada por OTROS nodos del workflow, NO se desconfigura; solo se borra el nodo Chat Model del Formateador.)

## 6. Decisión de diseño: split-only vs fundir limpieza

**Opciones evaluadas:**

- **(A) minimal-risk — split-only Code nuevo + mantener `Limpiar Puntuacion`** (2 Code nodes en serie). El Code nuevo SOLO parte en burbujas; `Limpiar Puntuacion` (SET6, probado en prod) sigue limpiando cada `MENSAJE N`.
- **(B) fundir — un solo Code que parte Y limpia, y borrar también `Limpiar Puntuacion`** (1 nodo menos, más limpio).

**Decisión: (A) minimal-risk.** Fundamento:
1. `Limpiar Puntuacion` (SET6) es **lógica probada en producción** (regex de `¿`/`¡`/em-dash/punto final/etc. afinadas con el founder). Reescribirla dentro del Code nuevo reintroduce riesgo de regresión en reglas de puntuación que ya costaron una iteración (SET5→SET6, ver principios-desarrollo §"post-procesar antes del LLM regenerador").
2. El cambio de SET8 ya borra 3 nodos vivos y reescribe el camino crítico de salida del bot. Mantener `Limpiar Puntuacion` separado **reduce el blast radius**: si algo sale mal, se aísla si fue el split (Code nuevo) o la limpieza (nodo viejo intacto).
3. El costo de (A) es un nodo extra en serie — irrelevante en performance (ambos son Code determinista runOnceForAllItems).
4. Fundir es un refactor cosmético legítimo, pero pertenece a un set posterior, no a un fix de bug en prod (principios-desarrollo §"sobreingenierizar cuando el founder pide algo concreto").

> **Regla operativa:** el Code nuevo NO debe tocar puntuación. Si el builder se ve tentado a "ya que estoy, limpio acá", **parar** — esa es la lógica de `Limpiar Puntuacion`, no del splitter.

## 7. Schemas

### Input al Code (lo que entrega el guard out#0)
```json
{ "output": "<texto crudo del agente>", "type": "...", "...resto del item...": "..." }
```

### Output del Code (consumido por Limpiar Puntuacion)
```json
{ "output": { "MENSAJE 1": "<str>", "MENSAJE 2": "<str>", "...": "...", "MENSAJE N": "<str>" }, "...resto preservado...": "..." }
```

### Output final tras Split Out (por item, lo que ve Expand Property Images)
```json
{ "output": "<str de una burbuja>" }
```

## 8. Riesgos previstos (OBLIGATORIO)

1. **El shape de salida no es byte-compatible con `Limpiar Puntuacion` → Split Out** (ej. el Code devuelve un array, o `{ messages: [...] }`, o `output` como string en vez de objeto) — probabilidad MEDIA, impacto ALTO. Rompería todo el envío del bot. **Mitigación:** §4.2 fija el contrato exacto (objeto `{ "MENSAJE N": str }`). Smoke test obligatorio: pinear un input de prueba de 4 párrafos y verificar que la salida del Code es `{ output: { "MENSAJE 1":..,"MENSAJE 2":..,"MENSAJE 3":..,"MENSAJE 4":.. } }` y que `Limpiar Puntuacion` la consume sin warning `[Limpiar Puntuacion] estructura inesperada`. (feedback-n8n-build #14.)

2. **`Split Out` no splittea bien un objeto con N≠2 claves** — probabilidad BAJA. `Split Out` con `fieldToSplitOut: "output"` sobre un objeto splittea por claves independientemente del conteo (el Formateador-LLM ya producía N variable y funcionaba cuando no fallaba el parser). **Mitigación:** el reviewer verifica con N=1, N=4 y N=6 que `Split Out` emite N items con `output`=string cada uno. (Es el mismo nodo que ya funcionaba; el riesgo real estaba en el parser LLM, no en Split Out.)

3. **El Code produce burbujas vacías intermedias** (ej. `{ "MENSAJE 2": "" }`) que llegarían a `Send Chunk via YCloud` y mandarían un mensaje vacío al lead — probabilidad BAJA. **Mitigación doble:** (a) el algoritmo §4.3 filtra `p.length>0` y hace trim, no genera burbujas vacías salvo el caso defensivo de texto totalmente vacío (que el guard ya bloquea); (b) downstream el IF `Mensaje no vacio?` (id 48cc3a86) ya filtra `$json.output` vacío antes de YCloud. Defensa-en-profundidad existente. El reviewer confirma que ninguna burbuja vacía llega a YCloud.

4. **Sobre-fragmentación o sub-fragmentación** (manda 8 burbujas de 1 línea = spam, o 1 burbuja de 600 chars = muralla de texto) — probabilidad MEDIA, impacto UX. **Mitigación:** caps explícitos (`MAX_BURBUJAS=6`, `MAX_CHARS_POR_BURBUJA=350`, `MAX_LINEAS_POR_BURBUJA=4`) + merge de cortas (`MIN_CHARS_MERGE=35`). El founder debe revisar EMPÍRICAMENTE el resultado de un cierre largo real (T1 de §10) y ajustar las constantes si el feeling no es de "WhatsApp natural". **Las constantes son tuneables; documentarlas como tales en un comment del Code.**

5. **`set8` build script rompe nodos no relacionados** (borra 3 nodos vivos + reconfigura connections sobre 99 nodos) — probabilidad MEDIA, impacto ALTO. **Mitigación:** snapshot + tag git ANTES (§11). El build script debe: (a) borrar exactamente los 3 nodos por **id** (no por nombre, para evitar colisiones), (b) eliminar TODAS las entradas de `connections` cuya source sea uno de los 3 borrados, (c) eliminar la entrada `connections["Formateador de Mensajes"]`, (d) re-apuntar `connections["Guard Output Vacio?"].main[0]`. Smoke test: `nodes.length === 97`, no existe nodo con ninguno de los 3 ids borrados, no existe key `"Formateador de Mensajes"` ni `"Structured Output Parser1"` ni `"OpenAI Chat Model - Formateador"` en `connections`, existe `connections["Formatear Mensajes (Code)"].main[0][0].node === "Limpiar Puntuacion"`, y `connections["Guard Output Vacio?"].main[0][0].node === "Formatear Mensajes (Code)"`.

6. **Regex/JS no soportado en el sandbox de N8N 1.121** (lookbehind, etc.) — probabilidad MEDIA. **Mitigación:** §4.5 da un fallback sin lookbehind con centinela ``. El builder DEBE ejecutar el Code node sobre un input de prueba en el N8N real (o validar con n8n-mcp si está conectado) ANTES de declarar listo. NO usar `new URL()` ni `URLSearchParams` (no se necesitan acá; regla MEMORY feedback_n8n_code_node_no_url_constructor). Crypto no se usa.

7. **Pérdida de contenido por truncado** (si el cap de burbujas o de chars descarta texto en vez de fusionar) — probabilidad BAJA si se sigue §4.3, impacto ALTO (el lead recibe respuesta cortada). **Mitigación:** el algoritmo FUSIONA el sobrante (PASO 5), nunca descarta. El reviewer verifica con un input de 8 párrafos que la concatenación de las 6 burbujas resultantes contiene TODO el texto original (módulo whitespace).

8. **El Code node pierde campos del item necesarios downstream** (si hace `return [{ json: { output } }]` en vez de `{ ...j, output }`) — probabilidad MEDIA. Aunque `Limpiar Puntuacion` solo necesita `output`, preservar el resto del item evita romper cualquier campo que el downstream pudiera leer. **Mitigación:** §4.1 especifica `{ ...j, output: outputObj }`. (El Formateador-LLM reemplazaba el item por completo, así que preservar de más es estrictamente más seguro que el comportamiento actual.)

## 9. Casos edge a contemplar (OBLIGATORIO)

1. **Happy path — cierre largo del pitch (4-5 burbujas):** el agente devuelve un texto con 4-5 párrafos separados por dobles saltos (pitch + valor + CTA + pregunta). El Code los parte en N=4-5 burbujas → `{ "MENSAJE 1".."MENSAJE 5" }` → `Limpiar Puntuacion` limpia c/u → `Split Out` emite 5 items → se envían 5 bubbles separadas con la pausa de 2s entre cada una. **Resultado esperado: el lead recibe 5 mensajes de WhatsApp naturales, no una muralla ni el error de formato.**

2. **Saludo corto = 1 burbuja:** el agente devuelve "hola, claro te ayudo con eso" (sin dobles saltos, < 350 chars). PASO 2 no encuentra párrafos múltiples → `[t]` → `{ "MENSAJE 1": "hola, claro te ayudo con eso" }` → 1 bubble. **Resultado: 1 solo mensaje. NUNCA falla por "esperaba MENSAJE 2".**

3. **Texto largo SIN dobles saltos:** el agente devuelve un bloque de 500 chars en un solo párrafo (un solo `\n` o ninguno). PASO 2 → `[t]` (1 párrafo). PASO 3 detecta que excede `MAX_CHARS_POR_BURBUJA` → `subSplitLargo` parte por oraciones → 2-3 burbujas. **Resultado: el muro de texto se parte en 2-3 mensajes legibles, sin cortar palabras.**

4. **Input raro/vacío (defensivo, no debería llegar por el guard):** `output` = `""`, `null`, `"   "`, o `undefined`. La lectura §4.4 lo resuelve a `''`; `splitEnBurbujas('')` → `[]`; el algoritmo fuerza `['']` → `{ "MENSAJE 1": "" }`. Downstream el IF `Mensaje no vacio?` filtra el `output` vacío → NO se envía nada al lead. **Resultado: no crash, no mensaje vacío al lead.** (El guard de SET7 ya rutea estos a handoff antes de llegar acá, así que este camino es solo red de seguridad.)

5. **Texto con bullets/listas pegadas:** ej. "Tenemos: • A • B • C". El Code NO tiene lógica especial de bullets (a diferencia del prompt viejo del LLM). Si vienen pegados en una línea, quedan en una burbuja. **Decisión:** NO replicar la separación de bullets del LLM en SET8 (era una heurística del prompt que rara vez aplica en este bot, que no manda listas largas). Si el founder ve bullets pegados feos en prod, se agrega una regla determinista de split por `•` en un set posterior. Documentado como limitación conocida, no bug.

6. **Lead manda audio/imagen/link:** sin cambio. El audio se transcribe y entra como texto al Router→Agente; el output del agente llega al Code igual que un texto normal. El Code opera sobre el output del agente, agnóstico al canal de entrada.

7. **Output del agente con un solo `\n` (salto simple) entre frases cortas del mismo tema:** PASO 2 (split por `\n\s*\n+`) NO separa por salto simple → queda 1 párrafo; si está bajo el cap, 1 burbuja. **Resultado: frases del mismo tema separadas por salto simple se mantienen juntas** (comportamiento deseado, evita sobre-fragmentar). Solo el doble salto separa burbujas.

## 10. Triggers de handoff

**Sin cambios.** SET8 NO toca ningún trigger de handoff. La rama `Guard Output Vacio?` out#1 → `Silent Handoff Apagar Bot` (SET7) queda intacta. El Code nuevo vive 100% en el camino out#0 (contenido normal). El handoff por output vacío del agente sigue funcionando exactamente igual.

## 11. Snapshot + tag git (OBLIGATORIO antes del build)

Política `n8n-workflow-versioning` + principios-desarrollo §inviolable #2. (Comandos verificados: `n8n-pull.mjs`/`n8n-push.mjs` existen en `crm-v2/scripts/`.)

```bash
# 1. Snapshot del LIVE actual (red de seguridad, inmutable)
node crm-v2/scripts/n8n-pull.mjs Jsh4krhC9HRUh7Ly
#   → guardar como crm-v2/n8n/workflows/snapshots/bot-c-v1-PRE-SET8-2026-06-06.json
#   (convención observada: bot-c-v1-PRE-<SET>-<fecha>.json)

# 2. Commit del snapshot ANTES de tocar nada (en branch fix/bot-c-formateador-code o la actual — NO main)
git add crm-v2/n8n/workflows/snapshots/bot-c-v1-PRE-SET8-2026-06-06.json
git commit -m "chore(n8n): snapshot bot-c v1 PRE-SET8 (formateador determinista)"

# 3. Tag de rollback
git tag -a "bot-c-PRE-SET8-2026-06-06" -m "Punto seguro antes de reemplazar Formateador-LLM por Code node determinista"
```

**Rollback (si algo se rompe post-deploy):**
```bash
git checkout bot-c-PRE-SET8-2026-06-06 -- crm-v2/n8n/workflows/snapshots/bot-c-v1-PRE-SET8-2026-06-06.json
node crm-v2/scripts/n8n-push.mjs Jsh4krhC9HRUh7Ly crm-v2/n8n/workflows/snapshots/bot-c-v1-PRE-SET8-2026-06-06.json
# Verificar post-rollback: el bot vuelve a tener el Formateador-LLM (99 nodos). Smoke test T1.
```

> **Rollback en <60s:** el push del snapshot restaura el workflow completo (incluido el Formateador-LLM). El único costo de rollback es que vuelve el bug original (parser rígido) — aceptable como estado seguro temporal mientras se debuggea.

## 12. Tests manuales / smoke tests post-deploy

> Identificar la conversación de prueba por `conversation_id` y `lead_id` antes de empezar (founder usa WhatsApp +50688217229 contra businessPhone +50689839490, visto en pinData L3886-3908). El bot escribe a la tabla `messages` (outbound rows por cada bubble).

**Smoke tests del build script (antes del PUT):**
- `nodes.length === 97`.
- No existe nodo con id `c1186d30-893e-4c05-8e21-8f741be9d2af`, `886456af-f7d8-4c4e-a148-2203742ceab5`, ni `f3b4c11d-98ba-4992-95fa-27bab9160685`.
- Existe nodo `Formatear Mensajes (Code)` con `type === "n8n-nodes-base.code"`, `typeVersion === 2`.
- `connections["Guard Output Vacio?"].main[0][0].node === "Formatear Mensajes (Code)"`.
- `connections["Formatear Mensajes (Code)"].main[0][0].node === "Limpiar Puntuacion"`.
- No existen keys `"Formateador de Mensajes"`, `"Structured Output Parser1"`, `"OpenAI Chat Model - Formateador"` en `connections`.
- `connections["Guard Output Vacio?"].main[1]` sigue apuntando a `"Silent Handoff Apagar Bot"` (rama SET7 intacta).
- 0 refs huérfanas: ninguna expresión `$('Formateador de Mensajes')` / `$('Structured Output Parser1')` / `$('OpenAI Chat Model - Formateador')` (ni variantes `$node[...]`/`$items(...)`) en ningún `parameters` del workflow.
- Test unitario del `jsCode` (correr el Code node aislado con inputs sintéticos): input de 4 párrafos → 4 MENSAJE; input "hola" → 1 MENSAJE; input de 500 chars sin dobles saltos → 2-3 MENSAJE; input "" → 1 MENSAJE vacío.

**Tests del founder/reviewer post-deploy (en N8N + WhatsApp + DB):**
- **T1 (cierre largo — caso del bug):** provocar un turno donde el agente cierra el pitch (4-5 burbujas). Verificar: el lead recibe N mensajes de WhatsApp bien partidos (no el error `Model output doesn't fit required format`, no una muralla). Query: `SELECT direction, body, created_at FROM messages WHERE conversation_id=<x> ORDER BY created_at DESC LIMIT 6` → últimos N rows outbound son las N burbujas, cada una con su texto, ninguna vacía, ninguna con format-instructions.
- **T2 (saludo corto):** lead manda "hola" → bot responde 1 burbuja. Query: el último outbound es 1 row con el saludo. NO debe haber error de formato.
- **T3 (texto largo sin dobles saltos):** forzar (vía eval-harness o pin) un output del agente de ~500 chars en un párrafo. Verificar: se parte en 2-3 burbujas legibles, sin palabras cortadas, sin pérdida de texto (concatenar los bodies = el texto original módulo whitespace).
- **T4 (regresión flujo normal):** conversación de 3-4 turnos de discovery. Verificar que cada respuesta del bot se formatea bien en cada turno (el Code no interfiere con respuestas normales).
- **T5 (handoff intacto — regresión SET7):** disparar un output vacío del agente (caso handoff). Verificar: el guard out#1 → Silent Handoff sigue funcionando (`conversations.handler='human'`), el lead NO recibe nada. **Confirma que SET8 no rompió la rama de handoff.**
- **T6 (no mensajes vacíos):** en ningún test debe llegar un mensaje vacío al lead. Query: `SELECT body FROM messages WHERE conversation_id=<x> AND direction='outbound' AND (body IS NULL OR trim(body)='')` → 0 rows.

## 13. Cambios fuera del workflow

- **Ninguna migración SQL.** El cambio es 100% topología/lógica del workflow.
- **Ninguna edge function nueva.**
- **Ningún cambio en `bot_config`** ni en prompts de agentes (el Code no es un prompt; es JS determinista hardcoded en el nodo).
- **Ningún prompt fuente .md a sincronizar** (el Formateador-LLM tenía su prompt inline en el JSON, no en un .md; al borrarlo no queda fuente que mantener).

## 14. Checklist de feedback-n8n-build.md aplicable

- **#6 (persistencia en paralelo vs serie):** el Code nuevo va EN SERIE (`Guard → Code → Limpiar Puntuacion → Split Out`) porque su output SÍ se consume downstream (es el shape que alimenta la limpieza y el split). Es el patrón correcto: nodos cuyo output se usa van en serie. NO es un nodo side-effect. ✅ aplica — confirmar que no se conecta en paralelo por error.
- **#8 (usar `.first()` no `.item`):** el Code usa `$input.all()` y itera (runOnceForAllItems), correcto post-Agent/post-IF. NO usa `$('Nodo').item`. Si necesitara leer otro nodo, usar `.first()`. ✅ crítico.
- **Code node return shape:** `return [{ json: {...} }, ...]` (array de items con `.json`). §4.1 lo especifica. NO devolver objeto pelado ni string. ✅ crítico.
- **#11 (nombres representativos):** `Formatear Mensajes (Code)` es descriptivo. ✅.
- **#12 (sticky notes):** extender/agregar la sticky de la zona FORMATEADOR documentando "SET8: Formateador ahora es Code determinista, 0 LLM — no puede fallar por formato ni filtrar internos. Solo divide; la limpieza la hace Limpiar Puntuacion downstream". ✅.
- **#14 (el formateador no se improvisa / no inventar estructuras):** el shape de salida es el OBJETO `{ "MENSAJE N": str }` byte-compatible, NO un array ni `{messages:[]}`. §4.2. ✅ crítico.
- **Regla de oro (validar antes de entregar):** correr el Code aislado con inputs sintéticos + verificar output real de `Limpiar Puntuacion`/`Split Out` con N=1/4/6, no asumir. ✅ §12.
- **Atacar causa raíz, no parchar:** SET8 elimina el LLM del formateo (la fuente de la fragilidad), no lo parchea con más reintentos ni un parser más laxo. ✅.
- **MEMORY feedback_n8n_code_node_no_url_constructor:** NO usar `new URL()`/`URLSearchParams` en el Code (no se necesitan). String/regex puros. ✅.

## 15. Handoff al builder

- **Workflow:** in-place sobre `crm-v2/n8n/workflows/chatbot-momentum-bot-c-v1.json` (convención del proyecto: set scripts secuenciales, NO `vN.json`).
- **Script de build esperado:** `crm-v2/scripts/build-bot-c-v1-set8-formateador-code.js` (clonar estructura de `build-bot-c-v1-set7-fix-handoff-leak.js`).
- **Output de review esperado:** `memory/n8n-changes/2026-06-06-bot-c-v1-set8-formateador-code-review.md` (PASS/FAIL del `n8n-reviewer`).
- **Notas no-obvias al builder:**
  1. **Clonar `type`/`typeVersion` del Code node de un Code EXISTENTE** (`Limpiar Puntuacion` id set6, typeVersion 2). NO inventar typeVersion. (principios-desarrollo §"armar nodos N8N desde memoria".)
  2. **El shape de salida es un OBJETO `{ "MENSAJE 1":.., "MENSAJE N":.. }`, NO array, NO `{messages:[]}`.** Es el contrato exacto que `Limpiar Puntuacion` + `Split Out` ya consumen. Romperlo rompe el envío entero. (§4.2, feedback #14.)
  3. **El Code SOLO divide. NO limpiar puntuación adentro** — eso lo hace `Limpiar Puntuacion` downstream (que se mantiene). Decisión §6.
  4. **Borrar los 3 nodos por id**, no por nombre. Eliminar también sus entradas en `connections` (como source) y la key `"Formateador de Mensajes"`. NO borrar el trío huérfano preexistente (Auto-fixing / Structured Output Parser / OpenAI Chat Model - Parser) en este set (§3.3).
  5. **Probar el `jsCode` en el runtime real** (o n8n-mcp) con los 4 inputs sintéticos antes de declarar listo — sobre todo el lookbehind del split por oraciones (§4.5 da fallback sin lookbehind).
  6. **Preservar el resto del item** con `{ ...j, output: outputObj }` (§4.1, riesgo #8).
  7. Las constantes del split (`MAX_CHARS=350`, `MAX_BURBUJAS=6`, etc.) son **tuneables**; dejarlas en consts arriba del Code con comment para que el founder las ajuste tras ver el resultado real (riesgo #4).
  8. Smoke test del build: `nodes.length === 97`, conexiones re-apuntadas exactas (§12), 0 refs huérfanas.
