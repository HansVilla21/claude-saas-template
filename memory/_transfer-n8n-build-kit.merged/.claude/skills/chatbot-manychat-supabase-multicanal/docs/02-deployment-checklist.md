# 02 — Checklist de deployment paso a paso

Pasos ordenados para deployar un cliente nuevo con el patrón completo. Target: **60-90 min** para alguien que ya hizo uno antes; **3-4 horas** para primera vez (incluyendo lectura previa de docs).

**Pre-requisito:** leer `01-arquitectura.md` y `03-errores-comunes-y-fixes.md` antes de empezar.

---

## Fase 0 — Preparación (10 min)

### 0.1 Crear carpeta del cliente
```bash
mkdir -p clients/{cliente-slug}/{prompts,docs,workflow}
mkdir -p clients/{cliente-slug}/prompts/versions
mkdir -p clients/{cliente-slug}/workflow/versions
mkdir -p clients/{cliente-slug}/docs/versions
```

### 0.2 Copiar `.env.example`
```bash
cp clients/.template/.env.example clients/{cliente-slug}/.env
```

### 0.3 Preguntar al founder ANTES de tocar nada

- **Supabase**: ¿este cliente tiene su PROPIA cuenta o usa la misma de otros?
  - Si propia: pedir Personal Access Token nuevo.
  - Si compartida: usar el actual.
- **n8n**: confirmar URL y API key. ¿Es la misma instancia self-hosted que otros clientes? (Sí en general.)
- **ManyChat**: confirmar que el founder ya configuró:
  - La página de Facebook conectada (`page_id`).
  - Custom field para "Respuesta Chatbot" (`field_id`).
  - Flows configurados para enviar respuestas (uno por canal: `MANYCHAT_FLOW_NS_WA` y `MANYCHAT_FLOW_NS_IG`).
  - Webhook configurado para mandar al endpoint nuevo de n8n.
- **OpenAI**: usar la API key compartida `Optimiza AI` o el cliente tiene la suya.

---

## Fase 1 — Configurar MCP Supabase (5 min)

### 1.1 Actualizar `~/.claude.json`
Editar el bloque del MCP Supabase con el nuevo project-ref + access-token:

```json
"supabase": {
  "command": "npx",
  "args": [
    "-y",
    "@supabase/mcp-server-supabase@latest",
    "--access-token",
    "sbp_TOKEN_DE_LA_CUENTA",
    "--project-ref",
    "PROJECT_REF_DEL_CLIENTE"
  ]
}
```

### 1.2 Reiniciar Claude Code
Una sola vez. Después confirmar que el MCP funciona:
```
mcp__supabase__get_project_url
```
Debe devolver la URL del proyecto correcto.

### 1.3 Validar con `list_tables`
```
mcp__supabase__list_tables({schemas: ["public"]})
```
Si es un proyecto Supabase nuevo virgen, debería devolver vacío. Si tiene RAG/n8n_chat_histories (caso reutilización), preservarlos.

---

## Fase 2 — Schema CORE en Supabase (20 min)

Usar la skill **`chatbot-db-schema-supabase`** como referencia técnica.

### 2.1 Aplicar las extensiones faltantes
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA extensions;
```

(`pgcrypto`, `uuid-ossp`, `vector` ya vienen en Supabase.)

### 2.2 Crear schema `app` + enums (1 migration)
Ver `.claude/skills/chatbot-db-schema-supabase/sql/0001_core.sql` (sección de enums).

### 2.3 Crear tablas CORE
- `agencies`, `agency_members`, `agency_channels`
- `leads` **+ extensiones ManyChat** (`manychat_id`, `manychat_page_id`, `ig_username`, `whatsapp_phone`, `live_chat_url`)
- `conversations`, `messages`, `tasks`
- `tags`, `tag_assignments`
- `custom_field_defs`, `custom_field_values`
- `webhook_events_raw`, `audit_log`

UNIQUE adicional para ManyChat:
```sql
CREATE UNIQUE INDEX uq_leads_manychat
  ON public.leads (agency_id, manychat_id)
  WHERE manychat_id IS NOT NULL;
