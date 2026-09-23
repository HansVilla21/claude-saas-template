# Skill: Eventos a Meta desde un CRM de WhatsApp (lead calificado, compra)

## Cuándo usar esta skill

- Un cliente pauta **anuncios que abren WhatsApp** (Click-to-WhatsApp) y pregunta si el CRM puede **avisarle a Meta qué lead calificó o compró**, "como el píxel".
- Vas a conectar la **Conversions API for Business Messaging** (`action_source: business_messaging`) desde un CRM propio.
- El número del cliente está en un **BSP** (YCloud, Twilio, 360dialog…) y tu app necesita llegar a su cuenta de WhatsApp.
- Meta te responde `events_received: 1` y **el evento no aparece** en el Administrador de eventos.

## Por qué existe esta skill

Capturada el 2026-09-23 conectando el CRM multi-tenant de Momentum para un cliente que pauta anuncios a WhatsApp. El diseño salió en una tarde; lo que costó fue **el acceso**, y cada bloqueo apareció recién cuando se sacó el anterior:

| Lo que se intentó | Lo que pasó |
|---|---|
| Agregar a Momentum como **socio** de la cuenta de WhatsApp del cliente | Bloqueado: *"Esta cuenta ya tiene el número máximo de socios asignados"*. El BSP ocupa el único lugar |
| Compartir la app de Momentum **desde su portafolio** ("Asignar socio" en la app) | Bloqueado: el portafolio es "nuevo" para Meta y no puede compartir activos por **varias semanas** |
| El cliente **pide acceso** a la app desde SU portafolio | ✅ Funcionó (y sin aprobación, porque la misma persona administraba los dos) |
| Usuario del sistema en el portafolio del cliente → token de la app de Momentum | ✅ Pero Meta exige que **otro administrador** del portafolio lo apruebe |
| Crear el conjunto de datos y mandar un evento de prueba | Meta respondió `events_received: 1` cuatro veces… y **ninguno apareció** en "Probar eventos" |

La última fila es la trampa cara: la respuesta 200 no prueba que Meta procesó el evento. Con el permiso `whatsapp_business_manage_events` sin revisar, Meta acepta el envío y no lo muestra. Hubo que enviar la revisión de la app aunque la guía dice que ese permiso "se debería aprobar automáticamente" para apps con `whatsapp_business_messaging` avanzado.

> La idea central: **el problema no es el payload, es quién tiene acceso a la cuenta de WhatsApp.** Si el número vive en un BSP, tu app no puede ser socio: el token lo genera el portafolio del cliente, sobre tu app, y queda en tu base cifrado por negocio.

## Proceso

### 1. Medir antes de prometer

Meta **exige el `ctwa_clid`** (el código del clic, que llega en el `referral` del primer mensaje del webhook). Sin él no hay forma de reportar el lead. Contá cuántos lo tienen, por negocio:

```sql
select negocio,
  count(*) filter (where creado > now() - interval '30 days') leads_30d,
  count(*) filter (where creado > now() - interval '30 days' and atribucion ? 'ctwa_clid') con_clic
from leads group by 1 order by 2 desc;
```

Medido: 83-86 % en los negocios que pautan, 0 % en uno que no recibe anuncios a WhatsApp. Los leads orgánicos y los de **anuncios en Estados de WhatsApp** (Meta omite el `ctwa_clid` ahí) no se pueden reportar.

Y decile al cliente **antes de construir** lo que Meta permite optimizar:

- Para anuncios que abren WhatsApp, **el único objetivo por evento es Compras**, y pide **≥ 10 compras** reportadas. `QualifiedLead` se manda y se ve en reportes, pero no hay forma documentada de optimizar por él.
- Meta rechaza eventos con `event_time` de **más de 7 días**: no se puede reportar lo que ya pasó. Nada de backfill.
- Con pocas ventas por mes (medido: 3-6), llegar a 10 compras tarda meses. Esa decisión es del cliente: qué cuenta como compra.

### 2. Revisar que el BSP no esté mandando compras falsas

Varios BSP traen su propia "CAPI". YCloud, si el cliente conectó su cuenta publicitaria y **no configuró una regla**, reporta por defecto *"one Engage behavior to Meta as a Purchase event"* (Engage = 2+ mensajes). Eso ensucia la señal y duplicaría la tuya. Se ve en el panel del BSP, sección CTWA: si Meta Ads dice "Connect Ad account", no hay nada conectado.

### 3. El acceso: el token lo genera el portafolio del cliente

Si tu app **puede** ser socio de la cuenta de WhatsApp (el cliente la conectó por tu Embedded Signup), usá eso. Si el número está en un BSP, el lugar de socio está ocupado. El camino que funcionó:

1. **Portafolio del cliente → Configuración → Cuentas → Apps → Agregar → "Solicitar acceso a un identificador de la app"** → el App ID de tu app.
   ⚠️ **NO "Conectar un identificador de la app"**: esa es para apps que administrás vos, y puede mover tu app a su portafolio.
