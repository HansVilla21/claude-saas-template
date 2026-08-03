# Decisiones de Prompting — heredadas del proyecto Momentum AI Chatbot Arquitect

Registro de decisiones arquitectónicas y de diseño tomadas en el proyecto **Momentum AI Chatbot Arquitect** (18+ proyectos reales — Jacó Dream Rentals, Dr. Carlos, El Canal, Level/Kenneth, SmartCheck, Grandit, etc.).

> **Ámbito:** decisiones sobre METODOLOGÍA DE PROMPTING, arquitectura de chatbots multi-agente en N8N, integraciones (Airtable/Supabase/ManyChat/YCloud/Postgres), patrones reutilizables.
>
> **Para decisiones del CRM SaaS Momentum AI CRM** (la plataforma que se construye en este repo: BOT-CTX-2, P1.1 roles, ADM-4, OBS-3, cliente cero, Pérez Luna, etc.) → ver `memory/decisions.md`.
>
> **Importado desde:** `_transfer-prompting-kit/memory/decisions.md` el 2026-06-05. Las skills `momentum-prompt-gen`, `momentum-architect`, `momentum-prompt-optimizer` consultan estas decisiones como contexto para generar prompts de calidad.

---

## 2026-05-25 — Jacó Dream Rentals: migración completa de Airtable a Supabase nativo

**Contexto:** Cliente Jacó Dream Rentals tenía workflow funcional sobre Airtable (CRM) + Supabase parcial (RAG + n8n_chat_histories). Hans confirmó que la clienta ni siquiera usaba Airtable — era control interno. Se decidió migrar TODO a Supabase aprovechando que ya existía el proyecto.

**Decisión:**
1. Aplicar el schema CORE de la skill `chatbot-db-schema-supabase` al proyecto Supabase existente de Jacó (`riznewvshyeqgeajniol`).
2. Construir workflow v2 (`Chatbot WA - Jacó v2`) como copia limpia, dejando el v1 intacto como rollback.
3. Adaptar el schema CORE para ManyChat: agregar columnas `manychat_id`, `manychat_page_id`, `ig_username`, `whatsapp_phone`, `live_chat_url` a `leads` con UNIQUE en `(agency_id, manychat_id)`.
4. NO usar plug-in de nicho (los 4 disponibles no encajan con alquileres vacacionales). Si en el futuro emerge un patrón, hacer plug-in propio.
5. Killswitch global migra a `agencies.settings.bot_enabled` (jsonb bool). Por ahora se toca desde Supabase Studio; cuando exista interfaz CRM, va por ahí.
6. Eliminar TODO el branch de Evolution API + Whisper del v2 (Hans confirmó que no se usa; ManyChat ya transcribe audio internamente). Eso quita un acoplamiento cross-cliente peligroso (la instancia Evolution apuntaba a `/Smartcheck`).

**Razón:** la clienta no usa Airtable; el proyecto Supabase ya estaba; el schema CORE da idempotencia, multi-canal y tenancy-ready desde día 1 sin trabajo extra.

**Qué se descartó:**
- Cargar plug-in `reservas.sql` adaptado para alquileres: el modelo de "appointment con duration_minutes" no encaja con noches mínimas + capacidad por villa.
- Borrar Airtable inmediato: queda como referencia operativa nuestra (no del cliente) hasta que se valide v2.

**Pendientes inmediatos:**
- Hans testear v2 end-to-end con las 8 pruebas del changelog.
- Validar todas las queries SQL del v2 contra producción (varias hechas con interpolación de strings que puede romperse con caracteres especiales).

---

## 2026-05-25 — `.env` por cliente + `.env` raíz para creds compartidas

**Contexto:** Hans tiene múltiples chatbots futuros que van a usar Supabase distintos pero la misma instancia n8n. Necesitamos estructura para no mezclar.

**Decisión:**
- **Creds específicas por cliente** (Supabase, ManyChat, workflow_id) → `clients/{cliente}/.env` (gitignored por la regla `clients/*`).
- **Creds compartidas** (instancia n8n self-hosted) → `.env` raíz del proyecto con nombres ESTÁNDAR sin sufijo de cliente: `N8N_URL`, `N8N_API_KEY`. Eso es lo que el `.mcp.json` interpola.
- **Workflow IDs por cliente** → en cada `clients/{cliente}/.env` como `N8N_WORKFLOW_ID_<cliente>`.

