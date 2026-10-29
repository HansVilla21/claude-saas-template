# Skill: Deploy seguro a producción (GitHub → Vercel, preview → prod)

## Cuándo usar esta skill

- Tenés una app (Next.js u otra) en **GitHub conectada a Vercel** y querés desplegar a **producción sin romperla**.
- Querés un flujo repetible: trabajar en rama, validar el build en **preview**, y recién ahí pasar a producción.
- Estás conectando un **dominio propio** (en Cloudflare u otro) a Vercel.

## Por qué existe

Pushear directo a `main` = desplegar a producción a ciegas: si el build falla o hay un bug, rompés prod para todos. El flujo correcto usa el **preview deployment** de Vercel como compuerta: validás ahí, y solo si está verde promovés a producción. Además evita el error sutil de "el deploy READY que veo es el VIEJO".

## Proceso

### 1. Trabajar en rama (nunca commits directos a main)
```bash
git checkout -b feat/<algo>   # o la rama de trabajo
# … cambios …
git add -A && git commit -m "feat: …"
git push origin feat/<algo>
```
El push a la rama dispara un **preview deployment** en Vercel (no toca producción).

### 2. Validar el build del preview (no asumir)
Esperá a que el preview quede `READY`. Vía API de Vercel (token en `.env`):
```js
// GET https://api.vercel.com/v6/deployments?projectId=<pid>&limit=4  (Bearer <VERCEL_TOKEN>)
// filtrar por meta.githubCommitRef === 'feat/<algo>' y el sha del commit, esperar readyState READY/ERROR
```
Si `ERROR` → leer logs, arreglar, repetir. **No promovés nada hasta ver `READY` del commit correcto.**

### 3. Promover a producción (fast-forward de main)
```bash
git push origin feat/<algo>:main   # fast-forward de main al commit ya validado → dispara deploy de prod
```
(Equivalente a merge ff-only; no toca tu working tree.)

### 4. Verificar producción POR COMMIT (el gotcha clave)
Al consultar el último deployment de producción **justo después** del push, podés ver el deployment **anterior** (que ya está READY) y creer que terminó. **Verificá el `meta.githubCommitSha`**:
```js
// GET /v6/deployments?projectId=<pid>&target=production&limit=1
// esperar hasta que sha === <tu commit> Y readyState === READY
```

### 5. Variables de entorno (al BUILD, no después)
Las `NEXT_PUBLIC_*` se **inyectan en el build** → deben existir en Vercel ANTES de compilar, en los 3 targets:
```js
// POST /v10/projects/<pid>/env?upsert=true  { key, value, type:"encrypted", target:["production","preview","development"] }
```
Si faltan, el build puede fallar (ej. `supabaseUrl is required` al prerenderizar). Setealas y redesplegá.

### 6. Dominio (Cloudflare → Vercel)
- Agregar el dominio al proyecto Vercel: `POST /v10/projects/<pid>/domains { name }` (apex + www).
- DNS en Cloudflare (**DNS-only / sin proxy** para que Vercel maneje el SSL):
  - apex `A → 76.76.21.21`
  - `www CNAME → cname.vercel-dns.com`
- Si el dominio también **recibe correo** (ej. Cloudflare Email Routing), eso usa MX → no choca con los A/CNAME web.

## Output esperado
1. Cada cambio pasa por preview verde antes de producción.
2. Producción nunca queda rota por un build fallido.
3. Verificación por commit sha (no por "último READY").
4. Dominio propio sirviendo con SSL.

## Ejemplo concreto (Mi Menudo, mimenudo.com — producción 2026-06-18)
- ~10 despliegues en una sesión con este flujo (`feat/ui-vera` → preview → `:main` → prod), cero roturas de producción.
- Project Vercel scope personal; `VERCEL_TOKEN` en `.env`. Dominio en Cloudflare (apex A → Vercel, www CNAME, MX → Cloudflare para la ingesta de correo).
- Bug evitado por el preview: build caía con `supabaseUrl is required` por env vars faltantes → se setearon y recién ahí se promovió.

## Gotchas / antipattern
- **NO** pushear a `main` sin validar el preview.
- **NO** confiar en el "último deployment READY" sin chequear el **commit sha** (puede ser el anterior).
- **NO** olvidar las `NEXT_PUBLIC_*` en Vercel ANTES del build (se hornean en el bundle).
- **NO** poner los registros DNS de Vercel **proxied (naranja)** en Cloudflare → SSL roto / loops; usá DNS-only.
- **NO** crear el proyecto por CLI si querés CI/CD por git: importá el repo de GitHub en Vercel (deploys automáticos por push).

## Skills relacionadas
- `vercel-domain-migration` — mover/migrar dominios en Vercel.
- `auth-supabase-google-nativo` — recordá agregar el dominio prod a los orígenes/redirects de Google y Supabase.

## Gotcha — las env vars se snapshotean en el build (2026-07-08, FreshAdFlow)

- Cambiar un env var (incluidas las `NEXT_PUBLIC_*`, que se inlinean en el bundle) **NO afecta al
  deployment activo** → hay que **redeploy** para que tome efecto.
