# 11 — Checklists y glosario

Capítulo de referencia rápida. Checklists para ejecutar verificaciones pre-deploy y pre-entrega, glosario de términos, y referencias cruzadas.

---

## 1. Checklist maestro de cliente nuevo

El pipeline completo de un cliente nuevo. Cada item debe completarse antes de pasar al siguiente.

### 1.1 Pre-discovery

- [ ] Cliente identificado y contactado
- [ ] Reunión de discovery agendada (15-30 min)
- [ ] Cliente avisado de qué materiales preparar (precios, FAQs, accesos)

### 1.2 Discovery

- [ ] Sesión completa de discovery realizada
- [ ] `clients/{cliente}/` carpeta creada
- [ ] `clients/{cliente}/docs/` con materiales recibidos
- [ ] `clients/{cliente}/discovery.json` completo (todos los campos)
- [ ] Materiales identificados con link compartible (regla: sin link, no se promete)
- [ ] Restricciones legales documentadas (qué el bot NO debe prometer)
- [ ] Accesos técnicos verificados (canal, CRM, agendamiento)

### 1.3 Arquitectura

- [ ] Tipo de arquitectura decidida (1, 2, 3 agentes)
- [ ] Decisión de tools documentada (RAG, Sheets, ninguno)
- [ ] Decisión de canal (WhatsApp Evolution/YCloud, Instagram ManyChat, Telegram)
- [ ] Decisión de CRM (Airtable, Sheets, Notion)
- [ ] Mecanismo de handoff definido
- [ ] `clients/{cliente}/architecture.md` escrito
- [ ] Validación con el cliente (opcional pero recomendado en proyectos grandes)

### 1.4 Prompts

- [ ] Router/Classifier escrito en `clients/{cliente}/prompts/router-classifier.md`
- [ ] Agente principal escrito en `clients/{cliente}/prompts/agente-principal.md`
- [ ] Agentes especializados (si aplica)
- [ ] Formateador (copiado del universal)
- [ ] Detector de descalificación (si aplica)
- [ ] Filtro inicial (si aplica)
- [ ] Conteo de caracteres dentro de los límites para cada prompt
- [ ] Validación contra checklist de calidad ([Cap 04 §15](04-diseno-prompts.md))

### 1.5 Workflow

- [ ] Template base duplicado a `clients/{cliente}/workflow/chatbot-{cliente}.json`
- [ ] Workflow TEST creado
- [ ] Workflow TELEGRAM creado (si se va a hacer demo via Telegram)
- [ ] Workflow YCLOUD creado (si producción es WhatsApp via YCloud)
- [ ] Placeholders del template reemplazados (nombre empresa, bot, agente)
- [ ] Prompts copiados byte-por-byte desde `.md` a cada variante
- [ ] Verificación MD5: prompts coinciden entre todas las variantes
- [ ] Nodos renombrados según convención ([Cap 06 §3](06-workflow-n8n.md))
- [ ] Sticky notes explicativas agregadas
- [ ] Patrones técnicos críticos verificados:
  - [ ] Webhook `responseMode: "onReceived"` (si aplica)
  - [ ] Postgres `operation: "deleteTable"` + `deleteCommand: "delete"`
  - [ ] Todas las expresiones usan `.first()` (no `.item`)
  - [ ] Telegram Send con `appendAttribution: false`
  - [ ] Information Extractor sin llaves `{` `}` sueltas
  - [ ] Schema usa `destino` como campo principal
  - [ ] Switch lee `$json.output.destino`
  - [ ] BACKUP route en el Switch al agente principal

### 1.6 Credenciales

- [ ] OpenAI API Key configurada (`{Cliente} - OpenAI`)
- [ ] Postgres configurado (`{Cliente} - Postgres`)
- [ ] Redis configurado (`{Cliente} - Redis`)
- [ ] Canal configurado (Telegram, YCloud, ManyChat, Evolution según aplique)
- [ ] Airtable configurado (`{Cliente} - Airtable`)
- [ ] Discord webhook configurado (si aplica notificaciones)

