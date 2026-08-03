# 05 — Migración desde Airtable a Supabase

Patrones reusables para migrar data existente de chatbots que viven en Airtable.

## Por qué migrar de Airtable

Airtable es excelente para arrancar (UI bonita, no-code, equipo no-técnico). Falla a escala porque:

- **Rate limits estrictos** (5 req/seg por base) → chatbots con alto volumen se ahogan
- **Sin transacciones** → race conditions cuando 2 webhooks llegan a la vez
- **Sin RLS real** → multi-tenant requiere hacks
- **Costo escala mal** (cada record cuenta hacia el límite del plan)
- **Sin queries complejas** (no joins, no aggregations potentes)
- **API queries lentas** (200-500ms por request básico)

Supabase resuelve todo eso siendo Postgres real.

---

## Estrategia general de migración

**3 fases:**

1. **MAPEO** — entender el modelo Airtable y mapear a Supabase
2. **EXTRACCIÓN** — exportar data de Airtable
3. **CARGA** — insertar en Supabase con transformaciones

Tiempo típico: 1-3 días según volumen + complejidad.

**Decisión clave:** migrar TODO de una vez o **dual-write** durante un período. Para chatbots críticos en producción, dual-write reduce riesgo: el bot escribe a Airtable Y Supabase, validás que Supabase tiene la misma data, después corté Airtable.

---

## Fase 1: Mapeo Airtable → Supabase

### Mapeo típico

| Concepto Airtable | Concepto Supabase | Nota |
|---|---|---|
| Base | Proyecto Supabase + agency_id | 1 base Airtable suele ser 1 agency |
| Table "Leads" / "Contacts" / "Customers" | `leads` | El nombre cambia, el modelo es similar |
| Table "Messages" / "Chat History" | `messages` (vía `conversations`) | En Airtable suele faltar el nivel conversation — hay que crearlo |
| Table "Orders" / "Bookings" / "Tickets" | Plug-ins específicos | Según el nicho |
| Single Select fields | enums | Mapear valores explícitamente |
| Linked records | FKs (uuid) | Usar `external_ref` para mantener vínculo durante migración |
| Formula fields | views o computed columns | Re-calcular cuando se necesite |
| Attachments | media_url + Supabase Storage | Re-uploadear si no son URLs públicas |

### Patrón concreto: chatbot de clínica

**Airtable:**
- Base "Clínica X"
- Tabla "Pacientes" (Name, Phone, Email, Last Visit, Status)
- Tabla "Citas" (Patient, Service, Date, Status, Notes)
- Tabla "Servicios" (Name, Duration, Price)
- Tabla "Chat Log" (Patient, Message, Direction, Timestamp)

**Mapeo a Supabase:**

| Airtable | Supabase | Notas de transformación |
|---|---|---|
| Pacientes.Name | leads.full_name | igual |
| Pacientes.Phone | leads.phone | normalizar a E.164 (+506...) |
| Pacientes.Email | leads.email | citext, lowercase |
| Pacientes.Last Visit | leads.last_contact_at | parsear fecha |
| Pacientes.Status | leads.status | mapear: "Active"→"contactado", "Lead"→"nuevo", etc. |
| Pacientes.id (Airtable) | leads.external_ref | guardar para auditoría post-migración |
| Citas.* | appointments (plug-in reservas) | + lookup de service_id |
| Servicios.* | services | trivial |
| Chat Log.* | messages | + crear conversations en el medio |

---

## Fase 2: Extracción de Airtable

### Opción A: vía Airtable API (recomendado)

```javascript
// Usando airtable.js
const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_KEY }).base('appXXXXX');

async function fetchAll(tableName) {
  const records = [];
  await base(tableName).select({ pageSize: 100 }).eachPage((page, next) => {
    records.push(...page);
    next();
  });
  return records.map(r => ({ id: r.id, ...r.fields }));
}

const leads = await fetchAll('Pacientes');
const appointments = await fetchAll('Citas');
const messages = await fetchAll('Chat Log');
// guardar a JSON files o stream directo a Supabase
```

Rate limit Airtable: 5 req/seg. Para bases grandes (>10k records), planificar exports en horario off-peak.

### Opción B: Export CSV manual + procesar

Airtable → table → Download CSV. Útil para bases pequeñas (<1k records) o cuando no tenés acceso API.

```bash
# Procesar CSV con node script
node migrate.js leads.csv > leads.sql
```

### Opción C: Make.com / Zapier para extracción incremental

Si querés mantener Airtable Y Supabase sincronizados durante un período (dual-write), un workflow Make/Zapier que lea Airtable cada 5 min y haga upsert en Supabase puede servir.

---

## Fase 3: Carga en Supabase

### 3.1 Crear la agency primero

```sql
insert into agencies (slug, name, country_code, timezone)
values ('clinica-x', 'Clínica X', 'CR', 'America/Costa_Rica')
returning id;
-- guardar este UUID, todos los inserts lo necesitan
```

