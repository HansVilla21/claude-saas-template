# Spec Tecnico — Fase ADM-4 Bloque A (Metricas reales)

**Fecha:** 2026-06-03
**Autor:** arquitecto (template)
**Estado:** listo para implementacion por backend-builder + frontend-builder
**Decisiones congeladas:** alcance del bloque A acordado con el founder en sesion 2026-06-03. Bloques B (cablear `is_active` a login y bot n8n) y C (polish UX) quedan diferidos a otra sesion — **NO se tocan aqui**.
**Esfuerzo objetivo:** 8-16h (~1-2 dias).

Quien implemente NO debe re-arquitecturar. Si encuentra ambiguedad real, escala — no improvisa.

---

## 0. Conflictos detectados durante la auditoria (resueltos a favor de los datos reales)

| # | Conflicto | Resolucion |
|---|---|---|
| K1 | El brief del founder dice "Leads calificados = `leads.qualified_at IS NOT NULL`". Esa columna **no existe**. Lo que existe es `leads.is_qualified boolean` (migration 0003, default false) + `leads.qualified_set_at timestamptz` (migration 0009, agregado en el inbox god-tier). | **Usamos `is_qualified = true` como verdad de "leads calificados"** y para el delta de 30d previos comparamos contra `qualified_set_at` en la ventana. Si `is_qualified=true` pero `qualified_set_at IS NULL` (lead heredado pre-0009 / inconsistencia), igual cuenta en el numerador del total — pero NO en la ventana de 30d (no podemos saber cuando se califico). Documentado como edge case 9.3. |
| K2 | El brief dice "messages.role = 'bot'\|'human'\|'lead'". El schema real (migration 0001) tiene **`messages.direction message_direction = 'inbound'\|'outbound'`** + **`messages.sender_kind message_sender_kind = 'lead'\|'bot'\|'agent'\|'system'`**. | Mapeo: `lead` = `sender_kind='lead'` (mensaje del contacto), `bot` = `sender_kind='bot'`, `human` = `sender_kind='agent'`. **Tiempo de respuesta = delta entre un mensaje del `lead` y el siguiente mensaje del `bot` o `agent` en la misma conversation, dentro de 24h.** Detalle en §5.3. |
| K3 | El brief dice "handler='human' vs handler='bot'". `conversations.handler` es el estado **actual** del handoff (puede haber sido humano hace 3 dias y bot hoy). NO es bueno para metrica historica de tiempo de respuesta. | Ignoramos `handler` para esta metrica. Usamos `messages.sender_kind` (granularidad por mensaje, historico real). Esto matchea la intencion del founder ("avg tiempo del humano vs del bot") con la columna correcta. |
| K4 | "Top 3 agentes por leads asignados" — `leads.assigned_user_id` existe y es la fuente, pero NO tiene timestamp de cuando se asigno. No podemos filtrar "asignados en los ultimos 30d" sin un `assigned_at`. | Usamos `leads.updated_at` como proxy de "ultimo movimiento del lead" pero **eso es ruidoso**. **Decision:** el top 3 es **historico total**, no por ventana. Si se quiere ventana, requiere migration nueva con `leads.assigned_at` — fuera de scope ADM-4-A. Documentado en §5.4 + DT3. |
| K5 | "Ultimo activo" del agente para el top 3 — `users` no tiene `last_active_at`. `auth.users.last_sign_in_at` existe via admin client (patron ADM-2). | Usamos `auth.users.last_sign_in_at` igual que ADM-2 (`getAgencyDetail` linea 466-479). Lookup por admin client, N=3 (siempre solo 3 agentes top), aceptable. |

---

## 1. Resumen del estado actual relevante

### 1.1 Server actions existentes — `src/app/master/_actions/agencies.ts`

| Action | Que devuelve hoy | Accion ADM-4-A |
|---|---|---|
| `getMasterDashboardCounters()` | `{ totalAgencies, totalLeadsAcrossAll, activeConversationsToday }` (counters globales). | **No se toca.** Sigue alimentando los 3 KPIs del header del dashboard. |
| `listAgenciesForMaster()` | `MasterAgencyRow[]` con `leadsCount` total, `conversationsActiveCount` (handler='human' + no archivada), `lastUsedAt`. | **No se toca.** Es la lista usada en `/master/clientes`. La tabla nueva del dashboard usa OTRA action (`listAgenciesResume`) porque las metricas son distintas (esta-semana vs total, sin filtrar handler). |
| `getAgencyDetail(slug)` | `AgencyDetail` con identidad + owner + counters + miembros. | **No se toca.** El tab Metricas hace su propia query (`getAgencyMetrics(slug)`). Razon: el detalle ya tarda en cargar por los `auth.admin.getUserById` paralelos; no le agregamos mas peso si no es necesario. |
| `createAgencyWithOwner / suspendAgency / reactivateAgency / impersonateAgency / stopImpersonating` | (no relevantes para A). | **No se tocan.** |

Helper privado `startOfDayCostaRicaIso()` (agencies.ts:324-332) — **se reusa** desde el nuevo archivo (se exporta o se duplica; ver DT5).

### 1.2 Tipos existentes — `src/app/master/_actions/agencies.types.ts`

`MasterAgencyRow`, `MasterDashboardCounters`, `AgencyDetail`, `AgencyMember`, `AgencyMemberRole`, `SimpleResult`, `AuditEvent` — **no se tocan**. Solo se agregan los nuevos al final del archivo (ver §4).

### 1.3 Tablas de BD relevantes (ya aplicadas, no se tocan)

