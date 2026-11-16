# Skill: Subir archivos grandes sin pasar por el servidor (el techo de 4.5 MB de Vercel)

## Cuándo usar esta skill

- Vas a construir **cualquier** subida de archivos en una app en Vercel: expediente de un cliente,
  material de producto, brochures, contratos, fotos, comprobantes.
- El cliente reporta *"subí el PDF y no pasó nada"* / *"se queda pensando"* / *"lo subí y no aparece"*
  y **no hay ningún error** — ni en pantalla, ni en los logs de la función.
- Un archivo chico sube bien y uno grande no. **Ese contraste es el diagnóstico completo.**
- Estás por subir el límite en `next.config` (`bodySizeLimit`) o a validar el tamaño en el Server
  Action. **Pará: nada de eso corre.**
- Vas a armar un **"Descargar todo"** que junta varios archivos del storage en un .zip. El techo
  también aplica a la **respuesta**: ver **"La otra mitad"**, al final.

**Costo de no usarla:** en el CRM de Josué (2026-08-17) los brochures y contratos de más de 4.5 MB
fallaban **en silencio** desde el día uno. El cliente creyó durante semanas que el sistema
"a veces no guarda". Nadie lo vio porque en desarrollo local no existe el límite.

---

## Por qué existe esta skill

**Vercel corta el cuerpo de cualquier request a 4.5 MB.** Es un límite **duro de plataforma**, en
Hobby y en Pro, no configurable por proyecto. Lo aplica el edge **antes** de que tu función se
ejecute.

Las tres consecuencias que hacen el bug invisible:

1. **`bodySizeLimit` de `next.config.ts` no te salva.** Ese ajuste es de Next; Vercel corta antes.
   Subirlo a `12mb` da la sensación de haberlo arreglado y no cambia nada en producción.
2. **Tu validación de tamaño en el Server Action nunca corre.** El código que dice
   `if (file.size > 10MB) return { error: "muy grande" }` está en la función — y la función no
   llega a arrancar. Por eso el usuario no ve tu mensaje.
3. **El 413 de Vercel es mudo para el usuario.** Vuelve como un fallo de red genérico. Un
   `try/catch` alrededor del Server Action normalmente lo traga o muestra "Error inesperado".

Y el motivo de fondo: **el archivo no tiene por qué pasar por tu servidor.** El servidor solo
necesita decidir *si esta persona puede subir* y *dónde va*. Los bytes van directo al storage.

---

## Proceso

### 1. Reconocer el patrón antes de escribir código

Toda subida en Vercel se diseña en **dos pasos**, no en uno. No es una optimización tardía: es
la forma correcta desde el primer commit, porque el límite ya está ahí.

```
❌ navegador → [Server Action con el archivo] → storage      (techo 4.5 MB, falla mudo)
✅ navegador → [Server Action: dame permiso]  → URL firmada
   navegador → storage (directo, sin techo de Vercel)
   navegador → [Server Action: registrá el metadato]
```

### 2. Paso A — el servidor da permiso, no recibe bytes

En el Server Action, **gateá primero** (rol, dueño del recurso, cuota), después firmá:

```ts
// document-actions.ts
export async function pedirUrlDeSubida(entidadId: string, nombreArchivo: string) {
  await requireAdmin()                       // el gate NO se mueve: sigue en el servidor
  const ruta = `${entidadId}/${crypto.randomUUID()}-${sanitizar(nombreArchivo)}`
  const { data, error } = await supabaseAdmin
    .storage.from("documentos")
    .createSignedUploadUrl(ruta)             // vence sola; no expone la service key
  if (error) return { ok: false, error: error.message }
  return { ok: true, ruta, token: data.token }
}
```

- La URL firmada **caduca** y sirve para **una** ruta. No es una llave general.
- La ruta la decide el **servidor**, nunca el cliente: si el nombre viene del navegador, alguien
  escribe en la carpeta de otro.

### 3. Paso B — el navegador sube directo

```ts
const { ok, ruta, token } = await pedirUrlDeSubida(leadId, file.name)
if (!ok) return mostrarError(...)
const { error } = await supabase.storage
  .from("documentos")
  .uploadToSignedUrl(ruta, token, file)      // esto NO toca Vercel
if (error) return mostrarError(error.message)  // ← el error SÍ se ve
```

### 4. Paso C — recién ahora, el metadato

Segundo Server Action: guardar fila (`ruta`, `nombre`, `tamaño`, `subido_por`, `entidad_id`).
Es un request chico, no tiene problema de tamaño.

> Si el paso C falla, quedó un archivo huérfano en el storage. Aceptable, pero **anotalo**: una
> limpieza periódica de objetos sin fila es media hora que evita una factura rara.

### 5. Ahora sí, poné tu límite — y que sea visible

Con el techo de la plataforma esquivado, el tope lo elegís vos (en el CRM de Josué: **25 MB**).
Validalo **en el navegador antes de subir**, que es donde el usuario puede reaccionar, y
**otra vez en el paso C** (el navegador miente).

### 6. Verificá con un archivo grande de verdad

