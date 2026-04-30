---
name: onvo-setup
description: When the user wants to integrate Onvo Pay (Costa Rica payment gateway) into a Next.js + Supabase project. Use when the user mentions "Onvo", "Onvo Pay", "pasarela de pagos Costa Rica", "billing recurrente Onvo", "checkout Onvo", "suscripciones Onvo", "configurar pagos en CR", "agregar billing", "integrar pasarela LATAM", "cobros recurrentes en USD". This skill walks through the full setup: dashboard configuration, environment variables, database migration, and TypeScript client. For implementing the actual checkout/subscription flow after setup, see onvo-checkout-flow. For debugging integration issues, see onvo-troubleshooting.
metadata:
  version: 1.0.0
---

# Onvo Pay — Setup en proyecto nuevo

You are setting up Onvo Pay as the payment gateway for a Next.js (App Router) + Supabase project. This skill covers the foundational setup before implementing the checkout flow.

## Antes de empezar

**Verificá el contexto del proyecto:**
- Stack debe ser Next.js 14+ con App Router + Supabase (Auth + Postgres + RLS)
- El usuario debe tener una cuenta verificada en Onvo (KYC completo) — Onvo es regulado en Costa Rica y requiere validación
- Confirmá si es ambiente Live (producción) o Test (sandbox) — el flujo es idéntico, solo cambian las URLs y keys

**Si el usuario no tiene cuenta de Onvo todavía:** dirigirlo a `dashboard.onvopay.com` para registrarse antes de continuar.

---

## Paso 1 — Configuración en el dashboard de Onvo

### 1.1 Crear producto y precio recurrente

> **CRÍTICO:** El precio debe ser tipo **Recurrente**. Un precio de tipo "Único" no genera renovaciones aunque después intentes crear suscripciones contra él.

1. Dashboard → **Productos** → "+ Crear producto"
2. Nombre comercial (ej: "Hookly Pro", evitar "Test" en producción)
3. Crear precio:
   - **Tipo:** Recurrente / Recurring
   - **Intervalo:** Mensual (1 mes) o el que aplique
   - **Moneda:** USD (recomendado para LATAM, también soporta CRC)
   - **Monto:** el precio real del plan
4. Copiar el `priceId` (formato: `cmokpq9eu01pck42h81sfegrd`) — va a env var

### 1.2 Configurar API keys

1. Dashboard → **Desarrolladores** → **API Keys**
2. 4 keys disponibles (Test + Live, cada una con publishable + secret):
   - `onvo_test_secret_key_*` — sandbox, server-side
   - `onvo_test_publishable_key_*` — sandbox, cliente
   - `onvo_live_secret_key_*` — producción, server-side ⚠️ **NUNCA COMMITEAR**
   - `onvo_live_publishable_key_*` — producción, cliente
3. Copiar la secret key del ambiente que usarás

### 1.3 Configurar webhook

1. Dashboard → **Desarrolladores** → **Webhooks** → "+ Add endpoint"
2. **URL:** `https://TU_DOMINIO.com/api/onvo/webhook`
3. **Eventos a habilitar (mínimo):**
   - `checkout-session.succeeded` ⭐ (crítico)
   - `subscription.renewal.succeeded` ⭐ (crítico)
   - `subscription.renewal.failed`
   - `subscription.canceled`
4. Copiar el **webhook secret** (formato: `webhook_secret_xxxxxxxx`)

> ⚠️ Onvo verifica webhooks con **shared secret en header `X-Webhook-Secret`**, NO con HMAC firmado como Stripe. Cualquiera con el secret puede mandar eventos válidos — protégelo.

### 1.4 Nota sobre el nombre que aparece en el checkout

El nombre que ve el usuario durante el pago es el **nombre legal de la cuenta** en Onvo, NO el nombre del producto. Si tu cuenta legal es distinta del nombre comercial:
- Aclarar en la UI antes del checkout: `"[Producto] es un producto de [Razón social]"`
- Esto evita que el usuario piense que pagó en el lugar incorrecto

