# Skill: Anexar creativos/ítems a un "pack" (job) YA existente

Patrón para **iterar sobre un resultado ya generado**: "generar más de lo mismo"
o "variar UNO de los resultados", anexándolos al mismo job/pack, con créditos y
progreso reusando la máquina de estados que ya tenías. Capturado de FreshAdFlow
(#5 generar más + #6 variaciones), 2026-07-10.

Relacionado: [[async-job-pattern]] (el job base), [[anti-abuso-costo-ia-saas]]
(el techo de costo), [[debugging-silent-errors]].

## Cuándo usar esta skill

- Ya tenés un `job` que produjo N ítems (imágenes, análisis, variantes) y querés
  **agregarle más sin crear un job nuevo** (para que vivan en el mismo pack/vista).
- Dos sabores: (a) **"generar más"** con la misma config del job; (b) **"variar
  UNO"** de los ítems (clonar fiel ese ítem, no el pack).
- Querés reusar la **UI de progreso existente** (polling sobre `job.status`) en vez
  de construir una segunda.
- El motor cuesta dinero (IA) → hace falta reservar/refundar créditos por ítem.

## La idea central

Anexar = **volver a poner el pack en `running`, bumpear su `count`, generar los
nuevos ítems con un offset, y devolverlo a `done`**. La grilla, que ya calcula
`pendingCount = count − listos − fallidos`, muestra los placeholders sola. Cero
UI de progreso nueva.

## Proceso

### Paso 1: Enabler de "variar uno" — guardar el prompt/input por ítem

Para clonar fiel un ítem individual necesitás **cómo se generó**, no solo su
etiqueta. Agregá la columna y empezá a poblarla YA (los ítems viejos quedan sin
ella → necesitan fallback).

```sql
alter table creatives add column if not exists prompt text;
```
```ts
// en el worker, al insertar cada ítem:
await admin.from("creatives").insert({ ..., prompt: item.prompt });
```

### Paso 2: Relajar el tope de count

Si `count` tenía un CHECK chico (ej. `between 1 and 12`), los appends lo superan.
Descubrí el nombre real del constraint y relajalo (no asumas el nombre):

```sql
do $$ declare c_name text;
begin
  select conname into c_name from pg_constraint con
  join pg_class rel on rel.oid=con.conrelid
  where rel.relname='jobs' and con.contype='c'
    and pg_get_constraintdef(con.oid) ilike '%count%';
  if c_name is not null then execute format('alter table jobs drop constraint %I', c_name); end if;
end $$;
alter table jobs add constraint jobs_count_check check (count between 1 and 96);
```

### Paso 3: Worker de append (NO reuses el worker inicial tal cual)

Extraé el cuerpo de generación a un `generateInto(job, batch, indexOffset)`
compartido, y escribí un `processAppend` aparte. Tres diferencias críticas con el
worker inicial:

```ts
export async function processAppend(jobId, batch) {
  const job = await loadJob(jobId);
  // (1) OFFSET DE PATH = nº de ítems existentes → NO pisar los archivos ya subidos.
  //     Si reusaras índices desde 0, el upsert sobreescribe los originales (bug real).
  const { count: existing } = await admin.from("creatives")
    .select("*", { count: "exact", head: true }).eq("job_id", jobId);
  try {
    const { failed } = await generateInto(admin, job, batch, existing ?? 0);
    if (failed > 0) await addLedger({ delta: failed, reason: "refund", jobId });
  } catch (err) {
    await addLedger({ delta: batch.length, reason: "refund", jobId }); // nada generado
  } finally {
    // (2) SIEMPRE devolver a done: el pack ya tenía ítems válidos; un append
    //     fallido NO debe marcarlo error ni dejarlo "generando" para siempre.
    await admin.from("jobs").update({ status: "done", finished_at: now }).eq("id", jobId);
  }
}
```
(3) NO hace el claim `queued→running` del inicial — ya viene en `running` (Paso 4).

### Paso 4: Server action — claim atómico + reserva

El disparo se hace desde una action. El **claim atómico es el anti-doble-clic**:
solo procede quien flipea `done→running`; el resto recibe "busy". Bumpeá `count`
en la MISMA operación (mientras `status='done'`, `count` es estable).

```ts
const { data: claimed } = await admin.from("jobs")
  .update({ status: "running", count: job.count + n, finished_at: null })
  .eq("id", job.id).eq("user_id", userId).eq("status", "done")  // <- gate
  .select("id");
if (!claimed?.length) return { ok:false, reason:"busy", message:"Ya está generando." };
await addLedger({ userId, delta: -n, reason: "generation", jobId: job.id }); // reservar
after(() => processAppend(job.id, batch));  // fuera del request
```

- **"generar más"**: `batch = buildBatch({...jobConfig, count:n, indexOffset: nºItemsActuales})`.
  El `indexOffset` hace que la rotación de variedad CONTINÚE (no re-empiece en 0 y
  clone los primeros).
- **"variar uno"**: `batch = Array(n).fill({ prompt: itemPrompt + SUFIJO_VARIACION })`.
  Si el ítem no tiene prompt guardado (pre-migración), reconstruílo desde la config
  del job + su etiqueta/ángulo (fallback).

### Paso 5: UI — polling reiniciable

El polling del pack se apaga al `done`. Para reanudar tras un append, extraé un
`ensurePolling()` que re-arma el intervalo si está apagado, y llamalo tras la
action:

```ts
const ensurePolling = useCallback(() => {
  if (pollRef.current) return;
  void tick(); pollRef.current = setInterval(tick, POLL_MS);
}, [tick]);

async function onGenerateMore() {
  const res = await generateMore(id, count);
  if (res.ok) { flash(`Generando ${res.added} más`); await load(); ensurePolling(); refreshMe(); }
  else flash(res.message);
}
```

## Gotchas (los que ya cometimos / evitamos)

- **Pisar archivos**: si el path deriva del índice del batch y arrancás en 0, el
  `upsert:true` SOBREESCRIBE los ítems existentes. Usá offset = nº de ítems.
- **Dejar el pack colgado**: si el append no devuelve a `done` en `finally`, un
  fallo lo deja "generando" para siempre (el kick de respaldo del inicial mira
  `queued`, no `running`, así que no lo rescata).
- **Doble cobro por doble-clic**: sin el claim atómico `done→running`, dos clics
  reservan créditos y generan dos veces. El `.eq("status","done")` es el candado.
- **Variedad clonada**: sin `indexOffset`, "generar más" repite los primeros ítems
  del pack (misma rotación de ángulo/composición). Continuá la secuencia.
- **Ítems viejos sin prompt**: "variar uno" necesita fallback reconstruido; no
  asumas que la columna nueva está poblada retroactivamente.
- **Anti-abuso**: un append NO crea un job → los topes por-job (IP/día) no lo
  cuentan. El techo real pasa a ser el **saldo de créditos**. Decisión consciente;
  documentala (ver [[anti-abuso-costo-ia-saas]]).

## Output esperado

- Botón "generar más" (con selector de cantidad) que anexa al pack y reanuda el
  progreso en vivo, sin pantalla nueva.
- Botón "variar este" en el visor de un ítem → N hermanas muy parecidas, anexadas.
- Créditos reservados por ítem y refundados por fallo; un append fallido nunca
  rompe el pack existente.

## Ejemplo (FreshAdFlow)

**Input:** usuario en `/packs/[id]` con 9 anuncios listos, hace clic en "Generar
más → 6".

**Output:**
1. Action valida saldo (≥6), claim atómico `done→running` + `count 9→15`, reserva −6.
2. `processAppend`: offset=9 → sube `.../9.png..14.png` (no pisa 0..8), inserta 6
   filas con su `prompt`, refund por los que fallen, `finally` → `done`.
3. La grilla muestra 6 "generando" y luego 15 anuncios; el chip de créditos baja.

Para "variar": mismo flujo pero el batch son N copias del `prompt` de ESA imagen
+ un sufijo "hacela hermana, no idéntica".

## Trade-offs y límites

- **Bump de count vs recalcular**: bumpear `count` es lo que reusa la UI de
  progreso gratis. Costo: si TODOS los appends fallan, `count` en DB queda alto
  aunque el display use `viewable.length`. Cosmético; aceptable. Si molesta,
  reconciliá `count` al done-count en el `finally`.
- **Polling vs realtime**: igual que [[async-job-pattern]] — polling alcanza para
  tandas cortas; realtime si son largas.
