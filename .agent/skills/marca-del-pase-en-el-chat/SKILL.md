# Skill: El pase a una persona queda marcado en el chat (y se puede pasar varias veces)

## Cuándo usar esta skill

- Tenés un bot que **pasa la conversación a una persona** (handoff) y en la bandeja no se ve **cuándo** pasó ni **qué resumen** dejó para el equipo.
- `conversations` guarda los datos del pase en columnas (`handoff_at`, `handoff_reason`, `handoff_summary`) y por eso **solo existe el último**: el historial de pases no está en ningún lado.
- Querés que en el chat se vea quién **tomó** la conversación y quién **se la devolvió** al bot.
- El bot le dice al cliente *"dame un chance y lo reviso"*, **y a nadie le llega nada**. Pasa a partir del segundo pase de la misma conversación.

## Por qué existe esta skill

Capturada el **2026-09-15** en el CRM. Dos pedidos del founder el mismo día, que resultaron ser el mismo tema:

1. *"Que en el chat salga el momento en que se pasó la conversación a una persona, y el resumen."* El inbox mostraba el pase como un banner arriba **solo mientras estaba pendiente**. Una conversación que el bot pasó, recibió de vuelta y volvió a pasar **no dejaba rastro del primero**.
2. *"¿Una conversación se puede pasar varias veces?"* **No se podía, y fallaba en silencio.** Un cliente de fisioterapia recibe una alarma médica, contesta y le devuelve la conversación al bot. Más adelante el bot tiene que pasarla otra vez. El segundo pase **afectaba 0 filas**: el cliente final leía "dame un chance", la conversación seguía en manos del bot y al profesional no le llegaba nada.

## Parte 1 — Una tabla de eventos que llena la base

### 1. La tabla

```sql
create table if not exists public.conversation_events (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  kind text not null check (kind in ('handoff', 'taken', 'returned_to_bot')),
  reason text,           -- motivo del pase (solo handoff)
  summary text,          -- resumen para el equipo (solo handoff, y no siempre)
  actor_user_id uuid,    -- quién tomó o devolvió; null en un pase del bot
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists conversation_events_conv_time
  on public.conversation_events (conversation_id, occurred_at);
```

| `kind` | Qué pasó |
|---|---|
| `handoff` | el bot (o cualquier otro proceso) pasó la conversación: motivo + resumen |
| `taken` | **una persona** la tomó: el botón "Tomar" o escribirle al cliente (ver `escribir-toma-la-conversacion`) |
| `returned_to_bot` | **una persona** se la devolvió al bot |

### 2. Lectura calcada de la de mensajes, escritura cerrada

```sql
alter table public.conversation_events enable row level security;

-- La MISMA regla que la policy de SELECT de `messages`: quien ve el chat ve sus eventos.
create policy conversation_events_select on public.conversation_events
for select using (
  is_master() or exists (
    select 1 from public.conversations c
     where c.id = conversation_events.conversation_id
       and (
         has_agency_role(c.agency_id, array['owner','admin','viewer']::agency_role[])
         or (has_agency_role(c.agency_id, array['agent']::agency_role[])
             and (c.assigned_user_id = auth.uid() or c.assigned_user_id is null))
       )
  )
);

-- Nadie escribe desde afuera: solo el trigger.
revoke insert, update, delete on public.conversation_events from anon, authenticated;
```

Copiá la policy de mensajes **de la base viva**, no de la migración vieja (`rls-write-bloqueada-por-policy-desalineada`, 3d). Si los eventos tienen una regla distinta a la de los mensajes, un agente ve el chat sin sus marcas, o ve marcas de un chat que no puede abrir.

### 3. El trigger: un pase cuando cambia la hora; tomar y devolver solo con sesión

```sql
create or replace function public.tg_conversacion_registra_eventos()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
begin
  -- Un pase nuevo = cambió la hora del pase. Va PRIMERO y corta: el que escala
  -- pone handler='human' en el MISMO update, y eso no es "una persona la tomó".
  if new.handoff_at is not null
     and (tg_op = 'INSERT' or new.handoff_at is distinct from old.handoff_at) then
    insert into public.conversation_events
      (agency_id, conversation_id, kind, reason, summary, actor_user_id, occurred_at)
    values (new.agency_id, new.id, 'handoff', new.handoff_reason::text,
            nullif(btrim(coalesce(new.handoff_summary, '')), ''), null, new.handoff_at);
    return null;
  end if;

  -- Tomar y devolver: solo si hay una PERSONA con sesión.
  if tg_op <> 'UPDATE' or v_actor is null then
    return null;
  end if;

  if new.handler = 'human' and old.handler is distinct from 'human' then
    insert into public.conversation_events (agency_id, conversation_id, kind, actor_user_id)
    values (new.agency_id, new.id, 'taken', v_actor);
  elsif new.handler = 'bot' and old.handler = 'human' then
    insert into public.conversation_events (agency_id, conversation_id, kind, actor_user_id)
    values (new.agency_id, new.id, 'returned_to_bot', v_actor);
  end if;
  return null;
end;
$$;

revoke all on function public.tg_conversacion_registra_eventos() from public, anon, authenticated;

create trigger conversacion_registra_eventos
after insert or update of handler, handoff_at on public.conversations
for each row execute function public.tg_conversacion_registra_eventos();
```

