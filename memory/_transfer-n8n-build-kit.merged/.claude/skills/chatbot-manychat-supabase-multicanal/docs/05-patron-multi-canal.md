# 05 — Patrón multi-canal (1 workflow para WA + IG)

## Por qué un solo workflow (no dos)

Tener un workflow por canal (uno para WA, otro para IG) es waste:

- La lógica del bot es idéntica (mismo prompt del agente principal).
- El routing es idéntico (mismo Information Extractor).
- El formateador es idéntico (mismo Basic LLM Chain).
- La memoria es idéntica (mismo Postgres Chat Memory).
- El RAG es idéntico.

**Lo único que cambia entre WA e IG:** el `flow_ns` del último HTTP request a ManyChat (uno por canal). Y eso se resuelve con un expression condicional, no con un workflow entero duplicado.

## Cómo se logra

### 1. ManyChat estructura el payload con `body.canal`

Ver `04-payload-manychat-multicanal.md`. El external request de ManyChat agrega un campo `body.canal` que indica "WA" o "IG" según el flow que disparó el webhook.

### 2. `Edit Fields2` deriva el `channel` para Supabase

```javascript
channel = body.canal === 'WA' ? 'whatsapp' :
          (body.canal === 'IG' ? 'instagram' : 'messenger')
```

Esto mapea:
- `canal: "WA"` → `channel: "whatsapp"` (que es lo que Supabase espera en el enum `message_channel`)
- `canal: "IG"` → `channel: "instagram"`

### 3. Las queries Postgres usan `channel` directamente

Las queries de `leads`, `conversations`, `messages` ya usan `channel` como parámetro. No requieren cambios — solo que llegue el valor correcto.

```sql
INSERT INTO public.conversations (agency_id, lead_id, channel, ...)
VALUES (..., ..., $1::message_channel, ...)
```

Donde `$1` = `whatsapp` o `instagram` según el canal de entrada.

### 4. Los HTTP requests finales a ManyChat usan `flow_ns` condicional

En los nodos `Set Respuesta Chatbot 2` (setCustomField) y `Send Respuest Chatbot` (sendFlow):

```javascript
flow_ns: ={{ $('Edit Fields2').first().json.canal === 'IG' ? 'content20251123073305_186664' : 'content20260416033957_434106' }}
```

Si canal es IG → usa el flow_ns de Instagram (el flow en ManyChat que envía respuestas por IG).
Si canal es WA (o cualquier otro) → usa el flow_ns de WhatsApp.

## Configuración en ManyChat (lado del founder)

Para que esto funcione, en ManyChat hay que tener:

### 2 External Requests separados (uno por canal)
Ambos apuntan al MISMO webhook de n8n, pero envían `canal` distinto:

| External Request | URL | Body.canal |
|---|---|---|
| WA External Request | `https://n8n.../webhook/{path}` | `"WA"` |
| IG External Request | `https://n8n.../webhook/{path}` | `"IG"` |

### 2 Flows de respuesta (uno por canal)
Cada flow lee el custom field "Respuesta Chatbot" y envía el contenido como mensaje en el canal correspondiente:

| Flow | flow_ns | Función |
|---|---|---|
| Responder por WhatsApp | `content...XXX_434106` | Envía el contenido del custom field como mensaje de WhatsApp |
| Responder por Instagram | `content...XXX_186664` | Envía el contenido del custom field como mensaje de Instagram |

Estos flows son simples: 1 nodo que lee el custom field y envía.

### 1 Custom Field compartido

`Respuesta Chatbot` (text type) — donde el bot escribe la respuesta antes de disparar el flow. Es el mismo para WA e IG.

## Diagrama visual del workflow multi-canal

