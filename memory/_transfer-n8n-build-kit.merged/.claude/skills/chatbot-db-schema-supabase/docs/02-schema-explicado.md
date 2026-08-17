# 02 — Schema explicado tabla por tabla

Documentación detallada de cada tabla del CORE (`sql/0001_core.sql`). Cada sección incluye: propósito, decisiones de diseño, gotchas, queries típicas.

---

## `agencies` — tenant root

```sql
create table public.agencies (
    id              uuid primary key default gen_random_uuid(),
    slug            text not null,
    name            text not null,
    legal_name      text,
    legal_id        text,
    country_code    text not null default 'CR',
    timezone        text not null default 'America/Costa_Rica',
    currency        text not null default 'CRC',
    plan            agency_plan not null default 'trial',
    settings        jsonb not null default '{}'::jsonb,
    is_active       boolean not null default true,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);
```

**Propósito:** raíz del tenant. En single-tenant hay 1 row; en multi-tenant hay N.

**Decisiones:**
- `slug` UNIQUE para URLs y referencias humanas
- `timezone` per-agency es CRÍTICO: el inbox separa mensajes por "día calendario" en TZ del cliente, no UTC
- `settings jsonb` para prefs sin schema fijo: branding, UI, integraciones
- `plan` para billing futuro (puede ignorarse si no facturás)

**Query típica:**
```sql
-- Single-tenant: obtener "la" agency
select id from agencies limit 1;

-- Multi-tenant: filtrar por slug del subdomain
select id from agencies where slug = 'cliente-abc' and is_active = true;
```

---

## `agency_members` — usuarios de la agency (cuando uses CRM)

```sql
create table public.agency_members (
    id              uuid primary key default gen_random_uuid(),
    agency_id       uuid not null references agencies(id) on delete cascade,
    user_id         uuid references auth.users(id) on delete cascade,
    email           citext not null,
    role            agency_role not null default 'agent',
    is_active       boolean not null default true,
    invited_at      timestamptz default now(),
    accepted_at     timestamptz,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    constraint uq_agency_members_email unique (agency_id, email)
);
```

**Propósito:** mapeo entre `auth.users` (Supabase Auth) y `agencies`. Define quién tiene qué rol en qué agency.

**Decisiones:**
- `user_id` nullable para soportar invitaciones pendientes (email enviado pero usuario no creado aún)
- `email citext` para que mayúsculas/minúsculas no rompan unique
- `role` controla qué puede hacer en RLS policies

**Gotcha:** si solo usás el chatbot + Supabase Studio (sin CRM frontend), esta tabla puede quedar vacía. No bloquea nada.

**Query típica (cuando hay RLS):**
```sql
-- Helper function que usan las policies
select agency_id from agency_members
 where user_id = auth.uid() and is_active = true;
```

---

## `agency_channels` — credenciales de cada canal conectado

```sql
create table public.agency_channels (
    id              uuid primary key default gen_random_uuid(),
    agency_id       uuid not null references agencies(id) on delete cascade,
    channel         message_channel not null,
    phone_number    text,                -- WhatsApp, SMS, voice
    wa_business_id  text,
    page_id         text,                -- Messenger / Instagram
    page_access_token text,
    page_token_expires_at timestamptz,
    instagram_account_id text,
    webhook_url     text,
    webhook_secret  text,
    is_active       boolean not null default true,
    extra           jsonb not null default '{}'::jsonb,
    -- ...
);
```

**Propósito:** una row por cada canal que conectó la agency. Multi-canal sale natural: cliente conecta WhatsApp = 1 row, conecta Instagram = otra row.

**Decisiones:**
- Todos los identifiers son `text` nullable porque cada canal usa los que aplican
- `extra jsonb` para config específica que no merece columna fija
- `webhook_secret` se guarda acá para validar firmas HMAC entrantes (no en código)
- `page_token_expires_at` para alertar antes de que expiren tokens de Meta (60 días)

**Query típica:**
```sql
-- Obtener config WhatsApp de la agency activa
select phone_number, wa_business_id from agency_channels
 where agency_id = $1 and channel = 'whatsapp' and is_active = true;

-- Tokens que expiran en <7 días (alertar)
select agency_id, channel, page_id, page_token_expires_at
  from agency_channels
 where page_token_expires_at < now() + interval '7 days'
   and is_active = true;
```

---

## `leads` — quien escribe al chatbot

