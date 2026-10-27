# Skill: Rama de salida para subir varios PRs de una vez

Una ronda de trabajo dejó 10 PRs listos, cada uno revisado y con su preview, y
7 migraciones de base. El founder quería subir **todo junto**, más dos piezas
nuevas que pidió en el camino, *"para subir todo de una vez y que eso ya
aparezca ahí"*. Mergear 10 PRs a `main` uno por uno son 10 deploys a producción,
10 ventanas en las que el código y la base pueden no coincidir, y ningún momento
en el que se pueda probar TODO junto antes de que lo vean los clientes.

La rama de salida resuelve eso: **una rama que junta todo, se prueba como un
solo producto y entra a `main` en un solo merge.** Lo no-obvio es el orden con
la base: qué migraciones van ANTES del código, cuáles DESPUÉS, y cómo saberlo.

## Cuándo usar esta skill

- Hay 3 o más PRs listos que se quieren subir juntos, o que se tocan entre sí
  (los mismos archivos, una migración que otro PR lee).
- Hay que construir algo NUEVO encima de lo que todavía no está en `main`: la
  base para esa rama es la de salida, no `main`.
- El founder pide "subamos todo de una vez".

**No hace falta** para un PR suelto: ahí va directo, con su preview.

## Proceso

### 1. Armar la rama y probarla como producto

```bash
git checkout -b release/<ronda> origin/main
for b in <PRs en el orden probado>; do git merge --no-ff --no-edit origin/$b || exit 1; done
```

- **El orden importa.** Si un PR salió de la rama de otro, va después. Si dos
  tocan el mismo archivo, resolvé el conflicto UNA vez, en la rama del PR, no en
  la de salida.
- **Probala entera:** `tsc`, `eslint` y TODAS las pruebas. Anotá el número
  (822/822), porque es la línea de base para lo que se sume después.
- **Pusheala:** Vercel arma una preview de todo junto.

### 2. Clasificar cada migración: ¿compatible con el código que corre HOY?

Esta es la pregunta que ordena todo. Una migración es **compatible hacia atrás**
si el código de producción actual sigue funcionando con ella aplicada:
- columnas nuevas nullable o con default;
- valores nuevos de enum;
- triggers que solo completan campos nuevos;
- CHECKs que las filas existentes ya cumplen (medilo).

Las compatibles se aplican **ANTES** del merge, cuando se quiera. Con eso:
- el código nuevo encuentra la base lista desde el primer request;
- se puede verificar en pantalla contra la base real, ANTES de subir. Local y
  preview usan la misma base: sin las columnas, las pantallas nuevas fallan.

Las que **no** son compatibles van **DESPUÉS** del deploy:
- las que cambian datos que el código viejo seguiría escribiendo mal (caso real:
  corregir 506 mensajes mientras el cron viejo firmaba mal los nuevos; antes del
  deploy, los del intervalo quedaban mal);
- las que borran o renombran algo que el código viejo lee.

Para decidirlo, **leé el código de producción** (`git show origin/main:<archivo>`),
no el de la rama. Ejemplo real: un trigger que limita editar notas a 15 minutos.
¿Rompía la app vieja? Se buscó cómo escribía notas producción: solo INSERT y
DELETE, sin UPDATE. Compatible, y se aplicó antes.

Las Edge Functions siguen el mismo criterio: si la versión nueva tolera la base
vieja y la vieja tolera la nueva, se despliega antes, y queda un paso menos para
el momento de subir.

### 3. Construir lo nuevo SOBRE la rama de salida

Lo que el founder pida en el camino sale de la rama de salida, no de `main`,
porque toca los mismos archivos que la ronda:
- ramas `feat/<pieza>` desde `release/<ronda>`;
- en paralelo, cada una en su worktree DENTRO del repo, con su `pnpm install
  --frozen-lockfile`;
- después, merge de cada una a la rama de salida y otra vez la prueba completa.

### 4. Verificar en pantalla con la sesión del founder

- Con las migraciones compatibles ya aplicadas, el local muestra la verdad.
- Revisá 375 y 1280, con el script de desborde.
- Donde probar exige escribir, hacelo en la cuenta del propio negocio y
  deshacelo (crear, archivar y borrar), y verificá contra la base que quedó en 0.
- Lo que no se puede probar sin un tercero, **se dice**. Ejemplo: cargar una
  imagen en el chat necesita una conversación con la ventana de 24 h abierta.

### 5. Un PR de salida, y el merge con MERGE COMMIT

```bash
gh pr create --base main --head release/<ronda> --body-file <resumen>
gh pr merge <n> --merge          # NO --squash
git merge-base --is-ancestor <último commit> origin/main && echo "en main"
```

- **`--merge`, no `--squash`:** con un merge commit, los commits de cada PR
  quedan en `main` y GitHub marca los 10 PRs como MERGED solos. Con squash
  quedan abiertos, y parecen trabajo sin subir.
- **Verificá que llegó a `main`,** no que "se mergeó" (ver
  `verificar-base-del-pr-antes-de-mergear`).
- **Esperá la preview del último commit con código.** Si lo último es solo
  documentación, alcanza con la del commit de código anterior.

### 6. Después del deploy

1. **Confirmá que el deploy de producción es el del merge:** el sha del deploy
   `Production` tiene que ser el del merge commit.
2. **Aplicá las migraciones del "después"** y medí:
   - cuántas filas tocó;
   - cuántas quedan sin corregir (0).
   Si el número difiere de lo medido en la mañana, explicá por qué. Caso real:
   514 contra 506, porque el código viejo mandó 8 más durante el día.
3. **Revisá los errores de runtime** de producción desde el deploy y el tráfico
   real de las funciones que cambiaron.
4. **Actualizá el backlog en un PR de docs aparte.** No se commitea a `main`.

## Output esperado

- Un solo deploy a producción con toda la ronda.
- Migraciones aplicadas en el orden correcto, cada una medida.
- Los PRs individuales marcados MERGED.
- El backlog diciendo qué quedó y qué no se pudo probar.

## Ejemplo

- **Input:**
  - 10 PRs de una ronda: 4 sin migración y 6 con migraciones 0115–0121.
  - Dos piezas nuevas pedidas en el camino.
- **Output:**
  - `release/ronda-2026-09-25` con los 10 PRs, 796/796 pruebas.
  - Aplicadas antes: 0116–0121 y la Edge Function, todas compatibles.
  - Dos ramas `feat/*` construidas en paralelo sobre la de salida, cada una con
    su migración (0122, 0123), también compatibles y aplicadas antes.
  - Revisión independiente y verificación en pantalla.
  - PR #348 mergeado con merge commit; los 10 PRs quedaron MERGED.
  - 0115 aplicada después del deploy: 514 filas y 0 pendientes.

## Gotchas

- **El local contra la base de producción SIN las migraciones rompe las
  pantallas nuevas.** Por eso la verificación visual de las ramas con migración
  espera a que se apliquen las compatibles.
- **Un dev server que corrió mientras cambiabas de rama puede quedar con CSS o
  módulos viejos en caché:** "Module not found" de un archivo que sí existe, o
  una clase que no aplica. Reiniciá el server antes de sospechar del código.
- **No hagas `git checkout` en el checkout del founder:** usá worktrees (ver
  `worktree-para-no-pisar-el-checkout`).
- **Un hook que vive en `.githooks/` solo corre en las ramas que lo tienen:** el
  checkout principal parado en una rama vieja no lo trae hasta que se actualice.