| Tabla | Columnas relevantes para ADM-4-A | Indices existentes utiles |
|---|---|---|
| `leads` | `id`, `agency_id`, `created_at`, `is_qualified bool`, `qualified_set_at timestamptz` (0009), `assigned_user_id uuid`, `updated_at`, `deleted_at` (soft delete v2). NO existe `qualified_at` ni `assigned_at`. | `idx_leads_agency (agency_id)`, `idx_leads_last_message (agency_id, last_message_at desc)`, `idx_leads_assigned (assigned_user_id)`. **Falta:** indice por `(agency_id, created_at)` para la query de leads-por-dia. Ver §8. |
| `conversations` | `id`, `agency_id`, `last_message_at`, `handler` enum `bot\|human\|unassigned`, `archived_at`. | `idx_conversations_agency`, `idx_conversations_last_message (agency_id, last_message_at desc)`. Suficiente para la tabla de resumen. |
| `messages` | `id`, `agency_id`, `conversation_id`, `sender_kind` enum `lead\|bot\|agent\|system`, `direction` enum `inbound\|outbound`, `created_at`. | `idx_messages_conversation (conversation_id, created_at)`. **Es el indice critico para la query de tiempo de respuesta** — lectura secuencial por conversacion ordenada por tiempo. Suficiente. |
| `users` (public) | `id`, `email`, `full_name`, `avatar_url`. NO tiene `last_sign_in_at` (vive en auth.users). | n/a. |
| `auth.users` | `last_sign_in_at`. Acceso via `admin.auth.admin.getUserById(id)`. | n/a. |
| `agencies` | `id`, `slug`, `name`, `is_active`, `created_at`. | n/a (poco volumen). |

### 1.4 Componentes UI a tocar / crear

| Path | Tipo | Accion |
|---|---|---|
| `crm-v2/src/app/master/page.tsx` | Server | **Modificar:** mantener `<CounterCard>` x3, agregar `<AgencyResumeTable>` debajo. Carga server-side de `listAgenciesResume()`. |
| `crm-v2/src/app/master/_components/agency-resume-table.tsx` | Client | **Crear nuevo.** Tabla responsive (cards en mobile). |
| `crm-v2/src/app/master/clientes/[slug]/page.tsx` | Server | **Modificar:** pasar `metricsContent={<MetricsTab .../>}` al `<AgencyDetailTabs>`. |
| `crm-v2/src/app/master/clientes/[slug]/_components/agency-detail-tabs.tsx` | Client | **Modificar:** agregar `'metricas'` al union `TabId`, agregar prop `metricsContent`, agregar entrada en `TABS[]`, agregar panel. |
| `crm-v2/src/app/master/clientes/[slug]/_components/metrics-tab.tsx` | Client | **Crear nuevo.** Recibe la data ya cargada (server-side) como prop. NO hace fetching propio. |
| `crm-v2/src/app/master/clientes/[slug]/_components/leads-per-day-chart.tsx` | Client | **Crear nuevo.** Componente SVG inline (no Recharts — ver §2). |
| `crm-v2/src/app/master/_actions/agencies-metrics.ts` | Server actions | **Crear nuevo.** 2 actions: `getAgencyMetrics(slug)`, `listAgenciesResume()`. |

### 1.5 Constraints del proyecto (heredadas, no negociables)

- Next.js 16 App Router con `proxy.ts`. RSC por defecto, `'use client'` solo donde necesario.
- TZ siempre `America/Costa_Rica` (UTC-6 fijo, sin DST). Reusar `startOfDayCostaRicaIso()`.
- Idioma de UI: español.
- Sin libs nuevas salvo justificacion (§2 decide NO Recharts).
- Mobile-first.
- RLS: `is_master()` ya esta en SELECT de `leads`/`conversations`/`messages` (migration 0006), asi que el user-bound client funciona. Los admin clients solo para `auth.admin.getUserById`.

---

## 2. Decision: libreria de charts — **SVG inline, sin Recharts**

### 2.1 Opciones evaluadas

| Opcion | Peso bundle | Complejidad | "Look AI-slop" risk |
|---|---|---|---|
| Recharts ^2.x | **~95-110 KB gzipped** en el route bundle (Recharts importa lodash + d3-shape + d3-scale; tree-shaking parcial). | Baja para charts simples. Composicion via `<LineChart><Line/></LineChart>`. | Medio — defaults gris/azul, tooltips genericos. Tunear se vuelve verboso. |
| Tremor / shadcn-charts | Similar a Recharts + Radix. ~120 KB. | Media (depende de wrappers). | Alto — todos los SaaS usan el mismo look. |
| **SVG inline custom (DECISION)** | **+0 KB.** Solo el componente nuevo (~150 lineas). | **Media-baja** para chart de barras simples (30 datapoints, 1 serie). Calculamos max, mapeamos a alto, dibujamos `<rect>` x 30 con `<text>` de eje. | Bajo — control total del estilo, matchea la dir de arte del CRM (terracota `text-accent`, fonts `font-display`/`font-mono`, sin sombras). |

### 2.2 Justificacion

Solo necesitamos **un chart** (leads por dia, 30 datapoints, 1 serie, sin interaccion compleja). Pagar 95+ KB de bundle por una pantalla del scope master que ve **solo el founder** es desproporcionado. Ademas, el lock-in con Recharts mas adelante puede empujar a usar mas charts genericos. El SVG inline establece el precedente correcto: **charts hechos a mano cuando son simples, libreria solo si se justifica con multiples charts complejos**.

KPIs (numericos grandes) son `<p>` con `font-display`. **Cero chart libs.**

### 2.3 Componente `<LeadsPerDayChart>` — spec del SVG

- viewBox responsive: `0 0 600 200`. `preserveAspectRatio="xMidYMid meet"` para escalar fluido.
- 30 barras (`<rect>`), gap 2px, width calculado: `(600 - paddingLeft - paddingRight) / 30 - 2`.
- Altura: `maxCount = Math.max(...counts, 1)` para evitar div-by-0; `barHeight = (count / maxCount) * (200 - paddingTop - paddingBottom)`.
- Color: `fill="currentColor"` con `text-accent` en el wrapper → barras terracota.
- Hover: `<title>` dentro de cada `<rect>` con texto `"22 Mayo: 5 leads"` (tooltip nativo del browser, sin JS, sin chart-libs).
- Eje X: 4 ticks (dia 1, 10, 20, 30) con `<text>` `font-mono text-[0.65rem]`.
- Eje Y: 3 ticks (0, max/2, max) en `<text>` a la izquierda. Si `maxCount === 0`, mostrar empty state.
- Sin grid lines (look editorial, no dashboard generico).

Codigo de referencia (NO copiar literal, es ilustrativo):

