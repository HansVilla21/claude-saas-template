# Skill: Guiar un paso que ocurre dentro de una ventana (sin trabar a la persona ni borrarle lo escrito)

## Cuándo usar esta skill

- Un recorrido de la guía pasa por un **modal, un diálogo de confirmación, un cajón o un editor** que se abre encima de la pantalla (en el catálogo de una clínica: anular una venta, marcar comisiones como pagadas, anotar un gasto, agregar a alguien al equipo, subir un archivo).
- La guía **retrocede sola** a un paso anterior, o la persona **queda dando vueltas** en un paso que no avanza.
- Tocar el panel de la guía **cierra la ventana** y se pierde lo que estaba escribiendo.
- Estás **revisando** recorridos ya escritos: las cinco señales de abajo se buscan en cada uno.

Es la pareja de `guia-interactiva-sobre-pantallas-reales`: esa explica el catálogo; esta, el caso que más recorridos rompió.

## Por qué existe esta skill

Capturada el **2026-11-03**, en la revisión de 60 recorridos nuevos. Seis ayudantes los escribieron en paralelo y las pruebas pasaron en verde. Un revisor con un modelo fuerte, **leyendo el código real**, encontró que casi todas las tareas que pasan por una ventana tenían algún problema que **ninguna prueba ve**: la guía queda **debajo** de la ventana, un paso esperaba un campo que desaparece al cancelar, y el texto mandaba a "mirar abajo" con la ventana abierta.

Y luego pasó lo más instructivo: **al arreglar con la primera revisión, un ayudante metió una regresión** (un `volverSi` que hacía retroceder la guía con el editor ya abierto). La segunda revisión, hecha **solo sobre los arreglos**, la encontró.

## Las cinco señales

| # | Lo que se ve | Causa |
|---|---|---|
| 1 | Tocás el panel de la guía y **la ventana se cierra**, y lo escrito se borra | El panel (capa 30) está **debajo** del fondo de la ventana (capa 50): tocarlo es tocar "afuera" |
| 2 | En el celular, la ventana **tapa el panel**: no se puede leer el paso mientras se escribe | No hay lugar para los dos. No se arregla con capas: se arregla **cambiando dónde va el texto** (ver el patrón) |
| 3 | Un paso `campo` dentro de la ventana **nunca se cumple** | Si la persona cancela, toca afuera o lo deja vacío, el campo desaparece sin llenarse. Y un `campo` **no muestra «Siguiente»**: solo queda «Pausar» o «Saltar» |
| 4 | El texto dice "mirá «X», abajo en esta misma pantalla" | Con la ventana abierta no se puede mirar: hay que cerrarla, y se borra lo escrito |
| 5 | La guía **retrocede sola** al paso que abre la ventana, con la ventana abierta | `volverSi` mal puesto (ver abajo) |

**Las capas**, para razonar sobre esto:

| Capa | Qué |
|---|---|
| `z-20` | El anillo que marca el elemento |
| `z-30` | El panel de la guía (en celular) |
| `z-40` | El cajón del menú |
| `z-50` | Los diálogos de confirmación |
| `z-[60]` | El panel de la guía **desde pantalla ancha** (1280 px o más) |
| `z-[1000]` | Los desplegables con portal: siempre arriba de todo |

La solución de capas para la señal 1: en pantalla ancha el panel queda **por encima** de los diálogos (no se tocan: la ventana, centrada y angosta, deja libre el lado del panel) y se toca sin cerrarla. En celular **no se puede**, y por eso existe el patrón.

## El patrón: la ventana se explica ANTES de abrirla

**El paso que abre la ventana lleva TODAS las instrucciones de adentro. El paso siguiente describe lo que se ve con la ventana cerrada.** Nunca un paso intermedio "dentro" de la ventana.

