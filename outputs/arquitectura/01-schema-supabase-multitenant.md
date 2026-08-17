# Schema Supabase Multi-Tenant — Casa CRM

> **Versión:** 0.1 (draft arquitectónico, pre-implementación)
> **Fecha:** 2026-05-18
> **Autor:** Arquitecto técnico (agente)
> **Alcance:** Fase 1 (3 pilotos, bot + inbox) + Fase 2 (CRM completo, 8-12 clientes pagando)
> **Fuera de alcance:** Fase 3-4 (voice agent, MLS, CMA, multi-agencia por usuario, billing/pricing tier features)

---

## 0. TL;DR para el founder

- **Tenant = `agency`**. Un agente solo es una agencia con 1 miembro. No hay caso especial "freelancer".
- **Multi-tenancy por single-DB + RLS** sobre columna `agency_id` en todas las tablas de negocio. Es la opción correcta para 3-50 clientes; reconsiderar a 500+.
- **Un usuario = una agencia** en v1. La tabla puente `agency_members` ya existe (con `role`) para no migrar schema cuando agreguemos multi-agency en v2.
- **N8N usa `service_role` y bypasea RLS** — debe SIEMPRE incluir `agency_id` correcto. La fuente de verdad para resolver "este mensaje de WhatsApp ¿de qué agencia es?" es `whatsapp_numbers.phone_number_id → agency_id`.
- **Realtime activo en 4 tablas:** `messages`, `conversations`, `leads`, `tasks`. El filtrado por tenant lo hace RLS automáticamente.
- **Storage en 3 buckets** con paths prefijados por `agency_id/` para garantizar aislamiento físico además de policy.
- **Migraciones SQL versionadas** en `supabase/migrations/`. Types TS generados con `supabase gen types typescript`.

---

## 1. Modelo de multi-tenancy

### 1.1 Unidad de tenant: `agency`

La unidad de aislamiento es **`agency`** (agencia inmobiliaria). Razones:

1. **Generaliza sin caso especial:** un agente independiente = agencia con `legal_id` = su cédula física y 1 miembro. Una "inmobiliaria boutique" del futuro = agencia con N miembros. Mismo modelo, distinto contenido.
2. **Datos fiscales reales:** en Costa Rica el agente factura con cédula física O cédula jurídica. El campo va en la agencia, no en el usuario.
3. **El número de WhatsApp se conecta a la agencia, no al usuario.** Si el dueño contrata un asistente, el asistente atiende el mismo número.
4. **Branding compartido:** logo, color, dominio de portal público, plantillas de WA — todo vive a nivel agencia.

### 1.2 Identificación

Cada `agency` tiene:

- **`id` (uuid):** identificador interno, siempre referenciado por FK en tablas hijas.
- **`slug` (text, UNIQUE):** identificador URL-safe (`casa-vargas`, `momentum-realty`). Usado para subdominios de portal público (`casa-vargas.casacrm.app`) y para deep-links.

Ambos. UUID para integridad referencial, slug para humanos y URLs.

### 1.3 ¿Un usuario puede pertenecer a múltiples agencias?

**No en v1. La estructura de tablas YA lo permite, pero el código de aplicación asume 1:1.**

Diseño:
- `auth.users` (Supabase Auth, no la tocamos)
- `profiles` (1:1 con `auth.users`, datos públicos del usuario — nombre, avatar, idioma)
- `agency_members` (N:M entre `profiles` y `agencies`, con `role` y `is_active`)

En v1, una constraint a nivel aplicación (o un trigger) asegura que un `user_id` no aparezca activo en >1 agencia. En v2 lo relajamos sin migrar nada.

**Por qué no v1:** las RLS policies se complican (¿qué agencia es la "actual"?) y el founder dijo explícitamente que el cliente objetivo es agente solo o con 1 asistente. No vale la complejidad.

### 1.4 Trade-offs: ¿por qué single DB + RLS y no las alternativas?

| Estrategia | Pro | Contra | ¿Para nosotros? |
|---|---|---|---|
| **Single DB + RLS (elegida)** | 1 schema, 1 backup, 1 migración. Supabase nativo (Auth + Realtime + Storage filtran por RLS auto). N8N escribe en una sola DB. Costo plano hasta 100s de tenants. | Bug en policy = leak entre tenants (riesgo absoluto). Una query lenta de un tenant pesado afecta a otros (noisy neighbor). Límite práctico ~500-1000 tenants antes de que tablas se vuelvan ingobernables. | **Sí.** Estamos en 3-12 clientes. El riesgo de policy se mitiga con tests + auditoría. |
| **Schema-per-tenant** (postgres schema separado por tenant) | Aislamiento lógico fuerte. Cada tenant puede tener índices/extensiones distintos. Backup parcial posible. | Supabase no lo soporta de fábrica (Auth/Realtime/Storage asumen `public`). Migraciones N veces más caras. Cliente SDK requiere `search_path` dinámico. | No. Costo operativo brutal para ganar poco. |
| **DB-per-tenant** | Aislamiento máximo (cada cliente = su Supabase project). Compliance fácil. | Cada cliente cuesta $25/mes mínimo en Pro. Onboarding = crear proyecto + migrar schema + provisionar keys. N8N necesita N conexiones. No factible <$200/mes/cliente. | No. Mata la economía del SaaS al ticket que apuntamos. |
| **Hybrid (DB per "enterprise tier")** | Da camino para escalar clientes premium. | Complejidad operativa antes de tener problema. | **Futuro v3.** No ahora. |

**Veredicto:** Single DB + RLS hasta 200 tenants. Después revisar.

### 1.5 Roles dentro de la agencia

`agency_members.role` (enum `agency_role`):

- `owner` — dueño, puede borrar la agencia, gestionar billing, invitar/quitar miembros. Default al crear.
- `admin` — todo lo del owner excepto borrar agencia y cambiar plan.
- `agent` — CRUD de sus propios leads/propiedades, ver los del equipo, no toca config.
- `viewer` — read-only. Para asistentes virtuales, contadores, etc.

En v1 todos los miembros son `owner` o `agent`. El resto está en schema, sin UI.

---

## 2. Schema completo

Convenciones:

- Todos los nombres en **`snake_case`**.
- Toda PK es `uuid` con `default gen_random_uuid()`. Excepción: enums no son tablas.
- Toda tabla de negocio tiene `agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE`.
- Toda tabla tiene `created_at timestamptz NOT NULL DEFAULT now()` y `updated_at timestamptz NOT NULL DEFAULT now()`.
- Hay un trigger `set_updated_at` aplicado a toda tabla con `updated_at` (ver §7).
- Las columnas de tipo "estado" usan **enums postgres**, no `text`. Cambiar enum requiere migración, eso es deseable.
- Todo FK importante tiene índice explícito (Postgres no los crea automáticamente).
- Soft delete vía `archived_at timestamptz NULL` en tablas largas (leads, properties, conversations). Hard delete solo bajo borrado de cuenta.

### 2.1 Enums

