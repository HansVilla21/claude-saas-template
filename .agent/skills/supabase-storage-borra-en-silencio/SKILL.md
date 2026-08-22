# Skill: Supabase Storage borra en silencio (y el índice único parcial que rompe a mitad)

## Cuándo usar esta skill

- Un **borrado de archivo** en Supabase Storage "funciona" (`error: null`) y el archivo **sigue
  ahí**.
- Estás construyendo un **gestor de fotos / archivos**: subir, reordenar, elegir portada, borrar.
- Reordenás filas una por una y aparece un `23505` (violación de índice único) que **no debería
  pasar**, porque el estado final es válido.
- El cliente dice *"borré la foto y volvió"* o *"la portada no cambia"*.
- Ves conteos distintos al listar el mismo bucket con la sesión del usuario y con la service role.

**Costo de no usarla:** en Mueblería Pérez Luna las dos cosas pasaron el mismo día construyendo el
gestor de fotos (2026-07-06). Ninguna lanzó un error visible. Las dos se diagnosticaron mal antes
de encontrar la causa.

---

## Por qué existe esta skill

**Supabase no distingue "no había nada que borrar" de "la RLS te lo escondió".** Las dos cosas
devuelven `error: null`. Y en Storage el efecto es peor que en una tabla.

### El caso 1: `storage.remove()` sin policy de SELECT

`storage.remove()` **primero resuelve qué objeto borrar** consultando `storage.objects`. Si el
bucket no tiene una policy de `SELECT` que le deje ver esa fila al rol que llama, la resolución
devuelve vacío y el borrado **no borra nada**:

```js
const { data, error } = await supabase.storage.from("fotos").remove([ruta])
// error: null   data: []   ← parece éxito, y no borró nada
```

`error: null` con `data: []`. Ese `[]` es toda la señal que vas a recibir, y casi nadie lo mira,
porque el reflejo es `if (error)`.

Lo desconcertante es que **subir sí funciona**. Tenés `INSERT` pero no `SELECT`, así que podés
crear archivos y no podés borrarlos. Se lee como un bug del SDK.

### El caso 2: el índice único parcial que se viola a mitad de camino

Un gestor de fotos casi siempre tiene esta restricción:

```sql
create unique index producto_fotos_una_portada
  on producto_fotos (producto_id) where (es_portada = true);
```

Correcta. Pero si reordenás **fila por fila** y encendés la portada nueva **antes** de apagar la
vieja, hay un instante con dos filas en `true` → `23505`. El estado final habría sido válido; el
camino no lo fue.

Y encima ese error **se lo come el cliente**: se detectó solo agregando logging manual.

---

## Proceso

### 1. Distinguir "no hay match" de "RLS lo escondió"

La prueba que lo separa en un minuto: **listar lo mismo con dos identidades.**

```js
// con la sesión del usuario real (NO service role)
const a = await supabaseSesion.storage.from("fotos").list(carpeta)
// con service role: la verdad de la base
const b = await supabaseAdmin.storage.from("fotos").list(carpeta)
console.log(a.data?.length, b.data?.length)   // ¿distinto? → es RLS
```

Si los conteos difieren, no es tu código: es una policy. La misma técnica vale para tablas
(comparar `count` con y sin service role).

### 2. Nunca confiar solo en `if (error)`

En Supabase, una escritura filtrada por RLS es un **éxito vacío**. Siempre mirá **cuántas filas**:

```js
const { data, error } = await supabase.from("t").update({...}).eq("id", id).select("id")
if (error) throw error
if (!data.length) throw new Error("no se actualizó ninguna fila (¿RLS?)")
```

En Storage, lo mismo con el array que devuelve `remove()`.

### 3. La policy que falta suele ser la de SELECT

Para un bucket **público**, agregar `SELECT` explícito no agrega superficie nueva —lo que está en
un bucket público ya es legible— y destraba `remove()`:

```sql
create policy "leer fotos" on storage.objects
  for select using (bucket_id = 'fotos');
```

> Si el bucket es **privado**, no lo abras: acotá el `using` a quien corresponda (dueño, rol,
> prefijo de carpeta). El punto no es "abrir", es que **el rol que borra pueda ver lo que borra**.

### 4. Reordenar en tres pasos, no fila por fila

Con un índice único parcial, el orden importa:

```
1) apagar TODAS las portadas del producto      → 0 filas en true
2) actualizar el orden de todas las filas
3) prender SOLO la nueva portada               → 1 fila en true
```

Nunca pasar por un estado con dos. Si el motor y el driver lo permiten, envolvelo en una
transacción o en un RPC (`security definer`) para que sea atómico de verdad; si no, el orden de
arriba alcanza porque nunca hay dos `true` simultáneos.

### 5. Verificar contra la base, no contra la UI

```sql
select count(*) from producto_fotos where producto_id = $1 and es_portada;  -- exactamente 1
```

Y para el borrado: volver a listar el bucket **después** y confirmar que el objeto ya no está. Un
`error: null` no es evidencia de nada.

---

## Output esperado

- Borrados de archivos que **verifican el resultado**, no el campo `error`.
- Policy de `SELECT` presente para el rol que borra.
- Reordenamientos que nunca pasan por un estado que viole el índice único parcial.
- Diagnóstico hecho comparando sesión real vs service role, no teorizando.

---

## Gotchas / antipatrones

- 🔴 **`if (error) { ... }` como única verificación.** En Supabase el bloqueo por RLS es un éxito
  vacío. Hay que contar filas.
- 🔴 **Abrir el bucket entero para "arreglar" el borrado.** Si es privado, acotá la policy.
- 🔴 **Diagnosticar desde la UI.** Un gestor de fotos con estado optimista muestra la foto
  desaparecida y la devuelve al recargar.
- ⚠️ **"Subir funciona, así que los permisos están bien".** `INSERT` y `SELECT` son policies
  distintas; `remove()` necesita la segunda.
- ⚠️ **Reordenar fila por fila con un índice único parcial.** El estado final válido no salva el
  camino inválido.
- ⚠️ **Un `catch` que no loguea.** Los dos bugs de este caso se encontraron **agregando logging
  manual**, porque el error se tragaba en el cliente.

---

## Ejemplo concreto (Mueblería Pérez Luna, gestor de fotos, 2026-07-06)

**Bug 1 — la foto no se borraba.** `storage.remove()` devolvía `error: null, data: []`. Faltaba
la policy de `SELECT` en `storage.objects`: sin ella el SDK no puede resolver qué archivo borrar.
Se detectó comparando `list()` con service role contra `list()` con la sesión del admin —
mostraban conteos distintos. Fix: policy de `SELECT` explícita (bucket público, sin superficie
nueva).

**Bug 2 — cambiar la portada tiraba `23505`.** El índice `producto_fotos_una_portada` exige una
sola portada por producto. Al reordenar fila por fila, la nueva se encendía antes de apagar la
vieja → dos en `true` por un instante. Fix: apagar todas → actualizar el orden → prender solo la
nueva.

**El hilo que las une:** ninguna de las dos avisó. Una respondió éxito vacío y la otra lanzó un
error que el cliente se comió.

---

## Skills relacionadas

- `detectar-escritura-filtrada-rls` — el caso general en tablas: bajo RLS, un `update` que no
  matchea responde éxito con 0 filas.
- `soft-delete-bloqueado-por-rls` — la otra cara: la escritura que te saca de tu propia
  visibilidad y Postgres rechaza.
- `habilitar-rls-tabla-expuesta` — prender RLS sin dejar la app en deny-all silencioso.
- `debugging-silent-errors` — reproducir antes de instrumentar.
