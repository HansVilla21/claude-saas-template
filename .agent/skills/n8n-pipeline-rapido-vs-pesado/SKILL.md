# Skill: N8N Pipeline Rápido vs Pesado

## Cuándo usar esta skill

- Vas a modificar un workflow N8N y necesitás decidir el flujo de trabajo: ¿builder directo, o cadena architect → builder → reviewer?
- Estás dispatchando agentes para un cambio y querés calibrar el esfuerzo.
- El founder se quejó de que cambios pequeños están tomando demasiado tiempo (síntoma típico del antipattern).

## Por qué existe esta skill

En Casa CRM (sesión 2026-05-21) descubrimos que el pipeline pesado (architect → prompt-designer → builder → reviewer → founder) era apropiado para cambios estructurales pero **abrumador para hotfixes**. Cada cambio chico tomaba ~30 min de orquestación, y el reviewer agente no estaba atrapando bugs reales — los bugs los descubría el founder probando en producción de todos modos.

Decisión operativa: **dos pipelines paralelos**, calibrar antes de dispatchar.

> Cita del founder: "Estamos durando demasiado en cada modificación. Tenemos a gente que está haciendo revisiones pero en realidad no está funcionando. Prefiero hacer yo esas revisiones."

## Proceso

### 1. Clasificar el cambio (decisión binaria)

**Pipeline RÁPIDO** si **TODAS** se cumplen:
- ≤ 3 nodos tocados
- No agrega ni elimina nodos (solo modifica params de existentes)
- No cambia el flujo de conexiones
- El comportamiento target está claro (no requiere diseño de arquitectura)
- Hay test claro (test plan reproducible, no "ver si funciona en demo")

**Pipeline PESADO** si **CUALQUIERA** se cumple:
- > 3 nodos tocados, o agrega/elimina nodos
- Cambia conexiones del flujo
- Toca lógica de negocio nueva (handoff, nuevo agente LLM, integración nueva)
- Tiene impacto cross-system (n8n + edge function + DB + UI)
- Requiere decisión de arquitectura no obvia

### 2. Ejecutar pipeline RÁPIDO

**Tiempo target:** 10-20 min total.

Pasos:
1. **Builder directo (Claude principal o backend-builder).** Lee el workflow actual, identifica el nodo a tocar, escribe el `scripts/build-workflow-v<N+1>.js`.
2. **Build + validator determinístico.** Correr el script, después `scripts/validate-n8n-expressions.js` sobre el JSON nuevo.
3. **Entregar al founder con resumen tight.** 3 bullets máximo: qué cambió, qué NO cambió, test plan concreto.
4. **Founder revisa en n8n y activa.** Si pasa, ese era el fix. Si no, iterar dentro del mismo flujo rápido (NO escalar a pesado por una iteración).

NO dispatchar agente architect ni reviewer. NO armar specs intermedias.

### 3. Ejecutar pipeline PESADO

**Tiempo target:** 45-90 min total. Aceptable porque el cambio amerita.

Pasos:
1. **Architect (`.claude/agents/n8n-architect.md`).** Recibe el requerimiento de negocio en lenguaje natural, produce spec markdown en `memory/n8n-changes/<fecha>-<workflow>-v<N+1>.md` con nodos, conexiones, schemas, riesgos, casos edge.
2. **(Opcional) Prompt-designer (`.claude/agents/langchain-prompt-designer.md`).** Si el cambio toca el system prompt de un agente LLM, este lo diseña/refactoriza siguiendo CO-STAR + TIDD-EC.
3. **Builder (`.claude/agents/n8n-builder.md`).** Lee la spec, implementa via script reproducible (skill `n8n-workflow-build-script`).
4. **Validator determinístico.**
5. **Reviewer (`.claude/agents/n8n-reviewer.md`).** Lee spec + JSON, corre `n8n-workflow-audit` (15 checks), hace walkthroughs mentales. Tiene veto. Si falla, vuelve al builder con feedback específico.
6. **Founder activa.**

### 4. Cuándo escalar de rápido a pesado

