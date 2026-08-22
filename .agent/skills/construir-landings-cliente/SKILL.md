# Skill: Construir landings de cliente desde una referencia

Reconstruir un set de landing pages de alta conversión cuando el cliente pasa
**(a)** una carpeta de material (fotos, videos, testimonios, decks, un framework de
estructura) y **(b)** una página web de referencia cuyo estilo quiere replicar.
El entregable: N landings con datos reales, copy compliance-safe, autoridad, y
deploy en subdominios propios.

**Caso real que la originó** (landings de Josué, 2026-08-07): 3 landings de inversión
reconstruidas desde cero sobre el blueprint del propio cliente + el estilo de
`momntagency.com`, deployadas en `rentabilidad/nucore/premium.jrminversiones.com`.

## Cuándo usar esta skill

- El cliente pasa **material + una página de referencia** y hay que armar landings.
- Ya existen landings pero el material del cliente **redefine el encuadre** (los
  avatares no calzan con los productos reales) y hay que reconstruir.
- Vas a replicar el estilo de una página que **no podés capturar** con el panel
  in-app (screenshots timeout).

## Proceso

### 1. Ingesta del material — sin bloatear git ni el deploy
- Mover la carpeta a una ruta **gitignoreada** (ej. `inputs/landings/material-<x>/`).
  4 GB de media NO van a git ni al deploy de Vercel (el app deploya desde otro árbol).
- Descomprimir stripping basura de macOS: `unzip -j -o … -x "__MACOSX/*"` y después
  `find … -name '._*' -delete` (los `._` son resource-forks ocultos que `ls` no ve).
- 🔴 **Gotcha Unicode:** nombres con acentos pueden venir en **NFD** (é = e + tilde
  combinante). `cp "archivo-é.pdf"` falla con "No such file"; usar `find -iname '*patrón*'`.
- Catalogar por **metadata** (nombres/tamaños/tipos), NO abriendo 170 fotos. Flag lo
  no-web: `.heic`/`.cr2`/`.mov` requieren conversión.
- Escribir un **`00-INDEX.md`** (mapa navegable) + un archivo de **memoria durable**
  (`memory/`) que apunte a la carpeta. Otra sesión lo va a necesitar.

### 2. Analizar TODO antes de construir — el material reencuadra el trabajo
- Leer a fondo (fan-out de agentes) cada doc, deck, testimonio, framework.
- Buscar el **reencuadre**: en el caso real, el material redefinió las 3 landings por
  producto y los 3 avatares construidos **no calzaban**. No asumir; leer la fuente.
- 🔴 **El brief del cliente suele pedir lo que su propio framework de compliance
  PROHÍBE.** Pidió "rendimientos garantizados"; su PDF de estructura prohibía
  "garantizado". Traducir a lenguaje permitido ("estructura y condiciones claras").
- Los "testimonios" pueden no ser testimonios (eran comprobantes de pago con nombres
  y montos reales) → anonimizar, nunca publicar crudo.
- Transcribir audios con la API key del `.env` (Whisper) — convertir `.ogg`→ mp3 con
  ffmpeg para compatibilidad de navegador.

### 3. Replicar la referencia con Playwright (NO con el panel in-app)
- El panel in-app **no compositó** (screenshots dan "the Browser pane is not displayed").
  **Playwright SÍ** renderiza (headless propio). Cargar la ref, screenshot + `evaluate`.
- Extraer el **sistema de diseño del DOM+CSS** (`getComputedStyle`): fuentes, pesos,
  colores dominantes, bg de secciones, tamaños de titulares. Es **más preciso que una
  captura** para replicar.
- Catalogar los **"devices" visuales** que usa la ref (el cliente notó "muy de texto"):
  bento de "en los medios", video con poster, fondos con textura, cards con screenshots,
  video/audio-testimonios. Escanear con JS: contar `img`/`video`/`background-image` por `y`.

### 4. Kit compartido + contenido por landing
- **Un kit de secciones reutilizable** (`components/lp/*` + `lib/lp/types.ts`) que las N
  landings comparten; **1 archivo de contenido por landing** (`l1.ts`, `l2.ts`…). Solo
  cambia el contenido, no la estructura.
- Estructura = los **8 bloques** del framework de conversión (Hero → Dolor → Mecanismo
  → Oferta → Filtro → Confianza → Formulario calificado → CTA final). Aplicarlo al 100%,
  **incluidas las casillas legales** del formulario (fuente lícita / entiende riesgo /
  no garantiza) — es el gap que siempre se olvida.
- Traducir la referencia a la **marca del cliente** (sus colores/tipografía), no copiar
  la paleta de la ref.

### 5. Autoridad — la persona correcta por landing
- No es "más fotos del cliente". Es **autoridad general con quien corresponde**: en unas
  landings el asesor, en otra las socias. No amontonar a uno donde manda otro.
- **Bento de reconocimiento** con assets reales (trofeo, respaldo regulado) + badge +
  titular encima. **Audio-testimonios** = onda + "Testimonio de audio" + transcripción;
  reproductor real solo con **consentimiento** (publica la voz de clientes reales).
- 🔴 Descartar fotos/videos con **marca comercial de fondo** (un "TAG MARKETS" en el set)
  si la regla es no mostrar marcas.