### 1.7 Testing

- [ ] Workflow TEST probado con 20+ conversaciones simuladas
- [ ] Workflow TELEGRAM probado end-to-end
- [ ] Camino feliz testeado
- [ ] Manejo de objeciones testeado
- [ ] Descalificación testeada
- [ ] Mensajes inesperados manejados
- [ ] Comando "REINICIAR" funciona
- [ ] Handoff a humano funciona (apaga el bot para el lead)
- [ ] Notificaciones llegan al destino correcto

### 1.8 Demo con cliente

- [ ] Bot de Telegram compartido con cliente
- [ ] Cliente probó por al menos 1 hora
- [ ] Feedback del cliente capturado
- [ ] Ajustes quirúrgicos aplicados (un cambio a la vez)
- [ ] Aprobación del cliente para pasar a producción

### 1.9 Deploy a producción

- [ ] Webhook configurado en el canal (YCloud webhook, ManyChat integration, etc.)
- [ ] Tabla `n8n_chat_histories` existe en Postgres
- [ ] Tabla `conversation_state` existe (si se usa)
- [ ] Airtable de leads creada y con campos correctos
- [ ] Workflow PRODUCCIÓN activado en n8n
- [ ] Test con lead interno del equipo
- [ ] Verificación end-to-end (mensaje → respuesta → notificación)

### 1.10 Entrega al cliente

- [ ] `clients/{cliente}/entrega.md` escrito sin jerga técnica
- [ ] Sesión de handoff con el cliente (1 hora)
- [ ] Cliente sabe cómo monitorear en Airtable/Discord
- [ ] Cliente sabe cómo tomar handoff manual
- [ ] Cliente sabe cómo contactar Momentum si hay problema

### 1.11 Post-launch (semana 1)

- [ ] Monitoreo diario de conversaciones
- [ ] Métricas en target o identificadas mejoras necesarias
- [ ] Reporte semanal al cliente
- [ ] Snapshot inicial guardado en `clients/{cliente}/versions/`

---

## 2. Checklist de calidad de prompts

Antes de poner un prompt en producción:

### Longitud
- [ ] Conteo de caracteres dentro del rango (3-5k principal, 1-2k especializado)
- [ ] Si excede, hay justificación documentada (modelo capaz, complejidad inevitable)

### Estructura
- [ ] La regla anti-repetición está en las primeras 500 caracteres
- [ ] La identidad del bot tiene nombre propio (no placeholder)
- [ ] Las FAQs están con respuestas oficiales (no inventables)
- [ ] La sección "NUNCA prometás" está presente y específica al negocio
- [ ] Las reglas de puntuación están explícitas

### Redacción
- [ ] No hay instrucciones repetidas en múltiples secciones
- [ ] No hay edge cases que rara vez ocurren
- [ ] No hay placeholders sin resolver (`[NOMBRE]`, `{empresa}`)
- [ ] No hay referencias a herramientas internas (n8n, API, LLM)

### Contenido
- [ ] El tono es consistente y apropiado al cliente
- [ ] BANT se captura conversacionalmente, no como interrogatorio
- [ ] Valor se da antes de pedir datos de contacto
- [ ] Variables dinámicas (fecha, nombre) están correctas

### Router (si aplica)
- [ ] El formato de output JSON está al inicio del prompt (en YAML)
- [ ] Lista de nombres prohibidos para campos
- [ ] Cero llaves `{` `}` sueltas en el systemPromptTemplate
- [ ] Nombre del campo principal es corto (`destino` recomendado)

### Testing
- [ ] Se testearon 20+ conversaciones simuladas
- [ ] Se cubrieron los 3 flujos principales (feliz, objeción, descalificación)
- [ ] Se verificó en el canal real (no solo n8n internal chat)

---

## 3. Checklist de calidad del workflow

