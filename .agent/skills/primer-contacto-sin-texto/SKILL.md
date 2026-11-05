# Skill: Primer contacto por anuncio que llega sin texto

> Capturada el 2026-09-24 en el CRM de Momentum (bot de WhatsApp como código + webhook de YCloud en una
> Edge Function de Supabase). Es la versión "motor en código" de `bot-whatsapp-unsupported-fallback`, que
> resolvió el mismo síntoma dentro de un flujo de n8n.

## Cuándo usar esta skill

- Tenés anuncios **click-to-WhatsApp** y aparecen leads que "escribieron" pero **nunca recibieron respuesta**,
  o en el inbox ves un aviso tipo "mensaje no disponible / no compatible" como único mensaje de la conversación.
- En el webhook entra `type: "unsupported"` con el error de Meta **`131060`** ("This message is unavailable").
- El reporte por campaña muestra un grupo "Sin atribución" más grande de lo que debería: tráfico que pagaste
  contado como orgánico.
- Estás armando el bot de un cliente nuevo que va a correr anuncios. Conviene aplicarla ANTES de encender la
  pauta, no después de perder los primeros leads.

## Qué pasa (el mecanismo)

1. El lead toca el anuncio. WhatsApp le abre el chat con el mensaje del anuncio ya escrito y le da enviar. En
   **su** teléfono el mensaje sale con su palomita: para él, escribió y está esperando.
2. Meta entrega ese primer mensaje al BSP como `unsupported`, error `131060`, **sin el texto y sin `referral`**.
   Meta lo documenta como comportamiento esperado del primer mensaje ("first-time messaging"). No es un bug
   tuyo y no hay nada que reconstruir: el contenido no existe del lado del BSP.
   ⚠️ **Corregido el 2026-11-05:** desde el 27-10 el contenido SÍ llega, segundos después y con el mismo
   wamid, en el 85 % de los casos. Ver el apéndice al final antes de aplicar esta skill.
3. Si guardás ese evento como aviso del sistema (lo correcto, ver paso 2 del proceso), **no es un mensaje del
   lead y no pide turno**. Resultado: el lead más caliente que existe, uno que viene de plata de anuncios, no
   recibe nada. Y sin `referral` tampoco hay `ad_id`, así que el reporte lo cuenta como orgánico.

**Medido en producción (60 días, 5 negocios):** 61 primeros contactos así; **34 nunca volvieron a escribir**
y **10 no recibieron ningún mensaje saliente**, ni del bot ni de una persona. De 59 leads, **57 quedaban sin
atribución**. En 3 de 4 negocios el 85–94 % de los leads venían de anuncios: el bot sí atendía la gran
mayoría, el hueco era solo este subconjunto sin texto — pero era tráfico pago perdido al 100 %.

## Proceso

1. **Medir antes de tocar nada.** Cuántos eventos `131060`, cuántos leads nunca volvieron a escribir, y cuántos
   no tienen NINGÚN mensaje saliente después. La tercera cifra es la que importa: "no volvió a escribir" no es
   lo mismo que "nadie le contestó" (a varios les escribe una persona desde el inbox).
   ```sql
   -- leads con el aviso de primer contacto sin texto, y cuántos nunca recibieron nada
   with avisos as (
     select distinct lead_id from messages
     where sender_kind = 'system'
       and media_metadata->>'causa_no_disponible' = 'primer_contacto_anuncio'
   )
   select count(*) as leads,
          count(*) filter (where not exists (
            select 1 from messages m where m.lead_id = a.lead_id and m.direction = 'outbound'
          )) as nunca_recibieron_nada
   from avisos a;
   ```
2. **Guardar el evento como aviso del SISTEMA, nunca como mensaje del lead.** Si lo guardás como `lead`, el
   inbox le atribuye una burbuja que no escribió y el bot lo lee en su memoria como si lo hubiera dicho.
3. **Abrir turno SOLO si es el primer contacto.** Dos condiciones, las dos necesarias:
   - el lead **no tiene ningún mensaje propio** en la conversación (si escribió, ese mensaje tiene su turno y el
     saludo llegaría encima). Ante un error al leerlo, fallar hacia "ya escribió": es mejor no saludar que
     saludar sobre una charla en curso;
   - el aviso **se insertó en esta pasada** (el BSP reintenta; un reintento no vuelve a saludar).
