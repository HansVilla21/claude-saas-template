# 09 — Integración YCloud (WhatsApp Business API via BSP)

Documento técnico completo para construir chatbots conectados a WhatsApp via **YCloud** (Business Solution Provider). Cubre: API, webhooks, schemas, eventos, soporte de audios, patrones n8n y troubleshooting.

**Caso real:** Level/Kenneth (asesoría financiera, Costa Rica). Workflow de producción: `clients/level-kenneth/workflow/chatbot-level-leo-YCLOUD.json`.

---

## 1. ¿Qué es YCloud?

YCloud es un BSP (Business Solution Provider) oficial de Meta para WhatsApp Business API. Provee:

- API REST para enviar/recibir mensajes
- Webhooks para eventos (mensajes entrantes, status, etc.)
- Gestión del número WhatsApp Business (WABA)
- Templates de marketing (HSM)
- Dashboard para monitoreo

**Alternativas comparadas:**

| Solución | Ventajas | Desventajas |
|---|---|---|
| **YCloud** | API limpia, soporta audios via link directo, dashboard claro, no requiere Meta App propio | BSP de pago, dependencia de tercero |
| **Meta WhatsApp Cloud API** | Directo de Meta, gratis hasta 1000 conv/mes | Requiere registrar app, manejar tokens, descarga de media en 2 pasos |
| **Evolution API** | Self-hosted, gratis, no requiere número Business oficial | No oficial, depende de WhatsApp Web (puede romperse), no escalable |

YCloud es la opción **recomendada para producción** cuando el cliente quiere oficialidad, escalabilidad y simplicidad operativa. Para pruebas internas o demos baratas, Evolution API es más barata.

---

## 2. Setup inicial (lado YCloud)

### 2.1. Cuenta y número

1. Crear cuenta en https://www.ycloud.com/console/
2. Solicitar acceso a WhatsApp Business API:
   - Verificación de empresa con Meta
   - Registro del número (debe ser un número que NO esté usado en WhatsApp normal)
   - El proceso puede tomar 1-3 días
3. Una vez aprobado, el número aparece en Console > WhatsApp > Phone Numbers con status `CONNECTED`.

### 2.2. API Key

1. Console > **Developers > API Keys**
2. Click **Create API Key**
3. Guardar la key (formato `ycloud_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`)

Usar como header `X-API-Key` en todos los requests.

### 2.3. Webhook (para mensajes entrantes)

1. Console > **Developers > Webhooks**
2. Click **Create Webhook Endpoint**
3. Configurar:
   - **URL:** la URL de tu webhook en n8n (ej. `https://TU-N8N/webhook/ycloud-leo`)
   - **Events:** marcar `whatsapp.inbound_message.received` (cubre TODOS los tipos de mensaje entrante: texto, audio, imagen, etc.)
   - **Description:** opcional
4. YCloud genera un `secret` (`whsec_xxx`) — guardarlo si vas a verificar firmas HMAC en producción

**IMPORTANTE — qué NO activar:**
- `voice.message.updated` → es para llamadas VoIP/SMS de voz, NO para audios de WhatsApp
- `sms.*`, `email.*` → otros canales no relacionados
- `contact.*` → CRM de YCloud, no es necesario

Para futuro (opcional):
- `whatsapp.message.updated` → status de mensajes salientes (sent/delivered/read/failed) — útil para métricas
- `whatsapp.business_account.updated` → alertas de policy violations o suspensión

---

## 3. API Reference

### 3.1. Endpoints clave

| Método | Path | Uso |
|---|---|---|
| POST | `/v2/whatsapp/messages` | Enviar mensaje (queued, recomendado) |
| POST | `/v2/whatsapp/messages/sendDirectly` | Enviar mensaje (sync, para OTP / urgentes) |
| GET | `/v2/whatsapp/messages/{id}` | Consultar status de un mensaje saliente |
| POST | `/v2/whatsapp/inboundMessages/{id}/markAsRead` | Marcar entrante como leído (doble check azul) |
| GET | `/v2/whatsapp/businessAccounts` | Listar cuentas WABA |
| GET | `/v2/whatsapp/phoneNumbers` | Listar números registrados |
| POST | `/v2/whatsapp/templates` | Crear template (HSM) |
| GET | `/v2/whatsapp/templates` | Listar templates |
| POST | `/v2/webhookEndpoints` | Registrar webhook por API |
| GET | `/v2/webhookEndpoints` | Listar webhooks |

