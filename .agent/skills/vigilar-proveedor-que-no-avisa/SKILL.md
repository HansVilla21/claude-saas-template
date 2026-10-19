---
name: vigilar-proveedor-que-no-avisa
description: Usar cuando una pieza de la que depende el sistema (el número de WhatsApp en un BSP, una integración OAuth, una cuenta de un proveedor) puede caerse y el proveedor NO manda ningún evento, así que nadie se entera hasta que un cliente se queja. Se arma una revisión periódica con una máquina de estados que avisa una vez por caída y otra por vuelta, sin falsas alarmas. Se dispara con "se desconectó y nadie se dio cuenta", "pasaron días sin mensajes", "el proveedor no avisa", "quiero una alerta si X se cae".
---

# Skill: Vigilar un proveedor que no avisa

## Cuándo usar esta skill

- El sistema depende de algo externo que **se puede caer sin que nadie lo toque**: el número de WhatsApp en un BSP (YCloud, 360dialog), un token OAuth que el cliente revoca, una cuenta que el proveedor suspende, un dominio que vence.
- El proveedor **no manda un evento** cuando eso pasa, o lo manda tarde, o no siempre. Esperar un webhook que avise no sirve.
- Ya pasó al menos una vez y se notó **porque un humano vio que faltaba algo**, horas o días después.
- El proveedor **sí tiene una forma de preguntar** el estado (un `GET` de la lista de números, de la cuenta, del token).
- Cross-project: cualquier SaaS multi-tenant que conecta cuentas de sus clientes a terceros.

## Por qué existe esta skill

Capturada el 2026-10-19 de MOM-126 en el CRM de Momentum. El número de WhatsApp de un negocio vive en YCloud, y dos veces se cayó sin que nadie se enterara:

| Caso | Qué pasó | Cuánto costó |
|---|---|---|
| Jacó (01-09) | El número dejó de estar conectado | ~20 días sin WhatsApp; 7 clientes nuevos escribieron y nadie les contestó |
| Roberto (29-09) | La cuenta desapareció de YCloud de madrugada | ~15 horas de mensajes que no llegaron ni al CRM ni al bot; se notó porque el founder no veía mensajes |

En el caso de Roberto, **YCloud no mandó ningún evento**: el último `whatsapp.business_account.updated` era de dos semanas antes. La única señal temprana estaba en otro lado: 7 seguimientos automáticos fallaron a las 06:30 con `Phone number +50671328474 has not been registered.`, y nadie miraba esos errores.

Al prender la revisión apareció un tercer caso que nadie conocía: **Level CR llevaba 18 días caído** (último mensaje el 01-10).

> La idea central: **si el proveedor no avisa, hay que ir a preguntar, y la parte difícil no es preguntar sino no avisar de más.** Un aviso falso al cliente ("tu WhatsApp se cayó") cuando no se cayó quema la confianza más rápido que la caída misma. Todo el diseño es una máquina de estados que sabe cuándo callarse.

## Proceso

### 1. Encontrar la pregunta y las dos señales

- **La pregunta periódica:** el endpoint que dice el estado real. En YCloud: `GET /v2/whatsapp/phoneNumbers` (paginado, `status === 'CONNECTED'`). Un número que **no aparece** o que tiene otro estado es una falla.
- **La señal temprana:** el error que da el sistema cuando usa la pieza caída. Buscá en tus logs el texto literal del último incidente (`has not been registered`, `WHATSAPP_PHONE_NUMBER_UNAVAILABLE`). Esa señal llega antes que la revisión periódica.
- Comparar teléfonos, ids o dominios **normalizados** (solo dígitos): el CRM guardaba `50689839490` y `+50689839490` según quién lo cargó, y el proveedor los devuelve con `+`.

### 2. Una fila de estado por entidad

