# Skill: Mesa Arquitectónica Multi-Agente

## Cuándo usar esta skill

- Decisión arquitectónica que afecta la espina dorsal del sistema (no microoptimizaciones).
- El founder duda entre 2+ caminos NO equivalentes y necesita estructura para elegir.
- Cambiar de arquitectura tiene costo de migración alto y no se puede volver atrás fácilmente.
- Querés diversidad de propuestas sin groupthink (cada agente propone aislado, no ve a los otros).
- Una sola opinión ya no es suficiente — necesitás triangular.

**No usar** cuando:

- Tarea de implementación concreta (overkill — usá architect → builder → reviewer normal).
- Decisión reversible o de bajo costo (más rápido decidir + probar).
- Microoptimización (cambiar un timeout, renombrar una variable).
- Ya tenés clara la respuesta — usar la mesa "para confirmar" es self-serving y caro.

## Por qué existe esta skill

Las decisiones arquitectónicas grandes tienen 3 problemas:

1. **Una sola perspectiva enmascara fallas.** Un solo agente (yo) propone su mejor idea y le encuentra justificaciones — no busca activamente fallas.
2. **El founder no puede evaluar todas las dimensiones a la vez.** Reliability, cost, latency, maintenance compiten — un mismo agente las pondera implícitamente sin transparencia.
3. **Las propuestas se contaminan entre sí.** Si un agente ve la propuesta A primero y después le pido B, B será una variación de A. Sin aislamiento no hay diversidad real.

**Solución:** Workflow tool de Claude Code orquesta:

- **N arquitectos independientes** proponen N arquitecturas en aislado (ninguno ve a los otros).
- **M jueces adversariales por arquitectura** la atacan desde lentes ortogonales (reliability, cost, latency, maintenance, etc.). Instrucción explícita: "encontrar fallas, default a problemas si dudás".
- **1 sintetizador final** lee TODO y produce ranking + recomendación + plan de migración.

El founder lee un solo documento markdown al final, con el análisis ya estructurado.

## Proceso

### 1. Preparar el contexto compartido

Antes de invocar la mesa, escribir un **brief denso** que TODOS los agentes recibirán:

- **Estado actual del sistema** (qué hay hoy, números reales, no hand-wave).
- **Problema concreto** que se quiere resolver (cita literal del founder si la tenés).
- **Escala objetivo** (multi-tenant N agencias, M conversaciones simultaneas, latencia umbral, costo presupuestado).
- **Stack actual** (no se quiere agregar infra nueva pesada, etc.).
- **Restricciones técnicas no negociables** (ej. en N8N, LangChain Agent solo acepta tools como nodos directos).
- **Alternativas que el founder pide evaluar** (lista explícita, sin agregarle ni quitarle).

Si el brief es vago, los agentes inventan. Si el brief es preciso, los agentes triangulan.

### 2. Definir N arquitecturas a evaluar

Mínimo 3, ideal 4. Si pone solo 2 → la mesa pierde valor (es solo A vs B).

Cada arquitectura tiene:

- `key`: slug único (`A-status-quo`, `B-multi-agente`, etc.).
- `name`: nombre legible.
- `brief`: 2-4 frases describiendo la arquitectura. Concreto, con qué cambia vs hoy.

Las arquitecturas DEBEN ser materialmente distintas, no variaciones cosméticas. Si dos son "A pero con X" y "A pero con Y", combinarlas en una sola entrada con el trade-off interno.

### 3. Definir las lentes (jueces)

Recomendado: 4 lentes ortogonales. Ejemplo para decisión de software backend:

- `reliability`: ¿qué tan probable es fallar bajo carga real? ¿cómo se recupera?
- `cost`: ¿cuánto cuesta en tokens/infra comparado al baseline? ¿escala?
- `latency`: ¿cuánto agrega al tiempo del usuario final?
- `maintenance`: ¿qué tan fácil debuggear, agregar features, entender el flujo en 3 meses?

Para decisiones UX: cambiar lentes a `accessibility`, `learnability`, `mobile`, `aesthetic`.
Para decisiones de negocio: `revenue-impact`, `risk`, `time-to-market`, `team-load`.

**Cada juez tiene una `key` + un `focus` explícito.** El focus es lo que diferencia un juez bueno de uno genérico.

### 4. Ejecutar el Workflow

