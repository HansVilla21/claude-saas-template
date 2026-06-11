---
name: momentum-n8n-builder
description: Genera la configuracion especifica de los nodos del workflow n8n para un chatbot, basado en el template base que se duplica por cliente. Usa cuando necesitas configurar el workflow, conectar agentes, ajustar el Switch, configurar tools, o cuando el usuario dice "workflow n8n", "configurar nodos", "armar el workflow".
---

# Momentum N8N Builder — Configuracion del Workflow

## Evaluacion Inicial

- **Lee** `clients/{cliente}/architecture.md` — arquitectura definida
- **Lee** `clients/{cliente}/prompts/` — prompts generados
- **Consulta** `references/workflow-patterns.md` — estructura del template base
- **Consulta** `references/code-snippets.md` — snippets reutilizables
- **Consulta** `knowledge/workflows-reference/template-base/analysis.md` — analisis del template real

## Principio Fundamental

**El template base de n8n YA EXISTE.** Este skill NO genera un workflow desde cero. Define exactamente QUE NODOS MODIFICAR en el template duplicado y CON QUE VALORES.

## Lo que NO Cambias (estructura fija del template)

Estos nodos se duplican tal cual, solo ajustando credenciales:

- Webhook
- REINICIAR (Redis delete + Postgres delete + Airtable delete + ManyChat send)
- Buscar Lead → Existe? → Crear Lead / GET Lead
- Redis push → Wait → Redis get → Es ultimo? → Juntar
- Conversation (Postgres) → Code (formatear) → Unificacion de Variables
- Redis cleanup (post-agente)
- Formateador (Basic LLM Chain) → Split Out → Loop → ManyChat send

## Lo que SI Cambias por Cliente

### 1. Airtable (credenciales + tablas)

```yaml
Nodos a configurar:
  - Search records1 (ON/OFF): base + tabla del cliente
  - Buscar Lead: base + tabla + campo de busqueda (ID Manychat o remoteJid)
  - Crear Lead: base + tabla + campos a crear
  - GET Lead: base + tabla
  - Update Timestamp: base + tabla (si aplica)
```

### 2. Information Extractor — Router (EL MAS IMPORTANTE)

```yaml
Nodo: Information Extractor
Config:
  text: "# Historial...\n{{ historial }}\n\n# Mensaje actual...\n{{ mensaje }}"
  schemaType: manual
  inputSchema: [pegar output schema del prompt generado]
  systemPromptTemplate: [pegar system prompt del router generado]
  
Sub-nodo LLM:
  model: gpt-4.1-mini
  temperature: 0.1
  maxTokens: 300-400
  responseFormat: json_object
```

### 3. Switch (ajustar rutas segun agentes)

```yaml
Nodo: Switch1
Rutas (segun arquitectura):
  Output 0: $json.output.agente_destino == "AGENTE_PRINCIPAL" → AI Agent Principal
  Output 1: $json.output.agente_destino == "[AGENTE_2]" → AI Agent Especialista
  Output 2: $json.output.agente_destino == "HANDOFF_HUMANO" → [Discord / Airtable apagar]
  Output 3: $json.output.agente_destino == "" (notExists) → AI Agent Principal (BACKUP)

CRITICO: El BACKUP siempre va al principal. Previene que el workflow se rompa si el router devuelve vacio.
```

### 4. AI Agents (1 por cada agente de la arquitectura)

```yaml
Por cada agente:
  Nodo: AI Agent (@n8n/n8n-nodes-langchain.agent)
  Config:
    promptType: define
    text: "# Mensaje del usuario\n{{ $('Unificacion de Variables').item.json['Mensaje actual del usuario'] }}"
    systemMessage: [pegar prompt del agente generado]
  
  Sub-nodo LLM:
    model: gpt-4.1-mini
    temperature: 0.4
    maxTokens: 400
  
  Sub-nodo Memory:
    type: Postgres Chat Memory
    sessionKey: "={{ $('Unificacion de Variables').item.json.Telefono }}"
    contextWindowLength: 15
  
  Sub-nodo Tool (si aplica):
    - Supabase Vector Store (RAG): mode retrieve-as-tool + Embeddings OpenAI
    - Google Sheets Tool: read mode + spreadsheet ID + sheet name
```

### 5. Filtro Inicial (SOLO si aplica)

```yaml
Nodo: Information Extractor1 (entre "NO existe" y "Crear Lead")
Config: igual que el router pero con prompt del filtro inicial
Decision: If node que lee $json.output.debe_continuar_bot
  true → Crear Lead
  false → No Operation (stop)
```

### 6. Post-Processing (segun arquitectura)

**Opcion A: Deteccion de links (estilo Dr. Carlos)**
```yaml
Despues de TODOS los agentes, en paralelo al formatter:
  If "Calendly Enviado": output contains "calendly.com"
    true → Discord notification + Airtable set "Apagado"
  If "WhatsApp": output contains "https://wa.me/"
    true → Discord notification + Airtable set "Apagado"
```

**Opcion B: Detector descalificacion (estilo El Canal)**
```yaml
Despues de TODOS los agentes, en paralelo al formatter:
  Information Extractor (detector): evalua output del agente
  If "Descalificado?": $json.output.es_descalificacion == true
    true → Airtable set "Apagado"
```

**Opcion C: Asignacion vendedores (estilo El Canal)**
```yaml
Despues del agente de derivacion:
  Code Node: detecta link de vendedor en output
  Switch: asigna a vendedor 1 o vendedor 2
  Airtable update: campo "Asignado a"
```

### 7. ManyChat (credenciales + field IDs + flow IDs)

```yaml
HTTP Request - setCustomField:
  url: https://api.manychat.com/fb/subscriber/setCustomField
  auth: Bearer token del cliente
  body: subscriber_id + field_id (del cliente) + field_value (texto)

HTTP Request - sendFlow:
  url: https://api.manychat.com/fb/sending/sendFlow
  auth: Bearer token del cliente
  body: subscriber_id + flow_ns (del cliente)
```

## Output

Guardar en `clients/{cliente}/workflow/workflow-config.md` con:

```markdown
# Configuracion del Workflow: {cliente}

## Nodos a Modificar

### 1. Airtable
[credenciales, bases, tablas, campos]

### 2. Router (Information Extractor)
[prompt completo + schema + config del LLM]

### 3. Switch
[rutas con valores exactos]

### 4. Agentes
[por cada uno: prompt + config LLM + memory + tools]

### 5. Post-Processing
[que opciones se activaron y como]

### 6. ManyChat
[credenciales, field IDs, flow IDs]

## Checklist de Configuracion
- [ ] Airtable credenciales y tablas configuradas
- [ ] Router prompt pegado en Information Extractor
- [ ] Switch rutas configuradas
- [ ] Agentes con prompts, LLM, memory y tools
- [ ] Post-processing configurado
- [ ] ManyChat credenciales, field ID y flow ID
- [ ] Testeado con "REINICIAR" + 5 conversaciones simuladas
```

## Skills Relacionados

- `/momentum-prompt-gen` — paso anterior (genera los prompts que van en los nodos)
- `/momentum-delivery` — siguiente paso (documento de entrega)
