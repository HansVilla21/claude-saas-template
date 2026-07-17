# Skill: Setup de correo transaccional + auth de un SaaS (Resend + Supabase + Vercel)

## Cuándo usar esta skill

- Estás poniendo un SaaS en producción para su primer cliente y necesitás: que la app viva en un dominio propio, que mande correos (invitaciones, reset de contraseña), y que el alta de usuarios sea real (no contraseñas compartidas a mano).
- Tenés un dominio (en Vercel o un registrar) y querés sumar el subdominio de la app + correo saliente sin romper el correo existente (ej. Google Workspace).
- Vas a configurar Supabase Auth con SMTP propio + flujos de invitación/reset.
- Repetís este onboarding por cada cliente/proyecto nuevo.

## Por qué existe esta skill

Este setup tiene **muchas piezas que se rompen en silencio** si las hacés en el orden o el lugar equivocado: links de invitación que apuntan a `localhost`, RLS/SPF que pisa el correo existente, usuarios invitados que entran pero nunca fijan contraseña y no pueden volver, signup público abierto en un producto invite-only. Esta skill es el checklist probado (Momentum AI CRM, Misión 9, 2026-06-15) para hacerlo de una sin sorpresas.

## Proceso

### 1. Subdominio de la app (Vercel)

- La app va en un **subdominio** (ej. `crm.midominio.com`), no en el root (que suele tenerlo el landing).
- Verificá dónde se maneja el DNS con un lookup: `nslookup -type=NS midominio.com`. Si los NS son `ns1/ns2.vercel-dns.com` → **el DNS lo maneja Vercel** (agregar el subdominio al proyecto lo auto-configura, sin tocar el registrar). Si no, los records van en el registrar.
- Vercel → proyecto de la app → Settings → Domains → Add `crm.midominio.com`.
- Verificá: `curl -I https://crm.midominio.com/login` debe responder (ej. 307 → /login).

### 2. Resend: verificar el dominio para enviar (sin pisar el correo existente)

- Chequeá el correo existente: `nslookup -type=MX midominio.com` y `-type=TXT`. Si hay Google Workspace (`MX smtp.google.com` + `SPF include:_spf.google.com`), **NO lo toques**.
- Resend → Add Domain → `midominio.com` (root) → región cercana (ej. `us-east-1`). Resend da records sobre los subdominios **`send.`** y **`resend._domainkey.`** (MX + SPF en `send`, DKIM en `resend._domainkey`) → **no chocan** con el SPF/MX del root. Si tu DNS está en Vercel, podés usar el **auto-config con Vercel** de Resend.
- Enviá desde una dirección con propósito claro: `cuenta@midominio.com` (auth), reservá `notificaciones@`, `hola@`/`soporte@` para después.
- **Verificá de verdad** mandando un correo de prueba con la API (la key send-only sirve): `POST https://api.resend.com/emails` con `from: "Marca <cuenta@midominio.com>"`, `to` tu propio inbox. Un `{"id":"..."}` confirma que el dominio está verificado y que el envío funciona.

### 3. Supabase Auth → SMTP de Resend + URLs

- Supabase → Authentication → Emails → **Custom SMTP**: host `smtp.resend.com`, port `465`, user `resend`, **password = una Resend API key**, sender `cuenta@midominio.com`, sender name = la marca.
- Supabase → Authentication → **URL Configuration**: `Site URL = https://crm.midominio.com` + Redirect URLs `https://crm.midominio.com/**` (+ `localhost` para dev). **Sin esto, los links de invitación/reset apuntan mal.**
- En Vercel (prod): env var **`NEXT_PUBLIC_SITE_URL = https://crm.midominio.com`** + redeploy. El código la usa para el `redirectTo` de invite/reset.

### 4. App — flujos de auth (código)

- **Ruta `/auth/confirm` (token_hash + verifyOtp) — la base resiliente para links de CORREO**: creá `app/auth/confirm/route.ts` que lea `token_hash`, `type`, `next` y haga `supabase.auth.verifyOtp({ type, token_hash })`; en éxito redirige a `next` con guard anti-open-redirect (`next.startsWith('/') && !next.startsWith('//')`). Es **stateless**: no depende del navegador que pidió el link. **Reemplaza al viejo `/auth/callback`** (PKCE `code` + `exchangeCodeForSession`), que exigía el `code_verifier` del MISMO navegador → rompía cross-device, admin-triggered y scanners de correo (bug del reset de Pietro, jun-2026 — ver Gotchas).
- **Reset de contraseña**: link "¿Olvidaste tu contraseña?" → `resetPasswordForEmail(email, ...)`. El **template** (paso 5) arma el link a `/auth/confirm?token_hash=…&type=recovery&next=/auth/reset`. `/auth/reset` muestra el form → `updateUser({ password })`. Mensaje SIEMPRE neutro (anti-enumeración).
- **Invite-only**: remové el signup público (action + UI) **y** desactivá "Allow new users to sign up" en Supabase (defensa doble).
- **Invitación que fija contraseña**: el template de invitación apunta a `/auth/confirm?token_hash=…&type=invite&next=/auth/reset` (no directo al inbox). Si no, el usuario invitado entra una vez pero, como nunca fijó contraseña, no puede volver. (Reusá la misma página de reset; copy neutro tipo "Definí tu contraseña").

