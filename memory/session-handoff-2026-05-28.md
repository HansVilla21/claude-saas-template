> ⚠️ **HANDOFF HISTÓRICO — superado por `session-handoff-2026-05-29.md`**
> Se conserva como registro del estado al 2026-05-28 (noche). Para el estado actual, leer el handoff del 29 primero.

# Session Handoff — 2026-05-28 (noche)

**Propósito:** Snapshot del estado de **Momentum AI CRM** al cierre del 2026-05-28. Sesión maratónica: se completó el inbox "nivel Dios", se conectó **WhatsApp real en vivo al v2**, se cazó y documentó un bug de realtime, y se portó el bot n8n al schema v2. Lectura obligatoria al inicio de cualquier sesión nueva.

> Esta versión (noche) supera a la versión madrugada del mismo día (que cubría solo el shell del inbox + design system). El handoff del 27-may ya quedó histórico.

Cargar también:
- `memory/decisions.md` (entradas 2026-05-28 al tope: ejecución WhatsApp en vivo, arquitectura Bot v6, recorte MVP, backlog inbox, modelo de negocio)
- `docs/architecture/v2/04-bot-v6-conexion-whatsapp.md` (spec de la conexión + plan de fases)
- `.agent/skills/conexion-whatsapp-ycloud-supabase-n8n/SKILL.md` (runbook del montaje WhatsApp, reusable por cliente)
- `memory/n8n-changes/2026-05-29-port-sofia-v5.4-a-schema-v2.md` (+ `-review.md`) — el port del bot
- `memory/proyecto.md`, `memory/integraciones.md`, `memory/n8n-pipeline.md`

---

## Estado del proyecto hoy

**Momentum AI CRM** (plataforma conversacional modular multi-tenant, no SaaS masivo — servicio a la medida) tiene su MVP en marcha. Hoy el sistema pasó de "inbox construido" a **"WhatsApp real entrando en vivo al v2 + bot corriendo sobre la base nueva"**.

- **v2** (`crm-v2/`, Supabase `fahujscodhqlopycorzn`): es el sistema activo. Inbox "nivel Dios" completo. WhatsApp inbound en vivo. Bot n8n portado al schema v2.
- **v1** (`crm/`, Supabase `ugkunpsohrimxetofawv`): era el DEMO inmobiliario (Casa CRM). Se está migrando su conexión al v2. El número de WhatsApp (`50689839490`, personal de Hans para demos) y la cuenta YCloud se reusan.

## Lo construido / logrado en esta sesión

### Inbox "nivel Dios" (completo, verificado en browser)
- **Bloque 1:** terminología Lead→Contacto, tarjeta configurable tipo Notion (encargado bot/agente + contador de respuestas + props on/off con persistencia localStorage), Estado/Calificado separados con **procedencia bot/humano** (icono + tooltip), tiempos de respuesta con color + tab **Insights**.
- **Bloque 2:** búsqueda estilo WhatsApp (chats + mensajes), asignación automática de agente al responder, filtro por agente, + fix de consistencia ("Asignado a" = encargado de la conversación). Equipo demo sembrado (Hans owner + agente Valeria).
- **Bloque 3:** Asistente de IA en la cajita (sugerir respuesta / pedido personalizado), provider-agnóstico vía `.env` (`AI_API_KEY`/`AI_BASE_URL`/`AI_MODEL`). **Falta que el founder ponga la key** para que genere.
- **Pulido:** banner acortado, sidebar con "Pronto" (Agenda/Seguimientos/Tareas fuera del MVP), badges del header cliqueables (handler + etapa con sync header↔panel↔lista), link WhatsApp.

### Conexión WhatsApp en vivo (Fase 1 — EN VIVO)
- Migraciones aplicadas y verificadas: `0008` (realtime broadcast por-agency privado), `0009` (procedencia + `agencies.settings`), `0010` (`agency_channels` número→agency + pg_net), `0012` (`leads.bot_summary`).
- Edge Function `ycloud-webhook` portada al schema v2 y **desplegada al v2** (`verify_jwt:false`, secret seteado, health-check OK).
- Canal sembrado: `50689839490` → agency demo.
- El founder repuntó el endpoint 1 de YCloud al v2. **Un WhatsApp real entró al inbox del v2 y se vio en vivo.** ✅

