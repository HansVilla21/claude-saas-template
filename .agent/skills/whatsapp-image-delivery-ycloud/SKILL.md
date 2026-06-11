# Skill: WhatsApp Image Delivery via YCloud

## Cuándo usar esta skill

- Implementar envío de imágenes desde un bot (n8n / app server / lambda) a WhatsApp vía YCloud (o cualquier BSP — los principios aplican).
- Diagnosticar por qué un mensaje tipo image fue aceptado por YCloud pero nunca llegó a WhatsApp.
- Mover de "solo texto" a "texto + media" en un flow conversacional existente.

## Por qué existe esta skill

WhatsApp Business API tiene varias trampas no-obvias para envío de imágenes:
1. Solo acepta JPG/PNG. Cualquier URL que sirva WebP/AVIF es rechazada **silenciosamente** por Meta — YCloud nunca te avisa.
2. Una sola imagen por POST. No hay carrusel sin templates.
3. `status: "accepted"` de YCloud NO significa "WhatsApp entregó". Solo significa "YCloud aceptó tu request". El delivery real depende de Meta.
4. URL debe ser pública, accesible desde los servers de Meta, y servir Content-Type correcto.

En Casa CRM perdimos 2 sesiones por ignorar la #1 (Unsplash con `auto=format` servía WebP a Meta).

## Proceso

### 1. Decidir cómo viene la URL de la imagen

Tres opciones, en orden de preferencia:

| Origen | Pros | Contras |
|---|---|---|
| **Supabase Storage propio** | Control total, URL estable, formato garantizado | Hay que subir las imágenes antes |
| **CDN externo controlado** (Cloudinary, ImageKit) | Transformaciones on-the-fly | Costo + dependencia externa |
| **Stock service (Unsplash, etc.)** | Cero costo, URL pública | Sirve WebP por defecto — hay que forzar formato |

**Si usás Unsplash o similar:** forzar parámetros explícitos:
- ❌ `?w=1600&q=80&auto=format&fit=crop` (sirve WebP a Meta → rechazado silencioso)
- ✅ `?w=1600&q=80&fit=crop&fm=jpg` (fuerza JPG)

### 2. Construir el POST a YCloud para image

```http
POST https://api.ycloud.com/v2/whatsapp/messages
Authorization: <YCloud API key via header>
Content-Type: application/json

{
  "from": "+50689839490",       // tu número de WhatsApp Business
  "to": "+50688217229",          // número del destinatario
  "type": "image",
  "image": {
    "link": "https://....jpg",   // URL pública JPG/PNG
    "caption": "Texto opcional (max 1024 chars)"
  }
}
```

Notas:
- `from` y `to` con `+<código>` incluido
- `image.link` debe ser HTTPS, pública, < 5 MB, JPG o PNG
- `caption` es opcional. Si la mandás vacía, mejor omitirla (`caption: ''` algunos BSP lo rechazan)

### 3. Manejar respuesta de YCloud (debug visible)

YCloud responde 200 + `status: "accepted"` cuando recibió el request. Eso NO garantiza entrega. Para diagnóstico cuando algo no llega:

1. **Habilitar `fullResponse: true` y `neverError: true`** en el HTTP node de n8n (o tu HTTP client) para que cualquier 4xx/5xx quede capturado y visible.
2. **Suscribirse al webhook de delivery status** (`whatsapp.message.updated` en YCloud) — ahí llegan los eventos reales: `sent`, `delivered`, `failed` con razón.
3. Si llega 200 + `accepted` pero no llega a WhatsApp, probable causa: **Meta rechazó el fetch de la URL** (formato, accesibilidad, tamaño). Verificar URL en un navegador incognito con `?fm=jpg` apendido — debe descargar como image/jpeg.

### 4. Persistir el outbound en tu DB

Si tu sistema persiste mensajes (CRM con inbox), el webhook `whatsapp.message.updated` te avisa cuando un outbound fue procesado. Es buena práctica insertar el mensaje con `kind='image'`, `media_url=<la URL>`, `media_mime='image/jpeg'` para que la UI pueda renderizar la imagen en lugar de solo el caption.

