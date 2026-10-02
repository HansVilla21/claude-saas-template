# Skill: El disco de Supabase se llena, la base pasa a solo lectura y el sistema entero se calla

## Cuándo usar esta skill

- Un bot, un webhook o una app con Supabase **dejó de responder** y el panel de Supabase dice que el proyecto está bien.
- Las consultas a la API REST dan **522** o se cuelgan ~20 segundos, pero `/auth/v1/health` y las Edge Functions contestan rápido.
- Arriba del panel aparece **"Project is in read-only mode — Database is no longer accepting write requests"**.
- Llegó el correo de Supabase **"Your project is depleting its Disk IO Budget"**.
- Vas a poner en producción, o ya tenés en producción, un proyecto que nació en **plan gratis**.
- Conectaste un número de WhatsApp en coexistencia y entró una ráfaga de eventos `smb.history`.

## Por qué existe esta skill

Capturada el **2026-10-02**. Un CRM multi-negocio con bot de WhatsApp, en producción con clientes reales, estuvo **11,5 horas con el bot mudo** —último turno a las 20:08, el siguiente a las 07:39— porque la base pasó a solo lectura, y nadie se enteró hasta que el founder vio que un mensaje de medianoche no tenía respuesta. Nunca había pasado.

La cadena, medida:

1. El proyecto había nacido en **plan gratis**, con un disco de **2 GB**.
2. Ese disco tenía **274 MB de datos**, **1 GB de WAL** y el resto de sistema: sin margen.
3. A las 20:18 entraron **1.236 eventos de historial de WhatsApp en 55 segundos** (la sincronización que manda Meta al conectar un número en coexistencia).
4. El disco llegó al **99,8 %**. Supabase pasa la base a **solo lectura al 95 %**, y además se agotó el presupuesto de Disk IO.
5. El webhook siguió recibiendo y fallando: **24.099 intentos fallidos** en el log. El bot no podía leer ni el negocio ni la conversación, así que no contestó a nadie.

**Lo que hace caro a este modo de fallo:** no hay error visible en ningún lado que mires primero. El panel dice `ACTIVE_HEALTHY`, el sitio carga, el login funciona. Y cuando te enterás, los mensajes de esas horas ya no existen en tu base.

## La trampa del diagnóstico: `ACTIVE_HEALTHY` no es salud

`GET /v1/projects/<ref>` devuelve el **estado del ciclo de vida** del proyecto (activo, pausado, restaurando). En este incidente decía `ACTIVE_HEALTHY` con la base completamente muerta.

La salud real está en otro endpoint:

```bash
curl -s -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v1/projects/<ref>/health?services=db,rest,auth"
```

```
db    UNHEALTHY  Failed to connect to database
rest  UNHEALTHY  Failed to retrieve project's rest service health
auth  UNHEALTHY
```

**Regla:** nunca concluyas "Supabase está bien" mirando `status`. Mirá `/health`.

Y el patrón que lo delata desde afuera: si `/auth/v1/health` y `/functions/v1/<algo>` contestan en milisegundos pero cualquier consulta con la clave de servicio da 522 a los ~20 segundos, **lo que está muerto es Postgres**, no el host.

## El correo que te manda a la palanca equivocada

Esa noche llegaron **dos avisos a la vez**, y el más visible no era el que bloqueaba:

- El correo **"Your project is depleting its Disk IO Budget"**. Real, y plausible: explica un 522 perfecto. Con él en la mano el diagnóstico fue "falta IO → subí el compute", y el founder lo subió.
- El disco al **99,8 %**, que no manda correo propio y es lo que de verdad tenía la base en solo lectura.

El compute ayudó por accidente (su reinicio recicló WAL, ver la tabla de la salida), pero la base no quedó a salvo hasta agrandar el disco. Y el panel ya mostraba desde antes un aviso de **cuota del plan gratis excedida, con fecha de corte**: la señal de que el proyecto ya no cabía en ese plan.

**Orden de diagnóstico, sin saltear:** `/health` → `/config/disk/util` → recién ahí el IO. El disco se mide en una llamada y, si está arriba del 95 %, ninguna cantidad de IO arregla nada.

## Disco no es base de datos

```sql
select pg_size_pretty(pg_database_size(current_database())) as base,
       (select pg_size_pretty(sum(size)) from pg_ls_waldir())  as wal;
```

El disco = **base + WAL + archivos de sistema**. En este caso la base era el 13 % del disco: el problema no era una tabla que creció, era un disco que nunca tuvo lugar. Si medís solo el tamaño de las tablas vas a concluir "estamos lejos del límite" con el disco al 99 %.

Para descartar el sospechoso clásico de WAL inflado, mirá los slots de replicación:

