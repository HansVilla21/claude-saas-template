# Visión de Producto — CRM SaaS para Agentes Inmobiliarios

**Empresa:** Momentum AI (3-102-953427 SRL)
**Fundador:** Hans Villalobos
**Fecha:** Mayo 2026
**Estado:** Visión inicial, pre-MVP

---

## 1. Propuesta de Valor

**Para:** Agentes inmobiliarios independientes en Costa Rica y LATAM

**Que sufren de:** No dar abasto con mensajes de WhatsApp, leads que se enfrían, sin sistema de seguimiento, sin base de datos de prospectos, sin control de su pipeline

**Nuestro producto:** Un asistente de IA en WhatsApp que filtra el 80% de mensajes basura, califica leads automáticamente, y entrega solo los prospectos calientes listos para que el agente cierre

**Diferenciador clave:** No reemplazamos al agente, lo liberamos del trabajo repetitivo. El agente sigue cerrando ventas; el bot maneja el caos del inbox.

---

## 2. Cliente Objetivo

**Avatar primario:** Agente inmobiliario independiente
- 1 persona, opera solo o con asistente
- Genera 50-300 mensajes de WhatsApp diarios entre 4-6 canales (IG ads, FB Marketplace, Encuentra24, referidos, etc.)
- Pierde leads por no responder a tiempo
- No tiene CRM o usa Excel/Notion mal
- Maneja entre 5-30 propiedades activas
- Ingresos: comisión variable, mes bueno $5,000-15,000

**Avatar secundario (fase 2):** Equipos pequeños de 2-5 agentes

**NO es el cliente:** Inmobiliarias grandes (10+ agentes) — esos necesitan features enterprise que aún no tenemos

**Precio objetivo:** $200-500/mes por agente

---

## 3. Arquitectura del Producto (3 capas)

### Capa 1 — Onboarding y configuración inicial
El momento más crítico. Si esto falla, el cliente no usa el producto.

**Componentes:**
- Embedded Signup de WhatsApp (vía YCloud + Coexistence)
- Setup wizard de propiedades (con scraping de fotos/info si tiene listings en sitios web)
- Configuración de tono de voz del bot (templates pre-armados estilo "formal", "amigable", "casual tico")
- Definición de zonas de operación (Heredia, Escazú, Cartago, etc.)
- Definición de rangos de precio que maneja
- Calificación de leads: qué preguntas hacer, qué considera "lead caliente"

**Tiempo objetivo de onboarding:** 30 minutos guiado, no más

### Capa 2 — Bot conversacional (corazón del MVP)
Lo que el cliente ve funcionar día 1.

**Funciones del bot:**
- Responde mensajes 24/7 con info de propiedades
- Califica al lead: presupuesto, zona de interés, timing, financiamiento (banco/contado)
- Filtra "consultas curiosas" de "leads calientes"
- Detecta intención de visita y notifica al agente
- Mantiene historial de conversación contextual
- Soporta media: manda fotos, videos de propiedades, ubicaciones
- Maneja preguntas comunes: precio, área, parqueo, mascotas, etc.

**Tecnología:**
- Backbone N8N para MVP (primeros 5-10 clientes)
- Claude API o GPT como motor de conversación
- Memoria contextual por conversación (Supabase)
- Migración a stack más serio cuando llegues a 10+ clientes

### Capa 3 — CRM y pipeline (fase 2-3)
Lo que retiene al cliente después del primer mes.

**Funciones del CRM:**
- Vista de leads ordenados por temperatura (frío/tibio/caliente)
- Inbox unificado para que el agente tome control cuando quiera
- Notificaciones inteligentes (solo de leads que importan)
- Sistema de seguimientos automáticos ("dale ping al lead X que no responde hace 3 días")
- Tags y notas por contacto
- Historial completo de conversaciones
- Métricas: leads/día, % conversión, tiempo de respuesta, etc.

---

## 4. Roadmap por Fases

