# Skill: Creador de Skills

## Cuándo usar esta skill

- Cuando detectas que un mismo proceso se ha hecho >2 veces (regla del 3)
- Cuando el usuario pide algo que claramente debería estandarizarse
- Cuando un agente está improvisando un proceso que otro agente ya hizo antes

## Proceso

1. **Identificar el patrón.** ¿Qué pasos se repiten? ¿Qué inputs y outputs comparten?
2. **Definir el nombre.** kebab-case, máximo 4 palabras, descriptivo. Ejemplos: `analizar-viral`, `transcribir-reel`, `adaptar-guion`, `viralidad-relativa`.
3. **Crear la carpeta.** `.agent/skills/<nombre>/`
4. **Escribir SKILL.md** con el formato estándar (ver abajo).
5. **Registrar la skill** mencionándola en `CLAUDE.md` o en el agente que la usa más.
6. **Borrar duplicación.** Si había código/prompts repetidos en otros sitios, reemplazarlos por referencia a la skill.

## Output esperado

Un archivo `SKILL.md` con esta estructura exacta:

```markdown
# Skill: [Nombre]

## Cuándo usar esta skill
[Condiciones específicas que activan esta skill]

## Proceso
1. [Paso 1 con nombre claro]
2. [Paso 2 con nombre claro]
3. ...

## Output esperado
[Qué produce la skill, en qué formato, dónde se guarda]

## Ejemplo
**Input:**
[Ejemplo concreto]

**Output:**
[Resultado esperado]
```

## Ejemplo

**Input:**
"He visto que ya 3 veces hemos analizado un video viral siguiendo los mismos pasos: descargar audio → Whisper → Claude con el prompt de análisis → JSON estructurado."

**Output:**
Creo `.agent/skills/analizar-viral/SKILL.md` con esos 4 pasos, link al prompt en `templates/prompt-analisis-viral.md`, y schema JSON de salida.