**Razón:** la instancia n8n es una sola. Si las vars de la instancia están en cada `clients/*/.env`, hay que copiar+pegar y mantenerlas sincronizadas. En el raíz, una sola fuente de verdad.

**Pendientes inmediatos:**
- Cuando se agregue cliente nuevo, copiar `clients/.template/.env.example` y solo llenar lo específico de ese cliente.

---

## 2026-05-25 — Modificar workflows n8n en vivo via API REST (no MCP, no re-import)

**Contexto:** Hans estaba cansado de re-importar JSON cada vez que cambio algo. Yo estaba sobre-complicando con setup del MCP n8n + reinicios. Hans recordó que en otros proyectos solo usaba la API REST directo.

**Decisión:**
- Script `scripts/n8n-update-node.py` que hace GET workflow → modifica nodo específico → PUT workflow vía API REST de n8n con auth header `X-N8N-API-KEY`.
- Soporta cambiar cualquier field path del nodo (ej. `parameters.query`, `parameters.options.systemPromptTemplate`).
- Los patches grandes (queries SQL, prompts) viven en archivos sueltos en `scripts/queries/` o `scripts/prompts/` y se pasan al script con `@path/al/archivo`.

**Razón:** API REST de n8n es estable, no requiere MCP, no requiere reinicios. Workflow del founder: yo cambio, vos re-ejecutás nodo. Cero re-importar.

**Qué se descartó:**
- Usar el MCP n8n-mcp para gestión: requiere reinicios cuando cambian creds, agrega complejidad innecesaria.

**Pendientes inmediatos:**
- Replicar el patrón a otros clientes en próximos workflows.

---

## 2026-05-27 — Patrón JSON deconstruction para queries Postgres con muchos params

**Contexto:** Crear Lead en Jacó tiraba `there is no parameter $8` repetidamente. El nodo Postgres de n8n tiene un `queryReplacement` que es string separado por comas; valores vacíos consecutivos colapsan y el parser pasa menos params de los esperados. Probé `?? ''`, hardcodear agency_id, sin éxito.

**Decisión:**
- Para queries con 5+ params O cualquier param nullable, usar patrón JSON deconstruction:
  ```sql
  WITH data AS (SELECT $1::jsonb AS d)
  INSERT INTO public.leads (manychat_id, display_name, ig_user_id, ...)
  SELECT d->>'manychat_id', NULLIF(d->>'display_name', ''), NULLIF(d->>'ig_id', ''), ...
  FROM data
  ```
- `queryReplacement` pasa UN solo JSON.stringify({...}) con todos los campos.
- Hardcodear `agency_id` en SQL como literal cuando es single-tenant (no pasarlo por queryReplacement con `={{ "uuid" }}`, ese formato confunde al parser).
- Documentado en skill `n8n-postgres-prepared-statements`.

**Razón:** UN solo param JSONB elimina ambigüedad del split por comas, JSON escapa caracteres especiales automáticamente, es inmune a nulls/vacíos. Hans dijo: "estás resolviendo bugs para salir del paso, no estás evaluando si realmente ese bug va a funcionar después" — eso me hizo atacar la causa raíz.

**Qué se descartó:**
- Coalesce inline `?? ''` en cada expression → seguía colapsando.
- Prepared statements clásicos con muchos `$N` → frágiles ante params nullable.

**Pendientes inmediatos:**
- Aplicado a Crear Lead, Crear/Buscar Conversation, Insertar Message Inbound, Persist Outbound, Get Conversation State.
- Replicar a todo cliente nuevo desde día 1.

---

## 2026-05-27 — Un solo workflow n8n para multi-canal (WA + IG)

**Contexto:** ManyChat ahora soporta WA + IG bajo el mismo subscriber_id con el plan Pro Premium. Tenía 2 opciones: un workflow por canal (duplicar todo) o un workflow multi-canal con switch condicional.

