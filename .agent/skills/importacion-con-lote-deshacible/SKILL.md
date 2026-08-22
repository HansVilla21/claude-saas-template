# Skill: Importación con lote deshacible (el `import_batch_id` que salva la base)

## Cuándo usar esta skill

- Vas a construir un **importador**: Excel/CSV de contactos, catálogo de productos, histórico de
  ventas, una migración desde otro sistema.
- El cliente va a subir el archivo **él mismo**, sin vos mirando.
- Ya existe un importador y alguien preguntó *"¿y si me equivoco de archivo?"*.
- El cliente importó y ahora tiene 2.500 filas nuevas mezcladas con las viejas y **no sabe cuáles
  son cuáles**.

**Costo de no usarla:** el cliente sube el archivo equivocado (o el mismo dos veces) y la única
salida es que vos entres a la base a limpiarlo a mano — comparando por fecha de creación, que es
un proxy y no una prueba. Mientras tanto el sistema está mintiendo: los tableros cuentan filas
duplicadas.

---

## Por qué existe esta skill

**Una importación es la operación de escritura más grande que un cliente ejecuta solo**, y casi
siempre es la única que no tiene vuelta atrás.

El reflejo es deshacer por fecha: *"borrá lo creado después de las 3pm"*. No sirve, y falla justo
cuando importa: entre las 3 y las 3:05 también entraron leads del formulario web, del webhook de
Instagram y uno que cargó una asistente a mano. `created_at` **no distingue el origen**.

La solución es una línea de esquema: **cada importación lleva un id propio, y toda fila que entra
por ella queda estampada**. A partir de ahí el lote es una cosa nombrable: se puede filtrar, se
puede contar, y se puede deshacer entero, exacto.

Y hay una segunda razón, de producto: **poder deshacer es lo que hace que el cliente se anime a
importar.** Sin ese botón, el archivo grande se queda sin subir "por si acaso" durante semanas.

---

## Proceso

### 1. Una columna, una migración

```sql
alter table leads add column import_batch_id uuid;
create index leads_import_batch_id_idx on leads (import_batch_id)
  where import_batch_id is not null;
```

Nullable a propósito: lo que **no** entró por importación no tiene lote.

> **No rellenes hacia atrás.** Las filas viejas no pertenecen a ninguna importación conocida —
> inventarles un lote sería inventar un hecho. Quedan sin lote y **no se pueden deshacer**, que
> es la verdad. Decilo en la UI.

### 2. El id se genera una vez por corrida, en el servidor

```ts
const importBatchId = crypto.randomUUID()
// ...toda fila de esta corrida lleva import_batch_id: importBatchId
```

Si el importador procesa por tandas, **el id es el mismo para todas**. Un id por tanda rompe
exactamente lo que vinimos a arreglar.

### 3. El deshacer, en los dos lugares donde se necesita

**a) Al final del importador**, como último paso del asistente:
> *"Se importaron 2.525 leads. **Deshacer esta importación**"*

Es el momento en que el cliente ve el resultado y detecta que subió el archivo equivocado.

**b) En la lista, como aviso de la última importación** — porque el error se descubre **al día
siguiente**, no en el minuto:
> *"Última importación: 2.525 leads, 17/08 3:04pm — **Ver solo estos** · **Deshacer**"*

`Ver solo estos` es un filtro por `import_batch_id`. Es la mitad más usada de la feature: casi
siempre el cliente no quiere deshacer, quiere **mirar qué entró**.

### 4. Deshacer = a la papelera, no `DELETE`

```ts
export async function undoImport(batchId: string) {
  await requireAdmin()
  const admin = createAdminClient()          // ver skill del soft-delete + RLS
  const { data, error } = await admin
    .from("leads")
    .update({ deleted_at: new Date().toISOString() })
    .eq("import_batch_id", batchId)
    .is("deleted_at", null)                  // idempotente: no re-borra
    .select("id")
  return error ? { ok: false, error: error.message } : { ok: true, cuantos: data.length }
}
```

- **Papelera, nunca borrado duro.** Si el cliente deshace por error, se restaura.
- **Gateado a admin.** Deshacer una importación es la acción más destructiva de la app.
- **Idempotente** (`.is("deleted_at", null)`): tocar dos veces no hace daño.
- **Devolvé cuántas filas** — y mostrá ese número, no el que esperabas. (Puede diferir: alguien
  ya borró algunas a mano.)

### 5. Decir lo que el deshacer NO deshace

Si la importación disparó efectos — asignaciones por round-robin, notificaciones, un contador —
el deshacer de las filas **no los revierte**. Dos opciones honestas: revertirlos también, o
**decirlo en el diálogo de confirmación**. Lo que no se hace es dejarlo implícito.

### 6. Confirmación con el número real

> *"Vas a enviar a la papelera **2.525 leads** de la importación del 17/08 3:04pm. Se pueden
> restaurar desde la papelera."*

El número sale de un `count` contra la base **en el momento de confirmar**, no del que guardaste
al importar.

---

## Output esperado

- Columna `import_batch_id` (nullable, indexada) + migración.
- Un id por corrida, estampado en todas las filas de esa corrida.
- "Deshacer" al final del importador **y** aviso de la última importación en la lista, con
  "Ver solo estos".
- Deshacer = papelera, gateado a admin, idempotente, devolviendo el conteo real.
- Dicho explícitamente qué queda fuera del deshacer (filas viejas sin lote, efectos laterales).

---

## Gotchas / antipatrones

- 🔴 **Deshacer por `created_at`.** Se lleva por delante lo que entró por otros canales en la
  misma ventana. Es el antipatrón que esta skill existe para matar.
- 🔴 **`DELETE` de verdad.** Un deshacer sin vuelta atrás es otro botón peligroso, no una red.
- 🔴 **Rellenar el lote hacia atrás con un uuid inventado.** Es fabricar un hecho.
- ⚠️ **Un id distinto por tanda.** Rompe el lote en pedazos y el deshacer se vuelve parcial.
- ⚠️ **Mostrar el conteo optimista.** El número de la confirmación se lee de la base.
- ⚠️ **Olvidar la RLS.** Poner `deleted_at` desde la sesión puede fallar hasta para el admin —
  ver `soft-delete-bloqueado-por-rls`.
- ⚠️ **Deshacer sin idempotencia.** El cliente toca dos veces cuando no ve respuesta inmediata.

---

## Ejemplo concreto (CRM Josué R. Miranda, #10, 2026-08-17)

**Input:** el cliente importa listas de leads desde Excel él mismo. Ya había subido **2.525** en
un lote que después hubo que mover de fuente ("Referidos" → "Base de Datos", migración 0034),
todo a mano contra la base porque no había forma de identificar el lote.

**Output:** migración **0035** con `leads.import_batch_id`; el importador lo estampa; paso final
"Deshacer esta importación"; en `/leads`, aviso de la última importación con "Ver solo estos" y
"Deshacer" (admin → papelera). `undoImport` / `getLastImport` en `import-actions.ts`. Los leads
anteriores quedan sin lote a propósito. Commit `455581b`, EN VIVO.

---

## Skills relacionadas

- `acciones-en-lote-seguras` — acciones masivas sobre una selección (la operación hermana).
- `soft-delete-bloqueado-por-rls` — por qué el "enviar a papelera" tiene que ir por service role.
- `datos-reales-vs-seed-demo` — cuando el sistema empieza a recibir datos reales.
- `demo-con-datos-falsos` — la regla general: el deshacer se escribe **antes** del cambio.
