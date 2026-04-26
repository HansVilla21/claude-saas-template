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
- Las **skills en `.claude/skills/`** también — son project-local del template pero se heredan a cualquier sesión que se abra desde la raíz
- Los **repos en `inputs/repos-referencia/`** son material de consulta para los agentes

## Estructura del template

```
.
├── .claude/
│   ├── agents/        Agentes genéricos reusables (8): arquitecto, frontend-builder,
│   │                  backend-builder, code-reviewer, debugger, security-auditor,
│   │                  penetration-tester, orquestador (genérico)
│   └── skills/        41 skills curadas: UI/UX (suite ui-ux-pro-max + emil + taste +
│                      vercel) + animación (GSAP) + marketing (8 TIER 1) + seguridad
│                      (OWASP + supabase-pentest)
├── inputs/repos-referencia/   10 repos de calidad como referencia para los agentes
├── memory/                    Memoria genérica (orquestacion.md = patrón de routing)
├── templates/                 Plantillas reusables
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
