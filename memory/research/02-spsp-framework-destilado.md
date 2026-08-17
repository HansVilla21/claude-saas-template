# SPSP Framework — Destilado para Chatbot Inmobiliario WhatsApp

**Fuente:** Sales Xcelerator — *El Nuevo Modelo de Ventas SPSP* + *Manual de Preguntas SPSP* + *SalesXcelerator documento inicial*
**Aplicación:** Bot de WhatsApp Sofia que califica y vende para agente inmobiliario independiente en CR.
**Fecha:** 2026-05-20

---

## 1. La filosofía SPSP en 1 párrafo

SPSP es el opuesto de la venta tradicional. En vez de **hablar de tu producto, asumir, presentar y presionar**, el vendedor **escucha 80% y habla 20%**, haciendo preguntas en un orden estricto (Situación → Problema → Solución → Presentación) para que **el propio prospecto se persuada a sí mismo**. La tesis central: *"las personas no compran lo que les vendés, compran lo que ELLAS dicen que necesitan después de que vos las ayudaste a articularlo"*. El vendedor no convence, **diagnostica como médico** y receta solo después de entender el dolor. Aplicado al bot: Sofia no es un *form* disfrazado de chat ni un FAQ que recita propiedades — es una asesora que pregunta hasta entender el WHY de la mudanza antes de mostrar inventario.

---

## 2. El proceso SPSP — etapas adaptadas a venta inmobiliaria

### Etapa 0 — Conexión (1-2 turnos)

**Qué se hace:** Romper el patrón del vendedor típico. Poner foco en el lead y su mundo. Saber **qué lo trajo a escribir hoy**.

**Qué NO se hace:** No "¿en qué te puedo ayudar?", no "¿qué te interesa ver?", no listar features. NO arrancar con "Hola, ¿cómo estás?" — *"a nadie le importa cómo está usted o el cliente porque aún no lo conoce, no hay interés real, suena como todos los vendedores"* (SalesXcelerator, pág. 8).

**Preguntas tipo (manual SPSP, pág. 8):**
- "¿Ha encontrado lo que está buscando, o todavía está en busca de...?"
- "Solo me preguntaba, ¿qué fue lo que le atrajo del...?"

**Indicador de avance:** el lead da una respuesta de >5 palabras sobre QUÉ busca o POR QUÉ escribe (no solo "info").

**Error típico:** saltar a preguntas BANT (zona/precio) sin entender qué disparó el contacto.

---

### Etapa 1 — Situación (3-4 preguntas máximo)

**Qué se hace:** Entender la **realidad económica y vital** del prospecto. *"Solo utilizará de 3 a 4 preguntas de situación como máximo"* (Manual, pág. 10). Las preguntas extraen contexto sin sonar a interrogatorio.

**Cinco cosas que pasan al hacer preguntas de situación bien** (manifesto, pág. 3):
1. El prospecto **confía** porque mostrás interés genuino.
2. El prospecto entiende **su propia situación**.
3. Le ayudás a encontrar la **raíz del problema**.
4. Imagina cómo sería **resolverlo**.
5. Entiende **qué pasa si no hace nada**.

**Qué NO se hace:** preguntar más de 4. Si seguís, te volvés intrusivo. NO confundir con BANT clásico (BANT pregunta para llenar campos, SPSP pregunta para extraer historia).

**Indicador de avance:** sabés a qué se dedica, con quién vive, y por qué está buscando AHORA (no solo "qué busca").

**Error típico:** El bot Sofia actual hace solo 3 preguntas de situación (operación, zona, presupuesto) pero todas son **transaccionales**, no contextuales. Falta el "**¿qué te hace querer mudarte ahora?**" — el WHY.

---

### Etapa 2 — Problema (3-4 preguntas, incluyendo "las dos verdades")

**Qué se hace:** Sacar a la superficie qué NO le gusta de la situación actual. Aplicar la técnica de **"las dos verdades"** (manifesto, pág. 4): por más que algo le guste al prospecto, **siempre hay algo que le disgusta**. Y al revés: por más que algo sea malo, hubo una razón para empezarlo. Si vivís en un alquiler que odiás, **algo te mantuvo ahí** — descubrilo.

**Qué NO se hace:** hablar mal de la competencia ni de su situación actual directamente. Si el lead dice "estoy alquilando", NO decir "ah, alquilar es tirar plata". Hacé que el prospecto sea quien lo diga.

**Indicador de avance:** el prospecto verbalizó un dolor concreto (no "quiero algo mejor" sino "el ruido del vecino me tiene loco" o "la cuota de hipoteca actual me ahoga").

