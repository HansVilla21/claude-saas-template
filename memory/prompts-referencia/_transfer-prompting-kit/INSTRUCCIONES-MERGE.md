# Instrucciones de Merge — para el Claude Code del proyecto destino

> **Hans:** copiá la carpeta `_transfer-prompting-kit/` completa a la raiz del otro proyecto
> (puede quedar anidada, no molesta). Despues abrí Claude Code en ese proyecto y decile:
>
> *"Leé `_transfer-prompting-kit/INSTRUCCIONES-MERGE.md` y seguilo paso a paso."*
>
> Lo de abajo son las instrucciones para ESE Claude, no para vos.

---

## Contexto

Sos el Claude Code de un proyecto de chatbots **ya iniciado** (tiene su propio `.claude/`,
`memory/`, `knowledge/`, `CLAUDE.md`). Llegó una carpeta `_transfer-prompting-kit/` que contiene
una metodologia de prompting validada en 18+ proyectos reales (Momentum AI). Tu trabajo es
**integrar esa metodologia en este proyecto SIN destruir lo que ya funciona y SIN crear dos
fuentes de verdad contradictorias.**

El kit tiene 4 capas: Capa 1 cerebro (`memory/`, `knowledge/01,02,05,08`), Capa 2 motor
(`.claude/skills/` + `.claude/agents/prompt-reviewer.md`), Capa 3 ejemplos de oro
(`knowledge/workflows-reference/`), Capa 4 correcciones (`memory/feedback-prompting.md`). Leé el
`_transfer-prompting-kit/README.md` primero para entender el intent.

## Regla de oro del merge

**Reconciliar, nunca sobreescribir a ciegas.** Si algo existe en ambos lados, NO asumas cuál
gana: mostrá el diff y dejá que Hans decida, con tu recomendacion. El kit es el estandar de
calidad de prompting; lo del proyecto puede tener adaptaciones especificas que hay que preservar.

## Proceso (en este orden)

### Paso 1 — Entender ambos lados (solo lectura, no escribas nada todavia)

1. Leé TODO el kit: README, los SKILL.md, `memory/metodologia-core.md`,
   `memory/feedback-prompting.md`, y al menos un caso de `knowledge/workflows-reference/`.
2. Inventariá lo que YA tiene este proyecto: `.claude/skills/`, `.claude/agents/`, `memory/`,
   `knowledge/`, y el `CLAUDE.md`.
3. Armá una tabla de comparacion: qué hay en el kit, qué hay en el proyecto, y el estado de cada
   uno (NUEVO / DUPLICADO / EN CONFLICTO).

### Paso 2 — Presentar un PLAN antes de tocar nada

Mostrale a Hans un plan de reconciliacion con esta forma, y **esperá su aprobacion**:

```
NUEVOS (se agregan tal cual, sin riesgo):
- [lista de skills/archivos del kit que no existen en el proyecto]

DUPLICADOS / EN CONFLICTO (requieren decision):
- archivo X: el proyecto tiene [...], el kit tiene [...]. Diferencia clave: [...].
  Recomendacion: [cuál gana o cómo fusionar].

CLAUDE.md:
- Cómo voy a integrar el snippet sin duplicar reglas existentes.
```

No escribas hasta que Hans apruebe el plan.

### Paso 3 — Reglas de reconciliacion por tipo

- **Skills/agentes que NO existen en el proyecto** → copiar a `.claude/skills/` o
  `.claude/agents/` de la raiz. Sin riesgo.
- **Skills/agentes con el mismo nombre** → diff. Por default gana la version del kit para las
  REGLAS de metodologia, pero preservá cualquier adaptacion especifica del proyecto. Si no es
  claro, preguntá.
- **`memory/metodologia-core.md`** → si el proyecto ya tiene uno, FUSIONAR en un solo archivo.
  Las reglas del kit son la base. Si hay contradiccion real (ej. limites de chars distintos),
  NO la silencies: marcala explicitamente y que Hans decida. **Una sola fuente de verdad.**
- **`memory/feedback-prompting.md`** → son correcciones ganadas en produccion (puntuacion
  humana, no improvisar formateador, causa raiz, etc.). Integralas en la memoria de este
  proyecto (append o merge en su archivo de feedback/learnings). NO las pierdas.
- **`knowledge/workflows-reference/`** → ejemplos reales de oro. Agregalos. Si el proyecto ya
  tiene su propia carpeta de referencia, mantené ambas (no las pises).
- **`CLAUDE.md`** → fusioná el contenido de `_transfer-prompting-kit/CLAUDE-snippet.md` en el
  CLAUDE.md de este proyecto. Si ya hay una seccion de prompting/chatbots, reconciliá en UNA
  sola seccion, no dupliques.

### Paso 4 — Seguridad antes de escribir

- Antes de sobreescribir o fusionar CUALQUIER archivo existente, guardá una copia de respaldo
  (ej. `<archivo>.backup-pre-merge` o un commit git si el proyecto usa git).
- Nunca borres contenido del proyecto sin haberlo mostrado primero.

### Paso 5 — Ejecutar y reportar

Tras la aprobacion del plan, aplicá los cambios y entregá un reporte:
- Qué se agregó (nuevos)
- Qué se fusionó y cómo (conflictos resueltos)
- Qué quedó pendiente de decision
- Qué respaldos se crearon

### Paso 6 — Limpieza

Cuando Hans confirme que el merge quedó bien, ofrecé borrar o archivar la carpeta
`_transfer-prompting-kit/` (ya cumplió su funcion como material fuente).

## Verificacion final

Pedile a Hans que pruebe: *"genera el prompt del agente principal para un negocio de [X]"*.
Debe auto-invocar `momentum-prompt-gen`, leer la metodologia fusionada, consultar los ejemplos
de oro, y entregar el prompt con conteo de caracteres y estilo de puntuacion humana.
