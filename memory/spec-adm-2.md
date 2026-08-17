# Spec Tecnico — Fase ADM-2 (Detalle de cliente + Impersonacion)

**Fecha:** 2026-06-03
**Autor:** arquitecto (template)
**Estado:** listo para implementacion por backend-builder + frontend-builder
**Decisiones congeladas:** D1-D5 (ver `memory/plan-sistema-admin.md` §7) y alcance ADM-2 acordado con el founder en sesion 2026-06-03. NO se cuestionan.
**Esfuerzo objetivo:** 8-16h (~1-2 dias).

Este documento describe paths, signatures, SQL y UX exactos. Quien implemente NO debe re-arquitecturar, solo ejecutar. Si encuentra ambiguedad real, escala — no improvisa.

---

## 1. Resumen del estado actual relevante

### Rutas existentes (ya en `main` post-ADM-1)

| Path | Tipo | Estado actual / accion ADM-2 |
|---|---|---|
| `crm-v2/proxy.ts` | Edge proxy (raiz) | Gate auth + gate `/master/*`. **Hay que extender** con branch de impersonacion antes del gate de `/a/[slug]/*`. |
| `crm-v2/src/app/master/page.tsx` | Server | Dashboard master. **No se toca.** |
| `crm-v2/src/app/master/clientes/page.tsx` | Server | Lista de clientes. **No se toca.** |
| `crm-v2/src/app/master/clientes/[slug]/page.tsx` | Server | Placeholder actual con header + boton "Entrar al CRM". **Se reescribe** completo para hostear las 3 tabs. |
| `crm-v2/src/app/master/_actions/agencies.ts` | Server actions | 3 actions ADM-1 (`listAgenciesForMaster`, `getMasterDashboardCounters`, `createAgencyWithOwner`). **Se agregan** 5 actions nuevas aca mismo (no se crea archivo separado — ver Decision Tecnica 1). |
| `crm-v2/src/app/master/_actions/agencies.types.ts` | Types/zod | **Se extiende** con `AgencyDetail`, `AgencyMember` y un par de discriminated unions de resultado. |
| `crm-v2/src/lib/auth/require-master.ts` | Helper | `requireMaster()` devuelve `{ user, email, masterRole }`. **Se reusa tal cual.** |
| `crm-v2/src/app/master/_components/master-shell.tsx` | Client | Sidebar + topbar master. **No se toca.** Mantenemos paleta para consistencia visual del header del detalle. |
| `crm-v2/src/app/a/[slug]/layout.tsx` | Server | Hoy: `requireUser()` + lee agency por slug (RLS filtra). **Se modifica** para tolerar el modo impersonacion (validar cookie). |
| `crm-v2/src/app/a/[slug]/admin/page.tsx` | Server | Ruta del editor de bot config. **Queda intacta** (zombi accesible para masters; tab nuevo lo absorbe sin duplicar). |
| `crm-v2/src/components/agency/admin/admin-client.tsx` | Client | El editor (form sticky + grid 2 col). **Se reusa** como componente del tab "Bot Config". Ver §7 (conflicto con su header sticky propio). |
| `crm-v2/src/app/a/[slug]/admin/actions.ts` | Server | `saveBotConfig(agencyId, config)`. **Se reusa tal cual.** Ya valida master gate internamente. |
| `crm-v2/src/app/auth/actions.ts` | Server | `signOut()`. **Se modifica** para borrar la cookie de impersonacion antes del `signOut`. |

### Tablas / RLS relevantes (ya aplicadas, no se tocan)

| Objeto | Detalle | Uso en ADM-2 |
|---|---|---|
| `agencies` | Tiene `is_active` (boolean), `industry`, `plan`, `created_at`. | `getAgencyDetail` lee, `suspend/reactivate` actualiza `is_active`. RLS `agencies_update` ya permite a master. |
| `agency_memberships` | Tiene `role` (enum `agency_role`: `owner`/`admin`/`agent`/`viewer`), `is_active`, `accepted_at`, `invited_at`, FK a `users(id)`. | `getAgencyDetail` join para tab Usuarios. RLS member-or-master ya cubre el SELECT del master cross-tenant. |
| `users` | `email`, `full_name`, `avatar_url`. | Join para nombre/email/avatar en tab Usuarios y header de owner en tab Info. |
| `auth.users` | `last_sign_in_at`. | `getAgencyDetail` necesita ultimo login del owner y de cada miembro. **Acceso solo via admin client (service_role).** No exponer columnas extra. |
| `leads`, `conversations` | `agency_id`, `last_message_at`, `archived_at`, `handler`. | Counters del tab Info. |
| `master_audit_log` | `master_account_id`, `agency_id`, `action`, `details`. | Se llena en ADM-2 para `impersonate_start`, `impersonate_stop`, `suspend`, `reactivate`. Ver Decision Tecnica 5. |

### Helpers / patrones a reusar

