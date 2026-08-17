# Spec: OBS-2 — Sistema de alertas push vía WhatsApp

**Fecha:** 2026-06-04
**Autor:** arquitecto
**Bloque:** 4 (Producción segura) — sub-fase 2 de N (OBS-2). Hermana de OBS-1.
**Trigger:** lanzamiento de Meta Ads 2026-06-08. OBS-1 entrega visibilidad pasiva (founder mira el panel). OBS-2 entrega visibilidad activa (el sistema le grita por WhatsApp al founder cuando algo crítico se rompe, sin que tenga que estar mirando).
**Spec hermana previa:** [`spec-obs-1-salud-sistema.md`](spec-obs-1-salud-sistema.md). Esta spec **reusa los módulos `src/lib/health/{n8n,edge-functions,bot-turns,counters,ycloud,types}.ts`** que OBS-1 ya entrega — son la fuente de verdad de los healthchecks. **OBS-2 NO duplica esa lógica.**
**Ruta nueva visible:** ninguna (sin frontend en V1). El sistema corre invisible via Vercel Cron.

---

## 0. Resumen ejecutivo

OBS-2 entrega un **scheduler de alertas push vía WhatsApp** que corre cada 5 / 15 minutos en background usando **Vercel Cron Jobs**. Cuando detecta condiciones críticas (workflow N8N caído, edge function 5xx, >5 errores del bot en 1h), manda un mensaje WhatsApp al teléfono del founder usando el **mismo número y la misma API YCloud** que ya usa el bot para outbound (`sendMessageViaYCloud` en `src/app/a/[slug]/inbox/actions.ts:266`).

**Triggers V1 (3 activos + recovery):**

| Key | Severity | Frecuencia | Condición | Recovery |
|---|---|---|---|---|
| `n8n_inactive` | critical | 5 min | `bot-c v1` pasó de `active=true` a `active=false` | sí — siempre se manda |
| `edge_<name>_down` | critical | 5 min | edge function `bot-actions` o `ycloud-webhook` no responde OK 2 chequeos consecutivos | sí |
| `bot_errors_high` | critical | 15 min | ≥ 6 rows en `bot_turns` con `status IN ('failed','partial')` en última hora | sí |

**Componentes nuevos:**
- 1 migración nueva (`0020_alerts_log.sql`) — tabla `alerts_log` con dedupe.
- 2 route handlers (`/api/cron/check-infra`, `/api/cron/check-bot-errors`) — entry-points del Vercel Cron.
- 1 dispatcher central (`src/lib/alerts/dispatcher.ts`) — lógica pura testable de evaluar → dedupe → persistir → enviar.
- 1 cliente YCloud server-only (`src/lib/alerts/ycloud-client.ts`) — wrapper de envío.
- 1 archivo de triggers (`src/lib/alerts/triggers.ts`) — definición declarativa de los 3 checks.
- 1 archivo de types compartidos (`src/lib/alerts/types.ts`).
- 1 script DX (`scripts/test-cron.mjs`) — invocar localmente los handlers con el header `Authorization`.
- 1 `vercel.json` nuevo (o editado) con la sección `crons`.
- 2 env vars nuevas (`ALERT_RECIPIENT_PHONE`, `CRON_SECRET`).

**Hallazgos del audit pre-spec (cruciales para no inventar):**

1. ✅ **El patrón YCloud ya existe** en `crm-v2/src/app/a/[slug]/inbox/actions.ts:233-415` (`sendMessageViaYCloud`). Constantes clave a reusar:
   - `YCLOUD_SEND_URL = 'https://api.ycloud.com/v2/whatsapp/messages/sendDirectly'`
   - Header de auth: `'X-API-Key': process.env.YCLOUD_API_KEY`
   - Payload shape: `{ from, to, type: 'text', text: { body } }`
   - Response shape: `{ id?, wamid?, status?, error?: { code?, message? } }`
   - Toda número va en E.164 con `+` prefix.
   **Decisión:** crear `src/lib/alerts/ycloud-client.ts` como **wrapper más simple** (no necesita lookup de `agency_channels`, no escribe a `messages`, no necesita reconciliación). Toma `from`, `to`, `text` y devuelve `{ ok, providerId?, error? }`. **NO refactorizar `sendMessageViaYCloud`** — su responsabilidad (outbound de inbox con tracking en `messages`) es distinta de "ping operativo al founder". Mantener separación de blast radius.

2. ✅ **`bot-actions` NO manda WhatsApp directo** (lo audité: cero referencias a `api.ycloud.com` o `X-API-Key` en `supabase/functions/`). El único path de envío vivo está en `src/app/a/[slug]/inbox/actions.ts` (Next.js server action) y en N8N (HTTP Request node). Ya sabíamos que el bot manda vía N8N, esto solo confirma que no hay un wrapper Deno reusable y por eso crear el nuestro en `src/lib/alerts/` es lo correcto.

3. ✅ **El número emisor (`from`)** lo tenemos en `agency_channels.phone_number` filtrado por `agency_id` + `channel='whatsapp'` + `is_active=true`. Para alertas operativas al founder usamos el número de **la primera agency activa** que tenga canal WhatsApp configurado (la "agency principal" donde el bot vive). Decisión documentada en §3.4.

4. ✅ **No existe `vercel.json` en `crm-v2/`** (verificado: `ls crm-v2/` no lo lista). Lo creamos limpio en esta spec.

5. ✅ **Next 16 sigue soportando route handlers `app/api/.../route.ts`** estándar — exportan `GET` o `POST` async. Lo confirma el patrón ya usado en `node_modules/next/dist/docs/` (regla AGENTS.md del repo). Builder lo verifica antes de codear.

6. ⚠️ **Vercel Cron Jobs en plan Hobby:** **máximo 2 cron jobs**, ejecución diaria; no admite cadencia sub-diaria. En **plan Pro** (\$20/mes): hasta 40 cron jobs, **cadencia mínima 1 minuto**. **Nuestro stack necesita plan Pro** (cadencia 5 min). Decisión en §3.6 + §10.

7. ✅ **`is_master()` ya existe** (migración 0006) y permite SELECT cross-tenant. La tabla `alerts_log` se lee solo por master en el futuro UI; las escrituras vienen del cron, que corre con service_role (bypassa RLS).

8. ✅ **El nuevo número de migración es `0020`** — la última en repo es `0019_agency_role_rls.sql`.

---

## 1. Problema / requerimiento

El founder lanza Meta Ads el 2026-06-08. Después de OBS-1 ya **puede ver** si algo se rompió (abriendo `/master/salud`). Pero:

- Si el workflow N8N se apaga a las 23:00 (porque un PUT a la API falló silencioso) y el founder no abre el panel hasta el día siguiente → **8 horas perdidas** de leads que llegan sin que el bot responda.
- Si una edge function deja de responder (deploy roto, secret cambiado por mistake) → idem.
- Si el bot empieza a fallar masivo (un cambio en el system prompt rompe el extractor, los turnos terminan en `status='failed'`) → idem.

Necesita que el sistema **le pinche el celular** cuando algo crítico se rompe. WhatsApp es el canal natural — vive ahí, suena, lo agarra rápido. Sin email (latencia + spam), sin Telegram (más fricción, otra app).

**Lo que OBS-2 NO incluye (queda para V2 o más adelante):**
- UI de "Alertas activas" en `/master/salud` (la tabla ya queda persistida con `alerts_log` — la UI es trivial pero fuera de scope V1).
- Severity adicional `warning` (vs `critical`) — V2.
- Silencio en horario nocturno / domingos / feriados — riesgo de falsos negativos los lunes; lo dejamos para cuando haya señal de spam.
- Tasa de handoffs alta, latencia bot > X seg, otros triggers — V2.
- Multi-recipient (equipo recibe alerta, no solo founder) — V2.
- Snooze / mute individual de alertas — V2.

---

## 2. Estado actual relevante (auditado código por código)

### 2.1 Módulos `src/lib/health/*` (entregados por OBS-1)

**Reusados textualmente por OBS-2 sin modificación:**

