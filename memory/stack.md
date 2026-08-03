# Stack Técnico

## Frontend (ya en construcción)
- **Framework:** Next.js 16 (App Router, Turbopack)
- **React:** 19
- **Lenguaje:** TypeScript estricto
- **Estilos:** Tailwind CSS 4 + CSS variables custom del prototipo de Claude Design
- **Animaciones:** `motion` (instalado, sin uso aún)
- **Iconos:** SVG inline propios (49 iconos en `src/components/icons.tsx`)
- **Fuentes:** Plus Jakarta Sans (sans), Instrument Serif (display), JetBrains Mono — vía `next/font`
- **Hosting:** Vercel (planeado, no desplegado aún)
- **Idioma:** español (interfaz y código bilingüe — comentarios y vars en inglés)
- **Mobile-first:** sí, sin excepción (regla del founder)

## Backend / Datos (PENDIENTE DE DISEÑO + IMPLEMENTACIÓN)
- **DB + Auth + Realtime + Storage:** Supabase
- **Patrón multi-tenant:** una sola DB compartida, aislamiento vía Row Level Security (RLS) sobre columna `agency_id` (o equivalente)
- **Auth:** Supabase Auth (email + Google OAuth)
- **Realtime:** Supabase Realtime sobre tablas críticas (conversaciones, mensajes, leads cambiando estado)
- **Storage:** documentos del lead (cédulas, cartas pre-aprobación, contratos), fotos de propiedades
- **API:** Supabase client SDK directo desde el CRM (no se construye API REST/GraphQL intermedia salvo casos específicos como webhook handlers o llamadas a YCloud)

## WhatsApp / Mensajería (PENDIENTE)
- **BSP:** YCloud
- **Modo:** Coexistence Mode (cada cliente tiene su número personal conectado)
- **Tech Provider Meta:** en proceso de aprobación
- **Partner YCloud:** en proceso de aplicación

## Bot Conversacional (YA FUNCIONA EN DEMO)
- **Orquestador:** N8N (cloud o self-hosted, a confirmar)
- **Modelo IA:** Anthropic Claude Sonnet 4 API
- **Flujo actual:** funciona con el número personal de Hans. Pendiente parametrizar para multi-tenant.
- **Hand-off:** el bot escala al humano cuando detecta intento de agendar visita o consulta compleja.

## Email Transaccional (PENDIENTE)
- Probablemente Resend (más moderno, bueno con React Email).

## Pagos (FUTURO)
- Tilopay (Costa Rica) o Stripe (LATAM). Onvo está en el template como opción.

## Observability (PENDIENTE)
- PostHog + Sentry recomendado.

## Variables de entorno necesarias
Ver `crm/.env.example` para la lista actualizada.

## Decisiones técnicas que faltan tomar
1. **Schema multi-tenant** — qué tablas, qué relaciones, qué columna identifica al tenant (`agency_id`), cómo se aplica RLS — DISEÑO EN MARCHA (agente arquitecto).
2. **¿N8N → Supabase directo o vía CRM API?** — N8N necesita escribir contactos, mensajes, cambiar estados.
3. **¿Mensajes salientes desde CRM → directo a YCloud o vía N8N?** — afecta registro de actividad y triggers de automation.
4. **Bot único parametrizado vs flujo N8N por tenant** — afecta operaciones y escalabilidad.
5. **Webhook ingest** — cómo entran los mensajes a Supabase. Probablemente Edge Function que YCloud llame.

## Trade-offs aceptados
- **Próximo:** documentar trade-offs explícitos cuando el arquitecto entregue propuesta de schema.