### Nivel técnico
- [ ] Switch lee `$json.output.destino`
- [ ] Todas las expresiones usan `.first()` (no `.item`)
- [ ] Postgres delete con `operation: "deleteTable"` + `deleteCommand: "delete"`
- [ ] Telegram Send con `appendAttribution: false`
- [ ] Webhook con `responseMode: "onReceived"` (si canal lo requiere)
- [ ] Credenciales nombradas con patrón `{Cliente} - {Servicio}`
- [ ] Nodos con nombres representativos
- [ ] Sticky notes en cada zona del workflow
- [ ] Backup route en el Switch hacia el agente principal

### Nivel de prompts
- [ ] Prompts del cliente en `clients/{cliente}/prompts/*.md` están completos
- [ ] Hash MD5 de cada prompt coincide entre los JSONs
- [ ] `systemPromptTemplate` del Information Extractor sin llaves sueltas
- [ ] Schema del Information Extractor usa `destino`

### Nivel conversacional
- [ ] Lead calificado: bot propone agendar, espera confirmación, manda link
- [ ] Lead con objeción: va a agente de objeciones (no al principal)
- [ ] Objeción + corrección después: vuelve al principal
- [ ] Bot no repite el mismo mensaje literal al enviar links
- [ ] Mensajes sin `:`, `;`, `¿`
- [ ] Bot no promete material educativo si no hay link real
- [ ] REINICIAR borra historial correctamente
- [ ] Handoff apaga el bot para el lead

---

## 4. Checklist de entrega al cliente

### Documento de entrega
- [ ] Buscaste y eliminaste cualquier mención de jerga técnica
- [ ] El documento se entiende sin conocimientos técnicos
- [ ] Las limitaciones están claras
- [ ] Las notificaciones están descritas con claridad
- [ ] Las métricas target están sin números técnicos
- [ ] El cliente sabe qué incluye el soporte post-entrega

### Sesión de handoff
- [ ] Bot mostrado funcionando en vivo
- [ ] Cliente entiende cómo se ven las notificaciones
- [ ] Cliente sabe cómo tomar handoff
- [ ] Cliente sabe leer las métricas básicas
- [ ] Q&A respondida

### Accesos del cliente
- [ ] Cliente tiene acceso a Airtable (read-only o full según caso)
- [ ] Cliente tiene acceso a Discord/Slack del canal de notificaciones
- [ ] Cliente sabe cómo activar/desactivar el bot en su CRM
- [ ] Cliente tiene contacto de Momentum para soporte

---

## 5. Checklist de seguridad

Antes de cada deploy:

- [ ] `/security-check` ejecutado y limpio
- [ ] `.env` está en `.gitignore`
- [ ] No hay credenciales hardcoded en JSONs del workflow
- [ ] Webhook paths son específicos al cliente (no genéricos)
- [ ] n8n requiere autenticación
- [ ] API keys nunca commiteadas
- [ ] Datos personales de leads nunca en docs públicos

---

## 6. Glosario de términos

### A

- **Agente** — nodo n8n que ejecuta un LLM con prompt y memoria. Tipos: Principal, Especializado, Objeciones.
- **AI Agent** — nodo de n8n (`@n8n/n8n-nodes-langchain.agent`) que orquesta LLM + memoria + tools.
- **Airtable** — base de datos visual usada como CRM para leads. Mantiene el flag "Chatbot Activado" para handoffs.
- **Anti-repetición** — regla del prompt que evita preguntar dos veces lo mismo. Va en las primeras 500 chars.

### B

- **BANT** — Budget, Authority, Need, Timeline. Framework de calificación de leads. En Momentum se hace conversacionalmente.
- **Basic LLM Chain** — nodo n8n (`@n8n/n8n-nodes-langchain.chainLlm`). Usado para el formateador.
- **Batching** — agrupar múltiples mensajes del usuario antes de procesar. Implementado con Redis + Wait 45s.
- **BSP** — Business Solution Provider. Proveedor oficial de WhatsApp Business API (ej: YCloud).

### C