### 3.2 Cargar lookup tables (services, ticket_categories, etc.)

Estas se cargan primero porque las tablas principales las referencian.

```javascript
const agencyId = '<el-uuid>';

for (const s of servicios) {
  await supabase.from('services').insert({
    agency_id: agencyId,
    name: s.Name,
    duration_minutes: s.Duration,
    price: parseFloat(s.Price),
    category: mapCategory(s.Type),  // mapear texto Airtable a enum
  });
}
```

### 3.3 Cargar leads con `external_ref`

```javascript
const leadMap = new Map();  // airtable_id → supabase_uuid

for (const p of pacientes) {
  const { data } = await supabase.from('leads').insert({
    agency_id: agencyId,
    full_name: p.Name,
    phone: normalizePhone(p.Phone, 'CR'),  // +506XXXXXXXX
    email: p.Email?.toLowerCase(),
    wa_user_id: extractWAId(p.Phone),  // si tu Airtable no lo tenía
    status: mapStatus(p.Status),
    last_contact_at: parseDate(p.LastVisit),
    source: 'whatsapp',
    external_ref: p.id,  // <- airtable record id, para validar después
    extra: {
      airtable_id: p.id,
      legacy_data: { /* lo que no encaja en columnas fijas */ }
    },
  }).select('id').single();

  leadMap.set(p.id, data.id);
}
```

**Crítico: `external_ref`** preserva el vínculo. Después podés validar:
```sql
select count(*) from leads where external_ref is not null;
-- debería matchear count(*) de Airtable.Pacientes
```

### 3.4 Crear conversations sintéticas

Si Airtable no tenía nivel "conversation" (solo "Chat Log"), crear una conversation por (lead, canal):

```javascript
const convMap = new Map();  // airtable_lead_id → conversation_uuid

for (const [airtableLeadId, supabaseLeadId] of leadMap) {
  // Crear 1 conversation por canal donde haya mensajes de este lead
  const channels = await detectChannels(airtableLeadId);  // de tu Chat Log

  for (const channel of channels) {
    const { data } = await supabase.from('conversations').insert({
      agency_id: agencyId,
      lead_id: supabaseLeadId,
      channel: channel,  // 'whatsapp' / 'instagram' / etc.
      handler: 'human',  // o 'bot' según contexto
    }).select('id').single();

    convMap.set(`${airtableLeadId}:${channel}`, data.id);
  }
}
```

### 3.5 Cargar mensajes en orden cronológico

**Crítico: ordenar por timestamp antes de insertar.** Los triggers `on_message_insert` van a actualizar `last_message_at`, `unread_count`, etc. Si insertás en orden incorrecto, los denormalized fields quedan con valores raros.

```javascript
const sortedMessages = chatLog.sort((a, b) => new Date(a.Timestamp) - new Date(b.Timestamp));

for (const m of sortedMessages) {
  const supabaseLeadId = leadMap.get(m.Patient[0]);  // Airtable linked records son arrays
  const channel = m.Channel?.toLowerCase() || 'whatsapp';
  const conversationId = convMap.get(`${m.Patient[0]}:${channel}`);

  if (!supabaseLeadId || !conversationId) continue;  // skip orphans

  await supabase.from('messages').insert({
    agency_id: agencyId,
    conversation_id: conversationId,
    lead_id: supabaseLeadId,
    channel: channel,
    direction: m.Direction === 'IN' ? 'inbound' : 'outbound',
    sender_kind: mapSenderKind(m),
    kind: detectKind(m),  // text / image / etc.
    body: m.Message,
    media_url: m.MediaUrl || null,
    external_id: m.WAMessageId || `airtable_${m.id}`,  // idempotencia
    created_at: m.Timestamp,
    status: 'sent',
  });
}
```

### 3.6 Cargar plug-in data (appointments, orders, tickets)

```javascript
// Para appointments (plug-in reservas)
const serviceMap = await loadServiceMap(agencyId);

for (const c of citas) {
  await supabase.from('appointments').insert({
    agency_id: agencyId,
    lead_id: leadMap.get(c.Patient[0]),
    service_id: serviceMap.get(c.Service[0]),
    scheduled_at: parseDateTime(c.Date),
    status: mapAppointmentStatus(c.Status),
    customer_notes: c.Notes,
    extra: { airtable_id: c.id },
  });
}
```

---

## Validación post-migración

```sql
-- 1. Counts coinciden con Airtable
select count(*) from leads where agency_id = '<id>';
select count(*) from appointments where agency_id = '<id>';
select count(*) from messages where agency_id = '<id>';

-- 2. external_ref pobladas (auditoría)
select count(*) from leads
 where agency_id = '<id>' and external_ref is not null;

-- 3. No orphans
select count(*) from messages m
 left join conversations c on c.id = m.conversation_id
 where c.id is null;
-- esperado: 0

-- 4. Sanity check: mensajes ordenados, last_message_at correcto
select id, last_message_at,
       (select max(created_at) from messages where conversation_id = conversations.id) as actual_max
  from conversations
 where agency_id = '<id>';
-- last_message_at debe igual actual_max
```