| Helper | Donde | Uso ADM-2 |
|---|---|---|
| `requireMaster()` | `src/lib/auth/require-master.ts` | Gate de cada server action nueva y del Page del detalle. |
| `createClient()` | `src/lib/supabase/server.ts` | Cliente user-bound (RLS). Para lecturas. |
| `createAdminClient()` | `src/lib/supabase/admin.ts` | Service_role. Para leer `auth.users.last_sign_in_at`, escribir `master_audit_log`, y mutar `agencies.is_active` (consistente con patron ADM-1). |
| `cookies()` de `next/headers` | next 16 | API async — `await cookies()`. Para set/get/delete de `master_impersonating`. |
| `toast.success/error` de `sonner` | ya montado en master layout | Feedback de cada accion. |

### Migraciones

**Ninguna nueva.** ADM-2 no toca schema. Si se quiere registrar en `master_audit_log` (Decision Tecnica 5), las inserciones usan tabla existente.

---

## 2. Cambios en `proxy.ts` para impersonacion

### Cookie usada

| Atributo | Valor |
|---|---|
| `name` | `master_impersonating` |
| `value` | slug literal de la agency impersonada (ej. `"clinica-pietro"`). Case-sensitive. |
| `httpOnly` | `true` |
| `sameSite` | `'lax'` |
| `secure` | `process.env.NODE_ENV === 'production'` |
| `path` | `'/'` |
| `maxAge` | `60 * 60 * 8` (8 horas — vive con la sesion tipica del master) |

**Donde se setea:** server action `impersonateAgency(slug)` (§3.4).
**Donde se borra:** `stopImpersonating()`, `signOut()`, y branch defensivo del proxy (§siguiente).

### Pseudo-codigo del nuevo proxy

```ts
// crm-v2/proxy.ts
export async function proxy(request: NextRequest) {
  // (1) refresh sesion + redirect login (sin cambios respecto a hoy).
  const response = await updateSession(request);
  if (response.headers.get('location')) return response;

  const { pathname } = request.nextUrl;

  // (2) Branch nuevo: impersonacion para /a/<slug>/*
  //     Corre ANTES del gate de /master para no interferir.
  if (pathname.startsWith('/a/')) {
    const impCookie = request.cookies.get('master_impersonating');
    if (impCookie?.value) {
      // Cliente Supabase reusando el patron de getAll/setAll de updateSession.
      const supabase = createServerClient(/* ... */);
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        // Sin sesion: updateSession ya redirigio. Defensa.
        return response;
      }

      // Verificar que el user es realmente master.
      const { data: master } = await supabase
        .from('master_accounts')
        .select('user_id, is_active')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!master || !master.is_active) {
        // User NO master con cookie -> ataque/bug. Borrar cookie defensivamente.
        response.cookies.delete('master_impersonating');
        return response; // sigue su camino normal
      }

      // User master con cookie. Validar que el slug de la URL coincide con el
      // de la cookie (segmento despues de /a/).
      const urlSlug = pathname.split('/')[2]; // /a/<slug>/...
      if (urlSlug === impCookie.value) {
        // Match: dejamos pasar SIN extra check. El layout despues lo confirma.
        return response;
      }
      // Slug no coincide: dejamos pasar tal cual; el layout debe rechazar
      // por RLS (master sigue viendo todo via is_master(), asi que NO va a
      // rechazar — ver §9 para como el layout maneja el mismatch).
    }
  }

  // (3) gate /master/* (sin cambios respecto a hoy).
  if (pathname.startsWith('/master')) { /* ... codigo actual ... */ }

  return response;
}
```

**Aclaracion importante:** el proxy hoy NO tiene gate de `/a/<slug>/*` propio — el rechazo de no-miembros lo hace RLS en el layout (`agency` viene `null` -> `notFound()`). Por tanto el cambio en proxy es SOLO el branch defensivo de "borrar cookie si la tiene un no-master". El comportamiento positivo de "permitir master en `/a/<slug>` impersonado" YA funciona hoy: el master tiene RLS via `is_master()` y veria la agency sin importar la cookie. La cookie sirve para que el LAYOUT (§9) muestre el banner + para auditoria. **No es un gate de acceso — es un marcador de modo de UI.**

---

## 3. Server actions nuevas

### Decision Tecnica 1: donde viven

Recomendacion: **agregar todas al `crm-v2/src/app/master/_actions/agencies.ts` existente.** Estimacion: ~150 LOC adicionales. Quedaria archivo de ~450 LOC, sigue debajo de la barrera de 300 LOC blanda — pero se permite porque el archivo es 100% server actions cohesionadas. Si llega a 500+ LOC en ADM-3, ahi si splittear.

**Alternativa rechazada:** crear `agencies-detail.ts` separado. Mas fragmentacion sin beneficio claro porque los 5 actions comparten `requireMaster()` + admin client.

### 3.1 `getAgencyDetail(slug)`

```ts
export async function getAgencyDetail(slug: string): Promise<AgencyDetail | null>
```

**Gate:** `await requireMaster()` (lanza `notFound()` si no aplica).

