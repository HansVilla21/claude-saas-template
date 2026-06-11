---
name: langchain-agent-prompt-design
description: Guía operativa para diseñar system prompts de agentes LangChain (nodo Agent de N8N, OpenAI Agents, Anthropic Claude). Cubre cuándo aplicar CO-STAR vs TIDD-EC vs ambos, template base de 10 bloques, cómo calibrar few-shot con ejemplos reales del dominio, el método Pre-Mortem antes de entregar, y los anti-patterns típicos (reglas vagas, frases prohibidas mal definidas, contextos contradictorios). La usa el agente `langchain-prompt-designer` y cualquier humano que quiera diseñar un prompt de agente conversacional sin improvisar. Usar cuando hay que escribir un system prompt nuevo, iterar uno con bug, o auditar uno existente.
---

# LangChain Agent Prompt Design

## Cuándo usar esta skill

- El `langchain-prompt-designer` la consulta como guía operativa
- Cualquier diseño / refactor de system prompt de agente conversacional
- Auditoría de un prompt en producción para detectar reglas vagas / inconsistencias

## Decisión de framework: CO-STAR vs TIDD-EC vs ambos

| Caso | Framework |
|---|---|
| Definir **identidad** del agente (rol, voz, audiencia, formato) | **CO-STAR** |
| Definir **lógica operativa** (qué hace en cada estado, qué NO hace, ejemplos) | **TIDD-EC** |
| Agente conversacional multi-turno con stages / decision tree | **Ambos** — CO-STAR arriba, TIDD-EC abajo |
| Agente single-shot (clasificador, extractor) | TIDD-EC suficiente, CO-STAR mínimo |
| Agente crítico (handoff a humano, decisiones de plata) | **Ambos** + Self-Refine (Pre-Mortem interno antes de responder) |

**Regla:** para cualquier agente que va a tener una conversación de varios turnos con un usuario humano, usás los DOS frameworks. CO-STAR sin TIDD-EC produce agentes "carismáticos pero impredecibles". TIDD-EC sin CO-STAR produce agentes "correctos pero robot".

## Template base — los 10 bloques

```
# CONTEXT (CO-STAR)
Rol del agente, dominio de operación, mercado, canal de comunicación, qué NO es su trabajo (lo más importante: el negativo).

# OBJECTIVE (CO-STAR)
Resultado esperado en N turnos o en M segundos. Métricas implícitas si aplican (ej: "extraer X piezas de información", "decidir entre A y B").

# STYLE (CO-STAR)
Reglas de puntuación, registro lingüístico (formal / casual / dialectal), longitud máxima por mensaje, idioma.

# TONE (CO-STAR)
Personalidad concreta. Mal: "cálido y profesional". Bien: "como una asistente humana experimentada que habla por WhatsApp con un conocido del barrio. NO formal corporativo".

# AUDIENCE (CO-STAR)
Demografía + estado emocional + canal. Mal: "usuarios". Bien: "comprador / inquilino LATAM, 25-50 años, mobile-first, pierde paciencia rápido con cuestionarios largos".

# RESPONSE FORMAT (CO-STAR)
Estructura formal de cada respuesta. Cuántos mensajes, si markdown / texto plano, si listas o párrafos.

# TASK (TIDD-EC)
La lógica operativa central. Para agentes conversacionales, suele ser un sistema de stages (Conexión → Situación → Problema → ...) o un decision tree. Cada stage tiene objetivo + condición de avance.

# INSTRUCTIONS (TIDD-EC)
Las condiciones de avance entre stages, cuándo invocar cada tool, qué hacer en cada estado específico. Detalle granular.

# DO / DON'T (TIDD-EC)
Reglas inviolables numeradas. Cada una con justificación implícita ("regla atada a riesgo Z").

# EXAMPLES (TIDD-EC) — few-shot calibrado
3-5 conversaciones reales (del repo, del founder, de demos) que cubren:
- Happy path
- Edge case 1 (lead empuja a saltar stages)
- Edge case 2 (objeción)
- Failure mode (tool falla / lead frustrado)

# CONSTRAINTS (TIDD-EC)
Restricciones hard: qué nunca improvisa, qué nunca promete, qué nunca declara como bot/IA si no le preguntan.
```

## Few-shot calibrado: la parte más importante

### Cuántos ejemplos

- Mínimo: **3**. Menos calibra a sesgos.
- Óptimo: **5**.
- Más de 7: inflación de tokens sin ganancia marginal.

### Qué tiene que cubrir el set

1. **Happy path** — el lead caliente que pasa por todos los stages limpio
2. **Edge case que rompe la regla obvia** — el lead pide saltar a inventario, el agente lo devuelve al stage actual
3. **Objeción** — lead dice "es muy caro" o "lo pienso", el agente aplica el método de objection-handling sin que se sienta script
4. **Failure mode** — tool falla / lead frustrado / pregunta fuera de scope
5. (Opcional) **Caso atípico del dominio** — ej: lead manda audio en vez de texto, o pregunta algo no técnico fuera de scope

### Reglas sobre los ejemplos

- **NUNCA inventés.** Sacás transcripciones reales del repo, demos del founder, o conversaciones documentadas. Inventar calibra al sesgo del diseñador, no al cliente real.
- **No los hagas perfectos.** Si todos los ejemplos del agente son "elegantes", el modelo se vuelve robot pulido. Algunos pueden tener turnos torpes pero correctos.
- **Cubrí los DON'T también.** Mostrá UN ejemplo donde el agente NO hace lo obvio (no muestra inventario aunque el lead pregunte por casas, no dispara handoff aunque el lead pida visita sin contexto).
- **Formato consistente con la realidad.** Si el canal es WhatsApp, los ejemplos tienen mensajes cortos sin formato; si el canal es email, párrafos completos. No mezclés.

### Estructura de un ejemplo

```
## EJEMPLO N — <nombre descriptivo, ej: "Lead frustrado pide humano">

LEAD: <mensaje>
SOFIA: <respuesta>

LEAD: <mensaje>
SOFIA: <respuesta>
[INVOCA TOOL: properties-search con {...}]
TOOL: <output JSON>
SOFIA: <respuesta basada en la tool>

LEAD: <mensaje final>
SOFIA: <handoff o cierre>
[INVOCA TOOL: request-handoff con {reason: 'manual', summary: '...'}]
```

## Reglas operacionales — anti-patterns que detectás y corregís

| Anti-pattern | Por qué es bug | Cómo arreglar |
|---|---|---|
| "Sé empático" | Aspiracional, no ejecutable | Operacionalizá: "Cuando el lead use palabra emocional (X, Y, Z), tu siguiente mensaje DEBE..." |
| "Si muestra interés concreto" | Subjetivo, dispara falsos positivos | Reescribí como AND de condiciones verificables turn-by-turn |
| "Disparar handoff cuando A O B O C" | OR sueltos → falsos positivos | Convertí en AND o agregá precondiciones ("...Y pasó por stages 2-4") |
| `$fromAI('reason', ...)` sin enum cerrado | LLM inventa valores | Documentá enum: `'qualified' \| 'scheduling' \| 'objection_complex' \| 'manual'` |
| Listado de tools sin "cuándo usar cada una" | El modelo elige por keyword del input | Agregar "INVOCAR tool X CUANDO Y, NO INVOCAR cuando Z" |
| Few-shot demasiado pulido | Modelo se vuelve robot perfecto | Mezclar 1-2 ejemplos con turnos torpes pero correctos |
| Style dice "casual", examples son formales | El modelo sigue los ejemplos, no la regla | Reescribir examples para que matcheen con style |
| "Recordá que..." al final del prompt | Si era importante, va en INSTRUCTIONS | Mover al bloque que corresponde |
| Reglas sin justificación implícita | Imposible auditar / mantener | Cada regla atada a un riesgo concreto |
| Mensaje con múltiples output esperados (texto + tool + nada) | El modelo se vuelve impredecible | Definir UNA salida posible por turno |

## El método Pre-Mortem — obligatorio antes de entregar

Antes de marcar el prompt como listo, simulás MENTALMENTE estos 5 escenarios. Para cada uno: input, output esperado, qué regla del prompt lo guía.

### Plantilla del Pre-Mortem

```markdown
## Pre-Mortem

### Escenario 1 — Happy path
- Input: <mensaje inicial real del dominio>
- Output esperado: <respuesta concreta>
- Por qué el prompt lo guía: <regla X del INSTRUCTIONS / stage Y del TASK>
- Riesgo residual: <ninguno / X>

### Escenario 2 — Lead empuja saltar stages
- Input: <pregunta de "qué tenés" en turno 1>
- Output esperado: <devuelve al stage actual>
- Por qué el prompt lo guía: DO #N
- Riesgo residual: ...

### Escenario 3 — Lead frustrado
- Input: "ya me cansé / quiero hablar con un humano"
- Output esperado: <handoff con reason='manual'>
- Por qué el prompt lo guía: trigger explícito X
- Riesgo residual: ...

### Escenario 4 — Tool falla
- Input: tool devuelve {error: '401' / timeout / vacío}
- Output esperado: <fallback verbal con escalación>
- Por qué el prompt lo guía: CONSTRAINTS #M
- Riesgo residual: ...

### Escenario 5 — Pregunta fuera de scope
- Input: "qué hipoteca me conviene / qué impuestos tengo que pagar"
- Output esperado: <escala a humano, no improvisa>
- Por qué el prompt lo guía: CONSTRAINT explícito
- Riesgo residual: ...

## Riesgos residuales globales
- <cosa que el prompt NO cubre y depende del modelo>
- <cosa que depende del contexto runtime>
```

### Qué hacer cuando un escenario falla el Pre-Mortem

Si simulando el escenario el output esperado NO se deriva claramente de una regla del prompt → tenés que **agregar la regla** antes de entregar. Si la regla ya está pero es vaga → operacionalizarla.

## Auditoría de tono y "frases prohibidas"

Para cualquier agente con voz definida (Sofia es el caso ejemplar), documentás explícitamente:

### Frases prohibidas (con razón)

```
NO USAR:
- "¿en qué te puedo ayudar?" → señal de bot recepcionista
- "estoy aquí para asistirte" → frase robot
- "qué te gustaría que intentemos?" → vago, no avanza la conversación
- "no dudes en avisarme" → cierra sin call to action

USAR EN SU LUGAR:
- "Mirá, ahora lo que necesito saber es ..." → directo, avanza
- "Te paso con Hans para que ..." → escalación clara
- "Antes de tirarte algo, contame ..." → devuelve al stage
```

### Reglas de puntuación / registro (caso Sofia)

```
- NUNCA signo ¿ de apertura
- NO punto final en frases cortas
- NO dos puntos dentro de preguntas
- NO punto y coma
- NO bullets, NO bold, NO guiones largos —
- NO emojis de cara 😊 (sí 🏠 📍 moderado)
- Vos, querés, tenés, andás, podés (registro CR/rioplatense)
```

Cada regla atada a un riesgo: por qué la regla existe. Si no sabés el riesgo que previene, la regla sobra.

## Entrega — formato del archivo

El prompt completo va en `memory/research/<NN>-<slug>-prompt.md` con esta estructura:

```markdown
# <Nombre del agente> — System Prompt

**Versión:** X.Y
**Fecha:** YYYY-MM-DD
**Modelo recomendado:** gpt-4.1 / claude-3-5-sonnet / etc.
**Para nodo:** <nombre del nodo N8N donde se importa>
**Changelog vs anterior:** <si aplica>

---

## 1. SYSTEM PROMPT (copy-paste a N8N)

\`\`\`
# CONTEXT
...

# OBJECTIVE
...

[... los 10 bloques ...]
\`\`\`

## 2. User message template (cómo se pasa el contexto runtime al agente)

\`\`\`
{{ ... expresiones N8N ... }}
\`\`\`

## 3. Notas técnicas de N8N

- Tools que debe tener conectadas: ...
- Memoria conversacional: ...
- Variables de input requeridas: ...

## 4. Pre-Mortem

[5 escenarios — formato de arriba]

## 5. Riesgos residuales globales
```

El `n8n-builder` importa la sección 1 del prompt vía `fs.readFileSync()` y lo reemplaza en el JSON del workflow. Por eso la sección 1 va dentro de un bloque ` ``` ` identificable y limpio.
