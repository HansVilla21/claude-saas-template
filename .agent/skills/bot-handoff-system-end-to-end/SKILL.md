# Skill: Bot → Agent Handoff System (end-to-end)

## Cuándo usar esta skill

- El bot conversacional (n8n + LLM) atiende leads pero hay momentos donde debe pasar la conversación a un agente humano: lead calificado, quiere agendar visita, objeción compleja, bot "atascado", o el agente toma la conversación manualmente.
- Querés que el CRM "grite" multi-canal cuando hay un handoff pendiente, no que se entere por una notif de Telegram fácil de perder.
- Necesitás auto-crear una tarea con prioridad alta + SLA cuando dispara el handoff.
- Cuando el agente toma la conversación, querés auto-marcar handled (un click menos).

## Por qué existe esta skill

El handoff es el punto más caro del flow: lead calificado perdido = comisión perdida ($5K-15K en inmobiliaria, equivalente en otros verticales). Sin sistema cohesivo, pasa esto:
- El bot detecta lead caliente y manda notif a Telegram
- El agente está concentrado, no ve la notif
- El lead espera 2 horas, pierde interés, fin

Casa CRM (sesión 2026-05-20) implementó el patrón completo: bot apaga, CRM grita por 4 canales, auto-task con SLA 30min, auto-mark handled al primer outbound del agente.

## Proceso

### 1. Migration: enums + cols + triggers

```sql
-- 1.1 Enums
create type conversation_handoff_status as enum ('none', 'pending', 'handled');
create type conversation_handoff_reason as enum (
  'qualified',           -- lead calificado para cierre
  'scheduling',          -- quiere agendar visita
  'objection_complex',   -- objeción que el bot no resuelve
  'bot_stuck',           -- bot dando vueltas, no avanza (heurística)
  'manual'               -- agente tomó manualmente desde el toggle
);

-- 1.2 Columns nuevas en conversations
alter table public.conversations
  add column handoff_status conversation_handoff_status not null default 'none',
  add column handoff_summary text,
  add column handoff_task_id uuid references public.tasks(id) on delete set null;

-- Si tenías handoff_reason text, conviértelo:
alter table public.conversations
  alter column handoff_reason type conversation_handoff_reason
  using handoff_reason::conversation_handoff_reason;

-- 1.3 Índice parcial para queries de "pendientes"
create index idx_conversations_handoff_pending
  on public.conversations (agency_id, last_message_at desc)
  where handoff_status = 'pending';

-- 1.4 Trigger: handoff_status flips a 'pending' → crear task + handler=human
create or replace function public.handle_handoff_pending()
returns trigger
language plpgsql
security definer
as $$
declare
  task_id uuid;
begin
  if NEW.handoff_status = 'pending' and (OLD.handoff_status is null or OLD.handoff_status != 'pending') then
    insert into public.tasks (
      agency_id, lead_id, conversation_id,
      kind, priority, status,
      title, notes,
      due_at, assigned_agent_id
    ) values (
      NEW.agency_id, NEW.lead_id, NEW.id,
      'followup', 'high', 'open',
      'Handoff: lead requiere atención',
      coalesce(NEW.handoff_summary, '(sin resumen)'),
      now() + interval '30 minutes',
      NEW.assigned_agent_id
    )
    returning id into task_id;

    NEW.handoff_task_id := task_id;
    NEW.handler := 'human';  -- bot off, agente toma
  end if;
  return NEW;
end;
$$;

create trigger tg_handoff_create_task
  before update of handoff_status on public.conversations
  for each row execute function public.handle_handoff_pending();

-- 1.5 Trigger: primer outbound de agent → auto-mark handled
create or replace function public.auto_mark_handoff_handled()
returns trigger
language plpgsql
security definer
as $$
begin
  if NEW.direction = 'outbound' and NEW.sender_kind = 'agent' then
    update public.conversations c
       set handoff_status = 'handled'
     where c.id = NEW.conversation_id
       and c.handoff_status = 'pending';
    update public.tasks
       set status = 'in_progress'
     where conversation_id = NEW.conversation_id
       and status = 'open';
  end if;
  return NEW;
end;
$$;

create trigger tg_handoff_mark_handled
  after insert on public.messages
  for each row execute function public.auto_mark_handoff_handled();
```

### 2. Edge function `request-handoff`

Endpoint POST que el bot (n8n) llama para disparar el handoff sin tocar SQL directo.

