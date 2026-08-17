# Spec Técnico — Fase ADM-1 (Vista Master + Crear Cliente)

**Fecha:** 2026-06-01
**Autor:** arquitecto (template)
**Estado:** listo para implementación por backend-builder + frontend-builder
**Decisiones congeladas:** D1-D5 (ver `memory/plan-sistema-admin.md` §7) — NO se cuestionan en este spec.

Este documento describe paths, signatures, SQL y UX exactos. Quien implemente NO debe re-arquitecturar — solo ejecutar.

---

## 1. Resumen del estado actual relevante

### Tablas existentes ya aplicadas (no se tocan)

| Tabla / objeto | Origen | Notas relevantes para ADM-1 |
|---|---|---|
| `public.users` | 0002 | FK a `auth.users(id)`. Trigger `handle_new_user` (0007) la crea automáticamente cuando se inserta en `auth.users` (incluyendo cuando llega un invite aceptado). |
| `public.agencies` | 0002 | Columnas relevantes: `id`, `owner_user_id`, `slug` (UNIQUE), `name`, `country_code`, `timezone`, `currency`, `plan`, `settings` (jsonb), `bot_config` (jsonb), `is_active`. NO existe columna `industry` — hay que agregarla. |
| `public.agency_memberships` | 0002 | UNIQUE (agency_id, user_id). Default `role='agent'`, `is_active=true`. |
| `public.master_accounts` | 0002 | UNIQUE (user_id). Solo `super_admin` escribe (RLS 0006). Hans está adentro. |
| `public.leads`, `public.conversations`, `public.messages` | 0003 | Tienen `agency_id` + RLS member-or-master. Usados solo para counters en ADM-1. |
| `public.master_audit_log` | 0002 | Existe, no se llena aún. NO se toca en ADM-1 (lo dejamos para ADM-2 con impersonate). |
| Enum `agency_role` | 0001 | Valores: `owner`, `admin`, `agent`, `viewer`. MVP usa `owner` + `agent`. |

### Helpers SQL existentes (no se duplican)

| Función | Origen | Comportamiento |
|---|---|---|
| `public.is_master()` | 0006 | `SECURITY DEFINER STABLE`. Devuelve `true` si `auth.uid()` tiene fila activa en `master_accounts`. **YA EXISTE — no se recrea.** |
| `public.is_super_admin()` | 0006 | `SECURITY DEFINER STABLE`. Idem pero con `role='super_admin'`. |
| `public.is_member_of(aid uuid)` | 0006 | `SECURITY DEFINER STABLE`. Membresía activa del user actual en agency `aid`. |

### RLS policies relevantes (no se duplican)

| Tabla | Policy | Permite a master |
|---|---|---|
| `agencies` | `agencies_select` | SI (`is_master()`) — el master ve TODAS las agencies cross-tenant. |
| `agencies` | `agencies_insert` | SI — WITH CHECK incluye `is_master() OR owner_user_id = auth.uid()`. El master puede insertar con `owner_user_id` apuntando a otro user. |
| `agencies` | `agencies_update` | SI. |
| `agency_memberships` | `memberships_write` (FOR ALL) | SI — `is_master()` en USING y WITH CHECK. El master inserta membership de owner sin ser miembro. |
| `users` | `users_self_select` | SI — el master puede leer todas las rows de `users` (necesario para mostrar email del owner). |
| `leads`, `conversations`, `messages` | `*_access` | SI — el master ve cross-tenant. Necesario para counters. |

**Conclusión RLS:** las policies actuales YA permiten al master hacer todo lo que ADM-1 requiere. NO hay que crear policies nuevas para que los SELECT/INSERT funcionen. Lo único que hay que agregar es lo descrito en §6 (industria, helper TypeScript de gate, y una optimización menor de policies para confirmar `is_master` en CHECK de inserts cross-tenant — pero está cubierto).

### Rutas y código actual relevantes

