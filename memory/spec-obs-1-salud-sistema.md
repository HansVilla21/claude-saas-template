# Spec: OBS-1 — Dashboard de salud del sistema (master)

**Fecha:** 2026-06-04
**Autor:** arquitecto
**Bloque:** 4 (Producción segura) — sub-fase 1 de N (OBS-1).
**Trigger:** lanzamiento de Meta Ads la semana del 2026-06-08. Antes de empujar tráfico real al embudo, el founder necesita un panel master que le diga en 1 vistazo si el pipeline (N8N + edge functions + YCloud + Postgres + audit_log) está sano.
**Spec hermana posterior:** OBS-2 — alertas push (Telegram/email) sobre los mismos signals. Fuera de scope de OBS-1.
**Ruta:** `/master/salud` — gated por `requireMaster()`, item nuevo del sidebar `MasterShell`.

---

## 0. Resumen ejecutivo

OBS-1 entrega una **page server-side `/master/salud`** que agrega 5 bloques de salud del sistema en una sola vista mobile-first. Cada bloque tiene su propia data-source, su propia política de cache y su propio degradación (si la fuente está caída, el bloque muestra warning sin tirar abajo la página).

**Bloques (orden vertical en mobile, grid 2-col en desktop ≥ md):**
1. **N8N workflow `bot-c v1`** — active/inactive, última ejecución exitosa, últimas 10 ejecuciones con status.
2. **Últimos 50 turnos del bot** — tabla compacta sobre `bot_turns` con filtros (errores / agencia / ventana de tiempo).
3. **Healthcheck de edge functions** — ping a `bot-actions` y `ycloud-webhook` (ya tienen endpoint GET healthcheck — confirmado).
4. **Healthcheck YCloud (canal WhatsApp)** — último mensaje inbound + outbound (de `messages`), flag amarillo si silencio en horario hábil.
5. **Contadores 24h** — inbound, outbound, handoffs nuevos, errores en `bot_turns`, leads nuevos.

**Hallazgos del audit pre-spec (importantes para no inventar):**

- ✅ `bot_turns` (no `audit_log` — el founder usó el nombre coloquial) existe desde migración **0015** (`bot_observability.sql`). Tiene todos los campos requeridos: `trace_id`, `agency_id`, `lead_id`, `started_at`, `finished_at`, `latency_total_ms`, `tools_invocadas` (jsonb array), `status` ('running'|'done'|'failed'|'partial' tras 0016), `error_msg`, `arch`, `system_prompt_hash`, `schema_version_hash`, `extractor_output_json`, etc.
- ✅ Índices necesarios YA existen: `idx_bot_turns_agency_started`, `idx_bot_turns_lead_started`, `idx_bot_turns_status_running`, `idx_bot_turns_arch_started`. **No falta nada para OBS-1.** El único índice que podría ayudar en queries cross-agency por timestamp puro es `(started_at desc)` global, pero los primeros queries de OBS-1 filtran por window de tiempo y los index existentes con `agency_id` first sirven bien (la query master usa SELECT bypass de RLS via `is_master()` y Postgres puede hacer index-only scan sobre `idx_bot_turns_status_running` cuando filtramos errores). **Migración nueva: no se requiere para V1.** (Se documenta como possible follow-up si los queries cross-agency se vuelven lentos a >100k filas.)
- ✅ Ambas edge functions (`bot-actions/index.ts` línea 1575-1584, `ycloud-webhook/index.ts` línea 904-915) **ya implementan healthcheck GET** que devuelve `{ status, function, version, secret_configured }`. **No hay que agregarlos.** Solo hay que consumirlos.
- ✅ El cliente HTTP a la API N8N ya está probado en `crm-v2/scripts/n8n-pull.mjs`: header `X-N8N-API-KEY`, host por env var `N8N_HOST` (default `n8n-n8n.v5qn6d.easypanel.host`), endpoint `GET /api/v1/workflows/{id}` y `GET /api/v1/executions?workflowId={id}&limit=N`. **El patrón existe** pero solo en scripts CLI — hay que portarlo a `src/lib/health/n8n.ts` como módulo server-only.
- ⚠️ `N8N_API_KEY` y `N8N_HOST` **NO están en `.env.example`** todavía (sólo viven en `.env` local del founder para los scripts). **OBS-1 los agrega al `.env.example`** y los lista en la guía de deploy para Vercel.
- ✅ El patrón de `_actions` server actions del master ya existe (`agencies-metrics.ts`) — OBS-1 sigue el mismo split: `_actions/health.ts` separado por blast radius pequeño.

**Versiones resultantes:**
- Frontend: `crm-v2/src/app/master/salud/page.tsx` + 5 componentes parciales.
- Backend: 3 módulos en `src/lib/health/` + 1 server actions file + 1 nuevo item en `MasterShell` NAV.
- **Sin migraciones nuevas.**
- **Sin cambios en edge functions.**
- **Sin cambios en N8N.**

**Riesgo crítico mitigado:** la página NO debe morir si N8N está caído. Cada bloque maneja su error con `try/catch` y renderiza estado "caído" en su card. Detalle en §3 y §7.

---

## 1. Problema / requerimiento

El founder lanza Meta Ads el 2026-06-08. Hoy, si **algo se rompe** en el pipeline (workflow N8N apagado por un PUT que falla, edge function `bot-actions` con secret mal seteado tras un deploy, número WhatsApp caído en YCloud, latencias subiendo silenciosamente, tasa de errores en `bot_turns` aumentando), **no se entera hasta que un lead se queja o hasta que mira por casualidad las tablas crudas en Supabase Studio**.

Necesita una página de **1 sola vista, mobile-first, que abre en el celular en el café**, que le diga:

- ¿El workflow N8N está prendido? ¿Cuándo corrió bien la última vez? ¿Hubo errores recientes?
- ¿Los últimos turnos del bot terminaron OK o están fallando?
- ¿Las edge functions responden? ¿Con qué latencia?
- ¿Llegan/salen mensajes por WhatsApp?
- ¿Cuánto volumen movimos hoy?

