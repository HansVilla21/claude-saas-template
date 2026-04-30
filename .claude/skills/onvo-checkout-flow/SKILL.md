---
name: onvo-checkout-flow
description: When the user wants to implement the full Onvo Pay checkout, subscription creation, cancellation and reactivation flow in a Next.js + Supabase project. Use when the user mentions "implementar checkout Onvo", "flow de suscripción Onvo", "webhook handler Onvo", "cancelar suscripción Onvo", "reactivar suscripción Onvo", "cobro recurrente con trial", "evitar doble cobro Onvo", "subscription billing flow", or "facturación recurrente". Pre-requisito: el setup base debe estar hecho (cliente Onvo, types, migration, env vars). Si el setup no está hecho, usar primero la skill onvo-setup. Para errores en el flow, usar onvo-troubleshooting.
metadata:
  version: 1.0.0
---

# Onvo Pay — Flow completo de checkout, suscripción y cancelación

You are implementing the full subscription billing flow for an Onvo Pay integration. This skill assumes the foundational setup (client, types, migration, env vars) is done — if not, use the `onvo-setup` skill first.

## Contexto crítico que hay que entender ANTES de codear

Onvo Pay tiene una particularidad importante:

> **El endpoint `/v1/checkout/sessions/one-time-link` NO crea suscripciones aunque el `priceId` sea recurrente.** Crea un payment intent único + guarda el método de pago (`setupFutureUsage: true`).

Esto significa que el flow no puede ser "checkout → sub creada" como en Stripe. Tiene que ser:

```
Checkout one-time-link (cobra primer mes)
    ↓ webhook checkout-session.succeeded
        ↓ handler: POST /v1/subscriptions con trialPeriodDays: 30
            ↓ Onvo crea la sub real, sin cobrar (trial)
                ↓ Al día 31, Onvo cobra automático y manda subscription.renewal.succeeded
```

**El truco:** `trialPeriodDays: 30` + `paymentBehavior: "allow_incomplete"` evita el doble cobro.

Si no hacés esto, el usuario paga dos veces el primer mes (una vez por checkout, otra por la suscripción al cobrarse inmediatamente).

---

## Paso 1 — Server Actions

Archivo: `src/app/dashboard/cuenta/suscripcion/actions.ts` (adaptar la ruta al proyecto)

