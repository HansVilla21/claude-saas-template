---
name: vercel-domain-migration
description: When the user wants to migrate a Next.js project from a Vercel default domain (*.vercel.app) to a custom domain. Use when the user mentions "comprar dominio", "migrar dominio", "agregar dominio propio", "configurar Cloudflare DNS para Vercel", "apex vs www", "dominio en producción", "custom domain Vercel", "DNS TXT verification", "salir de vercel.app", "dominio para Meta Ads", or "dominio para SaaS". Covers domain provider selection, Cloudflare DNS configuration (DNS only vs proxied), Vercel apex/www setup, updating external services (Supabase Auth, Google OAuth, payment gateways, env vars), and code changes (metadataBase, OG image, .gitignore).
metadata:
  version: 1.0.0
---

# Vercel Domain Migration — `*.vercel.app` → custom domain

You are migrating a Next.js project from a Vercel default URL (`my-app.vercel.app`) to a custom domain (`myapp.com`). This skill covers the full process: provider selection, DNS, Vercel setup, external service updates, code changes, and verification.

## Por qué dominio propio (motivación)

`*.vercel.app` está en la **Public Suffix List**. Eso significa:

- ❌ **Meta Ads** no permite verificar el dominio → ads para iOS funcionan mal con AEM, muchas categorías rechazadas
- ❌ **Google Search Console** trata cada subdominio como sitio independiente → SEO sub-óptimo
- ❌ **Cookies cross-subdomain** no funcionan correctamente
- ❌ **Branding** menos profesional en URLs compartidas

Para cualquier SaaS que vaya a correr ads o aspirar a SEO, dominio propio no es opcional.

---

## Paso 1 — Comprar el dominio

### 1.1 Proveedores recomendados (en orden)

1. ⭐ **Cloudflare Registrar** — precio at-cost (sin markup), WHOIS privacy gratis, integración fluida con Cloudflare DNS. **La opción default si vas a usar Cloudflare DNS.**

2. ⭐ **Porkbun** — segunda opción, precios competitivos, sin upsells, UI clara

3. ⚠️ **Namecheap** — funciona pero precios suben en renovación

4. ❌ **GoDaddy** — markup alto, bait-and-switch común. **Evitar si es posible.** Ejemplo real: ofrecía un `.io` por "$0.01" pero el carrito real cobraba $218 con 3 años forzados + protección dummy + Microsoft 365 trial sin avisar.

### 1.2 Decisión de marca con dominio dual

Si tu marca ideal está ocupada (`mybrand.com` ya tomado), considerá:

- **`mybrandapp.com`** o **`mybrandlab.com`** o **`getmybrand.com`** — variaciones tomables
- Mantenés "mybrand" como nombre visible (UI, marketing, ads)
- El dominio queda como entidad/dominio (footer, términos, Business Manager de Meta)

Ejemplo real: marca `Hookly` + dominio `hooklylab.com` → entidad legal "Hookly Lab" en footer, marca "Hookly" en producto.

---

## Paso 2 — DNS en Cloudflare

> Asumimos que vas a usar Cloudflare DNS. Si usás otro DNS provider (Route53, Namecheap, etc.), los conceptos son los mismos, solo cambia la UI.

### 2.1 Records DNS necesarios

```
Type    Name    Content                     Proxy status
─────────────────────────────────────────────────────────
A       @       76.76.21.21                 DNS only ⚪
CNAME   www     cname.vercel-dns.com        DNS only ⚪
```

### 2.2 Por qué `76.76.21.21`

- Es la **IP anycast oficial de Vercel para apex domains** (sin subdominio)
- Los apex domains **no pueden usar CNAME** por reglas DNS — solo records A o ALIAS
- Vercel publicó esta IP fija para que apuntes el apex directo

### 2.3 ⚠️ CRÍTICO: DNS only, NO proxied

Cloudflare por default activa el proxy (nube naranja 🧡). Para records que apuntan a Vercel, **hay que desactivarlo y dejarlo en DNS only (nube gris ⚪)**.

**Por qué NO proxear:**

