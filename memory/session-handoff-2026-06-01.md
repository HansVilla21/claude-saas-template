# Session Handoff — 2026-06-01 (sesión maratón: madrugada bot-c-v1 + tarde UI + pivot admin)

> ⚠️ **HANDOFF HISTÓRICO — superado por `session-handoff-2026-06-03.md`**
> Este archivo se conserva como registro del estado al 2026-06-01 (pre-admin master). Para estado actual del proyecto (post-ADM-1/2/3/4 + Momentum AI CRM como cliente cero), leer el handoff nuevo primero.

**Propósito:** Snapshot completo del estado de **Momentum AI CRM** al 2026-06-01. Lectura obligatoria al inicio de cualquier sesión nueva.

**Reemplaza al handoff anterior** (`session-handoff-2026-05-29.md` queda como histórico).

Cargar también al arrancar:
- `memory/decisions.md` (entradas recientes 2026-05-30 y 2026-06-01).
- `memory/roadmap-completo.md` (visión total del proyecto — los 5 pilares).
- `memory/plan-sistema-admin.md` (plan inmediato — pivot al que vamos).
- `memory/backlog-mvp.md` (changelog actualizado).

---

## Resumen de la sesión

Sesión muy larga. Tres bloques de trabajo distintos:

### Bloque 1 — Fix loop bot-c-v1 (madrugada → mañana)

Continuación del debugging de la arquitectura C (Híbrido determinista) que se construyó el 2026-05-30. **6 bugs en cascada resueltos:**

1. **crypto runtime** (N8N 1.121 task-runner sin crypto global) → UUID v4 + djb2 manuales.
2. **trace_id propagation** (nodos Postgres pisan items) → leer con `$('Crear Trace de Turno')` directo en 6 Code Nodes.
3. **schemaType** del Information Extractor (`fromJson` con schema literal) → cambiado a `manual` + `inputSchema`.
4. **Catch Extractor Fail** orden del fix script → movido a 5b post-makeNewNodes.
5. **Merge mode** `combineAll` (cross-product muere con input vacío) → `append`.
6. **URL `$env.SUPABASE_V2_URL`** sin fallback → hardcoded fallback en expression.

**Resultado:** bot-c-v1 funcionando end-to-end. Validado con 3 turnos reales (`bot_turns` con `status='done'`, 4 tools por turno, extractor extrayendo datos coherentes).

Commit: `6ccaedd`, tag: `bot-c-v1-working-2026-06-01`.

### Bloque 2 — UI ProvenancePopover + Skills + Vercel

- **`ProvenancePopover`** estilizado reemplaza tooltip nativo del browser. React Portal a `document.body` para que flote sobre overflow del contenedor. Auto-flip top/bottom. Nombre real siempre (nunca "Tú"). Fecha relativa + absoluta. Commit: `9dc3963`.
- **4 skills cross-project Tier 6 capturadas** en `.agent/skills/`:
  - `n8n-task-runner-no-crypto`
  - `n8n-trace-id-postgres-overwrite`
  - `n8n-merge-combineall-trap`
  - `n8n-information-extractor-schema-mode`
  Cada una con causa raíz + fix + anti-patterns + caso real documentado. Pusheadas al madre `claude-saas-template` commit `4c9d783`. CLAUDE.md actualizado: 25 → 29 skills.
- **Vercel descubierto que YA estaba conectado al repo** con auto-deploy desde GitHub. Yo asumí mal y pedí token + decisiones; el founder me corrigió. Solo había que **mergear PR #4 a main** para llevar todo lo nuevo a producción.
- **PR #4 mergeado** (merge regular) con `gh pr merge 4 --merge`. Main avanzó `04206e3` → `1fabfad`. Vercel buildeó automático: `momentum-ai-crm.vercel.app` ahora sirve el código nuevo (ProvenancePopover, F4 settings, todo F5/F6).

### Bloque 3 — Pivot: pausar bot, diseñar sistema admin

Founder dijo claramente: pausar el chatbot, pulir tags/objeciones para después, **arrancar a construir el sistema admin/multi-tenant "de verdad"**. Quiere:

- Modo admin para él (master) → crear clientes desde UI, no SQL.
- Ver datos de cada cliente + métricas globales.
- Workflow del cliente → owner crea su equipo, gestiona roles.
- Dog-fooding: crear a Robert via la UI nueva, no manual.

**Acciones de esta sesión:**

- **Auditoría completa del estado actual** del admin (qué hay vs qué falta).
- **`memory/roadmap-completo.md`** escrito (~500 líneas, 5 pilares P0-P4, esfuerzo estimado, dependencias).
- **`memory/plan-sistema-admin.md`** escrito (~430 líneas, 10 secciones, 5 fases ADM-1 a ADM-5).

