# Skill: Ser Tech Provider de Meta — de cero a la revisión de la app

> Nació entre el 2026-09-09 y el 2026-09-11 en el CRM de Momentum, al pasar de un
> proveedor intermedio (YCloud) a conectar WhatsApp, Instagram y Messenger **directo
> con Meta**. El trámite tiene siete puertas; **cuatro bloqueos aparecieron recién
> al intentar conectar el primer número**, cada uno escondido detrás del anterior, y
> ninguno lo avisaba el panel. Esta skill es el camino completo, en orden, con lo que
> se hizo en cada pantalla y la tabla de "este error = esta causa" que costó una
> sesión entera armar.
>
> Skills hermanas: `fb-login-sdk-fedcm-y-callback` (las dos trampas del SDK de
> Facebook), `whatsapp-coexistencia-embedded-signup` (el código de conectar el
> número que el negocio ya usa en el celular) y `webhook-meta-multicanal` (la
> recepción de los tres canales).

## Cuándo usar esta skill

- Un SaaS quiere que **sus clientes conecten SU propio WhatsApp / Instagram /
  Messenger** desde el producto (Embedded Signup), sin que el equipo lo haga a mano.
- Hay que decidir entre **Tech Provider** y **Solution Partner / BSP** (YCloud,
  360dialog, Twilio).
- El botón de conectar tira un error de Meta y no se sabe qué puerta falta.
- Hay que armar la **revisión de la app** (App Review) para acceso avanzado.

## Antes de empezar: la decisión comercial

| | Tech Provider (directo) | Solution Partner / BSP |
|---|---|---|
| Quién le paga a Meta | **El cliente, con su tarjeta, directo** | El partner, con línea de crédito |
| Margen sobre mensajes | Ninguno | Sí |
| Revisión de la app | **Obligatoria** | También (el onboarding de *Tech Partner* de YCloud pide los mismos dos videos y el App Review) |
| Instagram y Messenger | Salen por la misma app | El BSP suele cubrir solo WhatsApp |
| Punto único de falla | No: el que no paga se queda callado él solo | Sí: si el saldo del partner se vacía, se caen todos los clientes |

**Lo que se creyó y era falso:** que un BSP permite Embedded Signup sin App Review.
La frase *"becoming a Tech Provider is not mandatory"* de YCloud es del programa
**white label**, que es otro. **El App Review es inevitable en cualquier carril.**

### Los dos carriles a la vez: WhatsApp por el BSP, Instagram y Messenger directo (2026-09-12)

*Carril en curso en el CRM de Momentum. Lo de abajo está leído en las guías y
confirmado por el BSP por correo; todavía **no** se creó ninguna solución.*

- **Se hace con una Partner Solution, dentro de la MISMA app** (no una app nueva).
  En el panel por casos de uso: tarjeta **"Conectarte con los clientes a través de
  WhatsApp"** → Personalizar → **"Conviértete en socio" → "Soluciones para
  socios"** → "Crear solución para socios". La doc de Meta lo describe como
  *App Dashboard > WhatsApp > Partner solutions*, un menú que ya no existe con ese
  nombre.
- **El formulario:** nombre, **App ID del socio** (el de YCloud es
  `2892949377516980`, público en su guía), y permisos: plantillas, recursos de
  teléfonos, y *enviar mensajes y hacer llamadas* ("Solo yo" / "Solo mi socio").
  ⚠️ **"Los permisos no se pueden cambiar después de la configuración".** Hay un
  "Guardar borrador", pero no crees ni guardes nada antes de tener las respuestas
  del socio.
- **"Only my partner" solo alcanza a WhatsApp:** YCloud confirmó que no impide
  Instagram ni Messenger por la misma app. Aplica a los clientes que se conectan
  con el Solution ID; la doc de Meta no aclara qué pasa con los que se conectan
  sin él.
- **La guía del BSP se renumera:** en YCloud el paso de la solución era el 8 y
  pasó a ser el 4. Citá los pasos por nombre, no por número.
- ⚠️ **Tipo de proveedor:** la guía de YCloud pide registrarse como *"Working with
  a Solution Partner"*. Si ya elegiste *"Independent Tech Provider"* para ir
  directo, preguntale al socio antes de crear la solución.
