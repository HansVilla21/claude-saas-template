# Skill: Bot Anti-Loop Detector + Descalificación

## Cuándo usar esta skill

- Tu bot conversacional a veces queda "atascado" en loops (repite preguntas, no avanza la conversación).
- Recibís quejas de leads tipo "ya te respondí eso", "estás repitiendo lo mismo", "ya me cansaste" — síntomas de loop.
- Querés un mecanismo automático que detecte el patrón y **apague el bot** + notifique al agente humano para que tome la conversación.
- Necesitás también detectar leads "descalificados" (spam, broma, ofensivo) y filtrarlos sin gastar tokens.

## Por qué existe esta skill

Los LLMs son buenos para conversar pero pueden:
- Repetir preguntas que ya tienen respuesta en la historia (especialmente con context window corto)
- No reconocer cuando el lead expresó frustración y debe ceder
- Seguir hablando con leads que claramente no son prospectos (insultos, bromas, spam)

Sin red de seguridad, el bot puede:
- Quemar la relación con un lead caliente que ahora odia al bot
- Gastar tokens en conversaciones que nunca van a convertir
- Generar reviews/feedback negativos públicos

Solución: un **Detector de Descalificación** (LLM secundario, modelo barato como gpt-4.1-mini) que evalúa cada turno y dispara apagado del bot cuando detecta señales claras.

## Proceso

### 1. Definir las señales de descalificación

Distinguir entre 2 estados que dan el mismo resultado (apagar bot):

**A — Lead frustrado / loop detected:**
- Repite "ya te dije", "estás repitiendo", "ya respondí eso"
- Expresa frustración explícita: "ya me cansaste", "esto no sirve", "déjenme en paz"
- Pide hablar con humano: "quiero hablar con una persona", "no quiero hablar con bot"
- 3+ mensajes del lead sin que el bot haya hecho progreso (mismo tema, sin avanzar)

**B — Lead no-cualificado / descalificado:**
- Spam o broma: "asdasdasd", "test", emoji-only series largas
- Ofensivo: insultos, lenguaje inapropiado
- Pregunta off-topic recurrente (no es tu vertical): pide trabajo, ofrece servicios, etc.

En ambos casos: **apagar bot → notificar agente humano → no responder más automáticamente**.

### 2. Implementar el Detector como nodo Information Extractor

En N8N, después del Agente Principal y antes de enviar la respuesta, agregar un nodo `@n8n/n8n-nodes-langchain.informationExtractor` que evalúa el turno:

```json
{
  "name": "Detector de Descalificacion",
  "type": "@n8n/n8n-nodes-langchain.informationExtractor",
  "parameters": {
    "model": "gpt-4.1-mini",          // modelo barato — uso intensivo
    "text": "Mensaje del lead: {{ $('Mensaje actual del usuario').first().json.text }}\n\nHistorial reciente (últimos 5 turnos):\n{{ $('Historial').first().json.text }}",
    "attributes": [
      {
        "name": "should_apagar_bot",
        "type": "boolean",
        "description": "True si el lead expresó frustración, pidió hablar con humano, o está claramente descalificado (spam, broma, ofensivo, off-topic recurrente). False si la conversación va normal."
      },
      {
        "name": "razon_apagado",
        "type": "string",
        "description": "Una de: 'lead_frustrado' | 'pide_humano' | 'spam' | 'ofensivo' | 'off_topic' | 'none'. 'none' si should_apagar_bot=false."
      },
      {
        "name": "resumen_para_agente",
        "type": "string",
        "description": "1-2 líneas para el agente humano si debe tomar la conversación. Vacío si should_apagar_bot=false."
      }
    ]
  }
}
```

### 3. Branch: ¿apagar bot?

Después del Detector, nodo IF "Apagar bot?":
- Condición: `{{ $('Detector de Descalificacion').first().json.output.should_apagar_bot }} === true`
- TRUE branch → 2 acciones paralelas:
  1. UPDATE conversations: `handler='human'`, `bot_paused_until=null` (permanente hasta toggle manual), `handoff_status='pending'` con `handoff_reason` derivado de `razon_apagado`
  2. Notificar Telegram al agente con el resumen
- FALSE branch → enviar respuesta normal del bot al lead

### 4. Mapping de razon_apagado → handoff_reason

```javascript
const handoffReasonMap = {
  lead_frustrado: 'bot_stuck',
  pide_humano: 'manual',
  spam: null,           // no genera handoff, solo apaga
  ofensivo: null,       // ídem
  off_topic: null,      // ídem
};

const handoff_reason = handoffReasonMap[razon_apagado];
```

`spam`, `ofensivo`, `off_topic` apagan el bot pero NO disparan handoff (no merece atención del agente). El bot queda silenciado y el agente puede archivar la conversación o ignorarla.

`lead_frustrado` y `pide_humano` SÍ disparan handoff (lead caliente que merece humano).

### 5. Notificación Telegram (canal secundario)

