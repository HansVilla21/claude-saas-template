-- =====================================================================
-- plug-ins/ecommerce.sql
--
-- Plug-in para chatbots que VENDEN productos:
--   - Tiendas online (ropa, accesorios, comida)
--   - Catálogos donde el lead arma pedido por WhatsApp
--   - Restaurantes con delivery (combos, items)
--
-- Aporta:
--   - product_categories
--   - products (+ product_variants para talla/color)
--   - orders (orden de compra)
--   - order_items (líneas de la orden)
--   - discount_codes (opcional)
--
-- NO incluye carrito persistente — el carrito en WhatsApp se maneja
-- típicamente en el contexto de la conversación (Redis o tabla custom_fields).
--
-- Requiere: 0001_core.sql aplicado previamente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type order_status as enum (
    'draft',            -- el lead está armando el pedido (carrito)
    'pending_payment',  -- esperando pago
    'paid',             -- pagado
    'preparing',        -- preparándose
    'shipped',          -- enviado / en camino
    'delivered',        -- entregado al cliente
    'cancelled',        -- cancelada
    'refunded'          -- reembolsada
);

create type payment_method as enum (
    'cash_on_delivery', 'transfer', 'card', 'sinpe',  -- sinpe = transferencia móvil CR
    'paypal', 'stripe', 'other'
);

create type fulfillment_method as enum (
    'delivery', 'pickup', 'shipping'
);

-- ---------------------------------------------------------------------
-- product_categories
-- ---------------------------------------------------------------------
create table public.product_categories (
    id              uuid primary key default gen_random_uuid(),
    agency_id       uuid not null references public.agencies(id) on delete cascade,
    name            text not null,
    slug            text not null,
    description     text,
    parent_id       uuid references public.product_categories(id) on delete set null,
    image_url       text,
    display_order   integer not null default 0,
    is_active       boolean not null default true,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    constraint uq_product_categories_slug unique (agency_id, slug)
);

create index idx_product_categories_agency on public.product_categories (agency_id, display_order) where is_active = true;

-- ---------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------
create table public.products (
    id              uuid primary key default gen_random_uuid(),
    agency_id       uuid not null references public.agencies(id) on delete cascade,
    category_id     uuid references public.product_categories(id) on delete set null,
    -- Identificación
    sku             text,                            -- código interno
    name            text not null,
    slug            text,                            -- url-friendly
    short_description text,
    description     text,                            -- markdown OK
    -- Precio + stock
    price           numeric(12,2) not null,
    compare_at_price numeric(12,2),                  -- precio "antes" (para mostrar descuento)
    currency        text not null default 'CRC',
    stock           integer not null default 0,
    track_stock     boolean not null default true,   -- false = stock infinito
    -- Media
    image_urls      text[],                          -- array de URLs JPG/PNG
    -- Display
    is_active       boolean not null default true,
    is_featured     boolean not null default false,
    display_order   integer not null default 0,
    -- Tax & shipping
    is_taxable      boolean not null default false,
    weight_grams    integer,
    -- Metadata
    tags            text[],
    extra           jsonb not null default '{}'::jsonb,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    constraint uq_products_sku unique (agency_id, sku)
);

create index idx_products_agency_active on public.products (agency_id, display_order) where is_active = true;
create index idx_products_category on public.products (category_id) where is_active = true;
create index idx_products_search on public.products using gin (name gin_trgm_ops);
create index idx_products_featured on public.products (agency_id, display_order) where is_featured = true and is_active = true;
create index idx_products_stock on public.products (agency_id) where track_stock = true and stock <= 0;

-- ---------------------------------------------------------------------
-- product_variants (opcional: talla, color, sabor)
-- ---------------------------------------------------------------------
create table public.product_variants (
    id              uuid primary key default gen_random_uuid(),
    agency_id       uuid not null references public.agencies(id) on delete cascade,
    product_id      uuid not null references public.products(id) on delete cascade,
    sku             text,
    name            text not null,                   -- "Talla M - Negro", "Sabor Vainilla"
    -- Atributos (genérico)
    options         jsonb not null default '{}'::jsonb,  -- {"size": "M", "color": "black"}
    -- Precio + stock por variante (override del product)
    price_override  numeric(12,2),
    stock           integer not null default 0,
    is_active       boolean not null default true,
    image_url       text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    constraint uq_product_variants_sku unique (agency_id, sku)
);

create index idx_product_variants_product on public.product_variants (product_id) where is_active = true;

-- ---------------------------------------------------------------------
-- discount_codes (opcional)
-- ---------------------------------------------------------------------
create table public.discount_codes (
    id              uuid primary key default gen_random_uuid(),
    agency_id       uuid not null references public.agencies(id) on delete cascade,
    code            text not null,                   -- "WELCOME10"
    discount_type   text not null check (discount_type in ('percent', 'amount', 'free_shipping')),
    discount_value  numeric(12,2),                   -- 10 para 10% o 10 USD según type
    min_order_amount numeric(12,2),
    usage_limit     integer,                         -- null = ilimitado
    usage_count     integer not null default 0,
    valid_from      timestamptz,
    valid_until     timestamptz,
    is_active       boolean not null default true,
    created_at      timestamptz not null default now(),
    constraint uq_discount_codes unique (agency_id, code)
);

