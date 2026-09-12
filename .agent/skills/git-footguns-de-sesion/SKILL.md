# Skill: Los cuatro footguns de git que borran o pisan trabajo en una sesión con agentes

## Cuándo usar esta skill

- Vas a **sacar del repo** un directorio que ya estaba trackeado (`memory/`, `.claude/`, `outputs/`).
- Hay **dos sesiones de Claude** (o Claude + el IDE) trabajando sobre la misma copia de trabajo.
- Git te pide credenciales una y otra vez en Windows, o commitea con la cuenta equivocada.
- Vas a escribir en **otro repo**, o en un checkout donde hay trabajo ajeno sin commitear, con un script de varios pasos.

**Los cuatro son irreversibles o casi si no los agarrás en el momento.** Ninguno da error donde hace el daño: te dejan el árbol "limpio" y el trabajo perdido o metido en el commit equivocado.

## Footgun 1 — Untrackear un directorio borra tus archivos sin commitear

**Lo que pasó (FreshAdFlow, 2026-07-10):** para excluir el material interno del repo se hizo `git rm --cached memory .claude` + merge + `git pull`. Git **borró los archivos del working tree** y con ellos las ediciones de memoria de la sesión **que no estaban commiteadas**.

**Por qué:** `git rm --cached` los saca del índice; el merge/pull posterior los reconcilia con una rama donde ya no existen, y el árbol de trabajo se alinea. Para git no hay nada que perder — esos archivos ya no son suyos.

**La regla:**

> Antes de untrackear un directorio con contenido valioso sin commitear: **copialo aparte primero.** O commiteá el contenido antes de sacarlo.

```bash
cp -r memory ../memory-backup-$(date +%F)   # el seguro, primero
git rm -r --cached memory
echo "memory/" >> .gitignore
git commit -m "chore: memory pasa a local"
```

**Si ya pasó:** lo que estaba en git se recupera (`git checkout <sha> -- memory .claude`); lo que no estaba commiteado hay que reconstruirlo desde la conversación. En FreshAdFlow se recuperó todo, pero costó tiempo.

**Y el efecto secundario que hay que aceptar conscientemente:** desde ese momento el directorio **no tiene backup por git**. Si es el cerebro del proyecto, necesita otro respaldo — ver [[respaldo-total-espejo-privado-repo-de-repos]].

## Footgun 2 — Dos sesiones sobre la misma rama y el `git add -A`

**Lo que pasó (FreshAdFlow, 2026-07-06):** dos sesiones corriendo sobre la MISMA rama y copia de trabajo produjeron un commit roto. Un `git add -A` de una sesión **barrió trabajo de la otra sin commitear**, y el IDE revirtió ediciones de archivos que tenía abiertos.

**Las tres reglas:**

1. **Una rama (o un worktree) por sesión.** Ver [[worktree-para-no-pisar-el-checkout]].
2. **Nunca `git add -A`** si puede haber trabajo ajeno sin commitear. Stagear explícito, archivo por archivo.
3. **Cerrá en el IDE las pestañas de los archivos que el agente va a editar.** Un editor con el buffer viejo puede sobrescribir el archivo al guardar.

Se recuperó, pero el modo de falla es silencioso: el commit existe, compila, y le falta la mitad del trabajo de alguien.

## Footgun 3 — Varias cuentas de GitHub en Windows (Credential Manager)

**Síntoma:** el Git Credential Manager abre un diálogo de cuenta en cada push, o commitea/pushea con la cuenta equivocada porque hay credenciales de otros usuarios guardadas.

**Fix, fijado por repo (no global):**

```bash
git config credential.https://github.com.username HansVilla21
git remote set-url origin https://HansVilla21@github.com/<owner>/<repo>.git
```

El usuario embebido en la URL del remoto + el `credential.username` por repo hacen que el manager resuelva sin preguntar.

**Si sigue preguntando:** borrar las cuentas extra del **Administrador de credenciales de Windows** (las entradas `git:https://github.com` de otros usuarios, incluidas las de tipo `x-access-token`).

## Footgun 4 — El paso que falla no frena a los que siguen, y el que sigue escribe en el checkout equivocado

**Lo que pasó (repo madre, 2026-09-10):** había que commitear una entrada en `memory/decisions.md` del madre, y en su checkout OTRA sesión tenía trabajo sin commitear en ese mismo archivo. Para no tocarlo, el plan era un worktree basado en `origin/main`. El `git worktree add` falló con `Filename too long` (Windows: la ruta larga del scratchpad más las rutas hondas de `inputs/repos-referencia/`). Las líneas siguientes corrieron igual: el `cd` al worktree falló, y `git add` + `git commit` corrieron **en el checkout principal**. Commitearon la entrada sin guardar de la otra sesión con el mensaje de esta. El único error visible llegó después y en otro lado: el PR no se pudo abrir (`No commits between main and …`) porque la rama que se pusheó estaba vacía.

**Por qué:**

- En un script de varias líneas, cada línea corre aunque la anterior haya fallado. El `&&` solo encadena dentro de la misma línea.
- En la terminal Bash de Claude Code en Windows, **`set -e` no frena**: `(set -e; false; echo sigo)` imprime `sigo`. Un segundo script con `set -e` siguió de largo después de que un `python` saliera con error. Probalo en tu terminal antes de confiar en él.

