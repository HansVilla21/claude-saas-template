# Destilado de 4 Repos GitHub — Aplicabilidad a Casa CRM + Sofia

**Fecha:** 2026-05-20
**Investigador:** Claude (sesión orquestada por Hans)
**Misión:** Decidir qué importar, qué adaptar y qué descartar de 4 repos pasados como referencia para diseñar el sistema de venta automatizada (Sofia = bot WhatsApp inmobiliario + skills Claude del template).

---

## Resumen de hallazgos (TL;DR)

| Repo | Stars | Estado | Calidad | Aporta a Sofia |
|---|---|---|---|---|
| `louisblythe/Sales-Skills` | 30 (fork) | Stale 4 meses (push 2026-01-24) | **3/5** | Mucho, pero hay que filtrar agresivo |
| `ckelsoe/prompt-architect` | 169 | Activo (v3.2.2 marzo) | **4/5** | Sí — como meta-skill para diseñar prompts del bot |
| `VoltAgent/awesome-agent-skills` | 22.5k | Activo (push 2026-05-10) | **3/5** | Casi nada — es lista de links curados |
| `Prospeda/claude-gtm-skills` | 11 | Activo pero esquelético | **1.5/5** | Casi nada — marketing humo |

**Top decision:** El único repo realmente valioso para nuestro caso es **Sales-Skills** (con filtro fuerte), y **prompt-architect** como herramienta auxiliar para diseñar/iterar los system prompts de Sofia. Los otros dos son ruido.

---

## Repo 1: `louisblythe/Sales-Skills`

### Qué es
Colección de ~120 "skills" markdown para Claude Code orientadas a sales bots y procesos B2B (lead qualification, intent detection, handoff, conversation memory, sentiment, etc.). Cada skill es un SKILL.md con frontmatter + cuerpo prescriptivo en formato "You are an expert in X — initial assessment → principles → frameworks → implementation".

### Estado
- **Stars:** 30 (es un FORK de `coreyhaines31/marketingskills` — el padre tiene 29.7k stars)
- **Último push:** 2026-01-24 (4 meses sin tocar)
- **Verdict:** abandonado/snapshot. No vale la pena hacer submodule porque no se va a actualizar.

### Calidad percibida: **3/5**
- Pro: cubre amplísimo (lead-qualification, intent-detection, handoff-detection, conversation-memory, response-length-calibration, objection-handling, sentiment-analysis, scarcity-urgency-calibration, etc. — 120 skills).
- Pro: estructura consistente (frontmatter `name`/`description` correcto, secciones repetidas, ejemplos de código).
- Contra: **muy genérico B2B-tech-SDR**. Habla de SMS/email/CRM tradicional, no de WhatsApp 1:1 conversacional LATAM ni de venta consultiva inmobiliaria.
- Contra: muchas skills son redundantes entre sí (ej: `lead-qualification`, `lead-qualification-logic`, `qualifying-leads` son la misma idea con nombres distintos — síntoma de generación masiva).
- Contra: no hay ejemplos en español ni vocabulario "tico". Va a sentirse robótico si se copia tal cual a Sofia.

### 3-5 ideas/patrones específicos que valdría adoptar

1. **El patrón "Initial Assessment" al inicio de cada skill** — antes de prescribir, el skill obliga al agente a hacer 3 preguntas (contexto / current state / goals). Esto evita que el agente improvise sin info. Aplicable a casi todos nuestros agentes.

2. **`handoff-detection` — taxonomía explícita de triggers** — separa triggers en: Explicit Request / Sentiment / Complexity / Failure / Value-Based. Cada uno con código pseudo-implementable (`if (clarification_attempts >= 2) escalate(...)`). Directamente aplicable al nodo de N8N "¿el bot apaga su loop?".

3. **`response-length-calibration` — normas por canal con ejemplos antes/después** — patrón "wrong way / right way" con caracteres contados. Inmediatamente aplicable al system prompt de Sofia para WhatsApp (160 chars segmento óptimo).

4. **`intent-detection` — diccionario de intents con frases ejemplo** — agrupa intents en Positive (Interested / Ready to Buy / Meeting Request) / Negative (Not Interested / Opt-Out / Wrong Person) / Neutral (Question / Objection / Info Request) / Context-Dependent. Podemos reusar la taxonomía y traducirla a español tico.

