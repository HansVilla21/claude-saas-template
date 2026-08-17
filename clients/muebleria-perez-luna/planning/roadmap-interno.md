# Roadmap interno (técnico) — Mueblería Pérez Luna

> Uso interno. Aterrizado sobre `crm-v2/` (Next.js 16 + Supabase + n8n + Claude API + YCloud). NO mostrar al cliente — la versión presentable es [plan-mes-1.md](plan-mes-1.md).

## TL;DR de arquitectura (del mapeo del repo)

- **Versión activa: `crm-v2/`.** El CRM es **multi-tenant** (single DB + RLS por `agency_id`). **Cada cliente = una "agencia"** con slug en `/a/[slug]/`.
- **Sistema de módulos config-driven** en DB: `module_definitions` + `agency_modules`. Mueblería = nuevo módulo `catalogo-muebles` que **espeja `properties`**.
- **Bot:** YCloud → Edge Function → n8n (`chatbot-momentum-bot-v6-v2.json`) → Claude → Supabase. Prompt compositor por capas (core + system_rules fijas; capas 2–6 por agencia; fragment por módulo). Handoff e insights ya existen.
- **Sitio web showcase:** NO existe en crm-v2 (sí un landing legacy en `crm/src/app/landing/` como referencia de estilo). Es **build nuevo**.
- **`bot_resources`** (videos/PDFs que el bot sabe cuándo enviar): NO existe → construir como parte del módulo.
- **Gemini Vision** (leer foto/video) → fase 2.

## Lo que se REUSA tal cual

Stack completo · multi-tenancy (agencies + RLS) · inbox + conversaciones + realtime broadcast · extractor/insights (solo redefinir campos) · handoff + escalamiento · prompt compositor (capas fijas) · panel admin de config del bot.

## Fases de ejecución

### Fase 0 — Provisioning (Semana 1)
- [ ] Crear `agency` Mueblería Pérez Luna (slug, branding base en `bot_config`).
- [ ] Crear `agency_member` (Donald, Dennis) + correo empresarial a su nombre.
- [ ] Registrar número en `whatsapp_numbers` → YCloud (cuando tengamos acceso al WhatsApp Business).
- [ ] Verificar dominio (proveedor + acceso DNS). Confirmar `muebleriaperezluna.com`.

### Fase 1 — Módulo Catálogo de Muebles (DB) (Semana 1)
- [ ] Migration `00XX_furniture_module.sql`:
  - Tabla `furniture` espejando `properties` (`crm-v2/supabase/migrations/0003_core_crm.sql:244+`). Adaptar:
    - `furniture_type` enum: cama / comedor / sala / mueble-hogar / silla / mesa / gavetero / closet / otro (configurable).
    - Quitar `operation` inmobiliario → simplificar (venta / personalizado / consulta) o quitar.
    - Quitar campos de ubicación (province/canton/district/geo) → opcional `coleccion`/`linea`.
    - Agregar: `materials[]`, `dimensions` (jsonb), `options` (jsonb: colores/maderas/tapizados/tamaños), `assembly`.
    - Mantener: `code`, `title`, `price/currency`, `images` (jsonb), `features[]`, `status`, `featured`, `view_count`, `lead_count`.
  - Tabla `lead_furniture_interest` (espeja `lead_property_interest`).
  - Tabla `bot_resources` (videos/PDF/links + `associated_products` jsonb + `trigger_keywords[]`).
- [ ] Registrar en `module_definitions` (slug `catalogo-muebles`: tool_config, extractor_schema, ui_slots, prompt_fragment).
- [ ] Prender en `agency_modules` para Mueblería + overrides.

### Fase 2 — UI Catálogo en crm-v2 (Semanas 2–3)
- [ ] `/a/[slug]/catalogo/page.tsx` (listado) + `<CatalogoClient/>` — adaptar de legacy `crm/src/app/(crm)/properties/`.
- [ ] `/a/[slug]/catalogo/[id]/page.tsx` (detalle) + tabs (info, galería, variantes/opciones, leads interesados, pedidos).
- [ ] CRUD: crear/editar producto con fotos (Supabase Storage), precios, materiales, opciones.
- [ ] Cargar el catálogo real (de los PDFs/Canva → registros `furniture`).

