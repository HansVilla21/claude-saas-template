# Spec: Sofia v5 — Envío de imágenes de propiedad por WhatsApp

**Fecha:** 2026-05-21
**Autor:** n8n-architect
**Workflow afectado:** `n8n/workflows/chatbot-inmobiliaria-demo-ycloud-sofia-v4.json` → `chatbot-inmobiliaria-demo-ycloud-sofia-v5.json`
**Versión actual → propuesta:** v4 (SPSP-Aware) → v5 (SPSP-Aware + Images)
**Trigger del cambio:** Feature solicitada por el founder — Sofia debe poder enviar fotos reales de las propiedades cuando las presenta. Hoy el lead solo recibe texto y se imagina la propiedad (anti-pattern en sales inmobiliario LATAM).

---

## 1. Problema / requerimiento

El v4 conversa muy bien pero solo emite texto. Cuando presenta una propiedad (`CR-2071, 2 dorm, $850/mes, Sabana Sur, viene amueblada…`), el lead tiene que imaginar la propiedad o pedir fotos manualmente. En sales inmobiliario el hook visual es central — sin imagen, el lead no engancha, pide menos visitas, y Hans pierde conversiones contra agentes con catálogo visual integrado.

La research técnica (`memory/research/08-whatsapp-images-tech-research.md`) ya cerró las incógnitas: YCloud `/v2/whatsapp/messages` soporta `type:"image"` con `image.link` (URL pública HTTPS, JPG/PNG, max 5 MB, **1 imagen por POST**). N imágenes = N POSTs. Costo $0 extra dentro de service window 24h (modelo per-message Meta solo cobra templates).

8/16 propiedades en BD ya tienen 2-4 imágenes Unsplash públicas en `properties.images[]` JSONB (con `url` siempre presente). El edge function `properties-search` v1.4 solo expone `foto_url` (primera imagen). Hay que extenderlo para devolver `foto_urls: string[]` + `foto_count: number`, manteniendo `foto_url` (retrocompat con v4).

## 2. Estado actual relevante

Nodos afectados del v4 (verificados leyendo el JSON):

- **`Formateador de Mensajes`** (chainLlm) — convierte el output de Sofia en `{MENSAJE 1: "...", MENSAJE 2: "..."}` con Structured Output Parser. **Sin cambios funcionales.**
- **`Split Out`** (splitOut) — split por `fieldToSplitOut: "output"`, emite N items, cada uno con `{output: "<chunk de texto>"}`. **Sin cambios funcionales.** (Salida queda: N items con `output` string).
- **`Loop Over Items`** (splitInBatches v3) — itera 1 a 1. Output index 0 = "done" (vacío), index 1 = "next item". **Sin cambios estructurales.**
- **`Mensaje no vacio?`** (if v2.2) — verifica `$json.output notEmpty`. **Se reemplaza la condición** para soportar items `type:"image"` o `type:"text"`.
- **`Send Chunk via YCloud`** (httpRequest v4.2) — POST a YCloud con `type:"text"`. **Se reescribe el `jsonBody`** para ramificar por `$json.type`.
- **`Pausa entre Mensajes`** (wait 2s) — sin cambios.
- **`Supabase Properties Tool`** (toolHttpRequest) — `toolDescription` menciona `foto_url`. **Se actualiza la descripción** para mencionar `foto_urls`.
- **`Agente Principal - Sofia`** — system prompt v4. **Se reemplaza con v5** (delegado al `langchain-prompt-designer`).

Conexión actual relevante:

```
Formateador → Split Out → Loop Over Items
                              ├── (done, idx 0)
                              └── (next, idx 1) → Mensaje no vacio?
                                                       ├── (true) → Send Chunk via YCloud → Pausa → Loop
                                                       └── (false) → Pausa → Loop
```

Cambia a:

```
Formateador → Split Out → [NUEVO] Expand Property Images → Loop Over Items → ...
```

El Code node nuevo expande N chunks de texto en M items mixtos `{type:"text"|"image", ...}`.

## 3. Cambio propuesto

