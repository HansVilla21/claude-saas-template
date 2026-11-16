# Cuando el bind del BSP falla por el cierre de facturación de Meta

Anexo de `SKILL.md`. Capturado el 2026-11-04 del alta de un cliente nuevo por una
solución multi-socio con YCloud, a fin de mes. El cliente terminó el flujo de Meta
bien, el último paso falló, y estuvo 5 días a medias. Se resolvió **sin que el
cliente repitiera nada**. Lo de abajo está medido, salvo donde dice lo contrario.

## El síntoma

El Embedded Signup termina bien del lado del cliente, y el `POST
/whatsapp/businessAccounts/{waba}/smb/bind` de YCloud responde 400:

> This WhatsApp Business Account cannot be moved onto a credit line while the
> monthly billing close is running. Please try again once the close has completed,
> usually within the first few days of the month.

`code: 100`, `error_subcode: 1752358`, **`is_transient: true`**.

No es culpa del cliente ni de tu código, y no se arregla reconectando: lo que falló
es solo la adopción por el BSP. El número sigue en el celular, funcionando normal.

## Qué quedó hecho y qué no

| | Antes del bind | Después del bind |
|---|---|---|
| El número en el celular | Funciona | Funciona |
| La WABA compartida con la solución | Sí, YCloud la lee | Sí |
| El número en `GET /phoneNumbers` de YCloud | **No aparece** | `CONNECTED` |
| Mensajes de los contactos al webhook | **Llegan** | Llegan |
| Ecos de lo que el negocio escribe en la app | **No llegan** | Llegan |
| Enviar por la API | **Rechazado:** `WHATSAPP_PHONE_NUMBER_UNAVAILABLE`, "has not been registered" | Entregado |
| Avisos de entrega | No hay | Llegan |

Lo que no es obvio: **los entrantes llegan aunque el bind haya fallado**, y sin un
canal cargado se descartan con `unknown_agency_for_phone`, sin ningún error visible.
Se descartaron 111 en poco más de una hora. Mirá esto primero.

## Qué hacer, en orden

1. **Confirmá la cuenta con el BSP**, sin escribir nada: `GET
   /whatsapp/businessAccounts/{waba}` (nombre, `businessId`, `isOnBizApp`). Si el
   Embedded Signup dejó dos WABA, la que importa es la que el BSP sí encuentra.
2. **Contá los entrantes descartados** (`conectar-numero-que-ya-recibe`, paso 1).
3. **Cargá el canal para que el negocio reciba.** Una sola escritura, con el bot
   apagado en explícito, porque cargar el canal lo enciende:
   - `provider_config` con `waba_id`, `coexistencia: true`, `origen: 'ycloud_tp'`.
   - **`revisar_salud: false`**, porque el vigilante compara contra la lista del BSP,
     el número no está, y avisaría de una caída falsa.
   - Una `nota` que diga que es provisorio.
4. **Recuperá lo descartado** con el método de `conectar-numero-que-ya-recibe`: por
   el webhook real, firmado, en orden, y después la hora real con `created_at =
   sent_at` y los campos derivados recalculados. Medido: 109 de 111 procesados; los
   otros 2 eran reacciones a mensajes de antes de conectar.
5. **Auditá qué puede salir solo desde ese número.** El bot, los seguimientos, las
   secuencias, los recordatorios y también el aviso al equipo, que sale desde el
   número del negocio. Confirmá en la base y en el log del BSP que no salió nada.
   `filter.from` de `/whatsapp/messages` **se ignora**: traé la lista y filtrá vos.
6. **Reintentá el bind a mano**, una vez por día a partir del 1. Es una llamada sobre
   una WABA ya compartida: **no hace falta un flujo nuevo**. Cuando sale, devuelve
   `id` (el `phone_number_id`), `phoneNumber`, `verifiedName` y `status`.
7. **Al salir, actualizá la MISMA fila del canal.** `guardarCanalWhatsApp` busca por
   número y reemplaza `provider_config`, así que se va la nota y el `revisar_salud`.
8. **Verificá con un mensaje real en las dos direcciones**, y mirá que entren ecos y
   estados. Medido: en los primeros 8 minutos, 25 ecos y 6 estados.

En el CRM esto ya existe: la marca `settings.ycloud_bind_pendiente = { waba_id }`
hace que el cron de canales reintente solo cada 15 minutos
(`lib/whatsapp/bind-pendiente.ts`). El founder la pausó a los 94 intentos, por miedo a
que Meta lo leyera como automatizado. No hubo ninguna consecuencia visible, pero
tampoco hay evidencia de que sea seguro, y el error dura días: **a mano alcanza**.

## Cuánto dura

Seguía el 2 de noviembre a las 09:27 CR. Ya no estaba el 4 a las 10:25 CR. Empezó a
fallar, como mínimo, el 30 de octubre. Es un caso solo: tomalo como orden de magnitud.

## Lo que no sirve

- **Desconectar y reconectar mientras dura el cierre.** La cuenta nueva choca con lo
  mismo, y el cliente ya hizo el flujo dos veces. Es la peor salida con un cliente
  enojado. Pedilo solo si el error **cambia** después del cierre.
- **Operar la WABA directo con tu app.** Aunque `account_update` diga
  `PARTNER_APP_INSTALLED` con tu app, y la WABA aparezca en tu portafolio, al asignarle
  un usuario del sistema Meta solo ofrece "Números de teléfono". "Mensajes" y "Acceso
  total" salen apagados: *"Un socio asignó los activos"*.
- **El token de otro Embedded Signup.** Solo ve su propia WABA.

## La moneda: no asumas que es el bloqueo

La respuesta del soporte de YCloud fue genérica: la WABA tiene que estar en IDR con
pago "Qipeng", eso solo se fija al conectar, y conviene desconectar y reconectar. La
cuenta estaba en USD con `paymentMethodAttached: false`, todas las nuestras por esa
solución en IDR, y el founder ya había tenido que borrar una cuenta por la moneda en
otro caso. Parecía el problema. **No lo era:** el bind salió con la cuenta en USD, y
`paymentMethodAttached` pasó a `true`.

Esto no prueba que la moneda nunca bloquee. Dice que **antes de pedirle a un cliente
que borre su cuenta hay que intentar el bind otra vez**, porque es gratis, y que el
error exacto manda sobre la respuesta genérica de soporte.

## Lo que se pierde, y hay que decirlo

- **Lo que el negocio contestó desde el celular durante esos días no entra:** no hay
  ecos antes del bind. En el CRM esos chats se ven con los mensajes del contacto y sin
  las respuestas, aunque se hayan contestado. Avisale al cliente.
- **El historial viejo probablemente tampoco.** El pedido vale 24 h desde que se
  conecta, y el bind cayó 5 días después. Medido: 0 eventos de `whatsapp.smb.history`
  en los primeros 8 minutos después del bind. No se siguió midiendo.

## Cómo evitarlo

**No conectes clientes por la solución del BSP en los últimos días del mes.** Si no se
puede esperar, avisale antes que puede quedar recibiendo y sin poder contestar desde el
sistema hasta los primeros días del mes siguiente, mientras sigue atendiendo desde su
celular.

## El respaldo que no se usó

Se dejó listo un segundo botón directo con Meta para ese negocio (`settings.whatsapp_ruta
= 'ambas'`), por si había que resolverlo en una llamada. No hizo falta, así que **no
quedó probado en este caso**. Antes de usarlo, sabé lo que cuesta: en esa ruta el bot no
escucha (`BOT_ESCUCHA_META = false`), las plantillas no se crean desde el CRM, y pasar
después al BSP exige reconectar.
