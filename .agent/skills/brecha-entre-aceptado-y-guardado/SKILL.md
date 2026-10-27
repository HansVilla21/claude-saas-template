# Skill: La brecha entre "aceptado" y "guardado"

> Nació el 2026-09-07 con un reporte de Di Garda: *"la información que ella previamente
> había compartido no estaba"*. Al medirlo: **21 archivos en el Storage, 11 anotados en la
> base**. Las subidas habían salido perfectas — todas 200 —, el guardado nunca se enteró.
> No hubo una sola línea roja en ningún log, ni ese día ni los anteriores.

## El concepto (esto es lo único que hay que recordar)

Entre que tu sistema **acepta** el trabajo de alguien y que lo **registra** hay una ventana.

- Los bytes ya están en el Storage… pero la fila que los lista todavía no los menciona.
- Las teclas ya están en el estado del navegador… pero el `UPDATE` todavía no salió.
- El formulario ya te dijo "subiendo 8 de 10"… y todavía no anotó ninguno.

**Todo lo que muere en esa ventana se pierde sin producir un error.** Y no se pierde
"a veces": se pierde exactamente cuando la ventana es más larga —archivos grandes, celular,
mala señal—, o sea justo con el usuario que más te importa.

La pregunta que abre el caso es siempre la misma:

> **¿Cuánto tarda mi sistema entre aceptar una pieza y anotarla, y qué pasa si en ese rato
> el usuario recarga, cambia de app o vuelve a intentar?**

Si la respuesta es "se pierde", tenés este bug — aunque hoy nadie lo haya reportado.

## Cuándo usar esta skill

- Un cliente dice **"se perdió lo que puse"** y en los logs está todo en 200.
- Una pantalla que acepta trabajo **en varios pasos**: subir archivos, grabar audio,
  autoguardado con debounce, wizards, importadores, carritos.
- **Antes de dar por terminada** cualquier pantalla de esas. Este bug no aparece en `tsc`,
  ni en el linter, ni en el build, ni en un click de prueba con UN archivo.
- Cuando estás por "arreglarlo" agregando un botón de Guardar (leé el gotcha 1, no alcanza).

## Proceso — Parte A: medir antes de opinar

### A1. Contar huérfanos. Es la consulta que convierte un reclamo en un número

Todo diseño de este tipo tiene un **almacén** (Storage, S3, disco, tabla de blobs) y un
**índice** (la fila/JSON/tabla que los lista). Cruzalos:

```sql
with referenciados as (
  -- adaptá esto a tu índice: acá el índice es un jsonb con arrays de archivos
  select f->>'path' as path
  from public.agency_onboarding o,
       jsonb_each(o.answers) b, jsonb_each(b.value) q,
       jsonb_array_elements(coalesce(q.value->'files','[]'::jsonb)) f
  where o.agency_id = :tenant
)
select s.name, s.created_at, (s.metadata->>'size')::bigint as size,
       case when r.path is null then 'HUERFANO' else 'ok' end as estado
from storage.objects s
left join referenciados r on r.path = s.name
where s.bucket_id = :bucket and s.name like :tenant || '/%'
order by s.created_at;
```

**Un huérfano es una pérdida silenciosa.** No hay otra interpretación: alguien pagó el
ancho de banda, el archivo existe, y el producto no sabe que existe.

> Medido en el caso original: 21 objetos, 11 referenciados, **10 huérfanos**.

### A2. Separar la pérdida real del reintento — comparando por HASH, no por tamaño ni fecha

⚠️ **El reintento del usuario ensucia la evidencia, y es el error de lectura más fácil de
cometer.** Quien no ve su archivo lo vuelve a subir. Así que la mayoría de tus huérfanos
suelen ser gemelos de algo que sí quedó anotado, y si contás nomás le vas a decir al
cliente "perdimos 10" cuando perdiste 1.

Compará por **checksum** (`metadata->>'eTag'` en Supabase Storage es el MD5), nunca por
tamaño —dos capturas distintas pueden pesar igual— ni por nombre —el path lo genera el
server y siempre es único—:

```sql
-- huérfanos que NO tienen un gemelo idéntico ya anotado = la pérdida de verdad
select count(*) filter (where r.path is null) as huerfanos,
       count(*) filter (
         where r.path is null
           and not exists (
             select 1 from storage.objects s2 join referenciados r2 on r2.path = s2.name
             where s2.metadata->>'eTag' = s.metadata->>'eTag')
       ) as huerfanos_sin_gemelo
from storage.objects s left join referenciados r on r.path = s.name
where s.bucket_id = :bucket and s.name like :tenant || '/%';
```

