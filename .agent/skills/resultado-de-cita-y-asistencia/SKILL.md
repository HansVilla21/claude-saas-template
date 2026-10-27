# Skill: Marcar cómo salió una cita y medir la asistencia

## Cuándo usar esta skill

- Un CRM agenda citas y nadie sabe cuántos prospectos llegan: todas las citas siguen «agendadas» para siempre.
- Hay que construir «se hizo / no asistió / cancelada» y una tasa de asistencia o de no-shows.
- Ya existe un botón tipo «Ya lo hice» que escribe una nota en el contacto pero no toca la cita.
- La base tiene un trigger que mueve el «último contacto» con cada actividad nueva.

**Por qué existe.** En el CRM de Josué (25/10/2026) las 49 citas seguían «agendada». Las pasadas no aparecían en ninguna pantalla, y el «Ya lo hice» de Hoy escribía «Cita realizada» en el lead sin tocar la cita: la ficha decía una cosa y la cita otra.

Al construirlo, la revisión encontró el error caro. Un trigger viejo (`after insert on lead_activities` → `last_contact_at = now()`) convertía CUALQUIER actividad en contacto. Marcar «No asistió» en las 49 citas atrasadas habría dejado 49 leads «contactados hoy», saltando al principio de la lista. Se verificó con rollback en la base viva antes de salir.

---

## Proceso

### 1. Primero buscar dónde se pierde el dato
- **¿Qué pantalla muestra las citas pasadas?** Casi siempre ninguna: la agenda muestra las próximas. Si no hay dónde marcarlas, nadie las marca.
- **¿Hay un «hecho» que escribe en otro lado?** Hay que unificarlo: UNA acción cambia la cita, y la usan todas las pantallas.
- **Buscá triggers que conviertan actividades en contacto.** Cuidado con los de las tablas de notas y de actividades: el resultado de una cita NO es un contacto nuevo («No asistió» no contactó a nadie).
  ```sql
  select tgname, pg_get_triggerdef(oid) from pg_trigger
   where tgrelid = 'public.lead_activities'::regclass and not tgisinternal;
  ```

### 2. El modelo
- **Estados:** `agendada | realizada | no_asistio | cancelada`. «Reprogramada» no es un estado; si hace falta, va como contador aparte.
- **«Sin marcar» se DERIVA, no se guarda:** está agendada y ya terminó (`inicio + duración <= ahora`). Una que está pasando ahora todavía no cuenta.
- **`estado_set_at` / `estado_set_by`:** sin eso no se puede auditar un no-show. Si existe una función que une perfiles duplicados, la FK nueva también tiene que entrar en ella.
- **La actividad de la ficha, ligada a SU cita:** `lead_activities.appointment_id` con un índice único parcial. Corregir el resultado reemplaza esa actividad en vez de sumar otra que contradiga, y va a la hora de la cita, no a la del clic.
- **El trigger de contacto:** que ignore las actividades con `appointment_id`. Una función aparte, porque la misma función puede estar puesta también en `appointments` y ahí `new.appointment_id` no existe.

### 3. Marcar es UNA transacción
Hay que hacerlo con una función SQL, `security invoker` y solo para `service_role`. El servidor la llama DESPUÉS de leer la cita con la sesión: si la policy de UPDATE es la misma que la de SELECT, verla alcanza para poder marcarla.

La función, con la fila de la cita bloqueada (`for update`):
1. **Solo marca lo que ya empezó.** Cancelar una cita futura toca Google Calendar y avisa al prospecto: es otra feature.
2. **No pisa.**
   - Un resultado solo se pone sobre una cita «agendada».
   - Deshacer solo funciona si la cita sigue con el resultado que se deshace (`p_desde`).
   - Si no, devuelve `{ok:false, motivo, estado}` y la pantalla muestra «… · la marcó otra persona».