**Base URL:** `https://api.ycloud.com/v2`
**Auth:** header `X-API-Key: <api-key>`

### 3.2. Schema: Enviar mensaje de texto

```json
POST /v2/whatsapp/messages
Headers:
  X-API-Key: <key>
  Content-Type: application/json

Body:
{
  "from": "+E164",                    // tu número Business (E.164 con +)
  "to": "+E164",                      // destinatario (E.164 con +)
  "type": "text",
  "text": {
    "body": "Hola Hans!",             // máx 4096 chars
    "preview_url": false              // true para mostrar preview de URLs
  }
}
```

**Response 200:**
```json
{
  "id": "msg_xxxxxxxxxxxxxx",
  "wamid": "wamid.HBgL...",
  "wabaId": "...",
  "from": "+E164",
  "to": "+E164",
  "type": "text",
  "text": {"body": "..."},
  "status": "accepted",
  "createTime": "2026-04-24T..."
}
```

### 3.3. Schema: Enviar template (HSM)

Usado cuando estás fuera de la ventana de 24h o iniciás conversación.

```json
{
  "from": "+E164",
  "to": "+E164",
  "type": "template",
  "template": {
    "name": "welcome_message",
    "language": {"code": "es"},
    "components": [
      {
        "type": "body",
        "parameters": [
          {"type": "text", "text": "Hans"}
        ]
      }
    ]
  }
}
```

### 3.4. Schema: Otros tipos de mensaje saliente

`type` admite: `text`, `template`, `image`, `audio`, `video`, `document`, `sticker`, `location`, `interactive`, `contacts`, `reaction`.

Cada uno requiere un campo correspondiente:
- `image` / `audio` / `video` / `document` / `sticker` → objeto `{ link, caption?, filename? }`
- `location` → `{ latitude, longitude, name?, address? }`
- `interactive` → buttons o list (ver docs YCloud para schema completo)

### 3.5. Marcar como leído

```
POST /v2/whatsapp/inboundMessages/{ycloudMessageId}/markAsRead
Headers: X-API-Key: <key>

(sin body)

Response: 200 OK
```

`ycloudMessageId` es el `id` del `whatsappInboundMessage` que recibiste (NO el `wamid`).

---

## 4. Webhooks — Eventos entrantes

Cuando YCloud recibe un evento, hace `POST` al endpoint registrado con un body JSON. El **timeout es ~5-10s** — si tu webhook no responde 200 a tiempo, YCloud reintenta.

### 4.1. Schema general del Event

```json
{
  "id": "evt_xxx",                              // ID único del evento
  "type": "whatsapp.inbound_message.received",  // ver enum abajo
  "apiVersion": "v2",
  "createTime": "2026-04-24T22:35:00.000Z",
  // + objeto específico según el type
  "whatsappInboundMessage": { ... },            // si type es inbound_message.received
  "whatsappMessage": { ... },                   // si type es whatsapp.message.updated
  "whatsappBusinessAccount": { ... },           // si type es whatsapp.business_account.*
  "whatsappPhoneNumber": { ... },               // si type es whatsapp.phone_number.*
  "whatsappTemplate": { ... }                   // si type es whatsapp.template.*
}
```

### 4.2. Tipos de evento (enum)

| Type | Cuando se dispara |
|---|---|
| `whatsapp.inbound_message.received` | Usuario envía mensaje (cualquier tipo) |
| `whatsapp.message.updated` | Status de saliente cambia (sent/delivered/read/failed) |
| `whatsapp.business_account.deleted` | WABA eliminada |
| `whatsapp.business_account.reviewed` | WABA revisada por Meta |
| `whatsapp.business_account.updated` | Policy violation, ban, etc. |
| `whatsapp.phone_number.deleted` | Número eliminado |
| `whatsapp.phone_number.name_updated` | Nombre del número aprobado/rechazado |
| `whatsapp.phone_number.quality_updated` | Quality rating cambia (GREEN/YELLOW/RED) |
| `whatsapp.template.reviewed` | Template aprobado/rechazado |
| `whatsapp.template.quality_updated` | Quality rating de template |
| `whatsapp.template.category_updated` | Categoría de template cambia |
| `sms.message.updated`, `sms.inbound.received` | SMS (otro canal, no aplica a WhatsApp) |
| `email.delivery.updated`, `voice.message.updated` | Otros canales de YCloud |

