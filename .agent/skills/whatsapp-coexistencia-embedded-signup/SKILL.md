# Skill: Conectar el WhatsApp que el negocio ya usa en el celular (coexistencia) y traer sus chats viejos

> Nació el 2026-09-10 en el CRM de Momentum. El founder frenó la primera prueba de
> conexión directa con Meta con una condición de negocio: *"mis clientes siempre
> deben también poder acceder al WhatsApp desde el celular o desde WhatsApp web"*.
> Eso es **coexistencia**: el número sigue en la app de WhatsApp Business del
> celular y además queda conectado a la API (es lo mismo que venía dando YCloud).
> Después pidió *"trae los chats viejos también"*. Se construyó el flujo completo
> —botón, servidor, webhook e importación a la base— y la revisión adversarial
> encontró **seis problemas importantes antes de producción**, todos de la misma
> familia: un mensaje viejo que entra por el camino de un mensaje nuevo dispara
> todo lo que se pensó para uno nuevo.
>
> Archivos de referencia: `payloads-y-sql.md` (esta carpeta). Skills hermanas:
> `meta-tech-provider-de-cero-a-app-review`, `fb-login-sdk-fedcm-y-callback`,
> `webhook-meta-multicanal`, `probar-migracion-contra-base-viva-con-rollback`.

## Cuándo usar esta skill

- El producto conecta WhatsApp por **Embedded Signup** y los clientes quieren
  seguir usando el celular / WhatsApp Web.
- Hay que importar el historial de chats (hasta 6 meses) y la agenda de contactos.
- Estás migrando clientes de un BSP que ya les daba coexistencia.

## Lo que Meta dice y no se puede negociar

| Regla | Consecuencia en el código |
|---|---|
| El número **ya está registrado** (lo usa la app). La doc pide **saltarse `/register`** | Registrar con tu PIN un número que el negocio usa en el celular podría dejarlo sin su WhatsApp. Se registra SOLO si Meta dice explícitamente `is_on_biz_app: false` |
| Al terminar, el navegador solo garantiza el **`waba_id`** (evento `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`), el `phone_number_id` puede no venir | El servidor lo busca en la WABA, **solo entre los números en la app**, y si hay más de uno no adivina |
| Contactos e historial se piden con `POST /{phone_number_id}/smb_app_data`, **una vez por tipo y dentro de las 24 h** de conectar (errores 2593107 / 2593108) | Cada pedido queda anotado en el canal; hay botón de reintento que respeta el plazo |
| Los chats llegan por webhook: `history` (chats), `smb_app_state_sync` (agenda), `smb_message_echoes` (lo que el negocio escribe desde el celular, en vivo) | Esos tres campos se prenden **a mano** en el panel de Meta (`smb_message_echoes` venía apagado) |
| A quien escribió **antes** de conectar solo se le escribe por API **con plantilla**; lo que el negocio manda desde la app no abre ni extiende la ventana de 24 h | Los mensajes viejos NO llenan las columnas de la ventana |
| El negocio puede **rechazar** compartir el historial (error 2593109 en el webhook) | Se anota y la pantalla lo dice; no es un fallo nuestro |
| Límites: 20 mensajes/segundo por número; **grupos no se sincronizan**; mensajes temporales y de ver una vez se apagan; listas de difusión quedan de solo lectura; WhatsApp para Windows y WearOS no soportados; los dispositivos vinculados se desvinculan al conectar (y se vuelven a vincular); el primer mensaje puede dar error 131060 | Se le avisa al negocio ANTES de conectar (texto de ayuda del botón) |

## El flujo, capa por capa

### 1. El botón (navegador)

```ts
window.FB.login(alResponder, {             // alResponder: función COMÚN, no async
  config_id: configId,
  response_type: 'code',
  override_default_response_type: true,
  extras: {
    setup: {},
    featureType: 'whatsapp_business_app_onboarding',   // ← esto ES la coexistencia
    sessionInfoVersion: '3',
  },
});
```

El listener de `window.message` (origen facebook.com, `type: 'WA_EMBEDDED_SIGNUP'`)
guarda la sesión **aunque no venga el número**, siempre que el final sea el de
coexistencia:

```ts
const fin = d.event ?? null;
if (waba && (phone || fin === FIN_COEXISTENCIA)) {
  sesion.current = { wabaId: waba, phoneNumberId: phone, finalizacion: fin };
}
```

Y al servidor se le manda `finalizacion` tal cual. Las dos trampas del SDK
(`fedCM: false`, callback no async) están en `fb-login-sdk-fedcm-y-callback`.

### 2. El servidor — el ORDEN es la mitad del diseño