```sql
create table public.leads (
    id              uuid primary key default gen_random_uuid(),
    agency_id       uuid not null references agencies(id) on delete cascade,
    full_name       text,
    display_name    text,
    phone           text,
    email           citext,
    wa_user_id      text,
    ig_user_id      text,
    fb_user_id      text,
    external_ref    text,
    source          lead_source not null default 'whatsapp',
    source_detail   text,
    status          lead_status not null default 'nuevo',
    score           integer check (score is null or score between 0 and 100),
    assigned_user_id uuid references auth.users(id) on delete set null,
    is_qualified    boolean not null default false,
    is_blocked      boolean not null default false,
    blocked_reason  text,
    first_contact_at timestamptz,
    last_contact_at  timestamptz,
    last_message_at  timestamptz,
    notes           text,
    extra           jsonb not null default '{}'::jsonb,
    -- ...
    constraint uq_leads_wa unique (agency_id, wa_user_id),
    constraint uq_leads_ig unique (agency_id, ig_user_id),
    constraint uq_leads_fb unique (agency_id, fb_user_id)
);
```

**Propósito:** el contacto. "Lead" es genérico: puede ser prospecto comercial, paciente, comprador, cliente de soporte, etc.

**Decisiones:**
- `display_name` ≠ `full_name`: display_name es lo que viene del canal (WA profile name, que es lo único que tenés al inicio); full_name lo completa el agente o el bot cuando lo descubre
- IDs externos por canal (`wa_user_id`, `ig_user_id`, `fb_user_id`) con UNIQUE: un lead = una persona única por canal
- `external_ref` para mantener vínculo a sistemas externos (CRM previo, ID original de Airtable durante migración)
- `is_blocked` para spam/abuso (no eliminar — auditoría)
- `extra jsonb` para data libre per-lead

**Gotcha — múltiples canales del mismo lead:**

Si la misma persona te escribe primero por WhatsApp (`wa_user_id=ABC`) y después por Instagram (`ig_user_id=XYZ`), por default crearías 2 leads distintos. Para unificarlos:
1. Detectar duplicate (mismo phone/email)
2. Mergear manualmente: copiar IDs externos a un solo lead row + apuntar conversations al lead canónico

Esto es un caso edge — por ahora la regla es: 1 row de lead por usuario único por canal. La unificación cross-canal viene cuando aparezca el caso real.

**Query típica:**
```sql
-- Upsert al recibir mensaje de WhatsApp
insert into leads (agency_id, wa_user_id, phone, display_name, source)
values ($1, $2, $3, $4, 'whatsapp')
on conflict (agency_id, wa_user_id) do update
   set display_name = excluded.display_name,
       last_contact_at = now()
returning id;
```

---

## `conversations` — UNA conversación por (agency, lead, canal) PARA SIEMPRE

```sql
create table public.conversations (
    id              uuid primary key default gen_random_uuid(),
    agency_id       uuid not null references agencies(id) on delete cascade,
    lead_id         uuid not null references leads(id) on delete cascade,
    channel         message_channel not null,
    handler         conversation_handler not null default 'bot',
    bot_paused_until timestamptz,
    handoff_status  conversation_handoff_status not null default 'none',
    handoff_reason  conversation_handoff_reason,
    handoff_summary text,
    handoff_at      timestamptz,
    handoff_task_id uuid,
    assigned_user_id uuid references auth.users(id) on delete set null,
    unread_count    integer not null default 0,
    last_inbound_at timestamptz,
    last_outbound_at timestamptz,
    last_message_at timestamptz,
    last_message_preview text,
    archived_at     timestamptz,
    extra           jsonb not null default '{}'::jsonb,
    -- ...
    constraint uq_conversations_agency_lead_channel unique (agency_id, lead_id, channel)
);
```

**Propósito:** la "carpeta" donde viven los mensajes con un lead en un canal.

**Decisión CRÍTICA:** UNA conversation por `(agency, lead, channel)` **para siempre**. NO crear una nueva cada 24h. NO crear una nueva cada lunes. NO crear una nueva por sesión.

**Por qué:** la "ventana 24h de WhatsApp" no es una conversation nueva — es un cómputo client-side (`now() - last_inbound_at < 24h`). Tener 1 conversation eterna preserva el historial completo del lead.

**Multi-canal:** el mismo lead que escribe por WhatsApp Y por Instagram tiene **2 conversations distintas**. Cada canal su propia línea de mensajes, su propio bot/handler, su propio handoff. La UI puede agruparlos visualmente, pero en DB están separados.

**Handoff:**
- `handler='bot'` = el bot responde
- `handler='human'` = un agente humano la tomó
- `handoff_status='pending'` = el bot terminó su parte y necesita atención humana (el trigger crea task auto)
- `handoff_status='handled'` = un agente ya respondió (auto-marcado por trigger en primer outbound de agent)

