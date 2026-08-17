# 07 — Variantes del workflow por canal

Cada cliente requiere típicamente 3-5 variantes del mismo workflow, una por cada canal/situación de uso. Este capítulo cubre cada variante, cuándo usarla, y las diferencias técnicas con el template base.

---

## 1. Por qué múltiples variantes

Un cliente típico necesita:

- **Producción** — el bot real conectado al canal del cliente
- **Testing interno** — el equipo técnico necesita probar la lógica sin pasar por canales externos
- **Demo al cliente** — el cliente quiere ver el bot funcionando antes de aprobar el deploy a producción

Cada situación requiere un workflow diferente. Las diferencias son técnicas (canal, batching, persistencia) pero los **prompts son IDÉNTICOS** entre todas las variantes (verificación con hash MD5, ver [Cap 10 §3](10-entrega-gobernanza.md)).

---

## 2. Tabla de variantes

| Variante | Archivo | Canal | DB | Reset | Audio | Cuándo usar |
|---|---|---|---|---|---|---|
| **Producción** | `chatbot-{cliente}.json` | YCloud / Evolution / ManyChat | Postgres + Redis batching + Airtable | sí | configurable | Deploy final al cliente |
| **TEST** | `chatbot-{cliente}-TEST.json` | n8n internal chat | sin DB | no | no | Testing rápido por dev |
| **TELEGRAM** | `chatbot-{cliente}-TELEGRAM.json` | Telegram bot | Postgres + Redis (solo reset) | sí | no | Demo via Telegram al cliente |
| **YCLOUD** | `chatbot-{cliente}-YCLOUD.json` | YCloud / WhatsApp | Postgres + Redis (solo reset) | sí | sí | Demo via WhatsApp al cliente |
| **YCLOUD-TEST** | `chatbot-{cliente}-YCLOUD-TEST.json` | YCloud / WhatsApp | sin DB | no | no | Test mínimo del canal YCloud |

**Templates anonimizados disponibles en:** [`knowledge/workflow-variants-templates/`](../knowledge/workflow-variants-templates/)

---

## 3. Variante TEST (chat interno de n8n)

### 3.1 Cuándo usar

- Desarrollador construye/modifica un prompt y necesita probarlo en segundos
- Equipo técnico verifica que el routing del Information Extractor funciona
- Iteración rápida sin afectar Postgres ni canales externos

### 3.2 Estructura (~15 nodos)

```
Chat Trigger (n8n internal chat)
   ↓
Variables (Set: sessionId → chat_id)
   ↓
Conversation (Postgres Chat Memory, solo lectura)
   ↓
Code (formatear historial)
   ↓
Unificación de Variables (Set)
   ↓
Information Extractor (router)
   ↓
Switch (4 rutas):
   ├─ AGENTE_PRINCIPAL → AI Agent Principal [terminal]
   ├─ AGENTE_OBJECIONES → AI Agent Objeciones [terminal]
   ├─ HANDOFF_HUMANO → Set node (mensaje estático) [terminal]
   └─ BACKUP → AI Agent Principal [terminal]
```

### 3.3 Diferencias con producción

| Componente | Producción | TEST |
|---|---|---|
| Trigger | Webhook (canal externo) | Chat Trigger (n8n internal) |
| Airtable ON/OFF | Sí | No |
| Audio | Sí | No |
| REINICIAR keyword | Sí | No (cada chat es nueva sesión por sessionId) |
| Buscar/Crear Lead | Sí (Airtable) | No |
| Redis batching | Sí | No |
| Formateador | Sí (Basic LLM Chain) | No (chat interno acepta texto crudo) |
| Loop de envío | Sí | No (los agentes son terminales) |

### 3.4 Por qué TEST simplificado funciona

- El chat interno de n8n muestra el output del AI Agent directamente
- No hay canal externo que requiera batching o formateo
- La memoria Postgres funciona igual (compartida con producción si se desea)

