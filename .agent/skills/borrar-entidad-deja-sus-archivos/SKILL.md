# Skill: Borrar la entidad deja sus archivos

> Capturada 2026-08-28 borrando el cliente de prueba del CRM: la base quedó impecable y los
> 768 KB de material privado del cliente siguieron ahí.

## Cuándo usar esta skill

- Vas a escribir (o ya existe) un borrado de una entidad que **tiene archivos subidos**:
  un cliente, un usuario, un proyecto, una propiedad, una conversación con adjuntos.
- Estás por confiar en que "las FK con cascade limpian todo".
- Alguien pidió "borrame esta cuenta" y le dijiste que sí.

## El problema, en una línea

**Las FK cascadean; el almacenamiento de archivos no tiene FK.**

El `DELETE` de la fila madre limpia toda la base en un movimiento y se siente completo. Los
archivos —que viven en otro sistema, referenciados por una ruta que es texto— **quedan para
siempre**.

Y esto no es basura acumulada, que sería un problema de costos. Es **material privado de
alguien a quien le dijiste que borraste su cuenta**: audios de su negocio, capturas de sus
conversaciones reales, su logo, las fotos de su catálogo.

### Por qué no se detecta

La verificación natural después de un borrado es contar filas: agencia 0, etapas 0,
miembros 0, todo en cero. **Se ve perfecto.** Los archivos no aparecen en esa verificación
porque no están en ninguna de esas tablas — hay que ir a buscarlos aparte, a un lugar donde
nadie mira.

En el caso real llevaba meses así con las fotos de catálogo, sin que nadie lo notara.

## Proceso

### 1. Antes de tocar el borrado, medí qué queda

Listá los archivos de una entidad ya borrada. Si aparecen, tenés el bug confirmado y de
paso el número para el commit.

### 2. Borrá los archivos ANTES del DELETE

Después de borrar la fila **ya no tenés de dónde sacar el id** para armar las rutas.

### 3. Recorré los niveles que tu convención tenga

La convención habitual es `<entidad_id>/<lo-que-sea>/<archivo>`: dos niveles. En un
almacenamiento tipo objeto las "carpetas" no existen, son prefijos — el listado devuelve
prefijos y archivos mezclados, y se distinguen por si traen id.

```ts
const { data: entradas } = await storage.from(bucket).list(entidadId, { limit: 1000 });
const paths: string[] = [];
for (const e of entradas ?? []) {
  if (e.id) { paths.push(`${entidadId}/${e.name}`); continue; }   // archivo suelto
  const { data: hijos } = await storage.from(bucket).list(`${entidadId}/${e.name}`, { limit: 1000 });
  for (const f of hijos ?? []) if (f.id) paths.push(`${entidadId}/${e.name}/${f.name}`);
}
if (paths.length) await storage.from(bucket).remove(paths);
```

### 4. Best-effort, y que se note

- Si el almacenamiento falla, **la entidad se borra igual** y el error queda en el log. Un
  archivo huérfano se limpia después; una entidad a medio borrar, no.
- **Devolvé cuántos borró.** Si mañana aparece un tercer nivel de carpetas, este recorrido
  no lo alcanza y el número es lo único que lo delata.

### 5. Probá el recorrido SIN borrar

Corré el walk contra el almacenamiento real y listá lo que borraría. Si no encuentra los
archivos que sabés que existen, el borrado dejaría huérfanos **y no te enterarías**.

### 6. Barré lo que ya quedó huérfano

El arreglo es para adelante. Lo que se acumuló hasta hoy sigue ahí: listá por prefijos que
ya no correspondan a ninguna entidad viva y borralos a mano, una vez.

## Gotchas

- **Todos los buckets, no solo el tuyo.** Si arreglás el borrado para los archivos de tu
  feature nueva y dejás los de la feature vieja, el cliente sigue teniendo material
  guardado. Es la misma acción y el mismo problema.
- **La verificación tiene que incluir el almacenamiento.** "0 filas en todas las tablas" no
  es "no quedó nada". Agregá la línea de archivos a tu chequeo de borrado.
- **Cuidado con lo que NO tiene que desaparecer.** El usuario dueño de la entidad puede
  pertenecer a otras: sacá también esa foto antes de borrar, y verificala después.

## Output esperado

Un borrado que deja en cero las tablas **y** el almacenamiento, verificado con dos
consultas distintas, y una nota en el commit con cuántos archivos limpió.

## Ejemplo

**Input:** *"Borré el cliente de prueba y la base quedó limpia."*

**Output medido:** base en 0 (agencia, etapas, campos, miembros, puesta en marcha, avisos)
**y 2 archivos vivos** —176 KB de audio, 592 KB de foto— en la carpeta de un cliente que ya
no existía. Arreglado el borrado (dos buckets, recorrido de dos niveles, antes del DELETE,
best-effort con conteo) + limpieza manual de los huérfanos → 0 archivos.
