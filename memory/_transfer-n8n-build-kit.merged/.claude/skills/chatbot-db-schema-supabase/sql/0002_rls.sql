-- =====================================================================
-- 0002_rls.sql
-- Row Level Security: policies PREPARADAS pero OFF por default.
--
-- En single-tenant (1 proyecto Supabase por cliente), RLS NO es estrictamente
-- necesario porque solo hay 1 agency y todo el acceso pasa por service_role.
-- PERO dejamos las policies escritas listas para activar cuando:
--   (a) Quieras dar acceso a un dashboard React con anon/auth keys
--   (b) Migres este proyecto a multi-tenant compartido en el futuro
--
-- Para ACTIVAR RLS más tarde, correr este archivo y después:
--   alter table public.agencies enable row level security;
--   alter table public.leads enable row level security;
--   ... (todas las tablas tenant-scoped)
--
-- En single-tenant: dejá RLS DESACTIVADO. El chatbot usa service_role
-- y no necesita policies. Activarlo sin la app preparada rompe queries.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helper: obtener el agency_id del usuario autenticado actual
-- ---------------------------------------------------------------------
-- Asume que cada usuario humano (auth.users) está asociado a una agency
-- vía agency_members. Para usuarios bot/service no aplica RLS (usan
-- service_role que bypassa).
-- ---------------------------------------------------------------------
create or replace function app.current_user_agency_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
    select agency_id
    from public.agency_members
    where user_id = auth.uid()
      and is_active = true;
$$;

create or replace function app.current_user_role_in(p_agency_id uuid)
returns agency_role
language sql
stable
security definer
set search_path = public
as $$
    select role
    from public.agency_members
    where user_id = auth.uid()
      and agency_id = p_agency_id
      and is_active = true
    limit 1;
$$;

-- =====================================================================
-- POLICIES — escritas pero NO aplicadas (las tablas tienen RLS off).
-- Para activar: descomentar los `alter table ... enable row level security`
-- al final de este archivo Y verificar que tu app tiene los JWT correctos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- agencies
-- ---------------------------------------------------------------------
drop policy if exists p_agencies_select on public.agencies;
create policy p_agencies_select on public.agencies
    for select
    using (id in (select app.current_user_agency_ids()));

drop policy if exists p_agencies_update on public.agencies;
create policy p_agencies_update on public.agencies
    for update
    using (
        id in (select app.current_user_agency_ids())
        and app.current_user_role_in(id) in ('owner', 'admin')
    );

-- ---------------------------------------------------------------------
-- agency_members
-- ---------------------------------------------------------------------
drop policy if exists p_members_select on public.agency_members;
create policy p_members_select on public.agency_members
    for select
    using (agency_id in (select app.current_user_agency_ids()));

drop policy if exists p_members_manage on public.agency_members;
create policy p_members_manage on public.agency_members
    for all
    using (
        agency_id in (select app.current_user_agency_ids())
        and app.current_user_role_in(agency_id) in ('owner', 'admin')
    );

-- ---------------------------------------------------------------------
-- agency_channels — solo owners/admins (config sensible)
-- ---------------------------------------------------------------------
drop policy if exists p_channels_select on public.agency_channels;
create policy p_channels_select on public.agency_channels
    for select
    using (agency_id in (select app.current_user_agency_ids()));

drop policy if exists p_channels_manage on public.agency_channels;
create policy p_channels_manage on public.agency_channels
    for all
    using (
        agency_id in (select app.current_user_agency_ids())
        and app.current_user_role_in(agency_id) in ('owner', 'admin')
    );

-- ---------------------------------------------------------------------
-- leads — todo el equipo lee, viewer no escribe
-- ---------------------------------------------------------------------
drop policy if exists p_leads_select on public.leads;
create policy p_leads_select on public.leads
    for select
    using (agency_id in (select app.current_user_agency_ids()));

drop policy if exists p_leads_write on public.leads;
create policy p_leads_write on public.leads
    for all
    using (
        agency_id in (select app.current_user_agency_ids())
        and app.current_user_role_in(agency_id) in ('owner', 'admin', 'agent')
    );

-- ---------------------------------------------------------------------
-- conversations
-- ---------------------------------------------------------------------
drop policy if exists p_conv_select on public.conversations;
create policy p_conv_select on public.conversations
    for select
    using (agency_id in (select app.current_user_agency_ids()));

drop policy if exists p_conv_write on public.conversations;
create policy p_conv_write on public.conversations
    for all
    using (
        agency_id in (select app.current_user_agency_ids())
        and app.current_user_role_in(agency_id) in ('owner', 'admin', 'agent')
    );

-- ---------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------
drop policy if exists p_msg_select on public.messages;
create policy p_msg_select on public.messages
    for select
    using (agency_id in (select app.current_user_agency_ids()));

