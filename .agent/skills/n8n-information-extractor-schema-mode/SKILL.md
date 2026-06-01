# Skill: N8N Information Extractor — `fromJson` vs `manual`

## Cuándo usar esta skill

- Estás configurando un nodo `@n8n/n8n-nodes-langchain.informationExtractor`.
- Tu schema de extracción es **dinámico** (construido en runtime desde data del agency, settings, etc.) — no estático.
- Aparece el síntoma: el LLM devuelve el **JSON Schema literal** como output, en lugar de extraer datos del mensaje.

**No usar** cuando: tu schema es estático y simple (un schemita de 3-4 campos hardcodeado en el nodo). En ese caso `fromJson` con un ejemplo en línea es lo más rápido.

## Por qué existe esta skill

El nodo `informationExtractor` (LangChain) tiene 2 modos para definir el schema de salida:

| Modo (`schemaType`) | Campo de entrada | Qué espera |
|---|---|---|
| `'fromJson'` | `jsonSchemaExample` | **Un objeto EJEMPLO** del output esperado. N8N infiere el schema con Zod desde ese ejemplo. |
| `'manual'` | `inputSchema` | **Un JSON Schema literal** con `{type, properties, required, ...}`. |

**El trap:** mucha gente (y muchos builders LLM-generated) usan `schemaType: 'fromJson'` y le pasan un JSON Schema literal al `jsonSchemaExample`. Eso es INCORRECTO. El LLM ve el schema en el prompt como si fuera el output deseado y devuelve el schema literalmente:

```json
{
  "type": "object",
  "properties": {
    "captured_data": {
      "type": "object",
      "properties": { ... }
    }
  }
}
```

El parser falla porque ese output NO matchea la estructura esperada → el nodo emite por error-output (slot 1 si tiene `onError: continueErrorOutput`) o tira error.

## Patterns bugged + sus fixes

### Bug típico — fromJson + schema literal

```javascript
// JSON del workflow
{
  type: '@n8n/n8n-nodes-langchain.informationExtractor',
  typeVersion: 1.2,
  parameters: {
    schemaType: 'fromJson',  // ❌
    jsonSchemaExample: "={{ JSON.stringify($('Schema Builder').first().json.schema) }}",
    //                       ^^^ produce JSON Schema ({type, properties, ...})
    //                       fromJson lo trata como "ejemplo del output" → LLM confundido
  },
}
```

### Fix A — usar `manual` con `inputSchema`

```javascript
{
  type: '@n8n/n8n-nodes-langchain.informationExtractor',
  typeVersion: 1.2,
  parameters: {
    schemaType: 'manual',  // ✅
    inputSchema: "={{ JSON.stringify($('Schema Builder').first().json.schema) }}",
    //                ^^^ JSON Schema literal, AHORA SE INTERPRETA CORRECTO
  },
}
```

### Fix B — mantener `fromJson` pero pasar un OBJETO EJEMPLO

Si querés flexibilidad de tipos inferidos por Zod:

```javascript
{
  parameters: {
    schemaType: 'fromJson',
    jsonSchemaExample: JSON.stringify({
      // Ejemplo concreto del output esperado:
      captured_data: { nombre: "Carlos", phone: "8888-8888" },
      stage_change: "contactado",
      qualified: "unknown",
      tags_to_add: ["ejemplo-tag"],  // ← array NO vacío para que Zod infiera type
      should_assign: false,
      note_to_write: "",
      handoff_reason: "none"
    })
  }
}
```

**Trade-off:** `fromJson` con ejemplo pierde la validación de `enum` (Zod infiere `string`, no `enum`). El `manual` con JSON Schema preserva enums + `required` + min/max + format checks. **Para schemas dinámicos por agency (con enums variables), siempre `manual`.**

## Cómo verificar cuál usar