```ts
// Ejemplo real: «Cancelar una venta registrada por error» → 3 pasos
{ id: "elegir", ruta: "/cierres", ancla: "lista-cierres",
  texto: "Tocá la venta que se registró por error.",
  listo: { tipo: "ruta", patron: "/cierres/:id" } },

{ id: "anular", ruta: "/cierres/:id", ancla: "cierre-anular",       // ← el botón que ABRE la ventana
  texto: "Tocá «Anular». En la ventana leé lo que se anula, escribí qué estuvo mal en «Qué estuvo mal en el registro» y tocá «Anular el cierre». Cerrala con «Listo». No toques afuera de la ventana mientras escribís: se cierra y se borra lo escrito.",
  listo: { tipo: "manual", alTocar: true } },                        // ← se cumple al tocar el botón

{ id: "resultado", ruta: "/cierres/:id", ancla: "cierre-anulado-aviso",
  texto: "Cuando se cierre la ventana, arriba tiene que aparecer el aviso rojo «Cierre anulado» con el motivo.",
  listo: { tipo: "manual" } },                                       // ← lo que se ve con la ventana CERRADA
```

Antes de este arreglo la tarea tenía `resumen → motivo → confirmar`, tres pasos **dentro** de la ventana; el `motivo` era un `campo` que desaparece al cerrarla. Se trababa **siempre**.

Reglas del patrón:

1. **El texto del paso que abre lleva los nombres exactos** de cada campo y botón de adentro (entre « »; una prueba exige que existan en el código) y la advertencia **"no toques afuera: se cierra y se borra lo escrito"**.
2. **`alTocar: true` sobre el botón que abre**, y el ancla es **el botón**, no la tarjeta que lo contiene: con la tarjeta entera, cualquier toque (otro botón, una nota) avanza el paso sin que se haya abierto nada. `alTocar` es solo para un botón que hace lo que dice **al instante**, sin ir a la base.
3. **«Siguiente» en un paso `alTocar` aparece solo cuando el ancla del paso SIGUIENTE ya está en la pantalla** (el panel la mira). Elegí esa ancla a propósito: si es algo que existe de antemano (la lista), «Siguiente» aparece enseguida; si es el **resultado** (el aviso «Cierre anulado»), aparece cuando el resultado existe. Lo segundo es lo que querés.
4. **El último paso es `manual`**, empieza con "Cuando se cierre la ventana…" y dice qué tiene que verse. **No afirma lo que la guía no vio.**
5. **En el ÚLTIMO paso no escribas "tocá «Siguiente»"**: su botón se llama «Terminar» (o «Listo» en una pregunta). Escribí lo que tiene que verse: *"Cuando se cierre la ventana, el archivo tiene que aparecer en la lista de «Archivos»"*. En el paso anterior sí es «Siguiente», y ahí está bien decirlo.
6. **Si la ventana es una confirmación al FINAL de un formulario** que está en la página, el paso de guardar lo cuenta: *"Se abre una ventana para confirmar: tocá «Guardar» y, cuando se cierre, seguí con el botón de esta guía."*
7. **Mirá el piso de pasos.** Una tarea `acompana` lleva de 3 a 7. Si al juntar los pasos de adentro te quedaron 2, **no rellenes**: agregá un paso que sirva ("Mirá la semana: fijate que el envío no esté ya anotado" sirvió; "Tené a mano lo del envío" era relleno y se cambió).

## `campo` y `volverSi`: cuándo sí y cuándo no

`volverSi` significa: *"si el botón que abre esto **está en la pantalla**, se cerró: volvé al paso que lo abre"*. El motor lo mira **250 ms** después, y si el ancla existe en la página, retrocede. Todo el cuidado sale de ahí:

| Lo que abre el paso | `campo` adentro | `volverSi` |
|---|---|---|
| Un **formulario en la página** que reemplaza al botón al abrirse (estado del cliente, abre al instante) | ✅ sí | ✅ sí: si se cierra, el botón reaparece y la guía vuelve a "abrir" |
| Una **ventana** (modal, diálogo) | ❌ | ❌ el botón que la abre **sigue en la página, detrás**: el motor lo ve y retrocede con la ventana abierta |
| Un **editor que carga del servidor** (un enlace con parámetros) | ❌ | ❌ mientras carga, la lista y su botón siguen a la vista: pasan los 250 ms y retrocede |

La regresión real fue la tercera fila: `volverSi` en los términos del contrato. Al tocar «Cargar», la guía volvía sola a «Elegí el producto» **con el editor ya abierto**. Se **comprobó en un navegador real** antes de arreglarla, y se quitaron esos `volverSi`.

