# Orquestación (template genérico)

> Patrón de routing reusable para cualquier subproyecto. Cada subproyecto puede sobrescribir esta con una versión específica en `proyectos/<nombre>/memory/orquestacion.md`.

## Principio

**El usuario habla en lenguaje natural, NO con slash commands.** El orquestador detecta intención y enruta al recurso correcto.

## Jerarquía de routing (en orden)

1. **Agente interno especializado** del subproyecto (en `proyectos/<nombre>/.claude/agents/`)
2. **Agente genérico del template** (en `.claude/agents/` del madre)
3. **Skill propia del subproyecto** (en `proyectos/<nombre>/.agent/skills/`) — para procesos repetibles del producto
4. **Skill global** del template (en `.claude/skills/` del madre, heredada al subproyecto)

## Catálogo genérico de routing

### Intención: planificación / proceso de desarrollo
→ **superpowers** (skills globales del usuario)
- "explora esta idea antes de codear" → `superpowers:brainstorming`
- "vamos a planear / escribe el plan" → `superpowers:writing-plans`
- "ejecuta el plan con checkpoints" → `superpowers:executing-plans`
- "TDD para esta feature" → `superpowers:test-driven-development`
- "debug sistemático paso a paso" → `superpowers:systematic-debugging`
- "haz code review" → `superpowers:requesting-code-review`
- "antes de declarar terminado, verifica" → `superpowers:verification-before-completion`

### Intención: dominio del producto (subproyecto)
→ **Agente interno del subproyecto** (siempre prioridad sobre genéricos)

### Intención: arquitectura, frontend, backend, seguridad
→ **Agentes genéricos del template** (`arquitecto`, `frontend-builder`, `backend-builder`, `code-reviewer`, `debugger`, `security-auditor`, `penetration-tester`)

### Intención: UI/UX, design, branding
→ **Suite skills del template** (`.claude/skills/ui-ux-pro-max`, `emil-design-eng`, `taste-skill`, etc.)

### Intención: animaciones avanzadas
→ **Skills GSAP** (`gsap-core`, `gsap-scrolltrigger`, `gsap-plugins`, etc.) + `emil-design-eng` como filtro de decisión

### Intención: marketing, copywriting, conversión
→ **Suite marketing skills** (`product-marketing-context` → `copywriting`, `page-cro`, `signup-flow-cro`, `onboarding-cro`, `paywall-upgrade-cro`, `pricing-strategy`, `marketing-psychology`)

### Intención: seguridad
→ **Agentes** (`security-auditor`, `penetration-tester`) + **skills** (`owasp-security`, suite `supabase-pentest` cuando aplique)

## Reglas operativas

1. **Nunca menciones el comando al usuario.** Solo el resultado.
2. **Si delegas, pasa contexto completo.** El agente al que delegas no tiene acceso a la conversación.
3. **Espera resultados antes de responder.** Consolida primero.
4. **Si una tarea se repite >2 veces, conviértela en skill** (con la skill `creador-de-skills` que cada subproyecto puede tener).
5. **Decisiones técnicas nuevas se registran** en `memory/decisions.md` del subproyecto con fecha absoluta.
6. **Aprendizajes de errores se registran** en `memory/learnings.md` del subproyecto.

## Cuando NO orquestar

Tareas triviales donde no necesitas delegar:
- Leer un archivo y responder qué dice
- Pregunta conceptual que sabes responder
- Cambio de 1-2 líneas en un archivo conocido

Para esto, lo haces directo. Cuando dudes, delega: el costo de delegar de más es bajo, el costo de improvisar mal es alto.