OBS-1 NO incluye:
- **Alertas push** (Telegram, email cuando algo cae) → eso es OBS-2.
- **Auto-refresh / realtime de la página** → decisión documentada en §4: V1 SIN realtime, sólo botón manual "refrescar" + Server-side fresh-on-navigate.
- **Histogramas / gráficos de latencia por percentil** → OBS-3.
- **Drill-down detallado de un turno individual** → OBS-3 (linkeable, pero el visor full lo dejamos para más adelante).

---

## 2. Estado actual relevante (auditado código por código)

### 2.1 Tabla `bot_turns` (migración 0015 + 0016)

**Schema (confirmado leyendo 0015_bot_observability.sql líneas 19-50):**

```
public.bot_turns (
  id                              uuid PK
  trace_id                        uuid UNIQUE
  agency_id                       uuid → agencies(id)
  lead_id                         uuid → leads(id) nullable
  conversation_id                 uuid → conversations(id) nullable
  started_at                      timestamptz NOT NULL default now()
  finished_at                     timestamptz nullable
  arch                            text NOT NULL default 'A'  (CHECK A|C|eval-A|eval-C)
  model                           text
  tokens_in / tokens_out / tokens_cached  int
  latency_total_ms                int
  latency_per_node                jsonb default '{}'
  system_prompt_hash              text
  system_prompt_excerpt           text
  tools_invocadas                 jsonb default '[]'
  tools_no_invocadas_evaluables   jsonb default '[]'
  extractor_output_json           jsonb
  schema_version_hash             text
  input_crudo                     text
  output_crudo                    text
  status                          text default 'running' (CHECK running|done|failed|partial)
  error_msg                       text
  metadata                        jsonb default '{}'
  created_at / updated_at         timestamptz
)
```

**Índices (ya existentes):**
- `idx_bot_turns_agency_started (agency_id, started_at desc)` — usado por queries por agencia.
- `idx_bot_turns_lead_started (lead_id, started_at desc) WHERE lead_id IS NOT NULL` — drill-down futuro.
- `idx_bot_turns_status_running (started_at desc) WHERE status = 'running'` — turnos colgados.
- `idx_bot_turns_arch_started (arch, started_at desc)` — comparativa A vs C.

**RLS:** `bot_turns_select` permite SELECT a `is_master()` OR `is_member_of(agency_id)`. **Master ve todo cross-tenant.** ✅

**Confirmación del founder vs realidad:** el founder llamó "audit_log" a esta tabla. **Es `bot_turns`.** Toda la spec usa el nombre correcto. Sus 3 campos clave (`trace_id`, `extractor_prompt_used`, `schema_version_hash`) se mapean a `bot_turns.trace_id`, `bot_turns.system_prompt_excerpt` o `system_prompt_hash`, y `bot_turns.schema_version_hash`.

### 2.2 Edge functions — healthcheck endpoints (ya existentes)

**`bot-actions/index.ts` líneas 1575-1584:**
```
Deno.serve(async (req: Request) => {
  if (req.method === "GET") {
    return jsonResponse({
      status: "ok",
      function: "bot-actions",
      version: FN_VERSION,                          // "0.6.0" hoy
      secret_configured: BOT_ACTIONS_SECRET.length > 0,
    });
  }
  // ... el POST normal
});
```

**`ycloud-webhook/index.ts` líneas 904-915:** mismo patrón, devuelve `{ status, function: "ycloud-webhook", version: "1.0.0", secret_configured }`.

**Implicación:** OBS-1 NO requiere modificar edge functions. El módulo `src/lib/health/edge-functions.ts` hace `fetch(GET)` a `${SUPABASE_URL}/functions/v1/bot-actions` y `${SUPABASE_URL}/functions/v1/ycloud-webhook`. Espera JSON con `status: "ok"`, mide latencia con `performance.now()`.

**Auth:** ambos endpoints tienen `verify_jwt = false` en `supabase/config.toml` (asumido — ya están en producción accesibles sin auth, lo verifica el builder antes de codear). Si el `GET` requiere JWT, el ping desde server-side Vercel manda `Authorization: Bearer ${SUPABASE_ANON_KEY}` (anon key alcanza, no se necesita service_role para un healthcheck).

### 2.3 API N8N (cliente existente en script CLI)

**`crm-v2/scripts/n8n-pull.mjs`** documenta el patrón:
- Host: `process.env.N8N_HOST` o default `n8n-n8n.v5qn6d.easypanel.host`.
- Auth: header `X-N8N-API-KEY: ${process.env.N8N_API_KEY}`.
- Endpoint workflow: `GET https://${HOST}/api/v1/workflows/${id}` → devuelve `{ id, name, active, nodes, versionId, updatedAt, ... }`.

**Endpoints adicionales que OBS-1 usa (estándar N8N API v1, documentados en n8n docs):**
- `GET /api/v1/executions?workflowId={id}&limit=10` → array de executions con `{ id, finished, mode, retryOf, retrySuccessId, startedAt, stoppedAt, workflowId, status }`.
  - `status` puede ser `success`, `error`, `running`, `waiting`, `crashed`, `canceled`.
  - La "última exitosa" = primera del array filtrada por `status === 'success'` (la API ya viene ordenada DESC por startedAt).
- Opcional: `GET /api/v1/executions/{id}` para drill-down — fuera de scope V1.

**Workflow target:** id `Jsh4krhC9HRUh7Ly` (workflow `bot-c v1` LIVE). Hardcodeado por env var `N8N_BOT_WORKFLOW_ID` para no quemar el id en código y permitir cambiarlo cuando promovamos `bot-c v2`.

### 2.4 Pattern de page server-side master + `_actions`

**Referencia:** `/master/page.tsx` (dashboard root) hace `Promise.all([getMasterDashboardCounters(), listAgenciesResume()])` y pasa resultados a componentes client. Mismo patrón en `/master/clientes/[slug]/page.tsx`.

**OBS-1 sigue idéntico patrón.** El page server component hace `Promise.allSettled` (no `Promise.all` — porque queremos que un bloque caído no tire la página) y pasa cada resultado a un componente parcial.

### 2.5 MasterShell NAV (cómo se agrega item)

