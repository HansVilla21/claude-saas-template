# Skill: Sacar las fotos del PDF del cliente — y hacerlas revisar antes de publicar

Extraer imágenes de producto de un PDF, filtrar por métrica lo que no es una
foto, y **nunca subirlas automáticamente**: generar una hoja de revisión para que
el cliente marque cuáles son suyas de verdad.

## Cuándo usar esta skill

- Las fotos de producto que tenés están dentro de un PDF, folleto o presentación.
- Vas a publicar en el sitio del cliente imágenes que **no tomaste vos** y no te
  consta de dónde salieron.
- El cliente ya se quejó de que las fotos del sitio "no son sus muebles".
- Estás corriendo `catalogo-desde-pdf-del-cliente` y te falta la mitad visual.

## Por qué existe esta skill

En la llamada del 13/07/2026 la clienta fue tajante: *"las fotos de los muebles
deben ser nuestros muebles"*, y señaló un sillón del sitio que **ni siquiera
fabrican**. El plan obvio era: sacar las fotos de los catálogos PDF del propio
cliente y usar esas, que por definición son suyas.

**No lo eran.** Al extraer las 388 fotos de los 4 catálogos aparecieron, mezcladas
con fotos reales del taller, renders de stock y al menos **una imagen generada por
IA con la marca de agua visible** (un banco de desayunador, en una cocina de
apartamento de lujo que la mueblería nunca hizo).

O sea: el problema que la clienta señaló en el sitio **también estaba adentro de
los catálogos que ella misma reparte**. Si el pipeline hubiera subido todo
automáticamente, habríamos publicado en el sitio del cliente exactamente lo que
él nos pidió quitar — y con más volumen.

**Regla que sale de ahí: la extracción y la publicación son dos pasos separados,
con un humano en el medio. Siempre.**

## Proceso

1. **Extraer con `pdfjs-dist` + `sharp`.** Recorrés los operadores de cada página
   y recuperás los XObject de imagen. Guardás a disco nombrando por código de
   producto (`CM-20-1.jpg`, `CM-20-2.jpg`) más un `_indice.json` con página,
   tamaño original y código.

2. **Filtrar por geometría lo que obviamente no es una foto.** Logos, marcos,
   cintas decorativas y viñetas. Valores que funcionaron (ajustalos midiendo el
   PDF real, no de memoria):

   ```js
   const MIN_LADO     = 320;        // el logo del encabezado medía 564x78
   const MIN_PIXELES  = 320 * 320;
   const MAX_RELACION = 3.2;        // más apaisado que esto es una cinta
   ```

3. **Filtrar capas planas por dispersión de color.** Máscaras, rellenos y sombras
   tienen desviación estándar baja; una foto real tiene dispersión.

   ```js
   const stats = await pipeline.clone().stats();
   const dispersion = stats.channels.reduce((s,c) => s + c.stdev, 0) / stats.channels.length;
   if (dispersion < 12) continue;
   ```

4. **La dispersión NO alcanza — sumá nitidez.** Un degradado tiene dispersión
   alta y se colaba como foto de portada. La nitidez sí separa, y de paso saca
   las fotos borrosas (que el cliente además pidió quitar). Medido con
   `sharp().stats().sharpness`:

   | Qué es | Nitidez |
   |---|---|
   | Degradado / capa decorativa | ~0.1 |
   | Foto real pero desenfocada | ~0.14 |
   | Foto usable | **1.4 – 7.0** |

   ```js
   const nitidez = stats.sharpness ?? 0;
   if (nitidez < 0.5) continue;
   ```
   Un umbral en 0.5 deja un margen cómodo entre las dos poblaciones.

5. **Generar la hoja de revisión HTML.** Un solo archivo que el cliente abre en
   el navegador, agrupado por categoría, con cada foto al lado del nombre y
   código del producto, y un check por foto. Sin build, sin servidor, sin login:
   se manda por WhatsApp y se abre. Exporta la lista de aprobadas como JSON.

