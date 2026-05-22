-- APEXOS Projects Module - MODELO APEX.
-- Non destructive: creates operational project tables if they do not exist.

create table if not exists public."Project" (
  id serial primary key,
  tenant_id text not null,
  code text not null,
  name text not null,
  objective text not null,
  status text not null default 'pendiente',
  priority text not null default 'media',
  owner_id integer,
  owner_name text,
  start_date timestamptz,
  target_date timestamptz,
  closed_at timestamptz,
  apex_score integer not null default 0,
  score_status text not null default 'estable',
  progress integer not null default 0,
  validated_progress integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "Project_tenant_id_code_key" unique (tenant_id, code),
  constraint "Project_status_check" check (status in ('pendiente', 'activo', 'bloqueado', 'validacion', 'finalizado'))
);

create table if not exists public."ProjectCommitment" (
  id serial primary key,
  tenant_id text not null,
  project_id integer not null references public."Project"(id) on delete cascade,
  title text not null,
  description text,
  responsible_id integer,
  responsible_name text,
  priority text not null default 'media',
  target_date timestamptz,
  status text not null default 'pendiente',
  validated_at timestamptz,
  closed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "ProjectCommitment_status_check" check (status in ('pendiente', 'activo', 'bloqueado', 'validacion', 'finalizado'))
);

create table if not exists public."ProjectDeliverable" (
  id serial primary key,
  tenant_id text not null,
  project_id integer not null references public."Project"(id) on delete cascade,
  commitment_id integer,
  name text not null,
  description text,
  responsible_id integer,
  responsible_name text,
  target_date timestamptz,
  status text not null default 'pendiente',
  validation text,
  validated_at timestamptz,
  evidence_status text not null default 'pendiente',
  metadata jsonb not null default '{}'::jsonb,
  created_by integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "ProjectDeliverable_status_check" check (status in ('pendiente', 'activo', 'bloqueado', 'validacion', 'finalizado'))
);

create table if not exists public."ProjectRisk" (
  id serial primary key,
  tenant_id text not null,
  project_id integer not null references public."Project"(id) on delete cascade,
  commitment_id integer,
  kind text not null default 'riesgo',
  description text not null,
  impact text not null default 'medio',
  priority text not null default 'media',
  responsible_id integer,
  responsible_name text,
  detected_at timestamptz not null default now(),
  action_recommended text,
  status text not null default 'activo',
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "ProjectRisk_kind_check" check (kind in ('riesgo', 'bloqueo')),
  constraint "ProjectRisk_status_check" check (status in ('pendiente', 'activo', 'bloqueado', 'validacion', 'finalizado'))
);

create table if not exists public."ProjectResourceAssignment" (
  id serial primary key,
  tenant_id text not null,
  project_id integer not null references public."Project"(id) on delete cascade,
  person_id integer,
  person_name text not null,
  role text not null,
  load_level integer not null default 50,
  availability text not null default 'disponible',
  responsibilities text,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public."ProjectComment" (
  id serial primary key,
  tenant_id text not null,
  project_id integer not null references public."Project"(id) on delete cascade,
  entity_type text not null default 'project',
  entity_id integer,
  comment text not null,
  created_by integer,
  created_by_name text,
  created_at timestamptz not null default now()
);

create table if not exists public."ProjectEvidence" (
  id serial primary key,
  tenant_id text not null,
  project_id integer not null references public."Project"(id) on delete cascade,
  entity_type text not null,
  entity_id integer,
  title text not null,
  file_url text,
  file_name text,
  mime_type text,
  storage_path text,
  metadata jsonb not null default '{}'::jsonb,
  uploaded_by integer,
  created_at timestamptz not null default now()
);

create table if not exists public."ProjectAlert" (
  id serial primary key,
  tenant_id text not null,
  project_id integer not null references public."Project"(id) on delete cascade,
  type text not null,
  title text not null,
  description text,
  severity text not null default 'info',
  status text not null default 'activa',
  action_suggested text,
  entity_type text,
  entity_id integer,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public."ProjectLog" (
  id bigserial primary key,
  tenant_id text not null,
  project_id integer not null references public."Project"(id) on delete cascade,
  action text not null,
  summary text not null,
  entity_type text,
  entity_id integer,
  old_value jsonb,
  new_value jsonb,
  user_id integer,
  created_at timestamptz not null default now()
);

create index if not exists "Project_tenant_id_status_idx" on public."Project"(tenant_id, status);
create index if not exists "Project_tenant_id_priority_idx" on public."Project"(tenant_id, priority);
create index if not exists "Project_tenant_id_target_date_idx" on public."Project"(tenant_id, target_date);
create index if not exists "ProjectCommitment_tenant_project_idx" on public."ProjectCommitment"(tenant_id, project_id);
create index if not exists "ProjectCommitment_tenant_status_date_idx" on public."ProjectCommitment"(tenant_id, status, target_date);
create index if not exists "ProjectDeliverable_tenant_project_idx" on public."ProjectDeliverable"(tenant_id, project_id);
create index if not exists "ProjectDeliverable_tenant_status_date_idx" on public."ProjectDeliverable"(tenant_id, status, target_date);
create index if not exists "ProjectRisk_tenant_project_idx" on public."ProjectRisk"(tenant_id, project_id);
create index if not exists "ProjectRisk_tenant_kind_status_idx" on public."ProjectRisk"(tenant_id, kind, status);
create index if not exists "ProjectResourceAssignment_tenant_project_idx" on public."ProjectResourceAssignment"(tenant_id, project_id);
create index if not exists "ProjectAlert_tenant_status_severity_idx" on public."ProjectAlert"(tenant_id, status, severity);
create index if not exists "ProjectLog_tenant_project_created_idx" on public."ProjectLog"(tenant_id, project_id, created_at);
