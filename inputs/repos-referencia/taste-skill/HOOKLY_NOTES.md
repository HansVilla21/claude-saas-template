# Taste Skill — Notas para Hookly

## Origen
- **Repo:** https://github.com/leonxlnx/taste-skill
- **Sitio oficial:** https://tasteskill.dev
- **Clonado el:** 2026-04-25
- **Total skills en repo:** 13 (9 frontend + 3 imagegen + 1 default)

## Skills instaladas (6 de 13)

| Skill | Rol | Cuándo invocar |
|---|---|---|
| `taste-skill` | All-rounder con 3 sliders ajustables | Cuando se quiere control fino sobre design variance, motion intensity y visual density (1-10) |
| `output-skill` | Anti-laziness — fuerza output completo | **Siempre** que el modelo tenga tendencia a entregar a medias. Skill transversal, complementaria a TODO |
| `redesign-skill` | Auditar UI existente y mejorar | Cuando ya tengamos código del SaaS y queramos refinar layout/spacing/hierarchy |
| `minimalist-skill` | Notion/Linear style (clean, restrained palette) | **Solo cuando se decida estilo "minimalist"** para un componente o página |
| `soft-skill` | Premium calm (whitespace, soft contrast, spring motion) | **Solo cuando se decida estilo "soft"** para landing/marketing |
| `brandkit` (imagegen) | Genera brand-kit visual con ChatGPT/Codex | Una vez, cuando definamos identidad de Hookly (logo, paleta, tipografía, mockups) |

## Skills NO instaladas (7) y razón

| Skill | Razón de exclusión |
|---|---|
| `gpt-tasteskill` | Variante para GPT/Codex; Hookly usa Claude |
| `brutalist-skill` | Choca con vibe Hookly (queremos clean, no Swiss raw); además está en BETA |
| `stitch-skill` | Específico Google Stitch; no aplica |
| `image-to-code-skill` | Workflow image-first, redundante con brandkit + flujo manual |
| `imagegen-frontend-web` | No usaremos ChatGPT para mockups previos al code |
| `imagegen-frontend-mobile` | Hookly es web, no app móvil nativa |
| `research/` (carpeta) | Material de investigación del autor, no skill |

## Política de uso (CRÍTICA — para evitar conflictos)

### Settings de `taste-skill` (los 3 sliders)
Cuando se invoca taste-skill, los sliders se ajustan según el contexto:

| Contexto Hookly | DESIGN_VARIANCE | MOTION_INTENSITY | VISUAL_DENSITY |
|---|---|---|---|
| Landing page | 6-8 (asimétrico moderno) | 6-8 (scroll-triggered) | 4-5 (espacioso) |
| Dashboard del producto | 3-5 (centrado/limpio) | 2-4 (simple hover) | 7-9 (denso) |
| Páginas auth/marketing | 4-6 (mixto) | 3-5 (microinteracciones) | 4-6 (medio) |

### `minimalist-skill` vs `soft-skill` — REGLA ANTI-CONFLICTO
**NUNCA invocar las dos al mismo tiempo en el mismo componente o página.** Son estilos opuestos:
- `minimalist-skill` → Notion/Linear: monocromático, alta densidad informativa, palette restrained
- `soft-skill` → Premium calm: whitespace generoso, soft contrast, motion suave

**Workflow correcto:**
1. Definir el estilo de Hookly UNA vez (se hace con `brandkit` + decisión consciente)
2. Para cada zona del producto, asignar UNA skill (no ambas)
3. Mantener consistencia: si el dashboard es minimalist, NO usar soft en alguno de sus componentes

### `output-skill` — SIEMPRE complementaria
Esta no compite con nada. Se aplica como guarda transversal cuando el modelo tiende a:
- Dejar `// TODO` en código
- Saltar implementación de algún branch lógico
- Generar respuestas truncadas

### `redesign-skill` — solo aplica con código existente
No tiene sentido invocarla en greenfield. Esperar a tener código del SaaS implementado.

### `brandkit` — uso único / one-shot
Se usa **una vez** cuando definamos identidad de Hookly. Después queda como referencia. Genera prompts para imagegen externos (ChatGPT, etc.) con: logo concepts, color systems, typography, mockups.

## Cuándo NO usar estas skills (para evitar over-engineering)

- Si `ui-ux-pro-max` ya respondió la pregunta de diseño con su data CSV → NO duplicar con taste-skill
- Si el componente es trivial (botón, input simple) → confiar en `vercel-react-best-practices` + `emil-design-eng` y listo
- Si la decisión de estilo ya está tomada y documentada en `design-system/MASTER.md` → seguir el master, no re-invocar las skills de estilo

## Cómo se relaciona con lo que ya tenemos

| Necesidad | Lo que ya teníamos | Lo que aporta taste-skill |
|---|---|---|
| Design system con paletas/tipografías concretas | `ui-ux-pro-max` (data-driven, CSVs) | Nada, ya cubierto |
| Filosofía de polish/animaciones | `emil-design-eng` | Complementario (taste-skill tiene MOTION_INTENSITY slider) |
| Performance React | Vercel skills | Nada, ya cubierto |
| Auditoría a11y/perf | `web-design-guidelines` | `redesign-skill` aporta workflow de redesign completo (no solo checklist) |
| Estilo minimalista específico | Nada antes | `minimalist-skill` |
| Estilo soft premium específico | Nada antes | `soft-skill` |
| Forzar completeness | Nada antes | `output-skill` |
| Identidad visual del brand | Nada antes | `brandkit` |
