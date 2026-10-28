# Skill: Recordatorios de cita, sin montarlos sobre el motor de seguimientos

## Cuándo usar esta skill

- Hay una agenda (citas en una tabla) y hay que **avisarle a la persona antes de su cita**: un día antes, tres horas antes o lo que el negocio elija.
- El proyecto **ya tiene un motor de mensajes programados** (seguimientos, secuencias, recordatorios de pago) y la tentación es colgar el recordatorio de ahí «porque ya manda mensajes».
- El aviso tiene que llevar un **link para cambiar o cancelar**, y la base guarda solo la huella del token, no el token.
- Cada negocio tiene que poder **configurarlos**: prenderlos o apagarlos, cuántos, cuánto antes, por dónde y con qué plantilla.

**Por qué existe.** Se construyó en el CRM de Momentum el 2026-10-27, como fase 4 de la agenda propia (PR #459 del CRM, migración 0165). El plan decía colgar los recordatorios de `followups` con tres excepciones en su barrido. Al leer el barrido vivo resultaron ser **cinco**, y una de ellas era invisible: dos filas sin flujo ni inscripción se cancelaban entre sí. Se hizo un barrido propio y salió en una sesión, probado con un WhatsApp y un correo reales. Además aparecieron dos errores que ninguna prueba feliz veía: un doble punto en la plantilla y un trigger que bajaba el «confirmado» de un nombre.

> El código real está en `assets/`.

---

## Proceso

### 1. Antes de diseñar: leer el barrido que ya existe, no el plan

Pedile a la base la definición VIVA del barrido (`pg_get_functiondef`), no la de la migración, y contá **todas** las reglas que un recordatorio tendría que saltarse. En el CRM fueron cinco:

| Regla del motor de seguimientos | Por qué no le sirve a un recordatorio |
|---|---|
| Se cancela si el contacto contestó | El recordatorio de la cita sale igual aunque haya escrito ayer |
| Se cancela si venció la ventana de 24 h | Afecta solo al texto libre; el recordatorio va siempre por plantilla |
| Espera al horario de envío (8 a 20) | Una cita a las 8:00 necesita su aviso antes |
| Pausa de 2 h entre mensajes al mismo contacto | El recordatorio no puede esperar a que pase otro seguimiento |
| `reemplazados`: con flujo e inscripción en null, `coalesce(null,null) is not distinct from coalesce(null,null)` da TRUE | **Un recordatorio y un seguimiento manual del mismo contacto se cancelaban entre sí.** Nadie lo había visto porque no había dos filas sin flujo |

**La regla:** si la cosa nueva necesita más de una excepción en el motor viejo, cada excepción es un lugar donde se rompe lo que ya anda para los clientes. Se hace un barrido propio que **se vea igual en la pantalla** (Hans pidió que «se configure como los seguimientos») pero que no comparta la lógica.

### 2. El modelo (`assets/0165_recordatorios_de_cita.sql`)

- **`recordatorio_config`:** el interruptor por negocio, arranca apagado, más `activado_at`. Lo que venció antes de prender **no sale**: si no, prender dispara de golpe los recordatorios de todas las citas de mañana.
- **`recordatorio_reglas`:** hasta 3 por negocio. Cada una tiene `minutos_antes` (de 60 a 10080), `canal` (`whatsapp`, `correo` o `ambos`) y la plantilla. El tope lo garantiza un trigger con candado, no la pantalla.
- **`recordatorio_envios`:** una fila por decisión, con **`UNIQUE (cita, minutos_antes, inicio_cita)`**.
  - Es lo que impide mandar dos veces aunque dos pasadas del cron se crucen.
  - Si la cita se mueve, la hora nueva es otra fila y el recordatorio se vuelve a calcular.
  - Por canal se anota cómo le fue: `enviado`, `sin_correo`, `plantilla_no_aprobada`, `error: …`.
- **Guardar la configuración ENTERA en una función transaccional** (interruptor + lista). Borrar y volver a crear en dos pedidos deja al negocio sin recordatorios si el segundo falla.
- **El cron:** pg_cron cada 5 min → pg_net → una ruta de la app. El secreto se genera dentro del Vault, así no hay variable que copiar. La función que despierta la ruta **solo pide** si algún negocio los tiene prendidos y tiene citas en la semana.

### 3. La decisión: pura y con el reloj de afuera (`assets/decidir.ts`)

`decidirRecordatorios({ citas, reglas, yaDecididos, activadoMs, zona, ahoraMs })` devuelve solo lo que ya toca: `enviar`, u `omitir` con su motivo. El barrido anota también lo omitido, para que no se vuelva a decidir y para que la ventana de la cita diga por qué no salió.

- **De noche no.** Si el momento cae antes de las 7:00 del negocio, sale a las 7:00 de ese día. Para una cita a las 8:00, el de «3 horas antes» sale a las 7:00 y no a las 5:00. Si la cita es antes de las 7:00, queda omitido (`de_madrugada`).
- **Reservada tarde:** si la cita tiene ESTA hora desde después del momento del recordatorio, ese recordatorio no sale. «Tener esta hora desde» es lo más nuevo entre `created_at` y la última vez que se movió (`reagendada_at`). La persona acaba de recibir la confirmación.
- **Con más de 2 h de atraso ya no sale** (el cron estuvo caído). Un «1 día antes» que llega con 4 horas para la cita confunde.
- **Uno por vez:** si tocaban dos a la vez, sale el más cercano a la cita y el otro queda omitido.

### 4. Anotar antes de mandar, y mandar mirando la cita viva

1. Cada decisión se inserta con `upsert(..., { onConflict: 'appointment_id,minutos_antes,inicio_cita', ignoreDuplicates: true }).select()`. Solo se manda **lo que ESTA pasada pudo anotar**.
2. Al mandar (`enviar.ts` en el CRM) se **vuelve a leer la cita**. Si se canceló, si su hora ya no es la de la fila, o si el contacto está bloqueado, queda omitido con el motivo. Entre decidir y mandar pasan milisegundos, pero se cubre igual: en la prueba, una fila colgada de una cita cancelada quedó «omitido: cita_cancelled».
3. El intento se suma ANTES de mandar. Un error se reintenta, como mucho 3 veces y dentro de las 2 h, y **solo en el canal que falló**: si el correo ya salió, no se manda dos veces.
4. Una fila que quedó en `enviando` más de 10 minutos es un proceso que murió a mitad: se reintenta.

### 5. El link para cambiar o cancelar (`assets/links.ts`)

El token en claro existe solo en el momento de mandarlo, y la base guarda el sha256. Un recordatorio no puede repetir el de la confirmación. Había tres opciones:

- **Reemplazar el token en cada recordatorio:** descartado, porque el link de la confirmación deja de abrir.
- **Guardarlo legible:** descartado, porque quien lea la base cancela citas ajenas.
- **Un token por mensaje** ✅: cada recordatorio crea uno nuevo y su huella va a `cita_links`. Una cita cargada a mano no tiene link, y su primer token pasa a ser el principal.

`huellaPrincipal(hash)` traduce un link extra a la huella principal **antes** de llamar a las funciones de mover o cancelar, que no cambian. El link se crea recién cuando un canal de verdad lo va a llevar, así no quedan huellas huérfanas.

### 6. Personalizable sin abrir la puerta a fallas mudas

- **Plantilla:** la de la agenda viene elegida (posicional: {{1}} nombre, {{2}} servicio, {{3}} fecha y hora, más el botón con el token). También se puede elegir otra aprobada **con la misma regla de elegibilidad del motor de seguimientos**. Si las dos reglas divergen, una plantilla que anda en un flujo falla acá.
- **Texto libre por WhatsApp: no.** Afuera de las 24 h Meta exige plantilla. Un recordatorio que sale como texto solo si la persona escribió ayer falla callado con todos los demás.
- **El nombre del saludo:** sale de la CITA (lo que la persona escribió al reservar) y, si la cita es a mano, del contacto. Sin nombre, el WhatsApp no sale y queda anotado `sin_nombre`. Para que eso no pase, «Nueva cita» pide el nombre cuando el contacto no tiene uno de verdad.

---

## Gotchas (los que salieron de verdad)

1. **El doble punto de la plantilla.** La fecha formateada termina en «a. m.» y la plantilla seguía con «el {{3}}. Si hace falta…». El cliente iba a leer «10:00 a. m.. Si hace falta». Lo agarró una prueba que comparaba el texto final; la plantilla de confirmación, ya en revisión de Meta, tenía el mismo error. **El arreglo es el parámetro, no la plantilla:** se le saca el punto final (`fechaParaPlantilla`), así no hay que pedir otra aprobación. Probá siempre el texto COMPLETO armado, no los parámetros sueltos.
2. **El trigger que baja el «confirmado».** El CRM tiene un trigger que recalcula `nombre_confirmado` cuando cambia `full_name` sin sesión y el flag no cambia. Si el nombre ya estaba confirmado, un update con `full_name = x, nombre_confirmado = true` lo deja en **false**, porque para el trigger el flag «no cambió». Se hacen dos updates: primero el nombre, después el flag. Lo agarró el bloque que aborta; con un solo update la prueba daba «María José Pérez / f». Antes de escribir una columna con trigger, leé el trigger vivo.
3. **Postgres no acepta `{1,512}` en una regex:** el tope de repetición es 255 («invalid repetition count»). El largo va aparte, con `length()`.
4. **`.in()` de ids va en la URL.** Para leer lo ya decidido de muchas citas, no se usa `.in('appointment_id', ids)`, que pasadas las ~350 no entra en la URL. Se filtra por negocio y por fecha de la cita.
5. **Una pantalla que se prueba con el panel del navegador oculto:** los selectores propios se abren y se cierran solos con clic. Con teclado sí andan: Tab hasta el botón, ↓ abre, ↓/↑ mueven y Enter elige.

---

## Cómo se prueba

1. **La decisión, pura y con el reloj fijo** (`assets/pruebas-decidir.test.ts`). Cubre el ejemplo que se le mostró al dueño (cita el jueves a las 10:00: sale el miércoles a las 10:00 y el jueves a las 7:00), la regla de la noche, reservada tarde, la cita movida, dos a la vez, el atraso, el prender y los reintentos. El **control negativo** de la noche: sin la regla, a las 5:30 ya habría salido.
2. **El bloque que siempre aborta** contra la base viva: permisos (las funciones nuevas sin EXECUTE para PUBLIC), formas y tope, el UNIQUE, la cascada al borrar la cita, el disparador del cron prendido y apagado, y guardar entero (lo inválido no toca la lista).
3. **De punta a punta sin esperar horas.** Se crea la cita para «ahora + 1 h 7 min» con una regla de 1 hora, que vence en ~6 minutos, y la ruta se llama a mano con el secreto del Vault.
   - Antes de la hora, la primera pasada tiene que dar solo «omitido: reservada_después» para las reglas más largas.
   - A la hora: el correo con su link y el WhatsApp real, entregado y en la memoria del bot.
   - Después: mover la cita (se recalcula para la hora nueva), cancelarla (no sale nada) y una fila colgada de la cancelada (queda omitida).
4. **El link extra:** se genera un token, se mete su huella en la tabla de links y se abre la página de la cita. Uno inventado no tiene que abrir nada.
5. **Borrar todo lo de prueba,** incluido el mensaje en el chat y su fila en la memoria del bot, y dejar al negocio como estaba.

## Output esperado

- La migración con config, reglas, envíos, links, la función de guardar y el cron, probada con el bloque que aborta.
- La decisión pura con sus pruebas, el barrido, el envío que mira la cita viva y la ruta del cron con el secreto del Vault.
- Una pestaña que se configura igual que el motor viejo, y en la ventana de la cita: qué salió, qué no y por qué, y lo que viene.

## Ejemplo

**Momentum, 2026-10-27.** Recordatorios de fábrica: 1 día antes por WhatsApp y correo, y 3 horas antes por WhatsApp. María reserva la «Llamada de diagnóstico» del jueves 29 a las 10:00:
- el miércoles 28 a las 10:00 le llegan el WhatsApp y el correo;
- el jueves a las 7:00, el WhatsApp.

Si la mueven al viernes, se recalculan para el viernes. Si la cancela, no le llega nada más. Si reservó el miércoles a las 15:00, el de 1 día no le llega: acaba de recibir la confirmación.

---

## Assets

| Archivo | Qué es |
|---|---|
| `assets/0165_recordatorios_de_cita.sql` | La migración real: config, reglas con tope, envíos con UNIQUE, links, `recordatorios_guardar`, cron con el secreto en el Vault. Al final trae el cambio del nombre en `reservas_reservar` del CRM (específico de ese proyecto) |
| `assets/decidir.ts` | La decisión pura: momento con la regla de la noche, reservada tarde, atraso, uno por vez, reintentos |
| `assets/pruebas-decidir.test.ts` | Las pruebas con el reloj fijo (`node:test`) |
| `assets/plantilla.ts` | El contenido del WhatsApp: la plantilla de la agenda o una del negocio con la regla de los seguimientos, el nombre de la cita y la fecha sin su punto |
| `assets/links.ts` | `huellaPrincipal` y `nuevoLinkDeCita`: un link por mensaje sin tocar las funciones de mover y cancelar |

Usan helpers del CRM (`partesEnZona`, `instanteEnZona`, `firstName`, `resolverPlantillaDelEnvio`, `createAdminClient`). La fuente viva está en `crm-v2/src/lib/recordatorios/` y `crm-v2/src/app/api/cron/recordatorios/`.

## Relacionadas

- `motor-de-horarios-libres` y `reservar-sin-pisarse-pagina-publica`: la agenda de la que salen las citas y el link de gestionar.
- `probar-migracion-contra-base-viva-con-rollback`: el bloque que siempre aborta.
- `revocar-execute-incluye-public`: por qué el revoke va también a PUBLIC.
- `lectura-cortada-por-max-rows`: el tope del `.in()` en la URL.
- `nombre-de-relleno-visible`: de dónde sale un nombre que sirve para saludar.
- `clasificar-por-lista-no-por-fallback`: la misma familia de errores que el `coalesce(null,null)` de los reemplazados.
