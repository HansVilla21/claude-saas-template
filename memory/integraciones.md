# Integraciones del Sistema

## YCloud (WhatsApp BSP)

**Rol:** proveedor oficial de WhatsApp Business para Momentum AI y para cada cliente del SaaS.

**Modo:** Coexistence (cada agente conecta su número personal de WhatsApp).

**Estado:**
- ✅ Cuenta empresarial Momentum AI activa.
- ✅ Número personal de Hans conectado (sirve para demos).
- 🔄 Aplicación al Technical Development Partner Program de YCloud — en proceso.

**Lo que YCloud expone que vamos a usar:**
- Mensajería bidireccional (texto, media, ubicación) sobre WhatsApp Business.
- Webhooks entrantes (eventos: nuevo mensaje, status de mensaje enviado, opt-in/out).
- API de envío de mensajes (texto, template, media).
- Plantillas pre-aprobadas (estructura con merge fields).
- Embedded Signup (cliente conecta su número desde el onboarding del CRM).

**Credenciales necesarias en `.env.local` cuando llegue el momento:**
```
YCLOUD_API_KEY=
YCLOUD_WEBHOOK_SECRET=
```

Plus, **por tenant** (almacenadas en Supabase, no en env):
- `ycloud_phone_number_id` — el número conectado de ese agente
- `ycloud_waba_id` — el WhatsApp Business Account ID de ese agente

---

## N8N (Orquestador del Bot)

**Rol:** ejecuta el flujo del chatbot, recibe webhooks de YCloud, llama a Claude para generar respuestas, escribe en Supabase, decide handoff.

**Estado actual:**
- ✅ Workflow funcionando para el número personal de Hans (Fase 0).
- ⏳ Pendiente parametrizar para multi-tenant (recibir tenant context y operar sobre la data correcta).

**Decisión arquitectónica:**
- **N8N escribe directo en Supabase** usando la `service_role` key (bypass de RLS, debe incluir `agency_id` correcto en cada insert).
- **N8N llama a YCloud** para enviar mensajes (con la API key del cliente, no la de Momentum).

**Credenciales necesarias para N8N (en N8N, no en este repo):**
- `SUPABASE_SERVICE_ROLE_KEY` — para escritura en Supabase
- `SUPABASE_URL` — endpoint del proyecto
- `ANTHROPIC_API_KEY` — para Claude
- Por tenant: la API key de YCloud del cliente

---

## Supabase

**Rol:** base de datos, autenticación, realtime, storage para todo el SaaS.

**Estado:** todavía no creado el proyecto.

**Pendiente de decisión:**
- ¿Región? Recomendación: `us-east-1` o `us-east-2` (latencia razonable a Costa Rica).
- ¿Plan? Free para arrancar, Pro cuando lleguemos a primer cliente pagando.
- ¿Branching? Activar para tener `main` y `dev` separados.

**Credenciales para `.env.local` del CRM:**
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=  (solo server-side, edge functions, NUNCA cliente)
```

---

## Claude API (Anthropic)

**Rol:** motor de razonamiento del bot conversacional (a través de N8N).

**Estado:** Hans ya tiene API key.

**Modelo:** `claude-sonnet-4-5` (o el más reciente Sonnet al momento del MVP). Razonamiento + costo razonable para conversaciones de WhatsApp.

**Credencial:** `ANTHROPIC_API_KEY` — vive en N8N, no en el CRM.

---

## Google Calendar (Fase 2)

**Rol:** sincronizar agenda del agente con su Google Calendar personal. Crear/leer eventos de visitas, llamadas, reuniones.

**Estado:** no implementado.

**Pendiente:** OAuth2 flow desde el CRM. Tokens guardados encriptados por agente en Supabase.

---

## Resumen del flujo end-to-end (cuando todo esté conectado)

```
[Lead manda WA] → [YCloud] → [webhook] → [N8N]
                                            ↓
                                  1. Insert lead/conversation/message en Supabase (con agency_id)
                                  2. Llama a Claude (con prompt + historial)
                                  3. Recibe respuesta del bot
                                  4. Insert respuesta en Supabase como msg del bot
                                  5. Envía respuesta a YCloud → lead recibe en WA
                                  6. Si detecta handoff → cambia handler='human' en Supabase
                                            ↓
[Supabase Realtime] → [CRM Next.js] → [Inbox del agente se actualiza en vivo]

[Agente responde desde el inbox del CRM]
            ↓
[CRM Server Action] → [Insert mensaje en Supabase] → [Llama a YCloud para enviarlo]
                                                              ↓
                                                    [Lead recibe en WhatsApp]
```
