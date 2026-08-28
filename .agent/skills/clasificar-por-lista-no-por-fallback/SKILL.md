# Skill: Clasificar por lista explícita, no por rama fallback

## Cuándo usar esta skill

- Un Switch/router/`default:` tiene N ramas nombradas y **una rama "todo lo demás"**, y esa rama produce un **efecto hacia afuera**: un mensaje al cliente, un correo, un cobro, un ticket.
- Vas a **cablear una salida fallback que hoy está muerta** para rescatar un caso que se estaba perdiendo (ver `bot-whatsapp-unsupported-fallback` — esa es exactamente la jugada que crea este bug).
- El proveedor (BSP, pasarela, CRM ajeno) puede inventar un tipo de evento nuevo mañana y vos no te vas a enterar.
- Aparece un reporte tipo "el bot le contestó cualquier cosa a un cliente" y el input que ves en la traza es un marcador genérico, no un mensaje.

**No usar** para un `default:` que solo loguea o descarta: si la rama no sale al mundo, ser un cajón de sastre está bien y es lo correcto.

## Por qué existe esta skill

Capturada el **2026-08-28** en el CRM de Momentum. El Switch `Is Text or Audio or Image?` tenía 3 ramas (`text`/`audio`/`image`) y un fallback cableado a "decile al lead que no pudiste abrir su mensaje".

Un lead reaccionó con un ❤️ a un mensaje del bot. El bot le contestó *"No me llegó bien el mensaje, podrías contarme por texto?"*. El lead preguntó **"Esto es IA?"**. El bot dijo que era humano. El lead volvió a reaccionar con ❤️, el bot volvió a disculparse, y el lead cerró con:

> *"No parece porque has caído dos veces en el mismo error."*

Al contar los datos, el cajón tenía **72 eventos que no merecían la disculpa** (`reaction` 35, `revoke` 25, `edit` 12) contra **54 que sí** (`unsupported` 46, `sticker` 4, `video` 2, `contacts` 1, `document` 1). **Más de la mitad de lo que caía ahí estaba mal clasificado**, y venía así desde hacía dos meses y medio sin un solo error en ningún log.

Lo peor: el evento `edit` **trae el texto completo** del mensaje corregido. El bot tenía el mensaje en la mano y le contestó "no pude abrir el archivo" a un pitch comercial de 200 palabras, tres veces al mismo prospecto.

## La pregunta que lo desenmascara

> **¿Esta rama le habla a alguien de afuera? Si sí, no puede definirse por exclusión.**

Una rama fallback responde *"todo lo que no reconocí"*. Eso incluye, por construcción: los tipos que existen y no listaste, los que el proveedor agregue después, y los eventos que ni siquiera son mensajes. Si esa rama produce salida visible, cada uno de esos casos es un mensaje equivocado a un cliente real — sin excepción, sin error, sin log.

**El corolario que casi nadie ve:** cablear una salida fallback que estaba muerta no es "rescatar un caso". Es **suscribirte a todos los valores desconocidos, presentes y futuros, de ese campo**.

## Proceso

### 1. Contar antes de tocar

No listes los tipos de memoria ni de la documentación del proveedor. Contalos:

```sql
select raw_payload->'whatsappInboundMessage'->>'type' as tipo, count(*),
       min(received_at) as primero, max(received_at) as ultimo
from public.webhook_events_raw
where event_type = 'whatsapp.inbound_message.received'
group by 1 order by 2 desc;
```

Partí el resultado en dos columnas: **merecen el efecto** / **no lo merecen**. Si la segunda columna no está vacía, tenés este bug.

Hermana obligatoria: `webhook-contar-event-types-antes-de-arreglar`. Ahí se cuenta por `event_type`; acá por el `type` de adentro del payload. Son **dos ejes distintos y los dos mienten por separado** — se puede tener el `event_type` bien cubierto y el `type` interno mal clasificado, que es exactamente este caso.

### 2. Verificar que la lista se puede cerrar

Antes de convertir un cajón abierto en lista cerrada, confirmá que **no hay eventos con el campo ausente o vacío**:

```sql
select count(*) from public.webhook_events_raw
where event_type = 'whatsapp.inbound_message.received'
  and coalesce(raw_payload->'whatsappInboundMessage'->>'type','') = '';
```

Si eso da > 0, cerrar la lista **descarta tráfico real**. Ese es el riesgo propio de esta skill: hay que medirlo, no suponerlo.

### 3. Tres ramas, no dos

- **Whitelist explícita** → el efecto hacia afuera (la disculpa, el aviso, el cobro).
- **Ramas de contenido recuperable** → procesarlo. Si el evento trae el texto (`edit`), **usalo**: disculparse por un mensaje que tenés en la mano es peor que no contestar.
- **Descarte con NOMBRE** → un NoOp llamado `Descartar Evento Sin Contenido`, con `notes` explicando qué cae ahí y por qué. Una rama colgando en el vacío hace que "no contestó a propósito" sea indistinguible de "está roto" (ver `distinguir-detenido-a-proposito-de-roto`).

