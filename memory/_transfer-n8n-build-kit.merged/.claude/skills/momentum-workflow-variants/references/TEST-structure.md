# Estructura del JSON TEST (Chat interno de n8n)

Basado en el workflow real de Level/Kenneth que funciono perfectamente.

## Flujo

```
Chat Trigger
  → Variables (Set)
  → Conversation (Postgres select por sessionId)
  → Code (formatea historial como Usuario:/Bot:)
  → Unificacion de Variables (Set)
  → Information Extractor (Router)
  → Switch1 (4 rutas)
     ├─ {{agente_principal}} → AI Agent - Principal [terminal]
     ├─ AGENTE_OBJECIONES → AI Agent - Objeciones [terminal]
     ├─ HANDOFF_HUMANO → Handoff Message (Set) [terminal]
     └─ BACKUP → AI Agent - Principal [terminal]
```

## Nodos exactos (15 total)

1. **Chat Trigger** — `@n8n/n8n-nodes-langchain.chatTrigger` v1.1
2. **Variables** — Set node
   - Historial de conversación: "" (empty)
   - Mensaje actual del usuario: `={{ $json.chatInput }}`
   - Telefono: `={{ $json.sessionId }}`
3. **Conversation** — Postgres select
   - table: `n8n_chat_histories`, where session_id = `{{ $('Chat Trigger').item.json.sessionId }}`
4. **Code** — Code node
   - jsCode: el mismo que usa produccion para formatear historial
5. **Unificacion de Variables** — Set node
   - Historial: `={{ $json.conversation_text }}`
   - Mensaje actual: `={{ $('Variables').first().json['Mensaje actual del usuario'] }}`
   - Telefono: `={{ $('Variables').first().json.Telefono }}`
6. **Information Extractor** — con `systemPromptTemplate` y `inputSchema` desde `prompts/router-classifier.md`
7. **OpenAI Chat Model** — gpt-4.1-mini, temp 0.1, max 300
8. **Switch1** — 4 rutas que leen `$json.output.destino`
9. **AI Agent - Principal** — systemMessage desde `prompts/agente-principal.md`
10. **OpenAI Chat Model2** (para Principal) — gpt-4.1-mini, temp 0.4, max 400
11. **Postgres Chat Memory** — sessionKey = `{{ $('Variables').first().json.Telefono }}`, window 15
12. **AI Agent - Objeciones** — systemMessage desde `prompts/agente-objeciones.md`
13. **OpenAI Chat Model - Objeciones** — gpt-4.1-mini, temp 0.4, max 400
14. **Postgres Chat Memory - Objeciones** — mismo sessionKey, window 15
15. **Handoff Message** — Set node con texto estatico

## Credenciales placeholder

- "{Cliente} - OpenAI"
- "{Cliente} - Postgres"

## Config del workflow

- `name`: "Chatbot {Cliente} - {BotName} (TEST)"
- `settings.executionOrder`: "v1"

## IMPORTANTE

- Los AI Agents son nodos TERMINALES (no se conectan a nada despues). El Chat Trigger automaticamente captura el output del ultimo nodo de cada rama.
- Usar `.first()` en todas las expresiones a nodos anteriores (el Code rompe pairedItem).
- systemPromptTemplate SIN llaves `{` `}` — usar YAML para describir estructura.