| Path | Qué hace hoy |
|---|---|
| `crm-v2/src/app/page.tsx` | Home `/`. Lista agencies del user. Si es master, lista todas. **Sigue existiendo, no se borra** — pero el master tendrá un link/redirect a `/master` desde acá. |
| `crm-v2/src/app/a/[slug]/layout.tsx` | Layout de agency cliente. Gate `auth.getUser()` + `notFound()` si la agency no existe (RLS filtra). |
| `crm-v2/src/app/a/[slug]/admin/page.tsx` | Panel admin POR AGENCY (editor de bot_config). Gate `notFound()` si no master. **Sigue existiendo** en ADM-1 (no se mueve todavía — eso es ADM-2 tab "Bot Config"). |
| `crm-v2/src/app/a/[slug]/admin/actions.ts` | `saveBotConfig()`. Patrón: user-bound client para gate + admin client (service_role) para write. **Es el patrón a copiar.** |
| `crm-v2/src/lib/supabase/server.ts` | `createClient()` user-bound vía cookies SSR. |
| `crm-v2/src/lib/supabase/admin.ts` | `createAdminClient()` con SERVICE_ROLE — bypasea RLS. Usar para escrituras. |
| `crm-v2/src/lib/supabase/middleware.ts` | Helper `updateSession()` que protege rutas (`/login` y `/auth/*` públicas; resto privadas). **YA EXISTE pero NO está conectado** — no hay `crm-v2/middleware.ts` ni `crm-v2/src/middleware.ts`. **Capa 1 de la defensa hay que crearla.** |

### Helpers TypeScript inexistentes (hay que crear)

| Helper | Estado | A crear en |
|---|---|---|
| `requireMaster()` | NO existe | `crm-v2/src/lib/auth/require-master.ts` (carpeta nueva) |
| `crm-v2/middleware.ts` raíz | NO existe | hay que crearlo (D1 capa 1) |
| Carpeta `/master/*` | NO existe | toda la árbol de rutas a crear |

### Conflictos detectados (none breaking)

Ninguna decisión D1-D5 entra en conflicto con el código actual. El gate del actual `/a/[slug]/admin` queda intacto y se reusará tal cual en ADM-2 dentro del tab "Bot Config" del detalle.

---

## 2. Defensa en profundidad — 3 capas

### Capa 1 — Middleware Next.js (cosmético + UX)

**Archivo:** `crm-v2/src/middleware.ts` (nuevo, raíz de src)

**Responsabilidad:** redirect rápido en el edge antes de que se ejecute server-side rendering. NO es la barrera de seguridad real (eso es capa 2 + 3). Solo evita que un user no-master vea siquiera un loading state de `/master/*`.

**Lógica (pseudo-código):**

```ts
import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  // 1. Refresca sesión + redirect a /login si no autenticado (lógica que YA está
  //    en updateSession pero NO está conectada). Esta llamada cubre auth básica
  //    para TODO el sitio.
  const response = await updateSession(request);

  // updateSession ya redirige a /login si no hay user. Si hubo redirect, salir.
  if (response.headers.get('location')) return response;

  // 2. Gate adicional SOLO para /master/*: chequear master_accounts.
  const { pathname } = request.nextUrl;
  if (pathname.startsWith('/master')) {
    // Crear cliente Supabase contra cookies del request para chequear.
    const supabase = createServerClient(/* ...mismo patrón que updateSession... */);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.redirect(new URL('/login', request.url));

    const { data: master } = await supabase
      .from('master_accounts')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!master) {
      // No master → redirect a / (la home decide qué mostrar).
      // NO hacemos notFound() en middleware (no se puede). El notFound() real
      // lo hace la Capa 2 en cada page server component.
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Match all routes excepto _next/static, _next/image, favicon y la api de auth.
    '/((?!_next/static|_next/image|favicon.ico|auth/.*).*)',
  ],
};
```

**Cookies usadas:** las que setea Supabase Auth SSR (cookie nombre arranca con `sb-`). El helper `updateSession` ya maneja el refresh.

**Redirect target:** `/login` si no auth, `/` si auth pero no master.

**Qué pasa si falla:** el user ve un redirect rápido y nunca toca el server component de `/master/*`. Pero si por algún motivo el middleware no corre (deploy mal config, etc.), Capa 2 ataja.

---

### Capa 2 — Server-side gate en cada page

**Archivo helper:** `crm-v2/src/lib/auth/require-master.ts` (nuevo)

**Signature:**

```ts
// require-master.ts
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { User } from '@supabase/supabase-js';

export type MasterContext = {
  user: User;
  masterRole: 'super_admin' | 'admin' | 'support_readonly';
};

/**
 * Gate de master para Server Components y Server Actions.
 *
 * Comportamiento:
 *   - Si no hay sesión → redirect('/login').
 *   - Si hay sesión pero NO está en master_accounts (o is_active=false) → notFound().
 *     (notFound y NO redirect: no revelamos que /master/* existe.)
 *   - Si pasa → devuelve { user, masterRole }.
 *
 * Uso:
 *   const { user } = await requireMaster();
 */
export async function requireMaster(): Promise<MasterContext> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: master } = await supabase
    .from('master_accounts')
    .select('role, is_active')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!master || !master.is_active) notFound();

  return { user, masterRole: master.role as MasterContext['masterRole'] };
}
```

