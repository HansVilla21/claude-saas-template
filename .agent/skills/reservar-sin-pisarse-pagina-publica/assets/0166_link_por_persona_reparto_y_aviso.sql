-- =============================================================================
-- 0166 · Agenda propia: un link por persona, el modo de reparto y la cita a mano
--        que le avisa al cliente
-- =============================================================================
-- Hans, 27-10, después de probar la agenda en Momentum:
--   · «es un link por servicio y no es como en Calendly, que es un link por
--     persona que atiende la llamada» → `/r/<negocio>/<servicio>/<persona>`:
--     solo los horarios de esa persona, y la cita le queda a ella. El link del
--     servicio sigue andando y reparte.
--   · «podemos agregar cómo queremos que sea el reparto: equitativo, que
--     prioriza una persona y luego otra» → `booking_types.reparto`.
--   · la cita a mano: «si el contacto tiene teléfono y correo, que se le envíe…
--     que se cree el evento y se le agregue a él al evento como invitación» →
--     `appointments.avisar_cliente`. Reemplaza la decisión B de la fase 3.
--
-- Qué trae:
--   1. `booking_resources.slug`: el final del link de cada persona (o espacio).
--      Sale solo del primer nombre («hans», «pietro»); si se repite en el
--      negocio, «maria-2». No cambia si la persona se cambia el nombre: un link
--      que ya se compartió no se rompe.
--   2. `booking_types.reparto`: 'prioridad' (el primero libre en el orden del
--      servicio, lo de siempre) o 'parejo' (el más atrasado). Arranca en
--      'prioridad': ningún servicio cambia de comportamiento.
--   3. `appointments.requested_resource_id`: la persona cuyo link se usó. Al
--      mover, esa cita solo puede ir con ella, y el parejo no la cuenta.
--   4. `appointments.avisar_cliente`:
--        true  → al cliente le llega todo: confirmación, invitación de Google
--                si quien atiende lo tiene conectado, recordatorios, cambios;
--        false → no le llega nada (una cita interna);
--        null  → una cita a mano anterior a esta migración: nadie eligió. Se
--                porta como hasta hoy (recordatorios sí, confirmación e
--                invitación no). Las nuevas nunca quedan en null.
--   5. `reservas_elegir_recurso`, con el parejo bajo el mismo candado del
--      servicio y `p_preferido` (al mover, primero quien ya la tiene).
--   6. `reservas_reservar` con `p_persona` (el link de una persona) y
--      `reservas_mover` que respeta a esa persona y prefiere a la actual.
--   7. El trigger de Google mira también `avisar_cliente`, y `cita_links`
--      acepta el origen 'aviso' (el link que va en un aviso del equipo).
--
-- El parejo cuenta, por persona y servicio, las citas que REPARTIÓ el link del
-- servicio (y el bot, fase 5) en los últimos 30 días, sin las canceladas. No
-- cuentan las del link de cada persona ni las cargadas a mano: el que consigue
-- sus propias citas no recibe menos del reparto (Hans, 27-10). Empate: el orden
-- del servicio.
--
-- Compatible con el código que corre hoy: `reservas_reservar` suma un parámetro
-- con default, y se borra la firma vieja para no dejar dos funciones (con las
-- dos, PostgREST no sabría a cuál llamar). El servidor de hoy la sigue llamando
-- con los 11 de siempre.
--
-- Rollback:
--   drop trigger if exists trg_booking_resources_slug on public.booking_resources;
--   drop function if exists public.tg_booking_resources_slug(), public.reservas_slug(text);
--   alter table public.booking_resources drop column if exists slug;
--   alter table public.booking_types drop column if exists reparto;
--   alter table public.appointments drop column if exists requested_resource_id,
--     drop column if exists avisar_cliente;
--   + volver a crear las funciones de la 0162/0165 y el trigger de la 0164.
-- =============================================================================