5. **`conversation-memory` — diferenciación Session vs Cross-Session memory** — útil para el diseño del schema de Supabase: qué guardamos en `conversations` (session) vs qué en `lead_profiles` (cross-session). Confirma decisión arquitectónica.

### 3-5 ideas que NO sirven o son humo

1. **Skills duplicadas con nombres distintos** (`lead-qualification` vs `lead-qualification-logic` vs `qualifying-leads`, o `intent-detection` vs `persona-classification`). Olor a "inflar el catálogo para que parezca robusto". Se descartan duplicados.

2. **Skills enterprise-tech irrelevantes para nosotros**: `propensity-scoring-realtime`, `pipeline-management`, `territory-account-launch`, `multi-stakeholder-thread-management`, `qbr` (quarterly business review). Sirven para Salesforce/HubSpot SDRs B2B, no para un agente inmobiliario solo.

3. **Frameworks BANT/MEDDIC genéricos** — la skill `lead-qualification` los enumera todos en abstracto, pero NO hay un BANT inmobiliario específico (que ya tenemos en `memory/research/01-demo-retana-insights.md` con las 9 preguntas de David). Importar el framework genérico es ruido — ya tenemos algo mejor calibrado.

4. **`sales-psychology`, `urgency-creation`, `social-proof-injection`** — son glosarios de tácticas Cialdini de manual. Hormozi en `memory/frameworks/hormozi.md` ya las cubre con más rigor y aplicado a oferta.

5. **Skills metafísicas vacías**: `resilience`, `adaptability`, `time-management` — son consejos motivacionales para humanos, no instrucciones operativas para agentes IA. Filler.

### Archivos/prompts/skills concretos a importar o adaptar

Recomendación: **clonar manualmente** estas 6 skills al template madre `.claude/skills/` y adaptarlas al contexto inmobiliario LATAM (NO submodule — el repo está stale):

| Skill origen | Destino propuesto | Adaptación |
|---|---|---|
| `handoff-detection/SKILL.md` | `.claude/skills/bot-handoff-design/` | Reescribir con triggers en español + casos inmobiliarios (lead caliente pide visita, frustración, pregunta legal) |
| `response-length-calibration/SKILL.md` | `.claude/skills/whatsapp-response-calibration/` | Recalibrar a normas WhatsApp LATAM (60-120 chars óptimo, sin punto final, sin ¿) |
| `intent-detection/SKILL.md` | `.claude/skills/intent-detection-es/` | Traducir taxonomía + agregar intents inmobiliarios ("dame info", "cuánto vale", "voy a verla", "ando alquilando") |
| `conversation-memory/SKILL.md` | `.claude/skills/bot-conversation-memory/` | Mapear a schema Supabase concreto (qué columna guarda qué) |
| `objection-handling/SKILL.md` + `objection-recognition/SKILL.md` | `.claude/skills/objeciones-inmobiliario/` | Catálogo de objeciones inmobiliarias reales en español (precio, ubicación, timing, "ya compré por otro lado") |
| `fallback-gracefully/SKILL.md` | `.claude/skills/bot-fallback-design/` | Triggers cuando Sofia no sabe responder (ante duda → escala a humano, NO improvisa) |

**Patrón de naming:** seguir convención del template (kebab-case, prefijo de dominio cuando aplica).

---

## Repo 2: `ckelsoe/prompt-architect`

### Qué es
Skill meta-prompting. Analiza un prompt que vos le das, lo evalúa en 5 dimensiones (clarity/specificity/context/constraints/format), detecta tu intención (CREATE/TRANSFORM/REASON/CRITIQUE/RECOVER/CLARIFY/AGENTIC) y aplica uno de 27 frameworks prompt-engineering (CO-STAR, TIDD-EC, RACE, CRISPE, BROKE, CARE, RISEN, Chain-of-Thought, Tree-of-Thought, ReAct, etc.).

### Estado
- **Stars:** 169
- **Última versión:** v3.2.2 (marzo 2026) — activo y mantenido
- **MIT license** — instalable como skill independiente