### 4.3. Schema: WhatsappInboundMessage

```json
{
  "id": "abc123def456",                          // ID interno YCloud (úsalo para markAsRead)
  "wamid": "wamid.HBgL...",                      // ID original de WhatsApp
  "wabaId": "tu-waba-id",
  "from": "+E164",                               // número del usuario
  "to": "+E164",                                 // tu número Business
  "sendTime": "2026-04-24T22:35:00.000Z",
  "type": "text|image|video|audio|document|sticker|interactive|location|button|reaction|contacts|order|system|request_welcome|unsupported",
  "customerProfile": {
    "name": "Hans Villa"                         // nombre del contacto en WhatsApp
  },

  // según type, viene UNO de estos:
  "text": {"body": "..."},
  "image": { ...media },
  "video": { ...media },
  "audio": { ...media },
  "document": { ...media },
  "sticker": { ...media },
  "interactive": { ... },
  "location": {"latitude": ..., "longitude": ..., "name": ..., "address": ...},
  "button": { "text": ..., "payload": ... },
  "reaction": { "emoji": ..., "messageId": ... },
  "contacts": [ ... ],
  "order": { ... },
  "system": { ... },
  "errors": [ ... ],
  "context": { ... },
  "referral": { ... }
}
```

### 4.4. Schema: WhatsappInboundMessageMedia (audio, image, video, document, sticker)

```json
{
  "id": "media-id",                                          // ID del media
  "link": "https://...",                                     // URL para descargar (válida ~1 mes con X-API-Key)
  "mime_type": "audio/ogg; codecs=opus",                     // tipo MIME
  "sha256": "checksum",
  "caption": "texto opcional",                               // solo image, video, document
  "filename": "doc.pdf"                                      // solo document
}
```

**Para descargar el media:**

```
GET <link>
Headers: X-API-Key: <key>

Response: el archivo binario (audio/imagen/video/etc.)
```

El link es válido ~1 mes. Después se invalida.

### 4.5. Ejemplo: Payload de mensaje de texto entrante

```json
{
  "id": "evt_69ebf97638c1661fef0cddb4",
  "type": "whatsapp.inbound_message.received",
  "apiVersion": "v2",
  "createTime": "2026-04-24T23:15:02.747Z",
  "whatsappInboundMessage": {
    "id": "69ebf97638c1661fef0cddb2",
    "wamid": "wamid.HBgLNTA2ODgyMTcyMjkVAgASGBYzRUIwNzdhNDQ4NTRENzg2QkY5RUU0PQiY2RgyOTYxNAA=",
    "wabaId": "793034543386072",
    "from": "+50688217229",
    "to": "+50611112222",
    "sendTime": "2026-04-24T23:15:00.000Z",
    "type": "text",
    "customerProfile": { "name": "Hans" },
    "text": { "body": "Hola, quiero info sobre Level" }
  }
}
```

### 4.6. Ejemplo: Payload de nota de voz entrante

```json
{
  "id": "evt_xxx",
  "type": "whatsapp.inbound_message.received",
  "apiVersion": "v2",
  "createTime": "2026-04-24T23:20:00.000Z",
  "whatsappInboundMessage": {
    "id": "yyy",
    "wamid": "wamid.HBgL...",
    "wabaId": "...",
    "from": "+50688217229",
    "to": "+50611112222",
    "sendTime": "2026-04-24T23:19:55.000Z",
    "type": "audio",
    "customerProfile": { "name": "Hans" },
    "audio": {
      "id": "media-abc",
      "link": "https://api.ycloud.com/v2/whatsapp/...",
      "mime_type": "audio/ogg; codecs=opus",
      "sha256": "..."
    }
  }
}
```

---

## 5. Patrón de workflow n8n para YCloud

### 5.1. Estructura recomendada

