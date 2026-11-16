# Skill: Un workflow "activo" puede no estar recibiendo nada

> ⭐ Cross-project. Capturada 2026-09-02: el bot de un cliente llevaba **3 días
> mudo** con el workflow en verde, sin un solo error en ningún log.

## El caso, medido

`Level - Leo - YCLOUD` figuraba **activo**. Su última ejecución por webhook fue el
**30/08 a las 14:33**. Tres días sin recibir un mensaje, y nadie se enteró — porque
un workflow que no recibe **no falla**: no hay ejecución, no hay error, no hay log.
El tablero de n8n dice `[ON]` y el de YCloud está en verde.

La causa: su webhook escuchaba en el path `ycloud-leo`, y **ese endpoint no estaba
registrado en el proveedor**. YCloud tenía dos webhooks configurados, ninguno era
ese. El workflow estaba perfectamente sano, escuchando una puerta por la que ya no
pasaba nadie.

**La distinción que hay que tener en la cabeza:** "activo" es una propiedad del
workflow — dice que n8n lo ejecutaría si le llegara algo. **No dice nada sobre si
algo le llega.** Son dos sistemas distintos (tu n8n y el proveedor que entrega), y
solo uno de los dos lo estás mirando.

## Cuándo usar esta skill

- "El bot dejó de contestar" y no hay errores en ningún lado.
- Antes de dar por bueno que un flujo de n8n está funcionando.
- Cuando migrás un número, cambiás de proveedor o conectás un tenant nuevo: ahí es
  cuando los endpoints se reescriben y algo queda huérfano.
- **Al hacer inventario:** cualquier workflow `[ON]` que nadie mira hace semanas.

## Proceso

1. **Contá ejecuciones, no mires el toggle.** Es la pregunta correcta: ¿cuándo fue
   la última vez que este workflow REALMENTE corrió?
   ```bash
   curl -sL -H "X-N8N-API-KEY: $N8N_API_KEY" \
     "$N8N_HOST/api/v1/executions?workflowId=<id>&limit=5"
   # mirá startedAt Y mode: "webhook" = le llegó algo de afuera
   #                        "trigger" = lo despertó su propio schedule
   ```
   Un workflow con schedule corre igual aunque nadie lo use: **`mode` distingue
   "me despierto solo" de "me están hablando"**.

2. **Sacá el path del webhook del propio workflow.**
   ```bash
   node -e 'const w=require("./wf.json");
     w.nodes.filter(n=>/webhook/i.test(n.type))
      .forEach(n=>console.log(n.parameters.path))'
   ```

3. **Listá los endpoints registrados EN EL PROVEEDOR** y cruzá contra ese path.
   Esta es la verificación que nadie hace.
   ```bash
   curl -s -H "X-API-Key: $YCLOUD_API_KEY" \
     "https://api.ycloud.com/v2/webhookEndpoints?limit=100"
   ```
   Si el path no aparece, el workflow **no recibe** — por más verde que esté.

4. **Ojo con el alcance del endpoint.** En YCloud los webhooks son **por CUENTA, no
   por número**: un endpoint recibe los eventos de TODOS los números de la cuenta.
   Eso tiene dos caras — un número nuevo queda cubierto solo (no hay nada que
   configurar), pero también significa que **agregar un número a la cuenta lo
   engancha inmediatamente a los consumidores que ya estaban**, sin que nadie lo
   decida. Verificá qué otro flujo va a empezar a recibirlo.

## El hermano del bug: "success" ≠ "envió"

El mismo día, los otros dos workflows del cliente (`FOLLOWUP` cada 30 min,
`REACTIVACION` cada 4 h) figuraban en **`success`** en todas sus ejecuciones. En las
últimas 22 h la cuenta despachó 100 mensajes: **55 de un cliente, 45 de otro, 0 de
este**. Corrían perfecto y no mandaban nada.

Un workflow termina en `success` si ningún nodo tiró — y un nodo puede no tirar
porque su rama no se ejecutó (0 candidatos), porque el envío devolvió un 4xx que el
nodo tolera, o porque `onError: continueRegularOutput` — que es lo **correcto** en
producción — convirtió el error en un ítem silencioso.

**La verificación real nunca es el estado de la ejecución: es contar en el destino.**
Preguntale al proveedor cuántos mensajes salieron de ese número, o a tu base cuántas
filas se escribieron. Si la respuesta es 0 mientras el workflow dice `success`, el
`success` no significaba lo que creías.

## Gotchas

- **Un parámetro fuera de rango devuelve vacío, no un error.** Pidiendo
  `?limit=200` a la API de mensajes de YCloud volvieron **0 items**; con `limit=100`
  volvieron 100. Si una consulta de verificación da cero, probá bajar el límite
  antes de concluir que no hay datos — un cero falso te hace "confirmar" el bug
  equivocado.
- **Activar un workflow por API no siempre registra su webhook.** Un workflow creado
  y activado vía `POST /workflows/<id>/activate` respondía `active: true` y su
  webhook seguía dando **404 "not registered"**. Si necesitás ejecutar algo una vez,
  un `scheduleTrigger` de 1 minuto es más confiable que un webhook.
- **`git`/`tsc`/el linter no ven nada de esto.** No es un problema de código: el
  código está bien. Es un problema de cableado entre dos sistemas, y solo se ve
  midiendo.

## Output esperado

Para cada workflow que se dice "activo": la fecha de su última ejecución **por
webhook**, y la confirmación de que su path figura en la lista de endpoints del
proveedor. Si alguna de las dos falla, el workflow está vivo pero sordo — y hay que
decir desde cuándo, porque ese es el hueco de mensajes que nadie atendió.

## Ejemplo

**Input:** "El bot de Level no está contestando, pero el workflow está activo."

**Output:** última ejecución por webhook **30/08 14:33** (3 días) · su path es
`ycloud-leo` · los endpoints registrados en YCloud son `.../ycloud-webhook` y
`.../ycloud-inmobiliaria-demo`, **ninguno es ese** → el workflow no recibe desde que
se reconfiguraron los endpoints. Hueco de 3 días de mensajes entrantes sin procesar,
que hay que ir a buscar al proveedor.

## Relacionadas

[[verificar-funcionamiento-end-to-end]] · [[webhook-fanout-sin-reconciliacion]] ·
[[distinguir-detenido-a-proposito-de-roto]] · [[portar-bot-n8n-propio-al-crm]]
