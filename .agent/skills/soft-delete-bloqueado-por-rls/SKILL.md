# Skill: La papelera que no borra — soft-delete bloqueado por su propia RLS

## Cuándo usar esta skill

- Implementaste **papelera / archivar / soft-delete** (`deleted_at`, `archivado`, `activo=false`)
  y la acción **no toma**: la fila sigue ahí, sin error visible.
- Falla **hasta para el admin/owner**, y la policy dice `with check (true)`. (Ese combo es la firma.)
- Falla en lote **y** de a uno, en dos pantallas distintas — porque las dos llaman la misma función.
- Ves `42501: new row violates row-level security policy for table "X"` en un UPDATE que "obviamente"
  debería pasar.
- El **restaurar** de la papelera SÍ funciona pero el **borrar** no (o al revés). Señal fortísima:
  una de las dos rutas ya se arregló y nadie documentó por qué.

**Costo de no usarla:** en el CRM de Josué (2026-08-17) el borrado en lote llevaba semanas roto
**en silencio**. El cliente seleccionaba 40 leads, tocaba "Enviar a papelera", la pantalla se
refrescaba... y los 40 seguían ahí. Concluyó "el sistema no borra".

---

## Por qué existe esta skill

El soft-delete se muerde la cola con su propia RLS, y es tan poco intuitivo que se diagnostica mal
tres veces antes de acertar.

El patrón normal de soft-delete tiene **dos piezas**:

```sql
-- 1) La policy de SELECT esconde lo borrado (para eso existe el soft-delete)
create policy leads_select on leads for select
  using (deleted_at is null and <regla de dueño>);

-- 2) La policy de UPDATE parece permisiva
create policy leads_update on leads for update
  using (<regla de dueño>) with check (true);
```

Y sin embargo `update leads set deleted_at = now()` **falla**.

**El mecanismo:** en Postgres, un `UPDATE` bajo RLS tiene que poder **ver la fila resultante**.
Al escribir `deleted_at = now()`, la fila nueva deja de satisfacer la policy de SELECT
(`deleted_at is null`) — la estás haciendo desaparecer para vos mismo. Postgres rechaza la
operación con `42501`, y **un `with check (true)` no lo evita**, porque el conflicto no está en el
`WITH CHECK` de la policy de UPDATE sino en la interacción con la de SELECT.

Es el mismo mecanismo que "un agente reasigna una conversación a otro agente y falla, pero a `null`
funciona" (ver `rls-write-bloqueada-por-policy-desalineada`, causa 3). Acá la fila no se mueve a
otro dueño: **se mueve fuera de tu propia visibilidad.**

Y es mudo porque el `catch` del cliente, o un `revalidatePath` optimista, hacen que la pantalla se
refresque igual.

---

## Proceso

### 1. Confirmar que es esto (5 minutos, contra la base real)

No teorices. Conectate con `pg` **con el rol de la sesión impersonado** y corré el UPDATE a mano:

```sql
set local role authenticated;
set local request.jwt.claims = '{"sub":"<uuid del admin>"}';
update leads set deleted_at = now() where id = '<uuid>';
-- si sale 42501 → es esto
```

Después repetí **con RLS apagada** (`set local role postgres`). Si con RLS off pasa y con RLS on
no, cerrado: es la policy, no tu código.

> **Nunca lo pruebes solo por la UI.** El refresco optimista muestra la fila desaparecida un
> instante y vuelve. Eso confunde y hace perder una hora.

### 2. Elegir el arreglo — hay dos, y no son equivalentes

**Opción A — mover el borrado a service role (la recomendada para papelera de admin).**

El borrado deja de ir por el cliente de sesión y pasa por la llave de servicio, **gateado en el
código** por el mismo permiso que tenía antes:

```ts
export async function deleteLeads(ids: string[]) {
  await requireAdmin()                       // ← el gate NO se pierde, se mueve al código
  const admin = createAdminClient()          // service role: la RLS no aplica
  const { error } = await admin
    .from("leads").update({ deleted_at: new Date().toISOString() }).in("id", ids)
  return error ? { ok: false, error: error.message } : { ok: true }
}
```

