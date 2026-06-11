# Templates de Variantes del Workflow

Templates anonimizados para crear las versiones de **testing** de cualquier chatbot. Estos son la base generica — al aplicarlos a un cliente real, se reemplazan los placeholders y se pegan los prompts reales del cliente.

---

## Archivos

### `YCLOUD-template.json` (~33 nodos)
Version completa conectada a **WhatsApp via YCloud (BSP)**. Para demo al cliente con WhatsApp real.

**Estructura:**
```
Webhook (responseMode: onReceived) → Extract Variables → IF (text inbound)
  ├─ true → Mark As Read (paralelo) + ID y Mensaje → REINICIAR?
  │           ├─ true → Vacia Redis + Delete Postgres + Send Reinicio (HTTP YCloud)
  │           └─ false → Variables → Conversation → Code → Unificacion
  │                    → Information Extractor → Switch (4 rutas):
  │                       ├─ AGENTE_PRINCIPAL → AI Agent Principal
  │                       ├─ AGENTE_OBJECIONES → AI Agent Objeciones
  │                       ├─ HANDOFF_HUMANO → Send Handoff (HTTP YCloud)
  │                       └─ BACKUP → AI Agent Principal
  │                    Agents → Basic LLM Chain → Split Out → Loop
  │                       → IF (no empty) → Send Chunk (HTTP YCloud) → Wait → loop
  └─ false → drop
```

**Caracteristicas:**
- Webhook con `responseMode: "onReceived"` (CRITICO: si no, YCloud da timeout y duplica mensajes)
- 4 nodos HTTP Request a YCloud con auth `X-API-Key` (Send Reinicio, Send Handoff, Send Chunk, Mark As Read)
- Postgres + Redis igual que TELEGRAM
- Solo procesa texto (audio se ignora silenciosamente)

Ver [`knowledge/09_INTEGRACION_YCLOUD.md`](../09_INTEGRACION_YCLOUD.md) para doc tecnica completa.

### `YCLOUD-AUDIO-template.json` (~37 nodos)
Variante con **soporte de notas de voz** via OpenAI Whisper.

Mismo flujo que `YCLOUD-template` pero el IF se reemplaza por un **Switch (text/audio/fallback)**:

- Branch text: igual que el template basico
- Branch audio: Download Audio (HTTP GET con X-API-Key) → Transcribe (HTTP POST a Whisper, OGG/Opus directo) → Set Normalize (userMessageFinal = transcript) → ID y Mensaje
- Ambos branches convergen en `ID y Mensaje` que lee `userMessageFinal`

Costo Whisper: ~$0.006 USD/min de audio. Notas de voz tipicas son <1 min.

### `TEST-template.json` (~15 nodos)
Version para pruebas rapidas con el **chat interno de n8n**.

**Estructura:**
```
Chat Trigger → Variables → Conversation (Postgres) → Code → Unificacion
  → Information Extractor (router)
  → Switch (4 rutas):
     ├─ AGENTE_PRINCIPAL → AI Agent Principal [terminal]
     ├─ AGENTE_OBJECIONES → AI Agent Objeciones [terminal]
     ├─ HANDOFF_HUMANO → Set node (mensaje estatico) [terminal]
     └─ BACKUP → AI Agent Principal [terminal]
```

**Caracteristicas:**
- Sin Airtable, sin Redis, sin ManyChat, sin formateador
- Los agentes son nodos terminales (Chat Trigger captura su output)
- Memoria Postgres por sessionId
- Ideal para que el equipo tecnico pruebe la logica de routing rapidamente

### `TELEGRAM-template.json` (~30 nodos)
Version para pruebas con el **cliente real** via Telegram.