```tsx
// _components/leads-per-day-chart.tsx — 'use client'
type Point = { date: string; count: number };
export function LeadsPerDayChart({ points }: { points: Point[] }) {
  const max = Math.max(...points.map(p => p.count), 1);
  const W = 600, H = 200, PL = 32, PR = 8, PT = 16, PB = 24;
  const barW = (W - PL - PR) / points.length - 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full text-accent">
      {/* barras */}
      {points.map((p, i) => {
        const h = (p.count / max) * (H - PT - PB);
        const x = PL + i * (barW + 2);
        const y = H - PB - h;
        return (
          <rect key={p.date} x={x} y={y} width={barW} height={h}
                fill="currentColor" rx="1">
            <title>{formatDateCr(p.date)}: {p.count} leads</title>
          </rect>
        );
      })}
      {/* eje X / eje Y / ticks ... */}
    </svg>
  );
}
```

---

## 3. Server actions nuevas — archivo `src/app/master/_actions/agencies-metrics.ts`

**Archivo nuevo.** NO inflar `agencies.ts` (ya tiene 8 actions, 756 lineas). Empieza con `'use server'`.

### 3.1 Signatures (resumen)

```ts
'use server';
import { requireMaster } from '@/lib/auth/require-master';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type {
  AgencyMetrics, AgencySummaryRow,
  LeadsPerDayPoint, ConversionStats, ResponseTimeStats, TopAgent
} from './agencies.types';

export async function getAgencyMetrics(slug: string): Promise<AgencyMetrics | null>;
export async function listAgenciesResume(): Promise<AgencySummaryRow[]>;
```

Ambas hacen `await requireMaster()` como **primera linea** (defensa en profundidad: middleware + requireMaster + RLS).

### 3.2 `getAgencyMetrics(slug)` — orquestacion

1. `requireMaster()`.
2. Lookup `agencies.id` por `slug` (admin client, 1 query). Si no existe → `return null` (la pagina ya hace `notFound()`).
3. Calcular ventana 30d **en TZ CR**: helper nuevo `getWindow30dCr()` devuelve `{ startCurrent, endCurrent, startPrevious }` (todos ISO UTC).
   - `endCurrent` = ahora UTC.
   - `startCurrent` = `endCurrent - 30 dias` (no "30 dias naturales calendarios"; **rolling 30 dias** desde ahora — decision menor 11.1).
   - `startPrevious` = `startCurrent - 30 dias` (para delta).
4. Disparar 4 queries en `Promise.all`:
   - `leadsPerDay` — UNA RPC nueva (ver §5.1). Devuelve array de 30 filas.
   - `conversion` — DOS queries: total leads 30d, qualified leads 30d (y otra para delta vs 30d previos, total qualified). Ver §5.2.
   - `responseTime` — UNA RPC nueva (ver §5.3). Devuelve `{ human_seconds, bot_seconds }`.
   - `topAgents` — UNA query SQL (ver §5.4). Devuelve 3 filas.
5. Para `topAgents`, en SECUENCIA despues del Promise.all, hacer N=3 calls a `admin.auth.admin.getUserById(userId)` para obtener `last_sign_in_at`. Patron identico a `getAgencyDetail`.
6. Componer el objeto `AgencyMetrics` y devolver.

### 3.3 `listAgenciesResume()` — orquestacion

1. `requireMaster()`.
2. UNA query SQL via RPC nueva `list_agencies_resume()` (ver §5.5) que en un solo round-trip devuelve por cada agency: `id, slug, name, is_active, leads_this_week, conversations_active_today, last_message_at`. Orden `last_message_at desc nulls last`.
3. **Por que RPC y no N+1:** la action existente `listAgenciesForMaster` hace N+1 (3 queries por agency). Aceptable para `<100`. Pero **el dashboard master es la home y se carga cada visita** — si en 6 meses hay 30 agencies, son 90+ round-trips. La RPC consolida en 1 con CTEs. Costo: una migration nueva.
4. Map a `AgencySummaryRow` y devolver.

---

## 4. Tipos nuevos — agregar al final de `agencies.types.ts`

```ts
// =============================================================================
// getAgencyMetrics (ADM-4 bloque A)
// =============================================================================

export type LeadsPerDayPoint = {
  date: string;   // YYYY-MM-DD en TZ America/Costa_Rica
  count: number;
};

export type ConversionStats = {
  totalLeads: number;            // ventana 30d actual
  qualifiedLeads: number;        // ventana 30d actual (qualified_set_at en ventana)
  percentage: number;            // 0..100 con 1 decimal, o 0 si totalLeads=0
  // Delta vs ventana 30d previa.
  // Si totalPrevious === 0 → deltaVsPrevious30d = null (no podemos %comparar).
  // Si no, = percentageCurrent - percentagePrevious (en puntos porcentuales).
  deltaVsPrevious30d: number | null;
};

export type ResponseTimeStats = {
  humanSeconds: number | null;   // null si no hay datos (sin respuestas humanas en 30d)
  botSeconds: number | null;     // null si no hay datos
  humanSampleSize: number;       // # de respuestas que entraron al promedio
  botSampleSize: number;
};

export type TopAgent = {
  userId: string;
  fullName: string | null;
  email: string;
  avatarUrl: string | null;
  leadsAssigned: number;         // total historico de leads.assigned_user_id = this
  lastSignInAt: string | null;   // de auth.users
};

export type AgencyMetrics = {
  leadsPerDay: LeadsPerDayPoint[];  // siempre 30 entries (relleno con 0 los dias sin leads)
  conversion: ConversionStats;
  responseTime: ResponseTimeStats;
  topAgents: TopAgent[];            // max 3, puede ser <3 o vacio
};

// =============================================================================
// listAgenciesResume (ADM-4 bloque A)
// =============================================================================

export type AgencySummaryRow = {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
  leadsThisWeek: number;             // leads creados en los ultimos 7 dias (CR TZ)
  conversationsActiveToday: number;  // conversations con last_message_at >= startOfDayCr
  lastMessageAt: string | null;      // max(conversations.last_message_at) por agency
};
```

---

## 5. Queries SQL exactas

### 5.1 RPC `agency_leads_per_day(p_agency_id uuid, p_start timestamptz, p_end timestamptz)`

**Por que RPC:** generar 30 filas (una por dia) con `generate_series` y `LEFT JOIN` a `leads` en un solo round-trip. Hacer esto desde supabase-js requiere 30 queries o un agrupamiento client-side cargando todos los leads (caro si hay 10k).