```sql
select slot_name, active,
       pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) as wal_retenido
from pg_replication_slots;
```

Un slot inactivo reteniendo gigas es otra causa (y otra solución: borrarlo). Acá el único slot retenía 10 kB, así que el WAL era la configuración normal, no un slot trabado.

El uso real del disco, sin depender de la base:

```bash
curl -s -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v1/projects/<ref>/config/disk/util"
```

⚠️ Esa medición **no se refresca seguido**: después de cambiar el disco siguió mostrando el tamaño viejo varios minutos. Para saber si ya salió del solo lectura, preguntale a la base:

```sql
select current_setting('default_transaction_read_only') as solo_lectura,
       (select source from pg_settings where name = 'default_transaction_read_only') as de_donde;
```

## Plan, compute y disco son tres palancas distintas

Esto confunde a todo el mundo, incluido el founder en el momento:

| Palanca | Qué te da | Qué NO hace |
|---|---|---|
| **Plan** (Free → Pro) | Cuota de la organización, autoescalado de disco, límite de gasto | No agranda el disco ni la instancia |
| **Compute** (Micro → Small → …) | RAM, CPU y **presupuesto de Disk IO** | No toca el disco |
| **Disco** (`Disk size`) | Espacio | No toca el IO |

Después de pasar a Pro, el panel decía **"Your plan includes up to 8 GB"** con el disco todavía en **2 GB**. El plan te paga hasta 8 GB pero no los asigna: hay que poner el número a mano. Y el autoescalado del plan nuevo tampoco se disparó solo con el disco ya al 99,8 %.

Los precios de compute (2026-10): Micro ~US$10/mes (87 MB/s de IO), Small ~US$15 (174 MB/s), Medium ~US$60 (347 MB/s). Se cobran **por hora, prorrateados, por proyecto**.

## Cómo salir, en orden

1. **Confirmá la causa** con `/health` y `/config/disk/util`. Si el disco está arriba del 95 %, es esto.
2. **Disco al tamaño incluido en el plan.** En Pro son 8 GB y cuestan **US$0 extra** — el diálogo de confirmación lo muestra (`+$0.00 per month`). Ruta: `/dashboard/project/<ref>/settings/compute-and-disk` → *Disk size*.
3. **Compute un escalón arriba** si además llegó el correo de Disk IO. Aplicarlo **reinicia la instancia**, unos minutos — si ya está caída, no perdés nada.
4. **No hace falta tocar el solo lectura a mano.** Supabase lo levanta solo cuando el disco baja del umbral. La documentación ofrece `set default_transaction_read_only = 'off'`, pero eso es para después de liberar espacio: con el disco lleno solo te deja escribir hasta volver a llenarlo.
5. **Verificá contra la fuente de verdad**, no contra el panel: `/health` en verde, una consulta REST real con 200, y filas nuevas entrando en las tablas que escribe el tráfico real (`messages`, `webhook_events_raw`, los turnos del bot).

**Lo que pasó de verdad en la salida (hora de Costa Rica):**

| Hora | Qué |
|---|---|
| 07:32 | Plan Free → Pro. El sitio sigue caído: el plan no tocó ni disco ni compute. |
| ~07:38 | Compute Micro → Small. La instancia se reinicia. |
| 07:39 | Primer turno del bot registrado desde las 20:08 del día anterior. |
| 07:46 | El panel todavía dice *read-only* y *unhealthy*. |
| 07:47 | Disco 2 → 8 GB. |
| 07:49 | `/config/disk/util`: el filesystem sigue en 2,08 GB, pero al **74,8 %** — el reinicio había reciclado ~520 MB de WAL. |
| 07:54 | La base confirma `default_transaction_read_only = off`, `/health` todo en verde, REST 200 en 565 ms, tráfico real escribiendo. |

Dos aprendizajes de esa tabla:
- **El reinicio de la instancia recicla WAL.** Bajó el disco de 99,8 % a 74,8 % sin borrar un dato. Si te toca esto con el disco bloqueado por la espera de 4 horas, un reinicio puede sacarte del umbral mientras tanto — pero es un respiro, no un arreglo: el WAL vuelve a crecer. Medido: a las 08:30, menos de una hora después, el WAL ya estaba otra vez en 1 GB (65 archivos). Con 2 GB de disco eso devuelve el problema; con 8 GB queda en 18 %.
- **El panel atrasa.** El aviso de *read-only* siguió arriba varios minutos después de que el bot ya estaba escribiendo. Por eso el paso 5 se verifica en la base y no en el panel.

