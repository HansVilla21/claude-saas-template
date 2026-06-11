# Principios de Desarrollo — Momentum AI CRM

**Status:** directriz operativa permanente (founder, 2026-06-05)
**Cargar al inicio de cada sesión nueva** junto con `session-handoff-*.md`.

---

## Filosofía base

El sistema YA ES ROBUSTO. Tiene 13+ PRs en producción, 4 migrations, 2 edge functions, 1 workflow N8N complejo, 1 cliente real (Pérez Luna) en onboarding. **Cualquier cambio puede afectar en cascada todo el sistema.**

Trabajar como equipo profesional de desarrollo de software, no como prototipo:

> *"Si hace falta algo, revisarlo 2, 3 o 4 veces no importa. Planificar muy bien, analizar todos los posibles escenarios, todos los riesgos. Permiso para gastar más tokens, pero garantizar que todo vaya bien, que no haya brechas de seguridad, que no haya riesgos de afectar el sistema actual."*
> — Founder, 2026-06-05

---

## Workflow obligatorio para todo cambio

### 1. ANTES de codear

- ✅ Spec del arquitecto con audit del código real (NO inventar nombres de tablas/columnas)
- ✅ Identificar TODOS los lugares del sistema que el cambio toca o puede afectar
- ✅ Pre-mortem: listar mínimo 5 riesgos REALES + mitigación de cada uno
- ✅ Plan de rollback explícito ejecutable en <60s
- ✅ Si toca infra crítica (workflow N8N, RLS, edge function en prod): snapshot + tag git OBLIGATORIO ANTES de tocar

### 2. DURANTE el desarrollo

- ✅ Builders trabajan en specs leídas COMPLETAS, no en prompts inventados
- ✅ Verificar nombres de columnas/tablas/funciones contra el código real, NO contra training data
- ✅ Idempotencia obligatoria en migrations y scripts (re-corribles sin efectos)
- ✅ Fail-open en código defensivo cuando aplica (rate limit, validaciones)
- ✅ Tests de comportamiento, no solo de happy path

### 3. DESPUÉS del build, ANTES de pedir QA al founder

**Code review independiente obligatorio:**

- ✅ Dispatch agente `code-reviewer` o `superpowers:code-reviewer` que NO conoce el contexto del build
- ✅ Verificar manualmente cada archivo cambiado:
  - ¿Las queries respetan RLS donde corresponde?
  - ¿Los INSERT/UPDATE tienen WHERE clauses correctas?
  - ¿Los try/catch no esconden errores que deberían explotar?
  - ¿La idempotencia es real, no asumida?
  - ¿Los nombres de columnas matchean exactamente el schema?
- ✅ Verificar que el cambio NO toca tablas/funciones que el sistema live usa hoy SIN documentar el impacto explícito
- ✅ Rollback procedure verificado end-to-end (no solo escrito en doc)

### 4. EN QA del founder

- ✅ Founder ejecuta plan T1, T2, T3... explícitos, no improvisado
- ✅ Verificar EN PREVIEW (Vercel) antes de pedir merge
- ✅ Smoke test de regression del flujo NORMAL (no solo del cambio nuevo)
- ✅ Si algo se ve raro, **PARAR** y debuggear desde root cause (NO improvisar fix)

### 5. POST-merge

- ✅ Verificar que el deploy a producción salió OK (curl al endpoint, query a tabla nueva, etc.)
- ✅ Monitorear los primeros minutos post-deploy
- ✅ Actualizar memory/ (decisions.md + handoff + changelog) con cierre operativo

---

## Reglas inviolables (cero excepciones)

