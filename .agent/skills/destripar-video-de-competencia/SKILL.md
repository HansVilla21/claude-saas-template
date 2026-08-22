---
name: destripar-video-de-competencia
description: Usar cuando hay que analizar CÓMO está construido un video (reel, short, demo, anuncio) y no alcanza con leer su caption o su transcript. Pipeline para que Claude literalmente VEA el video — frames + transcript → teardown de estructura. Se dispara con "analizá este reel", "por qué funciona este video", "qué está haciendo la competencia", "destripá este anuncio".
---

# Destripar un video de la competencia — que Claude lo VEA, no que lo lea

## Cuándo usar esta skill

- Hay que entender **cómo está construido** un video, no de qué habla: dónde está el corte, qué se ve en el segundo 1, cuándo aparece la demo, cómo se resuelve el split cara/pantalla.
- Se está estudiando a un competidor, una referencia de formato, o un anuncio que está funcionando.
- El transcript **no alcanza** — y casi nunca alcanza: un transcript no te dice que el primer frame es una pantalla en movimiento en vez de una cara.
- También sirve para auditar **video propio**: onboarding grabado, demos de producto, anuncios ya publicados.

**NO usar** si solo necesitás el contenido hablado. Para eso, el transcript solo es más barato y más rápido.

## Por qué existe esta skill

Analizar video "leyendo el caption" produce conclusiones falsas con mucha confianza. El caption y el transcript describen **qué se dice**; el rendimiento de un video corto se decide por **qué se ve** — y sobre todo por qué se ve en el primer segundo.

**El hallazgo que justificó montar el pipeline:** al analizar reels de un nicho leyendo solo captions, la conclusión fue "reels cortos de 15-30s". Al medir los videos de verdad, el promedio real era **~83 segundos** (rango 62-107). La lectura de texto llevaba a copiar un formato que el nicho no usaba.

**Por qué no basta con una herramienta ya hecha:** las plataformas sociales bloquean a los descargadores genéricos sin sesión iniciada. La ruta que sí funciona es sacar la URL del CDN vía scraper de API, bajarla en la misma sesión (esas URLs caducan en horas) y extraer frames localmente.

## Proceso

### 1. Obtener la URL del video y el transcript

Vía scraper de API (Apify u equivalente). Para Instagram, `apify/instagram-reel-scraper` con `includeTranscript=true` devuelve `videoUrl` (CDN, descargable sin login) y `transcript`.

> ⚠️ **Los `videoUrl` del CDN caducan** (horas a un día). Bajá el video en la **misma sesión** del scrape. Si el barrido es viejo, re-scrapear.

Para YouTube el caso es más simple: `yt-dlp -o video.mp4 <url>` funciona directo, sin scraper.

### 2. Extraer frames

```bash
bash .agent/skills/destripar-video-de-competencia/destripar-video.sh <videoUrl> <id> [seg-entre-frames]
```

Baja el mp4 y saca 1 frame cada N segundos (default 2) a `outputs/teardowns/.frames/<id>/`.

Requiere `ffmpeg` + `curl`. Para videos de menos de 30s, bajar el intervalo a 1.

### 3. Leer los frames con el tool Read

Los frames son imágenes: Claude los lee directamente. **Leelos en orden** y anotá por frame qué se ve — no lo que se dice.

Preguntas que solo responden los frames:

- ¿El **frame 1** es cara, pantalla, texto o movimiento? (decide el scroll-stop)
- ¿Cada cuánto cambia el plano? ¿Hay zoom, corte duro, o plano fijo?
- ¿Hay subtítulos quemados? ¿Qué tamaño, dónde, en cuántas palabras por línea?
- ¿Cuándo aparece la prueba en pantalla — al principio o después de vender el problema?
- ¿Qué proporción es cara vs. pantalla?
- ¿El cierre es cara, texto, o pantalla?

### 4. Medir lo que se puede medir

No estimes lo que se puede contar. Como mínimo: **duración real**, número de cortes, segundo en que aparece la demo, proporción cara/pantalla.

```bash
ffprobe -v error -show_entries format=duration -of csv=p=0 video.mp4
```

### 5. Escribir el teardown separando OBSERVADO de INFERIDO

Regla dura: todo lo que salga de los frames o de la API va como **observado**; todo lo demás va marcado como **inferido**. Un teardown que mezcla las dos cosas se cita después como si todo fuera dato.

Guardar en `outputs/teardowns/YYYY-MM-DD-<fuente>-<tema>.md`.

### 6. Cerrar con el cruce hacia el propio proyecto

Un teardown sin la sección "qué me llevo" es trivia. Cerrá siempre con: qué se adopta, qué se descarta explícitamente y por qué.

> **Regla dura de uso:** de una referencia se copia la **forma** (cadencia, estructura, duración, dónde van los cortes), **nunca** las frases, analogías ni casos. Copiar contenido literal produce una imitación peor que el original.

### 7. Limpiar

Agregá a `.gitignore`:

```
outputs/teardowns/.frames/
```

Los frames y los mp4 son temporales y pesados. Los teardowns `.md` sí se versionan.

## Output esperado

```
outputs/teardowns/YYYY-MM-DD-<fuente>-<tema>.md
```

Secciones:

1. **Snapshot** — qué es, quién, base de datos usada (cuántos videos, de qué fechas)
2. **Nicho y ángulo** — qué dolor ataca, qué vende
3. **Anatomía de la apertura** — qué pasa en los primeros 3 segundos, por frame
4. **Estructura** — el arco, con la duración medida
5. **Formato** — proporción cara/pantalla, cortes, subtítulos, audio
6. **Qué me llevo / qué descarto** — decisión explícita, con razón

## Costo

- Descarga y frames: **gratis** (local).
- Transcript vía scraper: ~$0.05 por video. Un teardown completo cuesta menos de $0.10.

## Ejemplo

**Input:** "¿por qué funcionan los reels de este competidor?"

**Output:** teardown sobre 14 reels reales scrapeados, con hallazgos que el caption no daba — duración media medida de 83s (contra los 15-30s asumidos), formato talking-head + demo en pantalla en 10 de 14, apertura siempre en segunda persona sin preámbulo, y la prueba en pantalla siempre **después** de vender el problema, nunca abriendo en frío.

## Relacionadas

- `apify-integration-pattern` — cómo integrar el scraper (fetch directo, normalización, errores tipados).
- `verificar-funcionamiento-end-to-end` — verificar midiendo, no asumiendo.
