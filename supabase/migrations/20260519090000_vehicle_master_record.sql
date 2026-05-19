-- Vehicle master record foundation.
-- Scope: master data, documents, calculated documentary status and audit. Operational route/checklist logic remains outside this module.

alter table public.vehicles
  add column if not exists category text,
  add column if not exists line text,
  add column if not exists vin_chassis text,
  add column if not exists engine_number text,
  add column if not exists engine_displacement text,
  add column if not exists cylinder_capacity text,
  add column if not exists fuel text,
  add column if not exists body_type text,
  add column if not exists axle_count int,
  add column if not exists load_capacity text,
  add column if not exists capacity_value numeric,
  add column if not exists capacity_unit text,
  add column if not exists volume_available numeric,
  add column if not exists soat_issued_at date,
  add column if not exists soat_expires date,
  add column if not exists technical_review_issued_at date,
  add column if not exists technical_review_expires date,
  add column if not exists property_card text,
  add column if not exists contractual_policy_expires date,
  add column if not exists extra_contractual_policy_expires date,
  add column if not exists insurance_expires date,
  add column if not exists cargo_registry text,
  add column if not exists special_permits text,
  add column if not exists normative_restrictions text,
  add column if not exists ownership_type text,
  add column if not exists legal_owner text,
  add column if not exists owner_document text,
  add column if not exists linked_company text,
  add column if not exists cost_center text,
  add column if not exists base_site text,
  add column if not exists authorized_driver_id uuid references public.employees(id) on delete set null,
  add column if not exists authorized_driver_name text,
  add column if not exists authorized_driver_document text,
  add column if not exists authorized_driver_code text,
  add column if not exists linked_at date,
  add column if not exists unlinked_at date,
  add column if not exists legal_notes text,
  add column if not exists master_status text default 'pendiente_documentacion',
  add column if not exists document_status text default 'pendiente_documentacion',
  add column if not exists master_score int default 0,
  add column if not exists critical_expiry_at date,
  add column if not exists active boolean default true,
  add column if not exists deleted_at timestamptz;

create table if not exists public.vehicle_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  plate text not null,
  document_type text not null,
  file_name text not null,
  file_url text,
  storage_path text,
  base64_data text,
  mime_type text,
  file_size int,
  issued_at date,
  expires_at date,
  document_status text default 'pendiente_validacion',
  uploaded_by uuid references public.profiles(id) on delete set null,
  validated_by uuid references public.profiles(id) on delete set null,
  uploaded_at timestamptz default now(),
  validated_at timestamptz,
  observations text,
  version int default 1,
  active boolean default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.vehicle_master_audit_log (
  id bigserial primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  plate text not null,
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  field text,
  old_value jsonb,
  new_value jsonb,
  reason text,
  created_at timestamptz default now()
);

create index if not exists idx_vehicles_company_master_status on public.vehicles(company_id, master_status);
create index if not exists idx_vehicles_company_base_site on public.vehicles(company_id, base_site);
create index if not exists idx_vehicles_company_driver on public.vehicles(company_id, authorized_driver_id);
create index if not exists idx_vehicles_company_ownership on public.vehicles(company_id, ownership_type);
create index if not exists idx_vehicles_company_score on public.vehicles(company_id, master_score);
create index if not exists idx_vehicles_company_vin on public.vehicles(company_id, vin_chassis);
create index if not exists idx_vehicle_documents_company_vehicle on public.vehicle_documents(company_id, vehicle_id);
create index if not exists idx_vehicle_documents_company_plate on public.vehicle_documents(company_id, plate);
create index if not exists idx_vehicle_documents_expiry on public.vehicle_documents(company_id, document_type, expires_at);
create index if not exists idx_vehicle_master_audit_vehicle on public.vehicle_master_audit_log(company_id, vehicle_id, created_at);

alter table public.vehicle_documents enable row level security;
alter table public.vehicle_master_audit_log enable row level security;

drop policy if exists vehicle_documents_select_member on public.vehicle_documents;
create policy vehicle_documents_select_member on public.vehicle_documents for select to authenticated
using (app_private.is_company_member(company_id) and app_private.has_company_module(company_id, 'transporte'));

drop policy if exists vehicle_documents_write_admin on public.vehicle_documents;
create policy vehicle_documents_write_admin on public.vehicle_documents for all to authenticated
using (app_private.is_company_admin(company_id) and app_private.has_company_module(company_id, 'transporte'))
with check (app_private.is_company_admin(company_id) and app_private.has_company_module(company_id, 'transporte'));

drop policy if exists vehicle_audit_select_member on public.vehicle_master_audit_log;
create policy vehicle_audit_select_member on public.vehicle_master_audit_log for select to authenticated
using (app_private.is_company_member(company_id) and app_private.has_company_module(company_id, 'transporte'));

drop trigger if exists trg_vehicle_documents_updated_at on public.vehicle_documents;
create trigger trg_vehicle_documents_updated_at before update on public.vehicle_documents for each row execute function public.update_updated_at_column();
