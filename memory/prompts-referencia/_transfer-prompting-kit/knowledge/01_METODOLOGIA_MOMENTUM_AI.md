# METODOLOGÍA MOMENTUM AI - CONSTRUCCIÓN DE CHATBOTS DE ALTA CONVERSIÓN
## Documento de referencia para Claude Code - Extraído de 18+ proyectos reales

---

# 1. PRINCIPIOS FUNDAMENTALES (NO NEGOCIABLES)

## 1.1 Arquitectura Modular vs Monolítica

**REGLA #1: Nunca crear un mega-prompt. Siempre arquitectura modular.**

La experiencia en producción demostró que:
- Prompts >5k caracteres con GPT-4o-mini = desastre (olvida instrucciones, repite preguntas, inventa información)
- Un solo agente haciendo todo = inconsistencia y degradación en conversaciones largas
- Arquitectura modular con 3-5 agentes especializados <5k chars = consistencia >95%

**Estructura universal que siempre funciona:**
```yaml
1. MESSAGE CLASSIFIER (Code Node - 0 LLM calls):
   - Clasifica por keywords/patterns
   - Extrae información del historial
   - Enruta al agente correcto
   - <100ms latencia, $0 costo

2. AGENTE PRINCIPAL (70-80% del tráfico):
   - 3,000-5,000 caracteres máximo
   - Maneja info general + calificación BANT natural
   - ES EL DEFAULT cuando hay duda en routing

3. AGENTES ESPECIALIZADOS (1-3 agentes, 10-30% tráfico):
   - 1,000-2,000 caracteres cada uno
   - UN solo propósito por agente
   - Precios, disponibilidad, citas, inventario, objeciones

4. RESPONSE FORMATTER (Code Node - 0 LLM):
   - Formato consistente
   - Máximo 3 líneas por mensaje
   - 1 pregunta por mensaje
```

## 1.2 Selección de Modelo LLM

**Regla comprobada con clientes en producción:**

| Uso | Modelo | Cuándo |
|-----|--------|--------|
| Classifiers | GPT-4o-mini | Siempre (tarea simple, bajo costo) |
| Agente principal con prompt <3k chars | GPT-4o-mini | Tickets <$500, volumen alto |
| Agente principal con prompt >3k chars | GPT-4o | Siempre (mini pierde contexto) |
| Conversaciones complejas/multi-turno | GPT-4o | Siempre |
| Agentes especializados simples | GPT-4o-mini | Prompts <2k chars |

**Síntomas de modelo inadecuado (GPT-4o-mini con prompts largos):**
- Responde cosas que no debería
- Olvida información ya proporcionada por el usuario
- Da información incorrecta a pesar de instrucciones explícitas
- Repite preguntas que ya fueron respondidas
- "Se pierde" en conversaciones de más de 8-10 turnos

**Solución comprobada:** Cambiar de GPT-4o-mini a GPT-4o resuelve ~80% de estos problemas inmediatamente.

## 1.3 Cambios Quirúrgicos vs Reescrituras

**PRINCIPIO CRÍTICO: Cambios quirúrgicos sobre reescrituras completas.**

- Cuando un prompt está funcionando en un 70-80%, NUNCA reescribir desde cero
- Identificar los puntos específicos que fallan y modificar SOLO esos
- Cada cambio debe ser verificable y reversible
- Mantener control del conteo de caracteres después de cada modificación
- Los prompts crecen con el tiempo - monitorear activamente la longitud

## 1.4 Disciplina de Longitud de Prompt

**Datos duros sobre longitud:**
- 500 → 2,000 chars: +40% mejora en performance
- 5,000 → 10,000 chars: solo +5% mejora pero 3x más costo
- >10k chars solo justificado si incluye ejemplos de conversación (few-shot)
- Sweet spot para agentes principales: 3,000-5,000 chars
- Sweet spot para agentes especializados: 1,000-2,000 chars
- Classifiers: 1,500-3,000 chars máximo

## 1.5 Valor Primero, Datos Después

**NUNCA pedir datos de contacto antes de demostrar valor.**

Incorrecto: "¡Hola! ¿Cuál es tu email?" → 70% abandono
Correcto: Entender necesidad → Dar valor → Pedir datos → 30%+ conversión