```sql
create or replace function public.agency_leads_per_day(
    p_agency_id uuid,
    p_start     timestamptz,
    p_end       timestamptz
)
returns table (day_date date, lead_count integer)
language sql
security definer
set search_path = public
as $$
    with days as (
        select generate_series(
            (p_start at time zone 'America/Costa_Rica')::date,
            (p_end   at time zone 'America/Costa_Rica')::date,
            interval '1 day'
        )::date as d
    )
    select
        days.d as day_date,
        count(leads.id)::integer as lead_count
    from days
    left join public.leads
        on leads.agency_id = p_agency_id
        and leads.deleted_at is null
        and (leads.created_at at time zone 'America/Costa_Rica')::date = days.d
    group by days.d
    order by days.d;
$$;

-- RLS bypass justificado por security definer; el GATE lo hace
-- requireMaster() en la server action (defensa capa 2). NO exponer
-- esta RPC al cliente — solo se invoca desde server actions con admin client.
revoke all on function public.agency_leads_per_day(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.agency_leads_per_day(uuid, timestamptz, timestamptz) to service_role;
```

**Como se invoca:** desde la action con el admin client (porque revocamos a anon/authenticated):

```ts
const { data, error } = await admin.rpc('agency_leads_per_day', {
  p_agency_id: agencyId,
  p_start: startCurrent,
  p_end: endCurrent,
});
```

### 5.2 Conversion — queries directas (no RPC)

3 counts simples, en paralelo con `Promise.all`:

```ts
// Total leads en ventana actual
supabase.from('leads')
  .select('id', { count: 'exact', head: true })
  .eq('agency_id', agencyId)
  .is('deleted_at', null)
  .gte('created_at', startCurrent)
  .lte('created_at', endCurrent);

// Qualified en ventana actual (qualified_set_at dentro de ventana)
supabase.from('leads')
  .select('id', { count: 'exact', head: true })
  .eq('agency_id', agencyId)
  .is('deleted_at', null)
  .eq('is_qualified', true)
  .gte('qualified_set_at', startCurrent)
  .lte('qualified_set_at', endCurrent);

// Total + qualified en ventana previa para el delta
// (2 queries mas, identicas pero con startPrevious y startCurrent como limites)
```

**Performance:** las 4 queries usan `idx_leads_agency`. Para 10k leads de una agency, count exact tarda ~30-80ms cada una. Total paralelo: ~80-150ms. Aceptable.

### 5.3 RPC `agency_response_time_30d(p_agency_id uuid, p_start timestamptz, p_end timestamptz)`

**Logica:** para cada mensaje de `sender_kind='lead'` en la ventana, encontrar el siguiente mensaje en la misma `conversation_id` con `sender_kind IN ('bot','agent')`. Si la respuesta esta dentro de 24h, contarla. Promediar separadamente bot vs agent.

```sql
create or replace function public.agency_response_time_30d(
    p_agency_id uuid,
    p_start     timestamptz,
    p_end       timestamptz
)
returns table (
    human_avg_seconds  numeric,
    bot_avg_seconds    numeric,
    human_sample_size  integer,
    bot_sample_size    integer
)
language sql
security definer
set search_path = public
as $$
    with paired as (
        select
            m.conversation_id,
            m.created_at as lead_msg_at,
            lead(
                case when m_next.sender_kind in ('bot','agent') then m_next.sender_kind end
            ) over w as next_responder_kind,
            lead(
                case when m_next.sender_kind in ('bot','agent') then m_next.created_at end
            ) over w as next_response_at
        from public.messages m
        join public.messages m_next
            on m_next.conversation_id = m.conversation_id
            and m_next.created_at > m.created_at
        where m.agency_id = p_agency_id
          and m.sender_kind = 'lead'
          and m.created_at >= p_start
          and m.created_at <= p_end
        window w as (
            partition by m.id
            order by m_next.created_at asc
        )
    ),
    deltas as (
        select
            next_responder_kind,
            extract(epoch from (next_response_at - lead_msg_at)) as delta_s
        from paired
        where next_responder_kind is not null
          and next_response_at is not null
          and extract(epoch from (next_response_at - lead_msg_at)) <= 86400  -- <= 24h
    )
    select
        avg(delta_s) filter (where next_responder_kind = 'agent') as human_avg_seconds,
        avg(delta_s) filter (where next_responder_kind = 'bot')   as bot_avg_seconds,
        count(*) filter (where next_responder_kind = 'agent')::int as human_sample_size,
        count(*) filter (where next_responder_kind = 'bot')::int   as bot_sample_size
    from deltas;
$$;

revoke all on function public.agency_response_time_30d(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.agency_response_time_30d(uuid, timestamptz, timestamptz) to service_role;
```

**Nota tecnica sobre la query:** el `window` con `lead()` sobre el siguiente mensaje cualquiera es **simplificado**. La logica correcta es: para cada mensaje de `lead`, encontrar el **siguiente** mensaje de la conversacion que sea `bot` o `agent`, ignorando otros mensajes intermedios de `lead`. El backend-builder debe validar este SQL con datos reales antes de hacer commit — si no devuelve los promedios esperados, alternativa es un LATERAL JOIN:

```sql
-- ALTERNATIVA si el LEAD window no funciona:
select
  m.id,
  m.created_at as lead_at,
  next_resp.sender_kind,
  next_resp.created_at as response_at
from public.messages m
cross join lateral (
  select sender_kind, created_at
  from public.messages m2
  where m2.conversation_id = m.conversation_id
    and m2.created_at > m.created_at
    and m2.sender_kind in ('bot','agent')
  order by m2.created_at asc
  limit 1
) next_resp
where m.agency_id = p_agency_id
  and m.sender_kind = 'lead'
  and m.created_at between p_start and p_end;
```

El LATERAL es mas claro y probablemente igual de rapido por `idx_messages_conversation`. **Recomendacion final: usar LATERAL** (mas mantenible, plan explicito).

**Performance:** para una agency con 10k mensajes en 30d (estimacion alta), el LATERAL hace 1 lookup por cada `sender_kind='lead'` (~30-40% de los mensajes → ~3-4k lookups), cada uno con index seek O(log n). Estimado: 200-400ms. Si pasa de 500ms, considerar materializar en una tabla agregada nightly — fuera de scope ADM-4-A.

### 5.4 Top agents — query directa

**Decision (K4):** historico total, no filtrado por 30d (no tenemos `assigned_at`).

