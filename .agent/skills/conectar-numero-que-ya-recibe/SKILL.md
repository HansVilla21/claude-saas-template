# Skill: Conectar un número que YA está recibiendo mensajes (sin que el bot conteste y sin perder lo que llegó)

## Cuándo usar esta skill

- Un cliente conectó su número de WhatsApp en el proveedor (YCloud, Meta) **antes** de que el CRM lo conociera, y los mensajes ya están llegando.
- El webhook guarda el evento crudo pero lo descarta con algo como `unknown_agency_for_phone`: **el cliente escribe, sus pacientes o clientes contestan, y el CRM no muestra nada.**
- El negocio todavía **no tiene el bot entrenado**, pero el equipo quiere empezar a usar el CRM ya.
- Sirve igual para cualquier alta de canal nuevo: los pasos 2 a 5 son el orden seguro aunque no se haya perdido nada.

## Por qué existe esta skill

Capturada el **2026-09-16** conectando el número de una clínica de estética. El número quedó conectado en el proveedor a las 14:34 y la fila del canal se cargó a las 16:35. En esas dos horas se descartaron **218 eventos**: 56 mensajes entrantes, 120 mensajes que la clínica mandó desde el celular (ecos de coexistencia) y 42 estados de entrega. No hubo un solo error visible: el webhook respondía 200 y guardaba el crudo con su motivo.

Tres cosas no obvias salieron en el camino:

1. **Cargar el canal ENCIENDE el bot.** En este sistema, un negocio sin `settings.bot_enabled` cuenta como prendido, en los dos motores. Si se carga el número primero, el bot contesta con la configuración genérica del panel a pacientes reales.
2. **Reprocesar deja la hora equivocada.** El mensaje se guarda con `created_at = now()` y la bandeja ordena por `created_at`: 2 horas de conversación aparecen todas "recién llegadas", mezcladas con lo que entra en vivo.
3. **Probar con UN evento no prueba el lote.** El primer evento reprocesado fue justo el que creó un dato corrupto (un lead con el número del propio negocio), y la prueba "pasó". Los 14 siguientes del mismo tipo fallaron.

## Proceso

### 1. Medir qué se perdió, sin leer el contenido

```sql
select w.event_type, w.processing_error, count(*) n,
  min(w.received_at) primero, max(w.received_at) ultimo
from webhook_events_raw w
where w.received_at > now() - interval '3 days'
  and w.raw_payload::text like '%<ultimos 8 dígitos del número>%'
group by 1, 2 order by n desc;
```

Esto dice desde cuándo llega tráfico, cuánto y de qué tipo. **No imprimir cuerpos de mensajes**: son datos de terceros (en una clínica, de salud).

### 2. Verificar el número contra el proveedor, no contra lo que dijeron

```js
// YCloud: número, WABA, estado y calidad
fetch('https://api.ycloud.com/v2/whatsapp/phoneNumbers?limit=100', { headers: { 'X-API-Key': KEY } })
// y los webhooks: son por CUENTA, no por número
fetch('https://api.ycloud.com/v2/webhookEndpoints?limit=50', { headers: { 'X-API-Key': KEY } })
```

Se exige `status: CONNECTED`. El `wabaId` y el `verifiedName` van al canal. Si los webhooks de la cuenta ya están activos, no hay nada que configurar del lado del proveedor.

### 3. Decidir qué motor lo atiende ANTES de cargar nada

Si el sistema tiene un proceso que lee cada mensaje con un modelo **aunque el bot esté apagado** (acá: el analista del motor nuevo), un negocio sin entrenar no debería estar en ese motor todavía. Son conversaciones reales que van a un tercero sin que el negocio haya configurado para qué. En el caso de la clínica se dejó en el motor viejo, donde con el bot apagado no corre nada, y se pasa al nuevo cuando se entrena el bot.

### 4. Apagar el bot y cargar el canal en UNA escritura

