# Skill: La lectura que responde éxito con menos filas de las que existen (`max_rows`)

## Cuándo usar esta skill

- Un dato **"se guardó pero al recargar no está"**, y la base dice que sí está.
- Un número de pantalla es **redondo y sospechoso**: *"1000 contactos"*, *"1000 conversaciones"*, *"1000 filas"*.
- Un negocio (tenant) grande muestra **menos** que lo que la base cuenta, y los chicos andan perfecto.
- Vas a escribir una pantalla que **trae una tabla entera de un tenant al navegador** con supabase-js / PostgREST para filtrarla o contarla en el cliente.
- Aparecen en los logs errores de **clave duplicada** que nadie puede explicar.
- *"Lo cambio y en la otra pantalla no aparece"*, o *"a veces sí y a veces no"*.
- Un embudo o un dashboard muestra **0** (o muy poco) donde debería haber miles, o una lista de "lo de hoy" se quedó **congelada en una fecha vieja**.
- Vas a pasarle a `.in()` una lista de ids que puede crecer, o una lista que **debería tener filas sale vacía** sin error.
- Arreglaste el tope y el número "real" dispara algo hacia afuera (un envío masivo, un cobro): ver la sección 8 del segundo caso.

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

## Segundo caso (2026-10-06): un CRM con 8.022 leads, siete pantallas a la vez

El ticket decía *"lo que cambio en un lead no aparece en el pipeline"*, y la primera hipótesis fue "falta un `revalidatePath`". No: todas las acciones ya revalidaban. Era el mismo tope, pero esta vez **sin tenant chico que lo escondiera**: un solo negocio, con 8.022 leads, y el tope mentía en siete pantallas a la vez sin un solo error:

| Pantalla | Mostraba | La base |
|---|---|---|
| Pipeline (kanban) | 1.000 leads **al azar** (ordenaba por `value_k`, y valía 0 en todos) | 8.022 |
| Dashboard: etapa "nuevo" / cerrados / fuente "Base de Datos" | 493 / 0 / 12 | 6.746 / 2 / 2.525 |
| Configuración: leads por etapa | ≈ ⅛ de cada etapa | real |
| "Hoy": eventos de LinkedIn | lo último era de **un mes atrás** (orden asc por fecha) | al día |
| Embudo de LinkedIn: cargados / aceptadas | 0 / 63 | 3.948 / 471 |
| Boletín: "Todos con correo" | **999** | 5.204 |

Los nueve puntos que este caso le agrega a la regla:

### 1. `.in()` también tiene tope: el de la URL
PostgREST va por GET y la lista de `.in()` viaja en la query string. Medido contra la API de Supabase:

| ids (uuid) | URL | resultado |
|---|---|---|
| 200 | ~7 KB | ✅ |
| 493 | ~18 KB | ❌ `TypeError: fetch failed` |
| 800 | ~29 KB | ❌ 400 Bad Request |
| 2.000 | ~72 KB | ❌ 414 URI Too Long |

Con `const { data } = await …` sin mirar `error`, **la lista sale vacía** y la pantalla dice "no hay nada". Esta trampa suele aparecer **al arreglar la primera**: traés todos los eventos, juntás sus ids y el `.in()` revienta. ("Hoy" iba a pedir 493 justo después del arreglo.) En tandas:

```ts
export const IN_CHUNK = 150;
export function chunks<T>(arr: T[], size = IN_CHUNK): T[][] {
  const out: T[][] = []; for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size)); return out;
}
export async function fetchIn<T>(ids: string[], query: (chunk: string[]) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>) {
  if (ids.length === 0) return [] as T[];
  const rows: T[] = [];
  for (const res of await Promise.all(chunks(ids).map(query))) {
    if (res.error) throw new Error(res.error.message);
    rows.push(...((res.data ?? []) as T[]));
  }
  return rows;
}
// fetchIn<Lead>(ids, (chunk) => sb.from("leads").select("id,name").in("id", chunk));
```
Para un **conteo** con `.in()`, se cuenta por tanda (`count: "exact", head: true`) y se suman los `count`.

### 2. Decidí con `count`, no con "la página vino corta"
`leerTodo` corta cuando una página trae menos de `TAMANO_PAGINA`, y por eso exige que esa constante sea el `max_rows` real (ver Gotchas). Si alguien lo baja en el panel a 500, la primera página trae 500, el helper cree que terminó y **vuelve el bug exacto, callado**. Variante robusta: pedí `count: "exact"` **solo en la primera página** y usá el largo REAL de esa página como paso. Las demás páginas pueden ir en paralelo (dedupe por `id`, igual que `leerTodo`):

```ts
const first = await page(0, 999, /* withCount */ true);
const step = first.data.length;                      // 1000, o 500 si bajaron max_rows
for (let from = step; from < first.count; from += step) pending.push(page(from, from + step - 1, false));
```
Con joins, pedir `count` en cada página son N `count(*)` tirados.

### 3. El orden decide QUÉ se pierde
- **Columna con empates** (todos `value_k = 0`): el subconjunto es al azar y cambia entre cargas. De ahí sale el "a veces sí y a veces no".
- **Asc por fecha:** se queda con los 1.000 más viejos y pierde lo reciente ("Hoy" ciego un mes).
- **Desc:** pierde lo viejo; los totales y embudos cuentan solo lo último.