- `fetchN8nHealth(): Promise<N8nHealth>` (n8n.ts:114) → devuelve `{ configured, reachable, workflow: { active }, executions, lastSuccessAt, error? }`. **OBS-2 lo invoca igual que el page server-side; el cron handler lo llama directo.**
- `fetchEdgeFunctionsHealth(): Promise<EdgeFnHealth[]>` (edge-functions.ts:118) → array de 2 elementos con `{ name, reachable, latencyMs, payload, error? }`.
- Tipos: `N8nHealth`, `EdgeFnHealth`, `EdgeFnName` (types.ts) — importables sin cambio.

**Por qué reusar y no duplicar:**
- Si más adelante cambia el endpoint N8N o el payload de edge function, hay un solo lugar que tocar.
- El page `/master/salud` y el cron handler comparten exactamente la misma lectura de estado → "lo que muestra el panel" = "lo que evalúa la alerta", sin drift.
- Cache de fetch (revalidate 30s n8n, 60s edge) **NO molesta acá** — el cron corre cada 5 min, la primera invocación del minuto 0 cachea; minuto 5 sigue sirviendo del cache si pasó < 30s entre los dos contextos. **Mitigación si molesta:** el handler puede pasar `{ skipCache: true }` opcional — pero por ahora el cache es bienvenido (reduce llamadas a N8N).

### 2.2 `bot_turns` para el contador de errores (T3)

**Query simple, sin RPC nueva:** `bot_turns` con `status IN ('failed','partial')` últimos 60 min. Cross-tenant via service_role (el cron corre server-side con la admin key, RLS no aplica). El índice `idx_bot_turns_status_running` cubre el filtro de status; un index scan sobre `bot_turns` filtrado por `started_at > now() - 1h` con el predicate `status IN (...)` es trivial.

**Decisión:** **NO crear índice nuevo** para este query. El volumen esperado en V1 (~ 100-500 turnos/día) es trivial y la query corre cada 15 min. Si en 3 meses con tráfico Meta Ads crece a > 10k turnos/día y el query empieza a aparecer en `get_logs` como slow, agregar `CREATE INDEX idx_bot_turns_started_status ON bot_turns(started_at desc, status)` en futura migración. Documentado como follow-up.

### 2.3 Patrón YCloud existente (resumen de auditoría)

**Fuente:** `crm-v2/src/app/a/[slug]/inbox/actions.ts:266-415` (`sendMessageViaYCloud`).

**Contrato YCloud confirmado en producción:**
```
POST https://api.ycloud.com/v2/whatsapp/messages/sendDirectly
Headers:
  X-API-Key: ${YCLOUD_API_KEY}
  Content-Type: application/json
Body:
  { from: "<E164 con +>", to: "<E164 con +>", type: "text", text: { body: "<text>" } }
Response 2xx:
  { id?, wamid?, status?, error?: { code?, message? } }
Response 4xx/5xx:
  { error: { code, message } } o no-JSON
```

**Lo que el wrapper de OBS-2 NO necesita (diferencia con `sendMessageViaYCloud`):**
- No hace lookup de `messages` ni hace UPDATE.
- No verifica RLS / roles (corre con service_role, gateado por `CRON_SECRET`).
- No maneja reconciliación con `external_id` / `wamid` UNIQUE.
- No requiere `slug` ni context de agency UI.

**Lo que SÍ comparte:**
- Mismo URL, mismo header de auth, misma shape de payload, mismo manejo de errores (response.ok + parse JSON + capturar error.code/message).
- Misma normalización a E.164 con `+` (función `toE164` se replica simple).

---

## 3. Decisiones técnicas

### 3.1 Canal único: WhatsApp via YCloud (decisión sellada)

**Reusamos el mismo número WhatsApp Business del bot** para mandar alertas al founder. Founder recibe en su WhatsApp personal mensajes "[ALERTA] ..." desde el chat de "Momentum AI" (el número del bot).

**Por qué:**
- Cero infraestructura nueva (vs Telegram que requiere bot Token + chat ID + librería).
- El founder ya tiene ese chat abierto frecuentemente.
- No mezcla con clientes — el founder es el único destinatario, y el bot **NO va a responder** mensajes que el founder mande hacia el número (gate documentado en §3.5).

**Trade-off aceptado:** el WhatsApp del bot acumula mensajes operativos en el thread del founder. Solución V2 si molesta: crear un thread dedicado o filtrar el número del founder en el webhook inbound del bot para que no procese sus mensajes.

### 3.2 Recipient configurable por env var (`ALERT_RECIPIENT_PHONE`)

**Decisión:** una sola env var `ALERT_RECIPIENT_PHONE` con E.164 (ej. `+50688217229`).

**Defensa contra "var faltante":**
```ts
if (!process.env.ALERT_RECIPIENT_PHONE) {
  console.warn('[alerts] ALERT_RECIPIENT_PHONE no configurada — alerta solo logueada, no enviada');
  return { ok: false, error: 'no_recipient_configured' };
}
```
La alerta **sigue persistiéndose en `alerts_log`** (con `notification_sent=false` + `notification_error='no_recipient_configured'`). Esto es un fail soft — el sistema no se rompe si la var falta, solo deja de notificar.

### 3.3 Orchestration: Vercel Cron Jobs

**Decisión:** Vercel Cron con 2 cron entries. Un solo proveedor, un solo lugar de config, integrado con el deploy del proyecto.

**Por qué NO Supabase scheduled functions / pg_cron:**
- Supabase cron requiere extensión `pg_cron` + lógica en Postgres — overkill para chequeos que hablan HTTP a N8N + edge functions. Mejor que la lógica viva en Next/TypeScript (mismo lenguaje, mismos módulos `lib/health/*` que ya tenemos).
- Vercel Cron está atado al deploy: si revertimos el deploy, el cron también revierte. Auditable en el dashboard de Vercel.

**Por qué NO un service externo (Inngest, Trigger.dev, Upstash QStash):**
- Onboarding adicional, otra credencial, otro panel a monitorear.
- Para 2 jobs simples no justifica.

**Cadencia decidida:**
- **`/api/cron/check-infra`** cada `*/5 * * * *` (cada 5 min, 288 ejecuciones/día). Chequea N8N + edge functions. Alta criticidad → cadencia rápida.
- **`/api/cron/check-bot-errors`** cada `*/15 * * * *` (cada 15 min, 96 ejecuciones/día). Chequea contador de errores `bot_turns`. Cadencia más lenta porque la ventana de evaluación es 1h — chequear cada 15 min basta para detectar el problema dentro de la primera media hora.

### 3.4 Sender number — agency principal

**Problema:** YCloud requiere `from`. Necesitamos un número emisor.

**Decisión V1:** **dos opciones según ergonomía**, default a la primera:

**Opción A (default):** lookup en runtime — la query trae la primera agency con canal WhatsApp activo:
```sql
SELECT phone_number
FROM agency_channels
WHERE channel = 'whatsapp' AND is_active = true
ORDER BY created_at ASC
LIMIT 1;
```
Pro: cero config nueva. Contra: si por alguna razón no hay agency con canal activo, falla.

**Opción B (override por env var):** `ALERT_SENDER_PHONE` opcional. Si está presente, se usa esa; si no, fallback a Opción A.

**Decisión sellada:** **A + B en cascada**, env var **opcional**. Documentado en §6.

**Defensa:** si ambos fallan (no env var + no agency con canal activo), logueamos warning + persistimos alerta con `notification_error='no_sender_available'`. La alerta queda en DB para futuro retry/visibility.

### 3.5 Gate del bot inbound — el founder NO debe ser tratado como lead

**Riesgo:** si el founder responde al thread de WhatsApp donde recibe alertas, el webhook inbound del bot (`ycloud-webhook`) procesa el mensaje como si fuera un lead nuevo → crea conversation, dispara el bot, etc.

**Mitigación V1:** documentar en `docs/operations/` (futuro) y en el código de `ycloud-webhook`. **NO bloquear el inbound en este sprint** (cambio fuera de scope de OBS-2 y bajo riesgo: el founder no va a responder a "[ALERTA] Workflow N8N apagado" — y si lo hace, el peor caso es que se crea un lead fantasma que se identifica fácil por el número del founder).

**Mitigación V2 (cuando importe):** en `ycloud-webhook/index.ts`, después de identificar el `from`, comparar contra `ALERT_RECIPIENT_PHONE` y si match → skip + log.