```ts
const { data } = await supabase
  .from('leads')
  .select(`
    assigned_user_id,
    user:users!leads_assigned_user_id_fkey(id, email, full_name, avatar_url)
  `)
  .eq('agency_id', agencyId)
  .is('deleted_at', null)
  .not('assigned_user_id', 'is', null);
// Agrupar client-side, ordenar desc, take 3.
```

**Alternativa preferida: RPC** porque el agrupamiento client-side carga TODOS los leads (10k filas con join a users). Mejor:

```sql
create or replace function public.agency_top_agents(p_agency_id uuid, p_limit int default 3)
returns table (
    user_id    uuid,
    email      text,
    full_name  text,
    avatar_url text,
    leads_assigned integer
)
language sql
security definer
set search_path = public
as $$
    select
      u.id,
      u.email::text,
      u.full_name,
      u.avatar_url,
      count(l.id)::int as leads_assigned
    from public.leads l
    join public.users u on u.id = l.assigned_user_id
    where l.agency_id = p_agency_id
      and l.deleted_at is null
      and l.assigned_user_id is not null
    group by u.id, u.email, u.full_name, u.avatar_url
    order by leads_assigned desc
    limit p_limit;
$$;

revoke all on function public.agency_top_agents(uuid, int) from public, anon, authenticated;
grant execute on function public.agency_top_agents(uuid, int) to service_role;
```

Despues del RPC, N=3 calls a `admin.auth.admin.getUserById(userId)` para `last_sign_in_at`.

### 5.5 RPC `list_agencies_resume()`

Consolida agencies + leads-7d + conversations-today + last_message en 1 query:

```sql
create or replace function public.list_agencies_resume()
returns table (
    id              uuid,
    slug            text,
    name            text,
    is_active       boolean,
    leads_this_week integer,
    conversations_active_today integer,
    last_message_at timestamptz
)
language sql
security definer
set search_path = public
as $$
    with start_today_cr as (
        select (now() at time zone 'America/Costa_Rica')::date::timestamp
               at time zone 'America/Costa_Rica' as t
    ),
    start_week_cr as (
        select (now() - interval '7 days') as t
    )
    select
        a.id,
        a.slug,
        a.name,
        a.is_active,
        coalesce((
            select count(*)::int from public.leads l
            where l.agency_id = a.id
              and l.deleted_at is null
              and l.created_at >= (select t from start_week_cr)
        ), 0) as leads_this_week,
        coalesce((
            select count(*)::int from public.conversations c
            where c.agency_id = a.id
              and c.last_message_at >= (select t from start_today_cr)
        ), 0) as conversations_active_today,
        (select max(c.last_message_at) from public.conversations c
         where c.agency_id = a.id) as last_message_at
    from public.agencies a
    order by last_message_at desc nulls last;
$$;

revoke all on function public.list_agencies_resume() from public, anon, authenticated;
grant execute on function public.list_agencies_resume() to service_role;
```

**Performance:** con 30 agencies y 10k leads/conversations cada una, los subqueries usan `idx_leads_agency` y `idx_conversations_agency`. Estimado: 80-200ms total. Si crece a 100+ agencies, mover a CTE con LATERAL agregador.

---

## 6. Migration 0018 — indices + RPCs

**Es CRITICA**: las RPCs son necesarias para mantener queries en 1 round-trip. Sin ellas, las server actions hacen 30+ queries.

Tambien agrego el indice faltante para leads-por-dia.

```sql
-- =============================================================================
-- Migration 0018 — ADM-4 bloque A (metricas reales)
-- =============================================================================
-- 1. Indice nuevo en leads para el chart de leads-por-dia.
-- 2. RPC agency_leads_per_day.
-- 3. RPC agency_response_time_30d.
-- 4. RPC agency_top_agents.
-- 5. RPC list_agencies_resume.
-- =============================================================================

create index if not exists idx_leads_agency_created
    on public.leads (agency_id, created_at desc)
    where deleted_at is null;

-- (definiciones de las 4 RPCs como en §5)
```

**Tamaño estimado del indice nuevo:** ~10 bytes por fila + overhead. Para 10k leads = ~100 KB. Despreciable. Build time en CREATE INDEX para tabla con 10k filas: <1s. **Recomendacion:** usar `create index concurrently if not exists` en produccion para no bloquear escrituras. Como es supabase con migrations sincronicas, dejar `create index if not exists` (no concurrent) y aceptar el lock breve — la tabla todavia es pequeña en todos los tenants.

---

## 7. UI — Tab "Metricas" en detalle cliente

### 7.1 Modificaciones a `agency-detail-tabs.tsx`

```ts
type TabId = 'info' | 'bot' | 'usuarios' | 'metricas';

const TABS: Array<{ id: TabId; label: string; icon: typeof InfoIcon }> = [
  { id: 'info', label: 'Info', icon: InfoIcon },
  { id: 'bot', label: 'Bot Config', icon: Robot },
  { id: 'usuarios', label: 'Usuarios', icon: Users },
  { id: 'metricas', label: 'Métricas', icon: ChartLine }, // import desde phosphor
];

// prop nueva: metricsContent: React.ReactNode
// active calc: raw === 'bot'||'usuarios'||'metricas' ? raw : 'info'
// panel nuevo: <section role="tabpanel" id="tabpanel-metricas" hidden={active !== 'metricas'}>{metricsContent}</section>
```

### 7.2 Modificaciones a `page.tsx` del detalle

```tsx
import { getAgencyMetrics } from '../../_actions/agencies-metrics';
import { MetricsTab } from './_components/metrics-tab';

// despues de detail:
const metrics = await getAgencyMetrics(slug); // null-safe pero detail ya validó existencia

<AgencyDetailTabs
  infoContent={...}
  botContent={...}
  usersContent={...}
  metricsContent={<MetricsTab metrics={metrics} agencyName={detail.name} />}
/>
```

**Decision sub-menor (DT2):** cargar `metrics` ANTES de renderizar el tab pintea sobre la perf de la pagina. Con las RPCs, el costo agregado es ~300-500ms. Aceptable — la pagina ya carga `getAgencyDetail` con N llamadas a `auth.admin.getUserById`. **Si despues medimos que es lento, mover a fetch lazy al click del tab** (cambia a `<MetricsTab agencyId={detail.id} />` con `useEffect`). Por ahora, server-side prefetch.

### 7.3 Componente `<MetricsTab>` — layout

