---
name: n8n-workflow-audit
description: Checklist operativo de 15 puntos para auditar un workflow N8N antes de entregarlo al founder. Lo usa el agente `n8n-reviewer` en cada review. Cubre integridad referencial, conexiones, schemas, triggers de handoff, walkthroughs mentales de escenarios, variables de entorno y sticky notes. Cada punto produce PASS / FAIL / WARN con evidencia. Usar cuando se está revisando un workflow N8N, especialmente uno con agente LangChain + tools + memoria conversacional.
---

# N8N Workflow Audit — Checklist de 15 puntos

## Cuándo usar esta skill

- El `n8n-reviewer` la corre obligatoriamente en cada review pre-entrega
- Cualquiera (humano o agente) que quiera auditar un workflow N8N de forma sistemática
- Antes de activar un workflow en producción, especialmente si involucra LLMs + tools

## Cómo usar

Procesás los 15 checks **en orden**. Para cada uno:
1. Cargás la evidencia (lectura del JSON, búsqueda de expresiones, walkthrough mental)
2. Marcás resultado: **PASS** (limpio) / **FAIL** (bug) / **WARN** (riesgo pero no bloqueante)
3. Anotás evidencia concreta (nombre de nodo, expresión, escenario, etc.)

Output final: tabla de 15 filas + walkthroughs detallados + lista de issues. Ver formato exacto en `.claude/agents/n8n-reviewer.md`.

---

## Los 15 checks

### Check 1 — Integridad referencial de expresiones `$('NodeName')`

**Qué verificar:** Toda expresión `$('Nombre del nodo')` en el JSON debe resolver a un nodo que efectivamente existe en `workflow.nodes[*].name`.

**Cómo:** Correr `node scripts/validate-n8n-expressions.js <workflow.json>` (skill `n8n-expression-validator`). Output determinístico — lista de violaciones.

**PASS:** script reporta 0 violaciones
**FAIL:** ≥1 expresión referencia un nodo inexistente (típico después de renombrar / borrar)
**Evidencia:** lista de `(nodo donde está la expresión, expresión problemática, nombre referenciado no encontrado)`

---

### Check 2 — Conexiones huérfanas

**Qué verificar:** Todo nodo (salvo nodos trigger tipo `webhook`, `manualTrigger`, `cron`) debe tener al menos una conexión `main` entrante.

**Cómo:** Recorrés `workflow.nodes[*]`. Para cada uno que NO sea trigger, buscás si aparece como destino en `workflow.connections[*].main[*][*].node`.

**PASS:** todos los nodos no-trigger tienen entrada
**FAIL:** hay nodos huérfanos (no se ejecutan nunca pero ocupan espacio y confunden al reviewer)
**WARN:** hay nodos sticky note o auxiliares desconectados (esperado pero documentar)

---

### Check 3 — Tools sin agente

**Qué verificar:** Toda tool (`@n8n/n8n-nodes-langchain.tool*`) debe tener una conexión `ai_tool` saliente hacia un nodo `@n8n/n8n-nodes-langchain.agent`.

**Cómo:** Filtrás nodos con `type` que empieza con `@n8n/n8n-nodes-langchain.tool`. Para cada uno, verificás que existe en `connections[<tool>].ai_tool[0][0].node` apuntando a un agente.

**PASS:** todas las tools conectadas a un agente válido
**FAIL:** tool huérfana (no la invoca nadie → muerto en el código) o apuntando a nodo que no es agente

---

### Check 4 — Agente con modelo + memoria + tools

**Qué verificar:** Cada nodo agente (`@n8n/n8n-nodes-langchain.agent`) debe tener:
- `ai_languageModel` entrante desde un chat model (OpenAI / Anthropic / etc.)
- `ai_memory` entrante (típicamente `Postgres Chat Memory`) si la conversación es multi-turno
- ≥1 `ai_tool` entrante por cada tool que el system prompt menciona

**Cómo:** Para cada agente, inspeccionar `connections[<modelo>].ai_languageModel`, `connections[<memoria>].ai_memory`, contar `ai_tool` entrantes.