**`master-shell.tsx` líneas 20-23:**
```
const NAV: NavItem[] = [
  { href: '/master', label: 'Dashboard', icon: ChartLineUp, exact: true },
  { href: '/master/clientes', label: 'Clientes', icon: Buildings },
];
```

**OBS-1 agrega:**
```
{ href: '/master/salud', label: 'Salud del sistema', icon: Heartbeat },
```
(Phosphor icon name: `Heartbeat` — confirmar import `@phosphor-icons/react/dist/ssr`. Alternativa: `Pulse`, `Activity`, `Lifebuoy`.)

---

## 3. Decisiones técnicas

### 3.1 Page server-side con `Promise.allSettled` por bloque

**Decisión:** **una sola page server component** que dispara 5 fetches en paralelo con `Promise.allSettled`, y pasa cada resultado individual (success/error) a un componente parcial. NO usar Suspense streaming por bloque.

**Por qué no Suspense + 5 server components anidados:**
- La página es chica (5 bloques). El streaming agrega complejidad sin ganancia perceptible — todas las fuentes responden en < 2s en condiciones normales (Supabase < 200ms, edge function ping < 500ms, N8N API ~ 300-800ms).
- El founder abre la página, espera ~1s, ve todo. Esto es preferible a ver bloques que aparecen en cascada (UX inferior en este caso de uso).
- Si una fuente está caída, queremos timeout corto (3-5s) — más simple con `Promise.race` por fetch que con boundaries de Suspense individuales.

**Por qué `allSettled` y no `all`:**
- `Promise.all` rechaza apenas uno falla → la página entera se rompe.
- `Promise.allSettled` devuelve `{ status: 'fulfilled' | 'rejected', value | reason }` por cada → el page renderiza degradado en el bloque caído sin afectar al resto.

**Pseudo-código (NO es implementación, solo ilustra):**
```ts
const [n8n, turns, edges, ycloud, counters] = await Promise.allSettled([
  fetchN8nHealth({ workflowId: env.N8N_BOT_WORKFLOW_ID }),
  fetchRecentBotTurns({ limit: 50, filters: {...} }),
  fetchEdgeFunctionsHealth(),
  fetchYcloudHealth(),
  fetchCounters24h(),
]);
// Render: cada componente recibe { status, value?, error? }
```

### 3.2 Política de cache (revalidate por bloque)

**Decisión:**
- N8N health: **revalidate 30s** vía `unstable_cache` con tag `n8n-health`. La data cambia poco minuto a minuto, y la API N8N (self-hosted en EasyPanel) no debe ser martillada — 30s da fresh enough con bajo overhead.
- Edge functions ping: **revalidate 60s**. Los pings son baratos pero ya cacheados al máximo permitido para "fresh".
- `bot_turns` listing: **dynamic / no-store**. La tabla cambia por turno (cada mensaje del lead). Queremos siempre fresco. Es un único query Postgres con LIMIT 50 → trivial.
- YCloud health (último msg in/out): **dynamic / no-store**. Mismo razonamiento — query Postgres trivial.
- Contadores 24h: **revalidate 60s**. Counts son baratos pero no necesitan ser segundo-a-segundo.

**Botón "Refrescar":** un Server Action que llama `revalidateTag('n8n-health')` + `revalidateTag('edge-health')` + `revalidatePath('/master/salud')` y devuelve fresco todo. Botón en el header de la page, ícono `ArrowsClockwise` de Phosphor.

**Por qué no `cache()` de React (request-level):** `cache()` solo dedupa dentro de un mismo request. Acá queremos cache cross-request → `unstable_cache` (o futuro `cache()` con `'use cache'` cuando Next.js lo estabilice — pero hoy en Next 16 App Router seguimos con `unstable_cache`).

**Riesgo de `unstable_cache` en Next 16:** confirmar que `unstable_cache` siga existiendo. **Si Next 16 lo deprecó completamente**, fallback a `cache()` con `revalidate` en `export const revalidate = 30` por page-level fetch. El builder lo verifica antes de codear leyendo `node_modules/next/dist/docs/` (regla AGENTS.md del repo).

### 3.3 Acceso — gate master idéntico al resto de `/master/*`

**Decisión:** `requireMaster()` en el page + RLS de Postgres como segunda línea de defensa (las queries de `bot_turns` usan `createClient()` server-side que ya respeta RLS; `is_master()` deja pasar todo cross-tenant ✅).

**Para el N8N API y los pings de edge functions** NO hay RLS — usamos el `service_role` o las API keys correspondientes desde server-only. El gate `requireMaster()` corre ANTES de cualquier fetch external, garantizando que un usuario no-master nunca dispara estos pings.

### 3.4 Llamada a API N8N desde Vercel server-side

**Decisión:** módulo `src/lib/health/n8n.ts` con `server-only` import (impide bundle accidental al client). Usa `fetch` nativo con `signal: AbortSignal.timeout(5000)` (timeout 5s — N8N en EasyPanel puede tener cold starts cortos).

**Env vars que se agregan a `.env.example` (y a Vercel):**
```
# N8N self-hosted — usado por /master/salud para healthcheck del workflow del bot.
N8N_HOST=n8n-n8n.v5qn6d.easypanel.host
N8N_API_KEY=<paste-from-n8n-settings-api>
N8N_BOT_WORKFLOW_ID=Jsh4krhC9HRUh7Ly
```

**Guía de deploy de env vars a Vercel** (incluida en §8 — Plan de testing / deploy):
- En Vercel Project Settings → Environment Variables, agregar las 3 vars en scope `Production`, `Preview` y `Development`.
- Re-trigger deploy (push a la branch) para que las vars sean leídas en runtime.
- Sin las 3 vars, el bloque N8N renderiza "Configuración incompleta — falta `N8N_API_KEY`" en vez de crashear (defensa en `n8n.ts`).

### 3.5 Decisión: NO realtime en V1

**Decisión:** la página NO se suscribe a Broadcast Changes ni a postgres_changes (deprecated). Sólo refresca al recargar o al click en "Refrescar".

