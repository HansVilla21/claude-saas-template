# Skill: Trabajar en `git worktree` cuando el founder está en el mismo repo

## Cuándo usar esta skill

- El founder está trabajando **en paralelo** en el mismo repo (commiteando, cambiando de rama, probando cosas) mientras la sesión también toca código.
- El checkout principal está en una rama que **no es la base** que necesitás (por ejemplo, una rama vieja mientras vos salís de `main`).
- Necesitás resolver un conflicto de merge o rebasear una rama que el founder tiene checkeada.
- **Señal de alarma:** a mitad de una tarea, los archivos "vuelven atrás" solos o `HEAD` apunta a otro lado.
- **Vas a repartir el trabajo entre varios ayudantes** en copias paralelas, o vas a borrar una copia que comparte `node_modules` con la principal → andá directo al **Apéndice (2026-11-03)** del final.

## Por qué existe esta skill

Capturada el **2026-08-11** en el CRM de Momentum, después de que pasara en vivo.

**Lo que pasó.** A mitad de construir una feature, los archivos editados volvieron a su versión original y `HEAD` dejó de apuntar al commit de trabajo. Causa: el founder había corrido `git checkout otra-rama` **en el mismo directorio**, desde otra terminal.

**No se perdió nada** —el commit y la rama seguían intactos, se confirmó con `git reflog`— pero el diagnóstico costó tiempo y por un momento pareció pérdida de trabajo.

**Y hubo una segunda víctima, más silenciosa:** un commit que se hizo en el repo del template quedó **huérfano** (ninguna rama lo contenía) porque la rama se movió después. Se descubrió recién en el checkpoint, verificando contra GitHub en vez de confiar en la referencia local. Ahí tampoco se perdió nada, pero el handoff casi queda escrito con un dato falso.

Desde entonces: **todo el trabajo va en un worktree aparte** y el checkout del founder no se toca nunca.

## Proceso

### 1. Detectar que hay trabajo en paralelo

```bash
git branch --show-current && git status --short
```

Si la rama no es la que esperabas, o cambió entre dos comandos tuyos, hay alguien más. Avisar y pasar a worktree.

### 2. Crear el worktree

```bash
git fetch origin main --quiet
git worktree add -b <mi-rama> "<ruta>" origin/main
```

**Dónde ponerlo — decide qué vas a hacer ahí:**

| Necesidad | Ubicación |
|---|---|
| Solo editar archivos y commitear | Fuera del repo (scratchpad). Aisla del todo. |
| Correr `tsc` / `eslint` / build | **Dentro** del repo (`.tmp-verify-x`). Ver el gotcha de abajo. |

⚠️ **En Windows, un scratchpad de ruta larga puede fallar** con `Filename too long` si el repo tiene carpetas anidadas profundas (repos de referencia, `node_modules` versionados). Si pasa, usar una ruta corta dentro del repo.

### 3. Trabajar ahí, siempre con la ruta explícita

```bash
git -C "$WT" status
git -C "$WT" commit -m "..."
```

Todas las herramientas de edición apuntan a `$WT/...`. **Nunca** editar el checkout principal.

### 4. Verificar tipos y lint: el worktree tiene que estar DENTRO del repo

**El gotcha que más tiempo cuesta.** Un worktree **fuera** del repo da errores fantasma masivos que el checkout principal no tiene, **con idéntica versión de paquetes**:

```
error TS2339: Property 'getUser' does not exist on type 'SupabaseAuthClient'.
```

Ni un symlink de `node_modules` ni un `pnpm install` propio lo arreglan (y `eslint` directamente no arranca: `Cannot find package '@humanfs/node'`).

**La solución:** crear el worktree **dentro** del repo, así hereda el `node_modules` que sí funciona al subir por el árbol de directorios.

```bash
git worktree add --detach ".tmp-verify" <commit>
rm -rf ".tmp-verify/node_modules"      # que herede el del padre
(cd ".tmp-verify" && npx tsc --noEmit && npx eslint src)
git worktree remove --force ".tmp-verify"
```

Verificar y **borrarlo enseguida** — no dejarlo en el repo del founder. En Windows puede quedar bloqueado un momento tras correr tsc/eslint: reintentar el `rm -rf`.