```
[Webhook] (responseMode: onReceived, responseCode: 200)
   ↓
[Extract Variables]                    ← extrae from, to, text.body, audio.link, etc.
   ↓
[Switch by messageType]                ← text / audio / fallback
   ├─ text  → [Set Normalize] (userMessageFinal = userMessage)
   ├─ audio → [Download Audio] → [Transcribe Whisper] → [Set Normalize] (userMessageFinal = transcript)
   └─ otros → drop
                                       ↓ ambas ramas convergen
                       [resto del flujo del bot — IDÉNTICO al de Telegram/genérico]
                                       ↓
                       [HTTP POST a /whatsapp/messages] para enviar respuesta
```

### 5.2. Configuración del Webhook node

**CRÍTICO:** `responseMode` debe ser **`onReceived`** (responde 200 inmediato sin esperar el flujo).

```json
{
  "httpMethod": "POST",
  "path": "ycloud-{cliente}",
  "responseMode": "onReceived",
  "responseCode": 200,
  "responseData": "noData"
}
```

Si usás `responseNode` o `lastNode`, el webhook espera al flujo completo (15-30s) y YCloud da timeout → reintenta → mensajes duplicados. Ver `memory/feedback_webhook_response_mode.md`.

### 5.3. Extract Variables (Set node)

Campos a extraer del payload:

```
eventType        ← {{ $json.body.type }}
messageType      ← {{ $json.body.whatsappInboundMessage?.type ?? '' }}
userMessage      ← {{ $json.body.whatsappInboundMessage?.text?.body ?? '' }}
userPhone        ← {{ $json.body.whatsappInboundMessage?.from ?? '' }}
businessPhone    ← {{ $json.body.whatsappInboundMessage?.to ?? '' }}
ycloudMessageId  ← {{ $json.body.whatsappInboundMessage?.id ?? '' }}
customerName     ← {{ $json.body.whatsappInboundMessage?.customerProfile?.name ?? '' }}
audioLink        ← {{ $json.body.whatsappInboundMessage?.audio?.link ?? '' }}        // si soporta audio
audioMimeType    ← {{ $json.body.whatsappInboundMessage?.audio?.mime_type ?? '' }}   // si soporta audio
```

### 5.4. Send Message via YCloud (HTTP Request)

```json
{
  "method": "POST",
  "url": "https://api.ycloud.com/v2/whatsapp/messages",
  "authentication": "genericCredentialType",
  "genericAuthType": "httpHeaderAuth",
  "credentials": {
    "httpHeaderAuth": {"name": "YCloud API Key"}
  },
  "sendBody": true,
  "specifyBody": "json",
  "jsonBody": "={\n  \"from\": \"{{ $('Extract Variables').first().json.businessPhone }}\",\n  \"to\": \"{{ $('Extract Variables').first().json.userPhone }}\",\n  \"type\": \"text\",\n  \"text\": {\n    \"body\": {{ JSON.stringify($json.output) }}\n  }\n}"
}
```

**Crítico:** usar `JSON.stringify($json.output)` para escapar correctamente saltos de línea, comillas y caracteres especiales en el body del mensaje.

### 5.5. Mark As Read (opcional, mejora UX)

```json
{
  "method": "POST",
  "url": "=https://api.ycloud.com/v2/whatsapp/inboundMessages/{{ $('Extract Variables').first().json.ycloudMessageId }}/markAsRead",
  "authentication": "genericCredentialType",
  "genericAuthType": "httpHeaderAuth",
  "credentials": {
    "httpHeaderAuth": {"name": "YCloud API Key"}
  },
  "onError": "continueRegularOutput"
}
```

Poner en paralelo con el flujo principal. Si falla, no afecta el bot.

### 5.6. Credencial en n8n

Tipo: **Header Auth**
- Name: `X-API-Key`
- Value: tu API key de YCloud

Asignarla a TODOS los nodos HTTP de YCloud (Send Reinicio, Send Handoff, Send Chunk, Mark As Read, Download Audio si soporta).

---

## 6. Soporte de audios (notas de voz)

Cuando el cliente quiere que el bot procese notas de voz, agregar branch de transcripción.

### 6.1. Flujo

