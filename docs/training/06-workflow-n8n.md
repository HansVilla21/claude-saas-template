# 06 — Workflow n8n: anatomía del template base

Este capítulo cubre la implementación técnica del workflow en n8n. Estructura de nodos, configuraciones críticas, patrones reutilizables y los gotchas técnicos que pueden romper un workflow funcional en producción.

---

## 1. Filosofía operativa de los workflows

El sistema opera bajo una regla fundamental: **el template base se duplica por cliente, nunca se crea un workflow desde cero**.

El template base actual (validado en producción) está en:
- [`knowledge/workflows-reference/template-base/`](../knowledge/workflows-reference/template-base/) — versión "Jacó Dream Rentals" (ManyChat + Instagram)

Para cada cliente nuevo, el flujo es:

1. Duplicar el template base
2. Reemplazar prompts (de [`clients/{cliente}/prompts/`](../clients/))
3. Reemplazar credenciales (Airtable, OpenAI, canal específico)
4. Ajustar número de agentes en el Switch (1-3)
5. Eliminar nodos no necesarios (ej: si no hay tool RAG, eliminar nodo Supabase)
6. Renombrar nodos según convención (ver §3)
7. Agregar sticky notes explicativas (ver §4)

**Lo que NUNCA se modifica al duplicar:**

- La estructura general (orden de bloques)
- Las configuraciones técnicas críticas (responseMode, deleteCommand, .first())
- Las convenciones de naming de nodos
- La presencia de sticky notes

---

## 2. Estructura completa del template base

El template base tiene ~65 nodos. Se descompone en 8 bloques lógicos.

### 2.1 Bloque 1: Entrada (5-7 nodos)

```
Webhook (ManyChat POST)
   ↓
Airtable: Chatbot ON/OFF
   ↓
Es Audio? (IF) ─→ true ─→ Transcribir (HTTP Whisper) ─┐
   ↓ false                                              ↓
   └────────────────────────────────────────────────→ ID y Mensaje
```

**Nodos clave:**

- **Webhook** (`n8n-nodes-base.webhook`)
  - Path: `/manychat-{cliente}`, `/ycloud-{cliente}`, etc.
  - **CRÍTICO:** `responseMode: "onReceived"` para servicios externos (YCloud, ManyChat). Sin esto, timeout y mensajes duplicados.

- **Airtable: Chatbot ON/OFF** (`n8n-nodes-base.airtable`)
  - Operación: search
  - Lee campo "Chatbot Activado" del lead
  - Si está apagado para ese lead → workflow termina (handoff activo)

- **Es Audio?** (IF) — solo si el canal soporta audio (Evolution, YCloud)
  - Branch true → transcribir con Whisper
  - Branch false → continuar con texto

- **ID y Mensaje** (`n8n-nodes-base.set`)
  - Extrae el chat_id, número, y texto del mensaje
  - Es el punto de entrada normalizado al resto del flujo

### 2.2 Bloque 2: Control de conversación (4-6 nodos)

```
ID y Mensaje
   ↓
REINICIAR? (IF: texto contiene "REINICIAR")
   ├─ true ─→ Redis delete + Postgres delete historial + Airtable delete lead
   │           ↓
   │         ManyChat API: setCustomField + sendFlow (mensaje "Listo")
   │           [FIN del workflow]
   ↓ false
Buscar Lead (Airtable) → ¿Existe?
   ├─ Sí ─→ Update Timestamp → GET Lead → continuar
   └─ No ─→ Information Extractor #1 (Filtro inicial)
            ├─ debe_continuar_bot = true → Crear Lead → GET Lead → continuar
            └─ debe_continuar_bot = false → [FIN] (no interferir conversación vieja)
```

**Nodos clave:**

- **REINICIAR?** — IF node que matchea palabras clave (típicamente "REINICIAR", "REINICIO", "RESET")
- **Filtro Inicial** — Information Extractor que clasifica si el primer mensaje es válido
- **Buscar Lead / Crear Lead / GET Lead** — operaciones Airtable

### 2.3 Bloque 3: Batching de mensajes con Redis (5 nodos)

```
GET Lead (Airtable)
   ↓
Guardar Mensaje en Redis (push a lista)
   ↓
Esperar Mensajes Adicionales (Wait 45s)
   ↓
Leer Mensajes de Redis (get list)
   ↓
Es el Ultimo Mensaje? (IF: cuenta de mensajes)
   ├─ No ─→ No Operation [FIN]
   └─ Sí ─→ Juntar Mensajes (Code: join con \n) → continuar
```

