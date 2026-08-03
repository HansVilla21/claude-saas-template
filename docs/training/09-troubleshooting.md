# 09 — Troubleshooting y optimización

Cuando algo falla en producción, este es el capítulo de referencia. Diagnóstico de síntomas, fixes quirúrgicos, y el playbook de optimización continua post-launch.

---

## 1. Diagnóstico rápido por síntoma

Esta tabla cubre el 90% de los problemas que se presentan en producción. Cada fila enlaza a la sección detallada para implementar el fix.

| Síntoma | Causa más probable | Fix | Sección |
|---|---|---|---|
| Bot responde cosas que no debería | GPT-4o-mini con prompt >3k chars | Cambiar a GPT-4.1-mini o GPT-4o | §2.1 |
| Bot olvida info ya proporcionada | Window Buffer <10 o memory mal conectada | Subir context window a 15 + verificar conexión Postgres | §2.2 |
| Bot repite preguntas | Memory no persiste, classifier no extrae datos | Verificar Postgres Memory + agregar extracción al classifier | §2.3 |
| Bot inventa datos | Sin regla anti-invención en el prompt | Agregar regla "Si no sabe, dejá verifico eso" | §2.4 |
| Classifier devuelve JSON vacío/cortado | Token limit muy bajo | Subir max_tokens a 500-1000 | §2.5 |
| Bot no sigue el flujo esperado | Prompt demasiado largo o contradictorio | Reducir prompt, eliminar redundancias | §2.6 |
| Latencia alta (>5s) | Prompt largo + tools innecesarias | Reducir prompt + minimizar tools | §2.7 |
| Mensajes duplicados al usuario | Webhook responseMode incorrecto | `responseMode: "onReceived"` | §3.1 |
| Switch no rutea | Schema renombrado por LLM | Inspeccionar output real + ajustar campo | §3.2 |
| Error "Paired item data unavailable" | `.item` después de Code Node o Agent | Cambiar a `.first()` | §3.3 |
| Postgres delete falla | `operation: "delete"` incorrecto | `operation: "deleteTable"` + `deleteCommand: "delete"` | §3.4 |
| Telegram muestra "Sent via n8n.io" | Falta `appendAttribution: false` | Agregar a additionalFields | §3.5 |
| Information Extractor rompe | Llaves `{` `}` sueltas en systemPromptTemplate | Reescribir en YAML | §3.6 |
| Bot suena robótico (puntuación) | Modelo está usando puntuación formal | Reforzar sección de puntuación en el prompt | §2.8 |
| Bot repite mensajes idénticos | Sin variación documentada en el prompt | Agregar 3-5 variantes para acciones recurrentes | §2.9 |
| Bot promete material que no llega | Promesas sin link real | Auditar prompt, eliminar promesas vacías | §2.10 |

---

## 2. Problemas de prompt — diagnóstico detallado

### 2.1 Bot responde cosas que no debería

**Diagnóstico:**
- ¿Cuántos caracteres tiene el prompt?
- ¿Qué modelo está usando?

**Solución inmediata:** cambiar de GPT-4o-mini a GPT-4.1-mini (resuelve ~80% de los casos).

**Solución estructural:** reducir el prompt y/o dividir en agentes especializados.

**Cómo verificar:**
1. Abrir el nodo AI Agent
2. Ver el campo "Model"
3. Si es `gpt-4o-mini` y el prompt es >3k chars → cambiar a `gpt-4.1-mini`

### 2.2 Bot olvida información ya proporcionada

**Causas posibles:**
1. Window Buffer Memory insuficiente (<10 mensajes)
2. GPT-4o-mini pierde contexto en conversaciones largas
3. Prompt no instruye "nunca re-preguntar datos ya proporcionados"

**Diagnóstico:**
- Abrir el nodo Postgres Chat Memory
- Verificar `contextWindowLength` (debe ser 15)
- Verificar que el `sessionId` se computa correctamente

**Solución:**
1. Subir Window Buffer a 15 mensajes
2. Cambiar a GPT-4.1-mini si está en mini
3. Agregar regla explícita anti-repetición en las primeras 500 chars del prompt:

```markdown
# REGLA DE NO REPETICIÓN (CRÍTICA)
ANTES de cualquier pregunta, verificá en el historial completo si el usuario 
ya proporcionó esa info. Si la dio, usala sin preguntar.
```

### 2.3 Bot repite preguntas