```sql
CREATE TYPE agency_role        AS ENUM ('owner', 'admin', 'agent', 'viewer');
CREATE TYPE agency_plan        AS ENUM ('trial', 'starter', 'pro', 'enterprise');
CREATE TYPE lead_status        AS ENUM ('nuevo', 'contactado', 'calificado', 'visita_agendada', 'en_negociacion', 'cerrado_ganado', 'cerrado_perdido', 'frio');
CREATE TYPE lead_source        AS ENUM ('whatsapp', 'instagram', 'facebook_ads', 'sitio_web', 'referido', 'encuentra24', 'properstar', 'manual', 'otro');
CREATE TYPE lead_operation     AS ENUM ('compra', 'alquiler', 'venta');
CREATE TYPE property_type      AS ENUM ('casa', 'apartamento', 'villa', 'lote', 'local_comercial', 'oficina', 'edificio', 'finca', 'bodega');
CREATE TYPE property_operation AS ENUM ('venta', 'alquiler', 'alquiler_temporal');
CREATE TYPE property_status    AS ENUM ('borrador', 'disponible', 'reservada', 'vendida', 'alquilada', 'pausada', 'archivada');
CREATE TYPE conversation_handler AS ENUM ('bot', 'human', 'unassigned');
CREATE TYPE message_direction  AS ENUM ('inbound', 'outbound');
CREATE TYPE message_sender_kind AS ENUM ('lead', 'bot', 'agent', 'system');
CREATE TYPE message_kind       AS ENUM ('text', 'image', 'audio', 'video', 'document', 'location', 'template', 'interactive', 'sticker', 'system');
CREATE TYPE message_status     AS ENUM ('queued', 'sent', 'delivered', 'read', 'failed');
CREATE TYPE task_origin        AS ENUM ('manual', 'auto');
CREATE TYPE task_kind          AS ENUM ('call', 'visit', 'meeting', 'followup', 'doc', 'message', 'reminder', 'reactivate');
CREATE TYPE task_status        AS ENUM ('pending', 'in_progress', 'done', 'cancelled', 'overdue');
CREATE TYPE task_priority      AS ENUM ('low', 'normal', 'high');
CREATE TYPE event_kind         AS ENUM ('visit', 'call', 'meeting', 'openhouse', 'personal');
CREATE TYPE event_source       AS ENUM ('crm', 'gcal');
CREATE TYPE document_category  AS ENUM ('identificacion', 'financiero', 'contrato', 'propiedad', 'otro');
CREATE TYPE wa_template_status AS ENUM ('pending_review', 'approved', 'rejected', 'paused', 'disabled');
CREATE TYPE audit_action       AS ENUM ('create', 'update', 'delete', 'login', 'export', 'send_message', 'state_change');
```

### 2.2 Tablas

#### `agencies` — tenant root
- `id`: uuid PK DEFAULT gen_random_uuid()
- `slug`: text UNIQUE NOT NULL (lowercase, kebab-case, regex `^[a-z0-9-]{3,40}$`)
- `name`: text NOT NULL
- `legal_name`: text — razón social formal
- `legal_id`: text — cédula física o jurídica de CR (formato libre, validamos en app)
- `country_code`: text NOT NULL DEFAULT 'CR' (ISO 3166-1 alpha-2)
- `timezone`: text NOT NULL DEFAULT 'America/Costa_Rica'
- `locale`: text NOT NULL DEFAULT 'es-CR'
- `currency`: text NOT NULL DEFAULT 'USD'
- `logo_url`: text NULL
- `primary_color`: text NULL (hex `#XXXXXX`)
- `plan`: agency_plan NOT NULL DEFAULT 'trial'
- `trial_ends_at`: timestamptz NULL
- `bot_enabled`: boolean NOT NULL DEFAULT true
- `bot_handoff_keywords`: text[] NOT NULL DEFAULT '{}'
- `bot_persona_prompt`: text NULL — system prompt custom para Claude
- `settings`: jsonb NOT NULL DEFAULT '{}'::jsonb — bag para flags no estructurados
- `archived_at`: timestamptz NULL
- `created_at`: timestamptz NOT NULL DEFAULT now()
- `updated_at`: timestamptz NOT NULL DEFAULT now()

Índices:
- `idx_agencies_slug` UNIQUE on (slug)
- `idx_agencies_plan` on (plan) WHERE archived_at IS NULL

Comentario: Tenant root. Borrarla cascadea todo el negocio (no debería pasar — usar `archived_at`).

---

#### `profiles` — datos públicos del usuario
- `id`: uuid PK REFERENCES auth.users(id) ON DELETE CASCADE
- `full_name`: text NOT NULL
- `display_name`: text — preferido en UI (puede ser solo nombre)
- `avatar_url`: text NULL
- `phone`: text NULL — teléfono personal (no es el de WhatsApp del bot)
- `locale`: text NOT NULL DEFAULT 'es-CR'
- `email`: text NOT NULL — duplicado de auth.users.email para facilidad de query
- `created_at`: timestamptz NOT NULL DEFAULT now()
- `updated_at`: timestamptz NOT NULL DEFAULT now()

Índices:
- PK ya cubre (id)
- `idx_profiles_email` on (lower(email))

Comentario: Espejo de `auth.users` con datos no-auth. Trigger en `auth.users` AFTER INSERT crea fila aquí.

---

#### `agency_members` — N:M usuario ↔ agencia
- `id`: uuid PK DEFAULT gen_random_uuid()
- `agency_id`: uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE
- `user_id`: uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
- `role`: agency_role NOT NULL DEFAULT 'agent'
- `is_active`: boolean NOT NULL DEFAULT true
- `invited_by`: uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL
- `invited_at`: timestamptz NULL
- `accepted_at`: timestamptz NULL
- `last_seen_at`: timestamptz NULL
- `display_color`: text NULL — color de avatar en UI (hex)
- `initials`: text NULL — fallback si no hay avatar
- `created_at`: timestamptz NOT NULL DEFAULT now()
- `updated_at`: timestamptz NOT NULL DEFAULT now()

Índices:
- `idx_members_agency` on (agency_id) WHERE is_active
- `idx_members_user` on (user_id) WHERE is_active
- UNIQUE `uq_members_agency_user` on (agency_id, user_id)

Comentario: Tabla crítica — es la fuente de verdad de "qué puede ver este usuario". Toda policy RLS la consulta.

---

#### `whatsapp_numbers` — números YCloud conectados (1 por agencia en v1)
- `id`: uuid PK
- `agency_id`: uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE
- `phone_number_id`: text UNIQUE NOT NULL — identificador en YCloud/Meta (este es el bridge crítico para el webhook)
- `waba_id`: text NOT NULL — WhatsApp Business Account ID
- `display_phone_number`: text NOT NULL — formato E.164 (`+50688887777`)
- `display_name`: text — "María Vargas — Casa CR"
- `is_default`: boolean NOT NULL DEFAULT true
- `is_active`: boolean NOT NULL DEFAULT true
- `ycloud_api_key_encrypted`: text NOT NULL — encriptado at-rest (ver §6.4)
- `coexistence_mode`: boolean NOT NULL DEFAULT true
- `connected_at`: timestamptz NOT NULL DEFAULT now()
- `last_message_at`: timestamptz NULL — para detectar ventana de 13 días en coexistence
- `metadata`: jsonb NOT NULL DEFAULT '{}'::jsonb
- `created_at`: timestamptz NOT NULL DEFAULT now()
- `updated_at`: timestamptz NOT NULL DEFAULT now()

Índices:
- `idx_wa_numbers_phone_number_id` UNIQUE on (phone_number_id)
- `idx_wa_numbers_agency` on (agency_id)

Comentario: ESTA TABLA ES LA QUE PERMITE A N8N RESOLVER `agency_id` DESDE UN WEBHOOK DE YCLOUD. Sin esto no funciona el multi-tenancy del bot.

---