**Error típico:** asumir el dolor. Si vendés inmobiliario y asumís que TODOS quieren "más espacio" o "mejor zona", te perdés el 70% de las razones reales (divorcio, hijo nuevo, cambio de trabajo, herencia, problema con vecinos, etc.).

---

### Etapa 3 — Solución (2-3 preguntas)

**Qué se hace:** Hacer que el prospecto **se imagine ya con el problema resuelto** y diga, con sus propias palabras, **cómo cambia su vida**. *"Los vendedores élite hacen muchas más preguntas de solución que el resto"* (manifesto, pág. 4). Apega su emoción al resultado.

**4 razones (manifesto, pág. 4-5):**
1. Te dicen los beneficios que ELLOS perciben (no los que vos venderías).
2. Entendés cómo piensan.
3. La solución es de ELLOS, no impuesta.
4. Apegan emoción al resultado → la peor opción mental es **quedarse igual**.

**Indicador de avance:** el prospecto habla en tiempo futuro positivo ("cuando esté en la casa nueva, voy a poder...").

**Error típico:** saltar a inventario antes de esta fase. El bot Sofia actual **directamente no tiene esta etapa**. Pasa de BANT → inventario. Pierde toda la carga emocional.

---

### Etapa 4 — Clarificación (transversal, durante todas las etapas)

**Qué se hace:** Cuando el prospecto usa palabras vagas o emocionales ("difícil", "estresante", "tratar", "complicado"), repreguntar para extraer la emoción real. *"Tratar"* o *"desafiante"* son banderas — significan **frustración no resuelta** (Manual, pág. 21).

**Preguntas tipo:**
- "Cuando decís X, a qué te referís exactamente"
- "Puede darme un ejemplo"
- "Por qué es tan importante para usted ahora"

**Indicador de avance:** el prospecto reformuló su propia frase con más detalle. Acabás de "revivirle" el dolor.

---

### Etapa 5 — Presentación (corta, dirigida)

**Qué se hace:** Recapitular lo que entendiste y proponer UNA opción que calza. *"Basándonos en todo lo que hemos hablado yo le recomendaría que inicie con esta opción..."* (manifesto, pág. 6). Después de proponer: **CALLARSE**. Dejar al prospecto pensar.

**Qué NO se hace:** presentar 5 opciones, presentar features de catálogo, presentar antes de haber hecho las 4 etapas anteriores.

**Indicador de avance:** el prospecto pide ver una propiedad específica o pide siguiente paso.

---

### Etapa 6 — Cierre / Handoff (en el caso del bot)

Para el bot: el cierre **no es vender** la propiedad. Es **garantizar que Hans reciba un lead caliente con contexto completo**.

---

## 3. Preguntas concretas aplicables al bot inmobiliario (mín. 25, categorizadas)

> **Nota de tono:** todas adaptadas a WhatsApp tico/rioplatense, sin `¿` de apertura, sin punto final, 1 línea cuando se puede.

### A — CONEXIÓN (1-2 preguntas, abre la conversación)

| # | Pregunta | Qué extrae | Si responde X → seguís con |
|---|---|---|---|
| 1 | "Un gusto [nombre], qué te trajo a escribirnos hoy" | El **trigger** del contacto (vio un anuncio, un amigo le habló, viene buscando hace tiempo) | Si dice "vi un anuncio en IG" → pregunta cuál. Si dice "andaba buscando" → vas a situación. |
| 2 | "Sabés más o menos lo que andás buscando, o estás viendo opciones todavía" | Madurez del lead (decidido vs. explorador) | Si "decidido" → acelerás. Si "explorando" → no muestres inventario aún. |

### B — SITUACIÓN (3-4 preguntas, NO MÁS)

| # | Pregunta | Qué extrae | Siguiente paso |
|---|---|---|---|
| 3 | "Es para vos directamente, o lo estás viendo para alguien más" | **Decisor único vs. compartido** (esposa, hijos, padres) | Si "para alguien más" → preguntar quién decide al final |
| 4 | "Actualmente estás alquilando, viviendo con familia, o ya tenés tu casa propia" | Situación habitacional actual | Te abre las preguntas de problema de la etapa 2 |
| 5 | "Andás buscando para comprar o para alquilar" | Operación | Estándar BANT |
| 6 | "Para cuándo necesitarías estar mudándote" | **Timing** (descalifica curiosos) | Si "no sé, miro nomás" → bajo prioridad. Si "antes de junio" → caliente. |
| 7 | "En qué zona te interesa" | Zona | Estándar BANT |
| 8 | "Cuánto andás manejando de presupuesto" | Capacidad | Si compra: agregar pregunta de financiamiento |
| 9 | (Si compra) "Lo vas con preaprobación del banco o estás arrancando el proceso" | **Calificación financiera real** | Si "aún no banco" → educar antes de mostrar inventario alto |

