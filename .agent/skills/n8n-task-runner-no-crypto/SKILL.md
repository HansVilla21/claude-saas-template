# Skill: N8N Task Runner — sin crypto global

## Cuándo usar esta skill

- Estás escribiendo o reviewing un Code Node de N8N 1.121+ que necesita un UUID, hash, o cualquier operación criptográfica.
- Estás migrando un workflow desde N8N legacy (≤1.120) a 1.121+.
- Aparece el error en runtime: `ReferenceError: crypto is not defined`.

**No usar** cuando: estás en N8N ≤1.120 (sandbox legacy todavía expone crypto).

## Por qué existe esta skill

A partir de **N8N 1.121**, el JsTaskRunner restrictivo (sandbox del Code Node) **NO expone `crypto` como global**. A diferencia del sandbox legacy donde `crypto.randomUUID()` y `crypto.subtle.digest()` estaban disponibles, ahora cualquier referencia a `crypto.*` tira `ReferenceError: crypto is not defined` en runtime.

**Síntoma típico:**

```text
{
  "errorMessage": "crypto is not defined [line N]",
  "errorDescription": "ReferenceError",
  ...
}
```

El Code Node falla, n8n marca el nodo como failed, y dependiendo del `onError` config, el flow se detiene o continúa con datos vacíos.

## Patrones bugged + sus fixes

### Bug 1 — `crypto.randomUUID()`

```javascript
// ❌ ROMPE en N8N 1.121+:
const trace_id = crypto.randomUUID();
```

**Fix:** UUID v4 manual con `Math.random()`:

```javascript
function _uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16 | 0;
    var v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
const trace_id = _uuidv4();
```

**Justificación:** `Math.random()` no es criptográficamente seguro, pero un trace_id NO necesita serlo. Es solo un identificador único, no un token de auth ni una key. Para tokens/keys reales, usar otra estrategia (Set node con expression `{{ $randomString }}` desde fuera del Code Node, o llamar a un edge function que genere el token).

### Bug 2 — `crypto.subtle.digest('SHA-256', ...)`

```javascript
// ❌ ROMPE en N8N 1.121+:
const enc = new TextEncoder().encode(str);
const buf = await crypto.subtle.digest('SHA-256', enc);
const hash = Array.from(new Uint8Array(buf))
  .map(b => b.toString(16).padStart(2, '0'))
  .join('');
```

**Fix:** hash naive **djb2** sin dependencias:

```javascript
function _naiveHash(s) {
  var h = 5381;
  for (var i = 0; i < s.length; i++) {
    h = ((h << 5) + h) + s.charCodeAt(i) | 0;
  }
  return 'naive-' + (h >>> 0).toString(16).padStart(8, '0') + '-' + s.length;
}
const hash = _naiveHash(text);
```

**Justificación:** SHA-256 da unicidad criptográfica. djb2 NO la da, pero:
- Es determinista (mismo input → mismo hash).
- Detecta cambios (cualquier modificación del input cambia el hash, salvo colisiones).
- Incluye `length` como suffix para reducir colisiones reales.

Suficiente para correlación de logs, detección de cambios en system prompts, o IDs no-criptográficos. **NO usar** para passwords, tokens, signing.

### Bug 3 — `crypto.getRandomValues()`

Mismo principio: usar `Math.random()` en loop:

```javascript
function _randomBytes(n) {
  const arr = new Array(n);
  for (let i = 0; i < n; i++) arr[i] = Math.floor(Math.random() * 256);
  return arr;
}
```

## Detección del bug en un workflow

Antes de deploy, grep el workflow JSON:

```bash
node -e "
const fs = require('fs');
const wf = JSON.parse(fs.readFileSync('workflow.json', 'utf8'));
const codeNodes = wf.nodes.filter(n => n.type === 'n8n-nodes-base.code');
for (const n of codeNodes) {
  const matches = (n.parameters.jsCode || '').match(/crypto\\.\\w+/g);
  if (matches) console.log(n.name, '→ uses', matches);
}
"
```

Si el output lista nodos, hay que fixearlos.

## Casos donde NO podés evitar crypto

Si **DE VERDAD** necesitás criptografía real (token signing, encryption):
- Usá una **Edge Function de Supabase** (Deno, sí expone Web Crypto API) llamada desde un HTTP node de N8N.
- O un **endpoint propio** del backend que haga la operación.

No fuerces `require('crypto')` ni hacks — el sandbox es restrictivo a propósito.

## Anti-patterns (NO hacer)

- ❌ **`require('crypto')`** — bloqueado en el sandbox.
- ❌ **`globalThis.crypto`** — undefined igual.
- ❌ **`window.crypto`** — no existe (Node, no browser).
- ❌ **Polyfill propio inline** — innecesario, usar el approach de arriba.
- ❌ **`Math.random()` para tokens reales** — solo para IDs no-criptográficos.

## Cómo se invoca en sesión

El founder NO escribe `/n8n-task-runner-no-crypto`. Detectar proactivamente cuando:

- Estás escribiendo un Code Node nuevo.
- Estás revisando código de Code Node existente.
- Aparece error `crypto is not defined` en logs de N8N.
- Estás migrando workflow desde N8N legacy.

Y aplicar la convención automáticamente.

## Caso real: bot-c-v1 (2026-05-30 noche)

**Síntoma:** founder mandó primer mensaje al WhatsApp. Workflow tiró error `crypto is not defined [line 6]` en `Crear Trace de Turno`. El flow se cortó.

**Diagnóstico:** N8N 1.121 self-hosted en Easypanel usa JsTaskRunner restrictivo (visible en stack trace: `@n8n+task-runner@file+packages+@n8n+task-runner_...`). `crypto.randomUUID()` y `crypto.subtle.digest()` no disponibles.

**Fix aplicado:** `crypto.randomUUID()` → `_uuidv4()` manual + `crypto.subtle.digest('SHA-256', ...)` → `_naiveHash()` djb2. Aplicado a 2 Code Nodes: `Crear Trace de Turno` y `Capturar Prompt Hash`.

**Resultado:** bot empezó a procesar mensajes correctamente.

[[n8n-workflow-build-script]] — convención de cómo escribir builds idempotentes que aplican estos fixes.
[[n8n-workflow-versioning]] — cómo versionar workflows con estos cambios.
