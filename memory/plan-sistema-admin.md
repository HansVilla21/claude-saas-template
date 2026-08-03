# Plan — Sistema Admin Multi-tenant

**Fecha:** 2026-06-01
**Trigger:** Pivot del founder. Pausar trabajo del bot. Construir sistema admin "de verdad" antes de seguir puliendo bot/tags/objeciones.

**Cita del founder:**
> "Ahorita, quiero trabajar con el sistema como tal, como ya construirlo, darle buena funcionalidad, que sea un sistema de alto nivel. Por ejemplo, para esto, el usuario Robert, quiero que creemos cómo hacer todo el workflow mío como admin, porque yo voy a ingresar en mi modo administrador. Lo ideal es que yo pueda crear esos usuarios desde alguna ventana o algo, no sé, como una versión admin para todo este manejo de usuarios y todo."

**Propósito:** Plan exhaustivo de qué pantallas, qué decisiones de diseño y qué orden de construcción, ANTES de empezar a codear.

---

## 1. Estado actual del lado admin

### Lo que YA existe

| Componente | Estado | Ubicación |
|---|---|---|
| Tabla `master_accounts` | ✅ aplicada | migration 0009 (probablemente) |
| Detección `isMaster` en sidebar | ✅ funciona | `src/components/agency/agency-shell.tsx` |
| Badge "Vista master" visible para masters | ✅ funciona | mismo sidebar |
| Ruta `/a/[slug]/admin` blindada server-side (notFound si no master) | ✅ funciona | `src/app/a/[slug]/admin/page.tsx` |
| Editor del Asistente por negocio (bot_config) | ✅ funciona | mismo path, `AdminClient` component |
| RLS multi-tenant por `agency_id` | ✅ funciona | migración 0006 + las que siguieron |
| Enum `agency_role` (owner/admin/agent/viewer) | ✅ existe | migration 0006 |
| Tabla `agency_memberships` | ✅ existe | con FK a `users` y `agencies` |

### Lo que NO existe

| Faltante | Implicancia |
|---|---|
| Vista "Todos mis clientes" (lista de agencies) | Hoy solo entrás a una agency específica con su slug; no hay overview |
| Crear cliente nuevo desde UI | Hoy hay que insertar SQL manualmente a `agencies` |
| Invitar/crear users desde UI | Idem; SQL manual |
| Gestionar miembros de UNA agency (lista + roles) | No hay tab "Equipo" en Settings |
| Cambiar rol de un user | No hay UI |
| Suspender/remover user | No hay UI |
| Panel del cliente para SU equipo | Settings cliente-facing es stub |
| Impersonar (ingresar como cliente para soporte) | No existe |
| Métricas agregadas por cliente para master | No hay dashboard master |
| Métricas globales (todos los clientes) | No hay |

---

## 2. Decisiones arquitectónicas a tomar (lock-in)

### D1 — Estructura de rutas para el master

**Opción A: Ruta separada para master.**
- `/master/clientes` → lista de todas las agencies.
- `/master/clientes/[slug]` → detalle de una agency.
- `/master/equipo` → otros masters (futuro).
- `/a/[slug]/...` queda como hoy: usuario normal navegando dentro de UNA agency.

**Opción B: Inyectar vistas master dentro del shell actual.**
- `/admin/clientes` (no anidado por slug).
- Mezclar master con flow de usuario común.

**Recomendación: Opción A.** Razón:
- Mental separation clara: si estás en `/master`, estás en modo administrador del SaaS. Si estás en `/a/<slug>`, estás "siendo un usuario de esa agency" (o impersonando).
- Más fácil de blindar (un middleware único que verifica master_accounts en todo `/master/*`).
- Para "impersonar cliente" → simplemente navegás a `/a/<slug>/inbox` (que hoy ya gate por `is_member_of`; agregamos override `is_master`).

### D2 — Cómo se crean los users del CRM (owner del cliente + agentes del cliente)

**Opción A: Magic link por email** (Supabase Auth `inviteUserByEmail`).
- El user recibe email con link mágico.
- Click → setea password + entra.
- Sin password de tu lado.

**Opción B: Email + password tradicional** (Supabase Auth con password generado).
- Vos seteás password inicial al crear el user.
- Le pasás credenciales por mensaje aparte.
- Más fricción para vos.

