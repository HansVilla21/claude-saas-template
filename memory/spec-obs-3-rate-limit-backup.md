# Spec: OBS-3 — Rate limiting del webhook YCloud + Backup verificado

**Fecha:** 2026-06-04
**Autor:** arquitecto
**Bloque:** 4 (Producción segura) — sub-fase 3 de N (OBS-3).
**Trigger:** lanzamiento de Meta Ads la semana del 2026-06-08. Antes de empujar tráfico pago al embudo, el webhook YCloud debe tener freno contra abuso por número y debe existir un procedimiento probado para restaurar la DB ante un incidente.
**Estado relativo:** OBS-1 mergeada (dashboard `/master/salud`). OBS-2 pospuesta (espera Vercel Pro).
**Ruta UI afectada:** ninguna en V1. V2 agrega bloque "Eventos rate-limited 24h" a `/master/salud` (out of scope acá).

---

## 0. Resumen ejecutivo

OBS-3 entrega **dos frentes independientes que comparten ventana de release**:

**A. Rate limiting del webhook YCloud** (crítico pre-ads):
- Nueva tabla `webhook_rate_limit_buckets` con bucket discreto de 1h por `phone_number`.
- Nueva función SQL atómica `check_and_increment_webhook_rate_limit(p_phone, p_threshold, p_window_seconds)` que retorna `{ allowed, current_count, bucket_start }` vía `INSERT ... ON CONFLICT DO UPDATE` (single round-trip).
- Nueva tabla `webhook_rate_limit_drops` para audit de drops (1 row por mensaje silenciosamente descartado).
- Edge function `ycloud-webhook` modificada: ANTES del procesamiento del evento, llama la función; si no allowed, registra drop + retorna 200 OK silencioso. Aplica SOLO a `whatsapp.inbound_message.received` (outbound updates NO consumen budget).
- Threshold V1 hardcoded: **30 mensajes/hora/número** para inbound.
- Degradación segura: si la tabla no existe (deploy edge antes de migration), la edge cae a "allow-all" sin throw.
- Cleanup: vía pg_cron diario (si está habilitado) + lazy inline cada vez que el bucket se renueva (fallback siempre activo).

**B. Backup verificado** (importante, low-effort):
- Doc operativa `docs/operations/runbook-backup-restore.md` con paths exactos del Dashboard, comandos, smoke tests y procedimiento de emergencia.
- Test manual del founder en branch (no producción): crear branch desde backup → verificar counts vs prod → documentar en `docs/operations/backup-test-2026-06-04.md`.
- Política: re-test cada 90 días (anotado en doc y en agenda del founder).

**Versiones resultantes:**
- DB: **1 migration nueva** `0020_webhook_rate_limit.sql` + **1 migration condicional** `0021_pg_cron_cleanup.sql` (aplicar solo si pg_cron está disponible).
- Edge function: `ycloud-webhook/index.ts` bump a `v1.1.0` con 1 check pre-procesamiento.
- Frontend: **0 cambios** (V1 no toca UI).
- Docs: 2 archivos nuevos en `docs/operations/`.

**Hallazgos del audit (importantes para no inventar):**

- Confirmado leyendo `ycloud-webhook/index.ts`: el webhook recibe DOS event types: `whatsapp.inbound_message.received` (línea 891) y `whatsapp.message.updated` (línea 893). El primero es el msj entrante del lead (lo que queremos rate-limitar). El segundo son acks/status de mensajes outbound que enviamos NOSOTROS — vienen disparados por nuestros propios envíos, NUNCA por un atacante. **Decisión: rate-limitar SOLO el inbound.** El outbound update queda fuera del budget.
- El `from` del inbound vive en `payload.whatsappInboundMessage.from` (línea 597). Ya lo normalizamos a dígitos vía `normalizePhone()` (línea 144). Reusamos esta normalización para la key del bucket — garantía de que "+50688888888" y "50688888888" comparten budget.
- El webhook YA loguea el raw payload en `webhook_events_raw` antes de cualquier procesamiento (línea 954). El rate-limit check debe ir **DESPUÉS del log raw + verificación HMAC + parse de event_type** pero **ANTES de `processEvent()`**. Esto deja audit forensic completo incluso para mensajes droppeados.
- Master ya tiene RLS bypass via `is_master()` — el founder puede SELECT en `webhook_rate_limit_drops` directamente desde Supabase Studio sin policy custom adicional para uso V1.
- pg_cron no es accesible vía MCP `list_extensions` con la API key actual del founder (forbidden). **Decisión: arrancamos asumiendo que pg_cron está disponible en Pro y agregamos el migration 0021 como OPCIONAL (el founder aplica solo si `CREATE EXTENSION` no falla). El lazy cleanup garantiza que funciona aunque pg_cron no exista.**
- Supabase Pro daily backups cubren **Postgres + Auth**. NO cubren Storage automáticamente (Storage requiere backup separado via Point-in-Time Recovery o bucket cross-region). Esto va documentado en el runbook como **brecha conocida** porque pronto vamos a tener multimedia (imágenes/audios de WhatsApp).

---

## 1. Problema / requerimiento

### 1.1 Rate limit (parte A)

**Hoy:** `ycloud-webhook` verifica HMAC (autenticidad del origen) y procesa todo lo que llega válido. Sin freno por volumen, cualquier número puede martillar el webhook y disparar una cascada cara:

```
1 inbound → INSERT messages (1) → UPSERT leads (1) → UPSERT conversations (1)
         → trigger webhook a N8N → N8N corre workflow `bot-c v1`
         → N8N llama LLM (Claude/OpenAI) — $$ por turno
         → N8N llama tools (extractor, properties search) — más $$
```

Costo estimado por turno cuando el bot está prendido: **~$0.02-0.05 USD** (modelo + tools). 100 msj abusivos/minuto = $120-300/hora desperdiciado + degradación del bot legítimo + saturación de tareas N8N.

