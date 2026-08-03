-- ===================================================================
-- 0016 — Handoff System
-- ===================================================================
--
-- WHY: the bot already toggles `conversations.handler` to 'human' when
-- it pauses itself, but the rest of the system has no way to know
-- WHY that happened (qualified? scheduling? bot stuck?) or to surface
-- the conversation as "needs your attention NOW" to the agent.
--
-- This migration:
--   1. Adds a strict enum-typed status (`none|pending|handled`) on
--      conversations so the UI can light up only what's pending.
--   2. Converts the existing free-text `handoff_reason` to a typed
--      enum so prompts/UI agree on the vocabulary.
--   3. Adds `handoff_summary` (the bot's short note: "wants to visit
--      ZN apt next Sat") and `handoff_task_id` (link to the auto-
--      generated task so the agent never loses it in the inbox).
--   4. Creates `tg_handoff_create_task` — fires when a conversation
--      transitions to handoff_status='pending'. Creates a high-prio
--      followup task, switches handler to 'human' (which silences the
--      bot in that conversation until the agent manually re-enables
--      it from the inbox toggle), and links the task back.
--   5. Creates `tg_handoff_mark_handled` — when the agent sends the
--      first outbound message into a pending-handoff conversation, the
--      handoff is auto-marked 'handled' and the related task goes to
--      'in_progress'. The agent can still manually mark it from the UI.
--
-- The bot's existing `handler='human'` semantics keep working unchanged
-- — that flag is the kill-switch for routing. Handoff status is an
-- orthogonal "attention required" signal.
-- ===================================================================

begin;

-- ───────────────────────────────────────────────────────────────────
-- Enums
-- ───────────────────────────────────────────────────────────────────

-- Status of the handoff lifecycle on a conversation.
--   none    — bot is handling normally (or never escalated)
--   pending — bot escalated, agent has not yet responded
--   handled — agent has taken action (sent outbound message or
--             explicitly marked handled from UI)
create type conversation_handoff_status as enum (
  'none',
  'pending',
  'handled'
);

-- Reason the bot (or agent) escalated. Vocabulary is shared by
--   - N8N agent tool "Solicitar Handoff"
--   - Edge function `request-handoff`
--   - Inbox banner UI labels
-- Keep this list intentionally small. New reasons should require a
-- product discussion, not a schema patch.
create type conversation_handoff_reason as enum (
  'qualified',         -- lead listo para cerrar / mostró intención de compra
  'scheduling',        -- lead quiere agendar visita o llamada
  'objection_complex', -- el bot no logra resolver una objeción
  'bot_stuck',         -- heurística (V1.5): N turnos sin avanzar BANT
  'manual'             -- el agente tomó la conversación desde el CRM
);

-- ───────────────────────────────────────────────────────────────────
-- Conversations — columns
-- ───────────────────────────────────────────────────────────────────

alter table public.conversations
  add column handoff_status conversation_handoff_status
    not null default 'none';

alter table public.conversations
  add column handoff_summary text;

alter table public.conversations
  add column handoff_task_id uuid
    references public.tasks(id) on delete set null;

comment on column public.conversations.handoff_status is
  'Lifecycle of the current handoff. none = bot still in charge or never escalated. pending = bot escalated and is waiting for the agent. handled = agent has taken action.';
comment on column public.conversations.handoff_summary is
  'Short text the bot (or agent) wrote when escalating: what the lead wants and what the agent should do next. Shown in the inbox banner and copied into the auto-generated task notes.';
comment on column public.conversations.handoff_task_id is
  'FK to the task created automatically when this handoff went pending. NULL for handoffs that never produced a task (e.g. ones marked handled without a task being created — should not happen in V1).';

-- Convert handoff_reason from text → enum. We keep existing values
-- that map cleanly and NULL out anything else so we don't lose rows.
-- Two known prod rows currently — both NULL — so this is safe.
alter table public.conversations
  alter column handoff_reason type conversation_handoff_reason
  using (
    case lower(coalesce(handoff_reason, ''))
      when 'qualified'         then 'qualified'::conversation_handoff_reason
      when 'scheduling'        then 'scheduling'::conversation_handoff_reason
      when 'objection_complex' then 'objection_complex'::conversation_handoff_reason
      when 'bot_stuck'         then 'bot_stuck'::conversation_handoff_reason
      when 'manual'            then 'manual'::conversation_handoff_reason
      else null
    end
  );

-- ───────────────────────────────────────────────────────────────────
-- Indexes — fast filter for "needs attention" lists in the UI
-- ───────────────────────────────────────────────────────────────────

-- Partial index: 99% of rows are status='none', skip them.
create index conversations_handoff_pending_idx
  on public.conversations (agency_id, handoff_at desc)
  where handoff_status = 'pending';

-- ───────────────────────────────────────────────────────────────────
-- Trigger: create task + flip handler when handoff goes pending
-- ───────────────────────────────────────────────────────────────────
--
-- SECURITY DEFINER because the trigger inserts into public.tasks on
-- behalf of an UPDATE that can come from either:
--   - service_role (edge function / N8N) → already bypasses RLS
--   - authenticated user (agent toggling handler manually) → would
--     otherwise need explicit INSERT permission on tasks
-- The function runs with the table-owner role, which has full access.
-- We still scope every write by NEW.agency_id from the row being
-- updated, so this can never cross tenants.
-- ───────────────────────────────────────────────────────────────────

