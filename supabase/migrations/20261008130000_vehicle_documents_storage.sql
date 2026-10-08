-- Vehicle document attachments (ficha vehicular) on Supabase Storage.
-- Idempotent re-affirmation of the private bucket and RLS policies used by the
-- API (server-side service role) and by signed preview URLs.
-- Apply after:
--   20260520120000_active_modules_supabase_readiness.sql

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('vehicle-documents', 'vehicle-documents', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists vehicle_documents_storage_select on storage.objects;
create policy vehicle_documents_storage_select on storage.objects for select to authenticated
using (
  bucket_id = 'vehicle-documents'
  and app_private.is_company_member(app_private.storage_company_id(name))
  and app_private.has_company_module(app_private.storage_company_id(name), 'transporte')
);

drop policy if exists vehicle_documents_storage_admin_write on storage.objects;
create policy vehicle_documents_storage_admin_write on storage.objects for all to authenticated
using (
  bucket_id = 'vehicle-documents'
  and app_private.is_company_admin(app_private.storage_company_id(name))
  and app_private.has_company_module(app_private.storage_company_id(name), 'transporte')
)
with check (
  bucket_id = 'vehicle-documents'
  and app_private.is_company_admin(app_private.storage_company_id(name))
  and app_private.has_company_module(app_private.storage_company_id(name), 'transporte')
);
