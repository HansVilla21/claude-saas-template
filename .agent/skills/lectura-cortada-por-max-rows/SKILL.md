# Skill: La lectura que responde éxito con menos filas de las que existen (`max_rows`)

## Cuándo usar esta skill

- Un dato **"se guardó pero al recargar no está"**, y la base dice que sí está.
- Un número de pantalla es **redondo y sospechoso**: *"1000 contactos"*, *"1000 conversaciones"*, *"1000 filas"*.
- Un negocio (tenant) grande muestra **menos** que lo que la base cuenta, y los chicos andan perfecto.
- Vas a escribir una pantalla que **trae una tabla entera de un tenant al navegador** con supabase-js / PostgREST para filtrarla o contarla en el cliente.
- Aparecen en los logs errores de **clave duplicada** que nadie puede explicar.

## Por qué existe esta skill

Capturada el **2026-09-21**. Un usuario reportó *"trato de agregar una etiqueta y no se guarda"*. Sí se guardaba. La pantalla nunca recibía las etiquetas nuevas, porque **PostgREST devuelve como máximo 1.000 filas por consulta (`max_rows`) y corta sin error y sin avisar**: `data` trae 1.000 filas, `error` es `null`, no hay ninguna línea roja en ningún log.

Un solo negocio (el único sobre 1.000) tenía 1.140 etiquetas puestas, 1.111 contactos y 1.061 conversaciones activas. El mismo tope se comía, al mismo tiempo:

- las **etiquetas más nuevas** (se guardaban; al recargar "desaparecían"; al reintentar la base rechazaba el duplicado y la interfaz decía "no se pudo guardar"),
- **111 contactos** en la lista y en el dashboard,
- **61 conversaciones** en la bandeja.

Es el mismo modo de fallo que `detectar-escritura-filtrada-rls`, del lado de la lectura: **responde éxito con menos de lo que hay**. Y como el corte cae sobre las filas de más atrás en el orden físico, casi siempre son **las más nuevas** las que faltan: justo las que el usuario acaba de crear.

## Cómo se diagnostica (el orden importa)

1. **Los logs de la base ya lo dicen.** Buscá `duplicate key value violates unique constraint` sobre la tabla del dato: cada uno es un reintento del usuario sobre algo que **ya existía** y la pantalla no mostraba.
2. **Contá los tenants.** Una consulta por tabla y por negocio; el que pasa de 1.000 es el único que se rompe:
   ```sql
   select a.slug, count(*) from tabla t join agencies a on a.id = t.agency_id group by 1 order by 2 desc;
   ```
3. **Probalo en la pantalla real, con un control que discrimine.** Tomá 8–10 filas recientes cuyo dato exista en la base **y que no compitan por espacio** (contactos con UNA sola etiqueta, para descartar que una columna recorte chips) y preguntale al DOM si el dato aparece. Sumá **dos filas viejas de control positivo**: si esas tampoco aparecen, tu método no discrimina, no el sistema. Acá dieron: recientes 0 de 8, viejas 2 de 2.
4. **El primer método casi seguro falla.** El buscador de "la fila" tomó un contenedor demasiado chico y dio falso negativo también en las viejas. Por eso el control positivo va **antes** de la conclusión, no después.

## La regla

> Toda lectura que pretenda traer **todas** las filas de un tenant tiene que **paginar** con `.range()` hasta recibir una página corta. `.limit(5000)` **no** lo arregla: PostgREST aplica `max_rows` igual. Subir `max_rows` en el panel tampoco: mueve el techo, no lo quita, y esconde el problema hasta el próximo cliente grande.

```ts
export const TAMANO_PAGINA = 1000; // = max_rows de PostgREST
const MAX_PAGINAS = 50;            // freno: 50.000 filas

export async function leerTodo<T>(
  leerPagina: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  clave?: (fila: T) => string,
) {
  const filas: T[] = [];
  const vistas = clave ? new Set<string>() : null;
  for (let p = 0; p < MAX_PAGINAS; p++) {
    const desde = p * TAMANO_PAGINA;
    const { data, error } = await leerPagina(desde, desde + TAMANO_PAGINA - 1);
    if (error) return { data: filas, error, truncado: true };
    const lote = data ?? [];
    for (const f of lote) {
      if (clave && vistas) { const k = clave(f); if (vistas.has(k)) continue; vistas.add(k); }
      filas.push(f);
    }
    if (lote.length < TAMANO_PAGINA) return { data: filas, error: null, truncado: false };
  }
  return { data: filas, error: null, truncado: true };
}
```