**Lecturas:**
1. User-bound client (`createClient()`):
   - `SELECT id, slug, name, industry, plan, created_at, is_active, owner_user_id FROM agencies WHERE slug = ? LIMIT 1` (RLS deja pasar al master).
   - Si null -> return `null` (caller llama `notFound()`).
2. Admin client (`createAdminClient()`), porque incluye `auth.users.last_sign_in_at`:
   - Owner: `SELECT u.email, u.full_name, au.last_sign_in_at FROM users u JOIN auth.users au ON au.id = u.id WHERE u.id = ?`. Si no hay owner_user_id, devolver nulls.
   - Members: query a `agency_memberships` filtrando `agency_id` y `is_active=true`, joineando `users` + `auth.users(last_sign_in_at)`. Ordenar por `role asc, full_name asc`.
3. Counters (user-bound client, igual patron que `listAgenciesForMaster`):
   - `leadsCount`: count head=true en `leads` por `agency_id`.
   - `conversationsTotal`: count head=true en `conversations` por `agency_id`.
   - `conversationsActiveToday`: count head=true en `conversations` por `agency_id` + `last_message_at >= startOfDayCR`. **Reusar funcion de calculo de "inicio del dia CR"** ya implementada en `getMasterDashboardCounters` — extraerla a helper privado `startOfDayCostaRicaIso()` arriba del archivo.

**Output:** `AgencyDetail` (§4).

**Edge cases:**
- Agency con `owner_user_id = NULL` (no deberia pasar en flujo normal, pero el schema lo permite): `ownerEmail/ownerName/ownerLastSignInAt` = `null`.
- Member sin `accepted_at`: igual se incluye (es un invite pendiente), `lastSignInAt` puede venir null.

### 3.2 `suspendAgency(slug)`

```ts
export async function suspendAgency(slug: string): Promise<{ ok: true } | { ok: false; error: string }>
```

**Gate:** `requireMaster()`.

**Logica:**
1. Validar que la agency existe (admin client `SELECT id FROM agencies WHERE slug = ?`).
2. `UPDATE agencies SET is_active = false, updated_at = now() WHERE slug = ?` con admin client (consistente con ADM-1).
3. Insert en `master_audit_log` (ver Decision Tecnica 5): `action = 'agency_suspend'`, `details = { slug }`.
4. `revalidatePath('/master/clientes')` + `revalidatePath('/master/clientes/' + slug)`.

**Edge cases:**
- Ya estaba inactiva: igual hacemos UPDATE (idempotente, no error).
- Slug inexistente: `return { ok: false, error: 'agency_not_found' }`.

### 3.3 `reactivateAgency(slug)`

Espejo exacto de §3.2 con `is_active = true` y `action = 'agency_reactivate'`. No copio el detalle.

### 3.4 `impersonateAgency(slug)`

```ts
export async function impersonateAgency(slug: string): Promise<never>
```

**Gate:** `requireMaster()` -> `ctx`.

**Logica:**
1. Validar que la agency existe + esta activa (admin client SELECT id, is_active).
   - Si no existe: `return { ok: false, error: 'agency_not_found' }` (cambiar firma a Promise<Result>). Ver Decision Tecnica 2.
   - Si `is_active = false`: aceptar igual el impersonate (el master puede querer entrar para ver/diagnosticar antes de reactivar). NO bloquear.
2. `(await cookies()).set('master_impersonating', slug, { httpOnly, sameSite: 'lax', secure: isProd, path: '/', maxAge: 28800 })`.
3. Insert en `master_audit_log`: `action = 'impersonate_start'`, `details = { slug }`.
4. `redirect('/a/' + slug + '/inbox')`.

**Edge cases:**
- Master ya tiene cookie de OTRA agency -> sobreescribimos sin warning. Si quisieramos warning, lo haria el UI antes de invocar.

### 3.5 `stopImpersonating()`

```ts
export async function stopImpersonating(): Promise<never>
```

**Gate:** `requireMaster()`. (Si la llama un no-master, `notFound()`.)

**Logica:**
1. Leer cookie `master_impersonating`. Si no existe -> `redirect('/master/clientes')` (defensa).
2. Capturar el slug ANTES de borrar.
3. `(await cookies()).delete('master_impersonating')`.
4. Insert en `master_audit_log`: `action = 'impersonate_stop'`, `details = { slug }`.
5. `redirect('/master/clientes/' + slug)`.

### Decision Tecnica 2: signature de `impersonateAgency`

Dos opciones:
- **A:** `Promise<never>` — siempre redirige. Errores via throw o redirect a una pagina de error. Simple para el UI (form action puro).
- **B:** `Promise<{ ok: true } | { ok: false; error }>`. UI necesita useTransition + decidir que hacer. Mas codigo.

**Recomiendo A.** Si la agency no existe, llamar `notFound()` desde la action (Next 16 lo soporta en server actions). Si falla algo grave, throw — el error boundary del master shell lo captura. El UI invoca como `<form action={impersonateAgency.bind(null, slug)}>` y listo.

---

## 4. Tipos nuevos en `agencies.types.ts`

