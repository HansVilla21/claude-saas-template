# Skill: Trabajar en la cuenta del cliente (su GitHub, su Vercel) sin quedar trabado

## Cuándo usar esta skill

- El repo y/o el hosting **son del cliente**, no tuyos: vos sos colaborador. (Lo correcto —
  el cliente es dueño de su sistema — y también donde aparecen estas trampas.)
- `git push` empieza a fallar con **"Repository not found"** en un repo donde ayer funcionaba.
- Hacés `git push` y **el código no llega a producción**, sin ningún error rojo en ningún lado.
- Vas a arrancar un proyecto de cliente y querés dejar los accesos bien desde el día uno.
- Trabajás en **varios repos de distintos dueños** desde la misma máquina.

**Costo de no usarla:** el commit `50a2472` del CRM de Josué quedó `BLOCKED` y **nadie se dio
cuenta** — estaba en `main`, estaba en GitHub, y no estaba en producción. Se descubrió días
después, cuando el cliente reportó que "el arreglo no está".

---

## Por qué existe esta skill

Trabajar en la cuenta de otro rompe tres supuestos que nunca se piensan:

**1. Windows guarda UNA sola credencial por host.** El Credential Manager indexa por
`git:https://github.com`. Si en otro proyecto actualizás tu credencial de GitHub, **pisa** la que
tenía acceso al repo del cliente. El síntoma es cruel: *"Repository not found"* — que suena a que
el repo se borró o te lo quitaron, y en realidad es que estás autenticando como la persona
equivocada. GitHub responde 404 en vez de 403 a propósito, para no filtrar la existencia de repos
privados.

**2. Una regla global de git puede reescribir tu remoto.** `url.https://github.com/.insteadOf
git@github.com:` (muy común para esquivar firewalls) convierte **toda** URL SSH en HTTPS. Ponés el
remoto en SSH, `git remote -v` muestra SSH, y git igual sale por HTTPS. Se ve como si el arreglo
no hubiera hecho nada.

**3. Vercel Hobby no soporta colaboración.** Los deploys originados en git se bloquean si el
**autor del commit** no es el dueño de la cuenta:

> *"The Deployment was blocked because the commit author does not have contributing access to the
> project on Vercel. Hobby teams do not support collaboration."*

Y el chequeo **solo aplica a los deploys de git**: uno creado por API pasa igual. Por eso `git
push` "funciona" (el push entra) y sin embargo producción se queda vieja, **en silencio**.

---

## Proceso

### 1. GitHub: llave SSH propia, en forma `ssh://`

No pelees con el Credential Manager. Sacá ese repo de HTTPS.

```bash
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N ""    # sin passphrase: push no interactivo
cat ~/.ssh/id_ed25519.pub                            # -> el CLIENTE la agrega en SU GitHub
```

El cliente la pega en **Settings → SSH and GPG keys → New SSH key** de su cuenta. La privada nunca
sale de tu máquina.

```bash
# ⚠️ la forma ssh:// con BARRA, no la forma git@github.com: con DOS PUNTOS
git remote set-url origin ssh://git@github.com/CLIENTE/REPO.git
ssh -T git@github.com    # debe saludar con el usuario DEL CLIENTE
```

**Por qué `ssh://` y no `git@github.com:`** — la regla `insteadOf` matchea el prefijo
`git@github.com:` (con dos puntos). **No** matchea `ssh://git@github.com/` (con barra). Así
esquivás la reescritura **sin borrar la regla global**, que probablemente usás en otros proyectos.

> Ventaja lateral: la llave autentica como el cliente, así que el acceso vive donde tiene que
> vivir (en su cuenta) y se revoca borrando una llave el día que termine el contrato.

### 2. Verificar que sos vos quien creés que sos

```bash
git remote -v            # DEBE decir ssh://... Si dice https:// -> la regla te reescribió
ssh -T git@github.com    # DEBE saludar con el usuario dueño del repo
```

Los commits siguen firmados con tu nombre. Está bien: la autoría es trazabilidad, el acceso es
la llave. Son cosas distintas.

### 3. Vercel: no confíes en que el push deploya

Comprobalo **una vez**, al principio del proyecto:

```bash
npx vercel ls --scope <cuenta-del-cliente> | head -20
```

Si ves deploys en `BLOCKED` originados en git → estás en este caso.

**El arreglo:** un script de deploy que crea el deployment **por API** apuntando al commit
(`gitSource`), y que **verifica que el dominio quedó sirviendo ese commit**.

