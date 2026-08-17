# Backlog MVP — Momentum AI CRM

**Propósito:** Registro vivo de lo implementado vs lo pendiente. Es la fuente de verdad para ir tachando el MVP. Se actualiza cada sesión.

**Fuente:** Reunión Hans & Pietro del 2026-05-28 (`Hans & Pietro - Mayo 28 2026.md`) + auditoría del código real.
**Última auditoría contra código:** 2026-05-28 (noche).
**Alcance del MVP (acordado):** **Conversaciones + Contactos "nivel Dios"**. Todo lo demás (Agenda, Seguimientos, Tareas) es post-MVP.

**Leyenda:** `[x]` hecho y verificado · `[~]` parcial (falta UI o un pedazo) · `[ ]` pendiente · 🔮 post-MVP.

---

## Estado general (resumen ejecutivo)

- **Conversaciones / Inbox:** ~90% del MVP. Funciona en vivo (inbound + outbound entregando a WhatsApp). Faltan detalles chicos (ver abajo).
- **Contactos (Leads):** **0% — es un stub `ComingSoon`.** Es la otra mitad del MVP. Prioridad #1 de construcción.
- **Panel Admin (solo master):** ✅ construido (2026-05-29). Editor del Asistente por negocio (`agencies.bot_config`) con 5 secciones + flujo paso a paso + preview del prompt ensamblado. Ítem solo-master en el sidebar + ruta blindada server-side. **Falta cablear el bot para que LEA esa config** (§4).
- **Configuración (Settings) cliente-facing:** **0% — stub `ComingSoon`.** El schema (`agencies.settings`) y la lógica backend existen; falta TODA la UI cliente-facing (toggles de auto-acciones, horarios, umbrales, canales, equipo/roles). El prompt del bot ya NO vive acá — se movió al Panel Admin.
- **Backend / infra:** sólido. Realtime, procedencia, `agency_channels`, settings jsonb, entrega outbound, bot n8n portado a v2 — todo en `fahujscodhqlopycorzn`.

---

## 1. Conversaciones / Inbox

### 1.1 Lista de conversaciones + tarjeta (card)
- [x] Tarjeta configurable estilo Notion — toggles: Estado, Calificado, Etiquetas, Fuente.
- [x] Persistencia de preferencias de la card (localStorage por agency, sync cross-tab).
- [x] Default de la card: avatar, encargado (siempre visible, bot vs agente), nombre, preview, hora, contador de respuestas del contacto, badge sin-leer.
- [x] Indicador visual bot vs humano (HandlerCircle) en la card.
- [x] Contador de "respuestas del contacto" afuera (solo cuenta mensajes entrantes del cliente).
- [x] Contador de mensajes sin leer (independiente del handler → se ve aunque lo tenga el bot).
- [~] Scroll horizontal de filtros — funciona (scrollIntoView) pero sin affordance visual de barra. Pulir.
- [ ] Avatar/imagen personalizable del chatbot (hoy es icono genérico).

### 1.2 Filtros y búsqueda
- [x] Filtros: Todos, Sin leer, Bot, Míos, Handoff (con counts).
- [x] Segundo filtro por agente (elegir agente encargado).
- [x] Buscador por nombre y teléfono (instantáneo) + contenido de mensajes (async ≥2 chars).
- [x] Búsqueda estilo WhatsApp "rajado": sección Chats + sección Mensajes con resaltado.
- [ ] Restringir filtro "Todos" según rol (community manager NO ve "Todos") — depende del sistema de roles (ver §6).

### 1.3 Panel de chat + banner + header
- [x] Banner "Bot atendiendo. Podés intervenir cuando quieras" (sin "automáticamente"); se quita cuando el handler deja de ser bot.
- [x] Handoff en la lista: pill pulsante (clase `inbox-pulse`) + warning + razón. (Muy visible ✓.)
- [x] Badge de encargado cliqueable (toggle bot↔humano).
- [~] Badge de etapa cliqueable (HeaderStageDropdown) — OK en desktop; en modo compact queda limitado. Revisar compact.
- [ ] Menú de "tres puntitos": el botón existe pero NO está conectado a nada. Decidir contenido (llamar/email/marcar no leído) o quitarlo.
- [ ] "Marcar como no leído" (botón aparte). Ausente. (Pietro luego dudó si hace falta.)

### 1.4 Composer (caja de texto)
- [x] Enviar mensaje del agente con entrega real a WhatsApp (status queued → YCloud → sent/delivered). Verificado: *delivered*.
- [x] Asistente de IA: botón "Sugerir respuesta" + pedido personalizado; el resultado cae en la caja para editar.
  - [ ] **Falta que el founder ponga la AI key** (`AI_API_KEY`/`AI_BASE_URL`/`AI_MODEL` en `crm-v2/.env.local`) para que genere de verdad.
- [ ] Adjuntar/enviar **imágenes y videos** (composer hoy solo texto).
- [ ] Enviar **audios** (cuando atiende un humano).
- [ ] 🔮 Audios con **transcript automático** para que el bot vea lo que se dijo.
- [ ] **Templates / machotes** (mensajes predefinidos tipo ManyChat) cerca de la caja, sin pestaña propia. Hoy hay botón "Plantillas (próximamente)" deshabilitado.

### 1.5 Tiempos de respuesta / Insights
- [x] Alerta de tiempo POR MENSAJE: puntito verde/amarillo/rojo + "Resp. en X min" debajo del outbound.
- [x] Lógica de umbrales (verde/amarillo/rojo) + descuento de tiempo fuera de horario hábil (`response-time.ts`).
- [x] Pestaña **Insights** por contacto: promedio del bot, promedio del humano, las 3 respuestas más lentas del equipo.
- [x] Tiempo medido desde el último mensaje del contacto; no depende del estado.
- [x] ⭐ **Panel de inteligencia del contacto (Insights nivel Dios)** — reemplazó la pestaña de solo-tiempos en la ficha:
  - **Bloque A — extraído por el bot** (de `extractor_field_values`): intención, temperatura (chip), urgencia (chip), objeciones, datos clave, próximo paso, resumen + score (anillo). Render por tipo, con estados "pendiente". HOY con datos SEMBRADOS para demo (`seed-demo-insights.mjs`); los reales los llena el bot (ver §4).
  - **Bloque B — analítica calculada**: conversación (contacto/bot/humano), tiempos de respuesta, journey del pipeline (tiempo en etapa, tiempo a calificar), recencia, patrón de actividad por franja horaria.
