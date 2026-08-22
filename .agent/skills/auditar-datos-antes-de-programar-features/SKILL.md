# Skill: Auditar los datos antes de programar el feedback del cliente

Antes de convertir una lista de quejas en un plan de features, **contá las filas
de la base de producción**. Muy seguido varias quejas que suenan distintas son
el mismo agujero de datos, y programarlas no cambia nada de lo que el cliente ve.

## Cuándo usar esta skill

- Saliste de una llamada de feedback con una lista de pedidos y vas a armar el plan.
- El cliente dice cosas como *"esto se ve vacío"*, *"falta información"*,
  *"no se parece a mi catálogo/folleto"*, *"salen preguntas tontas"*.
- Una funcionalidad "ya está programada" pero el cliente jura que no existe.
- Vas a estimar un sprint sobre un producto que carga contenido del cliente
  (catálogo, propiedades, servicios, fichas, inventario).

## Por qué existe esta skill

Caso real (mueblería, llamada del 13/07/2026, 57 min con 3 personas del cliente).
Salieron ~25 pedidos. Antes de planificar se corrió una auditoría de la base de
producción:

| Métrica | Estado |
|---|---|
| Productos | 83 |
| Con foto | 83 ✔ |
| **Con precio** | **2 de 83** |
| **Con descripción** | **0 de 83** |
| **Con materiales asignados** | **2 de 83** |
| Variantes con precio | **0 filas** |

Con esa tabla, **tres quejas que en la llamada parecían problemas distintos
resultaron ser una sola**:

- *"Sale 'Consultar' por todos lados"* → `formatPrecioDesde()` devuelve
  `"Consultar"` cuando el precio es `null`. Pasaba en **81 de 83**. No era
  tipografía ni copy: era que no había precios.
- *"Falta la ficha técnica, el bot hace preguntas tontas"* → 0 descripciones y
  0 materiales. No había nada que mostrar ni que responder.
- *"Que el catálogo en línea sea igual al PDF"* → los datos del PDF nunca se
  habían trasladado a la base.

**La consecuencia que reordenó el plan entero:** buena parte de lo pedido
(ficha técnica, precio por variante, quitar el "Consultar") **no se ve aunque se
programe**. El importador masivo de datos pasó a ser la Fase 1, antes que
cualquier feature de UI. Sin esa auditoría, se habrían gastado dos semanas
programando pantallas que iban a seguir viéndose vacías, y la demo siguiente
habría fracasado igual.

## Proceso

1. **Antes de escribir una línea del plan, corré el censo.** Un script contra la
   base de **producción** (no local, no seed), con service role, que cuente por
   cada campo que el cliente menciona: cuántas filas lo tienen lleno y cuántas
   no. No mires el schema — el schema dice que la columna existe; lo que importa
   es cuántas filas la tienen con algo adentro.

   ```sql
   select
     count(*)                                             as total,
     count(*) filter (where precio_desde is not null)     as con_precio,
     count(*) filter (where coalesce(descripcion,'') <> '') as con_descripcion,
     count(*) filter (where coalesce(tiempo_fabricacion,'') <> '') as con_tiempo
   from productos where visible;

   select count(*) from producto_opciones;  -- ¿la tabla de variantes tiene ALGO?
   ```
   Una tabla con **0 filas** es el hallazgo más común y el más fácil de pasar por
   alto: la feature está construida, el schema está bien, y nadie la usó nunca.

2. **Poné la tabla de conteos arriba del plan, antes que las fases.** No como
   anexo. Es la evidencia que justifica el orden de todo lo que sigue, y es lo
   que le enseña al cliente por qué la primera entrega no es la que él pidió.

3. **Mapeá cada queja a su causa raíz medida.** Una columna "lo que dijo" y otra
   "por qué pasa, con el número". Citá el minuto de la llamada y el
   archivo:línea del código. Ahí es donde tres pedidos colapsan en uno.

4. **Separá el plan en dos pilas distintas** — no las mezcles en el mismo sprint:
   - **Falta código** → se programa.
   - **Faltan datos** → se importa o se llena. Es trabajo, pero no es el mismo
     trabajo, no lo hace la misma persona y no se estima igual.

