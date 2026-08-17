# Prompting Kit — Momentum AI (paquete portable)

Este kit contiene **todo lo necesario para que otro proyecto Claude Code genere prompts y
entrene agentes de chatbot con la misma calidad** que el proyecto Chatbot Arquitect.

La calidad NO sale de un solo skill. Sale de **4 capas que se alimentan entre si**. Los skills,
al ejecutarse, leen la metodologia destilada y los ejemplos reales. Si copias solo los skills y
no las demas capas, los skills se ejecutan pero producen mediocre. **Copia las 4 capas juntas.**

---

## Que hay adentro (las 4 capas)

```
_transfer-prompting-kit/
├── README.md                         ← este archivo
├── CLAUDE-snippet.md                 ← pegar en el CLAUDE.md del proyecto destino
│
├── .claude/
│   ├── skills/                       CAPA 2 — el motor de generacion
│   │   ├── momentum-prompt-gen/          genera prompts (frameworks CO-STAR + TIDD-EC + 9 templates)
│   │   ├── momentum-prompt-optimizer/    mejora prompts con cambios quirurgicos
│   │   ├── momentum-architect/           decide cuantos agentes y estructura
│   │   └── n8n-langchain-prompts-rules/  reglas de prompts en nodos LangChain de n8n
│   └── agents/
│       └── prompt-reviewer.md            CAPA 2 — valida prompts contra el checklist pre-deploy
│
├── memory/                           CAPA 1 — el cerebro (metodologia destilada)
│   ├── metodologia-core.md               EL archivo #1. Reglas no-negociables. Todos los skills lo leen.
│   ├── feedback-prompting.md             CAPA 4 — correcciones ganadas a base de errores reales
│   ├── learnings.md
│   ├── client-patterns.md
│   └── decisions.md
│
└── knowledge/                        CAPA 1 + CAPA 3
    ├── 01_METODOLOGIA_MOMENTUM_AI.md     fuente completa de la metodologia
    ├── 02_CASOS_CLIENTES_COMPLETOS.md    casos reales de referencia
    ├── 05_TROUBLESHOOTING_Y_OPTIMIZACION.md  sintoma -> causa -> fix
    ├── 08_LECCIONES_LEVEL_KENNETH.md     lecciones de produccion
    └── workflows-reference/              CAPA 3 — los ejemplos de oro (prompts reales)
        ├── template-base/   (Jaco, villas)
        ├── dr-carlos/       (clinica, 2 agentes)
        └── el-canal/        (real estate, 3 agentes)
```

### Para que sirve cada capa

| Capa | Que aporta a la calidad |
|---|---|
| **1 — Cerebro** | El criterio: limites de chars, anti-repeticion, BANT conversacional, modelos LLM, errores fatales. Sin esto los skills generan sin reglas. |
| **2 — Motor** | El como: skills que producen y un agente que valida. |
| **3 — Ejemplos de oro** | El ancla: prompts reales de produccion que los skills consultan para no inventar patrones. |
| **4 — Correcciones** | Lo aprendido a golpes: puntuacion humana, no improvisar el formateador, causa raiz, no prometer lo que no se puede enviar. |

---

## Como instalar en el proyecto destino (Claude Code)

> El destino es un proyecto Claude Code, asi que los skills se auto-invocan solos. Solo hay que
> dejar los archivos en las rutas correctas y cablear el CLAUDE.md.

### Paso 1 — Copiar las carpetas a la raiz del proyecto destino

Copia el **contenido** de este kit (todo menos `README.md` y `CLAUDE-snippet.md`) a la raiz del
proyecto destino, respetando la estructura. Resultado esperado en el destino:

```
proyecto-destino/
├── .claude/skills/momentum-prompt-gen/  (+ optimizer, architect, n8n-langchain-prompts-rules)
├── .claude/agents/prompt-reviewer.md
├── memory/metodologia-core.md  (+ feedback-prompting, learnings, client-patterns, decisions)
└── knowledge/01_... 02_... 05_... 08_... + workflows-reference/
```

Comando PowerShell (ajusta `$destino`):

```powershell
$kit = "<ruta-a-este-kit>\_transfer-prompting-kit"
$destino = "<ruta-al-proyecto-destino>"
Copy-Item -Recurse -Force "$kit\.claude"    $destino
Copy-Item -Recurse -Force "$kit\memory"     $destino
Copy-Item -Recurse -Force "$kit\knowledge"  $destino
```

> Si el destino YA tiene `.claude/skills/`, `memory/` o `knowledge/`, los `Copy-Item` fusionan
> (no borran lo existente). Revisa que no haya choques de nombres antes de correrlo.

### Paso 2 — Cablear el CLAUDE.md del destino

Abre `CLAUDE-snippet.md` y pega su contenido en el `CLAUDE.md` del proyecto destino. Esto es lo
que hace que los skills **lean la metodologia antes de generar** (la dependencia oculta). Sin
este paso, los skills existen pero no saben que tienen que consultar `metodologia-core.md`.

### Paso 3 — Verificar

En el proyecto destino, abri Claude Code y deci en lenguaje natural:

> "genera el prompt del agente principal para un negocio de [X]"

Deberia auto-invocar `momentum-prompt-gen`, leer `memory/metodologia-core.md`, consultar
`knowledge/workflows-reference/`, y entregar el prompt con conteo de caracteres. Si lo hace,
quedo instalado bien.

---

## Notas importantes

- **Los nombres de skills no pueden chocar.** Si el destino ya tiene un skill llamado
  `momentum-prompt-gen`, renombra o decide cual queda.
- **`metodologia-core.md` es la fuente de verdad.** Si el destino tiene reglas distintas, hay
  que reconciliarlas, no dejar dos verdades.
- **Los ejemplos de oro (`workflows-reference/`) son la diferencia de calidad mas grande.** Son
  prompts reales de produccion. No los borres por "ahorrar espacio".
- **Este kit es solo prompting + agentes.** No incluye los skills de workflow/deploy (n8n-builder,
  workflow-variants, delivery, discovery, pipeline). Si el destino tambien los necesita, avisame
  y armo un kit completo.