- Vercel ya hace CDN + SSL + DDoS protection — proxy de Cloudflare es redundante
- Doble proxy genera **"Too many redirects"** (Cloudflare → Vercel → Cloudflare loop)
- Rompe el SSL handshake (ambos servicios manejan certificados)
- Rompe las **IPs reales** que llegan al server (Vercel ve solo IPs de Cloudflare)
  - Esto rompe analytics, geolocation, y tracking server-side (Meta CAPI necesita la IP real)
- Vercel a veces rechaza requests desde IPs de Cloudflare proxy

---

## Paso 3 — Conectar a Vercel

### 3.1 Agregar el dominio

1. Vercel Dashboard → tu proyecto → **Settings → Domains**
2. **Add Existing Domain** → escribir `mydomain.com` (sin www, apex)
3. Vercel detecta el A record de Cloudflare → estado **Valid Configuration**
4. Vercel agrega automáticamente `www.mydomain.com` también

### 3.2 ⚠️ CRÍTICO: configurar apex como primary, www redirect

Vercel a veces deja `www` como primary por default. Esto **rompe OAuth y otras integraciones** porque las configs externas (Google Cloud Console, Supabase, etc.) usualmente apuntan al apex.

**Verificar configuración actual:**

```bash
curl -sI https://mydomain.com | head -5
curl -sI https://www.mydomain.com | head -5
```

**Configuración correcta (apex como primary):**

```
mydomain.com         → 200 OK (sirve directo)
www.mydomain.com     → 307 → mydomain.com (redirige al apex)
```

**Si está al revés (www como primary):**

1. Vercel → Settings → Domains
2. Click en `mydomain.com` (el apex)
3. Cambiar selector de "Redirect to Another Domain" → **"Connect to an environment" → Production** → Save
4. Click en `www.mydomain.com`
5. Cambiar de "Connect to an environment" → **"Redirect to Another Domain"** → escribir `mydomain.com` → Save

> Estándar moderno SaaS: apex como primary (linear.app, notion.so, vercel.com, stripe.com — todos apex). El www es backup compatibility.

---

## Paso 4 — Variables de entorno y servicios externos

Cuando cambia el dominio, hay que actualizar TODOS los servicios externos. Olvidar uno rompe ese flujo silenciosamente.

### 4.1 Vercel — env vars del proyecto

```bash
NEXT_PUBLIC_APP_URL=https://mydomain.com
```

Esto lo lee:
- `metadataBase` en `layout.tsx` (Open Graph + canonical URLs)
- Cualquier server action que arme URLs absolutas (cancelUrl de pagos, return URLs, etc.)

⚠️ **Después de actualizar env vars, redeploy es obligatorio** para que tome efecto.

### 4.2 Supabase Auth — Site URL + Redirect URLs

`Authentication → URL Configuration`:

```
Site URL:        https://mydomain.com

Redirect URLs:
  http://localhost:3000/**
  https://mydomain.com/**
  (mantener URLs legacy de *.vercel.app si querés que previews funcionen)
```

⚠️ **Sintaxis crítica:** Supabase usa `**` (DOS asteriscos), NO `***` (tres). Si ponés tres, no matchea ninguna URL y el OAuth se rompe completamente.

### 4.3 Google Cloud Console — OAuth Client

`APIs & Services → Credentials → tu OAuth Client → Edit`:

**Orígenes autorizados de JavaScript:**
```
http://localhost:3000
https://[supabase-project].supabase.co     ← NO TOCAR si usás Supabase Auth
https://mydomain.com                        ← AGREGAR
```

**URIs de redireccionamiento autorizados:**
```
https://[supabase-project].supabase.co/auth/v1/callback   ← NO TOCAR
```

⚠️ **NUNCA borrar la URL de Supabase**. Es donde Google hace el callback real del OAuth — si la quitás, el login con Google se rompe.

### 4.4 OAuth Consent Screen — branding profesional

Para que el login con Google diga "Iniciar sesión en MyApp" en vez de "Continuar a [supabase-id].supabase.co":

`Google Auth Platform → Información de la marca`:

```
App name:                Mi App
Support email:           soporte@mydomain.com
App logo:                PNG cuadrado 120x120
Application home page:   https://mydomain.com
Privacy policy:          https://mydomain.com/privacy
Terms of service:        https://mydomain.com/terms
Authorized domains:      mydomain.com  +  [supabase-project].supabase.co
Developer contact:       email
```

Después: `Audiencia → Publish app` (cambia de Testing a Production). Para scopes básicos (`email`, `profile`, `openid`) **no requiere verificación** de Google — es instantáneo.

### 4.5 Payment gateways — webhook URLs y return URLs

Si usás Stripe, Onvo, MercadoPago, etc., actualizar:

- **Webhook endpoint URL** → `https://mydomain.com/api/[gateway]/webhook`
- **Return/success URL** post-pago si lo configurás manualmente
- **Cancel URL** si lo configurás manualmente

⚠️ Verificá el path EXACTO del endpoint. Errores típicos: `/api/webhooks/stripe` vs `/api/stripe/webhook` (depende de cómo lo nombraste en tu código).

---

## Paso 5 — Cambios de código

### 5.1 `metadataBase` en `layout.tsx`

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://mydomain.com",
  ),
  title: "Mi App",
  description: "...",
  openGraph: {
    images: ["/og-image.png"],  // Next.js construye URL absoluta usando metadataBase
  },
};
```

Sin `metadataBase`, Next.js no puede generar URLs absolutas para Open Graph y warnings aparecen en build.

### 5.2 Buscar URLs hardcodeadas en el código

Antes de migrar, hacer un grep:

```bash
grep -r "old-domain.com\|my-app.vercel.app" src/ --include="*.tsx" --include="*.ts"
```

Reemplazar todas las ocurrencias con:
- `process.env.NEXT_PUBLIC_APP_URL` (server-side)
- O la URL nueva si es contenido estático (OG images, footers, etc.)

### 5.3 `.gitignore` — agregar `.vercel`

Cuando linkeás el proyecto con `vercel link`, Vercel crea `.vercel/project.json` con `projectId` y `orgId`. Agregalo al `.gitignore`:

```
# Vercel
.vercel
```

### 5.4 Workflow recomendado (branch + PR)

```bash
git checkout -b chore/dominio-mydomain
# Editar archivos
git add .gitignore src/app/layout.tsx [otros archivos con cambios]
git commit -m "chore(deploy): migrar dominio a mydomain.com"
git push -u origin chore/dominio-mydomain
# Crear PR en GitHub
# Mergear cuando todos los servicios externos estén actualizados
```

---

## Paso 6 — Verificación post-migración

### 6.1 Smoke tests automáticos

```bash
# 1. Apex sirve directo (no redirige)
curl -sI https://mydomain.com | head -3
# esperado: HTTP/1.1 200 OK

# 2. www redirige al apex
curl -sI https://www.mydomain.com | head -3
# esperado: HTTP/1.1 307 Temporary Redirect, Location: https://mydomain.com/

# 3. SSL funciona
curl -sI https://mydomain.com 2>&1 | grep -i "ssl\|tls"
# no debe haber errores
```

### 6.2 Tests manuales (los más importantes)

- [ ] **Login con Google** → entrás al dashboard correctamente (sin error de redirect)
- [ ] **Signup con email** → email de confirmación llega Y el link funciona (lleva a dashboard)
- [ ] **Pago de prueba** (si hay billing) → checkout abre con dominio correcto, webhook llega, DB se actualiza
- [ ] **OG preview** → pegar `https://mydomain.com` en `https://www.opengraph.xyz/` → card se ve correcta con título, descripción, imagen, dominio
- [ ] **Páginas internas** → algunas rutas profundas (`/dashboard/x/y`) cargan sin 404

---

## Errores comunes y fixes

### 1. Cloudflare proxy activado por error

**Síntoma:** "Too many redirects" o SSL error al entrar al sitio.

**Fix:** En Cloudflare DNS, asegurarse que los records `@` (A) y `www` (CNAME) estén en **DNS only** (nube gris, NO naranja).

### 2. www como primary en lugar de apex

