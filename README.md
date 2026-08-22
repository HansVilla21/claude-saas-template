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
2. Leé `CLAUDE.md`, `README.md` y `.agent/skills/README.md` del template para entender qué tengo disponible (agentes, las 119 skills de proceso, frameworks, estructura).
2b. Corré `git config core.hooksPath .githooks` en el clon — el hook que bloquea commits en `main` no viaja solo y sin eso no corre.
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

### 17 agentes (`.claude/agents/`)

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

**Pipeline n8n (3):** `n8n-architect` → `n8n-builder` → `n8n-reviewer`
El reviewer tiene **veto**: audita antes de que el workflow llegue al founder.

**Prompting (2):**
- `langchain-prompt-designer` — system prompts de agentes LangChain (CO-STAR + TIDD-EC + pre-mortem)
- `prompt-reviewer` — checklist pre-deploy de la metodología Momentum

### 119 skills de proceso (`.agent/skills/`)

**El activo más valioso del template.** Cada una salió de un problema real que ya costó tiempo, y documenta **el gotcha**, no solo el procedimiento.

👉 **Índice temático completo: [`.agent/skills/README.md`](.agent/skills/README.md)**

| Familia | Cuántas | Las imprescindibles |
|---|---|---|
| Método y verificación | 10 | `verificar-funcionamiento-end-to-end`, `probar-camino-produccion-sin-efectos-externos`, `probar-migracion-contra-base-viva-con-rollback`, `verificar-base-del-pr-antes-de-mergear` |
| Datos, RLS y seguridad de base | 7 | `detectar-escritura-filtrada-rls`, `rls-write-bloqueada-por-policy-desalineada` |
| Multi-tenant y SaaS | 8 | `config-por-tenant-no-literal-en-el-flujo`, `catalogo-multifuncional-por-preset` |
| Bot, n8n y LangChain | 16 | `n8n-workflow-build-script`, `bot-handoff-system-end-to-end` |
| WhatsApp, webhooks e integraciones | 12 | `bsp-media-expira-archivar-propio`, `webhook-fanout-sin-reconciliacion` |
| UI, UX y frontend | 18 | `auditar-responsive-midiendo`, `acciones-en-lote-seguras` |
| Números, dinero y tiempo | 5 | `porcentaje-necesita-minimo-muestra`, `inicio-dia-timezone-fija` |
| Sitio, catálogo y CMS para PYME | 8 | `auditar-datos-antes-de-programar-features`, `chatbot-web-tools-sobre-datos-vivos`, `supabase-free-se-pausa-y-tumba-el-sitio` |
| Auth y deploy | 3 | `deploy-seguro-vercel-preview-prod` |
| Estrategia, marca y oferta | 8 | `arrancar-angosto-antes-de-ensanchar`, `filtro-de-esencia-de-marca`, `matar-el-olor-a-ia` |
| Ejecución y modo de trabajo del founder | 3 | `tarjeta-de-hoy-una-sola-cosa`, `perfil-de-operador-del-founder`, `archivar-en-vez-de-borrar` |

**El hilo común de las que más duelen:** casi todas existen porque algo *parecía funcionar y no funcionaba*. Un `update` bajo RLS que afecta 0 filas y responde éxito. Un nodo que reporta `success` sin escribir. Un PR que dice `MERGED` y cuyo código nunca llegó a producción. Un CDN que borra los archivos a los 7 días sin avisar.

### 62 skills de Claude Code (`.claude/skills/`)

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
│   ├── agents/                17 agentes reusables
│   └── skills/                62 skills de Claude Code (slash commands)
├── .agent/
│   └── skills/
│       ├── README.md          ← índice temático de las 119 skills
│       └── <98 carpetas>/     una SKILL.md cada una
├── .githooks/
│   └── pre-commit             Bloquea commits directos en main (ver abajo)
├── memory/
│   ├── orquestacion.md        Patrón de routing en lenguaje natural
│   └── frameworks/
│       └── hormozi.md         Biblia de oferta/posicionamiento
├── knowledge/                 Currículum de construcción n8n + metodología
│                              Momentum + workflows de referencia para DUPLICAR
├── docs/training/             11 módulos de entrenamiento (filosofía →
│                              arquitectura → prompts → workflow → entrega)
├── clients/                   Registro maestro de clientes: lo comercial y lo
│                              técnico juntos (ver clients/README.md)
├── inputs/repos-referencia/   10 repos de referencia
├── templates/                 Plantillas reusables (onboarding, correos de Auth)
├── proyectos/                 ← Subproyectos (gitignored, repos independientes)
│   └── hookly/                  SaaS de análisis viral de reels
├── crm-v2/                    ← Momentum AI CRM (gitignored, repo independiente).
│                              El proyecto que produjo la mayoría de las skills
├── CLAUDE.md                  Instrucciones globales para Claude Code
└── README.md                  Este archivo
```

### ⚠️ Un paso de instalación, una vez por clon

`.git/hooks/` no se versiona, así que el hook que bloquea los commits directos a `main` **no viaja solo**. Después de clonar:

```bash
git config core.hooksPath .githooks
```

Sin eso el hook existe en el repo, se lee, da confianza y **no corre**. Verificá con `git config core.hooksPath` (debe decir `.githooks`). Ver la skill `enforcement-con-hook-no-con-regla`.

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
| **Momentum AI CRM** | `crm-v2/` | **En producción con clientes reales** — CRM SaaS multi-tenant + bot de WhatsApp. El proyecto que más skills de proceso aportó al template |
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
