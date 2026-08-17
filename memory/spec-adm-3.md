# Spec Tecnico — Fase ADM-3 (Gestion de equipo lado cliente)

**Fecha:** 2026-06-03
**Autor:** arquitecto (template)
**Estado:** listo para implementacion por backend-builder + frontend-builder
**Decisiones congeladas:** alcance ADM-3 acordado con el founder en sesion 2026-06-03, basado en `plan-sistema-admin.md` §C1, §C2 + D3 LOCK-IN. **D3 LOCK-IN sobreescribe el plan original** en dos puntos (ver §0 Conflictos detectados). NO se cuestiona.
**Esfuerzo objetivo:** 8-16h (~1-2 dias).

Este documento describe paths, signatures, SQL y UX exactos. Quien implemente NO debe re-arquitecturar, solo ejecutar. Si encuentra ambiguedad real, escala — no improvisa.

---

## 0. Conflictos detectados durante la auditoria (resueltos a favor del founder)

| # | Conflicto | Resolucion |
|---|---|---|
| K1 | `plan-sistema-admin.md` §C1 dice que **owner Y admin** acceden a la pagina, y §C2 dice que el modal tiene **dropdown de rol** (owner/admin/agent/viewer). | **D3 LOCK-IN aplica:** solo `owner` accede a la pagina; el rol del invite es **fijo `agent`** (sin dropdown). Los valores `admin` y `viewer` permanecen en el enum sin UI. Cuando se agreguen, se introduce el dropdown — fuera de scope ADM-3. |
| K2 | `plan-sistema-admin.md` §B1 (ADM-1) dice que habria que crear un **trigger en `auth.users` after insert** que lea metadata `{agency_id, role}` y cree el `agency_memberships` automaticamente. | **El trigger NUNCA se creo.** ADM-1 trabajo alrededor: la server action `createAgencyWithOwner` hace el INSERT explicito del membership tras `inviteUserByEmail`. ADM-3 sigue el **mismo patron** — INSERT explicito en la action, sin trigger. NO se crea migration 0018. Justificacion: `inviteUserByEmail` devuelve `data.user.id` sincronicamente, asi que podemos hacer el INSERT en el mismo callback sin esperar al click del invitee. Detalle en §3.2 y §4. |
| K3 | El header del shell `<AgencyShell>` ya tiene link a `Configuracion` (apunta a `/a/[slug]/settings`), pero NO tiene "Equipo". La pagina de settings hoy es **una pagina unica sin sub-tabs/sidebar interno**. | Dos opciones: (a) agregar tabs internos a settings, (b) hacer "Equipo" hermana de settings con su propia entrada en el sidebar. **Recomendacion: (b)** — agregar `Equipo` como item separado en el sidebar bajo "Configuracion", solo visible si `role='owner'`. Razon: simpleza + no refactorea settings actuales + matchea el path `/a/[slug]/settings/equipo` literal del founder. Ver DT5. |

---

## 1. Resumen del estado actual relevante

### Tablas / RLS relevantes (ya aplicadas, no se tocan)

| Objeto | Detalle relevante para ADM-3 |
|---|---|
| `agency_memberships` (migration 0002) | Cols: `id`, `agency_id`, `user_id`, `role agency_role`, `is_active boolean default true`, `invited_at timestamptz default now()`, `accepted_at timestamptz`, `created_at`, `updated_at`. UNIQUE `(agency_id, user_id)`. **No tiene** col `removed_at` ni `metadata` jsonb. Soft delete se implementa via `is_active=false` (decision en §3.3). |
| `agency_role` (enum, migration 0001) | Valores: `owner`, `admin`, `agent`, `viewer`. ADM-3 solo escribe `agent` desde la UI. |
| `users` (public, migration 0002) | Cols: `id` (FK auth.users), `email citext`, `full_name`, `avatar_url`, `phone`, `settings jsonb`. **No expone** `last_sign_in_at` — eso vive en `auth.users` y se accede solo via admin client. |
| `auth.users` | `last_sign_in_at`, `email`. Acceso via `createAdminClient().auth.admin.getUserById(id)` (patron establecido en ADM-2 `getAgencyDetail`). |
| RLS `agency_memberships` (migration 0006) | SELECT: member-or-master. UPDATE/INSERT/DELETE: solo master (segun esquema actual). **Importante:** las server actions de ADM-3 usaran **admin client** para INSERT/UPDATE (mismo patron ADM-1) — el gate de owner se hace en el helper `requireAgencyOwner()`, no via RLS. |

### Trigger `handle_new_user()` (migration 0007)

```sql
-- (extracto literal del archivo 0007_triggers.sql lineas 13-32)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
    insert into public.users (id, email, full_name, avatar_url)
    values (new.id, new.email,
            new.raw_user_meta_data->>'full_name',
            new.raw_user_meta_data->>'avatar_url')
    on conflict (id) do nothing;
    return new;
end;
$$;
```

**Lo que hace:** crea row en `public.users` al insertar en `auth.users`.
**Lo que NO hace:** NO toca `agency_memberships`. NO lee `intended_agency_id` ni `intended_role` de la metadata.

**Implicancia para ADM-3:** **NO necesitamos migration 0018.** Ver §4.

### Rutas existentes relevantes

| Path | Tipo | Estado / accion ADM-3 |
|---|---|---|
| `crm-v2/src/app/a/[slug]/settings/page.tsx` | Server | Pagina unica de settings cliente-facing (nombre + bot settings). **No se toca.** |
| `crm-v2/src/app/a/[slug]/settings/actions.ts` | Server actions | `saveAgencySettings()`. **No se toca.** |
| `crm-v2/src/app/a/[slug]/settings/equipo/page.tsx` | Server | **No existe.** Se crea en ADM-3. |
| `crm-v2/src/app/a/[slug]/settings/equipo/_actions/team.ts` | Server actions | **No existe.** Se crea en ADM-3. |
| `crm-v2/src/app/a/[slug]/layout.tsx` | Server | Shell del cliente. **No se toca** (banner impersonacion + RLS gating ya estan). |
| `crm-v2/src/lib/auth/require-master.ts` | Helper | Patron de gate a copiar para `requireAgencyOwner`. **No se toca.** |
| `crm-v2/src/lib/auth/require-agency-owner.ts` | Helper | **No existe.** Se crea en ADM-3 (§5). |
| `crm-v2/src/components/agency/agency-shell.tsx` | Client | Sidebar del cliente. **Modificacion minima:** agregar item "Equipo" condicional bajo "Configuracion", visible solo si el shell recibe la prop nueva `currentUserRole='owner'`. Ver §8. |
| `crm-v2/src/app/master/_actions/agencies.ts` | Server actions | `createAgencyWithOwner` invoca `inviteUserByEmail` y luego hace INSERT explicito del membership owner. **Patron a copiar** para `inviteMember`. **No se toca.** |
| `crm-v2/src/app/master/_actions/agencies.types.ts` | Types | Define `AgencyMember`, `AgencyMemberRole` (= `'owner' \| 'admin' \| 'agent' \| 'viewer'`). **Se reusa el type `AgencyMember` y `AgencyMemberRole`.** Ver §6. |
| `crm-v2/src/app/master/_components/create-client-modal.tsx` | Client | Patron de modal a clonar para `<InviteMemberModal>`. **No se toca.** |
| `crm-v2/src/app/master/clientes/[slug]/_components/suspend-confirm-modal.tsx` | Client | Patron de confirm modal a clonar para `<RemoveMemberConfirmModal>`. **No se toca.** |
| `crm-v2/src/app/auth/callback/route.ts` | Server | Intercambia code por session y redirect a `next`. Ya funciona generico. **No se toca.** El invite de ADM-3 usa `redirectTo: ${SITE_URL}/auth/callback?next=/a/<slug>/inbox`. |

