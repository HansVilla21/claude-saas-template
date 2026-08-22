# Skill: Completitud de contenido en el panel (que el cliente llene lo que falta)

El importador te dejó las fichas a medias y el resto lo tiene que llenar el
cliente. Esta skill es cómo convertir "230 productos sin descripción" en una
tarea que una persona no técnica **sí termina**: ver qué falta, llenarlo sin
salir de la lista, y aplicar en lote lo que es igual para todos.

## Cuándo usar esta skill

- Hay un CMS/panel donde el cliente carga contenido y **está vacío a medias**.
- El cliente pidió "meterle más carnita" a las fichas y vos ya sabés que a mano,
  producto por producto, no va a pasar nunca.
- Corriste `catalogo-desde-pdf-del-cliente` y quedaron campos que el importador
  no pudo sacar.
- Vas a proponer "que la IA llene el catálogo" — leé la regla de oro antes.

## Por qué existe esta skill

Después de importar: 230 productos, pero `descripción 18/230`, `maderas 2/230`,
`tiempo de fabricación 0/230`. La única forma de llenarlo era abrir el editor
completo de cada producto, uno por uno, y **no había forma de ver de un vistazo
cuáles estaban incompletos**. Con ese flujo, el catálogo se quedaba vacío para
siempre — y todas las features que dependen de esos campos (ficha técnica, el
chatbot, el SEO) quedaban muertas.

## Regla de oro: la IA redacta prosa, el humano pone hechos

De los campos que faltaban, **solo uno era prosa**:

| Campo | Quién lo llena | Por qué |
|---|---|---|
| Descripción | IA genera borrador → humano aprueba | Es redacción. Un borrador editable ahorra el 80% del trabajo |
| Maderas / materiales | **Humano**, eligiendo del catálogo existente | Es un hecho. Si la IA lo inventa, publicás datos falsos |
| Tiempo de entrega | **Humano**, con aplicación en lote | Es un hecho. Y suele ser el mismo valor para casi todo |

Esto no es purismo: la mueblería fabrica en maderas concretas y entrega en plazos
concretos. Un LLM que "deduce" que una cama es de cedro está publicando una
mentira comercial en el sitio del cliente, firmada por el cliente.

## Proceso

1. **Derivá la completitud como función pura, en la capa de datos.** No la
   calcules en el componente: la necesitás para el badge, para el filtro, para el
   contador y para "siguiente incompleto".

   ```ts
   export function derivarCompletitud(input: {
     descripcion: string | null;
     tiempo_fabricacion: string | null;
     materialesCount: number;
   }) {
     const tieneDescripcion = (input.descripcion ?? "").trim().length > 0;
     const tieneMaderas     = input.materialesCount > 0;
     const tieneTiempo      = (input.tiempo_fabricacion ?? "").trim().length > 0;
     const faltantes = (tieneDescripcion?0:1) + (tieneMaderas?0:1) + (tieneTiempo?0:1);
     return { tieneDescripcion, tieneMaderas, tieneTiempo, completo: faltantes === 0, faltantes };
   }
   ```
   Fijate que **no hace falta migración**: los campos ya existen, lo que faltaba
   era mirarlos.

2. **Badge por fila: `3/3` verde, o ámbar con lo que falta.** El texto del
   incompleto tiene que decir **qué** falta ("Falta descripción · maderas"), no
   solo que falta algo. Es la diferencia entre un badge decorativo y uno accionable.

3. **Filtro "Contenido": Todos / Incompletos / Completos.** Es lo que convierte
   la lista de 230 en una cola de trabajo.

4. **Contador arriba: "142 de 230 con contenido completo".** Es la barra de
   progreso de la tarea. Para alguien que va a llenar fichas dos horas, ver el
   número subir es la mitad de la motivación — y para vos es la métrica que le
   mostrás al cliente en la próxima reunión.

5. **Drawer lateral, sin salir de la lista.** Los 3 campos y nada más. Chips para
   las maderas (selección, no texto libre), chips de sugerencia para el tiempo
   (`"20–22 días"`, `"30 días"`, `"A convenir"`). El editor completo del producto
   sigue existiendo para todo lo demás; esto es una vía rápida, no un reemplazo.

