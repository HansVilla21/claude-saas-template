# 03 — Errores comunes y fixes

Catálogo de TODOS los errores que enfrentamos en el deployment de Jacó Dream Rentals (mayo 2026). Cada uno con: síntoma, causa raíz, fix concreto.

**Leer esto ANTES de arrancar un cliente nuevo evita 6-8 horas de debugging.**

---

## E01 — Bot devuelve respuesta vacía (`{}` o `[]`) sin error explícito

### Síntoma
- AI Agent o Information Extractor o Basic LLM Chain devuelve `[{}]` o array vacío.
- ManyChat recibe `field_value = undefined` y el user no recibe nada.
- No hay error rojo en n8n.

### Causa raíz
El `systemPromptTemplate` del nodo LangChain contiene **llaves literales** `{` `}`. LangChain las parsea como template Python `str.format()` buscando variables (ej. interpreta `{ "MENSAJE 1": ... }` como variable `"MENSAJE 1"`). No encuentra → falla silenciosa → output vacío.

### Fix
1. Eliminar **todos los bloques JSON inline** del prompt.
2. Describir el formato del output en prosa o tablas.
3. Si necesitás mostrar el formato, máximo **1-2 pares de llaves** en una sección `## FORMATO DE SALIDA`.
4. El schema completo va en el campo `inputSchema` del nodo (separado del prompt).

### Ejemplo

**❌ ROMPE:**
```markdown
## Ejemplos
INPUT: "Hola"
OUTPUT:
{
  "MENSAJE 1": "Hola"
}

INPUT: "..."
OUTPUT:
{
  "MENSAJE 1": "...",
  "MENSAJE 2": "..."
}
```

**✅ FUNCIONA:**
```markdown
## Formato de salida
JSON puro con keys MENSAJE 1, MENSAJE 2, etc. Ejemplo del formato:
```json
{
  "MENSAJE 1": "texto"
}
```

## Ejemplos en prosa
- Input "Hola" → MENSAJE 1 = "Hola"
- Input "..." → MENSAJE 1 = "...", MENSAJE 2 = "..."
```

### Referencia
- Memoria: `feedback_n8n_no_curly_braces_in_extractor.md`
- Skill: `n8n-langchain-prompts-rules`

---

## E02 — Postgres tira "there is no parameter $N"

### Síntoma
```
[Postgres] there is no parameter $11
```
(o `$10`, `$8`, etc.)

### Causa raíz
El parser de `queryReplacement` de n8n splittea por comas y **colapsa o omite valores vacíos consecutivos**. Si pasás 10 parámetros y 3 vienen vacíos (ej. `ig_id`, `ig_username`, `live_chat_url` cuando el lead llega por WhatsApp), Postgres recibe solo 7.

Otro caso: si pasás `={{ "string literal" }}` con comillas escapadas, el parser puede contarlo mal.

### Fix (recomendado): patrón JSON deconstruction

En vez de pasar 10 parámetros separados, pasá **UN solo JSON** y deconstruí en SQL:

**Query SQL:**
```sql
WITH data AS (SELECT $1::jsonb AS d)
INSERT INTO public.leads (agency_id, manychat_id, display_name, ig_user_id, ...)
SELECT
  'fixed-uuid'::uuid,
  d->>'manychat_id',
  NULLIF(d->>'display_name', ''),
  NULLIF(d->>'ig_id', ''),
  ...
FROM data
ON CONFLICT (...) DO UPDATE SET ...
RETURNING id;
```

**queryReplacement:**
```
={{ JSON.stringify({manychat_id: $('Edit Fields2').first().json.manychat_id ?? '', display_name: $('Edit Fields2').first().json.display_name ?? '', ig_id: $('Edit Fields2').first().json.ig_id ?? '', ...}) }}
```

UN solo string JSON, no se confunde con comas internas (están adentro del JSON, no separan params).

### Por qué falla `?? ''`

Intentamos `?? ''` para forzar string vacío en lugar de null:
```
={{ $('Edit Fields2').first().json.ig_id ?? '' }}, ={{ $('Edit Fields2').first().json.ig_username ?? '' }}
```

Pero cuando varios `?? ''` consecutivos evalúan a vacío, el resultado es:
```
=valor1, =, =, =, =valor5
```