- [ ] **UI** para configurar los umbrales (verde <5 / amarillo 5-10 / rojo >10) — vive en Settings (ver §3).
- [ ] 🔮 Dashboard global de insights (agregado por agente/negocio). Hoy la data se guarda; falta el tablero.

### 1.6 Panel de detalle del contacto
- [x] "Fuente" reubicada debajo del bloque del contacto.
- [x] Estado (etapa) y Calificado SEPARADOS (calificado fuera del dropdown de estado).
- [x] Procedencia bot/humano (iconito) + tooltip "Por [quién] · [cuándo]" en estado/calificado/asignado.
- [x] "Asignado a" con selección de agente + "Sin asignar".
- [x] Auto-asignación al escribir + override ("el que escribe es el nuevo encargado").
- [ ] **Historial de notas** con iconito (bot/humano) + fecha/hora. Hoy solo hay un textarea de notas, sin historial.
- [ ] **Auto-notas** (toggle): que el bot pueda agregar notas al historial.
- [x] Panel abierto por default; estado de apertura se mantiene entre conversaciones.

### 1.7 Responsive
- [x] Mobile: vista compacta → chat + info del contacto; acceso a todo desde el celular.

---

## 2. Contactos ("nivel Dios") — ✅ CONSTRUIDO (Pasadas 1 y 2, verificado en browser 2026-05-29)

> Reemplazó el stub. CORE/agnóstico de nicho. Ruta `/a/[slug]/leads` (UI dice "Contactos").

### 2.1 Pantalla principal (Pasada 1)
- [x] Vista Lista (tabla densa desktop + cards mobile): Contacto, Estado (editable inline + procedencia), Calificado, Score, Asignado, Fuente, Etiquetas, Última actividad, # respuestas.
- [x] Vista **Kanban arrastrable** (`@dnd-kit`): columnas = pipeline_stages; el drag cambia la etapa con procedencia humana y persiste.
- [x] Strip de métricas (Total, Calificados, Sin asignar, Handoff) clicables.
- [x] Buscador (nombre/teléfono/email con acentos) + filtros rápidos + dropdowns (etapa/fuente/agente).
- [x] Realtime (canal agency; handler leads INSERT+UPDATE+soft-delete) + edición inline (estado/calificado/asignado).
- [x] Botón "Nuevo contacto" (modal).
- [ ] Edición inline de etiquetas en la tabla (hoy read-only; se editan en la ficha).

### 2.2 Ficha del contacto (Pasada 2) — `/a/[slug]/leads/[id]`
- [x] Header con identidad + acciones (llamar/WhatsApp/email) + Estado/Calificado/Asignado/Fuente con procedencia, editables.
- [x] Pestaña **Info**: score editable, etiquetas editables, datos, `bot_summary`, `extra` (jsonb) legible.
- [x] Pestaña **Conversación**: hilo read-only + "Responder en el inbox" (deep-link `?conv=`).
- [x] Pestaña **Insights**: el panel de inteligencia (ver §1.5).
- [x] Pestaña **Notas**: editor del campo `notes` (autosave).
- [x] Pestaña **Actividad**: timeline derivado (creación, cambios de etapa/calificado con procedencia, recencia). `audit_log` existe pero NO se puebla → es derivado.
- [ ] **Historial de notas** con procedencia (necesita tabla `lead_notes`) — ver §1.6.

---

## 3. Panel Admin (solo master) + Configuración (cliente)

> El prompt configurable se separó en un **Panel Admin** propio (solo master, dentro del negocio), distinto de la Configuración cliente-facing. Razón: no mezclar palancas de master con lo que ve/edita el cliente (decisión del founder, 2026-05-29).

### 3.1 Panel Admin — ✅ CONSTRUIDO (verificado en browser 2026-05-29)
- [x] Ítem **"Panel Admin"** en el sidebar, **solo visible para master** (`isMaster`). El cliente no lo ve.
- [x] Ruta `/a/[slug]/admin` **blindada server-side** (verifica `master_accounts` → `notFound()` a no-master; no solo escondida).
- [x] ⭐ **Editor del Asistente POR NEGOCIO** (guarda en `agencies.bot_config`), estructurado por secciones (capas configurables del Prompt Compositor):
  - **Identidad del negocio** (`business_info`).
  - **Tono** (`tone`): 4 presets (vendedor/consultivo/amigable/formal) + matices libres.
  - **Comportamiento de venta** (`sales_close_behavior`): cerrar en chat / mandar link / derivar a humano.
  - **Flujo de conversación** (`conversation_flow`): **lista de pasos paso a paso, reordenable (↑↓), agregar/borrar**.
  - **Instrucciones adicionales** (`custom_instructions`): texto libre.
- [x] **Vista previa read-only** del prompt ensamblado (núcleo fijo etiquetado + capas configuradas + módulos + reglas finales).
- [x] Dirty-tracking + guardado con persistencia verificada (edit → save → reload → vuelve de la DB).
- [x] **Cliente NO ve el prompt** (ni read-only) — decisión del founder: read-only abre la puerta a "quiero editarlo" y termina rompiéndolo.
- [ ] **Falta:** que el bot (n8n) LEA `bot_config` en runtime y se adapte (ver §4). Hoy el panel guarda pero el bot todavía no lo consume.
- [ ] 🔮 Futuro: más secciones del Panel Admin (prender/apagar módulos, etapas del pipeline, campos del extractor).

### 3.2 Configuración (Settings) cliente-facing — **PENDIENTE (stub)**
> Schema (`agencies.settings`, migración 0009) y lógica backend listos; falta toda la UI cliente-facing.
- [ ] Pantalla de Configuración funcional (hoy `ComingSoon`).
- [ ] **Toggles de auto-acciones** (default todo prendido): auto-estado, auto-calificación, auto-asignación, auto-etiquetado, auto-notas.
- [ ] **Master toggle** "todos prendidos / todos apagados".
- [ ] **Umbrales de tiempo de respuesta** (verde/amarillo/rojo) configurables.
- [ ] **Horario hábil** (business hours) configurable — los tiempos solo cuentan dentro de ese horario.
- [ ] **Bot fuera de horario**: 24/7 vs "fuera de horario" con mensaje **personalizable**.
- [ ] Datos del negocio (nombre, rubro, etc.).
- [ ] Canales conectados (WhatsApp; luego Instagram/Messenger) — flujo de conexión self-service.
- [ ] Equipo + roles (ver §6).