### 3.6 Plan de Vercel — Pro requerido

**Hobby (free):** máximo **2 cron jobs**, ejecución diaria solamente (no admite cadencia menor a 24h). **NO sirve** para OBS-2.

**Pro ($20/mes):** hasta **40 cron jobs**, cadencia mínima 1 minuto. ✅ Sirve.

**Confirmar con founder antes del deploy a producción.** Si Hobby es bloqueante por costo:
- Plan B: usar Supabase scheduled function (`select cron.schedule(...)`) que llame los route handlers vía HTTP — manda el header `Authorization: Bearer ${CRON_SECRET}` igual que Vercel Cron. **Requiere extensión pg_cron activa**. Auditable y gratuita en Supabase Pro.
- Plan C: Upstash QStash (free tier 500 requests/día — alcanza para 288+96 = 384 daily requests, justo en el límite).

**Decisión por defecto:** asumir Vercel Pro. Si founder dice "Hobby por ahora", fallback a Supabase pg_cron documentado pero **no implementado en este sprint** (decisión rápida con el founder).

### 3.7 Auth de cron handlers — `CRON_SECRET`

**Decisión:** los route handlers verifican header `Authorization: Bearer ${CRON_SECRET}` y devuelven `401` si no matchea. **Vercel inyecta este header automáticamente** cuando ejecuta el cron, leyendo `process.env.CRON_SECRET` de las env vars del proyecto. La env var se setea una vez en Vercel; nadie más la conoce.

**Por qué ese patrón:**
- El route handler queda accesible públicamente en la URL `/api/cron/...` — sin auth, cualquiera puede dispararlo y armar DoS de alertas o de N8N.
- Es el patrón documentado oficial de Vercel para Cron auth.

**Sin `CRON_SECRET` configurado**, la spec **falla cerrado**: devuelve 401 a TODO request, incluyendo el de Vercel Cron → los cron jobs no corren → no hay alertas. **Esto es seguro** (no leak) pero **silencioso** — mitigación con healthcheck del cron en sí (§7 R2).

### 3.8 Dedupe via tabla `alerts_log` (1h window)

**Decisión:** dedupe basado en query a la tabla, no en cache in-memory ni en distributed lock.

**Algoritmo (pseudo):**
```
on evaluateTrigger(key, currentState):
  if currentState.healthy:
    if exists active row with key:
      → markResolved(key)  // dispara recovery alert
    return  // nada que hacer

  // currentState.broken:
  lastActive = SELECT * FROM alerts_log WHERE alert_key=key AND status='active'
                ORDER BY triggered_at DESC LIMIT 1

  if lastActive AND (now - lastActive.triggered_at) < 1h:
    UPDATE alerts_log SET last_seen_at=now() WHERE id=lastActive.id
    return  // dedupado, NO mandar segunda alerta

  // No active, o el active es viejo (>1h):
  insert new row with status='active', triggered_at=now()
  → sendWhatsAppAlert()
  UPDATE alerts_log SET notification_sent=true, notification_sent_at=now() WHERE id=...
```

**Recovery:**
```
markResolved(key):
  UPDATE alerts_log SET status='resolved', resolved_at=now()
    WHERE alert_key=key AND status='active'
  insert new row with severity='recovery', status='resolved', payload={...}
  → sendWhatsAppAlert()  // recovery siempre se manda, NO dedupe
```

**Por qué `last_seen_at`:** permite distinguir "el problema persiste" (last_seen reciente) de "el problema se fue y volvió" (gap > N min). V1 no usa esto para nada — pero queda baseline para V2 (ej. severity escalation si persiste > 2h).

### 3.9 Hard limit anti-loop: max 10 alerts por hora globales

**Decisión:** antes de mandar cualquier WhatsApp, contar:
```sql
SELECT count(*) FROM alerts_log
WHERE notification_sent_at > now() - interval '1 hour'
```
Si > 10 → **no enviar**, solo persistir row con `notification_error='rate_limit_exceeded'`.

**Por qué:** si un bug en `evaluateTrigger` evalúa mal y dispara 50 alertas en 5 minutos → no spamamos al founder. El log queda para audit, pero el celular no suena 50 veces.

**Threshold 10/h:** generoso (3 triggers × cada 5-15 min × recovery), pero corta el feedback loop antes de catástrofe.

### 3.10 Idempotencia / race conditions entre cron runs

**Vercel garantiza single-run por schedule** (no dispara dos invocaciones paralelas del mismo cron). Pero **dos crons distintos pueden solaparse** (cuando `*/15` y `*/5` coinciden cada 15 min).

**Defensa:** las inserciones a `alerts_log` no compiten porque cada trigger tiene su propio `alert_key` único (`n8n_inactive`, `bot_errors_high`). El SELECT-then-INSERT dentro de `dedupeAndPersist` puede sufrir race si dos instancias del mismo cron corrieran a la vez — pero eso no pasa con Vercel single-run. **Si en algún momento necesitamos garantía absoluta:** envolver la lógica en una transacción Postgres con `SELECT ... FOR UPDATE` sobre la última row del key.

**V1 sin lock explícito**, documentado el riesgo en §7 R6.

---

## 4. Modelo de datos: migración `0020_alerts_log.sql`

### 4.1 SQL de la tabla

```sql
-- =============================================================================
-- Momentum AI CRM — Migration 0020: alerts_log (OBS-2)
-- =============================================================================
-- Tabla de auditoría + dedupe para el scheduler de alertas push vía WhatsApp.
-- Cada fila representa una "alerta" detectada por los cron handlers de
-- /api/cron/check-infra y /api/cron/check-bot-errors.
--
-- Lifecycle de una alerta:
--   1. cron detecta condición negativa → INSERT con status='active'
--   2. siguiente cron detecta misma condición persistente → UPDATE last_seen_at
--   3. cron detecta recuperación → UPDATE status='resolved' + resolved_at
--      + INSERT row nueva con severity='recovery' (notifica al founder)
--
-- RLS: solo master via is_master(). El cron handler escribe con service_role
-- (bypassa RLS), y la futura UI de "Alertas activas" leerá solo si master.
-- =============================================================================

create table if not exists public.alerts_log (
    id                       uuid primary key default gen_random_uuid(),
    alert_key                text not null,
    severity                 text not null,
    status                   text not null,
    triggered_at             timestamptz not null default now(),
    resolved_at              timestamptz,
    last_seen_at             timestamptz not null default now(),
    payload                  jsonb not null default '{}'::jsonb,
    notification_sent        boolean not null default false,
    notification_sent_at     timestamptz,
    notification_error       text,
    created_at               timestamptz not null default now(),
    constraint alerts_log_severity_chk
        check (severity in ('critical', 'warning', 'recovery')),
    constraint alerts_log_status_chk
        check (status in ('active', 'resolved'))
);

-- Índice para dedupe (lookup por key + status='active').
create index if not exists idx_alerts_log_key_status
    on public.alerts_log(alert_key, status);

-- Índice para listar activas en orden cronológico (futura UI).
create index if not exists idx_alerts_log_status_triggered
    on public.alerts_log(status, triggered_at desc);

-- Índice global para historial / audit.
create index if not exists idx_alerts_log_triggered
    on public.alerts_log(triggered_at desc);

comment on table public.alerts_log is
    'Auditoría + dedupe del scheduler de alertas push WhatsApp (OBS-2 spec '
    '2026-06-04). Una fila por evento de alerta (activa o recovery). El cron '
    'escribe con service_role; la UI futura lee con master gate via is_master().';

comment on column public.alerts_log.alert_key is
    'Identificador estable del trigger. Ejemplos: n8n_inactive, '
    'edge_bot_actions_down, edge_ycloud_webhook_down, bot_errors_high.';
comment on column public.alerts_log.severity is
    'critical = WhatsApp inmediato. warning = V2 (no usado en V1). '
    'recovery = mensaje de "se resolvió", siempre se envía sin dedupe.';
comment on column public.alerts_log.status is
    'active = problema en curso. resolved = problema acabó '
    '(o esta fila es la recovery itself).';
comment on column public.alerts_log.last_seen_at is
    'Updated en cada cron run mientras la condición persiste. Permite medir '
    '"cuánto tiempo lleva activa esta alerta".';
comment on column public.alerts_log.payload is
    'Contexto del trigger: { workflowId, executionId, fnName, errorCount, '
    'lastSuccessAt, etc. }. JSON libre — la UI no asume shape fijo V1.';

-- RLS
alter table public.alerts_log enable row level security;

drop policy if exists alerts_log_select on public.alerts_log;
create policy alerts_log_select on public.alerts_log for select
    using (public.is_master());

-- INSERT / UPDATE / DELETE: solo service_role (no policy declarada → no acceso
-- a authenticated). El cron handler usa createAdminClient() que bypassa RLS.
-- Esto es defensa por si un cliente intenta INSERT directo vía JS — RLS deny.
```

