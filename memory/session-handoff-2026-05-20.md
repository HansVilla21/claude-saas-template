# Session Handoff — 2026-05-20 (todo el día)

> ⚠️ **HANDOFF HISTÓRICO — superado por `session-handoff-2026-05-21.md`**
> Este archivo se conserva como registro del estado al 2026-05-20. Para estado actual, leer el handoff nuevo primero.


**Propósito:** Snapshot completo del estado de Casa CRM al cierre de la sesión del 20 de mayo 2026. Lectura obligatoria al inicio de cualquier sesión nueva.

**Reemplaza al handoff anterior** (`session-handoff-2026-05-19.md` queda como histórico).

Cargar también:
- `memory/decisions.md` (entradas 2026-05-20, las más recientes)
- `memory/proyecto.md`
- `memory/stack.md`
- `memory/integraciones.md`
- `docs/ROADMAP.md` — idea del Asistente WhatsApp documentada

---

## Estado del proyecto al 2026-05-20 noche

**Fase:** Pre-MVP avanzado **dos avances grandes**. (1) CRM completamente **responsive** end-to-end (target tablet portrait) — listo para que el founder lo use desde iPad. (2) Sistema de **handoff cohesivo** end-to-end — el bot ahora le grita al agente por 4 canales cuando un lead está caliente, con tarea auto-generada como seguro.

**Stack en producción:**
- Frontend: Next.js 16 + React 19 + TS + Tailwind 4 (corriendo en `localhost:3000`, **responsive** ahora)
- Backend: Supabase (proyecto `ugkunpsohrimxetofawv`) con **16 migrations aplicadas** (la 0016 es de handoff)
- Edge Functions: `ycloud-webhook`, `extract-lead-info`, `properties-search`, **`request-handoff`** (nueva, deployada hoy)
- Bot: N8N self-hosted en Easypanel — workflow JSON local patcheado con handoff fix, **PENDIENTE re-import**
- LLM: OpenAI (gpt-4.1 agentes Sofia/Inventario/Objeciones, gpt-4.1-mini Clasificador/Detector, gpt-4o-mini Edge Functions)
- WhatsApp: YCloud (Coexistence) con número personal de Hans

---

## Lo que se construyó HOY

### 1. CRM Responsive completo (Fase 1-5, 5 frontend-builder agents en paralelo)

**Breakpoints:** 640 / 768 / 1024 / 1280 px. Target crítico = 768 (iPad portrait).

**Componentes globales nuevos/modificados:**
- `globals.css` — sistema responsive completo (12+ media queries). Sidebar drawer, topbar hamburger, page padding adaptativo, helpers `.only-*`/`.hide-*`/`.touch`/`.table-scroll`/`.m-modal`, fix iOS auto-zoom.
- `crm/src/components/layout-shell.tsx` — NUEVO. Owns drawer state, body lock, Esc close, viewport rotation.
- `crm/src/components/sidebar.tsx` — drawer mode con backdrop.
- `crm/src/components/topbar.tsx` — hamburger button + search-trigger compact.
- `crm/src/components/icons.tsx` — agregado `Icon.menu`.

**Por pantalla:**
- Inbox: vista única apilada (`view: 'list'|'chat'|'lead'`) en <1024px; 2 cols 1024-1279px; 3 cols ≥1280px.
- Leads: lista→cards mobile, pipeline scroll-snap, lead detail apilado.
- Properties: grid 1/2/3/4 cols, hero 60vh, lightbox full-screen nuevo, wizard sticky bottom nav.
- Tasks: KPIs 2x2→4 cols, FilterBar collapsable.
- Calendar: Mes con dots <768px, Semana scroll-snap, NewEventModal full-screen mobile.
- Dashboard/Reports/Settings: KPIs adaptativos, Settings breakpoint 760→1024px.
- Modales: NotificationsDropdown **bottom-sheet** <640px, GlobalSearchModal full-screen sheet, NewDropdown icon-only.

### 2. Sistema de Handoff cohesivo end-to-end

**DB (migration 0016 aplicada a prod):**
- 2 enums: `conversation_handoff_status (none|pending|handled)` + `conversation_handoff_reason (qualified|scheduling|objection_complex|bot_stuck|manual)`.
- 3 cols nuevas en `conversations`: `handoff_status`, `handoff_summary`, `handoff_task_id` (FK a tasks).
- Conversión de `handoff_reason` text→enum.
- Índice parcial `WHERE handoff_status='pending'`.
- 2 triggers: `tg_handoff_create_task` (al pasar a pending: crea task high/30min, handler='human', task linkeado) + `tg_handoff_mark_handled` (primer outbound del agente: handled + task in_progress).

