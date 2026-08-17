-- =====================================================================
-- 0004_rls_policies.sql
-- RLS policies + helper functions.
-- Helper: app.auth_agency_ids() returns the set of agency_id the current
-- auth.uid() belongs to as an active member. Centralizes membership logic.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helper functions (in private `app` schema)
-- ---------------------------------------------------------------------

-- Returns the agency_ids of the currently authenticated user (active members only).
-- Used by every tenant-scoped policy.
create or replace function app.auth_agency_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
    select agency_id
    from public.agency_members
    where user_id = auth.uid()
      and is_active = true;
$$;

revoke all on function app.auth_agency_ids() from public;
grant execute on function app.auth_agency_ids() to authenticated;
comment on function app.auth_agency_ids() is 'Returns the set of agency_ids the current auth.uid() is an active member of. Used by RLS policies on every tenant-scoped table.';

-- Returns true if the current user is an active member of the given agency.
create or replace function app.is_agency_member(p_agency_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1 from public.agency_members
        where agency_id = p_agency_id
          and user_id = auth.uid()
          and is_active = true
    );
$$;

revoke all on function app.is_agency_member(uuid) from public;
grant execute on function app.is_agency_member(uuid) to authenticated;
comment on function app.is_agency_member(uuid) is 'True if auth.uid() is an active member of p_agency_id.';

-- Returns the role of the current user inside the given agency, or NULL.
create or replace function app.agency_role(p_agency_id uuid)
returns agency_role
language sql
stable
security definer
set search_path = ''
as $$
    select role from public.agency_members
    where agency_id = p_agency_id
      and user_id = auth.uid()
      and is_active = true
    limit 1;
$$;

revoke all on function app.agency_role(uuid) from public;
grant execute on function app.agency_role(uuid) to authenticated;
comment on function app.agency_role(uuid) is 'Role of auth.uid() in p_agency_id, or NULL if not a member.';

-- ---------------------------------------------------------------------
-- agencies
-- ---------------------------------------------------------------------
create policy "members read their agencies"
    on public.agencies for select to authenticated
    using (id in (select app.auth_agency_ids()));

create policy "owners and admins update their agency"
    on public.agencies for update to authenticated
    using (app.agency_role(id) in ('owner','admin'))
    with check (app.agency_role(id) in ('owner','admin'));

-- INSERT goes through an edge function with service_role (onboarding).
-- DELETE intentionally restricted: only service_role can hard-delete.

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
create policy "users read their own profile"
    on public.profiles for select to authenticated
    using (id = auth.uid());

create policy "users read profiles of co-workers"
    on public.profiles for select to authenticated
    using (
        exists (
            select 1
            from public.agency_members m1
            join public.agency_members m2 on m1.agency_id = m2.agency_id
            where m1.user_id = auth.uid()
              and m2.user_id = profiles.id
              and m1.is_active and m2.is_active
        )
    );

create policy "users update their own profile"
    on public.profiles for update to authenticated
    using (id = auth.uid())
    with check (id = auth.uid());

-- INSERT done by trigger on auth.users with security definer; not exposed to authenticated.

-- ---------------------------------------------------------------------
-- agency_members
-- ---------------------------------------------------------------------
create policy "members read members of their agencies"
    on public.agency_members for select to authenticated
    using (agency_id in (select app.auth_agency_ids()));

create policy "owners and admins insert members"
    on public.agency_members for insert to authenticated
    with check (app.agency_role(agency_id) in ('owner','admin'));

create policy "owners and admins update members"
    on public.agency_members for update to authenticated
    using (app.agency_role(agency_id) in ('owner','admin'))
    with check (app.agency_role(agency_id) in ('owner','admin'));

create policy "owners and admins remove members"
    on public.agency_members for delete to authenticated
    using (
        app.agency_role(agency_id) in ('owner','admin')
        and user_id <> auth.uid()
    );

-- ---------------------------------------------------------------------
-- whatsapp_numbers (owners/admins can write; all members can read)
-- ---------------------------------------------------------------------
create policy "members read whatsapp_numbers"
    on public.whatsapp_numbers for select to authenticated
    using (agency_id in (select app.auth_agency_ids()));