**Por qué batching:** los usuarios escriben en mensajes cortos sucesivos. Sin batching, el bot responde a cada uno por separado y la conversación se siente robótica. Detalles en [Cap 02 §6.2](02-arquitectura-modular.md).

**Configuración del Wait:**
- Texto: 45 segundos
- Audio: 60 segundos (la transcripción suma latencia)

**Configuración de Redis:**

```javascript
// Push
{
  "operation": "push",
  "key": "={{ $('ID y Mensaje').first().json.ID }}",
  "value": "={{ $('ID y Mensaje').first().json.Mensaje }}",
  "tail": true
}

// Get
{
  "operation": "get",
  "key": "={{ $('ID y Mensaje').first().json.ID }}",
  "type": "list"
}
```

**TTL:** las keys Redis tienen TTL de 5 minutos (cleanup automático). Configurable en el Redis Set Expiration node si se requiere.

### 2.4 Bloque 4: Contexto (3 nodos)

```
Juntar Mensajes
   ↓
Leer Historial (Postgres)
   ↓
Formatear Historial (Code)
   ↓
Unificar Variables (Set)
```

**Nodos clave:**

- **Leer Historial (Postgres)** — SELECT de la tabla `n8n_chat_histories` filtrando por `session_id`
- **Formatear Historial (Code)** — limpia el output de Postgres:
  - Quita headers markdown
  - Prefija con "Usuario:" / "Bot:"
  - Corta en "# Datos recopilados hasta el momento"
- **Unificar Variables (Set)** — consolida los campos que necesita el router (mensaje actual, historial, datos de Airtable)

**Code Node de formateo (snippet)**:

```javascript
const historial = $input.all();
let conversationText = '';

for (const item of historial) {
  const message = item.json.message;
  if (typeof message === 'object' && message.type === 'human') {
    conversationText += `Usuario: ${message.content}\n`;
  } else if (typeof message === 'object' && message.type === 'ai') {
    conversationText += `Bot: ${message.content}\n`;
  }
}

// Cortar en marcador
const idx = conversationText.indexOf('# Datos recopilados hasta el momento');
if (idx > -1) {
  conversationText = conversationText.substring(0, idx);
}

return [{
  json: {
    conversation_text: conversationText.trim(),
    total_messages: historial.length,
    session_id: $('ID y Mensaje').first().json.ID
  }
}];
```

**Importante:** este Code Node rompe el `pairedItem` chain. Todos los nodos posteriores deben usar `.first()` en lugar de `.item` (ver §6).

### 2.5 Bloque 5: Ruteo (2 nodos)

```
Unificar Variables
   ↓
Information Extractor #2 (Router)
   ↓
Enrutador de Agentes (Switch)
   ├─ destino === "AGENTE_PRINCIPAL" → AI Agent Principal
   ├─ destino === "AGENTE_OBJECIONES" → AI Agent Objeciones
   ├─ destino === "AGENTE_INVENTARIO" → AI Agent Inventario
   ├─ destino === "HANDOFF_HUMANO" → Notificación Discord (sin LLM)
   └─ Backup (output vacío) → AI Agent Principal
```

**Configuración del Switch:**

- Modo: expression
- Valor a evaluar: `{{ $json.output.destino }}`
- Cada caso es un match exacto del string
- Caso BACKUP siempre apunta al agente principal

**Por qué el caso BACKUP es crítico:** si el Information Extractor devuelve output vacío o null (timeout, error transitorio del LLM), sin BACKUP el workflow se rompe. Con BACKUP, va al agente principal por default.

### 2.6 Bloque 6: Agentes (1-3 nodos)

```
AI Agent (per agente)
   ↓
[ramas paralelas]
   ├─ Redis delete (limpiar memoria de batching)
   ├─ Detector de descalificación (opcional, Information Extractor)
   ├─ String detection (Code: detectar Calendly, wa.me)
   └─ Formateador (Basic LLM Chain)
        ↓
        Split Out
        ↓
        Loop Over Items
        ↓
        Envío al canal (per mensaje) + Wait
```

**Configuración del AI Agent:**