### 6. Gotchas de build que ya mordieron (revisar SIEMPRE)
- 🔴 **`min-width:auto` de grid/flex** (un calendario, un strip de días) empuja el ancho
  y desborda la página → `min-w-0` en el track. (Ver `verificar-frontend-sin-ver`.)
- 🔴 **Animación al scroll — que corra en TODOS los navegadores y nunca deje nada
  invisible.** Dos trampas ya mordidas: **(a)** motion `whileInView` deja el contenido en
  `opacity:0` si el observer no dispara → hueco vacío. **(b)** CSS scroll-driven
  (`animation-timeline: view()`) **SOLO existe en Chromium** → en Safari/Firefox el
  `@supports` falla y NO anima nada: la página se ve **estática** y el cliente lo nota
  (pasó — "no pusiste animaciones, todo texto plano"). ✅ **Solución: IntersectionObserver**
  (universal) en un componente cliente (`"use client"`, montado en el `layout`) que agrega
  `html.reveal-on` SOLO cuando el JS corre y hay movimiento permitido; el estado oculto
  (`html.reveal-on .lp-reveal{opacity:0;transform:translateY(30px)}`) vive detrás de esa
  clase → sin JS o con `prefers-reduced-motion` todo queda **VISIBLE**. Pre-marcá lo que ya
  está en viewport como `is-revealed` ANTES de agregar `reveal-on` (evita el parpadeo
  aparecer→esconderse→reaparecer). Poné `.lp-reveal` en títulos + eyebrows + subtítulos +
  tarjetas (no solo tarjetas), con stagger por hermanos para la cascada. 🔴 Al **verificar
  con Playwright forzá `scroll-behavior:auto`** — el `smooth` global hace que el scroll
  programático en pasos rápidos no alcance a pasar cada elemento por la vista y da falsos
  "atascados" (el scroll real del usuario sí los revela).
- 🔴 Quitar un import compartido rompe **otro** componente del mismo archivo (saqué
  `DARK_2` y reventó `StatBar`). Verificar todos los usos antes de borrar un import.
- **Foto en 16:9 de un retrato vertical** recorta la cara → `object-position` o poster
  del propio video. **No poner botón de play si no hay video** (no fingir).
- Verificar sin ojos con Playwright: `scrollWidth > innerWidth` (desborde), `opacity` de
  las cards (contenido invisible), consola. **Capturas por sección**, no full-page — el
  full-page muestra las animaciones al scroll a medio revelar.

### 7. Deploy con subdominios
- 🔴 **El proyecto basura:** `vercel deploy --yes` sin `.vercel/project.json` **inventa**
  un proyecto con el nombre de la carpeta y deploya ahí (sin env vars → form roto).
  **Fix:** exportar `VERCEL_ORG_ID` + `VERCEL_PROJECT_ID` → fuerza el proyecto correcto.
- 🔴 **Quoting del token en background:** el `tr`/`sed` anidado para quitar comillas rompe
  el `eval` del run-in-background (muere antes del deploy). **Usar un script file** (`.sh`),
  no un comando inline multi-línea.
- **Subdominios:** `middleware.ts` que reescribe por hostname → ruta (URL limpia, sin
  cambiarla). Agregar cada dominio a Vercel (env-linked → 1 argumento:
  `vercel domains add sub.dominio.com --scope <team>`). DNS (Cloudflare) = **CNAME →
  `cname.vercel-dns.com`, DNS only (nube gris, NO proxied)** — proxied da "too many
  redirects" y rompe el SSL. Vercel emite el cert solo en minutos.
- Favicon: `app/icon.svg` (Next genera el `<link rel=icon>`).

## Output esperado

- N landings en vivo, cada una en su subdominio con SSL, sirviendo su landing por el
  rewrite del middleware.
- Kit reutilizable (`components/lp/*`) + 1 archivo de contenido por landing.
- `00-INDEX.md` del material + memoria durable + capturas de referencia y de verificación
  en la carpeta gitignoreada.
- Verificación explícita (Playwright): sin desborde desktop+mobile, consola limpia,
  assets sirviendo (200), subdominios resolviendo a IPs de Vercel.

## Ejemplo

**Input:**
"Josué pasó una carpeta de 4 GB (fotos, video de las socias, deck, testimonios, un PDF
de estructura de landing) y la web de Moment Agency como referencia de estilo. Quiere 3
landings por producto, en subdominios de jrminversiones.com, para el viernes."

**Output:**
1. Material a `inputs/landings/material-josue/` (gitignoreado) + `00-INDEX.md` + memoria.
2. Análisis: el material redefine las 3 landings por producto; el brief pide "garantizado"
   (prohibido por su propio framework) → traducido.
3. Moment renderizado con Playwright → sistema de diseño extraído (Inter 900, negro+lima)
   → traducido a navy+dorado.
4. Kit `components/lp/*` + `l1/l2/l3.ts`; 8 bloques + casillas legales.
5. Autoridad: L1/L3 = Josué (trofeo, audios); L2 = socias (video, Forbes).
6. Fixes: `min-w-0` del calendario, reveal por IntersectionObserver (universal), poster del video.
7. Deploy a `landings-josue` (env vars forzando el proyecto) + subdominios
   `rentabilidad/nucore/premium` (middleware + CNAME Cloudflare DNS-only).
**Verificado:** 3 subdominios 200 con SSL, cada uno su landing, sin desborde.