**PASS:** todas las conexiones presentes
**FAIL:** agente sin modelo (rompe en runtime) / sin memoria en conversación multi-turno (pierde contexto y repregunta) / sin tool que el prompt menciona (el agente intentará invocar algo que no existe)

---

### Check 5 — Schema del input al agente matchea con el prompt

**Qué verificar:** El `text` (o `input`) que recibe el nodo agente debe contener los datos que el system prompt referencia.

**Cómo:** Leés el parameter `text` / `input` del nodo agente. Identificás variables interpoladas (ej: `{{ $json.userMessage }}`, `{{ $('Get Conversation State').first().json.id }}`). Cruzás con el system prompt: si el prompt dice "extraé el dolor del lead" pero el input no contiene el historial, FAIL.

**PASS:** el input contiene todo lo que el prompt requiere
**WARN:** algunas variables vienen de memoria conversacional implícita (aceptable)
**FAIL:** prompt menciona campo X y el input no lo trae

---

### Check 6 — Expressions parseables

**Qué verificar:** Toda expresión `{{ ... }}` en el JSON tiene brackets/comillas/escapes balanceados.

**Cómo:** Recorrés todos los strings del JSON buscando `{{` y `}}`. Verificás conteo balanceado. Sospechosos: comillas dobles sin escapar dentro de strings, `?.` sin closing.

**PASS:** todas las expresiones bien formadas
**FAIL:** expresión rota (N8N las muestra como literal en runtime → bug silencioso)

---

### Check 7 — Triggers de handoff explícitos (NO reglas vagas)

**Qué verificar:** Las condiciones que disparan `request-handoff` (u operación equivalente) están operacionalizadas, no escritas como "interés concreto" / "muestra intención" / "lead caliente".

**Cómo:** Leés el system prompt del agente que invoca handoff. Buscás la sección de triggers. Cada condición debe ser ejecutable mentalmente: ¿puedo decir si la condición se cumple solo leyendo el último turno + memoria? Si necesito inferencia subjetiva, FAIL.

**Heurística:** la regla del 2026-05-20. El bug fue: "dispará handoff cuando hay interés concreto". El lead dio una zona y el bot lo interpretó como interés concreto → falso positivo. Reescrito: "dispará handoff cuando (A) lead pide visita explícita Y mencionó código de propiedad EN ESTE TURNO O EL ANTERIOR, O (B) lead pide hablar con humano, O (C) lead pasó por stages 2-4 Y mostró aceptación en stage 5".

**PASS:** triggers son condiciones AND verificables turn-by-turn
**FAIL:** ≥1 trigger usa palabra subjetiva o condición OR vaga

---

### Check 8 — Fallbacks de tools

**Qué verificar:** Si una tool puede fallar (401, timeout, JSON inválido), el workflow tiene un comportamiento documentado.

**Cómo:** Para cada tool, leés la spec / prompt: ¿qué se supone que pasa si la tool devuelve error? Verificás que el system prompt cubre el caso ("si la búsqueda no devuelve resultados, decí X") o que hay un nodo `IF`/`Switch` que rutea el error.

**PASS:** fallback explícito por cada tool
**WARN:** fallback presente pero ambiguo
**FAIL:** tool sin fallback → el agente improvisa cuando falle

---

### Check 9 — Walkthrough Escenario 1: Happy path

**Qué verificar:** Un lead caliente (mensaje inicial con intención clara) pasa por todos los stages y termina en handoff legítimo.

**Cómo:** Simulás mentalmente:
- Mensaje inicial → Webhook → Extract → ... → Agente Sofia
- Stage 0 → 1 → 2 → 3 → 4 → 5 → 6 → handoff
- En cada nodo: ¿qué expresiones leen qué datos? ¿qué devuelve el agente?

**PASS:** trayectoria limpia, handoff con `reason` correcto
**FAIL:** se rompe en algún nodo o handoff dispara antes de tiempo

---

### Check 10 — Walkthrough Escenario 2: Lead curioso / info-only

