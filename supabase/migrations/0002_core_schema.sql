-- =====================================================================
-- 0002_core_schema.sql
-- Casa CRM — Core multi-tenant schema (tables, enums, indices, FKs).
-- Tenant boundary = `agency`. RLS is enabled in 0003; policies in 0004.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;     -- gen_random_uuid
create extension if not exists pg_trgm  with schema extensions;     -- fuzzy search on leads/properties
create extension if not exists citext   with schema extensions;     -- case-insensitive emails

-- ---------------------------------------------------------------------
-- Internal helper schema
-- ---------------------------------------------------------------------
create schema if not exists app;
comment on schema app is 'Internal helpers: RLS functions, triggers, denorm logic. Not exposed to PostgREST.';

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type agency_role          as enum ('owner', 'admin', 'agent', 'viewer');
create type agency_plan          as enum ('trial', 'starter', 'pro', 'enterprise');
create type lead_status          as enum ('nuevo', 'contactado', 'calificado', 'visita_agendada', 'en_negociacion', 'cerrado_ganado', 'cerrado_perdido', 'frio');
create type lead_source          as enum ('whatsapp', 'instagram', 'facebook_ads', 'sitio_web', 'referido', 'encuentra24', 'properstar', 'manual', 'otro');
create type lead_operation       as enum ('compra', 'alquiler', 'venta');
create type property_type        as enum ('casa', 'apartamento', 'villa', 'lote', 'local_comercial', 'oficina', 'edificio', 'finca', 'bodega');
create type property_operation   as enum ('venta', 'alquiler', 'alquiler_temporal');
create type property_status      as enum ('borrador', 'disponible', 'reservada', 'vendida', 'alquilada', 'pausada', 'archivada');
create type conversation_handler as enum ('bot', 'human', 'unassigned');
create type message_direction    as enum ('inbound', 'outbound');
create type message_sender_kind  as enum ('lead', 'bot', 'agent', 'system');
create type message_kind         as enum ('text', 'image', 'audio', 'video', 'document', 'location', 'template', 'interactive', 'sticker', 'system');
create type message_status       as enum ('queued', 'sent', 'delivered', 'read', 'failed');
create type task_origin          as enum ('manual', 'auto');
create type task_kind            as enum ('call', 'visit', 'meeting', 'followup', 'doc', 'message', 'reminder', 'reactivate');
create type task_status          as enum ('pending', 'in_progress', 'done', 'cancelled', 'overdue');
create type task_priority        as enum ('low', 'normal', 'high');
create type event_kind           as enum ('visit', 'call', 'meeting', 'openhouse', 'personal');
create type event_source         as enum ('crm', 'gcal');
create type document_category    as enum ('identificacion', 'financiero', 'contrato', 'propiedad', 'otro');
create type wa_template_status   as enum ('pending_review', 'approved', 'rejected', 'paused', 'disabled');
create type wa_template_category as enum ('MARKETING', 'UTILITY', 'AUTHENTICATION');
create type audit_action         as enum ('create', 'update', 'delete', 'login', 'export', 'send_message', 'state_change');

-- =====================================================================
-- TABLES
-- =====================================================================

-- ---------------------------------------------------------------------
-- agencies — tenant root
-- ---------------------------------------------------------------------
create table public.agencies (
    id                    uuid primary key default gen_random_uuid(),
    slug                  text not null,
    name                  text not null,
    legal_name            text,
    legal_id              text,
    country_code          text not null default 'CR',
    timezone              text not null default 'America/Costa_Rica',
    locale                text not null default 'es-CR',
    currency              text not null default 'USD',
    logo_url              text,
    primary_color         text,
    plan                  agency_plan not null default 'trial',
    trial_ends_at         timestamptz,
    bot_enabled           boolean not null default true,
    bot_handoff_keywords  text[] not null default '{}',
    bot_persona_prompt    text,
    settings              jsonb not null default '{}'::jsonb,
    archived_at           timestamptz,
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now(),
    constraint agencies_slug_format check (slug ~ '^[a-z0-9-]{3,40}$')
);