> **Medir el delta, no el absoluto.** Si igual tenés que trabajar en un entorno con ruido, contá los errores **antes y después** de tus cambios. Mismo total = cero errores nuevos. Es más débil que un cero limpio, pero sirve mientras conseguís el entorno bueno.

### 5. Si el founder tiene checkeada la rama que necesitás

`git worktree add` la rechaza (*"is already used by worktree at…"*). Usar `--detach` sobre el commit remoto y pushear por refspec, sin tocar su rama local:

```bash
git worktree add --detach "$WT" origin/<rama>
# … trabajar, commitear …
git -C "$WT" push origin HEAD:<rama>
```

Su rama local queda atrás del remoto → **avisarle que necesita `git pull`**, y si tenía commits sin pushear, decírselo explícito.

### 6. Limpiar al terminar

```bash
git worktree remove --force "$WT" ; git worktree prune ; git worktree list
```

Confirmar que el checkout del founder quedó como estaba: `git branch --show-current` + `git status --short`.

### 7. Si algo "se perdió", primero el reflog

```bash
git reflog -10
git branch -a --contains <sha>     # vacío = commit HUÉRFANO
```

Un commit huérfano **existe** y se puede rescatar (`git cherry-pick <sha>`), pero no está en ninguna rama y git lo recolecta con el tiempo. Antes de rescatarlo, verificar si el contenido ya llegó por otro camino:

```bash
git diff <sha> HEAD -- <archivo>
```

## Output esperado

- El checkout del founder termina **exactamente** como estaba: misma rama, mismos archivos sin trackear, cero worktrees temporales.
- El trabajo vive en su propia rama, pusheada.
- Si su rama local quedó desincronizada, se le dice **qué comando correr** y **qué commits suyos hay sin pushear**.

## Gotchas

- **El reflog es la red de seguridad.** Antes de asumir pérdida, mirarlo.
- **No confiar en `origin/<rama>` local** para afirmar si algo está pusheado: puede estar viejo. Verificar contra GitHub (`gh api .../branches/<rama>`).
- **`git log origin/x..x` vacío no prueba que tu commit esté en el remoto** — solo que la rama local no está adelante. Si tu commit quedó huérfano, ni siquiera está en la rama.
- **No commitear archivos que aparecieron solos.** Si `git add -A` levanta archivos que no escribiste, son del founder: sacarlos del commit (`git rm --cached`) y avisar.

## Ejemplo

**Input:**
Los archivos que estabas editando volvieron a su versión original y `HEAD` cambió.

**Output:**

```
$ git reflog -3
63bdc5f HEAD@{0}: checkout: moving from fix/resumen a feat/jaco-canal
8368a15 HEAD@{1}: commit (amend): fix(resumen): …
```

> Alguien hizo `git checkout` en este mismo directorio mientras yo trabajaba — el reflog lo muestra. Si tenés el repo abierto en otra terminal, era eso.
>
> **No se perdió nada:** mi commit `8368a15` y la rama siguen intactos. **No voy a cambiar de rama** para no arrancarte el árbol de trabajo: sigo en un worktree aparte y puedo pushear y abrir el PR sin tocar tu checkout.

---

## Apéndice (2026-11-03): repartir el trabajo entre varios ayudantes a la vez

Capturado del reparto de la tanda 2 de la guía de un sistema (Next.js + Supabase, Windows): **6 ayudantes, uno por frente, cada uno en su copia**, y después unir. Lo de arriba cubre cuando *el founder* pisa tu checkout; esto cubre cuando **vos** repartís trabajo en paralelo. El primer reparto (2 nov) dejó un `node_modules` vaciado y tres ayudantes pisándose las mismas pruebas; el segundo (3 nov) chocó mucho menos aplicando lo de abajo, aunque igual hubo que aflojar dos pruebas más al unir.

### Antes de repartir

