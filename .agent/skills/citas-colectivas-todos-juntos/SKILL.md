# Skill: Citas colectivas «Todos juntos» e invitados del cliente

## Cuándo usar esta skill

- Un servicio lo atienden **varias personas a la vez**, no una u otra: la capacitación de Momentum la dan Hans y Pietro juntos.
- La agenda propia (motor de horarios libres + página de reservas) ya anda y el cliente pide que **la hora solo se ofrezca cuando están libres TODOS**.
- Quien reserva quiere **sumar invitados por correo** (en el caso real, hasta 2 colegas de la clienta).
- Hay que crear **un solo evento de Google** para varias personas, con su Meet, sin duplicarlo en cada calendario.

**Por qué existe.** Se construyó en el CRM de Momentum el 2026-10-28 (PR #474 del CRM, migración 0169) sobre las skills `motor-de-horarios-libres`, `reservar-sin-pisarse-pagina-publica` y `agendamiento-google-calendar`. Lo transferible no es el código sino **dónde guardar al equipo para no romper nada que ya lee la cita**, cómo dejar «libre» en una sola función y las trampas de Google que solo aparecen con varias personas en un evento. Una revisión independiente encontró una de ellas, y era crítica.

---

## Cuándo NO usar esto

**Un solo recurso por cita alcanza para el 95 % de los negocios.** Antes de construir esto, preguntá:

- ¿Siempre van **dos personas o más** a la misma cita? Si es «una u otra», eso ya lo hace el reparto común (`parejo` u orden fijo). No es esta skill.
- ¿Basta con que la cita quede con **una** persona y las demás se enteren por el chat? Entonces alcanza la cita normal.
- ¿Los invitados son raros? Un campo de notas con sus nombres sale gratis.

Esta skill suma una tabla, una segunda forma de decidir «libre» y trampas de Google. Se paga solo si el negocio vende de verdad algo que se da en equipo.

---

## Proceso

### 1. El modelo de datos: el primero en la cita de siempre, los demás en una tabla aparte

- Un **tercer modo de reparto** en el servicio: `'juntos'` (los otros dos eran el orden fijo y `'parejo'`).
- **El primero del equipo sigue en `appointments.resource_id` / `assigned_user_id`.** Una tabla `cita_equipo` guarda **solo a los demás**.
  - Todo lo que ya lee esas columnas (la agenda, los avisos, los recordatorios, el reparto) sigue andando sin tocarlo.
  - Una cita de una persona **no tiene filas nuevas**.
- Si el primero es un espacio (una sala), la cita queda sin encargado, igual que en `reservas_reservar`.
- `cita_equipo` **copia el `user_id`** para no hacer otro join cada vez que se pregunta «¿está ocupado fulano?».
- **RLS:** lectura para los miembros del negocio. Escriben únicamente las funciones de la base (`service_role`). Dejalo escrito en la migración para que nadie «arregle» con una policy.

### 2. «Libre» en UNA sola función

- `reservas_recurso_libre` es la regla para **un** recurso, **extraída sin cambios** de la función de reparto que ya existía. La usan dos caminos:
  - el reparto común (elige al primero libre);
  - `reservas_elegir_equipo` (¿están libres **todos**?).
- **Una cita también ocupa a cada uno de su equipo, en las dos direcciones.** La colectiva bloquea a Hans en los otros servicios, y una cita de Hans bloquea la colectiva.
- **Candados en el mismo orden global:** primero el servicio, después los recursos **por id**. Así una reserva colectiva y una común no se traban entre sí (misma regla que `reservar-sin-pisarse-pagina-publica`).
- **Control de regresión al extraer la función.** Copiá la función vieja a `pg_temp` dentro del bloque que siempre aborta y compará las dos en **cada media hora de 60 días**. En el CRM: 11.524 comparaciones, 0 diferencias. Sin esto, «la extraje sin cambios» es una creencia.
- **La carrera** se probó en un negocio demo con 2 salas (espacios, sin Google, para no mandar invitaciones reales):
  - 10 reservas en paralelo → entró 1;
  - 6 colectivas + 6 comunes en paralelo → entró 1.

### 3. El motor (puro)

- Con `juntos`, **solo salen los inicios donde están TODOS libres.** Si hay cupo, quedan los lugares del más lleno.
- **Trampa del límite del día.** El motor contaba la cita colectiva **una vez por persona** y la base la cuenta **una vez**. Con un límite de 3 al día, el motor cerraba el día antes que la base. Se arregló con una `claveLimite` igual a la de la base. Es la misma advertencia de las otras skills: la regla vive en dos lugares, dejá la cross-reference.
- **Al mover una cita colectiva** el motor usa **el equipo DE LA CITA**, no el que tiene hoy el servicio. La base hace lo mismo. Si cambiaste el equipo del servicio después de reservar, mirar el de hoy ofrece horas que la cita no puede ocupar.

### 4. Google: un evento para varias personas

- El evento va en el calendario **del primero del equipo que tenga Google conectado**. Los demás del equipo, el cliente y sus invitados van como `attendees`. El organizador **no** figura en `attendees`.
- **Trampa 1: `extendedProperties.private` no llega a la copia del evento en el calendario de un invitado.** Sin `extendedProperties.shared`, el Google del compañero lee su copia como «ocupado sin marca» y **cuenta la cita otra vez**: al moverla, choca consigo misma. **Poné la marca en los dos** (`private` y `shared`).
- **Trampa 2 (la encontró la revisión independiente; era crítica).** Si quien tiene el evento **se saca de la cita**, la versión ingenua busca «el primero con Google del equipo de hoy» y pasa el evento a otro calendario. Al cliente le llegaba **«Evento cancelado» con la cita viva**, y además otro link de Meet.
  - **Arreglo:** en una cita colectiva el evento **se queda con quien lo tiene** mientras siga conectado, aunque ya no esté en el equipo.
  - Una cita de **UNA** persona que se reasigna sí se muda de calendario, como antes.
- **Trampa 3: Google no deja cambiar el organizador de un evento** usando el token de otra persona. Por eso mudar de calendario es **siempre cancelación + invitación nueva**, nunca un `patch`. Eso explica la trampa 2: mudar no es gratis, el cliente lo ve.
- **El Meet:**
  - Pedir el Meet sobre un evento que **ya tiene sala** (por ejemplo una que alguien agregó a mano en Google) crea **otra** y reemplaza la anterior. **Antes de pedirlo, leé el evento** (`hangoutLink` / `conferenceData`).
  - El lugar «Videollamada» que propone la pantalla **no es un link.** El Meet se pide si el lugar **no trae `http(s)://`** (PR #472 del CRM). Si se pedía solo cuando el lugar estaba vacío, el servicio con «Videollamada» nunca generaba sala.
  - Recordá `conferenceDataVersion=1` en la query (ver `agendamiento-google-calendar`).

### 5. Los invitados del cliente

- **Hasta 10 correos.** Se validan en el servidor y la base los exige con una **CHECK**: minúsculas, sin repetidos, sin el correo de quien reserva. La función de la CHECK es `IMMUTABLE`.
- ⚠️ **La función de la CHECK NO se revoca a `authenticated`.** La CHECK corre con el rol de **quien escribe la fila**; si le quitás el `execute`, escribir deja de andar. Es la excepción a `revocar-execute-incluye-public`: ahí se revoca lo que se *llama* a mano, acá lo que usa el *motor de la tabla*.
- **Quién avisa a los invitados:**
  - si Google los invita, **Google les avisa cada cambio**;
  - si no (el equipo no tiene Google), nuestro correo con el `.ics`, **con el mismo UID** que el del cliente y **sin link para cambiar**: solo cambia la cita quien reservó.
- **Si se suman o se quitan después de enviado el `.ics`:** `REQUEST` a los nuevos y `CANCEL` a los quitados. Reenviar a todos confunde; mandar solo a los nuevos deja viva la cita de los quitados.
- **Abuso.** Cada invitado es **una invitación desde la cuenta de Google del equipo**: la página pública se puede usar para mandarle invitaciones a cualquiera. Tope: **3 reservas con invitados por día y por dispositivo** (hash de la IP, igual que el antibot de la página).

### 6. «Sacar de la cita»

- Guarda **solo el equipo**, con la cita **como está en la base**. Si usara el formulario completo, una hora que alguien cambió y no guardó **se iría junto** y el cliente recibiría «cita movida».
- **El último no se puede sacar** (una cita sin nadie no es una cita).
- **Al editar, el equipo se guarda ANTES que la cita.** Si la función del equipo falla, la cita no queda movida a medias.

---

## Gotchas de la prueba

1. **El aviso emergente de Novedades tapaba la tira de personas.** Un clic cayó en «Sí, mostrame cómo» y marcó la novedad como vista para el dueño **en producción** (el servidor local usa la base real). Se revirtió por SQL. Antes de hacer clic en pruebas locales, cerrá los avisos emergentes.
2. **En el servidor local, después de reservar, la pestaña fue una vez a `/`.** En producción, con Playwright sin sesión, no se reprodujo (un solo `pushState` a `/r/cita/...`). Fue cosa del modo desarrollo o del panel: probá también en el deploy antes de buscar un bug.
3. **Para probar con un número que recibe la confirmación por WhatsApp, usá el del dueño.** Un número inventado le escribe a un desconocido.
4. **Los alias `+invitado1@gmail.com` llegan al mismo buzón** y Google los trata como invitados distintos. Sirven para probar sin cuentas nuevas, y a la vez muestran que «sin repetidos» se compara por texto, no por buzón.

---

## Cómo se prueba

1. **El bloque que siempre aborta** (`probar-migracion-contra-base-viva-con-rollback`): la migración entera, la comparación de la función vieja contra la nueva a lo largo de 60 días, los casos de choque cruzado (colectiva contra común, en las dos direcciones) y el reporte en el mensaje del `raise exception`.
2. **La carrera real** con espacios y sin Google (ver el punto 2). El ganador tiene que cambiar de ronda en ronda.
3. **Google real, una vez,** con un evento de punta a punta: crear, mover, **sacar al dueño del evento** (la trampa 2) y comprobar que el cliente no recibe «cancelado».

## Output esperado

- La migración con el modo `'juntos'`, `cita_equipo`, `reservas_recurso_libre`, `reservas_elegir_equipo`, la CHECK de invitados y los permisos.
- El motor con la regla de «todos libres» y la `claveLimite`.
- El módulo de Google con el evento único, la marca en `private` y `shared`, y la regla de quién conserva el evento.
- La pantalla de la cita con la tira del equipo, «Sacar de la cita» y el campo de invitados.

## Relacionadas

- `motor-de-horarios-libres`: el motor puro que ahora entiende `juntos`.
- `reservar-sin-pisarse-pagina-publica`: el reparto con candado y la página; esta skill le suma el equipo.
- `agendamiento-google-calendar`: OAuth, `freeBusy` y `conferenceDataVersion`.
- `probar-migracion-contra-base-viva-con-rollback`: el bloque que siempre aborta.
- `revocar-execute-incluye-public`: y su excepción para la función de una CHECK.
