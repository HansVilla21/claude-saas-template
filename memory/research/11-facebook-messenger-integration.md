# Research: Agregar Facebook Messenger a Casa CRM

**Fecha:** 2026-05-21
**Propósito:** Investigación grounded sobre cómo integrar Facebook Messenger al sistema existente (YCloud WhatsApp + Supabase + N8N + CRM React).
**Trigger:** Founder identificó que muchos agentes inmobiliarios LATAM usan Messenger heavily, no solo WhatsApp.

---

## TL;DR

1. **YCloud NO soporta Messenger.** WhatsApp-only.
2. **Messenger directo con Meta es GRATIS** (sin costo per-message dentro de ventana 24h).
3. **Recomendación:** mantener YCloud para WhatsApp + integrar Meta Messenger Platform direct. Híbrido, dos handlers, una DB unificada.

---

## Confirmaciones de la investigación

### ¿YCloud soporta Messenger? — NO
- Foco exclusivo en WhatsApp + algo SMS
- Programa early-access con Meta para WhatsApp
- Sin roadmap público hacia Messenger

### Costos Messenger via Meta directo
- $0 dentro de ventana 24h
- Después de 24h: solo Message Tags aprobados (varios deprecándose 27-abr-2026: CONFIRMED_EVENT_UPDATE, ACCOUNT_UPDATE, POST_PURCHASE_UPDATE)
- Marketing Messages API (beta) para marketing post-24h — costo similar a WhatsApp templates cuando salga GA

### Costos vía BSPs multi-canal (alternativa)
- **respond.io:** $99-$349/mes (MAC-based — cuenta cada contacto activo) + WA fees + Messenger fees por separado
- **Twilio:** $0.005 flat per msg (in+out) + Meta charges. Excelente API.
- **Bird (ex MessageBird):** $0.005 markup. Rebrand reciente con deterioro reportado de soporte.
- **WATI:** $49-99/mes + 20% markup. WhatsApp-first, Messenger es secundario.
- **ManyChat / SendPulse:** free tier + $15-30/mes. Bueno para creators, no SaaS B2B.

---

## Tres opciones arquitectónicas evaluadas

| Opción | Costo Messenger | Lock-in | Esfuerzo dev | Recomendada para Casa CRM |
|---|---|---|---|---|
| **A. YCloud (WA) + Meta Messenger direct** | $0 | Bajo | Medio | ✅ SÍ |
| **B. Migrar todo a BSP multi-canal** | $99-$349/mes base + per-msg | Alto | Alto (rip-and-replace) | Solo si sumamos 3+ canales |
| **C. YCloud + capa de unificación** | $0 + capa cara | Medio | Muy alto | ❌ peor de ambos mundos |

---

## Detalles operativos: Meta Messenger Platform direct

### Lo que ofrece
- Send API (texto, imagen, audio, video, archivos, location, quick replies, botones)
- Webhook a endpoint propio cuando lead manda mensaje a Page
- Mensajería entrante completa
- n8n: Facebook Trigger node + workflow template oficial para Page tokens + webhook fields subscription

### Lo que duele
- **App Review obligatorio** para `pages_messaging` y `pages_messaging_subscriptions`
  - ~5-10 días hábiles
  - Requiere screencast del flujo
  - Política de privacidad publicada
  - Prueba de uso legítimo
- **24-hour rule más estricta que WhatsApp**
- **Cada Page del agente se conecta individualmente** (cada agente inmobiliario tiene SU Page Facebook)
- Onboarding de agency en el CRM = OAuth flow para conectar Page + persistir `page_id` + `page_access_token`

### Comparación 24h rule
- WhatsApp: ventana 24h, post-ventana requiere template aprobado
- Messenger: ventana 24h, post-ventana requiere Message Tag aprobado O Marketing Messages API (en beta limitado)

---

## Plan técnico (si y cuando se decida implementar)

