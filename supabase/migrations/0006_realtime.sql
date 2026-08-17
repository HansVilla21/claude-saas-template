-- =====================================================================
-- 0006_realtime.sql
-- Add tables to the supabase_realtime publication so the CRM gets
-- push notifications without polling. RLS is applied automatically on
-- the subscriber's session (authenticated role).
-- =====================================================================

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.leads;
alter publication supabase_realtime add table public.tasks;

-- Set REPLICA IDENTITY FULL so Realtime can emit complete row payloads
-- for UPDATE/DELETE events (otherwise only PK is sent).
alter table public.messages       replica identity full;
alter table public.conversations  replica identity full;
alter table public.leads          replica identity full;
alter table public.tasks          replica identity full;
