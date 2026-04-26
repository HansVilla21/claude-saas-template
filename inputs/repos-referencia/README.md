# Repos de referencia

Esta carpeta guarda los repositorios externos que el usuario va pasando para inspirar/extender capacidades de Hookly.

## Cómo agregar un repo

1. Clonar (o descomprimir) el repo en una subcarpeta: `inputs/repos-referencia/<nombre-corto>/`
2. Crear dentro un `README.md` con:
   - **Origen:** URL del repo
   - **Qué aporta:** qué problema resuelve o qué patrón demuestra
   - **Patrones extraíbles:** código, prompts, arquitecturas que valen la pena adoptar
   - **Licencia:** verificar antes de copiar código

## Convenciones

- Nunca subir el repo entero a git de Hookly (queda en `.gitignore` si es muy grande, o sin git history para ahorrar peso)
- Si extraemos un patrón, documentar en `memory/learnings.md` qué se aprendió
- Si un repo se vuelve obsoleto, moverlo a `inputs/repos-referencia/_archivo/`
