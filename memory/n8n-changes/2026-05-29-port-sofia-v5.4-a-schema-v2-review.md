# Review: port-sofia-v5.4-a-schema-v2

**Fecha:** 2026-05-29
**Reviewer:** n8n-reviewer
**Spec:** memory/n8n-changes/2026-05-29-port-sofia-v5.4-a-schema-v2.md
**Build:** scripts/build-sofia-v5.5-v2schema.js → crm-v2/_n8n-sofia-v5.5-v2schema.json
**Baseline (diff):** crm-v2/_n8n-current.json (Sofia v5.4, capa de datos v1)
**Resultado:** 🟡 **PASS WITH WARNINGS**

> El port de la **capa de datos** está bien hecho, es quirúrgico (solo 4 nodos tocados, topología idéntica), idempotente, y no introduce ningún bug nuevo. Los WARNINGS son: (1) un bug-clase-A **pre-existente** en el handoff (reason siempre cae a `'qualified'`) que NO es de este alcance pero el founder DEBE conocer, (2) un gate de entrada hardcodeado a un solo número de prueba, y (3) sticky notes desactualizados. Ninguno bloquea el push del port; todos requieren acción/conocimiento del founder antes de prod real.

---

## 1. Checklist (skill n8n-workflow-audit)

| # | Check | Resultado | Evidencia |
|---|---|---|---|
| 1 | Integridad referencial `$('NodeName')` | ✅ PASS | `validate-n8n-expressions.js` → 0 violaciones, 57 nodos, 63 expr. Exit 0. |
| 2 | Conexiones huérfanas | 🟡 WARN | Nodo `If` (no `If1`) es zombi: sin entrada ni salida main. **Pre-existente** en v1. Inofensivo. `If1` es el gate activo real. |
| 3 | Tools sin agente | ✅ PASS | No hay nodos `langchain.tool*` en el workflow (ni v1 ni v2). No hay tools huérfanas. |
| 4 | Modelo + Memoria + Tools del agente | ✅ PASS | `Agente Principal - Sofia` ← `ai_languageModel` (OpenAI) + `ai_memory` (Postgres Chat Memory). Sin `ai_tool` (consistente con arquitectura real: properties va por Code node, no por tool). |
| 5 | Schema del input al agente | ✅ PASS | Input lee `Buscar Lead.full_name\|\|display_name`, `Get Conversation State.id`, `Resolve Agency.agency_id`, `message_count\|\|0`. Las queries v2 producen todos esos campos. `display_name` ahora SÍ está en el SELECT (mejora). `message_count` no existe en v2 → `\|\|0` lo tolera (correcto, spec §2.2 nota 4). |
| 6 | Expressions parseables | ✅ PASS | Brackets balanceados en todo el JSON (validator clean). `regexp_replace(...,'\D',...)` queda con UN backslash en el JSON (correcto para Postgres; el `'\\D'` del build script es el escape JS). |
| 7 | Triggers de handoff explícitos | 🔴 FAIL (pre-existente, fuera de alcance) | El CASE de `Apagar Chatbot — Conversation` mapea desde un vocabulario (`qualified`/`scheduling`/`agendar`/...) que **NO coincide** con lo que emite el `Detector de Descalificacion` (`handoff_agendar`/`handoff_pide_humano`/`descalificacion`). Ninguno matchea → TODOS caen al `ELSE 'qualified'`. Es el bug-clase-A del 2026-05-20 en forma estructural. **Idéntico en v1** (SQL + prompt del detector byte-iguales). NO introducido por el port; el port no toca triggers (§8). Ver Issue CRÍTICO #1. |
| 8 | Fallbacks de tools | ✅ PASS | `Expand Property Images` es fail-safe por diseño + guard `PROPERTIES_MODULE_ENABLED=false` que corta el HTTP antes del timeout. Si falla, `fotoUrls:[]` → empuja texto limpio. Loop core no depende de properties. |
| 9 | Walkthrough happy path | ✅ PASS | Ver §2 Escenario 1. Trayectoria limpia contra v2. |
| 10 | Walkthrough lead curioso | 🟡 WARN (pre-existente) | Ver §2 Escenario 2. El bot NO tiene fuente real de propiedades en v2 (no hay tool, módulo apagado) pero el prompt le ORDENA presentar propiedades con código/precio → riesgo de improvisación (bug-clase-B). Pre-existente; el port no lo causa. |
| 11 | Walkthrough lead frustrado | ✅ PASS (con caveat handoff) | Ver §2 Escenario 4b. El Detector detecta frustración (`handoff_pide_humano`), apaga el bot, escribe `bot_summary`. El handoff funciona; solo el `handoff_reason` queda mal etiquetado (Issue #1). |
| 12 | Walkthrough tool failure | ✅ PASS | Ver §2 Escenario 3. Módulo properties apagado → guard corta el fetch → texto sin foto → loop completa. Sin 5s de latencia. |
| 13 | Variables de entorno documentadas | 🟡 WARN | Credencial Postgres `CRM System` (id `pMsxqUvr0wDZsjIt`) intacta — debe repuntarse al v2 MANUALMENTE (precondición §5). `SEARCH_SECRET` = placeholder marcado (`REEMPLAZAR_SECRET_V2_...`), módulo properties inerte (correcto). |
| 14 | Sticky notes actualizados | 🟡 WARN | `Sticky - Control de Lead` aún dice "busca el lead por `(agency_id, phone_e164)`" — columna v1. La query usa `phone` (v2). Desactualizado, no rompe runtime. |
| 15 | `active: false` en el JSON | ✅ PASS | `JSON.parse(...).active === false`. Confirmado (v1 baseline era `true`; el build lo forzó a `false`). |

**Lectura del veredicto:** Check 7 es FAIL en sentido absoluto, PERO es un FAIL **pre-existente en producción v1**, explícitamente fuera del alcance del port (§8 "los triggers NO cambian en esta port"). Como port de capa de datos, el cambio es correcto y no regresa nada. Por eso el resultado global es **PASS WITH WARNINGS** y NO FAIL del port — con la condición de que el founder reciba el Issue #1 marcado en rojo y se abra una spec de seguimiento. Si el criterio fuera "el workflow está libre de bugs clase A", sería FAIL; pero ese bug NO es responsabilidad de este cambio ni se puede arreglar sin salirse del alcance acordado.

---

## 2. Walkthroughs detallados

### Escenario 1 — Happy path (lead recurrente, conversación existe, bot activo)
**Input:** WhatsApp "hola, sigue disponible la de Curridabat?" desde `+50688217229` (número en el allowlist de `If1`), que ya existe como lead en v2 con `stage_id` poblado y conversación `handler='bot'`.
**Trayectoria:** Webhook → **If1** (`from === '+50688217229'` ✅) → Extract Variables → Is Text? → Set Normalize Text → ID y Mensaje → **Resolve Agency** (matchea `agency_channels` por número doble-normalizado, `bot_enabled` compuesto = `is_active AND COALESCE(settings.bot_enabled,true)` = true) → **Buscar Lead** (matchea `l.phone` doble-normalizado, trae `status` vía `ps.slug`, `last_inbound_at` vía LEFT JOIN conversations, `bot_summary`) → **Lead Encontrado?** (`id` notEmpty ✅) → **Get Conversation State** (`channel='whatsapp'`, `handler='bot'`, `bot_paused_until=null`) → **Chatbot Activado?** (handler='bot' ✅ AND no pausado ✅ AND `Resolve Agency.bot_enabled===true` ✅) → Detectar Link → Mensaje Enriquecido → REINICIAR? (no) → Variables → Conversation (lee `n8n_chat_histories` v2 por session_id `ID@businessPhone`) → Code Formatear Historial → Unificacion → Agente Sofia → Formateador → Split Out → **Expand Property Images** (sin marker o marker→texto limpio) → Loop → Mensaje no vacio? → Send Chunk via YCloud. En paralelo: Detector → Apagar bot? (false, `continuar`) → no apaga.
**Hallazgos:** Limpio. Todas las columnas v2 existen (verificado contra 0003/0010/0005/0012). El bot responde contra v2 y `n8n_chat_histories` v2 recibe el turno. ✅

### Escenario 2 — Lead curioso / info-only
**Input:** Turno 1: "qué casas tenés en Escazú a 250k?" sin nombre, sin contexto.
**Trayectoria de datos:** idéntica hasta Agente Sofia. El prompt clasifica como Info-only/Browser → Flow A/B.
**Hallazgos:** 🟡 La **capa de datos no se rompe** (el caso pasa por todos los nodos sin error). El problema es de PROMPT/ARQUITECTURA, no del port: el prompt v5.4 le ordena al agente "DA precio", "presentá la propiedad con `[IMG:CR-XXXX]`", "si tenés código → llamá `Supabase Properties Tool`" — pero **esa tool NO existe** (no hay nodo `langchain.tool*`, el agente no tiene `ai_tool`). En v2 el módulo properties está apagado. El agente **no tiene ninguna fuente real de propiedades** y sin embargo está instruido a presentarlas → riesgo de **alucinar códigos/precios/zonas** (bug-clase-B). Esto YA pasaba en v1 (prompt byte-idéntico, agente sin tool en v1 también). El port lo hace más visible (ahora ni la foto se adjunta), pero NO lo introduce. Ver Issue IMPORTANTE #2.

### Escenario 3 — Tool failure / properties invocado con módulo apagado
**Input:** Sofia emite `[IMG:CR-2073]` en su respuesta.
**Trayectoria:** Split Out → Expand Property Images: detecta marker → `fetchPropertyImages('CR-2073')` → **guard `if(!PROPERTIES_MODULE_ENABLED) return {fotoUrls:[], error:'properties_module_disabled'}`** (corta ANTES del HTTP, sin esperar los 5s de `FETCH_TIMEOUT_MS`) → `fotoUrls.length===0` → `cleanMarkers()` quita `[IMG:CR-2073]` → push `{type:'text', output:<texto limpio>}` → Loop → Mensaje no vacio? (`type==='text' && output` ✅) → Send Chunk.
**Hallazgos:** ✅ El lead recibe el texto SIN foto, sin error, sin 5s de latencia. El loop core completa. El guard funciona exactamente como pide la spec §3.5 opción 3. Verificado: AGENCY_SOURCES (`Resolve Agency`, `Variables`, `Buscar Lead (Supabase)`, `Unificacion de Variables`, `ID y Mensaje`, `Extract Variables`) todos existen y están en try/catch.

### Escenario 4a — Handoff legítimo (lead pide agendar)
**Input:** Bot: "le aviso a Hans para coordinar la visita." Lead: "perfecto, gracias!"
**Trayectoria:** Agente Sofia → Detector de Descalificacion → output `{apagar_bot:true, razon:'handoff_agendar', resumen_lead:'...'}` → Apagar bot? (`output.apagar_bot===true` ✅) → **Apagar Chatbot — Conversation** (UPDATE `handler='human'`, `handoff_status='pending'`, `handoff_reason=(CASE...ELSE 'qualified')::conversation_handoff_reason`, WHERE `handoff_status<>'pending'`) → **Apagar Chatbot — Lead Summary** (UPDATE `leads SET bot_summary=$1`, requiere 0012) → Notificar Agente (Telegram).
**Hallazgos:** El handoff se ESCRIBE correctamente en v2: el cast `::conversation_handoff_reason` es válido (enum v2 confirmado en 0001), el WHERE `handoff_status<>'pending'` se cumple para conversaciones nuevas (default `'none'`), es idempotente, `bot_summary` persiste (0012 aplicada). 🔴 **PERO** `razon='handoff_agendar'` NO matchea ningún WHEN del CASE → cae a `ELSE 'qualified'`. Aquí el lead SÍ es de scheduling, pero queda etiquetado `qualified`. Bug-clase-A pre-existente (Issue #1).

### Escenario 4b — Lead frustrado / pide humano
**Input:** "ya me cansaste con tantas preguntas, info y ya."
**Trayectoria:** Detector detecta señal de frustración → `{apagar_bot:true, razon:'handoff_pide_humano', resumen_lead:'...'}` → Apagar bot? ✅ → Apagar Chatbot — Conversation → Lead Summary → Telegram.
**Hallazgos:** 🔴 El bot SÍ escala (deja de responder, notifica al agente) — eso funciona. PERO `razon='handoff_pide_humano'` tampoco matchea ningún WHEN → `ELSE 'qualified'`. Un lead frustrado/info-only queda registrado como `handoff_reason='qualified'` en `conversations`. **Esto es exactamente el bug del 2026-05-20** (lead que no calificó, marcado como qualified). Pre-existente, idéntico en v1. El inbox del CRM v2 va a mostrar "qualified" para leads que pidieron humano por hartazgo → señal engañosa para el agente humano. Ver Issue CRÍTICO #1.

### Escenario 5 — Número entrante con `+` vs solo-dígitos (edge específico al cambio)
**Input:** Webhook manda `whatsappInboundMessage.to = '+50689839490'` pero `agency_channels.phone_number` sembrado solo-dígitos `'50689839490'`.
**Trayectoria:** Resolve Agency: `WHERE regexp_replace(ac.phone_number,'\D','','g') = regexp_replace($1,'\D','','g')` → `'50689839490' = '50689839490'` ✅ matchea. Idem en Buscar Lead rama `phone`. La **doble-normalización** (ambos lados, no solo el input) blinda contra seed inconsistente — el builder implementó la variante robusta de §11 nota 1, no la versión simple de §3.6.
**Hallazgos:** ✅ Matchea con o sin `+`/espacios/guiones, en AMBOS lados de la comparación. Smoke tests del build confirman la presencia de la doble-normalización en ambas queries. Es el cambio mejor blindado del port.

### Escenario 6 — Lead nuevo sin stage_id / conversación inexistente (el más frágil, spec §7.4)
**Input:** Número nuevo, lead recién creado por el intake con `stage_id=NULL`, conversación quizás aún no creada.
**Trayectoria:** Buscar Lead: LEFT JOIN a `pipeline_stages` → `status=NULL` (tolerado, el prompt no bifurca por status). LEFT JOIN a conversations → `last_inbound_at=NULL` (tolerado). Si el lead existe → Lead Encontrado? ✅ → Get Conversation State. **Si la conversación NO existe todavía** → Get Conversation State devuelve vacío → `$json.handler` undefined → Chatbot Activado? condición `handler==='bot'` FALSA → **bot NO responde (silencio)**.
**Hallazgos:** 🟡 Comportamiento idéntico a v1 (no es regresión del port). El riesgo de "primer mensaje sin respuesta si la conversación no existe aún" depende de que el intake/Edge Function de v2 cree lead+conversación atómicamente ANTES de que el bot procese. **El founder debe confirmar que el intake de v2 crea la conversación de canal `whatsapp` junto con el lead** (igual que v1). Si no, el primer turno de un lead nuevo se pierde. No bloquea el port (es comportamiento heredado), pero es la grieta más fina. Ver precondición.

---

## 3. Issues encontrados

### 🔴 CRÍTICO (no bloquea el push del port, pero el founder DEBE conocerlo — abrir spec de seguimiento)

- **[Apagar Chatbot — Conversation : handoff_reason siempre cae a `'qualified'`]** El `Detector de Descalificacion` emite `razon ∈ {handoff_agendar, handoff_pide_humano, descalificacion, continuar}`. El CASE SQL solo tiene WHEN para `{qualified, scheduling, objection_complex, bot_stuck, manual, agendar, visita, agendar_visita, compra, cierre, listo_para_cerrar, objecion, descalificado}`. **NINGUNO de los valores reales del Detector matchea** → todos van a `ELSE 'qualified'`. Consecuencia: un lead frustrado (`handoff_pide_humano`) o descalificado (`descalificacion`) se persiste en `conversations.handoff_reason='qualified'`. Es la recurrencia estructural del bug del 2026-05-20. **Es pre-existente en v1 (SQL + prompt del Detector byte-idénticos), explícitamente fuera del alcance de este port (§8), y el cast no crashea en v2.** Por eso NO falla el port. **Fix (en spec de seguimiento, NO en este port):** alinear el CASE con el vocabulario del Detector:
  - `WHEN 'handoff_agendar' THEN 'scheduling'`
  - `WHEN 'handoff_pide_humano' THEN 'user_requested'` (el enum v2 tiene `user_requested`, ¡que el CASE actual ni usa!)
  - `WHEN 'descalificacion' THEN 'manual'`
  - `ELSE 'bot_stuck'` (default conservador, NO `qualified` — nunca defaultees a la razón más optimista).

  Adicional: el enum v2 incluye `user_requested` y el flujo NUNCA lo produce → el inbox jamás distingue "pidió humano" de "calificado". Aprovechar la spec de seguimiento para usarlo.

### 🟡 IMPORTANTE (debería resolverse pronto, no bloquea el port)

- **[Agente Principal - Sofia : el agente no tiene fuente real de propiedades pero el prompt le ordena presentarlas]** El system prompt v5.4 referencia `Supabase Properties Tool` y `Request Handoff Tool` como si fueran tools LangChain, pero el agente NO tiene ninguna conexión `ai_tool` (ni en v1 ni en v2) y esos nodos no existen. En v2 además el módulo properties está apagado. El agente, instruido a "DA precio / presentá `CR-XXXX` con foto", **alucinará códigos/precios/zonas** porque no tiene de dónde sacarlos. Bug-clase-B. Pre-existente; el port no lo introduce. **Recomendación:** hasta que exista el módulo properties en v2, ajustar el prompt (otra spec, langchain-prompt-designer) para que Sofia NO presente propiedades concretas y derive a Hans ("le paso eso confirmado por Hans"), o construir la tool real. Mientras tanto, el demo solo es seguro si Hans sabe que el bot puede inventar inventario.

- **[If1 : gate de entrada hardcodeado a un solo número de prueba]** `Webhook → If1` filtra `from === '+50688217229'`. **El bot SOLO procesa mensajes de ese número.** Pre-existente (idéntico en v1, no tocado por el port). En prod real esto bloquea a TODOS los demás leads. **El founder debe decidir:** dejarlo así para testing controlado, o quitar/ampliar el gate antes de abrir el demo a leads reales. Marcado como precondición de prod.

- **[Apagar Chatbot — Conversation : WHERE sin filtro de canal]** El UPDATE no filtra `channel='whatsapp'`. En v2 `conversations` es única por `(agency_id, lead_id, channel)`. Si un lead tuviera conv de WhatsApp + IG, el UPDATE pegaría a ambas. El demo es WhatsApp-only → sin impacto hoy. La spec (§3.6) lo marcó como mejora opcional para Bot v6. WARN documentado.

### 🔵 SUGERENCIA (opcional)

- **[Sticky - Control de Lead]** Dice "busca el lead por `(agency_id, phone_e164)`" — columna v1. La query v2 usa `phone` con doble-normalización. Actualizar el texto del sticky para que la próxima iteración no confunda. (No rompe runtime.)
- **[Nodo `If` huérfano]** Duplicado zombi del gate de prueba, sin conexiones. Borrarlo en limpieza futura para reducir ruido visual. (Pre-existente, inofensivo.)

---

## 4. Lo que está bien (reconocimiento)

- **Port quirúrgico de verdad.** Diff confirmado: exactamente **4 nodos** con cambios (`Resolve Agency`, `Buscar Lead (Supabase)`, `Get Conversation State`, `Expand Property Images`), 0 nodos agregados/borrados/renombrados, 0 cambios de tipo, 0 cambios de posición, **`connections` byte-idéntico** (45 keys iguales), 0 nombres duplicados. Topología 57→57 intacta. Esto es exactamente lo que pidió la spec §3.4/§11.2.
- **Credenciales intactas.** Los 8 nodos Postgres + memoria conservan `pMsxqUvr0wDZsjIt`. El builder respetó §11.3 (no tocar `credentials.postgres.id`).
- **Doble-normalización implementada (no la versión simple).** El builder siguió la nota crítica §11.1 y normalizó AMBOS lados del match de número en `Resolve Agency` y `Buscar Lead`. Es el blindaje correcto contra seed inconsistente.
- **Guard de properties correcto.** `PROPERTIES_MODULE_ENABLED=false` con early-return ANTES del HTTP — elimina los 5s de latencia por marker (spec §3.5 opción 3, la recomendada). Fail-safe preservado: el loop core completa con `fotoUrls:[]`.
- **Queries v2 correctas contra el schema real** (verificadas columna por columna contra migraciones 0001/0002/0003/0005/0009/0010/0012): `agency_channels`, `bot_enabled` compuesto (`is_active AND COALESCE(settings.bot_enabled,true)`), `ps.slug AS status` por LEFT JOIN, `c.last_inbound_at` por LEFT JOIN, `l.deleted_at IS NULL`, `display_name` agregado, cast `::conversation_handoff_reason` válido. Cero artefactos v1 residuales (sin `whatsapp_numbers`, sin `ugkunpsohrimxetofawv`, sin `phone_e164` en WHERE, sin `a.archived_at`).
- **`Apagar Chatbot — Lead Summary` tiene `onError: continueRegularOutput`** — la spec (§6 riesgo 2) dudaba de esto; está presente, así que aunque 0012 faltara, no abortaría a mitad del handoff.
- **Build idempotente y auto-validado.** Re-correr el script produce el mismo output (salvo `versionId` por `randomUUID`). 19/19 smoke tests pasan. `active:false` forzado.

---

## 5. Decisión final

🟡 **PASS WITH WARNINGS** → el founder puede pushear el port por API a n8n, PERO debe cumplir las precondiciones bloqueantes antes de **activar** el workflow, y debe conocer los issues #1 y #2 (no son del port, pero afectan el comportamiento en prod).

**Resumen para el founder (2-3 líneas):** El port de la capa de datos de Sofia al schema v2 está correcto y quirúrgico — solo cambia las 4 queries/nodos planeados, la topología es idéntica, y no introduce ningún bug nuevo. Lo que SÍ tenés que saber: el handoff arrastra un bug viejo (todo se marca `reason='qualified'` aunque el lead pida humano o no califique) y el bot puede inventar propiedades porque no tiene tool real — ambos pre-existen en v1 y necesitan una spec aparte. Y el bot hoy solo responde al número de prueba `+50688217229` (gate `If1`).

### Precondiciones BLOQUEANTES que el founder DEBE cumplir antes de ACTIVAR (no antes de pushear):

1. **Repuntar la credencial `CRM System` (id `pMsxqUvr0wDZsjIt`) al host/password del v2** (`db.fahujscodhqlopycorzn...`). MANUAL en la UI de n8n. Sin esto, todo lo Postgres sigue golpeando v1. (§3.7)
2. **Migración 0012 aplicada en v2** (`leads.bot_summary`). YA aplicada según el contexto del orquestador — confirmar con `list_migrations`. Sin ella, `Buscar Lead` y `Apagar Chatbot — Lead Summary` fallan con "column does not exist".
3. **Seeds en v2 presentes y con formato correcto:** agency `inmobiliaria-demo` (`is_active=true`, opcional `settings.bot_enabled=true`), `agency_channels` con `phone_number` **solo-dígitos** (`50689839490`) y `channel='whatsapp'`, al menos un `pipeline_stages` (slug `nuevo`). La doble-normalización tolera `+`, pero el seed debe existir o `Resolve Agency` devuelve vacío y el bot no responde a NADIE. (§5)
4. **Confirmar NO doble-proceso v1+v2** (§6 riesgo 1): que no haya un segundo endpoint/workflow del v1 procesando el MISMO número YCloud en paralelo. Si Casa CRM v1 sigue vivo con el mismo número → dos bots responden al lead.
5. **Confirmar que el intake de v2 crea lead + conversación (canal whatsapp) atómicamente** antes de que el bot procese (Escenario 6). Si no, el primer mensaje de un lead nuevo no se contesta (silencio).
6. **Decidir qué hacer con el gate `If1` (`from === '+50688217229'`)** antes de abrir a leads reales: el bot hoy ignora a todos los demás números.

### Acción recomendada para el orquestador (post-PASS):
- Pushear el port (es seguro, `active:false`).
- Abrir **spec de seguimiento** para el Issue CRÍTICO #1 (alinear el CASE del handoff con el vocabulario del Detector + usar `user_requested` + cambiar el `ELSE` a `bot_stuck`). Es la recurrencia del bug histórico del proyecto — prioridad alta.
- Encolar el Issue #2 (prompt vs properties inexistente) para `langchain-prompt-designer` o para construir el módulo properties en v2.
- Documentar en `memory/decisions.md` que el handoff_reason está known-broken hasta la spec de seguimiento.
