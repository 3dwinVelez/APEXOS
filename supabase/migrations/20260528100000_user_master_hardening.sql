-- User master hardening.
-- Non-destructive foundation for user profile extensions, documents and audit.

alter table public.employees
  add column if not exists user_id uuid references public.profiles(id) on delete set null,
  add column if not exists employee_code text,
  add column if not exists user_type text,
  add column if not exists position_code text,
  add column if not exists area_code text,
  add column if not exists location_code text,
  add column if not exists cost_center_code text,
  add column if not exists contract_type_code text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create unique index if not exists employees_company_user_unique
on public.employees(company_id, user_id)
where user_id is not null;

create unique index if not exists employees_company_employee_code_unique
on public.employees(company_id, employee_code)
where employee_code is not null;

create table if not exists public.user_master_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  document_type text not null,
  file_name text not null,
  file_url text,
  storage_path text,
  mime_type text,
  file_size int,
  status text not null default 'pending',
  uploaded_by uuid references public.profiles(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  reviewed_at timestamptz,
  observations text,
  metadata jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_master_documents_status_check check (status in ('pending', 'approved', 'rejected', 'expired', 'replaced'))
);

create index if not exists idx_user_master_documents_company_user
on public.user_master_documents(company_id, user_id, active);

create index if not exists idx_user_master_documents_company_type
on public.user_master_documents(company_id, document_type, status);

create table if not exists public.user_master_audit_events (
  id bigserial primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  field text,
  old_value jsonb,
  new_value jsonb,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_master_audit_company_user
on public.user_master_audit_events(company_id, user_id, created_at desc);

alter table public.user_master_documents enable row level security;
alter table public.user_master_audit_events enable row level security;

drop policy if exists user_master_documents_select_scoped on public.user_master_documents;
create policy user_master_documents_select_scoped on public.user_master_documents
for select to authenticated
using (
  app_private.is_company_admin(company_id)
  or user_id = auth.uid()
);

drop policy if exists user_master_documents_write_admin on public.user_master_documents;
create policy user_master_documents_write_admin on public.user_master_documents
for all to authenticated
using (app_private.is_company_admin(company_id))
with check (app_private.is_company_admin(company_id));

drop policy if exists user_master_audit_select_admin on public.user_master_audit_events;
create policy user_master_audit_select_admin on public.user_master_audit_events
for select to authenticated
using (
  app_private.is_company_admin(company_id)
  or user_id = auth.uid()
);

drop policy if exists user_master_audit_insert_admin on public.user_master_audit_events;
create policy user_master_audit_insert_admin on public.user_master_audit_events
for insert to authenticated
with check (app_private.is_company_admin(company_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('user-documents', 'user-documents', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists user_documents_storage_admin_access on storage.objects;
drop policy if exists user_documents_storage_select_scoped on storage.objects;
create policy user_documents_storage_select_scoped on storage.objects
for select to authenticated
using (
  bucket_id = 'user-documents'
  and (
    app_private.is_company_admin(app_private.storage_company_id(name))
    or (
      array_length(string_to_array(name, '/'), 1) >= 2
      and (string_to_array(name, '/'))[2] = auth.uid()::text
    )
  )
);

create policy user_documents_storage_admin_access on storage.objects
for all to authenticated
using (
  bucket_id = 'user-documents'
  and app_private.is_company_admin(app_private.storage_company_id(name))
)
with check (
  bucket_id = 'user-documents'
  and app_private.is_company_admin(app_private.storage_company_id(name))
);

with catalogs(code, name, description, scope, sort_order) as (
  values
    ('user_statuses', 'Estados de usuario', 'Estados funcionales del maestro de usuarios.', 'global', 110),
    ('positions', 'Cargos', 'Cargos o puestos parametrizables por empresa.', 'company', 120),
    ('areas', 'Areas', 'Areas o departamentos por empresa.', 'company', 130),
    ('locations', 'Sedes', 'Sedes operativas por empresa.', 'company', 140),
    ('cost_centers', 'Centros de costo', 'Centros de costo por empresa.', 'company', 150),
    ('contract_types', 'Tipos de contrato', 'Tipos de vinculo laboral o contractual.', 'mixed', 160),
    ('work_shifts', 'Turnos o jornadas', 'Turnos base para marcacion y operacion.', 'company', 170),
    ('user_document_types', 'Tipos documentales de usuario', 'Documentos requeridos para ficha de usuario.', 'mixed', 180)
)
insert into public.master_catalogs (code, name, description, scope, sort_order)
select code, name, description, scope, sort_order
from catalogs
on conflict do nothing;

with items(catalog_code, code, name, sort_order) as (
  values
    ('user_statuses', 'activo', 'Activo', 10),
    ('user_statuses', 'inactivo', 'Inactivo', 20),
    ('user_statuses', 'suspendido', 'Suspendido', 30),
    ('user_statuses', 'bloqueado', 'Bloqueado', 40),
    ('contract_types', 'indefinite', 'Indefinido', 10),
    ('contract_types', 'fixed', 'Termino fijo', 20),
    ('contract_types', 'service', 'Prestacion de servicios', 30),
    ('contract_types', 'temporary', 'Temporal', 40),
    ('user_document_types', 'identity', 'Documento de identidad', 10),
    ('user_document_types', 'contract', 'Contrato', 20),
    ('user_document_types', 'license', 'Licencia de conduccion', 30),
    ('user_document_types', 'social_security', 'Seguridad social', 40),
    ('user_document_types', 'bank_certificate', 'Certificado bancario', 50),
    ('user_document_types', 'occupational_exam', 'Examen medico ocupacional', 60)
)
insert into public.master_catalog_items (catalog_id, code, name, sort_order)
select c.id, i.code, i.name, i.sort_order
from items i
join public.master_catalogs c on c.code = i.catalog_code and c.company_id is null
on conflict do nothing;