Y el `id` de desempate no es opcional: sin él, las páginas se pisan.

### 4. Para contar, `count` y no filas
`select("id", { count: "exact", head: true })`, una consulta por categoría y en paralelo. No viaja ninguna fila. "Leads por etapa" bajaba los `stage_id` de todos los leads para contarlos en memoria. (El chequeo del servidor antes de borrar una etapa ya usaba `count` y estaba bien; lo que mentía era el número de la pantalla.)

### 5. Paginar multiplica las filas: mirá qué columnas viajan
- Un `jsonb` entero para usar dos campos → `job_title:qualification->>job_title,company:qualification->>company`. Resultado: **2,7 → 1,8 MB** en 8.023 filas, con 0 diferencias.
- Si solo un tipo de fila necesita el `payload`, partí la consulta ("todos sin payload" + "esos con payload"). Resultado: **5,6 MB / 3 s → 0,7 MB / 0,7 s**. Antes de cambiarla, comprobá que el resultado sea idéntico (0 diferencias en 493 leads).

### 6. Barré TODAS las lecturas, no solo la del síntoma
El primer caso dejó "el resto de las lecturas" sin medir. Acá se barrieron, y aparecieron seis pantallas más:

```bash
grep -rn 'from("' lib app --include=*.ts --include=*.tsx | grep -v '\.eq("id"\|update\|insert\|delete\|maybeSingle\|single()'
```
Para cada una, **medí contra la base cuántas filas devuelve hoy** y clasificala: un registro (no aplica), un número (`count head`), filas (paginar) o una lista de ids (`fetchIn`). Las que hoy no llegan al tope pero pueden crecer, blindalas igual: es una línea.

### 7. Verificá contra SQL directo, con la MISMA regla
Armá una tabla "antes · ahora · base" por cada número de la pantalla. La columna "base" se saca **con SQL directo por `pg`**, sin pasar por PostgREST. Ojo: una regex de validación de correo en SQL (Postgres) **no se comporta igual** que la de JavaScript, y dio diferencias falsas. Bajá las filas crudas y aplicales la misma función del código.

### 8. La service role no pasa por la RLS
Un envío (o un cron) que lee con service role ve **también lo que la RLS esconde**: la papelera, carteras ajenas. En este caso, **la papelera recibía los boletines**. Esos filtros, a mano (`.is("deleted_at", null)`).

### 9. Si el arreglo cambia algo HACIA AFUERA, no lo arregles en silencio
Pasar de "999" a 5.204 destinatarios **multiplica por cinco un envío masivo** desde un dominio casi sin historial. Si los rebotes pasan del 4 %, el proveedor puede pausar la cuenta. Eso no es un fix, es una decisión. Lo que se hizo: el número honesto, **una sola lista** para contar y para mandar, y un **tope explícito y configurable** (variable de entorno) que rechaza con el motivo en vez de mandarle a una parte. El resto lo decide el dueño. Mismo criterio para todo lo que dispare correos, mensajes, cobros o webhooks.

**Estilo del error:** `leerTodo` devuelve lo leído + el error ("mejor una lista parcial a la vista"); `fetchAll` tira y la pantalla muestra el error. Los dos son válidos; lo que no vale es el `error` ignorado.

## Lo que esta skill NO cubre

- **Cuándo dejar de traer todo al navegador.** Filtrar y contar en el cliente asume la lista completa; pasadas unos miles de filas hay que filtrar y contar en el servidor (`count` por consulta, medido). Paginar te compra tiempo, no escala infinito.
- **El resto de las lecturas del primer proyecto:** ahí el barrido se hizo solo sobre las tres pantallas que mostraron el síntoma. El método para barrer todas está en la sección 6 del segundo caso.
- **La rama del duplicado de punta a punta:** el tiempo real refrescó el chip antes de poder reintentar, así que solo se probó leyendo el código y el `sql_state` de los logs.

## Ejemplo

**Input:** *"Trato de agregar una etiqueta desde el sistema y no se guarda."*

**Output:** la etiqueta sí estaba en la base. Un negocio con 1.140 asignaciones perdía las más nuevas por el tope de 1.000 filas. `leerTodo` en las lecturas de contactos, conversaciones y etiquetas de tres pantallas, más el `23505` tratado como éxito. Medido: de 2 a 10 de 10 etiquetas visibles, 1.000 → 1.111 contactos, 1.000 → 1.061 conversaciones.

**Input:** *"Lo que cambio en un lead no aparece en el pipeline."*

**Output:** no era la revalidación. Medir `content-range` dio `0-999/8022`: el tablero ordenaba por una columna en la que valían 0 todos, así que mostraba 1.000 al azar (un lead de prueba aparecía solo al ponerle valor > 0). Se paginó con desempate por `id`, y el barrido encontró seis pantallas más. Una de ellas, al arreglarla, le pedía 493 ids a `.in()`, que falla, así que se pasó a tandas. Tabla "antes · ahora · base" contra SQL directo: 20 de 20 iguales. El boletín pasó de "999" a 5.204, con un tope explícito de 1.000 por envío hasta que el dueño decida.
