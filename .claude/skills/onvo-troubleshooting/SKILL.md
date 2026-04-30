---
name: onvo-troubleshooting
description: When something is failing in an Onvo Pay integration and the user needs to diagnose the issue. Use when the user mentions "Onvo no funciona", "error en Onvo", "checkout falla", "webhook no llega", "onvo_unreachable", "checkout_failed", "subscription incomplete", "doble cobro Onvo", "createCustomer falla", "createSubscription falla", "trialEnd rejected", "metadata should not exist", "onvo_subscription_id es NULL", "logs truncados Vercel", "el plan no actualiza tras cancelar". This skill is the diagnostic playbook — maps each symptom to its root cause and fix. For initial setup, see onvo-setup. For implementing the flow, see onvo-checkout-flow.
metadata:
  version: 1.0.0
---

# Onvo Pay — Diagnóstico y troubleshooting

You are debugging an Onvo Pay integration. This skill maps each common symptom to its root cause and exact fix.

## Cómo usar este skill

1. **Identificá el síntoma** en la lista abajo (qué error específico está apareciendo)
2. **Aplicá el fix** correspondiente
3. **Verificá** con el método indicado

Si el síntoma exacto no está, ir a la sección **Diagnóstico general** al final.

---

## Síntomas comunes y soluciones

### 1. `"property metadata should not exist"` al crear customer

**HTTP Status:** 400
**Endpoint:** `POST /v1/customers`

**Causa:** Onvo no acepta el campo `metadata` en la creación de customers (a diferencia de Stripe).

**Fix:** Quitar `metadata` del input de `createCustomer`:

```typescript
// ❌ MAL
const customer = await onvo.createCustomer({
  email: "user@example.com",
  name: "User",
  metadata: { user_id: "..." },   // ← Onvo lo rechaza
});

// ✅ BIEN
const customer = await onvo.createCustomer({
  email: "user@example.com",
  name: "User",
});
```

Si necesitás el mapping `user_id ↔ onvo_customer_id`, guardalo en tu propia DB (columna `profiles.onvo_customer_id` o equivalente).

---

### 2. `"property customerId should not exist"` al crear checkout session

**HTTP Status:** 400
**Endpoint:** `POST /v1/checkout/sessions/one-time-link`

**Causa:** El endpoint `one-time-link` no acepta `customerId` como parámetro. Onvo crea/asocia el customer durante el checkout automáticamente.

**Fix:** Quitar `customerId` del input de `createCheckoutSession`. El `customerId` resultante viene en el webhook `checkout-session.succeeded` (en `data.customerId` o `data.customer.id`).

```typescript
// ❌ MAL
const session = await onvo.createCheckoutSession({
  customerId: "cmoxxx",   // ← Rechazado
  lineItems: [...],
  successUrl: "...",       // ← También rechazado
  cancelUrl: "...",
});

// ✅ BIEN
const session = await onvo.createCheckoutSession({
  lineItems: [{ priceId: "cmoxxx", quantity: 1 }],
  cancelUrl: "https://...",
  metadata: { user_id: "...", plan_slug: "pro" },
});
```

---

### 3. `"property successUrl should not exist"` al crear checkout

**HTTP Status:** 400

**Causa:** Onvo `one-time-link` no soporta redirección automática post-pago. Muestra su propia pantalla de "¡Gracias por tu orden!".

**Fix:** Quitar `successUrl`. Manejar el éxito vía webhook `checkout-session.succeeded`. Si el usuario necesita volver al app, agregalo en el copy de la página antes del checkout: "Después del pago vas a ver una pantalla de confirmación. Volvé a [tu app] manualmente."

---

### 4. `"property trialEnd should not exist"` al crear suscripción

**HTTP Status:** 400
**Endpoint:** `POST /v1/subscriptions`

**Causa:** Onvo usa `trialPeriodDays` (number), no `trialEnd` (ISO string como Stripe).

**Fix:** Cambiar a `trialPeriodDays`:

```typescript
// ❌ MAL
await onvo.createSubscription({
  customerId, paymentMethodId, items,
  trialEnd: "2026-05-30T00:00:00Z",   // ← Rechazado
});

// ✅ BIEN
await onvo.createSubscription({
  customerId, paymentMethodId, items,
  trialPeriodDays: 30,
});
```

---

### 5. Suscripción queda en `status: "incomplete"` con 3DS requerido

**Síntoma:** La sub se crea pero status es `incomplete`. En el response, `latestInvoice.paymentIntent.status === "requires_action"` y `requiresThreeDSecure: true`.

**Causa:** Sin `paymentBehavior` explícito, Onvo intenta cobrar inmediatamente. Si la tarjeta requiere 3DS, queda en estado pendiente y el cobro no completa.

**Fix:** Usar `paymentBehavior: "allow_incomplete"` + `trialPeriodDays`. Esto crea la sub en estado `trialing` sin intentar cobrar:

```typescript
await onvo.createSubscription({
  customerId,
  paymentMethodId,
  items: [{ priceId, quantity: 1 }],
  paymentBehavior: "allow_incomplete",   // ⭐ no cobra inmediato
  trialPeriodDays: 30,                    // ⭐ primer mes ya pagado vía checkout
});
```

> **Por qué este fix funciona:** El primer mes ya se cobró en el checkout. El trial de 30 días + `allow_incomplete` evita que Onvo intente un segundo cobro inmediato. Al día 31, Onvo cobra automático con la tarjeta guardada.

---

### 6. `"El plan no está configurado"` (error `plan_not_configured`)

**Síntoma:** Al hacer click en "Suscribirme", redirige a `?error=plan_not_configured`.

**Causa:** `ONVO_PRICE_PRO_MONTHLY` no está seteado en Vercel, o el deployment activo no la tomó.

**Fixes a chequear en orden:**

1. Verificar que la variable existe en Vercel → Settings → Environment Variables
2. Verificar que tiene un valor válido (formato `cmoxxx`)
3. Verificar que está en el ambiente correcto (Production y Preview)
4. **Forzar redeploy en Vercel** después de agregar/cambiar (no se aplica en caliente)
5. Si recién aplicaste un cambio, esperar a que termine el deploy

```bash
# Verificar vía Vercel CLI
vercel env ls

# Si falta, agregarla
echo "cmoxxx" | vercel env add ONVO_PRICE_PRO_MONTHLY production
```

---

### 7. `"No pudimos contactar la pasarela"` (error `onvo_unreachable`)

**Síntoma:** El checkout falla con este error genérico.

**Causa más probable:** Una de estas:
- `ONVO_SECRET_KEY` está mal o vacía
- `ONVO_API_URL` apunta al ambiente incorrecto (sandbox cuando debería ser live, o viceversa)
- La key fue rotada y no se actualizó en Vercel

**Diagnóstico:**

```bash
# Test directo desde tu máquina (no desde Vercel)
curl -s -X POST "https://api.onvopay.com/v1/customers" \
  -H "Authorization: Bearer onvo_live_secret_key_..." \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","name":"Test"}' \
  -w "\n--- HTTP %{http_code} ---"
```

- Si responde HTTP 201 → la key funciona, el problema es env var en Vercel
- Si responde HTTP 401 "Invalid API key" → la key está mal o fue rotada
- Si responde HTTP 404 → la URL está mal (probablemente sandbox vs prod)

**Fixes:**
- Confirmar `ONVO_API_URL` correcto:
  - Sandbox: `https://api.dev.onvopay.com/v1`
  - Producción: `https://api.onvopay.com/v1`
- Confirmar key correcta (empieza con `onvo_live_secret_key_` o `onvo_test_secret_key_`)
- Si rotaste la key, actualizar en Vercel y redeploy

---

### 8. Checkout funciona pero `onvo_subscription_id` queda NULL

**Síntoma:** Después del pago exitoso, en la DB el `onvo_subscription_id` está NULL. La suscripción NO aparece en el dashboard de Onvo → ONVO Loop.

**Causa:** El endpoint `/v1/checkout/sessions/one-time-link` **NO crea suscripciones** aunque el `priceId` sea recurrente. Solo cobra el primer mes y guarda el método de pago. Hay que crear la suscripción manualmente vía `POST /v1/subscriptions` desde el handler del webhook.

**Fix:** En el handler `handleCheckoutSessionSucceeded`, después de recibir el webhook:

```typescript
// 1. Extraer customerId del payload
const raw = data as unknown as Record<string, unknown>;
const customerObj = raw.customer;
const onvoCustomerId =
  (typeof raw.customerId === "string" ? raw.customerId : undefined) ??
  (customerObj && typeof customerObj === "object"
    ? (customerObj as Record<string, unknown>).id as string | undefined
    : undefined);

// 2. Listar payment methods del customer
const methods = await getOnvoClient().listCustomerPaymentMethods(onvoCustomerId);
const paymentMethodId = methods?.[0]?.id;

// 3. Crear suscripción con trial 30 días
const onvoSub = await getOnvoClient().createSubscription({
  customerId: onvoCustomerId,
  paymentMethodId,
  items: [{ priceId: plan.onvoPriceId, quantity: 1 }],
  paymentBehavior: "allow_incomplete",
  trialPeriodDays: 30,
});
subscriptionId = onvoSub.id;
```

