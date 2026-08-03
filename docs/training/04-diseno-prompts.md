# 04 — Diseño de prompts

Este es el capítulo más extenso y el más crítico del manual. Los prompts son la pieza que diferencia un chatbot que convierte de uno que falla. La arquitectura, el workflow y el stack son condiciones necesarias; los prompts son la condición suficiente.

---

## 1. Los siete tipos de prompt

Todo chatbot Momentum tiene entre 2 y 6 prompts distintos, según su arquitectura. Cada tipo tiene reglas específicas de diseño:

| Tipo | Propósito | Tamaño | Modelo | Temperatura |
|---|---|---|---|---|
| **Filtro Inicial** (opcional) | Detectar conversación vieja vs lead nuevo | ~8,000 chars | GPT-4.1-mini | 0.1 |
| **Router / Clasificador** | Decidir qué agente responde + extraer datos | 1,500-3,500 chars | GPT-4.1-mini | 0.1 |
| **Agente Principal** | Conducir la conversación + calificar | 3,000-5,000 chars (hasta 6,500) | GPT-4.1-mini o GPT-4o | 0.4 |
| **Agente Especializado** | Una sola función específica | 1,000-2,000 chars | GPT-4.1-mini | 0.4 |
| **Agente de Objeciones** | LAARC sobre 3-5 objeciones comunes | 1,000-2,000 chars | GPT-4.1-mini | 0.4 |
| **Detector de Descalificación** (opcional) | Post-respuesta, evalúa si el bot descalificó | ~1,500 chars | GPT-4.1-mini | 0.1 |
| **Formateador** | Dividir respuesta en bloques cortos | ~8,000 chars | GPT-4o-mini | default |

Catálogo de prompts reales completos en [Capítulo 05](05-catalogo-prompts.md).

---

## 2. Disciplina de longitud

### 2.1 Sweet spots empíricos

Los rangos están validados sobre 18+ proyectos en producción:

```
500   → 2,000 chars:  +40% mejora en performance
2,000 → 5,000 chars:  +15% mejora adicional
5,000 → 10,000 chars: +5% mejora pero 3x costo
>10,000 chars:        solo justificado con few-shot examples
```

**Implicación:** el sweet spot es **3,000-5,000 chars** para agentes principales. Más allá hay rendimientos decrecientes severos.

### 2.2 Reportar conteo siempre

**Regla:** después de cada cambio a un prompt, contar caracteres y reportarlo en el log. Los prompts crecen con el tiempo (Jacó v14 = +5.8% vs original sin cambios estructurales) y solo se controla lo que se mide.

**Cómo contar:**
- En PowerShell: `(Get-Content prompt.md | Out-String).Length`
- En el editor: usar contador de caracteres
- En el header del archivo .md del prompt: incluir `# Chars: ~X,XXX`

### 2.3 Cuándo es aceptable exceder

El prompt del agente principal de Jacó tiene ~6,500 chars y funciona bien. La razón:

- Usa GPT-4.1-mini (modelo más capaz que gpt-4o-mini)
- El negocio requiere conocimiento de 7 propiedades distintas con reglas específicas por capacidad
- Incluye instrucciones detalladas para el uso de la tool RAG_JACO

**Cuando se justifica exceder 5,000 chars:**

- Modelo más potente (GPT-4.1-mini o GPT-4o) absorbiendo el extra
- El negocio tiene reglas no factorizables (no se pueden mover a tools o a otros agentes)
- Few-shot examples necesarios para casos específicos

**Cuando NO se justifica:**

- Instrucciones repetidas en múltiples secciones
- Edge cases que rara vez ocurren ("por si acaso")
- Explicaciones largas que el modelo no necesita

---

## 3. Estructura del prompt del agente principal

El prompt del agente principal es el más complejo. Sigue este orden estricto, validado en producción (caso Level, Dr. Carlos, Jacó):

```
1. [PRIMERAS 500 CHARS — la zona de alta atención del modelo]
   - Regla crítica anti-repetición
   - Identidad (nombre del bot, rol, empresa)
2. Personalidad (tono, puntuación, registro lingüístico)
3. Información del negocio (servicio, precios indicativos, diferenciadores)
4. Objetivo principal (qué debe lograr el bot)
5. Flujo conversacional (3-7 fases definidas)
6. FAQs con respuestas oficiales
7. Horario + mensaje fuera de horario (si aplica)
8. Reglas críticas numeradas
9. NUNCA prometás lo que no podés entregar (sección dedicada)
10. Reglas del Calendly / link de cierre (sección dedicada)
11. Puntuación (sección dedicada con ejemplos)
```

**Por qué este orden:** los LLMs prestan más atención al inicio del system prompt. Las reglas absolutas van arriba. Los detalles operativos van al medio. Las secciones de refuerzo (puntuación, anti-promesas) van al final como red de seguridad.

### 3.1 Sección 1 — Regla anti-repetición (CRÍTICO)

Esta es la primera regla del prompt. Va literalmente en las primeras 500 caracteres, antes de cualquier otra cosa. Texto recomendado:

```markdown
# REGLA DE NO REPETICIÓN (CRÍTICA)
ANTES de hacer cualquier pregunta, verificá en el historial si el usuario 
ya proporcionó esa información. Si ya la dijo, USÁ el dato sin preguntar.

Datos a verificar: nombre, email, teléfono, ubicación, presupuesto, 
producto/servicio de interés, timeline.

Si el usuario da múltiples datos en un solo mensaje, extraé TODOS, 
no preguntés uno por uno.
```

**Por qué arriba:** este es el problema #1 que los clientes detectan en bots mal hechos ("ya le dije mi nombre tres veces"). Si la regla está abajo, el modelo la olvida en conversaciones largas.

**Por qué solo UNA vez:** repetir la regla 3-4 veces en distintas secciones del prompt no mejora el resultado y confunde al modelo. Una sola declaración clara, ubicada en zona de alta atención.

### 3.2 Sección 2 — Identidad

```markdown
## IDENTIDAD
Sos [Nombre], [rol] de [Empresa]. [Una frase sobre la propuesta de valor 
de la empresa]. [Una frase sobre tu personalidad/enfoque].
```

Reglas:

- **Nombre propio del bot, siempre** — "Eva", "LEO", "Liliana", "Alexa", "Ray". Sin nombre no hay personalidad consistente.
- **Sin placeholder** — escribir el nombre real, no `[NOMBRE]`. El modelo no resuelve placeholders por contexto.
- **Una frase de propuesta de valor** — qué hace la empresa y por qué es diferente.
- **Decisión de transparencia** — ¿el bot se identifica como bot o se hace pasar por humano? Definir explícitamente en el prompt.

### 3.3 Sección 3 — Personalidad y tono

```markdown
## PERSONALIDAD Y TONO
- Profesional pero cercana
- Costarricense (usa "vos", "querés", "tenés")
- Máximo 3-4 líneas por mensaje
- Una pregunta por mensaje
- Emojis estratégicos, no excesivos
- NO uses dos puntos (:), punto y coma (;), ni signo de pregunta inicial (¿)
```

Las reglas de puntuación se detallan en §10 abajo. Pero deben aparecer aquí también para reforzar.

### 3.4 Sección 4 — Información del negocio

```markdown
## INFO DEL NEGOCIO
- Empresa ofrece: [descripción en 1 línea]
- Cliente ideal: [descripción breve]
- Diferenciador clave: [qué los hace únicos]
- Precio aproximado: [rango] (NUNCA dar exacto sin calificar)
- Horario: [si aplica]
- Ubicación: [si aplica]
```

**Regla:** precios solo como **rangos**. Nunca números exactos a menos que el cliente confirme que el precio es fijo y público.

### 3.5 Sección 5 — Flujo conversacional

El flujo se estructura en **fases**, no en pasos rígidos. El bot no debe seguir un script lineal porque los usuarios no conversan linealmente.

```markdown
## FLUJO CONVERSACIONAL

### Fase 1: Bienvenida (mensajes 1-2)
- Saludo cálido con nombre del bot
- Pregunta abierta sobre situación/necesidad

### Fase 2: Discovery (mensajes 3-6)
- Entender situación actual
- Identificar pain points
- Capturar BANT conversacionalmente

### Fase 3: Presentación de solución (mensajes 7-10)
- Si hay fit: amplificar dolor → presentar solución alineada
- Si no hay fit: ofrecer recurso gratuito → cerrar cordialmente

### Fase 4: Manejo de objeciones (cuando surjan)
- LAARC en un solo mensaje fluido
- Si objeta 2 veces → handoff humano

### Fase 5: Cierre (mensajes 11-15)
- CTA claro
- Capturar info de contacto si no se capturó antes
- Confirmar próximos pasos
```

### 3.6 Sección 6 — FAQs con respuestas oficiales

Las preguntas frecuentes son la red de seguridad para que el bot no invente.

```markdown
## FAQ
- Precio: "Depende de [variable]. Típicamente entre [rango]. ¿Qué [variable] manejás?"
- Tiempo: "[Tiempo típico]. ¿Para cuándo lo necesitarías?"
- Diferencia con X: "[Diferenciador]. ¿Has evaluado otras opciones?"
- Si no sabe: "Dejá verifico eso para vos en un momento"
```

**Regla:** cada pregunta común documentada en el discovery debe tener una respuesta oficial en el prompt. Si una pregunta común no tiene respuesta, el bot inventa.

### 3.7 Sección 9 — NUNCA prometás (CRÍTICO)

Sección dedicada. No mezclarse con otras reglas.

```markdown
## NUNCA PROMETÁS LO QUE NO PODÉS ENTREGAR

El bot solo puede enviar texto y links. NUNCA prometás:
- PDFs, brochures, catálogos (no podés enviar archivos)
- Videos grabados, audios
- Imágenes
- "Material educativo" sin un link concreto
- Llamadas telefónicas
- Reuniones presenciales agendadas sin Calendly

Si el usuario pide algo de esto:
"Para que veas todo en detalle, acá te paso el link [URL]"
o "Te lo coordino con [vendedor] directamente, te paso su contacto"
```

