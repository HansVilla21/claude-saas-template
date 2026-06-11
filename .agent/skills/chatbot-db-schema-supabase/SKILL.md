# Skill: Chatbot DB Schema en Supabase (multi-canal + multi-nicho)

## Cuándo usar esta skill

- Estás arrancando un chatbot nuevo (cualquier nicho) y necesitás la estructura de base de datos en Supabase desde cero.
- Migrando un chatbot existente que está en Airtable y querés pasarlo a Supabase.
- Querés que un chatbot quede **listo para integrarse al CRM general futuro** sin re-trabajo de schema.
- Necesitás multi-canal (WhatsApp + Instagram + Messenger) desde el día 1 sin refactorizar después.

## Qué provee esta skill

Un paquete completo de schema + docs + migrations para Supabase, destilado desde Casa CRM (sistema inmobiliario en producción) y generalizado para cualquier chatbot conversacional. Incluye:

- **SQL migrations ejecutables** (CORE + RLS + triggers + 4 plug-ins de nicho)
- **Documentación explicada tabla por tabla, decisión por decisión**
- **Onboarding paso a paso** (target: 30 min de cero a chatbot vivo)
- **Patrones de migración desde Airtable** (incluye plan dual-write zero-downtime)
- **Seed demo** para validar que todo funciona

## Cómo usar esta skill (orden recomendado)

### Si arrancás un chatbot nuevo

1. Leer **[README.md](README.md)** (3 min) — overview general
2. Leer **[docs/01-arquitectura.md](docs/01-arquitectura.md)** (10 min) — entender principios + decisiones
3. Ejecutar **[docs/04-onboarding-paso-a-paso.md](docs/04-onboarding-paso-a-paso.md)** (30 min) — armar tu chatbot
4. Profundizar **[docs/02-schema-explicado.md](docs/02-schema-explicado.md)** según lo necesites
5. Cargar el plug-in adecuado de **[docs/03-plug-ins-por-nicho.md](docs/03-plug-ins-por-nicho.md)**

### Si migrás desde Airtable

1. Leer **[docs/01-arquitectura.md](docs/01-arquitectura.md)** para entender el target
2. Leer **[docs/05-migracion-desde-airtable.md](docs/05-migracion-desde-airtable.md)** para el plan
3. Ejecutar el plan dual-write (1 mes para zero-downtime, 1 día para "rip & replace")

### Si estás documentando para otro proyecto

Pasale esta skill completa: SKILL.md + README.md + docs/ + sql/. El otro proyecto la lee y replica el patrón.

## Estructura de archivos

```
.agent/skills/chatbot-db-schema-supabase/
├── SKILL.md                          ← este archivo (entry point para agents)
├── README.md                          ← overview humano
├── docs/
│   ├── 01-arquitectura.md            ← principios, decisiones, multi-canal
│   ├── 02-schema-explicado.md        ← cada tabla en detalle
│   ├── 03-plug-ins-por-nicho.md      ← qué carga cada plug-in y cuándo
│   ├── 04-onboarding-paso-a-paso.md  ← arrancar chatbot nuevo en 30 min
│   └── 05-migracion-desde-airtable.md ← patrones Airtable → Supabase
└── sql/
    ├── 0001_core.sql                 ← extensions, enums, 8 tablas CORE
    ├── 0002_rls.sql                  ← policies preparadas (off por default)
    ├── 0003_triggers_realtime.sql    ← denorm + handoff + Broadcast Changes
    ├── plug-ins/
    │   ├── reservas.sql              ← citas/reservas (clínicas, peluquerías)
    │   ├── ecommerce.sql             ← productos/órdenes (tiendas)
    │   ├── soporte.sql               ← tickets/KB (helpdesk)
    │   └── inmobiliaria.sql          ← propiedades (referencia Casa CRM)
    └── seed-demo.sql                 ← data ejemplo para validar
```

## Las 5 decisiones de diseño que importan

1. **`agency_id` obligatorio desde día 1** — aunque AHORA cada cliente sea single-tenant. Cuando migremos a multi-tenant compartido, no hay que reestructurar.
2. **Multi-canal first-class** — `message_channel` enum + `agency_channels` table. Agregar Instagram = insertar row, no migrar schema.
3. **CORE genérico + plug-ins** — el CORE sirve para cualquier chatbot. Plug-ins se cargan solo si aplican.
4. **Idempotencia por `external_id`** — los BSPs reenvían webhooks. UNIQUE + ON CONFLICT DO NOTHING evita duplicados.
5. **Realtime vía Broadcast** — no `postgres_changes` (deprecado). Triggers que llaman `realtime.send()`.

Detalles completos en `docs/01-arquitectura.md`.

## Output esperado al ejecutar la skill

Cuando alguien aplique esta skill a un proyecto Supabase nuevo, debería terminar con:

- 8 tablas CORE creadas + 1-2 plug-ins según nicho
- 1 row en `agencies` (el cliente)
- 1+ rows en `agency_channels` (los canales conectados)
- Triggers funcionando (denorm + Broadcast Changes)
- RLS preparado pero off (activable más tarde)
- Edge function de webhook entrante apuntando a YCloud/Meta/Twilio
- N8N workflow conectado leyendo/escribiendo Supabase
- Test end-to-end OK: WhatsApp llega → lead+conversation+message en DB

## Skills relacionadas (en el madre o en Casa CRM)

Esta skill cubre solo la capa de DB. Para el sistema completo:

- **`ycloud-webhook-to-supabase`** — edge function que recibe webhooks WhatsApp y los persiste
- **`supabase-realtime-broadcast-pattern`** — cómo el frontend recibe updates en tiempo real
- **`supabase-edge-function-secret-auth`** — auth para endpoints internos (Bearer secret)
- **`bot-handoff-system-end-to-end`** — sistema completo de handoff bot → humano
- **`n8n-workflow-build-script`** — versionar workflows N8N reproducibles
- **`n8n-langchain-agent-postgres-memory`** — memoria conversacional en Postgres
- **`bot-llm-marker-expand-pattern`** — patrón marker para que el bot mande media
- **`whatsapp-image-delivery-ycloud`** — enviar imágenes vía YCloud
- **`sales-framework-spsp-whatsapp`** — framework de ventas adaptado a WhatsApp
- **`inbox-message-bubble-render`** — render multi-tipo en frontend (cuando se llegue al CRM)

## Filosofía / por qué existe esta skill

Casa CRM es el primer chatbot del founder que está bien arquitecturado. Esta skill extrae lo replicable para que los chatbots de OTROS clientes (que hoy están en Airtable y fallan) puedan migrar a Supabase con un schema que ya está pensado para escalar al CRM general futuro.

> "Toda eso replicarlo también en otros proyectos. Quedando bien en este, podemos documentarlo, crear skills para, en otros proyectos, nada más reutilizar esas skills y volver a recrear todo con mucha más facilidad."
> — Founder, 2026-05-21

Esta skill es la materialización de esa visión para la capa de base de datos.
