# Skill: PROSP AI (LinkedIn) → CRM vía webhooks

## Cuándo usar esta skill

- Vas a conectar **PROSP AI** (SaaS de prospección outbound en LinkedIn — "la maquinita") a un CRM propio.
- Un cliente ya tiene campañas corriendo en PROSP y querés que los leads, conexiones y respuestas entren solos.
- Estás debugueando un webhook de PROSP que "falla el test" o que no trae los datos esperados.

**Costo de no usarla:** en el CRM de Josué Miranda (2026-07) esto costó ~5 días de datos incompletos, dos "correcciones" equivocadas del catálogo de eventos, un webhook borrado por error y media conversación perdida (respuestas sin el mensaje que las provocó).

## Por qué existe esta skill

PROSP tiene 4 trampas que no están en su documentación y que **te van a morder en el mismo orden**:

1. **El "Test Webhook" manda placeholders literales** → tu endpoint lo rechaza con razón, PROSP muestra "Test failed", y creés que tu webhook está roto cuando funciona perfecto.
2. **Un webhook no se puede editar.** Para cambiar eventos hay que crear otro. Si borrás primero, perdés todo lo que dispare en el medio (PROSP no reintenta).
3. **Los 16 eventos están todos disponibles**, pero un webhook nuevo suele nacer con pocos marcados. Si no los activás todos desde el día 1, **perdés información que nunca vas a poder recuperar** (los webhooks no tienen backfill).
4. **PROSP no firma los webhooks.** No hay HMAC. La única autenticación posible es un token secreto en la URL.

---

## Proceso

### 0. Regla madre: activar los 16 eventos desde el día 1

**No hay backfill.** Lo que no capturaste mientras el evento no estaba activado, se perdió para siempre. Activá todo aunque el CRM todavía no lo use — guardar es barato, recuperar es imposible.

El error clásico: activar solo `contact_added` + `accept_invite` + `has_msg_replied`. Resultado: **tenés la respuesta del prospecto pero no el mensaje que la provocó** (`send_msg` faltaba). Media conversación perdida.

### 1. Catálogo real de eventos (16)

Verificado contra el dropdown del dashboard, no contra la doc.

| Nombre en el dashboard | `eventType` | Para qué sirve |
|---|---|---|
| Contact Added | `contact_added` | Alta del lead. **Crea el lead.** |
| Contact Extracted | `contact_extracted` | Enriquecimiento del perfil |
| LinkedIn Profile Visited | `visit_linkedin_profile` | Cobertura del motor |
| LinkedIn Profile Followed | `follow_lead` | Cobertura del motor |
| LinkedIn Like on Last Post | `like_last_post` | Calentamiento previo |
| LinkedIn Comment on Last Post | `comment_last_post` | Calentamiento previo |
| LinkedIn Connection Sent | `send_connection` | **A quién ya se le escribió** |
| LinkedIn Connection Accepted | `accept_invite` | Señal: aceptó → etapa "contactado", temp tibio |
| LinkedIn Invite Accepted | `is_invite_accepted` | Variante del anterior |
| LinkedIn Connection Withdrawn | `withdraw_connection` | Se retiró la solicitud |
| LinkedIn Message Sent | `send_msg` | ⭐ **El texto que enviaste** |
| LinkedIn Voice Sent | `send_voice` | Nota de voz enviada |
| LinkedIn in Mail Message Sent | `send_linkedin_in_mail` | InMail enviado |
| LinkedIn Message Replied | `has_msg_replied` | ⭐ Señal caliente: respondió (con texto) |
| LinkedIn Comment Replied | `reply_comment` | Respondió un comentario |
| Tag Added to Lead | `add_tag` | Calificación hecha en PROSP |

Envoltura común: `{ eventType, eventData }`. `eventData` trae `lead` (URL LinkedIn), `sender`, `content`, `timestamp`, `campaignId`, `campaignName`, `workspaceId`, `profileInfo`.

