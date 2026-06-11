# Skill: n8n Code Node Debug Pattern

## Cuándo usar esta skill

- Vas a escribir o modificar el `jsCode` de un Code node en n8n.
- Estás debugando un Code node que falla silenciosamente (output vacío o inesperado pero sin error visible).
- El nodo hace fetch a una API externa, manipula URLs, transforma items.
- Cualquier vez que el output del nodo no es lo que esperabas y no sabés por qué.

## Por qué existe esta skill

El sandbox del Code node de n8n tiene gotchas que no están documentadas:
- Algunos globals de Node (como `URL`, `URLSearchParams`) **fallan silenciosamente** o se comportan distinto al esperado.
- Los `try/catch` mudos te esconden bugs porque siguen el flujo como si todo estuviera bien.
- `console.log` va a la pestaña Logs del nodo, pero la gente la ignora.
- El input/output del nodo se ve en la pestaña Output, pero si no diseñás el output para ser inspeccionable, debugar es a ciegas.

En Casa CRM (sesión 2026-05-21) nos costó **3 iteraciones** (v5.3 → v5.4 → v5.5) descubrir que `new URL()` rompía un normalizador de imágenes. Si hubiéramos seguido este patrón desde v5.3, lo agarrábamos en la primera.

## Proceso (5 reglas inviolables)

### Regla 1 — APIs prohibidas / sospechosas en el sandbox

**Confirmado que fallan o se comportan raro:**
- `new URL(url)` — tira excepción que el try/catch a veces no atrapa bien
- `URLSearchParams` — comportamiento inconsistente

**Alternativas seguras:**
- Parseo/manipulación de URL con regex + `.replace()` puro
- `JSON.parse` / `JSON.stringify` sí funcionan
- `Array.prototype.map/filter/reduce` sí funcionan
- `crypto` (módulo Node) está disponible vía `require('node:crypto')` en modo "Run Once for All Items"
- Async/await + `this.helpers.httpRequest(...)` sí funciona

**Regla práctica:** si tu primer instinto es `new SomethingFromNode(args)`, primero probar si hay versión string-pura.

### Regla 2 — NUNCA try/catch mudo

```javascript
// ❌ MAL — el bug se come y nunca lo ves
try {
  const x = riesgosoStuff();
  return x;
} catch (e) {
  return '';
}

// ✅ BIEN — el bug deja huella visible
try {
  const x = riesgosoStuff();
  return x;
} catch (e) {
  console.error('[NombreNodo] riesgosoStuff failed:', e.message, '| input:', JSON.stringify(input));
  return { _error: 'riesgoso_failed: ' + e.message, _input: input };
}
```

Si el catch DEBE retornar un valor "vacío" para que el flujo continúe, retornar un objeto con `_error` y otros campos diagnósticos, no `''` ni `null` sin contexto.

### Regla 3 — Emit debug item visible en el output del nodo

Cuando un item del input NO se pudo procesar bien (fetch falló, regex no matcheó, etc.), **NO lo silenciar**. Emitir un item con `type: 'debug'` (o cualquier tag que el siguiente nodo descarte por IF) que sea inspeccionable en la pestaña Output.

```javascript
// Item normal procesado bien
out.push({ json: { type: 'text', output: '...' } });

// Item que no se pudo procesar — debug visible
out.push({ json: {
  type: 'debug',
  reason: 'fetch_returned_empty',
  input: item.json,
  agencyId,
  fetchedCount: 0,
}});
```

**Que el siguiente IF lo filtre:** si el debug item no debe seguir el flujo (ej. no debe llegar a WhatsApp), el IF "Mensaje no vacio?" requiere `type === 'text' || type === 'image'`, así el debug item cae a la branch FALSE y no se envía. Pero queda visible en el output del Code node.

### Regla 4 — Console.log explícito en cada paso

```javascript
console.log('[NombreNodo v<N>] step 1 — input items:', items.length);
console.log('[NombreNodo v<N>] resolved agencyId:', agencyId, '| source:', agencyIdSource);
console.log('[NombreNodo v<N>] fetched, propiedades count:', propiedades.length);
console.log('[NombreNodo v<N>] normalized urls:', JSON.stringify(normalized));
```

Reglas:
- Prefijo `[NombreNodo v<N>]` siempre. Cuando hay 5 Code nodes loggeando, el prefijo es el único filtro útil.
- Loggear ANTES de cada operación riesgosa, y DESPUÉS con el resultado.
- Loggear los inputs cuando hagan falta para reproducir el bug.

