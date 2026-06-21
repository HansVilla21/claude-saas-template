# Skill: Login con Google + Supabase en SPA — móvil (redirect) vs desktop (GIS)

## Cuándo usar esta skill

- Tenés una **SPA cliente** (Next.js `ssr:false`, Vite, CRA…) con **Supabase Auth** y querés login con Google.
- El login con Google **funciona en computadora pero falla en el celular**: el usuario "inicia sesión" y lo **rebota al landing/login** sin entrar (la sesión no se establece).
- Estás decidiendo entre el botón nativo de Google (GIS / One-Tap, `signInWithIdToken`) y el flujo OAuth redirect (`signInWithOAuth`).

## Por qué existe esta skill (la causa raíz)

Hay **dos formas** de hacer login con Google en Supabase, con trade-offs opuestos:

| Flujo | Cómo se ve en Google | Confiabilidad móvil |
|---|---|---|
| **GIS / One-Tap** (`signInWithIdToken`) | Muestra **tu dominio** (`mimenudo.com`) → más confianza | ❌ **Frágil en móvil** |
| **OAuth redirect** (`signInWithOAuth`) | Muestra `<project>.supabase.co` (salvo custom domain) | ✅ **Robusto en todos lados** |

**El GIS/One-Tap es frágil en navegadores móviles** porque depende de popups, **FedCM** y **cookies de terceros** — que iOS Safari, Chrome móvil e in-app browsers bloquean por privacidad (ITP). Resultado: el token nunca vuelve al callback JS, la sesión no se crea, y la app (que enruta por sesión) muestra el landing otra vez. En desktop sí funciona porque ahí esas APIs están disponibles.

**El OAuth redirect es robusto** porque es un **redirect first-party de página completa**: guarda el `code_verifier` (PKCE) en el `localStorage` del **mismo origen**, va a Google, vuelve a tu dominio con `?code=`, y `detectSessionInUrl` lo canjea. Sin popups, sin cookies de terceros.

## Proceso

### 1. Configurar el cliente Supabase para PKCE + detectar la sesión en la URL

```ts
// src/lib/supabase.ts
export const supabase = createClient(URL, ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // canjea el ?code= al volver del OAuth
    flowType: "pkce",         // ?code= en el QUERY (no en el hash) → no choca con SPA hash-routing
  },
});
```

> Clave para SPAs con **hash routing** (`#inicio`): PKCE pone el `code` en el **query** (`?code=`), no en el `#hash`, así no se pisan.

### 2. Detectar dispositivo y elegir el flujo

```tsx
const [mobile, setMobile] = React.useState<boolean | null>(null); // null = aún no sabemos
React.useEffect(() => {
  const m = /Android|iPhone|iPad|iPod|Mobile|Opera Mini|IEMobile/i.test(navigator.userAgent)
    || window.matchMedia("(max-width: 768px)").matches;
  setMobile(m);
}, []);
```

Iniciar en `null` evita mismatch de hidratación (SSR no conoce `navigator`); el `useEffect` decide ya en cliente.

### 3a. Móvil → OAuth redirect (robusto)

```tsx
async function googleRedirect() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin,          // vuelve a tu app
      queryParams: { prompt: "select_account" },   // deja elegir cuenta
    },
  });
  if (error) setErr(error.message);
}
// Botón propio "Continuar con Google" (con la G multicolor) que llama a googleRedirect().
```

### 3b. Desktop → GIS nativo (`signInWithIdToken`, muestra tu dominio)

```tsx
// Solo inicializar GIS cuando mobile === false (saltarlo en móvil).
// Da a Google el nonce HASHEADO (sha256) y a Supabase el nonce CRUDO; Supabase re-hashea y compara.
g.accounts.id.initialize({ client_id, nonce: hashed, callback: async (resp) => {
  await supabase.auth.signInWithIdToken({ provider: "google", token: resp.credential, nonce: raw });
}});
g.accounts.id.renderButton(ref.current, { theme: "outline", shape: "pill", ... });
```

Render: `mobile === null ? placeholder : mobile ? <BotónRedirect/> : <div ref={gisRef}/>`.

### 4. La app reacciona a la sesión (igual para ambos flujos)

```tsx
useEffect(() => {
  supabase.auth.getSession().then(({ data }) => setSession(data.session));
  const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
  return () => sub.subscription.unsubscribe();
}, []);
// session === undefined → splash · !session → landing/login · session → app
```

