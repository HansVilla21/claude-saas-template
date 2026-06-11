-- =====================================================================
-- plug-ins/reservas.sql
--
-- Plug-in para chatbots que agendan CITAS/RESERVAS:
--   - Clínicas, dentistas, spas, peluquerías, barberías
--   - Restaurantes, hoteles (reservas)
--   - Consultores, coaches, abogados
--
-- Aporta:
--   - services        — catálogo de servicios ofrecidos
--   - staff_members   — quién atiende (opcional, omitir si solo hay 1)
--   - appointments    — citas concretas con lead + servicio + fecha
--   - availability_rules — horarios fijos del negocio (opcional)
--
-- Requiere: 0001_core.sql aplicado previamente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type appointment_status as enum (
    'pending',          -- el lead pidió la cita, falta confirmar
    'confirmed',        -- agendada y confirmada
    'completed',        -- la cita ocurrió
    'cancelled',        -- cancelada (por lead o staff)
    'no_show',          -- el lead no se presentó
    'rescheduled'       -- se reagendó (la nueva cita es otra row)
);

create type service_category as enum (
    'consulta', 'tratamiento', 'cirugia', 'limpieza',
    'corte', 'color', 'manicure', 'masaje',
    'mesa', 'evento', 'habitacion',
    'otro'
);

