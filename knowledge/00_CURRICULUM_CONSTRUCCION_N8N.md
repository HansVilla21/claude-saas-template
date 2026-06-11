# Currículum — Construcción de Chatbots n8n (Momentum AI)

> **Propósito:** entrenar desde cero a un constructor (humano o agente de IA) para que arme los
> chatbots multi-agente de Momentum AI en n8n, igual o mejor que el estándar actual. No es un fix
> de un caso puntual: es el camino de aprendizaje completo, en orden.
>
> Si sos un agente de IA leyendo esto en otro proyecto: **estudiá este currículum en orden ANTES
> de construir tu primer workflow.** Cada módulo te dice qué archivo leer y qué tenés que ser
> capaz de hacer al terminarlo.

---

## El error #1 que este currículum existe para evitar

**Construir el workflow desde cero e improvisar los nodos.** Sobre todo improvisar el router
como un nodo random en vez del Information Extractor configurado correctamente.

La regla madre de Momentum: **el template base YA EXISTE y se DUPLICA. Nunca se construye desde
cero.** Lo único que cambia por cliente son los prompts, el número de agentes, las tools, el
post-processing y las credenciales. La estructura (batching, memoria, formateador, reinicio) es
fija y está resuelta en los JSON de `knowledge/workflows-reference/`.

Si entendés solo esto, ya evitás el 70% de las estupideces.

---

## Mapa mental: qué es un chatbot Momentum

```
Canal (WhatsApp/IG/Telegram)
   → Recepción + control ON/OFF por lead
   → Batching de mensajes (Redis: junta los mensajes que llegan seguidos)
   → Carga de historial (Postgres) + formateo
   → ROUTER (Information Extractor LLM) ── clasifica + extrae datos
   → SWITCH ── enruta al agente correcto
   → AGENTE(S) (AI Agent + memoria + tools opcionales)
   → FORMATEADOR (Basic LLM Chain) ── parte la respuesta en bloques cortos
   → Envío al canal (en loop, bloque por bloque)
   → POST-PROCESSING opcional (detección de links, descalificación, handoff)
```

Lo que el constructor DISEÑA: el router, los agentes, el post-processing.
Lo que el constructor NO toca: batching, memoria, historial, formateador, reinicio.

---

## Ruta de aprendizaje (módulos en orden)

### Módulo 0 — Mentalidad y reglas no-negociables
**Leé:** `memory/metodologia-core.md` (completo).
**Tenés que poder responder:** ¿cuántos agentes máximo? ¿qué modelo y temperatura para router vs
agente vs formateador? ¿qué límites de caracteres? ¿qué NUNCA debe hacer el bot (compromisos,
inventar, pedir datos antes de dar valor)? ¿por qué puntuación humana?

### Módulo 1 — Anatomía del template base
**Leé:** `knowledge/workflows-reference/template-base/analysis.md` y abrí el JSON
`knowledge/workflows-reference/template-base/workflow.json` en n8n (importalo).
**Tenés que poder:** señalar en el canvas cada zona (recepción, reinicio, batching, historial,
router, switch, agentes, formateador, envío) y explicar qué hace cada una.
**Entregable mental:** "sé qué nodos NO se tocan y cuáles son las variables por cliente".

