-- Configure private image storage for APEX OS QA.

alter table public.companies
add column if not exists logo_url text;

alter table public.services
add column if not exists image_url text;

create or replace function app_private.uuid_or_null(value text)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
begin
  return value::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('company-assets', 'company-assets', false, 2097152, array['image/png', 'image/jpeg', 'image/webp']),
  ('user-avatars', 'user-avatars', false, 2097152, array['image/png', 'image/jpeg', 'image/webp']),
  ('service-images', 'service-images', false, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists company_assets_select_member on storage.objects;
create policy company_assets_select_member
on storage.objects
for select
to authenticated
using (
  bucket_id = 'company-assets'
  and app_private.is_company_member(app_private.uuid_or_null(split_part(name, '/', 1)))
);

drop policy if exists company_assets_insert_admin on storage.objects;
create policy company_assets_insert_admin
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'company-assets'
  and app_private.is_company_admin(app_private.uuid_or_null(split_part(name, '/', 1)))
);

drop policy if exists company_assets_update_admin on storage.objects;
create policy company_assets_update_admin
on storage.objects
for update
to authenticated
using (
  bucket_id = 'company-assets'
  and app_private.is_company_admin(app_private.uuid_or_null(split_part(name, '/', 1)))
)
with check (
  bucket_id = 'company-assets'
  and app_private.is_company_admin(app_private.uuid_or_null(split_part(name, '/', 1)))
);

drop policy if exists company_assets_delete_admin on storage.objects;
create policy company_assets_delete_admin
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'company-assets'
  and app_private.is_company_admin(app_private.uuid_or_null(split_part(name, '/', 1)))
);

drop policy if exists user_avatars_select_company_related on storage.objects;
create policy user_avatars_select_company_related
on storage.objects
for select
to authenticated
using (
  bucket_id = 'user-avatars'
  and app_private.is_company_member(app_private.uuid_or_null(split_part(name, '/', 1)))
);

drop policy if exists user_avatars_insert_self_or_admin on storage.objects;
create policy user_avatars_insert_self_or_admin
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'user-avatars'
  and app_private.is_company_member(app_private.uuid_or_null(split_part(name, '/', 1)))
  and (
    app_private.uuid_or_null(split_part(name, '/', 2)) = auth.uid()
    or app_private.is_company_admin(app_private.uuid_or_null(split_part(name, '/', 1)))
  )
);

drop policy if exists user_avatars_update_self_or_admin on storage.objects;
create policy user_avatars_update_self_or_admin
on storage.objects
for update
to authenticated
using (
  bucket_id = 'user-avatars'
  and app_private.is_company_member(app_private.uuid_or_null(split_part(name, '/', 1)))
  and (
    app_private.uuid_or_null(split_part(name, '/', 2)) = auth.uid()
    or app_private.is_company_admin(app_private.uuid_or_null(split_part(name, '/', 1)))
  )
)
with check (
  bucket_id = 'user-avatars'
  and app_private.is_company_member(app_private.uuid_or_null(split_part(name, '/', 1)))
  and (
    app_private.uuid_or_null(split_part(name, '/', 2)) = auth.uid()
    or app_private.is_company_admin(app_private.uuid_or_null(split_part(name, '/', 1)))
  )
);

drop policy if exists user_avatars_delete_self_or_admin on storage.objects;
create policy user_avatars_delete_self_or_admin
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'user-avatars'
  and app_private.is_company_member(app_private.uuid_or_null(split_part(name, '/', 1)))
  and (
    app_private.uuid_or_null(split_part(name, '/', 2)) = auth.uid()
    or app_private.is_company_admin(app_private.uuid_or_null(split_part(name, '/', 1)))
  )
);

drop policy if exists service_images_select_member_enabled on storage.objects;
create policy service_images_select_member_enabled
on storage.objects
for select
to authenticated
using (
  bucket_id = 'service-images'
  and app_private.is_company_member(app_private.uuid_or_null(split_part(name, '/', 1)))
  and app_private.has_company_module(app_private.uuid_or_null(split_part(name, '/', 1)), 'servicios')
);

drop policy if exists service_images_insert_admin_enabled on storage.objects;
create policy service_images_insert_admin_enabled
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'service-images'
  and app_private.is_company_admin(app_private.uuid_or_null(split_part(name, '/', 1)))
  and app_private.has_company_module(app_private.uuid_or_null(split_part(name, '/', 1)), 'servicios')
);

drop policy if exists service_images_update_admin_enabled on storage.objects;
create policy service_images_update_admin_enabled
on storage.objects
for update
to authenticated
using (
  bucket_id = 'service-images'
  and app_private.is_company_admin(app_private.uuid_or_null(split_part(name, '/', 1)))
  and app_private.has_company_module(app_private.uuid_or_null(split_part(name, '/', 1)), 'servicios')
)
with check (
  bucket_id = 'service-images'
  and app_private.is_company_admin(app_private.uuid_or_null(split_part(name, '/', 1)))
  and app_private.has_company_module(app_private.uuid_or_null(split_part(name, '/', 1)), 'servicios')
);

drop policy if exists service_images_delete_admin_enabled on storage.objects;
create policy service_images_delete_admin_enabled
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'service-images'
  and app_private.is_company_admin(app_private.uuid_or_null(split_part(name, '/', 1)))
  and app_private.has_company_module(app_private.uuid_or_null(split_part(name, '/', 1)), 'servicios')
);
