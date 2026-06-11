# Skill: YCloud Webhook → Supabase Edge Function

## Cuándo usar esta skill

- Vas a integrar YCloud (o BSP equivalente como Twilio) como puente de WhatsApp con un backend Supabase.
- Necesitás recibir mensajes inbound (lead → bot) y/o eventos de delivery status (outbound del bot).
- Necesitás persistir en una tabla `messages` con FK a `conversations` y `leads` (modelo multi-tenant con `agency_id`).
- Querés un único endpoint que reciba TODOS los eventos de YCloud y los procese según el tipo.

## Por qué existe esta skill

YCloud envía múltiples tipos de eventos al mismo endpoint:
- `whatsapp.inbound_message.received` — lead mandó mensaje al número del negocio
- `whatsapp.message.updated` — status de un outbound (sent / delivered / read / failed)
- Otros (delivery reports, errors, channel updates...)

Sin patrón claro, terminas con un endpoint gigante que mezcla lógica. La estructura correcta:
1. **Verificar firma HMAC** (sin esto, cualquiera puede impersonar a YCloud)
2. **Persistir el raw** en una tabla `webhook_events_raw` ANTES de procesar
3. **Router por `eventType`** a handlers separados
4. **Idempotencia** sobre `wa_message_id` y otros IDs externos
5. **Siempre retornar 200** (el raw ya está persistido, no queremos retries de YCloud)

## Proceso

### 1. Tabla de raw events (paranoid storage)

```sql
create table public.webhook_events_raw (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'ycloud',
  event_type text,
  raw_payload jsonb not null,
  signature_valid boolean not null,
  processing_error text,
  processed_at timestamptz,
  received_at timestamptz not null default now()
);
create index idx_webhook_events_received on public.webhook_events_raw (received_at desc);
```

Razón: si tu Edge function rompe (bug, schema mismatch, etc.) los datos ya están guardados y podés re-procesar. Sin esto, perdés mensajes en silencio.

### 2. Verificación de firma HMAC (estilo Stripe)

YCloud manda header `ycloud-signature: t=<unix>,s=<hmac_hex>` donde HMAC = HMAC-SHA256(secret, `${t}.${rawBody}`).

```typescript
async function verifySignature(rawBody: string, header: string, secret: string): Promise<boolean> {
  const parts = header.split(',');
  const t = parts.find(p => p.startsWith('t='))?.slice(2);
  const s = parts.find(p => p.startsWith('s='))?.slice(2);
  if (!t || !s) return false;
  const ageS = Math.abs(Date.now() / 1000 - parseInt(t, 10));
  if (ageS > 5 * 60) return false; // replay protection 5 min
  const key = await crypto.subtle.importKey('raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${rawBody}`));
  return toHex(sig) === s;
}
```

**Gotcha:** la firma se calcula sobre el `rawBody` **antes de parsearlo a JSON**. Si parseás primero y re-stringificás, los whitespaces cambian y la firma no matchea. Usar `req.text()` en Deno, NO `req.json()`.

### 3. Storage del raw ANTES de procesar

```typescript
const raw = await req.text();
const isValid = await verifySignature(raw, req.headers.get('ycloud-signature') ?? '', YCLOUD_WEBHOOK_SECRET);
const payload = JSON.parse(raw);

const { data: rawRow } = await supabase
  .from('webhook_events_raw')
  .insert({
    event_type: payload.type,
    raw_payload: payload,
    signature_valid: isValid,
  })
  .select('id')
  .single();

if (!isValid) return new Response('ok', { status: 200 }); // log y aceptar
```

### 4. Router por `eventType`

```typescript
try {
  switch (payload.type) {
    case 'whatsapp.inbound_message.received':
      await handleInbound(payload, rawRow.id);
      break;
    case 'whatsapp.message.updated':
      await handleOutboundStatus(payload, rawRow.id);
      break;
    default:
      // log unknown event y seguir
  }
  await supabase.from('webhook_events_raw')
    .update({ processed_at: new Date().toISOString() })
    .eq('id', rawRow.id);
} catch (e) {
  await supabase.from('webhook_events_raw')
    .update({ processing_error: e.message })
    .eq('id', rawRow.id);
}

