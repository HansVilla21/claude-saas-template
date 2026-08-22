# Skill: Probar una Pasarela de Pago en Producción

## Cuándo usar esta skill

- Cuando hay que **validar pagos end-to-end** pero el **sandbox de la pasarela está caído o es
  poco confiable** (pasa seguido con Onvo y otras de LATAM).
- Cuando querés confirmar que cobros, webhooks, créditos y recibos funcionan **de verdad** antes
  de poner precios reales y mandar tráfico.

## Idea central

Si el sandbox no sirve, se prueba **en producción real con productos de precio bajo pero
válido**, se hace una compra real, se verifica todo, y recién ahí se cambia a precios reales.

## Proceso

1. **Crear productos de prueba en Live** con precio bajo **pero por encima del mínimo** (~$1 USD).
   ⚠️ NO usar montos ínfimos ($0.01 / ₡1) — ver gotchas.
2. **Poner las llaves Live** en `.env`, **subirlas a la plataforma** (Vercel prod+preview) y
   **redeploy** (las env vars se snapshotean en el build).
3. **Verificar por API, ANTES de que alguien pague:** (a) que la secret key autentica
   (crear un customer de test); (b) que cada `priceId` existe y es del **tipo correcto**
   (recurrente para suscripción, único para pack).
4. **Probar la creación del checkout por API** (el mismo call que hace el botón) → confirmar que
   devuelve una URL de pago válida.
5. **Comprar de verdad** con tarjeta real. Verificar en la DB + en la pasarela: fila de
   suscripción/compra, **créditos otorgados**, **recibo** enviado, **webhook idempotente**
   (reenviar el mismo event_id no duplica), y el **flujo de cancelar**.
6. **Swap a precios reales:** crear los productos definitivos, actualizar los `priceId` en
   `.env` + plataforma, **redeploy**. Cancelar la suscripción de prueba.

## Gotchas

- **Monto mínimo:** las redes de tarjeta rechazan cobros < ~$0.50 USD con `"Invalid amount"`
  (código 13). ₡1 falla. Usar ~$1.
- **Tipo de precio:** confirmar recurrente vs único — un pack "one_time" mal creado como
  recurrente puede colar por el código pero es incorrecto.
- **Env vars → redeploy** siempre; y **verificar que estén en la plataforma** (Vercel), no solo
  en `.env` (a un proyecto le faltaba `RESEND_API_KEY` en Vercel → recibos no salían).
- **Webhook del ambiente correcto:** el endpoint de webhook de sandbox ≠ el de Live. Registrar
  el de Live apuntando al dominio de prod.

## Output esperado

Flujo de pago **verificado en producción** (compra + webhook + créditos + recibo + cancelar) y
los precios reales puestos. Se documenta qué quedó probado.

## Ejemplo

**Input:** "El sandbox de Onvo está caído (503). Igual quiero probar los pagos."

**Output:** productos de $1 en Onvo Live → llaves en Vercel + redeploy → verificado por API
(key + priceIds) → compra real con tarjeta → sub/créditos/recibo/webhook OK → cancelar OK →
swap a $29/mes + $19 único. Pagos validados sin depender del sandbox.
