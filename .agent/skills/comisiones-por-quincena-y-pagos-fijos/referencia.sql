-- Referencia de la skill comisiones-por-quincena-y-pagos-fijos.
--
-- Generalizado de un sistema en producción (Postgres / Supabase), probado con
-- control negativo. Los nombres son de ejemplo: adaptalos a tu esquema.
--   public.*  lo que lee la app (con RLS)
--   privado.* funciones internas (sin EXECUTE para public, anon ni authenticated)
--   interno.* tablas que la app no ve
-- Estados de una comisión: pendiente_config, calculada, aprobada, con_factura,
-- pagada, en_revision, anulada. `estado_previo` guarda de dónde vino una que pasó
-- a revisión o se anuló.

-- ── «Hoy», inyectable en las pruebas ─────────────────────────────────────────
-- Prueba: select set_config('app.hoy', '2026-10-29', true);  -- local a SU transacción
create function privado.hoy() returns date language sql stable set search_path = '' as $$
  select coalesce(nullif(current_setting('app.hoy', true), '')::date,
                  (now() at time zone 'America/Costa_Rica')::date)   -- la zona del negocio
$$;

-- ── El calendario ────────────────────────────────────────────────────────────
create table public.fechas_pago (
  id        uuid primary key default gen_random_uuid(),
  dia_pago  int not null check (dia_pago between 1 and 31),
  dia_corte int not null check (dia_corte between 1 and 31),
  activo    boolean not null default true
);
create unique index fechas_pago_un_dia on public.fechas_pago (dia_pago) where activo;
insert into public.fechas_pago (dia_pago, dia_corte) values (15, 15), (28, 28);  -- lo que el cliente usa HOY

-- La ÚNICA cuenta de qué factura le toca a una fecha: el primer corte >= la fecha.
-- Un día que el mes no tiene cae en el último. Corte > pago ⇒ se paga el mes siguiente.
create function privado.periodo_para(p_fecha date) returns table (pago date, corte date)
  language sql stable security definer set search_path = '' as $$
  with meses as (
    select (date_trunc('month', p_fecha::timestamp) + make_interval(months => k))::date as m
    from generate_series(-1, 2) k
  ), cand as (
    select (m + least(f.dia_corte, extract(day from m + interval '1 month' - interval '1 day')::int) - 1) as corte,
           case when f.dia_pago >= f.dia_corte
             then m + least(f.dia_pago, extract(day from m + interval '1 month' - interval '1 day')::int) - 1
             else (m + interval '1 month')::date
                  + least(f.dia_pago, extract(day from m + interval '2 month' - interval '1 day')::int) - 1
           end as pago
    from meses cross join public.fechas_pago f where f.activo
  )
  select c.pago, c.corte from cand c where c.corte >= p_fecha order by c.corte, c.pago limit 1
$$;

-- Las fechas de pago cuyo día de pago cae entre dos fechas.
create function privado.pagos_entre(p_desde date, p_hasta date) returns table (pago date, corte date)
  language plpgsql stable security definer set search_path = '' as $$
declare v_desde date := p_desde - 62; v_pago date; v_corte date; i int := 0;
begin
  loop
    select x.pago, x.corte into v_pago, v_corte from privado.periodo_para(v_desde) x;
    exit when v_corte is null or v_corte > p_hasta or i > 500;
    if v_pago between p_desde and p_hasta then pago := v_pago; corte := v_corte; return next; end if;
    v_desde := v_corte + 1; i := i + 1;
  end loop;
end $$;

-- Un fijo nace CON la fecha en que se paga: si esa fecha es un día de pago, su período
-- es ese (y no el siguiente por corte, como pasaría con un corte anterior al pago).
create function privado.periodo_para_fijo(p_fecha date) returns table (pago date, corte date)
  language plpgsql stable security definer set search_path = '' as $$
declare v_desde date := p_fecha - 62; v_pago date; v_corte date; i int := 0;
begin
  loop
    select x.pago, x.corte into v_pago, v_corte from privado.periodo_para(v_desde) x;
    exit when v_corte is null or v_corte > p_fecha or i > 24;
    if v_pago = p_fecha then pago := v_pago; corte := v_corte; return next; return; end if;
    v_desde := v_corte + 1; i := i + 1;
  end loop;
  return query select x.pago, x.corte from privado.periodo_para(p_fecha) x;
end $$;

create function privado.pago_anterior(p_pago date) returns date
  language sql stable security definer set search_path = '' as $$
  select max(x.pago) from privado.pagos_entre(p_pago - 62, p_pago - 1) x
$$;

-- ── La fecha de pago de cada comisión: se calcula una vez y se GUARDA ────────
alter table public.comisiones
  add column tipo text not null default 'comision' check (tipo in ('comision', 'fijo')),
  add column periodo_pago date,     -- la factura en la que entra
  add column periodo_corte date,
  add column periodo_nominal date;  -- la que le tocaba; si difiere, «llegó después de…»

