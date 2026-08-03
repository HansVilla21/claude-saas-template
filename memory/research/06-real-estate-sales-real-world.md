# Real Estate Sales — Cómo se vende REALMENTE en WhatsApp

**Fecha:** 2026-05-21
**Para:** rediseño de Sofia (chatbot de Hans / agente independiente CR)
**Pregunta madre:** ¿qué hacen los top performers cuando les entra un lead por WhatsApp, antes de mostrar propiedad?
**Hallazgo central (spoiler):** la industria está partida en dos escuelas. La vieja escuela SAAS de Velocify ("speed-to-lead, califica YA, llama YA") y la escuela 2025 de Inman/Josh Ries ("speed-to-lead ≠ speed-to-qualify — calificar antes de ganarte el derecho mata el lead"). Sofia v2 está construida sobre la escuela vieja. Hay que rebalancear.

---

## 1. Taxonomía REAL de leads inmobiliarios inbound digital

Cruzando Follow Up Boss, Tom Ferry, KW (MREA), Zenlist, AgentInnerCircle, Jamil Academy, Inman y los blogs LATAM, los **perfiles consistentes** que aparecen una y otra vez son 5. Hay variantes de nombres pero los signals son los mismos.

| # | Perfil (EN / tico) | Señales en el primer mensaje | % del inbound | Qué hacen los top con ellos |
|---|---|---|---|---|
| **1** | **Tire-kicker / Looker** (curioso, “preguntón”) | "¿cuánto vale?", "¿sigue disponible?", "info?", sin dar nombre, sin decir para qué, una sola pregunta corta, no contesta back-and-forth, "estoy viendo opciones nomás" | **50–70%** del inbound digital (Zillow, FB ads, formularios web). Conversion: **0.4–1.2%** según Jamil Academy y Real Geeks. | Responder rápido **con valor** (1 dato + 1 pregunta abierta), NO calificarlo al toque. Meterlo a nurture largo (12–16 meses según Inman). El error es quemarlo con cuestionario. |
| **2** | **Active shopper / Bottom-funnel** (comprador activo) | menciona propiedad específica ("vi la de Escazú con piscina"), pregunta detalles concretos (m², cuartos, parqueos), pregunta por visita o tour, da nombre, propone hora | **15–25%** del inbound. Conversion **5–9%** (Zillow Premier Agent). | **Llamar / videollamada en <5 min**. Aquí el “5-minute rule” (MIT 2007 + Velocify) sí aplica: 21× más probabilidad de calificar si respondés <5 min vs 30 min. NO sigas texteando si ya dieron señal de visita — proponé hora HOY. |
| **3** | **Hot / Ready-now** (caliente) | timing explícito ("para diciembre", "este mes"), preaprobación bancaria mencionada, "tengo el efectivo", "ya vendí la mía", "necesito mudarme antes de…" | **5–10%** del inbound (raro). Conversion **15–25%+** | Apagar el bot. Handoff humano inmediato. Llamar en 60 segundos si es posible. |
| **4** | **Investor / Renta** (inversor) | habla en términos de cap rate, ROI, plusvalía, alquiler vacacional/Airbnb, "para alquilar", "para inversión", menciona varias propiedades, pregunta gastos comunes / IBI / mantenimiento | **5–10%** | Calificación distinta: en lugar de "para cuándo te mudás" preguntar **cash disponible**, **horizonte de retorno**, **estrategia (long-term/short-term)**. NO mostrar propiedad emocional ("imaginate viviendo aquí"). |
| **5** | **Browser / Top-funnel** (turista del mercado) | "solo estoy viendo", "para más adelante", "todavía no es seguro", responde tarde, da info vaga, sin nombre, sin urgencia, sin presupuesto definido | **10–20%** del inbound (mucho de FB ads y Google Display). Conversion **<0.5%** sin nurture. | **Drip largo + contenido**, no presión. Pedir email/nombre para "mandarte actualizaciones de mercado". Salir del WhatsApp lo antes posible para no quemar la línea. |

