# Patrones de Workflow n8n

Fuente: `knowledge/04_PATRONES_TECNICOS_N8N.md` secciones 1 y 2

## Estructura Base

```
[Webhook/Canal Trigger]
    ↓
[Code Node: Message Classifier]
    ↓
[Switch Node: Router]
    ↓ ←──── ↓ ←──── ↓
[AI Agent    [AI Agent    [AI Agent
 Principal]   Esp. 1]      Esp. 2]
    ↓             ↓             ↓
[Merge/Set Node: Unify Response]
    ↓
[Code Node: Response Formatter]
    ↓
[Canal Response Node]
    ↓
[PostgreSQL: Save State]
    ↓ (conditional)
[Discord: Notification]
```

## Triggers por Canal

### WhatsApp (Evolution API)
- Tipo: Webhook
- Body: `data.message.conversation` (texto), `data.key.remoteJid` (numero), `data.pushName` (nombre)

### WhatsApp (YCloud)
- Tipo: Webhook
- Templates requieren aprobacion Meta (24-48h)
- App Coexistence: bot + app personal coexisten

### Instagram DM (ManyChat)
- Tipo: Webhook desde ManyChat
- ManyChat recibe DM → Webhook a n8n → n8n procesa → Response a ManyChat

## Configuracion de AI Agent Node

```yaml
Node Type: AI Agent (@n8n/n8n-nodes-langchain)
Model: OpenAI Chat Model
  Model Name: gpt-4o o gpt-4o-mini
  Temperature: 0.3-0.5
  Max Tokens: 500-1000
Memory: Window Buffer Memory
  Context Window Length: 10
System Message: [prompt]
Tools: Google Sheets, HTTP Request, Supabase (opcional)
```