### Calidad percibida: **4/5**
- Pro: framework selection table con criterios discriminantes claros (cada framework con su "signal" para saber cuándo usarlo).
- Pro: los 27 frameworks están documentados como archivos separados (`references/frameworks/co-star.md`, etc.). Modular, fácil de leer parcialmente.
- Pro: el proceso de mejora es iterativo (assess → identify intent → ask clarifying questions → apply template → present).
- Contra: 27 frameworks es exceso teórico. En la práctica, para diseñar prompts de Sofia vamos a usar **3-4 máximo** (CO-STAR para system prompt, TIDD-EC para reglas hard, RISEN para procedimientos, BROKE si es deliverable medible).
- Contra: no es plug-and-play para un caso específico — es una skill genérica de prompt-engineering. Sirve como "asesor de prompts", no como solución directa.

### 3-5 ideas/patrones específicos que valdría adoptar

1. **CO-STAR para diseñar el system prompt de Sofia** — Context / Objective / Style / Tone / Audience / Response. Es el mejor framework genérico para un agente conversacional. Aplicación directa: reescribir el system prompt actual con esta estructura.

2. **TIDD-EC para las reglas duras de Sofia** — Task / Instructions / Do / Don't / Examples / Constraints. Específicamente la sección "Do / Don't" resuelve el miedo de David Retana ("que no eche para atrás al lead"). Lista explícita de qué NO hacer (no usar ¿, no terminar con punto, no inventar precios, no prometer visita sin confirmar agente, etc.).

3. **Self-Refine loop como evaluador de respuestas del bot** — el patrón "generar → criticar → revisar" se puede implementar en N8N como un nodo de evaluación antes de enviar mensaje al cliente (especialmente útil cuando confianza < threshold).

4. **Pre-Mortem framework aplicado a Sofia** — antes de lanzar a producción, ejecutar un Pre-Mortem: "imaginá que en 30 días Sofia arruinó leads de 3 clientes — ¿qué pasó?" → lista de failure modes a prevenir.

5. **Reverse Role Prompting (AI-led interview)** — útil para el discovery: que Sofia NO dispare 9 preguntas seguidas, sino que conduzca como un humano (pregunta → escucha → reacciona → pregunta siguiente basada en la respuesta).

### 3-5 ideas que NO sirven o son humo

1. **22 de los 27 frameworks son académicos** (RPEF, RISE-IE, RISE-IX, Skeleton-of-Thought, Least-to-Most, etc.). Útil saber que existen, no útil aplicarlos.

2. **El sistema de scoring (8.8/10) es teatro** — asignar puntajes numéricos a calidad de prompt es subjetivo, sirve como narrativa para vender la skill en X pero no es métrica real.

3. **El "intent classifier" de prompt-architect** (CREATE vs TRANSFORM vs REASON) es overkill para nuestro caso — en 95% del tiempo sabemos qué queremos.

4. **El argumento de "27 frameworks research-backed" es marketing** — varios frameworks son inventos del autor del repo o adaptaciones cosméticas (RISE-IE vs RISE-IX vs RISEN).

5. **ReAct framework** — aplica a agentes con tool-use largo (LangChain-style). Sofia es un workflow N8N relativamente lineal, no necesita ReAct.

### Archivos/prompts/skills concretos a importar o adaptar

**NO importar la skill completa.** En su lugar:

1. Copiar SOLO 4 framework markdown al template:
   - `references/frameworks/co-star.md` → `memory/frameworks/prompt-co-star.md`
   - `references/frameworks/tidd-ec.md` → `memory/frameworks/prompt-tidd-ec.md`
   - `references/frameworks/self-refine.md` → `memory/frameworks/prompt-self-refine.md`
   - `references/frameworks/pre-mortem.md` → `memory/frameworks/prompt-pre-mortem.md`

2. Crear UN skill nuevo `.claude/skills/prompt-engineer-sofia/SKILL.md` que use estos 4 frameworks como referencia y guíe a Claude para iterar el system prompt de Sofia cuando aparezcan bugs ("Sofia respondió X y echó al lead → analizar con Pre-Mortem qué falló").

---