> **Nota sobre el lead #1 (info-only):** este es el grupo que David Retana llamó "el 80% que más quita tiempo pero menos deja". La industria lo confirma: 50–70% del inbound digital pertenece a este bucket. **NO es un problema de Hans — es la realidad estructural del canal.** Sofia tiene que estar diseñada principalmente para este perfil, no para el #3.

**Sobre etiquetado en CRM (FUB, Vitrina Raíz, kvCORE):**
El estándar de la industria es 6 etiquetas operativas (no las 5 de arriba que son perfiles psicográficos):
- `Lead Nuevo` — sin conversación bidireccional aún
- `Interesado` — ya hubo back-and-forth, dio data básica
- `Visitó` — pisó la propiedad
- `Negociando` — propuesta sobre la mesa
- `Cliente` — cerrado
- `No Calificado` — descartado (baja capacidad o no fit)

KW/Gary Keller (MREA) lo simplifica aún más a **2 categorías**: `Leads` (sin conversación bidireccional) y `Contacts` (con relación de valor establecida). El resto es nurture.

---

## 2. Flow real de atención por perfil — qué responde el agente en mensaje 1, 2, 3…

### Perfil 1 — Tire-kicker / "info-only"
Este es el bucket más grande y donde la mayoría de Sofia v2 está mal calibrada.

**Mensaje 1 del lead:** "Hola, ¿cuánto vale la casa de Escazú?" / "¿sigue disponible?"

**Tres escuelas de respuesta — cuál usar:**

**Escuela A (vieja, FUB / Tom Ferry):** califica corto.
> *"Hi [name], re: [property], what's the best time for me to call?"* (Follow Up Boss)
>
> *"Got your message on [source]. When is a good time to call you?"* (FUB)

Problema: este patrón es el que mata leads info-only. Asume que ya están listos para call — y no lo están. Inman 2025: "qualifying too early kills trust".

**Escuela B (LATAM / vitrinaraiz.com):** **valor + diagnóstico disfrazado**.
> *"¡Hola! Sí, el departamento en [zona] sigue disponible. Tiene [m²], [recámaras], [baños]…"* (kosmo.com.mx)
>
> Y luego: *"Cuéntame qué estás visualizando"* en lugar de "¿cuánto es tu presupuesto?" (whato.app)

Esta es la línea que LATAM tiene mejor que USA: **da el dato primero, después conversa.** En cultura LATAM "primero precio, después conversación" es la norma. En USA es al revés porque el agente cobra comisión del comprador (allá) — acá no.

**Escuela C (Inman / Josh Ries 2025):** **value-first, sin pedir nada**.
> *"Thanks for reaching out. Here's the info you asked about [link]. Unless you need anything else from me?"* (literal de Inman)

La frase "unless you need anything else from me?" es la **red de seguridad** — si el lead es bottom-funnel real, va a decir "sí, ¿puedo verla?". Si es tire-kicker, dice "no gracias" y vos no quemaste capital de paciencia.

**Recomendación para Sofia (síntesis):** mezcla de B + C. Da el dato → frase abierta no-obligatoria → si el lead reacciona, ahí sí calificás (y solo si reacciona).

**Mensaje 2 del agente (si el lead respondió pero sin urgencia):**
> "Listo, te mando ficha completa con fotos. Mientras la ves, contame: andás viendo por una zona específica o estás abierto?"

UNA pregunta, abierta, sin presión.

**Mensaje 3:** si responde, ahí empezás a calificar suave (zona → timing → para vos/familia). **Nunca presupuesto en mensaje 2 o 3.** El presupuesto se da después de que sienta dolor o sueñe — no antes.

**Cuándo escalar a llamada o visita:** sólo cuando el lead **pida** ver o llamar. NO pedirlo proactivamente en los primeros 5 turnos. Cita Reddit r/realtors (8 meses): *"Don't text to learn about client needs. Schedule a buyer consultation"* — pero el matiz LATAM es que esa consultation es por WhatsApp, no presencial. La llamada solo viene cuando hay señal.