### FASE 0 — Preparación
**Objetivo:** Tener infraestructura lista para validar

- ✅ Constituir Momentum AI legal en Costa Rica
- 🔄 Aprobar Business Verification de Meta (en proceso)
- ⏳ Aplicar y aprobar Meta Tech Provider
- ⏳ Aplicar al Technical Development Partner Program de YCloud
- ⏳ Setup técnico: cuentas, dominios, infraestructura base
- ⏳ Demo funcional con tu propio número de WhatsApp

**Entregable:** Demo grabada de 3 minutos que muestre el bot funcionando con tu número

### FASE 1 — MVP / Validación
**Objetivo:** 3 clientes piloto pagando o comprometidos

- Bot que filtra leads + notifica (tu prioridad declarada)
- Setup wizard básico (manual con tu apoyo, sin self-service todavía)
- Configuración de propiedades vía formulario simple
- Tono de voz: 3 templates pre-armados
- Notificaciones al agente vía WhatsApp del mismo número
- Sin CRM todavía, sin self-service de onboarding

**Precio piloto:** por definir, se puede trabajar un setup inicial más barato y una mensualidad más barata

**Entregable:** 3 agentes inmobiliarios usando el sistema, con testimonios

### FASE 2 — CRM básico
**Objetivo:** Producto cobrable a precio objetivo

- CRM con vista de leads, inbox unificado
- Sistema de seguimientos automáticos básicos
- Dashboard con métricas
- Onboarding semi-self-service (todavía con call de kickoff tuya)
- Templates pre-aprobados para WhatsApp Business

**Precio:** $199-299/mes (rango bajo de tu objetivo $200-500) + setup $

**Entregable:** 8-12 clientes pagando

### FASE 3 — Escala (meses 6-12)
**Objetivo:** 20-30 clientes pagando, $5K-10K MRR

- Self-service completo (cliente se onboardea solo en 30 min)
- Integraciones: Encuentra24, propiedades.com, listings públicos
- Sistema de agendamiento (sin lógica de rutas todavía)
- Marketing channels automation (CTWA, Facebook leads sync)
- Templates avanzados para diferentes tipos de propiedades

**Precio:** $299-499/mes

**Entregable:** Producto vendible sin tu intervención manual

### FASE 4+ — Producto soñado (año 2+)
- Agendamiento inteligente con optimización de rutas
- Multi-agente (equipos)
- Voice agent (llamadas WhatsApp con AI)
- Analytics avanzados
- Integraciones con MLS si entra a CR
- AI agent que sugiere precio óptimo de propiedad
- Generación automática de descripciones de propiedades

---

## 5. Stack Técnico Propuesto

### MVP (Fases 0-1)
- **Backend:** N8N para orquestación
- **Base de datos:** Supabase
- **WhatsApp:** YCloud (BSP)
- **AI:** Claude Sonnet 4 API
- **Frontend cliente (Fase 2):** Next.js + Vercel
- **Auth:** Supabase Auth o Clerk

### Escala (Fases 2-3)
- Migrar lógica crítica de N8N a Supabase Edge Functions
- Mantener N8N solo para workflows no-críticos
- Worker queues con Trigger.dev o similar
- Observability: PostHog + Sentry

---

## 6. Decisiones Estratégicas Tomadas

| Decisión | Justificación |
|---|---|
| Cliente ideal = agente independiente | Menor barrera de entrada, ciclo de venta corto, decisión rápida |
| Precio $200-500/mes | Saludable para Costa Rica/LATAM, permite margen para ti |
| MVP = bot filtra + notifica | Camino de menor resistencia, foco en problema #1 del agente |
| YCloud como BSP | Sin markup, Coexistence soportado, infra para SaaS |
| Costa Rica primero, LATAM después | Validar en mercado conocido antes de expandir |
| NO agendamiento en MVP | Complejidad logística (rutas, conflictos) no justifica para 3 pilotos |
| NO replace al agente | Pitch "te libero del caos", no "te reemplazo" — vende mejor |

