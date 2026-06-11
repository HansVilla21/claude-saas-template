-- =====================================================================
-- plug-ins/inmobiliaria.sql
--
-- Plug-in para chatbots INMOBILIARIOS (referencia: Casa CRM).
--
-- Aporta:
--   - properties (catálogo de propiedades en venta/alquiler)
--   - property_views (cuando un lead vio una propiedad)
--   - visit_requests (visitas agendadas)
--   - Extiende `leads` con campos de búsqueda (presupuesto, zona, tipo)
--
-- Requiere: 0001_core.sql aplicado previamente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type property_type as enum (
    'casa', 'apartamento', 'villa', 'lote',
    'local_comercial', 'oficina', 'edificio', 'finca', 'bodega'
);

create type property_operation as enum ('venta', 'alquiler', 'alquiler_temporal');

create type property_status as enum (
    'borrador',
    'disponible',
    'reservada',
    'vendida',
    'alquilada',
    'pausada',
    'archivada'
);

create type lead_operation_interest as enum ('compra', 'alquiler', 'venta');

create type visit_status as enum (
    'pending',     -- el lead la pidió
    'confirmed',   -- el agente confirmó
    'completed',   -- la visita ocurrió
    'cancelled',
    'no_show'
);

-- ---------------------------------------------------------------------
-- properties — catálogo
-- ---------------------------------------------------------------------
create table public.properties (
    id              uuid primary key default gen_random_uuid(),
    agency_id       uuid not null references public.agencies(id) on delete cascade,
    -- Identificación
    codigo          text not null,                   -- "CR-2031" (visible al cliente)
    titulo          text not null,                   -- "Casa moderna en Escazú"
    -- Categorización
    tipo            property_type not null,
    operacion       property_operation not null,
    -- Precio
    precio          numeric(14,2),                   -- número directo (USD/CRC según moneda)
    precio_display  text,                            -- "$485,000" o "Consultar"
    moneda          text not null default 'USD',
    -- Ubicación
    ubicacion       text,                            -- texto humano: "Trejos Montealegre, Escazú"
    canton          text,
    barrio          text,
    provincia       text,
    latitude        numeric(10,7),
    longitude       numeric(10,7),
    -- Specs
    dormitorios     integer,
    banos           numeric(3,1),                    -- 2.5
    area_m2         numeric(10,2),
    area_terreno_m2 numeric(10,2),
    parqueos        integer,
    plantas         integer,
    -- Caracteristicas (tags)
    caracteristicas text[],                          -- ["Piscina","Jardín","Seguridad 24/7"]
    -- Descripción larga + corta
    descripcion_corta text,
    descripcion     text,
    -- Media
    foto_urls       text[] not null default '{}',    -- array de JPG/PNG públicos
    video_url       text,
    tour_3d_url     text,
    plano_url       text,
    -- Status
    status          property_status not null default 'disponible',
    destacada       boolean not null default false,
    -- Links externos (Encuentra24, Properstar, etc)
    link_externo    text,
    -- Metadata
    extra           jsonb not null default '{}'::jsonb,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    constraint uq_properties_codigo unique (agency_id, codigo)
);

create index idx_properties_agency_status on public.properties (agency_id, status, destacada desc)
    where status = 'disponible';
create index idx_properties_canton on public.properties (agency_id, canton, status)
    where status = 'disponible';
create index idx_properties_tipo on public.properties (agency_id, tipo, operacion, status)
    where status = 'disponible';
create index idx_properties_precio on public.properties (agency_id, precio)
    where status = 'disponible' and precio is not null;
create index idx_properties_search on public.properties using gin (titulo gin_trgm_ops);

-- ---------------------------------------------------------------------
-- Extender leads con campos de búsqueda inmobiliaria
-- ---------------------------------------------------------------------
alter table public.leads add column if not exists operacion_interes lead_operation_interest;
alter table public.leads add column if not exists tipo_interes property_type[];
alter table public.leads add column if not exists zonas_interes text[];
alter table public.leads add column if not exists presupuesto_min numeric(14,2);
alter table public.leads add column if not exists presupuesto_max numeric(14,2);
alter table public.leads add column if not exists dormitorios_min integer;
alter table public.leads add column if not exists property_interest_id uuid references public.properties(id) on delete set null;

create index if not exists idx_leads_presupuesto on public.leads (agency_id, presupuesto_min, presupuesto_max)
    where presupuesto_min is not null;

-- ---------------------------------------------------------------------
-- property_views — cuando un lead vio (le mandaron info de) una propiedad
-- ---------------------------------------------------------------------
create table public.property_views (
    id              uuid primary key default gen_random_uuid(),
    agency_id       uuid not null references public.agencies(id) on delete cascade,
    property_id     uuid not null references public.properties(id) on delete cascade,
    lead_id         uuid not null references public.leads(id) on delete cascade,
    conversation_id uuid references public.conversations(id) on delete set null,
    source          text not null default 'bot',     -- 'bot' | 'agent' | 'web'
    interaction_kind text,                            -- 'sent_info', 'sent_photo', 'sent_link'
    created_at      timestamptz not null default now()
);

create index idx_property_views_lead on public.property_views (lead_id, created_at desc);
create index idx_property_views_property on public.property_views (property_id, created_at desc);

-- ---------------------------------------------------------------------
-- visit_requests — visitas a propiedades
-- ---------------------------------------------------------------------
create table public.visit_requests (
    id              uuid primary key default gen_random_uuid(),
    agency_id       uuid not null references public.agencies(id) on delete cascade,
    lead_id         uuid not null references public.leads(id) on delete cascade,
    property_id     uuid not null references public.properties(id) on delete cascade,
    conversation_id uuid references public.conversations(id) on delete set null,
    -- Horario
    requested_at    timestamptz,                     -- cuándo quiere visitarla
    confirmed_at    timestamptz,
    completed_at    timestamptz,
    cancelled_at    timestamptz,
    -- Status
    status          visit_status not null default 'pending',
    -- Quién acompaña
    agent_user_id   uuid references auth.users(id) on delete set null,
    -- Notas
    customer_notes  text,
    internal_notes  text,
    extra           jsonb not null default '{}'::jsonb,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index idx_visits_agency_upcoming on public.visit_requests (agency_id, requested_at)
    where status in ('pending', 'confirmed') and requested_at > now();
create index idx_visits_lead on public.visit_requests (lead_id, created_at desc);
create index idx_visits_property on public.visit_requests (property_id, status);

-- ---------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------
drop trigger if exists tg_touch_updated_at on public.properties;
create trigger tg_touch_updated_at
    before update on public.properties
    for each row execute function app.touch_updated_at();

drop trigger if exists tg_touch_updated_at on public.visit_requests;
create trigger tg_touch_updated_at
    before update on public.visit_requests
    for each row execute function app.touch_updated_at();

-- =====================================================================
-- FIN plug-ins/inmobiliaria.sql
-- =====================================================================