---

## Gotchas comunes

### Phone numbers no normalizados
Airtable a menudo guarda `88112233`, `8811-2233`, `+506 8811 2233`. Normalizar a E.164 (`+50688112233`):

```javascript
function normalizePhone(raw, countryCode = 'CR') {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('506')) return `+${digits}`;
  if (digits.length === 8 && countryCode === 'CR') return `+506${digits}`;
  return `+${digits}`;
}
```

### Duplicates por phone
Airtable permite múltiples records con mismo phone. Antes de insertar:

```javascript
const seen = new Set();
for (const p of pacientes) {
  const phone = normalizePhone(p.Phone);
  if (seen.has(phone)) {
    console.warn(`DUP phone: ${phone} — airtable_id=${p.id}`);
    continue;
  }
  seen.add(phone);
  // insert
}
```

### Linked records vacíos
Airtable linked field puede ser `[]` o `undefined`. Validar antes de hacer `.get(c.Service[0])`:

```javascript
if (!c.Patient || c.Patient.length === 0) continue;
```

### Status enums no matcheán
Airtable: `"Active"`, `"Inactive"`, `"In Process"`.
Supabase enum: `lead_status` = `nuevo | contactado | calificado | ...`

Crear función de mapeo explícita:

```javascript
function mapStatus(airtableStatus) {
  const map = {
    'New': 'nuevo',
    'Active': 'contactado',
    'Qualified': 'calificado',
    'Won': 'cerrado_ganado',
    'Lost': 'cerrado_perdido',
    'Cold': 'frio',
  };
  return map[airtableStatus] || 'nuevo';
}
```

### Attachments / fotos
Airtable attachments tienen URLs temporales que expiran. Antes de migrar:

```javascript
for (const m of messagesWithAttachments) {
  // 1. Descargar el attachment Airtable
  const buffer = await fetch(m.attachment.url).then(r => r.arrayBuffer());

  // 2. Subir a Supabase Storage
  const { data } = await supabase.storage.from('chat-media').upload(
    `${agencyId}/${m.id}.jpg`,
    buffer,
    { contentType: 'image/jpeg' }
  );

  // 3. Usar la URL pública en messages.media_url
  const publicUrl = supabase.storage.from('chat-media').getPublicUrl(data.path).data.publicUrl;
  m.media_url = publicUrl;
}
```

### Triggers que vuelven loca la migración
Los triggers (`on_message_insert`, `broadcast_message_change`) van a dispararse en CADA insert. Para migraciones grandes (>10k mensajes):

```sql
-- Desactivar triggers temporalmente
alter table messages disable trigger tg_message_denorm;
alter table messages disable trigger tg_broadcast_messages;

-- Cargar data masiva
-- ...

-- Recalcular denormalizados manualmente
update conversations c
   set last_message_at = (select max(created_at) from messages where conversation_id = c.id),
       last_message_preview = (select substring(body, 1, 200) from messages
                                where conversation_id = c.id
                                order by created_at desc limit 1);

-- Re-activar triggers
alter table messages enable trigger tg_message_denorm;
alter table messages enable trigger tg_broadcast_messages;
```

---

## Plan dual-write (zero-downtime)

Si el chatbot del cliente NO puede parar durante la migración:

### Semana 1 — Backfill
- Cargar TODA la data histórica de Airtable a Supabase
- Validar counts + spot-check de samples

### Semana 2 — Dual-write
- El bot/webhook empieza a escribir a AMBOS: Airtable (igual que antes) + Supabase (nuevo)
- Cada inserción exitosa en Supabase guarda el airtable_id en `external_ref`
- Monitor: 0 errores durante 7 días

### Semana 3 — Switch read
- Apuntar el CRM/dashboards/queries a Supabase
- Airtable solo recibe writes (espejo)
- Validar 7 días

### Semana 4 — Cortar Airtable
- El bot/webhook deja de escribir a Airtable
- Mantener Airtable read-only 30 días como backup
- Después archivar / borrar

Total: 1 mes para una migración robusta sin downtime.

---

## Checklist final post-migración

- [ ] Counts en Supabase = counts en Airtable (±5% es OK por dedup)
- [ ] `external_ref` pobladas en todas las tablas migradas
- [ ] No orphans (FK constraint queries devuelven 0)
- [ ] Phone numbers normalizados a E.164
- [ ] Status enums mapeados consistentemente
- [ ] Attachments re-uploaded a Supabase Storage (no URLs Airtable que expiran)
- [ ] Denormalized fields (`last_message_at`, etc.) recalculados correctamente
- [ ] El bot/webhook está escribiendo a Supabase (no Airtable)
- [ ] Backup de Airtable export tomado y guardado (CSV o JSON)
- [ ] Monitor primeras 48h post-cutover: alertas si 0 mensajes nuevos en X minutos
