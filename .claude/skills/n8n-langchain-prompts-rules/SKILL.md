# Skill: Reglas de prompts para nodos LangChain en n8n

## Cuándo usar esta skill

- Estás escribiendo o modificando el `systemPromptTemplate` de un nodo LangChain en n8n.
- El nodo devuelve output vacío (`[]` o `[{}]`) sin error claro y no entendés por qué.
- El nodo tira `"Single '}' in template."` o similar.
- Querés evitar que tu próximo prompt rompa silenciosamente.

## Aplica a estos nodos

- `@n8n/n8n-nodes-langchain.informationExtractor`
- `@n8n/n8n-nodes-langchain.chainLlm` (Basic LLM Chain)
- `@n8n/n8n-nodes-langchain.agent` (AI Agent — en el campo `systemMessage`)
- Cualquier otro nodo LangChain con campo de prompt template

## La regla número 1: NO LLAVES LITERALES

**Las llaves `{` y `}` en el prompt son interpretadas por LangChain como variables de template Python `str.format()`.**

Si tu prompt tiene:
```
{ "MENSAJE 1": "texto" }
```

LangChain ve `{ "MENSAJE 1": "texto" }` y trata de matchear `"MENSAJE 1"` (entre comillas, con espacio) como nombre de variable. No lo encuentra → falla silenciosa → el nodo devuelve output vacío.

### Síntomas

- Output del nodo: `[{}]` o `[]`
- Sin error rojo en n8n (el nodo "ejecuta" exitosamente, solo no produce nada útil)
- A veces: `"Single '}' in template."`
- Downstream rompe porque `{{ $json.output }}` es `undefined`

### Por qué pasa silencioso

LangChain captura el error de template y devuelve "no resultado" en vez de propagar la excepción. n8n marca el nodo como ✓ exitoso porque técnicamente no hubo crash.

## Cómo escribir prompts seguros

### ❌ Lo que NO funciona

```markdown
## Ejemplos
INPUT: "Hola"
OUTPUT:
{
  "MENSAJE 1": "Hola"
}

INPUT: "Para 10 personas"
OUTPUT:
{
  "MENSAJE 1": "Para 10 personas, te recomiendo Zen Villa 1",
  "MENSAJE 2": "Mirá la info: ..."
}
```

12+ pares de llaves en el prompt → garantía de output vacío.

### ✅ Lo que SÍ funciona

**Opción A: describir en prosa**

```markdown
## Formato de salida

JSON puro con keys MENSAJE 1, MENSAJE 2, etc. El schema esperado está
definido en el inputSchema del nodo.

## Ejemplos en prosa

- Input "Hola" → un solo mensaje MENSAJE 1 con el contenido completo.
- Input "Para 10 personas..." → MENSAJE 1 con la frase principal,
  MENSAJE 2 con la pregunta de cierre.
```

**Opción B: tabla con los campos**

```markdown
## Campos del output

| Key | Tipo | Descripción |
|-----|------|-------------|
| MENSAJE 1 | string | Primer mensaje, máximo 3 líneas |
| MENSAJE 2 | string | Segundo mensaje, opcional |
| MENSAJE 3 | string | Tercer mensaje, opcional |
```

**Opción C: máximo 1-2 ejemplos breves en un solo bloque**

Si necesitás mostrar el formato JSON literalmente, hacelo UNA vez:

```markdown
## Formato de salida

```json
{
  "MENSAJE 1": "texto"
}
```

NO repetir más ejemplos con llaves. Las llaves de arriba son las únicas
permitidas.
```

Sofia v5 (referencia validada en producción) tiene exactamente este patrón: 2 pares de llaves total en todo el prompt.

## El schema completo va en `inputSchema` del nodo

Los nodos LangChain tienen un campo SEPARADO llamado `inputSchema` (o `schema` según versión) donde sí podés poner JSON con todas las llaves que quieras. **Ese campo NO se parsea como template** — es un schema literal.

Ejemplo de configuración del nodo Information Extractor:

```json
{
  "parameters": {
    "text": "=Analiza: {{ $json.mensaje }}",
    "schemaType": "manual",
    "inputSchema": "{\n  \"tipo\": \"consulta_valida\",\n  \"debe_continuar\": true,\n  \"razon\": \"...\"\n}",
    "options": {
      "systemPromptTemplate": "Sos un clasificador. Analizá el mensaje y devolvé JSON con tipo, debe_continuar, razon. Schema en inputSchema."
    }
  }
}
```

