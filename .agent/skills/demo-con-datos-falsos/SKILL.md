---
name: demo-con-datos-falsos
description: Poner datos de prueba en producción para mostrarle un sistema al cliente, sin mentirle y sin dejar basura. Usar cuando alguien pide "metele datos para ver cómo se ve" en una base real.
---

# Demo con datos falsos, sin mentir

**Cuándo:** el sistema está vacío porque el cliente todavía no lo usó, y hay que
mostrarle "cómo se vería con datos". La base de producción es la única que hay.

**El riesgo real no es técnico.** El dato de prueba es reversible casi siempre.
Lo que no se deshace es que el cliente lo crea.

---

## 1. Las filas de demo son INVENTADAS y ROTULADAS. Nunca las del cliente.

La tentación es tomar 10 registros que ya existen y pintarlos. **No.**

> **Pasó (2026-07-16, CRM de un asesor de inversiones):** se marcaron 10 leads
> reales con producto, y 3 como clientes cerrados con monto. Eso dejaba a dos
> prospectos de verdad —gente con nombre y apellido— figurando como que le
> habían comprado $38.500 y $62.000. Si el cliente lo ve y lo cree: deja de
> prospectarlos, o se acuerda mal dentro de un mes. **El dato se borra; lo que
> él recuerde, no.**

**En su lugar:** crear filas nuevas con un prefijo visible (`DEMO — Ana Solís`).

Por qué el prefijo y no un flag en la base: **se ve en todas partes sin tocar
código** — la tabla, el tablero, el embudo, los reportes, los desplegables. Un
`is_demo = true` obliga a acordarse de mostrarlo en cada pantalla, y no te vas a
acordar en todas.

Ventaja doble: **limpiar es borrar filas que no le importan a nadie**, no
restaurar un estado anterior. El borrado duro acá está bien: son datos que nunca
debieron existir, no hay historial que preservar.

## 2. El deshacer se escribe ANTES del cambio

No después, no "cuando terminemos". Antes. Y si la demo toca filas reales
(evitalo, pero si no hay opción):

- **Snapshot del estado exacto de antes**, a disco.
- **Imprimirlo también en la consola**, para que quede en la transcripción de la
  sesión. Si el archivo se pierde, el estado sigue siendo reconstruible.
- El script de deshacer **restaura solo lo que tocaste**, por id. Nunca
  "borrá todos los X": para cuando corra, el cliente puede haber cargado datos
  de verdad, y un borrado a lo bruto se los lleva puestos.

## 3. Nunca verificar contra un TOTAL FIJO

El chequeo obvio es `total == 54`. **Está mal en cualquier sistema que reciba
datos solo** (webhooks, integraciones, formularios públicos).

> **Pasó:** el script de limpieza esperaba 54 leads y encontró 55. Casi lo trato
> como un bug mío. **Era un lead real**: alguien había aceptado una conexión de
> LinkedIn 20 minutos antes y el webhook lo creó. El chequeo hizo lo correcto —
> paró y obligó a mirar— pero por el motivo equivocado.

**Verificar contra lo que TOCASTE**, no contra el total: *"leads con el prefijo
DEMO: 0"*, *"leads reales tocados: 0"*. Y dejar el porqué escrito en el script,
porque el próximo que lo lea va a querer "arreglar" el número.

## 4. Buscar lo que NO es reversible antes de apretar enter

Esto es lo que hay que pensar de verdad. La mayoría del dato falso se borra. **Lo
que sale por la puerta, no.** Antes de crear filas de demo, preguntarse qué pasa
si alguien aprieta el botón de al lado:

| Lo irreversible | Cómo muerde |
|---|---|
| **Correos falsos** | `@ejemplo.test` (o cualquier TLD reservado) **nunca resuelve** → rebote duro. Un envío = N rebotes contra el dominio verificado del cliente. **La reputación de envío no se arregla con un script.** |
| **Envíos reales** | El botón "Enviar" del demo puede mandarle a los contactos REALES del cliente. |
| **Webhooks salientes** | Una fila de demo puede disparar una notificación a un sistema de terceros. |
| **Facturación / SMS** | Cualquier cosa que cueste plata por unidad. |

**Regla:** los campos que disparan algo hacia afuera (email, teléfono, webhook
URL) van en **NULL** en las filas de demo. No con un valor falso: **en null**.
Una fila de demo no necesita correo para demostrar un embudo.

> **Pasó:** los 10 leads de demo se crearon con `demo.ana@ejemplo.test`. El
> contador de la pantalla de boletines pasó de 53 a 63 destinatarios. Un clic en
> "Enviar" eran 10 rebotes duros. Se cazó de casualidad, mirando otra cosa.

## 5. Que la demo muestre la HONESTIDAD del sistema, no solo lo lindo

Si el sistema tiene avisos de "este dato está incompleto", **armá la demo para
que se disparen**. Es lo que más vale mostrarle al cliente: no que los números
son grandes, sino que **el sistema le avisa cuando no sabe**.

> Se dejó a propósito un cliente ganado **sin monto registrado**, para que el
> aviso *"1 cliente ganado no tiene monto, así que este total es menor que la
> realidad"* apareciera en pantalla. Y se le pusieron valores estimados a los no
> cerrados, para que se viera la diferencia entre *cobrado* y *estimado*.

Una demo donde todo está perfecto no enseña nada — el cliente no va a vivir ahí.

## 6. Decirlo en voz alta, y ponerle fecha de muerte

- Dejar en el handoff **qué hay, dónde, y el comando exacto para borrarlo**, al
  principio del archivo y no al final.
- **El primer pendiente del día siguiente es borrarlo.**
- Los scripts de demo van **untracked** (prefijo `_tmp-`): no se commitean.

---

## Checklist

```
[ ] ¿Las filas son inventadas y con prefijo visible?   → si tocás filas reales, snapshot ANTES
[ ] ¿El script de deshacer existe YA y restaura por id?
[ ] ¿Los campos que disparan algo hacia afuera están en NULL?
[ ] ¿La verificación mira lo que toqué, no un total fijo?
[ ] ¿La demo dispara los avisos de honestidad del sistema?
[ ] ¿El handoff dice qué hay y cómo borrarlo, arriba de todo?
[ ] ¿Está agendado el borrado?
```

## Lo que NO hay que hacer

- **Poner un banner "MODO DEMO" en el código.** Es un cambio de código + deploy
  para un dato que vive un día, y después queda ahí para siempre. El prefijo en
  el nombre logra lo mismo y se va solo con la fila.
- **Confiar en que el cliente entienda que es falso porque se lo dijiste.** Va a
  entenderlo mañana. La pregunta es qué recuerda en tres semanas.
- **Dejar la demo "un ratito más".** Si no se borra el mismo día, se queda.