**Denormalized columns** (mantenidos por trigger `on_message_insert`):
- `last_message_at`, `last_message_preview` — para timeline del inbox
- `unread_count` — badge en sidebar
- `last_inbound_at` — para computar ventana 24h en UI

**Query típica:**
```sql
-- Inbox del agente: conversaciones activas ordenadas por último mensaje
select id, lead_id, channel, last_message_preview, unread_count, handler, handoff_status
  from conversations
 where agency_id = $1 and archived_at is null
 order by last_message_at desc nulls last
 limit 50;
```

---

## `messages` — cada mensaje individual

```sql
create table public.messages (
    id              uuid primary key default gen_random_uuid(),
    agency_id       uuid not null references agencies(id) on delete cascade,
    conversation_id uuid not null references conversations(id) on delete cascade,
    lead_id         uuid not null references leads(id) on delete cascade,
    channel         message_channel not null,             -- denormalizado
    direction       message_direction not null,
    sender_kind     message_sender_kind not null,
    sender_user_id  uuid references auth.users(id) on delete set null,
    kind            message_kind not null default 'text',
    body            text,
    media_url       text,
    media_mime      text,
    media_metadata  jsonb,
    external_id     text,
    wa_message_id   text,
    status          message_status not null default 'queued',
    error_code      text,
    error_message   text,
    reply_to_message_id uuid references messages(id) on delete set null,
    is_bot_generated boolean not null default false,
    bot_reasoning   jsonb,
    pricing_category text,
    total_price     numeric(12,6),
    sent_at         timestamptz,
    delivered_at    timestamptz,
    read_at         timestamptz,
    created_at      timestamptz not null default now(),
    constraint uq_messages_external_id unique (agency_id, channel, external_id)
);
```

**Decisiones:**
- `kind` enum cubre text/image/audio/video/document/location/template/interactive/sticker/system
- `body` puede ser null (un audio sin transcripción) — pero típicamente tiene el text o caption
- `media_url` debe ser URL pública (validar antes de insertar)
- `external_id` para idempotencia (UNIQUE con agency_id + channel)
- `wa_message_id` legacy alias para compatibilidad con sistemas WhatsApp-only previos
- `reply_to_message_id` para threading (cuando el lead responde citando un mensaje específico)
- `bot_reasoning jsonb` para guardar el internal state del LLM (debugging, replay, training data)

**Gotcha — idempotencia:**

YCloud y Meta reenvían webhooks si tu endpoint responde 4xx/5xx. Para evitar duplicados:

```sql
insert into messages (agency_id, conversation_id, ..., external_id)
values (...)
on conflict (agency_id, channel, external_id) do nothing
returning id;
```

Si el insert se duplica, `returning id` devuelve cero rows — el caller sabe que era duplicado.

**Query típica:**
```sql
-- Timeline de una conversation
select id, direction, sender_kind, kind, body, media_url, created_at
  from messages
 where conversation_id = $1
 order by created_at asc;
```

---

## `tasks` — recordatorios, seguimientos, escalaciones

```sql
create table public.tasks (
    id              uuid primary key default gen_random_uuid(),
    agency_id       uuid not null references agencies(id) on delete cascade,
    lead_id         uuid references leads(id) on delete cascade,
    conversation_id uuid references conversations(id) on delete cascade,
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
    -- ...
);
```

**Propósito:** todo "TODO" que un humano (o el sistema) debe hacer respecto a un lead/conversación.

**Decisiones:**
- `origin = 'auto'` cuando la crea un trigger (handoff, SLA breach), `'manual'` cuando la crea un agente
- `assigned_user_id` nullable: tasks sin asignar = "cualquiera del equipo"
- `due_at` opcional: tasks sin deadline son recordatorios suaves
- `kind` cubre los más comunes: call, meeting, followup, doc, reminder, etc.

**Auto-creación desde handoff:** cuando `conversations.handoff_status` pasa a `'pending'`, el trigger `on_handoff_pending` crea una task auto con `priority='high'`, `due_at = now() + 30min`, `kind='followup'`.

**Query típica:**
```sql
-- Tareas pendientes del agente actual
select id, title, due_at, lead_id, priority
  from tasks
 where assigned_user_id = $1
   and status in ('pending', 'in_progress')
 order by priority desc, due_at asc nulls last;
```

---

## `tags` + `tag_assignments` — etiquetado libre polimórfico

```sql
create table public.tags (
    id, agency_id, name, color, description, created_at, ...
    constraint uq_tags_agency_name unique (agency_id, name)
);

create table public.tag_assignments (
    id, agency_id, tag_id,
    entity_type text not null,   -- 'lead' | 'conversation' | 'message'
    entity_id   uuid not null,
    created_at, created_by, ...
);
```

