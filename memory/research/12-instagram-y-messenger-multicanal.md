# Research: Agregar Messenger + Instagram a Casa CRM (estrategia multicanal completa)

**Fecha:** 2026-05-27
**Propósito:** Definir cómo agregar Facebook Messenger e Instagram Direct al sistema actual (YCloud WhatsApp + Supabase + N8N + CRM React), sin perder lo construido y sin migrar a una plataforma todo-en-uno que tenga lock-in alto.
**Trigger:** Founder preguntó si conviene usar una plataforma tipo ManyChat (que agrupa los 3 canales) o integrar directo. También quiere saber si Instagram se conecta igual que Messenger.
**Extiende a:** `11-facebook-messenger-integration.md` (no lo reemplaza — lo complementa).

---

## TL;DR

1. **Instagram Messaging API NO es la misma que Messenger.** En 2026 Meta separó endpoints y tokens. Cada canal es su propia integración (aunque la mecánica es muy parecida).
2. **Recomendación firme: NO migrar a ManyChat ni a un BSP multi-canal todo-en-uno.** No encajan con un SaaS B2B multi-tenant como Casa CRM.
3. **Camino correcto: YCloud (WhatsApp) + Meta Messenger direct + Meta Instagram direct.** Tres integraciones, una sola DB unificada, mismo bot Sofia atendiendo los 3 canales.
4. **Costo extra:** $0 por mensaje en los 3 canales dentro de ventana 24h. Solo se paga YCloud por WhatsApp (que ya está) y eventual marketing post-24h (que no es prioridad MVP).

---

## Pregunta del founder, respondida directo

> "ManyChat conecta los tres. ¿Aquí cómo hacemos?"

**ManyChat sirve para creadores que manejan UN solo negocio en sus propias páginas.** Su producto es el flow builder visual + UI hosted. Su API es limitada y NO está pensada para que tú revendas como SaaS B2B donde cada uno de tus 50-500 agentes inmobiliarios tenga sus propias Pages/IG conectadas vía OAuth. Lo mismo aplica a SendPulse, Chatfox y similares.

**Para Casa CRM lo que necesitamos NO es una herramienta de chatbots — es la capa API de Meta + nuestra propia orquestación.** Eso ya lo tenemos armado para WhatsApp (vía YCloud). Hay que agregarle dos handlers más para los otros dos canales.

---

## Hallazgo clave: Instagram en 2026 ≠ Messenger

Antes (modelo viejo, deprecado): Instagram Messaging usaba **el mismo endpoint que Messenger** (`/me/messages`) y **Page Access Token**. Conectabas la cuenta IG a una Page y todo iba por la misma vía.

En 2026 (modelo nuevo, "Instagram API with Instagram Login"):

| Atributo | Messenger Platform | Instagram Messaging API (nuevo) |
|---|---|---|
| **Endpoint Send** | `graph.facebook.com/v.../me/messages` | `graph.instagram.com/<IG_ID>/messages` |
| **Token** | Page Access Token (long-lived 60d) | Instagram User Access Token (login propio de Instagram) |
| **Permisos** | `pages_messaging`, `pages_messaging_subscriptions` | `instagram_business_basic`, `instagram_business_manage_messages` |
| **Tipo de cuenta del agente** | Facebook Page (cualquiera) | Instagram Professional (Business o Creator) |
| **Webhook fields** | `messages`, `messaging_postbacks`, `message_deliveries` | `messages`, `messaging_optins`, `messaging_postbacks`, `messaging_reactions`, `messaging_referrals`, `messaging_seen` |
| **Ventana 24h** | Sí | Sí |
| **Costo dentro de ventana 24h** | $0 | $0 |
| **App Review** | `pages_messaging` requiere review (Standard Access OK para dev) | Igual — requiere review para Advanced Access en prod |

**Implicación operativa:** son **2 integraciones separadas**, no una. Pero la mecánica es paralela:
- Webhook entrante → edge function parseadora → `messages` table con `channel='instagram'`
- Bot procesa → respuesta → HTTP POST al Send API correspondiente
- Mismo bot Sofia, misma DB, mismo CRM. Lo único distinto: el handler de webhook + el endpoint Send + el token usado.