**Dónde se llama:**

| Lugar | Llamada |
|---|---|
| `crm-v2/src/app/master/layout.tsx` | `await requireMaster()` al inicio. Cubre todos los descendientes. |
| `crm-v2/src/app/master/page.tsx` | (opcional defensa redundante, no obligatoria — el layout ya gate). |
| Cada server action en `crm-v2/src/app/master/_actions/*.ts` | Primera línea de cada export `await requireMaster()`. |

**Qué pasa si falla:** `notFound()` lanza al renderer del 404 de Next, mismo comportamiento que el panel `/a/[slug]/admin` actual.

---

### Capa 3 — RLS Postgres (barrera real)

Para ADM-1, **las policies actuales ya cubren todo lo necesario** (ver §1). NO hay que agregar policies de gate cross-tenant — `is_master()` ya está embebida en `agencies_select`, `agencies_insert`, `memberships_write`, etc.

Lo único nuevo en SQL es:
1. Agregar columna `industry` a `agencies` (NO RLS, solo schema).
2. Agregar UNIQUE check funcional + ÍNDICE (`slug` ya es UNIQUE pero lo confirmamos).
3. Trigger opcional para auto-insertar `agency_memberships` en `users` cuando llega un invite con metadata (ver §7 — DECISIÓN MENOR a confirmar).

**Política nueva mínima:** ninguna obligatoria. Ver §6 para detalle de la migration.

**Qué pasa si las capas 1+2 fallan y un attacker llega al cliente Supabase:** RLS lo rebota. El attacker NO puede:
- Leer agencies de otros tenants (filtrado por `is_member_of OR is_master`).
- Insertar agencies con `owner_user_id` ajeno a menos que sea master.
- Insertar memberships en agencies ajenas a menos que sea master.

---

## 3. Rutas a crear

Estructura completa bajo `crm-v2/src/app/master/`:

```
crm-v2/src/app/master/
├── layout.tsx                           ← gate global + shell sidebar master
├── page.tsx                             ← dashboard M1
├── _actions/                            ← server actions del scope master
│   └── agencies.ts                      ← listAgenciesForMaster, getMasterDashboardCounters, createAgencyWithOwner
├── _components/
│   ├── master-shell.tsx                 ← sidebar propio + topbar (no reusa AgencyShell)
│   └── create-client-modal.tsx          ← modal "+ Crear cliente"
└── clientes/
    ├── page.tsx                         ← lista M2
    └── [slug]/
        └── page.tsx                     ← placeholder ADM-2 (M4)
```

### 3.1 `crm-v2/src/app/master/layout.tsx`

**Responsabilidad:** gate master + shell visual propio (NO usar `AgencyShell` — esa es para vista dentro de una agency).

**Datos que lee:**
- `requireMaster()` → si pasa, `{ user, masterRole }`.
- `users` para `full_name` / `email` (mostrar en sidebar). 1 query.

**Render:**

```tsx
export default async function MasterLayout({ children }: { children: React.ReactNode }) {
  const { user, masterRole } = await requireMaster();
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from('users')
    .select('full_name, email')
    .eq('id', user.id)
    .single();

  return (
    <MasterShell
      user={{ name: profile?.full_name ?? profile?.email ?? '', role: masterRole }}
    >
      {children}
    </MasterShell>
  );
}
```

**Server actions invocadas:** ninguna directa (las invocan los children).

---

### 3.2 `crm-v2/src/app/master/page.tsx` — Dashboard M1

**Responsabilidad:** vista de bienvenida con 3 counters básicos + link rápido a `/master/clientes`.

**Datos que lee** (vía server action `getMasterDashboardCounters()`):
- `totalAgencies`
- `totalLeadsAcrossAll`
- `activeConversationsToday` (conversations con `last_message_at >= today`)

**Render:** 3 cards con counters (display estático + número) + CTA "Ver clientes" → `/master/clientes` + CTA "+ Crear cliente" que abre el modal.

---

### 3.3 `crm-v2/src/app/master/clientes/page.tsx` — Lista M2

**Responsabilidad:** tabla de agencies con métricas resumen + botón "+ Crear cliente".

**Datos que lee** (vía server action `listAgenciesForMaster()`):
- Array de `{ id, slug, name, industry, leadsCount, conversationsActiveCount, lastUsedAt, ownerEmail }`.

