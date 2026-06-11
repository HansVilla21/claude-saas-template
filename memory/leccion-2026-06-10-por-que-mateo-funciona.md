# Por qué Mateo funciona — análisis comparativo (2026-06-10)

> **Contexto:** el 2026-06-10 se deployaron los prompts nuevos del founder (`test-prompts/`,
> bot "Mateo") vía SET11-12-13 y produjeron la primera conversación e2e que el founder validó
> como excelente ("demasiado bien, me encanta"). Este documento analiza POR QUÉ funcionan
> cuando las iteraciones previas (2026-06-04 a 06-09) producían guion rígido, re-preguntas
> y mensajes intrusos. Análisis verificado adversarialmente — los claims débiles están
> marcados como hipótesis.
>
> **Para futuros prompts, leer junto con:** `memory/feedback-prompting.md` (reglas destiladas)
> y `memory/metodologia-core.md`.

---

## 0. La conversación de referencia (resumen)

Lead de prueba (el founder role-playing como fisioterapeuta): hook → discovery →
agitación → pitch → calificación → cierre directivo → aceptación → despedida + handoff.
18 turnos, cero re-preguntas, cero mensajes intrusos, cero tells de bot, burbujas con
cadencia WhatsApp. El handoff disparó (con un bug de datos aparte — ver §7).

**Sesgo declarado:** fue un lead 100% cooperativo (el propio founder), happy path puro.
El agente de objeciones, la escalera de precio, la descalificación y la mayor parte del
árbol del router **nunca se ejercitaron**. Lo verificado conductualmente es el flujo
principal; el resto es análisis estático de los prompts.

---

## 1. Evidencia conductual — momento del chat → pieza del prompt

| Momento del chat | Pieza del prompt nuevo que lo produce |
|---|---|
| "hola, quiero info" → saludo + pedir nombre (no interrogar sobre el anuncio) | *"El primer mensaje suele ser generico ('me interesa', 'info'). Tratalo como un hola, no como pregunta tecnica"* |
| Acknowledge + espejo: "Genial, una clinica de fisioterapia", "20 conversaciones nuevas al dia es un buen volumen" | Discovery *"(una pregunta por mensaje, 70% habla el lead)"* + enfoque de doctor. Nota honesta: parte de esto es comportamiento default del modelo — el prompt no instruye "reflejar" explícitamente |
| La agitación la verbaliza el LEAD ("a veces hasta en la noche los contesto") | *"### 3. AGITAR EL DOLOR (que lo diga el lead, no vos)"* + 3 preguntas de dolor verbatim |
| Pitch conectado al dolor exacto (mensajes repetitivos + noches) | Etapa 4 condicional: *"Si pierde mensajes... / Si paga vendedores..."* — presenta valor según el dolor que pellizcó |
| Calificación sin sentirse formulario ("cuantos terminan comprando?", "seguir metiendole a la publicidad?") | Etapa 5 "calificar suave, conversacional" — las preguntas llenan slots del router sin checklist |
| Cierre directivo "Por lo que me contas, esto te calza... Te viene mejor entre semana o el fin?" | Frase completa escrita en el prompt (wording literal listo para usar) |
| Tras "entre semana me queda bien" → "Listo, te paso a Hans..." + silencio. NO re-preguntó el día | *"Despues de eso NO sigas preguntando. El cierre ya sucedio"* + regla 2 del router (handoff). **Verificado en los screenshots** — el bug histórico #1 no apareció |
| "con hans" (nombre del lead = nombre del founder) NO descarriló al router | Regla 0: *"Da su nombre o se presenta → AGENTE_PRINCIPAL"* + lista de falsos positivos de handoff |
| Cero ¿, cero punto final, nombre del lead usado 1 vez en toda la conversación | Los ejemplos del prompt YA vienen con la puntuación humana aplicada — el modelo imita lo que ve |
| Burbujas cortas, pregunta siempre sola | **Pipeline, no prompt**: SET13 (formateador divide por saltos de línea) |
| Cero mensajes inventados ("Estoy aquí para ayudarte...") | **Pipeline, no prompt**: SET12 (parser ya no exige MENSAJE 2 → el auto-fixer no entra a rellenar) |

