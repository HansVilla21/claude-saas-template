---
name: momentum-prompt-gen
description: Genera prompts optimizados para cada componente del chatbot siguiendo la metodologia Momentum AI. Usa cuando necesitas crear prompts para agente principal, information extractor (router/classifier), agentes especializados, agente de objeciones LAARC, filtro inicial, formateador de mensajes, o detector de descalificacion. Tambien cuando el usuario dice "generar prompts", "crear prompt", "escribir prompt", "prompt para el agente".
---

# Momentum Prompt Generator — Generacion de Prompts Optimizados

## Evaluacion Inicial

Antes de generar:
- **Lee** `clients/{cliente}/architecture.md` — si no existe, sugerir `/momentum-architect` primero
- **Lee** `clients/{cliente}/discovery.json` — datos del discovery
- **Lee** `memory/metodologia-core.md` — reglas de prompting
- **Consulta** los prompts reales en `knowledge/workflows-reference/` como referencia de calidad
- **Consulta** los templates en `assets/` para la estructura base

## Principios Core

1. **Copiable directo a n8n** — el prompt sale listo para pegar en el nodo del template. Cero placeholders sin resolver.
2. **SIEMPRE reportar conteo de caracteres** de cada prompt generado
3. **Usar los prompts reales como referencia** — no inventar patrones, seguir lo que ya funciona en produccion
4. **El Information Extractor (router) es lo MAS CRITICO** — dedicar el mayor esfuerzo ahi

## Componentes a Generar

Segun la arquitectura, estos son TODOS los prompts posibles. No todos aplican a cada chatbot:

| Componente | Template | Nodo n8n | Modelo | Chars |
|-----------|----------|----------|--------|-------|
| Agente principal | `assets/template-principal.md` | AI Agent | gpt-4.1-mini (temp 0.4, 400 tokens) | 3,000-5,000 |
| Router/Classifier | `assets/template-classifier-llm.md` | Information Extractor | gpt-4.1-mini (temp 0.1, 300 tokens) | 1,500-3,500 |
| Classifier Code Node | `assets/template-classifier-code.js` | Code Node | N/A | N/A |
| Especialista | `assets/template-especialista.md` | AI Agent | gpt-4.1-mini (temp 0.4, 400 tokens) | 800-1,500 |
| Objeciones LAARC | `assets/template-objeciones.md` | AI Agent | gpt-4.1-mini (temp 0.4, 400 tokens) | 1,000-2,000 |
| Filtro inicial | `assets/template-filtro-inicial.md` | Information Extractor | gpt-4.1-mini (temp 0.1, 300 tokens) | 2,000-4,000 |
| Formateador | `assets/template-formateador.md` | Basic LLM Chain | gpt-4o-mini | ~8,000 (reutilizable) |
| Detector descalificacion | `assets/template-detector-descalificacion.md` | Information Extractor | gpt-4.1-mini (temp 0.1, 400 tokens) | 500-1,500 |

## Proceso

### Paso 1: Revisar la Arquitectura

Leer `clients/{cliente}/architecture.md` y listar que componentes necesita este chatbot:

- [ ] Agente principal (SIEMPRE)
- [ ] Router/Classifier LLM (SIEMPRE si hay 2+ agentes)
- [ ] Filtro inicial (SOLO si el cliente tenia conversaciones previas en el canal)
- [ ] Agente(s) especializado(s) (segun arquitectura)
- [ ] Agente objeciones LAARC (si ciclo de venta largo o ticket alto)
- [ ] Formateador (SIEMPRE — usar template-formateador.md sin modificar)
- [ ] Detector descalificacion (SOLO si hay criterios de descalificacion claros)

### Paso 2: Generar el Router/Classifier PRIMERO

Este es el nodo mas critico. Si rutea mal, todo falla.

1. Leer `assets/template-classifier-llm.md`
2. Consultar prompts reales similares en `knowledge/workflows-reference/`:
   - Si es real estate → ver `el-canal/clasificador-router.md`
   - Si es clinica/salud → ver `dr-carlos/router-classifier.md`
   - Si es villas/alquiler → ver `information-extractor-router.md` (Jaco)
3. Definir:
   - Destinos del switch (max 3-4 + backup)
   - Campos a extraer (adaptar al negocio)
   - Condiciones de handoff
   - Reglas de prioridad
4. El output schema DEBE usar `agente_destino` como campo principal
5. Contar caracteres

### Paso 3: Generar el Agente Principal

1. Leer `assets/template-principal.md`
2. Consultar agente real similar en `knowledge/workflows-reference/`
3. Rellenar TODAS las variables con datos reales del discovery
4. Incluir: identidad, objetivo, info critica, flujo conversacional, FAQs, reglas
5. Si tiene tools (RAG, Google Sheets) → incluir instrucciones de uso
6. Contar caracteres — si excede 5,000, recortar

### Paso 4: Generar Agentes Adicionales

Para cada agente especializado o de objeciones:
1. Leer template correspondiente
2. Mantenerlo CORTO — max 1,500 chars
3. UN solo proposito por agente
4. Contar caracteres

### Paso 5: Generar Componentes Auxiliares

- **Filtro inicial:** Solo si aplica. Copiar template y adaptar categorias.
- **Formateador:** Copiar `assets/template-formateador.md` SIN MODIFICAR — es universal.
- **Detector descalificacion:** Solo si aplica. Adaptar tipos de descalificacion.

### Paso 6: Guardar y Reportar

Guardar en `clients/{cliente}/prompts/`:
- `router-classifier.md`
- `agente-principal.md`
- `agente-{nombre}.md` (cada especializado)
- `agente-objeciones.md` (si aplica)
- `filtro-inicial.md` (si aplica)
- `formateador.md` (copia sin modificar)
- `detector-descalificacion.md` (si aplica)

**Tabla resumen OBLIGATORIA:**

```
| Componente | Nodo n8n | Modelo | Temp | Tokens | Chars |
|-----------|----------|--------|------|--------|-------|
| Router | Information Extractor | gpt-4.1-mini | 0.1 | 300 | X,XXX |
| Principal | AI Agent | gpt-4.1-mini | 0.4 | 400 | X,XXX |
| ...
```

## Edge Cases

- **Prompt excede limite:** Buscar redundancias, eliminar edge cases "por si acaso"
- **Multiidioma:** Agregar `idioma_detectado` al router, agente responde en el idioma detectado
- **Sin objeciones definidas:** Usar las 4 genericas: precio, timing, product fit, desconfianza
- **Negocio ultra-simple (1 CTA):** Agente unico sin router, enviar formulario/link inmediatamente

## Errores Comunes

- **Problema:** Instrucciones repetidas 3-4 veces
  **Solucion:** Cada regla UNA sola vez.

- **Problema:** Placeholders sin resolver ({{ }}, [EMPRESA])
  **Solucion:** TODO resuelto con datos reales. Cero placeholders.

- **Problema:** "Te voy a pasar X" sin dar X en el mismo mensaje
  **Solucion:** En n8n cada agente responde directamente. Links/contactos EN EL MISMO mensaje.

- **Problema:** Router con campo `agente` pero Switch lee `agente_destino`
  **Solucion:** SIEMPRE usar `agente_destino` en el schema. Verificar que el Switch lo lee correctamente.

## Skills Relacionados

- `/momentum-architect` — define que agentes necesitan prompts
- `/momentum-prompt-optimizer` — para mejorar prompts existentes
- `/momentum-n8n-builder` — siguiente paso (configura el workflow con los prompts)
