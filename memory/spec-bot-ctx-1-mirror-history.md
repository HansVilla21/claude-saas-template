# Spec BOT-CTX-1 — Mirror de mensajes humanos a memoria del bot

> Fecha: 2026-06-05
> Estado: SPEC (no implementada)
> Owner: arquitecto + backend-builder
> Implementación: DESPUÉS de BOT-CTX-2 (depende del backfill outbound clasificado correctamente)
> Branch sugerida: `feat/bot-ctx-1-mirror-history`

---

## 1. Problema

El bot N8N (`Chatbot Momentum - bot-c v1`) usa `n8n_chat_histories` (tabla LangChain `PostgresChatMessageHistory`) como memoria conversacional. La memoria se hidrata por `session_id` con `contextWindowLength=20` (nodo `Postgres Chat Memory - Sofia C`).

Cuando un humano (agente CRM o founder vía app coexistencia) interviene en una conversación durante una pausa del bot, **esos mensajes NO se reflejan en `n8n_chat_histories`**. Cuando el bot reactiva (pausa expira, o agente lo re-asigna a `handler='bot'`), el bot lee history sin ese intermedio → contradice o pierde contexto → mala UX.

Ejemplo concreto:

- Lead: "quiero info de propiedades en Escazú"
- Bot: "te ayudo, ¿qué presupuesto?"
- (founder pausa el bot manualmente)
- Lead: "$300k"
- Founder (desde app coexistencia): "perfecto, te mando opciones esta tarde"
- (founder despausa el bot 2h después)
- Lead: "ya viste lo que te dije?"
- Bot rehidrata memoria → solo ve: `[human: quiero info]`, `[ai: te ayudo, ¿qué presupuesto?]` → no sabe del $300k ni del compromiso del founder → responde mal.

## 2. Solución técnica — Mirror desde aplicación (Opción D del análisis previo)

Cuando un mensaje **humano** se persiste en `messages`, escribir un mirror en `n8n_chat_histories` con el formato LangChain correcto para que el bot lo vea al rehidratar.

### 2.1 Diagrama de flujo

```
ESCENARIO A — Agente humano envía desde CRM (sendMessageViaYCloud)
   ┌────────────────────────────────────┐
   │ messages INSERT (sender_kind=human)│ ← ya existe
   └─────────────┬──────────────────────┘
                 ▼
   ┌────────────────────────────────────┐
   │ NUEVO: mirror to n8n_chat_histories│ ← {type: 'ai', content: body}
   └────────────────────────────────────┘  (desde bot's POV es business reply)
   ┌────────────────────────────────────┐
   │ YCloud POST + UPDATE status       │ ← ya existe
   └────────────────────────────────────┘

ESCENARIO B — Lead manda mensaje mientras bot está pausado
   ┌────────────────────────────────────┐
   │ ycloud-webhook handleInboundMessage│ ← ya existe
   │ INSERT messages (sender_kind=lead) │
   └─────────────┬──────────────────────┘
                 ▼
   ┌────────────────────────────────────┐
   │ NUEVO: si bot_paused_until > NOW() │
   │  → mirror {type:'human',content:body}│
   │  Si bot NO pausado:                │
   │  → skip (workflow N8N va a escribir│
   │    el history a través del agent)  │
   └────────────────────────────────────┘

ESCENARIO C — Founder envía desde app coexistencia (POST-BOT-CTX-2)
   ┌────────────────────────────────────┐
   │ ycloud-webhook backfill outbound   │ ← POST-BOT-CTX-2
   │ INSERT (sender_kind=human,         │
   │         sent_via=coexistence)      │
   └─────────────┬──────────────────────┘
                 ▼
   ┌────────────────────────────────────┐
   │ NUEVO: mirror {type:'ai',content}  │ ← misma lógica que escenario A
   └────────────────────────────────────┘
```

### 2.2 Decisiones técnicas

