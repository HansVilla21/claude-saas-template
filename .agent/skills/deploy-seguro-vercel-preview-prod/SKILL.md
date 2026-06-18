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
