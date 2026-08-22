# Skill: Gate 0 — validar el motor ANTES de construir el producto alrededor

## Cuándo usar esta skill

- Vas a construir un SaaS cuyo valor depende de que **una capacidad técnica funcione de verdad** (un modelo de IA, un scraper, un OCR, una integración de terceros).
- Todavía no sabés si esa capacidad rinde con datos reales, ni cuánto cuesta por unidad, ni cuánto tarda.
- Tenés la tentación de arrancar por la auth, la landing y el schema "mientras tanto".

**Regla madre:** si el motor no pasa, no hay producto. Se valida **primero**, aislado, y con criterios escritos ANTES de mirar los resultados.

## Por qué existe esta skill

FreshAdFlow, 2026-07-06. Antes de escribir una línea de la app se construyó `engine-gate0/`: un harness **cero-dependencias** (Node con `fetch`/`FormData` nativos, sin Next, sin DB, sin auth) que solo hace una cosa — mandar una foto real al modelo con las recetas candidatas y guardar el output.

Doce imágenes después (4 combos de modo x estilo, 3 cada uno) se sabía lo que ninguna cantidad de diseño de arquitectura habría dicho:

- **Qué endpoint usar:** `edit` (foto real -> anuncio), no `generate`. El `generate` puro **inventaba el producto** — en el smoke test produjo un frasco de una marca real que no existía. El `edit` preservó la etiqueta (texto chico, en francés) y el rostro intactos.
- **Que no hacía falta compositing.** El fallback previsto (pegar el producto sobre el fondo generado) se descartó: `edit` resolvió la fidelidad solo. Se ahorró una subsistema entero.
- **El costo real por unidad:** ~$0.06/imagen a `quality=medium` 1024x1024, medido del `usage` real de la respuesta, no de la tabla de precios. Eso definió el free tier y el pricing.
- **La latencia real:** ~90s promedio con cola larga (una tardó 232s) -> **el job asíncrono con polling no era una opción de diseño, era un requisito.**
- **Que `quality=high` no se justifica** para el MVP (2–3x el costo, diferencia no vendible).

Todo eso, por **$0.76 en total**.

## Proceso

### 1. Escribir los criterios de PASS antes de generar nada

Tres o cuatro, binarios, verificables mirando el output. Los de FreshAdFlow:

| Criterio | Umbral | Resultado |
|---|---|---|
| **Fidelidad** | la etiqueta / el rostro se preservan sin alterarse | PASS (texto chico intacto, rasgos fieles) |
| **Texto en español** | tildes y ñ correctas, sin letras deformadas | PASS 12/12 |
| **Consistencia** | vendibles la mayoría, no "1 bueno de cada 3" | PASS 12/12 |
| **Costo** | tolerable para el free tier previsto | ~$0.06/img |

Si los criterios se escriben después de ver el output, no son criterios: son una racionalización.

### 2. Harness aislado y desechable-pero-versionado

```
engine-gate0/
  run.js        <- corre la matriz de casos
  recipes.js    <- las recetas candidatas
  openai.js     <- la llamada cruda (fetch nativo)
  pricing.js    <- costo real desde el `usage` de la respuesta
  report.js     <- tabla de resultados
  inputs/       <- las fotos reales de prueba
  out/          <- lo generado
```

Cero dependencias a propósito: querés que corra en cualquier lado y que nada del framework contamine el resultado. **Versionalo** — post-Gate 0, `recipes.js` y `openai.js` se portan a `src/server/engine/` y siguen siendo la misma lógica.

### 3. Matriz de casos reales, no un happy path

Los ejes que de verdad cambian el resultado (en FreshAdFlow: modo x estilo), con inputs reales y difíciles: una foto de producto con **texto chico en la etiqueta**, un retrato con **rasgos distintivos** (lentes, barba, tatuaje). Un caso fácil no prueba nada.

### 4. Medir el costo del `usage` real, no de la tabla de precios

El input pesado infla los tokens de imagen. En FreshAdFlow un upload de 4.4 MB subió el costo por imagen; el learning fue **downscalear el upload a ~1024px antes de mandarlo**, que bajó el costo sin degradar la fidelidad de etiqueta.

```js
// pricing.js — costo real por respuesta
const cost = (u) =>
  (u.input_text_tokens  / 1e6) * PRICE_TEXT +
  (u.input_image_tokens / 1e6) * PRICE_IMAGE_IN +
  (u.output_tokens      / 1e6) * PRICE_IMAGE_OUT;
```

### 5. Cerrar con una decisión escrita

El entregable no son las imágenes: es un párrafo que dice **qué se decidió y qué se descartó**, con los números. "Motor oficial = `edit` con recetas de 4 bloques; compositing descartado; ~$0.06/img; job asíncrono obligatorio por la latencia."

## Gotchas

- **El Gate 0 también fija el free tier.** A $0.06/img, 1 pack de 3 cuesta $0.18 por cuenta. Con cuentas desechables eso se multiplica: el free tiene que ser chico, con marca de agua y con verificación de email. Ver [[anti-abuso-costo-ia-saas]] y [[watermark-en-display-plan-gating]].
- **La latencia define la arquitectura**, no al revés. 90s promedio mata cualquier request síncrono; el job + polling deja de ser discutible.
- **No mezcles el Gate 0 con la app.** Si el harness importa el framework, ya no estás midiendo el motor.
- **Un tell de IA descubierto acá es más barato de arreglar que en producción:** en FreshAdFlow el estilo "Directo" reintroducía una fila de íconos porque su bloque omitía el candado anti-IA. Se anotó en el Gate 0 y se arregló en las recetas.
- **El harness sigue siendo útil después.** Es la base de los A/B posteriores — ver [[probar-motor-ia-fuera-de-la-app]].

## Ejemplo (input -> output)

- **Input:** "queremos un SaaS que convierta la foto de un producto en anuncios".
- **Proceso:** harness aislado, 12 imágenes, 4 combos, criterios escritos antes.
- **Output:** GATE 0 APROBADO. `edit` sobre `generate`, sin compositing, ~$0.06/img, job asíncrono obligatorio, `quality=medium`. Costo de la decisión: $0.76 y una tarde.

## Relacionadas

[[probar-motor-ia-fuera-de-la-app]] · [[motor-de-recetas-de-prompts-para-imagen]] · [[anti-abuso-costo-ia-saas]] · [[async-job-pattern]] · [[creditos-por-imagen-reserva-y-refund]]