### C — PROBLEMA + DOS VERDADES (extrae el WHY)

| # | Pregunta | Qué extrae | Por qué importa |
|---|---|---|---|
| 10 | "Qué te hace querer mudarte ahora" | **El trigger emocional real** | Esta es la pregunta que el bot NO hace y que David Retana confirmó que un agente real hace |
| 11 | "Qué te gusta de donde estás viviendo ahora" (las dos verdades — positivo primero) | Lo que NO querés perder | Te dice qué buscar en la próxima |
| 12 | "Y qué es lo que más te gustaría cambiar de ahí" | Dolor real | Si dice "es muy chico" → metraje. Si dice "el vecindario" → seguridad/zona. |
| 13 | "Hace cuánto venís pensando en mudarte" | Madurez de la decisión | Si "hace 2 años" → ya está convencido, hay que cerrar. Si "hace 2 semanas" → recién explora. |
| 14 | "Qué te ha impedido hacerlo hasta ahora" | **Obstáculo recurrente** (plata, no encuentra, pareja no decide) | Te anticipa la objeción que va a poner al cierre |

### D — CLARIFICACIÓN (transversal, cuando usa palabras vagas)

| # | Pregunta | Cuándo usarla |
|---|---|---|
| 15 | "Cuando decís [palabra], a qué te referís" | Si dice "complicado", "difícil", "no es lo ideal" |
| 16 | "Puede darme un ejemplo de eso" | Si vaguea con "la zona no me convence" |
| 17 | "Por qué es importante para vos resolverlo ahora" | Cualquier momento donde sospechás urgencia real |
| 18 | "De qué manera te afecta eso en el día a día" | Si menciona un problema sin describir impacto |

### E — SOLUCIÓN (proyectar al futuro resuelto)

| # | Pregunta | Qué provoca |
|---|---|---|
| 19 | "Imaginate que ya estás en la casa nueva, qué es lo primero que cambia en tu día" | Visualización emocional |
| 20 | "Cómo se vería tu vida si pudieras solucionar esto en los próximos 2-3 meses" | Apega emoción al timeline |
| 21 | "Qué tanto te cambiaría a vos / a tu familia poder mudarte a esta zona" | Stake-raising sin manipulación |
| 22 | "Qué has intentado hasta ahora para resolverlo" | Saber a quién más vio (competencia indirecta) |
| 23 | "Si encontráramos algo que calce, cuál sería el siguiente paso para vos" | **Pre-cierre** — el prospecto declara su propio camino |

### F — TRANSICIÓN A HANDOFF (el bot pasa al humano)

| # | Pregunta | Qué garantiza |
|---|---|---|
| 24 | "Si Hans te escribe hoy mismo, qué horario te calza mejor para verlo, mañana o el finde" | Compromiso de slot, no "te aviso después" |
| 25 | "Para que Hans llegue preparado, hay algo puntual que querés que tenga claro antes de la llamada" | Le pasa contexto crítico al humano + cierra última objeción |
| 26 | "Aparte de [zona/precio/tipo] hay algún otro factor importante para vos en la decisión" | Saca **objeciones latentes** antes del handoff |

---

## 4. Objection handling — el método SPSP de 3 pasos vs. LAARC

### El método SPSP: **Aclarar → Discutir → Desarmar**

A diferencia de LAARC (Listen-Acknowledge-Assess-Respond-Confirm), que es **reactivo y empático**, SPSP es **inquisitivo**:

1. **Aclarar** — "¿A qué te referís exactamente con eso?"
2. **Discutir** — Hacer preguntas que muevan al cliente a articular el por qué real
3. **Desarmar** — Devolverle la objeción transformada en pregunta que él mismo responde

**Cita clave (SalesXcelerator, pág. 23-24):** *"Una objeción es únicamente una duda que su cliente tiene, de ninguna forma es un rechazo... Recuerden, no queremos forzar la influencia esperando la compra al final. Queremos que el mismo cliente sea el que se influencie a sí mismo."*