create unique index idx_agencies_slug on public.agencies (slug);
create index        idx_agencies_plan on public.agencies (plan) where archived_at is null;

comment on table  public.agencies is 'Tenant root. Each row is one customer (agente independiente o agencia). Soft-delete via archived_at.';
comment on column public.agencies.slug is 'URL-safe identifier (kebab-case). Used for public portal subdomains and deep-links.';
comment on column public.agencies.legal_id is 'Costa Rica cedula fisica or juridica. Free text, validated app-side.';
comment on column public.agencies.bot_persona_prompt is 'System prompt override for Claude when running this tenant''s bot. Editable only by Momentum in v1.';
comment on column public.agencies.bot_handoff_keywords is 'Trigger words that escalate bot conversations to human.';
comment on column public.agencies.settings is 'Bag for unstructured feature flags / tenant config.';

-- ---------------------------------------------------------------------
-- profiles — public user data (1:1 with auth.users)
-- ---------------------------------------------------------------------
create table public.profiles (
    id            uuid primary key references auth.users(id) on delete cascade,
    full_name     text not null,
    display_name  text,
    avatar_url    text,
    phone         text,
    locale        text not null default 'es-CR',
    email         text not null,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

create index idx_profiles_email on public.profiles (lower(email));

comment on table  public.profiles is 'Public mirror of auth.users with non-auth user attributes. Auto-created via trigger on auth.users insert.';
comment on column public.profiles.email is 'Denormalized from auth.users.email for query simplicity. Kept in sync via trigger.';

-- ---------------------------------------------------------------------
-- agency_members — N:M users <-> agencies
-- ---------------------------------------------------------------------
create table public.agency_members (
    id             uuid primary key default gen_random_uuid(),
    agency_id      uuid not null references public.agencies(id) on delete cascade,
    user_id        uuid not null references auth.users(id) on delete cascade,
    role           agency_role not null default 'agent',
    is_active      boolean not null default true,
    invited_by     uuid references auth.users(id) on delete set null,
    invited_at     timestamptz,
    accepted_at    timestamptz,
    last_seen_at   timestamptz,
    display_color  text,
    initials       text,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now(),
    constraint uq_members_agency_user unique (agency_id, user_id)
);

create index idx_members_agency on public.agency_members (agency_id) where is_active;
create index idx_members_user   on public.agency_members (user_id)   where is_active;

comment on table  public.agency_members is 'N:M bridge table. Source of truth for "what can this user see". Every RLS policy consults this. v1 enforces 1 agency per user app-side; schema already supports v2 multi-agency.';
comment on column public.agency_members.role is 'Permission level inside the agency. owner/admin/agent/viewer.';

-- ---------------------------------------------------------------------
-- whatsapp_numbers — YCloud-connected numbers (1 per agency in v1)
-- ---------------------------------------------------------------------
create table public.whatsapp_numbers (
    id                     uuid primary key default gen_random_uuid(),
    agency_id              uuid not null references public.agencies(id) on delete cascade,
    phone_number_id        text not null,
    waba_id                text not null,
    phone_number           text not null,
    display_name           text,
    is_default             boolean not null default true,
    is_active              boolean not null default true,
    coexistence_mode       boolean not null default true,
    connected_at           timestamptz not null default now(),
    last_inbound_at        timestamptz,
    last_outbound_at       timestamptz,
    metadata               jsonb not null default '{}'::jsonb,
    created_at             timestamptz not null default now(),
    updated_at             timestamptz not null default now(),
    constraint uq_wa_numbers_phone_number_id unique (phone_number_id),
    constraint uq_wa_numbers_phone_number    unique (phone_number)
);

create index idx_wa_numbers_agency on public.whatsapp_numbers (agency_id);
create index idx_wa_numbers_active on public.whatsapp_numbers (agency_id) where is_active;

comment on table  public.whatsapp_numbers is 'YCloud-connected WhatsApp numbers. CRITICAL: this is the bridge that lets the YCloud webhook resolve agency_id (via phone_number_id or phone_number).';
comment on column public.whatsapp_numbers.phone_number_id is 'YCloud/Meta internal phone_number_id. Looked up by webhook to resolve tenant.';
comment on column public.whatsapp_numbers.waba_id is 'WhatsApp Business Account ID owning this phone number.';
comment on column public.whatsapp_numbers.phone_number is 'E.164 (+50688887777). Looked up by webhook as `whatsappInboundMessage.to`.';
comment on column public.whatsapp_numbers.last_inbound_at is 'Updated when an inbound message arrives. Useful to detect inactivity windows.';

-- ---------------------------------------------------------------------
-- whatsapp_templates — GLOBAL catalog of Meta-approved templates
-- (Curated by Momentum centrally; no agency_id column.)
-- ---------------------------------------------------------------------
create table public.whatsapp_templates (
    id                  uuid primary key default gen_random_uuid(),
    ycloud_template_id  text,
    meta_template_name  text not null,
    language            text not null default 'es',
    name                text not null,
    description         text,
    category            wa_template_category not null,
    body                text not null,
    header              text,
    footer              text,
    merge_fields        jsonb not null default '[]'::jsonb,
    status              wa_template_status not null default 'pending_review',
    is_active           boolean not null default true,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),
    constraint uq_templates_name_lang unique (meta_template_name, language)
);

