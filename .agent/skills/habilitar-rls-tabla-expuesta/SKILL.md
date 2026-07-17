# Skill: Habilitar RLS en una tabla expuesta sin romper el backend

## Cuándo usar esta skill

- El advisor de seguridad de Supabase flaggea `rls_disabled_in_public` (o detectás una tabla en `public` con RLS off).
- Vas a habilitar Row Level Security en una tabla que YA tiene datos y consumidores en producción.
- Tenés miedo (con razón) de que prender RLS rompa el bot / n8n / un server action / el frontend.
- Una migración creó una tabla y "se olvidó" del RLS (las hermanas sí lo tienen).

## Por qué existe esta skill

Prender RLS en una tabla viva es de las cosas más fáciles de hacer MAL:

- **`enable row level security` SIN policies = deny-all para `authenticated`.** No falla, no tira error: simplemente el frontend deja de ver/escribir esa tabla. Y como `service_role` **bypasea** RLS, el backend NO lo nota → creés que está todo bien hasta que un usuario real se queja.
- Al revés: si SOLO mirás el browser y no auditás los otros consumidores (edge functions, n8n, server actions, cascadas FK), podés romper el bot en producción.

La clave que casi nadie verifica antes de aplicar: **¿con qué ROL de base accede CADA consumidor?** Si es `service_role` / `postgres` / `supabase_admin` → tiene `BYPASSRLS` → no se afecta. Si es `anon` / `authenticated` → SÍ se rige por las policies. Esta skill es el checklist para no romper nada.

## Proceso

### 1. Detectar el alcance real de la exposición

```
get_advisors(security)   -> busca lint `rls_disabled_in_public`
```
Y un barrido determinístico de TODO el schema (no te fíes de un solo advisor):

```sql
select c.relname as tabla, c.relrowsecurity as rls_on,
       (select count(*) from pg_policy p where p.polrelid = c.oid) as n_policies
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by rls_on asc, n_policies asc;
```
- `rls_on = false` → **EXPUESTA** (cualquiera con la anon key lee/escribe).
- `rls_on = true` y `n_policies = 0` → **BLOQUEADA** (deny-all para authenticated; segura si solo la toca service_role — NO la "arregles" agregando policies si nadie del frontend debe verla).

### 2. Auditar TODOS los consumidores y su ROL DB (el paso que se saltean)

Grepeá el repo ENTERO (no solo `src/`): edge functions, workflows n8n, scripts, migraciones.

```bash
grep -rln "tu_tabla" . --include="*.ts" --include="*.tsx" --include="*.js" --include="*.sql" --include="*.json" | grep -v node_modules
```
Para cada consumidor, determiná el rol con que escribe/lee:

| Consumidor | Rol DB | ¿RLS lo afecta? |
|---|---|---|
| Edge function / server action con `SUPABASE_SERVICE_ROLE_KEY` | service_role | **NO** (BYPASSRLS) |
| n8n nodo Postgres directo | la credencial DB del nodo | **DEPENDE** → ver paso 2b |
| n8n HTTP a una edge function | (la edge usa service_role) | **NO** |
| Browser (supabase-js con anon key + sesión) | authenticated | **SÍ** |
| FK `ON DELETE CASCADE` (ej. borrar la agency padre) | el motor | **NO** (las cascadas no están sujetas a RLS) |

### 2b. Confirmar quién bypasea RLS (en la base)

```sql
select rolname, rolbypassrls from pg_roles
where rolname in ('service_role','postgres','supabase_admin','authenticator','authenticated','anon');
-- Esperado: service_role/postgres/supabase_admin = true; authenticated/anon = false.
```
**Si un nodo Postgres de n8n escribe la tabla con un rol SIN bypass → habilitar RLS lo rompería.** Ese es el único caso peligroso; resolvelo (agregá una policy para ese rol, o pasá la escritura por una edge function service_role) ANTES de aplicar.

### 3. Diseñar las policies CALCANDO una tabla hermana (no inventar)

- Encontrá una tabla hermana ya bien scopeada (ej. `leads`) y copiá su patrón EXACTO: helpers, casts, estilo. Sacá las expresiones reales:

```sql
select pol.polname, pol.polcmd,
       pg_get_expr(pol.polqual, pol.polrelid)      as using_expr,
       pg_get_expr(pol.polwithcheck, pol.polrelid) as check_expr
from pg_policy pol where pol.polrelid = 'public.tabla_hermana'::regclass;
```
- Confirmá la columna de scoping: ¿la tabla tiene `agency_id` (u org_id) DIRECTO, o hay que joinear al padre? (`information_schema.columns`).
- Usá los helpers existentes (`is_master()`, `has_agency_role(...)`) — y confirmá que son **SECURITY DEFINER** (si no, la subquery interna del helper se auto-bloquearía por RLS):

```sql
select proname, prosecdef from pg_proc where proname in ('is_master','has_agency_role');
```
- Una policy por comando (SELECT/INSERT/UPDATE/DELETE). `WITH CHECK` por la columna de scoping en INSERT/UPDATE = impide cross-tenant.