```sql
with agencia as (
  update agencies
  set settings = coalesce(settings, '{}'::jsonb) || '{"bot_enabled": false}'::jsonb
  where id = '<agency_id>'
    and not exists (select 1 from agency_channels
                    where channel = 'whatsapp'
                      and regexp_replace(coalesce(phone_number,''), '\D', '', 'g') = '<dígitos>')
  returning id
),
canal as (
  insert into agency_channels (agency_id, channel, provider, phone_number, display_name, is_active, provider_config)
  select id, 'whatsapp', 'ycloud', '+<dígitos>', '<Negocio> WhatsApp', true,
    jsonb_build_object('waba_id', '<waba>', 'verified_name', '<nombre verificado>')
  from agencia
  returning id
)
select (select count(*) from agencia) bot_apagado, (select count(*) from canal) canal;
```

`false` explícito, no ausencia: **los dos motores leen la ausencia como prendido**. El candado evita cargar dos veces el mismo número.

### 5. Confirmar con tráfico en vivo

Esperar el siguiente evento real y exigir las tres cosas: el crudo con `processing_error` nulo y `processed_at` puesto, el mensaje en `messages`, y el portón del bot registrando `skipped` (en el caso real, n8n dejó 6 turnos `skipped` y el bot no mandó nada).

### 6. Clasificar el lote ANTES de reprocesarlo

Agrupar los eventos perdidos por lo que puede romper, no solo por tipo:

```sql
select event_type,
  (m->>'from') = '<negocio>' from_es_negocio,
  (m->>'to')   = '<negocio>' to_es_negocio,
  m->>'type' tipo, count(*)
from (select event_type, coalesce(raw_payload->'whatsappMessage', raw_payload->'whatsappInboundMessage') m
      from webhook_events_raw where <filtro del paso 1>) x
group by 1,2,3,4;
```

Ese grupo `to_es_negocio = true` era el que rompía (ver gotchas). Si aparece algo raro, se arregla el webhook primero o se deja ese grupo afuera.

### 7. Reprocesar por el webhook REAL, firmado, en orden

Nada de insertar a mano: el webhook arma lead, conversación, reacciones, ediciones y archivo de medios. Se firma cada envío igual que el proveedor, con un timestamp nuevo:

```js
const cuerpo = JSON.stringify(evento.raw_payload);
const t = Math.floor(Date.now() / 1000);
const s = crypto.createHmac('sha256', WEBHOOK_SECRET).update(`${t}.${cuerpo}`).digest('hex');
await fetch(URL_DEL_WEBHOOK, { method: 'POST', body: cuerpo,
  headers: { 'Content-Type': 'application/json', 'ycloud-signature': `t=${t},s=${s}` } });
```

- **De a uno y por `received_at`:** el eco tiene que entrar antes que su estado de entrega.
- **Loguear solo metadatos** (tipo, HTTP, `processed`, motivo) a un `.jsonl`.
- **Mirar el log a los 20 eventos**, no al final: ahí aparecen los fallos sistemáticos.
- El reproceso crea filas crudas nuevas; las originales quedan con su motivo, como rastro.
- **El límite por contacto se respeta**, no se esquiva: si descartó mensajes la primera vez, que los vuelva a descartar. Cambiar el límite es otra decisión.
- Borrar el archivo con los eventos al terminar: tiene mensajes de terceros.

### 8. Devolverle a cada mensaje su hora real

Respaldo primero (ids + `created_at` + los campos derivados de cada conversación). Después, dos escrituras:

```sql
-- a) la hora del guardado pasa a ser la hora de envío, solo para lo reprocesado
update messages m set created_at = m.sent_at
where m.agency_id = '<agency_id>'
  and m.created_at >= '<inicio del reproceso>'
  and m.sent_at is not null
  and m.external_id in (<wamids de los eventos reprocesados>);

-- b) recalcular lo que el trigger de INSERT dejó con la hora del reproceso
--    last_message_at, last_message_preview, last_inbound_at, last_outbound_at
--    de cada conversación, y leads.last_message_at, desde las filas reales.
```

Antes de correr (a), **revisar qué triggers disparan con UPDATE**: acá el de campos derivados era solo `AFTER INSERT` y el `UPDATE` solo avisaba en vivo a la pantalla. `unread_count` no se toca: el reproceso lo dejó igual que si hubieran llegado a tiempo.

