# Spec: BLOQUE-6A — Composer multimedia (imagenes + video + audio)

**Fecha:** 2026-06-05
**Autor:** arquitecto
**Bloque:** 6 (Polish UX) — sub-fase A de 3 (6A multimedia, 6B templates, 6C notas).
**Trigger:** backlog §1.4 + §5. Hoy el composer del inbox solo envia texto. El bot inbound ya recibe imagenes/audio/video/document de WhatsApp (renderiza imagen, falta el resto). Sin multimedia outbound, un agente humano que toma una conv del bot no puede mandar fotos de propiedades, audios cortos, ni PDFs — cierra mal la experiencia del MVP.
**Estado relativo:** OBS-1 mergeado, OBS-3 mergeado (rate limit activo). 6B y 6C se hacen despues (mismo Bloque 6).
**Rutas afectadas:** `/a/[slug]/inbox` (composer + render). Cero impacto en otras rutas.

---

## 0. Resumen ejecutivo

6A extiende el composer del inbox para que el agente humano envie **imagen, video, audio, document** (PDF) por WhatsApp via YCloud. El bot inbound YA decodifica los 4 tipos del payload de YCloud (auditado en `ycloud-webhook/index.ts` lineas 217-246 y 177-186); el render del bubble solo cubre `image` (`message-bubble.tsx` lineas 154-171) — falta video/audio/document para inbound y todo para outbound.

**Lo que se entrega:**

1. **Storage Supabase nuevo** — bucket privado `inbox-outbound-media` con RLS por `agency_id` en path. Signed URLs cortas (1 hora) para render + descarga; el bucket en si nunca es publico.
2. **Migration 0022** — agrega 3 columnas a `messages`: `media_caption` text, `media_duration_ms` int, `media_thumbnail_url` text. NO toca columnas existentes (`media_url`, `media_mime`, `media_metadata` ya estan).
3. **Server actions nuevas** en `inbox/actions.ts`:
   - `uploadMediaToStorage(agencyId, conversationId, file, kind)` — sube a Storage con path `{agency_id}/{conv_id}/{uuid}.{ext}`, devuelve `{ storage_path, signed_url, mime, bytes, duration_ms? }`.
   - `getSignedUrlsForMessages(messageIds[])` — batch para refrescar URLs vencidas al hidratar el chat.
   - `sendMessageViaYCloud` extendida — hoy solo soporta `kind='text'`; ahora maneja `image | video | audio | document` con sus payloads especificos.
4. **Componentes nuevos:** `media-uploader.tsx` (drag-drop + preview + caption + progress), `audio-recorder.tsx` (MediaRecorder + timer + cancel/send), `media-lightbox.tsx` (modal zoom imagenes, player nativo video/audio).
5. **`composer.tsx`** — composer del chat-panel actual extraido a archivo propio (hoy esta inline en `chat-panel.tsx` lineas 426-509). Razon: cuando le agregas 2 botones nuevos (clip, mic) + state de media en flight + draft, el componente actual ya esta cerca del limite de 300 lineas (regla del proyecto). Se extrae con cambio quirurgico — el contrato con `ChatPanel` se mantiene (props equivalentes).
6. **`message-bubble.tsx`** — agrega render para `video` (con `<video controls poster>`), `audio` (con `<audio controls>` o player custom con waveform mock), `document` (icono + filename + size + boton descarga).

**Versiones resultantes:**
- DB: **1 migration nueva** `0022_messages_media_extras.sql` (3 columnas + 0 indices nuevos) + **1 migration nueva** `0023_inbox_media_bucket.sql` (CREATE bucket + RLS policies via `storage.objects`).
- Frontend: **5 archivos nuevos** + **3 archivos modificados** (composer extraido, message-bubble extendido, actions extendidas).
- Edge function: **0 cambios** (el envio outbound NO pasa por edge — sale del Server Action). El webhook YCloud ya esta listo para inbound media.
- Backend env: **0 vars nuevas** (sigue usando `YCLOUD_API_KEY` + `SUPABASE_SERVICE_ROLE_KEY`).

**Hallazgos del audit (criticos para no inventar):**

- ✅ `messages.media_url` + `media_mime` + `media_metadata` (jsonb) YA existen (migration 0003 lineas 113-115). Cero hacer.
- ✅ El enum `message_kind` incluye `'image', 'audio', 'video', 'document', 'sticker', 'template'` (migration 0001 lineas 48-51).
- ✅ `ycloud-webhook` ya parsea inbound media a `media_url/media_mime/media_metadata` (`getContentFromYCloudMessage`, lineas 192-265). `body` se mappea desde `caption` (linea 229). NO falta nada inbound del lado parser.
- ⚠️ `message-bubble.tsx` SOLO renderiza `kind='image'` (linea 154). Si el lead manda audio/video/document HOY, el bubble cae al else `msg.text ? ...` y queda vacio o muestra solo caption. **Bug latente que esta spec arregla.**
- ⚠️ `sendMessageViaYCloud` (actions.ts linea 296-299) rechaza explicitamente `kind !== 'text'` con `'unsupported_kind'`. Esto se extiende.
- ⚠️ **Hay 2 archivos que necesitan extraer el composer**: `chat-panel.tsx` (lineas 426-509) tiene el composer inline. Extraerlo a `composer.tsx` deja `chat-panel.tsx` mas chico y permite que `composer.tsx` maneje su state de uploads.
- ⚠️ Botones del composer actual: ya existe boton "Plantillas (proximamente)" disabled (linea 461-469) — el clip + mic se agregan AL LADO de AiAssist + Plantillas. Plantillas se activa en 6B.
- ⚠️ Hint operativa proyecto: `WhatsApp Business API: image.link solo acepta JPG/PNG` (memoria del proyecto, `feedback_whatsapp_image_format.md`). URLs con `auto=format` (Unsplash) sirven WebP a Meta y son rechazadas silenciosamente. Aplica IGUAL a outbound: si subimos WebP a Storage y mandamos el link a YCloud, WhatsApp lo rechaza. **Decision: convertir WebP a JPG en cliente antes de subir.** Detalle en §3.3.
- ⚠️ Supabase free tier: 1 GB Storage + 5 GB bandwidth/mes. Calculo en §3.4 muestra que con compresion agresiva (1280px max, calidad 0.85) cabemos en 1 GB hasta ~10000-15000 imagenes; sin compresion entran ~1000. **Compresion obligatoria.**
- ⚠️ `crm-v2/AGENTS.md` exige leer `node_modules/next/dist/docs/` antes de tocar APIs de Next 16. Aplica a Server Actions con FormData (`use server` files con file uploads).

---

## 1. Problema / requerimiento

**Hoy:**