4. **Decirle al modelo qué pasó, sin inventar un mensaje del lead.** El turno necesita un texto de entrada: que
   sea una línea que *dice* ser del sistema (`[sistema] El lead escribió desde un anuncio y el texto no llegó`),
   más un aviso en el bloque de decisiones con tres prohibiciones: **no adivinar qué preguntó, no pedirle que
   repita el mensaje, no mencionar ninguna falla**. Que lo salude como a alguien que llega interesado y le
   pregunte qué busca. Si el negocio tiene una **bienvenida fija**, que salga esa: el saludo es texto fijo, no
   se le pide al modelo.
5. **Atribuir a un grupo propio, "Anuncio sin identificar" — también SOLO si es el primer contacto.** Guardar
   `utm_source`, `utm_medium`, un `utm_campaign` fijo para el grupo y un campo `origen_inferido` que diga POR QUÉ
   se marcó así. **Nunca un `ad_id`**: lo único seguro es que vino de un anuncio, no de cuál. Y first-touch: si
   el lead ya tiene una atribución real, no se pisa.
6. **Ordenar el grupo DETRÁS de los anuncios reales** en cualquier ranking por conversión, y antes de "Sin
   atribución". Es una mezcla de varios anuncios: si compite, puede quedar primero con mejor conversión que
   cualquier anuncio real, y en una mezcla no se puede poner plata. (Mismo razonamiento que
   `porcentaje-necesita-minimo-muestra`.)
7. **Revisar TODAS las pantallas que leen la atribución**, no solo el reporte. La ficha del contacto y el panel
   del inbox tienen su propia lógica de "qué anuncio trajo a este lead", y sin una rama propia le arman la
   tarjeta de un anuncio concreto a algo que no lo es. Buscar a todos los consumidores de la columna antes de
   dar por hecho el cambio (`grep` por el nombre de la columna y por la función que la interpreta).
8. **Si la clave del grupo vive en dos runtimes** (un webhook en Deno que no puede importar del front, por
   ejemplo), **una prueba las ata**: que lea el archivo del webhook y exija la misma cadena. Comprobar que la
   prueba discrimina cambiando una de las dos a propósito.
9. **Recuperar lo histórico con un backfill reversible.** Marcar cada fila tocada (`backfill: '<fecha>'`),
   confirmar ANTES que todas tenían el mismo valor previo (así deshacer es una sola instrucción), y verificar
   después con la función real del reporte que caen en el grupo nuevo. El backfill aplica la misma condición de
   primer contacto que el paso 5.
10. **Desplegar el webhook con cuidado** (ver gotchas: `--no-verify-jwt`).

## Gotchas (errores que ya se cometieron)

- ⭐ **`131060` NO significa "vino de un anuncio".** Meta usa el mismo error para mensajes que llegan desde un
  dispositivo vinculado (WhatsApp Web, tablet, un segundo teléfono) y en coexistencia. Lo único que lo vuelve
  "clic de anuncio" es que sea **el primer mensaje** de la conversación. Medido al revisar un backfill de 76
  leads: **2 tenían el `131060` en medio de la charla**, con 18 y 9 mensajes previos del lead — eran orgánicos
  y quedaron contados como tráfico pago. El turno ya tenía la condición de primer contacto; la atribución no.
  La condición va en los dos lugares.
- **La atribución puede no estar donde creés.** En este CRM vive en la columna `leads.attribution`, no dentro
  de `extra`; la tabla vieja de atribución ya no existía. Una primera medición mirando `extra` dio "0 leads de
  anuncio en 1.949". Cuando un número da cero sobre miles, la medición está mal hasta probar lo contrario.
- **Una pantalla que nadie revisó da la causa equivocada.** La ficha del contacto mandaba estos leads a la
  tarjeta de "Vino de este anuncio" y decía "Meta no mandó el texto de este anuncio, suele pasar con un posteo
  promocionado". No faltaba el texto: faltaba el anuncio entero. Se revisó el reporte y el orden, no la ficha.
- **Deploy de una Edge Function sin entrada en `config.toml`.** Sin `--no-verify-jwt` se le activa la
  verificación de JWT, y el BSP (que autentica por HMAC, no manda JWT) deja de poder entrar — **para todos los
  clientes**, no solo para el que estabas arreglando. Confirmar `verify_jwt: false` antes y después por la
  Management API, y mirar qué commits tocaron la función desde la última versión: sale entera y puede arrastrar
  trabajo a medias de otra sesión. Mergear NO la despliega.