El plan espera **confirmación del founder** sobre 5 decisiones de diseño (D1-D5) antes de empezar a codear la Fase ADM-1.

---

## Estado del sistema al cierre

### Bot (N8N + Supabase)

| Componente | Estado |
|---|---|
| **`bot-c-v1`** (Híbrido determinista) | 🟢 ACTIVE en N8N (id `Jsh4krhC9HRUh7Ly`, 84 nodos, versionId latest). Respondiendo bien. |
| **`bot-v6-v2`** (LangChain Agent con 7 tools, arch A) | ⏸️ INACTIVE (rollback target intacto, md5 `638046ff6fcaddaeee4fbf539899be77`) |
| **`eval-harness-v1`** | ⏸️ INACTIVE. Tiene bug conocido: webhooks de workflows creados via API no se registran sin activación manual desde UI de N8N. |
| **`bot-actions` edge function** | 🟢 v0.4.1 deployed en Supabase (version 6). Sin Telegram. Healthcheck OK. |
| **Migraciones aplicadas** | hasta `0016_bot_clarifications_and_advisory.sql` (advisory locks, bot_clarification_events, status='partial') |
| **Tags git de bot** | `bot-v6-pre-migracion-C-2026-05-30`, `bot-v6-F4-completo-2026-05-30`, `bot-v6-F5-foundation-2026-05-30`, `bot-c-v1-deployed-2026-05-30`, `bot-c-v1-live-2026-05-30`, `bot-c-v1-working-2026-06-01` |

### Frontend (Next.js en Vercel)

