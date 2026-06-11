// =============================================================================
// TEMPLATE: Mesa Arquitectónica Multi-Agente
//
// Usar con Workflow tool de Claude Code. Editar:
//   - meta (name, description)
//   - CONTEXT (brief denso del proyecto + problema + escala + restricciones)
//   - ARCHITECTURES (3-5 opciones materialmente distintas)
//   - LENSES (3-5 perspectivas ortogonales)
//   - PROPOSAL_SCHEMA / VERDICT_SCHEMA (ajustar si el dominio requiere campos extra)
//   - synthPrompt() (estructura del markdown final, según necesidad del founder)
//
// Costo esperado: ~1M-1.2M tokens, 4-7 min wall-clock.
// Requiere opt-in explícito del founder (palabra "workflow" o frase equivalente).
// =============================================================================

export const meta = {
  name: 'mesa-arquitectonica-<slug-del-tema>',
  description: 'Panel de N arquitecturas + jueces adversariales + sintesis final para <tema>.',
  phases: [
    { title: 'Propuestas' },
    { title: 'Evaluacion' },
    { title: 'Sintesis' },
  ],
}

// -----------------------------------------------------------------------------
// CONTEXT — el brief denso. Es lo más importante. Si esto es vago, la mesa falla.
// -----------------------------------------------------------------------------
const CONTEXT = `
PROYECTO: <nombre + qué hace + para quién>

ESTADO ACTUAL DEL <subsistema>:
- <componente 1, con números reales>
- <componente 2>
- <flujo end-to-end resumido>

PREOCUPACION CONCRETA DEL FOUNDER:
1. "<cita literal 1>"
2. "<cita literal 2>"

ESCALA OBJETIVO:
- <multi-tenant N agencias / clientes / lo que aplique>
- <M unidades simultáneas en pico>
- <latencia umbral si aplica>
- <costo presupuestado si aplica>

STACK:
- <tecnologías clave>
- <hosting / infra>

RESTRICCIONES TECNICAS NO NEGOCIABLES:
- <limitación 1 del framework / stack>
- <limitación 2>

FOUNDER PIDE EVALUAR:
A) <arq A en 1 línea>
B) <arq B en 1 línea>
C) <arq C en 1 línea>
D) <arq D en 1 línea>
`

// -----------------------------------------------------------------------------
// ARCHITECTURES — mínimo 3, ideal 4. Materialmente distintas, no cosméticas.
// -----------------------------------------------------------------------------
const ARCHITECTURES = [
  {
    key: 'A-<slug>',
    name: '<Nombre legible de la arq A>',
    brief: '<2-4 frases. Qué cambia vs hoy, qué se mantiene, qué se promete, qué se sacrifica.>',
  },
  {
    key: 'B-<slug>',
    name: '<Nombre legible de la arq B>',
    brief: '<2-4 frases describiendo B.>',
  },
  {
    key: 'C-<slug>',
    name: '<Nombre legible de la arq C>',
    brief: '<2-4 frases describiendo C.>',
  },
  {
    key: 'D-<slug>',
    name: '<Nombre legible de la arq D>',
    brief: '<2-4 frases describiendo D.>',
  },
]

// -----------------------------------------------------------------------------
// LENSES — perspectivas ortogonales. Cada lens debe medir algo distinto.
// -----------------------------------------------------------------------------
const LENSES = [
  { key: 'reliability', focus: 'Que tan probable es que esta arquitectura falle bajo carga real o con casos edge? Que casos romperian el sistema? Como se recupera?' },
  { key: 'cost', focus: 'Cuanto cuesta en tokens/infra por unidad de trabajo comparado al baseline? Como escala con volumen? Vale la pena el costo extra (si lo hay)?' },
  { key: 'latency', focus: 'Cuanto agrega al tiempo del usuario final? Cual es el umbral mas alla del cual se siente lento? Considerar latencia inherente + latencia operativa.' },
  { key: 'maintenance', focus: 'Que tan facil debuggear cuando algo falla? Que tan facil agregar una feature nueva? Complejidad cognitiva. Cantidad de archivos que cambian juntos.' },
]

// -----------------------------------------------------------------------------
// SCHEMAS — JSON-schema enforcement para outputs procesables.
// -----------------------------------------------------------------------------
const PROPOSAL_SCHEMA = {
  type: 'object',
  required: ['summary', 'flow_description', 'pros', 'cons', 'risks', 'implementation_complexity', 'cost_estimate_vs_status_quo', 'latency_estimate_vs_status_quo'],
  properties: {
    summary: { type: 'string', description: 'Resumen ejecutivo 2-3 frases.' },
    flow_description: { type: 'string', description: 'Descripcion nodo-por-nodo del flujo. Concreto, con nombres reales.' },
    pros: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 6 },
    cons: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 6 },
    risks: { type: 'array', items: { type: 'string' }, minItems: 2 },
    implementation_complexity: {
      type: 'object',
      required: ['nivel', 'razon'],
      properties: {
        nivel: { type: 'string', enum: ['baja', 'media', 'alta'] },
        razon: { type: 'string' },
      },
    },
    cost_estimate_vs_status_quo: { type: 'string', description: 'Ej. "1.0x (igual)", "1.5x", "0.7x".' },
    latency_estimate_vs_status_quo: { type: 'string', description: 'Ej. "+0ms", "+300ms", "+1.5s".' },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['lens', 'severity', 'findings', 'recommendation', 'blocker'],
  properties: {
    lens: { type: 'string' },
    severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
    findings: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['issue', 'impact'],
        properties: {
          issue: { type: 'string' },
          impact: { type: 'string' },
        },
      },
    },
    recommendation: { type: 'string' },
    blocker: { type: 'boolean', description: 'true si esta lens revela un bloqueo real para produccion.' },
  },
}