- **La prueba obvia no prueba nada.** "El bot contestó" o "la función respondió 200" no dicen si se atribuyó
  bien ni si el turno salió por la rama correcta. Verificar contra la base (fila en la tabla de turnos, la
  atribución guardada) y con las funciones reales del reporte, no con una reimplementación.
- **El código cierra la causa, no rescata a los perdidos.** Los leads históricos que nunca recibieron nada
  siguen esperando: hay que escribirles a mano, y pasadas las 24 horas de WhatsApp, con plantilla.

## Output esperado

- Webhook: el evento `unsupported` + `131060` se guarda como aviso del sistema; si es el primer contacto,
  despacha turno con una marca explícita y atribuye el lead al grupo "Anuncio sin identificar".
- Bot: saluda sin inventar lo que el lead dijo (o manda la bienvenida fija del negocio).
- Reporte: el grupo nuevo aparece detrás de los anuncios reales; la ficha y el inbox le dan su propia rama.
- Histórico: backfill reversible con marca, verificado con la función del reporte.
- Pruebas: aviso presente/ausente, orden del ranking, clave compartida entre runtimes — cada una con su control
  negativo y comprobado que discrimina.

## Ejemplo

**Input:** "Me llegó un mensaje de un lead y el bot no contestó nada. En el inbox solo hay un aviso que dice
que escribió desde un anuncio y Meta no entregó el contenido."

**Output:**
1. Diagnóstico: el único mensaje de la conversación es el aviso del sistema y no hay ninguna fila de turno. No
   falló el bot: nunca se le pidió que contestara.
2. Medición en todos los negocios: cuántos contactos así, cuántos nunca recibieron nada, cuánto tráfico de
   anuncio hay en total (para dimensionar: la mayoría de los anuncios sí llega con texto).
3. Webhook: turno + atribución solo para el primer contacto; aviso al modelo sin inventar el mensaje.
4. Reporte, ficha e inbox con el grupo "Anuncio sin identificar", ordenado detrás de los anuncios reales.
5. Backfill reversible de los históricos que cumplen la condición de primer contacto.
6. Deploy con `--no-verify-jwt` y verificación por la Management API; y la lista de leads históricos sin
   respuesta para que el equipo de cada negocio les escriba.

## Skills relacionadas

- `bot-whatsapp-unsupported-fallback` — el mismo síntoma resuelto en un flujo de n8n (salida fallback del Switch).
- `clasificar-por-lista-no-por-fallback` — por qué una rama que le habla al cliente no se define por exclusión.
- `porcentaje-necesita-minimo-muestra` — por qué un grupo mezclado o chico no compite en un ranking por tasa.
- `drill-down-numero-a-lista` — la clave de agrupación es la misma que viaja en la URL y filtra la lista.
- `verificar-funcionamiento-end-to-end` — "respondió 200" no es "funciona".
- `estado-antes-que-mensaje` — otra carrera del mismo webhook: el aviso de un evento que llega antes que la cosa.

---

## Apéndice 2026-11-05: el contenido llega después, con el mismo wamid