```ts
// === AgencyDetail ============================================================

export type AgencyMember = {
  userId: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  role: 'owner' | 'admin' | 'agent' | 'viewer';
  acceptedAt: string | null;   // null = invite pendiente
  lastSignInAt: string | null; // de auth.users
};

export type AgencyDetail = {
  // identidad
  id: string;
  slug: string;
  name: string;
  industry: string | null;
  plan: string | null;
  createdAt: string;
  isActive: boolean;

  // owner
  ownerUserId: string | null;
  ownerEmail: string | null;
  ownerName: string | null;
  ownerLastSignInAt: string | null;

  // counters
  leadsCount: number;
  conversationsTotal: number;
  conversationsActiveToday: number;

  // miembros (incluye al owner — el owner tambien tiene fila en agency_memberships)
  members: AgencyMember[];
};

// === Resultados de mutaciones ================================================

export type SimpleActionResult =
  | { ok: true }
  | { ok: false; error: 'agency_not_found' | 'unauthorized' | 'unknown'; message?: string };
```

`suspendAgency` y `reactivateAgency` devuelven `SimpleActionResult`. `impersonateAgency` / `stopImpersonating` no devuelven nada (redirigen).

---

## 5. Pagina `/master/clientes/[slug]` rediseñada

### Component tree

```
master/clientes/[slug]/page.tsx                 (server)
├─ requireMaster()
├─ getAgencyDetail(slug) -> detail | null -> notFound()
└─ <AgencyDetailHeader detail={detail} />       (client — botones interactivos)
└─ <AgencyDetailTabs detail={detail} />         (client — tabs con URL search param)
   ├─ <InfoTab detail={detail} />               (client puro — solo render)
   ├─ <BotConfigTab agencyId={detail.id}        (server boundary necesaria —
                       agencyName={detail.name} /> ver §7)
   └─ <UsersTab members={detail.members} />     (client puro — solo render)
```

### Estructura de archivos nuevos

```
src/app/master/clientes/[slug]/
├─ page.tsx                          (reescrita)
├─ _components/
│  ├─ agency-detail-header.tsx       (client)
│  ├─ agency-detail-tabs.tsx         (client — manejo de tab activa)
│  ├─ info-tab.tsx                   (client)
│  ├─ bot-config-tab.tsx             (server — ver §7)
│  ├─ users-tab.tsx                  (client)
│  └─ suspend-confirm-modal.tsx      (client)
```

### Decision Tecnica 3: tab activa via URL search param

URL pattern: `?tab=info` | `?tab=bot` | `?tab=usuarios`. Default `info`. Beneficios: deeplink directo a un tab, browser back-button funciona, refresh preserva el tab. Implementacion en client component:

```ts
'use client';
const sp = useSearchParams();
const router = useRouter();
const active = (sp.get('tab') ?? 'info') as 'info' | 'bot' | 'usuarios';
const setTab = (t) => router.replace(`?tab=${t}`, { scroll: false });
```

### Detalle por tab

**Tab Info:**
- 2 cards: "Datos del cliente" (slug, industria, plan, fecha creacion formateada en es-CR) + "Owner" (avatar/iniciales + nombre + email + ultimo login con `formatDistanceToNow` de `date-fns` si esta disponible, sino formato corto custom).
- 1 fila de 3 stat cards: leads totales / conversaciones totales / conversaciones activas hoy.
- Sin acciones, solo render.

**Tab Bot Config:**
- Renderiza `<AdminClient agencyId={detail.id} agencyName={detail.name} initialConfig={...} moduleNames={...} />`.
- Como `AdminClient` necesita `initialConfig` y `moduleNames`, ESTE TAB es un **server component async** que hace las queries (igual que hace hoy `/a/[slug]/admin/page.tsx`) y le pasa los props al AdminClient. Ver §7 para el problema del header sticky duplicado.

**Tab Usuarios:**
- Lista en cards o tabla compacta.
- Por miembro: avatar (`avatarUrl` o iniciales del `fullName`), `fullName` (fallback al email), `email` (mono pequeño), badge de rol (color por rol: owner=accent, admin=ink, agent=muted, viewer=line), `lastSignInAt` formateado o "Sin acceso aun".
- Banner informativo al final: "Para invitar miembros, el owner del cliente puede hacerlo desde su panel de Configuracion -> Equipo (proximamente)".
- **Sin acciones** (CRUD viene en ADM-3 del lado cliente).

---

## 6. Header con botones

### Layout

```
[← Volver a clientes]

[NOMBRE H1]  [Badge Activo|Suspendido]                  [Btn Impersonar]  [Btn Suspender|Reactivar]
/a/<slug>  ·  industria  ·  plan
```

### Badge de estado

- Activo: `bg-pale-green` + `text-pale-green-ink` (mantiene paleta soft del template).
- Suspendido: `bg-pale-red` + `text-pale-red-ink` (consistente con el actual "Inactiva" del placeholder).

### Botones

