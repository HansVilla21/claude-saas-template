---
name: momentum-architect
description: Diseña la arquitectura modular de un chatbot dado el discovery de un cliente. Usa cuando necesitas decidir cuantos agentes, que modelo LLM, que canal, que CRM, como estructurar el flujo de n8n, o cuando el usuario dice "diseñar arquitectura", "cuantos agentes necesito", "que stack usar".
---

# Momentum Architect — Diseño de Arquitectura de Chatbot

## Evaluacion Inicial

Antes de diseñar:
- **Lee** `clients/{cliente}/discovery.json` — si no existe, sugerir `/momentum-discovery` primero
- **Lee** `memory/metodologia-core.md` — reglas NO NEGOCIABLES
- **Lee** `memory/client-patterns.md` — patrones de los 7 clientes reales
- **Consulta** `references/stack-matrix.md` — matriz de stack por tipo de negocio
- **Consulta** `references/architecture-patterns.md` — patrones comprobados
- **Consulta** los workflows reales en `knowledge/workflows-reference/*/analysis.md` como referencia

## Principios Core

1. **El template base de n8n ya existe** — no diseñas desde cero, defines QUE CAMBIA en el template
2. **Menos es mas** — empezar con minimo de agentes, agregar solo si hay necesidad clara
3. **Information Extractor (router) como LLM** — SIEMPRE si hay 2+ agentes o necesitas extraer datos
4. **Agente principal como DEFAULT** — maneja 70-80% del trafico, es el fallback en el Switch

## La Estructura Fija del Template (NUNCA cambia)

Esto ya esta resuelto en el template base de n8n. NO hay que diseñarlo:

```
Webhook (ManyChat) → Airtable ON/OFF → Audio check → ID y Mensaje
→ REINICIAR (testing)
→ Buscar Lead → Existe?
   ├─ SI → Apagado? → Update Timestamp → GET Lead
   └─ NO → [Filtro inicial si aplica] → Crear Lead → GET Lead
→ Redis push → Wait (45-60s) → Redis get → Es ultimo?
→ Juntar mensajes → Postgres historial → Code formatear → Unificacion Variables
→ [ROUTER — LO QUE DISEÑAS] → Switch → [AGENTES — LO QUE DISEÑAS]
→ Redis cleanup → Formateador LLM → Loop ManyChat send
→ [POST-PROCESSING OPCIONAL]
```

## Lo Que Diseñas (las "variables" del template)

### Decision 1: Cuantos agentes?

| Complejidad | Agentes | Cuando |
|------------|---------|--------|
| Ultra-simple | 1 (sin router) | Formulario, 1 CTA, microfinanzas |
| Simple | 1 + router | Negocio con 1 flujo pero necesita extraer datos |
| Estandar | 2 + router | Negocio con calificacion + objeciones |
| Complejo | 3 + router | Negocio con inventario/catalogo + derivacion vendedores |

Referencia real:
- Jaco (1 agente): villas de lujo, flujo unico mostrar → reservar
- Dr. Carlos (2 agentes): calificacion + objeciones LAARC
- El Canal (3 agentes): Eva principal + inventario Google Sheets + agendamiento vendedores

### Decision 2: Que hace cada agente?

Para cada agente definir:
- **Nombre** (descriptivo)
- **Proposito** (UNA sola funcion)
- **Modelo** — gpt-4.1-mini para todos (temp 0.4, max 400 tokens)
- **Tools** — RAG Supabase, Google Sheets, o ninguno
- **Memory** — Postgres Chat Memory, context window 15
- **Chars target**

### Decision 3: Que extrae el router?

El Information Extractor (router) necesita:
- **Destinos del Switch** (max 3-4 + backup)
- **Campos a extraer** del historial (adaptar al negocio)
- **Condiciones de handoff** (cuando escalar a humano)

Modelo: gpt-4.1-mini, temp 0.1, max tokens 300-400, response_format: json_object

### Decision 4: Filtro inicial?

Solo si el cliente tenia conversaciones previas en el canal. Si es canal nuevo → NO necesita filtro.

### Decision 5: Post-processing?

Opciones (elegir las que aplican):
- **Deteccion de links** (Calendly, wa.me) → apagar chatbot + notificacion Discord
- **Detector de descalificacion** → Information Extractor post-agente que auto-apaga
- **Asignacion de vendedores** → Code JS round-robin + Airtable update
- **Execute Workflow** → sub-workflow para actualizar datos del lead en CRM

### Decision 6: Stack

| Componente | Opciones | Decision basada en |
|-----------|---------|-------------------|
| Canal | ManyChat (IG/WA) / Evolution API (WA) / YCloud (WA oficial) | Canal del cliente |
| CRM | Airtable (siempre) | Standard |
| DB | Postgres (siempre para historial) | Standard |
| Cache | Redis (siempre para batching) | Standard |
| RAG | Supabase Vector Store | Si tiene catalogo/info extensa |
| Inventario | Google Sheets Tool | Si tiene inventario dinamico |
| Notificaciones | Discord | Si necesita alertas al equipo |
| Citas | Calendly link hardcoded | Si tiene agendamiento |

## Output

Guardar en `clients/{cliente}/architecture.md` con:

```markdown
# Arquitectura: {cliente}

## Resumen
{1-2 lineas del negocio}

## Agentes

| Agente | Proposito | Modelo | Tools | Chars Target |
|--------|-----------|--------|-------|-------------|
| ... | ... | ... | ... | ... |

## Router (Information Extractor)
- Destinos: {lista}
- Campos a extraer: {lista}
- Condiciones handoff: {lista}

## Componentes Opcionales
- [ ] Filtro inicial: {si/no, por que}
- [ ] Detector descalificacion: {si/no, por que}
- [ ] Deteccion links post-agente: {si/no, que links}
- [ ] Asignacion vendedores: {si/no, cuantos, metodo}
- [ ] Sub-workflow CRM: {si/no}

## Stack
{tabla de componentes}

## Diagrama
{flujo visual del Switch con agentes}

## Reglas de Negocio Criticas
{lo que el bot NUNCA debe hacer}
```

## Edge Cases

- **Ultra-simple (1 CTA):** Agente unico sin router. Ver patron Grandit.
- **Mas de 3 agentes:** Verificar que no hay redundancia. El Canal tenia 4 y se redujo a 3.
- **Sin API de precios:** El bot NO confirma precios. Redirige a links.
- **Modo proactivo + reactivo:** Dos workflows SEPARADOS.

## Errores Comunes

- **Problema:** Crear agente de agendamiento cuando un link de Calendly es suficiente
  **Solucion:** El agente principal puede compartir el link directamente.

- **Problema:** Router con 5+ destinos
  **Solucion:** Max 3-4. Default siempre al principal.

- **Problema:** Diseñar el template desde cero
  **Solucion:** El template YA EXISTE. Solo define que cambia.

## Skills Relacionados

- `/momentum-discovery` — paso anterior
- `/momentum-prompt-gen` — siguiente paso (genera los prompts)
