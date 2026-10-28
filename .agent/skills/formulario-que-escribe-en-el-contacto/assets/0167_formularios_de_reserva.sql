-- =============================================================================
-- 0167 · Agenda propia: formularios por servicio que se guardan en el contacto
-- =============================================================================
-- Hans, 28-10: «que en el link de agendamiento por cada servicio se pueda crear
-- ahí, en la parte de los formularios, distintos campos con distintos tipos de
-- campos [...] y que, al final, eso se guarde en alguna parte [...] del contacto
-- en el CRM». Aprobó (28-10, «como recomendás»):
--   A. Si el contacto ya tenía un valor, lo que escribe en el formulario lo
--      reemplaza. Una respuesta vacía nunca borra. La cita guarda lo que respondió.
--   B. El bot puede cambiar después un dato que vino del formulario: gana lo
--      último que dijo la persona, y la ficha dice de dónde salió.
--   C. Un campo nuevo creado desde el formulario NO lo busca el bot en el chat
--      (`bot_extrae = false`): no cambia lo que hace el bot de ningún negocio.
--   D. «Empresa» es un campo propio del negocio, no una columna fija. Lo fijo de
--      la ficha que se puede llenar es el cumpleaños.
--
-- Qué trae:
--   1. `booking_type_questions.kind` con los tipos nuevos: number, email, phone,
--      date, yes_no, dropdown, multi_choice. `choice` sigue siendo «una opción»
--      (ahora con botones; con 0 preguntas cargadas al 28-10, no cambia nada).
--   2. A dónde va cada respuesta: `lead_field` (lo fijo de la ficha; hoy solo
--      'birth_date', y solo desde una pregunta de fecha) o `field_def_id` (un
--      campo propio del negocio, `extractor_field_defs`). Uno o ninguno.
--   3. `extractor_field_defs.bot_extrae`: si el analista del bot busca ese campo
--      en el chat. Arranca en true para todos los que ya existen.
--   4. `extractor_field_values.origen` ('bot' | 'reserva') y `appointment_id`.
--      El origen lo pone la BASE, no quien escribe: el upsert de `bot-actions` no
--      manda origen, y con ON CONFLICT el 'reserva' anterior quedaría pegado. Un
--      trigger lo deja en 'bot' salvo que la escritura venga de (5).
--   5. Al crear una cita con respuestas, un trigger las guarda en el contacto, en
--      la MISMA transacción que la reserva. A dónde va cada una lo lee de la
--      pregunta en la base (por id, dentro del negocio y del servicio de la cita):
--      el navegador no decide ni el negocio, ni el contacto, ni el campo. Cada
--      respuesta va en su propio bloque: si una falla, se anota un WARNING y la
--      reserva sigue (vale más la cita que el dato).
--
-- Compatible con el código que corre hoy: las columnas nuevas tienen default,
-- los kinds viejos siguen valiendo, y las respuestas de hoy no traen
-- `pregunta_id`, así que el trigger no hace nada con ellas.
--
-- Rollback:
--   drop trigger if exists trg_citas_respuestas_al_contacto on public.appointments;
--   drop trigger if exists trg_extractor_valor_origen on public.extractor_field_values;
--   drop function if exists public.tg_citas_respuestas_al_contacto(), public.tg_extractor_valor_origen(),
--     public.reservas_valor_para_campo(jsonb, text, jsonb);
--   alter table public.extractor_field_values drop column if exists origen, drop column if exists appointment_id;
--   alter table public.booking_type_questions drop column if exists lead_field, drop column if exists field_def_id;
--   alter table public.extractor_field_defs drop constraint if exists extractor_field_defs_id_agency_key,
--     drop column if exists bot_extrae;
--   + volver al check de kinds de la 0162.
-- =============================================================================

-- ── 1. Los tipos ─────────────────────────────────────────────────────────────
alter table public.booking_type_questions drop constraint if exists booking_type_questions_kind_check;
alter table public.booking_type_questions add constraint booking_type_questions_kind_check check (kind in (
  'short_text', 'long_text', 'choice', 'dropdown', 'multi_choice',
  'number', 'email', 'phone', 'date', 'yes_no'));

alter table public.booking_type_questions drop constraint if exists booking_type_questions_check;
alter table public.booking_type_questions add constraint booking_type_questions_opciones_minimas check (
  kind not in ('choice', 'dropdown', 'multi_choice') or jsonb_array_length(options) >= 2);

