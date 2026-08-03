# TROUBLESHOOTING Y OPTIMIZACIÓN
## Problemas comunes, soluciones probadas y playbook de mejora continua

---

# 1. DIAGNÓSTICO RÁPIDO DE PROBLEMAS

## 1.1 Síntoma → Causa → Solución

### Bot responde cosas que no debería
```yaml
Causa probable: GPT-4o-mini con prompt >3k caracteres
Diagnóstico: ¿Cuántos chars tiene el prompt? ¿Qué modelo usa?
Solución inmediata: Cambiar a GPT-4o (resuelve ~80% de casos)
Solución estructural: Reducir prompt y/o dividir en agentes especializados
```

### Bot olvida información ya proporcionada
```yaml
Causa probable: 
  1. Window Buffer Memory insuficiente (< 10 mensajes)
  2. GPT-4o-mini pierde contexto en conversaciones largas
  3. Prompt no instruye "nunca re-preguntar datos ya proporcionados"
Solución: 
  1. Subir Window Buffer a 10-15 mensajes
  2. Cambiar a GPT-4o
  3. Agregar regla explícita anti-repetición (UNA VEZ, no repetida)
```

### Bot repite preguntas
```yaml
Causa probable:
  1. Memory no persiste entre turnos
  2. Classifier no extrae datos del historial
  3. Prompt tiene instrucciones repetidas que confunden al modelo
Solución:
  1. Verificar que Window Buffer está correctamente conectado
  2. Agregar extracción de datos en classifier
  3. Consolidar instrucciones anti-repetición en 1 solo lugar del prompt
```

### Bot da información incorrecta / inventa datos
```yaml
Causa probable:
  1. Sin regla explícita de "no inventar"
  2. Prompt da ejemplos con datos específicos que el modelo generaliza
  3. Sin RAG para información factual
Solución:
  1. Agregar: "Si no tenés la información exacta, NO la inventes. Decí: 'Dejá verifico eso.'"
  2. Remover ejemplos con precios/datos específicos del prompt
  3. Implementar RAG con datos reales
```

### Classifier devuelve JSON vacío o cortado
```yaml
Causa probable: Token limit del LLM muy bajo
Solución: Subir max_tokens a 500-1000 en el nodo del classifier
Verificar: El output debe ser JSON puro sin ```json``` ni texto adicional
```

### Bot no sigue el flujo esperado
```yaml
Causa probable:
  1. Prompt demasiado largo → modelo pierde instrucciones tempranas
  2. Instrucciones contradictorias en diferentes secciones
  3. Demasiados edge cases confunden al modelo
Solución:
  1. Reducir prompt, eliminar redundancias
  2. Revisar consistencia entre secciones
  3. Quitar edge cases que nunca ocurren (el 80/20 aplica)
```

### Latencia alta (>5 segundos)
```yaml
Causa probable:
  1. Prompt muy largo → más tokens → más tiempo
  2. GPT-4o es más lento que mini
  3. RAG query + LLM response = doble latencia
  4. Múltiples herramientas conectadas al agente
Solución:
  1. Reducir prompt
  2. Aceptar el trade-off o optimizar prompt para usar mini
  3. Cachear respuestas RAG frecuentes (Redis TTL 1h)
  4. Minimizar tools conectadas
```

---

# 2. CHECKLIST PRE-DEPLOY

## Antes de poner en producción SIEMPRE verificar:

### Prompts
- [ ] ¿Ningún prompt supera 5k caracteres?
- [ ] ¿El agente principal maneja 70%+ del tráfico esperado?
- [ ] ¿Los especialistas tienen UN solo propósito cada uno?
- [ ] ¿Las instrucciones no se repiten innecesariamente?
- [ ] ¿Hay regla anti-invención de datos?
- [ ] ¿El formato es apropiado para el canal (sin bold en WhatsApp)?
- [ ] ¿El tono es consistente y apropiado?
- [ ] ¿BANT se captura conversacionalmente, no como interrogatorio?
- [ ] ¿Se da valor antes de pedir datos de contacto?
- [ ] ¿Las variables dinámicas (fecha, nombre) están correctas?

### Arquitectura
- [ ] ¿El classifier evita LLM calls innecesarias?
- [ ] ¿El response formatter es código, no LLM?
- [ ] ¿PostgreSQL/Supabase trackea estado de conversación?
- [ ] ¿La latencia total es <3 segundos?
- [ ] ¿Hay fallback si el LLM no responde?

### Negocio
- [ ] ¿El bot NUNCA hace compromisos vinculantes (precios, disponibilidad)?
- [ ] ¿Los links están correctos y funcionan?
- [ ] ¿Las notificaciones llegan al equipo correcto?
- [ ] ¿El handoff a humano funciona?
- [ ] ¿Hay métricas de tracking definidas?

### Testing
- [ ] ¿Se testearon 20+ conversaciones simuladas?
- [ ] ¿Se cubrieron los 3 flujos principales?
- [ ] ¿Se probaron las objeciones comunes?
- [ ] ¿Se verificó qué pasa con mensajes inesperados?
- [ ] ¿Se probó en el canal real (no solo en n8n)?

**Si alguno es NO → No está listo para producción.**

---

# 3. PLAYBOOK DE OPTIMIZACIÓN POST-LAUNCH

## Semana 1: Monitoreo Intensivo

