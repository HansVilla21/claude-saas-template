# Skill: n8n Workflow Build Script

## Cuándo usar esta skill

- Vas a modificar un workflow N8N que ya está en producción (más de 30 nodos).
- El cambio toca el JSON del workflow: edits a un Code node, prompt de LLM, params de un HTTP node, conexiones, sticky notes, etc.
- Ya hiciste edits manuales del JSON antes y se rompió algo (clásico: copiaste mal una llave, perdiste una conexión, dejaste un nodo huérfano).
- El founder o un agente futuro necesita reproducir el cambio exactamente — sin tu memoria de qué tocaste a mano.

**No usar** cuando: el cambio es trivial (un sticky note, renombrar el workflow). Edit directo está bien.

## Por qué existe esta skill

N8N permite editar workflows a mano vía drag/drop o JSON paste, pero:
- Cada edit a mano es irreproducible — no sabés exactamente qué cambió hasta que un diff te traiciona.
- Re-importar el JSON viejo borra TUS cambios.
- Múltiples sesiones con humanos + agentes editando el mismo workflow es receta de regresión silenciosa.

**Solución:** todo cambio al JSON se hace vía un script `scripts/build-workflow-v<N>.js` idempotente. Input: el JSON de la versión anterior. Output: el JSON de la versión nueva + smoke tests pasados.

## Proceso

### 1. Identificar input y output
- **Input:** `n8n/workflows/<workflow>-v<N>.json` (versión actual)
- **Output:** `n8n/workflows/<workflow>-v<N+1>.json` (versión nueva)
- **Script:** `scripts/build-workflow-v<N+1>.js`

Convención de versionado: `v<N>` para cambio estructural, `v<N>.<m>` para hotfix sobre N.

### 2. Diseñar el script (estructura obligatoria)

```javascript
/**
 * build-workflow-v<N+1>.js
 *
 * v<N> → v<N+1> — <título corto>
 *
 * Bug/feature observado:
 *   <síntoma concreto, fecha si aplica>
 *
 * Causa raíz:
 *   <una línea>
 *
 * FIX:
 *   <qué cambia, qué NO cambia>
 *
 * Uso: node scripts/build-workflow-v<N+1>.js
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const IN_PATH  = path.join(ROOT, 'n8n', 'workflows', '<workflow>-v<N>.json');
const OUT_PATH = path.join(ROOT, 'n8n', 'workflows', '<workflow>-v<N+1>.json');

function findNodeByName(wf, name) {
  return wf.nodes.find((n) => n.name === name);
}

function main() {
  const wf = JSON.parse(fs.readFileSync(IN_PATH, 'utf8'));

  // 1. Cambios al workflow (uno por uno, con [fix] log)
  const node = findNodeByName(wf, '<NombreNodo>');
  if (!node) throw new Error('No encontre nodo "<NombreNodo>"');
  // mutar node.parameters.X = nuevoValor
  console.log('[fix] <NombreNodo>: <descripción>');

  // 2. Metadata (siempre)
  wf.name = '<Nombre> v<N+1>';
  wf.versionId = crypto.randomUUID();
  wf.active = false; // founder activa manualmente

  // 3. Write
  fs.writeFileSync(OUT_PATH, JSON.stringify(wf, null, 2) + '\n', 'utf8');
  console.log('[ok]', OUT_PATH);

  // 4. Smoke tests
  const out = fs.readFileSync(OUT_PATH, 'utf8');
  const checks = [
    ['active=false',     !out.includes('"active": true')],
    ['cambio X aplicado', out.includes('<marker del cambio>')],
    // ... un check por cada cosa importante que el script tenía que hacer
  ];
  let failed = 0;
  checks.forEach(([n, ok]) => { console.log((ok?'[pass] ':'[FAIL] ')+n); if(!ok)failed++; });
  if (failed) process.exit(1);
  console.log('\n[done]');
}

main();
```

### 3. Cuando el cambio es a un Code node (jsCode) muy largo

NO embeber el código como string literal directo — escapa caracteres y se vuelve ilegible. Usá:
- Template literal con backticks: `const CODIGO = \`...\``.
- Si el código tiene regex con `\[` o `\d`, escapar con `\\[` y `\\d` dentro del template (el JSON.stringify de n8n lo des-escapa al cargar).

### 4. Cuando el cambio es a un prompt LLM muy largo

Patrón: guardar el prompt en `memory/research/<id>-prompt.md` con markers HTML invisibles, y el script lo extrae:

```markdown
<!-- PROMPT_V<N>_START -->
<contenido del prompt>
<!-- PROMPT_V<N>_END -->
```

```javascript
function extractPrompt() {
  const md = fs.readFileSync(PROMPT_MD_PATH, 'utf8');
  const start = md.indexOf('<!-- PROMPT_V<N>_START -->');
  const end = md.indexOf('<!-- PROMPT_V<N>_END -->');
  return md.slice(start + '<!-- PROMPT_V<N>_START -->'.length, end).trim();
}
```