#### `whatsapp_templates` — templates pre-aprobados Meta
- `id`: uuid PK
- `agency_id`: uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE
- `whatsapp_number_id`: uuid NOT NULL REFERENCES whatsapp_numbers(id) ON DELETE CASCADE
- `meta_template_name`: text NOT NULL — el name en Meta (e.g. `agendar_visita_v2`)
- `meta_template_id`: text — id que devuelve Meta
- `name`: text NOT NULL — nombre amigable mostrado al agente
- `category`: text NOT NULL — `MARKETING`, `UTILITY`, `AUTHENTICATION` (los de Meta)
- `language`: text NOT NULL DEFAULT 'es' — código de idioma Meta
- `body`: text NOT NULL — el cuerpo con `{{1}}`, `{{2}}` o nuestro `{{nombre}}`
- `merge_fields`: jsonb NOT NULL DEFAULT '[]'::jsonb — `[{"key":"nombre","desc":"..."}]`
- `status`: wa_template_status NOT NULL DEFAULT 'pending_review'
- `is_active`: boolean NOT NULL DEFAULT true
- `created_at`: timestamptz NOT NULL DEFAULT now()
- `updated_at`: timestamptz NOT NULL DEFAULT now()

Índices:
- UNIQUE `uq_templates_agency_meta_name_lang` on (agency_id, meta_template_name, language)
- `idx_templates_agency` on (agency_id) WHERE is_active

Comentario: Open question — ¿son curados por Momentum (globales) o por agencia? Diseño actual asume **por agencia**, con la opción de copiar templates globales al onboarding (ver §8).

---

#### `properties`
- `id`: uuid PK
- `agency_id`: uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE
- `code`: text NOT NULL — código interno mostrado al cliente (`CR-2031`)
- `title`: text NOT NULL
- `slug`: text — para URL pública de la ficha
- `type`: property_type NOT NULL
- `operation`: property_operation NOT NULL
- `price`: numeric(14,2) NOT NULL
- `currency`: text NOT NULL DEFAULT 'USD'
- `bedrooms`: int NULL
- `bathrooms`: numeric(3,1) NULL — `3.5` válido
- `area_built_m2`: numeric(10,2) NULL
- `area_lot_m2`: numeric(10,2) NULL
- `parking_spaces`: int NULL
- `country_code`: text NOT NULL DEFAULT 'CR'
- `province`: text NULL
- `canton`: text NULL
- `district`: text NULL
- `neighborhood`: text NULL
- `address_line`: text NULL — dirección literal (privada, no se publica)
- `location_text`: text NULL — versión pública ("Escazú, San José")
- `geo`: geography(Point, 4326) NULL — opcional, requiere extension `postgis`
- `description`: text NULL
- `features`: text[] NOT NULL DEFAULT '{}'
- `images`: jsonb NOT NULL DEFAULT '[]'::jsonb — `[{"url":"...","alt":"...","order":0}]`
- `external_url`: text NULL — encuentra24/properstar/sitio del agente
- `status`: property_status NOT NULL DEFAULT 'borrador'
- `featured`: boolean NOT NULL DEFAULT false
- `assigned_agent_id`: uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL
- `view_count`: int NOT NULL DEFAULT 0
- `lead_count`: int NOT NULL DEFAULT 0 — denormalizado para listing rápido (mantenido por trigger sobre `lead_property_interest`)
- `published_at`: timestamptz NULL
- `archived_at`: timestamptz NULL
- `created_at`: timestamptz NOT NULL DEFAULT now()
- `updated_at`: timestamptz NOT NULL DEFAULT now()

Índices:
- UNIQUE `uq_properties_agency_code` on (agency_id, code)
- UNIQUE `uq_properties_agency_slug` on (agency_id, slug) WHERE slug IS NOT NULL
- `idx_properties_agency_status` on (agency_id, status) WHERE archived_at IS NULL
- `idx_properties_agency_operation_type` on (agency_id, operation, type) WHERE archived_at IS NULL
- `idx_properties_agency_featured` on (agency_id, featured) WHERE featured AND archived_at IS NULL
- `idx_properties_assigned_agent` on (assigned_agent_id) WHERE archived_at IS NULL
- `idx_properties_geo` GIST on (geo) — solo si activamos postgis

Comentario: `view_count` y `lead_count` son denormalizados deliberados — la lista de propiedades los necesita sin joins. Mantener vía triggers.

---

#### `leads`
- `id`: uuid PK
- `agency_id`: uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE
- `full_name`: text NOT NULL
- `display_name`: text — usado en chat (primer nombre)
- `phone_e164`: text NULL — formato canónico `+506...`
- `email`: text NULL
- `whatsapp_id`: text NULL — el `wa_id` que devuelve YCloud/Meta (no siempre = phone)
- `status`: lead_status NOT NULL DEFAULT 'nuevo'
- `source`: lead_source NOT NULL DEFAULT 'whatsapp'
- `source_detail`: text NULL — "Campaña IG Octubre", "Encuentra24 listing CR-2031", etc.
- `operation`: lead_operation NULL
- `interest_summary`: text NULL — "Casa Escazú o Santa Ana" (free text, AI puede generar)
- `budget_min`: numeric(14,2) NULL
- `budget_max`: numeric(14,2) NULL
- `budget_currency`: text NULL DEFAULT 'USD'
- `budget_label`: text NULL — fallback humano si no hay rango ("No definido")
- `assigned_agent_id`: uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL
- `score`: int NOT NULL DEFAULT 30 — 0..100, calculado por función (ver §2.3)
- `temperature`: text NOT NULL DEFAULT 'frio' — denormalizado para filtrado rápido (`hot`/`tibio`/`medio`/`frio`)
- `notes`: text NULL
- `last_contact_at`: timestamptz NULL
- `last_inbound_at`: timestamptz NULL
- `last_outbound_at`: timestamptz NULL
- `first_seen_at`: timestamptz NOT NULL DEFAULT now() — cuándo entró el primer mensaje
- `archived_at`: timestamptz NULL
- `metadata`: jsonb NOT NULL DEFAULT '{}'::jsonb
- `created_at`: timestamptz NOT NULL DEFAULT now()
- `updated_at`: timestamptz NOT NULL DEFAULT now()

Índices:
- UNIQUE `uq_leads_agency_whatsapp` on (agency_id, whatsapp_id) WHERE whatsapp_id IS NOT NULL
- UNIQUE `uq_leads_agency_phone` on (agency_id, phone_e164) WHERE phone_e164 IS NOT NULL
- `idx_leads_agency_status` on (agency_id, status) WHERE archived_at IS NULL
- `idx_leads_agency_assigned` on (agency_id, assigned_agent_id) WHERE archived_at IS NULL
- `idx_leads_agency_score` on (agency_id, score DESC) WHERE archived_at IS NULL
- `idx_leads_agency_last_contact` on (agency_id, last_contact_at DESC NULLS LAST)

Comentario: `whatsapp_id` es la primary key conceptual para dedup desde el bot (un mismo teléfono = un solo lead por agencia). Si llega por otro canal sin WA, dedup por `phone_e164`.

---

#### `tags` — etiquetas por agencia
- `id`: uuid PK
- `agency_id`: uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE
- `name`: text NOT NULL
- `color`: text NULL — hex
- `system`: boolean NOT NULL DEFAULT false — true para tags creadas por el bot/sistema (`Hot`, `Crédito pre-aprobado`)
- `created_at`: timestamptz NOT NULL DEFAULT now()
- `updated_at`: timestamptz NOT NULL DEFAULT now()

