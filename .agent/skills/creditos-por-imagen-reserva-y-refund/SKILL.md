# Skill: Créditos por unidad de costo — reserva, refund y ledger append-only

## Cuándo usar esta skill

- Un SaaS cobra por consumo de algo que **le cuesta plata por unidad** (una imagen generada, una llamada al modelo, un scrape, un minuto de audio).
- Estás por cobrar "por pack", "por proyecto" o "por lote" — una unidad que **agrupa** varias unidades de costo.
- Necesitás que "lo que falló no se cobra" sea cierto, no una promesa de soporte.

## Por qué existe esta skill

FreshAdFlow arrancó con **1 crédito = 1 pack**. Un pack puede ser de 3, 6 o 9 imágenes. O sea: al que pedía 3 se le cobraba de más, y al que pedía 9 se le regalaba. La unidad de negocio no coincidía con la unidad de costo.

Se rehízo a **1 crédito = 1 imagen** (la unidad que de verdad cuesta ~$0.06). Con eso, dos mecánicas se vuelven obligatorias: **reservar** antes de trabajar y **devolver** lo que falló.

## El modelo

### Ledger append-only, saldo derivado

Nunca una columna `credits` que se actualiza. Una tabla de movimientos, y el saldo es la suma:

```ts
export type LedgerReason =
  | "free_grant" | "generation" | "pack_purchase"
  | "subscription_grant" | "feedback_reward" | "contact_reward" | "refund";

// saldo = sum(delta) del ledger del usuario
```

Por qué append-only: te da auditoría gratis (el "historial de movimientos" que la página de cuenta necesita — ver [[pagina-de-cuenta-billing-saas]]), hace imposible el race de "leer-modificar-escribir", y cada crédito regalado queda con su motivo.

**Un `reason` por mecánica**, no un cajón "ajuste". Es lo que después permite guards del tipo *"la recompensa por dar el WhatsApp se otorga una sola vez"*: se consulta si ya existe un movimiento con ese `reason` para ese usuario.

### Reserva al crear el job

```ts
// createJob: valida y reserva ANTES de encolar nada
if (await getBalance(userId) < count) return { ok: false, reason: "insufficient_credits" };
await addLedger({ userId, delta: -count, reason: "generation", jobId });
```

Reservar el total por adelantado evita que un pack de 9 arranque con saldo para 3.

### Refund por unidad fallida, con guard anti doble-refund

```ts
// worker: por CADA imagen que falla
await addLedger({ userId, delta: +1, reason: "refund", jobId: job.id });
```

Neto = imágenes logradas. El guard anti doble-refund importa porque el worker puede reintentarse: antes de refundar, contá los refunds ya escritos para ese job y no pases de la cantidad de fallos reales.

### El founder se exenta por SALDO, no por código

La tentación es `if (isFounder) skip cobro` dentro del worker. Eso ensucia la ruta crítica y hace que el founder **no pruebe el sistema real** — que es justo lo que querés que pruebe.

**En su lugar:** un movimiento de ledger grande (`+1000`) para su usuario. El sistema de créditos queda honesto para todo el mundo, y el founder igual no se queda sin.

> Los topes anti-abuso sí son distintos: esos **sí** exentan a founder y a plan pago por código, porque son una defensa de costo del tier gratis, no una regla de negocio. Ver [[anti-abuso-costo-ia-saas]].

### El free grant, gateado por email verificado

`ensure_profile(user_id, name, email_verified)` — idempotente: crea el perfil **siempre**, otorga el free grant **una sola vez** y **solo si el email está verificado**. Google llega verificado; email/clave recibe el grant al confirmar.

Devolver un boolean `granted` (true solo cuando se otorgó en ESA llamada) te da gratis la señal de **"registro completado por primera vez"** — que es exactamente el evento de conversión que necesita el pixel de ads, sin tabla extra ni heurística.

## Gotchas

- **Cobrar distinto por variantes más caras es una decisión de producto, no técnica.** El formato vertical cuesta ~1.5x el cuadrado y aun así se cobró **1 crédito para todas**: simplicidad de precio sobre exactitud de costo. Decidilo explícito, no por omisión.
- **Migrar de "por pack" a "por unidad" toca 4 lugares**: la validación de saldo, la reserva, el refund y **todo el copy** ("3 packs gratis" pasa a "6 imágenes gratis"). En FreshAdFlow el copy de la landing quedó desincronizado un tiempo.
- **Si anexás trabajo a un job existente** (generar más, variaciones), la reserva y el refund tienen que ser parte de la misma operación atómica que el claim del job. Ver [[anexar-creativos-a-pack-existente]].
- **El saldo se lee mucho**: `sum(delta)` sobre un ledger que crece es barato por un rato, pero si el volumen escala, agregá índice por `user_id` y considerá una vista materializada — nunca una columna desnormalizada que se actualiza a mano.
- **El grant "una sola vez" necesita el guard en la función de la base**, no en la app. Dos requests simultáneos del primer login son un caso real.

## Ejemplo (input -> output)

- **Input:** "el sistema cobra 1 crédito por pack; un pack son 3, 6 o 9 imágenes".
- **Output:** 1 crédito = 1 imagen. `createJob` reserva `-count`; el worker refunda `+1` por fallo (neto = logradas); free grant 6 gateado por email verificado; founder con `+1000` de saldo en vez de una excepción en el código.

## Relacionadas

[[pagina-de-cuenta-billing-saas]] · [[anti-abuso-costo-ia-saas]] · [[anexar-creativos-a-pack-existente]] · [[probar-pasarela-de-pago-en-prod]] · [[gate-0-validar-motor-antes-de-construir]]
