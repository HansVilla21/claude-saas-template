# Skill: Bot WhatsApp — Recuperar mensajes `unsupported` (clic de anuncio) cableando el fallback del Switch

## Cuándo usar esta skill

- Tenés ads de **click-to-WhatsApp** corriendo y entran leads cuyo primer mensaje aparece como **"Unsupported message" / "Message type: unknown"** en el inbox (YCloud o el CRM) y el bot **no les responde nada**.
- En el payload de YCloud ves `whatsappInboundMessage.type = "unsupported"` con un error de Meta `131060` ("This message is unavailable") o `131051` ("Message type unknown"), y `userMessage` vacío.
- Estás montando o replicando un bot de WhatsApp/IG en n8n con un Switch que rutea por tipo de mensaje (`text` / `audio` / `image`) y querés que NO se pierda ningún lead por mandar un tipo raro.

**No usar** para diagnosticar media corrupta de imágenes/audios normales (eso es otra cosa: link no-JPG, mime, etc.). Esta skill es para el tipo `unsupported` **sin contenido recuperable**.

## Por qué existe esta skill

Capturada el 2026-06-14. Con ads recién encendidos, entraron 3 leads (Mayela, Rigo, Tere) como `unsupported` y quedaron **sin una sola respuesta** — leak silencioso de leads PAGADOS. La causa no era un bug: el Switch de tipo de mensaje tenía la salida fallback **configurada pero desconectada**, así que el `unsupported` caía ahí y moría. Aprendizaje no-obvio y cross-project (cualquier bot de ads con este patrón lo tiene).

## Diagnóstico: qué es el mensaje `unsupported` (y qué NO es)

- **NO es un bug** del CRM, el webhook, n8n ni YCloud. El contenido se pierde **del lado de Meta**, antes de llegar al BSP. YCloud reenvía fielmente un placeholder vacío.
- **`131060` "This message is unavailable"** → limitación de WhatsApp Coexistence / **dispositivo compañero** no soportado (WhatsApp Web, tablet/segundo teléfono vinculado, o WhatsApp Business en coexistencia). También típico del primer contacto de un **clic de anuncio**.
- **`131051` "Message type unknown"** → el usuario mandó un tipo que la Cloud API no soporta (encuesta, foto "ver una vez", reenvío de estado, evento, etc.).
- En ambos `userMessage` llega **vacío** — no hay texto que rescatar.

**Cómo confirmar (no asumir):**
```sql
-- ¿cuántos unsupported vs normales? ¿esos números mandaron texto alguna vez?
select raw_payload->'whatsappInboundMessage'->>'type' as t, count(*)
from public.webhook_events_raw
where source='ycloud' and event_type='whatsapp.inbound_message.received'
group by 1 order by 2 desc;
```
Si los números que mandaron `unsupported` **nunca** mandaron texto → son leads que escribieron una sola vez (clic de anuncio) y se perdieron.

## El patrón de fix (lo más replicable)

En el bot de n8n, el Switch que rutea por tipo (`Is Text or Audio or Image?`) casi siempre ya trae:
```json
"options": { "fallbackOutput": "extra", "renameFallbackOutput": "unsupported" }
```
→ existe una **4ª salida "unsupported"** que normalmente está **sin cablear**. No hay que agregar el tipo: hay que **conectar esa salida** al carril normal del agente.

```
Switch [salida 4 "unsupported"]  (hoy muerta)
   → IF "Solo Inbound (Guard)"   (eventType == whatsapp.inbound_message.received)
        → Mark As Read
        → Set "Normalize - Unsupported"  (userMessageFinal = SENTINEL no-vacío)
             → ID y Mensaje   ← punto de convergencia que ya usan text/audio/image
```

### Las 3 gotchas (memorizar)

1. **El sentinel debe ser NO-VACÍO.** Un string vacío lo come el batching de Redis (`Juntar Mensajes` arma `MensajesJuntados` vacío) y/o rompe el nodo Agent (input vacío → respuesta incoherente o error). Usar un marcador claro, ej:
   `userMessageFinal = "[contacto nuevo desde anuncio sin texto]"`.

