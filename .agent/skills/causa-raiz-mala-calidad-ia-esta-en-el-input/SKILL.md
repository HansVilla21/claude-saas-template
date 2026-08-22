# Skill: Cuando la IA saca mala calidad, la causa raíz suele estar en el INPUT, no en el motor

## Cuándo usar esta skill

- Un producto con motor de IA (imágenes, texto, audio, video) está entregando **resultados malos a usuarios reales** y el reflejo es "hay que mejorar el prompt / cambiar de modelo".
- El founder te pasa feedback de calidad sobre output real ("esto se ve pegado", "las caras salen raras", "inventó un objeto que no existe").
- Estás por meterte a tocar el corazón del motor (recetas, prompts, temperatura) **sin haber probado que el motor es el culpable**.

**No usar** cuando el fallo es un error duro (excepción, 400, timeout) — eso es [[debugging-silent-errors]], no un problema de calidad.

## Por qué existe esta skill

Capturada el 2026-07-11 en FreshAdFlow (SaaS que convierte la foto de un producto en un pack de anuncios).

Las 2 primeras usuarias reales generaron anuncios malos: un **tarro de crema inventado** para un servicio de spa ("no armónico, se ve pegado"), un e-book "montado como una imagen pegada encima de otra", una persona "leyendo" un **libro cerrado** girado a cámara.

La hipótesis obvia era "el motor de prompts no da la talla". **Era falsa.** Las dos usuarias habían generado TODO en **modo Producto** — que era el **default preseleccionado** — aunque ninguna vende un producto físico: una vende masajes (servicio), la otra un e-book (digital). El `baseBlock` de producto ordena literalmente *"mantené el PRODUCTO EXACTAMENTE IGUAL"*. Sin producto físico en la foto, el modelo **obedece inventando uno**.

El motor estaba haciendo exactamente lo que se le pidió. **El defecto estaba en cómo el producto recogía el input.** Si se hubiera "arreglado el motor" se habría gastado la sesión entera degradando recetas que ya funcionaban.

## El principio

> Antes de tocar el motor, probá que el motor es el culpable. La mayoría de los "outputs malos" de un producto de IA en manos de usuarios reales son **inputs malos que el producto aceptó sin avisar**.

Orden de sospecha, de más barato a más caro:

1. **¿El usuario eligió bien?** Modo, plantilla, categoría, opción por default que nadie leyó.
2. **¿El producto le pidió lo correcto?** Campos ambiguos, jerga interna, ejemplos ausentes.
3. **¿Los datos llegaron completos al motor?** Verificalo en la DB, no en el código.
4. **¿El motor falla con input correcto?** ← recién acá se tocan las recetas.
5. **¿Es techo del modelo?** Anotalo y seguí; no se pelea con eso hoy.

## Proceso

### 1. Conseguir los datos REALES del caso malo

No reproduzcas con datos inventados. Bajá exactamente lo que el usuario mandó: la foto, los campos de texto, el modo, la config del job. En FreshAdFlow eso fue un CLI de admin (`node scripts/user-creatives.mjs <email> --links`).

Si el producto no guarda el input que produjo cada output, **eso es el primer bug a arreglar** — sin eso no hay diagnóstico posible, solo opinión.

### 2. A/B cambiando UNA sola variable

Regenerá el MISMO caso real cambiando **solo la variable sospechada** (acá: el modo). Todo lo demás idéntico: misma foto, mismos campos, mismo motor, misma versión de las recetas.

Corré el motor **fuera de la app** para que sea barato y no ensucie la base — ver [[probar-motor-ia-fuera-de-la-app]].

Guardá los dos sets lado a lado en una carpeta fechada (`outputs/PRUEBA-<hipotesis>/`). La evidencia visual es lo que cierra la discusión, no el razonamiento.

### 3. Leer el resultado sin piedad

En FreshAdFlow el A/B fue concluyente:

| Caso real | En el modo equivocado (Producto) | En el modo correcto |
|---|---|---|
| Spa / masajes | tarro de crema **inventado**, con el WhatsApp horneado ilegible en la etiqueta | el tarro **desaparece**; caras coherentes; texto limpio |
| E-book | "libro pegado", persona leyendo un libro cerrado | mockup en tablet integrado con luz y sombras reales |

Conclusión: **el motor ya era bueno cuando se usaba bien.** El arreglo era la guía de entrada, no las recetas.

### 4. Arreglar en 3 capas, en ese orden

Cuando el diagnóstico da "input", el fix se ordena así:

1. 🥇 **UI / captura del input** — la palanca real y la más barata. Que sea imposible elegir mal. Ver [[selector-que-obliga-eleccion-consciente]].
2. 🥈 **Guards en el motor** — la red para quien igual elija mal. Reglas negativas explícitas: *"si la foto no muestra un envase real, NO inventes tarro/pouch/caja"*, *"nunca imprimas el copy ni el contacto DENTRO de una etiqueta"*, *"mostrar una portada a cámara ≠ leer"*.
3. 🥉 **Techo del modelo** — anotar, no pelear ahora.

Shippeá la capa 1 sola y medí. En FreshAdFlow la capa 1 fue **un solo archivo** (`crear/page.tsx`, 117+/34-) contra una reescritura del motor que se evitó por completo.

## Gotchas

- **El default preseleccionado es una decisión que tomás vos por el usuario.** Si el default es el modo más común pero también el más destructivo cuando está mal, el default te está generando los casos malos.
- **La jerga interna se filtra a la UI y nadie la mapea.** "Concepto" no significa nada para quien vende un e-book. Se renombró a "Digital" con el ejemplo al lado.
- **El feedback del founder describe el síntoma, no la causa.** "Las caras salen raras" y "el tarro se ve pegado" eran el MISMO bug (modo equivocado), no dos.
- **No regeneres el pack del usuario para "arreglárselo"** sin decidirlo explícitamente: consume créditos/costo y no prueba nada que el A/B no haya probado ya.
- Si el A/B sale **empatado**, la hipótesis del input era falsa: ahí sí, al motor.

## Ejemplo (input → output)

- **Input:** "los anuncios de las 2 usuarias salieron mal, hay que mejorar el motor".
- **Proceso:** bajar sus jobs reales → A/B cambiando solo `mode` → comparar carpetas.
- **Output:** *"El motor no es el problema: ambas usaron Producto para algo que no es un producto. Evidencia en `outputs/generaciones/PRUEBA-modo-correcto/`. Plan de 3 capas; capa 1 (guía de modo) shippeada en 1 archivo."*

## Relacionadas

[[probar-motor-ia-fuera-de-la-app]] · [[selector-que-obliga-eleccion-consciente]] · [[motor-de-recetas-de-prompts-para-imagen]] · [[limites-del-motor-de-imagen]] · [[verificar-funcionamiento-end-to-end]]
