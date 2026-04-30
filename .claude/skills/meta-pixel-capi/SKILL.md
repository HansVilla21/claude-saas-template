---
name: meta-pixel-capi
description: When the user wants to integrate Meta Pixel and the Conversions API (CAPI) in a Next.js + Supabase project for tracking ad conversions. Use when the user mentions "Meta Pixel", "Facebook Pixel", "Conversions API", "CAPI", "tracking de conversiones para ads", "Meta Ads tracking", "Facebook Ads optimización", "implementar Pixel", "configurar Pixel en Next.js", "CompleteRegistration tracking", "Purchase tracking", "Pixel + CAPI", "server-side tracking de Meta", "deduplication event_id", "Aggregated Event Measurement", "AEM", or when they want to optimize Meta Ads for conversions. Covers the complete setup: Meta dashboard configuration, server-first TypeScript implementation, wiring to auth/payment flows, and the 7 most common errors with their fixes.
metadata:
  version: 1.0.0
---

# Meta Pixel + Conversions API (CAPI) — server-first integration

You are integrating Meta Pixel + Conversions API in a Next.js (App Router) + Supabase project to track ad conversions. This skill covers the complete flow: dashboard setup, code, common errors and fixes.

## Decisión arquitectural: server-first

**Tracking de conversiones siempre por CAPI server-side, NO por Pixel browser.** Razones:

- 30-40% de eventos browser bloqueados por adblockers, iOS, extensiones
- CAPI bypassea todo eso → tracking confiable
- Para optimización de ads, calidad > cantidad

**Resultado:**

| Evento | Origen | Cuándo se dispara |
|--------|--------|-------------------|
| `PageView` | Browser (Pixel) | Auto en cada page load |
| `CompleteRegistration` | Server (CAPI) | Después de email confirmation o Google OAuth de usuario nuevo |
| `Purchase` | Server (CAPI) | Después de payment webhook exitoso |
| `Lead` | Server (CAPI) | (Opcional) cuando hay intent fuerte (waitlist, pricing visit) |

> Si después de lanzar querés mejor attribution, agregar dual-tracking (browser + server con mismo `event_id` para deduplication). Para V1, server-side suficiente.

---

## Paso 1 — Setup en el dashboard de Meta

### 1.1 Business Manager (orden CRÍTICO)

> ⚠️ El Pixel debe crearse **DENTRO** del Business Manager, no antes. Si lo creás desde cuenta personal, no podés generar Access Token y todo el flujo de CAPI muere.

1. `business.facebook.com` → Create new account
2. Nombre del negocio: el legal/entidad (no necesariamente la marca visible)
3. Email de trabajo
4. Crear Page de Facebook (nombre = la marca visible) si no existe
5. Crear Ad Account (asignar zona horaria + moneda + método de pago)

### 1.2 Crear Pixel DENTRO del Business Manager

> ⚠️ NO crear desde Events Manager directamente. Hacerlo desde Business Settings.

1. `business.facebook.com → Configuración del negocio → Orígenes de datos → Conjuntos de datos y píxeles`
2. **"Agregar"** (botón azul) → **"Crear nuevo conjunto de datos"**
3. Nombre del Pixel
4. Asignar al Business Manager
5. Anotar el **Pixel ID** (16 dígitos) — va a `NEXT_PUBLIC_META_PIXEL_ID`

### 1.3 Generar Access Token para CAPI

1. Events Manager → tu Pixel → tab **Configuración**
2. Scroll a "API de conversiones"
3. Si te ofrece "Gateway de la API" o "Signals Gateway" — **ignorarlas**, son alternativas no-code que no necesitamos
4. Buscar "Configurar integración directa" → "Configurar con Dataset Quality API"
5. Generar Access Token (formato `EAA...`, ~200 chars)
6. Va a `META_CAPI_ACCESS_TOKEN` (server-only secret, NUNCA exponer al browser)

### 1.4 Verificar dominio

`Business Settings → Seguridad e idoneidad → Dominios`:

1. "Agregar" → escribir el dominio (apex, sin www)
2. Verificación por **DNS TXT**:
   - Meta da un valor `facebook-domain-verification=abc123xyz`
   - Agregar como TXT record en Cloudflare/registrar DNS:
     - Type: TXT, Name: `@`, Content: el valor
     - Proxy: DNS only (no proxied)
3. Click "Verificar" en Meta — tarda 1-5 min

### 1.5 Aggregated Event Measurement (AEM)

> Necesario para iOS 14+ y máxima atribución. Solo aparece DESPUÉS de tener: dominio verificado + eventos llegando a producción.

1. Events Manager → tu Pixel → tab "Aggregated Event Measurement"
2. Seleccionar el dominio verificado
3. 8 slots de prioridad:
   - **#1** El evento de mayor valor (típicamente `Purchase`)
   - **#2** El evento que vas a optimizar para ads (típicamente `CompleteRegistration`)
   - #3-#8 vacíos por ahora

Cambios en AEM tardan 30 min - 1 hora en propagarse.

### 1.6 Test Event Code (solo durante testing)

1. Events Manager → tu Pixel → tab "Probar eventos"
2. Te muestra un código `TEST12345`
3. Va temporalmente a `META_CAPI_TEST_EVENT_CODE` en env vars
4. Eventos con ese code aparecen en "Probar eventos" en lugar de "Resumen"
5. **BORRAR del env antes de producción** — sino todos los eventos van al canal de testing y Meta no los cuenta como conversiones

---

## Paso 2 — Variables de entorno

```bash
# Public (shipped al browser)
NEXT_PUBLIC_META_PIXEL_ID=1234567890123456

# Server-only (NUNCA al browser)
META_CAPI_ACCESS_TOKEN=EAAxxxxx...

# Optional — solo durante testing, BORRAR antes de producción
META_CAPI_TEST_EVENT_CODE=TEST12345
```

⚠️ **CRÍTICO al setear las env vars en Vercel CLI**: NO usar `echo "value" | vercel env add NAME` porque `echo` agrega un `\n` al final. El valor guardado queda como `"value\n"` y todo se rompe silenciosamente (eventos van al canal equivocado, Pixel ID inválido, etc.).

**Alternativas seguras:**
- Pegar valores manualmente en Vercel Dashboard UI (más confiable)
- O usar `printf "value" | vercel env add ...` (printf no agrega `\n`)
- O `echo -n "value" | vercel env add ...` (depende del shell)

---

## Paso 3 — Implementación TypeScript

### 3.1 Tipos (`src/lib/meta/types.ts`)

```typescript
export type MetaEventName =
  | "PageView"
  | "ViewContent"
  | "Lead"
  | "CompleteRegistration"
  | "Purchase";

export type MetaActionSource =
  | "website" | "email" | "app" | "phone_call"
  | "chat" | "physical_store" | "system_generated" | "other";

export interface MetaUserData {
  em?: string;          // Email hasheado SHA-256
  ph?: string;          // Phone hasheado SHA-256
  fn?: string;          // First name hasheado
  ln?: string;          // Last name hasheado
  external_id?: string; // user_id hasheado
  client_ip_address?: string;  // plaintext (Meta hashea)
  client_user_agent?: string;  // plaintext
  fbc?: string;         // Cookie _fbc (click ID de FB)
  fbp?: string;         // Cookie _fbp (browser ID)
}

export interface MetaCustomData {
  currency?: string;
  value?: number;
  content_name?: string;
  content_category?: string;
  content_ids?: string[];
  content_type?: string;
  num_items?: number;
  [key: string]: unknown;
}

export interface MetaServerEvent {
  event_name: MetaEventName;
  event_time: number;          // Unix timestamp en segundos
  event_id?: string;            // UUID para deduplicación
  event_source_url?: string;
  action_source: MetaActionSource;
  user_data: MetaUserData;
  custom_data?: MetaCustomData;
}

export class MetaCapiError extends Error {
  constructor(
    message: string,
    public status: number,
    public fbtraceId?: string
  ) {
    super(message);
    this.name = "MetaCapiError";
  }
}
```

