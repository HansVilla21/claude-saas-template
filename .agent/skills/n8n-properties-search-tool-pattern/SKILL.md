# Skill: N8N LangChain Tool HTTP con $fromAI() (search tool desde LLM agent)

## Cuándo usar esta skill

- Tu workflow N8N tiene un nodo `@n8n/n8n-nodes-langchain.agent` (LLM agent) que debe consultar una **fuente externa de datos** (DB de propiedades, catálogo, knowledge base, API interna).
- Querés que el LLM decida los parámetros de búsqueda (precio, zona, tipo, código específico) y los pase a un HTTP endpoint que ejecuta la query real.
- Necesitás que la conexión sea Tool-style (el LLM decide cuándo invocar la tool) — no llamada determinística desde el flow.
- Tu backend de search es una Supabase Edge Function (o cualquier HTTP endpoint que reciba JSON).

## Por qué existe esta skill

Antes de tools en LangChain, el patrón era:
- Nodo "Clasificador" (LLM) → extrae params del mensaje del lead
- Nodo "Búsqueda" (postgres / HTTP) → ejecuta query con esos params
- Nodo "Agente" (LLM) → responde con los resultados

Problema: el clasificador era frágil. Cuando re-trabajamos a single-agent con tools (Casa CRM v3 → v5), el LLM agente **decide solo** cuándo buscar y con qué params. Más simple, más robusto, menos nodos.

El patrón se llama `@n8n/n8n-nodes-langchain.toolHttpRequest` + `$fromAI()` para que el LLM rellene los args.

## Proceso

### 1. Diseñar el endpoint backend (multi-pass fallback)

Tu edge function de search debe soportar:
- Búsqueda por código específico (lead pide "CR-2031")
- Búsqueda por filtros (precio, zona, tipo, dormitorios)
- Multi-pass fallback: si el filtro estricto no devuelve nada, relajar progresivamente y avisar al LLM qué se relajó

```typescript
// supabase/functions/properties-search/index.ts (Casa CRM, v1.5)
const { codigo, agency_id, tipo, operacion, zona, precio_min, precio_max, dormitorios_min, limit } = body;

let propiedades = [];
let relajaciones_aplicadas = [];

// Pass 1: query exacta
propiedades = await searchExact({ tipo, zona, precio_min, precio_max, dormitorios_min });
if (propiedades.length > 0) {
  return respondWith(propiedades, [], { ...filtros, fallback_applied: false });
}

// Pass 2: relajar precio (+/-20%)
propiedades = await searchExact({ tipo, zona, precio_min: precio_min * 0.8, precio_max: precio_max * 1.2 });
if (propiedades.length > 0) {
  relajaciones_aplicadas.push('precio');
  return respondWith(propiedades, relajaciones_aplicadas, { ...filtros, fallback_applied: true, fallback_reason: 'precio_relajado' });
}

// Pass 3: ignorar tipo
propiedades = await searchExact({ zona, precio_min, precio_max });
if (propiedades.length > 0) {
  relajaciones_aplicadas.push('tipo');
  return respondWith(...);
}

// Pass 4: zona expandida (GAM → 4 provincias)
const zonasExpandidas = expandZone(zona);
propiedades = await searchExact({ zona: zonasExpandidas });
// ...

return respondWith(propiedades, relajaciones_aplicadas, { ... });
```

Response shape:
```typescript
{
  total: number,
  relajaciones_aplicadas: string[],
  filtros_aplicados: { tipo, zona_tokens_expandidos, precio_min, precio_max, ... },
  fallback_applied: boolean,
  fallback_reason: string | null,
  propiedades: PropertyCard[],
}
```

### 2. Crear el Tool HTTP node en N8N

```json
{
  "name": "Supabase Properties Tool",
  "type": "@n8n/n8n-nodes-langchain.toolHttpRequest",
  "parameters": {
    "toolDescription": "Busca propiedades inmobiliarias en la base de datos. Usar SOLO cuando el lead pregunta por opciones específicas (tipo, zona, precio, código). NO usar para info genérica.",
    "method": "POST",
    "url": "https://<project>.supabase.co/functions/v1/properties-search?secret=<INTERNAL_SECRET>",
    "sendBody": true,
    "specifyBody": "json",
    "jsonBody": "={{ JSON.stringify({\n  agency_id: $('Resolve Agency').first().json.agency_id,\n  codigo: $fromAI('codigo', 'Codigo especifico de propiedad si el lead lo menciona, ej CR-2031', 'string'),\n  tipo: $fromAI('tipo', 'Tipo de propiedad: casa, apartamento, villa, lote, local_comercial, oficina', 'string'),\n  operacion: $fromAI('operacion', 'venta o alquiler', 'string'),\n  zona: $fromAI('zona', 'Zona o canton: Escazu, Santa Ana, Heredia, GAM, etc.', 'string'),\n  precio_max: $fromAI('precio_max', 'Precio maximo en USD que el lead mencionó', 'number'),\n  dormitorios_min: $fromAI('dormitorios_min', 'Numero minimo de dormitorios', 'number'),\n  limit: 5\n}) }}"
  }
}
```

**Reglas del `toolDescription`:**
- Imperativo: "Busca X cuando Y"
- Decir explícito CUÁNDO usar Y CUÁNDO NO
- El LLM lee esto para decidir invocarla. Si es vago, la invoca de más o de menos.

