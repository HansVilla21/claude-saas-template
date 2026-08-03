---
title: Arquitectura Multi-Tenant SaaS — Guía de Implementación
purpose: Guía autocontenida para construir un SaaS donde un Super Admin ve todos los negocios, cada negocio tiene sus propios usuarios y roles, y cada cliente solo ve lo suyo.
audience: agente de IA (Claude Code) o desarrollador que implementa desde cero
stack: Postgres con Row Level Security (Supabase encaja perfecto) + una app server-side (Next.js, Remix, etc.) + un proveedor de Auth
---

# Arquitectura Multi-Tenant SaaS — Guía de Implementación

> **Cómo usar esta guía:** es una especificación completa y autocontenida. No requiere ningún archivo, repo ni contexto externo. Léela entera antes de escribir código. El orden de construcción está en la §9. Las reglas de la §2 (invariantes) y la §11 (antipatrones) son restricciones duras: nunca las rompas. Los bloques SQL/TS son plantillas listas para copiar; cambiá los nombres al dominio de tu proyecto, no el patrón.
>
> Los nombres de tablas de esta guía son genéricos (`organizations`, `platform_admins`, etc.). Renombralos como quieras (`companies`, `workspaces`, `tenants`…); lo que importa es el rol conceptual de cada uno.

---

## 1. Qué se está construyendo

Un SaaS **multi-tenant** (multi-inquilino): una sola base de datos y una sola aplicación sirven a muchos negocios a la vez, con **aislamiento estricto** entre ellos. Encima de todos los negocios existe un rol **Super Admin** con acceso a todo.

El mecanismo de aislamiento es **una columna, `org_id`, presente en cada fila de datos**. La regla que gobierna toda la seguridad es una sola frase:

> Un usuario puede acceder a una fila **si y solo si** es miembro activo del negocio dueño de esa fila (`org_id`), **o** es un administrador de plataforma (Super Admin).

Todo el resto de esta guía es cómo implementar esa frase en tres capas.

---

## 2. Invariantes de seguridad (no negociables)

Se cumplen siempre. Romper cualquiera es un bug de seguridad.

1. **Habilitar RLS y crear sus policies van en la MISMA migración.** RLS habilitado sin policies bloquea a los usuarios normales en silencio (el backend con llave secreta no lo nota, y el frontend se queda vacío sin dar error).
2. **Toda función helper de RLS es `SECURITY DEFINER`.** Sin eso hay recursión infinita: la policy llama al helper, el helper consulta una tabla con RLS que vuelve a llamar al helper.
3. **Toda policy de INSERT/UPDATE define `WITH CHECK`, no solo `USING`.** Sin `WITH CHECK`, un usuario puede mover una fila a otro negocio cambiándole el `org_id` (fuga de datos al escribir).
4. **El rol de Super Admin vive en una tabla separada, con escritura restringida.** Nunca como un simple flag en una tabla que el cliente puede editar (podría auto-promoverse).
5. **La llave secreta del backend (la que ignora RLS) nunca llega al navegador.** Solo en variables de entorno del servidor.
6. **La seguridad se aplica en la base (RLS) y en el servidor (guards). La interfaz es solo cosmética.** Ocultar un botón no protege nada.
7. **Negar acceso a algo ajeno responde 404, no 403.** Un 403 confirma que el recurso existe; un 404 no filtra qué negocios o rutas existen.
8. **Toda migración se guarda como archivo versionado**, aunque la hayas aplicado a mano. Si no, la base y el código se desincronizan y el sistema deja de ser reconstruible.

---

## 3. Vocabulario

| Término | Tabla (genérica) | Qué es |
|---|---|---|
| **Negocio / Tenant** | `organizations` | La unidad de aislamiento. Todo dato pertenece a exactamente uno. Se identifica por `id` (UUID) y `slug` (para la URL). |
| **Usuario** | `users` | Persona con login. Puede pertenecer a varios negocios. |
| **Membresía** | `organization_members` | Une un usuario a un negocio **con un rol**. Un usuario puede tener rol distinto en cada negocio. |
| **Rol de negocio** | enum `org_role` | `owner` \| `admin` \| `member` \| `viewer`. Permisos DENTRO de un negocio. |
| **Super Admin** | `platform_admins` | El dueño de la plataforma (vos). Ve y opera todos los negocios. Tabla protegida. |
| **Rol de plataforma** | enum `platform_role` | `super_admin` \| `admin` \| `support`. |
| **Rol de conexión a la base** | — | `authenticated` (respeta RLS) o `service_role` / llave secreta (ignora RLS). No confundir con los roles de negocio. |

