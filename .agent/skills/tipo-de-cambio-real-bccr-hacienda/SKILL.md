# Skill: Tipo de cambio REAL del dólar en Costa Rica (BCCR vía Hacienda) — dinámico y cacheado

## Cuándo usar esta skill

- Una app que maneja **colones y dólares** y necesita el **tipo de cambio real del día** (no un valor fijo inventado).
- Estás en Costa Rica (fuente BCCR), pero el patrón (endpoint propio + fallback + caché) sirve para cualquier FX.
- Tenés una SPA cliente y no querés pegarle a la fuente externa desde el browser (CORS, rate limits).

## Por qué existe

Hardcodear el FX (ej. `FX = 510`) se desvía rápido de la realidad (el real estaba en ~₡455 → ₡55 de error). En una app financiera eso descuadra todo. La fuente oficial CR es el **BCCR**, pero su web service es SOAP con registro. La salida limpia: el **Ministerio de Hacienda expone el dato del BCCR en JSON, sin API key**. Se consume desde un **endpoint propio** (mismo origen → sin CORS) con caché, y un fallback por si la fuente cae.

## Proceso

### 1. Endpoint propio (server-side) con fuente primaria + fallback + caché

```ts
// src/app/api/fx/route.ts  (Next.js route handler)
export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // corre en runtime, NO se hornea en build
const TTL = { next: { revalidate: 21600 } } as const; // 6h (el BCCR cambia 1 vez/día hábil)

async function fromHacienda() {
  const r = await fetch("https://api.hacienda.go.cr/indicadores/tc/dolar", { headers: { accept: "application/json" }, ...TTL });
  if (!r.ok) throw new Error("hacienda_" + r.status);
  const j = await r.json();                 // { venta:{fecha,valor}, compra:{fecha,valor} }
  const venta = Number(j?.venta?.valor);
  if (!(venta > 0)) throw new Error("payload");
  return { rate: venta, compra: Number(j?.compra?.valor)||null, venta, date: j?.venta?.fecha??null, source: "BCCR" };
}
async function fromErApi() {
  const r = await fetch("https://open.er-api.com/v6/latest/USD", { ...TTL });
  const j = await r.json();
  const crc = Number(j?.rates?.CRC);
  if (!(crc > 0)) throw new Error("payload");
  return { rate: crc, compra: null, venta: crc, date: j?.time_last_update_utc??null, source: "open.er-api" };
}
export async function GET() {
  for (const src of [fromHacienda, fromErApi]) {
    try { return Response.json(await src(), { headers: { "Cache-Control": "public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400" } }); }
    catch { /* siguiente fuente */ }
  }
  return Response.json({ rate: null, error: "all_sources_failed" }, { status: 200 });
}
```

> Usar `venta` para convertir ₡→$ (lo que pagás por comprar un dólar) es la elección estándar y conservadora.

### 2. FX dinámico en el cliente: mutable + caché en localStorage + fallback

```ts
export let FX_DISPLAY: number = (() => { try { const c = localStorage.getItem("mm_fx"); const n = c?parseFloat(c):NaN; return n>0?n:455; } catch { return 455; } })();
export let FX_DATE: string | null = (() => { try { return localStorage.getItem("mm_fx_date"); } catch { return null; } })();
export function setFxRate(rate, date, source) {
  if (!(rate > 0)) return;
  FX_DISPLAY = rate;
  try { localStorage.setItem("mm_fx", String(rate)); if (date) localStorage.setItem("mm_fx_date", date); } catch {}
  window.dispatchEvent(new Event("tx-updated")); // re-render
}
export async function fetchFxRate() {
  try { const j = await (await fetch("/api/fx")).json(); if (j?.rate > 0) setFxRate(j.rate, j.date, j.source); } catch {}
}
// En el arranque de la app (no bloquea el render):
useEffect(() => { hydrate(); fetchFxRate(); }, []);
```

`FX_DISPLAY` es `export let` (live binding ESM): al reasignarlo, todos los que lo importan leen el valor nuevo al re-renderizar. El fallback inicial (455) es solo para el primer arranque sin caché.

### 3. Transparencia en la UI

Mostrar la tasa y su fecha donde el usuario elige moneda: *"Tipo de cambio: 1 US$ ≈ ₡455,14 · BCCR · al 2026-06-19. Se actualiza solo a diario."* Genera confianza.

## Output esperado

- `/api/fx` responde `{ rate, compra, venta, date, source }` con el dato real del día (probado en prod).
- La conversión ₡↔$ en toda la app usa el valor real en vivo, cacheado, resiliente a caídas.
- Si la fuente cae o no hay internet: usa el último valor cacheado (o el fallback inicial).

## Gotchas / antipattern

- **NO** dejar el route handler como estático: si Vercel lo prerenderiza en build, congela la tasa al momento del build. Usar `dynamic = "force-dynamic"` (sale como `ƒ`, no `○`).
- **NO** pegarle a Hacienda/BCCR desde el browser (CORS + rate limit): siempre vía endpoint propio.
- **NO** hardcodear el FX en cálculos de plata. Que sea dinámico.
- Cuidá la **precisión**: el FX puede tener decimales; combinalo con la skill `dinero-multimoneda-app-financiera` (centavos enteros, no redondear en lectura).
- Verificá la fuente cada tanto: la estructura de la respuesta de Hacienda podría cambiar (por eso el fallback).

## Ejemplo concreto (Mi Menudo, en producción 2026-06-20)

- Endpoint: [src/app/api/fx/route.ts](src/app/api/fx/route.ts) — Hacienda (`api.hacienda.go.cr/indicadores/tc/dolar`) + fallback `open.er-api.com`, caché 6h.
- Cliente: `FX_DISPLAY`/`fetchFxRate`/`setFxRate` en [src/components/vera/lib/data.ts](src/components/vera/lib/data.ts); disparado en [src/components/vera/App.tsx](src/components/vera/App.tsx).
- Verificado en prod: `GET https://www.mimenudo.com/api/fx` → `{"rate":455.14,"venta":455.14,"compra":450.06,"date":"2026-06-19","source":"BCCR"}`.

## Skills relacionadas

- `dinero-multimoneda-app-financiera` — usa este FX para convertir saldos y agregados con precisión.