**¿Es mejor que LAARC?** Para WhatsApp + bot: **sí, porque LAARC necesita lectura tonal**. SPSP es texto-puro, basado en hacer 1 sola pregunta clarificadora antes de responder. Funciona mejor para un bot porque elimina la fase "Acknowledge" larga (que en texto suena hueca).

### Aplicación a las 7 objeciones inmobiliarias típicas

#### 1. "Es muy caro / está fuera de presupuesto"

**SPSP move:** clarificar contra qué compara, sin defender el precio.

- *Aclarar:* "Cuando decís que está caro, a qué lo estás comparando"
- *Discutir:* "Bueno, en este tipo de propiedad lo principal para vos es el precio, o que resuelva lo que andás buscando"
- *Desarmar:* "Tenés algo de flexibilidad en el monto, o estás cerrado en ese tope"

**WhatsApp tico:** "Tranqui, esos cien mil arriba pesan. Pero contame, si te diera una opción justo a tu monto pero un toque más chica, o una a 5% más arriba con todo lo que necesitás, cuál te tiraría más"

#### 2. "Lo voy a pensar / lo hablo con mi pareja"

**SPSP move:** desbloquear el real decisor *en la misma conversación* (manifesto pág. 24-25).

- *Aclarar:* "Listo, en cuánto tiempo más o menos creés que podés contactarme con la respuesta"
- *Discutir:* "Y antes de irte, qué es exactamente lo que necesitás pensar, así Hans llega preparado"
- *Desarmar:* "Cómo creés que se sentiría tu pareja si te mudás a un lugar que tenga [beneficio mencionado]"

**WhatsApp tico:** "Dale, lo hablás con ella tranquilo. Solo una cosa, qué exactamente vas a discutir con ella, el precio, la zona, o el momento. Así Hans cuando hablan ya tiene todo listo"

#### 3. "Necesito financiamiento, no sé si califico"

**SPSP move:** convertir en pregunta de claridad y bajar fricción.

- *Aclarar:* "Has hecho algún cálculo previo de cuánto te aprobarían"
- *Discutir:* "Estás trabajando con un banco específico o todavía no hablaste con ninguno"
- *Desarmar:* "Si te conectamos con alguien que te corra el preaprobado gratis, te interesa, o preferís hacerlo solo"

**WhatsApp tico:** "Te entiendo, eso es lo primero que paraliza a todo el mundo. Has tirado números con algún banco, o ese paso lo tenés pendiente todavía"

#### 4. "Quiero ver más opciones"

**SPSP move:** revelar el criterio oculto.

- *Aclarar:* "Suponé que las otras opciones cumplen lo mismo y al mismo precio, qué otro factor te haría tomar la decisión"
- *Discutir:* "Qué te falta ver en esta para sentir que es la indicada"
- *Desarmar:* "Hay algo puntual que querés comparar, o es más una sensación de tener que ver más antes de cerrar"

**WhatsApp tico:** "Dale, normal. Solo curiosidad, qué te faltaría ver en esta para sentirte tranquilo, o es más que querés tener un par de comparaciones en la cabeza"

#### 5. "Mejor más adelante"

**SPSP move:** descubrir el **trigger de timing** real (manifesto pág. 29).

- *Aclarar:* "Más adelante cuándo te imaginás, en un mes, tres, seis"
- *Discutir:* "Qué tiene que pasar entre ahora y entonces para que lo arranques"
- *Desarmar:* "Y si esa condición no pasa, qué hacés"

**WhatsApp tico:** "Bueno, qué tiene que cambiar entre ahora y ese momento, así Hans te ayuda a ir avanzando"

#### 6. "No estoy seguro de la zona"

**SPSP move:** clarificar el miedo específico.

- *Aclarar:* "Qué te genera duda de la zona puntualmente, es por seguridad, distancia, o algo más"
- *Discutir:* "Has estado físicamente en la zona antes"
- *Desarmar:* "Si Hans te organiza un recorrido por la zona antes de comprometerte con algo, te suma o no cambia"

**WhatsApp tico:** "Te entiendo. Es por algo puntual, tipo seguridad, distancia al trabajo, o nunca has estado por ahí"

#### 7. "¿El precio es negociable?"

**SPSP move:** NO confirmar nada. Devolver a contexto.

- *Aclarar:* "Estás viendo un monto específico que te calza mejor"
- *Discutir:* "Aparte del precio, todo lo demás te funciona bien"
- *Desarmar:* (handoff) "Esa la negocia directamente Hans cuando hablen. Le digo el monto que te calza así llega preparado"