| Boton | Estilo | Action |
|---|---|---|
| Ingresar como este cliente | primario terracota — `bg-accent text-surface` (clarifica el modo destructivo) + icono `UserSwitch` o `SignIn` de phosphor | `<form action={impersonateAgency.bind(null, slug)}>` — submit directo, no modal. |
| Suspender | secundario rojo soft — `bg-pale-red text-pale-red-ink hover:bg-pale-red/80` + icono `Pause` | Abre `<SuspendConfirmModal />` |
| Reactivar | secundario verde soft — `bg-pale-green text-pale-green-ink hover:bg-pale-green/80` + icono `Play` | Abre confirm-modal mas chico (texto distinto) o submit directo. Ver Decision Tecnica 4. |

### Decision Tecnica 4: modal de confirmacion

**Solo en Suspender.** Reactivar va directo sin modal (es accion reversible inmediatamente).

Modal copy:
> **Suspender [Nombre cliente]?**
> El bot dejara de responder a leads nuevos y los usuarios del cliente no podran acceder a su panel hasta que reactives la cuenta.
> Esta accion no elimina datos.
>
> [Cancelar]  [Suspender]

Patron: reusar mismo overlay/card pattern de `create-client-modal.tsx` (mismo backdrop, mismo border-line, mismas anim de entrada).

### Toasts

- Impersonar: NO toast en el origen (el redirect a `/a/[slug]/inbox` ya cambia de contexto). El banner amarillo del destino es feedback suficiente.
- Suspender: `toast.success('Cliente suspendido')` tras success. `toast.error(...)` si falla.
- Reactivar: `toast.success('Cliente reactivado')`.

---

## 7. Tab "Bot Config" — como absorber el editor existente

### Conflicto detectado: header sticky duplicado

El `AdminClient` existente (`src/components/agency/admin/admin-client.tsx`) renderiza su propio header sticky con:
- `<h1>Panel Admin</h1>` + badge "Solo master" + descripcion "Asistente de {agencyName}".
- Boton "Guardar cambios" con feedback de save state.

Si lo embebemos tal cual dentro del tab, el detalle del master tendria:
1. Header propio del detalle (nombre cliente + badge + botones impersonar/suspender).
2. Topbar de tabs.
3. Header sticky del AdminClient ("Panel Admin · Solo master") — **duplicado conceptualmente** con #1.

**Decision Tecnica 5:** mantener el header del `AdminClient` tal cual. Razones:
- El header del AdminClient es funcional, no decorativo: contiene el boton "Guardar cambios" + estado de save (saved/error/saving). Romperlo implica refactorear el AdminClient — fuera de scope ADM-2.
- El header del detalle del master es contextual del CLIENTE (nombre/badge/acciones). El header del AdminClient es contextual del EDITOR (estado del form). Tienen propositos distintos.
- Visualmente la duplicacion se resuelve porque cada uno ocupa un nivel distinto: el del detalle es h1 grande, el del AdminClient queda como sub-toolbar sticky dentro del tab.

**Implementacion del `BotConfigTab`:**

```tsx
// src/app/master/clientes/[slug]/_components/bot-config-tab.tsx
// server component
import { createClient } from '@/lib/supabase/server';
import { AdminClient } from '@/components/agency/admin/admin-client';
import { parseBotConfig } from '@/lib/admin/bot-config';

export async function BotConfigTab({ agencyId, agencyName }: {...}) {
  const supabase = await createClient();
  // las queries replicadas del page.tsx actual del editor
  const { data: agency } = await supabase.from('agencies')
    .select('bot_config').eq('id', agencyId).maybeSingle();
  const { data: mods } = await supabase.from('agency_modules')
    .select('module_definitions(name)').eq('agency_id', agencyId).eq('enabled', true);
  const moduleNames = (mods ?? []).flatMap(/* ... */);

  return (
    <AdminClient
      agencyId={agencyId}
      agencyName={agencyName}
      initialConfig={parseBotConfig(agency?.bot_config)}
      moduleNames={moduleNames}
    />
  );
}
```

**Ruta `/a/[slug]/admin` queda zombi accesible.** No la rompemos, no la eliminamos. ADM-3 o futuro la elimina cuando el flow del master este consolidado en tabs.

---

## 8. Banner de impersonacion en `/a/[slug]/*`

### Archivo nuevo

```
src/components/agency/impersonation-banner.tsx   (server component)
```

### Comportamiento

```tsx
// pseudo
export async function ImpersonationBanner() {
  const c = await cookies();
  const slug = c.get('master_impersonating')?.value;
  if (!slug) return null;

  // No reconsultamos master_accounts aca — confiamos en proxy + layout.
  // Solo necesitamos el nombre amistoso del cliente.
  const supabase = await createClient();
  const { data: agency } = await supabase
    .from('agencies').select('name, slug').eq('slug', slug).maybeSingle();
  if (!agency) return null;

  return (
    <div className="sticky top-0 z-30 w-full border-b border-amber-300 bg-amber-50 px-4 py-2 text-amber-900">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 text-sm">
        <span>
          <strong>Modo impersonacion:</strong> estas viendo el CRM como master en{' '}
          <strong>{agency.name}</strong>.
        </span>
        <form action={stopImpersonating}>
          <button className="rounded-md border border-amber-400 bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900 hover:bg-amber-200">
            Salir de impersonacion
          </button>
        </form>
      </div>
    </div>
  );
}
```