create or replace function app.tg_handoff_create_task()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_lead_name text;
  v_task_id uuid;
  v_reason_label text;
  v_title text;
  v_notes text;
begin
  -- Only act on transitions INTO 'pending'. UPDATEs that don't change
  -- handoff_status are no-ops here.
  if new.handoff_status is distinct from 'pending' then
    return new;
  end if;
  if old.handoff_status = 'pending' then
    return new;
  end if;

  -- Resolve display name for the lead so the task title reads naturally.
  select coalesce(display_name, full_name, 'lead sin nombre')
    into v_lead_name
  from public.leads
  where id = new.lead_id;

  -- Spanish labels for the reason — shown in the task title and the
  -- agent's UI banner. Keep these short and action-oriented.
  v_reason_label := case new.handoff_reason
    when 'qualified'         then 'listo para cerrar'
    when 'scheduling'        then 'quiere agendar'
    when 'objection_complex' then 'tiene una objeción'
    when 'bot_stuck'         then 'bot atascado'
    when 'manual'            then 'tomado manualmente'
    else 'requiere atención'
  end;

  v_title := 'Atender a ' || v_lead_name || ' — ' || v_reason_label;

  -- Notes = the bot's summary (if any) — the agent reads this before
  -- opening the conversation, saving a round-trip to the inbox.
  v_notes := coalesce(
    new.handoff_summary,
    'El bot escaló esta conversación pero no dejó un resumen.'
  );

  -- Insert the followup task. Auto origin tags it as bot-generated.
  -- assigned_to = the conversation's currently-assigned agent if any,
  -- otherwise NULL (any agent on the team can pick it up).
  insert into public.tasks (
    agency_id,
    lead_id,
    assigned_to,
    origin,
    kind,
    title,
    notes,
    priority,
    status,
    due_at,
    metadata
  )
  values (
    new.agency_id,
    new.lead_id,
    new.assigned_agent_id,
    'auto',
    'followup',
    v_title,
    v_notes,
    'high',
    'pending',
    now() + interval '30 minutes',
    jsonb_build_object(
      'source', 'handoff',
      'conversation_id', new.id,
      'handoff_reason', new.handoff_reason
    )
  )
  returning id into v_task_id;

  -- Link back from the conversation so the UI can deep-link, and flip
  -- handler to 'human' — that flag is the kill-switch the N8N workflow
  -- checks before responding, so once it's set the bot stays silent on
  -- this conversation until the agent manually toggles it back from
  -- the inbox. No auto-resume window: the founder wants explicit
  -- agent action to re-enable the bot post-handoff.
  --
  -- We don't recurse: this UPDATE only touches columns that aren't
  -- watched by this trigger (the WHEN clause is on handoff_status).
  update public.conversations
    set handoff_task_id   = v_task_id,
        handler           = 'human',
        bot_paused_until  = null
    where id = new.id;

  return new;
end;
$$;

drop trigger if exists tg_handoff_create_task on public.conversations;
create trigger tg_handoff_create_task
  after update of handoff_status on public.conversations
  for each row
  execute function app.tg_handoff_create_task();

-- ───────────────────────────────────────────────────────────────────
-- Trigger: auto-mark handoff handled on first agent outbound
-- ───────────────────────────────────────────────────────────────────
--
-- Fires on every new outbound message from a human agent (not bot).
-- If the parent conversation is currently in handoff_status='pending'
-- we flip it to 'handled' and bump the related task to 'in_progress'.
--
-- Why automatic: spares the agent a click. They opened the conv
-- and replied — they're handling it. If we ever see this misfire
-- in the wild we can require an explicit click instead.
-- ───────────────────────────────────────────────────────────────────

create or replace function app.tg_handoff_mark_handled()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_conv record;
begin
  -- Only agent-sent outbound text counts. Bot and system messages
  -- don't represent "the human is paying attention."
  if new.direction <> 'outbound' or new.sender_kind <> 'agent' then
    return new;
  end if;

  select handoff_status, handoff_task_id, agency_id
    into v_conv
  from public.conversations
  where id = new.conversation_id;

  if v_conv is null or v_conv.handoff_status <> 'pending' then
    return new;
  end if;

  update public.conversations
    set handoff_status = 'handled'
    where id = new.conversation_id;

  if v_conv.handoff_task_id is not null then
    -- Move the task to in_progress so it stops appearing in the
    -- "pending tasks" badge but stays in the agent's todo until
    -- they tick it done.
    update public.tasks
      set status = 'in_progress'
      where id = v_conv.handoff_task_id
        and status = 'pending';
  end if;

  return new;
end;
$$;

drop trigger if exists tg_handoff_mark_handled on public.messages;
create trigger tg_handoff_mark_handled
  after insert on public.messages
  for each row
  execute function app.tg_handoff_mark_handled();

-- ───────────────────────────────────────────────────────────────────
-- Realtime — the existing broadcast trigger on conversations already
-- emits UPDATE events to the agency:<uuid> channel (see 0012/0013), so
-- the change to handoff_status will reach the Inbox/Notifications UI
-- automatically. No new broadcast wiring needed here.
-- ───────────────────────────────────────────────────────────────────

commit;
