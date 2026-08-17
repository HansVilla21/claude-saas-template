# Skill: Mandar una NOTA DE VOZ real a WhatsApp (con la ondita, no adjunto)

## Cuándo usar esta skill

- Querés que el CRM/bot mande audio y que en WhatsApp se vea como **nota de voz** (burbuja con la ondita, autodescarga, velocidad 1x/2x, transcripción), no como archivo adjunto.
- Mandaste un audio, llegó, pero se ve como **adjunto** con un clip.
- Vas a grabar audio en el browser con `MediaRecorder` para enviarlo a WhatsApp.
- Recibís el error **131053** de Meta al mandar audio.

## Por qué existe esta skill

Leyendo la doc de YCloud uno concluye **"no se puede mandar notas de voz"** — dice que el objeto `audio` acepta solo `link`, y no menciona `voice`. **Es falso: YCloud hace passthrough del flag a Meta.** Verificado en producción.

Y del otro lado: es facilísimo creer que "el formato ya está bien" porque el codec dice `opus`. No alcanza.

## Los DOS requisitos (los dos, o es adjunto)

[Doc oficial de Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/audio-messages)

### 1. El archivo tiene que ser contenedor **Ogg** + codec **OPUS**

**Verificá con `ffprobe`, NUNCA por la extensión.** Meta **descarga el archivo e inspecciona los bytes**:

```
webm : 1a45dfa3   (EBML/Matroska)
ogg  : 4f676753   ("OggS")
```

Renombrar `.webm` → `.ogg` **no sirve** y falla así:

```
errorCode 131053 — "Audio file uploaded with mimetype as audio/ogg; codecs=opus,
however on processing it is of type application/octet-stream."
```

### 2. `"voice": true` dentro del objeto `audio`

Sin el flag, el **mismo** ogg/opus llega como adjunto. Cambia el ícono a micrófono, pero **no es** nota de voz: sin ondita, sin autodescarga, sin transcripción.

## El payload que funciona (YCloud)

`POST https://api.ycloud.com/v2/whatsapp/messages/sendDirectly` · header `X-API-Key`

```json
{ "from": "+506XXXXXXXX", "to": "+506YYYYYYYY", "type": "audio",
  "audio": { "link": "<signed URL>", "voice": true } }
```

**Bonus verificado:** YCloud lee sin problema las **signed URLs privadas de Supabase Storage** (`HTTP 200`, `content-type: audio/ogg`). No hace falta bucket público.

## El problema del browser: MediaRecorder NO graba Ogg

| Navegador | Qué graba | ¿Sirve? |
|---|---|---|
| Chrome / Edge / Firefox / Android | `audio/webm;codecs=opus` | Codec ✅ · contenedor ❌ → **remuxear** |
| Safari / iOS | `audio/mp4` (AAC) | ❌ ni siquiera es Opus → no hay nada que remuxear |

**El codec ya es el correcto; solo está en el envoltorio equivocado.** → No hay que *transcodificar*, hay que *remuxear*: reempaquetar los MISMOS paquetes Opus en páginas Ogg. Sin decode/encode: instantáneo y sin pérdida.

### Cómo remuxear

- **Referencia / test rápido:** `ffmpeg -i entrada.webm -c:a copy salida.ogg` (el `-c copy` es lo que lo hace barato: no recodifica).
- **En producción (browser):** un remuxer en JS puro (~5 KB): parsear EBML → sacar los paquetes Opus de los `SimpleBlock` → escribir páginas Ogg (OpusHead + OpusTags + audio, con granule a 48 kHz leyendo el TOC).

**Alternativas evaluadas y descartadas:**

| Opción | Por qué NO |
|---|---|
| ffmpeg-wasm en cliente | +3 MB de bundle; mata el TTI en mobile |
| ffmpeg en el server | round-trip de 3-5s por audio; además Vercel no trae ffmpeg |
| `opus-media-recorder` | **sin publicar desde 2020** |
| `opus-recorder` | **sin publicar desde 2021** (su README dice que está sin mantener) |

→ Auditá SIEMPRE la fecha de última publicación antes de meter una dep WASM al core.

## Storage (Supabase)