```
                  ┌─────────────────────────────────┐
                  │  ManyChat (WhatsApp + Instagram)│
                  │  ┌──────────┐  ┌──────────┐    │
                  │  │ WA Flow  │  │ IG Flow  │    │
                  │  │ External │  │ External │    │
                  │  │ Request  │  │ Request  │    │
                  │  └────┬─────┘  └────┬─────┘    │
                  └───────┼─────────────┼──────────┘
                          │             │
                       canal="WA"    canal="IG"
                          │             │
                          └──────┬──────┘
                                 ↓
                  ┌───────────────────────────────┐
                  │      n8n Webhook (UNO)        │
                  └───────────────┬───────────────┘
                                  ↓
                  ┌───────────────────────────────┐
                  │       Edit Fields2             │
                  │   channel = body.canal === 'WA'│
                  │     ? 'whatsapp'               │
                  │     : 'instagram'              │
                  └───────────────┬───────────────┘
                                  ↓
                  ┌───────────────────────────────┐
                  │   Resto del workflow           │
                  │   (idéntico para WA e IG)     │
                  │   - Buscar Lead                │
                  │   - Crear Lead / Conversation │
                  │   - Batching                   │
                  │   - AI Agent                   │
                  │   - Formateador                │
                  └───────────────┬───────────────┘
                                  ↓
                  ┌───────────────────────────────┐
                  │   Send Respuest Chatbot       │
                  │   flow_ns = canal === 'IG'    │
                  │     ? IG_FLOW                 │
                  │     : WA_FLOW                 │
                  └───────────────┬───────────────┘
                                  ↓
                  ┌───────────────────────────────┐
                  │  ManyChat envía el mensaje    │
                  │  al user en su canal correcto │
                  └───────────────────────────────┘
```

## Trazabilidad: lead → conversation → mensaje

Cuando el mismo lead te contacta primero por WA y después por IG:

```sql
-- Una sola row en leads (con manychat_id único)
SELECT id, manychat_id, display_name, whatsapp_phone, ig_user_id
FROM public.leads
WHERE manychat_id = '1515862162';
-- → 1 row, ambos canales asociados al mismo subscriber

-- DOS rows en conversations (una por canal)
SELECT id, channel, handler, last_message_at
FROM public.conversations
WHERE lead_id = '{lead_id}'
ORDER BY channel;
-- → 2 rows: una con channel='whatsapp', otra con 'instagram'

-- Mensajes separados por canal
SELECT c.channel, m.direction, m.body, m.created_at
FROM public.messages m
JOIN public.conversations c ON c.id = m.conversation_id
WHERE m.lead_id = '{lead_id}'
ORDER BY m.created_at;
-- → Mezclados, pero cada uno asociado a su channel via conversation_id
```

## Ventajas de este patrón

1. **Mantenibilidad:** un cambio al prompt del Agent se aplica automáticamente a WA y a IG.
2. **Consistencia:** mismo comportamiento del bot en ambos canales.
3. **Trazabilidad:** un solo lead con todos sus canales asociados.
4. **Escalabilidad:** agregar Messenger sería trivial — solo un valor más en el switch del flow_ns y un External Request más en ManyChat.

## Limitaciones conocidas

- **Si los flows de ManyChat cambian de nombre:** hay que actualizar los `flow_ns` en el `.env` Y en los expressions del workflow (2 lugares).
- **Si querés behaviors distintos por canal** (ej. bot más casual en IG, más formal en WA): NO se logra con este patrón. Habría que branchear el prompt según canal antes del AI Agent. Aún así, mejor que 2 workflows duplicados.

## Cómo agregar un canal nuevo (ej. Messenger o Telegram)

1. **Setear `canal` value nuevo** en ManyChat (ej. "MSG" para Messenger).
2. **En `Edit Fields2`**, expandir el ternario del channel:
   ```javascript
   channel = canal === 'WA' ? 'whatsapp' :
             canal === 'IG' ? 'instagram' :
             canal === 'MSG' ? 'messenger' :
             'manual'
   ```
3. **Agregar flow_ns nuevo** en ManyChat para el canal.
4. **En `Send Respuest Chatbot`**, expandir el ternario:
   ```javascript
   flow_ns = canal === 'IG' ? IG_FLOW :
             canal === 'MSG' ? MSG_FLOW :
             WA_FLOW
   ```
5. Agregar `MANYCHAT_FLOW_NS_MSG` al `.env`.

El schema CORE ya soporta los enums (`messenger`, `sms`, `voice`, etc.) — no requiere migration.
