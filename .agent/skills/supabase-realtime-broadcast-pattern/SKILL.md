# Skill: Supabase Realtime con Broadcast Changes (no postgres_changes)

## Cuándo usar esta skill

- Vas a implementar updates en tiempo real en un frontend (CRM, inbox, dashboard) desde una tabla de Postgres en Supabase.
- Tu primera idea fue usar `supabase.channel().on('postgres_changes', ...)` y el `SUBSCRIBED` llega pero los eventos NO.
- Estás migrando código viejo con `postgres_changes` que dejó de funcionar.
- Necesitás baja latencia (<1s) de DB → UI para mensajes nuevos, cambios de estado, etc.

## Por qué existe esta skill

`postgres_changes` está **deprecado en muchos tenants nuevos de Supabase** y va camino a deprecación total. El reemplazo es **Broadcast Changes**: el server publica eventos a un channel cuando un trigger lo dispara, y el cliente se suscribe a ese channel por broadcast (no por postgres_changes).

En Casa CRM (sesión anterior, ya en memoria del founder) descubrimos esto cuando el inbox no actualizaba en tiempo real. `subscribe()` retornaba `SUBSCRIBED` pero ningún evento llegaba al callback. Sin error, sin warning.

## Proceso

### 1. Asegurar Realtime habilitado para Broadcast en el proyecto

Esto ya viene activado por default en proyectos nuevos. Verificar en Dashboard → Database → Realtime → confirmar que está ON.

### 2. Crear un trigger Postgres que llama `realtime.send()`

```sql
-- Función disparadora
create or replace function public.broadcast_message_change()
returns trigger
language plpgsql
security definer
set search_path = public, realtime
as $$
declare
  payload jsonb;
  topic text;
begin
  -- topic per-conversation para que cada cliente solo reciba lo suyo
  topic := 'conv:' || coalesce(NEW.conversation_id, OLD.conversation_id)::text;

  payload := jsonb_build_object(
    'op', TG_OP,                           -- INSERT / UPDATE / DELETE
    'id', coalesce(NEW.id, OLD.id),
    'row', case when TG_OP = 'DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end
  );

  perform realtime.send(payload, 'messages_changed', topic, false);
  return coalesce(NEW, OLD);
end;
$$;

-- Trigger en la tabla messages
drop trigger if exists tg_broadcast_messages on public.messages;
create trigger tg_broadcast_messages
  after insert or update or delete on public.messages
  for each row
  execute function public.broadcast_message_change();
```

**Args de `realtime.send(payload, event, topic, private)`:**
- `payload` (jsonb) — lo que llega al cliente
- `event` (text) — nombre del evento, el cliente filtra por este
- `topic` (text) — canal lógico. El cliente se suscribe a este topic exacto
- `private` (bool) — `true` requiere auth via JWT (recomendado en prod), `false` es público

### 3. GRANTS necesarios

```sql
-- El rol authenticated debe poder ejecutar realtime.send en private channels
grant usage on schema realtime to authenticated;
grant execute on function realtime.send(jsonb, text, text, boolean) to authenticated, service_role;
```

**Gotcha:** sin GRANT USAGE en el schema custom (en este caso `realtime`), los INSERTs disparan errores `permission denied for schema realtime` y NO se publica nada. Memoria global del founder: `feedback_grant_schema_permissions.md`.

### 4. Cliente: suscribirse al topic exacto

```typescript
// crm/src/components/inbox/inbox-client.tsx (Casa CRM)
const channel = supabase.channel(`conv:${selectedConv.id}`, {
  config: { private: true },  // si configuraste private en el trigger
});

channel
  .on('broadcast', { event: 'messages_changed' }, (msg) => {
    const { op, row } = msg.payload;
    if (op === 'INSERT') {
      setMessagesByConv(prev => ({
        ...prev,
        [row.conversation_id]: [...(prev[row.conversation_id] || []), toInboxMessage(row)]
      }));
    } else if (op === 'UPDATE') {
      // ... reemplazar el row
    } else if (op === 'DELETE') {
      // ... filtrar el row
    }
  })
  .subscribe((status) => {
    console.log('channel status:', status); // debug
  });

return () => { supabase.removeChannel(channel); };
```

**Reglas:**
- El topic en el cliente debe ser **idéntico** al que pasaste a `realtime.send()` en el trigger.
- `{ event: 'messages_changed' }` debe matchear el `event` del trigger.
- Llamar `removeChannel(channel)` en cleanup del useEffect para evitar leaks.

### 5. Multi-tabla / multi-topic

Si necesitás updates de varias tablas en el mismo componente:
- Un trigger por tabla, cada uno publica a un topic distinto (`conv:<id>`, `lead:<id>`, `task:<id>`)
- El cliente se suscribe a UN channel por topic, pero puede tener múltiples handlers `on('broadcast', ...)` en el mismo channel si publican al mismo topic con events distintos.

### 6. Debug cuando no llegan eventos

1. **¿El trigger se ejecuta?** Hacer un INSERT manual en SQL Editor + ver si aparece en `select * from realtime.messages where event = 'messages_changed' order by inserted_at desc limit 5`. Si no aparece, el trigger no corre o falta GRANT.
2. **¿El cliente está suscrito al topic correcto?** Tipear mismatch ("conv:abc" vs "conv:abc-123") es lo más común. Loggear `console.log('subscribing to:', topic)` en el cliente.
3. **¿Estás usando `private: true` en cliente pero `false` en trigger (o viceversa)?** Tienen que coincidir.
4. **¿El JWT del cliente tiene los claims necesarios?** Para private channels, RLS puede filtrar.
5. **¿Tenés más de un client en la misma página?** Cada `supabase.channel(name)` con mismo name comparte canal — está bien — pero el cleanup mal hecho puede dejar sockets fantasma.