```yaml
Modelo: gpt-4.1-mini (default) o gpt-4o (prompts grandes)
Temperature: 0.4 (agente conversacional)
Max Tokens: 400
Memory: Postgres Chat Memory (context window 15)
System Message: [prompt del cliente, copiado byte-por-byte de .md]
Tools: [Supabase RAG / Google Sheets / ninguno]
```

### 2.7 Bloque 7: Post-processing (3-5 nodos)

```
[Después del AI Agent, en paralelo al formateador:]

Detector de Descalificación (opcional)
   ↓ es_descalificacion === true
   ↓
Airtable: Apagar Chatbot para Lead

String Detection (Code)
   ↓ contiene wa.me o calendly.com
   ↓
Discord Notification + Airtable: Apagar Chatbot
```

**Code Node de string detection (snippet):**

```javascript
const respuesta = $json.output || '';
const nombre = $('GET Lead').first().json.fields.Nombre || 'Usuario';
const telefono = $('ID y Mensaje').first().json.ID || 'N/A';

let notificaciones = [];

if (respuesta.includes('wa.me/')) {
  notificaciones.push({
    tipo: 'LEAD_DERIVADO',
    mensaje: `🟢 Lead derivado a vendedor\nNombre: ${nombre}\nTel: ${telefono}`,
    canal: 'discord_ventas'
  });
}

if (respuesta.includes('calendly.com')) {
  notificaciones.push({
    tipo: 'CALENDLY_ENVIADO',
    mensaje: `📅 Calendly enviado\nNombre: ${nombre}\nTel: ${telefono}`,
    canal: 'discord_ventas'
  });
}

return { notificaciones, hay_notificacion: notificaciones.length > 0 };
```

### 2.8 Bloque 8: Salida (3-6 nodos)

```
Formateador (Basic LLM Chain)
   ↓ output: { MENSAJE 1: "...", MENSAJE 2: "...", MENSAJE 3: "..." }
   ↓
Split Out (separar por mensaje)
   ↓
Loop Over Items
   ↓
[Per iteración:]
   - IF: mensaje no vacío
   - Send al canal:
     - ManyChat: setCustomField + sendFlow (2 requests)
     - Telegram: Send Message
     - YCloud: HTTP POST a /whatsapp/messages
     - Evolution: HTTP POST
   - Wait 1-2s (entre mensajes)
   ↓ loop back
```

---

## 3. Convención de nombres de nodos (CRÍTICO)

Cada nodo en el workflow debe tener un **nombre que describa qué HACE en el contexto del chatbot**, no el tipo técnico del nodo. Esto hace que cualquier persona entienda el flujo a simple vista.

### 3.1 Tabla de nombres comprobados

| Tipo técnico | Nombre representativo |
|---|---|
| Information Extractor (router) | Clasificador / Orquestador |
| Information Extractor (filtro inicial) | Filtro Inicial de Mensajes |
| Information Extractor (detector descal.) | Detector de Descalificación |
| Switch (routing de agentes) | Enrutador de Agentes |
| AI Agent (principal) | Agente Principal - [NombreBot] |
| AI Agent (objeciones) | Agente de Objeciones (LAARC) |
| AI Agent (inventario) | Agente de Inventario |
| Basic LLM Chain (formateador) | Formateador de Mensajes |
| Code (formatea historial) | Formatear Historial |
| Postgres select n8n_chat_histories | Leer Historial (Postgres) |
| Postgres delete (reinicio) | Borrar Historial (Reinicio) |
| Redis push | Guardar Mensaje en Redis |
| Redis get | Leer Mensajes de Redis |
| Redis delete | Limpiar Redis |
| Wait (batching) | Esperar Mensajes Adicionales |
| Wait (entre mensajes) | Pausa entre Mensajes |
| If (es último?) | Es el Ultimo Mensaje? |
| If (es vacío?) | Mensaje Vacio? |
| Split Out | Separar Mensajes |
| Loop Over Items | Iterar Mensajes |
| Set (ID y Mensaje) | Extraer ID y Mensaje |
| Set (Variables) | Setear Variables |
| Set (Unificación) | Unificar Variables |
| Telegram Trigger | Recibir Mensaje (Telegram) |
| Telegram Send | Enviar Mensaje (Telegram) |
| Webhook (ManyChat) | Recibir Mensaje (ManyChat) |
| HTTP Request (setCustomField) | Actualizar Campo ManyChat |
| HTTP Request (sendFlow) | Enviar Respuesta (ManyChat) |
| HTTP Request (YCloud Send) | Enviar Mensaje (YCloud) |
| HTTP Request (YCloud Mark As Read) | Marcar como Leído (YCloud) |

