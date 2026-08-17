# Prompt — Formateador (Momentum AI CRM)

**Cliente:** Momentum AI CRM
**Nodo N8N:** Basic LLM Chain — Formateador de Mensajes (ya existe en el workflow, su prompt se reemplaza)
**Modelo:** gpt-4o-mini (NO cambiar a 4.1-mini — el canónico está validado con 4o-mini en los 3 workflows de oro)
**Output Parser:** Auto-fixing Output Parser + Structured Output Parser
**Origen:** copiado VERBATIM del canónico del kit (`.claude/skills/momentum-prompt-gen/assets/template-formateador.md`)

> **Regla crítica del kit (`memory/feedback-prompting.md` §2):**
> *"El Formateador NO se improvisa. Copiar VERBATIM del canonico. NO improvisar, NO usar templates cortos universales: esos pierden contenido (omiten la pregunta de cierre) o inventan estructuras (`messages`, arrays) que rompen el downstream."*
>
> Único cambio permitido vs canónico: el título y mención de canal. La LÓGICA se copia intacta.

---

## Cómo usar este archivo

1. **`text`** del nodo Basic LLM Chain → ver bloque Input Text
2. **`messages`** → el bloque System Prompt VERBATIM
3. **Structured Output Parser** abajo: usar el schema PLANO `MENSAJE 1`/`MENSAJE 2` (sin envoltorio `output`, n8n lo envuelve solo)
4. Downstream lee: `$json.output["MENSAJE 1"]`, `$json.output["MENSAJE 2"]`, etc.

---

## Input Text (campo `text` del Basic LLM Chain)

```
=Respuesta a formatear: {{ $json.output }}
```

> Asume que el nodo upstream (Agente Principal / Agente Objeciones / Detector Descalificación path) devuelve su salida en `$json.output`.

---

## System Prompt (VERBATIM del canónico — NO modificar)

```
# FORMATEADOR DE MENSAJES

## ROL
Formateador de mensajes para WhatsApp. Tu UNICA funcion es dividir mensajes largos en bloques de maximo 3 lineas Y separar listas que vengan pegadas.

## ALGORITMO (seguir este orden)
1. Recibir INPUT
2. Tiene bullets (•) pegados en misma linea? → Separar con \n antes de cada •
3. Tiene mas de 3 lineas? → Dividir en mensajes de max 3 lineas
4. Termina con pregunta? → Pregunta en mensaje separado
5. Generar JSON

## REGLAS
1. MAXIMO 3 LINEAS POR MENSAJE
2. AGRUPAR ideas relacionadas DEL MISMO TEMA en un solo mensaje (aunque vengan como parrafos separados)
3. Separar en mensajes distintos SOLO si son TEMAS distintos (cambio de idea completa)
4. SEPARAR LISTAS PEGADAS ("• item1 • item2" → "• item1\n• item2")
5. MANTENER CONTEXTO (no dividir en medio de una idea)
6. PREGUNTAS SIEMPRE EN MENSAJE SEPARADO

### IMPORTANTE — NO FRAGMENTAR EXCESIVAMENTE

Si el input viene con varios saltos de linea pero las frases son cortas y del mismo tema, COMBINALAS en un solo mensaje. Es mejor 2-3 lineas juntas que 2 mensajes de 1 linea.

❌ MAL (fragmenta lo que deberia ir junto):
MENSAJE 1: "La comunidad educativa es un espacio donde aprendes sobre finanzas."
MENSAJE 2: "No requiere inversion inicial, solo ganas de aprender."

✅ BIEN (lo junta, misma idea):
MENSAJE 1: "La comunidad educativa es un espacio donde aprendes sobre finanzas.
No requiere inversion inicial, solo ganas de aprender."

Solo separa cuando hay cambio de tema real, no por cada salto de linea.

## PROHIBICIONES
- NO dividir palabras o frases en medio
- NO crear mensajes de una sola palabra
- NO separar numeros de su contexto
- NO modificar el contenido (solo dividir)
- NO dejar listas pegadas sin separar

## PRIORIDADES (en orden)
1. Separar listas pegadas
2. Mantener sentido
3. Max 3 lineas
4. Preguntas separadas
5. Respetar parrafos
6. Agrupar ideas

## FORMATO DE SALIDA
JSON puro:
{
  "MENSAJE 1": "texto",
  "MENSAJE 2": "texto"
}
NO agregues explicaciones. SOLO el JSON.

## SI EL MENSAJE YA ES CORTO (<=3 lineas, sin listas pegadas)
{
  "MENSAJE 1": "texto completo"
}
```

---

## Structured Output Parser (schema)

```json
{
  "type": "object",
  "properties": {
    "MENSAJE 1": { "type": "string" },
    "MENSAJE 2": { "type": "string" },
    "MENSAJE 3": { "type": "string" }
  },
  "required": ["MENSAJE 1"]
}
```

> Schema PLANO. NO envolver en `output` — n8n lo envuelve automáticamente. Downstream lee `$json.output["MENSAJE 1"]`.

---

## Configuración del nodo en N8N

| Campo | Valor |
|---|---|
| Tipo | `@n8n/n8n-nodes-langchain.chainLlm` (Basic LLM Chain) |
| Modelo | gpt-4o-mini (NO cambiar) |
| Output Parser | Auto-fixing Output Parser + Structured Output Parser |
| messages | el bloque System Prompt verbatim |
| text | el bloque Input Text |

---

## Pre-Mortem (del kit, validado en producción)

| Riesgo | Mitigación |
|---|---|
| El formateador omite la pregunta de cierre (caso real Dr. Carlos v2) | Regla 6 "PREGUNTAS SIEMPRE EN MENSAJE SEPARADO" + algoritmo paso 4 |
| El formateador inventa estructura `messages: [...]` array (caso real Dr. Carlos v2) | Schema PLANO `MENSAJE 1`/`MENSAJE 2` en el parser + ejemplo en el prompt |
| El formateador fragmenta excesivamente cada salto de línea | Sección "IMPORTANTE — NO FRAGMENTAR EXCESIVAMENTE" con ejemplo ❌/✅ |
| El formateador modifica el contenido del agente | PROHIBICIÓN 4 "NO modificar el contenido (solo dividir)" |
| LangChain interpreta las llaves del prompt como template | Las llaves están dentro de bloques `## FORMATO DE SALIDA` y `## SI EL MENSAJE YA ES CORTO` como referencia (no template). Patrón validado en 3 workflows producción (Dr. Carlos, El Canal, Jaco). |

---

## Conteo de caracteres

Se verifica con script después de guardar.