### 4.2 Por qué este shape

- **`alert_key text`** (no enum): nuevos triggers en V2 no requieren migration. Validamos en código (whitelist).
- **`payload jsonb`**: contexto variable por trigger (N8N pasa workflowId, edge pasa fnName, bot_errors pasa count). No queremos columnas específicas por trigger.
- **`notification_error text`**: si YCloud falla, queremos saber por qué sin perder la fila. Truncamos a 1000 chars en código.
- **Sin `updated_at` automático trigger**: no se requiere — los UPDATEs explícitos setean `last_seen_at` o `resolved_at` directamente.

---

## 5. Estructura de archivos a crear / modificar

### 5.1 Crear

| Archivo | Tipo | Responsabilidad |
|---|---|---|
| `crm-v2/supabase/migrations/0020_alerts_log.sql` | SQL | Tabla `alerts_log` + índices + RLS (§4) |
| `crm-v2/src/lib/alerts/types.ts` | shared TS | `AlertKey`, `AlertSeverity`, `AlertStatus`, `AlertRow`, `TriggerEvaluation`, `TriggerDefinition` |
| `crm-v2/src/lib/alerts/triggers.ts` | server-only | Definición declarativa de los 3 triggers (evaluate + formatMessage por cada) |
| `crm-v2/src/lib/alerts/dispatcher.ts` | server-only | `evaluateTrigger`, `dedupeAndPersist`, `markResolved`, `sendWhatsAppAlert`, `runTriggerCycle` |
| `crm-v2/src/lib/alerts/ycloud-client.ts` | server-only | `sendWhatsAppText(to, text)` — wrapper YCloud reducido |
| `crm-v2/src/app/api/cron/check-infra/route.ts` | Route Handler | `GET` que verifica `CRON_SECRET` + corre triggers `n8n_inactive` + `edge_*_down` |
| `crm-v2/src/app/api/cron/check-bot-errors/route.ts` | Route Handler | `GET` que verifica `CRON_SECRET` + corre trigger `bot_errors_high` |
| `crm-v2/scripts/test-cron.mjs` | dev script | Invoca los handlers en localhost con el header bearer |
| `crm-v2/vercel.json` | config | Cron entries (§5.3) |

### 5.2 Modificar

| Archivo | Cambio |
|---|---|
| `crm-v2/.env.example` | Agregar sección "OBS-2 — alertas push WhatsApp" con `ALERT_RECIPIENT_PHONE`, `CRON_SECRET`, `ALERT_SENDER_PHONE` (opcional) |