---

## 4. Las tres capas de defensa

El aislamiento se implementa **tres veces, de forma independiente**. Si una capa falla, las otras dos siguen protegiendo. El error más común es confiar solo en el filtro del frontend.

| Capa | Dónde vive | Qué hace | ¿Es seguridad real? |
|---|---|---|---|
| **1 — Base de datos (RLS)** | Postgres | Filtra las filas por `org_id` en cada consulta, sin importar de dónde venga. Es la verdad absoluta. | **Sí (autoritativa)** |
| **2 — Aplicación (guards)** | Servidor | Enruta cada rol a su mundo, resuelve el negocio actual, corta accesos ajenos con 404. | **Sí** |
| **3 — Interfaz (UI)** | Navegador | Oculta botones que el rol no puede usar. | **No (cosmética)** |

---

## 5. Capa 1a — El modelo de datos

### 5.1 Enums de rol

```sql
-- Rol DENTRO de un negocio (el equipo del cliente).
create type org_role as enum ('owner', 'admin', 'member', 'viewer');

-- Rol del Super Admin (jerárquico). Solo super_admin crea/elimina otros admins de plataforma.
create type platform_role as enum ('super_admin', 'admin', 'support');
```

### 5.2 `users` — perfil, ligado al Auth

No se reinventa el login: lo maneja el proveedor de Auth (Supabase Auth, Auth0, Clerk…) en su propia tabla. Se crea una tabla espejo para guardar el perfil y poder hacer joins desde las policies.

```sql
create table public.users (
    id          uuid primary key,          -- mismo id que el usuario del Auth (relación 1:1)
    email       text not null,
    full_name   text,
    created_at  timestamptz not null default now()
);
```
Un trigger crea esta fila automáticamente cuando alguien se registra (ver §9, paso 5).

### 5.3 `organizations` — el negocio (el tenant)

```sql
create table public.organizations (
    id            uuid primary key default gen_random_uuid(),
    owner_id      uuid references public.users(id),   -- el cliente principal
    slug          text not null unique,               -- identificador para la URL: /o/mi-negocio
    name          text not null,
    settings      jsonb not null default '{}',        -- configuración libre por negocio
    is_active     boolean not null default true,      -- para suspender sin borrar
    created_at    timestamptz not null default now()
);
```
- `id` es el `org_id` que se va a repetir en TODAS las tablas de datos.
- `slug` da una URL estable y bonita sin exponer el UUID.
- `is_active = false` suspende un cliente sin borrarlo.
- Lo que varía por negocio y no amerita una columna propia va en `settings` (jsonb): escala sin migraciones.

### 5.4 `organization_members` — usuario ↔ negocio + rol

Esta tabla es la que hace posible "cada negocio tiene distintos usuarios y roles".

```sql
create table public.organization_members (
    id          uuid primary key default gen_random_uuid(),
    org_id      uuid not null references public.organizations(id) on delete cascade,
    user_id     uuid not null references public.users(id)         on delete cascade,
    role        org_role not null default 'member',
    is_active   boolean not null default true,
    created_at  timestamptz not null default now(),
    unique (org_id, user_id)   -- una persona tiene un solo rol por negocio
);
```
- Es una tabla muchos-a-muchos: un usuario puede estar en varios negocios; un negocio tiene varios usuarios.
- El *owner* del negocio es, simplemente, quien tiene una membresía con `role = 'owner'`.

Los roles de negocio:

| Rol | Qué puede hacer |
|---|---|
| **owner** | Control total. Es el dueño de la cuenta. |
| **admin** | Configura, invita gente, ve todo. No puede borrar el negocio. |
| **member** | Trabaja con los datos que le corresponden. No ve lo de otros miembros (si así lo definís en las policies). |
| **viewer** | Solo lectura. Ve, pero no modifica. |

