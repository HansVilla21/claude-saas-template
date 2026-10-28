# Segundo caso: Google Calendar en una agenda propia multi-negocio

> Capturado el 2026-10-27 de la fase 3 de la agenda propia del CRM de Momentum
> (PR #457 del CRM, migración 0164). El primer caso (Josué) era UN negocio, UNA
> persona, una página. Este es un CRM con varios negocios, varias personas por
> servicio, una página pública con candado (skill `reservar-sin-pisarse-pagina-publica`)
> y citas que también carga el equipo a mano. Probado contra el Google real de
> Hans: el número de horarios se predijo antes de mirar y coincidió.

## Lo que cambia con varios negocios y varias personas

### 1. Leer EVENTOS, no freeBusy (y por eso alcanza un solo permiso)

freeBusy dice "ocupado de 10 a 11", no QUÉ evento. Apenas el sistema escribe las
citas en Google, ese hueco es la propia cita, que la base ya cuenta. Contarla dos
veces rompe dos cosas sin dar error:

- **Mover una cita choca consigo misma:** la base la excluye al moverla, pero su
  evento en Google sigue ahí y la tapa.
- **Un servicio con cupo se llena con la primera reserva:** la base deja sumarse a
  la misma hora; Google dice "ocupado".

Por eso se leen los eventos (`events.list` con `singleEvents=true`) y se saltean
los que tienen la marca del sistema PARA ESTE NEGOCIO
(`extendedProperties.private.momentumAgencyId`). Los de OTRO negocio en el que la
misma persona atiende sí cuentan: esa base no los ve y la persona igual está
ocupada. Con `calendar.events` alcanza para leer y escribir; el de freeBusy no
hace falta. La prueba que lo cubre tiene control negativo: con el filtro, las
11:00 se ofrecen al mover la cita de las 11; sin él, no.

Reglas que reemplazan a las de freeBusy:
- no ocupan: `status: cancelled`, `transparency: transparent` ("Disponible"),
  `eventType` `workingLocation` o `birthday`, y los que la persona rechazó
  (`attendees[].self` + `declined`);
- un evento de día completo marcado "Ocupado" tapa el día **en la zona del
  calendario** (`timeZone` de la respuesta), con el fin exclusivo;
- más de 5 páginas de 250 = error, no lista corta: lo no leído podría estar ocupado.

### 2. La conexión es por PERSONA, no por negocio

Una persona atiende en dos negocios y tiene un solo Google. Tabla de conexiones
con `user_id` como llave; el permiso y el acceso de una hora en el Vault
(`google_refresh_<user>`, `google_access_<user>`), nunca en la tabla.

### 3. Si no se pudo leer, esa persona queda ocupada TODO el rango

No es "no hay eventos". El motor recibe un `Ocupado` del rango entero para ese
recurso: la página no ofrece sus horas y, si hay otra persona en el servicio, se
ofrecen las de ella. La pantalla del equipo lo dice ("No se pudo leer el Google
Calendar de X") y, si el permiso se cortó, se le avisa a esa persona UNA vez.

**401 no es "se cortó":** el acceso guardado pudo vencer antes de tiempo. Se
renueva y se reintenta una vez; recién `invalid_grant` al renovar, un segundo 401
o un 403 `insufficientPermissions` es "rota".

### 4. El último chequeo antes de guardar NO necesita tocar la función con candado

Parece que hay que pasarle a la función de la base los bloques de Google para que
los mire bajo el candado. No hace falta: el servidor lee Google SIN caché justo
antes de llamarla, corre la misma validación del motor y le pasa a la base solo
las personas que siguen libres. Pasarle los bloques serían los mismos, leídos en
el mismo instante. Lo que la base cierra (dos clientes a la vez) lo sigue
cerrando. Condición: que la lectura del momento de reservar no tenga caché.

### 5. Las citas a Google: trigger + cola + id fijo

- **Trigger en la tabla de citas** sobre las columnas que cambian el evento
  (hora, estado, quién atiende, título, lugar, invitado). Así entra todo camino:
  la página, la agenda a mano, el bot, un SQL. La sincronización escribe OTRAS
  columnas (el id del evento), así que no se anota a sí misma; los avisos
  escriben `extra`, que tampoco está en la lista.
- **La cola** (una fila por cita, `clock_timestamp`, `skip locked`, cerrar
  comparando la marca, reintentos 1-5-15-60 min) es la de la salida a un CRM
  externo (skill `salida-a-crm-externo`). El borrado guarda en la fila el evento y
  el calendario, porque la cita ya no existe.
- **El id del evento sale del id de la cita** (`crm` + el uuid sin guiones: Google
  acepta a-v y dígitos). Crear es idempotente: un segundo intento da 409 y se
  actualiza. Si la cita pasa a otra persona y vuelve, el evento borrado se
  restaura con `status: confirmed`.
- **PATCH y no PUT:** un PUT sin `conferenceData` borra el Meet.
- **Se manda en el momento** desde la acción (`after`), y el cron solo reintenta lo
  que falló. En la página va ANTES de los avisos, porque el correo necesita saber
  si Google ya invitó al cliente y el link de Meet.

### 6. A quién se invita (y el .ics que no se duplica)

Con el cliente invitado, Google le manda la invitación. Si además le llega el
`.ics` del correo propio, le quedan dos eventos. Regla:

- se invita solo si la reservó el cliente (no una cita a mano), se reservó
  DESPUÉS de conectar Google y todavía no le llegó un `.ics` (si Google falló, el
  correo sale con `.ics` y el reintento ya no invita);
- el correo propio sale sin `.ics` y dice "La invitación de Google Calendar llega
  en otro correo";
- "invitado" es pegajoso: después de cancelar sigue en true, así el correo de la
  cancelación tampoco lleva un `.ics` (Google ya le mandó la suya);
- la página de la cita deja de mostrar "Agregar a Google Calendar".

Lo que ve el cliente invitado en la descripción del evento es TODO lo que se
escribe ahí: nada de notas internas ni links al CRM. Sin invitado, el evento lleva
las notas y el link.

### 7. Desconectar no borra los eventos

Borrarlos le mandaría una cancelación al cliente invitado y la cita sigue en pie.
Se revoca el permiso, se olvidan los ids y los eventos quedan en su calendario,
sin actualizarse. La pantalla lo dice antes de confirmar.

## Gotchas de esta vez

- **Un preview de Vercel no puede ser URI de redirección:** su dominio cambia por
  rama. Se conecta desde producción o desde `http://localhost:<puerto>`; como el
  permiso no depende del dominio y el preview usa la misma base, después sirve en
  el preview sin reconectar. La ruta de conectar responde "se conecta desde el
  CRM" si el origen no es uno de los dos.
- **El JSON del cliente que se baja de Google no se actualiza solo:** traía una
  sola URI porque se bajó antes de agregar la de localhost. Mirar las URIs en la
  consola, no en el archivo. Una URI recién agregada puede tardar unos minutos.
- **La persona puede destildar el permiso** en la pantalla de Google: leer
  `scope` en la respuesta del token y no guardar nada si falta.
- **Meet puede no venir en la respuesta** (`createRequest` pendiente): se lee el
  evento una vez más antes de mandar el correo. `requestId` fijo por cita y
  persona, así pedirlo dos veces no crea dos salas.
- **En las pruebas con `fetch` falso,** `new Response('', { status: 204 })` tira:
  un 204 no puede llevar cuerpo, ni vacío. Usar `null`.
- **El panel del navegador oculto no recibe clics:** la página pública se prueba
  con Playwright; y Playwright guarda sus capturas en `.playwright-mcp/` de la raíz
  del espacio de trabajo, con la URL de la cita (y su token) adentro: borrarlas.
- **Contar en la misma sentencia que inserta** ve la foto de antes del trigger
  AFTER: el pendiente "no estaba" y sí estaba. Verificar en otra consulta.

## Cómo se probó (para repetirlo)

1. La migración con el bloque que siempre aborta: 15 casos, entre ellos que lo
   que escribe la sincronización y los avisos NO se vuelve a anotar, y que mover
   o reasignar sí.
2. Línea base en la página: "jueves, 9 horarios" (predicho 9).
3. Una persona ocupada 10-12 en el CRM y un evento en el Google de la otra 10-11
   (creado con su propio permiso desde un script que nunca imprime el token).
   Predicho: 8, sin las 10:00. Dio 8 sin las 10:00 en la página y en "Nueva cita".
4. Reservar a las 11 → fue a la persona libre, evento con el invitado y la marca;
   mover a la 1 → el mismo evento cambió de hora (y al mover se ofrecían las 11);
   cancelar → evento borrado. Cada paso leyendo el evento en Google y la cita en la
   base, con el correo sin `.ics`.
5. Una cita a mano por el trigger + la ruta del cron (401 sin secreto y con uno
   falso) → evento sin invitados; borrarla → evento borrado.
6. Borrar todo lo de prueba, también en Google.