-- ── 2. A dónde va la respuesta ───────────────────────────────────────────────
-- Para la FK compuesta: el campo tiene que ser del mismo negocio que la pregunta.
alter table public.extractor_field_defs
  add constraint extractor_field_defs_id_agency_key unique (id, agency_id);

alter table public.booking_type_questions
  add column if not exists lead_field text,
  add column if not exists field_def_id uuid;

alter table public.booking_type_questions
  add constraint booking_type_questions_lead_field_check check (lead_field is null or lead_field = 'birth_date'),
  add constraint booking_type_questions_un_destino check (num_nonnulls(lead_field, field_def_id) <= 1),
  add constraint booking_type_questions_cumple_es_fecha check (lead_field is distinct from 'birth_date' or kind = 'date'),
  -- Si se borra el campo, la pregunta queda sin destino (la columna sola: agency_id no se toca).
  add constraint booking_type_questions_campo_fkey foreign key (field_def_id, agency_id)
    references public.extractor_field_defs (id, agency_id) on delete set null (field_def_id);

comment on column public.booking_type_questions.lead_field is
  '0167: lo fijo de la ficha donde se guarda la respuesta. Hoy solo birth_date (desde una pregunta de fecha).';
comment on column public.booking_type_questions.field_def_id is
  '0167: el campo propio del negocio (extractor_field_defs) donde se guarda la respuesta.';

-- ── 3. Si el bot busca el campo en el chat ───────────────────────────────────
alter table public.extractor_field_defs
  add column if not exists bot_extrae boolean not null default true;
comment on column public.extractor_field_defs.bot_extrae is
  '0167: el analista del bot lo busca en el chat. Los campos creados desde un formulario de reserva nacen en false (Hans, 28-10).';

-- ── 4. De dónde salió cada dato ──────────────────────────────────────────────
alter table public.extractor_field_values
  add column if not exists origen text not null default 'bot',
  add column if not exists appointment_id uuid references public.appointments (id) on delete set null;
alter table public.extractor_field_values
  add constraint extractor_field_values_origen_check check (origen in ('bot', 'reserva'));
comment on column public.extractor_field_values.origen is
  '0167: bot = lo sacó el analista del chat; reserva = lo escribió la persona en el formulario de una cita (appointment_id). Lo pone tg_extractor_valor_origen.';

create or replace function public.tg_extractor_valor_origen()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  -- Solo el trigger de las citas (5) prende esta marca, y solo dentro de su
  -- transacción. Cualquier otra escritura es del bot.
  if coalesce(current_setting('crm.origen_valor', true), '') = 'reserva' then
    new.origen := 'reserva';
  else
    new.origen := 'bot';
    new.appointment_id := null;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_extractor_valor_origen on public.extractor_field_values;
create trigger trg_extractor_valor_origen before insert or update on public.extractor_field_values
  for each row execute function public.tg_extractor_valor_origen();

