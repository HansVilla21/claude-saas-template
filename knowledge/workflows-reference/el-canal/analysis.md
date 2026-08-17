# Analisis: Chatbot Jimena-Mateo (El Canal)

**Archivo:** `Chatbot-JIMENA-MATEO.json`
**Cliente:** Condominio El Canal (real estate, Grecia, Costa Rica)
**Canal:** ManyChat (WhatsApp)
**Tipo:** Multi-agente (3 AI agents)

---

## Estructura

```
Webhook → ID y Mensaje → REINICIAR?
  → Buscar Lead → Existe?
     ├─ SI → Apagado? → Update Timestamp → GET Lead → continuar
     └─ NO → Crear Lead → GET Lead → continuar
  
  → Es audio? (Evolution API + Whisper, con batching separado 60s)
  → Redis batching (texto 45s, audio 60s) → ultimo mensaje?
  → Postgres historial → Code formatear → Unificacion Variables
  → Clasificador (Information Extractor router)
     → [paralelo]: Switch + Execute Workflow (actualizar datos lead)
  → Switch:
     ├─ EVA_PRINCIPAL → AI Agent Principal (Eva)
     ├─ AGENTE_INVENTARIO → AI Agent Inventario (Google Sheets)
     ├─ AGENTE_DERIVACION_WHATSAPP → AI Agent Agendamiento
     └─ BACKUP → AI Agent Principal
  
  Agentes → [paralelo]:
     ├─ Redis delete
     ├─ Formatter → Loop ManyChat send
     └─ Information Extractor (detector descalificacion post-agente)
          └─ es_descalificacion? → Airtable apagar chatbot

  Agent Agendamiento → [adicional]:
     → Code JS (detectar link vendedor)
     → Switch (Mauricio/Mario) → Airtable asignar vendedor
```

## Agentes

| Agente | Modelo | Temp | Max Tokens | Tools | Memory |
|--------|--------|------|-----------|-------|--------|
| Clasificador (router) | gpt-4.1-mini | 0.1 | 400 | - | - |
| AI Agent Eva (principal) | gpt-4.1-mini | 0.4 | 400 | - | Postgres 15 msgs |
| AI Agent Inventario | gpt-4.1-mini | 0.4 | 400 | Google Sheets | Postgres 15 msgs |
| AI Agent Agendamiento | gpt-4.1-mini | 0.4 | 400 | - | Postgres 15 msgs |
| Detector descalificacion | gpt-4.1-mini | 0.1 | 400 | - | - |
| Formatter | gpt-4o-mini | default | default | - | - |

## Diferencias vs Template Base

1. **3 AI agents** — Principal (Eva BANT), Inventario (Google Sheets), Agendamiento (round-robin vendedores)
2. **Execute Workflow en paralelo** — al clasificar, envia datos extraidos a sub-workflow para actualizar CRM
3. **Detector de descalificacion post-agente** — Information Extractor evalua cada respuesta del bot para auto-apagar si descalifico
4. **Audio con batching separado** — 60s para audio vs 45s para texto
5. **Asignacion de vendedores** — Code JS + Switch para round-robin Mario/Mauricio
6. **Sin ON/OFF global al inicio** — el check es per-lead despues de buscar
7. **Bug potencial:** Clasificador solo menciona 2 rutas en prompt pero Switch tiene 3 outputs
8. **Bug potencial:** Code JS busca links de Calendly pero los agentes usan wa.me
9. **Artefacto:** Formatter dice "GIVI" en el titulo (copypaste de otro cliente)

## Prompts Extraidos

Ver `prompts-referencia/el-canal/`:
- `clasificador-router.md` — Router con extraccion de 10+ campos BANT
- `agente-eva-principal.md` — Eva con BANT completo y descalificacion elegante
- `agente-inventario.md` — Consulta Google Sheets
- `agente-agendamiento.md` — Derivacion WhatsApp round-robin
- `detector-descalificacion.md` — Post-agente evaluador