## Repo 3: `VoltAgent/awesome-agent-skills`

### Qué es
README único de 180KB (¡un archivo!) con 1100+ links a otros repos de skills, organizados por organización (Anthropic, Microsoft, Vercel, Cloudflare, Stripe, Supabase, OpenAI, etc.) y por dominio.

### Estado
- **Stars:** 22.5k
- **Push:** 2026-05-10 (activo)
- **Forks:** 2.4k
- **Tamaño del repo:** 330 KB (solo el README)
- **Contenido propio:** CERO. Es 100% una lista curada (estilo `awesome-*`).

### Calidad percibida: **3/5**
- Pro: una vez que sabés que existe, sirve como índice cuando buscás algo específico ("dónde están las skills oficiales de Stripe").
- Pro: filtro de calidad declarado: "no AI slop, real engineering teams".
- Contra: para nuestro caso (sales bot inmobiliario LATAM) no hay NADA específico en la lista. Las categorías son dev/deploy/infrastructure, marketing genérico, e industrias B2B-tech.
- Contra: 180KB de markdown plano es pésima UX — no hay search, no hay tags, no hay scoring.
- Contra: muchísimas referencias son del mismo autor (`coreyhaines31/marketingskills` y sus 200+ forks), inflando el "ecosistema".

### 3-5 ideas/patrones específicos que valdría adoptar

1. **Saber que existen las skills oficiales de Anthropic** — listadas en la sección Anthropic. Vale la pena revisar `anthropic/skills` para ver cómo Anthropic estructura sus propias skills (autoridad).

2. **Saber que existen las skills oficiales de Supabase** — directamente usable en Casa CRM (`supabase/agent-skills` ya mencionado en MCP instructions). Confirmar versión actual vs lo que ya tenemos.

3. **Patrón de organización por dominio + por proveedor** — útil si algún día publicamos nuestras skills inmobiliarias como repo público.

4. **Listado de marketing skills** (sección marketing/advertising) — confirma cuáles existen como estándar de mercado. Útil para no reinventar lo que ya tenemos en el template (8 marketing skills TIER 1).

5. *(no hay un 5to)*

### 3-5 ideas que NO sirven o son humo

1. **El número "1100+ skills" es engañoso** — la mayoría son forks o reskins de los mismos 5-10 repos núcleo.

2. **No hay nada vertical inmobiliario / LATAM / WhatsApp** — la lista es 99% B2B-tech anglosajón.

3. **Las "community contributions" son ruido** — repos con 0-5 stars que entraron a la lista sin filtro real de calidad pese a lo que dice el README.

4. **El sello "engineering teams" es marketing** — muchos repos listados son de personas individuales sin "team" detrás.

5. **Buscar en el README de 180KB es peor que un Google search.** No vale la pena leerlo entero ni hacer Ctrl+F repetidos.

### Archivos/prompts/skills concretos a importar o adaptar

**Nada para importar.** Recomendación: **bookmark mental** del repo como índice de consulta puntual. Si alguna vez necesitamos "¿hay una skill oficial para X de Stripe/Cloudflare?", venir acá. Punto.

---

## Repo 4: `Prospeda/claude-gtm-skills`

### Qué es
Repositorio que se vende como "2000+ copy-paste prompts para B2B sales y marketing" organizados en 17 directorios (industry / role / workflow / methodology / signals / projects / etc.).

### Estado
- **Stars:** 11
- **Forks:** 1
- **Commits:** 7
- **Verdict del README vs realidad:** **discrepancia masiva**. El README promete 2000+ prompts; el repo tiene ~6 archivos con contenido real. El resto son carpetas con solo `README.md` vacío de prompts.

### Calidad percibida: **1.5/5**
- Pro: la idea de organizar prompts por industria + rol + metodología es buena en concepto.
- Pro: `methodology/meddpicc.md` y `gtm-skills/SKILL.md` son contenido decente (no excelente).
- Contra MAYOR: **el repo está vacío**. 14 de 17 directorios contienen solo un README.md sin prompts. La marca "2000+ prompts" es falsa.
- Contra: el directorio `industry/` tiene UNA carpeta (saas.md) cuando promete 8 industrias.
- Contra: no hay `real-estate` industry pack (que sería lo único directamente útil para nosotros).
- Contra: la skill `gtm-skills/SKILL.md` es un menú de opciones con prompts cortos genéricos — no estructura ni rigor.