**Estructura:**
```
Telegram Trigger → ID y Mensaje → REINICIAR?
  ├─ TRUE → Redis delete + Postgres delete + Telegram Send [FIN]
  └─ FALSE → Variables → Conversation → Code → Unificacion
           → Information Extractor → Switch (4 rutas):
              ├─ AGENTE_PRINCIPAL → AI Agent Principal
              ├─ AGENTE_OBJECIONES → AI Agent Objeciones
              ├─ HANDOFF_HUMANO → Telegram Send Handoff
              └─ BACKUP → AI Agent Principal
           
           Agents → Basic LLM Chain (formateador) → Split Out → Loop
              → If (no empty) → Telegram Send Chunk → Wait → loop back
```

**Caracteristicas:**
- Telegram Trigger + 3 nodos Telegram Send
- REINICIAR con palabras clave (Redis + Postgres delete)
- Formateador divide respuestas en mensajes cortos
- Todos los Telegram Send con `appendAttribution: false`
- Ideal para que el cliente pruebe el chatbot como lo usaria su lead real

---

## Como Usar

### Paso 1: Generar la version TEST

Automatizado con el skill `/momentum-workflow-variants`:
1. Leer `clients/{cliente}/prompts/*.md`
2. Duplicar `TEST-template.json` como `clients/{cliente}/workflow/chatbot-{cliente}-TEST.json`
3. Reemplazar placeholders:
   - `{{NOMBRE_EMPRESA}}` → nombre real del cliente
   - `{{BOT_NOMBRE}}` → nombre del bot
   - `{{AGENTE_PRINCIPAL_NOMBRE}}` → nombre del agente principal
   - `{{CLIENTE}}` → kebab-case del cliente (para credential names)
4. Pegar prompts completos (byte-por-byte) desde `clients/{cliente}/prompts/*.md`
5. Verificar con hash MD5 que los prompts coinciden con los del cliente

### Paso 2: Generar la version TELEGRAM

Mismo proceso, pero con `TELEGRAM-template.json`.

### Paso 3: Importar en n8n

1. En n8n: Menu → Import from File → seleccionar JSON
2. Configurar credenciales (todas con nombre placeholder, mapearlas a las reales)
3. Si es TELEGRAM: crear bot con @BotFather y conectar credencial
4. Activar el workflow

---

## Placeholders que se reemplazan

En ambos templates, al personalizarlos para un cliente:

| Placeholder | Reemplazar con |
|-------------|----------------|
| `{{NOMBRE_EMPRESA}}` | Nombre real de la empresa |
| `{{BOT_NOMBRE}}` | Nombre del bot (LEO, Eva, Liliana, etc.) |
| `{{BOT_ROL}}` | Rol del bot (asesor, property manager, etc.) |
| `{{AGENTE_PRINCIPAL_NOMBRE}}` | Identificador del agente principal (ej: LEO_PRINCIPAL, EVA_PRINCIPAL) |
| `{{OBJETIVO_PRINCIPAL}}` | Objetivo principal del bot |
| `{{INFO_NEGOCIO}}` | Informacion del negocio |
| `{{CLIENTE}}` | kebab-case del cliente para credenciales |

Los prompts del sistema (Router, Principal, Objeciones) son placeholders MINIMOS — se reemplazan completos con los prompts reales del cliente desde `clients/{cliente}/prompts/*.md`.

---

## Reglas No Negociables

Estos templates fueron validados contra los patrones del proyecto Level (Kenneth). Los puntos criticos que **nunca se deben modificar** al personalizar:

1. **Cero llaves `{` `}` en `systemPromptTemplate`** — rompe n8n
2. **Schema usa `destino` como campo principal** — no renombrar
3. **Switch lee `$json.output.destino`** — no otros nombres
4. **`.first()` en todas las expresiones** — no `.item` (rompe pairedItem)
5. **Postgres delete usa `operation: "deleteTable"` + `deleteCommand: "delete"`**
6. **Telegram Send con `additionalFields.appendAttribution: false`**
7. **Models y configs fijos:**
   - Router: gpt-4.1-mini, temp 0.1, max 300-400
   - Agentes: gpt-4.1-mini, temp 0.4, max 400
   - Formateador: gpt-4o-mini
   - Memory: Postgres Chat Memory, contextWindowLength 15