- **CO-STAR** — framework de prompt para personalidad: Context, Objective, Style, Tone, Audience, Response.
- **Classifier** — sinónimo de Router. Nodo Information Extractor que decide qué agente responde.
- **CRM** — Customer Relationship Management. Sistemas: Airtable, Google Sheets, Notion, HubSpot.

### D

- **Default** — comportamiento por defecto. El agente principal es siempre el DEFAULT del router cuando hay duda.
- **Descalificación elegante** — script específico para descalificar leads sin ofender (ej: "Los precios arrancan desde...").
- **Discovery** — proceso de 15-30 min para extraer requirements del cliente. Output: `discovery.json`.
- **Drift** — divergencia entre los prompts en el repo (`.md`) y los prompts en producción (JSON). Se detecta con MD5.

### E

- **Evolution API** — implementación self-hosted de WhatsApp. Alternativa barata a YCloud para demos.

### F

- **Filtro Inicial** — Information Extractor #1 que clasifica si un mensaje es lead nuevo válido. Solo se usa cuando el cliente tiene historial pre-existente.
- **Formateador** — Basic LLM Chain que divide la respuesta del agente en bloques cortos para WhatsApp/Instagram/Telegram.

### G

- **GPT-4.1-mini** — modelo LLM default para router y agentes principales en Momentum.
- **GPT-4o** — modelo más capaz pero más caro. Para prompts >5k chars o conversaciones muy complejas.
- **GPT-4o-mini** — modelo barato. Suficiente para formateador y agentes con prompts <3k chars.

### H

- **Handoff** — transición del bot a un humano. Mecanismo: apagar el chatbot para el lead específico en Airtable.
- **HSM** — High Structured Message. Template aprobado por Meta para enviar mensajes proactivos en WhatsApp.

### I

- **Information Extractor** — nodo n8n (`@n8n/n8n-nodes-langchain.informationExtractor`). Usado para router y filtro inicial.

### L

- **LAARC** — Listen, Acknowledge, Assess, Respond, Confirm. Framework de manejo de objeciones.
- **Lead calificado** — usuario que cumple los criterios mínimos del cliente (presupuesto, fit, timeline).
- **LLM** — Large Language Model. Modelo de lenguaje (GPT, Claude, etc.).

### M

- **ManyChat** — plataforma de Instagram/Facebook DM. Recibe mensajes y los envía a n8n vía webhook.
- **MD5** — algoritmo de hash usado para verificar que los prompts coinciden entre `.md` y JSON.
- **Memory** — Postgres Chat Memory. Persistencia de conversación entre turnos. Context window 15 mensajes.
- **Momentum AI** — la empresa. Hace chatbots de ventas en CR y LATAM.

### N

- **n8n** — plataforma de automatización (low-code). Self-hosted o cloud. Orquesta todo el workflow.

### O

- **OpenAI** — proveedor de los modelos GPT usados en los chatbots.
- **Output Parser** — componente que valida y estructura el output de un LLM. Auto-fixing reintenta si JSON malformado.

### P

- **Postgres Chat Memory** — nodo n8n para memoria conversacional. Almacena historial en tabla `n8n_chat_histories`.
- **Prompt** — instrucciones que recibe el LLM. Diferentes tipos: router, agente principal, especialista, formateador.

### Q

- **Quality rating** — rating asignado por Meta a un número WhatsApp Business (GREEN/YELLOW/RED). Si baja a RED, hay restricciones.

### R

- **RAG** — Retrieval Augmented Generation. Tool del AI Agent que consulta una base de conocimiento (Supabase Vector Store).
- **Redis** — base de datos en memoria. Usado para batching de mensajes y limpieza al reset.
- **REINICIAR** — palabra clave que dispara reset de la conversación (Redis + Postgres delete).
- **responseMode** — parámetro del Webhook node. Debe ser `"onReceived"` para servicios externos con timeout.
- **Round-robin** — algoritmo de asignación. Ej: hora par → Mario, hora impar → Mauricio.
- **Router** — sinónimo de Classifier. Information Extractor que rutea al agente correcto.
- **RTF** — Role, Task, Format. Framework de prompt para agentes simples.