### 3-5 ideas/patrones específicos que valdría adoptar

1. **El concepto de "Industry Pack"** — agrupar prompts/skills por vertical (real-estate, healthcare, etc.) es buena arquitectura. Cuando crezcamos a más verticales (turismo, automotriz, etc.), podemos seguir este patrón.

2. **El prompt MEDDPICC de `methodology/meddpicc.md`** — formato útil "WHAT I KNOW: [paste] → for each element: status / gap / risk / next steps". Adaptable a una skill `meddpicc-deal-review` para deals B2B grandes (cuando Casa CRM tenga clientes agencias).

3. **El patrón "argument-hint" en el frontmatter de skill** — `argument-hint: <action> [target]` indica al usuario qué inputs espera la skill. Podemos adoptarlo.

4. **El prompt "Technical Discovery Questions" de SaaS pack** — formato útil: "Generate 10 questions that: 1) ... 2) ... 3) ..." con criterios discriminantes. Reutilizable para diseñar las 9 preguntas inmobiliarias de Sofia.

5. *(no hay 5to — el repo no da más).*

### 3-5 ideas que NO sirven o son humo

1. **"2000+ prompts" es publicidad engañosa.** El repo no tiene ni 50 prompts reales. Si pidiéramos esto a un cliente sería motivo de refund.

2. **`gtm-skills/SKILL.md` como skill principal es un menú con prompts genéricos** ("Research [COMPANY] and provide..."). Cualquier ChatGPT improvisa lo mismo sin la skill.

3. **El `projects/email-writer.md` y `projects/research-assistant.md`** — son system prompts de Claude Projects, no skills. Calidad media, nada que no esté mejor en `copywriting` de nuestro template.

4. **No hay nada de real estate.** Para nuestro caso, este repo es 0% específico.

5. **El framing "ICP discovery" del repo** es mucho más débil que lo que ya tenemos en `.agent/skills/evaluar-icp/` del template madre.

### Archivos/prompts/skills concretos a importar o adaptar

**Importar 1 archivo, adaptado:**

- `methodology/meddpicc.md` → si en futuro vendemos Casa CRM a agencias B2B (no a agentes individuales), adaptar este prompt como `.claude/skills/meddpicc-agencias/`. **Por ahora NO — no es prioridad MVP.**

**Resto del repo: descartar.**

---

# SÍNTESIS

## 1. ¿Cuál de los 4 es el más valioso? Por qué.

**Sales-Skills (louisblythe)** es el más valioso para nuestro caso, **con filtro fuerte**. Razón:

- Es el único que tiene contenido específico de **sales bots conversacionales** (handoff, intent, memory, response-length, fallback). Esto se mapea 1:1 a Sofia.
- Tiene 6 skills concretas reutilizables (con adaptación al español + contexto inmobiliario LATAM).
- Aunque está stale, los archivos markdown no se pudren — copiar y adaptar.

**Segundo más valioso: prompt-architect** — pero NO como skill instalable, sino como fuente de 4 frameworks (CO-STAR, TIDD-EC, Self-Refine, Pre-Mortem) que usaremos para diseñar/iterar el system prompt de Sofia.

**Awesome-agent-skills:** valor como bookmark, no como código.

**Claude-gtm-skills:** valor cercano a cero. Es publicidad sin sustancia.

## 2. Patrones cross-repo que vale internalizar

Cosas que aparecen en 2+ repos y son estándar legítimo de la industria:

1. **Estructura SKILL.md con frontmatter YAML + cuerpo prescriptivo** — `name`, `description` con triggers en lenguaje natural. Standard. Ya lo usamos en el template madre.

2. **"Initial Assessment" antes de prescribir** — el agente pregunta 3 cosas (contexto / current state / goals) antes de dar consejo. Patrón reutilizable en todos nuestros agentes.

3. **Taxonomías de intent / objection / handoff con frases ejemplo** — listas concretas de "qué dice el usuario cuando quiere X". Patrón usado en `intent-detection`, `objection-handling`, `handoff-detection`. Aplicable directamente a Sofia.