> Medido: de 10 huérfanos, **9 tenían gemelo idéntico y 1 era pérdida real**. Ese 1 se
> recuperó anotándolo a mano en el índice — el archivo nunca se había ido a ningún lado.

### A3. Leer los logs CONTANDO eventos, no leyendo líneas

La firma del bug es una **desproporción entre dos conteos**, y salta en una sola consulta
agrupada por minuto:

```
20:30   POST ticket de subida ×11   PUT subida ×11   →   RPC guardar ×1     ← el bug
20:33   POST ticket de subida ×9    PUT subida ×9    →   RPC guardar ×9     ← lo sano
```

Once piezas aceptadas, **un solo registro**. Tres minutos después, la misma persona
subiéndolas de a una: nueve y nueve. Esa diferencia es todo el diagnóstico, y no hay que
leer una sola línea de log para verla.

## Proceso — Parte B: las cuatro reglas del arreglo

### B1. Registrar cada pieza APENAS llega, nunca al final del lote

Si el registro pasa al final, la ventana de pérdida dura **todo el lote**. Con diez
capturas de celular a 2-4 s cada una son ~25 segundos en los que recargar, navegar o que
el sistema operativo mande la pestaña al fondo tira **todo**.

```js
// ❌ todo o nada
const subidos = [];
for (const f of archivos) subidos.push(await subir(f));
registrar(subidos);

// ✅ cada uno cuenta apenas existe
for (const f of archivos) {
  const subido = await subir(f);
  if (subido) registrar(subido);
}
```

### B2. Nunca escribir una colección como valor absoluto calculado ANTES de un `await`

Este es el corazón del bug y aplica a cualquier lenguaje con estado compartido, no solo a
React.

```js
// ❌ `actuales` queda vieja mientras subís. Si entra otra tanda, la pisás.
const actuales = respuestas[k].files;
const nuevos = await subirTodo(archivos);
set({ files: [...actuales, ...nuevos] });

// ✅ la lista se calcula CONTRA EL ESTADO VIVO, en el momento de escribir
set(prev => ({ files: [...prev.files, subido] }));
```

Vale para el camino de **quitar** también: dos borrados encimados con el patrón viejo
**resucitan** un elemento, y ese es aún más difícil de creer cuando lo reportan.

### B3. El guardado diferido tiene que sobrevivir a que la pantalla se vaya

Un autoguardado con debounce y un cleanup que hace `clearTimeout` **tira** lo último que
escribió la persona. Y en celular la ventana no es la del debounce: **iOS congela los
timers** cuando bloqueás el teléfono o cambiás de app, y la pestaña puede no despertar
nunca.

```js
// visibilitychange → móvil (cambiar de app, bloquear la pantalla). El único confiable.
// pagehide       → cerrar y recargar.
// cleanup        → navegar dentro de la misma SPA.
// Los tres GUARDAN. Ninguno cancela.
```

### B4. Un guardado en vuelo por vez, y el que falla vuelve a la cola

Con B1, los guardados pasan a ser muchos y seguidos. Dos en paralelo sobre la misma unidad
significan que **el que salió primero puede llegar último** y pisar lo nuevo con lo viejo —
habrías cambiado un bug por otro.

Y un guardado que falla no puede morir con un cartel rojo: vuelve a `pendiente`. Pero **no
lo reprogrames solo**, o martillás un servidor que ya está caído. Lo reintenta la próxima
tecla, el botón, o el guardado de salida.

## Proceso — Parte C: que se pueda VER

Un estado que no se ve no se puede reportar, y por eso este bug vivió tanto: **"tengo
cambios sin guardar" se dibujaba igual que "no hay nada que guardar"**. La clienta no tenía
forma de saber si su texto estaba a salvo, así que tampoco podía avisar a tiempo.

Mínimo:
- Un estado `dirty` visible, distinto de `idle`.
- Progreso real de lote: **"Subiendo 3 de 10…"**, no un spinner.
- Un cartel global que conteste *"¿puedo cerrar esto?"*: `Todo guardado` / `Guardando…` /
  `Sin guardar`.
- Un **botón de guardar** que aparezca solo cuando hay algo pendiente — así su desaparición
  ES la confirmación. Si el guardado falló, que diga **Reintentar**.

## Gotchas

1. **⛔ El botón de Guardar NO arregla este bug, y es lo primero que todo el mundo propone.**
   Lo que se pierde nunca llegó al estado que el botón guardaría. En el caso original, con
   el botón puesto y sin los arreglos B1/B2, las diez capturas se perdían igual. El botón
   resuelve la *ceguera*, no la *pérdida*. Hacen falta los dos.
2. **Guardado solo-manual es PEOR que el automático**, aunque suene más seguro. El
   automático pierde un segundo; el manual pierde la sesión entera cuando la persona no
   toca el botón — y en un formulario que se llena desde el celular en ratos sueltos, eso
   es lo más probable que hay. El automático se queda de red de seguridad.
