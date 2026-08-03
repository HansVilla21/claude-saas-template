# Proyecto — CRM SaaS Inmobiliario

## Identidad
- **Empresa:** Momentum AI (3-102-953427 SRL, Costa Rica)
- **Fundador:** Hans Villalobos
- **Nombre del producto (provisional):** Casa CRM
- **Fecha de inicio del desarrollo:** Mayo 2026
- **Estado:** Pre-MVP avanzado (2026-05-20). 7 pantallas funcionando con Supabase + Realtime, **completamente responsive** (target tablet portrait). Bot vendedor empático con calificación BANT. **Sistema de handoff cohesivo end-to-end** (DB triggers + edge function + UI cross-pantalla + N8N patch). Preparando demos con prospectos.

## Una oración
SaaS multi-tenant que da a cada agente inmobiliario independiente (Costa Rica/LATAM) un **asistente IA en WhatsApp + CRM** que filtra ~80% del ruido del inbox, califica leads automáticamente, y solo le pasa al agente los prospectos calientes.

## Cliente objetivo
- **Avatar primario:** agente inmobiliario INDEPENDIENTE
- Trabaja solo (o con 1 asistente)
- 50-300 mensajes WhatsApp/día entre 4-6 canales (IG ads, FB Marketplace, Encuentra24, referidos)
- 5-30 propiedades activas
- Sin CRM o con Excel/Notion mal usados
- Ingresos: comisión variable, mes bueno $5K-15K USD
- **Ticket objetivo:** $200-500/mes/agente

## NO es el cliente
- Inmobiliarias grandes (10+ agentes). Por ahora ni soportar fase 2 (equipos chicos 2-5).

## Pitch que no se negocia
"Te libero del caos" — NO "te reemplazo". El bot maneja repetición, el agente sigue cerrando.

## Multi-tenancy (CRÍTICO para arquitectura)

**El sistema es UN SaaS con UNA base de datos Supabase compartida entre N clientes (agentes inmobiliarios o agencias).**

- Cada cliente tiene su propia configuración, propiedades, leads, conversaciones, equipo.
- Aislamiento total entre tenants (un agente NUNCA ve leads de otro).
- Tenant = "agencia" o "workspace". Decisión pendiente: ¿un agente solo = una agencia con 1 miembro? Sí, por simplicidad.
- **Cada agencia tiene su propio número de WhatsApp conectado en YCloud** (su propio `phone_number_id`).
- Sobre el bot: pendiente decidir si es **un flujo N8N único parametrizado por tenant** o **un flujo independiente por tenant**. Recomendación inicial: flujo único parametrizado.

## Stack acordado (MVP)
- **Frontend:** Next.js 16 (App Router) + React 19 + TypeScript + Tailwind 4
- **DB + Auth + Realtime + Storage:** Supabase
- **WhatsApp BSP:** YCloud (Coexistence Mode al inicio)
- **Bot conversacional:** N8N (workflows en cloud o self-hosted)
- **AI motor del bot:** Claude Sonnet 4 API
- **Hosting frontend:** Vercel
- **Email transaccional:** por definir (Resend probable)

## Fase actual del producto
- **Fase 0 (parcial):** Demo del bot con el número personal de Hans ya funciona vía N8N + YCloud.
- **Fase 1 (próxima):** 3 pilotos pagando o comprometidos. Bot + notificación al agente, sin CRM completo todavía.
- **Fase 2 (objetivo):** CRM completo en producción, 8-12 clientes pagando $199-299/mes.

## Lo que estamos construyendo AHORA en esta sesión
- Frontend del CRM completo (UI sobre mock data) — Etapa 1 fundación lista, Inbox portado.
- Pendiente: conectar a Supabase con schema multi-tenant.
- Pendiente: definir flujo de mensajes YCloud ↔ N8N ↔ Supabase ↔ CRM.
- Pendiente: conectar a YCloud para mensajería real (bloqueado por aprobación Meta Tech Provider y Programa Partner YCloud — en proceso).

## Riesgos clave actuales
1. Bot no entiende bien → fallback a humano explícito.
2. Coexistence Mode falla si cliente no abre WB cada 13 días → notif automática.
3. Competencia horizontal (WATI/AiSensy/SleekFlow) → defensibilidad = especialización vertical + cultura LATAM.

## Lo que NO va en esta primera versión
- Configuración del bot por el cliente (lo maneja Hans/Momentum manualmente).
- Self-service de onboarding (todavía con call de kickoff).
- Multi-agente (equipos grandes).
- Voice agent.
- CMA (análisis comparativo de mercado).
- MLS integration (no existe en CR todavía).