**Lo que queremos:**
- Limit por **número de teléfono `from`** (no por IP — los webhooks llegan desde IPs YCloud, no del atacante).
- Threshold V1: **30 msj/h/número** para `whatsapp.inbound_message.received`. Un lead intenso humano apenas pasa de ~10-15 msj/h. 30 da margen pero tapa al spammer.
- Hit del threshold → **drop silencioso**: registrar en `webhook_rate_limit_drops`, devolver 200 OK a YCloud (no le damos pista al atacante con un 429), **no llamar a `processEvent()`**.
- Cero impacto de latencia para tráfico legítimo: check < 5ms.
- Visibilidad: founder ve drops en Supabase Studio vía `SELECT count(*) FROM webhook_rate_limit_drops WHERE created_at > now() - interval '24 hours'`. V2 agrega bloque al `/master/salud`.

### 1.2 Backup verificado (parte B)

**Hoy:** Supabase Pro hace daily backups de Postgres + Auth automáticamente. **Nunca testeamos restaurarlos.** Si mañana hay un incidente (drop accidental, bug que borra leads, intrusión), vamos a descubrir en el peor momento que:
- No sabemos dónde están los backups exactos.
- No sabemos cómo restaurar a un branch para probar primero.
- No sabemos cómo restaurar a producción sin downtime descontrolado.
- No sabemos si Storage está cubierto.

**Lo que queremos:**
- Runbook paso-a-paso con paths exactos del Dashboard.
- Test del founder en 5 min: restore a un branch → smoke test → documentar.
- Política: re-test cada 90 días.

---

## 2. Estado actual relevante (auditado)

### 2.1 `ycloud-webhook` — puntos clave del flujo

| Línea | Qué pasa |
|---|---|
| 904 | `Deno.serve` entry |
| 906-916 | Health GET (sin cambios) |
| 922-923 | Lectura raw body |
| 932 | `verifyYCloudSignature` |
| 938-942 | Parse JSON + extract event type |
| 949-973 | INSERT `webhook_events_raw` (audit log, NO se toca) |
| 978-989 | Early return si firma inválida (NO se toca) |
| 992-994 | `processEvent(supabase, eventType, payload)` ← **INSERTAR rate-limit ANTES de este punto** |
| 891-896 | `processEvent` router por event type |
| 587-677 | `handleInboundMessage` (inbound, el que queremos limitar) |
| 597 | Extracción de `from` del inbound |
| 144-148 | `normalizePhone()` — solo dígitos |

**Punto de inserción del rate-limit:** entre el log raw + verificación de firma (líneas 949-989) y el `processEvent` (línea 994). El rate-limit aplica SOLO al event type `whatsapp.inbound_message.received` — para `whatsapp.message.updated` (status outbound) el check se salta y se procesa siempre.

### 2.2 Tabla `webhook_events_raw` (referencia para style)

Vive desde migration `0011_webhook_raw_debug.sql`. La nueva tabla de drops sigue patrón similar (audit-only, write-heavy, sin RLS estricto porque solo master/service_role escribe/lee).

### 2.3 Patrón de migration (referencia: 0019)

- Header con descripción de qué hace + idempotencia + decisiones tomadas.
- `create table if not exists` / `create or replace function`.
- Índices con `create index if not exists`.
- Policies dropeadas + recreadas (`drop policy if exists` + `create policy`).
- `grant execute` explícito por función a `authenticated` y/o `service_role`.
- `set search_path = public` en functions security definer.

### 2.4 Recordatorio del workflow Git del founder

Política mergeada: feature branch + Vercel preview + PR + merge a main. Claude NO tiene permisos para aplicar migrations ni deployar edge functions en producción — el founder los aplica vía Dashboard tras review del PR.

---

## 3. Decisiones técnicas

### 3.1 Threshold = 30 msj/hora/número (V1, hardcoded)

**Por qué 30:**
- Lead humano más intenso jamás supera ~15 msj/h sostenido (validado leyendo casos reales de inbox en el CRM).
- Spammer pasa 30 en segundos.
- Damos margen 2x para no atrapar legítimos.

**Por qué hardcoded V1:**
- Configurable por agency requiere UI nueva + migration adicional + UX para que el founder lo cambie.
- V1 cero UI nueva. Si el founder ve drops legítimos en el log, sube el número con SQL update.
- V2 (post-MVP): mover a `agencies.settings_jsonb.webhook_rate_limit_threshold` (o similar) + UI en `/master/clientes/[slug]/configuracion`.

### 3.2 Bucket discreto de 1h (NO sliding window)

**Decisión:** bucket discreto que arranca en el inicio de la hora (truncado a `date_trunc('hour', now())`). Cada `phone_number` tiene una fila por hora con un contador.

**Pseudo-comportamiento:**
```
2026-06-08 14:00:00 — bucket_start=14:00, count=0
2026-06-08 14:05:00 — primer msj → bucket_start=14:00, count=1 (upsert)
2026-06-08 14:55:00 — msj #30 → count=30 (allowed, justo)
2026-06-08 14:55:30 — msj #31 → DROP (count sigue en 30, no incrementa)
2026-06-08 15:00:01 — siguiente msj → bucket_start=15:00, count=1 (allowed, nueva fila o reset)
```

**Por qué NO sliding window:**
- Sliding requiere query con `created_at > now() - interval '1 hour'` + count + decision en código aplicación.
- Bucket discreto es 1 sola `INSERT ON CONFLICT DO UPDATE ... RETURNING` — atómico, sub-1ms en Postgres con índice PK.
- Tolerancia al "burst en boundary": un spammer podría mandar 30 a las 13:59 y 30 a las 14:01 = 60 en 2min. Aceptable para V1: el spam serio es sostenido (cientos/minuto), no este patrón fino.

### 3.3 Drop silencioso (return 200, NO 429)

**Decisión:** mensaje droppeado:
1. INSERT en `webhook_rate_limit_drops` (audit).
2. UPDATE `webhook_events_raw.processing_error = 'skipped: rate_limit_exceeded (count=X, threshold=30)'`.
3. Return JSON con `received: true, processed: false, reason: 'rate_limit_exceeded'` con HTTP 200.

**Por qué 200 y NO 429:**
- 429 le confirma al atacante que hay un rate-limit activo y le permite calibrar.
- YCloud verá 200 y considerará el webhook entregado (no reintenta).
- Para nuestro audit, el `webhook_events_raw` + `webhook_rate_limit_drops` nos da el detalle completo.

