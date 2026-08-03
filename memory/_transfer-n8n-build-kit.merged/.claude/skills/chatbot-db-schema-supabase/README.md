# Chatbot DB Schema en Supabase — multi-canal + multi-nicho

Paquete completo para construir la base de datos de **cualquier chatbot conversacional** en Supabase. Destilado desde [Casa CRM](../../../) (sistema inmobiliario en producción mayo 2026) y generalizado.

## Por qué existe esto

El founder de Momentum AI tiene varios clientes con chatbots en distintos nichos (clínicas, restaurantes, e-commerce, soporte). Muchos están en Airtable y fallan a escala. La idea es migrarlos a Supabase con un schema:

1. **Que ya esté probado en producción** (no inventado desde cero)
2. **Multi-canal de fábrica** (WhatsApp, Instagram, Messenger, etc.)
3. **Preparado para integrarse al CRM general futuro** sin re-trabajo

Esta skill es ese schema, documentado y empaquetado.

## Lo que vas a encontrar acá

```
.
├── SKILL.md                          ← entry point para sesiones de Claude Code
├── README.md                          ← este archivo
├── docs/
│   ├── 01-arquitectura.md            ← principios, decisiones, multi-canal
│   ├── 02-schema-explicado.md        ← cada tabla en detalle
│   ├── 03-plug-ins-por-nicho.md      ← qué carga cada plug-in y cuándo
│   ├── 04-onboarding-paso-a-paso.md  ← arrancar chatbot nuevo en 30 min
│   └── 05-migracion-desde-airtable.md ← patrones Airtable → Supabase
└── sql/
    ├── 0001_core.sql                 ← extensions + enums + 8 tablas CORE
    ├── 0002_rls.sql                  ← Row Level Security (preparado, off)
    ├── 0003_triggers_realtime.sql    ← triggers de denorm + Broadcast Changes
    ├── plug-ins/
    │   ├── reservas.sql              ← citas (clínicas, peluquerías, restaurantes)
    │   ├── ecommerce.sql             ← productos + órdenes (tiendas)
    │   ├── soporte.sql               ← tickets + KB (helpdesk)
    │   └── inmobiliaria.sql          ← propiedades (referencia Casa CRM)
    └── seed-demo.sql                 ← data ejemplo para validar
```

## Quickstart (30 minutos)

```bash
# 1. Crear proyecto Supabase nuevo (1 cliente = 1 proyecto en single-tenant)

# 2. Aplicar el CORE (3 archivos)
psql "<connection>" -f sql/0001_core.sql
psql "<connection>" -f sql/0002_rls.sql
psql "<connection>" -f sql/0003_triggers_realtime.sql

# 3. Cargar el plug-in del nicho (UNO de estos)
psql "<connection>" -f sql/plug-ins/reservas.sql
# o ecommerce.sql / soporte.sql / inmobiliaria.sql

# 4. (Opcional) data demo para validar
psql "<connection>" -f sql/seed-demo.sql

# 5. Crear la agency + canal
psql "<connection>" -c "
  insert into agencies (slug, name, country_code, timezone)
  values ('cliente-x', 'Cliente X', 'CR', 'America/Costa_Rica')
  returning id;
"
```

Pasos detallados: ver [docs/04-onboarding-paso-a-paso.md](docs/04-onboarding-paso-a-paso.md).

## Decisiones de diseño clave

### 1. `agency_id` obligatorio desde día 1

Aunque AHORA cada cliente tenga su propio proyecto Supabase (single-tenant), todas las tablas tienen `agency_id`. Cuando migremos al CRM general compartido (multi-tenant), no hay que reestructurar — solo activar RLS y cargar el agency_id correcto.

### 2. Multi-canal first-class

El enum `message_channel` incluye `whatsapp, messenger, instagram, web, sms, email, voice, manual`. Cada conversación y cada mensaje tienen su canal. Agregar Instagram = insertar row en `agency_channels`, no migración de schema.

### 3. CORE + Plug-ins

El CORE (8 tablas) sirve para cualquier chatbot. Lo específico del nicho va en plug-ins separados que se cargan opcionalmente. Un chatbot de reservas no carga `ecommerce.sql`.

### 4. Idempotencia en escritura

`UNIQUE (agency_id, channel, external_id)` en `messages` evita duplicados cuando los BSPs reenvían webhooks (lo hacen siempre).

### 5. Realtime vía Broadcast

`postgres_changes` está deprecado. Usamos triggers que llaman `realtime.send(payload, event, topic, private)`. El frontend se suscribe al topic `conv:<conversation_id>`.

Detalles completos: [docs/01-arquitectura.md](docs/01-arquitectura.md).

## Casos de uso soportados out-of-the-box

| Nicho | Plug-in | Tablas que agrega |
|---|---|---|
| Clínicas, peluquerías, restaurantes (reservas) | `reservas.sql` | services, staff_members, appointments, availability_rules |
| Tiendas online, catálogos | `ecommerce.sql` | products, product_variants, orders, order_items, discount_codes |
| SaaS con helpdesk, atención al cliente | `soporte.sql` | tickets, ticket_comments, ticket_categories, kb_articles |
| Bienes raíces | `inmobiliaria.sql` | properties, property_views, visit_requests |

Si tu nicho no encaja, crear tu propio plug-in siguiendo la plantilla en [docs/03-plug-ins-por-nicho.md](docs/03-plug-ins-por-nicho.md#cómo-agregar-un-plug-in-nuevo).

## Migración desde Airtable

Si el chatbot ya existe en Airtable y vas a migrar a Supabase:

- **Plan rápido (1 día):** rip-and-replace. Export Airtable → process → load Supabase. Aceptable si el chatbot puede parar 1-2 horas.
- **Plan zero-downtime (1 mes):** dual-write. El bot escribe a ambos durante un período, validás, cortás Airtable.

Patrones completos: [docs/05-migracion-desde-airtable.md](docs/05-migracion-desde-airtable.md).

## Lo que NO incluye esta skill

- **Frontend / CRM UI:** queda para el CRM general futuro
- **Workflows N8N:** referencias a otras skills (`n8n-workflow-build-script`, `n8n-langchain-agent-postgres-memory`)
- **Edge functions de webhook por canal:** referencias a skills existentes (`ycloud-webhook-to-supabase`)
- **Lógica del bot conversacional:** referencias a otras skills (`sales-framework-spsp-whatsapp`, `bot-llm-marker-expand-pattern`)

Esta skill es **solo la capa de DB**. El stack completo se arma combinando con las otras skills del proyecto madre.

## Compatibilidad con Casa CRM

El schema acá es un **superset compatible** con el de Casa CRM:

- Las tablas CORE son las mismas (mismo modelo, mismos enums)
- El plug-in `inmobiliaria.sql` es la sección inmobiliaria de Casa CRM extraída
- Una agency_id de Casa CRM puede moverse al sistema general sin transformaciones

Cuando armemos el CRM general, va a poder ingerir data de cualquier chatbot que use este schema sin migración compleja.

## Versionado de este paquete

| Versión | Fecha | Cambios |
|---|---|---|
| 1.0 | 2026-05-21 | Versión inicial. CORE + 4 plug-ins + docs + onboarding + migración Airtable. Destilado desde Casa CRM en producción. |

## Créditos

- **Diseño y código:** Hans Villalobos (Momentum AI) + Claude Code (sesiones intensivas mayo 2026)
- **Base operativa:** Casa CRM, sistema inmobiliario multi-tenant en producción 2026-05
- **Lecciones aprendidas:** ver memorias `feedback_*` del founder
