# Skill: Una regla escrita depende de que alguien se acuerde — un hook no

## Cuándo usar esta skill

- Una regla del proyecto **ya está escrita** y aun así se violó.
- Estás por agregar una regla nueva a `CLAUDE.md` / `AGENTS.md` y querés saber si alcanza con escribirla.
- Vas a inicializar un proyecto donde un error tiene consecuencia **externa** (deploy a producción, commit de un secreto, push a `main`).
- Alguien propone "acordémonos de X" como solución a algo que ya pasó.

## Por qué existe esta skill

Capturada el **2026-07-15** en el CRM de Momentum, y formalizada como paso 2 de la defensa en profundidad del proyecto.

La regla *"nunca push directo a `main`, todo vía PR + preview"* estaba escrita **desde el 2026-05-29**, en el CLAUDE.md global y en el del proyecto. El 15 de julio un cambio se commiteó y pusheó directo a `main`, disparando **un deploy a producción sin pasar por el preview de Vercel**.

Nadie fue descuidado. La regla simplemente no estaba en el camino: escribir una regla la pone en un documento, no en el momento en que se comete el error.

> **Una regla escrita es una intención. Un hook es una barrera.**
> La pregunta no es "¿está documentado?" sino **"¿qué pasa si me olvido?"**.

### La defensa en profundidad, en orden

| Capa | Qué hace | Falla cuando |
|---|---|---|
| 1. `CLAUDE.md` / `AGENTS.md` | guía el comportamiento | alguien no lo leyó, o lo leyó y se le pasó |
| 2. **El hook** | **enforcement determinístico** | no se instaló (ver más abajo) |
| 3. `.gitignore` | última línea de defensa | el archivo no matchea el patrón |

Las tres, no una. La capa 1 explica **por qué**; la capa 2 hace que no importe si te acordás.

---

## Cuándo una regla merece hook (y cuándo no)

Poner un hook a todo es tan malo como no poner ninguno: los hooks lentos o ruidosos terminan salteados con `--no-verify`, y ahí perdés también los que sí importaban.

**Merece hook** si la respuesta a las tres es sí:

1. **¿La consecuencia sale del repo?** (deploy, secreto publicado, mensaje a un cliente, cobro)
2. **¿Es detectable de forma determinística?** (una rama, un patrón, un archivo — no "¿está bien escrito?")
3. **¿Ya pasó al menos una vez, o el costo de la primera es inaceptable?**

**No merece hook:** preferencias de estilo (eso es el linter), reglas que requieren juicio, cosas que el CI ya agarra sin bloquear a nadie.

---

## Las tres propiedades de un hook que sobrevive

### 1. Explica, no solo bloquea

Un hook que dice `error: not allowed` se saltea. Uno que dice qué hacer, se obedece. El mensaje tiene que traer **el comando exacto** para salir del paso, incluido el caso "ya commiteé acá y quiero mover el trabajo".

```sh
echo "  ⛔  BLOQUEADO: estás commiteando directo en '$branch'."
echo "  Un commit acá dispara un deploy a PRODUCCIÓN sin validar en preview."
echo "  Qué hacer:"
echo "    git switch -c feat/<nombre>     # el commit se lleva la rama nueva"
```

### 2. Tiene escapes deliberados, no clandestinos

Si no hay puerta, la gente rompe la ventana (`--no-verify`, que apaga **todos** los hooks). Dejá una puerta **explícita y que deje rastro**:

```sh
if [ "$ALLOW_MAIN_COMMIT" = "1" ]; then
  echo "⚠️  Commit permitido por ALLOW_MAIN_COMMIT=1 (escape explícito)."
  exit 0
fi
```

Escribir `ALLOW_MAIN_COMMIT=1` es una **decisión**; `--no-verify` es un descuido con nombre de flag.

### 3. Conoce sus falsos positivos

Un hook que bloquea trabajo legítimo se desinstala en una semana. El caso obvio acá: **un merge en `main` es normal** y no es un commit directo.

```sh
# Un merge en curso no es un commit directo → dejarlo pasar
if [ -f "$(git rev-parse --git-dir)/MERGE_HEAD" ]; then
  exit 0
fi
```

---

## El gotcha que hace que el hook no exista

> **`.git/hooks/` NO se versiona.** Un hook commiteado no viaja al clon de nadie.

Por eso el hook vive en `.githooks/` (una carpeta normal, versionada) y **cada clon** apunta git ahí, **una vez**:

```bash
git config core.hooksPath .githooks
```

Sin ese comando, el hook **no existe** para vos, aunque lo veas en el repo. Verificalo:

```bash
git config core.hooksPath   # tiene que decir: .githooks
```

Esto va en el README y en el onboarding del proyecto. Es el eslabón que rompe todo el esquema en silencio: el archivo está, se lee, da confianza, y no corre.

*(Alternativas si el equipo crece: un `prepare` de npm/pnpm que corra el `git config`, o Husky. Para un repo chico, el `git config` documentado alcanza y no agrega dependencias.)*

---

## Proceso

1. **Esperar el incidente, o medir su costo.** Un hook por cada miedo hipotético es ruido.
2. **Pasar el filtro de 3 preguntas** (consecuencia externa · detectable · ya pasó).
3. **Escribir el hook en `.githooks/`**, con el "por qué" y el incidente **en un comentario dentro del archivo** — la próxima persona que lo quiera borrar tiene que leer primero por qué existe.
4. **Cubrir los falsos positivos** conocidos (merges, rebases, CI).
5. **Dar un escape explícito** con nombre propio.
6. **Documentar `git config core.hooksPath .githooks`** en README + AGENTS.md, y verificarlo.
7. **Probarlo**: intentar hacer justo lo que debe bloquear, y confirmar que bloquea.

## Output esperado

- `.githooks/<hook>` versionado, ejecutable, con el incidente documentado adentro.
- Mensaje de bloqueo que trae el comando de salida.
- Escape explícito por variable de entorno.
- Instalación de una línea documentada en README y AGENTS.md.
- Prueba: el hook bloqueó el caso real.

## Ejemplo

**Input:** "Otra vez se fue un commit directo a main y deployó a producción. Voy a poner en CLAUDE.md que no se haga."

**Output:** "Ya está en CLAUDE.md desde el 29 de mayo — por eso pasó igual. Escribí `.githooks/pre-commit`: bloquea `main`/`master`, deja pasar los merges (`MERGE_HEAD`), y tiene escape explícito `ALLOW_MAIN_COMMIT=1` para el caso real de revertir algo en prod. El mensaje de bloqueo trae el `git switch -c` para mover el commit a una rama. Instalación una vez por clon: `git config core.hooksPath .githooks` — documentado en README y AGENTS.md porque `.git/hooks/` no se versiona y sin eso el hook no existe. Probado: intenté commitear en `main` y lo rechazó."

## Skills relacionadas

`verificar-base-del-pr-antes-de-mergear` (el otro fallo del flujo de git, que sí necesita juicio) · `deploy-seguro-vercel-preview-prod` (la política que el hook protege) · `worktree-para-no-pisar-el-checkout` (trabajar sin pisar el checkout del founder) · `verificar-funcionamiento-end-to-end` (probar el hook, no suponerlo).