```typescript
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getOnvoClient } from "@/lib/payments/onvo/client";
import { getPlan, type PlanSlug } from "@/lib/payments/plans";
import { OnvoError } from "@/lib/payments/onvo/types";

function isRedirect(err: unknown): boolean {
  if (err instanceof Error && err.message === "NEXT_REDIRECT") return true;
  const digest = (err as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

/**
 * Inicia el checkout. Server action invocada por <form action={startSubscriptionCheckout}>.
 */
export async function startSubscriptionCheckout(formData: FormData): Promise<void> {
  const planSlug = String(formData.get("plan_slug") ?? "pro") as PlanSlug;

  // 1. Auth
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/dashboard/cuenta/suscripcion");

  // 2. Guard: ya tiene sub activa
  const { data: existing } = await getAdminClient()
    .from("subscriptions")
    .select("status")
    .eq("user_id", user.id)
    .in("status", ["active", "trialing"])
    .maybeSingle();
  if (existing) redirect("/dashboard/cuenta/suscripcion?error=already_subscribed");

  // 3. Resolver plan
  let plan;
  try { plan = getPlan(planSlug); }
  catch (err) {
    console.error("[suscripcion/actions] getPlan failed:", err);
    redirect("/dashboard/cuenta/suscripcion?error=plan_not_configured");
  }

  // 4. Buscar/crear customer (cachéalo en profile)
  const { data: profile } = await getAdminClient()
    .from("profiles")
    .select("onvo_customer_id, email, display_name")
    .eq("user_id", user.id)
    .single();

  const profileRow = profile as
    | { onvo_customer_id: string | null; email: string | null; display_name: string | null }
    | null;

  let customerId = profileRow?.onvo_customer_id ?? null;

  if (!customerId) {
    try {
      const customer = await getOnvoClient().createCustomer({
        email: profileRow?.email ?? user.email ?? "",
        name: profileRow?.display_name ?? undefined,
        // ⚠️ NO mandar metadata — Onvo lo rechaza
      });
      customerId = customer.id;

      await getAdminClient()
        .from("profiles")
        .update({ onvo_customer_id: customerId })
        .eq("user_id", user.id);
    } catch (err) {
      const detail = err instanceof OnvoError
        ? `status=${err.status} code=${err.code} msg=${err.message}`
        : String(err);
      console.error(`[onvo] createCustomer failed: ${detail}`);
      redirect("/dashboard/cuenta/suscripcion?error=onvo_unreachable");
    }
  }

  // 5. Crear checkout session
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  try {
    const session = await getOnvoClient().createCheckoutSession({
      lineItems: [{ priceId: plan!.onvoPriceId, quantity: 1 }],
      cancelUrl: `${appUrl}/dashboard/cuenta/suscripcion?status=cancelled`,
      metadata: { user_id: user.id, plan_slug: plan!.slug },
      // ⚠️ NO mandar customerId ni successUrl — Onvo los rechaza
    });
    if (!session.url) throw new Error("Onvo no devolvió session.url");
    redirect(session.url);
  } catch (err) {
    if (isRedirect(err)) throw err;
    const detail = err instanceof OnvoError
      ? `status=${err.status} code=${err.code} msg=${err.message}`
      : String(err);
    console.error(`[onvo] createCheckoutSession failed: ${detail}`);
    redirect("/dashboard/cuenta/suscripcion?error=checkout_failed");
  }
}

/**
 * Cancela la suscripción. Onvo cancela al fin del período actual.
 */
export async function cancelMySubscription(): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/dashboard/cuenta/suscripcion");

  const { data: sub } = await getAdminClient()
    .from("subscriptions")
    .select("id, onvo_subscription_id, status")
    .eq("user_id", user.id)
    .in("status", ["active", "trialing", "past_due"])
    .maybeSingle();

  const subRow = sub as
    | { id: string; onvo_subscription_id: string | null; status: string }
    | null;

  if (!subRow || !subRow.onvo_subscription_id) {
    redirect("/dashboard/cuenta/suscripcion?error=no_active_subscription");
  }

  try {
    await getOnvoClient().cancelSubscription(subRow!.onvo_subscription_id!);
  } catch (err) {
    if (isRedirect(err)) throw err;
    console.error("[suscripcion/actions] cancelSubscription failed:", err);
    redirect("/dashboard/cuenta/suscripcion?error=cancel_failed");
  }

  // Update optimista de subscriptions (el webhook subscription.canceled
  // hará update authoritative — pero a veces no llega para subs en trialing)
  await getAdminClient()
    .from("subscriptions")
    .update({
      status: "canceled",
      canceled_at: new Date().toISOString(),
      cancel_reason: "user_requested",
    })
    .eq("id", subRow!.id);

  // ⭐ Update optimista de profiles.plan — CRÍTICO para UX
  // Sin esto, el sidebar puede seguir mostrando "Plan pro" después de cancelar
  await getAdminClient()
    .from("profiles")
    .update({ plan: "free" })
    .eq("user_id", user.id);

  redirect("/dashboard/cuenta/suscripcion?status=cancelled_ok");
}

/**
 * Reactiva una suscripción cancelada antes de que venza el período.
 * Reusa el customer y payment method guardado, crea nueva sub con trial
 * hasta el current_period_end de la cancelada (para no cobrar de nuevo).
 */
export async function reactivateSubscription(): Promise<void> {
  // 1. Auth
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/dashboard/cuenta/suscripcion");

  // 2. Guard: no reactivar si ya hay activa
  const { data: existing } = await getAdminClient()
    .from("subscriptions")
    .select("status")
    .eq("user_id", user.id)
    .in("status", ["active", "trialing"])
    .maybeSingle();
  if (existing) redirect("/dashboard/cuenta/suscripcion?error=already_subscribed");

  // 3. Buscar la canceled más reciente
  const { data: canceledSubData } = await getAdminClient()
    .from("subscriptions")
    .select("current_period_end")
    .eq("user_id", user.id)
    .eq("status", "canceled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const canceledSub = canceledSubData as { current_period_end: string | null } | null;

  // 4. Customer del profile
  const { data: profileData } = await getAdminClient()
    .from("profiles")
    .select("onvo_customer_id")
    .eq("user_id", user.id)
    .single();
  const profile = profileData as { onvo_customer_id: string | null } | null;

  const customerId = profile?.onvo_customer_id ?? null;
  if (!customerId) redirect("/dashboard/cuenta/suscripcion?error=onvo_unreachable");

  // 5. Payment method guardado
  let paymentMethodId: string | null = null;
  try {
    const methods = await getOnvoClient().listCustomerPaymentMethods(customerId!);
    paymentMethodId = Array.isArray(methods) && methods.length > 0 ? methods[0].id : null;
  } catch { /* fall through */ }
  if (!paymentMethodId) redirect("/dashboard/cuenta/suscripcion?error=onvo_unreachable");

  // 6. Calcular trial = días hasta fin del período ya pagado
  let trialPeriodDays = 1;
  const periodEnd = canceledSub?.current_period_end;
  if (periodEnd) {
    const diffMs = new Date(periodEnd).getTime() - Date.now();
    const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (days > 0) trialPeriodDays = days;
  }

  // 7. Crear sub
  const plan = getPlan("pro");
  let onvoSub;
  try {
    onvoSub = await getOnvoClient().createSubscription({
      customerId: customerId!,
      paymentMethodId: paymentMethodId!,
      items: [{ priceId: plan.onvoPriceId, quantity: 1 }],
      paymentBehavior: "allow_incomplete",
      trialPeriodDays,
    });
  } catch (err) {
    if (isRedirect(err)) throw err;
    console.error("[onvo] reactivateSubscription failed:", err);
    redirect("/dashboard/cuenta/suscripcion?error=onvo_unreachable");
  }

  // 8. Insert + sync profile
  await getAdminClient()
    .from("subscriptions")
    .insert({
      user_id: user.id,
      onvo_subscription_id: onvoSub!.id ?? null,
      plan_slug: plan.slug,
      status: "active",
      currency: plan.currency,
      amount_cents: plan.priceCents,
      current_period_start: onvoSub!.currentPeriodStart ?? null,
      current_period_end: onvoSub!.currentPeriodEnd ?? null,
      last_event_id: null,
      metadata: { source: "reactivation" },
    });

  await getAdminClient()
    .from("profiles")
    .update({ plan: plan.slug })
    .eq("user_id", user.id);

  redirect("/dashboard/cuenta/suscripcion?status=reactivated");
}
```

