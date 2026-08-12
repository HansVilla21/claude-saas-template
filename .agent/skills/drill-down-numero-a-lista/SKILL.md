# Skill: Drill-down — que un número lleve a la lista que lo compone (y que los dos digan lo mismo)

## Cuándo usar esta skill

- Un dashboard muestra un número agregado ("Clientes 7", "1 venta", "338 en conversación") y el usuario pide **ver quiénes son**.
- Vas a hacer clickeable cualquier métrica, KPI, barra o pill.
- Ya existe una pantalla de lista con filtros y estás por decidir entre **enlazar a ella** o **construir un modal nuevo**.

## Por qué existe esta skill

Capturada el **2026-08-11** en el CRM de Momentum, del pedido literal del founder: *"cuando sale 1 venta poder ver cuál es, o en el tag de clientes sale (7) poder ver cuáles 7 son"*.

**El riesgo real no es que el link no navegue.** Es que navegue a una lista con **otro número**. Si el dashboard dice 7 y la lista muestra 12, el usuario no piensa "qué raro este filtro": deja de creerle al dashboard entero. Un drill-down mal hecho es peor que no tener drill-down.

En esta implementación aparecieron **dos trampas concretas** que casi producen exactamente eso:

1. **Dos definiciones para el mismo nombre.** El KPI "Sin atender" contaba conversaciones con `handler='unassigned'`; el filtro "Sin asignar" de la lista contaba contactos sin encargado. Como toda conversación nacía con `handler='bot'` por default del schema, **no eran el mismo conjunto**. Ese número quedó **sin enlazar a propósito**.
2. **El link y el lector escritos en dos lados.** Si la pantalla de origen arma `?estado=` y la de destino lee `?stage=`, el filtro no se aplica y la lista abre mostrando **todo**. Falla en silencio y en la peor dirección: el usuario clickeó "7" y ve 449.

## Proceso

### 1. Decidir el destino: enlazar > construir

Si ya existe una pantalla de lista con filtros, **enlazar a ella**. Trae gratis la búsqueda, el orden, el export, la ficha de cada fila y el responsive. Un modal nuevo es una segunda lista que mantener y que se desincroniza.

Construir algo nuevo solo si el conjunto no es expresable con los filtros que la lista ya tiene.

### 2. Verificar que las dos pantallas cuenten LO MISMO

**Antes de escribir el link**, comparar las definiciones en el código:

| | Origen (dashboard) | Destino (lista) |
|---|---|---|
| ¿Qué filtra? | `created_at` en el período | ¿el mismo campo? |
| ¿Qué excluye? | borrados, archivados… | ¿lo mismo? |
| ¿Cómo define el estado? | estado actual | ¿igual? |

Si difieren: **no enlazar ese número**. Dejarlo inerte, escribir en el código POR QUÉ, y subir la divergencia como decisión de producto. Es mejor un número que no navega que uno que miente.

### 3. Fuente única para construir Y leer la URL

Un solo módulo puro exporta las dos mitades:

```ts
export const PARAM = { period: 'periodo', stage: 'estado', tags: 'etiqueta' } as const;

export function buildListHref(slug, opts): string { … }   // lo usa el dashboard
export function parseListFilters(searchParams, known): { … } // lo usa la lista
```

Así un rename toca un archivo y las dos puntas se mueven juntas. **Nunca** escribir los nombres de params en las dos pantallas por separado.

### 4. Validar los params contra los datos REALES

Un link viejo puede traer el id de un estado borrado o de un agente que ya no está. Aplicarlo daría una lista vacía sin explicación (*"¿se borraron mis contactos?"*).

**Regla:** lo que no existe **se ignora**, y la pantalla abre en un estado honesto. Se valida contra lo que la página ya cargó (`stages`, `members`), no contra una lista hardcodeada.

Excepción deliberada: las **etiquetas archivadas** SÍ se aceptan aunque no estén en el banco activo — que se pueda seguir filtrando por ellas es justamente su razón de existir.

### 5. Arrastrar TODO el recorte visible

El link tiene que llevar lo que el usuario está viendo, no solo el estado clickeado: **período + filtros activos**. Si el dashboard está en "30 días · etiqueta Preventa" y se clickea "Cliente", el destino tiene que ser esos tres filtros juntos. Si no, el total no coincide.

### 6. Los ceros no navegan

Una tarjeta en 0 queda inerte. No tiene sentido abrir una lista vacía.

### 7. Verificar el ROUND-TRIP, no la URL

Acá está el valor de la skill. **No** alcanza con `expect(href).toBe('/leads?estado=x')` — eso prueba que se armó un string.

Hay que recorrer el camino del usuario completo, con las funciones REALES de las dos pantallas:

```
computeAgregado(datos)        →  el número que ve el usuario
buildListHref(...)            →  el link
parseListFilters(...)         →  lo que el destino entiende
filtrarLista(...)             →  las filas que finalmente muestra
```

y exigir **número === filas**, para **cada valor × cada período**:

```ts
for (const period of PERIODOS) {
  for (const e of entradasDelAgregado(period)) {
    const filas = filasDespuesDeClickear(buildListHref(slug, { period, id: e.id }));
    if (filas !== e.count) reportar(period, e.name, e.count, filas);
  }
}
```

Cubrir además: link con un id borrado (no vacía la pantalla), valor inválido (se ignora), sin filtros (URL limpia), y el **caso de zona horaria** si hay "hoy" de por medio.

## Output esperado

- Los números del dashboard son links que llevan a la lista filtrada, arrastrando el recorte completo.
- Un script `verify-drilldown.ts` que prueba el round-trip y falla si algún número deja de coincidir con su lista.
- Los números cuya definición NO coincide con la del destino quedan **sin enlazar**, con el porqué escrito en el código y la divergencia anotada como pendiente.

## Gotchas

- **`mergeable`-style trampa conceptual:** que el link navegue no significa que lleve al conjunto correcto. Lo único que lo prueba es contar de los dos lados.
- **El estado inicial desde la URL va solo en el primer render.** Después la pantalla es dueña de su estado; tocar un filtro no debe reescribir la URL (salvo que se quiera esa feature aparte).
- **Los filtros tienen que verse PUESTOS al aterrizar.** Si la lista abre filtrada pero la barra se ve vacía, el usuario cree que ese es el total real.
- **Efecto secundario que conviene aprovechar:** una vez que la lista lee la URL, cualquier vista queda **compartible por link** y sobrevive al F5. Vale mencionarlo, suele ser más valorado que el drill-down mismo.

## Ejemplo

**Input:**
"En el Resumen sale «Cliente 7», quiero poder ver cuáles 7 son."

**Output:**

1. Se detecta que la lista de Contactos ya filtra por estado + período → **enlazar, no construir**.
2. Se compara: el dashboard cuenta leads del período por estado actual; Contactos filtra por `createdAt` + `stageId`. **Coinciden** → se puede enlazar.
3. Se compara "Sin atender" vs "Sin asignar" → **NO coinciden** → ese KPI queda inerte, comentado, y la divergencia va al backlog.
4. `lib/url-filters.ts` con `buildContactsHref` + `parseContactFilters`.
5. `verify-drilldown.ts` → **24 combinaciones (6 estados × 4 períodos), cero discrepancias**, más el lead de las 04:25 UTC que en Costa Rica es de ayer (`"Hoy"` da 3 y no 4).
