# Instrucciones de Merge — n8n Build Kit (para el Claude Code del proyecto destino)

> **Hans:** copiá la carpeta `_transfer-n8n-build-kit/` completa a la raíz del otro proyecto.
> Después abrí Claude Code ahí y decile:
>
> *"Leé `_transfer-n8n-build-kit/INSTRUCCIONES-MERGE.md` y seguilo paso a paso."*
>
> Lo de abajo es para ESE Claude.

---

## Contexto

Sos el Claude Code de un proyecto de chatbots **ya iniciado**. Llegó una carpeta
`_transfer-n8n-build-kit/` que es un **programa de entrenamiento general** para construir flujos
de n8n y chatbots multi-agente de Momentum AI desde cero (no es un fix puntual). Tu trabajo:
**integrar este conocimiento de construcción en este proyecto SIN destruir lo que ya funciona y
SIN crear dos fuentes de verdad.**

Puede que ya se haya mergeado antes un `_transfer-prompting-kit/` (el kit hermano de prompts).
Si ves archivos compartidos ya presentes (ver lista abajo), NO los dupliques.

## Regla de oro del merge

**Reconciliar, nunca sobreescribir a ciegas.** Si algo existe en ambos lados, mostrá el diff y
que Hans decida, con tu recomendación. Este kit es el estándar de construcción validado; lo del
proyecto puede tener adaptaciones específicas que hay que preservar.

## Proceso (en este orden)

### Paso 1 — Entender ambos lados (solo lectura)
1. Leé `_transfer-n8n-build-kit/README.md` y el currículum
   `knowledge/00_CURRICULUM_CONSTRUCCION_N8N.md` completo (es el corazón del kit).
2. Hojeá los SKILL.md de `.claude/skills/`, `memory/metodologia-core.md`,
   `memory/feedback-n8n-build.md`, y abrí mentalmente un `workflows-reference/*/workflow.json`.
3. Inventariá lo que YA tiene este proyecto: `.claude/skills/`, `memory/`, `knowledge/`, CLAUDE.md.
4. Armá tabla de comparación: NUEVO / DUPLICADO / EN CONFLICTO.

### Paso 2 — Presentar un PLAN antes de tocar nada
Mostrale a Hans qué es nuevo, qué está duplicado y cómo vas a resolver cada conflicto. **Esperá su
aprobación antes de escribir.**

### Paso 3 — Reglas de reconciliación por tipo
- **Skills nuevos** (`momentum-n8n-builder`, `momentum-workflow-variants`,
  `n8n-postgres-prepared-statements`, `chatbot-db-schema-supabase`,
  `chatbot-manychat-supabase-multicanal`) → copiar a `.claude/skills/` de la raíz. Sin riesgo.
- **Skills con el mismo nombre** → diff. Gana la versión del kit para las reglas de construcción,
  pero preservá adaptaciones del proyecto. Si no es claro, preguntá.
- **`knowledge/00_CURRICULUM_CONSTRUCCION_N8N.md`** → es nuevo y central. Copialo y referencialo
  en el CLAUDE.md (ver snippet).
- **`knowledge/workflows-reference/` y `workflow-variants-templates/`** → son los TEMPLATES PARA
  CLONAR, el activo más importante. Agregalos. No los pises si el proyecto ya tiene los suyos:
  mantené ambos y aclará cuál es el canónico.
- **`memory/metodologia-core.md`** → si ya existe (vino del prompting-kit), es byte-idéntico:
  no dupliques. Si el proyecto tiene uno DISTINTO, fusioná en una sola fuente de verdad y marcá
  contradicciones explícitamente.
- **`memory/feedback-n8n-build.md`** → checklist anti-errores. Integralo en la memoria del
  proyecto. NO lo pierdas.
- **`knowledge/03,04,07,09`** → docs técnicos. Agregalos; si hay versiones del proyecto, reconciliá.

### Paso 4 — Seguridad antes de escribir
Antes de sobreescribir o fusionar CUALQUIER archivo existente, guardá respaldo
(`<archivo>.backup-pre-merge` o un commit git). Nunca borres contenido sin mostrarlo primero.

### Paso 5 — Ejecutar y reportar
Tras la aprobación: aplicá cambios y reportá qué se agregó, qué se fusionó, qué quedó pendiente,
qué respaldos creaste.

### Paso 6 — Recomendar las herramientas externas
Avisale a Hans que para máxima calidad conviene instalar en este proyecto: **n8n-mcp**
(validar workflows en vivo) y las **skills globales de n8n** de czlonkowski. Explicale que con
n8n-mcp el agente VALIDA cada nodo antes de entregar — que es justo lo que evita el router
improvisado.

### Paso 7 — Limpieza
Cuando Hans confirme que quedó bien, ofrecé borrar/archivar `_transfer-n8n-build-kit/`.

## Verificación final
Pedile a Hans un caso de prueba: *"diseñá y construí un chatbot para un negocio de [X]"*. El
agente debe: leer el currículum, decidir arquitectura, **DUPLICAR** un template de
`workflows-reference/` (no construir de cero), configurar el Information Extractor correctamente
(sin llaves, schema repetido en el prompt, switch leyendo el campo real), y validar contra
`feedback-n8n-build.md` antes de declararlo listo.
