# Skill: Subir archivos grandes sin pasar por el servidor (el techo de 4.5 MB de Vercel)

## Cuándo usar esta skill

- Vas a construir **cualquier** subida de archivos en una app en Vercel: expediente de un cliente,
  material de producto, brochures, contratos, fotos, comprobantes.
- El cliente reporta *"subí el PDF y no pasó nada"* / *"se queda pensando"* / *"lo subí y no aparece"*
  y **no hay ningún error** — ni en pantalla, ni en los logs de la función.
- Un archivo chico sube bien y uno grande no. **Ese contraste es el diagnóstico completo.**
- Estás por subir el límite en `next.config` (`bodySizeLimit`) o a validar el tamaño en el Server
  Action. **Pará: nada de eso corre.**

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

## Skills relacionadas

- `ingesta-email-cloudflare-worker` — el mismo principio: el payload pesado no pasa por tu app.
- `debugging-silent-errors` — cómo se caza un fallo que no dice nada.
- `deploy-seguro-vercel-preview-prod` — límites y trampas de Vercel al desplegar.
