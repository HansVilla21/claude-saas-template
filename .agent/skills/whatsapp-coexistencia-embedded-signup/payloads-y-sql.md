# Referencia — payloads de Meta y SQL de la importación

Anexo de `SKILL.md`. Los payloads son los **ejemplos de la doc de Meta** (webhooks
reference: `history`, `smb_app_state_sync`, `account_update`; leídos el 2026-09-10)
y son los mismos que usan las pruebas del CRM (`pruebas-coexistencia.test.ts`).

## Sobre del webhook

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "<WABA_ID>",
    "changes": [{ "field": "history", "value": { "messaging_product": "whatsapp", "...": "..." } }]
  }]
}
```

`value.metadata` = `{ display_phone_number, phone_number_id }`. **No confiar en que
`display_phone_number` venga sin formato** ("+1 555-078-3881" pasa): la dirección de
los mensajes se decide primero contra el contacto del hilo.

## `history` — una tanda de chats

```json
{
  "metadata": { "display_phone_number": "15550783881", "phone_number_id": "106540352242922" },
  "history": [{
    "metadata": { "phase": 0, "chunk_order": 1, "progress": 55 },
    "threads": [{
      "id": "16505551234",
      "messages": [
        { "from": "15550783881", "id": "wamid.A", "timestamp": "1739230955", "type": "text",
          "text": { "body": "Here's the info you requested!" }, "history_context": { "status": "READ" } },
        { "from": "15550783881", "id": "wamid.B", "timestamp": "1739230970",
          "type": "media_placeholder", "history_context": { "status": "PLAYED" } },
        { "from": "16505551234", "id": "wamid.C", "timestamp": "1739230970", "type": "text",
          "text": { "body": "Thanks!" }, "history_context": { "status": "READ" } }
      ]
    }]
  }]
}
```

- `threads[].id` = teléfono del contacto. `from` = negocio → mensaje del negocio (eco).
- `phase` 0/1/2 = los tramos de antigüedad que manda Meta; `chunk_order` = orden de
  la tanda; `progress` 0–100. **Las tandas llegan desordenadas.** La última puede venir
  **vacía** (`threads: []`) con `progress: 100`: igual hay que procesarla.
- `media_placeholder` = había un archivo y no viene acá.
- Un solo webhook puede traer **miles** de mensajes.

### El negocio no quiso compartir

```json
{ "history": [{ "errors": [{
  "code": 2593109,
  "title": "History sync is turned off by the business from the WhatsApp Business App",
  "error_data": { "details": "History sharing is turned off by the business" }
}] }] }
```

### El archivo de un mensaje viejo (llega aparte, mismo `field: history`)

```json
{
  "metadata": { "...": "..." },
  "messages": [{
    "from": "16505551234", "id": "wamid.B", "timestamp": "1738796547", "type": "image",
    "image": { "caption": "Black Prince echeveria", "mime_type": "image/jpeg", "sha256": "…", "id": "24230790383178626" }
  }]
}
```

`messages[]` **plano** (sin `history[]`) = archivo de un mensaje ya importado; el
`id` es el wamid del placeholder. Solo llega para archivos de los últimos 14 días. Si
el `from` es el negocio, no se sabe a qué contacto fue → no se inventa uno.

## `smb_app_state_sync` — la agenda

```json
{
  "metadata": { "...": "..." },
  "state_sync": [
    { "type": "contact", "contact": { "full_name": "Pablo Morales", "first_name": "Pablo", "phone_number": "16505551234" },
      "action": "add", "metadata": { "timestamp": "1739321024" } },
    { "type": "contact", "contact": { "phone_number": "+506 8888-1234" }, "action": "remove",
      "metadata": { "timestamp": 1739321025 } }
  ]
}
```

Normalizar el teléfono a dígitos (6–15), ignorar `type` distinto de `contact` y los
que no traen teléfono, deduplicar por teléfono. `timestamp` viene como string **o**
número.

## `account_update`

```json
{ "event": "PARTNER_REMOVED",
  "waba_info": { "waba_id": "980198427658004", "owner_business_id": "…" },
  "disconnection_info": { "reason": "PRIMARY_INACTIVITY", "initiated_by": "SYSTEM" } }
```
```json
{ "event": "PARTNER_REMOVED", "phone_number": "15550783881" }
```

Sin `waba_info`, la cuenta es el `entry[].id`. Eventos que importan:
`PARTNER_REMOVED`, `ACCOUNT_OFFBOARDED`, `ACCOUNT_RECONNECTED`; el resto se ignora
**con nombre** (`cuenta_<EVENTO>`), nunca en silencio. Se anota, no se desactiva.

## Pedir la sincronización

```http
POST https://graph.facebook.com/<versión>/<PHONE_NUMBER_ID>/smb_app_data
Authorization: Bearer <token del negocio>
Content-Type: application/json