create index idx_templates_active   on public.whatsapp_templates (is_active) where is_active;
create index idx_templates_category on public.whatsapp_templates (category)  where is_active;

comment on table  public.whatsapp_templates is 'GLOBAL catalog of pre-approved WhatsApp templates. Curated centrally by Momentum (founder), not per-agency. Users of the CRM can VIEW the list, CHOOSE one, and CUSTOMIZE variable values before sending, but cannot edit the wording in v1.';
comment on column public.whatsapp_templates.ycloud_template_id is 'YCloud-side template id used to invoke the send API.';
comment on column public.whatsapp_templates.meta_template_name is 'Meta-side approved template name (e.g. "agendar_visita_v2").';
comment on column public.whatsapp_templates.merge_fields is 'Schema for variables: [{"key":"nombre","label":"Nombre","example":"Maria"}]';

-- ---------------------------------------------------------------------
-- properties
-- ---------------------------------------------------------------------
create table public.properties (
    id                 uuid primary key default gen_random_uuid(),
    agency_id          uuid not null references public.agencies(id) on delete cascade,
    code               text not null,
    title              text not null,
    slug               text,
    type               property_type not null,
    operation          property_operation not null,
    price              numeric(14,2) not null,
    currency           text not null default 'USD',
    bedrooms           int,
    bathrooms          numeric(3,1),
    area_built_m2      numeric(10,2),
    area_lot_m2        numeric(10,2),
    parking_spaces     int,
    country_code       text not null default 'CR',
    province           text,
    canton             text,
    district           text,
    neighborhood       text,
    address_line       text,
    location_text      text,
    latitude           numeric(9,6),
    longitude          numeric(9,6),
    description        text,
    features           text[] not null default '{}',
    images             jsonb  not null default '[]'::jsonb,
    external_url       text,
    status             property_status not null default 'borrador',
    featured           boolean not null default false,
    assigned_agent_id  uuid references auth.users(id) on delete set null,
    view_count         int not null default 0,
    lead_count         int not null default 0,
    published_at       timestamptz,
    archived_at        timestamptz,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now(),
    constraint uq_properties_agency_code unique (agency_id, code)
);

create unique index uq_properties_agency_slug         on public.properties (agency_id, slug) where slug is not null;
create        index idx_properties_agency_status     on public.properties (agency_id, status) where archived_at is null;
create        index idx_properties_agency_op_type    on public.properties (agency_id, operation, type) where archived_at is null;
create        index idx_properties_agency_featured   on public.properties (agency_id, featured) where featured and archived_at is null;
create        index idx_properties_assigned_agent   on public.properties (assigned_agent_id) where archived_at is null;
create        index idx_properties_agency_published on public.properties (agency_id, published_at desc) where status = 'disponible' and archived_at is null;