### 5.3 `vercel.json` (nuevo, contenido completo)

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    {
      "path": "/api/cron/check-infra",
      "schedule": "*/5 * * * *"
    },
    {
      "path": "/api/cron/check-bot-errors",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

**Nota:** Vercel Cron solo soporta `GET`. Los route handlers usan `export async function GET(...)`.

### 5.4 No tocar (verificación)

- ❌ NO modificar `src/lib/health/*` — reusar tal cual.
- ❌ NO modificar `sendMessageViaYCloud` ni el path de outbound del inbox.
- ❌ NO modificar edge functions (`bot-actions`, `ycloud-webhook`).
- ❌ NO modificar el workflow N8N.
- ❌ NO modificar las migraciones previas (la 0020 es aditiva).

---

## 6. Contrato de cada módulo (firmas + responsabilidades)

### 6.1 `src/lib/alerts/types.ts`

```ts
export type AlertKey =
  | 'n8n_inactive'
  | 'edge_bot_actions_down'
  | 'edge_ycloud_webhook_down'
  | 'bot_errors_high';

export type AlertSeverity = 'critical' | 'warning' | 'recovery';
export type AlertStatus = 'active' | 'resolved';

export type AlertRow = {
  id: string;
  alertKey: AlertKey;
  severity: AlertSeverity;
  status: AlertStatus;
  triggeredAt: string;
  resolvedAt: string | null;
  lastSeenAt: string;
  payload: Record<string, unknown>;
  notificationSent: boolean;
  notificationSentAt: string | null;
  notificationError: string | null;
};

// Resultado de evaluar una condición de trigger (puro, sin DB).
export type TriggerEvaluation =
  | { kind: 'broken'; severity: 'critical'; payload: Record<string, unknown>; message: string }
  | { kind: 'healthy'; payload: Record<string, unknown> }
  | { kind: 'skip'; reason: string }; // ej. "configuración incompleta — no podemos evaluar"

export type TriggerDefinition = {
  key: AlertKey;
  // Función pura — recibe estado actual del sistema y devuelve evaluación.
  evaluate: () => Promise<TriggerEvaluation>;
  // Formato del mensaje cuando se dispara o se recupera.
  formatAlertMessage: (payload: Record<string, unknown>) => string;
  formatRecoveryMessage: (payload: Record<string, unknown>, downtimeMs: number | null) => string;
};
```

### 6.2 `src/lib/alerts/triggers.ts`

Define las 3 funciones evaluate, importando los módulos health/.

```ts
import { fetchN8nHealth } from '@/lib/health/n8n';
import { fetchEdgeFunctionsHealth } from '@/lib/health/edge-functions';
import { createAdminClient } from '@/lib/supabase/admin';
import type { TriggerDefinition, TriggerEvaluation } from './types';

// --- T1: workflow N8N caído ----------------------------------------------
export const triggerN8nInactive: TriggerDefinition = {
  key: 'n8n_inactive',
  async evaluate(): Promise<TriggerEvaluation> {
    const health = await fetchN8nHealth();
    if (!health.configured) {
      return { kind: 'skip', reason: 'N8N no configurado en env' };
    }
    if (!health.reachable) {
      // API caída ≠ workflow caído. NO alertar acá — esto lo maneja un
      // chequeo separado o se considera operativo (false negative
      // controlado V1, documentado en R7).
      return { kind: 'skip', reason: 'N8N API inaccesible — no podemos saber si workflow está activo' };
    }
    const active = health.workflow?.active === true;
    if (!active) {
      return {
        kind: 'broken',
        severity: 'critical',
        payload: {
          workflowName: health.workflow?.name ?? 'bot-c v1',
          workflowId: health.workflow?.id,
          lastSuccessAt: health.lastSuccessAt,
        },
        message: '', // resuelto por formatAlertMessage
      };
    }
    return { kind: 'healthy', payload: { workflowName: health.workflow?.name } };
  },
  formatAlertMessage(p) {
    const now = new Date().toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' });
    return [
      '[ALERTA] Workflow N8N apagado',
      `Workflow: ${p.workflowName ?? 'bot-c v1'}`,
      `Detectado: ${now} CR`,
      'Acción: revisar EasyPanel o reactivar desde N8N UI',
    ].join('\n');
  },
  formatRecoveryMessage(p, downtimeMs) {
    const min = downtimeMs ? Math.round(downtimeMs / 60_000) : null;
    return [
      '[OK] Workflow N8N activo de nuevo',
      `Workflow: ${p.workflowName ?? 'bot-c v1'}`,
      min !== null ? `Tiempo abajo: ${min} min` : 'Tiempo abajo: desconocido',
    ].join('\n');
  },
};

// --- T2: edge function caída (un trigger por función) ---------------------
// Implementación: el handler check-infra hace UNA llamada a
// fetchEdgeFunctionsHealth() y arma triggers separados por nombre. La
// definición declarativa expone 2 evaluate, pero internamente comparten cache
// del fetch (request-level dedup vía React `cache()` o variable local).
export const triggerEdgeBotActionsDown: TriggerDefinition = { /* ... */ };
export const triggerEdgeYcloudWebhookDown: TriggerDefinition = { /* ... */ };

// --- T3: tasa errores bot última hora -------------------------------------
export const triggerBotErrorsHigh: TriggerDefinition = {
  key: 'bot_errors_high',
  async evaluate(): Promise<TriggerEvaluation> {
    const admin = createAdminClient();
    const sinceIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error } = await admin
      .from('bot_turns')
      .select('id', { count: 'exact', head: true })
      .gte('started_at', sinceIso)
      .in('status', ['failed', 'partial']);
    if (error) {
      return { kind: 'skip', reason: `Postgres error: ${error.message}` };
    }
    const errorCount = count ?? 0;
    if (errorCount > 5) {
      return {
        kind: 'broken',
        severity: 'critical',
        payload: { errorCount, since: sinceIso },
        message: '',
      };
    }
    return { kind: 'healthy', payload: { errorCount } };
  },
  formatAlertMessage(p) {
    return [
      '[ALERTA] Tasa de errores del bot alta',
      `Errores última hora: ${p.errorCount}`,
      'Acción: revisar /master/salud → últimos turnos con filtro "Solo errores"',
    ].join('\n');
  },
  formatRecoveryMessage(p) {
    return [
      '[OK] Tasa de errores del bot normalizada',
      `Errores última hora: ${p.errorCount} (≤ 5)`,
    ].join('\n');
  },
};
```

**Detalle sobre T2 (edge functions):**
- El handler `check-infra` evalúa **una sola vez** `fetchEdgeFunctionsHealth()` y luego mapea cada elemento del array a su propio key (`edge_bot_actions_down`, `edge_ycloud_webhook_down`).
- **Requiere 2 chequeos consecutivos negativos** antes de alertar (evita cold start false positives). Implementación: query a `alerts_log` por `alert_key` con `status='active'` o por evidencia previa en `payload.failureCount`. Patrón simple:
  - Si el ping falla y NO hay row active → crear row con `status='active'`, `payload={failureCount:1}`, **NO** notificar.
  - Si el ping falla y hay row active con `failureCount<2` → UPDATE incrementa, notificar al llegar a 2.
  - Si el ping falla y hay row active con `failureCount>=2` → UPDATE `last_seen_at`, NO renotificar (dedupe 1h).
  - Si el ping pasa y hay row active → markResolved.

**Esto es un mini state machine** que vive dentro de `dedupeAndPersist` específico para edge fns. Documentar inline.

### 6.3 `src/lib/alerts/dispatcher.ts`

**Funciones principales (testables, puras donde es posible):**

```ts
// Lee la última row activa para una key y decide qué hacer.
// Devuelve { action: 'create'|'update'|'noop', currentRow?, shouldNotify }
export async function dedupeAndPersist(
  trigger: TriggerDefinition,
  evaluation: TriggerEvaluation,
): Promise<{ alertId: string | null; shouldNotify: boolean }>;

// Cierra la fila activa + inserta una recovery row.
export async function markResolved(
  triggerKey: AlertKey,
  trigger: TriggerDefinition,
): Promise<{ recoveryId: string | null; shouldNotify: boolean }>;

// Manda WhatsApp. NO toca la DB excepto para marcar notification_sent/error.
export async function sendWhatsAppAlert(
  alertId: string,
  message: string,
): Promise<{ ok: boolean; providerId?: string; error?: string }>;

// Hard limit anti-loop: cuenta sends última hora.
export async function isRateLimited(): Promise<boolean>;

// Coordinador: ejecuta evaluate() → dedupeAndPersist() → sendWhatsAppAlert().
// Es lo que llaman los route handlers.
export async function runTriggerCycle(
  trigger: TriggerDefinition,
): Promise<{
  key: AlertKey;
  evaluation: TriggerEvaluation;
  alertId: string | null;
  notificationSent: boolean;
  rateLimited: boolean;
  error?: string;
}>;
```

**Esqueleto de `runTriggerCycle` (pseudo, para que builder no improvise):**
```ts
export async function runTriggerCycle(trigger) {
  const evaluation = await trigger.evaluate();

  if (evaluation.kind === 'skip') {
    return { key: trigger.key, evaluation, alertId: null, notificationSent: false, rateLimited: false };
  }

  if (evaluation.kind === 'healthy') {
    const { recoveryId, shouldNotify } = await markResolved(trigger.key, trigger);
    if (!shouldNotify) return { key: trigger.key, evaluation, alertId: recoveryId, notificationSent: false, rateLimited: false };
    if (await isRateLimited()) return { ..., rateLimited: true };
    const msg = trigger.formatRecoveryMessage(evaluation.payload, /* downtimeMs */ null);
    const res = await sendWhatsAppAlert(recoveryId!, msg);
    return { key: trigger.key, evaluation, alertId: recoveryId, notificationSent: res.ok, rateLimited: false, error: res.error };
  }

  // evaluation.kind === 'broken'
  const { alertId, shouldNotify } = await dedupeAndPersist(trigger, evaluation);
  if (!shouldNotify) return { key: trigger.key, evaluation, alertId, notificationSent: false, rateLimited: false };
  if (await isRateLimited()) return { ..., rateLimited: true };
  const msg = trigger.formatAlertMessage(evaluation.payload);
  const res = await sendWhatsAppAlert(alertId!, msg);
  return { key: trigger.key, evaluation, alertId, notificationSent: res.ok, rateLimited: false, error: res.error };
}
```

**downtimeMs en recovery:** se calcula como `now - originalRow.triggered_at` donde `originalRow` = la última row con `status='active'` antes de marcarla resuelta. `markResolved` lo devuelve para que `runTriggerCycle` lo pase a `formatRecoveryMessage`.

### 6.4 `src/lib/alerts/ycloud-client.ts`

**Único export:**
```ts
export async function sendWhatsAppText(
  to: string,
  text: string,
): Promise<{ ok: boolean; providerId?: string; error?: string }>;
```

**Implementación replicada del patrón v1 (resumen — el builder copia del `inbox/actions.ts:266+`):**

```ts
const YCLOUD_SEND_URL = 'https://api.ycloud.com/v2/whatsapp/messages/sendDirectly';
const REQUEST_TIMEOUT_MS = 10_000;

function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D+/g, '');
  return digits.length > 0 ? `+${digits}` : null;
}

async function resolveSenderPhone(): Promise<string | null> {
  // 1. env var override
  const override = toE164(process.env.ALERT_SENDER_PHONE);
  if (override) return override;
  // 2. fallback: primera agency con canal whatsapp activo
  const admin = createAdminClient();
  const { data } = await admin
    .from('agency_channels')
    .select('phone_number')
    .eq('channel', 'whatsapp')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return toE164(data?.phone_number ?? null);
}

export async function sendWhatsAppText(to: string, text: string) {
  const apiKey = process.env.YCLOUD_API_KEY;
  if (!apiKey) return { ok: false, error: 'ycloud_api_key_missing' };

  const fromPhone = await resolveSenderPhone();
  if (!fromPhone) return { ok: false, error: 'no_sender_available' };

  const toE164Phone = toE164(to);
  if (!toE164Phone) return { ok: false, error: 'invalid_recipient' };

  const payload = { from: fromPhone, to: toE164Phone, type: 'text', text: { body: text } };

  let response: Response;
  try {
    response = await fetch(YCLOUD_SEND_URL, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'fetch_error';
    return { ok: false, error: msg.slice(0, 200) };
  }

  const responseText = await response.text();
  let parsed: { wamid?: string; error?: { code?: string; message?: string } } | null = null;
  try { parsed = responseText ? JSON.parse(responseText) : null; } catch { /* keep null */ }

  if (!response.ok) {
    const code = parsed?.error?.code ?? String(response.status);
    return { ok: false, error: `ycloud_${code}` };
  }

  return { ok: true, providerId: parsed?.wamid ?? undefined };
}
```

### 6.5 `src/app/api/cron/check-infra/route.ts`

```ts
import { NextResponse } from 'next/server';
import { runTriggerCycle } from '@/lib/alerts/dispatcher';
import {
  triggerN8nInactive,
  triggerEdgeBotActionsDown,
  triggerEdgeYcloudWebhookDown,
} from '@/lib/alerts/triggers';

export const runtime = 'nodejs';     // confirmar en docs Next 16 — algunas APIs
                                     // server-only (cookies, headers) requieren node runtime.
export const dynamic = 'force-dynamic'; // nunca cachear el cron.

export async function GET(request: Request) {
  // 1. Auth
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  // 2. Correr los 3 triggers en paralelo (independientes entre sí).
  const results = await Promise.allSettled([
    runTriggerCycle(triggerN8nInactive),
    runTriggerCycle(triggerEdgeBotActionsDown),
    runTriggerCycle(triggerEdgeYcloudWebhookDown),
  ]);

  // 3. Log estructurado (irá a Vercel runtime logs).
  const summary = results.map((r, idx) => ({
    index: idx,
    status: r.status,
    value: r.status === 'fulfilled' ? r.value : undefined,
    reason: r.status === 'rejected' ? String(r.reason) : undefined,
  }));
  console.log('[cron/check-infra]', JSON.stringify(summary));

  return NextResponse.json({ ok: true, results: summary }, { status: 200 });
}
```

### 6.6 `src/app/api/cron/check-bot-errors/route.ts`

Mismo skeleton; ejecuta solo `triggerBotErrorsHigh`.

### 6.7 `scripts/test-cron.mjs`

```js
#!/usr/bin/env node
// Uso: node scripts/test-cron.mjs check-infra
//      node scripts/test-cron.mjs check-bot-errors
//
// Lee CRON_SECRET de .env.local (o de process.env si ya está exportada) y
// dispara el route handler local. Útil porque Vercel Cron NO corre en
// `npm run dev` — esta es la forma de probarlo end-to-end sin desplegar.

import 'dotenv/config'; // requiere `npm i -D dotenv` (ver paso instalación en §8)

const target = process.argv[2];
if (!target || !['check-infra', 'check-bot-errors'].includes(target)) {
  console.error('Usage: node scripts/test-cron.mjs check-infra|check-bot-errors');
  process.exit(1);
}

const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error('Falta CRON_SECRET en .env.local');
  process.exit(1);
}

const url = `http://localhost:3000/api/cron/${target}`;
const res = await fetch(url, {
  headers: { authorization: `Bearer ${secret}` },
});
const body = await res.text();
console.log(`[${target}] status=${res.status}`);
console.log(body);
```

**Si `dotenv` no está en devDeps**, el script lee `process.env.CRON_SECRET` directo y el founder lo exporta antes (`$env:CRON_SECRET="..."` en PowerShell, `export CRON_SECRET=...` en bash). Decisión: **no agregar dependencia nueva por un script de dev** → builder usa el segundo path (env explícita), comentado al inicio del script.

---

## 7. Riesgos y mitigaciones

| # | Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|---|
| R1 | YCloud está caído cuando hay alerta crítica → no notifica | Media | Alta (founder no se entera) | `sendWhatsAppAlert` persiste `notification_error` pero NO retira el row activo. **Próximo cron run (5 min después) intenta de nuevo automáticamente** (porque el row activo no notificado → `shouldNotify=true` en `dedupeAndPersist`). Retry implícito cada 5 min hasta éxito o hasta dedupe 1h. Documentar en código que `notification_sent` controla retries. |
| R2 | Vercel Cron no se ejecuta (cuenta degradada, plan cambiado, deploy roto, vercel.json mal formado) → silencio total, founder cree "todo OK" | Media | Crítica | **Meta-monitoring**: cada vez que un cron handler corre exitoso, hace `INSERT into alerts_log` con `alert_key='cron_heartbeat'` (status='resolved', no notifica). En `/master/salud` (futura sección OBS-2 follow-up) mostrar "último cron run: hace X min" en rojo si > 15 min. **V1 mitigación rápida:** founder mira Vercel dashboard → Cron tab → "Recent runs" después del deploy y verifica que corre cada 5 min. |
| R3 | Loop infinito de alertas: bug en `evaluate` siempre devuelve `broken` → 100s de WhatsApp en 1 hora | Baja | Crítica | Hard limit `isRateLimited()` corta a > 10 sends/hora. Persiste rows con `notification_error='rate_limit_exceeded'`. Founder ve en logs que pasó. |
| R4 | Vercel plan Hobby no admite cadencia 5 min → cron nunca corre | Alta si founder en Hobby | Crítica | Confirmar plan con founder **ANTES** de mergear. Si Hobby, fallback documentado a Supabase pg_cron (§3.6 plan B). |
| R5 | RLS bypass leak: `alerts_log` queda visible a non-master por bug | Baja | Media | RLS declarada `is_master() only` en SELECT. INSERT/UPDATE/DELETE sin policy → solo service_role (que bypassa). Probar T-RLS en §8. |
| R6 | Race condition entre 2 cron runs si Vercel cambia comportamiento single-run | Baja | Baja | V1 sin lock. Documentado. Si pasa → envolver `dedupeAndPersist` en transacción con `SELECT ... FOR UPDATE` sobre la última row del key. |
| R7 | N8N API inaccesible → trigger `n8n_inactive` marca "skip" → si workflow realmente cae al mismo tiempo, no detectamos | Baja-Media | Media | Decisión consciente §6.2: NO alertar por "N8N API inaccesible" en V1 (causa falsos positivos por glitches transitorios de EasyPanel). Trade-off: si N8N API muere por > 1h estamos ciegos. Mitigación futura: trigger separado `n8n_api_unreachable` que alerte después de 3 chequeos consecutivos. |
| R8 | El founder mete texto en el composer YCloud y el bot lo responde como lead | Baja (founder no responde alertas) | Baja | Documentado §3.5. V2 hace gate explícito en `ycloud-webhook`. |
| R9 | `ALERT_RECIPIENT_PHONE` o `CRON_SECRET` faltantes en Vercel → silencio total | Media | Crítica | Defensa código: handler devuelve 401 si `CRON_SECRET` falta; dispatcher persiste alerta con `notification_error='no_recipient_configured'` si `ALERT_RECIPIENT_PHONE` falta. Founder agrega ambas en Vercel ANTES de merge. Test T-env en §8. |
| R10 | `agency_channels` no tiene fila con `is_active=true` → `resolveSenderPhone` devuelve null → notificación falla con `no_sender_available` | Baja en producción (hay una agency activa) | Media | Persiste `notification_error`. Founder ve fila en `alerts_log` y entiende qué pasa. Recomendar `ALERT_SENDER_PHONE` env var como override seguro si quiere desacoplar del lookup. |
| R11 | Cache de `unstable_cache` / `fetch.next.revalidate` en los módulos health/* sirve estado viejo al cron → trigger no detecta cambio reciente | Baja | Media | n8n.ts cachea 30s, edge-functions.ts 60s. Cron corre cada 5 min, suficientemente espaciado. Si en debug se ve drift, agregar `fetch(..., { next: { revalidate: 0 } })` específico para el path del cron — pero por ahora compartimos la lectura cacheada con el page (es feature, no bug). |

---

## 8. Plan de testing (founder + builder antes de PR + en preview)

### 8.1 Setup local

1. En `crm-v2/.env.local`, agregar:
   ```
   ALERT_RECIPIENT_PHONE=+50688217229    # número del founder
   CRON_SECRET=local-dev-secret-12345    # cualquier string en dev
   ALERT_SENDER_PHONE=                   # vacío → fallback a agency_channels
   ```
2. Correr la migration:
   ```
   cd crm-v2
   npx supabase db push   # o psql directo al schema
   ```
3. `pnpm dev` (o `npm run dev`).

### 8.2 Tests funcionales

**T-auth (gate del handler):**
- `curl http://localhost:3000/api/cron/check-infra` → 401.
- `curl -H "Authorization: Bearer wrong" http://localhost:3000/api/cron/check-infra` → 401.
- `curl -H "Authorization: Bearer local-dev-secret-12345" http://localhost:3000/api/cron/check-infra` → 200 con JSON summary.

**T1 (N8N down):**
1. Apagar workflow `bot-c v1` desde N8N UI (toggle off).
2. `node scripts/test-cron.mjs check-infra`
3. ✅ Llega WhatsApp `[ALERTA] Workflow N8N apagado` al founder.
4. `node scripts/test-cron.mjs check-infra` (corrida 2)
5. ✅ NO llega segunda alerta (dedupe 1h). En logs ver `notificationSent: false` para esta corrida.
6. Re-activar el workflow desde N8N UI.
7. `node scripts/test-cron.mjs check-infra`
8. ✅ Llega WhatsApp `[OK] Workflow N8N activo de nuevo` con `Tiempo abajo: X min`.

**T2 (edge fn down — simulación):**
- Vercel Cron NO permite simular caída real de edge function trivialmente.
- **Workaround dev:** modificar temporalmente `src/lib/health/edge-functions.ts` línea `if (!res.ok)` → forzar `return { name, ..., reachable: false, error: 'simulated' }`.
- Correr `test-cron.mjs check-infra` dos veces seguidas con > 30s entre cada (simular 2 chequeos consecutivos).
- ✅ Primera corrida: NO alerta (failureCount=1, esperando confirmación).
- ✅ Segunda corrida: alerta `[ALERTA] Edge function bot-actions no responde`.
- Revertir el mock. Tercera corrida: recovery `[OK]`.

**T3 (bot errors high):**
1. En Supabase Studio SQL editor:
   ```sql
   INSERT INTO bot_turns (trace_id, agency_id, started_at, status, arch, error_msg)
   SELECT gen_random_uuid(), (SELECT id FROM agencies LIMIT 1), now(), 'failed', 'A', 'test'
   FROM generate_series(1, 6);
   ```
2. `node scripts/test-cron.mjs check-bot-errors`
3. ✅ Llega WhatsApp `[ALERTA] Tasa de errores del bot alta — Errores última hora: 6`.
4. Borrar los rows test:
   ```sql
   DELETE FROM bot_turns WHERE error_msg = 'test' AND started_at > now() - interval '5 minutes';
   ```
5. `node scripts/test-cron.mjs check-bot-errors`
6. ✅ Llega WhatsApp `[OK] Tasa de errores del bot normalizada — Errores última hora: 0`.

**T-dedupe (T1 dos veces seguidas):**
1. Apagar workflow N8N.
2. Correr cron 6 veces seguidas (simular 6 ejecuciones de cada 5 min en un loop).
3. ✅ Solo la primera manda WhatsApp. Las 5 siguientes incrementan `last_seen_at` sin notificar.
4. Esperar 1h (o manualmente UPDATE el `triggered_at` a `now() - interval '70 minutes'`).
5. Correr cron de nuevo con workflow aún apagado.
6. ✅ Manda nueva alerta (la anterior se considera "vieja" según dedupe window 1h).

**T-rate-limit (loop infinito simulado):**
1. Hacer 11 INSERTs manuales en `alerts_log` con `notification_sent_at = now()`.
2. Disparar cualquier trigger broken.
3. ✅ La 11ma alert tiene `notificationSent: false, error: 'rate_limit_exceeded'`. Row persistido con `notification_error='rate_limit_exceeded'`.

**T-RLS (no leak):**
1. Loguearse como user normal (no master).
2. En SQL editor con ese user: `SELECT * FROM alerts_log` → 0 rows.
3. Loguearse como master: `SELECT * FROM alerts_log` → N rows.

**T-env (var faltante):**
1. Comentar `ALERT_RECIPIENT_PHONE` en `.env.local`. Reiniciar dev.
2. Apagar workflow. Correr cron.
3. ✅ Row insertado en `alerts_log` con `notification_error='no_recipient_configured'`. NO se envía nada.

### 8.3 Deploy a Vercel

1. Crear branch `feat/obs-2-alertas-push`.
2. PR sobre `main`. Vercel genera preview URL.
3. En Vercel Project Settings → Environment Variables, agregar a Production+Preview+Development:
   - `ALERT_RECIPIENT_PHONE` = `+50688217229`
   - `CRON_SECRET` = generar con `openssl rand -hex 32` (o `Get-Random` PowerShell con stringify)
   - `ALERT_SENDER_PHONE` = (opcional, dejar vacío si ya hay agency activa)
4. Confirmar que plan Vercel es **Pro** (cadencia 5 min requiere).
5. Re-trigger deploy del preview (las env vars no se hot-reload).
6. **En preview, dispar cron manual** desde Vercel dashboard → Crons tab → click "Run now" en `/api/cron/check-infra` y `/api/cron/check-bot-errors`. ✅ verificar logs runtime + ausencia de WhatsApp si todo está OK.
7. Probar T1 en preview (apagar workflow → esperar próximo cron natural cada 5 min, o disparar manual).
8. Si T1 pasa en preview → merge a main.

### 8.4 Smoke test post-merge en producción

1. Esperar 5-10 min después del merge.
2. Founder verifica en Vercel dashboard → Crons → últimas runs de los 2 jobs, status 200 cada uno.
3. Apagar el workflow desde N8N (con cuidado — esto va a generar alerta real). En < 5 min llega WhatsApp.
4. Re-activar → en < 5 min llega recovery.
5. Documentar handoff a sí mismo: "este es el flujo de producción".

---

## 9. Trade-offs y alternativas descartadas

| Decisión tomada | Alternativa descartada | Por qué |
|---|---|---|
| YCloud al WhatsApp del founder | Telegram bot + chat ID | Cero infra nueva. Founder vive en WhatsApp. Trade-off: thread del bot acumula alertas operativas con el chat del founder |
| Vercel Cron | Supabase pg_cron / Inngest / QStash | Atado al deploy, mismo provider, lógica en TS reusando módulos. Trade-off: requiere plan Pro ($20) |
| `alerts_log` con `alert_key` text + jsonb payload | Tabla específica por trigger | Aditiva: nuevos triggers V2 no requieren migration. Trade-off: validación de shape en código, no en DB |
| Hard limit 10 alerts/h | Throttle por trigger key (max 3 por key/h) | Más simple. Trade-off: un trigger ruidoso puede consumir todo el budget — V2 considerar throttle por key |
| 2 chequeos consecutivos para edge fn | 1 chequeo + alertar inmediato | Evita false positives por cold start de Deno (común tras inactividad). Trade-off: 5 min de latencia adicional para detectar caída real |
| Reutilizar módulos `lib/health/*` con su cache 30-60s | Path separado sin cache | Single source of truth (panel y cron leen lo mismo). Trade-off: el cron puede ver estado hasta 30s viejo, irrelevante para cadencia 5 min |
| `runTriggerCycle` en `dispatcher.ts` (coordinador) | Lógica inline en cada route handler | Testeable, DRY entre los 2 handlers. Builder puede testear `runTriggerCycle` con stubs sin levantar Next |
| `bot_errors_high` con threshold > 5 errores/h | Threshold por tasa (`errors / total > 0.1`) | Simpleza V1. En tráfico bajo (50 turnos/día) un threshold absoluto basta. V2: si volumen crece, refactor a tasa |
| `formatAlertMessage` hard-coded en cada trigger | Template engine | 3 triggers solo. Overkill un engine. Refactor cuando lleguemos a 10+ |
| Dedupe via query a DB cada vez | Cache in-memory en el dispatcher | Vercel functions son stateless: in-memory no sobrevive entre invocations. DB es la única opción correcta |
| Sin tabla de "trigger definitions" en DB | Definiciones declarativas en código | Cambios de threshold requieren PR + deploy — bueno V1 (auditable, no hay UI). V2 podría hacer config dinámica |

---

## 10. Costo estimado mensual

**Vercel Pro:** **$20/mes** (cubre los cron jobs + límite de invocations holgado).

**Vercel function invocations:**
- `/api/cron/check-infra` cada 5 min = 8,640/mes.
- `/api/cron/check-bot-errors` cada 15 min = 2,880/mes.
- Total: ~11,500/mes. Plan Pro incluye 1M+ invocations → trivial.

**Vercel bandwidth:** cada cron run hace ~3 fetches externos (N8N + 2 edge fns) + 1 query Postgres. Bytes negligibles.

**YCloud:** mensajes WhatsApp salientes. Volumen esperado:
- Happy path: 0 alertas/día → \$0.
- Worst case realista (deploy con bug que tira workflow 1x/semana + recovery): ~ 8 mensajes/mes.
- Hard limit 10/hora = 7,200 mensajes/mes max (catastrófico, no debería pasar).
- Costo YCloud per WhatsApp Business marketing/utility en CR: ~ $0.005-0.05/mensaje según categoría. Conservador: 8 mensajes × $0.05 = **$0.40/mes**.

**Supabase:**
- Migración 0020: una tabla pequeña con índices. Storage incremental: < 1MB/año.
- Queries del cron: 1 SELECT count + 1 SELECT recent + 1 INSERT por trigger, cada 5/15 min. Total: ~10,000 queries/mes. Trivial.
- **$0 incremental.**

**Costo total mensual incremental:** **~$20** (Vercel Pro upgrade). YCloud y Supabase son ruido.

A 1,000 usuarios: igual (~$20). A 10,000: igual (~$20 — los cron son fijos, no escalan con usuarios). El sistema NO crece linealmente con tráfico; crece con # de triggers.

---

## 11. Trabajo NO incluido (next phases)

**OBS-2.5 — UI "Alertas activas" en `/master/salud`:**
- Nueva sección al final del dashboard que lista rows de `alerts_log` con `status='active'`.
- Botón "Marcar como resuelto manual" (UPDATE status='resolved' sin notificación).
- Filtro por severity.
- Cost: trivial (1 query + tabla, sin componente parcial nuevo).

**OBS-3 — más triggers + severity:**
- Tasa de handoffs alta (> 50% conversations en 1h).
- Latencia bot p95 > 10s.
- Workflow N8N con > 3 executions con `status='error'` en última hora.
- Severity `warning` (mensaje sin grito, ej. "atención: latencias elevadas").

**OBS-4 — silencio horario y multi-recipient:**
- No mandar alertas `warning` entre 22:00 y 7:00 CR (críticas SIEMPRE se mandan).
- Lista de teléfonos (futuros co-founders, ops team).
- Snooze por key ("no me molestes con bot_errors_high por 2h").

**OBS-5 — Status page público:**
- `/status` con uptime histórico (computado desde `alerts_log`).

---

## 12. Checklist pre-PR (que el builder marca antes de pedir review)

- [ ] Migration `0020_alerts_log.sql` aplicada en dev (verificado con `\d alerts_log` en psql)
- [ ] `is_master()` policy probada: SELECT con user normal devuelve 0 rows
- [ ] Todos los archivos nuevos compilados sin errors (`pnpm tsc --noEmit`)
- [ ] Route handlers responden 401 sin Authorization header (curl)
- [ ] Route handlers responden 200 con Bearer correcto (curl)
- [ ] `runTriggerCycle` se invoca para los 3 triggers en `check-infra` y para el 1 en `check-bot-errors`
- [ ] `sendWhatsAppText` reusa el patrón YCloud del v1 (no inventar shape)
- [ ] `resolveSenderPhone` cae a `agency_channels` cuando falta env var
- [ ] Hard limit `isRateLimited()` cuenta sends última hora correctamente
- [ ] Recovery alerts se envían SIEMPRE (no se dedupean)
- [ ] T-dedupe: 2 corridas consecutivas no spamean
- [ ] T-rate-limit: 11ma alert se persiste con `notification_error='rate_limit_exceeded'` y NO se envía
- [ ] T-env: sin `ALERT_RECIPIENT_PHONE` el row se persiste con error apropiado
- [ ] T-RLS: alerts_log no leakea a non-master
- [ ] Module `src/lib/health/*` NO modificado (verificar con `git diff src/lib/health/`)
- [ ] `vercel.json` validado contra schema oficial
- [ ] `.env.example` actualizado con sección "OBS-2 — alertas push WhatsApp"
- [ ] Founder confirmó **plan Vercel Pro** activo
- [ ] Env vars en Vercel Production+Preview+Development antes del merge
- [ ] Builder NO usó `unstable_cache` en código nuevo (Next 16 — leer `node_modules/next/dist/docs/` antes)
- [ ] Logs estructurados en cada cron handler (formato `[cron/<name>] {...json}`)

---

## 13. Handoff a builders

**backend-builder (esta sub-fase es 100% backend, sin frontend):**
- Implementa los 9 archivos nuevos de §5.1 + edita `.env.example`.
- Reusa SIN modificar los módulos `src/lib/health/*` y el contrato YCloud de `src/app/a/[slug]/inbox/actions.ts`.
- Sigue las firmas y skeletons declarados en §6 textualmente (especialmente `runTriggerCycle` — es el coordinador crítico).
- Si encuentra que el plan Vercel del founder es Hobby → STOP, abrir issue, no mergear.
- Si encuentra que `agency_channels` está vacío en la base destino → STOP, pedir al founder configurar al menos un canal antes de mergear (o setear `ALERT_SENDER_PHONE` en env).
- Para Next 16 specifics (route handlers, runtime, dynamic), leer `node_modules/next/dist/docs/app-router/...` antes de codear (regla AGENTS.md).
- **NO crear UI** — esta sub-fase deliberadamente no toca `master-shell.tsx` ni `/master/salud/page.tsx`. La UI de "Alertas activas" es OBS-2.5.

**Quien revise (founder o code-reviewer):**
- Verificar checklist §12 punto por punto.
- Probar T-auth, T1, T-dedupe, T-env en localhost antes de aprobar PR.
- Verificar Vercel Pro activo antes de mergear a main.
- Confirmar que las env vars (`ALERT_RECIPIENT_PHONE`, `CRON_SECRET`) están en Vercel ANTES del merge.

---

## 14. Descubrimientos del audit que afectan la spec

**Resumen para el founder (lo que cambió respecto al prompt inicial):**

1. **No existe wrapper YCloud en edge functions.** El único path activo es `src/app/a/[slug]/inbox/actions.ts:sendMessageViaYCloud`. Por eso creamos `src/lib/alerts/ycloud-client.ts` como wrapper reducido en vez de reusar `bot-actions/index.ts` (que solo tiene HEALTH endpoint, no es un sender). Esto es lo correcto: separar blast radius entre "envío del bot al lead" y "envío operativo al founder".

2. **No existe `vercel.json` en `crm-v2/`.** Lo creamos limpio en esta sub-fase, sin riesgo de pisar config previo.

3. **Vercel Cron necesita plan Pro** para cadencia 5 min. El plan Hobby solo admite cron diario (cadencia mínima 24h). **Confirmar con founder ANTES de mergear** — si responde "Hobby", fallback documentado en §3.6 a Supabase pg_cron (no implementado este sprint).

4. **El sender phone (`from`)** se resuelve por defecto desde `agency_channels` (primera activa con canal whatsapp). Si en la base no hay agency con canal activo, falla con `notification_error='no_sender_available'`. **Mitigación recomendada:** founder setea `ALERT_SENDER_PHONE` env var en Vercel como override seguro y desacoplado.

5. **El edge function trigger requiere 2 chequeos consecutivos antes de alertar** (vs prompt que decía implícitamente "1 chequeo"). Esto se modeló como mini state machine dentro de `dedupeAndPersist` con `payload.failureCount`. Evita falsos positivos por cold start (común tras inactividad).

6. **El trigger N8N inactive hace "skip" cuando N8N API es inaccesible** (no alerta). Decisión consciente: distinguir "workflow apagado intencionalmente" de "EasyPanel transitoriamente caído". Trade-off documentado en R7 — si N8N API muere por > 1h estamos ciegos. Mitigación futura: trigger separado `n8n_api_unreachable`.

7. **`bot_turns` ya tiene los índices necesarios.** El query `count WHERE status IN ('failed','partial') AND started_at > now()-1h` corre rápido en V1 sin migration adicional. Documentado follow-up para 3+ meses post-launch.

8. **El módulo `src/lib/health/n8n.ts` cachea fetches 30s** (decisión OBS-1). Esto es **feature, no bug** para el cron — reduce hits a N8N API. Si en algún momento el cron necesita lectura no cacheada, agregar `next.revalidate: 0` específico — pero por ahora compartir el cache es lo correcto.

---

**Fin de la spec.**