3. **La actividad va con `insert … on conflict (appointment_id) where appointment_id is not null do update`.** Borrar e insertar en dos llamadas deja la ficha contradiciendo la cita con dos clics rápidos. PostgREST no apunta `onConflict` a un índice parcial: por eso es una función.
4. **«Se hizo» lleva el último contacto a la hora de la cita,** solo si es más nueva. Guarda en la cita lo que había (`contacto_movido`, `contacto_previo_at` y `contacto_previo_label`). Deshacer lo devuelve solo si el lead todavía tiene el valor que puso la cita.
5. **Si se marcó desde la pantalla de «hoy»,** cuenta en la barra del día.

### 4. Pantallas
- **Una lista «Por marcar» global**, en la agenda, con la más reciente primero:
  - tres botones y «Deshacer» en la fila;
  - estado local para que lo marcado siga visible durante la visita;
  - el refresco suma las que van terminando y saca las que marcó otro.
- **En la pantalla del día,** la cita se marca recién cuando empezó; antes, los botones esperan apagados con un tooltip.
- **El no-show PROPONE el seguimiento** («¿Te recuerdo reagendarlo mañana?») y no lo crea solo: una tarea que aparece sin que nadie la pida es ruido. La fila se queda un momento para la pregunta y tiene su «Deshacer».

### 5. La métrica
- **Asistencia = realizadas ÷ (realizadas + no asistió).** Canceladas y sin marcar quedan FUERA del denominador. Si las sin marcar se cuentan como no-shows, la tasa se hunde por falta de marcado y no por los prospectos.
- **Sin ninguna marcada es «sin datos», no 0 %.** Mostrá la muestra (`n`) y las sin marcar al lado.
- **Un no-show no suma a la meta de citas del mes.** Es una decisión del cliente: preguntala.
- **El mes en la zona del negocio, no en UTC.** Si no, una cita del 31 a las 7 p. m. de Costa Rica cuenta en el mes siguiente.

### 6. Probar
- **Con rollback, en la base viva:**
  - una actividad de resultado NO mueve el contacto y una llamada sí;
  - «no asistió» no lo toca;
  - otra persona ya la marcó → avisa;
  - deshacer devuelve el contacto y no pisa uno registrado después;
  - una cita futura no se marca;
  - anon y authenticated no ejecutan la función.
- **Pruebas puras:** sin marcar, la tasa (incluido «sin datos»), la meta y el mes de la zona.
- **Bancos locales con los componentes reales** y acciones falsas, incluida una que devuelve «ya la marcó otra persona».

## Output esperado
- La migración con los estados, quién y cuándo, la actividad ligada, el trigger que ya no confunde resultado con contacto y la función que marca en una transacción. Todo con su DOWN y probado con rollback.
- La lista «Por marcar», las acciones en la pantalla del día, la tasa en el dashboard y un aviso de cuántas faltan marcar.
- Las decisiones del cliente por escrito:
  - ¿el no-show propone o crea el seguimiento?
  - ¿el resultado cambia la etapa?
  - ¿el no-show suma a la meta?
  - ¿quién puede corregir lo que marcó otro?

## Ejemplo
**Input:** «Queremos marcar citas como realizada o cancelada; no sabemos cuántos llegan.»

**Output** (CRM de Josué, 25/10):
1. **Diagnóstico:**
   - 49 de 49 sin marcar;
   - las pasadas no se veían en ninguna pantalla;
   - el «Ya lo hice» de Hoy escribía en el lead y no en la cita.
2. **0051:** estados, quién y cuándo, y la actividad ligada.
3. **La revisión encuentra el trigger que movía el contacto con cualquier actividad.** 0052 lo arregla y mete el marcado en una transacción que no pisa y deshace con el contacto previo.
4. **Pantallas:** «Por marcar» en la Agenda, Hoy con «Se hizo» y «No asistió», y en el dashboard «Asistencia del mes: sin datos todavía · 49 sin marcar».