comment on table  public.properties is 'Real estate listings per agency. Multi-tenant via agency_id. Soft-delete via archived_at.';
comment on column public.properties.code is 'Internal code shown to customer (e.g. "CR-2031"). Unique per agency.';
comment on column public.properties.images is 'Array of [{"url":"...","alt":"...","order":0}].';
comment on column public.properties.lead_count is 'Denormalized count of leads interested in this property. Maintained via trigger on lead_property_interest.';
comment on column public.properties.view_count is 'Public portal page views. Incremented by edge function.';

-- ---------------------------------------------------------------------
-- leads
-- ---------------------------------------------------------------------
create table public.leads (
    id                 uuid primary key default gen_random_uuid(),
    agency_id          uuid not null references public.agencies(id) on delete cascade,
    full_name          text not null,
    display_name       text,
    phone_e164         text,
    email              text,
    whatsapp_id        text,
    ycloud_user_id     text,
    status             lead_status not null default 'nuevo',
    source             lead_source not null default 'whatsapp',
    source_detail      text,
    operation          lead_operation,
    interest_summary   text,
    budget_min         numeric(14,2),
    budget_max         numeric(14,2),
    budget_currency    text default 'USD',
    budget_label       text,
    assigned_agent_id  uuid references auth.users(id) on delete set null,
    score              int not null default 30,
    temperature        text not null default 'frio',
    notes              text,
    last_contact_at    timestamptz,
    last_inbound_at    timestamptz,
    last_outbound_at   timestamptz,
    first_seen_at      timestamptz not null default now(),
    archived_at        timestamptz,
    metadata           jsonb not null default '{}'::jsonb,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now(),
    constraint leads_score_range check (score between 0 and 100),
    constraint leads_temperature_values check (temperature in ('hot','tibio','medio','frio'))
);

create unique index uq_leads_agency_whatsapp     on public.leads (agency_id, whatsapp_id)    where whatsapp_id is not null;
create unique index uq_leads_agency_ycloud_user  on public.leads (agency_id, ycloud_user_id) where ycloud_user_id is not null;
create unique index uq_leads_agency_phone        on public.leads (agency_id, phone_e164)     where phone_e164 is not null;
create        index idx_leads_agency_status     on public.leads (agency_id, status) where archived_at is null;
create        index idx_leads_agency_assigned   on public.leads (agency_id, assigned_agent_id) where archived_at is null;
create        index idx_leads_agency_score      on public.leads (agency_id, score desc) where archived_at is null;
create        index idx_leads_agency_last_contact on public.leads (agency_id, last_contact_at desc nulls last);
create        index idx_leads_agency_temperature on public.leads (agency_id, temperature) where archived_at is null;
create        index idx_leads_name_trgm         on public.leads using gin (full_name extensions.gin_trgm_ops);

comment on table  public.leads is 'Prospects per agency. Dedup by ycloud_user_id (primary) or whatsapp_id or phone_e164.';
comment on column public.leads.whatsapp_id is 'wa_id returned by YCloud/Meta (not always equal to phone).';
comment on column public.leads.ycloud_user_id is 'Stable identifier from YCloud (e.g. CR.1469764404636161). Survives display-name renames and is the preferred dedup key.';
comment on column public.leads.score is '0..100 calculated by app.calc_lead_score(). Recomputed via triggers on related changes.';
comment on column public.leads.temperature is 'Denormalized bucket of score for fast filtering: hot|tibio|medio|frio.';

