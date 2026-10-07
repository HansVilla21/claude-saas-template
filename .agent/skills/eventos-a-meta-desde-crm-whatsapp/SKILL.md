# Skill: Eventos a Meta desde un CRM de WhatsApp (lead calificado, compra)

## Cuándo usar esta skill

- Un cliente pauta **anuncios que abren WhatsApp** (Click-to-WhatsApp) y pregunta si el CRM puede **avisarle a Meta qué lead calificó o compró**, "como el píxel".
- Vas a conectar la **Conversions API for Business Messaging** (`action_source: business_messaging`) desde un CRM propio.
- El número del cliente está en un **BSP** (YCloud, Twilio, 360dialog…) y tu app necesita llegar a su cuenta de WhatsApp.
- Meta te responde `events_received: 1` y **el evento no aparece** en el Administrador de eventos (mirá el Resumen, no "Probar eventos": paso 7).
- El cliente quiere **avisarle a Meta que un lead salió malo** ("para que deje de traer gente así"). Eso no existe: paso 1b.
- Quien maneja los anuncios dice que **en el Administrador de eventos no llega nada**, o pide **"meterle el píxel al CRM"**: paso 10.

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

**Cómo terminó (misma noche):** Meta aprobó el permiso el mismo día. Los 4 eventos aparecieron, pero **en el Resumen del conjunto de datos, no en "Probar eventos"**, que siguió vacío incluso con la página abierta. Y aparecieron ahí **a pesar de llevar `test_event_code`**: en este producto el código de prueba no los aísla (ver paso 7).

> La idea central: **el problema no es el payload, es quién tiene acceso a la cuenta de WhatsApp.** Si el número vive en un BSP, tu app no puede ser socio: el token lo genera el portafolio del cliente, sobre tu app, y queda en tu base cifrado por negocio.

**Ampliada el 2026-09-28** con una investigación de la documentación de Meta que salió de otro pedido: *"que Meta sepa qué leads salieron malos"*. Corrigió dos cosas que esta skill afirmaba. Decía que por anuncios de WhatsApp **solo se optimiza por compras**, y también se puede por leads. Decía que los 7 días se cuentan desde el evento, y para que sume al anuncio **se cuentan desde el clic**. Sumó lo que Meta no acepta, que es lo que el cliente pide primero (paso 1b).

**Ampliada el 2026-10-07**, dos semanas después de encender un negocio. El que le maneja los anuncios avisó que *"no estaba recibiendo la información en Meta"* y pidió instalar el píxel en el CRM. Llegaba todo: 26 leads y 2 compras, la misma cantidad que la tabla de envíos del CRM. Él miraba otro conjunto de datos, y el nuestro no estaba conectado a su cuenta publicitaria. Además, la herramienta para consultar Meta por API daba cero en el conjunto correcto (paso 10).

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

Y decile al cliente **antes de construir** lo que Meta permite optimizar. Meta lo documenta en la lección *"Optimizar anuncios de mensaje para clientes potenciales"* (facebook.com/business/learn/lessons/optimize-leads), leída el 2026-09-28:

- **Solo cuentan dos eventos para optimizar:** *"clientes potenciales presentados y compras"*, o sea `LeadSubmitted` y `Purchase`. `QualifiedLead` se manda y se ve en reportes, pero no hay forma documentada de optimizar por él.
- **Por compras:** 10 compras en 30 días.
- **Por leads, con la API en la nube:** *"más de 100 eventos de clientes potenciales o de compra en los últimos 90 días"*, unos 34 por mes. El umbral de 10 en 30 días de esa misma página es para quien etiqueta chats en la app WhatsApp Business: no es tu caso. ⚠️ La página pone el requisito de 100 junto al párrafo de públicos similares; es la lectura más probable, no una certeza.
- **Los 7 días son dos límites distintos:**
  - La API rechaza un `event_time` de más de 7 días. Nada de backfill.
  - Para que el evento sume al anuncio, el chat tiene que etiquetarse *"dentro de los 7 días de haber hecho clic en el anuncio"*. Una venta que se cierra a los 20 días del clic Meta la recibe, pero no la cuenta para el anuncio.
