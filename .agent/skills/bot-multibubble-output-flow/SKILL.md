# Skill: Bot Multi-Burbuja — Flujo de salida (Formateador → Parser → Split Out → Expand → envío)

## Cuándo usar esta skill

- Estás montando (o replicando a un cliente nuevo) un bot de WhatsApp/IG en n8n que debe responder en **varias burbujas cortas** como una persona texteando, no en un párrafo largo.
- El bot manda mensajes que se ven "robóticos": párrafos largos, listas pegadas en una línea, saludo+pregunta juntos, o se "corta a la mitad" perdiendo mensajes.
- Vas a tocar el Formateador, el Structured Output Parser, el Split Out o un Code node de post-proceso y querés entender el flujo completo antes de romperlo.

**No usar** para el diseño del CONTENIDO del prompt (eso es del que escribe los prompts). Esta skill es del FLUJO TÉCNICO que parte la respuesta en burbujas y la entrega.

## Por qué existe esta skill

Capturada el 2026-06-12 tras la sesión que más peleamos con el formato del bot Momentum. El 80% de los "mensajes feos" NO eran del prompt sino del flujo de salida alrededor. Tres bugs distintos, todos en este flujo. Replicar un bot de calidad a otro cliente requiere entender ESTE flujo, no solo el prompt.

## El flujo completo (orden exacto)

```
Agente (AI Agent, systemMessage) → texto con burbujas separadas por LÍNEA EN BLANCO
   ↓
Formateador de Mensajes (Basic LLM Chain, hasOutputParser=true)
   ↓ { output: { "MENSAJE 1": "...", "MENSAJE 2": "...", ... } }
Structured Output Parser  (+ Auto-fixing Output Parser que reintenta si el JSON es inválido)
   ↓
Split Out (fieldToSplitOut: "output")  → N items { output: "texto" }
   ↓
Code node de post-proceso (limpia markers, NO debe aplastar \n)
   ↓
Loop Over Items → "Mensaje no vacío?" → Pausa entre Mensajes → Send via canal
```

## Las 4 verdades del flujo (memorizar)

1. **El wrapper `output` lo agrega el Basic LLM Chain SOLO.** El parser define `{MENSAJE 1, MENSAJE 2, ...}` (o un ejemplo `{output:{MENSAJE...}}`), y el Chain envuelve el resultado bajo `output`. Por eso el output del nodo Formateador es `{ output: { MENSAJE 1.. } }` y el Split Out separa el campo `output`. **NO es doble wrapper** — verificado con ejecución real. No asumir lo contrario sin mirar `GET /api/v1/executions/{id}?includeData=true`.

2. **El Split Out sobre un OBJETO separa sus VALORES.** `{output: {MENSAJE 1:"a", MENSAJE 2:"b"}}` con `fieldToSplitOut:"output"` → 2 items `{output:"a"}`, `{output:"b"}`. Cada MENSAJE = una burbuja.

3. **El límite de burbujas lo pone el SCHEMA del parser, no el prompt.** Si el formateador "pierde mensajes" / se corta, revisar el parser ANTES que el prompt:
   - Schema manual con `MENSAJE 1/2/3` + `additionalProperties:false` → corta en 3.
   - "Generate From JSON Example" con `{output:{MENSAJE 1..N}}` → permite N, **pero TODOS quedan required** (warning de n8n). En turnos cortos el LLM rellena o deja vacíos (el nodo "Mensaje no vacío?" filtra los vacíos). Si aparece relleno raro en respuestas cortas → pasar a "JSON Schema" con solo `MENSAJE 1` required.

4. **Cualquier Code node de post-proceso NO debe aplastar `\n`.** El clásico `/\s+/g` → ' ' convierte saltos de línea en espacios y arruina las listas numeradas que el agente separó. Usar:
   ```js
   s.replace(MARKER_RE, '')
    .replace(/[^\S\n]+/g, ' ')          // colapsa espacios/tabs, preserva \n
    .replace(/[^\S\n]*\n[^\S\n]*/g, '\n')
    .trim();
   ```

## Filosofía del Formateador "bobo" (lo más replicable)

La inteligencia de división vive en el **AGENTE**, no en el formateador:
- El agente escribe su respuesta con una **LÍNEA EN BLANCO** entre cada burbuja, y un solo "beat" por turno (o saluda, o pregunta, o da valor — no todo junto).
- El formateador solo: (1) mapea cada bloque (separado por línea en blanco) a un MENSAJE, y (2) limpia puntuación. No decide la división.
- Lista numerada = UN mensaje con cada item en su línea (salto simple), NO una burbuja por item.
- REGLA #0 del formateador: **contar los bloques del input y devolver AL MENOS esa cantidad** — nunca cortarse antes del último bloque.

Este formateador es **genérico** (no menciona al cliente) → se reusa idéntico entre clientes. El canon de puntuación humana también (sin punto final, sin `:` `;` `—` `¿`, solo `?` de cierre; el `.`/`\n` se usan PRIMERO para segmentar, recién después se limpia).

## Proceso para replicar a un cliente nuevo

1. **Duplicar** el flujo de salida tal cual (Formateador → Parser → Split Out → Code post-proceso → Loop → Send). Es genérico.
2. Usar el **Formateador v4.2 genérico** y el **canon de puntuación** sin cambios.
3. Configurar el **parser** según cuántas burbujas máximas espera el bot (fromJson con MENSAJE 1..N, o JSON Schema con solo el primero required si hay muchos turnos cortos).
4. Verificar que el Code de post-proceso **preserve `\n`** (no `/\s+/g`).
5. Probar con una respuesta de lista numerada y confirmar end-to-end con una **ejecución real** que las burbujas lleguen separadas y la lista con sus saltos.

## Output esperado

Un bot que responde en burbujas cortas y naturales, con listas numeradas legibles, sin perder mensajes ni pegar saludo+pregunta. Verificado con `GET /api/v1/executions/{id}?includeData=true` (no con el editor, que cachea).

## Ejemplo

**Input (output del agente):**
```
Perfecto

con respecto a tu clinica, cual de estos te pasa mas?
1. perdes ventas por no contestar rapido
2. no hay quien conteste fuera de horario
3. te sale caro tener a alguien solo para contestar

puede que te pasen los 3 y esta bien
```

**Output (lo que recibe el lead, 3 burbujas):**
- "Perfecto"
- "con respecto a tu clinica, cual de estos te pasa mas?\n1. perdes ventas por no contestar rapido\n2. no hay quien conteste fuera de horario\n3. te sale caro tener a alguien solo para contestar"
- "puede que te pasen los 3 y esta bien"

Relacionada con: `bot-llm-marker-expand-pattern` (el Code de markers), `n8n-information-extractor-schema-mode` (modos de schema), `inbox-message-bubble-render` (render del lado CRM). Caso real completo: `memory/leccion-2026-06-12-pipeline-completo-bot-momentum.md`.