> Capturado en el CRM de Momentum (PR #506 de momentum-ai-crm, webhook 1.16.0). El caso que lo destapó: Hans
> reconectó el WhatsApp de un cliente, se mandó un «Hola» de prueba y el chat mostró el aviso de anuncio.

### Qué cambió del lado del BSP

Hasta octubre de 2026 el `131060` era el final de la historia. Desde el 27-10 YCloud **reenvía el mismo
mensaje** unos segundos después, con el **mismo wamid** y el contenido real (texto, foto o audio). Si tu tabla
de mensajes es única por wamid (lo normal, para la idempotencia), el segundo evento choca con el aviso, se toma
por un reintento del BSP y **se descarta sin ningún error**: el evento queda procesado y el mensaje no aparece
en ningún lado.

**Medido (75 días, 6 negocios):** 126 pares y los 126 perdidos. Por semana: 0 % hasta la del 19-10, 64 % la del
26-10, 85 % la del 02-11. Mediana 7,7 s entre los dos; 2 de 126 tardaron más de 45 s (máximo 510 s). 124 textos,
1 foto, 1 audio. **118 de los 126 contenidos traen `referral`**, el anuncio real con su `ctwa_clid`, que el aviso
no traía. En los negocios con bot, **el bot contestó los 51 casos sin saber qué le habían escrito**.

### Cómo se arregla

1. **Convertir la fila del aviso, no insertar otra.** Cuando entra contenido para un wamid cuya fila es un aviso
   que lo espera (`sender_kind = 'system'` y la causa del 131060), esa fila pasa a ser el mensaje del lead: mismo
   id, misma hora (`created_at` no se toca: es cuando llegó). El UPDATE repite la condición en la base, así dos
   copias del contenido convierten una vez y nunca se pisa un mensaje real.
2. **Convertir también en la carrera del INSERT.** El aviso y el contenido se procesan en paralelo: si el aviso
   gana el INSERT, el contenido recibe el 23505. Ahí también hay que releer y convertir, o la carrera pierde el
   mensaje igual.
3. **El orden inverso no convierte nada.** Si el contenido llega primero, el aviso encuentra un mensaje del lead
   y no lo toca: solo se convierte un aviso. Probalo con su propio caso.
4. **Todo lo que hace el INSERT, hacerlo a mano.** Los triggers de la base corren en el INSERT: el preview de la
   lista sigue con el texto del aviso (ponelo solo si ese mensaje sigue siendo el último). El contador de no
   leídos y `last_inbound_at` **no** se tocan: el aviso ya los contó, con la hora real. Lo demás (archivar la
   media, la memoria del bot, el turno) va por el mismo camino de un mensaje nuevo.
5. **Reemplazar la atribución inferida por la real.** El aviso dejó al lead en «Anuncio sin identificar»; el
   contenido trae el anuncio. Reemplazá solo la inferida (por eso conviene marcarla con `origen_inferido`) y
   seguí siendo first-touch con cualquier otra.
6. **Dos turnos para un mensaje, una respuesta.** El aviso ya abrió su turno (el saludo del paso 3 del proceso).
   Ahora llega el contenido:
   - el turno del contenido va como **otro evento del mismo mensaje** (si el candado es por mensaje y evento, con
     la misma clave el segundo muere como duplicado);
   - el turno del aviso, al terminar su espera, mira si la fila se convirtió: si ya existe el turno del
     contenido, se retira; si no, relee el mensaje y contesta él, **sacándole al modelo el aviso de "no sabés qué
     dijo"**;
   - el turno del contenido no contesta si el mensaje ya tuvo respuesta (el contenido llegó después del saludo):
     serían dos respuestas a un solo mensaje del lead. En vez de contestar, corrige la memoria.
7. **Corregir la memoria del bot.** El turno del aviso le pasa al modelo el texto del aviso y así queda guardado,
   como si el lead lo hubiera dicho. Reemplazá ese texto por el contenido en la fila del lead (solo el texto del
   aviso: pudo entrar junto con otros mensajes del lote), y buscá el aviso ANTES de mirar si el contenido ya está:
   el contenido suele ser «Hola» y en un chat con historial un «Hola» viejo te haría creer que ya está.
8. **El rótulo depende del chat.** Un `131060` en un chat con historial (pasó al reconectar el número) no es un
   primer contacto: aviso neutro, sin atribución y sin saludo. Lo que la skill decía en el gotcha ⭐ vale también
   para el texto del aviso, no solo para el turno y la atribución.
9. **Recuperar lo perdido desde el crudo del webhook**, con el MISMO código que usa el webhook (mové el extractor
   a un módulo que puedan importar el webhook, las pruebas y el script). En seco por defecto, respaldo antes de
   escribir, y nada que hable hacia afuera: sin turnos, sin notificaciones, sin marcar leído. La media del BSP
   vence a los 7 días (`bsp-media-expira-archivar-propio`): la recuperación es urgente para las fotos y los
   audios.

### Gotchas de esta parte

- **El descarte no deja rastro.** Ninguno de los 126 tenía error: el evento quedaba procesado. Se encontró
  porque alguien miró el chat. Si tu webhook trata "ya existe" como éxito silencioso, contá los eventos crudos
  por wamid de vez en cuando: dos eventos con distinto `type` y el mismo wamid son la señal.
- **La regla vieja de la skill ("el contenido nunca llega") estaba escrita en un comentario del código**, y por
  eso nadie volvió a mirar. Cuando un proveedor cambia, los comentarios que afirman "nunca" son los primeros
  sospechosos.
- **Probá el orden de los dos eventos en las dos direcciones y la carrera del 23505.** Son tres pruebas distintas
  y cada una rompe por un lado distinto.
- **El control negativo:** con el comportamiento viejo (tratar la fila existente como duplicado), la prueba del
  caso real tiene que fallar. Se comprobó: caen 4 de 16 en el webhook y 3 de 16 en el motor.
