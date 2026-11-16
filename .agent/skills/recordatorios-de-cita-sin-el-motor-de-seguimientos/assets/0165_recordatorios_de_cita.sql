-- =============================================================================
-- 0165 · Agenda propia, fase 4: los recordatorios de cita
-- =============================================================================
-- Hans, 27-10: los recordatorios se personalizan por negocio, "al igual que los
-- seguimientos": un interruptor, hasta 3 recordatorios con cuánto antes de la
-- cita, por dónde (WhatsApp, correo o los dos) y qué plantilla. Por defecto, 1
-- día antes por WhatsApp y correo, y 3 horas antes por WhatsApp.
--
-- NO pasan por el motor de seguimientos (`followups`). Ahí un recordatorio
-- tendría que saltarse 5 reglas del barrido (contestó, ventana de 24 h, horario
-- de 8 a 20, la pausa de 2 h por contacto, y `reemplazados`, que con flujo e
-- inscripción en null cancelaría un recordatorio contra un seguimiento manual
-- del mismo contacto). Cada excepción es un lugar donde se rompen los
-- seguimientos de los clientes. El barrido propio (`/api/cron/recordatorios`)
-- lee la CITA VIVA en el momento de mandar: una cita movida o cancelada no
-- puede recibir el recordatorio de su hora vieja.
--
-- Qué trae:
--   1. `recordatorio_config`  — el interruptor por negocio (arranca apagado).
--   2. `recordatorio_reglas`  — hasta 3 por negocio.
--   3. `recordatorio_envios`  — una fila por cita, recordatorio y hora de la
--      cita: el UNIQUE es lo que impide que salga dos veces, aunque dos pasadas
--      del cron se crucen. Si la cita se mueve, la hora nueva es otra fila.
--   4. `cita_links`           — los links extra para gestionar una cita. Cada
--      recordatorio lleva el suyo (la base guarda solo la huella, como 0162);
--      el de la confirmación sigue andando.
--   5. `reservas_reservar`    — el nombre que la persona escribe al reservar
--      reemplaza al del contacto, aunque lo haya puesto el equipo (Hans, 27-10),
--      y queda confirmado. El correo solo se completa si no tenía.
--   6. El cron cada 5 minutos, con su secreto generado en el Vault (patrón 0164).
-- =============================================================================

-- ── 1. El interruptor por negocio ────────────────────────────────────────────
create table public.recordatorio_config (
  agency_id    uuid primary key references public.agencies(id) on delete cascade,
  activo       boolean not null default false,
  -- Lo que venció ANTES de prender no se manda: prender no puede disparar de
  -- golpe los recordatorios de todas las citas de mañana.
  activado_at  timestamptz,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references public.users(id) on delete set null
);

comment on table public.recordatorio_config is
  '0165: recordatorios de cita, por negocio. Sin fila = apagados. Se escribe solo con el cliente de servicio (server action con gate).';

-- ── 2. Los recordatorios de cada negocio ─────────────────────────────────────
create table public.recordatorio_reglas (
  id                 uuid primary key default gen_random_uuid(),
  agency_id          uuid not null references public.agencies(id) on delete cascade,
  -- De 1 hora a 7 días antes de la cita.
  minutos_antes      integer not null check (minutos_antes between 60 and 10080),
  canal              text not null check (canal in ('whatsapp', 'correo', 'ambos')),
  -- null = la plantilla de la agenda (`recordatorio_cita`).
  -- (Postgres no acepta repeticiones de más de 255 en una regex: el largo va aparte.)
  template_name      text check (template_name is null or (template_name ~ '^[a-z0-9_]+$' and length(template_name) <= 512)),
  template_language  text not null default 'es' check (template_language ~ '^[a-zA-Z_]{2,10}$'),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (agency_id, minutos_antes)
);

create index recordatorio_reglas_agencia on public.recordatorio_reglas (agency_id);

comment on table public.recordatorio_reglas is
  '0165: hasta 3 recordatorios por negocio (trigger). minutos_antes = cuánto antes de la cita.';

-- Como mucho 3 por negocio. La pantalla ya no deja agregar un cuarto; esto es lo
-- que lo garantiza aunque dos pestañas agreguen a la vez.
create or replace function public.tg_recordatorio_reglas_tope()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  perform pg_advisory_xact_lock(hashtext('recordatorio_reglas:' || new.agency_id::text));
  if (select count(*) from public.recordatorio_reglas where agency_id = new.agency_id) >= 3 then
    raise exception 'recordatorios: como mucho 3 por negocio' using errcode = 'check_violation';
  end if;
  return new;
end;
$fn$;

create trigger trg_recordatorio_reglas_tope
  before insert on public.recordatorio_reglas
  for each row execute function public.tg_recordatorio_reglas_tope();

