# Correcciones Acumuladas de Prompting — Momentum AI

> Estas son las correcciones de Hans que se ganaron a base de errores reales en
> produccion (Level/Kenneth, Jaco, Dr. Carlos, El Canal). Viven fuera del repo en
> la memoria automatica de Claude Code, por eso se pierden al migrar. Aca van
> destiladas para que viajen con el kit.
>
> **Antes de generar u optimizar CUALQUIER prompt, leer este archivo + `metodologia-core.md`.**

---

## 1. Puntuacion humana — NO delatar al bot (CRITICO, aplicar SIEMPRE por default)

La puntuacion formal es el tell #1 que delata a un bot en WhatsApp/Instagram/Telegram.
Una vendedora costarricense real NUNCA escribe "Mucho gusto, Hans. ¿Que te trae por aca hoy?".
Escribe "Mucho gusto Hans! Que te trae por aca hoy?".

**NO usar NUNCA** en mensajes del bot:
- Punto final ( . ) al cerrar oracion o mensaje — cada linea termina sin punto
- Dos puntos ( : ) — preferir salto de linea
- Punto y coma ( ; )
- Signo de pregunta de apertura ( ¿ ) — solo el de cierre: "Te paso?"
- Guion largo / em-dash ( — ) — reemplazar por coma, parentesis o salto de linea

**Minimizar:** punto y seguido, punto y aparte (preferir saltos de linea cortos).

**SI usar:** interrogacion solo al final, comas naturales, admiracion ocasional ("Dale!"),
saltos de linea, guion corto ( - ) en rangos ("11-13 personas", "auto-check-in").

**Clave que casi nadie aplica:** la regla vale tambien para las INSTRUCCIONES del prompt
(headers, ejemplos), no solo para los ejemplos de respuesta. Si en las instrucciones usas
em-dash o punto final, el LLM lo aprende como aceptable y lo replica.

Validado en el bot estrella (Leo de Level) con 260+ leads. Default = estilo humano. Solo se
relaja si el cliente pide explicitamente tono corporativo formal.

**Regla hermana — ANTI-META:** no anunciar la respuesta antes de darla. "Te paso la info",
"Te explico", "Dale te respondo cada punto" delatan al bot. Responder directo.

---

## 2. El Formateador de Mensajes NO se improvisa (CRITICO)

Para CUALQUIER cliente nuevo, el prompt del Formateador (Basic LLM Chain) se copia VERBATIM
del canonico probado. NO improvisar, NO usar templates cortos universales: esos pierden
contenido (omiten la pregunta de cierre) o inventan estructuras (`messages`, arrays) que
rompen el downstream.

**Reglas:**
- Unico cambio permitido vs el canonico: el canal mencionado en el ROL y el titulo. La LOGICA
  (REGLA #1 NO PERDER CONTENIDO, DECISION DE TAMaNO, CHECKLIST final) se copia intacta.
- Schema del Structured Output Parser: PLANO `MENSAJE 1` / `MENSAJE 2` sin envoltorio `output`
  (n8n lo envuelve solo). Downstream lee `$json.output["MENSAJE 1"]`.
- **CRITICO (aprendido 2026-06-10):** en el schema del parser, SOLO `MENSAJE 1` puede ser
  required. Si el schema (o el jsonSchemaExample, que marca TODO como required) exige
  `MENSAJE 2`, el Auto-fixing Output Parser INVENTA contenido generico para llenar el campo
  cuando el formateador legitimamente devuelve un solo mensaje. Usar schemaType manual con
  `required: ["MENSAJE 1"]` y `additionalProperties: false`.
- En este kit el formateador canonico esta en
  `.claude/skills/momentum-prompt-gen/assets/template-formateador.md`.

**ACTUALIZACION DE CANON (2026-06-10, decision del founder — bot Momentum/Mateo):**
- El formateador ahora ADEMAS de dividir LIMPIA la puntuacion (quita punto final, ¿ ¡, : ; —).
  Limite semantico: puede tocar puntuacion/mayusculas/cortes, NUNCA ideas ni preguntas.
- Regla de division nueva: el salto de linea del agente ES la señal de division — cada linea
  va en su propio mensaje, la pregunta SIEMPRE va sola en el ultimo, maximo 3 mensajes
  (agrupar mismo tema si hay mas lineas). Reemplaza el Criterio A+B que agrupaba inputs chicos.
- Canon vigente: `clients/momentum-ai-crm/test-prompts/formateador.md` (deployado SET13).

Caso real: en el test de Dr. Carlos, versiones improvisadas del formateador fallaron 2 veces
seguidas (invento clave `messages`, omitio la pregunta de cierre).

---

## 3. Atacar la causa raiz, NO parchar para salir del paso (CRITICO)

Cuando un prompt o un bug no funciona, NO buscar el parche mas rapido que haga pasar el test
inmediato. Parar, entender la causa raiz, proponer un fix que aplique consistentemente.

**Como aplicar:**
- Si un fix no funciona al primer intento, parar. No improvisar el segundo basandose en el primero.
- Preguntar: "que pasa si la proxima vez los datos vienen ligeramente distintos?"
- Si la solucion solo funciona con los datos especificos del test actual, NO es la solucion.
- Documentar la causa raiz, no solo el fix.

Frase de Hans: "estas resolviendo bugs para salir del paso, no estas evaluando si realmente
ese bug va a funcionar despues".

---

## 4. Variar los mensajes repetidos — NO templates palabra por palabra (CRITICO)

Cuando el bot envia algo mas de una vez (link de Calendly, link a comunidad, respuesta a
objecion recurrente), NUNCA debe usar el mismo texto literal. Repetir literal es el tell #2
que delata al bot (despues de la puntuacion).

**Solucion en el prompt:**
- NO dar UN template unico para acciones repetibles.
- DAR 3-5 ejemplos variados y decir "usa esto como inspiracion, NO como template".
- Instruccion explicita: "Cada vez que envies X, redacta el mensaje como si fuera la primera
  vez, tomando en cuenta lo que acabamos de hablar".
- Si el lead pide lo mismo de nuevo, referenciar el contexto ("aca te lo dejo de nuevo...").

---

## 5. NUNCA prometer lo que el bot no puede entregar (CRITICO)

El bot SOLO puede enviar links (Calendly, web, formularios) y texto. NO puede enviar PDFs,
brochures, videos, imagenes, audios ni "material educativo generico". Por lo tanto NO debe
prometerlos. Solo material con un LINK concreto puede mencionarse en el prompt. Todo lo demas
es promesa vacia — es peor decir "te mando material" y nunca enviarlo que cerrar cordialmente.

---

## 6. Disciplina de versiones de prompts (workflow, no calidad — pero evita destruir trabajo)

Dos reglas operativas que evitan perder prompts buenos:

**a) Drift entre la herramienta de produccion y el repo local.** El equipo/cliente edita
prompts directo en produccion (n8n) sin sincronizar al `.md`. Antes de editar un prompt que
te pasen como "el actual", preguntar: "este es el que esta en produccion AHORA o es una copia
guardada?". Tras editar el `.md`, recordar que el cambio NO esta en produccion hasta cargarlo
manualmente.