| # | Decisión | Justificación |
|---|---------|---------------|
| D1 | **`type='ai'` para humanos del lado del business (CRM + coexistencia), `type='human'` para mensajes del lead.** | Desde la perspectiva del agente N8N, el `business` (sea bot, agente CRM, o founder) es siempre `ai` en LangChain. El `lead` es siempre `human`. Esto es invariante del framework — no se decide por rol del que escribió, sino por dirección outbound vs inbound. |
| D2 | **Schema mínimo en `message` jsonb: `{type, content}` solo.** | El history actual en producción incluye `additional_kwargs`, `response_metadata`, `tool_calls`, etc. porque viene del agente N8N que serializa el objeto LangChain entero. Para mirrors externos, el bot al rehidratar solo necesita `type` y `content` (LangChain los re-hidrata como BaseMessage con defaults). Verificado contra `@langchain/core` docs. |
| D3 | **Session_id correcto: `<phone>@<businessPhone>` (NO `<phone>@<agency_id>`).** | **Corrección crítica del scope del founder.** Auditoría confirmó que el bot LIVE en línea 1608 usa: `Telefono + "@" + whatsappInboundMessage.to`. `Telefono` viene de Variables que normaliza `userPhone` con prefijo `+`. `.to` es el `businessPhone` (número del negocio). Si el mirror usa `agency_id`, NO matchea con la sesión del bot → memoria invisible al bot. |
| D4 | **Condicionalmente escribir mirror del inbound solo si `bot_paused_until > NOW()`.** | Si el bot está activo, el workflow se va a disparar y escribir el mensaje del lead via LangChain (con metadata completa). Si nosotros también escribimos, hay duplicación. **Detección de pausa por flag explícito, no por intento de ejecutar.** |
| D5 | **No detectar otros estados "el bot no procesa" (rate limit, errores transitorios).** | Workflow puede fallar silenciosamente, mensajes perdidos en history. Aceptado: bajo volumen, OBS-2 alarmas cubren el caso de fallos repetidos. Documentado como limitation. |
| D6 | **NO backfill retroactivo.** | Rows pre-deploy en `messages` con `sender_kind='human'` no se reflejan a `n8n_chat_histories`. Inyectarlos inflaría el contexto del bot con sesiones viejas. Cada conversación nueva (o continuación post-deploy) ya recibirá el sync correcto. |
| D7 | **Multimedia V1: skip mirror.** Cuando `kind != 'text'` (image, audio, video, document, sticker, template), NO se mirrorea. | V1 simple. Bot pierde contexto si el humano manda foto al lead, pero el agente humano normalmente acompaña con texto que sí se mirrorea. V2: `content = "[agente envió imagen: ${media_url}]"` con placeholder estructurado. |
| D8 | **Dedup check liviano antes del INSERT del mirror.** | Webhook YCloud puede retry. Server action puede dispararse dos veces si UI no debouncea. Dedup: `SELECT id FROM n8n_chat_histories WHERE session_id=$1 AND message->>'content'=$2 AND id > (SELECT MAX(id) - 5 FROM n8n_chat_histories WHERE session_id=$1) LIMIT 1`. Si encuentra → no insertar. Window pequeño (últimos 5 rows) para no escanear toda la sesión. |
| D9 | **Idempotencia de la write: usar `INSERT ... RETURNING id` envuelto en try/catch**. Falla NO debe romper el path principal (CRM debe enviar mensaje aunque el mirror falle). | El mirror es "nice to have" para el bot. Si la write falla, log warning + continuar. Mejor mensaje enviado sin mirror que mensaje no enviado por bug en mirror. |
| D10 | **Edge case race: bot se desactiva DURANTE el procesamiento de un turn.** | Lead manda → handler entra a `if bot_paused_until=null/past → no mirror`. Founder pausa el bot al mismo tiempo. Bot N8N se dispara igual y ejecuta el turn (porque el check es al inicio del workflow, no en runtime). El siguiente mensaje del lead que llegue ya verá `bot_paused_until > NOW()` y se mirroreará. Aceptado: 1 mensaje puede caer en el limbo. |
| D11 | **Helper compartido: extraer `getBotSessionId(phone, businessPhone)` a `src/lib/bot/session.ts`.** | Misma lógica usada en server action + edge function. Evita inconsistencia si formato cambia. Edge function lo embebe (Deno) duplicado pero comentado con referencia al canon. |
| D12 | **Migration 0023: index `(session_id, id DESC)` en `n8n_chat_histories`.** | Bot rehidrata con `LIMIT 20 ORDER BY id DESC`. Sin index, scan full por sesión. Volumen pequeño hoy pero crece linealmente con uso. Migration idempotente. |

### 2.3 Cambios concretos