No con uno de 200 KB. Generá uno de ~6 MB, subilo, y **confirmá contra el storage real** que el
objeto existe con el tamaño correcto. En local nunca vas a reproducir el bug: el límite es de
Vercel, no de Next.

```bash
# archivo de prueba de 6 MB
head -c 6291456 /dev/urandom > /tmp/prueba-6mb.pdf
```

---

## Output esperado

- Un flujo de subida en 3 pasos (permiso → subida directa → metadato).
- El gate de permisos **intacto en el servidor**.
- Un tope de tamaño propio, validado en el cliente, con mensaje visible.
- Round-trip verificado con un archivo por encima de 4.5 MB **contra el storage real**.

---

## Gotchas / antipatrones

- 🔴 **Subir `bodySizeLimit` y darlo por arreglado.** Es el arreglo que parece que funciona. No
  toca el límite real.
- 🔴 **Dejar la validación de tamaño SOLO en el Server Action.** Nunca corre para el caso que te
  importa. Tiene que estar en el navegador.
- 🔴 **Dejar que el cliente elija la ruta del archivo.** Es escritura arbitraria en el bucket.
- ⚠️ **Errores tragados.** Si el `catch` del formulario no muestra nada, este bug es indetectable.
  Todo error de subida se muestra con texto. Ver la regla del `catch` vacío en `memory/learnings.md`.
- ⚠️ **El mismo bug vive en varios lugares.** Si la app sube archivos en dos pantallas, arreglá
  **las dos**: en el CRM de Josué estaba en material de producto **y** en el expediente del lead.
- ⚠️ **En local no se reproduce.** Cualquier "ya funciona" probado solo con `pnpm dev` es falso.

---

## Ejemplo concreto (CRM Josué R. Miranda, 2026-08-17)

**Input:** *"Subí el brochure del producto y no aparece."* Archivo: PDF de 7,4 MB.

**Falso diagnóstico inicial:** "el chequeo de 10 MB lo está rechazando". No: ese chequeo nunca
corrió.

**Output:** `createSignedUploadUrl` + `uploadToSignedUrl` en `document-actions.ts` y en el
expediente de leads, tope a 25 MB, errores surfaceados. Round-trip de 6 MB verificado contra el
storage. Commit `455581b`, EN VIVO.

---

## La otra mitad: descargar muchos archivos juntos (extensión 2026-09-26)

### Cuándo aplica

Vas a construir un **"Descargar todo"**: juntar en un .zip los archivos que un cliente subió al
storage, como el material de su alta, el expediente de un contacto o las fotos de un reporte.

### El mismo techo, del otro lado

La documentación de Vercel lo dice en la misma oración: *"The maximum payload size for the
request body or the **response body** of a Vercel Function is 4.5 MB"*. Pasado eso, devuelve
`413 FUNCTION_PAYLOAD_TOO_LARGE`.

Una ruta que baja los archivos del storage, arma el zip y lo devuelve anda bien en local y con
los clientes chicos, y **se cae justo con el cliente que más material mandó**.

Medido en el CRM, en las altas de clientes:
- **Una típica:** 7 archivos, 2,3 MB. Pasa cualquier prueba.
- **La más pesada:** 30 fotos, **53 MB**. Es 12 veces el techo.

Tampoco lo salva mandar la respuesta en partes: la documentación no lo exime, y aunque pasara,
todos los bytes cruzarían tu función una vez más.

### El patrón: el server arma el índice, el navegador arma el zip

```
❌ navegador → [route: bajo todo, armo el zip, lo devuelvo]   (techo de 4.5 MB en la RESPUESTA)
✅ navegador → [Server Action: gate + índice + URLs firmadas]  (unos pocos kB)
   navegador → storage, cada archivo directo                   (sin techo de Vercel)
   navegador → arma el zip y lo guarda con un blob
```

**1. El server gatea, arma el índice y firma.** El índice lo arma una **función pura**: recibe
los datos y devuelve el documento de texto y la lista `{ path, rutaEnZip }`. Así se prueba sin
base ni storage. Las URLs se firman **al tocar el botón**, con vencimiento corto (10 min). No se
reusan las que firmó la página: si la pestaña quedó abierta una hora, ya vencieron.

```ts
export async function prepararDescarga(id: string) {
  await requireRol()                                   // el gate sigue en el server
  const paquete = armarPaquete(await leerRegistro(id)) // puro: documento + [{ path, rutaEnZip }]
  const { data } = await admin.storage.from(BUCKET)
    .createSignedUrls(paquete.archivos.map((a) => a.path), 10 * 60)
  const url = Object.fromEntries((data ?? []).map((s) => [s.path, s.signedUrl]))
  return { ...paquete, archivos: paquete.archivos.map((a) => ({ rutaEnZip: a.rutaEnZip, url: url[a.path] ?? null })) }
}
```

**2. El navegador baja y arma el zip** con `fflate` (sin dependencias, unos 8 kB):
- Baja **4 archivos a la vez**. Cargar 53 MB en memoria en un navegador está bien.
- **Las fotos, los PDF, los .docx y los audios ya vienen comprimidos:** se guardan con
  `level: 0`, que es instantáneo. El texto va con `level: 6`.

