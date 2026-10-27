# Skill: Editar un dato que el webhook también reescribe (el nombre "que no se guarda")

## Cuándo usar esta skill

- Vas a agregar **"editar contacto"** (o cliente, paciente, lead) a un sistema donde los datos también los escribe una **integración**: un webhook de WhatsApp, de un CRM externo, de un formulario.
- Alguien reporta *"lo edité y a los minutos volvió a como estaba"* — o, peor, nadie lo reporta y el dato queda mintiendo.
- Existen **dos columnas para "lo mismo"** (`full_name` y `display_name`, `phone` y `whatsapp_phone`) y una pantalla decide cuál mostrar.
- Vas a guardar una fecha de calendario (un cumpleaños) y no querés que cambie de día según la zona de quien la lea.

## Por qué existe esta skill

Capturada el **2026-09-18** al agregar la edición de contactos a un CRM con WhatsApp. El formulario de edición era lo fácil. Lo que no se veía:

- el webhook reescribe `display_name` (el nombre del **perfil** de WhatsApp) **en cada mensaje**, y `phone` también;
- la función que decide qué nombre mostrar le daba **precedencia al nombre del perfil**;
- entonces editar el nombre se guardaba bien en la base, se veía bien un instante… y **volvía a verse el del perfil**, sin un solo error, en el siguiente mensaje del lead. Un bug que solo aparece **más tarde**, cuando ya nadie está mirando.

## La regla

> Cada campo tiene **un dueño**. Si lo puede escribir una integración **y** una persona, hay que decidir **quién gana cuando difieren** — y esa decisión vive en **un solo lugar**: el resolver que decide qué se muestra.

| Campo | ¿Lo reescribe el webhook? | Qué se hace |
|---|---|---|
| Nombre | Sí (el del perfil, en su propia columna) | **Dos columnas**: la del negocio y la del proveedor. El resolver le da precedencia **a la del negocio**. El webhook solo rellena la del negocio si está vacía o es un relleno ("Lead sin nombre") |
| Teléfono con un id del proveedor enlazado | Sí, en cada mensaje | **Solo lectura**, con el motivo escrito debajo del campo. Es la identidad del chat: un cambio a mano se pisa, o peor, muestra un número distinto al del chat |
| Teléfono de un contacto manual o importado (sin id del proveedor) | No | Editable |
| Email, cumpleaños, notas | No | Editable libre |

## Proceso

### 1. Inventario: qué campos escribe cada evento

Antes de dibujar el formulario, leé el handler del webhook y anotá **qué columnas toca en un `update`**, y con qué condición. No es opcional: es lo único que te dice qué campos son de la persona y cuáles del proveedor.

### 2. Medí el radio antes de invertir una precedencia

Cambiar el orden del resolver es un cambio **global** (todo lo que muestra un nombre, y todo lo que le habla al cliente por su nombre). Medilo:

```sql
select count(*) filter (where deleted_at is null) as activos,
       count(*) filter (where deleted_at is null
         and display_name is not null and btrim(display_name) <> ''
         and btrim(full_name) not in ('', 'Lead sin nombre')
         and btrim(display_name) <> btrim(full_name)) as nombres_distintos
from leads;
```

Medido: **13 de 1.769**. Para el resto, los dos valores son iguales (el contacto nació del perfil) y el orden no cambia nada. Con ese número la decisión se toma en un minuto y se le puede decir al dueño del producto *"cambia el nombre visible de 13 contactos"*.

### 3. Un solo lugar, con la prueba que fija el orden

```ts
export function nombreReal(l) {
  for (const n of [l?.full_name, l?.display_name]) { // primero lo del negocio
    const limpio = (n ?? '').trim();
    if (limpio && !esRelleno(limpio)) return limpio;
  }
  return null;
}
```

Pruebas (`node:test`): el del negocio gana al del perfil · sin el del negocio se usa el del perfil · un relleno nunca es un nombre (cae al teléfono) · **los dos iguales: el orden no cambia nada**. Y confirmá que el webhook **ya** respeta el contrato (`cambiosDeNombre`: "un nombre que puso el negocio no se pisa nunca"): si no lo respetara, el arreglo sería en el webhook y no acá.

### 4. El modal de edición

- **No optimista.** Bajo RLS un `update` filtrado no da error: afecta 0 filas y responde éxito (skill `detectar-escritura-filtrada-rls`). Se espera la base: `.update(cambios).select('cols')` → `readWriteResult`.
- **Mandá solo los campos que cambiaron.** Así no pisás lo que otro tocó mientras el modal estaba abierto.
- **Refrescá la pantalla con la fila que devolvió el `UPDATE`**, no con lo que tipeó el usuario. Vaciar el nombre significa "que caiga al del perfil", y el navegador **no conoce** el `display_name`: solo la fila devuelta lo sabe.
- **El mismo modal en todas las pantallas** (el panel lateral de la conversación y el perfil completo): un componente, dos entradas. Editar sin salir del chat era la mitad del pedido.
- **Duplicados:** si cambió el teléfono, buscá otro contacto con ese número **antes** de guardar. Best-effort (bajo RLS un agente no ve los ajenos), pero atrapa el error de tipeo más común.

### 5. Una fecha de calendario es un `date`

Un cumpleaños es un **día**, no un instante. En `timestamptz` cambia de día según la zona de quien lo lea (nacer el 5 a las 00:00 en UTC-6 es el 4 en UTC). Columna `date`, y toda la aritmética sobre año/mes/día — **nunca `new Date('1990-05-05')`**, que es medianoche UTC. "Hoy" (para rechazar fechas futuras) sale de la **zona del negocio**, y entra como parámetro para poder probar cualquier día. Tres campos (día · mes · año) en vez de `<input type="date">`: el nativo tiene el diseño del navegador y para llegar a 1985 obliga a retroceder mes por mes.

## Gotchas

- **El síntoma es diferido.** La edición se ve bien en la prueba de 30 segundos. Solo aparece cuando llega el siguiente evento. Por eso el paso 1 (leer el handler) no se puede reemplazar por "probé y anda".
- **`updated_at` no se puede restaurar** después de una prueba: un trigger `BEFORE UPDATE` lo pisa. Probá sobre una cuenta demo, no sobre datos reales.
- **La automatización del navegador puede no borrar un campo** con `Backspace`/`Delete` en un input controlado. No es un bug de la app: usá el setter nativo (`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set`) y despachá un evento `input`.
- **Un campo deshabilitado sin explicación se lee como un error.** El motivo va escrito debajo ("viene de WhatsApp y es la identidad del chat"), no solo en gris.

## Lo que esta skill NO cubre

- Registrar cada edición en un `audit_log` (los cambios de estado ya llevan procedencia; las ediciones de datos no).
- Edición masiva.
- No se mandó un evento real del proveedor para comprobar que la edición sobrevive: se comprobó leyendo el handler y con la prueba de `cambiosDeNombre`. Si tu integración es distinta, ese es el paso que no te podés saltar.

## Ejemplo

**Input:** *"Necesito un botón para editar contactos desde la conversación, sin ir al perfil."*

**Output:** un modal (nombre, teléfono, email, cumpleaños) compartido por el panel del chat y el perfil. El nombre editado gana al del perfil de WhatsApp (afecta a 13 de 1.769), el teléfono queda de solo lectura si hay un id de WhatsApp enlazado, y se guarda esperando la confirmación de la base. Verificado: editar → confirmado en la base, vaciar el email y quitar el cumpleaños → `null`, teléfono y nombre de perfil intactos.