Índices:
- UNIQUE `uq_tags_agency_name` on (agency_id, lower(name))

---

#### `lead_tags` — N:M leads ↔ tags
- `lead_id`: uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE
- `tag_id`: uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE
- `agency_id`: uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE — redundante pero necesaria para RLS sin join doble
- `created_at`: timestamptz NOT NULL DEFAULT now()
- PRIMARY KEY (lead_id, tag_id)

Índices:
- `idx_lead_tags_tag` on (tag_id)
- `idx_lead_tags_agency` on (agency_id)

Comentario: La columna `agency_id` redundante permite que la policy RLS sea SIN join, lo que la hace 10x más rápida. Vale el costo de mantenerla con un trigger.

---

#### `lead_property_interest` — N:M lead ↔ properties
- `id`: uuid PK
- `agency_id`: uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE
- `lead_id`: uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE
- `property_id`: uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE
- `interest_level`: int NOT NULL DEFAULT 1 — 1..5 (lead lo pidió vs bot lo sugirió)
- `source`: text NULL — `bot_suggested`, `lead_asked`, `agent_added`
- `created_at`: timestamptz NOT NULL DEFAULT now()
- UNIQUE (lead_id, property_id)

Índices:
- `idx_lpi_agency` on (agency_id)
- `idx_lpi_property` on (property_id)
- `idx_lpi_lead` on (lead_id)

---

#### `conversations`
- `id`: uuid PK
- `agency_id`: uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE
- `lead_id`: uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE
- `whatsapp_number_id`: uuid NOT NULL REFERENCES whatsapp_numbers(id) ON DELETE CASCADE
- `channel`: text NOT NULL DEFAULT 'whatsapp' — futuro: 'instagram_dm', 'email'
- `handler`: conversation_handler NOT NULL DEFAULT 'bot'
- `assigned_agent_id`: uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL
- `pinned`: boolean NOT NULL DEFAULT false
- `unread_count`: int NOT NULL DEFAULT 0 — denormalizado, mantenido por trigger en messages
- `last_message_at`: timestamptz NULL
- `last_message_preview`: text NULL — corto, para listing del inbox
- `last_message_sender_kind`: message_sender_kind NULL
- `bot_paused_until`: timestamptz NULL — si el agente toma el control manualmente, el bot se desactiva por X horas
- `handoff_reason`: text NULL — "intent: agendar visita", "manual override"
- `archived_at`: timestamptz NULL
- `created_at`: timestamptz NOT NULL DEFAULT now()
- `updated_at`: timestamptz NOT NULL DEFAULT now()

Índices:
- UNIQUE `uq_conversations_lead_channel` on (lead_id, channel) WHERE archived_at IS NULL
- `idx_conversations_agency_handler` on (agency_id, handler) WHERE archived_at IS NULL
- `idx_conversations_agency_lastmsg` on (agency_id, last_message_at DESC NULLS LAST) WHERE archived_at IS NULL
- `idx_conversations_assigned` on (assigned_agent_id) WHERE archived_at IS NULL

Comentario: Open question crítica — ¿una conversación por (lead, canal) PARA TODA LA VIDA, o una nueva cada vez que se reactiva la ventana de 24h de WA? Decisión actual: **una sola por lead+canal**, los "session breaks" se ven en la timeline. Más simple, más útil para CRM.

---

#### `messages`
- `id`: uuid PK
- `agency_id`: uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE
- `conversation_id`: uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE
- `lead_id`: uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE — denormalizado para queries rápidas por lead
- `direction`: message_direction NOT NULL
- `sender_kind`: message_sender_kind NOT NULL
- `sender_user_id`: uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL — solo si sender_kind='agent'
- `kind`: message_kind NOT NULL DEFAULT 'text'
- `body`: text NULL — texto plano (o caption de media)
- `media_url`: text NULL — Storage path o YCloud URL
- `media_mime`: text NULL
- `media_metadata`: jsonb NULL — `{width,height,duration_ms,filename,...}`
- `template_id`: uuid NULL REFERENCES whatsapp_templates(id) ON DELETE SET NULL
- `template_variables`: jsonb NULL — los valores con los que se rellenó
- `property_card_id`: uuid NULL REFERENCES properties(id) ON DELETE SET NULL — para el "card" inline tipo `data.js`
- `status`: message_status NOT NULL DEFAULT 'queued'
- `ycloud_message_id`: text — id de YCloud para reconciliar webhooks de status
- `wa_message_id`: text — id que Meta asigna (`wamid.HBg...`)
- `error_code`: text NULL
- `error_message`: text NULL
- `reply_to_message_id`: uuid NULL REFERENCES messages(id) ON DELETE SET NULL
- `is_bot_generated`: boolean NOT NULL DEFAULT false — true si Claude la generó (subset de sender_kind='bot')
- `bot_reasoning`: jsonb NULL — debug: prompt, tools llamadas, etc. Opcional, puede ser pesado.
- `sent_at`: timestamptz NULL
- `delivered_at`: timestamptz NULL
- `read_at`: timestamptz NULL
- `created_at`: timestamptz NOT NULL DEFAULT now()

Índices:
- `idx_messages_conversation_created` on (conversation_id, created_at DESC)
- `idx_messages_agency_created` on (agency_id, created_at DESC)
- `idx_messages_lead_created` on (lead_id, created_at DESC)
- UNIQUE `uq_messages_ycloud_id` on (ycloud_message_id) WHERE ycloud_message_id IS NOT NULL
- UNIQUE `uq_messages_wa_id` on (wa_message_id) WHERE wa_message_id IS NOT NULL
- `idx_messages_status_unsent` on (agency_id, status) WHERE status IN ('queued', 'failed')

Comentario: Open question — ¿guardamos system messages como "Conversación transferida a María"? Sí, con `sender_kind='system'`. Hace el timeline más legible y son baratos.

Sin `updated_at` deliberado — los mensajes son inmutables salvo status, que se maneja vía `delivered_at`/`read_at`/`status`.

---

#### `tasks`
- `id`: uuid PK
- `agency_id`: uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE
- `lead_id`: uuid NULL REFERENCES leads(id) ON DELETE CASCADE
- `property_id`: uuid NULL REFERENCES properties(id) ON DELETE CASCADE
- `assigned_to`: uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL — NULL si la task es del bot
- `origin`: task_origin NOT NULL DEFAULT 'manual'
- `kind`: task_kind NOT NULL
- `title`: text NOT NULL
- `notes`: text NULL
- `due_at`: timestamptz NULL
- `location`: text NULL
- `status`: task_status NOT NULL DEFAULT 'pending'
- `priority`: task_priority NOT NULL DEFAULT 'normal'
- `completed_at`: timestamptz NULL
- `created_by`: uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL — NULL si la creó el bot
- `bot_workflow_run_id`: text NULL — N8N execution id, para tracing
- `metadata`: jsonb NOT NULL DEFAULT '{}'::jsonb
- `created_at`: timestamptz NOT NULL DEFAULT now()
- `updated_at`: timestamptz NOT NULL DEFAULT now()

Índices:
- `idx_tasks_agency_status_due` on (agency_id, status, due_at NULLS LAST)
- `idx_tasks_assigned_status` on (assigned_to, status) WHERE status IN ('pending', 'in_progress')
- `idx_tasks_lead` on (lead_id) WHERE lead_id IS NOT NULL
- `idx_tasks_property` on (property_id) WHERE property_id IS NOT NULL
- `idx_tasks_overdue` on (agency_id, due_at) WHERE status = 'pending' AND due_at IS NOT NULL

