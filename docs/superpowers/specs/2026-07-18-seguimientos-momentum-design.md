# Seguimientos automáticos — Momentum AI (v1)

**Fecha:** 2026-07-18
**Autor:** Hans + Claude
**Estado:** Diseño aprobado (pendiente review del spec escrito → writing-plans)
**Alcance:** SOLO la agency `Momentum AI CRM` (`dc000e2f-2cde-4c28-8d06-ebf70ae3411d`). Generalización multi-tenant = fuera de alcance (v2).

---

## 1. Problema

Cuando el bot le escribe a un lead y el lead no contesta, la conversación queda parada y se
desperdicia la ventana de 24h de WhatsApp. Hoy no hay nada que la reactive: si el lead no vuelve
solo, se pierde.

Queremos un motor de **seguimientos con cadencia**: si el lead no responde, el sistema le manda
hasta 3 follow-ups **personalizados por IA** (con el contexto completo de la conversación),
escalando el tono, dentro de la ventana de 24h, y guardando cada follow-up en el historial para que
el siguiente tenga contexto.

## 2. Modelo mental

Un workflow n8n **independiente del bot** ("Seguimientos Momentum") corre por cron cada ~15 min.
En cada corrida:

1. Busca conversaciones de Momentum **paradas** (el bot habló último, el lead no contestó).
2. Para cada una decide si **toca** un follow-up ahora (según cuánto pasó desde el último saliente).
3. Le pasa **toda la conversación** a Claude → redacta un mensaje personalizado.
4. Lo manda por WhatsApp (reusando el camino de envío del bot) y lo **guarda en `messages`**.
5. Registra una fila en `followups` (audit + contador de paso).

Es **stateless / auto-curativo**: si n8n se cae o se salta una corrida, la siguiente la agarra igual.
No depende de timers frágiles por conversación.

## 3. Arquitectura

**Elegido: cron que escanea `conversations`.**

| Enfoque | Trade-off | Decisión |
|---|---|---|
| Cron escanea la DB cada 15 min | Robusto, auto-curativo, desacoplado del bot, un solo lugar. Latencia ~15 min (irrelevante para follow-ups de horas). | ✅ Elegido |
| Timers por conversación (schedule al enviar) | Preciso al minuto pero frágil (si falla el timer se pierde) y obliga a tocar el workflow del bot. | ❌ Descartado |

El workflow NO modifica el workflow del bot. Solo lee/escribe DB y manda por el mismo canal de
salida (YCloud) que ya usa el bot.

### 3.1 Anclas de tiempo (críticas — no confundir)

- **Ancla de la ventana 24h:** `conversations.last_inbound_at` (último mensaje real del lead).
  **NO cambia** mientras dura el streak de follow-ups. Cierra la ventana en `last_inbound_at + 24h`.
- **Ancla de la cadencia:** `greatest(conversations.last_outbound_at, max(followups.sent_at del
  streak))` (último saliente real, sea la respuesta original del bot o el follow-up anterior).
  **SÍ avanza** con cada follow-up → el próximo paso se ancla al anterior. Se incluye
  `followups.sent_at` en el `greatest` para no depender de la latencia del webhook al re-anclar.

Esto implementa literalmente "relativo al último mensaje": cada paso dispara `intervalo[paso]`
después del último saliente, y el streak completo queda topado a 24h desde el último msg del lead.

> ⚠️ Timezone: el silencio nocturno se calcula en hora **Costa Rica (UTC-6, sin DST)** con
> aritmética de offset fija, NO con `setHours` del runtime (que corre en UTC). Ver skill
> `inicio-dia-timezone-fija`.

## 4. Elegibilidad y condiciones de corte

Una conversación recibe follow-up en una corrida **solo si TODAS se cumplen**:

1. `agency_id = 'dc000e2f-2cde-4c28-8d06-ebf70ae3411d'` (Momentum)
2. `handler = 'bot'` **y** no está en handoff: `handoff_status = 'none'` **y**
   (`bot_paused_until IS NULL OR bot_paused_until < now()`)
