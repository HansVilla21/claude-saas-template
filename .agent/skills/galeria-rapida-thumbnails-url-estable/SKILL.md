# Skill: Galería que no se siente tiesa — thumbnails + URL estable + polling que no recarga

## Cuándo usar esta skill

- Una galería de assets generados (imágenes, PDFs, videos) se siente **lenta y tiesa**: tarda en abrir, las imágenes cargan a tirones, parpadean.
- La pantalla hace **polling** mientras se generan resultados y las imágenes ya listas **se recargan solas** en cada tick.
- Estás sirviendo el archivo original a tamaño completo en una grilla de miniaturas.

## Por qué existe esta skill

FreshAdFlow, 2026-07-06. Feedback del founder probando un pack: *"navegar a Mis packs y abrir un pack se siente lento y tieso — tarda en cambiar de pantalla, y una vez adentro las imágenes cargan muy lento y rígido."*

No era una causa, eran cuatro sumadas. La más traicionera es la tercera, porque **el código se ve correcto**.

| Causa | Por qué duele | Fix |
|---|---|---|
| La grilla sirve el **master full-res** | PNG de ~1–1.5 MB c/u; 9 imágenes ≈ 14 MB para mostrar miniaturas | thumbnail webp redimensionado |
| El **polling re-firma las signed URLs** | cambia el `src` de cada `<img>` -> el navegador **recarga todo** en cada tick | URL estable sin token |
| `<img>` crudo | sin lazy-load, sin dimensiones -> layout shift | `next/image` o `loading="lazy"` + width/height |
| Ruta sin `loading.tsx` ni prefetch | la transición se siente muerta | esqueleto + prefetch |

## Proceso

### 1. Un endpoint de display con URL ESTABLE (no una signed URL)

Este es el corazón. En vez de firmar una URL temporal por imagen (que cambia en cada render), servís por una ruta propia con el id del recurso:

```
GET /api/creatives/{id}/view?w=480     <- misma URL siempre, para siempre
```

La ruta valida ownership, baja el master, **redimensiona** si viene `w`, aplica lo que tenga que aplicar (marca de agua para free — ver [[watermark-en-display-plan-gating]]) y lo stremea inline con `Cache-Control: private, max-age=600`.

Como el `src` no cambia entre renders, **el navegador la cachea y el polling deja de recargar nada**. El jank desaparece sin tocar el polling.

### 2. Redimensionar ANTES de cualquier post-proceso

```ts
// más barato: primero achicar, después watermarkear
if (width) buffer = await sharp(buffer).resize({ width, withoutEnlargement: true }).toBuffer();
if (!isPaid) buffer = await watermark(buffer);
```

Con tope de ancho (`Math.min(width, 1400)`) para que nadie use el endpoint como redimensionador gratuito.

### 3. Un helper único de "cómo se ve esta imagen"

`displayUrlFor(creative, { paid, width, version })` centralizado, usado por **todas** las rutas de display (grilla, lightbox, portada de la lista, favoritos). Cada pantalla calculando por su cuenta si el usuario es pago es cómo se filtra el master limpio por un lado que nadie revisó.

### 4. Cache-bust por versión, no por timestamp

Si cambiás lo que la ruta produce (una marca de agua nueva), las miniaturas viejas quedan cacheadas. Se resuelve con un contador en la URL (`?v=2`), **no** con `Date.now()` — eso último rompe el cache en cada render y te devuelve al problema original.

### 5. Full-res solo donde se justifica

Miniatura en la grilla, tamaño intermedio en el lightbox, **master completo solo en la descarga**.

## Gotchas

- **Signed URL y polling son incompatibles** si re-firmás en cada tick. O estabilizás la URL (recomendado) o cacheás la firma por id con su vencimiento y no la tocás hasta que expire.
- **Cortá el polling al terminar.** Un `done` que sigue poleando es batería y ancho de banda gratis del usuario.
- **En desarrollo, el retraso al cambiar de pantalla es compilación de ruta on-demand**, no tu código. No lo optimices persiguiendo un fantasma: medí en producción.
- **Redimensionar en cada request cuesta CPU.** Con cache del navegador alcanza al principio; si el volumen crece, pre-generá el derivado en Storage al momento de generar y servís ese.
- **El flash del estado inicial** (mostrar "0 créditos / plan gratis" antes de que cargue la sesión) es parte de la misma percepción de lentitud: gateá con un `authReady` y mostrá esqueleto.

## Ejemplo (input -> output)

- **Input:** "Mis packs se siente lento y tieso; las imágenes recargan solas mientras genera".
- **Output:** endpoint `/view?w=` con URL estable + thumbnails webp (~20x más livianos que el master), polling que ya no cambia el `src`, `displayUrlFor` único y cache-bust por versión.

## Relacionadas

[[watermark-en-display-plan-gating]] · [[async-job-pattern]] · [[anexar-creativos-a-pack-existente]] · [[refrescar-vista-server-tras-mutacion-cliente]]
