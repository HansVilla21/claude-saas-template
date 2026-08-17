# Momentum AI CRM — Schema DB (Spec)

**Fecha:** 2026-05-27
**Estado:** Draft — pendiente review del founder antes de detallar columnas
**Base de partida:** Skill `.agent/skills/chatbot-db-schema-supabase/` (capturada hoy) + tablas existentes en el CRM v1 inmobiliario (que pasa a ser "primer caso de uso" del producto general).
**Objetivo:** schema multi-tenant + multi-canal + modular desde día 1, listo para escalar a N clientes con N módulos.

---

## Principios de diseño no negociables

1. **`agency_id` obligatorio en toda tabla tenant-scoped** desde día 1. Cuando crezca a multi-tenant compartido, solo activamos RLS — no reestructurar.
2. **Multi-canal first-class.** Enum `message_channel` (whatsapp, messenger, instagram, web, sms, email, voice, manual). Agregar canal = insertar row en `agency_channels`, no migración de schema.
3. **CORE + módulos opcionales.** El CORE sirve para cualquier nicho. Los módulos (propiedades, servicios, agenda, etc.) se acoplan vía contract estándar.
4. **Idempotencia por `external_id`.** UNIQUE en mensajes/eventos. Los BSPs reenvían webhooks — no podemos duplicar.
5. **Realtime vía Broadcast Changes** (no `postgres_changes` deprecado). Triggers que llaman `realtime.send()`.
6. **RLS prendido desde día 1** (deuda crítica de v1 que NO repetimos). Policies escritas paso a paso a medida que se construyen flujos.
7. **Audit log para acciones sensibles del master.** Quién impersonó a quién, cuándo, qué tocó.
8. **Soft delete** en entidades que pueden recuperarse (leads, propiedades). Hard delete solo para webhook_events_raw + datos efímeros.

---

## Estructura macro: 4 capas

### Capa 1 — Identidad y multi-tenancy

| Tabla | Propósito | Relación |
|---|---|---|
| `users` | **NUEVO.** Todo humano con login (cliente principal o miembro de equipo). Extiende `auth.users` de Supabase Auth (trigger crea row al signup). | 1:N → agencies (como owner), N:M → agencies (via memberships) |
| `agencies` | Un negocio / marca operativa. Es donde viven leads, conversaciones, módulos. `owner_user_id` = cliente principal dueño. | N:1 → users (owner), 1:N → todo |
| `agency_memberships` | **NUEVO (reemplaza `agency_members`).** Relación N:M entre `users` y `agencies` con `role` por membresía. Un user puede pertenecer a N agencies con rol distinto en cada una. | N:1 → users, N:1 → agencies, UNIQUE (user_id, agency_id) |
| `master_accounts` | **NUEVO.** Subset de `users` con acceso transversal a TODAS las agencies. FK a `users`. Jerarquía `role` (super_admin / admin). Solo super_admin crea/elimina otras maestras. Tabla protegida: un cliente nunca tiene acceso de escritura acá. | N:1 → users (FK), cross-agencies |
| `master_audit_log` | **NUEVO.** Log de acciones del master: cuándo impersonó qué agency, qué módulo prendió, qué prompt editó. | N:1 → master_accounts |

### Capa 2 — Canales y comunicación (CORE — no nichado)

| Tabla | Propósito | Notas |
|---|---|---|
| `agency_channels` | Canales conectados de cada agency (WhatsApp, Messenger, Instagram, web). Tokens de cada canal. | UNIQUE (agency_id, channel) |
| `leads` | Contactos que escriben al chatbot. Identificados por (agency_id, external_id, channel). | Soft delete |
| `conversations` | UNA conversación por (agency, lead, canal). Si el lead escribe por WA e IG, son 2 conversations. | Estado: bot / handoff / closed |
| `messages` | Mensajes individuales. Idempotencia via UNIQUE (agency_id, channel, external_id). | Tipos: text / image / audio / video / location / event |
| `webhook_events_raw` | Log paranoid de webhooks entrantes. Retention 30d. | Hard delete via cron |
| `audit_log` | Acciones que importan para compliance/forensia. | Append-only |

### Capa 3 — Sistema de módulos (LA CLAVE de v2)

Soporta **tres niveles de módulo**:

