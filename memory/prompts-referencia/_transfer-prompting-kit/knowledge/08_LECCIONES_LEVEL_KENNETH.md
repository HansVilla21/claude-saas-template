# Lecciones del Proyecto Level (Kenneth) — Abril 2026

Primer cliente completo usando el sistema Chatbot Arquitect. Este documento captura TODO lo aprendido, los bugs que cometimos, las correcciones, y los patrones que resultaron ser reutilizables.

---

## 1. Patron: Tres Versiones por Cliente

Un cliente necesita **3 workflows n8n** distintos, todos con los mismos prompts:

| Version | Archivo | Canal | Uso |
|---------|---------|-------|-----|
| **Produccion** | `chatbot-{cliente}.json` | ManyChat/WhatsApp real | Deploy final al cliente |
| **TEST** | `chatbot-{cliente}-TEST.json` | Chat interno de n8n | Pruebas rapidas del equipo tecnico |
| **TELEGRAM** | `chatbot-{cliente}-TELEGRAM.json` | Bot de Telegram | Pruebas con el cliente/lead real |

### Diferencias tecnicas:

**Produccion (65 nodos):**
- Webhook ManyChat + Airtable ON/OFF
- Es Audio? con Evolution API
- REINICIAR con delete de Airtable + Redis + Postgres
- Buscar Lead / Crear Lead / GET Lead en Airtable
- Message batching con Redis (push → wait 45s → get → es ultimo?)
- Conversation (Postgres) → Code → Unificacion
- Information Extractor (router) → Switch → Agents
- Post-processing: detector descalificacion + deteccion Calendly
- Formateador (Basic LLM Chain) → Loop → ManyChat setCustomField + sendFlow
- Redis cleanup

**TEST (15 nodos):**
- Chat Trigger (sin webhook, sin Airtable)
- Variables (sessionId → chat_id)
- Conversation → Code → Unificacion
- Information Extractor (router) → Switch → Agents (terminales)
- Sin formateador, sin Redis, sin ManyChat

**TELEGRAM (30 nodos):**
- Telegram Trigger
- ID y Mensaje (extrae chat_id + text)
- REINICIAR con delete de Redis + Postgres (sin Airtable)
- Variables → Conversation → Code → Unificacion
- Information Extractor → Switch → Agents
- Formateador → Loop → Telegram Send Chunk
- 3 nodos Telegram Send (Reinicio, Handoff, Chunk) — todos con `appendAttribution: false`

### Los 3 comparten:
- Mismos prompts (router, principal, objeciones) — verificados byte-por-byte con MD5
- Misma logica de routing (destino como campo del router)
- Misma memoria Postgres (session_id = chat_id)

---

## 2. Los Prompts son la UNICA Fuente de Verdad

**Regla inviolable:** Los archivos en `clients/{cliente}/prompts/*.md` son la unica fuente. Cualquier JSON se genera COPIANDO byte-por-byte desde esos archivos.

**Lo que paso con Level:**
- Un subagente regenero prompts al crear el JSON de TELEGRAM
- Cambio `{nombre}` por `Nombre` (innecesario — las llaves simples no rompen n8n)
- Cambio emojis `❌ ✅` por `NO/SI` (innecesario — son Unicode, validos)
- Acorto contenido sin razon

**Como se detecto:** comparando hash MD5 de cada prompt en los 3 JSONs. Si coinciden, estan sincronizados. Si no, hay drift.

**Proceso correcto para cambiar un prompt:**
1. Editar el `.md` en `clients/{cliente}/prompts/`
2. Propagar el cambio a los 3 JSONs
3. Verificar con MD5 que coinciden
4. Solo entonces reportar "listo"

---

## 3. Information Extractor — Los 3 Gotchas Criticos

### 3a. El schema NO es contrato
El `inputSchema` del nodo es solo sugerencia. El LLM renombra campos segun el contexto. En Level fue: `agente` → `agente_asignado` → `decision` → `agente_destino` — todos espontaneos.

