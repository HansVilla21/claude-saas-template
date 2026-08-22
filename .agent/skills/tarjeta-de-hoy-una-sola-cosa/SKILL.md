---
name: tarjeta-de-hoy-una-sola-cosa
description: Usar cuando un proyecto tiene toda la estrategia lista pero el founder NO ejecuta — semanas sin avanzar, sistema completo y cero output. Reduce el proyecto a UN archivo con UNA tarjeta ejecutable hoy. Se dispara con "no sé por dónde empezar", "tengo todo pero no avanzo", "llevo semanas sin tocar esto", "necesito que sea más simple".
---

# Tarjeta de hoy — una sola cosa, cero decisiones

## Cuándo usar esta skill

- El proyecto tiene **estrategia, docs y herramientas de sobra** y **cero output real**. El síntoma clásico: se construyó un sistema entero, se documentó, y el entregable sigue en cero.
- El founder dice "no sé por dónde empezar", "tengo todo pero no avanzo", "llevo semanas sin tocar esto".
- Cada sesión arranca **releyendo** para reconstruir dónde iba. Eso ya es la señal.
- Aplica a cualquier output repetitivo con fricción de arranque: publicar contenido, escribir changelogs, hacer outbound, cerrar tickets, mandar reportes.

**NO usar** cuando el bloqueo es técnico (falta una API, un permiso, una decisión de arquitectura). Eso se desbloquea, no se simplifica.

## Por qué existe esta skill

Capturada el **2026-07-12** en un sistema de contenido que llevaba **~3 semanas sin producir una sola pieza**, a pesar de tener 17 skills, 6 agentes, 6 workflows y un knowledge base completo.

**El diagnóstico que importa:** el bloqueo NO era falta de estrategia ni de herramientas. Era **falta de claridad diaria**. Abrir el proyecto exigía decidir — qué tema, qué formato, qué skill invocar, qué pilar — y cada decisión es un punto donde el founder se cae. Con suficientes decisiones al inicio, el output real es cero, sin importar qué tan bueno sea el sistema.

**La inversión contraintuitiva:** más maquinaria empeoró el problema. La cura no fue agregar un agente que planificara mejor: fue **borrar decisiones**. El sistema pasó de 17 skills a 11 y de 6 agentes a 4, y todo lo demás quedó detrás de UN archivo con UNA tarjeta.

**La trampa a vigilar (riesgo #1):** que "trabajar en el sistema" reemplace a producir. Planear, documentar y refinar la estrategia se *sienten* productivos y no mueven el entregable. Si el founder pasa una sesión mejorando el sistema y otra vez no produjo, el sistema es el problema.

## Proceso

### 1. Diagnosticar antes de simplificar

Comprobar que es este problema y no otro:

- ¿Cuántas unidades de output real se produjeron en las últimas 2 semanas? Si es 0 con el sistema ya construido → es esto.
- ¿Cuántas decisiones tiene que tomar el founder entre abrir el proyecto y empezar a producir? Si son más de una → es esto.

### 2. Crear los dos archivos, en la raíz

Van **en la raíz**, no en `docs/`. Si hay que navegar para encontrarlos, no funcionan.

- **`HOY.md`** — UNA tarjeta. Lo único que hay que hacer hoy. Nada más.
- **`COLA.md`** — la fila de las próximas (3-5), el backlog crudo y el registro de las hechas con fecha.

### 3. Escribir la tarjeta como si el founder no tuviera contexto

La tarjeta debe ser ejecutable **sin abrir ningún otro archivo y sin decidir nada**. Reglas duras:

- **Cero decisiones dentro de la tarjeta.** Si dice "elegí uno de estos 3 ángulos", está mal escrita. Elegí vos y dejá los otros como nota al pie.
- **Todo lo copiable, ya escrito y pegable.** El texto final, no un brief para producirlo.
- **Lo que se necesita de afuera, listado explícito** ("necesitás 2 capturas: X e Y").
- **El paso 1 tiene que ser físico y chico.** Abrir la cámara, no "definir el enfoque".
- Link al artefacto largo (el guion completo, el doc detallado) como opcional, **nunca** como requisito para arrancar.

### 4. Definir el trigger de rotación en lenguaje natural

El founder no debería aprender un comando. Definí en `CLAUDE.md` las frases que rotan la tarjeta:

> Triggers ("listo", "hecho", "dame la siguiente"): mover la próxima de `COLA.md` → `HOY.md`, y registrar la hecha en "Hechas" con fecha.

### 5. Definir el umbral de reposición

> Si la cola baja de 2 tarjetas: generar nuevas desde el Backlog. Todas pasan el filtro de calidad del proyecto antes de entrar a la cola.

Reponer **antes** de que se vacíe. Una cola vacía devuelve al founder al problema original.

### 6. Poner la tarjeta en el arranque de sesión

En `CLAUDE.md`:

> Si el founder abre sesión sin pedir nada específico: recordale **en una línea** qué hay en `HOY.md`.

Una línea. Un resumen largo reintroduce la carga que esta skill vino a quitar.

### 7. Poner un gate de salida medible

El sistema no crece hasta que produzca. Escribilo como número, no como sensación:

> Gate: **6 unidades publicadas** (cualquier cadencia). Hasta cerrarlo, nada de features nuevas, integraciones ni automatizaciones.

Sin gate, la fase de "mejorar el sistema" se reabre sola y vuelve el problema.

## Output esperado

```
proyecto/
├── HOY.md      ← UNA tarjeta, ejecutable sin decidir nada
├── COLA.md     ← próximas (3-5) + backlog + hechas con fecha
└── CLAUDE.md   ← triggers de rotación, umbral de reposición, gate de salida
```

Estructura de `HOY.md`:

```markdown
# HOY — Tarjeta N

> Esto es lo ÚNICO que tenés que hacer hoy. Nada más.

## [Verbo + entregable concreto]

**Paso 1 (físico, chico):** …

**Lo que necesitás de afuera:**
- …

**[Contenido listo para copiar y pegar]**

---
📄 Detalle completo (opcional): `ruta/al/artefacto.md`
```

## Ejemplo

**Input:** sistema de contenido con 17 skills, 6 agentes, knowledge base completo, y 3 semanas con cero piezas publicadas.

**Output:** `HOY.md` con una sola tarjeta — el guion ya escrito, el caption listo para pegar, las 2 capturas de pantalla nombradas, y el reparto de cámara resuelto. Cero decisiones. Los otros 4 guiones en `COLA.md`. Skills podadas de 17 a 11 (archivadas, ver `archivar-en-vez-de-borrar`). Gate: 6 piezas publicadas antes de tocar nada más del sistema.

## Señales de que la skill se está aplicando mal

- La tarjeta tiene opciones o preguntas adentro → volvé al paso 3.
- El founder abre `HOY.md` y necesita otro archivo para arrancar → volvé al paso 3.
- La sesión termina con el sistema mejorado y el entregable igual → el gate del paso 7 no está puesto o no se está respetando.
- La cola llegó a cero y nadie repuso → el paso 5 no está en `CLAUDE.md`.

## Relacionadas

- `archivar-en-vez-de-borrar` — cómo podar la maquinaria sobrante sin perderla.
- `perfil-de-operador-del-founder` — cómo calibrar el tamaño de las respuestas al founder.
