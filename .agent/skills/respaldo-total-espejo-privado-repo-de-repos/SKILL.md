# Skill: Respaldo total del entorno de trabajo — el espejo privado repo-de-repos

## Cuándo usar esta skill

- El repo público/de deploy del proyecto **excluye a propósito** el material de trabajo (`memory/`, `.claude/`, `inputs/`, `outputs/`, harnesses) y ese material **no tiene ningún respaldo**.
- Querés poder clonar en otra máquina y **seguir trabajando sin diferencia**, no solo compilar el producto.
- Tenés un template madre con subproyectos, cada uno con su propio repo: un solo espejo no alcanza.

**El disparador real:** cuando en un handoff aparece la línea *"`memory/` es local (sin backup git) -> respaldar aparte"*, ya estás en riesgo. Ese directorio es el cerebro del proyecto.

## Por qué existe esta skill

FreshAdFlow, julio 2026. Para mantener limpio el repo del deploy se excluyeron `memory/`, `.claude/`, `inputs/`, `outputs/` y `engine-gate0/`. Correcto para el repo del producto — y de golpe el cerebro del proyecto (decisiones, handoffs, backlog, el harness del Gate 0, las generaciones de usuarios reales) existía **en un solo disco**.

La solución no es meter todo en el repo del producto: es un **espejo separado**, privado, cuya regla es la inversa.

## La arquitectura: dos repos por proyecto, tres roles

| Repo | Qué contiene | Para qué |
|---|---|---|
| `<proyecto>` (origin) | **solo producto** (`src`, `supabase`, config) | el deploy. Limpio, compartible |
| `TMW-<proyecto>-app` (espejo) | producto **+ `.env`** | clon funcional inmediato |
| rama `respaldo-full-<fecha>` del espejo | **el 100%**: + `memory/`, `inputs/`, `outputs/`, `.claude/`, harnesses | el snapshot pesado (~264 MB) |

Y como el template madre es **un repo que contiene subproyectos** (cada uno su propio repo), el espejo también son dos:

- `TMW-<proyecto>-template` -> la raíz del template (skills, agentes, memoria, docs).
- `TMW-<proyecto>-app` -> el subproyecto.

`proyectos/` sigue ignorado en el template, para no anidar repos. Cada uno se clona por separado.

**Por qué el material pesado va en una rama y no en `main`:** para no inflar el repo del deploy ni el espejo liviano. Es un snapshot fechado; para un respaldo nuevo se crea otra rama `respaldo-full-<fecha>`.

## Proceso

### 1. Prefijo y visibilidad

Un prefijo reconocible (`TMW-`) y **privado siempre**. El espejo no es para publicar: es para clonar.

### 2. Documentar la regla en un `BACKUP.md` en la raíz

Sin ese documento, en tres meses nadie recuerda qué rama tiene qué. Debe decir: qué repo espeja qué, dónde vive el material pesado, y **los comandos exactos** para clonar y para respaldar.

### 3. Rutina de trabajo

```bash
# Template (raíz): un solo remoto
git add -A && git commit -m "..." && git push tmw --all

# App: dos remotos SEPARADOS, a propósito
git push origin <rama>     # repo del deploy — SOLO producto
git push tmw main          # espejo liviano (producto + .env)

# Snapshot completo nuevo (material pesado):
git add -f memory inputs outputs engine-gate0 .claude
git commit -m "chore(backup): snapshot completo <fecha>"
git branch respaldo-full-<fecha> && git push tmw respaldo-full-<fecha>
git reset --mixed HEAD~1    # sacar el material de main (queda en disco, ignorado)
```

El `git add -f` es necesario justamente porque esos directorios están en `.gitignore`.

### 4. Clonar en otra máquina

```bash
gh repo clone HansVilla21/TMW-<proyecto>-template
gh repo clone HansVilla21/TMW-<proyecto>-app proyectos/<proyecto> -- -b respaldo-full-<fecha>
cd proyectos/<proyecto> && npm install && npm run dev
```

Lo único que se regenera es `node_modules` y los builds. **Todo lo demás viaja.**

## El trade-off de los `.env` en texto plano — decidilo explícito

El espejo puede llevar los `.env` **en texto plano** para que el clon funcione sin configurar nada. Es una decisión legítima del dueño, y hay que tomarla con los ojos abiertos:

- Quedan en el **historial de git para siempre**. Borrarlos después no los saca del historial.
- **"Privado" no es "seguro":** una laptop robada, un colaborador agregado, o un cambio accidental a público expone todo. GitHub además escanea y alerta a los proveedores.
- Si un secreto se filtra, la respuesta es **rotarlo** en el proveedor, no borrar el archivo.
- Si un push se bloquea por secret scanning, GitHub da un link para permitirlo en un repo privado propio.

**Alternativa con el mismo resultado y sin el riesgo:** `git-crypt`. Encripta los `.env` en GitHub y se desencriptan localmente con `git-crypt unlock`. Migrable en cualquier momento si se decide endurecer.

## Gotchas

- **Un repo espejo no es un backup versionado de tus archivos de trabajo si nunca hacés push.** La rutina tiene que ser parte del cierre de sesión, no un acto de fe.
- **Los archivos de trabajo pesados crecen rápido** (generaciones de usuarios, imágenes de análisis). Por eso van en rama fechada y no en `main`.
- **Cuidado con las rutas largas en Windows** al clonar repos con árboles profundos: `git clone -c core.longpaths=true`.
- **El material que solo vive en una rama es frágil.** Si borrás la rama, se fue. Documentá en `BACKUP.md` qué rama es la buena.
- **Antes de untrackear un directorio con trabajo sin commitear, copialo aparte** — ver [[git-footguns-de-sesion]]. Ese es el accidente que suele dar origen a esta skill.

## Ejemplo (input -> output)

- **Input:** "el repo del deploy no lleva `memory/` ni `outputs/`, y eso solo está en mi disco".
- **Output:** dos repos espejo privados con prefijo `TMW-`, `main` liviano (producto + `.env`), rama `respaldo-full-2026-07-18` con el 100% (~264 MB), y un `BACKUP.md` con la rutina y el comando exacto de clonado.

## Relacionadas

[[git-footguns-de-sesion]] · [[handoff-dossier-a-otro-proyecto]] · [[worktree-para-no-pisar-el-checkout]] · [[deploy-seguro-vercel-preview-prod]]