El parser sigue colapsando. La única solución robusta es el JSON deconstruction.

### Referencia
- Skill: `n8n-postgres-prepared-statements`

---

## E03 — Postgres tira "no unique or exclusion constraint matching the ON CONFLICT"

### Síntoma
```
[Postgres] there is no unique or exclusion constraint matching the ON CONFLICT specification
```

### Causa raíz
El UNIQUE en la tabla es un **índice parcial** (con cláusula WHERE):

```sql
CREATE UNIQUE INDEX uq_messages_external_id
  ON messages (agency_id, channel, external_id)
  WHERE external_id IS NOT NULL;
```

Postgres exige que el `ON CONFLICT` también especifique la cláusula WHERE para usar índices parciales.

### Fix
Agregar la cláusula WHERE al `ON CONFLICT`:

**❌ ROMPE:**
```sql
ON CONFLICT (agency_id, channel, external_id) DO NOTHING
```

**✅ FUNCIONA:**
```sql
ON CONFLICT (agency_id, channel, external_id)
  WHERE external_id IS NOT NULL
  DO NOTHING
```

---

## E04 — Bot envía mensaje pero llega `undefined` al user

### Síntoma
- ManyChat responde 200 OK.
- El nodo `Set Respuesta Chatbot 2` o `Send Respuest Chatbot` ejecuta sin error.
- El user recibe mensaje vacío o el bot no responde.
- En n8n: el field `field_value` en el ManyChat HTTP request muestra "undefined".

### Causa raíz
Hay un nodo **en serie** entre el If/AI/Loop y el nodo que envía a ManyChat, que **sobrescribe el contexto del `$json.output`**.

Ejemplo: si pusiste `Persist outbound message` (Postgres) entre `If5` y `Set Respuesta Chatbot 2`, ahora `$json` en `Set Respuesta` es el output del Postgres (`{id: "uuid"}` o nada), no la respuesta del bot.

### Fix
Sacar el nodo de serie y ponerlo en **paralelo**:

```
If5 (true branch)
  ├─ Set Respuesta Chatbot 2 → Send → Wait → Loop    ← FLUJO PRINCIPAL (mantiene $json.output)
  └─ Persist outbound message                           ← PARALELO (no afecta downstream)
```

En la connection del nodo `If5`, agregar **dos nodos al mismo output** (índice 0):

```python
conns["If5"]["main"] = [
    [
        {"node": "Set Respuesta Chatbot 2", "type": "main", "index": 0},
        {"node": "Persist outbound message", "type": "main", "index": 0},
    ]
]
```

El nodo paralelo (Persist) NO se conecta a nada después.

### Alternativa
Si necesitás el resultado del Postgres para algo después, usar referencias explícitas:
```
Set Respuesta usa: {{ $('If5').item.json.output }}
```
En vez de `{{ $json.output }}`. Pero el approach paralelo es más limpio.

---

## E05 — Lead huérfano sin conversation → `Get Conversation State` vacío

### Síntoma
- Lead existe en `public.leads`.
- `Get Conversation State` (SELECT) devuelve `[]` o `[{}]` vacío.
- Todo el flujo downstream rompe porque no hay row de conversation para leer.

### Causa raíz
En tests previos rotos, `Crear Lead` ejecutó OK pero `Crear Conversation` falló (ej. por error de prepared statements). Quedó un lead huérfano sin conversation.

### Fix
Cambiar el nodo de SELECT a un **UPSERT** que crea la conversation si no existe:

**❌ Get (rompe si no existe):**
```sql
SELECT id, handler, handoff_status, bot_paused_until
FROM public.conversations
WHERE agency_id = $1::uuid AND lead_id = $2::uuid AND channel = $3::message_channel;
```

**✅ Get or Create (siempre devuelve row):**
```sql
INSERT INTO public.conversations (agency_id, lead_id, channel, handler, handoff_status)
VALUES ('{agency_id}'::uuid, $1::uuid, $2::message_channel, 'bot', 'none')
ON CONFLICT (agency_id, lead_id, channel) DO UPDATE SET updated_at = NOW()
RETURNING id, handler, handoff_status, bot_paused_until;
```

---

## E06 — Loop Over Items se ejecuta una sola vez o loop infinito

### Síntoma
- El loop `splitInBatches` no itera por cada item (procesa solo 1).
- O entra en loop infinito.

