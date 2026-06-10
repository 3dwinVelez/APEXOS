-- Keep service evidence in private Storage. Database rows contain metadata only.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'service-images',
  'service-images',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function app_private.reject_service_evidence_data_uri()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(new.file_url, '') like 'data:%;base64,%' then
    raise exception 'Service evidence must be uploaded to private Storage';
  end if;
  return new;
end;
$$;

revoke all on function app_private.reject_service_evidence_data_uri() from public, anon, authenticated;
grant execute on function app_private.reject_service_evidence_data_uri() to service_role;

drop trigger if exists trg_service_evidence_reject_data_uri on public.service_evidence;
create trigger trg_service_evidence_reject_data_uri
before insert or update of file_url on public.service_evidence
for each row execute function app_private.reject_service_evidence_data_uri();

comment on column public.service_evidence.file_url is
  'Optional external URL only. Data URIs are rejected; use storage_bucket/storage_path for private evidence.';
