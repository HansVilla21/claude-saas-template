-- =====================================================================
-- 0005_triggers_denorm.sql
-- Denormalization & convenience triggers.
--  * updated_at auto-bump on every relevant table
--  * conversations.last_*  and unread_count from messages
--  * leads.score & temperature from message activity
--  * properties.lead_count from lead_property_interest
--  * properties.view_count via RPC (no trigger; bumped from edge function)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Generic updated_at trigger
-- ---------------------------------------------------------------------
create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

comment on function app.set_updated_at() is 'Generic trigger function: sets NEW.updated_at = now() on UPDATE.';

-- Attach to every table that has updated_at
create trigger trg_agencies_updated_at
    before update on public.agencies
    for each row execute function app.set_updated_at();

create trigger trg_profiles_updated_at
    before update on public.profiles
    for each row execute function app.set_updated_at();

create trigger trg_agency_members_updated_at
    before update on public.agency_members
    for each row execute function app.set_updated_at();

create trigger trg_whatsapp_numbers_updated_at
    before update on public.whatsapp_numbers
    for each row execute function app.set_updated_at();

create trigger trg_whatsapp_templates_updated_at
    before update on public.whatsapp_templates
    for each row execute function app.set_updated_at();

create trigger trg_properties_updated_at
    before update on public.properties
    for each row execute function app.set_updated_at();

create trigger trg_leads_updated_at
    before update on public.leads
    for each row execute function app.set_updated_at();

create trigger trg_tags_updated_at
    before update on public.tags
    for each row execute function app.set_updated_at();

create trigger trg_conversations_updated_at
    before update on public.conversations
    for each row execute function app.set_updated_at();

create trigger trg_tasks_updated_at
    before update on public.tasks
    for each row execute function app.set_updated_at();

create trigger trg_documents_updated_at
    before update on public.documents
    for each row execute function app.set_updated_at();

create trigger trg_events_updated_at
    before update on public.events
    for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------
-- Lead temperature derivation from score
-- ---------------------------------------------------------------------
create or replace function app.score_to_temperature(p_score int)
returns text
language sql
immutable
as $$
    select case
        when p_score is null then 'frio'
        when p_score >= 80 then 'hot'
        when p_score >= 60 then 'tibio'
        when p_score >= 40 then 'medio'
        else 'frio'
    end;
$$;

create or replace function app.leads_sync_temperature()
returns trigger
language plpgsql
as $$
begin
    new.temperature := app.score_to_temperature(new.score);
    return new;
end;
$$;

create trigger trg_leads_sync_temperature
    before insert or update of score on public.leads
    for each row execute function app.leads_sync_temperature();

comment on function app.leads_sync_temperature() is 'Keeps leads.temperature consistent with leads.score on every insert/update.';

-- ---------------------------------------------------------------------
-- conversations denorm: last_message_*, last_inbound_at, last_outbound_at, unread_count
-- ---------------------------------------------------------------------
create or replace function app.messages_after_insert_update_conversation()
returns trigger
language plpgsql
as $$
declare
    v_preview text;
begin
    -- Build a short preview (max 140 chars)
    v_preview := case
        when new.body is not null then left(new.body, 140)
        when new.kind = 'image'    then '[imagen]'
        when new.kind = 'audio'    then '[audio]'
        when new.kind = 'video'    then '[video]'
        when new.kind = 'document' then '[documento]'
        when new.kind = 'location' then '[ubicacion]'
        when new.kind = 'template' then '[plantilla]'
        else null
    end;

    update public.conversations c
       set last_message_at          = greatest(coalesce(c.last_message_at, new.created_at), new.created_at),
           last_message_preview     = v_preview,
           last_message_sender_kind = new.sender_kind,
           last_inbound_at  = case when new.direction = 'inbound'  then greatest(coalesce(c.last_inbound_at,  new.created_at), new.created_at) else c.last_inbound_at  end,
           last_outbound_at = case when new.direction = 'outbound' then greatest(coalesce(c.last_outbound_at, new.created_at), new.created_at) else c.last_outbound_at end,
           unread_count = case
               when new.direction = 'inbound' then coalesce(c.unread_count, 0) + 1
               else c.unread_count
           end,
           updated_at = now()
     where c.id = new.conversation_id;

    -- Also bump lead-level activity columns
    update public.leads l
       set last_contact_at  = greatest(coalesce(l.last_contact_at, new.created_at), new.created_at),
           last_inbound_at  = case when new.direction = 'inbound'  then greatest(coalesce(l.last_inbound_at,  new.created_at), new.created_at) else l.last_inbound_at  end,
           last_outbound_at = case when new.direction = 'outbound' then greatest(coalesce(l.last_outbound_at, new.created_at), new.created_at) else l.last_outbound_at end,
           updated_at = now()
     where l.id = new.lead_id;

    -- Also bump whatsapp_numbers activity
    update public.whatsapp_numbers w
       set last_inbound_at  = case when new.direction = 'inbound'  then greatest(coalesce(w.last_inbound_at,  new.created_at), new.created_at) else w.last_inbound_at  end,
           last_outbound_at = case when new.direction = 'outbound' then greatest(coalesce(w.last_outbound_at, new.created_at), new.created_at) else w.last_outbound_at end,
           updated_at = now()
      from public.conversations c
     where c.id = new.conversation_id
       and w.id = c.whatsapp_number_id;

    return new;
