# Spec — Fix Bug A: session_key del N8N memory sin agency_id

**Fecha:** 2026-06-04
**Tipo:** fix de 1 línea (no es feature)
**Esfuerzo:** ~30 min (cambio + snapshot + smoke test)
**Riesgo:** bajo

---

## 1. Resumen ejecutivo

El nodo `Postgres Chat Memory - Sofia` del workflow N8N `chatbot-momentum-bot-v6-v1.json` construye el `sessionKey` como `<phone_lead>@<phone_business>`. Si un número WhatsApp business se migra entre agencies (caso real durante dog-food 2026-06-03), la memoria persiste y contamina al cliente nuevo con el contexto del cliente anterior.

**Fix:** cambiar la expresión del `sessionKey` para usar `agency_id` (UUID estable) en lugar de `phone_business`. Resultado: `<phone_lead>@<agency_id>`.

---

## 2. Estado actual (verificado en el JSON)

**Archivo:** `crm-v2/n8n/workflows/chatbot-momentum-bot-v6-v1.json`
**Nodo:** `Postgres Chat Memory - Sofia` (id `7b8707cf-2225-47ca-ab02-84aef751c960`, línea ~937-957)
**Expresión actual (línea 940):**

```javascript
"={{ $('Variables').first().json.Telefono + \"@\" + $('Webhook - YCloud Inbound').first().json.body.whatsappInboundMessage.to }}"
```

**Output observado en `n8n_chat_histories` durante dog-food:** `+50688217229@+50689839490` (lead@business, ambos E.164 con `+`).

---

## 3. Fix propuesto (1 línea)

**Expresión nueva:**

```javascript
"={{ $('Variables').first().json.Telefono + \"@\" + $('Resolve Agency').first().json.agency_id }}"
```

**Output esperado:** `+50688217229@a1b2c3d4-...` (lead@uuid).

**Por qué `Resolve Agency.agency_id` y no otro discriminador:**
- Es estable: el `agency_id` (UUID) no cambia nunca durante la vida de la agency.
- Está disponible en runtime: `Resolve Agency` ejecuta antes que el `Agente Principal - Sofia` (al que el Postgres Chat Memory se conecta como `ai_memory`).
- Es discriminador real: dos agencies distintas nunca van a tener el mismo UUID.

---

## 4. Validación de impacto

Buscadas todas las referencias a `session_id` y `sessionKey` en el workflow:

- Línea 713 + 814: `column: session_id` (inserts a `n8n_chat_histories` — los hace el propio nodo de Postgres Chat Memory, no hay queries manuales que asuman formato viejo).
- Línea 940: la expresión que estamos cambiando.

**Otros sistemas que tocan `n8n_chat_histories`:** ninguno propio. Es manejada por LangChain Postgres Chat Memory exclusivamente.

**Sistemas que usan `session_id` para algo:** ninguno fuera de N8N. El audit log `bot_observability.bot_turn_events` usa `trace_id` y `lead_id`, NO `session_id`.

**Conclusión:** el cambio es localizado. Cero impacto downstream.

---

## 5. Decisión sobre `n8n_chat_histories` existente

**Opción elegida: (b) dejar zombies.** No tocar la tabla.

Razones:
- La tabla está casi vacía (founder hizo DELETE durante dog-food hace pocas horas).
- Las pocas filas que quedan son del cliente cero (Momentum AI CRM en fase de testing). Perder contexto no es crítico — son conversaciones de prueba.
- Las viejas (con formato `<phone>@<phone>`) nunca se accederán de nuevo porque la nueva clave nunca matchea.
- Las nuevas arrancan fresh con formato `<phone>@<uuid>`.

**Si el founder ve que pierde contexto valioso:** podemos hacer una migración SQL puntual después, no es urgente.