---

## Paso 2 — Webhook handlers

Archivo: `src/lib/payments/onvo/handlers.ts`

```typescript
import { getAdminClient } from "@/lib/supabase/admin";
import { findPlanByOnvoPriceId, getPlan } from "../plans";
import type {
  OnvoWebhookEvent,
  CheckoutSessionSucceededData,
  SubscriptionCanceledData,
  SubscriptionRenewalData,
} from "./types";
import { getOnvoClient } from "./client";

/**
 * checkout-session.succeeded
 * Onvo cobró el primer mes. Aquí creamos la suscripción Onvo vía API
 * con trialPeriodDays=30 para evitar doble cobro, y otorgamos créditos.
 */
export async function handleCheckoutSessionSucceeded(
  event: OnvoWebhookEvent<CheckoutSessionSucceededData>
): Promise<void> {
  const data = event.data;
  const userId = (data.metadata?.user_id as string | undefined) ?? null;
  const planSlug = (data.metadata?.plan_slug as string | undefined) ?? "pro";

  if (!userId) {
    throw new Error(
      `checkout-session.succeeded: metadata.user_id missing en evento ${event.id}`
    );
  }

  const plan = getPlan(planSlug as "pro");

  // Extraer customerId del payload (puede venir en data.customerId o data.customer.id)
  let subscriptionId: string | null = null;
  const raw = data as unknown as Record<string, unknown>;
  const customerObj = raw.customer;
  const onvoCustomerId: string | undefined =
    (typeof raw.customerId === "string" ? raw.customerId : undefined) ??
    (customerObj && typeof customerObj === "object"
      ? (customerObj as Record<string, unknown>).id as string | undefined
      : undefined);

  // ⭐ EL TRUCO: crear suscripción Onvo vía API con trial 30 días
  if (onvoCustomerId) {
    try {
      const methods = await getOnvoClient().listCustomerPaymentMethods(onvoCustomerId);
      const paymentMethodId = Array.isArray(methods) && methods.length > 0
        ? methods[0].id
        : null;

      if (paymentMethodId) {
        const onvoSub = await getOnvoClient().createSubscription({
          customerId: onvoCustomerId,
          paymentMethodId,
          items: [{ priceId: plan.onvoPriceId, quantity: 1 }],
          paymentBehavior: "allow_incomplete",   // ⭐ no cobra inmediato
          trialPeriodDays: 30,                    // ⭐ primer mes ya pagado
        });
        subscriptionId = onvoSub.id ?? null;
      } else {
        console.error(`[onvo] no paymentMethodId for customer ${onvoCustomerId}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[onvo] sub-create-fail customerId=${onvoCustomerId} err=${msg.slice(0, 300)}`);
      // best-effort — guardamos sub local incluso sin onvo_subscription_id
    }
  }

  // Obtener current_period_*
  let currentPeriodStart: string | null = null;
  let currentPeriodEnd: string | null = null;
  if (subscriptionId) {
    try {
      const sub = await getOnvoClient().getSubscription(subscriptionId);
      currentPeriodStart = sub.currentPeriodStart ?? null;
      currentPeriodEnd = sub.currentPeriodEnd ?? null;
    } catch { /* best-effort */ }
  }

  const subRow = {
    user_id: userId,
    onvo_subscription_id: subscriptionId,
    plan_slug: plan.slug,
    status: "active",
    currency: plan.currency,
    amount_cents: plan.priceCents,
    current_period_start: currentPeriodStart,
    current_period_end: currentPeriodEnd,
    last_event_id: event.id,
    metadata: { source: "checkout-session.succeeded" },
  };

  if (subscriptionId) {
    await getAdminClient()
      .from("subscriptions")
      .upsert(subRow, { onConflict: "onvo_subscription_id" });
  } else {
    await getAdminClient().from("subscriptions").insert(subRow);
  }

  // Otorgar créditos (si usás sistema de créditos)
  const { error: grantError } = await getAdminClient().rpc("grant_credits", {
    p_user_id: userId,
    p_amount: plan.creditsPerCycle,
    p_reason: "subscription_grant",
    p_metadata: {
      source: "checkout-session.succeeded",
      event_id: event.id,
      plan_slug: plan.slug,
    },
  });
  if (grantError) {
    throw new Error(`grant_credits failed for user ${userId}: ${grantError.message}`);
  }

  // Sync plan en profiles
  await getAdminClient()
    .from("profiles")
    .update({ plan: plan.slug })
    .eq("user_id", userId);
}

/**
 * subscription.renewal.succeeded
 * Onvo cobró el ciclo mensual. Otorgamos créditos y movemos period_end.
 */
export async function handleSubscriptionRenewalSucceeded(
  event: OnvoWebhookEvent<SubscriptionRenewalData>
): Promise<void> {
  const data = event.data;
  const subscriptionId = data.id;
  if (!subscriptionId) {
    throw new Error(`subscription.renewal.succeeded: data.id missing en ${event.id}`);
  }

  const sub = await findSubscriptionByOnvoId(subscriptionId);
  if (!sub) {
    throw new Error(`subscription ${subscriptionId} no encontrada en DB`);
  }

  const plan = getPlan(sub.plan_slug as "pro");

  await getAdminClient()
    .from("subscriptions")
    .update({
      status: "active",
      current_period_start: data.currentPeriodStart ?? null,
      current_period_end: data.currentPeriodEnd ?? null,
      last_event_id: event.id,
    })
    .eq("onvo_subscription_id", subscriptionId);

  const { error: grantError } = await getAdminClient().rpc("grant_credits", {
    p_user_id: sub.user_id,
    p_amount: plan.creditsPerCycle,
    p_reason: "subscription_grant",
    p_metadata: {
      source: "subscription.renewal.succeeded",
      event_id: event.id,
      plan_slug: plan.slug,
    },
  });
  if (grantError) {
    throw new Error(`grant_credits failed for user ${sub.user_id}: ${grantError.message}`);
  }

  await getAdminClient()
    .from("profiles")
    .update({ plan: plan.slug })
    .eq("user_id", sub.user_id);
}

/**
 * subscription.renewal.failed
 * Tarjeta vencida, sin fondos, etc. Marcamos past_due.
 * Onvo reintenta automático; si finalmente falla, llega subscription.canceled.
 */
export async function handleSubscriptionRenewalFailed(
  event: OnvoWebhookEvent<SubscriptionRenewalData>
): Promise<void> {
  const subscriptionId = event.data.id;
  if (!subscriptionId) return;

  await getAdminClient()
    .from("subscriptions")
    .update({ status: "past_due", last_event_id: event.id })
    .eq("onvo_subscription_id", subscriptionId);
}

/**
 * subscription.canceled
 * Cancelación explícita o por fallos acumulados.
 * Los créditos del balance permanecen (son del usuario hasta gastarlos).
 */
export async function handleSubscriptionCanceled(
  event: OnvoWebhookEvent<SubscriptionCanceledData>
): Promise<void> {
  const subscriptionId = event.data.id;
  if (!subscriptionId) return;

  const sub = await findSubscriptionByOnvoId(subscriptionId);

  await getAdminClient()
    .from("subscriptions")
    .update({
      status: "canceled",
      canceled_at: event.data.canceledAt ?? new Date().toISOString(),
      cancel_reason: event.data.cancelReason ?? null,
      last_event_id: event.id,
    })
    .eq("onvo_subscription_id", subscriptionId);

  if (sub) {
    await getAdminClient()
      .from("profiles")
      .update({ plan: "free" })
      .eq("user_id", sub.user_id);
  }
}

// ---------- Helpers ----------

interface SubscriptionRow {
  user_id: string;
  plan_slug: string;
  status: string;
  onvo_subscription_id: string | null;
}

async function findSubscriptionByOnvoId(
  onvoSubscriptionId: string
): Promise<SubscriptionRow | null> {
  const { data, error } = await getAdminClient()
    .from("subscriptions")
    .select("user_id, plan_slug, status, onvo_subscription_id")
    .eq("onvo_subscription_id", onvoSubscriptionId)
    .maybeSingle();
  if (error || !data) return null;
  return data as SubscriptionRow;
}

export { findPlanByOnvoPriceId };
```

