# Skill: Lectura + Realtime sin hueco (el mensaje que cae entre la foto y el canal)

> Capturada el 2026-09-25 en el CRM de Momentum (Next.js + Supabase Realtime por broadcast), a partir de un
> reporte con captura del founder. Extiende `realtime-canal-muere-en-silencio`: aquella resuelve el canal
> que se CAE; esta resuelve lo que se pierde con el canal SANO, en los bordes entre una lectura y el stream.

## Cuándo usar esta skill

- *"El mensaje está en la base, la lista lo muestra, pero el chat abierto no — hasta que recargo."*
- Cualquier pantalla que arma su estado con una **lectura** (server component, fetch al abrir, re-sync) más un
  **stream en vivo** (Supabase Realtime, websockets, SSE, Firebase). O sea: casi cualquier chat, inbox, feed
  o tablero en tiempo real.
- Estás por agregar un "re-sync al reconectar", un caché por conversación o un "soltar caché" en una app así.
- Revisás un PR que toca la carga inicial o el manejo de eventos de una pantalla en vivo.

## Por qué existe (el caso, con los tiempos medidos)

Un lead mandó dos fotos, el bot pasó la conversación a una persona, el lead escribió *"Ud donde atiende?"*. El
founder abrió el chat desde el aviso de WhatsApp y **ese mensaje no estaba**. La lista de conversaciones sí lo
mostraba como último mensaje. Los tiempos, sacados de los logs de la API y de la base:

```
16:29:11.920  el server component lee los mensajes del chat        (la FOTO)
16:29:12.036  el lead escribe → INSERT en messages                 (116 ms después)
~16:29:17     el canal de Realtime queda SUBSCRIBED                (medido: ~5,4 s tras cargar)
```

El INSERT cayó entre la foto y la suscripción: la foto no lo traía y el canal todavía no escuchaba. **Se pierde
para siempre, sin un solo error.**

**Por qué la lista sí lo mostraba (la asimetría que despista):** un evento de *conversación* trae la fila
ENTERA (`to_jsonb(NEW)`), así que el siguiente UPDATE de esa fila —acá, marcarla leída al abrirla— la pone al
día sola, preview incluido. Una lista de *mensajes* solo SUMA INSERTs: si uno no llegó, ningún evento posterior
lo repone. **Lo que se actualiza por reemplazo se cura solo; lo que se arma por agregado, no.** Por eso el
síntoma es "la lista dice una cosa y el chat otra".

## Los 4 huecos (dónde la foto y el stream no se tocan)

1. **Primera carga → primer SUBSCRIBED.** Entre la lectura del server y el join del canal pasan segundos
   (hidratación + auth + join). Medido: **5,4 s** en producción. Cada carga de la pantalla es una ventana ciega.
2. **Abrir algo que no estaba cargado.** El manejador típico descarta el evento si la lista no existe
   (`if (!list) return prev`, "se cargará al abrirla"). Mientras viaja la consulta de apertura, un INSERT se
   descarta, y la respuesta de la consulta —tomada antes— tampoco lo trae.
3. **Un re-sync que pisa.** El re-sync (al reconectar, al volver a la pestaña) toma la foto, mientras tanto
   entra un evento en vivo y se pinta, y cuando la foto llega REEMPLAZA la lista: el evento desaparece.
4. **El rejoin por token vencido no re-sincroniza.** El patrón de `realtime-canal-muere-en-silencio` guarda
   `degraded = true` en una variable **local al canal viejo** y rearma el canal con un nonce: el canal nuevo
   nace con `degraded = false` y su SUBSCRIBED no dispara el re-sync. El caso que más importaba (el
   vencimiento) quedaba sin poner al día.

## El arreglo (dos piezas, las dos)

### (1) Re-sincronizar en el PRIMER SUBSCRIBED de cada canal, no solo al volver de una caída