- **Global / standard**: del catálogo público. Cualquier agency puede prenderlos.
- **Fork custom**: variante de un standard con ajustes (campos extra, prompt distinto, UI ajustada). Pertenece a un owner (user) o agency.
- **Custom desde cero**: módulo único diseñado a medida para un cliente. Pertenece a un owner (user) o agency.

Los tres respetan el **mismo module contract** (ver Capa 3.5), por lo que el sistema los acopla idénticamente — no hay código especial para módulos custom.

| Tabla | Propósito | Notas |
|---|---|---|
| `module_definitions` | **NUEVO.** Catálogo de módulos disponibles. Incluye standard, forks y customs. Cada uno con: scope (global/owner/agency), parent_module_id (si es fork), version, prompt_fragment_default, tool_config_default, extractor_schema_default, ui_slot_default, sql_plugin_path (opcional). | Tabla unificada para los 3 tipos |
| `module_packages` | **NUEVO.** Paquetes preconfigurados ("Pack Inmobiliaria" = propiedades + agenda + tareas). Atajos para activar varios módulos a la vez. Pueden ser globales o privados (custom packs por owner). | Many-to-many con module_definitions |
| `agency_modules` | **NUEVO.** Qué módulos tiene prendidos cada agency. Permite override del prompt_fragment, tool_config, extractor_schema por agency (decisión "híbrido"). | UNIQUE (agency_id, module_id), config jsonb |
| `bot_prompt_versions` | **NUEVO.** Versiones del system prompt del bot por agency (auditable). El prompt final se computa = prompt_base + prompt_fragments de módulos prendidos + overrides. | Append-only, ranking por version |
| `module_audit_log` | **NUEVO.** Histórico de creación/edición/fork de módulos. Quién creó un custom, cuándo, por qué cliente. | Append-only |

### Capa 3.5 — Module Contract (el "shape" que TODO módulo respeta)

Sea standard, fork o custom, todo módulo declara la misma forma:

```yaml
identity:
  slug: "propiedades-custom-cliente-x"   # único en el sistema
  name: "Propiedades (Cliente X)"
  version: "1.0.0"

scope: "agency"  # global | owner | agency
parent_module_id: "<uuid del standard 'propiedades'>"  # null si es from-scratch
owner_user_id: "<uuid>"      # nullable, solo si scope = owner (módulo compartido entre las agencies de ese user)
owner_agency_id: "<uuid>"    # nullable, solo si scope = agency

prompt_fragment: |
  Tenés acceso a la tool `buscar_propiedades` con campos extra...

tools:
  - name: "buscar_propiedades"
    schema: { ... }

extractor_schema:
  - field: "presupuesto"
    type: "number"
    extraction_hint: "presupuesto en dólares"
  - field: "campo_custom_cliente_x"
    type: "string"

ui_slots:
  - slot: "left_sidebar"
    component: "PropertiesList"
    config: { columns: [...] }
  - slot: "main_panel_tab"
    label: "Propiedades"
    component: "PropertiesGrid"

sql_plugin_path: "modules/propiedades-custom-cliente-x/0001_init.sql"  # opcional

config_schema:  # qué del módulo es editable por agency desde panel master
  - key: "default_currency"
    type: "string"
    options: ["USD", "CRC"]
```

**Importante:** los módulos custom (fork o from-scratch) son `module_definitions` rows iguales a los standard — solo cambia `scope`, `parent_module_id`, `owner_*`. El sistema los lee con la misma query.

### Capa 3.6 — Cómo se crea un módulo custom

Tres caminos según complejidad:

| Caso | Cómo se crea | Quién | Riesgo sistema |
|---|---|---|---|
| **Solo ajustes de config** (campos visibles, prompt fragment, etc. del estándar) | Override en `agency_modules.config` desde panel master. Sin código. | Master en UI | Cero — es solo data |
| **Fork con campos extra / lógica ligera** (ej: agregar 3 campos a Propiedades) | Master forkea desde panel → crea row nueva en `module_definitions` con `parent_module_id` + override del extractor_schema y prompt_fragment. Sin código. | Master en UI | Bajo — los campos extra van a `custom_field_values` |
| **Custom desde cero con tablas nuevas** (ej: módulo "Inventario veterinario" único) | Dev crea carpeta `modules/<slug>/` con SQL plug-in + tool handler + UI components. Migration aplicada al Supabase. Registro en `module_definitions`. | Dev (vos + yo) con deploy | Mitigado por sandbox: el módulo custom NO puede tocar tablas CORE |

