-- =============================================================================
-- 0162 — Agenda propia, fase 2: el cliente reserva solo desde la página
-- =============================================================================
-- La página `/r/<negocio>/<servicio>` (diseñada el 2026-10-25 con REA OS) deja
-- que un cliente elija un horario libre y reserve, sin sesión. Esta migración
-- es la base de eso:
--
--   · `appointments` suma lo que trae una reserva: de dónde vino (`source`), el
--     link para gestionarla (guardado como hash), lo que escribió el cliente
--     (nombre, correo, WhatsApp, su zona, sus respuestas), los márgenes del
--     servicio CONGELADOS y los motivos de cancelar o mover.
--   · `booking_types` suma el interruptor «Se puede reservar por la página» y
--     la regla de cambio: hasta cuánto antes se puede mover o cancelar.
--   · `booking_type_questions`: las preguntas del formulario de cada servicio.
--     La cita guarda cada respuesta JUNTO con su pregunta, tal como estaba al
--     reservar: si mañana el negocio la cambia o la borra, la respuesta vieja
--     sigue diciendo a qué contestó.
--   · `booking_attempts`: cada intento de reservar, para frenar a un robot.
--   · Tres funciones: reservar, mover y cancelar, sin que dos personas agarren
--     la misma hora.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUÉ DOS PERSONAS NO PUEDEN AGARRAR LA MISMA HORA
-- ─────────────────────────────────────────────────────────────────────────────
-- El motor (`src/lib/reservas/motor.ts`) decide qué horarios se ofrecen y el
-- servidor lo vuelve a correr justo antes de reservar (`estaLibre`). Pero entre
-- esa revisión y el insert, otra persona pudo reservar lo mismo. Eso lo cierra
-- la base: `reservas_elegir_recurso` toma un candado por servicio y por cada
-- persona o espacio candidato (`pg_advisory_xact_lock`, siempre en el mismo
-- orden para que dos reservas no se esperen en cruz), y BAJO EL CANDADO vuelve
-- a mirar las citas: choques con los márgenes, cupo y límite del día, con las
-- mismas reglas del motor. Recién ahí inserta. La segunda reserva espera a que
-- la primera confirme y entonces la ve.
--
-- Lo demás que mira el motor (horario, feriados, aviso mínimo, ventana) no
-- cambia entre la revisión y el insert, así que no se repite acá.
--
-- La agenda MANUAL no toma el candado, a propósito: la 0078 decidió que el
-- equipo puede encimar citas (con aviso en la pantalla). Lo que no puede pasar
-- es que dos CLIENTES se pisen.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- QUIÉN LLAMA ESTAS FUNCIONES
-- ─────────────────────────────────────────────────────────────────────────────
-- Solo el servidor, con el cliente de servicio (`service_role`), después de
-- validar el negocio, el servicio, el formulario y el antibot. Nadie con sesión
-- ni anónimo las puede ejecutar (revoke a public, anon y authenticated: en
-- Postgres toda función nace ejecutable por PUBLIC, ver 0096).
-- `booking_attempts` no tiene policies: es deny-all A PROPÓSITO. Solo la leen y
-- la escriben estas funciones y el servidor. No "arreglarlo" con una policy.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ORDEN DE DESPLIEGUE Y CÓMO REVERTIR
-- ─────────────────────────────────────────────────────────────────────────────
-- Aditiva: columnas con default, tablas y funciones nuevas. Las 76 citas que
-- existen quedan `source = 'manual'`, sin token, sin márgenes. Se aplica ANTES
-- del código (el preview usa la misma base), y con la 0161 ya aplicada.
-- `limpiar_registros_viejos` se reemplaza con UN paso más (borra los intentos de
-- más de 30 días); el resto es idéntico a la 0155.
-- Para revertir, primero sacar el código y después:
--   drop function if exists public.reservas_reservar, public.reservas_mover,
--     public.reservas_cancelar, public.reservas_elegir_recurso, public.reservas_rechazo;
--   drop table if exists public.booking_attempts, public.booking_type_questions;
--   alter table public.booking_types drop column if exists public_booking,
--     drop column if exists change_min_notice_min;
--   alter table public.appointments drop column if exists source, … (las 12 de abajo);
--   y volver a crear limpiar_registros_viejos desde la 0155.
-- =============================================================================

