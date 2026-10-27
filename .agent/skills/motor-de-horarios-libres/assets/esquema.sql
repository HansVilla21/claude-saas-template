-- =============================================================================
-- 0159 — Agenda propia, fase 1: horarios, quién atiende y servicios
-- =============================================================================
-- La agenda tipo Calendly que se diseñó el 2026-10-25 con REA OS (MOM-26,
-- MOM-135, MOM-67). Esta es la base: QUÉ se puede reservar y CUÁNDO. Nadie de
-- afuera reserva todavía (eso es la fase 2), así que esta migración no toca
-- `appointments`: las columnas de la reserva (servicio, recurso, márgenes
-- congelados, token para gestionar) entran con la página.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LAS CUATRO PIEZAS
-- ─────────────────────────────────────────────────────────────────────────────
--   · `availability_schedules` — un horario: la semana (jsonb, un día por
--     llave), la zona y qué hace con los feriados de Costa Rica. Lo usan las
--     personas y los espacios, y opcionalmente un servicio que solo se da
--     ciertos días (se cruza con el de quien atiende).
--   · `availability_exceptions` — los días especiales de un horario, uno por
--     fecha: cerrado (lista vacía) o con otras horas. Le gana a la semana y al
--     feriado; así se abre un feriado puntual o se cierra por vacaciones.
--   · `booking_resources` — quién o qué atiende: una persona del equipo o un
--     espacio (una cancha, un consultorio). Cada uno con su horario.
--   · `booking_types` — los servicios: duración, cada cuánto se ofrecen,
--     márgenes, aviso mínimo, ventana de días, límite diario y cupos. Con
--     `booking_type_resources` dicen quién los atiende: hoy una persona fija; la
--     tabla ya permite varias para el reparto, que viene después.
--
-- La semana va en jsonb y no en una fila por día porque se lee y se guarda
-- siempre entera (un solo «Guardar»). Los días especiales sí van en filas: se
-- agregan y se borran de a uno y se consultan por rango de fechas.
--
-- Los feriados NO están en la base: son código (`src/lib/reservas/feriados.ts`),
-- porque diez caen siempre el mismo día y los otros dos salen de la Pascua. Una
-- tabla habría que recargarla cada diciembre.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- EL NEGOCIO NO SE PUEDE MEZCLAR
-- ─────────────────────────────────────────────────────────────────────────────
-- Toda referencia entre estas tablas lleva el `agency_id` en la llave foránea
-- (`(schedule_id, agency_id)` → `(id, agency_id)`): un error en una server
-- action no puede colgarle a un servicio de un negocio el horario o la persona
-- de otro. La base lo rechaza.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- QUIÉN LEE Y QUIÉN ESCRIBE
-- ─────────────────────────────────────────────────────────────────────────────
-- Leer: cualquier miembro del negocio (y master), igual que `appointments`: la
-- agenda y la ficha van a mostrar el servicio de cada cita.
-- Escribir: NADIE desde el navegador. Solo las server actions de Configuración,
-- con el gate de owner/admin y el cliente de servicio. Sin policies de escritura
-- y con el permiso revocado: una tabla de configuración que cualquier agente
-- pudiera escribir directo desde la consola le cambiaría los horarios al negocio.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- SIN ÍNDICES EXTRA
-- ─────────────────────────────────────────────────────────────────────────────
-- AGENTS.md §7.2: ningún índice sin medir antes y después. Estas tablas tienen
-- decenas de filas por negocio; los únicos índices son los que exigen las
-- restricciones (llaves primarias y únicas), que además sirven a la consulta
-- por negocio.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ORDEN DE DESPLIEGUE Y CÓMO REVERTIR
-- ─────────────────────────────────────────────────────────────────────────────
-- Aditiva: tablas nuevas, nada existente cambia. Se aplica ANTES del código (el
-- preview usa la misma base). Para revertir, primero sacar el código y después:
--   drop table if exists public.booking_type_resources, public.booking_types,
--     public.booking_resources, public.availability_exceptions,
--     public.availability_schedules;
-- =============================================================================

