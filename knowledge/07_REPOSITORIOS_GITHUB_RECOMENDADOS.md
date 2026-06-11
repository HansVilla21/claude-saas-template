# REPOSITORIOS DE GITHUB PARA EL PROYECTO
## Skills de Claude Code, templates de n8n, y recursos para Momentum AI

**Nota:** Los repos marcados con ⭐ son los más relevantes para el proyecto de Hans. Los marcados con 🔥 son must-have.

---

# 1. CLAUDE CODE SKILLS — ÍNDICES GENERALES (EMPEZAR AQUÍ)

Estos son los "meta-repos" que catalogan skills de toda la comunidad. Conviene tenerlos marcados como referencia para buscar skills nuevas según necesites.

## 🔥 anthropics/skills (37.5k ⭐) — OFICIAL
**URL:** `github.com/anthropics/skills`

Repo oficial de Anthropic con skills para document processing (DOCX, PDF, PPTX, XLSX), brand guidelines, internal communications. Es el estándar de referencia para cómo estructurar skills.

**Para qué te sirve:**
- Base para crear tus propias skills con la estructura correcta
- Skills de document processing para entregar documentos a clientes
- Aprender el formato `SKILL.md` oficial

## 🔥 sickn33/antigravity-awesome-skills (33k+ ⭐)
**URL:** `github.com/sickn33/antigravity-awesome-skills`

1,410+ skills instalables vía CLI. Tiene installer npm: `npx antigravity-awesome-skills`. Incluye skills oficiales de Anthropic, Google Labs, Vercel, Stripe, Cloudflare, Supabase, Microsoft.

**Para qué te sirve:**
- Instalador rápido de skills
- Acceso a skills oficiales de empresas grandes (Supabase es relevante para Hans)
- Bundles por categoría

## ⭐ VoltAgent/awesome-agent-skills
**URL:** `github.com/VoltAgent/awesome-agent-skills`

1000+ skills de teams oficiales (Anthropic, Google Labs, Vercel, Stripe, Supabase, Figma) + comunidad. Compatible con Claude Code, Codex, Gemini CLI, Cursor.

## alirezarezvani/claude-skills (5.2k ⭐)
**URL:** `github.com/alirezarezvani/claude-skills`

232+ skills organizadas por dominio: engineering, marketing, product, compliance, C-level, sales (2 skills específicas de ventas).

## hesreallyhim/awesome-claude-code
**URL:** `github.com/hesreallyhim/awesome-claude-code`

Curated list de tools, IDE integrations, frameworks, plugins para Claude Code. Referencia general.

## travisvn/awesome-claude-skills
**URL:** `github.com/travisvn/awesome-claude-skills`

Lista curada con explicación de cómo funcionan las skills (progressive disclosure, ~100 tokens para metadata, <5k tokens al activar). Buena documentación para entender la arquitectura.

---

# 2. SKILLS ESPECÍFICAS PARA TU CASO (PROMPT ENGINEERING Y VENTAS)

## 🔥 louisblythe/Sales-Skills ⭐⭐⭐⭐⭐ (el más relevante)
**URL:** `github.com/louisblythe/Sales-Skills`
**Instalación:** `npx add-skill louisblythe/salesskills`

Colección de skills de ventas B2B. Relevante para vos:
- **80 skills de AI SDR & Bots**: intent detection, sentiment analysis, conversation memory, compliance handling, **handoff detection**, multi-channel coordination, entity extraction, **timezone awareness**, conversation summarization, **propensity scoring**, A/B testing, **emotional arc management**, human-in-the-loop training
- Discovery, prospecting, deal execution, pipeline management
- Identify decision makers vs. influencers
- Pricing negotiation
- Competitor/alternatives handling

**Por qué es oro para Hans:** Estas skills están diseñadas para EXACTAMENTE lo que hacés vos — construir bots de ventas con calificación, handoff, memoria, sentiment. Podés estudiar cómo estructuran cada skill y adaptar a tu metodología de Momentum AI.

## 🔥 ckelsoe/prompt-architect (el segundo más relevante)
**URL:** `github.com/ckelsoe/claude-skill-prompt-architect`

