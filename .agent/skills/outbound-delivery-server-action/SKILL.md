# Skill: Entrega Outbound del Agente vía Server Action (CRM + YCloud)

## Cuándo usar esta skill

- Hacer que un mensaje escrito por un AGENTE HUMANO desde el inbox de un CRM (Next.js) se entregue de verdad al canal (WhatsApp/YCloud), no solo se guarde en la DB.
- Diagnosticar el bug "el mensaje aparece en la plataforma pero no llega al WhatsApp".
- Decidir entre **server action** (recomendado) vs edge-function + trigger DB para la entrega outbound.

## Por qué existe esta skill

El composer del inbox muchas veces inserta el mensaje con `status:'sent'` **sin enviar nada** — miente. La UI dice "enviado" pero el cliente nunca lo recibe. La entrega del BOT suele ir por otro lado (n8n manda directo a YCloud), así que el agujero es solo la entrega del **agente humano**.

**Decisión de arquitectura (clave):** para el outbound del agente, un **server action** de Next.js gana sobre el edge-function + trigger:
- El bot ya manda por su cuenta (n8n) → un trigger centralizado sobre `messages` solo agregaría `pg_net`, riesgo de loops, y un deploy extra para servir ÚNICAMENTE al composer.
- El server action es síncrono (reconcilia el status al toque), se debuggea en los logs de Next, y reusa la referencia probada del v1.

## Proceso

### 1. Composer: insertar con `status:'queued'` (no `'sent'`) y disparar la action

```typescript
// inbox-client.tsx — handleSend
const { data } = await supabase.from('messages').insert({
  agency_id, conversation_id, lead_id, channel,
  direction: 'outbound', sender_kind: 'agent', sender_user_id: currentUserId,
  kind: 'text', body, status: 'queued', is_bot_generated: false,
}).select('...').single();
// optimista en UI; luego:
void sendMessageViaYCloud(data.id).then((res) => {
  patchLocalStatus(data.id, res.ok ? 'sent' : 'failed'); // burbuja: doble-check o "no enviado"
});
```

### 2. Server action: ownership (user) → lookup (admin) → POST → reconciliar

```typescript
'use server';
export async function sendMessageViaYCloud(messageId): Promise<{ok, error?}> {
  const supabase = await createClient();              // user-bound
  const { data:{ user } } = await supabase.auth.getUser();
  if (!user) return { ok:false, error:'not_authenticated' };

  // 1) Ownership vía RLS: si el message no es de su agency, no hay fila.
  const { data: msg } = await supabase.from('messages')
    .select('id, agency_id, channel, lead_id, kind, body, status').eq('id', messageId).maybeSingle();
  if (!msg) return { ok:false, error:'message_not_found' };
  if (msg.status !== 'queued') return { ok:true };     // idempotente

  const admin = createAdminClient();                   // service_role, ya probado ownership
  // 2) destinatario (leads.phone) + emisor (agency_channels.phone_number) → E.164
  const to = toE164(lead.phone), from = toE164(channel.phone_number);
  const apiKey = process.env.YCLOUD_API_KEY;
  if (!apiKey) { await markFailed(messageId,'ycloud_api_key_missing','...'); return {ok:false,...}; }

  // 3) POST a YCloud
  const r = await fetch('https://api.ycloud.com/v2/whatsapp/messages/sendDirectly', {
    method:'POST', headers:{ 'X-API-Key':apiKey, 'Content-Type':'application/json' },
    body: JSON.stringify({ from, to, type:'text', text:{ body: msg.body } }),
  });
  // 4) reconciliar (ver gotcha external_id)
}
```

`toE164`: en v2 el teléfono se guarda como dígitos → `+${digits}` (YCloud espera E.164 con `+`).

### 3. Reconciliación por `external_id` (CRÍTICO — evita duplicado)

La webhook de status (`whatsapp.message.updated`) busca el mensaje por `external_id = wamid` (la UNIQUE `(agency_id, channel, external_id)`). Si NO seteás `external_id` al enviar, la webhook no encuentra la fila y **inserta un backfill outbound DUPLICADO** (marcado como bot). Por eso, al recibir 2xx:

```typescript
const wamid = parsed?.wamid ?? null;
const base = { status:'sent', sent_at:nowIso, wa_message_id:wamid };
if (wamid) {
  const { error } = await admin.from('messages').update({ ...base, external_id:wamid }).eq('id', messageId);
  if (error?.code === '23505')  // race: la webhook ya insertó con ese wamid
    await admin.from('messages').update(base).eq('id', messageId); // marcar sent sin external_id
} else {
  await admin.from('messages').update(base).eq('id', messageId);
}
```

### 4. Verificar entrega REAL (no solo 2xx)

`2xx` de YCloud = "lo acepté", no "llegó". Confirmá `delivered` consultando la DB (la webhook de status sube `delivered_at`/`read_at`) o un script `pg` contra el proyecto real. Ojo: el MCP de Supabase puede apuntar a otro proyecto — confiá en `.env`/scripts, no en el MCP.

## Output esperado

1. Composer inserta `status:'queued'`; la burbuja muestra check simple → doble-check ("enviado") → o "no enviado" (failed).
2. Server action que entrega a YCloud y reconcilia `status` + `external_id=wamid` + `wa_message_id`.
3. La webhook de status sube a `delivered`/`read` SIN duplicar (porque `external_id` ya matchea).
4. Si falta `YCLOUD_API_KEY` u otra precondición → `status='failed'` con `error_code` (no crash, no mentira).

## Ejemplo concreto (Momentum CRM v2, funcionando 2026-05-29)

Mensaje "Prueba de entrega outbound ✅" desde el inbox → `queued` → `sendMessageViaYCloud` → YCloud 2xx (wamid) → `external_id` seteado → la webhook `whatsapp.message.updated` reconcilió a `delivered` 2s después (sin duplicar). Verificado por `pg` contra `fahujscodhqlopycorzn`.

## Gotchas / antipattern

- **NO insertar `status:'sent'` en el composer sin enviar.** Es la mentira que origina el bug.
- **NO omitir `external_id=wamid`** en la reconciliación → la webhook duplica el outbound como bot.
- **NO usar edge-function + trigger** para el outbound del agente si el bot ya manda por n8n: sobre-ingeniería (pg_net, loops, deploy extra).
- **NO leer la API key con el cliente user-bound** ni exponerla al browser — vive en `process.env` del server (Next).
- **Ventana de 24h de WhatsApp:** fuera de 24h del último inbound del cliente, solo se pueden mandar templates aprobados; el texto libre falla (error de re-engagement). El `markFailed` lo deja visible.
- **NO confiar en el MCP de Supabase** para verificar — puede apuntar a otro proyecto; usá `.env` + script `pg`.

## Skills relacionadas

- `whatsapp-image-delivery-ycloud` — envío de media (mismo BSP, otros gotchas).
- `ycloud-webhook-to-supabase` — la edge function que recibe inbound + status updates.
- `supabase-realtime-broadcast-pattern` — para que la burbuja reaccione al cambio de status en vivo.
- `inbox-message-bubble-render` — render de estados queued/sent/delivered/failed.

## Memoria global del founder (relacionada)

- `diff-against-working-source-when-porting` — el v1 es la referencia probada; portar, no reinventar.
- `feedback_supabase_postgres_changes_deprecated` — realtime por Broadcast Changes.