**Por qué:**
- El founder abre la página → mira → toma decisión → cierra. No deja la página abierta como dashboard live (eso es `/master` root + futuro OBS-2 con notificaciones).
- Realtime suma 1) channel de Supabase nuevo (canal master existe ya para inbox, pero filtrar `bot_turns` cross-agency desde el cliente requiere policy nueva), 2) consumo de quota Realtime, 3) complejidad de UI (animar updates).
- Si abrir y refrescar manual no le alcanza → upgrade a polling con `setInterval` o React Query con `refetchInterval` (decisión liviana V2).
- **OBS-2 va a empujar la info crítica vía push notification (Telegram), no vía realtime en la UI.** Esto cierra el caso de uso "me entero rápido cuando algo se rompe" sin necesidad de realtime.

### 3.6 Migration nueva — **no se requiere**

Auditado: índices existentes cubren los queries de OBS-1. No hay falta de columnas. **No se crea `0020_*.sql` para OBS-1.**

**Único caso que dispararía migration:** si el query "últimos 50 turnos cross-tenant" tarda > 1s a 100k filas. **Mitigación:** la query filtra por `started_at > now() - interval '7 days'` por default (ver §5.2), reduciendo el set a ~10-20k filas en pleno tráfico de Meta Ads → con `idx_bot_turns_status_running` y `idx_bot_turns_arch_started` Postgres encuentra el slice rápido. Si tras 30 días de Ads vemos que tarda → en OBS-3 agregar `CREATE INDEX idx_bot_turns_started_global ON bot_turns(started_at DESC)`.

---

## 4. Modelo de datos / RPCs

**No se crean RPCs nuevas.** Todas las queries son SELECTs directos sobre tablas existentes vía el cliente Supabase server-side (`createClient()`). RLS hace su trabajo (`is_master()` permite cross-tenant SELECT).

**Queries que OBS-1 ejecuta (escritas en TypeScript con el SupabaseClient — no SQL crudo):**

### 4.1 Últimos 50 turnos (con filtros)

```ts
supabase
  .from('bot_turns')
  .select(`
    id, trace_id, started_at, finished_at, latency_total_ms,
    status, error_msg, arch, agency_id, lead_id,
    tools_invocadas,
    agencies!inner ( slug, name )
  `)
  .gte('started_at', new Date(Date.now() - windowMs).toISOString())
  .order('started_at', { ascending: false })
  .limit(50);

// Filtro opcional onlyErrors:
//   .in('status', ['failed', 'partial'])
// Filtro opcional agency:
//   .eq('agency_id', filteredAgencyId)
```

**Nota sobre join `agencies!inner`:** trae `slug` y `name` para mostrar en la tabla sin hacer N+1. RLS de `agencies` también deja pasar a master, así que el join es legal.

### 4.2 Healthcheck YCloud — último msg in / out

```ts
// Último inbound (cualquier agencia, master ve cross-tenant)
supabase.from('messages')
  .select('id, created_at, agency_id')
  .eq('direction', 'inbound')
  .eq('channel', 'whatsapp')
  .order('created_at', { ascending: false }).limit(1).maybeSingle();

// Último outbound
supabase.from('messages')
  .select('id, created_at, agency_id, sender_kind')
  .eq('direction', 'outbound')
  .eq('channel', 'whatsapp')
  .order('created_at', { ascending: false }).limit(1).maybeSingle();
```

**Flag amarillo "silencio sospechoso":** si `lastInbound.created_at` < ahora - 4h **Y** estamos en horario hábil (Lun-Sáb 9-19 hora CR — hardcoded simple V1, NO consulta `bot_config` por simplicidad), pintar warning. Si es domingo o fuera de horario, no warning.

### 4.3 Contadores 24h

```ts
const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

// 5 queries en paralelo (todos count head: true exact)
Promise.all([
  supabase.from('messages').select('id', { count: 'exact', head: true })
    .gte('created_at', since).eq('direction', 'inbound').eq('channel', 'whatsapp'),
  supabase.from('messages').select('id', { count: 'exact', head: true })
    .gte('created_at', since).eq('direction', 'outbound').eq('channel', 'whatsapp'),
  supabase.from('conversations').select('id', { count: 'exact', head: true })
    .gte('updated_at', since).eq('handoff_status', 'pending'),
  supabase.from('bot_turns').select('id', { count: 'exact', head: true })
    .gte('started_at', since).in('status', ['failed', 'partial']),
  supabase.from('leads').select('id', { count: 'exact', head: true })
    .gte('created_at', since),
]);
```

**Nota sobre handoffs:** filtramos `handoff_status = 'pending'` para counter "handoffs pendientes hoy". Si el founder prefiere "handoffs nuevos hoy" (cualquier transición a pending), hay que loguear un `conversation_events` con `kind='handoff'` — alternativa más cara para V1. Empezamos con `pending count` y si el founder pide la otra métrica en review, ajustamos en sub-fase posterior.

### 4.4 N8N health (sin DB, sólo fetch externo)