**Métricas esperadas para este perfil:**
- 60–70% no responden el mensaje 2 (es normal)
- 10–20% pasan a "interesado" (siguen 5+ turnos)
- 0.5–2% cierran en <12 meses
- 12–16 MESES es el horizon real (Inman, Josh Ries) — no 48h

---

### Perfil 2 — Active shopper (bottom-funnel)
**Mensaje 1 del lead:** "Hola, vi la casa de Curridabat con piscina, me interesa. ¿Cuándo puedo verla?"

**Mensaje 1 del agente:** confirma + propone hora (sin filtros).
> "Buenísimo, te calza hoy a las 4 o mañana 10am?"

Escala a humano en mensaje 1 o 2 max. **No le metas el cuestionario de 9 preguntas a un active shopper — lo perdés.** Estos leads son raros (15–25%) y cierran en semanas, no meses.

**Mensaje 2–3:** confirma datos básicos para visita (nombre completo, si lleva pareja, financiamiento sí/no — pero como conversación, no formulario).

**Métricas:**
- 25–35% de los active shoppers piden visita en mensaje 1 o 2
- 8–12% cierran consultation
- 5–8% firman buyer agreement
- 3–5% cierran en 12 meses (datos Jamil Academy open house leads, comparable)

---

### Perfil 3 — Hot / Ready-now
**Mensaje 1 del lead:** "Necesito mudarme antes de octubre, ya vendí mi casa. Estoy buscando 2 cuartos en Heredia entre $200k y $250k. ¿Tenés algo?"

Aquí es donde el bot **no debería estar**. La regla es: si en mensaje 1 el lead ya dio timing + presupuesto + zona, **apagar el bot y pasar a Hans en <5 min**. Es el único bucket donde el "5-minute rule" de MIT/Velocify aplica linealmente.

Si Hans no está disponible, el bot debe confirmar disponibilidad ("Hans te llama en X minutos") y NO seguir conversando — cualquier cosa que diga el bot ahí es riesgo de cagarla (el miedo MASTER de David Retana).

---

### Perfil 4 — Investor / Renta
**Mensaje 1 del lead:** "Hola, busco propiedad para Airbnb en Tamarindo, manejo entre $300k y $500k cash."

**Mensaje 1 del agente:** registra señal de cash + estrategia, NO empieza con sueño emocional.
> "Mirá, en Tamarindo el ROI promedio en alquiler vacacional está en 8–12% bruto. Tengo 3 propiedades en ese rango con esos números. Te las paso?"

Pivotear lenguaje: **ROI, cap rate, ocupación, gastos comunes, IBI, financiamiento**. NO "imaginate viviendo ahí". El investor no compra emoción.

Calificación distinta: cash disponible (no presupuesto financiado), horizonte (5/10 años), estrategia (long-term rental vs short-term), si ya tiene otras propiedades.

---

### Perfil 5 — Browser (top-funnel, "para más adelante")
**Mensaje 1 del lead:** "Hola, todavía no es seguro pero estoy viendo opciones para el año que viene."

**Mensaje 1 del agente:** **sacarlo del WhatsApp activo y meterlo en nurture asincrónico**.
> "Perfecto. Para no estar saturándote por acá, te mando 1 vez por mes propiedades nuevas que calcen + tendencias de precios en la zona que te interese. ¿Me decís zona y rango aproximado?"

Esto es lo que Inman llama "earn the right" + "delay qualification". Ningún cuestionario, ninguna call. Drip de bajo costo cognitivo, durante 12–18 meses. Cuando madure, vuelve.

---

## 3. Frameworks específicos del vertical inmobiliario

