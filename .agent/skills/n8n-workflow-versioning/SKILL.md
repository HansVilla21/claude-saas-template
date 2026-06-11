# Skill: N8N Workflow Versioning Policy

## Cuándo usar esta skill

- Vas a tocar un workflow N8N de producción (cualquier cambio: nodo nuevo, edit de Code, prompt LLM, conexiones).
- Vas a hacer PUT a la API de N8N para deployar una versión nueva.
- Algo se rompió en producción y necesitás hacer rollback rápido.
- Estás arrancando un nuevo workflow desde cero y querés establecer la convención antes de que crezca.

**No usar** cuando:

- Solo estás explorando o leyendo el JSON, sin tocarlo.
- Estás iterando en N8N UI sobre un workflow inactivo de pruebas (no afecta producción).

## Por qué existe esta skill

Los workflows N8N son frágiles si se manejan mal:

- Cada edit en N8N UI es invisible al git history.
- Re-importar el JSON viejo borra TUS cambios.
- Múltiples humanos + agentes editando = regresión silenciosa.
- Si el servidor N8N se cae, perdés todo lo que no esté snapshotado externamente.

**Solución:** disciplina de versionado. Todo workflow tiene:

1. Su JSON checkeado en git (no untracked).
2. Build scripts idempotentes que lo generan (skill `n8n-workflow-build-script`).
3. Snapshots inmutables del estado LIVE en momentos críticos.
4. Tags git por fases o deploys importantes.
5. Procedure de rollback documentado y probado.

## Convenciones

### Ubicación de archivos

```
crm-v2/                              ← repo del producto (no del template)
├── n8n/
│   ├── workflows/
│   │   ├── <workflow-name>-v1.json
│   │   ├── <workflow-name>-v2.json    ← cambio estructural
│   │   ├── <workflow-name>-v2.1.json  ← hotfix sobre v2
│   │   └── snapshots/
│   │       └── <slug>-LIVE-YYYY-MM-DD.json   ← inmutable, nunca se edita
│   ├── README.md
│   └── ...
├── scripts/
│   ├── build-<workflow>-v<N>.js     ← input: v<N-1>, output: v<N>
│   ├── n8n-pull.mjs                 ← GET workflow vivo → snapshot
│   └── n8n-push.mjs                 ← PUT JSON al servidor
└── docs/operations/
    └── n8n-rollback.md              ← 5 pasos para rollback
```

**Antipattern:** workflows en el repo madre/template untracked. Los workflows pertenecen al PRODUCTO, no al template.

### Versionado de archivos

- **Cambio estructural** (nodos nuevos, conexiones nuevas, fase nueva del proyecto) → `vN+1.json`.
- **Hotfix sobre vN** (fix de bug puntual, sin cambiar la fase) → `vN.M.json` (ej. `v5.1`, `v5.2`).
- **Nunca sobreescribir un `vN` ya deployado.** Si el archivo `bot-v6-v1.json` se deployó alguna vez, no se toca más. Crear `v2`, `v1.1`, etc.
- **Anti-pattern observado en este proyecto (2026-05-30):** F2 + F4 + tool-rename modificaron `bot-v6-v1.json` in-place. Funcionó pero perdimos los puntos intermedios. Para F5/F6 corregimos: cada fase = nuevo archivo.

### Build scripts

- Cada `vN.json` tiene un `scripts/build-<workflow>-vN.js` asociado.
- El script lee `vN-1.json`, aplica mutaciones, escribe `vN.json`.
- Idempotente: correrlo dos veces da el mismo resultado.
- Smoke tests al final del script (count nodos, presencia de nodos críticos, etc.).
- Ver `.agent/skills/n8n-workflow-build-script/SKILL.md` para detalles.

### Snapshots inmutables

- **Cuándo crear snapshot:** antes de cada deploy que vaya a producción. **Siempre.**
- **Cómo crear:** `node scripts/n8n-pull.mjs <workflow_id>` → guarda en `n8n/workflows/snapshots/<slug>-LIVE-<fecha>.json`.
- **Nunca editar un snapshot.** Es la red de seguridad. Si necesitás un punto de partida nuevo, copialo a `workflows/<workflow>-vN.json` con el nombre regular.
- Los snapshots se commitean al repo. Son inmutables después.

### Tags git

- **Cuándo taggear:** después de cada deploy que activa una fase nueva en producción.
- **Formato:** `<workflow>-<fase>-YYYY-MM-DD` (ej. `bot-v6-F4-completo-2026-05-30`).
- **Tags especiales:** antes de migraciones grandes (`<workflow>-pre-<migracion>-YYYY-MM-DD`). Estos son los puntos de rollback más probables.
- **Tag = punto de rollback.** `git checkout <tag> -- n8n/workflows/<archivo>.json` te devuelve el JSON exacto.

## Workflow de cambio (paso a paso)

### 1. Antes de tocar nada

```bash
# Snapshot del LIVE actual (red de seguridad)
node scripts/n8n-pull.mjs <workflow_id>
# → genera n8n/workflows/snapshots/<slug>-LIVE-YYYY-MM-DD.json
```

### 2. Crear/editar el build script

```bash
# Convención: vN-1 → vN
# Copiar el último build script como base
cp scripts/build-<workflow>-vN-1.js scripts/build-<workflow>-vN.js
# Editar la nueva sección
```

Ver skill `n8n-workflow-build-script` para estructura del script.

### 3. Correr el build