return new Response('ok', { status: 200 }); // siempre 200
```

### 5. Handler de inbound (lead → bot)

```typescript
async function handleInbound(payload, rawId) {
  const message = payload.whatsappInboundMessage; // o equivalente
  const toPhone = message.to;     // tu número de business
  const fromPhone = message.from;  // número del lead

  // 5.1 Resolve agency by `to` (el número del business identifica la agencia)
  const { data: agency } = await supabase
    .from('agencies')
    .select('id')
    .eq('whatsapp_phone', toPhone)
    .single();
  if (!agency) throw new Error(`no agency for phone ${toPhone}`);

  // 5.2 UPSERT lead por (agency_id, ycloud_user_id)
  const { data: lead } = await supabase
    .from('leads')
    .upsert({
      agency_id: agency.id,
      ycloud_user_id: message.userId || fromPhone,
      phone: fromPhone,
      display_name: message.userProfileName || fromPhone,
      source: 'whatsapp',
    }, { onConflict: 'agency_id,ycloud_user_id' })
    .select('id')
    .single();

  // 5.3 UPSERT conversation por (agency_id, lead_id)
  const { data: conv } = await supabase
    .from('conversations')
    .upsert({
      agency_id: agency.id,
      lead_id: lead.id,
      last_inbound_at: new Date().toISOString(),
    }, { onConflict: 'agency_id,lead_id' })
    .select('id')
    .single();

  // 5.4 INSERT message (idempotente por wa_message_id)
  const content = extractContent(message); // ver más abajo
  await supabase.from('messages').insert({
    agency_id: agency.id,
    conversation_id: conv.id,
    lead_id: lead.id,
    direction: 'inbound',
    sender_kind: 'lead',
    kind: mapMessageKind(message.type),
    body: content.body,
    media_url: content.media_url,
    media_mime: content.media_mime,
    media_metadata: content.media_metadata,
    wa_message_id: message.id,
    status: 'received',
  }, { onConflict: 'wa_message_id', ignoreDuplicates: true });
}
```

### 6. Extract content por tipo (text, image, audio, location, etc.)

```typescript
function mapMessageKind(ycloudType: string): MessageKind {
  switch (ycloudType) {
    case 'text': return 'text';
    case 'image': return 'image';
    case 'audio': return 'audio';
    case 'video': return 'video';
    case 'document': return 'document';
    case 'location': return 'location';
    default: return 'text';
  }
}

