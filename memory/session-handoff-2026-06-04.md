# Session Handoff — 2026-06-04 (Bloque 2 cerrado al 100% — 11 PRs incl. SET-1 + hotfix)

> ⚠️ **HANDOFF HISTÓRICO — superado por `session-handoff-2026-06-05.md`**
> Este archivo se conserva como registro del estado al 2026-06-04 (noche-tarde). Para estado actual del proyecto, leer el handoff nuevo primero. Highlights del 2026-06-05: BOT-CTX-2 intentado + rollback completo + 2 lecciones operativas nuevas persistidas en `principios-desarrollo.md` + `SUPABASE_ACCESS_TOKEN` agregado al `.env.local` (Claude ya puede deployar edge functions vía API).

**Propósito:** Snapshot completo del estado de **Momentum AI CRM** al 2026-06-04 (noche). Lectura obligatoria al inicio de cualquier sesión nueva.

**Reemplaza al handoff anterior** (`session-handoff-2026-06-03.md` queda como histórico).

**Actualizado:** la sesión continuó después del checkpoint de la tarde — sección "Updates post-checkpoint (noche)" abajo cubre lo nuevo (PR #20 SET-1 + PR #21 hotfix + hallazgo crítico bot-c v1).

Cargar también al arrancar:

- `memory/rituales.md` ⭐ **NUEVO** — rituales recurrentes (backup semanal, etc.). Claude DEBE chequear el historial y recordar al founder si toca.
- `memory/decisions.md` (entrada 2026-06-04 noche-tarde gigante — Bloque 4 OBS-1 + OBS-3 + lecciones técnicas).
- `memory/plan-sistema-admin.md` (§5 actualizado con PRs #22 + #23 + stats Bloque 4).
- `memory/backlog-mvp.md` (changelog 2026-06-04 noche-tarde).
- `memory/spec-obs-1-salud-sistema.md`, `memory/spec-obs-2-alertas-push.md` (POSPUESTA), `memory/spec-obs-3-rate-limit-backup.md` (specs Bloque 4).
- `outputs/prompts/2026-06-03_bot-config-momentum-ai-crm.md` + `2026-06-03_momentum-bot-config-sql.sql` (prompt vivo del bot).

---

## Resumen de la sesión

Sesión de ~4-5h enfocada en cerrar el Bloque 2 (operativo, MVP pulido pre-ads). Empezó como continuación natural del checkpoint anterior; ejecutamos los items chicos detectados en dog-food + cerramos una fase grande (P1.1 Roles real).

### 9 PRs mergeados a main + 2 deploys producción

| PR | Item | Notas operativas |
|---|---|---|
| #12 | ADM-4 Bloque B — cablear `is_active` real | Spec arquitecto + builders. Owner suspendido → redirect a `/account-suspended`. Master impersonando bypassa. Bot N8N silenciado limpio (path explícito vs crash silencioso anterior). |
| #13 | Bug B — inbox stale on back navigation | Root cause sistemático con debugger: Next 16 RSC cache en back/forward nav (intencional sin opt-out). Fix: `pageshow` + `router.refresh()`. 3 líneas. |
| #14 | Bug A — session_key con `agency_id` | 1 línea en el workflow JSON N8N. PUT al N8N vivo + activate via curl POST. Tag git `bot-v6-v1-buga-2026-06-04` pusheado. **Smoke test PASS confirmado** en producción (filas 35-36 de `n8n_chat_histories` ya usan formato `<phone>@<uuid>`). |
| #15 | Gap C + Mejora E | Modal "Crear cliente" ahora INSERT a `agency_channels` automático. Schema zod E.164. Pre-check UNIQUE. Sumar `'saas'` al enum. |
| #16 | Mejora D | Editor `bot_config` con auto-resize y mono. El JSON completo de Momentum entra sin scroll interno. |
| #17 | Compliance T&C + Privacy + LegalFooter | 2 páginas públicas (13 + 11 secciones), texto legal real. Razón social SRL `3-102-953427`. Sin cookie banner. |
| #18 | Fixes QA del compliance | Layout footer + middleware (rutas `/terms`, `/privacy`, `/account-suspended` agregadas como públicas). |
| **#19** | **P1.1 Roles real** | **37 archivos, +2666/-624 líneas.** Migration 0019 (helpers SQL + `assign_round_robin` atómico + RLS granular sobre 10 tablas + columna `last_assigned_at`). Edge function `bot-actions` v0.5.0 con round-robin. |

### Decisiones del founder sobre 3 forks de producto P1.1

- **B1 — Agent ve sin asignar:** SÍ. Modelo "pool" donde cualquier agent ve conversations sin dueño y puede tomarlas.
- **B2 — Handoff sin asignar:** Round-robin automático (`assign_round_robin` rota entre miembros con rol ≥ agent, ordenado por `last_assigned_at ASC NULLS FIRST`).
- **B3 — Viewer ve métricas:** SÍ (su función es auditar).

### Decisiones de producto descartadas

- **F7 Wake-up automático del bot.** Cita literal: *"esto de wake-up automático es, digamos, algo extra que en realidad yo ni siquiera lo voy a utilizar"*. Cuando entre cliente externo grande, se reevalúa.
- **Edge function `ycloud-webhook` modificada para `is_active`.** Defense-in-depth descartado por bajo valor; el corte real vive en N8N.
- **Cookie consent banner.** Solo mención en Privacy; el banner agrega friction sin ROI mientras operemos LATAM/USA.

### Compliance — info nueva

- Razón social legal: **3-102-953427 Sociedad de Responsabilidad Limitada** (SRL costarricense con cédula jurídica).
- Jurisdicción para disputas: Costa Rica.
- Email legal/soporte/contacto: `hans@momentum-lab-ai.com`.

---

## Estado del founder hoy

Funcional/operativo. Sesión muy productiva, ritmo sostenido. El founder validó cambios visualmente y resolvió 3 forks de producto P1.1 sin titubear. **Sin reportes emocionales en esta sesión** — concentrado en ejecución.

Patrones operativos confirmados (escribirlos como guías permanentes):

- **Claude hace todos los merges.** Founder lo aclaró explícito: *"hacé todos esos merge vos, siempre los has hecho, no sé porqué me pedís a mí que lo haga"*.
- **Claude tiene acceso a tools de producción cuando hay credenciales en `.env.local`.** Founder me corrigió: *"vos tenés acceso, no sé qué falta por ahí"*. Aplicado: usé `scripts/n8n-push.mjs` + curl POST activate con `N8N_API_KEY`. Para Supabase MCP NO tengo permisos en mi cuenta — founder aplica migrations y deploya edge functions via Dashboard.
- **No menús cuando ya sé la respuesta.** Founder corrige cuando le doy opciones que no son fork real.

---

## Realidad financiera

No se discutió finanzas en esta sesión. Persiste lo del handoff anterior:

- Sin clientes pagando hoy. Pre-revenue.
- Robert era plan de validación pagado (diferido).
- Jimena (inmobiliaria) era propuesta caliente $499/$150 (diferida hasta PROP-1).
- Posible entrada nueva: si los ads de la próxima semana funcionan, podrían entrar 1-3 clientes pagando.

---

## Marco mental activo

**"Cliente cero antes que cliente externo."** Sigue vigente. El sistema tiene que estar pulido para que el bot/CRM funcione sin supervisión 24/7. Cada bug encontrado al usar el sistema con leads reales se convierte en fix prioritario.

**"MVP base 100% pulido antes de módulos personalizados."** Sigue vigente. La sesión de hoy lo demostró: cerramos 8 items chicos del MVP + 1 fase grande (Roles), NO agregamos features extra ni módulos por industria.

**"Bloque 2 al 95% — Settings cliente-facing es lo único grande que resta."** Si lo cerramos en próximas 1-2 sesiones, el Bloque 2 queda al 100% y pasamos a Bloque 4 (producción segura).

---

## Pipeline real al 2026-06-04

| Lead/Cliente | Estado | Notas |
|---|---|---|
| **Momentum AI CRM (interno)** | LIVE | Cliente cero. Bot configurado y respondiendo en producción. Espera ads próxima semana. |
| **Robert (fisio)** | DIFERIDO | Cliente 2-3, sin fecha de compromiso. |
| **Jimena Mateo (La Vivienda)** | DIFERIDA | Bloqueada por PROP-1 (módulo propiedades). |
| **Otros (Ads)** | POTENCIAL | Lanzamiento ~2026-06-08 → 2026-06-14. |

---

## Entregables / clientes activos

Hoy 0 entregables abiertos con clientes externos.

Internamente, el sistema en producción soporta:

- Sistema admin master completo (ADM-1 al ADM-4 con Bloque B real).
- Bot Sofia arch C funcionando con `bot_config` por agency.
- **Roles granulares** (owner / admin / agent / viewer) con RLS y UI gating.
- **Pool de conversations sin asignar** + round-robin automático en handoff.
- Compliance básico: T&C + Privacy + footer + email legal.
- Páginas públicas blindadas en middleware.
- Bot session_key con agency_id (memoria no se contamina entre tenants si se migra número).
- Crear cliente con número WhatsApp en 1 flujo (sin SQL manual).
- Inbox refresca on back/forward nav.
- Editor bot_config maneja estructuras complejas con auto-resize y mono.

---

## Acuerdos vigentes con personas

Sin cambios respecto al handoff anterior:

- **Pietro Sudsassi:** partner comercial. Vende, no codea.
- **Robert (fisio):** stand-by.
- **Jimena Mateo:** stand-by.

---

## Marketing / contenido en marcha

- **Campañas Meta Ads** se lanzan la próxima semana (~2026-06-08 al 2026-06-14) vendiendo Momentum AI CRM como servicio. Bot atiende.
- Sin contenido orgánico planeado esta semana.

---

## Productos / activos del founder

**Lo que existe y está desplegado:**

- **Momentum AI CRM (v2)** en producción: `momentum-ai-crm.vercel.app`. Multi-tenant. Next.js 16 + Supabase + Tailwind + sonner + zod.
- **Panel master completo (ADM-1/2/3/4A+B):** gestión cross-tenant, suspender/reactivar con corte real, métricas reales, impersonación, gestión equipo, dashboard con resumen, eliminar cliente.
- **Bot Sofia arch C (N8N):** workflow `bot-v6 v1` (id `p3h7tx6UiGBQ9Tzb`) activo. Versión actual deployada incluye fix Bug A (session_key con agency_id).
- **Edge function `bot-actions` v0.5.0:** maneja extractor, auto-actions, handoff con round-robin automático.
- **Compliance:** `/terms`, `/privacy`, `LegalFooter` en login y account-suspended.
- **Roles real:** RLS granular sobre 10 tablas + helpers + UI gating en todo el inbox/contactos/equipo.
- **CRM v1** (`crm/`): solo para demos visuales del módulo propiedades.
- **Supabase de v1** (project `ugkunpsohrimxetofawv`): se elimina cuando PROP-1 esté hecho.

**Lo que NO existe todavía:**

- Sistema de billing/Stripe.
- Signup público (los crea el master manual).
- Módulo propiedades en v2.
- Notificación handoff por WhatsApp/Telegram (solo plataforma).
- **Settings cliente-facing completo** (es el único item grande pendiente del Bloque 2 — 26-36h).

---

## Pendientes operativos inmediatos

### Próxima sesión (Bloque 2 al 100%)

**Settings cliente-facing completo (26-36h)** — único item grande pendiente del Bloque 2. Hoy es stub. Cliente externo lo necesita antes de pagar. Cabe en 3-4 sesiones largas o 1 sesión maratón.

Subitems aproximados (a confirmar en spec del arquitecto):

- Toggles de auto-acciones (auto-estado, auto-calificación, auto-asignación, auto-etiquetado, auto-notas) + master toggle "todos prendidos / apagados".
- Umbrales de tiempo de respuesta (verde/amarillo/rojo) configurables.
- Horario hábil + mensaje fuera de horario.
- Datos del negocio (nombre, rubro, etc.) editables desde el detalle.
- Canales conectados (vista UI para `agency_channels` — gap también mencionado en ADM-5).

### Esta semana (founder operativo)

1. **Configurar campañas Meta Ads** apuntando al número del business `+50689839490`.
2. Definir presupuesto diario + audiencias.
3. Vigilar primeros 10-20 leads que entren por el bot — ajustar prompt si calificación no calza.

### Próximas 2-3 semanas (post Settings)

- **Bloque 4** — producción segura: monitoring, alertas, security audit, backup.
- **Bloque 6** — polish: empty states, performance, multimedia composer, templates.
- **Bloque 5** — bot avanzado (cuando llegue feedback de leads reales).

### Después (mes 2+)

- Bloque 3 — SaaS self-service: signup público, onboarding wizard, billing Stripe.
- PROP-1 — módulo de propiedades en v2 (desbloquea Jimena).

### QA pendiente del founder (opcional, no bloqueante)

- Crear agency demo con 3 usuarios (1 owner, 1 agent, 1 viewer) y verificar gates funcionales en producción para roles reales.
- Test e2e: handoff sin asignar → round-robin asigna automático.

---

## Sesiones paralelas activas

Solo esta sesión está activa. No hay sesiones de Hans paralelas en otros chats.

---

## Cómo trabajar con Hans

- **No menús cuando ya sé la respuesta correcta.** Ejecutar directo.
- **Probar en localhost ANTES de commit.** Workflow git obligatorio: feature branch + PR + Vercel preview + merge a main.
- **Claude hace todos los merges.** Founder no debería tener que mergear manualmente.
- **Claude tiene acceso a tools de prod con creds del `.env.local`** (N8N, etc.). Para Supabase MCP no tengo permisos — el founder aplica migrations y deploya edge functions via Dashboard.
- **Capturar como skill cada proceso replicable.** Proactivo.
- **Partner crítico, no yes-man.** Decirle cuando se equivoca con fundamento.
- **Diseño diferenciador, no AI-slop.** Warm monochrome, sin gradients, sin shadow pesado.
- **Idioma:** código en inglés, comunicación en español rioplatense.
- **El founder hace dog-food real.** Crea/elimina agencies, configura desde la UI, no le pide a Claude que lo haga por chat cuando puede hacerlo él en producción.

---

---

## Updates post-checkpoint (noche 2026-06-04)

La sesión siguió después del checkpoint de la tarde. **2 PRs más + 1 hallazgo grande + 1 corrección de mi backlog desactualizado.**

### PR #20 — SET-1 cerrado

4 DTs implementadas (pipeline arquitecto → builder → reviewer PASS con 4 issues arreglados antes de deploy):

- **DT2-C handoff gate:** `handleHandoffEscalate` chequea `auto_actions.assign` antes de invocar `assign_round_robin` RPC. Si cliente apaga el toggle, handoff escala pero NO auto-asigna (queda sin dueño, admin manual).
- **DT2-D round-robin refactor:** `handleAssignSet` branch `round_robin` delega en RPC atómica (antes era manual e ignoraba `last_assigned_at`).
- **DT2-E note dedupe:** SELECT última nota últimas 4h, normaliza (lowercase + strip puntuación + collapse whitespace + trim), skip si duplicada. Fail-open si SELECT falla.
- **DT1-C OOH dedupe:** 3 nodos nuevos al workflow N8N entre `¿Fuera de Horario?` y `Send Out of Office via YCloud`. Ventana 72h. Si ya se mandó OOH al lead, skip y bypass directo a `Pausar Bot`.

**Deploys:**

- Edge function `bot-actions`: v0.5.0 → **v0.6.0** (founder vía Dashboard Code editor). Healthcheck confirmado.
- Workflow N8N `bot-c v1` (id `Jsh4krhC9HRUh7Ly`): 84 → 87 nodos, versionId nuevo `c79960f5-c47d-4e05-b9ca-b5e0c231b5c3`, `active=true` mantenido.
- Tag git nuevo: `bot-c-v1-set1-2026-06-05`.

UI flip `SoonBadge` → `LiveBadge` en `settings-client.tsx`. Los toggles "Auto-acciones del bot" y "Horario del bot" hoy realmente operan.

### PR #21 — Hotfix import duplicado

Yo usé `Edit replace_all: true` con `SoonBadge → LiveBadge`, pero el import ya tenía `LiveBadge` además del `SoonBadge` → import quedó duplicado. Turbopack tiró "the name LiveBadge is defined multiple times" rompiendo el build. 1 línea de fix.

**Lección técnica permanente:** NO usar `Edit replace_all: true` cuando el target puede existir en otros contextos del mismo archivo (como import list). Patrón correcto: targeted edits por línea.

### HALLAZGO CRÍTICO — el workflow LIVE NO es `bot-v6 v1`

Cuando arrancamos SET-1, yo asumí (basado en specs viejas + el archivo `chatbot-momentum-bot-v6-v1.json` del repo) que el live era `bot-v6 v1`. El founder me corrigió: *"el flujo n8n que está ahorita es el que ya tiene eso separado"*. Verifiqué via API de N8N:

| Workflow | id N8N | active | nodos | Estado |
|---|---|---|---|---|
| `Chatbot Momentum - bot-v6 v1` | `p3h7tx6UiGBQ9Tzb` | **false** | 70 | Inactive — referencia histórica |
| `Chatbot Momentum - bot-c v1` | **`Jsh4krhC9HRUh7Ly`** | **true** | 84→87 | **LIVE real** — arquitectura C completa con F5 |

**Implicación cross-project:**
- Todo cambio futuro al N8N live va al `bot-c v1` (id `Jsh4krhC9HRUh7Ly`).
- `chatbot-momentum-bot-v6-v1.json` y `chatbot-momentum-bot-v6-v2.json` del repo son referencia histórica.
- Source-of-truth real del live: `chatbot-momentum-bot-c-v1.json`.

**Implicación correctiva (sin regresión):** el PUT del Bug A (session_key con agency_id, fase de la tarde) lo apliqué al `bot-v6 v1` por error. El smoke test PASS solo porque el `bot-c v1` LIVE ya tenía session key con agency_id desde su diseño original (bingo accidental).

### F5 (Observabilidad) — confirmado en producción

Yo había marcado F5 como "WIP no testeado". **Falso:** F5 está en `bot-c v1` desde ~2026-05-30, operando con tráfico real. Los 5 nodos (`Crear Trace`, `Capturar Prompt Hash`, `Enriquecer Trace`, `Cerrar Trace`, `¿Eval Synthetic?`) funcionan.

### Settings cliente-facing — corrección de mi backlog desactualizado

Mi `backlog-mvp.md` decía que Settings era "stub ComingSoon". Esto era cierto al 2026-05-28 pero está obsoleto. Verificando el código real, **Settings cliente-facing ya estaba ~90% completo desde fases anteriores** (5 secciones funcionales: Datos del negocio, Horario hábil, Umbrales de respuesta, Auto-acciones del bot, Horario del bot). Solo faltaban los SOON → LIVE que cerró SET-1.

**Decisión derivada:** **Settings cliente-facing ✅ COMPLETADO**. No es item pendiente del Bloque 2 grande. La próxima fase debería ser Bloque 4 (producción segura) o Bloque 6 (polish).

### Patrones operativos consolidados de la sesión completa

- **Claude hace todos los merges.** Confirmado explícito + ejecutado consistente.
- **Claude tiene acceso a tools de prod con creds del `.env.local`** (N8N via scripts/n8n-push.mjs + curl POST activate).
- **Supabase MCP NO tiene permisos** desde la cuenta de Claude (`permission denied`). Founder deploya migrations y edge functions vía Dashboard (Code editor para edge fn, SQL Editor para migrations).
- **"No dejemos nada pendiente"** = aplicar TODOS los issues del reviewer (incluso medios), no solo críticos.
- **Founder verifica y corrige cuando algo no calza** (caso F5 / workflow live). Conviene VERIFICAR estado real (`n8n-pull.mjs`) antes de claims sobre prod.
- **NO usar `Edit replace_all: true`** cuando target puede existir en otros contextos del mismo archivo.

### Stats finales del día 2026-06-04

- **11 PRs mergeados:** #12 ADM-4B, #13 Bug B, #14 Bug A, #15 Gap C + Mejora E, #16 Mejora D, #17 Compliance, #18 fix layout/rutas, #19 P1.1 Roles, **#20 SET-1**, **#21 hotfix**.
- **1 migration nueva aplicada a prod:** 0019 (P1.1).
- **2 edge function deploys:** v0.5.0 (P1.1) y v0.6.0 (SET-1).
- **2 workflows N8N actualizados:** `bot-v6 v1` (Bug A, workflow incorrecto) y `bot-c v1` (SET-1, workflow correcto).
- **3 tags git nuevos:** `bot-v6-v1-buga-2026-06-04`, `bot-c-v1-set1-2026-06-05`.
- **Bloque 2 cerrado al 100%.**

### Próxima sesión

**No queda Bloque 2 grande pendiente.** Settings cliente-facing está cerrado. Las opciones reales para próxima sesión:

- **Bloque 4 — Producción segura:** monitoring + alertas + 2FA + backup. Importante pre-ads (si algo falla en prod la próxima semana, mejor tener alertas).
- **Bloque 6 — Polish:** empty states refinados, multimedia composer, templates de respuesta. Mejora UX cliente-facing.
- **Bloque 5 — Bot avanzado:** tools nuevas, few-shots por vertical. Mejor esperar a tener data de leads reales antes de tunear.

### Smoke test pendiente del founder (no bloqueante)

Cuando entren leads naturales o el founder tenga tiempo:

- [ ] OOH dedupe: 2 mensajes fuera de horario en <72h → solo 1 OOH enviado.
- [ ] Handoff con `auto_actions.assign=false`: escala pero queda sin asignar.
- [ ] Note dedupe: LLM extrae mismo contexto 2 veces → solo 1 nota.
- [ ] QA roles con 3 usuarios: owner / agent / viewer (de P1.1).

---

## Updates noche-tarde 2026-06-04 — Bloque 4 (producción segura) arrancado: OBS-1 + OBS-3 cerrados

Tras el checkpoint del 2026-06-04 noche, founder pidió arrancar Bloque 4: *"démosle con 4, así cuando esté listo y empecemos a probarlo podemos ver qué está pasando"*. Sesión densa de ~3h cubrió 2 sub-fases completas. Detalle gigante en `decisions.md` entrada 2026-06-04 (noche-tarde).

### PRs mergeados en esta sub-sesión

| PR | Sub-fase | Cambios |
|---|---|---|
| **#22** | OBS-1 Dashboard salud | Nueva ruta `/master/salud` gated por `requireMaster()`. 5 bloques (workflow N8N + últimos 50 turnos + edge fns + YCloud + counters 24h) con `Promise.allSettled` + cache por bloque (`unstable_cache` para Supabase, `fetch options` para externos). Botón "Refrescar" con `updateTag()`. Cero migraciones, cero cambios edge fns, cero cambios N8N. Item nuevo sidebar master "Salud del sistema" (icon Heartbeat). 3 env vars nuevas (N8N_HOST, N8N_API_KEY, N8N_BOT_WORKFLOW_ID). `.env.example` agregado al repo. |
| **#23** | OBS-3 Rate limit + backup | Migration 0020 (tablas + función atómica) + 0020a (fix DELETE insuficiente) + 0020b (fix definitivo OUT params `out_*`) + 0021 pg_cron cleanup. Edge fn `ycloud-webhook` v1.0.0 → 1.1.1 (con 2 fixes intermedios). Threshold 30/h/número, drop silencioso (200 OK + `processed: false`), fail-open con códigos PG 42883/42P01. Script `backup-db.mjs` con pg_dump auto-detectado (Windows + macOS) + runbook restore. |

### Hallazgos técnicos críticos

1. **PG 42702 "ambiguity" silenciosa** en `RETURNS TABLE` — el OUT param `bucket_start` chocaba con la columna del mismo nombre en `webhook_rate_limit_buckets`. Causó que el rate limit cayera en fail-open silencioso. **Smoke test aparentaba PASS (35 OK + 0 drops) pero la protección estaba rota.** Detección sólo posible verificando la DB post-test. Regla operativa nueva: con fail-open code, validar DB state, no solo el output del client. Fix definitivo: prefijar TODOS los OUT params con `out_*`.

2. **Next 16 deprecó `unstable_cache`** — solución híbrida: `fetch options` para externos, `unstable_cache` solo para Supabase queries con comentario de migrar a `'use cache'` cuando se adopte `cacheComponents`. Y `revalidateTag` cambió firma — usar `updateTag(tag)` (server-actions-only, immediate invalidation).

3. **Supabase free tier confirmado** — NO hay backup automático daily, NO PITR, NO branches. Runbook de backup nativo (escrito asumiendo Pro) queda como doc futuro. Decisión: pg_dump standalone (Opción 1) como puente hasta upgrade. Primer backup oficial: 0.49 MB.

4. **pg_cron HABILITADO en Supabase free** (sorpresa) — descubierto al ver el dump. Migration 0021 (cleanup nocturno opcional del rate limit) sí aplicable. Founder la aplicó. Verificación confirmó 1 sólo job activo (`jobid=2`, idempotencia funcionó tras 2 runs).

5. **`npx supabase db dump` requiere Docker** — pivot a pg_dump standalone (PostgreSQL CLI Tools instalado, ~50MB, solo "Command Line Tools" seleccionado). pg_dump 18.4 funciona contra Supabase PG 17.6 (retrocompat). Path: `C:\Program Files\PostgreSQL\18\bin\pg_dump.exe` (no en PATH, script auto-detecta).

### Decisiones operativas

- **OBS-2 (alertas push) POSPUESTA hasta Vercel Pro** — Vercel Cron requiere Pro ($20/mes). Spec ya escrita queda lista para retomar. OBS-3 reemplazó como prioridad pre-ads.
- **Backup: Opción 1 (pg_dump)** elegida sobre Opción 2 (Node-only data dump) y Opción 3 (esperar Pro).
- **OBS-4 (2FA opcional) post-ads** — no hay usuarios externos aún.

### Stats finales totales del día 2026-06-04

- **13 PRs en main** (#12-#23 — 11 del Bloque 2 + #22 OBS-1 + #23 OBS-3)
- **3 edge function deploys** (`ycloud-webhook` v1.0.0 → 1.1.0 → 1.1.1)
- **4 migrations aplicadas** (0020, 0020a, 0020b, 0021)
- **3 specs nuevas** + 2 docs operativos + 2 scripts nuevos
- **Bloque 4 al 50%** (OBS-1 ✅ + OBS-3 ✅; OBS-2 ⏸; OBS-4 ⏳)

### Pendientes operativos del founder (post-sesión)

1. **Esta semana:** mover `crm-v2/backups/2026-06-05_04-51_momentum-full.dump` a Google Drive / Dropbox
2. **Esta semana:** agendar recordatorio "Backup Momentum — domingos 9 PM" en calendar (corre `node crm-v2/scripts/backup-db.mjs`, mueve `.dump` al Drive)
3. **Próxima semana (~2026-06-11):** lanzar Meta Ads cuando todo esté listo
4. **Futuro:** OBS-4 (2FA), upgrade Vercel Pro → retomar OBS-2, upgrade Supabase Pro → deprecar script de backup

---

## Última actualización

**2026-06-04 (noche-tarde)** — Bloque 4 (producción segura) arrancado. OBS-1 (PR #22) + OBS-3 (PR #23) cerrados y en producción. OBS-2 pospuesta hasta Vercel Pro. Bloque 4 al 50%.

**Próximo update sugerido:** cuando founder lance Meta Ads (~2026-06-11) y entren primeros leads externos pagados — momento de verificar dashboard `/master/salud` con tráfico real y validar rate limit con tráfico legítimo.