Al volver del redirect, `detectSessionInUrl` canjea el `?code=` → dispara `onAuthStateChange (SIGNED_IN)` → la app entra. No hace falta una ruta `/auth/callback` aparte (la SPA cliente lo maneja).

### 5. Config en Supabase y en Google Cloud Console (sin esto, falla)

**Supabase → Auth → URL Configuration:**
- `Site URL`: `https://tudominio.com`
- `Redirect URLs` (allow-list): `https://tudominio.com/**`, `https://www.tudominio.com/**`, `http://localhost:3000/**`
- Google provider **enabled** con **client_id Y client_secret** (el secret es obligatorio para `signInWithOAuth`; para solo `signInWithIdToken` basta el client_id).

**Google Cloud Console → APIs & Services → Credentials → OAuth client:**
- **Authorized redirect URIs**: `https://<project-ref>.supabase.co/auth/v1/callback` ← imprescindible para el redirect móvil. Sin esto: error `redirect_uri_mismatch`.
- **Authorized JavaScript origins**: `https://tudominio.com`, `https://www.tudominio.com` ← para el GIS de desktop.

### 6. Cómo verificar sin un celular físico (Playwright)

1. `browser_resize(390, 844)` → fuerza el branch móvil (matchMedia max-width 768).
2. Navegar al login, click "Continuar con Google".
3. Confirmar que la URL salta a `accounts.google.com/...` con `redirect_uri=https://<ref>.supabase.co/auth/v1/callback`, `response_type=code`, `code_challenge` presente, y que **carga el selector de cuenta** (no `redirect_uri_mismatch`). Eso valida todo el camino hasta Google; el password real lo pone el usuario.

## Output esperado

1. En **desktop**: botón nativo de Google que muestra tu dominio en la pantalla de Google. Funciona.
2. En **móvil**: botón "Continuar con Google" → redirect a Google → vuelve a la app **dentro de la sesión** (ya no rebota al landing).
3. Misma cuenta de Supabase en ambos flujos (mismo email/`sub` de Google → mismo user).

## Gotchas / antipattern

- **NO** usar solo GIS/One-Tap si la app es para usuarios móviles. Se ve lindo (tu dominio) pero **rebota al landing** en el cel.
- **NO** olvidar el **client_secret** en el provider de Supabase: `signInWithIdToken` funciona sin él, así que el bug aparece recién cuando agregás `signInWithOAuth`.
- **NO** olvidar el callback `https://<ref>.supabase.co/auth/v1/callback` en Google Console → `redirect_uri_mismatch`.
- **NO** mezclar métodos de login para el MISMO email sin **account linking**: si un usuario se registró con email/password y luego entra con Google (mismo email), Supabase puede crear **un user separado** (con su propio perfil/onboarding) salvo que actives el linking. Verificá en `auth.users` + `auth.identities` cuántos users hay por email.
- **El `<project>.supabase.co` en la pantalla de Google (flujo redirect)** se quita SOLO con un **custom auth domain** de Supabase (`auth.tudominio.com`, requiere plan Pro + CNAME). Mientras tanto es cosmético: el login es seguro y funciona.
- **NO** poner el `?code=` en el hash: usá `flowType: pkce` para que vaya al query y no choque con el hash-routing de la SPA.

## Ejemplo concreto (Mi Menudo, en producción 2026-06-20)

- Bug: login Google rebotaba al landing en el cel (usaba solo GIS `signInWithIdToken`).
- Fix: [src/components/vera/AuthScreen.tsx](src/components/vera/AuthScreen.tsx) — detecta móvil → `signInWithOAuth` redirect; desktop sigue con GIS.
- Cliente: [src/lib/supabase.ts](src/lib/supabase.ts) ya tenía `pkce` + `detectSessionInUrl`.
- Config verificada por Management API: Site URL + redirect URLs (`mimenudo.com`, `www`, localhost) y Google con client_id + secret, todo OK.
- Verificado con Playwright (viewport 390px): el botón móvil redirige a `accounts.google.com` con el callback de Supabase y `response_type=code` — Google aceptó (cargó selector de cuenta).

## Skills relacionadas

- `supabase-edge-function-secret-auth` — otro patrón de auth en Supabase (endpoints internos).
- `reskin-marca-coherente` — branding consistente (el botón de Google debe respetar la marca).
