-- =====================================================================
-- 0001_core.sql
-- Schema CORE genérico para CHATBOTS multi-canal en Supabase.
-- Destilado del schema en producción de Casa CRM (mayo 2026).
-- Sin lógica de nicho: agencies / users / leads / conversations / messages
-- / tasks / tags / custom_fields. Multi-canal de fábrica (WhatsApp, IG,
-- Messenger, web, SMS).
-- =====================================================================
--
-- Uso típico:
--   1) supabase project nuevo
--   2) Aplicar este archivo (extensions + enums + tablas core)
--   3) Aplicar 0002_rls.sql (policies preparadas, off por default)
--   4) Aplicar 0003_triggers_realtime.sql
--   5) Cargar UNO de los plug-ins/<nicho>.sql según el chatbot
--   6) (Opcional) seed-demo.sql para validar con data de prueba
--
-- Decisión clave: agency_id está en TODAS las tablas desde día 1
-- aunque AHORA cada cliente sea single-tenant. Esto permite migrar a
-- multi-tenant compartido sin reestructurar (solo activar RLS + cargar
-- el agency_id correcto). Ver docs/01-arquitectura.md.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;     -- gen_random_uuid
create extension if not exists pg_trgm  with schema extensions;     -- fuzzy text search
create extension if not exists citext   with schema extensions;     -- case-insensitive email

-- ---------------------------------------------------------------------
-- Schema interno (helpers, no expuesto a PostgREST)
-- ---------------------------------------------------------------------
create schema if not exists app;
comment on schema app is 'Internal helpers: RLS functions, triggers, denorm logic. Not exposed to PostgREST/REST.';

-- =====================================================================
-- ENUMS
-- =====================================================================

-- Roles dentro de una agency (cuando uses CRM)
create type agency_role         as enum ('owner', 'admin', 'agent', 'viewer');

-- Planes de billing (si tu chatbot factura — opcional para single-tenant)
create type agency_plan         as enum ('trial', 'starter', 'pro', 'enterprise', 'custom');

-- Canales soportados. Agregar valores cuando integres un canal nuevo:
--   alter type message_channel add value 'telegram';
create type message_channel     as enum (
    'whatsapp',
    'messenger',
    'instagram',
    'web',
    'sms',
    'email',
    'voice',
    'manual'      -- carga manual desde CRM por un agente humano
);

-- Status del lead en el pipeline (genérico, cada nicho puede no usarlo)
create type lead_status         as enum (
    'nuevo',
    'contactado',
    'calificado',
    'en_proceso',
    'cerrado_ganado',
    'cerrado_perdido',
    'frio'
);

-- De dónde vino el lead
create type lead_source         as enum (
    'whatsapp',
    'instagram',
    'messenger',
    'facebook_ads',
    'sitio_web',
    'referido',
    'campaign',
    'manual',
    'otro'
);

-- Quién maneja la conversación: bot, humano, o nadie
create type conversation_handler as enum ('bot', 'human', 'unassigned');

-- Status del handoff bot → humano (ortogonal al pipeline del lead)
create type conversation_handoff_status as enum ('none', 'pending', 'handled');
create type conversation_handoff_reason as enum (
    'qualified',           -- lead listo para cierre
    'scheduling',          -- quiere agendar
    'objection_complex',   -- objeción que el bot no maneja
    'bot_stuck',           -- bot dando vueltas
    'user_requested',      -- lead pidió hablar con humano
    'manual'               -- agente tomó la conversación manualmente
);

-- Mensajes
create type message_direction   as enum ('inbound', 'outbound');
create type message_sender_kind as enum ('lead', 'bot', 'agent', 'system');
create type message_kind        as enum (
    'text', 'image', 'audio', 'video', 'document',
    'location', 'template', 'interactive', 'sticker', 'system'
);
create type message_status      as enum ('queued', 'sent', 'delivered', 'read', 'failed');

-- Tareas (recordatorios, seguimientos, escalaciones)
create type task_origin         as enum ('manual', 'auto');
create type task_kind           as enum ('call', 'meeting', 'followup', 'doc', 'message', 'reminder', 'visit', 'reactivate');
create type task_status         as enum ('pending', 'in_progress', 'done', 'cancelled', 'overdue');
create type task_priority       as enum ('low', 'normal', 'high', 'urgent');

-- Auditoría
create type audit_action        as enum ('create', 'update', 'delete', 'login', 'export', 'send_message', 'state_change');


-- =====================================================================
-- TABLES — CORE
-- =====================================================================

