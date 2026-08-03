# Momentum AI CRM — Frontera CORE vs Módulos

**Fecha:** 2026-05-27
**Estado:** Draft — para revisión del founder
**Propósito:** Definir exactamente qué tiene el CRM general base (el "Ditto" que recibe cualquier cliente al crear su cuenta) vs qué se agrega como módulo. Esta es la decisión más estructural del producto: define el límite entre lo que TODOS tienen y lo que solo algunos prenden.

---

## El criterio de decisión

Una funcionalidad va al **CORE** si: **la necesita prácticamente cualquier negocio, sin importar el nicho.**

Una funcionalidad va a **MÓDULO** si: **es específica de un tipo de negocio** (propiedades solo inmobiliaria, productos solo ecommerce).

Regla práctica: si >80% de los clientes lo van a usar sin importar a qué se dedican → CORE. Si es de un vertical específico → módulo.

---

## El CRM GENERAL BASE (CORE)

Esto es lo que recibe Roberto al crear su cuenta, ANTES de que el master le prenda cualquier módulo. Es un CRM conversacional completo y funcional por sí solo — el "Ditto" que se adapta vía prompt.

### 1. Chatbot conversacional (el corazón)

- Recibe mensajes de los canales conectados (WhatsApp, IG, Messenger)
- Responde según su **system prompt** (configurable por agency — acá vive la "personalidad" y el conocimiento del negocio)
- **Memoria conversacional** (recuerda el hilo con cada lead)
- **Pausar / reactivar** el bot por conversación (handoff bot ↔ humano)
- Sin módulos, el bot conversa, responde dudas, captura datos — pero NO consulta catálogos (no hay propiedades ni productos hasta prender módulo)

### 2. Inbox / bandeja de conversaciones

- Lista de todas las conversaciones de la agency
- Vista de chat por lead (historial completo, multi-canal)
- Estado de cada conversación: bot / handoff (humano tomó control) / cerrada
- Tomar control manual y responder como humano
- Badge de canal (de qué canal viene cada conversación)

### 3. Gestión de leads / contactos

- Lista de leads con su info
- Ficha del lead (datos, historial, conversaciones)
- **Pipeline configurable**: etapas/estados del lead (nuevo, contactado, calificado, etc. — editable por agency)
- **Tags** (etiquetas manuales o automáticas)

### 4. Extracción genérica de info del chat

- El sistema extrae del chat: nombre, contacto, intención general
- **Custom fields** genéricos (la agency define campos extra que quiere capturar)
- Sin módulos, la extracción es genérica. Al prender un módulo, se suma extracción específica del nicho.

### 5. Multi-canal

- Conectar WhatsApp / Instagram / Messenger
- Una conversación por (lead × canal)
- El bot responde por el mismo canal que entró

### 6. Agenda (CORE — decisión 2026-05-27)

- Eventos / citas básicas asociadas a leads
- Recordatorios
- **Por qué CORE y no módulo:** es transversal a casi todos los nichos (inmobiliaria agenda visitas, fisio agenda citas, restaurante reservas). Si fuera módulo, su lógica (calendario, recordatorios, conflictos de horario) se duplicaría en cada plug-in de nicho. Mejor una sola implementación en el CORE, parametrizable.
- Si una agency no la usa, simplemente no crea eventos.

### 7. Seguimientos / followups (CORE — PROPUESTO, a confirmar)

- Crear seguimiento → ¿automático o manual?
- Template del mensaje
- Si auto: X horas después del último mensaje del lead
- Si manual: botón de disparar desde la conversación
- **Por qué propongo CORE:** Pietro lo marcó como el segundo dolor real después de chatbot+CRM, y el followup de leads es universal en cualquier CRM (todos quieren no perder un lead por no dar seguimiento). No es de un nicho específico.
- **Debatible:** podría ser un módulo "siempre recomendado" en vez de CORE puro. Tu decisión.

### 8. Configuración de la agency

- Datos del negocio (nombre, logo, contacto)
- Editar el system prompt del bot (lo que define qué es el negocio)
- Gestión de canales conectados
- Gestión del equipo (invitar miembros, asignar roles — infraestructura lista, enforcement gradual)

---

## Los MÓDULOS (se prenden por agency)