---

## 4. Bot / automatización (n8n)

> **Corrección importante (2026-05-29 tarde-noche):** la entrada anterior "Sofia v5.5 portado a v2, activo" era engañosa. La realidad descubierta al revisar el JSON: v5.5 NO está limpio en v2 (tiene refs v1 en `Supabase Properties Tool`, `Request Handoff Tool` y `Expand Property Images`); la port v5.4→v2db documentada **nunca se construyó**. Además, el founder confirmó que **Sofia NO está en producción** (el doc `04-bot-v6-conexion-whatsapp.md` dice "en producción", desactualizado). Quien sí es la port real a v2 = el nuevo workflow **bot-v6 v1** (abajo).

- [x] ⭐ **F1 del cableado del bot — TERMINADO al 100% (construible).** Workflow `Chatbot Momentum - bot-v6 v1` (id n8n `p3h7tx6UiGBQ9Tzb`, inactivo): base v2 limpia + query maestra v2 + nodo `Componer System Prompt` (replica `composePreview()` del Panel) + `systemMessage` del agente apunta al compositor. Cambiar `bot_config` en el Panel cambia el bot, sin tocar n8n. Pipeline architect→builder→reviewer (PASS con 2 warnings: security FIJADO; `handoff_reason` mapping → F4). Importado a n8n con credenciales preservadas. Verificación post-import OK.
- [ ] **GO-LIVE de F1 (founder, en orden):** (a) repuntar credencial Postgres `pMsxqUvr0wDZsjIt` a v2; (b) pegar link de agenda de Robert en el Panel; (c) apuntar webhook YCloud al workflow nuevo; (d) avisar a Claude "ya repunté la credencial, activá" → Claude activa vía API; (e) test real.
- [x] ⭐ **F2 — Extractor como tool: DEPLOYADO 2026-05-29.** Bot escribe `extractor_field_values` cada turno (7 campos core). Habilita panel de Insights (§1.5) con data REAL. Spec: `memory/n8n-changes/2026-05-29-cablear-bot-config-runtime.md`.
- [x] **F3 — Atribución en intake: DEPLOYADO 2026-05-29.** `ycloud-webhook` v4 captura `referral` Meta → `leads.attribution` (first-touch, solo en insert).
- [x] **F4 — Handoff tool reconectada + 6 handlers + office_hours + auto-acciones: DEPLOYADO 2026-05-29 noche-final.** bot-actions v0.2.0 con 7 handlers reales (extractor + 5 auto-acciones + handoff.escalate + conversation.pause_until). Workflow N8N con OOO check + `bot_paused_until` + bloque dinámico AUTO-ACCIONES en compositor. Migración 0014 lead_notes aplicada. **Tools renombradas a alfanumérico+underscore** (fix bug n8n 1.121, 2026-05-30 mediodía).
- [ ] ⭐ **F5 — Foundation para migración a arquitectura C (semana 1, ~4-5 jornadas).** Decidido en mesa arquitectónica 2026-05-30 (ver `memory/research/14-mesa-arquitectura-sofia-v6.md`). Entregables: (a) golden set de 50-100 conversaciones reales etiquetadas con tools esperadas; (b) harness de evaluación N8N que mide tool-call accuracy + latencia + costo contra cualquier arquitectura; (c) prompt caching en compositor; (d) `audit_log` con trace_id end-to-end + `extractor_prompt_used` + `schema_version_hash`; (e) idempotencia en `bot-actions` via unique key `turn_id + tool + params_hash`. Sirve A, B, C y D — inversión que no se pierde.
- [ ] ⭐ **F6 — Build arquitectura C (Híbrido determinista, semana 2-3, ~7-9 jornadas).** Sofia conversa SIN tools en el agente (prompt 40% más corto, posiblemente `gpt-4o-mini`). Rama paralela: Information Extractor node → JSON tipado → 6 IF/Switch + HTTP Requests llaman a `bot-actions`. Validación determinista post-extractor (regex/enum). Advisory lock por `lead_id`. Retry exponencial + DLQ procesable. A/B test calidad conversacional `gpt-4o-mini` vs `gpt-4o`. Workflow nuevo en paralelo al actual (no se toca Sofia v6 hoy).
- [ ] ⭐ **F7 — Wake-up automático del bot al inicio del horario hábil (sobre C, NO sobre A).** pg_cron en Supabase llama edge function `wake-up-paused-bots` cada 1 min → SELECT conversations donde `bot_paused_until <= now()` AND último mensaje del lead → UPDATE `bot_paused_until=NULL` + webhook a N8N workflow wake-up dedicado. Jitter `+ random(0, 30min)` en F4 para esparcir el spike del lunes 08:00. Rate limit por tick. Implementar DESPUÉS de F6 (no tiene sentido implementar wake-up dos veces).
- [ ] **Cutover canary A → C (semana 4, ~2 jornadas).** Dashboard tasa-de-extractor-fail por agencia con alerta >2%. Canary 10% → 50% → 100% con botón rollback al workflow A en cualquier momento.
- [ ] Quitar el gate `If1` (+50688217229) para abrir a leads reales (cuando C esté en vivo).
- [ ] Módulo de propiedades inmobiliario + few-shot (mover a fase posterior, después del cutover a C).
- [ ] Cerrar gap reviewer F4: Telegram notification para handoff por tool (no urgente).

---

## 5. Multimedia
- [ ] Imágenes y videos (enviar/recibir) en el chat (agente y bot).
- [ ] Audios (humano).
- [ ] 🔮 Transcript de audios para el bot.

---

## 6. Roles & arquitectura de cuentas (mayormente post-MVP)

- [~] Enum `agency_role` (owner/admin/agent/viewer) + RLS `is_member_of` existen; **sin granularidad por rol** (hoy todo miembro ve todo).
- [ ] Rol limitado (community manager): solo ve sus conversaciones/asignadas, se le esconde "Todos".
- [ ] 🔮 Multi-cuenta por cliente (un cliente, varios negocios).
- [ ] 🔮 Equipo por negocio (usuarios con roles dentro de la cuenta del cliente; un equipo ve solo su negocio).
- [ ] 🔮 Back-office para agencias (una agencia administra solo las cuentas que vendió).
- [ ] 🔮 Roles del lado Momentum (más gente del equipo).

---

## 7. Canal / WhatsApp / YCloud / Meta