Tres decisiones:

- **El pase se detecta por `handoff_at`, no por `handler`.** El `handler` se mueve por muchas razones. La hora del pase cambia solo cuando hay un pase.
- **Tomar y devolver exigen `auth.uid()` no nulo.** Los cambios del sistema **no dejan eventos**, a propósito: apagar el bot de un negocio o de un contacto mueve `handler` **en masa**. Con evento, un clic en el interruptor llenaría cientos de chats de "tomada" que nadie tomó.
- **`revoke … from public`**, no solo de anon y authenticated (`revocar-execute-incluye-public`).

**Por qué un trigger y no un insert en cada escritor:** en el CRM hay **tres escritores** que marcan un pase (la función de acciones del bot, n8n y el detector de descalificación) y **dos puertas** que toman una conversación. Un evento escrito desde cada uno sería el cuarto que se olvida. En la base pasan todos.

⚠️ `auth.uid()` lee el JWT de la request, así que sigue valiendo dentro de un trigger encadenado aunque sea SECURITY DEFINER. Y **vale `null` cuando el que escribe usa la service role**. Revisá con qué cliente escribe cada puerta: si una acción de persona pasa por la service role, **no deja chip**.

### 4. El respaldo: solo lo que ya estaba guardado

```sql
insert into public.conversation_events (agency_id, conversation_id, kind, reason, summary, occurred_at)
select c.agency_id, c.id, 'handoff', c.handoff_reason::text,
       nullif(btrim(coalesce(c.handoff_summary, '')), ''), c.handoff_at
  from public.conversations c
 where c.handoff_at is not null
   and not exists (
     select 1 from public.conversation_events e
      where e.conversation_id = c.id and e.kind = 'handoff' and e.occurred_at = c.handoff_at
   );
```

Se respalda **el último pase de cada conversación, con su hora real**: es un dato guardado. Los pases anteriores no quedaron en ningún lado y **no se reconstruyen**, porque eso sería fabricar un dato. Medido: **70 pases, 8 con resumen.** El flujo viejo de n8n nunca escribía el resumen, así que la tarjeta de resumen tiene que ser **opcional** en la UI.

## Parte 2 — Mostrarlo en el chat

### 5. Una función pura que intercala eventos y mensajes

```ts
/** El bot decide el pase ANTES de mandar sus burbujas (y las manda espaciadas),
 *  así que sin esto el marcador quedaba ARRIBA de la despedida del bot. */
export const VENTANA_BURBUJAS_DEL_PASE_MS = 2 * 60_000;
export const TOPE_EVENTOS = 200;

export function ubicarEventos(mensajes: Mensaje[], eventos: Evento[]): ElementoDelChat[] {
  const items: ElementoDelChat[] = mensajes.map((m) => ({ tipo: 'mensaje', mensaje: m, en: Date.parse(m.creadoEn) }));

  for (const e of eventos) {
    let en = Date.parse(e.ocurrioEn);
    if (e.tipo === 'handoff') {
      // El pase se corre hasta DESPUÉS de las burbujas del bot que salieron dentro de la ventana.
      const limite = en + VENTANA_BURBUJAS_DEL_PASE_MS;
      for (const m of mensajes) {
        const t = Date.parse(m.creadoEn);
        if (m.de === 'bot' && t >= en && t <= limite) en = Math.max(en, t);
      }
    }
    items.push({ tipo: 'evento', evento: e, en });
  }

  // Con la misma hora, el mensaje va primero: el evento se lee como consecuencia.
  return items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => a.it.en - b.it.en || (a.it.tipo === b.it.tipo ? a.i - b.i : a.it.tipo === 'mensaje' ? -1 : 1))
    .map(({ it }) => it);
}
```

