# Skill: Agendamiento con Google Calendar

## Cuándo usar esta skill

- Un cliente quiere que sus prospectos **agenden solos** (tipo Calendly) sin pagar Calendly.
- Hay que leer o escribir en el **Google Calendar** de alguien desde una app.
- Aparece un **OAuth de Google** de cualquier tipo (calendario, Drive, login).
- Vas a mostrar **disponibilidad** de una persona en una página pública.

> Capturada el 2026-07-16 del CRM de Josué R. Miranda, donde se construyó y quedó
> en vivo en un día. Cross-project: los tres puntos que matan esto no tienen nada
> que ver con ese cliente.

## Proceso

### 1. Contar ANTES de construir

`select count(*) from appointments` — y contar el **material de los registros que
EXISTEN**, no de la tabla entera. (En Josué: los porcentajes de perfil daban 22%
porque estaban diluidos por 641 contactos borrados como leads meses antes. Sobre
los 57 vivos: 98%.)

### 2. Decidir de quién es el proyecto de Google Cloud

- **Tuyo:** un cliente OAuth sirve para todos los clientes. Ellos solo autorizan.
- **Del cliente:** la pantalla de permiso diría su nombre… **pero solo si verificás
  la app.** Sin verificar, Google **no muestra nombre ni logo** — o sea que el
  beneficio no aparece y el costo (que el cliente pelee 15 min con la consola) sí.

**Averiguar si hay Google Workspace ANTES de prometer nada** — se hace sin
molestar a nadie:
```bash
curl -s -H 'accept: application/dns-json' \
  "https://cloudflare-dns.com/dns-query?name=<dominio>&type=MX"
```
Sin registros MX → **no hay Workspace** → la app tiene que ser **External** y el
tipo "Internal" (que evita verificación y advertencias) **no existe** para ese caso.

### 3. Configurar Google Cloud (consola NUEVA — renombró todo)

1. Proyecto → habilitar **Google Calendar API**.
2. **"Acceso a los datos"** (antes "Scopes") → *Agregar o quitar permisos* →
   *Agregar permisos de forma manual* → pegar los **mínimos**:
   ```
   https://www.googleapis.com/auth/calendar.events
   https://www.googleapis.com/auth/calendar.events.freebusy
   ```
   Verificado contra la referencia oficial: `events.insert` acepta
   `calendar.events`, y `freeBusy.query` acepta `calendar.events.freebusy`.
   **NO pidas el scope `calendar` completo** (el que pide Calendly): se lee como
   *"ver, editar y borrar permanentemente todos tus calendarios"*.
3. **"Público"** (antes estaba en la pantalla de consentimiento) → **PUBLICAR** →
   *In production*. **⚠️ ESTE ES EL PASO QUE NO SE PUEDE SALTEAR** (ver Gotcha 1).
4. **"Clientes"** (antes "Credenciales") → *Crear cliente* → **Aplicación web** →
   URIs de redirección, **carácter por carácter, sin barra final**:
   - `https://<dominio-prod>/api/google/callback`
   - `http://localhost:<puerto>/api/google/callback`
   - **"Orígenes de JavaScript" va VACÍO**: nuestro flujo es de servidor, y eso es
     lo que mantiene el `client_secret` fuera del navegador. (Solo se llenan si
     después hacés login con el botón nativo de Google.)
5. Ignorar el cartel del crédito de $300: la Calendar API es gratis.

### 4. Guardar el refresh token CIFRADO

Nunca en el `.env`: el token es **por usuario**, no por deploy. Va en la base, en
una columna **fuera del alcance del cliente** (GRANT por columna) y **cifrada de
verdad** (AES-256-GCM). Si la columna se llama `_encrypted`, guardar texto plano
la convierte en una mentira.

La llave (`SECRETS_ENCRYPTION_KEY`, 32 bytes hex) va en el `.env` local **y en el
hosting, y tiene que ser LA MISMA**. Si se rota, los tokens ya guardados dejan de
descifrarse.

### 5. Calcular disponibilidad, y que sea PURO

```
horarios configurados − freeBusy de Google − citas propias − buffer = huecos
```
La función que calcula **no toca base ni red**: recibe config + bloqueos + `ahora`
y devuelve huecos. Es lo único que la hace testeable, y es la pieza que produce
dobles reservas si falla.

**La regla que gobierna todo:** un hueco ofrecido que está ocupado es MUCHO peor
que un hueco que existe y no se ofrece. Ante la duda, NO ofrecer.

### 6. Reservar en el orden correcto

1. **Revalidar el hueco contra la fuente.** Que el front lo mostrara no prueba
   nada: entre ver la lista y apretar el botón pasan minutos.
2. **Crear el evento en Google ANTES de guardar la cita.** Si Google falla, no
   queda una cita que el dueño nunca verá en su calendario.
3. Si el insert falla después → **borrar el evento**. Si eso también falla,
   **gritar en el log con el id** del evento huérfano.

