# Skill: Distinguir "se detuvo a propósito" de "se rompió"

## Cuándo usar esta skill

- No podés responder **"¿cada cuánto falla esto de verdad?"** sobre un proceso que corre solo (un bot, un worker, un pipeline, un cron).
- Tenés una tabla de trazas / ejecuciones / jobs con un montón de filas en `running`, `pending` o `in_progress` que **nunca terminaron**.
- Estás por decidir un **rediseño de arquitectura** ("esto es frágil, saquémoslo de acá") a partir de una tasa de falla que en realidad nadie midió.
- Vas a agregar un portón (`if` de permisos, feature flag, gate de estado) a un flujo que **ya abrió un registro** más arriba.

## Por qué existe esta skill

Capturada el **2026-08-24** en el CRM de Momentum. El founder planteó una duda razonable y bien fundada:

> *"No garantizamos que en cada mensaje se esté extrayendo la información. Habría que sacar esa función del flujo y tenerla aparte, en código."*

Los números parecían darle la razón: **el 26 % de los turnos del bot quedaban en `running`, sin terminar nunca**, y solo el 60 % tenía datos extraídos.

Al medirlos de a uno, el diagnóstico se dio vuelta:

| De los 264 turnos "colgados" | |
|---|---|
| conversaciones que hoy lleva un humano | **237 (90 %)** |
| con handoff | 183 |
| con pausa registrada | 87 |
| **sin explicación aparente** | **7 (2,6 %)** |

Y la rama de captura de error del extractor **no se había disparado ni una sola vez en toda la base**.

O sea: el bot se estaba deteniendo **bien**, y nadie lo anotaba. La causa estructural era una sola: **la traza se crea antes de los portones del flujo**, así que cuando un portón corta —el comportamiento correcto— no queda nadie que la cierre.

> Un estado que significa "en vuelo" pero que también se usa para "se detuvo a propósito" **no es un estado: es una ausencia de información**. Y con esa ausencia no se puede decidir nada.

El costo de no tener esto no es el registro sucio. Es que **una decisión de arquitectura cara estaba a punto de tomarse sobre un número que no medía lo que parecía medir.**

## Proceso

### 1. Mapear los finales del flujo que no cierran el registro

No alcanza con mirar los nodos "terminales". Buscá dos cosas distintas:

**a) Ramas muertas.** Un `if` cuya salida **no va a ningún nodo** no aparece como final en ningún listado — el flujo simplemente se evapora ahí. Fue el culpable número uno:

```js
// para cada if/switch alcanzable, ¿hay alguna salida sin destino?
const branches = (connections[node.name] || {}).main || [];
branches.forEach((b, i) => { if (!b || !b.length) console.log('rama muerta:', node.name, i); });
```

**b) Finales exclusivos.** Un nodo terminal cuyo camino **no pasa por ningún cierre**. Ojo con la trampa: si el cierre corre en una **rama hermana en paralelo**, el registro *sí* se cierra y no hay nada que arreglar. Distinguí:

- salida que dispara **dos nodos a la vez** → paralelo, corren los dos.
- salidas **distintas** de un `if`/`switch` → exclusivas, corre una sola.

No lo deduzcas por heurística: mirá las conexiones reales de cada nodo.

### 2. NO cerrar el registro en una rama paralela

Es el error caro de este trabajo, y es silencioso al revés: cerrarías la traza **mientras el proceso todavía está trabajando**, y a partir de ahí tus métricas dirían que todo termina bien.

Una rama paralela **no es un final del flujo**, aunque no tenga salida. Dejala en paz, y dejá escrito en el script *por qué* la dejaste, o el próximo la "arregla".

### 3. Agregar el estado, con migración — y no confiar en que el write entró

Si la columna tiene un `CHECK` o un enum, un valor nuevo **lo rechaza la base**. Y como estos nodos de cierre casi siempre van con "no romper el flujo pase lo que pase" (`onError: continueRegularOutput` o un `try/catch` silencioso), **el error se vuelve invisible: el nodo reporta éxito y no escribió nada.**

```sql
-- lo que ya estaba
CHECK (status = ANY (ARRAY['running','done','failed','partial','superseded']))
```

Antes de aplicar, probá la migración contra la base viva con el bloque que siempre aborta, **con control negativo**:

```sql
do $$
begin
  alter table ... drop constraint ...;
  alter table ... add constraint ... check (status = any (array[..., 'skipped']));
  -- positivo: el valor nuevo entra
  -- negativo: un valor inventado TIENE que seguir rechazándose
  --           (sin esto, un CHECK borrado por error se leería como éxito)
  raise exception 'REPORTE — todo revertido: %', v_rep;
end $$;
```

