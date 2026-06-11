# N8N Pipeline — Architect → (Designer) → Builder → Reviewer

**Versión:** 1.0
**Fecha:** 2026-05-21
**Estado:** Source of truth para cualquier cambio al workflow N8N del bot (Sofia) o de futuras automatizaciones del proyecto.

---

## Por qué este pipeline existe

Hasta el 2026-05-20 los cambios al workflow N8N se hacían ad-hoc: Claude Code modificaba el JSON, lo entregaba al founder, el founder importaba y activaba. Un bug llegó a producción ese día — Sofia disparó `request-handoff` con `reason='qualified'` cuando el lead solo había dado una zona (sin pasar por stages 2-4 del journey SPSP). Causa raíz: **regla vaga en el system prompt** ("dispará handoff cuando hay interés concreto") + **cero auditoría antes de entrega**.

Este pipeline implementa **defensa en profundidad** para que ese tipo de bug NO llegue al founder:

1. El `n8n-architect` diseña antes de ejecutar — produce spec markdown
2. El `langchain-prompt-designer` (cuando aplica) calibra el prompt con Pre-Mortem
3. El `n8n-builder` implementa solo lo que dice la spec, vía script idempotente
4. El `n8n-reviewer` audita con checklist + walkthroughs mentales. **Tiene veto.**
5. Solo cuando el reviewer dice PASS, el cambio llega al founder

---

## Las 4 estaciones

### 1. `n8n-architect` (diseño)

- **Input:** requerimiento de negocio del founder en lenguaje natural
- **Output:** `memory/n8n-changes/<YYYY-MM-DD>-<slug>.md`
- **Contenido obligatorio:** problema, estado actual, cambio propuesto (nodos a crear/modificar/borrar, conexiones), schemas, env vars, **riesgos previstos (≥3)**, **casos edge (≥4)**, triggers operacionales (no vagos)
- **NO hace:** escribir JSON, escribir scripts, diseñar prompts
- Detalle: `.claude/agents/n8n-architect.md`

### 2. `langchain-prompt-designer` (opcional, solo si el cambio toca prompt LLM)

- **Input:** spec del architect + framework `memory/sales-framework.md`
- **Output:** `memory/research/<NN>-<slug>-prompt.md` con system prompt completo + Pre-Mortem
- **Frameworks aplicados:** CO-STAR + TIDD-EC + Self-Refine (cuando crítico)
- **Pre-Mortem obligatorio:** simulación mental de 5 escenarios antes de entregar
- Detalle: `.claude/agents/langchain-prompt-designer.md` + skill `langchain-agent-prompt-design`

### 3. `n8n-builder` (implementación)

- **Input:** spec del architect + (si aplica) prompt del designer
- **Output:** `n8n/workflows/<workflow>-vN+1.json` + `scripts/build-<workflow>-vN+1.js`
- **Regla central:** modifica el JSON solo vía script idempotente. Nunca a mano.
- **Validación:** `JSON.parse()` al final + `active: false` forzado
- **NO hace:** cuestionar la spec, diseñar prompts, aprobar su propio trabajo
- Detalle: `.claude/agents/n8n-builder.md`

### 4. `n8n-reviewer` (auditoría, autoridad de veto)

- **Input:** spec + build report + JSON producido
- **Tools:** skill `n8n-workflow-audit` (15 checks) + skill `n8n-expression-validator` (script determinístico)
- **Output:** `memory/n8n-changes/<YYYY-MM-DD>-<slug>-review.md` con PASS / FAIL / PASS WITH WARNINGS
- **Walkthroughs mentales obligatorios:** happy path, lead curioso, lead frustrado, tool failure, edge específico del cambio
- **Si FAIL:** loop al builder con fixes específicos
- **Si PASS:** entrega al founder con resumen de qué tiene que activar manualmente
- Detalle: `.claude/agents/n8n-reviewer.md`

---

## Flujo end-to-end paso a paso

```
1. Founder dice: "el bot disparó handoff cuando no debía, arreglalo"
        ↓
2. Orquestador detecta intención → invoca n8n-architect
        ↓
3. n8n-architect lee:
   - CLAUDE.md + AGENTS.md (convenciones)
   - memory/sales-framework.md (stages SPSP)
   - memory/research/05-sofia-v2-system-prompt.md (prompt vigente)
   - memory/decisions.md (decisiones previas)
   - n8n/workflows/<latest>.json (estado de partida)
        ↓
4. n8n-architect entrega:
   memory/n8n-changes/2026-05-21-fix-handoff-trigger.md
   (Sección 7 lista 4+ edge cases. Sección 8 reescribe el trigger vago
    "interés concreto" como condición AND verificable)
        ↓
5. Como el cambio toca el system prompt → orquestador invoca langchain-prompt-designer
        ↓
6. langchain-prompt-designer entrega:
   memory/research/06-sofia-v3-prompt-handoff-fix.md
   (Triggers operacionalizados + Pre-Mortem con escenarios del 2026-05-20)
        ↓
7. Orquestador invoca n8n-builder
        ↓
8. n8n-builder genera:
   - scripts/build-workflow-v3.1.js (idempotente, importa el prompt del paso 6)
   - n8n/workflows/chatbot-inmobiliaria-demo-ycloud-sofia-v3.1-unified.json
   (Valida JSON, active=false)
        ↓
9. Orquestador invoca n8n-reviewer
        ↓
10. n8n-reviewer corre:
    - skill n8n-workflow-audit (15 checks PASS/FAIL/WARN)
    - skill n8n-expression-validator (node scripts/validate-n8n-expressions.js ...)
    - walkthroughs mentales de 5 escenarios
        ↓
11. n8n-reviewer entrega:
    memory/n8n-changes/2026-05-21-fix-handoff-trigger-review.md
    Resultado: PASS / FAIL
        ↓
12a. Si FAIL → vuelve al builder con fixes → loop builder/reviewer hasta PASS
12b. Si PASS → orquestador entrega al founder con:
     - Lista de archivos generados
     - Instrucciones de activación en N8N (import + toggle activar manual)
     - Diff resumido vs versión anterior
```

