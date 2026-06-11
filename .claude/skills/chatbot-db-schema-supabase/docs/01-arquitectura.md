# 01 — Arquitectura general del schema

## Principios de diseño

Este schema fue destilado desde Casa CRM (sistema en producción para inmobiliarias) y generalizado para cualquier chatbot conversacional. Las decisiones siguen 5 principios:

### 1. Tenant-ready desde día 1, aunque arranques single-tenant

**Toda tabla tiene `agency_id uuid not null references agencies(id)`.** Aunque AHORA cada cliente tenga su propio proyecto Supabase (single-tenant), cuando migremos al CRM general compartido NO hay que reestructurar — solo activar RLS + cargar el `agency_id` correcto en cada row.

Si no ponés `agency_id` ahora, la migración futura es infierno.

### 2. Multi-canal first-class, no afterthought

`message_channel` es un enum con `whatsapp, messenger, instagram, web, sms, email, voice, manual`. Cada `conversation` y cada `message` tiene su `channel`. Cuando agregás Instagram, no se cambia el schema — se inserta una row en `agency_channels` con `channel='instagram'` y se conecta un webhook nuevo.

Una conversación se identifica por `(agency_id, lead_id, channel)`. Si el mismo lead te escribe por WhatsApp Y por Instagram, son **2 conversations distintas** (cada una con su propio historial).

### 3. CORE genérico + Plug-ins por nicho

El schema CORE (8 tablas) sirve para CUALQUIER chatbot: agencies, agency_members, agency_channels, leads, conversations, messages, tasks, tags + custom_fields.

Para casos de negocio específicos, hay **plug-ins opcionales**:
- `reservas.sql` — clínicas, restaurantes, peluquerías
- `ecommerce.sql` — tiendas online
- `soporte.sql` — helpdesk con tickets + SLA
- `inmobiliaria.sql` — propiedades + visitas (referencia Casa CRM)

Cada chatbot carga SOLO los plug-ins que necesita. Un chatbot de e-commerce no carga `reservas.sql`.

### 4. Idempotencia en escritura

Los mensajes vienen vía webhooks de BSPs (YCloud, Meta, Twilio). Los BSPs reenvían eventos al primer 4xx/5xx — vas a recibir el mismo mensaje varias veces. Solución: `UNIQUE (agency_id, channel, external_id)` en `messages`. Mismo patrón en `orders.order_number`, `tickets.ticket_number`, etc.

### 5. Realtime vía Broadcast (no postgres_changes)

`postgres_changes` está deprecado en proyectos Supabase nuevos. Usamos triggers que llaman `realtime.send(payload, event, topic, private)` para emitir broadcasts a topics per-conversation. El frontend se suscribe a `conv:<conversation_id>` y filtra por event.

---

## Modelo de datos (vista alto-nivel)

```
                    ┌───────────────┐
                    │   agencies    │  ← tenant root (1 row en single-tenant)
                    └───────┬───────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
    ┌─────────────┐ ┌──────────────┐ ┌──────────────┐
    │agency_members│ │agency_channels│ │    leads    │
    └─────────────┘ └──────────────┘ └──────┬───────┘
                                            │
                                            ▼
                                  ┌──────────────────┐
                                  │  conversations   │
                                  │ (1 por canal x lead)
                                  └────────┬─────────┘
                                            │
                                            ▼
                                  ┌──────────────────┐
                                  │     messages     │
                                  │  (text/image/etc)│
                                  └──────────────────┘

                    [+ tasks, tags, custom_fields, audit_log,
                       webhook_events_raw]

                    [+ plug-ins opcionales según nicho:
                       services/appointments, products/orders,
                       tickets, properties/visits, etc]
```

---

## Modelo de tenancy

### AHORA: single-tenant (1 proyecto Supabase por cliente)

```
supabase_project_cliente_X
├── agencies     → 1 row (el cliente)
├── leads        → N rows (todos del mismo agency_id)
├── conversations
├── messages
└── ...
```

- RLS **off**
- Acceso vía `service_role` (el bot N8N + edge functions)
- Simple, sin policies, sin JWT propio para data access

### DESPUÉS: multi-tenant compartido (cuando armemos CRM general)

```
supabase_project_general
├── agencies     → N rows (cliente A, cliente B, cliente C...)
├── leads        → todos en la misma tabla, RLS aisla por agency_id
├── conversations
└── ...
```

- RLS **on**
- Cada agency tiene users vía `agency_members`
- Las policies (escritas en `0002_rls.sql` pero off) ya están listas
- Migración: insert agencies → cargar agency_id correcto en data existente → `alter table ... enable rls`

**Por qué importa diseñar para esto desde día 1:** si no incluís `agency_id` en cada row ahora, después tenés que retro-fitear UUIDs en millones de rows existentes. Con `agency_id` ya presente, la migración es 3-4 SQLs.

---

## Multi-canal: cómo agregar un canal nuevo

### Para agregar Instagram (cuando llegue el momento):

