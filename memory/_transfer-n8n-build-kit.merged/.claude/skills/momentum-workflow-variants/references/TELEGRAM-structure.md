# Estructura del JSON TELEGRAM

Basado en el workflow real de Level/Kenneth que funciono perfectamente.

## Flujo completo

```
Telegram Trigger
  → ID y Mensaje (Set: extrae chat.id y text)
  → REINICIAR? (If con 6 variantes: REINICIO/reinicio/Reinicio/reiniciar/Reiniciar/REINICIAR)
     ├─ TRUE (reinicio):
     │   → Vacia Redis (delete key = chat_id)
     │   → Delete Postgres historial (session_id = chat_id) ← usar operation "deleteTable"
     │   → Telegram Send Reinicio (mensaje estatico)
     │   [FIN]
     └─ FALSE (flujo normal):
         → Variables (Set)
         → Conversation (Postgres select)
         → Code (formatear historial)
         → Unificacion de Variables
         → Information Extractor (Router)
         → Switch1:
            ├─ {{agente_principal}} → AI Agent - Principal
            ├─ AGENTE_OBJECIONES → AI Agent - Objeciones
            ├─ HANDOFF_HUMANO → Telegram Send Handoff [terminal, mensaje estatico]
            └─ BACKUP → AI Agent - Principal
         
         Ambos AI Agents → Basic LLM Chain4 (formateador)
         → Split Out → Loop Over Items1
            → If5 (no empty)
               ├─ TRUE → Telegram Send Chunk → Wait2 → loop back
               └─ FALSE → Wait2 → loop back
```

## Nodos exactos (30 total)

### Flujo de entrada y REINICIAR (6 nodos)
1. **Telegram Trigger** — `n8n-nodes-base.telegramTrigger` v1.2
   - updates: `["message"]`
2. **ID y Mensaje** — Set
   - ID: `={{ $json.message.chat.id.toString() }}`
   - Mensaje: `={{ $json.message.text }}`
3. **REINICIAR?** — If
   - 6 condiciones OR: REINICIO, reinicio, Reinicio, reiniciar, Reiniciar, REINICIAR
4. **Vacia Redis** — Redis delete, key = `{{ $('ID y Mensaje').first().json.ID }}`
5. **Delete Postgres historial** — Postgres
   - **CRITICO:** `operation: "deleteTable"` + `deleteCommand: "delete"`
   - where: session_id = `{{ $('ID y Mensaje').first().json.ID }}`
6. **Telegram Send Reinicio** — Telegram
   - chatId: `{{ $('ID y Mensaje').first().json.ID }}`
   - text: "Conversacion reiniciada, podemos empezar de nuevo cuando quieras"
   - **CRITICO:** `additionalFields.appendAttribution: false`

### Procesamiento de mensaje (5 nodos)
7. **Variables** — Set (mismo patron que TEST)
8. **Conversation** — Postgres select
9. **Code** — formatea historial
10. **Unificacion de Variables** — Set con `.first()` en todas las referencias
11. **Information Extractor** — router con mismo prompt que prod

### Agentes (5 nodos)
12. **OpenAI Chat Model** — para el router
13. **Switch1** — lee `$json.output.destino`, 4 rutas
14. **AI Agent - Principal** — mismo systemMessage que prod
15. **OpenAI Chat Model2** — para Principal
16. **Postgres Chat Memory** — sessionKey con `.first()`
17. **AI Agent - Objeciones** — mismo systemMessage que prod
18. **OpenAI Chat Model - Objeciones**
19. **Postgres Chat Memory - Objeciones**

### Formateador y envio (9 nodos) — COPIAR DE PROD
20. **Basic LLM Chain4** — formateador, mismo prompt que prod
21. **OpenAI Chat Model13** — LLM del formateador (gpt-4o-mini)
22. **Auto-fixing Output Parser3**
23. **Structured Output Parser3**
24. **OpenAI Chat Model14** — LLM del auto-fixing parser
25. **Split Out** — extrae mensajes del JSON del formateador
26. **Loop Over Items1** — itera
27. **If5** — si no esta vacio
28. **Wait2** — entre mensajes
29. **Telegram Send Chunk** — envia cada chunk
   - chatId: `{{ $('ID y Mensaje').first().json.ID }}`
   - text: `{{ $json.output }}`
   - **CRITICO:** `additionalFields.appendAttribution: false`

### Handoff (1 nodo)
30. **Telegram Send Handoff** — mensaje estatico de handoff
   - text: "Gracias por tu mensaje. Voy a pasarte con {{persona_humana}} del equipo para que te ayuden directamente."
   - **CRITICO:** `additionalFields.appendAttribution: false`

## Reglas criticas para TELEGRAM

### 1. Todos los Telegram Send DEBEN tener appendAttribution: false

```json
"additionalFields": {
  "appendAttribution": false
}
```

### 2. Postgres Delete configuracion correcta

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

### 3. TODAS las referencias con .first()

Despues del Code, AI Agent, Basic LLM Chain, Split Out, Loop — usar `.first()`:
- `{{ $('ID y Mensaje').first().json.ID }}` ✅
- `{{ $('Variables').first().json.Telefono }}` ✅
- NO `.item` ❌

### 4. Conexiones del formateador

```
AI Agent - Principal (main) → Basic LLM Chain4 (main)
AI Agent - Objeciones (main) → Basic LLM Chain4 (main)  [compartido]
Basic LLM Chain4 → Split Out → Loop Over Items1
Loop Over Items1 (output index 1, loop output) → If5
If5 (index 0 TRUE) → Telegram Send Chunk → Wait2
If5 (index 1 FALSE) → Wait2
Wait2 → Loop Over Items1 (back-edge)
```

### 5. Sub-nodo connections (parsers)
- OpenAI Chat Model13 → ai_languageModel → Basic LLM Chain4
- Auto-fixing Output Parser3 → ai_outputParser → Basic LLM Chain4
- Structured Output Parser3 → ai_outputParser → Auto-fixing Output Parser3
- OpenAI Chat Model14 → ai_languageModel → Auto-fixing Output Parser3

## Credenciales placeholder

- "{Cliente} - Telegram" — Bot token de Telegram (crear con @BotFather)
- "{Cliente} - OpenAI"
- "{Cliente} - Postgres"
- "{Cliente} - Redis"

## Config del workflow

- `name`: "Chatbot {Cliente} - {BotName} (TELEGRAM)"
- `settings.executionOrder`: "v1"
