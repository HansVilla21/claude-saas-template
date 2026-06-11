# Skill: Bot LLM Marker → Expand Pattern

## Cuándo usar esta skill

- Estás diseñando un bot conversacional (WhatsApp, web chat, etc.) que necesita enviar contenido NO-textual: imágenes, property cards, audios, location pins, archivos.
- Querés que el LLM "decida" cuándo enviar media (no estructurar JSON complejo), pero el output downstream debe ser estructurado para que un Code node lo procese.
- Tu BSP/canal (YCloud, Twilio, etc.) requiere POSTs separados por cada media (no permite carrusel mixto en un solo mensaje).
- Estás pensando en pedirle al LLM que devuelva JSON estructurado y querés evitarlo porque (a) los LLM hallucinen schemas, (b) hace el prompt más rígido.

## Por qué existe esta skill

Los LLM agentes conversacionales son excelentes para generar texto natural pero malos para:
- Mantener consistencia de schema JSON en outputs largos
- Tomar decisiones de envío de media sin sobrepensarlo

La solución que funcionó en Casa CRM:
1. El LLM emite TEXTO normal con un **marker inline** estandarizado: `[IMG:CR-2031]`, `[LOC:lat,lng]`, `[CARD:property-uuid]`.
2. Un **Code node downstream** parsea el output, detecta markers, expande cada marker en una llamada externa (fetch a DB / properties-search / etc.) y emite items tipados para enviar.
3. El **canal (YCloud/Twilio)** recibe items uno por uno y los envía como mensajes separados.

Beneficios:
- El LLM solo decide CUÁNDO mandar media (un token corto en su texto), no QUÉ datos exactos. La DB es source of truth.
- Si el LLM hallucina un código de propiedad inexistente, el Code node lo detecta y degrada gracefully (manda solo texto).
- Funciona con cualquier BSP / canal porque la expansión es server-side.

## Proceso

### 1. Definir el marker

**Formato recomendado:**
```
[TIPO:identificador]
```

Ejemplos:
- `[IMG:CR-2031]` → enviar imágenes de la propiedad CR-2031
- `[CARD:abc-123]` → enviar property card formateada
- `[LOC:9.93,-84.08]` → enviar pin de ubicación

**Reglas del formato:**
- Pocos caracteres, distintivos, fácil de matchear con regex.
- TIPO en mayúsculas, identificador con formato natural.
- Espacios opcionales adentro tolerados: `[IMG:CR-2031]` == `[IMG: CR-2031 ]`.
- Regex de match: `/\[IMG:\s*([A-Za-z]+-?\d+)\s*\]/i`.

### 2. Diseñar el system prompt del LLM con la regla MANDATORY

El prompt del LLM debe:
- Definir cuándo emite el marker (condición específica)
- Definir el formato EXACTO con ejemplos
- Prohibir alternativas ("aquí va la foto" sin marker)
- Reforzar con DO/DON'T explícitos

```markdown
## REGLA MARKER DE IMAGEN

Cuando el lead pida una foto de una propiedad específica:
1. DEBES emitir el marker `[IMG:CR-XXXX]` al INICIO del mensaje, antes de cualquier otra palabra.
2. EJEMPLO: `[IMG:CR-2031] Aquí va la foto del apartamento moderno en Trejos.`
3. PROHIBIDO: decir "aquí va la foto" sin marker. El sistema NO envía nada si no ve el marker.
4. PROHIBIDO: modificar el formato (mayúsculas, espacios, código mal formado).

### Few-shot
USER: me mandás una foto?
ASSISTANT: [IMG:CR-2031] Listo, te paso la del apartamento moderno en Trejos. ¿Querés ver más?
```

### 3. (Si hay LLM intermedio formateador) Proteger el marker

Si entre el LLM principal y el Code node hay otro LLM que chunkea/reformatea (caso Casa CRM con el Formateador de Mensajes), ese segundo LLM **debe preservar el marker literal** o se pierde.

Agregar al prompt del formateador:
- Regla CRÍTICA explícita: "NO modificar `[IMG:CR-XXXX]`, mantener literal en MENSAJE 1"
- Ejemplos de output correcto e incorrecto
- Prohibición explícita de "limpiar" lo que parece meta-sintaxis

### 4. Code node Expand (siguiendo `n8n-code-node-debug-pattern`)