**Render:**
- Header con título "Clientes" + botón "+ Crear cliente" (top-right) que abre `<CreateClientModal />`.
- Tabla:
  - Columnas: Nombre / Slug / Industria / Leads / Conv. activas / Última actividad / Owner / Acciones.
  - Cada fila: Link al detalle `/master/clientes/[slug]`.
  - Empty state si `agencies.length === 0`: "Todavía no creaste ningún cliente." + CTA al modal.
- Estado del modal manejado en componente client wrapper (Server Component renderiza el listado server-side; un Client Component pequeño maneja open/close del modal).

---

### 3.4 `crm-v2/src/app/master/clientes/[slug]/page.tsx` — Placeholder ADM-2

**Responsabilidad en ADM-1:** placeholder mínimo. NO es el M4 completo todavía.

**Datos que lee:** la agency por slug (`select id, name, slug, industry, is_active, plan`).

**Render:** página simple "Detalle de cliente — en construcción (ADM-2)". Muestra nombre, slug, industria. Link "Ingresar al CRM del cliente" → `/a/[slug]` (esto SÍ funciona hoy porque master pasa el gate del layout de agency vía `is_master()` en RLS).

**Razón de incluirlo en ADM-1:** desde la tabla de M2 el click en una fila tiene que ir a algún lado coherente, no a un 404.

---

## 4. Server actions a crear

**Archivo único:** `crm-v2/src/app/master/_actions/agencies.ts`

Mantenemos la convención del proyecto (co-localizadas, `'use server'` al tope). Las exporto agrupadas por archivo para evitar bundles enormes.

### 4.1 `listAgenciesForMaster()`

```ts
'use server';

import { requireMaster } from '@/lib/auth/require-master';
import { createClient } from '@/lib/supabase/server';

export type MasterAgencyRow = {
  id: string;
  slug: string;
  name: string;
  industry: string | null;
  leadsCount: number;
  conversationsActiveCount: number;
  lastUsedAt: string | null;
  ownerEmail: string | null;
};

/**
 * Lista todas las agencies para vista master.
 * RLS: el SELECT cross-tenant pasa por `is_master()` en `agencies_select`.
 * Los counts vienen de queries adicionales (no hay vista materializada todavía).
 *
 * Performance ADM-1: para <50 clientes, N+1 OK. Si excede 100, migrar a una RPC.
 */
export async function listAgenciesForMaster(): Promise<MasterAgencyRow[]> {
  await requireMaster();
  const supabase = await createClient();

  const { data: agencies, error } = await supabase
    .from('agencies')
    .select(`
      id, slug, name, industry,
      owner_user_id,
      owner:users!agencies_owner_user_id_fkey(email)
    `)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  // Counters: por agency, 2 queries simples. RLS deja pasar al master.
  const rows: MasterAgencyRow[] = await Promise.all(
    (agencies ?? []).map(async (a) => {
      const [{ count: leadsCount }, { count: activeCount }, { data: lastMsg }] =
        await Promise.all([
          supabase.from('leads').select('id', { count: 'exact', head: true }).eq('agency_id', a.id),
          supabase
            .from('conversations')
            .select('id', { count: 'exact', head: true })
            .eq('agency_id', a.id)
            .eq('handler', 'human')
            .is('archived_at', null),
          supabase
            .from('conversations')
            .select('last_message_at')
            .eq('agency_id', a.id)
            .order('last_message_at', { ascending: false, nullsFirst: false })
            .limit(1)
            .maybeSingle(),
        ]);

      const owner = a.owner as unknown as { email: string } | null;
      return {
        id: a.id,
        slug: a.slug,
        name: a.name,
        industry: a.industry,
        leadsCount: leadsCount ?? 0,
        conversationsActiveCount: activeCount ?? 0,
        lastUsedAt: lastMsg?.last_message_at ?? null,
        ownerEmail: owner?.email ?? null,
      };
    }),
  );

  return rows;
}
```

**RLS:** todo via user-bound client (master pasa por `is_master()` en todas las policies).

---

### 4.2 `getMasterDashboardCounters()`

