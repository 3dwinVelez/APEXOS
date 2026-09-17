-- Authoritative evidence upload quarantine.
-- Objects remain unreadable to authenticated clients until the API validates and
-- promotes them to the existing company/order path.
alter table public.evidence_upload_authorizations enable row level security;

drop policy if exists evidence_upload_authorizations_owner_select
  on public.evidence_upload_authorizations;
create policy evidence_upload_authorizations_owner_select
  on public.evidence_upload_authorizations
  for select to authenticated
  using (
    supabase_user_id = auth.uid()::text
    and case
      when tenant_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then app_private.is_company_member(tenant_id::uuid)
      else false
    end
  );

revoke insert, update, delete on public.evidence_upload_authorizations from authenticated;
grant select on public.evidence_upload_authorizations to authenticated;
grant all on public.evidence_upload_authorizations to service_role;

drop policy if exists service_images_quarantine_read_block
  on storage.objects;
create policy service_images_quarantine_read_block
  on storage.objects
  as restrictive
  for select to authenticated
  using (
    bucket_id <> 'service-images'
    or (storage.foldername(name))[1] <> '_quarantine'
  );

drop policy if exists service_images_authorized_quarantine_insert
  on storage.objects;
create policy service_images_authorized_quarantine_insert
  on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'service-images'
    and (storage.foldername(name))[1] = '_quarantine'
    and exists (
      select 1
      from public.evidence_upload_authorizations eua
      where eua.quarantine_path = name
        and eua.supabase_user_id = auth.uid()::text
        and eua.status = 'authorized'
        and eua.expires_at > now()
    )
  );

drop policy if exists service_images_quarantine_update
  on storage.objects;
create policy service_images_quarantine_update
  on storage.objects
  for update to authenticated
  using (false)
  with check (false);

drop policy if exists service_images_quarantine_delete
  on storage.objects;
create policy service_images_quarantine_delete
  on storage.objects
  for delete to authenticated
  using (false);
