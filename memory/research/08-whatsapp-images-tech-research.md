# WhatsApp Multi-Image Send — Research Técnico

**Fecha:** 2026-05-21
**Autor:** Research agent (Claude)
**Input para:** `n8n-architect`
**Misión:** Bajar incertidumbre técnica antes de diseñar el envío multi-imagen desde Sofia.

---

## 1. YCloud API capabilities

### 1.1 Endpoint que usamos hoy

Hoy el workflow v4 usa **`POST https://api.ycloud.com/v2/whatsapp/messages`** con auth `X-API-Key` (header `httpHeaderAuth` credencial "Momentum AI" en N8N). El body actual es solo texto:

```json
{
  "from": "{{businessPhone}}",
  "to":   "{{userPhone}}",
  "type": "text",
  "text": { "body": "..." }
}
```

YCloud expone DOS endpoints para enviar mensajes WhatsApp ([rate-limits doc](https://docs.ycloud.com/reference/rate-limits.md), [send doc](https://docs.ycloud.com/reference/whatsapp_message-send.md)):

| Endpoint | RPS por sender | Modo | Filtros (`filterUnsubscribed`, `filterBlocked`) |
|---|---|---|---|
| `POST /v2/whatsapp/messages` | 200 rps (pero YCloud reenvía a Meta a 60 rps) | Asíncrono (cola interna) | ✅ |
| `POST /v2/whatsapp/messages/sendDirectly` | 80 rps default, 1000 rps con upgrade | Síncrono (directo a Meta) | ❌ |

> **Cita verbatim (docs YCloud):** *"Queued messages will be submitted to the WhatsApp Business API asynchronously."* — `/v2/whatsapp/messages`
>
> **Cita rate-limits:** *"using both WhatsApp endpoints simultaneously with the same sender may result in message failures due to the rate limit."*

**Implicación:** mantenemos `/v2/whatsapp/messages` (el que ya usamos). No mezclar endpoints en el mismo sender.

### 1.2 Body JSON para enviar UNA imagen

Misma URL, mismo header `X-API-Key`. Solo cambia el body. Fuente: [whatsapp-messaging-examples.md](https://docs.ycloud.com/reference/whatsapp-messaging-examples.md):

```json
{
  "from": "+50689839490",
  "to":   "+50688217229",
  "type": "image",
  "image": {
    "link":    "https://example.com/sample.jpg",
    "caption": "Describes the specified media."
  }
}
```

**Reglas del schema (`WhatsappMessageMedia`):**

- `link` **O** `id` — mutuamente excluyentes. *"Either `id` or `link` must be provided, but not both."*
- `link` debe ser **URL pública HTTPS** alcanzable por los servidores de Meta. Si está privado/firmado/expira, falla.
- `id` se obtiene subiendo media previamente vía `POST /whatsapp/media/{phoneNumber}/upload` (multipart form, campo `file`). El `id` retornado **expira a los 30 días**. *Cita: "All media files sent through this endpoint are encrypted and persist for 30 days."*
- `caption` — string opcional. Cap real de WhatsApp Cloud API: **1024 caracteres** (no documentado explícito en YCloud, pero límite oficial Meta que YCloud hereda).

### 1.3 ¿Múltiples imágenes en un mismo POST?

**NO.** Confirmado verbatim en docs YCloud ([whatsapp_message-send-directly.md](https://docs.ycloud.com/reference/whatsapp_message-send-directly.md)):

> *"Only one image per call. The specification defines a single `image` object within the message. There is no array structure for multiple images in a single request."*

**Implicación:** N imágenes = N POSTs. Por diseño de WhatsApp Cloud API (Meta), no de YCloud.

> **¿Existe carrusel/catalog?** WhatsApp tiene `interactive.type = product_list` (Commerce/Catalog API) y `template` con `header.image`, pero requieren:
> - Catálogo Meta Commerce conectado (no aplica — el catálogo es Supabase).
> - O templates pre-aprobados con header image (lento, requiere aprobación Meta por cada cambio).
>
> **Conclusión:** descartado para este caso. La solución correcta es N llamadas secuenciales tipo `image`.

### 1.4 Formatos y tamaño

Fuente: [whatsapp-message-sending-guide.md](https://docs.ycloud.com/reference/whatsapp-message-sending-guide.md):

> *"Images: JPG, PNG (max 5MB)"*

- ✅ `image/jpeg`, `image/png`
- ❌ `image/webp` (NO soportado como tipo image — sí como sticker, otro endpoint)
- ❌ `image/heic` (NO)
- **Máximo: 5 MB por imagen.**
- **Las Unsplash URLs actuales** (`?w=1600&q=80&auto=format&fit=crop`) sirven JPEG comprimidos (~150-500KB cada uno típicamente). Dentro de límite. OK.

### 1.5 Caption permitido + texto adicional

- Imagen + caption: SÍ, mismo POST. (1024 chars max).
- Imagen + texto descriptivo largo: **2 POSTs separados** — uno tipo `image`, otro tipo `text`.
- No existe modo "imagen embebida dentro de mensaje de texto" en Cloud API. Las imágenes son su propio mensaje.

### 1.6 Rate limits

| Limit | Valor | Aplica |
|---|---|---|
| YCloud `/messages` | 200 rps por sender | Cola YCloud |
| YCloud → Meta | 60 rps por sender | Real (cuello de botella) |
| Meta a un mismo destinatario | No documentado público, pero throttling agresivo si >X msgs/min al mismo número | Empíricamente conservador |

El workflow ya tiene **`Pausa entre Mensajes` (Wait node de 2 segs)** entre cada item del `Loop Over Items`. Suficiente para 3-5 imágenes por propiedad.

### 1.7 Costo

Fuente: [whatsapp-message-pricing-updates.md](https://docs.ycloud.com/reference/whatsapp-message-pricing-updates.md):

> *"Per-message pricing will apply to all businesses starting July 1, 2025, at 12am, by WhatsApp Business Account timezone."*

**Modelo desde Julio 2025: per-message, NO per-conversation.** Sin embargo, el cambio aplica solo a **templates** (marketing, authentication, utility fuera de ventana):

> *"Businesses are charged for Per delivered marketing template message, Per delivered authentication template message, and utility template messages if delivered outside of a customer service window."*

**Ventana de servicio 24h (lo que nos importa):**

> *"Businesses can respond to users at no charge with free-form messages and utility template messages within a 24-hour customer service window."*

**Implicación clave para Sofia:**
- El lead **inicia** la conversación (manda mensaje al bot) → abre **service window de 24 h**.
- Dentro de esa ventana, **TODOS los free-form messages son gratis**, incluyendo imágenes.
- Mandar 1 texto o 3 imágenes en la misma ventana cuesta **lo mismo: $0** en Meta.
- (YCloud puede cobrar un pequeño platform fee — verificar contrato comercial, no es API-facing).

**Costo ≈ 1× imagen = 1× texto = $0 dentro de 24h service window.** No hay disincentivo económico por mandar 3 imágenes.

---

## 2. Inspección del workflow actual

### 2.1 Cadena de envío hoy (líneas 1060-1140 del v4)

```
[Agente Principal - Sofia] (LangChain agent)
     ↓ output.MENSAJE 1, MENSAJE 2 (Structured Output Parser)
[Split Out]                          ← fieldToSplitOut: "output"
     ↓ N items (uno por chunk)
[Loop Over Items]                    ← splitInBatches, batch=1 default
     ↓
[Mensaje no vacio?]                  ← IF $json.output notEmpty
     ↓ true
[Send Chunk via YCloud]              ← HTTP POST /v2/whatsapp/messages, type=text
     ↓
[Pausa entre Mensajes]               ← Wait 2 segundos
     ↓
(loop back a Loop Over Items)
```

### 2.2 Body actual del HTTP node `Send Chunk via YCloud`

```json
{
  "from": "{{ $('Extract Variables').first().json.businessPhone }}",
  "to":   "{{ $('Extract Variables').first().json.userPhone }}",
  "type": "text",
  "text": { "body": {{ JSON.stringify($json.output) }} }
}
```

- URL: `https://api.ycloud.com/v2/whatsapp/messages`
- Auth: `genericCredentialType` → `httpHeaderAuth` → credencial id `jfwQ9Rp74VHhXDsH` "Momentum AI" → header `X-API-Key`.

### 2.3 Cómo cambiaría el body para imagen

```json
{
  "from": "{{ $('Extract Variables').first().json.businessPhone }}",
  "to":   "{{ $('Extract Variables').first().json.userPhone }}",
  "type": "image",
  "image": {
    "link":    "{{ $json.url }}",
    "caption": "{{ $json.caption || '' }}"
  }
}
```

Mismas credenciales, mismo endpoint. Solo el `type` + `image{}` cambia. Si caption está vacío, omitirlo (no mandar `"caption": ""` porque Meta puede rechazarlo — pero YCloud lo tolera).

### 2.4 Tool `Supabase Properties Tool` (línea 1556-1573)

- URL: `https://ugkunpsohrimxetofawv.supabase.co/functions/v1/properties-search?secret=...`
- Sofia llama esta tool con `$fromAI(...)` params.
- `toolDescription` actual menciona: *"Devuelve hasta 5 propiedades con codigo, titulo, precio, ubicacion, especificaciones, caracteristicas, foto_url."*
- `limit: 50` en el body (pero la edge function trunca a 50 internamente; típico devuelve 1-5).

---

## 3. Edge function `properties-search` v1.4 — cambios necesarios

### 3.1 Shape actual del campo imagen (función `toItem`)

```ts
const images = Array.isArray(p.images) ? p.images : [];
const firstImage = images[0] && typeof images[0] === "object"
  ? (images[0] as { url?: string }).url ?? null
  : null;
// ...
return {
  // ...
  foto_url: firstImage,  // ← UNA sola URL, string | null
  // ...
};
```

### 3.2 Cambio retrocompatible propuesto

```ts
const imagesArr = Array.isArray(p.images) ? p.images : [];
const fotoUrls: string[] = imagesArr
  .filter((i): i is { url: string } => !!i && typeof i === "object" && typeof (i as any).url === "string")
  .map((i) => i.url);

return {
  // ...
  foto_url:  fotoUrls[0] ?? null,        // ← mantener para backcompat
  foto_urls: fotoUrls,                    // ← NUEVO array completo
  foto_count: fotoUrls.length,            // ← NUEVO (útil para Sofia/N8N)
  // ...
};
```

- **100% retrocompat:** consumers viejos siguen leyendo `foto_url`. Sofia (que ya está prompteada en eso) sigue funcionando.
- **`foto_urls`** se ordena por `images[].order` (los seeds ya tienen `order: 0,1,2,3`). No necesita sort extra porque Supabase devuelve JSONB con su orden de inserción.
- Si en el futuro queremos `is_cover`, agregar campo en JSONB y priorizar en `.sort((a,b) => (b.is_cover?1:0) - (a.is_cover?1:0))`.

### 3.3 Actualizar `toolDescription` de `Supabase Properties Tool`

Hay que mencionar `foto_urls` (array) en la descripción para que Sofia sepa que existen. Si no, el LLM no sabe que ahora puede pedir/usar varias.

---

## 4. Schema `properties.images` — análisis real (consultado vía MCP)

### 4.1 Estructura de cada item del array

**Forma rica (8 propiedades con multi-foto):**
```json
{ "alt": "Fachada moderna", "url": "https://...", "order": 0 }
```

**Forma simple (resto):**
```json
{ "url": "https://..." }
```

> Mixto. La edge function debe defenderse de ambos. El código actual ya lo hace (solo lee `url`).

### 4.2 Distribución actual (16 propiedades activas)

| Tier | Count |
|---|---|
| 0 imágenes | **0** |
| 1 imagen | 8 |
| 2-5 imágenes | **8** |
| 6+ | 0 |

**Hallazgo importante:** El founder dijo *"ahorita solamente hay una imagen cargada por propiedad"*, pero en realidad **8 de 16 propiedades ya tienen 2-4 imágenes** (CR-2031, CR-2061, CR-2018, CR-2042, CR-2009, CR-2052, CR-2047, CR-2055). El bug NO es de seed — es que el código solo lee la primera.

### 4.3 ¿URLs públicas o Supabase Storage?

**TODAS son Unsplash públicas** (`https://images.unsplash.com/...`). Ningún Supabase Storage involucrado actualmente.

- ✅ HTTPS público — Meta puede acceder directo.
- ✅ Sin signed URL ni expiración.
- ✅ JPEG comprimido bajo 1 MB (q=80, w=1600).
- ⚠️ Cuando lleguen fotos REALES de agencias (no Unsplash mock), van a estar en Supabase Storage. Hay que decidir: bucket público o signed URLs con TTL > 1 hora. **Recomendación arquitecto:** bucket público para `property-images` con CDN + transformación, signed URLs solo para docs sensibles. Esto NO bloquea el feature actual.

---

## 5. Las 3 opciones de arquitectura — análisis

### Opción A — Marca `[IMG:CR-2071]` en el texto de Sofia, N8N expande

**Flujo:**
1. Sofia (LLM) escribe en MENSAJE 1: `"Mira esta opción que te queda perfecta: [IMG:CR-2071] Casa moderna en Sabana, 3 dorm, $185k. Tiene piscina y..."`
2. Code node nuevo (post-Split Out) parsea cada chunk, detecta `[IMG:CODE]`, llama edge function `properties-search` por código, expande a N items: `{type:'image', url, caption}` + el texto residual sin la marca.
3. Loop Over Items envía cada item según `type`.

**Pros:**
- Sofia maneja semántica simple (códigos), no URLs.
- Prompt limpio.
- Si Sofia se equivoca de código, falla controlable.

**Contras:**
- Extra query a DB por mensaje (consultar la propiedad de nuevo).
- Code node nuevo + cambio en routing del Loop (item type-aware).
- Acoplamiento Sofia ↔ formato de marca.

### Opción B — Sofia recibe `foto_urls`, las inserta con marca `[IMG]url[/IMG]`

**Flujo:**
1. Edge function devuelve `foto_urls: [url1, url2, url3]`.
2. Sofia (con prompt actualizado) escribe: `"[IMG]url1[/IMG] [IMG]url2[/IMG] Casa moderna en Sabana, $185k..."`
3. Code parsea las marcas, expande.

**Pros:**
- 1 sola query (en el tool call original).
- No requiere lookup adicional.

**Contras:**
- URLs (>100 chars c/u) entran al context del LLM → ruido + costo de tokens + riesgo de hallucination (LLMs copian mal URLs largos cuando hay varios).
- Prompt más complejo (Sofia tiene que parsear, decidir cuántas mandar, no romper format).
- Si Sofia se confunde y mete URLs malformados → 404 visible al lead.

### Opción C — Tool nueva `send_property_card` (side-effect)

**Flujo:**
1. Sofia decide "voy a mostrar la CR-2071". Llama tool `send_property_card(code='CR-2071')`.
2. La tool internamente: query DB → manda N imágenes + texto vía YCloud → return `{sent: true, image_count: 3}` a Sofia.
3. Sofia continúa la conversación con ese contexto.

**Pros:**
- Separación de concerns perfecta — Sofia decide QUÉ mostrar, N8N decide CÓMO.
- Aprovecha el patrón de tool ya usado (Properties Tool, Handoff Tool).

**Contras técnicos serios:**
- LangChain Agent en N8N ejecuta tools `toolHttpRequest` esperando un **JSON response** que se vuelve parte del context del LLM. Si la tool hace side-effect de mandar mensajes a WhatsApp, Sofia los manda **antes** de continuar su propio output → el lead recibe imágenes ANTES de cualquier texto siguiente del bot. Eso ROMPE el patrón actual donde MENSAJE 1, MENSAJE 2 salen ordenados por el Loop.
- El loop de envío central (Split Out → Loop) deja de ser autoridad única. Hay 2 paths de envío.
- Posible doble envío si Sofia llama la tool y además menciona la propiedad en su texto.
- Race conditions: Pausa entre Mensajes (2 segs) no aplica al envío de la tool.
- Tool sería **escritura**, contra patrón LangChain de tools como read/transform.

### Recomendación: **Opción A**, con detalles

**Por qué A gana:**
1. **Mantiene el invariante** "todo lo que el lead ve sale del Loop". Único punto de envío = único punto de logging, retry, rate-limit.
2. **El texto de Sofia es semántica pura** (códigos, no URLs). Tokens baratos, fácil de leer en logs, fácil de debug. Tokens promedio: `[IMG:CR-2071]` = ~6 tokens vs URL Unsplash ~50 tokens. En 4-5 propiedades mostradas → ahorro real.
3. **Query extra es barata** — la edge function ya hizo la query inicial cuando Sofia llamó la tool. El Code node puede o (a) hacer un select directo via Postgres node (`SELECT images FROM properties WHERE code = $1`), o (b) cachear el último resultado de Properties Tool en una variable.
4. **Si Sofia se equivoca de código** (alucina `CR-9999`), el query devuelve vacío → Code node hace `continueOnError`, manda solo el texto sin imagen. Falla suave.
5. **B es tentador pero peligroso:** LLMs notoriamente copian URLs largas con typos (cambian `?w=1600` por `?w=160`, rompen el escape de `&`). En producción WhatsApp con caption + URL en el output, eso es 404 garantizado mes a mes. **No.**
6. **C es arquitectónicamente atractivo pero N8N no le da soporte real** sin reescribir el patrón del Loop.

**Variante refinada de A (recomendada para el architect):**

- Sofia escribe en su output structured: `"PROPIEDADES_REFERIDAS": ["CR-2071", "CR-2042"]` además de los MENSAJE N.
- O alternativamente: marca inline `[IMG:CR-2071]` dentro del primer MENSAJE.
- Code node nuevo entre Split Out y Loop: lee el output completo, expande las marcas a items con `type: "image"`, dejando los chunks de texto con type `text`.
- El Loop Over Items ya no asume `text` — pasa por un Switch (text vs image) antes de Send Chunk.
- O más simple: **2 HTTP request nodes hermanos** dentro del Loop, ramificados por type.

### Decisión adicional: **¿1 o N imágenes por propiedad?**

Recomendación: **max 3 imágenes por propiedad**, en este orden:
1. Imagen `order:0` (fachada/portada) **con caption** del título + precio.
2. Imagen `order:1` (interior principal) sin caption (o caption corto).
3. Imagen `order:2` (feature destacado) sin caption.

Razón: 3 imágenes ya transmiten el producto. Más es spam y consume el budget de atención del lead (cada imagen es un mensaje WhatsApp que vibra el teléfono). Si pide "más fotos", entonces sí mandamos resto.

---

## 6. Riesgos y edge cases

| # | Riesgo | Mitigación recomendada |
|---|---|---|
| 1 | **URL 404 / lenta / inalcanzable por Meta** | YCloud retorna error 4xx en el POST. Configurar `onError: continueRegularOutput` en Send Chunk (igual que Mark As Read ya lo tiene). Loguear pero NO bloquear el resto del envío. |
| 2 | **Propiedad con 0 imágenes** | `foto_urls.length === 0` → skip image phase, mandar solo texto. Code node debe validar antes de expandir. |
| 3 | **Propiedad con 10+ imágenes** | Cap en Code node a `slice(0, 3)`. Si lead pide "más fotos", una segunda llamada manda las restantes (estado conversacional). |
| 4 | **Rate limit Meta (60 rps por sender)** | Ya tenemos `Pausa entre Mensajes` 2s. Con 3 imágenes + 1 texto = 4 mensajes × 2s = 8s por propiedad. Lento pero seguro. Aceptable. NO bajar a 0. |
| 5 | **Caption repetido en cada imagen** | NO. Solo la primera lleva caption con título+precio. Resto sin caption. Evita spam visual. |
| 6 | **Imagen ANTES o DESPUÉS del texto descriptivo** | Lo natural en WhatsApp móvil: imagen 1 con caption corto (gancho) → imagen 2 → imagen 3 → texto largo con detalles + CTA. La foto engancha, el texto remata. |
| 7 | **Lead pide "más fotos"** | Sofia detecta intención → llama Properties Tool con `codigo: 'CR-2071'` → recibe array completo → manda imágenes 4+. State manejado por context del LLM. |
| 8 | **Imagen WebP o HEIC en BD** | Validar en Code node antes de mandar: si MIME no es jpeg/png, skip. Cuando se haga ingest real desde agencias, normalizar a JPEG en Supabase Storage. |
| 9 | **Costo** | $0 extra dentro de service window 24h. Fuera de ventana (Sofia iniciando conversación con utility template) sí cuesta — pero ese escenario no aplica al MVP (Sofia siempre responde, no inicia). |
| 10 | **Duplicación al reintentar workflow** | Si el workflow se re-ejecuta por error, manda imágenes 2x. Idempotencia vía `externalId` en el body YCloud (campo soportado) — pasar `wamid` o `messageId-img-N`. Investigar en v5. |
| 11 | **Caption > 1024 chars** | Sofia ya hace chunks cortos (Structured Output Parser). Caption típico será <300. Defensivo: `.slice(0, 1000)` en Code node. |
| 12 | **Foto privada futura (Supabase Storage)** | Bucket público con policy `SELECT` solo a anon role; o signed URLs con TTL 24h. Decisión separada del scope actual. |

---

## 7. Resumen ejecutivo para el architect

**Cambios necesarios (10 líneas):**

1. **Edge function `properties-search` → v1.5:** agregar `foto_urls: string[]` + `foto_count: number` al output. Mantener `foto_url` para retrocompat. Sin migration DB necesaria (schema ya soporta multi-imagen y 8/16 propiedades ya las tienen).
2. **Workflow v5 — nuevo Code node** entre `Split Out` y `Loop Over Items`: parsea marcas `[IMG:CR-XXXX]` en chunks de Sofia, las expande a items con shape `{type:"image", url, caption}` o `{type:"text", body}`. Hace query Postgres directo a `properties` por `code` para resolver URLs.
3. **Loop Over Items → branch por `type`:** Switch node antes de `Send Chunk via YCloud`. Dos HTTP nodes hermanos (uno text, uno image) con mismo endpoint `POST /v2/whatsapp/messages` y mismo `X-API-Key`. Cada item del loop ejecuta uno u otro.
4. **System prompt de Sofia (v4 → v5):** instruir a usar `[IMG:CR-XXXX]` cuando presente propiedades, max 1 propiedad por output, marca al inicio del primer MENSAJE. Actualizar `toolDescription` de Properties Tool para mencionar `foto_urls`.
5. **Reglas de envío:** 3 imágenes por propiedad (orden 0,1,2). Caption SOLO en imagen 0 con título + precio. Resto sin caption. Pausa 2s ya existente entre mensajes.
6. **Costo:** $0 incremental dentro de service window 24h (modelo Meta per-message desde Jul 2025 cobra solo templates, no free-form).
7. **Riesgo principal:** URLs 404 desde Unsplash o Supabase Storage privado. Mitigación: `onError: continueRegularOutput` en HTTP image node. Falla suave: lead recibe texto sin imagen, no crash.
8. **NO usar Opción C (tool con side-effect):** rompe invariante "el Loop es la única autoridad de envío" — debug y observabilidad se complican.
9. **Stack confirmado:** YCloud `/v2/whatsapp/messages` con `type:"image"` y `image.link` (URL pública). Header `X-API-Key`. JPG/PNG, max 5 MB. 1 imagen por POST (límite Meta, no YCloud).
10. **Listo para diseño detallado** — todas las incógnitas técnicas resueltas. Pasar a `n8n-architect` para planning del workflow v5.

---

## Apéndice — Fuentes citadas

- YCloud send (cola): https://docs.ycloud.com/reference/whatsapp_message-send.md
- YCloud send (directo): https://docs.ycloud.com/reference/whatsapp_message-send-directly.md
- Ejemplos JSON: https://docs.ycloud.com/reference/whatsapp-messaging-examples.md
- Guía sending: https://docs.ycloud.com/reference/whatsapp-message-sending-guide.md
- Media upload: https://docs.ycloud.com/reference/whatsapp_media-upload.md
- Auth (X-API-Key): https://docs.ycloud.com/reference/authentication.md
- Rate limits: https://docs.ycloud.com/reference/rate-limits.md
- Pricing per-message (Jul 2025): https://docs.ycloud.com/reference/whatsapp-message-pricing-updates.md
- Cloud API Meta image messages: https://developers.facebook.com/docs/whatsapp/cloud-api/messages/image-messages
- Workflow inspeccionado: `n8n/workflows/chatbot-inmobiliaria-demo-ycloud-sofia-v4.json` (versionId `v4-spsp-aware-2026-05-21`)
- Edge function inspeccionada: `properties-search` v1.4.0 vía Supabase MCP
- Schema inspeccionado: `public.properties` (16 active, 8 con multi-imagen)
