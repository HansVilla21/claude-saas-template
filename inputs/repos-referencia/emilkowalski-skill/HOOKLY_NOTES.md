# Emil Kowalski Skill — Notas para Hookly

## Origen
- **Repo:** https://github.com/emilkowalski/skill
- **Sitio del autor:** https://emilkowal.ski/skill
- **Curso del autor:** https://animations.dev
- **Clonado el:** 2026-04-25

## Qué aporta
La filosofía de Emil Kowalski sobre design engineering: UI polish, decisiones de animación, microinteracciones y detalles invisibles que hacen que el software se sienta bien.

## Skill instalada en Hookly
- `.claude/skills/emil-design-eng/SKILL.md` — único archivo, project-local

## Cuándo se invoca
- Al diseñar cualquier animación, transición, hover state, microinteracción
- Al revisar UI con énfasis en "que se sienta bien"
- Cuando hay duda sobre si algo debe o no animarse

## Reglas clave que aporta
1. **Framework de decisión de animación** (basado en frecuencia de uso):
   - 100+ veces/día → NUNCA animar (ej: keyboard shortcuts, command palette)
   - Tens of times/day → reducir o quitar
   - Ocasional (modal, drawer, toast) → animación estándar
   - Raro (onboarding, celebraciones) → puede tener delight
2. **Format obligatorio de review:** tabla markdown Before/After/Why (no listas con "Before:" y "After:" en líneas separadas)
3. **Filosofía core:** "Taste is trained, not innate" + "Unseen details compound" + "Beauty is leverage"

## Por qué clone manual y NO `npx skills add`
El CLI `skills` siempre copia a `~/.agents/skills/` (sección "Universal — always included" oculta en su prompt interactivo, no documentada en `--help`). Para una skill de 1 archivo, clone + cp manual es la única forma 100% project-local.