**Decisión:**
- UN solo workflow n8n con webhook único.
- ManyChat manda payload con `body.data.X` (subscriber completo) + `body.canal` ("WA" o "IG").
- `Edit Fields2` deriva `channel` para Supabase: `canal === 'WA' ? 'whatsapp' : 'instagram'`.
- Queries Postgres reciben `channel` derivado, no requieren cambios.
- HTTP request final a ManyChat usa `flow_ns` condicional según canal: `canal === 'IG' ? IG_FLOW : WA_FLOW`.
- En ManyChat: 2 External Requests (uno por canal) apuntan al mismo webhook con `canal` distinto + 2 Flows de respuesta (uno por canal) + 1 Custom Field compartido.

**Razón:** la lógica del bot, routing, formateador, memoria, RAG son idénticos para WA e IG. Solo el `flow_ns` final cambia. Duplicar workflow sería waste.

**Qué se descartó:**
- 2 workflows separados (uno por canal): mantenimiento doble, riesgo de divergencia.
- Branchear el prompt según canal: por ahora no se justifica (mismo tono en ambos canales).

**Pendientes inmediatos:**
- Workflow v3 multi-canal de Jacó funcionando (workflow_id: `s8aWa8MtLvWoKVnf`).
- v2 single-canal queda como rollback en `versions/`.
- Documentado en skill `chatbot-manychat-supabase-multicanal/docs/05-patron-multi-canal.md`.

---

## 2026-05-27 — Nodos Postgres de persistencia van EN PARALELO, no en serie

**Contexto:** Puse `Persist outbound message` (Postgres) en serie entre `If5` y `Set Respuesta Chatbot 2`. Resultado: el bot empezó a enviar `undefined` al user porque `{{ $json.output }}` ahora venía del Postgres node (que no tiene `output`), no del formateador.

**Decisión:**
- Todos los nodos Postgres que persisten datos (leads, conversations, messages, tasks) van EN PARALELO al flujo principal desde el nodo upstream.
- No alteran `$json` del nodo siguiente.
- Una sola excepción: nodos cuyo output ES requerido downstream (ej. Crear Lead devuelve `id` que se usa después). Esos sí van en serie.

**Razón:** persistencia es side effect, no transformación. Si va en serie, sobrescribe el JSON del flujo.

**Qué se descartó:**
- Asumir que Postgres node "pasa el JSON tal cual": no lo hace, devuelve el resultado de la query.

**Pendientes inmediatos:**
- Refactor de Jacó v2 ya hecho.
- Regla agregada a SKILL.md como no-negociable #7.

---

## 2026-05-27 — Get Conversation State como UPSERT (Get or Create)

**Contexto:** Lead recreado de tests viejos quedó huérfano sin conversation. `Get Conversation State` devolvió vacío → downstream rompió porque esperaba `conversation_id`.

**Decisión:**
- `Get Conversation State` ahora hace INSERT ... ON CONFLICT DO UPDATE RETURNING en `conversations`, no SELECT.
- Garantiza que SIEMPRE haya una conversation para el lead+canal, incluso si el lead venía de un estado inconsistente.

**Razón:** estados inconsistentes ocurren en producción (tests, ediciones manuales, crashes). El workflow debe ser auto-curativo.

**Pendientes inmediatos:**
- Implementado en v2 y v3 de Jacó.
- Agregar al template base del repo.

---

## 2026-05-27 — Payload ManyChat: `body.data.X` + `body.canal`

**Contexto:** Estructura nueva de ManyChat envía el subscriber completo dentro de `body.data`, no `body.X` directo. Y agrega `body.canal` como flag externo.

**Decisión:**
- Todo `Edit Fields2` de chatbots multi-canal con ManyChat lee de `body.data.X`.
- `body.canal` vive en `body` (NO `body.data.canal`) — es flag agregado por ManyChat al External Request.
- Documentado completo en skill `chatbot-manychat-supabase-multicanal/docs/04-payload-manychat-multicanal.md`.

**Razón:** estructura más limpia (subscriber serializado en sub-objeto + metadata del request afuera).

**Pendientes inmediatos:**
- Clientes nuevos arrancan con este patrón desde día 1.

---

## 2026-05-27 — Skill madre chatbot-manychat-supabase-multicanal creada