### 4. Guardar el MOTIVO, no solo el estado

`skipped` sin motivo te deja igual de ciego. El portón que encontramos evaluaba **tres condiciones con AND**, y saber cuál cortó es todo el valor: *"el bot no contestó"* no dice nada; *"el bot está apagado en esta cuenta"* se acciona solo.

```js
if (!agencyOn)                 reason = 'bot_apagado_en_la_agencia';
else if (st.handler !== 'bot') reason = 'conversacion_en_manos_humanas';
else if (pausado)              reason = 'bot_pausado';
```

**Semántica, decidida y escrita en el `comment on column`:**

- `skipped` = el flujo **no hizo nada** a propósito (un portón cortó).
- `done` = el turno **completó su trabajo**, aunque no haya producido la salida típica (escaló a un humano, ejecutó un comando).

### 5. No pisar la metadata al cerrar

Si el cierre hace `UPDATE ... SET metadata = {...}`, **reemplaza la columna entera** y te comés el teléfono, el id del proveedor y la marca de sintético que había guardado el registro al crearse. Reconstruí lo que ya estaba, o mergeá (`metadata || jsonb_build_object(...)` en SQL).

### 6. Verificar que el nodo ESCRIBIÓ, no que corrió

Dos comprobaciones distintas, y la primera sin la segunda no vale:

1. **El motor:** la ejecución real corrió el nodo nuevo (`executionStatus: success`).
2. **La base:** existe la fila, con el estado y el motivo esperados.

Y el detalle que hace la prueba honesta: si hiciste **backfill** de las filas viejas, marcalo (`metadata.backfill = true`) y exigí que la fila de prueba venga **sin** esa marca. Si no, el backfill te "confirma" el nodo nuevo y no probaste nada.

Cerrá con la evidencia del **antes**: las ejecuciones previas al deploy mostrando el portón saliendo por la rama muerta sin que corriera ningún cierre.

### 7. Backfill solo donde el motivo es inequívoco

De las 3.021 filas colgadas se marcaron 2.765: **las de la cuenta con el bot apagado**, donde el motivo no admite otra lectura. El resto se dejó como estaba.

> Adivinarle el motivo a un registro viejo es **fabricar un dato**, y queda indistinguible de uno medido.

El conteo honesto arranca desde el día del arreglo. Escribilo así en el backlog.

## Output esperado

1. El mapa de finales del flujo, separando **los que cierran** de **los que dejan el registro abierto**, y marcando cuáles son ramas paralelas que **no hay que tocar**.
2. La migración del estado nuevo, probada con bloque que aborta + control negativo.
3. Los cierres, cada uno con su **motivo específico**, sin pisar la metadata previa.
4. Verificación en dos capas (el motor corrió · la base tiene la fila) con evidencia del antes y del después.
5. Backfill acotado a lo inequívoco, marcado como backfill.
6. En el backlog: **el número que ahora sí significa algo**, y los casos que quedaron sin explicar — que son la señal real.

## Ejemplo

**Input:**
> "Siento que no garantizamos que en cada mensaje se extraiga la información. Habría que sacar esa función del flujo de n8n y tenerla en código."

**Output:**

Medición antes de rediseñar: de 264 turnos colgados, 237 están en manos humanas, 183 con handoff, 87 con pausa — **solo 7 sin explicación**, y la rama de error del extractor nunca se disparó. El "26 % de turnos rotos" era casi todo el bot deteniéndose bien sin registrarlo.

Causa: `Chatbot Activado?` tenía la rama `false` **colgando en el vacío**. Se agrega `skipped` al CHECK y cuatro cierres con motivo. `Rescatar Inbound Faltante` **no se toca**: es paralelo.

Verificado con un mensaje real: `status=skipped`, `reason=bot_apagado_en_la_agencia`, metadata conservada, **sin marca de backfill**.

Conclusión que cambia la decisión: la preocupación de fondo era correcta —nada reintenta ni reconcilia si un turno muere— pero la tasa de falla real no era la que se creía, así que el rediseño se decide con datos y no con una corazonada.

## Skills relacionadas

- `verificar-funcionamiento-end-to-end` — "el nodo corrió" ≠ "el nodo escribió".
- `probar-migracion-contra-base-viva-con-rollback` — el bloque que siempre aborta.
- `config-que-deja-el-sistema-mudo` — el otro lado: el silencio que ni siquiera deja registro.
- `webhook-fanout-sin-reconciliacion` — cuando el evento se pierde y nadie reconcilia.