-- ---------------------------------------------------------------------
-- agencies — tenant root
-- ---------------------------------------------------------------------
-- En single-tenant: crear UNA fila, todas las demás filas la referencian.
-- En multi-tenant futuro: cada cliente = una row, RLS aisla.
-- ---------------------------------------------------------------------
create table public.agencies (
    id              uuid primary key default gen_random_uuid(),
    slug            text not null,
    name            text not null,
    legal_name      text,
    legal_id        text,                              -- cédula jurídica / tax id
    country_code    text not null default 'CR',        -- ISO 3166-1 alpha-2
    timezone        text not null default 'America/Costa_Rica',
    currency        text not null default 'CRC',       -- ISO 4217
    plan            agency_plan not null default 'trial',
    settings        jsonb not null default '{}'::jsonb, -- prefs UI, branding, etc.
    is_active       boolean not null default true,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    constraint uq_agencies_slug unique (slug)
);
comment on table public.agencies is 'Tenant root. En single-tenant deployments hay una sola row. Multi-tenant: N rows con RLS.';

-- ---------------------------------------------------------------------
-- agency_members — quién tiene acceso a qué agency (cuando uses CRM)
-- ---------------------------------------------------------------------
-- Opcional para single-tenant sin UI multi-usuario. Skipear si solo
-- usás el chatbot + Supabase Studio.
-- ---------------------------------------------------------------------
create table public.agency_members (
    id              uuid primary key default gen_random_uuid(),
    agency_id       uuid not null references public.agencies(id) on delete cascade,
    user_id         uuid references auth.users(id) on delete cascade,  -- nullable si invitación pendiente
    email           citext not null,
    role            agency_role not null default 'agent',
    is_active       boolean not null default true,
    invited_at      timestamptz default now(),
    accepted_at     timestamptz,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    constraint uq_agency_members_email unique (agency_id, email)
);

-- ---------------------------------------------------------------------
-- agency_channels — credenciales/config por canal+agency
-- ---------------------------------------------------------------------
-- Una row por (agency_id, channel) cuando un cliente conecta su canal.
-- Ejemplo: agency_X conecta WhatsApp → 1 row con channel='whatsapp' +
-- phone_number, wa_business_id, etc. Cuando conecta Instagram → otra row.
--
-- Para single-tenant: cada chatbot tiene 1-N rows aquí.
-- ---------------------------------------------------------------------
create table public.agency_channels (
    id              uuid primary key default gen_random_uuid(),
    agency_id       uuid not null references public.agencies(id) on delete cascade,
    channel         message_channel not null,
    -- Identifiers genéricos. Cada canal usa los que aplican.
    phone_number    text,                -- WhatsApp, SMS, voice
    wa_business_id  text,                -- WhatsApp Business Account ID
    page_id         text,                -- Messenger / Instagram (Facebook Page)
    page_access_token text,              -- token long-lived (renovar c/60d en IG/Messenger)
    page_token_expires_at timestamptz,
    instagram_account_id text,           -- IG Business Account ID
    webhook_url     text,                -- URL del endpoint propio (para referencia)
    webhook_secret  text,                -- HMAC secret para verificar entrantes
    is_active       boolean not null default true,
    extra           jsonb not null default '{}'::jsonb,  -- campo libre para data específica del canal
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    constraint uq_agency_channels_unique unique (agency_id, channel, phone_number, page_id)
);
comment on table public.agency_channels is 'Una row por canal conectado de cada agency. Cuando agregás Instagram, insertás una row con channel=instagram y page_id correspondiente.';

-- ---------------------------------------------------------------------
-- leads — quien escribe al chatbot
-- ---------------------------------------------------------------------
-- "Lead" es genérico: puede ser prospecto comercial, paciente, cliente
-- de soporte, comprador, etc. La tabla guarda al CONTACTO. El uso
-- (comprar, agendar cita, abrir ticket) lo definen las tablas plug-in.
-- ---------------------------------------------------------------------
create table public.leads (
    id              uuid primary key default gen_random_uuid(),
    agency_id       uuid not null references public.agencies(id) on delete cascade,
    -- Identificación
    full_name       text,
    display_name    text,                -- el nombre que muestra el canal (WA profile name)
    phone           text,                -- E.164 preferido: +50688112233
    email           citext,
    -- IDs externos por canal — el lead puede tener varios
    wa_user_id      text,                -- ID del usuario en WhatsApp
    ig_user_id      text,                -- ID en Instagram
    fb_user_id      text,                -- ID en Messenger
    external_ref    text,                -- ref custom (CRM externo, lead ID original Airtable, etc.)
    -- Origen
    source          lead_source not null default 'whatsapp',
    source_detail   text,                -- ej: nombre de la campaña, ID del anuncio
    -- Pipeline
    status          lead_status not null default 'nuevo',
    score           integer check (score is null or score between 0 and 100),
    assigned_user_id uuid references auth.users(id) on delete set null,
    -- Flags
    is_qualified    boolean not null default false,
    is_blocked      boolean not null default false,
    blocked_reason  text,
    -- Timestamps
    first_contact_at timestamptz,
    last_contact_at  timestamptz,
    last_message_at  timestamptz,
    -- Metadata
    notes           text,
    extra           jsonb not null default '{}'::jsonb,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    -- Único por canal+ID externo (un lead = un usuario único por canal)
    constraint uq_leads_wa unique (agency_id, wa_user_id),
    constraint uq_leads_ig unique (agency_id, ig_user_id),
    constraint uq_leads_fb unique (agency_id, fb_user_id)
);
comment on table public.leads is 'Contacto que interactúa con el chatbot. El propósito comercial lo definen las tablas plug-in (appointments, orders, tickets).';