---

## Paso 2 — Variables de entorno

Agregá al `.env.example`:

```bash
# --- Pagos: Onvo ---
ONVO_API_URL=https://api.dev.onvopay.com/v1     # sandbox; prod: https://api.onvopay.com/v1
ONVO_SECRET_KEY=onvo_test_secret_key_...
ONVO_PUBLISHABLE_KEY=onvo_test_publishable_key_...
ONVO_WEBHOOK_SECRET=webhook_secret_...
ONVO_PRICE_PRO_MONTHLY=cmoxxx                    # priceId del precio recurrente

# Necesario para construir cancel/return URLs:
NEXT_PUBLIC_APP_URL=https://tu-dominio.com
```

Y crealo en `.env` con los valores reales (Live o Test según corresponda).

### Configurar en Vercel

```bash
# Linkear proyecto si no está linkeado
vercel link --yes --team <slug> --project <name>

# Agregar cada var (production + preview)
echo "valor" | vercel env add NOMBRE_VAR production
echo "valor" | vercel env add NOMBRE_VAR preview
```

> ⚠️ Después de agregar/cambiar env vars, **forzar redeploy en Vercel**. No se aplican en caliente al deployment ya activo.

---

## Paso 3 — Migration de base de datos

Crear un archivo de migration (ej: `migrations/0020_onvo_billing.sql`) con:

```sql
-- =====================================================================
-- Migration: Onvo Pay billing schema
-- =====================================================================
-- Pre-requisitos: tabla profiles existente, función set_updated_at,
--                 enum credits_reason (si usás sistema de créditos),
--                 RPC grant_credits (opcional pero recomendado)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabla subscriptions
-- ---------------------------------------------------------------------
create table if not exists public.subscriptions (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references public.profiles(user_id) on delete cascade,
  -- ID que Onvo asigna a la suscripción. UNIQUE para idempotencia.
  -- NULL si la sub aún no se creó vía API (caso checkout-session.succeeded sin haber llegado aún a crear la sub).
  onvo_subscription_id      text unique,
  plan_slug                 text not null,
  -- trialing | active | past_due | canceled | incomplete | incomplete_expired | unpaid
  status                    text not null default 'incomplete',
  currency                  text not null default 'USD',
  amount_cents              integer not null,
  current_period_start      timestamptz,
  current_period_end        timestamptz,
  canceled_at               timestamptz,
  cancel_reason             text,
  last_event_id             text,
  metadata                  jsonb not null default '{}'::jsonb,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint subscriptions_status_valid
    check (status in ('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid')),
  constraint subscriptions_amount_positive check (amount_cents > 0)
);

create index if not exists idx_subscriptions_user
  on public.subscriptions (user_id, status);
create index if not exists idx_subscriptions_status
  on public.subscriptions (status, current_period_end);

drop trigger if exists trg_subscriptions_updated_at on public.subscriptions;
create trigger trg_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- RLS: usuario lee la suya, no escribe
alter table public.subscriptions enable row level security;
alter table public.subscriptions force row level security;

drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own on public.subscriptions
  for select to authenticated using (auth.uid() = user_id);

revoke insert, update, delete on public.subscriptions from authenticated;

-- ---------------------------------------------------------------------
-- 2. profiles: agregar onvo_customer_id
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists onvo_customer_id text unique;

-- ---------------------------------------------------------------------
-- 3. credits_reason enum: agregar 'subscription_grant' (si tenés sistema de créditos)
-- ---------------------------------------------------------------------
alter type public.credits_reason add value if not exists 'subscription_grant';

-- ⚠️ ALTER TYPE no se puede usar en la misma transacción que código que use el valor.
-- Si grant_credits ya existe y la querés actualizar para validar 'subscription_grant',
-- partir esta migration en dos archivos: 0020a (solo el ALTER TYPE) y 0020b (resto + grant_credits).

-- ---------------------------------------------------------------------
-- 4. Tabla onvo_webhook_events (log raw + idempotencia)
-- ---------------------------------------------------------------------
create table if not exists public.onvo_webhook_events (
  id                       uuid primary key default gen_random_uuid(),
  -- ID del evento de Onvo. UNIQUE para idempotencia.
  event_id                 text unique,
  event_type               text not null,
  raw_body                 jsonb,
  raw_headers              jsonb,
  onvo_subscription_id     text,
  onvo_checkout_session_id text,
  status                   text not null default 'received',
  processed_at             timestamptz,
  processing_error         text,
  received_at              timestamptz not null default now(),
  constraint onvo_webhook_events_event_type_valid
    check (event_type in (
      'payment-intent.succeeded',
      'payment-intent.failed',
      'payment-intent.deferred',
      'subscription.renewal.succeeded',
      'subscription.renewal.failed',
      'subscription.canceled',
      'checkout-session.succeeded',
      'mobile-transfer.received'
    )),
  constraint onvo_webhook_events_status_valid
    check (status in ('received','processing','processed','failed','ignored'))
);

create index if not exists idx_onvo_webhook_events_received
  on public.onvo_webhook_events (received_at desc);
create index if not exists idx_onvo_webhook_events_subscription
  on public.onvo_webhook_events (onvo_subscription_id, received_at desc)
  where onvo_subscription_id is not null;
create index if not exists idx_onvo_webhook_events_status
  on public.onvo_webhook_events (status, received_at desc);

-- RLS: tabla interna, solo service_role accede
alter table public.onvo_webhook_events enable row level security;
alter table public.onvo_webhook_events force row level security;
revoke all on public.onvo_webhook_events from authenticated;
revoke all on public.onvo_webhook_events from anon;
```

