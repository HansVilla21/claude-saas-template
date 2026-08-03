# Session Handoff — 2026-06-05 (noche) — Kit de prompting instalado + arquitectura Mateo v1.1 + 5 prompts listos para deploy

> ⚠️ **HANDOFF HISTÓRICO — superado por `session-handoff-2026-06-06.md`**
> Este archivo se conserva como registro del estado al cierre del 2026-06-05 noche (antes del deploy del Agente Principal al N8N + merge del kit N8N). Para estado actual, leer el handoff nuevo primero.

**Propósito:** Snapshot del estado del proyecto al cierre del 2026-06-05 noche. Lectura obligatoria al inicio de cualquier sesión nueva.

**Reemplaza al handoff anterior** (`session-handoff-2026-06-05.md` queda como histórico — describe el estado al cierre de la tarde, antes del refactor profundo del bot).

Cargar también:

- `memory/principios-desarrollo.md` ⭐ — **5 patrones nuevos críticos agregados esta sesión** (sobreingenierización, no verificar modelo LLM, bot_config vs workflow, framing de venta, atajo seguro no existe)
- `memory/decisions.md` (entrada gigante 2026-06-05 noche — refactor completo del bot)
- `memory/leccion-sesion-2026-06-05-reframing-prompts-momentum.md` ⭐ — **documento reflexivo** sobre qué cagamos, qué hicimos bien, aprendizajes
- `memory/metodologia-core.md` ⭐ NUEVO — fuente de verdad del kit de prompting (límites de chars, modelos LLM, anti-bot rules)
- `memory/feedback-prompting.md` ⭐ NUEVO — 6 correcciones ganadas en producción (puntuación humana, NO improvisar formateador, causa raíz vs parche)
- `memory/prompting-decisions.md` NUEVO — decisiones de prompting heredadas (Jacó, Dr. Carlos, El Canal, Level)
- `memory/learnings.md` + `memory/client-patterns.md` NUEVOS del kit
- `knowledge/` NUEVA — fuente completa del kit + `workflows-reference/` (template-base + dr-carlos + el-canal con prompts reales de oro)
- `clients/momentum-ai-crm/architecture.md` ⭐ — arquitectura v1.1 del bot
- `clients/momentum-ai-crm/prompts/` ⭐ — los 5 prompts listos (router, principal, objeciones, detector, formateador)

---

## Resumen ejecutivo de la sesión

Sesión densa de ~6 horas con 3 fases muy distintas:

**Fase 1 (descartada):** intento de refactor multi-agente sobreingenierizado. 70 KB de prompt inyectados al `bot_config` de Momentum. Bot mandó mensajes con `¿` de apertura, sin saltos de línea, genéricos. Founder se frustró con razón. Rollback.

**Fase 2 (recuperación):** founder trajo kit de prompting de su otro proyecto (Momentum AI Chatbot Arquitect, 18+ proyectos validados). Mergeado limpio al proyecto siguiendo `INSTRUCCIONES-MERGE.md` paso a paso.

**Fase 3 (refactor real):** procesado cambio de framing del founder (Momentum = servicio armado a medida, NO SaaS técnico) vía 2 archivos nuevos (Notas SetterX + estrategia GrowX). Arquitectura v1.1 reescrita desde cero. **5 prompts generados con `momentum-prompt-gen`, validados por el founder uno por uno.**

Cierre: 23:00 CR, sesión paused, deploy mañana con cabeza fresca.

---

## Estado del proyecto al 2026-06-05 noche

### Bot Momentum AI CRM

- **Workflow N8N en producción:** `Chatbot Momentum - bot-c v1` (id `Jsh4krhC9HRUh7Ly`) **intacto, sin cambios**
- **`bot_config` de Momentum:** rolled back al estado anterior a las 19:40 (rollback ejecutado durante la tarde)
- **5 prompts nuevos listos para deploy** en `clients/momentum-ai-crm/prompts/`:
  - `router-classifier.md` (7,113 chars, gpt-4.1-mini)
  - `agente-principal.md` (8,064 chars, gpt-4.1-mini)
  - `agente-objeciones.md` (3,665 chars, gpt-4.1-mini)
  - `detector-descalificacion.md` (2,606 chars, gpt-4.1-mini)
  - `formateador.md` (2,089 chars, gpt-4o-mini canónico verbatim)

### Carpetas nuevas en el proyecto

- `.claude/skills/momentum-architect/`, `momentum-prompt-gen/`, `momentum-prompt-optimizer/`, `n8n-langchain-prompts-rules/`
- `.claude/agents/prompt-reviewer.md`
- `memory/metodologia-core.md`, `feedback-prompting.md`, `learnings.md`, `client-patterns.md`, `prompting-decisions.md`
- `knowledge/` completa con 4 docs grandes + carpeta `workflows-reference/` (template-base + dr-carlos + el-canal)
- `clients/momentum-ai-crm/` con `architecture.md` v1.1 + `prompts/` con los 5 archivos

### Lo que queda en `memory/prompts-momentum/` (de Fase 1, sobreingenierizado)