4. **Frameworks discriminantes por "signal"** — "Si el usuario dice X / si la situación es Y → usá framework Z". Patrón usado por prompt-architect y por Sales-Skills al recomendar BANT vs MEDDIC. Buena heurística para diseño.

5. **"Wrong way / Right way" con ejemplos antes/después** — patrón didáctico usado en `response-length-calibration`. Muy efectivo para entrenar agentes sobre matices estilísticos. Usar en skills propias.

6. **Hybrid rules + ML detection** — patrón "reglas duras para triggers obvios + scoring para zona gris" usado en intent y handoff. Aplicable a N8N (regex match obvio + Claude para zona gris).

## 3. Lista priorizada de skills/agents a crear para Casa CRM

```
PRIORIDAD 1 — bot-handoff-design (skill .claude/skills/)
- Origen: Sales-Skills/handoff-detection (adaptado)
- Qué hace: Guía a Claude para definir cuándo Sofia escala al agente humano (triggers explícitos, sentiment, complejidad, falla, valor).
- Por qué urge: El miedo MASTER de David Retana (demo 2026-05-20) es "que el bot eche para atrás al lead". Handoff bien diseñado es la respuesta directa a ese miedo.
- Esfuerzo: 3-4 horas (clonar SKILL.md base, traducir, agregar 8 casos inmobiliarios reales, escribir reglas duras "ante la duda escalá", testear con conversaciones del demo).

PRIORIDAD 2 — sofia-system-prompt-v1 (artefacto, no skill — prompt directo en N8N)
- Origen: diseño original usando CO-STAR + TIDD-EC (prompt-architect)
- Qué hace: System prompt definitivo de Sofia con estructura Context/Objective/Style/Tone/Audience/Response + Do/Don't list duro.
- Por qué urge: El system prompt actual del bot (mencionado en proyecto.md "Bot vendedor empático con calificación BANT") no usa estructura formal. CO-STAR + TIDD-EC en español tico va a mejorar mucho la consistencia.
- Esfuerzo: 4-5 horas (CO-STAR base + TIDD-EC con 15-20 reglas Do/Don't específicas + las 9 preguntas de David + 5 ejemplos few-shot calibrados con vocabulario tico real).

PRIORIDAD 3 — whatsapp-response-calibration (skill .claude/skills/)
- Origen: Sales-Skills/response-length-calibration (adaptado)
- Qué hace: Guía cómo calibrar longitud/formato de mensajes para WhatsApp LATAM (60-120 chars, sin punto final, sin ¿, sin "Hola estimado").
- Por qué urge: David Retana validó "humanizar" como feature crítica. Aplicable también a otros bots que construyamos.
- Esfuerzo: 2-3 horas.

PRIORIDAD 4 — objeciones-inmobiliario (skill .claude/skills/)
- Origen: Sales-Skills/objection-handling + memory/research/01-demo-retana-insights.md
- Qué hace: Catálogo de 15-20 objeciones reales del comprador/inquilino inmobiliario LATAM con respuestas modelo y triggers de escalación.
- Por qué urge: Sin esto, Sofia improvisa frente a objeciones de precio/ubicación/timing — riesgo de "echar al lead".
- Esfuerzo: 5-6 horas (necesita mining real de WhatsApp de Hans + conversaciones del demo para extraer objeciones literales).

PRIORIDAD 5 — bot-fallback-design (skill .claude/skills/)
- Origen: Sales-Skills/fallback-gracefully + diseño propio
- Qué hace: Define qué hace Sofia cuando NO sabe responder, no entiende, o detecta intent ambiguo. Regla maestra: "ante duda, escalar humano — nunca improvisar precio, fecha, dirección, condición legal".
- Por qué urge: Es la única manera de mitigar el riesgo de bot inventando datos (especialmente direcciones, precios, condiciones financieras).
- Esfuerzo: 3 horas.

PRIORIDAD 6 — intent-detection-es (skill .claude/skills/)
- Origen: Sales-Skills/intent-detection (traducido + ampliado)
- Qué hace: Taxonomía de intents en español tico inmobiliario + ejemplos.
- Por qué urge: Útil cuando construyamos clasificación en N8N (router de mensajes — ¿es pregunta de info? ¿es objeción? ¿es lead caliente?).
- Esfuerzo: 4-5 horas (requiere mining real de chats inmobiliarios).

PRIORIDAD 7 — prompt-engineer-sofia (skill .claude/skills/)
- Origen: prompt-architect (4 frameworks extraídos)
- Qué hace: Skill meta que guía a Claude para iterar/debugear el system prompt de Sofia cuando aparecen bugs (Sofia respondió mal → análisis Pre-Mortem → fix con TIDD-EC).
- Por qué urge: Tier 2 — útil para mejora continua post-lanzamiento, no para MVP.
- Esfuerzo: 3 horas.

PRIORIDAD 8 — sofia-pre-mortem (workflow operativo)
- Origen: prompt-architect/pre-mortem (adaptado)
- Qué hace: Ejercicio de Pre-Mortem ANTES de poner Sofia frente a un cliente real: imaginar que arruinó leads, listar failure modes, prevenirlos.
- Por qué urge: Tier 2 — proceso de QA pre-lanzamiento de cada cliente nuevo. Importante pero no bloqueante.
- Esfuerzo: 2 horas para diseñar el workflow + cada Pre-Mortem real toma 1-2 horas con el cliente.
```