**Sandbox / safety:**

- Los plug-in SQL de módulos custom solo pueden crear tablas con prefijo `mod_<slug>_*` para evitar colisiones.
- RLS forzado: ninguna tabla de módulo puede ser leída/escrita sin pasar por `agency_id` matching.
- Si el módulo custom falla en runtime (error en tool, prompt mal formado), el bot omite ese módulo y sigue funcionando con los demás — no cae la agency.
- Versionado: cada update a un módulo custom es una nueva `version` (semver). Si v2 rompe algo, rollback a v1 con un UPDATE.

### Capa 4 — Extracción de información (modular también)

| Tabla | Propósito | Notas |
|---|---|---|
| `extractor_field_defs` | **NUEVO.** Definiciones de campos a extraer del chat. Pueden ser genéricos (nombre, contacto, intent) o de un módulo (presupuesto inmobiliario, fecha cita fisio). | scope: 'core' / module_id |
| `extractor_field_values` | **NUEVO.** Valores extraídos por lead. Updated por el bot/N8N en cada turn de conversación. | N:1 → leads, N:1 → extractor_field_defs |
| `tags` + `tag_assignments` | Tags manuales/automáticos sobre leads. | Heredado de v1 |
| `custom_field_defs` + `custom_field_values` | Custom fields adicionales por agency. | Heredado de v1, ortogonal a extractor_field_defs |
| `tasks` | TODOs sobre leads. origin: auto / manual. | Heredado de v1 |

### Capa 5 — Soporte operativo (infraestructura)

| Tabla | Propósito | Notas |
|---|---|---|
| `n8n_chat_histories` | Memoria conversacional del bot (LangChain Postgres Chat Memory). | Heredado de v1, mismo schema |
| `documents` | Documentos cargados por agency (PDFs, manuales, catálogos) para RAG futuro. | Embeddings vía pgvector |

### Capa 6 — Billing (placeholder, no se construye ahora pero el schema queda preparado)

| Tabla | Propósito | Status |
|---|---|---|
| `subscriptions` | Suscripción de billing. **Decisión pendiente:** por agency (cada negocio su plan según módulos) o por owner (un plan cubre todas sus agencies). Lo más natural por lo conversado: por agency. | Placeholder, se completa cuando se defina pricing |
| `payments` | Histórico de pagos (Onvo, Stripe). | Placeholder |
| `invoices` | Facturación electrónica. | Placeholder, módulo futuro |

---

## Plug-ins por nicho (módulos atómicos — se cargan según cliente)

Cada plug-in es un archivo SQL separado que se aplica solo cuando esa agency tiene el módulo prendido. Cada uno trae:

- Tablas de datos del módulo (ej: `properties` para inmobiliaria)
- Función / view auxiliar si aplica
- Seed para `module_definitions` (registro del módulo en el catálogo)
- Prompt fragment + tool config + extractor schema

| Plug-in | Tablas que agrega | Nicho típico |
|---|---|---|
| `propiedades.sql` | properties, property_views, visit_requests | Inmobiliaria |
| `servicios.sql` | services, staff_members, appointments, availability_rules | Fisio, peluquería, restaurante |
| `ecommerce.sql` | products, product_variants, orders, order_items, discount_codes | Tiendas online |
| `soporte.sql` | tickets, ticket_comments, ticket_categories, kb_articles | Helpdesk |
| `agenda.sql` | calendar_events, calendar_integrations | Cualquier nicho con citas |
| `tareas.sql` | (extiende tasks de CORE) | Cualquiera con followup |

**Importante:** la skill `chatbot-db-schema-supabase` ya tiene 4 de estos plug-ins listos (reservas, ecommerce, soporte, inmobiliaria). Vamos a reusar esas migrations + adaptarlas al contract de módulos v2 (registro en `module_definitions`).

---

## Decisiones de diseño específicas del v2

### 1. Users vs Agencies vs Memberships vs Master Accounts

Modelo de identidad (corregido 2026-05-27 tras input del founder):