### 3.5 Setup

1. Duplicar `TEST-template.json` como `clients/{cliente}/workflow/chatbot-{cliente}-TEST.json`
2. Reemplazar placeholders:
   - `{{NOMBRE_EMPRESA}}` → nombre real
   - `{{BOT_NOMBRE}}` → nombre del bot
   - `{{AGENTE_PRINCIPAL_NOMBRE}}` → identificador del agente principal (ej: `EVA_PRINCIPAL`)
3. Pegar prompts completos desde `clients/{cliente}/prompts/*.md`
4. Verificar con hash MD5 que los prompts coinciden con el cliente
5. Importar en n8n
6. Click en el Chat Trigger para abrir el chat interno
7. Probar conversaciones

### 3.6 Limitaciones del TEST

- Solo prueba la lógica del agente y el routing
- No prueba: formateo de mensajes, envío a canal, audio, batching, Airtable
- Para pruebas end-to-end usar TELEGRAM o YCLOUD

---

## 4. Variante TELEGRAM

### 4.1 Cuándo usar

- Demo al cliente — el cliente prueba el bot como lo usaría su lead, vía Telegram
- Cliente quiere probar sin tener que conectar su WhatsApp aún
- Bajo costo de setup (crear bot en @BotFather toma 2 minutos)

### 4.2 Estructura (~30 nodos)

```
Telegram Trigger
   ↓
ID y Mensaje (extrae chat_id + text)
   ↓
REINICIAR? (IF)
   ├─ TRUE → Redis delete + Postgres delete + Telegram Send "Listo" [FIN]
   └─ FALSE → Variables → Conversation (Postgres) → Code formatear historial 
              → Unificación
              ↓
              Information Extractor (router) → Switch (4 rutas):
                 ├─ AGENTE_PRINCIPAL → AI Agent Principal
                 ├─ AGENTE_OBJECIONES → AI Agent Objeciones
                 ├─ HANDOFF_HUMANO → Telegram Send Handoff [FIN]
                 └─ BACKUP → AI Agent Principal
              ↓
              [agentes] → Basic LLM Chain (formateador) → Split Out → Loop
                 → IF (no empty) → Telegram Send Chunk → Wait 1.5s → loop back
```

### 4.3 Diferencias con producción

| Componente | Producción (ManyChat/YCloud) | TELEGRAM |
|---|---|---|
| Trigger | Webhook canal | Telegram Trigger |
| Send | ManyChat API / YCloud HTTP | Telegram Send |
| Airtable | Sí (CRM real) | No (solo demo) |
| Redis | Sí (batching) | Solo para reset |
| Audio | Sí | No |

### 4.4 Configuración de Telegram

**Crear el bot en Telegram:**

1. Hablar con @BotFather en Telegram
2. `/newbot` → seguir instrucciones
3. Guardar el token (formato `123456:ABC-DEF...`)
4. En n8n: crear credencial "Telegram API" con ese token

**Configurar el Telegram Trigger en n8n:**

```json
{
  "type": "n8n-nodes-base.telegramTrigger",
  "parameters": {
    "updates": ["message"]
  }
}
```

**Configurar Telegram Send (CRÍTICO: appendAttribution false):**

```json
{
  "type": "n8n-nodes-base.telegram",
  "typeVersion": 1.2,
  "parameters": {
    "chatId": "={{ $('ID y Mensaje').first().json.ID }}",
    "text": "={{ $json.message }}",
    "additionalFields": {
      "appendAttribution": false
    }
  }
}
```

**Aplicar `appendAttribution: false` a TODOS los 3 nodos Telegram Send:** Reinicio, Handoff, Chunk.

### 4.5 Setup completo