### Donde se monta

En `src/app/a/[slug]/layout.tsx`, **antes** de `<AgencyShell>` pero dentro del root div. El banner es sticky-top con z-index encima del shell para que se mantenga visible al scrollear el inbox.

### Estilo

- Fondo ambar suave (`bg-amber-50` + `border-amber-300` + `text-amber-900`). **Tailwind colors directos** porque el tema design system no tiene "warning" definido y queremos diferenciacion clara vs el terracota (`accent`) del badge MASTER. Si el founder prefiere extender el design system con un token semantic `warning`, lo hacemos en ADM-3 sin bloquear ADM-2.
- Sticky top con `z-30` (banner) vs `z-10` del header sticky del AdminClient (que esta dentro del shell) — el banner siempre arriba.

---

## 9. Cambios necesarios en `/a/[slug]/layout.tsx`

### Estado actual

Hoy el layout hace:
1. `getUser()` -> redirect login si null.
2. SELECT master_accounts para flag `isMaster` (para pasar al shell).
3. SELECT agency por slug. Si null -> `notFound()`. **Aca esta el gate real:** RLS de `agencies` solo deja ver al member o al master. No-miembros no-master ven null y caen en 404.

### Cambios para ADM-2

**Mínimos.** Solo dos cosas:

1. **Validacion de mismatch slug-cookie.** Si el user es master Y tiene cookie `master_impersonating` con valor DISTINTO al `slug` actual de la URL: tres opciones —
   - A) Borrar cookie automaticamente (acepta el cambio implicito).
   - B) Redirigir a `/a/<cookieSlug>/inbox` (forzar consistencia).
   - C) Mostrar banner pero NO bloquear (master sigue navegando libre).

   **Recomendacion: C.** El master ES un usuario con acceso a todo. Si navega manualmente de impersonar A a la URL de B, le mostramos el banner de A para que SEPA que su contexto de impersonacion sigue siendo A (y puede "Salir de impersonacion" para volver a /master/clientes/A). No es un error — es info. La accion explicita de "cambiar de impersonacion" es ir al detalle del otro cliente y clickear "Ingresar como este cliente".

   **Implicacion:** el banner siempre muestra el nombre del cliente **de la cookie**, no del slug de la URL. Si no coinciden, queda visualmente raro a proposito (ej. estoy en `/a/clinica-pietro/inbox` con banner "impersonando inmobiliaria-X") — es feedback honesto.

2. **Montar `<ImpersonationBanner />`** arriba del shell. Ver §8.

```tsx
// pseudo
return (
  <>
    <ImpersonationBanner />
    <AgencyShell agency={agency} enabledModules={enabledModules} isMaster={Boolean(master)}>
      {children}
    </AgencyShell>
  </>
);
```

Nada mas. El gate real sigue siendo RLS.

### Sign out

Modificar `signOut()` en `src/app/auth/actions.ts`:

```ts
export async function signOut() {
  const supabase = await createClient();
  const c = await cookies();
  c.delete('master_impersonating');  // limpieza antes de cerrar sesion
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login');
}
```

---

## 10. Riesgos / casos edge

| # | Caso | Comportamiento esperado |
|---|---|---|
| 1 | Master impersona A, navega manual a `/a/B/inbox` | Layout de B carga normal (master ve B por RLS). Banner sigue mostrando "Modo impersonacion: A". Master debe clickear "Salir" para volver a normal, o impersonar B desde `/master/clientes/B`. **Comportamiento aceptado, no es un bug.** |
| 2 | Master cierra sesion durante impersonacion | `signOut()` borra cookie antes del auth signOut. Cookie no persiste para futura sesion en mismo navegador. |
| 3 | User normal (no master) tiene cookie `master_impersonating` (ataque/bug/cookie heredada) | Proxy detecta no-master -> `response.cookies.delete('master_impersonating')`. Acceso normal continua. |
| 4 | Cliente suspendido (`is_active=false`): que pasa con el bot? | **Fuera de scope ADM-2.** El bot lee `agencies.bot_config` desde n8n; n8n no consulta `is_active` hoy. ADM-2 solo afecta UI/auth, no el runtime del bot. Documentar en `decisions.md` que ADM-4+ debe cablear `is_active` en n8n (filtro de leads entrantes). |
| 5 | Cliente suspendido: que pasa con login del owner? | **Sin cambios en ADM-2.** El owner sigue pudiendo loguearse y entrar a `/a/<slug>/...`. Diferimos el efecto practico de la suspension a una fase futura. ADM-2 documenta que `is_active=false` solo es metadata por ahora. |
| 6 | Slug duplicado entre cookie y URL con casing distinto | Comparacion es case-sensitive (`===`). `clinica-pietro` !== `Clinica-Pietro`. Slugs en DB siempre lowercase (zod schema en ADM-1 lo enforza). No deberia haber mismatch real. |
| 7 | `impersonateAgency` llamada con slug inexistente | `requireMaster()` pasa, pero el SELECT inicial devuelve null -> action llama `notFound()`. Pagina origen recibe el 404 (rompe la UX). **Mitigacion:** el boton "Impersonar" solo se renderiza si `detail` existe — caso no ocurre en flujo normal. Si pasa por path manipulation, 404 es respuesta correcta. |
| 8 | Concurrencia: master suspende un cliente mientras owner del cliente esta navegando | Owner sigue con sesion activa porque no le invalidamos token. Su proxima accion no bloquea porque ADM-2 no filtra por `is_active`. Aceptamos esto. |
| 9 | Cookie expira (8h) mientras master esta dentro de `/a/[slug]/*` | Layout sigue funcionando (master pasa por RLS), banner desaparece silenciosamente. Master pierde el "Salir de impersonacion" como atajo — debe ir manual a `/master`. Aceptable. |
| 10 | Master clickea "Impersonar" dos veces rapido | Action no es idempotente para audit log (genera 2 filas), pero la cookie queda igual y el redirect es el mismo. Sin efectos negativos visibles. |
| 11 | Tab Bot Config: el AdminClient existente requiere `agencyId` real; si la query en `BotConfigTab` falla | Mostrar fallback `<div>Error cargando bot config</div>` dentro del tab. No romper toda la pagina. |
| 12 | Tab Usuarios: agency con 0 miembros (estado inconsistente) | Mostrar empty state "Este cliente no tiene miembros activos" + el banner de "Para invitar...". |

