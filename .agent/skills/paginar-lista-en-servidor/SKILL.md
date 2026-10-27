# Skill: Paginar una lista grande en el servidor sin cambiarle nada al usuario

## Cuándo usar esta skill

- Una pantalla trae **toda** una tabla al navegador y ahí filtra, ordena, cuenta y pagina. Es típico después de arreglar el tope de 1000 con `fetchAll` (ver `lectura-cortada-por-max-rows`): la lista "anda", pero pesa megas.
- Aparece alguno de estos síntomas:
  - "Las listas tardan o no cargan".
  - "Tengo que salir y volver a entrar".
  - "Se traba al abrir el pipeline".
  - Lo que viaja crece con cada importación.
- La base va a crecer: un cliente que importa bases de 10.000 a 50.000 filas.

**Costo de no usarla.** En un CRM real con 8.122 leads (JRM-79, 2026-10):

| Qué | Antes | Después |
|---|---|---|
| Lo que viajaba al navegador en cada visita | **4,2 MB** (todos los leads) | 50 filas |
| Lectura de la base | 1,2–1,7 s (dos lecturas completas en fila) | 120–220 ms por consulta |
| Kanban de la lista | pintaba **111.074 elementos**, 3,3 s congelado | 25 por columna: 0,18 s, 2.486 elementos |

El kanban era el peor: la vista elegida quedaba guardada, así que cada vuelta a la pantalla lo volvía a pintar. Eso era el "no carga ninguna vista" del cliente.

---

## Primero, lo barato: puede que alcance por hoy

Antes de rediseñar, medí y sacá lo obvio. Esto solo ya destraba:

1. **Medí las tres cosas por separado:**
   - Lo que pesa: `Buffer.byteLength(JSON.stringify(filas))`.
   - Lo que tarda leer: un script con la misma consulta contra la base.
   - Lo que cuesta pintar: en el navegador, `performance.now()` antes y después de mostrar la vista, con la misma cantidad de filas de prueba.
2. **Ponele tope a todo lo que pinta "todo":** kanban, listas sin paginar. Por ejemplo, 25 por columna con "Ver más"; el número de la columna sigue contando todas.
3. **Una lectura, no dos en fila.** Lo que no depende entre sí va en `Promise.all`.

La paginación de abajo es para que no vuelva a pasar cuando la base crezca.

---

## Proceso

### 1. Inventario de todo lo que la tabla hace en memoria
Escribí la lista exacta antes de tocar nada. Cada punto necesita su equivalente en el servidor, y si uno se pierde, el usuario lo nota el lunes:

- búsqueda;
- cada filtro;
- orden por columnas, incluidas las que muestran **nombres cruzados** (fuente, setter);
- paginación;
- numeración de filas;
- el pie "x–y de N (M en total)";
- el **resumen con todos los filtros menos el propio**, para que cada tarjeta cuente lo que aparece al tocarla;
- las métricas sobre el total;
- "seleccionar todos los del filtro";
- exportar;
- la vista kanban;
- la vista guardada al volver.

### 2. Una vista SQL con `security_invoker`
La vista entrega lo que la tabla necesita para filtrar y ordenar:

- los nombres cruzados, para ordenar por ellos sin embebidos;
- columnas `orden_*` en minúscula, si la tabla vieja ordenaba sin distinguir mayúsculas;
- un texto `buscar` con todo lo buscable, para hacer **un solo `ilike`, sin `or()`**: así una coma o un paréntesis que escriba el usuario no rompe nada.

```sql
create or replace view public.leads_lista
with (security_invoker = true) as        -- la RLS de `leads` sigue decidiendo
select l.*, ps.name as setter_name, lower(s.name) as orden_fuente, st.sort as orden_etapa,
       lower(concat_ws(' ', l.name, l.email, l.phone)) as buscar
from public.leads l
left join public.sources s on s.id = l.source_id
left join public.stages st on st.id = l.stage_id
left join public.profiles ps on ps.id = l.setter_id;
revoke all on public.leads_lista from anon, authenticated;
grant select on public.leads_lista to authenticated;
```