```js
let degraded = false;
let sincronizado = false;              // por canal: el canal nuevo de un rejoin también lo hace
channel.subscribe((status) => {
  if (disposed) return;
  if (status === 'SUBSCRIBED') {
    if (rejoinTimer) { clearTimeout(rejoinTimer); rejoinTimer = null; }  // volvió solo: el rejoin sobra
    if (degraded || !sincronizado) {
      degraded = false;
      sincronizado = true;
      void conFoto(onResync);         // lee la base DESPUÉS de estar escuchando
    }
    return;
  }
  // ... CHANNEL_ERROR / TIMED_OUT / CLOSED como en realtime-canal-muere-en-silencio
});
```

Leer después de estar suscripto cierra el hueco 1 y el 4: todo lo anterior al SUBSCRIBED lo trae la lectura,
todo lo posterior llega por el canal (y lo que está en los dos se deduplica, ver abajo).

### (2) Toda lectura que escribe estado pasa por un coordinador: foto + eventos en vuelo re-aplicados

```ts
export function crearCoordinadorDeLecturas<E>() {
  let lecturas = 0;
  let guardados: E[] = [];
  let aplicar: ((e: E) => void) | null = null;
  return {
    usarManejador(fn: ((e: E) => void) | null) { aplicar = fn; },
    recibir(e: E) {                               // entrada de CADA evento del stream
      if (lecturas > 0) {
        guardados.push(e);
        if (guardados.length > 1000) guardados.shift();   // tope: una lectura colgada no crece sin fondo
      }
      aplicar?.(e);                               // se aplica YA: la pantalla sigue viva
    },
    async conFoto(leer: () => void | Promise<void>) {
      lecturas += 1;
      try { await leer(); }                       // leer() escribe la foto en el estado
      finally {
        lecturas -= 1;
        if (lecturas === 0 && guardados.length) {
          const p = guardados; guardados = [];
          for (const e of p) aplicar?.(e);        // lo que llegó mientras viajaba, ENCIMA de la foto
        }
      }
    },
  };
}
```

Envolvé con `conFoto` las tres lecturas: la del re-sync, la de abrir un chat y la del primer SUBSCRIBED.
Cierra los huecos 2 y 3.

**Requisito que no es opcional:** los manejadores tienen que ser **idempotentes** (INSERT deduplica por id,
UPDATE reemplaza la fila). Un evento se aplica dos veces —al llegar y al re-aplicar— y tiene que dejar lo
mismo que una. Si algún manejador hace `push` sin mirar el id, primero arreglá eso.

**Con React:** la foto es un `setState` y el re-aplicado son `setState(updater)` encolados después; React los
procesa en ese orden. Instanciá el coordinador con `useState(() => crear…())` (una instancia estable por
montaje) y pasale el manejador del canal con `usarManejador` dentro del efecto (y `null` en el cleanup).

## Lo que rompe el arreglo si lo hacés a medias (lo encontró la revisión, uno lo introducía el propio fix)

Un revisor independiente encontró 4 problemas importantes en la primera versión. **El primero lo creaba el
arreglo**: vale leer la lista entera antes de dar esto por cerrado.

| Qué | Escenario | Fix |
|---|---|---|
| **Algo async RECREA a medias el caché que soltaste** (lo introducía el fix) | El re-sync suelta el caché de los chats no abiertos. Un envío en otro chat termina después (`prev[id] ?? []`) → crea la lista con UN mensaje → al reabrir, "ya hay caché", no se lee la base → chat vacío, sin error | Todo lo que termina tras un `await` cambia la lista **solo si existe**: `enLaListaCargada(prev, id, fn)` |
| Caché viejo del chat al que cambiaste durante el re-sync | El re-sync leyó el chat A; el usuario abrió B, que tenía caché de antes de la caída | Al terminar, si el abierto cambió, leerlo también |
| La foto borra los optimistas | Un mensaje enviándose (`tmp-*`) no existe en la base; la foto lo pisa; si el envío falla, el "no enviado" busca un id que ya no está | Al escribir la foto, sumar los `tmp-*` que no vengan en ella |
| Una lectura PARCIAL reemplaza la lista | Una página con error (`leerTodo` devuelve lo que tenía) → inbox con conversaciones de menos. Y ahora el re-sync corre en CADA carga | La lectura informa `completa`; si no, no se escribe |
| Caché `[]` por una apertura fallida | `data ?? []` → queda vacío y "con caché" para siempre | Si la lectura falla, no escribir nada (un clic nuevo reintenta) |
| Salto de scroll | La foto trae un array nuevo aunque no cambie nada → auto-scroll al fondo a quien leía el historial | Si el contenido es igual, devolver la MISMA referencia |
| Doble re-sync en cada corte | El mismo canal vuelve solo (SUBSCRIBED → re-sync) y además el rejoin programado arma otro canal (otro re-sync) | En SUBSCRIBED, cancelar el rejoin pendiente; en el `then` del refresh, no programar si ya no está degradado |