create policy "owners and admins insert whatsapp_numbers"
    on public.whatsapp_numbers for insert to authenticated
    with check (app.agency_role(agency_id) in ('owner','admin'));

create policy "owners and admins update whatsapp_numbers"
    on public.whatsapp_numbers for update to authenticated
    using (app.agency_role(agency_id) in ('owner','admin'))
    with check (app.agency_role(agency_id) in ('owner','admin'));

create policy "owners and admins delete whatsapp_numbers"
    on public.whatsapp_numbers for delete to authenticated
    using (app.agency_role(agency_id) in ('owner','admin'));

-- ---------------------------------------------------------------------
-- whatsapp_templates (GLOBAL catalog)
-- All authenticated users can read active templates. Writes are
-- service_role only (founder/Momentum curates centrally).
-- ---------------------------------------------------------------------
create policy "authenticated read active whatsapp_templates"
    on public.whatsapp_templates for select to authenticated
    using (is_active = true);

-- No INSERT/UPDATE/DELETE policies for authenticated. Only service_role writes.

-- ---------------------------------------------------------------------
-- properties
-- ---------------------------------------------------------------------
create policy "members read properties"
    on public.properties for select to authenticated
    using (agency_id in (select app.auth_agency_ids()));

create policy "members insert properties"
    on public.properties for insert to authenticated
    with check (agency_id in (select app.auth_agency_ids()));

create policy "members update properties"
    on public.properties for update to authenticated
    using (agency_id in (select app.auth_agency_ids()))
    with check (agency_id in (select app.auth_agency_ids()));

create policy "members delete properties"
    on public.properties for delete to authenticated
    using (agency_id in (select app.auth_agency_ids()));

-- ---------------------------------------------------------------------
-- leads
-- ---------------------------------------------------------------------
create policy "members read leads"
    on public.leads for select to authenticated
    using (agency_id in (select app.auth_agency_ids()));

create policy "members insert leads"
    on public.leads for insert to authenticated
    with check (agency_id in (select app.auth_agency_ids()));

create policy "members update leads"
    on public.leads for update to authenticated
    using (agency_id in (select app.auth_agency_ids()))
    with check (agency_id in (select app.auth_agency_ids()));

create policy "members delete leads"
    on public.leads for delete to authenticated
    using (agency_id in (select app.auth_agency_ids()));

-- ---------------------------------------------------------------------
-- tags
-- ---------------------------------------------------------------------
create policy "members read tags"
    on public.tags for select to authenticated
    using (agency_id in (select app.auth_agency_ids()));

create policy "members insert tags"
    on public.tags for insert to authenticated
    with check (agency_id in (select app.auth_agency_ids()));

create policy "members update tags"
    on public.tags for update to authenticated
    using (agency_id in (select app.auth_agency_ids()))
    with check (agency_id in (select app.auth_agency_ids()));

create policy "members delete tags"
    on public.tags for delete to authenticated
    using (agency_id in (select app.auth_agency_ids()));

-- ---------------------------------------------------------------------
-- lead_tags
-- ---------------------------------------------------------------------
create policy "members read lead_tags"
    on public.lead_tags for select to authenticated
    using (agency_id in (select app.auth_agency_ids()));

create policy "members insert lead_tags"
    on public.lead_tags for insert to authenticated
    with check (agency_id in (select app.auth_agency_ids()));

create policy "members update lead_tags"
    on public.lead_tags for update to authenticated
    using (agency_id in (select app.auth_agency_ids()))
    with check (agency_id in (select app.auth_agency_ids()));

create policy "members delete lead_tags"
    on public.lead_tags for delete to authenticated
    using (agency_id in (select app.auth_agency_ids()));

-- ---------------------------------------------------------------------
-- lead_property_interest
-- ---------------------------------------------------------------------
create policy "members read lead_property_interest"
    on public.lead_property_interest for select to authenticated
    using (agency_id in (select app.auth_agency_ids()));