### 5. Plantillas de correo branded

- Los templates por defecto de Supabase llegan en inglés + texto plano. Reemplazalos en Supabase → Authentication → Emails → Templates (Reset Password, Invite user) con HTML **email-safe** (layout con tablas + estilos inline), en el idioma del producto, con la marca (colores del producto + wordmark tipográfico — las imágenes en email son poco confiables). **El link va armado con `{{ .TokenHash }}`** apuntando a `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=<recovery|invite>&next=/auth/reset` (NO `{{ .ConfirmationURL }}`, que embebe el `code` PKCE y rompe cross-device — ver paso 4 y Gotchas). Versioná el HTML en el repo (`supabase/email-templates/`).

### 6. Verificación e2e + retiro de contraseñas temporales

- **Reset real**: en la app → olvidé contraseña → llega el correo desde tu dominio → link → fijás contraseña → entrás.
- **Invitación real**: invitá un email de prueba → llega → fija contraseña → entra.
- Si había **contraseñas temporales compartidas**, retiralas: cada usuario existente hace un reset y fija la suya.

## Output esperado

1. App en `crm.midominio.com` (Vercel) servida sobre el subdominio.
2. Dominio verificado en Resend, enviando desde `cuenta@midominio.com`, sin romper el correo existente.
3. Supabase Auth con SMTP de Resend + Site URL/`NEXT_PUBLIC_SITE_URL` correctos.
4. Flujos: reset de contraseña, invite-only, invitación que fija contraseña.
5. Plantillas de correo branded versionadas en el repo.
6. Verificación e2e (reset + invitación reales) + contraseñas temporales retiradas.

## Ejemplo concreto (Momentum AI CRM, Misión 9, 2026-06-15)

- Subdominio: `crm.momentum-lab-ai.com` → proyecto Vercel `momentum-ai-crm` (DNS en Vercel, auto).
- Resend: dominio `momentum-lab-ai.com` verificado (auto-config Vercel), envía desde `cuenta@momentum-lab-ai.com`, convive con el Google Workspace del root (subdominio `send.`).
- Código: [auth/confirm/route.ts](crm-v2/src/app/auth/confirm/route.ts) (`verifyOtp` — la ruta resiliente para links de correo), [auth/actions.ts](crm-v2/src/app/auth/actions.ts) (login + requestPasswordReset + updatePassword), [auth/reset/](crm-v2/src/app/auth/reset/), invite en [team.ts](crm-v2/src/app/a/[slug]/settings/equipo/_actions/team.ts) + [agencies.ts](crm-v2/src/app/master/_actions/agencies.ts).
- Plantillas (link armado con `{{ .TokenHash }}` → `/auth/confirm`): [supabase/email-templates/](crm-v2/supabase/email-templates/).
- Verificado e2e por el founder. Setup inicial: PRs #42 + #43 (tag `v1.0.0`). **Migración a `token_hash` + `verifyOtp`** (fix cross-device del reset de Pietro): PR #52, jun-2026.

## Gotchas / antipattern

- **NO** uses `{{ .ConfirmationURL }}` / PKCE `code` + `exchangeCodeForSession` (`/auth/callback`) para los links de **CORREO** (reset, invitación, magic link). Ese flujo exige el `code_verifier` guardado en el MISMO navegador que pidió el link → falla si el usuario abre el correo en **otro dispositivo**, si lo dispara un **admin** (invitaciones), o si un **scanner de correo** "toca" el link antes (consume el código de un solo uso). Para links de correo usá SIEMPRE **`token_hash` + `verifyOtp`** en `/auth/confirm` (stateless). El `code`/PKCE es para OAuth interactivo en la misma pestaña, no para correo. (Causa raíz del "link inválido" del reset de Pietro, jun-2026.)
- **NO** verifiques el root en Resend pensando que pisa tu Google Workspace: Resend usa el subdominio `send.` para SPF/return-path → coexisten. NUNCA edites/borres el `MX`/`SPF` del root.
- **NO** olvides `NEXT_PUBLIC_SITE_URL` en Vercel prod ni el Site URL en Supabase → los links de invite/reset salen apuntando a `localhost` o a la URL vieja.
- **NO** dejes a los usuarios invitados sin fijar contraseña: el `redirectTo` del invite debe ir a una página de set-password (`/auth/reset`), si no entran una vez y no pueden volver.
- **NO** dejes el signup público abierto en un producto invite-only (cerralo en código **y** en el toggle de Supabase).
- **NO** uses imágenes en los emails como única opción de branding (muchos clientes las bloquean): wordmark tipográfico es más robusto; si hay logo, que sea PNG hosteado con `alt`.
- **NO** confíes en "configuré el SMTP" como verificación: mandá un reset/invitación REAL y confirmá que el correo llega (regla `verificar-funcionamiento-end-to-end`).
- **OJO** con el SPF: un dominio solo puede tener UN registro `v=spf1`. Si algún día tenés que sumar un include al root, MERGEALO en el existente, no agregues un segundo.

## Skills relacionadas

- `verificar-funcionamiento-end-to-end` — la verificación e2e que cierra cada paso.
- `habilitar-rls-tabla-expuesta` — seguridad de la DB del mismo SaaS.
- `supabase-edge-function-secret-auth` — auth por bearer-secret de edge functions (mismo stack).
