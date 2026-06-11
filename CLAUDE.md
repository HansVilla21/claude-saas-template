# Claude SaaS Template

## Qué es este proyecto

**Template madre** para construir SaaS y aplicaciones web con Claude Code como copiloto. Provee un sistema completo de agentes especializados, skills curadas, memoria estructurada, y referencias de calidad para arrancar proyectos sin partir de cero cada vez.

Este NO es un proyecto en sí — es la **base reusable** desde la que se inicializan proyectos concretos en `proyectos/<nombre>/`.

## Cómo se usa

### Para arrancar un proyecto nuevo

1. Crear carpeta en `proyectos/<nombre-del-proyecto>/`
2. Inicializar la estructura mínima dentro:
   ```
   proyectos/<nombre>/
   ├── .claude/agents/        ← agentes específicos del proyecto (ia, scraping, etc.)
   ├── .agent/skills/         ← skills propias del proyecto (procesos repetibles)
   ├── memory/                ← cerebro del proyecto (proyecto, posicionamiento, stack, decisiones)
   ├── inputs/                ← material de entrada
   ├── outputs/               ← entregables
   ├── templates/             ← prompts y formatos del proyecto
   ├── src/                   ← código de la aplicación
   ├── docs/                  ← documentación técnica
   ├── CLAUDE.md              ← instrucciones específicas del proyecto (extiende a este)
   ├── .env.example, .env, .gitignore, README.md
   └── (opcional) .mcp.json   ← MCPs específicos del proyecto
   ```
3. Cada subproyecto es un **repo de git independiente** (ver "Versionado" abajo)

### Para usar este template como referencia

- Los **agentes en `.claude/agents/`** están disponibles automáticamente para Claude Code en cualquier subproyecto
- Las **skills de Claude Code en `.claude/skills/`** también — son project-local del template pero se heredan a cualquier sesión que se abra desde la raíz
- Las **skills de proceso en `.agent/skills/`** las leen los agentes vía Read tool — son procesos repetibles aplicables a cualquier SaaS (ICP, oferta, avatar, pain discovery, meta-skill)
- Los **frameworks en `memory/frameworks/`** son la "biblia operativa" compartida que los agentes consultan (ej: Hormozi)
- Los **repos en `inputs/repos-referencia/`** son material de consulta para los agentes

## Estructura del template

