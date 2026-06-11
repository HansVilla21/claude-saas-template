# Skill: Sales Framework SPSP adaptado a WhatsApp

## Cuándo usar esta skill

- Estás diseñando el system prompt de un agente conversacional de WhatsApp para ventas (inmobiliaria, autos, seguros, servicios B2C high-ticket).
- Ya intentaste un prompt "vanilla SPSP" (Situation → Problem → Solution → Próximos pasos) y los leads se quejan ("ya me cansaste", "demasiadas preguntas").
- Tenés métricas de que >50% de tu inbound es "info-only" (solo quieren info, no comprar ahora) y tu bot los trata a todos como hot leads.
- Tu rate de handoff prematuro al agente humano es alto (bot escala leads que solo querían info).

## Por qué existe esta skill

SPSP textual es un marco de **alta-fricción cara-a-cara** (B2B enterprise, sales calls de 30+ min). Aplicarlo literal en WhatsApp con leads inmobiliarios produce:
1. **Lead irritado** por exceso de preguntas. WhatsApp es asincrónico, alta deserción (>50% se pierde antes de la 3era pregunta).
2. **Bot ciego a "info-only"**. La realidad inmobiliaria LATAM: 50-70% del inbound es info-only (curiosidad, comparar precio, ver fotos), no compradores listos. Horizonte real: 12-16 meses, no 48 horas.
3. **Handoff prematuro al agente humano**. El bot escala leads que solo querían info → agente pierde tiempo → handoff system se desgasta.

Casa CRM (sesión 2026-05-21) descubrimos esto: el bot v3 estaba "cansando" a los leads con SPSP textual. Pivoteamos a SPSP adaptado: bifurcación por perfil, max 5 preguntas total, info first.

## Proceso

### 1. Investigar el mix real de tu inbound

Antes de diseñar el prompt, ver tus mensajes reales:
- ¿Cuántos leads dicen "solo info" / "estoy mirando" en el primer mensaje?
- ¿Cuántos leads piden precio sin que se los preguntes?
- ¿Cuántos leads abandonan después de 3+ preguntas seguidas del bot?

Si no tenés data aún, asumí 50-70% info-only para inmobiliaria LATAM (validado en research público — ver `memory/research/06-real-estate-sales-real-world.md` en Casa CRM).

### 2. Definir los 5 perfiles de lead (bifurcación temprana)

| Perfil | Señal en el mensaje 1-2 | Estrategia |
|---|---|---|
| **info-only** | "Hola, info por favor", "tienen X?", pregunta de precio directa | Dar info útil. NO calificar. Cerrar suave con "si querés ver más, decime" |
| **casual browser** | "Estoy mirando", "no estoy apurado", interés vago | 1-2 preguntas suaves. Info ofrecida. No empujar |
| **active shopper** | Menciona presupuesto/zona/fechas, hace seguimiento | SPSP completo pero corto. 3-4 preguntas máx |
| **hot lead** | "Quiero ver esta semana", urgencia explícita, presupuesto claro | Calificar 1-2 preguntas + ofrecer cita / handoff inmediato |
| **investor** | Habla de ROI, alquiler vacacional, números | Tratar como B2B: data, comparables, ofrecer call con agente |

El bot debe **clasificar el perfil en el TURNO 2 (no antes, no después)**. Antes es muy temprano (no hay señal); después ya cansó al lead.

### 3. Reglas inviolables del prompt

```markdown
## REGLAS NO NEGOCIABLES

1. **MAX 5 PREGUNTAS** en toda la conversación. Si llegaste a 5, no más preguntas — solo info + cierre.
2. **DAR PRECIO EN EL MENSAJE 1 SI LO PIDEN**. En LATAM, ocultar precio = percepción de engaño. Si el lead pregunta "cuánto", responder con el rango antes de calificar.
3. **NUNCA preguntas múltiples en un mismo mensaje**. Una pregunta por turno.
4. **NUNCA dos preguntas seguidas sin info útil intercalada**. Lead pregunta X → bot responde X + opcional 1 pregunta de calificación.
5. **CLASIFICAR PERFIL EN TURNO 2**, ajustar tono. Info-only NO recibe preguntas de calificación, solo info.
6. **CERRAR SUAVE** después de dar info. "Si te interesa ver más, decime" o "querés que te mande la ubicación?". NO "necesito tu nombre y teléfono para enviarte la info" (eso es spam).
```

### 4. Triggers explícitos de handoff (4 condiciones AND verificables)

El bot debe pasar al agente humano SOLO si TODAS estas son verdaderas:

1. ✅ El lead expresó **intención clara de comprar** (no "solo info")
2. ✅ El lead dio al menos **presupuesto + zona** o **interés en propiedad específica**
3. ✅ El bot ya respondió **al menos una ronda completa** (no es handoff en mensaje 1)
4. ✅ El lead **pide hablar con un humano**, **quiere agendar visita**, o **hace una objeción que el bot no puede responder con info de DB**

Si CUALQUIERA falla → no handoff, seguir conversando o cerrar suave.

