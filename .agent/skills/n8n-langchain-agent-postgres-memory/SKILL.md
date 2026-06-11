# Skill: N8N LangChain Agent + Postgres Chat Memory

## Cuándo usar esta skill

- Estás construyendo un agente conversacional en N8N (LangChain Agent node) que debe **recordar la conversación entre mensajes**.
- El bot atiende múltiples conversaciones simultáneas (multi-tenant: por lead, por canal, por chat).
- Querés persistir la memoria en una DB (no en RAM del proceso N8N) para que sobreviva reinicios y permita continuar conversaciones después de days/weeks.
- Necesitás que la memoria sea inspeccionable (debugging, auditoría, replay).

## Por qué existe esta skill

LangChain Agent en N8N tiene varios sub-modules de memoria:
- **Buffer Memory** (RAM) — se pierde al reiniciar workflow. Útil solo en demos.
- **Window Buffer Memory** — keep N últimos mensajes en RAM. Limitado igual.
- **Postgres Chat Memory** ✅ — persiste en tabla Postgres. Production-grade.
- **Vector Memory** — para retrieval-augmented (relevant past msgs). Overkill para chat típico.

Para WhatsApp/Chat conversacional el ganador es **Postgres Chat Memory** porque:
- Por `sessionId` (típicamente `conversation_id`), cada chat tiene su historia aislada
- Persiste para siempre (o hasta que vos limpies)
- Es SQL inspeccionable: `select * from n8n_chat_histories where session_id = 'X'`
- Funciona out-of-the-box con la misma Postgres que ya tiene tu app (Supabase)

## Proceso

### 1. Crear la tabla `n8n_chat_histories` en Postgres

N8N la crea automáticamente la primera vez que el workflow corre. Schema esperado:

```sql
create table public.n8n_chat_histories (
  id bigserial primary key,
  session_id varchar(255) not null,
  message jsonb not null,
  created_at timestamptz default now()
);
create index idx_n8n_chat_histories_session on public.n8n_chat_histories (session_id, id);
```

El `message` jsonb tiene estructura LangChain:
```json
{ "type": "human", "data": { "content": "Hola, info por favor", "additional_kwargs": {} } }
{ "type": "ai",    "data": { "content": "Hola! Soy Sofia...",  "additional_kwargs": {} } }
```

### 2. Configurar credencial Postgres en N8N

Settings → Credentials → New → Postgres:
- Host, port, database, user, password de tu Supabase pool
- SSL: `require`
- Verificar conexión

Para Supabase específicamente, usar **Session Pooler** (puerto 5432 en pooler.supabase.com) — el direct connection a veces tiene límites.

### 3. Agregar nodo "Postgres Chat Memory" al workflow

En el canvas del workflow, junto al nodo `@n8n/n8n-nodes-langchain.agent`:

1. Agregar nodo `@n8n/n8n-nodes-langchain.memoryPostgresChat`
2. Conectar su output al sub-input "Memory" del Agent
3. Configurar params:
   - **Session ID Type:** "Define Below"
   - **Session ID Value:** `={{ $('Variables').first().json.conversation_id }}` (o el ID estable que identifica la conversación)
   - **Context Window Length:** 20 (o el N de mensajes que querés que el LLM recuerde; más = más context = más tokens = más caro)
   - **Table Name:** `n8n_chat_histories` (default)

### 4. Reglas del session_id

**CRÍTICO:** el `session_id` debe ser:
- **Estable** — el MISMO valor en todas las invocaciones de la misma conversación
- **Único** — distinto por conversación, no se mezcla con otras
- **String** — varchar(255) en la tabla

Convención: usar `conversation_id` UUID de tu tabla `conversations`. NO usar `phone_number` (puede cambiar) ni `lead_id` (un lead puede tener múltiples conversaciones en otros canales eventualmente).

### 5. Resetear memoria (comando "/reiniciar")

Si el lead manda "/reiniciar" o "reset" o similar, querés borrar la historia para empezar limpio:

```sql
-- En un nodo "Postgres" del workflow (no memoryPostgresChat — el normal)
delete from public.n8n_chat_histories
where session_id = '{{ $('Variables').first().json.conversation_id }}';
```