```
┌─────────────────────────────────────────────────────────┐
│ KPI Cards (3 horizontal en desktop, stack en mobile)    │
│  ┌────────┐ ┌────────┐ ┌────────────────────┐           │
│  │ Conv   │ │ Tiempo │ │ Tiempo respuesta   │           │
│  │ Rate   │ │ humano │ │ del bot            │           │
│  │ 12.4%  │ │ 2m 14s │ │ 38s                │           │
│  │ ↑ 2pp  │ │ 89 msg │ │ 1.2k msg           │           │
│  └────────┘ └────────┘ └────────────────────┘           │
├─────────────────────────────────────────────────────────┤
│ Chart "Leads por dia" (ultimos 30 dias)                  │
│  ▁▂▃▂▁▄▆▅▁▂▃▄▅▆▇▁▂▃▄▅▆▁▂▃▄▅▆▇█    Total 30d: 87       │
│                                       vs 30d previos:    │
│                                       ↑ 12               │
├─────────────────────────────────────────────────────────┤
│ Top 3 agentes                                            │
│  ●  Maria Salas       42 leads    activa hace 2h         │
│  ●  Juan Perez        31 leads    activo hace 1d         │
│  ●  Pedro Gomez       18 leads    nunca entró            │
└─────────────────────────────────────────────────────────┘
```

### 7.4 Spec por bloque

**A. KPI Conversion**
- Card grande izquierda. `font-display text-4xl` para el `%` (1 decimal). Sublabel `font-mono text-[0.65rem]` con `"X de Y leads"`. Debajo, delta con flecha: `↑/↓ N.N pp vs 30d previos` o `"sin datos previos"` si `deltaVsPrevious30d === null`.

**B. KPI Tiempo humano / bot (2 cards side-by-side)**
- Cada uno `font-display text-3xl`. Formato: `formatDuration(seconds)` → "2m 14s" o "1h 5m" o "38s" o "< 1s".
- Sublabel: `"basado en N respuestas"` (sample size).
- Si `humanSeconds === null` → mostrar `—` y sub `"sin respuestas humanas"`.

**C. Leads por dia chart**
- `<LeadsPerDayChart points={metrics.leadsPerDay} />` ocupando width 100% del contenedor.
- Encima del chart: header con titulo + total + delta.

**D. Top 3 agentes**
- Lista vertical. Por fila: `<Avatar>` (avatar_url o fallback con iniciales del fullName/email), nombre o email, `font-mono` count + "leads", texto "ultimo activo" con `formatRelativeTime(lastSignInAt)` ("hace 2h", "hace 1d", "nunca entró" si null).
- Si `topAgents.length === 0` → empty state inline: "Este cliente aún no tiene leads asignados a un agente."

### 7.5 Estados especiales

| Estado | Trigger | Render |
|---|---|---|
| Empty general | `metrics.conversion.totalLeads === 0 && metrics.leadsPerDay.every(p => p.count === 0)` | Bloque unico centrado: "Este cliente aún no tiene actividad". Sin KPIs, sin chart, sin top. |
| Empty parcial | Hay leads pero `conversion.qualifiedLeads === 0` o `responseTime.botSampleSize === 0` etc. | Cada KPI muestra "—" + sublabel explicativo. Chart se muestra normal (con barras altas y un par bajas). |
| Loading | (n/a SSR, pero si despues movemos a lazy) | Skeleton: 3 boxes grises del tamaño de KPI cards + box grande del chart + 3 lineas de top agents. |
| Error | Action lanza | Page-level error boundary del shell master. NO catchear localmente. |

### 7.6 Mobile-first

- Container: `mx-auto w-full max-w-4xl px-1`.
- KPIs grid: `grid grid-cols-1 sm:grid-cols-3 gap-3`.
- Chart: full-width siempre, viewBox responsive ya lo hace fluido.
- Top agents lista: `flex flex-col gap-3`. Cada fila `flex items-center gap-3`. En mobile, el "ultimo activo" baja a nueva linea (`flex-col sm:flex-row`).

---

## 8. Dashboard master `/master/page.tsx` enriquecido

### 8.1 Modificaciones

```tsx
// Despues de las 3 CounterCards + CTA, agregar:
const resume = await listAgenciesResume();
// ...
{!empty && (
  <div className="mt-12">
    <div className="flex items-baseline justify-between gap-4 border-b border-line pb-3">
      <h2 className="font-display text-xl text-ink">Resumen de clientes</h2>
      <p className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-muted">
        {resume.length} {resume.length === 1 ? 'cuenta' : 'cuentas'}
      </p>
    </div>
    <AgencyResumeTable rows={resume} />
  </div>
)}
```

### 8.2 `<AgencyResumeTable>` — spec

**Desktop (md+):** `<table>` con clases tailwind. Columnas:

| Col | Width | Contenido | Order/format |
|---|---|---|---|
| Cliente | flex-grow | `<Link href="/master/clientes/[slug]">name</Link>` + sub `slug` muted | bold ink |
| Estado | 100px | Badge: si `is_active=true` → "Activo" (badge `bg-green/10 text-green`), si false → "Suspendido" (badge `bg-amber/10 text-amber`). | font-mono uppercase 0.65rem |
| Leads esta semana | 120px right | numero font-mono | right-aligned |
| Conversaciones hoy | 140px right | numero font-mono | right-aligned |
| Ultimo mensaje | 140px right | `formatRelativeTime(lastMessageAt)` o "—" | font-mono text-xs text-ink-soft |

Hover row: `bg-surface-elevated`. Click anywhere → navegar a detalle (envolver row con `<Link>` o usar `onClick` con `router.push`).

**Mobile (<md):** stack de cards en lugar de tabla.

```tsx
{rows.map(r => (
  <Link key={r.id} href={`/master/clientes/${r.slug}`}
        className="block rounded-lg border border-line bg-surface p-4 transition-colors hover:border-line-strong">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="font-medium text-ink">{r.name}</p>
        <p className="font-mono text-[0.65rem] text-muted">{r.slug}</p>
      </div>
      <StatusBadge active={r.isActive} />
    </div>
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
      <span className="font-mono">{r.leadsThisWeek} leads semana</span>
      <span className="font-mono">{r.conversationsActiveToday} convs hoy</span>
      <span className="font-mono">últ. {formatRelativeTime(r.lastMessageAt)}</span>
    </div>
  </Link>
))}
```