```ts
export type MasterDashboardCounters = {
  totalAgencies: number;
  totalLeadsAcrossAll: number;
  activeConversationsToday: number;
};

export async function getMasterDashboardCounters(): Promise<MasterDashboardCounters> {
  await requireMaster();
  const supabase = await createClient();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString();

  const [{ count: agCount }, { count: leadsCount }, { count: convCount }] = await Promise.all([
    supabase.from('agencies').select('id', { count: 'exact', head: true }),
    supabase.from('leads').select('id', { count: 'exact', head: true }),
    supabase
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .gte('last_message_at', todayIso),
  ]);

  return {
    totalAgencies: agCount ?? 0,
    totalLeadsAcrossAll: leadsCount ?? 0,
    activeConversationsToday: convCount ?? 0,
  };
}
```

---

### 4.3 `createAgencyWithOwner(input)`

La más crítica. Hace 4 cosas en orden:

1. Crea el invite Auth (`auth.admin.inviteUserByEmail`). Esto genera `auth.users` row → trigger `handle_new_user` crea `public.users` row con `id` igual al de auth.
2. Inserta `agencies` con `owner_user_id` = id del nuevo user.
3. Inserta `agency_memberships` con `role='owner'` para ese user.
4. Devuelve `{ agencyId, slug, inviteSent: true }`.

**Schema zod:**

```ts
import { z } from 'zod';

export const createAgencyInput = z.object({
  businessName: z.string().min(2).max(120),
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'Solo minúsculas, números y guiones'),
  industry: z.enum(['fisio', 'inmobiliaria', 'otra']),
  industryCustom: z.string().max(60).optional(), // requerido si industry='otra'
  ownerEmail: z.string().email(),
  ownerName: z.string().min(2).max(120),
}).refine(
  (v) => v.industry !== 'otra' || (v.industryCustom && v.industryCustom.trim().length > 0),
  { message: 'Especificá la industria', path: ['industryCustom'] }
);

export type CreateAgencyInput = z.infer<typeof createAgencyInput>;

export type CreateAgencyResult =
  | { ok: true; agencyId: string; slug: string; inviteSent: true }
  | { ok: false; error: CreateAgencyError };

export type CreateAgencyError =
  | 'not_master'
  | 'slug_taken'
  | 'invalid_input'
  | 'invite_failed'
  | 'agency_insert_failed'
  | 'membership_insert_failed';
```

**Implementación (pseudo-código):**

```ts
'use server';

export async function createAgencyWithOwner(
  input: CreateAgencyInput,
): Promise<CreateAgencyResult> {
  await requireMaster();

  const parsed = createAgencyInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  const { businessName, slug, industry, industryCustom, ownerEmail, ownerName } = parsed.data;
  const industryValue = industry === 'otra' ? industryCustom!.trim() : industry;

  const admin = createAdminClient();

  // 1. Verificar slug libre antes de invitar (evita gastar invite si choca).
  const { data: existing } = await admin
    .from('agencies')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (existing) return { ok: false, error: 'slug_taken' };

  // 2. Invitar al owner.
  //    redirectTo: el callback que ya existe (/auth/callback) + next=/a/<slug>.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
    ownerEmail,
    {
      data: { full_name: ownerName, intended_agency_slug: slug, intended_role: 'owner' },
      redirectTo: `${siteUrl}/auth/callback?next=/a/${slug}`,
    },
  );
  if (inviteErr || !inviteData.user) {
    // CASO: usuario ya existe en auth.users.
    // inviteUserByEmail por defecto FALLA con "User already registered".
    // Para ADM-1: reportar error claro. El master ve "Este email ya está en uso";
    // tendrá que crear el cliente con otro email o (futuro) usar flujo "vincular existente".
    return { ok: false, error: 'invite_failed' };
  }

  const newUserId = inviteData.user.id;
  // El trigger handle_new_user (0007) ya creó public.users con id=newUserId.

  // 3. Insertar agencies. El admin client bypasea RLS, pero respetamos la lógica:
  //    owner_user_id = newUserId, country/timezone defaults.
  const { data: agencyRow, error: agencyErr } = await admin
    .from('agencies')
    .insert({
      name: businessName,
      slug,
      industry: industryValue,
      owner_user_id: newUserId,
      country_code: 'CR',
      timezone: 'America/Costa_Rica',
      currency: 'CRC',
      plan: 'trial',
      bot_config: {},
      settings: {},
    })
    .select('id')
    .single();
  if (agencyErr || !agencyRow) {
    // Best effort: dejar al usuario invited en auth.users; el master puede
    // re-intentar con el mismo email después (caería en `invite_failed`) o
    // borrar manualmente. No abortamos el invite porque ya se envió email.
    return { ok: false, error: 'agency_insert_failed' };
  }

  // 4. Insertar membership owner.
  const { error: memErr } = await admin.from('agency_memberships').insert({
    agency_id: agencyRow.id,
    user_id: newUserId,
    role: 'owner',
    is_active: true,
    invited_at: new Date().toISOString(),
  });
  if (memErr) {
    return { ok: false, error: 'membership_insert_failed' };
  }

  // No revalidatePath necesario — el modal hace router.refresh() al cerrar.
  return { ok: true, agencyId: agencyRow.id, slug, inviteSent: true };
}
```

**Por qué usamos `createAdminClient()` (service_role) para todo el flujo:**
- `inviteUserByEmail` requiere service_role (es `auth.admin`).
- Aunque RLS permite al master los inserts en `agencies` y `agency_memberships`, usar el admin client elimina el ida-vuelta de cookies y simplifica el manejo de transacciones.
- El gate de master ya pasó arriba con `requireMaster()` (que usa el user-bound client).

**Trade-off ALTERNATIVA descartada:** crear todo en una SQL function `create_agency_with_owner()`. Razón de NO ir por ahí en ADM-1: `inviteUserByEmail` vive en JS (Auth API), no se puede llamar desde una función SQL. Para no fragmentar (mitad SQL + mitad JS), todo va en server action.

---

## 5. Modal "Crear cliente"

**Archivo:** `crm-v2/src/app/master/_components/create-client-modal.tsx`
**Tipo:** Client Component (`'use client'`).

### Campos del formulario

| Campo | Tipo UI | Validación | Comportamiento |
|---|---|---|---|
| Nombre del negocio | `<input type="text">` | zod min(2) max(120) | Al onChange, auto-genera slug si el slug está vacío o el user no lo ha tocado (kebab-case). |
| Slug | `<input type="text">` | zod regex `^[a-z0-9-]+$`, min(2) max(40) | Visible siempre. Mark "tocado por user" cuando edite manual. |
| Industria | `<select>` con opciones | zod enum | `Fisio`, `Inmobiliaria`, `Otra...`. Si elige `Otra`, muestra campo `industryCustom` debajo. |
| Industria custom | `<input>` (condicional) | requerido si industry='otra' | Aparece solo cuando industry='otra'. |
| Email del owner | `<input type="email">` | zod email | Requerido. |
| Nombre del owner | `<input type="text">` | zod min(2) max(120) | Requerido. |

### Estados UX

| Estado | UI |
|---|---|
| `idle` | Form normal con botón "Crear cliente". |
| `submitting` | Botón deshabilitado, spinner. Inputs no editables. |
| `success` | Modal cierra. Toast "Cliente {businessName} creado. Invitación enviada a {ownerEmail}." Lista de M2 se refresca vía `router.refresh()`. |
| `error: slug_taken` | Inline error debajo del slug: "Ese slug ya está tomado, probá otro." |
| `error: invite_failed` | Inline error debajo del email: "Ese email ya está registrado o el invite falló. Probá otro email." |
| `error: invalid_input` | Mensajes inline por campo (zod). |
| `error: agency_insert_failed` / `membership_insert_failed` | Banner rojo arriba: "Error al crear el cliente. Contactá al admin." + log en consola del browser. |
| `error: not_master` | (no debería pasar en UI normal) Banner: "Sesión expirada o sin permisos." |

### Reset al cerrar

Al cerrar (success O cancel), el estado del form se resetea a defaults (todos vacíos, industry='fisio' por default sugerido).

### Notificación post-success

Toast/sonner (o equivalente del proyecto — si no hay librería de toast, usar un componente custom inline temporal). Texto: `"Cliente {name} creado. Invitación enviada a {email}."` con auto-dismiss a 5s.

### Invocación de la server action

```tsx
'use client';
import { useTransition } from 'react';
import { createAgencyWithOwner } from '../_actions/agencies';

function CreateClientModal({ onClose }: { onClose: () => void }) {
  const [isPending, startTransition] = useTransition();
  // ... state form ...

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createAgencyWithOwner({ ... });
      if (result.ok) {
        // toast + router.refresh()
        onClose();
      } else {
        // map result.error a UI state
      }
    });
  }
  // ...
}
```

---

## 6. Migration SQL

**Archivo:** `crm-v2/supabase/migrations/0017_admin_master_adm1.sql` (siguiente número libre — la última actual es `0016`).