```javascript
const IMG_RE = /\[IMG:\s*([A-Za-z]+-?\d+)\s*\]/i;
const IMG_RE_GLOBAL = /\[IMG:\s*[A-Za-z]+-?\d+\s*\]/gi;
const MAX_IMAGES_PER_PROPERTY = 3;

// Multi-source agency_id / context (ver n8n-code-node-debug-pattern)
let agencyId = null, agencyIdSource = 'none';
for (const src of ['Resolve Agency', 'Variables', 'Buscar Lead (Supabase)']) {
  try {
    const v = $(src).first()?.json?.agency_id;
    if (v) { agencyId = v; agencyIdSource = src; break; }
  } catch (e) {}
}

function cleanMarkers(s) {
  return (s || '').replace(IMG_RE_GLOBAL, '').replace(/\s+/g, ' ').trim();
}

async function fetchMediaForCode(codigo) {
  // Llamar a tu source of truth (edge function, API interna)
  // Retornar { mediaUrls: [...], titulo, ..., error: null }
  // Usar console.log + retorno con error: 'reason' para diagnóstico
}

const out = [];
let alreadyExpandedOne = false;  // Regla: 1 propiedad con media por mensaje

for (const item of items) {
  const text = (item.json?.output || '').toString();
  const match = text.match(IMG_RE);

  if (!match || alreadyExpandedOne) {
    const clean = cleanMarkers(text);
    if (clean) out.push({ json: { type: 'text', output: clean } });
    continue;
  }

  const codigo = match[1].toUpperCase();
  const { mediaUrls, error } = await fetchMediaForCode.call(this, codigo);
  const clean = cleanMarkers(text);

  if (mediaUrls.length > 0) {
    mediaUrls.slice(0, MAX_IMAGES_PER_PROPERTY).forEach((url, idx) => {
      out.push({ json: { type: 'image', url, caption: idx === 0 ? '...' : '' } });
    });
    alreadyExpandedOne = true;
  } else {
    // Debug item visible (no llega a canal porque IF filtra)
    out.push({ json: { type: 'debug', codigo, agencyId, error: error || 'unknown' } });
  }

  if (clean) out.push({ json: { type: 'text', output: clean } });
}

return out;
```

### 5. IF + HTTP node downstream

- IF: branchea por `type === 'text' || type === 'image'`. Items `type === 'debug'` caen a FALSE y no se envían.
- HTTP node (envío al canal): cuerpo branched por `type`:
  ```javascript
  $json.type === 'image'
    ? JSON.stringify({ from, to, type: 'image', image: { link: $json.url, caption: $json.caption } })
    : JSON.stringify({ from, to, type: 'text', text: { body: $json.output } })
  ```

### 6. Persistir en DB con tipo correcto

Tu webhook handler del canal (o el HTTP node con un postgres después) debe insertar el mensaje con `kind='image' + media_url=...` para que la UI pueda renderizarlo. NO insertar solo el caption como texto.

## Output esperado

Pipeline completo funcionando:
1. LLM emite `[IMG:XXX]` cuando corresponde
2. (Si hay LLM intermedio) preserva el marker
3. Code node expande markers → items tipados (image / text / debug)
4. IF filtra debug
5. HTTP node envía cada item al canal (1 POST por item)
6. DB persiste con kind/media_url correctos
7. UI renderiza imagen + caption (no solo texto plano)

## Ejemplo concreto (Casa CRM end-to-end, sesión 2026-05-21)

**Marker definido:** `[IMG:CR-XXXX]` donde CR-XXXX es el código de propiedad.

**System prompt Sofia v5.1+:** Regla MANDATORY del marker en sección dedicada, 2 few-shots replay del caso bug original (lead pide foto → Sofia debe responder con marker).

**LLM intermedio "Formateador de Mensajes" v5.2:** Regla CRÍTICA de preservar `[IMG:CR-XXXX]` literal en MENSAJE 1, 2 ejemplos correctos + 2 incorrectos.

**Expand Property Images v5.5:** Code node con regex match, multi-source `agency_id`, fetch a `properties-search?codigo=CR-XXXX`, normalize URL (force JPG), emit items.

**IF "Mensaje no vacio?":** Acepta `type === 'text' && output` OR `type === 'image' && url`. `type === 'debug'` cae a FALSE.

**Send Chunk via YCloud:** body branched por type.

**Edge function `ycloud-webhook`:** map `type='image'` → `kind='image'`, save `media_url`.

**CRM `MessageBubble`:** rama image renderiza `<img>` clickeable.

Resultado: lead pide "me pasás foto" → recibe imagen real en WhatsApp + caption "CR-2031 — Casa moderna en Escazú, $485,000" + se ve en el inbox del CRM.

## Gotchas / antipattern

- **NO** pedirle al LLM que devuelva JSON estructurado con array de media. Frágil — el LLM se inventa schemas.
- **NO** olvidar la regla en el LLM intermedio (formateador) — borrará el marker pensando que es metasintaxis.
- **NO** asumir que el código que emite el LLM existe — siempre validar contra DB, degradar a solo-texto si no.
- **NO** emitir más de 1 grupo de media por mensaje (regla `alreadyExpandedOne`). Evita spam involuntario si el LLM emite múltiples markers.
- **NO** dejar el marker en el texto final que se envía. `cleanMarkers()` quita el `[IMG:...]` del texto que va al canal.
- **NO** intentar lookup en el LLM. El LLM solo decide CUÁNDO; el Code node resuelve QUÉ.

## Skills relacionadas

- `n8n-code-node-debug-pattern` — el Code node Expand debe seguir este patrón
- `whatsapp-image-delivery-ycloud` — cómo el HTTP node downstream envía la imagen
- `n8n-workflow-build-script` — para versionar cambios al Code node Expand
- `langchain-agent-prompt-design` (.claude/skills/) — para escribir el prompt del LLM con la regla del marker
