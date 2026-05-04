# Claude SaaS Template

Sistema reusable para construir SaaS con Claude Code como copiloto. Provee agentes especializados, skills curadas, memoria estructurada y referencias de calidad para arrancar proyectos sin partir de cero.

> **Esto es un template madre.** No es un proyecto en sí — es la base desde la que se inicializan SaaS concretos en `proyectos/<nombre>/` (cada uno con su propio repo de Git).

---

## 🚀 Empezar un proyecto nuevo desde cero

Si querés arrancar un SaaS nuevo, andá a una carpeta vacía, abrí Claude Code, y pegá este prompt:

````
Hola, voy a iniciar un proyecto nuevo de SaaS y quiero usar como base mi template madre.

Hacé lo siguiente, en este orden:

1. Cloná el repo `https://github.com/HansVilla21/claude-saas-template.git` en esta carpeta.
2. Leé `CLAUDE.md` y `README.md` del template para entender qué tengo disponible (agentes, skills, frameworks, estructura).
3. Antes de empezar a setup, hacéme SOLO estas 3 preguntas:
   - ¿Cuál es el nombre del proyecto? (slug en kebab-case, ej. `mi-saas`)
   - En 1-2 líneas, ¿qué es y para quién?
   - ¿Stack principal? Default: Next.js + Supabase + Tailwind. Si querés otro, decímelo.
4. Cuando te responda:
   - Creá `proyectos/<nombre>/` con la estructura mínima del template (CLAUDE.md específico que extiende el del madre, `memory/`, `inputs/`, `outputs/`, `templates/`, `src/`, `.env.example`, `.gitignore`, `README.md`).
   - Hacé `git init` adentro del subproyecto — es un repo independiente del madre.
   - NO hagas commit todavía. Yo decido cuándo.
5. Dame un resumen breve de qué tengo disponible (agentes, skills relevantes a mi stack, frameworks) y cuáles son los siguientes pasos lógicos.

Reglas importantes mientras trabajamos juntos:
- NO uso slash commands. Yo hablo en lenguaje natural y vos detectás intención + enrutás al recurso correcto (agente, skill, cadena).
- Cambios destructivos, instalaciones globales o pushes a producción requieren mi OK explícito.
- `.env` siempre en `.gitignore`. Nunca commits con secretos.
- Mobile-first sin excepción para UI.
- Preferí editar archivos existentes a crear nuevos.
- Antes de instalar un repo o paquete nuevo, inspeccionalo a fondo y compará lo que el CLI hace vs lo que el contenido real ofrece.

Empezá.
````

Eso es todo. Claude clona el madre, te hace 3 preguntas, prepara la estructura del subproyecto y te dice qué tenés disponible. De ahí seguís en lenguaje natural normal.

---

## Qué incluye el template

### 12 agentes (`.claude/agents/`)

**Técnicos (8):**
- `arquitecto` — diseño técnico, decisiones de stack, modelo de datos
- `frontend-builder` — Next.js + Tailwind + motion, mobile-first
- `backend-builder` — Supabase, RLS, edge functions, jobs
- `code-reviewer` — revisión solo lectura
- `debugger` — debugging sistemático con causa raíz
- `security-auditor` — OWASP, secrets, vulnerabilidades
- `penetration-tester` — pentest pre-lanzamiento
- `orquestador` — routing en lenguaje natural

**Estrategia / SaaS (4):**
- `hormozi-strategist` — oferta, posicionamiento, money models, ads
- `saas-strategist` — pricing tiers, métricas SaaS, retention, growth loops
- `pain-discovery` — mining de dolores reales en comunidades online
- `billing-engineer` — Stripe / Onvo / sistema de créditos / afiliados

### 9 skills genéricas de proceso (`.agent/skills/`)
- `creador-de-skills` (meta-skill)
- `evaluar-icp`, `definir-avatar`, `descubrir-dolor`, `construir-oferta`
- `customer-research`, `email-sequence`, `launch-strategy`, `social-content`