```sql
-- =============================================================================
-- Migration 0017 — Admin Master Fase ADM-1
-- =============================================================================
-- Cambios:
--   1. agencies.industry (nueva columna) — preset 'fisio'/'inmobiliaria'/texto libre.
--   2. Confirmar índice de slug (ya UNIQUE en 0002, esto es defensa).
--   3. NO se modifican policies — las actuales (0006) cubren los selects/inserts
--      cross-tenant del master vía is_master().
--   4. NO se modifica is_master() — ya existe en 0006 y funciona.
-- =============================================================================

-- 1. Industry en agencies
alter table public.agencies
    add column if not exists industry text;

comment on column public.agencies.industry is
    'Industria del negocio. Presets UI: "fisio" | "inmobiliaria". "otra" se guarda como texto libre del input. Sin enum para flexibilidad.';

-- 2. Defensa: confirmar UNIQUE de slug (ya existe en 0002 pero re-asseguramos).
do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conrelid = 'public.agencies'::regclass
          and contype = 'u'
          and conname = 'agencies_slug_key'
    ) then
        alter table public.agencies add constraint agencies_slug_key unique (slug);
    end if;
end $$;

-- 3. Índice optimización para listAgenciesForMaster (ordering por created_at).
create index if not exists idx_agencies_created_at_desc
    on public.agencies(created_at desc);

-- 4. GRANT EXECUTE sobre is_master a authenticated.
--    Ya está en 0006, esto es idempotente:
grant execute on function public.is_master() to authenticated;
```

**Por qué tan minimalista:**

- `is_master()` ya existe y funciona — no se recrea.
- Las policies que dejarían al master leer/escribir cross-tenant en `agencies`, `agency_memberships`, `users`, `leads`, `conversations` YA INCLUYEN `is_master()` en USING y WITH CHECK (verificado en migration 0006 leída).
- No se mete trigger de auto-membership al accept del invite porque la membership la creamos NOSOTROS en la server action al momento de crear la agency (no esperamos a que el owner acepte). El trigger sería redundante.
- No se agrega `industry_enum` para mantener flexibilidad (D5 dice "Otra" es texto libre).

---

## 7. Riesgos / casos edge

| # | Caso | Severidad | Mitigación en ADM-1 |
|---|---|---|---|
| R1 | **Email del owner ya existe en `auth.users`.** `inviteUserByEmail` por defecto falla con "User already registered". | Alta (probabilidad media) | Capturamos error → devolvemos `invite_failed` → UI muestra "Ese email ya está registrado, probá otro". POST-MVP: flujo "vincular usuario existente a nueva agency" (no hace falta para ADM-1 con Robert). |
| R2 | **Slug duplicado.** UNIQUE constraint dispara error 23505. | Media | Pre-check en server action ANTES de invitar (`select ... where slug = ?`). Si existe → `slug_taken` antes de gastar invite. UX: input slug muestra inline "Ese slug ya está tomado". |
| R3 | **Master crea cliente con su propio email.** Le manda invite a sí mismo, que se confundirá. | Baja | Validación zod adicional: si `ownerEmail === user.email` (del master) → reject `invalid_input` con mensaje "No podés invitarte a vos mismo como owner de un cliente". |
| R4 | **Invite enviado pero agency_insert falla.** Quedó `auth.users` huérfano. | Baja | Por ahora no rollback (Supabase Auth no expone delete user idempotente en flujo SSR fácilmente). Reportar `agency_insert_failed`. POST-MVP: agregar cleanup via cron o action manual. |
| R5 | **Slug auto-sugerido choca por coincidencia (ej "robert" ya tomado).** | Baja | El frontend del modal valida con backend antes de submit (debounce en input slug). Server action vuelve a validar (defensa). |
| R6 | **El invitee llega al magic link después de mucho tiempo y la URL no existe.** | Baja | Supabase Auth invita con expiry default 24h. Si pasa, master debe reinvitar (no UI en ADM-1, se hace por SQL hasta ADM-3). |
| R7 | **Master sin permisos pasa Capa 1 y 2 por bug, intenta llamar action.** | Crítica si pasa | RLS de `agencies` insert require `is_master() OR owner_user_id = auth.uid()`. Si el actor no es master y mete `owner_user_id` ≠ su uid (que es lo que el modal hace, pasando newUserId), RLS rebota. Pero como además la action usa `createAdminClient()` (bypasea RLS), la Capa 2 `requireMaster()` es la única barrera real. Aceptable porque las 2 primeras capas son robustas. |

### Tests sugeridos (no obligatorios para ADM-1 pero recomendados)

