-- =====================================================================
-- 0003_rls_enable.sql
-- Enable Row Level Security on every table.
-- Policies are added in 0004; until then, only service_role can access.
-- =====================================================================

-- Tenant-scoped business tables (have agency_id)
alter table public.agencies               enable row level security;
alter table public.agency_members         enable row level security;
alter table public.whatsapp_numbers       enable row level security;
alter table public.properties             enable row level security;
alter table public.leads                  enable row level security;
alter table public.tags                   enable row level security;
alter table public.lead_tags              enable row level security;
alter table public.lead_property_interest enable row level security;
alter table public.conversations          enable row level security;
alter table public.messages               enable row level security;
alter table public.tasks                  enable row level security;
alter table public.documents              enable row level security;
alter table public.events                 enable row level security;
alter table public.audit_log              enable row level security;

-- User-scoped (not tenant)
alter table public.profiles               enable row level security;

-- Global catalog (no agency_id, but still RLS for safety)
alter table public.whatsapp_templates     enable row level security;
