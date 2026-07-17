# Skill: Fuente única de verdad — derivar, no sincronizar dos columnas

## Cuándo usar esta skill

- Dos vistas muestran "lo mismo" (asignado, estado, owner, contador) pero **leen columnas distintas** y empiezan a divergir.
- Tenés un dato que vive lógicamente en el "padre" (lead, cuenta, proyecto) pero cuya verdad real la generan los "hijos" (conversaciones, mensajes, items).
- Estás por **mantener dos columnas en sync** con triggers, app code de doble escritura, o un backfill periódico → señal de alerta.
- El bug es del tipo "en la vista A dice X y en la vista B dice Y para el mismo registro", o "los counts no cuadran entre dos pantallas".

## Por qué existe esta skill

En Casa CRM (Momentum, Misión 6) la asignación de un contacto se guardaba en **dos columnas**:
- `conversations.assigned_user_id` — el encargado actual de la conversación. Lo escribía el inbox al responder/tomar/reasignar.
- `leads.assigned_user_id` — el dueño histórico del lead. Lo escribía SOLO el dropdown de Contactos.

El inbox leía una, Contactos la otra. Responder en el inbox asignaba la conversación pero **nunca** tocaba el lead → el inbox mostraba "Pietro" y Contactos "Sin asignar", y los counts no cuadraban. La verificación en la base real lo confirmó: de 24 leads con conversación, 2 divergían (ambos "conv asignada / lead null").

La trampa tentadora es **sincronizar las dos columnas** (trigger bidireccional + backfill). Es frágil: dos sitios de escritura por columna, riesgo de loops, drift garantizado con el tiempo. La solución correcta es elegir **UNA** columna como fuente de verdad y **derivar** el valor de la otra vista desde las filas hijas — sin migración, sin trigger, sin backfill.

## El patrón

### 1. Diagnosticar el doble-columna

Mapeá, para el dato en disputa, **quién lee y quién escribe cada columna**. Si hay 2 columnas con read/write sites cruzados entre vistas, ese es el origen del drift.

```
Inbox       → lee/escribe  conversations.assigned_user_id   (3 write-sites)
Contactos   → lee/escribe  leads.assigned_user_id           (1 write-site)
```

### 2. Elegir la fuente de verdad (la que ya se mantiene "viva")

Regla: la columna que escriben MÁS sitios y que refleja el estado ACTUAL gana. En el CRM la decisión del founder fue explícita: *"asignado = quien la tiene AHORA"* = la conversación. La otra columna (`leads.assigned_user_id`) pasa a **fallback** para registros sin hijos (contactos sin conversación, creados a mano).

### 3. Derivar en la otra vista desde las filas hijas

La vista que leía la columna "muerta" ahora **agrega** el dato de los hijos, igual que ya agrega otros (inbound_count, unread, handoff). Definí una regla determinística para el "hijo primario" (ej: la conversación de `last_message_at` más reciente).

```ts
// En el server de la lista (page.tsx): agregar la conv primaria por lead.
const becomesPrimary =
  !hasPrimary || (!!c.last_message_at && (!primaryAt || c.last_message_at > primaryAt));
agg.assignedUserId = becomesPrimary ? c.assigned_user_id : prev.assignedUserId;
agg.primaryConvId  = becomesPrimary ? c.id : prev.primaryConvId;

// En el mapper del view-model: derivar, con fallback al padre si no hay hijo.
assignedUserId: agg.primaryConvId ? agg.assignedUserId : row.assigned_user_id,
primaryConvId:  agg.primaryConvId,   // necesario para repuntar el WRITE (paso 4)
```

### 4. Repuntar TODOS los writes de esa vista a la fuente de verdad

El control de edición de la vista derivada (dropdown "Asignar") debe escribir sobre el **hijo primario**, no sobre la columna fallback. Por eso el view-model lleva el `primaryConvId`. Si no hay hijo, recién ahí escribís el fallback.

```ts
const { error } = lead.primaryConvId
  ? await supabase.from('conversations')
      .update({ assigned_user_id: userId, assigned_set_by: 'human', /* procedencia */ })
      .eq('id', lead.primaryConvId)
  : await supabase.from('leads').update({ assigned_user_id: userId }).eq('id', leadId);
```

### 5. Patchear el realtime de la vista derivada

El broadcast del hijo (UPDATE de conversations) tiene que actualizar el dato derivado en vivo. Patcheá solo si es el hijo primario. Y cuidá que un UPDATE del padre **no pise** el dato derivado con la columna vieja (pasá el valor derivado en el merge).