- E2E con Playwright: login como master → `/master/clientes` → click "+ Crear cliente" → form → submit → verifica toast + agency aparece en lista.
- Unit zod: `createAgencyInput.safeParse` con casos edge (slug con mayúsculas, industry='otra' sin custom, etc.).

---

## 8. Esfuerzo estimado

| Capa / componente | Tarea | Esfuerzo |
|---|---|---|
| Middleware raíz | `crm-v2/src/middleware.ts` + matcher config | 1 h |
| Helper TS | `crm-v2/src/lib/auth/require-master.ts` | 0.5 h |
| Migration | `0017_admin_master_adm1.sql` + push | 0.5 h |
| Server actions | `_actions/agencies.ts` (3 funciones + zod) | 2.5 h |
| Layout master | `master/layout.tsx` + `MasterShell` component | 1.5 h |
| Page master dashboard | `master/page.tsx` + cards counters | 1 h |
| Page lista clientes | `master/clientes/page.tsx` + tabla + empty state | 2 h |
| Page detalle placeholder | `master/clientes/[slug]/page.tsx` | 0.5 h |
| Modal Crear Cliente | `_components/create-client-modal.tsx` + estados UX | 2.5 h |
| Toast / notif post-success | (puede ser inline si no hay lib) | 0.5 h |
| QA + dogfood (crear a Robert real) | manual | 1 h |
| **TOTAL** | | **~13.5 h (≈1.5 días dev)** |

Consistente con el plan original (1-2 días para ADM-1).

---

## 9. Decisiones técnicas menores a confirmar con el founder

Lista de cosas que necesitan input antes de que backend/frontend-builder ejecuten:

1. **Toast library.** ¿Hay `sonner` o `react-hot-toast` instalado en `crm-v2/package.json`? Si no, ¿instalar sonner para esto (estándar en proyectos Next) o componente custom inline temporal?
2. **NEXT_PUBLIC_SITE_URL en env.** ¿Está ya en `.env.example`? Si no, agregarlo (lo necesitamos para el `redirectTo` del invite).
3. **Email template del invite.** Supabase tiene template default ("Confirm your invite to {{SiteURL}}"). ¿Customizarlo en `supabase/templates/invite.html` ahora o post-ADM-1? Recomendación: post-ADM-1 (no bloquea dogfood, solo email feo).
4. **Counter "conversaciones activas hoy".** Definición: `last_message_at >= today 00:00 local TZ` (`America/Costa_Rica`). ¿OK o querés ventana de 24h rolling?
5. **R3 (master invita a sí mismo).** ¿Bloqueamos o lo dejamos pasar? Recomendación: bloquear (es 5 líneas de zod refinement y evita confusión).
6. **R1 (email del owner ya existe en auth.users).** En ADM-1 lo reportamos como error. Para Robert: si ya tiene cuenta en el sistema por algún test previo, hay que cleanup manual del auth.users antes de dogfood. ¿OK?
7. **MasterShell visual.** ¿Sidebar negro/oscuro tipo admin para separar mentalmente del shell cliente (que es claro), o mismo look mantener consistencia? Recomendación: mismo look pero con badge "MASTER" prominente en sidebar.

---

## 10. Entregable de ADM-1

Cuando todo lo de §3-§6 esté implementado y mergeado:

- Hans loguea con su email.
- Va a `/` y ve link "Ir al panel master" (link nuevo agregar a `page.tsx`, conditional `if (master)`).
- Click → `/master` (dashboard con 3 counters).
- Click "Ver clientes" → `/master/clientes` (lista, hoy con N=1 o 0 según estado).
- Click "+ Crear cliente" → modal.
- Llena: nombre="Robert Fisioterapia", slug="robert-fisio", industria="Fisio", email=robert@..., nombre="Robert ...".
- Submit → toast "Cliente Robert Fisioterapia creado. Invitación enviada a robert@...".
- Robert recibe email → click link → setea password → entra al `/a/robert-fisio` con rol owner.

**Dog-food cumplido. Cero SQL manual para onboarding del primer cliente real.**

---

## 11. Referencias

- `memory/plan-sistema-admin.md` — plan completo (este spec implementa §5 Fase ADM-1).
- `crm-v2/supabase/migrations/0002_core_identity.sql` — tablas base.
- `crm-v2/supabase/migrations/0006_rls.sql` — policies y helpers `is_master()`.
- `crm-v2/src/app/a/[slug]/admin/actions.ts` — patrón de server action master a copiar.
- `crm-v2/src/lib/supabase/middleware.ts` — helper a invocar desde `middleware.ts` raíz.