create index idx_leads_agency_status on public.leads (agency_id, status) where is_blocked = false;
create index idx_leads_agency_phone  on public.leads (agency_id, phone)  where phone is not null;
create index idx_leads_agency_last   on public.leads (agency_id, last_message_at desc nulls last);
create index idx_leads_search_name   on public.leads using gin (full_name gin_trgm_ops);

-- ---------------------------------------------------------------------
-- conversations — 1 conversación por (agency, lead, channel) PARA SIEMPRE
-- ---------------------------------------------------------------------
-- Regla: NO crear conversación nueva cada 24h. Una conversación es la
-- línea de mensajes con ese lead en ese canal — para siempre.
-- Si el lead escribe por WhatsApp Y por Instagram, son 2 conversations.
-- La "ventana 24h de WhatsApp" se computa client-side: now() - last_inbound_at < 24h.
-- ---------------------------------------------------------------------
create table public.conversations (
    id              uuid primary key default gen_random_uuid(),
    agency_id       uuid not null references public.agencies(id) on delete cascade,
    lead_id         uuid not null references public.leads(id) on delete cascade,
    channel         message_channel not null,
    -- Handler + handoff
    handler         conversation_handler not null default 'bot',
    bot_paused_until timestamptz,                -- pausa temporal del bot
    handoff_status  conversation_handoff_status not null default 'none',
    handoff_reason  conversation_handoff_reason,
    handoff_summary text,                        -- resumen para el agente cuando hay handoff
    handoff_at      timestamptz,
    handoff_task_id uuid,                        -- FK a tasks (set por trigger)
    assigned_user_id uuid references auth.users(id) on delete set null,
    -- Denormalized para UI / queries rápidas
    unread_count    integer not null default 0,
    last_inbound_at timestamptz,                 -- para computar ventana 24h
    last_outbound_at timestamptz,
    last_message_at timestamptz,
    last_message_preview text,                   -- primeras 200 chars del último msg
    -- Flags
    archived_at     timestamptz,
    -- Metadata
    extra           jsonb not null default '{}'::jsonb,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    constraint uq_conversations_agency_lead_channel unique (agency_id, lead_id, channel)
);
comment on table public.conversations is 'UNA conversación por (agency, lead, canal) PARA SIEMPRE. Multi-canal: si el lead escribe por WA e IG, son 2 conversations.';

create index idx_conversations_agency_handler on public.conversations (agency_id, handler) where archived_at is null;
create index idx_conversations_agency_lastmsg on public.conversations (agency_id, last_message_at desc nulls last) where archived_at is null;
create index idx_conversations_handoff_pending on public.conversations (agency_id, handoff_at desc nulls last) where handoff_status = 'pending';
create index idx_conversations_unread on public.conversations (agency_id, unread_count) where unread_count > 0 and archived_at is null;