**b) Snapshot antes de modificar.** Antes de tocar un prompt activo, guardar copia en
`versions/{archivo}-v{N}-{descripcion}.md`. El activo lleva header con version, cambios y
snapshot anterior. Es el unico punto de retorno si un cambio rompe el bot.

---

## 7. Principios del analisis Mateo vs v1 (2026-06-10 — validados, aplicar SIEMPRE)

> Origen: analisis comparativo de por que los prompts Mateo produjeron la primera
> conversacion e2e excelente mientras las iteraciones previas producian guion rigido.
> Detalle completo + evidencia: `memory/leccion-2026-06-10-por-que-mateo-funciona.md`.

**a) Decidir antes de redactar.** Cerrar con el founder las decisiones de negocio (CTA,
manejo de precio, dureza de calificacion, nombre/persona del bot) ANTES de escribir una
linea de prompt. El prompt implementa decisiones, no las descubre iterando.
(Evidencia: `test-prompts/architecture.md` con tabla de 7 decisiones precede a los prompts.)

**b) Los ejemplos mandan sobre las reglas.** Ante conflicto regla-vs-ejemplo el LLM imita
el ejemplo. TODO wording de ejemplo dentro del prompt debe cumplir TODAS las reglas de
estilo (voseo, sin punto final, sin ¿). Un solo ejemplo que viole la regla la anula.

**c) Una definicion por trigger.** El campo que dispara acciones irreversibles (apagar bot,
handoff) tiene UNA sola definicion — compuesta con AND si hace falta ("acepto la llamada
Y dio nombre + negocio") — nunca redefinida con variantes en regla + ejemplos + extraccion.

**d) El prompt que diseñas debe ser el prompt que ejecuta.** Antes de escribir, inspeccionar
el nodo real: modelo, temperatura, y COMO se inyecta el systemMessage. Si hay una capa
compositora (tipo "Componer System Prompt") que apila templates encima del prompt, el texto
diseñado NUNCA llega solo al modelo — o se elimina la capa o se diseña para ella.

**e) Auditar contradicciones cross-archivo como paso formal.** Leer los N prompts del bot
como UN sistema: ningun trigger puede vivir en dos destinos del router, ninguna politica
puede contradecirse entre agentes que se presentan como la misma persona (caso real: el
agente de objeciones viejo proponia dia/hora mientras el principal lo prohibia).

**f) Memoria monotonica en extractores.** Los campos extraidos solo crecen turno a turno:
"NUNCA regreses un campo a null si ya tenia valor (solo si el lead lo corrige)". Formular
como invariante, no como aspiracion ("preserva los valores").

---

## 8. Hipotesis prometedoras del mismo analisis (n=1 — confirmar con leads reales)

Funcionaron en la conversacion validada del 2026-06-10 pero con UN solo lead (cooperativo,
el founder role-playing). Aplicarlas por default en prompts nuevos, pero NO tratarlas como
ley hasta verlas funcionar con leads reales no cooperativos:

- **Slots, no checklist:** discovery como lista de datos a ENTENDER (sin orden, sin
  presupuesto de turnos), no preguntas literales en secuencia. El checklist con presupuesto
  ("3-5 turnos, en este orden") fue la causa raiz del guion rigido.
- **Agitacion socratica:** el dolor lo declara el LEAD respondiendo preguntas ("que pasa
  con los que escriben de noche?"), el bot nunca lo afirma con scripts ni cifras.
- **Condicion de parada explicita por etapa:** cada agente sabe donde termina ("Despues de
  eso NO sigas preguntando. El cierre ya sucedio") — freno con trigger, no prohibicion suelta.
- **Regla 0 para el caso mas frecuente del router:** "da su nombre → AGENTE_PRINCIPAL" +
  lista de falsos positivos de handoff (el turno 2 de toda conversacion es el nombre).
- **El primer mensaje de ads es un hola:** "me interesa" / "info" se trata como saludo,
  no como pregunta a responder.

---

## Regla de oro final

Si al leer el mensaje del bot en voz alta suena a articulo de periodico o ensayo, es bot.
Si suena a como le escribirias a un amigo por WhatsApp, es humano. Ese es el filtro de calidad.