**Opción C: OAuth** (Google login).
- Más cómodo para el cliente.
- Requiere config OAuth en Supabase.

**Recomendación: Opción A (magic link) como primaria + Opción C (Google) como secundaria.** Razón:
- Magic link es lo más fricción-cero para el cliente.
- Robert escribe email → recibe link → entra. No password que olvidar.
- Google login es nice-to-have, no MVP.

### D3 — Cómo invita el owner del cliente a sus agentes

Misma D2 (magic link). El owner desde Settings → Equipo → "Invitar miembro" pone email + rol → Supabase manda invite → usuario click → entra con ese rol.

### D4 — Granularidad de roles (P1.1 del roadmap)

Hoy: enum existe pero RLS solo distingue "miembro vs no-miembro".

**Niveles propuestos para MVP corto plazo:**
- **owner**: control total de la agency. Puede crear users, editar bot_config, ver todo.
- **admin**: como owner pero NO puede transferir ownership ni borrar la agency.
- **agent**: ve solo sus conversaciones asignadas + las del bot. NO ve conversaciones de otros agentes. Puede mandar mensajes, intervenir.
- **viewer**: solo lectura. Ve todo pero no toca.

**MVP de roles:** solo owner + agent. admin y viewer se pueden agregar después.

**Implementación técnica:** RLS policies updates en `conversations`, `leads`, `messages` para gating por role.

### D5 — Reemplazo del "Negocio Demo"

El founder dijo "tener uno real en el que se pueda hacer todo el workflow".

**Propuesta:**
- **Mantener `Negocio Demo`** como sandbox del founder (para tests futuros, demos a prospects).
- **Crear `Robert Fisioterapia`** como agency real cuando ejecutemos el workflow completo de "Crear cliente" desde el admin (esto es DOG-FOODING: el founder usa la UI nueva para crear a Robert, así valida el flujo end-to-end).

### D6 — Impersonación

¿Puede el master entrar "como Robert" sin tener que loguearse con la cuenta de Robert?

**Propuesta:**
- Botón "Ingresar como este cliente" en `/master/clientes/[slug]`.
- Hace que `/a/[slug]/...` te deje pasar aunque NO seas miembro (porque sos master).
- Banner amarillo visible: "Estás viendo como Negocio X — modo soporte".
- Útil para debugging y soporte.

**Implementación:** chequeo `is_master()` SQL function existente como bypass de RLS.

---

## 3. Pantallas a construir (lista exhaustiva)

### Lado Master (vos)

#### M1. `/master` — Dashboard general
- **Contenido:**
  - Métricas globales: total agencies, total conversaciones del último mes, total leads, top 3 agencies por volumen.
  - Health checks: edge functions OK, workflow N8N active, último deploy.
- **Por qué:** primer pantallazo cuando entrás como master. Saber "todo bien" o "algo se rompió".

#### M2. `/master/clientes` — Lista de agencies
- **Contenido:**
  - Tabla con: nombre, slug, estado (active/suspended), # leads, # conversaciones, última actividad.
  - Botón "+ Crear cliente" (top right) → modal del flow M3.
  - Filtros: solo activos, suspended, por fecha de creación.
- **Acciones por fila:** Ver detalle, Impersonar, Suspender (toggle).

#### M3. Modal "+ Crear cliente"
- **Wizard 3 pasos:**
  1. **Datos del negocio:** nombre, slug (auto-sugerido de nombre), industria (fisio, inmobiliaria, otra), país/timezone.
  2. **Owner del cliente:** email, nombre completo. (Auto-asigna rol `owner` a este user en la agency creada.)
  3. **Bot config inicial:** plantilla por industria (fisio → tono empático; inmobiliaria → tono profesional; etc.). Pre-llena `bot_config` para que esté usable día 1.
- **Acción final:**
  - Crea agency.
  - Crea owner user (si no existe ya en `users`).
  - Crea `agency_memberships` con role=owner.
  - Manda magic link al owner via Supabase Auth.
  - Crea pipeline_stages default por industria.
  - Crea tags default por industria.
  - Crea extractor_field_defs default por industria.
  - Toast "Cliente creado. Invitación enviada a {email}."

