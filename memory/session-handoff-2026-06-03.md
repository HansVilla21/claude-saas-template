# Session Handoff — 2026-06-03 (sesión maratón admin master ADM-1→4 + dog-food Momentum)

> ⚠️ **HANDOFF HISTÓRICO — superado por `session-handoff-2026-06-04.md`**
> Este archivo se conserva como registro del estado al 2026-06-03 (cierre de ADM-1→4 + dog-food cliente cero). Para estado actual, leer el handoff nuevo primero.

**Propósito:** Snapshot completo del estado de **Momentum AI CRM** al 2026-06-03. Lectura obligatoria al inicio de cualquier sesión nueva.

**Reemplaza al handoff anterior** (`session-handoff-2026-06-01.md` queda como histórico).

Cargar también al arrancar:

- `memory/decisions.md` (entradas 2026-06-03 y 2026-06-03 tarde).
- `memory/plan-sistema-admin.md` (4 fases ADM-1/2/3/4 completadas, queda ADM-5 + Bloques B/C de ADM-4).
- `memory/roadmap-completo.md` (mapa total de los 5 pilares — orden ajustado por el founder).
- `memory/backlog-mvp.md` (changelog 2026-06-03).
- `outputs/prompts/2026-06-03_bot-config-momentum-ai-crm.md` (prompt vivo del bot).
- `outputs/prompts/2026-06-03_momentum-bot-config-sql.sql` (SQL aplicado).

---

## Resumen de la sesión

Sesión muy larga (≥12h aprox). Tres bloques de trabajo encadenados:

### Bloque 1 — Construcción admin master ADM-1 a ADM-4 (4 fases en ~2 días)

Cada fase = spec arquitecto → backend-builder + frontend-builder en paralelo → QA founder en localhost → commit → PR → Vercel preview → merge a main.