- **Fase de aprendizaje:** unos 50 resultados por semana por conjunto de anuncios. Debajo queda en "aprendizaje limitado": optimiza igual, con menos precisión.
- **Con pocas ventas no se llega.** Medido: 3 a 6 ventas por mes. En negocios chicos, **el valor inmediato es de medición**: el administrador de anuncios muestra qué anuncio trae leads calificados y ventas. Decíselo así, no le prometas que Meta "va a aprender".

### 1b. "Avisarle a Meta que el lead es malo" no existe

Es lo primero que pide un cliente cuando entiende que el CRM le habla a Meta: *"que sepa cuáles salieron malos, para que deje de traer gente así"*. Meta **no tiene forma de recibirlo**:

- **La lista de eventos es cerrada, y ninguno significa "malo":**
  - leads y compras: `Purchase`, `LeadSubmitted`, `QualifiedLead`;
  - carrito y pago: `InitiateCheckout`, `AddToCart`, `ViewContent`, `CartAbandoned`;
  - pedidos: `OrderCreated`, `OrderShipped`, `OrderDelivered`, `OrderCanceled`, `OrderReturned`;
  - opiniones: `RatingProvided`, `ReviewProvided`.

  No hay nombres propios documentados ni campo de calidad del lead.
- **El producto que sí acepta etapas con nombre propio no sirve para WhatsApp.** "Conversion Leads" (Conversions API for CRM, `action_source: system_generated`, `lead_id`) funciona solo con **formularios instantáneos** de Meta. Hasta ahí, Meta le pide al CRM *sacar* del embudo las etapas negativas: el modelo aprende de las positivas.
- **Cómo se dice "malo" entonces: no mandando nada.** Meta lo recomienda textual para WhatsApp: *"al menos un paso de calificación entre el inicio de la conversación y la etapa de envío de información de clientes potenciales"*, y no registrar cada conversación como lead. En la práctica:
  - `LeadSubmitted` va atado a una etapa que ya implica calificación, como "agendó" o "pidió precio". Nunca a "Nuevo".
  - Si lo mandás con cada conversación, le enseñás a Meta a traer más de lo mismo.
- **No hay vuelta atrás.** Si el disparador es una etiqueta y alguien la quita, no hay nada que mandar para deshacer el evento.
- **Negocios de salud:**
  - Meta prohíbe mandar enfermedades, tratamientos, procedimientos o lugares de tratamiento, *"incluso en los nombres de los eventos"*. Con la lista cerrada y sin mandar el nombre de la etapa, "Paciente" nunca llega a Meta: mantené el payload mínimo del paso 6.
  - El riesgo que no controlás: Meta puede clasificar el conjunto de datos como **"salud y bienestar"** y restringir los eventos de mitad y final del embudo. Esa clasificación no se puede cambiar, y Meta no publica qué eventos restringe ni en qué países (empezó en EE. UU. en 2025).
  - Al prender una clínica, mirá la categoría del conjunto de datos en el Administrador de eventos y avisale al cliente antes.

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