Comentario: Un task puede ser standalone (sin lead ni property), con lead, con property, o ambos. CHECK explícita: al menos un campo de los críticos esté presente — no, en realidad permitimos standalone para tasks personales del agente (ver `data.js` `t20-t25`).

---

#### `documents`
- `id`: uuid PK
- `agency_id`: uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE
- `lead_id`: uuid NULL REFERENCES leads(id) ON DELETE CASCADE
- `property_id`: uuid NULL REFERENCES properties(id) ON DELETE CASCADE
- `name`: text NOT NULL — nombre original del archivo
- `storage_path`: text NOT NULL — path en bucket de Storage
- `mime_type`: text NOT NULL
- `size_bytes`: bigint NOT NULL
- `category`: document_category NOT NULL DEFAULT 'otro'
- `uploaded_by_user_id`: uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL
- `uploaded_by_lead`: boolean NOT NULL DEFAULT false — el lead lo mandó por WhatsApp
- `source_message_id`: uuid NULL REFERENCES messages(id) ON DELETE SET NULL — si vino de un mensaje
- `metadata`: jsonb NOT NULL DEFAULT '{}'::jsonb
- `archived_at`: timestamptz NULL
- `created_at`: timestamptz NOT NULL DEFAULT now()
- `updated_at`: timestamptz NOT NULL DEFAULT now()

Índices:
- `idx_documents_lead` on (lead_id) WHERE archived_at IS NULL
- `idx_documents_property` on (property_id) WHERE archived_at IS NULL
- `idx_documents_agency` on (agency_id, created_at DESC) WHERE archived_at IS NULL

---

#### `events` — calendario
- `id`: uuid PK
- `agency_id`: uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE
- `title`: text NOT NULL
- `kind`: event_kind NOT NULL
- `lead_id`: uuid NULL REFERENCES leads(id) ON DELETE SET NULL
- `property_id`: uuid NULL REFERENCES properties(id) ON DELETE SET NULL
- `assigned_to`: uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL
- `starts_at`: timestamptz NOT NULL
- `ends_at`: timestamptz NOT NULL
- `all_day`: boolean NOT NULL DEFAULT false
- `location`: text NULL
- `notes`: text NULL
- `source`: event_source NOT NULL DEFAULT 'crm'
- `gcal_event_id`: text NULL — id en Google Calendar
- `gcal_calendar_id`: text NULL
- `synced_at`: timestamptz NULL
- `created_by`: uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL
- `created_at`: timestamptz NOT NULL DEFAULT now()
- `updated_at`: timestamptz NOT NULL DEFAULT now()

Índices:
- `idx_events_agency_starts` on (agency_id, starts_at)
- `idx_events_assigned_starts` on (assigned_to, starts_at)
- `idx_events_lead` on (lead_id) WHERE lead_id IS NOT NULL
- UNIQUE `uq_events_gcal` on (gcal_event_id, gcal_calendar_id) WHERE gcal_event_id IS NOT NULL
- CHECK `ck_events_time_order` (ends_at >= starts_at)

---

#### `quick_replies` — respuestas rápidas del agente
- `id`: uuid PK
- `agency_id`: uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE
- `label`: text NOT NULL
- `body`: text NOT NULL
- `sort_order`: int NOT NULL DEFAULT 0
- `created_by`: uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL
- `created_at`: timestamptz NOT NULL DEFAULT now()
- `updated_at`: timestamptz NOT NULL DEFAULT now()

Índices:
- `idx_quick_replies_agency` on (agency_id, sort_order)

---

#### `activity_log` — audit log inmutable
- `id`: bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY
- `agency_id`: uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE
- `actor_user_id`: uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL — NULL si actor es bot o sistema
- `actor_kind`: text NOT NULL DEFAULT 'user' — `user`, `bot`, `system`, `n8n`
- `action`: audit_action NOT NULL
- `entity_type`: text NOT NULL — `lead`, `property`, `conversation`, etc.
- `entity_id`: uuid NULL
- `summary`: text NOT NULL — frase humana ("Cambió estado de 'Nuevo' a 'Calificado'")
- `diff`: jsonb NULL — old/new values
- `request_id`: text NULL — para correlación con logs de N8N/edge functions
- `created_at`: timestamptz NOT NULL DEFAULT now()

Índices:
- `idx_activity_agency_created` on (agency_id, created_at DESC)
- `idx_activity_entity` on (entity_type, entity_id)
- `idx_activity_actor` on (actor_user_id) WHERE actor_user_id IS NOT NULL

Comentario: Sin `updated_at`. Append-only. Solo INSERT, nunca UPDATE/DELETE (enforced en policy).

### 2.3 Funciones helper (RPC + triggers)

```sql
-- Helper para policies: ¿es este user miembro activo de esta agency?
CREATE OR REPLACE FUNCTION app.is_agency_member(p_agency_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agency_members
    WHERE agency_id = p_agency_id
      AND user_id = auth.uid()
      AND is_active
  );
$$;

-- Helper para policies: roles del user en la agency
CREATE OR REPLACE FUNCTION app.agency_role(p_agency_id uuid)
RETURNS agency_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT role FROM public.agency_members
  WHERE agency_id = p_agency_id AND user_id = auth.uid() AND is_active
  LIMIT 1;
$$;

-- Trigger genérico para updated_at
CREATE OR REPLACE FUNCTION app.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Función de scoring (port de calcLeadScore en data.js, server-side)
CREATE OR REPLACE FUNCTION app.calc_lead_score(p_lead_id uuid)
RETURNS int LANGUAGE plpgsql STABLE AS $$
  -- Implementación se hace en migración separada. Devuelve 0..100.
$$;
```

---

## 3. Row Level Security (RLS) policies

**Regla general:** `ENABLE ROW LEVEL SECURITY` en TODAS las tablas listadas arriba. `service_role` siempre bypasea RLS (esto es nativo en Supabase). El `anon` role NO accede a nada salvo casos específicos (portal público de propiedades, ver §3.x).

### 3.1 `agencies`

```sql
ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can read their agencies"
  ON agencies FOR SELECT TO authenticated
  USING (app.is_agency_member(id));

CREATE POLICY "owners and admins can update their agency"
  ON agencies FOR UPDATE TO authenticated
  USING (app.agency_role(id) IN ('owner', 'admin'))
  WITH CHECK (app.agency_role(id) IN ('owner', 'admin'));

-- No DELETE policy: solo service_role puede borrar agencias (vía edge function de billing).
-- No INSERT policy desde authenticated: la creación de agencia va por edge function al onboarding.
```

### 3.2 `profiles`

```sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read their own profile"
  ON profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "users read profiles of their agency members"
  ON profiles FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM agency_members m1
      JOIN agency_members m2 ON m1.agency_id = m2.agency_id
      WHERE m1.user_id = auth.uid()
        AND m2.user_id = profiles.id
        AND m1.is_active AND m2.is_active
    )
  );

CREATE POLICY "users update their own profile"
  ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- INSERT lo hace un trigger en auth.users con security definer; no exponemos a authenticated.
```

### 3.3 `agency_members`