### 3.2 Hashing PII (`src/lib/meta/hash.ts`)

```typescript
import { createHash } from "node:crypto";

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hashEmail(email: string | null | undefined): string | undefined {
  if (!email) return undefined;
  const normalized = email.trim().toLowerCase();
  return normalized ? sha256(normalized) : undefined;
}

export function hashPhone(phone: string | null | undefined): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, "");  // E.164 sin +
  return digits ? sha256(digits) : undefined;
}

export function hashName(name: string | null | undefined): string | undefined {
  if (!name) return undefined;
  const normalized = name.trim().toLowerCase();
  return normalized ? sha256(normalized) : undefined;
}

export function hashUserId(userId: string | null | undefined): string | undefined {
  if (!userId) return undefined;
  const trimmed = userId.trim();
  return trimmed ? sha256(trimmed) : undefined;
}

export function generateEventId(): string {
  return crypto.randomUUID();
}
```

### 3.3 Cliente CAPI (`src/lib/meta/capi.ts`)

```typescript
import { MetaCapiError, type MetaServerEvent } from "./types";

const META_GRAPH_API_VERSION = "v21.0";

class MetaCapiClient {
  constructor(private config: {
    pixelId: string;
    accessToken: string;
    testEventCode?: string;
  }) {}

  async sendEvents(events: MetaServerEvent[]): Promise<{
    events_received?: number;
    fbtrace_id?: string;
    messages?: string[];
  }> {
    if (events.length === 0) return { events_received: 0 };

    const url = `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${this.config.pixelId}/events?access_token=${this.config.accessToken}`;

    const payload = {
      data: events,
      ...(this.config.testEventCode ? { test_event_code: this.config.testEventCode } : {}),
    };

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      throw new MetaCapiError(
        `Network error: ${err instanceof Error ? err.message : String(err)}`,
        0
      );
    }

    const text = await res.text();
    let parsed: unknown = null;
    try { parsed = JSON.parse(text); } catch {}

    if (!res.ok) {
      const fbtraceId = parsed && typeof parsed === "object" && "fbtrace_id" in parsed
        ? String((parsed as { fbtrace_id: unknown }).fbtrace_id)
        : undefined;
      throw new MetaCapiError(`Meta CAPI ${res.status}: ${text.slice(0, 500)}`, res.status, fbtraceId);
    }

    return (parsed ?? {}) as { events_received?: number; fbtrace_id?: string; messages?: string[] };
  }
}

/** NO cachear — env vars se leen frescas en cada invocación serverless. */
export function getMetaCapiClient(): MetaCapiClient | null {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN;
  const testEventCode = process.env.META_CAPI_TEST_EVENT_CODE;

  // Si no hay credenciales, no fallar — silently skip tracking.
  // Permite deployar sin tracking antes de tener credenciales.
  if (!pixelId || !accessToken) return null;

  return new MetaCapiClient({ pixelId, accessToken, testEventCode });
}

export async function trackMetaEvent(event: MetaServerEvent): Promise<void> {
  const client = getMetaCapiClient();
  if (!client) return;  // env vars missing → silently skip

  try {
    await client.sendEvents([event]);
  } catch (err) {
    const detail = err instanceof MetaCapiError
      ? `status=${err.status} fbtrace=${err.fbtraceId} msg=${err.message}`
      : String(err);
    console.error(`[meta capi] event_name=${event.event_name} failed: ${detail}`);
    // NUNCA re-lanzar — tracking no debe romper UX
  }
}
```

### 3.4 Helpers de alto nivel (`src/lib/meta/events.ts`)

