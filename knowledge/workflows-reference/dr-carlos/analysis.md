# Analisis: Chatbot Dr. Carlos Hernandez

**Archivo:** `Chatbot-DR-CARLOS.json`
**Cliente:** Dr. Carlos Hernandez (especialista en ansiedad)
**Canal:** ManyChat (Instagram DM / WhatsApp)
**Tipo:** Multi-agente (2 AI agents + handoff Discord)

---

## Estructura

```
Webhook → Airtable ON/OFF → Es Audio? (Evolution API + Whisper)
  → ID y Mensaje → REINICIAR?
  → Buscar Lead → Existe?
     ├─ SI → Apagado? → Update Timestamp → GET Lead → continuar
     └─ NO → Crear Lead → GET Lead → continuar
  
  → Redis batching (45s) → ultimo mensaje? → Juntar
  → Postgres historial → Code formatear → Unificacion Variables
  → Information Extractor (ROUTER — 1 solo, sin filtro inicial)
  → Switch:
     ├─ DR_CARLOS → AI Agent Principal
     ├─ AGENTE_OBJECIONES → AI Agent Objeciones (LAARC)
     ├─ HANDOFF_HUMANO → Discord notification (sin AI)
     └─ BACKUP → AI Agent Principal
  
  Agentes → [paralelo]:
     ├─ Redis delete
     ├─ Formatter → Loop ManyChat send
     └─ Calendly/WhatsApp link detection:
          ├─ Calendly detectado → Discord notif + Airtable apagar chatbot
          └─ wa.me detectado → Discord notif + Airtable apagar chatbot
```

## Agentes

| Agente | Modelo | Temp | Max Tokens | Tools | Memory |
|--------|--------|------|-----------|-------|--------|
| Information Extractor (router) | gpt-4.1-mini | 0.1 | 300 | - | - |
| AI Agent Principal (Dr. Carlos) | gpt-4.1-mini | 0.4 | 400 | - | Postgres 15 msgs |
| AI Agent Objeciones (LAARC) | gpt-4.1-mini | 0.4 | 400 | - | Postgres 15 msgs |
| Formatter | gpt-4o-mini | default | default | - | - |

## Diferencias vs Template Base

1. **Solo 1 Information Extractor** (sin filtro inicial separado)
2. **2 AI agents + 1 handoff Discord** (no 3 AI agents)
3. **HANDOFF_HUMANO va directo a Discord** — no es un AI agent, solo notificacion
4. **Sistema de scoring 0-8 puntos** con 3 niveles (bajo/medio/alto) integrado en el router Y en el agente principal
5. **Deteccion de links post-agente** — Calendly y wa.me detectados → apagar chatbot + Discord
6. **3 notificaciones Discord** — escalacion, calendly enviado, whatsapp derivacion
7. **Sin RAG, sin tools** — agentes 100% prompt-driven con solo memoria Postgres
8. **Sin filtro de conversaciones viejas** — confia en el sistema de leads de Airtable
9. **Nodos huerfanos** — "Crear Lead1" y "Update Timestamp" referencian tabla de vehiculos (leftover de otro proyecto)

## Prompts Extraidos

Ver `prompts-referencia/dr-carlos/`:
- `router-classifier.md` — Clasificador con scoring de ansiedad
- `agente-principal.md` — Dr. Carlos con flujo de 6 pasos + 3 niveles
- `agente-objeciones-laarc.md` — LAARC para precio, timing, cannabis/CBD, medicacion