```sql
ALTER TABLE agency_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read members of their agencies"
  ON agency_members FOR SELECT TO authenticated
  USING (app.is_agency_member(agency_id));

CREATE POLICY "owners and admins manage members"
  ON agency_members FOR INSERT TO authenticated
  WITH CHECK (app.agency_role(agency_id) IN ('owner', 'admin'));

CREATE POLICY "owners and admins update members"
  ON agency_members FOR UPDATE TO authenticated
  USING (app.agency_role(agency_id) IN ('owner', 'admin'))
  WITH CHECK (app.agency_role(agency_id) IN ('owner', 'admin'));

CREATE POLICY "owners and admins remove members"
  ON agency_members FOR DELETE TO authenticated
  USING (app.agency_role(agency_id) IN ('owner', 'admin') AND user_id <> auth.uid());
-- nadie se borra a sí mismo del equipo desde el CRM
```

### 3.4 Patrón general para tablas de negocio (leads, properties, conversations, messages, tasks, documents, events, tags, lead_tags, lead_property_interest, quick_replies, whatsapp_numbers, whatsapp_templates)

**Plantilla** — sustituir `<table>`:

```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read <table>"
  ON <table> FOR SELECT TO authenticated
  USING (app.is_agency_member(agency_id));

CREATE POLICY "members insert <table>"
  ON <table> FOR INSERT TO authenticated
  WITH CHECK (app.is_agency_member(agency_id));

CREATE POLICY "members update <table>"
  ON <table> FOR UPDATE TO authenticated
  USING (app.is_agency_member(agency_id))
  WITH CHECK (app.is_agency_member(agency_id));

CREATE POLICY "members delete <table>"
  ON <table> FOR DELETE TO authenticated
  USING (app.is_agency_member(agency_id));
```

#### Excepciones por tabla

**`messages`** — sin DELETE (los mensajes son inmutables, soft-delete vía `conversations.archived_at`):

```sql
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read messages" ON messages FOR SELECT TO authenticated
  USING (app.is_agency_member(agency_id));

CREATE POLICY "members insert messages" ON messages FOR INSERT TO authenticated
  WITH CHECK (
    app.is_agency_member(agency_id)
    AND (sender_user_id IS NULL OR sender_user_id = auth.uid())
  );

-- UPDATE solo de columnas status; mejor manejado vía RPC. Por ahora bloqueamos UPDATE/DELETE desde authenticated.
-- N8N (service_role) y edge functions actualizan delivered_at/read_at.
```

**`whatsapp_numbers`** — solo `owner`/`admin` pueden ver la API key:

```sql
ALTER TABLE whatsapp_numbers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read whatsapp_numbers"
  ON whatsapp_numbers FOR SELECT TO authenticated
  USING (app.is_agency_member(agency_id));
-- Nota: la columna `ycloud_api_key_encrypted` se enmascara en una vista pública vw_whatsapp_numbers
-- que el CRM consume en lugar de la tabla cruda.

CREATE POLICY "owners and admins manage whatsapp_numbers"
  ON whatsapp_numbers FOR INSERT TO authenticated
  WITH CHECK (app.agency_role(agency_id) IN ('owner', 'admin'));

CREATE POLICY "owners and admins update whatsapp_numbers"
  ON whatsapp_numbers FOR UPDATE TO authenticated
  USING (app.agency_role(agency_id) IN ('owner', 'admin'))
  WITH CHECK (app.agency_role(agency_id) IN ('owner', 'admin'));

CREATE POLICY "owners and admins delete whatsapp_numbers"
  ON whatsapp_numbers FOR DELETE TO authenticated
  USING (app.agency_role(agency_id) IN ('owner', 'admin'));
```

**`activity_log`** — append-only, sin UPDATE ni DELETE desde authenticated:

```sql
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read activity_log"
  ON activity_log FOR SELECT TO authenticated
  USING (app.is_agency_member(agency_id));

CREATE POLICY "members insert activity_log"
  ON activity_log FOR INSERT TO authenticated
  WITH CHECK (app.is_agency_member(agency_id));

-- No UPDATE, no DELETE policies. Tabla append-only.
```

### 3.5 Portal público de propiedades (anon role)

Para que `casa-vargas.casacrm.app/p/cr-2031` muestre la propiedad sin login:

```sql
CREATE POLICY "anon can read published properties"
  ON properties FOR SELECT TO anon
  USING (status = 'disponible' AND archived_at IS NULL AND published_at IS NOT NULL);
```

Vista expuesta a `anon` (subset de columnas, sin `address_line` literal):

```sql
CREATE VIEW public.vw_public_properties AS
SELECT id, agency_id, code, slug, title, type, operation, price, currency,
       bedrooms, bathrooms, area_built_m2, area_lot_m2, parking_spaces,
       province, canton, district, neighborhood, location_text,
       description, features, images, published_at
FROM properties
WHERE status = 'disponible' AND archived_at IS NULL AND published_at IS NOT NULL;

GRANT SELECT ON public.vw_public_properties TO anon;
```

---

## 4. Cómo encaja N8N

### 4.1 Permisos y modus operandi

- N8N usa `SUPABASE_SERVICE_ROLE_KEY` para conectar al cliente Postgres/PostgREST.
- `service_role` bypasea RLS por completo. No hay restricción por agencia.
- **Por eso N8N tiene la responsabilidad absoluta de incluir `agency_id` correcto en CADA insert/update.** Un bug acá = leak entre tenants.

### 4.2 Resolución del tenant desde el webhook YCloud

Flujo cuando entra un mensaje del lead:

```
1. YCloud llama webhook → POST https://<edge-function>/ycloud-webhook
   Body incluye: { phone_number_id, from: <lead_wa_id>, message: {...} }

2. Edge Function (Deno):
   a) Valida firma del webhook (HMAC con YCLOUD_WEBHOOK_SECRET).
   b) Resuelve agency_id:
        SELECT agency_id FROM whatsapp_numbers WHERE phone_number_id = $1 LIMIT 1;
      Si no existe, descarta el evento (loggea).
   c) Inserta/dedup el lead:
        INSERT INTO leads (agency_id, whatsapp_id, full_name, phone_e164, source)
        VALUES (...) ON CONFLICT (agency_id, whatsapp_id) DO UPDATE SET last_inbound_at = now();
   d) Inserta/dedup la conversation:
        INSERT INTO conversations (agency_id, lead_id, whatsapp_number_id, ...)
        ON CONFLICT (lead_id, channel) DO UPDATE SET last_message_at = now();
   e) Inserta el message.
   f) Si la conversation.handler = 'bot' AND conversation.bot_paused_until < now() (o NULL),
      dispara N8N con webhook hacia N8N pasando { agency_id, conversation_id, message_id, lead_id }.

3. N8N workflow:
   a) Recibe el contexto. agency_id viene EXPLÍCITO.
   b) Lee historial: SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 30;
   c) Lee el bot_persona_prompt y settings de la agencia.
   d) Llama a Claude con el prompt + historial.
   e) Si Claude pide "handoff", marca conversation.handler = 'human' + activity_log.
   f) Inserta el message del bot (sender_kind='bot', direction='outbound', status='queued').
   g) Llama a YCloud API con la ycloud_api_key (descifrada) del agency.
   h) Actualiza status='sent' + ycloud_message_id devuelto.

4. YCloud webhook de status → edge function actualiza delivered_at / read_at / failed.
```

**Aspecto crítico:** el `agency_id` SIEMPRE viaja en el contexto del workflow. Nunca se infiere por convención. Cualquier nodo que escriba a Supabase debe leer `agency_id` del input del workflow, no constantes.

### 4.3 ¿Edge function o N8N como webhook directo?