```ts
const [workflowRes, executionsRes] = await Promise.allSettled([
  fetch(`https://${N8N_HOST}/api/v1/workflows/${N8N_BOT_WORKFLOW_ID}`, {
    headers: { 'X-N8N-API-KEY': N8N_API_KEY, accept: 'application/json' },
    signal: AbortSignal.timeout(5000),
  }),
  fetch(`https://${N8N_HOST}/api/v1/executions?workflowId=${N8N_BOT_WORKFLOW_ID}&limit=10`, {
    headers: { 'X-N8N-API-KEY': N8N_API_KEY, accept: 'application/json' },
    signal: AbortSignal.timeout(5000),
  }),
]);
```

**Output esperado del módulo `n8n.ts`:**
```ts
type N8nHealth = {
  configured: boolean;       // false si N8N_API_KEY/HOST/WORKFLOW_ID falta
  reachable: boolean;        // false si timeout o 5xx
  workflow: {
    id: string;
    name: string;
    active: boolean;
    updatedAt: string;
  } | null;
  executions: Array<{
    id: string;
    status: 'success' | 'error' | 'running' | 'waiting' | 'crashed' | 'canceled';
    startedAt: string;
    stoppedAt: string | null;
    finished: boolean;
    mode: string;             // 'webhook' | 'manual' | 'trigger' | ...
  }>;
  lastSuccessAt: string | null;  // derivado: primera execution con status='success'
  error?: string;                // mensaje human-friendly si reachable=false
};
```

### 4.5 Edge functions health

```ts
type EdgeFnHealth = {
  name: 'bot-actions' | 'ycloud-webhook';
  url: string;
  reachable: boolean;
  latencyMs: number | null;
  payload: { status: string; function: string; version: string; secret_configured: boolean } | null;
  error?: string;
};
```

Output del módulo: `Array<EdgeFnHealth>` con 2 elementos. Si una está caída, su entry tiene `reachable: false` + `error: 'timeout' | '5xx' | 'invalid_json'`.

---

## 5. Estructura de archivos a crear / modificar

### 5.1 Crear

| Archivo | Tipo | Responsabilidad |
|---|---|---|
| `crm-v2/src/app/master/salud/page.tsx` | Server Component | Entry. `requireMaster()` + `Promise.allSettled` de 5 fetches + render |
| `crm-v2/src/app/master/salud/_components/refresh-button.tsx` | Client | Botón "Refrescar" — wrappea Server Action que invalida tags |
| `crm-v2/src/app/master/salud/_components/n8n-health-card.tsx` | Server (parcial) | Render del bloque 1 |
| `crm-v2/src/app/master/salud/_components/recent-turns-table.tsx` | Server (parcial) | Render bloque 2 (recibe rows, filtros en query string) |
| `crm-v2/src/app/master/salud/_components/turn-status-pill.tsx` | Server (parcial) | Pill colored para status: done/failed/partial/running |
| `crm-v2/src/app/master/salud/_components/edge-fn-health-card.tsx` | Server (parcial) | Render bloque 3 |
| `crm-v2/src/app/master/salud/_components/ycloud-health-card.tsx` | Server (parcial) | Render bloque 4 |
| `crm-v2/src/app/master/salud/_components/counters-24h.tsx` | Server (parcial) | Render bloque 5 |
| `crm-v2/src/app/master/salud/_components/health-card-shell.tsx` | Server (parcial) | Wrapper común — header con título + status badge + body + slot opcional para acción |
| `crm-v2/src/app/master/salud/_actions/refresh.ts` | Server Action | `'use server'` → `revalidateTag('n8n-health')` + `revalidateTag('edge-health')` + `revalidatePath('/master/salud')` |
| `crm-v2/src/lib/health/n8n.ts` | server-only | Cliente N8N API. Export `fetchN8nHealth(): Promise<N8nHealth>`. Envuelve en `unstable_cache` con tag `n8n-health` (revalidate 30s) |
| `crm-v2/src/lib/health/edge-functions.ts` | server-only | Pings a las 2 edge functions. Export `fetchEdgeFunctionsHealth(): Promise<EdgeFnHealth[]>`. Cache 60s con tag `edge-health` |
| `crm-v2/src/lib/health/bot-turns.ts` | server-only | Query a `bot_turns` (últimos N + filtros). Export `fetchRecentBotTurns(opts)`. Sin cache (dynamic) |
| `crm-v2/src/lib/health/ycloud.ts` | server-only | Last in/out + flag silencio. Export `fetchYcloudHealth()`. Sin cache |
| `crm-v2/src/lib/health/counters.ts` | server-only | 5 counts en paralelo. Export `fetchCounters24h()`. Cache 60s con tag `counters-24h` |
| `crm-v2/src/lib/health/types.ts` | shared | Types: `N8nHealth`, `EdgeFnHealth`, `BotTurnRow`, `YcloudHealth`, `Counters24h` |

### 5.2 Modificar

| Archivo | Cambio |
|---|---|
| `crm-v2/src/app/master/_components/master-shell.tsx` | Agregar item NAV `{ href: '/master/salud', label: 'Salud del sistema', icon: Heartbeat }`. Import del icon |
| `crm-v2/.env.example` | Agregar 3 env vars N8N (sección nueva con comentario) |

### 5.3 No tocar (verificación)

- ❌ NO modificar `crm-v2/supabase/functions/bot-actions/index.ts` — el healthcheck ya existe.
- ❌ NO modificar `crm-v2/supabase/functions/ycloud-webhook/index.ts` — idem.
- ❌ NO modificar `crm-v2/supabase/migrations/` — no se requiere migration nueva.
- ❌ NO modificar el workflow N8N.

### 5.4 URL / query-string contract de `/master/salud`

Filtros del bloque "Recent turns" en query string (URL stateful — permite compartir vista):

| Query param | Tipo | Default | Valores |
|---|---|---|---|
| `errors` | bool | `false` | `1` / no presente |
| `window` | string | `24h` | `24h` / `7d` / `all` |
| `agency` | uuid o `all` | `all` | UUID de una agency o `all` |

Ejemplo: `/master/salud?errors=1&window=7d&agency=all`

El page lee `searchParams` (server component recibe `{ searchParams }` prop) y lo pasa al query.

---

## 6. UX / Layout (mobile-first, sigue el sistema de diseño existente)

**Filosofía visual:** consistente con `/master/page.tsx` (header con badge mono uppercase + h1 display + grid de cards bordeadas `border-line bg-surface`, accent terracota para íconos).

### 6.1 Header de la page (igual patrón que dashboard root)

```
[mono badge] PANEL MASTER
[h1 display] Salud del sistema
[p ink-soft] Estado del pipeline end-to-end. Actualizado [timestamp].
[botón Refrescar — top right en md+, debajo del p en mobile]
```

### 6.2 Grid de bloques

- **Mobile (< md):** stack vertical, 1 columna, padding `px-5 py-10`.
- **Tablet/Desktop (≥ md):** 2 columnas para los 4 "cards pequeñas" (N8N, edge fns, YCloud, counters). El bloque **Recent turns** es full-width abajo de todo (es una tabla — necesita ancho).

```
┌─────────────────────────────┬─────────────────────────────┐
│  Block 1: N8N health        │  Block 3: Edge fns health   │
├─────────────────────────────┼─────────────────────────────┤
│  Block 4: YCloud health     │  Block 5: Counters 24h      │
├─────────────────────────────┴─────────────────────────────┤
│  Block 2: Recent turns table (full-width)                 │
└───────────────────────────────────────────────────────────┘
```

En mobile, el orden vertical es: 1 → 3 → 4 → 5 → 2 (el listado de turnos al final porque es el más largo).

### 6.3 Diseño de cada bloque

**Bloque 1 — N8N workflow `bot-c v1`:**
```
[icon Robot] WORKFLOW N8N (mono uppercase muted)
[h3 display] bot-c v1
[badge grande pill]  ACTIVO / INACTIVO   (verde / rojo)
[p ink-soft] Última ejecución exitosa: hace 12 min
─────────────────────────────────
[mono uppercase muted] últimas 10 ejecuciones
[lista compacta]
  • [dot verde] success — hace 12 min
  • [dot verde] success — hace 18 min
  • [dot rojo]  error   — hace 25 min  [link al detalle*]
  ...