**Síntoma:** Login con Google falla con `?code=...` quedando en la raíz `/` en lugar de procesarse en `/auth/callback`. Otros services rompen también.

**Fix:** Configurar apex como primary en Vercel → Settings → Domains (sección 3.2).

### 3. Olvidar actualizar Supabase Redirect URLs

**Síntoma:** después del login con Google, Supabase dice "redirect_uri_mismatch" o lleva al usuario a una URL inesperada.

**Fix:** agregar `https://mydomain.com/**` (con `**`, dos asteriscos) en Supabase Auth → URL Configuration.

### 4. Olvidar redeploy después de cambiar env vars

**Síntoma:** las env vars nuevas no se reflejan en el sitio.

**Causa:** Vercel cachea env vars en builds. Cambios necesitan redeploy.

**Fix:** Vercel → Deployments → último → "Redeploy" (no necesariamente con cache vacío, pero a veces conviene).

### 5. OG image rota tras migración

**Síntoma:** al compartir un link, la preview muestra contenido viejo o se rompe.

**Causas posibles:**
- WhatsApp/Facebook/Twitter cachean OG previews por horas
- `metadataBase` no agregada en `layout.tsx`
- URL hardcodeada en `opengraph-image.tsx` con dominio viejo

**Fix:**
1. Agregar `metadataBase` (sección 5.1)
2. Buscar URLs hardcoded (sección 5.2) y reemplazar
3. Forzar refresh de cache:
   - WhatsApp/Facebook: https://developers.facebook.com/tools/debug/
   - Twitter: https://cards-dev.twitter.com/validator (puede estar deprecado, sino solo esperar)

### 6. Borrar accidentalmente la URL del provider de Auth

**Síntoma:** después de "limpiar" Google OAuth o Supabase, login deja de funcionar completamente.

**Causa:** se borró la URL de callback del provider (ej: `https://[supabase].supabase.co/auth/v1/callback`).

**Fix:** restaurar esa URL. **Nunca borrar la URL del callback de Supabase/Auth0/etc.** — es la dirección donde el provider hace el callback real del OAuth.

### 7. DNS lento en propagar

**Síntoma:** en Vercel sale "Invalid Configuration" después de agregar el dominio aunque los DNS records están bien.

**Fix:**
- Esperar 5-15 min (Cloudflare suele ser rápido pero a veces tarda)
- Verificar con `dig mydomain.com +short` que devuelva `76.76.21.21`
- Click "Refresh" en Vercel Domains
- Si después de 1 hora sigue fallando: verificar que el registrar realmente apunte a Cloudflare nameservers

---

## Apéndice — Stack completo de servicios a actualizar

Lista de chequeo según qué use el proyecto:

| Servicio | Qué actualizar | Notas |
|----------|---------------|-------|
| Vercel | `NEXT_PUBLIC_APP_URL` env var | Trigger redeploy after |
| Supabase Auth | Site URL + Redirect URLs (`/**` two asterisks) | |
| Google OAuth | Authorized domains + JS origins (mantener supabase.co) | |
| Stripe / Onvo / MercadoPago | Webhook URL + return URLs | Verificar path exacto |
| Resend / SendGrid | Domain verification (DKIM, SPF, DMARC) | Si configurás SMTP custom |
| Sentry / Posthog / Mixpanel | Allowed origins | Si tenés analytics |
| Cloudflare | DNS records (A apex, CNAME www, DNS only) | |
| Meta Pixel | Domain verification (separate from Cloudflare DNS) | TXT record adicional |
| Google Search Console | Property verification | TXT record o HTML file |
| Apple Pay / Google Pay | Domain verification (si los soportás) | |

---

## Referencias

- [Vercel Custom Domains docs](https://vercel.com/docs/projects/domains)
- [Why apex over www (Stack Overflow discussion)](https://stackoverflow.com/questions/9823695/should-i-use-www-or-not)
- [Public Suffix List (por qué evitar `*.vercel.app` en producción)](https://publicsuffix.org/)
- [Cloudflare DNS proxy modes](https://developers.cloudflare.com/dns/manage-dns-records/reference/proxied-dns-records/)