- **Verificar que la env var esté en la PLATAFORMA (Vercel), no solo en `.env` local.** Nos pasó:
  `RESEND_API_KEY` estaba en `.env` pero faltaba en Vercel → los recibos fallaban silenciosos
  ("falta RESEND_API_KEY" en los logs). Chequear con `GET /v9/projects/{id}/env`.
- Los cambios de precio (priceIds de la pasarela) también son env vars → redeploy tras cambiarlos.

## Gotcha — la variable quedó en Production y el panel te empuja a redesplegar producción (2026-09-12, CRM de Momentum)

El snapshot en el build (sección anterior) tiene una segunda mitad que es más traicionera, porque
**la hace el propio panel de Vercel**.

**Lo que pasó.** Se necesitaba una bandera solo para el preview de un PR
(`BOT_PLAYGROUND_MOTOR=codigo`, para probar un motor nuevo sin tocar a los clientes). El founder la
cargó en *Settings → Environment Variables*, y al guardar **Vercel ofreció redesplegar**. Aceptó.
Resultado:

- La variable quedó marcada **solo en Production** (el tilde por defecto del formulario).
- El redespliegue que ofrece el panel fue **a producción** — el mismo commit de `main` que ya estaba
  vivo. No rompió nada, pero tampoco sirvió para nada.
- El **preview** siguió con el build viejo, construido antes de que la variable existiera, y además
  la variable nunca iba a llegarle porque no estaba en su ambiente.
- La prueba se hizo en el preview correcto y el código cayó al valor por defecto **sin avisar**.

Dos errores encadenados, y el panel te lleva de la mano a los dos: el tilde por defecto y el botón de
redesplegar apuntan a producción.

### Cómo diagnosticarlo sin adivinar

El síntoma ("prendí la variable y no cambió nada") tiene **tres causas que se ven idénticas**: la
variable en otro ambiente, el valor mal escrito, o haber probado en otra URL. Se separan así, en este
orden:

1. **¿La request cayó en el deploy que creés?** `get_runtime_logs` con `group_by: deploymentId` (o
   `branch`) sobre la ventana de la prueba. Si el `deploymentId` no es el del preview, se probó en
   otra URL y lo demás no importa.
2. **¿Ese deploy es posterior al cambio de la variable?** `get_deployment` sobre el alias de la rama:
   mirar `createdAt` contra la hora en que se guardó la variable. Si es anterior, falta redesplegar.
3. **Si las dos dan bien, el código no encontró el valor** → la variable no está en ese ambiente, o
   está escrita distinto. Acá no se deduce: se mira (ver abajo).

Con esos tres pasos se llegó en minutos a "cayó en el preview correcto, construido después, y aun así
usó el default" → variable en el ambiente equivocado. El founder confirmó: *"estaba solo en
Production"*.

### Lo que se cambia en el código para que no vuelva a costar una ronda

- **Loguear el valor crudo de una bandera que NO es secreta**, y qué rama eligió el código:
  `console.log('[x] motor', { crudo: JSON.stringify(valor ?? null), elegido })`. El `JSON.stringify`
  hace visibles los espacios al final y distingue `null` (no existe) de `""` (existe vacía). La
  próxima falla se contesta leyendo un log, no con una conversación. **Nunca con un secreto.**
- **Normalizar un valor que un humano escribe a mano en un panel:** `trim`, minúsculas y sin tildes.
  `código` con tilde es lo natural de escribir en español, y un valor fuera del contrato cae al
  default **en silencio**. Lo que NO se hace es aceptar cualquier cosa: todo lo que no normaliza a un
  valor conocido sigue cayendo al lado seguro.

### Cómo redesplegar el preview cuando el panel redesplegó otra cosa

Un commit vacío en la rama del PR dispara un preview nuevo desde git, que toma el snapshot de
variables del momento:

```bash
git commit --allow-empty -m "chore: redesplegar el preview para que tome <VARIABLE>"
git push
```

Y confirmar con `get_deployment` que el alias de la rama apunta al deploy nuevo antes de pedirle a
nadie que pruebe.

### ⚠️ La trampa que queda armada para el día del merge

Una bandera que quedó en Production **no hace nada hoy**, porque el código que la lee todavía no
llegó a producción. El día que se mergea el PR, **se prende sola para todos los usuarios**, sin un
solo deploy "de configuración" que lo delate. Antes de mergear un PR que introduce una bandera, se
revisa en qué ambientes está tildada — y si era solo para probar, se destilda Production.

### Checklist corto al cargar una variable para un preview

- [ ] Tildar **Preview** (y destildar Production si es solo para probar).
- [ ] **No aceptar** el "redesplegar" que ofrece el panel si lo que querés es el preview.
- [ ] Redesplegar el preview desde git (commit vacío) y confirmar el alias con `get_deployment`.
- [ ] Probar, y confirmar el valor con el log de la bandera, no por cómo "se ve".
- [ ] Antes de mergear: ¿la bandera sigue marcada en un ambiente donde no debería prenderse?
