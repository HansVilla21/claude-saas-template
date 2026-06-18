# Skill: Conectar un prototipo de UI a datos reales (mock → vivo)

## Cuándo usar esta skill

- Tenés una UI de prototipo (export de **Claude Design**, Figma-to-code, o un mock) con datos **hardcodeados** (constantes, arrays mock, números fijos) y querés conectarla a **Supabase** SIN reescribir la interfaz.
- La app "se ve bien" pero los números no son reales, el **perfil no se maneja** (nombre/correo del usuario), o "no es tan funcional" como debería.
- Querés mantener la fidelidad visual del prototipo y solo cambiar **de dónde salen los datos**.

## Por qué existe

El error típico es uno de dos extremos: (a) reescribir toda la UI desde cero perdiendo la fidelidad del diseño, o (b) dejar números mock que nunca se actualizan. Hay un patrón limpio: **mantené el store en memoria del prototipo como capa de render, y reemplazá su contenido con datos reales mutando las MISMAS referencias.** Los componentes no se tocan; solo cambia el origen de los datos.

## Proceso

### 1. Identificá los dos tipos de "dato mock"
- **Arrays/objetos** (lista de transacciones, cuentas, perfil): se pueden **mutar en su lugar** (misma referencia) → los componentes que los importan ven los datos nuevos en el próximo render.
- **Primitivos derivados** (`TOTAL = arr.reduce(...)`, calculados al cargar el módulo): un `const` capturado NO se actualiza para quien lo importó. Solución: `export let` + reasignar (los ES modules tienen *live bindings*), o recalcular y mutar un objeto/array.

### 2. Capa de datos: `db.ts`
```ts
// mappers: fila de DB → forma que espera la UI (convertir unidades acá, ej. céntimos→colones)
function rowToTx(r){ return { id:r.id, merchant:r.merchant_normalized, amt:toUnit(r.amount_cents), cat:r.category_id, /*…*/ }; }

// store en memoria = los MISMOS arrays que importan los componentes
import { TX, ACCOUNTS, PROFILE } from "@/components/lib/data";
function fillArray(arr, items){ arr.splice(0, arr.length, ...items); } // muta en su lugar (misma ref)

export async function hydrate(){
  const userId = (await supabase.auth.getUser()).data.user?.id; if(!userId) return;
  await seedStarterIfEmpty(userId);          // que el usuario nuevo no vea la app vacía
  await loadAll(userId);
}
async function loadAll(userId){
  const { data: tx } = await supabase.from("transactions").select("*").eq("user_id",userId);
  fillArray(TX, (tx||[]).map(rowToTx));      // los componentes ya ven datos reales
  recomputeDerived();                        // recalcular totales/derivados
  bump();                                    // forzar re-render
}
```

### 3. Perfil real (el detalle que casi siempre queda mock)
```ts
const { data:{ user } } = await supabase.auth.getUser();
if (user){ PROFILE.name = user.user_metadata?.full_name || user.email?.split("@")[0]; PROFILE.email = user.email; }
// PROFILE es un objeto const → mutar sus props funciona (los componentes ven el objeto actualizado)
```

### 4. Valores derivados en vivo (totales, "disponible", etc.)
```ts
// en data.ts: lo que era const calculado al cargar, pasa a let para poder reasignar
export let TOTAL_MES = SPEND.reduce((a,b)=>a+b.amt,0);
export let DISPONIBLE = 0;
export function recomputeDerived(){
  TOTAL_MES = SPEND.reduce((a,b)=>a+b.amt,0);                 // primitivo → reasignar (live binding)
  DISPONIBLE = ACCOUNTS.filter(a=>a.kind!=="credit").reduce((s,a)=>s+Math.max(0,a.balance),0);
  FIXED.splice(0, FIXED.length, ...computeBills());          // array derivado → splice (misma ref)
}
```
Regla: **arrays derivados → `splice` (misma ref); primitivos derivados → `let` + reasignar.** `db.ts` llama `recomputeDerived()` en cada carga y en cada escritura.

### 5. Re-render reactivo con un evento global
```ts
// db.ts
function bump(){ if (typeof window!=="undefined") window.dispatchEvent(new Event("data-updated")); }
// hook que cada pantalla usa para re-renderizar al cambiar los datos
export function useDataBump(){ const [,set]=React.useState(0); React.useEffect(()=>{ const h=()=>set(x=>x+1); window.addEventListener("data-updated",h); return ()=>window.removeEventListener("data-updated",h); },[]); }
```
Cada write (`addX`, `updateX`) persiste en Supabase + actualiza el array local + `recomputeDerived()` + `bump()`.

### 6. Fechas/saludos: computar, no hardcodear
El prototipo suele tener "Buenos días, Mariana" y "Sábado 14 de junio" quemados. Computalos en el componente: saludo por `new Date().getHours()`, fecha con `toLocaleDateString("es-CR",...)`, nombre del `PROFILE`.

## Output esperado
1. La UI del prototipo intacta, pero leyendo datos reales de Supabase.
2. Perfil (nombre/correo) real del usuario logueado.
3. Totales y derivados que se recalculan solos al cargar y al editar.
4. Estados vacíos resueltos con seed (la app no se ve "muerta" para el usuario nuevo).

## Ejemplo concreto (Mi Menudo — producción 2026-06-18)
- `data.ts` (mock del export de Claude Design) → `db.ts` la hidrata: `fillArray` para TX/ACCOUNTS/GOALS/RECURRING, `recomputeDerived()` para `SPEND_TOTAL/AVAIL/SAFE_TO_SPEND/RUNWAY/ANTS`, `PROFILE.name` del auth user.
- Resultado: el dashboard saluda "Buenas tardes, Hans", muestra "₡891.850 libre… ₡74.321/día durante 12 días" — todo calculado de cuentas/recurrentes reales + la fecha de hoy. Cero líneas de UI reescritas.

## Gotchas / antipattern
- **NO** reasignar un `const` exportado esperando que el importador vea el cambio. Primitivos derivados → `let`. Arrays → `splice` (no reasignar la referencia tampoco, salvo que uses live binding consistente).
- **NO** olvidar `recomputeDerived()` en cada carga Y en cada escritura.
- **NO** dejar el perfil/fechas hardcodeados del prototipo.
- **NO** romper la fidelidad: esta skill cambia la FUENTE de datos, no el diseño.
- **NO** dejar al usuario nuevo con la app vacía → `seedStarterIfEmpty` o un estado vacío que venda el valor.

## Skills relacionadas
- `auth-supabase-google-nativo` — el login que precede a `hydrate()`.
- `embudo-activacion-saas` — el camino del usuario donde encaja todo esto.