### 3.2 Por qué importa

- **Onboarding más rápido** — alguien nuevo entiende el workflow sin tener que leer la configuración de cada nodo
- **Debugging más rápido** — al ver un error, el nombre del nodo indica qué falló semánticamente
- **Sticky notes pueden referenciar nodos por nombre** — "El nodo `Enrutador de Agentes` decide..."

---

## 4. Sticky notes explicativas (CRÍTICO)

Todos los workflows que se suben al repo público (o que un cliente puede inspeccionar) DEBEN tener Sticky Notes (`n8n-nodes-base.stickyNote`) que expliquen cada sección del flujo.

### 4.1 Para qué sirven

1. **Documentación visual** — alguien nuevo entiende el workflow sin adivinar
2. **Explican el POR QUÉ** de cada decisión, no solo el QUÉ hace
3. **Marcan las zonas** del flujo (ej: "REINICIO", "BATCHING", "RUTEO", "AGENTES", "FORMATEADOR")

### 4.2 Formato típico

```json
{
  "type": "n8n-nodes-base.stickyNote",
  "typeVersion": 1,
  "parameters": {
    "content": "## [TÍTULO DE LA SECCIÓN]\n\n[Explicación de qué hace]\n\n**Por qué:** [Razón de diseño]",
    "width": 400,
    "height": 200,
    "color": 5
  }
}
```

### 4.3 Colores recomendados

| Color | Código | Uso |
|---|---|---|
| Rojo | 3 | Secciones críticas / Reinicio / Errores |
| Amarillo | 5 | Agentes AI (lo más importante) |
| Verde | 6 | Salida al canal (envío de mensajes) |
| Azul | 7 | Procesamiento de datos (Code, Set) |
| Morado | 4 | Notas generales / explicación |

### 4.4 Ejemplos de sticky notes

**Sobre el batching:**
```markdown
## BATCHING DE MENSAJES (Redis)

Push del mensaje a Redis, wait 45s, get all, verifica si es el último.

**Por qué:** los usuarios escriben en mensajes sucesivos. Sin batching, 
el bot responde a cada uno y la conversación se siente robótica.
```

**Sobre el router:**
```markdown
## RUTEO (Information Extractor)

Clasifica el mensaje del usuario en un destino + extrae datos del historial.

**Por qué:** un solo agente con prompt enorme falla. Routing modular 
mantiene cada agente especializado y corto.

**Output:** campo `destino` que el Switch siguiente usa.
```

**Sobre el formateador:**
```markdown
## FORMATEADOR DE MENSAJES

Divide la respuesta del agente en bloques de máximo 3 líneas + 
separa bullets pegados.

**Por qué:** WhatsApp no renderiza bullets pegados ni bold. Los 
mensajes cortos se sienten naturales.
```

---

## 5. Patrones técnicos críticos

Esta sección documenta los gotchas que pueden romper un workflow en producción. Cada uno está validado contra incidentes reales.

### 5.1 Webhook `responseMode: "onReceived"` para servicios externos (CRÍTICO)

**Aplica a:** YCloud, Evolution API, Stripe, ManyChat, Meta webhooks, cualquier servicio que envía webhooks con timeout.

**Síntoma del problema:** mensajes duplicados o triplicados. El bot responde 2-3 veces al usuario.

**Causa:** el servicio externo espera respuesta 200 en <5-10 segundos. Si n8n no responde a tiempo (porque está esperando que el workflow complete), el servicio reintenta. El workflow se ejecuta múltiples veces.

**Fix:**

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

**Lo que NO funciona:**
- `responseMode: "lastNode"` → espera al flujo completo, da timeout
- `responseMode: "responseNode"` → idem si el response node está al final

### 5.2 Postgres delete con `operation: "deleteTable"` (CRÍTICO)

**Aplica a:** flujos de reinicio (REINICIAR), limpieza de historial, borrado condicional de filas en Postgres.

**Síntoma:** error al ejecutar "The value 'delete' is not supported!"