| Tu situación | Modo recomendado |
|---|---|
| Schema dinámico por agency/tenant (enums variables) | `manual` + `inputSchema` |
| Schema estático con 3-4 campos simples | `fromJson` + objeto inline |
| Necesitás validación de enum estricta | `manual` |
| Necesitás `required` fields enforced | `manual` |
| Solo querés inferir tipos básicos (string, number, bool) | `fromJson` |
| Tu schema viene de un Code Node que produce `{type, properties, ...}` | `manual` (es JSON Schema, no ejemplo) |

## Síntomas de bug en runtime

El nodo `informationExtractor` con bug típicamente:

1. **Sale por error-output (slot 1)** con error tipo:
   ```
   Failed to parse. Text: "{
     "type": "object",
     "properties": { ... }
   }"
   ```
2. **Items downstream = 0** (la cascada termina sin acción).
3. **Audit log no captura `extractor_output_json`** (porque nunca llegó al Validate node).

Si ves el output del LLM siendo **el schema mismo en formato string**, es 100% el bug del schemaType.

## Anti-patterns (NO hacer)

- ❌ **`schemaType: 'fromJson'` con `JSON.stringify($('NodeQueProduceSchema').first().json.schema)`**. Es la combinación que rompe.
- ❌ **Hardcodear el schema en el nodo con `fromJson`**. Para schemas estáticos use objeto ejemplo, no schema literal.
- ❌ **Asumir que `fromJson` y `manual` son intercambiables**. Esperan distinto contenido.
- ❌ **Ignorar el output del error-output del Information Extractor**. Si está cayendo ahí siempre, hay bug en el schema setup.

## Detección preventiva

Antes de deploy, validar el setup:

```javascript
const extractors = workflow.nodes.filter(n => 
  n.type === '@n8n/n8n-nodes-langchain.informationExtractor'
);
for (const n of extractors) {
  const st = n.parameters.schemaType;
  const example = n.parameters.jsonSchemaExample || '';
  
  if (st === 'fromJson' && example.includes('"type"') && example.includes('"properties"')) {
    console.warn(`Extractor "${n.name}": fromJson con schema literal — probable bug.`);
  }
}
```

## Cómo se invoca en sesión

El founder NO escribe `/n8n-information-extractor-schema-mode`. Detectar proactivamente cuando:

- Estás diseñando un workflow con Information Extractor.
- El extractor está fallando con output extraño (el LLM devuelve schema literal).
- Estás reviewing código que produce JSON Schema dinámico y lo conecta al extractor.
- El audit log muestra que el extractor siempre cae al error-output.

Aplicar el fix automáticamente si detectás la combinación `fromJson + schema literal`.

## Caso real: bot-c-v1 (2026-06-01)

**Síntoma:** `Information Extractor C` salía por output[1] (error) cada vez. `Catch Extractor Fail` corría con `output: 0 items` y NO actualizaba `bot_turns.status='partial'`. `Cerrar Trace de Turno` nunca corría.

**Diagnóstico:** inspect del execution log mostró:
```
Failed to parse. Text: "{
  "type": "object",
  "properties": {
    "type": "response",
    "properties": {
      "captured_data": {
        ...
```

El LLM (`gpt-4o-mini`) devolvió **el schema literal** como output. El Code Node `Construir Schema Extractor` producía un JSON Schema correcto, pero estaba conectado al campo `jsonSchemaExample` (de `fromJson`) que espera **un ejemplo**, no el schema.

**Fix:** `schemaType: 'fromJson'` → `'manual'` + `jsonSchemaExample` → `inputSchema` (mismo expression).

**Resultado:** después del fix, en el siguiente test el extractor devolvió:
```json
{
  "captured_data": {
    "intencion": "buscar ayuda",
    "proximo_paso": "agendar una llamada de evaluación",
    "resumen": "El lead no ha tomado terapia aún."
  },
  "stage_change": "none",
  "qualified": "unknown",
  "tags_to_add": [],
  ...
}
```

JSON estructurado correcto. Validar Extractor + Switches + 4 HTTPs corrieron exitosos.

[[n8n-merge-combineall-trap]] — bug relacionado en el mismo workflow (los Merges también estaban mal).
[[n8n-workflow-build-script]] — cómo automatizar la verificación de schemaType en builds.