- ⚠️ **El punto único de falla es contractual, no un rumor:** la guía de YCloud dice
  que todos los mensajes se descuentan del saldo del partner y que *"If your
  balance is insufficient, end customers will be unable to use their WhatsApp
  Business channel"*. Preguntá por alertas, recarga automática, crédito o límites
  por cliente antes de sumar clientes.
- En ese mismo menú está **"Migrar clientes"**, para mover números entre socios.

## Las puertas, en orden

| # | Puerta | Dónde | Tiempo medido |
|---|---|---|---|
| 1 | Verificación del negocio | Business Suite → Centro de seguridad | (ya estaba) |
| 2 | App con los casos de uso | developers.facebook.com → Crear app | minutos |
| 3 | Configuración básica + inicio de sesión para empresas | Panel de la app | minutos |
| 4 | Verificación como proveedor de tecnología | Caso de uso WhatsApp → Conviértete en socio | **mismo día** |
| 5 | Verificación de acceso | idem | **mismo día** |
| 6 | **REGISTRO** como proveedor (asistente) | Caso de uso WhatsApp → Conviértete en proveedor de tecnología | inmediato |
| 7 | Revisión de la app (acceso avanzado) | Revisar → Revisión de la app | el panel dice "la mayoría en 20 días" |

La **4 y la 6 no son lo mismo** — ver el bloqueo 3.

### Puerta 2 — la app

- **Una sola app para los tres canales.** En la pantalla de creación WhatsApp +
  Instagram + Messenger se pueden marcar juntos (ninguno se pone en gris). Una app =
  una revisión = una URL de webhook.
- El **portafolio** que es dueño de la app es el nombre que ven los clientes al
  conectar ("Hans Villalobos no puede registrar clientes…" usa ese nombre).
  Renombrarlo **después** de la revisión: no está confirmado si renombrar un
  portafolio verificado dispara otra revisión.

### Puerta 3 — configuración que Meta revisa

**Configuración de la app → Básica:**
- Ícono 1024×1024 (se generó desde el isologo sobre el fondo de marca).
- URL de política de privacidad, de condiciones y de **instrucciones de eliminación
  de datos**, todas públicas (HTTP 200 sin sesión — comprobarlo con `curl`).
- Categoría ("Negocios y páginas").
- Dominios de la app (la landing y el subdominio del producto) y plataforma
  **Sitio web** con la URL del producto.

**Inicio de sesión con Facebook para empresas → Configurar:**
- URI de redireccionamiento = el origen del producto.
- Dominio permitido para el SDK de JavaScript = el del producto.
- ⚠️ **"Iniciar sesión con el SDK para JavaScript" en Sí.** Estaba en No: con eso
  apagado `FB.login()` no abre nada y parece un bug del código.

**Inicio de sesión con Facebook para empresas → Configuraciones:** crear la del
registro insertado **desde la plantilla** "Configuración de registro insertado de
WhatsApp con un token que caduca en 60 días". Queda: variación "Registro insertado
de WhatsApp", token de **usuario del sistema**, activo "Cuentas de WhatsApp",
permisos `whatsapp_business_management` + `whatsapp_business_messaging`. Su id es
el `config_id`. El recuadro gris de esa pantalla es la clave del bloqueo 4: *"Los
permisos en el acceso estándar solo se solicitarán a las personas con roles en
esta app."*

**Variables en Vercel:** `NEXT_PUBLIC_META_APP_ID` y `NEXT_PUBLIC_META_ES_CONFIG_ID`
como tipo **Config** (Vercel rechaza un `NEXT_PUBLIC_` marcado Secret — con razón:
viaja al navegador), `META_APP_SECRET` como **Secret**. Production **y** Preview.

### Puertas 4 y 5 — verificación de proveedor y de acceso

- La verificación de acceso pide *"un sitio web completo que muestre el servicio que
  describiste"*. La landing vendía servicios a medida y no nombraba el producto: un
  revisor que la abriera buscando la plataforma no la encontraba — la causa más
  común de rechazo. Se creó una página `/crm` con **capturas reales de la cuenta
  demo** (nunca de un cliente real). Se envió la URL con `www` porque sin `www`
  redirigía (307).