**Causa:** el nodo `n8n-nodes-base.postgres` v2.6 NO acepta `operation: "delete"`. La operación correcta es `deleteTable` + un campo adicional `deleteCommand`.

**Configuración correcta:**

```json
{
  "operation": "deleteTable",
  "deleteCommand": "delete",
  "schema": { "__rl": true, "value": "public", "mode": "list" },
  "table": { "__rl": true, "value": "n8n_chat_histories", "mode": "list" },
  "where": {
    "values": [{ "column": "session_id", "value": "..." }]
  }
}
```

**Claves:**
- `operation`: `"deleteTable"` (NO `"delete"`)
- `deleteCommand`: `"delete"` (opciones: `"delete"`, `"truncate"`, `"drop"`)
- `where.values`: condiciones (column + value) para filtrar qué filas borrar

Sin el campo `deleteCommand`, el nodo no sabe si hacer DELETE, TRUNCATE o DROP.

### 5.3 Expresiones `.first()` vs `.item` (CRÍTICO)

**Aplica a:** todo workflow que tenga Code Nodes, AI Agents, Formateadores, o Loops.

**Síntoma:** error "Paired item data for item from node 'X' is unavailable. Ensure 'X' is providing the required output."

**Causa:** los nodos Code, Basic LLM Chain, Information Extractor, Split Out, Loop Over Items, y otros nodos que generan items nuevos ROMPEN el `pairedItem` chain. Cualquier expresión `.item` DESPUÉS de ellos falla.

**Regla:** usar SIEMPRE `.first()` en vez de `.item` para referenciar nodos anteriores.

```javascript
// ✅ CORRECTO
{{ $('ID y Mensaje').first().json.ID }}

// ❌ INCORRECTO
{{ $('ID y Mensaje').item.json.ID }}
```

**Excepciones (donde `.item` funciona):**
- Expresiones ANTES de un Code node o AI Agent
- Cuando solo hay un item fluyendo (caso común pero frágil)

**Patrón seguro:** usar `.first()` por default. Funciona igual que `.item` cuando hay un solo item, y no falla cuando el pairedItem se rompe.

**Donde aplicar especial atención:**
- Nodos después del Formateador (Basic LLM Chain) + Loop
- Nodos después del Code node que formatea historial
- Nodos después del AI Agent
- Telegram Send Chunk, ManyChat HTTP Request, etc.

### 5.4 Telegram Send: desactivar atribución (CRÍTICO)

**Aplica a:** todo nodo `n8n-nodes-base.telegram` con operación "Send Message".

**Síntoma:** los mensajes del bot terminan con "Sent via n8n.io" o similar, lo que delata al bot inmediatamente.

**Fix:** agregar en los parameters:

```json
"additionalFields": {
  "appendAttribution": false
}
```

**Configuración completa del nodo Telegram Send:**

```json
{
  "type": "n8n-nodes-base.telegram",
  "typeVersion": 1.2,
  "parameters": {
    "chatId": "={{ $('ID y Mensaje').first().json.ID }}",
    "text": "={{ $json.output }}",
    "additionalFields": {
      "appendAttribution": false
    }
  },
  "credentials": { "telegramApi": { "id": "...", "name": "..." } }
}
```

**Aplicar a TODOS los nodos Telegram Send del workflow:** Reinicio, Handoff, Chunk, etc.

### 5.5 Information Extractor: cero llaves sueltas (CRÍTICO)

**Aplica a:** campo `systemPromptTemplate` de Information Extractor (y de cualquier nodo n8n que interpole expresiones).

**Síntoma:** el nodo Information Extractor da error de validación o el LLM recibe el prompt malformado.

**Causa:** n8n interpreta `{` y `}` como sintaxis de expresión `{{ }}`. Cualquier llave suelta rompe el nodo.

**Fix:** describir el formato del JSON de output usando notación YAML (sin llaves) dentro del prompt:

```markdown
# FORMATO DE OUTPUT
El output debe ser JSON, NO YAML. Te muestro la estructura en YAML 
para que sea legible (sin llaves que rompan el sistema):

destino: AGENTE_PRINCIPAL
motivo: "explicación breve"
datos_extraidos:
  nombre: null
  presupuesto: null
```

**Donde SÍ se pueden usar llaves:**
- Campo `inputSchema` del Information Extractor (texto plano, no interpolado)
- Campo `text` del Information Extractor (solo dentro de expresiones válidas `{{ }}`)