| Fase | Qué entrega | PR | Commit main |
|---|---|---|---|
| **ADM-1** | `/master/clientes` lista + dashboard counters + modal "Crear cliente" + migration 0017 (industry) + middleware/proxy.ts + requireMaster() | #6 | `edf34ed` |
| **Fix proxy** | Renombrar `middleware.ts` → `proxy.ts` (Next.js 16 deprecation) | (en #6) | `974e9d3` |
| **ADM-2** | Detalle cliente con 3 tabs (Info / Bot Config / Usuarios) + header con botones Suspender / Reactivar / Ingresar como + impersonación con cookie `master_impersonating` + banner ámbar en `/a/[slug]/*` + 4 RPC al `master_audit_log` (impersonate_start/stop, agency_suspend/reactivate) | #7 | `a83983d` |
| **ADM-3** | `/a/[slug]/settings/equipo` (lado cliente, gating role='owner') + helper `requireAgencyOwner` con bypass para master impersonando + 3 server actions (`listMembers`, `inviteMember`, `removeMember`) + modal invitar (solo email, rol fijo 'agent' por D3) + modal confirm remover + 2 modos en inviteMember (`invite_sent` / `existing_user_added`) | #8 | `decb22f` |
| **ADM-4** | Tab "Métricas" en detalle cliente (4 KPIs + chart SVG inline leads/día + top 3 agentes) + tabla "Resumen de clientes" en dashboard master + migration 0018 con 4 RPCs Postgres (`agency_leads_per_day`, `agency_response_time_30d`, `agency_top_agents`, `list_agencies_resume`) + 1 índice nuevo | #9 | `af46297` |

**Decisiones técnicas duras tomadas en cada spec:**

- **D1**: rutas `/master/*` separadas de `/a/[slug]/*` (lock-in en sesión 2026-06-01).
- **D3**: roles MVP = `owner` + `agent`. Admin/viewer en enum sin UI.
- **D4 (ADM-4)**: SVG inline (no Recharts). +0 KB bundle, look propio sin AI-slop.
- **D6 (ADM-2)**: `is_active=false` solo metadata + audit. NO corta bot ni login en esta fase (queda para Bloque B). Documentado en spec.
- **DT3 (ADM-3)**: master impersonando tiene permisos completos (incluye gestión equipo).
- Migration 0017 (industry) y 0018 (RPCs métricas) aplicadas a producción por el founder vía Supabase Dashboard.

### Bloque 2 — Fixes detectados durante dog-food

Antes de poder hacer dog-food, 2 bugs salieron a la luz:

| PR | Qué arregla |
|---|---|
| **#10** (`3511570`) | (a) `createAgencyWithOwner` agrega modo `existing_user_added` para email ya registrado (R3 levantado: master puede ser owner de su propia agency). (b) Hydration mismatch del InfoTab por whitespace U+202F vs U+00A0 en `Intl.DateTimeFormat`. |
| **#11** (`74f6ad1`) | Mini-feature solicitada por founder: botón "Eliminar cliente" en panel master con preview de counts + doble confirmación tipando slug exacto + DELETE CASCADE + audit log. Reemplaza al SQL manual. |

### Bloque 3 — Dog-food cerrado: Momentum AI CRM live como cliente cero

Ejecutado al final de la sesión, end-to-end manual desde la plataforma:

1. Founder creó workspace **"Momentum AI CRM"** (slug `momentum-ai-crm`) desde el modal del panel master usando su email — funcionó porque el fix de PR #10 ya estaba en main.
2. SQL UPDATE de `public.agency_channels` migró el número `+50689839490` del agency demo al nuevo workspace.
3. Mensaje de prueba al WhatsApp del business confirmó que mensajes ahora caen al inbox de Momentum AI CRM (no del demo).
4. SQL `DELETE FROM public.n8n_chat_histories` (con WHERE corregido tras descubrir formato E.164 con `+`) eliminó 16 mensajes del historial fisio previo.
5. SQL UPDATE de `public.agencies.bot_config` para `momentum-ai-crm` con JSON estructurado completo:
   - `business_info`: descripción Momentum + precio $499/$150 + diferenciadores
   - `tone.preset`: 'consultivo', notes con vos rioplatense + sin emojis salvo confirmación
   - `sales_close_behavior`: 'derivar_humano'
   - `conversation_flow`: 8 pasos (saludo + 5 calificación + valor + handoff)
   - `custom_instructions`: 6 reglas duras + propuesta de valor adaptada al pain + 5 casos edge + flujo handoff
6. Founder eliminó workspace **demo** vía el botón nuevo en producción (primer DELETE real con la UI nueva). Borró 59 leads, 59 conversations, 167 messages, 8 bot_turns, 2 memberships (CASCADE).
7. Test e2e PASS: bot responde como asistente de Momentum AI CRM, no como bot fisio.

**Decisión estratégica grande de la sesión (ver `decisions.md` 2026-06-03):**

- **Momentum AI CRM = cliente cero**, NO Robert. Razón: la próxima semana se lanzan ads pagos vendiendo el chatbot/CRM y los leads los va a atender el bot del propio sistema.
- **Orden de bloques del roadmap reordenado por founder:** 2 (operativo) → 4 (producción segura) → 6 (polish) → 5 (bot avanzado). El 3 (SaaS self-service) y módulos extra (propiedades) se diferiren.
- **PROP-1 diferido** (era propuesta a Jimena con propiedades). Razón cita literal del founder: *"lo que yo quiero es que el MVP, la parte base básica, esté lo más pulida posible... este tema de propiedades, o módulos extra personalizados, los vamos a trabajar después de que ya tengamos la base al 100%."*
- **Robert sale del fast track del MVP**, pasa a cliente 2 o 3.

---

## Estado del founder hoy

Funcional/operativo, no emocional. La sesión fue intensa pero productiva. El founder cerró 4 fases técnicas grandes + 2 fixes + 1 mini-feature + dog-food real, todo en una sola sesión continua.

Decisiones tomadas con claridad y enfoque comercial:
- Priorizó "MVP pulido antes de features extra" por encima del corto plazo de Jimena.
- Cambió plan original (Robert primero) por "nosotros como cliente cero" — buena lectura: si tienen ads pagos la otra semana, validar el sistema con producción real propia antes de cliente externo es lo correcto.

Lo que el founder está esperando para arrancar lunes:
- Configurar campañas Meta Ads apuntando al número del business `+50689839490`.
- Definir presupuesto diario + audiencias.
- Vigilar primeros leads para ajustar prompt si la calificación no calza.

---

## Realidad financiera

No se discutió finanzas en esta sesión. Persiste lo del handoff anterior (2026-06-01):

- Sin clientes pagando hoy. Pre-revenue.
- Robert era el plan de validación pagado (queda diferido).
- Jimena era la propuesta inmobiliaria caliente ($499 setup + $150/mes acordado verbal) — queda diferida hasta tener MVP base pulido + módulo propiedades.
- Pietro como partner: socio activo de venta. No se aclara split.

Posible entrada nueva: si los ads de la próxima semana funcionan, podrían entrar 1-3 clientes pagando a $499 + $150/mes en las próximas 2-3 semanas.

---

## Marco mental activo

**"Cliente cero antes que cliente externo."** El founder eligió dog-food real (Momentum AI CRM vendiendo su propio servicio) antes que onboarding del primer cliente externo (Robert / Jimena). Eso significa:

- El sistema tiene que estar pulido para que el bot/CRM funcione SIN supervisión 24/7.
- Cada bug encontrado al usar el sistema con leads reales se convierte en fix prioritario.
- El bot de Momentum es el demo vivo permanente — cuando un lead pregunta "¿cómo se ve?", el founder le muestra "lo estás usando ahora mismo".

**"MVP base 100% pulido antes de módulos personalizados por cliente."** Reglón rojo trazado: no agregar propiedades, ni módulos por industria, ni features personalizables hasta que el sistema base aguante 5 clientes sin que nadie llame por bug.

---

## Pipeline real al 2026-06-03

| Lead/Cliente | Estado | Notas |
|---|---|---|
| **Momentum AI CRM (interno)** | LIVE | Cliente cero. Bot configurado. Espera ads de la próxima semana. |
| **Robert (fisio)** | DIFERIDO | Originalmente cliente uno, ahora cliente 2-3. Sin compromiso de fecha. |
| **Jimena Mateo (La Vivienda, inmobiliaria)** | DIFERIDA | Propuesta $499/$150 + 1 mes entrega acordada verbal. Bloqueada por PROP-1 (módulo propiedades). Founder le va a decir "cuando tengamos el módulo te aviso". |
| **Otros (Ads)** | POTENCIAL | Los que entren por los ads de la otra semana. El bot los va a calificar y agendar llamada con Hans/Pietro. |

---

## Entregables / clientes activos

Hoy 0 entregables abiertos con clientes externos.

Internamente:
- Sistema admin master completo (ADM-1/2/3/4) operativo.
- Bot Sofia arch C funcionando.
- Workspace Momentum AI CRM funcionando como cliente cero.

---

## Acuerdos vigentes con personas

- **Pietro Sudsassi**: partner comercial. Vende, no codea. Cierra demos. Acordó con Jimena el deal $499/$150 (diferido por PROP-1).
- **Robert (fisio)**: en stand-by. Esperando a que el founder le diga cuándo arranca su workspace.
- **Jimena Mateo (La Vivienda)**: en stand-by. Founder le tiene que avisar cuando PROP-1 esté listo (semanas-meses).

---

## Marketing / contenido en marcha

- **Campañas de Meta Ads** se lanzan la próxima semana (~2026-06-08 → 2026-06-14) vendiendo Momentum AI CRM como servicio. Apuntan al WhatsApp `+50689839490`. El bot atiende.
- Sin contenido orgánico planeado en LinkedIn o redes esta semana (no se discutió).

---

## Productos / activos del founder

**Lo que existe y está desplegado:**

- **Momentum AI CRM (v2)** en producción: `https://momentum-ai-crm.vercel.app`. Multi-tenant. Stack Next.js 16 + Supabase + Tailwind + sonner + zod.
- **Panel master completo (ADM-1/2/3/4)**: gestión cross-tenant de agencies, métricas reales, impersonación, gestión equipo del cliente, dashboard con resumen.
- **Bot Sofia arch C (N8N)**: funcionando end-to-end con extractor de datos, advisory locks, audit log via trace_id. Workspace: Momentum AI CRM corriendo con el prompt vivo.
- **CRM v1** (`crm/`): solo se usa para demos visuales del módulo de propiedades a leads inmobiliarios. Sin producción real.
- **Supabase de v1** (project `ugkunpsohrimxetofawv`): se elimina cuando PROP-1 esté hecho. Por ahora se pausa, no se borra.
- **WhatsApp Business número `+50689839490`** asociado al workspace Momentum AI CRM via `agency_channels`.

**Lo que NO existe todavía:**

- Sistema de billing/Stripe (todos los clientes serían gratis hoy, no hay forma de cobrarles).
- Compliance básico (T&C, Privacy Policy, DPA).
- Signup público (los clientes los crea el master manual).
- Módulo de propiedades en v2 (sale en Jimena cuando se construya).
- Notificación handoff por WhatsApp/Telegram (el handoff hoy es solo en plataforma; agentes tienen que estar mirando).

---

## Pendientes operativos inmediatos

### Esta semana (4-7 días)

**Lado founder (operación):**

1. Configurar campañas Meta Ads (la otra semana arrancan los ads).
2. Vigilar primeros 10-20 leads que entren por el bot — ajustar el prompt si la calificación no calza.
3. Posiblemente ajustar el `bot_config` vía SQL si descubre que el bot no maneja bien algún caso.

**Lado código (Bloque 2 — MVP pulido):**

Bugs detectados durante el dog-food (urgentes pre-cliente externo):

- **Bug A**: session_key del N8N memory NO incluye agency_id ni maneja formato E.164 con `+`. Si 2 clientes comparten número (no debería, pero el modelo lo permite), la memory se mezcla. Fix: cambiar session_key a `<phone>@<agency_id>` o similar.
- **Bug B**: inbox stale on back navigation — al volver al inbox via back nav después de salir, los mensajes nuevos NO aparecen hasta F5 manual. Investigar realtime/cache. Referencia: `memory/project_bug_inbox_realtime_stale_on_back_nav.md`.
- **Gap C**: `createAgencyWithOwner` no crea fila en `agency_channels` — el master tiene que correr SQL manual. Falta UI/automation. Bloquea self-service post-MVP.
- **Mejora D**: editor del Asistente (Panel Admin) maneja campos básicos; `custom_instructions` multi-párrafo con casos edge sale más fácil via SQL. Mejorar editor para que soporte estructura mejor.
- **Mejora E**: sumar `'saas'` al enum de industrias en el modal de crear cliente. Founder tuvo que poner "Otra" + "AI" custom.

Items del plan Bloque 2 (orden propuesto):

1. **F7 Wake-up automático del bot** (6-9h) — cuando termina pause (ej. fin de semana), bot retoma sin esperar mensaje del lead. Crítico para flujo real de los ads.
2. **ADM-4 Bloque B — cablear `is_active`** (0.5-1 día) — cliente suspendido = bot deja de responder + owner no entra. Pre-requisito modelo cobro.
3. **Settings cliente-facing completo** (26-36h) — hoy es stub. Necesario antes de que cliente externo pague.
4. **P1.1 Roles real** (11-15h) — hoy roles MVP = owner+agent. Cuando un cliente tenga >2 personas, va a pedir granularidad.
5. **Compliance básico T&C + Privacy Policy** (4-6h) — obligatorio antes de cobrar.
6. **Bug A** (session_key) — ~2-4h.
7. **Bug B** (realtime inbox) — ~2-4h.
8. **Gap C** (agency_channels en modal) — ~3-5h.
9. **Mejora D** (editor robusto) + **Mejora E** (enum saas) — ~2-3h combinado.

### Próximas 2-3 semanas

- Bloque 4 — producción segura: monitoring, alertas, security audit, backup.
- Bloque 6 — polish: empty states, performance, multimedia composer, templates.
- Bloque 5 — bot avanzado (cuando llegue feedback de leads reales): tools nuevas, few-shots, A/B.

### Después (mes 2+)

- Bloque 3 — SaaS self-service: signup público, onboarding wizard, billing Stripe.
- PROP-1 — módulo de propiedades en v2 (desbloquea Jimena y libera DB de v1).

---

## Sesiones paralelas activas

Solo esta sesión está activa. No hay sesiones de Hans paralelas en otros chats.

---

## Cómo trabajar con Hans

- **No menús cuando ya sé la respuesta correcta.** Ejecutar directo.
- **Probar en localhost ANTES de commit.** No "build pass" — probar como user real.
- **Workflow git obligatorio**: feature branch + PR + Vercel preview + merge a main. Nunca push directo a main.
- **Capturar como skill cada proceso replicable.** Proactivo, no esperar a que el founder lo pida.
- **Partner crítico, no yes-man.** Decirle cuando se equivoca con fundamento. Reconocer cuando hace algo bien que yo no sugerí.
- **Diseño diferenciador, no AI-slop.** Cuando es UI, evitar el look genérico (índigo + card + shadow).
- **Idioma del proyecto: español.** Código en inglés, comunicación en español rioplatense.
- **El founder PREFIERE hacer todo manual en la plataforma** ("como si fuera producción") antes que via chat. Le sirve para validar dog-food real.

---

## Última actualización

**2026-06-03** — sesión maratón cierre admin master + dog-food cliente cero.

**Próximo update sugerido:** después de que arranquen los ads de la próxima semana, persistir métricas iniciales + ajustes al prompt + bugs nuevos. Probablemente 2026-06-08 o 2026-06-10.
