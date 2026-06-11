# Templates de email de Supabase Auth

4 templates HTML listos para pegar en **Supabase Dashboard → Authentication → Email Templates**.

Diseño minimalista editorial: fondo cream warm + tipografía sistema + neutrales piedra.
Funciona en Gmail, Apple Mail, Outlook. Dark mode: colores hardcodeados se respetan en la mayoría de clientes.

## Cómo adaptar al proyecto

Buscar y reemplazar los 5 placeholders antes de pegar en Supabase:

| Placeholder | Ejemplo | Dónde aparece |
|---|---|---|
| `{{PRODUCT_NAME}}` | `Hookly` | Header, CTAs, footer |
| `{{PRODUCT_TAGLINE}}` | `análisis viral` | Header italic |
| `{{PRODUCT_SLOGAN}}` | `Recreá lo viral, no lo inventes.` | Footer |
| `{{BRAND_CREDIT}}` | `Hookly es un producto de Momentum AI.` | Footer |
| `{{SUPPORT_EMAIL}}` | `hola@hooklylab.com` | Footer del Change Email |

## Templates disponibles

1. `confirm-signup.html` — Subject: `Confirmá tu cuenta en {{PRODUCT_NAME}}`
2. `magic-link.html` — Subject: `Tu link mágico para entrar a {{PRODUCT_NAME}}`
3. `reset-password.html` — Subject: `Restablecé tu contraseña de {{PRODUCT_NAME}}`
4. `change-email.html` — Subject: `Confirmá tu nuevo email en {{PRODUCT_NAME}}`

## Variables de Supabase disponibles en el HTML

- `{{ .ConfirmationURL }}` — URL de confirmación (PKCE)
- `{{ .Token }}` — OTP de 6 dígitos
- `{{ .Email }}` — email del usuario
- `{{ .SiteURL }}` — URL del sitio (definida en Auth Settings)

## Cómo aplicar en Supabase

1. `https://supabase.com/dashboard/project/<project-id>/auth/templates`
2. Para cada template: pegar HTML en "Message body" + cambiar "Subject heading"
3. "Send test email" para verificar antes de publicar

## Notas

- `{{ .ConfirmationURL }}` genera el link correcto (PKCE) para `/auth/confirm` o `/auth/callback` según tipo.
- No usar variables de Supabase en el Subject — no se renderizan ahí.
- Para usar logo real: `<img src="https://tudominio.com/icon.svg">` hosteado público.