### Cookie `master_impersonating`

Existe desde ADM-2. ADM-3 debe **considerarla** en el helper `requireAgencyOwner` — ver Decision Tecnica DT3 y §5.

### Helpers / patrones a reusar

| Helper | Donde | Uso ADM-3 |
|---|---|---|
| `createClient()` | `src/lib/supabase/server.ts` | Cliente user-bound (RLS). Lecturas de listMembers. |
| `createAdminClient()` | `src/lib/supabase/admin.ts` | Service_role. Para `inviteUserByEmail`, `auth.admin.getUserById`, UPDATE de membership (soft delete). |
| `requireMaster()` | `src/lib/auth/require-master.ts` | Patron a clonar para `requireAgencyOwner`. |
| `cookies()` de `next/headers` | Next 16 async | Leer `master_impersonating` en el helper (ver DT3). |
| `toast.success/error` de `sonner` | Montado en layout cliente | Feedback de acciones. |
| `revalidatePath` | `next/cache` | Invalidacion tras invite/remove. |

---

## 2. ¿Necesitamos migration 0018?

**No.**

### Razones

1. El trigger `handle_new_user` (0007) ya crea automaticamente la row en `public.users` cuando se inserta en `auth.users`. Eso lo necesitamos sin cambios.
2. Para el membership, el patron ADM-1 ya funciona y es mas explicito que un trigger: `inviteUserByEmail` devuelve `data.user.id` sincronicamente, asi que podemos hacer el INSERT en la misma action que dispara el invite. **Sin race conditions**, sin metadata flotante, sin trigger que tiene que parsear.
3. Si crearamos un trigger nuevo que lea `intended_agency_id + intended_role`, **tendria que coexistir con el flow de `createAgencyWithOwner`** que ya hace INSERT explicito. El trigger tendria que detectar "ya hay membership para este user" para no duplicar (UNIQUE `(agency_id, user_id)` rebotaria, pero generaria errores espureos en logs y complicaria el debugging). Mas riesgo que beneficio.

### Patron ADM-3 (sin trigger)

```ts
// pseudo dentro de inviteMember()
const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
  data: { intended_agency_id: agencyId, intended_role: 'agent', invited_by_user_id: ctx.userId },
  redirectTo: `${siteUrl}/auth/callback?next=/a/${slug}/inbox`,
});
if (error || !data?.user) return { ok: false, error: 'invite_failed', ... };

const newUserId = data.user.id;
await admin.from('agency_memberships').insert({
  agency_id: agencyId,
  user_id: newUserId,
  role: 'agent',
  is_active: true,
  invited_at: new Date().toISOString(),
  // accepted_at queda null hasta que el invitee clickee
});
```

**Nota sobre `accepted_at`:** lo dejamos `null` hasta que el invitee acepte. Para marcarlo en `true` cuando acepte, **eso si requiere un trigger** (futuro: parsear callback del magic link y UPDATE). En MVP no es critico — la UI usa `lastSignInAt` (de `auth.users`) como senial de "ya entro al menos una vez". Si `lastSignInAt` es null, mostramos badge "Invitacion pendiente". Ver §7.

### Caso especial: email ya existe en `auth.users` pero no es miembro

`inviteUserByEmail` se comporta distinto segun version de Supabase Auth. En general:
- Si el email no existe → crea auth.users + manda email → trigger crea public.users → devuelve `{ data: { user: { id } } }`.
- Si el email ya existe (otro user de otra agency, o el mismo owner intentando re-invitarse via path raro) → devuelve `User already registered` (error).

ADM-1 maneja este caso devolviendo `invite_failed`. ADM-3 **debe manejarlo distinto**: si el email ya existe Y no es miembro de la agency actual, queremos poder agregarlo igual. Solucion:

```ts
// pseudo
// 1. Pre-check: email ya es miembro activo? -> member_already_exists
const { data: existingMembership } = await admin.from('agency_memberships')
  .select('id, is_active')
  .eq('agency_id', agencyId)
  .eq('user_id', /* hay que obtener user_id por email */)
  ...

// 2. Si existing user en public.users por email -> add membership directo, NO invite
const { data: existingUser } = await admin.from('users')
  .select('id').eq('email', email).maybeSingle();

if (existingUser) {
  // 2a. INSERT membership directo (UNIQUE va a rebotar si ya existe inactivo -> manejamos)
  const { error: insertErr } = await admin.from('agency_memberships').insert({
    agency_id: agencyId, user_id: existingUser.id, role: 'agent',
    is_active: true, invited_at: new Date().toISOString(),
  });
  if (insertErr && /duplicate key/.test(insertErr.message)) {
    // Hay un membership inactivo de antes -> reactivamos
    const { error: updErr } = await admin.from('agency_memberships').update({
      is_active: true, role: 'agent', invited_at: new Date().toISOString(),
    }).eq('agency_id', agencyId).eq('user_id', existingUser.id);
    if (updErr) return { ok: false, error: 'invite_failed', message: updErr.message };
  } else if (insertErr) {
    return { ok: false, error: 'invite_failed', message: insertErr.message };
  }
  // Sin email transaccional adicional (el user ya tiene cuenta y password/session)
  return { ok: true, mode: 'existing_user_added' };
}

// 3. Si NO existe -> invite flow normal
const { data, error } = await admin.auth.admin.inviteUserByEmail(...);
// ... patron de arriba
return { ok: true, mode: 'invite_sent' };
```

**Decision Tecnica DT1:** ADM-3 implementa los dos branches (existing user y new user) en `inviteMember`. Discriminated union de resultado incluye `mode: 'existing_user_added' | 'invite_sent'` para que el toast sea distinto. Ver §3.2.

---

## 3. Server actions nuevas

### Path

`crm-v2/src/app/a/[slug]/settings/equipo/_actions/team.ts`

**Decision Tecnica DT2:** path bajo `equipo/_actions/` (no `settings/_actions/`) porque cohesiona con la pagina y mantiene la convencion de "actions cerca de la pagina que las consume" (mismo patron que `master/_actions/` para el scope master). Tipos en `team.types.ts` al lado.

### 3.1 `listMembers(agencyId)`

```ts
export async function listMembers(agencyId: string): Promise<AgencyMember[]>
```

