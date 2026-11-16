-- =============================================================================
-- 0163 — Dos cosas que faltaban para la reserva por la página (0162)
-- =============================================================================
-- 1. El aviso de la campana puede apuntar a una CITA. Medido con la primera
--    reserva de prueba (2026-10-27): `notifications_resource_type_chk` solo
--    aceptaba conversación, contacto, tarea e integración, y el aviso
--    «Nueva reserva» se rechazaba (quedó anotado en `extra.avisos.campana`).
--    La campana lo lleva a la Agenda, al día de la cita (`types.ts`).
--
-- 2. El contacto que crea una reserva nace en el estado de entrada:
-- Encontrado al aplicar la 0162 (2026-10-27): `reservas_reservar` creaba el
-- contacto nuevo SIN estado (`stage_id` null). El que llega por WhatsApp nace en
-- el estado de entrada del negocio (`resolveInitialStageId` del webhook, 0039),
-- y uno sin estado no aparece en el tablero de Contactos ni lo cuenta el embudo.
--
-- Solo cambia eso: misma firma, mismos permisos (un `create or replace`
-- conserva los grants de la 0162). Un contacto que ya existía no se toca: ya
-- tiene su estado, y cambiárselo por reservar sería pisar lo que hizo el equipo.
--
-- Al nacer con estado corren los triggers de siempre de un contacto nuevo: el
-- historial de estados (0124) y, si el negocio manda eventos a Meta por ese
-- estado, el anotador (0109), igual que con uno de WhatsApp.
--
-- Revertir: volver a aplicar la función de la 0162, y el CHECK de la campana
-- sin 'appointment' (solo si no quedó ningún aviso de cita).
-- =============================================================================

alter table public.notifications drop constraint if exists notifications_resource_type_chk;
alter table public.notifications add constraint notifications_resource_type_chk
    check (resource_type = any (array['conversation', 'lead', 'task', 'integracion', 'appointment']));


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