Esto NO viene por defecto. El master lo prende según el nicho del cliente.

| Módulo | Qué agrega | Extracción específica que activa | Nicho |
|---|---|---|---|
| **Propiedades** | Catálogo de propiedades. El bot las consulta y ofrece. Pestaña "Propiedades" en UI. | presupuesto, zona, compra/alquiler, tipo, m² | Inmobiliaria |
| **Servicios + citas** | Catálogo de servicios, staff, disponibilidad. El bot agenda. | servicio deseado, profesional preferido, urgencia | Fisio, peluquería, clínica |
| **Ecommerce** | Productos, variantes, órdenes. El bot vende. | producto, cantidad, método de pago | Tiendas online |
| **Soporte** | Tickets, categorías, base de conocimiento. El bot resuelve dudas. | tipo de problema, prioridad, producto afectado | Helpdesk, SaaS |
| **Tareas** | TODOs estructurados sobre leads (más allá del followup simple). | — | Cualquiera (opcional) |
| **Custom** | Lo que un cliente pida (fork o desde cero). | Según se defina | A medida |

### Nota sobre "Tareas"

Pietro lo desprioritizó explícitamente ("tareas es algo extra"). Lo dejo como **módulo opcional**, no CORE. El followup (CORE) cubre el 80% de la necesidad de "no perder al lead". Tareas estructuradas es para clientes que quieren gestión más formal.

---

## Cómo se ve una agency recién creada (solo CORE, sin módulos)

```
┌─────────────────────────────────────────────┐
│  [Agency: Roberto] — vista del cliente        │
├─────────────────────────────────────────────┤
│  📥 Conversaciones    (inbox del chatbot)     │
│  👥 Leads             (contactos + pipeline)  │
│  📅 Agenda            (citas/eventos)         │
│  🔔 Seguimientos      (followups)             │
│  ⚙️  Configuración    (negocio, bot, equipo)   │
└─────────────────────────────────────────────┘
        ↑ esto es el "Ditto" — sirve para CUALQUIER negocio
```

Cuando el master prende el módulo "Propiedades":

```
┌─────────────────────────────────────────────┐
│  [Agency: Roberto] — ahora inmobiliaria       │
├─────────────────────────────────────────────┤
│  📥 Conversaciones                            │
│  👥 Leads                                     │
│  🏠 Propiedades       ← NUEVO (módulo)         │
│  📅 Agenda                                    │
│  🔔 Seguimientos                              │
│  ⚙️  Configuración                             │
└─────────────────────────────────────────────┘
        + el bot ahora consulta propiedades reales
        + extrae presupuesto/zona del chat
```

---

## Decisiones validadas (2026-05-27)

1. **Seguimientos = CORE** ✅ confirmado. "Si no vendemos seguimientos, vendemos un sistema incompleto." Motor de followups (auto por tiempo + manual) es parte del CORE.
2. **Tareas = CORE** ✅ confirmado. No es complejo y es buen plus. Sube de módulo a CORE.
3. **Reportes / métricas / notificaciones = CORE fijo** ✅ confirmado.
4. **Pipeline configurable** ✅ confirmado. Migrar de enum fijo (v1) a tabla `pipeline_stages` por agency.
5. **Comportamiento del bot en punto de venta = configurable** ✅ (nuevo, del founder). Cerrar venta en chat / mandar link de pago / derivar a humano + avisar. Vive en bot config.
6. **Notificaciones configurables** ✅ — el cliente define qué eventos del chat lo notifican.

## El bot configurable: modelo "Prompt Compositor"

El system prompt del bot NO es un blob de texto editable entero por cliente. Hoy (v1) vive hardcoded en N8N. En v2 se ensambla por capas:

| # | Capa | Editable | Quién la define |
|---|---|---|---|
| 1 | **Núcleo del sistema** (rol base, reglas de operación, tools, handoff, formato, anti-loop, seguridad) | ❌ FIJO | Global, versionado por nosotros |
| 2 | **Identidad del negocio** (nombre, qué hace, propuesta de valor) | ✅ | Master/agency |
| 3 | **Estilo / tono** (vendedor \| consultivo \| amigable \| formal) | ✅ preset + custom | Master/agency |
| 4 | **Comportamiento de venta** (cerrar en chat \| mandar link \| derivar+avisar) | ✅ preset | Master/agency |
| 5 | **Fragments de módulos** (propiedades → tool buscar_propiedades, etc.) | 🔁 auto | Sistema, según módulos prendidos |
| 6 | **Instrucciones custom** (texto libre opcional) | ✅ escape hatch | Master/agency |
| 7 | **Reglas finales del sistema** (marker media, límites, anti-loop) | ❌ FIJO | Global |