1. **Validar entrada:** sin `phoneNumberId` solo se sigue si `finalizacion` es la de
   coexistencia. Con otro final (compartir solo la WABA) buscar un número sería
   adivinar.
2. **Gate** (sesión + rol + candado de quién puede conectar) **antes** de hablar con
   Meta: no se canjea un código a nombre de alguien sin permiso. El `agencyId` sale
   del slug contra la sesión, **nunca del navegador**.
3. **Canjear el `code` primero**: es de un solo uso y muere a los ~30 segundos.
4. Si no vino el número: `GET /{waba}/phone_numbers?fields=id,is_on_biz_app`, filtrar
   `is_on_biz_app === true`, exactamente uno. (Una WABA puede tener otro número que
   hoy anda por otro proveedor; tomarlo lo movería sin que nadie lo pidiera.)
5. `leerNumero` + `leerCoexistencia` **en paralelo y en consultas separadas**:
   `GET /{phone}?fields=is_on_biz_app,platform_type`. Separadas porque la referencia
   del número no lista esos campos (solo la guía de coexistencia) y si Graph los
   rechazara, la conexión entera fallaría por un dato secundario. Dos preguntas:
   `enApp` decide si se registra; `cloudApi` (`platform_type === 'CLOUD_API'`) solo
   si hay que avisar que Meta todavía está terminando.
6. **Suscribir la app a la WABA** (`POST /{waba}/subscribed_apps`).
7. **Registrar solo si `enApp === false`**. Si Meta no dijo (`null`) tampoco: un
   número sin registrar se arregla después; uno que perdió el celular, no.
8. Token del negocio a **Vault** (nunca a `provider_config`).
9. Guardar el canal buscando el número en **los dos formatos** (`+506…` y `506…`):
   medido, 4 de 7 clientes vivos lo guardaban con `+` y 3 sin él; buscando uno solo
   se insertaba una segunda línea activa y el negocio no podía enviar.
10. Apagar la línea anterior **después** de guardar la nueva (si algo falla en el
    medio, queda la vieja funcionando, nunca ninguna).
11. **Recién ahora sincronizar**, y solo si la suscripción del paso 6 salió bien:
    pedir sin suscripción gasta el único intento y los chats van a donde nadie
    escucha. Si falló, se marca `sync_*: { ok:false, error:'sin_suscripcion_a_webhooks' }`.
    Primero contactos, después historial (así los chats llegan con nombre).

`provider_config` queda: `{ waba_id, verified_name, coexistencia, conectado_at,
sync_contactos, sync_historial, historial_ultima_tanda_at, historial_completo_at,
agenda_sincronizada_at, … }`. `conectado_at` abre el reloj de 24 h.

Los fallos que **no invalidan** la conexión vuelven como `avisos` y se muestran:
un canal a medias que dice "listo" es peor que uno que dice qué le falta.

### 3. Reintentar (pantalla de Canales)

Acción aparte con el mismo candado: lee el canal, exige `coexistencia` y
`dentroDelPlazoDeSincronizacion(conectado_at)`, calcula qué claves no están en
`ok: true`, **vuelve a suscribir la WABA antes de pedir** (no hace daño si ya
estaba) y repite solo lo que falló. Fuera de plazo el mensaje dice cómo se arregla:
desconectar desde la app (Ajustes → Cuenta) y conectar de nuevo.

⚠️ El `Date.now()` del plazo va en un helper del lib, no en el componente: el linter
de React (`react-hooks/purity`) lo rechaza en el render, y tiene razón.

### 4. El webhook

Lo que agrega a una recepción multicanal ya armada (`webhook-meta-multicanal`):

| Campo | Qué se hace |
|---|---|
| `history` con `history[].threads[]` | Cada hilo = un contacto. Se normalizan los mensajes, se resuelve/crea el contacto y se importa por RPC en tandas de 500, 5 hilos en paralelo |
| `history` con `history[].errors[]` (2593109) | El negocio no quiso compartir: se anota en el canal |
| `history` con `value.messages[]` plano | Llega DESPUÉS con el id de la media de un mensaje ya importado (mismo wamid). Solo para media de los últimos 14 días |
| `smb_app_state_sync` | Agenda: upsert de contactos `add` / marca `removed_at` en `remove`, y renombrar los contactos que todavía se llaman "Lead sin nombre" |
| `account_update` | `PARTNER_REMOVED` / `ACCOUNT_OFFBOARDED` / `ACCOUNT_RECONNECTED`: **solo se anota** (`pausado_at`, `reconectado_at`, motivo). Nunca desactiva: el evento no dice claramente de qué partner se trata, y apagar un canal vivo por un evento ajeno deja al negocio sin bandeja |

