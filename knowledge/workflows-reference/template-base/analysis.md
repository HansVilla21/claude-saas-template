# Analisis: Chatbot ManyChat (Template Base)

**Archivo:** `chatbot-manychat.json`
**Cliente de referencia:** Jaco Dream Rentals (Liliana)
**Canal:** ManyChat (Instagram DM)
**Uso:** Template base que se duplica y modifica por cliente

---

## Estructura de Nodos

```
Webhook (ManyChat POST)
  → Airtable: Chatbot ON/OFF
  → Es Audio? (inactivo para ManyChat)
  → ID y Mensaje (setea variables)
  → REINICIAR? (testing)
  │
  ├─ SI reinicio:
  │    Redis delete → Postgres delete historial → Airtable delete lead
  │    → ManyChat API: setCustomField + sendFlow
  │
  └─ NO reinicio:
       Buscar Lead (Airtable)
       → Existe?
       │
       ├─ SI existe:
       │    → Chatbot apagado para este lead?
       │    │  ├─ SI → stop
       │    │  └─ NO → Update Timestamp → GET Lead → continuar
       │
       └─ NO existe:
            → Information Extractor #1 (filtro inicial)
            → ¿Nuevo mensaje valido?
            │  ├─ SI → Crear Lead → GET Lead → continuar
            │  └─ NO → stop (no interferir con conversaciones viejas)
       
       [CONTINUAR]:
       Guardar mensaje en Redis (push)
       → Wait 1 minuto (batching de mensajes)
       → Revisar todos los mensajes (Redis get)
       → ¿Es el ultimo mensaje?
       │  ├─ NO → No Operation
       │  └─ SI → Juntar mensajes (\n)
       │         → Postgres: historial completo
       │         → Code: formatear historial
       │         → Unificacion de Variables
       │         → Information Extractor #2 (ROUTER - CRITICO)
       │         → Switch:
       │            ├─ AGENTE_PRINCIPAL → AI Agent "Liliana"
       │            ├─ HANDOFF_HUMANO → Airtable: apagar chatbot para lead
       │            └─ BACKUP (output vacio) → AI Agent "Liliana"
       │
       AI Agent → [en paralelo]:
       │  ├─ Redis delete (limpiar memoria)
       │  └─ Basic LLM Chain (formateador de mensajes)
       │         → Split Out → Loop:
       │              → ManyChat setCustomField
       │              → ManyChat sendFlow
       │              → Wait → siguiente bloque
```

## Agentes

| Agente | Nodo | Modelo | Temp | Max Tokens | Tools | Chars Prompt |
|--------|------|--------|------|-----------|-------|-------------|
| Information Extractor #1 (filtro) | Information Extractor1 | gpt-4.1-mini | 0.1 | 300 | - | ~8,500 |
| Information Extractor #2 (router) | Information Extractor | gpt-4.1-mini | 0.1 | 300 | - | ~3,500 |
| AI Agent Principal "Liliana" | AI Agent - Principal | gpt-4.1-mini | 0.4 | 400 | Supabase RAG, Postgres Memory (15 msgs) | ~6,500 |
| Formateador de Mensajes | Basic LLM Chain4 | gpt-4o-mini | default | default | Auto-fixing + Structured Output Parser | ~8,000 |

## Patrones Nuevos vs Documentacion Previa

1. **Message batching con Redis** — push al llegar, wait 1 min, get all, verificar si es ultimo
2. **Doble Information Extractor** — filtro inicial (conversaciones viejas) + router (agentes)
3. **Chatbot ON/OFF por lead** — handoff = apagar chatbot en Airtable para ese lead
4. **Formateador como LLM** — divide en bloques de max 3 lineas, separa bullets pegados
5. **Patron ManyChat API** — setCustomField (asignar texto) + sendFlow (enviar)
6. **Backup route** — si el Information Extractor retorna output vacio, va al agente principal
7. **Modelo gpt-4.1-mini** — version mas reciente que gpt-4o-mini para extractors y agente
8. **Code Node para formatear historial** — limpia el output de Postgres, prefija Usuario:/Bot:

## Prompts Extraidos

Ver archivos en `workflows/prompts-referencia/`:
- `information-extractor-filtro-inicial.md` — Primer filtro (conversaciones viejas vs nuevas)
- `information-extractor-router.md` — Router/classifier critico
- `agente-principal-liliana.md` — Agente principal completo
- `formateador-mensajes.md` — Formateador de bloques para WhatsApp