### 50+ skills de Claude Code (`.claude/skills/`)

| Suite | Skills |
|---|---|
| UI/UX Pro Max | ui-ux-pro-max, ui-styling, design, design-system, brand, slides, banner-design |
| Polish | emil-design-eng |
| Animación GSAP | core, timeline, scrolltrigger, plugins, utils, react, performance |
| Taste / Visual | taste-skill, output-skill, redesign, minimalist, soft, brandkit |
| Marketing | product-marketing-context, copywriting, page-cro, signup-flow-cro, onboarding-cro, paywall-upgrade-cro, pricing-strategy, marketing-psychology |
| Seguridad | owasp-security + 11 supabase-pentest |
| Infraestructura | meta-pixel-capi, vercel-domain-migration, onvo-setup, onvo-checkout-flow, onvo-troubleshooting |

### Frameworks
- `memory/frameworks/hormozi.md` — síntesis operativa de $100M Offers + Money Models + GOATed Ads

### 10 repos de referencia (`inputs/repos-referencia/`)
Material curado para los agentes — Vercel agent-skills, GSAP, Emil Kowalski, Taste, OWASP, security-hooks, supabase-pentest, awesome-claude-code-subagents, marketingskills, ui-ux-pro-max-skill.

---

## Estructura

```
.
├── .claude/
│   ├── agents/                12 agentes reusables
│   └── skills/                50+ skills de Claude Code
├── .agent/
│   └── skills/                9 skills de proceso genéricas
├── memory/
│   ├── orquestacion.md        Patrón de routing en lenguaje natural
│   └── frameworks/
│       └── hormozi.md         Biblia de oferta/posicionamiento
├── inputs/repos-referencia/   10 repos de referencia
├── templates/                 Plantillas reusables
├── proyectos/                 ← Subproyectos (gitignored, repos independientes)
│   └── hookly/                  primer proyecto
├── CLAUDE.md                  Instrucciones globales para Claude Code
└── README.md                  Este archivo
```

---

## Cómo se usa (alternativa manual sin prompt)

Si preferís hacerlo a mano sin pegar el prompt:

```bash
git clone https://github.com/HansVilla21/claude-saas-template.git mi-nuevo-saas
cd mi-nuevo-saas
mkdir -p proyectos/<nombre-proyecto>
cd proyectos/<nombre-proyecto>
git init
# desde acá, abrí Claude Code en la raíz del template (mi-nuevo-saas) — los
# agentes, skills y frameworks del madre quedan disponibles automáticamente
```

---

## Subproyectos activos

| Proyecto | Path | Estado |
|---|---|---|
| Hookly | `proyectos/hookly/` | En producción ([hooklylab.com](https://hooklylab.com)) — SaaS análisis viral de reels |

---

## Filosofía

- **Lenguaje natural sobre slash commands.** El usuario describe qué quiere; el orquestador enruta al agente, skill o cadena correcta.
- **Project-local sobre global.** Skills, agentes y MCPs se instalan al proyecto por defecto. Global solo con OK explícito.
- **Investigar antes de instalar.** Cada repo se inspecciona completo antes de tocarlo.
- **Auditoría de saturación.** Cada 5 nuevas instalaciones, revisar uso real para no acumular ruido.
- **Defensa en profundidad.** Reglas en CLAUDE.md → hooks deterministas → `.gitignore` como última línea.

---

## Versionado

Este template y cada subproyecto son **repos de Git independientes**. El madre ignora la carpeta `proyectos/` para que los subproyectos no contaminen el template ni viceversa.

- Madre: [`HansVilla21/claude-saas-template`](https://github.com/HansVilla21/claude-saas-template)
- Subproyectos: cada uno con su propio repo (ej. [`HansVilla21/hookly`](https://github.com/HansVilla21/hookly))

---

## Licencia

Privado / uso personal hasta nuevo aviso.