-- ---------------------------------------------------------------------
-- messages — cada mensaje (inbound/outbound) en cada conversación
-- ---------------------------------------------------------------------
-- Idempotencia: usar `wa_message_id` / `external_id` para evitar duplicados
-- cuando el BSP/canal reenvía un webhook.
-- ---------------------------------------------------------------------
create table public.messages (
    id              uuid primary key default gen_random_uuid(),
    agency_id       uuid not null references public.agencies(id) on delete cascade,
    conversation_id uuid not null references public.conversations(id) on delete cascade,
    lead_id         uuid not null references public.leads(id) on delete cascade,
    channel         message_channel not null,             -- denormalizado para queries rápidas
    direction       message_direction not null,
    sender_kind     message_sender_kind not null,
    sender_user_id  uuid references auth.users(id) on delete set null,  -- si sender_kind='agent'
    kind            message_kind not null default 'text',
    body            text,                                  -- texto / caption
    media_url       text,                                  -- URL pública del media
    media_mime      text,                                  -- image/jpeg, audio/ogg, etc.
    media_metadata  jsonb,                                 -- {id, duration, voice, ...}
    -- IDs externos para idempotencia
    external_id     text,                                  -- ID en el BSP / canal (genérico)
    wa_message_id   text,                                  -- legacy alias para WhatsApp
    -- Status
    status          message_status not null default 'queued',
    error_code      text,
    error_message   text,
    -- Referencias internas
    reply_to_message_id uuid references public.messages(id) on delete set null,
    is_bot_generated boolean not null default false,
    bot_reasoning   jsonb,                                  -- LLM internal state si lo querés persistir
    -- Pricing (cuando el BSP te lo reporta)
    pricing_category text,
    total_price     numeric(12,6),
    -- Timestamps
    sent_at         timestamptz,
    delivered_at    timestamptz,
    read_at         timestamptz,
    created_at      timestamptz not null default now(),
    constraint uq_messages_external_id unique (agency_id, channel, external_id)
);
comment on table public.messages is 'Mensajes individuales por conversación. Idempotencia vía (agency_id, channel, external_id).';

create index idx_messages_conversation_created on public.messages (conversation_id, created_at);
create index idx_messages_agency_created on public.messages (agency_id, created_at desc);
create index idx_messages_lead_created on public.messages (lead_id, created_at desc);
create index idx_messages_status_failed on public.messages (agency_id, status) where status = 'failed';