#### M4. `/master/clientes/[slug]` — Detalle del cliente
- **Tabs:**
  - **Info**: datos generales editables (nombre, industria, timezone, settings.bot_schedule, etc.).
  - **Bot Config**: el editor que ya existe en `/a/[slug]/admin`.
  - **Métricas**: leads, conversaciones, top agentes, conversion rate, tiempo respuesta promedio.
  - **Usuarios**: lista de miembros de esta agency (igual que el cliente vería, pero accesible para vos también).
  - **Configuración avanzada**: pipeline_stages, tags, extractor_field_defs, agency_channels (números WhatsApp).
  - **Logs / Auditoría** (futuro): qué hicieron los users en los últimos N días.
- **Header:**
  - Nombre del cliente.
  - Estado (badge).
  - Botón "Ingresar como cliente" (impersonar).
  - Botón "Suspender / Reactivar".
  - Botón "Eliminar" (con confirmación + soft delete).

#### M5. `/master/usuarios-master` (futuro)
- Gestionar otros masters (cuando crezcas el equipo).
- Por ahora vos sos el único, no urgente.

### Lado Cliente (owner del cliente)

#### C1. `/a/[slug]/settings/equipo` — Gestión de miembros
- **Contenido:**
  - Lista de miembros: avatar, nombre, email, rol, último acceso.
  - Botón "+ Invitar miembro" → modal: email + rol seleccionable (owner / admin / agent / viewer).
  - Por fila: cambiar rol (dropdown), remover (confirm).
- **Quién puede acceder:** solo users con role `owner` o `admin` (otros ven 404).
- **Permisos:**
  - Owner: todo.
  - Admin: invitar agent/viewer, cambiar rol agent/viewer, NO puede tocar owner.
  - Agent/viewer: ni siquiera ven esta página.

#### C2. Modal "+ Invitar miembro"
- Email + dropdown de rol.
- Acción: Supabase Auth `inviteUserByEmail` con metadata `agency_id` y `role`.
- Cuando el invitee click el link, un trigger DB crea automáticamente el `agency_memberships` con el rol.

### Decisiones diferidas (NO MVP)

| Item | Por qué diferimos |
|---|---|
| Suspender user individual | Owner puede cambiar a `viewer` para read-only. Suspend full puede esperar. |
| Transferir ownership | Caso edge. Cuando aparezca el cliente que lo pida. |
| Audit log visible por user | Tabla `audit_log` existe pero no se llena. Llenarla + UI puede esperar. |
| Múltiples agencies por user | Hoy 1 user = 1 agency_membership por agency. Algunos users podrían ser miembros de varias (futuro). |

---

## 4. Trabajo backend que habilita lo anterior

### B1. Migración nueva — `0017_admin_master_helpers.sql`

- **Función `is_master_safe()`** que devuelve true/false (helper para usar en RLS sin recursión).
- **RLS policy bypass** para masters en `agencies`, `users`, `agency_memberships` (que vos podás ver todo desde `/master/*`).
- **Trigger en `auth.users` after insert** que si el user fue invitado con metadata `{agency_id, role}`, crea automáticamente el `agency_memberships` row.
- **Función `create_agency_with_owner(name, slug, owner_email, ...)`** server-side que hace todo en transacción atómica.

### B2. Server actions Next.js

- `src/lib/master/actions.ts`:
  - `createAgencyWithOwner(formData)` → llama función SQL anterior + manda magic link.
  - `suspendAgency(slug)`, `reactivateAgency(slug)`.
  - `impersonateAgency(slug)` → set cookie "master_impersonating" para que el middleware deje pasar.
- `src/lib/agency/team-actions.ts`:
  - `inviteMember(email, role, agencyId)`.
  - `changeMemberRole(userId, role, agencyId)` con guards.
  - `removeMember(userId, agencyId)`.

### B3. RLS updates

Granularidad de roles para `conversations`, `leads`, `messages`:
- **owner / admin**: todo de la agency.
- **agent**: solo donde `conversations.assigned_user_id = auth.uid()` OR `conversations.handler = 'bot'`.
- **viewer**: solo SELECT, sin INSERT/UPDATE.

Implementación con `agency_memberships` join + `current_role()` helper function.

### B4. Email transaccional para invites

Supabase Auth ya tiene `inviteUserByEmail`. Configurar template del email:
- Subject: "Te invitaron a Momentum AI CRM"
- Body: "{owner_name} de {agency_name} te invitó como {role}. Click acá para crear tu cuenta."
- Link: redirect post-magic-link → `/a/{slug}/inbox` (o `/welcome` si querés hacer onboarding tour).