Sin `security_invoker`, la vista corre con los permisos de su dueño y le muestra **todo a cualquiera**. Hace falta Postgres 15 o más. Verificá:
- `select reloptions from pg_class where relname = 'leads_lista'` tiene que decir `security_invoker=true`;
- con `set local role authenticated`, la vista tiene que devolver lo mismo que la tabla.

### 3. Los filtros como consulta: UNA sola implementación
Escribí `filtrar(q, vista, ctx, conEtapa)` y `ordenar(q, sort)` en TypeScript, y reusalas en todo: la página, los contadores, los ids del filtro, el CSV y el kanban. No hagas una segunda copia en SQL (una RPC "para los conteos"): dos copias de la misma lógica divergen.

Trampas de PostgREST que aparecieron:

| Trampa | Qué pasa | Arreglo |
|---|---|---|
| NULL en `or()` | `col.neq.X` **no** incluye las filas con NULL: se caen del filtro | `or(col.is.null,col.neq.X)` |
| Comodines de LIKE | `%` y `_` en lo que se escribe actúan como comodín | escapar `\ % _` con `\` |
| `*` en `ilike` | PostgREST lo convierte en `%` y no se puede escapar: buscar "*" trae todo | sacarlo del texto |
| `not.in.(a,b)` | una coma o un paréntesis en un id rompe el filtro | `not.in.("a","b")` |
| Varios `or()` | se combinan con AND (está bien, pero probalo) | — |
| Página que ya no existe | `416` / `PGRST103` | devolver la última y **corregir la URL** |
| Vacíos al ordenar | caen donde quiera la base | `nullsFirst` según dónde caían en la tabla vieja |
| Empates | las filas "bailan" entre páginas | desempate total: nombre + `id` |
| Collation ICU | los textos con tilde cambian de orden ("Álvaro" pasa al lado de "Ana") | decidirlo a propósito y avisar |

**Contadores:**
- Usá `count: "exact", head: true` en paralelo. Unas 14 consultas tardan lo que la más lenta.
- El resumen se cuenta con `filtrar(..., conEtapa: false)`.
- Los contadores de contexto (métricas, resumen) se **degradan a "—"** con `catch → null`. Solo las filas tiran el error: si no, un conteo que se corta deja al usuario sin la lista.

### 4. La prueba que manda: lógica vieja contra la nueva, sobre la base real
Copiá **tal cual** la lógica de filtros y orden que corría en el navegador a un script. Corrérla sobre todas las filas (`fetchAll`, con service role) y compará contra la nueva, caso por caso:

- cada filtro y combinaciones;
- búsquedas raras: tildes en MAYÚSCULAS, `%`, `_`, `a, (b)`;
- cada orden × dirección × página 1 y 2;
- la última página y una que no existe;
- las métricas y los totales del kanban.

Dos cuidados:
- Comprobá que cada caso **tenga filas**. Un caso que da 0 en las dos versiones pasa sin probar nada.
- Para el orden de referencia usá `Intl.Collator`, que es el mismo ICU de la base.

**Caso real:** 65 casos, todos iguales a la primera.

### 5. Medí CON la RLS: la prueba con service role no la ve
```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"<auth_user_id>","role":"authenticated"}', true);
select count(*) from leads_lista;  -- tiene que dar lo mismo que...
select count(*) from leads;        -- ...la tabla, para CADA rol real
explain analyze select * from leads_lista order by ... limit 50;
rollback;
```

**Caso real:**
- Admin y asistente: 120–220 ms por consulta.
- Closer: unos 800 ms. La policy llama a `es_asesor(owner_id)`, que es `security definer` y se evalúa **por fila**.

El arreglo es envolver las funciones en `(select …)` o pasarlas a un `EXISTS` inline. Eso toca la RLS en producción: se decide aparte, con el dueño del proyecto.

### 6. El cliente: la URL es la vista
- **El servidor arma la página:** el server component lee `searchParams` y trae los datos. El estado llega por props, no por `useSearchParams()`.
- **Navegar:** cada cambio es `router.replace(url, { scroll: false })` dentro de una transición, y la búsqueda espera 300 ms.
- **Vista local optimista `v`:** los controles responden al instante. **No** se sincroniza desde el servidor mientras hay una navegación en curso: pisaría lo que se eligió después.
- **`vRef` al día:** todo cambio se arma sobre lo último.
  - **Bug real:** el timer de la búsqueda guardaba la vista del momento en que se tecleó, y pisaba el filtro tocado en esos 300 ms.
  - **Cómo se reproduce:** escribir "ana" y tocar "Calientes" a los 80 ms.
  - **Arreglo:** los hijos mandan **solo el cambio** (un patch), no el estado entero.
- **`desfasado = navegando || qs(v) !== qsServidor`:** mientras sea cierto, se deshabilitan "seleccionar todos", exportar y "ver más". Si no, irían con el filtro anterior.
- **Volver desde el menú** (la URL llega pelada): una cookie de **sesión** con el query string, y el servidor redirige a ella. Antes de redirigir, el valor pasa por el parser y el path es fijo: no hay redirección abierta.
- **Acciones bajo demanda:** ids del filtro, CSV y "ver más" son server actions que leen con la sesión. En el `catch` va `unstable_rethrow(e)`, para no tragarse la redirección al login si la sesión venció.

### 7. Kanban por columnas
- Cada columna trae su total (`count`) y las primeras 25. "Ver más" pide 25 más desde lo ya traído.
- Cuando llegan columnas nuevas del servidor (otro filtro, o el refresh después de mover), se descarta lo traído y **los movimientos optimistas**. Así, si un movimiento falló, la tarjeta vuelve a su columna en vez de quedarse en la equivocada.

### 8. Verificar en el navegador sin tener sesión
- Armá una página temporal local, fuera del middleware de sesión, con **la misma tabla y la misma capa de datos**, usando el cliente admin.
- Bloqueá las server actions que piden login (un `fetch` con el header `next-action`). Si no, un modal que carga opciones al montarse redirige al login.
- Medí con JS (filas, pie, URL, tiempos), **sin capturas de datos reales**.
- Antes del commit, borrá la página **y** `.next/types/...`, que el servidor de desarrollo deja y rompe el typecheck.

### 9. Revisión antes de subir
Pedí una revisión de código antes de subir: es la pantalla que más se usa. En el caso real, la revisión encontró las dos carreras del paso 6 y los conteos que tiraban la página.

## Output esperado
- Una migración con la vista `security_invoker`.
- Un módulo de datos con `filtrar`, `ordenar`, página con total, resumen, métricas, ids, filas para exportar y kanban.
- El estado de la vista (parse y serialize de la URL) en un módulo **sin "use client"**: lo leen el servidor y el navegador. Un valor importado de un módulo de cliente llega al servidor como referencia, no como valor.
- La tabla manejada por la URL y las acciones bajo demanda.
- `pnpm test:<lista>`, con la comparación vieja contra nueva sobre la base real.
- La medición con la RLS de cada rol.
- Una tabla antes/después: peso, tiempos y elementos pintados.

## Ejemplo
**Input:** "Las listas y el pipeline tardan mucho o no cargan; tengo que salir y volver a entrar". Hay 8.122 leads.

**Output:**
1. **Lo barato:** medir. El kanban pintaba 111.074 elementos (3,3 s) y la página leía todo dos veces. Arreglo: 25 por columna y una sola lectura. Se sube eso primero.
2. **La paginación:**
   - la vista `leads_lista`;
   - `filtrar`/`ordenar` como consulta, con 65 casos iguales a la lógica vieja contra la base real;
   - medido con la RLS: admin 120–220 ms;
   - la URL es la vista, con las dos carreras de la revisión arregladas.
3. **Resultado:** 50 filas por visita en vez de 4,2 MB, y no crece con la base.