#### Cambio 1 — Helper compartido `src/lib/bot/session.ts` (NUEVO)

```typescript
// src/lib/bot/session.ts
// BOT-CTX-1: session_id canónico para n8n_chat_histories.
//
// IMPORTANTE: este formato DEBE matchear el del workflow N8N
// (chatbot-momentum-bot-c-v1.json nodo "Postgres Chat Memory - Sofia C"):
//   sessionKey = Telefono + "@" + whatsappInboundMessage.to
// Donde:
//   Telefono = "+" + digitos del userPhone (lead)
//   .to      = businessPhone (número del negocio, con "+")
//
// Si cambiás esto, cambiá TAMBIÉN el nodo del workflow N8N o el bot
// no va a ver el mirror.

function normalizeToE164(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return `+${digits}`;
}

export function getBotSessionId(leadPhone: string, businessPhone: string): string {
  return `${normalizeToE164(leadPhone)}@${normalizeToE164(businessPhone)}`;
}
```

#### Cambio 2 — Server action `sendMessageViaYCloud` (`src/app/a/[slug]/inbox/actions.ts`)

Después del UPDATE final exitoso (líneas 404-417), agregar:

```typescript
// 6. BOT-CTX-1: mirror a n8n_chat_histories para que el bot tenga contexto si
//    reanuda esta conversación tras una pausa. NO bloquea el path principal:
//    si el mirror falla, el mensaje YA fue enviado y registrado.
try {
  const sessionId = getBotSessionId(toPhone, fromPhone);

  // Dedup check: si los últimos 5 rows del session ya contienen este mismo
  // content, no duplicar (retry de UI, doble dispatch).
  const { data: recent } = await admin
    .from('n8n_chat_histories')
    .select('id, message')
    .eq('session_id', sessionId)
    .order('id', { ascending: false })
    .limit(5);

  const isDuplicate = (recent ?? []).some((row) => {
    try {
      const m = row.message as { type?: string; content?: string };
      return m?.type === 'ai' && m?.content === msg.body;
    } catch {
      return false;
    }
  });

  if (!isDuplicate) {
    await admin.from('n8n_chat_histories').insert({
      session_id: sessionId,
      message: { type: 'ai', content: msg.body },
    });
  }
} catch (mirrorErr) {
  // Log pero NO propagar — el envío ya fue exitoso.
  console.warn(
    '[BOT-CTX-1] mirror to n8n_chat_histories failed:',
    mirrorErr instanceof Error ? mirrorErr.message : String(mirrorErr),
  );
}

return { ok: true };
```

#### Cambio 3 — Edge function `ycloud-webhook/index.ts` — handler de inbound

Después del `insertInboundMessageIdempotent` exitoso (línea 673), agregar:

```typescript
// BOT-CTX-1: mirror del mensaje del lead a n8n_chat_histories SOLO si el bot
// está pausado para esta conversación. Si está activo, el workflow N8N va a
// escribir el history via LangChain (no duplicar).
//
// Multimedia V1: solo se mirrorean mensajes de texto. Image/audio se omiten
// porque el bot N8N normalmente no los procesa estructuralmente y duplicaría
// con el flujo de Whisper para audio.
const kindForMirror = mapMessageKind(ycloudType);
if (result.inserted && content.body && kindForMirror === 'text') {
  try {
    const { data: convState } = await sb
      .from('conversations')
      .select('bot_paused_until')
      .eq('id', conversationId)
      .maybeSingle();

    const isPaused =
      convState?.bot_paused_until &&
      new Date(convState.bot_paused_until as string) > new Date();

    if (isPaused) {
      const sessionId = `${normalizeToE164(from)}@${normalizeToE164(to)}`;

      // Dedup check liviano: últimos 5 rows del session.
      const { data: recent } = await sb
        .from('n8n_chat_histories')
        .select('id, message')
        .eq('session_id', sessionId)
        .order('id', { ascending: false })
        .limit(5);

      const isDup = (recent ?? []).some((row) => {
        try {
          const m = row.message as { type?: string; content?: string };
          return m?.type === 'human' && m?.content === content.body;
        } catch {
          return false;
        }
      });

      if (!isDup) {
        await sb.from('n8n_chat_histories').insert({
          session_id: sessionId,
          message: { type: 'human', content: content.body },
        });
      }
    }
  } catch (mirrorErr) {
    console.warn(
      '[BOT-CTX-1] mirror inbound to n8n_chat_histories failed:',
      mirrorErr instanceof Error ? mirrorErr.message : String(mirrorErr),
    );
    // No propagar — el inbound YA fue persistido.
  }
}
```