```typescript
import { trackMetaEvent } from "./capi";
import { hashEmail, hashName, hashUserId, generateEventId } from "./hash";
import type { MetaServerEvent, MetaUserData } from "./types";

interface UserContext {
  userId?: string | null;
  email?: string | null;
  name?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
  fbc?: string | null;
  fbp?: string | null;
  sourceUrl?: string | null;
}

function buildUserData(ctx: UserContext): MetaUserData {
  const ud: MetaUserData = {};
  const em = hashEmail(ctx.email);
  if (em) ud.em = em;
  const fn = hashName(ctx.name);
  if (fn) ud.fn = fn;
  const externalId = hashUserId(ctx.userId);
  if (externalId) ud.external_id = externalId;
  if (ctx.clientIp) ud.client_ip_address = ctx.clientIp;
  if (ctx.userAgent) ud.client_user_agent = ctx.userAgent;
  if (ctx.fbc) ud.fbc = ctx.fbc;
  if (ctx.fbp) ud.fbp = ctx.fbp;
  return ud;
}

export async function trackCompleteRegistration(
  ctx: UserContext,
  options?: { eventId?: string }
): Promise<void> {
  const event: MetaServerEvent = {
    event_name: "CompleteRegistration",
    event_time: Math.floor(Date.now() / 1000),
    event_id: options?.eventId ?? generateEventId(),
    event_source_url: ctx.sourceUrl ?? undefined,
    action_source: "website",
    user_data: buildUserData(ctx),
    custom_data: { content_name: "Account" },
  };
  await trackMetaEvent(event);
}

export async function trackPurchase(
  ctx: UserContext,
  details: { valueUsd: number; currency?: string; contentName?: string },
  options?: { eventId?: string }
): Promise<void> {
  const event: MetaServerEvent = {
    event_name: "Purchase",
    event_time: Math.floor(Date.now() / 1000),
    event_id: options?.eventId ?? generateEventId(),
    event_source_url: ctx.sourceUrl ?? undefined,
    action_source: "website",
    user_data: buildUserData(ctx),
    custom_data: {
      currency: details.currency ?? "USD",
      value: details.valueUsd,
      content_name: details.contentName ?? "Subscription",
      content_type: "product",
    },
  };
  await trackMetaEvent(event);
}

export async function trackLead(
  ctx: UserContext,
  options?: { eventId?: string }
): Promise<void> {
  const event: MetaServerEvent = {
    event_name: "Lead",
    event_time: Math.floor(Date.now() / 1000),
    event_id: options?.eventId ?? generateEventId(),
    event_source_url: ctx.sourceUrl ?? undefined,
    action_source: "website",
    user_data: buildUserData(ctx),
  };
  await trackMetaEvent(event);
}

/** Lee cookies _fbc y _fbp del header Cookie. Mejoran attribution si están. */
export function getFacebookCookies(
  cookieHeader: string | null | undefined
): { fbc: string | null; fbp: string | null } {
  if (!cookieHeader) return { fbc: null, fbp: null };
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [k, ...rest] = c.trim().split("=");
      return [k, rest.join("=")];
    })
  );
  return { fbc: cookies["_fbc"] ?? null, fbp: cookies["_fbp"] ?? null };
}

export function getClientIp(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? null;
  return headers.get("x-real-ip");
}
```

### 3.5 Browser Pixel script (`src/components/meta/meta-pixel-script.tsx`)

```tsx
import Script from "next/script";

interface MetaPixelScriptProps {
  pixelId: string | undefined;
}

export function MetaPixelScript({ pixelId }: MetaPixelScriptProps) {
  if (!pixelId) return null;

  return (
    <>
      <Script id="meta-pixel" strategy="afterInteractive">
        {`
          !function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window, document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '${pixelId}');
          fbq('track', 'PageView');
        `}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img height="1" width="1" style={{ display: "none" }}
             src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
             alt="" />
      </noscript>
    </>
  );
}
```

---

## Paso 4 — Wiring

### 4.1 Layout root

```tsx
// src/app/layout.tsx
import { MetaPixelScript } from "@/components/meta/meta-pixel-script";

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <MetaPixelScript pixelId={process.env.NEXT_PUBLIC_META_PIXEL_ID} />
        {children}
      </body>
    </html>
  );
}
```

### 4.2 `/auth/confirm` (email signup)

