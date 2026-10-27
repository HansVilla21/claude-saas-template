# Skill: Reservar sin pisarse y la página pública (agenda propia tipo Calendly)

## Cuándo usar esta skill

- Ya tenés el **motor de horarios libres** (skill `motor-de-horarios-libres`) y ahora un cliente tiene que **reservar solo**, desde un link, sin cuenta.
- Hace falta que **dos personas no agarren la misma hora**, aunque reserven en el mismo segundo.
- El cliente tiene que poder **cambiar la hora o cancelar** con un link que le llega por correo o WhatsApp, sin iniciar sesión.
- La reserva tiene que **pegarse al contacto** del CRM (o crearlo) y **avisar** al equipo y al cliente.

**Por qué existe.** Se construyó en el CRM de Momentum el 2026-10-27, como fase 2 de la agenda propia (PR #455 del CRM, migraciones 0161, 0162 y 0163). Salió en una sesión, probada contra la base real: una carrera de 7 rondas en paralelo, la página en el celular y los tres avisos desde Vercel. Lo transferible es el **reparto del trabajo**: el motor decide qué se ofrece y la base decide quién gana. También cuentan los cinco errores que solo aparecieron al probar en serio (ver Gotchas).

> El código real está en `assets/` (ver «Assets» al final).

---

## Proceso

### 1. El reparto: el motor ofrece, la base decide

- **El motor** (función pura, en el servidor) calcula los horarios libres del mes y vuelve a correr justo antes de reservar (`estaLibre`). Mira el horario, los feriados, el aviso mínimo, la ventana y lo ocupado.
- **La base** cierra la carrera. Entre esa revisión y el insert, otra persona pudo reservar lo mismo. La función `reservas_reservar` (SECURITY DEFINER, solo `service_role`):
  1. toma `pg_advisory_xact_lock` **por servicio** (el límite del día cruza a todos los que atienden);
  2. toma un candado **por cada candidato**, siempre **ordenado por id**, para que dos reservas con candidatos en distinto orden no se traben;
  3. **bajo el candado** vuelve a mirar las citas: choques agrandados con los márgenes congelados, cupo y límite del día, con las mismas reglas del motor;
  4. recién ahí inserta.

  La segunda reserva espera a que la primera confirme y entonces la ve: en READ COMMITTED, cada sentencia de plpgsql toma una foto nueva.
- **No se repite en SQL lo que no cambia** entre la revisión y el insert (horario, feriados, aviso, ventana). Reescribir el motor en SQL abre una segunda lógica que se separa de la primera, el error #29729 de Cal.diy.
- **La agenda manual no toma el candado,** a propósito. El equipo puede encimar citas (con aviso en pantalla). Lo que no puede pasar es que dos **clientes** se pisen.
- El servidor le pasa a la función **los candidatos en el orden del servicio**, los que `estaLibre` devolvió (`horario.recursos`). La función elige el primero que siga libre bajo el candado. Así se reparte entre varias personas sin otra lógica.

### 2. El modelo de datos (sobre la tabla de citas que ya existe)

`assets/0162_reservas_por_la_pagina.sql`:
- **En la cita:**
  - `source` ('manual', 'pagina' o 'bot');
  - `manage_token_hash` (sha256 en hex, único);
  - lo que escribió el cliente: `invitee_name`, `invitee_email`, `invitee_phone` solo en dígitos y `invitee_timezone`;
  - `answers` (jsonb `[{pregunta, tipo, respuesta}]`): **la pregunta se copia** junto a la respuesta, para que la respuesta siga diciendo a qué contestó aunque el negocio cambie o borre la pregunta;
  - `buffer_before_min` y `buffer_after_min` **congelados**: si el negocio cambia los márgenes, la cita sigue ocupando lo que ocupaba;
  - los motivos: `cancel_reason`, `cancelled_by` y `reschedule_reason`.
- **En el servicio:** `public_booking` («Se puede reservar por la página») y `change_min_notice_min` (hasta cuánto antes se puede mover o cancelar; null = hasta que empieza).
- **`booking_type_questions`:** corta, párrafo o lista de opciones (CHECK de al menos 2 opciones), con FK compuesta por `agency_id`.
- **`booking_attempts`:** cada intento con su resultado, para el tope por IP. **Deny-all a propósito**: está escrito en la migración para que nadie lo «arregle» con una policy. Se borra a los 30 días con la limpieza diaria.
- **Tres funciones:** `reservas_reservar`, `reservas_mover` (mueve LA MISMA cita, así el contador de reagendadas la cuenta) y `reservas_cancelar`. Todas devuelven `{ok:false, motivo}` en vez de tirar; los motivos son `limite`, `invalido`, `servicio`, `ocupado`, `no_existe`, `no_activa` y `fuera_de_plazo`.
- **Permisos:** `revoke execute … from public, anon, authenticated` (en Postgres toda función nace ejecutable por PUBLIC) y `grant` solo a `service_role`.

### 3. El link para gestionar (sin cuenta)

`assets/token.ts`:
- 32 bytes al azar en base64url. En la base va **solo el sha256**: quien lea la base no puede cancelarle la cita a nadie. Con 256 bits, adivinar no es un ataque posible, así que los intentos con un token que no existe no se cuentan.
- **Ojo:** si el token viaja en un botón de WhatsApp, el mensaje queda guardado. Después de entregarlo se reemplaza en el registro por un texto fijo.
- La ruta del botón de la plantilla aprobada (`/r/cita/{{1}}`) **no se cambia nunca**: cambiarla obliga a aprobar otra plantilla.

### 4. La página pública

- **Sin sesión:** se abre el prefijo en el proxy de auth (`/r/`). Se lee con el cliente de servicio, pero **solo después** de encontrar el negocio por su link y el servicio dentro de ese negocio.
- **Al navegador solo le llegan los inicios libres,** nunca las citas ni el horario de cada persona: el motor corre en el servidor.
- **La zona del cliente:** el primer render va en la del negocio. El navegador lee la suya con `useSyncExternalStore` (servidor = la del negocio, navegador = la propia), así la hidratación coincide y no hay setState en un efecto. Si difiere, se piden de nuevo los horarios del mes.
- **El calendario del mes:** solo se tocan los días con lugar; la semana arranca el lunes. Debajo van las horas del día elegido. Con cupo se muestra «quedan N lugares».
- **El formulario** (`assets/formulario.ts`, puro, lo usan el navegador y el servidor): nombre, WhatsApp y correo obligatorios, más las preguntas.
  - El WhatsApp va con selector de país; acepta un `+` de otro país y no duplica el prefijo si la persona lo escribió.
  - Los textos son **neutros** (sin tú, vos ni usted), porque sirven a cualquier negocio.
- **Antibot sin cuentas externas:**
  - un campo trampa oculto con `sr-only` (no con `left:-9999px`: la auditoría de desborde lo marca);
  - mínimo 3 s entre elegir la hora y mandar;
  - 20 intentos por hora por IP (HMAC de la IP con un secreto del servidor: sirve para contar, no para saber quién es);
  - 5 reservas por venir por WhatsApp.
- **Si alguien ganó la hora mientras se llenaba el formulario,** el mensaje lo dice y el calendario se vuelve a armar (`key` que cambia).

### 5. El contacto

- Se busca por el WhatsApp **con y sin `+`** (los negocios lo guardan de las dos formas).
- Si existe, la cita se le pega y **no se le pisa nada**: el correo se completa si faltaba y el nombre solo si era el relleno («Lead sin nombre»).
- Si no existe, se crea con fuente propia («Sitio web · Página de reservas») y **en el estado de entrada del negocio**, igual que el que llega por el webhook (0163). El nombre que la persona escribió de su puño cuenta como confirmado.

### 6. Los avisos (después de responder)

`after()` en la server action: la reserva ya quedó guardada, y un correo lento no puede hacerla esperar ni hacerle creer que no se reservó. Cada aviso anota cómo le fue en `appointments.extra.avisos[evento]`, que es lo que se mira si alguien dice que no le llegó nada.
- **Campana** a quien atiende; si atiende un espacio, a owner y admin. Si al mover cambió la persona, a las dos.
- **Correo** por Resend con el `.ics` adjunto. Se mantiene el mismo UID toda la vida de la cita: SEQUENCE mayor al mover, CANCEL al cancelar. El `reply-to` va a quien atiende, no a una casilla que nadie lee. Ver la skill `setup-correo-auth-saas` para el dominio.
- **WhatsApp** con la plantilla y el token en el botón, solo si está aprobada. Si la copia local no la tiene aprobada, se sincroniza con el proveedor **una vez**, así sale sola el día que Meta la aprueba. Va firmado como el bot (no como una persona, que tomaría la conversación) y entra a la memoria del bot.

### 7. Gestionar (`/r/cita/<token>`)

- Muestra la cita y la zona en palabras, y ofrece «Agregar a Google Calendar» (link `calendar/render?action=TEMPLATE`, sin descargar nada).
- **Cambiar la hora:** el mismo calendario, pidiendo los horarios **con el token** (el servicio sale de la cita y la cita no choca consigo misma).
- **Cancelar:** pide un motivo opcional.
- La regla «hasta X antes» se mide contra la hora que la cita **tiene**, no la nueva, y la vuelve a mirar la base.
- Un servicio archivado igual deja cancelar. Para mover, el servicio tiene que seguir activo, aunque el negocio haya apagado la página.

---

## Gotchas (los cinco que solo salieron al probar en serio)

1. **El CHECK de la tabla de avisos rechazaba el destino nuevo.** `notifications.resource_type` aceptaba solo conversación, contacto, tarea e integración. El aviso «Nueva reserva» fallaba sin que nadie lo viera; se vio porque el resultado quedó anotado en `extra.avisos.campana`. Antes de emitir un aviso con un destino nuevo, mirar los CHECK de la tabla.
2. **El contacto nacía sin estado.** El webhook le pone el estado de entrada (`is_intake`) y la función nueva no. Un contacto sin estado no aparece en el tablero. Al crear contactos por un camino nuevo, copiar **todo** lo que hace el camino viejo.
3. **En plpgsql, un alias de tabla con el mismo nombre que una variable `%rowtype`.** `select s.id … from pipeline_stages s`, dentro de una función con `s public.booking_types%rowtype`, puede devolver el id del servicio en vez del del estado. Se vio leyendo el diff de la migración antes de probarla; no hubo error. Usar alias distintos (`ps`).
4. **La llave de Resend estaba solo en el `.env.local`.** Sin ella en Vercel, la reserva funciona y el correo no sale. Listar las variables por nombre antes de declarar listo. Las llaves «solo enviar» de Resend no pueden listar dominios: el remitente se saca de la memoria del proyecto, no de la API.
5. **Con el panel del navegador oculto, los clics no le llegan a la página** aunque esté hidratada: el `elementFromPoint` da el botón y el clic no hace nada. Las páginas públicas se pueden probar con Playwright headless contra el preview (con el link `_vercel_share` del deploy protegido).

Más:
- **Al limpiar datos de prueba con CTE que borran,** los conteos de la misma sentencia ven la foto de antes. Verificar en una consulta aparte.
- **Un aviso que promete un canal que todavía no sale** («llega por WhatsApp» con la plantilla en revisión) es una promesa falsa. La pantalla dice solo lo que seguro llega.
- **El límite del día cuenta como el motor:** reservas distintas por quien atiende e inicio, en la zona de **su** horario. Si el motor cambia esa regla, cambiarla también en `reservas_elegir_recurso`. Son dos lugares a propósito; dejá la cross-reference.

---

## Cómo se prueba (lo que la dio por buena)

1. **El bloque que siempre aborta** (skill `probar-migracion-contra-base-viva-con-rollback`): la migración entera más un `DO` con asserts que termina en `raise exception` con el reporte.
   - Casos del CRM: la misma hora va a la persona 1, después a la 2 y después da «ocupado»; choque parcial; márgenes congelados; contacto existente sin pisar; datos inválidos; topes por IP y por WhatsApp; mover y cancelar; regla de cambio; cupos; límite del día en la zona del negocio; preguntas cruzadas entre negocios; permisos y RLS con el rol real.
   - Después, confirmar que la base quedó intacta.
2. **La carrera real** (`assets/prueba-carrera.mjs`), con la migración ya aplicada: varias reservas al MISMO horario en paralelo, cada una en su conexión de PostgREST.
   - Tiene que entrar exactamente la cantidad correcta.
   - **El ganador tiene que cambiar de ronda en ronda.** Si gana siempre el primero, no hubo carrera de verdad.
   - Después se borra todo, por número exacto y hora de creación. Ojo con un contacto real cuyo número empiece igual que los de prueba.
3. **La página en el celular (375 px), local y en el preview:** reservar, cambiar la hora y cancelar. En cada paso, confirmar en la base el resultado y los tres avisos (`extra.avisos`), más la auditoría de desborde.

## Output esperado

- La migración con las tres funciones y sus permisos, probada en las dos formas.
- La página `/r/<negocio>/<servicio>`, la de gestionar `/r/cita/<token>` y las acciones del servidor (`assets/acciones-reservas.ts`).
- En la pantalla de servicios: el interruptor de la página, «Copiar link», la regla de cambio y las preguntas.
- La ventana de la cita mostrando lo que dejó el cliente.

## Ejemplo

**Momentum, 2026-10-27.** «Llamada de diagnóstico», de 1 h, la atienden Pietro y después Hans. Tres reservas a la misma hora en paralelo:
- en las 7 rondas entró una sola con Pietro solo, y dos (una con cada uno) con los dos;
- la primera reserva por la página se fue a Pietro y creó el contacto en «Nuevo» con fuente «Página de reservas»;
- la reprogramación del cliente movió la misma cita (reagendada 1);
- la cancelación quedó «por el cliente», con su motivo;
- en cada paso salieron el correo con el `.ics` y el aviso a la campana de Pietro.

---

## Assets

| Archivo | Qué es |
|---|---|
| `assets/0162_reservas_por_la_pagina.sql` | La migración real: columnas, preguntas, intentos, las tres funciones con candado, permisos y limpieza |
| `assets/0163_reserva_campana_y_estado_de_entrada.sql` | El CHECK de la campana con el destino nuevo y el contacto que nace en el estado de entrada |
| `assets/acciones-reservas.ts` | Las server actions de la página: pedir horarios del mes, reservar, mover y cancelar (antibot, `estaLibre` antes de la base, avisos en `after`) |
| `assets/formulario.ts` | Validación pura del formulario y del WhatsApp con prefijo de país |
| `assets/token.ts` | Token para gestionar, su hash y el HMAC de la IP |
| `assets/prueba-carrera.mjs` | La prueba de reservas en paralelo contra PostgREST (ids reemplazados por marcadores) |

Usan los helpers del CRM (`is_member_of`, `is_master`, `notif_emit_to_recipients`, `createAdminClient`): adaptarlos a los del proyecto. La fuente viva está en `crm-v2/src/lib/reservas/` y `crm-v2/src/app/r/`.

## Relacionadas

- `motor-de-horarios-libres`: lo que ofrece la página y la validación de `estaLibre`. Esta skill le agrega quién gana la hora.
- `agendamiento-google-calendar`: la fase 3. Lo ocupado de Google entra al motor y a la revisión bajo candado.
- `probar-migracion-contra-base-viva-con-rollback`: el bloque que siempre aborta.
- `setup-correo-auth-saas`: el dominio de Resend con el que salen los correos.
- `whatsapp-proactivo-a-staff`: la plantilla con botón de URL dinámico (`base fija + sufijo`).
- `revocar-execute-incluye-public`: por qué el revoke va también a PUBLIC.