### S

- **session_id** — identificador único de la conversación del usuario. En WhatsApp = número con `+`. En Telegram = chat_id.
- **SPIN** — Situation, Problem, Implication, Need. Framework de venta consultiva.
- **Structured Output Parser** — componente que fuerza al LLM a producir JSON válido.
- **Sticky Note** — nodo de n8n para documentación visual del workflow.
- **Supabase** — Postgres + Vector Store como servicio. Usado para Memory y RAG.
- **Switch** — nodo n8n que rutea según el valor de un campo (ej: `destino`).
- **systemMessage** — campo del AI Agent que contiene el prompt principal.
- **systemPromptTemplate** — campo del Information Extractor. **NO admite llaves sueltas**.

### T

- **TEST (variante)** — workflow simplificado con chat interno de n8n. Para testing rápido del dev.
- **TIDD-EC** — Task, Instructions, Do, Don't, Examples, Context. Framework de prompt para guardrails.
- **Tools** — herramientas que el AI Agent puede invocar (Google Sheets, HTTP Request, RAG).
- **Trigger** — nodo que inicia el workflow (Webhook, Telegram Trigger, Chat Trigger).

### V

- **Variantes** — múltiples versiones del workflow (producción, TEST, TELEGRAM, YCLOUD). Mismos prompts.
- **Voseo** — uso de "vos" en lugar de "tú". Tono costarricense semi-formal default.

### W

- **WABA** — WhatsApp Business Account. Cuenta oficial de WhatsApp Business API.
- **Webhook** — endpoint HTTP que recibe eventos del canal externo (YCloud, ManyChat, Telegram).
- **Whisper** — modelo de OpenAI para transcripción de audio. Usado en variante YCLOUD-AUDIO.
- **Window Buffer** — tipo de memoria simple (sin Postgres). Usado en casos simples sin persistencia.

### Y

- **YCloud** — BSP oficial de WhatsApp Business API. Default para producción WhatsApp en Momentum.
- **YCLOUD-AUDIO** — variante de workflow YCloud con soporte de notas de voz vía Whisper.

---

## 7. Referencias rápidas

### Límites de caracteres

| Tipo de prompt | Sweet spot | Máximo |
|---|---|---|
| Agente principal | 3,000-5,000 | 6,500 (con modelo capaz) |
| Agente especializado | 1,000-2,000 | 2,000 |
| Router/Classifier | 1,500-3,000 | 3,500 |
| Agente objeciones | 1,000-2,000 | 2,000 |
| Formateador | (universal) | ~8,000 |
| Filtro inicial | (depende) | ~8,500 |

### Modelos LLM por uso

| Uso | Modelo | Temperature | Max Tokens |
|---|---|---|---|
| Router/Classifier | GPT-4.1-mini | 0.1 | 300-400 |
| Agente principal <3k | GPT-4o-mini | 0.4 | 400 |
| Agente principal 3-5k | GPT-4.1-mini | 0.4 | 400 |
| Agente principal >5k | GPT-4o | 0.4 | 400 |
| Agente especializado | GPT-4.1-mini | 0.4 | 400 |
| Detector descalificación | GPT-4.1-mini | 0.1 | 400 |
| Formateador | GPT-4o-mini | default | default |

### Métricas target

```
Conversión chat → lead calificado: 30-40%
Coherencia: >95%
Latencia total: <3 segundos
Abandono: <20%
Calificación BANT (3 de 4): >60%
Costo por chat: <$0.10
Sweet spot conversación: 10-15 mensajes
```

### Patrones técnicos críticos (referencias rápidas)

| Patrón | Configuración correcta |
|---|---|
| Webhook (canal externo) | `responseMode: "onReceived"` |
| Postgres delete | `operation: "deleteTable"` + `deleteCommand: "delete"` |
| Expresiones de nodos | `.first()` siempre, no `.item` |
| Telegram Send | `appendAttribution: false` |
| Information Extractor schema | campo principal: `destino` |
| Information Extractor prompt | sin llaves `{` `}` sueltas |
| Switch del router | siempre con BACKUP route al principal |