Recomendación: **edge function al frente, N8N detrás**. Razones:

- Edge function valida firma HMAC, dedup y normaliza data — es trabajo barato y N8N no es bueno haciendo crypto.
- N8N se concentra en la lógica de conversación, no en plumbing.
- Si N8N cae, los mensajes igual se ingestan (la conversación no responde, pero no se pierde data — el agente ve el mensaje del lead).

### 4.4 ¿Bot único parametrizado o uno por tenant?

**Decisión recomendada: un solo workflow N8N parametrizado por `agency_id` en input.** Razones:
- Un solo lugar para fixear bugs.
- El `bot_persona_prompt` y `settings` de la agencia ya parametrizan tono y comportamiento.
- A 50 tenants, mantener 50 workflows es inviable.

Excepción futura: tenants enterprise (>$1k/mes) podrían tener su workflow custom. No es problema hoy.

---

## 5. Realtime

### 5.1 Tablas con Realtime activo

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE leads;
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
```

Sólo estas. `properties`, `documents`, `events` NO requieren push instantáneo — refrescar al navegar a la página es suficiente. Activar Realtime tiene costo (conexiones, ancho de banda).

### 5.2 Filtrado por agencia

Supabase Realtime aplica RLS sobre el role que conecta. El cliente del CRM se conecta con el JWT del usuario autenticado → role `authenticated` → las policies de SELECT filtran automáticamente por `app.is_agency_member(agency_id)`.

**El cliente NO necesita filtrar por `agency_id` explícitamente** — pero por performance/ancho de banda, sí debería suscribirse con filtros específicos:

```ts
supabase
  .channel(`agency:${agencyId}:messages`)
  .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages',
        filter: `agency_id=eq.${agencyId}` },
      handler)
  .subscribe();
```

El filter cliente-side es defensa-en-profundidad, no seguridad — la seguridad la da RLS.

### 5.3 Consideraciones

- **Realtime sobre `messages`** es lo que mata el polling — un mensaje nuevo aparece en el inbox sin refresh.
- **Realtime sobre `conversations`** actualiza el contador de no-leídos en el listing del inbox.
- **Realtime sobre `leads`** refresca cambios de status hechos desde otro tab o por el bot.
- **Realtime sobre `tasks`** muestra tasks generadas por el bot apareciendo en el dashboard del agente.

---

## 6. Storage

### 6.1 Buckets

| Bucket | Público | Uso |
|---|---|---|
| `property-images` | sí (read) | Fotos de propiedades. URLs públicas para portal y para mandar a leads vía WA. |
| `documents` | no | Cédulas, contratos, cartas de pre-aprobación. Acceso vía signed URL. |
| `agency-assets` | sí (read) | Logo y branding de la agencia. |
| `wa-media` | no | Media recibida por WhatsApp (fotos/audio que mandan los leads). Acceso vía signed URL desde el inbox. |

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('property-images', 'property-images', true),
  ('documents',       'documents',       false),
  ('agency-assets',   'agency-assets',   true),
  ('wa-media',        'wa-media',        false);
```

### 6.2 Estructura de paths

**Convención obligatoria:** todo objeto vive bajo `<agency_id>/...`. Esto permite policies basadas en path y borrado masivo por agency.

```
property-images/<agency_id>/<property_id>/<uuid>.jpg
documents/<agency_id>/leads/<lead_id>/<uuid>-<filename>
documents/<agency_id>/properties/<property_id>/<uuid>-<filename>
agency-assets/<agency_id>/logo.png
wa-media/<agency_id>/<conversation_id>/<message_id>/<uuid>.<ext>
```

### 6.3 Storage policies

Patrón (sustituir `<bucket>`):

```sql
-- SELECT: miembros pueden leer objetos de su agencia
CREATE POLICY "members read <bucket>" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = '<bucket>'
    AND app.is_agency_member((storage.foldername(name))[1]::uuid)
  );

-- INSERT
CREATE POLICY "members upload to <bucket>" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = '<bucket>'
    AND app.is_agency_member((storage.foldername(name))[1]::uuid)
  );

-- UPDATE / DELETE análogo.
```

Para `property-images` y `agency-assets` (públicos), permitimos `anon SELECT` sin chequeo de agencia — están publicados.

`wa-media` y `documents` requieren signed URLs generadas server-side (edge function o server action) con expiración corta (5-15 min).

### 6.4 Secrets at-rest

`whatsapp_numbers.ycloud_api_key_encrypted` no se almacena en plaintext. Opciones:

1. **Supabase Vault** (extension `supabase_vault`): la solución nativa, columnas encriptadas con KMS.
2. **Cifrado app-side** con `pgsodium` y master key en env de edge functions.

Recomendación: **Vault** si está disponible en el plan elegido; si no, `pgsodium` con `SECRET_ENCRYPTION_KEY` en edge function env.

El CRM **nunca** ve la API key en plaintext — solo la edge function que llama a YCloud la descifra.

---

## 7. Plan de migración

### 7.1 Estructura `supabase/migrations/`

Cada archivo SQL es idempotente donde posible y dependiente del anterior:

| Archivo | Contenido | Depende de |
|---|---|---|
| `0001_extensions.sql` | `CREATE EXTENSION` para `pgcrypto`, opcional `postgis`, `pg_trgm` (búsqueda en leads). | — |
| `0002_schemas_and_enums.sql` | Schema `app` (helpers), todos los `CREATE TYPE` enum. | 0001 |
| `0003_tables_core.sql` | `agencies`, `profiles`, `agency_members`. | 0002 |
| `0004_tables_whatsapp.sql` | `whatsapp_numbers`, `whatsapp_templates`. | 0003 |
| `0005_tables_crm.sql` | `properties`, `leads`, `tags`, `lead_tags`, `lead_property_interest`. | 0003 |
| `0006_tables_messaging.sql` | `conversations`, `messages`, `quick_replies`. | 0004, 0005 |
| `0007_tables_ops.sql` | `tasks`, `documents`, `events`. | 0005, 0006 |
| `0008_tables_audit.sql` | `activity_log`. | 0003 |
| `0009_functions_and_triggers.sql` | `app.is_agency_member`, `app.agency_role`, `app.set_updated_at`, `app.calc_lead_score`. Triggers para updated_at, denormalizaciones (lead_count, unread_count, last_message_*), trigger de auto-creación de profile post auth.users INSERT. | Todas las anteriores. |
| `0010_rls_core.sql` | RLS de `agencies`, `profiles`, `agency_members`. | 0009 |
| `0011_rls_business.sql` | RLS de todas las tablas de negocio. | 0010 |
| `0012_realtime_publications.sql` | `ALTER PUBLICATION supabase_realtime ADD TABLE ...`. | 0011 |
| `0013_storage_buckets.sql` | Buckets + policies. | 0010 |
| `0014_views.sql` | `vw_public_properties`, `vw_whatsapp_numbers` (sin api key). | 0011 |
| `0015_seed_dev.sql` | **NO se aplica en prod.** Inserta una agencia demo + miembros + datos. Solo para dev local. Marcar con guard `WHERE current_setting('app.env', true) = 'dev'`. | 0014 |

### 7.2 Comandos de la CLI