**Propósito:** etiquetar leads/conversaciones/mensajes con tags custom.

**Polimorfismo:** `entity_type` + `entity_id` apunta a cualquier tabla. Pro: una sola tabla de assignments para todo. Contra: no hay FK constraint cross-table (validar en app).

**Query típica:**
```sql
-- Tags de un lead
select t.name, t.color
  from tag_assignments ta
  join tags t on t.id = ta.tag_id
 where ta.entity_type = 'lead' and ta.entity_id = $1;
```

---

## `custom_field_defs` + `custom_field_values` — schema flex

```sql
create table public.custom_field_defs (
    id, agency_id,
    entity_type text not null,    -- 'lead' | 'conversation'
    field_key   text not null,    -- 'alergias', 'talla_preferida'
    label       text not null,
    field_type  text default 'text',   -- 'text' | 'number' | 'date' | 'select' | 'boolean'
    options     jsonb,                  -- para select: ["S","M","L"]
    is_required boolean default false,
    display_order integer default 0,
    ...
);

create table public.custom_field_values (
    id, agency_id,
    field_def_id uuid references custom_field_defs(id),
    entity_type, entity_id,
    value jsonb,
    ...
);
```

**Propósito:** data variable per-cliente sin tocar schema. Cada cliente puede definir sus propios campos.

**Reglas:**
- Define el campo UNA vez por agency (`custom_field_defs`)
- Pobla valores per-entidad (`custom_field_values`)
- `value jsonb` permite cualquier tipo; parsear en app según `field_type`

**Cuándo usar — ver [01-arquitectura.md](01-arquitectura.md#custom-fields-cuándo-usarlos).**

---

## `webhook_events_raw` — log paranoid

```sql
create table public.webhook_events_raw (
    id              uuid primary key default gen_random_uuid(),
    agency_id       uuid references agencies(id) on delete set null,
    source          text not null,
    event_type      text,
    channel         message_channel,
    raw_payload     jsonb not null,
    signature_valid boolean not null default false,
    processing_error text,
    processed_at    timestamptz,
    received_at     timestamptz not null default now()
);
```

**Propósito:** log de TODOS los webhooks recibidos ANTES de procesarlos. Si tu edge function falla, podés re-procesar.

**Lifecycle:**
1. Webhook llega a edge function
2. Inmediato: insert row con `raw_payload` + `signature_valid`
3. Procesar (insert lead/conversation/message según corresponda)
4. Update row con `processed_at`
5. Si falla: update row con `processing_error`

**Retention:** poner cron job que borre rows `processed_at < now() - interval '30 days'` para no llenar disco.

---

## `audit_log` — historial de cambios importantes

```sql
create table public.audit_log (
    id, agency_id,
    actor_user_id uuid,
    actor_kind text default 'user',   -- 'user' | 'bot' | 'system'
    action      audit_action not null, -- create | update | delete | login | export | send_message | state_change
    entity_type, entity_id,
    before jsonb, after jsonb, metadata jsonb,
    created_at
);
```

**Propósito:** quién hizo qué y cuándo. Para compliance, debugging, y forensia.

**Cuándo escribir:** desde código de la app + algunos triggers (cambios de status críticos). NO hacer audit de TODA insert/update — eso llena la DB. Audit solo de acciones que importan.

---

## Helpers en schema `app`

Todas las funciones helper viven en `schema app` (no expuesto a PostgREST). Esto las oculta de la API REST y permite usar `security definer` con seguridad.

Funciones provistas:
- `app.touch_updated_at()` — trigger genérico para actualizar `updated_at`
- `app.current_user_agency_ids()` — para RLS, retorna agencies del usuario actual
- `app.current_user_role_in(agency_id)` — para RLS, retorna rol del user
- `app.on_message_insert()` — denorm de conversation + lead
- `app.on_handoff_pending()` — auto-crear task + flip handler a humano
- `app.on_agent_outbound_mark_handled()` — auto-marcar handled cuando agent responde
- `app.broadcast_message_change()` — emit realtime broadcast
- `app.broadcast_conversation_change()` — emit realtime broadcast
- `app.is_slot_available(agency, staff, start, duration)` — (plug-in reservas) validar slot libre

---

## Próximos pasos

- **[03-plug-ins-por-nicho.md](03-plug-ins-por-nicho.md)** — qué agrega cada plug-in
- **[04-onboarding-paso-a-paso.md](04-onboarding-paso-a-paso.md)** — armar tu primer chatbot
- **[05-migracion-desde-airtable.md](05-migracion-desde-airtable.md)** — migrar data existente
