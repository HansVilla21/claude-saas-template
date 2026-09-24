# Skill: El SDK de Facebook que se come tu configuración (FedCM y el callback async)

> Nació el 2026-09-11 en el CRM de Momentum, con el botón "Conectar mi WhatsApp"
> (Embedded Signup de Meta) ya en producción. El código estaba bien, las variables
> estaban bien, la configuración de Meta estaba bien, y el botón fallaba de **dos
> formas distintas, una detrás de la otra**. Las dos vienen del SDK de JavaScript de
> Facebook, las dos son invisibles en local, y ninguna aparece en la documentación
> del registro insertado. Antes de encontrar la primera se despublicó la app de Meta
> por una pista falsa, con el costo de una posible renovación de acceso de hasta 10
> días.
>
> Skill madre: `meta-tech-provider-de-cero-a-app-review`.

## Cuándo usar esta skill

- Usás `FB.login()` con `config_id` (inicio de sesión para empresas, registro
  insertado de WhatsApp, Instagram o Messenger).
- Al tocar el botón aparece una **burbujita del navegador** arriba a la derecha
  ("Continuar como…" / "Continuar con Facebook") en vez de la ventana de Meta.
- La ventana de Meta dice **"Esta app necesita al menos un permiso compatible"**
  ("needs at least one supported permission") y tu configuración SÍ tiene permisos.
- El botón queda en "Conectando…" para siempre y en la consola dice
  **`Expression is of type asyncfunction, not function`**.

## Trampa 1 — FedCM reemplaza tu `FB.login` y tira el `config_id`

### Qué pasa

Chrome tiene **FedCM** (Federated Credential Management): el inicio de sesión
federado lo dibuja el navegador. El SDK de Facebook lo adopta **solo**, sin que lo
pidas, y cuando lo usa **resuelve el login con un OAuth común**: tira `config_id`,
`response_type: 'code'` y `extras`. A Meta le llega un pedido de "iniciar sesión con
`openid`", que no es un permiso de tu configuración, y responde que la app no pidió
ningún permiso compatible.

### Cómo se reconoce en diez segundos

Pedir la **URL completa de la ventanita** (clic en su barra de dirección → Ctrl+A →
Ctrl+C). La que llegó en el incidente:

```
https://www.facebook.com/dialog/oauth/?client_id=<APP_ID>&response_type=token
  &scope=openid&display=popup&redirect_uri=https%3A%2F%2F<tu-dominio>%2F
  &fedcm_origin=https%3A%2F%2F<tu-dominio>&dialog_source=fedcm
```

- `dialog_source=fedcm` y `fedcm_origin` → pasó por FedCM.
- `scope=openid` y `response_type=token` → **tu configuración no llegó**.
- La URL buena trae `config_id=<tu config>`, `response_type=code`,
  `override_default_response_type=true` y `extras=…`.

**La URL del diálogo es la evidencia más barata que existe** y hay que pedirla
PRIMERO. Sin ella se fueron dos hipótesis falsas: "al usuario le falta el rol en la
app" (era administrador) y "la app publicada solo muestra permisos con acceso
avanzado" (cierto en general, pero no era esto) — y la segunda llevó a despublicar.

### Por qué lo activa solo (leído en el código del SDK)

En la versión debug del SDK (`https://connect.facebook.net/en_US/sdk/debug.js`,
legible, sin minificar):

```js
function applyAppConfig(config){
  if (Runtime.getFedCMExplicitlySet()) return;          // ← si lo decidiste vos, respeta
  Runtime.setUseFedCM(config != null && config.fedcmDefault === true);  // ← si no, decide Meta
}
```

- Meta manda por app un `fedcmDefault`; si viene `true`, FedCM se prende.
- Solo se consulta si: la página es **HTTPS**, el navegador tiene
  `IdentityCredential` (Chrome), no es un canvas, y no lo fijaste en `FB.init`.