-- ---------------------------------------------------------------------
-- tasks — recordatorios, seguimientos, escalaciones (auto o manual)
-- ---------------------------------------------------------------------
create table public.tasks (
    id              uuid primary key default gen_random_uuid(),
    agency_id       uuid not null references public.agencies(id) on delete cascade,
    lead_id         uuid references public.leads(id) on delete cascade,
    conversation_id uuid references public.conversations(id) on delete cascade,
    title           text not null,
    notes           text,
    kind            task_kind not null default 'followup',
    priority        task_priority not null default 'normal',
    status          task_status not null default 'pending',
    origin          task_origin not null default 'manual',
    due_at          timestamptz,
    completed_at    timestamptz,
    assigned_user_id uuid references auth.users(id) on delete set null,
    extra           jsonb not null default '{}'::jsonb,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index idx_tasks_agency_status on public.tasks (agency_id, status, due_at) where status in ('pending', 'in_progress');
create index idx_tasks_assigned on public.tasks (assigned_user_id, status) where assigned_user_id is not null;

-- ---------------------------------------------------------------------
-- tags — etiquetado libre de leads/conversations/anything
-- ---------------------------------------------------------------------
create table public.tags (
    id              uuid primary key default gen_random_uuid(),
    agency_id       uuid not null references public.agencies(id) on delete cascade,
    name            text not null,
    color           text default '#888888',
    description     text,
    created_at      timestamptz not null default now(),
    constraint uq_tags_agency_name unique (agency_id, name)
);

create table public.tag_assignments (
    id              uuid primary key default gen_random_uuid(),
    agency_id       uuid not null references public.agencies(id) on delete cascade,
    tag_id          uuid not null references public.tags(id) on delete cascade,
    -- Polimórfico: apunta a lead, conversation, message, lo que sea
    entity_type     text not null,        -- 'lead' | 'conversation' | 'message' | etc.
    entity_id       uuid not null,
    created_at      timestamptz not null default now(),
    created_by      uuid references auth.users(id) on delete set null,
    constraint uq_tag_assignment unique (tag_id, entity_type, entity_id)
);
create index idx_tag_assignments_entity on public.tag_assignments (entity_type, entity_id);

-- ---------------------------------------------------------------------
-- custom_fields — campos extra per-lead que cambian por cliente/nicho
-- ---------------------------------------------------------------------
-- Usar SOLO para data variable que no justifica una columna fija.
-- Ejemplo: cliente de clínica quiere guardar "alergias" y "última visita";
-- cliente de e-commerce quiere "talla preferida" y "color favorito".
-- Para data permanente y queryable, agregar columnas reales en plug-ins.
-- ---------------------------------------------------------------------
create table public.custom_field_defs (
    id              uuid primary key default gen_random_uuid(),
    agency_id       uuid not null references public.agencies(id) on delete cascade,
    entity_type     text not null,         -- 'lead' | 'conversation'
    field_key       text not null,         -- snake_case, ej: 'alergias', 'talla_preferida'
    label           text not null,         -- "Alergias", "Talla preferida"
    field_type      text not null default 'text', -- 'text' | 'number' | 'date' | 'select' | 'boolean'
    options         jsonb,                 -- para field_type='select': ["S","M","L"]
    is_required     boolean not null default false,
    display_order   integer not null default 0,
    created_at      timestamptz not null default now(),
    constraint uq_custom_field_def unique (agency_id, entity_type, field_key)
);

create table public.custom_field_values (
    id              uuid primary key default gen_random_uuid(),
    agency_id       uuid not null references public.agencies(id) on delete cascade,
    field_def_id    uuid not null references public.custom_field_defs(id) on delete cascade,
    entity_type     text not null,
    entity_id       uuid not null,
    value           jsonb,                 -- guardado siempre como jsonb, parsear por field_type
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    constraint uq_custom_field_value unique (field_def_id, entity_id)
);
create index idx_custom_field_values_entity on public.custom_field_values (entity_type, entity_id);

-- ---------------------------------------------------------------------
-- webhook_events_raw — log paranoid de webhooks recibidos
-- ---------------------------------------------------------------------
-- TODO webhook (YCloud, Meta, Twilio, etc.) se persiste ANTES de procesar.
-- Si el procesamiento falla, podés re-procesar. Sin esto perdés mensajes
-- en silencio cuando hay un bug en la edge function.
-- ---------------------------------------------------------------------
create table public.webhook_events_raw (
    id              uuid primary key default gen_random_uuid(),
    agency_id       uuid references public.agencies(id) on delete set null,  -- nullable: a veces no se resuelve aún
    source          text not null,         -- 'ycloud' | 'meta_messenger' | 'meta_instagram' | etc.
    event_type      text,                  -- tipo del evento dentro del source
    channel         message_channel,
    raw_payload     jsonb not null,
    signature_valid boolean not null default false,
    processing_error text,
    processed_at    timestamptz,
    received_at     timestamptz not null default now()
);
create index idx_webhook_events_received on public.webhook_events_raw (received_at desc);
create index idx_webhook_events_source on public.webhook_events_raw (source, received_at desc);
create index idx_webhook_events_unprocessed on public.webhook_events_raw (received_at) where processed_at is null;

-- ---------------------------------------------------------------------
-- audit_log — historial de cambios importantes (opcional pero recomendado)
-- ---------------------------------------------------------------------
create table public.audit_log (
    id              uuid primary key default gen_random_uuid(),
    agency_id       uuid not null references public.agencies(id) on delete cascade,
    actor_user_id   uuid references auth.users(id) on delete set null,
    actor_kind      text not null default 'user',  -- 'user' | 'bot' | 'system'
    action          audit_action not null,
    entity_type     text not null,
    entity_id       uuid,
    before          jsonb,
    after           jsonb,
    metadata        jsonb,
    created_at      timestamptz not null default now()
);
create index idx_audit_agency_created on public.audit_log (agency_id, created_at desc);
create index idx_audit_entity on public.audit_log (entity_type, entity_id, created_at desc);

-- =====================================================================
-- HELPERS
-- =====================================================================

-- ---------------------------------------------------------------------
-- updated_at auto-touch trigger
-- ---------------------------------------------------------------------
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
    NEW.updated_at := now();
    return NEW;
end;
$$;

-- Aplicar a todas las tablas que tienen updated_at
do $$
declare
    t text;
begin
    foreach t in array array[
        'agencies', 'agency_members', 'agency_channels',
        'leads', 'conversations', 'tasks',
        'custom_field_values'
    ]
    loop
        execute format('drop trigger if exists tg_touch_updated_at on public.%I', t);
        execute format('create trigger tg_touch_updated_at before update on public.%I for each row execute function app.touch_updated_at()', t);
    end loop;
end $$;

-- ---------------------------------------------------------------------
-- Comentarios finales
-- ---------------------------------------------------------------------
comment on column public.agencies.id is 'Tenant UUID. Presente en TODAS las tablas como FK. En single-tenant deployments hay una sola fila aquí.';
comment on column public.conversations.last_inbound_at is 'Para calcular ventana 24h de WhatsApp/Messenger. UI debería computar window-open = (now() - last_inbound_at) < 24h.';
comment on column public.messages.external_id is 'ID del mensaje en el BSP/canal externo. Idempotencia: UNIQUE(agency_id, channel, external_id) previene duplicados cuando el webhook se reenvía.';

-- =====================================================================
-- FIN 0001_core.sql
-- =====================================================================