**Qué verificar:** Lead que en el turno 1 pregunta "qué casas tienen" sin dar nombre ni contexto.

**Cómo:** Simulás. El agente NO debe mostrar inventario aún. Debe devolver al stage 0/1 con su pregunta.

**PASS:** el agente devuelve al stage actual sin abrir tool de búsqueda
**FAIL:** el agente invoca `properties-search` por keyword sin haber pasado por stages 1-4

---

### Check 11 — Walkthrough Escenario 3: Lead frustrado / pide humano

**Qué verificar:** Lead dice "ya me cansé de tantas preguntas" o "quiero hablar con un humano YA".

**Cómo:** Simulás. El agente debe escalar a handoff con `reason='manual'` o equivalente. NO debe insistir con preguntas del stage actual.

**PASS:** handoff dispara con razón clara
**FAIL:** el agente sigue interrogando

---

### Check 12 — Walkthrough Escenario 4: Tool falla

**Qué verificar:** Una tool devuelve `{error: "401"}` o timeout.

**Cómo:** Simulás. ¿El agente recibe el error y responde con fallback verbal? ¿O improvisa info de propiedades?

**PASS:** fallback verbal correcto ("no logro ver el inventario ahora, te conecto con Hans")
**FAIL:** el agente improvisa precios / direcciones / disponibilidad

---

### Check 13 — Variables de entorno documentadas y existentes

**Qué verificar:** Todas las credentials / env vars / API keys que el workflow usa están documentadas y configuradas en N8N.

**Cómo:** Lista todas las referencias a credentials (`credentials.<name>.id`) y env vars (`$env.VAR_NAME`). Verificás contra `memory/integraciones.md` o `.env.example`.

**PASS:** todas documentadas
**WARN:** credential referenciada pero no documentada (vive en N8N — puede romper en otro entorno)
**FAIL:** credential / env var fantasma

---

### Check 14 — Sticky notes actualizados

**Qué verificar:** Los sticky notes del workflow describen el flujo actual, no uno viejo. Si la spec borró el "Clasificador", el sticky note que lo describía también debe estar borrado o actualizado.

**Cómo:** Filtrás nodos `type = "n8n-nodes-base.stickyNote"`. Leés su `content`. Cruzás con los nodos vigentes del workflow.

**PASS:** sticky notes consistentes con el flujo actual
**WARN:** sticky notes huérfanos o desactualizados (no rompe en runtime, pero confunde al reviewer en la siguiente iteración)

---

### Check 15 — `active: false` en el JSON exportado

**Qué verificar:** El field `workflow.active` debe ser `false`. El founder activa explícitamente al importar.

**Cómo:** `JSON.parse(...).active === false`.

**PASS:** `active: false`
**FAIL:** `active: true` (el workflow se activa automáticamente al importar — riesgo de doble-trigger en prod)

---

## Heurísticas rápidas (chequeo express previo)

Antes de correr los 15 checks formales, hacé pasada visual:

| Síntoma | Probable bug |
|---|---|
| `$fromAI('reason', ...)` sin enum cerrado | LLM va a inventar reasons |
| Trigger dice "interés concreto" / "muestra intención" | Vago → falsos positivos |
| Tool con `responseFormat: 'autoDetect'` | Output no determinístico |
| Agente sin `Postgres Chat Memory` en conversación multi-turno | Pierde contexto |
| `ai_tool` apuntando a nodo NO langchain.tool* | No se puede invocar |
| 2+ nodos con el mismo `name` | N8N usa el primero, el resto zombi |
| Webhook con `path` duplicado en otro workflow del mismo n8n | Conflicto de routing |
| `typeVersion` muy viejo vs los nodos del repo | Posibles breaking changes |

## Cuándo dar PASS WITH WARNINGS vs FAIL

- **FAIL** si: cualquier check del 1 al 12 es FAIL (integridad, conexiones, walkthroughs core)
- **PASS WITH WARNINGS** si: solo hay WARNs en checks 13-14, no hay FAILs en walkthroughs
- **PASS** si: todos los checks pasan limpios