- **User** = cualquier humano con login. Puede ser cliente principal o miembro de equipo. Extiende `auth.users` de Supabase Auth. UNA fila por persona.
- **Agency** = un negocio operativo. Tiene `owner_user_id` (el cliente principal dueño). Donde viven leads, módulos, config.
- **Agency Membership** = relación N:M entre user y agency, **con `role` por membresía**. Acá vive el modelo multi-usuario:
  - Un **cliente principal** es `owner` de N agencies (sus negocios A, B, ... N).
  - Un **miembro de equipo** tiene membership en una o varias agencies del cliente, con rol distinto en cada una. Mismo login, varios negocios.
  - El cliente principal **administra las memberships y roles** de su equipo desde la plataforma (gestión de su propio equipo, scoped a sus agencies).
- **Master Account** = vos, Pietro, futuros admins. **Es un `user` con fila en `master_accounts`** (tabla protegida). Acceso transversal a TODAS las agencies sin ser owner ni member. Ortogonal al modelo cliente/equipo.

Ejemplo concreto:

```
user: Roberto (cliente principal)
  ├── owner de agency A ("Roberto Inmobiliaria")  → módulo propiedades
  └── owner de agency B ("Roberto Fisio")          → módulo servicios

user: Jessica (asistente de Roberto)
  ├── membership en agency A, role=agent   (puede chatear, ver leads)
  └── membership en agency B, role=viewer  (solo lectura)
  → un solo login, acceso a A y B con permisos distintos

user: Hans (master)
  └── fila en master_accounts, role=super_admin
  → ve y modifica TODAS las agencies del sistema
```

**Decisión de seguridad: master_accounts es tabla separada, NO un campo en users.** Razón: separar identidad (quién sos) de privilegio elevado (sos master). Si "ser master" fuera un campo en la fila del user, un exploit de escritura sobre la propia fila permitiría escalar a master. Con tabla separada protegida por RLS (solo super_admin escribe), un cliente nunca puede auto-promoverse. Defensa en profundidad.

### 1.5. Roles (enum, infraestructura desde día 1, enforcement gradual)

- **`agency_role`** (en `agency_memberships`): `owner` / `admin` / `agent` / `viewer`.
  - **Por ahora la app trata a todos igual** (todos los members ven todo de su agency). El campo existe y se puebla, pero el enforcement de permisos por rol se activa después.
- **`master_role`** (en `master_accounts`): `super_admin` / `admin` / `support_readonly` (futuro).

### 2. Jerarquía de Master Accounts

```
super_admin (Hans, único al inicio)
  ↓ puede crear/eliminar
admin (Pietro, futuros admins)
  ↓ puede gestionar
agencies (todas las del sistema)
```

- Solo `super_admin` puede crear/eliminar `master_accounts`.
- Tanto `super_admin` como `admin` pueden impersonar agencies y prender/apagar módulos.
- Roles futuros posibles: `support_readonly` (solo lectura, para soporte sin riesgo).

### 3. Cómo se prende un módulo (el switch de Pietro)

Cuando el master prende "Propiedades" en la cuenta de Roberto Inmobiliario:

1. INSERT en `agency_modules` (agency_id=roberto, module_id=propiedades, enabled=true, config={...defaults del module_definition})
2. Trigger automático: crea nueva row en `bot_prompt_versions` con el prompt actualizado = prompt_base + prompt_fragment_default del módulo Propiedades
3. Trigger automático: registra en `extractor_field_defs` los campos que el módulo Propiedades necesita extraer (presupuesto, zona, etc.)
4. Trigger automático: si las tablas del plug-in (properties, property_views, visit_requests) no existían en este Supabase, las crea (idempotente).
5. UI del cliente: la pestaña "Propiedades" aparece automáticamente (Frontend lee `agency_modules` para decidir qué slots renderizar).
6. Log en `master_audit_log`: "Hans prendió módulo propiedades en agency roberto-inmobiliario at 2026-05-28 14:23".

**Todo en una sola transacción atómica.** El master toca un switch, el sistema hace la cascada completa.

### 4. Cómo se computa el system prompt final del bot

```
prompt_final = (
  prompt_base de la agency (configurable, "Sos Sofia asistente de [agency.name]...")
  + " " + concatenación de prompt_fragments de todos los módulos prendidos de la agency
  + " " + override custom del admin si existe en agency_modules.config.prompt_override
  + " " + reglas operativas hardcoded del sistema (handoff, marker pattern, etc.)
)
```

