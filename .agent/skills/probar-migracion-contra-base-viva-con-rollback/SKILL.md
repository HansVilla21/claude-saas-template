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