Tras `exchangeCodeForSession` o `verifyOtp` exitoso:

```typescript
import { trackCompleteRegistration, getFacebookCookies, getClientIp } from "@/lib/meta/events";

// Después de auth exitoso:
if (data.user) {
  const cookies = getFacebookCookies(request.headers.get("cookie"));
  await trackCompleteRegistration({
    userId: data.user.id,
    email: data.user.email ?? null,
    name: (data.user.user_metadata?.full_name ?? null) as string | null,
    clientIp: getClientIp(request.headers),
    userAgent: request.headers.get("user-agent"),
    fbc: cookies.fbc,
    fbp: cookies.fbp,
    sourceUrl: `${origin}/auth/confirm`,
  });
}
```

### 4.3 `/auth/callback` (OAuth — solo si usuario nuevo)

> ⚠️ Para OAuth tenés que distinguir signup nuevo vs login. Sin esto, cada vez que el usuario entre con Google se va a disparar CompleteRegistration y vas a inflar tus métricas.

```typescript
function isNewSignup(createdAt: string | undefined): boolean {
  if (!createdAt) return false;
  const created = new Date(createdAt).getTime();
  const diffSeconds = (Date.now() - created) / 1000;
  return diffSeconds < 60 && diffSeconds >= 0;
}

if (data.user && isNewSignup(data.user.created_at)) {
  // Disparar CompleteRegistration
}
```

### 4.4 Payment webhook handler

```typescript
import { trackPurchase } from "@/lib/meta/events";

// Después de procesar el pago exitoso:
await trackPurchase(
  {
    userId,
    email: profile?.email ?? null,
    name: profile?.display_name ?? null,
    sourceUrl: process.env.NEXT_PUBLIC_APP_URL,
  },
  {
    valueUsd: plan.priceCents / 100,
    currency: plan.currency,
    contentName: plan.name,
  },
  { eventId: `purchase_${webhookEventId}` }  // dedup-friendly
);
```

---

## Paso 5 — Endpoint de debug (vital para diagnosticar)

Crear `src/app/api/meta/debug/route.ts` temporal que devuelve `length` de las env vars (para detectar `\n` invisibles) y manda un evento de prueba. Ver implementación completa en la doc del proyecto Hookly (`migracion-dominio-y-meta-pixel.md` sección 14).

```bash
# Llamar desde browser:
GET /api/meta/debug?secret=tu-secret

# Devuelve JSON con:
# - env vars + length (para detectar \n)
# - request payload
# - response de Meta
```

**BORRAR el endpoint después** del debug. Es público (protegido por secret hardcodeado pero igual).

---

## Paso 6 — Testing

### 6.1 Test directo a CAPI con curl (validar credenciales)

```bash
curl -s -X POST "https://graph.facebook.com/v21.0/PIXEL_ID/events?access_token=TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "data": [{
      "event_name": "PageView",
      "event_time": '"$(date +%s)"',
      "action_source": "website",
      "user_data": {
        "client_ip_address": "127.0.0.1",
        "client_user_agent": "test"
      }
    }]
  }'
```

Esperado: `{"events_received":1,"fbtrace_id":"..."}`. Si falla, ver código HTTP:
- 401 → token inválido o pixel fuera de Business Manager
- 400 → payload malformado (faltan campos requeridos)

### 6.2 Test E2E con Test Events

1. Setear `META_CAPI_TEST_EVENT_CODE=TEST12345` en Vercel
2. Redeploy
3. Hacer signup real con email/Google
4. Events Manager → "Probar eventos" → debería aparecer `CompleteRegistration` en tiempo real

### 6.3 Antes de producción

1. **Borrar `META_CAPI_TEST_EVENT_CODE`** del env (sino los eventos van al canal test, Meta no los cuenta)
2. Hacer 1 signup real → confirmar evento aparece en "Resumen" (no Probar eventos)
3. Esperar 5-10 min → Meta indexa el evento
4. Configurar AEM con CompleteRegistration priorizado
5. **Borrar el endpoint `/api/meta/debug`** del código