Si después de 2 iteraciones del pipeline rápido el bug sigue:
- O el diagnóstico está mal (causa raíz distinta a la que asumimos)
- O el cambio era más estructural de lo que pensábamos

En ese momento, parar de iterar y escalar a pesado. Síntomas:
- "Apliqué el fix pero ahora falla otra cosa que no esperábamos"
- "El fix funciona pero rompe otra parte del flow"
- "No entendemos por qué falla"

## Output esperado

Para CUALQUIER cambio al workflow:
1. Build script reproducible (`scripts/build-workflow-v<N+1>.js`)
2. JSON nuevo (`n8n/workflows/<workflow>-v<N+1>.json` con `active=false`)
3. Validator pasa con 0 violations
4. Resumen al founder con ruta, cambios, test plan

Adicionalmente para pipeline PESADO:
5. Spec del architect en `memory/n8n-changes/<fecha>-<workflow>-v<N+1>.md`
6. Reporte del reviewer (PASS / FAIL con razones)

## Ejemplo concreto (Casa CRM, mismo día 2026-05-21)

### Caso A: pipeline RÁPIDO aplicado correctamente
- **Cambio:** Sofia v5.2 — reforzar prompt del Formateador para preservar marker `[IMG:CR-XXXX]`. 1 nodo tocado (Formateador), params.messages.messageValues[0].message.
- **Flujo:** builder directo → build script → validator OK → founder importó y activó. ~15 min total.
- **Resultado:** funcionó en la primera iteración.

### Caso B: pipeline RÁPIDO escalado a PESADO (futuro)
- **Cambio hipotético:** Agregar un agente nuevo de "Detector de Urgencia" entre Variables y Sofia. Toca 5+ nodos, agrega 2, cambia conexiones.
- **Flujo correcto:** architect (spec) → builder → reviewer → founder. ~60 min total.
- **Por qué no rápido:** alto riesgo de romper el flow existente sin diseño previo.

### Caso C: anti-pattern (pesado para algo rápido)
- **Cambio:** Cambiar un sticky note.
- **Anti-flujo:** architect produce spec → builder ejecuta → reviewer audita. ~30 min para un cambio cosmético.
- **Flujo correcto:** edit directo del JSON con build script trivial. <5 min.

## Gotchas / antipattern

- **NO usar pipeline pesado para hotfixes.** Cada vez que el founder dice "esto está tardando demasiado" — el síntoma confirma que aplicaste pesado donde correspondía rápido.
- **NO iterar más de 2 veces en rápido.** Si fallaste 2 veces, la causa raíz no es la que pensás. Escalar.
- **NO saltearse el validator** ni en rápido ni en pesado. Determinístico, no cuesta tiempo, atrapa referencias muertas.
- **NO confiar en el reviewer agente como única red de seguridad.** El founder es el revisor real. El agente reviewer está bien como cualidad-de-vida pero no es bloqueo.
- **SÍ usar reviewer agente** en pipeline pesado cuando el cambio afecta producción y querés segunda lectura. NO como gate obligatorio en cada cambio.

## Skills relacionadas

- `n8n-workflow-build-script` — el output concreto que ambos pipelines producen
- `n8n-code-node-debug-pattern` — patrón para que los cambios de Code node sean robustos desde el primer build
- `n8n-workflow-audit` (.claude/skills/) — herramienta del reviewer en pipeline pesado
- `n8n-expression-validator` (.claude/skills/) — validador determinístico en ambos pipelines

## Agentes relacionados

- `.claude/agents/n8n-architect.md` — primera estación pipeline pesado
- `.claude/agents/langchain-prompt-designer.md` — opcional pipeline pesado, para cambios de system prompt
- `.claude/agents/n8n-builder.md` — implementador en ambos pipelines (en rápido lo hace Claude principal directamente)
- `.claude/agents/n8n-reviewer.md` — solo pipeline pesado, autoridad de veto

## Memoria global del founder (relacionada)

- `feedback_capture_skills_for_every_process.md` — esta skill ES un ejemplo de captura proactiva