**Causas posibles:**
1. Memory no persiste entre turnos
2. Classifier no extrae datos del historial
3. Prompt tiene instrucciones repetidas que confunden al modelo

**Solución:**
1. Verificar que Window Buffer está correctamente conectado al AI Agent
2. Agregar extracción de datos en el campo `datos_extraidos` del classifier
3. Consolidar instrucciones anti-repetición en 1 solo lugar del prompt (no repetir en múltiples secciones)

### 2.4 Bot da información incorrecta / inventa datos

**Causas posibles:**
1. Sin regla explícita de "no inventar"
2. Prompt da ejemplos con datos específicos que el modelo generaliza
3. Sin RAG para información factual cuando se necesita

**Solución:**
1. Agregar al prompt:

```markdown
## INFORMACIÓN QUE NO TENÉS
Si te preguntan algo que NO está en este prompt:
- NO inventés la respuesta
- Decí: "Dejá verifico eso para vos en un momento"
- NUNCA des números, fechas, precios específicos que no tengas
```

2. Remover ejemplos con precios/datos específicos del prompt (el modelo los memoriza)
3. Implementar RAG con datos reales si la info cambia frecuentemente

### 2.5 Classifier devuelve JSON vacío o cortado

**Causa:** token limit del LLM muy bajo.

**Solución:** subir `maxTokens` a 500-1000 en el nodo del classifier.

**Verificar:** el output debe ser JSON puro sin ```json``` ni texto adicional. Si el LLM agrega backticks, agregar al prompt:

```markdown
## OUTPUT
JSON puro, sin markdown, sin backticks, sin texto adicional.
```

### 2.6 Bot no sigue el flujo esperado

**Causas posibles:**
1. Prompt demasiado largo → modelo pierde instrucciones tempranas
2. Instrucciones contradictorias en diferentes secciones
3. Demasiados edge cases confunden al modelo

**Solución:**
1. Reducir prompt, eliminar redundancias
2. Revisar consistencia entre secciones (la sección "MISIÓN" no debe contradecir la sección "FLUJO")
3. Quitar edge cases que rara vez ocurren (el 80/20 aplica)

**Cómo identificar contradicciones:**
- Buscar en el prompt: las palabras "siempre", "nunca", "obligatorio" deben referirse a las mismas cosas en distintas secciones
- Si la sección "Reglas" dice "nunca dar precio" pero la sección "FAQ" da un precio específico → contradicción

### 2.7 Latencia alta (>5 segundos)

**Causas posibles:**
1. Prompt muy largo → más tokens → más tiempo
2. GPT-4.1-mini o GPT-4o es más lento que mini
3. RAG query + LLM response = doble latencia
4. Múltiples herramientas conectadas al agente

**Solución:**
1. Reducir prompt (mayor impacto)
2. Aceptar el trade-off de modelo más capaz, o optimizar para usar mini
3. Cachear respuestas RAG frecuentes (Redis TTL 1h)
4. Minimizar tools conectadas — cada tool agrega contexto al system prompt

### 2.8 Bot suena robótico (puntuación)

**Causa:** el modelo usa puntuación académica formal (`:`, `;`, `¿`, punto final).

**Solución:** reforzar la sección de puntuación en el prompt. Si ya existe, moverla más arriba (zona de alta atención del modelo).

**Sección modelo (ver [Cap 04 §10](04-diseno-prompts.md)):**

```markdown
## PUNTUACIÓN (CRÍTICO - REGLA INVIOLABLE)

PROHIBIDO usar:
- Dos puntos ( : )
- Punto y coma ( ; )
- Signo de pregunta inicial ( ¿ )
- Punto final al cierre del mensaje
- Guion largo ( — )

EN VEZ DE: "Hola Hans: ¿cómo estás?"
USÁ:       "Hola Hans, como estas?"
```

### 2.9 Bot repite mensajes idénticos

**Causa:** sin variación documentada en el prompt para acciones recurrentes (envío de Calendly, link educativo, FAQs).

**Solución:** agregar al prompt 3-5 variantes para cada mensaje recurrente:

```markdown
## VARIACIÓN DE MENSAJES (CRÍTICO)

Para el envío del link de Calendly, acá tenés 5 variantes (inspiración, 
NO templates fijos):

1. "Acá podés agendar la sesión: [URL]"
2. "Te dejo el link para que escojas el horario que te quede: [URL]"
3. "Listo, podés reservar tu llamada acá: [URL]"
4. "Por acá podés agendar directamente: [URL]"
5. "Te lo dejo para que veas los espacios disponibles: [URL]"

Cada vez que envíes el link, redactá el mensaje como si fuera la primera vez.
```