*el link drilldown queda fuera de scope V1 — solo dot+texto
```

**Estados degradados del bloque:**
- `configured=false` → card amarilla "Falta configurar `N8N_API_KEY` en variables de entorno" + link a doc interna (futuro).
- `reachable=false` → card roja "N8N no responde (timeout 5s). Revisar EasyPanel o status del workflow."
- `workflow.active=false` → pill rojo grande "INACTIVO" + texto "El workflow está apagado. Si esto es intencional ignorar, si no — reactivar desde N8N UI."

**Bloque 2 — Recent turns (tabla compacta):**
```
[icon ListBullets] ÚLTIMOS 50 TURNOS
[filtros: chips inline]
  [Solo errores]  [Ventana: 24h ▾]  [Agencia: Todas ▾]

[tabla — overflow-x-auto en mobile]
  Hora     | Agencia    | Lead     | Trace      | Latencia | Tools | Status
  hace 2m  | momentum   | Juan P.  | abcd-1234  | 3.4s     | 2     | DONE
  hace 5m  | momentum   | María L. | efgh-5678  | 8.1s     | 0     | FAILED
  ...

[footer] Mostrando 50 de 124 en la ventana. [link] ver más en SQL editor (futuro V2)
```

- `lead` linkeable a `/a/{agency_slug}/contactos/{lead_id}` (apertura nueva pestaña).
- `trace` es `trace_id.slice(0,8)` para no saturar; al hover mostrar tooltip con UUID full.
- `tools` count = `tools_invocadas.length`.
- Status pill colors: `done` = verde, `failed` = rojo, `partial` = amarillo, `running` = azul.

Mobile: la tabla se reformatea como "cards" verticales (lead encima, trace+latencia+status abajo) — patrón ya usado en `crm-v2` para listas de leads.

**Bloque 3 — Edge functions:**
```
[icon Lightning] EDGE FUNCTIONS
─────────────────────
bot-actions
  [dot verde] OK · v0.6.0 · 142ms · secret OK
ycloud-webhook
  [dot verde] OK · v1.0.0 · 98ms · secret OK
```

Si una está caída:
```
bot-actions
  [dot rojo] No responde · timeout 5s
```

**Bloque 4 — YCloud / WhatsApp:**
```
[icon WhatsappLogo] CANAL WHATSAPP (vía YCloud)
─────────────────────
Último mensaje recibido:  hace 4 min (agencia "momentum")
Último mensaje enviado:   hace 7 min (agencia "momentum")
[badge si silencio sospechoso] ⚠ Sin mensajes inbound hace > 4h en horario hábil
```

Sin botón hacia el dashboard YCloud (fuera de scope V1).

**Bloque 5 — Counters 24h:**
```
[icon ChartBar] ÚLTIMAS 24 HORAS
─────────────────────
3 columnas en desktop / 2 en mobile

  142          24            8
  Inbound      Outbound     Handoffs
  ↑12% vs ayer ...           ...

  47           3
  Leads nuevos Errores bot
  ...          ↑200% vs ayer ⚠