6. **Subir solo lo aprobado, y solo donde falta.**

   ```bash
   node scripts/subir-fotos-extraidas.mjs                                # simulación
   node scripts/subir-fotos-extraidas.mjs --aplicar --aprobadas lista.json
   ```
   El subidor toca **solo productos que no tienen ninguna foto todavía**: los que
   ya tenían fotos reales del taller conservan las suyas, que son mejores que las
   del PDF.

7. **Un limpiador aparte para lo que ya se coló.** Si el criterio de nitidez lo
   afinaste después, un script que barre lo publicado y quita degradados y
   borrosas — y que **después de borrar reacomoda `orden` y `es_portada`**, para
   que ningún producto quede sin portada.

## Gotchas

- **`page.objs` vs `page.commonObjs`: consultá los dos, y NO preguntes con
  `has()` primero.** Según cómo el documento comparta la imagen, vive en uno u
  otro. Y `has()` devuelve `false` para objetos que todavía se están resolviendo
  y que `get()` sí entrega. Preguntar antes con `has()` hizo que **se perdieran
  todas las fotos del catálogo de salas**, en silencio. Consultá ambos almacenes
  en paralelo, gana el primero que responda, con timeout para que un callback que
  nunca dispara no cuelgue el proceso.
- **Aplanar el alfa antes de medir.** Si la imagen trae 4 canales,
  `.flatten({ background: "#ffffff" })` antes de `stats()`; si no, las
  estadísticas salen contaminadas por la transparencia.
- **Nitidez alta ≠ foto legítima.** La imagen generada por IA **pasó todos los
  filtros** porque es técnicamente nítida y con buena dispersión. Ninguna métrica
  va a detectar eso. Por eso el paso humano no es opcional: es el único filtro
  que sirve para "¿esto es tuyo?".
- **El mismo mueble sale varias veces en el PDF.** Contá y numerá por producto,
  y dejá que la revisión humana elija la portada.
- **No borres lo que ya estaba publicado y es mejor.** Filtrá por "productos sin
  ninguna foto", no por "productos que están en el índice del PDF".
- **Redimensioná al subir** (`width: 1600, withoutEnlargement: true`, JPEG q82
  con mozjpeg). Las imágenes embebidas en un PDF de Canva pueden ser enormes.
- **Los PDF originales (120–300 MB) no van al repo.** Ruta local por flag.

## Output esperado

- `scripts/extraer-fotos-pdf.mjs` — PDF → `outputs/fotos/<CODIGO>-N.jpg` + `_indice.json`
  + `_sospechosas.json`.
- `scripts/hoja-revision-fotos.mjs` — `outputs/fotos/revision.html`, autocontenida,
  agrupada por categoría, exporta la lista de aprobadas.
- `scripts/subir-fotos-extraidas.mjs` — sube **solo aprobadas**, **solo a
  productos sin fotos**, con simulación por defecto.
- `scripts/limpiar-fotos-malas.mjs` — barre lo publicado y reacomoda portadas.

## Ejemplo

**Input:**
"El cliente se quejó de que las fotos del sitio no son suyas. Sus catálogos PDF
tienen fotos de todos los muebles — sacalas de ahí y subilas."

**Output:**
388 fotos extraídas y filtradas (geometría + dispersión + nitidez ≥ 0.5).
`revision.html` a WhatsApp. El cliente marca las suyas y aparece el hallazgo: en
sus propios catálogos hay renders de stock y un banco generado por IA con marca
de agua. Se suben solo las aprobadas, solo a productos sin foto. El sitio queda
con fotos reales del taller y el cliente se entera de un problema que tenía en su
material impreso.

## Skills relacionadas

`catalogo-desde-pdf-del-cliente` (la mitad de texto del mismo pipeline) ·
`acciones-en-lote-seguras` (simulación antes de aplicar) ·
`reporte-de-estado-para-cliente-no-tecnico` (el HTML autocontenido, mismo patrón de entrega) ·
`verificar-visual-midiendo-contraste` (medir en vez de opinar sobre lo visual).
