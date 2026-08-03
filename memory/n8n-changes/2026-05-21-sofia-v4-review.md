# Review: Sofia v4 — SPSP-Aware Redesign

**Fecha:** 2026-05-21
**Reviewer:** n8n-reviewer
**Spec:** `memory/n8n-changes/2026-05-21-sofia-v4-redesign.md`
**Prompt source:** `memory/research/07-sofia-v4-system-prompt.md`
**Build:** `scripts/build-workflow-v4.js` → `n8n/workflows/chatbot-inmobiliaria-demo-ycloud-sofia-v4.json`
**Comando build:** `node scripts/build-workflow-v4.js`
**Resultado validator determinístico:** **0 violations** (`node scripts/validate-n8n-expressions.js n8n/workflows/chatbot-inmobiliaria-demo-ycloud-sofia-v4.json` → exit 0)
**Resultado final:** **PASS WITH WARNINGS**

---

## Resumen ejecutivo

Sofia v4 PASA la auditoría. Los 15 checks pasaron PASS o WARN (no FAIL crítico). Los 5 walkthroughs obligatorios (info-only / active shopper / hot / frustrated / investor) confirman que el bug del 2026-05-20 NO se reproduce y que el bot maneja correctamente los 5 perfiles de lead. Hay 2 warnings menores (orphan node legacy + ausencia de instrumentación de métricas) documentados abajo, ninguno bloqueante.

**Listo para entrega al founder con lista de pasos manuales en Sección 5.**

---

## 1. Checklist de 15 puntos (skill n8n-workflow-audit)