**WhatsApp tico:** "Eso lo conversás con Hans directamente. Cuál sería el monto que te haría decir que sí de una"

---

## 5. Cómo SPSP mide y cierra (aplicado al bot)

### Señales de que el lead está listo para handoff (= "ask" en SPSP)

1. Ya respondió 2+ preguntas de problema con detalle
2. Verbalizó al menos una visión futura (etapa solución)
3. Pidió **información específica** (precio, visita, disponibilidad de algo concreto)
4. Confirmó timing (cuándo se muda)
5. Confirmó decisor (es él o quién más)

**Si están 4 de 5 → handoff inmediato. Si 2-3 → seguís preguntando. Si 1 → todavía es curioso.**

### Cómo cerrar sin sonar agresivo

Cita SPSP (manifesto, pág. 6):
> *"Basándonos en todo lo que hemos hablado yo le recomendaría que inicie con esta opción, le puede servir porque al inicio usted me dijo... y este producto soluciona exactamente ese problema que usted tiene"*

**Adaptado al bot:**
> "Mirá, por todo lo que me contás — buscás algo cerca de [zona] porque [trigger], en máximo [presupuesto], y querés mudarte antes de [timeline] — Hans tiene un par de opciones que creo te van a calzar. Le aviso para que coordine con vos directamente, te late"

### La pregunta de handoff productivo (la 24-26)

El "ask" del bot NO es "querés agendar visita". Es:

> "Si Hans te escribe hoy, qué horario te calza, mañana o el finde"

Esto **fuerza compromiso de slot** y previene el "le doy cabeza con la almohada" (objeción real de David Retana).

---

## 6. Las 5 reglas inviolables del framework SPSP

### Regla 1 — Hablar 20%, escuchar 80%
*"En una conversación de ventas se trata de un 80/20. Cuando lo que los vendedores practican es un 10/90. No paran de hablar."* (SalesXcelerator, pág. 16)

**Para el bot:** mensajes cortos (1-3 líneas), 1 pregunta por mensaje. NUNCA información no pedida.

### Regla 2 — Nunca presentar antes de descubrir
*"Si después de todo este proceso nos damos cuenta de que no podemos ayudarle al prospecto, hay que decirlo. No intente venderle algo a alguien que no puede ayudarle."* (manifesto pág. 5)

**Para el bot:** NO mostrar inventario antes de haber pasado por situación + problema mínimo. Si el lead empuja "qué tienen", devolverlo: "Antes de tirarte cualquier cosa, contame qué andás buscando".

### Regla 3 — Las ideas de la solución son del prospecto, no del vendedor
*"Las ideas de ellos van a ser la solución, no las mías. No va a ser algo impuesto por mí como vendedor."* (manifesto pág. 5)

**Para el bot:** las visualizaciones de "cómo será tu vida" SIEMPRE en pregunta abierta, nunca afirmadas por Sofia. ❌ "Te vas a sentir más tranquilo en una casa así" ✅ "Cómo te imaginás tu día a día ahí"

### Regla 4 — Repetir las palabras emocionales del prospecto
*"Repetir la emoción, para poder clarificar y expandir el problema. Repetir lo que la persona dijo."* (SalesXcelerator, pág. 21)

**Para el bot:** si el lead dice "es estresante", Sofia devuelve "estresante en qué sentido". Mirror exacto del adjetivo emocional, no parafraseado.

### Regla 5 — Cierre sin titubear, luego silencio
*"Cuando le haga la pregunta de ¿qué le parece? ¡¡¡CALLESE!!! Deje al prospecto hablar, déle el tiempo para pensar."* (manifesto pág. 6)

**Para el bot:** después del handoff pitch, NO mandar más mensajes hasta respuesta. Sin "estoy por acá si me necesitás", sin emoji "🙂". El silencio empuja la respuesta.

---

## 7. Diferencias con el bot Sofia actual — GAPS concretos

Leí el system prompt de Sofia (workflow línea 1059-1062). Esto es lo que **NO está haciendo** según SPSP:

### GAP 1 — No tiene etapa de Conexión

Sofia hoy: saluda → pide nombre → "contame qué andás buscando".

**Falta:** la pregunta "qué te trajo a escribirnos hoy" o "viste algún anuncio". La fase 1 del prompt actual salta directo a BANT.

**Impacto:** se pierde el trigger del contacto (que define el nivel de calor del lead).

### GAP 2 — Cero preguntas de Problema

Sofia hoy llega hasta BANT (operación, zona, presupuesto) y de ahí se va a inventario.

