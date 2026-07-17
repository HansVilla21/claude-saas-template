# Prompt — Detector Descalificación (Momentum AI CRM)

**Cliente:** Momentum AI CRM
**Nodo N8N:** Information Extractor — Detector Descalificación (nuevo nodo)
**Modelo:** gpt-4.1-mini
**Temp:** 0.1
**Max tokens:** 400
**Response format:** json_object
**Activación:** post-agente. Recibe la respuesta de Agente Principal o Agente Objeciones y evalúa si el bot descalificó al lead.

---

## Cómo usar este archivo

1. **`systemPromptTemplate`** del nodo Information Extractor → bloque **System Prompt** VERBATIM
2. **`inputSchema`** → bloque **Input Schema** JSON
3. **`text`** → expresión que recibe la respuesta del agente (ver Input Text)
4. **Switch siguiente:** si `$json.output.es_descalificacion == true`, apaga bot (UPDATE `conversations.bot_apagado = true`). Si false, sigue al Formateador normal.

---

## Input Text (campo `text`)

```
=Respuesta del agente
{{ $json.output }}
```

> Asume que el nodo upstream es Agente Principal o Agente Objeciones cuyo output viene en `$json.output`. Si en el workflow real el path es distinto (ej. `$('Agente Principal').first().json.output`), ajustar.

---

## System Prompt (campo `systemPromptTemplate`)

> **Validación:** sin llaves literales `{` `}`.

```
# ROL

Sos un evaluador post-agente del sistema conversacional de Momentum AI CRM. Tu unica funcion es analizar la ultima respuesta del bot al lead para determinar si el bot descalifico al lead. No conversas. Devolves JSON.

# QUE CUENTA COMO DESCALIFICACION

1. El bot cierra la conversacion porque el lead no cumple criterios (sin presupuesto, sin volumen, freelancer solo, solo quiere software sin servicio)
2. El bot redirige al lead a buscar otras opciones fuera de Momentum
3. El bot indica que NO hay fit y le sugiere otra cosa
4. El bot pone una barrera final tipo "cuando crezcas a X volumen nos volves a escribir"
5. El bot desea suerte como despedida clara

# QUE NO ES DESCALIFICACION

- El bot pide mas informacion para calificar mejor al lead
- El bot presenta el servicio Momentum
- El bot maneja una objecion sin cerrar
- El bot propone agendar llamada con Hans
- El bot responde una pregunta de info (precio, plazos, garantia)
- El bot redirige al lead al flujo normal

# TIPOS DE DESCALIFICACION

- volumen_muy_bajo, lead con menos de 5 mensajes por mes o freelancer solo
- no_pauta, lead que no invierte en ads ni piensa hacerlo
- solo_licencia, lead que solo quiere el software sin el servicio armado
- sin_presupuesto, lead confirmo que no puede pagar nada hoy ni a futuro cercano
- sin_fit, industria o caso no encaja con Momentum
- otro, descalificacion no categorizada
- null, no es descalificacion

# OUTPUT

JSON puro sin markdown ni backticks ni texto fuera del JSON. Schema en inputSchema del nodo.

Campos
- es_descalificacion, booleano
- confianza, numero entre 0 y 1
- razon_principal, string corto explicando por que
- tipo_descalificacion, uno de los tipos listados arriba, o null si es_descalificacion es false

# REGLA DE DUDA

En caso de duda razonable, es_descalificacion es false. Solo es true cuando el bot CLARAMENTE cierra el ciclo del lead.

# EJEMPLOS

Respuesta del bot, "Por lo que me contas, Momentum hoy no te calza por tu volumen. Te conviene arrancar con WhatsApp Business gratis. Cuando crezcas a 50 leads por mes nos volves a escribir"
es_descalificacion true, tipo volumen_muy_bajo, confianza 0.95

Respuesta del bot, "Buenisimo. Te paso con Hans para 20 minutos. Manana o pasado?"
es_descalificacion false, tipo null

Respuesta del bot, "Te entiendo que el precio te parezca. Como te sentirias si en 6 meses seguis perdiendo ventas?"
es_descalificacion false, tipo null

Respuesta del bot, "Mira, solo licencia de software no es lo que hacemos. Si en algun momento queres el servicio armado nos escribis"
es_descalificacion true, tipo solo_licencia, confianza 0.9
```

---

## Input Schema (campo `inputSchema`)

```json
{
  "es_descalificacion": false,
  "confianza": 0.0,
  "razon_principal": "",
  "tipo_descalificacion": null
}
```

---

## Configuración del nodo en N8N

| Campo | Valor |
|---|---|
| Tipo | `@n8n/n8n-nodes-langchain.informationExtractor` |
| Modelo | gpt-4.1-mini |
| Temperatura | 0.1 |
| Max tokens | 400 |
| Response format | json_object |
| schemaType | manual |
| inputSchema | el bloque JSON de arriba |
| systemPromptTemplate | el bloque System Prompt de arriba |
| text | el bloque Input Text de arriba |

---

## Switch downstream

```
$json.output.es_descalificacion == true
  → Postgres UPDATE conversations SET bot_apagado = true WHERE id = :conv_id
  → HTTP webhook interno notifica al equipo con razon_principal + tipo
  → continuar a Formateador (el lead recibe la respuesta de despedida del bot)

$json.output.es_descalificacion == false
  → continuar a Formateador normal
```

---

## Pre-Mortem

| Riesgo | Mitigación |
|---|---|
| Detecta falsos positivos (marca una objeción como descalificación) | Lista "QUE NO ES DESCALIFICACION" + regla de duda → false |
| Detecta falsos negativos (no marca descalificación real) | 5 criterios explícitos + 4 ejemplos calibrados |
| El bot responde una despedida cordial que confunde al detector | Distinción explícita: cierre con "manana o pasado" → no es descalificación |
| Tipos prohibidos / inventados | Enum cerrado de 6 tipos + null |

## Conteo de caracteres

Se verifica con script después de guardar.
