---
name: n8n-expression-validator
description: Validador determinístico (sin LLM) de expresiones N8N en un workflow JSON. Detecta referencias `$('NodeName')` a nodos inexistentes, `$fromAI(...)` huérfanos en tools no-LangChain, y expresiones con brackets desbalanceados. Output: lista de violaciones con nodo, ubicación y expresión problemática. Lo invoca el `n8n-reviewer` como Check 1 del audit. Usar cuando hay que verificar integridad referencial de un workflow N8N de forma rápida y determinística.
---

# N8N Expression Validator

## Cuándo usar esta skill

- El `n8n-reviewer` la corre como **Check 1** del audit (integridad referencial)
- Antes de importar un workflow a N8N en producción
- Después de cualquier rename / borrado de nodos
- Cuando un workflow falla en runtime con "node X not found"

## Cómo usar

```bash
node scripts/validate-n8n-expressions.js <ruta-al-workflow.json>
```

Exit code:
- `0` — limpio (todas las expresiones resuelven a nodos existentes)
- `1` — ≥1 violación encontrada (detalle en stdout)

## Qué detecta

### A. `$('NodeName')` referencia un nodo inexistente

La expresión más común en N8N para acceder a output de otro nodo. Si el nodo no existe en `workflow.nodes[*].name`, el workflow rompe en runtime con error críptico.

**Ejemplo de bug:**
```js
// El expression dice: $('Get Conversation State').first().json.id
// Pero el nodo se llama: "Get Conversation State - v2"
// Resultado en runtime: "Node 'Get Conversation State' not found"
```

### B. `$fromAI(...)` en tools no-LangChain

`$fromAI` solo resuelve dentro de nodos `@n8n/n8n-nodes-langchain.tool*`. Si aparece en un HTTP Request normal, Code node, o Set node, queda como string literal → el endpoint recibe `"$fromAI('reason', ...)"` como valor.

### C. Brackets desbalanceados en `{{ ... }}`

Conteo de `{{` vs `}}` por string. Detecta truncamientos.

### D. Nodos con `name` duplicado

N8N usa el primero que aparece en el array, los otros quedan zombi. Detección: `Set(names).size !== nodes.length`.

## Output del script

```
N8N Expression Validator
========================
Workflow: n8n/workflows/chatbot-inmobiliaria-demo-ycloud-sofia-v3-unified.json
Nodes: 47
Expressions scanned: 312

VIOLATIONS:

[A] $('NodeName') → nodo inexistente:
  - Nodo "Request Handoff Tool", param "jsonBody"
    Expression: $('Get Conversation State').first().json.id
    Referenciado: "Get Conversation State" → NO EXISTE
    (más similar existente: "Get Conv State")

[B] $fromAI(...) huérfano (no-LangChain tool):
  - Nodo "HTTP Request - Whisper", type: n8n-nodes-base.httpRequest
    Expression: $fromAI('audioUrl', 'URL del audio', 'string')
    Razón: $fromAI solo resuelve en nodos langchain.tool*

[C] Brackets desbalanceados:
  - Nodo "Code Formatear Historial", param "jsCode"
    Línea 12: const x = {{ $json.foo }; // missing }}

[D] Nodos con nombre duplicado:
  - "Postgres Chat Memory" aparece 2 veces (nodes[12], nodes[34])

TOTAL: 4 violations
Exit code: 1
```

## Limitaciones

- **No valida semántica del prompt LLM.** El script es lectura de JSON pura. Si un system prompt menciona "tool X" pero X no existe como tool conectada, NO lo detecta — eso es trabajo del walkthrough mental del reviewer.
- **No corre expresiones.** Solo verifica forma. Una expresión `$('Foo').first().json.bar.baz` con `bar` undefined en runtime NO se detecta acá.
- **No valida tipos.** Si una expresión devuelve string y el campo espera number, no lo detecta.

## Script de referencia

El script vive en `scripts/validate-n8n-expressions.js`. Es 100% determinístico, sin dependencias externas (solo `node:fs` y `node:path`).

Si necesitás extender la detección:
- Agregá un nuevo case en el switch del main
- Cada detector retorna `{type, location, message}`
- El reporte final agrupa por type
