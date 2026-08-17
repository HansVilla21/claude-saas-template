# Skill: Umbral único compartido entre un cron SQL y un filtro de cliente

## Cuándo usar esta skill

- Dos lugares deciden "lo mismo" con un mismo umbral (temporal o numérico) pero en **lenguajes distintos**: un cron/trigger de Postgres (SQL) y un filtro o cálculo en el cliente (TS) — y tienen que producir EXACTAMENTE el mismo conjunto.
- Caso típico: una **notificación del servidor** ("avisar cuando la ventana de 24h está por cerrarse") y un **filtro de UI** ("mostrar las conversaciones por cerrarse"). Si los umbrales divergen, el usuario ve un filtro que no coincide con lo que el sistema le notificó.
- Estás por copiar a mano un `interval '22 hours'` o un `< 2h` al frontend → **señal de alerta de drift futuro**.

## Por qué existe esta skill

(Momentum CRM, M7, 2026-06-22) El evento `window_closing` lo emite un cron de Postgres (`notif_scan_closing_windows`, migración 0027) con el predicado: `last_inbound_at ∈ [now-24h, now-22h)` **y** el contacto es el último que escribió (`last_outbound_at is null or last_inbound_at > last_outbound_at`). El founder pidió un filtro de inbox **"Por cerrarse"** que muestre ESAS MISMAS conversaciones.

Si el front hubiera reimplementado el umbral con números sueltos, el filtro y la campana habrían divergido apenas alguien tocara uno de los dos. SQL y TS no comparten código literal, así que la "fuente única" práctica es: **un helper TS con el umbral como constante nombrada, documentado como espejo del SQL, con cross-reference explícito en ambos lados.**

## El patrón

### 1. Copiar el predicado COMPLETO, no solo el número

El umbral no es solo "2h": es toda la condición que decide pertenencia. Replicá las dos puntas de la franja **y** las condiciones acompañantes (en el caso real, "el contacto espera respuesta"). Un filtro que solo mira "quedan <2h" pero ignora el `last_outbound` mostraría conversaciones que el cron NO notifica.

### 2. Helper en el lenguaje del cliente, umbral como constante nombrada

```ts
// src/lib/inbox/window.ts
export const WINDOW_TOTAL_MS = 24 * 60 * 60 * 1000;
export const WINDOW_CLOSING_LEAD_MS = 2 * 60 * 60 * 1000; // quedan <2h

export function isWindowClosing(conv, nowMs) {
  const inbound = new Date(conv.lastInboundAt).getTime();
  const age = nowMs - inbound;
  if (age < WINDOW_TOTAL_MS - WINDOW_CLOSING_LEAD_MS) return false; // sobra margen
  if (age >= WINDOW_TOTAL_MS) return false;                        // ya venció
  if (conv.lastOutboundAt && new Date(conv.lastOutboundAt) >= new Date(conv.lastInboundAt)) return false;
  return true;
}
```

### 3. Cross-reference bidireccional en comentarios

El helper TS apunta a la función/migración SQL; el SQL apunta (o referencia el mismo número con un comentario). El objetivo es que quien edite uno **vea** que hay un espejo.

```ts
// ⚠️ FUENTE ÚNICA: estos umbrales DEBEN coincidir con 0027 (notif_scan_closing_windows).
// Si cambiás uno, cambiá el otro.
```

### 4. Verificar la equivalencia contra la DB viva

Corré el predicado SQL **exacto** del cron sobre la base y contá. Ese número es lo que el filtro TS debe dar para el mismo instante. No te fíes de "se ve igual".

```sql
count(*) filter (
  where last_inbound_at <= now() - interval '22 hours'
    and last_inbound_at >  now() - interval '24 hours'
    and (last_outbound_at is null or last_inbound_at > last_outbound_at)
)
```

### 5. Función pura + `now` inyectado

El helper recibe `nowMs` como parámetro (no llama `Date.now()` dentro) → es puro, testeable, y no se vuelve impuro en el render. El componente que filtra tiene su propio reloj (un `setInterval` de 1 min) y le pasa el `now`.

## Output esperado

1. Un helper puro en `src/lib/<dominio>/` con el umbral como **constante nombrada** (no número mágico).
2. Cross-reference en comentario hacia la migración/función SQL **y** viceversa.
3. El predicado replicado COMPLETO (todas las condiciones, no solo el número).
4. Verificación numérica contra la DB: el SQL del cron y el helper TS coinciden para el mismo instante.
5. Cero duplicación de números sueltos en componentes: todos importan el helper/constante.

## Ejemplo concreto (Momentum CRM, M7, 2026-06-22, PR #56)

- Helper: [crm-v2/src/lib/inbox/window.ts](crm-v2/src/lib/inbox/window.ts) — `isWindowClosing` + `WINDOW_TOTAL_MS`/`WINDOW_CLOSING_LEAD_MS`.
- Espejo SQL: `crm-v2/supabase/migrations/0027_notifications_event_set.sql` (`notif_scan_closing_windows`).
- Consumidor: [crm-v2/src/components/inbox/conv-list.tsx](crm-v2/src/components/inbox/conv-list.tsx) — chip "Por cerrarse" + reloj de 1 min.
- Verificación: el `count(*) filter (...)` con el predicado del cron dio 0 conversaciones en la franja → el chip mostró "Por cerrarse 0" (coincidente).

## Gotchas / antipattern

- **NO** copies solo el número del umbral: copiá el **predicado completo** (las dos puntas + condiciones acompañantes). Un número solo casi nunca define la pertenencia.
- **NO** dejes el número mágico suelto en el componente. Constante nombrada + comentario, o vuelve el drift.
- **NO** asumas equivalencia "a ojo": corré el SQL exacto contra la base y compará el conteo.
- **NO** llames `Date.now()` dentro del helper. Inyectá `now` para mantenerlo puro y para que el componente controle el reloj (un solo `setInterval`, no uno por fila).
- **OJO**: si el estado depende del tiempo (una franja móvil), el filtro necesita un reloj que avance (ej. `setInterval` 60s) o el count se queda viejo hasta el próximo render.

## Skills relacionadas

- `fuente-unica-derivar-de-hijos` — la otra cara de "una sola verdad" (derivar en vez de sincronizar).
- `verificar-funcionamiento-end-to-end` — verificar el helper contra el predicado vivo de la DB.
- `crm-inbox-conv-list-filters-strip` — el strip de filtros donde vive el chip que consume el helper.
