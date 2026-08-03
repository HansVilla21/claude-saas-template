---
name: momentum-workflow-variants
description: Genera las versiones TEST (chat interno n8n) y TELEGRAM de un workflow de chatbot existente para permitir pruebas rapidas del equipo tecnico y del cliente. Usa cuando ya tenes el JSON de produccion y necesitas una version simplificada para testing, cuando el cliente pide un bot de Telegram para probar, o cuando el usuario dice "version test", "version telegram", "bot para pruebas", "chat interno para probar".
---

# Momentum Workflow Variants — Generar TEST y TELEGRAM

## Evaluacion Inicial

- **Lee** `clients/{cliente}/workflow/chatbot-{cliente}.json` — debe existir (produccion)
- **Lee** `clients/{cliente}/prompts/*.md` — fuente de verdad de los prompts
- **Pregunta** al usuario que variante necesita: TEST, TELEGRAM, o ambas

## Principios Core

1. **Los prompts son fuente de verdad** — copiar byte-por-byte desde `clients/{cliente}/prompts/*.md`. NUNCA modificar.
2. **Verificar con MD5** — hash de cada prompt debe coincidir entre los 3 JSONs
3. **Cada variante tiene una funcion distinta** — TEST para equipo tecnico (rapido), TELEGRAM para cliente/lead (realista)
4. **Consultar `references/` de este skill** antes de generar cada variante

## Variantes Disponibles

### TEST — Chat Interno de n8n (~15 nodos)

**Proposito:** pruebas rapidas del equipo tecnico. El equipo se mete a n8n, abre el chat interno, y prueba el bot sin necesitad de setup adicional.

**Lo que SI tiene:**
- Chat Trigger (chat interno de n8n)
- Variables, Conversation (Postgres), Code, Unificacion
- Information Extractor (router) — mismos prompts que prod
- Switch + Agents (Principal, Objeciones) — mismos prompts que prod
- Postgres Chat Memory

**Lo que NO tiene:**
- Sin Airtable (ON/OFF, Leads)
- Sin Redis batching
- Sin formateador (los agentes responden directamente al chat)
- Sin ManyChat
- Sin audio
- Sin filtro inicial
- Sin detector de descalificacion
- Sin deteccion de Calendly

Leer: `references/TEST-structure.md` para la estructura exacta.

### TELEGRAM — Bot de Telegram (~30 nodos)

**Proposito:** pruebas con el cliente/lead real. Se le da el link del bot de Telegram y prueba como si fuera WhatsApp.

**Lo que SI tiene:**
- Telegram Trigger + Telegram Send (3 nodos de envio)
- ID y Mensaje + REINICIAR (con Redis delete + Postgres delete)
- Variables, Conversation (Postgres), Code, Unificacion
- Information Extractor (router) — mismos prompts que prod
- Switch + Agents (Principal, Objeciones) — mismos prompts que prod
- Postgres Chat Memory
- **Formateador (Basic LLM Chain)** + Split Out + Loop + Wait
- Envia mensajes divididos en chunks via Telegram

**Lo que NO tiene:**
- Sin Airtable (ON/OFF, Leads, Update records)
- Sin ManyChat
- Sin audio (Evolution API)
- Sin detector de descalificacion (el handoff se hace con mensaje estatico)

Leer: `references/TELEGRAM-structure.md` para la estructura exacta.

## Proceso

### Paso 1: Verificar prerrequisitos

- [ ] `clients/{cliente}/workflow/chatbot-{cliente}.json` existe
- [ ] `clients/{cliente}/prompts/router-classifier.md` existe
- [ ] `clients/{cliente}/prompts/agente-principal.md` existe
- [ ] `clients/{cliente}/prompts/agente-objeciones.md` existe (si aplica)

Si falta algo → detener y pedir al usuario que complete el pipeline normal primero.

### Paso 2: Calcular hash MD5 de los prompts fuente

```python
import hashlib
for prompt_file in ['router-classifier.md', 'agente-principal.md', 'agente-objeciones.md']:
    content = open(f'clients/{cliente}/prompts/{prompt_file}').read()
    # Extraer el contenido dentro del bloque ``` del System Prompt
    system_prompt = extract_system_prompt_block(content)
    print(f'{prompt_file}: {hashlib.md5(system_prompt.encode()).hexdigest()}')
```

Guardar estos hashes como referencia.

### Paso 3: Generar la variante

#### Para TEST:
Leer `references/TEST-structure.md` y generar el JSON siguiendo esa estructura exacta. Copiar los prompts textual desde `clients/{cliente}/prompts/*.md`.

#### Para TELEGRAM:
Leer `references/TELEGRAM-structure.md` y generar el JSON. Copiar:
- Prompts de router, principal, objeciones desde `clients/{cliente}/prompts/*.md`
- Formateador completo desde el JSON de produccion (`Basic LLM Chain4` + parsers)

### Paso 4: Verificacion obligatoria

Despues de generar el JSON:

1. **JSON valido** — debe parsear con `json.load`
2. **Prompts identicos por hash MD5** — comparar contra los hashes del Paso 2
3. **Cero llaves en systemPromptTemplate** del Information Extractor (no `{` ni `}`)
4. **Expresiones con .first()** despues de Code/Agent/Loop (no `.item`)
5. **Telegram Send con `appendAttribution: false`** (solo para TELEGRAM)
6. **Postgres delete con `operation: "deleteTable"`** (solo TELEGRAM en REINICIAR)
7. **Switch lee `$json.output.destino`** (no `agente`, no `agente_destino`)

Si cualquier check falla → arreglar antes de reportar "listo".

### Paso 5: Guardar y reportar

Output:
- TEST: `clients/{cliente}/workflow/chatbot-{cliente}-TEST.json`
- TELEGRAM: `clients/{cliente}/workflow/chatbot-{cliente}-TELEGRAM.json`

Reportar:
- Numero de nodos totales
- Hash MD5 de prompts (confirmar que coinciden con prod)
- Lista de credenciales placeholder que el usuario debe configurar

## Errores Comunes (Evitar)

- **Problema:** El subagente "limpia" los prompts (cambia emojis, placeholders)
  **Solucion:** Instruir explicitamente "copiar byte-por-byte, NO modificar nada"

- **Problema:** Genera el JSON pero los prompts no coinciden por hash
  **Solucion:** Re-extraer desde el `.md` y re-aplicar. Hashes deben coincidir.

- **Problema:** Llaves sueltas en systemPromptTemplate rompen el nodo
  **Solucion:** Verificar con grep `{` y `}` en el prompt del router antes de guardar

- **Problema:** Despues de importar TELEGRAM, falla el Delete Postgres historial
  **Solucion:** Asegurar `operation: "deleteTable"` (NO `"delete"`) + `deleteCommand: "delete"`

- **Problema:** Despues de importar TELEGRAM, "Paired item data unavailable"
  **Solucion:** Todas las expresiones a nodos anteriores deben usar `.first()` (no `.item`)

## Skills Relacionados

- `/momentum-n8n-builder` — genera el JSON de produccion (paso anterior)
- `/momentum-pipeline` — pipeline completo
- `@n8n-analyzer` — analiza workflows existentes