end;
$$;

create trigger trg_messages_after_insert
    after insert on public.messages
    for each row execute function app.messages_after_insert_update_conversation();

comment on function app.messages_after_insert_update_conversation() is 'After a new message: bump conversations.last_*, conversations.unread_count, leads.last_contact_at, whatsapp_numbers.last_*.';

-- ---------------------------------------------------------------------
-- properties.lead_count denorm from lead_property_interest
-- ---------------------------------------------------------------------
create or replace function app.lpi_after_change_update_property()
returns trigger
language plpgsql
as $$
begin
    if tg_op = 'INSERT' then
        update public.properties
           set lead_count = lead_count + 1,
               updated_at = now()
         where id = new.property_id;
        return new;
    elsif tg_op = 'DELETE' then
        update public.properties
           set lead_count = greatest(0, lead_count - 1),
               updated_at = now()
         where id = old.property_id;
        return old;
    elsif tg_op = 'UPDATE' and new.property_id is distinct from old.property_id then
        update public.properties set lead_count = greatest(0, lead_count - 1), updated_at = now() where id = old.property_id;
        update public.properties set lead_count = lead_count + 1, updated_at = now() where id = new.property_id;
        return new;
    end if;
    return coalesce(new, old);
end;
$$;

create trigger trg_lpi_after_change
    after insert or update or delete on public.lead_property_interest
    for each row execute function app.lpi_after_change_update_property();

comment on function app.lpi_after_change_update_property() is 'Keeps properties.lead_count in sync with lead_property_interest count.';

-- ---------------------------------------------------------------------
-- lead_tags.agency_id auto-fill (denorm helper for RLS speed)
-- The redundant agency_id is forced to match the parent lead's agency_id.
-- ---------------------------------------------------------------------
create or replace function app.lead_tags_set_agency_id()
returns trigger
language plpgsql
as $$
declare
    v_lead_agency uuid;
    v_tag_agency  uuid;
begin
    select agency_id into v_lead_agency from public.leads where id = new.lead_id;
    select agency_id into v_tag_agency  from public.tags  where id = new.tag_id;

    if v_lead_agency is null or v_tag_agency is null then
        raise exception 'lead_tags: lead or tag does not exist';
    end if;
    if v_lead_agency <> v_tag_agency then
        raise exception 'lead_tags: cross-agency assignment denied (lead=%s, tag=%s)', v_lead_agency, v_tag_agency;
    end if;

    new.agency_id := v_lead_agency;
    return new;
end;
$$;

create trigger trg_lead_tags_set_agency_id
    before insert or update on public.lead_tags
    for each row execute function app.lead_tags_set_agency_id();

comment on function app.lead_tags_set_agency_id() is 'Ensures lead_tags.agency_id matches both parent lead and tag, and rejects cross-agency assignments.';

-- ---------------------------------------------------------------------
-- profiles auto-create on auth.users insert
-- ---------------------------------------------------------------------
create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.profiles (id, email, full_name, display_name, avatar_url)
    values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
        coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name'),
        new.raw_user_meta_data->>'avatar_url'
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

comment on function app.handle_new_user() is 'After insert on auth.users: create matching row in public.profiles.';

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
    after insert on auth.users
    for each row execute function app.handle_new_user();

-- ---------------------------------------------------------------------
-- Lead score calc placeholder (implementation in app code or future migration)
-- ---------------------------------------------------------------------
create or replace function app.calc_lead_score(p_lead_id uuid)
returns int
language sql
stable
as $$
    -- Placeholder. Real implementation TBD by ia-engineer / backend team.
    -- For now, returns existing score so callers don't break.
    select coalesce((select score from public.leads where id = p_lead_id), 30);
$$;

comment on function app.calc_lead_score(uuid) is 'Stub. Returns the lead''s current score. Real heuristic to be implemented in a follow-up migration.';
