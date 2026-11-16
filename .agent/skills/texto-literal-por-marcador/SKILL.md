# Skill: El texto del negocio, tal cual (el modelo elige, no copia)

## Cuándo usar esta skill

- Un negocio pide que el bot mande **su** texto tal cual: la descripción de un servicio o producto del catálogo, una política, un aviso legal, un guion aprobado. "Que salga como copy paste."
- El texto tiene formato propio (viñetas, emojis, "Incluye:", links) o es más largo que una burbuja.
- La salida del modelo pasa por pasos que la transforman antes de mandarse: limpieza de puntuación, partidor de burbujas, recortador, reescritura de frases prohibidas.
- El prompt del negocio, o el de su autor, dice lo contrario ("la descripción la cuentas con tus palabras").
- Cross-project: cualquier bot con LLM cuya salida se procesa antes de llegarle a la persona.

## Por qué existe esta skill

Una clínica de medicina estética del CRM (38 servicios, descripciones de hasta 959 caracteres) pidió que, cuando alguien pregunta por un servicio, le llegue la descripción que ella cargó, igual. El modelo la resumía, porque el prompt se lo pedía. Y pedirle que la copie no alcanzaba, porque cada paso del motor la cambia:

| Paso | Qué le hace a una descripción copiada por el modelo |
|---|---|
| Limpieza de cada burbuja | Saca los dos puntos ("Incluye:" → "Incluye"), el Markdown, los ¿ ¡ y el punto final si el negocio no los usa |
| Partidor | Cada línea es una burbuja; una línea de más de 220 se corta y las vecinas se juntan hasta el tope de 3 |
| Recortador | Lo que pasa de tope × 220 = 660 caracteres vuelve al modelo para que lo acorte |
| El prompt del autor | "La descripción la cuentas con tus palabras, sin pegar el texto del catálogo" |

> La idea central: **el modelo no copia, elige.** Pone un marcador corto y el código pega el texto exacto, en su propio mensaje, después de todo lo que transforma la salida. Es el patrón de `bot-llm-marker-expand-pattern` (fotos y tarjetas), aplicado a un texto que no se puede tocar.

## Proceso

### 1. Una llave por negocio, apagada por defecto

`bot_config.descripcion_tal_cual: true`. Sin la llave no cambia nada para nadie, y eso se prueba letra por letra (paso 5). La prende el equipo, no el negocio: cambia cómo habla el bot.

### 2. Un marcador por texto, con una ref corta y estable

- `[FICHA:<ref>]`, con la ref igual a los primeros 8 caracteres del id: `[FICHA:4d65e5cf]`. Corta para que el modelo la copie sin errores, y estable entre turnos.
- Si dos ítems empiezan igual, **todas** las refs se alargan (12, 16…): una ref repetida mandaría el texto de otro servicio.
- En la lista del prompt va debajo de la descripción: `  Ficha: [FICHA:4d65e5cf]`. **La descripción se queda en el prompt:** el modelo la necesita para contestar preguntas puntuales y para elegir.
- Solo los ítems con texto: sin descripción no hay ficha.

### 3. La nota junto a la lista y el recordatorio al final

- **La nota**, al final de la lista (en la parte del prompt que se cachea), dice qué es la ficha y que vale **por encima de cualquier otra indicación** sobre cómo contar la descripción o dar el precio. También dice cuándo va: el servicio con nombre, también si solo preguntan el precio o una opción que vive dentro del texto, o cuando la persona elige uno. Y trae las excepciones:
  - pregunta general, o varios servicios que sirven: se nombran con su precio y se pregunta cuál, **sin fichas**. Es una decisión de producto, para que no le lleguen tres mensajes largos de una;
  - como mucho dos fichas por mensaje;
  - una ficha que ya salió no se repite, y una pregunta puntual después se contesta corta con lo que dice.
- **El recordatorio** es una línea al FINAL del prompt, con las reglas del motor, y va solo con la llave prendida. Lo que se lee al final gana cuando el medio dice otra cosa. **Lleva las mismas excepciones que la nota** (ver gotchas).
- Las dos van sin dos puntos, sin raya y sin formas de vos ni de tú, porque el bot imita la ortografía de lo que lee. Una prueba lo revisa.

### 4. Expandir en el código, después de todo lo que transforma

En el orden del turno:

1. **Recortador y reescritura de frases prohibidas.** El marcador **no cuenta para el largo**, y una versión que lo pierde se descarta: la comparación de marcadores ya incluye FICHA. Sus pedidos dicen "los marcadores como [IMG:...], [DOC:...] o [FICHA:...] se copian exactos".
2. **Líneas repetidas.** La línea que lleva el marcador no se toca.
3. **`depurarFichas`, antes de la memoria.** Saca las refs que no están en la lista del turno, la segunda vez de la misma, las de más del tope y las que ya salieron en la conversación. Las que quedan se escriben con su ref. Si sacar las repetidas deja el mensaje vacío, se dejan: un mensaje vacío no le llega a nadie.
4. **La memoria guarda el marcador**, no el texto expandido, como con las fotos.
   - El modelo ve en su historia qué ficha mandó.
   - La dedupe del turno siguiente lee los marcadores.
   - El modelo no aprende, por imitar su historia, a pegar descripciones a mano.
   - La corrección de la memoria tras un envío a medias también escribe el marcador.
5. **En las piezas**, el marcador se vuelve un "fijo", como un adjunto: su propio mensaje, sin limpieza ni partidor, y **no cuenta para el tope de burbujas**. Lo que pasa del máximo del canal (4096 caracteres en WhatsApp) va en más de un mensaje, cortado entre párrafos. Nunca se tira texto.
6. **Un marcador que no se puede mandar se borra:** nunca llega "[FICHA:…]" escrito.

La ref se busca de forma tolerante: la ref, el id entero o el nombre exacto del ítem si es único (el modelo a veces escribe `[FICHA:Botox]`). Un pedazo de ref o un nombre aproximado no se adivina.

En la fila del turno quedan `metadata.fichas` (lo que salió) y `metadata.fichas_descartadas` (lo que el modelo pidió y por qué no salió).

```ts
// La ficha que nombra el marcador: ref, id entero o nombre exacto y único.
export function buscarFicha(contenido: string, fichas: ReadonlyMap<string, Ficha>): Ficha | null {
  const limpio = contenido.toLowerCase().replace(/[^0-9a-z]/g, '');
  if (!limpio || fichas.size === 0) return null;
  const directa = fichas.get(limpio);
  if (directa) return directa;
  for (const f of fichas.values()) if (limpio.startsWith(f.ref)) return f;
  const porNombre = [...fichas.values()].filter((f) => nombre(f.titulo) === nombre(contenido));
  return porNombre.length === 1 ? porNombre[0] : null;
}
```

### 5. Pruebas con controles

- El texto real (con los datos de contacto cambiados) sale **byte por byte** igual, en su propia pieza.
- ⟂ Control: el mismo texto escrito por el modelo NO sale igual. Es la razón de existir.
- ⟂ Control: sin la llave, el bloque del catálogo, el prompt y el mensaje son **letra por letra** los de antes.
- Lo demás:
  - la ref de otro negocio no sale ni llega como texto;
  - el tope por mensaje;
  - la misma ficha dos veces sale una;
  - la que ya salió se saca, y el mensaje nunca queda vacío;
  - el corte por largo no pierde texto;
  - las refs que chocan se alargan.
- Ojo con `deepStrictEqual`: no agregues `ficha: undefined` a las piezas normales, porque rompe las pruebas viejas.

### 6. Medir con el modelo real ANTES de prender

La llave va solo en memoria (en el CRM, `medir-estilo <negocio> --config propuesta.json`). Los casos tienen que cubrir:
- un servicio con nombre;
- solo el precio;
- una variante que vive dentro de un texto;
- una pregunta general;
- elegir después de la lista;
- una pregunta puntual después de la ficha.

La medición tiene que:
- **no** aplicar las reglas de estilo a las fichas, porque son texto del negocio: traen viñetas y son largas;
- verificar que cada ficha llegó **igual** al texto del catálogo;
- contar las fichas repetidas en la misma conversación;
- detectar si el modelo **pegó una descripción en su texto** (12 palabras seguidas iguales a una ficha).

Lo que salió, corrida por corrida (US$1,34 las cinco):

