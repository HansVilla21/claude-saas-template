# Skill: La configuración que el motor no puede satisfacer (y deja el sistema mudo)

## Cuándo usar esta skill

- Vas a escribir **cualquier guard que compare dos valores de configuración** (`desde < hasta`, `min < max`, `inicio` vs `fin`, un rango, un umbral, un cupo).
- Un usuario reporta que algo **"no responde" y no hay ningún error**: ni excepción, ni log rojo, ni alerta. Simplemente no pasa nada, siempre.
- Estás por guardar una configuración desde un panel **sin validar que la combinación tenga sentido**.
- Estás auditando una feature de configuración que "nunca se probó con valores raros".

## Por qué existe esta skill

Capturada el **2026-08-24** en el CRM de Momentum, al ir a activar el chatbot de un cliente que atiende **de noche**: de 18:00 a 05:00.

El nodo que decide si el bot atiende hacía esto:

```js
let is_inside = false;
if (daySet.has(proj.dayOfWeek) && fromMin < toMin) {   // ← acá
  if (proj.minutesOfDay >= fromMin && proj.minutesOfDay < toMin) is_inside = true;
}
const is_outside = (schedule_mode === 'office_hours') && !is_inside;
```

Con 18:00 → 05:00, `fromMin` es 1080 y `toMin` es 300. **`fromMin < toMin` es falso, así que `is_inside` no puede volverse `true` nunca.** El bot quedaba permanentemente "fuera de horario": contestaba el mensaje automático las 24 horas y se pausaba ~23, todos los días.

El punto que hace a esta skill transferible **no es el horario**. Es la forma del fallo:

> El guard estaba escrito para el caso feliz. Una configuración **que la UI dejaba guardar** caía fuera de lo que el guard sabe evaluar, y el resultado no fue un error — fue el **silencio permanente**.

Y el silencio no se reporta solo. No hay excepción que capturar, no hay `status: 500`, no hay fila roja en ningún tablero. El sistema hace exactamente lo que el código dice: nada. Se descubre cuando el cliente reclama, o —como acá— por casualidad, al ir a configurar el caso que lo destapa.

**El mismo nodo tenía un segundo caso idéntico**, encontrado al arreglar el primero: el panel documenta `days: []` como *"sin restricción de día"*, pero un conjunto vacío hace que `daySet.has(...)` sea siempre falso. Misma mudez, otra puerta. Nunca es uno solo: si el guard se escribió para el caso feliz, hay más de un valor que lo rompe.

## Proceso

### 1. Buscar el guard que puede volverse imposible

Los sospechosos son las condiciones que **combinan** dos valores de configuración y de las que depende que algo *ocurra* (no que se bloquee):

| Forma | Qué pasa cuando no se cumple |
|---|---|
| `if (a < b) { hacerAlgo() }` | con `a >= b` no se hace nada, para siempre |
| `if (set.has(x))` | con el set vacío, nunca |
| `if (lista.length > 0 && ...)` | con la lista vacía, nunca |
| `if (config.x && config.y)` | si uno de los dos nunca se llena, nunca |

La pregunta que los desenmascara: **"¿existe una configuración guardable que haga esta condición falsa para siempre?"** Si la respuesta es sí, tenés un sistema mudo esperando a un cliente.

### 2. Preguntar si el caso "raro" es un caso REAL de negocio

No siempre hay que soportarlo. Un turno que cruza la medianoche es normalísimo — bares, farmacias, soporte nocturno, seguridad, call centers. Un `min > max` en un umbral, no.

- **Si es real:** hay que implementarlo, y suele necesitar una **decisión de producto**, no solo de código. En el caso del horario: *"un mensaje de las 02:00 del sábado, ¿pertenece al turno del viernes o al del sábado?"*. Esa respuesta define qué marca el usuario en el panel, y si la elegís vos sin preguntar, la elegís mal.
- **Si no es real:** no lo implementes — **rechazalo en la UI**, con un mensaje que diga por qué.

### 3. Elegir hacia dónde falla lo que queda fuera

Para toda combinación que no puedas evaluar, decidí explícitamente el default. **La regla es fallar hacia el lado barato.**

En un bot de atención, el modo de fallo caro es el **silencio** (el lead se va y nadie se entera); una respuesta de más es barata. Por eso el rango sin duración (`desde === hasta`) pasó a tratarse como *"siempre adentro"*:

```js
if (fromMin === toMin) {
  // Rango vacío/ambiguo: falla hacia que el bot CONTESTE.
  is_inside = true;
}
```

Cuál es el lado barato **depende del dominio** y hay que escribirlo en un comentario. En un sistema de cobros, en uno de permisos o en un apagado de emergencia, el lado barato es el opuesto.

