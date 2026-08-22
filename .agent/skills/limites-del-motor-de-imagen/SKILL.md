# Skill: Los tres límites del motor de imágenes (moderación, referencias, y qué se puede pedir)

## Cuándo usar esta skill

- Un producto que genera imágenes empieza a fallar de formas que **no son bugs de tu código**: bloqueos del moderador, imágenes que ignoran lo que le mandaste, resultados que no mejoran por más que endurezcas el prompt.
- Estás por invertir una sesión en "arreglar" algo que es un **techo del modelo**.
- Un usuario reporta "no salió" y necesitás decirle algo útil en vez de "Este no salió".

## Por qué existe esta skill

Tres límites descubiertos en producción en FreshAdFlow (julio 2026), cada uno costó horas antes de identificarse como límite y no como defecto propio.

---

## Límite 1 — La moderación la dispara la FOTO, no el prompt

**Síntoma:** al generar en formato vertical, muchas imágenes fallaban con `moderation_blocked` y `safety_violations: [sexual]`. El prompt no tenía absolutamente nada sugerente.

**Causa:** el input era un primer plano de una persona con top escotado. El modelo **reproduce fielmente a la persona de la foto** (que es justo lo que le pedís en modo servicio) y el moderador marca la salida. El prompt no puede overridear eso: el disparador entró por la imagen.

**Qué sí ayuda (parcialmente):** una regla de encuadre en el candado del prompt — *"encuadre profesional y respetuoso: enfocá el rostro, la expresión y el contexto; NO primeros planos del cuerpo, del escote ni de zonas sugerentes"*. **Baja la tasa de bloqueo, no la elimina.**

**Qué sí lo resolvería en la fuente:** recortar la foto de entrada al rostro antes de mandarla, en modo persona. Reduce el trigger donde nace.

**Lo que hay que hacer igual — que el error llegue útil al usuario:**

```ts
// guardar el código de error del proveedor por creativo
creatives.error_code = "moderation_blocked";
```

y traducirlo en la UI:

| `error_code` | Lo que ve el usuario |
|---|---|
| `moderation_blocked` | "No pasó el filtro de la IA. Probá una foto con encuadre más cerrado al rostro." |
| (cualquier otro) | "Este no salió · crédito devuelto" |

Un mensaje accionable convierte un bloqueo en un reintento; un mensaje genérico convierte un bloqueo en un abandono.

---

## Límite 2 — Las imágenes de referencia NO transfieren estilo en `edits`

**Lo que se quiso construir:** un campo para subir 1–4 imágenes de referencia que anclaran la estética del anuncio.

**Lo que pasó:** el endpoint `edits` genera desde el texto + **la primera** imagen, e **ignora las secundarias**. Se probó dos veces (instrucción blanda y dura). Endurecer el prompt **no las hizo usar y además bajó la calidad** del resto. Se confirmó en la base que las imágenes sí se estaban enviando: no era un bug de datos, era el techo del endpoint.

**La distinción que hay que retener:**

| Qué es la imagen extra | ¿Funciona? |
|---|---|
| un **objeto a colocar** (un logo) | **Sí.** Se incorpora reconocible si se lo pedís explícito |
| una **estética a imitar** (una referencia de estilo) | **No.** Se ignora |

**La solución real, si un caso lo justifica: vision-to-text.** Describir la referencia con un modelo de visión y **inyectar esa descripción como texto** en el prompt. El modelo obedece el texto; no obedece la imagen secundaria. (No se construyó — se anotó para cuando un caso real lo pida.)

**Decisión que se tomó:** eliminar la feature de v1 por completo (UI, estado, columna de paths, la rama en las recetas) en vez de dejarla a medias engañando al usuario. La columna quedó en la base, inofensiva.

---

## Límite 3 — El modelo tiene un techo, y pelearlo cuesta más de lo que da

Después de arreglar el input ([[causa-raiz-mala-calidad-ia-esta-en-el-input]]) y de poner guards en las recetas, queda un residuo: manos raras, texto ocasionalmente deforme, coherencia de pose imperfecta.

**La política que funcionó — plan de 3 capas:**

1. 🥇 **UI / captura del input.** La palanca real.
2. 🥈 **Guards en el motor.** La red.
3. 🥉 **Techo del modelo.** **Anotar, no pelear.**

Lo de la capa 3 se registra en el backlog con su evidencia y se revisa cuando cambie el modelo — no se ataca con más prompt.

---

## Gotchas transversales

- **Un `400` no siempre es tuyo.** `billing_hard_limit_reached` (el tope de gasto de la cuenta del proveedor) se ve exactamente como un fallo del motor y **tumba producción en silencio**: mientras estuvo topado, ningún usuario podía generar nada. El retry con backoff cubre 429 y 5xx, **no** el 400. Ver [[anti-abuso-costo-ia-saas]] y [[debugging-silent-errors]].
- **Leé los logs de producción antes de hipotetizar.** La firma del fallo parecía rate limit; el log decía otra cosa. La causa correcta cambia el fix.
- **Refundá siempre lo que falló**, sea del proveedor o tuyo — ver [[creditos-por-imagen-reserva-y-refund]].
- **El texto en la imagen sigue siendo frágil.** El copy horneado dentro de una etiqueta o una pantalla sale ilegible casi siempre: prohibilo explícitamente en las reglas del motor en vez de esperar que salga bien.

## Ejemplo (input -> output)

- **Input:** "muchas imágenes fallan y las referencias de estilo no hacen nada".
- **Output:** dos límites documentados (moderación disparada por la foto; refs ignoradas por el endpoint), la feature de referencias eliminada de v1 con su alternativa anotada (vision-to-text), y `error_code` por creativo para que el usuario reciba un mensaje accionable.

## Relacionadas

[[motor-de-recetas-de-prompts-para-imagen]] · [[causa-raiz-mala-calidad-ia-esta-en-el-input]] · [[anti-abuso-costo-ia-saas]] · [[debugging-silent-errors]] · [[creditos-por-imagen-reserva-y-refund]]