### A. The Lead Generation Model (KW / MREA — Gary Keller, Dave Jenks, Jay Papasan)
**Lo bueno para Sofia:**
- Distingue `Leads` (sin conversación bidireccional) vs `Contacts` (con). Sofia mide bien esto: el handoff a Hans = transición de Lead a Contact.
- "19 to connect" framework: requiere ~19 touches sobre 12 meses para convertir lead frío. Implica que el horizonte de conversión inbound = año, no semana.
- Categorización **por intereses compartidos** (zona, etapa de vida, familia) en lugar de A/B/C. Coincide con la lógica del CRM por etiquetas tipo Vitrina Raíz.

**Lo que NO sirve para Sofia:**
- MREA es muy database-heavy / outbound. Sofia es inbound puro.

### B. Speed-to-Qualify (Josh Ries / Inman, 2025) — el framework más relevante
Esto es lo más reciente y lo más aplicable al rediseño. Josh Ries es real estate broker + lead gen consultant. Su tesis:

> *"Speed-to-lead is not the same as speed-to-qualify. Speed gets you noticed, but trust gets you hired."*

Su framework de 3 calls:
1. **Call 1 (10–15 seg):** ofrecer recurso útil (reporte de zona, market update). Cerrar con *"Thanks. Unless you need anything else from me?"* y pausa. Si el lead es bottom-funnel, ahí mismo te lo dice. Si no, no insistas.
2. **Call 2 (10–15 seg, 5–7 días después):** confirmar si vieron el recurso. Misma red de seguridad.
3. **Call 3:** una semana antes mandar algo nuevo. Si hay rapport → calificás. Si no → repetís el patrón.

> *"You earn the right to ask deeper questions by showing up consistently and providing value first."*

Su data: los leads inbound de internet (Zillow, FB) convierten en **12–16 meses**, no en días. NAR data is mixed, pero KW dice 6.37% lifetime y la mayoría de top producers compran ese marco.

**Esto es lo más opuesto a Sofia v2 actual.** Sofia v2 (SPSP) hace las 9 preguntas en los primeros 5–8 turnos. Eso es speed-to-qualify, no speed-to-trust. Aplicado a un info-only lead → quema.

### C. Ninja Selling (Larry Kendall) — filosofía complementaria
**"Stop selling, start solving."** No tiene framework operativo de 5 pasos para inbound, pero la frase es la línea editorial que falta en Sofia. Aplicado:

- En lugar de "¿cuál es tu presupuesto?" → "¿qué te llamó la atención de esa propiedad?"
- En lugar de "¿para cuándo necesitás mudarte?" → "¿qué te hace querer cambiar de casa?"
- Pregunta el WHY, no el WHAT.

Ninja Nine = 5 hábitos diarios + 4 semanales. Eso es para el agente, no para el bot. Pero la filosofía aplica.

### D. Tom Ferry — buyer scripts
**Buyer Objection Trifecta** (3 preguntas en secuencia, para objeción de mercado):
1. "What's the latest on the real estate market?"
2. "Would you mind sharing your sources?"
3. "Has anyone taken the time to show you the real data on our local market?"

**Pregunta clave de calificación (la más importante de Ferry):**
> *"How long do you intend to reside in this home?"*

Esta pregunta hace 3 cosas a la vez: descubre uso (vivir vs invertir), descubre horizonte vital, y mete la idea de propiedad a largo plazo en la mente. **Vale la pena incluirla en Sofia para el perfil 1 (curioso) en mensaje 5–6, no antes.**

### E. Ricky Carruth (Zero to Diamond)
No publica scripts cerrados pero su filosofía es:
> *"The problem with most scripts is that they aren't designed to figure out what you can do for the client — they're designed to figure out what the client can do for you."*

Aplicación: cada pregunta de calificación en Sofia debe poder ser respondida con "esto me sirve a MÍ (el lead) para…" en lugar de "esto le sirve al agente para…".

Test rápido:
- "¿Cuál es tu presupuesto?" → sirve al agente. ❌
- "¿Andás viendo dentro de un rango específico o estás abierto a ver de todo?" → sirve al lead (le ayuda a sentirse menos comprometido y a recibir mejores opciones). ✅