3. **Nunca deduzcas el nombre original de un huérfano.** Al recuperarlo, el nombre que puso
   el usuario vivía en el índice, que es justo lo que se perdió. Inventarle uno plausible
   ("IMG_8688.png", porque falta ese número en la secuencia) es fabricar un hecho. Poné un
   nombre honesto y decilo.
4. **Recuperar a mano mientras el usuario tiene la pestaña abierta puede no durar:** su
   próximo guardado escribe el estado del navegador, que no incluye lo que acabás de
   restaurar. Recuperá y pedí que recargue.
5. **Revisá qué más pasa por cada guardado.** Con el registro pieza por pieza, todo lo que
   colgaba de "cuando se guarda" pasa a correr N veces. En el caso original había un
   `revalidatePath` que volvía a renderizar la página entera y a **firmar 11 URLs** de los
   adjuntos, para refrescar un dato que el navegador ya tenía.
6. **Si el diseño trae una entrada de captura (audio, cámara, escáner), auditá sus modos de
   falla uno por uno.** El grabador del caso original no hacía **nada** si el blob salía
   vacío: volvía al botón como si nunca hubieras grabado. Resultado medido: **cero audios
   en el bucket desde que existía, de ningún cliente** — y nadie se enteró porque un
   silencio no dispara alertas.

## Output esperado

1. **El censo** (A1 + A2): objetos en el almacén, referenciados, huérfanos y **huérfanos
   sin gemelo**. Números, no adjetivos.
2. **El conteo de eventos** (A3) que muestra la desproporción.
3. **El diff** con B1-B4 y la parte C.
4. **La reproducción determinística con control negativo** (abajo).
5. **La recuperación** de lo que se pueda salvar, y decir explícitamente qué no.

### La reproducción (sin dependencias, corre con `node`)

El control negativo es obligatorio: **si el código viejo no falla en tu prueba, tu prueba
no mide nada** y el verde es falso.

```js
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SUBIDA_MS = 20;

function crearEstado() {
  let files = [];
  return { leer: () => files,
           escribirAbsoluto: (n) => { files = n; },
           actualizar: (m) => { files = m(files); } };
}

async function loteViejo(e, nombres, { abortarEn = Infinity } = {}) {
  const foto = e.leer();                       // ← queda vieja mientras sube
  const agregados = [];
  for (const [i, n] of nombres.entries()) {
    if (i >= abortarEn) return;                // recargó a mitad
    await sleep(SUBIDA_MS); agregados.push(n);
  }
  e.escribirAbsoluto([...foto, ...agregados]);
}

async function loteNuevo(e, nombres, { abortarEn = Infinity } = {}) {
  for (const [i, n] of nombres.entries()) {
    if (i >= abortarEn) return;
    await sleep(SUBIDA_MS);
    e.actualizar((prev) => [...prev, n]);
  }
}

// Escenario 1: dos tandas encimadas.  Escenario 2: recarga a mitad del lote.
// VIEJO: pierde 3 de 5 y 3 de 3.      NUEVO: 0 y 0.
```

## Ejemplo

**Input:** *"El fin de semana Betania estuvo llenando la parte de entrenar al bot, y el
domingo cuando entró no estaba la información que había compartido."*

**Output:**

| | |
|---|---|
| Objetos en el Storage | 21 |
| Referenciados en la base | 11 |
| Huérfanos | 10 |
| **Huérfanos sin gemelo (pérdida real)** | **1** |

Log de la tanda: 11 tickets, 11 subidas, **1 guardado**. Tres minutos después, de a una:
9 y 9. → Causa: la lista de archivos se escribía como valor absoluto calculado antes de
25 segundos de subidas (B2), y solo al final del lote (B1). Arreglado con B1-B4 + C; la
única captura perdida se re-anotó a mano en el índice; verificado 0 huérfanos sin gemelo.

## Skills relacionadas

- [[verificar-funcionamiento-end-to-end]] — "subió 200" no es "quedó guardado". Este bug
  es el ejemplo más puro: todas las capas devolvieron éxito y el dato no estaba.
- [[detectar-escritura-filtrada-rls]] — el otro gran "escribí y no pasó nada, sin error".
  Si el censo da huérfanos pero el cliente **sí** ve todo, mirá esa antes que esta.
- [[subir-archivos-grandes-sin-pasar-por-el-servidor]] — el patrón de subida con URL firmada que
  crea esta brecha: el server firma, el navegador sube, y **alguien** tiene que anotar.
- [[refrescar-vista-server-tras-mutacion-cliente]] — para el `revalidatePath` del gotcha 5.