**Por qué INSERTAR raw incluso si lo droppeamos:** porque el log raw es defensa forensic. Si un día decidimos auditar "qué tan abusado nos están", el raw está. Si después queremos purgar, lo hacemos por tabla aparte (drops es chica, raw es grande pero ya tiene TTL implícito por el patrón de la tabla).

### 3.4 Tabla separada `webhook_rate_limit_drops` (NO flag en `messages`)

**Razones:**
- Limpieza: `messages` solo tiene mensajes que SÍ procesamos. Mezclar drops contamina queries de inbox/dashboard.
- Bytes: drops puede crecer con un ataque (10k rows/hora durante un incidente). No queremos vacuum forzado en `messages`.
- Purga independiente: drops se puede truncar por hora vieja sin afectar nada productivo.
- Schema simple: solo `phone_number`, `event_type`, `current_count`, `threshold`, `webhook_event_raw_id` (FK), `created_at`.

### 3.5 Función SQL atómica `check_and_increment_webhook_rate_limit`

**Diseño (firma SQL):**
```sql
create or replace function public.check_and_increment_webhook_rate_limit(
    p_phone_number text,
    p_threshold int,
    p_window_seconds int
) returns table (
    allowed boolean,
    current_count int,
    bucket_start timestamptz,
    threshold int
)
```

**Comportamiento:**
1. Calcula `bucket_start = date_trunc('hour', now())` (V1: bucket fijo de 1h, ignora `p_window_seconds` salvo para construir el truncamiento — pasamos 3600 explícito para futureproof).
2. `INSERT INTO webhook_rate_limit_buckets (phone_number, bucket_start, count) VALUES (p_phone_number, bucket_start, 1) ON CONFLICT (phone_number, bucket_start) DO UPDATE SET count = webhook_rate_limit_buckets.count + 1, updated_at = now() RETURNING count` — atómico, no race.
3. Si el `count` retornado **<= p_threshold**, retorna `allowed=true`.
4. Si **> p_threshold**, retorna `allowed=false` y el caller decide qué hacer.
5. **Note importante:** el incremento corre SIEMPRE (incluso para drops). Por qué: si tracking exacto del attack volume es importante. Si decidimos NO incrementar después de hit (para evitar que la tabla crezca sin control bajo ataque sostenido), cambiamos a CHECK-FIRST sin upsert. **V1 incrementa siempre** — el atacante tiene ya su row del bucket, y +1 es trivial. Lazy cleanup borra al final.

**Atómico vs race condition:** dos webhooks concurrentes del mismo número en el mismo bucket-hour → ambos hacen INSERT ON CONFLICT DO UPDATE; Postgres serializa por PK lock. Garantía: nunca count "salta" o "se duplica".

**SECURITY DEFINER + search_path:** función security definer para que la llame el service_role del edge function sin tocar policies. `set search_path = public` previene injection vía search_path manipulation.

### 3.6 Cleanup: pg_cron + lazy fallback

**Estrategia:**
1. **pg_cron diario (`0021_pg_cron_cleanup.sql`, opcional):** si pg_cron está disponible, agenda `cleanup_webhook_rate_limit_buckets()` a las 03:00 UTC cada día. Esta función hace `DELETE FROM webhook_rate_limit_buckets WHERE updated_at < now() - interval '2 hours'` y `DELETE FROM webhook_rate_limit_drops WHERE created_at < now() - interval '30 days'` (drops se retienen 30 días para audit).
2. **Lazy fallback (siempre activo):** la función `check_and_increment_webhook_rate_limit` opcionalmente puede hacer `DELETE FROM webhook_rate_limit_buckets WHERE phone_number = p_phone_number AND bucket_start < date_trunc('hour', now()) - interval '1 hour'` antes del upsert. Costo: 1 DELETE adicional por call (~1ms con índice). Garantiza que la tabla nunca crece sin freno aunque pg_cron no exista.

**Decisión final:** **implementar AMBOS.** Lazy cleanup baseline + pg_cron como optimización si está disponible. El founder NO depende de pg_cron para que esto funcione.

### 3.7 Degradación segura si tabla no existe

**Problema:** el deploy ideal es migration ANTES de edge function. Si por error se invierte el orden y la edge nueva llega antes que la migration, el RPC fallaría con "function does not exist" y todos los webhooks empezarían a retornar 500.

**Mitigación:** wrap la RPC call en try/catch. Si falla con código `42883` (undefined_function) o `42P01` (undefined_table), log warning + **proceder con `allowed=true`** (fail-open). Esto garantiza que un deploy inverso NO rompe inbound legítimo. El downside (rate limit no activo unos segundos) es ínfimo comparado con perder todos los mensajes.

```typescript
// Pseudo:
let rateCheck;
try {
  rateCheck = await supabase.rpc('check_and_increment_webhook_rate_limit', {...});
  if (rateCheck.error) {
    if (rateCheck.error.code === '42883' || rateCheck.error.code === '42P01') {
      console.warn('rate_limit_table_missing — failing open');
      // proceed
    } else {
      throw rateCheck.error;
    }
  }
} catch (err) {
  console.error('rate_limit_check_threw — failing open:', err);
  // proceed
}
```

### 3.8 Rate limit aplica SOLO a `whatsapp.inbound_message.received`

**Por qué:** el otro event type del webhook (`whatsapp.message.updated`) son acks/status de mensajes que ENVIAMOS nosotros. Son disparados por nuestro propio outbound flow, NO por un atacante externo. Rate-limitarlos rompería nuestro tracking de delivery/read sin ganancia.

**Implementación:**
```typescript
if (eventType === 'whatsapp.inbound_message.received') {
  const from = payload?.whatsappInboundMessage?.from;
  const normalized = normalizePhone(from);
  if (normalized) {
    // run rate limit check
  }
  // si no hay from o no normaliza, dejar pasar (es un evento raro, lo log raw ya captura)
}
// otros event types: skip check, ir directo a processEvent
```

### 3.9 NO migración a Upstash / Cloudflare / in-memory

Confirmando lo que ya planteaste:
- **Upstash Redis:** dep nueva, costo extra, latencia red adicional. Postgres ya está en el path, ON CONFLICT DO UPDATE es atómico y sub-ms con PK lock.
- **Cloudflare rate limiting:** webhook vive en Supabase Edge, no detrás de CF.
- **In-memory en Deno worker:** workers stateless, sin sticky sessions. No funciona.