### 3.8 Sección 10 — Reglas del link de cierre

Sección dedicada al patrón de cierre con Calendly o WhatsApp del vendedor.

```markdown
## REGLAS PARA ENVIAR EL LINK

Cierre en 2 pasos (CRÍTICO):

**Paso 5A — PROPONER (sin link todavía):**
"Te interesa que te pase el link para que agendemos una llamada?"

**Paso 5B — ENVIAR LINK (solo después de confirmación):**
"Perfecto, [Nombre]. Acá podés agendar directamente: [URL]"

Reglas adicionales:
- VARIAR el mensaje cada vez que envíes el link (no usar template fijo)
- Después de resolver una objeción, esperar 1-2 turnos antes de proponer el link
- Si el lead ya está calificado y muestra intención clara, podés saltar 
  el paso 5A e ir directo a 5B
```

### 3.9 Sección 11 — Puntuación

Esta sección merece atención especial porque es la señal #1 que delata al bot. Detallada en §10 abajo.

---

## 4. Estructura del prompt del Router (Information Extractor)

El router tiene su propia anatomía. Esta es la estructura validada en producción:

```
1. [PRIMERAS LÍNEAS — FORMATO DE OUTPUT en YAML, lista de nombres prohibidos]
2. Rol del clasificador
3. Agentes disponibles (definición de cada destino)
4. Criterio clave: PREGUNTA vs OBJECIÓN vs CORRECCIÓN (lo crítico)
5. Lista de objeciones por tipo con ejemplos concretos
6. Condiciones para activar cada agente
7. Reglas de decisión en orden
8. Campos a extraer
9. Formato final (repetir "JSON puro, sin markdown")
```

### 4.1 Formato de output ARRIBA (CRÍTICO)

**El campo `inputSchema` del Information Extractor es solo una sugerencia para el LLM.** El LLM puede renombrar campos espontáneamente según el contexto. En el caso Level, el campo `agente_destino` se convirtió en `agente`, `agente_asignado`, `decision` en distintas ejecuciones.

**Solución obligatoria:** poner el formato exacto del JSON DENTRO del `systemPromptTemplate`, al inicio del prompt, con:

1. El JSON completo con todos los campos (en YAML, ver §4.2)
2. Una lista explícita de nombres PROHIBIDOS
3. Repetir el nombre del campo principal al menos 3 veces

**Patrón comprobado:** usar `destino` como nombre del campo principal. Palabra corta, neutra, que el LLM no tiende a renombrar.

### 4.2 NUNCA llaves sueltas (CRÍTICO)

El campo `systemPromptTemplate` del Information Extractor (y de cualquier nodo n8n que interpole expresiones) NO puede contener `{` ni `}` sueltos. n8n los interpreta como sintaxis de expresión `{{ }}` y rompe el nodo.

**Solución:** describir el formato del JSON en notación YAML (sin llaves) dentro del prompt:

```markdown
# FORMATO DE OUTPUT (CRÍTICO - PRIMERA INSTRUCCIÓN)

El output debe ser JSON, NO YAML. Pero te muestro la estructura en YAML 
para que sea legible (sin llaves que rompan el sistema):

destino: AGENTE_PRINCIPAL  # o AGENTE_OBJECIONES, HANDOFF_HUMANO
motivo: "explicación breve"
datos_extraidos:
  nombre: null  # o string si se mencionó
  email: null
  presupuesto: null
  ...

Tu output debe ser el JSON equivalente con los mismos nombres exactos.

NOMBRES PROHIBIDOS (NO usar bajo ningún concepto):
- agente, agente_asignado, agente_destino, decision, ruta, agent
- info_extraida, informacion, datos
- razon, justificacion

Usá EXACTAMENTE: destino, motivo, datos_extraidos
```

### 4.3 Agentes disponibles

Definir cada destino con criterios concretos, no descripciones vagas:

```markdown
## AGENTES DISPONIBLES

### AGENTE_PRINCIPAL
Agente principal. Maneja todo el flujo normal de conversación.
Activar cuando: no aplica ninguna condición de los otros agentes.
ES EL DEFAULT.

### AGENTE_OBJECIONES
Especialista en manejo de objeciones. Solo en la PRIMERA objeción.
Activar cuando:
- El usuario expresa resistencia, duda o rechazo sobre: 
  precio, timing, dolor, desconfianza
- Y en el historial NO hay objeciones previas ya manejadas
EJEMPLOS de objeciones:
- "Es muy caro" / "Está fuera de mi presupuesto"
- "No es buen momento" / "Más adelante"
- "No estoy seguro" / "Lo pensaré"
- "No confío en X"

### HANDOFF_HUMANO
Escala al equipo humano. Activar cuando:
- Usuario pide explícitamente hablar con humano
- Emergencia o crisis (especificar contextualmente)
- Segunda objeción del mismo tipo
- Loop sin avance (3+ mensajes fuera de contexto)
- Lead altamente calificado listo para cerrar
```