drop policy if exists p_msg_write on public.messages;
create policy p_msg_write on public.messages
    for all
    using (
        agency_id in (select app.current_user_agency_ids())
        and app.current_user_role_in(agency_id) in ('owner', 'admin', 'agent')
    );

-- ---------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------
drop policy if exists p_tasks_select on public.tasks;
create policy p_tasks_select on public.tasks
    for select
    using (agency_id in (select app.current_user_agency_ids()));

drop policy if exists p_tasks_write on public.tasks;
create policy p_tasks_write on public.tasks
    for all
    using (
        agency_id in (select app.current_user_agency_ids())
        and app.current_user_role_in(agency_id) in ('owner', 'admin', 'agent')
    );

-- ---------------------------------------------------------------------
-- tags + tag_assignments
-- ---------------------------------------------------------------------
drop policy if exists p_tags_select on public.tags;
create policy p_tags_select on public.tags
    for select using (agency_id in (select app.current_user_agency_ids()));

drop policy if exists p_tags_write on public.tags;
create policy p_tags_write on public.tags
    for all using (
        agency_id in (select app.current_user_agency_ids())
        and app.current_user_role_in(agency_id) in ('owner', 'admin', 'agent')
    );

drop policy if exists p_tag_assign_select on public.tag_assignments;
create policy p_tag_assign_select on public.tag_assignments
    for select using (agency_id in (select app.current_user_agency_ids()));

drop policy if exists p_tag_assign_write on public.tag_assignments;
create policy p_tag_assign_write on public.tag_assignments
    for all using (
        agency_id in (select app.current_user_agency_ids())
        and app.current_user_role_in(agency_id) in ('owner', 'admin', 'agent')
    );

-- ---------------------------------------------------------------------
-- custom fields
-- ---------------------------------------------------------------------
drop policy if exists p_cfd_select on public.custom_field_defs;
create policy p_cfd_select on public.custom_field_defs
    for select using (agency_id in (select app.current_user_agency_ids()));

drop policy if exists p_cfd_write on public.custom_field_defs;
create policy p_cfd_write on public.custom_field_defs
    for all using (
        agency_id in (select app.current_user_agency_ids())
        and app.current_user_role_in(agency_id) in ('owner', 'admin')
    );

drop policy if exists p_cfv_select on public.custom_field_values;
create policy p_cfv_select on public.custom_field_values
    for select using (agency_id in (select app.current_user_agency_ids()));

drop policy if exists p_cfv_write on public.custom_field_values;
create policy p_cfv_write on public.custom_field_values
    for all using (
        agency_id in (select app.current_user_agency_ids())
        and app.current_user_role_in(agency_id) in ('owner', 'admin', 'agent')
    );

-- ---------------------------------------------------------------------
-- webhook_events_raw — solo owners (datos sensibles potencialmente)
-- ---------------------------------------------------------------------
drop policy if exists p_webhooks_select on public.webhook_events_raw;
create policy p_webhooks_select on public.webhook_events_raw
    for select using (
        agency_id is null  -- no resueltos, solo accesibles via service_role
        or (
            agency_id in (select app.current_user_agency_ids())
            and app.current_user_role_in(agency_id) in ('owner', 'admin')
        )
    );

-- ---------------------------------------------------------------------
-- audit_log — todos pueden leer (transparencia), nadie escribe directo
-- (los triggers escriben con security definer)
-- ---------------------------------------------------------------------
drop policy if exists p_audit_select on public.audit_log;
create policy p_audit_select on public.audit_log
    for select using (agency_id in (select app.current_user_agency_ids()));

-- =====================================================================
-- ACTIVAR RLS — DESCOMENTAR CUANDO ESTÉS LISTO PARA MULTI-TENANT
-- =====================================================================
-- alter table public.agencies              enable row level security;
-- alter table public.agency_members        enable row level security;
-- alter table public.agency_channels       enable row level security;
-- alter table public.leads                 enable row level security;
-- alter table public.conversations         enable row level security;
-- alter table public.messages              enable row level security;
-- alter table public.tasks                 enable row level security;
-- alter table public.tags                  enable row level security;
-- alter table public.tag_assignments       enable row level security;
-- alter table public.custom_field_defs     enable row level security;
-- alter table public.custom_field_values   enable row level security;
-- alter table public.webhook_events_raw    enable row level security;
-- alter table public.audit_log             enable row level security;

-- =====================================================================
-- GRANTS para que el bot (usando service_role) bypassee RLS naturalmente
-- y para que authenticated/anon respeten las policies cuando RLS esté on
-- =====================================================================
grant usage on schema app to service_role;
grant execute on all functions in schema app to service_role;
grant execute on function app.current_user_agency_ids() to authenticated;
grant execute on function app.current_user_role_in(uuid) to authenticated;

-- =====================================================================
-- FIN 0002_rls.sql
-- =====================================================================