### 9. Verificar contra la base

- 0 mensajes con `abs(created_at - sent_at)` mayor a 2 minutos.
- 0 conversaciones cuyo `last_message_at` no sea el máximo real de sus mensajes.
- 0 mensajes del bot en el negocio.
- La cuenta de lo recuperado cuadra con el log: procesados + descartados con motivo = total.

## Gotchas

- **El eco al número del propio negocio.** La clínica mandaba fotos y videos con `to` igual a su propio número, cada uno con un `toUserId` distinto: 15 de 16 no aparecían en ningún otro evento (se parecen a los estados de WhatsApp) y uno sí era un contacto real. El handler buscaba el lead por `toUserId` y, si no existía, lo creaba con el teléfono `to`: **un lead con el número de la clínica**. Los siguientes chocaban contra el índice único del teléfono (`echo lead insert race unresolved`). Arreglo en el webhook: con destino igual al negocio, se usa el lead de ese `toUserId` si existe; si no, se descarta con motivo propio y **nunca se crea un lead con el número del negocio**. El lead falso se borró **después** de desplegar el arreglo: mientras existía, bloqueaba que se creara otro.
- **Un contacto borrado sigue en la bandeja.** Acá la bandeja no filtra `leads.deleted_at`, así que el borrado lógico no sacaba la conversación. Se borró de verdad, con candado (id + agencia + teléfono + 1 conversación + 1 mensaje), después de listar las FKs (conversaciones, mensajes, eventos y reacciones en cascada) y las **notificaciones que apuntan a la conversación sin FK**, que también se borraron.
- **El historial anterior no existe.** El proveedor no manda los chats de antes de conectar. Lo único viejo que entra son ecos (acá, desde un mes antes). Decírselo al cliente.
- **Un contacto que manda muchos mensajes seguidos** (acá, 33 en 11 minutos) choca con el límite por hora. Es la regla del sistema; si para ese rubro es baja, es otra discusión.
- **"Probar bot" con el bot apagado** puede responder "no configurado" en el motor viejo. Es esperable hasta que se entrene.

## Output esperado

1. Canal cargado con WABA y nombre verificado, bot apagado de forma explícita, motor elegido a propósito.
2. Tráfico en vivo entrando al CRM, verificado con un evento real.
3. Los eventos perdidos reprocesados por el camino real, con un log de metadatos y la cuenta cerrada.
4. Los mensajes recuperados con su hora real y las conversaciones con sus campos derivados correctos.
5. Lo que el lote destapó, arreglado en el webhook o anotado en el backlog.
6. Respaldos (horas, filas borradas) en un lugar temporal, y los archivos con contenido de terceros borrados.

## Ejemplo

**Input:** "El número de la clínica ya se conectó. Todavía no hay bot, pero que el sistema ya funcione."

**Output:** 218 eventos descartados detectados (desde 2 horas antes). Número verificado en el proveedor (`CONNECTED`, calidad verde). Bot apagado y canal cargado en una escritura; el negocio queda en el motor viejo hasta entrenarlo. Primer mensaje en vivo guardado, portón en `skipped`. Reproceso firmado de los 218: 51 entrantes, 105 ecos (3 reacciones y 1 edición) y 42 estados procesados; 15 ecos al propio número frenados por un bug que se arregló y desplegó; 3 descartados por el límite, igual que la primera vez; 2 reacciones a mensajes de antes de conectar. 151 mensajes con la hora corregida, 42 conversaciones recalculadas, 0 desalineadas, 0 mensajes del bot.

## Skills relacionadas

- `conexion-whatsapp-ycloud-supabase-n8n` — el montaje del canal desde cero.
- `onboarding-cliente-crm` — el alta completa de un cliente (el paso 6 es el número).
- `webhook-contar-event-types-antes-de-arreglar` — contar tipos antes de tocar el webhook.
- `probar-camino-produccion-sin-efectos-externos` — probar el camino real sin salir al mundo.
- `borrar-entidad-con-fk-no-action` — antes de borrar, mirar quién apunta.
- `bsp-media-expira-archivar-propio` — la media del proveedor vence a los 7 días: reprocesar antes.
