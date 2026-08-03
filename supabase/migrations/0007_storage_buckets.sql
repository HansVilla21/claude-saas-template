-- =====================================================================
-- 0007_storage_buckets.sql
-- Create Storage buckets + RLS policies for storage.objects.
-- Path convention: every object lives under <agency_id>/... so isolation
-- is BOTH physical (path) and logical (RLS).
--
-- Buckets:
--   lead-documents   private  -- cedulas, contratos, cartas de pre-aprobacion
--   property-images  public   -- public read for portal; write membership-checked
--   agency-branding  public   -- logo, color assets; public read; write owners/admins
-- =====================================================================

insert into storage.buckets (id, name, public)
values
    ('lead-documents',  'lead-documents',  false),
    ('property-images', 'property-images', true),
    ('agency-branding', 'agency-branding', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- lead-documents (PRIVATE)
-- Path: lead-documents/<agency_id>/...
-- All members can read/write within their agency_id prefix.
-- ---------------------------------------------------------------------
create policy "members read lead-documents"
    on storage.objects for select to authenticated
    using (
        bucket_id = 'lead-documents'
        and app.is_agency_member( ((storage.foldername(name))[1])::uuid )
    );

create policy "members upload lead-documents"
    on storage.objects for insert to authenticated
    with check (
        bucket_id = 'lead-documents'
        and app.is_agency_member( ((storage.foldername(name))[1])::uuid )
    );

create policy "members update lead-documents"
    on storage.objects for update to authenticated
    using (
        bucket_id = 'lead-documents'
        and app.is_agency_member( ((storage.foldername(name))[1])::uuid )
    )
    with check (
        bucket_id = 'lead-documents'
        and app.is_agency_member( ((storage.foldername(name))[1])::uuid )
    );

create policy "members delete lead-documents"
    on storage.objects for delete to authenticated
    using (
        bucket_id = 'lead-documents'
        and app.is_agency_member( ((storage.foldername(name))[1])::uuid )
    );

-- ---------------------------------------------------------------------
-- property-images (PUBLIC read, member write)
-- Path: property-images/<agency_id>/<property_id>/...
-- ---------------------------------------------------------------------
-- Public read is implicit (bucket.public = true) but we add an explicit
-- anon policy for clarity & defense-in-depth.
create policy "anon read property-images"
    on storage.objects for select to anon
    using (bucket_id = 'property-images');

create policy "members read property-images"
    on storage.objects for select to authenticated
    using (bucket_id = 'property-images');

create policy "members upload property-images"
    on storage.objects for insert to authenticated
    with check (
        bucket_id = 'property-images'
        and app.is_agency_member( ((storage.foldername(name))[1])::uuid )
    );

create policy "members update property-images"
    on storage.objects for update to authenticated
    using (
        bucket_id = 'property-images'
        and app.is_agency_member( ((storage.foldername(name))[1])::uuid )
    )
    with check (
        bucket_id = 'property-images'
        and app.is_agency_member( ((storage.foldername(name))[1])::uuid )
    );

create policy "members delete property-images"
    on storage.objects for delete to authenticated
    using (
        bucket_id = 'property-images'
        and app.is_agency_member( ((storage.foldername(name))[1])::uuid )
    );

-- ---------------------------------------------------------------------
-- agency-branding (PUBLIC read, owner/admin write)
-- Path: agency-branding/<agency_id>/...
-- ---------------------------------------------------------------------
create policy "anon read agency-branding"
    on storage.objects for select to anon
    using (bucket_id = 'agency-branding');

create policy "members read agency-branding"
    on storage.objects for select to authenticated
    using (bucket_id = 'agency-branding');

create policy "owners and admins upload agency-branding"
    on storage.objects for insert to authenticated
    with check (
        bucket_id = 'agency-branding'
        and app.agency_role( ((storage.foldername(name))[1])::uuid ) in ('owner','admin')
    );

create policy "owners and admins update agency-branding"
    on storage.objects for update to authenticated
    using (
        bucket_id = 'agency-branding'
        and app.agency_role( ((storage.foldername(name))[1])::uuid ) in ('owner','admin')
    )
    with check (
        bucket_id = 'agency-branding'
        and app.agency_role( ((storage.foldername(name))[1])::uuid ) in ('owner','admin')
    );

create policy "owners and admins delete agency-branding"
    on storage.objects for delete to authenticated
    using (
        bucket_id = 'agency-branding'
        and app.agency_role( ((storage.foldername(name))[1])::uuid ) in ('owner','admin')
    );