Helper `normalizeToE164` ya existe en el archivo (revisar) o agregar:

```typescript
function normalizeToE164(raw: string): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}
```

#### Cambio 4 — Edge function `ycloud-webhook/index.ts` — backfill outbound (DESPUÉS de BOT-CTX-2)

En el INSERT del backfill outbound (post-BOT-CTX-2, ya `sender_kind='human'`), después del INSERT exitoso agregar mirror análogo al Cambio 2 pero adaptado al webhook:

```typescript
// BOT-CTX-1 (post-BOT-CTX-2): mirror del outbound coexistencia a
// n8n_chat_histories. Mismo patrón que sendMessageViaYCloud server action.
if (content.body && mapMessageKind(ycloudType) === 'text') {
  try {
    const sessionId = `${normalizeToE164(/* lead phone */)}@${normalizeToE164(from)}`;
    // ⚠ Para outbound: from = business, lead phone = lookup via recipientUserId
    //   o leer leads.phone (ya lo tenemos en `lead.phone` si el lookup lo expone).
    // Vamos a hacer un SELECT adicional al lead para tener su phone:
    const { data: leadPhone } = await sb
      .from('leads').select('phone').eq('id', lead.id).maybeSingle();
    if (leadPhone?.phone) {
      const sid = `${normalizeToE164(leadPhone.phone)}@${normalizeToE164(from)}`;
      const { data: recent } = await sb
        .from('n8n_chat_histories')
        .select('id, message')
        .eq('session_id', sid)
        .order('id', { ascending: false }).limit(5);
      const isDup = (recent ?? []).some((row) => {
        try {
          const m = row.message as { type?: string; content?: string };
          return m?.type === 'ai' && m?.content === content.body;
        } catch { return false; }
      });
      if (!isDup) {
        await sb.from('n8n_chat_histories').insert({
          session_id: sid,
          message: { type: 'ai', content: content.body },
        });
      }
    }
  } catch (mirrorErr) {
    console.warn('[BOT-CTX-1] mirror coexistence backfill failed:', mirrorErr);
  }
}
```

Refactor recomendado: extraer función helper `mirrorToBotHistory(sb, sessionId, type, content)` en el archivo edge function para no repetir lógica de dedup.

#### Cambio 5 — Migration `0023_n8n_chat_histories_index.sql` (NUEVO)

```sql
-- 0023_n8n_chat_histories_index.sql
-- BOT-CTX-1: index para que el agente N8N (Postgres Chat Memory) rehidrate
-- las últimas N entries por session_id sin scan completo.
--
-- Tabla creada por LangChain PostgresChatMessageHistory; schema standard:
--   id BIGSERIAL PRIMARY KEY
--   session_id TEXT
--   message JSONB

CREATE INDEX IF NOT EXISTS n8n_chat_histories_session_id_id_desc_idx
  ON public.n8n_chat_histories (session_id, id DESC);

COMMENT ON INDEX public.n8n_chat_histories_session_id_id_desc_idx IS
  'BOT-CTX-1: soporta SELECT WHERE session_id=$1 ORDER BY id DESC LIMIT 20 '
  '(rehidratacion de memoria del agente N8N).';
```

Idempotente (`IF NOT EXISTS`).

---

## 3. Modelo de datos

Sin cambios estructurales en tablas. Solo se agrega 1 index.

```
n8n_chat_histories  (NO cambios de schema; tabla owned by LangChain)
└── nuevo index (session_id, id DESC)
```

Forma esperada del campo `message` jsonb (post-deploy):

- **Lead (inbound, bot pausado):** `{ "type": "human", "content": "<texto>" }`
- **CRM agent (outbound):** `{ "type": "ai", "content": "<texto>" }`
- **Founder via app coexistencia (outbound, post-BOT-CTX-2):** `{ "type": "ai", "content": "<texto>" }`
- **Bot N8N (outbound):** schema completo LangChain (no se toca — sigue siendo `{type:'ai', content, additional_kwargs, response_metadata, tool_calls, invalid_tool_calls}`)