create policy "members insert lead_property_interest"
    on public.lead_property_interest for insert to authenticated
    with check (agency_id in (select app.auth_agency_ids()));

create policy "members update lead_property_interest"
    on public.lead_property_interest for update to authenticated
    using (agency_id in (select app.auth_agency_ids()))
    with check (agency_id in (select app.auth_agency_ids()));

create policy "members delete lead_property_interest"
    on public.lead_property_interest for delete to authenticated
    using (agency_id in (select app.auth_agency_ids()));

-- ---------------------------------------------------------------------
-- conversations
-- ---------------------------------------------------------------------
create policy "members read conversations"
    on public.conversations for select to authenticated
    using (agency_id in (select app.auth_agency_ids()));

create policy "members insert conversations"
    on public.conversations for insert to authenticated
    with check (agency_id in (select app.auth_agency_ids()));

create policy "members update conversations"
    on public.conversations for update to authenticated
    using (agency_id in (select app.auth_agency_ids()))
    with check (agency_id in (select app.auth_agency_ids()));

create policy "members delete conversations"
    on public.conversations for delete to authenticated
    using (agency_id in (select app.auth_agency_ids()));

-- ---------------------------------------------------------------------
-- messages
-- Reads: any member. Inserts: any member (sender_user_id must be self or null).
-- Updates/Deletes: NONE from authenticated. Service_role + edge functions handle status updates.
-- ---------------------------------------------------------------------
create policy "members read messages"
    on public.messages for select to authenticated
    using (agency_id in (select app.auth_agency_ids()));

create policy "members insert messages"
    on public.messages for insert to authenticated
    with check (
        agency_id in (select app.auth_agency_ids())
        and (sender_user_id is null or sender_user_id = auth.uid())
    );

-- No UPDATE/DELETE for authenticated. Messages are immutable.

-- ---------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------
create policy "members read tasks"
    on public.tasks for select to authenticated
    using (agency_id in (select app.auth_agency_ids()));

create policy "members insert tasks"
    on public.tasks for insert to authenticated
    with check (agency_id in (select app.auth_agency_ids()));

create policy "members update tasks"
    on public.tasks for update to authenticated
    using (agency_id in (select app.auth_agency_ids()))
    with check (agency_id in (select app.auth_agency_ids()));

create policy "members delete tasks"
    on public.tasks for delete to authenticated
    using (agency_id in (select app.auth_agency_ids()));

-- ---------------------------------------------------------------------
-- documents
-- ---------------------------------------------------------------------
create policy "members read documents"
    on public.documents for select to authenticated
    using (agency_id in (select app.auth_agency_ids()));

create policy "members insert documents"
    on public.documents for insert to authenticated
    with check (agency_id in (select app.auth_agency_ids()));

create policy "members update documents"
    on public.documents for update to authenticated
    using (agency_id in (select app.auth_agency_ids()))
    with check (agency_id in (select app.auth_agency_ids()));

create policy "members delete documents"
    on public.documents for delete to authenticated
    using (agency_id in (select app.auth_agency_ids()));

-- ---------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------
create policy "members read events"
    on public.events for select to authenticated
    using (agency_id in (select app.auth_agency_ids()));

create policy "members insert events"
    on public.events for insert to authenticated
    with check (agency_id in (select app.auth_agency_ids()));

create policy "members update events"
    on public.events for update to authenticated
    using (agency_id in (select app.auth_agency_ids()))
    with check (agency_id in (select app.auth_agency_ids()));

create policy "members delete events"
    on public.events for delete to authenticated
    using (agency_id in (select app.auth_agency_ids()));

-- ---------------------------------------------------------------------
-- audit_log (append-only)
-- ---------------------------------------------------------------------
create policy "members read audit_log"
    on public.audit_log for select to authenticated
    using (agency_id in (select app.auth_agency_ids()));

create policy "members insert audit_log"
    on public.audit_log for insert to authenticated
    with check (agency_id in (select app.auth_agency_ids()));

-- No UPDATE/DELETE policies. Append-only.