**Donde NO se pueden usar llaves:**
- `systemPromptTemplate` (del Information Extractor)
- `systemMessage` (de AI Agent)
- Cualquier campo que n8n marque como "expression" con el botón `fx`

### 5.6 Information Extractor: el schema NO es contrato (CRÍTICO)

**Síntoma:** el Switch siguiente al Information Extractor nunca matchea, va siempre al BACKUP.

**Causa:** el LLM renombra campos del schema espontáneamente. `agente_destino` → `agente_asignado` → `decision` → `agente`.

**Fix:**

1. Meter el formato EXACTO del JSON dentro del `systemPromptTemplate`
2. Listar nombres PROHIBIDOS explícitos
3. Repetir el nombre del campo principal al menos 3 veces

**Patrón comprobado:** usar `destino` como nombre del campo principal — palabra corta, neutra, que el LLM no tiende a renombrar.

**Si aun así el LLM renombra:** el Switch debe leer el nombre que realmente se genera (inspeccionar el output real del nodo anterior, NO asumir por el schema).

---

## 6. Debugging del Switch tras Information Extractor

Cuando el Switch no rutea correctamente:

### 6.1 Diagnóstico paso a paso

1. **Correr el Switch en modo step-by-step** y mirar el INPUT real que recibe
2. **Expandir el JSON del Information Extractor** y ver exactamente cómo se llaman los campos generados
3. **Comparar** el nombre del campo en el JSON real vs el nombre que el Switch está buscando
4. **Ajustar** el Switch Y el schema para que usen el mismo nombre que el LLM realmente genera

### 6.2 Ejemplo real (Level)

- Schema definido: `"agente_destino": "LEO_PRINCIPAL"`
- LLM generó: `"agente": "LEO_PRINCIPAL"` (acortó el nombre)
- Switch buscaba `$json.output.agente_destino` → nunca matcheaba
- Fix: renombrar schema a `"agente"` y Switch a `$json.output.agente`

### 6.3 Patrón preventivo

Usar nombres de campos CORTOS y naturales en el schema. Los LLMs prefieren nombres simples. Recomendado: `destino`.

---

## 7. Configuración del AI Agent node

### 7.1 Parámetros estándar

```yaml
Node Type: AI Agent (@n8n/n8n-nodes-langchain.agent)
Agent Type: Tools Agent
System Message: [prompt completo del cliente]
Memory: Postgres Chat Memory
  - sessionId: {{ $('ID y Mensaje').first().json.ID }}
  - contextWindowLength: 15
Model: OpenAI Chat Model
  - Model Name: gpt-4.1-mini (default)
  - Temperature: 0.4
  - Max Tokens: 400
Tools: [opcional: Supabase RAG, Google Sheets, HTTP Request]
```

### 7.2 Memory: Postgres Chat Memory

**Por qué Postgres en vez de Window Buffer:** persistencia entre ejecuciones. Si el workflow se reinicia, la memoria se mantiene.

**Schema de la tabla:**

```sql
CREATE TABLE n8n_chat_histories (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(50) NOT NULL,
  message JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_session ON n8n_chat_histories(session_id);
```

El nodo Postgres Chat Memory de n8n maneja la lectura y escritura automáticamente.

**Context Window Length:** 15 mensajes. Justificación en [Cap 02 §6.1](02-arquitectura-modular.md).

---

## 8. ManyChat: patrón de envío (2 requests)

ManyChat tiene un patrón particular para enviar mensajes desde un sistema externo (n8n). Requiere dos HTTP requests por cada bloque de mensaje:

```
Per cada mensaje del formateador:
  1. setCustomField (POST a /v2/subscriber/setCustomField)
     - Asigna el texto del mensaje a una variable del subscriber
  2. sendFlow (POST a /v2/sending/sendFlow)
     - Activa un flujo de ManyChat que envía la variable al usuario
  3. Wait 1-2s
  4. Loop al siguiente mensaje
```

### 8.1 Configuración setCustomField

```json
{
  "method": "POST",
  "url": "https://api.manychat.com/fb/subscriber/setCustomField",
  "authentication": "headerAuth",
  "credentials": { "headerAuth": { "name": "ManyChat API Key" } },
  "headers": [
    { "name": "Content-Type", "value": "application/json" }
  ],
  "body": {
    "subscriber_id": "={{ $('ID y Mensaje').first().json.ID }}",
    "field_id": "<ID del campo creado en ManyChat>",
    "field_value": "={{ $json.message }}"
  }
}
```