-- ── Horarios ─────────────────────────────────────────────────────────────────
create table if not exists public.availability_schedules (
    id          uuid primary key default gen_random_uuid(),
    agency_id   uuid not null references public.agencies(id) on delete cascade,
    name        text not null check (length(btrim(name)) between 1 and 80),
    timezone    text not null default 'America/Costa_Rica',
    -- {"0": [], "1": [{"desde": "08:00", "hasta": "17:00"}], …}; 0 = domingo.
    -- La forma fina la valida `semanaValida` (src/lib/reservas/semana.ts) al
    -- guardar y al leer; acá solo que sea un objeto.
    week        jsonb not null default '{}'::jsonb check (jsonb_typeof(week) = 'object'),
    -- Qué feriados de Costa Rica cierran este horario.
    holidays    text not null default 'all' check (holidays in ('all', 'mandatory', 'none')),
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    unique (id, agency_id)
);

comment on table public.availability_schedules is
  '0159: horario de una persona, un espacio o un servicio. La semana va en `week` (jsonb por día, 0 = domingo); los días especiales, en availability_exceptions.';

create table if not exists public.availability_exceptions (
    id           uuid primary key default gen_random_uuid(),
    agency_id    uuid not null,
    schedule_id  uuid not null,
    date         date not null,
    -- Lista vacía = cerrado ese día.
    intervals    jsonb not null default '[]'::jsonb check (jsonb_typeof(intervals) = 'array'),
    label        text check (label is null or length(label) <= 80),
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),
    unique (schedule_id, date),
    foreign key (schedule_id, agency_id)
        references public.availability_schedules(id, agency_id) on delete cascade
);

comment on table public.availability_exceptions is
  '0159: día especial de un horario (vacaciones, un feriado que se atiende). Le gana a la semana y al feriado. intervals vacío = cerrado.';

-- ── Quién atiende ────────────────────────────────────────────────────────────
create table if not exists public.booking_resources (
    id           uuid primary key default gen_random_uuid(),
    agency_id    uuid not null references public.agencies(id) on delete cascade,
    kind         text not null check (kind in ('person', 'space')),
    -- La persona. Su nombre se lee de `users` al mostrarla, para que no quede
    -- viejo si lo cambia en su perfil.
    user_id      uuid references public.users(id) on delete cascade,
    -- El nombre del espacio («Cancha 1»). Una persona no lo necesita.
    name         text check (name is null or length(btrim(name)) between 1 and 80),
    schedule_id  uuid not null,
    active       boolean not null default true,
    position     int not null default 0,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),
    unique (id, agency_id),
    check ((kind = 'person' and user_id is not null) or (kind = 'space' and user_id is null and name is not null)),
    foreign key (schedule_id, agency_id)
        references public.availability_schedules(id, agency_id) on delete restrict
);

-- Una persona aparece una sola vez por negocio.
create unique index if not exists booking_resources_persona_unica
    on public.booking_resources (agency_id, user_id) where user_id is not null;

comment on table public.booking_resources is
  '0159: quién o qué atiende las reservas: una persona del equipo o un espacio (cancha, consultorio), cada uno con su horario.';

-- ── Servicios ────────────────────────────────────────────────────────────────
create table if not exists public.booking_types (
    id                 uuid primary key default gen_random_uuid(),
    agency_id          uuid not null references public.agencies(id) on delete cascade,
    name               text not null check (length(btrim(name)) between 1 and 80),
    -- Para el link de la página (fase 2): /r/<negocio>/<slug>.
    slug               text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 60),
    description        text check (description is null or length(description) <= 1000),
    duration_min       int not null check (duration_min between 5 and 720),
    -- Cada cuánto se ofrece un horario. null = lo que dura el servicio.
    slot_step_min      int check (slot_step_min is null or slot_step_min between 5 and 720),
    buffer_before_min  int not null default 0 check (buffer_before_min between 0 and 240),
    buffer_after_min   int not null default 0 check (buffer_after_min between 0 and 240),
    -- Cuánto antes hay que reservar. 4 horas por defecto.
    min_notice_min     int not null default 240 check (min_notice_min between 0 and 129600),
    window_kind        text not null default 'calendar_days'
                       check (window_kind in ('calendar_days', 'business_days', 'unlimited')),
    window_days        int not null default 14 check (window_days between 1 and 365),
    daily_limit        int check (daily_limit is null or daily_limit between 1 and 200),
    -- 1 = una cita normal. Más = varias personas en el mismo horario (una
    -- clase, un reto de fútbol). El cupo es un conteo de reservas activas.
    seats_per_slot     int not null default 1 check (seats_per_slot between 1 and 500),
    location_kind      text not null default 'in_person'
                       check (location_kind in ('in_person', 'phone', 'video', 'custom')),
    location_text      text check (location_text is null or length(location_text) <= 300),
    -- Horario propio del servicio, opcional: se cruza con el de quien atiende.
    schedule_id        uuid,
    active             boolean not null default true,
    position           int not null default 0,
    -- Un servicio con reservas no se borra: se archiva (las citas lo siguen
    -- nombrando). Archivado no se ofrece ni se lista.
    archived_at        timestamptz,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now(),
    unique (id, agency_id),
    -- Si se borra el horario propio, el servicio queda con el de quien atiende
    -- (solo se anula `schedule_id`; `agency_id` no se toca).
    foreign key (schedule_id, agency_id)
        references public.availability_schedules(id, agency_id) on delete set null (schedule_id)
);