**Edge function `request-handoff` v0.1.0:**
- Deployed status ACTIVE. `verify_jwt=false`, auth con `Authorization: Bearer <HANDOFF_INTERNAL_SECRET>`.
- POST body `{ conversation_id, reason, summary?, source? }`. Idempotente.

**UI (4 pantallas):**
- Inbox: pill ⚠️ animada en ConvList + filtro tab "Handoff" + banner naranja en ChatPanel con summary + reason + botón "Marcar atendido" + server action `markHandoffHandled`.
- Leads: badge ⚠️ en row/card/pipeline + chip filtro "Pendientes handoff" + banner detail con CTAs "Ir al Inbox" / "Ver tarea".
- NotificationsDropdown: sección sticky "⚠ Atención requerida" con prioridad sobre las otras 3 fuentes + bell pulse cuando hay pending.
- Tasks: badge 🤝 con reason + KPI dedicado "Handoffs" + chip filtro + sort overdue handoffs primero + link "Ver conversación".

**Workflow N8N (JSON local patcheado, PENDIENTE re-import):**
- Nodo "Apagar Chatbot — Conversation" ahora setea `handoff_status='pending'` + `handoff_summary` + CASE mapping LLM-tolerant para `handoff_reason`. Cero nodos nuevos. El path Telegram queda intacto.

**Tests verificados en prod (datos limpiados):**
- Trigger 1 (`tg_handoff_create_task`): task auto-creada, handler='human', task linkeado ✓
- Trigger 2 (`tg_handoff_mark_handled`): conv→handled + task→in_progress ✓

---

## Pendientes inmediatos al cierre de sesión

### CRÍTICO antes de demo (acciones manuales del founder)

1. **Setear `HANDOFF_INTERNAL_SECRET` en Supabase**:
   - Dashboard → Project → Edge Functions → Manage secrets
   - Valor: random largo (ej `openssl rand -hex 32` o cualquier UUID concatenado).
   - Sin esto, la edge function `request-handoff` no acepta calls.
2. **Re-importar workflow N8N en Easypanel**: el JSON `n8n/workflows/chatbot-inmobiliaria-demo-ycloud-sofia-v2-supabase.json` tiene el patch del handoff. Sin re-import, el handoff sigue funcionando viejo (no crea tarea automática).
3. **Verificar visualmente las pantallas responsive en browser** (375/768/1024/1280px): no pude validar con Playwright porque requiere auth. El typecheck pasa, los agentes reportaron éxito, pero la última milla la cierras vos.

### PRIORIDAD media

4. **Re-importar workflow N8N también para los cambios anteriores** (BANT injection + bot_enabled + tono natural + modelos gpt-4.1) — esto venía pendiente del handoff anterior 2026-05-19 y se acumula con el patch del handoff de hoy.
5. **Testear conversación end-to-end** con el workflow nuevo importado para verificar (a) el bot vende empático, (b) el handoff se dispara cuando corresponde, (c) la tarea aparece en el CRM, (d) la pill ⚠️ aparece en Inbox.
6. **Cargar más propiedades** al catálogo (16 actuales → 30-40 para demo más realista).
7. **Parser de `referral` de Meta** en `ycloud-webhook` para auto-detectar source=`instagram`|`facebook_ads`.

### PRIORIDAD baja

8. **Cargar catálogo `whatsapp_templates`** (solo cuando necesites ventana >24h).
9. **Rotar API key de OpenAI** — sigue pendiente del handoff anterior.

---

## Decisiones estratégicas tomadas hoy

