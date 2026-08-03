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
- El formateador SOLO divide, NO modifica contenido. Tono y puntuacion se arreglan en el
  agente principal, nunca en el formateador.
- En este kit el formateador canonico esta en
  `.claude/skills/momentum-prompt-gen/assets/template-formateador.md`.

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

## Regla de oro final

Si al leer el mensaje del bot en voz alta suena a articulo de periodico o ensayo, es bot.
Si suena a como le escribirias a un amigo por WhatsApp, es humano. Ese es el filtro de calidad.