### 3.1 Nodos a crear

| Nombre | Type | typeVersion | Posición aprox. | Parámetros críticos |
|---|---|---|---|---|
| `Expand Property Images` | `n8n-nodes-base.code` | 2 | Entre `Split Out` y `Loop Over Items` (mismo Y que el Loop, X = Split Out.x + 220) | `mode: "runOnceForAllItems"`, JavaScript que detecta `[IMG:CR-XXXX]` en cada chunk, hace Postgres query directo a `properties.images` por código, expande a items `{type:"image", url, caption}` + `{type:"text", output}`. Cap a 3 imágenes por propiedad. Caption solo en la primera con título + precio. |

### 3.2 Nodos a modificar

| Nombre | Qué cambia | Por qué |
|---|---|---|
| `Agente Principal - Sofia` → `parameters.options.systemMessage` | Se reemplaza prompt v4 por v5 (con sección "USO DE IMÁGENES" + few-shot adicional) | Sofia tiene que aprender a escribir `[IMG:CR-XXXX]` cuando presenta una propiedad. |
| `Supabase Properties Tool` → `parameters.toolDescription` | Agregar mención de `foto_urls` (array) además de `foto_url` | El LLM no sabe que ahora puede confiar en que hay fotos cuando llama la tool. |
| `Mensaje no vacio?` → `parameters.conditions` | Cambiar la condición única `$json.output notEmpty` por OR: `($json.type === "text" AND $json.output notEmpty) OR ($json.type === "image" AND $json.url notEmpty)` | El IF tiene que aceptar items tipo image que no tienen `output`. |
| `Send Chunk via YCloud` → `parameters.jsonBody` | Reescribir con ternario `{{ $json.type === 'image' ? <image body> : <text body> }}` | Mismo nodo (mismo endpoint, mismo header auth) pero body distinto según tipo. |
| `Sticky - Agentes` → `parameters.content` | Actualizar a v5 mencionando capacidad de imágenes | Documentación viva del workflow. |
| `Sticky - Formateador` → `parameters.content` (si lo amerita) | Mención breve del nuevo Code node | Misma razón. |
| `workflow.name` | `Chatbot Inmobiliaria Demo - YCloud (Sofia v5 — Images)` | Naming. |
| `workflow.versionId` | `v5-images-2026-05-21` | Naming. |
| `workflow.active` | Forzado `false` | Regla del builder. |

### 3.3 Nodos a borrar

Ninguno. La estrategia es retrocompat máxima.

### 3.4 Conexiones a crear

- `Split Out` → `Expand Property Images` (main, idx 0)
- `Expand Property Images` → `Loop Over Items` (main, idx 0)

### 3.5 Conexiones a borrar

- `Split Out` → `Loop Over Items` (la conexión directa se rompe; pasa por el nuevo Code node)

## 4. Schemas

### Output del nodo `Expand Property Images` (lo que recibe el Loop)

Array mixto de items. Cada item tiene **exactamente uno** de estos shapes:

```jsonc
// Item tipo texto (igual que hoy v4)
{
  "type": "text",
  "output": "<chunk de texto del Formateador, sin el marker [IMG:...]>"
}

// Item tipo imagen (nuevo)
{
  "type": "image",
  "url": "https://images.unsplash.com/photo-...",
  "caption": "CR-2071 — Casa moderna en Sabana, $185K"  // o "" si no es la primera
}
```

**Orden dentro del expand:** para cada chunk de texto con marker `[IMG:CR-XXXX]`:
1. Primero los items de imagen (max 3, sorted por `images[].order` que ya provee la BD).
2. Después el item de texto sin el marker.