```sql
create table public.whatsapp_salud (
  agency_id         uuid primary key references agencies(id) on delete cascade,
  telefono          text not null,
  estado            text not null default 'desconocido'
                    check (estado in ('desconocido','conectado','sospechoso','desconectado')),
  fallas_seguidas   integer not null default 0,
  detalle           text,          -- el motivo legible de la última falla
  desde             timestamptz not null default now(),
  ultimo_chequeo_at timestamptz not null default now(),
  avisado_at        timestamptz    -- null = no hay una caída avisada sin su «volvió»
);
```

RLS: la leen los miembros del tenant (la franja la tiene que ver todo el equipo); la escribe solo service_role (sin policy de escritura).

### 3. La máquina de estados, pura y probada

Todo lo que decide va en una función pura `siguienteSalud(previa, lectura, { enGracia })`, sin base, sin red y sin reloj. Las reglas que sobrevivieron:

| Regla | Por qué |
|---|---|
| **N chequeos seguidos caído** para declararlo desconectado (N = 2 con cron cada 15 min: se avisa entre 15 y 30 min después) | Un parpadeo de la API no despierta a nadie |
| **Un aviso por caída y otro por vuelta** | El ticket lo pedía y es lo que no se vuelve ruido |
| **El «volvió» solo sale si antes salió el «se cayó»** | Avisar que algo volvió sin haber dicho que se fue es ruido |
| **El primer chequeo de una entidad no avisa**, aunque esté caída. Se anota `desconectado` (la franja se ve) y sin aviso | Al prender esto, una entidad caída hace días es una decisión de una persona, no un mensaje automático al cliente. Pasó: Level CR |
| **Gracia de 30 min tras conectar**: en la gracia, una lectura caída no cambia nada; una conectada sí cuenta | Recién conectado, el proveedor puede tenerlo `PENDING` mientras lo registra. Sin esto, un cliente nuevo ve la franja roja en su primer minuto |
| **Si el proveedor no contesta, no se cambia NADA** | No saber no es lo mismo que caído |
| **Una lista vacía no se cree** | Con 8 números conectados, una respuesta con 0 es una credencial equivocada o un error del proveedor, no 8 caídas a la vez |

La gracia se calcula con lo último entre `created_at` de la fila y la marca de conexión que escribe el flujo de conectar (`provider_config.conectado_at`). **No con `updated_at`**: cualquier edición de la fila lo mueve, y la gracia taparía una caída real.

### 4. El aviso, reclamado de forma atómica

El cron y la revisión inmediata (paso 7) pueden correr a la vez y los dos ver "hay que avisar". El aviso se **reclama** con un `UPDATE` condicional, y solo avisa quien recibió la fila:

```ts
// caída: solo si nadie la avisó antes
await db.from('whatsapp_salud').update({ avisado_at: ahora })
  .eq('agency_id', id).is('avisado_at', null).select('agency_id');
// vuelta: solo si había una caída avisada
await db.from('whatsapp_salud').update({ avisado_at: null })
  .eq('agency_id', id).not('avisado_at', 'is', null).select('agency_id');
// avisar SOLO si la respuesta trae exactamente 1 fila
```

El `upsert` del estado **no lleva `avisado_at`**: si lo llevara, pisaría la reclamada.

### 5. El cron, con el secreto generado DENTRO de la base

pg_cron cada 15 minutos → función `SECURITY DEFINER` que lee URL y secreto del Vault → `net.http_post` a la ruta del backend con el header `x-cron-secret`.

El secreto **se genera dentro de la migración** y nunca sale de la base:

```sql
perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'),
  'canales_cron_secret', 'Secreto entre pg_cron y /api/cron/canales');
```

La ruta lo lee con una RPC `canales_secreto_cron()` con `EXECUTE` solo para service_role, y lo compara en tiempo constante. Así no hay variable de entorno que cargar en Vercel, nadie lo copia a mano y no aparece en ningún archivo. Si el Vault no responde, la ruta contesta 503 y no trabaja.

La ruta contesta **200 aunque el proveedor no haya respondido**: el cron no reintenta, y en 15 minutos vuelve a probar. El motivo queda en el cuerpo y en el log.

### 6. Avisar por un camino que NO sea el caído

