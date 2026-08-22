# Skill: Varias sesiones cosechando a la vez sin pisarse el índice

## Cuándo usar esta skill

- Vas a correr **más de un agente/sesión a la vez** sobre el mismo repo (típico: "auditá el proyecto A" y "auditá el proyecto B" en dos ventanas).
- Vas a agregar entradas a un **archivo índice compartido** (`CLAUDE.md`, un README de catálogo, un CHANGELOG) que otras sesiones también tocan.
- Abriste un PR y ves otro PR abierto que reclama **el mismo número/tier/versión**.
- Vas a mergear uno de varios PRs que agregan al mismo catálogo.

## Por qué existe esta skill

Capturada el **2026-08-22**. El founder lanzó **cuatro sesiones en paralelo**, cada una auditando un proyecto distinto (un CRM, un SaaS de anuncios, un sistema de contenido, un sitio de PYME) y todas con la misma instrucción: *capturá lo aprendido como skills y actualizá el índice*.

Cada sesión hizo bien su trabajo. El resultado combinado fue un choque:

- **Tres PRs distintos reclamaron el "Tier 24".** Ninguna sesión podía saberlo: cuando cada una leyó el índice, el último tier era el 23.
- **Los cuatro PRs editaban la misma región del mismo archivo**, así que todos menos el primero quedaron en conflicto.
- **El conteo declarado quedó mal en los cuatro.** Cada uno calculó "lo que había + lo mío", y lo que había cambió debajo.

> Lo importante: **ninguna sesión se equivocó.** El defecto es del diseño del índice, que asume un solo escritor.

Y hay un modo de fallo peor que el conflicto ruidoso: **el conflicto que git resuelve solo**. Dos sesiones agregando en puntos distintos del archivo hacen auto-merge sin avisar, y el número declarado arriba (`78 skills`) queda mintiendo mientras el contenido de abajo es correcto. Nadie lo nota, porque nadie cuenta.

---

## Las tres reglas

### 1. El número se reclama en el PR, no en el archivo

El tier / versión / id secuencial es un **recurso compartido**. Antes de escribir uno, mirar quién lo tiene:

```bash
gh pr list --state open --json number,title,headRefName
```

Si otro PR abierto ya lo reclama, **tomá el siguiente y ponéle la fecha de la sesión adentro** — así el orden cronológico sigue siendo legible aunque el número no lo respete. El criterio de desempate más simple y que no requiere hablar con nadie: **gana quien abrió el PR primero**.

### 2. El conteo se deriva, nunca se calcula de memoria

`ls | wc -l` contra el disco, después de cada merge. Nunca "lo que había más lo mío".

```bash
# la verdad, siempre
ls -d .agent/skills/*/ | wc -l
```

### 3. El índice se verifica contra el disco, no se lee

La única prueba que sirve: **cada cosa que existe resuelve por grep en el índice**. Se corre después de cada merge, no solo al escribir.

```bash
n=0
for s in $(ls -d .agent/skills/*/ | xargs -n1 basename); do
  grep -q "$s" CLAUDE.md || { echo "FALTA en el índice: $s"; n=$((n+1)); }
done
echo "huecos: $n"
```

Este chequeo también atrapa un defecto que nada más detecta: **un nombre partido en dos líneas** por el ancho de columna del índice deja de resolver por grep — y el índice existe justamente para eso.

---

## Al mergear varios PRs que tocan el mismo índice

El orden importa menos de lo que parece; lo que importa es **quién repasa al final**.

1. Mergear en el orden que sea (o el cronológico, si querés que los tiers queden lindos).
2. **Cada PR posterior:** traer `main` a la rama (`git merge origin/main`), resolver el índice **conservando los dos bloques**, y recalcular el conteo con `ls | wc -l`.
3. **El último en mergear corre la verificación completa** y arregla lo que quedó suelto.
4. Si el índice tiene familias/categorías además del listado cronológico, la nueva entrada va **en las dos**.

**Resolver el conflicto casi nunca es elegir un lado.** En un índice acumulativo, la resolución correcta es `ours + theirs`, con el contador recalculado. Elegir un lado **borra el trabajo del otro** — y como el archivo sigue siendo válido, nadie se entera.

## Cómo se evita de entrada

- **Particionar el archivo compartido** si el paralelismo va a ser habitual: un archivo por familia + un índice generado. El costo de mantener el índice a mano crece con el número de escritores.
- **Que las sesiones paralelas trabajen en carpetas disjuntas** y dejen el índice para un paso final único.
- **Derivar el índice con un script** en vez de escribirlo a mano. Un índice generado no tiene conflictos: se regenera.

## Output esperado

- Cada PR con un número que nadie más reclama.
- El conteo declarado igual a `ls | wc -l`.
- Verificación de cobertura en cero huecos, corrida **después** del último merge.
- En el PR, dicho explícito: qué PRs quedan abiertos tocando el mismo índice y qué hay que repasar cuando entren.

## Ejemplo

**Input:** abrís un PR con "Tier 24 — 4 skills nuevas" y al revisar los PRs abiertos ves otro, creado hace 6 horas, titulado "Tier 24 — 7 skills de ejecución y marca", que toca la misma región de `CLAUDE.md`.

**Output:** "El PR #12 reclamó el 24 primero, así que estas 4 pasan a Tier 25 con la fecha de sus sesiones (17 y 18 de agosto) escrita adentro. Mergeé #12 dentro de esta rama para que no queden dos PRs peleándose el archivo: al mergear esta, #12 se puede cerrar. Conteo recalculado contra el disco: 98, no la suma que tenía escrita. Verificación: 98/98 resuelven por grep en los dos índices. Quedan abiertos #15 y #16, que también agregan skills — cuando entren hay que repasar conteo y familia, no solo el bloque del tier."

## Skills relacionadas

`verificar-base-del-pr-antes-de-mergear` (el otro fallo del flujo de git: el PR dice MERGED y su base era otra rama) · `worktree-para-no-pisar-el-checkout` (paralelismo en el working tree, no en el índice) · `creador-de-skills` (el formato de lo que se está cosechando) · `verificar-funcionamiento-end-to-end` (verificar contra la fuente de verdad, que acá es el disco).
