# Patrones de Arquitectura — Clientes Reales

Fuente: `knowledge/02_CASOS_CLIENTES_COMPLETOS.md`

## Patron 1: Agente Unico + RAG (Jaco Dream Rentals)

**Cuando usar:** Negocio simple con catalogo de productos/propiedades. No necesita calificacion compleja.

```yaml
Classifier → Property Agent unico → Formatter
Tools: RAG con informacion de productos
Modelo: GPT-4o-mini (funciona por ser agente unico)
Multiidioma: detectado por classifier
```

**Clave:** Funciona cuando hay UN flujo principal (mostrar producto → guiar a accion).

## Patron 2: Multi-Agente con Calificacion (El Canal)

**Cuando usar:** Real estate, B2B, tickets altos. Necesita BANT y derivacion a vendedores.

```yaml
Classifier LLM (extrae 10 campos) → Eva Principal (80%) / Agente Inventario (20%)
Round-robin por hora para asignar vendedor
Descalificacion elegante si presupuesto < minimo
```

**Clave:** Classifier LLM porque necesita extraer datos estructurados. Maximo 2-3 rutas.

## Patron 3: Agente + Objeciones LAARC (Dr. Carlos)

**Cuando usar:** Servicios de salud, tickets medios-altos, objeciones frecuentes.

```yaml
Classifier → Dr. Carlos (principal) / Agente Objeciones (LAARC) / Handoff
Scoring 0-5 para calificacion
Contenido educativo solo para awareness bajo (1-2)
```

**Clave:** El agente de objeciones es separado del principal para mantener prompts cortos.

## Patron 4: Agente Ultra-Simple (Grandit)

**Cuando usar:** Formularios, microfinanzas, UN solo CTA.

```yaml
Agente unico → enviar formulario inmediatamente
Sin classifier, sin agentes especializados
~3,200 chars
```

**Clave:** La optimizacion mas poderosa fue QUITAR pasos. No pedir datos que el formulario ya captura.

## Patron 5: Reactivo + Proactivo (Level/LEO)

**Cuando usar:** Consulting, asesoria, reactivacion de leads dormidos.

```yaml
REACTIVO: Lead escribe → LEO califica → agenda → notifica
PROACTIVO: CRM segmenta → template Meta → si responde → LEO activo
Canal: YCloud (App Coexistence, broadcasts nativos)
```

**Clave:** Dos workflows separados. El proactivo segmenta en tibios (CTA directo) vs frios (valor primero).

## Patron 6: Instagram con ManyChat (Dr. Carlos)

**Cuando usar:** Instagram DM como canal principal.

```yaml
ManyChat (recibe DM) → Webhook n8n → Procesa AI → Response a ManyChat
Particularidad: CTAs de ManyChat deben ignorarse ("SILENCIO", etc.)
```

**Clave:** ManyChat maneja el canal, n8n maneja la logica. CTAs de apertura no son mensajes reales.

## Regla de Seleccion de Patron

```
Si flujo ultra-simple (1 CTA) → Patron 4
Si producto/catalogo sin calificacion → Patron 1
Si ticket alto + calificacion BANT → Patron 2
Si objeciones frecuentes + scoring → Patron 3
Si necesita proactivo/reactivacion → Patron 5
Si canal es Instagram → Patron 6 (combinable con otros)
```