-- ── 5. Las respuestas, al contacto ───────────────────────────────────────────
-- La respuesta convertida al tipo del campo, o null si no encaja (se saltea).
-- `p_valor` es lo que guardó el servidor en `answers[].valor`: string, number,
-- boolean o un array de strings (varias opciones).
create or replace function public.reservas_valor_para_campo(p_valor jsonb, p_tipo text, p_opciones jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $fn$
declare
  v_texto text;
begin
  if p_valor is null or jsonb_typeof(p_valor) = 'null' then
    return null;
  end if;
  v_texto := case jsonb_typeof(p_valor)
    when 'string' then btrim(p_valor #>> '{}')
    when 'number' then p_valor #>> '{}'
    when 'boolean' then case when (p_valor #>> '{}')::boolean then 'Sí' else 'No' end
    when 'array' then (select string_agg(btrim(x), ', ') from jsonb_array_elements_text(p_valor) x where btrim(x) <> '')
    else null
  end;
  if v_texto is null or v_texto = '' then
    return null;
  end if;

  if p_tipo = 'number' then
    return case when jsonb_typeof(p_valor) = 'number' then p_valor end;
  elsif p_tipo = 'boolean' then
    return case when jsonb_typeof(p_valor) = 'boolean' then p_valor end;
  elsif p_tipo = 'date' then
    return case when v_texto ~ '^\d{4}-\d{2}-\d{2}$' then to_jsonb(v_texto) end;
  elsif p_tipo = 'enum' then
    -- Las opciones del campo pueden venir como strings o como { value, label }.
    return case when jsonb_typeof(p_valor) = 'string' and exists (
      select 1 from jsonb_array_elements(coalesce(p_opciones, '[]'::jsonb)) o
       where (case when jsonb_typeof(o) = 'string' then o #>> '{}' else o ->> 'value' end) = v_texto
    ) then to_jsonb(v_texto) end;
  elsif p_tipo = 'text' then
    return to_jsonb(left(v_texto, 1000));
  end if;
  return null; -- json u otro: no se escribe desde un formulario
end;
$fn$;

create or replace function public.tg_citas_respuestas_al_contacto()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  r jsonb;
  q record;
  d record;
  v_id uuid;
  v_valor jsonb;
  v_fecha date;
begin
  for r in select x from jsonb_array_elements(new.answers) x loop
    begin
      -- Una respuesta sin pregunta_id (las de antes de la 0167) no va a ningún lado.
      if jsonb_typeof(r) <> 'object' or coalesce(r ->> 'pregunta_id', '') !~ '^[0-9a-f-]{36}$' then
        continue;
      end if;
      v_id := (r ->> 'pregunta_id')::uuid;

      select bq.kind, bq.lead_field, bq.field_def_id into q
        from public.booking_type_questions bq
       where bq.id = v_id and bq.agency_id = new.agency_id and bq.booking_type_id = new.booking_type_id;
      if not found then
        continue;
      end if;

      if q.lead_field = 'birth_date' then
        if q.kind = 'date' and coalesce(r ->> 'valor', '') ~ '^\d{4}-\d{2}-\d{2}$' then
          v_fecha := (r ->> 'valor')::date; -- una fecha que no existe tira y cae al exception
          if v_fecha between date '1900-01-01' and current_date then
            update public.leads l set birth_date = v_fecha
             where l.id = new.lead_id and l.agency_id = new.agency_id
               and l.birth_date is distinct from v_fecha;
          end if;
        end if;
      elsif q.field_def_id is not null then
        select fd.id, fd.field_type::text as tipo, fd.options into d
          from public.extractor_field_defs fd
         where fd.id = q.field_def_id and fd.agency_id = new.agency_id and fd.is_active;
        if not found then
          continue;
        end if;
        v_valor := public.reservas_valor_para_campo(r -> 'valor', d.tipo, d.options);
        if v_valor is null then
          continue; -- vacía o que no encaja: nunca borra lo que había
        end if;
        perform set_config('crm.origen_valor', 'reserva', true);
        insert into public.extractor_field_values (agency_id, lead_id, field_def_id, value, origen, appointment_id, extracted_at, updated_at)
        values (new.agency_id, new.lead_id, d.id, v_valor, 'reserva', new.id, now(), now())
        on conflict (lead_id, field_def_id) do update
          set value = excluded.value, origen = excluded.origen, appointment_id = excluded.appointment_id,
              extracted_at = excluded.extracted_at, updated_at = excluded.updated_at;
        perform set_config('crm.origen_valor', '', true);
      end if;
    exception when others then
      perform set_config('crm.origen_valor', '', true);
      raise warning '[0167] respuesta % de la cita % no se guardó en el contacto: % (%)',
        r ->> 'pregunta_id', new.id, sqlerrm, sqlstate;
    end;
  end loop;
  return null;
end;
$fn$;

drop trigger if exists trg_citas_respuestas_al_contacto on public.appointments;
create trigger trg_citas_respuestas_al_contacto after insert on public.appointments
  for each row
  when (new.lead_id is not null and new.booking_type_id is not null and jsonb_array_length(new.answers) > 0)
  execute function public.tg_citas_respuestas_al_contacto();

-- En Postgres toda función nace ejecutable por PUBLIC: el revoke va también ahí.
revoke execute on function public.tg_extractor_valor_origen() from public, anon, authenticated;
revoke execute on function public.tg_citas_respuestas_al_contacto() from public, anon, authenticated;
revoke execute on function public.reservas_valor_para_campo(jsonb, text, jsonb) from public, anon, authenticated;
