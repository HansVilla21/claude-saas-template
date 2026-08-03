# 03 — Plug-ins por nicho

El CORE (`sql/0001_core.sql`) cubre lo común a cualquier chatbot: agencies, leads, conversations, messages, tasks, tags, custom_fields. Lo específico del nicho va en **plug-ins separados** que se cargan opcionalmente.

Regla: **cargar SOLO los plug-ins que el chatbot va a usar**. Un chatbot de reservas no carga `ecommerce.sql`. Esto mantiene el schema limpio per-instancia y simplifica queries.

---

## Resumen rápido

| Plug-in | Para qué nichos | Tablas que agrega |
|---|---|---|
| `reservas.sql` | Clínicas, dentistas, spas, peluquerías, barberías, restaurantes, hoteles, consultores, coaches | `services`, `staff_members`, `staff_services`, `availability_rules`, `availability_overrides`, `appointments` |
| `ecommerce.sql` | Tiendas online (ropa, accesorios), catálogos por WhatsApp, restaurantes con delivery | `product_categories`, `products`, `product_variants`, `discount_codes`, `orders`, `order_items` |
| `soporte.sql` | SaaS con helpdesk, servicios con tickets recurrentes, soporte L1/L2 con KB | `ticket_categories`, `tickets`, `ticket_comments`, `kb_articles` |
| `inmobiliaria.sql` | Bienes raíces (referencia Casa CRM) | `properties`, `property_views`, `visit_requests` + extiende `leads` |

---

## `reservas.sql` — citas y reservas

### Cuándo cargarlo

El chatbot agenda citas/reservas con cliente + servicio + fecha/hora. Casos:
- Clínica dental: paciente agenda limpieza con Dr. X el martes 2pm
- Peluquería: cliente agenda corte con estilista Y el sábado 10am
- Restaurante: cliente reserva mesa para 4 el viernes 8pm
- Coach: cliente agenda sesión 1-on-1

### Modelo

```
agency → services (catálogo: "Limpieza dental, 45 min, ₡25.000")
       → staff_members (opcional: "Dr. González", "Estilista Ana")
       → staff_services (M:N quién atiende qué)
       → availability_rules (Lun-Vie 9-18, Sab 9-13)
       → availability_overrides (feriado 25-dic, vacaciones Dr. X)
       → appointments (lead + service + scheduled_at + status)
```

### Decisiones clave

- **`services.duration_minutes`** se COPIA a `appointments.duration_minutes` al crear (snapshot). Si el service cambia de duración después, las appointments viejas mantienen la duración con la que se crearon.
- **`availability_rules.day_of_week`** usa 0-6 (0=domingo) compatible con PostgreSQL `EXTRACT(DOW)`.
- **`appointments.scheduled_at` + `duration_minutes`** se usa para detectar overlaps. Función helper: `app.is_slot_available(agency, staff, start, duration)`.
- **`rescheduled_from_id`** para mantener cadena: cuando un appointment se reagenda, se crea uno nuevo apuntando al viejo, y el viejo queda con `status='rescheduled'`.

### Flow típico desde el bot

1. Lead: "Quiero agendar limpieza dental el martes"
2. Bot llama `select * from services where category='limpieza' and is_active=true` → muestra opciones con precio + duración
3. Lead: "La limpieza con Dr. González"
4. Bot llama `select app.is_slot_available(agency_id, dr_gonzalez_id, '2026-06-03 14:00', 45)` → true/false
5. Si disponible: insert appointment con status='pending', return ID
6. Bot confirma al lead: "Listo, agendé tu cita para el martes 3 a las 2pm. ¿Confirmás?"
7. Lead: "Sí"
8. Bot update appointment status='confirmed', confirmed_at=now()

### Gotchas

- **NO usar `availability_rules` para todos los casos.** Si tu negocio tiene horarios complejos (turnos rotativos, diferentes per-staff, eventos especiales), considerá una tabla `available_slots` pre-calculada.
- **Reminders:** el campo `reminder_sent_at` está para que un cron job te ayude a no mandar el mismo recordatorio 2 veces. Implementar el sender es app-side.
- **No-shows:** trackear `no_show` es importante para identificar clientes problemáticos. Puede automatizarse: cron job 1h después de scheduled_at que checkee si el lead respondió, si no marcar `no_show`.

---

## `ecommerce.sql` — tiendas online y catálogos

### Cuándo cargarlo

El chatbot vende productos: el lead arma una orden de compra a través del chat. Casos:
- Tienda de ropa por WhatsApp: lead pide "talla M, color negro" del producto X
- Restaurante con delivery: lead pide combos + extras + dirección
- Tienda de accesorios con catálogo por canal

