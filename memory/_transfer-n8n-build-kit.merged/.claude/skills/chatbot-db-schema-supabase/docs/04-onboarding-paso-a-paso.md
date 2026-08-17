# 04 — Onboarding paso a paso

Cómo arrancar un chatbot nuevo desde cero con este schema. Target: **30 minutos** desde "tengo el SKILL en la mano" hasta "el bot recibe el primer mensaje y lo guarda en DB".

---

## Pre-requisitos

- Cuenta Supabase (free tier alcanza para arrancar)
- Cuenta YCloud (o Twilio si preferís) con WhatsApp Business habilitado
- Cuenta N8N (self-hosted o Cloud)
- 30 minutos sin interrupciones

---

## Paso 1: crear proyecto Supabase (3 min)

1. Ir a [supabase.com](https://supabase.com) → New Project
2. Nombre: descriptivo per cliente (`chatbot-clinica-x`, `chatbot-tienda-y`)
3. Región: la más cercana al cliente (Sao Paulo para LATAM)
4. Password de DB: generar fuerte, guardar en 1Password
5. Esperar provisión (~2 min)

---

## Paso 2: aplicar el schema CORE (5 min)

### Opción A: vía SQL Editor del Dashboard

1. Dashboard → SQL Editor → New query
2. Copiar contenido de `sql/0001_core.sql` → Run
3. Verificar sin errores → repetir para `0002_rls.sql` y `0003_triggers_realtime.sql`

### Opción B: vía Supabase CLI

```bash
# Asumiendo que tenés supabase CLI instalado y proyecto vinculado
supabase db push  # aplica todas las migrations en supabase/migrations/

# O ejecutar manualmente uno por uno:
psql "<your_connection_string>" -f sql/0001_core.sql
psql "<your_connection_string>" -f sql/0002_rls.sql
psql "<your_connection_string>" -f sql/0003_triggers_realtime.sql
```

### Verificación

```sql
-- Deben existir las tablas core
select table_name from information_schema.tables
 where table_schema = 'public'
   and table_name in ('agencies','agency_channels','leads','conversations','messages','tasks');
-- Esperado: 6 rows

-- Enums creados
select typname from pg_type where typname like 'message_%' or typname like 'lead_%';
-- Esperado: message_channel, message_direction, message_kind, message_sender_kind, message_status, lead_status, lead_source
```

---

## Paso 3: cargar el plug-in del nicho (2 min)

Según el tipo de chatbot, cargar UNO:

```bash
# Si es chatbot de reservas (clínica, peluquería, restaurante con reservas):
psql "<conn>" -f sql/plug-ins/reservas.sql

# Si es e-commerce / catálogo:
psql "<conn>" -f sql/plug-ins/ecommerce.sql

# Si es soporte / helpdesk:
psql "<conn>" -f sql/plug-ins/soporte.sql

# Si es inmobiliaria:
psql "<conn>" -f sql/plug-ins/inmobiliaria.sql
```

NO cargar plug-ins que no vas a usar. Mantener el schema limpio per-instancia.

### Verificación

```sql
-- Si cargaste reservas:
select count(*) from information_schema.tables
 where table_name in ('services','staff_members','appointments');
-- Esperado: 3

-- Si cargaste ecommerce:
select count(*) from information_schema.tables
 where table_name in ('products','orders','order_items');
-- Esperado: 3

-- Etcétera
```

---

## Paso 4: crear la agency + canal (3 min)

Aún en SQL Editor:

```sql
-- Crear la agency (el cliente para quien es este chatbot)
insert into agencies (slug, name, country_code, timezone, currency)
values ('clinica-dental-x', 'Clínica Dental X', 'CR', 'America/Costa_Rica', 'CRC')
returning id;
-- ⬆️ guardar este UUID, lo necesitás abajo

-- Crear el canal WhatsApp conectado
insert into agency_channels (agency_id, channel, phone_number, wa_business_id, is_active)
values ('<el-uuid-de-arriba>', 'whatsapp', '+50688112233', '<wa-business-account-id>', true);
```

Tomar nota del `agency_id` — lo vas a usar en N8N y en la edge function.

---

## Paso 5: edge function para webhook entrante (10 min)

Esta es la función que recibe los webhooks de YCloud y los persiste como messages.

### 5.1 Crear la edge function

```bash
mkdir -p supabase/functions/ycloud-webhook
```

Copiar/escribir el código de [ycloud-webhook-to-supabase skill](../../ycloud-webhook-to-supabase/SKILL.md) o usar Casa CRM como referencia (`supabase/functions/ycloud-webhook/index.ts`).

Adaptaciones mínimas:
- Si es WhatsApp via YCloud → usar tal cual
- Si es Twilio → cambiar el parseo de payload (Twilio tiene otra forma)
- Si es Meta direct → cambiar a verificar HMAC de Meta + parseo Messenger/Instagram

### 5.2 Setear secret de webhook

```bash
supabase secrets set YCLOUD_WEBHOOK_SECRET=whsec_xxxxxxxx
```

### 5.3 Deploy

```bash
supabase functions deploy ycloud-webhook --no-verify-jwt
```

**Crítico:** `--no-verify-jwt` porque YCloud no manda JWT — la auth es HMAC.

### 5.4 Configurar webhook en YCloud

1. YCloud Dashboard → Webhooks → Add
2. URL: `https://<tu-proyecto>.supabase.co/functions/v1/ycloud-webhook`
3. Events: `whatsapp.inbound_message.received` + `whatsapp.message.updated`
4. Secret: el mismo `whsec_xxxxxxxx` de antes
5. Test → debería responder 200

---

## Paso 6: N8N workflow del bot (15 min — o copiar plantilla)

### Opción A: empezar de cero

Estructura mínima de nodos:

1. **Webhook trigger** (recibe envíos de la edge function — o si querés, el webhook directo y skipear la edge function para inbound; en ese caso la edge function solo procesa outbound)
2. **Postgres: get conversation state** (lookup en `conversations` por `lead_id+channel`)
3. **LangChain Agent** con:
   - **Postgres Chat Memory** (session_id = conversation_id, ver skill `n8n-langchain-agent-postgres-memory`)
   - **OpenAI / Anthropic** Chat Model
   - **Tools:** `Supabase Properties Tool` (o lo que aplique al nicho)
4. **Code: formatear respuesta** (chunkear si necesario)
5. **HTTP: send via YCloud** (POST a `api.ycloud.com/v2/whatsapp/messages`)
6. **Postgres: insert message outbound** (idempotencia por external_id retornado por YCloud)

### Opción B: copiar de Casa CRM como plantilla

Casa CRM tiene `n8n/workflows/chatbot-inmobiliaria-demo-ycloud-sofia-v5.5.json` que es un workflow funcionando end-to-end. Pasos para adaptar:

1. Importar el workflow JSON
2. Cambiar el system prompt del agente (en el nodo `Agente Principal - Sofia`) — adaptar al nicho
3. Cambiar la tool (`Supabase Properties Tool` → la que aplique: `Supabase Services Tool` para clínica, `Supabase Products Tool` para e-commerce, etc.)
4. Cambiar credenciales Postgres + YCloud + OpenAI

Tiempo: 15-30 min según cuánto haya que adaptar.

---

## Paso 7: validar end-to-end (5 min)

1. Mandar un WhatsApp test al número del cliente
2. Verificar en Supabase:

```sql
-- ¿llegó el webhook?
select source, event_type, signature_valid, processed_at, processing_error
  from webhook_events_raw
 order by received_at desc
 limit 5;

-- ¿se creó el lead?
select id, display_name, phone, source, created_at
  from leads
 where agency_id = '<tu-agency-id>'
 order by created_at desc limit 5;

-- ¿se creó la conversation?
select id, channel, handler, last_message_preview, last_inbound_at, unread_count
  from conversations
 where agency_id = '<tu-agency-id>'
 order by created_at desc limit 5;

-- ¿llegaron los messages?
select direction, sender_kind, kind, substring(body, 1, 100) as preview, created_at
  from messages
 where agency_id = '<tu-agency-id>'
 order by created_at desc limit 10;
```

Si las 4 queries devuelven data esperada → el chatbot está vivo en DB.

---

## Paso 8: cargar seed-demo (opcional, para validar plug-ins)

```bash
psql "<conn>" -f sql/seed-demo.sql
```

Después descomentar al final del archivo el bloque del plug-in que cargaste para tener data de ejemplo.

```sql
-- Verificar
select count(*) from services;        -- si cargaste reservas
select count(*) from products;        -- si cargaste ecommerce
select count(*) from ticket_categories; -- si cargaste soporte
select count(*) from properties;      -- si cargaste inmobiliaria
```

---

## Checklist final

- [ ] Proyecto Supabase creado
- [ ] `0001_core.sql` + `0002_rls.sql` + `0003_triggers_realtime.sql` aplicados sin errores
- [ ] Plug-in del nicho cargado
- [ ] Row en `agencies` creada (UUID guardado)
- [ ] Row en `agency_channels` creada con phone_number correcto
- [ ] Edge function `ycloud-webhook` deployada con `--no-verify-jwt`
- [ ] Secret `YCLOUD_WEBHOOK_SECRET` configurado
- [ ] Webhook configurado en YCloud apuntando al endpoint
- [ ] N8N workflow importado/creado y conectado
- [ ] Test: WhatsApp llega → webhook procesa → lead+conversation+message en DB → N8N responde
- [ ] (Opcional) seed-demo aplicado para validar plug-ins

---

## Próximos pasos después de este onboarding

- **Si hay data legacy en Airtable:** [05-migracion-desde-airtable.md](05-migracion-desde-airtable.md)
- **Si vas a agregar Instagram/Messenger después:** ver `agency_channels` y skill futura `meta-messenger-platform-integration`
- **Si vas a conectar el CRM general futuro:** dejar RLS off por ahora; cuando migres, ver `sql/0002_rls.sql` final section

---

## Tiempo total estimado por experiencia

| Experiencia | Tiempo |
|---|---|
| Primera vez (estás siguiendo este doc paso a paso) | 60-90 min |
| Segunda vez (ya armaste uno antes) | 30-45 min |
| Tercera+ vez (copiando templates) | 15-25 min |

A partir del 3er chatbot, esto es plug-and-play.
