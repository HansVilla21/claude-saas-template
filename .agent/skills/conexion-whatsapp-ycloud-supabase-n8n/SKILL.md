# Skill: Montar la conexión WhatsApp (YCloud ↔ Supabase ↔ n8n) en un proyecto/cliente nuevo

## Cuándo usar esta skill

- Vas a conectar WhatsApp real a un proyecto Momentum AI CRM (un Supabase nuevo, un cliente nuevo, o migrar de un Supabase a otro).
- Necesitás entender CÓMO se cablea todo el sistema de mensajería: qué pieza recibe qué, dónde vive cada secreto, y qué hay que cambiar al mover el sistema a otro proyecto Supabase.
- Es el **runbook operativo** del montaje. El CÓDIGO de la Edge Function está en la skill `ycloud-webhook-to-supabase`; el de las tools del bot, en `supabase-edge-function-secret-auth`. Esta skill es el "cómo se arma todo junto y cómo se replica".

> ⚠️ **Seguridad:** esta skill usa SOLO placeholders. Los secretos reales (API keys, webhook secrets, service_role, access tokens) viven en `.env.local` (gitignored) y en los Secrets de las Edge Functions / n8n — **NUNCA en un archivo versionado, nunca en esta skill.**

## Arquitectura — quién recibe qué

YCloud es el BSP (proveedor oficial de WhatsApp Business). Soporta **múltiples webhook endpoints activos a la vez** y hace **fan-out**: manda CADA evento a TODOS los endpoints configurados. El v1 (Casa CRM) usa dos:

```
                                  ┌─────────────────────────────────────────┐
[Lead manda WhatsApp]             │  YCloud (cuenta + número del business)   │
        │                         │  - API key (enviar mensajes)             │
        ▼                         │  - Webhook secret (firma HMAC entrante)  │
  WhatsApp Business  ───────────► │  - N webhook endpoints (fan-out)         │
                                  └───────────────┬──────────────┬───────────┘
                                                  │ (mismo evento)│
                         ┌────────────────────────▼──┐   ┌────────▼────────────────────┐
                         │ Endpoint 1: Edge Function  │   │ Endpoint 2: n8n (el BOT)     │
                         │ <proj>.supabase.co/        │   │ <n8n-host>/webhook/<flow>    │
                         │   functions/v1/ycloud-     │   │                              │
                         │   webhook                  │   │ - Recibe el inbound          │
                         │                            │   │ - Arma prompt + llama LLM    │
                         │ PERSISTENCIA / CRM:        │   │ - Escribe respuesta en       │
                         │ - verifica HMAC            │   │   Supabase (service_role)    │
                         │ - guarda raw               │   │ - Envía al lead vía YCloud   │
                         │ - resuelve agency x número │   │   API                        │
                         │ - upsert lead/conv         │   │ - tools (handoff, extract…)  │
                         │ - insert message inbound   │   │   = Edge Functions con       │
                         │ - update status outbound   │   │   secret auth                │
                         └─────────────┬──────────────┘   └──────────────────────────────┘
                                       │ (INSERT/UPDATE messages, conversations, leads)
                                       ▼
                              ┌──────────────────┐
                              │ Supabase Postgres │ ──(Broadcast Changes)──► Inbox del CRM en vivo
                              └──────────────────┘
```

**Roles separados (importante):**
- **Edge Function `ycloud-webhook`** = persistencia + CRM. Su trabajo es que TODO mensaje (entrante y status de salientes) quede en `messages`, para que el inbox lo muestre. NO razona, NO responde.
- **n8n** = el cerebro del bot. Recibe el mismo inbound, arma el prompt, llama al LLM, responde por la API de YCloud, y dispara tools (handoff, extracción de datos, etc.).
- Los dos reciben el MISMO webhook de YCloud, en paralelo. Por eso conviven sin que uno dependa del otro.

## Inventario de piezas y dónde vive cada secreto