---

## 8. Skills y comandos del sistema

Los skills automatizan partes del pipeline. Comandos disponibles:

| Comando | Qué hace |
|---|---|
| `/momentum-discovery` | Guía discovery de 15 min con cliente nuevo |
| `/momentum-architect` | Diseña arquitectura basada en el discovery |
| `/momentum-prompt-gen` | Genera prompts para cada componente |
| `/momentum-n8n-builder` | Configura el workflow n8n nodo-por-nodo |
| `/momentum-workflow-variants` | Genera versiones TEST y TELEGRAM desde producción |
| `/momentum-delivery` | Genera documento de entrega sin jerga |
| `/momentum-prompt-optimizer` | Optimiza prompts existentes con cambios quirúrgicos |
| `/momentum-pipeline` | Ejecuta todo el pipeline de principio a fin |

Agents de soporte:

| Agent | Qué hace |
|---|---|
| `@n8n-analyzer` | Analiza workflows JSON importados |
| `@prompt-reviewer` | Revisa prompts contra la metodología |

Comandos generales del proyecto:

| Comando | Qué hace |
|---|---|
| `/init-proyecto` | Inicializa un proyecto nuevo |
| `/review` | Revisa el trabajo actual contra las reglas |
| `/commit` | Crea un commit inteligente |
| `/progress` | Reporta el estado actual |
| `/security-check` | Audita secretos y configuración |
| `/checkpoint` | Persiste el estado de la sesión |

---

## 9. Estructura completa del repositorio

```
Chatbot Arquitect/
├── README.md                       # Setup y uso del proyecto
├── CLAUDE.md                       # Instrucciones para Claude Code
├── .env.example                    # Template de variables
│
├── training/                       # ESTE MANUAL
│   ├── README.md
│   ├── 01-filosofia-metodologia.md
│   ├── 02-arquitectura-modular.md
│   ├── ...
│   └── 11-checklists-glosario.md
│
├── clients/                        # Carpeta por cliente (GITIGNORED)
│   ├── .template/                  # Estructura base
│   └── {cliente}/
│       ├── docs/
│       ├── discovery.json
│       ├── architecture.md
│       ├── prompts/
│       ├── workflow/
│       ├── versions/
│       └── entrega.md
│
├── knowledge/                      # Base de conocimiento pública
│   ├── 00_README_PROYECTO.md
│   ├── 01_METODOLOGIA_MOMENTUM_AI.md
│   ├── 02_CASOS_CLIENTES_COMPLETOS.md
│   ├── 03_TEMPLATES_Y_RECURSOS.md
│   ├── 04_PATRONES_TECNICOS_N8N.md
│   ├── 05_TROUBLESHOOTING_Y_OPTIMIZACION.md
│   ├── 07_REPOSITORIOS_GITHUB_RECOMENDADOS.md
│   ├── 08_LECCIONES_LEVEL_KENNETH.md
│   ├── 09_INTEGRACION_YCLOUD.md
│   │
│   ├── workflows-reference/        # Workflows reales como referencia
│   │   ├── template-base/          # Jaco Dream Rentals
│   │   ├── dr-carlos/
│   │   └── el-canal/
│   │
│   └── workflow-variants-templates/  # Templates anonimizados
│       ├── TEST-template.json
│       ├── TELEGRAM-template.json
│       ├── YCLOUD-template.json
│       └── YCLOUD-AUDIO-template.json
│
├── memory/                         # Memoria del sistema
│   ├── metodologia-core.md
│   ├── client-patterns.md
│   ├── learnings.md
│   ├── decisions.md
│   └── proyecto.md
│
└── .claude/
    ├── skills/                     # Skills del pipeline
    │   ├── momentum-discovery/
    │   ├── momentum-architect/
    │   ├── momentum-prompt-gen/
    │   ├── momentum-n8n-builder/
    │   ├── momentum-workflow-variants/
    │   ├── momentum-delivery/
    │   ├── momentum-prompt-optimizer/
    │   └── momentum-pipeline/
    │
    └── agents/                     # Agents de soporte
        ├── n8n-analyzer.md
        └── prompt-reviewer.md
```

