# Roadmap Completo — Momentum AI CRM

**Fecha:** 2026-06-01
**Propósito:** Mapeo exhaustivo de qué falta, agrupado por pilares y priorizado.
**Audiencia:** founder + agentes que retomen el proyecto en sesiones futuras.

---

## Snapshot del estado actual

### Cosas que YA están construidas y funcionando

- **34 tablas** en Supabase v2 (`fahujscodhqlopycorzn`).
- **Bot v6 — arquitectura C live** en N8N (84 nodos, Sofia C + extractor determinista + cascada de switches/HTTPs).
- **Edge function `bot-actions` v0.4.1** con 9 operations + advisory lock + idempotency.
- **CRM frontend Next.js** funcionando localhost:3000 con: inbox completo, panel detalle del lead, contactos (lista + kanban + ficha completa), Panel Admin (master-only), Configuración cliente-facing parcial.
- **Multi-tenant** con RLS por agency_id.
- **51 items del MVP marcados como hechos** (de un total ~104).

### Cosas que NO están construidas

- **Deploy a producción** (URL pública).
- **Sistema de roles granular** (community manager, owner, admin).
- **Onboarding self-service** del cliente.
- **Billing / monetización** (cobrar a clientes).
- **Notificación handoff push/WhatsApp** al user del CRM.
- **Historial de notas UI** (la tabla `lead_notes` existe, falta UI).
- **Composer multimedia** (imágenes, videos, audios).
- **Templates / machotes** en composer.
- **Settings Pass 2** — UI cliente-facing completa.
- **F7 Wake-up automático** del bot al inicio del horario hábil.
- **Módulo Propiedades** (para clientes inmobiliarios; Robert es fisio, no urgente).
- **Dashboard global de insights** (agregado).
- ~50 items menores del backlog.

---

## Mapa de pilares

El proyecto se puede ver como 5 pilares ortogonales. Cada uno crece independiente pero algunos dependen de otros.

```
P0 — Cierre MVP para Robert       ← URGENTE (esta semana)
  ↓
P1 — Multi-cliente operativo       ← Cuando haya 2-3 clientes
  ↓
P2 — SaaS Self-Service             ← Cuando quieras escalar a N
  ↓
P3 — Bot avanzado                  ← Cuando Robert dé feedback
  ↓
P4 — Optimización + Polish         ← Continuo, no bloquea nada
```

---

## P0 — Cierre MVP para Robert (URGENTE — esta semana)

Lo mínimo para que Robert opere el sistema sin tu intervención diaria.

### P0.1 — Deploy del frontend a Vercel (CRÍTICO)

