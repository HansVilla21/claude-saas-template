---
name: perfil-de-operador-del-founder
description: Usar al arrancar un proyecto nuevo, o cuando el founder corta con frustración ("no es eso", "muy largo", "ya te adelantaste"). Documenta CÓMO trabaja el founder — tamaño de respuesta, ritmo, qué lo drena, cómo dar feedback — para que todos los agentes calibren igual. Se dispara con "inicializá el proyecto", "por qué seguís haciendo esto", "esto no es lo que pedí".
---

# Perfil de operador del founder — cómo responderle, no qué construir

## Cuándo usar esta skill

- **Al inicializar cualquier proyecto nuevo**, junto con `CLAUDE.md`. Es parte del setup, no un extra.
- Cuando el founder corta con tono frustrado: *"no es eso"*, *"muy largo"*, *"ya te adelantaste"*, *"eso no lo pedí"*. Eso es un patrón acumulado, no un error suelto.
- Cuando el mismo tipo de fricción se repite en proyectos distintos con el mismo founder.
- Cuando varios agentes del sistema responden con estilos incompatibles entre sí.

## Por qué existe esta skill

La mayoría de los `CLAUDE.md` documentan **qué** construye el proyecto: stack, arquitectura, convenciones. Casi ninguno documenta **cómo hay que responderle al humano que lo dirige**. Y esa es la fricción que más tiempo quema, porque es invisible y se repite en cada sesión.

**El patrón que se repite en la práctica:** un agente entrega una respuesta técnicamente correcta, larga y completa. El founder la lee a medias, se abruma y pide algo más chico. El agente lo achica, pero en la siguiente sesión vuelve a lo mismo — porque la corrección vivió en el chat, no en un archivo. La misma lección se re-aprende docenas de veces y nunca queda.

**El costo real:** cada corrección repetida es tiempo del founder gastado en gestionar al agente en vez de avanzar. Y algunas correcciones no son estilísticas — son **operativas**: un founder que se paraliza con respuestas largas no está pidiendo un formato, está pidiendo que el trabajo sea ejecutable.

**Regla madre:** una corrección de estilo o de ritmo que el founder hace **dos veces** no es una preferencia. Es una regla que falta en un archivo.

## Proceso

### 1. Crear el archivo en un lugar que los agentes lean

`memory/operator-profile.md` (o `knowledge/operator-profile.md`). Referenciarlo desde `CLAUDE.md` con una línea explícita:

> Antes de cualquier pedido ambiguo o cuando se detecten señales de overwhelm, leer `memory/operator-profile.md`.

Sin esa línea, el archivo existe y nadie lo abre.

### 2. Llenarlo por observación, no por entrevista

**No le preguntes al founder cómo le gusta trabajar** — casi nadie sabe describirlo bien, y las respuestas suenan a lo que uno cree que debería contestar. Sacalo de evidencia real:

- Correcciones que ya hizo, textuales.
- Momentos donde cortó o se frustró, y qué venía antes.
- Respuestas que sí funcionaron y por qué.
- Qué tareas hace con energía y cuáles pospone.

Citar **textual** cuando se pueda. `"no me des el documento entero, dame el pedazo"` enseña más que "prefiere respuestas concisas".

### 3. Cubrir las seis secciones que importan

Ver `plantilla-operator-profile.md` en esta carpeta. Las seis:

1. **Lo que quiere siempre** — tamaño de respuesta, ritmo, nivel técnico asumido.
2. **Lo que lo estresa (nunca hacer)** — en negativo y concreto.
3. **Flujo ideal de interacción** — el intercambio esperado, como diálogo.
4. **Qué lo energiza vs. qué lo drena** — predice qué delegar y qué no.
5. **Señales → respuesta** — tabla de "si el founder dice X, hacé Y".
6. **Formato de feedback preferido** — cómo entregar críticas.

### 4. Separar lo operativo de lo privado

**Regla dura.** El perfil de operador vive donde vive el código, y el código puede terminar en un repo público.

- **En el repo:** cómo responderle. Tamaño, ritmo, tono, señales, formato.
- **Fuera del repo** (vault personal, notas privadas): contexto clínico, salud, finanzas, familia, lo que sea identificable de terceros.

En el archivo del repo, dejá el puntero sin el contenido:

> Contexto personal y clínico no se documenta acá — vive en [fuente privada]. Este proyecto puede ir a git.

### 5. Convertir cada fricción nueva en una línea

Cuando el founder corrija algo por segunda vez: pará, agregalo al perfil, seguí. La corrección se escribe **en el momento**, no al final de la sesión — al final ya se perdió el textual.

### 6. Revisarlo cuando cambie el modo de trabajo

El perfil envejece. Un founder que arrancó pidiendo detalle puede pasar a querer solo el resultado cuando gana confianza en el sistema. Si una regla del perfil ya no se cumple en la práctica, corregila en vez de dejarla podrir.

## Output esperado

`memory/operator-profile.md` con las 6 secciones, citas textuales del founder donde las haya, y una línea en `CLAUDE.md` que ordene leerlo. Plantilla vacía lista para copiar en `plantilla-operator-profile.md`.

## Ejemplo

**Input:** tercer proyecto con el mismo founder; en los tres, la fricción es idéntica — respuestas largas que lo paralizan y agentes que resuelven el problema completo cuando él solo estaba dando contexto.

**Output:** dos reglas que matan el 80% de la fricción, escritas donde los agentes las leen:

> **Esperar instrucciones explícitas.** Si el founder da contexto, confirmar entendimiento o preguntar qué necesita — NO generar la solución completa sin que la pida.
>
> **Ante la duda entre simple o completo: simple.** El founder corrige hacia simple casi siempre.

## Relacionadas

- `tarjeta-de-hoy-una-sola-cosa` — cuando el problema no es el tamaño de las respuestas sino la fricción de arrancar.
- `creador-de-skills` — cuando la corrección recurrente es de proceso y no de trato.
