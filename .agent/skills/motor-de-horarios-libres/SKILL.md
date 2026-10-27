# Skill: Motor de horarios libres (agenda propia tipo Calendly)

## Cuándo usar esta skill

- Un cliente quiere que sus clientes **reserven solos**, sin pagar Calendly, o Calendly no encaja: varios negocios en un sistema, un bot que reserva dentro de WhatsApp, espacios con cupo.
- Hay que responder **«¿qué horarios libres tiene X para el servicio Y?»** en una página pública, en un bot o en una vista previa.
- Hay **cupos**: una cancha para un reto de dos, una clase de veinte.
- La agenda de un sistema **no ofrece las horas libres** y el cliente terminó usando Calendly. Es lo que pasó en el CRM de Josué (JRM-76): esta pieza es la que faltaba.

**Por qué existe.** Se construyó en el CRM de Momentum el 2026-10-27, como fase 1 de la agenda propia. El diseño salió de la ingeniería inversa de Calendly que hizo REA OS (`REA OS/sistemas/calendly/`). Antes de escribirlo se leyó el motor de Cal.diy y se evitaron sus errores abiertos. En una sesión quedaron el motor, las pantallas y la base, en producción y probados con datos reales. **El motor es lo transferible:** una función pura que usan la página, el bot y la vista previa. Los tres le preguntan a la misma función, así nunca se ofrece una hora que otro camino considera ocupada.

> El código está en `assets/`, listo para copiar (ver «Assets» al final).

---

## Proceso

### 0. Construir, no instalar cal.com

Esto se verificó el 2026-10-25:
- **cal.com cerró su código en abril de 2026.** Instalarlo en un servidor propio ahora es Enterprise, con contrato.
- **Cal.diy** es lo que quedó abierto, con licencia MIT. Se recomienda para uso personal: no maneja equipos ni varios negocios.
- **Su Platform** cerró a clientes nuevos en diciembre de 2025.
- **Lo que diferencia** (un bot que reserva en el chat, la cita pegada al contacto) había que construirlo igual.

Conclusión: se construye propio, y del motor de Cal.diy se copian las ideas, no el código. El repo es `calcom/cal.diy`: `packages/features/schedules/lib/slots.ts`, `date-ranges.ts` y `getUserAvailability.ts`.

### 1. El modelo de datos

`assets/esquema.sql` es la migración real del CRM:
- **`availability_schedules`:** la semana va en **jsonb** (`{"0": [], "1": [{"desde":"08:00","hasta":"17:00"}], …}`), porque se guarda y se lee siempre entera. Lleva también la zona IANA y `holidays` (`all`, `mandatory` o `none`).
- **`availability_exceptions`:** un día especial por fila (`schedule_id`, `date`, `intervals`, `label`). Una lista vacía es «cerrado». Van en filas porque se agregan de a uno y se consultan por rango.
- **`booking_resources`:** quién o qué atiende. Puede ser una persona (`user_id`, cuyo nombre se lee de `users`) o un espacio (`name`). Cada uno tiene su horario.
- **`booking_types`:** los servicios, con duración, paso, márgenes antes y después, aviso mínimo, ventana (días corridos, hábiles o sin límite), límite diario, `seats_per_slot`, lugar y un `schedule_id` opcional (los días propios del servicio). Se archivan, no se borran: las reservas los van a nombrar.
- **`booking_type_resources`:** quién atiende cada servicio. Hoy es uno, pero la tabla ya admite varios para el reparto.

**Las tres decisiones que no se ven en el esquema:**
1. **Toda llave foránea lleva `agency_id`:** `(schedule_id, agency_id)` apunta a `(id, agency_id)`. Un error en una server action no puede colgarle a un negocio el horario de otro, porque la base lo rechaza. Un `on delete set null` con FK compuesta anularía también el `agency_id`, que es `not null`. Se usa **`on delete set null (schedule_id)`**, que en Postgres está desde la versión 15.
2. **Escribir, solo desde el servidor.** Hay policy de SELECT para miembros y ninguna de escritura, más `revoke insert, update, delete` a `authenticated`. Las server actions usan el cliente de servicio después del gate, filtran SIEMPRE por el `agency_id` del contexto (nunca uno del navegador) y **cuentan las filas que vuelven** (`.select('id')`): un update que no matchea responde éxito con 0 filas.
3. **No tocar la tabla de citas hasta la fase de reservar.** El cupo es un conteo de reservas activas del mismo servicio, recurso e inicio. Las columnas de la reserva (servicio, recurso, márgenes congelados, token para gestionar) entran con la página.

