# Skill: Handoff / Dossier a Otro Proyecto

## Cuándo usar esta skill

- Cuando el trabajo se divide entre proyectos distintos (p. ej. **build del producto** vs
  **estrategia/GTM**) y hay que poner **otro proyecto o agente en contexto** sin que tenga que
  leer el repo entero.
- Cuando el founder dice "pasame todo para que el otro proyecto ya esté full en contexto".

## Regla de separación

**Si es código o toca el producto → vive con el repo del producto. Si es estrategia/negocio que
se reutiliza entre ventures → vive en el proyecto de estrategia.** Ejemplo: campañas de Meta,
posicionamiento, pricing → estrategia; landing/pixel/creativos generados por el producto → repo.

## Proceso

1. **Dossier maestro autocontenido** (`outputs/dossier-<proyecto>-para-estrategia.md`): resumen
   ejecutivo, qué es, modelo de negocio + economía, funnel, **TODO lo que está live**, qué se
   **probó** de verdad, **activos** (creativos, pixel, legales, dominio), **lo que FALTA**
   (honesto y priorizado), y una tabla de **datos técnicos clave**. Debe entenderse SIN abrir el repo.
2. **Briefs específicos** que profundizan (producto/ICP/pricing/funnel; y el de la disciplina —
   p. ej. Meta Ads: estructura, público, copy, presupuesto, KPIs).
3. **Prompt listo para pegar** en el otro proyecto: le dice qué documentos leer y **en qué orden**,
   le pide un **resumen de contexto para verificar** que entendió, le pasa los **constraints clave**,
   y define **qué debe hacer** después.

## Gotchas

- El dossier tiene que ser **AUTOCONTENIDO** (nada de "ver el código") — el otro proyecto no tiene
  el repo.
- Incluir **"lo que falta"** honesto, no solo lo bueno — sin eso, la estrategia se arma en el vacío.
- El prompt debe **pedir un resumen** al otro agente antes de trabajar (verifica contexto) e
  incluir los **constraints** (p. ej. "el pixel aún no mide Purchase → optimizar a registro").

## Output esperado

En `outputs/`: 1 dossier + N briefs + el prompt de onboarding. El founder los copia al otro
proyecto y pega el prompt.

## Ejemplo

**Input:** "La estrategia de ads la trabajo en otro proyecto. Pasame todo lo que tenemos y un
prompt para ponerlo en contexto."

**Output:** `dossier-freshadflow-para-estrategia.md` + `brief-producto` + `brief-meta-ads` + un
prompt que ordena leerlos, pide resumen de verificación, y lista los constraints (Purchase
pendiente, límite de OpenAI, unificar oferta). El otro proyecto arranca con contexto total.