function extractContent(message) {
  const result = { body: null, media_url: null, media_mime: null, media_metadata: null };
  switch (message.type) {
    case 'text':
      result.body = message.text?.body;
      break;
    case 'image':
      result.body = message.image?.caption || null;
      result.media_url = message.image?.link;
      result.media_mime = 'image/jpeg';
      result.media_metadata = { id: message.image?.id };
      break;
    case 'audio':
      result.media_url = message.audio?.link;
      result.media_mime = 'audio/ogg';
      result.media_metadata = { id: message.audio?.id, voice: message.audio?.voice };
      break;
    case 'location':
      result.media_metadata = {
        latitude: message.location?.latitude,
        longitude: message.location?.longitude,
        name: message.location?.name,
      };
      break;
  }
  return result;
}
```

### 7. Handler de outbound status

Para outbound (bot → lead), YCloud manda `whatsapp.message.updated` con status. Aquí hay 2 escenarios:
- **El outbound YA existe en messages** (el bot lo insertó al enviar): UPDATE status + sent_at / delivered_at / read_at.
- **El outbound NO existe** (el bot mandó vía YCloud sin insertar localmente): INSERT con kind/media_url del payload de status. Esto es el "backfill outbound".

```typescript
async function handleOutboundStatus(payload, rawId) {
  const message = payload.whatsappMessage; // o equivalente
  const fromPhone = message.from; // outbound: from = agency
  const wa_message_id = message.id;

  // resolve agency by from
  const { data: agency } = await supabase
    .from('agencies').select('id').eq('whatsapp_phone', fromPhone).single();

  // ¿existe ya el mensaje localmente?
  const { data: existing } = await supabase
    .from('messages').select('id').eq('wa_message_id', wa_message_id).maybeSingle();

  if (existing) {
    // UPDATE status timestamps
    const update: any = { status: mapStatus(message.status) };
    if (message.status === 'sent') update.sent_at = message.sentTime;
    if (message.status === 'delivered') update.delivered_at = message.deliveredTime;
    if (message.status === 'read') update.read_at = message.readTime;
    if (message.status === 'failed') {
      update.error_code = message.error?.code;
      update.error_message = message.error?.message;
    }
    await supabase.from('messages').update(update).eq('id', existing.id);
  } else {
    // INSERT backfill (el bot envió sin registrar localmente)
    // ... lookup lead by to + agency_id, lookup conversation, INSERT con kind/media_url
  }
}
```

### 8. Deploy

```bash
supabase functions deploy ycloud-webhook --no-verify-jwt
# Set secret en Dashboard → Edge Functions → Manage secrets:
# YCLOUD_WEBHOOK_SECRET = <el valor de YCloud, incluyendo prefijo whsec_ si tiene>
```

Configurar en YCloud el webhook URL: `https://<project>.supabase.co/functions/v1/ycloud-webhook`.

## Output esperado

1. Edge function `supabase/functions/ycloud-webhook/index.ts` desplegada con `verify_jwt: false`
2. Tabla `webhook_events_raw` creada
3. Tabla `messages` con FK a `conversations`, `leads`, `agency_id`
4. Secret `YCLOUD_WEBHOOK_SECRET` configurado
5. URL del endpoint registrada en YCloud
6. Verificación: inbound message del lead aparece en `messages` con `kind` correcto y media_url si aplica

## Ejemplo concreto (Casa CRM, en producción 2026-05-18+)

Implementación en [supabase/functions/ycloud-webhook/index.ts](supabase/functions/ycloud-webhook/index.ts) v0.3.0:
- HMAC verificado, raw siempre persistido en `webhook_events_raw`
- Router por `payload.type`
- Inbound handler: UPSERT lead + conversation + INSERT message idempotente por `wa_message_id`
- Outbound handler: UPDATE status timestamps o INSERT backfill
- `mapMessageKind` y `extractContent` cubren text / image / audio / video / document / location

Funcionó end-to-end con: imágenes (CR-2031 llegando al inbox CRM con `kind='image'` + `media_url`), audios (Whisper transcribe + media_url), texts.

## Gotchas / antipattern

- **NO** parsear el body antes de verificar firma. La firma se calcula sobre el raw exacto.
- **NO** retornar 4xx/5xx cuando hay error de procesamiento. YCloud va a re-tryar y vas a tener duplicados. Loguear en `processing_error` y retornar 200.
- **NO** olvidar idempotencia por `wa_message_id`. YCloud puede mandar el mismo evento varias veces.
- **NO** dejar `verify_jwt: true` en esta función. YCloud no manda JWT — el auth es HMAC.
- **NO** mezclar lógica de inbound/outbound en un mismo handler. Router primero.
- **NO** confiar en `payload.userProfileName` como nombre real — los usuarios cambian su display name. Usar `phone` como llave estable.

## Skills relacionadas

- `whatsapp-image-delivery-ycloud` — el otro lado del flow (bot → YCloud → WhatsApp)
- `supabase-realtime-broadcast-pattern` — cómo el CRM se entera de nuevos messages en realtime
- `supabase-edge-function-secret-auth` (futura) — patrón general de secret-based auth para edge functions

## Memoria global del founder (relacionada)

- `feedback_supabase_postgres_changes_deprecated.md` — para que el CRM reciba estos mensajes en realtime, usar Broadcast Changes (no postgres_changes)
