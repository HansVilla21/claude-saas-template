-- =====================================================================
-- 0003_triggers_realtime.sql
-- Triggers de denorm + Realtime Broadcast Changes
--
-- Cubre:
--   1) Denorm de conversations.unread_count / last_inbound_at / etc
--      cuando llega un message nuevo
--   2) Auto-update de leads.last_message_at / first_contact_at
--   3) Auto-create de tasks cuando handoff_status pasa a 'pending'
--   4) Auto-mark handoff_status='handled' cuando un agent manda outbound
--   5) Realtime Broadcast por conversation_id (usar 'broadcast' channel
--      en lugar de 'postgres_changes' deprecado)
-- =====================================================================

-- =====================================================================
-- (1) DENORM: cuando se inserta un message, actualizar conversation + lead
-- =====================================================================

create or replace function app.on_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    preview_text text;
begin
    -- Preview: primeros 200 chars del body, o "[<kind>]" si no hay body
    if NEW.body is not null and length(NEW.body) > 0 then
        preview_text := substring(NEW.body from 1 for 200);
    else
        preview_text := '[' || NEW.kind::text || ']';
    end if;

    -- Update conversation
    update public.conversations
       set last_message_at      = NEW.created_at,
           last_message_preview = preview_text,
           last_inbound_at      = case when NEW.direction = 'inbound'
                                        then NEW.created_at
                                        else last_inbound_at end,
           last_outbound_at     = case when NEW.direction = 'outbound'
                                        then NEW.created_at
                                        else last_outbound_at end,
           unread_count         = case when NEW.direction = 'inbound'
                                        then unread_count + 1
                                        else unread_count end,
           updated_at           = now()
     where id = NEW.conversation_id;

    -- Update lead
    update public.leads
       set last_message_at  = NEW.created_at,
           last_contact_at  = NEW.created_at,
           first_contact_at = coalesce(first_contact_at, NEW.created_at),
           updated_at       = now()
     where id = NEW.lead_id;

    return NEW;
end;
$$;

drop trigger if exists tg_message_denorm on public.messages;
create trigger tg_message_denorm
    after insert on public.messages
    for each row execute function app.on_message_insert();

-- =====================================================================
-- (2) HANDOFF: cuando handoff_status pasa a 'pending', crear task auto
-- =====================================================================

create or replace function app.on_handoff_pending()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    new_task_id uuid;
    reason_label text;
begin
    -- Solo dispara cuando handoff_status pasa de algo != 'pending' a 'pending'
    if NEW.handoff_status = 'pending'
       and (OLD.handoff_status is null or OLD.handoff_status != 'pending') then

        reason_label := coalesce(NEW.handoff_reason::text, 'manual');

        insert into public.tasks (
            agency_id, lead_id, conversation_id,
            kind, priority, status, origin,
            title, notes,
            due_at, assigned_user_id
        ) values (
            NEW.agency_id, NEW.lead_id, NEW.id,
            'followup', 'high', 'pending', 'auto',
            'Handoff: lead requiere atención (' || reason_label || ')',
            coalesce(NEW.handoff_summary, '(sin resumen del bot)'),
            now() + interval '30 minutes',
            NEW.assigned_user_id
        )
        returning id into new_task_id;

        -- Link task ↔ conversation
        NEW.handoff_task_id := new_task_id;
        -- Cambiar handler a humano (el bot se apaga)
        NEW.handler := 'human';
        NEW.handoff_at := coalesce(NEW.handoff_at, now());
    end if;

    return NEW;
end;
$$;

drop trigger if exists tg_handoff_pending on public.conversations;
create trigger tg_handoff_pending
    before update of handoff_status on public.conversations
    for each row execute function app.on_handoff_pending();

-- =====================================================================
-- (3) AUTO-MARK HANDLED: cuando un agent manda outbound, marcar handled
-- =====================================================================

create or replace function app.on_agent_outbound_mark_handled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if NEW.direction = 'outbound' and NEW.sender_kind = 'agent' then
        update public.conversations
           set handoff_status = 'handled',
               updated_at = now()
         where id = NEW.conversation_id
           and handoff_status = 'pending';

        update public.tasks
           set status = 'in_progress',
               updated_at = now()
         where conversation_id = NEW.conversation_id
           and status = 'pending'
           and origin = 'auto';
    end if;
    return NEW;
end;
$$;

drop trigger if exists tg_agent_outbound_mark_handled on public.messages;
create trigger tg_agent_outbound_mark_handled
    after insert on public.messages
    for each row execute function app.on_agent_outbound_mark_handled();

-- =====================================================================
-- (4) REALTIME BROADCAST: emite eventos por conversation_id cuando
--     hay cambios en messages / conversations
-- =====================================================================
-- IMPORTANTE: postgres_changes está deprecado. Usamos realtime.send()
-- vía trigger para emitir broadcasts a un topic per-conversation.
-- El cliente se suscribe a topic = 'conv:<conversation_id>' y filtra
-- por event = 'messages_changed' o 'conversation_changed'.
-- =====================================================================

create or replace function app.broadcast_message_change()
returns trigger
language plpgsql
security definer
set search_path = public, realtime
as $$
declare
    payload jsonb;
    topic text;
begin
    topic := 'conv:' || coalesce(NEW.conversation_id, OLD.conversation_id)::text;

    payload := jsonb_build_object(
        'op', TG_OP,
        'id', coalesce(NEW.id, OLD.id),
        'agency_id', coalesce(NEW.agency_id, OLD.agency_id),
        'conversation_id', coalesce(NEW.conversation_id, OLD.conversation_id),
        'row', case when TG_OP = 'DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end
    );

    perform realtime.send(payload, 'messages_changed', topic, false);
    return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists tg_broadcast_messages on public.messages;
create trigger tg_broadcast_messages
    after insert or update or delete on public.messages
    for each row execute function app.broadcast_message_change();

create or replace function app.broadcast_conversation_change()
returns trigger
language plpgsql
security definer
set search_path = public, realtime
as $$
declare
    payload jsonb;
    topic_conv text;
    topic_agency text;
begin
    topic_conv := 'conv:' || coalesce(NEW.id, OLD.id)::text;
    topic_agency := 'agency:' || coalesce(NEW.agency_id, OLD.agency_id)::text;

    payload := jsonb_build_object(
        'op', TG_OP,
        'id', coalesce(NEW.id, OLD.id),
        'agency_id', coalesce(NEW.agency_id, OLD.agency_id),
        'row', case when TG_OP = 'DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end
    );

    -- Broadcast a 2 topics: el de la conv específica + el global de la agency
    perform realtime.send(payload, 'conversation_changed', topic_conv, false);
    perform realtime.send(payload, 'conversation_changed', topic_agency, false);
    return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists tg_broadcast_conversations on public.conversations;
create trigger tg_broadcast_conversations
    after insert or update or delete on public.conversations
    for each row execute function app.broadcast_conversation_change();

-- =====================================================================
-- GRANTS para que el schema realtime funcione desde triggers
-- =====================================================================
-- CRÍTICO: sin USAGE en schema realtime, los triggers que llaman
-- realtime.send() fallan con "permission denied for schema realtime".
-- =====================================================================

grant usage on schema realtime to authenticated, service_role;
grant execute on function realtime.send(jsonb, text, text, boolean) to authenticated, service_role;

-- =====================================================================
-- FIN 0003_triggers_realtime.sql
-- =====================================================================
