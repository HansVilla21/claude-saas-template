# Addendum — BANT como módulo de calificación

> **Origen:** input del founder durante la sesión 2026-06-05 (tarde), mientras el `langchain-prompt-designer` ya estaba trabajando en la primera versión de los 6 prompts. Este addendum entra en la **segunda iteración** del refactor — no anula la primera entrega del agent.

## Qué es BANT (recordatorio)

Framework de calificación B2B estándar (IBM, años 80, **dominio público — sin IP de terceros**):

| Letra | Significado | Pregunta del bot |
|---|---|---|
| **B** | **Budget** | ¿Tiene presupuesto suficiente? ($150/mes mínimo en el caso de Momentum) |
| **A** | **Authority** | ¿Tiene poder de decisión, o es empleado que tiene que consultar? |
| **N** | **Need** | ¿Tiene una necesidad real, dolor identificado? |
| **T** | **Timeline** | ¿Cuándo necesita la solución? Urgente, este trimestre, exploratorio? |

## Por qué calza con Momentum AI CRM

- **SaaS B2B** con ticket mid-market ($499 setup + $150/mes) → calificación rápida ahorra tiempo del founder en llamadas que no van a cerrar
- **Lead típico** (dueño/manager de negocio LATAM) → BANT es comprensible, no intimida
- **El founder reporta que ya usó BANT antes y funcionó** → patrón validado

## Cómo integrarlo en la arquitectura ya diseñada

**Opción A — BANT como cuarto modo** en `sales_methodology`:
- `consultivo` — diagnóstico tipo doctor (Momentum default, Level)
- `transaccional` — directo a producto, info → cierre (Pérez Luna mueblería)
- `educativo` — valor masivo primero, sin cerrar (cursos, comunidades)
- **`bant`** — calificación rápida B/A/N/T, decisión binaria seguir o no en pocos turnos

**Opción B — BANT como módulo TRANSVERSAL** que cualquier modo puede aplicar:
- El bot extrae implícita o explícitamente B/A/N/T durante la conversación
- En el handoff a humano, el resumen estructurado incluye: budget detectado, authority detectada, need detectada, timeline detectado
- Configurable: `bot_config.qualification_framework: "bant" | "none" | otros frameworks futuros`

**Recomendación:** Opción B (módulo transversal). Razón: BANT es CÓMO extraés data, no QUÉ tono usás. Un cliente puede querer modo `consultivo` + BANT como filtro (Momentum), o `transaccional` + BANT (filtra antes de mandar catálogo), o `consultivo` sin BANT (Level — la calificación es por temperatura del lead, no BANT). Como módulo se compone, no se excluye.

## Cómo aplicarlo al bot de Momentum específicamente

El flujo conversacional actual de Momentum ya tiene 5 calificaciones (industria, volumen, stack, pain, presupuesto). De estas:
- **Budget** ✅ ya está (Calificación 5 — presupuesto >$100/mes)
- **Need** ✅ ya está (Calificación 4 — pain principal)
- **Authority** ❌ **falta** — agregar pregunta: "¿Vos sos el que toma la decisión de la herramienta o lo coordinás con alguien más del equipo?"
- **Timeline** ❌ **falta** — agregar pregunta: "¿Estás buscando arrancar este mes, este trimestre, o todavía estás explorando?"

Resultado:
- Si BANT completo positivo → llamada de 20 min con Hans/Pietro (lead caliente)
- Si **Authority faltante** (es empleado, no decide) → "Genial, ¿podemos coordinar la llamada con vos y la persona que toma la decisión juntos? Así no te toca explicarle todo a vos"
- Si **Timeline lejano** (>3 meses) → modo `educativo`: mantener relación, no insistir
- Si **Budget bajo** o **Need difusa** → puerta abierta, no presionar

## Riesgo a mitigar

BANT mal aplicado se siente como interrogatorio policial: "¿budget?" "¿authority?" "¿need?" "¿timeline?". El bot debe **extraer estos 4 sin nombrarlos**, en preguntas naturales que aporten valor en el camino. Como Level extrae Situación-Problema-Solución sin decirlo.

## Inputs para la próxima iteración del langchain-prompt-designer

Cuando se haga la 2da pasada de refactor:

1. Sumar `bant` opcional al sistema de configuración:
   - `bot_config.qualification_framework: "bant" | "none"` (default `"bant"` para SaaS B2B, `"none"` para catálogo retail)
   - Si está activo, agregar a las preguntas del flujo: Authority + Timeline si no estaban
   - El handoff a humano debe incluir el resumen BANT detectado

2. Actualizar `agente-principal.md`:
   - Sección nueva: "Extracción BANT (si está activo)"
   - Cómo extraer Authority sin ofender (no "¿sos el dueño?" sino "¿lo coordinás con alguien más?")
   - Cómo extraer Timeline sin presionar ("¿estás explorando o ya con timeline definido?")

3. Actualizar `variables-configurables.md`:
   - Sumar `qualification_framework` al schema del `bot_config`
   - Ejemplo Momentum: `"bant"`
   - Ejemplo Pérez Luna: `"none"` (catálogo retail, no necesita calificar pesado)

4. Actualizar `arquitectura-multiagente.md`:
   - Nota: BANT es transversal, no agrega nodos N8N nuevos. Se extrae dentro del Agente Principal.
   - El campo `handoff.bant_summary` se llena con lo detectado y se incluye en el mensaje al humano

## Notas de calidad para el agent

- BANT NO reemplaza el tono consultivo — lo complementa. Sigue siendo "doctor que pregunta antes de recetar", solo que las preguntas extraen B/A/N/T además de los pains
- BANT NO es checklist explícita — es **mental model** del bot al evaluar la conversación
- El handoff bullet point para Hans/Pietro debe ser tipo:
  ```
  Lead: Juan Pérez (CDMX)
  Industria: inmobiliaria boutique
  Budget: ✅ confirmado >$200/mes
  Authority: ⚠️ es socio, comparte decisión con otro socio
  Need: ✅ ManyChat se cae y pierde leads, dolor grande
  Timeline: ✅ quiere arrancar este mes
  Hora propuesta: jueves 3pm
  → CALIENTE, coordinar llamada con ambos socios si se puede
  ```