```

### 2.4 RLS policies (escritas, OFF por default)
Ver `0002_rls.sql` de la skill base.

### 2.5 Triggers (denorm + handoff + broadcast)
Ver `0003_triggers_realtime.sql` de la skill base.

### 2.6 Insert agency + agency_channels
```sql
INSERT INTO public.agencies (slug, name, country_code, timezone, currency, settings, plan, is_active)
VALUES (
  '{cliente-slug}',
  '{Cliente Nombre}',
  'CR',
  'America/Costa_Rica',
  'USD',  -- o CRC según
  jsonb_build_object(
    'bot_enabled', true,
    'owner_name', '{Owner}',
    'channels_active', jsonb_build_array('whatsapp', 'instagram')
  ),
  'custom',
  true
)
RETURNING id;

-- Guardar el AGENCY_ID que retorna en clients/{cliente}/.env

INSERT INTO public.agency_channels (agency_id, channel, page_id, is_active, extra)
VALUES
  ('{AGENCY_ID}'::uuid, 'whatsapp', '{MANYCHAT_PAGE_ID}', true, '{"provider": "manychat"}'::jsonb),
  ('{AGENCY_ID}'::uuid, 'instagram', '{MANYCHAT_PAGE_ID}', true, '{"provider": "manychat"}'::jsonb);
```

---

## Fase 3 — Llenar `.env` del cliente (5 min)

Editar `clients/{cliente-slug}/.env` con todos los valores reales:

```bash
CLIENT_SLUG=cliente-slug
CLIENT_NAME=Cliente Nombre
CLIENT_COUNTRY_CODE=CR
CLIENT_TIMEZONE=America/Costa_Rica
CLIENT_CURRENCY=USD

# Supabase
SUPABASE_PROJECT_REF=...
SUPABASE_URL=https://....supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_ACCESS_TOKEN=sbp_...  # Personal Access Token de cuenta dueña
AGENCY_ID=...                  # del INSERT anterior

# ManyChat
MANYCHAT_API_TOKEN=...
MANYCHAT_PAGE_ID=...
MANYCHAT_FIELD_ID_RESPUESTA=...
MANYCHAT_FLOW_NS_WA=content...
MANYCHAT_FLOW_NS_IG=content...

# OpenAI
OPENAI_API_KEY=sk-proj-...

# n8n (ID se llena después de crear el workflow)
N8N_API_URL_{SLUG_UPPER}=https://...
N8N_API_KEY_{SLUG_UPPER}=eyJ...
N8N_WORKFLOW_ID_{SLUG_UPPER}=...
N8N_WEBHOOK_PATH_{SLUG_UPPER}=...
```

---

## Fase 4 — Workflow n8n (30 min)

### 4.1 Duplicar workflow de Jacó como template
Bajar el workflow multi-canal de Jacó (`Chatbot Jaco - Multi-canal (WA+IG)`) y duplicarlo para el cliente nuevo:

```python
# Script: scripts/n8n-clone-workflow.py
# Bajar workflow Jacó multi-canal
# Cambiar:
#   - name: "Chatbot {Cliente} - Multi-canal (WA+IG)"
#   - webhook path: generar nuevo UUID
#   - agency_id en todas las queries: REPLACE 'b740e7a3-...' con AGENCY_ID nuevo
# POST a /api/v1/workflows
```

### 4.2 Reemplazar referencias a Jacó
En todas las queries SQL del nuevo workflow, reemplazar:
- `'b740e7a3-94f5-42ab-b485-ffb4963dea62'::uuid` → `'{NUEVO_AGENCY_ID}'::uuid`

(O usar variable env si preferís hardcodear el agency en el .env y referenciar desde queryReplacement.)

### 4.3 Reemplazar prompts del agente principal
- Subir el `agente-principal.md` específico del cliente (NO copiar el de Jacó tal cual)
- Subir el `clasificador-inicial.md` adaptado al cliente
- Mantener el `formateador.md` (es genérico, sirve para todos)
- Mantener el `router-classifier.md` (es genérico)

Usar `scripts/n8n-update-node.py` para empujar cada prompt.

### 4.4 Validar flow_ns por canal
En los nodos `Send Respuesta Reinicio` y `Send Respuest Chatbot`, confirmar que la expresión condicional usa los flow_ns nuevos del cliente:

```javascript
canal === 'IG' ? '{MANYCHAT_FLOW_NS_IG}' : '{MANYCHAT_FLOW_NS_WA}'
```

### 4.5 Actualizar webhook path en ManyChat
- En ManyChat: configurar el External Request para mandar a `https://n8n.../webhook/{new-path}`
- Estructurar el payload con `body.data.X` y `body.canal` (WA o IG según el flow que dispara)

---

## Fase 5 — RAG (opcional, según cliente) (15 min)

Si el cliente necesita RAG (catálogo de productos, FAQs, etc.):

