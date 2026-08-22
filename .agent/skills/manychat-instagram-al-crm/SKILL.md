# Skill: ManyChat (Instagram) → CRM sin API

## Cuándo usar esta skill

- Vas a conectar **ManyChat** (DMs de Instagram o Facebook) a un CRM/app propia para que **un contacto nuevo entre solo como lead**.
- El cliente **no quiere/puede pagar la API** de ManyChat (o el tier caro) y creés que sin eso no se puede. **Sí se puede.**
- Estás por "idear/construir" la integración desde cero — antes de eso, leé esto.

**Costo de no usarla:** en el CRM de Josué Miranda (2026-08) el reflejo fue *construir* un receptor que **ya existía y estaba desplegado**, y *proponer un patrón de tag* para el "una sola vez" cuando el disparador correcto ya lo resolvía. Se perdió tiempo en soluciones a problemas que no existían.

---

## La distinción que confunde a TODOS: API vs "Solicitud externa"

Son cosas distintas y el cliente casi siempre las mezcla:

| | **API de ManyChat** | **External Request / "Solicitud externa"** |
|---|---|---|
| Para qué | Que un sistema externo **controle** ManyChat (mandar mensajes, leer contactos) | Que ManyChat **empuje** datos hacia afuera desde un Flow |
| Dirección | Afuera → ManyChat (pull) | ManyChat → afuera (**push**, en tiempo real) |
| Para "nuevo lead al CRM" | **NO sirve** (haría polling, con delay) | ✅ **Esto es lo que se usa** |
| Plan | Tier con costo aparte | **Feature del Pro estándar** (~el plan por contactos) |

**Regla:** para "cuando escribe por primera vez, mandalo al CRM" **no toques la API**. Es el bloque **External Request** dentro de un Flow. Y **no le pidas al cliente su API token** — no hace falta y no se maneja.

> La API SÍ sirve para una cosa: un **backfill puntual** de los contactos viejos que ya están en ManyChat, una sola vez. Eso es otro pedido, no "los nuevos que escriben".

---

## Proceso

### 0. Verificá si el receptor YA existe (no reconstruir)

Antes de diseñar nada, `grep` por `manychat`/`webhook` en el repo. En Josué el `app/api/webhooks/manychat/route.ts` **ya estaba escrito, desplegado y correcto** — solo faltaba configurarlo. Probalo en vivo con `curl` (un POST sin secret debe dar **401**): confirma que está vivo sin escribir nada.

### 1. El receptor (webhook del lado del CRM)

Endpoint server-side, sin sesión, con cliente admin/service-role. Contrato mínimo:

- **Auth por secret compartido** en el header `x-webhook-secret`, comparado en tiempo constante contra `process.env.MANYCHAT_WEBHOOK_SECRET`. **Falla cerrado (401)** si el env no está o no coincide.
- **Payload flexible:** `{ name?, username?, phone?, email?, message? }`. Exigir **al menos uno** de name/username/email/phone → si no, `400 empty payload`.
- **Idempotente** (red de seguridad, aunque el trigger ya garantice una-vez): buscar lead existente por `email` → `phone` → handle IG (marcador `IG: @handle` en `notes`, con `ilike`). Si existe → actualizar último contacto, **no duplicar**. Si no → insertar con `source_id='instagram'`, `stage_id='nuevo'`, y `IG: @handle · Primer mensaje: …` en `notes`.
- **Nunca crashear:** ante error de DB responder `200 {ok:false}` para que ManyChat no reintente en loop (patrón onReceived).

### 2. El secret compartido: se INVENTA y va en los dos lados

La confusión #1 del cliente: *"¿de dónde saco el secret?"* — **de ningún lado**. No lo da ManyChat ni Vercel. Es una contraseña que **vos generás** y ponés **idéntica** en dos lugares:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

1. **Vercel** → Settings → Environment Variables → `MANYCHAT_WEBHOOK_SECRET` (Production) = ese hex.
2. **ManyChat** → header `x-webhook-secret` de la Solicitud externa = **el mismo** hex.

- Si ya hay uno viejo y nadie sabe cuál es → **no adivines: generá uno nuevo** y pisá los dos lados. Un secret de webhook es rotable sin romper nada (solo protege ese POST).
- El valor **nunca** va al repo ni al `.env` versionado. Solo vive en Vercel + ManyChat.
- 🔴 **Gotcha:** una env var nueva en Vercel **NO aplica hasta un redeploy.** Siempre redeployá después de setearla.

### 3. ManyChat: la "Solicitud externa" (External Request), campo por campo

Dentro del Flow, acción **Solicitud externa** → **Editar solicitud**:

- **Tipo de solicitud:** `POST`
- **URL:** la productiva (`https://<dominio>/api/webhooks/manychat`). Solo https.
- **Encabezados:** `Content-Type: application/json` y `x-webhook-secret: <el secret>`
- **Cuerpo (JSON/raw):** insertá las variables con el **selector de ManyChat** (no las escribas a mano):
  ```json
  { "name": "‹Full Name›", "username": "‹Instagram Username›", "message": "‹Last Text Input›" }
  ```
  En un DM de IG normalmente **no** hay email ni teléfono (se piden después) — con name + username + message alcanza.
- **Respuesta / Mapeo de respuesta:** **vacíos** (no necesitamos devolver nada a ManyChat).
- **Contacto para pruebas:** uno real, para el botón "Probar Solicitud".

### 4. El disparador: "Nuevo contacto" resuelve "solo el primer mensaje" de raíz