Uso:

```ts
const { data } = await leerTodo(
  (desde, hasta) =>
    supabase.from('tag_assignments').select('id, entity_id, tags(name)')
      .eq('agency_id', agencyId).order('id').range(desde, hasta),
  (fila) => fila.id,
);
```

Devuelve `{ data, error }` como supabase-js: los llamadores que ya hacían `const { data } = await …` **no cambian**.

## Gotchas

- **El orden tiene que ser TOTAL.** `order('last_message_at')` con empates hace que dos páginas repitan o se salteen filas. Siempre `.order(...).order('id')` de desempate. Y sumá `id` al `select` para poder deduplicar.
- **`TAMANO_PAGINA` tiene que ser el `max_rows` real.** Se corta cuando una página trae *menos* que eso; con un tope más bajo cortaría en la primera. Si alguien lo cambia en el panel, se cambia acá (y va escrito en el comentario del helper).
- **Un negocio chico no paga nada:** la primera página ya viene corta, un solo viaje. El grande paga un viaje por cada 1.000 filas. Con **exactamente** 1.000 filas hace una consulta de más (no puede saber que no hay otra); es aceptable y está probado.
- **Una fila nueva entre dos páginas corre el corte** y puede repetir la última de la anterior: por eso la deduplicación por `clave`.
- **Un error a mitad de camino devuelve lo leído + el error**, no todo-o-nada: mejor una lista parcial a la vista que una pantalla vacía.
- **Sumá un freno** (50 páginas): una "lista" que llega a 50.000 filas no es una lista, es una tabla que necesita otra estrategia, y seguir paginando solo lo esconde.
- **La consulta con `select` embebido** (`tags(name)`) también está sujeta al tope de la fila de arriba.
- **Cuando `ya estaba puesto` es un éxito:** en el editor, un `23505` (clave duplicada) al asignar significa que la base **ya tiene** lo que el usuario pidió. Revertir el chip con "no se pudo guardar" fue lo que convenció a todos de que "no se guardaba". Tratalo como éxito y dejá el chip.
- **Un tenant chico no lo va a reproducir jamás.** El seed local y una cuenta demo (10 contactos) andan perfecto: **hay que probar contra el tenant más grande**, en lectura.

## Verificación

Antes → después, medido con sesión real y contra la base:

| | antes | después | la base |
|---|---|---|---|
| Contactos (lista) | 1.000 | **1.111** | 1.111 |
| Conversaciones en la bandeja | 1.000 *(por el tope; no se midió antes)* | **1.061** | 1.061 |
| Etiquetas recientes visibles (8 recientes + 2 viejas de control) | 2 de 10 | **10 de 10** | 10 |
| Dashboard "Todo" | 1.000 *(por el tope; no se midió antes)* | **1.111** | 1.111 |

Y una **prueba con control negativo** del helper: una tabla de 1.140 filas llega entera; **una sola consulta sobre la misma tabla se queda en 1.000** (eso es el bug, escrito como prueba); justo 1.000; 2.000 y 2.500; error a mitad; repetidas; freno.

## Lo que esta skill NO cubre

- **Cuándo dejar de traer todo al navegador.** Filtrar y contar en el cliente asume la lista completa; pasadas unos miles de filas hay que filtrar y contar en el servidor (`count` por consulta, medido). Paginar te compra tiempo, no escala infinito.
- **El resto de las lecturas del proyecto:** el barrido se hizo sobre las tres pantallas que mostraron el síntoma; quedan otras (una pantalla de agenda diaria, un conteo de uso en configuración, acciones en lote) sin medir cuáles pasan hoy de 1.000.
- **La rama del duplicado de punta a punta:** el tiempo real refrescó el chip antes de poder reintentar, así que solo se probó leyendo el código y el `sql_state` de los logs.

## Ejemplo

**Input:** *"Trato de agregar una etiqueta desde el sistema y no se guarda."*

**Output:** la etiqueta sí estaba en la base. Un negocio con 1.140 asignaciones perdía las más nuevas por el tope de 1.000 filas. `leerTodo` en las lecturas de contactos, conversaciones y etiquetas de tres pantallas, más el `23505` tratado como éxito. Medido: de 2 a 10 de 10 etiquetas visibles, 1.000 → 1.111 contactos, 1.000 → 1.061 conversaciones.