### 7. Probar contra Google real, no contra un mock

El único test que vale: poner un evento en el calendario y ver que el hueco
desaparezca. **Predecir el número ANTES de mirar** — si no acierta, algo está mal.
Probar **los bordes**: el hueco que termina justo donde empieza el buffer tiene que
SOBREVIVIR; el que empieza un minuto antes de que el buffer termine, NO.

## Output esperado

- Migración: `meeting_url`, `duration_min`, `google_event_id`, datos de quien
  reservó, `source` ('crm' | 'publico').
- `lib/agenda/`: `google.ts` (OAuth + freeBusy + events), `slots.ts` (**puro**),
  `config.ts`, `tz.ts`, `booking.ts`, `cors.ts`.
- Dos endpoints públicos (service role, como los webhooks → **cero cambios a la
  RLS**) + una página de reserva + un widget autocontenido para embeber.
- Un test del cálculo de huecos que corra sin dependencias.
- Doc con: el paso a paso de Google Cloud, el contrato de los endpoints, y **qué
  está probado y qué no**.

## Gotchas (los que cuestan caro)

**1. ⚠️ "Testing" mata la agenda a los 7 días, en silencio.** Si la app de Google
queda en *Testing*, Google **vence el refresh token a los 7 días**. Todo funciona
durante la demo y un martes cualquiera deja de andar sin avisar. **Tiene que estar
PUBLICADA.** El cartel de "app no verificada" es OTRA cosa y no importa: verificado
contra la doc, **el vencimiento depende de "Testing", NO de la verificación**.

**2. El cartel rojo se dispara por request, no por proyecto.** Doc de Google:
*"esto se basa en los scopes específicos que tu app incluye en la solicitud"*. O
sea: un proyecto con scopes de Calendar puede hacer login con `openid/email/profile`
**sin mostrar la pantalla roja**. No hace falta un proyecto aparte para el login.

**3. El token NO depende del dominio.** La URI de callback solo importa **al
autorizar**. Si el token ya está en la base de producción, producción funciona
apenas tenga las variables — **no hay que reconectar**. (Igual registrá la URI de
prod: hace falta el día que alguien apriete "Conectar" desde ahí.)

**4. `access_type=offline` + `prompt=consent`, los DOS.** El primero pide refresh
token; el segundo fuerza la pantalla. Sin el segundo, si el usuario ya autorizó
antes, Google devuelve **solo un access token de una hora**: todo "funciona" en la
prueba y se muere 60 minutos después. **Si no vuelve refresh token, FALLAR y no
guardar nada.**

**5. `conferenceDataVersion=1` va en la QUERY.** Sin ese parámetro, Google ignora
el bloque de conferencia **en silencio** y el evento sale sin link de Meet.

**6. freeBusy con error → TIRAR, no devolver `[]`.** Un `[]` se lee como "está todo
libre" y es la mentira que produce dobles reservas. Y si no se puede calcular, un
calendario vacío **también miente** ("no hay horarios" cuando la verdad es "no
pudimos calcular"): que falle fuerte y lo diga.

**7. Hora local → instante, no al revés.** La mayoría de los repos tienen
"instante → hora local". Una agenda necesita la **inversa** ("atiendo de 9 a 12" es
hora de pared). No hardcodear el offset aunque el país no tenga horario de verano:
el error no falla, **corre las citas una hora** y nadie se entera.

**8. `Intl` mete un espacio invisible.** `toLocaleTimeString` produce U+00A0/U+202F
que cambia según la versión de ICU y **rompe la hidratación de React**. Comerlo con
`\s*` está bien — pero devolvé un espacio NORMAL, no lo pegues (`"9:00a.m."`).

## Ejemplo

**Input:**
"El cliente quiere que sus prospectos agenden desde la landing y que la reunión le
caiga en su Google con el link de Meet."

**Output (lo que pasó en el CRM de Josué, 2026-07-16):**

- MX del dominio → sin registros → **no hay Workspace** → app External, publicada,
  sin verificar. El cliente vio la pantalla roja **una vez**.
- Conectado en vivo. Calendario vacío → **105 huecos**. Se puso un evento de
  12:00–16:00 → **se predijo 101 antes de mirar** → **dio 101**, y ese día pasó de
  7 horarios a 3.
- Los bordes: el de 11:00 sobrevivió (termina 11:45 = borde exacto del buffer de
  15), el de 16:00 murió (el buffer tapa hasta 16:15).
- Reserva real desde la página pública → evento con Meet en el calendario del
  cliente → invitación al correo → **la cita se bloqueó a sí misma** (101 → 100) →
  al borrarla, volvió a 101.
- **Un bug que solo aparece así:** la hora salía pegada (`"9:00a.m."`). El bug
  estaba desde la primera migración del proyecto y **nunca se había visto porque la
  tabla de citas siempre estuvo vacía**. La primera reserva real fue la primera vez
  que esa función corrió.
