# Framework TIDD-EC — Para Classifiers y Guardrails

**Usar para:** Classifiers LLM, agentes con reglas estrictas de do/don't.

TIDD-EC es ideal cuando necesitas precision y limites claros — exactamente lo que un classifier necesita.

## Componentes

### T — Task (Tarea)
La tarea especifica en UNA oracion.

**Ejemplo:**
```
Clasificador del sistema Eva de Desarrollos Ecologicos. Analiza mensaje actual + historial para redirigir al agente correcto y extraer informacion del usuario.
```

### I — Instructions (Instrucciones)
Pasos especificos para completar la tarea.

**Ejemplo:**
```
1. Lee el mensaje actual y el historial completo
2. Determina el agente destino segun las reglas de routing
3. Extrae datos del usuario del mensaje e historial
4. Genera output JSON con agente_destino + informacion_extraida + razon
```

### D — Do (SI Hacer)
Comportamientos obligatorios.

**Ejemplo:**
```
- SI enviar al AGENTE_PRINCIPAL si el mensaje es ambiguo o generico
- SI extraer nombre, email, presupuesto cuando esten explicitos
- SI detectar idioma del usuario
- SI clasificar "hola" como AGENTE_PRINCIPAL
```

### D — Don't (NO Hacer)
Comportamientos prohibidos.

**Ejemplo:**
```
- NO inventar datos que no estan en el mensaje
- NO generar texto adicional fuera del JSON
- NO enviar a mas de un agente (elegir UNO)
- NO usar backticks ni markdown en el output
```

### E — Examples (Ejemplos)
Pares de input/output para calibrar.

**Ejemplo:**
```
Input: "Cuanto cuesta un apartamento?"
Output: {"agente_destino": "AGENTE_INVENTARIO", "razon": "consulta de precio"}

Input: "Hola, me interesa saber sobre el proyecto"
Output: {"agente_destino": "AGENTE_PRINCIPAL", "razon": "mensaje generico de interes"}
```

### C — Context (Contexto)
Informacion adicional para tomar mejores decisiones.

**Ejemplo:**
```
Destinos posibles: AGENTE_PRINCIPAL, AGENTE_INVENTARIO
Default si hay duda: AGENTE_PRINCIPAL
Token limit: 500
```

## Reglas Especificas para Classifiers

1. **Output JSON PURO** — sin ```json```, sin texto, sin backticks
2. **Max 3-4 destinos** — mas rutas = mas confusion
3. **Default SIEMPRE es agente principal** — si hay duda, va ahi
4. **Token limit minimo 500** — menos = JSON cortado
5. **Extraer SOLO datos explicitos** — no inferir