**Por qué markers HTML y no \`\`\`json fences:** si el prompt tiene bloques de código anidados, el regex de fences se rompe (paso real con v5 → v5.1).

### 5. Correr y validar

```bash
node scripts/build-workflow-v<N+1>.js
node scripts/validate-n8n-expressions.js n8n/workflows/<workflow>-v<N+1>.json
```

Ambos deben terminar con exit code 0. Si el validator detecta referencias muertas (`$('NodoQueYaNoExiste')`), arreglarlas antes de entregar al founder.

### 6. Entregar al founder

Resumen al founder con: ruta del JSON, tamaño KB, número de nodos, qué cambió (3 bullets máximo), qué NO se tocó (importante para que sepa qué riesgos descartar), test plan concreto.

## Output esperado

1. `scripts/build-workflow-v<N+1>.js` — script reproducible, idempotente
2. `n8n/workflows/<workflow>-v<N+1>.json` — workflow nuevo con `active=false`
3. `memory/n8n-changes/<YYYY-MM-DD>-<workflow>-v<N+1>.md` (opcional pero recomendado) — bitácora del cambio
4. Validator pasa con 0 violations

## Ejemplo concreto (de Casa CRM, sesión 2026-05-21)

**Input:** v5.4 del workflow Sofia tenía `Expand Property Images` con `new URL()` que fallaba en sandbox.

**Build script creado:** `scripts/build-workflow-v5.5.js`
- Lee `chatbot-inmobiliaria-demo-ycloud-sofia-v5.4.json`
- Reemplaza `expand.parameters.jsCode` con código nuevo (string ops puro, sin URL constructor)
- Setea `wf.name = '... v5.5'`, `wf.versionId = uuid`, `wf.active = false`
- Smoke tests: 9 checks, incluyendo `!out.includes('new URL(')` y `out.includes("'?') + 'fm=jpg'")`

**Output:** `n8n/workflows/chatbot-inmobiliaria-demo-ycloud-sofia-v5.5.json`, 112.1 KB, 58 nodos.

**Validator:** 0 violations, 65 expresiones escaneadas.

**Lo que NO se tocó:** Sofia prompt v5.1, Formateador prompt v5.2, conexiones, Send Chunk YCloud, properties-search edge function. Founder solo tiene que validar el Expand Property Images.

## Gotchas / antipattern

- **NO editar JSON a mano.** Si te ves haciendo find/replace en el JSON, parate y armá un script.
- **NO usar regex de \`\`\` fences para extraer prompts** si el prompt tiene fences anidados. Usar markers HTML.
- **NO olvidar `wf.active = false`** — el founder debe activar manualmente cada nueva versión. Activarlo desde el script puede pisar el workflow activo en prod.
- **NO duplicar IDs**: dejar n8n regenerar IDs en import. Solo regenerar `wf.versionId` con `crypto.randomUUID()`.
- **NO commitear sin correr el validator.** Si el validator falla, los `$('NodeName')` apuntan a nodos que ya no existen → bug silencioso en runtime.

## Deploy vía API + verificación por hash (capturado 2026-06-12)

El build script no termina cuando escribe el JSON. **Deploya y verifica contra el N8N vivo** — el editor de N8N cachea y "lo veo igual" no significa nada.

**Deploy (en el mismo script, tras los smoke tests):**
```js
// La API PUT SOLO acepta name/nodes/connections/settings.
// versionId, active, createdAt, etc. la hacen fallar con "additional properties".
const payload = JSON.stringify({ name: wf.name, nodes: wf.nodes,
                                 connections: wf.connections, settings: wf.settings });
https.request({ hostname: N8N_HOST, path: `/api/v1/workflows/${ID}`, method: 'PUT',
  headers: { 'Content-Type':'application/json', 'X-N8N-API-KEY': KEY,
             'Content-Length': Buffer.byteLength(payload) } }, ...);
```

**Verificación post-deploy (la que da confianza real):** traer el workflow vivo y comparar **hash SHA-256** de cada prompt/campo contra el archivo canónico. "Está actualizado" se DEMUESTRA, no se afirma.
```js
const live = await GET(`/api/v1/workflows/${ID}`);     // estado vivo
const livePrompt = live.nodes.find(n => n.name===NODE).parameters.options.systemMessage;
const ok = sha256(canonPrompt) === sha256(livePrompt);  // idénticos o no, sin ambigüedad
```
Para confirmar COMPORTAMIENTO (no solo contenido), leer una ejecución real:
`GET /api/v1/executions/{id}?includeData=true` → mirar el output real del nodo. Nunca afirmar cómo se comporta un nodo sin esto.

**Gotchas de entorno:**
- En Windows, leer/escribir el JSON con **Node.js, no Python** (`UnicodeDecodeError: charmap`).
- Tras deploy, el editor de N8N necesita **cerrar y reabrir la pestaña** para mostrar el cambio.
- `N8N_API_KEY` / `N8N_HOST` se leen del `.env`, nunca hardcodeados en el repo.

## Skills relacionadas

- `n8n-expression-validator` (ya existe en `.claude/skills/`) — el validator que se corre después del build.
- `n8n-workflow-audit` (ya existe) — auditoría más extensa de calidad de workflow.
- `n8n-code-node-debug-pattern` — cómo escribir código robusto dentro de un Code node antes de meterlo al build script.
- `n8n-pipeline-rapido-vs-pesado` — cuándo este flujo (build directo) vs pipeline pesado con architect.