### 4. Cerrar la puerta en la UI, además del motor

El motor tolerante evita el desastre; la UI evita la confusión. Dos cosas distintas y las dos hacen falta:

- **Bloquear** lo que no tiene sentido (un rango sin duración) — no dejar guardar.
- **Explicar en palabras** lo que sí tiene sentido pero se lee al revés. Un usuario que ve *"de 18:00 a 05:00"* y una lista de días **no sabe si marcar el día en que empieza o el que termina** — y si marca mal, el bot atiende las noches equivocadas y vuelve a no haber ningún error.

```
Turno nocturno: de 18:00 a 05:00 del día siguiente. Los días que marcás arriba
son los días en que EMPIEZA el turno — con viernes marcado, atendés del viernes
18:00 al sábado 05:00.
```

Poné la regla en **una sola función pura** que consuman la UI y el motor. Si la UI explica una regla y el motor aplica otra, volviste al principio.

### 5. Probar el motor real con el reloj (o el mundo) inyectado

Este tipo de bug **no lo ve `tsc`, ni el linter, ni el build**, y no se puede probar esperando a las 3 de la mañana. Se prueba corriendo **el código real** con el entorno falseado. No una copia: el código real, traído de donde vive.

```js
/** Date con `new Date()` clavado; el resto se comporta normal. */
function fixedDateClass(fixedMs) {
  return class extends Date {
    constructor(...args) { if (args.length === 0) super(fixedMs); else super(...args); }
    static now() { return fixedMs; }
  };
}

// El jsCode del nodo, traído por API del sistema vivo:
const fn = new Function('$', 'Date', jsCode);
const salida = fn(stubDeContexto, fixedDateClass(Date.parse('2026-08-22T09:00:00Z')))[0].json;
```

La matriz mínima:

1. El caso nuevo, **adentro** y **afuera**.
2. **Los bordes**: el minuto anterior al inicio, el último minuto adentro, el minuto del cierre.
3. **No-regresión**: el caso viejo, que es el camino por el que pasan todos los clientes actuales.
4. Los valores degenerados: rango vacío, lista vacía, modo apagado.

### 6. El control negativo — sin esto la prueba no vale

Corré la misma matriz contra el **código viejo** y exigí que los casos nuevos **cambien de resultado**, y que los de no-regresión **no cambien**:

```
✓ los 6 casos clave cambian de resultado con el parche (cambiaron 6)
✓ los 3 casos diurnos NO cambian (iguales 3)
```

Si el caso clave da lo mismo antes y después, la prueba no está midiendo lo que creés y el verde es falso.

## Output esperado

1. El guard arreglado, con un **comentario que explique la decisión de negocio** (a qué día pertenece el turno) y hacia dónde falla lo ambiguo.
2. Una **función pura compartida** que traduce la configuración a palabras, consumida por la UI.
3. La UI **bloqueando** lo imposible y **explicando** lo confuso.
4. Un **script de verificación** que corre el motor real con el entorno inyectado, con la matriz completa y el control negativo.
5. Si el motor vive en un sistema externo (n8n, una edge function, un worker): script de deploy **idempotente**, snapshot previo, y verificación **releyendo del sistema vivo** — no del cuerpo del request que mandaste.

## Ejemplo

**Input:**
> "Se puede poner el bot de 7:00 a 18:00, pero no sé si se puede poner de 18:00 a 05:00."

**Output:**

Auditoría del nodo: el guard `fromMin < toMin` hace imposible el turno nocturno; con 18:00 → 05:00 el bot queda mudo 24/7 sin dar error. Segundo caso idéntico: `days: []` produce el mismo silencio.

Se decide con el founder que el turno pertenece al día en que empieza. Se arregla el cálculo, se hace que la lista vacía signifique "todos los días", el rango sin duración pasa a fallar hacia que el bot conteste, y el panel explica el turno nocturno en palabras y bloquea el rango vacío.

Verificación: 15 casos contra el código real traído del sistema vivo, con el reloj inyectado. Control negativo: con el código viejo, **el viernes a las 20:00 —plena mitad del turno— daba "afuera"**.

## Skills relacionadas

- `verificar-funcionamiento-end-to-end` — el estándar de prueba: "compila" / "corrió" no es "funciona".
- `probar-camino-produccion-sin-efectos-externos` — probar el camino real cortando antes del envío.
- `config-por-tenant-no-literal-en-el-flujo` — el primo de este bug: lógica de un cliente cableada en el flujo compartido, que también falla sin avisar.
- `distinguir-detenido-a-proposito-de-roto` — qué hacer para que el silencio deje de ser invisible.