**La regla:**

> En un script que escribe (git, archivos, deploy): **`|| exit 1` en cada paso que importa**, y **afirmar en qué rama estás antes del primer `git add`**.

```bash
[ "$(git -C "$REPO" branch --show-current)" = "docs/mi-rama" ] || { echo "PARO: rama inesperada"; exit 1; }
git -C "$REPO" add memory/decisions.md || exit 1
```

`git -C` es mejor que `cd` (un `cd` que falla te deja parado donde estabas), pero no alcanza solo: si el directorio existe y está dentro de otro repo, git sube hasta ese repo. Lo que protege es la afirmación de la rama.

**Para commitear en otra rama sin tocar un checkout con trabajo ajeno** (lo que terminó funcionando): armar el commit con la plomería de git. No hay working tree ni rutas largas, y el índice del checkout no se toca.

```bash
export MSYS_NO_PATHCONV=1   # Git Bash convirtió "origin/main:.agent/..." en "origin\main;.agent\..."
REPO="D:/ruta/al/repo"; TMP="C:/ruta/absoluta/temporal"   # absolutas, estilo C:/ en Windows
git -C "$REPO" fetch origin || exit 1
git -C "$REPO" cat-file blob origin/main:memory/decisions.md > "$TMP/copia.md" || exit 1
# editar $TMP/copia.md respetando los finales de línea del original
blob=$(git -C "$REPO" hash-object -w --no-filters "$TMP/copia.md") || exit 1
export GIT_INDEX_FILE="$TMP/indice"; rm -f "$GIT_INDEX_FILE"
git -C "$REPO" read-tree origin/main || exit 1
git -C "$REPO" update-index --cacheinfo "100644,$blob,memory/decisions.md" || exit 1
tree=$(git -C "$REPO" write-tree) || exit 1
unset GIT_INDEX_FILE
sha=$(git -C "$REPO" commit-tree "$tree" -p origin/main -F "$TMP/mensaje.txt") || exit 1
git -C "$REPO" diff --numstat origin/main "$sha"   # control antes del push: solo lo tuyo, 0 borradas
git -C "$REPO" push origin "$sha:refs/heads/docs/mi-rama" || exit 1
```

- **`--no-filters`:** sin él, `hash-object` le aplica al archivo la conversión de finales de línea del repo (así lo dice la documentación de git). El `numstat` lo delata: si las borradas y las agregadas son el archivo entero, cambiaste los finales de línea.
- **Los finales de línea se miden en bytes** (`tr -cd '\r' < archivo | wc -c`, o Python), nunca con `grep -c $'\r'`: en esta terminal `$'\r'` da un patrón vacío y cuenta todas las líneas. Dio "1531 de 1531" sobre un archivo que era LF.
- **Varios archivos:** un `update-index --cacheinfo` por archivo, antes del `write-tree`.

**Si ya pasó** (se deshizo sin pérdida, antes del push):

1. Confirmar que el commit de arriba es el equivocado y qué se llevó: `git show --stat HEAD`. Confirmar que no se pusheó: `git branch -r --contains HEAD` tiene que venir vacío.
2. Guardar el hash del archivo en disco: `git hash-object <archivo>`.
3. `git reset --soft HEAD~1` y después `git restore --staged <archivo>`. El trabajo ajeno vuelve a estar sin commitear, como estaba.
4. Controlar: el hash del archivo en disco es el mismo de antes, y `git status --short` es la lista de antes.

## Gotchas

- **Ninguno da error donde hace el daño.** El árbol queda limpio, el push pasa, el build compila. Solo lo notás cuando buscás algo que ya no está, o, en el cuarto, cuando algo falla varios pasos después y en otro lado.
- **`git status` limpio no significa "todo guardado"**: significa "todo lo que git conoce está guardado". Lo ignorado es invisible para esa frase.
- **Antes de cualquier operación destructiva** (`reset --hard`, `push --force`, `checkout --` sobre archivos modificados), preguntate qué hay en el árbol que git no está siguiendo.
- **Si el proyecto tiene material valioso ignorado**, la rutina de cierre de sesión tiene que incluir su respaldo — no alcanza con commitear.

## Ejemplo (input -> output)

- **Input:** "sacá `memory/` y `.claude/` del repo, que son internos".
- **Output correcto:** copia aparte -> `git rm -r --cached` -> `.gitignore` -> commit -> **y** decidir dónde vive el respaldo de ese directorio de ahora en adelante.
- **Input:** "guardá las decisiones en el madre", y en el checkout del madre hay trabajo de otra sesión sin commitear.
- **Output correcto:** commit armado con plomería sobre `origin/main`, control de `numstat` antes del push y PR aparte. En ese checkout no se corre ni un `git add`.

## Relacionadas

[[respaldo-total-espejo-privado-repo-de-repos]] · [[worktree-para-no-pisar-el-checkout]] · [[verificar-base-del-pr-antes-de-mergear]] · [[deploy-seguro-vercel-preview-prod]] · [[cosechas-en-paralelo-sin-pisarse]]