```typescript
// HTTP node a Telegram Bot API
{
  "method": "POST",
  "url": "https://api.telegram.org/bot{{ $env.TELEGRAM_BOT_TOKEN }}/sendMessage",
  "body": {
    "chat_id": "{{ $env.TELEGRAM_AGENT_CHAT_ID }}",
    "text": "🚨 *Bot apagado* — {{ razon_apagado }}\n\n*Lead:* {{ lead_name }} ({{ lead_phone }})\n*Resumen:* {{ resumen_para_agente }}\n\n[Ver conversación]({{ crm_url }}/inbox?conv={{ conversation_id }})",
    "parse_mode": "Markdown"
  }
}
```

Notar: esta notificación es SECUNDARIA. El sistema de handoff multi-canal del CRM (ver `bot-handoff-system-end-to-end`) es el primario. Telegram es backup para cuando el agente no está mirando el CRM.

### 6. Prompt del Detector (en el `attributes` description)

El secret está en la descripción de `should_apagar_bot`. Hacerla específica con ejemplos:

```
Description: "True si el lead expresó frustración explícita, pidió hablar con humano, mandó spam/broma, fue ofensivo, o repitió 3+ veces la misma queja sin avance.

EJEMPLOS true:
- 'ya me cansaste' / 'estás repitiendo' / 'no me sirve esto'
- 'quiero hablar con una persona' / 'pasame con un humano'
- 'asdasd asdasd' / 'test test test' (claramente broma/spam)
- 'sos un idiota' / insultos
- Lead dijo 3 veces lo mismo en mensajes consecutivos

EJEMPLOS false (NO apagar):
- 'no me convence ese precio' (es objeción normal, dejar que el bot maneje)
- 'estoy ocupado, te respondo después' (lead activo, no frustrado)
- 'no tengo presupuesto definido' (info-only normal)
- 'me podés repetir eso?' (lead pidiendo aclaración, no quejándose)

False es el DEFAULT. Solo true cuando la señal es clara y fuerte."
```

### 7. Resetear el contador de loop (regla manual)

Cuando el lead manda un mensaje "fresco" (cambio de tema, retorna después de días, pide algo nuevo), no debe contar el "loop pasado". Solución: usar solo los últimos 5 turnos como context del Detector, no la historia entera. Si la historia es vieja (>24h), reset implícito porque los turnos relevantes ya no están en el window.

## Output esperado

1. Nodo "Detector de Descalificacion" (Information Extractor) en el workflow después del Agente Principal
2. Nodo IF "Apagar bot?" que branches por `should_apagar_bot`
3. UPDATE de `conversations.handler='human'` + handoff_status cuando aplica
4. Notificación Telegram al agente con resumen
5. Test: lead manda "ya me cansaste" → bot se apaga + CRM alerta + Telegram avisa

## Ejemplo concreto (Casa CRM, en producción)

- Nodo "Detector de Descalificacion" en workflow Sofia v5+: usa gpt-4.1-mini, evalúa cada turno
- Nodo IF "Apagar bot?": condición sobre `should_apagar_bot`
- Nodo "Apagar Chatbot — Conversation" (postgres UPDATE) — ahora también dispara `request-handoff` cuando razón es `bot_stuck` o `manual`
- Nodo "Notificar Agente (Telegram)" — manda el resumen al chat del agente
- Razones soportadas en v1: `lead_frustrado → bot_stuck`, `pide_humano → manual`, `spam/ofensivo/off_topic → solo apaga sin handoff`

## Gotchas / antipattern

- **NO** usar el modelo principal (gpt-4o, gpt-4.1) para el Detector. Es caro. gpt-4.1-mini o equivalente alcanza para clasificación binaria + extracción simple.
- **NO** disparar handoff en TODO apagado de bot. Spam no merece atención humana. Diferenciar `razon_apagado`.
- **NO** dejar el Detector evaluando la conversación entera. 5 turnos recientes alcanzan. La historia entera = costo + ruido.
- **NO** auto-reactivar el bot. Una vez apagado por descalificación/loop, requiere toggle manual del agente. Auto-reactivar a las X horas es receta de re-frustración.
- **NO** confiar 100% en el Detector. Es un LLM, puede equivocarse. El agente humano siempre puede prender el bot otra vez si fue falso positivo.
- **NO** mostrar al lead que "el bot se está apagando". Silenciar. El próximo mensaje (cuando lo manda) lo recibe el agente humano, no el bot. El lead no necesita saber del switch.

## Skills relacionadas

- `bot-handoff-system-end-to-end` — el sistema que recibe los handoffs con razón `bot_stuck`
- `sales-framework-spsp-whatsapp` — el sistema que el Detector está protegiendo (cuando falla, el detector entra)
- `n8n-langchain-agent-postgres-memory` — el context del Detector viene de aquí
- `n8n-properties-search-tool-pattern` — independiente pero ambos son sub-nodos del Agent