-- El link no se puede repetir entre los servicios vivos del negocio. Uno
-- archivado libera el suyo.
create unique index if not exists booking_types_slug_unico
    on public.booking_types (agency_id, slug) where archived_at is null;

comment on table public.booking_types is
  '0159: servicios que se pueden reservar, con sus reglas (duración, paso, márgenes, aviso, ventana, límite diario, cupos). Los lee el motor de horarios (src/lib/reservas/motor.ts).';

create table if not exists public.booking_type_resources (
    booking_type_id  uuid not null,
    resource_id      uuid not null,
    agency_id        uuid not null,
    position         int not null default 0,
    primary key (booking_type_id, resource_id),
    foreign key (booking_type_id, agency_id)
        references public.booking_types(id, agency_id) on delete cascade,
    foreign key (resource_id, agency_id)
        references public.booking_resources(id, agency_id) on delete cascade
);

comment on table public.booking_type_resources is
  '0159: quién atiende cada servicio. Hoy una persona o espacio por servicio; la tabla ya admite varios para el reparto.';

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Enable y policy en la MISMA migración: separadas, queda deny-all en silencio.
alter table public.availability_schedules  enable row level security;
alter table public.availability_exceptions enable row level security;
alter table public.booking_resources       enable row level security;
alter table public.booking_types           enable row level security;
alter table public.booking_type_resources  enable row level security;

create policy availability_schedules_select on public.availability_schedules for select
    using (public.is_member_of(agency_id) or public.is_master());
create policy availability_exceptions_select on public.availability_exceptions for select
    using (public.is_member_of(agency_id) or public.is_master());
create policy booking_resources_select on public.booking_resources for select
    using (public.is_member_of(agency_id) or public.is_master());
create policy booking_types_select on public.booking_types for select
    using (public.is_member_of(agency_id) or public.is_master());
create policy booking_type_resources_select on public.booking_type_resources for select
    using (public.is_member_of(agency_id) or public.is_master());

-- Escribir, solo con el cliente de servicio (ver arriba). El revoke además de
-- la falta de policy: si un día alguien agrega una policy de escritura por
-- error, el permiso de la tabla sigue cerrado.
revoke all on public.availability_schedules, public.availability_exceptions,
    public.booking_resources, public.booking_types, public.booking_type_resources from anon;
revoke insert, update, delete, truncate on public.availability_schedules, public.availability_exceptions,
    public.booking_resources, public.booking_types, public.booking_type_resources from authenticated;

-- ── updated_at ───────────────────────────────────────────────────────────────
-- Una tabla nueva no hereda el trigger de la 0007: se pone a mano.
create trigger trg_set_updated_at before update on public.availability_schedules
    for each row execute function public.set_updated_at();
create trigger trg_set_updated_at before update on public.availability_exceptions
    for each row execute function public.set_updated_at();
create trigger trg_set_updated_at before update on public.booking_resources
    for each row execute function public.set_updated_at();
create trigger trg_set_updated_at before update on public.booking_types
    for each row execute function public.set_updated_at();