- **En la app:** aviso en la campana al dueño y a los admins, con los textos fijos dentro de una función de la base (así no recibe texto libre y no sirve para mandar cualquier aviso a cualquier tenant). La vuelta con **otro tipo de aviso**, verde: con el mismo rojo de la caída parece que sigue caída.
- **Por WhatsApp:** desde el número **de la plataforma**, nunca desde el del cliente, que es justamente el que no funciona. Fuera de la ventana de 24 h exige **plantilla aprobada** (UTILITY; no puede empezar ni terminar en variable). A quién: el dueño del tenant + los super_admin de la plataforma, **sin repetir teléfonos** (el founder es master y también dueño de su propia cuenta).
- **Cada intento queda registrado** (`wa_notification_log`), también el que no salió (`no_phone`, `failed` con el código del proveedor). Un aviso que falló sin dejar rastro es la peor versión de este problema.
- **Una franja arriba de todas las pantallas** mientras esté caído, para **todo** el equipo, no solo el dueño: quien atiende la bandeja es el primero que nota que no entra nada. El que puede arreglarlo ve el enlace; los demás, "avisale a quien administra la cuenta".
- **Una pantalla con los pasos para arreglarlo** a la que llevan la campana y la franja. Los pasos salen del último incidente real (en el CRM: el error de Meta en «importar historial» que se destraba repitiendo todo, y que después de reconectar la ventana de 24 h arranca de cero).

### 7. La señal temprana dispara una revisión en el momento

Donde el sistema registra un envío fallido: si el error es el de la pieza caída (paso 1), revisar **solo ese tenant** sin esperar al cron, en `after()` para no demorar la respuesta. Con la pieza caída fallan **todos** los envíos, así que como mucho una revisión cada 2 minutos por tenant (mirando `ultimo_chequeo_at`).

### 8. Al reconectar, revisar en el momento

En la acción de conectar, después de guardar: correr la revisión de ese tenant y revalidar el layout. La franja se va y sale el «volvió» sin esperar al cron. Si el proveedor todavía lo tiene `PENDING`, la gracia lo cubre.

### 9. Lo que se saltea, y cómo se sale de ahí

- **El demo** (número inventado): `provider_config.is_demo`.
- **Una pausa a mano** para un tenant que el founder quiere manejar en persona: `provider_config.revisar_salud = false`. Se elige un lugar que **se borre solo al reconectar** (en el CRM, conectar reemplaza el `provider_config` entero). Una pausa que hay que acordarse de sacar es un tenant sin vigilar para siempre.

## Gotchas

- **Una prueba de caída tocando la base a mano es una bomba.** Si ponés una fila en `desconectado` con `avisado_at` y la dejás, el primer cron real la ve conectada y manda un «volvió» verdadero a clientes y al founder. Se prueba con la función de revisión y dependencias falsas (lista del proveedor sin ese número, envío que solo anota), y se borran los avisos al terminar.
- **"Desde" miente en el primer chequeo.** Si la entidad ya estaba caída cuando se revisó por primera vez, la caída empezó antes. En la pantalla: "Lo detectamos el 19 oct, 10:22", no "Desde el 19 oct".
- **El valor nuevo de un enum va solo en su propia migración.** Postgres no deja usar un valor de enum en la misma transacción que lo agrega. Por eso el tipo de aviso «restablecida» es una migración de una línea, antes de la que lo usa.
- **El preview puede no tener las variables de producción.** El botón de reconectar dependía de `NEXT_PUBLIC_YCLOUD_SOLUTION_ID` y el preview no lo tenía: el botón no se vio ahí. Se confirmó con los datos de producción (intentos de conexión por esa ruta) y no se dio por roto.
- **Importar un módulo que importa al tuyo arma un ciclo.** El envío llama a la revisión y la revisión necesitaba la URL de envío: la constante se repitió con un comentario en vez de importarla.
- **Avisos a clientes en Novedades:** si el cambio solo lo usa el dueño, la entrada nueva no tiene qué ofrecerle a un agente y la prueba la rechaza. La franja para todo el equipo resolvió las dos cosas.
- **Las plantillas tardan en aprobarse.** Se crean el primer día; mientras están en revisión, el WhatsApp falla, queda registrado, y la campana y la franja funcionan igual.