## Cómo probarlo (sin depender de la suerte del timing)

La carrera real no se reproduce a mano. Se prueba la lógica pura contra un estado de mentira con los
manejadores reales:

1. **El caso real como test:** `conFoto` cuya lectura, mientras "viaja", recibe el INSERT del mensaje y
   después escribe una foto sin él → al final el mensaje TIENE que estar.
2. **Control negativo obligatorio:** el mismo escenario sin `conFoto` → el mensaje falta. Si este test no
   falla con el código viejo, tu test no discrimina.
3. **Prueba de mutación:** apagá a propósito el re-aplicado (`for (const e of p) aplicar?.(e)` → nada) y corré
   la suite: tienen que caer varios. En el CRM cayeron 5 de 10; uno que seguía pasando no discriminaba y se
   reescribió.
4. **En producción, que el re-sync corre de verdad:**
   ```js
   performance.getEntriesByType('resource')
     .filter(e => /supabase\.co\/rest\/v1\/(conversations|messages)/.test(e.name))
     .map(e => Math.round(e.startTime) + 'ms ' + e.name.split('/rest/v1/')[1].split('?')[0])
   ```
   Tiene que aparecer una lectura de la lista + la del chat abierto **segundos después** de la carga (la del
   SUBSCRIBED). Así se midió el hueco de 5,4 s.

## Cómo diagnosticar un "no aparece" real (antes de tocar código)

1. **¿Está en la base?** Buscá la fila con su `created_at` exacto. Si no está, es otro bug (webhook, fan-out).
2. **¿Cuándo leyó la pantalla?** En los logs de la API (edge logs de Supabase) buscá el GET de los mensajes de
   esa conversación hecho por el server (`node`) y compará el timestamp con el `created_at` de la fila. Si la
   lectura es ANTERIOR por milisegundos y el navegador no pidió nada después, es este hueco.
3. **¿La lista y el chat discrepan?** Es la firma: la fila de la conversación se curó con un UPDATE posterior,
   la lista de mensajes no.

## Costo y alternativas (anotadas, no aplicadas)

- El re-sync del primer SUBSCRIBED **repite la lectura más pesada** en cada carga. Va en segundo plano (no
  frena el render), pero es un viaje más. Alternativas si pesa: leer solo lo cambiado desde la hora de la
  foto del server (con margen), o `config.broadcast.replay: { since, limit }` (visto en realtime-js 2.106.2) para
  canales privados (tope 25 eventos: cubre el hueco de la carga, no una caída larga; verificar que el
  proyecto lo tenga activo).

## Verificación (Definition of Done)

- [ ] Test con el caso real (evento en vuelo durante la foto) + control negativo + prueba de mutación.
- [ ] Cada canal nuevo —el del montaje y el de cada rejoin— hace un re-sync al quedar SUBSCRIBED (visto en la
      red del navegador en producción, no supuesto).
- [ ] Ninguna actualización que termina tras un `await` crea una lista que no existía (`grep "?? \[\]"` en los
      `setState` de la pantalla).
- [ ] Una lectura fallida o parcial no reemplaza lo que se ve.
- [ ] Revisión independiente del diff: esta clase de bug esconde el siguiente en el propio arreglo.