### 2.10 Bot promete material que no llega

**Causa:** el prompt menciona "te puedo compartir contenido educativo" o "te envío un PDF" sin un link real detrás.

**Solución:** auditar el prompt buscando palabras: "te paso", "te envío", "te mando", "te comparto". Para cada una, verificar que hay un link real disponible. Si no hay link, eliminar la promesa.

**Regla:** el bot solo puede entregar texto y links. NO PDFs, NO videos, NO audios. Detalles en [Cap 01 §3.2](01-filosofia-metodologia.md).

---

## 3. Problemas técnicos del workflow

### 3.1 Mensajes duplicados al usuario

**Causa #1: Webhook responseMode incorrecto.**

**Diagnóstico:**
- Abrir el nodo Webhook
- Verificar `responseMode`

**Fix:**

```json
{
  "responseMode": "onReceived",
  "responseCode": 200,
  "responseData": "noData"
}
```

Si el servicio externo es YCloud, ManyChat, Evolution, Stripe o cualquiera con timeout < 10 segundos, **debe ser `onReceived`**.

**Causa #2: Múltiples webhooks registrados en el servicio externo.**

- Verificar en YCloud Console / ManyChat / etc. que solo hay UN webhook apuntando al path del workflow
- Eliminar webhooks duplicados

### 3.2 Switch no rutea correctamente

**Síntoma:** todas las conversaciones van al BACKUP (agente principal), aunque el router debería enviar algunas a OBJECIONES o HANDOFF.

**Diagnóstico:**

1. Ejecutar el workflow en modo step-by-step
2. Después del Information Extractor, expandir el JSON del output
3. Ver qué nombre tiene el campo principal: ¿es `destino`? ¿o el LLM lo renombró a `agente`, `agente_destino`, `decision`, etc.?

**Fix:**

- Si el LLM renombra: usar el nombre que el LLM realmente genera. Modificar el Switch para leer ese nombre.
- O mejor: agregar al prompt del router una lista de nombres PROHIBIDOS explícita ([Cap 04 §4.1](04-diseno-prompts.md))

**Patrón preventivo:** usar nombres cortos en el schema (`destino` recomendado). Los LLMs prefieren nombres simples.

### 3.3 Error "Paired item data unavailable"

**Mensaje completo:** "Paired item data for item from node 'X' is unavailable. Ensure 'X' is providing the required output."

**Causa:** estás usando `.item` en una expresión, después de un nodo que rompe el pairedItem chain (Code, AI Agent, Information Extractor, Split Out, Loop Over Items).

**Fix:** cambiar `.item` por `.first()`:

```javascript
// ❌ INCORRECTO
{{ $('ID y Mensaje').item.json.ID }}

// ✅ CORRECTO
{{ $('ID y Mensaje').first().json.ID }}
```

**Donde buscar:**
- Nodos después del Formateador (Basic LLM Chain) + Loop
- Nodos después del Code node que formatea historial
- Nodos después del AI Agent
- Telegram Send Chunk, ManyChat HTTP Request, etc.

### 3.4 Postgres delete falla con error "The value 'delete' is not supported!"

**Causa:** el nodo `n8n-nodes-base.postgres` v2.6 NO acepta `operation: "delete"`.

**Fix:**

```json
{
  "operation": "deleteTable",
  "deleteCommand": "delete",
  "schema": { "__rl": true, "value": "public", "mode": "list" },
  "table": { "__rl": true, "value": "n8n_chat_histories", "mode": "list" },
  "where": {
    "values": [
      { "column": "session_id", "value": "..." }
    ]
  }
}
```

### 3.5 Telegram muestra "Sent via n8n.io"

**Fix:** agregar a TODOS los nodos Telegram Send:

```json
"additionalFields": {
  "appendAttribution": false
}
```

Aplicar al nodo de Reinicio, Handoff y Chunk.

### 3.6 Information Extractor rompe por llaves

**Síntoma:** el nodo Information Extractor da error de validación al guardar, o el LLM recibe el prompt malformado.

**Causa:** hay `{` o `}` sueltos en el `systemPromptTemplate`.

