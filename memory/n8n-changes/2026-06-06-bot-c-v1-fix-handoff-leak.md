# Spec: bot-c v1 — Fix leak de format-instructions + handoff al aceptar la llamada

**Fecha:** 2026-06-06
**Autor:** n8n-architect
**Workflow afectado:** `crm-v2/n8n/workflows/chatbot-momentum-bot-c-v1.json` (LIVE, id N8N `Jsh4krhC9HRUh7Ly`, name "Chatbot Momentum - bot-c v1", 98 nodos)
**Versión actual → propuesta:** in-place via build script `set7` (convención del proyecto: NO se versiona a `vN.json`, se editan secuencialmente `set1..set6`; este es `set7`)
**Trigger del cambio:** bug en producción — lead calificado aceptó la llamada y el bot le filtró las instrucciones de schema JSON del Structured Output Parser ("You must format your output as a JSON value...") en vez de hacer handoff.

> **Nota de scope para el builder:** esta spec contiene **dos artefactos de deploy distintos** que NO se mezclan:
> 1. **Workflow JSON** (P0a, P0b, P1a) → build script `set7` + PUT a N8N.
> 2. **`bot_config.custom_instructions`** (P1b) → editar `clients/momentum-ai-crm/prompts/agente-principal.md` + espejo `_compiled/agente-principal.txt`, luego `node crm-v2/scripts/update-momentum-bot-config.js`. NO toca el workflow JSON.
> Aplicar en el orden de la sección 12.

---

## 1. Problema / requerimiento

Un lead calificado, después de que el bot ofreció la llamada ("te queda mejor lunes o miércoles?"), respondió **"miércoles"**. En vez de disparar el handoff silencioso, el bot le envió al lead el texto crudo de las format-instructions del parser de LangChain. Es un leak catastrófico: rompe la ilusión del bot y expone interno técnico al lead en producción.

El founder quiere dos cosas: (a) que **nunca** pueda volver a filtrarse texto interno aunque falle cualquier nodo upstream (defense-in-depth), y (b) que el bot haga handoff **apenas el lead acepta la llamada de cualquier forma** (un "dale", un día, "agendemos"), sin seguir negociando el día.

## 2. Estado actual relevante

Cadena de causa raíz verificada contra el JSON real:

1. **Router** (`Router`, `informationExtractor` v1.2, id `set2-router-extractor-0001`) clasificó "miércoles" como `AGENTE_PRINCIPAL` con `motivo="respuesta ambigua, default seguro"` y `datos_extraidos.lead_listo_para_agendar=false`. El prompt YA tiene la regla correcta (regla de decisión #1 → HANDOFF_HUMANO si `lead_listo_para_agendar=true`), pero el LLM **no marcó el flag** para un día suelto sin "dale/agendemos". El bug NO es una regla de destino faltante: es la **lógica de extracción/decisión** que no reconoce un día suelto como aceptación.
2. **Agente Principal** (`Agente Principal`, `@n8n/n8n-nodes-langchain.agent` v2.2, id `sofia-c-agent-f6-c01`), por su regla de prompt ETAPA 4 "cuando el lead da día/horario VOS NO RESPONDES", devolvió output **vacío** (`""`).
3. **Formateador de Mensajes** (`Formateador de Mensajes`, `@n8n/n8n-nodes-langchain.chainLlm` v1.5, id `c1186d30-...`) recibió `$json.output` vacío. Su `text` es `=Respuesta a formatear: {{ $json.output }}` y tiene el `Structured Output Parser1` (id `f3b4...`, jsonSchemaExample mode) colgado por `ai_outputParser`. Sin texto que formatear, el chain **filtró las format-instructions del parser** al lead. **Este es el leak.**

Topología confirmada (connections del JSON, líneas 3639-3801):

- `Switch — Destino Router` (id `set2-switch-destino-0001`, switch v3.2) → 4 salidas: out#0 `AGENTE_PRINCIPAL`→`Agente Principal`, out#1 `AGENTE_OBJECIONES`→`Agente Objeciones`, out#2 `HANDOFF_HUMANO`→`Silent Handoff Apagar Bot`, out#3 `BACKUP`→`Agente Principal`.
- `Agente Principal` main out#0 → **`["Cargar Tags Permitidos", "Formateador de Mensajes"]`** (cascada extractor + formateador en paralelo).
- `Agente Objeciones` (id `set2-agente-objeciones-0001`) main out#0 → **`["Cargar Tags Permitidos", "Formateador de Mensajes"]`** (idéntico al Principal — confirmado, va a ambos).
- `Silent Handoff Apagar Bot` (Postgres, id `set2-handoff-apagar-bot-0001`) → `Notificar Equipo Handoff` (HTTP bot-actions, id `set2-handoff-notify-equipo-0001`) → dead-end (no manda mensaje al lead, correcto).
- `Formateador de Mensajes` → `Limpiar Puntuacion` → `Split Out` → `Expand Property Images` → `Loop Over Items` → (`Mensaje no vacio?` IF) → `Send Chunk via YCloud`.

**Bug adicional confirmado en `Silent Handoff Apagar Bot`** (query actual, líneas 2480-2481):
```sql
UPDATE public.conversations
SET bot_apagado = true,
    handoff_status = 'active',
    handoff_reason = COALESCE(handoff_reason, 'router_handoff'),
    updated_at = NOW()
WHERE id = $1
RETURNING id
```
Tres errores, verificados contra schema real:
1. `bot_apagado` **no existe** como columna en `conversations` (migración 0003, líneas 77-82: las columnas son `handler`, `bot_paused_until`, `handoff_status`, `handoff_reason`, `handoff_summary`, `handoff_at`).
2. `handoff_status = 'active'` es **inválido** — el enum `conversation_handoff_status` (migración 0001 L41) solo acepta `'none' | 'pending' | 'handled'`. No existe `'active'`.
3. `handoff_reason = 'router_handoff'` es **inválido** — el enum `conversation_handoff_reason` (migración 0001 L42-44) solo acepta `'qualified' | 'scheduling' | 'objection_complex' | 'bot_stuck' | 'user_requested' | 'manual'`. No existe `'router_handoff'`.

Hoy este nodo está blindado por `onError: continueRegularOutput`, por eso el workflow no explota en rojo: el UPDATE falla silenciosamente y **NO apaga el bot**. El handoff que SÍ funciona hoy es el OTRO camino: cascada extractor → `Switch3 — handoff_reason ≠ none?` → `HTTP — handoff.escalate` → edge fn `bot-actions` (handler `handoff.escalate`, `index.ts` L1036-1048) que setea `handler='human'`, `handoff_status='pending'`, `handoff_reason=<enum válido>`, `handoff_summary`, `handoff_at` con guard idempotente `.neq("handoff_status","pending")`.

> **Conclusión clave:** el camino `Switch — Destino Router → HANDOFF_HUMANO → Silent Handoff Apagar Bot` está **roto desde que se creó** (set2). Cuando el Router clasifica HANDOFF_HUMANO directo, el bot **NO se apaga** por este nodo. El P0a (guard) y el P0b (fix query) son ambos necesarios: P0a evita el leak, P0b hace que el handoff realmente apague el bot.

## 3. Cambio propuesto

### 3.1 Nodos a crear

| Nombre | Type | typeVersion | Posición aprox. | Parámetros críticos |
|---|---|---|---|---|
| `Guard Output Vacio?` | `n8n-nodes-base.if` | 2.2 | `[1556, 920]` (entre los agentes en x≈1736 y el Formateador en x≈2176; ubicarlo a la izquierda del Formateador, fuera del solapamiento con el Router x≈1456) | Una condición string `notEmpty` sobre el output del agente. Ver §3.6 para el valor exacto. **Clonar estructura del IF `Mensaje no vacio?`** (id `48cc3a86-...`, L1031-1071) que ya usa el patrón `notEmpty` sobre una expresión string — NO clonar `Tiene Link?` (ese usa operator boolean `true`, menos robusto para detectar vacío). |

> **Por qué un solo nodo guard y no uno por agente:** ambos agentes (Principal y Objeciones) alimentan el mismo Formateador. Un único IF intermedio cubre los dos caminos. Pero como el IF necesita leer el output del agente que disparó, la expresión debe resolverse contra `$json.output` del item entrante (que es el output del agente upstream, sea cual sea), NO contra `$('Agente Principal')` hardcoded. Ver §3.6.

### 3.2 Nodos a modificar

| Nombre | Qué cambia | Por qué |
|---|---|---|
| `Silent Handoff Apagar Bot` (id `set2-handoff-apagar-bot-0001`) | Reemplazar el `query` completo (P0b). Ver §3.7 para el SQL final exacto. | El query usa `bot_apagado` (columna inexistente) + dos literales de enum inválidos. Hoy falla silencioso por `onError`. |
| `Router` (id `set2-router-extractor-0001`) | Edición quirúrgica del `systemPromptTemplate` (P1a). Ver §3.8 para el diff exacto. NO reescribir los ~7,120 chars. | El Router no marca `lead_listo_para_agendar=true` para un día suelto ("miércoles") respuesta a una propuesta de llamada. Hay que reforzar la señal de extracción y bajar el "eager" del default seguro para este caso. |

### 3.3 Nodos a borrar

| Nombre | Razón |
|---|---|
| (ninguno) | No se borra ningún nodo. El cambio es aditivo (1 nodo guard) + 2 ediciones in-place. |

### 3.4 Conexiones a crear

- `Guard Output Vacio?` main out#0 (TRUE = tiene contenido) → `Formateador de Mensajes` (main, index 0)
- `Guard Output Vacio?` main out#1 (FALSE = vacío) → `Silent Handoff Apagar Bot` (main, index 0)
- `Agente Principal` main out#0 → `Guard Output Vacio?` (main, index 0)  *(reemplaza el target `Formateador de Mensajes`; ver §3.5)*
- `Agente Objeciones` main out#0 → `Guard Output Vacio?` (main, index 0)  *(reemplaza el target `Formateador de Mensajes`; ver §3.5)*

### 3.5 Conexiones a borrar

- `Agente Principal` main out#0 → `Formateador de Mensajes` (se reemplaza por la conexión al guard). **CONSERVAR** `Agente Principal` main out#0 → `Cargar Tags Permitidos` (la cascada extractor NO cambia).
- `Agente Objeciones` main out#0 → `Formateador de Mensajes` (se reemplaza por la conexión al guard). **CONSERVAR** `Agente Objeciones` main out#0 → `Cargar Tags Permitidos`.

> **Resultado de cada agente** (estado final de la conexión main out#0):
> ```
> Agente Principal  main[0] = [ {Cargar Tags Permitidos}, {Guard Output Vacio?} ]
> Agente Objeciones main[0] = [ {Cargar Tags Permitidos}, {Guard Output Vacio?} ]
> ```
> Es decir: en el array de targets de `main[0]`, se reemplaza la entry `{node:"Formateador de Mensajes"}` por `{node:"Guard Output Vacio?"}`, dejando la entry `{node:"Cargar Tags Permitidos"}` intacta. **NO** se toca la rama hacia `Cargar Tags Permitidos`.

> **Importante (regla rename del proyecto, principios-desarrollo §"renombrar nodo"):** este cambio NO renombra ningún nodo, así que no hay refs huérfanas que reparar. Pero el builder DEBE verificar que ninguna expresión hardcoded en otros nodos referencia `Formateador de Mensajes` esperando que reciba directo del agente. (Verificado por el arquitecto: el Formateador lee `{{ $json.output }}` del item entrante, que ahora viene del guard pasando-through el item del agente. El guard IF **no transforma** el item, solo rutea — `$json.output` sigue presente. OK.)

### 3.6 Lógica del nodo guard (P0a) — valor exacto de la condición

El IF debe rutear por contenido del output del agente. Patrón robusto (clonado de `Mensaje no vacio?`, que usa `notEmpty` sobre un string derivado):

- **Operator:** `{ type: "string", operation: "notEmpty", singleValue: true }`
- **leftValue (expresión):**
  ```
  ={{ (($json.output ?? '') + '').trim() }}
  ```
- **rightValue:** `""` (ignorado por `notEmpty` singleValue, pero presente por estructura del nodo v2.2)
- **options:** `{ caseSensitive: true, typeValidation: "strict", version: 2 }`, **combinator:** `"and"`

Semántica del IF v2.2: **out#0 = condición TRUE** (string no vacío → hay contenido → al Formateador), **out#1 = condición FALSE** (string vacío → al Silent Handoff).

> **Por qué `(($json.output ?? '') + '').trim()`:** cubre `null`, `undefined`, string vacío, y string de solo-espacios/saltos de línea. El agente puede devolver `""`, `null`, `"   "`, o `"\n"`. Todos deben rutear a handoff. NO usar solo `{{ $json.output }}` porque `notEmpty` sobre `null`/`undefined` tiene comportamiento ambiguo en n8n v2.2 (lección feedback-n8n-build #8: usar expresiones defensivas).

> **Edge de coalescing de items:** el guard recibe el item del agente. Después de un nodo Agent, el pairedItem chain puede romperse (feedback-n8n-build #8). Por eso la expresión usa `$json.output` (item entrante directo), NO `$('Agente Principal').first().json.output` (que rompería si el item viene del Agente Objeciones). El builder debe confirmar que `$json` en el guard refiere al item que llega por la conexión main (sí lo hace; el IF opera sobre su input directo).

### 3.7 Query final exacto de `Silent Handoff Apagar Bot` (P0b)

Reemplazar el `parameters.query` por (mirror del comportamiento de `bot-actions` handoff.escalate, `index.ts` L1036-1048):

```sql
UPDATE public.conversations
SET handler         = 'human',
    handoff_status  = 'pending',
    handoff_reason  = COALESCE(handoff_reason, 'user_requested'),
    handoff_at      = COALESCE(handoff_at, NOW()),
    bot_paused_until = GREATEST(COALESCE(bot_paused_until, NOW()), NOW() + interval '24 hours'),
    updated_at      = NOW()
WHERE id = $1
  AND handoff_status <> 'pending'
RETURNING id
```

Notas de diseño (el builder NO improvisa, usa esto literal salvo donde se indica validar):

- **`handler = 'human'` es el kill-switch real.** El nodo `Chatbot Activado?` (id `ad8ed246-...`, L460-468) gatea con `handler = 'bot'` AND `bot_paused_until` vencido/null AND `bot_enabled`. Con `handler='human'` el bot deja de responder en el próximo turno. Esto es lo que hace `bot-actions` y es la fuente de verdad.
- **`handoff_status = 'pending'`** (NO `'active'`). `'pending'` = enum válido + es el valor que usa el camino que funciona + lo que la UI del inbox espera para la pill pulsante de handoff.
- **`handoff_reason = COALESCE(handoff_reason, 'user_requested')`**: `'user_requested'` es el enum válido más cercano semánticamente al caso "el lead aceptó/pidió avanzar y el bot se sale". **El builder debe confirmar con el founder** si prefiere `'qualified'` o `'scheduling'` para el caso "aceptó la llamada" — los tres son válidos; el arquitecto sugiere `'scheduling'` para el caso de agendamiento y `'user_requested'` para el caso "pidió humano". Como este nodo cubre AMBOS (el Switch HANDOFF_HUMANO agrupa "aceptó agendar" + "pide humano" + "frustración" + "objeción repetida" + "fuera de scope"), `'user_requested'` es el default seguro genérico. **Decisión pendiente de validar; default `'user_requested'`.**
- **`WHERE ... AND handoff_status <> 'pending'`**: guard idempotente (igual que la edge fn). Evita doble-handoff y doble-notificación si el lead manda dos mensajes seguidos que ambos rutean a HANDOFF_HUMANO. `alwaysOutputData: true` + `onError: continueRegularOutput` ya están seteados — MANTENERLOS.
- **`bot_paused_until`**: estrictamente REDUNDANTE con `handler='human'` (el gate ya falla con handler human). Se incluye como defensa-en-profundidad (si un admin reactiva `handler='bot'` manualmente sin limpiar el pause, el bot sigue callado 24h). `GREATEST(...)` evita acortar un pause más largo preexistente. **Si el builder prefiere minimizar el cambio, puede omitir la línea `bot_paused_until`** — `handler='human'` solo ya cumple el requisito. Documentar la decisión.

> **Verificación obligatoria del builder antes de fijar literales:** correr `\d+ public.conversations` (o leer migración 0003 L77-82) y `SELECT enum_range(NULL::conversation_handoff_status)` + `SELECT enum_range(NULL::conversation_handoff_reason)` contra prod para confirmar que los enums no cambiaron desde 0001. (Arquitecto verificó contra el SQL de migraciones; el builder confirma contra DB viva.)

### 3.8 Edición quirúrgica del `systemPromptTemplate` del Router (P1a)

**Regla del kit (NO negociable):** el `systemPromptTemplate` NO debe contener llaves `{` `}` literales (feedback-n8n-build #2 y #3). Todas las ediciones de abajo son prosa sin llaves. El builder DEBE contar llaves después de editar: si hay alguna llave literal nueva, refactorizar.

El prompt ya tiene la regla de decisión y el destino correctos. El bug es que el LLM no setea `lead_listo_para_agendar=true` para un día suelto. Tres ediciones mínimas:

**Edición 1 — Ampliar la sección `### HANDOFF_HUMANO` punto a)** (actualmente líneas que empiezan con "a) lead_listo_para_agendar es true..."). Reemplazar el bloque de ejemplos de aceptación por una lista más amplia y explícita de formas de aceptar:

> Texto NUEVO del punto a) (reemplaza el actual):
> ```
> a) El lead ACEPTA la llamada, la senal MAS importante
> Si el bot ya propuso una llamada en algun turno anterior Y el lead responde aceptando de CUALQUIER forma, marca lead_listo_para_agendar en true y rutea a HANDOFF_HUMANO. Formas de aceptar que cuentan
> - Un dia o fecha sola, manana, miercoles, el jueves, la proxima semana, pasado, hoy, el lunes
> - Un dia con horario, el jueves a las 3, manana en la tarde, pasado en la manana
> - Aceptacion corta, si, dale, listo, de una, me parece, buenisimo, perfecto, va, cuando quieras, claro
> - Aceptacion explicita de agendar, agendemos, coordinemos, cuando nos hablamos, dale agendemos
> Si el bot ofrecio dos opciones de dia (por ejemplo lunes o miercoles) y el lead contesta UNA de las dos, eso es aceptacion, marca lead_listo_para_agendar en true. NO lo trates como respuesta ambigua
> ```

**Edición 2 — Reforzar la regla de extracción de `lead_listo_para_agendar`** (sección `## CAMPOS A EXTRAER`, viñeta "lead_listo_para_agendar es true solo cuando..."). Reemplazar por:

> ```
> - lead_listo_para_agendar es true cuando el bot YA propuso una llamada en algun turno previo Y el lead responde aceptando de cualquier forma, un dia, una fecha, un horario, un si, un dale, un me parece, o agendemos. Si el bot ofrecio opciones de dia y el lead eligio una, es true. Solo queda false si el bot nunca propuso llamada, o si el lead pregunta otra cosa en vez de aceptar
> ```

**Edición 3 — Corregir el ejemplo ambiguo que causó el bug** (sección `## EJEMPLOS REALES`, línea 'Mensaje "mmm" o "ok" o "entiendo" → AGENTE_PRINCIPAL, motivo "respuesta ambigua, default seguro"'). Agregar INMEDIATAMENTE ANTES de ese ejemplo un ejemplo positivo de día suelto, y acotar el ejemplo ambiguo:

> Texto NUEVO a insertar (antes del ejemplo "mmm/ok/entiendo"):
> ```
> Mensaje "miercoles" cuando el bot recien ofrecio lunes o miercoles para la llamada
> destino HANDOFF_HUMANO, motivo "lead_acepto_agendar"
> lead_listo_para_agendar true
>
> Mensaje "dale" o "me parece" cuando el bot acaba de proponer la llamada
> destino HANDOFF_HUMANO, motivo "lead_acepto_agendar"
> lead_listo_para_agendar true
> ```
> Y acotar el ejemplo ambiguo existente para que NO se aplique cuando hay propuesta de llamada en el turno previo:
> ```
> Mensaje "mmm" o "ok" o "entiendo" cuando NO hubo una propuesta de llamada en el turno anterior
> destino AGENTE_PRINCIPAL, motivo "respuesta ambigua, default seguro"
> ```

**Edición 4 — Acotar la REGLA DE DEFAULT SEGURO** (sección "REGLA DE DEFAULT SEGURO", para que no compita con la aceptación de llamada). Agregar una frase al final del bloque:

> ```
> EXCEPCION al default seguro, si el bot ya propuso una llamada en el turno anterior, una respuesta corta o un dia suelto NO es ambiguedad, es aceptacion. En ese caso va a HANDOFF_HUMANO, no a AGENTE_PRINCIPAL
> ```

> **Sincronización fuente → nodo (obligatoria):** el prompt fuente vive en `clients/momentum-ai-crm/prompts/router-classifier.md` (bloque "System Prompt", líneas ~26-200). El builder DEBE aplicar las 4 ediciones AL .md primero, y el build script `set7` lee/inyecta ese texto al `systemPromptTemplate` del nodo `Router` (o lo aplica inline replicando el .md exacto). El .md y el nodo NO pueden divergir. Si el set7 hardcodea el texto, debe ser byte-idéntico al .md.

> **Conteo de chars:** las 4 ediciones suman ~+650 chars al prompt (de ~7,120 a ~7,770). Sigue dentro de tolerancia para gpt-4.1-mini (≤5,000 es el target del kit, pero el Router actual ya está en 7,120 y funciona; +650 no degrada materialmente). Si el founder quiere recortar, los ejemplos viejos redundantes ("dale manana en la tarde" ya cubierto) pueden consolidarse — pero NO en este cambio (es optimización aparte).

### 3.9 Cambio en `bot_config.custom_instructions` (P1b) — artefacto SEPARADO del workflow

Este cambio NO toca el JSON del workflow. Edita el prompt del Agente Principal y se deploya con `update-momentum-bot-config.js`.

**Archivos fuente a editar (ambos, deben quedar idénticos):**
- `clients/momentum-ai-crm/prompts/agente-principal.md` (espejo legible, bloque System Prompt L36-194)
- `clients/momentum-ai-crm/prompts/_compiled/agente-principal.txt` (el que LEE el deploy script, L37 del script)

**Cambio en ETAPA 4 (líneas ~123-141 del .md):** el bot propone la llamada UNA vez (cierre asuntivo permitido) y NO sigue pidiendo día/hora en turnos sucesivos. Apenas el lead acepta, el sistema hace handoff y Hans coordina.

**Diff de texto exacto:**

1. **Mantener** la línea actual (L140): *"Cuando el lead responde con dia, horario o 'agendemos', el sistema lo detecta y el equipo toma la conversacion manualmente. VOS NO RESPONDES ese mensaje."* — esta regla se queda.

2. **Agregar** inmediatamente después de esa línea (nuevo párrafo en ETAPA 4):
   > ```
   > Proponé la llamada UNA sola vez. Si ya la propusiste en un turno anterior y el lead todavia no acepto, NO vuelvas a empujar dia ni hora ni a re-preguntar cuando le queda mejor. Respondé lo que el lead pregunte y dejá la puerta abierta, pero la propuesta de agendar se hace una vez, no se repite turno a turno. Apenas el lead acepta de cualquier forma, un dia, un horario, un dale, un me parece, el sistema toma la conversacion y Hans coordina el detalle. Vos no negocias el dia
   > ```

3. **Reforzar** la regla #10 de "15 COSAS QUE NUNCA HACES" (L168). Cambiar el final de la regla 10 para incluir la no-repetición:
   > De: *"...Solo agendas con el gate cumplido"*
   > A: *"...Solo agendas con el gate cumplido. Y NUNCA re-preguntas el dia o la hora en turnos sucesivos despues de haber propuesto la llamada una vez"*

> **Por qué este cambio es chico y quirúrgico:** principios-desarrollo §"sobreingenierizar" y §"confundir bot_config con workflow". NO se reescribe el prompt. Se agregan ~480 chars. El conteo final debe seguir en rango gpt-4.1-mini (≤5,000). El builder reporta el char count post-edición (regla del kit: SIEMPRE reportar conteo de chars).

## 4. Schemas

### Output del agente (input al guard)
El item que entra al `Guard Output Vacio?` es el output del nodo Agent:
```json
{ "output": "<texto del bot>" | "" | null }
```
El guard NO transforma; pasa el item through a la rama elegida. El Formateador downstream sigue leyendo `{{ $json.output }}` igual que hoy.

### Query de Silent Handoff (output)
```json
[{ "id": "<uuid conversation>" }]   // 1 row si afectó, 0 rows si ya estaba pending (idempotente)
```

### Router output (sin cambios de shape; solo cambia la lógica que lo llena)
```json
{
  "output": {
    "destino": "HANDOFF_HUMANO",
    "motivo": "lead_acepto_agendar",
    "datos_extraidos": { "lead_listo_para_agendar": true, "...": "..." }
  }
}
```

## 5. Variables de entorno requeridas
- Ninguna nueva. `Silent Handoff Apagar Bot` usa credencial Postgres existente `CRM System` (id `pMsxqUvr0wDZsjIt`). `Notificar Equipo Handoff` usa `$env.BOT_ACTIONS_SECRET` + `$env.SUPABASE_V2_URL` (ya seteadas, sin cambio). El deploy de `bot_config` usa `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` del `crm-v2/.env.local` (ya existentes).

## 6. Riesgos previstos (OBLIGATORIO)

1. **El guard rutea un output legítimamente vacío de un caso que NO es handoff** — probabilidad BAJA. El único caso donde el agente devuelve vacío legítimamente es el handoff (lead aceptó la llamada). Si en el futuro se agrega otro caso de "agente calla a propósito que NO es handoff", el guard lo mandaría a handoff por error. **Mitigación:** documentar en sticky note del guard que "output vacío == handoff intencional" es la semántica asumida; si cambia, revisar el guard. Hoy no hay otro caso (verificado en el prompt del Agente Principal: la única instrucción de callar es ETAPA 4 handoff).

2. **`handoff_reason` enum equivocado para el caso** — probabilidad MEDIA. El nodo Silent Handoff agrupa 5 sub-casos (aceptar agendar, pedir humano, frustración, objeción repetida, fuera de scope) bajo un solo `handoff_reason`. Si el founder/inbox espera distinguirlos, `'user_requested'` genérico pierde info. **Mitigación:** el `motivo` del Router viaja a `Notificar Equipo Handoff` (param `router_motivo`) y queda en el audit/inbox. El `handoff_reason` de la columna es secundario. Validar con founder cuál enum prefiere (§3.7). Alta-fidelidad sería derivar el reason del `$('Router').first().json.output.motivo` con un mapeo, pero eso agranda el cambio — fuera de scope de este fix.

3. **El Router ahora hace handoff DEMASIADO eager** (falsos positivos: "miércoles" cuando el lead pregunta "el miércoles tienen descuento?" no es aceptación) — probabilidad MEDIA. Ampliar las formas de aceptación puede capturar mensajes que mencionan un día sin aceptar. **Mitigación:** las 4 ediciones del prompt condicionan la aceptación a "el bot YA propuso una llamada en el turno anterior". Un día mencionado sin propuesta previa de llamada NO dispara handoff. El ejemplo "mmm/ok cuando NO hubo propuesta" refuerza esto. Aun así, el reviewer debe correr el caso edge "lead menciona un día en una pregunta, sin que el bot haya propuesto llamada" (§7.6).

4. **Romper la rama `Cargar Tags Permitidos` al rewirear el Formateador** — probabilidad MEDIA si el builder edita `connections` a mano. **Mitigación:** §3.5 especifica que SOLO se reemplaza la entry `Formateador de Mensajes` por `Guard Output Vacio?` dentro del array de targets, dejando `Cargar Tags Permitidos` intacto. Smoke test obligatorio: después del build, verificar que `connections["Agente Principal"].main[0]` y `connections["Agente Objeciones"].main[0]` cada uno contiene exactamente 2 targets: `Cargar Tags Permitidos` + `Guard Output Vacio?` (ningún `Formateador de Mensajes` directo).

5. **El query de Silent Handoff sigue fallando silencioso por `onError`** — probabilidad BAJA pero CRÍTICA si pasa. Si el SQL nuevo tiene un typo de enum, `onError: continueRegularOutput` lo traga y el bot NO se apaga (mismo bug que hoy). **Mitigación:** el reviewer DEBE verificar DB state post-test (principios-desarrollo §"fail-open silencioso"): después de disparar un handoff de prueba, query `SELECT handler, handoff_status, handoff_reason FROM conversations WHERE id=<x>` y confirmar `handler='human'`. NO confiar en que el nodo "ejecutó OK". Considerar temporalmente cambiar `onError` a `stopWorkflow` durante el QA y revertir a `continueRegularOutput` antes de merge — decisión del builder/reviewer.

6. **`set7` build script rompe nodos no relacionados** (98 nodos, edición programática) — probabilidad MEDIA. **Mitigación:** snapshot + tag git ANTES (§9). Smoke test: count de nodos == 99 (98 + 1 guard), presencia de nodos críticos por id, conteo de refs huérfanas == 0 (principios-desarrollo §rename, aunque acá no hay rename, el check de refs es barato).

## 7. Casos edge a contemplar (OBLIGATORIO)

1. **Happy path — flujo normal (lead pregunta info):** lead manda "cuanto cuesta". Router → `AGENTE_PRINCIPAL`. Agente devuelve texto. `Guard Output Vacio?` → TRUE (out#0) → `Formateador de Mensajes` → ... → `Send Chunk via YCloud`. Lead recibe respuesta normal. **El guard es transparente.**

2. **Lead acepta corto ("dale me parece") tras propuesta de llamada:** Router (con P1a) marca `lead_listo_para_agendar=true`, `destino=HANDOFF_HUMANO`. Switch out#2 → `Silent Handoff Apagar Bot` (con P0b setea `handler='human'`) → `Notificar Equipo Handoff` → dead-end. **El lead NO recibe nada. El bot queda apagado.** El guard NO participa en este camino (el handoff se decide en el Router, antes del agente).

3. **Lead da un día ("miércoles") tras propuesta de llamada:** idéntico al caso 2. Router con P1a marca el flag y rutea a HANDOFF_HUMANO directo. **Caso del bug original — ahora resuelto en dos capas: (a) Router clasifica bien, (b) si por alguna razón el Router fallara y mandara al Agente Principal, el agente devuelve vacío y el guard lo manda a handoff sin leak.**

4. **Agente devuelve vacío por CUALQUIER razón (incluso un bug futuro):** sea Principal u Objeciones, output `""`/`null`/`"   "`. `Guard Output Vacio?` → FALSE (out#1) → `Silent Handoff Apagar Bot`. **NUNCA llega al Formateador → NUNCA se filtran las format-instructions.** Defense-in-depth cumplido.

5. **Objeción "es caro" (primera vez):** Router → `AGENTE_OBJECIONES`. Agente Objeciones devuelve texto. `Guard Output Vacio?` → TRUE → `Formateador` normal. **El guard cubre el camino de Objeciones igual que el de Principal.**

6. **Falso positivo de día — lead menciona un día SIN que el bot haya propuesto llamada:** ej. lead pregunta "atienden los miércoles?". Router (con P1a) NO debe marcar `lead_listo_para_agendar=true` porque la condición es "el bot YA propuso una llamada en el turno anterior". → `AGENTE_PRINCIPAL`. **El reviewer DEBE probar este caso explícitamente (riesgo #3).**

7. **Lead manda audio/imagen/link:** sin cambio. El audio se transcribe (Whisper) y entra como texto al Router; imagen entra con el placeholder fijo; link se enriquece con Apify. Todos terminan como `userMessageFinal` → el flujo de Router/Agente/Guard es idéntico. El guard opera igual sobre el output del agente.

8. **Doble mensaje del lead que ambos rutean a HANDOFF_HUMANO** (manda "miércoles" y luego "a las 3"): el primero apaga el bot (`handler='human'`). El segundo: `Chatbot Activado?` ya da FALSE (handler human) → el bot ni siquiera procesa. Si por timing ambos entran antes del UPDATE, el guard `WHERE handoff_status <> 'pending'` hace el segundo UPDATE no-op (idempotente). **Sin doble handoff.**

## 8. Triggers de handoff (operacionalizados)

El cambio P1a redefine cuándo el Router dispara `HANDOFF_HUMANO` por aceptación de llamada. Condición operacional (no vaga):

> **Handoff por aceptación de llamada** dispara SI y SOLO SI:
> (a) el bot propuso explícitamente una llamada en el turno del bot inmediatamente anterior (o un turno previo cercano visible en el historial), **Y**
> (b) el mensaje actual del lead es una aceptación: un día/fecha sola, un día+horario, una afirmación corta (sí/dale/listo/me parece/buenísimo/va/claro/de una/cuando quieras), o una frase de agendar (agendemos/coordinemos/cuando nos hablamos).
>
> NO dispara si el lead menciona un día dentro de una pregunta distinta, o si el bot nunca propuso llamada. (Esto reescribe la regla vaga "respuesta ambigua → default seguro" que causó el bug del 2026-06-06.)

Los otros triggers de HANDOFF_HUMANO (pide humano explícito, frustración intensa, objeción repetida con `objeciones_count>=1`, pregunta técnica fuera de scope) **NO cambian** — ya están operacionalizados en el prompt actual.

## 9. Cambios fuera del workflow

- **Ninguna migración SQL.** Los enums y columnas ya existen (0001 + 0003). El fix solo usa columnas/valores correctos.
- **Ninguna edge function nueva.** `bot-actions` ya hace el handoff correcto; el Silent Handoff replica su UPDATE directo en SQL (decisión existente del set2: este camino hace el UPDATE inline + notifica via HTTP, en vez de delegar el UPDATE a la edge fn).
- **`bot_config.custom_instructions`** (P1b): deploy via `node crm-v2/scripts/update-momentum-bot-config.js` tras editar `_compiled/agente-principal.txt`. Backup automático del script previo. Rollback: PATCH con el backup.
- **Prompt fuente .md** (P1a): editar `clients/momentum-ai-crm/prompts/router-classifier.md` para mantener sincronía con el nodo.

## 10. Tests manuales que el reviewer debe correr

> Identificar la conversación de prueba por `conversation_id` y `lead_id` antes de empezar (el founder usa su propio WhatsApp +50688217229 contra businessPhone +50689839490, visto en pinData).

- **T1 (happy path):** lead manda "hola quiero info" → bot responde normal (texto, bien formateado). Verificar: `SELECT direction, body FROM messages WHERE conversation_id=<x> ORDER BY created_at DESC LIMIT 4` → último outbound es texto del bot, NO format-instructions.
- **T2 (aceptación día — caso bug):** simular historial donde el bot propuso "lunes o miércoles", lead manda "miércoles". Verificar: lead NO recibe nada (`messages` sin nuevo outbound) **Y** `SELECT handler, handoff_status, handoff_reason, handoff_at FROM conversations WHERE id=<x>` → `handler='human'`, `handoff_status='pending'`. **Y** `SELECT destino, motivo FROM bot_turns WHERE conversation_id=<x> ORDER BY created_at DESC LIMIT 1` (o el campo donde se loguea el router output) → `destino=HANDOFF_HUMANO`.
- **T3 (aceptación corta):** mismo setup, lead manda "dale me parece". Mismo resultado que T2.
- **T4 (guard defense-in-depth):** forzar (vía eval-harness o pin) un output vacío del Agente Principal con destino AGENTE_PRINCIPAL. Verificar: lead NO recibe format-instructions; `conversations.handler='human'`. **Este es el test que prueba que el leak está muerto.**
- **T5 (objeción → formateador normal):** lead manda "es caro" (primera objeción). Verificar: Router→AGENTE_OBJECIONES, lead recibe respuesta de manejo de objeción bien formateada.
- **T6 (falso positivo de día — riesgo #3):** SIN que el bot haya propuesto llamada, lead manda "atienden los miércoles?". Verificar: Router→AGENTE_PRINCIPAL, `conversations.handler` sigue `='bot'`, lead recibe respuesta normal. **NO debe hacer handoff.**
- **T7 (idempotencia handoff):** disparar T2 dos veces seguidas. Verificar: `handoff_at` no cambia en el segundo (guard `<> 'pending'`), no hay doble row en el log de notificación.
- **T8 (regresión flujo normal completo):** conversación de 4-5 turnos de discovery sin handoff. Verificar que el guard no interfiere en ningún turno con respuesta no vacía.

## 11. Snapshot + tag git (OBLIGATORIO antes del build)

Política `n8n-workflow-versioning` + principios-desarrollo §inviolable #2.

```bash
# 1. Snapshot del LIVE actual (red de seguridad, inmutable)
node crm-v2/scripts/n8n-pull.mjs Jsh4krhC9HRUh7Ly
#   → guardar como crm-v2/n8n/workflows/snapshots/bot-c-v1-PRE-SET7-2026-06-06.json
#   (convención observada: bot-c-v1-PRE-<SET>-<fecha>.json)

# 2. Commit del snapshot ANTES de tocar nada (en la branch actual feat/obs-3-rate-limit-backup
#    o una branch nueva fix/bot-c-handoff-leak — NO main)
git add crm-v2/n8n/workflows/snapshots/bot-c-v1-PRE-SET7-2026-06-06.json
git commit -m "chore(n8n): snapshot bot-c v1 PRE-SET7 (fix handoff leak)"

# 3. Tag de rollback
git tag -a "bot-c-PRE-SET7-2026-06-06" -m "Punto seguro antes del fix de leak de format-instructions + handoff al aceptar"
```

**Rollback (si algo se rompe post-deploy):**
```bash
git checkout bot-c-PRE-SET7-2026-06-06 -- crm-v2/n8n/workflows/snapshots/bot-c-v1-PRE-SET7-2026-06-06.json
node crm-v2/scripts/n8n-push.mjs Jsh4krhC9HRUh7Ly crm-v2/n8n/workflows/snapshots/bot-c-v1-PRE-SET7-2026-06-06.json
# Para P1b: PATCH agencies.bot_config con el backup que generó update-momentum-bot-config.js
```

## 12. Orden de aplicación recomendado

**P0 primero** (matan el leak en producción), P1 después (mejora de comportamiento):

1. **Snapshot + tag** (§11). NO empezar sin esto.
2. **P0b** (fix query Silent Handoff) — sin esto, ningún camino de handoff apaga el bot. Es el cimiento.
3. **P0a** (guard de output vacío) — depende de que P0b funcione (el guard rutea AL Silent Handoff). Aplicar en el mismo `set7` que P0b.
4. **P1a** (Router prompt) — mejora la clasificación. Mismo `set7` (es edición del nodo Router).
5. Build `set7` → smoke tests → commit → PUT a N8N → tag de deploy → QA del founder (T1-T8).
6. **P1b** (bot_config) — artefacto SEPARADO. Editar .md + .txt → `update-momentum-bot-config.js`. Puede ir en paralelo o después del workflow; NO bloquea P0/P1a. Hacerlo después de que el workflow pase QA, para no mezclar variables de test.

## 13. Checklist de los 14 errores de feedback-n8n-build.md que aplican

- **#2 (Router = IE bien configurado):** el cambio P1a edita el `systemPromptTemplate` del IE existente, NO crea un "Router" nuevo. Mantener `typeVersion 1.2`, schema en `inputSchema`. ✅ aplica — verificar no romper.
- **#3 (llaves `{}` rompen LangChain):** las 4 ediciones del Router (P1a) y las del Agente Principal (P1b) son prosa SIN llaves literales. **Contar llaves post-edición; debe quedar igual o menos que antes.** ✅ crítico.
- **#5 (Postgres delete usa deleteTable):** N/A (Silent Handoff es UPDATE, no delete).
- **#6 (persistencia en paralelo):** el guard NO es un nodo de persistencia; es un IF de ruteo. La cascada `Cargar Tags Permitidos` (paralela al guard) se preserva intacta. ✅ verificar §3.5.
- **#8 (usar `.first()` no `.item`):** el guard usa `$json.output` (item directo), correcto post-Agent. NO usar `$('Agente X').item`. ✅ crítico.
- **#11 (nombres representativos):** `Guard Output Vacio?` es descriptivo. ✅.
- **#12 (sticky notes):** agregar/extender la sticky `Sticky - SET2 Agente Principal` (id `set2-sticky-agentprincipal-0001`) documentando el guard y el fix del query. ✅.
- **Regla de oro (validar antes de entregar):** el reviewer verifica output real de cada nodo tocado + DB state (no asumir). ✅ §10.
- **Atacar causa raíz no parchar:** P0a+P0b+P1a atacan las 3 capas (clasificación, handoff roto, leak). No es parche de los datos del test. ✅.

## 14. Handoff al builder

- **Workflow:** in-place sobre `crm-v2/n8n/workflows/chatbot-momentum-bot-c-v1.json` (convención del proyecto: set scripts secuenciales, NO `vN.json`).
- **Script de build esperado:** `crm-v2/scripts/build-bot-c-v1-set7-fix-handoff-leak.js` (clonar estructura de `build-bot-c-v1-set6-limpiar-post-formateador.js`).
- **Prompt fuente a sincronizar (P1a):** `clients/momentum-ai-crm/prompts/router-classifier.md`.
- **Prompt + deploy (P1b):** `clients/momentum-ai-crm/prompts/agente-principal.md` + `_compiled/agente-principal.txt` → `crm-v2/scripts/update-momentum-bot-config.js`.
- **Notas no-obvias al builder:**
  1. El camino `Switch HANDOFF_HUMANO → Silent Handoff` estuvo **roto desde set2** (query con `bot_apagado`). Tu fix P0b es la primera vez que ese camino realmente apaga el bot. Verificalo en DB, no en el response del nodo (está blindado con `onError`).
  2. **Clonar el IF de `Mensaje no vacio?` (no `Tiene Link?`)** para el guard — `notEmpty` sobre string es más robusto que el operator boolean.
  3. El guard NO transforma el item: `$json.output` debe seguir presente en la rama TRUE para que el Formateador funcione. Verificá esto en el smoke test (item passthrough).
  4. Confirmá el `handoff_reason` con el founder antes de fijar (`'user_requested'` default; alternativas `'scheduling'`/`'qualified'`).
  5. Smoke test del build: nodos == 99, `connections["Agente Principal"].main[0]` y `["Agente Objeciones"].main[0]` cada uno con 2 targets exactos (`Cargar Tags Permitidos` + `Guard Output Vacio?`), 0 refs huérfanas, 0 llaves literales nuevas en prompts.
- **Output de review esperado:** `memory/n8n-changes/2026-06-06-bot-c-v1-fix-handoff-leak-review.md` (PASS/FAIL del `n8n-reviewer`).