## Output esperado

1. Trigger Postgres en la tabla relevante que llama `realtime.send(payload, event, topic, private)`
2. GRANTS en schema realtime para los roles que insertan
3. Cliente suscrito al topic correcto con handler `on('broadcast', ...)`
4. Updates llegan a la UI en <1s después del INSERT/UPDATE/DELETE
5. Cleanup correcto (`removeChannel`) para no filtrar sockets

## Ejemplo concreto (Casa CRM, inbox en producción 2026-05-18+)

- Tabla `public.messages` con trigger `tg_broadcast_messages`
- Topic: `conv:<conversation_id>` per-conversación
- Event: `messages_changed`
- Private: `true` (RLS valida que el agente tiene acceso a esa conversation)
- Cliente: `crm/src/components/inbox/inbox-client.tsx` se suscribe al topic de la conv activa, agrega nuevos messages al state, actualiza unread_count.

Cuando descubrimos que `postgres_changes` no funcionaba (subscribe SUBSCRIBED pero 0 eventos), migramos el handler a `on('broadcast', ...)` + creamos el trigger + GRANT USAGE en schema realtime. En 30 min volvió a funcionar.

## Gotchas / antipattern

- **NO** usar `postgres_changes` en proyectos nuevos. Va a dejar de funcionar.
- **NO** olvidar `grant usage on schema realtime to <role>` si el role inserta filas. Es el bug #1 en este patrón.
- **NO** mismatch entre `private` del trigger y del cliente.
- **NO** topic con interpolación que pueda producir strings inesperados (`null::text`, etc.).
- **NO** olvidar `removeChannel` en cleanup — sockets fantasma matan performance.
- **NO** publicar `to_jsonb(NEW)` directo si la tabla tiene campos sensibles (passwords, tokens). Filtrar antes de armar el payload.
- **NO** manejar solo `UPDATE` en el dispatcher del cliente. **Tenés que manejar `INSERT` para agregar filas NUEVAS al estado**, no solo mapear las existentes. (Ver gotcha dedicado abajo — es el bug #2 de este patrón y el más fácil de pasar por alto.)

## Gotcha #2: el handler del cliente DEBE manejar INSERT, no solo UPDATE (entidades nuevas no aparecen en vivo)

**Síntoma:** El realtime funciona para cambios sobre filas que YA estaban en pantalla (un mensaje nuevo en una conversación existente, un cambio de estado), pero una **entidad NUEVA** (un contacto/lead que escribe por primera vez, una conversación nueva) **no aparece hasta recargar la página**. Subscribe da SUBSCRIBED, los eventos llegan, pero la entidad nueva no se renderiza.

**Causa raíz:** el dispatcher del cliente despacha por `payload.table` pero para algunas tablas solo implementa el caso `UPDATE` (un `.map()` sobre el estado existente). Un `.map()` NO agrega filas nuevas — si la fila no está en el array, se pierde. Y si esa entidad es un **padre del que depende el render de un hijo** (ej: la lista de conversaciones renderiza una conversación SOLO si encuentra su `lead` en el estado de leads), entonces aunque la conversación nueva sí se agregue, **no puede renderizar porque su lead nunca entró** → invisible hasta recargar (el fetch del server sí trae el lead).

**Caso real (Momentum AI CRM v2, 2026-05-28):** el inbox dejó de mostrar contactos nuevos en vivo. El handler de `leads` solo hacía `setLeads(prev => prev.map(...))` (caso UPDATE). Un lead nuevo (primer mensaje entrante de un número desconocido) nunca se agregaba → la conversación nueva quedaba sin lead → `leadById.get(leadId)` undefined → la tarjeta renderizaba `null`. El v1 SÍ manejaba el INSERT y por eso funcionaba; al portar a v2 se simplificó el handler y se perdió el caso. (Este es el "ya lo habíamos resuelto pero no quedó documentado".)

**Regla:** en el dispatcher, para CADA tabla que alimenta una lista, manejá explícitamente `payload.op`:
```typescript
case 'leads': {
  const l = payload.new as LeadRow;
  if (!l) break;
  if (payload.op === 'INSERT') {
    setLeads(prev => prev.some(x => x.id === l.id) ? prev : [...prev, toLead(l)]); // AGREGAR
  } else { // UPDATE
    setLeads(prev => prev.map(x => x.id === l.id ? toLead(l, { tags: x.tags }) : x)); // MAPEAR
  }
  break;
}
```
- **INSERT → agregar** (con guard de duplicado por id).
- **UPDATE → mapear** (preservando campos que no vienen en el payload, ej. tags).
- **DELETE → filtrar** (si la entidad puede borrarse).
- Para entidades **padre** (leads) de las que depende el render de **hijos** (conversations), el caso INSERT es OBLIGATORIO. El orden de llegada de los broadcasts (lead INSERT vs conversation INSERT) no importa: una vez ambos en estado, React re-renderiza y la fila aparece.

## Skills relacionadas

- `ycloud-webhook-to-supabase` — el origen de los INSERTs en `messages` que disparan el realtime
- `inbox-message-bubble-render` — el cliente que consume estos eventos
- `supabase-edge-function-secret-auth` (futura) — relacionado pero distinto (auth para edge functions, no realtime)

## Memoria global del founder (relacionada)

- `feedback_supabase_postgres_changes_deprecated.md` — el incidente real que motivó este patrón
- `feedback_grant_schema_permissions.md` — el GRANT USAGE / EXECUTE en schemas custom es crítico