### 8.2 Configuración sendFlow

```json
{
  "method": "POST",
  "url": "https://api.manychat.com/fb/sending/sendFlow",
  "authentication": "headerAuth",
  "credentials": { "headerAuth": { "name": "ManyChat API Key" } },
  "body": {
    "subscriber_id": "={{ $('ID y Mensaje').first().json.ID }}",
    "flow_ns": "<NS del flow en ManyChat que envía la variable>"
  }
}
```

**Setup en ManyChat:**

1. Crear un Custom Field (ej: "Bot Response")
2. Crear un Flow que envía el contenido de ese Custom Field como mensaje
3. Obtener el `field_id` y el `flow_ns`
4. Usar esos IDs en los nodos HTTP de n8n

---

## 9. YCloud: patrón de envío

Detallado en [Capítulo 07 §3](07-variantes-canal.md) y [`knowledge/09_INTEGRACION_YCLOUD.md`](../knowledge/09_INTEGRACION_YCLOUD.md). Resumen:

- Webhook con `responseMode: "onReceived"`
- 4 nodos HTTP a YCloud: Send Reinicio, Send Handoff, Send Chunk, Mark As Read
- Auth Header: `X-API-Key: <key>`
- Endpoint: `POST https://api.ycloud.com/v2/whatsapp/messages`

---

## 10. Credenciales — convenciones

Cuando se duplica el template para un cliente nuevo, todas las credenciales se renombran con el patrón:

```
{Cliente} - {Servicio}
```

Ejemplos:
- `El Canal - Telegram`
- `El Canal - OpenAI`
- `El Canal - Postgres`
- `El Canal - Redis`
- `Dr Carlos - Airtable`
- `Dr Carlos - OpenAI`

**Por qué este patrón:** facilita encontrar credenciales en n8n cuando hay múltiples clientes activos. Buscar "El Canal" muestra todas las credenciales de ese cliente.

**Credenciales típicas por cliente:**

| Servicio | Credencial |
|---|---|
| OpenAI | API Key |
| Postgres | Host + Port + DB + User + Password |
| Redis | Host + Port + Password |
| Telegram | Bot Token |
| YCloud | API Key (Header Auth) |
| Evolution API | API Key + Instance URL |
| ManyChat | Page API Key (Header Auth) |
| Airtable | Personal Access Token |
| Google Sheets | OAuth2 |
| Discord | Webhook URL |

---

## 11. Schemas SQL adicionales

Además de `n8n_chat_histories`, algunos clientes usan tablas adicionales para tracking:

### 11.1 Conversation state

```sql
CREATE TABLE conversation_state (
  id SERIAL PRIMARY KEY,
  phone_number VARCHAR(20) NOT NULL,
  session_id VARCHAR(50),
  current_agent VARCHAR(50) DEFAULT 'AGENTE_PRINCIPAL',
  bant_budget VARCHAR(50),
  bant_authority VARCHAR(50),
  bant_need TEXT,
  bant_timeline VARCHAR(50),
  bant_score INT DEFAULT 0,
  lead_name VARCHAR(100),
  lead_email VARCHAR(100),
  lead_company VARCHAR(100),
  conversation_stage VARCHAR(50) DEFAULT 'inicio',
  message_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_conv_phone ON conversation_state(phone_number);
CREATE INDEX idx_conv_session ON conversation_state(session_id);
```

### 11.2 Analytics

```sql
CREATE TABLE chat_analytics (
  id SERIAL PRIMARY KEY,
  phone_number VARCHAR(20),
  session_id VARCHAR(50),
  agent_used VARCHAR(50),
  message_direction VARCHAR(10),  -- 'in' or 'out'
  message_text TEXT,
  response_time_ms INT,
  tokens_used INT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_analytics_phone ON chat_analytics(phone_number);
```

### 11.3 Qualified leads