### 2. El motor: rangos → restar → generar

`assets/motor.ts` es puro: no toca la base, la red ni el reloj (`ahora` entra por parámetro). Las decisiones, en orden:

1. **Rangos.** Para cada fecha del negocio, las franjas valen en este orden: **el día especial le gana al feriado y el feriado a la semana.** Así se abre un feriado puntual o se cierra por vacaciones. Cada franja se pasa a instantes con la zona del horario (`instanteEnZona`, dos pasadas, sin offsets fijos), con `'24:00'` como fin de día. Las franjas pegadas **se unen**: 22:00–24:00 más 00:00–02:00 son UNA, así una cita de las 23:30 cruza la medianoche.
2. **El servicio con días propios se CRUZA** con el horario de quien atiende (intersección). No lo reemplaza: «valoraciones solo martes de 9 a 12» con una doctora que trabaja de 8 a 17.
3. **Restar lo ocupado, agrandado por los márgenes:**
   - el inicio de lo ocupado se corre `(margen antes del ocupado + margen después del nuevo)`;
   - el fin se corre `(margen después del ocupado + margen antes del nuevo)`.

   **Los márgenes no se aplican contra el borde del horario:** con «15 min antes», igual se ofrece a las 8:00 cuando abre a las 8:00. Una cita cargada a mano no tiene márgenes; las reservas los guardan congelados.
4. **Generar.** Sobre cada rango libre:
   - el primer inicio es el mayor entre el comienzo del rango y `ahora + aviso mínimo`;
   - ese inicio se **alinea a la grilla CONTANDO DESDE LA HORA EN PUNTO, en la zona del NEGOCIO**, con el paso de alineación = el mayor de 60, 30, 20, 15, 10 y 5 que divide al paso (con 45 → 15, con 8 → 1);
   - después avanza de a un paso (si no hay paso, lo que dura el servicio), y un inicio queda solo si **la cita entera entra** en el rango.

   Después de una cita que termina 10:10, con paso 30, el siguiente es 10:30, no 10:10.
5. **Cupos.** Las reservas del MISMO servicio en el MISMO inicio comparten el horario hasta llenarlo (`quedan = cupos − reservas`). **Cualquier otro inicio que se les pise queda ocupado**, y un horario lleno **no sale del motor**.
6. **Límite diario.** El día que llegó al límite se convierte en un bloque ocupado entero y la misma resta lo saca. Se cuentan reservas distintas por (recurso, inicio): con cupo, sumarse a una clase no gasta el límite.
7. **Ventana, medida por el INICIO.**
   - Días corridos: hasta hoy + N, inclusive, y el último día vale entero.
   - Días hábiles: lunes a viernes, sin los feriados en que ESE negocio cierra.
   - También existe «sin límite».
8. **La zona del cliente.** Se expanden las fechas del negocio con **±2 días** de colchón (la diferencia más grande entre dos zonas es de 26 h), se genera, y se agrupa por la fecha en la zona del cliente. «Hoy» es el del cliente, como en Calendly: en Tokio aparece el sábado y desaparece el martes.
9. **La salida trae TODAS las fechas pedidas,** las vacías con su **motivo**: pasado, fuera de la ventana, feriado (con el nombre), cerrado, límite diario, aviso mínimo u ocupado. La pantalla pinta el mes sin adivinar, y la vista previa le explica al dueño por qué un día no tiene nada.
10. **Varios recursos:** un horario sale si al menos uno está libre, y dice cuáles (`recursos: [...]`). Es la base del reparto.
11. **Validar al reservar con la MISMA función** (`estaLibre(entrada, inicio)` llama a `horariosLibres` de ese día). Lo de que dos personas no reserven a la vez **no es del motor**: es de la base, con un candado por recurso y día que vuelve a calcular y después inserta.

### 3. Las pruebas que lo dan por bueno

`assets/pruebas-motor.test.ts` trae 38. Las que vienen de Calendly, medidas en vivo por REA OS, con L-V de 9 a 17 (Costa Rica), 45 min cada 30, 24 h de aviso y 14 días:

| Caso | Esperado |
|---|---|
| Domingo 16:16, se mira el lunes | Sin horarios, motivo «aviso mínimo» (el de las 16:00 queda a menos de 24 h) |
| Un martes | 15 horarios, de 09:00 a 16:00 |
| El mismo martes, cliente en Madrid | De 16:00 a 23:00 |
| El día 14 / el día 15 | El 14 adentro, el 15 «fuera de la ventana» |
| Tokio, lunes 07:29 | Disponibles del miércoles al sábado |

Además hay pruebas de:
- márgenes antes y después, márgenes congelados y que no cuentan contra el borde;
- alineación después de una cita de 10:10;
- cupos y límite diario;
- feriados con los tres modos;
- un día especial que abre un feriado;
- días propios del servicio y el motivo correcto con ellos;
- la medianoche;
- el cambio de horario de verano en Nueva York;
- días hábiles saltando un feriado;
- `estaLibre` contra lo que se lista.

**Corré el control negativo cuando arreglés algo:** volvé el motor a la versión anterior y confirmá que la prueba nueva falla. Las dos del motivo se probaron así.

### 4. Feriados (Costa Rica) en código, no en una tabla

Están en `assets/feriados-cr.ts`. Diez caen siempre el mismo día y los otros dos (Jueves y Viernes Santo) salen de la Pascua, calculada con el algoritmo de Meeus/Jones/Butcher. Con una tabla, hay que acordarse de cargar el año siguiente cada diciembre, y el día que nadie se acuerda la agenda ofrece el 1 de enero **sin dar error**.
- **De pago no obligatorio:** el 2 y el 31 de agosto y el 1 de diciembre. El horario elige si cierra en todos, solo en los obligatorios o en ninguno.
- **Traslados a lunes:** la Ley 9875 los movió de 2020 a 2024. En 2026 no hay ninguno. Para 2027, al 2026-10-27 había un proyecto de ley y ninguna ley aprobada. Si una ley mueve uno, va al mapa `TRASLADOS`.
- **Otro país:** se reemplaza `feriados-cr.ts`. El motor solo le pregunta `cierraPorFeriado(fecha, modo)`.

### 5. La pantalla: la vista previa corre el MISMO motor

- **«Así se vería tu semana»** corre `horariosLibres` **en el navegador**, con el servicio tal como está en el formulario, sin guardarlo. Al cambiar la duración, la semana cambia en el momento. Es la mejor prueba de que el motor hace lo que el dueño cree.
- **Lo ocupado** de la primera semana llega con la página (server component, en paralelo con la configuración). Las semanas siguientes se piden **en el clic de «Semana siguiente»**, no en un efecto: el linter de React prohíbe hacer setState dentro de un efecto, y en el clic es más simple.
- **Se muestra el motivo de cada día vacío** y cuántas citas ya se descontaron.
- **Mientras no exista la página para reservar, las pantallas solo las ve master.** Un dueño que carga servicios y espera citas que no llegan es peor que no tener nada. Una sola constante (`SOLO_MASTER`) la leen el gate de las páginas y el menú: si fueran dos, se separan.

---

## Gotchas (los que ya costaron)