Aplicar con `mcp__supabase__apply_migration` o desde el SQL editor del dashboard.

**Después de aplicar:** regenerar tipos TypeScript con `mcp__supabase__generate_typescript_types` y reemplazar `src/lib/database.types.ts`.

---

## Paso 4 — Cliente Onvo en TypeScript

Crear estos 3 archivos:

### 4.1 `src/lib/payments/onvo/types.ts`

```typescript
export type OnvoCurrency = "USD" | "CRC";

export type OnvoSubscriptionStatus =
  | "incomplete" | "incomplete_expired"
  | "trialing" | "active"
  | "past_due" | "canceled" | "unpaid";

export interface OnvoCustomer {
  id: string;
  email: string | null;
  name: string | null;
  phone?: string | null;
  createdAt?: string;
}

export interface CreateCustomerInput {
  email: string;
  name?: string;
  phone?: string;
  // ⚠️ NO incluir 'metadata' — Onvo lo rechaza con HTTP 400
}

export interface OnvoPaymentMethod {
  id: string;
  customerId: string;
  type: string;
  createdAt?: string;
}

export interface OnvoSubscription {
  id: string;
  customerId: string;
  status: OnvoSubscriptionStatus;
  items: { id: string; priceId: string; quantity: number }[];
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  canceledAt?: string | null;
  cancelAtPeriodEnd?: boolean;
  trialEnd?: string | null;
  metadata?: Record<string, unknown>;
}

export interface CreateSubscriptionInput {
  customerId: string;
  paymentMethodId: string;
  items: { priceId: string; quantity: number }[];
  /**
   * Días de trial sin cobro. Usar 30 después del checkout para no cobrar
   * doble — el primer mes ya fue cobrado por la checkout session.
   * ⚠️ NO usar 'trialEnd' (ISO string) — Onvo lo rechaza.
   */
  trialPeriodDays?: number;
  paymentBehavior?: "default_incomplete" | "allow_incomplete";
}

export interface CreateCheckoutSessionInput {
  lineItems: { priceId: string; quantity: number }[];
  cancelUrl: string;
  metadata?: Record<string, string>;
  // ⚠️ NO incluir customerId ni successUrl — Onvo los rechaza
}

export interface OnvoCheckoutSession {
  id: string;
  url: string;
  status: "open" | "complete" | "expired";
  customerId: string;
  subscriptionId?: string | null;
  metadata?: Record<string, unknown>;
}

export type OnvoWebhookEventType =
  | "payment-intent.succeeded"
  | "payment-intent.failed"
  | "payment-intent.deferred"
  | "subscription.renewal.succeeded"
  | "subscription.renewal.failed"
  | "subscription.canceled"
  | "checkout-session.succeeded"
  | "mobile-transfer.received";

export interface OnvoWebhookEvent<TData = unknown> {
  id: string;
  type: OnvoWebhookEventType;
  data: TData;
  createdAt?: string;
}

export class OnvoError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public type?: string,
    public requestId?: string
  ) {
    super(message);
    this.name = "OnvoError";
  }
}
```