`profileInfo` trae oro: `firstName`, `lastName`, `email`, `phoneNumber`, `headline`, `jobTitle`, `company`, `companyUrl`, `websiteUrl`, `bio`, `companyOverview`, `linkedinId`, `linkedinUrl`.

### 2. Autenticación: token secreto en la URL

PROSP **no firma nada**. No hay HMAC que verificar. Por lo tanto:

- URL: `https://<dominio>/api/webhooks/prosp/<token>` — el token **es** la credencial.
- Guardalo por negocio en `integration_accounts.webhook_token` (default `gen_random_uuid()` o similar).
- **Nunca lo selecciones en consultas de UI.** Si la RLS es `using(true)`, cualquier usuario logueado lo vería.
- Falla cerrado: token desconocido o cuenta inactiva → **401**.

### 3. `workspaceId` como segunda llave (claim-on-first-use)

En PROSP la frontera por negocio es el **workspace** (1 negocio = 1 workspace = 1 api_key).

```ts
if (acct.external_id) {
  // Ya sabemos el workspace de este negocio: cualquier otro es un error de config.
  if (evt.workspaceId && evt.workspaceId !== acct.external_id) {
    console.warn(`workspace mismatch: llegó ${evt.workspaceId}, esperado ${acct.external_id}`);
    return json({ ok: false, error: "workspace mismatch", got: evt.workspaceId }, 401);
  }
} else if (evt.workspaceId) {
  // Primer evento: capturamos el workspace real y lo fijamos.
  await sb.from("integration_accounts").update({ external_id: evt.workspaceId }).eq("id", acct.id);
}
```

Devolver `got` en el 401 es deliberado: PROSP muestra el cuerpo de la respuesta en su cartel de error, así que **el diagnóstico aparece en su UI** sin tener que ir a los logs.

### 4. ⛔ Reconocer el payload de prueba (esto te va a pasar)

El botón **"Test Webhook"** no manda un evento real: manda **la plantilla con los placeholders literales sin reemplazar**.

```json
{
  "eventType": "event_name",
  "eventData": {
    "workspaceId": "workspace id",
    "lead": "https://www.linkedin.com/in/lead-username",
    "sender": "https://www.linkedin.com/in/sender-username",
    "campaignId": "campaign id",
    "content": "This is a test triggered when adding a webhook in Prosp. ..."
  }
}
```

`workspaceId` es literalmente el string `"workspace id"`. Tu validación lo rechaza (bien: no es el workspace de nadie), PROSP muestra **"Test failed"** y el cliente cree que todo está roto.

```ts
function isProspTestPayload(p: ProspWebhookPayload): boolean {
  const eventType = p?.eventType?.trim();
  const workspaceId = p?.eventData?.workspaceId?.trim();
  // Un eventType real es uno de los 16; un workspaceId real es un UUID.
  return eventType === "event_name" || workspaceId === "workspace id";
}
```

Va **después** de resolver el token (que es justo lo que la prueba valida) y **antes** de todo lo demás. Responder 200 sin escribir nada:

```ts
if (isProspTestPayload(payload)) {
  return json({ ok: true, test: true, message: "Webhook conectado al CRM" });
}
```

**Bonus:** si el cliente ve un error viejo pegado en el modal, que recargue duro (Ctrl+F5) — PROSP conserva el último resultado del test en la UI y confunde muchísimo.

### 5. Guardar el evento crudo ANTES de validar y de procesar

Mismo principio que [[ycloud-webhook-to-supabase]] — **y acá se violó y costó caro**. Dos reglas:

1. **Un `eventType` desconocido NO se descarta.** Se guarda crudo y solo se saltan las escrituras al lead. Si PROSP agrega un evento nuevo mañana, lo tenés para reprocesar.
2. **Guardar antes de validar el workspace.** Si rechazás antes de loguear, un rechazo es **invisible** y no hay forma de diagnosticarlo. (Así se descubrió el payload de prueba: apareció en la tabla.)