**Verificación:** Después del fix, repetir el flujo. En la DB debería aparecer `onvo_subscription_id` con un valor (`cmoxxx`). En el dashboard de Onvo → ONVO Loop, debería aparecer la sub como "En prueba" (trialing).

---

### 9. Sidebar sigue mostrando "Plan pro" después de cancelar

**Síntoma:** El usuario cancela la suscripción. La página de suscripción muestra estado correcto (CanceledCard), pero el sidebar/header sigue mostrando "Plan pro".

**Causa:** El handler `subscription.canceled` actualiza `profiles.plan = 'free'`, pero a veces Onvo NO manda ese webhook para subs en estado `trialing`. El sidebar lee `profiles.plan` que sigue siendo `'pro'`.

**Fix:** Agregar optimistic update en el server action `cancelMySubscription`:

```typescript
// Después de actualizar subscriptions
await getAdminClient()
  .from("subscriptions")
  .update({ status: "canceled", ... })
  .eq("id", subRow.id);

// ⭐ Agregar este bloque — no esperar al webhook
await getAdminClient()
  .from("profiles")
  .update({ plan: "free" })
  .eq("user_id", user.id);
```

---

### 10. Fechas se muestran un día antes de lo esperado

**Síntoma:** El usuario se suscribió el 30 de abril en CR (a las 6:39 PM hora local), pero la UI muestra "Período actual desde 30 de abril" cuando esperaba "29 de abril".

**Causa:** `current_period_start` se guarda en UTC (00:39:09 UTC = 18:39 hora CR del día anterior). `toLocaleDateString` sin `timeZone` formatea en UTC en server-side rendering, mostrando "30" en lugar de "29".

**Fix:** Pasar `timeZone` explícito:

```typescript
function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Costa_Rica",   // ← clave
  });
}
```

---

### 11. Logs de Vercel truncados

**Síntoma:** En Vercel logs aparece `[onvo] createCustomer faile...` truncado. No se ve el error completo.

**Causa:** El visor de logs de Vercel trunca el campo `Message` a ~30 caracteres en la vista de tabla.

**Fix:** Hacer logs en una sola línea con todo el contexto inline:

```typescript
// ❌ MAL — se trunca
console.error("[onvo] createCustomer failed:", {
  status: err.status,
  code: err.code,
  msg: err.message,
});

// ✅ BIEN — visible completo
const detail = err instanceof OnvoError
  ? `status=${err.status} code=${err.code} msg=${err.message}`
  : String(err);
console.error(`[onvo] createCustomer failed: ${detail}`);
```

---

### 12. Build de Vercel falla con archivos legacy

**Síntoma:** El build de Vercel (o local) falla con error tipo `Cannot find module '../../../app/api/old/route.js'`.

**Causa:** Cache `.next` referenciando rutas borradas.

**Fix local:**
```bash
rm -rf .next
npm run build
```

**Fix en Vercel:** Settings → Clear Build Cache → Redeploy.

---

### 13. Build error: `Nullish coalescing operator(??) requires parens when mixing with logical operators`

**Causa:** Turbopack es estricto con la combinación de `??` y `&&` sin paréntesis explícitos.

**Fix:**

```typescript
// ❌ MAL
const x = a as string ?? b && c.id : undefined;

// ✅ BIEN — separar en partes claras
const onvoCustomerId: string | undefined =
  (typeof raw.customerId === "string" ? raw.customerId : undefined) ??
  (customerObj && typeof customerObj === "object"
    ? (customerObj as Record<string, unknown>).id as string | undefined
    : undefined);
```

---

### 14. Doble cobro al usuario

**Síntoma:** El usuario reporta que se le cobró dos veces el primer mes.

**Causa:** El handler `handleCheckoutSessionSucceeded` está creando la suscripción **sin** `trialPeriodDays` o **sin** `paymentBehavior: "allow_incomplete"`. Onvo intenta cobrar inmediatamente y se suma al cobro del checkout.

**Fix:** Asegurar que la creación de la suscripción siempre incluya:

```typescript
await getOnvoClient().createSubscription({
  customerId,
  paymentMethodId,
  items: [{ priceId, quantity: 1 }],
  paymentBehavior: "allow_incomplete",   // ← OBLIGATORIO
  trialPeriodDays: 30,                    // ← OBLIGATORIO
});
```

**Mitigación al usuario afectado:**
1. Hacer reembolso manual desde dashboard de Onvo
2. Verificar que la sub quedó correcta (status `trialing` ahora)
3. La próxima renovación será al día 31 desde el checkout