Container responsive: `<div className="mt-4 hidden md:block">` para tabla, `<div className="mt-4 md:hidden flex flex-col gap-2">` para cards.

### 8.3 Helpers nuevos

Archivo `crm-v2/src/lib/format/relative-time.ts` (si no existe ya — buscar antes de crear):

```ts
export function formatRelativeTime(iso: string | null): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffS = Math.max(0, (now - then) / 1000);
  if (diffS < 60) return 'recién';
  if (diffS < 3600) return `hace ${Math.floor(diffS / 60)}m`;
  if (diffS < 86400) return `hace ${Math.floor(diffS / 3600)}h`;
  if (diffS < 86400 * 7) return `hace ${Math.floor(diffS / 86400)}d`;
  // > 7 dias: fecha corta es-CR
  return new Intl.DateTimeFormat('es-CR', {
    day: 'numeric', month: 'short'
  }).format(new Date(iso));
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 1) return '< 1s';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
```

---

## 9. Performance / consideraciones

### 9.1 Estimaciones

| Operacion | Volumen estimado | Tiempo estimado | Notas |
|---|---|---|---|
| `getAgencyMetrics` con 10k leads / 50k messages | 1 lookup agency + 4 RPCs en parallel + 3 auth.admin calls | 600-1000ms total | Las RPCs son el cuello. Si pasa de 1.5s, alternativa: separar tab en client + fetch on-click. |
| `listAgenciesResume` con 30 agencies | 1 RPC con subqueries | 100-250ms | Aceptable. >100 agencies → migrar a CTE materializado. |
| Pagina master / detalle | Sumar las queries existentes | <2s | OK. |

### 9.2 Indices

| Indice | Justificacion | Donde |
|---|---|---|
| `idx_leads_agency_created (agency_id, created_at desc) where deleted_at is null` | leads-por-dia query + leads-this-week query (`listAgenciesResume`). Sin esto, full scan sobre `idx_leads_agency`. | **NUEVO en migration 0018.** |
| `idx_messages_conversation (conversation_id, created_at)` | response time LATERAL. | Ya existe (migration 0003). |
| `idx_leads_assigned (assigned_user_id)` | top agents. Pero la query agrupa por agency + assigned, no por solo assigned. Aceptable con `idx_leads_agency`. | Ya existe. |
| `idx_conversations_last_message (agency_id, last_message_at desc)` | resume table (max last_message_at) + conversations_active_today. | Ya existe (migration 0003). |

### 9.3 Decision menor: no agregar indices adicionales

Considere `idx_leads_qualified_set_at (agency_id, qualified_set_at) where is_qualified=true` para acelerar conversion. **Descartado:** las queries de count con filtro `is_qualified=true AND qualified_set_at BETWEEN ...` ya pasan por `idx_leads_agency` con sequencial sobre ~10k filas, costo <100ms. No vale el indice extra mientras los tenants sean chicos.

---

## 10. Riesgos / edge cases

### 10.1 Datos

| Edge case | Comportamiento esperado |
|---|---|
| Agency sin leads aun | `getAgencyMetrics` devuelve `leadsPerDay` con 30 ceros, `conversion.totalLeads=0`, `responseTime` con null/0. Empty state general en el tab. |
| Master sin agencies | `listAgenciesResume` devuelve `[]`. Dashboard muestra `EmptyDashboard` (ya existe en `page.tsx`). |
| Leads con `is_qualified=true` pero `qualified_set_at IS NULL` (datos heredados pre-0009) | NO entran al numerador de la ventana 30d (no podemos saber si la calificacion ocurrio en ventana). Entrarian solo en un "total qualified historico" — pero esa metrica no esta en scope. Documentar para no confundir al founder si ve numeros raros. |
| Conversation con un solo mensaje (lead) y sin respuesta | Excluida del avg (no hay `next_resp`). Ni cuenta ni rompe. |
| Conversation donde el lead manda 5 mensajes seguidos sin respuesta del bot/agent | Cada mensaje del lead que no tenga respuesta posterior queda excluido. El primero que finalmente tenga respuesta cuenta — pero el delta sera muy largo. **Filtro <=24h evita outliers.** |
| Respuesta humana > 24h | Excluida (decision congelada del founder). |
| Bot respondio en 5 segundos pero el agente complementó a las 10 horas | El delta cuenta para `bot` (el primer responder), no para `agent`. Decision implicita del LATERAL `LIMIT 1`. Documentar. |
| Lead asignado a un user que ya fue eliminado de memberships | `leads.assigned_user_id` permanece (FK on delete set null en otros casos, pero aqui se mantiene). Top agents lo muestra igual. **Si el user esta en `users` pero no en `agency_memberships`, igual aparece en el top.** Aceptable — refleja la realidad historica. |
| `auth.admin.getUserById` falla para alguno de los top 3 | `lastSignInAt = null`. Mostrar "nunca entró" o "—". Patron identico a ADM-2. |

### 10.2 Concurrencia / consistencia

- Snapshot SSR: el master ve los datos exactos del momento del request. No realtime. Si refresca, ve actualizado. Decision del founder al congelar scope: **sin realtime ni revalidate corto**. La pagina master es un dashboard de monitoreo, no operativo.

### 10.3 TZ

- Todas las fechas se manejan en TZ `America/Costa_Rica`. Reuso del helper `startOfDayCostaRicaIso` que ya existe.
- "30 dias" = **rolling 30 dias** desde el momento del request (no calendar months). Decision DT1.
- "Esta semana" = ultimos 7 dias (no semana ISO con lunes-domingo). Mas simple, menos ambiguedad. Decision DT2.

### 10.4 Seguridad

- Las 4 RPCs son `security definer` con grant solo a `service_role`. NO se exponen a `anon/authenticated`. Las server actions las invocan con admin client. Gate de master se hace en `requireMaster()` antes de la RPC.
- RLS sobre `leads`, `conversations`, `messages` igualmente permite SELECT al master via `is_master()` (migration 0006). Las queries directas (no-RPC) usan el user-bound client y son seguras.
- NO hay impersonation cookie checks adicionales — el master puede ver metricas de un cliente sin impersonar (ya estaba habilitado en ADM-2).

---

## 11. Decisiones tecnicas