6. **"Guardar y siguiente incompleto".** El botón que hace que la tarea se
   termine. Guarda, salta al próximo del filtro actual y **no cierra el drawer**.
   Sin esto, cada producto cuesta 4 clics de navegación y la persona abandona.

7. **Lo que es igual para todos, en lote — y solo sobre los vacíos.**
   `bulkSetTiempo(valor, soloVacios = true)`, con confirmación que diga el número
   real ("Se aplicará a 228 productos sin tiempo"). 228 productos resueltos en un
   clic. **Nunca pisa valores existentes.**

8. **Server actions parciales, no `save` completo.** `quickUpdateProducto(id, {
   descripcion, tiempo_fabricacion })` toca esos dos campos y nada más — no
   nombre, no precio, no visibilidad. Un guardado parcial que arrastra el resto
   del formulario es cómo se despublica un producto sin querer.

9. **La IA entra después, y como borrador.** Botón "Generar borrador" que llena
   el textarea; **no guarda solo**. El humano lee, corrige y confirma. En lote:
   cola de aprobar/editar/saltar, nunca escritura directa.

## Gotchas

- **Contá con agregación, no traigas el join.** `producto_materiales(count)` en
  el select. Traer todas las filas del join para 230 productos solo para saber si
  hay al menos una es cómo se muere el listado.
- **El drawer carga el detalle al abrirse.** No infles el payload del listado con
  las descripciones completas de 230 productos para mostrar un badge de 3 campos.
- **El `null` disfrazado cuenta como lleno.** Cadena vacía, espacios, `"-"`,
  `"N/A"`. Por eso el `.trim().length > 0` y no `!= null`.
- **Diseñá para el operador no técnico.** Chips en vez de texto libre elimina los
  typos y los valores inventados; sugerencias en vez de campo vacío elimina la
  parálisis. Son las dos decisiones que más suben la tasa de terminación.
- **Dos operadores distintos, mismo panel.** Vos hacés la pasada gruesa apoyado
  en IA; el cliente ajusta los hechos que solo él sabe. El flujo tiene que ser a
  prueba de errores para el segundo, sin volverse lento para el primero.
- **El badge tiene que actualizarse en vivo al guardar.** Si hay que refrescar la
  página para ver que el producto quedó completo, la persona no confía en que
  guardó y vuelve a guardar.
- **No metas descripción ni materiales en el lote.** Son distintos por producto:
  aplicarlos en masa es publicar lo mismo 230 veces. Solo el tiempo va en lote,
  porque genuinamente suele ser el mismo.

## Output esperado

- `derivarCompletitud()` pura en la capa de datos + campos derivados en el tipo
  del listado, sin migración.
- Badge por fila, filtro de contenido, contador de progreso.
- Drawer de edición rápida con chips + "Guardar y siguiente incompleto".
- `quickUpdateProducto` (parcial) y `bulkSetTiempo(valor, soloVacios)` con
  confirmación numerada.
- Métrica antes/después para la reunión con el cliente.

## Ejemplo

**Input:**
"El catálogo tiene 230 productos pero descripción 18, maderas 2 y tiempo 0. El
cliente pidió 'meterle carnita'. ¿Se lo llenamos con IA?"

**Output:**
Con IA solo la descripción, y como borrador que el humano aprueba. Maderas y
tiempo son hechos: chips de selección y aplicación en lote. En el panel: badge
`3/3`, filtro "Incompletos", contador de progreso y drawer con "Guardar y
siguiente". El tiempo de fabricación —el mismo para 228 productos— se resolvió
en un clic con `bulkSetTiempo(soloVacios: true)`.

## Skills relacionadas

`auditar-datos-antes-de-programar-features` (el censo que descubre este problema) ·
`catalogo-desde-pdf-del-cliente` (lo que el importador no pudo, cae acá) ·
`acciones-en-lote-seguras` (confirmación numerada antes de tocar N filas) ·
`jsonb-config-save-no-pisar-campos-ajenos` (misma familia: guardado parcial que no arrastra) ·
`onboarding-cliente-crm` · `prototipo-ui-a-datos-reales`.