**Postgres-based es la elección correcta V1.**

---

## 4. Modelo de datos

### 4.1 Tabla `webhook_rate_limit_buckets`

```sql
create table if not exists public.webhook_rate_limit_buckets (
    phone_number    text         not null,
    bucket_start    timestamptz  not null,
    count           int          not null default 0,
    created_at      timestamptz  not null default now(),
    updated_at      timestamptz  not null default now(),
    primary key (phone_number, bucket_start)
);

-- Índice de apoyo para cleanup por updated_at (lazy + pg_cron):
create index if not exists idx_webhook_rate_limit_buckets_updated
    on public.webhook_rate_limit_buckets(updated_at);
```

**Tamaño estimado:**
- 1 row por (número, hora). Si tenemos 1000 números únicos/día activos: 24 rows/día/número = 24k rows/día → ~7M rows/año sin cleanup.
- Con cleanup (lazy + pg_cron) que borra buckets > 2h viejos: ~1000 rows en steady state. Trivial.

**Por qué no usar `created_at` como PK component:** queremos que múltiples msj del mismo bucket-hour del mismo número COMPARTAN row (con count++), no que se inserten N filas. `bucket_start` truncado a la hora garantiza esto.

### 4.2 Tabla `webhook_rate_limit_drops`

```sql
create table if not exists public.webhook_rate_limit_drops (
    id                          uuid         primary key default gen_random_uuid(),
    phone_number                text         not null,
    event_type                  text         not null,
    bucket_start                timestamptz  not null,
    current_count               int          not null,
    threshold                   int          not null,
    webhook_event_raw_id        uuid         references public.webhook_events_raw(id) on delete set null,
    created_at                  timestamptz  not null default now()
);

create index if not exists idx_webhook_rate_limit_drops_phone_created
    on public.webhook_rate_limit_drops(phone_number, created_at desc);
create index if not exists idx_webhook_rate_limit_drops_created
    on public.webhook_rate_limit_drops(created_at desc);
```

**Tamaño estimado en condiciones normales:** ~0 rows. Bajo ataque: puede crecer rápido — por eso cleanup borra > 30 días.

**FK a `webhook_events_raw`:** permite drill-down del raw payload del msj droppeado (útil para auditar después).

### 4.3 RLS

```sql
alter table public.webhook_rate_limit_buckets enable row level security;
alter table public.webhook_rate_limit_drops enable row level security;

-- Solo master ve estas tablas (audit interno).
create policy webhook_rate_limit_buckets_select on public.webhook_rate_limit_buckets
    for select using (is_master());

create policy webhook_rate_limit_drops_select on public.webhook_rate_limit_drops
    for select using (is_master());

-- Write: solo service_role (el edge function). NO authenticated.
-- (Sin policy de INSERT/UPDATE/DELETE → bloqueado para authenticated por default
--  con RLS enabled. service_role bypassa RLS, así que escribe sin policy.)
```

### 4.4 Función `check_and_increment_webhook_rate_limit`

```sql
create or replace function public.check_and_increment_webhook_rate_limit(
    p_phone_number text,
    p_threshold int default 30,
    p_window_seconds int default 3600
)
returns table (
    allowed         boolean,
    current_count   int,
    bucket_start    timestamptz,
    threshold       int
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_bucket_start  timestamptz;
    v_count         int;
begin
    -- V1: window fijo de 1 hora (p_window_seconds reservado para futureproof).
    v_bucket_start := date_trunc('hour', now());

    -- Lazy cleanup del bucket previo del mismo número (no acumular para siempre).
    delete from public.webhook_rate_limit_buckets
    where phone_number = p_phone_number
      and bucket_start < v_bucket_start - interval '1 hour';

    -- Upsert atómico: insert si no existe, incrementa si existe.
    insert into public.webhook_rate_limit_buckets (phone_number, bucket_start, count)
    values (p_phone_number, v_bucket_start, 1)
    on conflict (phone_number, bucket_start) do update
        set count = public.webhook_rate_limit_buckets.count + 1,
            updated_at = now()
    returning public.webhook_rate_limit_buckets.count into v_count;

    return query select
        (v_count <= p_threshold)::boolean as allowed,
        v_count as current_count,
        v_bucket_start as bucket_start,
        p_threshold as threshold;
end;
$$;

grant execute on function public.check_and_increment_webhook_rate_limit(text, int, int)
    to service_role;
-- Authenticated NO necesita execute (solo service_role del edge llama esta función).
```

### 4.5 Función de cleanup (para pg_cron + uso manual)

```sql
create or replace function public.cleanup_webhook_rate_limit()
returns table (buckets_deleted int, drops_deleted int)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_buckets_del int;
    v_drops_del   int;
begin
    delete from public.webhook_rate_limit_buckets
    where updated_at < now() - interval '2 hours';
    get diagnostics v_buckets_del = row_count;

    delete from public.webhook_rate_limit_drops
    where created_at < now() - interval '30 days';
    get diagnostics v_drops_del = row_count;

    return query select v_buckets_del, v_drops_del;
end;
$$;

grant execute on function public.cleanup_webhook_rate_limit() to service_role;
```

### 4.6 Migración opcional `0021_pg_cron_cleanup.sql`

```sql
-- =============================================================================
-- Momentum AI CRM — Migration 0021: pg_cron schedule del cleanup de rate limit
-- =============================================================================
-- OPCIONAL. Aplicar SOLO si pg_cron está habilitado en el proyecto Supabase.
-- Si CREATE EXTENSION falla con "must be superuser" o similar, abortar y
-- confiar en el lazy cleanup de la función check_and_increment_webhook_rate_limit
-- (que ya borra buckets > 1h del mismo número en cada call).
-- =============================================================================

create extension if not exists pg_cron with schema extensions;

-- Schedule: 03:00 UTC daily.
-- Si la tarea ya existe (re-aplicar la migration), unschedule primero por idempotencia.
do $$
begin
    perform cron.unschedule('cleanup_webhook_rate_limit_daily');
exception when others then
    -- job no existía, ignorar
    null;
end $$;

select cron.schedule(
    'cleanup_webhook_rate_limit_daily',
    '0 3 * * *',
    $$ select public.cleanup_webhook_rate_limit(); $$
);
```

---