-- ---------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------
create table public.orders (
    id              uuid primary key default gen_random_uuid(),
    agency_id       uuid not null references public.agencies(id) on delete cascade,
    lead_id         uuid not null references public.leads(id) on delete restrict,
    conversation_id uuid references public.conversations(id) on delete set null,
    -- Numeración legible
    order_number    text not null,                   -- "ORD-2026-00123" (generar app-side o trigger)
    -- Status
    status          order_status not null default 'draft',
    -- Items totals (denorm — recalcular al cambiar order_items)
    subtotal        numeric(12,2) not null default 0,
    discount_amount numeric(12,2) not null default 0,
    discount_code_id uuid references public.discount_codes(id) on delete set null,
    shipping_amount numeric(12,2) not null default 0,
    tax_amount      numeric(12,2) not null default 0,
    total           numeric(12,2) not null default 0,
    currency        text not null default 'CRC',
    -- Customer (snapshot, por si el lead cambia datos después)
    customer_name   text,
    customer_phone  text,
    customer_email  citext,
    -- Shipping
    fulfillment     fulfillment_method not null default 'delivery',
    shipping_address jsonb,                          -- {street, city, country, lat, lng, notes}
    shipping_notes  text,
    -- Payment
    payment_method  payment_method,
    payment_reference text,                          -- ID externo (Sinpe ref, Stripe payment_intent)
    paid_at         timestamptz,
    -- Fulfillment
    shipped_at      timestamptz,
    delivered_at    timestamptz,
    tracking_number text,
    -- Cancelación
    cancelled_at    timestamptz,
    cancellation_reason text,
    -- Notas
    customer_notes  text,
    internal_notes  text,
    extra           jsonb not null default '{}'::jsonb,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    constraint uq_orders_number unique (agency_id, order_number)
);

create index idx_orders_agency_status on public.orders (agency_id, status, created_at desc);
create index idx_orders_lead on public.orders (lead_id, created_at desc);
create index idx_orders_unfulfilled on public.orders (agency_id, status)
    where status in ('paid', 'preparing');

-- ---------------------------------------------------------------------
-- order_items
-- ---------------------------------------------------------------------
create table public.order_items (
    id              uuid primary key default gen_random_uuid(),
    agency_id       uuid not null references public.agencies(id) on delete cascade,
    order_id        uuid not null references public.orders(id) on delete cascade,
    product_id      uuid references public.products(id) on delete restrict,
    variant_id      uuid references public.product_variants(id) on delete restrict,
    -- Snapshot al momento de la compra (el product puede cambiar después)
    product_name    text not null,
    variant_name    text,
    sku             text,
    quantity        integer not null check (quantity > 0),
    unit_price      numeric(12,2) not null,
    line_total      numeric(12,2) not null,          -- quantity * unit_price (denorm)
    notes           text,                            -- "sin cebolla", "envolver de regalo"
    created_at      timestamptz not null default now()
);

create index idx_order_items_order on public.order_items (order_id);

-- ---------------------------------------------------------------------
-- Trigger: recalcular order totals cuando cambian order_items
-- ---------------------------------------------------------------------
create or replace function app.recalculate_order_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    target_order_id uuid;
    new_subtotal numeric(12,2);
begin
    target_order_id := coalesce(NEW.order_id, OLD.order_id);

    select coalesce(sum(line_total), 0) into new_subtotal
    from public.order_items
    where order_id = target_order_id;

    update public.orders
       set subtotal = new_subtotal,
           total = new_subtotal - discount_amount + shipping_amount + tax_amount,
           updated_at = now()
     where id = target_order_id;

    return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists tg_recalc_order_totals on public.order_items;
create trigger tg_recalc_order_totals
    after insert or update or delete on public.order_items
    for each row execute function app.recalculate_order_totals();

-- ---------------------------------------------------------------------
-- Trigger: descontar stock cuando una orden pasa a 'paid'
-- ---------------------------------------------------------------------
create or replace function app.deduct_stock_on_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if NEW.status = 'paid' and (OLD.status is null or OLD.status != 'paid') then
        -- Descontar stock por item
        update public.products p
           set stock = p.stock - oi.quantity
          from public.order_items oi
         where oi.order_id = NEW.id
           and oi.product_id = p.id
           and p.track_stock = true
           and oi.variant_id is null;  -- solo si NO hay variant (variant tiene su propio stock)

        update public.product_variants pv
           set stock = pv.stock - oi.quantity
          from public.order_items oi
         where oi.order_id = NEW.id
           and oi.variant_id = pv.id;
    end if;
    return NEW;
end;
$$;

drop trigger if exists tg_deduct_stock on public.orders;
create trigger tg_deduct_stock
    after update of status on public.orders
    for each row execute function app.deduct_stock_on_paid();

-- ---------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------
do $$
declare
    t text;
begin
    foreach t in array array['product_categories', 'products', 'product_variants', 'orders']
    loop
        execute format('drop trigger if exists tg_touch_updated_at on public.%I', t);
        execute format('create trigger tg_touch_updated_at before update on public.%I for each row execute function app.touch_updated_at()', t);
    end loop;
end $$;

-- =====================================================================
-- FIN plug-ins/ecommerce.sql
-- =====================================================================