Ejemplo comprobado (Microcréditos Grandit): Cambiar de "pedir nombre + cédula + tipo de crédito ANTES del formulario" a "enviar link del formulario inmediatamente" eliminó abandono masivo.

## 1.6 BANT Conversacional, No Interrogatorio

**El BANT de 1960 (pregunta directa) destruye conversiones.**

```
INCORRECTO:
"¿Cuál es tu presupuesto?"
"¿Eres el decisor?"
"¿Cuándo lo necesitas?"
→ 70% abandono

CORRECTO:
"Cuéntame sobre tu proyecto" → Extrae Industry, Size, Pain
"¿Cómo manejan esto actualmente?" → Extrae Budget hints, Timeline
"¿Qué ha impedido resolverlo?" → Extrae Authority, Real need
"Basado en lo que me dices..." → Presenta solución aligned
```

---

# 2. ARQUITECTURA N8N - PATRONES PROBADOS

## 2.1 Flujo Estándar de Nodos

```
Webhook/Canal Trigger
  → Message Classifier (Code Node)
  → Switch/Router (basado en output del classifier)
    → AI Agent Principal (OpenAI)
    → AI Agent Especialista 1 (OpenAI)
    → AI Agent Especialista 2 (OpenAI)
  → Response Formatter (Code Node)
  → Respond al Canal
  → PostgreSQL/Supabase (guardar estado)
```

## 2.2 Integración de Canales

### WhatsApp (Evolution API)
- Webhook trigger recibe mensajes
- Response node envía respuesta
- Soporta texto, imágenes, links
- NO soporta formato bold/italic (quitar de prompts)

### WhatsApp (YCloud)
- Alternativa oficial con WABA
- App Coexistence (bot + app personal coexisten)
- Templates requieren aprobación de Meta (24-48h)
- Mejor para proactivo/broadcast

### Instagram DM (ManyChat)
- ManyChat recibe/envía mensajes IG
- Webhook a n8n para toda la lógica AI
- n8n procesa y devuelve respuesta a ManyChat
- No requiere formatting especial

## 2.3 Classifier como Code Node (Sin LLM)

**Por qué Code Node en vez de LLM para clasificar:**
- <50ms vs 2-3 segundos de latencia
- $0 vs $0.001+ por clasificación
- 95%+ accuracy en casos obvios
- Sin riesgo de alucinación en routing

**Patrón de clasificación por keywords:**
```javascript
// Estructura base del classifier
const mensaje = $json.mensaje.toLowerCase();
const historial = $json.historial || '';

// Detección por keywords
if (mensaje.match(/precio|costo|cuánto|tarifa|cobran/)) {
  return { agent: 'AGENTE_PRECIOS', confidence: 0.9 };
}

if (mensaje.match(/disponib|fecha|calendario|cuándo|horario/)) {
  return { agent: 'AGENTE_DISPONIBILIDAD', confidence: 0.9 };
}

if (mensaje.match(/inventario|stock|tienen|hay|queda/)) {
  return { agent: 'AGENTE_INVENTARIO', confidence: 0.85 };
}

// DEFAULT: Agente principal maneja todo lo demás
return { agent: 'AGENTE_PRINCIPAL', confidence: 1.0 };
```

## 2.4 Classifier como LLM (Cuando se necesita extracción)

**Usar LLM classifier cuando necesitás extraer datos estructurados del mensaje:**

```markdown
# ROL
Clasificador del sistema [NOMBRE]. Analiza mensaje + historial para:
1. Redirigir al agente correcto
2. Extraer información del usuario

# OUTPUT (JSON puro, sin markdown, sin backticks)
{
  "agente_destino": "AGENTE_PRINCIPAL | AGENTE_PRECIOS | AGENTE_INVENTARIO",
  "informacion_extraida": {
    "nombre": "string o null",
    "email": "string o null",
    "presupuesto": "string o null",
    "necesidad": "string o null"
  },
  "razon": "explicación breve"
}
```

**Errores comunes con LLM classifiers:**
- Token limit muy bajo → JSON vacío o cortado (solución: subir a 500-1000 tokens)
- Demasiadas categorías de routing → confusión (solución: máximo 3-4 destinos)
- Instrucciones ambiguas → routing inconsistente