## 5. Estructura de archivos a crear / modificar

### 5.1 Crear

| Archivo | Tipo | Responsabilidad |
|---|---|---|
| `crm-v2/supabase/migrations/0020_webhook_rate_limit.sql` | SQL migration | Tablas `webhook_rate_limit_buckets` + `webhook_rate_limit_drops` + funciones + RLS + índices |
| `crm-v2/supabase/migrations/0021_pg_cron_cleanup.sql` | SQL migration (opcional) | Schedule diario del cleanup. Aplicar SOLO si `pg_cron` está disponible. Documentar en header que es opcional |
| `crm-v2/docs/operations/runbook-backup-restore.md` | Doc | Procedimientos paso-a-paso de backup/restore |
| `crm-v2/docs/operations/backup-test-2026-06-04.md` | Doc | Registro histórico del primer test del founder (template; founder completa al ejecutar) |
| `crm-v2/scripts/test-rate-limit.mjs` | Node script | 35 POSTs al webhook con HMAC válido para validar T1-T5 sin esperar trafico real |

### 5.2 Modificar

| Archivo | Cambio |
|---|---|
| `crm-v2/supabase/functions/ycloud-webhook/index.ts` | Bump `FN_VERSION` a `"1.1.0"`. Agregar constante `INBOUND_RATE_LIMIT_PER_HOUR = 30`. Insertar block de rate-limit check después de la verificación HMAC + log raw, antes de `processEvent`. Solo aplica a `whatsapp.inbound_message.received`. Si dropeado: INSERT en `webhook_rate_limit_drops` + UPDATE `webhook_events_raw.processing_error` + return 200 con JSON `{ processed: false, reason: 'rate_limit_exceeded' }`. Wrap RPC call con try/catch fail-open (códigos 42883 / 42P01 → log warning + proceed) |

### 5.3 No tocar

- ❌ NO modificar otras migrations.
- ❌ NO modificar el flujo de procesamiento del webhook (`handleInboundMessage` / `handleMessageUpdated`).
- ❌ NO agregar UI nueva (V1 sin cambios en frontend).
- ❌ NO tocar N8N.

### 5.4 Detalle del cambio en `ycloud-webhook/index.ts`

**Bloque a insertar entre línea 989 (end of "signature invalid" branch) y línea 992 ("3. Procesar el evento"):**

```typescript
// Pseudo (el builder ajusta a estilo del archivo):

const INBOUND_EVENT = "whatsapp.inbound_message.received";
const INBOUND_RATE_LIMIT = 30;   // V1 hardcoded, V2 mover a settings por agency
const INBOUND_WINDOW_SECONDS = 3600;

// 2.5 Rate limit check (solo para inbound de mensajes del lead).
// Otros event types (whatsapp.message.updated, etc.) pasan directo a processEvent.
if (eventType === INBOUND_EVENT) {
  const inboundMsg = (payload as Record<string, unknown> | null)?.whatsappInboundMessage as
    Record<string, unknown> | undefined;
  const fromRaw = typeof inboundMsg?.from === "string" ? inboundMsg.from : null;
  const fromNormalized = normalizePhone(fromRaw);

  if (fromNormalized) {
    let rateAllowed = true;
    let rateCount = 0;
    let rateBucket: string | null = null;

    try {
      const { data: rateData, error: rateErr } = await supabase.rpc(
        "check_and_increment_webhook_rate_limit",
        {
          p_phone_number: fromNormalized,
          p_threshold: INBOUND_RATE_LIMIT,
          p_window_seconds: INBOUND_WINDOW_SECONDS,
        },
      );
      if (rateErr) {
        // Fail-open: si la función o tabla no existen (deploy out-of-order),
        // log warning y dejar pasar. Cualquier otro error también fail-open
        // para no perder mensajes legítimos por bugs en el rate-limit infra.
        const failOpenCodes = ["42883", "42P01"];
        if (failOpenCodes.includes(rateErr.code ?? "")) {
          console.warn("rate_limit_infra_missing — failing open:", rateErr.code);
        } else {
          console.error("rate_limit_check_error — failing open:", rateErr);
        }
      } else if (rateData && Array.isArray(rateData) && rateData.length > 0) {
        rateAllowed = rateData[0].allowed === true;
        rateCount = rateData[0].current_count ?? 0;
        rateBucket = rateData[0].bucket_start ?? null;
      }
    } catch (err) {
      console.error("rate_limit_check_threw — failing open:", err);
    }

    if (!rateAllowed) {
      // Drop silencioso: registrar + actualizar raw + retornar 200 sin procesar.
      await supabase.from("webhook_rate_limit_drops").insert({
        phone_number: fromNormalized,
        event_type: eventType,
        bucket_start: rateBucket,
        current_count: rateCount,
        threshold: INBOUND_RATE_LIMIT,
        webhook_event_raw_id: rawId,
      });

      await supabase
        .from("webhook_events_raw")
        .update({
          processing_error: `skipped: rate_limit_exceeded (count=${rateCount}, threshold=${INBOUND_RATE_LIMIT})`,
        })
        .eq("id", rawId);

      return new Response(
        JSON.stringify({
          received: true,
          signature_valid: true,
          event_type: eventType,
          processed: false,
          reason: "rate_limit_exceeded",
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }
  }
}

// 3. Procesar el evento. (línea actual 992)
```

**Notas críticas para el builder:**
- El `INSERT` en `webhook_rate_limit_drops` NO se wrappea en try/catch crítico — si falla, log + continúa con el return 200. Mejor perder una row de audit que romper el flujo del webhook.
- `rawId` viene de la línea 975 actual — está disponible en este scope.
- El `return` corta el flujo: NO se llega a `processEvent`, NO se hace el update final de `processed_at`.

### 5.5 Detalle del script `test-rate-limit.mjs`

```javascript
// crm-v2/scripts/test-rate-limit.mjs
// Envía N requests sintéticos al webhook ycloud-webhook con HMAC válido
// para validar comportamiento del rate-limit sin esperar trafico real.
//
// Uso:
//   node scripts/test-rate-limit.mjs --count 35 --phone 50688888888
//
// Requiere YCLOUD_WEBHOOK_SECRET y SUPABASE_PROJECT_REF en .env.local
// (o pasados como env vars).

import crypto from "node:crypto";

const SECRET = process.env.YCLOUD_WEBHOOK_SECRET;
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF;
const URL = `https://${PROJECT_REF}.supabase.co/functions/v1/ycloud-webhook`;

