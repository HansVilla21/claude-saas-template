# Claude SaaS Template

Sistema reusable para construir SaaS con Claude Code como copiloto. Provee agentes especializados, skills curadas, memoria estructurada y referencias de calidad para arrancar proyectos sin partir de cero.

## Qué incluye

### 8 agentes genéricos (`.claude/agents/`)
- **`arquitecto`** — diseño técnico, decisiones de stack, modelo de datos
- **`frontend-builder`** — Next.js + Tailwind + motion, mobile-first
- **`backend-builder`** — Supabase, RLS, edge functions, jobs
- **`code-reviewer`** — revisión solo lectura
- **`debugger`** — debugging sistemático con causa raíz
- **`security-auditor`** — OWASP, secrets, vulnerabilidades
- **`penetration-tester`** — pentest pre-lanzamiento
- **`orquestador`** — routing en lenguaje natural

### 41 skills (`.claude/skills/`)

| Suite | Skills |
|---|---|
| **UI/UX Pro Max** | ui-ux-pro-max, ui-styling, design, design-system, brand, slides, banner-design |
| **Polish** | emil-design-eng |
| **Animación GSAP** | core, timeline, scrolltrigger, plugins, utils, react, performance |
| **Taste / Visual** | taste-skill, output-skill, redesign, minimalist, soft, brandkit |
| **Marketing TIER 1** | product-marketing-context, copywriting, page-cro, signup-flow-cro, onboarding-cro, paywall-upgrade-cro, pricing-strategy, marketing-psychology |
| **Seguridad** | owasp-security + 11 supabase-pentest |

### 10 repos de referencia (`inputs/repos-referencia/`)
Material curado para los agentes — Vercel agent-skills, GSAP, Emil Kowalski, Taste, OWASP, security-hooks, supabase-pentest, awesome-claude-code-subagents, marketingskills, ui-ux-pro-max-skill.

## Cómo se usa

```bash
# 1. Clonar el template
git clone https://github.com/HansVilla21/claude-saas-template.git
cd claude-saas-template

# 2. Inicializar un proyecto nuevo
mkdir -p proyectos/<nombre-del-proyecto>
cd proyectos/<nombre-del-proyecto>

# 3. Inicializar git independiente para ese proyecto
git init

# 4. Empezar a desarrollar — los agentes y skills del template están disponibles
#    desde cualquier sesión de Claude Code abierta en el madre
```

## Estructura

```
.
├── .claude/{agents,skills}/   ← reusable
├── inputs/repos-referencia/   ← referencias
├── memory/                    ← memoria genérica del template
├── templates/                 ← plantillas
├── proyectos/                 ← subproyectos (gitignored, repos independientes)
│   └── hookly/                  primer proyecto
├── CLAUDE.md                  ← instrucciones para Claude Code
└── README.md                  ← este archivo
```

## Subproyectos

| Proyecto | Path | Estado |
|---|---|---|
| Hookly | `proyectos/hookly/` | En desarrollo (SaaS análisis viral de reels) |

## Filosofía

- **Lenguaje natural sobre slash commands.** El usuario describe qué quiere; el orquestador enruta.
- **Project-local sobre global.** Skills, agentes y MCPs se instalan al proyecto por defecto.
- **Investigar antes de instalar.** Cada repo se inspecciona completo antes de tocarlo.
- **Auditoría de saturación.** No acumular skills sin uso real.

## Versionado

Este template y cada subproyecto son **repos de Git independientes**. El madre ignora la carpeta `proyectos/` para que los subproyectos no se contaminen entre sí.

## Licencia

Privado / uso personal hasta nuevo aviso.
