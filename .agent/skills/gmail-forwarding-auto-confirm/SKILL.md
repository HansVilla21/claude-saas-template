# Skill: Auto-confirmar el reenvío de Gmail (server-side)

## Cuándo usar esta skill

- Tu producto ingiere correos por **reenvío de Gmail** a una dirección propia (catch-all / inbound).
- El usuario debe **confirmar** ese reenvío, y ese paso es el #1 de abandono (o falla con un error 400).
- Querés que el usuario **NO toque ningún link de confirmación**: que tu backend lo confirme solo.

## El problema

Gmail, al agregar una dirección de reenvío, manda un correo de confirmación a esa dirección. Confirmar exige:

- Hacer clic en un **LINK** (`https://mail.google.com/mail/vf-<token>`), **NO un código numérico** — los correos modernos de Gmail (al menos en español) traen **solo el link**.
- Pero al hacer clic desde el navegador del usuario, si tiene **múltiples cuentas de Google logueadas** (comunísimo), Google tira **"Error temporal (400) — tu cuenta no está disponible temporalmente"** (conflicto de sesión). Eso mata la activación, y el incógnito es fricción que no querés pedir.

## El descubrimiento clave

El link de confirmación es una **URL de capability**: el token lleva toda la autoridad, **se confirma sin ninguna sesión de Google**. Y como **vos controlás el buzón destino** (recibís el correo de confirmación), podés confirmarlo **server-side**. Así el 400 (que es del navegador del usuario) **nunca aparece**.

## El mecanismo exacto (con los 2 gotchas)

1. Capturás el link `vf-` del correo de confirmación (viene en `mail.google.com` **o** `mail-settings.google.com`).
2. La página de confirmación es un form mínimo: `<form action="" method="post"><input type="submit" value="Confirmar"></form>` — **sin token CSRF, sin campos ocultos, sin cookies**.
3. Confirmás con un **POST a la URL del link**. DOS gotchas que cuestan horas:
   - **Normalizá el dominio a `mail.google.com`.** `mail-settings.google.com` responde **302**, y un 302 convierte el POST en GET → vuelve el form **sin confirmar**. Reemplazá `mail-settings.google.com` → `mail.google.com` y POSteá directo (sin seguir redirects).
   - Body vacío, `content-type: application/x-www-form-urlencoded`.
4. **Éxito** = la respuesta contiene **"Confirmación obtenida"** / "ahora puede reenviar" / "now forward".

```js
// en la Edge Function, al capturar el correo de confirmación de reenvío:
const confirmUrl = String(link).replace("mail-settings.google.com", "mail.google.com");
const r = await fetch(confirmUrl, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: "",
  redirect: "manual",
});
const confirmed = /Confirmaci[oó]n obtenida|ahora puede reenviar|now forward/i.test(await r.text());
```

## Captura del link (parser)

El link `vf-` vive en cualquier subdominio de google.com. Capturalo robusto y **evitá el link `uf-`** (ese es CANCELAR):

```js
const link = grab(/(https:\/\/[\w.-]*google\.com\/mail\/vf-[^\s"'<>]+)/i, `${html} ${text}`);
```

## Privacidad (no te saltes esto)

Al verificar la dirección, **Gmail activa por defecto el reenvío de TODO el correo** (trampa del default). Dos defensas:

1. En el onboarding, decile explícito al usuario que seleccione **"Inhabilitar el reenvío"** y use **solo un filtro** (`de: <remitente> → reenviar a: <tu dirección>`), para que solo llegue lo que esperás.
2. En el backend, guardá el **cuerpo** del correo **solo** si es del remitente esperado (ej. `looksBac`). El correo no-relevante se procesa en memoria y NO se persiste.

## Cómo probarlo

- **Server-side** con `curl` / `Invoke-WebRequest`: GET el link (debe mostrar el form *"Confirma que quieres reenviar…"*) → POST a `mail.google.com` → debe responder **"Confirmación obtenida"**.
- **End-to-end:** el usuario elimina + re-agrega el reenvío → tu backend confirma solo → la dirección queda verificada **sin que el usuario toque nada**.

## Resultado

La activación pasa de "el peor cuello de botella" (link frágil + 400 de multi-cuenta + incógnito) a **cero clics de confirmación**, funcionando para todos sin importar cuántas cuentas de Google tengan. Relacionada: [[ingesta-email-cloudflare-worker]].