```bash
node scripts/build-<workflow>-vN.js
# → escribe n8n/workflows/<workflow>-vN.json + smoke tests pasados
```

### 4. Verificar contra el snapshot

```bash
# Diff entre el JSON nuevo y el LIVE actual
node -e "
const a = require('./n8n/workflows/snapshots/<slug>-LIVE-<fecha>.json');
const b = require('./n8n/workflows/<workflow>-vN.json');
console.log('LIVE nodes:', a.nodes.length);
console.log('NEW  nodes:', b.nodes.length);
console.log('LIVE names:', a.nodes.map(n => n.name).slice(0, 10));
"
```

### 5. Commit ANTES de PUT

```bash
git add n8n/workflows/<workflow>-vN.json scripts/build-<workflow>-vN.js
git commit -m "feat(n8n): bot-v6 vN <descripcion>

Cambios:
- <cambio 1>
- <cambio 2>

Build script: scripts/build-<workflow>-vN.js
Snapshot LIVE previo: n8n/workflows/snapshots/<slug>-LIVE-<fecha>.json"
```

**NUNCA PUT sin commit previo.** El PUT es irreversible sin el snapshot, y el snapshot solo vale si está en git.

### 6. PUT al servidor

```bash
node scripts/n8n-push.mjs <workflow_id> n8n/workflows/<workflow>-vN.json
```

### 7. Tag si activa fase nueva

```bash
git tag -a "<workflow>-<fase>-YYYY-MM-DD" -m "<descripcion corta>"
git push origin "<workflow>-<fase>-YYYY-MM-DD"
```

### 8. Verificar en producción

- Mandar mensaje de prueba al canal real.
- Verificar logs de edge functions de Supabase.
- Esperar 5 min monitoreando.

Si algo se rompe → `docs/operations/n8n-rollback.md`.

## Anti-patterns (NO hacer)

- ❌ **Editar el JSON a mano.** Siempre vía build script. Edit a mano = typos no reproducibles.
- ❌ **Sobreescribir un `vN` ya deployado.** Crear `vN+1` o `vN.M`.
- ❌ **PUT sin snapshot previo.** Si el PUT rompe algo, no tenés punto de comparación.
- ❌ **PUT sin commit previo.** El git history es la fuente de verdad; sin commit el cambio es invisible.
- ❌ **Tags genéricos** tipo `latest`, `prod`, `release`. Usar formato `<workflow>-<fase>-<fecha>` para que sirva como rollback target.
- ❌ **Workflows untracked en el repo madre.** Pertenecen al repo del producto.
- ❌ **Rollback sin tag.** Si no taggeás, "volver al estado de ayer" requiere arqueología en git log.
- ❌ **Hacer rollback en `main` directo.** Usar `hotfix/rollback-<workflow>-a-<fase>` para audit trail.

## Gotchas técnicos

- **N8N regenera `versionId` en cada activate/deactivate.** No usarlo como identificador semántico — el tag git es el identificador real.
- **`active: true|false` en el JSON local NO controla si está vivo.** Es solo el default. El estado real lo controla el N8N server. Build scripts deben setear `active: false` para que el founder active manualmente.
- **PUT con campos extra (id, createdAt, versionId) da error.** Solo mandar: `name`, `nodes`, `connections`, `settings`, `staticData`. El script `n8n-push.mjs` ya filtra.
- **`updatedAt` del LIVE puede ser MÁS RECIENTE que el PUT más reciente.** N8N actualiza este timestamp en cada activate/deactivate manual desde UI. No usar como prueba de "no se tocó a mano".
- **N8N self-hosted en Easypanel no tiene snapshot automático.** Si Easypanel cae, perdés workflows no commiteados. **Esta es la razón #1 para checkear todo en git.**

## Caso real: este proyecto (Momentum AI CRM, 2026-05-30)

**Estado descubierto:** los 11 workflows + 10 build scripts estaban en `claude-saas-template/` (el madre), pero **UNTRACKED en git**. La única fuente de verdad era el N8N vivo en Easypanel. Riesgo: si la carpeta se borraba o Easypanel caía, se perdía todo.

**Fix ejecutado:**

1. **Snapshot del LIVE actual** (`bot-v6-v1-LIVE-2026-05-30.json`, 70 nodos, 126KB).
2. **Mudanza** `n8n/` + `scripts/` de `claude-saas-template/` → `crm-v2/`.
3. **Commit** en branch `feat/f4-bot-schedule-auto-actions` (29 archivos, 35k líneas).
4. **2 tags** creados:
   - `bot-v6-F4-completo-2026-05-30` (estado actual post-F4).
   - `bot-v6-pre-migracion-C-2026-05-30` (punto seguro antes de empezar F5/F6).
5. **Push** branch + tags a GitHub.
6. **Doc rollback** en `crm-v2/docs/operations/n8n-rollback.md`.
7. **Scripts utility** nuevos: `n8n-pull.mjs` + `n8n-push.mjs`.

**Resultado:** desde 2026-05-30, todo cambio futuro al workflow tiene reversibilidad total vía `git checkout <tag>` + `n8n-push.mjs`.

## Cómo se invoca en sesión

El founder NO escribe `/n8n-versioning`. Detectar proactivamente cuando:

- Va a tocar un workflow N8N de producción.
- Pide "manejo de versiones" o "vamos a tener cuidado con esto" en contexto de N8N.
- Está por empezar una migración o fase nueva.

Y aplicar la convención sin pedir confirmación de cada paso. Reportar al final qué se hizo + el tag de rollback creado.
