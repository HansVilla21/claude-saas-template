# n8n Build Kit — Construcción de Chatbots (Momentum AI)

Este kit entrena a otro proyecto Claude Code (o a un constructor humano) para **armar los flujos
de n8n y los chatbots multi-agente de Momentum AI desde cero, igual o mejor que el estándar
actual.** No es un fix de un caso puntual: es un programa de entrenamiento general.

Es el **hermano** del `_transfer-prompting-kit/`:
- **prompting-kit** = cómo se escriben los prompts y se entrenan los agentes.
- **n8n-build-kit** (este) = cómo se construyen los flujos de n8n donde viven esos agentes.

Los dos juntos cubren toda la disciplina. **Transferí ambos al mismo proyecto.**

---

## La causa raíz que este kit ataca

El error #1 al construir estos bots es **armar el workflow desde cero e improvisar los nodos**
(sobre todo improvisar el "router" en vez de un Information Extractor bien configurado). La regla
madre de Momentum: **el template base se DUPLICA, nunca se construye de cero.** Por eso lo más
importante de este kit son los **workflows JSON reales para importar y clonar**.

---

## Qué hay adentro

```
_transfer-n8n-build-kit/
├── README.md                  ← este archivo
├── INSTRUCCIONES-MERGE.md     ← qué decirle al Claude del proyecto destino
├── CLAUDE-snippet.md          ← bloque para el CLAUDE.md del destino
│
├── knowledge/
│   ├── 00_CURRICULUM_CONSTRUCCION_N8N.md   ★ EMPEZAR ACÁ. El camino de aprendizaje en 11 módulos.
│   ├── 03_TEMPLATES_Y_RECURSOS.md
│   ├── 04_PATRONES_TECNICOS_N8N.md
│   ├── 07_REPOSITORIOS_GITHUB_RECOMENDADOS.md
│   ├── 09_INTEGRACION_YCLOUD.md
│   ├── workflows-reference/     ★ LOS TEMPLATES PARA CLONAR (workflow.json + análisis + prompts)
│   │   ├── template-base/   (Jaco — 1 agente + router + filtro)
│   │   ├── dr-carlos/       (clínica — 2 agentes + objeciones)
│   │   └── el-canal/        (real estate — 3 agentes + inventario + agendamiento)
│   └── workflow-variants-templates/   (TEST, TELEGRAM, YCLOUD, YCLOUD-AUDIO — JSON importables)
│
├── memory/
│   ├── metodologia-core.md            reglas no-negociables (incluye las de IE/Postgres/.item)
│   └── feedback-n8n-build.md          ★ checklist anti-estupideces (14 errores reales + fix)
│
└── .claude/skills/
    ├── momentum-architect/            decide cuántos agentes y stack
    ├── momentum-n8n-builder/          configura el workflow nodo por nodo
    ├── momentum-workflow-variants/    genera variantes TEST/Telegram/YCloud
    ├── n8n-langchain-prompts-rules/   por qué las llaves {} rompen el Information Extractor
    ├── n8n-postgres-prepared-statements/  queries robustas (JSON deconstruction)
    ├── chatbot-db-schema-supabase/    schema multi-canal + multi-nicho
    └── chatbot-manychat-supabase-multicanal/  patrón multi-canal WA+IG + errores comunes
```

★ = lo que mueve más la aguja.

---

## Cómo usarlo (proyecto destino = Claude Code, ya iniciado)

El destino ya tiene su propio `.claude/`, `memory/`, `knowledge/`. Por eso **NO copiar y pegar
encima** (sobreescribiría cosas). El flujo correcto es un **merge guiado**:

1. Copiá la carpeta `_transfer-n8n-build-kit/` completa a la raíz del proyecto destino (queda
   anidada, no molesta — un `.claude/` anidado NO se auto-carga, así que el kit queda inerte
   hasta que des la orden).
2. Abrí Claude Code en ese proyecto y decile:
   > *"Leé `_transfer-n8n-build-kit/INSTRUCCIONES-MERGE.md` y seguilo paso a paso."*
3. El Claude de allá te muestra un plan de reconciliación, vos lo aprobás, y recién ahí integra.

> **Si todavía no transferiste el prompting-kit:** hacelo también. Ambos se mergean igual.

---

## Solapamiento con el prompting-kit (para que el merge no duplique)

Estos archivos están en AMBOS kits (son base compartida) y son byte-idénticos — el merge los
integra una sola vez:
- `memory/metodologia-core.md`
- `knowledge/workflows-reference/` (los templates)
- `.claude/skills/momentum-architect/`
- `.claude/skills/n8n-langchain-prompts-rules/`

No te preocupes por la duplicación: las instrucciones de merge la resuelven.

---

## Lo que este kit NO incluye (instalar aparte en el destino)

Estas herramientas aceleran enormemente y matan el problema del router improvisado, pero son
globales (no viven en este repo):

- **n8n-mcp** (czlonkowski/n8n-mcp) — deja crear/validar/modificar workflows en n8n directo desde
  Claude Code. Con esto el agente VALIDA cada nodo antes de entregar, en vez de adivinar.
- **Skills globales de n8n** (czlonkowski/n8n-skills) — `n8n-workflow-patterns`,
  `n8n-expression-syntax`, `n8n-node-configuration`, `n8n-code-javascript`, `n8n-validation-expert`,
  `n8n-mcp-tools-expert`.

El currículum (módulo "Herramientas que aceleran") explica por qué importan.