```bash
# Desarrollo local
supabase start
supabase migration new <descripcion>          # crea archivo numerado
supabase db reset                              # re-aplica todas las migraciones desde cero (local)
supabase db diff -f <nombre>                   # auto-genera SQL a partir de cambios en la DB local

# Generar tipos TypeScript
supabase gen types typescript --local > crm/src/types/database.ts
# o contra remoto:
supabase gen types typescript --project-id <proj_id> --schema public > crm/src/types/database.ts

# Aplicar a remoto
supabase db push                               # aplica migraciones pendientes al proyecto remoto
```

### 7.3 Branching de Supabase

Activar la feature de **Branching** del plan Pro. Flujo:
- `main` branch: producción.
- `dev` branch: desarrollo. Cada PR crea un preview branch.
- Las migraciones se prueban en preview/dev antes de merge a main.

### 7.4 Tests críticos pre-deploy

Antes de cada push a main, validar (idealmente con un script):
1. **Cross-tenant leak:** crear 2 agencias con usuarios separados, intentar SELECT/UPDATE/DELETE de la otra. Debe fallar.
2. **service_role bypass:** confirmar que la key de N8N sí ve todo.
3. **Trigger updated_at:** modificar fila, verificar que cambia.
4. **Denormalizaciones:** insertar mensaje, verificar que `conversations.last_message_at` y `unread_count` se actualizan.

---

## 8. Open questions para Hans

> Estas son decisiones que NO puedo tomar yo y necesito que respondas antes de implementar las migraciones.

### Críticas (bloquean la migración 0003+)

1. **¿Multi-agencia por usuario en v1 o v2?**
   Mi recomendación: v2. Diseño la tabla `agency_members` lista para soportarlo, pero el código asume 1 agencia "actual" por usuario hasta que decidas escalarlo.
   **Decisión necesaria:** ¿OK con v2?

2. **¿WhatsApp templates: globales (curados por Momentum) o por agencia?**
   Mi recomendación: **por agencia, con un seed inicial de templates globales que se copian al onboarding**. Eso permite que el agente edite los suyos sin afectar a otros. Pero cada template aprobado por Meta toma 24-48h, lo cual puede ser fricción al onboarding.
   Alternativa: tabla `wa_template_globals` curada por Momentum, y `whatsapp_templates` referencia un template global pero permite override por agencia.
   **Decisión necesaria:** ¿gestión por agencia o catálogo central?

3. **¿La tabla `messages` guarda TODOS los mensajes (incluyendo system/internal) o solo los enviados/recibidos?**
   Mi recomendación: **todos**, con `sender_kind='system'` para eventos como handoff. Hace el timeline más legible y son baratos.
   **Decisión necesaria:** ¿confirmas?

4. **¿Una sola `conversation` por (lead, canal) para toda la vida, o una nueva por cada ventana de 24h de WhatsApp?**
   Mi recomendación: **una sola por (lead, canal)**. Más simple, mejor para CRM. Las "sesiones" de WA se ven en la timeline por gaps temporales.
   **Decisión necesaria:** ¿confirmas, o querés un campo `session_id` extra?

5. **¿Soft delete vs hard delete?**
   Mi recomendación: soft delete (`archived_at`) en `leads`, `properties`, `conversations`, `documents`, `agencies`. Hard delete solo en `lead_tags`, `lead_property_interest`, `quick_replies`.
   **Decisión necesaria:** ¿OK? ¿Hay alguna entidad donde NECESITES hard delete por GDPR-like (en CR no aplica directo pero…)?

### Importantes (afectan policies/edge functions, no bloquean la primera migración)

6. **¿Quién paga la API key de YCloud — Momentum o el cliente?**
   - Si Momentum la paga y resell-ea: una sola API key, multiplexada por `phone_number_id` por agency. Más simple, más control de costo.
   - Si el cliente la paga directo a YCloud: cada agency tiene su key encriptada en `whatsapp_numbers`.
   Yo asumí el segundo escenario porque es lo que dice `memory/integraciones.md`. **Confirmar.**

7. **¿Lead scoring: cliente-side (cada vista lo recalcula) o server-side (columna `score` actualizada por trigger)?**
   Mi recomendación: server-side, columna `score` + función `app.calc_lead_score()` triggereada por cambios en `leads`, `lead_tags`, `messages` (last_contact_at). Permite filtrar y ordenar por score en queries.
   **Decisión necesaria:** ¿OK con la complejidad de mantener triggers, o preferís recalcular en cliente?

8. **¿Hace falta `pg_trgm` para búsqueda fuzzy en leads y propiedades?**
   El UI tiene search global. Sin `pg_trgm` la búsqueda es `LIKE %x%` (lenta a escala). Con `pg_trgm` + GIN index, búsqueda fuzzy rápida.
   **Decisión:** activarla cuesta 0 — yo digo sí. Confirmar.

9. **¿`agencies.bot_persona_prompt` lo edita el agente o solo Momentum?**
   Si solo Momentum, podemos esconderlo en UI. Si el agente, necesita una pantalla de "personalizar bot" — Fase 2 o futuro.
   **Decisión necesaria:** ¿qué quiere ver el agente en v1?

10. **Geolocalización: ¿activamos PostGIS o dejamos lat/long como `numeric`?**
    PostGIS habilita "propiedades cerca de mí" en el portal público. Sobrecarga moderada.
    **Decisión necesaria:** ¿sí o no para v2?

---

## Apéndice A — Resumen del flujo end-to-end de un mensaje entrante

```
[Lead manda WA]
   ↓
[YCloud webhook → edge function /ycloud-webhook]
   ↓ valida HMAC
   ↓ SELECT agency_id FROM whatsapp_numbers WHERE phone_number_id = $1
   ↓ UPSERT leads(agency_id, whatsapp_id, ...)
   ↓ UPSERT conversations(agency_id, lead_id, whatsapp_number_id, ...)
   ↓ INSERT messages(...)
   ↓
[Supabase Realtime] → inbox del CRM muestra el mensaje sin refresh
   ↓
[Edge function dispara N8N webhook con {agency_id, conversation_id, message_id}]
   ↓
[N8N workflow]
   ↓ lee historial + agency.bot_persona_prompt
   ↓ llama Claude
   ↓ INSERT messages(status='queued', sender_kind='bot', is_bot_generated=true)
   ↓ descifra ycloud_api_key
   ↓ llama YCloud API send
   ↓ UPDATE messages SET status='sent', ycloud_message_id=...
   ↓ si Claude pidió handoff → UPDATE conversations.handler='human' + activity_log
   ↓
[Supabase Realtime] → mensaje del bot aparece en inbox + notif al agente si hubo handoff
```

---

## Apéndice B — Checklist de seguridad pre-launch

- [ ] RLS habilitado en TODAS las tablas (verificar con `SELECT relname FROM pg_class WHERE relkind='r' AND NOT relrowsecurity;`).
- [ ] Tests automatizados de cross-tenant leak ejecutados.
- [ ] `service_role` key NO está en el bundle del frontend (solo en edge functions y N8N).
- [ ] Vault o `pgsodium` activo para `ycloud_api_key_encrypted`.
- [ ] `webhook_secret` de YCloud validado en cada llamada.
- [ ] Signed URLs de Storage con expiración ≤15 min.
- [ ] Triggers de `set_updated_at` aplicados.
- [ ] `activity_log` recibiendo inserts desde rutas críticas (cambio de estado de lead, envío de mensaje, login).
- [ ] Backup automático activado (plan Pro lo trae).
- [ ] Branching activado: `dev` y `main` separados.
- [ ] Tipos TS regenerados después de cada migración aplicada.

---

*Fin del documento. Total estimado: ~1100 líneas.*