-- ---------------------------------------------------------------------
-- services — catálogo
-- ---------------------------------------------------------------------
create table public.services (
    id              uuid primary key default gen_random_uuid(),
    agency_id       uuid not null references public.agencies(id) on delete cascade,
    name            text not null,                  -- "Limpieza dental", "Corte + barba", "Mesa para 2"
    description     text,
    category        service_category not null default 'otro',
    -- Duración en minutos (para slots de calendario)
    duration_minutes integer not null default 30,
    -- Precio (puede ser null si "consultar")
    price           numeric(12,2),
    currency        text default 'CRC',
    -- Reglas de agendamiento
    advance_booking_hours integer not null default 24,  -- mínimo de anticipación
    max_booking_days integer not null default 60,       -- máximo a futuro
    requires_deposit boolean not null default false,
    deposit_amount  numeric(12,2),
    -- Display
    image_url       text,
    is_active       boolean not null default true,
    display_order   integer not null default 0,
    extra           jsonb not null default '{}'::jsonb,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index idx_services_agency_active on public.services (agency_id, display_order) where is_active = true;
create index idx_services_name on public.services using gin (name gin_trgm_ops);

-- ---------------------------------------------------------------------
-- staff_members — quién atiende (omitir si solo hay 1 persona)
-- ---------------------------------------------------------------------
create table public.staff_members (
    id              uuid primary key default gen_random_uuid(),
    agency_id       uuid not null references public.agencies(id) on delete cascade,
    user_id         uuid references auth.users(id) on delete set null, -- nullable: el staff puede no tener login
    full_name       text not null,
    role            text,                            -- "Dr. Dentista", "Estilista", "Mozo"
    specialties     text[],                          -- array de habilidades
    bio             text,
    photo_url       text,
    is_active       boolean not null default true,
    extra           jsonb not null default '{}'::jsonb,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index idx_staff_agency_active on public.staff_members (agency_id) where is_active = true;

-- Qué servicios puede atender cada staff (M:N)
create table public.staff_services (
    staff_id        uuid not null references public.staff_members(id) on delete cascade,
    service_id      uuid not null references public.services(id) on delete cascade,
    agency_id       uuid not null references public.agencies(id) on delete cascade,
    primary key (staff_id, service_id)
);

-- ---------------------------------------------------------------------
-- availability_rules — horarios fijos del negocio
-- ---------------------------------------------------------------------
-- "El negocio abre de Lun-Vie 9-18, Sab 9-13, cerrado Dom"
-- "Dr. X solo atiende Mar y Jue de 14-18"
-- ---------------------------------------------------------------------
create table public.availability_rules (
    id              uuid primary key default gen_random_uuid(),
    agency_id       uuid not null references public.agencies(id) on delete cascade,
    staff_id        uuid references public.staff_members(id) on delete cascade,  -- null = aplica al negocio entero
    -- Día de la semana: 0=domingo .. 6=sábado (compatible con PostgreSQL EXTRACT(DOW))
    day_of_week     integer not null check (day_of_week between 0 and 6),
    start_time      time not null,
    end_time        time not null,
    is_active       boolean not null default true,
    created_at      timestamptz not null default now(),
    check (end_time > start_time)
);

create index idx_availability_agency_staff_dow on public.availability_rules (agency_id, staff_id, day_of_week) where is_active = true;

-- ---------------------------------------------------------------------
-- availability_overrides — excepciones (feriados, vacaciones, eventos)
-- ---------------------------------------------------------------------
create table public.availability_overrides (
    id              uuid primary key default gen_random_uuid(),
    agency_id       uuid not null references public.agencies(id) on delete cascade,
    staff_id        uuid references public.staff_members(id) on delete cascade,  -- null = aplica al negocio
    starts_at       timestamptz not null,
    ends_at         timestamptz not null,
    is_blocked      boolean not null default true,  -- true = no disponible, false = horario extra
    reason          text,
    created_at      timestamptz not null default now(),
    check (ends_at > starts_at)
);

create index idx_avail_overrides_agency_range on public.availability_overrides (agency_id, starts_at, ends_at);

-- ---------------------------------------------------------------------
-- appointments — la cita concreta
-- ---------------------------------------------------------------------
create table public.appointments (
    id              uuid primary key default gen_random_uuid(),
    agency_id       uuid not null references public.agencies(id) on delete cascade,
    lead_id         uuid not null references public.leads(id) on delete cascade,
    conversation_id uuid references public.conversations(id) on delete set null,
    service_id      uuid not null references public.services(id) on delete restrict,
    staff_id        uuid references public.staff_members(id) on delete set null,
    -- Horario
    scheduled_at    timestamptz not null,
    duration_minutes integer not null,                  -- copiado del service al momento de agendar
    -- Status
    status          appointment_status not null default 'pending',
    confirmed_at    timestamptz,
    cancelled_at    timestamptz,
    cancellation_reason text,
    cancelled_by_kind text,                              -- 'lead' | 'staff' | 'system'
    -- Pricing
    price_quoted    numeric(12,2),
    currency        text default 'CRC',
    deposit_paid    boolean not null default false,
    deposit_amount  numeric(12,2),
    -- Recordatorios
    reminder_sent_at timestamptz,
    -- Notas
    customer_notes  text,                                -- lo que el lead pidió
    internal_notes  text,                                -- nota interna del staff
    -- Reschedule chain
    rescheduled_from_id uuid references public.appointments(id) on delete set null,
    -- Metadata
    extra           jsonb not null default '{}'::jsonb,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    -- No double-booking del mismo staff en el mismo horario
    -- (constraint laxo: la app debe validar overlap correctamente)
    constraint chk_appointment_duration check (duration_minutes > 0)
);

create index idx_appointments_agency_scheduled on public.appointments (agency_id, scheduled_at)
    where status in ('pending', 'confirmed');
create index idx_appointments_lead on public.appointments (lead_id, scheduled_at desc);
create index idx_appointments_staff_day on public.appointments (staff_id, scheduled_at)
    where status in ('pending', 'confirmed');
create index idx_appointments_status_upcoming on public.appointments (agency_id, status, scheduled_at)
    where status in ('pending', 'confirmed') and scheduled_at > now();

-- ---------------------------------------------------------------------
-- Trigger: copiar duration_minutes del service al insertar
-- ---------------------------------------------------------------------
create or replace function app.appointment_set_duration()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if NEW.duration_minutes is null or NEW.duration_minutes = 0 then
        select duration_minutes into NEW.duration_minutes
        from public.services where id = NEW.service_id;
    end if;
    return NEW;
end;
$$;

drop trigger if exists tg_appointment_set_duration on public.appointments;
create trigger tg_appointment_set_duration
    before insert on public.appointments
    for each row execute function app.appointment_set_duration();

-- ---------------------------------------------------------------------
-- Trigger: updated_at touch
-- ---------------------------------------------------------------------
create trigger tg_touch_updated_at_services
    before update on public.services
    for each row execute function app.touch_updated_at();

create trigger tg_touch_updated_at_staff
    before update on public.staff_members
    for each row execute function app.touch_updated_at();

create trigger tg_touch_updated_at_appointments
    before update on public.appointments
    for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------
-- Helper: validar si un slot está libre para un staff
-- ---------------------------------------------------------------------
-- Uso desde el chatbot ANTES de crear la cita:
--   select app.is_slot_available(
--     '<agency_id>', '<staff_id>', '2026-06-01 14:00', 30
--   );  -- true / false
-- ---------------------------------------------------------------------
create or replace function app.is_slot_available(
    p_agency_id uuid,
    p_staff_id uuid,
    p_start timestamptz,
    p_duration_minutes integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    p_end timestamptz := p_start + (p_duration_minutes || ' minutes')::interval;
    has_overlap boolean;
begin
    select exists(
        select 1
        from public.appointments
        where agency_id = p_agency_id
          and (p_staff_id is null or staff_id = p_staff_id)
          and status in ('pending', 'confirmed')
          and tstzrange(scheduled_at, scheduled_at + (duration_minutes || ' minutes')::interval, '[)')
              && tstzrange(p_start, p_end, '[)')
    ) into has_overlap;

    return not has_overlap;
end;
$$;

-- =====================================================================
-- FIN plug-ins/reservas.sql
-- =====================================================================