**Reglas del `$fromAI()`:**
- 3 args: `(nombre, descripcion, tipo)`
- `nombre`: en snake_case, matchea el campo del JSON body
- `descripcion`: lo que el LLM lee para entender qué inferir. Ser específico (incluir ejemplos).
- `tipo`: `'string'`, `'number'`, `'boolean'`. El LLM lo respeta.
- Si el lead NO mencionó el campo, el LLM lo deja undefined/null — el endpoint debe tolerarlo.

### 3. Conectar el Tool al Agent

En el nodo `@n8n/n8n-nodes-langchain.agent`, el sub-input "Tool" se conecta al output del Tool HTTP node. El LLM ahora puede invocarlo cuando "decida" (basado en `toolDescription`).

### 4. Prompt del Agent que entiende los resultados

```markdown
## TOOL: properties-search

Tenés acceso a la tool `Supabase Properties Tool`. Usala SOLO cuando:
- El lead pide opciones (X propiedades en Y zona)
- El lead menciona un código específico (CR-XXXX)
- Querés validar disponibilidad antes de mencionar una propiedad

NO la uses para:
- Info genérica del mercado (precios promedio, etc.)
- Preguntas conversacionales sin búsqueda concreta

### Cómo interpretar la respuesta

Si `relajaciones_aplicadas` está vacío y hay propiedades:
  → match exacto, presentá 1-3 opciones top

Si `relajaciones_aplicadas` tiene `'precio'`:
  → no hay match en el rango exacto, presentá la opción más cercana y avisá al lead

Si `relajaciones_aplicadas` tiene `'tipo'`:
  → no hay del tipo pedido, ofrecé el tipo más parecido en la zona

Si `relajaciones_aplicadas` tiene `'zona'`:
  → expandiste a zonas vecinas, avisar al lead

Si `propiedades` está vacío incluso con todos los fallbacks:
  → ofrecé tomar datos del lead para avisarle cuando aparezca algo
```

### 5. Casos edge a manejar en el prompt

| Resultado | Respuesta del bot |
|---|---|
| Match exacto, 3 opciones | "Te muestro 3 opciones top: ..." con marker `[IMG:CR-XXXX]` en la primera |
| Match con precio relajado | "En tu rango exacto no tengo, pero esto está cerca: ..." |
| Match con tipo relajado | "No tengo casas en esa zona pero sí apartamentos similares: ..." |
| 0 resultados | "Por ahora no tengo nada que matchee. ¿Querés que te avise cuando aparezca?" |
| `agency_id` no resuelto | NO invocar la tool (validar antes en el prompt) |

## Output esperado

1. Edge function de search desplegada con multi-pass fallback
2. Tool HTTP node en n8n con `$fromAI()` params bien descritos
3. Tool conectada al Agent LLM
4. Prompt del Agent que interpreta `relajaciones_aplicadas` correctamente
5. Test: lead pide "casa en Escazú $250K" con 0 matches exactos → bot ofrece alternativa relajada con disclaimer

## Ejemplo concreto (Casa CRM, en producción 2026-05-21)

- Edge function: [supabase/functions/properties-search/index.ts](supabase/functions/properties-search/index.ts) v1.5
- Multi-pass: exacto → precio relajado → tipo relajado → zona expandida
- Zona expansion: GAM → ['san jose', 'heredia', 'alajuela', 'cartago']
- Variants de acento: san jose ↔ san josé, escazu ↔ escazú
- Tool: nodo "Supabase Properties Tool" en workflow Sofia v5+, conectado a `Agente Principal - Sofia`
- Params via `$fromAI()`: codigo, tipo, operacion, zona, precio_min, precio_max, dormitorios_min, limit
- Resultado: lead pide "qué tenés en Escazú hasta $250K" → tool retorna 16 propiedades (con relajaciones_aplicadas vacío porque hay matches) → Sofia presenta top 3 con marker para foto.

## Gotchas / antipattern

- **NO** usar variables del flow (`$('Variables').first().json.X`) para campos que debe rellenar el LLM. Solo para campos fijos del contexto (agency_id, conversation_id).
- **NO** dejar `$fromAI()` con descripción vaga. "código" es peor que "código de propiedad como CR-2031 si el lead lo menciona explícitamente, si no dejar vacío".
- **NO** olvidar manejar `propiedades = []` en el prompt. Si el LLM no sabe qué decir cuando hay 0 resultados, improvisa mal ("no tengo propiedades en este momento" suena a queja).
- **NO** mezclar lógica de validación de input en el LLM. Validá en el endpoint (precio max razonable, zona de un enum válido, etc.) — el LLM puede inferir cualquier cosa.
- **NO** retornar 50+ propiedades a la tool. Cap en 5-10. El LLM se confunde con listas largas y aluciona códigos.
- **NO** dejar `agency_id` rellenado por `$fromAI()`. Eso lo provee el flow desde Resolve Agency. El LLM no debe inventar agency IDs.

## Skills relacionadas

- `supabase-edge-function-secret-auth` — patrón de auth de la edge function llamada
- `bot-llm-marker-expand-pattern` — cómo el bot pide foto de la propiedad que la tool retornó
- `n8n-pipeline-rapido-vs-pesado` — cambios a la tool (description, params) son cambios rápidos; cambios al edge function backend pueden ser pesados
- `sales-framework-spsp-whatsapp` — cómo el LLM decide INVOCAR la tool (señales de active shopper, no para info-only)
