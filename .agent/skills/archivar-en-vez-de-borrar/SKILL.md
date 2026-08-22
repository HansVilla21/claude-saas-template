---
name: archivar-en-vez-de-borrar
description: Usar cuando un proyecto acumuló más maquinaria de la que usa (skills, agentes, comandos, features, endpoints muertos) y esa acumulación genera fricción. Poda al mínimo que produce, sin perder nada y sin discutir. Se dispara con "esto está muy complicado", "hay demasiadas cosas", "simplificá el proyecto", "ya no sé ni qué tengo acá".
---

# Archivar en vez de borrar — podar sin miedo y sin discusión

## Cuándo usar esta skill

- El proyecto tiene **más piezas de las que se usan**: skills que nunca se invocaron, agentes que nadie llama, comandos muertos, features detrás de un flag que nunca se prendió.
- El founder dice *"esto está muy complicado"*, *"hay demasiadas cosas"*, *"ya no sé ni qué tengo acá"*.
- Se está simplificando un proyecto para desbloquear ejecución (ver `tarjeta-de-hoy-una-sola-cosa`).
- Alguien propone borrar algo y **la conversación se traba** discutiendo si algún día se va a necesitar.

## Por qué existe esta skill

La maquinaria sobrante no es neutra: **cobra renta**. Cada skill, agente o comando que existe es una opción más que alguien tiene que descartar mentalmente antes de trabajar, y una línea más en el índice que hay que mantener. Un proyecto con 17 skills de las que se usan 6 no está "preparado" — está cobrando el costo de 17 y entregando el valor de 6.

**Por qué no se poda igual:** borrar duele y **la discusión sobre borrar duele más**. Cada pieza tiene un caso hipotético a favor ("y si algún día necesitamos carruseles"), y ese caso es irrefutable porque habla del futuro. Así, la poda se pospone indefinidamente y el proyecto solo crece.

**El truco que desbloquea:** cambiar la pregunta. No *"¿esto sirve?"* — imposible de responder. Sino *"¿esto se usó en las últimas semanas?"* — verificable, y sin drama, porque nada se pierde. **Archivar convierte una decisión irreversible en una reversible**, y las decisiones reversibles se toman rápido.

**Caso real:** un proyecto pasó de 17 skills a 11, de 6 agentes a 4 y archivó 6 workflows completos, en una sola sesión y sin una sola discusión, porque la pregunta no era "¿borramos esto?" sino "¿esto lo usaste?".

## Proceso

### 1. Medir uso, no valor

Listá cada pieza y respondé una sola pregunta, con evidencia:

> **¿Se usó en las últimas 4 semanas?**

Buscá evidencia real, no memoria: `git log` sobre el archivo, referencias en otros archivos, outputs que la pieza haya producido.

```bash
git log --oneline --since="4 weeks ago" -- ruta/a/la/pieza | head
grep -rl "nombre-de-la-pieza" --include="*.md" . | grep -v "ruta/a/la/pieza"
```

**No** preguntes "¿esto es valioso?". Todo es valioso en abstracto. Por eso nunca se poda nada.

### 2. Clasificar en tres cubetas

- **Activo** — se usó, o es requisito directo de algo que se usó.
- **Archivable** — no se usó, y su ausencia no rompe nada.
- **Muerto** — no se usó, está roto, o quedó obsoleto. **También se archiva**, con nota de por qué.

### 3. Mover, preservando la estructura original

```bash
mkdir -p archive/
git mv .claude/skills/carousel-generator archive/claude/skills/carousel-generator
```

Usá `git mv`, no borrar-y-recrear: preserva el historial y el diff se lee como un `R` (rename) en vez de un borrado masivo.

**Espejá la ruta original** dentro de `archive/`. Restaurar tiene que ser un `git mv` a la inversa, sin pensar dónde iba.

### 4. Escribir `archive/README.md` — el paso que hace que funcione

Sin este archivo, `archive/` es un cementerio y en 3 meses nadie sabe qué hay. Debe responder cuatro cosas:

```markdown
# Archive — piezas guardadas (no borradas)

> Archivado [FECHA] durante [razón]. Nada se perdió: para reactivar
> cualquier pieza, movela de vuelta a su carpeta original.

## Por qué se archivó
[El problema concreto que causaba la acumulación.]

## Qué hay acá
- **claude/skills/** — [lista, y en una línea cuándo reactivar cada grupo]
- **claude/agents/** — [lista]

## Qué quedó activo
- **Skills (N):** [lista]
- **Agentes (N):** [lista]
```

La parte de **"cuándo reactivar"** es la que más importa: convierte el archivo en una decisión diferida con condición de salida, no en un descarte.

### 5. Actualizar los índices que apuntaban a lo archivado

Este es el paso que **siempre** se olvida y deja el proyecto peor que antes.

```bash
grep -rn "carousel-generator\|post-repurposer" --include="*.md" . | grep -v "^./archive/"
```

Revisá en particular: `CLAUDE.md`, `README.md`, y las **tablas de ruteo de los agentes** — un orquestador que enruta a un agente archivado falla en silencio o improvisa, que es peor.

### 6. Dejar el conteo escrito

En `CLAUDE.md` y en el commit: `17→11 skills, 6→4 agentes`. Es la prueba de que la poda pasó y el ancla para no volver a inflar sin darse cuenta.

## Output esperado

```
archive/
├── README.md                    ← por qué, qué hay, cuándo reactivar, qué quedó activo
└── claude/
    ├── skills/<mismas rutas que en origen>
    ├── agents/
    └── commands/
```

Más: índices actualizados, y un commit con el conteo antes→después.

## Ejemplo

**Input:** proyecto con 17 skills, 6 agentes y 6 comandos; en 4 semanas se usaron 6 skills y 3 agentes. El founder evita abrirlo porque "hay demasiado".

**Output:** 6 skills, 2 agentes y los 6 comandos movidos con `git mv` a `archive/`, espejando rutas. `archive/README.md` explica que los de formato (carruseles, LinkedIn, repurposing) se reactivan cuando esos formatos entren al plan. Tabla de ruteo del orquestador corregida. Commit: `refactor: simplificar a fase 1 — 17→11 skills, 6→4 agentes`.

## Señales de que se aplicó mal

- Se archivó algo y un índice sigue apuntándole → falta el paso 5.
- `archive/` no tiene README → en 3 meses es basura, no archivo.
- La discusión sobre qué archivar tomó más de 15 minutos → se está preguntando "¿sirve?" en vez de "¿se usó?".

## Relacionadas

- `tarjeta-de-hoy-una-sola-cosa` — la razón más común para podar: desbloquear ejecución.
- `creador-de-skills` — el otro lado del ciclo: cuándo una pieza nueva sí se justifica.