Reglas del normalizador del historial (todas salieron de casos reales o de la
revisión):

- **Dirección del mensaje:** comparar el `from` primero contra el **contacto del
  hilo** (`thread.id`) y después contra el teléfono del negocio. Sin `from`: si hay
  `to`, es del negocio. Último recurso: si conocemos el teléfono del negocio, es
  entrante.
- **Fecha:** del `timestamp`; si no hay, el mensaje **se descarta** (nunca "ahora":
  un mensaje de marzo fechado hoy desordena la bandeja y reabre ventanas).
- **Estado** del mensaje del negocio: `history_context.status`
  (READ / PLAYED / DELIVERED / SENT / ERROR / PENDING).
- Se saltan `reaction`, `revoke`, `edit`, `request_welcome` y `unsupported` de
  edición: no son mensajes para mostrar (ver `clasificar-por-lista-no-por-fallback`).
- **Media:** llega como `media_placeholder` sin archivo. Si es reciente (≤14 días)
  se marca `historial_media_pendiente` + `archivo_pedido_at`; si es más vieja,
  `archivado_error: 'historial_sin_archivo'` (Meta no la va a mandar nunca). La UI
  muestra "cargando" con techo de 6 h si se espera a Meta, 5 min si no.
- Cuando llega la media: si el mensaje ya tiene archivo, es duplicado; si no, se
  mezcla la metadata **sacando las marcas** de "sin archivo", se archiva a Storage
  propio (prefijo `hist`) y se completa `kind`/`body` solo si estaban vacíos. Si la
  media llega **antes que su chat** (las tandas vienen desordenadas) y no hay con
  qué crear el mensaje: se **tira un error para que Meta reintente**.
- El primer error no determinístico de una tanda se relanza (Meta reintenta); los
  determinísticos (datos malos) se anotan y se sigue.
- `progress: 100` en una tanda → `historial_completo_at`. (Ojo: las tandas llegan
  desordenadas, así que "completo" puede anotarse antes de procesar la última
  —pendiente conocido.)

### 5. La base — importar sin que el pasado se haga pasar por presente

**El problema** (medido contra los triggers vivos): un `INSERT` en `messages`
dispara lo pensado para un mensaje que llega AHORA. Importar 6 meses por el camino
normal generaba:

- una notificación "Nueva conversación" **por chat importado** (y cada una manda un
  aviso por WhatsApp al equipo);
- `unread_count + 1` por cada entrante viejo → cientos de "no leídos";
- `last_message_at` con el último **insertado**, no el más reciente (las tandas
  llegan desordenadas);
- avisos de "mensaje nuevo" en conversaciones ya asignadas (el cliente migrado);
- un evento de realtime por mensaje → la bandeja abierta recibe miles de golpes.

**La solución:** una RPC `security definer` (`importar_historial_whatsapp`) que
prende una marca **local a la transacción** y los cuatro triggers la miran:

```sql
perform set_config('app.importando_historial', 'on', true);   -- true = solo esta transacción
```
```sql
-- primer if de cada trigger (el resto del cuerpo, copiado de la base VIVA)
if coalesce(current_setting('app.importando_historial', true), '') = 'on' then
    return new;
end if;
```

Es seguro porque PostgREST corre **cada llamada RPC en su propia transacción**: la
marca no se filtra a otro request. Sin la marca, los triggers hacen exactamente lo
mismo que antes (se probó con control negativo).

Después la función deja todo como corresponde, con los datos reales:

- **Idempotente:** `on conflict (agency_id, channel, external_id) do nothing` +
  `distinct on (external_id)` dentro de la tanda. Un reintento de Meta no duplica.
- **Fechas que nunca van para atrás:** `greatest(c.last_message_at, v_max)`; la vista
  previa solo cambia si la tanda es más nueva.
