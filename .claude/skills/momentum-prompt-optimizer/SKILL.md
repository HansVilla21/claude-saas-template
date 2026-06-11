---
name: momentum-prompt-optimizer
description: Analiza y optimiza prompts existentes de chatbots con cambios quirurgicos, sin reescribir desde cero. Usa cuando un prompt no funciona bien, tiene redundancias, es demasiado largo, necesita mejoras, o cuando el usuario dice "optimizar prompt", "mejorar prompt", "el bot no funciona bien", "el bot se pierde".
---

# Momentum Prompt Optimizer — Cambios Quirurgicos

## Evaluacion Inicial

- **Contexto:** Obtener el prompt actual completo (copiar-pegar o ruta del archivo)
- **Estado:** Que esta fallando? Sintomas especificos
- **Objetivo:** Mejorar sin destruir lo que ya funciona

## Principios Core

1. **NUNCA reescribir desde cero** — si funciona al 70%, arreglar el 30%
2. **UN cambio a la vez** — no mezclar multiples fixes
3. **Medir antes y despues** — conteo de chars, problema resuelto si/no
4. **Cambios reversibles** — poder volver atras si empeora

## Proceso

### Paso 1: Diagnostico

Lee `references/debugging-methodology.md` y aplica:

**Que hace mal EXACTAMENTE?**
- Inventa informacion → agregar regla anti-invencion
- Repite preguntas → verificar memory + agregar anti-repeticion
- Ignora instrucciones → prompt demasiado largo o modelo inadecuado
- Tono incorrecto → revisar seccion de personalidad
- Flujo roto → instrucciones contradictorias
- Respuestas largas → agregar limite explicito

### Paso 2: Analisis del Prompt

Reportar:
```
Conteo de caracteres: XXXX
Modelo actual: GPT-4o / GPT-4o-mini
Instrucciones repetidas: SI/NO (cuantas)
Redundancias detectadas: [lista]
Contradicciones: [lista]
Edge cases innecesarios: [lista]
Formato correcto para canal: SI/NO
Regla anti-repeticion presente: SI/NO (ubicacion)
```

### Paso 3: Proponer Cambios Quirurgicos

Para cada cambio propuesto:
- **Que:** Descripcion del cambio
- **Por que:** Problema que resuelve
- **Donde:** Ubicacion exacta en el prompt
- **Impacto en chars:** +/- cuantos caracteres

### Paso 4: Aplicar y Verificar

1. Aplicar UN cambio
2. Contar caracteres nuevos
3. Verificar que no se creo un problema nuevo
4. Repetir con siguiente cambio

### Paso 5: Reporte Final

```
ANTES: XXXX caracteres
DESPUES: XXXX caracteres
CAMBIO: +/- XX chars (+/-X%)
CAMBIOS REALIZADOS:
1. [cambio] — [razon]
2. [cambio] — [razon]
PROBLEMAS RESUELTOS: [lista]
VERIFICAR EN TESTING: [que probar]
```

## Edge Cases

- **Prompt ya esta en el limite** (5k chars): Buscar redundancias, eliminar edge cases, consolidar instrucciones
- **El problema es el modelo, no el prompt**: Si prompt >3k con GPT-4o-mini → recomendar GPT-4o
- **Prompt funciona pero es caro**: Intentar reducir chars manteniendo calidad, considerar mini

## Errores Comunes

- **Problema:** Reescribir todo "para dejarlo mejor"
  **Solucion:** Cambios quirurgicos. Si funciona, no tocar.

- **Problema:** Agregar instrucciones sin quitar las redundantes
  **Solucion:** Cada instruccion nueva debe reemplazar o consolidar una existente.

## Skills Relacionados

- `/momentum-prompt-gen` — para crear prompts desde cero
- `@prompt-reviewer` — para revision automatica contra la metodologia