### F. Buffini & Mike Sherrard — irrelevantes
Buffini es referral-based, no inbound. Mike Sherrard es content/Instagram, no first-message tactics. Mencionar solo si Hans hace contenido orgánico — fuera de scope de Sofia.

---

## 4. Anti-patterns que matan leads inmobiliarios en los primeros 3 turnos

Cross-referenced de SmartAlto, Inman, FUB, vitrinaraiz.com, listedkit, Reddit r/realtors:

| # | Anti-pattern | Por qué mata | Fuente |
|---|---|---|---|
| 1 | **Calificar en mensaje 1** ("¿estás preaprobado?", "¿cuál es tu presupuesto?") | Pone al lead a la defensiva. Asume relación que no existe. Inman 2025: "qualifying too early kills trust". | Inman (Ries 2025), Smartalto |
| 2 | **Cuestionario de 5+ preguntas en los primeros 3 turnos** | Sienta a robot/banco. El lead se va. Sofia v2 hace 9 preguntas — riesgo alto. | David Retana feedback + Smartalto |
| 3 | **No dar precio cuando lo piden** | En LATAM **es la norma cultural** dar precio. Esconderlo se siente engañoso. Distinto a USA. | kosmo.com.mx, vitrinaraiz.com |
| 4 | **Mensajes >3 líneas** | El lead skim, pierde el next-step, deja en visto. "60 caracteres max" (theclose.com). | TheClose, FUB |
| 5 | **"Just checking in"** sin valor | Smartalto: "goes straight to delete pile". | Smartalto, agentinnercircle |
| 6 | **Sonar a robot / scripted** | El lead lo huele en 2 mensajes. Sofia tiene reglas de puntuación pero el ritmo escripteado se siente igual. | Inman ("buyers recognize scripts instantly"), Reddit r/realtors |
| 7 | **Pedir teléfono cuando ya está en WhatsApp** | WhatsApp ES teléfono. Redundante y desconfiado. | (deducido, no en fuente) |
| 8 | **No responder en <5 min en horario hábil** | MIT 2007: 21× menos probabilidad de calificar si respondés en 30 min vs 5 min. 100× menos contacto. | MIT/InsideSales 2007, Velocify 2012 |
| 9 | **Abandonar follow-up después del primer intento** | 44% de los agentes lo hacen. "Most purchase decisions happen between touch 3 and 5." | kosmo.com.mx |
| 10 | **Pedir confirmación de visita SIN propuesta de hora** | "¿Querés agendar visita?" en lugar de "¿hoy 4pm o mañana 10am?" — la pregunta abierta posterga, la cerrada cierra. | Tom Ferry, FUB |
| 11 | **Mandar listings sin contexto / catálogo masivo** | "Parece spam automatizado" (vitrinaraiz). Mata trust. | Vitrinaraiz, whato.app |
| 12 | **Discutir financiamiento / dinero por texto antes de rapport** | Sensible. SMS-Magic: "avoid discussing sensitive topics like financials via text" inicial. | SMS-Magic, marketleader |

---

## 5. Hooks de apertura que funcionan en WhatsApp inmobiliario

Lo que **NO funciona** (probado):
- "Hola, ¿cómo te llamás?" → demasiado interrogatorio para mensaje 1. Mejor presentarse vos y dejar que ellos contesten.
- "Estimado cliente…" → muerto, robótico, LATAM no usa eso por WhatsApp.
- "¡Bienvenido! Soy un asistente virtual" → quema confianza inmediato.

Lo que **SÍ funciona** (cross-source):

**Patrón A — Confirmación + valor (LATAM, vitrinaraiz/kosmo):**
> "¡Hola! Sí, sigue disponible. Te paso ficha con fotos."

**Patrón B — Confirmación + valor + diagnóstico disfrazado:**
> "Listo, sí está disponible. Antes de mandarte detalles — contame qué te llamó la atención de esa, así te paso info útil y no solo el folleto."