**Prompt final = concatenación ordenada de las 7 capas.** Las capas 1 y 7 son la "estructura principal" protegida (probada, igual para todos, no se rompe). Las 2/3/4/6 son personalizables. La 5 es automática.

**Beneficio clave:** mejorar el núcleo (capa 1) beneficia a TODOS los clientes sin re-tocar sus prompts. Opuesto a prompts custom desde cero (inmantenible).

**Implicación de schema:**
- `bot_prompt_templates` (global, versionado): la estructura con placeholders de las capas 1, 7.
- `agency.bot_config` (jsonb o tabla): valores de las capas 2/3/4/6 por agency (tono, técnicas, sales_close_behavior, business_info, custom_instructions).
- Capa 5 se computa de `agency_modules`.

Detalle completo en el spec del bot v6 (pendiente). Skill aplicable: `langchain-agent-prompt-design`.

## Lo que el v1 YA tiene (mapeo verificado en código + DB, 2026-05-27)

El v1, sin `properties`, ya es ~85% del CORE. Esto NO se reinventa — se hereda.

**Heredado del v1 (CORE listo):** chatbot + memoria + handoff completo (`conversations.handler`, `bot_paused_until`, handoff status/reason/summary), inbox multi-canal, `leads` con pipeline+score+multi-canal IDs, `tasks`, agenda (calendar), reports, `tags`, `custom_field_defs/values`, notificaciones (componente existe), `agency.settings` jsonb (con bot_enabled kill switch), `agency_members` con roles (ya es N:M con auth.users), `agency_channels` (8 canales), `messages` (10 kinds, bot_reasoning jsonb), `webhook_events_raw`, `audit_log`, `n8n_chat_histories`, `documents` (RAG pgvector).

**Falta agregar al CORE en v2:** `master_accounts` + impersonation, sistema de módulos, motor de seguimientos automáticos, bot config (prompt compositor), formalizar extracción modular, `pipeline_stages` configurable.

**Sale a módulo:** `properties` (+ property_views, visit_requests) → módulo Inmobiliaria.

## 3 decisiones técnicas resueltas (surgieron de mirar el v1)

1. **Pipeline:** migrar de enum fijo → tabla `pipeline_stages` por agency. ✅ Configurable desde v2.
2. **Extracción de datos:** formalizar de `messages.bot_reasoning` jsonb → tablas `extractor_field_defs/values` (mejor para reportes y filtros, y necesario para extracción modular por nicho). ✅
3. **Prompt del bot:** hoy en N8N hardcoded → mover a DB con modelo Prompt Compositor (arriba). ✅

---

## Por qué esta frontera importa tanto

- **Define el SQL del CORE** que voy a escribir: las tablas CORE (users, agencies, leads, conversations, messages, agenda, followups, config) se crean SIEMPRE. Las tablas de módulo (properties, services, products) solo cuando se prende el módulo.
- **Define qué ve un cliente nuevo** sin configuración: el Ditto funcional.
- **Define el contrato del bot:** sin módulos el bot conversa con su prompt; con módulos gana tools para consultar catálogos.
- **Evita duplicación:** lo que es CORE se implementa UNA vez. Lo que es módulo respeta el contract y se acopla.

---

## Por qué esta frontera importa tanto

- **Define el SQL del CORE** que voy a escribir: las tablas CORE (users, agencies, leads, conversations, messages, agenda, followups, config) se crean SIEMPRE. Las tablas de módulo (properties, services, products) solo cuando se prende el módulo.
- **Define qué ve un cliente nuevo** sin configuración: el Ditto funcional.
- **Define el contrato del bot:** sin módulos el bot conversa con su prompt; con módulos gana tools para consultar catálogos.
- **Evita duplicación:** lo que es CORE se implementa UNA vez. Lo que es módulo respeta el contract y se acopla.