**Gate:** `await requireAgencyOwner(slug)` — pero recibe `agencyId`, no slug. **Resolucion:** la pagina (server component) llama `requireAgencyOwner(slug)` y recibe `{ agencyId }`. Despues pasa `agencyId` a `listMembers`. La action mismo NO repite el gate (confianza en el caller server-side). Ver §5 para la firma exacta del helper.

**Lecturas:**
1. User-bound client (`createClient()`):
   ```sql
   SELECT m.user_id, m.role, m.accepted_at, m.is_active,
          u.email, u.full_name, u.avatar_url
   FROM agency_memberships m
   JOIN users u ON u.id = m.user_id
   WHERE m.agency_id = ?
     AND m.is_active = true
   ORDER BY (m.role = 'owner') DESC,  -- owner primero
            u.full_name ASC NULLS LAST
   ```
2. Admin client: `auth.admin.getUserById(userId)` por cada miembro para `last_sign_in_at`. N paralelo con `Promise.all` (acepable para <50 miembros, mismo patron ADM-2).

**Output:** `AgencyMember[]` (mismo type del scope master).

**Edge cases:**
- `accepted_at = null` y `lastSignInAt = null` → badge "Invitacion pendiente" en UI.
- `accepted_at = null` pero `lastSignInAt != null` → ya entro pero el `accepted_at` no se grabo (porque no tenemos trigger que lo seteea). Tratamos como "activo" — el `lastSignInAt` es la fuente de verdad. Documentar como caso conocido (no bug).

### 3.2 `inviteMember(input)`

```ts
type InviteMemberInput = { slug: string; email: string };

export async function inviteMember(input: InviteMemberInput): Promise<InviteMemberResult>
```

**Gate:** `const ctx = await requireAgencyOwner(input.slug)`.

**Validacion zod:**
```ts
const inviteMemberInput = z.object({
  slug: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().email('Email invalido'),
});
```

**Logica (orden estricto):**

1. Parse zod → `invalid_input` si falla.
2. Refinement runtime: `email === ctx.email` → `self_invite_forbidden` ("No podes invitarte a vos mismo. Ya sos owner.").
3. Resolver `agencyId` desde `ctx` (el helper ya lo devuelve).
4. Pre-check email ya tiene membership activo en esta agency:
   ```ts
   const admin = createAdminClient();
   const { data: existingUser } = await admin.from('users')
     .select('id').eq('email', email).maybeSingle();
   if (existingUser) {
     const { data: existingMem } = await admin.from('agency_memberships')
       .select('id, is_active').eq('agency_id', ctx.agencyId)
       .eq('user_id', existingUser.id).maybeSingle();
     if (existingMem?.is_active) {
       return { ok: false, error: 'member_already_exists' };
     }
     // Caso: user existente sin membership activo en esta agency.
     // Puede ser nuevo aqui (sin row) o reactivable (row con is_active=false).
     return await addExistingUserMembership(admin, ctx.agencyId, existingUser.id, existingMem);
   }
   ```
5. Si NO existe user con ese email: flow `inviteUserByEmail` + INSERT membership.
   ```ts
   const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
   const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
     email,
     {
       data: {
         intended_agency_id: ctx.agencyId,
         intended_agency_slug: input.slug,
         intended_role: 'agent',
         invited_by_user_id: ctx.userId,
       },
       redirectTo: `${siteUrl}/auth/callback?next=/a/${input.slug}/inbox`,
     }
   );
   if (inviteErr || !inviteData?.user) {
     return { ok: false, error: 'invite_failed', message: inviteErr?.message };
   }
   const newUserId = inviteData.user.id;
   const { error: memErr } = await admin.from('agency_memberships').insert({
     agency_id: ctx.agencyId,
     user_id: newUserId,
     role: 'agent',
     is_active: true,
     invited_at: new Date().toISOString(),
   });
   if (memErr) return { ok: false, error: 'invite_failed', message: memErr.message };

   revalidatePath(`/a/${input.slug}/settings/equipo`);
   return { ok: true, mode: 'invite_sent' };
   ```

**Discriminated union de resultado:**

```ts
export type InviteMemberError =
  | 'unauthorized'         // requireAgencyOwner ya lanza notFound, pero por completitud del type
  | 'invalid_input'
  | 'self_invite_forbidden'
  | 'member_already_exists'
  | 'invite_failed';

export type InviteMemberResult =
  | { ok: true; mode: 'invite_sent' | 'existing_user_added' }
  | { ok: false; error: InviteMemberError; message?: string };
```

**Toast UX en el modal:**
- `mode: 'invite_sent'` → `toast.success('Invitacion enviada a ${email}. Le va a llegar un email para crear su cuenta.')`.
- `mode: 'existing_user_added'` → `toast.success('${email} ya tenia cuenta. Lo agregamos al equipo directamente.')`.
- `error: 'member_already_exists'` → toast.error / mensaje inline en el modal.
- `error: 'self_invite_forbidden'` → mensaje inline (no toast — es validation).
- `error: 'invalid_input'` → mensaje inline mapeado al field.
- `error: 'invite_failed'` → toast.error con `message`.

### 3.3 `removeMember(input)`

```ts
type RemoveMemberInput = { slug: string; userId: string };

export async function removeMember(input: RemoveMemberInput): Promise<RemoveMemberResult>
```

**Gate:** `const ctx = await requireAgencyOwner(input.slug)`.

**Guards (orden estricto, fallar early):**

1. `userId === ctx.userId` → `cannot_remove_self`. Cubre el caso "owner intenta removerse a si mismo".
2. Lookup del membership target: `SELECT role, is_active FROM agency_memberships WHERE agency_id = ? AND user_id = ?`. Si null → `member_not_found`.
3. `target.role === 'owner'` → `cannot_remove_owner`. Cubre el caso "dos owners en futuro" (defensa).
4. Si `target.is_active === false` → ya estaba removido. Idempotencia: retornar `ok: true` y revalidatePath. No es error.

**Decision Tecnica DT4 — soft vs hard delete:** **soft delete via `is_active=false`**. Razones:
- Mantiene historico para audit log y reportes ("este lead fue creado por X, aunque X ya no es miembro").
- Permite reactivar invitando de nuevo sin perder `created_at` historico.
- UNIQUE `(agency_id, user_id)` no permite re-INSERT — solo UPDATE. Si hicieramos hard delete y luego re-INSERT, perdemos historico de `invited_at` original.
- El esquema YA tiene la columna `is_active`. Cero migracion.

**Logica de mutacion:**

```ts
const admin = createAdminClient();
const { error: updErr } = await admin.from('agency_memberships')
  .update({ is_active: false, updated_at: new Date().toISOString() })
  .eq('agency_id', ctx.agencyId)
  .eq('user_id', input.userId);
if (updErr) return { ok: false, error: 'unknown', message: updErr.message };

revalidatePath(`/a/${input.slug}/settings/equipo`);
return { ok: true };
```