---

## 5. Plan de ejecución (orden propuesto)

### Fase ADM-1 — Vista master mínima ✅ COMPLETADA (2026-06-02, PR #6, commit `edf34ed`)

Entregable cumplido: `/master/clientes` lista + dashboard counters + modal "Crear cliente" + migration 0017 (industry) + middleware `proxy.ts` + `requireMaster()`.

### Fase ADM-2 — Detalle de cliente + impersonación ✅ COMPLETADA (2026-06-02, PR #7, commit `a83983d`)

Entregable cumplido: detalle con 3 tabs (Info / Bot Config / Usuarios) + impersonación con cookie `master_impersonating` + banner ámbar en `/a/[slug]/*` + suspender/reactivar (D6: solo metadata + audit por ahora) + 4 RPCs al `master_audit_log`.

### Fase ADM-3 — Gestión de equipo del cliente ✅ COMPLETADA (2026-06-02, PR #8, commit `decb22f`)

Entregable cumplido: `/a/[slug]/settings/equipo` lado cliente (gating role='owner') + helper `requireAgencyOwner` con bypass master impersonando + 3 server actions (`listMembers`, `inviteMember`, `removeMember`) + 2 modos en inviteMember (`invite_sent` / `existing_user_added`) + rol fijo 'agent' (D3 LOCK-IN, sin dropdown).

### Fase ADM-4 — Métricas + polish ✅ COMPLETADA (Bloque A 2026-06-03, PR #9 `af46297` + Bloque B 2026-06-04, PR #12)

**Bloque A:** tab "Métricas" en detalle cliente (4 KPIs + chart SVG inline leads/día + top 3 agentes) + tabla "Resumen de clientes" en dashboard master + migration 0018 con 4 RPCs Postgres + 1 índice nuevo. **SVG inline (no Recharts)** para evitar bundle +95KB y look AI-slop.