```
.
├── .claude/
│   ├── agents/        Agentes genéricos reusables (12):
│   │                  · técnicos (8): arquitecto, frontend-builder, backend-builder,
│   │                    code-reviewer, debugger, security-auditor, penetration-tester,
│   │                    orquestador (genérico)
│   │                  · estrategia/SaaS (4): hormozi-strategist, saas-strategist,
│   │                    pain-discovery, billing-engineer
│   └── skills/        41 skills de Claude Code (slash commands): UI/UX (suite
│                      ui-ux-pro-max + emil + taste + vercel) + animación (GSAP) +
│                      marketing (8 TIER 1) + seguridad (OWASP + supabase-pentest)
├── .agent/
│   └── skills/        32 skills de proceso reusables:
│                      Originales (5): creador-de-skills (meta-skill),
│                      evaluar-icp, definir-avatar, descubrir-dolor, construir-oferta.
│                      Tier 1 — Bot/N8N/WhatsApp core (5, capturadas 2026-05-21):
│                      n8n-workflow-build-script, n8n-code-node-debug-pattern,
│                      whatsapp-image-delivery-ycloud, n8n-pipeline-rapido-vs-pesado,
│                      bot-llm-marker-expand-pattern.
│                      Tier 2 — Integración full-stack (5, capturadas 2026-05-21):
│                      ycloud-webhook-to-supabase, supabase-realtime-broadcast-pattern,
│                      bot-handoff-system-end-to-end, inbox-message-bubble-render,
│                      sales-framework-spsp-whatsapp.
│                      Tier 3 — Nicho específico (5, capturadas 2026-05-21):
│                      supabase-edge-function-secret-auth,
│                      n8n-properties-search-tool-pattern,
│                      crm-inbox-conv-list-filters-strip,
│                      n8n-langchain-agent-postgres-memory,
│                      bot-anti-loop-detector.
│                      Tier 4 — Outbound + Contactos + Admin (3, capturadas 2026-05-29):
│                      outbound-delivery-server-action, crm-contact-detail-tabs,
│                      crm-admin-panel-master-gated.
│                      Tier 5 — Meta-decisión + Operations (2, capturadas 2026-05-30):
│                      mesa-arquitectonica-multiagente (panel multi-agente
│                      + jueces adversariales para decisiones arquitectónicas
│                      grandes; incluye template.js parametrizable) +
│                      n8n-workflow-versioning (política formal de versionado
│                      de workflows N8N: snapshots, tags, rollback procedure).
│                      Tier 6 — N8N 1.121 gotchas (4, capturadas 2026-06-01,
│                      del fix loop de bot-c-v1): n8n-task-runner-no-crypto
│                      (UUID v4 + hash djb2 manuales cuando el sandbox restringe
│                      crypto global) + n8n-trace-id-postgres-overwrite (Postgres
│                      nodes pisan campos custom del item; usar $('NodeName')
│                      directo) + n8n-merge-combineall-trap (combineAll =
│                      cross-product que muere con input vacío; default a
│                      'append') + n8n-information-extractor-schema-mode
│                      (fromJson espera ejemplo, NO schema literal; usar
│                      'manual' + inputSchema para schemas dinámicos).
│                      Tier 7 — SaaS/Scraping patterns (3, capturadas 2026-06-11):
│                      async-job-pattern (UI→job→worker→polling+refund créditos),
│                      apify-integration-pattern (fetch directo, normalización -1/null,
│                      ScraperError tipado), debugging-silent-errors (console.error
│                      estructurado, reproducir antes de instrumentar, error codes).
│                      Las leen los agentes vía Read tool.
├── memory/
│   ├── orquestacion.md       Patrón de routing en lenguaje natural
│   └── frameworks/
│       └── hormozi.md        Síntesis de $100M Offers + Money Models + GOATed Ads.
│                             Biblia operativa de hormozi-strategist, saas-strategist,
│                             pain-discovery y las skills construir-oferta + evaluar-icp.
├── inputs/repos-referencia/   10 repos de calidad como referencia para los agentes
├── templates/
│   └── supabase-email-templates/  4 HTML de Auth parametrizados (confirm, magic-link,
│                                  reset-password, change-email). Reemplazar placeholders
│                                  {{PRODUCT_NAME}}, {{PRODUCT_TAGLINE}}, etc.
├── outputs/                   Entregables del template (vacío por defecto)
├── proyectos/                 ← Aquí viven los proyectos concretos (gitignored)
│   └── hookly/                  primer proyecto (repo independiente)
├── CLAUDE.md                  Este archivo
├── README.md
└── .gitignore                 Incluye `proyectos/` (subproyectos no se versionan aquí)
```

## Versionado / GitHub

Este repo es la **plantilla**. Tiene su propio repo en GitHub: `claude-saas-template`.

**Cada subproyecto en `proyectos/`** es **otro repo independiente** de GitHub. El madre los IGNORA (vía `.gitignore`).

Esto permite:
- Versionar el template separado de los proyectos (mejoras al template no contaminan proyectos)
- Cada proyecto cliente/SaaS tiene su propio historial, permisos, deploys
- Si mañana clonas el madre en otra máquina, los subproyectos se clonan por separado

## Cómo trabajamos (filosofía aplicable a TODOS los proyectos)

### Modo de trabajo: orquestación en lenguaje natural

El usuario **NO usa slash commands**. Habla en lenguaje natural sobre lo que quiere lograr. El **orquestador** (`.claude/agents/orquestador.md` del template, o el específico del subproyecto si existe) detecta intención y enruta al recurso correcto.

Detalles en `memory/orquestacion.md`.

### Directriz permanente: capturar todo proceso como skill (regla del founder, 2026-05-21)

**Cada vez que logramos un proceso nuevo en este proyecto** (conectar dos sistemas, resolver una clase de bug, armar un pipeline end-to-end, definir una mecánica de UI), **inmediatamente capturarlo como skill** en `.claude/skills/` (si es slash command usable por Claude Code) o `.agent/skills/` (si es proceso que leen los agentes vía Read).

**Cuándo capturar (regla del 3 + regla del "primera vez no trivial"):**
- Lo hicimos ≥2 veces y se ve venir la tercera → capturar.
- Fue la primera vez pero el aprendizaje es no-obvio o cross-project → capturar igual.
- Resolvimos un bug en cascada y hay learning técnico replicable → capturar.

**Qué capturar:**
- Pasos repetibles (con variables claras), no narrativas.
- Gotchas y errores que ya cometimos (para no repetirlos).
- Output esperado y formato.
- Ejemplo concreto de input → output.

**Por qué importa (cita literal del founder):**
> "Va a ser muy importante para más adelante, todo eso replicarlo también en otros proyectos. Quedando bien en este, podemos documentarlo, crear skills para, en otros proyectos, nada más reutilizar esas skills y volver a recrear todo con mucha más facilidad."