```
Switch by messageType
  ├─ text  → Set Normalize (userMessageFinal = userMessage)            ┐
  ├─ audio → Download Audio (HTTP GET con X-API-Key, response file)    │
  │           → Transcribe (HTTP POST a OpenAI Whisper)                │
  │           → Set Normalize (userMessageFinal = $json.text)          │
  └─ otros → drop                                                       ↓
                                                                  ID y Mensaje
                                                                  (Mensaje = $json.userMessageFinal)
```

### 6.2. Download Audio (HTTP Request)

```json
{
  "method": "GET",
  "url": "={{ $('Extract Variables').first().json.audioLink }}",
  "authentication": "genericCredentialType",
  "genericAuthType": "httpHeaderAuth",
  "credentials": {
    "httpHeaderAuth": {"name": "YCloud API Key"}
  },
  "options": {
    "response": {
      "response": {
        "responseFormat": "file",
        "outputPropertyName": "data"
      }
    }
  }
}
```

Output: el binary del audio queda en `$binary.data`.

### 6.3. Transcribe con Whisper (HTTP Request)

**NO usar el nodo `n8n-nodes-base.openAi`** — puede no estar disponible en versiones antiguas de n8n. Usar HTTP Request directo.

```json
{
  "method": "POST",
  "url": "https://api.openai.com/v1/audio/transcriptions",
  "authentication": "predefinedCredentialType",
  "nodeCredentialType": "openAiApi",
  "sendBody": true,
  "contentType": "multipart-form-data",
  "bodyParameters": {
    "parameters": [
      {"parameterType": "formBinaryData", "name": "file", "inputDataFieldName": "data"},
      {"name": "model", "value": "whisper-1"},
      {"name": "language", "value": "es"}
    ]
  }
}
```

Output: `{"text": "transcripción..."}`.

**Detalles importantes:**
- Whisper acepta OGG/Opus directamente (formato nativo de notas de voz de WhatsApp). NO hace falta convertir.
- `predefinedCredentialType: "openAiApi"` reutiliza la credencial OpenAI que ya tenés (no crear Header Auth duplicada).
- `language: "es"` mejora precisión en castellano.
- Costo: ~$0.006 USD/min de audio.
- Límite Whisper: 25 MB por archivo.

### 6.4. Set Normalize (en ambas ramas)

**Branch text:**
```
userMessageFinal = {{ $('Extract Variables').first().json.userMessage }}
```

**Branch audio (después de Whisper):**
```
userMessageFinal = {{ $json.text }}
```

### 6.5. Adaptar el primer nodo del flujo del bot

Si el flujo tenía un nodo `ID y Mensaje` (o equivalente) que leía el mensaje del trigger, cambiarlo para leer `userMessageFinal`:

```
Mensaje = {{ $json.userMessageFinal }}    (en vez de userMessage)
```

Así el agente recibe siempre texto, sin enterarse de si vino de audio o no.

---

## 7. Patrón de variantes de workflow para un cliente

Para un cliente típico (ej. Level), tenemos 5 variantes de workflow, todas con el mismo bot pero diferentes canales/configs:

| Variante | Canal | DB | Reset | Audio | Uso |
|---|---|---|---|---|---|
| `chatbot-{cliente}.json` | YCloud o Evolution | Postgres + Redis batching + Airtable | sí | configurable | Producción |
| `chatbot-{cliente}-TELEGRAM.json` | Telegram bot | Postgres + Redis (solo reset) | sí | no | Demo via Telegram |
| `chatbot-{cliente}-YCLOUD.json` | YCloud / WhatsApp | Postgres + Redis (solo reset) | sí | sí | Demo via WhatsApp |
| `chatbot-{cliente}-TEST.json` | n8n internal chat | sin DB | no | no | Testing rápido por dev |
| `chatbot-{cliente}-YCLOUD-TEST.json` | YCloud / WhatsApp | sin DB | no | no | Test mínimo del canal YCloud |

**Regla clave:** las variantes deben ser **copia exacta** del workflow base, cambiando SOLO el canal. NO simplificar componentes (Postgres, Redis reset, memorias) que el base ya tiene. Ver `memory/feedback_workflow_variants_minimal_changes.md`.

---

## 8. Troubleshooting

### 8.1. Webhook no recibe nada