**El gotcha que la función resuelve:** el `handoff_at` se escribe **antes** que la despedida del bot ("Dame un chance y lo reviso"). Ordenado solo por hora, el marcador "Pasó a una persona" aparece **arriba** del mensaje con el que el bot avisa que la pasó, y se lee al revés. El pase se corre hasta la última burbuja del bot dentro de la ventana y así **cierra** el tramo del bot en vez de interrumpirlo. Tomar y devolver quedan en su hora exacta.

Al ser pura se prueba sin montar nada: pase con burbujas después, pase sin burbujas, burbuja fuera de la ventana, empate de hora.

### 6. El hook: se vuelve a pedir cuando cambia lo que produce eventos

```ts
useEffect(() => {
  let vigente = true;
  supabase.from('conversation_events')
    .select('id, kind, reason, summary, actor_user_id, occurred_at')
    .eq('conversation_id', conversationId)
    .order('occurred_at', { ascending: true })
    .limit(TOPE_EVENTOS)
    .then(({ data, error }) => {
      if (!vigente) return;
      if (error) { console.error('[inbox] eventos', error.message); return; }  // sin eventos el chat funciona igual
      setEstado({ convId: conversationId, eventos: (data ?? []).map(aEvento).filter(Boolean) });
    });
  return () => { vigente = false; };
}, [supabase, conversationId, handler, handoffAt]);

// Al cambiar de conversación no se muestran los eventos de la anterior mientras carga.
return estado.convId === conversationId ? estado.eventos : [];
```

- **Sin canal de realtime propio.** Los eventos cambian cuando cambian `handler` o `handoff_at`, y esos dos campos **ya llegan** por realtime con la fila de la conversación. Ponerlos en las dependencias del efecto hace aparecer el evento en el mismo instante en que cambia la insignia del header.
- **Techo de 200** aunque sean pocos (una tabla que crece para siempre se pide con límite), **un error acá no rompe el chat** (los eventos son contexto; los mensajes son el producto), y **`aEvento` descarta** filas con un `kind` desconocido o una fecha ilegible en vez de dibujarlas raras.

### 7. Cómo se ve

- **Pase:** un separador **punteado** a lo ancho, centrado: *"Pasó a una persona · motivo · 14:32"*. Debajo, si hay resumen, una tarjeta *"Resumen para el equipo"* con el texto (`whitespace-pre-wrap break-words`). Va en **otro registro que las burbujas**, como el separador de día: no lo escribió nadie de la conversación, es el sistema contando qué pasó (`role="note"` + `aria-label`).
- **Tomar / devolver:** un chip chico y centrado: *"Ana tomó la conversación · 14:40"*, *"Ana se la devolvió al bot"*. Si el id no está entre los miembros cargados: *"Alguien del equipo"*.
- Mobile-first: `min-w-0` en los tramos del separador y `truncate` en el chip (`auditar-responsive-midiendo`). Verificado a **375 px** y a 1280 px, **con la sesión real del founder** en el panel del navegador. No se armaron páginas temporales con datos de ejemplo: la pantalla que importa es la que ve el equipo.

## Parte 3 — Varios pases en la misma conversación

### 8. El bug: un guard contra la doble escalada que bloquea la segunda

```ts
// El que escala (antes):
.update({ handler: 'human', handoff_status: 'pending', handoff_at: ahora, ... })
.eq('id', conversacionId)
.neq('handoff_status', 'pending')     // guard contra dos escaladas simultáneas
```

Y "Devolver al bot" hacía `handler = 'bot'` **sin tocar `handoff_status`**, que quedaba en `'pending'` si nadie había apretado "Marcar atendido". Resultado:

1. Primer pase → `pending`. Bien.
2. La persona devuelve la conversación → `handler = 'bot'`, **`handoff_status` sigue `pending`**.
3. Segundo pase → el guard filtra la fila → **0 filas** → responde `skipped: already_pending`. El bot ya le dijo al cliente que lo pasaba. **Nadie se entera.** Es `detectar-escritura-filtrada-rls` sin RLS: un filtro que no matchea no es un error, es un éxito con 0 filas.

### 9. El arreglo, en dos capas

**Capa 1 — la base: devolver al bot cierra el pase.** Para todos los que devuelven una conversación, no solo el botón:

```sql
create or replace function public.tg_conv_vuelve_al_bot_cierra_pase()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.handler = 'bot'
     and old.handler is distinct from 'bot'
     and new.handoff_status = 'pending' then
    new.handoff_status := 'handled';   -- alguien la tuvo y decidió devolverla: el pase se atendió
  end if;
  return new;
end;
$$;

create trigger conv_vuelve_al_bot_cierra_pase
before update of handler on public.conversations
for each row execute function public.tg_conv_vuelve_al_bot_cierra_pase();
```

