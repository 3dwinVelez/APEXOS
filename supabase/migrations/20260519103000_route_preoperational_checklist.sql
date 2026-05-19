-- Route planning preoperational checklist foundation.
-- Scope: PESV/SST daily preoperational records, evidence, findings, route authorization and block events.
-- This belongs to Route Planning, not to the vehicle master.

alter table public.employees
  add column if not exists user_type text default 'operario';

create table if not exists public.route_preoperational_checklists (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  route_id uuid references public.operational_routes(id) on delete set null,
  shift_id uuid,
  punch_id uuid references public.time_punches(id) on delete set null,
  driver_id uuid references public.employees(id) on delete set null,
  driver_name text,
  user_id uuid references public.profiles(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  plate text not null,
  sede text,
  checklist_status text default 'pendiente',
  risk_level text default 'sin_riesgo',
  started_at timestamptz default now(),
  completed_at timestamptz,
  approved_at timestamptz,
  blocked_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  location_lat numeric,
  location_lng numeric,
  digital_signature text,
  mileage_initial int,
  fuel_level text,
  observations text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.route_preoperational_checklist_answers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  checklist_id uuid not null references public.route_preoperational_checklists(id) on delete cascade,
  section text not null,
  item_key text not null,
  label text not null,
  answer text not null,
  severity text not null,
  blocks_route boolean default false,
  evidence_required boolean default false,
  observations text,
  created_at timestamptz default now()
);

create table if not exists public.route_preoperational_checklist_evidence (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  checklist_id uuid not null references public.route_preoperational_checklists(id) on delete cascade,
  item_key text,
  evidence_type text not null,
  file_name text not null,
  file_url text,
  storage_path text,
  base64_data text,
  mime_type text,
  file_size int,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.route_preoperational_findings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  checklist_id uuid not null references public.route_preoperational_checklists(id) on delete cascade,
  route_id uuid references public.operational_routes(id) on delete set null,
  plate text not null,
  driver_id uuid references public.employees(id) on delete set null,
  item_key text,
  finding_type text not null,
  severity text not null,
  description text not null,
  action_taken text,
  status text default 'abierta',
  responsible text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.route_start_authorizations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  route_id uuid references public.operational_routes(id) on delete set null,
  checklist_id uuid references public.route_preoperational_checklists(id) on delete set null,
  driver_id uuid references public.employees(id) on delete set null,
  plate text not null,
  status text default 'bloqueada',
  reason text,
  authorized_by uuid references public.profiles(id) on delete set null,
  authorized_at timestamptz,
  created_at timestamptz default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.route_block_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  route_id uuid references public.operational_routes(id) on delete set null,
  checklist_id uuid references public.route_preoperational_checklists(id) on delete set null,
  driver_id uuid references public.employees(id) on delete set null,
  plate text not null,
  reason text not null,
  severity text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_preop_checklists_route_status on public.route_preoperational_checklists(company_id, route_id, checklist_status);
create index if not exists idx_preop_checklists_driver on public.route_preoperational_checklists(company_id, driver_id, started_at);
create index if not exists idx_preop_findings_severity on public.route_preoperational_findings(company_id, severity, status);
create index if not exists idx_route_start_authorizations_status on public.route_start_authorizations(company_id, route_id, status);
create index if not exists idx_route_block_events_route on public.route_block_events(company_id, route_id, created_at);

alter table public.route_preoperational_checklists enable row level security;
alter table public.route_preoperational_checklist_answers enable row level security;
alter table public.route_preoperational_checklist_evidence enable row level security;
alter table public.route_preoperational_findings enable row level security;
alter table public.route_start_authorizations enable row level security;
alter table public.route_block_events enable row level security;

drop policy if exists preop_member_select on public.route_preoperational_checklists;
create policy preop_member_select on public.route_preoperational_checklists for select to authenticated
using (app_private.is_company_member(company_id) and app_private.has_company_module(company_id, 'talento_humano'));

drop policy if exists preop_admin_write on public.route_preoperational_checklists;
create policy preop_admin_write on public.route_preoperational_checklists for all to authenticated
using (app_private.is_company_member(company_id) and app_private.has_company_module(company_id, 'talento_humano'))
with check (app_private.is_company_member(company_id) and app_private.has_company_module(company_id, 'talento_humano'));