- `inbound_count += entrantes`, **sin tocar `unread_count`**.
- **`last_inbound_at` / `last_outbound_at` NO se llenan.** Son la ventana de 24 h:
  llenarlas haría que el CRM ofreciera escribir libre y el envío rebotara. Y de
  paso deja afuera a los escáneres que miran esas columnas (seguimientos
  automáticos que LE ESCRIBEN al contacto, "ventana por cerrarse", "sin
  respuesta"). El chat igual aparece en su lugar porque la bandeja ordena por
  `last_message_at`.
- El único escáner que mira `last_message_at` ("sin dueño") se parchó para excluir
  conversaciones importadas que todavía no tuvieron un mensaje en vivo.
- **Fecha de alta del contacto:** si el contacto nació de la importación (o lo creó
  el webhook en vivo DESPUÉS de un mensaje viejo suyo), `created_at` y
  `first_contact_at` bajan al mensaje más viejo. Si no, 300 chats importados se
  cuentan como 300 contactos nuevos de HOY en el tablero. Un contacto que ya existía
  de antes no se toca: su alta es real.
- **Citas** (respuesta a un mensaje): el citado puede venir en otra tanda, más
  tarde. Se guarda `media_metadata.cita_pendiente = <wamid>` y en cada llamada se
  resuelven las pendientes de **toda la conversación**, antes del `return` temprano
  para que un reintento también las resuelva.
- Devuelve las medias insertadas con `meta_media_id` para archivarlas.
- `revoke` a `public/anon/authenticated`, `grant` solo a `service_role`.

Tablas/funciones auxiliares: `whatsapp_app_contacts` (agenda; RLS prendida y sin
acceso para anon/authenticated), `nombrar_leads_desde_agenda(agency)` (solo pisa
"Lead sin nombre") y `anotar_canal_meta(agency, external_id, cambios jsonb)` que
**mezcla** en `provider_config` (el webhook y el servidor escriben claves distintas
al mismo tiempo; un read-modify-write desde el cliente se pisaría).

SQL completo de la RPC y payloads de Meta: `payloads-y-sql.md`.

### 6. Cómo se probó (antes de aplicar)

Con el **bloque que siempre aborta** (`DO … raise exception` con el reporte adentro)
contra la base viva, migración incluida dentro del bloque:

- 0 notificaciones, 0 eventos de realtime, `unread_count` 0 tras importar;
- tandas desordenadas → `last_message_at` y vista previa correctos;
- reintento idéntico → 0 insertados;
- agencia ajena → rechazada; `anon`/`authenticated` sin permiso de ejecutar;
- **control negativo:** con la marca apagada, el camino en vivo SÍ notifica, SÍ suma
  no leídos y SÍ emite realtime (si esto no pasa, la prueba no discrimina);
- agenda: solo renombra "Lead sin nombre"; `anotar_canal_meta` mezcla sin pisar;
- cita resuelta a través de dos tandas; marca de contacto nacido de historial;
- "sin dueño" no genera tarea para un chat importado hasta que llega uno en vivo.

Después de aplicar: verificar que las 5 funciones cambiaron en la base viva y que
la producción quedó intacta. En la función del webhook, 14 pruebas con los
**ejemplos literales de la doc de Meta** (52/52 en total).

## Los seis hallazgos de la revisión (para no repetirlos)

1. `insertados += await f()` dentro de un `Promise.all`: carrera (lee el valor viejo
   antes del await). → `const n = await f(); insertados += n;`
2. Tabla temporal dentro de la RPC: riesgo con conexiones reusadas del pooler. →
   CTEs con `jsonb_to_recordset`.
3. Pedir la sincronización sin estar suscripto: gasta el intento. → condicionar a la
   suscripción y re-suscribir en el reintento.
4. El escáner "sin dueño" iba a generar una tarea por chat importado de la última
   semana. → condición extra.
5. La media que llega antes que su chat se perdía en silencio. → error para que Meta
   reintente.
6. Contactos importados contados como nuevos de hoy. → bajar `created_at` solo a
   los que nacieron del historial.

## Pendientes conocidos (documentados, no resueltos)

- **Handler congelado:** las conversaciones importadas nacen con el handler del
  momento (`unassigned` mientras el bot escucha al proveedor viejo). Cuando el bot
  pase a escuchar a Meta, hace falta un backfill.
- **Clientes migrados desde el BSP:** sus mensajes guardados con el id del BSP no
  coinciden con el wamid de Meta → el historial los duplicaría (medido: 25 mensajes
  en dos clientes). Deduplicar por contenido+fecha antes de migrarlos.
- Estado parcial si la conexión falla **después** del canje del código (el código
  ya se gastó).
- `historial_completo_at` puede marcarse antes de procesar la última tanda.

## Checklist

- [ ] `featureType: 'whatsapp_business_app_onboarding'` + `sessionInfoVersion: '3'`
- [ ] El listener acepta el final de coexistencia sin `phone_number_id`
- [ ] Servidor: gate → canje → número → coexistencia → suscribir → registrar SOLO si
      `enApp === false` → Vault → canal (dos formatos) → apagar la anterior →
      sincronizar si hubo suscripción
- [ ] Campos del webhook `history`, `smb_app_state_sync`, `smb_message_echoes`,
      `account_update` prendidos en el panel
- [ ] RPC de importación con marca local a la transacción; triggers con el `if`
- [ ] Ventana de 24 h intacta; escáneres revisados uno por uno
- [ ] Prueba con bloque que aborta **y** control negativo
- [ ] Texto de ayuda con los límites (grupos, temporales, dispositivos vinculados)