**Solucion:**
- Meter el formato JSON del output DENTRO del `systemPromptTemplate`
- Listar nombres PROHIBIDOS explicitos
- Usar nombres cortos y neutros: `destino` (no `agente_destino`, no `agente_asignado`)

### 3b. NUNCA usar llaves `{` `}` en el systemPromptTemplate
n8n interpreta `{` y `}` como sintaxis de expresion (`{{ }}`). Cualquier llave suelta rompe el nodo.

**Solucion:** describir la estructura del output en formato YAML (sin llaves) dentro del prompt. Aclarar "el output debe ser JSON, no YAML — YAML es solo visualizacion".

### 3c. El Switch debe leer el nombre REAL del campo
Siempre mirar el output actual del Information Extractor antes de configurar el Switch. NO asumir por el schema.

---

## 4. Router Classifier — Patron Completo

El router (Information Extractor) es el nodo mas critico. Si rutea mal, todo el chatbot falla. El patron final de Level:

### Estructura del prompt (orden obligatorio):
1. **FORMATO DE OUTPUT** (lo primero que lee el LLM) — YAML + lista de nombres prohibidos
2. **Rol** del clasificador
3. **Agentes disponibles** (definicion de cada destino)
4. **Criterio clave: PREGUNTA vs OBJECION vs CORRECCION** (lo critico)
5. **Lista de objeciones por tipo** con ejemplos concretos (no descripciones vagas)
6. **Condiciones para activar cada agente**
7. **Reglas de decision** en orden
8. **Campos a extraer**
9. **Formato final** (repetir "JSON puro")

### Reglas clave descubiertas con Level:
- Distinguir pregunta ("cuanto cuesta?") de objecion ("es muy caro")
- Distinguir correccion ("uy no, tengo mas capital") de objecion — ambos empiezan con "no" pero son distintos
- Despues de resolver una objecion, mensajes posteriores vuelven a PRINCIPAL (no quedarse en OBJECIONES)
- Segunda objecion → HANDOFF (nunca intentar resolver dos)
- Default siempre es PRINCIPAL

---

## 5. Agente Principal — Patron Completo

### Orden del prompt:
1. **Regla critica anti-repeticion** (primeras 500 chars)
2. **Identidad** (nombre, rol, enfoque doctor)
3. **Personalidad** (tono, puntuacion)
4. **Info del negocio** (servicio, precios, productos, diferenciadores)
5. **Objetivo**
6. **Enfoque doctor** con ejemplos reales de como profundizar por tipo de objetivo
7. **Flujo conversacional** (5 fases)
8. **FAQs con respuestas oficiales**
9. **Horario + mensaje fuera de horario**
10. **Reglas criticas** numeradas
11. **NUNCA PROMETAS LO QUE NO PODES ENTREGAR** (seccion dedicada)
12. **REGLAS DEL CALENDLY** (seccion dedicada con cierre en 2 pasos)
13. **PUNTUACION** (seccion dedicada)

### Cierre en 2 pasos (critico):
- **Paso 5A: PROPONER** — "Te interesa que te pase el link?" (sin link todavia)
- **Paso 5B: ENVIAR LINK** — solo despues de confirmacion afirmativa
- Despues de resolver objecion: 1-2 turnos normales antes de volver a proponer
- Variar cada mensaje que envia el link (no templates fijos)

### Reglas anti-bot (las que delatan):
- **Puntuacion:** NO `:`, NO `;`, NO `¿` — solo `?` al final
- **Repeticion:** variar mensajes recurrentes (Calendly, links, respuestas a FAQs)
- **Promesas falsas:** NO prometer PDFs/videos/audios — solo links reales
- **Pushy:** NO terminar cada mensaje con CTA

---

## 6. Agente Objeciones LAARC

### Framework: Listen → Acknowledge → Assess → Respond → Confirm

Todo en UN solo mensaje fluido (no como pasos separados). Max 4 lineas total.

### Regla critica descubierta:
**El agente de objeciones NUNCA intenta agendar directamente.** No tiene acceso a calendario ni conoce disponibilidad. Si el lead quiere agendar → redirige al link de Calendly.

