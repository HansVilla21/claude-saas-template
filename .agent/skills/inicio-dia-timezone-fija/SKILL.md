# Skill: "Hoy" / inicio de día anclado a una timezone fija (no al runtime)

## Cuándo usar esta skill

- Tenés un filtro o agregación por **"hoy" / "este día"** (dashboard, métricas, reportes) y el negocio vive en **una zona horaria conocida** (un país sin DST, o con una TZ de referencia).
- El cálculo del inicio de día usa `new Date(x).setHours(0,0,0,0)` o `date.getHours()` → **depende de la TZ del proceso que corre el código**.
- Síntoma: el filtro "Hoy" se come los registros de la tarde/noche, o muestra de más, **a ciertas horas** — especialmente cerca de medianoche. Funciona en tu máquina (TZ local = la del negocio) pero falla en producción.

## Por qué existe esta skill

(Momentum CRM, M5, 2026-06-22) El dashboard es un client component, pero `periodStartMs('today')` calculaba el inicio del día con `setHours(0,0,0,0)`, que usa la **TZ local del runtime**. En el server de Vercel (UTC) "Hoy" arrancaba a las `00:00 UTC` = `18:00` del día anterior en Costa Rica (UTC-6). Resultado: a la tarde/noche CR, "Hoy" filtraba el día UTC y dejaba **0 leads** aunque habían entrado 2 ese día. Verificado contra prod: con el bug `0/2`, con el fix `2/2`.

El negocio es de Costa Rica → "hoy" significa "hoy en Costa Rica", **corra donde corra el código** (server UTC, navegador del founder, o un dispositivo de viaje en otra zona). La solución es anclar el corte de día a la TZ fija con **aritmética de offset**, sin depender de `setHours`/`getHours` locales.

## El patrón

### 1. Centralizar el offset y el helper de inicio de día

```ts
// src/lib/format/tz.ts — Costa Rica = UTC-6 fijo (sin DST).
const COSTA_RICA_OFFSET_MS = -6 * 60 * 60 * 1000;

// Inicio del día CR para `ms` (epoch UTC), devuelto como epoch UTC. DETERMINISTA.
export function startOfDayCostaRicaMs(ms: number): number {
  const cr = new Date(ms + COSTA_RICA_OFFSET_MS);            // "mover" a hora CR
  const start = Date.UTC(cr.getUTCFullYear(), cr.getUTCMonth(), cr.getUTCDate(), 0, 0, 0);
  return start - COSTA_RICA_OFFSET_MS;                       // volver a epoch UTC
}
```

La clave: se usa `getUTC*` sobre un instante **desplazado por el offset**, nunca `getHours`/`setHours` (que leen la TZ del proceso).

### 2. Reemplazar TODOS los cortes de día por el helper

`periodStartMs('today')`, el `startOfDay` de las tendencias, los buckets por día — todos al mismo helper. Si quedan dos formas de calcular "inicio de día", vuelven a divergir.

### 3. Formateo de etiquetas también en la TZ fija

Las labels de fecha (`toLocaleDateString`) también dependen de la TZ del runtime salvo que le pases `timeZone`:

```ts
new Date(ms).toLocaleDateString('es', { day: '2-digit', month: 'short', timeZone: 'America/Costa_Rica' });
```

### 4. Verificar contra la DB con el mismo corte

Postgres tiene el corte correcto a mano; usalo como verdad para validar el helper:

```sql
select date_trunc('day', now() at time zone 'America/Costa_Rica') at time zone 'America/Costa_Rica';
-- ej. 2026-06-21 06:00:00+00  ← debe ser idéntico a startOfDayCostaRicaMs(now)
```

## Output esperado

1. Un helper `startOfDay<Zona>Ms(ms): number` (y/o su variante ISO) que NO usa `setHours`/`getHours` locales.
2. El offset de la zona en UNA constante (asumiendo zona sin DST; si hay DST, usar `Intl`/una lib, ver gotcha).
3. Todos los cortes de día del módulo apuntando al helper (filtro de período + tendencias + buckets).
4. Labels formateadas con `timeZone` explícito.
5. Verificación: el helper coincide con `date_trunc('day', now() at time zone '<Zona>')` de Postgres.

## Ejemplo concreto (Momentum CRM, M5, 2026-06-22, PR #54)

- Helper: [crm-v2/src/lib/format/tz.ts](crm-v2/src/lib/format/tz.ts) — `startOfDayCostaRicaMs` (+ `startOfDayCostaRicaIso` reusándolo).
- Consumidores: [crm-v2/src/lib/dashboard/funnel.ts](crm-v2/src/lib/dashboard/funnel.ts) — `periodStartMs('today')`, `startOfDay` de la tendencia, `fmtDay` con `timeZone`.
- Verificación: helper devolvió `2026-06-21T06:00Z` = idéntico al `date_trunc` de la DB; los 2 leads de hoy pasaron de `0/2` (bug) a `2/2` (fix).

## Gotchas / antipattern

- **NO** uses `setHours(0,0,0,0)` ni `getHours()`/`getDate()` para cortes de día en código que puede correr en server (UTC) o en navegadores en otra TZ. Es la causa raíz.
- **NO** confíes en "anda en mi máquina": tu navegador suele estar en la TZ del negocio, así que el bug **solo aparece en prod / a ciertas horas**. Probá con un `now` de la noche.
- **NO** olvides el `timeZone` en `toLocaleDateString`/`toLocaleString` de las etiquetas: también leen la TZ del runtime.
- **OJO con DST**: el patrón de offset fijo vale para zonas SIN horario de verano (Costa Rica, etc.). Si la zona tiene DST, no uses un offset constante — usá `Intl.DateTimeFormat(..., { timeZone })` para derivar año/mes/día, o una librería de fechas con TZ.
- **MULTI-PAÍS futuro**: si vas a soportar varias zonas, el helper debe tomar la zona como parámetro (ej. desde `agency.timezone`); arrancá con la fija pero dejá la firma lista.

## Skills relacionadas

- `umbral-compartido-cron-cliente` — otro caso de "el cliente y el SQL tienen que coincidir" (ahí, un umbral; acá, el corte de día).
- `verificar-funcionamiento-end-to-end` — validar el helper contra el `date_trunc` de la DB.
