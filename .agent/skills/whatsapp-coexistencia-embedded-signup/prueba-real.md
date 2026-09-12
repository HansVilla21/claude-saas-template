# La primera conexión real (2026-09-12) — qué pasó de verdad

Anexo de `SKILL.md`. Con la revisión de Meta aprobada, se conectó un número real
que seguía en WhatsApp Business del celular. Lo que se ve acá está medido en la
base y en los webhooks, no deducido de la doc.

## Antes de conectar: en qué cuenta entra el número

Un negocio tiene **una sola línea de WhatsApp activa**: conectar por Meta en una
cuenta que hoy anda por el BSP **apaga esa línea**. Para probar se creó una cuenta
nueva ("Pruebas Meta") **con el número vacío** (si se carga, nace conectada al
BSP). Ni la cuenta propia que sigue recibiendo por el BSP, ni la demo (mezcla
chats reales con datos inventados). Antes, se buscó el número en la base para
confirmar que no estuviera en ninguna cuenta.

## El flujo de Meta, pantalla por pantalla

1. **"Agrega tu número de teléfono de WhatsApp"** → "Ingresar un nuevo número de
   teléfono" + el número. (No hay un botón aparte de "conectar app existente":
   Meta detecta que el número está en la app.)
2. **"Verifica los detalles de tu cuenta"** → la tarjeta del perfil de la app del
   celular (nombre, número, categoría, sitio).
3. **"Selecciona los activos comerciales"** → el portafolio **del cliente**.
4. **"Completa tu perfil de empresa"** → nombre, país, sitio web.
5. **"Importar contactos e historial de chat"** → **QR para escanear con WhatsApp
   Business**. En el celular llega un mensaje de la cuenta oficial de Meta con
   "Conectar", y ahí se elige compartir el historial.
6. **"Confirma o edita tu cuenta de WhatsApp Business"** → zona horaria.
7. **"Revisa lo que compartirás con <tu app>"** → **Confirmar**.
8. **"Conectando tu cuenta"** → **código de confirmación al correo del portafolio**.
9. **"Tu cuenta está conectada a <portafolio del Tech Provider>"** → "Agregar método
   de pago" (no hace falta para probar: lo que se escribe desde el celular sigue
   gratis) / **Finalizar**. Recién acá el navegador recibe el código y el servidor
   conecta.

### El error que no dice nada: #3441003

La primera vez la pantalla del QR **no apareció**, y al confirmar la zona horaria
salió *"Vuelve a intentar en un momento o ponte en contacto con el equipo de
ayuda"* (#3441003). En la doc de Meta es un error de sistema genérico. Se
sospechó del nombre del perfil ("Test", Meta rechaza nombres genéricos) y de la
antigüedad del número (los BSP piden 7+ días de uso). **No era ninguna de las
dos:** era el QR sin escanear. Al repetir, el QR apareció después del
portafolio, se escaneó y todo siguió. Lo encontró el founder.

Aun así, conviene revisar el nombre del perfil ANTES: con coexistencia Meta lo
bloquea, y queda para siempre.

## Lo que llegó al webhook

| Momento | Campo | Contenido |
|---|---|---|
| Al escanear | `account_update` | `PARTNER_ADDED`, después `PARTNER_APP_INSTALLED` (se ignoran con nombre) |
| +10 s de conectar | `history` fase 0 | 2 hilos, 2 mensajes |
| +2 s | `history` con `messages[]` suelto | el archivo de la foto: id, url, caption |
| mismo segundo | `history` fase 1, `progress: 100` | 2 hilos, 5 mensajes — **repite** mensajes de la fase 0 |
| +1 s | `history` fase 2, `progress: 100` | vacía |

- **Mensajes repetidos entre fases**: 7 en los payloads, 5 únicos. La RPC
  idempotente dejó 5, sin duplicar. Sin el `on conflict`, se duplicaban.
- Todo el historial de un número nuevo llegó en ~10 segundos.
- Los mensajes del contacto traen `history_context.status: "pending"`.
- **Al conectar no llegó `smb_app_state_sync`**, aunque el pedido dio ok y el
  teléfono SÍ tenía contactos guardados. Viajó 44 minutos después, **cuando se
  guardó un contacto nuevo**: primero los que ya estaban (`metadata.version: 1`) y
  enseguida el nuevo (`version: 2`). No asumas que la agenda llega al conectar. El
  payload real trae además `contact.user_id` (BSUID) y `metadata.version`, que no
  están en el ejemplo de la doc. La agenda solo trae contactos **guardados**.
- **El eco funciona:** lo escrito desde la app llega por `smb_message_echoes` con
  `from` = el negocio y `to` = el contacto.
- **Un estado puede llegar antes que su mensaje:** el `delivered` del eco llegó 36 ms
  antes que el eco, no encontró el mensaje y se descartó, así que quedó en `sent`.
  Si el webhook descarta estados de mensajes desconocidos, en coexistencia pierde
  algunos. **Cómo se arregló** (migración 0093 del CRM): si el mensaje no existe,
  el estado se guarda en una tabla de pendientes; un trigger en `messages`
  (AFTER INSERT, y AFTER UPDATE solo cuando **cambia** `external_id`) lo aplica
  cuando aparece la fila. Los dos lados toman `pg_advisory_xact_lock` por
  `external_id`, así el segundo espera al primero y ve lo que dejó. El trigger va
  `SECURITY DEFINER` (sesiones del CRM también escriben `messages`), respeta la
  marca de importación y se prueba con control negativo: sin el trigger el
  estado queda esperando. La misma carrera existe con lo que manda el CRM: el
  wamid se guarda recién cuando Meta contesta el envío.

Resultado en la base: coexistencia true, las dos sincronizaciones ok, 5 mensajes,
la foto archivada en Storage, **0 notificaciones, 0 no leídos**, las columnas de la
ventana en null y la fecha de alta del contacto bajada a su mensaje más viejo. En
vivo: el mensaje nuevo del contacto llegó con `profile.name`, la respuesta desde
el CRM llegó con `pricing.type: free_customer_service`.

## Los dos defectos que mostró

**1. Un contacto basura del Reino Unido.** El mensaje oficial de Meta del paso 5
(+44 7710 173736) viene en el historial como `type: "errors"` (131051, "Message
type unknown") y se importó como contacto con "Mensaje no compatible". Arreglo:
en el historial se saltan `errors` y `unsupported`. De un chat viejo solo dejan
una burbuja vacía, y un hilo que solo tenía eso no crea contacto. En vivo no se
tocan: ahí avisan que alguien escribió algo que no se pudo leer.

**2. Todos los contactos "Lead sin nombre".** Medido: **el webhook `history` no
trae ninguna llave `name`**. El nombre de un chat viejo sale de la agenda
(contactos guardados) o del perfil de WhatsApp cuando la persona vuelve a
escribir. Y ahí había un hueco: para un contacto existente el perfil iba solo a
`display_name`, y el nombre del contacto (`full_name`) quedaba con el relleno para
siempre. Arreglo en tres partes:
- el webhook completa `full_name` con el perfil si el contacto sigue con el
  relleno (uno que el negocio nombró no se pisa);
- la app muestra el **teléfono** en vez del relleno, con un helper único
  (`nombreReal` / `nombreVisible`) en vez de diez `display_name || full_name`;
- y dos bugs que el relleno venía causando sin que nadie lo viera: **plantillas
  saludando "Hola Lead,"** y la **IA de seguimientos recibiendo "Lead sin nombre"
  como el nombre del cliente**.

La prueba del punto 1 usa la forma real del mensaje de Meta y **falla contra el
normalizador viejo** (control negativo).