### Modelo

```
agency → product_categories (Ropa, Accesorios, Comida)
       → products (con stock, precio, fotos)
         → product_variants (talla, color, sabor)
       → discount_codes (opcional: WELCOME10)
       → orders (lead + status + totals)
         → order_items (productos en la orden)
```

### Decisiones clave

- **Stock per-product Y per-variant:** si el product tiene variants, el stock se trackea por variant. Si no, en el product.
- **Snapshot en `order_items`:** `product_name`, `variant_name`, `sku`, `unit_price` se COPIAN al order_item al crear. Si después el product cambia de precio, las ordenes viejas mantienen el precio histórico.
- **`orders.total` se recalcula automáticamente** vía trigger `recalculate_order_totals` cuando cambian order_items.
- **Stock se descuenta automáticamente** cuando `orders.status` pasa a `'paid'` vía trigger `deduct_stock_on_paid`.
- **Carrito NO está en DB:** el carrito durante la conversación es state efímero (manejar en Redis, n8n workflow context, o `custom_fields`). Solo se persiste como `order` cuando el lead confirma.

### Flow típico desde el bot

1. Lead: "Tienen camisetas?"
2. Bot llama `select * from products where category_id=... and is_active=true limit 5`
3. Lead elige: "La camiseta básica negra talla M"
4. Bot busca el variant: `select * from product_variants where product_id=X and options @> '{"color":"black","size":"M"}'`
5. Bot mantiene "carrito" en context: `{ items: [{ variant_id, quantity: 1 }] }`
6. Cuando lead dice "es todo": bot crea order con status='draft' + order_items
7. Bot pide datos de envío → update order.shipping_address
8. Bot pide método de pago → update order.payment_method
9. Lead paga (Sinpe, transferencia, link a Stripe) → bot updates order.status='paid' → trigger descuenta stock

### Gotchas

- **`order_number`** debe generarse app-side antes del insert (ej: `ORD-2026-${seq}` con secuencia). No usar UUID como número visible — el cliente lee mejor "ORD-00123".
- **Refunds:** el flow `'refunded'` requiere lógica extra (devolver stock, marcar items refundeados). No incluido aquí — es per-business.
- **Inventory race conditions:** si tenés 1 unidad de stock y 2 leads simultáneos la compran, ambos pueden completar el flow antes de que el trigger descuente. Para alta concurrencia, considerar `select ... for update` en el product al crear order_item.

---

## `soporte.sql` — helpdesk con tickets

### Cuándo cargarlo

El chatbot es la primera línea de soporte. Atiende dudas, resuelve lo simple, y escala a humano lo complejo. Casos:
- SaaS con clientes que tienen problemas técnicos
- Servicios con preguntas recurrentes (facturación, cancelaciones)
- Cualquier negocio que necesite trackear tickets con SLAs

### Modelo

```
agency → ticket_categories (Facturación, Técnico, General) + SLAs por categoría
       → tickets (subject, status, priority, assigned_to, sla_targets)
         → ticket_comments (respuestas + notas internas)
       → kb_articles (knowledge base que el bot puede consultar)
```

### Decisiones clave

- **SLAs por categoría:** `sla_first_response_hours` y `sla_resolution_hours` en `ticket_categories` se aplican automáticamente vía trigger al crear ticket. Calculan `tickets.sla_first_response_at` y `sla_resolution_at`.
- **`first_response_at`** se setea automáticamente cuando un agent comenta no-internal (vía trigger).
- **Comments visibility:** `is_internal=true` = solo equipo, `is_internal=false` = visible para el cliente (típicamente el comment va con un message outbound).
- **Reopen counter:** `reopened_count` aumenta automáticamente cuando un ticket cerrado pasa a `'reopened'`.
- **CSAT:** después de resolver, el bot puede preguntar "¿qué tal fue tu experiencia? (1-5)" y guardar `csat_score`.

### Flow típico

1. Lead: "No me funciona X"
2. Bot consulta KB: `select * from kb_articles where ... order by similarity desc limit 3`
3. Si encuentra match: bot manda summary del article → si el lead dice "no me sirve", crear ticket
4. `insert into tickets (subject, description, lead_id, category_id=technical, source_channel='chatbot')`
   → trigger setea `sla_first_response_at = now() + 2 horas` (porque category technical tiene SLA 2h)
   → trigger asigna al `default_assignee_id` de la category si existe
5. Bot escribe `ticket_comment` con `author_kind='bot'`, `is_internal=false` confirmando recepción
6. Trigger setea `first_response_at = now()` y `status='in_progress'`
7. Agente revisa, agrega comments (algunos internos), responde al cliente
8. Cuando resuelve: `update tickets set status='resolved'` → trigger setea `resolved_at`
9. Bot pregunta CSAT después de N horas