### 1. DB changes
```sql
create type message_channel as enum ('whatsapp', 'messenger', 'instagram');
alter table messages add column channel message_channel not null default 'whatsapp';
alter table conversations add column channel message_channel not null default 'whatsapp';
-- Considerar UNIQUE (agency_id, lead_id, channel) en conversations si querés
-- 1 lead = N conversaciones (una por canal)
```

### 2. Nueva edge function: `messenger-webhook`
- Espejo de `ycloud-webhook` pero parseando payload de Meta Messenger Platform
- Webhook verification token (Meta way) en lugar de HMAC YCloud
- Mismo destino: `messages` table con `channel='messenger'`
- Reusable: `mapMessageKind`, `extractContent` con minor adjustments (Meta payload tiene shape distinta)

### 3. N8N workflow
- Opción 1: workflow nuevo para Messenger
- Opción 2: extender el de WhatsApp con switch por channel al inicio
- Sofia (LLM agent) y la lógica de negocio se reusan
- HTTP node final cambia: en lugar de YCloud POST, Meta Send API POST

### 4. CRM UI
- Badge de canal en cada conversation (icono WhatsApp / Messenger / Instagram)
- Filtro por channel en `conv-list` (extender skill `crm-inbox-conv-list-filters-strip`)
- Render correcto: Messenger soporta quick replies + botones que WhatsApp no tiene igual

### 5. Agency onboarding flow
- UI: "Conectar Facebook Page" en settings del agency
- OAuth flow: agency_id ↔ page_id ↔ page_access_token (long-lived 60d, renovar)
- Configurar webhook subscription via Graph API después del OAuth
- Multi-tenancy: cada page_id mapea a un agency_id

**Esfuerzo estimado:** 2-3 sesiones intensas
- Sesión 1: Meta App + edge function `messenger-webhook` + DB migration
- Sesión 2: N8N workflow (o extensión) + Send API integration
- Sesión 3: UI de onboarding + testing end-to-end + multi-canal badges

---

## Skills futuras a capturar cuando implementemos

- `meta-messenger-platform-integration` — patrón completo Meta App + Page connect + webhook
- `multi-channel-message-routing` — cómo el bot decide responder via WhatsApp vs Messenger según channel del mensaje entrante
- `meta-app-review-checklist` — preparación del App Review para `pages_messaging`
- `crm-channel-badge-render` — UI multi-canal en inbox

(Cuando se haga la implementación, capturar bajo la directriz permanente del proyecto — ver `CLAUDE.md` "Capturar todo proceso como skill")

---

## Fuentes consultadas

- [YCloud platform](https://www.ycloud.com/) — confirma WhatsApp-only
- [Meta Messenger Send API](https://developers.facebook.com/docs/messenger-platform/reference/send-api/)
- [Meta Messenger Webhooks](https://developers.facebook.com/docs/messenger-platform/webhooks)
- [Meta Messenger App Review](https://developers.facebook.com/docs/messenger-platform/app-review/)
- [Meta Messenger Changelog 2026](https://developers.facebook.com/docs/messenger-platform/changelog/) — para tracker de deprecations
- [n8n Facebook Trigger docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.facebooktrigger/)
- [n8n workflow template: long-lived Page tokens + Messenger webhook setup](https://n8n.io/workflows/14027-get-long-lived-facebook-page-access-tokens-and-subscribe-messenger-webhook-fields-via-graph-api/)
- [respond.io pricing 2026](https://respond.io/pricing)
- [Twilio Facebook Messenger channel](https://www.twilio.com/en-us/messaging/channels/facebook-messenger)
- [Bird Messenger API pricing](https://bird.com/en-us/pricing/messenger)
- [Vonage Messages API pricing](https://www.vonage.com/communications-apis/messages/pricing/)

---

## Decisión pendiente del founder

**¿Cuándo arrancamos?**
- Implementación end-to-end: 2-3 sesiones
- Requiere: aplicar a App Review de Meta primero (5-10 días hábiles antes de poder usar en prod)
- Sugerencia: arrancar el App Review **YA** (es asíncrono, no bloquea otras tareas) y mientras tanto seguir mejorando lo de WhatsApp