```yaml
Revisar diariamente:
  - Conversaciones completas (leer las primeras 20-30)
  - Tasa de abandono por fase del flujo
  - Mensajes donde el bot falló (no entendió, inventó, repitió)
  - Tiempo promedio de respuesta
  - Leads calificados vs total de conversaciones

Ajustar:
  - Keywords del classifier que no matchean
  - Respuestas a preguntas frecuentes no cubiertas
  - Tono si feedback del cliente lo requiere
```

## Semana 2-4: Iteración Basada en Data

```yaml
Analizar:
  - ¿Dónde abandonan más? → Optimizar ese punto del flujo
  - ¿Qué preguntas no puede responder? → Agregar al prompt o RAG
  - ¿Qué objeciones nuevas aparecen? → Agregar a LAARC
  - ¿El BANT se está capturando naturalmente? → Ajustar preguntas

Cambios quirúrgicos:
  - NUNCA reescribir todo el prompt
  - Cambiar UN aspecto a la vez
  - Medir impacto antes del siguiente cambio
  - Documentar cada cambio y su efecto
```

## Mes 2+: A/B Testing

```yaml
Variables para testear:
  - Mensaje de bienvenida (formal vs casual)
  - Orden de preguntas BANT
  - Momento de presentar CTA
  - Longitud de respuestas
  - Con emojis vs sin emojis

Método:
  1. Baseline: 100 conversaciones con versión actual
  2. Hipótesis: "Cambiar X mejorará Y en Z%"
  3. Split: 50/50 tráfico
  4. Medir: Statistical significance (p < 0.05)
  5. Implementar: Roll out ganador
```

---

# 4. MÉTRICAS DASHBOARD (SQL QUERIES)

## Conversaciones por día
```sql
SELECT DATE(created_at), COUNT(*) as total_chats
FROM chat_analytics 
WHERE message_direction = 'in'
GROUP BY DATE(created_at)
ORDER BY DATE(created_at) DESC;
```

## Tasa de calificación
```sql
SELECT 
  COUNT(*) as total_leads,
  COUNT(CASE WHEN bant_score >= 3 THEN 1 END) as qualified,
  ROUND(COUNT(CASE WHEN bant_score >= 3 THEN 1 END)::numeric / COUNT(*)::numeric * 100, 1) as qualification_rate
FROM conversation_state
WHERE created_at > NOW() - INTERVAL '30 days';
```

## Agente más usado
```sql
SELECT agent_used, COUNT(*) as usage_count,
  ROUND(AVG(response_time_ms)) as avg_response_ms,
  ROUND(AVG(tokens_used)) as avg_tokens
FROM chat_analytics
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY agent_used
ORDER BY usage_count DESC;
```

## Tasa de abandono por stage
```sql
SELECT conversation_stage, COUNT(*) as stuck_here,
  ROUND(COUNT(*)::numeric / (SELECT COUNT(*) FROM conversation_state WHERE created_at > NOW() - INTERVAL '30 days')::numeric * 100, 1) as pct
FROM conversation_state
WHERE updated_at < NOW() - INTERVAL '24 hours'
  AND created_at > NOW() - INTERVAL '30 days'
GROUP BY conversation_stage
ORDER BY stuck_here DESC;
```

---

# 5. PROMPT DEBUGGING METHODOLOGY

## Cuando un prompt no funciona como esperado:

### Paso 1: Identificar el problema específico
```
¿QUÉ hace mal exactamente?
  - ¿Inventa información? → Regla anti-invención
  - ¿Repite preguntas? → Memory issue
  - ¿Ignora instrucciones? → Prompt demasiado largo o modelo inadecuado
  - ¿Tono incorrecto? → Sección de personalidad
  - ¿Flujo roto? → Instrucciones de flujo contradictorias
```

### Paso 2: Localizar en el prompt
```
Buscar la sección responsable:
  - ¿Existe la instrucción que debería prevenir esto?
  - ¿Está en conflicto con otra instrucción?
  - ¿Está demasiado lejos del inicio? (modelos olvidan instrucciones al final)
```

### Paso 3: Fix quirúrgico
```
Hacer UN cambio a la vez:
  - Mover instrucción crítica más arriba en el prompt
  - Eliminar instrucción contradictoria
  - Agregar ejemplo específico del comportamiento esperado
  - Reducir longitud total si >5k chars
```

### Paso 4: Testear
```
Probar con 5 conversaciones que previamente fallaban:
  - ¿Se resolvió el problema?
  - ¿Se creó un problema nuevo?
  - ¿El conteo de caracteres sigue dentro del límite?
```

### Paso 5: Documentar
```
Registrar:
  - Qué se cambió
  - Por qué se cambió
  - Resultado del cambio
  - Nuevo conteo de caracteres
```

---

# 6. PATRONES ANTI-REPETICIÓN CONSOLIDADOS

## INCORRECTO (Lo que muchos hacen):
```
Repetir "NO repitas preguntas" 5 veces en el prompt en diferentes secciones.
Resultado: Desperdicio de tokens + confusión del modelo.
```

## CORRECTO (Una sola regla clara):
```markdown
# REGLA DE NO REPETICIÓN (CRÍTICA)
ANTES de hacer cualquier pregunta, verifica en el historial si el usuario 
ya proporcionó esa información. Si ya la dijo, USA el dato sin preguntar.

Datos a verificar: nombre, email, teléfono, ubicación, presupuesto, 
producto/servicio de interés, timeline.

Si el usuario da múltiples datos en un solo mensaje → extrae TODOS, 
no preguntes uno por uno.
```

**Ubicación en el prompt: ARRIBA, en las primeras 500 chars.**
