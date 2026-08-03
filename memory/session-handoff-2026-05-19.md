# Session Handoff — 2026-05-19 (tarde-noche)

> ⚠️ **HANDOFF HISTÓRICO — superado por `session-handoff-2026-05-20.md`**
> Este archivo se conserva como registro del estado al 2026-05-19 23:30. Para estado actual, leer el handoff nuevo primero.

**Propósito:** Snapshot completo del estado de Casa CRM al cierre de la sesión del 19 de mayo 2026. Lectura obligatoria al inicio de cualquier sesión nueva.

Cargar también:
- `memory/decisions.md` (entradas del 2026-05-19, las más recientes)
- `memory/proyecto.md`
- `memory/stack.md`
- `memory/integraciones.md`
- `docs/ROADMAP.md` — idea del Asistente WhatsApp documentada
- `C:\Users\hvill\AppData\Local\Temp\` — scripts auxiliares de la sesión (update-n8n-*.js) — ya aplicados

---

## Estado del proyecto al 2026-05-19 23:30

**Fase:** Pre-MVP avanzado. Casa CRM tiene las 7 pantallas principales construidas, bot vendedor empático, auto-extracción de info del lead, multi-tenant funcionando, Realtime end-to-end. Founder está **preparando demos activamente**.

**Stack en producción:**
- Frontend: Next.js 16 + React 19 + TS + Tailwind 4 (corriendo en `localhost:3000`)
- Backend: Supabase (proyecto `ugkunpsohrimxetofawv`) con 15 migrations aplicadas
- Bot: N8N self-hosted en Easypanel + workflow `chatbot-inmobiliaria-demo-ycloud-sofia-v2-supabase`
- LLM: OpenAI (gpt-4.1 para agentes Sofia/Inventario/Objeciones, gpt-4.1-mini para Clasificador/Detector, gpt-4o-mini para Edge Functions de extracción)
- WhatsApp: YCloud (Coexistence) con número personal de Hans

---

## Lo que está LIVE en el sistema

### Pantallas (7 completas + 1 detail)
1. **Inbox** — conversaciones con Realtime broadcast, calificación BANT antes de inventario, flujo empático-vendedor, mensaje con saltos de línea + URLs linkificadas, unread persistente, filtro Míos corregido
2. **Leads** — lista + pipeline, búsqueda, filtros, embudo
3. **Lead detail** — con auto-extracción de info (interest, presupuesto, operación), tags, status auto-derivado, selects más grandes
4. **Properties** — catálogo + detalle con imagen real (no URL como texto)
5. **Dashboard** — 4 KPIs + embudo + próximas visitas + top properties + tareas + actividad reciente
6. **Tasks** — 4 KPIs + filtros + agrupación por urgencia + toggle complete optimistic
7. **Calendar** — vistas Día/Semana/Mes/Lista + modal Nuevo Evento + Realtime
8. **Settings** — 6 tabs (perfil, agencia, equipo, WhatsApp, bot, integraciones) con dropdown TZ de 25 zonas LATAM+US
9. **Reports** — selector de rango + KPIs con comparativa + embudo + leads por fuente

### Sistema-wide
- **AgencyProvider** + `useAgencyTz()` — TZ por agencia respetada en todas las pantallas
- **Topbar global**: búsqueda funcional (modal con 3 secciones), notificaciones reales (badge + dropdown), dropdown "+ Nuevo" con 4 opciones
- **Sidebar**: badges Inbox + Tareas leen de DB en vivo (no más hardcoded)
- **Realtime broadcast** en `agency:<uuid>` topic — todos los clients escuchan el mismo canal
- **Server actions** para mutaciones críticas (markConversationRead, createEvent, etc.)

### Bot N8N (workflow patcheado, requiere re-import al instance N8N corriendo)
- 3 agentes (Sofia/Inventario/Objeciones) con prompts: tono natural costarricense (sin `¿`, sin punto final), anti-alucinación, flujo empático-vendedor, BANT obligatorio
- Clasificador con regla inviolable: NO rutea a inventario sin ≥2 datos BANT
- Properties Tool v1.2 con near-match fallback
- Honra `agencies.bot_enabled` (kill-switch global)

### Edge Functions desplegadas
- `ycloud-webhook` v0.4.0 (verify_jwt=false, HMAC signature)
- `extract-lead-info` v0.4.0 (auto-extract + status derivation + reset detection)
- `properties-search` v1.2 (near-match fallback)

### Realtime
- Migration 0012 + 0013 con triggers `tg_broadcast_row()` en messages/conversations/leads/lead_tags/properties/tasks/events (todos AIUD)
- RLS policy `agency_members_read_broadcast` en `realtime.messages`

### Data seedeada (para demo)
- 17 leads (15 dummy + 2 reales) repartidos en todos los status del embudo
- 10 eventos (visitas + llamadas + reuniones + open house)
- 12 tareas (3 overdue + 3 hoy + 3 próximas + 3 completas)
- 16 propiedades (alquileres $850-$2200, ventas $180k-$1.25M)
- 1 agency (Momentum AI) + 1 user (Hans) + 1 WhatsApp number

---

## Pendientes inmediatos al cierre de sesión

### CRÍTICO antes de demo
1. **Re-importar workflow N8N** en la instance corriendo (Easypanel). El JSON local tiene los últimos cambios (BANT injection + bot_enabled check + tono natural + modelos gpt-4.1) pero el N8N corriendo aún tiene la versión anterior.
2. **Testear conversación completa end-to-end** con el workflow nuevo importado para verificar que el bot ya califica + vende empático + no alucina.

### PRIORIDAD media (para demo más sólida)
3. **Cargar más propiedades** al catálogo (solo hay 16, demo más realista con 30-40). Especialmente alquileres en distintos rangos.
4. **3 botones del dropdown "+ Nuevo"** (Lead, Propiedad, Tarea) hoy solo navegan a la pantalla. Si querés modales inline (como "Nuevo evento"), pendiente.
5. **Parser de `referral` de Meta** en `ycloud-webhook` para auto-detectar source=`instagram`|`facebook_ads` cuando el lead viene de un anuncio. ~1 hora.

### PRIORIDAD baja (no bloquea demo)
6. **Cargar catálogo `whatsapp_templates`** aprobados de Meta — solo necesario cuando se quiera mandar mensajes fuera de ventana 24h.
7. **Rotar API key de OpenAI** — fue pegada en chat al inicio, debe revocarse desde OpenAI Dashboard cuando ya no se necesite.

---

## Decisiones estratégicas tomadas hoy

| Decisión | Razón |
|---|---|
| Asistente WhatsApp para agentes = V2 | Buena idea, riesgo de mala interpretación + scope creep. Es feature de demo "compromiso futuro", no de implementación ahora |
| Bot consultivo y calificador (no agresivo) | Inmuebles es decisión grande, presión espanta tibios |
| TZ por agencia (no por usuario) | Estándar SaaS B2B, código más simple |
| Search global modal (no inline) | Patrón Linear/Notion/Vercel. Click → navega a detalle |
| Notificaciones derivadas (no tabla dedicada) | Simplicidad. Tabla solo cuando V2 pida historial |
| Bot global toggle como kill-switch | Preserva estado por-conv al reactivar. No degrada |

---

## Cómo trabajar con Hans (recordatorio)

- **NO slash commands explícitos.** Detectar intención y enrutar a agentes/skills/tools.
- **NO sobre-arquitectura.** Si pide algo concreto, ejecutar — no derivar a rediseños.
- **NO menús de opciones cuando ya sé la respuesta correcta.** Decidir y ejecutar.
- **SÍ usar agentes especializados del template** (frontend-builder, backend-builder, hormozi-strategist) cuando aplica.
- **SÍ confirmar URLs/endpoints literalmente** cuando hay >1 en el contexto.
- **SÍ tener criterio propio.** Si una idea del founder es mala o tiene riesgo, decirlo con razones — no validar por validar.
- **Realtime broadcast = pattern obligatorio.** `postgres_changes` está deprecado en este tenant Supabase.
- **Server actions con service_role** para UPDATE críticos — el path PostgREST normal falla silencioso.

---

## Sesiones paralelas activas

- **Casa CRM (este proyecto)** — sesión actual. Founder enfocado en demo.
- Otros proyectos del founder (Mi-Equipo, Academia IA) viven en `proyectos/` o paths separados del Documents/brain del founder. No tocados en esta sesión.

---

## Flag para Obsidian (cross-project)

Vale propagar al vault de Obsidian del founder lo siguiente:

1. **Idea del Asistente WhatsApp** — patrón aplicable a otros SaaS verticales del founder, no solo este. Va en `wiki/concepts/asistente-whatsapp-para-usuarios.md` con análisis transferible.
2. **Patrón de "near-match fallback en tool calls"** — anti-alucinación de LLM: cuando query estricta da 0 resultados, devolver lo más cercano con flag. Aplicable a cualquier sistema con LLM + tool + DB. Va en `wiki/concepts/llm-anti-alucinacion-near-match.md`.
3. **Patrón "BANT inyectado al agente, no $fromAI"** — los LLMs no extraen bien parámetros de la conversación sola. Es mejor pasarles el contexto estructurado en el system prompt. Va en `wiki/concepts/llm-tool-calling-bant-injection.md`.
4. **Decisión de TZ por agencia (no usuario)** — heurística para SaaS B2B en general. Va en `wiki/concepts/saas-multi-tenant-timezone.md`.

Estos cuatro NO se escribieron al vault automáticamente — se propagarían con `/obsidian-save-context` o manualmente cuando el founder los quiera curar.

---

## Última actualización

**2026-05-19 23:30 HAC** — checkpoint completo post-sesión preparación-demo. Próximo update sugerido: después de la primera demo con un prospecto real, para capturar feedback de mercado.