---

## Paso 3 — Webhook endpoint

Archivo: `src/app/api/onvo/webhook/route.ts`

```typescript
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";
import {
  handleCheckoutSessionSucceeded,
  handleSubscriptionCanceled,
  handleSubscriptionRenewalFailed,
  handleSubscriptionRenewalSucceeded,
} from "@/lib/payments/onvo/handlers";
import type {
  CheckoutSessionSucceededData,
  OnvoWebhookEvent,
  OnvoWebhookEventType,
  SubscriptionCanceledData,
  SubscriptionRenewalData,
} from "@/lib/payments/onvo/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_EVENT_TYPES: ReadonlySet<OnvoWebhookEventType> = new Set([
  "payment-intent.succeeded",
  "payment-intent.failed",
  "payment-intent.deferred",
  "subscription.renewal.succeeded",
  "subscription.renewal.failed",
  "subscription.canceled",
  "checkout-session.succeeded",
  "mobile-transfer.received",
]);

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Read raw body
  const bodyText = await req.text();

  // 2. Verify shared secret (NO HMAC, solo header X-Webhook-Secret)
  const expectedSecret = process.env.ONVO_WEBHOOK_SECRET;
  if (!expectedSecret) {
    console.error("[onvo webhook] ONVO_WEBHOOK_SECRET no configurado");
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }
  const receivedSecret = req.headers.get("x-webhook-secret");
  if (receivedSecret !== expectedSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 3. Parse JSON
  let parsed: unknown;
  try { parsed = bodyText ? JSON.parse(bodyText) : null; }
  catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  if (!parsed || typeof parsed !== "object") {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const event = parsed as Partial<OnvoWebhookEvent>;
  const eventType = event.type;
  const eventId = event.id ?? null;

  if (!eventType || !VALID_EVENT_TYPES.has(eventType)) {
    return NextResponse.json(
      { error: "unsupported_event_type", type: eventType },
      { status: 400 }
    );
  }

  // Capturar headers (audit, sin secret)
  const headersObj: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    if (key.toLowerCase() === "x-webhook-secret") return;
    headersObj[key] = value;
  });

  const sb = getAdminClient();

  // 4. Idempotencia
  if (eventId) {
    const { data: existing } = await sb
      .from("onvo_webhook_events")
      .select("id, status")
      .eq("event_id", eventId)
      .maybeSingle();

    if (
      existing &&
      typeof existing === "object" &&
      "status" in existing &&
      (existing as { status: string }).status === "processed"
    ) {
      return NextResponse.json({ received: true, idempotent: true });
    }
  }

  // 5. Insert raw event row
  const subscriptionId = extractSubscriptionId(event.data);
  const checkoutSessionId = extractCheckoutSessionId(event.data, eventType);

  const eventRow = {
    event_id: eventId,
    event_type: eventType,
    raw_body: parsed as Json,
    raw_headers: headersObj as unknown as Json,
    onvo_subscription_id: subscriptionId,
    onvo_checkout_session_id: checkoutSessionId,
    status: "received",
  };

  let webhookRowId: string | null = null;
  {
    const { data: inserted, error: insertError } = await sb
      .from("onvo_webhook_events")
      .insert(eventRow)
      .select("id")
      .single();

    if (insertError) {
      // Race condition: event_id duplicado → tratar como idempotente
      if (insertError.code === "23505") {
        return NextResponse.json({ received: true, idempotent: true });
      }
      console.error("[onvo webhook] insert raw failed:", insertError);
      return NextResponse.json({ received: true, log_failed: true });
    }
    webhookRowId = (inserted as { id: string }).id;
  }

  // 6. Dispatch
  try {
    switch (eventType) {
      case "checkout-session.succeeded":
        await handleCheckoutSessionSucceeded(
          event as OnvoWebhookEvent<CheckoutSessionSucceededData>
        );
        break;
      case "subscription.renewal.succeeded":
        await handleSubscriptionRenewalSucceeded(
          event as OnvoWebhookEvent<SubscriptionRenewalData>
        );
        break;
      case "subscription.renewal.failed":
        await handleSubscriptionRenewalFailed(
          event as OnvoWebhookEvent<SubscriptionRenewalData>
        );
        break;
      case "subscription.canceled":
        await handleSubscriptionCanceled(
          event as OnvoWebhookEvent<SubscriptionCanceledData>
        );
        break;
      // Ignorados:
      case "payment-intent.succeeded":
      case "payment-intent.failed":
      case "payment-intent.deferred":
      case "mobile-transfer.received":
      default:
        await sb.from("onvo_webhook_events")
          .update({ status: "ignored", processed_at: new Date().toISOString() })
          .eq("id", webhookRowId);
        return NextResponse.json({ received: true, ignored: true });
    }

    await sb.from("onvo_webhook_events")
      .update({ status: "processed", processed_at: new Date().toISOString() })
      .eq("id", webhookRowId);

    return NextResponse.json({ received: true, processed: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[onvo webhook] handler ${eventType} failed:`, message, "body:", bodyText);

    await sb.from("onvo_webhook_events")
      .update({
        status: "failed",
        processed_at: new Date().toISOString(),
        processing_error: message.slice(0, 2000),
      })
      .eq("id", webhookRowId);

    // 200 igual: ya logueamos, no queremos que Onvo reintente y duplique grants
    return NextResponse.json({ received: true, handler_failed: true });
  }
}