| Pieza | Dónde se configura | Secreto/ID (placeholder) | Notas |
|---|---|---|---|
| **YCloud API key** | YCloud dashboard → API keys; se usa en n8n (y en la entrega outbound) | `YCLOUD_API_KEY=<key>` | Para ENVIAR mensajes. Por cuenta YCloud. |
| **YCloud webhook secret** | YCloud dashboard → cada webhook endpoint tiene su `Secret: whsec_…` | `YCLOUD_WEBHOOK_SECRET=whsec_<...>` | Para VERIFICAR la firma HMAC del entrante. **Cada endpoint puede tener su propio secret** — usá el del endpoint que apunta a tu Edge Function. |
| **Webhook endpoint(s)** | YCloud dashboard → Webhooks → Add Endpoints | URL del edge + URL de n8n | Fan-out: agregás un endpoint por destino. |
| **Supabase project ref** | identifica el proyecto | `<project-ref>.supabase.co` | Cambia por proyecto (v1 ≠ v2). |
| **Supabase anon key** | Settings → API | `NEXT_PUBLIC_SUPABASE_ANON_KEY=<jwt>` | Frontend (browser). |
| **Supabase service_role** | Settings → API | `SUPABASE_SERVICE_ROLE_KEY=<jwt>` | Bypassa RLS. Edge Functions (auto-inyectada) + n8n. NUNCA en el cliente. |
| **Supabase access token** | cuenta Supabase → Access Tokens | `SUPABASE_ACCESS_TOKEN=sbp_<...>` | Para el CLI (`supabase functions deploy`). Es a nivel CUENTA (sirve para todos tus proyectos). |
| **Edge Function secrets** | Dashboard → Edge Functions → Manage secrets | `YCLOUD_WEBHOOK_SECRET` (manual). `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (auto-inyectadas) | Por proyecto. |
| **LLM del bot** | en n8n (credencial) | `OPENAI_API_KEY=<key>` (o el del proveedor) | El cerebro del bot. |
| **YCloud por-tenant** | en Supabase (tabla de canales), NO en env | `phone_number`, `external_id` (WABA/phone id) | Cada agency conecta su número. |

## Montaje paso a paso (proyecto nuevo)

### A. Lado YCloud
1. Cuenta YCloud activa + número del business conectado (modo Coexistence: cada agente conecta su número).
2. Generar/ubicar la **API key** (enviar mensajes).
3. **Webhooks → Add Endpoints:** agregar la URL de la Edge Function del proyecto: `https://<project-ref>.supabase.co/functions/v1/ycloud-webhook`. Activar. Copiar su **Secret `whsec_…`**.
4. (Si hay bot) Agregar un segundo endpoint con la URL del workflow n8n: `https://<n8n-host>/webhook/<flow>`. Activar.
5. Eventos a suscribir: `whatsapp.inbound_message.received` y `whatsapp.message.updated` (status de salientes).

### B. Lado Supabase
1. Schema con las tablas que la Edge Function usa: `webhook_events_raw` (raw paranoid), `agency_channels`/`whatsapp_numbers` (mapeo número→agency), `leads`, `conversations`, `messages`. (En v2: migraciones 0003 + 0010.)
2. Desplegar la Edge Function intake:
   ```bash
   supabase functions deploy ycloud-webhook --project-ref <project-ref> --no-verify-jwt
   ```
   `--no-verify-jwt` es OBLIGATORIO: YCloud no manda JWT, el auth es HMAC.
3. Setear el secret del webhook:
   Dashboard → Edge Functions → Manage secrets → `YCLOUD_WEBHOOK_SECRET = whsec_<el del endpoint>`.
   (`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` ya están auto-inyectadas.)
4. (Si hay tools del bot) Desplegar las Edge Functions de tools (`bot-actions` / `request-handoff` / `extract-lead-info`) con su secret auth (skill `supabase-edge-function-secret-auth`).
5. **Sembrar el canal:** insertar en `agency_channels` (o `whatsapp_numbers`) la fila `(channel='whatsapp', phone_number=<número E.164 del business>, agency_id=<agency>, external_id=<phone/WABA id>, is_active=true)`. SIN esto el intake responde `unknown_agency_for_phone` y no persiste nada.

### C. Lado n8n (el bot)
1. El workflow tiene un **Webhook node** con el path `<flow>` (la URL que registraste en YCloud endpoint 2).
2. Credenciales en n8n (NO en el repo): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (escribe bypassa RLS, debe incluir `agency_id` correcto en cada insert), la API key del LLM, y la API key de YCloud (para enviar).
3. El flow: recibe inbound → arma prompt → LLM → escribe respuesta en `messages` (service_role) → envía vía YCloud API → si detecta handoff, cambia `handler='human'`.
4. Cambios al workflow van por el pipeline `n8n-architect → builder → reviewer` (ver `memory/n8n-pipeline.md`).

## Checklist de REPLICACIÓN a otro proyecto Supabase (lo que cambia)

Cuando movés el sistema a un Supabase nuevo (ej. v1 `ugkunpsohrimxetofawv` → v2 `fahujscodhqlopycorzn`), cambia TODO lo que apunta al ref viejo:

- [ ] **`.env.local` del CRM**: `NEXT_PUBLIC_SUPABASE_URL`, `ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` → los del proyecto nuevo.
- [ ] **Re-desplegar las Edge Functions** al proyecto nuevo (`--project-ref <nuevo>`), adaptando los nombres de columna si el schema cambió (ver gotcha abajo).
- [ ] **Setear los secrets** de las Edge Functions en el proyecto nuevo (`YCLOUD_WEBHOOK_SECRET`).
- [ ] **YCloud Webhooks**: apuntar el endpoint de la Edge Function a la URL del proyecto nuevo. Si es MIGRACIÓN (no convivencia), **desactivar/repuntar el endpoint viejo** para que el proyecto viejo deje de recibir (si no, ambos procesan = doble escritura y doble respuesta del bot).
- [ ] **n8n**: actualizar las credenciales de Supabase del workflow (URL + service_role del proyecto nuevo). El número/cuenta YCloud y la API key NO cambian si es la misma cuenta.
- [ ] **Sembrar `agency_channels`** en el proyecto nuevo con el número del business.
- [ ] **Verificar**: mandar un WhatsApp de prueba al número → confirmar que aparece en `messages` del proyecto nuevo (y NO en el viejo si migraste).

**La cuenta YCloud y el número NO se tocan** si reusás la misma cuenta — solo cambia a dónde apunta el webhook. Eso evita re-verificar con Meta (que es caro y lento).

## Gotchas (aprendidos en producción, v1 Casa CRM 2026-05-18+)

- **HMAC sobre el raw body, antes de parsear.** Header `ycloud-signature: t=<unix>,s=<hmac_hex>`, HMAC-SHA256(secret, `${t}.${rawBody}`). Usar `req.text()`, no `req.json()`. El secret se usa tal cual, incluyendo el prefijo `whsec_`. Replay protection: rechazar si `|now - t| > 5 min`.
- **`verify_jwt: false` SIEMPRE** en la Edge intake. YCloud no manda JWT.
- **Guardar el raw ANTES de procesar** en `webhook_events_raw`. Si el procesamiento rompe, los datos están y se re-procesan. Sin esto perdés mensajes en silencio.
- **Siempre 200 a YCloud**, incluso en error de procesamiento (loguear en `processing_error`). Un 4xx/5xx hace que YCloud reintente → duplicados.
- **Idempotencia por `wa_message_id`** (UNIQUE). YCloud reenvía eventos. El insert outbound puede chocar con el update concurrente → atrapar `23505` y reintentar como UPDATE.
- **Resolución de agency por número:** inbound resuelve por `to` (el número del business). El status de outbound resuelve por `from` (también el business). SIN fila en `agency_channels`/`whatsapp_numbers` para ese número → `unknown_agency_for_phone`, no persiste.
- **El nombre del display de WhatsApp NO es estable** (el usuario lo cambia). Usar el `phone` / `userId` como llave.
- **Doble webhook = doble proceso.** Si dos proyectos (v1 y v2) tienen su endpoint activo para el MISMO número, ambos escriben y ambos bots responden. Para migrar, repuntar/desactivar el viejo.

## Diferencias de schema v1 → v2 (al portar la Edge Function)

El código del v1 (`supabase/functions/ycloud-webhook/index.ts`) usa el schema viejo. Al portarlo al v2 hay que mapear:

| v1 (Casa CRM) | v2 (Momentum AI CRM) |
|---|---|
| tabla `whatsapp_numbers` | tabla `agency_channels` (genérica multi-canal; filtrar `channel='whatsapp'`) |
| `leads.ycloud_user_id` | `leads.wa_user_id` |
| `leads.phone_e164` / `whatsapp_id` | `leads.phone` / `wa_user_id` |
| `leads.status` (enum 'nuevo') | `leads.stage_id` (FK pipeline_stages — resolver la etapa inicial) |
| `leads.metadata` | `leads.extra` |
| `conversations.whatsapp_number_id` | (opcional) o resolver canal por número; unique v2 = (agency_id, lead_id, channel) |
| `messages.ycloud_message_id` | `messages.external_id` (UNIQUE agency_id,channel,external_id) |
| `webhook_events_raw.payload` / `provider` | `webhook_events_raw.raw_payload` / `source` (schema v2 más simple) |

La LÓGICA (HMAC, raw, router, upserts idempotentes, handlers inbound/outbound) se reusa tal cual — solo cambian nombres de columna.

## Output esperado al usar esta skill

1. YCloud con su(s) endpoint(s) apuntando al proyecto correcto + secret copiado.
2. Edge Function `ycloud-webhook` desplegada en el proyecto correcto, `verify_jwt: false`, secret seteado.
3. Fila en `agency_channels` mapeando el número del business → agency.
4. n8n (si hay bot) con credenciales del proyecto correcto.
5. Verificación end-to-end: WhatsApp de prueba → aparece en `messages` → aparece en el inbox en vivo (Broadcast Changes).

## Skills relacionadas

- `ycloud-webhook-to-supabase` — el código de la Edge Function intake (HMAC, router, handlers).
- `whatsapp-image-delivery-ycloud` — entrega de media (bot → YCloud → WhatsApp), formato JPG/PNG.
- `supabase-edge-function-secret-auth` — patrón de las tools del bot (handoff, extract) con auth por secret.
- `supabase-realtime-broadcast-pattern` — cómo el inbox se entera en vivo de los messages nuevos.
- `n8n-langchain-agent-postgres-memory` — el bot en n8n con memoria.
- `memory/n8n-pipeline.md` — cómo se cambia el workflow n8n con seguridad (architect→builder→reviewer).

## Memoria global del founder (relacionada)

- `feedback_confirm_urls_literally.md` — confirmar URLs/endpoints literalmente antes de configurar (hay >1 webhook, fácil confundirse).
- `feedback_grant_schema_permissions.md` — GRANTs en schemas custom (realtime) si el rol inserta.