### 5.5 `platform_admins` — el Super Admin (tabla protegida)

El detalle de seguridad más importante del diseño: el rol de Super Admin **no** es un valor dentro de la tabla de membresías. Es una tabla aparte.

```sql
create table public.platform_admins (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null unique references public.users(id) on delete cascade,
    role        platform_role not null default 'admin',
    is_active   boolean not null default true,
    created_by  uuid references public.platform_admins(id),   -- solo un admin crea otro
    created_at  timestamptz not null default now()
);
```
Por qué en tabla aparte (y no como un flag `is_admin` en `users`):
1. Si el rol viviera en una tabla que el cliente puede escribir, un cliente podría intentar auto-promoverse. En tabla aparte, la RLS solo deja escribir al `super_admin`.
2. Jerarquía: solo `super_admin` crea o elimina otros administradores de plataforma.
3. `support` = un admin que puede mirar todo pero no tocar nada.

### 5.6 `platform_audit_log` — todo lo que hace el Super Admin queda registrado

Como el Super Admin puede entrar a cualquier negocio, cada acción sensible se audita.

```sql
create table public.platform_audit_log (
    id          uuid primary key default gen_random_uuid(),
    admin_id    uuid not null references public.platform_admins(id),
    org_id      uuid references public.organizations(id) on delete set null,
    action      text not null,   -- 'impersonate', 'suspend_org', 'edit_config', ...
    details     jsonb not null default '{}',
    created_at  timestamptz not null default now()
);
```

### 5.7 Las tablas de tu dominio

Cada tabla de datos de tu aplicación (clientes, pedidos, mensajes, lo que sea) DEBE incluir esta columna:

```sql
org_id uuid not null references public.organizations(id) on delete cascade
```
Esa columna es lo que la RLS de la §6 usa para aislar todo.

---

## 6. Capa 1b — Row Level Security (el aislamiento real)

RLS (Row Level Security) es una función de Postgres: pegás reglas (*policies*) a cada tabla y la base filtra las filas automáticamente en cada consulta, según quién pregunta. No importa si la consulta viene del frontend, de un script o de un atacante con la llave pública: la base solo devuelve lo permitido.

### 6.1 Funciones helper (responden "¿quién es?")