-- Guardar la configuración ENTERA de un negocio en una sola transacción: el
-- interruptor y la lista. La pantalla siempre manda las dos cosas, así no hay un
-- momento con la lista a medio cambiar (borrar y volver a crear en dos pedidos
-- dejaba al negocio sin recordatorios si el segundo fallaba). Prender anota
-- `activado_at` solo si estaba apagado: lo que venció mientras estaba apagado no
-- sale. Los ids cambian al guardar; nadie los guarda (los envíos van por minutos).
create or replace function public.recordatorios_guardar(
    p_agency_id uuid,
    p_activo boolean,
    p_reglas jsonb,
    p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if p_agency_id is null or p_activo is null or jsonb_typeof(p_reglas) is distinct from 'array' then
    raise exception 'recordatorios: datos inválidos' using errcode = 'check_violation';
  end if;
  perform pg_advisory_xact_lock(hashtext('recordatorio_config:' || p_agency_id::text));

  insert into public.recordatorio_config as rc (agency_id, activo, activado_at, updated_by)
  values (p_agency_id, p_activo, case when p_activo then now() end, p_user_id)
  on conflict (agency_id) do update set
    activo = excluded.activo,
    activado_at = case when excluded.activo and not rc.activo then now() else rc.activado_at end,
    updated_by = excluded.updated_by;

  delete from public.recordatorio_reglas where agency_id = p_agency_id;
  -- Los CHECK, el UNIQUE y el tope de 3 rechazan lo inválido, y la excepción
  -- deshace TODO (también el borrado de arriba).
  insert into public.recordatorio_reglas (agency_id, minutos_antes, canal, template_name, template_language)
  select p_agency_id,
         (r->>'minutos_antes')::int,
         r->>'canal',
         nullif(btrim(r->>'template_name'), ''),
         coalesce(nullif(btrim(r->>'template_language'), ''), 'es')
    from jsonb_array_elements(p_reglas) with ordinality as x(r, n)
   order by x.n;

  return jsonb_build_object(
    'ok', true,
    'activo', p_activo,
    'reglas', (select count(*) from public.recordatorio_reglas where agency_id = p_agency_id));
end;
$fn$;

-- ── 3. Lo que salió (o no) ───────────────────────────────────────────────────
create table public.recordatorio_envios (
  id               uuid primary key default gen_random_uuid(),
  agency_id        uuid not null references public.agencies(id) on delete cascade,
  appointment_id   uuid not null references public.appointments(id) on delete cascade,
  minutos_antes    integer not null,
  -- La hora que la cita TENÍA cuando se decidió: si se mueve, la nueva hora es
  -- otra fila y el recordatorio se vuelve a calcular.
  inicio_cita      timestamptz not null,
  -- El momento en que tocaba (con la regla de la noche aplicada).
  programado_para  timestamptz not null,
  estado           text not null check (estado in ('enviando', 'enviado', 'fallido', 'omitido')),
  motivo           text,
  -- Cómo le fue a cada canal: 'enviado', 'no_aplica', 'sin_contacto',
  -- 'sin_nombre', 'sin_correo', 'plantilla_no_aprobada' o 'error: …'.
  whatsapp         text,
  correo           text,
  message_id       uuid references public.messages(id) on delete set null,
  intentos         smallint not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (appointment_id, minutos_antes, inicio_cita)
);

create index recordatorio_envios_cita on public.recordatorio_envios (appointment_id);
create index recordatorio_envios_reintentos on public.recordatorio_envios (estado) where estado in ('enviando', 'fallido');

comment on table public.recordatorio_envios is
  '0165: cada recordatorio decidido. El UNIQUE (cita, minutos, hora de la cita) es lo que impide mandarlo dos veces.';

create trigger trg_set_updated_at before update on public.recordatorio_config
  for each row execute function public.set_updated_at();
create trigger trg_set_updated_at before update on public.recordatorio_reglas
  for each row execute function public.set_updated_at();
create trigger trg_set_updated_at before update on public.recordatorio_envios
  for each row execute function public.set_updated_at();

-- ── 4. Los links extra para gestionar una cita ───────────────────────────────
-- El token en claro solo existe al mandarlo (0162 guarda el sha256). Para que un
-- recordatorio lleve el link sin invalidar el de la confirmación, cada mensaje
-- lleva un token propio y acá queda su huella. Una cita cargada a mano no tiene
-- link: su primer recordatorio le pone el principal (`manage_token_hash`).
create table public.cita_links (
  token_hash      text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  appointment_id  uuid not null references public.appointments(id) on delete cascade,
  agency_id       uuid not null references public.agencies(id) on delete cascade,
  origen          text not null check (origen in ('recordatorio')),
  created_at      timestamptz not null default now()
);

create index cita_links_cita on public.cita_links (appointment_id);

comment on table public.cita_links is
  '0165: huellas (sha256) de links extra de /r/cita. DENY-ALL A PROPÓSITO: RLS sin policies, solo el cliente de servicio. No agregar una policy: con la huella no se cancela nada, pero listar qué citas tienen links no le sirve a nadie de afuera.';

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Lectura para los miembros del negocio (y master), escritura solo con el
-- cliente de servicio después del gate, como las tablas de la 0159.
alter table public.recordatorio_config enable row level security;
alter table public.recordatorio_reglas enable row level security;
alter table public.recordatorio_envios enable row level security;
alter table public.cita_links enable row level security;

create policy recordatorio_config_select on public.recordatorio_config for select
    using (public.is_member_of(agency_id) or public.is_master());
create policy recordatorio_reglas_select on public.recordatorio_reglas for select
    using (public.is_member_of(agency_id) or public.is_master());
create policy recordatorio_envios_select on public.recordatorio_envios for select
    using (public.is_member_of(agency_id) or public.is_master());

revoke all on public.cita_links from anon, authenticated;

-- ── 5. El nombre que la persona escribe al reservar ──────────────────────────
-- (al final del archivo: la función entera, copiada de la VIVA con un solo
-- cambio en el `update public.leads`).

-- ── 6. El cron ───────────────────────────────────────────────────────────────
do $vault$
begin
  if not exists (select 1 from vault.secrets where name = 'recordatorios_cron_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'recordatorios_cron_secret',
      'Secreto entre pg_cron y /api/cron/recordatorios (0165). La ruta lo lee con recordatorios_secreto_cron().');
  end if;
  if not exists (select 1 from vault.secrets where name = 'recordatorios_cron_url') then
    perform vault.create_secret(
      'https://crm.momentum-lab-ai.com/api/cron/recordatorios',
      'recordatorios_cron_url',
      'URL de /api/cron/recordatorios en producción (0165).');
  end if;
end
$vault$;

create or replace function public.recordatorios_secreto_cron()
returns text language sql security definer
set search_path = public, vault, extensions as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'recordatorios_cron_secret';
$$;

-- Solo despierta a la ruta si algún negocio los tiene prendidos y tiene citas
-- en la próxima semana (el recordatorio más largo es de 7 días), o si quedó un
-- envío para reintentar. Sin eso no sale ningún pedido.
create or replace function public.recordatorios_disparar()
returns bigint language plpgsql security definer
set search_path to 'public', 'extensions', 'vault' as $$
declare
  v_url text;
  v_secret text;
  v_req bigint;
begin
  if not exists (
    select 1
      from public.recordatorio_config c
      join public.appointments ap on ap.agency_id = c.agency_id
     where c.activo
       and exists (select 1 from public.recordatorio_reglas r where r.agency_id = c.agency_id)
       and ap.status = 'scheduled'
       and ap.starts_at > now()
       and ap.starts_at <= now() + interval '7 days 1 hour'
  ) then
    return null;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'recordatorios_cron_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'recordatorios_cron_secret';
  if v_url is null or v_secret is null then return null; end if;
  select net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    timeout_milliseconds := 55000
  ) into v_req;
  return v_req;
