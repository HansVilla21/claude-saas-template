# Skill: El dominio que envía pero no recibe (sin MX, las respuestas rebotan)

## Cuándo usar esta skill

- Montaste **envío transaccional o boletines** desde el dominio del cliente (Resend, SendGrid,
  Postmark, SES) y ya funciona.
- Estás por poner un `from:` con un dominio nuevo, o un `reply-to` que no verificaste.
- El cliente dice *"mandé el boletín pero nadie me contesta"* / *"un cliente dice que me escribió
  y no me llegó"*.
- El dominio es nuevo (comprado para el proyecto) y el cliente **no tenía correo antes**.
- Vas a **entregar** el sistema y el cliente va a operar el correo sin vos.

**Costo de no usarla:** en el CRM de Josué (verificado 2026-08-17), los boletines salían perfecto
desde `josue@jrminversiones.com`, pero el dominio **no tenía registros MX**. Cada persona que
respondió un boletín recibió un rebote y **Josué nunca supo que le habían escrito**. Los leads que
contestaron — los más calientes que existen — se perdieron uno por uno, en silencio.

---

## Por qué existe esta skill

**Enviar y recibir son dos sistemas distintos y los registros DNS son distintos.**

- **Enviar** necesita SPF, DKIM y (opcional) DMARC. Tu proveedor te los da y te marca el dominio
  como "verificado". Ese verde dice *podés enviar*.
- **Recibir** necesita **MX**. Sin MX no hay servidor de correo: quien te escriba recibe un rebote
  duro ("no se pudo entregar") y **vos no te enterás de nada** — el rebote va para el remitente.

El proveedor de envío **no te avisa**. Su tablero está verde porque su trabajo está hecho.

Y el momento en que esto duele es exactamente el peor: el correo con más intención de compra que
vas a recibir en el mes es la **respuesta a tu boletín**. Es la única que rebota.

> Segunda razón, más incómoda: la conversación con el cliente. "El sistema no puede enviar" es
> falso — envía bien. Lo que falta es un **buzón**. Si no lo separás, el cliente cree que
> construiste algo roto.

---

## Proceso

### 1. Verificar, no suponer (30 segundos)

```bash
nslookup -type=MX midominio.com
nslookup -type=TXT midominio.com          # SPF / verificación del proveedor
nslookup -type=TXT resend._domainkey.midominio.com   # DKIM (ajustar al proveedor)
```

Sin respuesta en MX → **el dominio no recibe correo.** No hay ambigüedad.

Hacelo **el mismo día** que verificás el dominio para enviar. Es la otra mitad del mismo trabajo.

### 2. Presentarle al cliente las tres opciones (no una)

Las tres frenan el rebote. Se eligen por **cuánto quiere operar dentro del sistema**:

| | Qué es | Costo | Tiempo | Cuándo |
|---|---|---|---|---|
| **1. Reenvío** | Cloudflare Email Routing: todo lo que llega a `x@dominio` se reenvía a su Gmail | gratis | ~30 min, sin código | Quiere **recibir ya**. Es el piso: siempre ofrecelo como puente. |
| **2. Casilla real** | Zoho (gratis) / Google Workspace (~$6/mes) | bajo | ~1 h | Quiere un buzón de verdad, con su app de correo, y responder desde el dominio. |
| **3. Bandeja en el sistema** | Cloudflare recibe → endpoint → tabla → UI de bandeja; responde desde el sistema reusando el proveedor de envío con `In-Reply-To` | **desarrollo** | días | Quiere la conversación **junto al lead**, en el CRM. |

Requisito de la 1 y la 3: el dominio tiene que estar en Cloudflare (o mover el DNS ahí).

### 3. Decir la parte que el cliente no sabe que tiene que preguntar

- **Los rebotes que ya pasaron NO se recuperan.** Apenas configures, para el sangrado de ahí en
  adelante; lo perdido está perdido. Decilo antes de que lo pregunte.
- El DNS propaga en minutos, no en días (con Cloudflare).
- La opción 3 es **una feature nueva**, con su propio trabajo: Worker + endpoint + tabla + UI +
  envío hilado. **Si el proyecto está en etapa de soporte, esto NO es soporte** — se cotiza aparte.
  Confundirlo es cómo un proyecto cerrado se vuelve trabajo gratis indefinido.

### 4. Activar el puente aunque la decisión grande quede pendiente

Si el cliente quiere la 3 pero hay que cotizarla, **la 1 se puede activar mientras tanto** (30
min, gratis) y deja de perder correos hoy. Que una decisión esté pendiente no es razón para seguir
rebotando.

### 5. Verificar recibiendo de verdad

Mandá un correo desde una cuenta externa a `x@midominio.com` y **confirmá que llegó** al destino
elegido. Un MX que resuelve no prueba que la entrega funcione.

---

## Output esperado

- Diagnóstico DNS explícito: envía **sí** / recibe **sí o no**, con la salida del comando.
- Las tres opciones sobre la mesa, con costo, tiempo y qué implica cada una.
- Si la decisión se posterga: el reenvío activado como puente, o dicho explícitamente que no.
- Prueba de recepción real, de punta a punta.
- Si es dev: cotizado aparte y por escrito.

---

## Gotchas / antipatrones

- 🔴 **Dar por hecho que un dominio verificado para enviar recibe.** Son dos cosas distintas.
- 🔴 **Tocar el MX/SPF del root de un dominio que YA tiene correo** (Google Workspace, Zoho). Los
  proveedores de envío usan un subdominio (`send.`, `mail.`) justo para no chocar. Chequeá antes
  de escribir un solo registro. (Ver `setup-correo-auth-saas`.)
- 🔴 **Construir la bandeja en el CRM porque suena mejor**, sin cotizarla y sin preguntar. Es la
  opción más cara y muchas veces el cliente con el reenvío está feliz.
- ⚠️ **Poner un `reply-to` que no existe.** Igual de malo: las respuestas mueren.
- ⚠️ **Decir "el sistema no puede enviar".** Envía. Falta el buzón. La distinción define si el
  cliente confía o no en lo que construiste.
- ⚠️ **No avisar que los rebotes viejos se perdieron.** Que se entere después es peor.

---

## Ejemplo concreto (CRM Josué R. Miranda, #13, 2026-08-17)

**Verificado:** `jrminversiones.com` **sin registros MX**. Los boletines salían por Resend desde
`josue@jrminversiones.com` sin problema. Cada respuesta rebotaba.

**Se presentaron las 3 opciones.** Josué se inclinó por la **3** (bandeja dentro del CRM), que es
**desarrollo extra fuera del soporte gratuito** → Hans lo cotiza aparte, no se construyó nada.
La **1** (reenvío a Gmail) quedó lista para activar en cualquier momento.

**Lo replicable:** el diagnóstico tomó 30 segundos (`nslookup -type=MX`) y explicó un problema que
el cliente vivía como "el sistema falla".

---

## Skills relacionadas

- `setup-correo-auth-saas` — la mitad de **enviar** (Resend + Supabase + Vercel), y cómo no pisar
  el correo existente del cliente.
- `ingesta-email-cloudflare-worker` — el patrón técnico de la opción 3.
- `reporte-de-traspaso-del-proyecto` — dónde queda anotado qué está resuelto y qué no.
