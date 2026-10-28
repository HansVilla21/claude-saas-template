# Skill: Avisos push en el celular sin app de tienda (PWA + Web Push)

## Cuándo usar esta skill

- El cliente pide que «me avise en el celular» cuando pasa algo en el sistema (un cliente escribe, una cita, un pase al equipo) **con el sistema cerrado**, y no hay app nativa ni ganas de publicar una en las tiendas.
- El sistema ya tiene una tabla de notificaciones (una campana) y querés que cada fila nueva salga también como push, sin escribir el envío en cada lugar que crea avisos.
- Alguien dice «prendí los avisos y no me llegan». Mirá la sección «Diagnóstico».

**Por qué existe.** Se construyó en el CRM de Momentum el 2026-10-28 (PRs #467 y #471 del CRM, migración 0168) y Hans lo verificó en un Android y en un iPhone. El código se escribe en una tarde. Lo caro fue lo que solo apareció con los celulares reales: un navegador que acepta todo y no muestra nada, un filtro propio que se comía el aviso de prueba, y la regla de iPhone de que solo funciona instalado.

> El código real está en `assets/`, con `<tu-dominio>` y `<tu-correo>` como marcadores: la migración, el service worker, el armado del aviso, el envío, la ruta y el cliente del navegador. La fuente viva está en `crm-v2/src/lib/push/`, `public/sw.js` y `src/app/api/cron/push/`.

---

## Proceso

### 1. Hacer que el sitio se pueda instalar

- **Manifest** (en Next 16, `app/manifest.ts` → `/manifest.webmanifest`):
  - `display: 'standalone'`, `start_url: '/'`, `scope: '/'`, `id: '/'`;
  - íconos de 192 y 512 (`purpose: 'any'`) y uno `maskable` de 512, con el logo dentro del 70 % central.
- **Para iPhone:** `appleWebApp: { capable: true, title }` en la metadata del layout (eso genera el `apple-touch-icon`).
- **Badge de Android:** un PNG blanco con transparencia (`/pwa/badge-96.png`). Android lo pinta de un color y usa solo la silueta: un logo a color sale como un cuadrado.
- **Los íconos se generan desde un PNG, no desde el SVG** del isologo. El SVG tenía un `</title>` suelto que rompía sharp, y otro dejaba una costura visible.

### 2. ⛔ Abrir esas rutas en el middleware de sesión

El navegador pide `/manifest.webmanifest` **sin cookies**, y `/sw.js` también se pide sin sesión. Si el proxy de login no los deja pasar, recibe el HTML de `/login`: el sitio no se puede instalar y el service worker no se registra. No sale ningún error que lo diga.

- Públicos: `/sw.js`, `/manifest.webmanifest` y `/pwa/` (los íconos).
- `/sw.js` va con `Cache-Control: no-cache, no-store, must-revalidate` (en `next.config.ts` → `headers()`). Sin eso, un celular puede quedarse con la versión vieja del service worker por horas. En el CRM, un arreglo del service worker (#471) llegó a los celulares en el próximo arranque.

### 3. El service worker: solo dibujar

`assets/sw.js`. No cachea nada ni intercepta pedidos: un caché viejo de pantallas hace más daño que el modo sin conexión.
- `install` → `skipWaiting()`; `activate` → `clients.claim()`.
- **`push`:** lee el JSON (con un texto de reserva si viene roto), pone el número sobre el ícono (`navigator.setAppBadge`, tope 99) y muestra el aviso.
- **`notificationclick`:** si ya hay una ventana del sitio, la enfoca y la navega. Si no, abre una (`openWindow`). Nunca abre algo de otro origen, aunque el aviso lo pida.
- **El texto y el destino los decide el servidor.** El destino sale de la MISMA función que usa la campana, así tocar el push lleva al mismo lugar que tocar la campana.

### 4. ⛔ El filtro de «ya lo está mirando»: con dos excepciones

Si la persona tiene el sistema abierto y a la vista, la campana ya le muestra el aviso y un banner encima lo repite. El service worker lo saltea con `clients.matchAll` + `focused && visibilityState === 'visible'`. **Ese filtro tiene dos excepciones obligatorias:**

1. **Safari** (iPhone y Mac) **revoca el permiso** si llega un push y no se muestra ningún aviso. Ahí se muestra siempre.
2. **El aviso de prueba.** Se pide desde la pantalla de configuración, o sea con el sistema abierto y a la vista. En el CRM, el Android recibía el push (FCM respondía 201) y el filtro lo tiraba: parecía que no llegaba. El aviso lleva `siempre: true` y el filtro lo respeta. **El botón de prueba es justamente para cuando la persona está mirando.**

### 5. La tabla de dispositivos

Ver `assets/0168_avisos_push.sql`.
- **`push_subscriptions`:** una fila por usuario **y dispositivo**, con `endpoint` único (`check ~ '^https://'`), `p256dh`, `auth`, `user_agent`, `last_failure_at` y `failure_count`.
- **RLS:** cada uno lee las suyas y ninguna policy de escritura. Revocar insert, update y delete a `authenticated`.
- **El alta y la baja van por server action con el cliente de servicio, y el usuario sale SIEMPRE de la sesión, nunca del navegador.** El alta es un upsert `onConflict: 'endpoint'` que pone los fallos en cero.

### 6. ⛔ Cada suscripción es de la cuenta con la que se inició sesión en ese navegador

En el CRM, Hans tenía una cuenta en el iPhone y otra en el Android. Un mensaje para una cuenta llega a un solo celular. Esto no es un error, pero hay que cerrar dos puertas:
- **Salir de la cuenta da de baja el dispositivo:** borrar la fila, después `unsubscribe()`, con un tope de 2 s para no trabar el «Salir».
- **Al abrir el sistema con OTRA cuenta en el mismo navegador,** la suscripción que quedó es ajena. Al montar, se le pregunta al servidor de quién es el `endpoint` (`'mio' | 'ajeno' | 'ninguno'`). Si no es tuyo, se suelta (y si es ajeno, se borra la fila). Si no, el celular de una persona recibe los avisos de otra.

### 7. El envío: un trigger que despierta a una ruta

**El trigger va POR SENTENCIA** (`referencing new table as nuevas for each statement`) sobre la tabla de notificaciones:
- Un mismo evento se reparte a todo el equipo (N filas en un INSERT), así que sale UN pedido y no N.
- Junta solo los ids cuyos dueños tienen algún dispositivo. Con cero suscripciones no sale ningún pedido.
- Manda **solo ids** con `net.http_post`. pg_net encola el pedido y lo manda **después del commit**, así que la ruta encuentra las filas, y no sale si el INSERT se deshace.
- **`exception when others` + `raise warning`:** el push nunca puede tumbar la notificación ni el mensaje que la creó.

**La ruta va protegida con un secreto que la migración GENERA en el Vault** (`gen_random_bytes(32)`). La ruta lo lee por un RPC solo de `service_role`: no hay variable que copiar ni secreto que se pueda filtrar al escribirlo. La URL de destino también vive en el Vault.

**Revocar EXECUTE también a PUBLIC** en las dos funciones (ver la skill `revocar-execute-incluye-public`).

La ruta (`assets/route.ts`) valida el body (`ids: uuid[]`, de 1 a 500), lee las notificaciones, los dispositivos y los no leídos en paralelo, y manda con `web-push` y VAPID (`TTL` de 12 h y `urgency: 'high'`).

### 8. Lo que contesta el servicio de push decide la fila

`assets/enviar.ts`.
- **404 o 410:** el dispositivo ya no existe (se desinstaló, se borraron los datos o se revocó el permiso). **Se borra la fila.** Reintentar es inútil para siempre.
- **Otra falla:** `failure_count + 1` y `last_failure_at`, y se sigue: puede ser pasajera.
- **Éxito después de fallos:** el contador vuelve a 0.

### 9. Las claves VAPID

- Se generan una vez con `webpush.generateVAPIDKeys()` y se cargan en la plataforma por API, en production y preview, sin imprimirlas en ningún lado.
- La pública va como `NEXT_PUBLIC_…`, porque el navegador la usa para `subscribe`. La privada, nunca.
- **Sin claves, la ruta responde 503 `vapid_no_configurado`** en vez de fallar callada.
- **El trigger apunta a producción:** el push real solo funciona con el código en producción. Un preview anota dispositivos, pero el envío lo hace la URL del Vault.

### 10. La pantalla: el permiso se pide recién al tocar

Ver `assets/cliente.ts`.
- **El permiso del sistema se pide SOLO en el clic del interruptor.** Pedirlo al cargar la página hace que el navegador lo bloquee para siempre.
- **Estados a mostrar:**
  - sin soporte: «en Android usá Chrome»;
  - iPhone sin instalar: la guía, en vez del interruptor;
  - permiso bloqueado: dónde destrabarlo, distinto en iOS y en Android, porque la página no puede volver a pedirlo;
  - listo: el interruptor más «Mandarme un aviso de prueba».
- **iPhone:** `esIOS()` tiene que contar también el iPad que se presenta como Macintosh con pantalla táctil. «Instalada» = `matchMedia('(display-mode: standalone)')` o `navigator.standalone`.
- **No duplicar con el aviso de escritorio viejo**, si existía uno que se dibujaba desde la página abierta: se calla cuando ese navegador ya tiene push. Un evento (`momentum:push-cambio`) le avisa al hook cuando se prende o se apaga.

---

## ⛔ Lo que solo aparece con celulares reales

| Lo que pasó | Cómo se veía | Qué es |
|---|---|---|
| **Navegador de Xiaomi (Redmi)** | El interruptor se prende, la fila se anota, **FCM responde 201**, el aviso nunca aparece | Ese navegador acepta la suscripción y no muestra el aviso. Con **Chrome** en el mismo celular, llegó. Se recomienda Chrome en Android (y probablemente pasa con otros navegadores de fábrica). |
| **iPhone en Safari, sin instalar** | No hay `PushManager` | iOS solo da push a un sitio **agregado a la pantalla de inicio desde Safari** y abierto desde ese ícono, con **iOS 16.4 o más nuevo**. El permiso se pide con un toque, dentro de la app instalada. |
| **Aviso de prueba en Android** | «Enviado» en la pantalla, y nada en el celular | El filtro de «ya lo está mirando» (paso 4). |
| **Dos cuentas, dos celulares** | «Le llegó al iPhone y no al Android» | Cada dispositivo es de la cuenta con la que se inició sesión ahí (paso 6). |

**Moraleja:** «FCM respondió 201» prueba que el servicio de push recibió el aviso, no que el celular lo mostró. La única verificación que cuenta es la persona mirando su celular **con el sistema cerrado**, y tocar el aviso para ver que abre la pantalla correcta (`verificar-funcionamiento-end-to-end`).

## Diagnóstico: «prendí los avisos y no me llegan»

1. **¿El dispositivo está anotado?** `select left(endpoint,40), user_agent, failure_count, last_failure_at from push_subscriptions where user_id = …`. Si no hay fila, no lo prendió o salió de la cuenta.
2. **¿El envío salió?** Las respuestas de pg_net quedan en `net._http_response`: buscá el `content` con `"enviados"`. `{"enviados":1,"fallas":0}` dice que el servicio de push lo aceptó.
3. **¿Qué navegador?** En Android, que sea Chrome. En iPhone, que esté instalado y abierto desde el ícono.
4. **¿De qué cuenta es el aviso** y con qué cuenta inició sesión en ese celular?
5. **¿Tenía el sistema abierto y a la vista?** Ahí no se repite el aviso (salvo en Safari y en la prueba). Es a propósito.

## Cómo se probó

- **La migración, con el bloque que siempre aborta** (`probar-migracion-contra-base-viva-con-rollback`), 13 controles:
  - un INSERT de una notificación genera **un** pedido, solo con los ids que tienen dispositivo;
  - una notificación de alguien sin dispositivos genera 0 pedidos;
  - tres en un INSERT generan un pedido con los 3 ids;
  - **control negativo:** con el trigger borrado dentro del bloque, 0 pedidos;
  - RLS: cada usuario ve solo la suya, y un insert directo da `42501`;
  - el secreto no se puede ejecutar como anon ni como authenticated, y como service_role sí.

  Los pedidos se cuentan en `net.http_request_queue` antes y después, dentro de la misma transacción.
- **La pantalla a 375 px**, con la medición de desborde del proyecto.
- **En producción:** la ruta respondió `{"notificaciones":1,"enviados":1,"borrados":0,"fallas":0}` con mensajes reales de clientes.
- **La prueba que cierra:** con el sistema cerrado, el aviso de una notificación real le llegó a Hans al Android (Chrome) y al iPhone (instalado), y al tocarlo «sí se abrió el chat».

## Output esperado

- El sitio se puede instalar en Android e iPhone, con ícono propio.
- Cada fila nueva de notificaciones sale como push a todos los dispositivos de su dueño, sin tocar los lugares que crean avisos.
- Una pantalla «Avisos en este celular» por dispositivo, con prueba.
- Las suscripciones muertas se limpian solas.
- Una novedad para los usuarios, si el proyecto las tiene.

## Ejemplo

**Input:** «Quiero que a los vendedores les suene el celular cuando entra un lead, aunque no tengan el CRM abierto. No quiero sacar una app».

**Output:**
- La migración de `assets/` adaptada a la tabla de avisos del proyecto. Se prueba con el bloque que aborta y se aplica con OK.
- `sw.js`, el manifest, los íconos y las rutas públicas en el middleware.
- La ruta de envío con VAPID cargado en la plataforma.
- La tarjeta en el perfil, verificada a 375 px.
- Al probar con los vendedores:
  - a quien usa Android se le pide Chrome;
  - a quien usa iPhone se le guía para agregarlo a la pantalla de inicio desde Safari;
  - la prueba que vale es con el CRM cerrado, tocando el aviso.