```markdown
## HANDOFF — CUÁNDO ESCALAR AL AGENTE

Pasar al agente humano SOLO si las 4 condiciones son verdaderas:

1. Intención clara: el lead dijo "quiero comprar", "quiero visitar", "necesito ayuda con esta", etc.
2. Datos mínimos: el lead dio presupuesto Y zona, o expresó interés en una propiedad específica con código.
3. Ronda completa: ya intercambiaste al menos 2 mensajes, no escales en turno 1.
4. Trigger explícito: pide hablar con humano, quiere agendar visita, o tiene una objeción tipo "necesito hablar con mi pareja antes de avanzar".

Si DUDÁS, NO escales. Es mejor seguir conversando que escalar a un lead que solo quería info.
```

### 5. Manejo de objeciones (las 7 más comunes)

| Objeción | Respuesta del bot |
|---|---|
| "Está caro" | Ofrecer alternativa más barata en zona + comparable de la misma zona |
| "Necesito pensar" | Ok suave. "Cuando quieras te mando más opciones. ¿Hay algo específico que te haga dudar?" |
| "Quiero hablar con mi pareja" | OK + handoff (perfil hot) |
| "Necesito ver fotos" | Mandar foto vía marker `[IMG:CR-XXXX]` (ver skill `bot-llm-marker-expand-pattern`) |
| "Está lejos de mi trabajo" | Preguntar dónde queda el trabajo → ofrecer alternativas más cerca |
| "Necesito financiamiento" | Info general + handoff suave ("nuestro agente puede armar números con vos") |
| "Solo estoy mirando" | Reconocer + info + cierre suave. **NO** calificar. |

### 6. Restricciones de tono

- Mensajes cortos (max 3 líneas por chunk en WhatsApp)
- Cero formalidad excesiva. Tuteo, voseo o usted según mercado (CR usa "vos" en Tico moderno)
- Cero emojis exageros. Uno cada 4-5 mensajes max. Si tu marca es seria, cero.
- Cero "perdón por molestar" / "disculpe la pregunta" — proyecta debilidad

### 7. Estructura del flujo (NO lineal)

El SPSP textual es lineal: S → P → S → P. WhatsApp inmobiliario es **state-machine con bifurcaciones**:

```
[turno 1: saludo + qué necesitan]
  ↓
[turno 2: clasificar perfil] ─→ info-only ─→ [info + cierre suave]
                              ─→ casual ────→ [1-2 preguntas + info]
                              ─→ active ────→ [3-4 preguntas + match + propuesta]
                              ─→ hot ───────→ [1-2 preg + handoff]
                              ─→ investor ──→ [data ROI + handoff agente]
```

## Output esperado

1. System prompt del agente LLM con:
   - Reglas inviolables (max preguntas, precio first, etc.)
   - Perfiles de lead + bifurcación en turno 2
   - Triggers de handoff con 4 AND-conditions verificables
   - Catálogo de objeciones + respuestas
   - Tono + restricciones
2. Few-shot examples del turno 2 (clasificación) y de cada perfil
3. Documento de soporte en `memory/sales-framework.md` con la versión consolidada para referencia humana

## Ejemplo concreto (Casa CRM, Sofia v5.1+)

- Documento maestro: [memory/sales-framework.md](memory/sales-framework.md) — 6 fases SPSP adaptadas + 26 preguntas catálogo + 7 objeciones + 10 reglas inviolables
- Research base: [memory/research/06-real-estate-sales-real-world.md](memory/research/06-real-estate-sales-real-world.md) — destilado de Josh Ries / Inman 2025, Reddit r/realestate
- System prompt vigente: Sofia v5.1 prompt en [memory/research/10-sofia-v5.1-prompt.md](memory/research/10-sofia-v5.1-prompt.md)
- Resultado en prod (sesión 2026-05-21): leads info-only NO reciben preguntas de calificación, leads hot reciben handoff con 4 AND-conditions cumplidas, bot deja de "cansar".

## Gotchas / antipattern

- **NO** aplicar SPSP textual sin modificar. En WhatsApp lo va a sentir el lead como un interrogatorio.
- **NO** preguntar nombre / teléfono / email al inicio. El lead ya está en WhatsApp, ya tenés el teléfono. Pedir info personal en mensaje 1 = spam-mode.
- **NO** ocultar precios. En LATAM eso es señal de engaño. Si tu mercado es distinto, validar.
- **NO** clasificar perfil en turno 1. No hay señal. Esperar al turno 2.
- **NO** dejar el bot conversar 10+ mensajes con un lead info-only. Después de 4-5 mensajes sin signal de compra, cerrar suave y soltar.
- **NO** dejar al LLM "decidir libremente" cuándo escalar handoff. Las 4 AND-conditions son verificables — programalas explícitas en el prompt.
- **NO** mostrarle al lead que sos bot ("soy IA, te ayudo con..."). Identificate como asistente del agente X. Honestidad pero sin disclaimer formal.

## Skills relacionadas

- `langchain-agent-prompt-design` (.claude/skills/) — para escribir el prompt con CO-STAR + TIDD-EC
- `bot-llm-marker-expand-pattern` — para que el bot pueda mandar fotos cuando el lead pide info visual
- `bot-handoff-system-end-to-end` — el sistema que recibe los handoffs disparados por las 4 AND-conditions
- `descubrir-dolor` (.agent/skills/) — la investigación previa para identificar perfiles y objeciones reales

## Frameworks relacionados

- `memory/frameworks/hormozi.md` — value equation, ofertas irrechazables. Útil cuando el lead pasa de info-only a active shopper.
