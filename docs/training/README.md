# Manual de Entrenamiento — Construcción de Chatbots Momentum AI

**Audiencia:** persona que asume la construcción de chatbots de ventas para clientes de Momentum AI.
**Pre-requisitos:** conocimiento básico de n8n, APIs HTTP, prompts de LLM, y JSON.
**Tiempo de lectura completa:** 6–8 horas. Tiempo del resumen ejecutivo (este archivo): 30 minutos.
**Fuente:** destilado de 18+ proyectos reales en producción, documentación interna del repositorio y reglas no negociables validadas en campo.

---

## 1. Qué hacemos y por qué existe este manual

Construimos chatbots de ventas conversacionales para negocios en Costa Rica y LATAM. El producto no es "un bot": es un sistema modular que ejecuta un proceso de ventas (calificación BANT, manejo de objeciones, agendamiento, derivación a humano) sobre canales de mensajería (WhatsApp, Instagram, Telegram). El núcleo técnico es un workflow en **n8n** que orquesta nodos de LLM (GPT-4.1-mini / GPT-4o-mini), memoria persistente (PostgreSQL + Redis) y un CRM (Airtable / Google Sheets / Notion).

El sistema entrega resultados medibles:

| Métrica | Industria | Momentum |
|---|---|---|
| Conversión (chat → lead calificado) | 10-15% | **30-40%** |
| Coherencia conversacional | 70-85% | **>95%** |
| Latencia total | 5-8 s | **<3 s** |
| Costo por chat | $0.30-0.50 | **<$0.10** |
| Abandono | 40-60% | **<20%** |

Este manual es el documento que necesitás leer y dominar para reproducir esos resultados sin acompañamiento. Está organizado en 11 capítulos. El **Capítulo 4 (Diseño de Prompts)** es el más crítico — los prompts son la pieza que diferencia un chatbot que convierte de uno que falla.

---

## 2. Mapa del manual

| # | Capítulo | Por qué importa | Tiempo |
|---|---|---|---|
| [01](01-filosofia-metodologia.md) | Filosofía y metodología núcleo | Las 22 reglas no negociables. Si las violás, el bot falla. | 30 min |
| [02](02-arquitectura-modular.md) | Arquitectura modular | Cómo se diseña un chatbot completo. Componentes, decisiones, trade-offs. | 45 min |
| [03](03-discovery-cliente.md) | Discovery con el cliente | El proceso de 15 minutos que define la arquitectura. | 30 min |
| [04](04-diseno-prompts.md) | Diseño de prompts (CENTRAL) | Anatomía de cada tipo de prompt, frameworks, reglas de redacción. | 90 min |
| [05](05-catalogo-prompts.md) | Catálogo de prompts copiables | Prompts reales completos de 3 clientes, anotados línea a línea. | 60 min |
| [06](06-workflow-n8n.md) | Workflow n8n: el template base | Anatomía del workflow base, nombres de nodos, sticky notes, patrones técnicos. | 60 min |
| [07](07-variantes-canal.md) | Variantes del workflow por canal | TEST, TELEGRAM, YCLOUD, YCLOUD-AUDIO. Cuándo usar cada una. | 30 min |
| [08](08-casos-estudio.md) | Casos de estudio reales | 7 clientes, decisiones tomadas, lecciones aprendidas. | 60 min |
| [09](09-troubleshooting.md) | Troubleshooting y optimización | Diagnóstico de síntomas, fixes quirúrgicos, optimización post-launch. | 45 min |
| [10](10-entrega-gobernanza.md) | Entrega al cliente y gobernanza | Documento de entrega sin jerga, versionado, fuentes de verdad. | 30 min |
| [11](11-checklists-glosario.md) | Checklists y glosario | Pre-deploy, vocabulario técnico, referencias rápidas. | 20 min |

---

## 3. Pipeline operativo (7 pasos)

Cada cliente nuevo se procesa por este pipeline. El sistema tiene un skill (`/momentum-pipeline`) que lo ejecuta de principio a fin, pero la persona a cargo debe entender cada paso:

```
1. Crear carpeta del cliente            → clients/{nombre-cliente}/
2. Cargar docs del cliente              → clients/{cliente}/docs/
3. Discovery (15 min)                   → discovery.json
4. Diseño de arquitectura               → architecture.md
5. Generación de prompts                → prompts/*.md
6. Configuración del workflow n8n       → workflow/chatbot-{cliente}.json
7. Documento de entrega al cliente      → entrega.md
```