---

### 15. Webhook llega pero `status='failed'` en `onvo_webhook_events`

**Síntoma:** En la tabla `onvo_webhook_events` hay filas con `status='failed'` y `processing_error` con algún mensaje.

**Causa:** El handler tiró excepción durante el procesamiento.

**Diagnóstico:**

```sql
SELECT event_type, processing_error, raw_body, received_at
FROM onvo_webhook_events
WHERE status = 'failed'
ORDER BY received_at DESC LIMIT 5;
```

Causas comunes:
- `metadata.user_id` missing → el checkout no envió el metadata correctamente. Revisar el server action `startSubscriptionCheckout`.
- `grant_credits failed` → la RPC tiró error (usuario no existe, valor inválido). Revisar el SQL de `grant_credits`.
- `subscription not found` → un webhook de renewal/cancel llegó para una sub que no está en nuestra DB. Posible: la sub fue creada manualmente en Onvo o se borró localmente.

**Reprocesamiento manual:** Las filas en `onvo_webhook_events` tienen `raw_body` completo. Se puede recrear el evento llamando al handler manualmente.

---

### 16. Webhook responde 401 "unauthorized"

**Síntoma:** Onvo dashboard muestra que los webhooks están fallando con 401.

**Causa:** El header `X-Webhook-Secret` no coincide con `ONVO_WEBHOOK_SECRET`.

**Fixes:**
1. Verificar que `ONVO_WEBHOOK_SECRET` está seteada en Vercel
2. Verificar que coincide exactamente con el secret en el dashboard de Onvo (sin espacios extra)
3. Si recreaste el webhook en Onvo, el secret cambió → actualizar en Vercel + redeploy

---

### 17. Onvo Loop está vacío o muestra "No hay suscripciones"

**Síntoma:** El dashboard de Onvo → ONVO Loop muestra "No hay suscripciones" para un usuario que pagó.

**Causa:** Probablemente el caso del síntoma #8: solo se hizo el checkout, nunca se llamó a `createSubscription` desde el handler.

**Verificación:**
```sql
SELECT raw_body->'data'->>'subscriptionId' as sub_id_payload,
       raw_body->'data'->>'paymentMode' as payment_mode
FROM onvo_webhook_events
WHERE event_type = 'checkout-session.succeeded'
ORDER BY received_at DESC LIMIT 1;
```

Si `sub_id_payload` es NULL y `payment_mode` es `"payment"` (no `"subscription"`), confirma que el checkout no creó la sub. Aplicar fix del síntoma #8.

---

### 18. Webhook nunca llega después del checkout

**Síntoma:** El usuario completa el pago pero no llega ningún webhook a `/api/onvo/webhook`. No hay filas nuevas en `onvo_webhook_events`.

**Diagnóstico:**

1. **Verificar URL del webhook en Onvo:**
   - Dashboard → Webhooks → confirmar que la URL es correcta y accesible públicamente
   - Si es `localhost`, no funciona — necesitás un tunnel (ngrok) o un dominio público
2. **Verificar que el endpoint responde:**
   ```bash
   curl -X POST "https://TU_DOMINIO.com/api/onvo/webhook" \
     -H "X-Webhook-Secret: $ONVO_WEBHOOK_SECRET" \
     -H "Content-Type: application/json" \
     -d '{"id":"test","type":"unknown","data":{}}'
   ```
   Debería responder 400 (`unsupported_event_type`). Si responde 404, el endpoint no existe en producción.
3. **Verificar logs de Vercel:**
   ```
   POST /api/onvo/webhook 200|401|500
   ```
   Si no hay logs, el webhook nunca llegó al app.
4. **Verificar Onvo dashboard → Webhooks → ver el log de entregas:**
   Onvo muestra los intentos y los responses. Si está fallando, ahí se ve el código de respuesta.

**Fixes posibles:**
- URL del webhook incorrecta → corregir en Onvo dashboard
- Endpoint no deployado → verificar que `/api/onvo/webhook/route.ts` existe en producción
- Firewall/protección bloqueando POST → revisar middleware de Next.js (debe permitir el endpoint sin auth de usuario)

---

## Diagnóstico general (cuando el síntoma no está en la lista)

### Paso 1: Identificar el ambiente

```bash
# Confirmar las env vars
vercel env ls | grep ONVO
```

Verificar que:
- `ONVO_API_URL` apunta al ambiente correcto (sandbox vs prod)
- `ONVO_SECRET_KEY` empieza con el prefix correcto (`onvo_test_` o `onvo_live_`)
- Los demás secrets son consistentes con el ambiente

### Paso 2: Test directo de la API