-- ── La cita: lo que trae una reserva ─────────────────────────────────────────
alter table public.appointments
    add column if not exists source text not null default 'manual',
    add column if not exists manage_token_hash text,
    add column if not exists invitee_name text,
    add column if not exists invitee_email citext,
    add column if not exists invitee_phone text,
    add column if not exists invitee_timezone text,
    add column if not exists answers jsonb not null default '[]'::jsonb,
    add column if not exists buffer_before_min int not null default 0,
    add column if not exists buffer_after_min int not null default 0,
    add column if not exists cancel_reason text,
    add column if not exists cancelled_by text,
    add column if not exists reschedule_reason text;

alter table public.appointments
    add constraint appointments_source_valido check (source in ('manual', 'pagina', 'bot')),
    -- sha256 en hex. El link nunca se guarda en claro: quien lea la base no
    -- puede cancelarle la cita a nadie.
    add constraint appointments_token_forma check (manage_token_hash is null or manage_token_hash ~ '^[0-9a-f]{64}$'),
    add constraint appointments_invitado_forma check (
        (invitee_name is null or length(invitee_name) between 1 and 120)
        and (invitee_email is null or length(invitee_email) <= 254)
        -- Solo dígitos con el código de país, como `leads.whatsapp_phone`.
        and (invitee_phone is null or invitee_phone ~ '^[0-9]{8,15}$')
        and (invitee_timezone is null or length(invitee_timezone) <= 64)),
    add constraint appointments_respuestas_lista check (jsonb_typeof(answers) = 'array'),
    add constraint appointments_margenes_validos check (
        buffer_before_min between 0 and 240 and buffer_after_min between 0 and 240),
    add constraint appointments_motivos_validos check (
        (cancel_reason is null or length(cancel_reason) <= 500)
        and (reschedule_reason is null or length(reschedule_reason) <= 500)
        and (cancelled_by is null or cancelled_by in ('invitee', 'team')));

create unique index if not exists appointments_token_unico
    on public.appointments (manage_token_hash) where manage_token_hash is not null;

comment on column public.appointments.source is
  '0162: de dónde vino la cita. manual = la agendó el equipo; pagina = la reservó el cliente en /r/<negocio>; bot = la reservó el bot (fase 5).';
comment on column public.appointments.manage_token_hash is
  '0162: sha256 (hex) del link /r/cita/<token> para cambiar la hora o cancelar. El token en claro solo lo tiene el cliente.';
comment on column public.appointments.answers is
  '0162: respuestas del formulario, cada una con su pregunta tal como estaba al reservar: [{pregunta, tipo, respuesta}].';
comment on column public.appointments.buffer_before_min is
  '0162: margen antes del servicio, congelado al reservar. Si el negocio lo cambia después, esta cita sigue ocupando lo que ocupaba.';

-- ── El servicio: página pública y regla de cambio ────────────────────────────
alter table public.booking_types
    add column if not exists public_booking boolean not null default false,
    add column if not exists change_min_notice_min int;

alter table public.booking_types
    add constraint booking_types_aviso_cambio_valido
        check (change_min_notice_min is null or change_min_notice_min between 0 and 43200);

comment on column public.booking_types.public_booking is
  '0162: «Se puede reservar por la página». Apagado, el servicio no aparece en /r/<negocio> ni se puede reservar.';
comment on column public.booking_types.change_min_notice_min is
  '0162: hasta cuántos minutos antes el cliente puede mover o cancelar con su link. null = hasta que empieza.';