El bot v6 lee este prompt cada vez que va a responder. Cache de 5 min para evitar reads constantes.

### 5. Extracción modular acumulativa

Si una agency tiene Propiedades + Agenda prendidos, el extractor corre sobre la conversación buscando:
- Campos del CORE: nombre, contacto, intent general
- Campos de Propiedades: presupuesto, zona, compra/alquiler, tipo, m²
- Campos de Agenda: fecha deseada, hora, duración estimada

Cada campo extraído va a `extractor_field_values` con FK al `field_def` que lo originó. Permite saber de qué módulo viene cada dato.

---

## Lo que se hereda LITERAL de v1 (sin cambios)

- Estructura de `n8n_chat_histories` (LangChain memory)
- Estructura de `webhook_events_raw`
- Estructura de `agency_channels`
- Trigger de denormalización `last_message_at` en conversations
- Trigger de Broadcast Changes para realtime
- Idempotencia de messages via UNIQUE constraint
- Función helper `extract_phone_e164()` y similares

## Lo que se REESCRIBE de v1

- `agencies` (agregar FK `owner_user_id` a `users`)
- `leads` (agregar índices para multi-canal)
- `conversations` (agregar handler enum más rico: bot / handoff / closed)
- `messages` (ajustar `kind` enum para soportar tipos nuevos como `audio`, `event`)
- Activar RLS en todas las tablas (deuda crítica de v1)

## Lo que es 100% NUEVO

- `users` (extiende `auth.users` de Supabase Auth)
- `agency_memberships` (reemplaza el viejo `agency_members`, ahora N:M con rol)
- `master_accounts` + `master_audit_log`
- `module_definitions` + `module_packages` + `agency_modules` + `module_audit_log`
- `bot_prompt_versions`
- `extractor_field_defs` + `extractor_field_values`

---

## Próximos pasos (cuando el founder confirme esta estructura)

1. **Detallar cada tabla columna por columna** en `02-schema-tables-detail.md`
2. **Especificar los enums** (`module_status`, `master_role`, `extractor_field_type`, etc.)
3. **Especificar triggers** (cascada de activación de módulo, denorm, audit)
4. **Especificar policies RLS** por tabla + rol
5. **Escribir migrations SQL** (`migrations/0001_core_v2.sql`, etc.)
6. **Spec del module contract** (qué archivo / qué shape debe tener un módulo nuevo) → archivo separado
7. **Spec del bot v6** (cómo lee dinámicamente prompt + tools) → archivo separado
8. **Spec del flujo auth + onboarding** (signup → primera agency → primer módulo) → archivo separado

---

## Preguntas resueltas (2026-05-27)

1. **Multi-usuario con roles** ✅ RESUELTO. Modelo `users` + `agency_memberships` con `role` por membresía. Un cliente principal es owner de N agencies. Un miembro de equipo puede tener acceso a varias agencies con rol distinto en cada una (mismo login). El cliente principal administra las memberships/roles de su equipo. Ver decisión 1 arriba.
2. **Módulos por agency** ✅ RESUELTO. Por agency, no por owner. Razón del founder: por owner limitaría a una sola agencia. Si Roberto tiene fisio + tienda, cada agency tiene sus propios módulos.
3. **Roles internos de agency** ✅ RESUELTO. El campo `role` existe en `agency_memberships` desde día 1 (infraestructura lista), pero por ahora la app trata a todos los members igual (todos ven todo). Enforcement de permisos por rol se activa después.

## Decisiones aún pendientes (no bloquean el schema core)

1. **Billing scope:** ¿suscripción por agency o por owner? (Inclinación: por agency.) No bloquea — `subscriptions` es placeholder.
2. **Módulo "agenda": ¿CORE o atómico?** Propuesta mía: subir agenda al CORE (transversal a casi todos los nichos) en vez de módulo atómico, para no duplicar lógica calendar entre plug-ins. Pendiente confirmación del founder.
3. **Creación de forks custom:** ¿100% desde UI del panel master, o algunos cambios siempre requieren deploy? (Inclinación: forks ligeros vía UI, custom con tablas nuevas vía deploy.) Se cierra en el spec del panel master.