-- Cerrado = tiene factura o ya se pagó, AUNQUE algo haya pasado a revisión o se haya anulado.
create function privado.grupo_cerrado(p_usuario uuid, p_pago date, p_excepto uuid) returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.comisiones k
    where k.usuario_id = p_usuario and k.periodo_pago = p_pago and k.id is distinct from p_excepto
      and (k.estado in ('con_factura', 'pagada')
           or (k.estado in ('en_revision', 'anulada') and k.estado_previo in ('con_factura', 'pagada'))))
$$;

create function privado.asignar_periodo() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare v_nom_pago date; v_nom_corte date; v_pago date; v_corte date; i int := 0;
begin
  -- Se recalcula al nacer, sin fecha, al cambiar de persona, al aprobarse, y al volver
  -- a estar por cobrar con otro estado, monto o fecha. Si no, conserva la que tenía.
  if tg_op = 'UPDATE' and old.periodo_pago is not null and new.periodo_pago is not null
     and old.usuario_id is not distinct from new.usuario_id
     and not (new.estado = 'aprobada' and old.estado is distinct from new.estado)
     and not (new.estado in ('calculada', 'pendiente_config')
              and (old.estado is distinct from new.estado or old.monto_usd is distinct from new.monto_usd
                   or old.fecha_pago is distinct from new.fecha_pago)) then
    new.periodo_pago := old.periodo_pago; new.periodo_corte := old.periodo_corte; new.periodo_nominal := old.periodo_nominal;
    return new;
  end if;
  if new.tipo = 'fijo' then
    select x.pago, x.corte into v_nom_pago, v_nom_corte from privado.periodo_para_fijo(new.fecha_pago) x;
  else
    select x.pago, x.corte into v_nom_pago, v_nom_corte from privado.periodo_para(new.fecha_pago) x;
  end if;
  v_pago := v_nom_pago; v_corte := v_nom_corte;
  -- Lo que todavía se puede cobrar no entra a un grupo cerrado: salta al siguiente.
  if new.estado in ('pendiente_config', 'calculada', 'aprobada') then
    while v_pago is not null and i < 24 and privado.grupo_cerrado(new.usuario_id, v_pago, new.id) loop
      select x.pago, x.corte into v_pago, v_corte from privado.periodo_para(v_corte + 1) x;
      i := i + 1;
    end loop;
  end if;
  new.periodo_pago := v_pago; new.periodo_corte := v_corte; new.periodo_nominal := v_nom_pago;
  return new;
end $$;
create trigger comisiones_periodo before insert or update on public.comisiones
  for each row execute function privado.asignar_periodo();

-- Al cambiar el calendario: lo abierto vuelve a pasar por el trigger.
create function privado.reasignar_periodos() returns int
  language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  update public.comisiones k set periodo_pago = null
  where k.estado in ('pendiente_config', 'calculada', 'aprobada')
    and not privado.grupo_cerrado(k.usuario_id, k.periodo_pago, k.id);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ── Los pagos fijos ──────────────────────────────────────────────────────────
-- pagos_fijos: monto, moneda, activo, persona_id (null = de la empresa), y:
--   frecuencia text check (frecuencia in ('dias', 'fechas_equipo')),
--   dias int[], meses int[] (null = todos), desde date,
--   modo text check (modo in ('automatico', 'confirmar'))

-- Unicidad por OCURRENCIA, nunca por mes (bug 1): un fijo «15 y 30» son dos.
create unique index movimientos_una_vez_por_ocurrencia on public.movimientos (pago_fijo_id, ocurrencia)
  where anulado_at is null and pago_fijo_id is not null;
create unique index comisiones_un_fijo_por_fecha on public.comisiones (pago_fijo_id, fecha_pago)
  where tipo = 'fijo' and estado <> 'anulada';   -- la anulada no ocupa su fecha: se regenera

-- La ÚNICA cuenta de cuándo toca cada pago fijo.
create function privado.ocurrencias(p_desde date, p_hasta date) returns table (pago_fijo_id uuid, fecha date)
  language sql stable security definer set search_path = '' as $$
  with fijos as (select f.* from public.pagos_fijos f where f.activo),
  meses as (select g::date as m from generate_series(date_trunc('month', p_desde::timestamp),
                                                     date_trunc('month', p_hasta::timestamp), interval '1 month') g),
  todas as (
    select f.id, (mm.m + least(d, extract(day from mm.m + interval '1 month' - interval '1 day')::int) - 1) as fecha, f.meses, f.desde
    from fijos f cross join meses mm cross join unnest(f.dias) d where f.frecuencia = 'dias'
    union all
    select f.id, p.pago, f.meses, f.desde
    from fijos f cross join privado.pagos_entre(p_desde, p_hasta) p where f.frecuencia = 'fechas_equipo'
  )
  select distinct t.id, t.fecha from todas t
  where t.fecha between p_desde and p_hasta and t.fecha >= t.desde
    and (t.meses is null or extract(month from t.fecha)::int = any (t.meses))
  order by 2, 1
$$;