- **Por negocio, qué etapa del embudo manda qué evento** (y el monto de la compra). Tabla de reglas, no literal en el código. La pantalla configura **qué es bueno**: qué etapa (o etiqueta) es "lead calificado" y cuál es "compra". Lo malo no se configura porque no hay qué mandar (paso 1b).
- **Guardá la hora del clic**, no solo el `ctwa_clid`. La ventana de 7 días que decide si el evento suma al anuncio empieza en el clic. Si el CRM solo mide desde el cambio de etapa, manda eventos que Meta acepta y no atribuye. La fecha de alta del lead sirve como aproximación, pero falla cuando un contacto viejo vuelve por un anuncio nuevo.
- **Un trigger sobre `leads`** (`after insert or update of stage_id`) que solo ANOTA en una cola cuando la etapa **cambia** (`new.stage_id is distinct from old.stage_id`: hay pantallas y bots que reescriben la misma etapa). Nada de red dentro del trigger: una falla de Meta no puede frenar el cambio de etapa de una persona. `exception when others → raise warning; return new`.
- **Un evento de cada tipo por lead**, con índice único: Meta **no deduplica** en este producto.
- Lo que no se puede mandar queda **'omitido' con motivo** (`sin_clic_de_anuncio`, `sin_token`, `sin_conjunto_de_datos`, `vencido`), no desaparece: "de 30 clientes se mandaron 25" solo se entiende si se ve por qué no salieron 5.
- **Modo prueba** con `test_event_code`, y el código **se copia a la fila** al anotarla: si alguien prende el modo real con pruebas en cola, esas salen igual como prueba. La unicidad incluye `prueba`, para que las pruebas no le quiten el lugar al evento real. ⚠️ Medido después: los eventos con código de prueba **igual figuran en el Resumen** del conjunto de datos. "Prueba" no es un sandbox: nunca mandes `Purchase` en prueba con un monto provisorio.
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

1. **Administrador de eventos → el conjunto de datos → Resumen**, tabla de eventos: el evento con integración **"API de conversiones"**, estado **Activo**, el total y la "última recepción". Tarda **hasta 30 minutos**. Ese es el lugar que funcionó.
2. **"Probar eventos" (canal Mensajes → WhatsApp) no sirvió**: siguió vacío con el permiso aprobado y la página abierta, mientras el Resumen ya mostraba los mismos eventos. No bloquees la salida esperando esa pantalla.
3. Si tampoco aparece en el Resumen: descartá lo barato primero (el `ctwa_clid` es reciente y de un anuncio; el conjunto de datos está vinculado a la cuenta: `GET /{WABA_ID}/dataset` lo devuelve; la pestaña "Acciones" solo tiene sugerencias). Lo que queda es el **permiso sin revisar**.
4. Como el código de prueba no aísla (ver paso 5), el negocio pasa a **encendido directo, con las reglas ya confirmadas por el cliente** (qué etapa es compra, precio, moneda). Un "probemos en prueba con el monto provisorio" manda ventas falsas.

### 8. La revisión de Meta para `whatsapp_business_manage_events`

Aunque la guía dice que se aprueba solo si la app ya tiene `whatsapp_business_messaging` avanzado, en la pantalla de la app apareció como **"Agregar a revisión de la app"**, sin estado. Lo que pidió:

- **Al menos una llamada exitosa** con el permiso (los eventos de prueba sirven).
- **Descripción de uso** y **un video**. El video que se envió: la pantalla de configuración del negocio → obtener el conjunto de datos → etapas → modo prueba → "Mandar un evento de prueba" → el aviso de que Meta lo recibió. **No** mostrar la página de "Probar eventos" vacía: le haría creer al revisor que no funciona.
- En "Instrucciones para revisores": que es **servidor a servidor** y que la pantalla de configuración la opera el equipo, no el usuario de prueba.
- **"Renewal"**: Meta pide re-certificar los permisos que ya tenías aprobados (una casilla por permiso).
- Resultado: **aprobado el mismo día**. El token que ya existía traía el scope (se generó con el permiso marcado antes de la revisión): no hubo que regenerarlo. Confirmalo con `debug_token` antes de pedirle nada al cliente.

### 9. Activar en producción sin que salga nada por accidente

1. **Primero el secreto, después el merge.** Cargá el secreto del cron en el hosting (en Vercel, `sensitive`, solo production) **antes** de mergear: el deploy del merge ya lo toma y no hace falta republicar.
2. En el Vault, la URL de la ruta y **el mismo** secreto. Generalo una vez en un script que escriba los dos lados y compare **huellas** (sha256 recortado), nunca el valor.
3. Verificá los tres caminos: sin clave → 401, clave equivocada → 401, clave del Vault → 200. Un **503** significa que el hosting no tiene la variable.
4. El cron solo llama si hay pendientes, así que **con la cola vacía nunca vas a ver el camino real funcionando**. Probalo a mano: el mismo `net.http_post` que hace la función, con la URL y el secreto del Vault, y leé `net._http_response`.
5. Los negocios cuyas reglas el cliente no confirmó quedan en **apagado** (conservando reglas y token): apagado = el trigger no anota nada, así que al prender no sale ninguna cola vieja.

