# Lección 2026-06-12 — Pipeline completo del bot Momentum: prompts, formateador, router, flujo de salida, modelos y bugs de estado

**Propósito:** capturar TODO el aprendizaje técnico de la sesión más larga que llevamos peleando con la calidad del bot (prompts + formateador + router + flujo de envío). Documento de referencia para cuando queramos **modularizar y replicar esta calidad a otros clientes de forma rápida**. Es el activo más importante de esta sesión.

> Contexto de la sesión: veníamos de "Mateo funciona" (2026-06-10). El founder trajo iteraciones sucesivas de prompts (v2 → v3 → v4 → v4.1 → v4.2) y pidió aplicarlas al workflow una por una. En el camino destapamos 3 bugs de raíz que NO eran de los prompts sino del FLUJO alrededor de ellos. Cerramos con el bot respondiendo "bastante bien".

---

## 0. Regla de trabajo que quedó firme (división de responsabilidades)

**El founder escribe los prompts en OTRO proyecto.** Yo NO los redacto ni cambio su contenido — quedó comprobado que la redacción de prompts no es mi fuerte. Mi rol:

1. **Aplicar** los prompts al workflow N8N (vía build scripts idempotentes).
2. **Diagnosticar bugs técnicos** del flujo y reportarlos con evidencia (no inventar fixes de prompt).
3. **Verificar** contra el N8N vivo, no contra mi memoria.

Los prompts canónicos viven en `clients/momentum-ai-crm/test-prompts/v{N}/`. El founder agrega una carpeta `v{N}` nueva con los archivos que cambian; yo aplico SOLO esos y mantengo el resto de la versión anterior.

**Regla de confianza que adoptamos:** después de CADA deploy, traer el estado vivo de N8N y verificar con **hash SHA-256** de cada prompt contra el archivo canónico + listar modelos + memoria. "Está actualizado" no se afirma, se demuestra con el hash. (Nació porque el founder no me creía que los prompts estaban aplicados — el editor de N8N cacheaba y él veía lo viejo.)

---

## 1. Arquitectura del flujo de salida (CÓMO un mensaje del bot llega al lead)

Esto es lo que MENOS entendíamos y lo que causó 2 de los 3 bugs. La cadena, en orden:

```
Agente Principal / Objeciones (AI Agent, systemMessage hardcodeado)
        ↓ output crudo (texto con burbujas separadas por LÍNEA EN BLANCO)
Formateador de Mensajes (Basic LLM Chain, hasOutputParser=true)
        ↓ { output: { "MENSAJE 1": "...", "MENSAJE 2": "...", ... } }
        │   (el wrapper `output` lo agrega el Basic LLM Chain SOLO, no el parser)
Structured Output Parser (valida el JSON del LLM)
   └─ Auto-fixing Output Parser → reintenta si el LLM devuelve JSON inválido
        ↓
Split Out (fieldToSplitOut: "output")
        ↓ separa el OBJETO {MENSAJE 1..N} en N items → { output: "texto" } cada uno
Expand Property Images (Code node, heredado del bot inmobiliario v6)
        ↓ limpia markers [IMG:...] y AHORA preserva los \n internos
Loop Over Items → "Mensaje no vacío?" → Pausa entre Mensajes → Send Chunk via YCloud
```

**Insight clave del parser (me equivoqué y lo corregí con datos):** el `{output: {...}}` que documentan los archivos del formateador NO es doble wrapper. El Basic LLM Chain SIEMPRE envuelve el resultado del parser bajo `output`. Verificado con ejecución real 425826:
- Formateador produce `{ output: { MENSAJE 1, MENSAJE 2, MENSAJE 3, MENSAJE 4 } }`
- Split Out de `output` (objeto) → 4 items `{ output: "texto" }`

Yo predije que poner `{output:{...}}` en el parser rompería (doble wrapper). **Estaba mal.** n8n trata el `output` del ejemplo como el wrapper estándar. Lección: NO afirmar el comportamiento de un nodo sin una ejecución real que lo confirme. La fuente de verdad es `GET /api/v1/executions/{id}?includeData=true`, no mi razonamiento.

---

## 2. Los 3 bugs de RAÍZ (ninguno era del prompt)