**Sin audit log en ADM-3.** Razones:
- `master_audit_log` es del scope master (foreign key a `master_accounts.id`). El caller aca es un owner cliente, no un master.
- No tenemos tabla `agency_audit_log` aun. Crearla esta fuera de scope.
- Si en el futuro queremos audit cliente-facing, se crea la tabla + se anaden `audit_event` types. ADM-3 deja la puerta abierta sin compromiso.

**Discriminated union:**

```ts
export type RemoveMemberError =
  | 'unauthorized'
  | 'invalid_input'
  | 'cannot_remove_self'
  | 'cannot_remove_owner'
  | 'member_not_found'
  | 'unknown';

export type RemoveMemberResult =
  | { ok: true }
  | { ok: false; error: RemoveMemberError; message?: string };
```

**Toast UX:**
- `ok: true` → `toast.success('Miembro removido del equipo')`.
- `cannot_remove_self` → toast.error (defensa — el UI no deberia mostrar el boton para si mismo).
- `cannot_remove_owner` → toast.error.
- `member_not_found` → toast.error y revalidatePath igual (el row desaparecio).
- Resto → toast.error con `message`.

---

## 4. ¿Migration 0018?

**No se crea.** Justificacion completa en §2. Resumen:

- `handle_new_user` (0007) ya hace lo necesario para `public.users`.
- El INSERT de `agency_memberships` se hace **explicitamente en la server action** (mismo patron que `createAgencyWithOwner` en ADM-1).
- Crear un trigger duplicaria logica y arriesgaria conflicto con el INSERT explicito del owner.

Si en el futuro queremos un trigger que actualice `accepted_at` al primer login del invitee (linkear `auth.users.last_sign_in_at` IS NULL → first sign-in), eso es **otro alcance** (no afecta el flow MVP).

---

## 5. Helper `requireAgencyOwner(slug)`

### Path

`crm-v2/src/lib/auth/require-agency-owner.ts`

### Firma

```ts
import type { User } from '@supabase/supabase-js';

export type AgencyOwnerContext = {
  user: User;
  userId: string;
  email: string;
  agencyId: string;
  slug: string;
};

export async function requireAgencyOwner(slug: string): Promise<AgencyOwnerContext>;
```

### Comportamiento

1. `getUser()` → si null, **redirect('/login')**. Mismo trato que `requireMaster()` (defensa, el proxy ya deberia haber atajado).
2. Query: `agency_memberships` join `agencies` por slug, filtrar por `user_id = auth.uid()`, `is_active = true`, `role = 'owner'`.
   ```sql
   SELECT m.id, m.role, a.id AS agency_id
   FROM agency_memberships m
   JOIN agencies a ON a.id = m.agency_id
   WHERE a.slug = ?
     AND m.user_id = ?
     AND m.is_active = true
     AND m.role = 'owner'
   LIMIT 1
   ```
3. Si el row viene null → **`notFound()`** (sin redirect, para NO leakear que la pagina `/a/[slug]/settings/equipo` existe a un agent o usuario externo).
4. Si pasa el gate → retornar `{ user, userId: user.id, email: user.email ?? '', agencyId, slug }`.

### Decision Tecnica DT3 — master impersonando

**Pregunta del founder:** master impersonando un cliente → ¿ve la pagina de equipo? Voto: **VE pero sin acciones (read-only)**.

**Recomendacion:** **VE con acciones completas.** Razones:
- Filosofia: master IS owner para propositos de soporte. El banner ambar de impersonacion ya deja claro que es modo soporte. Si master no puede invitar/remover, queda con una UI "rota" que dice "boton +Invitar" pero no funciona — peor UX que tener el poder completo.
- Caso de uso real: cliente llama a soporte porque "no puede invitar a su empleado". Master impersona, replica el problema, lo soluciona o invita directamente.

**Implementacion en el helper:**

```ts
export async function requireAgencyOwner(slug: string): Promise<AgencyOwnerContext> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // 1. Branch master impersonando.
  const cookieStore = await cookies();
  const impersonatingSlug = cookieStore.get('master_impersonating')?.value ?? null;
  if (impersonatingSlug === slug) {
    // Confirmar que es master real.
    const { data: master } = await supabase
      .from('master_accounts').select('is_active').eq('user_id', user.id).maybeSingle();
    if (master?.is_active) {
      // Master impersonando esta agency. Resolvemos agencyId via admin client
      // (no necesitamos rol de owner real porque RLS via is_master() ya lo deja ver todo).
      const admin = createAdminClient();
      const { data: agency } = await admin.from('agencies')
        .select('id').eq('slug', slug).maybeSingle();
      if (!agency) notFound();
      return { user, userId: user.id, email: user.email ?? '', agencyId: agency.id, slug };
    }
    // No es master real con cookie -> sigue al gate normal (probablemente notFound).
  }

  // 2. Gate normal: el user es owner real de esta agency.
  const { data: row } = await supabase
    .from('agency_memberships')
    .select('agency_id, agencies!inner(slug)')
    .eq('user_id', user.id)
    .eq('role', 'owner')
    .eq('is_active', true)
    .eq('agencies.slug', slug)
    .maybeSingle();
  if (!row) notFound();

  return { user, userId: user.id, email: user.email ?? '', agencyId: row.agency_id, slug };
}
```

**Notas:**
- El branch master usa el admin client porque NO queremos depender de RLS para resolver el `agency_id` (master ya ve todo, pero por defensa preferimos admin).
- Las server actions `inviteMember` y `removeMember` reciben el `ctx` del helper y operan con `agencyId` y `userId` del master cuando impersona — el efecto practico es: el master invita/remueve a nombre del cliente, **sin** que el cliente lo vea distinto en la UI.

### Decision Tecnica DT4 — orden de checks en `removeMember` cuando master impersona

Cuando el master impersona y clickea "Remover Juan":
- `ctx.userId` es el **id del master**, no del cliente.
- El guard `userId === ctx.userId` (cannot_remove_self) en este caso compara contra el master id — falsea siempre (el master no es miembro de la agency cliente). **OK, no rompe nada.**
- El guard `target.role === 'owner'` sigue protegiendo: master no puede remover al owner cliente desde la UI de equipo. Si master quiere "remover" al owner cliente, eso es operacion master scope (no soportada en ADM-3 — fuera de scope).

Resultado: el comportamiento es coherente sin codigo adicional. Documentar como caso conocido.

---

## 6. Tipos nuevos en `team.types.ts`