| Item | Estado | Esfuerzo | Notas |
|---|---|---|---|
| Vercel project creado + conectado al repo `momentum-ai-crm` | Pendiente | 30 min | Necesita Vercel CLI o dashboard manual |
| Env vars de producción seteadas | Pendiente | 30 min | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AI_API_KEY`, etc. |
| Custom domain (`crm.momentum.ai` o similar) | Pendiente | 1h | DNS + SSL automático Vercel |
| Build pasa en CI sin warnings | Probable OK | 30 min verificar | Next.js 16 + React 19, tipos OK |
| Tests manuales post-deploy | — | 1h | Login, ver inbox, mandar mensaje, ver handoff |

**Bloqueador:** sin esto Robert no puede usar el sistema. **Total: 2-3h.**

### P0.2 — Bot configurado para Robert (su negocio)

| Item | Estado | Esfuerzo |
|---|---|---|
| Crear `agencies` row para Robert (negocio fisio Costa Rica) | Probable existe (lo usamos en tests) | Verificar 15 min |
| `agencies.bot_config` completo: nombre, tono, servicios, precios, horarios, link agenda | Parcial | 1-2h con Robert |
| Pipeline stages reales del negocio fisio | Probable parcial | 30 min |
| Tags permitidos del negocio | Probable parcial | 30 min |
| Webhook de YCloud apuntando al workflow C | OK | — |

**Total: 2-3h** (necesita reunión con Robert o info recibida por mensaje).

### P0.3 — Onboarding de Robert (crear su user)

| Item | Estado | Esfuerzo |
|---|---|---|
| `users` row para Robert + asignar a su agency vía `agency_memberships` | Pendiente | 15 min SQL |
| Email + password initial | Pendiente | 15 min (auth Supabase) |
| URL final + credenciales mandadas a Robert | Pendiente | 5 min |

**Total: 30 min.**

### P0.4 — Notificación handoff (CRÍTICO para Robert)

Cuando el bot dispara handoff, Robert tiene que enterarse aunque no esté con el CRM abierto.

| Item | Estado | Esfuerzo |
|---|---|---|
| **Opción A: WhatsApp directo** al user via YCloud (a su número personal de WhatsApp). Lo mencionaste como "futuro". | Pendiente | 4-6h |
| **Opción B: Email** desde Supabase Edge | Pendiente | 2-3h |
| **Opción C: Push notification** (Web Push API) | Pendiente | 6-8h |
| **Opción D: Sound notification** dentro del browser + título dinámico | Pendiente | 1h |

**Mi recomendación:** Opción A (WhatsApp). Es lo que el founder vendió a Robert. Robert ya tiene WhatsApp abierto todo el día.

### P0.5 — Cosas del inbox que rompen UX

| Item | Estado | Por qué bloquea |
|---|---|---|
| Composer multimedia (imágenes, videos) | Pendiente | Fisio manda fotos de tratamientos, lesiones |
| Templates rápidos (mensajes predefinidos) | Pendiente | Robert va a contestar lo mismo 100 veces; sin templates pierde tiempo |
| Historial de notas UI (tabla existe, falta vista) | Pendiente | Robert necesita anotar cosas del paciente |
| Auto-asignación con buen UX | Funciona | OK |
| AI key del composer (sugerir respuesta) | Funcional pero necesita `AI_API_KEY` | Vos pegás la key |

**Esfuerzo total P0.5: 8-12h.**

### P0.6 — Detalles UX menores (post-test de Robert)

Cosas chicas que pueden esperar:
- Menú "tres puntitos" no conectado a nada (decidir o quitar).
- "Marcar como no leído" (Pietro dudaba si hace falta).
- Edición inline de etiquetas en tabla.
- Scroll horizontal de filtros pulido.
- Badge de etapa en modo compact.

**Esfuerzo: 4-6h.** No bloquea entrega.

### Total P0 (mínimo para entregar a Robert): 15-20h dev (~2-3 días de trabajo)

---

## P1 — Multi-cliente operativo (2-3 clientes manuales)

Cuando Robert ande bien y quieras meter Cliente 2 y Cliente 3, **sin self-service todavía**.

### P1.1 — Sistema de Roles real

Hoy todo miembro de una agency ve TODO. Necesitamos granularidad para tener "agentes" con vista restringida.

| Item | Estado | Esfuerzo |
|---|---|---|
| Enum `agency_role` (owner/admin/agent/viewer) existe en migración 0006 | OK | — |
| RLS `is_member_of` existe | OK | — |
| **UI para gestionar roles** (panel Settings → Equipo) | Pendiente | 4-6h |
| **Restricciones por rol** en queries: agent ve solo sus conversaciones, viewer read-only, etc. | Pendiente | 6-8h |
| Filtro "Todos" oculto para community manager | Pendiente | 1h |

**Total: 11-15h.**

### P1.2 — Onboarding manual del founder

Para que vos puedas crear clientes sin escribir SQL:

| Item | Estado | Esfuerzo |
|---|---|---|
| UI en Panel Admin para crear agency nueva | Pendiente | 3-4h |
| UI en Panel Admin para invitar usuarios (crea user + manda invite email) | Pendiente | 3-4h |
| Configurar `bot_config` por agency (ya existe en Panel Admin) | OK | — |
| Configurar pipeline_stages, tags por agency | Pendiente | 3-4h |
| Conectar webhook YCloud por agency (multi-número) | Pendiente | 4-6h |

**Total: 13-18h.**

### P1.3 — Backup off-site del workflow N8N

Mencionado en `n8n-workflow-versioning` skill como gap F8. Si Easypanel cae, perdés los workflows.

| Item | Esfuerzo |
|---|---|
| Edge function cron diario que hace pull del workflow vivo y lo guarda en Supabase Storage | 3-4h |

### Total P1: 27-37h dev (~4-5 días)

---

## P2 — SaaS Self-Service (10+ clientes sin tu intervención)

Cuando quieras escalar a una decena de clientes y dejar de "armar cada uno a mano".

### P2.1 — Signup público

| Item | Esfuerzo |
|---|---|
| Landing page con CTA "Empezar" | 4-6h (puede usar GSAP/motion) |
| Signup form (email + password + nombre del negocio) | 3-4h |
| Verification email | 1-2h |
| Onboarding wizard (4 pasos): negocio → bot config básico → integrar WhatsApp → invitar equipo | 8-12h |

### P2.2 — Configuración self-service completa

Lo que pediste como "Settings Pass 2":

| Item | Esfuerzo |
|---|---|
| UI cliente-facing: configurar bot_config, horarios, auto-acciones, umbrales SLA | 8-10h |
| UI para gestionar canales (números de WhatsApp, Messenger futuro) | 6-8h |
| UI para gestionar equipo + roles | 4-6h (depende de P1.1) |
| UI para gestionar tags + pipeline_stages | 4-6h |
| UI para gestionar `extractor_field_defs` (qué datos extrae el bot) | 4-6h |

### P2.3 — Integración self-service con WhatsApp/YCloud

| Item | Esfuerzo |
|---|---|
| Wizard "escanear QR de WhatsApp Business" → conecta a YCloud automáticamente | 12-16h (requiere YCloud Tech Partner — gap conocido) |
| Setup automático del webhook | 2-3h |
| Verificación que el bot recibe inbound | 1h |

### P2.4 — Billing / Monetización

Si va a ser SaaS hay que cobrar.

| Item | Esfuerzo |
|---|---|
| Decidir modelo: por seat / por agency / por volumen mensajes | Decisión, no dev |
| Integrar Stripe (o el provider que elijas) | 8-12h |
| Plan tiers + upgrade/downgrade | 4-6h |
| Trial gratuito de N días | 3-4h |
| Facturación + invoices | 4-6h |
| Cancel + retention flow | 3-4h |

### P2.5 — Soporte automatizado

Cuando 10+ clientes te escriben, no podés responder a mano.

| Item | Esfuerzo |
|---|---|
| Docs públicas (Notion, GitBook, o markdown en /docs) | 8-12h |
| Chat de soporte in-app (Intercom o similar, o el mismo Sofia con prompt distinto) | 8-12h |
| FAQ + troubleshooting guide | 4-6h |

### Total P2: 90-130h dev (~3-4 semanas)

---

## P3 — Bot Avanzado

Cuando Robert dé feedback de qué le falta al bot.

### P3.1 — F7: Wake-up automático

Cuando se acabe el `bot_paused_until` (lunes 8am), que el bot retome la conversación automáticamente en lugar de esperar al próximo mensaje del lead.

| Item | Esfuerzo |
|---|---|
| pg_cron job o edge function scheduled que ejecuta cada 5 min | 2-3h |
| Lógica: buscar conversaciones con `bot_paused_until <= now()` + último mensaje del lead sin respuesta | 2-3h |
| Disparar un "synthetic continuation" via webhook | 2-3h |

**Total: 6-9h.** Lo discutimos antes.

### P3.2 — F6.2: tokens + duration

Gaps actuales del audit log:
- `tokens_in/out: null` — el sub-input del LangChain Agent no es accesible. Fix: `returnIntermediateSteps: true` + cambio en Cerrar Trace, O capturar via HTTP directo al modelo.
- `duration_s: ~20-40s` alto. Optimizable con prompt caching efectivo + paralelización de HTTPs donde sea posible.

**Total: 6-10h.**

### P3.3 — A/B test formal cuando haya data real

Cuando Robert genere 50+ conversaciones reales, etiquetar las que salieron bien/mal y correr el eval-harness para ver objetivamente si C vs A.

**Esfuerzo: 4-6h** (incluye fix del bug de webhook registration que encontramos hoy).

### P3.4 — Tools nuevas del bot

A medida que Robert use el sistema:

- `book_appointment` — agendar cita directo (integración Calendly).
- `send_pdf` — mandar info de servicios como PDF.
- `request_payment` — crear link de pago.
- `propose_alternative` — si no hay slot, proponer otro.

**Esfuerzo:** 4-6h por tool nueva.

### P3.5 — Few-shots por vertical

Robert es fisio. Cuando llegue cliente inmobiliario, el bot necesita few-shots específicos (no usar lenguaje médico, conocer "metros cuadrados", etc.).

| Item | Esfuerzo |
|---|---|
| Schema para few-shots por vertical en `agencies.bot_config.few_shots` | 1h |
| UI para editarlos en Panel Admin | 2-3h |
| Inyectar few-shots en el Componer System Prompt | 1-2h |

**Total: 4-6h.**

### Total P3: 30-40h dev cuando llegue el momento

---

## P4 — Optimización + Polish (continuo)

Cosas que no bloquean nada pero mejoran el sistema.

### P4.1 — Performance

| Item | Esfuerzo |
|---|---|
| Audit Lighthouse del frontend | 2h |
| Optimizar bundle size (code splitting, dynamic imports) | 4-6h |
| CDN + caching de assets | 2-3h |
| Query optimization en Supabase (índices, RLS performance) | 4-6h |

### P4.2 — Dashboard global de insights

Tabla agregada por agency: leads/día, conversion rate, tiempo medio respuesta, top performing agents.

**Esfuerzo: 12-16h.**

### P4.3 — Templates / Machotes en composer

Modal con templates predefinidos por agency + variables ({{nombre_lead}}, etc.).

**Esfuerzo: 6-8h.**

### P4.4 — Multimedia

- Imágenes (composer + visualización inbox).
- Videos.
- Audios (humano sending + bot transcript automático futuro).

**Esfuerzo: 12-18h.**

### P4.5 — Insights nivel Dios — más profundidad

- Sentimiento de la conversación (positivo/negativo) calculado por LLM.
- Predicción de probabilidad de conversión (modelo simple).
- Recomendación al agente: "este lead se calientó en los últimos 3 turnos, atendelo YA".

**Esfuerzo: 16-24h.**

### P4.6 — Mobile native app (lejos)

Si Robert quiere PUSH notifications nativas (no Web Push), eventualmente.

**Esfuerzo: 80-120h.** Probablemente nunca a menos que escales mucho.

### Total P4: Continuo, no bloquea

---

## Áreas críticas que NO están en el backlog actual

### Compliance + Legal

| Item | Estado | Por qué importa |
|---|---|---|
| Términos y Condiciones | Pendiente | Antes de cobrar a alguien |
| Política de privacidad | Pendiente | GDPR / leyes CR de datos |
| Acuerdo de procesamiento de datos (DPA) | Pendiente | Si manejás datos sensibles de leads |
| Consentimiento explícito del lead para que un bot le responda | Pendiente | Meta + WhatsApp business rules |
| Botón "borrar mis datos" del lead | Pendiente | GDPR / LFPDPPP México / etc. |

### Operations + Monitoring

| Item | Estado |
|---|---|
| Alertas si el bot deja de responder (uptime monitoring) | Pendiente |
| Alertas si bot-actions edge function falla más del N% del tiempo | Pendiente |
| Dashboard de costos (OpenAI + Supabase + YCloud) | Pendiente |
| Backup automático Supabase | Probablemente built-in pero verificar |
| Backup del workflow N8N (off-site) | Gap F8 conocido |

### Seguridad

| Item | Estado |
|---|---|
| Audit security review (OWASP Top 10) | Pendiente |
| Rate limiting en edge functions (anti-abuse) | Pendiente |
| 2FA para users con rol owner/admin | Pendiente |
| Auditoría de RLS (pen-test) | Pendiente |

### Comercial

| Item | Estado |
|---|---|
| Contactar a **Jimena** para demo (mencionado en backlog) | Pendiente |
| Casos de éxito / testimonials | Pendiente (necesita 1-2 clientes felices primero) |
| Demo grabado del sistema | Pendiente |
| Página de pricing | Pendiente (depende de P2.4) |

---

## Resumen ejecutivo — qué priorizar

### Esta semana (próximos 5-7 días)

**Objetivo:** Robert usando el sistema en producción.

1. **P0.1 Deploy Vercel** (2-3h) — sin esto Robert no puede usar el sistema.
2. **P0.2 bot_config de Robert verificado** (2-3h) — chequear que tiene precios, link de agenda, tono correcto.
3. **P0.3 Onboarding Robert** (30 min) — crear su user.
4. **P0.4 Notificación handoff por WhatsApp** (4-6h) — sin esto Robert pierde leads.
5. **P0.5 Multimedia composer + Templates** (8-12h) — Robert va a necesitarlos día 1.

**Total: 17-25h. ~3 días de trabajo.**

### Próximas 2-3 semanas

**Objetivo:** Cliente 2 y 3 onboarded sin self-service todavía. Lecciones de Robert aplicadas.

6. **P1.1 Sistema de Roles** + restricciones por agente (11-15h).
7. **P1.2 Onboarding manual desde Panel Admin** (13-18h).
8. **P3.1 F7 Wake-up automático del bot** (6-9h).
9. **P3.4 Tools nuevas según feedback Robert** (4-6h por tool).
10. **Compliance básico** (T&C, privacy policy) — 4-6h.

**Total: 38-54h. ~1-2 semanas.**

### Mes 2-3

**Objetivo:** Self-service y empezar a cobrar.

11. **P2.1 Signup público + onboarding wizard** (16-24h).
12. **P2.2 Settings cliente-facing completo** (26-36h).
13. **P2.4 Billing (Stripe)** (24-32h).
14. **P2.3 Integración self-service WhatsApp** (depende de YCloud Tech Partner) (15-20h).

**Total: 80-110h. ~3-4 semanas.**

### Después

- P3.x bot avanzado según necesidad.
- P4.x optimización + polish.
- Módulo Propiedades cuando llegue cliente inmobiliario.
- Operations + monitoring antes de pasar de 5 clientes.

---

## Decisión inmediata para el founder

Las próximas sesiones deberían arrancar desde el **P0.1 Deploy Vercel** y bajar. Cada item es independiente — podés hacerlos en cualquier orden si tenés razón concreta, pero el orden propuesto minimiza dependencias.

**Si te tomás 1-2 semanas para Robert → mes 2 ya tenés un cliente real validado + sabés qué falta de verdad (no especulación).**

**Si saltás al P2 sin Robert → riesgo de construir features que nadie pide.**

---

## Cómo retomar esto en sesiones futuras

1. Leer este documento (`memory/roadmap-completo.md`).
2. Leer `memory/decisions.md` últimas entradas para ver qué decidimos recientemente.
3. Leer `memory/backlog-mvp.md` para ver el detalle granular.
4. Si vas a tocar el bot → leer `memory/n8n-changes/` últimas specs.
5. Decidir qué pilar avanzar y elegir 1-2 items dentro.

**Convención:** cuando completes un item, marcalo `[x]` acá + en backlog-mvp.md. Cuando agregás algo nuevo, ponelo en el pilar correcto.
