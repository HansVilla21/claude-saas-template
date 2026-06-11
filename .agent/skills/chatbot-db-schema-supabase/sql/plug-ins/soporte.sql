-- =====================================================================
-- plug-ins/soporte.sql
--
-- Plug-in para chatbots de ATENCIÓN AL CLIENTE / HELPDESK:
--   - SaaS con soporte L1/L2
--   - Servicios donde los clientes tienen tickets recurrentes
--   - Bots que primero intentan resolver con knowledge base y escalan
--
-- Aporta:
--   - ticket_categories
--   - tickets (un ticket por consulta, vincula a conversation)
--   - ticket_comments (notas internas + respuestas)
--   - kb_articles (opcional: knowledge base para auto-respuestas)
--
-- Requiere: 0001_core.sql aplicado previamente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type ticket_status as enum (
    'open',                -- recién creado, sin asignar
    'in_progress',         -- alguien está trabajando
    'waiting_customer',    -- esperamos respuesta del cliente
    'waiting_third_party', -- esperamos a un proveedor externo
    'resolved',            -- resuelto, esperando confirmación
    'closed',              -- cerrado definitivamente
    'reopened'             -- el cliente lo abrió de nuevo
);

create type ticket_priority as enum ('low', 'normal', 'high', 'urgent');

create type ticket_channel as enum (
    'chatbot',   -- creado por el bot desde WhatsApp/IG/etc
    'manual',    -- creado a mano por un agente
    'email',     -- vinculado a un email entrante
    'api'        -- creado vía API externa
);

-- ---------------------------------------------------------------------
-- ticket_categories
-- ---------------------------------------------------------------------
create table public.ticket_categories (
    id              uuid primary key default gen_random_uuid(),
    agency_id       uuid not null references public.agencies(id) on delete cascade,
    name            text not null,                   -- "Facturación", "Técnico", "General"
    slug            text not null,
    description     text,
    color           text default '#888888',
    -- SLA targets en horas (opcionales)
    sla_first_response_hours integer,
    sla_resolution_hours integer,
    -- Auto-asignación
    default_assignee_id uuid references auth.users(id) on delete set null,
    is_active       boolean not null default true,
    display_order   integer not null default 0,
    created_at      timestamptz not null default now(),
    constraint uq_ticket_categories unique (agency_id, slug)
);

create index idx_ticket_categories_agency on public.ticket_categories (agency_id, display_order) where is_active = true;

-- ---------------------------------------------------------------------
-- tickets
-- ---------------------------------------------------------------------
create table public.tickets (
    id              uuid primary key default gen_random_uuid(),
    agency_id       uuid not null references public.agencies(id) on delete cascade,
    lead_id         uuid not null references public.leads(id) on delete cascade,
    conversation_id uuid references public.conversations(id) on delete set null,
    category_id     uuid references public.ticket_categories(id) on delete set null,
    -- Numeración legible
    ticket_number   text not null,                   -- "TKT-2026-0042"
    -- Contenido
    subject         text not null,
    description     text,                            -- primer mensaje del cliente / resumen del bot
    -- Status + priority
    status          ticket_status not null default 'open',
    priority        ticket_priority not null default 'normal',
    -- Assignment
    assigned_user_id uuid references auth.users(id) on delete set null,
    assigned_at     timestamptz,
    -- SLA tracking
    sla_first_response_at timestamptz,              -- calculated on insert from category SLA
    sla_resolution_at timestamptz,
    first_response_at timestamptz,                  -- cuando el primer agente responde
    resolved_at     timestamptz,
    closed_at       timestamptz,
    reopened_count  integer not null default 0,
    -- Source
    source_channel  ticket_channel not null default 'chatbot',
    -- CSAT (post-resolución)
    csat_score      integer check (csat_score is null or csat_score between 1 and 5),
    csat_comment    text,
    csat_at         timestamptz,
    -- Tags + metadata
    tags            text[],
    extra           jsonb not null default '{}'::jsonb,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    constraint uq_tickets_number unique (agency_id, ticket_number)
);

create index idx_tickets_agency_status on public.tickets (agency_id, status, priority, created_at desc);
create index idx_tickets_assigned on public.tickets (assigned_user_id, status)
    where status in ('open', 'in_progress', 'waiting_customer');
create index idx_tickets_lead on public.tickets (lead_id, created_at desc);
create index idx_tickets_sla_breach on public.tickets (agency_id, sla_first_response_at)
    where status = 'open' and first_response_at is null;
create index idx_tickets_unresolved on public.tickets (agency_id, priority, created_at)
    where status not in ('resolved', 'closed');

-- ---------------------------------------------------------------------
-- ticket_comments — actualizaciones internas + respuestas al cliente
-- ---------------------------------------------------------------------
create table public.ticket_comments (
    id              uuid primary key default gen_random_uuid(),
    agency_id       uuid not null references public.agencies(id) on delete cascade,
    ticket_id       uuid not null references public.tickets(id) on delete cascade,
    author_user_id  uuid references auth.users(id) on delete set null,
    author_kind     text not null default 'agent',   -- 'agent' | 'bot' | 'system' | 'customer'
    -- Content
    body            text not null,
    -- Visibilidad
    is_internal     boolean not null default false,  -- true = nota privada del equipo
    -- Si esta respuesta corresponde a un mensaje saliente real
    message_id      uuid references public.messages(id) on delete set null,
    -- Attachments
    attachment_urls text[],
    created_at      timestamptz not null default now()
);