```sql
CREATE TABLE qualified_leads (
  id SERIAL PRIMARY KEY,
  phone_number VARCHAR(20),
  name VARCHAR(100),
  email VARCHAR(100),
  budget_range VARCHAR(50),
  need_summary TEXT,
  timeline VARCHAR(50),
  lead_score INT,
  qualification_date TIMESTAMP DEFAULT NOW(),
  assigned_to VARCHAR(100),
  status VARCHAR(50) DEFAULT 'new',
  notes TEXT
);

CREATE INDEX idx_leads_status ON qualified_leads(status);
```

---

## 12. Airtable: estructura típica

Para handoff/CRM. Tabla "Leads" con campos:

| Campo | Tipo | Uso |
|---|---|---|
| ID | Auto-number | Primary |
| Subscriber ID | Text | ID del canal (ManyChat, YCloud) |
| Nombre | Text | Capturado del bot |
| Email | Email | Capturado del bot |
| Telefono | Phone | Capturado del bot |
| Chatbot Activado | Checkbox | True = bot responde / False = handoff activo |
| Vendedor Asignado | Single Select | Para round-robin |
| Stage | Single Select | Inicio, Discovery, Calificado, Cerrado, Descalificado |
| Score BANT | Number | 0-4 o 0-8 según cliente |
| Notas | Long Text | Resumen de la conversación |
| Created | Created Time | Auto |
| Last Activity | Last Modified Time | Auto |

---

## 13. Patrón de "REINICIAR" para testing

Durante desarrollo y testing, el equipo necesita poder reiniciar conversaciones rápidamente. El template base incluye un patrón "REINICIAR":

```
ID y Mensaje
   ↓
REINICIAR? (IF: texto exacto "REINICIAR" o "REINICIO")
   ├─ true ─→ Redis delete + Postgres delete (todos los mensajes del session) + 
   │           Airtable delete (lead) → Send "Listo, conversación reiniciada"
   │           [FIN]
   └─ false ─→ continuar flujo normal
```

**Configuración:**

```json
{
  "operation": "deleteTable",
  "deleteCommand": "delete",
  "table": { "value": "n8n_chat_histories" },
  "where": {
    "values": [
      { "column": "session_id", "value": "={{ $('ID y Mensaje').first().json.ID }}" }
    ]
  }
}
```

**Importante en producción:** considerar si dejar la palabra clave activa o cambiarla a algo más oscuro (ej: "REINICIAR_ADMIN_2026") para que usuarios reales no la disparen accidentalmente.

---

## 14. Checklist de verificación pre-deploy del workflow

Antes de poner un workflow en producción:

### Nivel prompt
- [ ] Prompts del cliente en `clients/{cliente}/prompts/*.md` están completos
- [ ] Hash MD5 de cada prompt coincide entre los 3+ JSONs (prod/TEST/TELEGRAM)
- [ ] `systemPromptTemplate` del Information Extractor tiene 0 llaves `{` `}`
- [ ] `systemMessage` de AI Agents tiene 0 llaves sueltas (solo `{{ }}` válidas)
- [ ] Schema del Information Extractor usa `destino` como campo principal

### Nivel workflow
- [ ] Switch lee `$json.output.destino` (no `agente`, no `agente_asignado`)
- [ ] Todas las expresiones a nodos anteriores usan `.first()` (no `.item`)
- [ ] Postgres delete usa `operation: deleteTable` + `deleteCommand: delete`
- [ ] Telegram Send tiene `appendAttribution: false`
- [ ] Webhook tiene `responseMode: "onReceived"` (si canal lo requiere)
- [ ] Credenciales nombradas con patrón `{Cliente} - {Servicio}`
- [ ] Nodos tienen nombres representativos (ver §3)
- [ ] Sticky notes explicativas en cada zona del workflow
- [ ] Backup route en el Switch hacia el agente principal

### Nivel conversacional (testing)
- [ ] Lead calificado: bot propone agendar, espera confirmación, manda link
- [ ] Lead con objeción: va a agente de objeciones (no al principal)
- [ ] Objeción + corrección después: vuelve al principal
- [ ] Bot no repite el mismo mensaje literal al enviar links
- [ ] Mensajes sin `:`, `;`, `¿`
- [ ] Bot no promete material educativo si no hay link real
- [ ] REINICIAR borra historial correctamente
- [ ] Handoff apaga el bot para el lead

---

**Siguiente:** [Capítulo 07 — Variantes del workflow por canal](07-variantes-canal.md)

**Anterior:** [Capítulo 05 — Catálogo de prompts](05-catalogo-prompts.md)
