# Metodologia de Debugging de Prompts

Fuente: `knowledge/05_TROUBLESHOOTING_Y_OPTIMIZACION.md` seccion 5

## Diagnostico Rapido: Sintoma → Causa → Solucion

### Bot responde cosas que no deberia
- **Causa:** GPT-4o-mini con prompt >3k chars
- **Fix inmediato:** Cambiar a GPT-4o (resuelve ~80%)
- **Fix estructural:** Reducir prompt y/o dividir en agentes

### Bot olvida informacion ya proporcionada
- **Causa:** Window Buffer <10 msgs, o mini pierde contexto
- **Fix:** Subir buffer a 10-15, cambiar a GPT-4o, agregar regla anti-repeticion

### Bot repite preguntas
- **Causa:** Memory no persiste, classifier no extrae datos, instrucciones repetidas
- **Fix:** Verificar buffer, agregar extraccion al classifier, consolidar anti-repeticion

### Bot inventa datos
- **Causa:** Sin regla anti-invencion, ejemplos con datos especificos
- **Fix:** Agregar "Si no tenes la info, NO la inventes", quitar ejemplos con datos reales

### Classifier devuelve JSON vacio/cortado
- **Causa:** Token limit muy bajo
- **Fix:** Subir max_tokens a 500-1000

### Bot no sigue el flujo
- **Causa:** Prompt largo, instrucciones contradictorias, demasiados edge cases
- **Fix:** Reducir, revisar consistencia, quitar edge cases raros

### Latencia alta (>5s)
- **Causa:** Prompt largo, GPT-4o mas lento, RAG + LLM, muchas tools
- **Fix:** Reducir prompt, cachear RAG con Redis, minimizar tools

## Proceso de Fix

1. **Identificar** — que hace mal exactamente (no "no funciona bien")
2. **Localizar** — cual seccion del prompt es responsable
3. **Fix quirurgico** — UN cambio: mover, eliminar, o agregar
4. **Testear** — 5 conversaciones que antes fallaban
5. **Documentar** — que cambio, por que, resultado, nuevo conteo chars