Conservado como referencia histórica de "qué NO hacer". NO usar como input para el deploy real:

- `_addendum-bant.md`
- `_agente-principal-resuelto.md` (lo que se inyectó y rompió)
- `_backup-botconfig-momentum-2026-06-05_19h40.json` (rollback que YA se ejecutó, conservado para auditoría)
- `agente-principal.md`, `agente-objeciones.md`, `formateador.md`, `router-clasificador.md`, `variables-configurables.md`, `arquitectura-multiagente.md` (todos sobreingenierizados — el real está en `clients/momentum-ai-crm/`)

---

## Realidad financiera

Sin cambios desde el handoff anterior:

- 1 cliente pago activo: **Mueblería Pérez Luna** — $2,000 setup + $200/mes — en onboarding sin tráfico real
- Momentum AI CRM = cliente cero (donde estamos validando)
- Vercel Hobby (free), Supabase free
- Costo de la sesión de hoy en LLMs: ~0 (todo conversacional + lectura/escritura de archivos)
- Pre-Meta-Ads (~2026-06-11): 6 días restantes

---

## Marco mental activo

**Pre-Meta-Ads (~2026-06-11):**

- Foco en estabilidad operativa + bot que suene humano y agende llamadas
- Deploy del refactor de Mateo (5 prompts + 2 nodos nuevos al workflow) = tarea crítica de mañana
- Después del deploy: test e2e con founder mandando mensajes reales al WhatsApp del bot (+506 8983 9490)
- Si test pasa → Pérez Luna configurado aparte + Meta Ads

---

## Marco operativo del bot Mateo (validado y persistido)

**Framing:** Momentum se vende como SERVICIO armado a medida, NO SaaS técnico. El bot es SETTER que agenda llamadas con Hans, NO closer.

**Frase ancla literal** (la que el bot debe usar al educar):
> *"No te doy un software. Te entrevistamos, te construimos un chatbot que habla como vos, le ponemos todas las reglas que quieras, califica y filtra tus leads, los agenda con vos, y te lo montamos todo en un sistema que podes travesear con tu equipo."*

**Flujo:** Conexión → Detectar ineficiencia → Educar mínimo → Agendar (2 opciones cerradas) → cuando el lead responde con día/horario → handoff silencioso (bot apaga + notifica al equipo + END, NO manda "te paso con Hans").

**Reglas críticas:**
- NO precio exacto en chat (default). Rango solo si insisten 2-3 veces ($500-$1000 setup, $150-$200 mensualidad).
- NO mencionar ManyChat, Chatfuel, OpenAI, Soho, HubSpot, Zapier.
- NO casos de éxito ni nombres de clientes.
- NO calculadora empleado vs bot en chat (reservado para llamada con Hans).
- NO bonuses de la oferta en chat (reservados para llamada).
- NO cerrar venta por chat (solo agendar).
- Tono CR neutro-LATAM, sin "mae"/"che"/"diay"/"pura vida".
- Puntuación humana: sin punto final, sin `¿`, sin `:`, sin `;`, sin em-dash.
- Uso del nombre del lead máximo 1 cada 3-4 mensajes.

---

## Pipeline real al 2026-06-05 noche

| Lead | Estado | Notas |
|---|---|---|
| **Mueblería Pérez Luna** | Onboarding (cerrado 2026-06-03) | $2K setup + $200/mes. Sin tráfico real todavía. Configuración pendiente hasta validar el bot de Momentum primero. |
| **Momentum AI CRM** | Cliente cero | Refactor del bot listo para deploy mañana. Test e2e con founder. Si pasa → Meta Ads. |

---

## Productos / activos del founder

**En producción operando:**
- Momentum AI CRM en `momentum-ai-crm.vercel.app`
- Bot N8N `bot-c v1` (87 nodos, agente "Sofia C" actual — se renombra a "Mateo Principal" en el deploy de mañana)
- Edge functions Supabase: `bot-actions` v0.6.0, `ycloud-webhook` v1.1.1
- Dashboard `/master/salud` (OBS-1) con healthchecks
- Rate limiting webhook YCloud (OBS-3): 30 msj/h por número
- Pg_cron daily cleanup 3 AM UTC

**Pre-deploy en archivos listos (no en N8N todavía):**
- 5 prompts nuevos en `clients/momentum-ai-crm/prompts/` (Mateo)
- Architecture v1.1 en `clients/momentum-ai-crm/architecture.md`

**Specs listas para implementar después del deploy de Mateo:**
- BOT-CTX-1 (mirror humanos al history del bot)
- Bloque 6A multimedia composer
- Bloque 6B templates de respuesta
- Bloque 6C notas timeline + fix RLS
- OBS-2 alertas push (pendiente Vercel Pro)

---

## Pendientes operativos inmediatos

### Founder (esta semana)

1. **Mover el backup `crm-v2/backups/2026-06-05_04-51_momentum-full.dump` a Google Drive** (pendiente desde el 2026-06-04)
2. **Recibir inputs de Pérez Luna** para arrancar implementación
3. **Lanzar Meta Ads ~2026-06-11** con bot Mateo deployado y validado