### Módulo 2 — El Information Extractor (router) — EL NODO MÁS CRÍTICO
**Leé, en este orden:**
1. `.claude/skills/n8n-langchain-prompts-rules/SKILL.md` — por qué las llaves `{}` rompen el
   nodo y devuelven output vacío SIN error (la causa #1 de routers rotos).
2. Sección "Information Extractor — el schema NO es contrato" y "PROHIBIDO usar llaves" de
   `memory/metodologia-core.md`.
3. Los routers reales: `workflows-reference/dr-carlos/prompts/router-classifier.md` y
   `el-canal/prompts/clasificador-router.md`.
**Reglas que tenés que internalizar:**
- El router es un `@n8n/n8n-nodes-langchain.informationExtractor`, NO un nodo improvisado.
- `systemPromptTemplate`: prosa, SIN llaves literales (máx 4 llaves, en un solo bloque).
- El schema va en el campo `inputSchema` (ahí SÍ pueden ir llaves), pero NO es contrato: el LLM
  puede renombrar campos. Por eso el formato exacto del JSON se repite DENTRO del prompt y el
  nombre del campo principal (`destino`) se menciona 3+ veces.
- Máximo 3-4 destinos + un BACKUP que siempre cae al agente principal.
- El Switch debe leer el nombre de campo que el nodo realmente genera (inspeccionar el output
  real, no asumir por el schema).
**Si te equivocás acá, todo el bot falla.** Por eso es el módulo más largo.

### Módulo 3 — Los agentes (AI Agent)
**Leé:** `.claude/skills/momentum-n8n-builder/SKILL.md` (sección AI Agents) +
`workflows-reference/*/prompts/agente-principal*.md`.
**Tenés que poder:** configurar un AI Agent con su sub-nodo LLM (gpt-4.1-mini, temp 0.4, 400
tokens), su Postgres Chat Memory (sessionKey por teléfono, context window 15), y tools opcionales
(Supabase RAG, Google Sheets). Un solo propósito por agente.

### Módulo 4 — Decidir la arquitectura (cuántos agentes, qué stack)
**Leé:** `.claude/skills/momentum-architect/SKILL.md`.
**Tenés que poder:** dado un negocio, decidir 1/2/3 agentes, qué extrae el router, si necesita
filtro inicial, qué post-processing, y qué stack (canal, CRM, RAG). Default: menos es más.

### Módulo 5 — Construir/configurar el workflow nodo por nodo
**Leé:** `.claude/skills/momentum-n8n-builder/SKILL.md` (completo) +
`.claude/skills/momentum-n8n-builder/references/workflow-patterns.md`.
**Tenés que poder:** tomar el template duplicado y dejar configurados Airtable, router, switch,
agentes, post-processing y el canal (ManyChat/YCloud/Telegram). Nombres de nodos representativos
(ver tabla en metodologia-core). Sticky notes explicando cada zona.

### Módulo 6 — Base de datos y multi-canal (si aplica)
**Leé:** `.claude/skills/chatbot-db-schema-supabase/` y
`.claude/skills/chatbot-manychat-supabase-multicanal/` (sobre todo
`docs/03-errores-comunes-y-fixes.md`).
**Tenés que poder:** entender el schema multi-canal, el payload de ManyChat (WA+IG), y los fixes
de los errores comunes (E01-E05).

### Módulo 7 — Postgres robusto en n8n
**Leé:** `.claude/skills/n8n-postgres-prepared-statements/SKILL.md`.
**Tenés que poder:** escribir queries con JSON deconstruction (1 solo param `$1::jsonb`) cuando
hay 5+ params o nullables. Saber que `delete` se configura como `operation: deleteTable` +
`deleteCommand: delete`. Saber que los nodos de persistencia van EN PARALELO, no en serie.

### Módulo 8 — Variantes (TEST, Telegram, YCloud)
**Leé:** `.claude/skills/momentum-workflow-variants/SKILL.md` +
`knowledge/workflow-variants-templates/*.json` (TEST, TELEGRAM, YCLOUD, YCLOUD-AUDIO).
**Tenés que poder:** generar una versión TEST (chat interno) o Telegram/YCloud desde el workflow
de producción, copiando exacto y cambiando SOLO el canal.

### Módulo 9 — Integración WhatsApp oficial (YCloud)
**Leé:** `knowledge/09_INTEGRACION_YCLOUD.md`.
**Tenés que saber:** webhook con `responseMode: "onReceived"` para servicios externos (si no →
timeout y mensajes duplicados), templates con aprobación Meta, transcripción de audio (Whisper).

### Módulo 10 — Anti-estupideces (checklist final)
**Leé:** `memory/feedback-n8n-build.md`.
Es la lista destilada de los errores reales que se cometieron en producción y cómo evitarlos.
**Revisalo ANTES de declarar cualquier workflow como terminado.**

---

## Examen final: construir un chatbot de cero (sin improvisar)

1. Hacé discovery del negocio (qué vende, qué flujos, qué canal).
2. Diseñá la arquitectura (Módulo 4): número de agentes, router, post-processing, stack.
3. Generá los prompts (esto vive en el **prompting-kit** hermano — router, agentes, formateador).
4. **DUPLICÁ** el template JSON más parecido de `workflows-reference/` (NO construyas de cero).
5. Configurá nodo por nodo (Módulo 5): router, switch, agentes, canal, credenciales.
6. Validá contra el checklist de `feedback-n8n-build.md` (Módulo 10).
7. Generá la variante TEST y corré 5 conversaciones que normalmente fallan.
8. Recién ahí, producción.

Si seguiste los pasos y no improvisaste el router, el resultado va a ser consistente.

---

## Herramientas que aceleran (instalar en el proyecto destino)

- **n8n-mcp** (czlonkowski/n8n-mcp): deja crear/validar/modificar workflows en n8n directo desde
  Claude Code. Con esto el agente VALIDA cada nodo antes de declararlo listo (mata el problema
  del router improvisado). Ver `memory`/`reference_n8n_mcp_setup` del proyecto origen para el setup.
- **Skills globales de n8n** (czlonkowski/n8n-skills): `n8n-workflow-patterns`,
  `n8n-expression-syntax`, `n8n-node-configuration`, `n8n-code-javascript`,
  `n8n-validation-expert`, `n8n-mcp-tools-expert`. NO vienen en este kit (son globales). Instalalas
  en el proyecto destino para que el agente sepa la sintaxis exacta de nodos y expresiones.

> Regla de oro de construcción: si el agente puede VALIDAR el workflow con n8n-mcp antes de
> entregarlo, deja de improvisar. La validación es lo que convierte "adivinó" en "verificó".
