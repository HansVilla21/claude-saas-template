# Skill: Salida a un CRM externo (lo que entra a tu CRM aparece solo en el del cliente)

## Cuándo usar esta skill

- Un cliente ya trabaja en **su** CRM (Zoho, HubSpot, Pipedrive, Bigin…) y pide que «todo lo que entra a nuestro CRM se pase al de ellos».
- Vas a mandar contactos a un CRM ajeno **en una sola dirección**: el tuyo manda y el otro es un espejo.
- El cliente ya tiene **contactos cargados y automatizaciones** en ese CRM, y no querés romper el trabajo que su equipo ya hace.
- Vas a hacer un **envío masivo** de los contactos que ya existían antes de conectar.
- Zoho CRM en particular: OAuth, búsqueda, propietario, enlace al registro y Lead borrado. Todo está medido contra una cuenta real (paso 9).

## Por qué existe esta skill

Capturada el 2026-10-07. Se conectó el CRM de Momentum al Zoho CRM de un cliente inmobiliario. Diseño, plan, 13 tareas, una revisión final y la prueba real tomaron dos días. Lo que costó **no fue el código**. Fue lo que solo aparece contra la cuenta viva del cliente:

| Lo que se suponía | Lo que pasó contra su Zoho |
|---|---|
| El enlace `crm.zoho.com/crm/tab/Leads/<id>` abre el Lead | Abre el **inicio** de Zoho: le falta el número de organización. Ese número no se puede leer con los permisos pedidos (`/org` da `OAUTH_SCOPE_MISMATCH`) |
| Actualizar un Lead borrado da 404, o `INVALID_DATA` en `data[0]` | Da **400** `{"code":"INVALID_DATA","details":{"resource_path_index":1}}`, **suelto** y no dentro de `data`. El código lo tomó como dato rechazado y el contacto quedó como «Falló» en vez de recrearse |
| La fuente «WhatsApp» existe en su lista | No existía, y la Fuente de Lead era **obligatoria** en su diseño. Sin ella, cada creación falla. Tenían una opción parecida con otro nombre |
| Mandar los contactos viejos es solo apretar un botón | Su Zoho tenía **reglas activas al crear un Lead**: un SMS (SMS Magic), un aviso al dueño y una «Fecha de Captación». A 85 contactos viejos les iba a llegar un SMS |
| Un mensaje nuevo de un contacto existente lo sincroniza | No cambia ningún dato del contacto, así que no se manda. La prueba tiene que hacerse **desde un número que nunca escribió** |
| «La mayoría no tiene vendedor, va al de respaldo» | Medido: de 74 contactos sin vendedor en la ficha, **70 tenían vendedor en la conversación** |

Antes de abrir el PR, un revisor nuevo encontró 5 problemas importantes que las pruebas del plan no cubrían (paso 6). El más caro: **una lectura de la base que falla se tomaba como «no hay datos»**. Eso mandaba el contacto con otro dueño o sin etiquetas, creaba duplicados y marcaba la conexión como rota con el token sano.

> La idea central: **el código lo escribís una vez; lo que te frena es la cuenta del cliente.** Leé su configuración por la API antes de prometer (obligatorios, listas, reglas), probá cada camino contra su cuenta real, y nunca toques lo que su equipo ya tiene: elegí entre sus opciones, no le agregues.

## Proceso

### 1. Una sola dirección, y que quede escrito

- **Solo salida.** Si va de ida y vuelta, hay dos fuentes de verdad: el equipo mueve el Lead allá, el bot lo mueve acá, y se desincronizan sin que nadie lo note.
- Si el cliente pide la otra dirección, es **otro proyecto** (un webhook de entrada, ver `prospai-webhook-crm` / `fathom-transcripciones-al-crm`).
- Si la integración fue una **promesa de venta**, que quede en la orden de servicio. Si los términos dicen que reemplazan todo entendimiento previo, la promesa de palabra se borra.

### 2. Preguntar lo mínimo, y medir el resto por la API

**Al cliente solo:**
- qué producto usa (Zoho CRM y Zoho Bigin tienen APIs distintas);
- a qué módulo va (Leads o Contactos);
- cuándo (apenas escriben, o con un botón);
- quién es el dueño cuando nadie lo atiende;
- con qué usuario se conecta.

**Lo demás se lee de su cuenta apenas conecta**, en vez de pedir capturas:
- campos y diseño de la ficha: qué es **obligatorio**. En Zoho, `/settings/fields` **no marca todos los obligatorios**; `/settings/layouts` sí (`sections[].fields[].required`).
- valores de las listas (Fuente de Lead, «Medio Digital»…) y si un campo es lista o texto.
- usuarios **activos** (`/users?type=ActiveConfirmedUsers`), para emparejar vendedores por correo.

### 3. La arquitectura: cola por contacto + cron + reintentos

Es la misma que «Eventos a Meta» (`eventos-a-meta-desde-crm-whatsapp`):

- **Triggers** en las tablas que cambian lo que se manda (contactos, etiquetas, conversaciones). Escriben **una fila por contacto** en una cola (`*_pendientes`) con `marcado_at = clock_timestamp()`. Con `now()`, dos cambios en la misma transacción no mueven la marca. Los triggers solo miran las columnas que viajan: si no, cada mensaje encola.
- **pg_cron cada minuto → pg_net → una ruta** con un secreto compartido que vive en Vault. Si no hay nada pendiente, no se llama a la ruta.
- **Tomar con `for update skip locked`** y reservar el próximo intento antes de mandar (backoff de 1, 5, 15 y 60 min), así dos corridas no mandan lo mismo.
- **Cerrar comparando la marca:** se borra el pendiente solo si `marcado_at` no cambió. Si alguien tocó el contacto mientras se mandaba, se vuelve a encolar. **Esto vale también al dar un envío por perdido** (a las 24 h o por un rechazo definitivo). Borrar por id se lleva puesto el cambio nuevo.
- **Errores:**
  - permiso revocado → «conexión cortada», aviso al dueño y se deja de intentar con ese negocio;
  - dato rechazado → falla definitiva al instante, sin 24 h de reintentos;
  - 5xx o caída → se reintenta.

### 4. OAuth sin agujeros

- `state` **firmado** (HMAC), atado al negocio y al usuario, con vencimiento. El callback vuelve a comprobar que quien vuelve es admin de ESE negocio.
- **Validar los dominios que devuelve el proveedor contra una lista cerrada.** El callback de Zoho trae `accounts-server` y el token trae `api_domain`. Un patrón abierto como `accounts\.zoho\.[a-z.]+` aceptó `accounts.zoho.com.evil.io`: le hubieras mandado el código a otro host. En Zoho, la lista es de sus centros de datos: `com|eu|in|com.au|com.cn|jp|ca|sa|uk`.
- Refresh token en **Vault**, cifrado por negocio. El access token dura 1 h: **guardalo y reusalo**, porque Zoho corta con más de ~10 renovaciones cada 10 minutos.
- En Zoho, un refresh revocado responde **200** con `error: invalid_code`. Mirá el cuerpo, no el status.
- Conectá con un **administrador** que se vaya a quedar en la empresa. Con un usuario común, la búsqueda no ve todos los registros y duplicás Leads.

### 5. Qué se manda y cómo

- **Sin duplicar:** buscar por los últimos 8 dígitos del teléfono y por correo. `204` es «sin resultados»: una lista vacía, no un error de JSON. En Zoho, `phone=` se comporta como «contiene»: **volvé a verificar el número en tu código**. Un Cliente que ya existe allá no se toca. El registro que guardaste gana sobre la búsqueda.
- **Propietario:**
  - el vendedor que atiende el contacto, **tomado de la conversación asignada más reciente** (no solo del campo de la ficha), emparejado por correo con un usuario de su CRM;
  - el **dueño de respaldo se usa solo al CREAR**;
  - al actualizar, si acá nadie lo atiende, no mandes Owner. Un Lead que su equipo ya asignó no se mueve al usuario de respaldo.
- **Nombre:** el confirmado, partido en nombre y apellido. Si no hay, el **perfil de WhatsApp completo + el número** en el campo obligatorio (`Ana Qq · 8888 1234`), con tope de 80 caracteres cortando el perfil y nunca el número. Solo al crear: así no se pisa lo que su equipo corrige a mano.
- **Listas:** mandá el valor **exacto** de su lista. Si no está el que esperabas, **elegí entre los que ya tienen**: agregar opciones a su CRM cambia su trabajo y sus reportes.
- **Campos propios** («Estado», «Etiquetas», «Enlace a la conversación»): se buscan **por etiqueta**, porque el nombre de API lo inventa el CRM al crearlos. Las etiquetas van como texto: Zoho One limita las etiquetas nativas a 5 por registro.

### 6. Una lectura que falla NO es «no hay datos»

Revisá **cada** `const { data } = await …` del camino de envío. Si no mira `error`, la falla se convierte en dato:

| Lectura que falla | Si se toma como «vacío» |
|---|---|
| El contacto | Se da por borrado y el cambio no llega nunca |
| Conversaciones / etiquetas | Otro dueño, etiquetas borradas, **y se registra como éxito** |
| Vendedores | Todo va al dueño de respaldo |
| «Ya lo mandé» (el registro guardado) | Se crea un **duplicado** |
| La config o el token en Vault | «Conexión cortada» y aviso a todos, con el token sano |
| Miembros, en la pantalla de configuración | Se **borran** las parejas de vendedores |

Arreglo: `if (error) throw new Error(...)`, un error común que se reintenta. Reservá «conexión cortada» para cuando la lectura funcionó y el dato de verdad no está. Para probarlo, armá un cliente de Supabase falso que conteste `{ error }` en la tabla que elijas, y cambiá las importaciones del cliente a `import type` para que la prueba no conecte.

### 7. La pantalla solo dice «Todo listo» si es verdad

La revisión de su CRM tiene que avisar:
- campos propios que faltan;
- un valor de lista que no existe;
- **obligatorios que no mandás siempre** (Nombre, Móvil, Correo: hay contactos que no los tienen);
- una lista sin los valores que mandás;
- falta de dueño de respaldo;
- un respaldo o una pareja elegida a mano que **ya no es usuario activo**.

Un «Todo listo» falso es peor que no tener revisión: el error aparece recién en el envío, contacto por contacto.

### 8. Las automatizaciones del cliente, antes del envío masivo

Abrí sus **reglas de flujo de trabajo** del módulo, solo las activas:
- **Al crear:** un SMS, un aviso al dueño, una «fecha de captación». ¿Qué le harían a contactos de meses atrás?
- **Correos automáticos:** antes de preocuparte, contá cuántos contactos tienen correo. Medido: 0 de 88. Una regla de correo sin destinatario no hace nada.

**La regla que quedó:** los contactos que **ya existían antes de conectar** (`contacto.created_at < conectado_at`) se crean con `trigger: []` y Zoho no corre sus reglas. Los que entran después las disparan, como cualquier Lead que les llega por otro lado.

Verificá que de verdad no corrieron. Elegí un campo que una regla llena, como «Fecha de Captación», y comprobá que quedó vacío en los Leads creados.

### 9. Datos de la API de Zoho CRM v8, medidos contra una cuenta real

- **Enlace al registro:** `https://crm.zoho.<dc>/crm/EntityInfo.do?module=Leads&id=<id>`. Zoho completa la organización y abre el registro. `crm/tab/Leads/<id>` sin `org<N>` cae en el inicio.
- **Registro borrado:**
  - `PUT /Leads/<id>` → 400 `{"code":"INVALID_DATA","details":{"resource_path_index":1}}` en la raíz del JSON. Tratalo como «no existe»: olvidá el registro guardado, buscá de nuevo y creá.
  - `GET` del mismo → 204.
  - Un `INVALID_DATA` de un **campo** trae `details.api_name` y sí es un rechazo.
- **Sin reglas:** `POST /Leads` con `{ "data": [...], "trigger": [] }`. Sin `trigger`, corren las reglas de flujo.
- **Alcances que alcanzaron:** `ZohoCRM.modules.leads.ALL`, `ZohoCRM.modules.contacts.READ`, `ZohoSearch.securesearch.READ`, `ZohoCRM.users.READ`, `ZohoCRM.settings.fields.READ` y `ZohoCRM.settings.layouts.READ`. Ninguno lee la organización.
- Las respuestas no traen ningún encabezado con la organización.

### 10. Probar en producción, camino por camino

Usá un número que **nunca le escribió** al negocio, y avisale al cliente antes.

| Prueba | Qué se espera |
|---|---|
| Alguien nuevo escribe | Creado en menos de 1 min, con fuente, estado, enlace y dueño correctos |
| Cambiar estado, agregar etiqueta y reasignar | Un solo envío, `actualizado`, y el dueño cambia |
| Borrar el registro allá y cambiar algo acá | Se vuelve a crear (si dice «Falló», el error de «borrado» no es el que suponías: paso 9) |
| El enlace «Ver en…» | Abre ese registro, no el inicio |
| Envío masivo | Contar antes cuántos van. Después: creados + actualizados = total y 0 fallos. Los «actualizados» de más son los que ya existían allá: **no se duplicaron** |

**Lectura de verificación:** leé su CRM con el token guardado, con un script que solo hace GET y no imprime el token ni teléfonos completos. Es más rápido y más exacto que pedir capturas.

**Limpieza:** borrá allá los registros de prueba, y sacá tus contactos de prueba de tu CRM **antes** del envío masivo o vuelven a viajar. Antes de decirle al founder «mandalos a la papelera», **verificá que tu CRM tenga papelera de contactos**. En este no la tenía.

### 11. Operación

- Variables de la app y del cron en Vercel (production + preview), cargadas por la API sin imprimir valores.
- Las 2 llaves del cron en Vault, comprobadas por huella contra el `.env`.
- La vista previa de Vercel puede estar detrás de un login. La prueba de que la variable llegó se hace en producción: el cron con un secreto equivocado da **401** si la variable está y **503** si falta.

## Output esperado

- La integración en producción, con la pantalla de configuración visible solo para el negocio que la tiene.
- Una tabla de prueba como la del paso 10, con los números reales, en el ticket y en el backlog.
- Los hallazgos contra la cuenta real, anotados como decisiones (qué se midió y qué se cambió).

## Ejemplo

**Input:** «Un cliente pide que todo lo que entra a nuestro CRM se pase a su Zoho. Ya tengo acceso, pero no sé qué hacer.»

**Output:**
1. Spec aprobado: Leads, apenas escriben, estado y etiquetas en campos propios, dueño = el vendedor emparejado, y un usuario general de ventas como respaldo.
2. Plan de 13 tareas, revisión final, 5 arreglos con prueba.
3. Conexión, y la pantalla avisa: la fuente «WhatsApp» no existe y falta el dueño de respaldo. Se eligen una opción que ya tenían y el respaldo.
4. Prueba real: creado a los 17 s; 3 cambios en un envío. Dos arreglos medidos contra su cuenta: el Lead borrado y el enlace.
5. Envío masivo sin reglas: 78 creados, 10 actualizados (7 ya existían), 0 fallos, 88 de 88, y «Fecha de Captación» vacía.