**Ante la duda, preferí el paso sin `volverSi`** a uno que retrocede mal: lo peor que pasa es que la persona toca «Siguiente» de más; lo otro la saca de lo que está haciendo.

Y un `campo` solo si el campo **no puede desaparecer sin llenarse**. Si la persona puede cancelar, tocar afuera o dejarlo vacío y el servidor lo acepta igual (como una "actividad económica" que se puede guardar vacía), pasalo a `manual`.

## Proceso (para un recorrido nuevo o para revisar uno)

1. **¿Algún paso ocurre dentro de una ventana?** Abrila a mano y mirá: ¿es un overlay sobre la página, un formulario que reemplaza el botón, o un editor que carga?
2. **Si es una ventana o un editor**: juntá sus pasos en el que la abre (regla 1), `alTocar` sobre el botón, y el resultado en el paso siguiente.
3. **Sacá todo `campo` y todo `volverSi`** que apunte a algo de adentro (tabla de arriba).
4. **Releé cada texto con la ventana abierta**: ¿manda a mirar algo que la ventana tapa? ¿dice "tocá Siguiente" antes del último paso?
5. **Corré las pruebas** (anclas, citas « », forma) y **probala en un navegador real**:
   - a **1440 px**: abrí la ventana, tocá el panel de la guía: **no** tiene que cerrarla;
   - a **390 px**: la ventana tapa el panel (es lo esperado): por eso las instrucciones van en el paso anterior;
   - completá la tarea de punta a punta con una cuenta de PRUEBA.
6. **Si dos revisores se contradicen sobre un `volverSi` o un `campo`, no votes: probalo.** Uno pedía sumarlo y otro quitarlo; el navegador real dijo cuál.

## Gotchas

- **El panel del navegador de una herramienta puede quedar en segundo plano** y no hidratar la página: las cargas directas se quedan en "Cargando…". Para probar ventanas, usá una pestaña visible.
- **Los clics automáticos que caen mientras el menú se acomoda** dan falsos negativos: esperá un respiro entre abrir y medir.
- **Una venta/registro de prueba** para completar la tarea de verdad: armalo de modo que no gaste numeración real ni mande mensajes, y anulalo al terminar.
- **Instrucciones que citan un nombre de botón** se rompen en silencio cuando alguien lo renombra: es lo que cubre la prueba de citas « ».

## Output esperado

- Recorridos donde cada ventana se explica en el paso que la abre, con `alTocar` sobre el botón y el resultado en el paso siguiente.
- Ningún `campo` ni `volverSi` sobre lo que vive dentro de una ventana o de un editor que carga.
- Un registro de lo probado a 1440 px y a 390 px.

## Ejemplo de revisión

**Input:** el recorrido "Marcar comisiones como pagadas" tenía `marcar` (tocar «Marcar pagadas») y `fecha` (un `campo` dentro de la ventana de confirmación).

**Output:** un solo paso que abre la ventana y trae todo lo de adentro:

> En el bloque de la persona, tocá «Marcar pagadas». En la ventana revisá la «Fecha en que se pagó» (viene la de hoy; cambiala si le pagaste otro día) y confirmá con «Marcar pagadas». No toques afuera de la ventana: se cierra y se borra lo escrito. Cuando se cierre, tocá «Siguiente».

Dos detalles de ese paso. Es `manual`, **sin** `alTocar`, porque su ancla es la lista entera de comisiones: con `alTocar` cualquier toque en la lista lo daría por cumplido (regla 2). Y por eso termina con "tocá «Siguiente»": la persona lo dice cuando la ventana ya se cerró.

El último paso dice **lo que de verdad pasa** al verlo en pantalla: con el filtro «Con factura» puesto, el bloque pagado **desaparece de la lista** (no pasa a «Pagada»), así que el texto dice *"Ese bloque sale de esta lista. Para verlas, elegí «Pagada» en «Estado»: ahí están con la fecha que pusiste."* Lo encontró la revisión: el texto original afirmaba algo que la guía no había visto.