### Causa raíz
Conectaste el nodo de procesamiento al output equivocado. En `splitInBatches` v3:

- **Output 0 = `done`** (cuando terminó de procesar todo el batch)
- **Output 1 = `loop`** (se dispara por cada item del batch)

Visualmente n8n los muestra al revés (loop arriba, done abajo) y confunde a los humanos. Es **counterintuitive** según la propia doc de n8n.

### Fix correcto
- Conectar nodos de **procesamiento** al output **1 (loop)**.
- Conectar nodos **post-loop** al output **0 (done)** o dejarlo sin conectar.
- El **último nodo del loop** debe conectarse de vuelta al `Loop Over Items` (cierra el ciclo).

```python
# Connections correctas
conns["Split Out"]["main"][0] = [{"node": "Loop Over Items1", ...}]
conns["Loop Over Items1"]["main"][1] = [{"node": "If5", ...}]  # loop branch
conns["If5"]["main"][0] = [{"node": "Set Respuesta", ...}]
conns["Set Respuesta"]["main"][0] = [{"node": "Send", ...}]
conns["Send"]["main"][0] = [{"node": "Wait2", ...}]
conns["Wait2"]["main"][0] = [{"node": "Loop Over Items1", ...}]  # vuelve al loop
# Output 0 (done) no se conecta o va a un noOp
```

### Referencia
Doc oficial n8n: https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.splitinbatches/

---

## E07 — Information Extractor con prompt v2 (Casa Tranquility, viejo flujo) sigue diciendo cosas mal

### Síntoma
- El bot recomienda villas que ya no existen ("Casa Tranquility", "Villa Mariposa").
- El RAG sigue trayendo info vieja con URLs `/property/X` (cuando la web ya usa `/villas/X`).

### Causa raíz
El RAG en Supabase Vector Store tiene chunks viejos. Aunque actualices el prompt del Agent con la lista nueva, el RAG sigue devolviendo info obsoleta.

### Fix
1. Actualizar el doc del RAG en `clients/{cliente}/docs/` (markdown plano).
2. **Re-ingestar el RAG en Supabase** (borrar rows viejas, insertar nuevas con embeddings frescos).
3. En el prompt del Agent agregar:
   ```
   Si el RAG devuelve una propiedad que NO está en la tabla PORTAFOLIO de este prompt, IGNORALA (es info obsoleta).
   ```

---

## E08 — Existe? (If) siempre va al False branch aunque el lead exista

### Síntoma
- `Buscar Lead (Postgres)` devuelve un lead con datos (manychat_id matchea).
- El siguiente If `Existe?` va al **False branch** (lead NO existe) y crea uno duplicado.

### Causa raíz
La condición del If usa el nombre del campo **viejo de Airtable** (ej. `$json['ID Manychat']` con espacio) pero el output de Postgres usa snake_case (`$json.manychat_id`). Resultado: `undefined !== "1515862162"` → siempre False.

### Fix
Actualizar la condición del If:

**❌ Viejo (Airtable):**
```javascript
$json['ID Manychat'] === $('ID y Mensaje').item.json.ID
```

**✅ Nuevo (Postgres):**
```javascript
$json.manychat_id === $('ID y Mensaje').first().json.ID
```

---

## E09 — Webhook ManyChat envía payload con estructura nueva

### Síntoma
Al cambiar la config de ManyChat para enviar `body.data.X` y `body.canal`, todos los `Edit Fields2` rompen porque siguen leyendo de `body.X`.

### Causa raíz
ManyChat permite estructurar el payload del External Request. El payload viejo enviaba `body = {id, name, ...}`. El nuevo (multi-canal) envía `body = {data: {id, name, ...}, canal: "WA"}`.

### Fix
1. Actualizar paths en `Edit Fields2`: `body.X` → `body.data.X`.
2. Agregar nuevo campo `canal` que lee `body.canal`.
3. Derivar `channel` para Supabase:
   ```javascript
   body.canal === 'WA' ? 'whatsapp' : (body.canal === 'IG' ? 'instagram' : 'messenger')
   ```
4. Para WA + IG en el mismo workflow, hacer el `flow_ns` condicional:
   ```javascript
   canal === 'IG' ? FLOW_NS_IG : FLOW_NS_WA
   ```

