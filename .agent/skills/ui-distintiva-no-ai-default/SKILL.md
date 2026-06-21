---
name: ui-distintiva-no-ai-default
description: Usar ANTES de crear o rediseñar cualquier landing, página de marketing o UI con cara visible, para NO caer en el "default genérico de IA" y producir algo distintivo y de alta calidad desde la primera versión. Se dispara con "armá una landing/página/hero/UI", "rediseñá esto", "mejorá el diseño", "hacé una página".
---

# Diseño de UI/landings distintivo — nunca el "default de IA"

> Copia versionada en el repo. La fuente cross-project vive en `~/.claude/skills/ui-distintiva-no-ai-default/`.

## Cuándo usar esta skill
- ANTES de generar la **primera versión** de cualquier landing, página de marketing, hero, o UI con cara visible. (Es en la v1 donde la IA cae en el genérico.)
- Cuando el usuario pide "armá una landing", "una página para X", "un hero", "rediseñá esto", "mejorá el diseño".
- Es una skill de **proceso**: determina CÓMO encarar el diseño antes de escribir una línea.

## Por qué existe
La primera versión que produce una IA tiende SIEMPRE al mismo molde, porque interpola el promedio de millones de sitios. El resultado es competente pero genérico — "se ve como cualquier otra app de IA". Este skill fuerza un proceso que rompe ese promedio y entrega algo distintivo y de calidad desde el primer intento.

**Regla madre:** el diseño no nace de un molde (fintech/SaaS/landing template). Nace de la **verdad única del producto** y de **una idea fuerte**.

---

## Parte 1 — Reconocé el "AI default" (los *tells* a EVITAR)
Si tu diseño tiene varios de estos, es genérico. Marcá los que aparezcan y matalos:
- Hero centrado + texto centrado + **una palabra del titular con gradiente**.
- Botones "Get Started" + "Watch Demo" / "Book a demo".
- Tarjetas de **vidrio (glassmorphism) flotando**, estáticas, con mockups **falsos**.
- Tira de logos "**Trusted by / Used by**" (placeholders).
- **Grid de 3 features** con iconitos lineales genéricos y títulos "Powerful · Seamless · Secure".
- **Chips/badges** arriba del hero ("Made with X · Built for Y · #1 in Z").
- Paleta **morado/índigo → azul** con gradientes difusos; dark hero por default.
- **Stats row** "10k+ users · 99.9% uptime · $9M raised".
- Todo simétrico, todo centrado, cero tensión ni jerarquía.
- Copy vago de feature-speak en vez de voz humana concreta.

> Si reconocés 3+ de estos en tu borrador mental, PARÁ. Estás por entregar el default.

---

## Parte 2 — El proceso que SÍ funciona (en orden)
1. **Nombrá el default en voz alta.** Escribí "el default sería: hero oscuro centrado + cards de vidrio + logos + grid de 3". Comprometete a NO hacerlo. Reconocer el promedio es el primer paso para evitarlo.
2. **Anclá en la VERDAD ÚNICA del producto.** ¿Qué tiene ESTE producto que ningún template tiene? Su público, su tono, su magia, su contexto cultural. (Ej. Mi Menudo: tico, cálido, lee las alertas del BAC y las ordena solo, sin clave del banco.) Todo el diseño sale de ahí.
3. **NO saltes a la primera idea.** Proponé **3-4 direcciones DISTINTAS**, cada una diferenciada por una razón distinta (p.ej. editorial-cálido / producto-en-vivo / minimal-manifiesto / bold-brutalista). Mostralas (mockups ASCII en las opciones, o un preview) y que el humano elija. **Usá `superpowers:brainstorming`** — es obligatorio antes de codear creativo.
4. **Elegí un CONCEPTO, no una plantilla.** Idealmente ligado a la **magia del producto**. (Mi Menudo: el héroe ES el producto funcionando — la alerta del BAC se ordena sola. Eso nadie más lo tiene.) Un concepto fuerte diferencia más que mil adornos.
5. **Ejecutá con craft** → Parte 3.
6. **Verificá de verdad** → Parte 4.

---