**Gotchas del disco:**
- Después de modificarlo, **no podés volver a tocarlo por 4 horas**.
- **No se puede achicar.** No pongas más de lo que vas a usar.
- Con el **límite de gasto activo**, el autoescalado no pasa del tamaño incluido: al llenarse vuelve a solo lectura en vez de cobrarte. Sin el límite, crece y se factura. Es la decisión que separa una caída de una factura sorpresa: tomala a conciencia.

## Qué se pierde y qué se recupera

Esto es lo que más duele y lo que hay que decirle al dueño del negocio el mismo día.

- **Lo que entró mientras la base estaba en solo lectura no se guardó.** Entre las 20:20 y las 06:19 quedó registrado un solo mensaje entrante.
- **El proveedor del webhook reintenta, pero con ventana.** Apenas volvió la base, YCloud entregó tarde lo creado en los **últimos ~80 minutos** (15 mensajes de leads y 23 ecos del celular). Lo anterior a eso, no.
- **El proveedor no te deja listar lo entrante.** `GET /v2/whatsapp/inboundMessages` → 404; solo se listan los salientes.
- **Los logs de la Edge Function guardaron solo el error**, sin teléfono ni id del mensaje. No sirven para reconstruir quién escribió.
- **La única fuente completa es la app de WhatsApp del celular** del negocio (en coexistencia el historial queda ahí). Alguien tiene que revisarla y contestar a mano.

**Corolario de diseño:** si tu webhook loguea solo `insert failed: <error>`, una caída de la base borra la evidencia. Loguear el id del evento y el remitente en la línea del error —sin el cuerpo del mensaje— es lo que permitiría armar la lista de a quién contestar.

## Lo que tenía que avisar y no avisó

**11,5 horas sin una sola alerta.** El sistema estaba lleno de señales —24.099 fallas en el webhook, cero turnos del bot con tráfico entrando, el disco al 99 %— y ninguna le llegaba a una persona.

Las dos alertas que lo hubieran cortado en minutos:

1. **El bot dejó de trabajar con tráfico entrando:** si entran mensajes y no hay turnos del bot en N minutos, avisar.
2. **El webhook falla en serie:** si el insert crudo falla más de N veces seguidas, avisar.

Y la preventiva: **el disco arriba del 80 %**.

## El disparador: la sincronización de historial

Conectar un número de WhatsApp Business en **coexistencia** hace que Meta mande el historial de chats como eventos `smb.history`. En este caso entraron 1.236 en 55 segundos. En total ya había **~35.000** acumulados en la tabla de eventos crudos, y esa tabla sola era el 35 % de la base.

Antes de conectar un número nuevo:
- Asegurate de que el disco tenga margen.
- Decidí si `smb.history` hace falta guardarlo crudo, y con qué retención.
- Ojo: en este sistema esos eventos entraban con el negocio sin resolver (`agency_id` nulo), así que no se podía saber de qué número venían.

## Checklist para un proyecto que va a producción

- [ ] El proyecto **no está en plan gratis**.
- [ ] El disco está en el tamaño incluido del plan, no en el que heredó del gratis.
- [ ] El compute alcanza para el tráfico, y llegaste ahí midiendo, no adivinando.
- [ ] El **límite de gasto** está en el estado que decidiste a conciencia.
- [ ] Hay una alerta cuando el bot deja de trabajar con tráfico entrando.
- [ ] Las tablas de eventos crudos tienen **retención**.
- [ ] El webhook loguea id y remitente cuando falla un insert.

## Ejemplo

**Síntoma:** *"A medianoche entró un mensaje y el bot no contestó."* El panel dice que el proyecto está activo.

**Diagnóstico en 3 llamadas:**
1. Consulta REST con la clave → 522 a los 20 s. `/auth/v1/health` → 401 en 117 ms. → El host vive, Postgres no.
2. `/health?services=db,rest,auth` → db `UNHEALTHY`.
3. `/config/disk/util` → 2,08 GB, 4 MB libres, 99,8 %.

**Salida:** compute Micro → Small (el reinicio recicla WAL y baja el disco al 74,8 %), disco 2 → 8 GB (+US$0), el solo lectura se levanta solo, verificado en la base con tráfico real escribiendo. Después: revisar los celulares para contestar lo que se perdió, y poner la alerta que faltó.

---

Relacionada con: `supabase-free-se-pausa-y-tumba-el-sitio` (el otro modo de caída del plan gratis, por inactividad — y su paso de diagnóstico tenía este punto ciego), `webhook-fanout-sin-reconciliacion` (por qué un evento perdido no lo rescata nadie), `distinguir-detenido-a-proposito-de-roto` (sin la traza no se distingue "no contestó a propósito" de "no pudo"), `verificar-funcionamiento-end-to-end` (el panel en verde no es la fuente de verdad).