**Bloque B ✅ COMPLETADA (2026-06-04, PR #12):** cablear `is_active` a corte real (login + bot N8N). Owner/agent suspendido → redirect a `/account-suspended` (nueva página pública). Master impersonando bypassa con banner rojo soft adicional. Bot N8N silenciado limpio (path explícito en `Resolve Agency` vs crash silencioso anterior). Edge function `ycloud-webhook` NO modificada (descartada defense-in-depth por founder, corte real vive en N8N). Spec: `memory/spec-adm-4b.md`.

**Bloque C (POLISH continuo):** empty states refinados, micro-animaciones, tooltips custom. Sin scope fijo.

### Fixes y mini-features post-ADM (2026-06-03 → 2026-06-04)

- **PR #10 (`3511570`)** — fix `createAgencyWithOwner` (modo `existing_user_added`, R3 levantado) + hydration mismatch InfoTab (normalizar U+00A0/U+202F).
- **PR #11 (`74f6ad1`)** — botón "Eliminar cliente" en panel master con preview de counts + doble confirmación (tipear slug exacto) + DELETE CASCADE + audit log.
- **PR #13** — Bug B inbox stale on back navigation (Next 16 RSC cache: fix con `pageshow` + `router.refresh()`).
- **PR #14** — Bug A session_key del N8N memory ahora usa `agency_id` (no `phone_business`). PUT al N8N + activate + tag git `bot-v6-v1-buga-2026-06-04`. Smoke test PASS en prod.
- **PR #15** — Gap C modal "Crear cliente" ahora soporta campo "Número WhatsApp" + INSERT a `agency_channels` automático. Mejora E: agregar `'saas'` al enum industrias.
- **PR #16** — Mejora D editor `bot_config` con `LabeledTextarea` auto-resize + `mono` para markdown estructurado.
- **PR #17** — Compliance: `/terms` + `/privacy` + `LegalFooter` montado en login y account-suspended. Razón social SRL `3-102-953427`. Sin cookie banner.
- **PR #18** — Fixes QA del compliance: footer empujado fuera de viewport + click `/terms` no funcionaba (middleware solo permitía `/login` y `/auth/*` sin sesión).
- **PR #19** — **P1.1 Roles real**: granularidad por rol owner/admin/agent/viewer. Migration 0019 (helpers SQL + `assign_round_robin` atómico + RLS sobre 10 tablas). 3 forks de producto resueltos por founder: B1 agent ve pool, B2 round-robin automático, B3 viewer ve métricas. Edge function `bot-actions` v0.5.0 llama `assign_round_robin` cuando handoff sin asignar. 37 archivos, +2666/-624 líneas. Spec: `memory/spec-p1-1-roles.md`.
- **PR #20 (2026-06-04 noche)** — **SET-1**: bot respeta toggles + dedupe + OOH double-protection. 4 DTs: 2-C handoff gate, 2-D round-robin via RPC, 2-E note dedupe 4h, 1-C OOH dedupe 72h. Edge function `bot-actions` v0.5.0 → v0.6.0. Workflow LIVE `bot-c v1` (id `Jsh4krhC9HRUh7Ly`, 84→87 nodos) actualizado via `n8n-push.mjs`. UI flip SoonBadge → LiveBadge en Settings. **HALLAZGO CRÍTICO:** el workflow LIVE NO es `bot-v6 v1` (está inactive) — es `bot-c v1` con arquitectura C completa + F5 observabilidad. Cambios futuros al N8N apuntan al `bot-c v1`. Spec: `memory/spec-set-1-bot-respects-toggles.md`. Tag git `bot-c-v1-set1-2026-06-05`.
- **PR #21 (2026-06-04 noche)** — Hotfix: import duplicado de `LiveBadge` por `replace_all` mal usado en PR #20 rompía build de Turbopack. 1 línea de fix. **Lección técnica:** NO usar `Edit replace_all: true` cuando el target puede existir en otros contextos del mismo archivo (como import list).
- **PR #22 (2026-06-04 noche-tarde)** — **OBS-1 Dashboard salud `/master/salud`** (primera sub-fase del Bloque 4 producción segura). Server component gated por `requireMaster()` con 5 bloques healthcheck (workflow N8N + últimos 50 turnos `bot_turns` + edge fns + YCloud + counters 24h) usando `Promise.allSettled` + cache por bloque (`unstable_cache` Supabase, `fetch options` externos). Botón "Refrescar" con `updateTag()`. Item nuevo sidebar master "Salud del sistema". 3 env vars N8N nuevas (HOST/API_KEY/WORKFLOW_ID). `.env.example` agregado al repo. **Cero migraciones, cero cambios edge fns, cero cambios N8N.** Hallazgos Next 16: `unstable_cache` deprecado (híbrido fetch options + unstable_cache puente hasta `'use cache'`), `revalidateTag` cambió firma → `updateTag()`. Spec: `memory/spec-obs-1-salud-sistema.md`. QA founder T1+T2+T6+T7 PASS.
- **PR #23 (2026-06-04 noche-tarde)** — **OBS-3 Rate limit webhook YCloud + Backup verificado** (tercera sub-fase Bloque 4, OBS-2 pospuesta hasta Vercel Pro). **A. Rate limit:** migration 0020 (tablas `webhook_rate_limit_buckets` + `webhook_rate_limit_drops` + función atómica con UPSERT) + 0020a (fix DELETE insuficiente) + 0020b (fix definitivo OUT params `out_*`) + 0021 pg_cron cleanup nocturno 03:00 UTC. Edge fn `ycloud-webhook` v1.0.0 → 1.1.0 → 1.1.1. Threshold 30/h/número, drop silencioso 200 OK, aplica SOLO al event `whatsapp.inbound_message.received`. Fail-open con códigos PG 42883/42P01. **Bug crítico PG 42702 ambiguity:** OUT param `bucket_start` chocaba con columna; smoke test aparentaba PASS por fail-open silencioso (35 OK + 0 drops); detección sólo verificando DB; fix = renombrar OUT params con `out_*`. **Regla nueva:** con fail-open code, validar DB post-test, no solo client output. **B. Backup:** Supabase free tier confirmado (sin backup nativo); pivot a pg_dump standalone (PostgreSQL CLI Tools 18.4 instalado, ~50MB solo "Command Line Tools"); script `backup-db.mjs` auto-detecta paths Windows/macOS, custom format `-F c` comprimido, opciones `--data-only`/`--schema-only`/`--plain`; primer backup oficial 0.49 MB (891 TOC entries); runbook restore documentado; **pg_cron HABILITADO en Supabase free** (sorpresa) — migration 0021 aplicada, `jobid=2` confirmado idempotente. Spec: `memory/spec-obs-3-rate-limit-backup.md`.

**Stats Bloque 4 (al 2026-06-04 noche-tarde):**
- OBS-1 ✅ producción (PR #22)
- OBS-2 ⏸ pospuesta hasta Vercel Pro (spec `memory/spec-obs-2-alertas-push.md` lista para retomar)
- OBS-3 ✅ producción (PR #23)
- OBS-4 ⏳ post-ads (2FA opcional)
- **Bloque 4 al 50%** — listo para Meta Ads próxima semana (~2026-06-11)

### Dog-food cerrado (2026-06-03 tarde-noche)

Workspace **Momentum AI CRM** creado vía modal en producción + `agency_channels` migrado + workspace demo eliminado vía botón nuevo + memory N8N limpiada + `bot_config` configurado con prompt estructurado. Bot live respondiendo como asistente de Momentum.

### Fase ADM-5 — Configuración avanzada por cliente (post-MVP, sin compromiso de fecha)

1. UI para pipeline_stages por cliente.
2. UI para tags por cliente.
3. UI para extractor_field_defs por cliente.
4. UI para agency_channels (números WhatsApp). **(Gap detectado en dog-food: hoy el master crea workspace pero NO puede asociarle un número WhatsApp desde la UI — requiere SQL manual.)**
5. Edit info del cliente (nombre + industria) desde el detalle. Founder mencionó "estaría bueno tener un botón Editar info" durante dog-food.

**Entregable:** vos podés ajustar la config de un cliente sin SQL.

---

## 6. Total esfuerzo estimado

| Fase | Esfuerzo |
|---|---|
| ADM-1 | 1-2 días |
| ADM-2 | 1 día |
| ADM-3 | 1-2 días |
| ADM-4 | 1-2 días |
| ADM-5 | 2-3 días (puede esperar) |
| **Total MVP (ADM-1 a ADM-4)** | **4-7 días dev** |

---

## 7. Decisiones lock-in (CONFIRMADAS 2026-06-01)

| # | Decisión | Lock-in |
|---|---|---|
| D1 | Estructura rutas master | ✅ `/master/*` separado |
| D2 | Auth users | ✅ Magic link Supabase Auth (`inviteUserByEmail`) |
| D3 | Granularidad roles MVP | ✅ owner + agent (admin/viewer post-MVP) |
| D4 | Dog-fooding | ✅ Crear a Robert via el modal M3 cuando ADM-1 esté listo |
| D5 | Industrias en M3 | ✅ Presets: "Fisio" + "Inmobiliaria" + "Otra" (texto libre como escape) |

**Próximo paso:** arrancar Fase ADM-1 (vista master `/master/clientes` + modal crear cliente + dashboard básico). Esfuerzo 1-2 días.

---

## 8. Lo que NO se hace en este plan (explicito)

- **Pulir bot/tags/objeciones** (lo dejamos para después según pedido del founder).
- **Multimedia composer / templates / audios** (postergado).
- **F7 wake-up bot** (postergado).
- **Billing/Stripe** (P2 del roadmap, después).
- **Signup público de clientes** (P2, después; ahora vos los creás manualmente desde el admin).
- **OAuth / Google login** (post-MVP).

---

## 9. Cómo retomar este plan en sesiones futuras

1. Leer este documento.
2. Verificar qué fase está en curso (marcar `[x]` en sección 5 cuando se complete cada item).
3. Antes de arrancar nueva fase, revisar si alguna decisión cambió.
4. Mantener sincronizado con `memory/roadmap-completo.md` (este plan es zoom-in del pilar P1 + algo del P0).

---

## 10. Referencias cruzadas

- `memory/roadmap-completo.md` — visión completa del proyecto, ubica este plan dentro de P1 (Multi-cliente operativo).
- `memory/backlog-mvp.md` §6 "Roles & arquitectura de cuentas" — lista vieja, queda subsumida acá.
- `memory/decisions.md` — agregar entrada cuando se confirme el plan.
- `crm-v2/src/app/a/[slug]/admin/` — código existente del Panel Admin actual (será absorbido en M4 tab "Bot Config").
- Supabase: tablas `agencies`, `users`, `agency_memberships`, `master_accounts`, `agency_role` enum.
