# Skill: Recibir WhatsApp, Instagram y Messenger por el webhook de Meta

> Nació el 2026-09-10 en el CRM de Momentum, al pasar de un proveedor intermedio
> (YCloud) a conectar los canales **directo con Meta**, como Tech Provider. Había que
> escribir la recepción: que los mensajes de WhatsApp Cloud API, Instagram y Messenger
> entren al inbox. El código quedó en `crm-v2/supabase/functions/meta-webhook/`
> (PR #185 de `momentum-ai-crm`). Una revisión independiente antes del primer
> despliegue encontró **3 problemas altos**, y los tres eran cosas que el webhook viejo
> ya resolvía y se perdieron al portar.

## El concepto (esto es lo único que hay que recordar)

**Una app de Meta tiene UNA sola URL de webhook para los tres canales.** Los tres usan
el mismo sobre (`object` + `entry[]`), la misma firma (`X-Hub-Signature-256` con el App
Secret) y el mismo alta (el GET con `hub.challenge`). Lo único que cambia es el
interior: WhatsApp manda `entry[].changes[].value` y Instagram/Messenger mandan
`entry[].messaging[]`.

De ahí salen las dos decisiones que ordenan todo:

1. **Traductores puros por sobre → eventos normalizados → un solo procesador.** Lo que
   guarda en la base no sabe de qué canal vino. Y los traductores se prueban con los
   ejemplos literales de la documentación, sin red ni base.
2. **Con una sola URL, lo que antes escuchaba por su cuenta queda sordo.** Con un
   proveedor intermedio, el bot solía tener su propio webhook. Con Meta directo, la
   única URL es la tuya: o le reenviás los eventos, o las conversaciones no pueden
   nacer "con bot".

## Cuándo usar esta skill

- Recibir mensajes de **WhatsApp Cloud API directo** (sin un proveedor en el medio),
  de **Instagram** o de **Messenger** en un CRM, un inbox o un helpdesk.
- Migrar la recepción de un proveedor (YCloud, 360dialog, Twilio, Gupshup) a Meta.
- Portar un webhook de un proveedor a otro, de cualquier tipo: los gotchas 8 y 14
  valen igual.

## Proceso

1. **Alta y firma.**
   - GET con `hub.mode=subscribe`: si `hub.verify_token` coincide con el tuyo,
     devolvé `hub.challenge` tal cual (texto plano). Si no, 403.
   - POST: leé los **bytes crudos** (`arrayBuffer`), HMAC-SHA256 con el **App Secret**
     (no con el token de verificación), y compará en tiempo constante contra lo que
     viene después de `sha256=`. Probá también la forma con unicode escapado (gotcha
     12) y anotá en el log cuál coincidió.
2. **Guardá SIEMPRE el crudo antes de procesar**, en una tabla de log. Con firma
   inválida, recortado (cualquiera puede mandarle un POST de varios MB a tu URL).
3. **Normalizá con funciones puras** a eventos tipados: `mensaje` (entrante o eco),
   `reaccion`, `estado`, `borrado`, `edicion` e `ignorado` **con motivo**. Un evento
   ignorado sin nombre no se distingue de uno perdido.
4. **Resolvé el negocio por la cuenta que llega**: `phone_number_id` en WhatsApp, id de
   página en Messenger, id de la cuenta profesional en Instagram. Guardala al conectar
   y filtrá por proveedor y activo. Índice único parcial sobre
   `(channel, external_id) where provider='meta' and is_active`.
5. **Identificá al contacto** por teléfono en WhatsApp (gotcha 2), por IGSID en
   Instagram y por PSID en Messenger, con índices únicos parciales por negocio.
   Insertá y, ante `23505`, releé: Meta entrega en paralelo.
6. **Reconocé el reintento ANTES de tocar nada.** Buscá el mensaje por su id; si ya
   está, cortá ahí: no tocás el contacto, no contás para el límite y no creás nada. La
   idempotencia final la da un UNIQUE `(negocio, canal, external_id)`.
7. **Estados en un solo UPDATE atómico** que solo avanza (gotcha 9).
8. **Media en segundo plano, de a una, con tope** (gotcha 5). Anotá el motivo si falla.
9. **Respondé según el tipo de error** (gotcha 13): 200 si salió o si reintentar no lo
   arregla, 500 si fue pasajero.
10. **Decidí con qué handler nacen las conversaciones** (gotcha 15).
11. **Revisión independiente antes de desplegar.** Un agente que no escribió el código,
    contra la fuente que se portó y el esquema de la base. Verificá cada hallazgo contra
    la doc o la base antes de tocarlo.

## Gotchas (todos pasaron o casi pasan)

1. **El bot se queda sordo.** Con YCloud, n8n recibía cada evento por su propio
   webhook. Con Meta hay una URL por app. Si la conversación nace `bot`, el lead no
   recibe respuesta y, además, nadie se entera: el trigger de notificaciones solo
   avisaba con `handler='human'` y alguien asignado.
2. **El id de usuario del proveedor es opaco.** YCloud guardaba `CR.2510…` como id del
   contacto. Meta no lo conoce: buscar por ese campo al migrar habría **duplicado cada
   contacto** del cliente la primera vez que escribiera. En WhatsApp la identidad
   estable es el teléfono.
3. **Los teléfonos de la tabla de canales tienen formatos mezclados.** Medido: **3 de 7**
   clientes guardaban el número sin `+`, y la API lo devuelve con `+`. Buscando en un
   solo formato, conectar el canal no encontraba la fila, insertaba otra y el negocio
   quedaba con **dos líneas activas**. Como el envío pedía "la" activa con
   `maybeSingle`, con dos fallaba y el cliente dejaba de poder mandar. Buscá en los dos
   formatos (4 de 7 → 7 de 7), mantené una sola línea activa por negocio, y apagá la
   anterior **después** de guardar la nueva, para que nunca quede sin ninguna.
4. **Las horas vienen distintas.** WhatsApp manda segundos (texto) e Instagram/Messenger
   milisegundos (número). Con la conversión de WhatsApp, un mensaje de Messenger cae en
   el año 57.000.
5. **La media de WhatsApp es un id, no un link.** `GET /{media-id}` con el token del
   negocio devuelve una `url` que **vence a los 5 minutos** y que también pide el token
   para bajarla. No se puede mostrar directo en el navegador: el mensaje queda sin URL
   hasta que la copiás a tu storage. En la UI, "cargando" necesita un techo (5 minutos),
   o queda "cargando" para siempre si el proceso murió a la mitad. Usá `file_size` para
   no descargar lo que no entra en tu bucket, y copiá de a un archivo por instancia.
   Instagram y Messenger mandan una URL de CDN que se abre directo, pero caduca.
6. **Varios adjuntos bajo un solo `mid`** en Instagram y Messenger. Si la llave de
   idempotencia es el id del mensaje, cada adjunto extra necesita su propio id
   (`mid:1`, `mid:2`). Y el límite por hora cuenta solo el primero: si no, un carrusel
   de 10 fotos son 10 mensajes.
7. **Tus propios envíos vuelven como eco** en Instagram y Messenger (`is_echo`, con
   `app_id`). Si no descartás los de tu app, duplicás cada mensaje que manda el CRM. En
   WhatsApp, `smb_message_echoes` es otra cosa: lo que el negocio escribe desde la app
   de WhatsApp Business (coexistencia).
8. **Borrar y editar no son mensajes nuevos.** WhatsApp manda `type: "revoke"` con
   `revoke.original_message_id` y `type: "edit"` con `edit.original_message_id` +
   `edit.message`. **Hoy Meta manda las ediciones como `unsupported`**, según su propia
   doc. Si caen en el caso por defecto aparece una burbuja "no compatible", el original
   sigue a la vista y, en un eco, el aviso entra a la memoria del bot como algo que dijo
   él. El webhook viejo ya lo resolvía; se perdió al portar, y lo encontró la revisión,
   no las pruebas, que cubrían lo que yo había pensado. Ver
   `clasificar-por-lista-no-por-fallback`.
9. **Los estados llegan fuera de orden y en paralelo.** "Entregado" y "leído" casi
   juntos, con el chat abierto. Leer y después escribir hace que los dos lean "enviado"
   y gane el último: queda "entregado" con la fecha de lectura puesta. La solución es un
   solo UPDATE con `CASE` sobre la fila bloqueada, que en READ COMMITTED se reevalúa
   contra la versión nueva.
10. **Meta no manda el contenido en el estado.** YCloud sí, y con eso se reconstruía un
    saliente que nadie había registrado. Con Meta, lo que el bot mande por su cuenta
    tiene que registrarlo él, con `external_id = wamid`, o no aparece nunca.
11. **Un CHECK de la base tira el valor nuevo en silencio.** `sent_via` aceptaba tres
    valores; el insert con uno nuevo fallaba y el error quedaba escondido en el log. Se
    habrían perdido todos los ecos de Instagram y Messenger. Antes de escribir un valor
    nuevo en una columna de vocabulario, leé sus CHECK.
12. **La doc de Meta dice que firma con el unicode escapado** (`á` → `á`, hex en
    minúscula). Si el cuerpo llega con los caracteres crudos, la firma cruda falla justo
    en los mensajes con tildes, o sea en casi todos los de un negocio en español.
    Probá las dos formas; no la debilita, porque las dos salen del mismo cuerpo.
13. **Siempre 200 pierde mensajes; siempre 500 hace un bucle.** Con 200 ante cualquier
    error, un corte de red de un segundo pierde el mensaje para siempre (Meta no
    reintenta y nadie reprocesa). Con 500 ante cualquier error, un bug determinista se
    reintenta 36 horas. Clasificá por el código de Postgres: 22, 23, 42 y los de
    PostgREST son deterministas (200); todo lo demás, incluido un error sin código,
    es pasajero (500). Funciona porque todo es idempotente.
14. **Otros consumidores asumían un solo canal.** El cron de seguimientos elegía
    conversaciones de cualquier canal e insertaba con `channel='whatsapp'` escrito a
    mano: un WhatsApp adentro de una conversación de Instagram. Cuando sumás canales,
    buscá todos los lugares que escriben mensajes y filtrá en la fuente.
15. **El handler con el que nace la conversación decide si alguien se entera.** En un
    canal donde ningún bot escucha, `bot` es silencio. `unassigned` ("Sin asignar") la
    deja a la vista. Dejalo en una sola constante, para cambiarlo cuando el bot escuche.
16. **Con los nombres de usuario de WhatsApp, puede no llegar el teléfono.** Si la
    persona elige ocultar su número, el mensaje llega SIN `from` y el contacto SIN
    `wa_id`: solo el id de usuario con alcance de negocio (BSUID, en `from_user_id` y
    `contacts[].user_id`, formato `US.1349…`), más `profile.username`. Un webhook que
    exige `from` descarta esos mensajes en silencio: pasó, y se vio porque el panel de
    Meta deja mandar los tres escenarios (ver cómo se prueba, abajo). Uno que le quita
    al id todo lo que no es dígito lo convierte en un teléfono falso. Reconocé al
    contacto por BSUID primero y por teléfono después, guardá el BSUID la primera vez
    que llega (así sigue siendo la misma persona si mañana oculta el número), y ponele
    índice único por negocio: sin teléfono no hay otro que frene un duplicado. Al
    migrar desde YCloud: su `fromUserId` tiene el mismo formato (`CR.2510…`, 1.229 de
    1.241 contactos) y casi seguro es el mismo id, así que los contactos que ya
    existen se reconocen. Falta el otro lado: responderle a alguien sin teléfono
    exige mandar por BSUID.

## Cómo se prueba sin levantar Deno ni la base

- **Traductores y firma:** con `node --experimental-strip-types --test`, importando los
  módulos `.ts` reales (usá `import type` para los tipos de `jsr:`: Node los borra).
  Poné los ejemplos literales de la doc de Meta como casos y un control negativo para la
  firma (mismo header, cuerpo distinto → no pasa).
- **Tipos:** `tsc` estricto del repo con un `tsconfig` aparte: mapeá
  `jsr:@supabase/supabase-js@2` al paquete de npm con `paths`, y agregá un stub de
  `Deno` y de `edge-runtime.d.ts`. Encontró dos errores reales antes de desplegar.
- **Migraciones:** bloque que siempre aborta contra la base viva
  (`probar-migracion-contra-base-viva-con-rollback`), con controles que discriminen:
  "un `read` no retrocede con `delivered`", "la misma cuenta en dos negocios queda
  bloqueada".
- **Nombres de usuario:** en Webhooks → Whatsapp Business Account → `messages` →
  Probar, el cuadro deja elegir el "Escenario de nombre de usuario" (sin usuario, con
  usuario y teléfono, con usuario sin teléfono). Mandá los tres al servidor y leé el
  crudo de tu tabla de log: es el payload exacto, sin pedir capturas. Ojo: al
  reabrirlo, el cuadro vuelve solo a la opción por defecto, y por eso una vez se mandó
  el ejemplo equivocado. Mirá la forma del crudo, no solo el resultado.
- **Después de desplegar, en este orden:** el GET de salud (confirma el deploy y qué
  variables faltan, sin mostrarlas), un GET de alta con token equivocado (403), un POST
  sin firma (queda en el log con `signature_valid=false`), el botón "Probar" del panel
  de Meta (firma REAL, cuenta inventada: `canal_no_conectado`) y recién ahí un número
  de prueba de punta a punta. Si el alta falla, los logs de la función dicen si
  respondiste 403 (el token no es idéntico) antes de ponerse a adivinar.

## Output esperado

- Una Edge Function en módulos chicos: `index.ts` (alta, firma, log, respuesta),
  `firma.ts`, `tipos.ts`, un traductor por sobre, `procesar.ts`, `persistir-*.ts`,
  `media.ts` y `errores.ts`.
- Migraciones para: los secretos por negocio en Vault, la identidad única del contacto
  por canal, la cuenta única por negocio, los estados atómicos y los valores nuevos de
  los CHECK.
- Pruebas de los traductores y de la firma, y un handoff con lo que falta en orden.

## Ejemplo

**Input:** "Ya somos Tech Provider y conectamos el WhatsApp del cliente por Embedded
Signup. Hay que hacer que los mensajes entren al inbox, y después Instagram."

**Output:** una función `meta-webhook` con una URL para los tres canales; el negocio se
resuelve por `phone_number_id` / página / cuenta de IG; el contacto de WhatsApp por
BSUID y por teléfono en los dos formatos; reintentos cortados antes de tocar nada;
estados atómicos; media copiada con token y tope; borrados y ediciones sobre el
original; conversaciones "Sin asignar" hasta que el bot escuche; 38 pruebas; 5
migraciones probadas contra la base viva, y los pasos del founder (secretos, URL en
Meta, botón "Probar") en el orden en que se verifican.

## Checklist antes de desplegar

- [ ] La firma se calcula sobre los bytes crudos, con el App Secret, en tiempo constante.
- [ ] El crudo se guarda antes de procesar; sin firma, recortado.
- [ ] Cada tipo de evento que no se guarda tiene un motivo con nombre.
- [ ] Borrado y edición van al original, en entrantes y en ecos.
- [ ] El reintento se corta antes de tocar el contacto y el límite.
- [ ] Contacto de WhatsApp por BSUID y después por teléfono (en todos los formatos de
      tu tabla); uno sin teléfono entra igual, y lo que no es un teléfono no se guarda
      como teléfono.
- [ ] Estados en un UPDATE atómico que solo avanza.
- [ ] Media: `file_size` antes de bajar, de a una, con el motivo anotado si falla, y la
      UI con techo para "cargando".
- [ ] 500 solo para errores pasajeros.
- [ ] Ningún consumidor escribe en un canal que no le corresponde (crons, bots).
- [ ] El handler inicial no promete un bot que no escucha.
- [ ] Revisión independiente hecha y cada hallazgo verificado contra la doc o la base.

## Relacionadas

`ycloud-webhook-to-supabase` (la fuente que se portó) ·
`webhook-contar-event-types-antes-de-arreglar` · `clasificar-por-lista-no-por-fallback` ·
`bsp-media-expira-archivar-propio` · `webhook-fanout-sin-reconciliacion` ·
`probar-migracion-contra-base-viva-con-rollback` · `verificar-funcionamiento-end-to-end`
