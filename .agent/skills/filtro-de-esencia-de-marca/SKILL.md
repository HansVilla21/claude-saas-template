---
name: filtro-de-esencia-de-marca
description: Usar ANTES de publicar cualquier cosa de cara al público — copy, contenido, feature anunciada, campaña, respuesta de un bot. Verifica que la pieza se rastrea al posicionamiento y no se subió a un tema solo porque estaba de moda. Se dispara con "aprovechemos esta tendencia", "todos están hablando de X", "sumemos esta feature", "publicá esto".
---

# Filtro de esencia — el gate que evita hablar de cualquier cosa

## Cuándo usar esta skill

- **Antes de publicar cualquier cosa de cara al público**: copy de landing, contenido, anuncio de feature, campaña, mensajes de un bot.
- Cuando aparece la frase *"aprovechemos esta tendencia"*, *"todos están hablando de X"*, *"deberíamos sumar esta feature"*.
- Al armar un plan o calendario: el filtro corre **al entrar** al plan, no al momento de publicar. Filtrar tarde ya desperdició el trabajo.
- Cuando el proyecto empieza a sonar igual que sus competidores y nadie sabe explicar por qué.

## Por qué existe esta skill

Los temas de moda tienen una atracción real: prometen alcance barato y llegan ya con demanda. El problema es que **el alcance que traen es de gente que no es tu cliente**, y la audiencia que acumulás te obliga después a seguir alimentándola con más de lo mismo.

**El mecanismo del daño es acumulativo, no puntual.** Ninguna pieza fuera de eje hace daño sola. Diez sí: para ese momento nadie puede terminar la frase *"esta marca es la de \_\_\_"*, y la marca dejó de ser una respuesta a una pregunta para volverse un feed. En producto pasa igual — un roadmap que persigue lo que hace la competencia produce un SaaS sin foso.

**Lo que hace útil al filtro:** no prohíbe las tendencias. Prohíbe las tendencias **sin traducir**. El movimiento correcto casi nunca es "no hablemos de esto" — es "hablemos de esto **desde nuestro ángulo**". Una tendencia traducida al foso propio suma; la misma tendencia copiada tal cual, resta.

## Proceso

### 1. Tener el eje escrito antes de necesitar el filtro

El filtro no se puede aplicar de memoria ni por intuición. Necesita tres archivos existentes y cortos:

- **`positioning.md`** — a quién le servís, qué hacés distinto, contra qué te posicionás.
- **`voice-rules.md`** — cómo suena la marca. Qué SÍ y qué NO, con ejemplos.
- **`pillars.md`** — los 3-5 territorios legítimos, con la mezcla esperada.

Si no existen, esto se detiene acá: no hay filtro posible sin eje. Escribirlos primero.

### 2. Correr las cuatro preguntas

Toda pieza tiene que pasar las cuatro. Una sola que falle, se reescribe o se descarta.

1. **¿A qué pilar responde?** Si no calza en ninguno, no es tema de la marca — por más que esté funcionando para otros.
2. **¿Se rastrea al posicionamiento?** ¿Refuerza el ángulo propio, o solo repite lo que dice todo el nicho?
3. **¿Suena a la marca?** Contra `voice-rules.md`, sección "qué NO".
4. **¿Lo podría haber publicado cualquier competidor?** Si la respuesta es sí, está mal enfocado. Reescribir hasta que solo pueda venir de este proyecto.

> La pregunta 4 es la que más piezas mata, y es la más valiosa. Es la prueba de foso.

### 3. Traducir en vez de descartar

Cuando una tendencia falla el filtro, el default no es tirarla — es traducirla:

> **Tendencia cruda:** "todos están haciendo contenido sobre [herramienta nueva]"
> **Traducida:** "qué pasa cuando metés [herramienta nueva] en [el problema específico que resolvés], y por qué la mayoría lo va a hacer mal"

Se conserva la demanda del tema y se le agrega el ángulo propio. Si una tendencia **no se puede traducir** al eje, ahí sí se descarta — y esa es la señal de que estaba fuera de la marca.

### 4. Escribir la decisión, no solo tomarla

Cuando se descarta algo con demanda evidente, dejalo anotado en el log de decisiones: qué se descartó, por qué, y **bajo qué condición se reevaluaría**.

> Descartado: mecánica de comment-gate. Razón: funciona con audiencia grande y automatización de DMs; con audiencia en construcción se lee forzado. Reevaluar cuando lleguen pedidos orgánicos del recurso en comentarios.

Sin esto, la misma discusión se reabre cada mes y se resuelve distinto según el ánimo.

### 5. Ponerlo donde se ejecuta, no en un doc de estrategia

En `CLAUDE.md`, como regla dura:

> Antes de crear cualquier contenido, leer `positioning.md`, `voice-rules.md` y `pillars.md`.
> Cada pieza se rastrea a un pilar y a un objetivo. Si la podría haber publicado cualquier competidor, se reescribe.

Un filtro que vive en un doc de estrategia que nadie abre no filtra nada.

## Output esperado

Un gate de 4 preguntas corriendo antes de publicar, más:

- `positioning.md`, `voice-rules.md`, `pillars.md` escritos y cortos
- la regla en `CLAUDE.md`
- un log de decisiones con lo descartado, su razón y su condición de reevaluación

## Ejemplo

**Input:** un tema de IA está explotando y no tiene relación directa con lo que hace el producto. Todo el nicho está publicando sobre eso.

**Aplicando el filtro:** pilar → ninguno. Posicionamiento → no lo refuerza. ¿Lo podría publicar cualquier competidor? → sí, textual.

**Output:** no se descarta el tema, se traduce. En vez de sumarse a explicar la novedad (lo que hacen todos), la pieza muestra **el sistema propio ya funcionando** y usa la novedad como marco. Mismo tema de moda, único ángulo que solo puede venir de este proyecto. Decisión anotada.

## Relacionadas

- `arrancar-angosto-antes-de-ensanchar` — cómo elegir el eje cuando el negocio es amplio.
- `matar-el-olor-a-ia` — el otro gate previo a publicar: que no suene a máquina.
- `ui-distintiva-no-ai-default` — el mismo principio aplicado a diseño.