**Fix:** reescribir cualquier descripción de JSON en formato YAML (sin llaves):

```markdown
# FORMATO DE OUTPUT
El output debe ser JSON. Acá la estructura en YAML (sin llaves para 
no romper n8n):

destino: AGENTE_PRINCIPAL
motivo: "explicación"
datos_extraidos:
  nombre: null
  presupuesto: null

Tu output real debe ser el JSON equivalente.
```

---

## 4. Metodología de debugging de prompts

Cuando un prompt no funciona como se espera, seguir este proceso paso a paso:

### Paso 1: Identificar el problema específico

¿Qué hace mal **exactamente**?

- ¿Inventa información? → regla anti-invención
- ¿Repite preguntas? → memory issue
- ¿Ignora instrucciones? → prompt demasiado largo o modelo inadecuado
- ¿Tono incorrecto? → sección de personalidad
- ¿Flujo roto? → instrucciones de flujo contradictorias

### Paso 2: Localizar en el prompt

Buscar la sección responsable:

- ¿Existe la instrucción que debería prevenir esto?
- ¿Está en conflicto con otra instrucción?
- ¿Está demasiado lejos del inicio? (modelos olvidan instrucciones al final)

### Paso 3: Fix quirúrgico

Hacer **UN cambio a la vez**:

- Mover instrucción crítica más arriba en el prompt
- Eliminar instrucción contradictoria
- Agregar ejemplo específico del comportamiento esperado
- Reducir longitud total si >5k chars

### Paso 4: Testear

Probar con **5 conversaciones que previamente fallaban**:

- ¿Se resolvió el problema?
- ¿Se creó un problema nuevo?
- ¿El conteo de caracteres sigue dentro del límite?

### Paso 5: Documentar

Registrar:

- Qué se cambió
- Por qué se cambió
- Resultado del cambio
- Nuevo conteo de caracteres

**Ubicación de la documentación:** `clients/{cliente}/prompts-history/` o en el commit message del cambio al `.md`.

---

## 5. Playbook de optimización post-launch

### 5.1 Semana 1: monitoreo intensivo

**Revisar diariamente:**

- Conversaciones completas (leer las primeras 20-30)
- Tasa de abandono por fase del flujo
- Mensajes donde el bot falló (no entendió, inventó, repitió)
- Tiempo promedio de respuesta
- Leads calificados vs total de conversaciones

**Ajustar:**

- Keywords del classifier que no matchean
- Respuestas a preguntas frecuentes no cubiertas
- Tono si el feedback del cliente lo requiere

**Métricas a trackear:**

| Métrica | Target |
|---|---|
| Conversión chat → lead calificado | 30-40% |
| Coherencia (sin olvidar contexto) | >95% |
| Latencia total por turno | <3s |
| Abandono | <20% |
| Calificación BANT (3 de 4 capturados) | >60% |
| Costo por chat completo | <$0.10 |

### 5.2 Semanas 2-4: iteración basada en datos

**Preguntas clave:**

- **¿Dónde abandonan más?** → optimizar ese punto del flujo
- **¿Qué preguntas no puede responder el bot?** → agregar al prompt o RAG
- **¿Qué objeciones nuevas aparecen?** → agregar al agente de objeciones (LAARC)
- **¿El BANT se captura naturalmente?** → ajustar preguntas si se siente forzado

**Cambios quirúrgicos:**

- NUNCA reescribir todo el prompt
- Cambiar UN aspecto a la vez
- Medir impacto antes del siguiente cambio
- Documentar cada cambio y su efecto

### 5.3 Mes 2+: A/B testing (si hay volumen)

Solo cuando se tenga volumen suficiente (>100 conversaciones/semana).

**Variables comprobadas para A/B test:**

- Mensaje de bienvenida (formal vs casual)
- Orden de preguntas BANT
- Momento de presentar CTA
- Longitud de respuestas
- Con emojis vs sin emojis

**Método:**

1. **Baseline:** 100 conversaciones con versión actual
2. **Hipótesis:** "Cambiar X mejorará Y en Z%"
3. **Split:** 50/50 tráfico (implementable con Code Node de routing aleatorio)
4. **Medir:** significancia estadística (p < 0.05)
5. **Implementar:** rollout del ganador

---

## 6. SQL queries para dashboards

Cuando el cliente quiere métricas, estas queries dan los números clave:

### 6.1 Conversaciones por día