**Patrón C — Ries / Inman (USA 2025) adaptado a LATAM:**
> "Hola, gracias por escribir. Te mando info de [propiedad] ahora mismo. Si necesitás algo más, decime."

**Patrón D — Tom Ferry style (curiosidad):**
> "Hola [nombre si lo tenés], vi que escribiste por [propiedad]. ¿Qué te llamó la atención de esa específicamente?"

**Patrón E — Apertura "still available" (la pregunta más común del lead):**
> Lead: *"¿sigue disponible?"*
> Agente: *"Sí, sigue disponible. ¿La viste por algún portal o te la pasó alguien?"*

Por qué funciona: el "still available" es la pregunta más común porque el lead asume que las propiedades en portales son obsoletas. Confirmar disponibilidad en mensaje 1 + 1 pregunta micro-no-amenazante = perfecto. Vitrinaraiz lo dice literal: *"muchas decisiones empiezan con 'sigue disponible' y lo que pasa después define si agenda visita o se va con otro."*

**Sobre la frase de cierre de mensaje (Ries 2025):**
> *"Si necesitás algo más, decime."* / *"Cualquier cosa que te pinte rara, me decís."*

Esa cláusula final actúa como red de seguridad emocional: el lead sabe que puede irse sin culpa. Paradójicamente eso baja la guardia y aumenta engagement.

---

## 6. SÍNTESIS — el flow correcto para Sofia v4

### Cambios duros respecto a Sofia v2

| v2 (SPSP) | v4 (recomendada) |
|---|---|
| Sofia hace las 9 preguntas en turnos 1–8, después muestra propiedad. | Sofia da el dato concreto que pidieron en el turno 1. Solo después califica suave. |
| Trato uniforme — mismo cuestionario para todos los leads. | Sofia detecta perfil en turno 1–2 y bifurca: tire-kicker → drip; active shopper → handoff <5 min; hot → handoff inmediato. |
| Calificación financiera explícita ("¿cuánto andás manejando?") en turno 6–7. | Calificación financiera NUNCA en los primeros 5 turnos. Solo después de que haya dolor o sueño verbalizado por el lead. |
| Asume conversión en días/semanas. | Asume conversión en **12–16 meses** para el 50–70% de leads (Ries / Inman). Nurture largo. |
| Bot hace todo el funnel hasta CALIFICACIÓN. | Bot hace los primeros 3 turnos. Si lead muestra señal de visita/llamada, handoff a Hans en mensaje 4–5 máximo. |

### Flow propuesto Sofia v4 (por perfil)

**Turno 1 universal (todos los perfiles):** Sofia confirma + da el dato + 1 pregunta abierta blanda.
> Lead: *"Hola, ¿sigue disponible la de Curridabat?"*
> Sofia: *"Hola, sí sigue disponible. Te paso ficha con fotos en 1 min. Mientras tanto contame — la viste en algún portal o alguien te la pasó?"*

**Turno 2:** Sofia clasifica perfil según respuesta.
- Si lead pregunta más detalles concretos (precio final, m², visita) → marcado como **active shopper**, ofrecer visita en turno 3.
- Si lead dice "solo viendo" / "para más adelante" → marcado como **tire-kicker/browser**, propone drip suave en turno 3.
- Si lead da timing + presupuesto + zona sin que se lo pidan → marcado como **hot**, handoff inmediato.

**Turno 3 (tire-kicker / info-only):**
> Sofia: *"Listo. Mirá, tengo otras 3 propiedades parecidas en la zona en ese rango. Te las mando todas juntas o preferís que te avise solo cuando salga algo que calce con lo que andás buscando?"*

Esto hace 2 cosas: (a) ofrece value sin pedir nada, (b) detecta engagement (si dice "todas" → caliente; si dice "avisame" → drip; si no responde → dropped).

