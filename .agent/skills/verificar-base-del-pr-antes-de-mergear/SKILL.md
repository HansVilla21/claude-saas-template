# Skill: Verificar la BASE del PR antes de mergear (no alcanza con "MERGEABLE")

## Cuándo usar esta skill

- **Siempre, antes de mergear cualquier PR.** No es una skill de casos raros: es un chequeo de 2 segundos que evita que trabajo terminado no llegue nunca a producción.
- Con más razón si: el repo tiene varias ramas de feature vivas, se trabajó apilando ramas (una feature encima de otra), o pasaron días entre que se abrió el PR y se mergea.
- También al **reportar** que algo "está en producción": la respuesta correcta no sale de que el PR diga MERGED.

## Por qué existe esta skill

Capturada el **2026-08-11** en el CRM de Momentum, después de que pasara **de verdad y casi dos veces**.

**Lo que pasó.** Dos PRs (#95, el fix del clamp de persona del asistente de IA; y #96, la conexión del número de producción de Jacó) figuraban como `MERGED` desde el día anterior. Se verificó `mergeable: MERGEABLE` y `mergeStateStatus: CLEAN` antes de mergearlos. Todo verde.

Pero su `baseRefName` **no era `main`**: era otra rama de feature. Al mergearlos, el código entró **en esa rama**, no en producción. El fix del asistente de IA llevaba un día sin llegar a los usuarios y nadie lo había notado, porque toda la evidencia visible decía "mergeado".

**El casi-segundo caso, el mismo día.** Un PR se apiló a propósito sobre otro. Al mergear el de abajo, **GitHub NO reapuntó el de arriba a `main`** — solo lo hace si la rama base se borra al mergear. El PR de arriba seguía apuntando a una rama que ya estaba mergeada, y mergearlo ahí lo habría dejado fuera de producción otra vez. Se detectó solo porque ya existía la cicatriz.

**Por qué engaña:** `mergeable: MERGEABLE` responde *"¿se puede mergear sin conflictos?"*, no *"¿a dónde?"*. Un PR contra una rama muerta es perfectamente mergeable.

## Proceso

### 1. Antes de mergear: mirar la base, no solo el estado

```bash
gh pr view <n> --json baseRefName,mergeable,mergeStateStatus,state \
  --jq '"base=\(.baseRefName) mergeable=\(.mergeable) estado=\(.mergeStateStatus) state=\(.state)"'
```

Si `base` no es la rama de producción (`main`/`master`), **parar**. Dos caminos:

- **Fue un error** → reapuntar: `gh pr edit <n> --base main`
- **Es apilado a propósito** → mergear primero el de abajo, y **después reapuntar el de arriba a mano**. No confiar en que GitHub lo haga.

⚠️ Al reapuntar, la mergeabilidad se **recalcula**: un PR que estaba `CLEAN` puede pasar a `CONFLICTING`, porque recién ahí se compara contra la base real. Ese conflicto siempre existió; estaba escondido.

### 2. Si aparece un conflicto al reapuntar, resolverlo sin pisar a nadie

Ver la skill `worktree-para-no-pisar-el-checkout`. Nunca resolver en el checkout del founder si está trabajando.

### 3. Después de mergear: verificar contra la RAMA, no contra el PR

Que el PR diga `MERGED` solo dice que se mergeó **a algún lado**. Confirmar el destino y que el código llegó:

```bash
# ¿a dónde fue?
gh pr view <n> --json state,baseRefName,mergedAt

# ¿está el código en la rama de producción?
gh api "repos/<owner>/<repo>/contents/<archivo-nuevo>?ref=main" --jq '.name'

# para un cambio dentro de un archivo existente, buscar el símbolo nuevo
gh api "repos/<owner>/<repo>/contents/<archivo>?ref=main" --jq '.content' \
  | base64 -d | grep -c "<simbolo_nuevo>"
```

### 4. Auditar si ya venía roto de antes

Si el repo tiene PRs mergeados hace tiempo, revisar que no haya más código represado:

```bash
gh pr list --state merged --limit 30 --json number,title,baseRefName \
  --jq '.[] | select(.baseRefName != "main") | "#\(.number) → \(.baseRefName)  \(.title)"'
```

Todo lo que salga ahí está mergeado **fuera** de producción.

### 5. Rescatar lo represado

La rama que recibió los merges queda adelante de `main`. Se lleva con un PR normal de esa rama → `main`, describiendo qué venía adentro. Antes, comprobar qué arrastra:

```bash
gh api "repos/<owner>/<repo>/compare/main...<rama>" --jq '{ahead:.ahead_by, behind:.behind_by}'
```

## Output esperado

- Cero PRs mergeados contra una rama que no sea la de producción, salvo apilado **explícito y anotado en el PR**.
- Al reportar "está en producción", la afirmación se apoya en haber leído la rama, no en el estado del PR.
- Si hay apilado, el PR de arriba lo dice en el cuerpo: *"⚠️ apilado sobre #N — mergear ese primero"*.

## Gotchas

- **GitHub solo reapunta automáticamente si la rama base se BORRA al mergear.** Si el repo conserva las ramas (muy común), no reapunta nada.
- **`mergeStateStatus: UNKNOWN` no es un error.** GitHub está recalculando; esperar unos segundos y volver a consultar.
- **Un PR contra una rama muerta puede decir `CLEAN`.** Verde no significa "va a producción".
- Mergear no despliega nada que viva fuera del repo: **workflows de n8n y edge functions se despliegan aparte**. Decir "mergeado" no es decir "activo" para esas capas.

## Ejemplo

**Input:**
"Mergeá los PRs #95 y #96."

**Output (correcto):**

```
$ gh pr view 95 --json baseRefName,mergeable
base=fix/catalogo-playground-compat  mergeable=MERGEABLE
```

> ⚠️ Freno. El #95 está limpio, pero su base **no es `main`** — apunta a `fix/catalogo-playground-compat`. Si lo mergeo así, el fix del asistente de IA entra en esa rama y **no llega a producción**.
>
> Dos opciones: lo reapunto a `main` ahora, o lo mergeo ahí y después subimos esa rama entera con un PR. ¿Cuál preferís?

**Output (el error que esta skill evita):**

> Ambos mergeados ✅
>
> *(…y el código sigue sin estar en producción, con toda la evidencia diciendo que sí)*