2. **El guard `eventType == inbound` es obligatorio.** El fallback del Switch captura *todo* lo que no matchea las reglas. Si el webhook del bot recibe un `whatsapp.message.updated` (status de un saliente nuestro), caería en el fallback y dispararía un **saludo fantasma** al lead. El IF deja pasar solo entrantes reales.

3. **El prompt del agente necesita saber qué hacer con el sentinel/vacío.** Agregar un bloque quirúrgico (NO reescribir el prompt):
   ```
   ## CONTACTO SIN MENSAJE LEGIBLE
   A veces el lead hace clic en el anuncio y cae al chat sin texto, o WhatsApp no
   entrega su mensaje, y te llega vacio o con un marcador tipo [contacto nuevo desde anuncio sin texto]
   - Si es la PRIMERA interaccion (no hay historial) tratalo como inicio normal y responde con tu saludo de ETAPA 1 HOOK
   - Si ya venian conversando no reinicies, decile corto y natural que no te llego bien y pedile que te lo reenvie
   ```

4. **No dupliques la lógica de horario/batching.** Como el `unsupported` entra al MISMO carril que un texto, hereda gratis el check de horario (fuera de oficina → OOH), el anti-pausa, el batching, etc. No tocar nada de eso.

## Recuperar leads YA perdidos (replay)

Los que llegaron antes del fix quedaron sin respuesta. Para rescatarlos (y de paso probar end-to-end), **re-enviar el evento original de YCloud al MISMO webhook del bot**:

```js
// payload = raw_payload guardado en webhook_events_raw (el evento YCloud completo)
await fetch("https://<n8n-host>/webhook/<path-del-bot>", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),   // { id, type, whatsappInboundMessage: {...} }
});
```
- El webhook del bot **no verifica HMAC** (eso lo hace el webhook de Supabase) → el replay pasa.
- **No re-loguea el inbound** en el CRM (eso lo hace el webhook de Supabase, que no tocás) → solo dispara la respuesta del bot.
- Es acción **outbound a personas reales** → pedir OK al founder antes de correrlo.

## Deploy y verificación (camino seguro)

1. **Snapshot** del workflow vivo antes de tocar (`snapshots/<wf>-PRE-<cambio>-<fecha>.json`).
2. **Script idempotente** (no editar el JSON a mano): agrega nodos solo si faltan, agrega el bloque del prompt solo si el marcador no está, cablea solo si la conexión no existe.
3. **Deploy PUT** `/api/v1/workflows/{id}` con solo `{name, nodes, connections, settings}` (los demás campos son read-only).
4. **Verificar por hash**: SHA-256 de `{nodes, connections}` local == el del workflow re-fetcheado → confirma que entró exacto, sin regresión.
5. **Re-activar** si el PUT lo desactivó (`POST /workflows/{id}/activate`).
6. **Verificación REAL** (no estructural): replay de un caso → `messages` muestra el outbound `sender_kind='bot'` entregado + la ejecución n8n en `success`.

## Output esperado

Un lead de anuncio que llega como `unsupported` recibe el **saludo de inicio del agente** (HOOK) en vez de silencio, y los futuros se manejan solos. Caso real verificado: 3 leads recuperados, los 3 con HOOK `"Hola! Que bueno que escribis, contame que te llamo la atencion de lo que viste?"` entregado.

## Ejemplo

**Input (evento YCloud, sin contenido):**
```json
{ "type": "whatsapp.inbound_message.received",
  "whatsappInboundMessage": {
    "from": "+50685705076", "customerProfile": {"name": "Tere"},
    "type": "unsupported",
    "errors": [{"code":"131060","title":"This message is unavailable."}],
    "unsupported": {"type":"unknown"} } }
```
**Antes del fix:** muere en el Switch, 0 respuesta.
**Después:** Switch[unsupported] → guard → sentinel → agente → "Hola! Que bueno que escribis, contame que te llamo la atencion de lo que viste?" (entregado).

---

Relacionada con: `conexion-whatsapp-ycloud-supabase-n8n` (el canal y el schema de eventos), `n8n-workflow-build-script` (deploy PUT + verificación por hash), `n8n-workflow-versioning` (snapshots/rollback), `bot-multibubble-output-flow` (el carril de salida que recibe la respuesta del agente). Caso real: build `crm-v2/scripts/build-bot-c-v1-unsupported-fallback.js`.