{ "messaging_product": "whatsapp", "sync_type": "smb_app_state_sync" }   ← primero
{ "messaging_product": "whatsapp", "sync_type": "history" }              ← después
```

Responde `{ "request_id": "…" }`. Una vez por tipo, dentro de las 24 h de conectar.

## Saber si el número es de coexistencia

```http
GET /<PHONE_NUMBER_ID>?fields=is_on_biz_app,platform_type
→ { "is_on_biz_app": true, "platform_type": "CLOUD_API" }      ← coexistencia terminada

GET /<WABA_ID>/phone_numbers?fields=id,is_on_biz_app          ← cuando el navegador no mandó el número
```

## SQL — el `if` de los triggers

```sql
create or replace function public.denorm_conversation_on_message()
 returns trigger language plpgsql as $function$
begin
    -- La importación de chats viejos arma la conversación ella misma.
    if coalesce(current_setting('app.importando_historial', true), '') = 'on' then
        return new;
    end if;
    -- … el cuerpo de SIEMPRE, copiado de la base viva (no de la migración vieja)
end $function$;
```

`current_setting(..., true)` = no falla si la variable no existe. En un trigger que
filtra por dirección, el `if` va **después** de ese filtro; en uno genérico
(`broadcast_agency_change`) solo cuando `tg_table_name = 'messages'`.

## SQL — la RPC de importación (resumida a lo esencial)

```sql
create or replace function public.importar_historial_whatsapp(
    p_agency_id uuid, p_lead_id uuid, p_handler public.conversation_handler, p_mensajes jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_conv uuid; v_creada boolean := false; v_ids text[]; v_ins int; v_in int;
        v_min timestamptz; v_max timestamptz; v_max_in timestamptz; v_preview text; v_medias jsonb;
begin
    perform set_config('app.importando_historial', 'on', true);   -- local a la transacción

    if jsonb_typeof(p_mensajes) is distinct from 'array' then raise exception 'p_mensajes tiene que ser un arreglo'; end if;
    if not exists (select 1 from leads where id = p_lead_id and agency_id = p_agency_id) then
        raise exception 'el contacto % no es de la agencia %', p_lead_id, p_agency_id;
    end if;

    -- conversación: buscar, o crear marcada; si otra entrega la creó en el medio, releer
    select id into v_conv from conversations where agency_id = p_agency_id and lead_id = p_lead_id and channel = 'whatsapp';
    if v_conv is null then
        insert into conversations (agency_id, lead_id, channel, handler, extra)
        values (p_agency_id, p_lead_id, 'whatsapp', p_handler, jsonb_build_object('historial_whatsapp', true))
        on conflict (agency_id, lead_id, channel) do nothing returning id into v_conv;
        if v_conv is null then select id into v_conv from conversations where … ; else v_creada := true; end if;
    end if;

    select array_agg(m.external_id) into v_ids from jsonb_to_recordset(p_mensajes) as m(external_id text) where m.external_id is not null;

    with filas as (
        select distinct on (m.external_id) m.*
          from jsonb_to_recordset(p_mensajes) as m(external_id text, direction message_direction, kind message_kind,
               body text, media_mime text, media_metadata jsonb, status message_status, created_at timestamptz, cita text)
         where m.external_id is not null and m.created_at is not null
         order by m.external_id
    ), ins as (
        insert into messages (agency_id, conversation_id, lead_id, channel, direction, sender_kind, kind, body,
                              media_mime, media_metadata, external_id, wa_message_id, status, sent_at, created_at,
                              sent_via, is_bot_generated)
        select p_agency_id, v_conv, p_lead_id, 'whatsapp', f.direction,
               case when f.direction = 'inbound' then 'lead' else 'agent' end::message_sender_kind,
               f.kind, f.body, f.media_mime,
               case when f.cita is not null then coalesce(f.media_metadata, '{}') || jsonb_build_object('cita_pendiente', f.cita)
                    else f.media_metadata end,
               f.external_id, f.external_id, f.status, f.created_at, f.created_at,
               case when f.direction = 'outbound' then 'coexistence' end, false
          from filas f
        on conflict (agency_id, channel, external_id) do nothing
        returning id, external_id, direction, kind, body, created_at, media_metadata
    )
    select count(*), count(*) filter (where direction = 'inbound'), min(created_at), max(created_at),
           max(created_at) filter (where direction = 'inbound'),
           (array_agg(left(coalesce(body, '[' || kind::text || ']'), 200) order by created_at desc))[1],
           coalesce(jsonb_agg(jsonb_build_object('id', id, 'external_id', external_id))
                    filter (where media_metadata ? 'meta_media_id'), '[]')
      into v_ins, v_in, v_min, v_max, v_max_in, v_preview, v_medias from ins;

    -- citas pendientes de TODA la conversación, antes del return temprano
    update messages m set reply_to_message_id = q.id,
           media_metadata = nullif(m.media_metadata - 'cita_pendiente', '{}')
      from messages q
     where m.conversation_id = v_conv and m.media_metadata ? 'cita_pendiente'
       and q.agency_id = p_agency_id and q.channel = 'whatsapp' and q.external_id = m.media_metadata ->> 'cita_pendiente';

    if v_ins = 0 then return jsonb_build_object('conversation_id', v_conv, 'creada', v_creada, 'insertados', 0, 'medias', '[]'); end if;

    update conversations c set
        last_message_preview = case when c.last_message_at is null or v_max >= c.last_message_at then v_preview else c.last_message_preview end,
        last_message_at = greatest(c.last_message_at, v_max),       -- nunca para atrás
        inbound_count   = c.inbound_count + v_in,                    -- unread_count NO
        updated_at      = now()                                      -- last_inbound_at / last_outbound_at NO
     where c.id = v_conv;

    -- contacto nacido de la importación (o creado en vivo después de un mensaje viejo suyo)
    update leads set extra = extra || jsonb_build_object('historial_whatsapp', true)
     where id = p_lead_id and not (extra ? 'historial_whatsapp')
       and (extra ->> 'primer_mensaje' = any (v_ids) or (source_detail = 'meta' and created_at > v_min));

    update leads l set
        last_message_at  = greatest(l.last_message_at, v_max),
        last_contact_at  = greatest(l.last_contact_at, v_max_in),
        first_contact_at = case when l.extra ? 'historial_whatsapp' then least(l.first_contact_at, v_min) else l.first_contact_at end,
        created_at       = case when l.extra ? 'historial_whatsapp' then least(l.created_at, v_min) else l.created_at end
     where l.id = p_lead_id;

    return jsonb_build_object('conversation_id', v_conv, 'creada', v_creada, 'insertados', v_ins, 'medias', v_medias);
end $$;

revoke all on function public.importar_historial_whatsapp(uuid, uuid, public.conversation_handler, jsonb) from public, anon, authenticated;
grant execute on function public.importar_historial_whatsapp(uuid, uuid, public.conversation_handler, jsonb) to service_role;
```

La versión completa y comentada vive en el CRM:
`crm-v2/supabase/migrations/0091_historial_whatsapp_coexistencia.sql`.

## Llamarla desde el webhook

```ts
const MENSAJES_POR_LLAMADA = 500;   // un chat de meses no entra en una sola llamada
const HILOS_EN_PARALELO = 5;        // cada hilo son 2–5 consultas en fila

let insertados = 0;
for (let i = 0; i < hilo.mensajes.length; i += MENSAJES_POR_LLAMADA) {
  const tanda = hilo.mensajes.slice(i, i + MENSAJES_POR_LLAMADA);
  const { data, error } = await sb.rpc('importar_historial_whatsapp', {
    p_agency_id: agencyId, p_lead_id: leadId, p_handler: handler, p_mensajes: tanda.map(filaParaLaBase),
  });
  if (error) throw new ErrorDeBase('importar historial', error);   // Meta reintenta; todo es idempotente
  insertados += (data as { insertados: number }).insertados;
}
```

Y en el que suma varios hilos en paralelo: `const n = await importarHilo(…);
total += n;` — nunca `total += await importarHilo(…)` (lee `total` antes del await).

## Plantilla del bloque de prueba que siempre aborta

```sql
do $$
declare r text := '';
begin
    -- 1. pegar acá la migración entera (DDL transaccional)
    -- 2. armar datos de prueba en una agencia de prueba
    -- 3. llamar la RPC y medir: notificaciones, realtime, unread, fechas
    r := r || format('notifs=%s unread=%s ', (select count(*) from notifications where …), (select unread_count from conversations where …));
    -- 4. CONTROL NEGATIVO: apagar la marca y comprobar que el camino en vivo SÍ notifica
    perform set_config('app.importando_historial', '', true);
    insert into messages … ;
    r := r || format('vivo_notifs=%s ', (select count(*) from notifications where …));
    raise exception 'REPORTE: %', r;   -- siempre aborta: nada persiste
end $$;
```

Detalle en la skill `probar-migracion-contra-base-viva-con-rollback`.
