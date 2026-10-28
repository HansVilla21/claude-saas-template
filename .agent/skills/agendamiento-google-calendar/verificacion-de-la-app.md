# Verificar la app de Google (permiso sensible `calendar.events`)

Capturado el 2026-10-28, al abrir la agenda del CRM a todos los negocios. Se envió con Hans
pantalla por pantalla. Lo que sigue son los pasos que funcionaron y los tropiezos que costaron
una vuelta.

## Cuándo hace falta

- **Mientras la app tenga solo a la gente del equipo conectada,** alcanza con dejarla «En producción» sin
  verificar. El token NO vence por no estar verificada; vence por estar en «Testing» (ver `SKILL.md`).
- **Cuando la conectan clientes,** hace falta verificarla. Sin verificar, cada persona ve:
  - «Google no verificó esta app» y tiene que entrar por «Avanzado» → «Ir a … (no seguro)»;
  - no se ve el nombre ni el logo de la app;
  - hay un tope de 100 personas.

  Ese cartel asusta justo en el momento en que el cliente está conectando.

## Antes de enviar: 4 cosas que Google revisa y el panel no avisa

1. **La política de privacidad tiene que nombrar a Google.** Lleva una sección que diga qué datos del
   calendario se leen, qué se guarda y qué no, cómo se desconecta y la declaración de **Uso Limitado**
   («…adheres to the Google API Services User Data Policy, including the Limited Use requirements»).
   En el CRM fue una sección «5. Datos de Google Calendar» en `/privacy` (PR #469).
2. **La página principal declarada tiene que enlazar a ESA misma política.** La página principal era la
   del sitio (`momentum-lab-ai.com/crm`) y su pie enlazaba a `/privacidad`, que es la política del sitio
   y no la del CRM. Hubo que cambiar ese enlace en el repo del sitio.
3. **El dominio tiene que estar verificado en Search Console con la misma cuenta.**
   - Se agrega como propiedad de tipo **«Dominio»** (no «Prefijo de la URL»).
   - Google da un registro TXT `google-site-verification=…`.
   - **Antes de mandar a nadie a Cloudflare, mirá quién sirve el DNS:** `nslookup -type=NS dominio`.
     Acá eran `ns1.vercel-dns.com`, así que el TXT va en Vercel › Domains › DNS Records, con
     Name vacío, Type TXT y el valor.
   - La API de Vercel puede dar 403 al crear el registro si el dominio es de otra cuenta. En ese caso
     lo carga el dueño desde el panel. Es un minuto.
   - Se verifica al toque. La pantalla vuelve con `after_verification_success` en la URL.
4. **En «Acceso a los datos» van solo los permisos que se usan.** Quedaba cargado
   `calendar.events.freebusy` de un diseño anterior. Cada permiso que sobra es una pregunta más
   del revisor, así que se saca.

## En Google Cloud (todo en Google Auth Platform)

- **Dónde está:** el menú izquierdo tiene Descripción general, Información de la marca, Público, Clientes,
  Acceso a los datos, Centro de verificación y Configuración. Link directo a la marca:
  `console.cloud.google.com/auth/branding`. Desde el menú ☰ se llega por APIs y servicios › Pantalla
  de consentimiento de OAuth. Quien no lo conoce se pierde en el primer paso, así que dale el link.
- **Información de la marca:** la página principal, la privacidad, las condiciones, el dominio
  autorizado, el correo de asistencia y el contacto del desarrollador. **Sin logo:** con logo, Google
  suma la verificación de la marca y tarda más. El logo se agrega después.
- **Acceso a los datos › «¿Cómo se usarán los permisos?»:** el campo tiene un **tope de 1.000
  caracteres**. El texto del revisor va en inglés y dice:
  - qué es el producto;
  - las dos cosas para las que se usa el permiso (leer inicio y fin para no ofrecer horas ocupadas, y
    crear, actualizar y borrar el evento de cada cita invitando al cliente);
  - por qué freeBusy no alcanza (hay que saber si el evento lo creó la propia app y si fue rechazado);
  - qué NO se guarda (títulos, descripciones, asistentes);
  - que desconectar revoca y borra;
  - la frase de Uso Limitado.

  La versión que entró tenía 824 caracteres.

## El video (lo exige el permiso sensible)

De 2 a 3 minutos, subido a YouTube como «No listado». La regla que más se olvida: **en la pantalla de
permiso de Google tiene que verse la barra de direcciones con el `client_id`.**

Guion:
1. Desconectar antes de grabar.
2. Conectar el calendario, mostrando el `client_id` en la barra.
3. Aceptar el permiso.
4. Mostrar «Conectado como …».
5. Crear un evento «Busy» en Google.
6. Mostrar que la página de reservas no ofrece esa hora.
7. Reservar otra hora con un correo distinto del conectado y mostrar el evento con el invitado en Google.
8. Desconectar y mostrar que quedó desconectado.
9. Al final, reconectar y borrar lo de prueba.

Textos cortos en inglés en pantalla para el revisor: «Busy times from Google are not offered»,
«Disconnecting revokes access and deletes stored data».

## Estado en el CRM (2026-10-28)

- **Hecho:**
  - la política con la sección de Google (#469);
  - el enlace del sitio (`momentum-ai` #3);
  - el dominio verificado en Search Console (TXT en el DNS de Vercel);
  - la información de la marca guardada;
  - `freebusy` sacado y la justificación guardada.
- **Falta:** grabar el video y enviar desde el Centro de verificación. Google responde por correo en días o
  semanas.