-- ---------------------------------------------------------------------
-- tags — per-agency labels
-- ---------------------------------------------------------------------
create table public.tags (
    id          uuid primary key default gen_random_uuid(),
    agency_id   uuid not null references public.agencies(id) on delete cascade,
    name        text not null,
    color       text,
    system      boolean not null default false,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create unique index uq_tags_agency_name on public.tags (agency_id, lower(name));
create        index idx_tags_agency    on public.tags (agency_id);

comment on table  public.tags is 'Lead labels per agency. system=true marks auto-generated tags (e.g. "Hot", "Pre-aprobado").';

-- ---------------------------------------------------------------------
-- lead_tags — N:M leads <-> tags
-- ---------------------------------------------------------------------
create table public.lead_tags (
    lead_id     uuid not null references public.leads(id) on delete cascade,
    tag_id      uuid not null references public.tags(id)  on delete cascade,
    agency_id   uuid not null references public.agencies(id) on delete cascade,
    created_at  timestamptz not null default now(),
    primary key (lead_id, tag_id)
);

create index idx_lead_tags_tag    on public.lead_tags (tag_id);
create index idx_lead_tags_agency on public.lead_tags (agency_id);

comment on table  public.lead_tags is 'N:M lead<->tag. Redundant agency_id is intentional: lets RLS policy skip a join (10x faster). Kept in sync by trigger.';

-- ---------------------------------------------------------------------
-- lead_property_interest — which properties a lead is interested in
-- ---------------------------------------------------------------------
create table public.lead_property_interest (
    id             uuid primary key default gen_random_uuid(),
    agency_id      uuid not null references public.agencies(id) on delete cascade,
    lead_id        uuid not null references public.leads(id) on delete cascade,
    property_id    uuid not null references public.properties(id) on delete cascade,
    interest_level int  not null default 1,
    source         text,
    created_at     timestamptz not null default now(),
    constraint lpi_interest_range check (interest_level between 1 and 5),
    constraint uq_lpi_lead_property unique (lead_id, property_id)
);

create index idx_lpi_agency   on public.lead_property_interest (agency_id);
create index idx_lpi_property on public.lead_property_interest (property_id);
create index idx_lpi_lead     on public.lead_property_interest (lead_id);

comment on table  public.lead_property_interest is 'N:M lead<->property. source can be bot_suggested|lead_asked|agent_added. Drives properties.lead_count denorm.';

-- ---------------------------------------------------------------------
-- conversations — one per (agency_id, lead_id) for life
-- ---------------------------------------------------------------------
create table public.conversations (
    id                         uuid primary key default gen_random_uuid(),
    agency_id                  uuid not null references public.agencies(id) on delete cascade,
    lead_id                    uuid not null references public.leads(id) on delete cascade,
    whatsapp_number_id         uuid not null references public.whatsapp_numbers(id) on delete restrict,
    channel                    text not null default 'whatsapp',
    handler                    conversation_handler not null default 'bot',
    assigned_agent_id          uuid references auth.users(id) on delete set null,
    pinned                     boolean not null default false,
    unread_count               int not null default 0,
    last_message_at            timestamptz,
    last_message_preview       text,
    last_message_sender_kind   message_sender_kind,
    last_inbound_at            timestamptz,
    last_outbound_at           timestamptz,
    bot_paused_until           timestamptz,
    handoff_reason             text,
    archived_at                timestamptz,
    created_at                 timestamptz not null default now(),
    updated_at                 timestamptz not null default now(),
    constraint uq_conversations_agency_lead unique (agency_id, lead_id)
);

create index idx_conversations_agency_handler on public.conversations (agency_id, handler) where archived_at is null;
create index idx_conversations_agency_lastmsg on public.conversations (agency_id, last_message_at desc nulls last) where archived_at is null;
create index idx_conversations_assigned       on public.conversations (assigned_agent_id) where archived_at is null;
create index idx_conversations_agency_unread  on public.conversations (agency_id, unread_count) where unread_count > 0 and archived_at is null;

comment on table  public.conversations is 'ONE conversation per (agency_id, lead_id) FOR LIFE. Do NOT create a new one per 24h-window. The "WhatsApp 24h window closed" rule is computed client-side from last_inbound_at.';
comment on column public.conversations.last_inbound_at is 'Updated every time a message from the lead arrives. UI computes window-open as (now() - last_inbound_at < 24h).';
comment on column public.conversations.bot_paused_until is 'If an agent takes over manually, the bot is muted until this timestamp.';
comment on column public.conversations.unread_count is 'Denormalized count of unread inbound messages. Maintained by trigger.';

-- ---------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------
create table public.messages (
    id                    uuid primary key default gen_random_uuid(),
    agency_id             uuid not null references public.agencies(id) on delete cascade,
    conversation_id       uuid not null references public.conversations(id) on delete cascade,
    lead_id               uuid not null references public.leads(id) on delete cascade,
    direction             message_direction not null,
    sender_kind           message_sender_kind not null,
    sender_user_id        uuid references auth.users(id) on delete set null,
    kind                  message_kind not null default 'text',
    body                  text,
    media_url             text,
    media_mime            text,
    media_metadata        jsonb,
    template_id           uuid references public.whatsapp_templates(id) on delete set null,
    template_variables    jsonb,
    property_card_id      uuid references public.properties(id) on delete set null,
    status                message_status not null default 'queued',
    ycloud_message_id     text,
    wa_message_id         text,
    error_code            text,
    error_message         text,
    reply_to_message_id   uuid references public.messages(id) on delete set null,
    is_bot_generated      boolean not null default false,
    bot_reasoning         jsonb,
    pricing_category      text,
    total_price           numeric(12,6),
    sent_at               timestamptz,
    delivered_at          timestamptz,
    read_at               timestamptz,
    created_at            timestamptz not null default now()
);

create        index idx_messages_conversation_created on public.messages (conversation_id, created_at desc);
create        index idx_messages_agency_created       on public.messages (agency_id, created_at desc);
create        index idx_messages_lead_created         on public.messages (lead_id, created_at desc);
create unique index uq_messages_ycloud_id             on public.messages (ycloud_message_id) where ycloud_message_id is not null;
create unique index uq_messages_wa_id                 on public.messages (wa_message_id)     where wa_message_id is not null;
create        index idx_messages_status_unsent        on public.messages (agency_id, status) where status in ('queued','failed');

comment on table  public.messages is 'Every message exchanged on every channel. Immutable except status timestamps. UPSERT by wa_message_id (universal dedup key from YCloud).';
comment on column public.messages.wa_message_id is 'Meta-assigned wamid (e.g. wamid.HBg...). Universal dedup key from YCloud webhooks.';
comment on column public.messages.ycloud_message_id is 'YCloud-internal message id, for reconciling status webhooks.';
comment on column public.messages.is_bot_generated is 'True if Claude generated it (subset of sender_kind=bot).';
comment on column public.messages.pricing_category is 'YCloud-reported pricingCategory for outbound messages (analytics).';
comment on column public.messages.total_price is 'YCloud-reported totalPrice for outbound messages.';

-- ---------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------
create table public.tasks (
    id                    uuid primary key default gen_random_uuid(),
    agency_id             uuid not null references public.agencies(id) on delete cascade,
    lead_id               uuid references public.leads(id) on delete cascade,
    property_id           uuid references public.properties(id) on delete cascade,
    assigned_to           uuid references auth.users(id) on delete set null,
    origin                task_origin not null default 'manual',
    kind                  task_kind not null,
    title                 text not null,
    notes                 text,
    due_at                timestamptz,
    location              text,
    status                task_status not null default 'pending',
    priority              task_priority not null default 'normal',
    completed_at          timestamptz,
    created_by            uuid references auth.users(id) on delete set null,
    bot_workflow_run_id   text,
    metadata              jsonb not null default '{}'::jsonb,
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now()
);

create index idx_tasks_agency_status_due on public.tasks (agency_id, status, due_at nulls last);
create index idx_tasks_assigned_status   on public.tasks (assigned_to, status) where status in ('pending','in_progress');
create index idx_tasks_lead              on public.tasks (lead_id)     where lead_id is not null;
create index idx_tasks_property          on public.tasks (property_id) where property_id is not null;
create index idx_tasks_overdue           on public.tasks (agency_id, due_at) where status = 'pending' and due_at is not null;

comment on table  public.tasks is 'To-do items for the agent. Can be standalone, attached to a lead, attached to a property, or both.';
comment on column public.tasks.bot_workflow_run_id is 'N8N execution id (for tracing tasks auto-created by the bot).';

-- ---------------------------------------------------------------------
-- documents
-- ---------------------------------------------------------------------
create table public.documents (
    id                    uuid primary key default gen_random_uuid(),
    agency_id             uuid not null references public.agencies(id) on delete cascade,
    lead_id               uuid references public.leads(id) on delete cascade,
    property_id           uuid references public.properties(id) on delete cascade,
    name                  text not null,
    storage_path          text not null,
    mime_type             text not null,
    size_bytes            bigint not null,
    category              document_category not null default 'otro',
    uploaded_by_user_id   uuid references auth.users(id) on delete set null,
    uploaded_by_lead      boolean not null default false,
    source_message_id     uuid references public.messages(id) on delete set null,
    metadata              jsonb not null default '{}'::jsonb,
    archived_at           timestamptz,
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now()
);

create index idx_documents_lead     on public.documents (lead_id)     where archived_at is null;
create index idx_documents_property on public.documents (property_id) where archived_at is null;
create index idx_documents_agency   on public.documents (agency_id, created_at desc) where archived_at is null;

comment on table  public.documents is 'File metadata for objects in Storage bucket lead-documents. Storage path must be prefixed by agency_id for physical isolation.';
comment on column public.documents.storage_path is 'Full path inside the bucket, prefixed by <agency_id>/. Read via signed URL only.';

-- ---------------------------------------------------------------------
-- events — calendar
-- ---------------------------------------------------------------------
create table public.events (
    id               uuid primary key default gen_random_uuid(),
    agency_id        uuid not null references public.agencies(id) on delete cascade,
    title            text not null,
    kind             event_kind not null,
    lead_id          uuid references public.leads(id) on delete set null,
    property_id      uuid references public.properties(id) on delete set null,
    assigned_to      uuid references auth.users(id) on delete set null,
    starts_at        timestamptz not null,
    ends_at          timestamptz not null,
    all_day          boolean not null default false,
    location         text,
    notes            text,
    source           event_source not null default 'crm',
    gcal_event_id    text,
    gcal_calendar_id text,
    synced_at        timestamptz,
    created_by       uuid references auth.users(id) on delete set null,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    constraint ck_events_time_order check (ends_at >= starts_at)
);

create        index idx_events_agency_starts   on public.events (agency_id, starts_at);
create        index idx_events_assigned_starts on public.events (assigned_to, starts_at);
create        index idx_events_lead            on public.events (lead_id)     where lead_id is not null;
create        index idx_events_property        on public.events (property_id) where property_id is not null;
create unique index uq_events_gcal             on public.events (gcal_event_id, gcal_calendar_id) where gcal_event_id is not null;

comment on table  public.events is 'Calendar items: visits, calls, meetings. Optionally synced to Google Calendar (v2).';

-- ---------------------------------------------------------------------
-- audit_log — append-only audit trail
-- ---------------------------------------------------------------------
create table public.audit_log (
    id            bigint generated always as identity primary key,
    agency_id     uuid not null references public.agencies(id) on delete cascade,
    actor_user_id uuid references auth.users(id) on delete set null,
    actor_kind    text not null default 'user',
    action        audit_action not null,
    entity_type   text not null,
    entity_id     uuid,
    summary       text not null,
    diff          jsonb,
    request_id    text,
    created_at    timestamptz not null default now()
);

create index idx_audit_agency_created on public.audit_log (agency_id, created_at desc);
create index idx_audit_entity         on public.audit_log (entity_type, entity_id);
create index idx_audit_actor          on public.audit_log (actor_user_id) where actor_user_id is not null;

comment on table  public.audit_log is 'Append-only audit trail per agency. Never UPDATE or DELETE. actor_kind: user|bot|system|n8n.';
comment on column public.audit_log.request_id is 'Correlation id (e.g. N8N execution id, edge function request id).';