create index idx_ticket_comments_ticket on public.ticket_comments (ticket_id, created_at);
create index idx_ticket_comments_internal on public.ticket_comments (ticket_id, is_internal, created_at desc);

-- ---------------------------------------------------------------------
-- kb_articles — Knowledge Base (para que el bot auto-responda)
-- ---------------------------------------------------------------------
create table public.kb_articles (
    id              uuid primary key default gen_random_uuid(),
    agency_id       uuid not null references public.agencies(id) on delete cascade,
    title           text not null,
    slug            text not null,
    body            text not null,                   -- markdown
    summary         text,                            -- 1-2 líneas para que el bot lo mencione
    category_id     uuid references public.ticket_categories(id) on delete set null,
    tags            text[],
    -- Embeddings (si usás búsqueda semántica con pgvector)
    -- Comentado por default — si lo necesitás, descomenta + crea extension vector
    -- embedding   vector(1536),
    is_published    boolean not null default true,
    view_count      integer not null default 0,
    helpful_count   integer not null default 0,
    not_helpful_count integer not null default 0,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    constraint uq_kb_articles_slug unique (agency_id, slug)
);

create index idx_kb_articles_agency_published on public.kb_articles (agency_id, updated_at desc) where is_published = true;
create index idx_kb_articles_search on public.kb_articles using gin (title gin_trgm_ops);

-- ---------------------------------------------------------------------
-- Trigger: setear SLA targets al crear ticket
-- ---------------------------------------------------------------------
create or replace function app.set_ticket_sla_targets()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    cat record;
begin
    if NEW.category_id is not null then
        select sla_first_response_hours, sla_resolution_hours, default_assignee_id
          into cat
          from public.ticket_categories
         where id = NEW.category_id;

        if cat.sla_first_response_hours is not null and NEW.sla_first_response_at is null then
            NEW.sla_first_response_at := NEW.created_at + (cat.sla_first_response_hours || ' hours')::interval;
        end if;
        if cat.sla_resolution_hours is not null and NEW.sla_resolution_at is null then
            NEW.sla_resolution_at := NEW.created_at + (cat.sla_resolution_hours || ' hours')::interval;
        end if;
        if cat.default_assignee_id is not null and NEW.assigned_user_id is null then
            NEW.assigned_user_id := cat.default_assignee_id;
            NEW.assigned_at := now();
        end if;
    end if;
    return NEW;
end;
$$;

drop trigger if exists tg_set_ticket_sla on public.tickets;
create trigger tg_set_ticket_sla
    before insert on public.tickets
    for each row execute function app.set_ticket_sla_targets();

-- ---------------------------------------------------------------------
-- Trigger: actualizar first_response_at cuando un agent comenta no-internal
-- ---------------------------------------------------------------------
create or replace function app.set_ticket_first_response()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if NEW.author_kind in ('agent', 'bot') and NEW.is_internal = false then
        update public.tickets
           set first_response_at = coalesce(first_response_at, NEW.created_at),
               status = case when status = 'open' then 'in_progress' else status end,
               updated_at = now()
         where id = NEW.ticket_id;
    end if;
    return NEW;
end;
$$;

drop trigger if exists tg_set_ticket_first_response on public.ticket_comments;
create trigger tg_set_ticket_first_response
    after insert on public.ticket_comments
    for each row execute function app.set_ticket_first_response();

-- ---------------------------------------------------------------------
-- Trigger: registrar resolved_at / closed_at al cambiar status
-- ---------------------------------------------------------------------
create or replace function app.set_ticket_resolution_timestamps()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if NEW.status = 'resolved' and (OLD.status is null or OLD.status != 'resolved') then
        NEW.resolved_at := coalesce(NEW.resolved_at, now());
    end if;
    if NEW.status = 'closed' and (OLD.status is null or OLD.status != 'closed') then
        NEW.closed_at := coalesce(NEW.closed_at, now());
    end if;
    if NEW.status = 'reopened' and OLD.status in ('resolved', 'closed') then
        NEW.reopened_count := OLD.reopened_count + 1;
        NEW.resolved_at := null;
        NEW.closed_at := null;
    end if;
    return NEW;
end;
$$;

drop trigger if exists tg_set_ticket_resolution on public.tickets;
create trigger tg_set_ticket_resolution
    before update of status on public.tickets
    for each row execute function app.set_ticket_resolution_timestamps();

-- ---------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------
do $$
declare
    t text;
begin
    foreach t in array array['tickets', 'kb_articles']
    loop
        execute format('drop trigger if exists tg_touch_updated_at on public.%I', t);
        execute format('create trigger tg_touch_updated_at before update on public.%I for each row execute function app.touch_updated_at()', t);
    end loop;
end $$;

-- =====================================================================
-- FIN plug-ins/soporte.sql
-- =====================================================================