---

## 7. Riesgos y Cómo Mitigarlos

### Riesgo 1: El bot no entiende bien las consultas
**Mitigación:** Sistema de fallback a humano siempre. Si el bot no está seguro, escala al agente. Mejor pasar lead tibio al humano que quemar lead caliente con bot estúpido.

### Riesgo 2: Cliente espera "magia automática" y se frustra
**Mitigación:** Setup wizard que invierte 30 min con el cliente al inicio, dejando claro que la calidad del bot depende de la calidad de la info que carguen. "Garbage in, garbage out" explicitado.

### Riesgo 3: Coexistence Mode falla (cliente debe abrir WB app cada 13 días)
**Mitigación:** Notificación automática al cliente cada 10 días recordando abrir la app. Si falla, alerta a tu soporte para reconexión.

### Riesgo 4: WATI/AiSensy/SleekFlow lanzan vertical inmobiliario
**Mitigación:** Defensibilidad = data + workflows específicos del nicho + idioma/cultura LATAM. Tu ventaja no es la tecnología, es la especialización.

### Riesgo 5: El agente quiere control manual y deja de usar el bot
**Mitigación:** Métricas claras de "leads que el bot te trajo este mes" + "tiempo que te ahorró". Si el cliente ve el valor, no se va.

---

## 8. Métricas Clave a Monitorear

### Métricas de Producto
- Tiempo de onboarding (objetivo: <30 min)
- % de mensajes que el bot maneja sin escalar
- % de leads calificados como "calientes" que se convierten en visita
- Tiempo de respuesta promedio (bot vs humano)

### Métricas de Negocio
- MRR (Monthly Recurring Revenue)
- Churn mensual (objetivo: <5%)
- CAC (Costo de Adquisición de Cliente)
- LTV (Lifetime Value)
- NPS (Net Promoter Score)

---

## 9. Plan de Demo (para usar al cerrar primeros clientes)

**Estructura de la demo de 5 minutos:**

1. **Hook (30 seg):** "¿Cuántos mensajes de WhatsApp tenés sin responder en este momento?"
2. **Problema (1 min):** Mostrás screenshots de inboxes saturados, leads enfriados
3. **Demo en vivo (2 min):** Tu propio WhatsApp recibiendo mensaje, bot respondiendo en 5 segundos, calificando, notificándote
4. **CRM glimpse (1 min):** Vista del lead organizado, historial, score
5. **Cierre (30 seg):** "¿Querés probarlo 14 días gratis con tu negocio?"

---

## 10. Próximos Días
### Día 1 y 2
- ✅ Setup YCloud cuenta empresarial
- 🔄 Conectar tu propio número como demo
- ⏳ Construir flujo N8N básico de demo
- ⏳ Definir las 10 preguntas core que el bot debe poder responder

### (después de Meta verification)
- Aplicar a Meta Tech Provider
- Aplicar al programa partner YCloud
- Grabar demo de 3 minutos
- Identificar 5 agentes inmobiliarios candidatos a piloto

### Etapa final
- Demos individuales a los 5 candidatos
- Cerrar 2-3 pilotos
- Iniciar setup manual de su WhatsApp

---

## Notas finales

Esta visión es viva. Va a cambiar cuando hablés con los primeros 5 agentes. Lo que NO debe cambiar es:

1. El foco en agente independiente (no te disperses a inmobiliarias grandes)
2. El pitch "te libero del caos" (no "te reemplazo")
3. El precio objetivo ($200-500/mes, no caigas en $50)
4. La especialización en inmobiliario LATAM (no quieras ser horizontal)

Lo que SÍ va a cambiar:
- Las features exactas del bot (lo van a definir los pilotos)
- El precio exacto dentro del rango
- El stack técnico (vas a iterar)
- El orden de prioridades del roadmap

Mantené este documento abierto. Actualizalo cada vez que tomes una decisión grande.