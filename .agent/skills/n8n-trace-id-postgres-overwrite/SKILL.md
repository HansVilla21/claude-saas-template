# Skill: N8N — Postgres nodes pisan campos custom del item

## Cuándo usar esta skill

- Estás propagando un campo custom (trace_id, correlation_id, flags) a través de varios Code Nodes en un workflow N8N.
- Hay nodos Postgres (`executeQuery`, `select`, `insert`, `update`) entre los Code Nodes que mutan el item.
- Aparece el síntoma: un Code Node downstream lee `$input.first().json.miCampo` y devuelve `undefined`, aunque el Code Node upstream sí lo agregó al item.

**No usar** cuando: tu workflow no tiene nodos Postgres (u otros que devuelven sus propios items) entre Code Nodes que dependen del estado del item original.

## Por qué existe esta skill

En N8N, cada nodo recibe items del nodo anterior y emite items al siguiente. Los nodos **Postgres** (y similares como HTTP Request con response autocompletion) **REEMPLAZAN el item con las filas de su query**, NO concatenan ni preservan campos custom del item de entrada.

**Síntoma:**

```
Code Node A:                 emite { id, msg, __trace_id: 'abc' }
   ↓
Postgres node (select):      emite { agency_id, settings, ... }  ← PISÓ todo
   ↓
Code Node B:                 lee $input.first().json.__trace_id
                             → undefined  ❌
```

El campo `__trace_id` que A propagó se pierde después del Postgres. Si B hace `if (!trace_id) return early`, **el código falla silenciosamente** sin error visible.

## Patterns bugged + sus fixes

### Bug típico

```javascript
// Code Node A — Crear Trace
const trace_id = _uuidv4();
return $input.all().map(item => ({
  ...item,
  json: { ...item.json, __trace_id: trace_id }
}));

// (Postgres node intermedio que devuelve sus filas)

// Code Node B — Downstream que necesita el trace_id
const trace_id = $input.first().json.__trace_id;  // ❌ undefined
if (!trace_id) return $input.all();  // return silencioso, audit no se actualiza
```

### Fix: referencia directa al nodo fuente

```javascript
// Code Node B — versión corregida
let trace_id = null;
try {
  trace_id = $('Code Node A').first().json.__trace_id || null;
} catch (e) {}
// Fallback defensivo (por si la referencia falla en sub-flows):
if (!trace_id) {
  try {
    trace_id = $input.first().json.__trace_id || null;
  } catch (e) {}
}
```

**Por qué funciona:** `$('NombreNodo')` salta directamente al output del nodo nombrado, ignorando cualquier transformación intermedia. Los campos custom que ese nodo agregó al item están disponibles SIN importar cuántos nodos Postgres haya entre medio.

### Mismo fix en HTTP nodes con jsonBody

Si un HTTP Request necesita el trace_id en el body:

```javascript
// ❌ ROMPE si hay Postgres nodes upstream:
={{ JSON.stringify({
  trace_id: $json.__trace_id,    // undefined
  payload: $('Validator').first().json
}) }}

// ✅ CORRECTO:
={{ JSON.stringify({
  trace_id: $('Code Node A').first().json.__trace_id,
  payload: $('Validator').first().json
}) }}
```

## Otros nodos que tienen el mismo problema

Cualquier nodo que **emite items propios en lugar de propagar el input**:

- **Postgres** (`executeQuery`, `select`, `insert`, `update`).
- **MySQL**, otros DBs.
- **HTTP Request** cuando devuelve la response como item (sin "Continue on Fail" + merge manual).
- **Split In Batches** (genera nuevos items por batch).
- **Switch** y **Filter** propagan el item pero pueden hacer split que confunda referencias.

**Regla general:** si el nodo genera output que NO viene del input (sino de una fuente externa como DB/API), va a pisar campos custom.

## Detección preventiva

Antes de deploy, BFS por reachability + cross-reference de `$('NodeName')`:

```javascript
// Verificar que cada $('X') en jsCode/jsonBody apunta a un nodo que SÍ está
// en el path activo del trigger (no a un nodo huérfano).
const refs = [...JSON.stringify(workflow).matchAll(/\$\('([^']+)'\)/g)].map(m => m[1]);
const orphans = refs.filter(name => 
  workflow.nodes.some(n => n.name === name) && !reachableNodes.has(name)
);
// Si orphans.length > 0, hay refs a nodos no alcanzables → bug latente.
```

## Anti-patterns (NO hacer)

- ❌ **Asumir que `$json` o `$input.first().json` preserva campos custom a través de Postgres nodes.** No lo hacen.
- ❌ **Re-leer del DB el trace_id en cada Code Node** (es waste de RTT). Una sola referencia al Code Node fuente es suficiente.
- ❌ **Setear el campo custom en `parameters.options.additionalFields` de un Postgres node.** Esto NO existe — los Postgres nodes solo devuelven sus filas.
- ❌ **Confiar en que el `__trace_id` "flota" entre nodos**. Es solo una propiedad del JSON de un item, que se pisa cuando un nodo emite item nuevo.

## Cómo se invoca en sesión

El founder NO escribe `/n8n-trace-id-postgres-overwrite`. Detectar proactivamente cuando:

- Diseñás un workflow que necesita propagar un campo (trace_id, correlation_id, request_id, feature flags) entre Code Nodes con Postgres entre medio.
- Estás reviewing código y ves `$input.first().json.<campo_custom>` después de un nodo Postgres.
- Aparece bug "el Code Node downstream no ve el campo que el upstream agregó".

Aplicar el fix automáticamente.

## Caso real: bot-c-v1 (2026-05-30, ronda 2 del fix loop)

**Síntoma:** `Crear Trace de Turno` propagaba `__trace_id` al item. `Enriquecer Trace con IDs`, `Capturar Prompt Hash`, `Audit Extractor Output`, `Cerrar Trace de Turno` (todos downstream después de 3 nodos Postgres) leían `$input.first().json.__trace_id` → undefined → return early. Audit log quedaba con solo `status='running'` para siempre.

**Diagnóstico:** execution log mostró `Enriquecer Trace.output.__trace_id = undefined`, pese a que el `Crear Trace.output.__trace_id = '5e48b0bf...'`. Postgres nodes intermedios pisaron el item.

**Fix:** los 6 Code Nodes downstream ahora leen `$('Crear Trace de Turno').first().json.__trace_id` directamente.

**Bonus:** mismo bug existía en los 8 HTTP nodes (jsonBody usando `$json.__trace_id`). Fixeado con el mismo patrón.

[[n8n-task-runner-no-crypto]] — relacionado: si el trace_id se genera con `crypto.randomUUID()` en N8N 1.121+, falla antes de propagar.
[[n8n-workflow-build-script]] — patrón para automatizar este fix vía build scripts idempotentes.