- **`systemPromptTemplate`**: prosa, sin llaves.
- **`inputSchema`**: JSON literal con la estructura del output esperado.

LangChain combina ambos: usa el prompt para guiar al LLM, y el schema para validar el output. **Las llaves del inputSchema NO rompen** porque es un campo distinto al template.

## Otros caracteres problemáticos (menos críticos)

Aunque las llaves son el problema principal, también vigilar:

| Carácter | Riesgo | Mitigación |
|---|---|---|
| `{` `}` | **ALTO** — interpretado como variable | Eliminar de prosa, escapar a `{{` `}}` si es necesario |
| `${...}` | BAJO — algunos parsers lo interpretan | Evitar en ejemplos de código |
| Backticks ` `` ` | NINGUNO en LangChain | OK usar libremente para code blocks |
| Newlines `\n` literal | NINGUNO | OK |

## Validación antes de pegar el prompt

Antes de subir un prompt a un nodo LangChain, contar llaves:

```python
prompt = open('formateador.md').read()
print(f"Llaves abiertas: {prompt.count('{')}")
print(f"Llaves cerradas: {prompt.count('}')}")
# Si suma > 4, revisar para reducir
```

**Threshold práctico:** máximo 4 llaves totales en un prompt (2 pares, ambos en un solo bloque `## FORMATO DE SALIDA`). Si pasa de ahí, refactorizar.

## Patrón validado: cuando el prompt SÍ tiene que mostrar JSON

Si tu caso de uso es genuino "este nodo devuelve JSON y necesito mostrarle al LLM el formato", el patrón es:

```markdown
## Tu output

Devolvé un JSON con las siguientes keys:

- `destino` (string): "AGENTE_PRINCIPAL" o "HANDOFF_HUMANO"
- `motivo` (string): explicación breve
- `datos_extraidos` (object): contiene nombre, num_personas, etc.

Ejemplo del formato esperado (no del valor concreto):

```json
{
  "destino": "AGENTE_PRINCIPAL",
  "motivo": "texto",
  "datos_extraidos": {"nombre": "..."}
}
```

Respondé ÚNICAMENTE con JSON puro, sin markdown.
```

**1 par de llaves nested = 2 abiertas + 2 cerradas = 4 totales.** Está OK.

Si necesitás otro ejemplo, escribilo en prosa: "Para input 'Hola', el destino sería AGENTE_PRINCIPAL con motivo 'saludo inicial sin contexto previo'."

## Cómo migrar un prompt viejo con llaves

Si heredás un prompt lleno de ejemplos JSON inline (típico de prompts hechos por ChatGPT/Claude sin esta restricción en mente), refactorizalo:

1. **Sacar todos los bloques `OUTPUT: { ... }`** de los ejemplos.
2. **Mantener solo 1 bloque `## FORMATO DE SALIDA` al final** con un ejemplo mínimo.
3. **Convertir los ejemplos a prosa**: "Para input X, devolvé tipo Y con razon Z".
4. **Mover el schema completo al campo `inputSchema`** del nodo.

Antes: 12 llaves dispersas, output vacío.
Después: 2-4 llaves contenidas, output funciona.

## Caso real: formateador de Jacó

**v2 (rompía):** 24 llaves dispersas en 8+ ejemplos `INPUT: ... OUTPUT: {...}`. 9,500 chars. Output vacío silencioso.

**v3 (funciona):** 4 llaves total (un solo bloque `## FORMATO DE SALIDA`). 2,800 chars. Output correcto.

Sin perder ninguna instrucción importante — solo refactor del formato.

## Verificación post-cambio

Después de actualizar un prompt en un nodo LangChain, **siempre testear con datos reales**:

1. Ejecutar el workflow desde el nodo (o trigger manual).
2. Ver el output del nodo en n8n.
3. Si es `[]` o `[{}]` → llaves dispersas, revisar.
4. Si es la estructura esperada → funciona.

## Referencias

- Memoria: `feedback_n8n_no_curly_braces_in_extractor.md`
- Errores comunes: `chatbot-manychat-supabase-multicanal/docs/03-errores-comunes-y-fixes.md` (E01)
- Skill madre: `chatbot-manychat-supabase-multicanal`
