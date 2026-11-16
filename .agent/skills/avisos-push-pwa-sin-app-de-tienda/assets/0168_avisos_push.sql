-- =============================================================================
-- 0168 — Avisos en el celular: cada notificación también sale como push
-- =============================================================================
-- El CRM se instala desde el navegador (manifest + service worker) y avisa en
-- el celular aunque esté cerrado, sin app de tienda. Hasta acá avisaba por:
--   · la campana (`notifications` + realtime), solo con el CRM abierto;
--   · el aviso de escritorio, solo con una pestaña abierta;
--   · el WhatsApp al agente en el handoff (0047/0049).
--
-- Qué agrega:
--   1. `push_subscriptions`: un renglón por usuario y DISPOSITIVO (el navegador
--      da un `endpoint` único por instalación). Cada uno lee solo las suyas; el
--      alta y la baja van por server action con el cliente de servicio.
--   2. El secreto y la URL del envío, generados acá dentro del Vault (patrón
--      0151/0165): no hay variable que copiar.
--   3. Un trigger POR SENTENCIA sobre `notifications`: junta en un solo pedido
--      las filas nuevas cuyos dueños tienen al menos un dispositivo anotado y
--      despierta a /api/cron/push. Por sentencia y no por fila porque un mismo
--      evento se reparte a todo el equipo (N filas en un INSERT) y así sale UN
--      pedido en vez de N. Si nadie del lote tiene dispositivos, no sale nada:
--      con cero suscripciones esto no cuesta un solo pedido.
--
-- Lo que viaja a la ruta son solo ids: el texto del aviso lo lee la ruta con el
-- cliente de servicio. pg_net encola el pedido en una tabla, así que sale
-- DESPUÉS del commit (la ruta encuentra las filas) y no sale si el INSERT se
-- deshace.
-- =============================================================================

-- ── 1. Los dispositivos ──────────────────────────────────────────────────────
create table if not exists public.push_subscriptions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users(id) on delete cascade,
  -- La URL del servicio de push del navegador (FCM, Apple, Mozilla). Única: si
  -- el mismo navegador se vuelve a anotar, se actualiza la fila, no se duplica.
  endpoint         text not null unique
                   check (endpoint ~ '^https://' and length(endpoint) <= 2048),
  p256dh           text not null check (length(p256dh) between 1 and 200),
  auth             text not null check (length(auth) between 1 and 100),
  user_agent       text check (user_agent is null or length(user_agent) <= 500),
  created_at       timestamptz not null default now(),
  -- La última vez que el servicio de push rechazó un envío (que no fuera 404/410:
  -- esos borran la fila). Sirve para ver un dispositivo que dejó de recibir.
  last_failure_at  timestamptz,
  failure_count    integer not null default 0
);

create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);

comment on table public.push_subscriptions is
  '0168: un dispositivo por fila para los avisos push. Lectura: cada uno las suyas. Escritura: solo el cliente de servicio (server action con sesión y /api/cron/push).';

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own on public.push_subscriptions
  for select to authenticated
  using (user_id = auth.uid());

-- Sin policies de escritura a propósito: el alta y la baja pasan por la server
-- action, que toma el usuario de la sesión y no del navegador.
revoke all on public.push_subscriptions from anon;
revoke insert, update, delete, truncate on public.push_subscriptions from authenticated;

-- ── 2. El secreto y la URL del envío ─────────────────────────────────────────
do $vault$
begin
  if not exists (select 1 from vault.secrets where name = 'push_cron_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'push_cron_secret',
      'Secreto entre el trigger de notifications y /api/cron/push (0168). La ruta lo lee con push_secreto_cron().');
  end if;
  if not exists (select 1 from vault.secrets where name = 'push_cron_url') then
    perform vault.create_secret(
      'https://<tu-dominio>/api/cron/push',
      'push_cron_url',
      'URL de /api/cron/push en producción (0168).');
  end if;
end
$vault$;

create or replace function public.push_secreto_cron()
returns text
language sql
stable
security definer
set search_path = public, vault
as $fn$
  select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret';
$fn$;

-- ── 3. El despacho ───────────────────────────────────────────────────────────
create or replace function public.push_despachar()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, vault
as $fn$
declare
  v_ids    uuid[];
  v_url    text;
  v_secret text;
begin
  select array_agg(n.id)
    into v_ids
    from nuevas n
   where exists (select 1 from public.push_subscriptions s where s.user_id = n.user_id);

  if v_ids is null then
    return null;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'push_cron_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_cron_secret';
  if v_url is null or v_secret is null then
    return null;
  end if;

  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('ids', to_jsonb(v_ids)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    timeout_milliseconds := 15000
  );
  return null;
exception when others then
  -- El push nunca puede tumbar la notificación (ni el mensaje que la originó).
  raise warning 'push_despachar: %', sqlerrm;
  return null;
end;
$fn$;

comment on function public.push_despachar() is
  'Trigger por sentencia de notifications: manda a /api/cron/push los ids nuevos de usuarios con dispositivos anotados. 0168.';

drop trigger if exists trg_push_despachar on public.notifications;
create trigger trg_push_despachar
  after insert on public.notifications
  referencing new table as nuevas
  for each statement
  execute function public.push_despachar();

-- Toda función nace con EXECUTE para PUBLIC: revocar solo a anon/authenticated
-- la deja abierta por herencia (skill revocar-execute-incluye-public).
revoke all on function public.push_secreto_cron() from public, anon, authenticated;
revoke all on function public.push_despachar() from public, anon, authenticated;
grant execute on function public.push_secreto_cron() to service_role;
