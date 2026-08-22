# Skill: Verificar frontend sin poder verlo

## Cuándo usar esta skill

- Cuando cambiás UI y **no podés ver la página**: el preview está trabado, los
  screenshots dan timeout, o la ruta pide sesión y vos no tenés la contraseña.
- Cuando el cliente dice **"se ve mal / se mueve todo / no se entiende"** y el
  código se ve correcto.
- Cuando estás por escribir *"probalo y decime"* por segunda vez seguida. Eso es
  la señal: estás usando al cliente de ojos y va a costar 3 iteraciones lo que
  cuesta 1 verificando.
- Ante un **error de hidratación** cuyo diff muestra dos textos **idénticos a la
  vista**.

**Caso real que la originó** (CRM de Josué, 2026-07-15): tres rondas de "no me
convence cómo está acomodado". El diseño estaba bien las tres veces. Fallaba el
CSS. Se descubrió en la ronda 3 con el paso 1 de acá, que se podía haber corrido
en la ronda 1.

## Proceso

### 1. Preguntarle al CSS, no al navegador  ⭐ el paso que ahorra las vueltas

El servidor de dev sirve la hoja de estilos **sin sesión**. Ahí está la verdad:
si Tailwind no generó una clase, esa clase **no existe** por más que esté escrita
en el `className`.

```bash
curl -s http://localhost:<puerto>/_next/static/css/app/layout.css -o /tmp/live.css
```