LangChain `PostgresChatMessageHistory.getMessages()` reconstruye `BaseMessage` con defaults vacíos si faltan keys auxiliares — verificado en docs `@langchain/community`.

---

## 4. Flujo end-to-end

### Caso 1: Bot ACTIVO, lead manda mensaje

1. YCloud webhook inbound → `handleInboundMessage` → INSERT en `messages`
2. Check `bot_paused_until` → NULL o past → **no mirror**
3. Workflow N8N se dispara → Sofia C agent → `Postgres Chat Memory - Sofia C` lee + escribe el message del lead vía LangChain (con metadata completa)
4. Cero duplicación

### Caso 2: Bot PAUSADO, lead manda mensaje

1. YCloud webhook inbound → `handleInboundMessage` → INSERT en `messages`
2. Check `bot_paused_until > NOW()` → **mirror** `{type:'human', content}` en `n8n_chat_histories`
3. Workflow N8N se dispara → primer nodo `Chatbot Activado?` evalúa pausa → rechaza → no escribe nada al history
4. Cuando el bot despause, próximo rehidrato verá el mensaje correctamente como humano

### Caso 3: Agente CRM envía respuesta

1. UI inbox dispara `sendMessageViaYCloud`
2. INSERT `messages` con `sender_kind='human'` + POST YCloud + UPDATE wamid
3. Mirror `{type:'ai', content}` en `n8n_chat_histories`
4. Cuando el bot vuelva (si se reactiva), rehidrata y ve el mensaje del agente como respuesta del business

### Caso 4 (post-BOT-CTX-2): Founder envía desde app coexistencia

1. YCloud webhook `message.updated` → no encuentra match → backfill outbound
2. INSERT `messages` con `sender_kind='human', sent_via='coexistence'`
3. Mirror `{type:'ai', content}` en `n8n_chat_histories`
4. Bot al rehidratar ve el compromiso del founder

### Caso 5: Bot reactivado tras conversación humana intermedia

Continuando el ejemplo de la sección 1:

1. Lead despausa el bot (o pausa expira)
2. Lead manda: "ya viste lo que te dije?"
3. Workflow N8N dispara → Sofia C → `Postgres Chat Memory` rehidrata últimas 20 entries:
   - `[ai: te ayudo, ¿qué presupuesto?]` (bot, original)
   - `[human: $300k]` (lead, mirroreado en pausa — Caso 2)
   - `[ai: perfecto, te mando opciones esta tarde]` (founder vía app, mirroreado — Caso 4)
   - `[human: ya viste lo que te dije?]` (turn actual)
4. Bot responde considerando todo: "sí, [founder name] te envía las opciones esta tarde, mientras tanto..."

---

## 5. Trade-offs y alternativas descartadas

| Alternativa descartada | Por qué se descartó |
|------------------------|---------------------|
| **A. Trigger Postgres ON INSERT en `messages` que escribe a `n8n_chat_histories`** | Tentador (DRY). Pero: lógica de "type=ai vs human" requiere conocer `direction + sender_kind`. Lógica de "skip si bot activo" requiere JOIN con `conversations.bot_paused_until` en cada INSERT. Trigger se vuelve complejo y opaco. Y rompe el principio "agents read, humans write" (un trigger es un humano-write). |
| **B. Bot N8N lee `messages` directamente y arma su contexto** | Cambio de arquitectura grande del bot. `Postgres Chat Memory` es nodo LangChain estándar que asume su tabla. Cambiar a custom prompt context requiere re-test del agente entero. Out of scope para fix puntual. |
| **C. Webhook escribe SIEMPRE el mirror (también con bot activo)** | Duplicación del history. El agente N8N escribe via LangChain con metadata completa; nosotros con metadata mínima. El framework rehidrata sumando ambos → contexto inflado, posible alucinación. |
| **D. Schema mirror completo (replicar `additional_kwargs`, `tool_calls`, etc.)** | Para mirrors EXTERNOS al agente N8N esos campos NO aplican (un humano no tiene tool_calls). Llenarlos con `{}` no agrega valor. LangChain rehidrata con defaults. Mínimo es suficiente. |
| **E. Backfill retroactivo de history humano** | Inflación con conversaciones viejas que el bot debe ignorar. Sin tráfico real previo → bajo valor. Risk:reward malo. |
| **F. Marker visual en content (`[AGENTE HUMANO]: ...`)** | Bot ya recibe `# Contexto del lead` en el system prompt del agente que distingue roles. Marcar el mensaje en sí del lado del business hace que el bot lo trate como narración, no como turn previo. Confunde al LLM. |