| Versión | Qué pasó |
|---|---|
| Nota sola | Botox y acné bien. A "¿cuánto cuesta el masaje descontracturante?" contestó con sus palabras la línea de esa variante: el prompt del autor dice que el precio se da de frente, y la descripción del masaje trae cinco variantes con su precio |
| La nota nombra el precio y las variantes | El masaje, igual |
| + recordatorio al final | El masaje, bien. Pero a "¿qué tratamientos para el acné tienen?" nombró las dos opciones y mandó la ficha de una antes de que la persona eligiera |
| + la excepción de la pregunta general en el recordatorio | Acné: las dos opciones con precio y "¿cuál te gustaría conocer mejor?"; al elegir, la ficha. Masaje y ojeras, bien. En total, 10 de 10 fichas idénticas al catálogo |

### 7. Prender con respaldo, probar con lo guardado y avisarle al autor

- Copia de la config entera, escritura con filtro por `updated_at` (no pisa un cambio del medio) y verificación de que el resto quedó igual.
- Una conversación simulada **sin** `--config`, que confirma que la llave se lee de la base.
- El prompt del autor no se toca (regla de `cargar-prompt-al-motor`): se le avisa la línea que choca, para que la saque en su próxima versión.

## Gotchas

- **El recordatorio al final pisa las excepciones de la nota del medio.** Una regla final sin sus excepciones las anula: hay que repetirlas.
- **Una variante dentro de un texto no se lee como "el servicio".** Si el ítem trae varias opciones con precio, el modelo contesta la línea de la opción. Hay que decir explícitamente que una opción dentro del texto también lleva la ficha.
- **No guardes el texto expandido en la memoria.** El modelo imita su historia: con descripciones pegadas en sus mensajes anteriores empieza a pegarlas él, y ese texto sí pasa por la limpieza. Además, la dedupe pierde la marca.
- **El largo medido no coincide con el de la base.** JavaScript cuenta un emoji como dos: 959 en Postgres, 962 en el script. No hay diferencia de texto.
- **Sale el texto del negocio, errores incluidos.** Lo que el bot nunca usa (dos puntos, punto final, asteriscos que WhatsApp lee como negrita) llega como el negocio lo escribió. Es lo que se pidió, y conviene decírselo.
- **El pase sigue mandando.** Si una regla del negocio dice que cierta pregunta (sesiones, zonas, "qué me recomiendan") va a una persona, pasa aunque haya ficha. No es una falla de la ficha.

## Output esperado

- La llave por negocio, apagada por defecto.
- El marcador en la lista, la nota y el recordatorio, los dos con sus excepciones.
- La expansión en el código: la depuración antes de la memoria, la memoria con el marcador, el texto como pieza fija y el corte por largo.
- Las pruebas con los dos controles, y la medición con el modelo real, con sus números.
- La llave prendida con respaldo y verificada con la config guardada, y el aviso al autor del prompt.

## Ejemplo

**Input:** "La clínica quiere que salga la descripción de los servicios como copy paste de lo que agregaron en el producto. Ahora el bot la resume."

**Output:**
- A "hola, ¿cuánto cuesta el botox?" sale la bienvenida y, en un mensaje aparte, la descripción idéntica a la del catálogo:
  ```
  Botox 💉✨
  La doctora trabaja exclusivamente con BOTOX® de Allergan…

  Incluye:
  ✔️ Aplicación del tratamiento
  ✔️ Cita de seguimiento

  •⁠ ⁠Por zona: $180+iva
  …
  Te comparto más información:
  https://wa.me/p/…
  ```
- A "¿y el precio incluye la cita de seguimiento?" contesta "Sí, la cita de seguimiento ya está incluida", sin repetir la ficha.
- A "¿qué tienen para el acné?" nombra las dos opciones con su precio y pregunta cuál le interesa; cuando elige una, manda su ficha.
- En el CRM: `crm-v2/src/lib/bot/fichas.ts` (la llave, las refs, la nota y el recordatorio) y `marcadores.ts` (`depurarFichas` y la expansión), PR momentum-ai-crm#434.

## Skills relacionadas

- `bot-llm-marker-expand-pattern` — el mismo patrón, para fotos y tarjetas.
- `cargar-prompt-al-motor` — el prompt del autor se carga tal cual, y lo que choca se le reporta.
- `catalogo-multifuncional-por-preset` — de dónde salen los ítems y la lista inline.
- `verificar-funcionamiento-end-to-end` — la medición con el modelo real es la prueba; las pruebas unitarias no alcanzan.