- [x] WhatsApp inbound en vivo (YCloud → edge function → v2).
- [x] Entrega outbound (agente) a WhatsApp.
- [ ] Flujo de onboarding de cliente self-service (configuración → integración → escanear número).
- [ ] 🔮 Messenger + Instagram (o DM automatizado que mande a WhatsApp).
- [ ] 🔮 Tech Partner de YCloud / Meta + App Review (Facebook for Developers) — da credibilidad y conexión sin portafolio comercial del cliente.

---

## 8. Modelo de negocio & infraestructura (contexto / decisiones)

- **NO es SaaS:** se vende el **servicio a la medida** (prompt + etiquetas + módulos por nicho), no el sistema.
- **3 diferenciadores:** (1) una sola herramienta; (2) el bot hace cosas solo (califica, cambia estado, asigna, etiqueta); (3) IA en la cajita de texto.
- **LLM:** chatbot fijo en ChatGPT por confiabilidad; probar **DeepSeek** (barato) para "todo lo demás".
- **Costos:** fee mensual alto por cliente (IA + DB + contexto). Referencia con Roberto ~$100–150/mes. Tener presente desde ya (nota de Klaus).
- **YCloud pricing:** por canal (cada canal = un número); una sola cuenta de Hans administra todos.
- **Supabase:** rate limits configurables contra abuso; auth + seguridad de plataforma; pensar escalabilidad (3 a 200 msj/día).
- **Diseño:** paleta tierra (se queda así, "más neutro"). Landing del servicio ya hecha.

---

## 9. Post-MVP explícito (NO en el MVP)
- 🔮 Agenda (Calendly).
- 🔮 Seguimientos (follow-ups automáticos cuando el contacto deja de responder + templates aprobados por Meta).
- 🔮 Tareas.
- 🔮 Dashboard global de insights.
- 🔮 Messenger + Instagram.
- 🔮 **Chatbot demo simulado dentro del CRM** (sales asset). Idea capturada 2026-06-06 — ver detalle en [memory/ideas-futuras/chatbot-demo-simulado.md](ideas-futuras/chatbot-demo-simulado.md). UI tipo conversación visual estilo WhatsApp dentro de la plataforma, NO conectado a número real, NO Telegram, NO YCloud. Por detrás un agente IA responde para que prospectos puedan "probar" el bot vivo sin tener que cargar contacto. Sirve para Hans/Pietro en demos comerciales (compartir link → prospecto interactúa → ve la magia → agenda llamada).

---

## 10. Próximos pasos priorizados (orden sugerido — actualizado 2026-05-30 post mesa arquitectónica)

1. ⭐ **F5 — Foundation (§4):** golden set + harness de eval + idempotencia + audit_log con trace_id. BLOQUEA F6/F7. ~4-5 jornadas.
2. ⭐ **F6 — Build arquitectura C en paralelo (§4):** Sofia sin tools + Information Extractor + nodos deterministas + advisory lock + retry/DLQ. ~7-9 jornadas.
3. ⭐ **F7 — Wake-up automático sobre C (§4):** pg_cron + edge function + workflow N8N wake-up dedicado + jitter. ~2-3 jornadas.
4. **Cutover canary A → C (§4):** dashboard + alerta >2% + canary 10/50/100 con rollback. ~2 jornadas.
5. **Detalles del inbox** (§1.3–1.6): historial de notas (lead_notes UI), marcar no leído / menú tres puntitos, multimedia, templates.
6. **Módulo Propiedades + few-shot inmobiliario** (§4): se mueve a fase posterior, después del cutover a C.
7. **AI key del composer** (§1.4) — depende del founder.
8. Comercial: escribirle a **Jimena** para mostrar el sistema (guion acordado en la reunión).

---

## Changelog del backlog

- **2026-06-06 (sesión deploy del Agente Principal + merge kit N8N + 6 pushes al N8N):** Sesión de ~6 horas. Arrancamos con los 5 prompts del bot Mateo (renombrado a "Agente Principal" hoy) listos en `clients/momentum-ai-crm/prompts/` + arquitectura v1.1. Founder pidió ejecutar deploy paso a paso. **Fase 1 — deploy improvisado (SET2, cagado):** armé build script para insertar Router (Information Extractor pre-agente) + Switch 3 caminos + Agente Objeciones + Silent Handoff + renombrar Sofia C → Agente Principal + cambiar modelos a gpt-4.1-mini + reemplazar prompt Formateador canónico. Script pasó 36/36 smoke tests internos. Push OK (`versionId 6ae4da95`). PERO el pantallazo del founder mostró el Router con icono `?` (tipo desconocido) — typeVersion 1.3 inventado. **Founder con razón frustrado:** *"te estás inventando un nodo llamado 'router' que eso no existe"*. **Fase 2 — merge del kit N8N (`_transfer-n8n-build-kit/`):** founder pasó kit hermano del de prompting de ayer. 5 skills nuevas (`momentum-n8n-builder` ⭐, `momentum-workflow-variants`, `n8n-postgres-prepared-statements`, `chatbot-manychat-supabase-multicanal`, `chatbot-db-schema-supabase` versión kit), 5 knowledge files (00 currículum + 03, 04, 07, 09), 4 templates JSON (TEST, TELEGRAM, YCLOUD, YCLOUD-AUDIO), `feedback-n8n-build.md` (14 errores reales + fix), snippet integrado a `CLAUDE.md` sección "Construcción de Workflows n8n", kit archivado como `.merged/`. **Fase 3 — fix con kit (SET3, 4, 5, 6):** SET3 clonó `dr-carlos/workflow.json` literal para Router + Switch + OpenAI Chat Model: typeVersion 1.2 IE, 1.3 LLM con `responseFormat: 'json_object'`, Switch sin `mode`, 4ta rule BACKUP con operator `notExists` (no `options.fallbackOutput`). 20/20 smoke tests. Push OK (`versionId 428c1109`). SET4: scan recursivo de referencias huérfanas a `$('Sofia C')` en parameters de otros nodos (3 referencias en `Capturar Contexto Para Extractor` + `Cerrar Trace de Turno`). Founder lo vio como error rojo y me lo señaló como **básico que ya hice yo previamente**. Push OK (`versionId db1016a8`). Test e2e: bot respondió pero seguía con `¿` apertura y puntos finales. SET5: agregué Code "Limpiar Puntuación" entre agentes y Formateador — **NO funcionó** porque el Formateador es LLM y regenera texto con `¿`/puntos finales. SET6 fix: moví el Code a DESPUÉS del Formateador (entre Formateador y Split Out), parsea `output.MENSAJE N` y limpia cada uno. Push OK (`versionId 7e45c6aa`). **Test e2e final PASS:** *"Hola! Gracias por escribir a Momentum / Contame, que te llevo a escribirnos hoy?"* — sin `¿`, sin punto final, suena natural. Founder: *"Ok, bien, ya va mejorando. Ya se ve bien."* **Commit + tag git `bot-c-v1-agente-principal-2026-06-06`** clavando el estado funcional. **3 patrones nuevos persistidos en `principios-desarrollo.md`:** (1) "Armar nodos N8N desde memoria en vez de clonar template validado" — la regla madre del kit: el template base se DUPLICA, NUNCA se construye de cero; antes de armar cualquier nodo, abrir uno del mismo tipo en `dr-carlos/` o `template-base/` y copiar literal; (2) "Renombrar nodo N8N sin reemplazar las referencias en expresiones de otros nodos" — toda función `renameNode()` debe recorrer recursivamente parameters de TODOS los nodos y reemplazar las 4 formas de refs; smoke test post-rename obligatorio: 0 refs al nombre viejo; (3) "Post-procesar antes del LLM regenerador (el LLM reescribe encima)" — cualquier post-procesamiento determinista debe ir DESPUÉS de TODOS los LLMs del pipeline; si hay Formateador LLM downstream del agente, el Code va entre Formateador y Split Out; las reglas duras del prompt son ESPERANZA, no garantía; para reglas hard, código determinista. **Documento reflexivo creado:** `memory/leccion-sesion-2026-06-06-deploy-router-limpiar-puntuacion.md` con 6 cagadas específicas + 6 patterns de recuperación + decisiones críticas + humor del founder. **Cierre por context bloat:** founder pidió migrar a sesión nueva con checkpoint + prompt de continuación. Stats: 6 pushes al N8N + 1 update bot_config en Supabase, 4 cagadas técnicas marcadas por el founder, 3 patrones nuevos en principios-desarrollo, 1 commit + 1 tag git nuevo, 1 documento reflexivo, kit N8N completo mergeado al proyecto (+5 skills +5 knowledge +4 templates JSON +1 memory +snippet CLAUDE.md), bot validado en e2e con saludo natural, próxima sesión continúa con tests de precio/objeción/handoff y configuración de Pérez Luna.

