# Anti-Estupideces de Construcción n8n — Checklist destilado

> Los errores REALES que se cometieron construyendo chatbots Momentum en n8n, con el fix de cada
> uno. Estas correcciones viven fuera del repo (memoria automática), por eso se pierden al migrar.
> **Revisá esta lista ANTES de declarar cualquier workflow como terminado.**

---

## 1. NO construir desde cero — DUPLICAR el template (causa raíz #1)

El template base ya existe y resuelve batching, memoria, historial, formateador y reinicio.
Construir de cero = improvisar nodos = router roto, formateador que pierde contenido, etc.
**Fix:** duplicar el JSON más parecido de `knowledge/workflows-reference/` y cambiar solo las
variables por cliente (router, agentes, tools, post-processing, credenciales).

## 2. El router DEBE ser un Information Extractor bien configurado

Síntoma típico: alguien mete un nodo "Router" improvisado o un IE mal armado y el ruteo falla.
**Fix:**
- Es un `@n8n/n8n-nodes-langchain.informationExtractor`.
- `systemPromptTemplate` en prosa, SIN llaves `{}` literales (las llaves rompen el parser de
  LangChain → output vacío `[{}]` SIN error rojo → downstream recibe `undefined`).
- Máximo 4 llaves en todo el prompt, en un solo bloque `## FORMATO DE SALIDA`.
- El `inputSchema` (campo aparte) lleva el JSON con llaves, pero NO es contrato: el LLM renombra
  campos. Por eso el formato exacto se repite dentro del prompt y el campo principal (`destino`)
  se menciona 3+ veces.
- Máximo 3-4 destinos + BACKUP que siempre cae al agente principal.
- El Switch lee el campo que el nodo REALMENTE genera (inspeccionar output real, no asumir).
- Modelo gpt-4.1-mini, temp 0.1, maxTokens 300-400, responseFormat json_object.

## 3. Llaves `{}` en CUALQUIER nodo LangChain rompen silenciosamente

Aplica a `informationExtractor`, `chainLlm` (formateador), `agent` (campo `systemMessage`).
El nodo "ejecuta" exitoso pero devuelve vacío. **Fix:** describir formatos en prosa o tablas;
el schema literal va en `inputSchema`. Contar llaves antes de pegar: si pasa de 4, refactorizar.

## 4. Postgres con 5+ params o nullables → JSON deconstruction

Error `there is no parameter $N` aunque pasaste N valores: n8n splittea `queryReplacement` por
comas y los vacíos/comas internas colapsan. **Fix:** pasar UN solo param `$1::jsonb` con
`JSON.stringify({...})` y deconstruir en SQL con `d->>'campo'`. Inmune a nulls y comas.

## 5. Postgres delete NO usa operation:"delete"

Da error "The value 'delete' is not supported!". **Fix:** `operation: "deleteTable"` +
`deleteCommand: "delete"` + `where.values` con las condiciones.

## 6. Nodos de persistencia van EN PARALELO, no en serie

Si metés un Postgres "persist outbound" en serie entre dos nodos del flujo, su output sobrescribe
`$json.output` y el bot envía `undefined`. **Fix:** los nodos side-effect (persist inbound/outbound,
logs, denorm) se conectan desde el upstream a DOS nodos a la vez (paralelo). Excepción: nodos cuyo
output SÍ se usa downstream (ej. Crear Lead que retorna `id`) van en serie.

## 7. "Leer estado" en multi-canal → UPSERT, no SELECT

Un SELECT puro devuelve vacío si el lead quedó huérfano (tests viejos, ediciones manuales, crashes)
y rompe el downstream. **Fix:** `Get Conversation State` hace INSERT ON CONFLICT DO UPDATE
RETURNING. El workflow queda auto-curativo: después del nodo SIEMPRE existe la row. Requiere UNIQUE
sobre `(agency_id, lead_id, channel)`.

## 8. Expresiones: usar `.first()`, no `.item`, después de nodos que generan items

Code, Basic LLM Chain, Information Extractor, Loop, AI Agent rompen el pairedItem chain. Cualquier
`{{ $('Nodo').item.json.x }}` después de ellos falla con "Paired item data ... unavailable".
**Fix:** usar `.first()` por default. Funciona igual con un solo item y no se rompe.

## 9. Webhook de servicio externo → responseMode "onReceived"

YCloud, Stripe, Meta: si el webhook espera a que termine el workflow para responder, hay timeout y
mensajes duplicados. **Fix:** `responseMode: "onReceived"` (responde de una y procesa async).

## 10. Telegram Send → desactivar atribución

Sin esto n8n agrega "Sent via n8n.io" y delata al bot. **Fix:** en `additionalFields`,
`appendAttribution: false`.

## 11. Nombres de nodos representativos, no técnicos

"Clasificador / Orquestador" en vez de "Information Extractor1". "Enrutador de Agentes" en vez de
"Switch1". Hace que cualquiera entienda el flujo. Ver tabla completa en `metodologia-core.md`.

## 12. Sticky notes explicando cada zona

Todo workflow lleva `stickyNote` marcando las zonas (REINICIO, BATCHING, RUTEO, AGENTES,
FORMATEADOR) y el POR QUÉ de cada decisión. Es la documentación visual.

## 13. Variantes: copia EXACTA + cambio de canal solamente

Al generar TEST/Telegram/YCloud, NO simplificar Postgres/Redis/memorias del base sin confirmar.
Copiar el workflow base y cambiar solo el canal.

## 14. El formateador NO se improvisa

Basic LLM Chain con gpt-4o-mini. Schema PLANO `MENSAJE 1`/`MENSAJE 2` sin envoltorio `output`.
Solo divide, no modifica contenido. Copiar el canónico probado, no inventar estructuras (`messages`,
arrays) que rompen el downstream. (Detalle completo en el prompting-kit.)

---

## Regla de oro de construcción

**Validá antes de entregar.** Si tenés n8n-mcp conectado, validá cada nodo y el workflow completo
antes de decir "listo". La diferencia entre un constructor que improvisa y uno que entrega calidad
es que el segundo VERIFICA el output real de cada nodo (sobre todo el router) en vez de asumir.

## Atacar la causa raíz, no parchar

Si un fix solo funciona con los datos del test actual, NO es la solución. Preguntá: "¿qué pasa si
los datos vienen ligeramente distintos la próxima vez?". Documentá la causa, no solo el parche.