### 4.2 `src/lib/payments/onvo/client.ts`

```typescript
import {
  OnvoError,
  type CreateCustomerInput, type OnvoCustomer,
  type CreateCheckoutSessionInput, type OnvoCheckoutSession,
  type OnvoSubscription, type OnvoPaymentMethod,
  type CreateSubscriptionInput,
} from "./types";

interface OnvoConfig {
  apiUrl: string;
  secretKey: string;
}

class OnvoClient {
  private apiUrl: string;
  private secretKey: string;

  constructor(config: OnvoConfig) {
    this.apiUrl = config.apiUrl.replace(/\/$/, "");
    this.secretKey = config.secretKey;
  }

  createCustomer(input: CreateCustomerInput): Promise<OnvoCustomer> {
    return this.request("POST", "/customers", input);
  }
  getCustomer(id: string): Promise<OnvoCustomer> {
    return this.request("GET", `/customers/${id}`);
  }

  createCheckoutSession(input: CreateCheckoutSessionInput): Promise<OnvoCheckoutSession> {
    return this.request("POST", "/checkout/sessions/one-time-link", input);
  }
  getCheckoutSession(id: string): Promise<OnvoCheckoutSession> {
    return this.request("GET", `/checkout/sessions/${id}`);
  }

  listCustomerPaymentMethods(customerId: string): Promise<OnvoPaymentMethod[]> {
    return this.request("GET", `/customers/${customerId}/payment-methods`);
  }

  createSubscription(input: CreateSubscriptionInput): Promise<OnvoSubscription> {
    return this.request("POST", "/subscriptions", input);
  }
  getSubscription(id: string): Promise<OnvoSubscription> {
    return this.request("GET", `/subscriptions/${id}`);
  }
  cancelSubscription(id: string): Promise<OnvoSubscription> {
    return this.request("DELETE", `/subscriptions/${id}`);
  }

  private async request<T>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.apiUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.secretKey}`,
      Accept: "application/json",
    };
    const init: RequestInit = { method, headers };
    if (body !== undefined && method !== "GET") {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }

    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      throw new OnvoError(
        `Onvo network error: ${err instanceof Error ? err.message : String(err)}`,
        0, "network_error"
      );
    }

    const text = await res.text();
    let parsed: unknown = null;
    if (text) {
      try { parsed = JSON.parse(text); } catch { /* texto plano */ }
    }

    if (!res.ok) {
      const errObj = parsed && typeof parsed === "object" && "error" in parsed
        ? ((parsed as { error: Record<string, unknown> }).error ?? {})
        : {};
      const msg =
        (errObj && typeof errObj.message === "string" && errObj.message) ||
        text || `Onvo HTTP ${res.status}`;
      throw new OnvoError(
        String(msg), res.status,
        typeof errObj.code === "string" ? errObj.code : undefined,
        typeof errObj.type === "string" ? errObj.type : undefined,
        res.headers.get("x-request-id") ?? undefined
      );
    }
    return parsed as T;
  }
}