---

## Convenciones de archivo / naming

### Specs y reviews
- `memory/n8n-changes/<YYYY-MM-DD>-<slug>.md` — spec del architect
- `memory/n8n-changes/<YYYY-MM-DD>-<slug>-review.md` — review del reviewer

### Workflows
- `n8n/workflows/<base-name>-v<N>.json` — versión actual en prod
- `n8n/workflows/<base-name>-v<N+1>.json` — versión nueva propuesta
- Nunca se sobrescribe `vN` con `vN+1`. El founder activa explícitamente.

### Scripts de build
- `scripts/build-<base-name>-v<N+1>.js` — un script por versión, idempotente
- Si una operación es "renombrar nodo X → Y", el script debe tolerar correr 2 veces sin romper

### Prompts LLM
- `memory/research/<NN>-<slug>-prompt.md` — el `n8n-builder` los importa vía `fs.readFileSync()` y los inyecta en el JSON. Por eso el prompt va dentro de un bloque ` ``` ` identificable.

---

## Quién hace qué — tabla resumida

| Acción | Architect | Designer | Builder | Reviewer | Founder |
|---|---|---|---|---|---|
| Lee requerimiento de negocio | ✅ | | | | |
| Diseña arquitectura del cambio | ✅ | | | | |
| Lista riesgos / edge cases | ✅ (obligatorio) | | | ✅ (valida) | |
| Diseña / refactora system prompt | | ✅ | | | |
| Pre-Mortem del prompt | | ✅ (obligatorio) | | | |
| Escribe script JS de transformación | | | ✅ | | |
| Modifica JSON del workflow | | | ✅ (vía script) | | |
| Valida sintaxis JSON | | | ✅ | ✅ (re-valida) | |
| Corre `validate-n8n-expressions.js` | | | (opcional) | ✅ (obligatorio) | |
| Walkthroughs mentales de 5 escenarios | | | | ✅ | |
| Aprueba o rechaza el cambio | | | | ✅ (veto) | |
| Importa workflow en N8N | | | | | ✅ |
| Activa el workflow en producción | | | | | ✅ |
| Verifica en prod (mensaje real de prueba) | | | | | ✅ |
| Reporta bug en prod si vuelve a fallar | | | | | ✅ → re-entra el pipeline |

---

## Cuándo NO se invoca todo el pipeline

Algunos cambios son demasiado triviales para el pipeline completo. Para esos casos, sigue habiendo orquestación pero salteás estaciones:

| Cambio | Estaciones que SÍ se invocan |
|---|---|
| Cambio de copy literal en un sticky note | (ninguna del pipeline — Claude Code directo, sin riesgo) |
| Cambio de typo en un mensaje hardcoded del prompt | Designer + Reviewer (skip Architect + Builder) |
| Cambio en la lógica del prompt o triggers | **Pipeline completo** |
| Nodo nuevo (tool, integración, edge function call) | **Pipeline completo** |
| Cambio de conexiones / topología del flow | **Pipeline completo** |
| Cambio de credentials o env vars (sin tocar lógica) | Architect (documenta) + Reviewer (audita) |
| Migración de versión de N8N o `typeVersion` de un nodo | **Pipeline completo** |

**Regla de seguridad:** ante la duda → pipeline completo. El costo de overkill es 30 minutos. El costo de un bug en prod es la confianza del founder en el bot.

---

## Skills asociadas

Las 3 skills `.claude/skills/` que el pipeline usa:

| Skill | Quién la usa | Cuándo |
|---|---|---|
| `n8n-workflow-audit` | `n8n-reviewer` | Cada review (los 15 checks) |
| `n8n-expression-validator` | `n8n-reviewer` (Check 1) | Check rápido de integridad referencial |
| `langchain-agent-prompt-design` | `langchain-prompt-designer` | Guía operativa al diseñar prompts |

Más el script: `scripts/validate-n8n-expressions.js` (100% determinístico, sin LLM).

---

## Cross-projecto / reusabilidad

Este pipeline es **agnóstico al dominio inmobiliario**. Los 4 agentes y las 3 skills sirven para cualquier proyecto N8N con agentes LangChain + tools, no solo Casa CRM.

Lo único específico de Casa CRM en este momento:
- `memory/sales-framework.md` (framework SPSP+Hormozi del bot Sofia)
- Las menciones a "Sofia / Hans / handoff" en los ejemplos de los `.md` de agentes
- El nombre del workflow `chatbot-inmobiliaria-demo-ycloud-sofia-*.json`

Si en otro proyecto se reutiliza el pipeline, esos elementos se reemplazan; la mecánica de 4 estaciones + 3 skills queda igual.

---

## Histórico de bugs que motivaron el diseño

| Fecha | Bug | Causa raíz | Capa del pipeline que lo habría atrapado |
|---|---|---|---|
| 2026-05-20 | Handoff `reason='qualified'` con lead que solo dio zona | Trigger vago en system prompt ("interés concreto") + cero auditoría | Architect (Sección 8 — triggers operacionalizados) + Reviewer (Check 7 + walkthrough escenario 2) |

Cada vez que un bug llegue a producción, agregar fila acá + actualizar la skill o agente que falló en atraparlo.