- Por eso **en local (http://localhost) no se reproduce** y en producción sí. Y por
  eso pudo andar un día y romperse al siguiente sin tocar el código: el switch es de
  Meta.

### El arreglo — una línea

```ts
window.FB.init({
  appId,
  autoLogAppEvents: true,
  xfbml: true,
  version: VERSION_SDK,
  // FedCM reemplaza FB.login por el login del navegador y tira config_id y
  // extras: el registro insertado llega sin permisos. Decirlo explícito hace que
  // el SDK no le pregunte a Meta si usarlo.
  fedCM: false,
});
```

`fedCM: false` (también acepta `'false'`, `0`, `'0'`, `''`) marca
`FedCMExplicitlySet = true` y `applyAppConfig` deja de decidir. Cualquier otro valor
no reconocido solo loguea un warning: escribilo exacto.

## Trampa 2 — el callback de `FB.login` no puede ser `async`

### Qué pasa

`FB.login(callback, opciones)` valida el TIPO del callback así:

```js
var className = {}.toString.call(expression);   // "[object AsyncFunction]"
// … extrae "asyncfunction" y exige "function"
assert(type.indexOf(actualType) !== -1, 'Expression is of type %s, not %s');
```

Una `async function` (o `async () => {}`) es `[object AsyncFunction]`, así que el
SDK **tira una excepción síncrona** dentro de `FB.login` y la ventana nunca se abre.
TypeScript no lo ve (una async es asignable a `(r) => void`), el linter tampoco.

### Por qué parece "no hace nada"

El click ya había puesto el estado en "Conectando…" y la excepción salió del
handler sin que nadie la atrapara: el botón queda colgado y el único rastro es la
consola del navegador. En el incidente apareció recién después de arreglar FedCM,
porque antes el SDK tomaba otro camino.

### El arreglo — función común que dispara la async, y todo en try/catch

```ts
// El SDK valida el tipo del callback con {}.toString y rechaza una función
// async ("Expression is of type asyncfunction, not function"). Se le pasa una
// común que dispara la async y atrapa su error.
const alResponder = (r: RespuestaLogin) => {
  alTerminarLogin(r).catch((e: unknown) =>
    setEstado({ fase: 'error', mensaje: `No se pudo terminar la conexión: ${mensajeDe(e)}` }),
  );
};

try {
  window.FB.login(alResponder, {
    config_id: configId,
    response_type: 'code',
    override_default_response_type: true,
    extras: { setup: {}, featureType: 'whatsapp_business_app_onboarding', sessionInfoVersion: '3' },
  });
} catch (e) {
  // Si el SDK tira algo síncrono, el botón no puede quedar en "Conectando…".
  setEstado({ fase: 'error', mensaje: `No se pudo abrir la ventana de Meta: ${mensajeDe(e)}` });
}
```

`mensajeDe` existe porque lo que tira el SDK no siempre es un `Error`:

```ts
function mensajeDe(e: unknown): string {
  if (e instanceof Error) return e.message;
  const m = (e as { message?: unknown } | null)?.message;
  return typeof m === 'string' ? m : String(e);
}
```

## Cómo se verificó

1. Antes: la URL del diálogo con `dialog_source=fedcm` y `scope=openid`.
2. Con `fedCM: false` desplegado: la ventana pasó a abrirse normal… y apareció la
   trampa 2 en la consola.
3. Con el callback común desplegado: la ventana abrió **"¿Continuar como <nombre>?"**
   del registro insertado, que es la pantalla correcta. El siguiente error ya fue de
   Meta (proveedor sin registrar), o sea, el código dejó de ser el problema.

Ninguna de las dos se ve en local: FedCM exige HTTPS, y el callback async solo
revienta cuando el SDK real está cargado. **Se prueba en el preview o en producción,
con el navegador del usuario.**

## Checklist para cualquier `FB.login` con `config_id`

- [ ] `FB.init({ …, fedCM: false })`
- [ ] El callback de `FB.login` es una función **común**; la lógica async va adentro
      con `.catch`
- [ ] `FB.login` envuelto en `try/catch` que saca al botón de "Conectando…"
- [ ] En el panel de Meta: "Iniciar sesión con el SDK para JavaScript" en **Sí** y el
      dominio en "Dominios permitidos para el SDK de JavaScript"
- [ ] Ante cualquier error del diálogo: **pedir la URL de la ventana antes de tocar
      nada** en el panel de Meta

## Anti-patrones

- Tocar la configuración de la app (roles, publicar, despublicar) sin haber leído la
  URL del diálogo.
- Confiar en que "anda en local" — FedCM no existe en http.
- Pasar `async (r) => {…}` a `FB.login` porque TypeScript lo acepta.
- Un `FB.login` sin `try/catch` detrás de un estado de carga: cualquier excepción
  síncrona deja la UI colgada y sin mensaje.

---

## Apéndice 2026-09-24 — La MISMA app, dos variantes de login que se portan distinto

Conectando Instagram y Messenger con una **configuración nueva** (variación
"General") sobre la app que YA tenía andando el registro insertado de WhatsApp,
el mismo código copiado falló:

```
Error validating verification code. Please make sure your redirect_uri is
identical to the one you used in the OAuth dialog request
```

**Qué pasa.** El canje del `code` exige mandar la misma dirección de retorno que
usó la ventana, y en la variación General esa dirección la arma el SDK por
dentro: no la conocés, así que no la podés repetir. El registro insertado de
WhatsApp no lo sufre porque no abre un diálogo OAuth clásico. O sea: **el mismo
`canjearCodigo` que anda en un botón no anda en el otro, y el mensaje de error
no dice "tu variante es otra"**.

**Salida** (la del SDK, no un truco): usar el **modo por defecto**, que devuelve
el token en el callback.

```ts
// En vez de response_type: 'code' + override_default_response_type
window.FB.login(alResponder, { config_id: configId });
// → r.authResponse.accessToken  (corto, unas horas)
```

Y en el servidor, cambiarlo por uno de larga duración antes de usarlo:

```
GET /oauth/access_token?grant_type=fb_exchange_token
    &client_id=…&client_secret=…&fb_exchange_token=<el corto>
```

El token corto pasa por el navegador, que es el mismo trato que hace el SDK en
su modo normal. Lo que **nunca** pasa por ahí es el token de la página: ese sale
de `/me/accounts` en el servidor y va derecho al almacén cifrado.

**La regla que queda:** cuando agregues una configuración de login nueva, probá
el flujo entero **antes** de copiar el canje del botón que ya funciona. Las
variantes comparten el SDK y el `config_id`, no el comportamiento.