```typescript
// Edge function ycloud-webhook (Casa CRM, ejemplo real)
function mapMessageKind(ycloudType: string): MessageKind {
  switch (ycloudType) {
    case "image": return "image";
    case "audio": return "audio";
    // ...
  }
}

function extractContent(message): { body, media_url, media_mime, media_metadata } {
  switch (message.type) {
    case "image":
      return {
        body: message.image?.caption || null,
        media_url: message.image?.link,
        media_mime: 'image/jpeg',
        media_metadata: { id: message.image?.id },
      };
  }
}
```

### 5. Renderizar en frontend (si aplica)

En el componente que renderiza burbujas de mensaje (`MessageBubble` en Casa CRM):

```tsx
{msg.kind === 'image' && msg.mediaUrl ? (
  <div>
    <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer">
      <img src={msg.mediaUrl} alt={msg.text || 'Imagen'}
           style={{ width: '100%', maxHeight: 320, objectFit: 'cover' }}
           loading="lazy" />
    </a>
    {msg.text && <div>{msg.text}</div>}
  </div>
) : msg.text ? (
  <div>{msg.text}</div>
) : null}
```

## Output esperado

1. URL de imagen normalizada (forzando JPG si el origen es Unsplash o similar)
2. POST a YCloud que recibe `status: "accepted"` Y la imagen llega al destinatario en WhatsApp
3. Mensaje persistido en DB con `kind='image'` + `media_url`
4. UI que renderiza la imagen (si aplica)
5. Webhook de delivery status conectado para diagnóstico futuro

## Ejemplo concreto (Casa CRM, end-to-end, funcionando 2026-05-21)

1. Sofia LLM genera: `[IMG:CR-2031] Casa moderna en Trejos...`
2. Code node `Expand Property Images` matchea el marker, fetcha `properties-search?codigo=CR-2031`, recibe `foto_urls: ["https://images.unsplash.com/photo-1564013799919-...?w=1600&q=80&auto=format&fit=crop"]`
3. `normalizeImageUrl` transforma → `https://images.unsplash.com/photo-1564013799919-...?w=1600&q=80&fit=crop&fm=jpg`
4. Emite item `{ type: 'image', url: '...', caption: 'CR-2031 — Casa moderna en Escazú, $485,000' }`
5. HTTP node POSTea a YCloud → recibe `statusCode: 200, status: "accepted"`
6. WhatsApp del lead recibe la foto + caption
7. YCloud webhook `whatsapp.message.updated` → edge function inserta en `messages` con `kind='image', media_url=...`
8. Inbox CRM (vía Realtime) renderiza `<img>` con caption

## Gotchas / antipattern

- **NO confiar en `status: "accepted"`** como confirmación de entrega. Es solo recibo de YCloud.
- **NO mandar URLs con `auto=format`** desde Unsplash sin forzar `&fm=jpg`. Meta rechaza WebP silencioso.
- **NO intentar carrusel multi-imagen sin template** aprobado por Meta — no existe esa API.
- **NO pasar `caption: ''`** vacío. Si no hay caption, omitir el campo.
- **NO mandar URLs detrás de auth** (S3 firmado con expiración corta, etc.) — Meta puede fallar al fetcharla. Usar URLs públicas estables.
- **NO usar URLs sin extensión clara**. Algunos BSP/Meta requieren `.jpg/.png` aparente. Si la URL es opaca, hostealos vos.

## Skills relacionadas

- `n8n-code-node-debug-pattern` — `normalizeImageUrl` debe usar string ops (no `new URL()`)
- `bot-llm-marker-expand-pattern` — patrón de marker `[IMG:CR-XXXX]` que dispara el envío
- `ycloud-webhook-to-supabase` (futura) — edge function que recibe updates de YCloud

## Memoria global del founder (relacionada)

- `feedback_whatsapp_image_format.md` — learning específico del incidente Casa CRM 2026-05-21