### 4.4 PREGUNTA vs OBJECIÓN vs CORRECCIÓN (CRÍTICO)

Este es el punto donde más fallan los routers mal diseñados. Tres tipos de mensaje pueden empezar con "no" o sonar similar:

```markdown
## DISTINCIÓN CRÍTICA: PREGUNTA vs OBJECIÓN vs CORRECCIÓN

PREGUNTA (va a AGENTE_PRINCIPAL):
- "Cuánto cuesta?" (pide info, no objeta)
- "Cómo funciona?" 
- "Es seguro?"

OBJECIÓN (va a AGENTE_OBJECIONES):
- "Es muy caro" (afirma que el precio es problema)
- "No es el momento" (afirma que no quiere ahora)
- "No estoy seguro" (resistencia)

CORRECCIÓN (va a AGENTE_PRINCIPAL):
- "No, tengo más capital" (corrige info del bot)
- "No es para mí, es para mi pareja"
- "No, vivo en San José"

REGLA: si empieza con "no" pero está corrigiendo info, NO es objeción.
```

### 4.5 Reglas de decisión en orden

```markdown
## REGLAS DE DECISIÓN (EN ORDEN)

1. Si es emergencia o crisis → HANDOFF_HUMANO
2. Si pide hablar con humano explícitamente → HANDOFF_HUMANO
3. Si es objeción Y no hay objeción previa manejada → AGENTE_OBJECIONES
4. Si es segunda objeción del mismo tipo → HANDOFF_HUMANO
5. Si es loop sin avance (3+ mensajes fuera contexto) → HANDOFF_HUMANO
6. EN CUALQUIER OTRO CASO → AGENTE_PRINCIPAL (default seguro)
```

### 4.6 Schema del Information Extractor

El campo `inputSchema` del nodo se completa con la misma estructura que está dentro del prompt:

```json
{
  "type": "object",
  "properties": {
    "destino": {
      "type": "string",
      "enum": ["AGENTE_PRINCIPAL", "AGENTE_OBJECIONES", "HANDOFF_HUMANO"]
    },
    "motivo": {"type": "string"},
    "datos_extraidos": {
      "type": "object",
      "properties": {
        "nombre": {"type": ["string", "null"]},
        "presupuesto": {"type": ["string", "null"]},
        ...
      }
    }
  },
  "required": ["destino"]
}
```

**Importante:** el schema en `inputSchema` y la descripción en `systemPromptTemplate` deben coincidir. Si difieren, el LLM puede generar campos del schema que no están en el prompt o viceversa.

---

## 5. Reglas universales de redacción

### 5.1 No inventes — "Dejá verifico eso"

Cuando el bot no tiene la información, **no debe inventarla**. La frase comprobada es:

> "Dejá verifico eso para vos"
> "Voy a confirmarte eso en un momento"
> "Esto te lo confirmo con [responsable]"

**Implementación en el prompt:**

```markdown
## INFORMACIÓN QUE NO TENÉS

Si te preguntan algo que NO está en este prompt o en tu base de conocimiento:
- NO inventés la respuesta
- Decí: "Dejá verifico eso para vos en un momento"
- Si es algo que requiere intervención humana, derivar
- NUNCA des un número, fecha, precio o detalle específico que no tengas
```

**Antipatrón:** dejar que el modelo "use su criterio" sobre cuándo inventar. El modelo siempre opta por dar una respuesta plausible aunque sea falsa.

### 5.2 No prometas material sin link

Detallado en [Cap 01 §3.2](01-filosofia-metodologia.md). Cada mención de "te mando", "te paso", "te comparto" debe corresponder a un link real y compartible.

**Trampa común:** _"Te puedo compartir contenido educativo"_ — si no hay un link concreto detrás, es promesa vacía.

### 5.3 No menciones nada interno

El bot nunca debe mencionar:

- "n8n", "API", "webhook", "agente", "prompt", "token", "LLM"
- "Mi base de datos", "el sistema", "la lógica del bot"
- "Soy una inteligencia artificial" (a menos que sea política explícita de transparencia)
- Detalles de cómo funciona internamente

**Implementación:**

```markdown
## NUNCA MENCIONÉS

- Que sos un bot, IA, asistente virtual (excepto si el cliente decidió 
  política de transparencia explícita)
- Detalles técnicos: API, sistema, base de datos, código
- Que estás siguiendo un script o flujo
```

### 5.4 Variar mensajes repetidos (CRÍTICO)

Cuando el bot tiene que enviar lo mismo más de una vez (link de Calendly, link a comunidad, respuesta a objeción recurrente), NUNCA debe usar el mismo mensaje textual.

**Por qué importa:** la repetición textual es la señal #2 que delata al bot (después de la puntuación formal). El usuario que recibe dos veces el mismo mensaje exacto sabe que está hablando con una máquina.

**Implementación en el prompt:**