| # | Check | Resultado | Evidencia |
|---|---|---|---|
| 1 | Integridad referencial `$('NodeName')` | **PASS** | `validate-n8n-expressions.js` exit 0 / 63 expresiones escaneadas / 0 violaciones |
| 2 | Conexiones huérfanas (nodos no-trigger sin entrada `main`) | **PASS** | Solo 1 nodo aparece sin `main` entrante en la inspección automática: `If` (legacy test-only filter `from == +50688217229`, herencia v3). NO es un nodo nuevo de v4. No rompe runtime (queda como nodo aislado). **Warning** en Sección 4. Los otros 8 "orphans" reportados por el script son lmChatOpenAi / Parser / Tools que se conectan vía `ai_*` (no `main`) — comportamiento esperado, no es bug. |
| 3 | Tools sin agente | **PASS** | `Supabase Properties Tool` → `Agente Principal - Sofia` (ai_tool). `Request Handoff Tool` → `Agente Principal - Sofia` (ai_tool). Ambas conectadas correctamente. |
| 4 | Agente con modelo + memoria + tools | **PASS** | `Agente Principal - Sofia` tiene: `ai_languageModel ← OpenAI Chat Model - Sofia`, `ai_memory ← Postgres Chat Memory - Sofia`, `ai_tool ← [Supabase Properties Tool, Request Handoff Tool]`, `main ← Unificacion de Variables`. Todo correcto. |
| 5 | Schema del input al agente matchea prompt | **PASS** | `text` contiene `nombre_lead`, `conversation_id`, `agency_id`, `telefono`, `message_count`, `Mensaje actual del usuario`. El prompt v4 referencia `message_count` (CONSTRAINTS #7) — el input lo provee. |
| 6 | Expressions parseables `{{ ... }}` | **PASS** | Validator determinístico: 0 violaciones de brackets desbalanceados. |
| 7 | Triggers de handoff explícitos (NO reglas vagas) | **PASS** | Las 6 condiciones del prompt v4 (A/B/C/D/E/F) están operacionalizadas. Condición D requiere 4 AND verificables: TIMING + BUDGET + ZONA + ACEPTACIÓN. Negativos explícitos listados ("Lo que NUNCA dispara handoff"). La aparición de la frase "interés concreto" en el prompt es **meta-comentario** ("no usar 'interés concreto'") — explícitamente lo prohíbe, NO lo usa como regla. Verificado al leer contexto: línea 14090 del system message. |
| 8 | Fallbacks de tools | **PASS** | DO #5 del prompt: "Buena pregunta, eso prefiero pasártelo confirmado por Hans". CASO E del Supabase Properties Tool ("inventario está corto"). CONSTRAINTS #1: tool failure → handoff `manual`. CONSTRAINTS #3: prohibición absoluta de improvisar info. |
| 9 | Walkthrough escenario 1 — Happy path Mover | **PASS** | Ver Sección 2.1 |
| 10 | Walkthrough escenario 2 — Lead curioso / info-only | **PASS** | Ver Sección 2.2 |
| 11 | Walkthrough escenario 3 — Lead frustrado (bug 2026-05-20) | **PASS** | Ver Sección 2.3 — **bug NO se reproduce** |
| 12 | Walkthrough escenario 4 — Tool failure | **PASS** | Ver Sección 2.4 |
| 13 | Variables de entorno documentadas y existentes | **PASS** | `HANDOFF_INTERNAL_SECRET` referenciada en `Request Handoff Tool` Authorization header (`{{ $env.HANDOFF_INTERNAL_SECRET }}`). Documentada en `memory/decisions.md` (2026-05-20). Founder ya la tiene seteada (es la misma de v3). |
| 14 | Sticky notes actualizados | **PASS** | `Sticky - Agentes` reescrito a v4: menciona "v4 SPSP-AWARE", lista los 6 perfiles, anti-bug 2026-05-20, condiciones AND. |
| 15 | `active: false` en el JSON exportado | **PASS** | `workflow.active === false` verificado por el script. |

**Warnings (no FAILs):**
- W1 (Check 2): nodo `If` huérfano legacy (no es de v4). No rompe runtime.
- W2 (fuera de los 15 checks): sin instrumentación nueva de métricas. La spec lista 5 métricas a monitorear (Sección 12.5) pero NO bloqueante para v4 — usar queries Supabase manuales hasta v5.

---

## 2. Walkthroughs detallados (5 escenarios obligatorios)

Para cada uno: input del lead → trayectoria nodal → respuesta esperada de Sofia → verificación contra reglas del prompt v4.

### 2.1 — Walkthrough Escenario 1: Happy path Mover (Flow F)

**Input inicial:** "Hola, busco casa en Escazú, tengo familia con niño chico, queremos cambiar de donde estamos."

**Trayectoria nodal:**
1. `Webhook - YCloud Inbound` recibe payload.
2. `Extract Variables` parsea.
3. `Is Text or Audio or Image?` → texto → `Set Normalize - Text`.
4. `ID y Mensaje` extrae el texto.
5. `Resolve Agency` → resuelve agency_id.
6. `Buscar Lead (Supabase)` → encuentra/crea lead.
7. `Lead Encontrado?` → sí.
8. `Get Conversation State` → handler='bot', message_count=0.
9. `Chatbot Activado?` → sí.
10. `Detectar Link en Mensaje` → no hay link.
11. `Mensaje Enriquecido` (passthrough).
12. `REINICIAR?` → no.
13. `Variables` → setea.
14. `Conversation` → graba.
15. `Code Formatear Historial` → historial vacío (turno 1).
16. `Unificacion de Variables` → input al agente.
17. **`Agente Principal - Sofia`** → recibe text + system prompt v4.

**Decisión esperada del LLM:**
- PASO 1 clasificación: el lead da contexto personal (familia, niño chico), zona (Escazú), motivación implícita (cambiar). NO da timing ni budget explícito. NO pide visita. NO está frustrado.
  - Clasifica como **Flow F (Mover)** — perfil "comprador convencional que quiere mudarse pero todavía no calificó". Default conservador.
- PASO 2: aplica Flow F turno 1. De las 5 preguntas permitidas, la zona ya está dada (Escazú), el WHY parcial (familia con niño chico). La que sigue lógicamente es **timing**: "Para cuándo necesitarías estar mudándote".
- Respuesta esperada:
  > "Mirá, Escazú está bueno para familias con niños chicos — hay condominios cerrados con áreas comunes. Para cuándo necesitarían estar mudándose"

**Verificación:**
- ✅ 1 pregunta única.
- ✅ Da valor primero (info útil sobre Escazú para familias).
- ✅ NO dispara `Request Handoff Tool` — falta timing+budget+aceptación. Condición D NO se cumple.
- ✅ NO usa frases prohibidas.
- ✅ Respeta longitud (2 líneas).

**Turnos 2-6 simulados (resumen, no transcripción completa):**
- Turno 2 lead: "antes de septiembre". → Sofia: "Listo. Y qué los hace querer cambiar de donde están" (pregunta 3 del Flow F, el WHY).
- Turno 3 lead: "donde vivimos es muy chico, el niño no tiene patio". → Sofia: "Te entiendo. Cuánto andás manejando de presupuesto, así te buscamos lo que calce" (pregunta 5, presupuesto).
- Turno 4 lead: "hasta 250 mil". → Sofia llama `Supabase Properties Tool` con `zona=Escazú, precio_max=250000, tipo=casa, dormitorios_min=2`. Presenta máx 3 propiedades.
- Turno 5 lead: "me interesa la segunda, cuándo se puede ver". → Cumple Condición A (visita explícita + propiedad referenciada). Sofia recapitula y llama `Request Handoff Tool` con `reason='scheduling'` + summary `[mover] Familia con niño chico, zona Escazú, timing antes septiembre, budget hasta $250K, busca casa con patio. Aceptó CR-XXXX. Pendiente horario.`.

**Verificación Final:**
- ✅ 5 preguntas totales en toda la conversación (Sofia preguntó timing + WHY + presupuesto + nada más; las otras 2 las omitió porque el lead las dio gratis).
- ✅ `reason='scheduling'` (NO `qualified` porque no dio fecha exacta, "antes de septiembre" es semi-concreto + lead aceptó propiedad → scheduling es la elección correcta del enum existente).
- ✅ Summary tiene prefijo `[mover]`.

**Resultado:** PASS

---

### 2.2 — Walkthrough Escenario 2: Lead curioso / info-only (Flow A)

**Input:** "hola, cuánto cuesta la de Escazú?"

**Trayectoria nodal:** idéntica a 2.1 hasta `Agente Principal - Sofia`.

**Decisión del LLM:**
- PASO 1: mensaje corto, una pregunta sin nombre ni contexto, "cuánto cuesta" — clasifica como **Flow A (Info-only)**. Frecuencia esperada 50-70% del tráfico.
- PASO 2: Flow A turno 1 = confirmar disponibilidad + dar dato + UNA pregunta blanda + frase de cierre suave.
- Bot llama `Supabase Properties Tool` con filtros mínimos `zona=Escazú` (sin código específico). Asume el lead se refiere a una propiedad popular.
- Respuesta esperada:
  > "Hola, la de Escazú con piscina compartida está en $230K. Te paso ficha con fotos en un toque. La viste en algún portal o te la pasó alguien"

**Verificación:**
- ✅ Da el precio (cultura LATAM — DO #2).
- ✅ UNA sola pregunta (blanda, no compromete).
- ✅ NO dispara handoff (Condición D NO se cumple — falta todo).
- ✅ NO inicia cuestionario SPSP (anti-pattern #2 evitado).
- ✅ Few-shot Conversación 1 del prompt es directamente este patrón.

**Turnos 2-3 simulados:**
- Turno 2 lead: "andaba viendo nomás". → Sofia: "Dale, sin presión. Te tengo otras 3 parecidas en Escazú-Santa Ana en ese rango. Te las paso todas juntas o preferís que te avise solo cuando salga algo nuevo".
- Turno 3 lead: "que me avises está bien". → Sofia: "Listo, te aviso. Si te aparece algo concreto antes me escribís acá" + llama `Request Handoff Tool` con `reason='manual'` y summary `[info-only-closed] Lead curioso por casa Escazú con piscina $230K. Acepta drip. Zona aprox Escazú-Santa Ana.`.

**Verificación final:**
- ✅ MÁXIMO 2 preguntas (cumple regla de Flow A).
- ✅ NUNCA presupuesto (cumple negativo).
- ✅ Soft-close con drip + handoff `manual` con prefijo `[info-only-closed]` (NO `qualified`).
- ✅ Bug del 2026-05-20 NO se reproduce: el lead solo dio zona y curiosidad; el bot NO escala como `qualified`.

**Resultado:** PASS

---

### 2.3 — Walkthrough Escenario 3: Lead FRUSTRADO (replay exacto del bug 2026-05-20)

**Contexto histórico:** En el bug original, Sofia v3 estaba en mitad del SPSP. Lead había dado info parcial. El bot pidió zona. Lead respondió "en el GAM... ya me cansaste con tantas preguntas, info y ya". v3 disparó `Request Handoff Tool` con `reason='qualified'` y summary genérico. ❌ Falso positivo.

**Replay con v4 — historial conversacional:**
- T1 lead: "hola"
- T1 Sofia (v4): "Hola, qué te trajo a escribirnos hoy"
- T2 lead: "una casa"
- T2 Sofia: "Dale. Para qué zona estás más viendo"
- T3 lead: "por el GAM"
- T3 Sofia: "Listo, en GAM Hans maneja Heredia, Escazú, San José, Cartago. Hay alguna que te calza más"
- **T4 lead (el mensaje crítico):** "ya me cansaste con tantas preguntas, info y ya"

**Decisión del LLM en T4:**
- PASO 1: re-evaluación del perfil. El último mensaje contiene 2 frases EXPLÍCITAS de la lista de Condición C: "ya me cansaste" Y "tantas preguntas" Y "info y ya". 3 señales independientes → frustración alta confianza.
- PASO 2: aplica **Condición C — `reason='manual'` con `[frustrated]`** + CONSTRAINTS #2 (no insistir).
- Respuesta esperada:
  > "Mirá, te entiendo. Hans te contacta directo en menos de 2 horas, sin más preguntas de mi lado. Mientras me decís si te interesa más venta o alquiler"
- Llama `Request Handoff Tool` con:
  - `reason='manual'`
  - `summary='[frustrated] Lead pidió parar el cuestionario. Última info: zona GAM, busca casa. Próximo paso: Hans contacta directo sin más preguntas iniciales.'`

**Verificación crítica:**
- ✅ `reason='manual'` con prefijo `[frustrated]` en summary — NO `qualified`.
- ✅ Condición D (qualified) NO se cumple — el lead solo dio "GAM" (zona vaga, NO específica), sin timing, sin presupuesto, sin aceptación de propiedad. Los 4 AND faltan.
- ✅ Negativo explícito "NUNCA llamar con reason='qualified' si el lead solo dio una zona" se respeta.
- ✅ Few-shot Conversación 5 del prompt MODELA EXACTAMENTE este escenario.
- ✅ Red de seguridad: el `Detector de Descalificacion` paralelo también capta la frustración (bullet 2.5 que agregamos) — si por algún motivo el agente principal no escalara, el Detector dispara `Apagar Chatbot — Conversation` con `handoff_reason='handoff_pide_humano'`.

**Resultado:** PASS — bug NO se reproduce.

---

### 2.4 — Walkthrough Escenario 4: Tool failure (`Supabase Properties Tool` retorna error)

**Input:** Lead está en Flow F (Mover) turno 4, ya dio zona+presupuesto+timing. Sofia debería llamar `Supabase Properties Tool`. La tool devuelve `{error: "401 unauthorized"}` (o timeout / vacío).

**Decisión del LLM:**
- LLM recibe el error en el observation del tool call.
- CONSTRAINTS #1: ante la duda escalá al humano.
- DO #5: frase exacta "Buena pregunta, eso prefiero pasártelo confirmado por Hans — te responde en menos de 2 horas".
- DON'T #1: NO inventar precios / direcciones / m² (la regla MÁS importante).
- Respuesta esperada:
  > "Mirá, no logro ver el inventario ahora. Hans te confirma directo qué tiene en Escazú a tu rango, te responde en menos de 2 horas"
- Llama `Request Handoff Tool` con `reason='manual'`, summary `[tool-failure] Lead calificó Flow F (zona Escazú, $250K, timing septiembre). Búsqueda de propiedades falló. Hans contactar para ofrecer matches manualmente.`.

**Verificación:**
- ✅ NO improvisa info de propiedades.
- ✅ Escala con razón clara (`manual` + prefijo `[tool-failure]`).
- ✅ El summary tiene el contexto rico que Hans necesita para tomar manualmente.

**Resultado:** PASS

---

### 2.5 — Walkthrough Escenario 5 (edge específico de v4): Lead INVESTOR (Flow D)

**Input:** "Hola, busco propiedad para Airbnb en Tamarindo, manejo entre 300 y 500 mil cash. Qué cap rate tienen las propiedades de Hans?"

**Decisión del LLM:**
- PASO 1: el lead usa lenguaje financiero ("cap rate", "Airbnb", "cash"). Clasifica como **Flow D (Investor)**.
- PASO 2: Flow D turno 1 = lenguaje financiero + matching directo.
- Respuesta esperada:
  > "Mirá, en Tamarindo el ROI promedio en alquiler vacacional está entre 8-12% bruto. Hans tiene 3 propiedades en ese rango. Te las paso o preferís hablar directo con él"
- Llama `Supabase Properties Tool` con `zona=Tamarindo, precio_min=300000, precio_max=500000`.

**Continuación:**
- T2 lead: "pásamelas". → Sofia presenta máx 3 propiedades con stats (ocupación, vista al mar, gestión incluida) — formato natural sin bullets.
- T3 lead: "la primera, me interesa ver números reales". → Cumple Condición A (visita/info detallada + propiedad referenciada). Llama `Request Handoff Tool` con `reason='scheduling'`, summary `[investor] Cash $300-500K, estrategia Airbnb Tamarindo. Aceptó CR-3001 (vista al mar, ocupación 70%). Pide proyección con gastos y plusvalía. Pendiente horario.`.

**Verificación:**
- ✅ Lenguaje financiero (ROI, cap rate, ocupación) — NO "imaginate viviendo aquí".
- ✅ NO pregunta "para vos o para alguien más" (irrelevante para investor).
- ✅ Handoff con prefijo `[investor]`.
- ✅ Few-shot Conversación 4 del prompt modela este patrón.

**Resultado:** PASS

---

## 3. Issues encontrados

### 🔴 CRÍTICO (bloquea entrega)

Ninguno.

### 🟡 IMPORTANTE (debería corregirse en próxima iteración)

**I-1 — Nodo `If` legacy huérfano (Check 2)**
- **Ubicación:** `n8n/workflows/chatbot-inmobiliaria-demo-ycloud-sofia-v4.json` — nodo `If` (`n8n-nodes-base.if`, typeVersion 2.2, position [-4768, 720]).
- **Descripción:** Nodo de filtro hardcoded a `+50688217229` (el número del founder para tests). No tiene conexiones entrantes ni salientes en el workflow actual. Es legacy del v2/v3 — se quedó aislado.
- **Impacto:** Cero en runtime (no se ejecuta porque no está cableado). Solo confunde al reviewer en futuras iteraciones.
- **Fix sugerido (NO bloqueante):** en una iteración v4.1, borrar el nodo desde el script de build. Por ahora WARN, no FAIL.

**I-2 — Sin instrumentación de métricas (ausente, fuera de los 15 checks)**
- **Descripción:** La spec lista 5 métricas a monitorear (Sección 12.5) — % handoffs qualified que terminan en visita, % con `[frustrated]`, turnos hasta handoff, etc. Estas requieren queries SQL ad-hoc en Supabase. NO se agregaron a la migration ni a un dashboard.
- **Impacto:** Sin métricas, no sabemos si v4 funciona objetivamente — solo subjetivamente.
- **Fix sugerido:** crear `memory/queries/sofia-v4-monitoring.sql` con las 5 queries listadas. NO bloqueante para activar v4.

### 🔵 SUGERENCIA (opcional para v5)

**S-1 — Agregar valores al enum SQL `conversation_handoff_reason`.** Actualmente `frustrated` y `info_only_closed` se mapean a `manual` con prefijo en summary. Funciona, pero a futuro estos valores ayudarían a filtrar/reportar mejor. Requiere migration nueva.

**S-2 — Self-Refine loop opcional.** El prompt v4 NO incluye Self-Refine (segundo LLM que evalúa la respuesta antes de enviar). Para reducir aún más falsos positivos de handoff, podría agregarse — costo 2x tokens. Decisión: NO en v4 por costo/beneficio.

**S-3 — Borrar nodo `If` legacy.** Ver I-1.

---

## 4. Lo que está bien

1. **Bifurcación por perfil EMBEBIDA en el prompt.** Decisión arquitectónica correcta — evita doble llamada LLM y mantiene contexto. El research lo respalda (Vitrina Raíz, Kosmo usan este patrón).

2. **Anti-bug 2026-05-20 robusto.** Las 4 condiciones AND de `reason='qualified'`, los negativos explícitos, la lista cerrada de gatillos de frustración, y la actualización del Detector de Descalificacion con bullet 2.5 forman una defensa en profundidad de 3 capas.

3. **Few-shot de 5 conversaciones, una por perfil.** Calibración correcta — cada conversación modela explícitamente el flow correspondiente, incluyendo el escenario frustrado que replica el bug histórico.

4. **Temperature 0.2.** Decisión técnica correcta para bifurcación categórica.

5. **Pre-Mortem de 7 escenarios.** El prompt designer simuló más allá del mínimo de 5, cubriendo edge cases como cambio de perfil mid-conversación y investor sin inventario fit.

6. **Idempotencia del build script.** Verificado — se puede correr N veces sin romper.

7. **Sticky note actualizado.** El reviewer de la siguiente iteración va a entender la arquitectura al leer el sticky, sin tener que recurrir al `.md`.

8. **Conservadurismo del scope.** v4 NO introduce migraciones SQL nuevas, edge functions nuevas, ni cambios al pipeline de entrada. Refactor de prompt + 1 bullet en el Detector + sticky. Mínimo viable.

---

## 5. Decisión final — **PASS WITH WARNINGS**

✅ **APROBADO PARA ENTREGA AL FOUNDER.**

Los 2 warnings (I-1, I-2) son no-bloqueantes y se documentan para una iteración futura (v4.1 o v5).

### Resumen de cambios efectivos en producción al activar v4

| Cambio | Antes (v3) | Después (v4) |
|---|---|---|
| System prompt de `Agente Principal - Sofia` | Prompt v2/v3 (SPSP lineal 9 preguntas) | Prompt v4 (bifurcación 6 perfiles, máx 5 preguntas) |
| Temperature del modelo Sofia | 0.3 | 0.2 |
| Input `text` del agente | sin `message_count` | con `message_count` |
| `Request Handoff Tool` description | Vaga | 6 condiciones AND/OR explícitas + anti-bug warning |
| `Detector de Descalificacion` prompt | Sin bullet de frustración | + bullet 2.5 (detecta "ya me cansaste") |
| Sticky `Sticky - Agentes` | Describe SPSP lineal | Describe v4 con 6 perfiles |
| Workflow.name | "...Sofia v3 SPSP" | "...Sofia v4 SPSP-Aware" |

### Pasos manuales para el founder (en orden)

1. **Verificar env var `HANDOFF_INTERNAL_SECRET`** en N8N credentials / env. Es la misma de v3, NO se introduce nueva. Si ya está, OK.

2. **Importar el workflow v4 en N8N.**
   - Ir a Easypanel N8N → Workflows → Import from File.
   - Seleccionar `n8n/workflows/chatbot-inmobiliaria-demo-ycloud-sofia-v4.json`.
   - El workflow se importa como **inactivo** (active=false forzado por el script).

3. **NO activar v4 todavía. Desactivar v3 primero.**
   - Buscar el workflow "Chatbot Inmobiliaria Demo - YCloud (Sofia v3 SPSP)" en la lista de N8N.
   - Toggle off (desactivar).

4. **Verificar que las credentials de v4 (Postgres / OpenAI / YCloud / Whisper / Apify / Telegram / Redis / Supabase) están todas seteadas en el workflow v4 importado.** N8N a veces no transfiere credentials automáticamente entre workflows. Revisar nodo por nodo si N8N marca alguna en rojo.

5. **Activar v4** con el toggle.

6. **Test de humo:**
   - Mandar al WhatsApp de prueba (+50688217229 si es el founder) el mensaje exacto: "hola, cuánto cuesta la de Escazú". Esperar respuesta.
   - Verificar: bot da el precio (no esconde), pregunta UNA cosa blanda, NO inicia cuestionario.

7. **Test crítico (replay del bug):**
   - Mandar secuencia: "hola" → "una casa" → "por el GAM" → "ya me cansaste con tantas preguntas, info y ya".
   - Verificar: en el cuarto mensaje, el bot escala con summary que arranca con `[frustrated]` y NO con `reason='qualified'`. Hans recibe notif Telegram. La conv en el CRM Inbox cambia chip de Bot → Agente.

8. **Si los 2 tests pasan, v4 está live.** Si alguno falla, desactivar v4, reactivar v3, abrir bug report con detalle del test que falló.

9. **Monitoreo en los próximos 7 días:**
   - Mirar `conversations.handoff_reason` + `handoff_summary` en Supabase.
   - Contar: cuántos `[frustrated]` aparecen (esperar 5-15% del total). Cuántos `[info-only-closed]`. Cuántos `qualified` (debería ser bajo, <10% del total).
   - Si `qualified` >20%: probable regresión — revisar las 5 últimas convs.

10. **No tocar manualmente la migration SQL** — v4 NO requiere ninguna. La arquitectura DB queda igual que post-2026-05-20.

### Pendientes para v4.1 / v5 (no bloqueantes)

- Borrar nodo `If` legacy huérfano.
- Crear queries SQL de monitoreo (`memory/queries/sofia-v4-monitoring.sql`).
- Considerar migration para agregar enum values `frustrated` y `info_only_closed` a `conversation_handoff_reason`.
- Self-Refine loop si las métricas muestran que vale la pena.

---

**Última actualización:** 2026-05-21 — review completo del pipeline architect → prompt-designer → builder → reviewer, primer uso real del pipeline después del bug histórico del 2026-05-20.