```js
// css-check.mjs — lista las clases que Tailwind generó DE VERDAD
import { readFileSync } from "node:fs";
const css = readFileSync(process.argv[2], "utf8");
const pre = process.argv[3] ?? "lg";           // lg | md | sm | (vacío = todas)
const re = new RegExp(`\\.${pre}\\\\:([a-zA-Z0-9._\\\\[\\]/%-]+)\\s*[,{]`, "g");
console.log([...new Set([...css.matchAll(re)].map((m) => m[1]))].sort().join("\n"));
```

Comparar contra lo que escribiste. **El hallazgo que decide todo:**

- **Falta una clase que escribiste** → el navegador no la está aplicando. El
  ancho/alto lo decide el contenido y "todo se mueve". Esta señal es sólida: si
  no está, no existe.

**Sobra una clase que ya borraste** apunta a un CSS congelado, pero **NO lo
prueba** — ver el falso positivo de abajo. Diagnosticar por lo que FALTA.

> ⚠️ **Falso positivo: Tailwind escanea el proyecto como TEXTO PLANO — y eso
> incluye los `.md`.** No entiende de comentarios ni de documentación. Si nombrás
> una clase en un comentario o en una skill, **la generás igual**.
>
> Pasó escribiendo ESTE archivo: un build desde cero seguía trayendo la clase que
> yo había borrado del código. Primero culpé a un comentario en el `.tsx`, lo
> reescribí, rebuildeé… y **seguía ahí**. Salía de esta misma skill, que la
> mencionaba como ejemplo. Por eso acá abajo se describen en prosa y no por su
> nombre literal.
>
> Corolario doble: **(a)** una clase presente NO prueba que el código la use →
> diagnosticar por lo que FALTA; **(b)** nombrar clases en documentación deja CSS
> muerto en el bundle de producción.

> ⚠️ **Ojo con el grep — mordió DOS veces, de dos formas distintas.**
>
> **(a) El texto que buscás no es el que escribe Tailwind.** v4 escribe
> `@media (width >= 64rem)`, **no** `min-width:64rem`. Buscar el viejo devuelve 0
> y hace concluir justo lo contrario — casi reporto "los `lg:` no funcionan"
> cuando funcionaban todos.
>
> **(b) El CSS escapa los caracteres especiales, y tu regex no.** Un punto en el
> nombre de una clase sale como `\.` **con backslash literal**, y los dos puntos
> de una variante como `\:`. Un `grep` con regex no matchea y devuelve "FALTA"
> para clases que están ahí. Me pasó las dos veces que lo intenté.
>
> **Solución a las dos: usar `grep -F` (literal), nunca regex.**

> 🚨 **La trampa peor de todas: "OK" no significa que TU archivo la generó.**
>
> Si una clase ya la usaba otro componente, va a estar en el CSS aunque Tailwind
> no haya mirado tu archivo nunca. Verificás, da OK, y te vas tranquilo.
>
> Pasó en la sección de Productos (2026-07-16): de 22 clases verificadas, **todas
> las que dieron OK venían de otros archivos** y **las 4 genuinamente nuevas
> faltaban**. Sin cruzarlo, el informe habría dicho "verificado, todo generado".
>
> **La regla:** por cada clase que dé OK, correr `grep -rln '<clase>' --include=*.tsx`
> en el fuente. **Si aparece en más de un archivo, tu verificación no probó nada.**
> Diagnosticar SIEMPRE con al menos una clase que solo exista en el archivo nuevo.

> ✅ **Control negativo: verificá también una clase que NO debe existir.** Una que
> borraste, o un nombre inventado. Si "no está", tu método distingue presencia de
> ausencia; si "está", tu grep está roto. Cuesta una línea y es lo único que
> convierte la verificación en prueba.

### 2. El CSS congelado NO es solo del dev server — `next build` también miente

Esto es nuevo y es lo más peligroso de todo, porque **un build incremental es lo
que corre en el deploy**:

```bash
# ✗ build incremental: sirve CSS VIEJO. Compila limpio, tsc pasa, todo verde.
npx next build

# ✓ la única forma de saber qué CSS sale de verdad
#   (apagar el dev server primero — build y dev comparten .next y se pisan)
rm -rf .next && npx next build
```

Verificado el 2026-07-16: un `next build` sobre un `.next` existente generó un CSS
**sin 4 clases que estaban en el fuente**. Con `rm -rf .next`, las 4 aparecieron y
el archivo creció ~1.8 KB. Mismo código, dos CSS distintos.

> ✅ **En producción NO pasó — medido, no supuesto.** Vercel cachea `.next/cache`
> entre builds, así que la sospecha era razonable. Se bajó el CSS servido por el
> dominio de producción justo después del deploy: **las 4 clases nuevas estaban**,
> y la inventada seguía ausente. Un dato, no una garantía: si algún día una clase
> nueva no pinta en prod pero sí en local limpio, empezar por acá.
>
> **Bajar el CSS de producción cuesta 3 comandos y cierra el caso:**
> pedir el HTML de una ruta pública (`/login`), sacarle el `<link>` a
> `/_next/static/css/…`, bajarlo, y `grep -F`. Sin sesión, sin navegador.
>
> ⚠️ **No compares los TAMAÑOS de local vs prod para concluir nada.** El CSS
> local pesó 1.6 KB MÁS y por un momento pareció que prod venía incompleto. No:
> Tailwind escanea el directorio de trabajo, y ahí vivía otra app (la de landings)
> que no está en el repo del CRM. **Tu CSS local puede tener clases que en prod no
> existen — y no es un bug.** Diagnosticar por clase, nunca por bytes.

**En dev, el orden importa:** reiniciar y *después* editar deja el CSS viejo otra
vez. El JIT se atrasa sobre todo con **clases nuevas para el proyecto** (un ancho
de la escala que nunca se había usado) y con **valores arbitrarios nuevos** (una
plantilla de grilla con medidas entre corchetes). Las que ya existían en otro
archivo siguen andando — por eso una parte de la pantalla se ve bien y otra no, y
parece un misterio.

### 2b. Un token de color inventado no lo caza NADIE

`tsc` pasa. El guardián del sistema de diseño pasa (solo busca hex a mano). El
build pasa. Tailwind simplemente no genera nada y el elemento sale **sin color** —
un botón de texto blanco sobre fondo oscuro queda invisible.

Pasó el 2026-07-16 con un `bg-` de un token que no existía en `@theme`. Se
encontró de casualidad. **Antes de usar un token de color, confirmá que exista:**

```bash
grep -n "color-<nombre>" app/globals.css   # ¿existe el token?
grep -rn "bg-<nombre>" --include=*.tsx .   # ¿lo usa alguien más, o lo inventé yo?
```

Si sos el único que lo usa y no está en `@theme`, lo inventaste.

### 3. Preferir clases estándar antes que valores arbitrarios

Un ancho de la escala + `flex-1`, en vez de una plantilla de grilla con medidas
arbitrarias. Mismo resultado, pero un arbitrario nuevo es justo lo que el JIT no
genera. Si el layout se puede expresar con la escala, se expresa con la escala.

### 4. Medir con `javascript_tool` — pero validando el viewport primero

```js
// El renderer se desprende y queda en 0×0: TODAS las medidas mienten
// (la grilla colapsa a 1 columna y parece un bug de diseño).
innerWidth === 0 && "viewport muerto — fijarlo con resize_window antes de creer nada";
```

Y para color/animación: **apagar la transición antes de medir**
(`el.style.transition = "none"`), porque en un renderer trabado
`getComputedStyle` devuelve el valor **inicial** para siempre.

### 5. Cazar las dos trampas que no se ven en el código

**a) `min-width: auto` de flexbox le gana a tu ancho.** Un elemento flex nunca es
más angosto que su contenido, aunque le pongas `w-80`. Con texto corto mide 320px
y con un párrafo mide 1.150px: **las dimensiones las decide el texto, no el
diseño**. Se arregla con `min-w-0` en el elemento flex (y en cada eslabón de la
cadena hasta el `truncate`).