// Parse args ...
// Construir payload sintético tipo whatsapp.inbound_message.received ...
// Para cada N:
//   t = Math.floor(Date.now() / 1000)
//   body = JSON.stringify(payload con wamid único por iteración)
//   signedPayload = `${t}.${body}`
//   sig = crypto.createHmac('sha256', SECRET).update(signedPayload).digest('hex')
//   header `ycloud-signature: t=${t},s=${sig}`
//   POST y log status + response.processed/reason
```

(Implementación completa la hace el builder — patrón claro.)

---

## 6. Riesgos y mitigaciones

| # | Riesgo | Prob | Impacto | Mitigación |
|---|---|---|---|---|
| R1 | Race condition entre 2 inbounds simultáneos del mismo número | Alta | Bajo | Cubierto: `INSERT ... ON CONFLICT DO UPDATE` con PK lock es atómico en Postgres |
| R2 | Migration NO aplicada antes que la edge nueva — webhooks rotos | Baja | Alto | Fail-open: try/catch + códigos 42883/42P01 → log + proceed. Edge NO retorna 500 |
| R3 | Edge nueva NO desplegada después de migration — rate-limit inactivo | Baja | Bajo | Si migration está pero edge vieja, simplemente nadie llama a la RPC. Cero downside (lo único es que el rate-limit no actúa hasta el redeploy de edge). Founder debe deployar edge tras migration |
| R4 | Threshold 30/h captura legítimos en horario pico | Baja | Medio | Founder monitorea `SELECT phone_number, count(*) FROM webhook_rate_limit_drops WHERE created_at > now() - interval '24h' GROUP BY phone_number`. Si un legítimo aparece, sube threshold con `update` a la constante en edge (re-deploy) o pasa a config-by-agency V2 |
| R5 | Tabla `webhook_rate_limit_buckets` crece sin freno si cleanup falla | Baja | Bajo | Triple defensa: lazy cleanup en cada call (siempre activo), pg_cron diario (si disponible), tamaño máximo bajo control natural por bucket discreto (1 row/número/hora). Worst case sin cleanup: ~10k rows/día = ~3.5M/año = ~10MB. Manageable |
| R6 | Atacante usa N números diferentes para evadir | Media | Medio | V1 acepta este límite (rate-limit por número, NO por origen). V2: agregar rate-limit secundario por agency (suma de todos los inbound a ese WhatsApp number business) — fuera de scope OBS-3 |
| R7 | Backup no incluye Storage (multimedia) | Alta | Medio (creciente) | Documentado en runbook. Solución V2 (post-multimedia): habilitar PITR o cross-region replication para Storage buckets. NO bloqueante para OBS-3 |
| R8 | Founder no ejecuta test del runbook | Media | Alto | Doc tiene checklist exacto + tiempo estimado (5 min). Spec marca este test como gate antes de Meta Ads launch. Si founder no ejecuta, la spec NO está completa |
| R9 | Bug en `check_and_increment_webhook_rate_limit` retorna NULL en `allowed` | Baja | Alto | Test T1 valida el happy path. Edge code defaultea a `allowed=true` si data viene malformada (defensa) |
| R10 | pg_cron NO disponible en Supabase Pro del founder | Media | Bajo | Lazy cleanup garantiza correctness sin pg_cron. Migration 0021 marcada explícitamente como opcional |
| R11 | `INSERT` en `webhook_rate_limit_drops` falla y rompe el flujo | Baja | Medio | No wrappear en try/catch crítico — si falla, log y seguir el return 200. Perder audit de 1 drop es OK; romper webhook NO |
| R12 | Logs de Supabase llenos de "rate_limit_check_error" si la RPC sigue rota | Baja | Bajo | Fail-open + log. Founder ve los logs en Dashboard, decide intervención. NO afecta correctness del webhook |

---

## 7. Plan de testing

### 7.1 Rate limiting — tests automatizados con script

**Setup local (pre-deploy):**
- Branch `feat/obs-3-rate-limit-backup`.
- Migration 0020 aplicada en localhost (`supabase db push` o equivalente, o aplicada manualmente via psql al proyecto remoto vía PR review).
- Edge function `ycloud-webhook` con cambios deployada al proyecto Supabase (Dashboard manual o `supabase functions deploy ycloud-webhook`).
- `.env.local` con `YCLOUD_WEBHOOK_SECRET` y `SUPABASE_PROJECT_REF`.

**Casos:**

**T1 — Happy path (1 msj):**
```bash
node scripts/test-rate-limit.mjs --count 1 --phone 5068811TESTPHONE1
```
- ✅ Response 200, `processed: true`, sin `reason`.
- ✅ Supabase Studio: `SELECT * FROM webhook_rate_limit_buckets WHERE phone_number = '5068811TESTPHONE1'` → 1 row, count=1.
- ✅ `webhook_events_raw` tiene 1 row con `processed_at != null`.

**T2 — 30 msj rápidos (al límite):**
```bash
node scripts/test-rate-limit.mjs --count 30 --phone 5068811TESTPHONE2
```
- ✅ Todos retornan 200 con `processed: true`.
- ✅ Buckets row con count=30.
- ✅ Cero rows en `webhook_rate_limit_drops` para este número.

**T3 — Mensaje 31 (drop silencioso):**
```bash
# Continuar desde T2 mismo número
node scripts/test-rate-limit.mjs --count 1 --phone 5068811TESTPHONE2
```
- ✅ Response 200 (NO 429), `processed: false`, `reason: 'rate_limit_exceeded'`.
- ✅ `webhook_rate_limit_drops` tiene 1 row para este número con `current_count=31`, `threshold=30`.
- ✅ `webhook_events_raw` tiene la row con `processing_error LIKE 'skipped: rate_limit_exceeded%'`.
- ✅ NO se creó mensaje en `messages` ni se invocó N8N (verificar `SELECT * FROM messages WHERE wa_message_id = '<wamid-del-msj-31>'` → 0 rows).

**T4 — Bucket reset por cambio de hora:**
- Esperar hasta `date_trunc('hour', now()) + interval '1 hour'` (o forzar manualmente UPDATE `bucket_start` del row a `now() - interval '1 hour'` para simular).
- ```bash
  node scripts/test-rate-limit.mjs --count 1 --phone 5068811TESTPHONE2
  ```
- ✅ Response 200, `processed: true`.
- ✅ Nuevo row en buckets con `bucket_start` de la hora actual, count=1.
- ✅ El row viejo (hora anterior) eliminado por lazy cleanup.

**T5 — Aislamiento por número:**
- Con `5068811TESTPHONE2` en estado dropeado (post T3 sin esperar T4):
- ```bash
  node scripts/test-rate-limit.mjs --count 1 --phone 5068811TESTPHONE3
  ```
- ✅ Response 200, `processed: true`. TESTPHONE3 no está afectado por TESTPHONE2.

**T6 — Fail-open con tabla faltante (simulación):**
- Renombrar temporalmente la función: `ALTER FUNCTION check_and_increment_webhook_rate_limit RENAME TO check_and_increment_webhook_rate_limit_disabled`.
- ```bash
  node scripts/test-rate-limit.mjs --count 1 --phone 5068811TESTPHONE4
  ```
- ✅ Response 200, `processed: true` (fail-open).
- ✅ Logs de edge function: warning "rate_limit_infra_missing".
- Restaurar nombre original.

**Limpieza post-tests:**
```sql
DELETE FROM webhook_rate_limit_buckets WHERE phone_number LIKE '5068811TESTPHONE%';
DELETE FROM webhook_rate_limit_drops WHERE phone_number LIKE '5068811TESTPHONE%';
DELETE FROM messages WHERE wa_user_id LIKE '5068811TESTPHONE%';
DELETE FROM leads WHERE wa_user_id LIKE '5068811TESTPHONE%';
DELETE FROM webhook_events_raw WHERE raw_payload::text LIKE '%5068811TESTPHONE%';
```

### 7.2 Backup verificado — tests manuales del founder

**T7 — Founder ejecuta runbook:**
- Leer `docs/operations/runbook-backup-restore.md` end-to-end.
- Crear branch nuevo desde último backup automático.
- Smoke test SQL (queries del runbook): SELECT count(*) en `leads`, `messages`, `conversations`, `bot_turns`, `webhook_events_raw`.
- Comparar contra producción: deltas razonables (branch puede tener algunas horas menos de data).
- Eliminar branch tras test.
- ✅ Test completo en < 10 min.

**T8 — Founder completa registro histórico:**
- Llenar `docs/operations/backup-test-2026-06-04.md` con:
  - Fecha exacta del backup restaurado.
  - Counts de prod vs branch (tabla comparativa).
  - Tiempo total del procedimiento.
  - Issues encontrados (si alguno).
  - Próximo test agendado: 2026-09-04 (90 días).

---

## 8. Deploy plan (orden importa)

**Pre-condición:** rama `feat/obs-3-rate-limit-backup` con todos los archivos creados/modificados según §5.

### 8.1 Pasos en orden

1. **Founder revisa PR** en GitHub (Vercel preview se construye automático — pero V1 no tiene cambios de UI, así que el preview no demuestra mucho). Aprueba si los SQL/edge code son correctos.
2. **Founder aplica migration 0020 vía Supabase Dashboard SQL Editor** (paste del contenido de `0020_webhook_rate_limit.sql` y run). Verificar que crea las 2 tablas + 2 funciones sin errores.
3. **Founder INTENTA aplicar migration 0021** (también via SQL Editor). Si falla con error de permisos sobre `pg_cron`, ABORTAR sin pánico — el lazy cleanup ya cubre. Si funciona, verificar `SELECT * FROM cron.job WHERE jobname = 'cleanup_webhook_rate_limit_daily'`.
4. **Founder deploya la edge function ycloud-webhook nueva versión** vía Dashboard → Edge Functions → ycloud-webhook → Deploy nueva versión con el `index.ts` modificado. Verificar que `GET <function-url>` devuelva `version: "1.1.0"`.
5. **Smoke test T1 en producción** (con un número de prueba real desde el WhatsApp del founder, o con el script `test-rate-limit.mjs` apuntando a prod). Validar 1 happy path antes de seguir.
6. **Merge PR a main** (Vercel auto-deploy del frontend — no impacta porque app no usa estas tablas todavía).
7. **Smoke tests T2-T5 en producción** con script (números sintéticos `5068811TESTPHONE*`). Limpiar después.
8. **Founder ejecuta runbook backup T7 + T8** (puede ser asíncrono, dentro de 48h post-deploy, antes de Meta Ads launch).

### 8.2 Rollback plan

**Si T1 falla en producción tras deploy:**
- Deploy de la versión vieja del edge function (Dashboard → Edge Functions → ycloud-webhook → history → re-deploy v1.0.0). Inmediato.
- La migration NO necesita rollback — las tablas vacías son inertes.
- Si quisiéramos limpiar completamente: `DROP TABLE webhook_rate_limit_buckets, webhook_rate_limit_drops CASCADE; DROP FUNCTION check_and_increment_webhook_rate_limit, cleanup_webhook_rate_limit;` (no urgente).

---

## 9. Trade-offs y alternativas descartadas

| Decisión tomada | Alternativa descartada | Por qué |
|---|---|---|
| Bucket discreto 1h | Sliding window con timestamps por msj | Bucket es 1 query atómica, sub-ms. Sliding requiere COUNT con WHERE time-range, más caro. Tolerancia a "burst en boundary" aceptable V1 |
| 30 msj/h hardcoded | Configurable por agency | Configurable requiere UI nueva. V1 cero UI. Hardcoded permite Meta Ads launch sin trabajo extra |
| Rate limit por phone_number | Por IP / por agency / por usuario YCloud | IP no aplica (webhooks llegan de YCloud). Por agency captura todo el tráfico legítimo (downside grande). Phone es la unidad correcta |
| Drop silencioso 200 | Return 429 + Retry-After | 429 le da pistas al atacante. 200 silencioso es indistinguible de procesamiento normal desde afuera |
| Postgres-based | Upstash Redis | Postgres ya está en path. Atomic UPSERT cubre el caso. Una dep menos |
| Tabla separada drops | Flag en `messages` | `messages` debe quedar limpio. Drops es write-only audit con TTL distinto |
| Lazy cleanup + pg_cron opcional | Solo pg_cron | Lazy garantiza correctness aunque pg_cron no exista. pg_cron es optimización para limpieza programada profunda |
| Fail-open en RPC error | Fail-closed (rechazar webhook si rate-limit infra rota) | Perder mensajes legítimos por bug en rate-limit es peor que tolerar abuso temporal. Fail-open + alerta en logs es la jugada correcta |
| Rate limit solo inbound | También status updates | Status updates vienen de NUESTRO outbound, no de atacantes. Limitarlos rompe tracking sin upside |

---

## 10. Costo estimado

**Supabase:**
- Tabla buckets: ~1k-10k rows steady state con cleanup. Negligible.
- Tabla drops: ~0 rows normal, picos bajo ataque. Negligible.
- Función `check_and_increment_webhook_rate_limit`: 1 call por inbound. Con tráfico Meta Ads esperado (100-500 inbounds/día), 100-500 calls/día. Cada call ~1ms. Trivial.
- pg_cron daily cleanup: 1 call/día, ~10ms. Trivial.

**Edge function:**
- 1 RPC adicional por inbound. ~5-10ms extra de latencia.
- ZERO impact en outbound updates (no check).

**Costo incremental mensual:** **$0**. Todo dentro de Supabase Pro existente.

---

## 11. Trabajo NO incluido (next phases)

**OBS-3 (esta spec) cubre:** rate-limit del webhook YCloud + runbook backup.

**Fuera de scope OBS-3 (futuro):**
- **Bloque "Eventos rate-limited 24h" en `/master/salud`** (OBS-3.1): mostrar count de drops + top números abusivos. Es 1 query SQL + 1 componente. Probablemente próxima sub-fase tras Meta Ads launch.
- **Rate limit configurable por agency** (post-MVP): mover `INBOUND_RATE_LIMIT_PER_HOUR` a `agencies.settings_jsonb` + UI en `/master/clientes/[slug]/configuracion`.
- **Rate limit secundario por agency** (cuando R6 se materialice): proteger contra atacante que rota números — sumar inbounds totales a un mismo WhatsApp business number.
- **Backup de Storage cross-region** (cuando entre multimedia): PITR o replicación cross-region de buckets.
- **Backup restore automatizado mensual a branch** (madurez ops): scheduled function que crea branch, restore, smoke test, drop branch. Reporte por email/Telegram.

---

## 12. Checklist pre-PR (que backend-builder marca antes de pedir review)

- [ ] Migration 0020 creada con header consistente con 0019 (decisiones, idempotente, re-corrible)
- [ ] Tablas `webhook_rate_limit_buckets` y `webhook_rate_limit_drops` con índices y RLS
- [ ] Función `check_and_increment_webhook_rate_limit` atómica con `INSERT ON CONFLICT DO UPDATE RETURNING`
- [ ] Función `cleanup_webhook_rate_limit` que devuelve counts borrados
- [ ] Migration 0021 opcional con `do $$ ... exception ... end` para idempotencia del schedule
- [ ] Edge function `ycloud-webhook` v1.1.0: rate-limit check antes de processEvent
- [ ] Rate-limit check solo aplica a `whatsapp.inbound_message.received`
- [ ] Fail-open con códigos 42883/42P01 (función/tabla no existe)
- [ ] Drop silencioso retorna 200 con `processed: false, reason: 'rate_limit_exceeded'`
- [ ] INSERT en `webhook_rate_limit_drops` NO wrappea en try/catch crítico
- [ ] `FN_VERSION` actualizado a "1.1.0"
- [ ] Script `test-rate-limit.mjs` funcional para T1-T6
- [ ] Runbook `runbook-backup-restore.md` con paths exactos del Dashboard
- [ ] Template `backup-test-2026-06-04.md` con secciones para que el founder complete
- [ ] Nada modificado en frontend
- [ ] Nada modificado en otras edge functions ni migrations
- [ ] N8N intacto

---

## 13. Estimación

**Tamaño:** **Medium** (más cerca de Small que de Large).

Razones:
- 1 migration con tablas + funciones + RLS — patrón estándar, 2-3h.
- 1 edge function con cambio quirúrgico — ~50 líneas adicionales, 1-2h.
- 1 migration opcional pg_cron — 30 min.
- 1 script de test — 1-2h.
- 2 docs operativos — 1h (runbook detallado + template del registro).
- Total backend-builder: ~6-9h de trabajo focused. **Plus** review + founder aplicando + smoke tests.

No es Small porque la parte del edge function requiere cuidado: fail-open correcto, return 200 silencioso, no romper el flujo existente, logging adecuado. Pero no es Large porque no toca arquitectura.

---

## 14. Handoff a builders

**backend-builder:**
- Implementa migration 0020 + 0021 siguiendo estilo exacto de 0019.
- Implementa cambio en `ycloud-webhook/index.ts` siguiendo el pseudo-código de §5.4.
- Implementa script `test-rate-limit.mjs` siguiendo el patrón de §5.5.
- Genera template del runbook y del registro de test siguiendo lo descrito en §1.2 y §7.2.
- **Para los paths exactos del Dashboard Supabase Pro:** consultar via `mcp__supabase__search_docs` con queries específicas ("how to restore database backup", "create branch from backup", "point in time recovery"). Si encuentras paths ambiguos, marcar `<verificar en Dashboard>` para que el founder confirme.
- **No tocar frontend.** Esta spec no tiene cambios de UI V1.

**Founder (quien aplica deploy):**
- Apply migration 0020 vía Dashboard SQL Editor.
- Intentar 0021 — abortar sin pánico si pg_cron no permitido.
- Deploy nueva versión de `ycloud-webhook` vía Dashboard.
- Smoke tests T1-T6 (puede correr `test-rate-limit.mjs` desde local apuntando a producción).
- Ejecutar runbook backup T7 + T8 dentro de 48h del deploy.

**Quien revise (code-reviewer o founder):**
- Verificar checklist §12.
- Confirmar que el cambio en edge function NO altera el comportamiento del path no-inbound (status updates pasan directo).
- Verificar fail-open en rate-limit (intencional, NO un bug a "corregir").

---

**Fin de la spec.**