3. El **último mensaje del hilo es del bot** (`last_outbound_at > last_inbound_at` **y** el último
   saliente es `is_bot_generated = true` / `sender_kind = 'bot'`). Si un humano/agente escribió
   último, se salta (lo está manejando una persona).
4. **Dentro de la ventana 24h:** `now() < last_inbound_at + interval '24 hours'`
5. **Paso disponible:** follow-ups ya enviados en este streak `< 3`
   (streak = filas en `followups` con `conversation_id = X` y `created_at > last_inbound_at`)
6. **Intervalo cumplido:** `now() >= last_outbound_at + intervalo[paso_actual]`
7. **Fuera del silencio nocturno** (hora CR no está entre 21:00 y 07:00)
8. `archived_at IS NULL`

`intervalo = [4h, 8h, 6h]` (paso 0 → 4h después del último saliente, paso 1 → 8h, paso 2 → 6h).

### Cortes / cancelaciones (automáticos, sin fila de "cancelado" que mantener)

- **Lead responde:** al llegar un inbound, `last_inbound_at` avanza → condición 3 y 5 se resetean
  solas. Si el lead se vuelve a quedar callado, arranca un **streak nuevo** (0 follow-ups).
- **Handoff a humano:** condición 2 lo excluye.
- **Ventana 24h cerrada:** condición 4 lo excluye. En v1 **paramos** (no plantilla Meta).
- **Máximo alcanzado:** condición 5 lo excluye.
- **Silencio nocturno:** condición 7 **posterga** (no cancela) — la corrida de las 7am lo agarra,
  salvo que para entonces la ventana 24h ya haya cerrado (entonces se pierde ese follow-up, ok).

## 5. Mensaje personalizado por IA

Cada follow-up lo redacta **Claude** (no plantilla estática). Input al prompt:

- **Historial completo** de la conversación (lead ↔ bot, en orden cronológico).
- **Número de follow-up** (1, 2 o 3) para escalar el tono.
- **Follow-ups previos del streak** ya enviados (para no repetir texto).
- **Datos del lead** que el extractor ya sacó (nombre, presupuesto, zona, etc., de
  `extractor_field_values`) si existen.

El mensaje **engancha con lo último que hablaron** (no un genérico "¿seguís interesado?").

### Reglas de estilo (van en el prompt — metodología Momentum)

- Puntuación humana: sin punto final, sin `;`, sin `¿`, sin dos puntos, sin em-dash (—).
- Suena a WhatsApp a un conocido, no a artículo.
- **Varía** cada follow-up (nunca el mismo texto literal).
- No inventa datos ni promete lo que el bot no puede mandar (solo texto + links).
- Escalado de tono: **1** = recordatorio suave · **2** = aporta un ángulo / valor nuevo ·
  **3** = cierre respetuoso ("te escribo cuando quieras retomar").

### Persistencia (revisado 2026-07-18 tras auditar el camino real)

El follow-up se manda por YCloud **igual que cualquier respuesta del bot** y el **webhook
`ycloud-webhook` ya existente lo persiste solo** en `messages` (con `body`, `sender_kind='bot'`,
`is_bot_generated=true`, keyed por `external_id = wamid`). Camino probado: **1033 de 1040**
mensajes salientes del bot de Momentum tienen `body` por esta vía.

→ **NO auto-insertamos en `messages`.** Esto elimina por completo el riesgo de fila duplicada
(el `POST /v2/whatsapp/messages` de YCloud es **asíncrono**: devuelve el `id` propio de YCloud,
NO el `wamid`; el `wamid` — que es la key del webhook — llega después. Insertar nosotros con el id
de YCloud crearía una fila que el webhook no reconoce → duplicado. Por eso dejamos que el webhook
sea el único que escribe en `messages`).

El insert de la fila en `messages` (vía webhook) **actualiza `last_outbound_at` / preview** por el
trigger `denorm_conversation_on_message` (re-ancla la cadencia, sección 3.1; no infla `unread`, no
resucita archivadas). Latencia de segundos — irrelevante porque el próximo paso es en horas.

