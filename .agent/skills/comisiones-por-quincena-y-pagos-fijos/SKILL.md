# Skill: Comisiones por quincena (o cualquier calendario) y pagos fijos que se generan solos

## Cuándo usar esta skill

- El cliente paga comisiones en **fechas fijas con factura** (el 15 y el 28, quincenal, semanal), y el sistema las agrupa por mes.
- Piden **pagos fijos que se repitan solos**: el base de un vendedor, el alquiler, la planilla, el aguinaldo.
- Vas a construir la pantalla donde el equipo **aprueba, factura y cobra** sus comisiones.
- Alguien pregunta «¿en qué factura entra este pago?» y la respuesta depende de la fecha.
- Vas a dejar que el cliente **cambie su calendario de pagos** desde la app.

## Por qué existe esta skill

Capturada el **2026-10-24** de un sistema de operación para una clínica (Next.js + Supabase), nueve días antes de la entrega. La asistente lo explicó en un audio:
- pagan por quincena, con una factura el 15 y otra el 28;
- cada pago se comisiona en la quincena en que **entró**. Una reserva pagada el 23 va en la factura del 28; si el resto entra el 5 de noviembre, va en la del 15.

El founder no quiso preguntarle el corte exacto: «que sea configurable… porque si lo hacemos fijo, el sistema va a llegar a un punto donde no va a cumplir al 100%».

**Lo caro no fue el calendario: fueron los pagos fijos.** Lo construido pasó por dos revisiones independientes antes de publicar, y **cada una encontró bloqueantes que ninguna prueba del camino feliz veía**:
- un índice heredado que anotaba la mitad de los pagos sin avisar;
- un barrido que generaba pagos viejos con la configuración nueva;
- un cambio de calendario que ponía dos bases en la misma factura, o ninguno;
- editar un pago que no corregía la línea ya vencida.

Producción todavía no tenía pagos fijos cargados, así que ninguno llegó a pasar. Esta skill es el diseño final más esos cuatro bugs, para empezar desde el lugar correcto. El SQL de referencia, generalizado, está en `referencia.sql`.

## Las decisiones de diseño, y por qué

### 1. El calendario es un dato, no código

Tabla `fechas_pago (dia_pago, dia_corte, activo)`, sembrada con lo que el cliente usa hoy (15/15 y 28/28).
- «Corte» = entran los pagos que llegaron hasta ese día.
- **Corte mayor que el pago** ⇒ se paga el mes siguiente («corte el 30, se paga el 5»).
- **Un día que el mes no tiene cae en el último** (el 31 en febrero).
- **Rechazar dos fechas con el mismo día de corte:** la segunda nunca se usaría, y nadie se daría cuenta.

### 2. Una sola función decide la factura, y lo que decide se GUARDA

`periodo_para(fecha) → (pago, corte)` es la **única** cuenta. Un trigger `BEFORE INSERT OR UPDATE` la corre y guarda en la comisión `periodo_pago`, `periodo_corte` y `periodo_nominal`. La pantalla **lee lo guardado**, nunca recalcula.

Por qué: si la pantalla calcula con el calendario de hoy, cambiar el calendario **reescribe facturas que ya se pagaron**. Y dos lugares que calculan lo mismo terminan divergiendo (ver `fuente-unica-derivar-de-hijos`).

### 3. Lo que llega tarde va a la próxima factura abierta

Un **grupo** es la persona más la fecha de pago. Está **cerrado** si ya tiene factura o ya se pagó.
- **Sigue cerrado** aunque una de sus comisiones haya pasado a revisión o se haya anulado: hay que mirar `estado_previo`, no solo `estado`.
- Una comisión que todavía se puede cobrar no entra a un grupo cerrado: salta al siguiente. **Nunca cambia el total de una factura ya subida.**
- La fila lo dice: «Llegó después de la factura del 28 de octubre» (es cuando `periodo_nominal ≠ periodo_pago`).
- **Se recalcula en cuatro momentos, no solo al nacer:**
  1. al crearse;
  2. al volver a estar por cobrar con otro monto o fecha;
  3. al **cambiar la persona** (corregir quién vendió);
  4. al **aprobarse tarde**, con su grupo ya facturado.

### 4. Cambiar el calendario reacomoda solo lo abierto

Lo facturado o pagado queda en su fecha. Lo abierto vuelve a pasar por el trigger: se pone `periodo_pago = null` y el trigger lo recalcula.

### 5. La pantalla agrupa por fecha de pago, no por mes

«Factura del 28 de octubre · pagos hasta el 28 de octubre». El vendedor aprueba y sube su factura **por grupo**. El reporte del mes sigue siendo mensual: contesta otra pregunta.

### 6. Quien vende, cobra

Cada rol que puede figurar como vendedor tiene que poder **ver, aprobar y facturar lo suyo**. En el caso real, un rol vendía productos desde hacía una semana y no tenía la sección de Comisiones. Revisalo con la matriz de roles cada vez que se agrega un vendedor posible.