### BUG 1 — El nodo `Expand Property Images` aplastaba los saltos de línea
- **Síntoma:** la lista numerada del bot ("cuál te pasa más? 1... 2... 3...") llegaba al lead en UNA sola línea corrida, aunque el formateador la mandaba con `\n`.
- **Causa raíz:** la función `cleanMarkers` usaba `.replace(/\s+/g, ' ')`. `\s` incluye `\n`, así que colapsaba TODOS los saltos de línea a espacios. El founder lo detectó comparando input/output del nodo.
- **Por qué ese nodo está ahí:** es heredado del bot inmobiliario v6 (expande fotos de propiedades `[IMG:CR-XXXX]`). En Momentum el módulo properties está apagado (`PROPERTIES_MODULE_ENABLED=false`), pero el nodo igual procesaba el texto y rompía los `\n`.
- **Fix (SET24):** `cleanMarkers` ahora preserva `\n`:
  ```js
  return (s || '')
    .replace(IMG_RE_GLOBAL, '')
    .replace(/[^\S\n]+/g, ' ')          // colapsa espacios/tabs, NO newlines
    .replace(/[^\S\n]*\n[^\S\n]*/g, '\n')
    .trim();
  ```
- **Lección replicable:** `/\s+/g` es una trampa cuando el texto lleva saltos de línea significativos (burbujas/listas). Usar `[^\S\n]` para colapsar solo espacios horizontales. Ya pasó antes con URLs (`new URL()` en sandbox) — los Code nodes heredados de otros bots traen lógica que rompe supuestos del bot nuevo. **Al duplicar un workflow, auditar los Code nodes heredados.**

### BUG 2 — El parser cortaba a 3 mensajes
- **Síntoma:** el formateador a veces "se cortaba a la mitad" / perdía mensajes.
- **Causa raíz:** el Structured Output Parser tenía schema manual con solo `MENSAJE 1/2/3` y `additionalProperties: false`. Si el LLM producía MENSAJE 4+, se descartaban.
- **Fix (founder, manual en N8N):** cambió el parser a "Generate From JSON Example" con:
  ```json
  { "output": { "MENSAJE 1": "Texto aqui", "MENSAJE 2": "Texto aqui",
                "MENSAJE 3": "Texto aqui", "MENSAJE 4": "Texto aqui" } }
  ```
- **Trade-off documentado (warning de n8n):** con "fromJson" TODOS los campos quedan `required`. En un turno corto (1-2 mensajes) el LLM se ve forzado a llenar los 4 → o deja vacíos (el nodo "Mensaje no vacío?" los filtra) o inventa relleno. Si aparecen mensajes de relleno raros en respuestas cortas → la solución es "JSON Schema" con solo MENSAJE 1 required. **A vigilar en pruebas.**
- **Lección replicable:** el límite de burbujas del bot está atado al schema del parser, no solo al prompt. Si el formateador "pierde mensajes", revisar el parser ANTES que el prompt.

### BUG 3 — `bot_paused_until` dejaba el bot mudo tras handoff (bug de PRODUCTO, en el CRM)
- **Síntoma:** el founder devolvía una conversación al bot y el bot no respondía al siguiente mensaje, aunque `handler='bot'`.
- **Causa raíz (cadena completa):**
  1. El handoff (nodo n8n `Silent Handoff Apagar Bot`) hace: `handler='human'`, `handoff_status='pending'`, **`bot_paused_until = now() + 24h`**.
  2. El nodo `Chatbot Activado?` del workflow exige 3 condiciones AND: `handler='bot'` **+** `bot_paused_until` vencido/null **+** agencia `bot_enabled=true`.
  3. El botón **"Devolver al bot"** del inbox (`handleToggleHandler` en `inbox-client.tsx`) solo hacía `update({ handler: 'bot' })` — **no limpiaba la pausa**.
  4. Resultado: `handler='bot'` pero la pausa de 24h seguía viva → el bot quedaba mudo hasta que vencía.