### 10. Que lo vea quien maneja los anuncios

Que Meta procese el evento no alcanza: el que pauta tiene que verlo y poder elegirlo en sus campañas. Cuando dice "no llega nada", casi nunca es el envío.

1. **Primero, ¿qué conjunto está mirando?** Un portafolio puede tener varios. Además del que creaste sobre la cuenta de WhatsApp (paso 4), suele haber uno de píxel web o de otra cuenta de WhatsApp del mismo cliente. Medido: él miraba «<Negocio> Ads Manager Event Data», atado a OTRA cuenta de WhatsApp y con un solo PageView del navegador. Pedile captura y compará dos datos con los de tu base:
   - el **identificador** que aparece bajo el nombre del conjunto, contra tu `dataset_id`;
   - el **«Identificador de la cuenta de WhatsApp Business»** de la columna derecha, contra tu `waba_id`.
2. **El conjunto que crea tu código no está conectado a ninguna cuenta publicitaria.** Si el Administrador de eventos está filtrado por una cuenta publicitaria (se ve en el selector de arriba a la derecha), lista solo los conjuntos conectados a ella. Por eso el tuyo no le aparece, y tampoco lo puede elegir en un conjunto de anuncios ni usarlo en las columnas de conversiones. El arreglo es del cliente, sin código: en la configuración del negocio, el conjunto de datos → activos conectados → agregar su cuenta publicitaria. ⏳ Esa ruta exacta todavía no se vio hecha.
3. **Para confirmar que llega, cruzá dos fuentes:**
   - tu tabla de envíos: cuántos `enviado` por evento, con `respuesta.events_received` = 1;
   - el **Resumen** del conjunto correcto (paso 7): «Cliente potencial enviado» y «Comprar» con integración «API de conversiones».
   
   Tienen que dar el mismo número. Medido: 26 y 2 en los dos lados.
4. **No verifiques con la API de estadísticas.** Para estos eventos el MCP de Meta Ads (`ads_get_dataset_stats`) da `stats: []` con cualquier agregación, y `server_last_fired_time` da 1969. Pasó mientras el Resumen mostraba 34 eventos. Leer ese cero como "no llega" te manda a buscar un bug que no existe. El Resumen pide la sesión de Meta del humano: en un navegador limpio cae al login.
5. **"Meté el píxel en el CRM" no corresponde, y hay que decirlo.**
   - El píxel va en una página web y mide a quien la visita. Un lead de un anuncio que abre WhatsApp no pasa por ninguna web.
   - El CRM lo abre solo el equipo del negocio. Un píxel ahí mediría a los vendedores y le ensuciaría los datos a Meta.
   - Para este tipo de anuncio, la señal es la de esta skill: servidor a servidor con el `ctwa_clid`.
   - Si el negocio además tiene una web con formulario, eso es otra skill (`meta-pixel-capi`) y otro conjunto de datos.

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
| Revisión de `whatsapp_business_manage_events` | ✅ aprobada el mismo día; el token existente ya traía el scope |
| **Meta procesa el evento** | ✅ visto en el **Resumen** del conjunto de datos ("API de conversiones", Activo) |
| El evento aparece en "Probar eventos" | ❌ nunca, ni con el permiso aprobado ni con la página abierta |
| El `test_event_code` aísla los eventos de prueba | ❌ no: los de prueba figuran en el Resumen |
| Trigger, cola, unicidad, modo prueba, token por negocio | ✅ 20/20 contra la base viva en transacción con rollback, con controles negativos |
| Ruta en producción + secreto en hosting y Vault | ✅ 401 sin clave / 200 con la del Vault / 200 por `pg_net` desde la base |
| Un evento real disparado por el trigger (un lead que cambia de etapa) | ✅ 2026-09-25: salió solo, `events_received: 1`, sin modo prueba. Al 2026-09-28: 2 compras enviadas, 0 fallidas, a 1,8 y 2,5 días de que el lead escribió (dentro de los 7 del clic). ✅ 2026-10-07: el Resumen muestra 26 «Cliente potencial enviado» y 2 «Comprar», igual que la tabla de envíos |
| El conjunto le aparece a quien maneja los anuncios | ❌ no, hasta conectarlo a su cuenta publicitaria (paso 10). ⏳ falta verlo conectado |
| La API de estadísticas del conjunto (MCP de Meta Ads) cuenta estos eventos | ❌ da `stats: []` con el Resumen mostrando 34 |
| Mandar "este lead es malo" | ❌ no existe (2026-09-28, documentación de Meta): se comunica no mandando nada (paso 1b) |
| Optimizar por leads en anuncios de WhatsApp | 📄 documentado, no medido: `LeadSubmitted` + `Purchase`, más de 100 en 90 días con la API en la nube |