- **2026-06-05 (noche, sesión refactor profundo del bot Momentum + kit de prompting instalado):** Continuación tras el rollback de BOT-CTX-2 de la tarde. Sesión de ~6 horas con 3 fases distintas. **Fase 1 — sobreingenierización (descartada):** intento de refactor con sistema multi-agente complejo (Router + Principal + Objeciones + Formateador + BANT transversal + EACR + round-robin + feature flag + 11 nodos N8N + 6 archivos de spec ~170 KB). Inyecté 70 KB de prompt al `bot_config` de Momentum como "atajo seguro". El bot mandó mensajes con `¿` de apertura, sin saltos de línea, genéricos. **Founder frustrado con razón:** *"qué puta mierda estás haciendo... 80,000 caracteres es esa barbaridad, es esa estupidez."* Rollback inmediato. **Fase 2 — instalación del kit Momentum AI Chatbot Arquitect:** founder trajo kit completo de su otro proyecto (18+ proyectos validados) con metodología, skills, agentes, ejemplos de oro. Merge limpio siguiendo `INSTRUCCIONES-MERGE.md` paso a paso: 4 skills nuevas (`momentum-architect`, `momentum-prompt-gen`, `momentum-prompt-optimizer`, `n8n-langchain-prompts-rules`), 1 agente nuevo (`prompt-reviewer`), 5 archivos en `memory/` (`metodologia-core`, `feedback-prompting`, `learnings`, `client-patterns`, `prompting-decisions` renombrado para no chocar), carpeta nueva `knowledge/` completa con `workflows-reference/` (template-base + dr-carlos + el-canal), snippet integrado al `CLAUDE.md`. **Fase 3 — refactor con metodología validada:** founder marcó cambio de framing crítico vía 2 archivos nuevos (`Notas Andrés - SetterX (1).md` + `momentum-estrategia.html`): **Momentum se vende como servicio armado a medida, NO como SaaS técnico**. El bot es **setter** que agenda con Hans, NO consultor SaaS. Architecture v1.1 reescrito desde cero en `clients/momentum-ai-crm/architecture.md` (patrón Dr. Carlos adaptado + framework SetterX 4 etapas + pains de NEGOCIO no técnicos + handoff silencioso + ICP 01 amplio + catálogo 8 objeciones SetterX + reglas de precio NO decir default / rango solo si insisten). **5 prompts generados con `momentum-prompt-gen`, validados uno por uno por el founder:** router-classifier (7,113 chars), agente-principal Mateo (8,064), agente-objeciones (3,665), detector-descalificacion (2,606), formateador (2,089 canónico verbatim). Todos en `clients/momentum-ai-crm/prompts/`. Total 23,537 chars listos para deploy. **Decisiones técnicas confirmadas:** migrar de gpt-4o-mini → gpt-4.1-mini en agentes (Formateador queda en 4o-mini), Mateo como nombre del bot configurable per-agency (TODO panel admin), Calendly NO configurado (handoff puro), round-robin Hans/Pietro desactivado (equipo decide), NO precio exacto en chat, NO competencia técnica, NO casos de éxito, NO calculadora empleado vs bot, NO bonuses (todo reservado para la llamada con Hans). **5 patrones nuevos persistidos en `principios-desarrollo.md`:** (1) "sobreingenierizar al pedido concreto" — cuando el founder pide mejorar X, preguntar qué tiene de malo X, NO redibujar todo; (2) "no verificar modelo del LLM antes de diseñar prompt" — gpt-4o-mini con prompt grande olvida instrucciones (error fatal #1 del kit, validado en vivo); (3) "confundir cambio del `bot_config` con cambio del workflow completo" — cada nodo tiene su propio prompt hardcoded en el JSON, `bot_config` solo afecta al agente principal; (4) "improvisar el framing de venta desde conocimiento técnico" — el framing es responsabilidad del founder, buscar en `memory/` lo que él ya escribió antes de improvisar; (5) "atajo seguro no existe en producción" — si puede degradar la experiencia del usuario, NO es atajo, es riesgo. **Documento reflexivo creado:** `memory/leccion-sesion-2026-06-05-reframing-prompts-momentum.md` con qué cagué (6 cagadas específicas), qué hicimos bien (7 patrones de recuperación), 12 decisiones críticas, 10 aprendizajes de regla de oro futura. **Próxima sesión (2026-06-06 mañana):** deploy de los 5 prompts al workflow N8N `bot-c v1` con backup completo + tag git + script idempotente. Después test e2e: founder envía mensajes reales al WhatsApp +506 8983 9490. Si pasa → Pérez Luna configurado + Meta Ads ~2026-06-11. **Stats:** 0 cambios a producción (el bot N8N quedó intacto post-rollback de la tarde), 1 kit completo mergeado al proyecto (+4 skills +1 agente +5 archivos memory +1 carpeta knowledge), 5 prompts nuevos calibrados, 1 architecture v1.1, 5 patrones nuevos en principios-desarrollo, 1 documento reflexivo persistido.

- **2026-06-05 (sesión BOT-CTX-2 intentado + rollback + 2 lecciones técnicas nuevas):** Sesión doble fase. **Fase 1 — planificación + ideas (mañana):** 2 ideas capturadas en `memory/ideas-futuras/` (portal del cliente + ROI tracking del bot). Specs entregadas para Bloque 6 (6A multimedia + 6B templates + 6C notas timeline) + BOT-CTX-1 + BOT-CTX-2. **Fase 2 — intento BOT-CTX-2 (tarde):** pipeline completo ejecutado (spec → backend-builder → 2 pasadas code-review independiente → 5 fixes aplicados → PR #24 → cutover atómico) hasta que durante el cutover en producción se descubrió **bug arquitectónico fundamental** que NINGÚN code-review había detectado: el response del nodo Send Chunk via YCloud NO contiene el `wamid` de Meta, solo `body.id` interno de YCloud. El Reconciliar wamid extraía null → pre-registros quedaban huérfanos → cada respuesta del bot generaba 2 rows duplicados. **Rollback completo en ~10 min:** v1 reactivado, v2 eliminado, edge function rolled back a v1.1.1, 4 rows huérfanos borrados, 4 rows mid-cutover reclasificados a `bot`. **BOT-CTX-2 POSPUESTO indefinidamente** (bug original que pretendía resolver es cosmético, cero impacto operativo). **Cambios persistentes que NO se rollearon back:** Migration 0022 (`messages.sent_via`) sigue aplicada en prod (aditiva, backward compatible), `SUPABASE_ACCESS_TOKEN` agregado a `.env.local` (Claude ya puede deployar edge functions vía Management API sin acción founder, **capability nueva permanente**), snapshot v1 + tag git para referencia. **2 lecciones nuevas en `principios-desarrollo.md`:** (1) "Asumir formato de API externo sin verificar empíricamente" — code-reviews deben hacer POST real al endpoint antes de aprobar, NO confiar en docs ni memoria; (2) "API de N8N no genera webhookId al activar vía API" — build scripts para deploy automatizado deben generar y asignar UUID v4 manualmente al campo webhookId del nodo Webhook. **Directriz founder persistida:** *"hacéte cargo de las cosas, hacéte responsable, agilizá el trabajo y quitame estrés"* — cuando Claude tenga acceso API, ejecutar él mismo en vez de pedir clicks al founder. **Patrón observado del founder hoy:** maneja problemas técnicos con calma profesional, NO drama, delega autoridad técnica limpia (*"vos sos el experto, decidí qué es lo mejor"*). **Pendientes:** mover backup del 2026-06-04 a Drive (todavía), próxima sesión BOT-CTX-1 (chico, seguro, alto valor — cierra dolor real de ManyChat sin tocar workflow N8N estructuralmente), después Bloque 6A → 6B → 6C, después Meta Ads (~2026-06-11). **Stats:** 1 PR cerrado sin merge (#24), 1 branch en GitHub como referencia (`feat/bot-ctx-2-coexistence-sync`), 1 tag git nuevo, Migration 0022 aplicada, edge function v1.1.1 → 1.2.0 → 1.1.1 (rollback final), 0 PRs nuevos en main.
- **2026-06-04 (noche-tarde — Bloque 4 producción segura arrancado, OBS-1 + OBS-3 cerrados, 2 PRs más):** Tras checkpoint nocturno, founder pidió arrancar Bloque 4 ("démosle con 4, así cuando esté listo y empecemos a probarlo podemos ver qué está pasando"). Pre-Meta-Ads (~2026-06-11). **2 PRs mergeados:** PR #22 OBS-1 Dashboard `/master/salud` (5 bloques healthcheck con `Promise.allSettled` + cache por bloque + item nuevo sidebar master "Salud del sistema"; 3 env vars N8N nuevas; `.env.example` agregado al repo; cero migraciones cero cambios edge fns cero cambios N8N), PR #23 OBS-3 rate limit + backup (migration 0020 atómica con UPSERT + 0020a/b fixes de PG 42702 ambiguity + 0021 pg_cron cleanup nocturno; edge fn `ycloud-webhook` v1.0.0→1.1.0→1.1.1 con 2 fixes intermedios; threshold 30/h/número con drop silencioso 200 OK; fail-open con códigos PG 42883/42P01; script `backup-db.mjs` con pg_dump auto-detectado + runbook restore). **OBS-2 (alertas push) POSPUESTA hasta upgrade Vercel Pro** (Cron Jobs requieren plan Pro $20/mes; spec ya escrita queda lista). **OBS-4 (2FA) post-ads.** **Hallazgos críticos:** (1) PG 42702 "ambiguity" silenciosa en `RETURNS TABLE` — el smoke test aparentaba PASS (35 OK + 0 drops) pero la protección estaba rota por fail-open absorbiendo el error; detección sólo posible verificando DB post-test; fix definitivo = prefijar TODOS los OUT params con `out_*`; **regla operativa nueva:** con fail-open code, validar DB state no solo output del client. (2) Next 16 deprecó `unstable_cache` — híbrido `fetch options` + `unstable_cache` puente; `revalidateTag` cambió firma → usar `updateTag()` en server actions. (3) Supabase **free tier confirmado** (no Pro) — sin backup automático, sin PITR, sin branches; pivot a pg_dump standalone vía PostgreSQL CLI Tools 18.4 (~50MB instalado, solo "Command Line Tools"); primer backup oficial 0.49 MB. (4) **pg_cron HABILITADO en Supabase free** (sorpresa, descubierto al ver dump) — migration 0021 cleanup nocturno aplicada, `jobid=2` confirmado idempotente. (5) `npx supabase db dump` requería Docker (no instalado) → pivot a pg_dump directo. **Stats del día total 2026-06-04:** 13 PRs en main, 3 deploys edge fn, 4 migrations (0020/0020a/0020b/0021), 3 specs nuevas, 2 docs operativos, 2 scripts nuevos, Bloque 4 al 50%. Cliente cero listo para Meta Ads. **Pendientes founder:** mover primer backup a Drive + agendar ritual dominical.
- **2026-06-04 (noche, continuación — Bloque 2 cerrado al 100% con SET-1 + hotfix):** Sesión continuó después del checkpoint de la tarde. **2 PRs más mergeados:** PR #20 SET-1 (4 DTs: handoff gate, round-robin via RPC, note dedupe 4h, OOH dedupe 72h — edge function v0.5.0→v0.6.0 + workflow `bot-c v1` 84→87 nodos + UI flip SoonBadge→LiveBadge), PR #21 hotfix import duplicado LiveBadge (build error). **HALLAZGO CRÍTICO:** el workflow LIVE no es `bot-v6 v1` (está `active=false`) — es **`Chatbot Momentum - bot-c v1`** (id `Jsh4krhC9HRUh7Ly`, arquitectura C completa con F5 observabilidad ya en producción). Todo cambio futuro al N8N live debe apuntar a este workflow. El PUT del Bug A se aplicó al workflow equivocado, pero el smoke test PASS solo porque el `bot-c v1` ya tenía session key con agency_id desde su diseño original (bingo accidental, sin regresión). **CORRECCIÓN DEL BACKLOG:** Settings cliente-facing ya estaba ~90% hecho desde fases anteriores (F4 / 2026-05-30) — solo faltaban los SOON badges (cerrado en SET-1). El backlog §3.2 ahora debería marcarse ✅ COMPLETADO con notas de qué cubre. **Lección técnica para Claude:** NO usar `Edit replace_all: true` cuando el target puede existir en otros contextos del mismo archivo (como un import list) — causó el hotfix #21. **Stats finales del día:** 11 PRs en main, 2 edge function deploys (v0.5.0→v0.6.0), 2 workflows N8N actualizados, 3 tags git, Bloque 2 100% cerrado. Próxima fase: Bloque 4 (producción segura) o Bloque 6 (polish).
- **2026-06-04 (sesión Bloque 2 cerrado al 95% — 9 PRs):** Cerrados todos los items chicos y medianos del Bloque 2 detectados durante el dog-food + 1 fase grande nueva (P1.1 Roles). **9 PRs mergeados a main:** PR #12 ADM-4 Bloque B (cablear `is_active` real, master bypass, path explícito en N8N), #13 Bug B inbox stale on back nav (Next 16 RSC cache + `pageshow` + `router.refresh`), #14 Bug A session_key con `agency_id` (PUT + activate N8N + smoke PASS), #15 Gap C + Mejora E (crear cliente con WhatsApp + saas), #16 Mejora D editor `bot_config` auto-resize + mono, #17 Compliance T&C + Privacy + LegalFooter (SRL `3-102-953427`), #18 fixes QA compliance (layout + rutas públicas), **#19 P1.1 Roles real** (37 archivos, +2666 líneas; helpers `agency-roles`, `require-agency-access`, `require-agency-admin`; migration 0019 con `assign_round_robin` atómico + RLS granular sobre 10 tablas; edge `bot-actions` v0.5.0 con round-robin). **3 forks de producto P1.1 resueltos por founder:** B1 agent ve pool (sin asignar), B2 round-robin automático en handoff, B3 viewer ve métricas read-only. **F7 wake-up bot DESCARTADO** ("yo ni siquiera lo voy a utilizar"). **Edge function `ycloud-webhook` NO modificada** (defense-in-depth descartado por founder). **Migration 0019 + edge `bot-actions` v0.5.0 deployadas a prod por founder** vía Dashboard. **Único item grande pendiente del Bloque 2: Settings cliente-facing** (26-36h). Patrón operativo confirmado: Claude hace todos los merges + tiene acceso a tools de prod con creds del `.env.local`.
- **2026-06-03 (sesión maratón admin master + dog-food cliente cero):** **4 fases de admin master completadas y mergeadas a main en 2 días** (ADM-1 PR #6, ADM-2 PR #7, ADM-3 PR #8, ADM-4 PR #9). Cada fase = spec arquitecto → backend-builder + frontend-builder paralelo → QA founder localhost → commit → Vercel preview → merge. **Migrations aplicadas a prod:** 0017 (`agencies.industry`), 0018 (4 RPCs métricas + 1 índice). **2 fixes post-fase** detectados durante intento dog-food: PR #10 (modo `existing_user_added` para email registrado en `createAgencyWithOwner` + R3 levantado + hydration mismatch InfoTab por U+202F), PR #11 (botón "Eliminar cliente" mini-feature con doble confirmación tipando slug). **Dog-food cerrado:** Momentum AI CRM creado vía modal en prod → `agency_channels` migrado del demo → demo eliminado vía botón nuevo → `n8n_chat_histories` limpiada (16 mensajes fisio) → `bot_config` configurado con prompt estructurado (consultivo, derivar_humano, 8 pasos calificación, 6 reglas duras) → test e2e PASS (bot responde como asistente Momentum, no fisio). **DECISIONES ESTRATÉGICAS:** Momentum AI CRM = cliente cero (NO Robert) para ads de la próxima semana. Robert sale del fast track. PROP-1 (módulo propiedades) DIFERIDO hasta MVP base 100% pulido. Orden bloques del roadmap reordenado por founder: 2 (operativo) → 4 (producción segura) → 6 (polish) → 5 (bot avanzado). **5 bugs/gaps detectados durante dog-food al backlog Bloque 2:** (A) session_key N8N memory sin agency_id + manejo E.164 con `+`; (B) inbox stale on back navigation; (C) modal crear cliente no crea `agency_channels`; (D) editor bot_config no maneja estructuras complejas; (E) sumar 'saas' al enum industrias.
- **2026-06-01 (sesión maratón fix bot + UI + pivot admin):** **Bot arch C funcionando end-to-end** después de fix loop de 6 bugs: crypto runtime, trace_id propagation, schemaType Information Extractor, Catch orden, Merge `combineAll`→`append`, URL fallback. Tag `bot-c-v1-working-2026-06-01`. **ProvenancePopover** estilizado reemplaza tooltip nativo (React Portal, auto-flip, nunca "Tú" siempre nombre real). **4 skills cross-project Tier 6** capturadas y pusheadas al madre (`n8n-task-runner-no-crypto`, `n8n-trace-id-postgres-overwrite`, `n8n-merge-combineall-trap`, `n8n-information-extractor-schema-mode`). **PR #4 mergeado a main** → `momentum-ai-crm.vercel.app` (Vercel ya estaba conectado con auto-deploy) actualizado con todo F4+F5+F6+UI. **Telegram quitado del handoff** (bot-actions v0.4.1; founder pidió notif solo en plataforma + futuro WhatsApp directo). **A/B test postergado** (Robert va a generar data real). **PIVOT estratégico:** pausar bot + tags + objeciones. Foco nuevo: **sistema admin/multi-tenant**. `memory/roadmap-completo.md` escrito (5 pilares P0-P4, ~500 líneas). `memory/plan-sistema-admin.md` escrito (5 fases ADM-1 a ADM-5, ~430 líneas). Espera confirmación de 5 decisiones de diseño D1-D5 antes de arrancar Fase ADM-1.
- **2026-05-30 (tarde-2, versionado N8N):** Founder pidió manejo robusto de versiones del workflow N8N antes de empezar F5/F6. Auditoría reveló problema crítico: workflows JSON + build scripts vivían en el madre UNTRACKED — única fuente de verdad era el N8N vivo. Fix ejecutado en 1 sesión continua: (1) snapshot del LIVE vía `n8n-pull.mjs` → `crm-v2/n8n/workflows/snapshots/bot-v6-v1-LIVE-2026-05-30.json` (70 nodos, 126KB); (2) mudanza `n8n/` + `scripts/` del madre → `crm-v2/` (commit `ec663ed`, 29 archivos, 35k líneas); (3) scripts utility nuevos: `n8n-pull.mjs` + `n8n-push.mjs`; (4) doc `docs/operations/n8n-rollback.md`; (5) **2 tags git pusheados a GitHub**: `bot-v6-F4-completo-2026-05-30` y `bot-v6-pre-migracion-C-2026-05-30`; (6) skill formal `.agent/skills/n8n-workflow-versioning/SKILL.md`. **De aquí en adelante:** cada fase nueva = nuevo archivo `vN.json` (corregimos el anti-pattern de F2/F4 que sobreescribió `v1` in-place). PUT sin commit previo = prohibido. Tag obligatorio en cada deploy que activa fase nueva.
- **2026-05-30 (tarde, mesa arquitectónica):** Founder cuestionó la arquitectura del bot Sofia v6 (1 agente con 7 tools). Se ejecutó mesa multi-agente vía Workflow tool (21 agentes, 5.3 min, ~1.09M tokens) que evaluó 4 arquitecturas con 16 evaluaciones adversariales + síntesis. **Decisión: migrar a C (Híbrido determinista)** con 5 fixes obligatorios de reliability. A (status quo) queda como puente operativo durante la migración. B y D descartadas (race conditions + promesas rotas). Plan 12-15 jornadas, 3-4 semanas. **Reordenamiento del backlog:** F5 NUEVO = Foundation, F6 NUEVO = Build C, F7 NUEVO = Wake-up sobre C. Propiedades + few-shot se mueve a fase posterior. Documento auditable: `memory/research/14-mesa-arquitectura-sofia-v6.md`. Mañana también se aplicó fix bug n8n 1.121: tools renombradas a alfanumérico+underscore (`Note_Tool_bot_actions`, etc.).
- **2026-05-29 (noche-final, sesión maratón):** **TODO el cableado del bot CERRADO y DEPLOYADO** (F2 + F3 + F4 vivos). Edge functions: bot-actions v0.2.0 con 7 handlers reales (extractor, 5 auto-actions, handoff.escalate, conversation.pause_until) + ycloud-webhook v4 con atribución Meta. Workflow n8n: 70 nodos active. Migración 0014 lead_notes aplicada. **4 PRs en GitHub** (3 mergeados + #4 abierto F4). Bug crítico de timezone fixeado en next_business_start_iso. **Regla operativa nueva**: deploys de edge functions Supabase via multipart `POST /functions/deploy`, no JSON `POST /functions` (corrompe los primeros bytes del body). Token PAT regenerado desde la cuenta correcta + system-wide. Bot listo para test real con WhatsApp.
- **2026-05-29 (tarde-noche):** **F1 del cableado del bot TERMINADO al 100% construible** (§4). Pipeline architect→builder→reviewer ejecutado: workflow `bot-v6 v1` (id n8n `p3h7tx6UiGBQ9Tzb`) con base v2 limpia + Prompt Compositor en runtime; importado a n8n inactivo, credenciales preservadas. **Pivot del demo a fisioterapia high-ticket de Robert** validó la arquitectura del compositor (mismo núcleo agnóstico, swap `bot_config` = nuevo vertical). Migración 0012 confirmada YA aplicada. Corrección: Sofia v5.5 NO está en producción y NO es base v2 limpia (corregido §4). Falta solo go-live: pasos manuales del founder.
- **2026-05-29 (tarde):** **Panel Admin construido y verificado** (§3.1) — ítem solo-master + ruta blindada + editor del Asistente por negocio (`bot_config`, 5 secciones, flujo paso a paso, preview del compositor), persistencia round-trip OK. Cliente NO ve el prompt (ni read-only). El prompt salió de Configuración. Skill capturada: `crm-admin-panel-master-gated`. Queda pendiente que el bot LEA `bot_config` en runtime (§4).
- **2026-05-29:** Fase 2 outbound cerrada (delivered). **Contactos construido** (Pasadas 1 y 2 — §2). **Insights nivel Dios** = panel de inteligencia por contacto (§1.5). Prompt configurable por negocio entró al MVP (§3). Bot extractor agregado como el "boom" pendiente (§4). MCP de Supabase re-apuntado vía `.mcp.json` (pendiente env var del founder).
- **2026-05-28 (noche):** Creado. Auditoría completa post-reunión Pietro. Inbox ~90%; Contactos y Settings confirmados como stubs.