```ts
import { strToU8, zipSync, type Zippable } from 'fflate'
const contenido: Zippable = {}
for (const e of entradas) {
  contenido[e.ruta] = typeof e.datos === 'string' ? [strToU8(e.datos), { level: 6 }] : [e.datos, { level: 0 }]
}
const bytes = zipSync(contenido)
const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }))
// <a download> + click, y revokeObjectURL con un setTimeout (no en el acto: cortás la descarga)
```

**3. Un archivo que no baja no frena el zip.** El zip sale igual, el documento lista al final lo
que faltó y el aviso dice cuántos. Un "falló la descarga" por un solo archivo borrado del
storage deja a la persona sin nada.

### Los nombres dentro del zip, que es lo que muerde

- **Nombres que sirven en Windows:**
  - `\ / : * ? " < > |` y los caracteres de control pasan a `-`. La barra, además, abriría otra
    carpeta dentro del zip.
  - Se sacan los puntos y espacios del final, porque Windows los borra al extraer y el archivo
    queda con otro nombre.
  - `..` o un nombre vacío pasan a `archivo`.
  - Se cortan en unos 60 caracteres **conservando la extensión**.
- **Nombres repetidos:** dos `WhatsApp Image.jpeg` en la misma carpeta → `WhatsApp Image (2).jpeg`.
  La comparación ignora mayúsculas, porque Windows también.
- **Tildes y ñ:** fflate prende el bit 11 del encabezado ("el nombre está en UTF-8") solo cuando
  el nombre no es ASCII. Sin ese bit, Windows muestra `CÃ³mo`. Se verificó extrayendo con el
  descompresor **propio de Windows** (`Shell.Application` → `CopyHere`, el mismo del Explorador):
  `02 Cómo hablás/…/catálogo ñandú.pdf` salió intacto.
  - ⚠️ **La prueba del bit se hace sobre una entrada CON tilde.** Si revisás el primer encabezado
    y ese es `respuestas.md`, el bit está apagado y la prueba falla sin que haya bug.

### Un documento que se pueda leer (y pasarle a una IA)

Va en la raíz del zip, en Markdown:
- **Cada pregunta en el orden del formulario:** lo contestado, lo que se dejó "para la llamada"
  y lo que falta.
- **La ruta de cada archivo dentro del zip.**
- **El texto del cliente como cita (`> `):** un `#` que escribió al principio de una línea no se
  vuelve un título.
- **Lo guardado bajo preguntas que ya no están en el formulario** sale al final, en "Otras
  respuestas". Si no, se pierde en silencio.

### Verificar sin bajar nada al disco del usuario

En la página, con la sesión real:
1. Interceptá `HTMLAnchorElement.prototype.click` cuando tiene `download`: guardá el `href` del
   blob y no dispares la descarga.
2. Hacé `fetch` del blob y leé el **directorio central** del zip en JS (firma `0x06054b50` al
   final):
   - cuántas entradas y en qué carpetas;
   - método 0 con `comprimido === tamaño`;
   - el bit 11 en los nombres con tilde;
   - los **bytes mágicos** de cada archivo: `ffd8` es JPEG, `89504e47` PNG, `25504446` PDF.
3. Descomprimí el `.md` con `new DecompressionStream('deflate-raw')` y **contá** títulos y
   preguntas sin imprimir el contenido del cliente.

El resultado es un número contra otro: tantos archivos en la base, tantos en el zip, cada uno con
su tipo real.

### Gotchas de la descarga

- 🔴 **Armar el zip en el server "porque queda más prolijo".** Pasa todas las pruebas con datos
  chicos y se cae con el cliente grande.
- ⚠️ **Reusar las URLs firmadas que ya tenía la página.** Vencen mientras la pestaña está abierta.
- ⚠️ **`revokeObjectURL` en el acto.** Hay navegadores que todavía no empezaron a leer el blob:
  soltarlo con un `setTimeout`.
- ⚠️ **Un panel de navegador oculto (automatizado) no compone frames.** Las medidas dan 0 y las
  animaciones quedan congeladas hasta tomar una captura. Tomala antes de medir.

### Ejemplo (CRM Momentum, 2026-09-26)

**Pedido:** *"que se pueda descargar la puesta en marcha, texto e imágenes, como un zip, para que
el que arma los prompts siga con su trabajo"*.

**Output:**
- **El botón:** «Descargar todo (.zip)» en el panel master, con `respuestas.md` y
  `archivos/NN Bloque/Pregunta/…` adentro.
- **El índice:** una función pura con 8 pruebas, incluida la de ida y vuelta del zip con tildes.
- **Verificado con la sesión real:** 7 archivos (6 PNG y 1 PDF por sus bytes mágicos) y
  23 preguntas, en 4,7 s.
- `momentum-ai-crm` #362, EN VIVO.

---

## Skills relacionadas

- `ingesta-email-cloudflare-worker` — el mismo principio: el payload pesado no pasa por tu app.
- `debugging-silent-errors` — cómo se caza un fallo que no dice nada.
- `deploy-seguro-vercel-preview-prod` — límites y trampas de Vercel al desplegar.