---

## Errores comunes y fixes

### 1. Pixel creado fuera del Business Manager

**Síntoma:** al generar Access Token, Meta dice "el píxel no está asociado a una cuenta comercial".

**Fix:** crear nuevo Pixel desde `Business Settings → Conjuntos de datos y píxeles → Agregar` (no desde Events Manager directo). Borrar/ignorar el Pixel viejo.

### 2. Trailing `\n` en env vars (Vercel CLI)

**Síntoma:** la integración parece funcionar (`events_received: 1`), pero los eventos NO aparecen en "Probar eventos" del dashboard.

**Causa:** `echo "valor" | vercel env add ...` agrega `\n` al final. El `test_event_code` queda como `"TEST12345\n"`, no matchea exactamente, y los eventos van al canal de **producción** en lugar de testing.

**Fix:**
- Detectar con endpoint de debug: si `length` de env var es +1 vs lo esperado → tenés `\n`
- Editar manualmente en Vercel Dashboard UI (pegar valor limpio)
- Redeploy

### 3. Test Event Code dejado en producción

**Síntoma:** signups reales no aparecen en "Resumen" (solo en "Probar eventos"). Campañas dicen "no hay eventos de conversión configurados".

**Fix:** eliminar `META_CAPI_TEST_EVENT_CODE` del env. Sin esa var, los eventos van a producción.

### 4. PageView browser no aparece en "Probar eventos"

**Causa esperada:** el browser Pixel no incluye `test_event_code`. Sus eventos van directo a "Resumen", no a "Probar eventos".

**Fix:** verificar PageView con la extensión [Meta Pixel Helper](https://chromewebstore.google.com/detail/meta-pixel-helper/) en Chrome.

### 5. CompleteRegistration se dispara cada Google login

**Causa:** en `/auth/callback` no estás distinguiendo signup nuevo vs login retornante.

**Fix:** chequear `created_at < 60s` antes de disparar el evento (ver sección 4.3).

### 6. Pixel ID con `\n` en la URL

**Síntoma:** `length=17` en debug endpoint cuando debería ser 16. URL termina en `https://graph.facebook.com/v21.0/1234567890123456%0A/events`.

**Fix:** mismo que error #2 — eliminar `\n` del valor del env var.

### 7. AEM no configurado pero la campaña pide evento de conversión

**Causa:** la campaña con objetivo "Ventas" o "Clientes potenciales" requiere que el evento esté priorizado en Aggregated Event Measurement.

**Fix:**
- O configurar AEM (#1 Purchase, #2 CompleteRegistration)
- O cambiar objetivo de campaña a "Tráfico" mientras tanto

---

## Checklist de producción

- [ ] Pixel creado dentro del Business Manager
- [ ] Domain verified en Meta (DNS TXT)
- [ ] `NEXT_PUBLIC_META_PIXEL_ID` en Vercel (Production + Preview)
- [ ] `META_CAPI_ACCESS_TOKEN` en Vercel (server-only)
- [ ] `META_CAPI_TEST_EVENT_CODE` **eliminado** de Vercel antes de producción
- [ ] Test E2E con curl → events_received: 1
- [ ] Test E2E con signup real → evento aparece en "Resumen"
- [ ] AEM priorizado: #1 Purchase, #2 CompleteRegistration
- [ ] `/api/meta/debug` endpoint borrado del código
- [ ] Browser Pixel verificado con Pixel Helper extensión

---

## Referencias

- [Conversions API docs](https://developers.facebook.com/docs/marketing-api/conversions-api)
- [Customer Information Parameters (hashing)](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters)
- [Test Events](https://developers.facebook.com/docs/marketing-api/conversions-api/using-the-api#test)
- [Aggregated Event Measurement](https://www.facebook.com/business/help/721422165168355)
- [Pixel Helper Chrome extension](https://chromewebstore.google.com/detail/meta-pixel-helper/fdgfkebogiimcoedlicjlajpkdmockpc)
