# 04 — Payload ManyChat multi-canal

Cómo ManyChat envía el webhook a n8n con la estructura nueva que soporta WA + IG en el mismo workflow.

## Payload completo (estructura nueva)

```json
{
  "body": {
    "data": {
      "key": "user:1515862162",
      "id": "1515862162",
      "page_id": "210878508779055",
      "user_refs": [],
      "status": "active",
      "first_name": "Hans",
      "last_name": "",
      "name": "Hans",
      "gender": null,
      "profile_pic": null,
      "locale": null,
      "language": null,
      "timezone": "UTC±00",
      "live_chat_url": "https://app.manychat.com/fb1001816/chat/1515862162",
      "last_input_text": "Hola, busco villa para 10 personas",
      "optin_phone": false,
      "phone": null,
      "optin_email": false,
      "email": null,
      "subscribed": "2026-05-04T10:54:33-06:00",
      "last_interaction": null,
      "ig_last_interaction": null,
      "last_seen": null,
      "ig_last_seen": null,
      "is_followup_enabled": true,
      "ig_username": null,
      "ig_id": null,
      "whatsapp_phone": "+50688217229",
      "whatsapp_bsuid": null,
      "whatsapp_username": null,
      "optin_whatsapp": true,
      "tt_user_id": null,
      "tt_username": null,
      "tt_optin": false,
      "phone_country_code": null,
      "last_growth_tool": null,
      "custom_fields": {
        "Respuesta Chatbot": null
      }
    },
    "canal": "WA"
  }
}
```

## Diferencia respecto al payload viejo (single-canal)

| Aspecto | Payload viejo (single-canal) | Payload nuevo (multi-canal) |
|---|---|---|
| Estructura del subscriber data | `body.X` directo | `body.data.X` |
| Indicador de canal | Inferir por presencia de `whatsapp_phone` vs `ig_id` | Campo explícito `body.canal` ("WA" / "IG") |
| Flow para responder | Hardcoded por workflow | Condicional según `canal` |

## Campos importantes y dónde se mapean

| Campo del payload | Uso en n8n / Supabase |
|---|---|
| `body.data.id` | `manychat_id` (identificador primario del lead) |
| `body.data.page_id` | `manychat_page_id` |
| `body.data.name` | `display_name` |
| `body.data.first_name` + `last_name` | `full_name` (concat + trim) |
| `body.data.whatsapp_phone` | `whatsapp_phone` y `phone` (E.164) |
| `body.data.ig_id` | `ig_user_id` |
| `body.data.ig_username` | `ig_username` |
| `body.data.live_chat_url` | `live_chat_url` (link directo a ManyChat para el founder) |
| `body.data.last_input_text` | El mensaje real del user (texto, ya transcrito si era audio por ManyChat) |
| `body.canal` | "WA" o "IG" — indica canal de entrada |
| `body.data.custom_fields.Respuesta Chatbot` | El custom field donde el bot va a setear su respuesta |

## Mapeo en `Edit Fields2`

```javascript
ID:                ={{ $('Webhook').item.json.body.data.id }}
Mensaje:           ={{ $('Webhook').item.json.body.data.last_input_text }}
manychat_id:       ={{ $('Webhook').item.json.body.data.id }}
manychat_page_id:  ={{ $('Webhook').item.json.body.data.page_id }}
display_name:      ={{ $('Webhook').item.json.body.data.name }}
first_name:        ={{ $('Webhook').item.json.body.data.first_name }}
last_name:         ={{ $('Webhook').item.json.body.data.last_name }}
whatsapp_phone:    ={{ $('Webhook').item.json.body.data.whatsapp_phone }}
ig_id:             ={{ $('Webhook').item.json.body.data.ig_id }}
ig_username:       ={{ $('Webhook').item.json.body.data.ig_username }}
live_chat_url:     ={{ $('Webhook').item.json.body.data.live_chat_url }}
canal:             ={{ $('Webhook').item.json.body.canal }}
channel:           ={{ $('Webhook').item.json.body.canal === 'WA' ? 'whatsapp' : ($('Webhook').item.json.body.canal === 'IG' ? 'instagram' : 'messenger') }}
external_id:       ={{ $('Webhook').item.json.body.data.id + '_' + Date.now() }}
```

**Importante:** `body.canal` vive directamente en `body`, NO en `body.data`. ManyChat lo agrega como flag externo.

## Configuración en ManyChat (lado del founder)

Para que ManyChat envíe este payload, hay 2 External Requests en ManyChat (uno por canal):