Skill que transforma prompts vagos en prompts estructurados usando 7 frameworks probados:
- **CO-STAR** (Context, Objective, Style, Tone, Audience, Response)
- **RISEN** (Role, Input, Steps, Expectation, Narrowing)
- **RISE-IX** (con constraints explícitos)
- **TIDD-EC** (para contenido con dos/don'ts)
- **RTF** (Role, Task, Format)
- **CoT** (Chain of Thought)
- **CoD** (Chain of Density para iteración)

**Por qué te sirve:** Tu trabajo principal es prompting. Esta skill te da los frameworks académicos que podés combinar con tu metodología Momentum AI (que ya usa BANT, SPIN, LAARC). Usala para generar prompts de agentes nuevos.

## obra/superpowers (core skills de Claude Code)
**URL:** `github.com/obra/superpowers`
**Instalación:** `/plugin marketplace add obra/superpowers-marketplace`

20+ skills battle-tested: `/brainstorm`, `/write-plan`, `/execute-plan`, skills-search tool. **Sistematic-debugging** es particularmente útil.

## prompt-engineering (skill genérica)
Encontrada en múltiples repos. Enseña técnicas probadas y principios de Anthropic.

## claude-design-engineer (1.1k ⭐)
Para crear UI consistentes en Claude Code. Relevante si vas a crear dashboards o interfaces para tus clientes.

---

# 3. SKILLS DE DESARROLLO ÚTILES PARA EL WORKFLOW

## test-driven-development
Referencia en múltiples repos. Útil para testear prompts antes de deploy (tu punto débil actual).

## systematic-debugging
Parte de obra/superpowers. Te ayuda con el debugging de prompts cuando fallan.

## finishing-a-development-branch
Para cerrar proyectos correctamente con checklist.

## using-git-worktrees
Útil si tenés múltiples clientes en paralelo y querés trabajar aislado.

## Skill_Seekers
**URL:** `github.com/yusufkaraaslan/skill-seekers`

Convierte automáticamente cualquier website de documentación en una skill. **Útil para vos:** convertir la doc de n8n, Evolution API, YCloud, ManyChat en skills propias.

## happy-claude-skills (234 ⭐)
**URL:** `github.com/happy-claude-skills`

Plugins prácticos para Claude Code, varios de desarrollo.

## claude-office-skills (232 ⭐)
Office document creation y editing (PPTX, DOCX, XLSX, PDF) con automatización. Útil para documentos de entrega a clientes.

## blader (220 ⭐)
Skill que aprende continuamente mientras trabajás. Extrae nuevas skills automáticamente.

---

# 4. N8N WORKFLOWS — REPOS PARA ENTRENAR/REFERENCIAR

## 🔥 enescingoz/awesome-n8n-templates ⭐⭐⭐⭐⭐ (el más relevante)
**URL:** `github.com/enescingoz/awesome-n8n-templates`

280+ templates, el más curado. Carpeta especial WhatsApp con:
- **Building Your First WhatsApp Chatbot** (template 2465 de n8n oficial) — Sales Agent con vector store de catálogo de productos
- **Complete business WhatsApp AI-Powered RAG Chatbot using OpenAI** — RAG chatbot completo para negocios
- **AI-powered Instagram DM management con Manychat + OpenAI** (relevante para Dr. Carlos Hernández)
- **Respond to WhatsApp Messages with AI Like a Pro**
- **Sales meeting preparation con AI y Apify**

**Por qué es oro:** Los JSONs están en el repo. Podés clonarlos directamente y Claude Code puede analizarlos para aprender tu patrón. Específicamente el de Instagram + ManyChat es el stack exacto de Dr. Carlos.

## 🔥 ritik-prog/n8n-automation-templates-5000
**URL:** `github.com/ritik-prog/n8n-automation-templates-5000`

5000+ templates production-grade. Organizados por plataforma (AWS, Stripe, LinkedIn, etc.). Muchos con LangChain, OpenAI, Claude, Vector DB.

## ⭐ oxbshw/ultimate-n8n-ai-workflows
**URL:** `github.com/oxbshw/ultimate-n8n-ai-workflows`

3400+ workflows AI. Estructura por carpetas (workflows, modules, data, utils, docs). Tiene CLI y helper scripts para validación y conversión.

## ⭐ lucaswalter/n8n-ai-automations
**URL:** `github.com/lucaswalter/n8n-ai-automations`

Del canal YouTube "The Recap AI". Templates destacados:
- `whatsapp_ai_chatbot_agent.json` — **chatbot AI para hotelería** (cercano a Jacó Dream Rentals)
- `ai_gmail_agent.json` — automatización de Gmail
- `auto_repair_shop_gmail_agent.json` — bot para taller mecánico con cotizaciones (patrón similar a SmartCheck)
- `marketing_team_agent.json` — agente de voz para marketing

## paoloronco/n8n-templates
**URL:** `github.com/paoloronco/n8n-templates`

Templates con guías detalladas. Foco en automatización de email, documentos, certificaciones.

## AmplifyAutomation/n8n-templates
**URL:** `github.com/AmplifyAutomation/n8n-templates`

Repo de una agencia, estilo similar a lo que hacés vos.

## infranodus/n8n-infranodus-workflow-templates
**URL:** `github.com/infranodus/n8n-infranodus-workflow-templates`

Especializado en RAG con knowledge graphs. Interesante si querés agregar reasoning sofisticado a agentes.

---

# 5. INTEGRACIONES Y SDKS RELEVANTES

## 🔥 EvolutionAPI/evolution-api
**URL:** `github.com/EvolutionAPI/evolution-api`

Repo oficial de Evolution API (lo que ya usás). Tiene integraciones con Dify AI, OpenAI (audio-to-text), S3/Minio para media. **Estudiar para ver qué features nuevas podés aprovechar.**

## wassengerhq/n8n-wassenger
**URL:** `github.com/wassengerhq/n8n-wassenger`

Plugin de n8n para Wassenger (alternativa a Evolution). Bueno conocer como backup.

## infranodus templates con ElevenLabs
Si alguna vez querés agregar voice a un bot, ya hay templates probados.

## Context7 MCP (ya lo tenés disponible en tools)
Te permite consultar documentación actualizada de librerías desde Claude Code. Relevante para n8n y OpenAI.

---

# 6. LO QUE RECOMIENDO ESPECÍFICAMENTE PARA ARRANCAR EL PROYECTO

## Para skills — instalar en este orden:

```bash
# 1. Sales skills (base para tu trabajo)
npx add-skill louisblythe/salesskills

# 2. Prompt architect (para generar prompts)
# Seguir instrucciones en: github.com/ckelsoe/claude-skill-prompt-architect

# 3. Skills oficiales de Anthropic (para entregar documentos a clientes)
/plugin marketplace add anthropics/skills

# 4. Superpowers (herramientas de dev día a día)
/plugin marketplace add obra/superpowers-marketplace
```

## Para workflows de referencia — clonar estos 3:

```bash
# En la carpeta /reference-workflows/ del proyecto:
git clone https://github.com/enescingoz/awesome-n8n-templates.git
git clone https://github.com/lucaswalter/n8n-ai-automations.git
git clone --depth 1 https://github.com/ritik-prog/n8n-automation-templates-5000.git
```

**Claude Code puede analizar todos esos JSONs y aprender patrones.** Específicamente filtrar por:
- Carpeta `WhatsApp/` de enescingoz
- `whatsapp_ai_chatbot_agent.json` de lucaswalter
- Búsqueda de "multi-agent" o "classifier" en los 5000 de ritik-prog

## Skills propias que deberías crear para Momentum AI:

Basado en tu metodología y los patrones que vi en otros repos, tus skills propias serían:

1. **momentum-chatbot-architect** — Dado un negocio, diseña arquitectura modular (3-5 agentes) siguiendo tu metodología. Input: info de discovery. Output: diagrama + decisiones.

2. **momentum-prompt-generator** — Genera prompt <5k chars para agente principal usando tus principios (BANT conversacional, tono costarricense, formato WhatsApp).

3. **momentum-classifier-generator** — Genera classifier Code Node o LLM basado en routing decisions.

4. **momentum-n8n-workflow-builder** — Genera JSON de workflow n8n con tu arquitectura estándar (webhook → classifier → agents → formatter → DB).

5. **momentum-prompt-optimizer** — Analiza prompt existente y sugiere cambios quirúrgicos (tu principio clave).

6. **momentum-client-delivery** — Genera documento de entrega sin jerga técnica (partiendo de arquitectura técnica).

7. **momentum-discovery-framework** — Guía el discovery de 15 min con cliente nuevo, outputs estructurados.

---

# 7. WORKFLOWS ESPECÍFICOS QUE DEBERÍAS ESTUDIAR PRIMERO

Estos son los workflows JSON más relevantes para tu stack:

## Para arquitectura base multi-agent:
- **Multi-Platform AI Sales Agent (template #4508 de n8n)** — patrón Main Agent + sub-agents especializados (CRM, Calendar, Billing). Este es el patrón que vos usás.
- Búscalo en: `n8n.io/workflows/4508`

## Para WhatsApp + RAG:
- `enescingoz/awesome-n8n-templates/WhatsApp/Complete business WhatsApp AI-Powered RAG Chatbot using OpenAI.json`
- `enescingoz/awesome-n8n-templates/WhatsApp/Building Your First WhatsApp Chatbot.json` (template 2465)

## Para WhatsApp + Evolution API + Redis memory:
- **Template n8n.io #11754** — "Build a WhatsApp assistant for text, audio & images using GPT-4o & Evolution API"
- Stack idéntico al tuyo: Evolution API + OpenAI + Redis
- Manejo de text, audio (Whisper), images

## Para Instagram DM + ManyChat:
- Búsqueda en `enescingoz/awesome-n8n-templates` filtrando "Instagram Manychat"
- Patrón exacto de Dr. Carlos Hernández

## Para auto-shop estilo SmartCheck:
- `lucaswalter/n8n-ai-automations/auto_repair_shop_gmail_agent.json`
- Patrón de cotización + handoff + Google Sheets logging

## Para hotelería estilo Jacó Dream Rentals:
- `lucaswalter/n8n-ai-automations/whatsapp_ai_chatbot_agent.json`
- Bot de hotelería con servicios personalizados

---

# 8. DOCUMENTACIÓN OFICIAL PARA TENER DE REFERENCIA

## Claude Code Skills
- `code.claude.com/docs/en/skills` — Documentación oficial de cómo crear skills
- Bundled skills disponibles: `/simplify`, `/batch`, `/debug`, `/loop`, `/claude-api`

## Anthropic Prompt Engineering
- `platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview`
- Interactive tutorials disponibles

## n8n Docs (para Claude Code via llms.txt)
- Hay un repo con el `llms.txt` oficial de n8n-docs para alimentar LLMs
- Buscar en `github.com/topics/n8n-template` el repo con "llms-txt"

---

# 9. ORDEN RECOMENDADO DE TRABAJO EN CLAUDE CODE

## Día 1: Setup del proyecto
1. Crear el proyecto en Claude Code con los 6 documentos que ya generamos
2. Instalar las 4 skills externas recomendadas (sales-skills, prompt-architect, anthropics/skills, superpowers)
3. Clonar los 3 repos de n8n templates en `/reference-workflows/`
4. Exportar tus workflows reales y ponerlos en `/my-workflows/`

## Día 2: Crear tus skills propias
1. Empezar con `momentum-chatbot-architect` (la más crítica)
2. Usar `prompt-architect` de ckelsoe para generar el SKILL.md
3. Testear con caso real (ej: Jacó Dream Rentals desde cero)

## Día 3: Validar el sistema
1. Pedirle a Claude Code que diseñe un chatbot para un cliente hipotético (ej: clínica dental)
2. Ver si genera: arquitectura + prompts + JSON de n8n
3. Iterar las skills según lo que salga mal

## Día 4+: Uso en producción
- Cliente nuevo llega → discovery con Claude Code → arquitectura → prompts → JSON n8n → copiar y pegar
- Tiempo esperado de "cliente nuevo a bot deployado": de 1 semana a 1-2 días

---

# 10. LINKS RÁPIDOS (COPY-PASTE)

**Skills principales:**
- https://github.com/louisblythe/Sales-Skills
- https://github.com/ckelsoe/claude-skill-prompt-architect
- https://github.com/anthropics/skills
- https://github.com/obra/superpowers

**Índices de skills:**
- https://github.com/sickn33/antigravity-awesome-skills
- https://github.com/VoltAgent/awesome-agent-skills
- https://github.com/alirezarezvani/claude-skills
- https://github.com/hesreallyhim/awesome-claude-code

**n8n workflows:**
- https://github.com/enescingoz/awesome-n8n-templates
- https://github.com/lucaswalter/n8n-ai-automations
- https://github.com/ritik-prog/n8n-automation-templates-5000
- https://github.com/oxbshw/ultimate-n8n-ai-workflows

**Integraciones:**
- https://github.com/EvolutionAPI/evolution-api
- https://code.claude.com/docs/en/skills
- https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview
