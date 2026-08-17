# Skill: Manejo de dinero multi-moneda en apps financieras (precisión + moneda nativa + saldo en vivo)

## Cuándo usar esta skill

- Construís cualquier app que maneje **plata** (finanzas personales, billeteras, POS, facturación).
- Necesitás mostrar montos en **distintas monedas** (₡/$), o que cada cuenta tenga la suya.
- Querés que el **saldo refleje los movimientos** sin descuadrarse ni "inventar plata".

Junta 3 patrones que en una app financiera son no-negociables. Saltarse cualquiera = plata fantasma = pérdida de confianza inmediata.

## Por qué existe (los 3 bugs que evita)

1. **Redondear en la lectura inventa/destruye plata.** `Math.round(6950/100)` = `Math.round(69.5)` = **70** → aparecieron ₡0.50 de la nada y se borraron los centavos de cualquier monto USD.
2. **Forzar una sola moneda confunde.** Si una cuenta es en dólares, mostrarla convertida a colones (y que fluctúe con el FX) es mentir sobre cuánto tenés.
3. **Sumar movimientos sin punto de referencia hace doble conteo.** Si el saldo = snapshot − todos los gastos, los gastos previos al snapshot se restan dos veces.

## Proceso

### 1. Precisión: centavos enteros + división exacta + redondeo solo al formatear

```ts
// Guardar/leer: SIEMPRE enteros de centavos. Conversión EXACTA, sin Math.round.
const toCents   = (x: number) => Math.round(Math.abs(x) * 100); // al ESCRIBIR (nivel centavo)
const toUnits   = (cents: number) => cents / 100;               // al LEER — NUNCA Math.round acá

// Redondear SOLO al mostrar (en el formateador), nunca en el dato:
function money(ccy: string, n: number) {
  const v = Math.abs(n);
  if (ccy === "USD") return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return "₡" + Math.round(v).toLocaleString("de-DE"); // colones sin céntimos: redondeo de DISPLAY
}
```

**Regla de oro:** el redondeo solo puede vivir en la capa de formato visual. Si redondeás el valor que guardás o leés, vas a crear o perder plata.

### 2. Moneda NATIVA por cuenta

- Cada cuenta guarda su `currency` (CRC/USD) y su `balance` **en esa moneda nativa** (centavos de esa moneda).
- Se **muestra siempre en su moneda** (sin importar la divisa de visualización del sistema), con el **equivalente** chico debajo (≈ en la otra moneda).
- Los **agregados** (patrimonio, "libre para gastar") se convierten todos a una moneda base (ej. colones) con `balanceCrc(a)` y se muestran en la divisa del sistema.

```ts
const balanceCrc = (a) => a.currency === "USD" ? Math.round((a.balance||0) * FX) : (a.balance||0);
// patrimonio = Σ balanceCrc(a)  → mostrar con el formateador en la divisa del sistema
// fila de cuenta = money(a.currency, a.balance)  + "≈ " + money(otra, convertido)
```

### 3. Saldo EN VIVO derivado (no mutado)

El saldo que el usuario fija es un **punto de partida con fecha** (`balance_as_of`). El saldo mostrado se **deriva**:

```ts
// saldo vivo = snapshot + Σ(movimientos ligados a la cuenta DESPUÉS del snapshot)
for (const a of ACCOUNTS) {
  const snap = a.snapshot ?? a.balance;
  const since = a.snapshotAt ? new Date(a.snapshotAt).getTime() : Date.now();
  let delta = 0;
  for (const t of TX) {
    if (!ligadoA(t, a) || !t.at) continue;
    if (new Date(t.at).getTime() <= since) continue;  // anterior al snapshot → ya incluido
    delta += a.currency === "USD" ? t.amt / FX : t.amt; // tx en moneda base → moneda de la cuenta
  }
  a.balance = a.currency === "USD" ? Math.round((snap+delta)*100)/100 : Math.round(snap+delta);
}
```

**Por qué derivado y no mutado:** editar/borrar un movimiento recalcula solo (cero lógica de "revertir", cero estados inconsistentes). El `balance_as_of` (default `now()` al migrar) hace que **lo ya importado no mueva el saldo** → cero doble conteo. Cada vez que el usuario re-fija el saldo, `balance_as_of` se actualiza.

### 4. Migración para introducirlo sin romper data existente

```sql
alter table accounts add column if not exists balance_as_of timestamptz not null default now();
-- cuentas existentes quedan "as of ahora" → todos los movimientos previos quedan baked-in
```

## Output esperado

- Ningún monto cambia por redondeo en un round-trip guardar→leer→guardar.
- Cada cuenta se ve en su moneda; el patrimonio sigue la divisa del sistema.
- Agregar/editar/borrar un movimiento ajusta el saldo solo, sin descuadre ni doble conteo.

## Gotchas / antipattern

- **NO** `Math.round(cents/100)` al leer. Usá `cents/100`.
- **NO** guardar dinero en `float` ni hacer cálculos en float; centavos enteros.
- **NO** mostrar una cuenta USD convertida a colones como su saldo principal (fluctúa con el FX → "perdió/ganó plata sola").
- **NO** mutar el `balance` guardado en cada movimiento (te obliga a revertir en cada edición/borrado y se descuadra). Derivalo.
- **NO** sumar movimientos sin un `balance_as_of` → doble conteo con lo ya importado.
- **SIEMPRE** validar el round-trip y que no haya drift al introducir cualquier feature de montos.

## Ejemplo concreto (Mi Menudo, en producción 2026-06-20)

- Bug real: cuenta USD con $69.50 (6950 centavos) → `toColones` redondeaba a $70 (plata fantasma) y borraba centavos. Fix: `toColones = cents/100`.
- Moneda nativa + equivalente: [src/components/vera/screens/cuentas.tsx](src/components/vera/screens/cuentas.tsx), helpers `moneyIn`/`balanceCrc` en [src/components/vera/lib/data.ts](src/components/vera/lib/data.ts).
- Saldo vivo: `recomputeDerived()` en data.ts + migración [supabase/migrations/0007_account_balance_as_of.sql](supabase/migrations/0007_account_balance_as_of.sql).
- Memoria del founder relacionada: "Dinero: nunca redondear en display".

## Skills relacionadas

- `tipo-de-cambio-real-bccr-hacienda` — el FX real con que se convierte ₡↔$.
- `supabase-edge-function-secret-auth` — si la ingesta de montos entra por edge function.