- Verificar workflow `Active` en n8n.
- Verificar URL en YCloud Console > Webhooks coincide exactamente con la del workflow.
- Verificar el path del webhook (`/ycloud-leo` vs `/ycloud-leo-test` — son diferentes).
- En YCloud Console > Webhooks > endpoint > log de delivery: ver si hay errores 4xx/5xx.

### 8.2. `REQUEST_EXCEPTION (Client.Timeout exceeded)` en YCloud

Causa: n8n no responde 200 dentro del timeout (~5-10s).

Fix: Webhook node con `responseMode: "onReceived"`. Si tenés `responseNode` o `lastNode`, n8n espera al flujo completo y YCloud da timeout.

Síntomas adicionales: el bot responde **mensajes duplicados** o triplicados al usuario porque YCloud reintenta el evento al fallar el timeout.

### 8.3. HTTP Send 401 Unauthorized

- Credencial Header Auth mal configurada. El header debe ser exactamente `X-API-Key` (case-sensitive).
- API key inválida o revocada.

### 8.4. HTTP Send 400 Bad Request

Causas comunes:
- `from` no es un número registrado en tu cuenta YCloud.
- `to` no está en formato E.164 (debe empezar con `+`).
- Body mal formado (JSON inválido, caracteres no escapados). Verificar que `text.body` use `JSON.stringify` para escapar.
- Estás fuera de la ventana de 24h y mandás texto plano. Para iniciar conversación, hay que usar template (HSM aprobado por Meta).

### 8.5. Mensajes llegan en orden incorrecto

WhatsApp puede recibir 2 mensajes con timestamps muy cercanos en orden invertido. Solución: nodo `Wait` (1-2s) entre cada chunk del formateador.

### 8.6. El bot recibe el mismo mensaje 3-4 veces

- Casi siempre es el bug de `responseMode` (ver 8.2).
- Verificar también que no haya 2 webhooks registrados en YCloud apuntando al mismo path.

### 8.7. El nodo OpenAI no carga ("Install this node to use it")

`n8n-nodes-base.openAi` con typeVersion reciente puede no estar disponible en versiones antiguas de n8n self-hosted.

Fix: reemplazar por `HTTP Request` directo. Ver `memory/feedback_n8n_openai_node_workaround.md`.

### 8.8. Whisper devuelve transcripción incorrecta o vacía

- Verificar que el binary se está pasando correctamente (`outputPropertyName: data` en Download → `inputDataFieldName: data` en Transcribe).
- Verificar que `language: "es"` esté seteado.
- Si el audio es muy corto (<1s), Whisper a veces devuelve cadena vacía.
- Si el audio es muy largo (>25MB), Whisper rechaza.

### 8.9. Mensaje "Listo, conversación reiniciada" se manda pero el bot sigue recordando todo

El flujo de reset borra Postgres + Redis. Si la memoria no se limpia:
- Verificar que `Vacia Redis` y `Delete Postgres historial` se ejecutaron (ver execution log).
- Verificar que el `session_id` que usan es el `userPhone` (E.164 con `+`).
- Verificar credencial de Postgres correcta y schema `n8n_chat_histories` existe.

---

## 9. Referencias

- **YCloud Console:** https://www.ycloud.com/console/
- **YCloud Docs:** https://docs.ycloud.com/
- **OpenAPI v2 Spec:** https://raw.githubusercontent.com/YCloud-Developers/ycloud-whatsapp-mcp-server/main/ycloud-api-v2.yaml
- **MCP Server:** https://github.com/YCloud-Developers/ycloud-whatsapp-mcp-server
- **Templates anonimizados del proyecto:** `knowledge/workflow-variants-templates/YCLOUD-template.json` y `YCLOUD-AUDIO-template.json`
- **Caso de uso Level:** `clients/level-kenneth/workflow/chatbot-level-leo-YCLOUD.json` + `workflow-ycloud-full-config.md`
- **Memory:**
  - `reference_ycloud.md` — pointers a recursos YCloud
  - `feedback_webhook_response_mode.md` — onReceived obligatorio
  - `feedback_audio_transcription_pattern.md` — patrón de transcripción
  - `feedback_n8n_openai_node_workaround.md` — fallback HTTP a OpenAI
  - `feedback_workflow_variants_minimal_changes.md` — copia exacta + cambio de canal
