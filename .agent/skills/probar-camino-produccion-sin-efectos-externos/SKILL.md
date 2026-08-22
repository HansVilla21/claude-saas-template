# Skill: Probar el camino REAL de producción sin efectos hacia afuera

## Cuándo usar esta skill

- Vas a tocar un flujo que **manda algo al mundo**: un WhatsApp, un correo, un cobro, un push, un webhook a un tercero.
- Necesitás probar en **producción** porque el bug solo aparece con la config, los datos y las credenciales reales.
- Cambiaste algo compartido y tenés que demostrar **no-regresión de clientes vivos** sin escribirles.
- Vas a decir "lo probé" sobre un sistema donde probar mal le llega a un cliente real.

## Por qué existe esta skill

Capturada el **2026-08-18** en el CRM de Momentum. Había que cambiar un nodo del flujo del bot que corre para **todos** los clientes, incluidos dos en producción con leads reales conversando.

Las opciones de siempre son las dos malas:

| Opción | Por qué no sirve |
|---|---|
| **Un entorno de staging** | no reproduce el bug: las credenciales, la config por cliente y los datos son los que rompen |
| **Mandar mensajes de prueba** | le llegan a un número real, ensucian conversaciones vivas y (si el cliente lo ve) queda como un sistema que le escribe solo |

La salida fue una tercera: **correr el camino de producción entero y cortar en el último centímetro**, justo antes del nodo que sale hacia afuera.

```js
// Un flag en el payload que solo el corte conoce
if ($json.__eval_synthetic) { return []; }   // muere ANTES de Send Chunk via YCloud
```

Con eso se probaron, contra producción y **sin enviar un solo WhatsApp**: el nodo nuevo, el camino de todos los mensajes (regresión), y el comportamiento intacto de un cliente vivo.

> La idea central: **el valor de la prueba está en todo lo que corrió antes del corte.** Un staging cambia las 20 cosas de arriba para evitar la última. Esto cambia solo la última.

---

## Dónde va el corte (la única decisión que importa)

**Lo más tarde posible, e inmediatamente antes del efecto externo.** Cada nodo que queda antes del corte es un nodo probado.

```
[trigger] → [resolver tenant] → [config] → [LLM] → [formatear] → ✂️ CORTE → [enviar al proveedor]
                                                                   ↑
                                              todo lo de la izquierda corrió de verdad
```

**Errores comunes al elegir el corte:**

- **Cortar muy arriba** ("simulo desde el trigger") → estás probando tu simulación, no el sistema.
- **Cortar después del envío y "borrar después"** → el mensaje ya salió. No hay deshacer en WhatsApp.
- **Un flag que apaga varias cosas a la vez** → si el flag también saltea la escritura en la base, ya no podés verificar el efecto. El flag apaga **una sola** cosa: la salida al tercero.

**El flag va en el dato, no en el entorno.** Una variable de entorno (`DRY_RUN=1`) apaga el envío **para todos** — incluidos los leads reales que escriban en ese momento. Un campo en el payload (`__eval_synthetic`) apaga **solo ese turno**. En un sistema multi-tenant vivo, esto no es preferencia: es la diferencia entre una prueba y un incidente.

---

## La matriz mínima de pruebas (las 4 que no se saltean)

Probar solo el caso nuevo es la trampa clásica. La tabla real de aquella sesión:

| # | Prueba | Por qué |
|---|---|---|
| 1 | **El caso nuevo** | lo obvio: ¿hace lo que se pidió? |
| 2 | **El camino de TODOS** (el mensaje de texto normal) | el cambio vive en un nodo por el que pasa el 100% del tráfico |
| 3 | **No-regresión de un cliente en producción** | el que NO tocaste tiene que salir idéntico |
| 4 | **Idempotencia / doble ejecución** | si el nodo escribe, correrlo dos veces no puede duplicar |

La 3 es la que nadie hace y la que más cuesta cuando falta.

---

## El bug que esta técnica destapa (y que ninguna otra ve)

> **"El nodo corrió" NO es "el nodo escribió".**

En la verificación, el nodo nuevo reportaba `executionStatus: success` y **no escribía nada**. Dos cosas se combinaron:

1. Un nombre mal escrito — el enum era `message_sender_kind`, no `sender_kind`.
2. `onError: continueRegularOutput` en el nodo (**correcto**, para que un fallo del rescate no corte al bot) — que convierte el error en **un ítem silencioso**.

O sea: el manejo de errores correcto para producción es exactamente el que esconde el bug en la prueba. La única defensa es **mirar el output del nodo Y contar filas en la base**, nunca el estado de la ejecución.

```sql
-- La prueba real: la fila, no el status
select id, direction, sender_kind, status
from messages
where external_id = '<el sintetico>';
```

---

## Limpiar después (los dos rastros que quedan)

1. **Las filas sintéticas** que sí se escribieron: borrarlas de las conversaciones al terminar. Si no, un agente humano abre el inbox y ve mensajes que nadie mandó.
2. **La memoria conversacional del agente** (`n8n_chat_histories` o equivalente) queda con los turnos sintéticos. Es inocuo pero real: **si volvés a probar por ese mismo hilo, el bot los recuerda** y contesta raro. Vale la pena saberlo antes de gastar media hora buscando un bug que inventaste vos.

---

## Proceso

1. **Encontrar el último nodo antes del efecto externo.** Ese es el corte.
2. **Agregar el guard leyendo un campo del payload** (`__eval_synthetic`), nunca una variable de entorno.
3. **Disparar el flujo con datos reales de producción** (tenant real, config real, credenciales reales).
4. **Correr la matriz de 4**: caso nuevo · camino de todos · no-regresión de un cliente vivo · idempotencia.
5. **Verificar contando filas en la base**, no leyendo el status de la ejecución.
6. **Borrar las filas sintéticas** y anotar que la memoria del agente quedó con esos turnos.
7. **Reportar la tabla de resultados** con el valor medido, no con "funciona".

## Output esperado

Una tabla de pruebas donde cada fila dice **qué se ejecutó y qué devolvió**, con al menos una fila de no-regresión de un cliente en producción, y la frase que cierra todo: *"sin enviar un solo mensaje real"*. Más las filas sintéticas eliminadas.

## Ejemplo

**Input:** "Cambiá el texto que el bot manda cuando recibe una foto — pero Jacó y El Canal están en producción con leads reales."

**Output:**

| Prueba | Resultado |
|---|---|
| Foto → Roberto (el caso nuevo) | *"Todavia no tengo forma de ver imagenes por aqui…"*. Cero mención a propiedades |
| Texto → Roberto (camino de TODOS) | el mensaje llega intacto, el bot responde normal |
| **Foto → Jacó (no-regresión, cliente vivo)** | conserva su texto: *"Me podes decir en que zona esta…"* |
| Idempotencia del nodo nuevo | 0 `external_id` duplicados en los mensajes de los últimos 2 días |

"Todo contra producción, sin enviar un solo WhatsApp. Los mensajes sintéticos se borraron; la memoria del bot de esos dos hilos quedó con los turnos de prueba."

## Skills relacionadas

`probar-migracion-contra-base-viva-con-rollback` (el equivalente para SQL: `BEGIN` + assertions + `ROLLBACK`) · `verificar-funcionamiento-end-to-end` (el estándar general) · `detectar-escritura-filtrada-rls` (el otro éxito silencioso: escribir 0 filas y responder OK) · `config-por-tenant-no-literal-en-el-flujo` (por qué la no-regresión del otro tenant es obligatoria) · `n8n-workflow-versioning` (snapshot PRE antes de tocar).