### Fase 3 — Bot Mueblería (Semanas 1–4, iterativo)
- [ ] Clonar `chatbot-momentum-bot-v6-v2.json` → variante Mueblería (versionar; ver skill `n8n-workflow-versioning`).
- [ ] Tool "Buscar catálogo de muebles" reemplaza "Buscar propiedades" (`SELECT ... FROM furniture WHERE agency_id=$1 ...` LIMIT 5; mismo output shape; marker `[IMG:...]`).
- [ ] Tool/lógica de `bot_resources` (enviar video/catálogo según keywords).
- [ ] Extractor: `tipo_mueble`, `presupuesto`, `material_preferido`, `estilo`, `medidas_aprox`, `uso` (en `extractor_field_defs`).
- [ ] Prompt (capas 2–6): "vendedor de mueblería premium", habilidades de venta, **filtro por presupuesto**, follow-up, handoff. Usar agente `langchain-prompt-designer` / skill `langchain-agent-prompt-design`.
- [ ] Handoff: `handoff_reason` (qualified / scheduling / objection_complex / bot_stuck / manual); marcar leído para no dejar "visto"; mensaje de cortesía fuera de horario.
- [ ] Versión de prueba en Telegram → loop de feedback con Donald/Dennis.

### Fase 4 — Sitio web showcase (Semanas 2–4)
- **Decisión de arquitectura (confirmar con Hans):** proyecto Next.js **separado** para el sitio público (dominio propio, deploy propio, SEO), **leyendo el mismo Supabase** (`furniture` read-only público) para que el catálogo se sincronice con el CRM. Alternativa: ruta `/catalogo` dentro de crm-v2. → **Recomendado: separado + backend compartido.**
- [ ] Estructura: hero premium, carruseles por categoría, sobre nosotros, contacto.
- [ ] Botón "me interesa" → WhatsApp Click-to-Chat con texto precargado por producto.
- [ ] **Formulario de pedidos personalizados** → crea lead en CRM con asignación a asesor (handoff). *(En el contrato.)*
- [ ] Buscador (filtros: categoría → material → precio).
- [ ] **Asistente virtual web** (Claude API con contexto del catálogo; distinto del bot de WhatsApp). Da link directo al producto.
- [ ] SEO (metadata, sitemap, performance). Mobile-first + `motion` para animaciones.
- [ ] Referencia de estilo: legacy `crm/src/app/landing/` (paleta earth/premium) — alinear a marca real de IG/FB.

### Fase 5 — Producción + handoff a soporte (Semanas 4–5)
- [ ] Bot a producción (WhatsApp oficial vía YCloud). Sitio a dominio real (Vercel).
- [ ] Capacitación: inbox, insights, tomar/devolver conversación, cargar productos.
- [ ] Arranca mes de soporte gratis.

## Fase 2+ (post-entrega, upsell) — excluido por contrato, cotización aparte
- **Gemini Vision**: analizar foto/video del cliente → identificar producto del catálogo (asociar `bot_resources` videos ↔ `furniture`). *(No está en el contrato.)*
- **Pasarela de pagos / tienda en línea.**
- **Panel de autogestión de productos** (autoservicio avanzado para el cliente).
- **ERP / contable / facturación electrónica** (Dennis).
- **Producción/fábrica**: trazabilidad pedido, tablets para Freddy, fichas técnicas/despiece.

> ⚠️ **Métricas de tiempo del equipo por conversación SÍ están en el contrato** (alcance incluido, no fase 2). Implementar en el panel de insights/inbox: tiempo del bot vs tiempo humano por conversación. El schema ya tiene base de tiempos de respuesta; extender a tiempo invertido por handler.

## Riesgos / decisiones abiertas
1. **Arquitectura del sitio** (separado vs ruta crm-v2) — confirmar antes de empezar Fase 4.
2. **Acceso al dominio** — Donald no está seguro del proveedor; resolver en onboarding.
3. **Calidad de datos del catálogo** — depende de que los PDFs estén depurados; el catálogo bien cargado es el insumo crítico del bot y del sitio.
4. **Dennis (escéptico de bots)** — priorizar demo temprana del filtro por presupuesto + sitio impecable para ganar su confianza.
5. **UI catálogo en crm-v2 es build nuevo** (legacy properties es solo referencia, no está portado a v2) — presupuestar tiempo real de port.

## Skills/agentes a usar
- `n8n-workflow-build-script` + `n8n-workflow-versioning` (workflow del bot).
- `langchain-agent-prompt-design` / agente `langchain-prompt-designer` (system prompt).
- `n8n-properties-search-tool-pattern` (espejo para el tool de muebles).
- `crm-contact-detail-tabs`, `crm-inbox-conv-list-filters-strip`, `inbox-message-bubble-render` (UI).
- `supabase-realtime-broadcast-pattern`, `supabase-edge-function-secret-auth`.
- Agentes: `arquitecto` (decisión sitio), `backend-builder` (módulo/migrations), `frontend-builder` (catálogo + sitio).