2. **Usuarios → Usuarios del sistema → Agregar**, rol **Empleado**. Asignarle tu app (administrar) y **la cuenta de WhatsApp correcta** (mirá el *Identificador*: un portafolio puede tener varias con el mismo nombre). Los permisos parciales de la cuenta son de plantillas, números y mensajes; ninguno cubre eventos → **acceso total**. Lo que tu app puede hacer lo limitan los scopes del token.
3. **Generar token** → tu app → caducidad **Nunca** (uno que vence deja de mandar eventos en silencio) → **solo** `whatsapp_business_management` y `whatsapp_business_manage_events`.
4. **Otro administrador del portafolio aprueba** la solicitud (*"Aprobación necesaria… otro administrador debe aprobar"*). La solicitud **vence en 7 días**. Pasale el enlace directo: `business.facebook.com/settings/requests?business_id=<ID>` → "Requieren revisión". Al aprobar **no se muestra el token**: hay que volver a "Generar token", y ahí aparece **una sola vez**.
5. El token lo pega el humano en **una pantalla de tu sistema** (password, write-only), nunca en el chat. Va a un secreto por negocio (Vault), con funciones `SECURITY DEFINER` y `EXECUTE` solo para `service_role`. Antes de guardarlo, revisalo contra Meta: `debug_token` (válido, scopes, `expires_at`) y un `GET /{waba_id}?fields=id` (alcanza la cuenta).

### 4. El conjunto de datos

`POST /{WABA_ID}/dataset` con `{"dataset_name": "..."}` lo crea; si la cuenta ya tiene uno, devuelve el mismo. La guía dice que `GET` lo lee y la referencia del endpoint dice que no: se prueban los dos, GET primero (devolvió `{"data": []}` cuando no había). **No confundir** con el conjunto de datos del píxel del sitio web que el cliente ya tenga: el de WhatsApp es otro.

### 5. La arquitectura (lo que no se ve en el payload)

- **Por negocio, qué etapa del embudo manda qué evento** (y el monto de la compra). Tabla de reglas, no literal en el código.
- **Un trigger sobre `leads`** (`after insert or update of stage_id`) que solo ANOTA en una cola cuando la etapa **cambia** (`new.stage_id is distinct from old.stage_id`: hay pantallas y bots que reescriben la misma etapa). Nada de red dentro del trigger: una falla de Meta no puede frenar el cambio de etapa de una persona. `exception when others → raise warning; return new`.
- **Un evento de cada tipo por lead**, con índice único: Meta **no deduplica** en este producto.
- Lo que no se puede mandar queda **'omitido' con motivo** (`sin_clic_de_anuncio`, `sin_token`, `sin_conjunto_de_datos`, `vencido`), no desaparece: "de 30 clientes se mandaron 25" solo se entiende si se ve por qué no salieron 5.
- **Modo prueba** con `test_event_code`, y el código **se copia a la fila** al anotarla: si alguien prende el modo real con pruebas en cola, esas salen igual como prueba. La unicidad incluye `prueba`, para que las pruebas no le quiten el lugar al evento real.
- **Un cron cada minuto** (`pg_cron` + `pg_net`, URL y secreto en Vault) que llama a la ruta **solo si hay pendientes**. La ruta toma un lote con `for update skip locked`, suma el intento ANTES de mandar, reintenta red/429/5xx con espera creciente hasta 5 veces y deja 'fallido' cualquier otro 4xx (reintentarlo da el mismo error).

### 6. El payload mínimo

```json
{
  "data": [{
    "event_name": "Purchase",
    "event_time": 1790193762,
    "event_id": "<uuid de la fila>",
    "action_source": "business_messaging",
    "messaging_channel": "whatsapp",
    "user_data": { "whatsapp_business_account_id": "<WABA_ID>", "ctwa_clid": "<del referral>" },
    "custom_data": { "currency": "USD", "value": 49 }
  }],
  "test_event_code": "TEST12345"
}
```

`POST https://graph.facebook.com/v26.0/{DATASET_ID}/events`. `event_time` en **segundos** y nunca en el futuro. `custom_data` **solo si hay monto > 0**: un `value: 0` le enseña a Meta que esa compra no valió nada. Nada de nombre, teléfono ni texto de la conversación: con el `ctwa_clid` alcanza.

### 7. Verificar que Meta lo PROCESÓ, no que lo recibió

`events_received: 1` es "recibí el request", no "lo procesé". Lo que cuenta:

1. **Administrador de eventos → el conjunto de datos → Probar eventos → canal Mensajes → WhatsApp.** La página tiene que estar **abierta cuando llega** el evento: mandalo con la pestaña ya abierta.
2. Si no aparece: descartá lo barato primero (el `ctwa_clid` es reciente y de un anuncio; el conjunto de datos está vinculado a la cuenta: `GET /{WABA_ID}/dataset` lo devuelve; la pestaña "Acciones" solo tiene sugerencias). Lo que queda es el **permiso sin revisar**.
3. Recién con el evento visible en "Probar eventos", el negocio pasa de prueba a encendido.

