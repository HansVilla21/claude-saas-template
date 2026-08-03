# Skill: Auth con Supabase + Google nativo (login que da confianza)

## Cuándo usar esta skill

- Estás montando el login de una app SaaS sobre **Supabase Auth** (Next.js / React).
- Querés **email + contraseña** Y **"Continuar con Google"** que muestre **TU dominio** (no `xxxx.supabase.co`, que da desconfianza).
- El alta de usuarios te falla con `Database error saving new user` y no sabés por qué.
- El OAuth de Google te cuesta (redirect URI, scopes, verificación).

> Esta skill es el "cómo construir" auth. Distinta de las `supabase-audit-*` (auditan seguridad) y de `signup-flow-cro`/`onboarding-cro` (son copy/conversión). Acá está la implementación que en Mi Menudo quedó redonda.

## Por qué existe

Tres dolores recurrentes al hacer login con Supabase:
1. **El OAuth de Google rebota por `proyecto.supabase.co`** → la pantalla de Google dice "Ir a xxxx.supabase.co" y el usuario desconfía.
2. **`Database error saving new user`** → el trigger `handle_new_user` usa una función de `pgcrypto` (`gen_random_bytes`) que NO es visible con `search_path=public` dentro de una función `security definer` → revienta el alta de CUALQUIER usuario (Google y email).
3. **Redirect URI mal puesto** → el OAuth nunca vuelve a la app.

## Proceso

### 1. Cliente de Supabase (browser) — PKCE
```ts
// lib/supabase.ts
import { createClient } from "@supabase/supabase-js";
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" } }
);
```
`flowType: "pkce"` + `detectSessionInUrl: true`: el regreso del OAuth trae `?code=` en el query (no en el hash) → no choca con apps que usan hash routing.

### 2. Google Cloud Console (cuenta gmail.com normal sirve, sin tarjeta)
- **Pantalla de consentimiento** → User type **External**. App name = tu marca. Correo de soporte = el tuyo. **No agregues scopes sensibles** (solo email/perfil/openid) → así Google **NO exige verificación** (que tarda semanas). Publicá la app cuando esté lista.
- **Credenciales → ID de cliente OAuth → Aplicación web:**
  - **Orígenes JS autorizados:** `https://tudominio.com`, `https://www.tudominio.com`, `http://localhost:3000`.
  - **URIs de redirección autorizados (EL que todos equivocan):** `https://<project-ref>.supabase.co/auth/v1/callback`.
- Copiá **Client ID** (público) y **Client Secret** (secreto).

### 3. Supabase Dashboard
- **Authentication → Providers → Google →** Enable + pegar Client ID + Secret.
- **Authentication → URL Configuration:** Site URL = `https://tudominio.com`; Redirect URLs = `https://tudominio.com/**`, `http://localhost:3000/**`.

### 4. Trigger de alta de usuario — SIN pgcrypto (el fix del `Database error`)
```sql
-- profiles 1:1 con auth.users + token de ingesta opcional
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
```
**Si necesitás generar un token random adentro del trigger, usá `gen_random_uuid()` (core, en `pg_catalog`, siempre visible), NUNCA `gen_random_bytes()`** — pgcrypto vive en el schema `extensions` y con `search_path=public` no se ve → `Database error saving new user`. Ej: `replace(gen_random_uuid()::text,'-','')` para 32 hex.

### 5. El botón de Google — DOS caminos

**A) Rápido (rebota por supabase.co — muestra el dominio de Supabase):**
```ts
await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
```

**B) Nativo con GIS — muestra TU dominio (recomendado para confianza):**
Usá Google Identity Services + `signInWithIdToken` con nonce. El login ocurre en tu origen, sin rebote → la pantalla de Google dice tu dominio.
```ts
// nonce: a Google le das el hash; a Supabase el crudo (Supabase rehashea y compara)
async function makeNonce() {
  const raw = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b=>b.toString(16).padStart(2,"0")).join("");
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const hashed = Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
  return { raw, hashed };
}
React.useEffect(() => {
  const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID; if (!CLIENT_ID) return;
  // cargar https://accounts.google.com/gsi/client (script), luego:
  const { raw, hashed } = await makeNonce();
  google.accounts.id.initialize({
    client_id: CLIENT_ID, nonce: hashed,
    callback: async (resp) => {
      await supabase.auth.signInWithIdToken({ provider: "google", token: resp.credential, nonce: raw });
    },
  });
  google.accounts.id.renderButton(ref.current, { theme: "outline", size: "large", text: "continue_with", shape: "pill" });
}, []);
```
- El Client ID es **público** → va en `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.
- El origen (tudominio.com) debe estar en "Orígenes JS autorizados" (paso 2). GIS NO funciona en URLs de preview no autorizadas → probá en el dominio real.
- En Supabase, "skip nonce check" debe estar **off** (default) ya que mandamos nonce.

### 6. Gating de sesión a nivel página
```tsx
const [session, setSession] = useState(undefined); // undefined = cargando
useEffect(() => {
  supabase.auth.getSession().then(({data}) => setSession(data.session));
  const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
  return () => sub.subscription.unsubscribe();
}, []);
if (session === undefined) return <Splash/>;      // evita flash de login
if (!session) return <Landing/> /* o <AuthScreen/> */;
return <App/>;
```

### 7. Correos de auth con tu marca (Resend como SMTP)
Los correos de Supabase (recuperar clave, confirmación) salen de un remitente genérico y caen en spam. Conectá **Resend como SMTP custom** en Supabase Auth, **enviando desde un SUBDOMINIO** (`send.tudominio.com`) para no chocar con el SPF/MX si la raíz ya recibe correo (ej. Cloudflare Email Routing). DKIM/SPF/DMARC del subdominio → verificás en Resend → ponés el SMTP en Supabase.

## Output esperado
1. Login con email/clave + "Continuar con Google" que muestra TU dominio.
2. Alta de usuarios sin `Database error` (trigger con `gen_random_uuid`, no pgcrypto).
3. Sesión bien gateada (splash → landing/login → app), sin flash.
4. (Opcional) correos de auth branded vía Resend desde subdominio.

## Ejemplo concreto (Mi Menudo, mimenudo.com — producción 2026-06-18)
- `signInWithIdToken` + GIS → la pantalla de Google muestra `mimenudo.com`, no el ref de Supabase.
- Bug real resuelto: `Database error saving new user` por `gen_random_bytes` en `handle_new_user` → migración que lo cambió a `gen_random_uuid()`. Tras el fix, el signup con Google funcionó al primer intento.
- Project ref del callback: `https://<ref>.supabase.co/auth/v1/callback`.

## Gotchas / antipattern
- **NO** olvidar que el redirect URI de Google es **el callback de Supabase**, no tu app.
- **NO** usar `gen_random_bytes()` dentro de funciones `security definer` con `search_path=public` → usá `gen_random_uuid()`.
- **NO** pedir scopes sensibles de Google si no los necesitás → dispara verificación CASA (semanas).
- **NO** esperar que GIS funcione en una URL de preview/localhost no listada en "Orígenes JS autorizados".
- **NO** mandar correos desde la raíz del dominio si esa raíz ya recibe correo por otro servicio → usá subdominio de envío.
- **NO** dejar `detectSessionInUrl: false` si vas a usar OAuth (el regreso no agarra la sesión).

## Skills relacionadas
- `prototipo-ui-a-datos-reales` — qué hacer DESPUÉS del login: cargar el perfil y los datos reales.
- `embudo-activacion-saas` — dónde encaja el login en el camino del usuario.
- `supabase-edge-function-secret-auth` — auth de endpoints internos (otro caso).