---

## Comparativa real de BSPs multi-canal (por si vale la pena migrar todo)

| BSP | WA | Messenger | IG | API potente | Multi-tenant SaaS-friendly | Lock-in | Costo base |
|---|---|---|---|---|---|---|---|
| **Twilio Conversations** | ✅ | ✅ | ⚠️ (no claramente documentado para IG Direct) | Excelente | Sí — sub-accounts | Bajo | $0.05/MAC + per-msg |
| **Bird (ex-MessageBird)** | ✅ | ✅ | ✅ | Bueno | Medio | Medio | $45+/mes + per-msg |
| **respond.io** | ✅ | ✅ | ✅ | Mediocre (es más UI que API) | Pobre — diseñado para vender al usuario final, no para que vos lo revendas | Alto | $99-$349/mes (MAC-based) |
| **Infobip / Sinch** | ✅ | ✅ | ✅ | Excelente | Sí (enterprise) | Bajo | Per-msg, cotizado |
| **ManyChat / SendPulse** | ✅ | ✅ | ✅ | Pobre / UI-first | NO — para creadores, no SaaS B2B | Alto | $15-30/mes por workspace |

**Conclusión:** ninguno te da algo que no puedas hacer directo con Meta + YCloud, y todos meten una capa extra de costos y lock-in. Solo justificaría migrar si tuvieras +1000 agentes Y quisieras delegar la operativa de tokens/webhooks (que NO es algo que hoy te haga sufrir).

---

## La opción ganadora: 3 integraciones direct, 1 DB, 1 bot

```
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│ YCloud webhook  │   │ Messenger webh. │   │ Instagram webh. │
│ (ya existe)     │   │ (a construir)   │   │ (a construir)   │
└────────┬────────┘   └────────┬────────┘   └────────┬────────┘
         │                     │                     │
         └─────────────────────┼─────────────────────┘
                               ▼
                  ┌──────────────────────────┐
                  │  Supabase `messages`     │
                  │  (channel discriminator) │
                  └────────────┬─────────────┘
                               ▼
                  ┌──────────────────────────┐
                  │  N8N — Bot Sofia         │
                  │  (mismo para los 3)      │
                  └────────────┬─────────────┘
                               ▼
        ┌──────────────┬──────────────┬──────────────┐
        │  YCloud Send │ Messenger    │ Instagram    │
        │  (WhatsApp)  │ Send API     │ Send API     │
        └──────────────┴──────────────┴──────────────┘
```

**Importante:** el schema en `chatbot-db-schema-supabase` (skill que armamos hoy) **ya está preparado** para esto. El enum `message_channel` incluye `whatsapp, messenger, instagram, web, sms, email, voice, manual`. Agregar Messenger e IG = **insertar rows en `agency_channels`, no migración de schema**.

---

## Plan técnico actualizado (los 3 canales)

### Lo que ya está
- WhatsApp via YCloud: webhook + edge function + DB + N8N + Send back. ✅

### Lo que se agrega para Messenger
- Meta App + permisos `pages_messaging` (App Review 5-10 días)
- Edge function `messenger-webhook` (parser Meta + verification token)
- N8N branch (o workflow paralelo) que envía via `graph.facebook.com/.../me/messages`
- OAuth flow en CRM para que cada agente conecte SU Page
- Persistir `page_id` ↔ `agency_id` ↔ `page_access_token` (renovar 60d)

### Lo que se agrega para Instagram (separado de Messenger)
- Permisos: `instagram_business_basic` + `instagram_business_manage_messages` (App Review)
- Edge function `instagram-webhook` (parser Meta IG + verification token)
- N8N envío via `graph.instagram.com/<IG_ID>/messages`
- OAuth flow distinto en CRM (Instagram Login, no Facebook Login)
- Persistir `ig_user_id` ↔ `agency_id` ↔ `ig_access_token`
- Cada agente DEBE tener Instagram Professional (Business o Creator) — comunicar como requisito de onboarding