**Total esfuerzo P1-P5 (core MVP de venta automatizada):** ~17-21 horas de trabajo focused.

## 4. Patrones de prompt engineering específicos para Sofia

### a) CO-STAR como esqueleto del system prompt

```
# CONTEXT
Sos Sofia, asistente IA del agente inmobiliario {{nombre_agente}} en Costa Rica.
{{nombre_agente}} maneja {{n}} propiedades activas en zonas {{zonas}}.
Recibís mensajes en WhatsApp de personas que vieron un anuncio o pidieron info.
Tu trabajo NO es vender — es FILTRAR los curiosos del comprador real.

# OBJECTIVE
En los próximos 5-8 turnos extraer:
1) Compra/alquiler  2) Para quién  3) Timing  4) Zona  5) Presupuesto  6) Decisor
Si el lead está caliente (timing < 3 meses + presupuesto match), apagar bot y notificar humano.
Si el lead es curioso (sin timing, sin presupuesto, "solo preguntando"), recolectar info básica y agradecer sin gastar tiempo del agente.

# STYLE
Conversacional tico, NO formal. Sin "estimado", sin "cordialmente".
Sin puntos finales en la mayoría de mensajes (WhatsApp norm).
Sin signos ¿ al inicio de preguntas (rompe tono natural).
Mensajes cortos: 60-120 caracteres óptimo, máximo 200.

# TONE
Cálido pero no zalamero. Curioso, no interrogador.
Como un asistente humano experimentado, no como un chatbot de banco.

# AUDIENCE
Comprador/inquilino LATAM (CR principalmente). Edad 25-50. Usa WhatsApp todo el día.
Pierde paciencia rápido con mensajes largos o cuestionarios obvios.

# RESPONSE
Un solo mensaje a la vez. Una sola pregunta por turno (máximo dos relacionadas).
NUNCA listas de info pegadas. NUNCA inventes precios/direcciones/fechas.
```

### b) TIDD-EC para la sección "reglas duras"

```
# DO
- Usá el nombre del lead apenas lo tengas
- Confirmá info dada antes de avanzar ("entonces andás buscando alquiler en Escazú, ¿correcto?")
- Cuando preguntés precio, dá un rango primero ("$800-1500 te calza?") para no quemar el lead
- Si el lead pregunta por una propiedad específica que NO está en tu inventario, decí "déjame confirmar con {{agente}} y te aviso en un rato"

# DON'T
- NO uses signo de pregunta al inicio (¿) — solo al final si es necesario
- NO termines mensajes con punto final salvo cierres formales
- NO inventes precios, direcciones, condiciones financieras, fechas de visita
- NO prometas que el agente va a llamar en X minutos — decí "le aviso a {{agente}} y te escribe pronto"
- NO uses emojis de cara (😊). Sí podés usar 🏠 o 📍 con moderación
- NO repitas preguntas que ya respondió el lead
- NO uses jerga corporativa ("validar", "agendar", "gestionar") — usá lenguaje cotidiano
- NO menciones que sos un bot/IA salvo que te pregunten directo
```