```bash
curl -s "https://api.onvopay.com/v1/customers" \
  -H "Authorization: Bearer $ONVO_SECRET_KEY" \
  -w "\n--- HTTP %{http_code} ---"
```

- 200 → la key funciona
- 401 → key inválida o rotada
- 404 → URL incorrecta
- 5xx → Onvo está caído (raro, pero pasa con sandbox)

### Paso 3: Estado de la DB

```sql
-- Ver últimos webhooks
SELECT event_type, status, processing_error, received_at
FROM onvo_webhook_events
ORDER BY received_at DESC LIMIT 10;

-- Ver suscripción de un usuario específico
SELECT s.*, p.plan, p.credits_balance
FROM subscriptions s
JOIN profiles p ON s.user_id = p.user_id
WHERE p.email = 'user@example.com'
ORDER BY s.created_at DESC LIMIT 3;
```

### Paso 4: Logs de Vercel

```bash
# CLI
vercel logs --since 1h | grep onvo

# O filtrar por endpoint en el dashboard
```

Buscar:
- `[onvo] sub-create-fail` → error específico de creación de sub
- `[onvo webhook]` → errores en el endpoint
- HTTP 401 al webhook → problema de secret
- HTTP 500 → exception en el handler

### Paso 5: Inspeccionar el payload raw

```sql
SELECT raw_body
FROM onvo_webhook_events
WHERE event_type = 'checkout-session.succeeded'
ORDER BY received_at DESC LIMIT 1;
```

Esto te muestra exactamente qué mandó Onvo. Útil para detectar:
- Si `customerId` o `customer.id` están presentes
- Si `subscriptionId` viene null (siempre lo está en `one-time-link`)
- Si el `metadata` que mandamos en el checkout volvió correctamente
- Cualquier campo nuevo que Onvo agregó sin avisar

---

## Comandos rápidos de debugging

```bash
# 1. Test API directa
curl -s "https://api.onvopay.com/v1/customers" -H "Authorization: Bearer $KEY"

# 2. Test del webhook (debería 400 unsupported_event_type)
curl -X POST "https://TU_APP.com/api/onvo/webhook" \
  -H "X-Webhook-Secret: $SECRET" \
  -H "Content-Type: application/json" \
  -d '{"id":"test","type":"unknown","data":{}}'

# 3. Ver logs filtrados
vercel logs --since 30m | grep -i onvo

# 4. Listar env vars
vercel env ls
```

```sql
-- Ver últimos eventos
SELECT event_type, status, processing_error
FROM onvo_webhook_events ORDER BY received_at DESC LIMIT 5;

-- Ver raw del último checkout
SELECT raw_body FROM onvo_webhook_events
WHERE event_type = 'checkout-session.succeeded'
ORDER BY received_at DESC LIMIT 1;

-- Estado completo de un usuario
SELECT s.status as sub_status, s.onvo_subscription_id, s.current_period_end,
       p.plan, p.credits_balance, p.onvo_customer_id
FROM profiles p
LEFT JOIN subscriptions s ON s.user_id = p.user_id
WHERE p.email = 'user@example.com'
ORDER BY s.created_at DESC NULLS LAST LIMIT 1;

-- Limpiar para retesting (¡cuidado!)
DELETE FROM subscriptions WHERE user_id = (SELECT user_id FROM profiles WHERE email = 'test@test.com');
UPDATE profiles SET plan = 'free' WHERE email = 'test@test.com';
```

---

## Referencia rápida — Lo que SÍ y NO acepta cada endpoint

### `POST /v1/customers`

**Acepta:** `email`, `name`, `phone`
**Rechaza:** `metadata`

### `POST /v1/checkout/sessions/one-time-link`

**Acepta:** `lineItems` (camelCase), `cancelUrl`, `metadata`
**Rechaza:** `customerId`, `successUrl`, `mode: "subscription"` (ignorado)
**No crea suscripciones** aunque el priceId sea recurrente

### `POST /v1/subscriptions`

**Acepta:** `customerId`, `paymentMethodId`, `items`, `paymentBehavior`, `trialPeriodDays`
**Rechaza:** `trialEnd`
**Combinación crítica para no doble-cobrar:** `paymentBehavior: "allow_incomplete"` + `trialPeriodDays: 30`

### `GET /v1/customers/{id}/payment-methods`

Devuelve **array directo**, no envuelto en `{data: [...]}`.

### `DELETE /v1/subscriptions/{id}`

Cancela al fin del período actual. La sub queda con `status: "canceled"`.
A veces NO manda webhook `subscription.canceled` para subs en `trialing` — usar optimistic updates en el server action.