| Decisión | Razón |
|---|---|
| Handoff apaga el bot definitivamente (no auto-resume después de 12h) | Founder lo aclaró: bot off hasta que el agente lo prenda manual desde el toggle |
| Handoff status enum (none\|pending\|handled) + reason enum (5 valores) | Vocabulario compartido entre N8N/edge function/UI; expandible |
| Auto-mark `handled` al primer outbound del agente | Un click menos. Botón explícito disponible por si querés override |
| Tarea auto: high/30min/followup/auto | 30 min = atención inmediata sin pánico. priority=high para que el badge sidebar la cuente |
| Razones V1 = qualified/scheduling/objection_complex | bot_stuck queda en enum pero sin heurística automática hasta V1.5 |
| Handoff es señal **ortogonal** al status del lead | No contamina el embudo de ventas. Es "atención requerida", no "estado del deal" |
| SQL CASE mapping en N8N (no cambio prompt Detector) | Minimiza riesgo. Si LLM devuelve algo raro, fallback a `qualified` |
| Sidebar drawer < 1024px (no icon-rail) | 224px en 768px = 29% pantalla, mata el contenido |
| Inbox vista única apilada en <1024px (no split view) | 3-col grid `320+1fr+320` no entra en <920px |
| NotificationsDropdown bottom-sheet en mobile | Patrón nativo iOS/Android, preserva lógica existente |

---

## Cómo trabajar con Hans (recordatorio)

- **NO slash commands explícitos.** Detectar intención y enrutar a agentes/skills/tools.
- **NO sobre-arquitectura.** Si pide algo concreto, ejecutar — no derivar a rediseños.
- **NO menús de opciones cuando ya sé la respuesta correcta.** Decidir y ejecutar.
- **SÍ usar agentes especializados del template** (frontend-builder, backend-builder, hormozi-strategist) cuando aplica. Hoy usé 5 frontend-builders en paralelo + 4 más para el handoff UI — funcionó.
- **SÍ confirmar URLs/endpoints literalmente** cuando hay >1 en el contexto.
- **SÍ tener criterio propio.** Si una idea del founder es mala o tiene riesgo, decirlo con razones — no validar por validar.
- **Hablar en lenguaje de founder, no de developer.** Si el founder pregunta "¿es buena idea?", responder en humano: problema → propuesta → costo/beneficio → recomendación clara. No tirarle 10 detalles técnicos al inicio.
- **Realtime broadcast = pattern obligatorio.** `postgres_changes` está deprecado en este tenant Supabase.
- **Server actions con service_role** para UPDATE críticos.
- **Para cambios al workflow N8N**: editar el JSON local + pedirle al founder que re-importe. Nunca asumir que el workflow corriendo está sincronizado con el JSON.
- **Migraciones DB**: escribir el SQL como archivo local primero, mostrárselo al founder en lenguaje simple, esperar OK antes de aplicar a prod.

---

## Sesiones paralelas activas

- **Casa CRM (este proyecto)** — sesión actual. Founder enfocado en demo + responsive + handoff.
- Otros proyectos del founder (Mi-Equipo, Academia IA) viven en `proyectos/` o paths separados. No tocados en esta sesión.

---

## Flag para Obsidian (cross-project)

Vale propagar al vault de Obsidian del founder lo siguiente:

1. **Patrón "Handoff con triggers Postgres"** — aplicable a otros SaaS B2B con chatbots. Diseño: enum handoff_status (none|pending|handled) ortogonal al status de negocio, trigger que crea task auto + flipea handler, trigger reverso que marca handled al primer outbound humano. Va en `wiki/concepts/handoff-bot-a-humano.md`.
2. **Patrón "DB trigger crea task + linkea via FK"** — útil para cualquier sistema con "atención requerida". El task linkeado vía `handoff_task_id` en el row origen permite deep-linking en UI. Va en `wiki/concepts/db-trigger-task-fk-linkback.md`.
3. **Patrón "Responsive shell con LayoutShell client + drawer"** — aplicable a cualquier SaaS multi-pantalla. Server-rendered layout pasa a `LayoutShell` client que owns drawer state. Sidebar pasa de sticky a drawer con CSS media query — no se duplica markup. Va en `wiki/concepts/responsive-shell-drawer-pattern.md`.
4. **Patrón "5 frontend-builders en paralelo con shared brief"** — workflow productivo: yo hago la fase 1 (foundation CSS+shell), dispacho N agentes con sus scopes específicos + las clases helper disponibles. Eficiente cuando los archivos no se solapan. Va en `wiki/concepts/dispatching-parallel-frontend-agents.md`.

Estos cuatro NO se escribieron al vault automáticamente — se propagarían con `/obsidian-save-context` o manualmente cuando el founder los quiera curar.

---

## Última actualización

**2026-05-20 noche** — checkpoint completo post-sesión responsive + handoff. Próximo update sugerido: después del re-import del workflow N8N + primera conversación real que dispare el handoff con la tarea apareciendo automáticamente.
