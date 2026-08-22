# Skill: El cliente "admin" que filtra datos sin login (service_role + cookies)

## Cuándo usar esta skill

- Tenés (o vas a escribir) un helper tipo `createAdminClient()` para **saltarte la RLS** desde el
  servidor.
- Usás `@supabase/ssr` (`createServerClient`) en una app Next.js con App Router.
- Síntoma A: **500 al crear un registro siendo admin** — "new row violates row-level security" —
  pero la misma operación funciona en otro lado.
- Síntoma B, el grave: **un endpoint devuelve datos reales sin sesión.** `curl` a `/api/loquesea`
  sin cookies responde 200 con nombres, cédulas, teléfonos.
- Vas a auditar una app Supabase antes de entregarla.

**Costo de no usarla:** en Grandir CRM (fondo de inversión, datos personales de inversionistas)
`GET /api/investors` **sin autenticación devolvía cédula, teléfono y email reales**. Estuvo así en
producción. No lo reportó nadie: se encontró auditando.

---

## Por qué existe esta skill

**`createServerClient` de `@supabase/ssr` lee las cookies del navegador, y la cookie le gana a la
llave que le pasaste.**

```ts
// ❌ EL FOOTGUN
createServerClient(URL, SERVICE_ROLE_KEY, { cookies: { ... } })
```

Ese cliente se comporta de **dos maneras distintas según haya o no cookie**:

| | qué identidad usa | efecto |
|---|---|---|
| **Con sesión** | el JWT del usuario (`auth.role = 'authenticated'`) | la RLS **sí** aplica, aunque pasaste la service_role key |
| **Sin sesión** | cae a la llave que pasaste (service_role) | **bypass total de RLS** |

Las dos ramas producen un bug, y son bugs opuestos:

1. **Con sesión → falsos negativos.** Un admin cuya fila de perfil falta o está inactiva hace que
   `is_admin()` dé false y la RLS bloquee el INSERT. Se lee como "error raro al crear", y la
   tentación es tocar la policy.
2. **Sin sesión → fuga de datos.** Si además la ruta `/api/*` no exige sesión, cualquiera con
   `curl` obtiene la tabla entera con permisos de servicio. **Y el endpoint responde 200**, así
   que no hay nada en los logs que grite.

Lo que lo vuelve difícil de ver: **funciona perfecto mientras lo probás logueado.** El modo
peligroso es justo el que nunca ejercés durante el desarrollo.

> ⚠️ **Si venís de otra skill que dice "usá `createAdminClient()`"** —como
> `soft-delete-bloqueado-por-rls` o `importacion-con-lote-deshacible`— **ese consejo sigue siendo
> correcto, pero el helper tiene que estar implementado con el SDK plano, sin cookies.** El nombre
> del helper no dice cómo está construido por dentro. Abrilo y verificá antes de confiar.

---

## Proceso

### 1. Dos clientes, uno para cada cosa, y ninguno mezcla

```ts
// lib/supabase/service.ts — bypass REAL de RLS. Sin cookies. Nunca en el navegador.
import { createClient } from "@supabase/supabase-js"
export const createServiceClient = () =>
  createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

// lib/supabase/server.ts — SOLO para leer la sesión del usuario. Llave PÚBLICA.
import { createServerClient } from "@supabase/ssr"
export const createSessionClient = () =>
  createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { cookies: {...} })
```

**La regla, en una línea: `@supabase/ssr` va SIEMPRE con la llave pública; la service_role va
SIEMPRE con el SDK plano.** Si en un archivo ves `createServerClient` y `SERVICE_ROLE` juntos,
es este bug.

En Grandir la decisión fue **eliminar** el helper viejo, no arreglarlo. Un helper que se comporta
distinto según haya cookie es una trampa con nombre amigable; borrarlo evita que alguien lo vuelva
a usar por costumbre.

### 2. La authz vuelve al código, en dos capas

Si el cliente de datos bypasea la RLS, **la RLS ya no es tu control de acceso** — pasa a ser
defensa en profundidad. El control tiene que estar antes:

```ts
// capa 1: el proxy/middleware exige sesión en /api/*, con allowlist EXPLÍCITA de lo público
const PUBLICAS = ["/api/portal/", "/api/applications"]

// capa 2: cada handler interno abre con su guard
export async function GET() {
  const { profile, response } = await requireAdmin()
  if (response) return response          // ← corta acá
  const db = createServiceClient()
  ...
}
```

Las dos capas, no una. El middleware solo se olvida una vez; el guard por handler es el que
sobrevive a un refactor de rutas.