## 2.5 Round-Robin para Asignación de Vendedores

**Patrón simple basado en hora (probado en El Canal):**
```javascript
// Hora actual para round-robin
const hora = new Date().getHours();
const esHoraPar = hora % 2 === 0;

const vendedor = esHoraPar 
  ? { nombre: "Mario Rodriguez", whatsapp: "https://wa.me/506XXXXXXXX" }
  : { nombre: "Mauricio Monge", whatsapp: "https://wa.me/506XXXXXXXX" };

return { vendedor };
```

## 2.6 Memoria y Estado

**PostgreSQL/Supabase para estado de conversación:**
- conversation_state: sesión actual, BANT scores, stage
- lead_qualification: datos extraídos del lead
- interaction_history: para no repetir preguntas
- analytics: métricas en tiempo real

**Window Buffer Memory:**
- Típicamente 10 mensajes de contexto
- Suficiente para mantener coherencia
- No depender del modelo para recordar — usar DB externa

**Redis:**
- Para cache de respuestas frecuentes
- TTL de 1 hora para precios/disponibilidad

## 2.7 Notificaciones a Discord

**Patrón de string detection (no requiere JSON del agente):**

En vez de hacer que el agente genere JSON estructurado para notificaciones, detectar strings en la respuesta del agente:

```javascript
const respuesta = $json.output;

// Detectar si se envió link de WhatsApp
if (respuesta.includes('wa.me/')) {
  // Trigger notificación Discord: "Lead derivado a vendedor"
}

// Detectar si se envió Calendly
if (respuesta.includes('calendly.com')) {
  // Trigger notificación Discord: "Lead agendó cita"
}

// Detectar descalificación
if (respuesta.includes('lamentablemente no') || respuesta.includes('no podemos ayudarte')) {
  // Trigger notificación Discord: "Lead descalificado"
}
```

---

# 3. FRAMEWORKS DE VENTAS IMPLEMENTADOS

## 3.1 BANT Moderno (Adaptado para Chatbots)

**Budget:** No preguntar directamente. Usar:
- "¿Qué rango de inversión tenés en mente?"
- "¿Qué invierten actualmente en...?"
- Detectar en contexto: "millones" = colones, "K" = dólares

**Authority:** Inferir, no preguntar:
- "¿Quién más estaría involucrado en la decisión?"
- "¿Esto es para vos o para tu empresa?"

**Need:** Dejar que el usuario articule:
- "¿Qué es lo más frustrante de tu proceso actual?"
- "¿Qué pasaría si no resuelven esto?"

**Timeline:** Calibrar urgencia:
- "¿Para cuándo necesitarían tener esto funcionando?"
- Detectar: "urgente" → 0-3 meses, "explorando" → +6 meses

## 3.2 SPIN Simplificado para Chatbots

```
SITUACIÓN (1-2 preguntas max):
"¿Cuántos agentes manejan consultas actualmente?"

PROBLEMA (dejar que ELLOS lo digan):
"¿Qué es lo más frustrante de ese proceso?"

IMPLICACIÓN (amplificar el dolor):
"¿Cuánto tiempo pierden con eso al día?"

NECESIDAD (que pidan la solución):
"¿Cómo cambiaría si estuviera automatizado?"
```

## 3.3 LAARC para Manejo de Objeciones

**Implementación probada en Dr. Carlos Hernández:**

```
LISTEN: "Entiendo tu preocupación sobre [objeción]"
ACKNOWLEDGE: "Es importante que [validación]"
ASSESS: "¿Comparado con qué te parece [objeción]?"
RESPOND:
  - EVIDENCE: datos, casos de éxito
  - REFRAME: perspectiva diferente
  - ALTERNATIVE: opción reducida
  - STORY: caso de cliente relatable
CONFIRM: "¿Eso aclara tu duda sobre [objeción]?"
```

**Distribución real de objeciones (HubSpot):**
- 47% precio
- 22% timing
- 18% product fit
- 13% otros

**Para precio:** NUNCA ofrecer descuento inmediato. Preguntar "¿Qué presupuesto tenías?" primero.

---

# 4. REGLAS DE FORMATO Y TONO

## 4.1 Formato Universal para WhatsApp/Instagram

- MÁXIMO 3-4 líneas por mensaje
- UNA pregunta por mensaje (nunca dos)
- NO usar bold (**texto**) — no funciona en WhatsApp
- NO usar emojis excesivos — se siente bot
- SÍ usar emojis estratégicos y moderados
- NO usar bullet points en mensajes — se siente formulario
- Mensajes cortos = más natural = más engagement

## 4.2 Tono Costarricense

- Usar "vos" (tuteo costarricense): "querés", "tenés", "podés"
- NO usar "mae" ni "pura vida" en contextos profesionales
- SÍ usar: "perfecto", "con mucho gusto", "claro que sí"
- Tono: profesional pero cercano, nunca robótico
- Adaptar nivel de formalidad al cliente (semi-formal por default)

## 4.3 Personalidad del Bot

- SIEMPRE tiene nombre propio (Eva, Liliana, LEO, Alexa, Ray)
- NUNCA revela que es bot/IA (excepto si es parte de la estrategia)
- Tiene personalidad consistente a través de toda la conversación
- No usa placeholders como [NOMBRE] — siempre valores reales

## 4.4 Handoff a Humano

**Criterios universales para handoff:**
- Usuario explícitamente pide hablar con humano
- 3+ mensajes de frustración consecutivos
- Objeción que requiere negociación real
- Información que el bot no puede verificar
- Lead altamente calificado listo para cerrar

**Handoff = bot deja de responder (en n8n):**
- No enviar mensaje de "te paso con alguien"
- Simplemente dejar de responder
- Notificar al equipo por Discord/WhatsApp
- El humano toma la conversación directamente

---

# 5. MÉTRICAS Y BENCHMARKS

## 5.1 Métricas Target

```yaml
Conversión: 30-40% (industria promedia 10-15%)
Coherencia: >95% (no olvida contexto)
Latencia: <3 segundos total
Abandono: <20%
Calificación BANT: 60%+ con 3/4 criterios
Costo por chat: <$0.10
Sweet spot conversación: 10-15 mensajes para calificación exitosa
```

## 5.2 Datos de Industria

- E-commerce con chatbot: 12.3% conversión vs 3.1% sin chatbot (4x)
- B2C Products: 35.2% discussion-to-lead (top performer)
- Software/SaaS: 27.3%
- Real Estate: rangos de 18-46%
- Consulting: 10-50% (alta varianza)
- Regla 100-10-1: 100 ven bot → 10 chatean → 1 convierte (baseline)
- Top performers: 20-35% discussion-to-lead

## 5.3 ROI Típico

- Costo chatbot: $0.50-0.70 por interacción
- Costo humano: $6.00 por interacción
- Ahorro: 30% en soporte
- ROI promedio: 1,275%
- Break-even: Mes 1-2
- 10x retorno: Mes 6-12

---

# 6. ERRORES FATALES COMPROBADOS

## Lo que destruye conversiones:

1. **Mega-prompt con GPT-4o-mini** → Olvida instrucciones, inventa datos
2. **Pedir email/teléfono antes de dar valor** → 70% abandono
3. **BANT como interrogatorio** → Usuario se siente encuestado
4. **Sin nombre ni personalidad** → Desenganche en 8 segundos
5. **Bot confirma disponibilidad que no sabe** → Información falsa = liability legal
6. **Bot da precios exactos sin verificar** → Compromisos que no puede cumplir
7. **Prompts con instrucciones repetidas 3-4 veces** → Desperdicio de tokens, confusión
8. **Demasiados edge cases "por si acaso"** → Complejidad innecesaria
9. **Agent dice "te voy a pasar X" pero no lo da en el mismo mensaje** → UX roto en n8n
10. **Formato bold/bullets en WhatsApp** → No renderiza, se ve roto

## Caso Air Canada (advertencia):
- Bot prometió descuento por duelo que no existía
- Compañía rechazó reembolso
- Terminó en lawsuit
- LECCIÓN: El bot NUNCA debe hacer compromisos vinculantes

## Caso Chevy Dealership (advertencia):
- Bot confirmó compra de Tahoe por $1
- Sin guardrails de precio
- LECCIÓN: SIEMPRE validar rangos de precio, NUNCA permitir transacciones directas