### Gotchas

- **SLA breaches:** la columna `sla_first_response_at` permite query "tickets con SLA vencido pendientes". Index existe (`idx_tickets_sla_breach`).
- **KB search:** con `gin_trgm_ops` hacés búsqueda fuzzy por título. Para búsqueda semántica real, descomentar `embedding vector(1536)` + crear `extension vector` + usar `pgvector`.
- **Reopen:** el bot debe detectar cuando un cliente escribe sobre un ticket cerrado reciente y hacer reopen (`status='reopened'`) en lugar de crear ticket nuevo.

---

## `inmobiliaria.sql` — propiedades y visitas (referencia Casa CRM)

### Cuándo cargarlo

El chatbot es para bienes raíces: muestra propiedades, agenda visitas, califica leads de compra/alquiler.

### Modelo

```
agency → properties (catálogo: casa, apto, lote, oficina, etc.)
       → property_views (cuando le mandaron info de una propiedad al lead)
       → visit_requests (visitas agendadas a propiedades)

leads (extendido):
  + operacion_interes (compra | alquiler | venta)
  + tipo_interes[]
  + zonas_interes[]
  + presupuesto_min / presupuesto_max
  + dormitorios_min
  + property_interest_id (propiedad favorita actual)
```

### Decisiones clave

- **`properties.codigo`** es el ID humano-visible (CR-2031). UNIQUE per agency. El UUID es interno.
- **`foto_urls text[]`** array de URLs públicas (JPG/PNG forzado, ver skill `whatsapp-image-delivery-ycloud`).
- **`property_views`** trackea cada interacción del lead con una propiedad. Útil para: scoring de interés, evitar repetir info, analytics.
- **`leads` extendido** con campos de búsqueda (presupuesto, zonas, tipo) para que el chatbot pueda hacer match propiedad ↔ preferencias.

### Flow típico

1. Lead: "Busco apto en Escazú menos de $250K"
2. Bot extrae preferences → update lead: `zonas_interes='{Escazú}'`, `presupuesto_max=250000`, `tipo_interes='{apartamento}'`
3. Bot search: `select * from properties where canton='Escazú' and tipo='apartamento' and precio<=250000 and status='disponible' order by destacada desc limit 5`
4. Bot manda info de top-3 + marker `[IMG:CR-2031]` para que se mande la foto (ver skill `bot-llm-marker-expand-pattern`)
5. Insert property_views (1 row per propiedad mostrada)
6. Lead pregunta por CR-2031 → insert visit_request status='pending'
7. Agente confirma → status='confirmed', confirmed_at=now()

---

## Cómo agregar un plug-in nuevo (para tu propio nicho)

Si el chatbot del cliente no encaja en ninguno de los 4, podés crear uno. Plantilla:

```sql
-- =====================================================================
-- plug-ins/<tu_nicho>.sql
-- Plug-in para chatbots de <descripción>
-- Aporta: <lista de tablas>
-- Requiere: 0001_core.sql aplicado previamente
-- =====================================================================

-- Enums específicos del nicho
create type tu_enum as enum (...);

-- Tablas con agency_id obligatorio + FK a core
create table public.tu_tabla (
    id           uuid primary key default gen_random_uuid(),
    agency_id    uuid not null references public.agencies(id) on delete cascade,
    lead_id      uuid references public.leads(id) on delete cascade,
    conversation_id uuid references public.conversations(id) on delete set null,
    -- campos específicos
    ...
    extra        jsonb not null default '{}'::jsonb,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

create index ... -- los que apliquen

-- Triggers de updated_at usando app.touch_updated_at()
create trigger tg_touch_updated_at
    before update on public.tu_tabla
    for each row execute function app.touch_updated_at();

-- Triggers de lógica si aplica (auto-calcular totals, validar, etc.)
```

**Reglas no negociables:**
1. **`agency_id` obligatorio en TODA tabla del plug-in** (tenant-ready)
2. **FK a `leads` / `conversations` cuando corresponda** (no inventar IDs)
3. **No tocar tablas del CORE** sin agregar al final del archivo `alter table ... add column if not exists ...` (idempotente)
4. **Triggers nuevos en `schema app`** (no `public`)
5. **Index per query típica esperada** (no over-index)

---

## Próximos pasos

- **[04-onboarding-paso-a-paso.md](04-onboarding-paso-a-paso.md)** — arrancar tu primer chatbot en 30 min
- **[05-migracion-desde-airtable.md](05-migracion-desde-airtable.md)** — migrar data existente