- **Diagnóstico con datos:** `GET /executions/{id}` mostró que el flujo cortaba en `Chatbot Activado?` (último nodo ejecutado). `Get Conversation State` tenía `bot_paused_until` en el futuro. Fix inmediato manual: `UPDATE conversations SET bot_paused_until = NULL`.
- **Fix de producto (PR #25 en `momentum-ai-crm`):** que "Devolver al bot" haga `{ handler: 'bot', bot_paused_until: null }`. Tomar la conversación (→ human) no toca la pausa.
- **Lección replicable:** reactivar el bot NO es solo cambiar `handler` — hay que limpiar `bot_paused_until`. Cualquier acción de "devolver/reactivar bot" debe limpiar las DOS cosas en una sola operación.

---

## 3. La saga de prompts (v2 → v4.2): qué cambió y por qué

Cada versión es una iteración del founder sobre el mismo bot Mateo. Resumen de la dirección del diseño:

| Versión | Cambio principal | Por qué |
|---|---|---|
| v2 (SET18) | Router gana `presion_precio_count` + `frustrado`; escalera de precio con piso $150; fix colisión de nombre Hans/Pietro | Manejar presión de precio sin quemar el lead |
| v3 (SET20) | Principal: no re-presentarse + calificar con ESCENARIOS (3 opciones numeradas en 1 mensaje); Router: interpretar respuestas cortas según el último mensaje del bot; Formateador: burbuja-first | El "si" de Pietro tras oferta de equipo se clasificaba mal; los escenarios matan varias preguntas de un tiro |
| v4 (SET21) | Principal: cerrar la llamada solo consiguiendo el "sí" (Hans coordina día/hora), un beat por turno; Router: aceptar llamada = HANDOFF DE FIJO; **Formateador "bobo"** (el agente separa con líneas en blanco, el formateador solo mapea + limpia) | Mover la inteligencia de división AL AGENTE, no al formateador |
| v4.1 (SET23) | Escenarios numerados en burbujas SEPARADAS | Probar lista como mensajes individuales |
| v4.2 (SET24) | Lista numerada vuelve a UN mensaje con cada item en su línea (`\n` simple) + **REGLA #0: devolver TODOS los bloques, nunca cortarse** | Las burbujas separadas se veían peor; la REGLA #0 ataca el corte de mensajes |

**Evolución de la filosofía del Formateador (importante para modularizar):**
- Empezó decidiendo él la división (Criterio A+B) → frágil.
- v4 lo volvió "bobo": el AGENTE escribe ya separado por líneas en blanco, y el formateador solo (1) mapea cada bloque a un MENSAJE y (2) limpia puntuación. **Toda la inteligencia de división vive en el agente.** Esto es más robusto y más fácil de replicar.

**Canon de puntuación (sigue vigente):** sin punto final, sin `:` `;` `—` `¿`, solo `?` de cierre. El `.` y `\n` originales se usan PRIMERO para segmentar, recién después se limpia. Nunca borrar un `.` dejando mayúscula pegada a media línea.

---

## 4. Modelos y memoria (estado final)

- **Los 6 nodos LLM en `gpt-4.1` FULL** (SET22). Aclaración que costó: `gpt-4o-mini` ≠ "4.0 mini" (la "o" es de *omni*). 4 de 6 nodos ya estaban en `gpt-4.1-mini` desde el inicio; el salto REAL de capacidad es a `gpt-4.1` full, no de 4o-mini a 4.1-mini (eso es lateral, mismo tier "mini"). El founder eligió full en todos.
- **Memoria (Postgres Chat Memory) a 30 mensajes** en Agente Principal y Objeciones (antes 20/15).
- Costo: gpt-4.1 full ~5x por token vs mini, pero una conversación mueve pocos tokens → barato por chat. Vigilar si entra volumen de Meta Ads.

---

## 5. El pipeline de build/deploy (cómo aplicamos cada cambio)

Patrón de los build scripts (`crm-v2/scripts/build-bot-c-v1-set{N}-*.js`), idempotentes:

1. Leer el prompt canónico del `.md` en `test-prompts/v{N}/` → extraer el bloque entre ``` con `extractFirstFencedBlock(md, '## System Prompt')`.
2. **Rename obligatorio:** `listo_para_llamada` → `lead_listo_para_agendar` (compat con Silent Handoff, viene de SET11).
3. Cargar el workflow JSON local, **crear snapshot** `PRE-SET{N}` en `snapshots/`.
4. Aplicar al nodo correspondiente (systemMessage / systemPromptTemplate / messages.messageValues[0].message / parameters.model.value / contextWindowLength).
5. **Smoke tests** (verifican el contenido aplicado + que lo que NO debía cambiar siga intacto). Si falla 1, NO escribe ni deploya.
6. Escribir JSON local + compilados en `prompts/_compiled/`.
7. **Deploy:** `PUT /api/v1/workflows/{id}` con SOLO `{ name, nodes, connections, settings }` (la API rechaza versionId/active/etc. con "additional properties").
8. Verificar contra N8N vivo (hash de prompts + versionId).

**Gotchas del deploy que ya conocemos:**
- La API PUT solo acepta `name, nodes, connections, settings`.
- En Windows, leer/escribir el JSON con Node.js, no Python (UnicodeDecodeError con charmap).
- El editor de N8N cachea: tras deploy, hay que cerrar y reabrir la pestaña del workflow para ver los cambios.

**Datos fijos del workflow:**
- Workflow: `Chatbot Momentum - bot-c v1`, id `Jsh4krhC9HRUh7Ly`, 97 nodos, active.
- Host N8N: `n8n-n8n.v5qn6d.easypanel.host`. `N8N_API_KEY` en `.env` raíz.

---

## 6. Hacia la REPLICABILIDAD MODULAR (el objetivo del founder)

El founder quiere llegar a: **replicar esta calidad de prompts para otros clientes de forma modular, personalizable y rápida.** Lo que aprendimos esta sesión que sirve para eso:

**Hallazgo clave — hoy conviven DOS sistemas de prompt:**
1. **systemMessage hardcodeado en el nodo** (los prompts Mateo v4.x que venimos aplicando). Es lo que el bot usa hoy — confirmado porque los escenarios numerados de v4.1+ aparecen en las ejecuciones reales.
2. **`bot_config` de la agencia en Supabase** (visto en `Resolve Agency`): trae piezas YA modulares — `core_template`, `system_rules_template`, `custom_instructions`, `business_info`, `conversation_flow[]`, `tone`. Pero el workflow actual NO las usa para el Agente Principal.

**Para modularizar habría que decidir:** ¿el prompt del agente se arma dinámicamente desde `bot_config` (modular, por cliente, sin tocar N8N) o se mantiene hardcodeado por nodo? La pieza modular ya existe en la DB; falta cablearla. Ese es el camino natural hacia "personalizable y rápido": cada cliente = una fila de `bot_config`, el workflow se mantiene igual.

**Lo que ya es reutilizable tal cual:**
- El FLUJO de salida (Formateador → Parser → Split Out → Expand → envío) es genérico, sirve para cualquier cliente.
- El Formateador "bobo" v4.2 es genérico (no menciona Momentum) — se puede reusar idéntico.
- El patrón de build scripts idempotentes + verificación por hash.
- El canon de puntuación humana.

**Lo que es específico de cliente (lo que cambiaría por agencia):**
- `business_info`, `conversation_flow`, clientes reales nombrables, reglas de precio, nombre del bot, tono.
- Los destinos del Router y las condiciones de handoff.

**Próximo paso sugerido para el objetivo modular:** evaluar mover el Agente Principal a leer de `bot_config` (como ya hace el `core_template`/`system_rules_template`), dejando solo lo específico por cliente en la DB. Eso haría que dar de alta un cliente nuevo sea "llenar un bot_config", no "editar el workflow".

---

## 7. Errores míos en la sesión (para no repetir)

1. **Afirmé que el botón "Devolver al bot" no existía** — busqué con términos en inglés, no con el texto literal en español de la UI. Sí existía y además tenía el bug. → siempre buscar el texto literal que el usuario ve, en español. (`feedback_verify_before_claiming_absence`)
2. **Predije que el parser con `{output:{...}}` rompería por doble wrapper** — falso, lo confirmé con ejecución real recién después. → no afirmar comportamiento de nodo sin ejecución real.
3. **Me enrosqué con gimnasia de git** (rebase/backup/force-push) para un fix de 1 línea. → entrega mínima directa. (`feedback_minimal_change_no_process_gymnastics`)
4. **Confundí el cambio de modelo** (dije "subí de 4o-mini a 4.1-mini" sin aclarar que era lateral, no un salto de tier). → ser preciso con nombres de modelo y con qué significa "subir".