```js
// scripts/deploy.mjs (esqueleto)
// 1) POST /v13/deployments  { name, project, gitSource: { type:"github", repoId, ref:"main" } }
// 2) poll del estado hasta READY o ERROR
// 3) GET https://<dominio-productivo>  y comprobar que responde el commit esperado
// 4) si no llegó -> salir con código != 0 y GRITAR
```

El paso 3 es el que justifica el script. Sin él volvés al fallo mudo.

**Consecuencia operativa que hay que decir en voz alta:** el deploy por `gitSource` necesita el
commit **ya en GitHub**. → **Sin push no hay deploy.** Si el push está roto (paso 1), el deploy
también, aunque el error hable de otra cosa.

### 4. Nombrá el riesgo de términos de servicio, por escrito

El plan **Hobby de Vercel prohíbe el uso comercial** — sus términos nombran explícitamente al
*consultor pagado escribiendo el código*. Un proyecto de cliente en Hobby está fuera de términos
y Vercel **puede suspenderlo**.

Eso no lo decidís vos: se le dice al cliente, con el costo del arreglo (Pro, ~$20/mes) y el
riesgo de no hacerlo, **y él decide**. Lo que no se hace es dejarlo sin decir. (Josué, 2026-07-16:
decidió seguir en Hobby y deployar a mano, sabiendo el riesgo. Correcto — fue **su** decisión.)

### 5. Dejá el runbook en el repo, no en tu cabeza

En el encabezado del script de deploy: por qué existe, el error exacto de Vercel, y qué hacer si
falla. Cuando esto se rompa vas a estar en otro proyecto, o va a ser otra persona.

---

## Output esperado

- `git remote -v` en `ssh://`, `ssh -T` saludando con el usuario del cliente.
- Un `pnpm run deploy` (o equivalente) que despliega por API y **verifica el dominio**.
- Un runbook en el repo con los tres modos de fallo y su arreglo.
- El riesgo de términos de servicio comunicado al cliente y decidido por él.

---

## Gotchas / antipatrones

- 🔴 **Asumir que `git push` deploya.** En cuentas de cliente en Hobby, no. Verificalo el día uno.
- 🔴 **Un deploy que no verifica el dominio.** El fallo es mudo por diseño; el script existe para
  romper ese silencio.
- 🔴 **Borrar la regla global `insteadOf` para "arreglarlo".** Rompe tus otros proyectos. Usá la
  forma `ssh://`.
- 🔴 **Pedirle al cliente su usuario y clave de GitHub.** Nunca. Llave pública, que él la agrega.
- ⚠️ **`pnpm deploy` sin el `run`.** En un repo con `pnpm-workspace.yaml`, `deploy` es un builtin
  de pnpm y gana él: `ERR_PNPM_NOTHING_TO_DEPLOY`. Siempre `pnpm run deploy`.
- ⚠️ **"Repository not found" NO significa que perdiste el repo.** Casi siempre es la credencial
  equivocada. Comprobá la identidad antes de escribirle al cliente.
- ⚠️ **La primera conexión SSH pide confirmar el host.** En un script no interactivo:
  `GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=accept-new"`.
- ⚠️ Si el push cuelga por minutos **en HTTPS**, es otra cosa: HTTP/2. `git config http.version
  HTTP/1.1`. Con SSH ese problema no existe.

---

## Ejemplo concreto (CRM Josué R. Miranda, 2026-08-17)

**Síntoma:** el push empezó a fallar con "Repository not found" — una hora antes funcionaba.

**Dos causas juntas:** (1) Hans actualizó su credencial de GitHub en otro proyecto y Windows pisó
la única credencial de `github.com`, dejando autenticando a una cuenta **sin acceso** al repo de
Josué; (2) la regla global `insteadOf` reescribía a HTTPS cualquier intento de arreglarlo con SSH.

**Fix:** llave `ed25519` nueva, Josué la agregó en su GitHub, remoto a
`ssh://git@github.com/josuermasesor/crm-josue-miranda.git`. `ssh -T` responde *"Hi
josuermasesor!"*. Sin tocar la config global de Hans.

**Y el deploy:** los deploys por CLI quedaron `BLOCKED` en esa cuenta; el único camino es
`pnpm run deploy` (API + `gitSource`), que necesita el commit en GitHub. Sin push no hay deploy.

---

## Skills relacionadas

- `deploy-seguro-vercel-preview-prod` — el flujo preview → prod sin romper.
- `verificar-funcionamiento-end-to-end` — por qué "salió verde" no es "funciona".
- `reporte-de-traspaso-del-proyecto` — dónde se documentan estos accesos al entregar.
