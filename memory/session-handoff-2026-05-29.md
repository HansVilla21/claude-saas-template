> ⚠️ **HANDOFF HISTÓRICO — superado por `session-handoff-2026-06-01.md`**
> Este archivo se conserva como registro del estado al 2026-05-29. Para estado actual, leer el handoff nuevo primero.

# Session Handoff — 2026-05-29 (sesión maratón: mañana + tarde-noche + noche-final)

**Propósito:** Snapshot del estado de **Momentum AI CRM** al 2026-05-29 (sesión que cruzó la medianoche).

**Resumen de la sesión maratón:**
- **(mañana)** cierre de outbound + Contactos "nivel Dios" + Insights por contacto + dirección estratégica del moat.
- **(tarde-noche)** Panel Admin + F1 del cableado del bot terminado al 100% (Prompt Compositor en runtime) + pivot estratégico del demo a fisioterapia high-ticket para Robert + workflow bot-v6 importado a n8n.
- **(noche-final, post-checkpoint anterior)** **F4 cerrada al 100%** + **deploys vivos** (bot-actions v0.2.0 + ycloud-webhook v4 + migración 0014) + **4 PRs en GitHub** (3 mergeados + #4 abierto F4). El bot ahora respeta todos los toggles + bot_schedule + handoff por tool.

**Lectura obligatoria al inicio de cualquier sesión nueva.**

**Reemplaza al handoff anterior** (`session-handoff-2026-05-28.md` queda como histórico).

Cargar también:
- `memory/backlog-mvp.md` — **registro vivo del MVP** (qué está hecho / pendiente, por área). Es la fuente de verdad del avance.
- `memory/decisions.md` (entradas 2026-05-29 al tope).
- `memory/proyecto.md`, `memory/stack.md`, `memory/integraciones.md`, `memory/n8n-pipeline.md`.
- `docs/architecture/v2/04-bot-v6-conexion-whatsapp.md` (spec del bot/conexión).

---

## Estado del proyecto hoy

**Momentum AI CRM** (plataforma conversacional modular multi-tenant, servicio a la medida — NO SaaS) tiene el MVP muy avanzado. Las **dos pantallas del MVP están construidas**: Conversaciones (inbox) ~90% y **Contactos "nivel Dios"** completo. WhatsApp entra y sale en vivo.

- **v2** (`crm-v2/`, Supabase `fahujscodhqlopycorzn`): sistema activo. Inbox + Contactos + ficha + panel de inteligencia. WhatsApp bidireccional en vivo. Bot n8n corriendo sobre v2.
- **v1** (`crm/`, Supabase `ugkunpsohrimxetofawv`): demo viejo; se usa solo como **referencia probada** al portar.
- **Proyecto huérfano:** `riznewvshyeqgeajniol` ("Jacó Dream Rentals") — sandbox v2 viejo, NO está en el camino real. El MCP de Supabase apuntaba ahí por error (ver pendientes).

## Lo construido / logrado en la sesión MAÑANA

1. **Fase 2 — entrega outbound CERRADA.** El composer del agente ahora entrega a WhatsApp (server action `sendMessageViaYCloud` portado del v1, reconciliación por `external_id`). Verificado: mensaje `delivered` al +50688217229.
2. **Contactos "nivel Dios" (Pasadas 1 y 2):** pantalla principal (tabla + **kanban arrastrable** + métricas + búsqueda + filtros + realtime + edición inline) y ficha dedicada `/leads/[id]` con 5 pestañas. CORE/agnóstico de nicho.
3. **Panel de inteligencia por contacto (Insights):** Bloque A (extraído por el bot, de `extractor_field_values`) + Bloque B (analítica calculada: tiempos, journey, recencia, patrón de actividad). Sembrados 7 campos core + datos de muestra para el demo.
4. **Backlog vivo** (`memory/backlog-mvp.md`) creado y mantenido como registro real.
5. **MCP de Supabase re-apuntado** vía `.mcp.json` project-local (pendiente paso del founder).
6. **Dashboard de Embudo + Atribución por campaña + Export CSV** (Resumen agency-home) — la mitad de aggregate de SmartCheck. Sobre data sembrada por ahora (45 leads, 4 campañas).
7. **Pulido del embudo** (Ganado/Perdido como "Resultado", no drop-off negativo).

## Lo construido / logrado en la sesión TARDE-NOCHE

8. **Panel Admin solo-master** (`/a/[slug]/admin`): sidebar item gateado por `isMaster` + ruta blindada server-side (`notFound()` a no-master). Editor por secciones de `agencies.bot_config` (identidad, tono, comportamiento de venta, **flujo paso a paso reordenable**, instrucciones) + **preview en vivo del prompt ensamblado**. El cliente NO ve el prompt (ni read-only — decisión del founder: read-only abre puerta a que lo rompa). Skill capturada: `crm-admin-panel-master-gated`. Verificado en browser.
9. **F1 del cableado del bot — TERMINADO AL 100%** (pipeline architect→builder→reviewer):
   - **Split del prompt de Sofia v5.5** en núcleo **agnóstico de nicho** (`bot_prompt_templates` core+rules, sembrados en v2) + capas configurables (`bot_config`).
   - **Base canónica = v5.5** (la port v5.4→v2db nunca se construyó; v5.5 es superset y tiene las tools cableadas).
   - **Workflow `Chatbot Momentum - bot-v6 v1`** construido: query maestra v2 + Code node `Componer System Prompt` que replica `composePreview()` + reemplaza el `systemMessage` hardcodeado.
   - **Handoff = Opción B:** `Request Handoff Tool` desconectada; handoff lo maneja `Detector → Apagar Chatbot — Conversation` (que sí pone `handler='human'`). La tool vuelve en F4.
   - **Reviewer: PASS con 2 warnings.** Security warning (secret v1 en nodo desconectado) **FIJADO** en el build script (neutralización de URLs). Warning de `handoff_reason` mapping → diferido a F4, documentado.
10. **PIVOT estratégico del demo: inmobiliario → fisioterapia high-ticket de Robert** (objetivo: agendar llamada). **Es la validación de toda la arquitectura del Compositor:** mismo núcleo agnóstico, solo cambió `bot_config` (tono consultivo, venta=mandar_link, 8 pasos para agendar llamada, **disclaimer médico + manejo de síntomas de alarma**). Verificado en el Panel — el bot ahora es el asistente de Robert.
11. **Migración 0012 (`leads.bot_summary`) confirmada YA aplicada en v2** (script `check-migration-0012.mjs`).
12. **Workflow importado a n8n vía API** (`POST /api/v1/workflows` con `N8N_API_KEY`): **id `p3h7tx6UiGBQ9Tzb`**, **inactivo**, credenciales preservadas. Compositor + agente verificados post-import.
13. **Regla operativa nueva** (en `decisions.md`): Claude puede importar workflows vía la API pública de n8n cuando hay `N8N_API_KEY`; siempre como inactivo; activación queda al founder.

## Lo construido en la sesión NOCHE-FINAL (cierre de F4 + deploys vivos)

14. **Token Supabase regenerado.** El PAT original pertenecía a la org "Grandir" sin acceso al proyecto v2. Founder regeneró desde la cuenta correcta ("CRM System" org `whhrcacyaedubzdjtbjc`); seteado system-wide vía PowerShell. Próximas sesiones lo heredan.
15. **Edge functions deployadas vía multipart.** Primer intento con `POST /functions` JSON corrompió los primeros 3 bytes del body (bug serio del API REST). Re-deploy correcto con `POST /functions/deploy` multipart. **Regla operativa nueva: siempre multipart para edge functions Supabase.**
16. **3 PRs mergeados a main:** PR #1 Settings cliente-facing, PR #2 F3 Atribución Meta, PR #3 F2 Extractor tool. Branches borradas. main consolidado.
17. **F4 cableado del bot — al 100%, deployada y viva.** Pipeline architect → builder → reviewer FAIL → fix loop → reviewer PASS. Lo que el bot puede hacer ahora:
    - Cambiar etapa, calificar, asignar, etiquetar, escribir nota (gateado por `settings.auto_actions.*`, procedencia `'bot'`).
    - Escalar a humano vía tool (`handoff.escalate`) — no solo por el Detector.
    - Respetar `bot_schedule.mode='office_hours'`: manda `out_of_office_message`, setea `bot_paused_until=próxima hora hábil`. Próximos mensajes del lead mueren en `Chatbot Activado?` (sin spam).
    - Bloque "## AUTO-ACCIONES PERMITIDAS" dinámico en el compositor + "## ETAPAS DEL PIPELINE".
18. **Bug crítico de timezone fixeado** en `next_business_start_iso`: la primera versión devolvía timestamps en el PASADO (loop infinito de spam OOO). Fix: `getTzOffsetMinutes` DST-aware. Verificado en 6 escenarios (CR, NY-DST, Hermosillo, viernes noche, sábado, lunes antes hábil).
19. **Migración 0014 aplicada en v2:** nueva tabla `lead_notes` con procedencia (`created_by_kind` bot|human). Reemplaza el patrón sobreescribible de `leads.notes`. Frontend de listado de notas queda pendiente para Settings Pass 2.
20. **Deploys en producción de pruebas:** bot-actions v3 (v0.2.0) ACTIVE con 7 handlers reales + ycloud-webhook v4 con captura referral Meta + workflow n8n actualizado (70 nodos, active).
21. **PR #4 abierto** (`feat/f4-bot-schedule-auto-actions`) — código ya deployado, merge a main es housekeeping.

## Gaps conocidos (no urgentes)

- **W1 reviewer F4:** handoff por tool NO manda Telegram (solo la ruta del Detector lo sigue haciendo). Decisión consciente para no agregar secret nuevo. Mejora futura.
- **`lead_notes` UI:** la tabla existe + el bot puede escribir, pero no hay listado en la ficha del contacto. Settings Pass 2.

## Lecciones para próximas sesiones (en decisions.md, vale propagar a Obsidian)

- Edge function deploy via API Supabase: SIEMPRE multipart `POST /functions/deploy`, NUNCA JSON `POST /functions`.
- Si Management API devuelve "necessary privileges": diagnosticar PRIMERO con `GET /v1/projects` + `/v1/organizations`. Puede ser token de cuenta equivocada (no scope incompleto).
- MCP cachea env vars al boot — para deploys urgentes sin restart, curl directo con token inline.

## Productos / activos al cierre

| Activo | Status |
|---|---|
| **Inbox v2 "nivel Dios"** | Completo. Inbound + outbound en vivo (delivered). |
| **Contactos v2 "nivel Dios"** | Completo (lista + kanban arrastrable + ficha 5 pestañas). Verificado. |
| **Panel de inteligencia (Insights)** | Construido. Datos SEMBRADOS para demo; los reales los llena el bot (pendiente). |
| **Bot Sofia v5.5 (n8n)** | NO está en producción (founder confirmó; el doc 04 lo dice desactualizado). Tiene refs v1 en 3 lugares — NO es base v2 limpia. La port v5.4→v2db nunca se construyó. |
| **Bot-v6 v1 (n8n) — F1+F2+F4 vivo** | **Activo en producción de pruebas** (id `p3h7tx6UiGBQ9Tzb`, 70 nodos). Compositor + Extractor Tool + 5 auto-actions tools + Handoff Tool reconectada + bot_schedule office_hours con wait silencioso. Credencial Postgres v2, BOT_ACTIONS_SECRET en env. |
| **bot-actions edge function** | v0.2.0 (v3 en Supabase), 7 handlers reales: extractor.write + 5 auto-actions + handoff.escalate + conversation.pause_until. Cross-tenant guards, toggle gating, procedencia bot, idempotencia. |
| **ycloud-webhook edge function** | v4 con captura de referral Meta (F3). |
| **Migraciones aplicadas en v2** | Hasta 0014 (lead_notes con procedencia bot/human). |
| **Panel Admin (solo master)** | En `/a/[slug]/admin`. Edita `bot_config` por secciones, preview en vivo. Cliente no lo ve. |
| **Settings cliente-facing** | En `/a/[slug]/settings`. 5 secciones (datos negocio, horario hábil "en vivo", umbrales "en vivo", auto-acciones, horario del bot). Cualquier member edita. |
| **bot_config del demo** | Sembrado con fisio high-ticket de Robert (consultivo, mandar_link, 8 pasos, disclaimer médico). **Link de Calendly de Robert sigue pendiente** (placeholder en custom_instructions). |
| **bot_prompt_templates** | Capas `core` + `system_rules` sembradas (agnósticas de nicho). Sirven a cualquier rubro. |
| **GitHub** | Repo `momentum-ai-crm` privado. Main consolidado con Settings + F3 + F2. PR #4 abierto con F4 (código ya deployado). |
| **Edge Functions v2** | `ycloud-webhook` desplegada. Outbound del agente = server action (no edge function). |
| **Infra de extracción** | `extractor_field_defs`/`_values`, `bot_prompt_templates`, `agencies.bot_config` ya migrados (moat medio construido a nivel datos). |

## Pendientes operativos inmediatos (en orden, al cierre de sesión maratón)

1. **Founder: probar el bot con WhatsApp real al número demo.** El sistema está 100% deployado:
   - Bot responde como asistente de fisio de Robert (compositor F1 vivo).
   - Si revelás un dato ("me duele la espalda hace 3 meses") → aparece en Insights del contacto (F2 extractor escribe `extractor_field_values`).
   - Si pedís humano / agendás → handoff_reason loguea correcto (F4 fix de mapeo + F4 tool handoff.escalate).
   - Si cambiás `bot_schedule.mode='office_hours'` en Settings y mandás fuera de horario → bot manda `out_of_office_message` UNA vez + silencio hasta hora hábil (sin spam).
   - Si activás auto-actions toggles desde Settings → bot puede cambiar etapa/calificar/asignar/etiquetar/notear por su cuenta.
2. **Founder: mergear PR #4** (F4 — no urgente, ya deployado en vivo igual).
3. **Founder: Vercel deploy** — importar el repo + setear 4 env vars + agregar dominio a Supabase Auth → URL pública para Pietro/demo. Sesión separada cuando quieras.
4. **Future — gap conocido W1 reviewer F4:** handoff por tool no manda Telegram (solo la ruta Detector lo hace). Mejora futura no urgente.
5. **Future — F5: módulo Propiedades + few-shot inmobiliario.** Recupera la fidelidad del demo inmobiliario que se pospuso en F1 (los 7 ejemplos calibrados + el árbol de 6 perfiles).
6. **Future — Settings Pass 2:** canales conectados (viewer + flujo self-service) + equipo/roles + **UI lead_notes** (la tabla existe, falta el listado en la ficha del contacto).
7. **AI key del composer (founder, sigue pendiente):** `AI_API_KEY`/`AI_BASE_URL`/`AI_MODEL` en `crm-v2/.env.local` + Vercel envs para que el botón "Sugerir respuesta" del composer funcione con LLM real.
8. **Doc correction:** `docs/architecture/v2/04-bot-v6-conexion-whatsapp.md` dice "Sofia v5.5 en producción" — actualizar (no urgente).
9. **Comercial:** escribirle a **Jimena** para demo + mostrar el sistema a Robert con el bot funcionando.

## Acuerdos vigentes con personas

- **Pietro** (socio): co-define producto. MVP = 2 pantallas nivel Dios. Insights = el diferenciador. Próximo: mostrar a clientes.
- **Robert/Roberto:** primer cliente objetivo; fee mensual referencia ~$100–150.
- **Jimena:** lead a contactar para demo.

## Cómo trabajar con Hans

- Español, lenguaje natural, nunca slash commands (salvo que él los escriba).
- **Partner crítico, no yes-man:** flaggear con fundamento (esta sesión: server action vs edge function, el MCP mal apuntado, "los datos del panel son sembrados, el bot real es lo que falta").
- **Delegar a especialistas** lo técnico grande (frontend-builder para Contactos/Insights, pipeline n8n para el bot), hacer directo lo chico (seeds, fixes).
- **Verificar en browser** antes de declarar terminado (0 errores de consola). Trust-but-verify a los subagentes.
- **Diff contra la fuente que funciona (v1)** al portar; **documentar fixes en el momento.**
- Secrets siempre vía `.env` del proyecto (el founder los pone); nunca tocar config global ni hardcodear tokens.
- En `crm-v2`: Next 16 breaking changes — leer `node_modules/next/dist/docs/`.
- **Capturar procesos replicables como skills** (`.agent/skills/`) cuando surjan.

## Última actualización

- Fecha: 2026-05-29, **noche-final** (~23:20, sesión maratón). Checkpoint a pedido del founder.
- **Estado real al cierre:** F1+F2+F3+F4 = TODOS deployados y vivos en proyecto v2. 4 PRs en GitHub (3 mergeados + #4 abierto, código deployado). Workflow n8n activo (70 nodos). Edge functions bot-actions v3 + ycloud-webhook v4. Migración hasta 0014. Bot listo para test real con WhatsApp.
- **Próximo paso sugerido:** founder prueba el bot mandando un WhatsApp real al número demo. El bot debe responder como asistente de fisio de Robert + extractar datos a Insights + manejar handoff correctamente. Si activa `bot_schedule.mode='office_hours'` desde Settings, también testear silencio fuera de horario.
- Próximo update: tras el test del founder con WhatsApp real (validación end-to-end del bot v6 completo) o al arrancar F5 (módulo Propiedades + few-shot inmobiliario).
