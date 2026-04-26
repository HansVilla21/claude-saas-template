# UI/UX Pro Max — Notas para Hookly

## Origen
- **Repo:** https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
- **Clonado el:** 2026-04-25
- **Licencia:** MIT

## Qué aporta
Sistema completo de inteligencia de diseño para construir UI/UX profesionales. Es **la skill primaria de diseño** del proyecto Hookly.

## Las 7 skills que instalamos en `.claude/skills/` del proyecto

| Skill | Archivos | Para qué |
|---|---|---|
| `ui-ux-pro-max` | 53 + 20 templates | Skill principal: design system, paletas, tipografía, estilos, layout, charts. Motor de búsqueda Python. |
| `ui-styling` | 98 | Estilos UI específicos por componente y plataforma |
| `design` | 35 | Principios de diseño general |
| `design-system` | 26 | Construcción de design systems escalables |
| `brand` | 17 | Branding (logo, identidad, voz visual) |
| `slides` | 6 | Diseño de slides/presentaciones |
| `banner-design` | 2 | Diseño de banners |

**Total: 237 archivos de skills + 20 templates.**

## Por qué clonamos el repo además de instalar las skills
1. El instalador `uipro-cli` solo copia `ui-ux-pro-max` y deja fuera las 6 hermanas + templates
2. Tener el repo aquí permite re-extraer cualquier cosa adicional (docs, screenshots, plugin marketplace)
3. Si actualizan el repo, basta `git pull` aquí y re-copiar lo que se haya modificado

## Cosas que NO se copiaron a `.claude/skills/` (intencional)
- `cli/` — el instalador, solo lo necesitamos al inicio (npx ya lo descargó temporalmente)
- `screenshots/` — imágenes para el README, no aportan a la IA
- `preview/` — preview del marketplace
- `.github/` — workflows del repo origen, no nuestros
- `.claude-plugin/` — config del plugin marketplace, no necesario

## Cómo se usa desde Hookly
El `frontend-builder` (`.claude/agents/frontend-builder.md`) consulta `ui-ux-pro-max` automáticamente antes de codear cualquier UI. Las skills hermanas (brand, design-system, slides, etc.) se invocan según corresponda al pedido específico.

## Patrón Master + Overrides (pendiente de generar)
Cuando arranquemos UI, ejecutar:
```bash
python .claude/skills/ui-ux-pro-max/scripts/search.py "<descripción Hookly>" --design-system --persist -p "Hookly"
```
Esto crea `design-system/MASTER.md` (Source of Truth) y `design-system/pages/` para overrides por página.