### Decision Tecnica 6 (cubre §10 #4 y #5): scope de la suspension en ADM-2

`is_active` en ADM-2 es **solo metadata visual y audit**. NO bloquea login del owner, NO bloquea el bot, NO bloquea el inbox. La unica diferencia visible es:
- Badge "Suspendido" en `/master/clientes` y `/master/clientes/[slug]`.
- Log en `master_audit_log`.

Bloquear comportamiento real es trabajo de ADM-4 (n8n filter + login check). Documentar en `memory/decisions.md` como D6.

---

## 11. Esfuerzo estimado

| Capa | Tarea | Horas |
|---|---|---|
| Backend | Extender `agencies.types.ts` con `AgencyDetail`, `AgencyMember`, `SimpleActionResult` | 0.5 |
| Backend | `getAgencyDetail()` action + extraer helper `startOfDayCostaRicaIso()` | 1.5 |
| Backend | `suspendAgency()` + `reactivateAgency()` actions | 0.5 |
| Backend | `impersonateAgency()` + `stopImpersonating()` actions + audit log inserts | 1.0 |
| Backend | Modificar `signOut()` para borrar cookie | 0.25 |
| Backend | Branch nuevo en `proxy.ts` (impersonacion defensiva) | 1.0 |
| Frontend | `page.tsx` reescrita (server: requireMaster + getAgencyDetail + notFound) | 0.5 |
| Frontend | `<AgencyDetailHeader />` (badge + 3 botones, sin modal) | 1.0 |
| Frontend | `<SuspendConfirmModal />` (reusando patron create-client-modal) | 0.75 |
| Frontend | `<AgencyDetailTabs />` con search param sync | 0.75 |
| Frontend | `<InfoTab />` (3 cards + stat row) | 1.0 |
| Frontend | `<BotConfigTab />` server boundary + reuse AdminClient | 0.5 |
| Frontend | `<UsersTab />` (lista de miembros + banner info) | 1.0 |
| Frontend | `<ImpersonationBanner />` server component + montaje en layout | 0.75 |
| Testing | Smoke: crear cliente, ver detalle, impersonar, salir, suspender, reactivar | 1.0 |
| Buffer | Bugs imprevistos / pulido visual | 1.0 |
| **TOTAL** | | **12.0h** |

Dentro del rango 8-16h objetivo. Realista para 1.5 dias.

---

## 12. Decisiones tecnicas menores a confirmar con vos (NO con el founder)