1. Duplicar `TELEGRAM-template.json` como `clients/{cliente}/workflow/chatbot-{cliente}-TELEGRAM.json`
2. Crear el bot con @BotFather, obtener token
3. Crear credencial en n8n: "[Cliente] - Telegram"
4. Reemplazar placeholders del template (igual que TEST)
5. Pegar prompts completos
6. Verificar `appendAttribution: false` en los 3 Telegram Send
7. Importar en n8n
8. Conectar credenciales (Telegram, OpenAI, Postgres, Redis)
9. Activar el workflow
10. Buscar el bot en Telegram, hablarle, probar conversación

### 4.6 Compartir el demo con el cliente

Mensaje sugerido al cliente:

> "Te paso el enlace al bot en Telegram para que pruebes:
> https://t.me/[tu_bot_username]
>
> Hablale como si fueras un lead tuyo. Si querés reiniciar la conversación
> en cualquier momento, escribí 'REINICIAR'."

---

## 5. Variante YCLOUD (WhatsApp via BSP)

### 5.1 Cuándo usar

- Producción para clientes que quieren WhatsApp Business API oficial
- Demo al cliente vía WhatsApp real (más realista que Telegram)
- Cliente necesita features oficiales: templates, broadcasts, App Coexistence

### 5.2 Estructura (~33 nodos)

```
Webhook (responseMode: onReceived)
   ↓
Extract Variables (Set: extrae from, to, text, type, ycloudMessageId, customerName)
   ↓
IF (text inbound)
   ├─ true ─→ Mark As Read (HTTP YCloud, paralelo)
   │           ID y Mensaje
   │              ↓
   │           REINICIAR? (IF)
   │              ├─ true → Vacia Redis + Delete Postgres + Send Reinicio (HTTP YCloud) [FIN]
   │              └─ false → Variables → Conversation → Code → Unificacion
   │                         ↓
   │                         Information Extractor → Switch (4 rutas):
   │                            ├─ AGENTE_PRINCIPAL → AI Agent Principal
   │                            ├─ AGENTE_OBJECIONES → AI Agent Objeciones
   │                            ├─ HANDOFF_HUMANO → Send Handoff (HTTP YCloud) [FIN]
   │                            └─ BACKUP → AI Agent Principal
   │                         ↓
   │                         [agentes] → Basic LLM Chain → Split Out → Loop
   │                            → IF (no empty) → Send Chunk (HTTP YCloud) → Wait 1.5s
   └─ false ─→ drop
```

### 5.3 Configuración del Webhook (CRÍTICO)

```json
{
  "type": "n8n-nodes-base.webhook",
  "parameters": {
    "httpMethod": "POST",
    "path": "ycloud-{cliente}",
    "responseMode": "onReceived",
    "responseCode": 200,
    "responseData": "noData"
  }
}
```

**Si usás `responseNode` o `lastNode`, YCloud da timeout y duplica mensajes.** Ver [Cap 06 §5.1](06-workflow-n8n.md).

### 5.4 Extract Variables (campos del payload)

```yaml
eventType:        {{ $json.body.type }}
messageType:      {{ $json.body.whatsappInboundMessage?.type ?? '' }}
userMessage:      {{ $json.body.whatsappInboundMessage?.text?.body ?? '' }}
userPhone:        {{ $json.body.whatsappInboundMessage?.from ?? '' }}
businessPhone:    {{ $json.body.whatsappInboundMessage?.to ?? '' }}
ycloudMessageId:  {{ $json.body.whatsappInboundMessage?.id ?? '' }}
customerName:     {{ $json.body.whatsappInboundMessage?.customerProfile?.name ?? '' }}
```

### 5.5 Send Message via YCloud

```json
{
  "method": "POST",
  "url": "https://api.ycloud.com/v2/whatsapp/messages",
  "authentication": "genericCredentialType",
  "genericAuthType": "httpHeaderAuth",
  "credentials": {
    "httpHeaderAuth": { "name": "YCloud API Key" }
  },
  "sendBody": true,
  "specifyBody": "json",
  "jsonBody": "={\n  \"from\": \"{{ $('Extract Variables').first().json.businessPhone }}\",\n  \"to\": \"{{ $('Extract Variables').first().json.userPhone }}\",\n  \"type\": \"text\",\n  \"text\": {\n    \"body\": {{ JSON.stringify($json.output) }}\n  }\n}"
}
```