- Bucket **privado** + signed URL de lectura como `audio.link`. Guardá esa URL en `media_url`.
- **Ojo:** si `storage.objects` no tiene policies (bucket creado por API), el rol `authenticated` **no puede subir**. Dos salidas:
  - **Signed upload URL** (recomendado): el server firma con admin (`createSignedUploadUrl`) y el browser sube directo (`uploadToSignedUrl`). No necesita policies nuevas y **no** pasa el audio por la función.
  - Mandar el blob a un server action: ojo que el body está **capado en 1 MB** por defecto → una nota larga lo rompe.
- Verificá el **control negativo**: sin firma, la RLS debe rechazar el upload (`new row violates row-level security policy`).

### ⚠️ El ORDEN de firmado no es negociable

```
createSignedUploadUrl(path)   → se puede firmar ANTES (el objeto no existe todavía)
uploadToSignedUrl(path, ...)  → subir
createSignedUrl(path, ttl)    → SOLO DESPUÉS del upload
```

**`createSignedUrl` sobre un objeto inexistente devuelve `Object not found`.** Si firmás la URL de lectura en el mismo paso que la de upload (que es lo natural: "preparo todo de una"), el flujo entero muere ahí y el audio **nunca sale**. Costó un bug en producción.

→ Necesitás **dos** llamadas al server: una que firma el upload, y otra (`finalize`) que firma la lectura una vez subido.

### No falles en silencio

Si el envío falla, **no borres la burbuja optimista sin avisar**: el usuario ve desaparecer su audio y no tiene idea de por qué. Dejala marcada `failed` + logueá el motivo. El bug de arriba fue invisible justo por esto: el síntoma reportado fue *"mando el audio, desaparece la interfaz y no llega"*, sin ningún error a la vista.

## Gotcha de producto: la ventana de 24h aplica al audio

```
131047 — "more than 24 hours have passed since the customer last replied"
```
El botón de micrófono tiene que estar **deshabilitado con la ventana vencida**, igual que el composer de texto (mismo gate `windowOpen`).

## La trampa del verificador (lección de proceso, cara)

**Un test que ejecuta los pasos en distinto orden que el código real no está verificando el código real.** Pasa en verde y te da falsa confianza.

Pasó acá, literal: el script de prueba firmaba la lectura DESPUÉS del upload; el código lo hacía ANTES. El test decía "end-to-end OK" mientras la feature **nunca había funcionado ni una vez**. Lo encontró el founder probando, no el test.

**Regla:** el script de verificación tiene que reproducir la **misma secuencia de llamadas** que el código de producción — mismo orden, mismos roles (`authenticated`, no `service_role`), mismos argumentos. Si tenés que reordenar algo para que pase, no estás verificando: estás demostrando otra cosa.

Y el corolario: **"delivered" no es "se ve como nota de voz"**, igual que **"el script pasó" no es "la feature anda"**. La única fuente de verdad final es un humano mirando su WhatsApp después de usar la UI real.

## Verificación (Definition of Done)

- [ ] `ffprobe archivo.ogg` → `format_name=ogg`, `codec_name=opus`.
- [ ] La respuesta de YCloud trae `"voice": true` en el eco.
- [ ] El status del mensaje llega a **`delivered`** (consultá `GET /v2/whatsapp/messages/<id>`; si Meta lo rechaza, sale `failed` + `errorCode` — `accepted` NO alcanza).
- [ ] **Un humano confirma que se ve con la ondita.** Es la única fuente de verdad final: `delivered` con `voice` ignorado se ve como adjunto igual.

## Cómo probarlo sin construir nada (spike de 5 min)

```bash
# 1. audio de prueba ogg/opus
ffmpeg -f lavfi -i "sine=frequency=440:duration=3" -ac 1 -c:a libopus -b:a 32k out.ogg
ffprobe out.ogg      # confirmá format_name=ogg, codec_name=opus
# 2. subilo a Storage, firmá la URL, y mandá el payload de arriba
# 3. GET /v2/whatsapp/messages/<id> hasta delivered/failed
# 4. mirá el WhatsApp real
```
Contraste que cierra el caso: mandá el **mismo** audio renombrado vs remuxeado. `failed 131053` vs `delivered`. Un solo cambio, un solo efecto.