-- ── Las preguntas del formulario ─────────────────────────────────────────────
create table if not exists public.booking_type_questions (
    id               uuid primary key default gen_random_uuid(),
    agency_id        uuid not null,
    booking_type_id  uuid not null,
    label            text not null check (length(btrim(label)) between 1 and 200),
    -- short_text = una línea; long_text = un párrafo; choice = una de la lista.
    kind             text not null default 'short_text' check (kind in ('short_text', 'long_text', 'choice')),
    options          jsonb not null default '[]'::jsonb,
    required         boolean not null default false,
    position         int not null default 0,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) <= 20),
    check (kind <> 'choice' or jsonb_array_length(options) >= 2),
    foreign key (booking_type_id, agency_id)
        references public.booking_types(id, agency_id) on delete cascade
);

comment on table public.booking_type_questions is
  '0162: preguntas del formulario de reserva de cada servicio. La cita copia la pregunta junto a la respuesta (appointments.answers).';

alter table public.booking_type_questions enable row level security;
create policy booking_type_questions_select on public.booking_type_questions for select
    using (public.is_member_of(agency_id) or public.is_master());
-- Escribir, solo desde Configuración con el cliente de servicio, como la 0159.
revoke all on public.booking_type_questions from anon;
revoke insert, update, delete, truncate on public.booking_type_questions from authenticated;

create trigger trg_set_updated_at before update on public.booking_type_questions
    for each row execute function public.set_updated_at();

-- ── Los intentos de reservar (antibot) ───────────────────────────────────────
create table if not exists public.booking_attempts (
    id               uuid primary key default gen_random_uuid(),
    agency_id        uuid not null references public.agencies(id) on delete cascade,
    booking_type_id  uuid,
    -- sha256 de la IP con un secreto del servidor: sirve para contar, no para
    -- saber quién es.
    ip_hash          text,
    phone            text,
    result           text not null check (result in (
                       'ok', 'ocupado', 'limite', 'trampa', 'invalido', 'servicio',
                       'no_existe', 'no_activa', 'fuera_de_plazo')),
    created_at       timestamptz not null default now()
);

-- Para el tope por IP de la última hora. Tabla nueva y vacía: no hay un antes
-- que medir (AGENTS.md §7.2), y sin índice cada reserva leería la tabla entera.
create index if not exists booking_attempts_ip_idx
    on public.booking_attempts (ip_hash, created_at) where ip_hash is not null;

comment on table public.booking_attempts is
  '0162: cada intento de reservar, mover o cancelar desde la página, con su resultado. Para el tope por IP. Sin policies a propósito (deny-all): solo el servidor. Se borra a los 30 días (limpiar_registros_viejos).';

alter table public.booking_attempts enable row level security;
revoke all on public.booking_attempts from anon, authenticated;