```sql
SELECT DATE(created_at), COUNT(*) as total_chats
FROM chat_analytics 
WHERE message_direction = 'in'
GROUP BY DATE(created_at)
ORDER BY DATE(created_at) DESC;
```

### 6.2 Tasa de calificación

```sql
SELECT 
  COUNT(*) as total_leads,
  COUNT(CASE WHEN bant_score >= 3 THEN 1 END) as qualified,
  ROUND(
    COUNT(CASE WHEN bant_score >= 3 THEN 1 END)::numeric / 
    COUNT(*)::numeric * 100, 1
  ) as qualification_rate
FROM conversation_state
WHERE created_at > NOW() - INTERVAL '30 days';
```

### 6.3 Agente más usado

```sql
SELECT 
  agent_used, 
  COUNT(*) as usage_count,
  ROUND(AVG(response_time_ms)) as avg_response_ms,
  ROUND(AVG(tokens_used)) as avg_tokens
FROM chat_analytics
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY agent_used
ORDER BY usage_count DESC;
```

### 6.4 Abandono por stage

```sql
SELECT 
  conversation_stage, 
  COUNT(*) as stuck_here,
  ROUND(
    COUNT(*)::numeric / 
    (SELECT COUNT(*) FROM conversation_state 
     WHERE created_at > NOW() - INTERVAL '30 days')::numeric * 100, 1
  ) as pct
FROM conversation_state
WHERE updated_at < NOW() - INTERVAL '24 hours'
  AND created_at > NOW() - INTERVAL '30 days'
GROUP BY conversation_stage
ORDER BY stuck_here DESC;
```

---

## 7. Síntomas específicos de YCloud

### 7.1 Webhook no recibe nada

- Verificar workflow `Active` en n8n
- Verificar URL en YCloud Console > Webhooks coincide exactamente con la del workflow
- Verificar el path del webhook (`/ycloud-leo` vs `/ycloud-leo-test` — son diferentes)
- En YCloud Console > Webhooks > endpoint > log de delivery: ver si hay errores 4xx/5xx

### 7.2 `REQUEST_EXCEPTION (Client.Timeout exceeded)`

**Causa:** n8n no responde 200 dentro del timeout (~5-10s).

**Fix:** Webhook node con `responseMode: "onReceived"`.

**Síntomas adicionales:** el bot responde mensajes duplicados o triplicados al usuario porque YCloud reintenta el evento.

### 7.3 HTTP Send 401 Unauthorized

- Credencial Header Auth mal configurada. El header debe ser exactamente `X-API-Key` (case-sensitive)
- API key inválida o revocada

### 7.4 HTTP Send 400 Bad Request

Causas comunes:

- `from` no es un número registrado en tu cuenta YCloud
- `to` no está en formato E.164 (debe empezar con `+`)
- Body mal formado. Verificar que `text.body` use `JSON.stringify` para escapar caracteres especiales
- Estás fuera de la ventana de 24h y mandás texto plano (debe ser template HSM)

### 7.5 Mensajes en orden incorrecto

WhatsApp puede recibir 2 mensajes con timestamps muy cercanos en orden invertido.

**Solución:** nodo `Wait` (1-2s) entre cada chunk del formateador.

### 7.6 El bot recibe el mismo mensaje 3-4 veces

- Casi siempre es el bug de `responseMode` (ver §7.2)
- Verificar también que no haya 2 webhooks registrados en YCloud apuntando al mismo path

### 7.7 Whisper devuelve transcripción incorrecta o vacía

- Verificar que el binary se está pasando correctamente (`outputPropertyName: data` en Download → `inputDataFieldName: data` en Transcribe)
- Verificar que `language: "es"` esté seteado
- Si el audio es muy corto (<1s), Whisper a veces devuelve cadena vacía
- Si el audio es muy largo (>25MB), Whisper rechaza

### 7.8 El nodo OpenAI no carga ("Install this node to use it")

`n8n-nodes-base.openAi` con typeVersion reciente puede no estar disponible en versiones antiguas de n8n self-hosted.

**Fix:** reemplazar por `HTTP Request` directo a `https://api.openai.com/v1/audio/transcriptions`. Configuración en [Cap 07 §6.4](07-variantes-canal.md).

---

## 8. Comando "REINICIAR" no funciona

**Síntomas posibles:**

- El bot sigue recordando todo después de "REINICIAR"
- Postgres y Redis no se vacían

**Diagnóstico:**