Tabla de decisiones que tomé como arquitecto. **No reabrir sin razón fuerte.**

| # | Tema | Opciones | Decision | Razon |
|---|---|---|---|---|
| DT1 | Ventana 30 dias | (a) Calendar months (junio completo, mayo completo). (b) Rolling 30 dias desde ahora. | **(b) Rolling.** | (a) crea bordes raros a inicio de mes (datos pobres). (b) siempre representa "los ultimos 30 dias" intuitivamente. |
| DT2 | "Esta semana" | (a) ISO week (lunes-domingo). (b) Ultimos 7 dias rolling. | **(b) Rolling 7 dias.** | Consistencia con DT1. Mas simple. |
| DT3 | Top agentes ventana | (a) Historico total. (b) Ultimos 30d. | **(a) Historico total.** | Falta `leads.assigned_at`. Migrarlo seria scope creep. K4 lo deja documentado para ADM-5. |
| DT4 | Recharts vs SVG custom | (ver §2) | **SVG custom.** | +0 KB bundle, look propio, complejidad media-baja para 1 chart simple. |
| DT5 | Reuso helper TZ | (a) Exportar `startOfDayCostaRicaIso` desde agencies.ts. (b) Duplicar en agencies-metrics.ts. (c) Mover a `lib/format/tz.ts`. | **(c) Mover a `lib/format/tz.ts`.** | Centralizar TZ. Imports limpios. agencies.ts y agencies-metrics.ts importan ambos. Refactor mecanico — backend-builder lo hace en mismo PR. |
| DT6 | Conversion delta unit | Puntos porcentuales (pp) vs % relativo. | **Puntos porcentuales.** | "Pasó de 10% a 12% = +2pp" es la convencion correcta. % relativo (+20%) confunde. |
| DT7 | Lazy load del tab Metricas | (a) Prefetch SSR. (b) Fetch al click. | **(a) Prefetch SSR.** | Render-all-hide-inactive del tabs container ya carga todo en server. Cambio a (b) si medimos >1.5s. |
| DT8 | Top agent count: cuántos | 3 vs 5. | **3** (decision del founder). | Brief explicito. |
| DT9 | Empty state visual | Bloque grande centrado o KPIs con "—". | **Bloque centrado cuando todo es 0; "—" cuando solo un metric es 0.** | Diferencia "cliente nuevo" vs "metric especifica sin datos". |
| DT10 | Bot responder count en avg | Si el bot tarda 5s y el agent tarda 10h, ¿cual cuenta? | **El primero (`LIMIT 1` LATERAL).** | Es lo que realmente respondio al lead. El agent "complementario" no es respuesta. |
| DT11 | Sample size en KPI | Mostrar o no el sample size del avg response time. | **Mostrar.** | Sin sample size, "38s" es engañoso si vino de 2 mensajes. `"38s | basado en 1.2k respuestas"` da confianza. |

---

## 12. Esfuerzo estimado

| Capa | Tarea | Horas |
|---|---|---|
| **Backend** | Migration 0018 con 4 RPCs + indice (escribir + probar local + smoke en sql) | 2-3h |
| Backend | `agencies-metrics.ts` con `getAgencyMetrics` + `listAgenciesResume` (orquestacion + tipos + manejo de errores) | 2-3h |
| Backend | Refactor helper TZ a `lib/format/tz.ts` + import updates | 0.5h |
| Backend | Tipos nuevos en `agencies.types.ts` | 0.3h |
| **Frontend** | `<LeadsPerDayChart>` SVG inline | 1.5-2h |
| Frontend | `<MetricsTab>` con KPIs + chart + top agents + empty states | 2-3h |
| Frontend | Modificar `<AgencyDetailTabs>` (agregar metricas) | 0.5h |
| Frontend | Modificar `page.tsx` del detalle (carga + pase de prop) | 0.3h |
| Frontend | `<AgencyResumeTable>` (table desktop + cards mobile) + integracion en dashboard | 1.5-2h |
| Frontend | Helpers `formatRelativeTime` + `formatDuration` (con tests rapidos visuales) | 0.5h |
| **QA / verify** | Probar local: empty cases, cliente con datos reales, mobile breakpoint, dark mode si aplica | 1-1.5h |
| **Buffer / fricciones** | Sin contar (ya cabe en horquilla 8-16h) | — |
| **TOTAL** | | **12-17h** |

Cabe en el rango objetivo. Si el LATERAL de response time necesita iterar, sumar 1h.

---

## 13. Orden de implementacion sugerido (dependencias)

1. **DT5 first** — mover `startOfDayCostaRicaIso` a `lib/format/tz.ts`. Update imports en `agencies.ts`. (no rompe nada, refactor mecanico).
2. **Migration 0018** — RPCs + indice. Probar via supabase SQL editor con datos reales del proyecto. Validar el LATERAL de response time devuelve numeros razonables.
3. **Tipos** en `agencies.types.ts`.
4. **Server actions** `getAgencyMetrics` + `listAgenciesResume`. Probar invocandolas desde una pagina de scratch.
5. **Helpers de formato** (`formatRelativeTime`, `formatDuration`).
6. **`<LeadsPerDayChart>`** standalone con data hardcoded para iterar el look.
7. **`<MetricsTab>`** integrando todo.
8. **`<AgencyDetailTabs>`** + page del detalle: agregar el tab.
9. **`<AgencyResumeTable>`** + dashboard master.
10. **Verify mobile + empty states**.

---

## 14. NO entran en este spec

Para evitar scope creep durante la implementacion, recordar que estas cosas **NO van**:

- Cablear `is_active` a login del cliente (Bloque B).
- Cablear `is_active` al bot n8n (Bloque B).
- UX polish refinado, micro-animaciones, tooltips custom (Bloque C).
- Filtros de fecha custom — siempre 30d / 7d hardcoded.
- Export CSV.
- Pipeline funnel completo (multi-stage).
- Metricas por canal (WhatsApp / IG / web separadas).
- Comparar agencies side-by-side.
- Drill-down por agente individual.
- Charts globales en el dashboard master.
- Realtime / revalidate corto.
- Indice extra sobre `qualified_set_at` (§9.3 lo descarto).
- Migracion para agregar `leads.assigned_at` (queda registrada como ADM-5 backlog).

---

**Fin del spec ADM-4 Bloque A.**