**La allowlist se escribe a mano y se justifica.** Cada ruta pública necesita **su propio**
control: el portal por token firmado, el formulario público por rate-limit y validación. "Es
público" no es un control.

### 3. Cerrar la puerta del panel también

Si las páginas del dashboard leen con service_role, una cuenta sin perfil —o desactivada— vería
todo. El layout del área privada expulsa (`signOut` + redirect) a cualquier sesión sin fila de
perfil o inactiva. Es el mismo agujero del punto 1, por la puerta del navegador.

### 4. Probar el modo que nunca ejercés: sin cookies

Este es el paso que encuentra el bug. Con la app corriendo:

```bash
# sin ninguna cookie, como un extraño
curl -s -o /dev/null -w "%{http_code}\n" https://tu-app/api/investors     # debe ser 401/403
curl -s https://tu-app/api/investors | head -c 200                        # NO debe traer datos
```

Recorré **todas** las rutas de `/api`, no una muestra. Un script de 20 líneas que las liste y las
golpee sin sesión vale más que cualquier revisión de código: el bug es exactamente "alguien se
olvidó de una".

> Y verificá el **contenido**, no solo el status. Un 200 con `[]` puede ser una tabla vacía, no un
> permiso funcionando. (Ver `verificar-funcionamiento-end-to-end`.)

### 5. Dejarlo escrito como regla, no como anécdota

En el `CLAUDE.md` del proyecto, en la lista de errores a evitar:

> NUNCA mezclar la service_role key con cookies de `@supabase/ssr`. Para bypassear RLS,
> `createServiceClient` (SDK plano). Para leer la sesión, el cliente SSR con la llave pública.
> Toda ruta `/api` interna empieza con su guard.

---

## Output esperado

- Un solo camino para bypassear RLS, sin cookies, y un solo camino para leer la sesión.
- El helper ambiguo **eliminado**, no corregido.
- Authz en dos capas: middleware con allowlist explícita + guard al inicio de cada handler.
- Barrido de **todas** las rutas `/api` sin cookies, verificando contenido y no solo el status.
- La regla escrita en el `CLAUDE.md` del proyecto.

---

## Gotchas / antipatrones

- 🔴 **`createServerClient(URL, SERVICE_ROLE_KEY, { cookies })`.** El bug entero, en una línea.
- 🔴 **Arreglar la policy cuando el admin recibe un 500.** El síntoma viene del cliente
  equivocado; tocar la RLS lo esconde y deja la fuga intacta.
- 🔴 **Confiar en la RLS como único control** cuando tu cliente de datos la bypasea.
- ⚠️ **Probar solo logueado.** El modo peligroso es el que no ejercés nunca.
- ⚠️ **Un helper llamado `admin` no dice cómo está construido.** Abrilo.
- ⚠️ **Allowlist por prefijo demasiado ancha.** `/api/p` matchea `/api/pagos`. Anclá los prefijos.
- ⚠️ **Rutas públicas sin control propio.** El token del portal y el rate-limit del formulario
  **son** el control; sin ellos, "público" es "abierto".

---

## Ejemplo concreto (Grandir CRM, 2026-06-30)

Sistema para un fondo de inversión costarricense: nombres, cédulas, teléfonos y montos.

El helper `createAdminClient` estaba hecho con `createServerClient` + service_role key + cookies.
Resultado:

- **Con sesión:** un admin sin fila en `user_profiles` daba `is_admin() = false` → RLS bloqueaba
  el INSERT → *500 al crear inversionista*.
- **Sin sesión:** `/api/*` no exigía auth y sin cookie el cliente caía a service_role →
  **`GET /api/investors` devolvía PII real a cualquiera.**

**Fix:** se eliminó `createAdminClient`; quedaron `createServiceClient` (SDK plano) y el cliente
SSR solo para leer sesión. Se agregó authz en dos capas (proxy con allowlist + `requireAdmin()` /
`requireInternalUser()` por handler) y expulsión de cuentas sin perfil en el layout del dashboard.
Commit `fd9cb53`.

---

## Skills relacionadas

- `detectar-escritura-filtrada-rls` — el otro lado: la RLS que filtra sin avisar.
- `soft-delete-bloqueado-por-rls` · `importacion-con-lote-deshacible` — usan un helper de service
  role; **verificá que el tuyo no tenga cookies adentro**.
- `habilitar-rls-tabla-expuesta` — prender RLS sin dejar la app en deny-all silencioso.
- `verificar-funcionamiento-end-to-end` — por qué un 200 no prueba nada.
