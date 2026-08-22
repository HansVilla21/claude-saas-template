# Skill: Probar TODAS las ramas (y no romper el UTF-8 al probarlas)

## Cuándo usar esta skill

- Escribiste un endpoint o una acción que produce **uno de varios valores** — un nivel (A/B/C/D),
  una temperatura (caliente/tibio/frío), un estado, una categoría, una prioridad.
- Vas a probar un formulario público, un webhook o un scoring **antes de publicarlo**.
- La base tiene un `CHECK`, un `enum` o una FK sobre la columna que escribís.
- Vas a probar cualquier endpoint con `curl` **desde la consola de Windows** y el texto lleva
  acentos, ñ, o emojis.
- Una prueba pasó y estás por decir "funciona".

**Costo de no usarla:** en la web de marca personal de Josué (2026-08-07), el formulario público
guardaba bien los leads **A y B** y reventaba con 500 en los **C y D**. Estuvo así en producción.
La persona llenaba el formulario, veía un error, y **sus datos se perdían** — justo los perfiles
de menor capital, que son el volumen.

---

## Por qué existe esta skill

**El caso feliz es el que probás primero y es el que menos te enseña.**

El bug de Josué fue una tilde: la tabla `leads` tenía

```sql
check (temperatura in ('caliente','tibio','frío'))   -- con TILDE
```

y el scoring del servidor escribía `"frio"` (sin tilde). Los leads de capital alto salían
`caliente`/`tibio` → guardaban perfecto. Los de capital bajo salían `frio` → **500**.

Y la primera prueba se hizo con un perfil de capital alto, porque es el que uno tiene en la
cabeza cuando prueba un formulario de inversión. **Dio verde.** Una prueba verde sobre una rama
no es evidencia sobre las otras; es evidencia sobre esa rama.

La segunda mitad de la skill es cómo se rompe la prueba misma: **`curl` desde la consola de
Windows corrompe el UTF-8 antes de que el request salga a la red.** Los acentos llegan como
`U+FFFD` (`"3 a 5 a<?>os"`). Parece un bug de codificación de la app — se pierden horas mirando
headers, la base y el `Content-Type` — y **la app está bien**: el que rompió el texto fue el
terminal.

---

## Proceso

### 1. Enumerar las ramas ANTES de probar

Escribí la lista, aunque sea en un comentario. Si el código tiene un `if/else if/else` o un
`switch`, la lista está ahí:

```
niveles: A · B · C · D
temperatura: caliente · tibio · frío
resultado esperado por rama: fila creada + valor exacto en la columna
```

**Una prueba por rama.** Si son 4 ramas, 4 pruebas. No "una de cada extremo".

### 2. Que el compilador tenga la lista, no solo vos

Un tipo literal convierte un error de datos en un error de compilación:

```ts
type Temp = "caliente" | "tibio" | "frío"        // ← con tilde, igual que el CHECK
function calcularTemp(capital: number): Temp {
  if (capital >= 50_000) return "caliente"
  if (capital >= 10_000) return "tibio"
  return "frío"                                   // un "frio" acá ya no compila
}
```

Este es el arreglo de fondo. La prueba encuentra el bug **una vez**; el tipo impide que vuelva.

> Y al revés: **los valores permitidos se derivan de la base**, no se reescriben a mano. Si el
> `CHECK` cambia, tiene que romper algo visible. (Ver `fuente-unica-derivar-de-hijos`.)

### 3. Probar sin romper el texto

**No uses `curl` desde `cmd`/PowerShell para payloads con acentos.** Usá Node y controlá los bytes:

```js
// prueba.mjs  →  node prueba.mjs
const body = JSON.stringify({ nombre: "José Muñoz", plazo: "3 a 5 años", capital: 5000 })
const res = await fetch("https://ejemplo.com/api/lead", {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: Buffer.from(body, "utf8"),           // ← bytes explícitos, el terminal no participa
})
console.log(res.status, await res.text())
```

Y **confirmá contra la base** que el acento llegó entero:

```sql
select nombre, plazo from leads order by created_at desc limit 5;
```

Si ves `U+FFFD` (`<?>`) en la base, mirá primero cómo enviaste la prueba.

### 4. Verificar el efecto, no el código de estado

Un `200` no prueba que se guardó, y un `500` no siempre dice qué rama falló. Después de cada rama:
`select` de la fila y comparación del valor exacto de la columna.

### 5. Buscar los otros `CHECK` del mismo tipo

Si apareció uno, hay más. Barré el esquema:

```sql
select conrelid::regclass as tabla, conname, pg_get_constraintdef(oid)
from pg_constraint where contype = 'c';
```

Cada valor literal que aparezca ahí y también esté escrito en el código es un bug esperando.

---

## Output esperado

- Una prueba por rama, cada una verificada **contra la base**.
- Los valores permitidos como tipo literal (o derivados de la base), no strings sueltos.
- Pruebas de payloads con acentos hechas con Node, no con `curl` desde la consola de Windows.
- La lista de `CHECK` del esquema revisada contra los literales del código.

---

## Gotchas / antipatrones

- 🔴 **"Probé el formulario y funciona".** ¿Con qué rama? Casi siempre con la que tenías en la
  cabeza, que es la que menos falla.
- 🔴 **Reescribir a mano los valores de un `CHECK`.** Un carácter de diferencia — una tilde, una
  mayúscula, un guion — y la mitad de tu producto tira 500.
- 🔴 **Diagnosticar un problema de acentos mirando la app.** Primero descartá el terminal.
- ⚠️ **Que el error se lo coma el formulario.** Si el 500 no le muestra nada al usuario, el bug
  se vuelve invisible y encima **se pierde el dato de la persona**. Todo formulario público
  necesita un mensaje de fallo y, si el dato importa, un lugar donde caiga igual.
- ⚠️ **Probar solo los extremos.** El bug de Josué estaba en C y D, no en A ni en el borde.
- ⚠️ Aplica igual a **enums de Postgres**, FKs a tablas de catálogo, y a los valores que espera un
  webhook externo.

---

## Ejemplo concreto (web de marca personal de Josué, 2026-08-07)

**Input:** formulario público → scoring A/B/C/D en el servidor → lead en el CRM.

**Prueba inicial:** un perfil de capital alto. **Verde.** Se publicó.

**Bug:** `CHECK (temperatura in ('caliente','tibio','frío'))` con tilde vs `"frio"` en el código →
**los leads C y D se perdían con 500** en producción.

**Fix:** tipo literal `Temp` para que lo agarre el compilador + prueba de las cuatro ramas contra
la base. Commit `44a3f74`.

**Bonus del mismo día:** probar el endpoint con `curl` desde la consola de Windows mostró
`"3 a 5 a<?>os"` y disparó una cacería de un bug de codificación **que no existía**. Se rehízo la
prueba con Node + `Buffer.from(json, "utf8")` y el texto llegó perfecto.

---

## Skills relacionadas

- `verificar-funcionamiento-end-to-end` — el efecto se verifica, no la respuesta.
- `debugging-silent-errors` — reproducir antes de instrumentar.
- `fuente-unica-derivar-de-hijos` — derivar los valores válidos en vez de copiarlos.
- `datos-reales-vs-seed-demo` — cazar los literales hardcodeados que sobreviven al prototipo.