// -----------------------------------------------------------------------------
// PROMPTS — los textos que cada agente recibe.
// -----------------------------------------------------------------------------
function proposalPrompt(arch) {
  return `Sos un arquitecto de sistemas experto en el dominio del proyecto.

Disenia en DETALLE la arquitectura "${arch.name}".

Brief: ${arch.brief}

Devolves JSON con el schema dado. flow_description debe ser concreto: nombres reales de componentes, en que orden, que datos pasan entre ellos. NO seas generico.

Los estimates de cost y latency son comparados al baseline (status quo) descrito en el contexto. Numeros realistas, no marketing.

CONTEXTO COMPLETO:
${CONTEXT}`
}

function judgePrompt(proposal, lens, archKey, archName) {
  return `Sos un juez adversarial. Tu trabajo es ENCONTRAR fallas en esta arquitectura desde la lente "${lens.key}".

Default a "tiene problemas" si tenes duda. No seas amable. El founder necesita un sistema que aguante la escala objetivo.

ARQUITECTURA "${archName}":
${JSON.stringify(proposal, null, 2)}

LENS: ${lens.key}
FOCO: ${lens.focus}

Devolves JSON con el schema. 'blocker=true' SOLO si la lens revela un problema que impide ir a produccion con la escala objetivo (no por preferencias esteticas).

CONTEXTO:
${CONTEXT}`
}

function synthPrompt(results) {
  return `Sos el sintetizador final del panel. Lees ${results.length} propuestas + ${results.length * LENSES.length} evaluaciones adversariales y produces un documento markdown CONCRETO para el founder.

EL FOUNDER PIDE: decidir cual arquitectura adoptar. Su preocupacion principal esta en el CONTEXTO.

ESTRUCTURA DEL OUTPUT MARKDOWN:

## Veredicto en 1 linea

[Tu recomendacion final, sin verguenza.]

## Ranking

Tabla con las ${results.length} arquitecturas ordenadas mejor->peor. Columnas: Arch, Score (1-10), Pro principal, Con principal, Cuando conviene.

## Por arquitectura

Para cada una:
### [Nombre]
- **Resumen:** 1 frase.
- **Cost/Latency/Implementation:** numeros concretos de la propuesta.
- **Findings adversariales criticos:** los issues que los jueces encontraron, priorizados por severity. Ignora los "low". Cita lens.
- **Veredicto:** "recomendado" / "viable" / "descartar".

## Riesgos a vigilar para la elegida

3-5 puntos concretos.

## Plan de migracion (si la recomendacion NO es el status quo)

Pasos ordenados, con esfuerzo estimado en jornadas-dev.

## Que NO se debe hacer

Anti-patterns que el founder podria caer en.

REGLAS:
- Markdown limpio, no AI-slop.
- Numeros concretos donde sea posible.
- No tibio. El founder pide claridad.
- Maximo 2000 palabras. No relleno.

DATOS:
${JSON.stringify(results, null, 2)}

CONTEXTO:
${CONTEXT}`
}

// -----------------------------------------------------------------------------
// EJECUCION — pipeline (no parallel barrier) para esparcir trabajo.
// -----------------------------------------------------------------------------
log(`Iniciando panel arquitectonico. ${ARCHITECTURES.length} propuestas + ${ARCHITECTURES.length * LENSES.length} evaluaciones + 1 sintesis.`)

const results = await pipeline(
  ARCHITECTURES,
  arch => agent(proposalPrompt(arch), {
    phase: 'Propuestas',
    schema: PROPOSAL_SCHEMA,
    label: `propose:${arch.key}`,
  }),
  async (proposal, arch) => {
    if (!proposal) return null
    const verdicts = await parallel(LENSES.map(lens => () =>
      agent(judgePrompt(proposal, lens, arch.key, arch.name), {
        phase: 'Evaluacion',
        schema: VERDICT_SCHEMA,
        label: `judge:${arch.key}:${lens.key}`,
      })
    ))
    return { arch: arch.key, name: arch.name, proposal, verdicts: verdicts.filter(Boolean) }
  }
)

const clean = results.filter(Boolean)
log(`Propuestas + evaluaciones listas. ${clean.length}/${ARCHITECTURES.length} arquitecturas completas.`)

phase('Sintesis')
const synthesis = await agent(synthPrompt(clean), {
  phase: 'Sintesis',
  label: 'sintesis-final',
})

return { results: clean, synthesis }
