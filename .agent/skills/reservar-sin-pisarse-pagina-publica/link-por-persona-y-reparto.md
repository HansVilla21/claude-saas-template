# Apéndice — El link de cada persona, el reparto bajo el candado y la cita a mano que avisa

Capturado el 2026-10-28 de las mejoras que Hans pidió al probar la agenda del CRM (PR #463 del CRM, migración `assets/0166_link_por_persona_reparto_y_aviso.sql`). Extiende la skill: la página ya reservaba sin pisarse, pero con un solo link por servicio y la cita yendo siempre al primero libre del orden.

## Cuándo aplica

- **Un link por persona.** El negocio quiere que cada uno tenga su propio link, como en Calendly: un closer comparte el suyo y la cita le queda a él. Además, el link del servicio tiene que seguir repartiendo.
- **Un reparto justo.** Un servicio con varias personas tiene que repartir «parejo» y no siempre darle al primero libre.
- **La cita a mano también avisa.** Ya existe una cita que carga el equipo, y ahora tiene que avisarle al cliente igual que una reserva: confirmación, invitación de calendario, cambios y recordatorios.

## 1. El reparto va DENTRO de la función con candado, no en el servidor ni en el navegador

La tentación es que el servidor cuente las citas de cada uno y le pase a la base el elegido. **No sirve:** dos reservas al mismo tiempo leen el mismo conteo y eligen a la misma persona. El conteo tiene que correr **después** del candado del servicio, que ya existía por el límite del día. Así, la segunda reserva espera y ve la cita de la primera.

```sql
for v_recurso in
  select u.r from unnest(p_recursos) with ordinality as u(r, n)
   order by (u.r is distinct from p_preferido),          -- al mover: primero quien ya la tiene
            case when s.reparto = 'parejo' then (
              select count(*) from appointments a
               where a.booking_type_id = s.id and a.resource_id = u.r
                 and a.requested_resource_id is null      -- las del link de cada persona no cuentan
                 and a.source in ('pagina', 'bot')        -- las cargadas a mano no cuentan
                 and a.status <> 'cancelled'
                 and a.created_at > now() - interval '30 days'
            ) end,
            u.n                                           -- empate: el orden del servicio
loop
  -- las mismas reglas de «libre» de siempre; el primero que pasa, gana
```

- **Qué cuenta el «parejo»** (decidido con el negocio, con un ejemplo):
  - **Cuentan solo las citas que repartió el sistema:** las del link del servicio y las del bot.
  - **No cuentan las del link de cada persona.** Si contaran, el que consigue sus propias citas recibe menos del reparto.
  - **No cuentan las cargadas a mano ni las canceladas.**
  - **La ventana es de 30 días móviles.** Así, quien vuelve de vacaciones no recibe una tanda seguida.
- **El atrasado ocupado no frena la reserva:** pasa al siguiente. El reparto ordena; no exige.
- **El motor no cambia:** sigue ofreciendo el horario si al menos uno está libre.
- **El bot hereda el reparto sin código propio:** llama a la misma función con los candidatos del motor.
- **Prueba de que es justo:** 10 reservas a la vez por PostgREST, cada una a otra hora, tienen que dar 5 y 5.

## 2. Al mover, primero quien ya la tiene

La función elegía «el primero libre del orden». Por eso, una cita de Hans que el cliente movía a una hora en que Pietro estaba libre **pasaba a Pietro**: nadie lo había pedido, y nadie lo había notado. El parámetro `p_preferido` = `c.resource_id` la deja con su dueño si está libre. Con la función vieja, el control negativo da «P»; con la nueva, «H».

## 3. El link de una persona

- **El final del link** es `booking_resources.slug`. Lo pone un trigger con el primer nombre, solo si falta, y si se repite agrega `-2`.
  - **No cambia con el nombre:** un link ya compartido no se rompe.
  - **El backfill va de a una fila,** en un bucle. En una sola sentencia, dos «maria» del mismo negocio no se ven entre sí y chocan con el índice único.
- **El servidor filtra el servicio a esa persona antes de correr el motor** (`soloConPersona`), así que la página ve solo sus horarios.
- **La base vuelve a filtrar:** `p_persona` deja como candidatos solo a esa persona. Si el motor no la dejó, la respuesta es «ocupado» y nunca pasa la cita a otro.
- **La cita guarda a quién se pidió** (`requested_resource_id`):
  - al moverla, solo puede ir con esa persona: la base lo vuelve a filtrar, y la página de gestionar ofrece solo sus horarios;
  - el «parejo» no la cuenta.
- **Nunca se muestra el correo de alguien sin nombre cargado:** el nombre visible del recurso cae al correo cuando falta el nombre, y eso no puede salir en una página pública.
- **En Servicios:**
  - el link del servicio dice cómo reparte («Reparte en orden: Pietro y después Hans»);
  - hay una fila por persona con «Copiar» y «Ver», y la fila de quien mira dice «Copiar mi link».

## 4. Sumarle un parámetro a una función que ya llama producción

`create or replace` con otra lista de argumentos **crea una segunda función**. Con dos firmas, PostgREST no sabe a cuál llamar y el código de producción falla. Por eso, en la MISMA migración:

1. `drop function` de la firma vieja;
2. la nueva, con el parámetro **con default**, para que el código de hoy la siga llamando con los mismos argumentos;
3. el `revoke … from public, anon, authenticated` de nuevo, porque la función nueva nace ejecutable por PUBLIC.

Además, el servidor manda el parámetro nuevo **solo cuando lo tiene** (`...(persona ? { p_persona } : {})`). En el bloque que aborta se verifica que quede **una sola firma** de cada función y que la llamada con los argumentos de siempre siga andando.

## 5. La cita a mano que le avisa al cliente

- **Una columna con tres valores,** a propósito:

| Valor | Qué significa | Qué le llega al cliente |
|---|---|---|
| `true` | Hay que avisarle | Todo |
| `false` | Cita interna | Nada: ni confirmación, ni invitación, ni recordatorios |
| `null` | Cita vieja, nadie eligió | Lo de antes: los recordatorios sí, la confirmación no |

  Backfillear las viejas en `true` las haría «avisadas» sin haberles avisado nunca. Backfillearlas en `false` les apagaría los recordatorios que ya tenían.
- **Mismo camino que la reserva:**
  1. se copian nombre, correo y teléfono del contacto a `invitee_*`;
  2. se crea el link para gestionarla (el primero es el principal);
  3. Google va primero: si quien atiende lo tiene conectado, invita al cliente y el correo sale sin el `.ics`;
  4. por último, los avisos.
- **Qué aviso le toca** sale de una función pura:
  - la primera vez que queda prendida, la confirmación;
  - si ya estaba avisada y cambió la hora, la hora nueva;
  - cancelarla desde la agenda le avisa;
  - «se hizo» y «no llegó» no le mandan nada.
- **Al editar, la casilla se manda solo si alguien la tocó:** si no, guardar una nota en una cita vieja (`null`) la pasaría a `false` y le apagaría los recordatorios.
- **La pantalla dice solo lo que sale:** «Por WhatsApp al …, cuando Meta apruebe la plantilla», si todavía no está aprobada.
- **La campana no le suena a quien hizo el cambio.**

## Gotchas de la prueba

- **La carrera contra un negocio con Google conectado crea eventos reales que invitan a los correos de prueba** (`@ejemplo.test`). Antes de borrar las citas de prueba, poné `google_invitado = false`: así Google borra los eventos sin mandar cancelaciones. Mejor todavía, usá correos propios.
- **Para ver la invitación de Google de verdad,** el cliente de prueba tiene que tener un correo **distinto** del Google que organiza. Si es el mismo, Google lo marca como organizador y no le manda nada.
- **Hacé la prueba con un servicio de prueba,** no con el del negocio: el negocio eligió su modo y no se le cambia para probar.
- **Una cita que el cliente cancela con su link mientras probás aparece como `cancelled_by = 'invitee'`.** Antes de sospechar de tu código, mirá los logs del servidor de prueba: ahí se ve si alguna acción tuya la canceló.