| # | Decision | Recomendacion del arquitecto |
|---|---|---|
| DT1 | Donde viven las nuevas server actions | **Agregar al `agencies.ts` existente** (no split). |
| DT2 | Signature de `impersonateAgency` | **`Promise<never>` con redirect/notFound interno** (simple para form action). |
| DT3 | Tab activa: URL search param vs estado local | **URL search param `?tab=info|bot|usuarios`** (deeplinkable + browser back funciona). |
| DT4 | Modal en Reactivar | **No modal en reactivar**, solo en suspender. Reactivar es action reversible y de bajo riesgo. |
| DT5 | Llenar `master_audit_log` en ADM-2 | **Si, basico** (`impersonate_start`, `impersonate_stop`, `agency_suspend`, `agency_reactivate`). Es trivia agregar el insert y deja trail desde el dia uno. Cero costo, alto valor. |
| DT6 | Scope de `is_active=false` | **Solo metadata visual + audit en ADM-2.** No cablear bot ni login en esta fase. Diferir a ADM-4. |
| DT7 | Estilo del banner: token `warning` nuevo vs Tailwind colors directos | **Tailwind colors directos (`amber-50/300/900`)** por ahora. Token semantic `warning` si despues lo necesitamos en mas lugares (ADM-3+). |
| DT8 | Layout `/a/[slug]/*` y mismatch slug-cookie | **No bloquear, mostrar banner con el slug de la cookie** (master conserva navegacion libre, banner es honesto). |
| DT9 | Path del banner | `src/components/agency/impersonation-banner.tsx` (queda junto a `agency-shell.tsx` que es donde vive el resto del shell). |
| DT10 | Path de `<SuspendConfirmModal />` | `src/app/master/clientes/[slug]/_components/suspend-confirm-modal.tsx` (modal-local del detalle, no reusable cross-feature). |
| DT11 | Color del badge MASTER vs banner impersonacion | **Mantener separados.** Badge MASTER = terracota (`bg-accent`). Banner impersonacion = ambar (`amber-50`). Dos contextos visuales distintos: "estas en panel master" vs "estas en CRM de cliente como master". |
| DT12 | Eliminar la ruta `/a/[slug]/admin` zombi | **NO en ADM-2.** Queda accesible (cero costo). Eliminar cuando el flow del master via tabs este consolidado y validado por el founder. |

---

## 13. Lo que NO entra (recordatorio, congelado)

- Tab Metricas con charts -> ADM-4.
- Tab Avanzado (pipeline_stages, tags, extractor_fields) -> ADM-4 o 5.
- Tab Logs / auditoria visual -> futuro (los inserts a `master_audit_log` los hacemos en ADM-2 sin UI lectora).
- CRUD completo de miembros desde master -> ADM-3.
- Email transaccional customizado -> futuro.
- Eliminar agency (soft delete / hard delete) -> futuro.
- Cablear `is_active` en n8n (bot deja de responder a clientes suspendidos) -> ADM-4.
- Cablear `is_active` en login (owner suspendido no puede entrar) -> ADM-4.

---

## 14. Conflictos detectados durante la auditoria

| Conflicto | Detalle | Resolucion |
|---|---|---|
| **C1: `AdminClient` tiene header sticky propio** | "Panel Admin · Solo master" + boton guardar. Si se embebe en el tab, hay dos headers visuales. | Aceptar. Distintos niveles jerarquicos (h1 del detalle vs sub-toolbar del editor). Funcional. Ver §7. |
| **C2: `/a/[slug]/admin/page.tsx` queda zombi** | Sigue accesible directamente. | Aceptar. No la eliminamos en ADM-2 (cero riesgo de break). Apuntada en DT12 para futura limpieza. |
| **C3: Proxy NO gatea `/a/[slug]/*`** | El gate real es RLS en el layout. La cookie de impersonacion es marcador de UI, no de auth. | Aclarado en §2. El branch del proxy es solo defensivo (borrar cookie si no es master). |
| **C4: `agencies` no tiene columna `last_used_at` ni similar** | Para ordenar miembros por "actividad" necesitariamos otra cosa. | No es critico. Ordenamos miembros por `role asc, full_name asc` (owner primero, luego alfabetico). |
| **C5: `auth.users` no es accesible desde RLS** | Necesitamos `last_sign_in_at` para owner + miembros. | Usar `createAdminClient()` (service_role) para esa lectura, ya patron establecido en ADM-1. |

---

## Anexo: Checklist final pre-merge

- [ ] Migracion: **ninguna** (verificar que el implementador no agrega ninguna sin justificarla).
- [ ] Build pasa local (`pnpm build` o equivalente).
- [ ] Lint sin warnings.
- [ ] Verificacion manual del flow completo:
  1. Login como Hans (master).
  2. Ir a `/master/clientes`, ver lista.
  3. Click en una agency -> ver detalle nuevo con 3 tabs.
  4. Tab Info: ver counters + owner + datos basicos.
  5. Tab Bot Config: ver editor existente funcionando + guardar cambio + verificar persistencia.
  6. Tab Usuarios: ver lista de miembros con rol y last sign in.
  7. Click "Ingresar como este cliente" -> redirect a `/a/<slug>/inbox` + banner ambar visible.
  8. Navegar dentro del CRM cliente -> banner sigue sticky.
  9. Click "Salir de impersonacion" -> vuelta a `/master/clientes/<slug>`.
  10. Click "Suspender" -> modal -> confirmar -> badge "Suspendido" + toast.
  11. Reload -> badge persiste.
  12. Click "Reactivar" -> badge vuelve a Activo + toast.
  13. Logout -> verificar que la cookie `master_impersonating` se borra (devtools).
  14. Inspeccionar `master_audit_log` en Supabase: deben haber filas de `impersonate_start`, `impersonate_stop`, `agency_suspend`, `agency_reactivate`.
- [ ] PR a `main` via feature branch + Vercel preview (cumple `feedback_github_workflow.md`).
- [ ] Update de `memory/decisions.md` con D6 (scope de `is_active` en ADM-2).
- [ ] Update de `memory/plan-sistema-admin.md` marcando ADM-2 como completada.