⚠️ **El nombre del trigger no es decorativo.** Postgres ejecuta los triggers **del mismo evento** en **orden alfabético de nombre**. Ya existía un BEFORE `conv_handler_respeta_bot` que convierte `'bot'` en `'unassigned'` si el bot del negocio está apagado. Este tiene que correr **después**, para cerrar el pase solo si la conversación **quedó de verdad** en manos del bot. `conv_handler…` < `conv_vuelve…`: el orden sale del nombre. Dejá el porqué escrito en la migración, o el próximo que lo renombre "para que quede prolijo" rompe el orden sin un solo error. El orden real: `select tgname from pg_trigger where tgrelid = 'public.conversations'::regclass and not tgisinternal order by tgname;`

**Capa 2 — el guard: pendiente con el bot no bloquea.** El filtro pasa a `.or('handoff_status.neq.pending,handler.neq.human')`. Un pendiente **en manos de una persona** sigue bloqueando la doble escalada (el guard original). Un pendiente **con el bot** es un resto, y se escala igual. Es defensa en profundidad: si otro escritor deja ese estado, el pase no se pierde.

## Cómo se verifica

Con el **bloque que siempre aborta** (`probar-migracion-contra-base-viva-con-rollback`), contra la base viva. La prueba de los 3 pases se repitió **contra producción** después de aplicar.

| Prueba | Sin el arreglo | Con el arreglo |
|---|---|---|
| 3 pases con devoluciones en el medio | **1 pase**, 0 filas en el 2º y el 3º | **3 pases, 3 eventos** |
| guard: pendiente con el bot | — | escala (1 fila) |
| guard: pendiente con una persona | — | no escala (0 filas) |

Y para la tabla de eventos:

| Prueba | Esperado |
|---|---|
| un pase | 1 evento `handoff` con motivo y resumen |
| el sistema cambia `handler` sin sesión | **0 eventos** |
| una persona escribe (con el trigger de `escribir-toma-la-conversacion`) | 1 `taken` |
| una persona la devuelve | 1 `returned_to_bot` |
| RLS: la dueña del negocio / otra cuenta | 3 / **0** |
| `insert` como `authenticated` | **42501** |

## Output esperado

- Una migración con la tabla, la policy calcada, los revokes, el trigger AFTER y el respaldo; otra con el trigger BEFORE **nombrado por su orden**, con el porqué escrito.
- El guard del que escala con la condición `or`.
- `ubicarEventos` pura + sus pruebas, el hook con dependencias en `handler` y `handoffAt`, y el componente del marcador.
- La tabla de verificación de arriba, con los números.

## Ejemplo

**Input:** *"El bot pasó una alarma, la fisio contestó y se la devolvió al bot. Media hora después el bot le dijo al paciente que lo pasaba otra vez, y a ella no le llegó nada. Además no veo en el chat cuándo pasó."*

**Output:** el guard del que escala filtraba la fila porque el primer pase seguía `pending`. Con el trigger que cierra el pase al devolver, y el guard que ignora un pendiente que ya tiene el bot, los 3 pases de la prueba dan 3 filas y 3 eventos. En el chat queda, debajo de la despedida del bot:

```
─ ─ ─ ─  Pasó a una persona · Alarma médica · 10:14  ─ ─ ─ ─
[RESUMEN PARA EL EQUIPO] Dolor fuerte en la rodilla desde ayer, pide una cita
            (Ana tomó la conversación · 10:20)
            (Ana se la devolvió al bot · 10:31)
─ ─ ─ ─  Pasó a una persona · Listo para agendar · 10:58  ─ ─ ─ ─
```

## Skills relacionadas

`bot-handoff-system-end-to-end` (el sistema de pase completo; su regla "reactivar el bot = limpiar handler y pausa" es la hermana de "devolver cierra el pase") · `escribir-toma-la-conversacion` (la otra puerta que genera `taken`) · `bot-lee-pdf-del-cliente` (lo que hace útil el resumen del pase) · `detectar-escritura-filtrada-rls` (el mismo modo de fallo: 0 filas y éxito) · `probar-migracion-contra-base-viva-con-rollback` · `revocar-execute-incluye-public` · `aviso-derivado-que-se-apaga-solo` (derivar de la señal en vez de sincronizar dos verdades) · `auditar-responsive-midiendo`.