### 5.1 Crear doc fuente
`clients/{cliente}/docs/Catalogo.md` con la info que el bot debe consultar.

### 5.2 Ingestar en Supabase Vector Store
Usar el flow N8N de ingest (existe en la instancia n8n del founder) o un script local que:
1. Lee el .md
2. Hace chunks de ~500 tokens
3. Genera embeddings con OpenAI
4. Inserta en `public.documents`

### 5.3 Configurar el Tool en el AI Agent
El nodo `Supabase Vector Store` del workflow ya está configurado para consultar la tabla `documents`. Solo confirmar:
- Credencial Supabase correcta
- Tool description acorde al cliente ("Busca info de villas de {Cliente}")

---

## Fase 6 — Testing (15 min)

### 6.1 Test 1: Lead nuevo + saludo limpio
```
Mensaje: "Hola, busco villa para 10 personas"
Canal: WA
Esperado:
  - webhook_events_raw tiene 1 row
  - leads tiene 1 row nueva (channel deriv = 'whatsapp')
  - conversations tiene 1 row (handler='bot', handoff_status='none')
  - messages tiene 2 rows mínimo (1 inbound + 1+ outbound)
  - Bot responde por WhatsApp
```

### 6.2 Test 2: Lead nuevo + conversación continuada
```
Mensaje: "Hola Liliana, gracias por lo del otro día"
Esperado:
  - Lead se crea pero handler='human', handoff_status='pending'
  - Bot NO responde
  - Tasks tiene 1 row auto-creada por trigger
```

### 6.3 Test 3: Lead existente
Mandar otro mensaje desde el mismo número. Debe:
- Pasar el batching
- Persistir el mensaje inbound
- Si handler='bot': bot responde
- Si handler='human': fin

### 6.4 Test 4: Instagram
Cambiar `body.canal` a `IG` en el payload de test. Validar:
- Lead se crea con `channel='instagram'`
- `flow_ns` usado para responder es el de IG (`content20251123073305_186664` style)

### 6.5 Test 5: Reinicio
Mandar "REINICIO". Validar:
- Redis array borrado
- `n8n_chat_histories` truncado para ese session_id
- `conversations.handler='bot'`, `handoff_status='none'`
- `tasks` auto pending pasan a 'cancelled'

### 6.6 Test 6: Idempotencia
Reenviar exactamente el mismo webhook 2 veces. Validar que `messages` no duplica (UNIQUE constraint en `external_id`).

---

## Fase 7 — Documentación local + memoria (10 min)

### 7.1 Crear `clients/{cliente}/.env` (ya hecho) ✓

### 7.2 Snapshot del workflow inicial
```bash
# Exportar el JSON del workflow recién creado
python scripts/n8n-export-workflow.py {cliente-slug}
# Guarda en clients/{cliente}/workflow/Chatbot-{Cliente}-v1.json
```

### 7.3 Documento de cambios
Crear `clients/{cliente}/workflow/workflow-changelog.md` con:
- Versión inicial
- Pre-requisitos (ManyChat configurado, etc.)
- Tests pasados
- Pendientes

### 7.4 (Opcional) Actualizar memoria persistente
Si en este cliente apareció algún error nuevo no documentado en `03-errores-comunes-y-fixes.md`, agregarlo.

---

## Resumen del orden completo

```
Fase 0: Preparar carpetas + .env vacío + confirmar con founder
Fase 1: MCP Supabase (cambiar project-ref + access-token + reiniciar)
Fase 2: Schema CORE en Supabase (extensiones + tablas + RLS + triggers + insert agency)
Fase 3: Llenar .env con todas las creds
Fase 4: Workflow n8n (duplicar Jacó multi-canal + adaptar)
Fase 5: RAG (opcional)
Fase 6: Testing end-to-end (6 tests)
Fase 7: Documentación local + snapshots
```

---

## Si algo rompe

1. **ABRIR `03-errores-comunes-y-fixes.md`** y buscar el síntoma.
2. Si está documentado: aplicar el fix.
3. Si NO está documentado: investigar, arreglar, y AGREGAR el error nuevo al doc (para el próximo cliente).

---

## Skills relacionadas a leer si surgen dudas específicas

- **Schema Supabase:** `chatbot-db-schema-supabase`
- **Queries Postgres:** `n8n-postgres-prepared-statements`
- **Prompts LangChain:** `n8n-langchain-prompts-rules`
- **n8n general:** las skills oficiales `n8n-workflow-patterns`, `n8n-expression-syntax`, etc.