-- ── Anotar un rechazo y devolverlo ───────────────────────────────────────────
create or replace function public.reservas_rechazo(
    p_agency_id uuid,
    p_booking_type_id uuid,
    p_ip_hash text,
    p_telefono text,
    p_motivo text
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $fn$
  insert into public.booking_attempts (agency_id, booking_type_id, ip_hash, phone, result)
  values (p_agency_id, p_booking_type_id, p_ip_hash, nullif(p_telefono, ''), p_motivo)
  returning jsonb_build_object('ok', false, 'motivo', p_motivo);
$fn$;

-- ── Elegir quién atiende, sin pisarse ────────────────────────────────────────
-- Toma los candados y devuelve el primer candidato libre, en el orden en que
-- vienen (el del servicio). null si ninguno. Las reglas son las del motor:
--   · lo ocupado se agranda con SUS márgenes congelados más los del servicio;
--   · con cupo, las reservas del MISMO servicio en el MISMO inicio comparten el
--     horario hasta llenarlo; cualquier otro inicio que se les pise choca;
--   · el día que llegó al límite no se reserva (reservas distintas por quien
--     atiende e inicio, en la zona del horario de quien atiende);
--   · una cita ocupa a su recurso y, si tiene encargado, a esa persona (así
--     cuentan también las citas a mano, ver `ocupadosDeCitas`).
-- `p_excluir` es la cita que se mueve: no choca consigo misma.
create or replace function public.reservas_elegir_recurso(
    p_agency_id uuid,
    p_booking_type_id uuid,
    p_recursos uuid[],
    p_inicio timestamptz,
    p_excluir uuid,
    out o_recurso uuid,
    out o_usuario uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  s public.booking_types%rowtype;
  v_fin timestamptz;
  v_recurso uuid;
  v_usuario uuid;
  v_zona text;
  v_dia date;
  v_en_el_dia int;
begin
  select * into s from public.booking_types where id = p_booking_type_id and agency_id = p_agency_id;
  if not found or p_recursos is null then
    return;
  end if;
  v_fin := p_inicio + make_interval(mins => s.duration_min);

  -- Candados: primero el servicio (por el límite del día, que cruza a todos
  -- los que atienden), después cada candidato en orden de id. Siempre el mismo
  -- orden: dos reservas con candidatos en distinto orden no se traban.
  perform pg_advisory_xact_lock(hashtextextended('reservas:servicio:' || s.id::text, 0));
  for v_recurso in select distinct r from unnest(p_recursos) as u(r) order by r loop
    perform pg_advisory_xact_lock(hashtextextended('reservas:recurso:' || v_recurso::text, 0));
  end loop;

  for v_recurso in select u.r from unnest(p_recursos) with ordinality as u(r, n) order by u.n loop
    -- Que de verdad atienda este servicio, en este negocio, y esté activo.
    select br.user_id, sch.timezone into v_usuario, v_zona
      from public.booking_resources br
      join public.booking_type_resources btr
        on btr.resource_id = br.id and btr.booking_type_id = s.id and btr.agency_id = p_agency_id
      join public.availability_schedules sch on sch.id = br.schedule_id
     where br.id = v_recurso and br.agency_id = p_agency_id and br.active;
    continue when not found;

    if s.daily_limit is not null then
      v_dia := (p_inicio at time zone v_zona)::date;
      select count(distinct (coalesce(a.resource_id::text, a.assigned_user_id::text, a.id::text), a.starts_at))
        into v_en_el_dia
        from public.appointments a
       where a.agency_id = p_agency_id
         and a.booking_type_id = s.id
         and a.status in ('scheduled', 'done')
         and a.id is distinct from p_excluir
         and a.starts_at >= (v_dia::timestamp at time zone v_zona)
         and a.starts_at < ((v_dia + 1)::timestamp at time zone v_zona);
      continue when v_en_el_dia >= s.daily_limit;
    end if;

    continue when exists (
      select 1 from public.appointments a
       where a.agency_id = p_agency_id
         and a.status in ('scheduled', 'done')
         and a.id is distinct from p_excluir
         and (a.resource_id = v_recurso or (v_usuario is not null and a.assigned_user_id = v_usuario))
         and a.starts_at - make_interval(mins => a.buffer_before_min + s.buffer_after_min) < v_fin
         and a.ends_at + make_interval(mins => a.buffer_after_min + s.buffer_before_min) > p_inicio
         and not (s.seats_per_slot > 1 and a.booking_type_id = s.id and a.starts_at = p_inicio)
    );

    if s.seats_per_slot > 1 then
      continue when (
        select count(*) from public.appointments a
         where a.agency_id = p_agency_id
           and a.status in ('scheduled', 'done')
           and a.id is distinct from p_excluir
           and a.booking_type_id = s.id
           and a.starts_at = p_inicio
           and (a.resource_id = v_recurso or (v_usuario is not null and a.assigned_user_id = v_usuario))
      ) >= s.seats_per_slot;
    end if;

    o_recurso := v_recurso;
    o_usuario := v_usuario;
    return;
  end loop;
end;
$fn$;

-- ── Reservar ─────────────────────────────────────────────────────────────────
-- Devuelve {ok: true, cita_id, lead_id, lead_nuevo, recurso_id, usuario_id,
-- conversation_id, inicio, fin} o {ok: false, motivo}. Motivos:
--   limite   → muchos intentos desde esa IP, o ese WhatsApp ya tiene 5 reservas
--              por venir en el negocio;
--   invalido → nombre, WhatsApp o correo con mala forma (el servidor ya los
--              validó: llegar acá así es un bug o alguien saltándose la página);
--   servicio → no existe, está archivado, apagado o sin página pública;
--   ocupado  → otro lo agarró, o ya pasó.
create or replace function public.reservas_reservar(
    p_agency_id uuid,
    p_booking_type_id uuid,
    p_recursos uuid[],
    p_inicio timestamptz,
    p_nombre text,
    p_telefono text,
    p_correo text,
    p_zona_cliente text,
    p_respuestas jsonb,
    p_token_hash text,
    p_ip_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  s public.booking_types%rowtype;
  v_nombre text := nullif(btrim(p_nombre), '');
  v_tel text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  v_correo text := nullif(lower(btrim(p_correo)), '');
  v_recurso uuid;
  v_usuario uuid;
  v_fin timestamptz;
  v_lead uuid;
  v_lead_nuevo boolean := false;
  v_conv uuid;
  v_cita uuid;
begin
  if p_ip_hash is not null and (
    select count(*) from public.booking_attempts
     where ip_hash = p_ip_hash and created_at > now() - interval '1 hour'
  ) >= 20 then
    return public.reservas_rechazo(p_agency_id, p_booking_type_id, p_ip_hash, v_tel, 'limite');
  end if;

  if v_nombre is null or length(v_nombre) > 120
     or v_tel !~ '^[0-9]{8,15}$'
     or v_correo is null or length(v_correo) > 254 or v_correo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(coalesce(p_respuestas, '[]'::jsonb)) <> 'array' then
    return public.reservas_rechazo(p_agency_id, p_booking_type_id, p_ip_hash, v_tel, 'invalido');
  end if;

  select * into s from public.booking_types
   where id = p_booking_type_id and agency_id = p_agency_id
     and archived_at is null and active and public_booking;
  if not found then
    return public.reservas_rechazo(p_agency_id, p_booking_type_id, p_ip_hash, v_tel, 'servicio');
  end if;

  if (
    select count(*) from public.appointments a
     where a.agency_id = p_agency_id and a.source = 'pagina' and a.status = 'scheduled'
       and a.invitee_phone = v_tel and a.starts_at > now()
  ) >= 5 then
    return public.reservas_rechazo(p_agency_id, s.id, p_ip_hash, v_tel, 'limite');
  end if;

  if p_inicio <= now() then
    return public.reservas_rechazo(p_agency_id, s.id, p_ip_hash, v_tel, 'ocupado');
  end if;

  select o_recurso, o_usuario into v_recurso, v_usuario
    from public.reservas_elegir_recurso(p_agency_id, s.id, p_recursos, p_inicio, null);
  if v_recurso is null then
    return public.reservas_rechazo(p_agency_id, s.id, p_ip_hash, v_tel, 'ocupado');
  end if;
  v_fin := p_inicio + make_interval(mins => s.duration_min);

  -- El contacto: el que ya tiene ese WhatsApp en el negocio (se guardan con y
  -- sin '+'), o uno nuevo. No se pisa lo que el negocio ya cargó: el correo se
  -- completa si faltaba y el nombre solo si era el relleno. El nombre que la
  -- persona escribió de su puño es un nombre confirmado (0137).
  select l.id into v_lead from public.leads l
   where l.agency_id = p_agency_id and l.deleted_at is null
     and l.whatsapp_phone in (v_tel, '+' || v_tel)
   order by l.created_at
   limit 1;

  if v_lead is null then
    insert into public.leads (agency_id, full_name, phone, whatsapp_phone, email, source, source_detail,
                              nombre_confirmado, first_contact_at)
    values (p_agency_id, v_nombre, v_tel, v_tel, v_correo, 'sitio_web', 'Página de reservas', true, now())
    on conflict (agency_id, whatsapp_phone) where deleted_at is null and whatsapp_phone is not null do nothing
    returning id into v_lead;
    if v_lead is null then
      select l.id into v_lead from public.leads l
       where l.agency_id = p_agency_id and l.deleted_at is null and l.whatsapp_phone = v_tel;
    else
      v_lead_nuevo := true;
    end if;
  else
    update public.leads l set
        email = coalesce(l.email, v_correo::citext),
        full_name = case when nullif(btrim(l.full_name), '') is null
                           or btrim(l.full_name) in ('Lead sin nombre', 'Contacto de Instagram', 'Contacto de Messenger')
                         then v_nombre else l.full_name end,
        nombre_confirmado = case when nullif(btrim(l.full_name), '') is null
                                   or btrim(l.full_name) in ('Lead sin nombre', 'Contacto de Instagram', 'Contacto de Messenger')
                                 then true else l.nombre_confirmado end
     where l.id = v_lead
       and (l.email is null
            or nullif(btrim(l.full_name), '') is null
            or btrim(l.full_name) in ('Lead sin nombre', 'Contacto de Instagram', 'Contacto de Messenger'));
  end if;

  select c.id into v_conv from public.conversations c
   where c.agency_id = p_agency_id and c.lead_id = v_lead and c.channel = 'whatsapp';

  insert into public.appointments (
      agency_id, lead_id, conversation_id, title, location, starts_at, ends_at, status,
      assigned_user_id, resource_id, booking_type_id, source, manage_token_hash,
      invitee_name, invitee_email, invitee_phone, invitee_timezone, answers,
      buffer_before_min, buffer_after_min)
  values (
      p_agency_id, v_lead, v_conv, s.name, s.location_text, p_inicio, v_fin, 'scheduled',
      v_usuario, v_recurso, s.id, 'pagina', p_token_hash,
      v_nombre, v_correo, v_tel, left(p_zona_cliente, 64), coalesce(p_respuestas, '[]'::jsonb),
      s.buffer_before_min, s.buffer_after_min)
  returning id into v_cita;

  insert into public.booking_attempts (agency_id, booking_type_id, ip_hash, phone, result)
  values (p_agency_id, s.id, p_ip_hash, v_tel, 'ok');

  return jsonb_build_object(
    'ok', true, 'cita_id', v_cita, 'lead_id', v_lead, 'lead_nuevo', v_lead_nuevo,
    'recurso_id', v_recurso, 'usuario_id', v_usuario, 'conversation_id', v_conv,
    'inicio', p_inicio, 'fin', v_fin);
end;
$fn$;

-- ── Mover (con el link) ──────────────────────────────────────────────────────
-- Mueve LA MISMA cita (decisión del 2026-10-25): así la 0123 la cuenta como
-- reagendada y la ficha sigue mostrando una sola. Puede cambiar quién atiende
-- si la persona original no está libre en la hora nueva. Los márgenes se
-- vuelven a congelar con los del servicio de hoy.
-- Motivos extra: no_existe, no_activa (cancelada, hecha o no llegó),
-- fuera_de_plazo (pasó el límite del servicio para cambiar).
create or replace function public.reservas_mover(
    p_token_hash text,
    p_recursos uuid[],
    p_inicio timestamptz,
    p_motivo text,
    p_ip_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  c public.appointments%rowtype;
  s public.booking_types%rowtype;
  v_recurso uuid;
  v_usuario uuid;
  v_fin timestamptz;
begin
  select * into c from public.appointments
   where manage_token_hash = p_token_hash and p_token_hash ~ '^[0-9a-f]{64}$'
   for update;
  -- Sin cita no hay negocio al que anotarle el intento. Adivinar un token de
  -- 256 bits no es un ataque posible, así que no hace falta contarlo.
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'no_existe');
  end if;

  if p_ip_hash is not null and (
    select count(*) from public.booking_attempts
     where ip_hash = p_ip_hash and created_at > now() - interval '1 hour'
  ) >= 20 then
    return public.reservas_rechazo(c.agency_id, c.booking_type_id, p_ip_hash, c.invitee_phone, 'limite');
  end if;

  if c.status <> 'scheduled' then
    return public.reservas_rechazo(c.agency_id, c.booking_type_id, p_ip_hash, c.invitee_phone, 'no_activa');
  end if;

  select * into s from public.booking_types
   where id = c.booking_type_id and agency_id = c.agency_id and archived_at is null and active;
  if not found then
    return public.reservas_rechazo(c.agency_id, c.booking_type_id, p_ip_hash, c.invitee_phone, 'servicio');
  end if;

  -- La regla se mide contra la hora que la cita TIENE, no contra la nueva.
  if now() > c.starts_at - make_interval(mins => coalesce(s.change_min_notice_min, 0)) then
    return public.reservas_rechazo(c.agency_id, s.id, p_ip_hash, c.invitee_phone, 'fuera_de_plazo');
  end if;

  if p_inicio <= now() then
    return public.reservas_rechazo(c.agency_id, s.id, p_ip_hash, c.invitee_phone, 'ocupado');
  end if;

  select o_recurso, o_usuario into v_recurso, v_usuario
    from public.reservas_elegir_recurso(c.agency_id, s.id, p_recursos, p_inicio, c.id);
  if v_recurso is null then
    return public.reservas_rechazo(c.agency_id, s.id, p_ip_hash, c.invitee_phone, 'ocupado');
  end if;
  v_fin := p_inicio + make_interval(mins => s.duration_min);

  update public.appointments set
      starts_at = p_inicio,
      ends_at = v_fin,
      resource_id = v_recurso,
      assigned_user_id = v_usuario,
      buffer_before_min = s.buffer_before_min,
      buffer_after_min = s.buffer_after_min,
      reschedule_reason = left(nullif(btrim(p_motivo), ''), 500)
   where id = c.id;

  insert into public.booking_attempts (agency_id, booking_type_id, ip_hash, phone, result)
  values (c.agency_id, s.id, p_ip_hash, c.invitee_phone, 'ok');

  return jsonb_build_object(
    'ok', true, 'cita_id', c.id, 'lead_id', c.lead_id, 'recurso_id', v_recurso, 'usuario_id', v_usuario,
    'usuario_anterior', c.assigned_user_id, 'inicio_anterior', c.starts_at, 'inicio', p_inicio, 'fin', v_fin);
end;
$fn$;

-- ── Cancelar (con el link) ───────────────────────────────────────────────────
create or replace function public.reservas_cancelar(
    p_token_hash text,
    p_motivo text,
    p_ip_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  c public.appointments%rowtype;
  v_regla int;
begin
  select * into c from public.appointments
   where manage_token_hash = p_token_hash and p_token_hash ~ '^[0-9a-f]{64}$'
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'no_existe');
  end if;

  if p_ip_hash is not null and (
    select count(*) from public.booking_attempts
     where ip_hash = p_ip_hash and created_at > now() - interval '1 hour'
  ) >= 20 then
    return public.reservas_rechazo(c.agency_id, c.booking_type_id, p_ip_hash, c.invitee_phone, 'limite');
  end if;

  if c.status <> 'scheduled' then
    return public.reservas_rechazo(c.agency_id, c.booking_type_id, p_ip_hash, c.invitee_phone, 'no_activa');
  end if;

  -- Un servicio archivado igual deja cancelar: la regla es la que tenía.
  select change_min_notice_min into v_regla from public.booking_types
   where id = c.booking_type_id and agency_id = c.agency_id;
  if now() > c.starts_at - make_interval(mins => coalesce(v_regla, 0)) then
    return public.reservas_rechazo(c.agency_id, c.booking_type_id, p_ip_hash, c.invitee_phone, 'fuera_de_plazo');
  end if;

  update public.appointments set
      status = 'cancelled',
      cancel_reason = left(nullif(btrim(p_motivo), ''), 500),
      cancelled_by = 'invitee'
   where id = c.id;

  insert into public.booking_attempts (agency_id, booking_type_id, ip_hash, phone, result)
  values (c.agency_id, c.booking_type_id, p_ip_hash, c.invitee_phone, 'ok');

  return jsonb_build_object(
    'ok', true, 'cita_id', c.id, 'lead_id', c.lead_id, 'usuario_id', c.assigned_user_id,
    'recurso_id', c.resource_id, 'inicio', c.starts_at);
end;
$fn$;

-- Solo el servidor (cliente de servicio). La de elegir recurso ni eso: la
-- llaman las otras, que corren como su dueño.
revoke execute on function public.reservas_rechazo(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.reservas_elegir_recurso(uuid, uuid, uuid[], timestamptz, uuid) from public, anon, authenticated;
revoke execute on function public.reservas_reservar(uuid, uuid, uuid[], timestamptz, text, text, text, text, jsonb, text, text) from public, anon, authenticated;
revoke execute on function public.reservas_mover(text, uuid[], timestamptz, text, text) from public, anon, authenticated;
revoke execute on function public.reservas_cancelar(text, text, text) from public, anon, authenticated;
grant execute on function public.reservas_rechazo(uuid, uuid, text, text, text) to service_role;
grant execute on function public.reservas_reservar(uuid, uuid, uuid[], timestamptz, text, text, text, text, jsonb, text, text) to service_role;
grant execute on function public.reservas_mover(text, uuid[], timestamptz, text, text) to service_role;
grant execute on function public.reservas_cancelar(text, text, text) to service_role;

-- ── La limpieza diaria también borra los intentos viejos ─────────────────────
-- Copia de la 0155 con un paso más al final.
create or replace function public.limpiar_registros_viejos()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'cron'
as $fn$
declare
  v_eventos int := 0;
  v_cron int := 0;
  v_intentos int := 0;
  n int;
begin
  loop
    delete from public.webhook_events_raw w
     where w.id in (
       select e.id
         from public.webhook_events_raw e
        where e.received_at < now() - interval '30 days'
          and (e.processing_error is null or e.received_at < now() - interval '90 days')
        limit 5000
     );
    get diagnostics n = row_count;
    v_eventos := v_eventos + n;
    exit when n < 5000 or v_eventos >= 60000;
  end loop;

  delete from cron.job_run_details where end_time < now() - interval '7 days';
  get diagnostics v_cron = row_count;

  -- [0162] Los intentos de reservar sirven para el tope de la última hora.
  delete from public.booking_attempts where created_at < now() - interval '30 days';
  get diagnostics v_intentos = row_count;

  return jsonb_build_object('eventos_crudos', v_eventos, 'registro_cron', v_cron, 'intentos_reserva', v_intentos);
end;
$fn$;

comment on function public.limpiar_registros_viejos() is
  'Borra eventos crudos del webhook de más de 30 días (90 si tienen error), el registro de los crons de más de 7 días y los intentos de reservar de más de 30 días. Cron limpiar_registros_viejos, 03:30 CR. 0153, 0155, 0162.';

revoke all on function public.limpiar_registros_viejos() from public, anon, authenticated;
