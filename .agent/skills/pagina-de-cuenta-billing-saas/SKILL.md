# Skill: Página de Cuenta / Billing de un SaaS

## Cuándo usar esta skill

- Cuando hay que armar la **página de cuenta/billing** de un SaaS con **suscripción + créditos**
  (mostrar plan, renovación, saldo, historial, y comprar/cancelar).
- Cuando el founder pide "hacerlo bien desde un inicio" para no volver a tocarlo.

## Proceso

1. **Tarjeta de estado** con una **línea dinámica según el plan**, para que el usuario entienda
   su situación de un vistazo:
   - Pro activa: "Se renueva el {fecha} · 150 imágenes al mes".
   - Pro cancelada (en gracia): "Acceso Pro hasta el {fecha} · después pasás a {pack/gratis}".
   - Pack/compra única: "Sin suscripción · tus créditos no vencen · sin marca de agua".
   - Free: "{N} imágenes gratis disponibles".
   - Nudge cuando el saldo llega a 0 ("comprá o pasá a Pro").
2. **Período de gracia al cancelar:** el plan efectivo cuenta una sub cancelada como válida
   **hasta `current_period_end`** (no caer a gratis al instante — el usuario pagó ese mes). Pro
   tiene prioridad sobre pack.
3. **Historial de movimientos:** listar el `credit_ledger` con etiquetas legibles (regalo,
   plan Pro, pack, generación, reembolso, feedback) + fecha.
4. **Datos:** `/api/me` expone plan efectivo + estado de la sub (activa/cancelada + fecha) +
   `hasPack`; un endpoint aparte (`/api/billing/history`) devuelve el ledger.
5. **Botones** comprar Pro / comprar Pack / cancelar (cancelar oculto si ya está cancelada).

## Gotchas (fixes reales)

- **Flash del estado inicial:** gatear la tarjeta y los CTAs con `authReady` (skeleton) — si no,
  muestra "Gratis / 0 créditos" un instante antes de cargar el plan real.
- **No se refresca tras cancelar/comprar:** cancelar es una navegación interna que NO remonta el
  provider de estado → llamar `refreshMe()` al montar `/cuenta` para re-sincronizar.
- **Chip del sidebar** debe mostrar el plan real (Free/Pack/Pro), no solo "free vs pago".
- **Banner de query param** (?status=): leerlo una vez y limpiar la URL para que no quede pegado
  al refrescar. No mostrar aviso al abandonar un checkout (es ruido).

## Output esperado

Página `/cuenta` completa: tarjeta de estado + planes con CTA correcto + historial de movimientos.

## Ejemplo

**Input:** "La página de cuenta no dice cuándo se renueva ni qué pasa al quedarme sin créditos.
Armémoslo bien."

**Output:** tarjeta de estado con "se renueva el X / acceso hasta X / créditos no vencen", nudge a
0 créditos, historial del ledger, chip con plan real, período de gracia al cancelar, y refreshMe
al entrar. (FreshAdFlow `/cuenta`.)