5. **Si faltan datos, la primera entrega es el desbloqueo, no la feature.** Un
   importador, o una pantalla que le permita al cliente llenar rápido lo que
   falta. Todo lo demás se programa **después**, cuando ya haya algo que mostrar.

6. **Preguntá quién va a llenar eso, y cuánto tarda.** Es la pregunta que decide
   si el importador es opcional o es la única salida. En el caso real, el cliente
   lo dijo solo: *"sería demasiado insumo, habría que trabajar con él todo el
   día"* — 83 productos × 3 campos a mano no iba a pasar nunca.

7. **Re-corré el censo después de cada entrega** y mostrá el antes/después. Es la
   métrica que el cliente entiende sin explicación: `83 → 230 productos`,
   `2 → 213 con precio`, `0 → 504 variantes`.

## Gotchas

- **Auditar local o el seed no sirve.** El seed siempre está lleno: lo llenaste
  vos para desarrollar. La verdad está en producción y suele ser mucho peor.
- **"La feature existe" ≠ "la feature se ve".** El editor de variantes estaba
  programado y funcionando; `producto_opciones` tenía 0 filas. Para el cliente
  eso es idéntico a que no exista, y tiene razón.
- **Contar filas de la tabla no alcanza: contá filas con el campo lleno.** 83
  productos con `descripcion` en `null` cuentan como 83 productos en cualquier
  `count(*)`. El `filter (where ...)` es todo el punto.
- **Cuidado con el `null` disfrazado.** Cadena vacía, `'-'`, `'N/A'` y espacios
  pasan el `is not null` y no son datos. Usá `coalesce(campo,'') <> ''` y mirá
  una muestra real de valores antes de confiar en el conteo.
- **No confundas el fallback con el bug.** `"Consultar"` era el comportamiento
  correcto del código ante un `null`. Cambiar ese texto —que es lo que el cliente
  literalmente pidió— habría dejado el problema intacto y disfrazado.
- **El cliente ya suele saberlo, dicho de otra forma.** Cuando pide "pre-carga
  automática" o "que salga la info de la cama directamente ahí", te está
  diciendo que el problema son los datos. Escuchá eso como requisito técnico,
  no como comentario.
- **No inventes datos para tapar el hueco.** Si no hay precio, no hay precio. Un
  precio inventado en un catálogo público es un problema comercial del cliente,
  no un detalle de demo.

## Output esperado

- **Tabla de censo** de la base de producción, fechada, arriba del plan.
- **Mapa queja → causa raíz medida**, con cita de la llamada y `archivo:línea`.
- **Plan en dos pilas** (falta código / faltan datos) y una Fase 1 que desbloquea
  los datos antes que la UI.
- **Censo repetido** después de cada entrega, como antes/después para el cliente.

## Ejemplo

**Input:**
"Salí de la llamada con 25 pedidos: quitar el 'Consultar', poner ficha técnica,
precio por tamaño, que se parezca al PDF. ¿Cómo lo ordeno en sprints?"

**Output:**
Censo primero: 81/83 sin precio, 0/83 con descripción, 0 variantes. Los tres
primeros pedidos son la misma causa: la base está vacía. El plan sale con la
tabla arriba, y la Fase 1 no es ninguna de las 25 cosas pedidas — es un
importador que lee los catálogos PDF del cliente y produce un borrador revisable.
Las features de UI van en la Fase 2, cuando ya haya qué mostrar. Resultado
verificado: de 83 productos con 2 precios se pasó a 230 productos con 213 precios
y 504 variantes, y recién ahí las pantallas pedidas se vieron como el cliente
las imaginaba.

## Skills relacionadas

`catalogo-desde-pdf-del-cliente` (el importador que suele ser la Fase 1) ·
`completitud-de-contenido-en-el-panel` (cuando el que llena es el cliente) ·
`verificar-funcionamiento-end-to-end` (medir contra la fuente de verdad, no contra el build) ·
`reporte-de-estado-para-cliente-no-tecnico` (donde se muestra el antes/después) ·
`porcentaje-necesita-minimo-muestra` (no sacar conclusiones de conteos chicos).