```ts
// case 'conversations': patch solo si es la conv primaria (o el lead no tenía una).
const isPrimary = !l.primaryConvId || l.primaryConvId === conv.id;
assignedUserId: isPrimary && conv.id ? conv.assigned_user_id ?? null : l.assignedUserId,

// case 'leads' (UPDATE): preservar el derivado, NO recalcular desde row.assigned_user_id.
agg: { ...prev, assignedUserId: existing.assignedUserId, primaryConvId: existing.primaryConvId }
```

## Output esperado

1. **Una sola columna** es la fuente de verdad; la otra queda como fallback documentado.
2. La vista que divergía **deriva** el dato de las filas hijas (server + view-model mapper).
3. **Todos** los writes de esa vista apuntan a la fuente de verdad (con su `primaryChildId` en el view-model para saberlo).
4. Realtime patcheado en ambos sentidos (UPDATE del hijo patchea el derivado; UPDATE del padre no lo pisa).
5. **Cero** migración, trigger o backfill. Todo en la capa app.
6. Verificación contra la base real: contar cuántos registros divergían ANTES (prueba el bug) y confirmar que la derivación produce el valor de la vista-verdad.

## Ejemplo concreto (Casa CRM, Misión 6, 2026-06-14)

- Server lista: [crm-v2/src/app/a/[slug]/leads/page.tsx](crm-v2/src/app/a/[slug]/leads/page.tsx) — agg de la conv primaria.
- Server ficha: [crm-v2/src/app/a/[slug]/leads/[id]/page.tsx](crm-v2/src/app/a/[slug]/leads/[id]/page.tsx).
- View-model + mapper: [crm-v2/src/lib/contactos/types.ts](crm-v2/src/lib/contactos/types.ts) — `assignedUserId` derivado + `primaryConvId`.
- Writes repuntados: [crm-v2/src/components/contactos/use-contact-edit.ts](crm-v2/src/components/contactos/use-contact-edit.ts) y [contact-detail-client.tsx](crm-v2/src/components/contactos/detail/contact-detail-client.tsx).
- Realtime: [crm-v2/src/components/contactos/use-contactos-realtime.ts](crm-v2/src/components/contactos/use-contactos-realtime.ts).
- Verificación en la base (Supabase MCP): `SELECT distinct on (lead_id) ... order by lead_id, last_message_at desc` → 2/24 divergían, ambos "conv asignada / lead null". Con el fix, Contactos muestra el encargado de la conversación. PR #38.

## Gotchas / antipattern

- **NO** sincronizar dos columnas con triggers bidireccionales + backfill. Es frágil y el drift vuelve. Elegí una verdad y derivá.
- **NO** olvidar repuntar el WRITE de la vista derivada. Si solo cambiás el READ, el dropdown "asigna" pero el cambio no pega (lee de otro lado) → regresión nueva.
- **NO** derivar a `null` cuando hay un estado intermedio (ej. "lo maneja el bot") si eso descuadra un COUNT con la otra vista. En el CRM, la conv asignada-pero-bot **sigue** mostrando el encargado (mismo valor que el inbox) para que los counts "Sin asignar" cuadren (A2); el filtro "Míos" la excluye aparte (`handler !== 'bot'`). Separá "valor mostrado" de "filtro".
- **NO** recalcular el derivado desde la columna del padre en el merge de realtime del padre → pisarías el valor bueno con el viejo. Pasá el derivado explícito en el `agg`.
- **NO** asumir 1 hijo por padre sin una regla de "primario". Si puede haber varios (multi-canal), definí cuál manda (más reciente) y dejalo escrito; documentá el edge multi-hijo.
- **OJO** con los contadores per-padre vs per-hijo: la lista de Contactos cuenta leads; el inbox cuenta conversaciones. Cuadran con 1 conv/lead; con multi-conv pueden diferir (es inherente a la granularidad, no un bug a tapar).
- **SIEMPRE** verificá contra la base real cuántos registros divergían: prueba que el bug existía y que el fix lo cierra (regla `verificar-funcionamiento-end-to-end`).

## Skills relacionadas

- `verificar-funcionamiento-end-to-end` — la verificación contra la base que cierra el loop.
- `supabase-realtime-broadcast-pattern` — el canal por agency que hay que patchear en el paso 5.
- `crm-inbox-conv-list-filters-strip` — la otra mitad del inbox donde vive el filtro "Míos".
- `crm-contact-detail-tabs` — la ficha de detalle que también deriva el dato (paso 3/4).
