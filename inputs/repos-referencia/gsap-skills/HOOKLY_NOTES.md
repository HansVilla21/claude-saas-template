# GSAP Skills — Notas para Hookly

## Origen
- **Repo:** https://github.com/greensock/gsap-skills
- **GSAP oficial:** https://gsap.com (acquired by Webflow, 100% gratis incluso plugins)
- **Clonado el:** 2026-04-25
- **Licencia:** MIT (skills) — GSAP en sí: gratis para uso comercial post-Webflow

## Qué aporta
GSAP es la librería de animación más poderosa de JS. Estas skills enseñan al agente a usarla bien.

## Skills instaladas (7 de 8)

| Skill | Para qué |
|---|---|
| `gsap-core` | API base: `gsap.to()`, `from()`, `fromTo()`, easing, stagger, defaults |
| `gsap-timeline` | Timelines complejas: secuencias, labels, position param, nesting |
| `gsap-scrolltrigger` | Animaciones scroll-driven: pinning, scrub, triggers, refresh |
| `gsap-plugins` | SplitText, ScrambleText, Flip, Draggable, Inertia, Observer, MorphSVG, CustomEase, GSDevTools |
| `gsap-utils` | Helpers: clamp, mapRange, normalize, interpolate, random, snap, toArray |
| `gsap-react` | useGSAP hook, gsap.context(), cleanup, SSR (Next.js) |
| `gsap-performance` | Performance: transforms vs layout props, will-change, batching |

## Skill NO instalada (excluida intencionalmente)
- **`gsap-frameworks`** — solo cubre Vue/Svelte. Hookly es Next.js (React), ya cubierto por `gsap-react`.

## Cuándo usar GSAP vs motion en Hookly

**`motion` (primaria, npm package, decisión en `memory/stack.md`):**
- Componentes UI cotidianos
- Botones, modales, hovers, microinteracciones
- Layout animations (cambios de tamaño/posición simples)
- Page transitions (junto con View Transitions API)
- Dashboard: gráficos, cards, listas

**GSAP (secundaria, para landing y momentos "wow"):**
- Landing page con scroll storytelling
- Hero animado complejo
- Text effects (SplitText: animar palabra por palabra/letra por letra)
- ScrambleText (efecto de "mezcla" en hero)
- Animaciones secuenciales largas con timelines
- SVG morphing si toca diseño con ilustraciones

## Por qué clone manual y NO `npx skills add`
Mismo motivo que con `emil-design-eng`: el CLI `skills` siempre toca `~/.agents/skills/` (sección "Universal — always included" oculta). Para mantener TODO project-local, hacemos clone + cp manual.

## Cosas que NO se copiaron a `.claude/skills/` (intencional)
- `examples/` — demos de referencia (vanilla + React)
- `assets/` — logos GSAP
- `.github/copilot-instructions.md` — para repos que usen Copilot, no aplica aquí
- `.claude-plugin/`, `.cursor-plugin/` — config del marketplace
- `gsap-frameworks/` — Vue/Svelte (no aplica)

Todo está en este repo de referencia si en algún momento se necesita.

## Notas de implementación cuando se use

1. **Instalar GSAP en el proyecto** cuando llegue UI:
   ```bash
   npm install gsap @gsap/react
   ```
2. **Registrar plugins** una sola vez por app:
   ```javascript
   import { gsap } from "gsap";
   import { ScrollTrigger } from "gsap/ScrollTrigger";
   gsap.registerPlugin(ScrollTrigger);
   ```
3. **En React: SIEMPRE useGSAP + scope + cleanup**:
   ```javascript
   import { useGSAP } from "@gsap/react";
   gsap.registerPlugin(useGSAP);
   useGSAP(() => { gsap.to(ref.current, { x: 100 }); }, { scope: containerRef });
   ```
4. **SSR Next.js:** usar `useGSAP` (maneja cleanup automático), evitar selectores globales sin scope.

## Risk level
LOW (declarado por el repo) — librería de animación, surface de seguridad mínimo.
