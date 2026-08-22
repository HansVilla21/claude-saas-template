# Skill: El catálogo del cliente vive en un PDF (importarlo sin romper nada)

El cliente no tiene su catálogo en una base de datos: lo tiene en 4 PDF hechos en
Canva. Esta skill es el pipeline completo para pasar de eso a filas en Supabase,
**con revisión humana en el medio** y sin pisar lo que ya está publicado.

## Cuándo usar esta skill

- El cliente entrega su catálogo/lista de precios como PDF, folleto de Canva,
  Excel maquetado o carpeta de fotos con el nombre del producto en el archivo.
- Hay que cargar decenas o cientos de fichas y llenarlas a mano no es viable
  (la señal: el cliente dice *"sería demasiado insumo"*).
- Ya corriste `auditar-datos-antes-de-programar-features` y el diagnóstico fue
  "faltan datos, no falta código".

## Por qué existe esta skill

Caso real (mueblería, julio 2026): 83 productos con foto y nombre, 2 con precio,
0 con descripción. Los datos que faltaban **ya existían** — estaban en los
catálogos PDF que la mueblería reparte a sus clientes. El pipeline los pasó a
`230 productos, 213 con precio, 504 variantes`. Todo lo que sigue son las trampas
que costaron horas y que no se ven venir.

## La trampa madre: Canva exporta el texto letra por letra

Un PDF exportado de Canva **no tiene texto**, tiene glifos posicionados. Al
extraerlo sale así:

```
"C Ó D I G OC M - 2 0"      en vez de   "CÓDIGO CM-20"
"₡ 3 9 9 . 0 0 0"           en vez de   "₡399.000"
```

Consecuencias directas:

- **Las expresiones regulares sobre el texto crudo no sirven.** `/CM-\d+/` no
  matchea nunca. Hay que **desespaciar** antes de buscar cualquier cosa.
- **`pdf-parse` y compañía se quedan cortos.** Las fuentes son CID con códigos
  hexadecimales glifo por glifo; hace falta `pdfjs-dist` (build `legacy`) para
  resolver los CMaps y, sobre todo, para tener **la posición X/Y de cada
  fragmento**, que es lo único que permite reconstruir la tabla.

## El bug que más caro salió: agrupar filas por rejilla

Para reconstruir una tabla de precios hay que juntar los fragmentos que están en
la misma fila visual. **Redondear la Y a una rejilla fija NO funciona:**

```js
// ❌ Dos celdas de la MISMA fila pueden diferir 1pt y caer en cubos distintos.
const fila = Math.round(item.transform[5] / 10);
```

Cuando eso pasa, los fragmentos se terminan ordenando por Y en vez de por X y
**los precios salen invertidos**. Real: la cama CM-50 publicó el precio de Queen
en King y viceversa. Nada falla, nada avisa: el importador termina "bien".

```js
// ✅ Agrupar por proximidad con tolerancia, y recién ahí ordenar por X.
const TOL_FILA = 6;
// items ordenados por Y desc; si |y - yFilaActual| <= TOL_FILA => misma fila.
// dentro de la fila, ordenar por X asc.
```

El código completo y probado está en [`lib-catalogo-pdf.mjs`](lib-catalogo-pdf.mjs).

## Proceso

1. **Volcá el texto crudo primero y miralo con los ojos.** Antes de escribir
   ninguna regla de parseo, un script que tire el `.txt` de 3 páginas a disco.
   Es donde descubrís el espaciado, si hay tablas, y qué campos trae de verdad
   cada catálogo. No asumas la estructura: cada PDF del cliente es distinto.

2. **Una entrada de configuración por catálogo, escrita a mano.** No intentes
   inferir la estructura. Por cada PDF: nombre de archivo, categoría, cuál es el
   **eje de variante** y sus etiquetas.

   ```js
   const CATALOGOS = [
     { archivo: "CATÁLOGO CAMAS MPL.pdf", categoria: "Camas",
       eje: "Tamaño", etiquetas: ["Individual","Matrimonial","Queen","King","Semidoble"] },
     { archivo: "CATÁLOGO JUEGO DE COMEDOR MPL.pdf", categoria: "Juegos de comedor",
       eje: "Sillas", etiquetas: [], etiquetaRe: /\b(\d+)\s*sillas?\b/gi },
   ];
   ```
   El eje cambia por rubro y a veces por catálogo del mismo cliente: camas por
   tamaño, comedores por cantidad de sillas, cocinas por metro lineal.

3. **NO infieras el código de producto a partir del PDF.** El catálogo de
   comedores decía `Código: 001`, sin prefijo. Derivar `JC-001` de ahí es
   adivinar: el prefijo real sale del catálogo ya cargado o de la carpeta de
   fotos del cliente, no del texto. Un código mal inferido casa la ficha con el
   producto equivocado y le pone el precio de otro mueble.

4. **El importador NO escribe en la base.** Produce tres archivos:
   - `borrador-catalogo.csv` → el cliente lo abre en Excel y corrige.
   - `borrador-catalogo.json` → insumo del cargador.
   - `informe-cruce.md` → qué casó, qué no casó y qué sobra en cada lado.

   Son 83+ productos: un error masivo aplicado a ciegas es peor que no importar.