**Turnos 4–6:** solo si el lead sigue activo. Acá sí entra calificación, pero **una pregunta por turno**, en lenguaje Ninja Selling ("¿qué te haría considerar mudarte ahora vs el año que viene?" en lugar de "¿para cuándo necesitás estar mudándote?").

**Turno 7+:** si no hay handoff aún, **escalar a Hans con contexto rico**. No seguir el bot más de 7–8 turnos: empieza a sonar a bot.

### Las 5 reglas inviolables (system prompt v4)

1. **Nunca calificar en los primeros 2 turnos.** Si el lead pidió info, dar info. Una pregunta blanda como máximo.
2. **Si el lead pide precio, dar precio.** Cultura LATAM. No esconder. Si no hay precio, decir "el rango es X–Y según condiciones, ¿te calza ese rango?" — no "te lo dice Hans".
3. **Detectar perfil en turno 2 y bifurcar el flow.** Es la decisión más cara de v2 — el flow es lineal.
4. **Nunca más de 5 preguntas de calificación en toda la conversación.** Y siempre intercaladas con valor, nunca en racimo.
5. **Handoff a Hans cuando: (a) lead pide visita, (b) lead pide hablar/llamar, (c) lead da los 3 datos (timing+budget+zona) sin pedir, (d) Sofia llegó a turno 7–8 sin avance, (e) Sofia detecta señales fuera de su scope (legales, pareja conflict, financiamiento complejo).**

---

## Resumen de 250 palabras — los 5–7 insights más actionable

1. **El 50–70% del inbound digital es "tire-kicker / info-only".** No es excepción, es la regla estructural del canal. Sofia tiene que estar diseñada PRIMERO para ese perfil, no para el "hot lead" idealizado. (Fuente: Jamil Academy, Real Geeks, Follow Up Boss benchmarks).

2. **"Speed-to-lead ≠ speed-to-qualify".** Josh Ries (Inman 2025) demuestra que calificar antes de ganarse el derecho mata el lead. La regla MIT de los 5 minutos aplica para *responder*, no para *interrogar*. Sofia v2 confunde las dos cosas.

3. **El horizonte real de conversión inbound es 12–16 meses, no 48 horas.** Sofia debe operar como filtro + iniciador de nurture, no como cierre. Esto cambia la métrica de éxito: no es "handoff caliente esta semana", es "lead categorizado y en drip apropiado".

4. **En LATAM, dar precio en mensaje 1 es estándar cultural — no esconderlo.** Esconder precio se lee engaño. La síntesis: dar el dato → diagnóstico disfrazado ("contame qué visualizás") → calificación solo si responde.

5. **Bifurcar el flow por perfil en turno 2 es la mejora más cara de v2.** El flow lineal de 9 preguntas trata igual al curioso, al activo y al inversor — los tres requieren scripts distintos. Detectar perfil temprano y rutearlo es la diferencia entre 0.5% y 5% de conversión.

6. **Máximo 5 preguntas de calificación en TODA la conversación, intercaladas con valor.** Nunca en racimo. Nunca financiero antes del turno 5. Nunca "¿estás preaprobado?" en los primeros 3.

7. **Handoff a Hans no es derrota — es el producto.** El bot que llega a turno 8 sin pasar a humano fracasó. El sweet spot es turnos 3–5 cuando hay señal de active shopper.

---

## Apéndice — fuentes consultadas (links reales)