Usar `template.js` (al lado de este SKILL.md) como base. Parametrizar:

- `CONTEXT` (brief denso).
- `ARCHITECTURES` (lista).
- `LENSES` (lista).
- `PROPOSAL_SCHEMA` y `VERDICT_SCHEMA` (ajustables según tipo de decisión).
- `synthPrompt()` (estructura del markdown final).

Estructura del pipeline:

```javascript
const results = await pipeline(
  ARCHITECTURES,
  arch => agent(proposalPrompt(arch), { phase: 'Propuestas', schema: PROPOSAL_SCHEMA }),
  async (proposal, arch) => {
    const verdicts = await parallel(LENSES.map(lens => () =>
      agent(judgePrompt(proposal, lens, arch.key), { phase: 'Evaluacion', schema: VERDICT_SCHEMA })
    ))
    return { arch: arch.key, proposal, verdicts: verdicts.filter(Boolean) }
  }
)

phase('Sintesis')
const synthesis = await agent(synthPrompt(results), { phase: 'Sintesis' })
return { results, synthesis }
```

**Pipeline (no parallel barrier):** cada arquitectura entra a evaluación apenas se propone — no espera a las demás. La síntesis SÍ es barrier final (lee todo).

### 5. Procesar la salida

El workflow devuelve `{ results: [...], synthesis: '...' }`.

- `results[i].proposal` — JSON con flow, pros, cons, risks, complexity, costo, latencia.
- `results[i].verdicts[j]` — JSON con severity, findings, blocker bool, recomendación del juez.
- `synthesis` — markdown listo para presentar al founder.

**Documentar en el proyecto:**

1. Mover `synthesis` + apéndices (results completos) a `memory/research/<NN>-<slug>.md`.
2. Crear entrada en `memory/decisions.md` con el veredicto + plan de migración + qué se descartó.
3. Actualizar `memory/backlog-mvp.md` si la decisión reordena fases.
4. NO presentar al founder el JSON crudo. SOLO el markdown procesado + tu propia lectura adicional.

## Schemas

### PROPOSAL_SCHEMA (para Phase 1)

```json
{
  "type": "object",
  "required": ["summary", "flow_description", "pros", "cons", "risks", "implementation_complexity", "cost_estimate_vs_status_quo", "latency_estimate_vs_status_quo"],
  "properties": {
    "summary": "2-3 frases ejecutivas",
    "flow_description": "nodo-por-nodo, qué entra/sale/se llama, nombres concretos",
    "pros": "array string, minItems 3 maxItems 6",
    "cons": "array string, minItems 3 maxItems 6",
    "risks": "array string, minItems 2",
    "implementation_complexity": { "nivel": "baja|media|alta", "razon": "string" },
    "cost_estimate_vs_status_quo": "ej. 1.5x, 0.7x",
    "latency_estimate_vs_status_quo": "ej. +300ms, -1s"
  }
}
```

### VERDICT_SCHEMA (para Phase 2)

```json
{
  "type": "object",
  "required": ["lens", "severity", "findings", "recommendation", "blocker"],
  "properties": {
    "lens": "string (la key)",
    "severity": "critical|high|medium|low",
    "findings": "array de { issue, impact }, minItems 1",
    "recommendation": "qué cambiar o aceptar",
    "blocker": "true si esta lens revela bloqueo real para producción"
  }
}
```

## Anti-patterns (NO hacer)

- **Contexto pobre.** "Evalúa estas 4 opciones" sin números, sin estado actual, sin restricciones → propuestas vagas, jueces inventan datos.
- **Solo 2 arquitecturas.** Es una opinión binaria con extra-pasos. Usar 3-5.
- **Mismas lentes que se solapan.** "reliability" y "stability" miran lo mismo. Buscar ORTOGONALIDAD.
- **Saltar la síntesis.** Los outputs crudos (4 propuestas + 16 verdicts) son JSON, no son accionables sin un sintetizador que los priorice.
- **Default judge-friendly.** Los jueces deben tener instrucción EXPLÍCITA de "default a fallas si dudás". Si no, escriben "todo OK" y la mesa pierde valor.
- **Confiar en una sola corrida sin verificar el cost lens.** Los jueces de cost a veces invierten cálculos (`2x` vs `0.5x`). Revisar manualmente los números antes de presentar.
- **Usar la mesa para decisiones reversibles.** Es cara (~1M tokens). Si podés probar A en producción y hacer rollback en 1h, no necesitás mesa.
- **No documentar la decisión.** El valor de la mesa NO está en correrla, está en el documento final auditable. Sin `memory/research/` + `memory/decisions.md`, en 3 meses no se sabrá por qué se eligió C.

