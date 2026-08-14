# Skill: Detectar la escritura que la RLS filtró (el write que no avisa)

## Cuándo usar esta skill

- Estás escribiendo (o revisando) **cualquier UI optimista** que hace `update` / `delete` con supabase-js desde el navegador, bajo RLS.
- Un usuario reporta que un control "no obedece": cambia el valor, se ve el cambio, y **vuelve solo** — sin error, sin toast, sin nada en la consola.
- Estás por escribir `if (error) { rollback() }` y pensás que con eso alcanza.
- Vas a hacer un `update` **sobre muchas filas** y querés decirle al usuario cuántas cambiaron **de verdad**.

## Por qué existe esta skill

Capturada el **2026-08-13** en el CRM de Momentum, después de que **el mismo modo de fallo se cobrara tres incidentes distintos** (Givi con `leads_update`, las etiquetas de los agentes, y los leads del pool).

El hecho central, y es contraintuitivo:

> Bajo RLS, un `update` que **no matchea** la policy **NO devuelve error**.
> Afecta **cero filas** y responde **éxito**.

O sea:

```ts
const { error } = await supabase.from('leads').update({ stage_id }).eq('id', id);
if (error) rollback();   // ← nunca entra. `error` es null. No cambió NADA.
```

Con una UI optimista, el resultado para el usuario es: el valor se pinta, el rollback no dispara (porque "no hubo error"), y el estado local queda **mintiendo** hasta el próximo refresh. O peor: el rollback dispara por otra razón y el control "se revierte solo" sin explicación.

Es distinto del `42501`. Ese sí lanza — pero solo lo lanza el **`WITH CHECK`** (validación del estado final). El **`USING`** (qué filas alcanzás) **filtra en silencio**.

| Cláusula | Qué controla | Cómo falla |
|---|---|---|
| `WITH CHECK` | el estado final de la fila | lanza `42501` ✅ visible |
| **`USING`** | **qué filas alcanzás** | **0 filas, sin error** ❌ invisible |

## Proceso

### 1. Pedir las filas de vuelta — `error` no alcanza

La única forma de saber si algo cambió es que la base te lo diga:

```ts
const res = await supabase
  .from('leads')
  .update({ stage_id: value })
  .eq('id', leadId)
  .select('id');          // ← esto no es decorativo
```

### 2. Interpretar los TRES resultados posibles

```ts
export function readWriteResult(res: { data: unknown[] | null; error: { message: string } | null }) {
  if (res.error) {
    const blocked = /42501|row-level security|permission denied/i.test(res.error.message);
    return { ok: false, blocked, message: blocked ? SIN_PERMISO : 'No se pudo guardar el cambio' };
  }
  // sin error Y sin filas = la policy filtró. ESTE es el caso silencioso.
  if (!res.data || res.data.length === 0) return { ok: false, blocked: true, message: SIN_PERMISO };
  return { ok: true };
}
```

Distinguir **bloqueado** de **falló** importa: al usuario le sirven mensajes distintos. *"No se pudo guardar"* manda a reintentar; *"no te corresponde"* manda a pedirle la conversación a un compañero.

### 3. ⚠️ Dónde NO se puede usar `.select()`

**Cuando la escritura vuelve la fila invisible para quien la hizo.** El `RETURNING` pasa por la policy de **SELECT**: si reasignás una conversación a otra persona y tu policy de SELECT solo te deja ver las tuyas, el `RETURNING` viene **vacío aunque el update haya funcionado**.

Detectarlo es fácil: preguntate *"después de este cambio, ¿la fila sigue matcheando mi policy de SELECT?"*. Si la respuesta es no, `.select()` te va a dar un **falso negativo**.

Solución para esos casos: **server action** con `admin client` que devuelva su propio `{ ok }` — nunca inferir el resultado del RETURNING. Y **dejarlo comentado en el código**, o alguien lo va a "arreglar" agregando el `.select()` que rompe.

### 4. Que el usuario se entere

Rollback **+ toast**. El rollback solo, sin mensaje, es el bug: el usuario ve el control moverse y volver, y concluye que el sistema está roto.

```ts
const outcome = readWriteResult(res);
if (!outcome.ok) {
  onPatch(id, prev);            // rollback
  toast.error(outcome.message); // ← la mitad que faltaba
}
```

### 5. Verificar con el control negativo que importa

Un test que pasa con y sin el fix no prueba nada. **El control negativo es la comprobación vieja:**

```ts
const comoAntes = (res) => !res.error;
check('mirar solo `error` declara EXITOSO el caso filtrado',
  comoAntes({ data: [], error: null }) === true &&
  readWriteResult({ data: [], error: null }).ok === false);
```

Y agregá que un error de **red** no se disfrace de "no tenés permiso".

## Output esperado

- Todas las escrituras optimistas piden `.select()` y **cuentan filas**.
- Un helper compartido (`lib/supabase/write-guard.ts`) — no la lógica copiada en 8 lugares.
- Los casos donde `.select()` NO sirve, resueltos por server action **y comentados**.
- Un verify script con el control negativo de la comprobación vieja.

## Ejemplo

**Input:** un agente cambia el estado de un lead del pool. La UI lo pinta y vuelve solo.

**Antes:**
```ts
const { error } = await supabase.from('leads').update({...}).eq('id', id);
if (error) rollback();     // error === null → no rollback, no mensaje, estado local mintiendo
```

**Después:**
```
❌ No tenés permiso para cambiar esto.
   Si la conversación es de otra persona, pedile que te la pase.
```
…y el control vuelve a su valor real. El agente sabe **qué pasó** y **qué hacer**.

## Regla de oro

**`error === null` no significa "se guardó". Significa "no se rompió".**
Si no contaste las filas, no sabés si cambió algo — y tu UI optimista está afirmando algo que la base nunca confirmó.

## Skills relacionadas

- `rls-write-bloqueada-por-policy-desalineada` — la **causa** detrás del síntoma (por qué la policy filtra).
- `probar-migracion-contra-base-viva-con-rollback` — probar el fix bajo el rol real antes de aplicarlo.
- `acciones-en-lote-seguras` — el mismo problema multiplicado por N filas, donde además hay resultados **parciales**.
- `debugging-silent-errors` — la familia general de fallos que no gritan.
