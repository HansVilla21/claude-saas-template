# Skill: Probar una migración contra la base VIVA, en transacción con rollback

## Cuándo usar esta skill

- Escribiste una migración (DDL, policies, backfill de datos) y **antes de que el founder la aplique en prod**.
- La migración toca datos vivos (un `update` de backfill, una limpieza).
- Querés saber si el SQL compila **contra el esquema real** (FKs, enums, funciones que existen de verdad), no contra tu memoria del schema.
- Vas a afirmar "la migración recupera N filas" — ese número hay que **medirlo**, no estimarlo.

## Por qué existe esta skill

Capturada el **2026-07-16** en el CRM de Momentum. Se aplicó a **5 migraciones seguidas** (0042–0046) y cazó cosas que ningún linter ve:

- Que el `UNIQUE (message_id, actor_kind)` hacía lo que se creía: el upsert **reemplazó** 👍→❤️ del lead, y el negocio pudo tener la suya en el mismo mensaje.
- Que el backfill de citas recuperaba **55 de 60** (las otras 5 citan mensajes más viejos que el historial) — un número real, no un "debería recuperar casi todas".
- Que el backfill **atribuía mal 3 de 10 reacciones** (se las daba al lead cuando las había puesto el negocio).

El proyecto además tiene la regla: *"Claude no aplica migrations en prod — el founder pega el SQL tras review"*. Esto le da al founder un SQL **ya probado contra su propia base**, no uno "que debería andar".

## Proceso

### 1. Confirmar que el rollback funciona en tu herramienta

**Nunca asumirlo.** Sonda barata primero:

```sql
begin; create table public._tx_probe(x int); rollback;
select to_regclass('public._tx_probe') is null as rollback_funciona;
```
Si da `true`, podés seguir.

### 2. Envolver la migración + assertions + rollback

```sql
begin;

-- ── la migración completa, tal cual ──
create table if not exists public.x ( … );
alter table public.y add column if not exists z timestamptz;

-- ── probar los INVARIANTES, no solo que corra ──
insert into public.x (…) values (…);                       -- happy path
insert into public.x (…) values (…) on conflict (…) do update set …;  -- ¿el UNIQUE hace lo que creo?

select
  (select count(*) from public.x) as filas_esperado_2,
  (select relrowsecurity from pg_class where oid='public.x'::regclass) as rls_on,
  (select count(*) from pg_policies where tablename='x') as policies,
  (select count(*) from pg_trigger where tgrelid='public.x'::regclass and not tgisinternal) as triggers;

rollback;   -- ⚠️ NUNCA olvidarlo
```

### 3. Para backfills: medir el resultado + CONTROLES NEGATIVOS

Lo que más valor da. No alcanza con "actualizó filas":

```sql
select
  (select count(*) from messages where reply_to_message_id is not null) as citas_recuperadas,
  -- controles negativos: lo que NO debe pasar
  (select count(*) from messages m join messages q on q.id = m.reply_to_message_id
    where q.agency_id <> m.agency_id) as citas_cruzadas_entre_clientes_esperado_0,
  (select count(*) from messages where reply_to_message_id = id) as autocitas_esperado_0;
rollback;
```

**Un control negativo cazó un bug real:** sin `citado.agency_id = m.agency_id`, el `wa_message_id` **no es único entre tenants** y una cita podía cruzarse de cliente.

### 4. Confirmar que prod quedó intacta — SIEMPRE

El paso que se saltea y no se debe:

```sql
select
  to_regclass('public.x') is null as tabla_no_existe_ok,
  (select count(*) from messages where body like '{%"wamid"%') as datos_intactos_58;
```

### 5. Después de aplicar: repetir los checks contra lo APLICADO

Probar contra la policy de la transacción **no es** probar la que quedó viva. Repetir el positivo y el negativo contra la real.

## ⚠️ Gotcha que costó un susto

En una de las pruebas **se olvidó el `rollback` explícito**. No pasó nada porque la herramienta MCP envuelve cada llamada en su propia transacción y revirtió sola — **fue suerte, no diseño**.

**Poner siempre el `rollback`.** Y verificar el paso 4 igual: si la herramienta hubiera autocommiteado, la tabla quedaba creada en prod sin migración ni registro.

---