### Regla 5 — Fallbacks multi-source para referencias a otros nodos

`$('NombreNodo').first().json.campo` falla si el nodo no está en el path de ejecución, o si se renombró, o si el JSON cambió de estructura. Hacer fallback chain:

```javascript
const SOURCES = ['NodoA', 'NodoB', 'NodoC'];
let value = null;
let valueSource = 'none';
for (const src of SOURCES) {
  try {
    const v = $(src).first()?.json?.campo;
    if (v) { value = v; valueSource = src; break; }
  } catch (e) {}
}
console.log('[Nodo] value:', value, '| source:', valueSource);
```

Esto sobrevive renames, re-imports, cambios de path. Si todos los sources fallan, `valueSource === 'none'` te dice exactamente cuál es el problema.

## Output esperado

Un Code node de n8n con `jsCode` que:
1. Loguea `[NombreNodo v<N>]` al inicio con todos los inputs relevantes
2. Resuelve referencias externas con multi-source fallback
3. Emite debug items en lugar de fallar en silencio
4. NO usa `new URL()` ni `URLSearchParams`
5. Cada operación con riesgo está envuelta en try/catch con console.error explícito + estructura diagnóstica en el retorno

## Ejemplo concreto (Casa CRM v5.5, Expand Property Images)

```javascript
// Expand Property Images — Sofia v5.5
// Pattern aplicado: multi-source agencyId, debug item emit, console logging,
// string ops puro (no URL constructor).

const IMG_RE = /\[IMG:\s*([A-Za-z]+-?\d+)\s*\]/i;
const AGENCY_SOURCES = ['Resolve Agency','Variables','Buscar Lead (Supabase)',
                        'Unificacion de Variables','ID y Mensaje','Extract Variables'];

let agencyId = null, agencyIdSource = 'none';
for (const source of AGENCY_SOURCES) {
  try {
    const v = $(source).first()?.json?.agency_id;
    if (v) { agencyId = v; agencyIdSource = source; break; }
  } catch (e) {}
}
console.log('[Expand v5.5] agencyId:', agencyId, '| source:', agencyIdSource);

function normalizeImageUrl(url) {  // string ops puro, no URL()
  if (typeof url !== 'string' || !url) return '';
  let out = url;
  out = out.replace(/([?&])auto=format(&|$)/g, (m, p1, p2) => p2 === '&' ? p1 : '');
  out = out.replace(/\?&/g, '?').replace(/&&+/g, '&').replace(/[?&]$/, '');
  if (!/[?&]fm=/.test(out)) out += (out.includes('?') ? '&' : '?') + 'fm=jpg';
  return out;
}

// ... fetchPropertyImages con console.log por paso, retorno { fotoUrls, error } ...

const out = [];
for (const item of items) {
  // ... lógica ...
  if (fotoUrls.length > 0) {
    fotoUrls.forEach(url => out.push({ json: { type: 'image', url, caption: '...' } }));
  } else {
    out.push({ json: { type: 'debug', codigo, agencyId, agencyIdSource,
                       rawCount, error: error || 'unknown',
                       message: 'No se pudo cargar foto. Razon: ' + (error || 'unknown') } });
  }
}
return out;
```

Cuando esto falló en producción, el debug item dijo: `agencyId: '0f4fb3c8-...', error: 'unknown', rawCount: 4` → eso fue la pista que confirmó que el problema estaba en `normalizeImageUrl` (no en agencyId, no en el fetch). Sin el debug item visible, hubiéramos seguido buscando en lugares equivocados.

## Gotchas / antipattern

- **NO** asumir que un global de Node funciona en sandbox. Probar antes de confiar.
- **NO** usar try/catch que retorna `''` o `null` sin contexto — eso esconde bugs.
- **NO** logear cosas como `console.log(item)` sin prefijo — se pierde entre logs de otros nodos.
- **NO** confiar en `$('Nodo X')` sin fallback — un re-import puede romperlo silencioso.
- **NO** eliminar el debug item del output después de "arreglar" el bug. Dejarlo. La próxima regresión te lo agradece.

## Skills relacionadas

- `n8n-workflow-build-script` — para versionar el código del Code node de forma reproducible
- `n8n-expression-validator` — detecta `$('NodoFantasma')` muertos antes de que rompan en runtime
- `bot-llm-marker-expand-pattern` — uso típico de Code node para expandir markers de un LLM

## Memoria global del founder (relacionada)

- `feedback_n8n_code_node_no_url_constructor.md` — la regla del URL constructor fue feedback explícito del founder, validado por incidente real.
