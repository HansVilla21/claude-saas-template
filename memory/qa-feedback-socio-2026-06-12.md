# QA / Feedback del inbox — ronda socio (Pietro) — 2026-06-12

**Origen:** Hans pasó feedback de su socio navegando el CRM en localhost. 14 ítems. Clasificados por tipo + severidad + ubicación en código (donde ya la confirmé). Pendiente integrar al `backlog-mvp.md` tras priorizar con el founder.

**Leyenda severidad:** 🔴 rompe/pierde info · 🟡 molesta/confunde · 🟢 nice-to-have/cosmético · 🔵 decisión de UX (a discutir, no es bug)

---

## A. Tema de fondo: ASIGNACIÓN inconsistente (agrupa 4 ítems del socio)

Los ítems #1, #7, #9, #12 son el mismo problema de raíz: la asignación de la **conversación** y la del **contacto/lead** no están alineadas, y el filtro "míos" tiene semántica confusa.

- **A1 (#1) 🟡** — En la conversación sale "asignado a Hans" pero en Contactos el mismo aparece "sin asignar". → la asignación de `conversations` y la de `leads/contactos` salen de campos distintos o no se sincronizan. *Investigar: dónde vive la asignación (¿`conversations.assigned_user_id` vs lead?) y por qué las dos vistas leen distinto.*
- **A2 (#12) 🟡** — Contactos muestra "4 sin asignar" pero el filtro "míos" de Conversaciones muestra 2. Counts no cuadran entre las dos vistas (misma causa que A1).
- **A3 (#7) 🟡** — El filtro "Míos" muestra una conversación que tiene el **bot** (no debería). `conv-list.tsx` → `isMine`.
- **A4 (#9) 🔵 decisión** — Hans propone redefinir "Míos": hoy = `assigned_user_id == Hans`. Él quiere "Míos" = las que **tiene Hans ahora** (handler/assignee actual), no las históricamente asignadas. → definir la semántica antes de tocar el filtro.

> **Acción sugerida:** primero decidir el MODELO (A4: qué significa "mío" y dónde vive la asignación canónica), y con eso se arreglan A1/A2/A3 de un saque.

---

## B. Bugs claros

- **B1 (#14) 🔴 — Los audios del lead no se renderizan en el chat.** Confirmado: `message-bubble.tsx:154` solo maneja `msg.kind === 'image'`. No hay caso para `audio`/`voice` → el mensaje de voz del lead no se ve (se pierde info). *Verificar también que el webhook guarde el audio con `mediaUrl` + `kind='audio'`; el render es el primer gap.*
- **B2 (#10) 🟡 — El color del tiempo de respuesta está mal calibrado.** "8 min debería ser amarillo, sale anaranjado casi rojo". La banda se calcula en `response-time.ts:121` (`bandFor`: green ≤ greenMaxMin, yellow ≤ yellowMaxMin, else red). Causa probable: (a) los umbrales default (`settings.responseTime`) tienen `yellowMaxMin` muy bajo → 8 cae en rojo, o (b) el color visual de la banda `yellow` se ve demasiado anaranjado. *Revisar thresholds default + el token de color de `yellow`.*
- **B3 (#5) 🟡 — El botón de llamada abre FaceTime, no WhatsApp.** `chat-panel.tsx:328` (botón `<Phone>`). Usa un `href="tel:"` que en Mac abre FaceTime. **Nota técnica importante:** WhatsApp NO tiene deep-link para *iniciar una llamada* (no existe URL de llamada). Lo que SÍ se puede: abrir el chat de WhatsApp (`wa.me/<phone>`) o dejar `tel:` para llamada normal. → decidir con el founder: ¿abrir el chat de WhatsApp, o una llamada telefónica normal sin FaceTime?
- **B4 (#11) 🟡 — La selección de conversación no persiste al cambiar de pestaña.** Al ir a Contactos y volver a Conversaciones, siempre selecciona la primera. `inbox-client.tsx` (`selectedConv`). → persistir la conv seleccionada (URL param o estado/localStorage).

---

## C. Mejoras / features nuevas

- **C1 (#3) 🟡 — Cronómetro en vivo de respuesta del humano.** Cuando la conversación la tiene un humano, mostrar un cronómetro (arriba o al lado del composer) que cuente desde el **último mensaje del lead**, y que cambie a amarillo/rojo según los umbrales de `config` (los mismos de B2). Feature de presión de SLA en vivo.
- **C2 (#6) 🟡 — Acciones de conversación:** marcar como **no leída**, **borrar**, **archivar**. Hoy no existen.
- **C3 (#8) 🟡 — Cerrar conversación + filtro "Cerradas".** Poder cerrar una conv para limpiar el inbox, y un filtro para verlas. (Distinto de archivar; definir si es lo mismo o estados separados.)
- **C4 (#2 + #15) 🟡 — "Estados/Etapa" vacío Y el dropdown no despliega nada.** El selector de etapa muestra "Sin etapa" y al hacer click NO abre opciones. Falta (a) poblar/crear etapas (pipeline_stages vacío) y (b) que el dropdown funcione. *Relacionado con `pipeline_stages` vacío en la agencia.*
- **C6 (#16) 🟢 — Botón "ir al perfil del contacto" desde el panel de info del inbox.** En "Información del contacto" (lead-panel), un botón directo al perfil completo del contacto (`/a/[slug]/leads/[id]`).
- **C5 (#4) 🟢 — "menos de 1 min" → "- 1 min".** Cosmético. `response-time.ts:110` (`formatMinutes`): cambiar el literal `'menos de 1 min'` por `'- 1 min'` (o `'< 1 min'`).

---

## D. Decisiones de UX (a discutir, no son bugs)

- **D1 (#13) 🔵 — ¿Sobran los chips "Todos / Calificados / Sin asignar / Handoff"?** Hans siente que son redundantes con las tarjetas grandes de arriba (que ya filtran). → decidir si se quitan los chips, se quitan las tarjetas, o cada uno cumple un rol distinto.
- **D2 (#9)** — ya cubierto en A4 (semántica de "Míos").

---

## E. 🔴🔴 CRÍTICO — La extracción de inteligencia del chat no escribe nada (diagnóstico)

**Síntoma (socio):** no se cambia etapa, no se marca calificado, no se ponen etiquetas, el perfil no tiene datos extraídos, no hay resumen, no hay score, Insights vacío.

**Diagnóstico (con evidencia de ejecución real 425826):** la maquinaria de extracción YA EXISTE en el flujo del chatbot y CORRE bien. La cadena es: `Cargar Tags Permitidos` → `Construir Schema Extractor` → `Capturar Contexto Para Extractor` → `Information Extractor C` (LLM propio, separado del agente) → `Validar/Audit` → `Switch1 — extractor_data presente?` → cascada de writes (`extractor.write`, `qualify.set`, `stage.set`, `tag.add`, `assign.set`, `note.write`).

El `Information Extractor C` devolvió **TODO vacío** aunque el lead dijo "tengo una clínica dental":
```json
{ "captured_data": {}, "stage_change": "none", "qualified": "unknown",
  "tags_to_add": [], "should_assign": false, "note_to_write": "" }
```
Como sale vacío, `Switch1` corta y los HTTP writes **no corren** (diseño correcto: solo escribe si hay datos).

**Causa raíz:** el extractor es **config-driven por agencia**. `Construir Schema Extractor` arma `captured_data` SOLO con las propiedades de `agencies.bot_config.extractor_field_defs`, y el enum de `stage_change` con `pipeline_stages`. **Ambos están vacíos (`[]`) para la agencia de prueba.** Sin campos definidos, el extractor no tiene QUÉ capturar → `{}`. (Esto es exactamente el cartel "Aún no hay campos de inteligencia configurados para esta agencia".)

**Dos clases de gap distintas:**
- **Clase A — CONFIG vacía (no es un bug, falta llenar):** `extractor_field_defs` (campos de inteligencia), `pipeline_stages` (etapas → también explica C4: dropdown vacío que no despliega), tags relevantes. El sistema está construido y es modular; falta poblar la config Y verificar si existe UI para hacerlo (el Panel Admin podría no cubrir estas dos secciones).
- **Clase B — NO implementado en el flujo:** **score** (ningún nodo lo genera) y **bot_summary** continuo (solo aparece en `handoff.escalate`, no se genera por turno). Estos NO se arreglan con config — hay que decidir dónde generarlos.

**Respuesta a la pregunta arquitectónica del founder (flujo vs automatización aparte):** la extracción YA está en el flujo del chatbot, pero como **rama separada con su propio LLM** (`Information Extractor C`), corre DESPUÉS de que el agente responde, con `Catch Extractor Fail` para no tumbar el turno. O sea: el riesgo que el founder temía (que el chatbot "no extraiga por estar respondiendo") YA está mitigado por diseño — son nodos y modelos separados. Mover a una automatización TOTALMENTE aparte agregaría otro webhook + otra ejecución por mensaje + más costo, sin beneficio sobre el aislamiento que ya hay. **Recomendación: NO rehacer la arquitectura.**

**Plan recomendado:**
1. **Poblar la config de la agencia** (`extractor_field_defs` + `pipeline_stages` + tags). Verificar si el Panel Admin ya lo permite; si no, esa UI ES el activo de modularización (configurar cada cliente sin tocar N8N).
2. **Validar e2e:** con config poblada, mandar un mensaje con un dato claro y confirmar que `captured_data` se llena, `Switch1` pasa, y los writes escriben en `leads` (verificar con ejecución real).
3. **Decidir score + bot_summary** (Clase B): agregarlos como campos nuevos del `Information Extractor C`, o un paso aparte. Decisión de diseño.

> Esto conecta directo con el objetivo de replicabilidad: el sistema YA es modular/config-driven. Para un cliente nuevo = llenar `extractor_field_defs` + `pipeline_stages` + tags, y el extractor se adapta solo. El cuello de botella es la **UI de configuración**, no la arquitectura del bot.

**✅ VALIDADO e2e (2026-06-12, ejec 426580):** tras poblar la config de Momentum (6 etapas en `pipeline_stages` + 6 campos en `extractor_field_defs`), un mensaje real ("tengo una clínica dental, 200 msgs/día, los contesto yo solo, no uso sistema") produjo: `Information Extractor C` capturó 4/6 campos (los que se dijeron, sin inventar), `Switch1` pasó, `HTTP extractor.write` → `{ok:true}` y `HTTP stage.set` → etapa = "En conversación". Persistido en `extractor_field_values` (4 filas) + `leads.stage_id`. **Confirmado: era 100% config, el sistema funciona.**

**Estado tras validación:**
- ✅ Extracción de campos de inteligencia → FUNCIONA (con config poblada).
- ✅ Cambio de etapa automático → FUNCIONA.
- ⬜ **score** y **bot_summary** → siguen sin generarse (gap B, no implementado). Decisión de diseño pendiente.
- ⬜ **UI de configuración** de `extractor_field_defs` + `pipeline_stages` en el Panel Admin → a auditar/construir (es el activo de replicabilidad; hoy se pobló por SQL).
- ⬜ **qualified** y **tags** → la cadena funciona pero el extractor fue conservador (turno temprano). Validar en una conversación más avanzada.

## Resumen por severidad

| Sev | Ítems |
|---|---|
| 🔴 Rompe | B1 (audios no se ven) |
| 🟡 Molesta | A1, A2, A3, B2, B3, B4, C1, C2, C3, C4 |
| 🟢 Cosmético | C5 |
| 🔵 Decisión UX | A4/D2, D1 |

## Orden sugerido para atacar
1. **Decidir el modelo de asignación + semántica de "Míos"** (A4) → desbloquea A1/A2/A3.
2. **B1 audios** (es el único que pierde info del lead).
3. **B2 color + C5 texto** (mismo archivo `response-time.ts`, fix junto).
4. **B4 persistir selección** (UX rápida).
5. **B3 botón llamada** (tras decidir WhatsApp vs tel normal).
6. Features C1–C4 según prioridad de producto.
7. **D1** discutir el layout de filtros.
