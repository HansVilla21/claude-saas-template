# Casa CRM — Roadmap de ideas futuras

Este documento captura ideas que NO están en el MVP pero que tienen tracción
estratégica. Cada idea incluye análisis honesto (pros + contras), arquitectura
propuesta, scope MVP, y estimación.

---

## V2 — Asistente WhatsApp para agentes

**Concepto.** El agente inmobiliario tiene un número de WhatsApp del bot
asistente (separado del bot que atiende a leads). Le manda audio o texto
tipo: *"Agendame visita con Carlos Vargas para mañana 3pm en CR-2031"*. El
sistema transcribe, entiende intención, ejecuta la acción contra Supabase, y
le responde al agente con la confirmación.

### Por qué la idea tiene tracción

1. **Diferenciador real, no commodity.** KW/Salesforce/PropertyBase no hacen
   esto. Sólo tiene sentido si tu CRM ya vive en WhatsApp como el nuestro.
   Los agentes ticos viven en WhatsApp 8h/día — si pueden manejar el CRM
   sin abrir la app web, el switching cost para irse a otro CRM se vuelve
   alto.

2. **La infra ya está casi entera.** Reusamos:
   - YCloud para entrada de mensajes
   - OpenAI Whisper para transcribir audio
   - OpenAI/Claude con structured output (mismo patrón de `extract-lead-info`)
     para entender intención + extraer entidades
   - Supabase service-role para escribir
   - Tablas + RLS ya armadas
   
   Estimo ~80% reuso. 3-5 días para V1 acotado.

3. **Loop de retención.** Una app que vive en WhatsApp tiene 5-10x más
   sesiones por día que una que vive en pestaña del navegador. Cada vez
   que el agente le manda al bot, está usando el producto. Baja el churn
   de forma medible.

### Por qué NO ahora

1. **No bloquea las primeras 5 ventas.** Para vender 5 cuentas necesitamos:
   Inbox, embudo, calificación auto, agenda. Eso ya casi está. El
   asistente WhatsApp es V2 — se vende en demo como compromiso futuro
   ("dentro de 2-3 meses agregamos esto") y la gente lo compra como
   feature pendiente.

2. **Riesgo de mal interpretación es alto.** Audio → Whisper → LLM →
   acción. Si el bot agenda mal una visita o crea una tarea con datos
   errados, la confianza del agente se rompe en una sola pifia. Mitigación
   obligatoria: **etapa de "confirmá antes de ejecutar"** para acciones
   críticas — el bot manda *"¿Confirmás: agendar visita con Carlos
   Vargas, mañana 21 de mayo 3pm, propiedad CR-2031?"* y espera "sí".
   Eso suma diseño UX no trivial.

3. **Scope creep tentador.** *"También que me dé el reporte del mes"* →
   *"También que me cree el contrato"* → *"También que llame al cliente
   por mí"*. Cada acción adicional es código + edge cases + prompt
   engineering. Hay que **acotar a 3 acciones MVP**: agendar visita,
   crear tarea, mandar mensaje pre-escrito a un lead. Nada más.

### Arquitectura propuesta

```
Agente envía audio/texto a WhatsApp del bot
  ↓
YCloud webhook → Edge Function `agent-assistant`
  ↓
1. Auth: lookup agency_members por phone_e164 del sender
   (si no matchea ningún agente, responder "no estás autorizado")
  ↓
2. Si audio: Whisper → transcripción
  ↓
3. LLM con structured output:
   {
     intent: "schedule_visit" | "create_task" | "send_message_to_lead" | "unknown",
     entities: {
       lead_search: "carlos vargas",
       property_code: "CR-2031",
       datetime: "2026-05-21T15:00:00-06:00",
       task_kind: "call" | "followup" | ...,
       message_text: "...",
     },
     confidence: 0..1,
     missing: ["lead_id", "starts_at", ...]
   }
  ↓
4. Resolver entidades:
   - lead_search → fuzzy match contra leads de la agencia (RPC con pg_trgm)
   - property_code → SELECT properties.id WHERE code = X
   - Si missing.length > 0: pedir aclaración al agente
  ↓
5. Si confidence < 0.85 O acción crítica: PEDIR CONFIRMACIÓN
   "¿Confirmás: [acción descrita en lenguaje natural]?"
   Esperar 60s. "sí"/"dale"/"confirmo" → ejecuta. Otra cosa → cancela.
  ↓
6. Ejecutar acción vía service-role:
   - schedule_visit → INSERT events (kind='visit', lead_id, property_id, ...)
   - create_task → INSERT tasks (kind, lead_id, due_at, ...)
   - send_message_to_lead → INSERT messages + dispara YCloud send
  ↓
7. Confirmar al agente: "Listo, visita agendada con Carlos para mañana 3pm.
    Te lo recuerdo 1h antes."
```

### Tablas/columnas nuevas

```sql
-- Bot assistant config per agency
ALTER TABLE agencies ADD COLUMN agent_assistant_phone text;
ALTER TABLE agencies ADD COLUMN agent_assistant_enabled boolean DEFAULT false;

-- Vincular phone del agente para auth
-- (agency_members ya puede llevar phone, o link a auth.users.phone)
ALTER TABLE agency_members ADD COLUMN phone_e164 text;

-- Log de conversaciones agente↔bot, para auditoría y debug
CREATE TABLE agent_assistant_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id),
  user_id uuid NOT NULL,
  message_in text,
  intent text,
  entities jsonb,
  action_taken text,
  result jsonb,
  confidence numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### Scope MVP V1 — solo estas 3 acciones

1. **schedule_visit**: agendar visita con lead + propiedad + hora
2. **create_task**: crear tarea con título + fecha + lead opcional
3. **send_message_to_lead**: mandar texto a un lead específico

V2 (después): mover status lead, completar tarea, ver agenda del día,
buscar propiedades.

### Riesgos a mitigar antes de lanzar

- ❗ **Auth débil.** El phone del agente lo determina la identidad. Si
  alguien le roba el WhatsApp al agente, tiene acceso al CRM. Mitigación:
  PIN de 4 dígitos opcional para acciones críticas + log de auditoría +
  notificación push a la web si se ejecuta acción desde WhatsApp.

- ❗ **Confirmación obligatoria** para acciones que tocan datos compartidos
  (visitas con leads, mensajes outbound a leads). Crear tarea es low-risk
  (la podés borrar fácil).

- ❗ **Resolución de leads ambigua.** "Carlos" → puede haber 3. El bot
  debe pedir aclaración con número o apellido, no asumir.

- ❗ **Costo OpenAI.** Whisper + GPT-4o-mini. ~$0.001 por audio + $0.001
  por extracción = $0.002 por interacción. 50 interacciones/día/agente =
  $0.10/día = $3/mes/agente. Absorbible.

### Estimación

- Edge Function `agent-assistant` con auth + whisper + intent + 3 acciones:
  2-3 días
- UI en Settings para configurar (phone, enable/disable, PIN opcional):
  0.5 día
- Log de auditoría + dashboard mini de últimas acciones: 1 día
- Testing end-to-end + ajuste de prompts: 1 día

**Total: ~5 días de trabajo bien acotado.**

### Cuándo arrancarlo

Cuando tengas **3-5 clientes pagando** y al menos uno te haya pedido
"poder hacer cosas desde WhatsApp directo". Hasta ese momento es feature
de demo, no de implementación.

---

## Más ideas para capturar más adelante

Lugar para sumar otras ideas sin perderlas.