### 7. Un pago fijo es de la empresa o de una persona

| | De la empresa | De una persona que factura |
|---|---|---|
| Ejemplos | alquiler, software, el sueldo de alguien en planilla | el base de un vendedor |
| Dónde vive | egreso en Finanzas | una fila `tipo = 'fijo'` en la tabla de **comisiones**, en el grupo de esa persona |
| Cómo se paga | se anota solo, o espera confirmación | se aprueba, se factura y se paga **junto con sus comisiones** |

- **El sueldo en planilla es un fijo de la empresa con el nombre de la persona.** Si además lo pusieras en comisiones, la planilla se cuenta dos veces.
- Un `CHECK` por tipo en `comisiones`: la comisión trae pago, cierre y rol; el fijo trae su pago fijo, monto y moneda, y nada de lo otro.
- **Frecuencia:**
  - uno o varios días del mes;
  - o **«en cada fecha de pago al equipo»**.
- **Opcionales:**
  - solo ciertos meses (el aguinaldo, en diciembre);
  - una fecha «desde».
- **Modo, por pago** (lo pidió el founder): «se anota solo» o «espera confirmación».
- **Moneda propia.** En moneda local se muestra un estimado en dólares y, al pagarse, se guarda el tipo de cambio de ese día (ver `dinero-multimoneda-app-financiera` y `tipo-de-cambio-real-bccr-hacienda`).

### 8. Se configura donde se mira la plata

En Finanzas, no en Configuración. El founder: «no tiene sentido tener que irse a configuración a hacer algo. Le voy a ir a finanzas a ver si se hizo bien».

## Los cuatro bugs que encontró la revisión

| # | Bug | Por qué la prueba feliz no lo ve | Arreglo |
|---|---|---|---|
| 1 | **Índice único por MES heredado** (`un_fijo_por_mes`). Un fijo «15 y 30» anotaba solo el 15, sin error, y el 30 tampoco se podía anotar a mano | Todas las pruebas usaban un solo día por mes | Borrarlo. La unicidad va por **ocurrencia**: `(pago_fijo_id, ocurrencia) where anulado_at is null` |
| 2 | **El barrido miraba 60 días atrás con la configuración de HOY.** Editar, reactivar, pasar de la empresa a una persona o cambiar el calendario generaba pagos viejos o dobles | Las pruebas creaban el fijo y corrían el barrido el mismo día | Un **avance** por pago fijo (`al_dia_hasta`): **nada se genera hacia atrás**. Un fijo nuevo corre desde hoy, o desde su «desde» si es después |
| 3 | **«En cada fecha de pago» contado por fecha exacta, no por período.** Cambiar de 28 a 30 el día 29 dejaba **dos bases** en la factura del 30; de 30 a 28, **ninguno** | Hace falta cambiar el calendario justo entre la fecha vieja y la nueva | `ya_tiene(fijo, fecha)` mira el **período**, desde la fecha de pago anterior. Al cambiar el calendario se regenera desde la fecha de pago anterior al período abierto, **calculada con el calendario VIEJO antes de guardar el nuevo** |
| 4 | **Editar un fijo regeneraba solo de hoy en adelante.** La línea de una fecha ya pasada y sin pagar quedaba con el monto viejo | Las pruebas editaban antes de que venciera alguna fecha | Anular **todas** las líneas que todavía se pueden cobrar (nunca las facturadas ni las pagadas) y regenerar desde la más vieja |

Y tres más chicos, de la misma revisión:
- **Un egreso automático que alguien anuló a propósito no vuelve.** `ya_tiene` cuenta también el anulado de esa misma fecha.
- **Las líneas anuladas por una regeneración no se muestran:** su reemplazo ya está, y verlas confunde.
- **El barrido corre los fijos PRIMERO,** después del tipo de cambio del día y antes de cualquier paso que pueda cortar la ruta con un 500.

## Proceso

1. **Medir cómo paga hoy el cliente** (audio o llamada): los días de pago y de corte, qué entra en cada fecha y qué pasa con lo que llega tarde. Escribí **tres casos con fechas reales** («la reserva del 23 va en la del 28»): son tus primeras pruebas.
2. **El calendario:** la tabla, `periodo_para`, el trigger que guarda y la semilla con lo de hoy. La RPC que lo guarda valida días 1–31, sin pago ni corte repetidos.
3. **El grupo cerrado y lo tarde:** `grupo_cerrado()` con `estado_previo`, el salto al siguiente y los cuatro momentos de recálculo.
4. **Los pagos fijos:**
   - las columnas;
   - `ocurrencias(desde, hasta)` como **única** cuenta de cuándo toca cada uno;
   - la unicidad por ocurrencia;
   - el avance;
   - `ya_tiene` por período;
   - el trigger que, al editar, anula lo cobrable y baja el avance;
   - la regeneración al cambiar el calendario.