```ts
// crm-v2/src/app/a/[slug]/settings/equipo/_actions/team.types.ts
import { z } from 'zod';
import type { AgencyMember, AgencyMemberRole } from '@/app/master/_actions/agencies.types';

// Reusamos AgencyMember tal cual del scope master.
// El listado del lado cliente no requiere ningun campo extra que el master no tenga.
export type { AgencyMember, AgencyMemberRole };

// === inviteMember ============================================================

export const inviteMemberInput = z.object({
  slug: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().email('Email invalido'),
});

export type InviteMemberInput = z.infer<typeof inviteMemberInput>;

export type InviteMemberError =
  | 'unauthorized'
  | 'invalid_input'
  | 'self_invite_forbidden'
  | 'member_already_exists'
  | 'invite_failed';

export type InviteMemberResult =
  | { ok: true; mode: 'invite_sent' | 'existing_user_added' }
  | { ok: false; error: InviteMemberError; message?: string };

// === removeMember ============================================================

export const removeMemberInput = z.object({
  slug: z.string().trim().min(1),
  userId: z.string().uuid('userId invalido'),
});

export type RemoveMemberInput = z.infer<typeof removeMemberInput>;

export type RemoveMemberError =
  | 'unauthorized'
  | 'invalid_input'
  | 'cannot_remove_self'
  | 'cannot_remove_owner'
  | 'member_not_found'
  | 'unknown';

export type RemoveMemberResult =
  | { ok: true }
  | { ok: false; error: RemoveMemberError; message?: string };
```

**Decision Tecnica DT5:** **reusar `AgencyMember` del scope master en vez de duplicar.** El type es identico para ambos contextos (rol + email + last sign in + avatar). Si en el futuro el contexto cliente necesita campos distintos, se branchea — pero hoy NO.

---

## 7. Pagina `/a/[slug]/settings/equipo`

### Component tree

```
src/app/a/[slug]/settings/equipo/
├─ page.tsx                          (server)
│  ├─ requireAgencyOwner(slug)       -> ctx
│  ├─ listMembers(ctx.agencyId)      -> AgencyMember[]
│  └─ <TeamPageClient
│        slug={slug}
│        members={members}
│        currentUserId={ctx.userId} />
├─ _actions/
│  ├─ team.ts                        (server actions)
│  └─ team.types.ts
├─ _components/
│  ├─ team-page-client.tsx           (client wrapper: state del modal abierto)
│  ├─ team-member-row.tsx            (client)
│  ├─ invite-member-modal.tsx        (client)
│  └─ remove-member-confirm-modal.tsx (client)
```

### `page.tsx` (server)

```tsx
import { notFound } from 'next/navigation';
import { requireAgencyOwner } from '@/lib/auth/require-agency-owner';
import { listMembers } from './_actions/team';
import { TeamPageClient } from './_components/team-page-client';

export default async function TeamPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await requireAgencyOwner(slug); // notFound si no es owner
  const members = await listMembers(ctx.agencyId);

  return (
    <TeamPageClient
      slug={slug}
      members={members}
      currentUserId={ctx.userId}
    />
  );
}
```

### Layout visual

```
┌──────────────────────────────────────────────────────────┐
│ Equipo                              [ + Invitar miembro ]│  ← header sticky
│ Gestiona quien tiene acceso a tu CRM.                    │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ HV  Hans Villalobos          [Owner]               │  │
│  │     hvillalobos98@gmail.com   ·  hace 2 horas      │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ JP  Juan Perez                [Agent]   [Remover]  │  │
│  │     juan@inmo.cr  ·  hace 3 dias                   │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ EM  esperando@invite.com      [Agent]   [Remover]  │  │
│  │     —  ·  Invitacion pendiente                     │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### `<TeamPageClient>` (client wrapper)

Maneja:
- Estado `inviteOpen: boolean` para abrir modal.
- Estado `removeTarget: AgencyMember | null` para confirm modal.
- Renderiza: header con boton, lista de filas, los dos modales.

```tsx
'use client';
import { useState } from 'react';
import type { AgencyMember } from '../_actions/team.types';
import { InviteMemberModal } from './invite-member-modal';
import { RemoveMemberConfirmModal } from './remove-member-confirm-modal';
import { TeamMemberRow } from './team-member-row';