1. **DB:** el enum `message_channel` ya tiene `'instagram'`. No hay que tocar schema.
2. **Conexión:** insertar row en `agency_channels` con `channel='instagram'`, `page_id`, `instagram_account_id`, `page_access_token`.
3. **Edge function nueva:** `instagram-webhook` espejo de `ycloud-webhook` parseando payload Meta Instagram.
4. **N8N:** workflow nuevo o branch por channel en el existente.
5. **Frontend (cuando exista):** badge de canal + filtro por channel en inbox.

Sin tocar tablas, sin migrations destructivas, sin breaking changes a data existente.

---

## Roles y RLS (cuando se active)

| Rol agency_member | Lee | Escribe leads/conv/msg/tasks | Configura agency_channels | Maneja members |
|---|---|---|---|---|
| **owner** | ✅ | ✅ | ✅ | ✅ |
| **admin** | ✅ | ✅ | ✅ | ✅ |
| **agent** | ✅ | ✅ | ❌ | ❌ |
| **viewer** | ✅ | ❌ | ❌ | ❌ |

El bot N8N usa `service_role` que BYPASA toda RLS. Los humanos en el CRM usarán `authenticated` con JWT que codifica su `user_id`, y las policies filtran por las agencies a las que pertenece.

---

## Idempotencia: el patrón

Cada vez que el bot/webhook escribe un message:

```sql
insert into messages (agency_id, conversation_id, lead_id, channel, ..., external_id)
values (..., 'wa_abc123')
on conflict (agency_id, channel, external_id) do nothing
returning id;
```

Si el webhook se reenvía, el `on conflict do nothing` evita el duplicado. **Crítico:** todos los BSPs reenvían eventos cuando dan timeout o error en tu endpoint. Sin idempotencia, vas a ver mensajes duplicados en el inbox.

Mismo patrón aplica a:
- `orders` (UNIQUE en `order_number`)
- `tickets` (UNIQUE en `ticket_number`)
- `appointments` (validar slot libre antes de insert)

---

## Persistencia paranoid de webhooks

Cada webhook entrante (de YCloud, Meta, Twilio) se guarda primero en `webhook_events_raw` ANTES de procesarse:

```typescript
const raw = await req.text();
const { data: rawRow } = await supabase.from('webhook_events_raw').insert({
  source: 'ycloud', event_type: payload.type, raw_payload: payload,
  signature_valid: isValid
}).select('id').single();

try {
  // procesar...
  await supabase.from('webhook_events_raw').update({ processed_at: now }).eq('id', rawRow.id);
} catch (e) {
  await supabase.from('webhook_events_raw').update({ processing_error: e.message }).eq('id', rawRow.id);
}

return new Response('ok', { status: 200 });  // SIEMPRE 200
```

Si tu edge function bug y tira excepción, el raw queda en DB. Podés re-procesar con un script. Sin esto, perdés mensajes en silencio cuando hay un bug.

---

## Custom fields: cuándo usarlos

La tabla `custom_field_defs` + `custom_field_values` es para data variable per-cliente que NO justifica una columna fija.

✅ **SÍ usar para:**
- Cliente de clínica quiere guardar "alergias", "última visita" — esos datos solo aplican a leads de ese cliente
- Cliente de e-commerce quiere "talla preferida", "color favorito"
- Cliente de soporte quiere "número de cuenta", "tipo de plan"

❌ **NO usar para:**
- Data que es central al pipeline (status, score, source) → columnas fijas en `leads`
- Data que necesitás indexar y filtrar al millón de rows → columnas fijas en plug-in
- Antipattern EAV completo (todo es key-value) → mata performance

Regla: si vas a hacer `WHERE custom_field = X` mucho, esa columna debería ser fija (en plug-in). Si es solo display + raras búsquedas, custom_fields está bien.

---

## Decisiones que NO tomó este schema (y por qué)

### NO usamos EAV completo (Airtable-style)

Una tabla `entities` + `entity_fields` parece elegante pero rompe en:
- Queries complejas (joins ya no funcionan natural)
- Performance (cada query es N joins extra)
- Type safety (todo es text/jsonb, sin enums ni constraints)
- RLS (escribir policies sobre data EAV es pesadilla)

Airtable es EAV detrás. Por eso falla a escala. Por eso migrás de Airtable a Supabase. NO repetir el mismo error.

### NO tabla genérica `events`

Tentación: una tabla `events` con `event_type, entity_id, payload jsonb` para log de todo. Termina siendo basurero. Mejor tablas específicas (`audit_log`, `webhook_events_raw`) con schema claro.

### NO multi-DB por cliente

Una DB Postgres por cliente (no proyecto Supabase) = pesadilla operativa. Backup, migrations, monitoring, todo se complica. Si querés aislamiento fuerte: 1 proyecto Supabase por cliente (single-tenant) o RLS bien hecho (multi-tenant).

---

## Próximos pasos

Una vez claro el modelo, ver:

- **[02-schema-explicado.md](02-schema-explicado.md)** — cada tabla en detalle
- **[03-plug-ins-por-nicho.md](03-plug-ins-por-nicho.md)** — cuándo cargar cada plug-in
- **[04-onboarding-paso-a-paso.md](04-onboarding-paso-a-paso.md)** — arrancar un chatbot nuevo en 30 minutos
- **[05-migracion-desde-airtable.md](05-migracion-desde-airtable.md)** — patrones comunes Airtable → Supabase