También limpiar el cache de Redis si lo usás para state efímero.

### 6. Pruning automático (cuando la historia crece demasiado)

Para conversaciones de muchos meses, la historia puede llegar a miles de mensajes. Esto no es problema técnico (Postgres maneja millones de rows) pero sí de costo del LLM (cada invocación lee Context Window Length mensajes).

Soluciones:
- **Bajar Context Window Length** a 10-15 (suficiente para coherencia, no para memoria de largo plazo)
- **Resumir cada N mensajes**: cada 30 mensajes, hacer un summary LLM y reemplazar los 30 viejos con 1 summary. Patrón "Summary Buffer Memory" en LangChain
- **Hard cap**: trigger SQL que mantiene solo los últimos 100 mensajes por session_id

### 7. Debugging: inspeccionar la memoria

```sql
-- Ver historia de una conversación
select id, message->>'type' as role, message->'data'->>'content' as content, created_at
from public.n8n_chat_histories
where session_id = '<conversation_id>'
order by id asc;

-- Contar mensajes por sesión
select session_id, count(*) from n8n_chat_histories group by session_id order by count desc limit 20;

-- Mensajes huérfanos (sin conversation correspondiente)
select n.session_id, count(*)
from n8n_chat_histories n
left join conversations c on c.id::text = n.session_id
where c.id is null
group by n.session_id;
```

## Output esperado

1. Tabla `n8n_chat_histories` creada (o auto-creada por n8n)
2. Credencial Postgres configurada en N8N apuntando a tu Supabase
3. Nodo `Postgres Chat Memory` en el workflow conectado al Agent
4. `Session ID` configurado al UUID de tu tabla `conversations`
5. Comando `/reiniciar` que borra la historia de la sesión
6. Test: lead manda 5 mensajes, bot mantiene contexto entre ellos. Reinicio del worker N8N — la próxima respuesta sigue siendo coherente.

## Ejemplo concreto (Casa CRM, en producción)

- Tabla: `public.n8n_chat_histories` en Supabase Postgres
- Workflow: Sofia v5.5
- Nodo "Postgres Chat Memory - Sofia" conectado a "Agente Principal - Sofia"
- Session ID: `={{ $('Variables').first().json.conversation_id }}`
- Context Window: 20 mensajes
- Reset: nodo "Delete Postgres historial" cuando el lead manda "/reiniciar" o similar
- Inspección: SQL queries directas en Supabase Dashboard cuando hay que debuggear comportamiento del bot

## Gotchas / antipattern

- **NO** usar `phone_number` como session_id. Si el lead cambia de número (re-onboarding), pierde su historia. UUID de conversación es estable.
- **NO** usar `lead_id` directo si tu modelo permite múltiples conversaciones por lead (otras canales: SMS, web chat). Cada conversación = una sesión.
- **NO** dejar Context Window en 100. Cada invocación paga tokens por TODA la ventana — costo lineal con la longitud. 15-20 es buen balance.
- **NO** olvidar limpiar al hacer `/reiniciar`. Si solo limpiás Redis pero el LangChain memory queda, el bot sigue "recordando" cosas que el lead pensó que se borraron.
- **NO** asumir que la historia sirve para search posterior. Es para context del LLM, no para queries semánticas. Para eso, usar vector memory aparte.
- **NO** usar la misma Postgres que tu app sin pensar en isolación. Si la tabla `n8n_chat_histories` está en el mismo schema que `messages`, RLS puede causar fricciones — meterla en schema `public` con `security definer` en el nodo, o schema separado `n8n`.
- **NO** dejar la tabla sin índice `(session_id, id)`. Sin ese índice, queries de history se vuelven O(N) sobre todos los mensajes.

## Skills relacionadas

- `sales-framework-spsp-whatsapp` — la coherencia conversacional que esta memoria habilita
- `bot-anti-loop-detector` — detecta cuando el bot está "loopeando" y la memoria no ayuda (necesita reset)
- `n8n-workflow-build-script` — para versionar cambios al nodo de memoria