## Gotchas técnicos

- **Workflow tool requiere opt-in explícito del founder** (palabra "workflow" en su mensaje O frase tipo "armemos una mesa", "evaluemos con varios agentes"). No invocarla sin opt-in — gasta mucho.
- **Sin `Date.now()` ni `Math.random()` en el script.** Workflow tool los bloquea para permitir resume. Si necesitás timestamp, pasalo por `args`.
- **El `agentType` por default es el workflow subagent**, no `general-purpose`. Para análisis arquitectónico el default está bien — los agentes no necesitan tools especiales.
- **Schema enforcement es estricto.** Si el agente devuelve JSON inválido, el sistema reintenta. Puede agregar latencia. Schemas demasiado rígidos (ej. enum estricto) pueden trabar la corrida — usar `enum` solo cuando es realmente cerrado (severity).
- **Pipeline > parallel para esta tarea.** Las propuestas no dependen entre sí en Phase 1, pero las evaluaciones de la propuesta X dependen de tener X listo. Pipeline esparce el trabajo; parallel pondría barrier innecesaria.
- **Costo real:** 4 arquitecturas × 4 lentes + 1 síntesis ≈ 1M-1.2M tokens, 4-7 min wall-clock, ~$0.50-$1.50 USD según modelo.

## Ejemplo concreto: mesa de Sofia v6 (2026-05-30)

**Contexto:** founder cuestionó que el bot Sofia tenga 7 tools conectadas al agente LLM ("le estamos dando demasiada responsabilidad").

**Arquitecturas:**

- A — Status quo mejorado (1 agente con 7 tools, prompts más calibrados).
- B — Multi-agente especializado (conversador + analista).
- C — Híbrido determinista (Information Extractor + nodos N8N).
- D — Pipeline con auditor LLM chico.

**Lentes:** reliability, cost, latency, maintenance.

**Output:** Veredicto = migrar a C con 5 fixes de reliability obligatorios. A queda como puente operativo. B y D descartadas (race conditions + promesas rotas).

**Costo de la mesa:** 21 agentes, 5.3 min, ~1.09M tokens. Justificable porque la decisión afecta semanas de desarrollo + costo operativo futuro proyectado a escala.

**Documentos producidos:**

- `memory/research/14-mesa-arquitectura-sofia-v6.md` (síntesis + apéndices completos, 167k chars auditables).
- Entrada en `memory/decisions.md` con plan 4 semanas.
- Reordenamiento de F5/F6/F7 en `memory/backlog-mvp.md`.

## Cómo se invoca

El founder NO escribe `/mesa-arquitectonica`. Detectar cuando dice cosas como:

- "Quiero que evaluemos esto bien"
- "Pongamos una mesa para pensar"
- "Llamemos a varios agentes para discutir"
- "Tengo dudas entre X e Y, qué pensás vos pero quiero más perspectivas"
- "Antes de comprometernos, analicemos los escenarios"

Y proponer: *"Esto califica para una mesa multi-agente — invoco Workflow con 4 arquitecturas + 16 evaluaciones + síntesis. Toma ~5 min y gasta ~$1 en tokens. ¿Avanzo?"*.

Si dice sí, armar el contexto + arquitecturas + lentes con la info de la conversación y disparar inmediatamente. No pedir más detalles si el contexto ya está claro.

## Output esperado al founder

NO pegar el JSON crudo. Presentar SIEMPRE:

1. **Veredicto en 1 línea** (la recomendación de la síntesis).
2. **Tabla de ranking** (4 arquitecturas, score, pro/con principal).
3. **Por qué la elegida ganó** (en tus propias palabras, no copy-paste).
4. **Riesgos a vigilar** (los 3-5 críticos).
5. **Plan de migración** (con jornadas-dev estimadas).
6. **Anti-patterns** (qué NO hacer).
7. **Próximos pasos concretos** (qué tocar mañana, qué tocar la semana siguiente).
8. **Link al documento auditable** (`memory/research/...`) — el founder lo puede releer cuando quiera.