```

(Delta vs ayer es bonus — si encarece el query, lo dejamos para V2 y solo mostramos el número absoluto.)

### 6.4 Empty states

- "No hay ejecuciones recientes en el workflow" → bloque 1 muestra timeline vacío con copy "Cuando llegue el primer mensaje del lead, aparecerá acá."
- "No hay turnos en la ventana" → bloque 2 muestra empty card "Sin actividad del bot en las últimas 24h. Cambiá a ventana 7d para ver más historial."
- "Sin mensajes WhatsApp todavía" → bloque 4 muestra placeholder "Aún no hay tráfico WhatsApp en la plataforma."

### 6.5 Loading / Skeleton

El page es server-side → no hay skeleton inicial (Next.js renderiza ya con data). Si en el futuro decidimos refresh con `useTransition`, agregar skeleton por bloque.

---

## 7. Riesgos y mitigaciones

| # | Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|---|
| R1 | N8N API caída tira la página | Media | Alta (founder no puede ver nada) | `Promise.allSettled` + try/catch en `fetchN8nHealth` con timeout 5s. Block 1 renderiza estado "caído" sin afectar otros bloques |
| R2 | `N8N_API_KEY` no seteada en Vercel → 401 en todo deploy | Alta | Alta | `n8n.ts` chequea `if (!N8N_API_KEY \|\| !N8N_HOST)` y devuelve `configured: false`. UI muestra warning amarillo con instrucción explícita |
| R3 | Edge function `bot-actions` healthcheck requiere JWT y devuelve 401 | Baja | Media | Probar en Vercel preview antes de merge. Si requiere JWT, mandar `Authorization: Bearer ${SUPABASE_ANON_KEY}` (anon alcanza). Documentado en código |
| R4 | Query a `bot_turns` cross-agency lenta a > 100k filas | Baja en V1, Media en 3 meses | Media | Query filtra por `started_at > now() - window` con window default 24h. Index `idx_bot_turns_status_running` cubre el filtro de errores. Monitorear via `mcp__supabase__get_logs` post-lanzamiento |
| R5 | Filtro "silencio sospechoso" en YCloud da false positives los domingos | Media | Baja | Hardcode horario Lun-Sáb 9-19 hora CR en `ycloud.ts`. Si más adelante el founder agrega clientes con otro schedule, cambiar a leer `bot_config.bot_schedule` por agencia (V2) |
| R6 | `unstable_cache` deprecado en Next 16 | Media | Baja | Builder verifica en `node_modules/next/dist/docs/` antes de codear. Si está deprecado, usar `export const revalidate = 30` page-level + segmentar la página o `fetch(url, { next: { revalidate: 30, tags: ['n8n-health'] } })` (que sí está soportado en App Router para fetches externos) |
| R7 | Botón "Refrescar" no invalida cache porque tags mal seteados | Baja | Baja | Test en localhost: tocar botón, verificar que el query a N8N se redispara (ver en network tab del N8N — o agregar log temporal) |
| R8 | Master accede a `/master/salud` desde móvil con conexión lenta → timeout doble (Vercel function + N8N API) | Media | Media | Timeout interno 5s + Vercel default 10s. Si N8N tarda > 5s → bloque cae a "no responde", el resto carga. UX sigue OK |
| R9 | Cambiar `N8N_BOT_WORKFLOW_ID` al promover `bot-c v2` requiere redeploy | Baja | Baja | Documentar en CLAUDE.md de crm-v2 o en `docs/`: "Para apuntar al nuevo workflow, actualizar var en Vercel + push" |
| R10 | Página revela cross-tenant data a quien logre llegar a `/master/salud` siendo no-master | Crítico si pasa | Crítico | Triple defensa: middleware redirige + `requireMaster()` lanza `notFound()` + RLS de `bot_turns_select` requiere `is_master() OR is_member_of(agency_id)`. Ya probado en `/master/*` |

---

## 8. Plan de testing (founder ejecuta en localhost antes de PR)

### 8.1 Setup local

1. En `crm-v2/.env.local`, agregar:
   ```
   N8N_HOST=n8n-n8n.v5qn6d.easypanel.host
   N8N_API_KEY=<copiar del .env existente del founder>
   N8N_BOT_WORKFLOW_ID=Jsh4krhC9HRUh7Ly
   ```
2. `npm run dev` en `crm-v2/`.
3. Abrir `http://localhost:3000/master/salud` logueado como master.

### 8.2 Casos de test

**T1 — Happy path:** Workflow activo, edge fns OK, YCloud con mensajes recientes, ningún error en `bot_turns` últimas 24h.
- ✅ Los 5 bloques renderizan en verde.
- ✅ Block 1 muestra "ACTIVO" + última ejecución exitosa con timestamp reciente.
- ✅ Block 2 muestra ≥1 turno con status DONE.

**T2 — Workflow N8N apagado:** Apagar `bot-c v1` desde la UI de N8N (toggle off).
- ✅ Block 1 muestra pill rojo "INACTIVO".
- ✅ Resto de bloques siguen renderizando normal.
- ✅ Re-activar el workflow + click "Refrescar" → bloque vuelve a verde en < 30s (sin esperar el TTL).

**T3 — N8N API caída:** Mockear poniendo `N8N_HOST=invalid.example.com` en `.env.local` y reiniciar dev server.
- ✅ Block 1 muestra "N8N no responde" en rojo.
- ✅ Página entera carga en < 6s (timeout 5s + render).
- ✅ Resto de bloques OK.

**T4 — `N8N_API_KEY` faltante:** Quitar la var del `.env.local` y reiniciar.
- ✅ Block 1 muestra warning amarillo "Falta configurar `N8N_API_KEY`".
- ✅ Resto OK.

**T5 — Forzar error en bot:** Disparar un mensaje malformado al webhook YCloud (simular un audio sin URL, o tirar a mano un INSERT a `bot_turns` con `status='failed'`, `error_msg='test'`, `started_at=now()`, `agency_id=<una real>`).
- ✅ Block 2 muestra el turno con pill rojo "FAILED" en la primera fila.
- ✅ Activar filtro "Solo errores" → la tabla queda filtrada con esa fila + cualquier otro fail.
- ✅ Counter de "errores bot" en block 5 incrementa en 1.

**T6 — Filtros funcionan:**
- ✅ Click "Solo errores" → query string `?errors=1`, tabla actualizada.
- ✅ Cambiar ventana a "7d" → `?errors=1&window=7d`.
- ✅ Dropdown agency → `?agency=<uuid>`.
- ✅ Limpiar filtros → vuelve a default.

**T7 — Vista mobile:** En DevTools → toggle device toolbar → iPhone SE (375px).
- ✅ Layout stack vertical, sin overflow horizontal.
- ✅ Tabla recent-turns se reformatea a cards.
- ✅ Dropdown agency funciona (touch-friendly).
- ✅ Botón "Refrescar" accesible (no oculto detrás del nav).

**T8 — Gate de seguridad:**
- ✅ Logueado como user normal (no master) → navegar a `/master/salud` → 404 (no leak).
- ✅ Sin sesión → redirect a `/login`.

### 8.3 Deploy a Vercel

1. Push de feature branch `feat/obs-1-salud-sistema` → PR a `main`.
2. Antes del PR: agregar las 3 env vars (`N8N_HOST`, `N8N_API_KEY`, `N8N_BOT_WORKFLOW_ID`) en Vercel Project Settings → Environment Variables → scopes `Production` + `Preview` + `Development`.
3. Re-deploy preview (automático con el push, pero forzar re-deploy si las vars se agregaron después del push).
4. Probar T1, T2, T7 en el preview URL.
5. Verificar T8 en preview.
6. Merge a main.

### 8.4 Smoke test post-merge en producción

1. Founder abre `/master/salud` en celular.
2. Verifica los 5 bloques cargan en verde.
3. Disparar 1 mensaje real desde un número de prueba al WhatsApp del bot → esperar 30s → refrescar la página → ver nuevo turno en block 2.

---

## 9. Trade-offs y alternativas descartadas

| Decisión tomada | Alternativa descartada | Por qué |
|---|---|---|
| `Promise.allSettled` en 1 page server | Suspense streaming por bloque | Página chica, no se gana UX, complica error boundaries |
| No realtime / sólo refresh manual | Suscripción Broadcast Changes a `bot_turns` | OBS-2 cubre el caso "enterarme rápido" con push notification. Realtime acá sería overkill |
| `unstable_cache` con tag por bloque | `cache()` request-level + `revalidatePath` global | Necesitamos cache cross-request. `cache()` solo dedupa intra-request |
| Cliente N8N inline en `lib/health/n8n.ts` | Refactorizar `scripts/n8n-pull.mjs` a librería compartida | El script CLI vive en Node puro (CommonJS-ish), distinto runtime que Next server. Más simple un módulo nuevo TS-native que adaptar el script |
| 1 query con join `agencies!inner` | 2 queries (turns + lookup agencies por id batch) | El join trae ≤ 50 rows, Postgres lo hace en 1 trip. Más simple |
| Horario hábil hardcoded en `ycloud.ts` | Leer `bot_config.bot_schedule` por agencia | OBS-1 muestra estado GLOBAL del canal, no por agency. Cuando haya 10+ agencies con schedules distintos, refactor a "silencio por agency" en OBS-3 |
| No migration nueva | Crear índice global `bot_turns(started_at desc)` | Audit confirma que índices existentes cubren los queries de OBS-1. Esperar evidence de query lenta antes de agregar índice |
| Botón "Refrescar" con `revalidateTag` | Polling cada 30s con React Query | Polling consume Vercel function invocations sin que el founder esté mirando. Refresh manual es lean V1 |

---

## 10. Costo estimado

**Vercel function invocations:**
- Page `/master/salud` server-renderiza por visita. Founder + 1-2 ops abre ~ 10-30 veces/día → 600/mes.
- Cada visita dispara 5 fetches paralelos, pero 3 cacheados (N8N 30s, edges 60s, counters 60s). Worst case real ~ 2-3 fetches no cacheados por visita.
- Negligible vs el plan Vercel Hobby/Pro.

**N8N API:**
- Con cache 30s: ≤ 120 calls/hora aun si refresh constante → trivial para EasyPanel self-hosted.

**Supabase:**
- Counters 24h cacheados 60s → ≤ 60 sets de 5 counts = 300 queries/hora. Cada count es `head: true` index-only scan → < 5ms. Trivial.
- Recent turns es 1 SELECT con LIMIT 50 sin cache. Si el founder abre 30 veces/día → 30 queries/día. Trivial.

**Costo incremental mensual:** **$0**. Todo dentro de planes actuales.

---

## 11. Trabajo NO incluido (next phases)

**OBS-2 — alertas push (Telegram/email):**
- Cuando `bot-actions/handoff.escalate` se dispara: enviar push a Telegram del founder.
- Cuando `bot_turns.status='failed'` cruza umbral (> 5 fails en 1h): alerta.
- Cuando workflow N8N pasa de active → inactive: alerta (requiere polling cron, no hay webhook nativo de N8N para esto).
- Stack: Telegram Bot API + edge function programada (Supabase scheduled functions o Vercel cron).

**OBS-3 — drill-down y métricas avanzadas:**
- Click en una row de `bot_turns` → modal con `input_crudo`, `output_crudo`, `tools_invocadas` expandido, `extractor_output_json`, `latency_per_node`.
- Histograma de latencia (p50/p95/p99) por ventana.
- Comparativa arch A vs C (cuando esté online el experimento).
- Filtro por `error_msg` regex.

**OBS-4 — Status page público:**
- `/status` accesible sin auth con uptime histórico (verde / amarillo / rojo de las últimas 24h).
- Útil para mostrar a clientes que la plataforma es transparente.
- Bonus: badge "powered by" + RSS.

---

## 12. Checklist pre-PR (que el builder marca antes de pedir review)

- [ ] `requireMaster()` en el page como primera línea
- [ ] `Promise.allSettled` envuelve los 5 fetches
- [ ] Cada fetch tiene timeout (5s para externos, sin timeout para Postgres)
- [ ] Bloques degradan sin tirar la página (probado T2, T3, T4)
- [ ] `.env.example` actualizado con las 3 vars N8N
- [ ] Vercel env vars seteadas en Production+Preview+Development
- [ ] MasterShell NAV tiene el nuevo item con icon importado
- [ ] Mobile (375px) verificado en DevTools
- [ ] Filtros funcionan vía query string (T6)
- [ ] Gate T8 verificado (404 a no-master, redirect a no-auth)
- [ ] No hay `unstable_cache` si está deprecado en Next 16 (fallback documentado en R6)
- [ ] No se agregaron migraciones nuevas (confirmar `crm-v2/supabase/migrations/` sin diff)
- [ ] No se modificaron edge functions (confirmar `crm-v2/supabase/functions/` sin diff)
- [ ] No se modificó el workflow N8N
- [ ] Probado en localhost antes del push (regla del founder)

---

## 13. Handoff a builders

**backend-builder:**
- Implementa `src/lib/health/{n8n,edge-functions,bot-turns,ycloud,counters,types}.ts`.
- Implementa `src/app/master/salud/_actions/refresh.ts`.
- Garantiza tipos compartidos en `types.ts`.
- Verifica que el cliente N8N maneje 401/403/timeout/5xx graceful.
- Si encuentra que el healthcheck de edge functions requiere JWT, agrega el header `Authorization: Bearer ${SUPABASE_ANON_KEY}` y deja comentario explicando.

**frontend-builder:**
- Implementa `src/app/master/salud/page.tsx` + los 8 componentes parciales.
- Sigue exactamente el sistema visual del template (border-line, bg-surface, font-display, font-mono, accent, ink, ink-soft, muted).
- Mobile-first sin excepción: layout stack vertical primero, grid 2-col en md+.
- Tabla `recent-turns-table.tsx` con `overflow-x-auto` + reformateo a cards en mobile (`flex-col gap-2` por row en `< sm`).
- Filtros con `<Link>` que actualizan query string (server-side re-render — NO client state).
- Botón "Refrescar" client component que invoca el server action y muestra spinner mientras dura.

**Quien revise (founder o code-reviewer):**
- Verificar checklist §12 punto por punto.
- Probar T1-T8 en localhost antes de aprobar PR.
- Confirmar que las env vars están en Vercel ANTES de mergear a main.

---

**Fin de la spec.**