Por qué es la buena acá: el "restaurar" **ya** funciona así en casi todo proyecto (leer una fila
borrada exige saltarse la policy de SELECT). Poner el borrado del mismo lado deja las dos mitades
de la papelera con la misma forma, en vez de una simétrica rota.

**Opción B — abrir la policy de SELECT a los borrados para quien puede borrar:**

```sql
using ((deleted_at is null or is_admin(auth.uid())) and <regla de dueño>)
```

Elegila si el rol **también tiene que ver** la papelera en pantalla con su propia sesión. Cuesta
más: ahora todas las consultas de ese rol tienen que filtrar `deleted_at is null` a mano, y la que
te olvidés muestra basura borrada como si fuera real.

> Regla: si el rol necesita **ver** los borrados → opción B. Si solo necesita **ejecutar** el
> borrado → opción A.

### 3. Buscar las otras puertas a la misma función

Un soft-delete casi nunca tiene un solo botón. Grepeá la función:

```bash
grep -rn "deleteLeads\|deleted_at" app/ components/ lib/
```

En el CRM de Josué, arreglar el lote arregló **también** el botón "Eliminar" de la ficha
individual, que fallaba igual de mudo y estaba reportado como un bug aparte.

### 4. Verificar contra la base, no contra la pantalla

```sql
select id, deleted_at from leads where id in (...);  -- deleted_at NO nulo
select count(*) from leads where deleted_at is not null;
```

Y después restaurar uno, para probar el viaje de vuelta.

---

## Output esperado

- El borrado ejecuta y **persiste** (verificado con `select`, no con la UI).
- El gate de permisos sigue existiendo, ahora explícito en el código (`requireAdmin`).
- Todas las puertas a esa acción arregladas, no solo la reportada.
- Errores visibles: si falla, el usuario lee por qué.

---

## Gotchas / antipatrones

- 🔴 **Creer que `with check (true)` prueba que la policy no es.** Es justo el caso que despista.
- 🔴 **Usar service role sin gate.** Mover el borrado a la llave de servicio **sin** `requireAdmin`
  convierte un bug en un agujero: cualquier sesión borraría lo de cualquiera.
- 🔴 **Apagar la RLS de la tabla "mientras tanto".** Nunca vuelve a encenderse.
- ⚠️ **Diagnosticar por la UI.** El refresco optimista miente por diseño.
- ⚠️ **Arreglar solo el botón que reportaron.** El bug está en la función, no en el botón.
- ⚠️ Este mecanismo aplica a **cualquier** campo que te saque de tu propia visibilidad:
  `archivado`, `activo=false`, cambiar `owner_id` a otra persona, mover a un `tenant_id` ajeno.

---

## Ejemplo concreto (CRM Josué R. Miranda, #11, 2026-08-17)

**Síntoma:** seleccionar leads → "Enviar a papelera" → nada, sin error. Igual para el admin.

**Descarte:** no era el gate de rol, no era el `in()`, no era el `revalidatePath`. Se comprobó
impersonando al admin contra la base real con RLS on/off.

**Fix:** `deleteLeads` en `table-actions.ts` pasa a `createAdminClient()`, ya gateado por
`requireAdmin` (el "restaurar" ya lo hacía desde antes). **Bonus:** arregló el botón "Eliminar"
de la ficha del lead, reportado como bug aparte. Commit `ebc6d67`, EN VIVO.

---

## Skills relacionadas

- `rls-write-bloqueada-por-policy-desalineada` — la familia completa de escrituras que la RLS
  bloquea sin avisar (`USING` vs `WITH CHECK`, triggers que propagan RLS).
- `detectar-escritura-filtrada-rls` — cómo darte cuenta de que una escritura se filtró en silencio.
- `acciones-en-lote-seguras` — el patrón de acciones sobre muchas filas.
- `rol-aislado-cartera-rls` — RLS por dueño y la trampa de la "cola abierta".