**Contexto:** Sesión maratónica de Jacó dejó 12 errores documentados, patrones validados, y un playbook end-to-end. Hans pidió documentación exhaustiva para que próximo Claude replique sin errores en cliente nuevo.

**Decisión:**
- Crear skill `.claude/skills/chatbot-manychat-supabase-multicanal/` como skill madre del patrón.
- SKILL.md con 7 reglas no negociables (modular, no llaves en LangChain, JSON deconstruction, multi-canal con un workflow, Persist en paralelo, estilo humano, idempotencia con índices parciales).
- 5 docs: arquitectura, deployment checklist, errores comunes E01-E12 con fix, payload ManyChat, patrón multi-canal.
- 2 sub-skills derivadas: `n8n-postgres-prepared-statements` y `n8n-langchain-prompts-rules`.
- Playbook end-to-end en `memory/playbook-cliente-nuevo.md`.

**Razón:** próximo cliente debe tomar 60 min (no 4 horas) gracias a documentación.

**Pendientes inmediatos:**
- Probar el patrón en próximo cliente y refinar lo que falte.
- Mantener `errores-comunes-y-fixes.md` vivo: cada bug nuevo, agregar entrada.

---

## 2026-05-25 — Prompts de LangChain nodes NO admiten llaves literales

**Contexto:** El prompt v2 del clasificador inicial de Jacó tenía bloques JSON inline con `{` y `}`. Al pegarlo al Information Extractor de n8n, tiró `NodeOperationError: Single '}' in template.`

**Decisión:**
- Los prompts que van en `systemPromptTemplate` de nodos LangChain (`@n8n/n8n-nodes-langchain.informationExtractor`, `chainLlm`, `agent`) NO pueden contener `{` ni `}` literales — LangChain los parsea como variables Python `str.format()`.
- Schema del output se describe en prosa + tablas + listas (NO con `{...}` inline).
- Si necesitás mostrar JSON, va en el campo `inputSchema` del nodo (campo separado que sí acepta JSON).
- Toda función de Python que genere prompts para estos nodos debe tener un assert `if "{" in prompt or "}" in prompt: raise`.

**Razón:** error en producción que tardó descubrir. Memoria explícita para no repetir.

**Qué se descartó:**
- Escapar todas las llaves con `{{` y `}}`: hace el prompt ilegible.

**Pendientes inmediatos:**
- Aplicado al clasificador-inicial v3 de Jacó.
- Aplicar el mismo principio a cualquier nodo LangChain futuro en otros clientes.

---

## 2026-04-15: Estructura Skills vs Agents

**Decision:** Usar skills (`.claude/skills/`) para el pipeline interactivo y agents (`.claude/agents/`) solo para trabajo aislado pesado.

**Por que:** La investigacion de anthropics/skills, louisblythe/Sales-Skills, y la documentacion oficial de Claude Code mostro que:
- Skills corren inline en la conversacion — el usuario ve todo e interactua
- Agents corren en contexto aislado — ideales para analisis pesado
- `.claude/commands/` esta deprecado a favor de `.claude/skills/`
- `.agent/skills/` no es el formato oficial — el correcto es `.claude/skills/`

**Alternativa descartada:** Todo como agents en `.claude/agents/`. Problema: el usuario no veria el proceso inline.

## 2026-04-15: Frameworks de Prompting

**Decision:** Integrar CO-STAR, TIDD-EC, y RTF como frameworks de generacion de prompts.

**Por que:** ckelsoe/prompt-architect documenta 27 frameworks con evidencia. Los 3 seleccionados cubren los casos del proyecto:
- CO-STAR: personalidad del chatbot (Context, Objective, Style, Tone, Audience, Response)
- TIDD-EC: guardrails del chatbot (Task, Instructions, Do, Don't, Examples, Context)
- RTF: agentes simples/especializados (Role, Task, Format)

## 2026-04-15: Documentos existentes a knowledge/

**Decision:** Mover los 7 docs existentes a `knowledge/` sin modificarlos. Destilar las reglas criticas a `memory/`.

**Por que:** Los docs son la fuente de verdad completa. `memory/` es para acceso rapido a reglas criticas. Los skills leen `knowledge/` via `references/` cuando necesitan profundidad.