### Referencia
- `docs/04-payload-manychat-multicanal.md`
- `docs/05-patron-multi-canal.md`

---

## E10 — MCP Supabase falla con "Project not found" o "Unauthorized"

### Síntoma
- Tools de Supabase MCP (`list_tables`, `execute_sql`) fallan después de cambiar `project-ref`.

### Causa raíz
Cada cliente puede tener su **propia cuenta** Supabase (no compartida). El access token (`sbp_...`) en `~/.claude.json` es de UNA cuenta. Si solo cambiás el `project-ref` pero dejás el token viejo (que no tiene acceso al nuevo proyecto), falla.

### Fix
1. **Preguntar al founder ANTES**: "¿este cliente tiene su propia cuenta Supabase o usa la misma que el anterior?"
2. Si es **otra cuenta**: pedir el Personal Access Token nuevo (genera en Supabase Dashboard → Account Settings → Access Tokens), agregar al `clients/{cliente}/.env` como `SUPABASE_ACCESS_TOKEN`.
3. Actualizar `~/.claude.json` con AMBOS: nuevo `--access-token` Y nuevo `--project-ref`.
4. **Reiniciar Claude Code** una sola vez para que el MCP recargue.

### Referencia
- Memoria: `feedback_supabase_mcp_per_client.md`

---

## E11 — Workflow n8n PUT devuelve 400 Bad Request

### Síntoma
Al hacer `PUT /api/v1/workflows/{id}` para actualizar un workflow, n8n devuelve `400 Bad Request` sin mensaje claro.

### Causa raíz
El n8n public API es estricto sobre qué campos acepta. **Solo** acepta:
- `name`
- `nodes`
- `connections`
- `settings`
- `staticData`

Cualquier otro campo (`id`, `createdAt`, `updatedAt`, `active`, `versionId`, `tags`, `triggerCount`, `shared`, `pinData`, `meta`) → 400.

### Fix
Filtrar el body antes de mandar:

```python
allowed = {"name", "nodes", "connections", "settings", "staticData"}
body = {k: workflow[k] for k in allowed if k in workflow}
```

Ver `scripts/n8n-update-node.py` en el repo.

---

## E12 — Encoding de console Windows muestra `?` en lugar de tildes

### Síntoma
Cuando un script Python imprime `print('Jacó')` en consola Windows, sale `Jac?`. Te confunde haciéndote pensar que el JSON está mal codificado.

### Causa raíz
La consola Windows por defecto usa `cp1252`, no UTF-8. El archivo JSON sí está bien en UTF-8.

### Fix
Para que el print salga bien:
```bash
PYTHONIOENCODING=utf-8 python script.py
```

O usar `sys.stdout.buffer.write(text.encode('utf-8'))` en lugar de `print()`.

**El archivo en disco está bien**. Es solo cuestión de display.

---

## Errores de "olla rota" (estado inconsistente, no reproducibles fácil)

Si después de muchos tests rotos te queda la DB en estado raro (leads sin conversation, conversations con handler='human' que no debían, mensajes duplicados):

### Fix: limpiar el lead del founder de test
```sql
DELETE FROM public.leads
WHERE agency_id = '{agency_id}'::uuid
  AND manychat_id = '{tu_manychat_id_de_test}';
```

CASCADE elimina conversations + messages + tasks asociados automáticamente.

Y validar que todo quedó en cero:
```sql
SELECT
  (SELECT COUNT(*) FROM public.leads WHERE manychat_id = '{tu_id}') AS leads,
  (SELECT COUNT(*) FROM public.conversations WHERE lead_id = ...) AS conv,
  (SELECT COUNT(*) FROM public.messages WHERE lead_id = ...) AS msgs,
  (SELECT COUNT(*) FROM public.tasks WHERE lead_id = ...) AS tasks;
```

---

## Lo más importante de TODO

Si solo recordás 3 reglas de este doc:

1. **Llaves literales `{}` en prompts LangChain → output vacío silencioso.** Eliminá ejemplos JSON inline.
2. **Múltiples valores nullables en queryReplacement → "no parameter $N".** Usá JSON deconstruction.
3. **Nodos Postgres en serie rompen `$json.output` downstream.** Ponelos en paralelo.

Las otras 9 son variaciones, edge cases o consecuencias de no respetar estas 3.