Antes de escribir policies, se definen funciones reutilizables. **Todas deben ser `SECURITY DEFINER`** (invariante #2).

```sql
-- ¿El usuario actual es un admin de plataforma activo?
create or replace function public.is_platform_admin()
returns boolean language sql security definer stable set search_path = public as $$
    select exists(
        select 1 from public.platform_admins
        where user_id = auth.uid() and is_active
    );
$$;

-- ¿Es super_admin (el que puede crear otros admins)?
create or replace function public.is_super_admin()
returns boolean language sql security definer stable set search_path = public as $$
    select exists(
        select 1 from public.platform_admins
        where user_id = auth.uid() and role = 'super_admin' and is_active
    );
$$;

-- ¿Es miembro activo de ESTE negocio?
create or replace function public.is_member_of(oid uuid)
returns boolean language sql security definer stable set search_path = public as $$
    select exists(
        select 1 from public.organization_members
        where user_id = auth.uid() and org_id = oid and is_active
    );
$$;

-- ¿Es miembro de este negocio con uno de estos roles? (para permisos finos)
create or replace function public.has_org_role(oid uuid, roles org_role[])
returns boolean language sql security definer stable set search_path = public as $$
    select exists(
        select 1 from public.organization_members
        where user_id = auth.uid() and org_id = oid and is_active and role = any(roles)
    );
$$;

grant execute on function public.is_platform_admin()          to authenticated;
grant execute on function public.is_super_admin()             to authenticated;
grant execute on function public.is_member_of(uuid)           to authenticated;
grant execute on function public.has_org_role(uuid, org_role[]) to authenticated;
```
- `auth.uid()` es el ID del usuario logueado (lo da el Auth desde el token de la sesión). Es el "quién soy" de cada consulta.
- **`SECURITY DEFINER` es obligatorio:** hace que la función corra con permisos elevados y no se auto-bloquee por RLS al consultar la tabla de membresías (si no, hay recursión infinita).

### 6.2 El patrón de policy que se repite en cada tabla

Para toda tabla de datos que tenga `org_id`:

```sql
alter table public.mi_tabla enable row level security;

create policy mi_tabla_access on public.mi_tabla for all
    using      (is_member_of(org_id) or is_platform_admin())
    with check (is_member_of(org_id) or is_platform_admin());
```
En español: *"puedo tocar esta fila si soy miembro del negocio dueño de la fila, o si soy admin de plataforma."* Ese bloque, repetido en cada tabla, ES el aislamiento multi-tenant.
- `USING` decide qué filas ves y cuáles podés modificar/borrar.
- `WITH CHECK` valida el estado final al escribir (impide mover una fila a otro negocio). Obligatorio en INSERT/UPDATE (invariante #3).

### 6.3 Permisos finos por rol (dentro del mismo negocio)

`is_member_of()` da acceso a nivel negocio. Si además querés que un `member` no vea los datos de otro `member`, se usa `has_org_role()`. Ejemplo de una policy de SELECT más granular:

```sql
create policy pedidos_select on public.pedidos for select using (
    is_platform_admin()
    or has_org_role(org_id, array['owner','admin','viewer']::org_role[])   -- estos ven todo el negocio
    or (                                                                    -- el member ve solo lo suyo:
        has_org_role(org_id, array['member']::org_role[])
        and assigned_to = auth.uid()
    )
);
```
Regla general: **SELECT** abierto a owner/admin/viewer, `member` restringido a lo suyo; **INSERT/UPDATE** a owner/admin (+ member a sus filas); **DELETE** solo a owner/admin/super admin. `is_platform_admin()` pasa por el `or` en cada policy.

Matriz de permisos de referencia:

| Acción | owner | admin | member | viewer | super admin |
|---|---|---|---|---|---|
| Ver todo el negocio | ✅ | ✅ | solo lo suyo | ✅ | ✅ |
| Editar datos | ✅ | ✅ | sus filas | ❌ | ✅ |
| Editar configuración | ✅ | ✅ | ❌ | ❌ | ✅ |
| Gestionar el equipo | ✅ | ✅ | ❌ | ❌ | ✅ |
| Borrar el negocio | ❌ | ❌ | ❌ | ❌ | ✅ |

### 6.4 Cómo el Super Admin ve todos los negocios

No hay ningún mecanismo aparte: **cada policy termina en `or is_platform_admin()`**. Como el Super Admin pasa ese `or`, la base le devuelve las filas de todos los negocios. Su acceso transversal es una consecuencia natural del patrón.

### 6.5 La tabla protegida (el cliente no se auto-promueve)

```sql
create policy platform_admins_select on public.platform_admins for select
    using (is_platform_admin());
create policy platform_admins_write on public.platform_admins for all
    using (is_super_admin()) with check (is_super_admin());
```
Aunque un cliente descubriera el nombre de la tabla y armara un `INSERT` a mano con su llave pública, la RLS lo rechaza. Escribir aquí requiere ser `super_admin`.

### 6.6 Las dos llaves de conexión a la base (concepto clave)

Tu app se conecta a la base con dos identidades distintas. Entender esto es entender por qué el backend funciona mientras el cliente queda encerrado:

| Identidad | Llave | Quién la usa | ¿RLS la afecta? |
|---|---|---|---|
| **`authenticated`** | llave pública + sesión | El navegador del cliente | **SÍ.** Solo ve su negocio. |
| **Backend / `service_role`** | llave secreta | El servidor: acciones de servidor, jobs, integraciones | **NO.** Ignora RLS: acceso total. |

- El backend usa la llave secreta porque necesita cruzar negocios y escribir en nombre del sistema.
- **La llave secreta NUNCA se expone al navegador.** Solo en variables de entorno del servidor.
- Consecuencia: si prendés RLS sin policies, el cliente queda bloqueado pero el backend (que ignora RLS) no lo nota. Por eso podés "romper" el frontend en silencio.

---

## 7. Capa 2 — La aplicación: rutas y guards

### 7.1 Dos mundos, dos árboles de rutas

```
/admin/...       → panel del Super Admin (lista de negocios, métricas, alta de clientes)
/o/[slug]/...    → el producto de UN negocio concreto; [slug] = el negocio actual
```

### 7.2 Middleware — primera barrera (¿hay sesión?)

Corre antes de cada request. Si no hay usuario logueado y la ruta no es pública, redirige al login.

```ts
const isPublic = ['/login', '/auth'].some(p => pathname.startsWith(p));
if (!user && !isPublic) return redirect('/login');
```

### 7.3 Guards — segunda barrera (¿este rol puede abrir esto?)

Cada página del servidor llama a un *guard* que resuelve identidad + rol y corta si no corresponde. **Devuelven 404, no 403** (invariante #7).

```ts
// Protege /admin/* — solo Super Admins.
async function requirePlatformAdmin() {
    const user = await getSessionUser();
    if (!user) redirect('/login');
    const admin = await db.platform_admins.findActive(user.id);
    if (!admin) notFound();                 // 404: no revelamos que /admin existe
    return { user, role: admin.role };
}

// Protege /o/[slug]/* — resuelve el negocio y el rol del usuario en él.
async function requireOrgAccess(slug) {
    const user = await getSessionUser();
    if (!user) redirect('/login');
    const membership = await db.members.findActive(user.id, slug);
    if (!membership) notFound();            // no es miembro → 404
    if (!membership.org.is_active) notFound(); // negocio suspendido → 404
    return { orgId: membership.org_id, role: membership.role };
}
```
Uso en una página: `const { role } = await requireOrgAccess(slug); if (!canEditConfig(role)) notFound();`

### 7.4 Los permisos, en una sola fuente compartida

Las reglas de "quién puede qué" se definen como funciones puras (sin base, sin framework) para usarlas **igual en el servidor y en la UI**.

```ts
type OrgRole = 'owner' | 'admin' | 'member' | 'viewer';

export const canEditConfig   = (r: OrgRole) => r === 'owner' || r === 'admin';
export const canManageTeam   = (r: OrgRole) => r === 'owner' || r === 'admin';
export const canViewData     = (r: OrgRole) => true;   // todos leen
export const canEditData     = (r: OrgRole) => r !== 'viewer';
```
La UI usa `canEditConfig(role)` para esconder el botón; el guard usa `canEditConfig(role)` para rechazar la acción aunque alguien la fuerce. Una sola definición, cero divergencia.

### 7.5 Impersonation — el Super Admin entra a un negocio

El Super Admin no solo ve la lista; puede operar dentro de un negocio como si fuera el dueño. Se hace con una cookie que guarda el negocio impersonado. El guard, al detectar la cookie, **revalida en cada request que sos admin real** y te da acceso con rol `owner`. Toda entrada se registra en el log de auditoría.

### 7.6 Dos clientes de base de datos (separación de llaves)

- Cliente normal (llave pública): respeta RLS. Es el default en todo el frontend.
- Cliente admin (llave secreta): ignora RLS. **Solo en el servidor.** Se usa para operaciones que cruzan negocios y para dar de alta clientes nuevos. Nunca se importa en código que corre en el navegador.

---

## 8. Capa 3 — La interfaz (UI)

Con el `role` que devuelve el guard, los componentes muestran u ocultan botones usando los helpers de la §7.4. Recordá: **esto es solo comodidad visual.** Un `viewer` no ve el botón "Editar"; si de algún modo forzara la acción, el guard (capa 2) y la RLS (capa 1) la bloquean igual. La UI nunca es la línea de defensa.

---

## 9. Orden de construcción (paso a paso)

1. **Elegí el stack.** Una base con RLS (Supabase es ideal: trae Auth + RLS + llave secreta ya integrados; cualquier Postgres sirve). Una app server-side.
2. **Enums** (`org_role`, `platform_role`) y extensiones necesarias.
3. **Identidad:** `users` (1:1 con el Auth), `organizations` (`slug` único, `is_active`), `organization_members` (con `unique(org_id, user_id)`), `platform_admins` (tabla aparte), `platform_audit_log`.
4. **Tablas de tu dominio,** cada una con `org_id not null references organizations(id) on delete cascade`.
5. **Trigger de registro:** al crearse un usuario en el Auth, insertar su fila en `users`.
6. **RLS (el corazón):**
   a. Helpers `is_platform_admin / is_super_admin / is_member_of / has_org_role` (todos `SECURITY DEFINER`).
   b. `enable row level security` en TODAS las tablas.
   c. Policy uniforme `using (is_member_of(org_id) or is_platform_admin()) with check (...)` por tabla de datos.
   d. `platform_admins`: leer = `is_platform_admin()`, escribir = `is_super_admin()`.
   e. `grant execute` de los helpers al rol `authenticated`.
   f. Recordá el invariante #1: habilitar RLS + crear policies en la misma migración.
7. **Permisos finos por rol** (opcional, cuando lo necesites): reemplazá las policies uniformes por versiones con `has_org_role`. Empezá simple (todos los miembros ven todo su negocio), granulá después.
8. **Los dos clientes de base:** el normal (respeta RLS, para el browser) y el admin (llave secreta, ignora RLS, solo servidor).
9. **Middleware + guards:** sin sesión → login; `requirePlatformAdmin()` (404); `requireOrgAccess(slug)` (404 + rol); impersonation por cookie revalidada.
10. **Permisos como funciones puras**, compartidas entre servidor y UI.
11. **Alta de un cliente nuevo = insertar datos, no clonar la app.** Un script que crea el usuario owner en el Auth, la organización, sus membresías, y siembra lo específico del negocio. Dar de alta un tenant es cuestión de inserts.

---

## 10. Cómo verificar que quedó bien

Correr contra la base después de implementar. No declarar "hecho" sin esto.

```sql
-- (a) Ninguna tabla de datos quedó sin RLS (expuesta):
select c.relname, c.relrowsecurity as rls_on,
       (select count(*) from pg_policy p where p.polrelid = c.oid) as n_policies
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by rls_on, n_policies;
-- Esperado: toda tabla de datos con rls_on = true y n_policies > 0.

-- (b) Los helpers son SECURITY DEFINER (prosecdef = true):
select proname, prosecdef from pg_proc
where proname in ('is_platform_admin','is_super_admin','is_member_of','has_org_role');

-- (c) No hay filas huérfanas sin negocio:
select count(*) from public.mi_tabla where org_id is null;   -- esperado: 0
```

Pruebas manuales mínimas (haciendo login como cada tipo de usuario):
- Un usuario del negocio A no ve datos del negocio B.
- Un usuario sin sesión no ve nada.
- Pedir la URL de un negocio ajeno, o `/admin` sin ser admin → responde 404 (no 403).
- El Super Admin ve todos los negocios y puede entrar a cualquiera.

---

## 11. Antipatrones (NUNCA hagas esto)

1. **NUNCA** habilitar RLS sin crear las policies en la misma migración → bloqueo silencioso del frontend.
2. **NUNCA** un helper de RLS sin `SECURITY DEFINER` → recursión infinita.
3. **NUNCA** una policy de INSERT/UPDATE sin `WITH CHECK` → un usuario puede mover una fila a otro negocio.
4. **NUNCA** poner una regla de seguridad solo en el frontend → cualquiera arma la petición a mano.
5. **NUNCA** responder 403 para recursos ajenos → confirma que existen. Usá 404.
6. **NUNCA** el rol de Super Admin como flag en una tabla que el cliente edita → auto-promoción.
7. **NUNCA** exponer la llave secreta del backend al navegador, al bundle o al repo.
8. **NUNCA** dejar una migración aplicada solo a mano en el panel → la base y el código se desincronizan.

---

## 12. Resumen para tener a mano

- **Una columna `org_id` en cada fila de datos** = el eje de todo el aislamiento.
- **RLS en la base** = la verdad; solo el backend (con llave secreta) la ignora.
- **`using (is_member_of(org_id) or is_platform_admin())`** = el patrón que resuelve casi todo el multi-tenant.
- **Super Admin en tabla aparte, escritura solo para `super_admin`** = el cliente nunca se auto-promueve.
- **Los guards devuelven 404, no 403.**
- **Permisos como funciones puras**, compartidas entre servidor y UI.
- **Tres capas** (base → servidor → UI); la UI nunca es seguridad.
- **Dar de alta un cliente = insertar datos, no clonar la aplicación.**