1. **Una copia por ayudante, con su rama**: `git worktree add -b feat/<frente> <ruta> origin/main`. Ponela **hermana** de la principal si el proyecto busca archivos relativos a la raíz (por ejemplo el `.env.local` en `../../../`): desde una copia *dentro* del repo esa ruta no llega.
2. **Cada ayudante escribe archivos propios.** El catálogo, partido por categoría; cada flujo, en su `flujo-<nombre>.ts`. El archivo "índice" que todos importan lo toca **solo quien coordina**. Es lo que evita los conflictos al unir.
3. ⚠️ **Aflojá las pruebas compartidas UNA vez, antes de repartir.** Si una prueba fija una lista, un conteo o `RECORRIDOS[0]` ("las tareas sin pasos son estas"), va a fallar en cada rama por el trabajo de las otras, y los tres ayudantes tocan el mismo archivo de pruebas. Pasala a buscar por id, admití el nuevo máximo (un flujo, hasta 8 pasos) y, si necesitás "una tarea sin pasos", usá una **inventada**: las del catálogo van ganando pasos.
4. **Migraciones en orden estricto.** Si los ayudantes escriben migraciones, numeralas vos antes de repartir: el aplicador rechaza una pendiente anterior a la última aplicada.
5. **Modelo por tarea**: uno barato para lo mecánico con patrón claro; uno fuerte para la revisión final, **aparte** y sin tu conclusión.

### Las dependencias de una copia

- **Sin dependencias nuevas:** un *junction* de su `node_modules` al de la principal.
  ```powershell
  New-Item -ItemType Junction -Path "<copia>\node_modules" -Target "<principal>\node_modules"
  ```
  Ojo con la diferencia: en el CRM un **symlink** no alcanzó (errores fantasma de `tsc`, ver arriba); acá un **junction** sí, y `tsc`, el linter y `node --test` andan. No está probado que la causa sea *junction vs symlink* (son proyectos distintos), así que **verificalo antes de repartir**: `tsc` en la copia tiene que dar lo mismo que en la principal.
- **No corras `pnpm` en una copia enlazada**: quiere reinstalar todo. Llamá directo a `node_modules/.bin/<herramienta>`, y en Next corré `next typegen` antes de `tsc`.
- **Una copia que suma una dependencia** necesita instalación real (`pnpm install --frozen-lockfile`) y `pnpm add <paquete>@<versión exacta>` **antes** de mandar al ayudante.
- Un `pnpm install` puede quedar esperando **una pregunta invisible** (10 minutos, sin salida): con `CI=true` terminó en 0,1 s.

### ⛔ Borrar una copia enlazada: primero el enlace

`git worktree remove --force` **entra por el enlace** y vacía el `node_modules` de la principal. Pasó el 2 nov: un `rmdir` previo falló por la ruta y el comando siguiente corrió igual.

```powershell
$enlace = "D:\ruta\absoluta\de-la-copia\node_modules"
[System.IO.Directory]::Delete($enlace)                                  # quita el ENLACE, no lo que apunta
if (Test-Path $enlace) { throw "el enlace sigue ahí" }                  # frená si no se fue
(Get-ChildItem "D:\ruta\de-la-principal\node_modules" -Force | Measure-Object).Count   # tiene que seguir con contenido
git worktree remove --force "D:\ruta\de-la-copia"
```

Ruta **absoluta** siempre. Si ya pasó: `CI=true pnpm install --frozen-lockfile` en la principal repara el `node_modules`.

**La raíz del bug no es git, es la cadena:** un paso destructivo no puede depender de que el anterior *haya salido bien por casualidad*. En PowerShell `;` no frena; usá `-ErrorAction Stop` o `if ($?)`. Misma familia que `git-footguns-de-sesion` (en la terminal de Claude Code `set -e` tampoco frena).

### Unir y revisar

- **Unir de a una rama** y correr toda la suite tras cada unión. Un fallo en una prueba que "fija algo" es la señal de que faltó aflojarla (punto 3).
- **Dos revisiones, y la segunda es SOLO sobre los arreglos de la primera.** Un arreglo es código nuevo: en este reparto, el ayudante que aplicó la primera revisión metió una **regresión** que la segunda encontró (ver `guia-pasos-dentro-de-ventanas`).
- **Si dos revisores se contradicen, se prueba en el mundo real**, no se vota.
- Las pruebas **contra la base** de dos copias a la vez chocan por espera de candado: volvé a correr la que falló, **sola**.
- **Cerrá limpio:** borrá las copias (arriba), las ramas locales ya unidas, y comprobá que la principal quedó en su rama y con sus dependencias.
