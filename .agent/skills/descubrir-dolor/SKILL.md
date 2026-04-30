# Skill: Descubrir Dolor

## Cuándo usar

- Antes de definir/refinar un ICP
- Antes de priorizar features del roadmap
- Cuando una propuesta de feature parece "interesante pero no urgente" — el remedio es validar que ataca un pain real
- Para refrescar entendimiento del mercado cada 3-6 meses

Esta es la skill core del agente `pain-discovery`. Define el proceso disciplinado para encontrar dolores con evidencia, no asumirlos.

## Filosofía

> "Tu prospect no compra features. Compra escapar de un dolor o llegar a un sueño. El dolor es lo que dispara la búsqueda. El sueño es lo que cierra la venta. Si no encontraste el dolor, no encontraste al cliente." — síntesis de Hormozi

**Reglas absolutas:**
1. Quote literal o no es evidencia
2. Frecuencia × intensidad emocional > popularidad
3. Si no hay workaround visible, probablemente el dolor no es tan grave
4. Diferenciar "queja" de "pain comprable" (estaría dispuesto a pagar)
5. No mezclar dominios (cada ICP candidato sufre distinto)

## Proceso

### Paso 1: Definir el alcance
Antes de empezar, escribir:

```
Dominio del research: [ej: "Creación de contenido en Instagram para creadores hispanos"]
ICPs candidatos a explorar: [Lista de 3-7 — coaches, infoproductores, etc.]
Mercado geográfico: [Costa Rica, LATAM, España, global hispano]
Plazo del research: [horas/días que se le va a dedicar]
Output esperado: [docs/positioning/pains-discovered-[fecha].md]
```

### Paso 2: Lista de fuentes a minar
Por orden de prioridad (las más altas primero):

#### Tier 1 — Fuentes con quotes ricos
- **Reddit (español):** r/SoyEmprendedor, r/MarcaPersonal, r/EmprendimientoLATAM, r/marketingdigital
- **Reddit (inglés, traducir contexto):** r/SocialMediaMarketing, r/Entrepreneur, r/Coaching, r/InfoProducts, r/sweatystartup
- **Twitter/X:** búsquedas con queries específicos (ver paso 3)
- **YouTube comments:** bajo videos de gurús de contenido en español ("cómo crear reels", "marca personal", "vender cursos")
- **Reviews de Capterra/G2/AppStore:** específicamente en herramientas similares (ReHit, Hookly.online, Yorby, etc.) — buscar 1-3 estrellas

#### Tier 2 — Validación
- **Facebook groups hispanos:** "Emprendedores LATAM", "Creadores de contenido", "Marketing digital LATAM"
- **Podcasts hispanos:** Q&A de podcasts de coaching/marketing/emprendimiento
- **Twitter de creadores:** posts donde creadores comparten frustraciones públicamente

#### Tier 3 — Contexto
- **Hotmart/Udemy reviews:** reviews negativas de cursos "cómo crear contenido viral" — explican qué esperaban y no lograron
- **TikTok comments:** bajo videos de "tips para creators"

### Paso 3: Queries de búsqueda
Para Twitter/X, Reddit, Google:

**En español:**
- "no sé qué postear" creadores
- "frustrado con instagram" coach
- "no tengo ideas" contenido
- "me quemé creando contenido"
- "no veo resultados" reels
- "siento que me repito" instagram
- "perdí mi voz" marca personal
- "ChatGPT no me sirve para contenido"
- "ningún reel se hace viral"
- "cuánto tiempo gasto en contenido"

**En inglés (para traducir contexto):**
- "burned out making content"
- "instagram reels not working"
- "no time for content creation"
- "creator content fatigue"
- "AI tools for instagram content failed me"

### Paso 4: Mining sistemático
Para cada fuente, recopilar quotes con esta tabla:

| # | Quote literal | Fuente (link/sub/canal) | Fecha aprox | Vibe (frustrado, ansioso, agotado, perdido) |
|---|---|---|---|---|
| 1 | "..." | r/X | 2026-MM | agotado |

**Reglas:**
- Quote literal con comillas — sin parafrasear
- Si la fuente está en inglés, mantenerlo en inglés y agregar traducción si ayuda
- Anotar el "vibe" emocional — ayuda al ranking de intensidad

### Paso 5: Agrupación temática
Una vez que tenés 30-50 quotes, agruparlos por TEMA:

Temas típicos para Hookly:
1. **Bloqueo creativo / no sé qué postear**
2. **Tiempo invertido vs resultado obtenido**
3. **Tono de marca / sentir que pierdo mi voz**
4. **Comparación con otros creadores / impostor syndrome**
5. **Algorithmo / no entender por qué no crece**
6. **Burn out / fatiga del creator**
7. **Monetización del contenido / no convierte**
8. **Frustración con tools existentes (ChatGPT, Canva, etc.)**
9. **Specifically para LATAM:** sentirse "menos premium" que creadores en inglés

Cada tema → contar quotes → ranking inicial.

### Paso 6: Análisis JTBD por pain
Para cada pain group importante, completar:

```
## Pain: [Nombre en lenguaje del cliente]

**Síntoma:** [qué siente la persona]
**Job to be done:** [qué intenta lograr realmente]
**Workaround actual:** [qué hace hoy aunque sea malo]
**Costo del problema:** [tiempo, dinero, oportunidad, status]
**Trigger:** [cuándo lo siente más]
**Quien sufre más:** [tipo específico de persona]

**Quotes:**
> "..."
> "..."
> "..."

**¿Hookly lo resuelve?**
- Hoy: [sí parcial / no]
- Roadmap: [feature X lo atacaría]
- Brecha: [qué falta]
```

### Paso 7: Ranking final
Tabla resumen ordenada por (intensidad × frecuencia):

| Rank | Pain | Frecuencia | Intensidad | ICPs que sufren | Hookly responde? |
|---|---|---|---|---|---|
| 1 | [Pain] | Alta | Alta | A, B | Parcial — falta X |
| 2 | [Pain] | Media | Alta | C | Sí |
| 3 | [Pain] | Alta | Media | A, B, C | No, brecha |

### Paso 8: Insights estratégicos
Cerrar con 3 secciones:

1. **Top 3 pains a atacar** — los que combinan alta intensidad + alta frecuencia + brecha en mercado
2. **Pains huérfanos** — donde la gente se queja y NADIE da buena solución (= oportunidad)
3. **Pains saturados** — donde la competencia ya ataca bien (= evitar competir frontalmente)

## Output esperado

`docs/positioning/pains-discovered-[fecha].md` siguiendo la estructura del Paso 6 + Paso 7 + Paso 8.

Adicionalmente, **actualizar `memory/learnings.md`** con un resumen de 5 bullets de los insights más sorprendentes — esto se vuelve memoria del proyecto.

## Reglas finales

- **Mínimo 30 quotes** para que el research tenga señal estadística
- **Mínimo 3 fuentes distintas** por pain antes de considerarlo validado
- **Cualquier pain con menos de 3 quotes** se marca como "hipótesis a validar"
- **Buscar contraevidencia activamente** — ¿hay quotes de gente diciendo lo contrario? (esto es lo que separa research bueno de wishful thinking)
- **No usar Perplexity para conclusiones** — solo para encontrar fuentes. Las conclusiones las construís vos con quotes literales.

## Tiempo realista

Un research decente toma 2-4 horas dedicadas. Un research profundo (que nos dé certeza) toma 6-10 horas. Acordar el alcance al inicio para no quedarse a medias.