1. **El motivo tiene que cruzar con los días del servicio.** Probando en el preview, un servicio que solo se da de lunes a viernes decía «Todo ocupado» el sábado, y «Todo ocupado» también hoy cuando el aviso ya se había comido la mañana. Los horarios eran correctos; el texto mentía, porque miraba solo el horario de quien atiende. Ahora el motivo usa los mismos rangos cruzados que la generación.
2. **Lo que NO se copió de Cal.diy:**
   - **Listar y validar con lógicas distintas** (#29729, #30266): se ofrece un horario que después falla.
   - **El horario lleno lo esconde la pantalla** (#28081): el servidor lo sigue contando.
   - **Sumarse a una sesión gasta el límite** (#17221).
   - **La grilla en la zona del que reserva:** un cliente en la India ve las horas a :30.
   - **El día del cambio de horario:** formatean con `hh` (12 h) y corren la tarde una hora (#30021).
   - **Fechas de excepción como `Date` a medianoche UTC** (#30271): se corren de día. Acá son texto `YYYY-MM-DD`.
3. **Un selector de hora de 00:00 a 23:45 no puede elegir «24:00».** El motor lo soporta; para un turno de noche se cargan dos franjas pegadas.
4. **No envolver un selector propio (un `<button>`) en un `<label>`:** el clic en el texto lo activa dos veces. Va en un `<div>` con un `<span>` de etiqueta.
5. **El interruptor chico (16×28 px) queda debajo del piso táctil de 24 px.** En una lista de días se usa el mediano, salvo que un `<label>` le dé el área.
6. **Guardar un servicio son varias escrituras** (su horario propio, el servicio, quién atiende). El orden que deja algo coherente si una falla: primero el horario, que no se ve; después el servicio; al final los enlaces. Si el servicio no se crea, se borra el horario huérfano.
7. **El recurso no se borra si atiende un servicio:** se dice cuál («Atiende «X». Primero elegí a otra persona en ese servicio»). Si no, el servicio se queda sin nadie y deja de ofrecer horarios sin que nadie entienda por qué.

---

## Output esperado

- **Base:** las tablas de `assets/esquema.sql`, con las llaves compuestas y escritura solo desde el servidor. Se prueba con el bloque que siempre aborta: cruces entre negocios rechazados, un rol que ve solo lo suyo, anon bloqueado.
- **Motor:** `motor.ts`, `semana.ts`, `feriados-cr.ts` y `tz.ts`, con sus 52 pruebas en verde dentro del proyecto.
- **Pantallas:** Servicios con la vista previa y Horarios con la semana, los feriados y los días especiales, verificadas a 375 px.

## Ejemplo

**Input:** Momentum, 2026-10-27 a las 11:10 (Costa Rica):
- Pietro atiende de lunes a viernes de 8 a 17 y el sábado de 8 a 12;
- cierra solo en los feriados obligatorios, y el 24 de diciembre está cerrado;
- tiene una cita real el lunes 2 de noviembre de 10:00 a 10:30;
- el servicio es «Llamada de diagnóstico», de 30 min, con 4 h de aviso y 14 días.

**Output de la vista previa:**
- **martes 27:** 3:30, 4:00 y 4:30 p. m. (el aviso se comió la mañana);
- **sábado 31:** de 8:00 a 11:30 a. m.;
- **domingo:** «Cerrado»;
- **lunes 2:** de 8:00 a 4:30 p. m., **sin las 10:00**, y dice «Ya descuenta 1 cita».

Al pasar la duración a 1 h, el lunes queda 8, 9, 11… sin guardar nada. Con días propios de lunes a viernes de 8 a 12, el sábado dice «Cerrado».

---

## Assets

| Archivo | Qué es |
|---|---|
| `assets/motor.ts` | `horariosLibres`, `estaLibre`, `pasoDeAlineacion` y `ultimaFechaReservable` |
| `assets/semana.ts` | Tipos `Franja`, `Semana` y `Horario`; validación (`revisarFranjas`, `semanaValida`); `franjasDelDia` con la precedencia; fechas como texto; `resumenSemana` («Lun a Vie · 8:00 a 17:00») |
| `assets/feriados-cr.ts` | Feriados de Costa Rica (fijos + Pascua), modos y próximos feriados |
| `assets/tz.ts` | `partesEnZona`, `instanteEnZona`, `claveDiaEnZona` y `horaEnZona`, con Intl y sin librería |
| `assets/pruebas-*.test.ts` | 52 pruebas (`node --experimental-strip-types --test assets/pruebas-*.test.ts`) |
| `assets/esquema.sql` | La migración 0159 del CRM. Usa `is_member_of()`, `is_master()` y `set_updated_at()` del proyecto: adaptarlas a los helpers del tuyo |

**Para copiarlo:** los imports son relativos con `.ts` (`'./tz.ts'`) para que las pruebas corran solas. En un proyecto Next, cambialos por el alias (`'@/lib/reservas/…'`). La fuente viva es `crm-v2/src/lib/reservas/`; si este motor cambia allá, actualizá los assets.

## Relacionadas

- `reservar-sin-pisarse-pagina-publica`: la fase 2. La página pública y quién gana la hora: la base vuelve a mirar choques, cupo y límite del día bajo un candado, con las mismas reglas de este motor (si cambia el límite del día acá, cambiarlo también en `reservas_elegir_recurso`).
- `agendamiento-google-calendar`: la fase 3. Lo ocupado de Google entra al motor como un `Ocupado` más; si freeBusy falla, NO se ofrecen horarios de esa persona.
- `resultado-de-cita-y-asistencia`: lo que pasa después de la cita.
- `inicio-dia-timezone-fija`: por qué «hoy» se calcula en la zona del negocio.
- `probar-migracion-contra-base-viva-con-rollback`: cómo se probó el esquema.
- `detectar-escritura-filtrada-rls`: por qué cada escritura cuenta las filas que vuelven.
