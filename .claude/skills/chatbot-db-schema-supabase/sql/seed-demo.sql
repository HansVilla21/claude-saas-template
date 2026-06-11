-- =====================================================================
-- seed-demo.sql
-- Data de ejemplo MÍNIMA para validar que el schema funciona.
-- Genera 1 agency + 1 canal WhatsApp + 2 leads + 1 conversation + 3 mensajes.
--
-- IDEAL para correr DESPUÉS de 0001_core.sql + 0003_triggers_realtime.sql.
-- No requiere ningún plug-in.
--
-- Para validar plug-ins específicos, agregar al final del archivo
-- (ver bloques comentados al final).
-- =====================================================================

-- IDs fijos para que sean predecibles (re-correr borra y recrea)
do $$
declare
    v_agency_id   uuid := '00000000-0000-0000-0000-000000000001';
    v_channel_id  uuid := '00000000-0000-0000-0000-000000000010';
    v_lead1_id    uuid := '00000000-0000-0000-0000-000000000101';
    v_lead2_id    uuid := '00000000-0000-0000-0000-000000000102';
    v_conv1_id    uuid := '00000000-0000-0000-0000-000000000201';
    v_msg1_id     uuid := '00000000-0000-0000-0000-000000000301';
    v_msg2_id     uuid := '00000000-0000-0000-0000-000000000302';
    v_msg3_id     uuid := '00000000-0000-0000-0000-000000000303';
begin
    -- Limpiar si existe
    delete from public.messages       where agency_id = v_agency_id;
    delete from public.conversations  where agency_id = v_agency_id;
    delete from public.tasks          where agency_id = v_agency_id;
    delete from public.leads          where agency_id = v_agency_id;
    delete from public.agency_channels where agency_id = v_agency_id;
    delete from public.agencies       where id = v_agency_id;

    -- 1. Agency
    insert into public.agencies (id, slug, name, country_code, timezone, currency)
    values (v_agency_id, 'demo', 'Demo Chatbot', 'CR', 'America/Costa_Rica', 'CRC');

    -- 2. Canal WhatsApp conectado
    insert into public.agency_channels (id, agency_id, channel, phone_number, is_active)
    values (v_channel_id, v_agency_id, 'whatsapp', '+50688112233', true);

    -- 3. Leads
    insert into public.leads (id, agency_id, full_name, display_name, phone, wa_user_id, source, status)
    values
        (v_lead1_id, v_agency_id, 'Hans Villalobos', 'Hans',  '+50688217229', '50688217229', 'whatsapp', 'nuevo'),
        (v_lead2_id, v_agency_id, 'Maria Rodriguez', 'Maria', '+50689876543', '50689876543', 'whatsapp', 'contactado');

    -- 4. Conversación
    insert into public.conversations (id, agency_id, lead_id, channel, handler)
    values (v_conv1_id, v_agency_id, v_lead1_id, 'whatsapp', 'bot');

    -- 5. Mensajes (los triggers actualizarán last_message_at, unread_count, etc.)
    insert into public.messages (id, agency_id, conversation_id, lead_id, channel, direction, sender_kind, kind, body, external_id)
    values
        (v_msg1_id, v_agency_id, v_conv1_id, v_lead1_id, 'whatsapp', 'inbound',  'lead', 'text', 'Hola, info por favor', 'ext_001'),
        (v_msg2_id, v_agency_id, v_conv1_id, v_lead1_id, 'whatsapp', 'outbound', 'bot',  'text', 'Hola Hans! Soy Sofia. ¿En qué te ayudo?', 'ext_002'),
        (v_msg3_id, v_agency_id, v_conv1_id, v_lead1_id, 'whatsapp', 'inbound',  'lead', 'text', 'Quiero ver una propiedad', 'ext_003');

    raise notice 'Seed demo OK. Agency: %', v_agency_id;
    raise notice 'Conversation: %', v_conv1_id;
    raise notice 'Leads: %, %', v_lead1_id, v_lead2_id;
end $$;

-- ---------------------------------------------------------------------
-- Validaciones — correr a mano después para confirmar
-- ---------------------------------------------------------------------
-- select count(*) as agencies from public.agencies;                                 -- 1
-- select count(*) as channels from public.agency_channels;                          -- 1
-- select count(*) as leads from public.leads;                                       -- 2
-- select count(*) as conversations from public.conversations;                       -- 1
-- select count(*) as messages from public.messages;                                 -- 3
-- select last_message_at, last_message_preview, unread_count
--   from public.conversations
--  where id = '00000000-0000-0000-0000-000000000201';
-- -- last_message_preview debería ser "Quiero ver una propiedad", unread_count = 2

-- ---------------------------------------------------------------------
-- Data extra para plug-ins (descomentar el que aplique)
-- ---------------------------------------------------------------------

/*
-- Si cargaste plug-ins/reservas.sql:
insert into public.services (agency_id, name, category, duration_minutes, price)
values
  ('00000000-0000-0000-0000-000000000001', 'Limpieza dental',  'limpieza',  45, 25000),
  ('00000000-0000-0000-0000-000000000001', 'Corte de cabello', 'corte',     30, 8000),
  ('00000000-0000-0000-0000-000000000001', 'Masaje 1h',        'masaje',    60, 35000);
*/

/*
-- Si cargaste plug-ins/ecommerce.sql:
insert into public.product_categories (agency_id, name, slug)
values ('00000000-0000-0000-0000-000000000001', 'Ropa', 'ropa');

insert into public.products (agency_id, name, price, stock, sku)
values
  ('00000000-0000-0000-0000-000000000001', 'Camiseta básica',  8500,  50, 'CAM-001'),
  ('00000000-0000-0000-0000-000000000001', 'Jean clásico',     19500, 20, 'JEAN-001');
*/

/*
-- Si cargaste plug-ins/soporte.sql:
insert into public.ticket_categories (agency_id, name, slug, sla_first_response_hours)
values
  ('00000000-0000-0000-0000-000000000001', 'Facturación', 'billing',   4),
  ('00000000-0000-0000-0000-000000000001', 'Técnico',     'technical', 2),
  ('00000000-0000-0000-0000-000000000001', 'General',     'general',   8);
*/

/*
-- Si cargaste plug-ins/inmobiliaria.sql:
insert into public.properties (agency_id, codigo, titulo, tipo, operacion, precio, moneda, canton, dormitorios, status)
values
  ('00000000-0000-0000-0000-000000000001', 'CR-DEMO-001', 'Casa demo Escazú', 'casa', 'venta', 485000, 'USD', 'Escazú', 3, 'disponible'),
  ('00000000-0000-0000-0000-000000000001', 'CR-DEMO-002', 'Apto demo Santa Ana', 'apartamento', 'venta', 250000, 'USD', 'Santa Ana', 2, 'disponible');
*/

-- =====================================================================
-- FIN seed-demo.sql
-- =====================================================================