Opciones descartadas:
- (a) Migración SQL: re-mapear `phone_business → agency_id` para session_ids viejos. Sobre-ingeniería para 0 valor real (no hay conversaciones de producción real todavía).
- (c) TRUNCATE: pierde igual que (b) pero deja la tabla limpia. Igual de válido pero más invasivo.

---

## 6. Pre-Mortem (3 escenarios)

### Escenario 1: lead con conversación activa en el momento exacto del cutover

- Lead manda mensaje al business +50689839490 mientras el founder hace PUT al workflow.
- N8N vivo recibe el mensaje con el workflow nuevo (assume PUT atómico).
- Postgres Chat Memory busca por nueva clave `<phone>@<uuid>` → no existe → arranca contexto vacío.
- El lead pierde 1 turno de contexto. El bot lo trata como un saludo nuevo.

**Mitigación:** ninguna real, es aceptable. Probabilidad baja (ventana de race condition = ~5 segundos durante el PUT).

### Escenario 2: PUT al workflow falla (rollback necesario)

- Founder hace PUT → workflow nuevo activo.
- Algo sale mal: el bot deja de responder a TODO (no solo a leads suspendidos).
- Rollback: re-deployar el snapshot pre-cambio guardado en `snapshots/`.

**Mitigación:** snapshot obligatorio antes del cambio (documentado abajo).

### Escenario 3: el agency_id no existe en el output de `Resolve Agency`

- Si por alguna razón `Resolve Agency` devuelve `null` para `agency_id`, la expresión evalúa a `+50688217229@undefined` → todas las conversaciones de TODOS los leads con número de business sin agency colisionan en una sola memory.

**Mitigación:** después del fix ADM-4B (PR #12), `Resolve Agency` SIEMPRE devuelve fila (con `bot_enabled=false` cuando agency suspended, pero `agency_id` poblado). Por lo tanto el escenario no debería darse. **Si se diera, lo detectaríamos rápido en logs (sessionKey con `undefined` literal).**

**Salvaguarda adicional opcional:** envolver en COALESCE o expresión defensiva. Decisión: NO agregar, mantener fix mínimo. Si aparece el bug, lo escalamos.

---

## 7. Plan de cutover

**Pre-requisito:** PR #12 (ADM-4B) debe estar **mergeado a main** antes de aplicar este fix. Razón: ambos modifican el mismo archivo JSON. Trabajar en paralelo causaría merge conflict. Además, este fix asume el estado post-ADM-4B del nodo `Resolve Agency` (que siempre devuelve fila).

Orden de pasos una vez mergeado #12:

1. `git checkout main && git pull` en `crm-v2/`.
2. `git checkout -b fix/bot-session-key-agency-id`.
3. **Snapshot del workflow vivo** (skill `n8n-workflow-versioning`): `cp n8n/workflows/chatbot-momentum-bot-v6-v1.json n8n/workflows/snapshots/bot-v6-v1-PRE-BUGA-2026-06-04.json`.
4. Editar línea 940 del JSON con la expresión nueva (cambio mecánico).
5. Commit + push + PR.
6. Founder hace PUT al N8N vivo siguiendo la skill (no automático).
7. **Smoke test:** mandar mensaje desde `+50688217229` al business `+50689839490`. Verificar en Supabase que `n8n_chat_histories` recibió un row con `session_id` formato nuevo (`+50688217229@<uuid-momentum>`).
8. Tag git: `bot-v6-v1-buga-2026-06-04`.
9. Merge PR a main.

---

## 8. Rollback plan

Si el smoke test falla:
1. Founder hace PUT del snapshot `bot-v6-v1-PRE-BUGA-2026-06-04.json` al N8N vivo.
2. `git revert` del commit del fix.
3. Volver al estado anterior. Re-evaluar.

---

## 9. Estimación

- Spec: ✅ ya hecha (15 min).
- Edit del JSON: 5 min.
- Snapshot + commit + PR: 5 min.
- Founder hace PUT + smoke test: 10-15 min.
- Merge: 2 min.

**Total: ~35-40 min reales.**