export function TeamPageClient({
  slug, members, currentUserId,
}: {
  slug: string;
  members: AgencyMember[];
  currentUserId: string;
}) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<AgencyMember | null>(null);
  const owners = members.filter((m) => m.role === 'owner');
  const isOnlyMember = members.length === 1 && owners.length === 1;

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      {/* Header */}
      <div className="mb-6 flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink">Equipo</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Gestiona quien tiene acceso a tu CRM.
          </p>
        </div>
        <button
          onClick={() => setInviteOpen(true)}
          className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-surface hover:bg-accent/90"
        >
          + Invitar miembro
        </button>
      </div>

      {/* Empty state (solo si owner es el unico) */}
      {isOnlyMember && (
        <div className="rounded-md border border-line bg-surface-muted/50 px-4 py-6 text-center text-sm text-ink-soft">
          Sos el unico en el equipo. Invita a tu primer agente.
        </div>
      )}

      {/* Lista */}
      {!isOnlyMember && (
        <div className="space-y-2">
          {members.map((m) => (
            <TeamMemberRow
              key={m.userId}
              member={m}
              currentUserId={currentUserId}
              onRemoveClick={() => setRemoveTarget(m)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      <InviteMemberModal
        slug={slug}
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
      />
      <RemoveMemberConfirmModal
        slug={slug}
        target={removeTarget}
        onClose={() => setRemoveTarget(null)}
      />
    </div>
  );
}
```

### `<TeamMemberRow>` (client)

```tsx
'use client';
import type { AgencyMember } from '../_actions/team.types';

const ROLE_LABEL: Record<AgencyMember['role'], string> = {
  owner: 'Owner', admin: 'Admin', agent: 'Agente', viewer: 'Viewer',
};
const ROLE_STYLE: Record<AgencyMember['role'], string> = {
  owner: 'bg-accent-soft text-accent',
  admin: 'bg-surface-muted text-ink',
  agent: 'bg-pale-blue text-pale-blue-ink',
  viewer: 'bg-line text-ink-soft',
};

export function TeamMemberRow({
  member, currentUserId, onRemoveClick,
}: {
  member: AgencyMember;
  currentUserId: string;
  onRemoveClick: () => void;
}) {
  const isSelf = member.userId === currentUserId;
  const canRemove = !isSelf && member.role !== 'owner';
  const initials = (member.fullName || member.email).slice(0, 2).toUpperCase();
  const lastActivity = member.lastSignInAt
    ? /* formatDistanceToNow */ formatRelative(member.lastSignInAt)
    : member.acceptedAt
    ? 'Sin acceso aun'
    : 'Invitacion pendiente';

  return (
    <div className="flex items-center gap-3 rounded-md border border-line bg-surface px-3 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-muted font-mono text-xs text-ink">
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-ink">
            {member.fullName ?? member.email}
          </p>
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[0.6rem] uppercase tracking-wider ${ROLE_STYLE[member.role]}`}>
            {ROLE_LABEL[member.role]}
          </span>
        </div>
        <p className="truncate text-xs text-ink-soft">
          {member.email}  ·  <span title={member.lastSignInAt ?? ''}>{lastActivity}</span>
        </p>
      </div>
      {canRemove && (
        <button
          onClick={onRemoveClick}
          className="shrink-0 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs text-ink-soft hover:border-pale-red hover:text-pale-red-ink"
        >
          Remover
        </button>
      )}
    </div>
  );
}
```

**Reglas:**
- Owner row no muestra boton "Remover" (incluso el suyo).
- Si el miembro es el `currentUserId` (es el propio owner viendo su row), no muestra "Remover".
- Si en el futuro hay 2 owners, ninguno se puede remover desde aca (la UI lo oculta, el server lo bloquea).

### Estado vacio del owner unico

> "Sos el unico en el equipo. Invita a tu primer agente."

Card simple con borde sutil, sin call-to-action duplicado (el boton "+ Invitar miembro" en el header alcanza).

---

## 8. `<InviteMemberModal>` (client)

### Path

`src/app/a/[slug]/settings/equipo/_components/invite-member-modal.tsx`

### Patron

Clon estructural de `crm-v2/src/app/master/_components/create-client-modal.tsx`:
- Overlay con backdrop fade-in.
- Card centrada con `border-line bg-surface`.
- Animacion de entrada/salida con CSS keyframes (NO motion — consistente con el resto del proyecto).
- Auto-focus al abrir.
- Estados: idle / pending / error.
- `useTransition` para el submit.

### Form

**Un solo campo: email.** El rol esta hardcoded como `agent` (NO dropdown — D3 LOCK-IN).

```tsx
'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { X } from '@phosphor-icons/react/dist/ssr';
import { inviteMember } from '../_actions/team';

export function InviteMemberModal({
  slug, open, onClose,
}: { slug: string; open: boolean; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => firstFieldRef.current?.focus(), 60);
      return () => clearTimeout(t);
    } else {
      const t = setTimeout(() => { setEmail(''); setError(null); }, 180);
      return () => clearTimeout(t);
    }
  }, [open]);

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await inviteMember({ slug, email });
      if (res.ok) {
        const msg = res.mode === 'invite_sent'
          ? `Invitacion enviada a ${email}. Le va a llegar un email para crear su cuenta.`
          : `${email} ya tenia cuenta. Lo agregamos al equipo directamente.`;
        toast.success(msg);
        onClose();
      } else {
        switch (res.error) {
          case 'member_already_exists':
            setError('Este email ya esta en tu equipo.'); break;
          case 'self_invite_forbidden':
            setError('No podes invitarte a vos mismo. Ya sos owner.'); break;
          case 'invalid_input':
            setError(res.message ?? 'Email invalido.'); break;
          default:
            setError(res.message ?? 'No pudimos invitarlo. Intenta de nuevo.');
        }
      }
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-ink/30 animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-lg border border-line bg-surface p-6 shadow-lg animate-scale-in">
        <button onClick={onClose} className="absolute right-4 top-4 text-ink-soft hover:text-ink">
          <X size={18} />
        </button>
        <h2 className="font-display text-lg text-ink">Invitar miembro</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Le mandamos un email para que cree su cuenta y se sume al equipo.
        </p>

        <div className="mt-5">
          <label className="block text-xs font-medium uppercase tracking-wider text-ink-soft">
            Email
          </label>
          <input
            ref={firstFieldRef}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="agente@empresa.com"
            disabled={isPending}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
          />
          {error && <p className="mt-2 text-xs text-pale-red-ink">{error}</p>}
        </div>

        {/* Hint: rol fijo (no dropdown). */}
        <p className="mt-3 font-mono text-[0.65rem] uppercase tracking-wider text-muted">
          Se sumara como <strong className="text-ink-soft">Agente</strong>. (Otros roles llegan pronto.)
        </p>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={isPending}
            className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink-soft hover:bg-surface-muted"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={isPending || !email.trim()}
            className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-surface hover:bg-accent/90 disabled:opacity-50"
          >
            {isPending ? 'Enviando...' : 'Enviar invitacion'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Notas:**
- Animaciones `animate-fade-in` y `animate-scale-in` reusan keyframes definidos en `globals.css` (verificar que existan; si no, agregar — pero verificar primero porque `create-client-modal.tsx` ya las usa, asi que deberian estar).
- Si el founder decide habilitar Enter para submit, ya esta cableado.
- El hint "(Otros roles llegan pronto)" sirve para que el cliente vea que el sistema no esta capado para siempre — solo MVP.

---

## 9. `<RemoveMemberConfirmModal>` (client)

### Path

`src/app/a/[slug]/settings/equipo/_components/remove-member-confirm-modal.tsx`

### Patron

Clon de `crm-v2/src/app/master/clientes/[slug]/_components/suspend-confirm-modal.tsx`:
- Mismo overlay + card + keyframes.
- Boton primario rojo (`bg-pale-red text-pale-red-ink` con hover oscuro).
- Boton secundario gris (Cancelar).

### Logica

```tsx
'use client';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { X } from '@phosphor-icons/react/dist/ssr';
import { removeMember } from '../_actions/team';
import type { AgencyMember } from '../_actions/team.types';

export function RemoveMemberConfirmModal({
  slug, target, onClose,
}: { slug: string; target: AgencyMember | null; onClose: () => void }) {
  const [isPending, startTransition] = useTransition();
  if (!target) return null;

  const displayName = target.fullName ?? target.email;

  const submit = () => {
    startTransition(async () => {
      const res = await removeMember({ slug, userId: target.userId });
      if (res.ok) {
        toast.success(`${displayName} fue removido del equipo`);
        onClose();
      } else {
        switch (res.error) {
          case 'cannot_remove_self':
            toast.error('No podes removerte a vos mismo.'); break;
          case 'cannot_remove_owner':
            toast.error('No podes remover al owner.'); break;
          case 'member_not_found':
            toast.error('Ese miembro ya no esta en el equipo.'); onClose(); break;
          default:
            toast.error(res.message ?? 'No pude removerlo. Intenta de nuevo.');
        }
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-ink/30 animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-lg border border-line bg-surface p-6 shadow-lg animate-scale-in">
        <button onClick={onClose} className="absolute right-4 top-4 text-ink-soft hover:text-ink">
          <X size={18} />
        </button>
        <h2 className="font-display text-lg text-ink">Remover a {displayName}?</h2>
        <p className="mt-2 text-sm text-ink-soft">
          Va a perder acceso al inbox y a los leads. Esta accion se puede revertir invitandolo de nuevo.
        </p>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={isPending}
            className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink-soft hover:bg-surface-muted"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={isPending}
            className="rounded-md bg-pale-red px-3 py-2 text-sm font-medium text-pale-red-ink hover:bg-pale-red/80 disabled:opacity-50"
          >
            {isPending ? 'Removiendo...' : 'Si, remover'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## 10. Cambios al sidebar / shell cliente

### Estado actual

`crm-v2/src/components/agency/agency-shell.tsx` tiene un item fijo "Configuracion" que apunta a `/a/[slug]/settings`. No tiene tabs internos en settings.

### Cambio propuesto

**Agregar item "Equipo" justo despues de "Configuracion" en el bloque inferior del sidebar**, solo visible si el current user es owner real de la agency.

```tsx
// pseudo
const { data: { user } } = await supabase.auth.getUser();
const { data: ownerRow } = await supabase.from('agency_memberships')
  .select('id').eq('user_id', user.id).eq('agency_id', agency.id)
  .eq('role', 'owner').eq('is_active', true).maybeSingle();
const isOwner = Boolean(ownerRow);

// pasamos isOwner al AgencyShell (nueva prop)
<AgencyShell isOwner={isOwner} ... />
```

```tsx
// dentro de agency-shell.tsx, en el bloque inferior
{isOwner && (
  <Link
    href={`${base}/settings/equipo`}
    onClick={() => setOpen(false)}
    className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
      isActive('settings/equipo')
        ? 'bg-surface-muted font-medium text-ink'
        : 'text-ink-soft hover:bg-surface-muted/60 hover:text-ink'
    }`}
  >
    <Users size={18} weight={isActive('settings/equipo') ? 'fill' : 'regular'} />
    Equipo
  </Link>
)}
```

**Decision Tecnica DT6:** El layout actual ya hace queries para resolver `isMaster`. Agregar la query de `isOwner` es trivial (1 query mas, indexada). Ver §11 esfuerzo.

**Caso master impersonando:** el master NO es owner real del cliente (su `agency_memberships` no existe para esa agency). La query `isOwner` devuelve false → el item "Equipo" **no se muestra** en el sidebar para el master impersonando. Pero el master **puede navegar manualmente** a `/a/[slug]/settings/equipo` y `requireAgencyOwner` lo deja pasar (rama `master_impersonating` cookie). **Inconsistencia menor aceptada** (master = "power user", se le permite saltar UI). Si quisieramos exponer el item al master, agregamos `isMaster && impersonatingThisAgency` al gate del sidebar — fuera de scope ADM-3.

---

## 11. Esfuerzo estimado

| Capa | Tarea | Horas |
|---|---|---|
| Backend | Crear `team.types.ts` con zod schemas + types | 0.5 |
| Backend | `requireAgencyOwner()` helper (incluye branch master impersonando) | 1.0 |
| Backend | `listMembers()` action + N getUserById paralelo | 1.0 |
| Backend | `inviteMember()` con branches existing user / new user | 2.0 |
| Backend | `removeMember()` con guards | 0.75 |
| Frontend | `page.tsx` (server boundary) | 0.25 |
| Frontend | `<TeamPageClient>` wrapper de estado modales | 0.5 |
| Frontend | `<TeamMemberRow>` (con format helpers de fechas relativas) | 1.0 |
| Frontend | `<InviteMemberModal>` (clon de create-client-modal) | 1.5 |
| Frontend | `<RemoveMemberConfirmModal>` (clon de suspend-confirm-modal) | 0.75 |
| Frontend | Modificacion del layout `/a/[slug]/layout.tsx` para resolver `isOwner` + pasar al shell | 0.5 |
| Frontend | Modificacion del `<AgencyShell>` para item "Equipo" condicional | 0.5 |
| Testing | Smoke flow: owner invita → recibe email → entra → ve sus conversaciones → owner lo remueve | 1.5 |
| Buffer | Bugs imprevistos / pulido | 1.0 |
| **TOTAL** | | **12.25h** |

Dentro del rango 8-16h objetivo. Realista para 1.5 dias.

---

## 12. Riesgos / casos edge

| # | Caso | Comportamiento esperado |
|---|---|---|
| 1 | Owner intenta removerse a si mismo via boton (no deberia mostrarse) | UI no muestra el boton (guard `isSelf` en `<TeamMemberRow>`). Defensa server: `removeMember` valida `userId === ctx.userId` → `cannot_remove_self`. |
| 2 | Owner intenta remover a otro owner (futuro: dos owners en la misma agency) | UI no muestra el boton (guard `role === 'owner'`). Defensa server: `removeMember` valida `target.role === 'owner'` → `cannot_remove_owner`. |
| 3 | Email del invite ya existe en `auth.users` pero NO en `public.users` | Caso patologico (auth.users sin trigger ejecutado). `inviteUserByEmail` reportara `User already registered`. Lo tratamos como `invite_failed` con mensaje al owner. No reintentamos. |
| 4 | Email del invite ya es miembro **inactivo** (soft-deleted) | Pre-check en §3.2 detecta `existingMembership.is_active === false` → reactiva via UPDATE. Toast: "X fue agregado al equipo de nuevo." (modo `existing_user_added`). |
| 5 | Email del invite ya es miembro **activo** | Pre-check → `member_already_exists`. Mensaje inline en modal. |
| 6 | Email del invite es de otro user existente (de otra agency) | Pre-check encuentra `existingUser` pero no `existingMembership`. INSERT directo del membership con `role='agent'` + skip invite email. Toast: modo `existing_user_added`. **Importante:** este es el caso "multi-agency user" que el plan diferia — pero el efecto practico es que el sistema lo soporta sin UI especial. Ver Decision Tecnica DT7. |
| 7 | Agent autenticado intenta navegar a `/a/[slug]/settings/equipo` | `requireAgencyOwner` → `notFound()`. 404 sin leak de existencia. |
| 8 | Master impersonando navega a `/a/[slug]/settings/equipo` | Permitido (branch master en helper). Puede invitar/remover. Banner ambar de impersonacion sigue visible. |
| 9 | Master NO impersonando pero loggeado, navega manual a `/a/[slug]/settings/equipo` de una agency ajena | Cookie `master_impersonating` no existe → cae al gate normal → master no tiene membership con role=owner → `notFound()`. **Comportamiento OK**: master solo entra via impersonacion explicita. |
| 10 | Concurrencia: dos owners (futuro) remueven al mismo agent en paralelo | Segundo UPDATE encuentra `is_active=false` ya → idempotente → ok: true. Toasts duplicados (uno por owner) — aceptable. |
| 11 | Owner clickea "Invitar" con email vacio | Boton deshabilitado en UI (`disabled={!email.trim()}`). Si llega al server por path raro: zod `invalid_input`. |
| 12 | Invite email no llega (Resend / Supabase mailer caido) | `inviteUserByEmail` puede devolver ok igual (Supabase encola el mail). No detectamos failure de delivery aca. Si el cliente reporta "no llega", se reenvia via nuevo invite (que falla con `User already registered` si el auth.users ya se creo — caso #3). **Limitacion conocida**, fuera de scope. |
| 13 | Owner es removido como owner (no implementado) | El sistema no expone este caso. Si ocurre por SQL manual, el owner perderia acceso a `/settings/equipo` (notFound) pero sigue siendo `owner_user_id` de la agency. Inconsistencia tolerada — fuera de scope. |
| 14 | Member tiene `accepted_at = null` pero `lastSignInAt != null` | Aceptable. La UI muestra `lastSignInAt` formateado (no "Invitacion pendiente"). Documentado en §3.1. |
| 15 | Agency suspendida (`is_active=false` desde master) | Owner sigue pudiendo entrar a `/settings/equipo` (ADM-2 D6: suspension solo metadata). Comportamiento OK. ADM-4 cableara el efecto real. |

### Decision Tecnica DT7 — multi-agency users

Caso #6 hace que un user pueda terminar siendo miembro de N agencies sin querer (un email se reusa, otro owner lo agrega). El plan diferia este caso porque "hoy 1 user = 1 agency_membership por agency". **Nuestro esquema YA soporta N memberships por user** (UNIQUE es `(agency_id, user_id)`, no `user_id`). El frontend hoy NO tiene selector de agency — el user que es miembro de N agencies entra siempre a "la primera" segun RLS.

**Para ADM-3: aceptamos el caso #6 sin agregar UI.** Cuando el cliente B agrega a un email que ya es miembro de la agency A, el user ahora es miembro de las dos. El user, al hacer login, va a `/a/<primera-agency>/...` (el redirect post-login no es problema de ADM-3). Si surge confusion real cuando un cliente reporta "el agente que invite no aparece", ahi se prioriza un selector de agency post-login — fuera de scope.

---

## 13. Decisiones tecnicas menores a confirmar con vos (NO con el founder)

| # | Decision | Recomendacion del arquitecto |
|---|---|---|
| DT1 | `inviteMember`: dos modos (`invite_sent` / `existing_user_added`) | **Si, ambos modos.** Toast distinto por modo. Cliente entiende que el agente ya tenia cuenta o no. |
| DT2 | Path de las actions | **`src/app/a/[slug]/settings/equipo/_actions/team.ts`.** Cohesion con la pagina, mismo patron que `master/_actions/`. |
| DT3 | Master impersonando ve la pagina de equipo con permisos completos | **Si, permisos completos.** Banner ambar deja claro el modo. UX rota si master no puede actuar. |
| DT4 | Soft delete via `is_active=false` vs hard delete | **Soft delete.** Preserva historico, sin migracion, UNIQUE no rebota en reactivacion (UPDATE). |
| DT5 | Reusar `AgencyMember` type del scope master | **Si, reusar.** Identico para ambos contextos hoy. Branch si diverge en el futuro. |
| DT6 | Agregar item "Equipo" al sidebar cliente bajo "Configuracion" | **Si, condicional a `isOwner`.** Sin sub-tabs en settings (mantiene la actual simpleza). |
| DT7 | Comportamiento con email que ya es user de otra agency (multi-agency) | **Aceptar:** lo agregamos al equipo sin UI especial. Documentado para ADM-4+ si genera confusion. |
| DT8 | `accepted_at` se setea desde la action o desde un trigger futuro | **Desde nada en ADM-3.** Lo dejamos null. UI usa `lastSignInAt` como senial. Trigger futuro lo seteea al primer login — no es parte de ADM-3. |
| DT9 | Audit log para invite/remove (cliente-facing) | **No en ADM-3.** No tenemos `agency_audit_log` y `master_audit_log` no aplica. Si surge necesidad, se crea tabla nueva en ADM-4+. |
| DT10 | Format helper para "hace 2 horas" | Si `date-fns` ya esta en deps (verificar package.json), reusar `formatDistanceToNow`. Si no, helper custom corto. NO agregar dep nueva solo por esto. |
| DT11 | Auto-format relativo + tooltip absoluto | **Si, tooltip con ISO absoluto** en `<span title={iso}>...</span>`. Cliente puede hover para ver fecha exacta. |
| DT12 | Modal abierto y user navega → state se pierde | **Aceptado.** No persistimos el modal en URL. Si el cliente refresca, vuelve a la lista limpia. |

---

## 14. Lo que NO entra (recordatorio, congelado)

- Cambiar rol de un miembro → no aplica en MVP (un solo rol asignable: `agent`).
- Invitar `admin` / `viewer` → post-MVP.
- Suspender user individual (sin remover) → diferido.
- Transferir ownership → caso edge, diferido.
- Audit log visible por user → diferido.
- Múltiples agencies por user con selector post-login → diferido (caso #6 funcional sin UI).
- Trigger para setear `accepted_at` al primer login → fuera de scope ADM-3.
- Reenvio de invite manual ("link no llego") → fuera de scope. Si surge, el cliente borra al miembro inactivo y re-invita.
- Modificar `createAgencyWithOwner` o el flow ADM-1 → **prohibido por el founder**.

---

## 15. Conflictos detectados durante la auditoria (resumen)

Detallados en §0. Aqui solo recordatorio:

- K1: `plan-sistema-admin.md` §C1/§C2 contradice D3 LOCK-IN → **resuelto a favor de D3** (solo owner accede, rol fijo `agent`).
- K2: Plan §B1 menciona un trigger en `auth.users` para `agency_memberships` que NUNCA se creo → ADM-3 NO crea migration 0018, sigue patron INSERT explicito de ADM-1.
- K3: Settings hoy es pagina unica sin sub-tabs → "Equipo" se agrega como item separado al sidebar, no como tab interno de settings.

---

## Anexo: Checklist final pre-merge

- [ ] Migration: **ninguna** (verificar que el implementador no agrega ninguna sin justificarla).
- [ ] Build pasa local (`pnpm build` o equivalente).
- [ ] Lint sin warnings.
- [ ] Verificacion manual del flow completo:
  1. Login como owner de una agency (puede ser Robert Fisioterapia).
  2. Click en sidebar -> "Equipo" (debe aparecer porque sos owner).
  3. Ver lista: solo vos como owner. Empty state visible.
  4. Click "+ Invitar miembro" -> modal abierto -> email del agente.
  5. Submit -> toast "Invitacion enviada" -> modal cierra -> lista actualizada con row del agente (badge "Agent", "Invitacion pendiente").
  6. Verificar email recibido en la inbox del agente.
  7. Agente clickea magic link -> entra a `/a/<slug>/inbox` -> ve solo sus conversaciones (segun RLS futura).
  8. Volver como owner -> "Equipo" muestra al agente con "Sin acceso aun" o "hace X minutos" segun timing.
  9. Click "Remover" en el row del agente -> confirm modal -> "Si, remover" -> toast.
  10. Agente refresca su `/a/<slug>/inbox` -> ve 404 o redirect a login (perdio membership).
  11. Owner intenta invitarse a si mismo -> inline error "No podes invitarte a vos mismo".
  12. Owner intenta invitar a un email ya en el equipo (otro test agent activo) -> inline error "Este email ya esta en tu equipo".
  13. Verificar que un agent autenticado en otra ventana intenta navegar a `/a/<slug>/settings/equipo` -> 404.
  14. Master loggeado pero NO impersonando navega a `/a/<slug>/settings/equipo` de una agency cualquiera -> 404.
  15. Master impersona la agency -> banner ambar visible -> navega a `/a/<slug>/settings/equipo` -> ve la pagina y puede invitar/remover (banner sigue visible).
- [ ] PR a `main` via feature branch + Vercel preview (cumple `feedback_github_workflow.md`).
- [ ] Update de `memory/decisions.md` con D7 (alcance de gestion de equipo cliente-facing: solo owner + solo rol agent + soft delete).
- [ ] Update de `memory/plan-sistema-admin.md` marcando ADM-3 como completada.