**CRÍTICO:** usar `JSON.stringify($json.output)` para escapar correctamente saltos de línea, comillas y caracteres especiales.

### 5.6 Credencial YCloud

Tipo: **Header Auth**
- Name: `X-API-Key`
- Value: tu API key de YCloud (formato `ycloud_xxxxxxxxxxxxxxxxxx`)

Asignarla a TODOS los nodos HTTP de YCloud: Send Reinicio, Send Handoff, Send Chunk, Mark As Read.

### 5.7 Setup completo

1. Crear cuenta YCloud (https://www.ycloud.com/console/), proceso de verificación con Meta (1-3 días)
2. Registrar número WhatsApp Business
3. Obtener API Key del console (Developers > API Keys)
4. Configurar webhook en YCloud:
   - URL: `https://[tu-n8n]/webhook/ycloud-{cliente}`
   - Events: marcar `whatsapp.inbound_message.received`
5. Duplicar `YCLOUD-template.json` como `clients/{cliente}/workflow/chatbot-{cliente}-YCLOUD.json`
6. Reemplazar placeholders del template
7. Pegar prompts completos
8. Configurar credenciales en n8n
9. Importar y activar
10. Probar enviando mensaje WhatsApp al número Business

### 5.8 Detalles importantes de YCloud

**Webhook timeout:** ~5-10 segundos. Si n8n no responde 200 a tiempo, YCloud reintenta → mensajes duplicados. **Solución:** `responseMode: "onReceived"`.

**Ventana de 24h:** YCloud (como toda WhatsApp Business API) tiene la restricción de la "ventana de 24 horas". Después de 24h sin que el usuario escriba, solo se pueden enviar templates (HSM) aprobados por Meta. Templates requieren 24-48h de aprobación.

**Quality rating:** Meta asigna un rating al número (GREEN/YELLOW/RED). Si baja a RED, las funcionalidades se limitan. Para evitar: no enviar templates sin que el usuario haya optado in, no spamear.

**Costo:** YCloud cobra 0% markup; solo se pagan las tarifas oficiales de Meta (~$0.005-0.015 USD por conversación según país).

**Documentación completa:** [`knowledge/09_INTEGRACION_YCLOUD.md`](../knowledge/09_INTEGRACION_YCLOUD.md).

---

## 6. Variante YCLOUD-AUDIO (con soporte de notas de voz)

### 6.1 Cuándo usar

- Cliente cuyo público usa notas de voz frecuentemente en WhatsApp (es común en LATAM)
- Diferencial competitivo importante (bots que entienden audio se sienten más humanos)

### 6.2 Estructura adicional

Igual a YCLOUD pero el `IF (text inbound)` se reemplaza por un **Switch (text/audio/fallback)**:

```
Webhook → Extract Variables → Switch by messageType
   ├─ text  → Set Normalize (userMessageFinal = userMessage)                  ┐
   │                                                                          │
   ├─ audio → Download Audio (HTTP GET con X-API-Key, response file)          │
   │            → Transcribe (HTTP POST a OpenAI Whisper)                     │
   │            → Set Normalize (userMessageFinal = $json.text)               │
   │                                                                          │
   └─ otros → drop                                                            ↓
                                                                       ID y Mensaje 
                                                                       (lee userMessageFinal)
                                                                              ↓
                                                              [resto del flujo idéntico al YCLOUD básico]
```

### 6.3 Download Audio (HTTP Request)

```json
{
  "method": "GET",
  "url": "={{ $('Extract Variables').first().json.audioLink }}",
  "authentication": "genericCredentialType",
  "genericAuthType": "httpHeaderAuth",
  "credentials": {
    "httpHeaderAuth": { "name": "YCloud API Key" }
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

### 6.4 Transcribe con Whisper

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
      {
        "parameterType": "formBinaryData",
        "name": "file",
        "inputDataFieldName": "data"
      },
      { "name": "model", "value": "whisper-1" },
      { "name": "language", "value": "es" }
    ]
  }
}
```

**Detalles importantes:**

- Whisper acepta OGG/Opus directamente (formato nativo de notas de voz de WhatsApp). NO hace falta convertir.
- `predefinedCredentialType: "openAiApi"` reutiliza la credencial OpenAI ya configurada.
- `language: "es"` mejora precisión en castellano.
- Costo: ~$0.006 USD por minuto de audio.
- Límite: 25 MB por archivo (suficiente para >20 minutos de audio).

### 6.5 Set Normalize

**Branch text:**
```
userMessageFinal = {{ $('Extract Variables').first().json.userMessage }}
```

**Branch audio (después de Whisper):**
```
userMessageFinal = {{ $json.text }}
```

### 6.6 Adaptar ID y Mensaje

Si el flujo tenía un nodo `ID y Mensaje` que leía el mensaje del trigger, cambiarlo para leer `userMessageFinal`:

```
Mensaje = {{ $json.userMessageFinal }}
```

Así el agente recibe siempre texto, sin enterarse de si vino de audio o no.

---

## 7. Variante YCLOUD-TEST (test mínimo del canal)

### 7.1 Cuándo usar

- Verificar que la integración YCloud funciona (webhook, API key, número Business) antes de plug el workflow completo
- Debugging de problemas de canal sin que la lógica del bot interfiera

### 7.2 Estructura mínima

```
Webhook → Extract Variables → IF (text)
   ├─ true → Send "Echo: {{ userMessage }}" via YCloud HTTP
   └─ false → drop
```

**Sin AI Agent, sin Postgres, sin Redis.** Solo verifica que:
- El webhook recibe los eventos de YCloud
- El payload se extrae correctamente
- El HTTP Send a YCloud funciona y el usuario recibe el mensaje

### 7.3 Cuando ya funciona el YCLOUD-TEST

→ proceder con el YCLOUD completo (con AI Agent, memoria, formateador, etc.).

---

## 8. Variante de producción (la real)

### 8.1 Diferencias con las demos

| Componente | Demo (TELEGRAM/YCLOUD) | Producción |
|---|---|---|
| Airtable ON/OFF check al inicio | Opcional | **Obligatorio** |
| Buscar Lead en Airtable | No | **Sí** |
| Crear Lead si no existe | No | **Sí** (con Filtro Inicial primero) |
| Update timestamp del lead | No | **Sí** |
| Detector de descalificación post-agente | No | **Opcional** (según cliente) |
| String detection (Calendly/wa.me) | No | **Sí** |
| Discord notifications | No | **Sí** |
| REINICIAR keyword visible | Sí | Reemplazar por algo oscuro |
| Filtro Inicial (Information Extractor #1) | No | **Sí** (si el cliente tiene historial pre-existente) |

### 8.2 Setup adicional para producción

1. **Airtable** — crear base con tabla "Leads" (schema en [Cap 06 §12](06-workflow-n8n.md))
2. **Discord webhook** — crear webhook en canal del equipo del cliente
3. **Variables sensibles** — todas en credenciales de n8n, NUNCA hardcodeadas en el workflow
4. **Logging** — configurar n8n execution log para troubleshooting
5. **Backup automático** — exportar el JSON del workflow después de cada cambio importante

---

## 9. Flujo de trabajo recomendado: del dev al deploy

```
1. Diseño y prompts (Capítulos 03, 04, 05)
   ↓
2. Crear workflow TEST → probar lógica de routing y prompts
   ↓
3. Crear workflow TELEGRAM → demo interno al equipo
   ↓
4. Iterar prompts según feedback
   ↓
5. Compartir TELEGRAM con el cliente para validación
   ↓
6. Iterar prompts según feedback del cliente
   ↓
7. Crear workflow YCLOUD-TEST → verificar integración canal
   ↓
8. Crear workflow PRODUCCIÓN → full setup con Airtable, Discord, todo
   ↓
9. Testing end-to-end en producción con leads internos del equipo
   ↓
10. Go-live → monitoreo intensivo semana 1 (Cap 09)
```

---

## 10. Sincronización de prompts entre variantes

**Regla inviolable:** los prompts deben ser IDÉNTICOS byte-por-byte entre todas las variantes de un cliente.

**Verificación con MD5:**

```powershell
# Extraer prompt del JSON y calcular MD5
$prompt = (Get-Content 'chatbot-cliente-TELEGRAM.json' | ConvertFrom-Json).nodes | 
          Where-Object { $_.name -eq 'Agente Principal' } | 
          Select-Object -ExpandProperty parameters | 
          Select-Object -ExpandProperty systemMessage

$prompt | Out-File temp.txt -NoNewline -Encoding utf8
Get-FileHash temp.txt -Algorithm MD5
```

Hacer lo mismo para los otros JSONs del cliente. Los hashes deben coincidir.

**Si los hashes difieren:**
- Identificar la diferencia (caracteres especiales, espacios, llaves)
- Reemplazar el prompt en el JSON desviado con el contenido del `.md` fuente
- Re-verificar

**Por qué importa:** cuando se itera el prompt en producción y luego se quiere replicar el cambio en TEST/TELEGRAM/etc., el drift causa que la "demo" tenga un comportamiento diferente a "producción", lo que confunde al cliente y al equipo.

Detalles operativos en [Cap 10 §3](10-entrega-gobernanza.md).

---

## 11. Lo que NO se simplifica en las variantes (CRÍTICO)

Cuando se crea una variante (TEST, TELEGRAM, YCLOUD), la regla es **copia exacta del workflow base + cambio solo del canal**.

**NO simplificar:**
- ❌ Postgres Chat Memory — los agentes siempre la usan
- ❌ Redis reset (en variantes con REINICIAR) — siempre necesario para limpiar testing
- ❌ Configuración técnica del Information Extractor (formato YAML, nombres de campos)
- ❌ Reglas de `.first()` en expresiones
- ❌ Configuración de `appendAttribution: false` en Telegram

**SÍ se omiten (porque no aplican):**
- ✅ Airtable (en TEST/TELEGRAM no hay CRM real)
- ✅ Audio (si el cliente no lo necesita)
- ✅ Detector de descalificación (opcional en demos)
- ✅ Discord notifications (solo en producción)

**Por qué no simplificar más:** si se simplifica el Postgres en una variante, los prompts pueden comportarse diferente (sin memoria suficiente). Eso defeats el propósito de la demo.

---

## 12. Checklist de variantes

Antes de entregar las variantes al cliente:

- [ ] TEST funciona con los prompts del cliente
- [ ] TELEGRAM funciona end-to-end con el bot de Telegram
- [ ] Si aplica: YCLOUD funciona con el número WhatsApp del cliente
- [ ] Si aplica: YCLOUD-AUDIO transcribe notas de voz correctamente
- [ ] Prompts sincronizados (MD5 coincide) entre todas las variantes
- [ ] Credenciales con patrón `{Cliente} - {Servicio}` en todas las variantes
- [ ] Sticky notes presentes en todas las variantes
- [ ] Backup JSON exportado de cada variante

---

**Siguiente:** [Capítulo 08 — Casos de estudio reales](08-casos-estudio.md)

**Anterior:** [Capítulo 06 — Workflow n8n: anatomía del template base](06-workflow-n8n.md)
