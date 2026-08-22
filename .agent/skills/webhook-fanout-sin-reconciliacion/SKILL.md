# Skill: El evento que llegó a un endpoint y no al otro — fan-out sin reconciliación

## Cuándo usar esta skill

- Un proveedor externo (BSP de WhatsApp, pasarela de pago, CRM, Stripe, Meta) entrega **el mismo evento a más de un endpoint tuyo**.
- Tenés una función que **persiste** y otra que **reacciona**, alimentadas por el mismo webhook.
- Alguien reporta un hueco: *"el bot contestó algo que en el sistema no existe"*, *"el cliente pagó y la orden no aparece"*.
- Vas a diseñar la ingesta de un webhook y estás por poner dos suscriptores al mismo evento.

## Por qué existe esta skill

Capturada el **2026-08-18** en el CRM de Momentum. El founder mandó **dos** fotos por WhatsApp (dos `messageId` distintos, no un reintento). El bot contestó las dos. En el CRM **solo existía una**.

La segunda llegó a n8n —que responde— y **nunca llegó a la Edge Function** que persiste: no está en `webhook_events_raw` y no hay invocación en los logs de esa función a esa hora. No se cayó nada, no hubo error, no hubo alerta.

**La causa es estructural, no un bug:**

```
                    ┌──→ [Edge Function]  → persiste en la base
[Proveedor] ──fan-out┤
                    └──→ [n8n]            → responde al lead
```

Los dos endpoints son **independientes**. El proveedor entrega a cada uno por su cuenta. **Si una entrega falla, no hay nadie que compare las dos ramas.** El resultado es un sistema que actúa sobre información que no registró: el bot contesta una foto que la base no vio, y el agente humano abre la conversación y encuentra un hueco.

> Dos suscriptores al mismo evento **no** son redundancia. Son dos formas independientes de perderse el evento.

Lo insidioso: el camino que **actúa** funcionó perfecto. Es el que **recuerda** el que falló. Nadie se entera hasta que una persona lee la conversación.

---

## El arreglo: el que actúa también rescata

La rama que reacciona hace un **INSERT idempotente** de lo que recibió. Cuando la otra llegó primero —el caso normal— no hace nada.

### Las tres propiedades que lo hacen seguro

**1. Idempotente por la llave natural del proveedor**

```sql
-- La constraint es la que hace el trabajo, no un SELECT previo
unique (agency_id, channel, external_id)
```

```sql
insert into messages (agency_id, channel, external_id, direction, sender_kind, status, ...)
values (...)
on conflict (agency_id, channel, external_id) do nothing;
```

Nunca `select ... if not exists ... insert`: entre el select y el insert entra la otra rama y duplicás. La unicidad la garantiza la base.

**2. EN PARALELO, nunca en serie**

El rescate cuelga **al lado** del camino principal, no dentro. Si el rescate falla, el bot responde igual.

```
[Mensaje] ──┬──→ [Get Conversation State] → [Router] → [Agente] → [Enviar]
            └──→ [Rescatar Inbound Faltante]        (rama muerta, no bloquea)
```

Ponerlo en serie convierte una red de seguridad en un punto de falla nuevo: el día que la base esté lenta, el bot deja de contestar por culpa de un rescate.

**3. `onError: continueRegularOutput`** para que un fallo del rescate no corte el flujo — **con la advertencia del apartado siguiente.**

---

## Los dos gotchas que te hacen creer que funciona

### "El nodo corrió" no es "el nodo escribió"

El nodo de rescate reportaba `executionStatus: success` y **no escribía nada**: el enum se llamaba `message_sender_kind`, no `sender_kind`, y el `onError: continueRegularOutput` —que es lo correcto para producción— convertía el error en **un ítem silencioso**.

El manejo de errores que necesitás en producción es exactamente el que esconde el bug en la prueba. **Verificá contando filas**, nunca leyendo el estado de la ejecución.

