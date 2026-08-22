# Skill: Los tres footguns de git que borran trabajo en una sesión con agentes

## Cuándo usar esta skill

- Vas a **sacar del repo** un directorio que ya estaba trackeado (`memory/`, `.claude/`, `outputs/`).
- Hay **dos sesiones de Claude** (o Claude + el IDE) trabajando sobre la misma copia de trabajo.
- Git te pide credenciales una y otra vez en Windows, o commitea con la cuenta equivocada.

**Los tres son irreversibles o casi.** Ninguno da error: te dejan el árbol "limpio" y el trabajo perdido.

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

## Gotchas

- **Estos tres no dan error.** El árbol queda limpio, el push pasa, el build compila. Solo lo notás cuando buscás algo que ya no está.
- **`git status` limpio no significa "todo guardado"**: significa "todo lo que git conoce está guardado". Lo ignorado es invisible para esa frase.
- **Antes de cualquier operación destructiva** (`reset --hard`, `push --force`, `checkout --` sobre archivos modificados), preguntate qué hay en el árbol que git no está siguiendo.
- **Si el proyecto tiene material valioso ignorado**, la rutina de cierre de sesión tiene que incluir su respaldo — no alcanza con commitear.

## Ejemplo (input -> output)

- **Input:** "sacá `memory/` y `.claude/` del repo, que son internos".
- **Output correcto:** copia aparte -> `git rm -r --cached` -> `.gitignore` -> commit -> **y** decidir dónde vive el respaldo de ese directorio de ahora en adelante.

## Relacionadas

[[respaldo-total-espejo-privado-repo-de-repos]] · [[worktree-para-no-pisar-el-checkout]] · [[verificar-base-del-pr-antes-de-mergear]] · [[deploy-seguro-vercel-preview-prod]]