- Las dos se aprobaron **el mismo día** (Meta anuncia hasta 5).
- "Proveedor de tecnología" es **irreversible** para esa app.

### Puerta 6 — el REGISTRO (el bloqueo que el panel no avisa)

Casos de uso → **Conectar en WhatsApp** → Personalizar → menú izquierdo
**Conviértete en socio → Conviértete en proveedor de tecnología**. Si al entrar abre
un diálogo *"Regístrate como proveedor de tecnología"*, **el registro nunca se
terminó**. Elegir:
- **Independent Tech Provider** si la app es tuya y no trabajás a través de un BSP.
- *Working with a Solution Partner* solo si vas a construir sobre la app de un
  partner (pide el App ID del socio).

"Iniciar registro" acepta las Condiciones para proveedores de tecnología. Al
terminar la pantalla dice **"Registrarte como proveedor de tecnología
independiente — 1 de 2 pasos completados"**: paso 1 verificación del negocio
(aprobado), paso 2 revisión de la app.

### El webhook (antes de publicar)

Caso de uso WhatsApp → **Paso 2: Configuración de producción** → Webhook: URL de
devolución de llamada + token de verificación (texto inventado, igual que el
secreto de la función). Si Meta responde 403 al verificar, el token no coincide:
mirar el log de la función (ahí se ve el token que llegó) y volver a pegarlo.

**Campos del webhook** (misma página, más abajo): varios se suscriben solos
(`messages`, `account_update`, `calls`…). Para coexistencia hay que prender a mano
**`history`**, **`smb_app_state_sync`** y **`smb_message_echoes`** — este último
venía **apagado** y sin él lo que el negocio escribe desde el celular no llega.
`message_echoes` (sin "smb") no hace falta para WhatsApp.

El botón **"Probar"** de cada campo manda un ejemplo con ids inventados: sirve para
comprobar firma y parseo (en el log queda `canal_no_conectado`, que es lo correcto).
El de `messages` tiene escenarios de **nombre de usuario** — probar los tres,
incluido *"opted-in (phone unavailable)"*, que llega **sin teléfono, solo con BSUID**.

### Publicar y despublicar

- Una app **sin publicar** solo recibe los webhooks de prueba del panel: *"No se
  enviarán datos de producción, incluidos datos de administradores, desarrolladores
  o evaluadores de apps, a menos que la app esté publicada."*
- Una app **publicada** solo muestra en el registro insertado los permisos con
  **acceso avanzado aprobado**. Sin revisión aprobada: cero permisos.
- **Despublicar** avisa: *"es posible que tengas que completar el proceso de
  renovación del acceso a datos para volver a publicar esta app. Meta puede tardar
  hasta 10 días"*. **No despublicar como diagnóstico** sin antes leer la URL del
  diálogo (ver bloqueo 1): acá se despublicó por una pista falsa.

## Los cuatro bloqueos al conectar el primer número

Aparecieron **en este orden**, cada uno recién cuando se sacó el anterior.