```sql
-- ¿Escribió? ¿Duplicó?
select external_id, count(*) from messages
where created_at > now() - interval '2 days'
group by external_id having count(*) > 1;
```

### Lo que el rescate NO cubre — decilo explícito

**Si el evento perdido es el PRIMER mensaje de un lead nuevo, el rescate no lo salva.** El lead no existe todavía y el flujo aborta antes, en el paso "¿existe el lead?". El rescate salva el mensaje de una conversación **ya conocida**; no crea entidades desde la rama que reacciona.

Escribirlo en el handoff y en el código. Una red de seguridad con un hueco no documentado es peor que ninguna: genera la confianza sin dar la cobertura.

---

## Antes de diseñar: contá cuántos endpoints hay de verdad

Antes de tocar nada, confirmá **quiénes reciben el evento**. En el caso real eran dos y el equipo hablaba como si fuera uno. Los webhooks suelen configurarse **por cuenta**, no por número/proyecto/canal — así que un endpoint dado de alta hace meses para otra cosa puede seguir recibiendo todo.

```sql
-- ¿Cuántos eventos vio el que persiste, por tipo y por hora?
select event_type, date_trunc('hour', created_at) h, count(*)
from webhook_events_raw
where created_at > now() - interval '1 day'
group by 1,2 order by 2 desc;
```

Si ese conteo no cuadra con lo que hizo el sistema, ahí está el hueco. Ver `webhook-contar-event-types-antes-de-arreglar`.

---

## Proceso

1. **Enumerar los endpoints** que el proveedor alimenta con el mismo evento (por cuenta, no por recurso).
2. **Decidir cuál es la fuente de verdad** (el que persiste) y cuál actúa.
3. **Agregar el rescate en la rama que actúa**: INSERT idempotente por la llave natural del proveedor, **en paralelo**.
4. **Garantizar la unicidad con una constraint**, no con un `select` previo.
5. **Verificar contando filas** (escribió) **y contando duplicados** (no duplicó), no por el status.
6. **Documentar el hueco** (el primer mensaje de una entidad nueva no se rescata).
7. Si el volumen lo justifica: un chequeo periódico que compare conteos entre las dos ramas y alerte la diferencia.

## Output esperado

- Un nodo/handler de rescate idempotente, en paralelo, con `onError` que no corte el camino principal.
- Constraint única sobre `(tenant, canal, external_id)`.
- Evidencia medida: el evento sintético que la rama persistente nunca vio **quedó en la base**, y **0 duplicados** en el tráfico real de los últimos días.
- El hueco conocido, escrito.

## Ejemplo

**Input:** "Mandé dos fotos, el bot contestó las dos, pero en el CRM solo aparece una."

**Output:** "No es un reintento: son dos `messageId` distintos. La segunda llegó a n8n y nunca a la Edge Function — no está en `webhook_events_raw` ni hay invocación en los logs a esa hora. Es fan-out del proveedor a dos endpoints independientes sin nadie que reconcilie. Agregué `Rescatar Inbound Faltante`: INSERT idempotente colgado en paralelo de `Get Conversation State`, con `on conflict do nothing` sobre `(agency_id, channel, external_id)`. Verificado: el mensaje sintético que la Edge nunca vio quedó en la base (`direction=inbound`, `sender_kind=lead`, `status=delivered`) y hay 0 `external_id` duplicados en los últimos 2 días, o sea que las ejecuciones normales pasan por el rescate y no duplican. **No cubre** el caso del primer mensaje de un lead nuevo: ahí el lead no existe y el flujo aborta antes."

## Skills relacionadas

`webhook-contar-event-types-antes-de-arreglar` (contar antes de tocar el webhook) · `ycloud-webhook-to-supabase` (la ingesta que persiste) · `probar-camino-produccion-sin-efectos-externos` (cómo verificar el rescate sin mandar nada) · `verificar-funcionamiento-end-to-end` (contar filas, no leer status) · `bsp-media-expira-archivar-propio` (el otro dato que se pierde en silencio).