**b) `toLocaleTimeString` rompe la hidratación.** Formatea `09:54 a. m.` y el
espacio antes del "a. m." es un carácter invisible **distinto según la versión de
ICU**: la de Node no es la de Chrome. React muestra dos strings idénticos a la
vista y distintos de verdad.

```ts
// Determinista: aritmética, sin ICU. Sirve para cualquier zona SIN horario de verano.
const MESES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
function hora(iso: string, offsetHoras = -6): string {   // -6 = Costa Rica, fijo
  const d = new Date(new Date(iso).getTime() + offsetHoras * 3_600_000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]} · ${hh}:${mm}`;
}
```

> Si la zona **sí** tiene horario de verano, esto no sirve: formatear en el
> servidor y pasar el string ya listo al cliente.

### 6. Recién ahora, pedir ojos

Con el CSS verificado y las medidas tomadas, lo que queda es **gusto** — y ese sí
es del cliente. Pedirle que mire una vez, no tres.

## Output esperado

- La lista de clases que Tailwind generó de verdad, contrastada con el código.
- Un veredicto explícito: **"el CSS tiene las clases"** o **"el CSS está
  congelado / le faltan estas"**.
- Si hubo bug: la causa nombrada (clase ausente · `min-width:auto` · ICU), no
  "lo arreglé".

## Ejemplo

**Input:**
El cliente manda capturas: en una pestaña la lista mide 320px y el panel 845px;
en otra la lista mide 1.150px y el panel 80px. Mismo componente. "No son las
mismas dimensiones para absolutamente todo."

**Output:**

```
clases lg: generadas (33):
  flex-row          ← por eso SÍ se pone al lado
  h-112
  w-64
  (no está w-80)    ← la lista mide lo que mida el texto
  (no está flex-1)  ← el panel mide lo que mida su contenido
  (no está flex-none)
```

**Veredicto:** el CSS está congelado en un estado anterior al último cambio. Dos
causas encimadas: (1) el JIT no regeneró `lg:w-80` / `lg:flex-1` / `lg:flex-none`;
(2) falta `min-w-0` en la lista, que habría fallado igual con el CSS al día.

**Fix:** `min-w-0` + `rm -rf .next && pnpm dev` **después** del último cambio.
**Verificado:** `w-80`, `flex-1` y `flex-none` ya aparecen; la clase zombi ya no.
