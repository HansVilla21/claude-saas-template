# Skill: El aviso que se apaga solo

> Capturada 2026-08-28 armando la campana de avisos del panel master del CRM, a pedido del
> founder: *"quiero una parte de notificaciones para estar al tanto"*.

## Cuándo usar esta skill

- Alguien pide "notificaciones" / "un lugar para estar al tanto" / "que me avise cuando…".
- Estás por crear una tabla `notificaciones` con una columna `leido`.
- Tenés un cartel que aparece cuando pasa algo, y no sabés bien cuándo tiene que irse.

## La decisión que ordena todo: derivar, no guardar

Antes de crear la tabla, preguntá: **¿ya existe una señal que diga si esto está atendido?**

Casi siempre sí, porque el trabajo real deja rastro:

| Aviso | La señal que ya existe |
|---|---|
| El cliente mandó su formulario | `submitted_at` + "cuándo lo miré" |
| Un cliente reportó un bug | `status = 'new'` |
| Un lead sin responder | el último mensaje es entrante |
| Un pago rebotado | el estado de la suscripción |

Si la señal existe, **el aviso se deriva de ella** y no hay nada que "marcar como leído":
desaparece cuando el asunto se atiende de verdad.

**Por qué importa más de lo que parece.** Con tabla propia, el estado del trabajo y el
estado de la notificación son **dos verdades que hay que sincronizar**. El día que alguien
marque un reporte como resuelto sin tocar su notificación —desde otra pantalla, desde SQL,
desde un cron— la campana muestra trabajo ya hecho. Derivar es lo que hace que "leído" y
"atendido" **no puedan** divergir.

**El costo, que hay que decir en voz alta:** no hay historial de avisos viejos. Es una
bandeja de pendientes, no un registro de todo lo que pasó. Si de verdad necesitás
auditoría, eso es otra cosa y va aparte.

## Proceso

### 1. Escribí la regla en una línea, en castellano

> Hay algo que mirar si el cliente lo **mandó** y (nunca lo miramos **o** lo tocó después
> de que lo miramos).

Si no podés escribirla así, todavía no sabés cuándo tiene que apagarse.

### 2. Guardá "cuándo lo miré", como espejo de "cuándo lo tocó"

```
opened_at    → cuándo el CLIENTE vio la pantalla
reviewed_at  → cuándo la vimos NOSOTROS
updated_at   → cuándo el CLIENTE la tocó por última vez
```

El aviso vuelve solo si el cliente edita después de que lo miraste — y **el texto tiene que
distinguirlo**: "mandó su formulario" vs "cambió algo".

### 3. ⚠️ El trigger genérico de `updated_at` te rompe la regla

Esto es lo no obvio, y casi se me pasa.

`updated_at` significa **"el cliente tocó esto"** y es la mitad de la regla. Pero el trigger
genérico `before update … set updated_at = now()` se dispara con **cualquier** update,
incluido el sello de `reviewed_at`, **que lo pone el founder**.

Consecuencia: **mirar las respuestas quedaba registrado como si el cliente acabara de
escribir.** El panel mentiría sobre cuándo te escribió, y el aviso no se apagaría bien
nunca.

El arreglo: sacarle el trigger a **esa** tabla y fechar a mano en los lugares que de verdad
son cambios del actor que te importa (en el caso real: la función que guarda un bloque y el
"ya está, mandámelo"). Los sellos de "yo lo vi" ya no mueven nada.

**La regla general:** cuando **dos actores distintos** escriben la misma fila, una columna
`updated_at` automática deja de significar algo. Definí de quién es esa fecha, y escribila
explícitamente.

### 4. Sellá donde de verdad se miró

Si tu pantalla renderiza varias pestañas a la vez (patrón "render-all, hide-inactive"),
sellar al entrar a la ficha **apaga el aviso sin que nadie haya leído nada**. Sellá cuando
la pestaña abierta es la correcta — el parámetro de la URL sirve y es server-side.

### 5. Ponelo donde la persona YA entra

Textual del founder: *"al panel admin casi no entro"*. Un aviso al que hay que ir a buscar
no avisa nada. Dos lugares que funcionan juntos:

- **La pantalla de inicio** (la que abre siempre), con el aviso completo y clickeable.
- **Una campana en el shell**, visible desde cualquier pantalla, con el contador.

Cada aviso lleva **de un clic a donde se atiende**, no a una lista intermedia.

### 6. Una función que junta todas las fuentes

Un solo lugar que devuelve `{ id, tipo, titulo, detalle, fecha, href }` ordenado por fecha.
Sumar una fuente nueva es agregar una consulta ahí, no tocar la UI.

## Gotchas

- **La comparación entre dos columnas** (`updated_at > reviewed_at`) no la hacen todos los
  clientes de base de datos —PostgREST no compara columna contra columna—: traé las dos y
  compará en código, o hacelo en una vista.
- **La campana se monta UNA vez.** Si el sidebar de escritorio y el cajón de móvil reusan
  el mismo render, montás dos popovers. Pasá un flag.
- **Popover con portal, nunca `absolute`** (regla del proyecto: ese bug ya apareció tres
  veces).
- **El "hace 3 min" rompe la hidratación**: se calcula con el reloj y el del servidor no da
  igual que el del navegador. `suppressHydrationWarning` en ese span.

## Cómo se prueba (y cómo el test miente)

Contra la base viva, en una transacción que se deshace:

1. **Positivo:** mirar sella y **no** mueve la fecha del cliente → el aviso se apaga.
2. **El que importa:** el cliente edita → el aviso **vuelve**.
3. **Control negativo:** sellar sin que el cliente toque nada → **no** aparece un aviso
   falso.

⚠️ **La primera corrida del paso 2 dio "no vuelve el aviso" y era el TEST el que estaba
mal:** dentro de una misma transacción `now()` está **congelado**, así que el cambio del
cliente y el "ya lo vi" quedaban con la misma hora. Se arregla simulando el momento real
(`reviewed_at = updated_at` antes de la edición) o usando `clock_timestamp()`.

## Output esperado

Una campana con el contador de lo que espera algo de vos, que se vacía sola a medida que
atendés — sin ninguna acción de "marcar como leído" y sin una tabla que sincronizar.

## Ejemplo

**Input:** *"Quiero enterarme cuando un cliente manda su formulario, sin entrar al panel."*

**Output:** aviso en la pantalla de inicio + campana en el panel, derivados de
`submitted_at`/`reviewed_at` y de `bug_reports.status`. Verificado: aparece al mandar, se
apaga al mirarlo, vuelve si el cliente edita después, y no aparece por sellar.
