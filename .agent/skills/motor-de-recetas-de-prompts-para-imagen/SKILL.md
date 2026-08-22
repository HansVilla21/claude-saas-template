# Skill: Motor de recetas de prompts para generación de imágenes (el moat)

## Cuándo usar esta skill

- Estás construyendo un producto donde el usuario da poca información (una foto + 3 campos) y el sistema debe devolver **N piezas visuales distintas y vendibles**.
- Ya tenés generación funcionando pero el output es **homogéneo** (todas parecidas), **alucina** (habla de otra categoría) o **tiene cara de IA** (fila de íconos, badges, letra chica).
- Vas a escribir el prompt "a mano" cada vez. Eso no escala: si la calidad del output es el producto, el prompt tiene que ser un **motor con estructura**, no un string.

**Regla del founder:** *el moat son estas recetas; pulir acá es lo más importante.* Se itera **sobre output real**, nunca de memoria.

## Por qué existe esta skill

FreshAdFlow, 2026-07-06. El founder generó el mismo café en dos estilos (9 + 9 imágenes) y se analizaron una por una. Tres defectos, con causa técnica exacta cada uno:

| Defecto | Evidencia | Causa real |
|---|---|---|
| **Homogeneidad** | 7 de 9 eran la MISMA foto (bolsa a la derecha, texto a la izquierda, mesa, fondo oscuro). Solo cambiaba el texto. | el prompt no variaba la **composición**, solo el ángulo del copy |
| **Alucinación de categoría** | 2 anuncios de CAFÉ hablaban de "piel" | el ángulo `dolor` era abstracto -> el modelo rellenaba con el género publicitario dominante (skincare) |
| **Gemelas exactas** | dos imágenes idénticas | `angles[i % 5]` con `count=9` repetía el prompt **carácter por carácter** |

El tercero es el más instructivo: **el bug no estaba en el modelo, estaba en la aritmética de la rotación.**

## La arquitectura: prompt compuesto por bloques, no un string

Cada imagen es una **combinación única** de piezas independientes. El prompt final se ensambla:

```
composePrompt = baseBlock(modo, qué, forma)   <- rol + qué preservar de la foto
              + angleText(ángulo, modo)        <- el gancho del copy
              + composition                    <- el tratamiento visual
              + twist                          <- la forma del titular
              + objetivoBlock(objetivo)        <- tono y CTA
              + textDensityBlock(densidad)     <- cuánto copy
              + styleBlock(estilo)             <- paleta y terminación
              + mensajeBlock(mensaje libre)    <- lo que pidió el anunciante
              + coreRules(qué, modo)           <- EL CANDADO (siempre al final)
```

Piezas separadas = cada eje se puede rotar, medir y arreglar por su cuenta.

### `baseBlock` — depende del MODO y define qué NO se puede tocar

Es la pieza más peligrosa del motor. En modo producto dice *"mantené el PRODUCTO EXACTAMENTE IGUAL: no alteres la etiqueta, el texto del envase ni la forma"*. Eso es lo que da fidelidad… y lo que hace que **invente un producto si no hay ninguno en la foto**. Por eso cada modo tiene el suyo:

- **producto:** preservá el producto exacto.
- **servicio:** preservá el ROSTRO exacto (mismos rasgos, sin alterarlo).
- **digital/concepto:** no hay nada físico que preservar; construí la escena desde cero. Si hay logo, incorporalo reconocible **sin deformarlo** — y si no podés reproducirlo nítido, usalo chico o solo tomá sus colores, **nunca un logo deforme**.

### Rotación con paso coprimo — la cura de la homogeneidad

```js
const angle       = angles[i % angles.length];       // 6 ángulos
const composition = comps[(i * 3) % comps.length];   // 8 composiciones, paso 3
const twist       = HEADLINE_TWISTS[i % 7];          // 7 formas de titular
```

**Por qué paso 3 sobre 8:** 3 es coprimo con 8, así que recorre **todas** las composiciones antes de repetir ninguna — aunque el ángulo sí se repita. Con paso 1 (o con el mismo módulo para todo) los pares se sincronizan y salen gemelas.

> Mantené `comps.length` **no múltiplo del paso**. Si mañana agregás una composición y quedan 9, el paso 3 empieza a ciclar cada 3. Es el tipo de bug que solo se ve mirando 9 imágenes juntas.

**Y guardá `i` como offset:** para "generar más" dentro de un pack existente, la tanda nueva arranca en `indexOffset` y **continúa** la rotación, en vez de re-empezar en 0 y salir casi igual a las primeras. Ver [[anexar-creativos-a-pack-existente]].

### `coreRules` — el candado, y va SIEMPRE al final

Es lo único que se inyecta en todas las imágenes, todos los modos y todos los estilos. Las 7 reglas que sobrevivieron a producción:

1. **Anti-alucinación, anclada al dato real:** *"el anuncio es EXCLUSIVAMENTE sobre `{qué}`. PROHIBIDO inventar otra categoría de producto o beneficios ajenos (salud, piel, belleza)."* Interpolar el `qué` del usuario es lo que mató los anuncios de café que hablaban de piel.
2. **No inventar cifras:** ni descuentos, ni porcentajes, ni precios, ni ratings, ni "+2.000 clientes". Sin badge de oferta si no hay oferta real.
3. **Anti-look-de-IA y anti-sobrecarga:** prohibido badges, sellos y chips con ícono ("CUPOS LIMITADOS", relojes, medallas, "-30%"), filas de íconos, listas de features y letra chica de condiciones. Si hay urgencia, va **dentro del titular** como frase, nunca como sello aparte.
4. **Texto en español legible**, con tildes y ñ, sin letras deformadas.
5. **Nunca el mismo sujeto dos veces** en paneles casi idénticos. Un antes/después vale **solo** si hay transformación real y visible (piel, pelo, dientes, superficie, espacio); si no, un solo plano potente.
6. **Encuadre profesional y respetuoso:** al rostro y al contexto; nada de primeros planos del cuerpo ni sugerentes. Esto además **baja** (no elimina) los bloqueos del moderador — ver [[limites-del-motor-de-imagen]].
7. **Claridad ante todo:** aunque el texto sea mínimo, siempre debe comunicar QUÉ se ofrece. **Prohibido el gancho suelto** ("¿Cansado de perder tiempo?") sin decir de qué se trata. En 2 segundos se tiene que entender qué se vende.

En modo digital se suma la 8: **texto de interfaz mínimo y legible** en mockups — antes formas e íconos que UI cargada de texto falso (gibberish).

### `textDensityBlock` — poco texto ≠ texto vago

El control que el usuario ve como "¿Cuánto texto? Poco / Normal / Mucho". El default es **Poco** (marca simple). La corrección que costó una iteración entera:

> *"CANTIDAD DE TEXTO: MÍNIMA pero que COMUNIQUE. Poco texto NO significa texto vago."*

Un gancho sin sustancia es peor que un párrafo. Y la regla anti-sobrecarga (#3) aplica **en todos los niveles**, incluido "Mucho" — más texto significa más jerarquía, no más badges.

## Proceso para pulirlo

1. **Generá una tanda real** (9 imágenes del mismo caso) y miralas **juntas**. Los defectos de variedad solo existen en el conjunto.
2. **Clasificá el defecto:** ¿homogeneidad (rotación), alucinación (anclaje), o look de IA (candado)? Cada uno tiene su bloque; no toques los tres a la vez.
3. **Verificá la unicidad en seco**, sin gastar API: generá los N prompts y comprobá que son N strings distintos y N composiciones distintas. Ese chequeo hubiera cazado el bug de las gemelas sin generar una sola imagen.
4. **A/B contra output real** antes de dar por bueno el cambio — [[probar-motor-ia-fuera-de-la-app]].
5. **Guardá el prompt de cada creativo en la DB.** Es lo que después habilita "generar variaciones" (re-correr la receta con un sufijo de hermandad sobre la MISMA foto original, no img2img sobre el output) y lo que te deja diagnosticar un caso malo meses después.

## Gotchas

- **Una regla positiva no borra una prohibición del `baseBlock`.** Si el base dice "preservá el producto" y no hay producto, ninguna regla suave lo salva: el fix es el modo correcto ([[causa-raiz-mala-calidad-ia-esta-en-el-input]]).
- **Endurecer el prompt puede BAJAR la calidad.** Pasó con las referencias de estilo: instrucciones más duras no las hicieron funcionar y degradaron el resto.
- **El antes/después clusterea.** Si el ángulo sale repetido en la rotación, forzá máximo 1 por tanda.
- **Los estilos heredan el candado o lo pierden.** El estilo "Directo" omitía el bloque anti-IA y reintroducía la fila de íconos. Cualquier bloque nuevo tiene que componer con `coreRules`, no reemplazarlo.
- **`what` vacío degrada la regla 1** a una versión genérica. Si el campo es opcional en la UI, el motor tiene que tener su rama sin interpolación (y saber que ahí alucina más).
- **Esto es IP.** En un repo público o compartido, el motor de recetas es lo primero que no debe salir.

## Ejemplo (input -> output)

- **Input:** 18 imágenes reales, 7 de 9 iguales, 2 hablando de "piel" en un anuncio de café.
- **Output:** recetario de 8 composiciones rotando con paso coprimo (9/9 prompts únicos, 8/8 composiciones distintas), `coreRules` con anclaje a la categoría real, y el bug de `i % n` eliminado.

## Relacionadas

[[gate-0-validar-motor-antes-de-construir]] · [[probar-motor-ia-fuera-de-la-app]] · [[causa-raiz-mala-calidad-ia-esta-en-el-input]] · [[limites-del-motor-de-imagen]] · [[anexar-creativos-a-pack-existente]] · [[generar-creativos-de-anuncios-con-ia]]