1. Verificar que el IF de "REINICIAR" matchea correctamente el texto (case-sensitive si aplica)
2. Verificar que `Vacia Redis` y `Delete Postgres historial` se ejecutaron (ver execution log)
3. Verificar que el `session_id` que usan coincide con el `session_id` que usa el AI Agent

**Fix común:** la `session_id` debe ser el mismo formato en todo el workflow. Si en una parte es `userPhone` (con `+`) y en otra es sin `+`, no matchea.

---

## 9. Si el bot deja de responder completamente

**Causas posibles:**

1. **Airtable "Chatbot Activado" en OFF para ese lead** — handoff activo. Verificar en Airtable y reactivar si es necesario.
2. **Credencial OpenAI expirada o sin saldo** — el AI Agent falla. Verificar en n8n > Credentials.
3. **Workflow desactivado** — verificar toggle Active en n8n.
4. **Error en el Webhook** — revisar n8n executions, buscar errores recientes.
5. **Postgres caído** — el AI Agent no puede escribir en memoria. Verificar conexión.
6. **Redis caído** — el batching falla. Verificar conexión.

**Plan de respuesta:**

1. Revisar n8n executions (failed executions en las últimas horas)
2. Verificar status de servicios (OpenAI status page, Postgres ping, Redis ping)
3. Verificar Airtable de leads afectados
4. Si nada obvio, ejecutar un test simple con un lead conocido

---

## 10. Crecimiento incontrolado del prompt

**Síntoma:** el prompt creció >10% desde la última versión sin razón aparente.

**Diagnóstico:**

```powershell
# Conteo actual
(Get-Content prompt.md | Out-String).Length

# Diff vs versión anterior
git diff HEAD~5 -- prompt.md
```

**Acciones:**

1. Identificar qué secciones crecieron
2. Si hay redundancias nuevas → consolidar
3. Si hay edge cases que no ocurren → quitar
4. Si hay instrucciones que se repiten → mover a una sola sección

**Regla:** si el prompt sigue creciendo después de cleanup, considerá si una sección debería ser un agente especializado nuevo (en lugar de inflar el principal).

---

## 11. Checklist de mantenimiento mensual

Una vez por mes, ejecutar este checklist sobre cada chatbot en producción:

- [ ] Revisar últimas 50 conversaciones — identificar 3-5 patrones de fallo
- [ ] Verificar que las métricas siguen dentro del target (conversión, latencia, abandono)
- [ ] Revisar conteo de caracteres de todos los prompts — alertar si >10% de crecimiento
- [ ] Verificar hash MD5 de prompts entre variantes (prod vs TEST vs TELEGRAM)
- [ ] Revisar logs de errores de n8n — buscar patterns recurrentes
- [ ] Verificar que el saldo de OpenAI es suficiente para el siguiente mes
- [ ] Verificar quality rating de WhatsApp (si aplica YCloud)
- [ ] Backup del workflow JSON exportado
- [ ] Backup de la base Postgres (si no está en servicio gestionado)

---

## 12. Cuándo escalar a reescritura completa

99% de los problemas se resuelven con cambios quirúrgicos. Pero hay 3 casos donde la reescritura completa es la respuesta correcta:

### 12.1 El negocio cambió fundamentalmente

Si el cliente pivota su producto o el público objetivo cambia significativamente, el prompt original deja de servir. Reescribir desde el discovery actualizado.

### 12.2 Acumulación de parches sin coherencia

Si el prompt ha tenido 50+ ediciones quirúrgicas y la consistencia interna se rompió (secciones que se contradicen, palabras del cliente anterior, edge cases obsoletos), considerar:

1. Hacer un dump de las reglas vigentes
2. Reescribir desde cero usando las plantillas del Cap 05
3. Versionar el viejo prompt como `v_legacy.md` por si hay regresiones

### 12.3 Cambio de modelo LLM

Si pasás de GPT-4o-mini a GPT-4o, lo que funcionaba como prompt corto puede beneficiarse de expansión, y viceversa. Vale la pena rehacer la estructura.

**Regla:** la reescritura debe planearse, no improvisarse. Si no hay un día completo dedicado a esto, mejor hacer cambios quirúrgicos.

---

**Siguiente:** [Capítulo 10 — Entrega al cliente y gobernanza](10-entrega-gobernanza.md)

**Anterior:** [Capítulo 08 — Casos de estudio](08-casos-estudio.md)