```ts
// 1. token → cuenta (401 si no)
// 2. ¿payload de prueba? → 200 y chau
// 3. normalizar (solo se rechaza si no hay eventType)
// 4. INSERT crudo en integration_events  ← acá, antes de validar workspace
// 5. validar workspace (401 si mismatch — ya quedó logueado)
// 6. si no hay regla para el eventType → 200 "logged, unmapped"
// 7. resolver/crear lead → actividad → enlazar lead_id al evento
```

Tipar la diferencia para que el compilador la haga cumplir:

```ts
export type NormalizedEvent = { eventType: string; rule: EventRule | null; /* ... */ };
/** Evento con regla: el único que puede escribir en el lead. */
export type MappedEvent = NormalizedEvent & { rule: EventRule };
```

### 6. Idempotencia

`dedup_key = ${eventType}:${linkedinUrl}:${timestamp}` + `unique (integration_account_id, dedup_key)`.
Violación `23505` → ya procesado → responder `{ok:true, deduped:true}`.

Esto es lo que permite el swap seguro de webhooks (paso 8) y protege de entregas duplicadas.

### 7. Mapeo evento → acción en el CRM

Reglas por evento, con dos invariantes: **la etapa solo avanza** y **la temperatura solo sube**. Nunca retroceden por un evento tardío o fuera de orden.

```ts
export type EventRule = {
  label: string;          // título en el timeline
  activityType: string;   // lead_activities.type
  color: string;
  createsLead: boolean;   // los de baja señal NO crean lead
  stage?: StageId;        // avanzar (solo hacia adelante)
  temp?: Temp;            // escalar (solo hacia arriba)
  contentToBody?: boolean; // volcar content → lead_activities.body
};
```

Criterios:
- `createsLead: true` solo donde hay perfil completo y valor real: alta, conexión aceptada, mensajes salientes, respuestas, tag.
- `createsLead: false` para toques de baja señal (visita, like, follow, comentario): si el lead no existe, se ignora la escritura (el evento igual queda guardado). Evita llenar el CRM de basura.
- `contentToBody: true` en todo lo que lleve texto (mensajes enviados, respuestas, notas de voz, InMails) → así se reconstruye **la conversación completa** en el timeline.

Datos del perfil → `leads.qualification` (jsonb), mergeando sin pisar lo bueno:

```ts
// Enriquecer SOLO campos vacíos; nunca pisar un dato que ya está.
if (evt.email && !current?.email) patch.email = evt.email;
const merged = { ...existingQ, ...evt.qualification }; // + tags acumulativos
```

### 8. Swap de webhook sin perder eventos

Como no se pueden editar: **crear el nuevo PRIMERO, borrar el viejo DESPUÉS.**

El solape genera entregas duplicadas, pero el dedup del paso 6 las absorbe. Al revés (borrar primero) hay una ventana ciega y **PROSP no reintenta**: lo que dispare ahí se pierde.

### 9. Verificar contra la base, no contra la UI

```sql
-- ¿Qué tipos están entrando y desde cuándo?
select event_type, count(*) n, max(created_at) ultimo
from integration_events group by 1 order by ultimo desc;

-- ¿Un solo workspace? (>1 = webhook mal configurado en otro workspace)
select distinct payload->'eventData'->>'workspaceId' ws, count(*)
from integration_events group by 1;

-- ¿Llegan los eventos con texto? (la conversación completa)
select l.name, la.title, la.body from lead_activities la
join leads l on l.id = la.lead_id
where la.body is not null order by la.created_at desc limit 10;
```

---

## Gotchas (todos cobrados en producción)

| Gotcha | Qué pasa | Fix |
|---|---|---|
| **Test Webhook falla** | Manda placeholders literales (`"workspace id"`) | `isProspTestPayload()` → 200 (paso 4) |
| **Error viejo pegado en el modal** | PROSP conserva el último resultado; "Continue" ni llama a tu server | Ctrl+F5. Confirmá con `curl` + la tabla de eventos si llegó algo |
| **Webhook no editable** | Cambiar eventos = crear otro | Crear nuevo → verificar → borrar viejo (paso 8) |
| **Eventos sin activar** | No hay backfill: se pierde para siempre | Los 16 desde el día 1 (paso 0) |
| **Evento desconocido descartado** | Se pierde en silencio | Guardar crudo, `rule: null` (paso 5) |
| **Rechazo sin log** | Imposible diagnosticar | Loguear antes de validar (paso 5) |
| **Sin firma HMAC** | Cualquiera con la URL escribe | Token secreto en la ruta; nunca exponerlo en UI |
| **Texto de respuesta con basura** | PROSP antepone `"A lead has replied\n Re:"` | Limpiar al mostrar, no al guardar (guardá el crudo) |
| **`send_connection` no crea lead** | Correcto: `contact_added` ya lo creó antes | No cambiar sin pensarlo |
| **Casing inconsistente en la API** | `api_key` vs `apiKey`, `linkedin_url` vs `linkedinUrl` | Normalizar en una sola capa |

### ⚠️ Gotcha de proceso (el que más caro salió)

**No deduzcas el catálogo de eventos de una captura de pantalla.** Una captura de los eventos de un webhook muestra **lo que está configurado**, no **lo que está disponible**. En Josué se dedujo "PROSP solo ofrece 4 eventos" de una captura así, se "corrigió" código que estaba bien, y la mentira llegó hasta la memoria del proyecto.

**Regla: ante una captura parcial, preguntar. La doc de la API era correcta desde el principio.**

---

## Checklist para un cliente nuevo

- [ ] Cliente tiene cuenta PROSP con al menos una campaña corriendo.
- [ ] Crear `businesses` + `integration_accounts` (provider `prosp`, `webhook_token` autogenerado, `external_id` null).
- [ ] Middleware excluye `api/webhooks` del auth (si no → 307 al login en vez de procesar).
- [ ] Endpoint con: token → test-payload → normalize → log crudo → workspace → mapeo → lead.
- [ ] Probar con `curl` los 5 casos: test de PROSP, evento real, evento desconocido, workspace ajeno, token inválido.
- [ ] En PROSP → Settings → Webhooks → Create: pegar URL, **marcar los 16**, Test (verde), Continue.
- [ ] Verificar en la base que entran eventos y que hay **un solo workspaceId**.
- [ ] **Borrar los datos de prueba** que hayas generado (eventos + leads basura).
- [ ] Confirmar que `send_msg` llega: sin eso no tenés la conversación completa.

## Output esperado

- Migración con `businesses`, `integration_accounts`, `integration_events` (+ `leads.business_id`).
- `app/api/webhooks/prosp/[token]/route.ts` + `lib/webhooks/prosp/{types,mapping,normalize,write}.ts`.
- Eventos entrando, verificados por query, con un solo workspace y sin basura de pruebas.

## Ejemplo

**Input:** cliente nuevo con PROSP corriendo y un CRM propio en Next.js + Supabase.

**Output:** webhook en verde, `contact_added` creando leads con bio/empresa/cargo en `qualification`, `send_msg` + `has_msg_replied` reconstruyendo la conversación en el timeline, y `accept_invite` moviendo la etapa a "contactado" con temperatura tibia — sin haber perdido un solo evento.

## Relacionado

- [[ycloud-webhook-to-supabase]] — mismo patrón de raw-storage + idempotencia (la fuente del principio que acá se violó).
- [[datos-reales-vs-seed-demo]] — qué hacer con los datos de demo cuando empiezan a llegar los reales.
- [[supabase-edge-function-secret-auth]] — autenticación por secreto cuando el proveedor no firma.