### Próxima sesión (2026-06-06, mañana)

**Deploy del refactor del bot Mateo al workflow N8N.** Pasos:

1. Backup completo del workflow actual a `crm-v2/n8n/workflows/bot-c-v1-pre-mateo-2026-06-06.json`
2. Backup del `bot_config` actual de Momentum a `memory/prompts-momentum/_backup-botconfig-pre-mateo-2026-06-06.json`
3. Tag git `bot-c-v1-pre-mateo-2026-06-06` con la versión actual
4. Script de build idempotente que:
   - Cambia modelo de `gpt-4o-mini` a `gpt-4.1-mini` en 4 nodos LangChain (Router, Sofia C, Mateo Objeciones nuevo, Detector Descalificación nuevo)
   - Reemplaza system prompt del Router con `clients/momentum-ai-crm/prompts/router-classifier.md`
   - Reemplaza system prompt de "Sofia C" con `clients/momentum-ai-crm/prompts/agente-principal.md` + renombra el nodo a "Mateo Principal"
   - Reemplaza system prompt del "Formateador de Mensajes" con `clients/momentum-ai-crm/prompts/formateador.md` (canónico verbatim)
   - Suma nodo LangChain Agent nuevo "Mateo Objeciones" post-Switch rama OBJECIONES (con `clients/momentum-ai-crm/prompts/agente-objeciones.md`)
   - Suma nodo Information Extractor "Detector Descalificación" post-agente, paralelo (con `clients/momentum-ai-crm/prompts/detector-descalificacion.md`)
   - Configura Switch con 3 caminos (MATEO_PRINCIPAL / MATEO_OBJECIONES / HANDOFF_HUMANO) + backup → MATEO_PRINCIPAL
   - Implementa handoff silencioso: rama HANDOFF_HUMANO apaga bot (`conversations.bot_apagado = true`) + notifica equipo vía webhook interno + END (NO manda mensaje al lead)
5. Push del workflow vía API N8N REST (NO modificar JSON a mano)
6. Smoke test post-deploy: GET al webhook devuelve "registered" (no "not registered")
7. Test e2e: founder envía mensaje real al WhatsApp del bot (+506 8983 9490) desde su número personal. Validar:
   - Mateo se presenta natural (sin punto final, sin `¿`)
   - Detecta pain del lead
   - Aplica framework SetterX
   - Propone agendar con 2 opciones cerradas
   - Al responder "mañana" o un horario → handoff silencioso (bot deja de responder)
8. Si pasa el test → tag git `bot-mateo-v1-deployed-2026-06-06` + actualizar specs de Pérez Luna con la nueva arquitectura
9. Si NO pasa → rollback via `n8n-push` del workflow viejo backupeado

### Mes futuro (post-deploy de Mateo + Meta Ads)

- BOT-CTX-1 (mirror humanos al history)
- Bloque 6A multimedia composer
- Bloque 6B templates de respuesta
- Bloque 6C notas timeline + fix RLS
- OBS-2 alertas push (requiere Vercel Pro)
- TODO CRM: campo `assistant_name` configurable en panel admin per-agency

---

## Cómo trabajar con Hans (recordatorios reforzados esta sesión)

Reglas operativas confirmadas hoy en sangre y nuevas:

1. **Paso a paso, no de golpe.** El founder NO quiere que ejecute big-bang. Validar cada paso antes del siguiente.
2. **Si pedís "mejorar X", la respuesta es preguntar qué tiene de malo X, NO redibujar todo.**
3. **Validar el modelo del LLM ANTES de diseñar prompt.** Sin esto se cagan los prompts.
4. **El framing de venta es del founder, NO mío.** Buscar en `memory/` lo que ya escribió antes de improvisar.
5. **NO usar las palabras "atajo seguro" para tocar producción.** No existe.
6. **Cuando el founder se enoja, parar y escuchar.** No defender el trabajo previo.
7. **NO sobrearquitecturar.** Lo dijimos esta mañana en `feedback_no_overthink_architecture.md`. Lo violé hoy. Reaprendido.
8. **Disculparse sin victimizarse cuando hay error.** Reconocer errores ESPECÍFICOS, no genéricos.
9. **Mostrar métricas con cada prompt generado** (chars, llaves, em-dash, etc.). El founder valida con criterio técnico claro.
10. **El kit del founder (18+ proyectos validados) es la fuente de verdad.** Seguirlo en vez de inventar.
11. **Tono CR neutro del bot Mateo:** NO usar "mae", "che", "diay", "pura vida", "tío".

---

## Última actualización

**2026-06-05 (noche, ~23:00 CR)** — Sesión cerrada con 5 prompts del bot Mateo listos para deploy + kit de prompting instalado + 5 patrones nuevos persistidos en `principios-desarrollo.md`.

**Próximo update sugerido:** después del deploy de Mateo al workflow N8N en la próxima sesión (2026-06-06 mañana).