**Falta:** "qué te hace querer mudarte ahora", "qué te gusta de donde vivís hoy", "qué te gustaría cambiar". Las 3 preguntas que David Retana **confirmó** que un agente real hace.

**Impacto crítico:** el bot está calificando como un formulario. NO como un asesor. Por eso David dijo "trabajo manualmente con etiquetas en WhatsApp" — porque ningún CRM hace estas preguntas.

### GAP 3 — Cero preguntas de Solución / visualización

Sofia no proyecta al futuro. No pregunta cómo cambiaría la vida del lead.

**Impacto:** el lead no se autopersuade. Solo recibe info. Eso es FAQ, no venta.

### GAP 4 — Cero clarificación de palabras emocionales

Si el lead dice "es complicado mi situación actual", Sofia no repregunta. Avanza a la próxima fase BANT.

**Impacto:** se pierde el dolor real, que es donde está la motivación de compra.

### GAP 5 — Handoff genérico, no captura el "next step"

El prompt actual cierra con "Hans coordina visita directamente con vos, te escribe por acá en un rato. Tenés algún horario que te calce mejor, entre semana o el finde".

Está OK pero le **falta** la pregunta SPSP #25: "para que Hans llegue preparado, hay algo puntual que querés que tenga claro". Eso captura objeciones latentes Y le da contexto al humano.

### GAP 6 — No usa las dos verdades

Si el lead dice "estoy buscando algo mejor que lo que tengo", Sofia no pregunta "qué te gusta de lo que tenés hoy". Pierde el ancla de qué NO sacrificar en la nueva propiedad.

### GAP 7 — Confunde brevedad con eficiencia

El system prompt tiene una regla "1 a 3 líneas por mensaje, 1 pregunta por mensaje" — esto está **alineado con SPSP**. ✅ Bien. Pero el bot **interpreta esto como hacer menos preguntas en total**. SPSP dice: hacé MUCHAS preguntas (10-15 antes del cierre), una por mensaje, pero estratificadas (3-4 situación + 3-4 problema + 2-3 solución).

---

## 8. Recomendaciones para reescribir el prompt (no el prompt, las directrices)

### Directriz 1 — Estructurar el prompt por las 4 etapas SPSP, no por "fases BANT"

Reorganizar el prompt en bloques **CONEXIÓN → SITUACIÓN → PROBLEMA → SOLUCIÓN → HANDOFF**, con criterios claros de cuándo pasar de una a otra. Eliminar la mención "Fase 2 — Calificación BANT" como nombre (porque sesga al bot a formulario) y reemplazarla por "Etapa 2 — Entender contexto".

### Directriz 2 — Agregar las preguntas de Problema obligatorias

Como mínimo, agregar 2 preguntas obligatorias entre BANT e inventario:
- "Qué te hace querer mudarte ahora"
- "Qué te gusta de donde estás viviendo / qué te gustaría cambiar"

Estas no son opcionales. Sin ellas el bot es un formulario.

### Directriz 3 — Implementar reglas de clarificación automática

Agregar al prompt: *"Si el lead usa palabras emocionales o vagas ('difícil', 'complicado', 'estresante', 'no me convence', 'raro'), tu PRÓXIMO mensaje debe ser una pregunta de clarificación repitiendo esa palabra: 'A qué te referís con [palabra]'. NO avances al siguiente tema hasta clarificar."*

### Directriz 4 — Agregar la pregunta de solución antes del inventario

Antes de ejecutar la búsqueda en inventario, hacer **al menos una** pregunta de visualización:
- "Si encontramos algo que calce, qué es lo primero que cambia en tu día"
- "Para cuándo te imaginás ya viviendo ahí"

Esto cumple la Regla 3 SPSP (el prospecto se autopersuade).

### Directriz 5 — Reescribir el handoff con la pregunta de captura de objeciones

Cambiar el cierre actual ("le aviso a Hans para coordinar visita") por:
> "Le aviso a Hans para que coordine la visita directamente. Para que llegue preparado, hay algo puntual que querés que tenga claro antes de la llamada. Y qué horario te calza más, mañana o el finde"

Esto cumple SPSP #25-26 — saca objeciones latentes y compromete slot al mismo tiempo.

---

## El siguiente movimiento es

Aplicar las **5 directrices** (sección 8) al system prompt de Sofia y testear con un piloto en frío. Mi recomendación: implementar primero la **directriz 2** (preguntas de problema) en aislamiento, porque ese es el GAP más grande según el demo de David Retana. Las otras 4 son refinamiento sobre esa base.