-- Hasta dónde el barrido ya miró cada fijo: NADA se genera hacia atrás (bug 2).
create table interno.pagos_fijos_avance (
  pago_fijo_id uuid primary key references public.pagos_fijos(id),
  al_dia_hasta date not null
);

-- ¿Ya tiene lo de esa ocurrencia? «En cada fecha de pago» = cualquier fecha de SU PERÍODO (bug 3).
create function privado.fijo_ya_tiene(p_fijo uuid, p_fecha date, p_en_comisiones boolean) returns boolean
  language plpgsql stable security definer set search_path = '' as $$
declare v_desde date;
begin
  if (select frecuencia from public.pagos_fijos where id = p_fijo) = 'fechas_equipo' then
    v_desde := coalesce(privado.pago_anterior(p_fecha), p_fecha - 1);
  else
    v_desde := p_fecha - 1;
  end if;
  if p_en_comisiones then
    return exists (select 1 from public.comisiones k where k.pago_fijo_id = p_fijo and k.estado <> 'anulada'
                     and k.fecha_pago > v_desde and k.fecha_pago <= p_fecha);
  end if;
  -- Un egreso anulado A PROPÓSITO en esa misma fecha también cuenta: no vuelve.
  return exists (select 1 from public.movimientos m where m.pago_fijo_id = p_fijo
                   and m.ocurrencia > v_desde and m.ocurrencia <= p_fecha
                   and (m.anulado_at is null or m.ocurrencia = p_fecha));
end $$;

-- Anula lo que todavía se puede cobrar (nunca lo facturado ni lo pagado), posterior a
-- p_desde (null = todo). Devuelve la fecha más vieja que anuló.
create function privado.anular_lineas_abiertas(p_fijo uuid, p_motivo text, p_desde date) returns date
  language plpgsql security definer set search_path = '' as $$
declare v_min date;
begin
  with anuladas as (
    update public.comisiones set estado = 'anulada', estado_previo = estado, motivo = p_motivo
     where pago_fijo_id = p_fijo and tipo = 'fijo' and estado in ('pendiente_config', 'calculada', 'aprobada')
       and (p_desde is null or fecha_pago > p_desde)
    returning fecha_pago)
  select min(fecha_pago) into v_min from anuladas;
  return v_min;
end $$;

-- Al crear o editar un fijo: avance desde hoy; al editar, se regenera desde la línea
-- cobrable más vieja, aunque sea de una fecha ya pasada (bug 4).
create function privado.pago_fijo_cambiado() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare v_vieja date; v_avance date := greatest(new.desde, privado.hoy()) - 1;
begin
  if tg_op = 'UPDATE' and (old.frecuencia, old.dias, old.meses, old.modo, old.persona_id, old.monto, old.moneda, old.desde, old.activo)
                          is not distinct from
                          (new.frecuencia, new.dias, new.meses, new.modo, new.persona_id, new.monto, new.moneda, new.desde, new.activo) then
    return null;
  end if;
  if tg_op = 'UPDATE' then
    v_vieja := privado.anular_lineas_abiertas(new.id, 'Cambió el pago fijo: se volvió a generar con lo nuevo.', null);
    if v_vieja is not null then v_avance := least(v_avance, v_vieja - 1); end if;
  end if;
  insert into interno.pagos_fijos_avance values (new.id, v_avance)
  on conflict (pago_fijo_id) do update set al_dia_hasta = excluded.al_dia_hasta;
  return null;
end $$;
create trigger pagos_fijos_cambiado after insert or update on public.pagos_fijos
  for each row execute function privado.pago_fijo_cambiado();

-- El barrido (cada 5 minutos), para los fijos de una persona. El de la empresa es
-- igual, contra movimientos y solo con modo = 'automatico'.
--   desde = greatest(avance + 1, fijo.desde)
--   para cada ocurrencia entre desde y la próxima fecha de pago:
--     continue when privado.fijo_ya_tiene(fijo, fecha, true);
--     insert into comisiones (tipo 'fijo', …) … on conflict do nothing;
--     si el insert falla: el avance queda en fecha - 1 y se corta ese fijo (no salta el pago)
--   avance := hasta donde llegó
-- Y se cierra: revoke execute on function public.barrer_pagos_fijos() from public, anon, authenticated;

-- ── Cambiar el calendario (dentro de la RPC que lo guarda) ───────────────────
-- 1. ANTES de guardar, con el calendario VIEJO: la fecha de pago anterior al período abierto.
--      select privado.pago_anterior(min(x.pago)) into v_inicio from privado.pagos_entre(hoy, hoy + 62) x;
--      v_inicio := coalesce(v_inicio, hoy - 1);
-- 2. Guardar el calendario nuevo (desactivar el viejo, insertar el nuevo).
-- 3. Para cada fijo 'fechas_equipo': anular_lineas_abiertas(fijo, motivo, v_inicio)
--      y bajar su avance a least(al_dia_hasta, v_inicio).
-- 4. reasignar_periodos(); y correr el barrido de los fijos de personas.
-- fijo_ya_tiene por período evita el doble base; regenerar desde v_inicio evita perder uno.