**Meta-skill que rige el formato:** `.agent/skills/creador-de-skills/SKILL.md`.

**Cómo se invoca en sesión:** El founder NO escribe `/crear-skill`. Detectar proactivamente cuando un proceso califica y proponerle: *"esto ya califica para skill — la armo ahora?"*. Si dice sí, crear inmediatamente sin pedir más detalles (el contexto ya está en la sesión).

### Reglas inviolables

- Nunca commits directos a `main`/`master` (en cualquier proyecto)
- Nunca instalar global sin OK explícito del usuario
- `.env` siempre en `.gitignore`, secretos nunca hardcodeados
- Antes de instalar un repo nuevo: investigar a fondo, verificar qué instala el CLI vs qué hay en el repo
- Auditoría de saturación cada 5 nuevas instalaciones

## Subproyectos activos

| Proyecto | Path | Repo GitHub | Descripción |
|---|---|---|---|
| Hookly | `proyectos/hookly/` | `hookly` | SaaS análisis viral de reels (Instagram MVP, TikTok V1) |

## Convenciones

- Idioma: el usuario habla español → respuestas en español. Código en inglés.
- UI: mobile-first sin excepción. Tailwind CSS. Animaciones con `motion` (primaria) o GSAP (secundaria, casos específicos).
- Branches: `feat/<nombre>`, `fix/<nombre>`, `docs/<nombre>`.
- Archivos > 300 líneas: dividir en módulos.

## Memoria global del usuario

Persistente entre sesiones (en `~/.claude/projects/.../memory/`):
- Modo orquestador en lenguaje natural
- Nunca instalar global sin permiso
- Protocolo para instalar repos pasados por el usuario
- Auditoría de saturación de skills

## Generacion de Prompts y Agentes de Chatbot (Momentum AI)

Este proyecto usa la metodologia Momentum AI para crear prompts y entrenar los agentes de IA
que responden en los flujos de chatbot. La calidad depende de seguir estas reglas SIEMPRE.

### Antes de generar u optimizar CUALQUIER prompt (obligatorio)

1. Leer `memory/metodologia-core.md` — reglas no-negociables (fuente de verdad)
2. Leer `memory/feedback-prompting.md` — correcciones ganadas en produccion
3. Consultar los prompts reales en `knowledge/workflows-reference/` como ancla de calidad
   (no inventar patrones — seguir lo que ya funciona)

### Skills y agente disponibles

| Recurso | Cuando se usa |
|---|---|
| skill `momentum-architect` | decidir cuantos agentes, modelo LLM, estructura del flujo |
| skill `momentum-prompt-gen` | generar prompts (agente principal, router, especialistas, objeciones, formateador, etc.) |
| skill `momentum-prompt-optimizer` | mejorar un prompt existente con cambios quirurgicos |
| agente `prompt-reviewer` | validar un prompt contra el checklist pre-deploy |

El flujo de calidad completo es: **architect (estructura) -> prompt-gen (genera) ->
prompt-reviewer (valida) -> prompt-optimizer (arregla quirurgicamente lo que falle).**

### Reglas de prompting NO negociables (resumen — el detalle esta en metodologia-core.md)

- **Arquitectura modular** — 1-3 agentes especializados, nunca un mega-prompt
- **Limites de chars:** agente principal 3,000-5,000 · especializado 1,000-2,000 · classifier 1,500-3,000
- **Cambios quirurgicos** — si funciona al 70%, arreglar el 30%. NUNCA reescribir desde cero
- **No inventar** — "Deja verifico eso" en vez de inventar datos
- **Valor primero, datos despues** — nunca pedir email/tel antes de dar valor
- **Puntuacion humana** — sin punto final, sin dos puntos, sin ; sin ¿ sin em-dash (—). Default SIEMPRE
- **Variar mensajes repetidos** — nunca el mismo texto literal dos veces
- **No prometer lo que el bot no puede enviar** — solo links y texto
- **SIEMPRE reportar el conteo de caracteres** de cada prompt generado
- **Formateador:** copiar verbatim el canonico (`.claude/skills/momentum-prompt-gen/assets/template-formateador.md`), no improvisar

### Regla de oro

Si el mensaje del bot suena a articulo de periodico, es bot. Si suena a un mensaje de WhatsApp
a un amigo, es humano. Ese es el filtro de calidad final.

### Decisiones de prompting (memoria heredada)

