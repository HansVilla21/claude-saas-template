# Snippet para el CLAUDE.md del proyecto destino — Construcción n8n

Pega el bloque de abajo en el `CLAUDE.md` del proyecto destino. Esto cablea el conocimiento de
construcción para que el agente lo siga SIEMPRE y deje de improvisar.

---

```markdown
## Construcción de Workflows n8n y Chatbots (Momentum AI)

Para construir cualquier flujo de n8n o chatbot multi-agente de Momentum, seguí el entrenamiento.
La regla madre: **el template base se DUPLICA, NUNCA se construye desde cero.**

### Antes de construir CUALQUIER workflow (obligatorio)

1. Leer `knowledge/00_CURRICULUM_CONSTRUCCION_N8N.md` — el camino de aprendizaje completo
2. Leer `memory/metodologia-core.md` — reglas no-negociables
3. Leer `memory/feedback-n8n-build.md` — los 14 errores reales y su fix (revisar SIEMPRE antes de
   declarar un workflow terminado)
4. DUPLICAR el template más parecido de `knowledge/workflows-reference/` — no improvisar nodos

### Skills de construcción disponibles

| Skill | Cuándo se usa |
|---|---|
| `momentum-architect` | decidir cuántos agentes, router, post-processing, stack |
| `momentum-n8n-builder` | configurar el workflow nodo por nodo sobre el template duplicado |
| `momentum-workflow-variants` | generar variantes TEST / Telegram / YCloud |
| `n8n-langchain-prompts-rules` | evitar que las llaves {} rompan el Information Extractor |
| `n8n-postgres-prepared-statements` | queries Postgres robustas (JSON deconstruction) |
| `chatbot-db-schema-supabase` | schema multi-canal + multi-nicho |
| `chatbot-manychat-supabase-multicanal` | patrón multi-canal WA+IG + errores comunes |

### Reglas de construcción NO negociables (resumen — detalle en feedback-n8n-build.md)

- **Duplicar el template, no construir de cero** — solo cambian prompts, agentes, tools, post-proc, credenciales
- **Router = Information Extractor bien configurado** — sin llaves {} en el prompt, schema repetido dentro, 3-4 destinos + backup al principal, Switch lee el campo real
- **Llaves {} en nodos LangChain rompen silencioso** — describir formatos en prosa, schema en `inputSchema`
- **Postgres 5+ params/nullables → JSON deconstruction** (`$1::jsonb` + `d->>'campo'`)
- **Nodos de persistencia EN PARALELO, no en serie** (si no, sobrescriben `$json.output`)
- **"Leer estado" en multi-canal → UPSERT, no SELECT** (auto-curativo)
- **Usar `.first()` no `.item`** después de Code/Agent/IE/Loop
- **Webhook externo → `responseMode: onReceived`** (evita timeout y duplicados)
- **Nombres de nodos representativos + sticky notes** por zona
- **VALIDAR con n8n-mcp antes de entregar** — verificar el output real de cada nodo, sobre todo el router

### Herramientas recomendadas (instalar)

- **n8n-mcp** (czlonkowski) — crear/validar workflows en vivo. La validación es lo que mata el router improvisado.
- **Skills globales de n8n** (czlonkowski/n8n-skills) — sintaxis exacta de nodos y expresiones.
```

---

## Importante

Si el destino ya tiene una sección de n8n/chatbots o ya recibió el prompting-kit, **fusioná** este
contenido en una sola sección. Una sola fuente de verdad: `memory/metodologia-core.md` +
`knowledge/00_CURRICULUM_CONSTRUCCION_N8N.md`.