### External Request para WhatsApp
- URL: `https://n8n-tu-instancia/webhook/{webhook-path-multicanal}`
- Method: POST
- Headers: Content-Type: application/json
- Body:
  ```json
  {
    "data": "{{user}}",
    "canal": "WA"
  }
  ```

### External Request para Instagram
- URL: `https://n8n-tu-instancia/webhook/{webhook-path-multicanal}` (MISMO URL)
- Method: POST
- Body:
  ```json
  {
    "data": "{{user}}",
    "canal": "IG"
  }
  ```

ManyChat reemplaza `{{user}}` con el objeto subscriber completo. El campo `canal` lo agrega ManyChat literal.

## Flujo de respuesta (cómo el bot envía mensaje al user)

Para que el bot envíe la respuesta al user, n8n hace 2 cosas:

### 1. Setear custom field con el texto del mensaje
```http
POST https://api.manychat.com/fb/subscriber/setCustomField
Authorization: Bearer {MANYCHAT_API_TOKEN}
Content-Type: application/json

{
  "subscriber_id": "{manychat_id}",
  "field_id": "{MANYCHAT_FIELD_ID_RESPUESTA}",
  "field_value": "{texto del mensaje a enviar}"
}
```

### 2. Disparar el flow correspondiente al canal
```http
POST https://api.manychat.com/fb/sending/sendFlow
Authorization: Bearer {MANYCHAT_API_TOKEN}
Content-Type: application/json

{
  "subscriber_id": "{manychat_id}",
  "flow_ns": "{flow_ns_segun_canal}"   ← AQUÍ va la diferencia WA vs IG
}
```

El flow en ManyChat lee el custom field "Respuesta Chatbot" y lo envía como mensaje al user.

### Expression condicional para `flow_ns`

```javascript
={{ $('Edit Fields2').first().json.canal === 'IG' ? 'content20251123073305_186664' : 'content20260416033957_434106' }}
```

(Los valores `content...` son los flow_ns reales de Jacó; cada cliente tiene los suyos en `MANYCHAT_FLOW_NS_WA` y `MANYCHAT_FLOW_NS_IG`.)

## Edge cases del payload

### Caso 1: Audio (ManyChat lo transcribe)
ManyChat tiene transcripción built-in. Cuando el user manda audio, `body.data.last_input_text` viene con la transcripción. **No necesitamos Whisper.**

### Caso 2: Imagen / sticker / archivo
`last_input_text` viene vacío o con un placeholder. El clasificador inicial debería detectar este caso como "media sin texto" y hacer handoff.

### Caso 3: Reply a mensaje del bot
ManyChat NO envía el contexto del reply. El bot tiene que entender desde el `last_input_text` solo. Si necesitás detectar replies, hay que parsear el texto.

### Caso 4: Lead unificado WA + IG
Si el mismo user te contacta primero por WA y después por IG, ManyChat (con merge subscribers activo) puede asignarle el mismo `subscriber_id`. En ese caso:
- `body.data.whatsapp_phone` Y `body.data.ig_id` ambos populated.
- `body.canal` indica desde cuál canal vino ESTE mensaje específico.
- En `leads`, una sola row con ambos `whatsapp_phone` Y `ig_user_id`.
- En `conversations`, **2 rows** (una por canal). Cada canal mantiene su propia conversación.

### Caso 5: Lead sin teléfono (solo Instagram)
- `body.data.whatsapp_phone` = null
- `body.data.ig_id` = "..." (poblado)
- `body.canal` = "IG"
- `channel` derivado = "instagram"
- En `leads`: `whatsapp_phone` queda NULL, `ig_user_id` poblado.

## Diagrama del flujo de payload

```
ManyChat detecta nuevo mensaje
  ↓
ManyChat construye payload:
  - body.data = subscriber completo
  - body.canal = "WA" o "IG" según el flow que dispara
  ↓
POST a n8n webhook URL
  ↓
n8n recibe en Webhook node
  ↓
Edit Fields2 extrae body.data.X campos + body.canal
  ↓
Resto del workflow (mismo para WA e IG)
  ↓
Al final, ManyChat HTTP POST:
  - setCustomField (con texto del mensaje del bot)
  - sendFlow (con flow_ns CONDICIONAL según canal)
  ↓
ManyChat envía el mensaje al user en su canal
```

## Lo crítico de recordar

1. `body.data.X` para campos del subscriber (NO `body.X`).
2. `body.canal` para el indicador WA/IG (NO `body.data.canal`).
3. `channel` para Supabase se DERIVA de canal con expression condicional.
4. `flow_ns` para enviar respuesta es CONDICIONAL según canal.
5. ManyChat ya transcribe audios → no necesitamos Whisper.