---

## 6. Costo estimado (mensual USD)

| Usuarios | Mensajes humanos mirror/mes | Rows extra `n8n_chat_histories` | Storage extra |
|---------:|-----------------------------:|--------------------------------:|--------------:|
| 100      | 5k                           | 5k                              | ~1MB |
| 1.000    | 50k                          | 50k                             | ~10MB |
| 10.000   | 500k                         | 500k                            | ~100MB |

Storage trivial. Sin impacto en costo de Supabase (well within free tier para volúmenes hasta 1k usuarios). Query extra de dedup (5 rows) por escritura: <1ms con el index nuevo.

---

## 7. Riesgos y mitigaciones

| # | Riesgo | Probabilidad | Impacto | Mitigación |
|---|--------|--------------|---------|------------|
| R1 | **Session_id mal formateado → bot no ve mirrors** | Media (formato cambia en futuro) | Alto (bot pierde contexto sin error visible) | Helper `getBotSessionId` centralizado (D11). Test E2E en T4 que verifica match contra el bot real. Comentario en helper apuntando al workflow line. |
| R2 | **Bot activo y mirror se escribe igual (race con check de pausa)** | Baja | Bajo (duplicación temporal en history) | Check de `bot_paused_until` es eventually consistent; race window ~ms. LangChain `contextWindowLength=20` ignora rows viejos. Trade-off aceptable. |
| R3 | **Workflow falla mid-turn y mensaje queda fuera del history** | Media (OBS-2 detectaría fallos repetidos) | Bajo (pérdida ocasional 1 turn) | Aceptado (D5). Documentado. |
| R4 | **Multimedia humano no se refleja (V1)** | Cierta | Bajo (bot pierde contexto si humano manda foto/audio solo) | V1 skip multimedia (D7). V2: placeholder estructurado. |
| R5 | **Duplicación si webhook retry + sin dedup** | Cubierta | N/A | Dedup check D8. |
| R6 | **Falla del mirror rompe envío del CRM** | Cubierta | N/A | Try/catch + warn + continuar (D9). |
| R7 | **`Postgres Chat Memory` del agente ESCRIBE algo después del mirror que pisa contexto** | Baja (el agente escribe SU turn, no el del lead) | Bajo | LangChain `PostgresChatMessageHistory` no hace DELETE/UPDATE; solo INSERT append-only. Mirror no se sobrescribe. |
| R8 | **Index 0023 no se aplica → query del agente lenta** | Baja (migration idempotente) | Medio (latencia bot N8N) | Verificar `\d+ n8n_chat_histories` post-deploy. OBS-1 ya tiene métrica de latencia del bot. |
| R9 | **Schema mínimo `{type, content}` rompe rehidratación si LangChain valida estricto** | Baja | Alto (bot crashea al rehidratar) | Verificado en docs `@langchain/community`: `PostgresChatMessageHistory` usa `mapStoredMessagesToChatMessages()` con defaults. Test explícito en T3: escribir un row con schema mínimo, gatillar workflow, verificar bot no crashea. |
| R10 | **Pérez Luna recibe respuesta desconcertante porque el bot ahora "sabe" de mensajes del founder** | Baja-media (es deseable de fondo) | Variable | Smoke explícito con Pérez Luna en T5. Si el founder ha escrito a Pérez Luna desde la app, esos mensajes pre-deploy NO se mirrorean (D6) → bot sigue sin verlos. Solo afecta interacciones post-deploy. Es exactamente el comportamiento deseado. |

---

## 8. Plan de testing y rollout

### Pre-deploy