// ---------- Helpers ----------

function extractSubscriptionId(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  // Para subscription.* events, el id del payload ES el subscriptionId
  if (typeof obj.id === "string" && typeof obj.customerId === "string") {
    return obj.id;
  }
  if (typeof obj.subscriptionId === "string") return obj.subscriptionId;
  return null;
}

function extractCheckoutSessionId(
  data: unknown,
  eventType: OnvoWebhookEventType
): string | null {
  if (eventType !== "checkout-session.succeeded") return null;
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  return typeof obj.id === "string" ? obj.id : null;
}
```

---

## Paso 4 — UI con 4 estados

Archivo: `src/app/dashboard/cuenta/suscripcion/page.tsx`

La lógica clave de renderizado:

```tsx
{!sub ? (
  <PlanCard />                                    // Nunca se suscribió
) : sub.status === "canceled" ? (
  <CanceledCard sub={sub} />                      // Canceló, período aún activo
) : sub.status === "active" || sub.status === "trialing" ? (
  <ActiveCard sub={sub} />                        // Activo o en trial
) : sub.status === "past_due" ? (
  <PastDueCard sub={sub} />                       // Cobro falló
) : (
  <PlanCard />                                    // Fallback
)}
```

**4 cards con responsabilidades distintas:**

- **`PlanCard`** — invitación a suscribirse: precio, beneficios, `<form action={startSubscriptionCheckout}>` con botón "Suscribirme"
- **`ActiveCard`** — plan actual + "Próximo cobro" + "Período actual desde" + `<CancelButton />`
- **`CanceledCard`** — "Acceso hasta {fecha}" + texto explicativo + `<ReactivateButton />`
- **`PastDueCard`** — alerta cobro fallido + texto "intentaremos cobrar de nuevo, actualizá tu tarjeta si está vencida"

**Banner de estados (query params):**

```typescript
const successOk = params.status === "ok";
const cancelledOk = params.status === "cancelled_ok";
const reactivatedOk = params.status === "reactivated";
const errorMsg = ERROR_MESSAGES[params.error];
```

**Mapping de errores:**

```typescript
const ERROR_MESSAGES: Record<string, string> = {
  already_subscribed: "Ya tenés una suscripción activa.",
  plan_not_configured: "El plan no está configurado todavía. Avisanos por feedback.",
  onvo_unreachable: "No pudimos contactar a la pasarela de pago. Probá en un minuto.",
  checkout_failed: "Algo falló al iniciar el checkout. Probá de nuevo o avisanos.",
  no_active_subscription: "No tenés una suscripción activa para cancelar.",
  cancel_failed: "No pudimos cancelar la suscripción. Mandanos un mensaje y la cerramos manual.",
};
```

**Formato de fechas — IMPORTANTE usar timezone:**

```typescript
function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Costa_Rica",   // ← evita que aparezca día siguiente en UTC
  });
}
```

### Botones con loading state (Client Components)

Archivo: `cancel-button.tsx`:

```tsx
"use client";
import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { cancelMySubscription } from "./actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function CancelButton() {
  const [isPending, startTransition] = useTransition();
  return (
    <ConfirmDialog
      title="¿Cancelar suscripción?"
      description="Tu suscripción seguirá activa hasta el final del período actual. Después no se renovará."
      confirmLabel={isPending ? "Procesando..." : "Sí, cancelar"}
      onConfirm={() => startTransition(() => cancelMySubscription())}
      variant="destructive"
    >
      <button className="...">Cancelar suscripción</button>
    </ConfirmDialog>
  );
}
```

Archivo `reactivate-button.tsx`: similar pero llama a `reactivateSubscription` y sin confirmación previa (es una acción positiva).

---

## Paso 5 — Verificación E2E

Antes de publicar, hacer estos tests:

### Suscribirse
1. Click "Suscribirme" → redirect a Onvo
2. Pagar con tarjeta de testing (`4242 4242 4242 4242` en sandbox)
3. Volver a la app
4. Verificar en DB:
   ```sql
   SELECT status, plan_slug, onvo_subscription_id, current_period_start, current_period_end
   FROM subscriptions ORDER BY created_at DESC LIMIT 1;
   ```
   - `onvo_subscription_id` debe NO ser NULL
   - `status` debe ser `active`
   - Las fechas deben estar pobladas
5. Verificar `profiles.plan = 'pro'`
6. Verificar webhooks: `SELECT event_type, status FROM onvo_webhook_events ORDER BY received_at DESC LIMIT 5;`
7. En el dashboard de Onvo → **ONVO Loop**, debe aparecer la sub como "En prueba" (trialing)

### Cancelar
1. Click "Cancelar suscripción" → confirmar
2. Verificar UI muestra `CanceledCard` con fecha de "Acceso hasta"
3. Verificar `profiles.plan = 'free'` y sub `status='canceled'`
4. En Onvo Loop, debe aparecer "Cancelado"

### Reactivar
1. Click "Reactivar"
2. Verificar redirect a `?status=reactivated`
3. Verificar nueva fila en `subscriptions` con `status='active'`
4. Verificar que NO se cobró nada (la nueva sub está en trial hasta fin del período original)

### Webhook seguridad
- POST a `/api/onvo/webhook` sin `X-Webhook-Secret` → 401
- POST con secret incorrecto → 401
- POST con mismo `event_id` 2 veces → segundo no duplica créditos (idempotencia)

---

## Errores típicos en este flow

Si algo falla, ver la skill **`onvo-troubleshooting`** para diagnóstico específico de cada error.

Los más comunes:
- `metadata` rechazado en createCustomer → quitar metadata
- `customerId` o `successUrl` rechazado en checkout → quitar esos campos
- `trialEnd` rechazado → usar `trialPeriodDays`
- Sub queda en `incomplete` → faltó `paymentBehavior: "allow_incomplete"`
- `onvo_subscription_id` queda NULL → falta llamar a `createSubscription` después del checkout
- `profiles.plan` no se actualiza al cancelar → falta optimistic update