### Fix de realtime (cazado + documentado)
- El handler de `leads` (`use-inbox-realtime.ts`) solo manejaba UPDATE → los **contactos nuevos no aparecían en vivo** (había que recargar). Fix: agregar el caso INSERT (espejo del v1). Verificado en vivo. Capturado en la skill `supabase-realtime-broadcast-pattern` (Gotcha #2) — esto era el "ya resuelto en v1 pero sin documentar".

### Bot n8n portado al schema v2 (vía pipeline)
- Workflow `Sofia v5.5` (id `yqSol7HvYrR9Pl1A`): pasó architect→builder→reviewer (PASS WITH WARNINGS). Queries remapeadas a v2, properties apagado, pusheado por API. El founder repuntó la credencial Postgres "CRM System" al v2 y se **reactivó** (active:true). Modelo: gpt-4.1-mini.

## Productos / activos al cierre

| Activo | Status |
|---|---|
| **Inbox v2 "nivel Dios"** | Completo, verificado. Falta entrega outbound (Fase 2) para que el agente responda al canal. |
| **Conexión WhatsApp v2** | Inbound EN VIVO. Outbound (agente) pendiente Fase 2. Bot (n8n) outbound sí funciona. |
| **Bot Sofia v5.5 (n8n)** | Portado al v2, activo. Gateado a `+50688217229` (test). Pendientes pre-leads-reales. |
| **Edge Functions v2** | `ycloud-webhook` desplegada. Faltan `deliver-outbound` (Fase 2) y `bot-actions` (Bot v6). |
| **Skills nuevas/actualizadas** | `conexion-whatsapp-ycloud-supabase-n8n` (nueva), `supabase-realtime-broadcast-pattern` (Gotcha #2). |
| **Oferta SmartCheck** | `outputs/offers/2026-05-28_smartcheck-upsell-momentum-crm.md` (lista, con `[a confirmar]`). |

## Pendientes operativos inmediatos (en orden)

1. **Fase 2 — entrega outbound** (el founder lo descubrió probando): el composer guarda el mensaje del agente pero NO lo manda a WhatsApp. Fix: trigger en `messages` → Edge Function `deliver-outbound` + composer a `status='queued'`. Diseñado en el spec 04. **Es lo próximo más valioso** (inbox bidireccional real). Las respuestas del BOT sí llegan (las manda n8n).
2. **Test del bot en vivo:** mandar WhatsApp desde `+50688217229` → confirmar que la ejecución n8n corre limpia contra v2 (revisar `/executions` por API).
3. **Follow-up del bot (pre-leads reales, vía pipeline n8n):** (a) `handoff_reason` siempre cae en `'qualified'` = recurrencia del bug del 20-may → mapear salidas del Detector a los enums; (b) quitar el gate `If1` (+50688217229); (c) módulo propiedades (el bot inmobiliario las menciona, no hay tabla en v2).
4. **AI key del inbox:** founder pone `AI_API_KEY`/`AI_BASE_URL`/`AI_MODEL` en `crm-v2/.env.local` (OpenAI o DeepSeek).
5. **Contactos (Leads) "nivel Dios":** la otra pantalla del MVP (tabla + kanban + ficha). Aún no construida.
6. **Async:** App Review de Meta (Messenger+Instagram); cambiar password temporal del master; pricing exacto; completar `[a confirmar]` de la oferta SmartCheck.

## Estado de la prueba en vivo (dónde quedó)

El founder está probando el inbox+bot en vivo (localhost:3000/a/demo/inbox). Va a ir listando hallazgos para arreglar/anotar. Primer hallazgo: la entrega outbound (Fase 2, ya en pendientes). Dev server: `cd crm-v2 && pnpm dev`. Login: hvillalobos98@gmail.com / Momentum2026!.

## Cómo trabajar con Hans

- Español, lenguaje natural, nunca slash commands.
- **Partner crítico, no yes-man** (`feedback_partner_critico_no_yesman`): decir cuando algo está mal con fundamento. Esta sesión funcionó bien flagear (el webhook único, el gap de `agency_channels`, el bug de realtime, las precondiciones del bot).
- **Delegar a especialistas** lo técnico grande (backend-builder para la edge function, el pipeline n8n para el workflow), hacer directo lo chico (migraciones focalizadas, fixes quirúrgicos).
- Secrets siempre vía `.env` del proyecto — el founder los pone, Claude no toca config global. Nunca escribir secretos a archivos/skills (usar placeholders).
- Verificar en browser antes de declarar terminado (Playwright). 0 errores de consola como gate.
- En `crm-v2`: Next 16 breaking changes (leer `node_modules/next/dist/docs/`).

## Retrospectiva (qué salió bien / qué mejorar)

**Qué salió bien:**
- **El v1 como referencia probada** aceleró todo (la edge function, el realtime, el bot) — reusar ~85% en vez de inventar.
- **systematic-debugging** cazó el bug de realtime por la causa raíz (diff v1 vs v2) en vez de parchar.
- **El pipeline n8n** (architect→builder→reviewer) atrapó issues pre-existentes (handoff_reason, gate If1) antes de que llegaran como sorpresa — justo su razón de ser.
- **Capturar procesos como skills en el momento** (la skill de conexión WhatsApp, el Gotcha #2 de realtime) — el founder lo valoró explícitamente ("esto no quedó documentado en el v1").
- Flaggear riesgos antes de actuar (webhook único, doble-proceso, deploy seguro inactivo).

**Qué mejorar:**
- **Documentar los fixes cuando se hacen, no después.** El bug de realtime ya se había resuelto en v1 y se perdió el cómo — costó re-debuggear. Regla reforzada: todo fix no-obvio → skill/decisión en el momento.
- Al portar de v1 a v2, los handlers/queries se "simplificaron" y se perdieron casos (leads INSERT). Lección: al portar, diff explícito contra el original que funciona, no reescribir de memoria.
- El schema v2 nació con gaps que el doc decía tener (`agency_channels` mencionada pero no creada; `webhook_events_raw` más pobre). Lección: validar el schema real contra el doc antes de construir encima.

## Última actualización

- Fecha: 2026-05-28, noche (~22:40). Sesión cerrada con checkpoint a pedido del founder.
- **Próximo paso inmediato:** Fase 2 (entrega outbound) para que el agente responda al canal desde el inbox; + test del bot en vivo desde +50688217229.
- Próximo update sugerido: al cerrar Fase 2 o tras la ronda de hallazgos de la prueba en vivo del founder.