| Componente | Estado |
|---|---|
| **Deploy producción** | 🟢 `https://momentum-ai-crm.vercel.app/` |
| **Branch deployed** | `main` (commit `1fabfad` = merge PR #4) |
| **Auto-deploy** | activo: cada push a main → build + deploy automático |
| **Preview de PRs** | activo: cada PR a main → preview URL automática |
| **Vercel team** | `hans-villalobos-projects-3deb221a` |
| **Cambios live tras merge** | ProvenancePopover + F4 settings cliente-facing + UI mejoras |

### Database (Supabase v2)

| Métrica | Valor |
|---|---|
| **Proyecto** | `fahujscodhqlopycorzn` ("CRM System" org) |
| **Tablas** | 34 |
| **Migraciones aplicadas** | 0001 → 0016 |
| **Conversaciones en agency demo** | 58 |
| **Last PAT regeneration** | el del system env quedó stale; el actual `sbp_6dda39c6...` está en `.env` del madre |

### Repos GitHub

| Repo | Branch principal | Estado |
|---|---|---|
| `claude-saas-template` (madre) | `main` | up-to-date con commit `4c9d783` (4 skills Tier 6 + CLAUDE.md actualizado) |
| `momentum-ai-crm` (producto) | `main` | up-to-date con merge PR #4 (commit `1fabfad`); branch `feat/f4-bot-schedule-auto-actions` mergeada pero conservada |

### Skills capturadas en `.agent/skills/`

29 skills totales. **Nuevos este sesión:**

- Tier 6 (N8N 1.121 gotchas, 4 skills capturadas 2026-06-01):
  - `n8n-task-runner-no-crypto`
  - `n8n-trace-id-postgres-overwrite`
  - `n8n-merge-combineall-trap`
  - `n8n-information-extractor-schema-mode`

---

## Decisiones tomadas en esta sesión

1. **bot-c-v1 = arquitectura productiva.** A queda como rollback. C funciona end-to-end.
2. **A/B test formal postergado.** Robert va a generar data real, no necesitamos golden set sintético. Si en el futuro queremos eval formal, hay un bug del webhook del harness que toca arreglar primero (activación manual desde UI).
3. **Telegram quitado del handoff.** Founder pidió: notificación SOLO en plataforma + futuro WhatsApp directo al user del CRM (no Telegram).
4. **No tocar más bot/tags/objeciones por ahora.** Pivot completo al sistema admin/multi-tenant.
5. **Plan admin lock-in propuesto (espera confirmación):**
   - D1: estructura `/master/*` separado.
   - D2: magic link Supabase Auth como auth primario.
   - D3: roles MVP = owner + agent (admin/viewer después).
   - D4: dog-fooding — crear Robert desde el modal de "Crear cliente" cuando esté listo.
   - D5: industrias en M3 = "Fisio", "Inmobiliaria", "Otra".
6. **No verificamos número WhatsApp de Robert.** Vamos a seguir con el `+50689839490` actual.
7. **Negocio Demo se mantiene** como sandbox del founder; Robert será una agency separada.

---

## Acuerdos vigentes con personas

- **Robert** (cliente fisio): bot_config + canal WhatsApp ya configurados en agency `Negocio Demo`. **NO es user del CRM todavía**. Lo será cuando construyamos el modal "Crear cliente" (Fase ADM-1) — dog-fooding.
- **Pietro:** no apareció en esta sesión. Acuerdos previos no cambian.
- **Jimena:** pendiente contactar para mostrar el sistema (mencionado en backlog, no urgente).

---

## Productos / activos del founder

| Producto | Estado |
|---|---|
| **CRM Momentum AI** | Live en Vercel. Bot arch C funcionando. Multi-tenant con RLS. Inbox + Contactos + Insights + Panel Admin (master-only por agency) ✓. **Sistema admin general (cross-agency) PENDIENTE.** |
| **Bot Sofia v6 arch C** | Live, conversación coherente, extractor estructurado, idempotency, audit log con trace_id |
| **Edge function bot-actions v0.4.1** | Live en Supabase con 9 operations + advisory lock |
| **Template `claude-saas-template`** | Repo en GitHub, 29 skills, agentes architect/builder/reviewer/orquestador funcionales |

---

## Pendientes operativos inmediatos

### Próxima sesión

1. **Founder confirma decisiones D1-D5 del plan admin** (`memory/plan-sistema-admin.md` §7). Si ok todas → arranco Fase ADM-1.
2. **Fase ADM-1** (1-2 días): vista master + crear cliente + dashboard básico.

### Esta semana

3. Fase ADM-2: detalle cliente + impersonación.
4. Fase ADM-3: gestión equipo del cliente (roles).
5. Fase ADM-4: métricas + polish.

### Diferidos (cuando hagan falta)

6. F7 wake-up automático del bot.
7. F6.2: tokens null + duration optimization.
8. Multimedia composer + templates.
9. Notificación WhatsApp directa cuando handoff (lo prometido).
10. Compliance básico (T&C, privacy policy) antes de cobrar a alguien.

---

## Gaps técnicos conocidos (documentar para no olvidar)

- **`tokens_in/out: null`** en `bot_turns` para arch C. El sub-input del LangChain Agent no es accesible desde Code Nodes via `$()`. Fix futuro: `returnIntermediateSteps: true` en el agent O capturar usage del modelo en sub-workflow.
- **`duration_s: 20-40s`** alto. Optimizable con prompt caching más efectivo + paralelización de HTTPs donde sea posible.
- **eval-harness-v1 bug:** webhooks de workflows creados via API no se registran. Solo se registran cuando el workflow se activa desde la UI de N8N manualmente.
- **`pg_cron` no instalado** en Supabase v2. El cleanup diario de `bot_action_dedupe` no corre. Tabla crecerá ~50MB/mes hasta arreglarse.
- **`SUPABASE_ACCESS_TOKEN` system env stale.** El actual `sbp_6dda39c6...` solo está en `.env` del madre, no en system env. Si una sesión nueva arranca y necesita Management API, va a fallar; tomar de `.env`.

---

## Cómo trabajar con Hans (cross-session reminders)

- **Hans NO usa slash commands.** Habla en lenguaje natural sobre lo que quiere lograr.
- **Modo orquestador:** detectar intención y enrutar a recursos sin pedirle escribir comandos.
- **Partner crítico, no yes-man:** decir cuando se equivoca con fundamento. Reconocer cuando hace algo bien que vos no sugeriste.
- **Capturar como skill cada proceso replicable:** regla del 3 + regla del "primera vez no trivial".
- **Fase de pruebas actual:** sin clientes reales, el bot puede pararse/activarse libremente sin canary. Cuando aparezca primer cliente real, invertir estas reglas (notificarlo explícito).
- **Calidad sobre velocidad, pero ir paso a paso.** El founder dijo varias veces "vamos poco a poco" — significa: no batchear demasiado entre confirmaciones, mostrar resultados intermedios.
- **No dar menús de opciones cuando ya sé la respuesta correcta.** Ejecutar directo; opciones solo para forks reales.
- **No sobrearquitecturar.** Si pide algo concreto, ejecutar. No derivar a rediseños sin pedirlo.

---

## Última actualización

**Fecha:** 2026-06-01 (cierre de sesión 2026-06-01)
**Sesión que actualizó:** maratón fix bot + UI + admin plan
**Próximo update sugerido:** después de cerrar Fase ADM-1 o si arranca decisión grande nueva