La **fuente de verdad del follow-up** (texto exacto enviado + contador del streak + audit) es la
tabla **`followups`** (`rendered_body`), que escribimos nosotros **en la misma corrida, inmediato**
(no depende de la latencia del webhook).

## 6. Datos

Reusamos las tablas que ya existen (extendiéndolas mínimamente si hace falta en el plan):

- **`followups`** (instancias): 1 fila por follow-up enviado. Campos relevantes: `agency_id`,
  `conversation_id`, `lead_id`, `status` (`sent`), `scheduled_for`, `sent_at`, `rendered_body`
  (el texto que redactó la IA), `created_at`. Sirve como **audit + contador de paso del streak**.
  > Nota: el comentario original de `followup_rules` decía que las instancias "van a `tasks`".
  > Este diseño usa `followups` (existe y calza mejor). Deviación consciente.
- **`followup_rules`** (config): en v1 **no la usamos** — la cadencia/máximo/silencio quedan
  **fijos en el workflow** (es solo Momentum). Cuando generalicemos a multi-tenant, la config
  (intervalos, máximo, ventana, silencio, instrucción de tono) sube a `followup_rules`
  (probablemente extendiendo el schema). Esto es v2.

## 7. Camino de envío

Los follow-ups se mandan por el **mismo endpoint que usa el bot**: `POST https://api.ycloud.com/v2/whatsapp/messages`
con `httpHeaderAuth` (credencial n8n **Momentum AI**, id `jfwQ9Rp74VHhXDsH`), body
`{ from, to, type:'text', text:{ body } }`. Diferencias con el bot (que lee del webhook entrante):

- **`from`** = número del negocio, resuelto de `agency_channels` (Momentum: `50689839490`,
  `provider='ycloud'`, `is_active=true`). En un cron NO hay webhook entrante de dónde sacarlo.
- **`to`** = `leads.whatsapp_phone` (formato `50683984732`, sin `+`).

**No** insertamos en `messages` (lo hace el webhook — sección 5). Tras enviar, insertamos la fila de
audit en `followups`.

## 8. Idempotencia y concurrencia

- El cron de n8n se configura **single-instance** (`settings.executionOrder`, sin solape).
- **El guard anti-doble-envío es la tabla `followups`, no `messages`:** apenas se envía el paso N se
  hace INSERT inmediato en `followups`. La query de elegibilidad del próximo run cuenta las filas
  `followups` del streak (`status='sent'` y `sent_at > conversations.last_inbound_at`) → si el paso
  ya se mandó, la conversación no vuelve a calificar. No depende de la latencia del webhook.
- El paso (0/1/2) se deriva del `count` de `followups` del streak; el ancla de tiempo del próximo
  paso es `greatest(last_outbound_at, max(followups.sent_at del streak))` → inmune a la latencia del
  webhook para re-anclar.

## 9. Fuera de alcance (v1)

- Plantillas aprobadas por Meta para reabrir fuera de la ventana de 24h (v2).
- Generalización a todos los tenants (v2 — sube la config a `followup_rules`).
- Configuración de la cadencia desde la UI del CRM (v2).
- Canales que no sean WhatsApp.
- Botón manual de "mandar seguimiento ahora" desde el inbox (posible v1.1, no v1).

## 10. Riesgos / edge cases considerados

- **Follow-up cae en silencio nocturno y la ventana cierra antes de las 7am:** se pierde ese
  follow-up. Aceptado.
- **Humano escribe mientras `handler='bot'`:** condición 3 (último saliente `is_bot_generated`)
  lo protege — no seguimos por encima de un humano.
- **Lead responde justo entre corridas:** la siguiente corrida ve el nuevo `last_inbound_at` y no
  manda (streak reseteado). Peor caso: un follow-up ya salió — aceptable.
- **Re-ancla de cadencia:** al actualizar `last_outbound_at`, el paso siguiente se cuenta desde el
  follow-up anterior (intervalos 4h/8h/6h entre envíos), coherente con "relativo al último mensaje".