export function getOnvoClient(): OnvoClient {
  // NO cachear — serverless functions deben leer env vars frescas
  const apiUrl = process.env.ONVO_API_URL ?? "https://api.onvopay.com/v1";
  const secretKey = process.env.ONVO_SECRET_KEY;
  if (!secretKey) throw new Error("Onvo: falta ONVO_SECRET_KEY en env vars");
  return new OnvoClient({ apiUrl, secretKey });
}

export type { OnvoClient };
```

### 4.3 `src/lib/payments/plans.ts`

```typescript
export type PlanSlug = "pro";  // expandir según planes que tengas

export interface Plan {
  slug: PlanSlug;
  name: string;
  priceCents: number;
  currency: "USD";
  creditsPerCycle: number;     // si usás sistema de créditos
  onvoPriceId: string;
}

function readPriceId(envVar: string): string {
  const v = process.env[envVar];
  if (!v) throw new Error(`Plans: falta ${envVar} en env vars`);
  return v;
}

/** Lazy resolver para que el módulo no explote en build si faltan env vars. */
export function getPlan(slug: PlanSlug): Plan {
  switch (slug) {
    case "pro":
      return {
        slug: "pro",
        name: "Pro",
        priceCents: 2700,        // adaptá al precio real
        currency: "USD",
        creditsPerCycle: 200,    // adaptá si usás créditos
        onvoPriceId: readPriceId("ONVO_PRICE_PRO_MONTHLY"),
      };
    default: {
      const exhaustive: never = slug;
      throw new Error(`Plans: plan no soportado: ${exhaustive as string}`);
    }
  }
}

export function findPlanByOnvoPriceId(priceId: string): Plan | null {
  try {
    const pro = getPlan("pro");
    if (pro.onvoPriceId === priceId) return pro;
  } catch { /* env no seteado */ }
  return null;
}

export const ALL_PLAN_SLUGS: PlanSlug[] = ["pro"];
```

---

## Paso 5 — Verificación del setup

Antes de proceder al flow de checkout, verificá:

- [ ] Producto y precio recurrente creados en dashboard de Onvo
- [ ] API keys configuradas en `.env` y en Vercel (production + preview)
- [ ] `ONVO_PRICE_PRO_MONTHLY` apunta al priceId del **precio recurrente** (no único)
- [ ] Webhook configurado en Onvo apuntando a `https://TU_DOMINIO.com/api/onvo/webhook`
- [ ] Webhook secret guardado como `ONVO_WEBHOOK_SECRET`
- [ ] Migration aplicada en Supabase (tablas `subscriptions`, `onvo_webhook_events`, columna `profiles.onvo_customer_id`)
- [ ] Tipos TypeScript regenerados
- [ ] 3 archivos del cliente creados: `client.ts`, `types.ts`, `plans.ts`
- [ ] Vercel redeployado para tomar las env vars nuevas

**Test rápido del cliente:** crear un endpoint temporal que llame a `getOnvoClient().createCustomer({email:"test@test.com",name:"Test"})` y verificar que devuelva HTTP 201 con un `id`. Esto confirma que la API key y URL son correctas.

---

## Próximo paso

Una vez completado este setup, proceder con el skill **`onvo-checkout-flow`** para implementar:
- Server actions (start/cancel/reactivate)
- Webhook handler con idempotencia
- UI de suscripción con los 4 estados

## Referencias

- Documentación oficial: [docs.onvopay.com](https://docs.onvopay.com)
- Docs en formato LLM: [docs.onvopay.com/llms-full.txt](https://docs.onvopay.com/llms-full.txt) (alimentar a ChatGPT/Claude)
- Dashboard Live: [dashboard.onvopay.com](https://dashboard.onvopay.com)
- Dashboard Test: [dashboard.dev.onvopay.com](https://dashboard.dev.onvopay.com)

## Tarjetas de testing (sandbox)

- Aprobada sin 3DS: `4242 4242 4242 4242`
- Declinada: `4000 0000 0000 0002`
- Requiere 3DS: `4000 0027 6000 3184`

(Cualquier exp futura, CVV `123`, nombre cualquiera)