### Patron comprobado:
```
Acknowledge: "Entiendo, es totalmente valido"
Assess: "Que es lo que mas te preocupa/Comparado con que?"
Respond: [argumento segun tipo]
Confirm: "Eso te genera mas tranquilidad?"
```

### Tipos de objecion (solo 3-4 comunes + 1 generica):
- Precio → "Comparado con que?"
- Timing → "Que necesita pasar?"
- Miedo → "Que te preocupa, perder todo o que no rinda?"
- Desconfianza → "Que te preocupa especificamente?"

---

## 7. Sintaxis n8n — Los Gotchas Tecnicos

### `.item` vs `.first()`
- `.item` depende de pairedItem chain que se rompe tras Code/AI Agent/Loop/Split
- Usar `.first()` como default — funciona siempre

### Postgres delete
- NO: `operation: "delete"`
- SI: `operation: "deleteTable"` + `deleteCommand: "delete"`

### Telegram Send
- SIEMPRE `additionalFields.appendAttribution: false`
- Sin esto, n8n agrega "Sent via n8n.io" que delata al bot

### Code node para formatear historial
- Devuelve `[{ json: { conversation_text, total_messages, session_id } }]`
- Rompe pairedItem → todos los nodos posteriores necesitan `.first()`

---

## 8. Checklist de Verificacion Pre-Deploy

Cuando se genera un JSON nuevo o se modifica uno existente:

### Nivel prompt:
- [ ] Prompts del cliente en `clients/{cliente}/prompts/*.md` estan completos
- [ ] Hash MD5 de cada prompt coincide entre los 3 JSONs (prod/TEST/TELEGRAM)
- [ ] `systemPromptTemplate` del Information Extractor tiene 0 llaves `{` `}`
- [ ] `systemMessage` de AI Agents tiene 0 llaves sueltas (solo `{{ }}` validas)
- [ ] Schema del Information Extractor usa `destino` como campo principal

### Nivel workflow:
- [ ] Switch lee `$json.output.destino` (no `agente`, no `agente_asignado`)
- [ ] Todas las expresiones a nodos anteriores usan `.first()` (no `.item`)
- [ ] Postgres delete usa `operation: deleteTable` + `deleteCommand: delete`
- [ ] Telegram Send tiene `appendAttribution: false`
- [ ] Credenciales como placeholder: "{Cliente} - Telegram/OpenAI/Postgres/Redis"

### Nivel conversacional (testing):
- [ ] Lead calificado: bot propone agendar, espera confirmacion, manda link
- [ ] Lead con objecion: va a agente objeciones (no al principal)
- [ ] Objecion + correccion despues: vuelve al principal
- [ ] Bot no repite el mismo mensaje literal al enviar links
- [ ] Mensajes sin `:`, `;`, `¿`
- [ ] Bot no promete material educativo si no hay link real

---

## 9. Que NO Funciono (Para No Repetir)

1. **Nombres largos de campos en schema** → LLM los renombra. Usar cortos (`destino`).
2. **Template fijo para enviar link** → delata al bot. Dar 5+ variantes.
3. **"Te puedo compartir contenido educativo"** → promesa vacia si no hay material real.
4. **Objeciones descritas vagamente** (`expresa resistencia`) → LLM no las detecta. Dar 10+ frases concretas.
5. **Pedir fecha/hora al lead** → bot no tiene calendario. Siempre redirigir a Calendly.
6. **Mensajes tipo "Perfecto Hans, aqui podes agendar directamente..."** exactos → detectable como bot.
7. **`{ }` en systemPromptTemplate** → rompe el nodo por conflicto con expresiones n8n.
8. **`operation: "delete"` en Postgres** → no es un valor valido, hay que usar `deleteTable`.
9. **`.item` despues de Code/Loop** → pairedItem roto. Usar `.first()`.
10. **Regenerar prompts al crear JSON nuevo** → rompe consistencia. Copiar byte-por-byte.
