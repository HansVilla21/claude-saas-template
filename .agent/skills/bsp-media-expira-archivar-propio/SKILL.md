# Skill: La media del BSP expira — archivarla en Storage propio al recibirla

## Cuándo usar esta skill

- Estás integrando **cualquier BSP de WhatsApp** (YCloud, 360dialog, Twilio, Gupshup, Meta Cloud API directo) y el webhook te entrega la media con una **URL del CDN del proveedor** (`media.link`, `media_url`, etc.).
- Vas a guardar esa URL en tu base "porque funciona" — **ese es el momento de leer esto.**
- Un cliente reporta que **fotos o audios viejos del chat no cargan** (ícono roto, reproductor mudo), pero los recientes sí.
- Estás por escribir un CRM/inbox que muestre historial de conversaciones.

**No usar** para media que TÚ subís (esa ya la controlás). Es para lo que ENTRA por el webhook.

## Por qué existe esta skill

Capturada el **2026-07-16** en el CRM de Momentum. `messages.media_url` apuntaba al CDN de YCloud. Medición real:

| Antigüedad | Estado |
|---|---|
| 7.0 días | HTTP 206 ✅ |
| **7.1 días** | **HTTP 404 💀** |

**YCloud borra a los 7 días EXACTOS.** No era "va a expirar algún día": **ya estaba pasando hacía un mes**.

- **160** medias en total apuntando al proveedor
- **54 perdidas para siempre** (44 audios, 9 fotos, 1 video) — el proveedor ya no las tiene, **no se recuperan**
- **~13 morían por día**

Se entró a la tarea creyendo que era "un problema de render". No lo era: **los archivos no existían.**

## El error que hace esto invisible

La media **se ve perfecta** durante la primera semana. El bug solo aparece cuando alguien abre una conversación vieja — y para cuando lo reportan, **ya perdiste un mes de archivos**. Nada en el código falla, nada loguea un error. Simplemente el historial se vacía solo.

## Proceso

### 1. Medir primero — ¿ya está pasando?

**No asumir el TTL del proveedor: medirlo.** Antes de escribir código, probar las URLs guardadas ordenadas por antigüedad.

```js
// Trae todo lo que apunte al proveedor y probá el rango de edades.
const { data } = await admin.from('messages')
  .select('id, kind, media_url, created_at')
  .like('media_url', '%<dominio-del-bsp>%')
  .order('created_at', { ascending: true });

for (const m of muestra) {
  const dias = ((Date.now() - Date.parse(m.created_at)) / 86400000).toFixed(1);
  const r = await fetch(m.media_url, { method: 'GET', headers: { Range: 'bytes=0-0' } });
  console.log(`${m.kind} hace ${dias}d → HTTP ${r.status}`);
}
```

El corte aparece solo: `7.0d → 206` / `7.1d → 404`. **Ese número es tu TTL real**, no el que dice la doc (la de YCloud es ambigua).

### 2. Rescatar lo que sigue vivo — ES URGENTE

Cada día que pasa se pierde más. **El rescate va ANTES que el fix**, porque el fix no recupera nada.

⚠️ **El filtro correcto NO es `direction='inbound'`.** Es **dónde apunta la URL**. La primera versión del rescate filtró por dirección y dejó afuera **19 medias salientes por coexistencia** (las que el negocio manda desde su propio celular, que entran por el mismo webhook y mueren igual).

```js
.like('media_url', '%<dominio-del-bsp>%')   // ✅ el criterio correcto
// .eq('direction', 'inbound')              // ❌ deja afuera el echo de coexistencia
```

Pasos por archivo: descargar → subir a Storage propio → **firmar la lectura DESPUÉS de subir** → repuntar `media_url`.

**Conservar siempre la URL original** en `media_metadata.ycloud_url` y marcar `archived_at` (hace el script idempotente).

### 3. Archivar hacia adelante, en el webhook

**En segundo plano, nunca bloqueando la respuesta.** El BSP reintenta si tardás.

```ts
function archiveMediaInBackground(sb, args): void {
  const p = archiveMedia(sb, args);
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(p);   // fallback: se espera inline
}
```

**El orden que degrada en vez de romper:**
1. Insertar el mensaje **con la URL del proveedor** → la burbuja se ve al instante.
2. Archivar en background → repuntar `media_url` a la nuestra.
3. Si el archivado falla: la URL del proveedor **sirve 7 días**. Se degrada, no se rompe.

**Engancharlo en TODOS los caminos que traen media** (ver la skill `webhook-contar-event-types-antes-de-arreglar`): el inbound del lead **y** el echo de coexistencia.

### 4. Avisar honestamente lo que ya se perdió

Lo que murió antes del rescate **no vuelve**. Sin manejarlo, la burbuja muestra un ícono roto o un reproductor mudo y **parece un bug del CRM**.

```tsx
const [mediaRota, setMediaRota] = useState(false);
// <img onError={() => setMediaRota(true)} /> → "La foto ya no está disponible"
```

⚠️ **Gotcha que costó tiempo:** si el contenedor de la imagen queda en **0×0** (pasa con un `<button>` `fit-content` + `<img className="w-full">`), **el browser no lazy-carga un 0×0** → nunca falla → **el aviso no aparece jamás**. Quitar `loading="lazy"` o darle tamaño definido al contenedor.

## Output esperado

- `scripts/rescatar-media-<bsp>.mjs` — idempotente, con `--dry-run`. Reporta rescatadas / perdidas / fallos.
- `archiveMedia()` + `archiveMediaInBackground()` en el webhook, enganchado en **todos** los caminos con media.
- Componente de "ya no está disponible" en el render.
- Verificación: reprocesar un evento real con **wamid inventado** (el webhook crea SU fila, se verifica, se borra) → `media_url` en Storage propio + bytes iguales + content-type preservado.

## Ejemplo

**Input:** CRM con 1 mes de conversaciones. Los audios de hace 2 semanas no suenan.

**Output medido (caso real, 2026-07-16):**
```
total media en el BSP: 160
  ✅ rescatadas:  106
  ❌ perdidas:     54   (44 audios, 9 fotos, 1 video)
más vieja VIVA:    7.0d
más nueva MUERTA:  7.1d
```
Verificación post-fix (9/9 contra el webhook desplegado): `media_url` → Storage propio · bytes 37980/37980 · `content-type: image/jpeg`.

## Regla de oro

**La URL que te da el BSP es un préstamo de 7 días, no un lugar donde guardar.** Si tu producto promete historial, la media es tuya o no existe.