## Parte 3 — Técnicas de elevación (calidad real)
- **Mostrá el producto REAL, no mockups falsos.** Capturas o UI real viva > tarjetas de vidrio inventadas.
- **Motion con PROPÓSITO.** La animación cuenta algo (el producto trabajando), no es decoración. Respetá `prefers-reduced-motion`. En móvil, triggers por viewport (IntersectionObserver), no scroll-scrub continuo (se traba en iOS).
- **Tipografía con jerarquía y tensión.** Display grande y confiada; fuerte contraste de tamaños; **asimetría** > todo centrado.
- **Color con intención.** La paleta de **LA marca** (no el morado-default). Un acento, usado con disciplina.
- **Voz humana y específica.** Copy concreto, local, honesto ("Mirá en qué se te va el menudo" ≫ "Take control of your finances").
- **Detalles que se sienten:** espaciado generoso y consistente, sombras suaves con sentido, estados (hover/active/focus), microcopy, tamaños fijos donde la animación cambiaría el layout.
- **Diferenciá por UNA idea fuerte**, no por acumular efectos.

---

## Parte 4 — Validá antes de cantar victoria
- **Mobile-first real:** verificá en 390px (apila bien, legible, animación fluida en iOS).
- **Render real:** levantá la página y SACÁ screenshots (desktop + móvil). No asumas que se ve bien — miralo.
- **Estados de animación:** que no rompan el layout (medí que los contenedores no crezcan/encojan).
- **Test del genérico:** mirá el resultado y preguntá *"¿esto podría ser de cualquier otra app?"*. Si la respuesta es sí, volvé al paso 2.

---

## Checklist anti-genérico (antes de entregar/deploy)
- [ ] ¿Nombré el default y lo evité explícitamente?
- [ ] ¿El diseño nace de la verdad única del producto (no de un molde)?
- [ ] ¿Propuse 3-4 direcciones distintas antes de elegir?
- [ ] ¿Hay UN concepto fuerte, ligado a la magia del producto?
- [ ] ¿Muestro producto real, no mockup de vidrio falso?
- [ ] ¿La animación tiene propósito (no decoración) y respeta reduced-motion?
- [ ] ¿Tipografía, color y voz son de LA marca, no del molde de IA?
- [ ] ¿Verifiqué en móvil con screenshots reales?
- [ ] ¿Pasa el "test del genérico"?

---

## Ejemplo concreto (Mi Menudo — landing, 2026-06-21)
- **Default rechazado:** hero oscuro centrado + cards de vidrio flotando + logos + grid de 3 features (justo lo que tenía, y lo que tiene la referencia "Finexa").
- **Verdad anclada:** tico, cálido; la magia = leer la alerta del BAC y ordenarla sola; privacidad (sin clave del banco).
- **4 direcciones propuestas** (editorial / producto-en-vivo / manifiesto-minimal / brutalista) vía brainstorming; el founder eligió **producto-en-vivo**.
- **Concepto:** el héroe ES el producto funcionando — alerta BAC → la IA la lee (escaneo) → movimiento categorizado → "libre para gastar" ajusta → caen más. Nadie más lo tiene.
- **Craft:** motion con propósito, UI real viva, verde de marca, copy tico, tarjeta de **altura fija** (no resize), sin chip genérico.
- **Validado:** screenshots desktop+móvil; altura de la tarjeta medida estable (394px en 6 beats); "test del genérico" pasado.
- **Resultado:** aprobado por el founder ("me gusta bastante"). Archivos: [src/components/vera/Landing.tsx](src/components/vera/Landing.tsx), [src/components/vera/landing/HeroDemo.tsx](src/components/vera/landing/HeroDemo.tsx).

---

## Gotchas / antipattern del proceso
- **NO** empieces a codear el diseño sin pasar por los pasos 1-4. El atajo = el genérico.
- **NO** te quedes con la primera dirección "porque está bien". "Bien" suele ser "promedio".
- **NO** uses mockups de vidrio falsos para rellenar; mostrá el producto real aunque sea más trabajo.
- **NO** declares "listo" sin ver screenshots reales en móvil. El layout/animación suele romperse ahí.
- **NO** confundas "muchos efectos" con "buen diseño". Una idea fuerte > mil gradientes.

## Skills relacionadas
- `superpowers:brainstorming` — proponer y elegir direcciones (paso 3). Obligatorio antes de codear creativo.
- Globales de craft: `taste-skill`, `redesign-skill`, `ui-ux-pro-max`, `emil-design-eng`, `minimalist-skill`, `web-design-guidelines`.
- En este repo: `reskin-marca-coherente` (consistencia de marca).
