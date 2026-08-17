# Skill: Contar los event_type reales antes de arreglar un webhook

## Cuándo usar esta skill

- Vas a agregar o arreglar el manejo de un tipo de evento en un webhook (reacciones, borrados, respuestas, media, status).
- Un fix de webhook "funcionó en la prueba" pero **al cliente le falló igual**.
- Estás por escribir `if (evento.tipo === 'X')` basándote en cómo creés que funciona la plataforma.
- Aparece un tipo de mensaje/evento nuevo que no manejabas.

## Por qué existe esta skill

Capturada el **2026-07-16** en el CRM de Momentum, donde **el mismo error se cometió TRES veces en una sola sesión**:

1. **Reacciones.** Se arregló el camino del lead. El founder probó, **le falló**. Las reacciones llegan por **3 eventos**: `inbound_message.received` (el lead), `smb.message.echoes` (**el negocio desde su celular**) y `message.updated` (status). Él había reaccionado desde el número del negocio → camino no cubierto.
2. **Rescate de media.** Filtró por `direction='inbound'` y dejó afuera **19 medias salientes** por coexistencia.
3. **Respuestas citadas.** El echo también las trae.

**La causa siempre fue la misma suposición: "esto lo hace el lead".** Es falsa. En WhatsApp con coexistencia, **el negocio también actúa desde su celular** y eso entra por el webhook como un evento distinto.

## El error mental que hay que matar

> *"Las reacciones las manda el cliente."*
> *"La media entrante viene del lead."*
> *"Si es outbound, salió de mi app."*

Las tres son mentira cuando hay coexistencia. El dueño contesta desde su teléfono, reacciona desde su teléfono y borra desde su teléfono. Todo eso **vuelve por el webhook**.

## Proceso

### 1. Preguntarle a los datos, no a la intuición

Antes de escribir una línea, contar lo que **realmente** llega. Si guardás los eventos crudos (y deberías — ver `chatbot-db-schema-supabase`), la respuesta está ahí:

```sql
-- ¿Por qué event_type llega el tipo que me interesa?
select
  event_type,
  raw_payload->'whatsappMessage'->>'type'        as tipo_outbound,
  raw_payload->'whatsappInboundMessage'->>'type' as tipo_inbound,
  count(*) as veces
from public.webhook_events_raw
where source = '<bsp>'
  and (raw_payload->'whatsappMessage'->>'type' = '<tipo>'
       or raw_payload->'whatsappInboundMessage'->>'type' = '<tipo>')
group by 1,2,3 order by veces desc;
```

**Caso real (reacciones):**
```
whatsapp.inbound_message.received  | reaction |  7   ← el lead
whatsapp.smb.message.echoes        | reaction |  2   ← el NEGOCIO desde su celular
whatsapp.message.updated           | reaction |  1   ← status de una nuestra
```
Tres caminos. El fix inicial cubría **uno**.

### 2. Contar TODOS los tipos que caen al `default`

El `default` de un parser suele ser un basurero silencioso. Contarlo revela bugs que nadie reportó:

```sql
select raw_payload->'whatsappInboundMessage'->>'type' as tipo, count(*)
from public.webhook_events_raw
where source='<bsp>' and event_type='<inbound>'
group by 1 order by 2 desc;
```

**Caso real:** se reportaron **6** reacciones rotas. El conteo mostró **56 burbujas de JSON**: 33 `unsupported`, 14 `revoke`, 8 `reaction`, 1 `contacts`. **El bug era 9× más grande que el reporte.**

### 3. Decidir por camino, no por tipo

Para cada camino, el mismo evento puede significar algo distinto:

| Camino | Quién actuó | Qué guardar |
|---|---|---|
| `inbound_message.received` | el lead | `actor_kind = 'lead'` |
| `smb.message.echoes` | **el negocio, desde su celular** | `actor_kind = 'agent'`, `actor_user_id = null` (teléfono compartido: no se sabe quién) |
| `message.updated` | nadie — es un status | **ignorar** (ya lo guardó quien lo originó) |

Parametrizar la función por actor en vez de duplicarla:
```ts
async function processReaction(sb, { agency_id, conversation_id, msg, actor_kind }) { … }
```

### 4. Verificar reproduciendo eventos REALES de cada camino

No inventar payloads. Reenviar los guardados, firmados con HMAC como los firma el BSP, contra el webhook **desplegado**. Un check por camino.

⚠️ **Afirmar según lo que el evento DICE, no lo que esperás.** Caso real: el último echo guardado era una **quita** de reacción (emoji vacío) — el founder reaccionó ❤️ y se arrepintió 7 s después. El test asumía que todo evento agrega y **marcó rojo un comportamiento correcto**.

## Output esperado

- Una tabla de conteo real por `event_type` **antes** de tocar código.
- El handler cubriendo **todos** los caminos, parametrizado por actor.
- Script de verificación que reproduce un evento real **de cada camino** contra el webhook desplegado.

## Ejemplo

**Input:** *"las reacciones del cliente aparecen como código JSON"*.

**Output:** el conteo revela 3 caminos (7 + 2 + 1) y que el `default` produjo **56** burbujas, no 6. El fix cubre los tres; la verificación reproduce uno de cada uno: 12/12.

## Regla de oro

**"Solo el lead hace las cosas" es falso.** Antes de arreglar un webhook: `group by event_type`. La plataforma tiene más caminos de los que imaginás, y el cliente va a usar justo el que no cubriste.