`memory/prompting-decisions.md` contiene decisiones arquitectónicas del proyecto Momentum AI
Chatbot Arquitect (Jacó, Dr. Carlos, El Canal, Level, etc.). Es contexto histórico — NO se
mezcla con `memory/decisions.md` (que es del CRM SaaS).

---

## Construcción de Workflows n8n (Momentum AI) — kit hermano del de prompts

Para construir **cualquier flujo de n8n** o **chatbot multi-agente** de Momentum, seguí el
entrenamiento. La **regla madre**: **el template base se DUPLICA, NUNCA se construye desde cero.**

### Antes de construir CUALQUIER workflow n8n (obligatorio)

1. Leer `knowledge/00_CURRICULUM_CONSTRUCCION_N8N.md` — el camino de aprendizaje completo (11 módulos)
2. Leer `memory/metodologia-core.md` — reglas no-negociables (compartido con prompting-kit)
3. Leer `memory/feedback-n8n-build.md` — **los 14 errores reales y su fix** (checklist OBLIGATORIO
   antes de declarar un workflow terminado — revisar SIEMPRE)
4. **DUPLICAR** el template más parecido de `knowledge/workflows-reference/` (template-base /
   dr-carlos / el-canal) — **NO improvisar nodos**, NO crear "Router" desde memoria

### Skills de construcción disponibles

| Skill | Cuándo se usa |
|---|---|
| `momentum-architect` | decidir cuántos agentes, router, post-processing, stack |
| `momentum-n8n-builder` ⭐ | configurar el workflow nodo por nodo sobre el template duplicado |
| `momentum-workflow-variants` | generar variantes TEST (chat interno n8n) / Telegram / YCloud |
| `n8n-langchain-prompts-rules` | evitar que las llaves `{}` rompan el Information Extractor |
| `n8n-postgres-prepared-statements` | queries Postgres robustas (JSON deconstruction, 5+ params) |
| `chatbot-db-schema-supabase` | schema multi-canal + multi-nicho (versión canónica del kit en `.claude/skills/`) |
| `chatbot-manychat-supabase-multicanal` | patrón multi-canal WA + IG + errores comunes |

### Reglas de construcción NO negociables (resumen — detalle en feedback-n8n-build.md)

- **Duplicar el template, no construir de cero** — solo cambian prompts, agentes, tools,
  post-procesamiento, credenciales. Mantener nodos comunes intactos.
- **Router = Information Extractor bien configurado** — SIN llaves `{}` en el prompt, schema
  repetido dentro del prompt en prosa, 3-4 destinos + backup al principal, Switch leyendo el
  campo real (`destino` u otro nombre corto). **NUNCA inventar un nodo tipo "Router"**.
- **Llaves `{}` en nodos LangChain rompen silencioso** — describir formatos en prosa, schema en
  el campo `inputSchema` (que sí acepta JSON literal)
- **Postgres 5+ params/nullables → JSON deconstruction** (`$1::jsonb` + `d->>'campo'`)
- **Nodos de persistencia EN PARALELO, no en serie** (si no, sobrescriben `$json.output`)
- **"Leer estado" en multi-canal → UPSERT, no SELECT** (auto-curativo)
- **Usar `.first()` no `.item`** después de Code/Agent/IE/Loop
- **Webhook externo → `responseMode: onReceived`** (evita timeout y duplicados)
- **Nombres de nodos representativos + sticky notes** por zona del flujo
- **VALIDAR antes de entregar** — verificar el output real de cada nodo (sobre todo el router)
  contra un Information Extractor que ya funcione en el proyecto, NO contra memoria

### Herramientas externas recomendadas (instalar aparte)

- **n8n-mcp** (czlonkowski/n8n-mcp) — crear/validar workflows en vivo. **La validación es lo que
  mata el router improvisado.**
- **Skills globales de n8n** (czlonkowski/n8n-skills) — sintaxis exacta de nodos y expresiones.
  Algunas YA están disponibles globalmente: `n8n-expression-syntax`, `n8n-node-configuration`,
  `n8n-code-javascript`, `n8n-validation-expert`, `n8n-mcp-tools-expert`, `n8n-workflow-patterns`.

### Causa raíz que este kit ataca (cita textual del README)

> *"El error #1 al construir estos bots es armar el workflow desde cero e improvisar los nodos
> (sobre todo improvisar el 'router' en vez de un Information Extractor bien configurado).
> La regla madre de Momentum: el template base se DUPLICA, nunca se construye de cero."*

Esto es **operativo**. Si Claude construye un workflow sin haber duplicado un template y sin
leer `feedback-n8n-build.md` primero, está violando una regla explícita del proyecto.