## 🔒 Variante fuerte: el bloque que SIEMPRE aborta (2026-08-13)

*Capturada en el CRM de Momentum probando la migración `0057`. **Reemplaza al paso 1** y elimina el susto de arriba de raíz.*

El `rollback` explícito depende de tres cosas que no controlás: que te acuerdes de escribirlo, que la herramienta mantenga **una sola sesión** entre statements, y que ningún error a mitad de camino te saltee el final del script. Si alguna falla, la escritura **queda en prod**.

La versión que no depende de nada de eso: meter todo en un `DO` que **termina siempre en `raise exception`**. La excepción aborta la transacción — no hay camino en que las escrituras sobrevivan — y el **reporte viaja dentro del mensaje del error**.

```sql
do $$
declare
  n_a int; n_b int;
begin
  -- 1. mutaciones de prueba (insert / update / delete / hasta DDL)
  --    ⚠️ la DDL es transaccional en Postgres: podés aplicar la policy NUEVA
  --       acá adentro y medir ANTES vs DESPUÉS en el mismo bloque
  execute 'drop policy if exists mi_policy on public.tabla';
  execute 'create policy mi_policy on public.tabla for update using ( … )';

  -- 2. mediciones + controles negativos
  update public.tabla set x = 1 where id = :caso_que_debe_pasar;  get diagnostics n_a = row_count;
  update public.tabla set x = 1 where id = :caso_que_NO_debe;     get diagnostics n_b = row_count;

  -- 3. el final obligatorio: nunca hay commit
  raise exception 'REPORTE >>> permitido=% (esperado 1) | bloqueado=% (esperado 0)', n_a, n_b;
end $$;
```

La herramienta devuelve el reporte **como texto del error**. Es un "fallo" que en realidad es el resultado.

### Por qué esto es mejor, y no solo distinto

| | `begin … rollback` | bloque que siempre aborta |
|---|---|---|
| Si te olvidás del final | **escribe en prod** | imposible: sin `raise` no compila tu intención, y con `raise` siempre aborta |
| Si la herramienta parte los statements | `begin` es no-op → **autocommit** | es **un solo statement**: o corre entero o no corre |
| Si algo falla a mitad | el `rollback` puede no ejecutarse | la excepción **es** el rollback |
| Probar una policy nueva | hay que aplicarla antes | se aplica **adentro** y se mide antes/después |

### Combinalo con el rol real

Para probar RLS, adentro del mismo bloque:

```sql
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_user, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  -- … los updates que querés medir …
  execute 'reset role';
```

Un `update` bloqueado por el `USING` **no lanza error**: afecta 0 filas. Por eso se mide con `get diagnostics … row_count`, no con un `begin/exception`. Para el `WITH CHECK`, que sí lanza `42501`, envolvé cada intento en su propio `begin … exception when others then …` para poder seguir midiendo los demás.

### Lo que NO cambia

El **paso 4 sigue siendo obligatorio**: después del bloque, verificar con una query aparte que prod quedó intacta. La garantía es teórica hasta que la mirás.

### Ejemplo real (migración `0057`, CRM Momentum)

```
ANTES   agente + lead del POOL: 0 filas (esperado 0 = el bug)
DESPUES agente + POOL:          1 filas (esperado 1)
DESPUES agente + conv AJENA:    0 filas (esperado 0)   ← no se ensanchó de más
DESPUES agente + conv SUYA:     1 filas (esperado 1)   ← sin regresión
DESPUES agente + OTRA AGENCY:   0 filas (esperado 0)   ← multi-tenant intacto
DESPUES owner + conv ajena:     1 filas (esperado 1)   ← sin regresión
```

Seis mediciones, la policy vieja y la nueva en el mismo bloque, y prod verificada intacta después. Recién ahí se aplicó.

---

## 🧬 Reemplazar una función VIVA sin cambiar nada más (2026-09-12)

*Capturada en el CRM de Momentum con la migración `0095`: una función de cron de
~110 líneas donde había que cambiar **tres expresiones** y nada más.*

El riesgo de `create or replace` sobre una función larga no es lo que cambiás. Es
lo que **cambiás sin darte cuenta**: una condición que otra migración ya había
agregado y tu copia no trae, o un espacio que rompe un `like`. Tres reglas:

**1. Copiá el cuerpo de la definición VIVA, no del último `.sql` que la tocó.**

```sql
select pg_get_functiondef('public.mi_funcion()'::regprocedure);
```

**2. Probá la migración EXACTA, generada desde el archivo, no reescrita a mano.**
Un `DO` no puede contener `create function … $$ … $$` suelto, pero sí
`execute $m0$…$m0$` por sentencia. Se generan con un script que parte el `.sql`
respetando los `$tag$` y los comentarios. El script va en un archivo y no en la
terminal, porque las comillas se rompen:

```js
// separar sentencias: ';' solo cuenta fuera de $tag$ y fuera de '--'
let cur = "", tag = null, stmts = [];
for (let i = 0; i < src.length; ) {
  if (!tag && src.startsWith("--", i)) { i = src.indexOf("\n", i) + 1 || src.length; continue; }
  const m = src.slice(i).match(/^\$[A-Za-z_]*\$/);
  if (m) { tag = !tag ? m[0] : (m[0] === tag ? null : tag); cur += m[0]; i += m[0].length; continue; }
  if (!tag && src[i] === ";") { if (cur.trim()) stmts.push(cur.trim()); cur = ""; i++; continue; }
  cur += src[i++];
}
const cuerpo = stmts.map((s, k) => `  execute $m${k}$${s}$m${k}$;`).join("\n");
```

**3. Probá que SOLO cambió lo que querías, textualmente.** Adentro del bloque:

```sql
  v_vieja := pg_get_functiondef('public.mi_funcion()'::regprocedure);
  create temp table _antes on commit drop as select id, public.mi_label(id) as viejo from public.leads;

  -- … los execute $mN$ generados …

  v_esperada := replace(replace(v_vieja, '<expr vieja 1>', '<expr nueva 1>'), '<expr vieja 2>', '<expr nueva 2>');
  v_igual    := (v_esperada = pg_get_functiondef('public.mi_funcion()'::regprocedure));

  -- salida fila por fila: ¿cambió algo que NO era el objetivo?
  select count(*) filter (where n.nuevo is distinct from a.viejo and a.viejo not in (<objetivo>))
    into v_tocados_de_mas
    from _antes a cross join lateral (select public.mi_label(a.id) as nuevo) n;

  perform public.mi_funcion();   -- compila y corre como el cron
  raise exception 'REPORTE igual=% tocados_de_mas=% …', v_igual, v_tocados_de_mas;
```

Medido en la `0095`: `def_igual=t`; 22 etiquetas objetivo cambiaron y **0 nombres
reales**; en los títulos cambiaron 62, y el reporte **explicó** los 40 que no
eran objetivo con su forma, sin datos personales: `(con espacios)->(texto)`, o
sea, nombres con espacios de más que ahora salen recortados. Sin esa columna de
forma, "40 tocados de más" hubiera parado el deploy o, peor, se hubiera ignorado.

Sumale los permisos antes y después (`has_function_privilege`), porque
`create or replace` conserva el ACL y es el momento de mirarlo (skill
`revocar-execute-incluye-public`). Y, como siempre, el paso 4: después del
bloque, confirmar que la función viva sigue siendo la vieja.

## Output esperado

- El SQL de la migración **verificado contra el esquema real** antes de que nadie lo aplique.
- Números medidos (`55 citas recuperadas`, `0 cruzadas`) para el PR y el backlog — no estimaciones.
- Confirmación explícita de que prod quedó intacta.

## Ejemplo

**Input:** migración `0044` que recupera respuestas citadas históricas desde `webhook_events_raw`.

**Output:**
```
citas_recuperadas ...................... 55
reenviados_citando_mal_esperado_0 ....... 0
citas_cruzadas_esperado_0 ............... 0
autocitas_esperado_0 .................... 0
-- tras el rollback --
citas_en_prod_esperado_0 ................ 0   ✅ prod intacta
```
Al aplicarla de verdad: **55**, idéntico. Cero sorpresas.

## Regla de oro

**Una migración sin probar es una hipótesis.** El esquema real tiene FKs, enums y funciones que tu memoria no tiene — y los datos reales tienen casos que tu cabeza no imaginó. Probala contra la base viva, revertila, y recién ahí pasala.