5. **El cargador es un paso aparte, idempotente y en dos velocidades.**

   ```bash
   node scripts/cargar-catalogo.mjs                       # simulación, no escribe
   node scripts/cargar-catalogo.mjs --aplicar             # escribe
   node scripts/cargar-catalogo.mjs --aplicar --publicar-precios
   ```
   - Los productos **nuevos entran con `visible = false`**: no aparecen en la web
     hasta que alguien revise nombre, precio y foto.
   - **No toca `precio_desde` de los productos ya publicados.** Eso cambiaría
     precios que el público ya está viendo, con un borrador que el cliente
     todavía no validó. Es un flag explícito y aparte.
   - Idempotente: se puede correr N veces sin duplicar (casá por `codigo`).

6. **Todo lo ambiguo se reporta, no se resuelve.** Si un producto trae dos
   precios sin rótulo claro (los muebles de cocina traían dos y nunca se supo si
   era rango, por metro o dos acabados), el importador **deja el precio vacío y
   emite una alerta**. Publicar un precio adivinado en el sitio del cliente es
   un problema comercial de él, no un detalle de importación.

7. **Re-corré el censo y mostrá el antes/después.** `83 → 230 productos`,
   `2 → 213 con precio`, `0 → 504 variantes`.

## Gotchas

- **`pdfjs-dist` en Node quiere URLs, no rutas.** En Windows especialmente:
  `standardFontDataUrl` tiene que ser un `file://` **con barra final**, armado
  con `pathToFileURL(path.join(dir,'standard_fonts') + path.sep).href`. Con una
  ruta de Windows normal falla o pierde las tildes.
  Importá el build `legacy/build/pdf.mjs`, no el default.
- **Desespaciar es más que quitar espacios.** `"C Ó D I G OC M - 2 0"` no tiene
  espacio entre `CÓDIGO` y `CM-20`. Reconstruí y **después** aplicá las regex de
  código y de precio, nunca al revés.
- **Los montos también vienen espaciados** (`₡ 3 9 9 . 0 0 0`) y con separador de
  miles local. Normalizá a número antes de comparar o de escribir.
- **Un nombre de archivo trae más de un `(NN)`.** `Cama (3) (1).jpg`: el primero
  es el número de foto, el segundo es el sufijo de descarga duplicada de Windows.
  Tomá el **primero** como número y despojá **todos** en bucle. También limpiá el
  `"Copia de "` inicial.
- **Los duplicados del cliente son reales y hay que reportarlos, no fusionarlos.**
  El mismo mueble aparecía con dos códigos (`JC-01 "REDONDO PITA"` ↔
  `JC-05 "Juego Pita"`, y lo mismo con PIZZA, OVALADO y X). Decidir cuál se borra
  es del cliente.
- **Un eje de variante puede faltar y colapsar en silencio.** Cómodas y
  recibidores venían "con espejo / sin espejo"; el importador no separaba ese
  cuarto eje y los dos precios colapsaban en un solo "Precio". Si un producto
  tiene más precios que etiquetas del eje configurado, es una alerta.
- **Los PDF originales pesan 120–300 MB: no van al repo.** Apuntá a una carpeta
  local con `--pdfs` y documentalo.
- **Los scripts leen `.env` en runtime y usan service role.** Solo se corren
  localmente. Nunca en el cliente, nunca en un endpoint.

## Output esperado

- `scripts/lib-catalogo-pdf.mjs` — lectura, desespaciado y agrupado por fila.
- `scripts/importar-catalogo.mjs` — PDF → `borrador-catalogo.{csv,json}` + `informe-cruce.md`.
- `scripts/cargar-catalogo.mjs` — borrador → Supabase, idempotente, con
  simulación por defecto y `--publicar-precios` aparte.
- Productos nuevos en `visible=false`, precios publicados intactos, ambigüedades
  reportadas con alerta.
- Censo antes/después.

## Ejemplo

**Input:**
"El cliente pasó 4 catálogos PDF hechos en Canva. Hay que meter eso en el sistema;
son 83 productos y a mano no se puede."

**Output:**
Volcado de texto → se descubre el espaciado de Canva → `lib-catalogo-pdf.mjs`
(pdfjs + desespaciar + filas con tolerancia 6pt) → config por catálogo con su eje
de variante → `importar-catalogo.mjs` produce CSV para Excel + JSON + informe de
cruce → el cliente corrige el CSV → `cargar-catalogo.mjs --aplicar` mete los
nuevos como ocultos sin tocar precios publicados → `--publicar-precios` cuando el
cliente valida. Resultado medido: 230 productos, 213 con precio, 504 variantes.
Los muebles de cocina quedaron **sin precio a propósito**, con alerta, porque sus
dos montos no tenían rótulo.

## Skills relacionadas

`auditar-datos-antes-de-programar-features` (el diagnóstico que manda a usar esto) ·
`fotos-de-pdf-con-revision-humana` (la mitad visual del mismo pipeline) ·
`completitud-de-contenido-en-el-panel` (lo que el importador no logró, lo llena el cliente) ·
`acciones-en-lote-seguras` (simulación antes de aplicar) ·
`probar-migracion-contra-base-viva-con-rollback`.