- [ ] T0a: Crear branch `feat/bot-ctx-1-mirror-history` desde `main`.
- [ ] T0b: Verificar que BOT-CTX-2 ya está deployado y verde en producción (gate de dependencia).
- [ ] T1: Aplicar migration `0023_n8n_chat_histories_index.sql`. Verificar index con `\d+`.
- [ ] T2: Implementar Cambios 1, 2, 3, 4 en código. Build local sin warnings.
- [ ] T3: Test unitario del helper `getBotSessionId`: contra ejemplos reales del `n8n_chat_histories` actual (ej. `+50688217229@dc...` actual ya es ESTE formato — buscar muestras reales del bot LIVE; si difiere de la spec, AJUSTAR la spec ANTES de seguir).

### Smoke en preview Vercel

- [ ] T4 (Caso 3 — CRM): Desde UI inbox enviar texto a un lead de prueba. Verificar en DB:
  - row en `messages` con `sender_kind='human'`
  - row en `n8n_chat_histories` con `message={"type":"ai","content":"<texto>"}` y `session_id` correcto
- [ ] T5 (Caso 1 — Bot activo + lead): Lead de prueba escribe. Bot responde normalmente. Verificar en `n8n_chat_histories`: SOLO la entry del agente N8N (con metadata completa), NO duplicada por el webhook.
- [ ] T6 (Caso 2 — Bot pausado + lead): Pausar bot via API/CRM (`bot_paused_until = NOW() + 1 hour`). Lead escribe. Verificar:
  - row en `messages` con `sender_kind='lead'`
  - row en `n8n_chat_histories` con `{"type":"human","content":...}`
  - Workflow NO escribe nada al history (verificar via `WHERE session_id=X ORDER BY id DESC LIMIT 5`)
- [ ] T7 (Caso 4 — coexistencia): Desde app del founder, enviar texto al mismo lead de prueba. Verificar:
  - backfill: row en `messages` con `sender_kind='human', sent_via='coexistence'`
  - mirror: row en `n8n_chat_histories` con `{"type":"ai","content":...}`
- [ ] T8 (Caso 5 — reactivación): Despausar el bot (`bot_paused_until = NULL`). Lead manda nuevo mensaje. Verificar:
  - Bot responde considerando el contexto humano intermedio (smoke conversacional: "como te decía antes..." o referencia al $300k)
  - Si la respuesta del bot contradice lo que el founder dijo → bug en rehidratación → ROLLBACK
- [ ] T9 (Dedup): Enviar el mismo texto 2 veces seguidas desde el CRM. Verificar que en `n8n_chat_histories` aparece UNA sola vez.

### Cutover producción

- [ ] T10: Merge PR a `main`. Deploy Vercel.
- [ ] T11: Smoke real con Pérez Luna (mensaje natural). Verificar bot responde igual de bien que antes (no rompió rehidratación).
- [ ] T12: Pausar bot de prueba con Pérez Luna 5min (`bot_paused_until = NOW() + 5min`). Enviar 1-2 mensajes desde la app del founder al chat de Pérez Luna como simulación. Despausar. Verificar bot responde contextualmente.
- [ ] T13: Monitorear 24h: logs de warnings `[BOT-CTX-1]`, latencia del bot, % de rehidrataciones con error.

### Rollback (si T11/T12 falla)

1. `git revert` del PR. Vercel auto-deploy de la revert.
2. Migration 0023 (index) puede quedarse — backward compatible.
3. Documentar incidente.

### R-PRODUCCION-LIVE

Pérez Luna está en onboarding con bot activo. Cualquier regresión en la calidad de respuesta del bot afecta la percepción de calidad del producto. Testing exhaustivo en preview con casos múltiples antes de merge.

---

## 9. Archivos a crear/modificar

| Path absoluto | Acción | Notas |
|---|---|---|
| `d:/Antigravity/0. Proyectos Personales/Inmobilioaria CRM/crm-v2/src/lib/bot/session.ts` | CREATE | Helper `getBotSessionId` |
| `d:/Antigravity/0. Proyectos Personales/Inmobilioaria CRM/crm-v2/src/app/a/[slug]/inbox/actions.ts` | MODIFY | Después de línea 417 (post-UPDATE wamid exitoso): mirror block |
| `d:/Antigravity/0. Proyectos Personales/Inmobilioaria CRM/crm-v2/supabase/functions/ycloud-webhook/index.ts` | MODIFY | (a) tras línea 673 (post-inbound success): mirror condicional pausado. (b) Tras línea 873 (post-backfill outbound success, asume BOT-CTX-2 ya merged): mirror outbound. Bump FN_VERSION a 1.3.0 |
| `d:/Antigravity/0. Proyectos Personales/Inmobilioaria CRM/crm-v2/supabase/migrations/0023_n8n_chat_histories_index.sql` | CREATE | Idempotente |

