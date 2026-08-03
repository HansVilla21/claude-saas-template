# Skill: Embudo de activación SaaS (diseñar el camino del usuario)

## Cuándo usar esta skill

- Arrancás un SaaS y querés **diseñar el camino del usuario** antes de construir features (no improvisarlo).
- Tu app "funciona" pero la gente **no se registra, no se activa, o no paga**.
- Vas a construir login / onboarding / dashboard y querés que cada paso **maximice el embudo**, no que pierda gente.

> Complementa a `onboarding-cro`, `signup-flow-cro`, `paywall-upgrade-cro` (que son **copy/conversión**). Esta skill es el **diseño de producto/UX** del embudo: qué construir y en qué orden.

## Por qué existe

El error es construir features sueltas sin diseñar el embudo → quedan huecos de confianza, fricción y callejones sin salida. El método que funciona: **diseñá el embudo desde la cabeza del usuario que abandona en el primer minuto.** En cada salto, escribí su pensamiento hostil y el movimiento que lo desactiva.

## Proceso — los 4 saltos (con el pensamiento hostil y el movimiento que salva)

### Salto 0 · Anuncio → landing → CONFIANZA antes de registrarse
> *"Otra app que quiere mis datos / la clave de mi banco. Cierro."*
- Lo PRIMERO arriba: el **diferenciador de confianza** (ej. "nunca pedimos la clave del banco"). Mata la objeción #1.
- El **aha ANTES de registrarse**: demo/GIF del momento "wow" (ej. el reveal de fugas).
- Un solo CTA. Prueba social / "hecho en [país]". Sin ruido.

### Salto 1 · Registro → CERO fricción
> *"¿Para qué tanto dato? Que sea rápido."*
- **Login con Google de un toque** (sin clave). Email como respaldo. No pidas teléfono/tarjeta/encuesta todavía.
- Reforzá la confianza también acá ("tus datos cifrados, solo tuyos").

### Salto 2 · Onboarding → LA pared (acá se muere el embudo)
> *"Esto es complicado / da pereza. Cierro."*
Tres movimientos que salvan:
- **Valor instantáneo primero:** hacé que el usuario vea el aha en <60s ANTES del setup aburrido (ej. "probá UNA acción y mirá el resultado").
- **Eliminá el punto de mayor caída** automatizándolo (ej. capturar el código de confirmación por el usuario, en vez de que pelee con él).
- **Nunca un callejón sin salida:** cada estado tiene un siguiente paso claro. Pasos con capturas reales, no texto.

### Salto 3 · Uso → activación → hábito
> *"Ya entré. ¿Y ahora qué?"*
- **Backfill / estado lleno:** que el dashboard NO esté vacío el día 1 (importar histórico, seed, o demo). Vacío = se van.
- **El momento asesino (wow):** el insight que hace decir "esto lo necesito" (ej. "encontré ₡X/mes en fugas").
- **Gancho de retorno:** resumen semanal por correo/notif que lo trae de vuelta sin abrir la app.

### Salto 4 · Pago → sin romper la confianza
> *"No voy a pagar por esto."*
- Gratis ya da valor real (se enganchan). **Cobrá lo GANADO** (el reporte completo, historial, coach, multi-X) DESPUÉS de que sintieron el valor.
- Dispará el upsell en el **pico emocional** (justo cuando ven el ahorro posible): el ROI se vende solo ("pagás X, te ahorra Y").
- **Pago local** (en LATAM: Onvo/SINPE en CR). Stripe-only espanta a no-bancarizados globales.

## El patrón "tarjeta de activación"
Una card prominente en el home (hasta que el usuario active) que: muestra **el siguiente paso concreto** + el dato que necesita (ej. su dirección/clave única con botón **Copiar**) + pasos numerados + feedback en vivo (ej. mostrar el código capturado apenas llega). Es el componente que convierte "registrado" en "activado".

## Reglas transversales (aplican a todo)
- **Time-to-value < 60 segundos.**
- **Nunca falla en silencio:** todo error/estado tiene un siguiente paso visible.
- **Mobile-first sin excepción.**
- **Confianza reforzada en CADA paso**, no solo en la landing.
- **Lenguaje local y concreto** (moneda, modismos, ejemplos reales del país).

## Output esperado
1. El embudo escrito como 4 saltos, cada uno con el riesgo y el movimiento que lo cubre.
2. La landing (con el diferenciador de confianza + el aha), el registro sin fricción, la tarjeta de activación y el disparador de pago — priorizados.

## Ejemplo concreto (Mi Menudo — producción 2026-06-18)
- Landing con ángulo de privacidad ("sin la clave del banco") + reveal de fugas como aha.
- Registro con Google nativo (un toque, muestra el dominio propio).
- Tarjeta **"Conectá tu BAC"** en el home: dirección de ingesta única + Copiar + pasos + muestra el código de Gmail apenas llega.
- Wow = el reveal de suscripciones/fugas en colones. Pago previsto: beta gratis → freemium con Onvo, upsell en el momento del reveal.

## Gotchas / antipattern
- **NO** construir features sin haber escrito el embudo primero.
- **NO** pedir setup aburrido antes de dar el primer aha.
- **NO** dejar el dashboard vacío para el usuario nuevo.
- **NO** poner el paywall antes de que el usuario sienta el valor.
- **NO** asumir confianza: explicá privacidad/seguridad en cada paso sensible.

## Skills relacionadas
- `onboarding-cro`, `signup-flow-cro`, `paywall-upgrade-cro` — el copy/conversión de cada salto.
- `auth-supabase-google-nativo` — el registro sin fricción.
- `prototipo-ui-a-datos-reales` — que el dashboard muestre datos reales (el aha).