---

## 2. Las diferencias causales prompt por prompt

### Agente Principal (8,021 chars viejo → 6,381 nuevo)

1. **Slots, no checklist.** VIEJO: *"ETAPA 2 -- CALIFICAR RAPIDO (3-5 turnos)"* + lista de
   4 preguntas literales *"en este orden aproximado"*. NUEVO: 4 cosas a **entender**
   (negocio / ads / volumen / quién contesta) sin orden ni presupuesto de turnos.
   El presupuesto de turnos empuja al modelo a "avanzar la lista"; el slot le deja elegir
   momento y orden. *(Mecanismo plausible pero n=1 — ver hipótesis H2.)*

2. **Diseño positivo con frenos puntuales, no gobierno por prohibición.** VIEJO: 16 `NUNCA`
   acumulados — fósiles de bugs parchados (la "REGLA CRITICA" anti-re-preguntar arriba del
   checklist que CAUSABA el re-preguntar). NUEVO: cada etapa define QUÉ hacer y dónde termina
   (*"Despues de eso NO sigas preguntando. El cierre ya sucedio"*). Matiz del verificador:
   el nuevo también tiene ~16 NO/NUNCA — la diferencia real es que sus prohibiciones tienen
   condición de disparo y comportamiento sustituto, no que sean menos.

3. **Agitación socrática.** VIEJO: el bot AFIRMA el dolor con scripts (incluida la cifra
   *"necesitarias 3 o 4 personas tiempo completo"* — en tensión con su propia regla de no
   inventar números). NUEVO: el bot PREGUNTA y el lead confiesa el dolor. El dolor
   auto-declarado se puede citar sin inventar.

4. **Ejemplos que encarnan las reglas.** El LLM imita los ejemplos por encima de las reglas.
   En el sistema viejo, el formateador modelaba tuteo y puntos finales mientras la regla los
   prohibía. En el nuevo, TODOS los wordings de ejemplo ya están en voseo, sin ¿, sin punto
   final. (Regla que ya existía en `feedback-prompting.md` §1 y se violaba.)

### Router (7,128 chars viejo → 4,567 nuevo)

1. **Regla 0 para el caso más frecuente:** "da su nombre → AGENTE_PRINCIPAL" + lista de
   falsos positivos de handoff ("con luis", "soy maria", mención a Hans/Pietro como
   referencia). El turno 2 de TODA conversación es el nombre — merece la regla de mayor
   precedencia.
2. **Invariante de memoria monotónica:** *"NUNCA regreses un campo a null si ya tenia valor
   (solo si el lead lo corrige)"* — verificable, vs el aspiracional "preservá los valores".
3. **Trigger crítico con UNA definición compuesta:** `lead_listo_para_agendar` = aceptó
   la llamada **Y** dio nombre + negocio. Si acepta sin datos → al principal a capturarlos.
   El campo que apaga el bot no tolera ambigüedad.
4. **Cascada 0-4 sin huecos:** 2da objeción → handoff sin distinción de tema; "garantía" ya
   no vive en dos destinos; eliminado el código muerto ("cuanto sale" en el catálogo de
   objeciones cuando el router nunca ruteaba precio ahí).

**Pérdidas a evaluar (el nuevo NO es estrictamente superior):** el router nuevo eliminó
los 10 ejemplos clasificados del viejo, los campos `pain_principal`/`authority`/`timeline`/
`calificacion`, y el caso de handoff "pregunta técnica fuera de scope" (HIPAA/SOC2).
Si esos campos alimentaban el CRM o el caso fuera-de-scope importa, hay que reincorporarlos.

### Agente Objeciones (3,711 chars viejo → 2,335 nuevo)

1. **4 objeciones núcleo + fallback algorítmico** en vez de catálogo de 8 con entradas muertas.
2. **Cierre coherente con el sistema:** el viejo cerraba con *"Manana o pasado te queda
   mejor?"* mientras el principal prohibía negociar el día — dos agentes que dicen ser la
   misma persona con políticas opuestas. El nuevo: *"vos nunca agendas fecha ni hora"*.