## Cómo verificar

1. **Tests de la máquina de estados**, con control negativo: el primer chequeo caído no avisa, y *el mismo par de lecturas arrancando desde "conectado" sí avisa*; si ese control diera null, la prueba de arriba no estaría probando nada. Más: parpadeo sin aviso, caída avisada una vez, vuelta solo tras caída, gracia en los dos sentidos.
2. **La migración contra la base viva con el bloque que siempre aborta** (`probar-migracion-contra-base-viva-con-rollback`): secreto de 64 hex, quién puede leerlo (solo service_role), el cron agendado, el aviso llega a los destinatarios correctos y no a los demás, un miembro ve la fila y no puede escribirla, un tercero no la ve. Después, confirmar que no quedó nada.
3. **Primera corrida real con el envío apagado**: todas las entidades conectadas, las salteadas fuera, **0 avisos**.
4. **Caída falsa con dependencias inyectadas** sobre una cuenta de prueba: sospechoso → desconectado + 1 aviso → sin repetir; vuelta + 1 aviso → sin repetir. Mirar la campana, los registros y la franja en pantalla (375 px sin desbordes). Borrar lo de prueba.
5. **En producción, disparar el cron a mano** (`select canales_disparar()`) y leer la respuesta en `net._http_response`: 200 y el resumen. Y la ruta sin secreto, o con uno falso: 401.

## Output esperado

- Tabla de estado por entidad con RLS de solo lectura para el tenant.
- Máquina de estados pura con sus tests.
- Cron con secreto generado en el Vault y ruta que lo valida.
- Avisos por un camino que no sea el caído, reclamados de forma atómica, todos registrados.
- Franja para todo el equipo y una pantalla con los pasos para arreglarlo.
- Revisión inmediata ante el error de la pieza caída y al reconectar.

Referencia en el CRM (`crm-v2/`, PR #425): `src/lib/whatsapp/salud-canal.ts` (las reglas), `src/lib/whatsapp/revisar-canales.ts` (la revisión), `src/lib/whatsapp/avisar-canal.ts` (los avisos), `src/app/api/cron/canales/route.ts`, `src/components/agency/canal-desconectado-banner.tsx`, `supabase/migrations/0146_*.sql` y `0147_salud_whatsapp.sql`.

Relacionadas: `whatsapp-proactivo-a-staff` (plantillas y avisos al equipo por WhatsApp), `config-que-deja-el-sistema-mudo` y `distinguir-detenido-a-proposito-de-roto` (el silencio que nadie reporta), `probar-camino-produccion-sin-efectos-externos` (probar el camino real sin mandar nada).

## Ejemplo

**Input:**
"El número de WhatsApp de Roberto se desconectó de madrugada y nos enteramos 15 horas después porque no veía mensajes. YCloud no mandó nada. Ya nos pasó con Jacó. Quiero una alerta."

**Output:**
- **Pregunta:** `GET /v2/whatsapp/phoneNumbers` cada 15 min; falla = no aparece o no está `CONNECTED`. **Señal temprana:** el error `has not been registered` de un envío revisa ese negocio en el momento.
- **Reglas:** 2 fallas seguidas; un aviso por caída y otro por vuelta; el primer chequeo no avisa; 30 min de gracia tras conectar; sin respuesta del proveedor, nada cambia.
- **Avisos:** campana al dueño y admins; WhatsApp por plantilla desde el número de Momentum al dueño y a los super_admin; franja roja para todo el equipo; Canales con los pasos y el botón.
- **Primera corrida en producción:** 8 conectados, 0 avisos. Y un hallazgo: Level CR llevaba 18 días caído; el founder decidió hablar él con ellos (pausa a mano).
- **Caída falsa en la cuenta de prueba:** sospechoso → desconectado + 1 aviso (campana a Hans, WhatsApp a Hans y Pietro sin duplicar) → sin repetir; vuelta → 1 aviso verde → sin repetir.
