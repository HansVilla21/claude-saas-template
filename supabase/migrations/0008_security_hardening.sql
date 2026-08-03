-- =====================================================================
-- 0008_security_hardening.sql
-- Post-implementation hardening:
--   * Pin search_path on every app.* function (no implicit schema search)
--   * Remove broad SELECT (list-all) policies on public Storage buckets.
--     Public object URLs continue to work (they don't go through RLS);
--     this only blocks the LIST endpoint, which we don't need.
-- =====================================================================

alter function app.set_updated_at()                                set search_path = '';
alter function app.score_to_temperature(int)                       set search_path = '';
alter function app.leads_sync_temperature()                        set search_path = '';
alter function app.messages_after_insert_update_conversation()     set search_path = '';
alter function app.lpi_after_change_update_property()              set search_path = '';
alter function app.lead_tags_set_agency_id()                       set search_path = '';
alter function app.calc_lead_score(uuid)                           set search_path = '';

-- Rewrite functions to schema-qualify every identifier so they keep
-- working with the empty search_path.

create or replace function app.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

create or replace function app.score_to_temperature(p_score int)
returns text
language sql
immutable
set search_path = ''
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
set search_path = ''
as $$
begin
    new.temperature := app.score_to_temperature(new.score);
    return new;
end;
$$;

create or replace function app.messages_after_insert_update_conversation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
    v_preview text;
begin
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

    update public.leads l
       set last_contact_at  = greatest(coalesce(l.last_contact_at, new.created_at), new.created_at),
           last_inbound_at  = case when new.direction = 'inbound'  then greatest(coalesce(l.last_inbound_at,  new.created_at), new.created_at) else l.last_inbound_at  end,
           last_outbound_at = case when new.direction = 'outbound' then greatest(coalesce(l.last_outbound_at, new.created_at), new.created_at) else l.last_outbound_at end,
           updated_at = now()
     where l.id = new.lead_id;

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

create or replace function app.lpi_after_change_update_property()
returns trigger
language plpgsql
set search_path = ''
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

create or replace function app.lead_tags_set_agency_id()
returns trigger
language plpgsql
set search_path = ''
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
        raise exception 'lead_tags: cross-agency assignment denied (lead=%, tag=%)', v_lead_agency, v_tag_agency;
    end if;

    new.agency_id := v_lead_agency;
    return new;
end;
$$;

create or replace function app.calc_lead_score(p_lead_id uuid)
returns int
language sql
stable
set search_path = ''
as $$
    select coalesce((select score from public.leads where id = p_lead_id), 30);
$$;

drop policy if exists "anon read property-images"    on storage.objects;
drop policy if exists "members read property-images" on storage.objects;
drop policy if exists "anon read agency-branding"    on storage.objects;
drop policy if exists "members read agency-branding" on storage.objects;