### c) Few-shot calibrado con vocabulario tico real

Incluir en el prompt 3-5 conversaciones ejemplo extraídas del demo de David Retana + chats reales que recopile Hans, mostrando:
- Lead caliente → escalación rápida
- Lead curioso → cierre amable sin gastar tiempo
- Lead con objeción de precio → manejo + extracción de presupuesto real

### d) Self-Refine como evaluador opcional pre-envío (N8N)

Nodo opcional en N8N: antes de enviar mensaje al cliente, pasar la respuesta por Claude con prompt:
```
Evaluá esta respuesta de Sofia contra las reglas DO/DON'T del system prompt.
Si viola alguna regla, reescribila. Si está bien, devolvé tal cual.
RESPUESTA: {{respuesta_sofia}}
```
Costo: +1 llamada Claude por turno. Valor: catch de bugs antes de impacto a cliente.

### e) Parallel sampling para ambigüedad

Cuando el intent del lead es ambiguo (score < threshold), generar 2-3 respuestas en paralelo y elegir la más segura (la que más probablemente NO eche al lead). Implementable en N8N con un nodo Claude `n=3` + selector.

## 5. Lo que NO vale la pena adoptar

Sé brutal. Lo que descartamos y por qué:

1. **Las 90 skills "B2B-tech-SDR" de Sales-Skills** (territory-account-launch, pipeline-management, propensity-scoring, deal-review-win-loss, etc.) — son para sales ops enterprise. Nosotros vendemos a un agente individual con WhatsApp. Cero match.

2. **Las skills "soft skills" sin operativa** de Sales-Skills (`resilience`, `adaptability`, `time-management`, `empathy`) — son ensayos motivacionales, no instrucciones para agentes IA.

3. **22 de los 27 frameworks de prompt-architect** (RPEF, RISE-IE, RISE-IX, Skeleton-of-Thought, Least-to-Most, Tree-of-Thought, Devil's Advocate, etc.) — son curiosidad académica. Vamos a usar 4 máximo.

4. **El sistema de scoring de prompts** (8.8/10) — vanity metric.

5. **El repo entero `claude-gtm-skills`** menos un archivo (meddpicc). Es marketing inflado sin sustancia. No lo recomendamos a clientes ni lo importamos.

6. **El README de 180KB de `awesome-agent-skills`** — no leerlo entero. Solo consulta puntual con Ctrl+F.

7. **Cualquier framework "MEDDIC", "MEDDPICC", "Challenger Sale", "Sandler"** — son frameworks B2B enterprise. Para venta inmobiliaria individual son overkill. El framework de las 9 preguntas de David Retana (memory/research/01-) es mejor.

8. **El concepto "Industry Pack" como propio para nosotros AHORA** — no tenemos volumen para justificar 8 industry packs. Cuando crezcamos a turismo/automotriz lo evaluamos.

9. **Importar Sales-Skills como submodule git** — el repo está stale, sin updates esperables. Mejor copy-paste manual con créditos en el SKILL.md.

10. **Skills de compliance B2B genéricas** (GDPR/CCPA email opt-out, etc.) — relevantes pero ya cubiertas en mejor calidad por la skill `owasp-security` y `legal` propias que tendríamos que pensar específicas para WhatsApp Business API + Costa Rica.

---

## Cierre — Próximas acciones derivadas

1. Hans aprueba (o ajusta) la lista priorizada de 8 skills.
2. Crear las 5 P1-P5 en el template madre primero (no en Casa CRM directo) para que sean reusables en futuros proyectos verticales.
3. Antes de crear cada skill, dispatchar al agente `creador-de-skills` (meta-skill de `.agent/skills/` del template madre) para asegurar formato consistente.
4. Una vez P1+P2 listas, integrarlas en el flujo N8N actual del demo del bot. Testear con conversaciones del demo Retana.
5. Pre-Mortem de Sofia ANTES de poner al bot frente al primer cliente piloto real.