5. **El barrido**, idempotente, cada 5 minutos: `on conflict do nothing` más el avance. Solo con la llave de servicio, y `revoke execute … from public, anon`, porque `anon` lo hereda de `public` (ver `revocar-execute-incluye-public`). Si un fijo falla, el avance se detiene en el día anterior y no salta el pago.
6. **«Hoy» inyectable** para probar «el 29 de octubre» cualquier día. Una función lee un setting **local a la transacción**:
   `coalesce(nullif(current_setting('app.hoy', true), '')::date, hoy_local())`,
   y la prueba hace `set_config('app.hoy', '2026-10-29', true)`. Hoy siempre en la zona del negocio (ver `inicio-dia-timezone-fija`).
7. **Las pruebas**, contra la base con rollback (ver `probar-migracion-contra-base-viva-con-rollback`). Las que tienen que estar sí o sí:
   - con 15/15 y 28/28: el pago del 23 va al 28; el del 5 de noviembre, al 15 de noviembre; el del 29, al 15 del mes siguiente;
   - corte 30 y pago 5: se paga el mes siguiente. El 31 en febrero cae en el último día;
   - grupo con factura: una comisión nueva de esa quincena salta a la siguiente y dice «llegó después»;
   - grupo pagado con una comisión en revisión: sigue cerrado;
   - un fijo «15 y 30» da **dos** líneas en el mes. **Control negativo:** con el índice por mes da una;
   - cambiar de 28 a 30 el 29 deja **una** base en la factura del 30; de 30 a 28, no se pierde;
   - editar el monto con una línea vencida y sin pagar la regenera con el monto nuevo. La facturada no se toca;
   - anular un egreso automático: no vuelve en la vuelta siguiente;
   - un fijo creado con «desde» en el pasado no genera nada hacia atrás.
8. **La pantalla:**
   - agrupa por fecha de pago, con filtros de persona, fecha y estado;
   - el fijo, en su moneda;
   - el aviso de «llegó después»;
   - las anuladas por regeneración, ocultas;
   - el formulario del fijo exige al menos un mes si se marcó «solo algunos».
9. **Migración compatible con lo publicado.** Si reemplazás una columna que lee la pantalla en producción (`dia_mes` → `dias int[]`), dejala nullable y borrala en una migración posterior, **después** del deploy.
10. **Una revisión independiente antes de publicar.** Pasale los escenarios de cambio de calendario por escrito: son los que el autor no se imagina.

## Lo que queda abierto: decidirlo con el cliente, no adivinarlo

- **Anular UNA línea fija suelta.** No hubo botón: se corrige con la objeción (monto 0) o editando el fijo. Si lo piden seguido, se construye.
- **El cambio de reglas de negocio.** Si el contrato decía «las comisiones se pagan una vez al mes», ahora dice «en las fechas que configura el cliente»: avisale al PM para que actualice los documentos.
- **Contarle al cliente qué pasa al cambiar el calendario a mitad de quincena:** lo abierto se reacomoda y lo facturado no se mueve. Va en el mensaje con los pasos, no lo descubre solo.

## Output esperado

- La tabla del calendario, sembrada con lo de hoy, editable desde Finanzas.
- `periodo_para`, `grupo_cerrado`, el trigger de asignación y `reasignar_periodos`.
- `pagos_fijos` con frecuencia, días, meses, modo, persona, moneda y «desde».
- `ocurrencias`, la unicidad por ocurrencia, el avance, `ya_tiene` por período, la regeneración al editar y al cambiar el calendario.
- El barrido idempotente, cerrado a `anon`.
- Las pruebas de arriba, con su control negativo.
- Comisiones agrupadas por factura; Finanzas con los fijos y el calendario.
- Un mensaje para quien lo va a usar, con los pasos para configurar el calendario y cargar los fijos.

## Ejemplo

**Input:**
Audio de la asistente: «Pagamos el 15 y el 28. Si una reserva se paga el 23, va en el reporte que manda el closer el 28. Si el resto entra el 5 de noviembre, va en la factura del 15». Además, el closer tiene un base fijo de USD 300 que se le paga en cada factura.

**Output:**
- Calendario sembrado 15/15 y 28/28.
- El pago del 23 de octubre nace con `periodo_pago = 2026-10-28` y `periodo_corte = 2026-10-28`. El del 5 de noviembre nace con `2026-11-15`.
- El base va como pago fijo «en cada fecha de pago al equipo», de esa persona, USD 300, espera confirmación. El barrido genera una línea `tipo = 'fijo'` el 28 de octubre y otra el 15 de noviembre, cada una en su grupo.
- Si el closer ya subió la factura del 28 y después se aprueba una comisión de un pago del 20 que faltaba, va a la del 15 de noviembre con «Llegó después de la factura del 28 de octubre». La factura subida no cambia.
- Si el 29 el cliente pasa el 28 al 30, la factura del 30 tiene **un** base, no dos.