### Esfuerzo estimado (los 3)
- **Si se hacen juntos (recomendado):** 3-4 sesiones intensas (mucho código reusable entre Messenger e IG)
- **Si se hacen separados:** Messenger primero (2-3 sesiones) → IG después (2 sesiones aprovechando lo del primero)

---

## Decisiones que tomamos hoy

1. **NO** vamos a ManyChat / respond.io / BSP multi-canal. Quedaría peor producto, más lock-in, más costo por agente, sin ganancia real.
2. **Mantenemos YCloud para WhatsApp** (funciona perfecto, $0.005/msg, multi-tenant clean).
3. **Messenger e Instagram van direct con Meta**, pero como **dos integraciones separadas** (ya no comparten endpoint como antes).
4. **El bot Sofia, el CRM, la DB y N8N se reusan al 100%** — solo cambian los handlers de I/O por canal.
5. **App Review de Meta arrancarlo YA** (asíncrono, 5-10 días hábiles). Se puede aplicar a `pages_messaging` Y `instagram_business_manage_messages` en la misma App, mismo screencast.

---

## Próximo paso concreto (a decisión del founder)

Tres caminos posibles, en orden de menor a mayor riesgo de tiempo:

**A. Solo arrancar el App Review ya** (1 hora hoy)
- Crear/preparar Meta App + privacy policy + screencast
- Aplicar a los permisos de los 2 canales en simultáneo
- Mientras tanto seguimos con lo de WhatsApp (test E2E v5.5, commit, etc.)
- En 5-10 días tenemos approval → implementamos cuando se quiera

**B. Implementar Messenger primero, IG después** (4-5 sesiones spread)
- Aprovechamos para validar la arquitectura multi-canal con 1 canal nuevo
- IG queda como "ya sabemos cómo, solo replicamos"

**C. Implementar los 3 canales juntos en sprint** (3-4 sesiones intensivas)
- Más eficiente en tiempo total, pero requiere bloque dedicado
- Solo recomendado si el founder ya tiene 5+ agentes pidiendo Messenger/IG

Por defecto, **camino A** parece el más sano: bloquea poco, mantiene el progreso de WhatsApp, y libera la decisión de fondo para cuando haya demanda real desde los agentes.

---

## Skills futuras (cuando implementemos)

- `meta-messenger-platform-integration` — Page connect + webhook + Send API
- `meta-instagram-direct-integration` — IG Login OAuth + webhook + Send API (separada de Messenger)
- `multi-channel-message-routing` — cómo el bot decide canal de respuesta
- `meta-app-review-checklist` — preparación del App Review con screencast
- `crm-channel-badge-render` — UI multi-canal en inbox

(Capturar bajo la directriz permanente — `CLAUDE.md` "Capturar todo proceso como skill")

---

## Fuentes consultadas

- [Meta Instagram Messaging API (Instagram Login)](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/) — endpoints, permisos, token type, webhook fields
- [Meta Instagram Messaging (legacy, Page token)](https://developers.facebook.com/docs/instagram-messaging/)
- [Meta Messenger + IG policy](https://developers.facebook.com/documentation/business-messaging/messenger-platform/policy)
- [Instagram API pricing 2026 overview (Phyllo)](https://www.getphyllo.com/post/instagram-api-pricing-explained-iv) — free tier, rate limits
- [Twilio Conversations API pricing](https://www.twilio.com/en-us/messaging/pricing/conversations-api) — MAC-based $0.05
- [Respond.io vs Twilio vs Bird comparison](https://respond.io/blog/twilio-vs-messagebird-vs-respondio)
- [Bird Instagram pricing](https://bird.com/en-us/pricing/instagram) — ~$0.005/DM markup
- [WhatsApp BSP comparison 2026](https://respond.io/blog/best-whatsapp-business-solution-provider)
- [Instagram rate limits explained](https://creatorflow.so/blog/instagram-api-rate-limits-explained/) — 200 DM/hora cap práctico