### 4. Verificar adversarialmente ANTES de aplicar

Tratá de REFUTAR que sea seguro. Checklist:
- [ ] `anon` queda deny-all (sin sesión → helpers devuelven false → no matchea ninguna policy).
- [ ] Aislamiento cross-tenant: un miembro de la agency A no lee/escribe filas de B (todas las ramas pasan por `agency_id`, USING **y** WITH CHECK).
- [ ] El backend NO se rompe: cada consumidor del paso 2 usa un rol con bypass (o tiene policy).
- [ ] Cascadas FK siguen funcionando (no están sujetas a RLS).
- [ ] Filas existentes bien scopeadas: `select count(*) filter (where agency_id is null)` = 0.
- [ ] Orden seguro: `enable` + las policies van JUNTAS en la misma migración.

### 5. Aplicar como migración idempotente

```sql
alter table public.tu_tabla enable row level security;   -- no-op si ya está on
drop policy if exists tu_tabla_select on public.tu_tabla; -- + insert/update/delete
create policy tu_tabla_select on public.tu_tabla for select using ( ... );
-- ...las 4...
```
NUNCA `enable` sin las policies en la misma corrida. No uses `force row level security` salvo que quieras bloquear hasta al owner (rompe el patrón de las hermanas).

### 6. Verificar en prod + versionar

```sql
select relrowsecurity, (select count(*) from pg_policy p where p.polrelid = c.oid)
from pg_class c where c.oid = 'public.tu_tabla'::regclass;   -- esperado: t, 4
```
- Re-correr `get_advisors(security)` → la tabla **desaparece** del lint `rls_disabled_in_public`.
- **Versionar la migración en el repo** (`supabase/migrations/00NN_*.sql`) aunque la hayas aplicado a mano en el SQL editor — si no, drift DB↔repo.

## Output esperado

1. Una migración idempotente: `enable RLS` + N policies scopeadas por tenant, calcadas de una tabla hermana.
2. Evidencia de que ningún consumidor del backend se rompe (cada uno con rol que bypasea, o con policy).
3. Verificación en prod: RLS on + policy_count correcto + advisor de seguridad limpio para esa tabla.
4. La migración versionada en `supabase/migrations/`.

## Ejemplo concreto (Casa CRM, Misión 8, 2026-06-15)

- Tabla: `public.lead_notes` (la migración 0014 la creó SIN RLS → expuesta).
- Auditoría de consumidores (workflow de 5 agentes): el bot escribe vía la edge function `bot-actions` con **service_role** (bypasea) → no se rompe; n8n llama a `bot-actions` por HTTP (no toca la tabla directo, su único INSERT Postgres es a `messages`); el master delete por FK CASCADE; el browser todavía no la usa (`notes-tab.tsx` usa `leads.notes`).
- Policies: espejo de `leads`/0019, scope directo por `agency_id`. SELECT=miembros de la agency; INSERT=owner/admin/agent; UPDATE/DELETE=owner/admin o autor.
- Migración: [crm-v2/supabase/migrations/0024_lead_notes_rls.sql](crm-v2/supabase/migrations/0024_lead_notes_rls.sql).
- Verificado en prod: RLS on + 4 policies + advisor ya no flaggea `lead_notes`. PR #41.

## Gotchas / antipattern

- **NO** `enable row level security` sin policies. Queda deny-all para `authenticated`; el backend (service_role) no lo nota y creés que está bien, pero el frontend se rompe en silencio.
- **NO** habilitar RLS mirando solo el browser. Auditá edge functions, n8n, server actions, cascadas — y el ROL de cada uno.
- **NO** asumir que n8n se rompe: si pasa por una edge function service_role o un rol con bypass, no. Si es un nodo Postgres con rol sin bypass, SÍ → arreglalo antes.
- **NO** inventar policies. Calcá una tabla hermana bien scopeada + usá los helpers SECURITY DEFINER que ya existen.
- **NO** olvidar `WITH CHECK` en INSERT/UPDATE: sin él, un usuario puede crear/mover una fila a OTRO tenant (USING solo filtra lectura/qué filas toca, no el estado final).
- **NO** "arreglar" una tabla con RLS-on/0-policies que solo toca service_role agregándole policies de lectura: está bloqueada a propósito (ej. `n8n_chat_histories`). Bloqueada = segura.
- **NO** dejar la migración solo aplicada a mano en el dashboard. Versionala en el repo o tenés drift.
- **SIEMPRE** verificá contra el advisor + `pg_class`/`pg_policy` DESPUÉS de aplicar (regla `verificar-funcionamiento-end-to-end`).

## Skills relacionadas

- `verificar-funcionamiento-end-to-end` — la verificación contra la base/advisor que cierra el loop.
- `supabase-edge-function-secret-auth` — el patrón de auth por bearer-secret de las edge functions (como `bot-actions`).
- `fuente-unica-derivar-de-hijos` — otra skill de arquitectura de datos del mismo proyecto.
- Suite `supabase-pentest` / `supabase-audit-rls` (en `.claude/skills/`) — auditoría de RLS más amplia.