**Reducción de tiempo objetivo:** una semana → 1-2 días por cliente. Esto solo se logra cuando se sigue el pipeline al pie de la letra y se aprovechan los templates de referencia.

---

## 4. Las 10 reglas que nunca se violan

Si recordás solo 10 cosas de este manual, que sean estas. Cada una está expandida en los capítulos correspondientes.

1. **Arquitectura modular siempre** — nunca un mega-prompt. Mínimo: router + principal + formateador. ([Cap 01](01-filosofia-metodologia.md), [Cap 02](02-arquitectura-modular.md))
2. **Cambios quirúrgicos, nunca reescrituras** — si funciona al 70%, arreglar solo lo que falla. ([Cap 04](04-diseno-prompts.md))
3. **Valor primero, datos después** — nunca pedir email/teléfono antes de demostrar valor. ([Cap 01](01-filosofia-metodologia.md))
4. **El bot NUNCA hace compromisos vinculantes** — sin precios exactos, sin disponibilidad confirmada. Riesgo legal. ([Cap 01](01-filosofia-metodologia.md), [Cap 08](08-casos-estudio.md))
5. **Si no sabe, no inventa** — "Dejá verifico eso" antes que dar información falsa. ([Cap 04](04-diseno-prompts.md))
6. **Puntuación humana en todos los prompts** — sin `:`, `;`, `¿`, sin punto final, sin guion largo. ([Cap 04](04-diseno-prompts.md))
7. **Variar mensajes repetidos** — la repetición textual delata al bot. Dar 3-5 variantes para cada mensaje recurrente. ([Cap 04](04-diseno-prompts.md))
8. **Los prompts del cliente son la única fuente de verdad** — el JSON copia byte-por-byte del `.md`. ([Cap 10](10-entrega-gobernanza.md))
9. **Information Extractor: cero llaves sueltas en `systemPromptTemplate`** — n8n las interpreta como expresiones y rompe el nodo. ([Cap 06](06-workflow-n8n.md))
10. **Webhook con `responseMode: "onReceived"` para servicios externos** — si no, timeout y mensajes duplicados. ([Cap 06](06-workflow-n8n.md), [Cap 07](07-variantes-canal.md))

---

## 5. Stack técnico de referencia

| Capa | Tecnología | Notas |
|---|---|---|
| Orquestación | **n8n self-hosted** | Workflow visual. Template base se duplica por cliente. |
| LLM principal | **GPT-4.1-mini** (router, agentes) | Temperature 0.1 router / 0.4 agente. Max tokens 300-400. |
| LLM formateador | **GPT-4o-mini** | Universal, no cambia. |
| Memoria conversacional | **PostgreSQL** (Chat Memory) | Context window 15 mensajes. |
| Batching de mensajes | **Redis** | Push → wait 45-60s → get all → es último? |
| CRM | **Airtable** (default), Google Sheets (simple), Notion (avanzado) | |
| Canal — WhatsApp prod | **YCloud (BSP)** o **Evolution API (self-hosted)** | YCloud para clientes oficiales, Evolution para demo barata. |
| Canal — Instagram | **ManyChat** | Webhook bidireccional con n8n. |
| Canal — Telegram | **Bot nativo de Telegram** | Solo para demos al cliente. |
| Agendamiento | **Calendly** | Link hardcoded en prompt. No conectar API. |
| Notificaciones | **Discord** | String detection en output del agente. |
| Audio | **OpenAI Whisper** (HTTP directo) | $0.006/min, soporta OGG/Opus de WhatsApp nativo. |

---

## 6. Filosofía operativa

El proyecto opera sobre tres principios que es importante interiorizar:

**Defensa en profundidad.** Toda restricción crítica se aplica en tres capas: en el prompt del agente, en la validación post-respuesta (detector de descalificación, string detection), y en el contrato con el cliente (qué puede prometer y qué no). Si una capa falla, otra contiene el daño.

**Templates que se nutren con cada cliente.** Cada vez que un cliente nuevo introduce un patrón reutilizable (nuevo canal, nuevo post-processing, nuevo tipo de agente especializado), ese patrón se extrae a `knowledge/workflows-reference/` y `knowledge/workflow-variants-templates/` en versión anonimizada. El siguiente cliente arranca con más palanca.