```markdown
## VARIACIÓN DE MENSAJES RECURRENTES (CRÍTICO)

Cuando tengas que enviar algo más de una vez (Calendly, link a comunidad, 
respuesta sobre precios, etc.), NUNCA uses el mismo mensaje textual.

Para el envío del link de Calendly, acá tenés 5 variantes (inspiración, 
NO templates fijos — adapta al contexto de la conversación):

1. "Acá podés agendar la sesión: [URL]"
2. "Te dejo el link para que escojas el horario que te quede: [URL]"
3. "Listo, podés reservar tu llamada acá: [URL]"
4. "Por acá podés agendar directamente, sin vueltas: [URL]"
5. "Te lo dejo para que veas los espacios disponibles: [URL]"

Si el lead pide el link de nuevo, referenciá el contexto:
- "Acá te lo dejo de nuevo: [URL]"
- "Sin problema, ahí lo tenés otra vez: [URL]"

Cada vez que envíes el link, redactá el mensaje como si fuera la primera vez, 
tomando en cuenta lo que acaban de hablar.
```

**Aplicación:** envío de Calendly, links educativos, respuestas a FAQs recurrentes, cierres de conversación.

---

## 6. La regla anti-repetición ampliada

La regla de no preguntar dos veces lo mismo se ubica al inicio del prompt (§3.1). Pero hay una versión más sofisticada que aplica cuando el usuario da múltiples datos en un solo mensaje.

### 6.1 Extracción multi-dato

**Caso típico:** el usuario escribe "Hola, soy Hans, vivo en San José y busco una propiedad de unos $150K para inversión".

El bot NO debe preguntar:
- ❌ "Hola Hans, ¿de dónde sos?"
- ❌ "¿Es para vivir o para invertir?"
- ❌ "¿Cuál es tu presupuesto?"

El bot SÍ debe:
- ✅ Acusar recibo de toda la información ("Buenísimo, Hans, propiedades de $150K para inversión en San José tenemos varias opciones")
- ✅ Avanzar a la siguiente pregunta lógica que NO tiene respuesta del usuario

**Implementación:** la regla anti-repetición debe incluir explícitamente:

```markdown
# REGLA DE NO REPETICIÓN (CRÍTICA)

ANTES de cualquier pregunta, verificá en el historial completo (no solo 
el último mensaje) si el usuario YA dio esa información. Si la dio, 
usala sin preguntar de nuevo.

Si en un solo mensaje el usuario da múltiples datos (ej: nombre + 
presupuesto + ubicación), extraé TODOS los datos y NO preguntés por 
ninguno de ellos. Pasá directo al siguiente dato faltante.

Datos a verificar siempre: nombre, email, teléfono, ubicación, 
presupuesto, producto/servicio de interés, timeline, propósito.
```

### 6.2 El rol del router en la extracción

El router (Information Extractor) extrae datos del historial. El agente principal recibe esos datos resueltos en el contexto. **No es responsabilidad del agente principal extraer datos del texto raw del usuario — eso ya lo hizo el router**.

Esto se materializa así: el router devuelve un campo `datos_extraidos` con todos los campos relevantes. El workflow inyecta esa información al agente principal vía contexto. El agente principal sabe qué datos ya tiene y qué falta.

---

## 7. Frameworks de ventas en el prompt

### 7.1 BANT conversacional

**Versión muerta (no usar):**
- "¿Cuál es tu presupuesto?"
- "¿Eres el decisor?"
- "¿Cuándo lo necesitas?"

→ 70% de abandono. El usuario se siente encuestado.

**Versión conversacional (usar):**
- **Budget:** "¿Qué rango de inversión tenés en mente?" / "¿Qué invertís actualmente en X?"
- **Authority:** "¿Quién más estaría involucrado en la decisión?" / "¿Es para vos o para tu empresa?"
- **Need:** "¿Qué es lo más frustrante de tu proceso actual?" / "¿Qué pasaría si no resolvés esto?"
- **Timeline:** "¿Para cuándo necesitarías tener esto funcionando?" / "¿Es algo urgente o estás explorando?"

**Detección contextual de moneda (caso El Canal):**
- "millones" → colones automáticamente
- "K" → dólares
- NO preguntar "¿colones o dólares?" si el contexto lo aclara

### 7.2 SPIN simplificado

Para B2B / SaaS / servicios consultivos. Más complejo que BANT pero más profundo.

```
SITUACIÓN (1-2 preguntas max):
"¿Cuántos agentes manejan consultas actualmente?"

PROBLEMA (dejar que ellos lo digan):
"¿Qué es lo más frustrante de ese proceso?"

IMPLICACIÓN (amplificar el dolor):
"¿Cuánto tiempo pierden con eso al día?"

NECESIDAD (que pidan la solución):
"¿Cómo cambiaría si estuviera automatizado?"
```

### 7.3 LAARC para objeciones

Implementación en agente de objeciones (no en agente principal). Todo en UN solo mensaje fluido, no como pasos separados.

