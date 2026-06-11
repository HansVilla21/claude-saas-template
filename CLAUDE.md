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