**Actualizar la fila ⏳** cuando el conjunto aparezca conectado en la cuenta publicitaria.

## Output esperado

- El cliente sabe, antes de construir, qué leads se pueden reportar, por qué evento se puede optimizar y con cuánto volumen. También sabe que "lead malo" se comunica no mandándolo.
- Token por negocio en Vault, revisado contra Meta al guardarlo.
- Una pantalla por negocio: token, cuenta de WhatsApp, conjunto de datos, etapa → evento, estado (apagado / prueba / encendido), evento de prueba, y el registro de lo mandado con motivos.
- Un evento de prueba visto en el **Resumen** del conjunto de datos, y el negocio encendido recién con las reglas confirmadas por el cliente.

## Ejemplo

**Input:** *"Un cliente me pregunta si el CRM puede avisarle a Meta qué lead es calificado y cuál compró, eso se hace con el píxel."*

**Output:** Conteo de leads con `ctwa_clid` por negocio (83 %), aclaración de qué se puede optimizar (compras con 10 en 30 días; leads con más de 100 en 90) y de que a un negocio chico hoy le sirve para medir, revisión del panel del BSP (sin cuenta publicitaria conectada), token generado en el portafolio del cliente con la app del proveedor (aprobado por otro admin), conjunto de datos creado por API, reglas "Llamada agendada → QualifiedLead" y "Cliente → Purchase", modo prueba, y revisión del permiso enviada al ver que el evento no aparecía.

**Input 2:** *"Quiero que Meta sepa cuáles leads salieron malos, así deja de traerme gente así."*

**Output 2:** No existe ese evento. Se ata `LeadSubmitted` a una etapa que ya califica (no a "Nuevo") y lo malo simplemente no se manda. Se miden contra los umbrales las ventas y los leads calificados por mes de cada negocio: hoy ninguno llegaba, y el más cercano sumaba unos 60 de los 100 en 90 días. A las clínicas se les avisa de la categoría "salud y bienestar".

**Input 3:** *"El de los anuncios dice que en Meta no le llega nada y que falta meterle el píxel al CRM."*

**Output 3:**
- La tabla de envíos tenía 28 enviados y 0 fallidos, todos con `ctwa_clid` y ninguno de prueba.
- La captura de él mostraba otro conjunto: otro identificador y otra cuenta de WhatsApp.
- El Resumen del conjunto correcto daba los mismos 26 y 2.
- El píxel se descartó explicando por qué.
- Le quedó un solo paso en Meta: conectar el conjunto a su cuenta publicitaria y elegirlo en sus campañas.

Relacionadas: `meta-tech-provider-de-cero-a-app-review` (la primera revisión de la app), `meta-pixel-capi` (CAPI para sitio web, en `.claude/skills/`), `probar-migracion-contra-base-viva-con-rollback`, `verificar-funcionamiento-end-to-end` ("corrió" ≠ "escribió": acá, "recibido" ≠ "procesado").