end $$;

do $cron$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'recordatorios_de_cita';
  perform cron.schedule('recordatorios_de_cita', '*/5 * * * *', 'select public.recordatorios_disparar();');
end
$cron$;

-- ── Permisos ─────────────────────────────────────────────────────────────────
-- En Postgres toda función nace ejecutable por PUBLIC: el revoke va también ahí.
revoke all on function public.tg_recordatorio_reglas_tope() from public, anon, authenticated;
revoke all on function public.recordatorios_guardar(uuid, boolean, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.recordatorios_guardar(uuid, boolean, jsonb, uuid) to service_role;
revoke all on function public.recordatorios_secreto_cron() from public, anon, authenticated;
revoke all on function public.recordatorios_disparar() from public, anon, authenticated;
grant execute on function public.recordatorios_secreto_cron() to service_role;

-- ── 5 (cont.). reservas_reservar ─────────────────────────────────────────────
-- Copiada de pg_get_functiondef de la base viva el 2026-10-27. El ÚNICO cambio
-- es el `update public.leads` (marcado [0165]): el bloque que aborta compara
-- `replace(vieja, fragmento viejo, fragmento nuevo) = nueva`. CREATE OR REPLACE
-- conserva los permisos (solo service_role, 0162).
CREATE OR REPLACE FUNCTION public.reservas_reservar(p_agency_id uuid, p_booking_type_id uuid, p_recursos uuid[], p_inicio timestamp with time zone, p_nombre text, p_telefono text, p_correo text, p_zona_cliente text, p_respuestas jsonb, p_token_hash text, p_ip_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;