3. Nota: quedó en 2,335 chars, por encima de su propio target (1,500-1,800). Funciona pero
   es deuda declarada.

### Formateador (2,090 chars viejo → 6,634 nuevo)

1. **Cambio de filosofía:** de "solo divide, no toca contenido" a "humanizador con límite
   semántico" (*"puede tocar puntuacion/mayusculas/cortes, NUNCA ideas ni preguntas"*).
   Esto **contradice** `feedback-prompting.md` §2 viejo y el architecture.md ("formateador
   reusado, no se toca") — es un cambio de canon deliberado del founder, ya actualizado
   en feedback-prompting.md.
2. **Regla determinística de división** (2026-06-10, decisión del founder): el salto de
   línea del agente ES la señal de división; la pregunta SIEMPRE sola; máximo 3 mensajes.
   Reemplaza 4 listas (algoritmo/reglas/prohibiciones/prioridades) que se contradecían.
3. **7 ejemplos input→output con justificación**, todos en voseo y puntuación humana —
   el viejo tenía 1 par MAL/BIEN de otro nicho, en tuteo y con puntos finales.
4. Nota: triplicó de tamaño. Funciona, pero vigilar el costo/latencia del nodo.

---

## 3. Lo que NO es del prompt — pipeline (ser honesto con la atribución)

El mejor prompt del mundo no habría producido este transcript con el pipeline viejo:

1. **systemMessage INLINE (SET11).** Antes, el prompt del Agente Principal era UNA capa de
   un sándwich compuesto por `Componer System Prompt` (core_template + business_info + tono
   + REGLAS DURAS hardcoded con lenguaje condicional + system_rules al final). El prompt
   diseñado NUNCA llegaba solo al modelo. **El prompt viejo nunca se testeó inline** — parte
   de su mala fama puede ser del sándwich, no del texto.
2. **SET12 (parser):** los mensajes intrusos ("Estoy aquí para ayudarte...") los inventaba
   el Auto-fixing Output Parser cuando el schema exigía MENSAJE 2 — 100% pipeline, ningún
   prompt podía prevenirlo porque ocurría DESPUÉS del agente.
3. **SET13 (formateador por líneas):** la cadencia de burbujas del transcript es pipeline.

**Atribución estimada (hipótesis, no medición):** ~50% prompt / ~30% inline / ~20% SET12+13.
**Confound de modelo descartado para esta comparación:** las conversaciones malas del
06-09 ya corrían sobre gpt-4.1-mini (migrado en SET2 el 06-06), igual que Mateo.
**Test de falsación disponible (opcional):** correr el prompt viejo inline con SET12/13
activos. Si mejora mucho → el sándwich era el villano principal.

---

## 4. Principios destilados

### Sólidos (persistidos como regla en feedback-prompting.md)

1. **Decidir antes de redactar.** Cerrar con el founder las decisiones de negocio (CTA,
   precio, dureza de calificación, persona) ANTES de escribir el prompt. Evidencia: la
   tabla de 7 decisiones de `architecture.md` precede a los prompts.
2. **Los ejemplos mandan sobre las reglas.** Todo ejemplo dentro del prompt debe cumplir
   TODAS las reglas de estilo. Ante conflicto regla-vs-ejemplo, el LLM imita el ejemplo.
3. **Una definición por trigger.** El campo que dispara acciones irreversibles (apagar bot)
   tiene UNA definición, compuesta (AND) si hace falta, nunca redefinida en regla + ejemplo
   + extracción con variantes.
4. **El prompt que diseñás debe ser el prompt que ejecuta.** Verificar modelo, temperatura
   y CÓMO se inyecta el systemMessage ANTES de escribir. Nada de capas compositoras opacas
   entre el texto diseñado y el modelo.
5. **Auditar contradicciones cross-archivo.** Leer los N prompts como UN sistema: ningún
   trigger en dos destinos, ninguna política contradicha entre agentes que se presentan
   como la misma persona.
6. **Memoria monotónica en extractores.** Campos extraídos solo crecen; null solo por
   corrección explícita del lead.

### Hipótesis (n=1 — prometedoras pero validar con leads reales no cooperativos)

- **H1 — Slots, no checklist:** discovery como lista de cosas a entender sin orden ni
  presupuesto de turnos. (Mecanismo plausible; el viejo también tenía cláusulas adaptativas
  que el modelo ignoró — falta aislar la variable.)
- **H2 — Agitación socrática:** el dolor lo declara el lead vía preguntas. (Funcionó con
  lead cooperativo; probar con lead seco/apurado.)
- **H3 — Condición de parada explícita por etapa:** "el cierre ya sucedió" como freno.
  (El no-re-preguntar se verificó 1 vez.)
- **H4 — Regla 0 del caso más frecuente** en el router. (Nunca se estresó con casos límite.)
- **H5 — El primer mensaje de ads es un hola**, no una pregunta a responder. (1 dato.)

---

## 5. Lo que el trabajo viejo tenía de BUENO (conservar)

- **El router viejo era el mejor de los 4:** extracción acumulativa, "pain con las palabras
  del lead", default seguro justificado, distinción OBJECIÓN/PREGUNTA/CORRECCIÓN, 10 ejemplos
  clasificados. El nuevo refina su núcleo pero PERDIÓ los ejemplos y 4 campos — evaluar
  reincorporarlos.
- **Guardrails correctos que siguen vigentes:** clientes reales únicos nombrables, escalera
  de precio (deflect → rango bajo insistencia → nunca exacto), puntuación humana, una
  pregunta por mensaje, voseo.
- **Infraestructura de proceso:** snapshots, tags, build scripts idempotentes, smoke tests,
  conteo de chars. Es lo que permitió iterar SET11-12-13 en horas sin miedo.

---

## 6. Errores de proceso que produjeron el trabajo viejo (meta-nivel)

1. **Parcheo de síntomas:** cada bug → un NUNCA nuevo, sin tocar la causa (el checklist).
   El prompt terminó siendo un changelog de incidentes.
2. **Escribir sin conocer el runtime:** no se inspeccionó cómo se componía el systemMessage
   real (sándwich) ni el modelo del nodo antes de diseñar.
3. **Reescritura total bajo presión** en vez de cambios quirúrgicos.
4. **Ignorar la metodología escrita** (las reglas existían en el kit; se improvisó de memoria).
5. **Cero auditoría cross-componente** — las contradicciones solo eran visibles leyendo los
   4 prompts juntos.

**El meta-cambio ganador:** `architecture.md` ANTES que los prompts; patrón duplicado de
Level/Dr. Carlos en vez de invención; targets de chars declarados; y los bugs de pipeline
tratados como pipeline (SET12/13), no con más texto en el prompt.

**Lección de una línea:** el viejo intentaba CONTROLAR al modelo con prohibiciones
acumuladas dentro de un runtime que no conocía; el nuevo le da un personaje con objetivos,
ejemplos coherentes y frenos explícitos — y ejecuta exactamente el texto diseñado.

---

## 7. Pendientes derivados de este análisis

1. **BUG ABIERTO (pipeline):** el silent handoff del 06-10 17:09 marcó `handler='human'` en
   la conversación VIEJA (`efddbea1`, tests del 06-04) en vez de la viva (`69421db0`).
   Causa probable: lead duplicado (mismo teléfono, distinto `wa_user_id`) + el nodo de
   handoff resuelve por teléfono agarrando el más viejo. La conversación viva sigue con
   `handler='bot'` → el bot respondería de nuevo. Fix: usar el `conversation_id` del turno.
2. **Paths sin testear:** objeción de precio, "es caro", "lo pienso", descalificación,
   pedido de humano explícito, lead seco/agresivo.
3. **Evaluar reincorporar al router:** ejemplos clasificados + campos
   `pain_principal`/`authority`/`timeline`/`calificacion` (si el CRM los consume) + caso
   fuera-de-scope.
4. **Sync de fuentes:** `test-prompts/` es ahora el canon de los prompts del bot Momentum.
   Los viejos de `prompts/` quedan como referencia histórica — NO editarlos por error.
5. **Test de falsación opcional:** prompt viejo inline + SET12/13 para aislar sándwich vs texto.