**Quirúrgico sobre reescritura.** Tanto en prompts como en workflows, los cambios se hacen un punto a la vez, midiendo el impacto antes del siguiente. La reescritura completa es la última opción, no la primera.

---

## 7. Cómo usar este manual

Tres rutas según tu situación:

**Onboarding desde cero (recomendado):** leer en orden 01 → 02 → 04 → 05 → 06 → 07 → 08 → 09 → 10 → 11. Esto da el modelo mental completo antes de tocar un cliente.

**Tenés un cliente nuevo y necesitás empezar ya:** leer 03 (Discovery), después 02 (Arquitectura) para entender qué decidir, después 04 + 05 para escribir prompts. Volver a 06 + 07 cuando toques el workflow.

**Estás debuggeando un chatbot existente:** ir directo a 09 (Troubleshooting). Si el problema es de prompt, saltar a 04. Si es del workflow, a 06.

---

## 8. Convenciones del manual

- **Reglas críticas marcadas `(CRÍTICO)`** — no negociables. Violarlas tiene consecuencias documentadas (errores legales, fallos en producción, baja conversión).
- **Ejemplos comparativos**: el formato `❌ INCORRECTO` / `✅ CORRECTO` muestra el patrón que falla y el que funciona.
- **Conteo de caracteres** explícito en cada prompt. Los prompts crecen con el tiempo; el conteo es la métrica de salud.
- **Referencias internas** con notación `(ver Cap 04 §3)` apuntan al capítulo y sección dentro del manual.

---

## 9. Recursos relacionados en el repositorio

| Recurso | Para qué |
|---|---|
| [`knowledge/01_METODOLOGIA_MOMENTUM_AI.md`](../knowledge/01_METODOLOGIA_MOMENTUM_AI.md) | Documento original largo. Este manual lo destila. |
| [`knowledge/02_CASOS_CLIENTES_COMPLETOS.md`](../knowledge/02_CASOS_CLIENTES_COMPLETOS.md) | Documentación extensa de cada cliente. |
| [`knowledge/04_PATRONES_TECNICOS_N8N.md`](../knowledge/04_PATRONES_TECNICOS_N8N.md) | Code snippets, schemas SQL, configs. |
| [`knowledge/05_TROUBLESHOOTING_Y_OPTIMIZACION.md`](../knowledge/05_TROUBLESHOOTING_Y_OPTIMIZACION.md) | Diagnóstico extendido. |
| [`knowledge/08_LECCIONES_LEVEL_KENNETH.md`](../knowledge/08_LECCIONES_LEVEL_KENNETH.md) | Caso completo del primer cliente con el sistema actual. |
| [`knowledge/09_INTEGRACION_YCLOUD.md`](../knowledge/09_INTEGRACION_YCLOUD.md) | Doc técnica completa de YCloud. |
| [`knowledge/workflows-reference/`](../knowledge/workflows-reference/) | Workflows y prompts reales de clientes (template-base, dr-carlos, el-canal). |
| [`knowledge/workflow-variants-templates/`](../knowledge/workflow-variants-templates/) | Templates anonimizados (TEST, TELEGRAM, YCLOUD, YCLOUD-AUDIO). |
| [`memory/metodologia-core.md`](../memory/metodologia-core.md) | Reglas críticas destiladas. |
| [`memory/client-patterns.md`](../memory/client-patterns.md) | Patrones por tipo de negocio. |
| [`.claude/skills/`](../.claude/skills/) | Skills que automatizan cada paso del pipeline. |

---

## 10. Cómo se mantiene este manual

Este documento es una destilación viva. Cada vez que un cliente nuevo revela un patrón o un anti-patrón que no está cubierto:

1. Documentar el aprendizaje en el caso del cliente (`clients/{cliente}/`)
2. Agregar a `knowledge/08+_LECCIONES_*.md`
3. Si es generalizable, anonimizar y agregar al template correspondiente
4. Actualizar la sección relevante de este manual y la entrada en `memory/`

El manual no se reescribe completo — se actualizan secciones quirúrgicamente, igual que los prompts. La fecha de última revisión queda en el footer de cada capítulo.

---

**Empezá por el [Capítulo 01 — Filosofía y metodología núcleo](01-filosofia-metodologia.md).**