```
Acknowledge: "Entiendo, es totalmente válido"
Assess: "¿Comparado con qué te parece?"
Respond: [argumento según tipo]
Confirm: "¿Eso te genera más tranquilidad?"
```

**Tipos de objeción y respuestas:**

| Tipo | Assess | Respond |
|---|---|---|
| **Precio** | "Comparado con qué te parece?" | Si vs competencia → diferencial. Si vs nada → costo de no actuar. Si vs presupuesto → opción reducida. |
| **Timing** | "Qué necesita pasar primero?" | Costo mensual de seguir igual. Disponibilidad limitada. Empezar con algo pequeño. |
| **Miedo/Dolor** | "Qué te preocupa específicamente?" | Datos, casos reales, garantías, opción de prueba. |
| **Desconfianza** | "Qué te genera duda?" | Social proof, certificaciones, referencias. |

**Regla absoluta:** NUNCA ofrecer descuento como primera respuesta a objeción de precio. Siempre explorar primero.

---

## 8. Reglas de formato (WhatsApp/Instagram/Telegram)

### 8.1 Longitud por mensaje

- **Máximo 3-4 líneas** por mensaje
- **Una pregunta por mensaje**, nunca dos
- Mensajes cortos = natural = engagement

### 8.2 Formato prohibido

- ❌ Bold con `**texto**` — no renderiza en WhatsApp, se ve literalmente con asteriscos
- ❌ Bullet points (`- item`, `• item`) — se siente como formulario
- ❌ Listas numeradas (`1. item`, `2. item`) — formal, robótico
- ❌ Headers markdown (`# Titulo`, `## Sub`) — no renderizan

### 8.3 Formato permitido

- ✅ Saltos de línea simples para separar ideas
- ✅ Emojis estratégicos (1 por mensaje, máximo)
- ✅ Comillas para citas o referencias específicas

### 8.4 Emojis — uso correcto

**Emojis aceptables:**
- 🌴 contextual (bienvenida en negocio de turismo)
- 💎 acentuando un producto premium
- 🎁 ofreciendo un detalle/incentivo
- 📅 referencia a agenda/calendario
- 👋 saludo inicial

**Anti-patrón:** múltiples emojis seguidos (`✨🚀💯`) — se siente artificial.

**Anti-patrón:** emojis decorativos en cada mensaje — pierde el efecto.

---

## 9. Tono costarricense

### 9.1 Voseo

- "Vos" en lugar de "tú"
- "Querés" / "tenés" / "podés" en lugar de "quieres" / "tienes" / "puedes"
- "Tu" como posesivo está bien ("tu casa", "tu presupuesto")

### 9.2 Palabras a EVITAR

- "Mae" — demasiado informal para contexto profesional
- "Pura vida" — cliché, se siente forzado en chat
- "Diay" — registro muy coloquial

### 9.3 Palabras y frases recomendadas

- "Perfecto"
- "Con mucho gusto"
- "Claro que sí"
- "Te explico"
- "Sin problema"
- "Por dicha"

### 9.4 Adaptación al cliente

El tono base es semi-formal costarricense. Pero se adapta al cliente específico:

- Cliente formal corporativo → usar "usted" y eliminar voseo
- Cliente joven informal → tono más casual, emojis moderados
- Cliente extranjero → usar "tú" estándar latinoamericano, no voseo

---

## 10. Puntuación humana (CRÍTICO)

Esta es la señal #1 que delata al bot. La puntuación académica formal NO es como escribe la gente en WhatsApp/Instagram.

### 10.1 Reglas absolutas

**NUNCA usar:**

- **Dos puntos `:`** — casi nadie los usa en chat, menos dentro de una pregunta
- **Punto y coma `;`** — extremadamente formal para WhatsApp
- **Signo de pregunta de apertura `¿`** — la gente solo usa `?` al final
- **Punto final al cierre de mensaje** — se percibe formal y cortante
- **Guion largo `—`** — académico, casi nadie lo escribe en celular

**Minimizar:**

- **Punto y seguido** — preferir saltos de línea o frases cortas separadas
- **Punto y aparte** — preferir saltos de línea sencillos

**SÍ usar:**

- Signo de interrogación solo al final: "Que te parece?"
- Comas naturales para pausa
- Saltos de línea para separar ideas
- Tildes correctamente (eso sí es natural)

### 10.2 Ejemplos comparativos

**❌ BOT (delata):**

> "Es totalmente válido, Hans, esa preocupación es común. ¿Qué es lo que más te preocupa: perder todo o que no rinda lo suficiente? La seguridad del capital es nuestra prioridad; todos los productos que asesoramos cuentan con protección y garantías."

**Problemas detectables:**
- `¿` de apertura
- `:` dentro de pregunta
- `;` separando ideas
- Punto final
- Estructura demasiado formal

**✅ HUMANO:**

> "Es totalmente válido, Hans, esa preocupación es super común
>
> Que es lo que más te preocupa, perder todo o que no rinda lo suficiente?
>
> La seguridad del capital es nuestra prioridad
>
> Todos los productos que asesoramos cuentan con protección y garantías"

**Por qué funciona:**
- Sin `¿`, solo `?` al final de pregunta
- Sin `:` ni `;`
- Sin punto final
- Saltos de línea en vez de puntos
- "Super" en vez de "muy"

### 10.3 Regla de oro

> Si al leerlo en voz alta suena a artículo de periódico o ensayo, es bot. Si suena a como le escribirías a un amigo por WhatsApp, es humano.

### 10.4 Implementación en el prompt

```markdown
## PUNTUACIÓN (CRÍTICO - REGLA INVIOLABLE)

Escribís como persona en WhatsApp, no como escritor de ensayo académico.

PROHIBIDO usar:
- Dos puntos ( : ) — ni en preguntas, ni para listar, ni en saludos
- Punto y coma ( ; ) — formal, se ve robótico
- Signo de pregunta inicial ( ¿ ) — solo ? al final
- Punto final al cierre del mensaje
- Guion largo ( — )

EN VEZ DE: "Hola Hans: ¿cómo estás?"
USÁ:       "Hola Hans, como estas?"

EN VEZ DE: "El precio incluye: instalación, soporte y garantía."
USÁ:       "El precio incluye instalación, soporte y garantía"
o:         "El precio incluye instalación, soporte y garantía
            Todo en uno"

EN VEZ DE: "Es importante; nuestros clientes valoran la calidad."
USÁ:       "Es importante
            Nuestros clientes valoran la calidad"
```

---

## 11. Patrón anti-revelación del bot

Cuatro señales delatan que un mensaje viene de un bot. Las dos primeras (puntuación, repetición textual) ya se cubrieron. Las otras dos:

### 11.1 Demasiado pushy

Terminar cada mensaje con un CTA o pregunta de avance se siente robótico. Patrón humano:

- Algunos mensajes son **informativos** sin pregunta
- Algunos son **empáticos** sin avance
- Solo cuando hay momento natural se hace pregunta de avance

**Implementación:**

```markdown
## NO SEÁS PUSHY

NO termines cada mensaje con CTA. Mezclá tipos de mensaje:
- Informativos (solo dan info, sin pregunta)
- Empáticos (validar lo que dijo el usuario)
- Avanzar (con pregunta natural)

La proporción ideal es: ~1 de cada 3 mensajes tiene pregunta de avance.
Los otros 2 dan información o construyen rapport.
```

### 11.2 Promesas falsas

Cubierto en §5.2. El bot no debe prometer material que no tiene link real.

---

## 12. Cuándo usar GPT-4o-mini vs GPT-4.1-mini vs GPT-4o

| Uso | Modelo | Por qué |
|---|---|---|
| Router/Classifier | **GPT-4.1-mini** | Mejor extracción de datos del historial que gpt-4o-mini. |
| Agente principal con prompt <3k chars | **GPT-4o-mini** | Suficiente para flujos simples, costo bajo. |
| Agente principal con prompt 3-5k chars | **GPT-4.1-mini** | Sweet spot de capacidad/costo. Default para Momentum. |
| Agente principal con prompt >5k chars | **GPT-4o** | Mini pierde contexto en prompts largos. |
| Agente especializado simple | **GPT-4.1-mini** | Default. |
| Detector de descalificación | **GPT-4.1-mini** | Output JSON, temp 0.1. |
| Formateador | **GPT-4o-mini** | Tarea bien definida, modelo barato es suficiente. |
| Filtro inicial | **GPT-4.1-mini** | Necesita razonamiento contextual. |

### 12.1 Síntomas de modelo inadecuado

Si el bot:

- Responde cosas que no debería
- Olvida información ya proporcionada
- Da información incorrecta a pesar de instrucciones explícitas
- Repite preguntas ya respondidas
- "Se pierde" en conversaciones de >8-10 turnos

→ **Cambiar de GPT-4o-mini a GPT-4.1-mini o GPT-4o resuelve ~80% de los casos inmediatamente.**

### 12.2 Configuración estándar de temperaturas

| Uso | Temperature |
|---|---|
| Router/Classifier | **0.1** (consistencia absoluta) |
| Detector descalificación | **0.1** (idem) |
| Agente principal | **0.4** (conversacional con consistencia) |
| Agente especializado | **0.4** (idem) |
| Formateador | default (~0.7, no crítico) |
| Filtro inicial | **0.1** |

### 12.3 Max tokens estándar

| Uso | Max Tokens |
|---|---|
| Router/Classifier | 300-400 (JSON corto) |
| Agente principal | 400 (respuesta de 3-4 líneas) |
| Agente especializado | 400 |
| Detector descalificación | 400 |
| Formateador | default (puede ser largo) |
| Filtro inicial | 300 |

---

## 13. Ciclo iterativo de mejora de prompts

Los prompts no se diseñan perfectos. Se iteran. El ciclo:

### 13.1 Pre-deploy: testing simulado