| # | Lo que ve el usuario | Causa real | Arreglo |
|---|---|---|---|
| 1 | Burbujita "Continuar como…" del navegador y después **"Esta app necesita al menos un permiso compatible"** | **FedCM**: el SDK resolvió `FB.login` con el login del navegador y **tiró `config_id` y `extras`** — la URL del diálogo trae `scope=openid` y `dialog_source=fedcm` | `FB.init({ …, fedCM: false })` → skill `fb-login-sdk-fedcm-y-callback` |
| 2 | El botón queda en "Conectando…" y no abre nada; en consola `Expression is of type asyncfunction, not function` | El SDK valida el TIPO del callback y rechaza una función `async` | Pasar una función común que dispare la async → misma skill |
| 3 | **"X no puede registrar clientes en este momento"** + "¿compartir tu información de contacto?" | Proveedor **verificado pero no registrado** (puerta 6). Según el foro de Meta, la misma pantalla sale si falta cualquiera de: verificación del negocio, revisión aprobada o el asistente de registro | Terminar el asistente "Independent Tech Provider". **No** tocar "compartir mi información" |
| 4 | Al escribir el número: **"La app de socio no tiene los permisos avanzados de mensajes y administración de WhatsApp Business necesarios para el registro"** (#2655111) | Sin revisión aprobada **no se conecta NINGÚN número, ni el propio de prueba**, ni en modo desarrollo | La revisión de la app (abajo) |

**El método que destrabó el 1:** pedir la URL completa de la ventanita (clic en su
barra de dirección, Ctrl+A, Ctrl+C). Ahí se ve en diez segundos si el botón mandó
`config_id` y `response_type=code` o si algo en el medio lo reemplazó. Sin eso se
fueron dos hipótesis falsas: "falta el rol en la app" (el founder era admin) y
"falta publicar/despublicar".

Otros errores del mismo camino:

| Error | Causa |
|---|---|
| `FB.login()` no abre nada, sin error | "Iniciar sesión con el SDK para JavaScript" en No, o dominio no permitido |
| Verificación del webhook 403 | Token de verificación distinto al de la función |
| "Esta app necesita al menos un permiso compatible" **con** `config_id` en la URL | App publicada sin acceso avanzado, o usuario sin rol con la app sin publicar |

## Puerta 7 — la revisión de la app, pantalla por pantalla

### El círculo y cómo se rompe

Para aprobar, Meta pide un video **mandando un mensaje desde tu app**; para mandar
un mensaje la app necesita un número; y ningún número se conecta sin la aprobación.
Se rompe con el **número de prueba gratis de Meta**: caso de uso WhatsApp → **Paso 1.
Pruébalo** → "Solicitar número de prueba" (crea un número +1 555…, su WABA y un token
temporal). Es el único que funciona antes de la aprobación y **solo sirve para los
videos**; el número real se conecta después.

### 1. Limpiar la solicitud

Revisar → Revisión de la app. La lista "Nuevas solicitudes" trae los permisos de
**todos** los casos de uso. Cada permiso que quede pide su propio video y su texto, y
uno sin video traba la solicitud entera. Se sacaron con el tachito
`pages_show_list`, `pages_manage_metadata`, `pages_messaging` y `business_management`
(*"el permiso no se incluirá para revisión en la solicitud"* — sigue en la app; se
vuelve a agregar desde Personalizar del caso de uso). Quedan
`whatsapp_business_messaging`, `whatsapp_business_management` y `public_profile`.

`public_profile` necesita acceso avanzado **antes** de publicar una app de inicio de
sesión para empresas (doc de Meta); no pide video, solo confirmar el uso.

### 2. Los dos videos (uno por permiso, nunca mezclados)

- **`whatsapp_business_messaging`**: *"tu app enviando un mensaje a un número de
  WhatsApp y el cliente de WhatsApp recibiéndolo"*. Meta acepta el panel: en "Paso 1.
  Pruébalo" elegir el número de prueba, agregar el propio número personal en
  **Destinatario** (llega un código para verificarlo), dejar **WhatsApp Web** abierto
  al lado, grabar, "Enviar mensaje", mostrar el "Hello World" llegando.
- **`whatsapp_business_management`**: *"tu app, o WhatsApp Manager, creando una
  plantilla"*. Directo:
  `https://business.facebook.com/wa/manage/message-templates/?business_id=<PORTAFOLIO>&waba_id=<WABA_DE_PRUEBA>`
  → Crear plantilla (Utilidad, un nombre, un texto sin variables) → Enviar → mostrar
  la lista.

⚠️ El panel "Pruébalo" **muestra el token temporal** en el campo y en el `curl`: no
mandarlo en capturas (vence solo en horas, pero igual).

### 3. Las llamadas de prueba a la API (el check que tarda)

Cada permiso exige **al menos una llamada de la app en los últimos 30 días**, y Meta
**tarda en contarla** (avisa hasta 24 h). Medido: la de mensajes se contó en menos de
1 h; la de plantillas, el mismo día, poco después de una **segunda** llamada
(`GET <WABA_DE_PRUEBA>/phone_numbers`). Si el check sigue gris, repetir la llamada
no hace daño.
- Mensajes: la del panel "Enviar mensaje" cuenta.
- Plantillas: **crear la plantilla en WhatsApp Manager NO cuenta** (no es una llamada
  de la app). Se hace desde el **Graph API Explorer**
  (`developers.facebook.com/tools/explorer`): App de Meta = la tuya, Permisos →
  `whatsapp_business_management`, Generate Access Token, y
  `GET <WABA_DE_PRUEBA>/message_templates` → Enviar. Devuelve las plantillas.

Mientras el check no está verde, **"Enviar para revisión" queda gris**. Se puede
llenar todo lo demás y guardar.

### 4. Uso permitido — textos por permiso

Cada tarjeta pide "Descripción del negocio" (una línea), una descripción detallada,
el video, la casilla de uso permitido y Guardar. **No usar la sugerencia de IA** que
ofrece Meta: promete funciones que no existen y termina con "[Your Name]". En
inglés, que es lo que leen los revisores. Los que se usaron:

Descripción del negocio:
```
Momentum AI is a CRM that helps small businesses in Latin America manage their WhatsApp conversations with customers from a shared inbox.
```

`whatsapp_business_messaging`:
```
Momentum AI CRM is a CRM for small businesses in Latin America. Businesses connect their own WhatsApp Business number to our app through Embedded Signup, including coexistence with the WhatsApp Business app. We use whatsapp_business_messaging to receive their customers' incoming messages through webhooks and show them in the CRM's shared inbox, and to let the business's team reply from that inbox (text, images, documents, and approved templates when the 24-hour window is closed). Messages are only sent on behalf of the business that owns the number, to customers who contacted it. The screencast shows a message sent through the Cloud API with our app and received in WhatsApp.
```

`whatsapp_business_management`:
```
We use whatsapp_business_management to manage the WhatsApp Business accounts that businesses share with us through Embedded Signup: read the account and phone number details (number and verified name) to show which number is connected, subscribe our app to the account's webhooks, synchronize contacts and chat history for businesses that keep using the WhatsApp Business app (coexistence), and let the business create and view the message templates it needs to contact customers outside the 24-hour window. We only access the assets the business explicitly shares with us. The screencast shows a message template being created in WhatsApp Manager.
```

`public_profile`:
```
Used only to identify the person who connects their business through Facebook Login for Business / Embedded Signup. We do not store or use it for any other purpose.
```

### 5. Tratamiento de datos

| Pregunta | Respuesta |
|---|---|
| ¿Encargados del tratamiento o proveedores con acceso a los datos? | **Sí**, y se cargan **uno por uno** (cada uno con su ventana): nombre, categoría **"Soluciones y servicios de TI, incluido el almacenamiento en la nube y el procesamiento"**, países. Acá: `Supabase Inc.`, `Vercel Inc.`, `OpenAI, L.L.C.` — Estados Unidos (base en Oregón, app en la misma región). Sumar el servidor de n8n si procesa mensajes |
| Responsable de los datos | El **mismo nombre legal de la verificación del negocio**, exacto |
| País del responsable | El de la empresa |
| ¿Diste datos a autoridades por seguridad nacional (12 meses)? | No |
| Políticas ante pedidos de autoridades | Las que se vayan a cumplir de verdad: revisión obligatoria de la legalidad, minimización de datos, documentación de las solicitudes. Nunca "Ninguna" junto con otras |

### 6. Instrucciones para revisores

- **Cuenta de prueba** creada por el founder (Configuración → Equipo → Invitar), rol
  **admin SOLO de la cuenta demo** (datos inventados). Las credenciales van en el
  campo de **códigos de acceso**, nunca dentro del texto de instrucciones. El correo
  del dominio tiene que recibir (MX), porque la invitación llega por mail.
- ⚠️ **El revisor tiene que poder VER el botón de conectar.** Si el botón está
  limitado (acá: solo el master), el revisor no encuentra el inicio de sesión con
  Facebook y rechaza por "no pudimos verificarlo". Se agregó una excepción por el par
  **(cuenta de revisión, agencia demo)** en el candado, para que no valga en otro
  negocio aunque algún día sumen esa cuenta a uno.
- "Is Facebook Login integrated on this platform?" → **Sí** (el registro insertado
  ES inicio de sesión para empresas). Si un texto viejo de las instrucciones dice
  "Facebook Login is not integrated", reemplazarlo. El que quedó:

```
ABOUT FACEBOOK LOGIN
Users sign in to Momentum AI CRM with an email and a password. Facebook Login for Business is used to let each business connect its own WhatsApp number through Embedded Signup:
1. Sign in with the test credentials and open "Inmobiliaria Costa Verde".
2. Go to Configuración > Canales and click "Conectar mi WhatsApp".
3. Meta's Embedded Signup window opens (Facebook Login for Business with our WhatsApp configuration). The business logs in, selects or creates its WhatsApp Business account and connects its number, including coexistence with the WhatsApp Business app.
4. When it finishes, our server exchanges the code for a business token, subscribes our app to the account's webhooks and shows the connected number on that same screen.
Completing the flow requires a real WhatsApp Business phone number. The attached screencasts show sending a message and creating a template with our app.
```

- Campos opcionales: pagos/códigos de tienda → "Not applicable, web application";
  restricción geográfica → "No geographic restrictions…".

### 7. Enviar

Con los cinco pasos en verde (Verificación, Configuración de apps, Uso permitido,
Tratamiento de datos, Instrucciones) se habilita **"Enviar para revisión"**. Lo
aprieta el dueño. Al enviarla, el estado pasa a **"Revisión en curso"** con el aviso
*"La mayoría de las solicitudes se revisan en un plazo de 20 días"* (enviada el
2026-09-11 en el CRM). Mientras tanto no hay nada que hacer salvo mirar la
**Bandeja de entrada de alertas** y el correo, por si Meta pide más información.

**Medido en el CRM:** enviada el 2026-09-11, **aprobada el 2026-09-12** — menos de un
día, los tres permisos juntos, pese al aviso de 20 días.

Al aprobarse: **republicar** la app desde **Publicar** en el menú de la izquierda
(muestra "Sin publicar" mientras está despublicada). Avisa que puede pedir la
renovación de acceso a datos; en el CRM **no la pidió** y quedó "Publicada" al
instante. Recién ahí conectar números reales (el flujo de coexistencia, pantalla por
pantalla, está en `whatsapp-coexistencia-embedded-signup/prueba-real.md`).

## Checklist rápido

- [ ] Verificación del negocio aprobada
- [ ] App con los tres casos de uso; básica completa (ícono, privacidad, términos,
      eliminación de datos, categoría, dominios, plataforma web)
- [ ] Inicio de sesión para empresas: URI, dominio del SDK, **SDK JS en Sí**,
      configuración del registro insertado desde la plantilla
- [ ] Verificación de proveedor + de acceso (landing que muestre el producto)
- [ ] **Asistente de registro "Independent Tech Provider" terminado (1 de 2)**
- [ ] Webhook verificado; `smb_message_echoes`, `history`, `smb_app_state_sync`
      prendidos
- [ ] En el código: `fedCM: false` y callback de `FB.login` NO async
- [ ] Revisión: solicitud limpia, 2 videos, 2 llamadas contadas, textos, datos,
      cuenta de revisión que VE el botón
- [ ] Enviada → aprobada → republicada → conectar número real

## Anti-patrones

- **Despublicar o cambiar permisos "a ver si era eso"** antes de leer la URL del
  diálogo. Despublicar tiene costo (renovación de hasta 10 días).
- **Creer que "verificado como proveedor" = listo.** Falta el asistente.
- **Grabar el video del registro insertado para la revisión.** No lo piden: piden
  mensaje y plantilla.
- **Usar el número real para los videos.** No se puede conectar antes de la
  aprobación; el de prueba de Meta existe para eso.
- **Pegar la sugerencia de IA de Meta** en los textos del uso permitido.
- **Mandar capturas con el token** del panel de pruebas.
- **Dejar en la solicitud permisos de canales que todavía no se construyeron**:
  cada uno pide video y traba el envío.