1. **NUNCA tocar producción directo desde main.** Siempre feature branch + PR + preview + merge
2. **NUNCA modificar workflow N8N sin snapshot previo + tag git.** Política versionado del proyecto
3. **NUNCA `Edit replace_all: true`** cuando el target puede existir en otros contextos del archivo (lección de PR #21)
4. **NUNCA confiar en que algo "ya funciona como antes"** después de un refactor. Smoke test obligatorio del flujo previo
5. **NUNCA deployar edge function nueva sin verificar que el handler de evento es backward-compatible** con eventos antiguos en cola
6. **NUNCA agregar RLS a una tabla activa** sin verificar que todos los code paths usen service_role o tengan policy correcta
7. **NUNCA bajar la guardia con "es solo cosmético"** o "es chico". Los bugs más caros vienen de cambios "chicos"

---

## Patrones de detección temprana

### Patrón "fail-open silencioso"

Lección de OBS-3 / PG 42702: cuando el código tiene fail-open defensivo, los smoke tests del cliente pueden aparentar PASS mientras la lógica nueva está rota.

**Regla:** todo deploy de fail-open code requiere verificación de DB state post-test, no solo el response del endpoint.

### Patrón "cambio in-place al workflow LIVE"

Lección de SET-1: PUT sin commit previo es prohibido. Cada cambio = nuevo archivo `vN.json` + nuevo workflow en N8N + switch atómico con rollback preparado.

### Patrón "asumir nombres de columnas/funciones"

Lección de BOT-CTX-2: yo asumí `session_id = phone@agency_id`, la realidad era `phone@business_phone`. Verificar SIEMPRE el código real antes de specificar.

### Patrón "regression del flujo normal"

Lección de Bloque 6 hipotético: cuando se extrae un componente o se cambia un default, el flujo normal puede romperse. Smoke test del flujo previo (texto simple, mensaje básico, etc.) obligatorio antes de mergear.

### Patrón "asumir formato de API externo sin verificar empíricamente"

Lección del rollback BOT-CTX-2 (2026-06-05): la spec asumió que el response del nodo `Send Chunk via YCloud` traía el campo `wamid` (Meta's WhatsApp message id). Las 2 pasadas de code-review independiente verificaron estructura (queries, conexiones, sintaxis) pero NUNCA hicieron un POST real a YCloud para inspeccionar el payload real. En producción el response solo trae `body.id` (YCloud's internal id), no el `wamid`. Resultado: `Reconciliar wamid` extraía `null`, los rows quedaban con `external_id=null`, el webhook nunca encontraba match → duplicación de cada mensaje del bot. Rollback completo a los ~10 min de operación.

**Regla:** cuando una spec depende del formato de respuesta o payload de un API externo (YCloud, OpenAI, Stripe, etc.), **antes de aprobar el code-review** ejecutar:
- Un POST real al endpoint (sintético, con sandbox/test mode si está disponible)
- Inspeccionar el response completo (todos los campos, todos los niveles del JSON)
- Documentar en la spec o en el código (con un comment) cuál campo se usa y por qué
- Si hay duda sobre el formato: NO aprobar hasta tener evidencia empírica

**No confiar en:**
- Docs de la API (a veces desactualizadas, a veces incompletas)
- Memoria de sesiones anteriores ("ya vi que devuelve X")
- Lo que dice un agente sin verificación cruzada

**Sí confiar en:**
- Output real de un request reciente, salvado al spec
- Inspección de logs de producción del mismo endpoint
- Inspección del payload del webhook que el sistema ya está recibiendo

Patrón aplicable a: integraciones YCloud, OpenAI tool responses, Stripe webhooks, Supabase Realtime broadcasts, cualquier integración HTTP externa con structured response.

### Patrón "API de N8N no genera webhookId al activar"

Lección del cutover BOT-CTX-2 (2026-06-05): cuando se importa un workflow N8N **vía API** (`POST /workflows`) y se activa **vía API** (`POST /workflows/{id}/activate`), el campo `webhookId` interno del nodo Webhook **NO se genera automáticamente**. Sin ese `webhookId`, el endpoint del webhook NUNCA queda registrado en el router interno de N8N → todos los POSTs devuelven 404 "not registered". N8N **solo genera ese `webhookId` cuando el toggle se activa desde la UI del editor**.

**Regla:** cuando se construye un workflow N8N para deploy automatizado vía API:
1. El build script debe **generar y asignar manualmente un `webhookId`** UUID v4 al nodo Webhook ANTES de POSTear a la API
2. Smoke test obligatorio post-activación: GET al path del webhook debe retornar 404 "registered for POST" (no 404 "not registered")
3. Si se sigue obteniendo "not registered" → el `webhookId` no se asignó correctamente, debug eso antes de seguir

Build scripts del proyecto que aplican esta regla: `crm-v2/scripts/build-bot-c-v2-pre-register.js` (referencia histórica del intento BOT-CTX-2).

### Patrón "sobreingenierizar cuando el founder pide algo concreto"

**Lección del intento fallido de refactor del bot Momentum (2026-06-05 tarde):** el founder pidió *"el bot suena genérico, mejorémoslo"*. Yo monté en respuesta:
- Sistema multi-agente con 4 agentes (Router + Principal + Objeciones + Formateador)
- BANT como módulo transversal con extracción estructurada
- Framework EACR renombrado de LAARC
- Round-robin Hans/Pietro vía RPC nuevo
- Feature flag `workflow_version` por agency
- 11 nodos N8N nuevos a sumar al workflow
- 6 archivos de spec en `memory/prompts-momentum/` (~170 KB total)
- 70,000 caracteres de prompts inyectados en `agencies.bot_config`

Cuando el bot mandó el primer mensaje al WhatsApp del founder, salió mal formateado con `¿` de apertura, sin saltos de línea, genérico. El founder reaccionó con justificada frustración: *"qué puta mierda estás haciendo o por qué decidiste hacerlo. Sólo el primer mensaje ya estoy viendo que el prompt que metiste tiene 80,000 caracteres, que es esa barbaridad, que es esa estupidez."*

**Causa raíz:** confundí "mejorar calidad" con "construir todo de nuevo desde cero con arquitectura nueva". La metodología real (validada en el kit Momentum AI con 18+ proyectos) dice: *"Cambios quirúrgicos — si funciona al 70%, arreglar el 30%. NUNCA reescribir desde cero."*

**Regla:**
- Cuando el founder pide "mejorar X", la pregunta correcta es *"¿qué tiene de malo X específicamente?"*, NO *"¿cómo redibujo todo?"*
- Antes de proponer arquitectura nueva, identificar qué del actual funciona y qué falla
- Si el cambio requiere >3 archivos nuevos o >2 KB de spec, parar y validar el alcance
- Validar con un prompt CHICO antes de invertir tiempo en multi-agente

**Donde aplica:** cualquier "refactor", "mejora", "optimización" pedida por el founder.

### Patrón "no verificar el modelo del LLM antes de diseñar el prompt"

**Lección de la misma sesión 2026-06-05:** diseñé prompts de 50-70 KB para el bot de Momentum. El bot corre **GPT-4o-mini**. El kit del founder dice explícito como error fatal #1: *"Mega-prompt con GPT-4o-mini → olvida instrucciones, inventa."*

**Causa raíz:** no inspeccioné el modelo del nodo LangChain antes de empezar. Diseñé como si fuera Sonnet 4 / GPT-4o full. El bot, al ejecutarse, no podía respetar las 15 reglas anti-bot del prompt porque estaban diluidas en 70K chars.

**Regla:**
- Inspeccionar el modelo del nodo LangChain ANTES de diseñar prompt
- Si modelo = gpt-4o-mini: prompts ≤3,000 chars máximo
- Si modelo = gpt-4.1-mini: prompts ≤5,000 chars
- Si el prompt necesita más, recomendar migrar a modelo más capaz O recortar funcionalidad
- Documentar en la spec qué modelo se asume y por qué

**Donde aplica:** cualquier diseño de prompt para nodo LLM en N8N, Edge function, server action.

### Patrón "confundir cambio del `bot_config` con cambio del workflow completo"

**Lección de la misma sesión:** asumí que actualizar `agencies.bot_config` con el system prompt nuevo "activaría" el sistema multi-agente entero (router + agentes + formateador). Falso.

El nodo "Componer System Prompt" del workflow solo arma el `systemMessage` del agente principal. Los otros nodos (Information Extractor, Formateador, etc.) tienen sus **propios prompts hardcoded en el JSON del workflow**. Cambiar `bot_config` no toca esos.

Resultado: el agente principal usó el prompt nuevo pero el Formateador siguió siendo el viejo → mensajes mal divididos, `¿` de apertura no censurado. Le dije al founder *"esto valida el 70% del cambio"* cuando en realidad casi nada del sistema nuevo estaba activo.

**Regla:**
- Antes de decir "activé X cambio", identificar TODOS los nodos del workflow que el cambio toca
- Si el cambio cruza múltiples nodos, requiere modificación del workflow JSON, no solo del `bot_config`
- NUNCA describir un atajo como "valida el 70%" sin verificar empíricamente que el 70% del comportamiento cambia
- Para test rápido de calidad del prompt principal: OK actualizar `bot_config`. Para test del sistema completo: requiere deploy completo del workflow

**Donde aplica:** cualquier cambio que cruza múltiples nodos del workflow N8N.

### Patrón "improvisar el framing de venta desde conocimiento técnico"

**Lección de la misma sesión:** diseñé el bot vendiendo Momentum como *"SaaS técnico que reemplaza ManyChat + Soho + Zapier"*. El founder me corrigió: *"Momentum se vende como servicio armado a medida, no como SaaS técnico. El lead típico NO conoce ManyChat ni Chatfuel — hablarle de eso lo aleja."*

El dolor REAL del lead no es técnico (*"ManyChat se cae"*), es de negocio (*"se me caen ventas porque no contesto a tiempo"*). El founder ya tenía metodología validada (SetterX appointment setting + estrategia GrowX con ICP, ángulos, frase ancla). Yo improvisé desde mi conocimiento técnico ignorando lo que el founder ya había trabajado.

**Regla:**
- El framing de venta es responsabilidad del founder. Si el founder no lo dio explícito, pedirlo ANTES de escribir el prompt
- Buscar en `memory/` archivos del founder sobre estrategia, marketing, framing, posicionamiento antes de diseñar prompt de venta
- Los pains del prompt deben ser de NEGOCIO (ventas que se pierden, vendedores caros, tiempo perdido), NO técnicos (herramientas se caen, integraciones rotas)
- Si el founder dice "no es así como se vende", parar y reescribir desde cero el framing, NO adaptar superficialmente

**Donde aplica:** cualquier prompt de bot de ventas/setting/atención al cliente.

### Patrón "atajo seguro no existe en producción"

**Lección de la misma sesión:** le dije al founder *"hago un atajo seguro para que pruebes ya"* y procedí a inyectar 70K chars en el `bot_config` de Momentum SIN haber verificado:
- Qué modelo usa el bot
- Si el sistema multi-agente requería más que solo cambiar `bot_config`
- Si las variables `{{ $json.bot_config.X }}` del prompt se resolverían en runtime
- Si el Formateador del workflow seguiría usando su prompt viejo

El "atajo" rompió la calidad del bot inmediatamente. El founder me dijo: *"se está saliendo de mis manos y no me está gustando"*.

**Regla:**
- "Atajo seguro" + tocar producción = oxímoron. Si vas a tocar producción, hacelo bien o no lo hagas
- Cuando el founder dice "pruébalo ya", la respuesta correcta puede ser *"antes de tocar prod necesito validar X, Y, Z. Te aviso en 5 min"*
- Nunca usar las palabras "atajo seguro" para algo que tiene cualquier riesgo identificable
- Si el cambio puede degradar la experiencia del usuario final (lead, cliente), NO es atajo, es riesgo

**Donde aplica:** cualquier acción que afecta producción.

### Patrón "armar nodos N8N desde memoria en vez de clonar un template validado"

**Lección de la sesión 2026-06-06 (deploy del Agente Principal):** armé un nodo "Router" para el workflow de Momentum poniendo `type: '@n8n/n8n-nodes-langchain.informationExtractor'` con `typeVersion: 1.3` + `OpenAI Chat Model - Router` con `typeVersion: 1.2` SIN `responseFormat`, + Switch con `mode: 'rules'` + `options.fallbackOutput: 0`. Todo desde memoria/heurística.

Resultado: el Router apareció como `?` (tipo desconocido) en el N8N del founder, las options del Chat Model estaban incompletas, el Switch usaba estructura inválida. El founder lo vio inmediatamente: *"te estás inventando un nodo llamado 'router' que eso no existe"*. Justa frustración.

**Causa raíz:** tenía `knowledge/workflows-reference/dr-carlos/workflow.json` que es un Information Extractor + Switch validado en producción. NO lo abrí antes de armar el mío. Improvisé desde memoria.

**El kit dice literal (`memory/feedback-n8n-build.md` punto 2):**
> *"El router DEBE ser un Information Extractor bien configurado. Síntoma típico: alguien mete un nodo 'Router' improvisado o un IE mal armado y el ruteo falla."*

**Y el `README` del kit dice:**
> *"La regla madre de Momentum: el template base se DUPLICA, NUNCA se construye de cero."*

Los 6 detalles correctos que dr-carlos tiene y yo me inventé:
1. Information Extractor `typeVersion: 1.2` (NO 1.3 — esa no existe)
2. OpenAI Chat Model del Router con `typeVersion: 1.3` + `responseFormat: 'json_object'` + temp 0.1 + maxTokens 300
3. Switch SIN `mode` (v3.2 lo infiere de la estructura)
4. Backup como 4ta rule con operator `notExists` + `singleValue: true` (NO `options.fallbackOutput`)
5. Operator del Switch con `name: 'filter.operator.equals'` (formato exacto)
6. Conditions con `caseSensitive: true, version: 2, combinator: 'and'`

**Regla:**
- Antes de armar CUALQUIER nodo N8N nuevo, **abrir un nodo del mismo tipo que YA funcione** en un workflow validado (`knowledge/workflows-reference/template-base/`, `dr-carlos/`, `el-canal/`) y copiar `type`, `typeVersion`, `parameters` LITERAL
- Solo cambiar los campos específicos del caso (prompt, schema, conexiones), NUNCA inventar `typeVersion` ni estructura de `parameters`
- Si no hay un nodo de referencia para clonar, **PARAR** y pedir ayuda al founder o instalar `n8n-mcp` (czlonkowski) para validar el nodo contra la API real de N8N antes de armarlo
- Smoke tests del build script deben verificar `typeVersion` y estructura crítica (ej. `Switch sin 'mode'`, `IE con schemaType string`)

**Donde aplica:** cualquier modificación al workflow N8N de Momentum o futuros clientes. Es la causa raíz #1 del kit N8N.

### Patrón "renombrar nodo N8N sin reemplazar las referencias en expresiones de otros nodos"

**Lección de la misma sesión (set2 + set4):** renombré `Sofia C` → `Agente Principal` con una función que solo actualizaba `node.name` + `wf.connections`. NO recorría los `parameters` de otros nodos para reemplazar expresiones N8N hardcoded del tipo `{{ $('Sofia C').first().json.output }}`.

Resultado: 3 referencias huérfanas quedaron rotas en 2 nodos:
- `Capturar Contexto Para Extractor` → `{{ $('Sofia C').first().json.output }}`
- `Cerrar Trace de Turno` → 2 referencias a `Sofia C` y `OpenAI Chat Model - Sofia C`

El founder lo vio en N8N como error rojo: *"Referenced node doesn't exist - The node 'Sofia C' doesn't exist, but it's used in an expression here"* y me lo señaló como **error básico** que ya había hecho yo previamente.

**Causa raíz:** una función de rename incompleta. Cambiar el nombre de un nodo en el JSON afecta TRES lugares:
1. El propio `node.name`
2. Las `connections` que referencian al nodo por nombre (source y target)
3. **Las expresiones N8N hardcoded en `parameters` de OTROS nodos** (`$('NombreViejo')`, `$node["NombreViejo"]`, `$items("NombreViejo")`, etc.)

El punto 3 es el que se me escapa. Y es el más importante operativamente porque rompe la ejecución.

**Regla:**
- TODA función `renameNode()` en un build script debe recorrer recursivamente los `parameters` de TODOS los nodos del workflow y reemplazar las referencias por nombre viejo con el nombre nuevo
- Patrones a buscar (con regex que escape comillas simples/dobles y espacios):
  - `$('NombreViejo')` → `$('NombreNuevo')`
  - `$("NombreViejo")` → `$("NombreNuevo")`
  - `$node["NombreViejo"]` → `$node["NombreNuevo"]`
  - `$items("NombreViejo")` → `$items("NombreNuevo")`
- Smoke test obligatorio post-rename: scan de TODAS las expresiones del workflow para que el conteo de referencias al nombre viejo sea 0
- Si el rename forma parte de un build script complejo (set2, set3, etc.), agregar este check como check explícito del smoke test, NO opcional

**Donde aplica:** cualquier rename de nodo N8N en un build script. Si no implementás este recorrido, generás referencias huérfanas garantizado.

### Patrón "post-procesar antes del LLM regenerador (el LLM reescribe encima)"

**Lección de la sesión 2026-06-06 (SET5 → SET6):** para garantizar que el bot NO use `¿` ni puntos finales, agregué un Code "Limpiar Puntuación" **ANTES** del Formateador. Aplicaba regex limpias al output del agente. Smoke tests pasaban. El founder probó y el resultado venía igual con `¿` y puntos finales.

**Causa raíz:** el Formateador no es un nodo determinista — es un **Basic LLM Chain con gpt-4o-mini**. Aunque su prompt diga "NO modifiques contenido", al regenerar el texto en formato JSON con MENSAJE 1, MENSAJE 2, etc., **reintroduce signos de puntuación formal** (`¿`, puntos finales, em-dash) siguiendo su training de español. El input limpio que le llegaba se perdía en la regeneración.

El founder lo detectó al toque: *"si metes ahí un javascript antes, limpiador de puntuación... mira que me está dando el resultado igual"*. Tenía razón mecánica: el Formateador, siendo LLM, sobrescribe cualquier "limpieza" upstream.

**Fix:** mover el Code "Limpiar Puntuación" a DESPUÉS del Formateador (entre Formateador y Split Out). El nuevo Code parsea el output del Formateador (objeto con MENSAJE N) y aplica regex a cada campo. Como Split Out → YCloud son nodos deterministas, lo que sale del Code llega literal al lead.

**Regla:**
- Cualquier post-procesamiento determinista (regex de puntuación, sanitización, filtros de keywords, conversión de markdown, etc.) **debe ir DESPUÉS de todos los nodos LLM** del pipeline — porque cada LLM puede regenerar/reformatear el contenido siguiendo su training
- Si el flujo es Agente (LLM) → Formateador (LLM) → Split Out, el Code va entre Formateador y Split Out, NO entre Agente y Formateador
- Si hay un solo LLM, el Code va inmediatamente después
- Antes de aceptar que un post-procesamiento funciona, verificar el output FINAL del bot (lo que llega al canal del lead), NO solo el output intermedio
- Las "reglas duras" del prompt para LLMs (NO uses X, NO formatees así) son ESPERANZA, no garantía. Para reglas hard, post-procesar determinísticamente después de TODOS los LLMs

**Donde aplica:** cualquier pipeline con múltiples LLMs en serie + reglas de formato hard. Especialmente bots conversacionales con Formateador downstream del agente principal.

---

## Cuándo PARAR y replanificar

Si durante un build aparece cualquiera de estos signos:
- El archivo a modificar pasa de 500 líneas
- Más de 3 archivos tocados sin spec previa
- Un test falla por razones no entendidas (no improvisar fix — entender root cause)
- Un riesgo nuevo aparece que NO estaba en el pre-mortem
- El founder dice "no entiendo" o "esto se siente raro"

**PARAR.** Documentar el state. Re-planificar con la nueva info. NO improvisar.

---

## Token budget — explícitamente permitido gastar más

Founder explícito: **"permiso de hacer un extra de trabajo, gastar más tokens, no importa, pero garantizar que todo vaya bien"**.

Entonces:
- Code-review independiente después de cada build = SÍ siempre, no es lujo
- Verificación manual de archivos críticos = SÍ siempre
- Specs detalladas con pre-mortems extensos = SÍ siempre
- Multi-agent verification para cambios riesgosos (arquitecto + builder + code-reviewer + debugger si hace falta) = SÍ
- "Esto es overkill para algo chico" — NO existe esa excusa. La calidad cuesta tokens, los bugs cuestan dinero y confianza del cliente

---

## Aplicación al pipeline activo

**BOT-CTX-2 (en build hoy 2026-06-05):**

Cuando el backend-builder termine, ANTES de cualquier QA del founder:

1. Dispatch `code-reviewer` independiente sobre cada archivo cambiado
2. Verificar manualmente que el build script del workflow N8N preserva conexiones del splitInBatches (R-CONEXIONES-LOOP del spec)
3. Verificar que la migration 0022 es realmente idempotente correndo el SQL contra una DB de prueba si es posible
4. Verificar que el cambio en `ycloud-webhook` no rompe el flujo normal de inbound del lead (regression)
5. Smoke test del rollback: simular activar v2, simular un error, simular volver a v1
6. Solo entonces pasar al founder con plan de QA explícito T1-T7

**Pre-mortem público antes de cada acción crítica del founder:**

Antes de pedirle "aplicar migration 0022": decirle exactamente qué puede salir mal y qué hacer si pasa.
Antes de pedirle "activar workflow v2": decirle exactamente cómo verificar que está OK y cómo hacer rollback.

---

## Referencias

- `.agent/skills/n8n-workflow-versioning/` — política versionado N8N
- `.agent/skills/creador-de-skills/` — meta-skill para capturar patrones nuevos
- `memory/decisions.md` — historial de decisiones y lecciones aprendidas
- `memory/rituales.md` — rituales recurrentes (backup, salud, etc.)
- `CLAUDE.md` del proyecto y madre — reglas del template