1. Antes de poner en producción, probar el prompt con **20+ conversaciones simuladas**
2. Cubrir los 3 flujos principales (camino feliz, objeción, descalificación)
3. Probar mensajes inesperados (saludo simple, una sola palabra, número solo)
4. Probar en el canal real (no solo en el chat interno de n8n)

### 13.2 Semana 1 post-launch: monitoreo intensivo

Revisar diariamente:

- Conversaciones completas (leer las primeras 20-30)
- Tasa de abandono por fase del flujo
- Mensajes donde el bot falló (no entendió, inventó, repitió)
- Tiempo promedio de respuesta
- Leads calificados vs total de conversaciones

Ajustar:

- Keywords del classifier que no matchean
- Respuestas a preguntas frecuentes no cubiertas
- Tono si el feedback del cliente lo requiere

### 13.3 Semanas 2-4: iteración basada en datos

- **¿Dónde abandonan más?** → optimizar ese punto del flujo
- **¿Qué preguntas no puede responder?** → agregar al prompt o RAG
- **¿Qué objeciones nuevas aparecen?** → agregar al agente de objeciones
- **¿El BANT se captura naturalmente?** → ajustar preguntas

**Reglas del cambio quirúrgico:**

- NUNCA reescribir todo el prompt
- Cambiar UN aspecto a la vez
- Medir impacto antes del siguiente cambio
- Documentar cada cambio y su efecto

### 13.4 Mes 2+: A/B testing (cuando hay volumen)

Variables comprobadas para A/B test:

- Mensaje de bienvenida (formal vs casual)
- Orden de preguntas BANT
- Momento de presentar CTA
- Longitud de respuestas
- Con emojis vs sin emojis

Método:

1. Baseline: 100 conversaciones con versión actual
2. Hipótesis: "Cambiar X mejorará Y en Z%"
3. Split: 50/50 tráfico
4. Medir: significancia estadística (p < 0.05)
5. Implementar: rollout ganador

---

## 14. Frameworks de prompt-design (referencias)

El sistema de Momentum integra elementos de tres frameworks documentados que pueden ser útiles cuando el ajuste fino del prompt requiere un esqueleto:

### 14.1 CO-STAR (para personalidad del bot)

- **C**ontext: contexto del negocio y la situación
- **O**bjective: qué debe lograr el bot
- **S**tyle: estilo de comunicación
- **T**one: tono específico
- **A**udience: a quién le habla
- **R**esponse: formato de respuesta

Útil cuando el cliente requiere personalidad muy específica.

### 14.2 TIDD-EC (para guardrails)

- **T**ask: tarea principal
- **I**nstructions: instrucciones generales
- **D**o: lo que SÍ debe hacer
- **D**on't: lo que NUNCA debe hacer
- **E**xamples: ejemplos de comportamiento esperado
- **C**ontext: contexto adicional

Útil para la sección de restricciones del prompt principal.

### 14.3 RTF (para agentes simples)

- **R**ole: rol del agente
- **T**ask: tarea única
- **F**ormat: formato de output

Útil para agentes especializados simples (inventario, FAQ).

---

## 15. Checklist de calidad de un prompt

Antes de poner un prompt en producción, verificar:

### Longitud

- [ ] Conteo de caracteres está dentro del rango (3-5k principal, 1-2k especializado)
- [ ] Si excede el rango, hay justificación documentada (modelo capaz, complejidad inevitable)

### Estructura

- [ ] La regla anti-repetición está en las primeras 500 caracteres
- [ ] La identidad del bot tiene nombre propio (no placeholder)
- [ ] Las FAQs están con respuestas oficiales (no inventables)
- [ ] La sección "NUNCA prometás" está presente y específica al negocio
- [ ] Las reglas de puntuación están explícitas

### Reglas de redacción

- [ ] No hay instrucciones repetidas en múltiples secciones
- [ ] No hay edge cases que rara vez ocurren
- [ ] No hay placeholders sin resolver (`[NOMBRE]`, `{empresa}`)
- [ ] No hay referencias a herramientas internas (n8n, API, LLM)

### Contenido

- [ ] El tono es consistente y apropiado al cliente
- [ ] BANT se captura conversacionalmente, no como interrogatorio
- [ ] Valor se da antes de pedir datos de contacto
- [ ] Variables dinámicas (fecha, nombre) están correctas

### Output del router (si aplica)

- [ ] El formato de output JSON está al inicio del prompt (en YAML)
- [ ] Lista de nombres prohibidos para campos
- [ ] Cero llaves `{` `}` sueltas en el systemPromptTemplate
- [ ] Nombre del campo principal es corto (`destino` recomendado)
- [ ] Switch del workflow lee el nombre correcto

### Testing

- [ ] Se testearon 20+ conversaciones simuladas
- [ ] Se cubrieron los 3 flujos principales (feliz, objeción, descalificación)
- [ ] Se verificó en el canal real (no solo n8n internal chat)

---

**Siguiente:** [Capítulo 05 — Catálogo de prompts copiables](05-catalogo-prompts.md)

**Anterior:** [Capítulo 03 — Discovery con el cliente](03-discovery-cliente.md)
