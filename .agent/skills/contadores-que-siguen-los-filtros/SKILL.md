# Skill: Contadores que siguen los filtros (el número de la tarjeta = las filas de la tabla)

## Cuándo usar esta skill

- Una pantalla tiene **tarjetas o chips con un número** ("Calificados 19") **y una barra de filtros** (búsqueda, estado, fuente, agente…).
- El usuario dice *"cuando aplico filtros, los números de arriba no se actualizan"*.
- Las tarjetas son **clickeables** (tocar "Calificados" filtra la tabla): el número promete cuántas filas vas a ver.
- Vas a agregar un filtro nuevo y querés que los contadores lo respeten sin acordarte de tocarlos.

## Por qué existe esta skill

Capturada el **2026-09-18** en la pantalla de Contactos de un CRM. Las 4 tarjetas de arriba contaban sobre **el universo del período** y nada más: buscabas un nombre, la tabla mostraba **1** contacto y la tarjeta seguía diciendo **143**.

No era un descuido: el diseño anterior era deliberado (las tarjetas son *drill-down*, y si contaran sobre todo, tocar una las cambiaría a sí mismas). Por eso la respuesta obvia —"contá sobre las filas filtradas"— **también está mal**:

> Si los contadores aplican **también** el filtro rápido, elegir "Calificados" pone "Sin asignar" en 0 y "Handoff" en 1. Cada tarjeta deja de decir *qué pasa si la tocás* y ya no sirven para navegar.

## La regla

> Los contadores cuentan sobre lo que dejan pasar **todos los filtros MENOS el que ellos mismos controlan**. Es un conteo por **facetas**.

Y la propiedad que lo demuestra, sin mirar la pantalla:

```
para todo conjunto de filtros F y todo filtro rápido q:
    contar(F)[q]  ===  filas(filtrar(datos, F + q)).length
```

**El número de cada tarjeta es exactamente la cantidad de filas que aparece al tocarla.**

## Proceso

### 1. Separá el filtro que los contadores controlan del resto

En el modelo de filtros, el "rápido" (`quick`: todos / calificados / sin asignar / handoff) es el único que las tarjetas mueven. Todo lo demás (búsqueda, estado, fuente, agente, etiquetas, anuncio) es de la barra.

### 2. Una función pura, que **reutiliza** el filtro de la tabla

```ts
export function contarFacetas(universo: Lead[], filtros: Filtros): Record<Quick, number> {
  const base = filterContacts(universo, { ...filtros, quick: 'all' }); // la MISMA función que la tabla
  return {
    all: base.length,
    qualified: base.filter((l) => passesQuick(l, 'qualified')).length,
    unassigned: base.filter((l) => passesQuick(l, 'unassigned')).length,
    handoff: base.filter((l) => passesQuick(l, 'handoff')).length,
  };
}
```

**Reusar `filterContacts` es el punto.** Si los contadores reimplementan el criterio, divergen en el primer filtro nuevo, y nadie lo nota porque cada lado "anda". Un filtro nuevo entra a la tabla y a los contadores **a la vez**, porque es la misma función.

Las tarjetas y los chips de abajo usan **el mismo** resultado (una sola llamada, un `useMemo`), no dos cálculos parecidos.

### 3. La prueba de propiedad, con control negativo

```ts
for (const caso of [{}, { search: 'ana' }, { stageId: 's1' }, { agentId: 'none' }, { search: 'zzz' }, ...]) {
  const filtros = { ...DEFAULT_FILTERS, ...caso };
  const facetas = contarFacetas(LEADS, filtros);
  for (const q of QUICKS) {
    assert.equal(facetas[q], filterContacts(LEADS, { ...filtros, quick: q }).length);
  }
}
```

Y **la que hace que el verde signifique algo**: contar solo sobre el universo (lo de antes) **NO** cumple la propiedad con `{ search: 'ana' }`. Sin ese control, una prueba que no discrimina aprueba el bug.

También una prueba de que **el filtro rápido no mueve los contadores** (`contarFacetas` da lo mismo con cualquier `quick`).

### 4. Lo que NO se recorta: las opciones de los desplegables

Las listas de opciones (fuentes, etiquetas, anuncios) se siguen calculando sobre el universo del período, **no** sobre los filtros de la barra. Si al elegir un estado desaparecieran los demás, no podrías cambiar de opinión sin limpiar todo primero.

## Verificación (en el navegador)

Medido con sesión real: **10 contactos → buscar un nombre → Total 1, Calificados 0** · elegir un estado → Total 3 · limpiar la búsqueda → vuelve a 10. Y el clic: tocar una tarjeta deja en la tabla exactamente ese número de filas.

## Gotchas

- **El estado inicial puede venir por URL** (un enlace desde el dashboard con filtros ya puestos): los contadores tienen que respetarlos desde el primer render, no recién al tocar algo.
- **Realtime:** si llega un contacto nuevo por el canal, los contadores se recalculan solos **porque son derivados** (`useMemo` sobre el estado). Si los guardaras en su propio `useState`, se desfasarían.
- **No lo resuelvas con un contador por filtro guardado.** Es lo primero que se intenta ("un `count` por cada combinación") y explota combinatoriamente. Derivá siempre del array filtrado.

## Lo que esta skill NO cubre

- Conteos **del lado del servidor** sobre tablas grandes (con paginación no podés filtrar en el cliente: ahí es una consulta `count` por faceta, y hay que medirla, AGENTS.md §7).
- Hacer clickeable un número del dashboard hacia otra pantalla (skill `drill-down-numero-a-lista`): esa compara las **definiciones** entre pantallas; esta hace que los números **sigan a los filtros** dentro de una.

## Ejemplo

**Input:** *"En Contactos, los contadores de arriba no se actualizan cuando pongo filtros."*

**Output:** `contarFacetas(universo, filtros)` en `filters.ts`, usado por las tarjetas y los chips. 5 pruebas (la propiedad número = filas sobre 9 combinaciones de filtros, el control negativo, y que el filtro rápido no mueve los números). Medido en el navegador: buscar un nombre baja Total de 10 a 1.