**Sin cambios al workflow N8N en BOT-CTX-1.** Toda la lógica vive en aplicación.

---

## 10. Dependencia con BOT-CTX-2

**BOT-CTX-1 debe deployarse DESPUÉS de BOT-CTX-2.**

Sin BOT-CTX-2, el backfill outbound en el webhook clasifica como `sender_kind='bot'`. El Cambio 4 de BOT-CTX-1 (mirror del coexistencia) sería incorrecto si se aplicara antes porque:

- Estaría escribiendo mirrors `type='ai'` para rows que aparecen como `sender_kind='bot'` (que el bot N8N ya escribe vía LangChain) → duplicación masiva.

Implementación en orden:

1. BOT-CTX-2 (deploy + verificar 24-48h sin issues)
2. BOT-CTX-1 (con Cambio 4 incluido desde el principio porque ya está la base)

Si por alguna razón BOT-CTX-1 se necesita antes que BOT-CTX-2 (no recomendado): omitir Cambio 4. Aplicar Cambios 1, 2, 3 solos. Documentar que el sync de coexistencia queda pendiente para una segunda iteración tras BOT-CTX-2.

---

## 11. Hallazgos del audit que ajustan la spec inicial del founder

| # | Founder dijo | Auditoría reveló | Ajuste |
|---|--------------|------------------|--------|
| H1 | "`session_id` formato: `<phone>@<agency_id>` (ej `+50688217229@dc000e2f...`)" | El bot LIVE línea 1608: `sessionKey = Telefono + "@" + whatsappInboundMessage.to`. `.to` = businessPhone (número del business), NO agency_id. | **Crítico.** Spec usa `<lead_phone>@<business_phone>` consistente con el bot. `getBotSessionId(leadPhone, businessPhone)`. Antes de deploy: validar con un `SELECT DISTINCT session_id FROM n8n_chat_histories LIMIT 10` para confirmar formato actual de producción y descartar que el ejemplo del founder fuera de un periodo previo. |
| H2 | "Próxima migration sería 0025" | Última en repo: 0021. Próxima libre: 0023 (porque 0022 la usa BOT-CTX-2). | Spec usa `0023_n8n_chat_histories_index.sql`. |
| H3 | "Server action vive en `src/app/a/[slug]/inbox/_actions/send-message.ts`" | Vive en `src/app/a/[slug]/inbox/actions.ts` (mismo archivo varias actions). | Spec apunta al path correcto. |
| H4 | "Existe `markConversationRead`, `markHandoffHandled`..." | Confirmado en el header de comments de `actions.ts`. | Helper `getBotSessionId` se importa desde `actions.ts`. |
| H5 | "Bot N8N hace POST DIRECTO sin row previo" | Confirmado para chunks normales. Excepción: OOH (Out of Office) ya pre-registra con `sender_kind='system'`. | Mirror NO debe disparar para `sender_kind='system'` (no aplica porque mirror es de aplicación, no de workflow). Pero si en el futuro el agente escribe rows con `sender_kind='system'` vía mirror erróneamente, agregar guard. |
| H6 | "Bot N8N escribe history con cabecera `# Contexto del lead`" | Verificado parcialmente — el `human` message del agente N8N tiene contenido enriquecido que incluye el system context. Sin embargo, esto es transparente: LangChain solo lee el array de mensajes y los rehidrata. Mirrors con `{type,content}` puro son válidos. | Sin cambio. Documentado en D2. |

---

## 12. Próximos pasos (no hacer aún)

- V2: mirror multimedia con placeholder estructurado `{type, content: "[imagen enviada por agente: <descripción AI generada>]"}`.
- V2: extraer `mirrorToBotHistory()` como utility compartida entre server action y edge function (`src/lib/bot/mirror.ts`).
- V2: dashboard interno (admin master) "Memoria del bot vs historial real" — diff por conversación para auditar drift.
- V3: si OBS detecta % alto de pérdidas (workflow falla y mensaje no entra al history), implementar mirror también desde aplicación cuando bot está activo pero handler N8N falla (requiere webhook de fallo del workflow).