### 8. La revisión de Meta para `whatsapp_business_manage_events`

Aunque la guía dice que se aprueba solo si la app ya tiene `whatsapp_business_messaging` avanzado, en la pantalla de la app apareció como **"Agregar a revisión de la app"**, sin estado. Lo que pidió:

- **Al menos una llamada exitosa** con el permiso (los eventos de prueba sirven).
- **Descripción de uso** y **un video**. El video que se envió: la pantalla de configuración del negocio → obtener el conjunto de datos → etapas → modo prueba → "Mandar un evento de prueba" → el aviso de que Meta lo recibió. **No** mostrar la página de "Probar eventos" vacía: le haría creer al revisor que no funciona.
- En "Instrucciones para revisores": que es **servidor a servidor** y que la pantalla de configuración la opera el equipo, no el usuario de prueba.
- **"Renewal"**: Meta pide re-certificar los permisos que ya tenías aprobados (una casilla por permiso).

## Gotchas

- **`business.facebook.com` en un navegador nuevo** (un panel embebido, un perfil limpio): *"Estamos realizando comprobaciones adicionales en este dispositivo nuevo. Vuelve a intentarlo en 15 minutos."* No insistir: repetir desde un dispositivo desconocido es lo que hace desconfiar a Meta. Pasar al navegador de siempre.
- **"Solicitar app" se cierra sin error y sin rastro en "Enviadas"**, y la app igual queda agregada. Verificá en la lista de Apps del portafolio, no en Solicitudes.
- El token **lo tiene que pegar el humano en el `.env` correcto**. Se pegó en el `.env` de otra carpeta: buscá por NOMBRE de variable en todos los `.env*` (sin imprimir valores) antes de concluir que no está.
- Un `tail -c` sobre un `.env` corta a mitad de línea y **imprime el final de un secreto**, aunque enmascares con `sed 's/=.*/=…/'`: esa línea no tiene `=`. Para listar variables usá `grep -o '^[A-Z_]*='`.
- Los permisos de un token se ven con `GET /debug_token?input_token=T&access_token=T` (mismo token en los dos).
- Leer campos del conjunto de datos (`GET /{DATASET_ID}?fields=...`) da `(#100) Missing Permission` con estos scopes. No es señal de que algo esté mal.
- Meta publica el umbral del "Marketing API Access Tier" contradiciéndose en la misma página (500 vs 1.500 llamadas). No bloqueó nada en este caso.

## Estado de lo verificado (2026-09-23)

| | |
|---|---|
| Token del portafolio del cliente sobre la app del proveedor, alcanzando su cuenta de WhatsApp | ✅ medido |
| Crear el conjunto de datos por API | ✅ medido |
| Meta acepta el evento de prueba (`events_received: 1`) | ✅ medido |
| **El evento aparece en "Probar eventos"** | ❌ **no, con el permiso sin revisar**. Revisión enviada el 2026-09-23 |
| Trigger, cola, unicidad, modo prueba, token por negocio | ✅ 20/20 contra la base viva en transacción con rollback, con controles negativos |

**Actualizar esta tabla cuando Meta apruebe** y el evento aparezca (o no) en "Probar eventos".

## Output esperado

- El cliente sabe, antes de construir, qué leads se pueden reportar y por qué evento se puede optimizar.
- Token por negocio en Vault, revisado contra Meta al guardarlo.
- Una pantalla por negocio: token, cuenta de WhatsApp, conjunto de datos, etapa → evento, estado (apagado / prueba / encendido), evento de prueba, y el registro de lo mandado con motivos.
- El evento visto en "Probar eventos" antes de encender.

## Ejemplo

**Input:** *"Un cliente me pregunta si el CRM puede avisarle a Meta qué lead es calificado y cuál compró, eso se hace con el píxel."*

**Output:** Conteo de leads con `ctwa_clid` por negocio (83 %), aclaración de que solo se optimiza por compras con ≥ 10, revisión del panel del BSP (sin cuenta publicitaria conectada), token generado en el portafolio del cliente con la app del proveedor (aprobado por otro admin), conjunto de datos creado por API, reglas "Llamada agendada → QualifiedLead" y "Cliente → Purchase", modo prueba, y revisión del permiso enviada al ver que el evento no aparecía.

Relacionadas: `meta-tech-provider-de-cero-a-app-review` (la primera revisión de la app), `meta-pixel-capi` (CAPI para sitio web, en `.claude/skills/`), `probar-migracion-contra-base-viva-con-rollback`, `verificar-funcionamiento-end-to-end` ("corrió" ≠ "escribió": acá, "recibido" ≠ "procesado").
