---
name: matar-el-olor-a-ia
description: Usar ANTES de publicar cualquier texto de cara al usuario generado o asistido por IA — landing, email, changelog, mensaje de bot, post, documentación. Detecta las señales de "esto lo escribió una máquina" y las elimina sin cambiar lo que el texto afirma. Se dispara con "esto suena a IA", "humanizá esto", "quitale el olor a ChatGPT", "no suena a nosotros".
---

# Matar el olor a IA — texto que no delata a la máquina

## Cuándo usar esta skill

- **Antes de publicar cualquier texto de cara al usuario** que se generó o asistió con IA: copy de landing, hero, emails transaccionales y de marketing, changelogs, mensajes de un bot, posts, documentación pública.
- Cuando alguien dice *"esto suena a IA"*, *"no suena a nosotros"*, *"muy corporativo"*.
- Es el **último paso** antes de publicar, no el primero. Si el texto además tiene problemas de estructura o de argumento, eso se arregla antes con `copywriting` — esta skill solo caza los tells.

**Caso especial crítico:** los mensajes de un **bot conversacional**. Ahí el olor a IA no es un problema de estilo, es un problema de producto — delata al bot y el usuario deja de responder. Ver también `feedback-prompting.md` (puntuación humana en WhatsApp).

## Por qué existe esta skill

El texto generado por IA es competente y **reconocible**. Interpola el promedio de millones de textos, y ese promedio tiene huellas dactilares muy estables: las mismas frases de arranque, el mismo ritmo parejo, la misma simetría de tres puntos, los mismos adjetivos sin sustancia.

**Por qué se cuela igual:** el texto se lee *bien*. No tiene errores. Nada salta al revisarlo rápido. Lo que falla no es ninguna oración en particular — es el **patrón**, y el patrón solo se ve si lo buscás a propósito con una lista.

**Por qué importa más de lo que parece:** en 2026 el lector promedio ya reconoce el molde, aunque no sepa nombrarlo. Un texto con olor a IA no se percibe como neutro: se percibe como **desatendido**. Y en un mensaje de bot, directamente rompe la conversación.

**Regla madre:** humanizar **no** es cambiar lo que el texto dice. Si al reescribir se movió el claim, se agregó un dato o se suavizó una promesa, se falló. Se cambia la textura, no el contenido.

## Proceso

### 1. Conseguir una muestra de voz real

Antes de reescribir, buscá 1-2 textos reales escritos por un humano del proyecto (emails del founder, mensajes a clientes, posts viejos). Sin esa referencia, la reescritura cae en otro promedio — más informal, pero igual de genérico.

Si no existe muestra, decilo explícitamente en el output en vez de inventar una voz.

### 2. DETECTAR — pasar el texto por el catálogo y marcar cada hallazgo

**Frases plantilla de arranque y cierre**
> "en el mundo actual", "hoy en día", "en la era digital", "imagina un mundo donde", "ya sea que…", "en resumen", "en conclusión", "espero que te sirva"

**Vocabulario de modelo usado como relleno**
> "potencia", "desbloquea", "revoluciona", "transforma", "aprovecha", "robusto", "escalable", "innovador", "fluido / seamless", "llevá tu X al siguiente nivel"

**Paralelismo negativo — bandera dura, tolerancia cero**
> "no se trata de X, sino de Y" · "esto no es solo X, es Y" · "no es magia, es método"
>
> Es el tell #1 y aparece en casi todo texto generado. Eliminar **todas** sus formas.

**Ritmo parejo (falta de burstiness)**
> Todas las oraciones de largo parecido (15-22 palabras), misma estructura, cero fragmentos. Un humano escribe irregular: una oración larga, después tres palabras.

**Simetría mecánica**
> Intro de calentamiento + exactamente 3 puntos del mismo tamaño + cierre que resume lo ya dicho. La regla de tres perfecta es tell, no virtud.

**Adjetivos en lista sin sustancia**
> "potente, escalable e innovador" — tres adjetivos que no se pueden verificar ni refutar.

**Puntuación de máquina** (crítico en bots y mensajería)
> Em-dash de más, punto final en cada línea de chat, `¿` de apertura en un mensaje casual, dos puntos donde iría un salto de línea.

**Cierres de engagement bait**
> "¿Qué opinás?", "Etiquetá a alguien que…", emojis decorativos de relleno.

### 3. ROMPER el ritmo

- Partí al menos **1 de cada 3** oraciones largas en dos, una de ellas corta (menos de 8 palabras).
- Meté un fragmento sin verbo donde caiga natural. *"Cada vez."* *"Vale la pena."*
- Rompé una estructura paralela perfecta dejándola asimétrica a propósito.

### 4. AGREGAR huellas concretas — sin inventar

Donde el texto sea genérico, cambiá lo abstracto por lo específico:

- un número real en vez de "muchos" / "significativo"
- una herramienta, un lugar o un tipo de negocio con nombre
- un detalle operativo que solo sabe quien lo hizo

**Si el dato no existe, no lo fabriques.** Marcalo `[PENDIENTE: dato real]` y pedilo. Un número inventado es peor que un texto genérico: el genérico aburre, el inventado se cae cuando alguien pregunta.

### 5. REESCRIBIR conservando el claim

Preservá exactamente lo que el texto afirma y promete. Conservá los quirks del autor si los hay (arranques en minúscula, muletillas propias). Humanizar no es pulir hasta aplanar.

### 6. VERIFICAR y dar veredicto

Releé buscando: ¿quedó algún tell del catálogo? ¿el significado quedó intacto? Cerrá con veredicto explícito:

> **humano** / **mixto** / **todavía huele a IA** — y qué falta si aplica.

## Output esperado

```markdown
## Señales encontradas
- [paralelismo negativo] "no es solo un CRM, es tu centro de operaciones" → línea 4
- [frase plantilla] "en el mundo actual" → hero
- [ritmo parejo] 6 oraciones seguidas de 18-21 palabras → párrafo 2
- [adjetivos vacíos] "potente, escalable e intuitivo" → sección features

## Versión reescrita
[texto listo para usar]

## Veredicto
mixto — falta un número real en el bloque de prueba social. [PENDIENTE: cuántos clientes activos]
```

## Ejemplo

**Input:**
> "En el mundo actual, gestionar clientes no se trata solo de guardar datos, sino de construir relaciones. Nuestra plataforma robusta y escalable te permite desbloquear todo el potencial de tu equipo comercial y llevar tu negocio al siguiente nivel."

**Señales:** frase plantilla de arranque · paralelismo negativo · tres adjetivos de modelo · cierre plantilla · cero información verificable.

**Output:**
> "Tus clientes están repartidos entre WhatsApp, una hoja de cálculo y la memoria de alguien. Acá quedan en un solo lugar, con la conversación completa. [PENDIENTE: dato real — cuántos negocios lo usan hoy]"

**Veredicto:** mixto — falta el dato de prueba. El claim original ("centraliza clientes") se conservó; se le quitó la promesa vaga de "siguiente nivel", que no afirmaba nada.

## Relacionadas

- `ui-distintiva-no-ai-default` — el mismo problema en diseño: el default genérico de IA en UI.
- `filtro-de-esencia-de-marca` — gate de marca antes de publicar (voz, ángulo, coherencia).