```typescript
// supabase/functions/request-handoff/index.ts
const HANDOFF_INTERNAL_SECRET = Deno.env.get('HANDOFF_INTERNAL_SECRET');

Deno.serve(async (req) => {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${HANDOFF_INTERNAL_SECRET}`) {
    return new Response('unauthorized', { status: 401 });
  }

  const { conversation_id, reason, summary, source } = await req.json();
  if (!conversation_id || !reason) return new Response('bad request', { status: 400 });

  // Idempotente: si ya está pending, retornar el existente
  const { data: existing } = await supabase
    .from('conversations').select('handoff_status, handoff_task_id')
    .eq('id', conversation_id).single();

  if (existing?.handoff_status === 'pending') {
    return new Response(JSON.stringify({
      status: 'already_pending', task_id: existing.handoff_task_id,
    }), { headers: { 'content-type': 'application/json' } });
  }

  // Trigger: UPDATE dispara la creación de task + flip handler
  const { error } = await supabase
    .from('conversations')
    .update({
      handoff_status: 'pending',
      handoff_reason: reason,
      handoff_summary: summary || null,
      handoff_at: new Date().toISOString(),
    })
    .eq('id', conversation_id);

  if (error) return new Response(error.message, { status: 500 });
  return new Response(JSON.stringify({ status: 'ok' }), {
    headers: { 'content-type': 'application/json' },
  });
});
```

Deploy: `supabase functions deploy request-handoff --no-verify-jwt` + setear `HANDOFF_INTERNAL_SECRET` en Edge Function Secrets.

### 3. N8N: nodo que dispara el handoff

En el workflow, donde tenías "Apagar Chatbot — Conversation" (postgres UPDATE), reemplazar por un HTTP node que llama a `/functions/v1/request-handoff` con Authorization Bearer.

Body desde el flow:
```json
{
  "conversation_id": "={{ $('Variables').first().json.conversation_id }}",
  "reason": "={{ $('Detector').first().json.output.handoff_reason }}",
  "summary": "={{ $('Detector').first().json.output.handoff_summary }}",
  "source": "bot"
}
```

Si el reason que devuelve el LLM no matchea el enum exactamente, agregar un CASE mapping antes:
```javascript
const reasonMap = {
  'caliente': 'qualified',
  'agendar': 'scheduling',
  'objecion': 'objection_complex',
  // fallback
};
const reason = reasonMap[llmOutput.toLowerCase()] || 'qualified';
```

### 4. UI: 4 canales simultáneos cuando handoff_status = 'pending'

| Canal | Componente | Trigger |
|---|---|---|
| **1. Pill en conv-list** | `conv-list.tsx` | Pill ⚠️ animada en la conv con `handoffStatus === 'pending'` |
| **2. Banner naranja en chat** | `chat-panel.tsx` | Banner full-width arriba del input con CTAs "Marcar atendido" / "Ver resumen" |
| **3. Fuente prioritaria en NotificationsDropdown** | `notifications-dropdown.tsx` | Bell pulse animado + lista de pendientes |
| **4. Badge + KPI en Tasks** | `tasks-client.tsx` | Filtro "Handoff" + KPI dedicado |

Adicional: badge ⚠️ en la lista de Leads + filtro "Pendientes handoff" en `leads-client.tsx` + banner en LeadDetail.

Los 4 canales se alimentan del mismo state derivado: `conversations.handoff_status = 'pending'` filtrado por `agency_id`. Realtime broadcast (skill `supabase-realtime-broadcast-pattern`) los mantiene en sync.

### 5. Toggle manual desde Inbox

En el chat-panel, un switch "Bot / Agente" permite al humano tomar la conversación manualmente sin que el bot lo haya iniciado:
- Toggle ON (modo Agente) → llamar a `request-handoff` con `reason: 'manual'`, `source: 'agent'`
- Toggle OFF (modo Bot) → reactivar bot: UPDATE conversations set handler='bot', handoff_status='handled' donde aplique

## Output esperado

1. Migration aplicada (enums + cols + 2 triggers)
2. Edge function `request-handoff` desplegada
3. Secret `HANDOFF_INTERNAL_SECRET` configurado en Supabase + N8N (mismo valor)
4. Workflow N8N actualizado para llamar al edge endpoint (no SQL directo)
5. UI con 4 canales de alerta + filtros + auto-mark handled funcionando
6. Test: bot detecta lead caliente → handoff → task auto-creada (priority high, due 30min) + handler='human' + 4 canales alertando

## Ejemplo concreto (Casa CRM, en producción 2026-05-20)

- Migration: [supabase/migrations/0016_handoff_system.sql](supabase/migrations/0016_handoff_system.sql)
- Edge function: [supabase/functions/request-handoff/index.ts](supabase/functions/request-handoff/index.ts) v0.1.0
- Tests verificados:
  - Trigger 1: UPDATE handoff_status=pending → task auto-creada con title/notes/priority/due correctos + handler='human' + task_id linkeado ✓
  - Trigger 2: INSERT outbound de agent → conv pasa a 'handled' + task pasa a 'in_progress' ✓
- 4 canales UI funcionando: pill animada en conv-list, banner naranja chat, bell pulse notifications, badge tasks
- N8N patcheado: nodo "Apagar Chatbot — Conversation" reemplazado por HTTP a request-handoff
- Razones soportadas: `qualified`, `scheduling`, `objection_complex`, `manual` (V1). `bot_stuck` queda en enum pero sin heurística automática hasta V1.5.

## Gotchas / antipattern

- **NO** dejar que el bot UPDATE directo a `conversations.handoff_status`. Usar siempre el endpoint para que sea idempotente y centralizado.
- **NO** crear una categoría nueva en el embudo de leads para "handoff". Es ortogonal al status del lead, no parte del pipeline.
- **NO** auto-reactivar el bot después de X horas. Una vez que el handoff dispara, el agente decide cuándo prender al bot otra vez (toggle manual). Casa CRM lo intentó como auto-resume 12h y el founder lo bajó.
- **NO** confiar solo en Telegram para notificar. El handoff debe ser **multi-canal dentro del CRM**. Telegram es bonus, no fuente única.
- **NO** olvidar el SLA en la task. Sin `due_at`, queda en el limbo. 30min es el sweet spot inmobiliaria — ajustar a tu vertical.

## Skills relacionadas

- `n8n-pipeline-rapido-vs-pesado` — este patrón es estructural, pipeline PESADO (architect → builder → reviewer)
- `supabase-realtime-broadcast-pattern` — para que la UI se entere instantáneo del cambio de handoff_status
- `inbox-message-bubble-render` — el banner naranja se renderiza en chat-panel
- `bot-anti-loop-detector` (futura) — para el reason `bot_stuck` cuando lo automatices