---

## 10. Próximos pasos para el lector

Si llegaste hasta acá leyendo en orden, ya tenés el modelo mental completo del sistema. Los próximos pasos prácticos:

### Si vas a tomar un cliente activo existente

1. Leer `clients/{cliente}/architecture.md` y `entrega.md`
2. Revisar `clients/{cliente}/prompts/` para entender el bot
3. Importar el workflow JSON en n8n para inspeccionarlo
4. Probar el workflow TEST con conversaciones simuladas
5. Revisar los últimos commits en `clients/{cliente}/` para ver evolución reciente
6. Revisar `clients/{cliente}/versions/` para snapshots históricos

### Si vas a tomar un cliente nuevo

1. Programar el discovery con el cliente
2. Seguir el checklist de cliente nuevo (§1 de este capítulo)
3. Usar los skills (`/momentum-discovery`, `/momentum-architect`, etc.) o ejecutar manualmente
4. Referenciar [Capítulo 05](05-catalogo-prompts.md) para prompts base
5. Referenciar [Capítulo 08](08-casos-estudio.md) para el patrón por tipo de negocio

### Si vas a hacer mantenimiento

1. Familiarizarte con el [Capítulo 09](09-troubleshooting.md)
2. Saber cómo monitorear (logs de n8n, Airtable, Discord)
3. Aprender el ciclo de cambio quirúrgico (un cambio a la vez, medir, documentar)
4. Mantener disciplina de versionado ([Capítulo 10 §4](10-entrega-gobernanza.md))

### Si vas a entrenar a otra persona

1. Empezar por el [README](README.md) (resumen ejecutivo)
2. Hacer leer el capítulo 01 (filosofía) — sin esto, el resto no tiene sentido
3. Mostrar un cliente real (Dr. Carlos o El Canal en `knowledge/workflows-reference/`)
4. Construir un cliente nuevo en paralelo (proyecto de "Build-Along")
5. Después de un cliente completo, la persona puede asumir clientes en autonomía

---

## 11. Mantenimiento de este manual

Este manual no es estático. Se actualiza cuando:

- Un cliente nuevo revela un patrón no documentado
- Un fix técnico se vuelve estándar (ej: `responseMode: "onReceived"`)
- Una herramienta nueva se integra al stack (ej: nuevo BSP de WhatsApp)
- Un cambio en los modelos LLM afecta las reglas (ej: GPT-5)
- Un caso legal o de compliance impone nuevas restricciones

**Disciplina:** las actualizaciones se hacen quirúrgicamente, igual que con los prompts. No reescritura completa de capítulos a menos que el cambio sea estructural.

**Versionado:** la fecha de última revisión queda en el footer de cada capítulo. El historial completo está en git log del repositorio.

---

## 12. Cierre

El sistema de Momentum AI lleva 18+ proyectos en producción. La diferencia entre los proyectos que funcionan y los que no es la disciplina operativa: seguir las reglas no negociables, hacer cambios quirúrgicos, mantener los prompts como fuente de verdad, y aprender de cada cliente.

Este manual es la destilación de todo eso. Si lo seguís al pie de la letra y desarrollás criterio propio sobre cuándo flexibilizar (y por qué), vas a producir chatbots tan buenos o mejores que los que están en producción hoy.

Lo más importante es que no estás solo: el sistema tiene templates de referencia, skills automatizados, snapshots históricos de clientes anteriores, y una metodología validada. Cada decisión que tengas que tomar ya fue tomada antes por alguien — está documentada acá. Usalo.

---

**Anterior:** [Capítulo 10 — Entrega al cliente y gobernanza](10-entrega-gobernanza.md)

**Volver al inicio:** [README](README.md)