Razón: imágenes ANTES del texto (hook visual, anti-pattern es spam de texto sin contexto visual). Validado contra UX inmobiliario LATAM (research 08, sección 6, riesgo #6).

### Output esperado del edge function `properties-search` v1.5

Agrega 2 campos por propiedad. El resto del shape se mantiene:

```jsonc
{
  "codigo": "CR-2071",
  // ... (resto igual a v1.4) ...
  "foto_url": "https://images.unsplash.com/...",   // mantener (primera imagen) — retrocompat
  "foto_urls": [                                    // NUEVO — array completo
    "https://images.unsplash.com/photo-...",
    "https://images.unsplash.com/photo-...",
    "https://images.unsplash.com/photo-..."
  ],
  "foto_count": 3                                   // NUEVO — len de foto_urls
}
```

**Reglas del edge function:**
- Solo URLs que son `string` y no vacíos (filtro defensivo del shape mixto del JSONB).
- Cap a 5 URLs por propiedad (suficiente, Sofia solo manda 3).
- Sin breaking change — consumers viejos del v4 leen `foto_url` y siguen funcionando.

## 5. Variables de entorno requeridas

Ninguna nueva. Reusamos:
- Postgres credential (ya existe — la usa `Buscar Lead (Supabase)`, `Get Conversation State`, `Conversation`, etc.). El Code node nuevo invoca el cliente `pg` vía `$helpers` o accede via Postgres query desde un Code node. **Decisión técnica:** hacer la query desde el Code node usando `this.helpers.request` o el helper de Postgres no es trivial — más limpio y robusto es invocar un nodo Postgres adicional dentro del flow. Sin embargo, eso obligaría a routear cada chunk por Postgres aunque no tenga marker, lo cual es overhead inútil.

**Decisión final del architect:** el Code node hace la query a Supabase REST (PostgREST) directo via `fetch`, autenticando con la misma `SUPABASE_SERVICE_ROLE_KEY` que ya usa el edge function. Esto evita acoplar al nodo Postgres y mantiene el Code node autocontenido.

Para eso necesitamos exponer 2 env vars / secrets en el Code node:
- `SUPABASE_URL` — ya está accesible vía `$env.SUPABASE_URL` si N8N lo tiene, o lo cableamos hardcodeado a `https://ugkunpsohrimxetofawv.supabase.co` (founder lo OK porque es el único proyecto Supabase del founder en este workflow).
- `SUPABASE_SERVICE_ROLE_KEY` — el secret que ya se usa en otros workflows. Si N8N no tiene `$env.SUPABASE_SERVICE_ROLE_KEY`, el founder lo agrega.

**Alternativa más segura (recomendada):** llamar a un endpoint pequeño y dedicado del edge function ya existente, ej. `properties-search` con filtro por `codigo`, que ya está autenticado vía `secret` query string. **Esto es lo que vamos a usar.** El Code node hace `fetch('https://ugkunpsohrimxetofawv.supabase.co/functions/v1/properties-search?secret=<SECRET>', {method:'POST', body: JSON.stringify({agency_id, codigo})})` y lee `foto_urls`.

Ese `secret` y `agency_id` ya están disponibles en el flow:
- `secret` — el query string del Properties Tool (`?secret=86eae3d40543b0c713d64fb554c010c16e8399e88fa7ccf5a7cef8dd42af1620`).
- `agency_id` — `$('Resolve Agency').first().json.agency_id` (ya se usa en el Properties Tool).

El Code node lee ambos del workflow context y no necesita env vars nuevas.

## 6. Riesgos previstos (mínimo 5)

1. **El LLM escribe marker mal formado** (`[IMG:CR-2071 ]` con espacios, `[IMG : CR-2071]`, `[IMG:cr-2071]` minúscula). **Probabilidad: media.** **Mitigación:** regex tolerante en el Code node — `\[IMG:\s*([A-Za-z]+-\d+)\s*\]` con `i` flag. Si el código no matchea la regex tolerante, se trata como texto literal (falla suave, no crash).

2. **Propiedad sin fotos en BD** (raro hoy — 0/16, pero posible cuando lleguen propiedades de agencias). **Probabilidad: baja hoy, media a futuro.** **Mitigación:** si `foto_urls.length === 0` después del fetch, el marker se borra silenciosamente del texto y se manda solo el texto. NO se aborta el envío.

3. **URL 404 o lenta cuando Meta intenta descargarla.** **Probabilidad: media (Unsplash es estable pero ocasionalmente fallan; Supabase Storage futuro puede tener signed URL expirado).** **Mitigación:** El HTTP node `Send Chunk via YCloud` necesita `onError: continueRegularOutput` para que si una imagen falla el resto siga. Texto y otras imágenes no se abortan.

4. **Sofia escribe MÚLTIPLES markers en un mensaje** (`[IMG:CR-2071] ... [IMG:CR-2042] ...`). Si los expandimos todos, el lead recibe 6+ imágenes en un mensaje — abrumador. **Probabilidad: media (el LLM tiende a presentar 2-3 propiedades juntas).** **Mitigación:** Regla del Code node: **solo expandir el PRIMER marker por chunk**. Markers adicionales se eliminan silenciosamente del texto. Combinado con la regla en el prompt v5 ("máximo 1 marker `[IMG:...]` por mensaje").

5. **Edge function `properties-search` cae o tarda mucho** (timeout). **Probabilidad: baja.** **Mitigación:** Code node con `try/catch` + timeout interno de 5s. Si falla, marker se borra del texto, se manda solo texto, se loguea via `console.error`. NO se crashea el flow.

6. **Sofia escribe marker pero la tool de Properties no devolvió esa propiedad** (alucinación de código). **Probabilidad: baja-media (LLMs ocasionalmente inventan códigos plausibles).** **Mitigación:** el fetch a Properties devuelve `total: 0` → `foto_urls = []` → marker se borra silenciosamente. Falla suave.

7. **Rate limit Meta** (60 rps por sender). Con 3 imágenes + 1 texto por propiedad + Pausa 2s → 4 mensajes × 2s = 8s. Lejos del límite. **Probabilidad: nula.** No mitigación adicional.

8. **El edge function v1.5 rompe a callers viejos del v4** (si el founder aún no migra). **Probabilidad: alta sin mitigación, nula con.** **Mitigación:** v1.5 mantiene `foto_url` (primera URL). Cualquier consumer que lea ese campo sigue funcionando idéntico al v1.4.

## 7. Casos edge a contemplar (mínimo 5)

1. **Happy path — 1 propiedad con 3 imágenes**
   Sofia responde: `"Mirá esta que te calza: [IMG:CR-2071] Casa moderna en Sabana, 3 dorm, $185K. Tiene piscina compartida..."`. Formateador devuelve 1-2 chunks. Code node detecta `[IMG:CR-2071]` en chunk 1, fetcha → recibe 3 URLs. Emite 3 items image + 1 item text limpio + chunks restantes como text. El Loop manda 4 mensajes (3 fotos con la primera con caption del título+precio, luego el texto). Tiempo total con Pausa 2s: ~8s. **Esperado: el lead ve 3 fotos seguidas del título de la propiedad + descripción.**

2. **Edge: propiedad SIN fotos en BD**
   `foto_urls = []` después del fetch. Code node:
   - Borra el marker `[IMG:CR-XXXX]` del texto del chunk.
   - Emite solo items `{type:"text", output: <texto sin marker>}` para todos los chunks.
   **Esperado: el lead ve solo el texto, sin error. No se nota la ausencia de imágenes.**

3. **Edge: marker mal escrito por el LLM**
   Sofia escribe `[IMG: CR-2071 ]` (espacios), `[img:CR-2071]` (lowercase), `[IMG:CR-2071]` y `[IMG:CR2071]` (sin guión). El Code node usa regex `\[IMG:\s*([A-Za-z]+-?\d+)\s*\]` con `i` flag, capturando el código con normalización:
   - Match → fetch.
   - No match → trata el bracket como texto literal (NO lo borra, lo deja como mensaje). El lead vería `[IMG:CR2071]` literal — síntoma visible pero NO crash. Mejor falla visible que crash silencioso.
   **Esperado: tolerancia hasta cierto punto, falla visible cuando muy mal escrito.**

4. **Edge: URL muerto (404 desde Meta)**
   Code node emite el item image correctamente. Send Chunk POST a YCloud responde 200 o 4xx. Si 4xx con `onError: continueRegularOutput`, el flow continúa con el siguiente item (otra imagen u el texto). El lead ve 2 fotos + texto en vez de 3 fotos + texto.
   **Esperado: degradación elegante. Sin abort.**

5. **Edge: Sofia presenta 2 propiedades en un mensaje**
   Sofia escribe: `"Te tengo 2 que te calzan: [IMG:CR-2071] Casa en Sabana, $185K. [IMG:CR-2042] Apto en Escazú, $210K."`
   Decisión del architect (regla dura): **solo expandir el PRIMER marker.** El segundo `[IMG:CR-2042]` se borra silenciosamente del texto. El lead recibe imágenes de la primera propiedad + texto que menciona ambas pero solo con foto de la primera. Combinado con regla del prompt v5 "máximo 1 marker por mensaje" → en práctica raro.
   **Esperado: max 1 propiedad con imágenes por mensaje. La segunda se menciona en texto solo.**

6. **Edge: tool Properties down (timeout)**
   Code node fetch falla con timeout 5s. Catch → loguea warning, borra marker del texto, emite items text. Lead recibe texto sin imágenes.
   **Esperado: degradación elegante.**

7. **Edge: lead pide "más fotos" después**
   No es scope del v5 — Sofia simplemente vuelve a llamar `Supabase Properties Tool` y vuelve a poner `[IMG:CR-XXXX]` con la misma lógica. Como las primeras 3 fotos ya las vio, se sentirá repetitivo. **Mitigación documentada pero NO implementada en v5** (sería v5.1 con tracking de fotos enviadas por conversación). El prompt v5 evita el escenario instruyendo "máximo 1 marker `[IMG:...]` por mensaje, NO repetir markers de propiedades ya presentadas en turnos anteriores".

## 8. Triggers de handoff (si el cambio los toca)

No se tocan. Los 6 triggers AND del v4 (Condition A-F) quedan idénticos. La capacidad de imágenes es ortogonal al handoff.

## 9. Cambios fuera del workflow

1. **Edge function `properties-search` v1.4 → v1.5** — agregar `foto_urls: string[]` + `foto_count: number` al output. Mantener `foto_url`. **Implementación detallada:** sección 4.2 de research 08. **Deploy:** el founder debe re-deploar vía `mcp__supabase__deploy_edge_function`. Listo para implementar por el pipeline.

2. **NO migration SQL** — el schema `properties.images` JSONB ya soporta multi-imagen.

3. **NO env vars nuevas** — el Code node usa el secret + agency_id ya disponibles en el flow.

## 10. Tests manuales que el reviewer debe correr (walkthroughs)

### Escenario 1 — Happy path con imágenes
Mensaje: `"hola, qué tenés en Sabana hasta $200K"`. Esperado: Sofia llama Properties Tool, recibe lista con `foto_urls`, presenta 1 propiedad con `[IMG:CR-XXXX]`. Lead recibe 3 fotos seguidas del título+precio en caption, luego texto descriptivo, luego pregunta de cierre.

### Escenario 2 — 0 imágenes (mock prop sin fotos)
Crear mentalmente una prop con `images: []`. Sofia llama tool, recibe `foto_urls: []`. Esperado: Sofia NO debería poner `[IMG:...]` porque la tool dice que no hay fotos (instrucción del prompt). Si igual lo pone (LLM-imperfect), el Code node lo borra del texto. Lead ve solo texto.

### Escenario 3 — Marker mal escrito
Mock: Sofia escribe `[IMG: cr-2071 ]`. Esperado: Code node con regex `i`+espacios captura el código y fetcha igual. Lead ve fotos normalmente.

### Escenario 4 — URL muerto
Mock: una de las 3 URLs devuelve 404 desde Meta. Esperado: HTTP node con `onError: continueRegularOutput` salta esa imagen, sigue con las otras + texto. Lead ve 2 fotos + texto.

### Escenario 5 — 2 propiedades, 2 markers
Mock: Sofia escribe `"[IMG:CR-2071] ... [IMG:CR-2042] ..."`. Esperado: solo el primer marker se expande. El segundo se borra del texto. Lead ve fotos de la primera prop + texto que menciona ambas.

### Escenario 6 — Retrocompat v4
Importar workflow v4 con edge function v1.5 deployada. Esperado: el v4 sigue funcionando idéntico (lee solo `foto_url`, ignora `foto_urls`).

## 11. Handoff al builder

- **Archivo de output esperado:** `n8n/workflows/chatbot-inmobiliaria-demo-ycloud-sofia-v5.json`
- **Script de build esperado:** `scripts/build-workflow-v5.js` (clonar pattern de `build-workflow-v4.js`)
- **Prompt v5:** `memory/research/09-sofia-v5-prompt-images.md` (lo escribe `langchain-prompt-designer` antes del builder)

### Notas críticas al builder

1. **El nuevo Code node es el cambio estructural más complejo del workflow desde v3.** Hay que tener cuidado con:
   - Posición del nodo en el canvas (sugerencia: copiar `position` de `Loop Over Items` y restar 220 a x).
   - Conexión nueva: `Split Out → Expand Property Images → Loop Over Items`.
   - **Borrar la conexión** `Split Out → Loop Over Items` (sino quedaría duplicado el routing).

2. **El Code node debe ser `runOnceForAllItems`** (no `runOnceForEachItem`). Recibe el array completo de chunks del Split Out y devuelve un array nuevo (mixto image+text). Razón: necesita poder reorganizar el orden (imágenes ANTES del texto del mismo chunk).

3. **JavaScript del Code node:** ver pseudocódigo abajo en sección 12. El builder lo adapta a sintaxis n8n (`items` input, `return items` output, uso de `$helpers.httpRequest`).

4. **Modificación de `Mensaje no vacio?`:** cambiar la condición. Sintaxis n8n:
   ```js
   leftValue: "={{ ($json.type === 'text' && $json.output) || ($json.type === 'image' && $json.url) ? 'ok' : '' }}"
   rightValue: ""
   operator: { type: "string", operation: "notEmpty", singleValue: true }
   ```

5. **Modificación de `Send Chunk via YCloud` → `jsonBody`:**
   ```
   ={{ $json.type === 'image'
     ? JSON.stringify({
         from: $('Extract Variables').first().json.businessPhone,
         to: $('Extract Variables').first().json.userPhone,
         type: 'image',
         image: { link: $json.url, caption: ($json.caption || '').slice(0, 1000) }
       })
     : JSON.stringify({
         from: $('Extract Variables').first().json.businessPhone,
         to: $('Extract Variables').first().json.userPhone,
         type: 'text',
         text: { body: $json.output }
       })
   }}
   ```

6. **Agregar `onError: continueRegularOutput` al `Send Chunk via YCloud`** (en `parameters.options` o en el campo top-level del nodo, según typeVersion). Esto es nuevo del v5 — si una imagen falla con 4xx, no aborta toda la cadena.

7. **Idempotencia:** el script de build, si corre 2 veces, NO debe duplicar el Code node ni romper conexiones. Pattern: `removeNodeByName('Expand Property Images')` antes de crearlo. Misma idea con la conexión `Split Out → Expand Property Images` (clear + add).

8. **Actualizar `toolDescription` del Properties Tool:** reemplazar `foto_url` por `foto_url, foto_urls (array completo de URLs), foto_count`.

## 12. Pseudocódigo del Code node `Expand Property Images`

```javascript
// runOnceForAllItems mode
// Input: items[] donde cada item.json es { output: "<chunk de texto>" }
// Output: items[] donde cada item.json es {type:"text", output:"..."} o {type:"image", url:"...", caption:"..."}

const IMG_RE = /\[IMG:\s*([A-Za-z]+-?\d+)\s*\]/i;  // tolerante a espacios + case
const MAX_IMAGES_PER_PROPERTY = 3;
const FETCH_TIMEOUT_MS = 5000;

const agencyId = $('Resolve Agency').first().json.agency_id;
const SUPABASE_URL = 'https://ugkunpsohrimxetofawv.supabase.co';
const SEARCH_SECRET = '86eae3d40543b0c713d64fb554c010c16e8399e88fa7ccf5a7cef8dd42af1620';

const inputItems = items;  // array de {json: {output: "..."}}
const out = [];

// Estado: rastreamos si ya expandimos UN marker (regla "1 propiedad con imágenes por mensaje")
let alreadyExpandedOne = false;

for (const item of inputItems) {
  const text = (item.json.output || '').toString();
  const match = text.match(IMG_RE);

  if (!match || alreadyExpandedOne) {
    // Sin marker, o ya expandimos uno antes → solo limpiar markers extra y emitir como text
    const cleanText = text.replace(/\[IMG:\s*[A-Za-z]+-?\d+\s*\]/gi, '').replace(/\s+/g, ' ').trim();
    if (cleanText) out.push({json: {type: 'text', output: cleanText}});
    continue;
  }

  const codigo = match[1].toUpperCase();
  // Normalizar "CR2071" → "CR-2071" si vino sin guión
  const normalizedCodigo = codigo.includes('-') ? codigo : codigo.replace(/^([A-Z]+)(\d+)$/, '$1-$2');

  // Fetch foto_urls desde Properties edge function
  let fotoUrls = [];
  let titulo = '';
  let precio = '';
  try {
    const resp = await this.helpers.httpRequest({
      method: 'POST',
      url: `${SUPABASE_URL}/functions/v1/properties-search?secret=${SEARCH_SECRET}`,
      body: { agency_id: agencyId, codigo: normalizedCodigo, limit: 1 },
      json: true,
      timeout: FETCH_TIMEOUT_MS,
    });
    const prop = (resp.propiedades || [])[0];
    if (prop && Array.isArray(prop.foto_urls)) {
      fotoUrls = prop.foto_urls.filter(u => typeof u === 'string' && u.length > 0).slice(0, MAX_IMAGES_PER_PROPERTY);
      titulo = prop.titulo || '';
      precio = prop.precio || '';
    }
  } catch (e) {
    console.error(`[Expand Images] Failed to fetch ${normalizedCodigo}:`, e.message);
    // fotoUrls queda []
  }

  // Limpiar el marker del texto (siempre, sea que tenga fotos o no)
  const cleanText = text.replace(IMG_RE, '').replace(/\[IMG:\s*[A-Za-z]+-?\d+\s*\]/gi, '').replace(/\s+/g, ' ').trim();

  if (fotoUrls.length > 0) {
    // Emitir items image (la primera con caption, resto sin)
    const caption = `${normalizedCodigo} — ${titulo}${precio ? `, ${precio}` : ''}`.slice(0, 1000);
    fotoUrls.forEach((url, idx) => {
      out.push({json: {
        type: 'image',
        url,
        caption: idx === 0 ? caption : '',
      }});
    });
    alreadyExpandedOne = true;
  }

  // Luego el texto (siempre, incluso si no hubo fotos — solo si quedó algo después de limpiar)
  if (cleanText) {
    out.push({json: {type: 'text', output: cleanText}});
  }
}

return out;
```

**Notas para el builder al adaptar a n8n Code node:**
- Usar `mode: "runOnceForAllItems"`.
- En modo allItems el input es `items` (array) y se hace `return items` (no `return out`); pero la forma exacta del Code node n8n se confirma en el build. Pattern habitual: declarar `const out = [];` y `return out;` funciona porque cada elemento es `{json: {...}}`.
- `this.helpers.httpRequest` está disponible en Code nodes con typeVersion 2.
- `await` funciona en Code node v2.

---

**Confianza del architect:** alta. Todas las decisiones están ancladas a la research 08 y el patrón de v4 (Code node entre Split Out y Loop). El único riesgo arquitectónico real es el fetch del Code node — si N8N tiene restricciones de network outbound, hay que pasar a usar un nodo Postgres dedicado. Mitigación documentada en sección 5.

**Listo para `langchain-prompt-designer` (Fase 2) → `n8n-builder` (Fase 3) → `n8n-reviewer` (Fase 4).**
