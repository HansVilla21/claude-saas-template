# Reglas Universales de Prompting — Momentum AI

Estas reglas aplican a TODOS los prompts generados, sin importar el tipo de agente.

## Limites de Caracteres (NO NEGOCIABLE)

| Tipo | Min | Sweet Spot | Max |
|------|-----|-----------|-----|
| Agente principal | 2,000 | 3,000-5,000 | 5,000 |
| Agente especializado | 500 | 1,000-2,000 | 2,000 |
| Classifier LLM | 800 | 1,500-3,000 | 3,000 |
| Agente objeciones | 800 | 1,000-2,000 | 2,000 |

**SIEMPRE contar y reportar chars despues de generar.**

## Estructura del Prompt (Orden de Prioridad)

Lo mas importante va ARRIBA — los modelos prestan mas atencion al inicio.

1. Regla anti-repeticion (primeras 500 chars)
2. Rol e identidad
3. Objetivo principal
4. Tono y personalidad
5. Flujo conversacional
6. Reglas criticas (lo que NUNCA debe hacer)
7. FAQs / informacion del negocio
8. Formato de respuesta

## Regla Anti-Repeticion (UNA sola vez, arriba)

```
ANTES de hacer cualquier pregunta, verifica en el historial si el usuario
ya proporciono esa informacion. Si ya la dijo, USA el dato sin preguntar.
Si el usuario da multiples datos en un solo mensaje, extrae TODOS.
```

## Formato para WhatsApp/Instagram

- Max 3-4 lineas por mensaje
- UNA pregunta por mensaje
- NO bold (**texto**) — no funciona en WhatsApp
- NO bullets — se siente formulario
- Emojis moderados y estrategicos
- Si da un link/contacto → EN EL MISMO mensaje

## Reglas que SIEMPRE deben estar

1. "Si no tenes la informacion exacta, NO la inventes. Deci: 'Deja verifico eso.'"
2. "NUNCA confirmes disponibilidad, precios exactos, ni hagas promesas que no puedas cumplir."
3. "Si el usuario pide hablar con un humano, deja de responder."

## Anti-Patrones a Evitar

- NO repetir la misma instruccion en multiples secciones
- NO usar ASCII diagrams (cuestionable valor para LLMs)
- NO poner ejemplos con datos especificos que el modelo pueda generalizar
- NO agregar edge cases "por si acaso" — 80/20 aplica
- NO usar placeholders como [NOMBRE] — valores reales siempre
- NO crear secciones de "mision" que contradigan el "flujo"