**USA / Industria mainstream:**
- Follow Up Boss — [Lead flow 2.0: Follow-up sequences for each lead type](https://www.followupboss.com/blog/follow-up-sequences-for-each-lead-type)
- Follow Up Boss — [31 real estate text message scripts](https://www.followupboss.com/blog/texting-real-estate-leads)
- The Close — [36 Best Real Estate Text Message Scripts](https://theclose.com/real-estate-text-message-scripts/)
- Inman / Josh Ries (2025) — [Speed-to-lead is not the same as speed-to-qualify](https://www.inman.com/2025/07/08/speed-to-lead-is-not-the-same-as-speed-to-qualify/)
- Tom Ferry — [Real Estate Text Message Scripts for Grabbing Interest](https://www.tomferry.com/blog/real-estate-text-scripts-for-interest/)
- Tom Ferry — [Best Real Estate Scripts for Buyers: Questions](https://www.tomferry.com/blog/best-buyers-scripts-for-today/)
- KW Outfront — [The Lead Generation Model: Your Ultimate Guide](https://outfront.kw.com/training/the-lead-generation-model-your-ultimate-guide-to-business-growth/)
- Jamil Academy — [Real Estate Lead Conversion Rate Benchmarks 2026](https://www.jamilacademy.com/blog/real-estate-lead-conversion-rate-benchmarks)
- AgentInnerCircle — [7 Motivation-Detective Questions to Qualify Buyers](https://agentinnercircle.com/qualifying-real-estate-buyers/)
- Zenlist — [How to Identify Lookers vs. Buyers](https://blog.zenlist.com/how-to-identify-lookers-vs.-buyers-as-a-real-estate-agent)
- SmartAlto — [3 Biggest Mistakes Texting New Real Estate Leads](https://smartalto.webflow.io/blog/the-3-biggest-mistakes-you-make-when-sending-a-text-to-a-new-real-estate-lead)
- Casey Response — [Lead Response Time Statistics 2026 (MIT, HBR, Velocify)](https://caseyresponse.com/blog/lead-response-time-statistics)

**LATAM / España:**
- Vitrina Raíz (Colombia) — [WhatsApp Business para Agentes Inmobiliarios 2026](https://vitrinaraiz.com/blog/whatsapp-business-agentes-inmobiliarios)
- Kosmo (México) — [Chatbot Inmobiliario: Atiende Prospectos 24/7 por WhatsApp](https://kosmo.com.mx/blog/automatizar-inmobiliaria-whatsapp)
- Whato.app — [15 prompts para vender por WhatsApp para inmobiliarias](https://whato.app/blog/prompts-de-ventas-para-inmobiliarias-whatsapp/)
- Waibot — [Atención inmobiliaria por WhatsApp 2026](https://automatizacion.waibot.io/atencion-inmobiliaria-por-whatsapp/)
- InmoBlog (España) — [Las preguntas clave para clasificar a tus clientes](https://www.inmoblog.com/las-preguntas-clave-para-clasificar-a-tus-clientes/)
- Carlos Pérez-Newman — [Coaching Inmobiliario blog principal](https://www.tupuedesvendermas.com/coach-inmobiliario/) (consultado, sin scripts específicos publicados en abierto)

**Reddit r/realtors (color cualitativo):**
- [What do you guys do to avoid back and forth texting](https://www.reddit.com/r/realtors/comments/1nxj4oy/) — consenso: los agentes top americanos sacan al lead del texto y lo pasan a llamada/visita rápido. Discrepa con LATAM donde WhatsApp ES el canal de cierre.
- [What are the best ways to respond to leads via text/messenger?](https://www.reddit.com/r/realtors/comments/10cb1ze/) — consenso: leer lo que el lead te dijo (sí, literal) y responder a eso, no al script.

**Frameworks (libros / industria):**
- Larry Kendall — *Ninja Selling: Subtle Skills. Big Results.* (Greenleaf, 2017)
- Gary Keller, Dave Jenks, Jay Papasan — *The Millionaire Real Estate Agent* (McGraw-Hill, 2003)
- Ricky Carruth — *Zero to Diamond* podcast & free scripts (rickycarruth.libsyn.com)

**Estudios académicos / data:**
- MIT / Dr. James Oldroyd (con InsideSales.com, 2007) — Lead Response Management Study (15,000 leads)
- Harvard Business Review (2011) — replicación del estudio MIT
- Velocify (2012) — 391% lift en conversión <1 min response
- Drift / InsideSales.com (2017) — promedio B2B 47 horas response