### 4. Elegir el lado barato de fallar

Para un tipo **desconocido**, decidí explícitamente y escribilo en el sticky o el comentario:

| Sistema | Modo caro | El desconocido va a |
|---|---|---|
| Bot de cara al cliente | hablar de más | **descarte** |
| Cobros, permisos, alertas | callarse | **la rama que avisa** |

Familia: `config-que-deja-el-sistema-mudo` — ahí el fallo caro es el silencio; acá es el ruido. Es la misma decisión con el signo invertido, y por eso hay que tomarla a mano cada vez.

### 5. Insertar la rama donde ya está el cableado

**El paso que rompe todo si lo hacés "ordenado".** Poné la whitelist en el índice de salida donde el fallback ya estaba conectado, y las ramas nuevas después. Así el diff de `connections` es **puramente aditivo** y ninguna conexión existente se mueve. Reordenar "para que quede lógico" es un off-by-one que **desconecta justo el caso que el fallback rescataba** — o sea, reintroduce en silencio el bug anterior.

Dejá el porqué del orden escrito en el sticky, o el próximo que pase lo "acomoda".

Después, asertá el cableado contra una **constante hardcodeada**, no contra lo que acabás de leer del sistema vivo. Comparar el estado contra sí mismo es un espejo, no una verificación.

### 6. Guard por contenido en la persistencia

Si hay un nodo que inserta el evento entrante en la base, va a escribir filas con `body` nulo para los eventos sin contenido → **burbuja vacía** en la bandeja. El guard correcto no es una lista de tipos (se desactualiza igual que la otra): es `body no vacío OR media no vacía`. Mata la clase entera sin lista que mantener.

## Cómo se verifica (y cómo el test miente)

Marcá **caso por caso si discrimina**. Un test que pasa igual con el bug presente es una guarda de regresión, no evidencia de que arreglaste algo:

| Caso | ¿Discrimina? |
|---|---|
| reacción / borrado / tipo inventado que no existe | **SÍ** |
| evento con contenido recuperable (`edit`) | **SÍ** |
| el caso que el fallback rescataba (clic de anuncio) | NO — regresión |
| texto / audio / imagen normales | NO — regresión |

**La trampa concreta:** en el caso del clic de anuncio, con el off-by-one **el bot igual responde** — responde mal. Si el que corre la prueba mira "¿hubo respuesta?", pasa en falso. Hay que verificar **la ruta de ejecución**, no que hubo salida.

Y si tocás una expresión compartida, no confíes en el diff: **ejecutá la vieja y la nueva** sobre los casos reales y compará el output. Acá fueron 15 casos, 14 idénticos byte por byte, y el 15º difería por una colisión de marcador que ya existía desde antes del cambio.

## Gotchas

- **El marcador se consume antes del batching.** Si el flujo junta mensajes en Redis o en memoria antes del agente, el marcador interno tiene que resolverse **antes** de ese punto, o el agente se lo come y lo repite de cara al cliente.
- **`notEmpty` no trimea.** Un texto de solo espacios pasa el chequeo y entra como contenido válido.
- **El texto de cara al cliente sale de la config del tenant**, nunca literal en el flujo compartido (`config-por-tenant-no-literal-en-el-flujo`).
- **Arreglar el bot no arregla la bandeja.** Si otro consumidor del mismo webhook (una Edge Function, un worker) también clasifica mal, el bot va a responder bien y la UI va a seguir mintiendo. Anotalo **antes** de mirar la pantalla y creer que el fix falló.
- **No hay error, log ni test que agarre esto.** Funciona perfecto para los tipos que sí listaste. El único detector es contar.

## Output esperado

1. Tabla medida de tipos, partida en *merece el efecto* / *no lo merece*.
2. Switch con whitelist + ramas de contenido recuperable + descarte nombrado.
3. Script de build idempotente con la aserción del cableado contra constante.
4. Matriz de pruebas con la columna **¿discrimina?** marcada caso por caso.

## Ejemplo

**Input:** *"El bot le dijo a un lead 'no pude abrir el mensaje' y el lead nos preguntó si era una IA."*

**Output:** el `count(*)` por tipo muestra 72 eventos mal clasificados contra 54 bien clasificados. El Switch pasa de

```
text | audio | image | <todo lo demás → disculpa>
```

a

```
text | audio | image | media_no_legible (whitelist → disculpa) | edit (procesa el texto) | <resto → descarte nombrado>
```

con `main[0..3]` sin moverse, para no desconectar el clic de anuncio que ese fallback rescataba.