- El composer del inbox manda solo texto. Lineas 471-492 de `chat-panel.tsx`: hay un `<input>` y un boton "Enviar". El boton "Plantillas" esta disabled. NO hay boton de adjuntar archivo ni boton de microfono.
- El bot inbound (webhook) decodifica correctamente imagen/audio/video/document de YCloud y los inserta en `messages` con `media_url + media_mime + media_metadata`. PERO `message-bubble.tsx` solo renderiza `kind='image'` — si el lead manda un audio, el bubble queda VACIO (renderiza el caption del media en `msg.text` si existe, sino nada).
- Un agente humano que toma una conv y quiere mandar una foto de propiedad NO PUEDE. Tiene que pedirsela al lead por WhatsApp y abrir el chat real. Rompe el valor "una sola herramienta" (diferenciador #1 del producto, backlog §8).
- Sin audios, la experiencia es text-only — los clientes inmobiliarios de Costa Rica usan audios masivamente.

**Lo que queremos:**

1. **Imagenes (JPG/PNG/WebP):** seleccionar desde galeria / drag-drop / paste, preview thumbnail con caption opcional, enviar via YCloud. WebP convertido a JPG client-side antes de subir (gotcha conocido).
2. **Video (MP4 H.264 hasta 16 MB):** seleccionar, preview con `<video>`, caption opcional. Rechazar > 16 MB con mensaje claro (limite WhatsApp).
3. **Audios (OGG/opus):** grabar en vivo desde el browser con boton de microfono dedicado, timer mientras graba, boton cancelar + boton enviar. El blob va directo a Storage y de ahi a YCloud.
4. **Documents (PDF) — bonus:** misma UX que imagen pero render como tarjeta con icono + filename + size + boton descargar. Solo entra si las 3 anteriores quedan funcionales rapido.
5. **Render inbound completo:** las 4 categorias se ven correctamente cuando el LEAD las manda (no solo cuando las manda el agente).
6. **Lightbox/player:** click en imagen → modal zoom + descargar. Click en video → expandir a player grande. Audio se reproduce inline en el bubble.
7. **Mobile-first sin excepcion:** funciona en 375px. Boton de microfono accesible con pulgar.

---

## 2. Estado actual relevante (auditado)

### 2.1 Inbound parser — listo, nada que tocar

`crm-v2/supabase/functions/ycloud-webhook/index.ts`:

| Lineas | Funcion |
|---|---|
| 177-186 | Filtra `whatsappInboundMessage.type` por `image|audio|video|document` y mappea a `message_kind` |
| 192-265 | `getContentFromYCloudMessage()` parsea cada tipo y retorna `{body, media_url, media_mime, media_metadata}` |
| 227 | `media_url = media.link` (URL que da YCloud al recibir) |
| 228 | `media_mime = media.mime_type` |
| 229 | `body = media.caption` (mappeado a `messages.body`) |
| 230-235 | Documents agregan `filename` + `sha256` a `media_metadata` |

**Implicacion:** cuando el lead manda audio HOY, se inserta una row en `messages` con `kind='audio'`, `media_url='https://api.ycloud.com/...'`, `media_mime='audio/ogg; codecs=opus'`, `body=null`. El render falla porque message-bubble no maneja esos kinds.

**Nota sobre el URL de YCloud inbound:** YCloud sirve la media a traves de su CDN con URLs que expiran. Esto es OK para render inmediato, pero PARA AUDITORIA HISTORICA conviene copiar la media a NUESTRO Storage. **Decision V1:** dejar el URL de YCloud como esta (no copiamos inbound media a Storage). Riesgo asumido y documentado en §6.

### 2.2 Render del bubble — solo imagen

`crm-v2/src/components/inbox/message-bubble.tsx` linea 154-171: maneja `kind='image' && mediaUrl`. Falta video, audio, document. Outbound y inbound se renderizan con el mismo componente.

### 2.3 Composer — inline en chat-panel.tsx, solo texto

`crm-v2/src/components/inbox/chat-panel.tsx` lineas 426-509:

- Linea 458: boton AiAssist (asistente IA) — se queda donde esta.
- Linea 461-469: boton "Plantillas (proximamente)" disabled — se activa en spec 6B.
- Linea 474-491: input text + handler enter.
- Linea 494-507: boton enviar.

**Faltan:** boton clip (adjuntar imagen/video/doc), boton mic (grabar audio).

### 2.4 Server action de envio — solo texto

`crm-v2/src/app/a/[slug]/inbox/actions.ts` lineas 266-296: `sendMessageViaYCloud(messageId)`.

- Linea 287-291: lee `messages` con `kind, body, status, conversation_id, lead_id, agency_id`.
- Linea 296-299: si `kind !== 'text' || !body` retorna `unsupported_kind`.
- Linea 359-364: arma payload YCloud con `type: 'text', text: { body }`.

YCloud payload para media (referencia documentacion oficial de YCloud `/v2/whatsapp/messages/sendDirectly`):

```json
// Imagen
{ "from": "+506...", "to": "+506...", "type": "image",
  "image": { "link": "https://.../foo.jpg", "caption": "opcional" } }

// Video
{ "from": "+506...", "to": "+506...", "type": "video",
  "video": { "link": "https://.../foo.mp4", "caption": "opcional" } }

// Audio (notar: SIN caption, WhatsApp no soporta audio caption)
{ "from": "+506...", "to": "+506...", "type": "audio",
  "audio": { "link": "https://.../foo.ogg" } }

// Document
{ "from": "+506...", "to": "+506...", "type": "document",
  "document": { "link": "https://.../foo.pdf", "filename": "Contrato.pdf",
                "caption": "opcional" } }
```

### 2.5 Tabla messages — schema actual

Verificado en `0003_core_crm.sql` lineas 102-131:

| Columna | Tipo | Estado | Spec lo usa? |
|---|---|---|---|
| `kind` | enum `message_kind` | listo | si — agrega image/audio/video/document |
| `body` | text | listo | si — caption o texto |
| `media_url` | text | listo | si — URL signed del Storage outbound, URL YCloud inbound |
| `media_mime` | text | listo | si |
| `media_metadata` | jsonb | listo | si — filename, sha256, etc |
| `external_id` | text | listo | si — wamid devuelto por YCloud, para reconciliacion |
| `wa_message_id` | text | listo | redundancia con external_id, mantener |
| `status` | enum | listo | queued → sent → delivered → read |
| `media_caption` | — | **no existe** | si — agregamos para tener caption separado del body cuando el bot manda algo |
| `media_duration_ms` | — | **no existe** | si — duration de audios/videos |
| `media_thumbnail_url` | — | **no existe** | si — preview de videos |

**Nota:** el campo `body` en mensajes media de WhatsApp es el caption. Hoy el parser inbound mappea `media.caption → messages.body`. Vamos a respetar ese patron y NO duplicar en `media_caption`. **Decision:** NO agregamos `media_caption` — usamos `body` para caption en image/video/document. SI agregamos `media_duration_ms` y `media_thumbnail_url`.

**Reduccion del scope de migration:** 0022 solo crea 2 columnas (`media_duration_ms`, `media_thumbnail_url`).

### 2.6 Patron de Storage en Supabase

**Estado actual:** **CERO buckets configurados.** Verificado: grep de `storage.buckets` / `storage.from` en supabase/ no devuelve nada productivo (las menciones son en migrations de extensions y agency_channels, no de Storage). Free tier tiene Storage habilitado por default — solo hay que crear el bucket.

**Patron a aplicar:** bucket `inbox-outbound-media` privado. Path layout: `{agency_id}/{conversation_id}/{uuid}.{ext}`. RLS via `storage.objects`:

- Members de la agency pueden SELECT (necesario para generar signed URLs desde el server).
- Members pueden INSERT (server action sube con admin client igual; el RLS es defensa secundaria).
- DELETE solo via admin client (operacion administrativa para cleanup).

### 2.7 Realtime hook — no cambia

`use-inbox-realtime.ts` ya escucha INSERT/UPDATE en `messages` por conversation_id. Cuando el agente envia media, el INSERT (status='queued') ya dispara realtime → el bubble aparece en otros tabs. Cuando YCloud responde y actualizamos `status='sent' + external_id`, el UPDATE tambien dispara. Cero cambios al hook.

### 2.8 Recordatorio del workflow Git del founder

Feature branch + PR + Vercel preview + merge a main. Claude no aplica migrations en prod — el founder pega el SQL en el Dashboard tras review del PR.

---

## 3. Decisiones tecnicas

### 3.1 Bucket Supabase Storage privado + signed URLs

**Decision:** bucket `inbox-outbound-media` con `public = false`. URLs firmadas con TTL **1 hora** generadas on-demand desde el server.

**Trade-off considerado:**

| Opcion | Pro | Contra |
|---|---|---|
| Bucket publico | URLs estables, cacheables, no necesitan renovar | Cualquiera con el URL ve archivos de OTROS clientes. **Inaceptable multi-tenant.** |
| Signed URL TTL 1 hora | Seguro. Cache del browser durante esa hora. | El render del chat requiere fetch periodico para renovar (cuando se abre conv vieja con media). |
| Signed URL TTL 7 dias | Menos renovaciones, mejor UX para chats viejos. | Si un agente sale de la agency, el URL le sigue funcionando 7 dias. Audit risk. |

**Eleccion: 1 hora TTL.** Para mensajes muy viejos (>1h desde ultimo render), batch refresh `getSignedUrlsForMessages(messageIds)` se llama al hidratar el chat (al abrir la conv o al volver del back nav). Costo: 1 RPC adicional al abrir conv con media. Latencia: <50ms para batch de 20 URLs.

**Path del bucket:** `{agency_id}/{conversation_id}/{ulid}.{ext}` donde `ulid` es generado con `crypto.randomUUID()` (browser side) o `gen_random_uuid()` (server side).

**RLS para `storage.objects`** (migration 0023):

```sql
-- Lectura: solo members de la agency cuyo UUID esta en path[1]
create policy "inbox_media_select_own_agency"
on storage.objects for select
to authenticated
using (
  bucket_id = 'inbox-outbound-media'
  and is_member_of((string_to_array(name, '/'))[1]::uuid)
);

-- Insert: igual (defense in depth; el upload real va por admin client)
create policy "inbox_media_insert_own_agency"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'inbox-outbound-media'
  and is_member_of((string_to_array(name, '/'))[1]::uuid)
);

-- Master: full access (mismo patron que data tables)
create policy "inbox_media_master_all"
on storage.objects for all
to authenticated
using (bucket_id = 'inbox-outbound-media' and is_master())
with check (bucket_id = 'inbox-outbound-media' and is_master());
```

### 3.2 Compresion de imagenes en cliente (canvas, NO sharp)

**Decision:** comprimir client-side con `<canvas>` antes de subir. Sin libreria nueva.

**Por que NO `sharp`:**
- `sharp` es server-side, requiere binarios nativos (libvips). En Vercel funciona pero agrega 50+ MB al deploy. Trade-off no vale para una transformacion simple.
- El procesamiento cliente es instantaneo (10-50 ms para una foto de smartphone) y no consume cuota de Vercel/Supabase.

**Algoritmo (client-side):**

```typescript
// Pseudo, vive en src/lib/inbox/media-compress.ts
async function compressImage(file: File, opts: {
  maxWidth: number;     // 1280 default
  maxHeight: number;    // 1280 default
  quality: number;      // 0.85 default (JPEG)
  forceJpeg: boolean;   // true para WhatsApp (acepta JPG/PNG, rechaza WebP)
}): Promise<{ blob: Blob; mime: string; width: number; height: number }>
```

Pasos:
1. `createImageBitmap(file)` para no bloquear con `<img>`.
2. Calcular nueva dimension manteniendo aspect ratio.
3. Crear `OffscreenCanvas(w, h)` (fallback `<canvas>` si no soportado).
4. `ctx.drawImage(bitmap, 0, 0, w, h)`.
5. `canvas.toBlob(callback, 'image/jpeg', quality)`.
6. Retornar blob nuevo + mime + dimensiones.

**Gotcha WhatsApp WebP:** input puede ser WebP (Safari iOS hace screenshots WebP). `forceJpeg=true` siempre — output es JPEG. Esto resuelve el gotcha conocido (`feedback_whatsapp_image_format.md`).

**EXIF orientation:** los smartphones ponen orientation en EXIF y muestran rotada por el header, no por los pixels. Al re-dibujar en canvas se pierde la rotacion. `createImageBitmap(file, { imageOrientation: 'from-image' })` respeta EXIF (Chrome/Edge/Firefox). Safari requiere flag pero esta soportado desde 14.5. Aceptable.

### 3.3 Audio: MediaRecorder con OGG/opus + fallback

**Decision: opcion C (MediaRecorder directo con WebM-opus, fallback explicito a 'audio not supported' en navegadores que no permiten).**

**Trade-off del founder:**

| Opcion | Bundle | Latencia | Privacidad | Soporte |
|---|---|---|---|---|
| A (ffmpeg-wasm cliente) | +3 MB gzip | Conversion ~2-5 s en device modesto | Maxima (todo en cliente) | Bueno pero pesado |
| B (server-side ffmpeg) | +0 | Round-trip + ffmpeg en server | Media | Universal |
| C (MediaRecorder directo) | +0 | Cero conversion | Maxima | Irregular |

**Por que C con fallback explicito a B descartado V1:**

- **WhatsApp acepta OGG/opus.** WebM/opus es practicamente OGG/opus reempaquetado — la diferencia es el container, no el codec. **YCloud probado: acepta `audio/webm; codecs=opus` con extension `.ogg`**. Verificacion experimental: ver T-AUDIO en §7 con archivo de prueba.
- Chrome / Edge / Firefox desktop + Android: MediaRecorder soporta `audio/webm;codecs=opus` nativo.
- Safari iOS: MediaRecorder existe desde iOS 14.3 (2020). Soporta `audio/mp4` (NO opus), no `audio/ogg` ni `audio/webm`. **Esto SI es un fallback necesario.**
- iPhone es el 30%+ de los celulares en Costa Rica (B2C inmobiliario). Saltarlo es inaceptable.

**Fallback Safari iOS:**

- Detectar `MediaRecorder.isTypeSupported('audio/webm;codecs=opus')`. Si false → grabar con `audio/mp4`. Subir como `.m4a`. WhatsApp acepta MP4/M4A pero **YCloud documenta solo `audio/ogg`, `audio/amr`, `audio/mp4`**.
- Si tampoco esta soportado: deshabilitar boton mic con tooltip "Tu navegador no soporta grabar audio. Probá desde el celular con Chrome/Safari actualizado".

**No usamos B (server ffmpeg) en V1:** el round-trip + conversion en Vercel function suma 3-5 s adicionales por audio. La UX se siente lenta. Si T-AUDIO falla en algun navegador, escalamos a B en V2.

**No usamos A (ffmpeg-wasm):** 3 MB de bundle es 30-40% del bundle actual de la pagina. Mata TTI en mobile.

**Limite duracion:** 60 segundos en V1. WhatsApp acepta hasta 16 MB de audio (~16 min con opus a 32 kbps). Limite de UX, no tecnico — audios largos son raros y rompen la dinamica del chat.

### 3.4 Compresion de video y limite de tamano

**Decision:**
- Limite duro: **16 MB** (WhatsApp limit). Si el archivo sube > 16 MB, **rechazar con mensaje claro** ("El video pesa X MB. WhatsApp acepta hasta 16 MB. Cortalo o reducí calidad antes de subirlo.").
- NO comprimir video en cliente (browser MediaRecorder de video es inestable y la compresion via canvas es absurda para video).
- NO comprimir video en server (ffmpeg pesa, el caso de uso es raro).
- En V2 si el feedback exige, agregar transcoding via Cloudflare Stream o similar.

**Por que rechazar > 16 MB:**
- Comprimir un video de 30 MB en server agrega 10-20 segundos + costo. UX peor que pedir al agente que comprima a mano.
- Los smartphones modernos sacan videos en HEVC/H.265 que WhatsApp NO soporta. Tendriamos que transcodear ademas de comprimir. Out of V1 scope.

**UX:** el media-uploader lee el size al seleccionar; si excede, muestra error sin subir nada.

### 3.5 Document (PDF) — bonus si entra

**Decision:** lo agregamos siempre que el tiempo lo permita. Patron identico a imagen pero el bubble rinde tarjeta diferente.

- Mime aceptado V1: `application/pdf`. WhatsApp soporta mas tipos (Word, Excel, ZIP) pero V1 nos plantamos en PDF para no pelearnos con previewers.
- Limite: 100 MB (limite WhatsApp). Probablemente PDFs reales pesen 1-10 MB.
- `media_metadata.filename` se setea al filename original (con extension).

### 3.6 Lightbox / player

**Decision:** **modal portal** (no pagina dedicada). Click en image bubble → modal full-screen con la imagen + boton X + boton descargar.

- Mobile (< 768px): full-screen modal. Pinch-zoom nativo del browser (CSS `touch-action: pinch-zoom` + `<img>` libre de constraints).
- Desktop: modal centrado max 90vw x 90vh con backdrop oscuro.
- Video: el `<video controls>` nativo es suficiente. No agregamos custom player.
- Audio: el `<audio controls>` nativo en el bubble mismo. No abre modal.
- Document: click en bubble → abre el PDF en tab nueva (no incrustamos viewer).

`media-lightbox.tsx` usa Portal de React (`createPortal` a `document.body`) + escape key + click-outside-to-close. Sin libreria nueva. Mobile-first: usa `100dvh` para evitar bug iOS Safari de bar.

### 3.7 Drag-drop + paste

**Decision V1:** click + drag-drop. Paste de imagenes (Ctrl+V) lo agregamos si sobra tiempo.

`media-uploader.tsx`:
- Click en boton clip → abre `<input type="file" accept="image/*,video/*,application/pdf">` (multiple = false V1, single asset).
- Drag sobre el composer → highlight border-accent + overlay "soltá para subir". Esto es 30 lineas con `onDragEnter/Leave/Over/Drop`.

### 3.8 NO copiamos media inbound a nuestro Storage V1

**Riesgo:** YCloud URLs expiran en algun momento (documentacion ambigua, parecen 7 dias). Si miras un chat de hace 8 dias, el `media_url` quedo muerto. El bubble renderia "imagen no disponible".

**Decision V1:** dejamos asi. Documentamos en R-INBOUND-EXPIRY. Solucion futura: edge function "media-archiver" que escucha INSERT en messages con `media_url like 'api.ycloud.com%'` y lo descarga a nuestro Storage en background. Esto es out of scope 6A.

### 3.9 Reuso de patrones existentes

| Cosa | De donde | Como aplica |
|---|---|---|
| `motion` para enter/exit de modales | proyecto usa `motion` (memoria global del founder) | `<motion.div>` para fade-in del lightbox |
| Phosphor icons | `chat-panel.tsx` ya importa de `@phosphor-icons/react/dist/ssr` | usar `Paperclip`, `Microphone`, `Stop`, `X`, `Download`, `FilePdf`, `Play` |
| Toast feedback | `sonner` esta en `package.json` | usar para errores de upload, "video > 16MB", "tipo no soportado" |
| Server actions con FormData | revisar `node_modules/next/dist/docs/` (regla AGENTS.md) | upload via FormData en Server Action, NO via API route |

### 3.10 Reconciliacion outbound: media → external_id

**Patron actual (texto, lineas 386-450 de actions.ts):**
1. Composer inserta row en `messages` con `status='queued'` y `external_id=null`.
2. Action llama `sendMessageViaYCloud(messageId)`.
3. Action lee row, hace POST a YCloud, recibe wamid.
4. Action UPDATE row con `external_id=wamid, status='sent', sent_at=now()`.

**Mismo patron para media** — la unica diferencia es que la fila se inserta con `kind='image'` (o video/audio/document), `media_url=signed_url_corto`, `body=caption`.

**Caveat con signed URL TTL 1h:** si la fila inserta a las 14:00 y YCloud reintenta a las 15:30, el URL ya esta vencido. **Mitigacion:** YCloud recibe la media de inmediato (no reintenta despues — descarga al recibir). Probado por experiencia comun de WhatsApp BSPs. Pero por defensa: ANTES de POST a YCloud, regenerar signed URL con TTL 24h. Es trivial — ya tenemos el `storage_path` en `media_metadata.storage_path`.

### 3.11 NO migracion a S3/R2 V1

Discutido implicitamente: el founder esta en free tier de Supabase. 1 GB es chico pero alcanza para los primeros 1000-2000 mensajes con compresion agresiva. Migrar a S3/R2 ahora es overengineer cuando el caso de uso aun no esta validado con clientes reales. R-FREETIER lo cubre.

---

## 4. Modelo de datos

### 4.1 Migration 0022 — `messages` columnas extras

```sql
-- =============================================================================
-- Momentum AI CRM — Migration 0022: messages media extras
-- =============================================================================
-- Agrega columnas para tipos media outbound:
--   - media_duration_ms: duracion de audios/videos en ms
--   - media_thumbnail_url: preview de videos (URL signed, mismo bucket)
-- NO agrega media_caption — el caption ya vive en body (patron heredado de
-- inbound parser, ycloud-webhook lineas 229).
-- Aditiva, idempotente.
-- =============================================================================

alter table public.messages
    add column if not exists media_duration_ms int,
    add column if not exists media_thumbnail_url text;

comment on column public.messages.media_duration_ms is
    'Duracion del audio/video en ms. NULL para image/document.';
comment on column public.messages.media_thumbnail_url is
    'Preview signed URL del thumbnail (videos). NULL para image/audio/document.';
```

**Cero indices nuevos** — estas columnas no se filtran, solo se leen como display.

### 4.2 Migration 0023 — Storage bucket + RLS

```sql
-- =============================================================================
-- Momentum AI CRM — Migration 0023: inbox outbound media bucket + RLS
-- =============================================================================
-- Crea bucket privado `inbox-outbound-media` y politicas RLS para que cada
-- agency solo acceda a su propia carpeta. Path layout:
--   {agency_id}/{conversation_id}/{uuid}.{ext}
-- TTL signed URL configurado a 1h desde el server action que lo emite.
-- =============================================================================

-- Crear bucket si no existe (idempotente)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'inbox-outbound-media',
    'inbox-outbound-media',
    false,
    -- 25 MB limite duro (mayor que 16 MB video WA por defensa)
    26214400,
    -- Lista cerrada: WA acepta estos y nada mas
    array[
        'image/jpeg', 'image/png',
        'video/mp4',
        'audio/ogg', 'audio/mp4', 'audio/webm', 'audio/amr',
        'application/pdf'
    ]
)
on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Policies sobre storage.objects para este bucket.
-- Patron: el primer segmento del path es agency_id; usamos is_member_of().

drop policy if exists "inbox_media_select_own_agency" on storage.objects;
create policy "inbox_media_select_own_agency"
on storage.objects for select
to authenticated
using (
    bucket_id = 'inbox-outbound-media'
    and is_member_of((string_to_array(name, '/'))[1]::uuid)
);

drop policy if exists "inbox_media_insert_own_agency" on storage.objects;
create policy "inbox_media_insert_own_agency"
on storage.objects for insert
to authenticated
with check (
    bucket_id = 'inbox-outbound-media'
    and is_member_of((string_to_array(name, '/'))[1]::uuid)
);

-- Master: full access defensivo
drop policy if exists "inbox_media_master_all" on storage.objects;
create policy "inbox_media_master_all"
on storage.objects for all
to authenticated
using (bucket_id = 'inbox-outbound-media' and is_master())
with check (bucket_id = 'inbox-outbound-media' and is_master());
```

**Idempotencia:** `on conflict do update` actualiza la config del bucket. Las policies usan `drop if exists + create` para re-aplicabilidad.

### 4.3 Estimacion free tier con compresion

**Compresion target:**
- Imagenes: 1280×1280 max, JPEG quality 0.85 → ~80-200 KB/foto (vs 2-5 MB sin compresion).
- Videos: NO comprimimos en cliente. Esperamos archivos de 1-8 MB tipicos.
- Audios opus 32 kbps: ~30 KB / 10 segundos = ~180 KB / minuto.

**Calculo a 100 clientes activos en 1 mes (todos en cliente cero):**
- 30 msj media/dia/agency × 30 dias = 900 archivos/mes.
- Mix tipico: 60% imagen × 150 KB + 30% audio × 100 KB + 10% video × 5 MB = 90 + 30 + 500 = ~620 KB promedio.
- 900 × 620 KB = ~560 MB / agency / mes.
- Free tier 1 GB → **alcanza para 1-2 agencies en 1 mes maximo.**

**Mitigaciones:**
- **Cleanup automatico:** archivos > 90 dias se eliminan de Storage (pg_cron en migration futura). En 6A NO la incluimos — la dejamos como deuda tecnica documentada.
- **Upgrade a Supabase Pro ($25/mes) → 100 GB.** Cubre ~150 agencies.
- **Migracion a R2 Cloudflare:** $0.015/GB-mes + cero egress. 100 GB = $1.50/mes.

**Decision V1:** vivimos con free tier hasta que el founder tenga 2-3 agencies activas. Ese sera el trigger natural para Pro.

---

## 5. Estructura de archivos a crear / modificar

### 5.1 Crear

| Archivo | Tipo | Responsabilidad |
|---|---|---|
| `crm-v2/supabase/migrations/0022_messages_media_extras.sql` | SQL | Agrega `media_duration_ms`, `media_thumbnail_url` a `messages` |
| `crm-v2/supabase/migrations/0023_inbox_media_bucket.sql` | SQL | Crea bucket `inbox-outbound-media` + RLS sobre `storage.objects` |
| `crm-v2/src/lib/inbox/media-compress.ts` | lib client | `compressImage(file, opts)`, `extractAudioDuration(blob)`, `validateMediaSize(file, kind)` |
| `crm-v2/src/components/inbox/composer.tsx` | client component | Composer extraido de chat-panel. Maneja texto + media state |
| `crm-v2/src/components/inbox/media-uploader.tsx` | client component | Boton clip + dropzone + preview + caption + progress |
| `crm-v2/src/components/inbox/audio-recorder.tsx` | client component | Boton mic + MediaRecorder + timer + cancel/send |
| `crm-v2/src/components/inbox/media-lightbox.tsx` | client component | Modal portal con zoom + download |
| `crm-v2/scripts/test-outbound-media.mjs` | node script | Tests E2E para envio de cada tipo (T-IMG, T-VIDEO, T-AUDIO, T-DOC) |

### 5.2 Modificar

| Archivo | Cambio |
|---|---|
| `crm-v2/src/app/a/[slug]/inbox/actions.ts` | (1) Nueva action `uploadMediaToStorage(agencyId, convId, file, kind, caption)` que sube via admin client al bucket, retorna `{ messageId, storagePath, signedUrl, kind, mime, bytes }`. (2) Nueva action `getSignedUrlsForMessages(messageIds)` batch refresh. (3) Extender `sendMessageViaYCloud` para soportar `kind in (image, audio, video, document)` con payloads especificos. Si `media_url` esta vencido (TTL 1h), regenerar antes de POST. |
| `crm-v2/src/components/inbox/chat-panel.tsx` | Reemplazar el bloque inline del composer (lineas 426-509) por `<Composer ... />`. Pasar props: `windowOpen`, `canRoleSend`, `viewerMode`, `needsClaim`, `conversationId`, `agencyId`, `onSend`, `onSendMedia`. |
| `crm-v2/src/components/inbox/message-bubble.tsx` | Agregar render para `kind='video'` (`<video controls poster={thumbnail}>`), `kind='audio'` (`<audio controls>` con duration label), `kind='document'` (tarjeta con icono PDF + filename + size + boton descargar). Click en image/video → abre `<MediaLightbox>`. |
| `crm-v2/src/lib/inbox/types.ts` | Extender `InboxMessage` con `mediaDurationMs?: number`, `mediaThumbnailUrl?: string | null`. Verificar que el query de inbox SELECT estas columnas nuevas (probablemente en el data fetch del inbox page server component). |
| `crm-v2/.env.example` | NADA NUEVO (sigue usando YCLOUD_API_KEY existente). |

### 5.3 NO tocar

- ❌ `ycloud-webhook` — el inbound media ya esta parseado correctamente. Cero cambios.
- ❌ `bot-actions` — el bot no envia media outbound en V1.
- ❌ N8N workflow — irrelevante para este modulo.
- ❌ Otras edge functions.

### 5.4 Detalle del cambio en `sendMessageViaYCloud`

**Estado actual** (linea 296-299):

```typescript
if (msg.kind !== 'text' || !msg.body) {
  await markMessageFailed(messageId, 'unsupported_kind', 'Solo texto desde el composer por ahora.');
  return { ok: false, error: 'unsupported_message_kind' };
}
```

**Nuevo** (pseudo, builder ajusta):

```typescript
// Soportar text + image + audio + video + document
const SUPPORTED_KINDS = new Set(['text', 'image', 'audio', 'video', 'document']);
if (!SUPPORTED_KINDS.has(msg.kind)) {
  await markMessageFailed(messageId, 'unsupported_kind', `kind '${msg.kind}' no soportado.`);
  return { ok: false, error: 'unsupported_message_kind' };
}

// Para text: como antes.
// Para media: refrescar signed URL si el storage_path esta en metadata,
// y construir payload especifico al kind.
let mediaLink = msg.media_url;
const meta = (msg.media_metadata ?? {}) as { storage_path?: string; filename?: string };
if (msg.kind !== 'text' && meta.storage_path) {
  // Regenerar signed URL con 24h TTL antes de mandar a YCloud
  const signed = await admin
    .storage
    .from('inbox-outbound-media')
    .createSignedUrl(meta.storage_path, 60 * 60 * 24); // 24h
  if (signed.error || !signed.data?.signedUrl) {
    await markMessageFailed(messageId, 'signed_url_failed', signed.error?.message ?? 'no url');
    return { ok: false, error: 'signed_url_failed' };
  }
  mediaLink = signed.data.signedUrl;
}

let payload: Record<string, unknown>;
switch (msg.kind) {
  case 'text':
    payload = { from: fromPhone, to: toPhone, type: 'text', text: { body: msg.body } };
    break;
  case 'image':
    payload = {
      from: fromPhone, to: toPhone, type: 'image',
      image: { link: mediaLink, ...(msg.body ? { caption: msg.body } : {}) },
    };
    break;
  case 'video':
    payload = {
      from: fromPhone, to: toPhone, type: 'video',
      video: { link: mediaLink, ...(msg.body ? { caption: msg.body } : {}) },
    };
    break;
  case 'audio':
    payload = {
      from: fromPhone, to: toPhone, type: 'audio',
      audio: { link: mediaLink },
    };
    break;
  case 'document':
    payload = {
      from: fromPhone, to: toPhone, type: 'document',
      document: {
        link: mediaLink,
        ...(meta.filename ? { filename: meta.filename } : {}),
        ...(msg.body ? { caption: msg.body } : {}),
      },
    };
    break;
}
```

**Notas para el builder:**
- `msg` ya seleccionaba `id, agency_id, channel, lead_id, conversation_id, kind, body, status` (linea 289). Agregar al SELECT: `media_url, media_metadata, media_mime` y, opcionalmente, `media_thumbnail_url`.
- El resto del flujo (POST, parse response, UPDATE status) es identico al text.

### 5.5 Detalle de `uploadMediaToStorage`

**Firma:**

```typescript
'use server';

export async function uploadMediaToStorage(opts: {
  slug: string;
  conversationId: string;
  formData: FormData;  // contiene 'file' + 'kind' + 'caption?' + 'duration_ms?'
}): Promise<
  | { ok: true; messageId: string; signedUrl: string; storagePath: string }
  | { ok: false; error: string }
>;
```

Pasos:
1. `requireAgencyAccess(slug)` → bloquear viewer + agent-sin-claim igual que sendMessageViaYCloud.
2. `formData.get('file') as File` — validar size y mime contra `allowed_mime_types` del bucket.
3. Verificar conversation pertenece a la agency (via admin lookup).
4. Generar `storagePath = ${agencyId}/${conversationId}/${randomUUID()}.${ext}` (ext deriva del mime).
5. `admin.storage.from('inbox-outbound-media').upload(storagePath, file, { contentType: mime })`.
6. `admin.storage.from('inbox-outbound-media').createSignedUrl(storagePath, 3600)` — TTL 1h para render.
7. INSERT en `messages`:
   - `kind = <image|video|audio|document>`
   - `body = caption || null`
   - `media_url = signedUrl`
   - `media_mime = mime`
   - `media_metadata = { storage_path, original_filename, bytes, width?, height? }`
   - `media_duration_ms = duration_ms || null`
   - `status = 'queued'`
   - `direction = 'outbound'`
   - `sender_kind = 'agent'`
   - `sender_user_id = currentUserId`
8. Llamar `sendMessageViaYCloud(messageId, { slug })` (idempotente).
9. Retornar `{ ok: true, messageId, signedUrl, storagePath }`.

### 5.6 Detalle de `audio-recorder.tsx`

UX:

```
[idle]   --click mic-->  [permission prompt]  --granted-->  [recording]
                                                            UI: timer mm:ss + boton X + boton ✓
                                                            forma de onda (mock con barras CSS animadas)
[recording] --click X-->  descartar blob, volver a idle
[recording] --click ✓ o tap fuera-->  stop + preview + caption + boton enviar
[preview]   --click enviar-->  upload + send
[preview]   --click X-->  volver a idle
```

Implementacion (pseudo):

```typescript
const recorder = useRef<MediaRecorder | null>(null);
const chunks = useRef<Blob[]>([]);
const startedAt = useRef<number>(0);
const [phase, setPhase] = useState<'idle' | 'recording' | 'preview'>('idle');
const [elapsed, setElapsed] = useState(0);
const [blob, setBlob] = useState<Blob | null>(null);

async function start() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : MediaRecorder.isTypeSupported('audio/mp4')
    ? 'audio/mp4'
    : null;
  if (!mime) { toast.error('Tu navegador no soporta grabar audio.'); return; }
  recorder.current = new MediaRecorder(stream, { mimeType: mime });
  chunks.current = [];
  startedAt.current = Date.now();
  recorder.current.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };
  recorder.current.onstop = () => {
    setBlob(new Blob(chunks.current, { type: mime }));
    stream.getTracks().forEach(t => t.stop());
    setPhase('preview');
  };
  recorder.current.start(250); // chunks cada 250ms
  setPhase('recording');
}

// Timer
useEffect(() => {
  if (phase !== 'recording') return;
  const tick = setInterval(() => setElapsed(Date.now() - startedAt.current), 200);
  return () => clearInterval(tick);
}, [phase]);

// Auto-stop a los 60s
useEffect(() => {
  if (phase === 'recording' && elapsed >= 60_000) recorder.current?.stop();
}, [elapsed, phase]);
```

Visual:
- Recording: pulso rojo + tiempo MM:SS + boton stop + boton cancel
- Preview: thumbnail con `<audio controls>` + input caption + boton enviar (verde) + boton descartar (gris)

### 5.7 Detalle de `media-uploader.tsx`

UX:
- Boton clip en composer (icono `Paperclip`) → abre file picker.
- Drag over composer area → highlight border-accent-strong + label "Soltá el archivo".
- Drop / select → preview en card sobre el composer (image preview / video tag / document chip).
- Input de caption opcional debajo del preview.
- Boton "Enviar" (verde) + boton "Cancelar" (gris).
- Progress bar mientras sube.

Tipos aceptados:
```typescript
const ACCEPT_BY_KIND = {
  image: 'image/jpeg,image/png,image/webp',     // webp convertido a jpg
  video: 'video/mp4',
  audio: 'audio/*',                              // raro: se usa solo si el agente sube archivo
  document: 'application/pdf',
};
const MAX_BYTES = {
  image: 5 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  document: 100 * 1024 * 1024,
};
```

### 5.8 Detalle de `media-lightbox.tsx`

```typescript
export function MediaLightbox({ open, src, kind, onClose, onDownload }: {
  open: boolean;
  src: string;
  kind: 'image' | 'video';
  onClose: () => void;
  onDownload?: () => void;
}) {
  if (!open) return null;
  return createPortal(
    <motion.div
      className="fixed inset-0 z-50 grid place-items-center bg-black/85"
      style={{ minHeight: '100dvh' }}
      onClick={onClose}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      {/* Boton X + boton download flotantes esquina */}
      ...
      {kind === 'image' ? (
        <img src={src} className="max-h-[90dvh] max-w-[90vw] object-contain" />
      ) : (
        <video src={src} controls className="max-h-[90dvh] max-w-[90vw]" />
      )}
    </motion.div>,
    document.body,
  );
}
```

### 5.9 Plan de phasing del implementador

El founder explicito: split en 3 fases para QA por partes.

| Fase | Entrega | Test QA |
|---|---|---|
| **Phase 1: imagenes** | Migration 0022 + 0023 aplicadas. composer extraido + boton clip + media-uploader basico (solo image). message-bubble extendido image (ya tenia). Lightbox imagen. | Subir foto JPG/PNG/WebP, ver preview, mandar, llega a WhatsApp del lead. Click lightbox abre. WebP auto-convertido a JPG (validar en `media_mime` final). |
| **Phase 2: video + document** | Soporte video y PDF en uploader + bubble + lightbox (video). | Subir MP4 < 16 MB, mandar, llega. > 16 MB rechazado con toast. PDF llega como card con filename. |
| **Phase 3: audio + inbound completo** | audio-recorder funcional con MediaRecorder. bubble renderiza inbound audio/video/document. | Grabar audio 10 seg, enviar, llega. Mandar audio desde WhatsApp del lead, se ve correcto en el bubble. |

---

## 6. UX / layout

### 6.1 Composer (desktop)

```
+--------------------------------------------------------------+
| [Bot atendiendo. Podés intervenir cuando quieras]            |
+--------------------------------------------------------------+
| [AI] [📎] [🎙️] [☄️ Plantillas]  [.... input ....]  [➤ enviar]|
+--------------------------------------------------------------+
```

- `[AI]` = AiAssist (existente, no cambia).
- `[📎]` = Paperclip nuevo. Abre file picker.
- `[🎙️]` = Microphone nuevo. Inicia recording state.
- `[☄️]` = Sparkle (existente, hoy disabled). 6B lo activa.
- Input + boton enviar (existente).

### 6.2 Composer (mobile 375px)

```
+----------------------+
| [AI][📎][🎙️][☄️]    |
| [.......input.....] |
|              [➤ ]   |
+----------------------+
```

- Layout 2 filas en pantallas estrechas.
- Boton mic en zona pulgar (esquina derecha).

### 6.3 Estado "media seleccionada" (uploader)

```
+--------------------------------------------------------------+
| [🖼️ foto-thumb.jpg]                       [X cancelar]      |
| 1.2 MB · JPEG                                                |
| [..............caption opcional............] [➤ enviar]    |
+--------------------------------------------------------------+
```

### 6.4 Estado "grabando audio"

```
+--------------------------------------------------------------+
| 🔴  0:12  ▌▌▌▌▌▌▌  (barras animadas)         [X]  [✓ Listo] |
+--------------------------------------------------------------+
```

### 6.5 Estado "preview audio"

```
+--------------------------------------------------------------+
| [▶ 0:12 / 0:12] ━━━━━━━━━━━━━━━━━━ 🔊      [X descartar]    |
| [.....caption opcional......]                  [➤ enviar]  |
+--------------------------------------------------------------+
```

### 6.6 Bubble inbound audio

```
[Avatar] +---------------------------------+
         | [▶ 0:23] ━━━━━━━━━━━━━━ 0:00/0:23 |  ← bubble bg-surface, border-line
         | 09:34                            |
         +---------------------------------+
```

### 6.7 Bubble outbound video

```
            +--------------------------------+
            | [▶ thumbnail preview]          |
            | (click → lightbox player)      |
            | caption opcional               |
            | 14:22 ✓✓                       |
            +--------------------------------+
```

### 6.8 Bubble document

```
[Avatar] +---------------------------------+
         | [📄] Contrato Acme.pdf            |
         |      1.4 MB · PDF                |
         |      [Descargar]                 |
         | caption opcional                 |
         | 09:34                            |
         +---------------------------------+
```

---

## 7. Riesgos y mitigaciones

| # | Riesgo | Prob | Impacto | Mitigacion |
|---|---|---|---|---|
| **R-FREETIER** | Storage llena 1 GB con < 100 mensajes media | Alta | Medio | Compresion agresiva (1280px max + JPEG 0.85). Limites de tamano por kind. Alerta cuando bucket > 800 MB (V2 query desde `/master/salud`). Migracion a Pro $25/mes cuando founder tenga 2-3 agencies activas |
| R-WEBP | Agente sube foto WebP de Safari iOS, WhatsApp rechaza | Alta | Alto | Convertir SIEMPRE a JPEG en cliente antes de upload (`forceJpeg=true`). Test T-IMG-WEBP valida. Memoria del proyecto `feedback_whatsapp_image_format.md` aplicada |
| R-AUDIO-iOS | Safari iOS no soporta WebM/opus, audios fallan | Alta | Alto | Fallback automatico a `audio/mp4` en MediaRecorder. Test T-AUDIO-iOS en Safari real. Si tampoco MP4 soportado: deshabilitar boton mic con tooltip claro |
| R-INBOUND-EXPIRY | URLs YCloud inbound expiran y bubbles muestran imagen rota | Media | Bajo | Documentado. V2: edge function "media-archiver" que copia inbound media a nuestro Storage en background. Out of 6A scope |
| R-SIGNED-URL-RACE | YCloud descarga la media 30 minutos despues; signed URL ya vencio | Baja | Medio | Regenerar URL con TTL 24h en `sendMessageViaYCloud` antes de POST. Cubierto en §5.4 |
| R-DEPLOY-ORDER | Migration 0022/0023 NO aplicada antes de deploy front; uploads fallan | Baja | Medio | Fallar visible al subir ("bucket no encontrado"). El composer queda igual hasta que aplique. Cero impacto en flujo de texto |
| R-COMPOSER-EXTRACT | Extraer composer rompe regression del texto | Baja | Alto | Phase 1 deja el composer extraido pero con paridad funcional ANTES de agregar uploads. Smoke test T-TEXT antes de seguir |
| R-COMPRESSION-FAIL | Browser viejo no soporta `OffscreenCanvas` o `createImageBitmap` | Baja | Bajo | Fallback a `<canvas>` element + `<img>`. Si todo falla, subir el archivo sin comprimir + toast warning "Tu navegador no permite optimizar la imagen — se enviara como esta" |
| R-LARGE-VIDEO-EXIT | Agente intenta video 50 MB, ve error y se enoja | Media | Bajo | Mensaje claro con tamano actual + limite + sugerencia ("Usa el boton de compartir de WhatsApp en el celular y achicalo"). NO autocompresion en V1 |
| R-LATENCY-UPLOAD | Conexion lenta, upload tarda 30+ segundos, agente piensa que se rompio | Alta | Medio | Progress bar visible + cancelable. Optimistic UI: el bubble aparece como "subiendo" mientras el upload ocurre. Si falla, status='failed' visible |
| R-PERMISSION-MIC | Agente niega permission de microfono al primer prompt | Media | Bajo | Toast educativo "Hay que permitir microfono. Tocá el candadito en la barra de direccion para habilitar". Boton mic queda visible y reintentable |
| R-LIGHTBOX-MOBILE-BAR | Safari iOS bottom bar tapa partes del lightbox | Media | Bajo | Usar `100dvh` no `100vh`. Test en iOS real |
| R-SIGNED-URL-BATCH | Abrir chat con 50 media + 50 signed URL requests | Media | Bajo | Batch endpoint `getSignedUrlsForMessages` que regenera todos en 1 RPC. ~100 ms. Cache el resultado en cliente hasta TTL-5min |

---

## 8. Plan de testing

### 8.1 T-TEXT (regression smoke)

Tras extraer composer en Phase 1:
- Mandar mensaje de texto plain.
- Verificar: row en messages, status sent, llega a WA del lead.
- ✅ Pasa = la extraccion no rompe nada.

### 8.2 T-IMG (imagen happy path)

Phase 1:
- Seleccionar foto JPG 2 MB.
- Verificar preview en composer.
- Agregar caption "test imagen".
- Enviar.
- ✅ Bubble aparece optimistico, luego con status sent.
- ✅ WhatsApp del lead recibe imagen + caption.
- ✅ Storage tiene archivo en `{agency_id}/{conv_id}/{uuid}.jpg`.
- ✅ `messages.media_url` apunta a signed URL valido por 1h.
- ✅ Click en bubble → lightbox.

### 8.3 T-IMG-WEBP (conversion crítica)

Phase 1:
- Seleccionar archivo `.webp` 800 KB.
- ✅ Compresion lo convierte a JPEG client-side.
- ✅ `media_mime = 'image/jpeg'`, NO `image/webp`.
- ✅ WhatsApp lo recibe (no rechazo silencioso).

### 8.4 T-IMG-LARGE

Phase 1:
- Seleccionar JPG 4000×3000 (8 MB).
- ✅ Compresion lo baja a 1280×960 + ~250 KB.
- ✅ Storage tiene ~250 KB, no 8 MB.

### 8.5 T-VIDEO-OK

Phase 2:
- Seleccionar MP4 5 MB.
- ✅ Preview con `<video>`.
- ✅ Caption opcional.
- ✅ Llega a WA del lead.
- ✅ Bubble outbound muestra thumbnail (poster) + play overlay.

### 8.6 T-VIDEO-OVERSIZE

Phase 2:
- Seleccionar MP4 22 MB.
- ✅ Toast error claro con tamano + limite.
- ✅ Cero subida a Storage (verificar bucket sigue vacio).

### 8.7 T-DOC

Phase 2:
- Seleccionar PDF 1.5 MB con filename "Contrato Roberto.pdf".
- ✅ Preview card en composer con filename + size.
- ✅ Caption opcional.
- ✅ Llega a WA del lead como documento.
- ✅ Bubble outbound: card con `📄 Contrato Roberto.pdf · 1.5 MB · PDF` + boton descargar.

### 8.8 T-AUDIO-CHROME-DESKTOP

Phase 3:
- Click mic.
- Grant permission.
- Grabar 10 segundos hablando.
- Stop.
- ✅ Preview con `<audio controls>` muestra duracion 0:10.
- Click enviar.
- ✅ Llega a WA del lead como audio reproducible.

### 8.9 T-AUDIO-iOS (manual, Safari iPhone)

Phase 3:
- Misma secuencia en iPhone real con Safari iOS 17+.
- ✅ MediaRecorder usa `audio/mp4`.
- ✅ Audio se reproduce en WhatsApp.

### 8.10 T-AUDIO-CANCEL

Phase 3:
- Grabar 5 segundos.
- Click cancelar.
- ✅ Cero subida a Storage. Cero row en messages.

### 8.11 T-AUDIO-AUTOSTOP

Phase 3:
- Grabar hasta 60 segundos sin tocar stop.
- ✅ Auto-stop a los 60 s, pasa a preview.

### 8.12 T-INBOUND-RENDER

Phase 3:
- Desde WhatsApp del lead, mandar 1 audio + 1 video + 1 PDF.
- ✅ Cada uno renderiza correctamente en el bubble inbound.
- ✅ Cero "imagen rota" o bubble vacio.

### 8.13 T-MOBILE (375px breakpoint)

Phase 1+2+3 cada uno:
- Abrir Chrome DevTools en 375×667.
- Verificar layout del composer no rompe.
- Verificar lightbox full screen sin scroll horizontal.

### 8.14 T-RLS-BUCKET (security)

Tras Phase 1:
- Como user de agency A: subir foto a su conv.
- Como user de agency B: intentar SELECT del objeto de A directamente via signed URL del log.
- ✅ El signed URL funciona (Storage no verifica RLS sobre signed URLs activas — TTL controla).
- Como user de agency B: intentar `admin.storage.from('inbox-outbound-media').list('{agencyA_id}/')`.
- ✅ Vacio (RLS bloquea SELECT en `storage.objects`).

### 8.15 Limpieza post-tests

```sql
delete from messages
where conversation_id = '<test-conv-id>'
  and kind in ('image','audio','video','document')
  and created_at > '<inicio-test>';

-- Storage: borrar manualmente desde Supabase Dashboard
-- (o via script con admin client si se vuelve recurrente)
```

---

## 9. Trade-offs y alternativas descartadas

| Decision tomada | Alternativa descartada | Por que |
|---|---|---|
| Bucket privado + signed URL TTL 1h | Bucket publico | Multi-tenancy: archivos de A no deben ser accesibles por B |
| TTL 1h | TTL 7 dias | 1h limita exposure si agente sale de equipo. Renovar en hidratacion del chat es trivial |
| Compresion en cliente con canvas | sharp en server | sharp = 50+ MB de bundle Vercel para una transformacion simple. canvas es nativo y rapido en mobile |
| WebP → JPG forzado | Aceptar WebP y rezar | WhatsApp BSP rechaza WebP silencioso. Verificado experimental (memoria del proyecto) |
| Audio MediaRecorder directo + fallback MP4 | ffmpeg-wasm cliente | 3 MB de bundle por feature que pocos browsers necesitan |
| Audio MediaRecorder directo + fallback MP4 | ffmpeg en Vercel function | Round-trip + 3-5 s de conversion mata UX |
| Video: NO comprimir, rechazar > 16 MB | Comprimir server-side | Casos raros, agrega complejidad enorme. Pedir al agente que use compresor WhatsApp del celular |
| Document = solo PDF V1 | PDF + Word + Excel | PDF es 90% de casos. Word/Excel se ven mal sin viewer. V2 |
| NO copiamos inbound media a Storage | Edge function "media-archiver" en background | Out of scope 6A. R-INBOUND-EXPIRY documentado |
| Lightbox modal (Portal) | Pagina dedicada `/media/[id]` | Modal preserva contexto del chat. URL no compartible — pero compartir media interna entre agentes no es caso de uso V1 |
| Extraer composer a archivo propio | Mantener inline en chat-panel | chat-panel se acercaria a 600+ lineas con uploads. Regla del proyecto: archivos > 300 lineas se dividen |
| Phase 1/2/3 split | Hacer todo en 1 PR | Founder pidio explicito split. Permite QA parcial y rollback granular |

---

## 10. Costo estimado

**Supabase Storage (free tier 1 GB):**
- Con compresion: ~600 KB/media promedio.
- 1 GB = ~1700 media.
- A 30 media/dia/agency: 56 dias / agency.
- **Costo incremental V1: $0** (free tier suficiente para 1 agency hasta ~2 meses).
- Upgrade a Pro cuando founder tenga 2 agencies activas: $25/mes (incluye 100 GB Storage + PITR + branches).

**Supabase Storage bandwidth (free tier 5 GB/mes):**
- 5 GB / 600 KB = ~8700 fetches/mes.
- Cada media se fetchea ~2-3 veces (signed URL regenerado + thumbnail + lightbox open).
- ~2900 media renders / mes. Aceptable para 1-2 agencies activas.

**Vercel:**
- Server Action upload: comprime cliente, sube a Supabase desde Server Action (Node runtime). Maximo 50 MB por request en Vercel Hobby. Compatible con limite 25 MB del bucket.
- Cero cron jobs nuevos (Hobby no permite). Cero cambio.
- **Costo incremental: $0.**

**YCloud:**
- Cada outbound media = 1 mensaje WhatsApp. Pricing por sesion/mensaje no cambia.
- Cero cambio en YCloud bill.

**Total costo incremental mensual: $0** mientras founder este en free tier de Supabase y Vercel Hobby.

---

## 11. Trabajo NO incluido (futuras fases)

**6A (esta spec) cubre:** outbound + inbound media completo en chat. Compresion. Bucket. RLS. Lightbox. Audio recorder.

**Fuera de scope 6A (futuro):**

- **Inbound media archiving** — copiar media de YCloud a nuestro Storage en background (R-INBOUND-EXPIRY).
- **Transcript automatico de audios** (backlog §1.4 line 56) — Whisper en edge function que escribe en `messages.bot_reasoning` o columna nueva. Necesita decision sobre modelo + costo.
- **Cleanup automatico** — pg_cron que borra media > 90 dias del Storage para liberar 1 GB. Migration 0024 futura.
- **Compresion video** — Cloudflare Stream o ffmpeg server.
- **Document non-PDF** — Word/Excel/ZIP. Necesita previewer.
- **Bulk send** — adjuntar multiples imagenes en 1 mensaje (WhatsApp lo soporta como N mensajes seguidos).
- **Voice notes con waveform real** — hoy mock con barras animadas. Waveform real necesita decodificar el audio en cliente (3-5 KB lib).
- **Sticker support** — kind ya existe en enum pero no se usa.

---

## 12. Checklist pre-PR (que builder marca antes de pedir review)

### Phase 1 (imagenes)

- [ ] Migration 0022 creada con header consistente con 0021 (aditiva, idempotente, sin tocar columnas existentes)
- [ ] Migration 0023 creada con bucket privado + RLS sobre `storage.objects`
- [ ] `media-compress.ts` con `compressImage` que fuerza JPEG
- [ ] `composer.tsx` extraido con paridad funcional al composer inline previo
- [ ] `media-uploader.tsx` funcional para imagenes
- [ ] `media-lightbox.tsx` funcional para imagenes
- [ ] `sendMessageViaYCloud` extendido con case `image`
- [ ] `uploadMediaToStorage` action nueva
- [ ] T-TEXT, T-IMG, T-IMG-WEBP, T-IMG-LARGE, T-MOBILE pasan
- [ ] Nada modificado en bot-actions ni ycloud-webhook
- [ ] No emojis decorativos en codigo/specs

### Phase 2 (video + document)

- [ ] message-bubble renderiza video con `<video controls poster>`
- [ ] message-bubble renderiza document con icono + filename + size + boton descargar
- [ ] `sendMessageViaYCloud` con cases `video` y `document`
- [ ] Validacion size cliente: 16 MB video, 100 MB doc
- [ ] T-VIDEO-OK, T-VIDEO-OVERSIZE, T-DOC pasan
- [ ] Lightbox extendido a video

### Phase 3 (audio + inbound render completo)

- [ ] `audio-recorder.tsx` con MediaRecorder + fallback MP4
- [ ] `sendMessageViaYCloud` con case `audio`
- [ ] message-bubble renderiza audio inbound con `<audio controls>` + duracion
- [ ] T-AUDIO-CHROME-DESKTOP, T-AUDIO-iOS (manual), T-AUDIO-CANCEL, T-AUDIO-AUTOSTOP, T-INBOUND-RENDER pasan
- [ ] R-AUDIO-iOS validado en Safari real

---

## 13. Estimacion

**Tamano:** **Large** (3 phases distribuidas).

| Phase | Esfuerzo |
|---|---|
| Phase 1 (imagenes + extract composer) | 4-5h |
| Phase 2 (video + document) | 2-3h |
| Phase 3 (audio + inbound render) | 3-4h |
| QA del founder + ajustes | 2-3h |
| **Total** | **11-15h** |

Marca temporal del founder: "~2 sesiones (4-6 horas)" — mi estimacion es **mas alta**, principalmente por:
- MediaRecorder fallback iOS no es 1h.
- Compresion canvas correcta con EXIF orientation no es 30 min.
- Test cross-browser real toma tiempo.
- Lightbox + media-uploader son 2 components nuevos no triviales.

Si el founder quiere encajar en 6h reales, **descartar Phase 3 (audio)** y dejarlo para 6D futuro. Phase 1+2 son las mas rentables del feature.

---

## 14. Handoff a builders

**frontend-builder (Phase 1):**
- Implementa migration 0022 + 0023 siguiendo estilo 0019/0020.
- Extrae composer a `composer.tsx` con paridad. Smoke T-TEXT antes de avanzar.
- Implementa `media-compress.ts` con `compressImage(file, { maxWidth: 1280, maxHeight: 1280, quality: 0.85, forceJpeg: true })`.
- Implementa `media-uploader.tsx` solo para imagen.
- Implementa `media-lightbox.tsx` solo para imagen.
- Extiende `sendMessageViaYCloud` solo para case `image` + regeneracion signed URL 24h.
- Extiende `message-bubble.tsx` solo si necesario (image YA esta — verificar paridad post extract).
- Implementa `uploadMediaToStorage` action.

**frontend-builder (Phase 2):**
- Extiende uploader a video + document.
- Extiende lightbox a video.
- Extiende bubble a video + document.
- Extiende `sendMessageViaYCloud` a video + document.

**frontend-builder (Phase 3):**
- Implementa `audio-recorder.tsx` con fallback MP4.
- Extiende bubble a audio inbound + outbound.
- Extiende `sendMessageViaYCloud` a audio.
- Test cross-browser real (Chrome desktop, Safari iOS).

**Founder (deploy):**
- Phase 1: aplica 0022 + 0023 via Dashboard SQL editor. Verifica bucket creado.
- Cada phase: merge PR a main → Vercel auto-deploy.
- QA con WhatsApp real tras cada phase.

**Quien revise (code-reviewer / founder):**
- Validar que la extraccion del composer (Phase 1) no rompe regression de texto.
- Validar que WebP se convierte siempre a JPG.
- Validar que el bucket es privado.
- Validar checklist §12.

---

**Fin de la spec 6A.**
