-- Active modules operational readiness for Supabase.
-- Scope: non-destructive RLS/storage hardening for currently active APEX-OS modules.
-- Apply after:
--   20260518123000_operational_field_service_foundation.sql
--   20260519090000_vehicle_master_record.sql
--   20260519103000_route_preoperational_checklist.sql

create extension if not exists pgcrypto;

grant usage on schema app_private to authenticated, service_role;
grant execute on all functions in schema app_private to authenticated, service_role;

create or replace function app_private.storage_company_id(object_name text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  first_segment text;
  second_segment text;
begin
  first_segment := split_part(object_name, '/', 1);
  second_segment := split_part(object_name, '/', 2);

  if first_segment = 'company' then
    return app_private.uuid_or_null(second_segment);
  end if;

  return app_private.uuid_or_null(first_segment);
end;
$$;

revoke all on function app_private.storage_company_id(text) from public, anon;
grant execute on function app_private.storage_company_id(text) to authenticated, service_role;

-- Preoperational child tables had RLS enabled but no child policies in the previous migration.
drop policy if exists preop_answers_member_select on public.route_preoperational_checklist_answers;
create policy preop_answers_member_select on public.route_preoperational_checklist_answers for select to authenticated
using (app_private.is_company_member(company_id) and app_private.has_company_module(company_id, 'talento_humano'));

drop policy if exists preop_answers_member_write on public.route_preoperational_checklist_answers;
create policy preop_answers_member_write on public.route_preoperational_checklist_answers for all to authenticated
using (app_private.is_company_member(company_id) and app_private.has_company_module(company_id, 'talento_humano'))
with check (app_private.is_company_member(company_id) and app_private.has_company_module(company_id, 'talento_humano'));

drop policy if exists preop_evidence_member_select on public.route_preoperational_checklist_evidence;
create policy preop_evidence_member_select on public.route_preoperational_checklist_evidence for select to authenticated
using (app_private.is_company_member(company_id) and app_private.has_company_module(company_id, 'talento_humano'));

drop policy if exists preop_evidence_member_write on public.route_preoperational_checklist_evidence;
create policy preop_evidence_member_write on public.route_preoperational_checklist_evidence for all to authenticated
using (app_private.is_company_member(company_id) and app_private.has_company_module(company_id, 'talento_humano'))
with check (app_private.is_company_member(company_id) and app_private.has_company_module(company_id, 'talento_humano'));

drop policy if exists preop_findings_member_select on public.route_preoperational_findings;
create policy preop_findings_member_select on public.route_preoperational_findings for select to authenticated
using (app_private.is_company_member(company_id) and app_private.has_company_module(company_id, 'talento_humano'));

drop policy if exists preop_findings_member_write on public.route_preoperational_findings;
create policy preop_findings_member_write on public.route_preoperational_findings for all to authenticated
using (app_private.is_company_member(company_id) and app_private.has_company_module(company_id, 'talento_humano'))
with check (app_private.is_company_member(company_id) and app_private.has_company_module(company_id, 'talento_humano'));

drop policy if exists route_authorizations_member_select on public.route_start_authorizations;
create policy route_authorizations_member_select on public.route_start_authorizations for select to authenticated
using (app_private.is_company_member(company_id) and app_private.has_company_module(company_id, 'talento_humano'));

drop policy if exists route_authorizations_admin_write on public.route_start_authorizations;
create policy route_authorizations_admin_write on public.route_start_authorizations for all to authenticated
using (app_private.is_company_admin(company_id) and app_private.has_company_module(company_id, 'talento_humano'))
with check (app_private.is_company_admin(company_id) and app_private.has_company_module(company_id, 'talento_humano'));

drop policy if exists route_block_events_member_select on public.route_block_events;
create policy route_block_events_member_select on public.route_block_events for select to authenticated
using (app_private.is_company_member(company_id) and app_private.has_company_module(company_id, 'talento_humano'));

drop policy if exists route_block_events_member_write on public.route_block_events;
create policy route_block_events_member_write on public.route_block_events for all to authenticated
using (app_private.is_company_member(company_id) and app_private.has_company_module(company_id, 'talento_humano'))
with check (app_private.is_company_member(company_id) and app_private.has_company_module(company_id, 'talento_humano'));

grant select, insert, update, delete on
  public.route_preoperational_checklist_answers,
  public.route_preoperational_checklist_evidence,
  public.route_preoperational_findings,
  public.route_start_authorizations,
  public.route_block_events
to authenticated;

create index if not exists idx_preop_answers_checklist on public.route_preoperational_checklist_answers(company_id, checklist_id);
create index if not exists idx_preop_evidence_checklist on public.route_preoperational_checklist_evidence(company_id, checklist_id);
create index if not exists idx_route_block_events_company_severity on public.route_block_events(company_id, severity, created_at);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('vehicle-documents', 'vehicle-documents', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']),
  ('user-documents', 'user-documents', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']),
  ('route-evidence', 'route-evidence', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']),
  ('general-attachments', 'general-attachments', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/csv']),
  ('accounting-documents', 'accounting-documents', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/csv', 'application/xml'])
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

drop policy if exists user_documents_storage_admin_access on storage.objects;
create policy user_documents_storage_admin_access on storage.objects for all to authenticated
using (
  bucket_id = 'user-documents'
  and app_private.is_company_admin(app_private.storage_company_id(name))
  and app_private.has_company_module(app_private.storage_company_id(name), 'talento_humano')
)
with check (
  bucket_id = 'user-documents'
  and app_private.is_company_admin(app_private.storage_company_id(name))
  and app_private.has_company_module(app_private.storage_company_id(name), 'talento_humano')
);

drop policy if exists route_evidence_storage_member_access on storage.objects;
create policy route_evidence_storage_member_access on storage.objects for all to authenticated
using (
  bucket_id = 'route-evidence'
  and app_private.is_company_member(app_private.storage_company_id(name))
  and app_private.has_company_module(app_private.storage_company_id(name), 'talento_humano')
)
with check (
  bucket_id = 'route-evidence'
  and app_private.is_company_member(app_private.storage_company_id(name))
  and app_private.has_company_module(app_private.storage_company_id(name), 'talento_humano')
);

drop policy if exists general_attachments_storage_select on storage.objects;
create policy general_attachments_storage_select on storage.objects for select to authenticated
using (
  bucket_id = 'general-attachments'
  and app_private.is_company_member(app_private.storage_company_id(name))
);

drop policy if exists general_attachments_storage_admin_write on storage.objects;
create policy general_attachments_storage_admin_write on storage.objects for all to authenticated
using (
  bucket_id = 'general-attachments'
  and app_private.is_company_admin(app_private.storage_company_id(name))
)
with check (
  bucket_id = 'general-attachments'
  and app_private.is_company_admin(app_private.storage_company_id(name))
);

drop policy if exists accounting_documents_storage_admin_access on storage.objects;
create policy accounting_documents_storage_admin_access on storage.objects for all to authenticated
using (
  bucket_id = 'accounting-documents'
  and app_private.is_company_admin(app_private.storage_company_id(name))
  and app_private.has_company_module(app_private.storage_company_id(name), 'contabilidad')
)
with check (
  bucket_id = 'accounting-documents'
  and app_private.is_company_admin(app_private.storage_company_id(name))
  and app_private.has_company_module(app_private.storage_company_id(name), 'contabilidad')
);
