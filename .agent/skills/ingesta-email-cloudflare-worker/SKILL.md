# Skill: Ingesta por correo (Cloudflare Email Routing → Worker → Edge Function)

## Cuándo usar esta skill

- Tu app necesita **recibir correos y procesarlos** automáticamente: reenvíos de notificaciones (banco, recibos), tickets de soporte, alertas — y convertirlos en filas estructuradas.
- Querés **evitar la API de Gmail** (scopes restringidos → verificación CASA, cara y lenta) usando **reenvío (forwarding)**.
- Necesitás que sea **por usuario**, **idempotente** (no duplicar) y que **nunca bote** un correo (lo que no se parsea cae a revisión, no al vacío).
- Tenés un dominio en **Cloudflare** y backend en **Supabase**.

## Por qué existe

Leer Gmail por API exige *restricted scopes* + auditoría CASA (US$ y meses) para un SaaS público. El **forwarding** lo esquiva: el usuario reenvía los correos a una dirección tuya, Cloudflare los recibe, un **Email Worker** los pasa a una **Edge Function** que parsea e inserta. Captura automática y continua, sin API de Gmail, sin tocar contraseñas.

## Proceso

### 1. Routing key por usuario (inadivinable)
Columna en `profiles`: `ingest_token` único y aleatorio (generado con `gen_random_uuid()` → 32 hex, ver skill `auth-supabase-google-nativo` por el gotcha de pgcrypto). La dirección de ingesta de cada usuario es `u_<ingest_token>@tudominio.com`. **Inadivinable** = nadie puede inyectar datos falsos en la cuenta de otro.

### 2. Cloudflare Email Routing
- Activar Email Routing en el dominio (agrega los MX). 
- **Catch-all → Send to a Worker** (apuntando al worker `email-ingest`). Así *cualquier* `…@tudominio.com` cae en el worker, que enruta por el token.
- ⚠️ El catch-all manda **TODO** al worker. Si necesitás una dirección humana (ej. `hola@tudominio.com`), creá una **regla específica** (reenviar a tu Gmail) — las reglas específicas tienen prioridad sobre el catch-all.

### 3. Email Worker (extrae y reenvía a la Edge Function)
```js
import PostalMime from "postal-mime"; // parsea MIME en el Worker
export default {
  async email(message, env) {
    try {
      const chunks=[]; const r=message.raw.getReader();
      for(;;){ const {done,value}=await r.read(); if(done)break; chunks.push(value); }
      const email = await PostalMime.parse(await new Blob(chunks).arrayBuffer());
      await fetch(env.INGEST_URL, {
        method:"POST",
        headers:{ "Content-Type":"application/json", "x-ingest-secret": env.INGEST_SECRET },
        body: JSON.stringify({ to: message.to, from: (email.from&&email.from.address)||message.from, subject: email.subject, html: email.html, text: email.text }),
      });
    } catch(e){ console.log("email-ingest error:", e.message); } // nunca rechazar el correo
  }
};
```
Deploy con wrangler + `workers_dev = false` (un Email Worker no necesita URL pública).

### 4. Edge Function (idempotente, nunca botar)
- Valida `x-ingest-secret` (ver `supabase-edge-function-secret-auth`).
- **Routing:** del `to` extrae el token → busca el `user_id` por `ingest_token`. Si no matchea → ignora (no es de un usuario).
- **Idempotencia:** `content_hash` del correo → insert en `ingestion_events` con `unique(user_id, content_hash)`; si choca → duplicado, salir.
- **Parsear:** si truena o falta un campo → status `needs_review` (NUNCA botar). 
- **Dedup de negocio:** `dedup_key` (ej. `tarjeta|monto|fecha|comercio`) único → evita duplicados del propio emisor.
- Insertá la fila; linkeá el `ingestion_event`.

### 5. Capturá las confirmaciones (clave para el onboarding)
Cuando el usuario activa el reenvío, el proveedor (Gmail) manda un **código de confirmación** a la dirección de ingesta. Detectalo (sender `forwarding-noreply@google.com`) y guardalo para mostrárselo en la app → elimina el punto donde más gente abandona.

## Output esperado
1. Dirección de ingesta única por usuario (`u_<token>@dominio`).
2. Correos entrantes → transacciones/filas estructuradas, automático.
3. Idempotente (no duplica) y sin pérdidas (lo dudoso → `needs_review`).
4. El código de confirmación de reenvío capturado y mostrado al usuario.

## Ejemplo concreto (Mi Menudo, mimenudo.com — producción 2026-06-18)
- Reenviás un correo del BAC a `u_<token>@mimenudo.com` → Cloudflare Email Routing (catch-all) → Worker `email-ingest` (postal-mime) → Edge Function `ingest-bac` → parsea, categoriza, convierte moneda, deduplica → inserta. Probado en vivo (USD/FX, reversos, AMEX, declinadas ignoradas, malformados → needs_review).
- Núcleo de parseo reutilizable en `_shared/bac-core.mjs`, importado por la Edge Function (Deno) y los tests (Node).

## Gotchas / antipattern
- **NO** dejar una dirección humana (hola@) sin regla específica → el catch-all se la come.
- **NO** usar un token de ingesta adivinable → riesgo de inyección de datos falsos.
- **NO** botar un correo que no parsea → `needs_review`, siempre.
- **NO** olvidar `content_hash` (idempotencia) + `dedup_key` (duplicados del emisor).
- **NO** rechazar el correo en el Worker ante un error (logueá y seguí).
- **NO** enviar correos salientes desde la raíz si ya recibe por MX → subdominio de envío (ver `auth-supabase-google-nativo`, sección SMTP).

## Skills relacionadas
- `supabase-edge-function-secret-auth` — la validación del secret del endpoint.
- `auth-supabase-google-nativo` — el `ingest_token` y el SMTP de envío.
- `async-job-pattern` — si el procesamiento pesa, encolá en vez de procesar en el request.