-- ── 1. El link de cada persona ───────────────────────────────────────────────
-- Un texto como va en un link: minúsculas, sin tildes, guiones. null si no queda nada.
create or replace function public.reservas_slug(p text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $fn$
  select nullif(btrim(left(regexp_replace(
           translate(lower(coalesce(p, '')), 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc'),
           '[^a-z0-9]+', '-', 'g'), 40), '-'), '')
$fn$;

alter table public.booking_resources
  add column if not exists slug text
  check (slug is null or (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 60));

create unique index if not exists booking_resources_slug_unico
  on public.booking_resources (agency_id, slug) where slug is not null;

-- Solo cuando falta: una vez puesto no cambia, aunque la persona cambie su nombre.
create or replace function public.tg_booking_resources_slug()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_base text;
  v_slug text;
  n int := 1;
begin
  if new.slug is not null then
    return new;
  end if;
  if new.kind = 'person' then
    select public.reservas_slug(split_part(btrim(coalesce(nullif(btrim(u.full_name), ''), split_part(u.email, '@', 1))), ' ', 1))
      into v_base
      from public.users u where u.id = new.user_id;
  else
    v_base := public.reservas_slug(new.name);
  end if;
  v_base := coalesce(v_base, case when new.kind = 'person' then 'persona' else 'espacio' end);
  v_slug := v_base;
  while exists (
    select 1 from public.booking_resources b
     where b.agency_id = new.agency_id and b.slug = v_slug and b.id <> new.id
  ) loop
    n := n + 1;
    v_slug := v_base || '-' || n;
  end loop;
  new.slug := v_slug;
  return new;
end;
$fn$;

drop trigger if exists trg_booking_resources_slug on public.booking_resources;
create trigger trg_booking_resources_slug
  before insert or update on public.booking_resources
  for each row execute function public.tg_booking_resources_slug();

-- Los que ya existen, de a uno: cada update ve los slugs que puso el anterior
-- (en una sola sentencia, dos «maria» del mismo negocio chocarían).
do $$
declare r record;
begin
  for r in select id from public.booking_resources where slug is null order by agency_id, position, created_at loop
    update public.booking_resources set slug = null where id = r.id;
  end loop;
end $$;

-- ── 2. El modo de reparto ────────────────────────────────────────────────────
alter table public.booking_types
  add column if not exists reparto text not null default 'prioridad'
  check (reparto in ('prioridad', 'parejo'));

comment on column public.booking_types.reparto is
  '0166: con varias personas, quién se lleva la reserva del link del servicio. prioridad = el primero libre en el orden; parejo = el que menos citas repartidas tiene en 30 días (sin canceladas, sin las del link de cada persona ni las cargadas a mano).';

-- ── 3 y 4. La cita: a quién se pidió y si se le avisa al cliente ─────────────
alter table public.appointments
  add column if not exists requested_resource_id uuid,
  add column if not exists avisar_cliente boolean;

alter table public.appointments drop constraint if exists appointments_requested_resource_fk;
alter table public.appointments
  add constraint appointments_requested_resource_fk
  foreign key (requested_resource_id, agency_id)
  references public.booking_resources(id, agency_id) on delete set null (requested_resource_id);

-- Las reservas de la página siempre le avisaron al cliente. Las de a mano
-- quedan en null (ver el encabezado). Va ANTES de rehacer el trigger de Google,
-- para que el backfill no anote nada.
update public.appointments set avisar_cliente = true where source <> 'manual' and avisar_cliente is null;
alter table public.appointments alter column avisar_cliente set default true;

comment on column public.appointments.avisar_cliente is
  '0166: true = al cliente le llega todo (confirmación, invitación de Google, recordatorios, cambios); false = nada (cita interna); null = cita a mano anterior a la 0166, se porta como antes (recordatorios sí, confirmación e invitación no).';
comment on column public.appointments.requested_resource_id is
  '0166: la persona (o espacio) cuyo link se usó para reservar. La cita solo se mueve con ella y no cuenta para el reparto parejo.';

-- ── 5. Elegir quién atiende ──────────────────────────────────────────────────
drop function if exists public.reservas_elegir_recurso(uuid, uuid, uuid[], timestamptz, uuid);

-- Toma los candados y devuelve el primer candidato libre. El orden en que se
-- prueban:
--   1. `p_preferido` (al mover: quien ya tiene la cita), si viene;
--   2. con reparto 'parejo', el que menos citas repartidas tiene (ver arriba);
--   3. el orden en que vienen (el del servicio).
-- Las reglas de «libre» son las del motor, sin cambios desde la 0162:
--   · lo ocupado se agranda con SUS márgenes congelados más los del servicio;
--   · con cupo, las reservas del MISMO servicio en el MISMO inicio comparten el
--     horario hasta llenarlo; cualquier otro inicio que se les pise choca;
--   · el día que llegó al límite no se reserva (reservas distintas por quien
--     atiende e inicio, en la zona del horario de quien atiende);
--   · una cita ocupa a su recurso y, si tiene encargado, a esa persona.
-- El conteo del parejo corre DESPUÉS del candado del servicio: dos reservas al
-- mismo tiempo no ven el mismo conteo.
create or replace function public.reservas_elegir_recurso(
    p_agency_id uuid,
    p_booking_type_id uuid,
    p_recursos uuid[],
    p_inicio timestamptz,
    p_excluir uuid,
    p_preferido uuid default null,
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
  -- los que atienden, y por el conteo del parejo), después cada candidato en
  -- orden de id. Siempre el mismo orden: dos reservas no se traban.
  perform pg_advisory_xact_lock(hashtextextended('reservas:servicio:' || s.id::text, 0));
  for v_recurso in select distinct r from unnest(p_recursos) as u(r) order by r loop
    perform pg_advisory_xact_lock(hashtextextended('reservas:recurso:' || v_recurso::text, 0));
  end loop;

  for v_recurso in
    select u.r from unnest(p_recursos) with ordinality as u(r, n)
     order by (u.r is distinct from p_preferido),
              case when s.reparto = 'parejo' then (
                select count(*) from public.appointments a
                 where a.agency_id = p_agency_id
                   and a.booking_type_id = s.id
                   and a.resource_id = u.r
                   and a.requested_resource_id is null
                   and a.source in ('pagina', 'bot')
                   and a.status <> 'cancelled'
                   and a.created_at > now() - interval '30 days'
                   and a.id is distinct from p_excluir
              ) end,
              u.n
  loop
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

-- ── 6. Reservar (con el link del servicio o el de una persona) ───────────────
drop function if exists public.reservas_reservar(uuid, uuid, uuid[], timestamptz, text, text, text, text, jsonb, text, text);

-- Igual que en la 0165, más `p_persona`: el recurso cuyo link se usó. Con
-- `p_persona`, solo se prueba esa persona (si no está entre los candidatos que
-- dejó el motor, es «ocupado») y la cita queda pedida a ella.
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
    p_ip_hash text,
    p_persona uuid default null
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
  v_recursos uuid[];
  v_recurso uuid;
  v_usuario uuid;
  v_fin timestamptz;
  v_lead uuid;
  v_lead_nuevo boolean := false;
  v_conv uuid;
  v_cita uuid;
  v_etapa uuid;
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

  -- [0166] Con el link de una persona, solo ella.
  v_recursos := case
    when p_persona is null then p_recursos
    when p_persona = any (p_recursos) then array[p_persona]
    else array[]::uuid[]
  end;

  select o_recurso, o_usuario into v_recurso, v_usuario
    from public.reservas_elegir_recurso(p_agency_id, s.id, v_recursos, p_inicio, null);
  if v_recurso is null then
    return public.reservas_rechazo(p_agency_id, s.id, p_ip_hash, v_tel, 'ocupado');
  end if;
  v_fin := p_inicio + make_interval(mins => s.duration_min);

  -- El contacto: el que ya tiene ese WhatsApp en el negocio (se guardan con y
  -- sin '+'), o uno nuevo. El nombre que la persona escribió de su puño es un
  -- nombre confirmado (0137).
  select l.id into v_lead from public.leads l
   where l.agency_id = p_agency_id and l.deleted_at is null
     and l.whatsapp_phone in (v_tel, '+' || v_tel)
   order by l.created_at
   limit 1;

  if v_lead is null then
    -- [0163] Nace en el estado de entrada del negocio, como el contacto que
    -- llega por WhatsApp (`resolveInitialStageId` del webhook): el marcado
    -- `is_intake` (0039) y, si no hay, el primero de Principal.
    -- (`ps` y no `s`: `s` es la variable del servicio en esta función.)
    select ps.id into v_etapa from public.pipeline_stages ps
     where ps.agency_id = p_agency_id and ps.is_intake
     limit 1;
    if v_etapa is null then
      select ps.id into v_etapa from public.pipeline_stages ps
       where ps.agency_id = p_agency_id and ps.category_id is null
       order by ps.position
       limit 1;
    end if;
    insert into public.leads (agency_id, full_name, phone, whatsapp_phone, email, source, source_detail,
                              nombre_confirmado, first_contact_at, stage_id)
    values (p_agency_id, v_nombre, v_tel, v_tel, v_correo, 'sitio_web', 'Página de reservas', true, now(), v_etapa)
    on conflict (agency_id, whatsapp_phone) where deleted_at is null and whatsapp_phone is not null do nothing
    returning id into v_lead;
    if v_lead is null then
      select l.id into v_lead from public.leads l
       where l.agency_id = p_agency_id and l.deleted_at is null and l.whatsapp_phone = v_tel;
    else
      v_lead_nuevo := true;
    end if;
  else
    -- [0165] El nombre que la persona escribió al reservar reemplaza al del
    -- contacto, aunque lo haya puesto el equipo (Hans, 27-10). El correo, solo si
    -- no tenía: uno que ya estaba no se pisa.
    update public.leads l set
        email = coalesce(l.email, v_correo::citext),
        full_name = v_nombre
     where l.id = v_lead
       and (l.email is null or l.full_name is distinct from v_nombre);
    -- Aparte, a propósito: cuando cambia el nombre sin sesión (como acá), el
    -- trigger de la 0137 recalcula `nombre_confirmado` y lo dejaría en false si
    -- ya era true. Lo escribió la persona de su puño: va confirmado.
    update public.leads l set nombre_confirmado = true
     where l.id = v_lead and not l.nombre_confirmado;
  end if;

  select c.id into v_conv from public.conversations c
   where c.agency_id = p_agency_id and c.lead_id = v_lead and c.channel = 'whatsapp';

  insert into public.appointments (
      agency_id, lead_id, conversation_id, title, location, starts_at, ends_at, status,
      assigned_user_id, resource_id, booking_type_id, source, manage_token_hash,
      invitee_name, invitee_email, invitee_phone, invitee_timezone, answers,
      buffer_before_min, buffer_after_min, requested_resource_id, avisar_cliente)
  values (
      p_agency_id, v_lead, v_conv, s.name, s.location_text, p_inicio, v_fin, 'scheduled',
      v_usuario, v_recurso, s.id, 'pagina', p_token_hash,
      v_nombre, v_correo, v_tel, left(p_zona_cliente, 64), coalesce(p_respuestas, '[]'::jsonb),
      s.buffer_before_min, s.buffer_after_min, case when p_persona is not null then v_recurso end, true)
  returning id into v_cita;

  insert into public.booking_attempts (agency_id, booking_type_id, ip_hash, phone, result)
  values (p_agency_id, s.id, p_ip_hash, v_tel, 'ok');

  return jsonb_build_object(
    'ok', true, 'cita_id', v_cita, 'lead_id', v_lead, 'lead_nuevo', v_lead_nuevo,
    'recurso_id', v_recurso, 'usuario_id', v_usuario, 'conversation_id', v_conv,
    'inicio', p_inicio, 'fin', v_fin);
end;
$fn$;

-- ── 6 (cont.). Mover (con el link) ───────────────────────────────────────────
-- Igual que en la 0162, con dos cambios [0166]:
--   · primero se prueba a quien YA tiene la cita: si está libre a la hora nueva,
--     la cita sigue con esa persona (antes iba al primero libre del orden);
--   · si se reservó con el link de una persona, solo puede ir con ella.
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
  v_recursos uuid[];
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

  v_recursos := case
    when c.requested_resource_id is null then p_recursos
    when c.requested_resource_id = any (p_recursos) then array[c.requested_resource_id]
    else array[]::uuid[]
  end;

  select o_recurso, o_usuario into v_recurso, v_usuario
    from public.reservas_elegir_recurso(c.agency_id, s.id, v_recursos, p_inicio, c.id, c.resource_id);
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

-- ── Permisos ─────────────────────────────────────────────────────────────────
-- En Postgres toda función nace ejecutable por PUBLIC: el revoke va también ahí.
revoke execute on function public.reservas_slug(text) from public, anon, authenticated;
revoke execute on function public.tg_booking_resources_slug() from public, anon, authenticated;
revoke execute on function public.reservas_elegir_recurso(uuid, uuid, uuid[], timestamptz, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.reservas_reservar(uuid, uuid, uuid[], timestamptz, text, text, text, text, jsonb, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.reservas_mover(text, uuid[], timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.reservas_reservar(uuid, uuid, uuid[], timestamptz, text, text, text, text, jsonb, text, text, uuid) to service_role;
grant execute on function public.reservas_mover(text, uuid[], timestamptz, text, text) to service_role;

-- ── 7. Google mira también si se le avisa al cliente ─────────────────────────
-- La función del trigger (0164) no cambia: solo se suma la columna.
drop trigger if exists trg_google_calendar_citas on public.appointments;
create trigger trg_google_calendar_citas
  after insert or delete or update of
    starts_at, ends_at, status, assigned_user_id, resource_id, title, location,
    invitee_email, invitee_name, booking_type_id, lead_id, avisar_cliente
  on public.appointments
  for each row execute function public.tg_google_calendar_citas();

-- El link que va en un aviso del equipo (la cita a mano movida, por ejemplo).
alter table public.cita_links drop constraint if exists cita_links_origen_check;
alter table public.cita_links
  add constraint cita_links_origen_check check (origen in ('recordatorio', 'aviso'));
