# Spec: Sofia v4 — SPSP-Aware Redesign (bifurcación por perfil de lead)

**Fecha:** 2026-05-21
**Autor:** n8n-architect
**Workflow afectado:** `chatbot-inmobiliaria-demo-ycloud-sofia-v3-unified.json` → `chatbot-inmobiliaria-demo-ycloud-sofia-v4.json`
**Versión actual → propuesta:** v3 → v4
**Trigger del cambio:** Bug en producción (2026-05-20) — Sofia disparó `request-handoff` con `reason='qualified'` cuando el lead solo había dado una zona ("en el GAM") y se había quejado del cuestionario ("ya me cansaste"). Causa raíz triple: (a) regla "interés concreto" vaga, (b) flow lineal SPSP que trata igual al 50-70% de tráfico info-only que al 5-10% hot, (c) sobre-discovery (9 preguntas) en un canal donde >5 preguntas mata el lead.

---

## 1. Problema / requerimiento

El founder pidió **rediseño desde cero, no parche**. El research de `memory/research/06-real-estate-sales-real-world.md` (cross-source de USA + LATAM, MIT, Inman 2025, Tom Ferry, KW, FUB, Vitrina Raíz, Kosmo, Whato) demostró tres hallazgos estructurales que el bot v3 ignora:

1. **El 50-70% del inbound digital es "tire-kicker / info-only"**. Sofia v3 está optimizada para el 5-10% "hot" — mata el otro 60%+ con cuestionario.
2. **"Speed-to-lead ≠ speed-to-qualify"** (Inman / Josh Ries 2025). Calificar antes de ganarse el derecho mata el lead. Sofia v3 califica en turnos 1-3 (anti-pattern #1 documentado).
3. **En LATAM dar precio en mensaje 1 es estándar cultural**. Sofia v3 esconde el precio hasta Stage 5 ("Antes de tirarte cualquier cosa, contame..." — frase explícita del prompt v3).

Sofia v4 tiene que:
- **Detectar perfil de lead en turno 1-2** y bifurcar el flow.
- **Dar el dato que el lead pidió en el turno 1** (precio, disponibilidad, ficha) ANTES de calificar.
- **Máximo 5 preguntas en toda la conversación** (no 9), intercaladas con valor.
- **Regla de handoff con condiciones AND verificables** (no "interés concreto").
- **Respetar señales de frustración**: si el lead dice "ya me cansaste" → soft-close + handoff `manual`, NO `qualified`.
- **Instrumentar métricas** para detectar drift de calidad en producción.

---

## 2. Estado actual relevante

Workflow v3 (post-bug 2026-05-20) tiene UN solo agente `Agente Principal - Sofia` con 2 tools:
- `Supabase Properties Tool` (HTTP tool → edge function `properties-search` v1.4)
- `Request Handoff Tool` (HTTP tool → edge function `request-handoff` v0.1)

Trayectoria operativa (lo que SE MANTIENE en v4 — no se toca la pipeline de entrada):
```
Webhook YCloud → Extract → Switch (texto/audio/image) → Normalize → ID y Mensaje
→ Resolve Agency → Buscar Lead → Lead Encontrado? → Get Conversation State
→ Chatbot Activado? → REINICIAR? → Variables → Conversation → Code Formatear Historial
→ Unificacion de Variables → Agente Principal - Sofia (+ 2 tools, + Memory, + Model)
→ Formateador → Auto-fixing Parser → Structured Output Parser
→ Split Out → Loop Over Items → Send Chunk via YCloud → Pausa
→ (paralelo) Detector de Descalificacion → Apagar bot? → Apagar Chatbot — Conversation
→ Notificar Agente (Telegram) → Apagar Chatbot — Lead Summary
```

El bug del 2026-05-20 ocurrió porque:
1. El system prompt v3 (`memory/research/05-sofia-v2-system-prompt.md`, líneas 178-181) define el trigger de handoff como **"Pasaste por Stage 3+ y el lead mostró interés concreto en 1-2 propiedades"**. "Interés concreto" es subjetivo — el LLM lo interpretó como "el lead dio info concreta sobre zona". Falso positivo.
2. El `Detector de Descalificacion` (information extractor paralelo) tampoco filtró: el bot escaló porque el LLM principal llamó `Request Handoff Tool` directamente con `reason='qualified'`. El Detector solo audita la salida del bot post-hoc.
3. Cuando el lead dijo "ya me cansaste" (frustración), el bot no detectó la señal — siguió empujando preguntas hasta romper.

---

## 3. Cambio propuesto

**Decisión central:** mantener **1 solo agente unificado** (no router previo), pero el system prompt v4 va a tener **clasificación de perfil EMBEBIDA en el TASK block** como primer paso mental obligatorio antes de generar respuesta. Justificación abajo (Sección 12).

### 3.1 Nodos a crear

Ninguno. v4 es refactor de prompt + cambio de schemas de tools, no cambio de arquitectura.

### 3.2 Nodos a modificar

| Nombre | Qué cambia | Por qué |
|---|---|---|
| `Agente Principal - Sofia` | (a) `systemMessage` se reemplaza completo por el prompt v4 (lo entrega `langchain-prompt-designer` en `memory/research/07-sofia-v4-system-prompt.md`). (b) `text` (input) se enriquece con `message_count` y `current_lead_profile` (si ya está clasificado en turnos previos) — ver Sección 4. (c) `temperature` baja de 0.3 a 0.2 (más determinismo en clasificación). | El prompt v3 trata a todos los leads como "Mover" (el perfil que el SPSP fue diseñado para). v4 bifurca en turno 1-2. Baja temperature porque la decisión de bifurcar es categórica, no creativa. |
| `Request Handoff Tool` | (a) Enum cerrado en la description del `reason` parameter ($fromAI): agregar `info_only_closed` y `frustrated` como nuevos valores válidos. (b) Description del tool deja explícito: **"NUNCA llamar esta tool sin que se cumpla AL MENOS UNA de las condiciones de handoff documentadas en el system prompt. NUNCA llamar con reason='qualified' si el lead no pasó por Stage 3+ Y mostró aceptación de propuesta concreta."** | El bug del 2026-05-20 fue que el LLM llamó la tool con reason inventado. Reforzar a nivel description de la tool, no solo en el prompt principal, baja la probabilidad. |
| `Supabase Properties Tool` | Sin cambios funcionales. Solo refinar la description del `tipo` y `zona` para que el LLM extraiga mejor del contexto del lead (no del último mensaje literal). | Refinamiento marginal. |
| `Detector de Descalizacion` | Agregar nueva razón `frustrated` al enum de `razon`. Bajar threshold de confianza para `handoff_pide_humano` cuando el lead use lenguaje de frustración ("ya me cansaste", "tantas preguntas", "ya déjate de pregunton"). | Es la segunda capa de defensa. Hoy no captura frustración como handoff. |
| `Sticky - Agentes` (sticky note) | Reescribir contenido para reflejar v4: "5 perfiles + bifurcación + máx 5 preguntas + handoff con AND". | Sticky notes desactualizados confunden al reviewer (Check 14). |

### 3.3 Nodos a borrar

Ninguno. v4 es refactor, no rearquitectura.

### 3.4 Conexiones a crear

Ninguna.

### 3.5 Conexiones a borrar

Ninguna.

---

## 4. Schemas

### Input al agente (text del nodo `Agente Principal - Sofia`)

v3 (actual):
```
=# Contexto del lead (extraído por el sistema, no por LLM previo)
- nombre_lead: {{ $('Buscar Lead (Supabase)').first().json.full_name || ... || 'no confirmado' }}
- conversation_id: {{ $('Get Conversation State').first().json.id }}
- agency_id: {{ $('Resolve Agency').first().json.agency_id }}
- telefono: {{ $('Variables').first().json.Telefono }}

# Mensaje actual del usuario
{{ $('Variables').first().json['Mensaje actual del usuario'] }}
```

v4 (propuesto — agrega `message_count` para que el bot sepa en qué turno está):
```
=# Contexto del lead (extraído por el sistema, no por LLM previo)
- nombre_lead: {{ $('Buscar Lead (Supabase)').first().json.full_name || $('Buscar Lead (Supabase)').first().json.display_name || 'no confirmado' }}
- conversation_id: {{ $('Get Conversation State').first().json.id }}
- agency_id: {{ $('Resolve Agency').first().json.agency_id }}
- telefono: {{ $('Variables').first().json.Telefono }}
- message_count: {{ $('Get Conversation State').first().json.message_count || 0 }}

# Mensaje actual del usuario
{{ $('Variables').first().json['Mensaje actual del usuario'] }}
```

**Notas técnicas:**
- `message_count` ya existe en `conversations` table (`get_conversation_state` lo devuelve). Verificar — si no, no agregar (es opcional, el bot puede inferir del historial).
- `Postgres Chat Memory - Sofia` sigue inyectando historial automáticamente (no duplicar acá).

### Output esperado de Request Handoff Tool (sin cambios funcionales, solo enum)

```json
{
  "conversation_id": "uuid",
  "reason": "qualified | scheduling | objection_complex | manual | info_only_closed | frustrated",
  "summary": "string corto",
  "source": "n8n"
}
```

El enum existente en `conversations.handoff_reason` cubre los 5 valores actuales. Si agregamos `info_only_closed` y `frustrated`, hay que verificar la migration 0016. **Decisión conservadora:** NO agregar valores al enum SQL en v4 — el bot mapea ambos a `manual` que ya existe. Documentamos el `summary` con prefijo `[info-only]` o `[frustrated]` para que Hans lo vea en el inbox.

### Output del Detector de Descalizacion (sin cambios estructurales)

```json
{
  "apagar_bot": true | false,
  "razon": "handoff_agendar | handoff_pide_humano | descalificacion | continuar",
  "confianza": 0.0-1.0,
  "resumen_lead": "string"
}
```

`razon='frustrated'` NO se agrega — se mantiene `handoff_pide_humano` cuando el lead expresa frustración explícita (la lógica del Detector ya lo cubre vía el bullet 2 de su criterio).

---

## 5. Variables de entorno requeridas

Ya existen en v3 (no se introducen nuevas):
- `HANDOFF_INTERNAL_SECRET` — secret del Authorization Bearer del Request Handoff Tool
- Credentials de Supabase (en n8n credentials), OpenAI, YCloud, Whisper, Apify, Telegram, Redis — sin cambios

---

## 6. Riesgos previstos (mínimo 5)

1. **Riesgo CRÍTICO — Sobre-bifurcación / clasificación incorrecta de perfil** (Probabilidad: ALTA, Impacto: ALTO)
   - **Qué se rompe:** Si el LLM clasifica mal a un "active shopper" como "tire-kicker", el bot lo trata con drip suave en lugar de proponer visita inmediata → lead se va a otro agente. Inverso peor: clasifica un "info-only" como "hot" y dispara handoff prematuro (igual que el bug del 2026-05-20 pero con otro síntoma).
   - **Mitigación:**
     - El few-shot del prompt v4 (5 ejemplos, uno por perfil) tiene que mostrar señales claras de clasificación.
     - El system prompt obliga a re-evaluar el perfil en cada turno (no se "casa" con la clasificación del turno 1).
     - El walkthrough del reviewer DEBE simular un lead que cambia de perfil en medio de la conversación (ej: arranca info-only y al turno 3 se vuelve active shopper).
     - Si el LLM duda entre dos perfiles, defaultea al MÁS CONSERVADOR (info-only > browser > active shopper) — esto fail-safes en favor de NO disparar handoff falso.

2. **Riesgo ALTO — Lead frustrado mal clasificado** (Probabilidad: MEDIA, Impacto: ALTO)
   - **Qué se rompe:** El lead del bug del 2026-05-20 ("ya me cansaste") es el caso. Si el bot no detecta la frustración como señal de handoff, sigue empujando preguntas y rompe la relación.
   - **Mitigación:**
     - Nueva regla DURA en el prompt v4: lista cerrada de **señales de frustración** ("ya me cansé", "tantas preguntas", "déjate de pregunton", "para qué tantas preguntas", "pasame un humano", "no quiero más preguntas", "info y ya"). Si aparece CUALQUIERA de estas en el último mensaje del lead → handoff `reason='manual'` con summary `[frustrated] ...`.
     - El Detector de Descalizacion captura las mismas señales como red de seguridad redundante.
     - Walkthrough obligatorio del reviewer: escenario "lead frustrado".

3. **Riesgo MEDIO — LLM ignora el prompt y vuelve a comportamiento v3** (Probabilidad: MEDIA, Impacto: MEDIO)
   - **Qué se rompe:** El prompt v3 era muy SPSP-céntrico. Si el prompt v4 no es lo suficientemente categórico, gpt-4.1 puede revertir al patrón de cuestionario.
   - **Mitigación:**
     - Bajar temperature a 0.2.
     - Few-shot al FINAL del prompt (regla OpenAI: peso al final).
     - Los 5 ejemplos del few-shot tienen que mostrar EXPLÍCITAMENTE el comportamiento bifurcado (3 turnos, no 9).
     - Reglas DO/DON'T numeradas con justificación corta.

4. **Riesgo MEDIO — Lead investor mal manejado** (Probabilidad: BAJA, Impacto: MEDIO)
   - **Qué se rompe:** El perfil investor habla en cap rate, ROI, plusvalía. Si el bot le responde con lenguaje emocional ("imaginate viviendo aquí") lo pierde. v3 no diferencia investor.
   - **Mitigación:** Perfil 4 (investor) en el prompt v4 tiene su propio script: lenguaje financiero, cash disponible (no presupuesto financiado), ROI esperado. Si Hans no tiene inventario investor-fit, escalar con `reason='manual'` summary `[investor]`.

5. **Riesgo MEDIO — Sobre-corrección "ya nunca pregunta nada"** (Probabilidad: BAJA, Impacto: MEDIO)
   - **Qué se rompe:** Si interpretamos "máx 5 preguntas" como "casi cero preguntas", el bot se vuelve un buscador de propiedades pasivo y no califica nada → Hans recibe leads sin contexto.
   - **Mitigación:** Las 5 preguntas son acumuladas en TODA la conversación pero distribuidas. El prompt v4 lista las 5 que SÍ valen la pena, en orden de importancia (zona, timing, why mudarse, decisor, presupuesto). El bot puede hacer menos según perfil — un active shopper apenas necesita zona+timing antes de proponer visita.

6. **Riesgo BAJO — `message_count` no existe en `conversations`** (Probabilidad: BAJA, Impacto: BAJO)
   - **Qué se rompe:** Si el campo no existe en el query del `Get Conversation State`, la expresión `{{ ... }}` devuelve undefined → el bot no sabe en qué turno está.
   - **Mitigación:** El fallback `|| 0` está en la expresión. El bot puede inferir el turno del historial conversacional vía `Postgres Chat Memory`. Si el reviewer detecta que no funciona, dropear `message_count` del input (no crítico).

7. **Riesgo BAJO — El Detector de Descalizacion dispara handoff antes que el agente principal** (Probabilidad: BAJA, Impacto: MEDIO)
   - **Qué se rompe:** Los dos nodos corren en paralelo después de `Agente Principal - Sofia`. Si el Detector clasifica "handoff_agendar" pero el bot no llamó la tool, igual se apaga la conv → "doble handoff" inconsistente.
   - **Mitigación:** El Detector ya tiene esa potestad en v3 (es su propósito). En v4 sigue siendo red de seguridad. Si el bot llamó `Request Handoff Tool`, el `handoff_status` ya está `pending` y el trigger `tg_handoff_create_task` se disparó — el `Apagar Chatbot — Conversation` re-setear `handler='human'` es idempotente. Sin conflicto real.

---

## 7. Casos edge a contemplar (mínimo 5)

### Edge 1 — Lead info-only en turno 1 (50-70% del tráfico)
- **Input típico:** "hola, cuánto cuesta la de Escazú?" / "info?" / "sigue disponible?"
- **Comportamiento esperado v4:**
  - Turno 1 del bot: confirma + da el dato concreto + 1 pregunta abierta blanda. Ej: *"Hola, sí sigue disponible. Te paso ficha con fotos. La viste en algún portal o alguien te la pasó"*.
  - Turno 2: ofrece valor (más propiedades parecidas) sin pedir info dura. NO hay 9 preguntas.
  - Turno 3: si el lead no responde con engagement → cierre amable + drip. Si responde con detalles → escala a active shopper.
- **NO hace:** cuestionario SPSP de 9 preguntas. NO calificación financiera en los primeros 3 turnos. NO handoff `qualified`.

### Edge 2 — Lead active shopper en turno 1
- **Input típico:** "Hola, vi la casa de Curridabat con piscina. ¿Cuándo puedo verla?"
- **Comportamiento esperado v4:**
  - Turno 1 del bot: confirma + propone hora directa (sin filtros). Ej: *"Buenísimo, ya le aviso a Hans para que coordine. Te calza hoy 4pm o mañana 10am"*.
  - Llamada inmediata a `Request Handoff Tool` con `reason='scheduling'` y `summary='Active shopper — pidió ver CR-Curridabat-piscina. Propuesta hoy 4pm / mañana 10am.'`
- **NO hace:** cuestionario de 9 preguntas. NO espera Stage 4-5.

### Edge 3 — Lead hot en turno 1 (5-10% del tráfico, raro)
- **Input típico:** "Necesito mudarme antes de octubre, ya vendí mi casa. Busco 2 cuartos en Heredia $200K-$250K."
- **Comportamiento esperado v4:**
  - Turno 1 del bot: NO sigue conversando. Confirma + handoff inmediato. Ej: *"Mirá, con esa info Hans te puede ayudar directamente. Ya le aviso, te llama en menos de 2 horas. Mientras qué horario te calza, mañana o tarde"*.
  - Llamada inmediata a `Request Handoff Tool` con `reason='qualified'` y `summary='Hot lead — timing oct, budget $200-250K, zona Heredia, ya vendió casa. Necesita 2 cuartos.'`
- **NO hace:** repreguntar lo que el lead ya dijo. NO ofrecer inventario antes del handoff.

### Edge 4 — Lead frustrado (el bug del 2026-05-20)
- **Input típico (replay):** Lead había dado info parcial. Bot pidió zona. Lead: "en el GAM... ya me cansaste con tantas preguntas, dame info y ya".
- **Comportamiento esperado v4:**
  - Bot detecta señal de frustración ("ya me cansaste", "tantas preguntas").
  - Soft-close + handoff con `reason='manual'` y `summary='[frustrated] Lead pidió parar el cuestionario. Última info: zona GAM. Próximo paso: Hans contacta directo, sin más preguntas iniciales.'`
  - Mensaje del bot: *"Mirá, te entiendo. Hans te contacta directo en menos de 2 horas — no más preguntas de mi lado. Mientras me decís si te interesa más venta o alquiler"*. (UNA pregunta final súper liviana, NO pidiendo presupuesto/timing/etc.)
- **NO hace:** disparar `reason='qualified'`. NO seguir empujando preguntas de Stage 1-4.

### Edge 5 — Lead investor
- **Input típico:** "Hola, busco propiedad para Airbnb en Tamarindo, manejo entre $300k y $500k cash."
- **Comportamiento esperado v4:**
  - Turno 1 del bot: lenguaje financiero, ROI. Ej: *"Mirá, en Tamarindo el ROI promedio en alquiler vacacional está entre 8-12% bruto. Hans tiene 3 propiedades en ese rango. Te las paso"*.
  - Llama `Supabase Properties Tool` con `zona=Tamarindo, precio_min=300000, precio_max=500000`.
  - Si hay inventario: presenta y pasa a handoff `scheduling`. Si no: handoff `manual` con summary `[investor]`.
- **NO hace:** "imaginate viviendo aquí". NO preguntar "para vos o para alguien más" (irrelevante para investor).

### Edge 6 — Lead browser / top-funnel
- **Input típico:** "Hola, todavía no es seguro pero estoy viendo opciones para el año que viene."
- **Comportamiento esperado v4:**
  - Turno 1 del bot: lo saca del WhatsApp activo. *"Perfecto. Para no estar saturándote por acá, te aviso cuando entre algo en tu zona que calce. Me decís zona y rango aproximado"*.
  - Si responde con zona/rango → marca como `info_only_closed` con summary `[browser, follow-up Q4 2026]`.
  - Si no responde → drop, no insiste.
- **NO hace:** cuestionario. NO handoff `qualified`.

### Edge 7 — Tool failure (`properties-search` 401 / timeout / vacío)
- **Input:** El LLM llama `Supabase Properties Tool` y recibe `{error: "401"}` o nada.
- **Comportamiento esperado:** Fallback verbal explícito en el prompt v4 (DO #5 sigue vigente): *"No logro ver el inventario ahora, dejame que Hans te confirme en un rato"*. Llama `Request Handoff Tool` con `reason='manual'` y summary `[tool failure] ...`.
- **NO hace:** improvisar precios/direcciones.

### Edge 8 — Lead manda link de propiedad externa
- **Input:** "Te mando este link de encuentra24.com/casa-curridabat..."
- **Comportamiento esperado:** El pipeline pre-procesa el link vía Apify (sin cambios v3). El bot recibe contexto enriquecido. Si la propiedad NO está en el inventario de Hans, el bot responde: *"Vi el link. Dejame que Hans te confirme si esa la maneja él. Mientras, qué te llamó la atención de esa específicamente"*. NO finge tenerla.

---

## 8. Triggers de handoff — reglas operacionales AND/OR explícitas (NO vagas)

**Regla CRÍTICA del 2026-05-20:** "interés concreto" prohibido como condición. Las reglas v4 son verificables turn-by-turn solo leyendo el último mensaje del lead + memoria.

### Condiciones que disparan `Request Handoff Tool` (al menos UNA de A-F debe cumplirse):

**A. `reason='scheduling'`** — Lead pide visita explícita.
- Condiciones AND: el lead, EN EL ÚLTIMO TURNO, dijo literal alguna de estas frases (o equivalente claro): "cuándo puedo verla", "cuándo se puede ver", "quiero ir a verla", "me gustaría visitarla", "agendar visita", "ver la propiedad".
- AND: hay UN inventario referenciado (un código de propiedad o un nombre claro como "la de Curridabat con piscina"). Sin propiedad referenciada → NO disparar scheduling, preguntar primero cuál le interesa.

**B. `reason='manual'`** — Lead pide humano explícito.
- Condición: el lead, EN EL ÚLTIMO TURNO, dijo literal alguna de: "quiero hablar con Hans", "pasame a un humano", "necesito hablar con persona", "agente real", "pasame al vendedor", "hablo directo con el agente", "no quiero hablar más con el bot", "sos un robot".

**C. `reason='manual'` con `[frustrated]` en summary** — Frustración detectada.
- Condición: el lead, EN EL ÚLTIMO TURNO, dijo literal alguna de: "ya me cansaste", "tantas preguntas", "déjate de preguntón", "para qué tantas preguntas", "info y ya", "no quiero más preguntas", "me estás aburriendo".
- En este caso el bot ofrece soft-close + handoff sin agregar más preguntas.

**D. `reason='qualified'`** — Hot lead detectado en mensaje 1 o tras stages.
- Condiciones AND (todas tienen que cumplirse):
  - El lead dio explícitamente TIMING concreto (mes, fecha, "antes de X") — NO "lo antes posible" sin fecha.
  - AND el lead dio explícitamente PRESUPUESTO (rango numérico, no "no sé").
  - AND el lead dio explícitamente ZONA específica (no "GAM" suelto, sí "Heredia centro").
  - AND el lead aceptó al menos UNA propiedad concreta que el bot le presentó (frase tipo "esa me interesa", "me late la 2", "esa me sirve", "esa me calza").
- **Negativo explícito:** NO disparar `qualified` si el lead solo dio 1-2 de los 3 datos. NO disparar si nunca se le mostró inventario. NO disparar solo porque el lead dio "una zona".

**E. `reason='scheduling'` con `[info-only-closed]` en summary** — Soft-close de info-only sin frustración.
- Condición: el bot ya está en turno 5+ con un lead clasificado info-only o browser, el lead NO mostró interés en propiedad concreta, y el bot le ofreció drip ("te aviso cuando entre algo"). Lead aceptó o no respondió por 1 turno.
- Esto cierra la conversación pero deja el lead en CRM con tag para nurture.

**F. `reason='objection_complex'`** — Objeción financiera/legal compleja.
- Condición: el lead preguntó por preaprobación bancaria específica, regulación legal (impuesto traspaso, herencia, sociedad), o financiamiento que el bot no puede responder. NO se dispara para objeciones simples de precio/zona que el bot maneja con SPSP.

### Lo que NO dispara handoff (negativos explícitos):
- Lead da SOLO zona → NO handoff. Sigue conversando (turno 2 del flow info-only).
- Lead pide info de UNA propiedad → NO handoff. Llamar `Supabase Properties Tool` con el código.
- Lead pregunta precio → NO handoff. DAR el precio (cultura LATAM).
- Lead dice "lo voy a pensar" → NO handoff. Aplicar Objection 2 del prompt.
- Lead da 1 dato de los 3 (zona OR timing OR budget) → NO handoff. Seguir con el flow del perfil.

---

## 9. Cambios fuera del workflow

**Migraciones SQL:** NINGUNA. v4 NO modifica el enum `conversation_handoff_reason` — los nuevos valores conceptuales (`frustrated`, `info_only_closed`) se mapean a `manual` con prefijo en el summary. Esto evita migration + rollback nuevo.

**Edge functions:** NINGUNA. `request-handoff` v0.1 acepta cualquier `reason` string — la app frontend ya soporta los enum values existentes.

**Env vars:** NINGUNA nueva.

**Front-end del CRM:** opcional para una iteración futura — mostrar el prefijo `[frustrated]` / `[info-only-closed]` del summary destacado en el inbox para que Hans priorice. NO bloqueante para v4.

---

## 10. Tests manuales que el reviewer debe correr

El reviewer DEBE correr **el script determinístico** + **5 walkthroughs mentales**:

### Script determinístico
```
node scripts/validate-n8n-expressions.js n8n/workflows/chatbot-inmobiliaria-demo-ycloud-sofia-v4.json
```
Debe devolver **0 violations**.

### 5 walkthroughs mentales (obligatorios — Sección 7 los lista)
1. **Edge 1 — Lead info-only**: "hola, cuánto cuesta la de Escazú?" → simular turnos 1-6 → verificar (a) NO hay 9 preguntas, (b) se da precio, (c) NO handoff `qualified`.
2. **Edge 2 — Lead active shopper**: "vi la casa de Curridabat con piscina, cuándo puedo verla?" → simular turno 1 → handoff `scheduling` inmediato.
3. **Edge 3 — Lead hot**: "necesito mudarme antes de octubre, ya vendí mi casa, $200-250K en Heredia" → handoff `qualified` inmediato en turno 1.
4. **Edge 4 — Re-simulación del bug 2026-05-20**: replay exacto de la conv del screenshot. Verificar que v4 NO dispara `reason='qualified'` cuando el lead solo dio zona y se quejó.
5. **Edge 5 — Lead investor**: "busco para Airbnb en Tamarindo, $300-500K cash, qué cap rate" → bot habla cap rate, NO emoción.

### Verificaciones cruzadas
- Cada walkthrough produce una transcripción textual de los primeros 5-6 turnos del bot.
- Para cada uno: ¿cuántas preguntas hizo? (target <5 total). ¿Dio precio cuando correspondía? ¿Cuándo (o si) disparó handoff? ¿Con qué reason?
- **Si CUALQUIER walkthrough revela que el bot dispara `reason='qualified'` sin cumplir AND de Sección 8.D → FAIL crítico automático.**

---

## 11. Handoff al builder

- **Archivo de output esperado:** `n8n/workflows/chatbot-inmobiliaria-demo-ycloud-sofia-v4.json`
- **Script de build esperado:** `scripts/build-workflow-v4.js`
- **Clonar de:** `scripts/build-workflow-v3.js` (mismo patrón idempotente)
- **Source del prompt v4:** `memory/research/07-sofia-v4-system-prompt.md` (lo entrega `langchain-prompt-designer`)
- **Source workflow base:** `n8n/workflows/chatbot-inmobiliaria-demo-ycloud-sofia-v3-unified.json`
- **Workflow.name objetivo:** `"Chatbot Inmobiliaria Demo - YCloud (Sofia v4 SPSP-Aware)"`
- **Workflow.active obligatorio:** `false`

### Notas especiales al builder
1. **NO renombrar** `Agente Principal - Sofia` — las conexiones se basan en el nombre.
2. **Refactor del Request Handoff Tool**: cambiar SOLO la `toolDescription` para reforzar negativos explícitos. NO tocar URL ni jsonBody (las claves siguen siendo conversation_id/reason/summary/source).
3. **Sticky note `Sticky - Agentes`**: reescribir el `content` con el patrón documentado en Sección 3.2.
4. **`Detector de Descalizacion`**: en el `systemPromptTemplate` agregar a la sección "CRITERIOS PARA APAGAR EL BOT" → bullet nuevo:
   > **2.5 handoff_pide_humano (señal de frustración)** — el lead expresó frustración con frases como "ya me cansaste", "tantas preguntas", "déjate de pregunton", "info y ya". El bot debe escalar aunque NO use la palabra "humano" explícitamente.
5. **Temperature del nodo `OpenAI Chat Model - Sofia`**: bajar de 0.3 → 0.2.
6. **`text` del nodo Sofia**: agregar línea `- message_count: {{ $('Get Conversation State').first().json.message_count || 0 }}` antes de `# Mensaje actual del usuario`. Si `message_count` no existe en el JSON de Get Conversation State, queda en 0 — no rompe.
7. **Idempotencia**: el script debe poder correrse 2 veces seguidas sin romper (validar antes de modificar — si el sticky note ya tiene v4 en el content, skip).

---

## 12. Decisiones de diseño justificadas

### 12.1 ¿Mantener 1 agente o introducir router por tipo de lead?

**Decisión: 1 solo agente con clasificación EMBEBIDA en el prompt.**

**Justificación:**
- Un router previo (information-extractor → switch → agente A/B/C) suena modular pero introduce 3 problemas: (a) doble latencia (2 llamadas LLM por turno), (b) pérdida de contexto entre clasificador y agente, (c) 3 agentes que mantener en lugar de 1.
- gpt-4.1 con prompt de 6-8k tokens maneja perfectamente la clasificación + respuesta en una sola pasada. El research lo confirma (los bots de Vitrina Raíz y Kosmo usan un solo agente con bifurcación en el prompt).
- La bifurcación en el TASK block del prompt es transparente y auditable — el reviewer puede leer EXACTAMENTE el árbol de decisiones.

### 12.2 ¿Cuándo se da el precio?

**Decisión: en el turno 1 si el lead lo pidió, sin esconderlo.**

**Justificación:**
- Research `06-real-estate-sales-real-world.md` Sección 4 anti-pattern #3: "No dar precio cuando lo piden — en LATAM es la norma cultural dar precio. Esconderlo se siente engañoso. Distinto a USA."
- El bot v3 lo escondía hasta Stage 5 (anti-pattern documentado).
- El precio se da si: (a) el lead lo pidió Y (b) hay un código de propiedad referenciado O el bot puede llamar la tool con filtros mínimos. Si NO hay propiedad clara, el bot devuelve rango: *"Las casas en Escazú que maneja Hans están entre $200K-$350K — qué rango andás manejando"*.

### 12.3 ¿Cuál es la nueva regla de handoff?

Sección 8 documenta las 6 condiciones (A-F). La regla central:
- **`reason='qualified'` requiere TIMING + BUDGET + ZONA + ACEPTACIÓN de propiedad (AND, no OR)**.
- **Frustración → `reason='manual'` con prefijo `[frustrated]` en summary**.
- **Active shopper que pide visita → `reason='scheduling'` inmediato (no necesita TIMING+BUDGET completo)**.

### 12.4 ¿Qué se elimina del flow SPSP actual?

**Eliminamos:**
- La obligación de pasar por los 6 stages secuencial para todos los leads.
- El cuestionario completo de Stage 1 (4 preguntas) para perfiles info-only / browser.
- El bloque de Stage 3 ("imaginate la nueva casa...") para perfiles que no son "Mover".

**Mantenemos:**
- Los stages 0-6 como mapa MENTAL del agente, pero solo aplicable al perfil "Mover" (= el que el SPSP fue diseñado para).
- Las objeciones (Aclarar → Discutir → Desarmar) cuando aparecen.
- El "máximo 3 propiedades por mensaje" en presentación.

### 12.5 Métricas a instrumentar para detectar drift

Sin instrumentación, no sabemos si v4 funciona. Propuesta MÍNIMA (no requiere nueva migration en v4 — usar lo existente):

| Métrica | Cómo medir (hoy) | Target |
|---|---|---|
| % handoffs con `reason='qualified'` que terminan en visita real | Cruzar `conversations.handoff_reason='qualified'` con `events` agendados en 7 días | > 40% |
| % handoffs con `reason='manual'` que el summary empieza con `[frustrated]` | Buscar summary LIKE '[frustrated]%' en `conversations.handoff_summary` | Esperamos 5-15% del total |
| Turnos hasta handoff (mediana) | Count de mensajes en `conversations.messages` al momento de `handoff_at` | < 6 turnos |
| % conversaciones con >7 turnos sin handoff | Conv abiertas con `message_count > 7 AND handoff_status='none'` | < 10% |
| `[frustrated]` por agency por semana | Trend SQL sobre `handoff_summary` | Bajar mes sobre mes |

Implementación: queries de monitoreo en Supabase, vista materializada opcional. **NO bloqueante** para entrega de v4.

---

## 13. Lo que NO está en scope de v4

- **Migración SQL de enum** de `conversation_handoff_reason` para agregar `frustrated` y `info_only_closed`. Mapeo a `manual` con prefijo de summary es suficiente para v4.
- **Modificación del Detector de Descalizacion como nodo separado** más allá de actualizar 1 bullet en su prompt. Su refactor profundo queda para v5.
- **Nueva tool de "extraer perfil de lead"**. La clasificación ocurre dentro del prompt del agente único.
- **Cambios en el pipeline de entrada** (Webhook, Switch, Audio, Apify). Todo lo pre-agente queda igual.
- **UI del inbox** para destacar `[frustrated]` / `[info-only-closed]`. Iteración futura.

---

## 14. Resumen ejecutivo (para el orquestador)

| Aspecto | v3 (bug) | v4 (rediseño) |
|---|---|---|
| Agentes | 1 unificado, flow lineal SPSP | 1 unificado, flow bifurcado por perfil |
| Perfiles de lead | 1 ("Mover") | 5 (info-only, active shopper, hot, investor, browser) + "Mover" como sub-tipo |
| Preguntas máximas | 9 en SPSP completo | 5 totales, distribuidas según perfil |
| Cuándo da precio | Stage 5 | Turno 1 si lo piden (cultura LATAM) |
| Trigger `qualified` | "Interés concreto" (vago) | AND de TIMING + BUDGET + ZONA + ACEPTACIÓN |
| Detección frustración | Ninguna | Lista cerrada de 7+ señales → handoff `manual [frustrated]` |
| Detección investor | Ninguna | Perfil dedicado con lenguaje ROI/cap rate |
| Temperature | 0.3 | 0.2 |
| Cambios en nodos | N/A | Solo refactor de prompt + descriptions de tools + sticky |

**Workflow esperado:** `n8n/workflows/chatbot-inmobiliaria-demo-ycloud-sofia-v4.json` con `active=false`. Founder reimporta + activa manualmente. Cero migraciones SQL. Cero edge functions nuevas.