El reflejo es armar un tag `CRM_enviado` con una Condición para no reenviar. **No hace falta.** ManyChat tiene el disparador **"Se produce un evento de contactos → Nuevo contacto"**, que dispara **una sola vez por persona** (cuando alguien se vuelve contacto = te escribe por primera vez). Eso ES el "solo el primer mensaje", sin lógica extra.

- Usá el tag **solo** si el disparador tiene que ser "cualquier mensaje" (p. ej. ya hay un bot conversacional manejando los DMs y te colgás de ese flujo).
- Vigilá el **timing del "Last Text Input"**: en el instante de crear el contacto, el primer mensaje casi siempre ya está — pero si no llegara, el lead igual entra (con nombre y handle), solo sin el `Primer mensaje` en notas.

### 5. Verificar el secret SIN ensuciar datos

`curl` con el secret correcto pero **body `{}`** → debe dar **`400 empty payload`** (pasó la auth, no creó lead):

```bash
curl -sS -i -X POST https://<dominio>/api/webhooks/manychat \
  -H "Content-Type: application/json" -H "x-webhook-secret: <secret>" -d '{}'
```

- `400 empty payload` → secret OK, cero basura. ✅
- `401 unauthorized` → el header no coincide con Vercel, o faltó el redeploy.

⚠️ En cambio el botón **"Probar Solicitud" de ManyChat SÍ crea un lead real** (manda datos del contacto de prueba). Sirve para validar el circuito completo — pero **borrá ese lead** después (papelera).

### 6. Verificación real end-to-end

La definitiva: que un contacto **nuevo de verdad** (que nunca haya escrito) mande un DM y aparezca el lead con fuente Instagram. Si ya es contacto en ManyChat, el trigger "Nuevo contacto" **no** dispara (correcto: no re-crea gente vieja).

---

## Gotchas (cobrados en producción)

| Gotcha | Qué pasa | Fix |
|---|---|---|
| **Creés que necesitás la API** | La API es pull/control y cuesta; el cliente cree que sin ella no se puede | Es **External Request** (push, Pro estándar). Nunca pidas el API token |
| **Env var sin redeploy** | Seteás el secret en Vercel y sigue dando 401 | **Redeploy** siempre después de tocar env vars |
| **"¿De dónde saco el secret?"** | No existe "el correcto de antes" | Se **inventa** (`randomBytes`) y va idéntico en Vercel + ManyChat |
| **Secret viejo desconocido** | Se pierde tiempo buscándolo | Generá uno nuevo y pisá los dos lados (es rotable) |
| **Tag innecesario** | Armás lógica de `CRM_enviado` de más | El disparador **"Nuevo contacto"** ya es una-vez-por-persona |
| **"Probar Solicitud" ensucia** | Crea un lead real con datos de prueba | Verificá con `curl` + body `{}` (400). Borrá el lead de la prueba |
| **Reconstruir lo que existe** | Rehacés un webhook ya desplegado | `grep` primero + `curl` en vivo (401 = vivo) |
| **Body escrito a mano** | Las variables no se llenan → `empty payload` | Usá el **selector de variables** de ManyChat |

---

## Checklist para un cliente nuevo

- [ ] Cuenta de ManyChat en **Pro** con el Instagram conectado.
- [ ] Confirmar que el receptor `/api/webhooks/manychat` existe/está desplegado (`curl` → 401).
- [ ] Middleware excluye `api/webhooks` del auth (si no → 307 al login en vez de procesar).
- [ ] Generar el secret, ponerlo en **Vercel (Production)** + header de ManyChat, **redeploy**.
- [ ] Verificar con `curl` + body `{}` → `400 empty payload` (secret OK, sin basura).
- [ ] Flow: disparador **"Nuevo contacto"** → acción **Solicitud externa** (POST, URL, 2 headers, body con variables).
- [ ] **Publicar** el Flow (que quede LIVE).
- [ ] Prueba end-to-end con un contacto **nuevo real** → aparece el lead (fuente Instagram).
- [ ] **Borrar** el lead que generó "Probar Solicitud".
- [ ] Confirmar que el `Primer mensaje` quedó en las notas del lead.

## Output esperado

- Un Flow de ManyChat **LIVE**: "Nuevo contacto" → Solicitud externa al webhook, con el secret en el header.
- `MANYCHAT_WEBHOOK_SECRET` seteado en Vercel prod, verificado por `curl` (400 con body vacío).
- Un contacto nuevo de Instagram entra solo al CRM como lead, fuente Instagram, sin duplicar, sin tocar código.

## Ejemplo

**Input:** cliente con Instagram conectado a ManyChat Pro y un CRM propio en Next.js + Supabase que ya tiene el webhook `/api/webhooks/manychat`.

**Output:** el secret generado y puesto en Vercel + ManyChat (con redeploy), el Flow "Nuevo contacto → Solicitud externa" publicado, y cada persona nueva que manda un DM entra sola como lead con su nombre, handle y primer mensaje — **sin la API de ManyChat y sin escribir una línea de código**.

## Relacionado

- [[prospai-webhook-crm]] — mismo destino (leads al CRM por webhook), pero desde LinkedIn/PROSP; el patrón de raw-storage + idempotencia es más pesado allá.
- [[fathom-transcripciones-al-crm]] — otro webhook entrante al mismo CRM; firma Standard Webhooks en vez de secret simple.
- [[ycloud-webhook-to-supabase]] — el patrón de referencia para WhatsApp (firma HMAC), cuando se defina el proveedor.
- [[datos-reales-vs-seed-demo]] — qué hacer con el lead de prueba y la basura de test.
