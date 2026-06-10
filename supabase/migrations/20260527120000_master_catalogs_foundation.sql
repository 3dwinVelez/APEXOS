-- Master catalogs foundation for APEXOS.
-- Non destructive: adds a generic catalog structure for reusable classifications.

create table if not exists public.master_catalogs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  scope text not null default 'company',
  active boolean not null default true,
  sort_order int not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint master_catalogs_scope_check check (scope in ('global', 'company', 'mixed')),
  constraint master_catalogs_global_company_check check (
    (scope = 'global' and company_id is null)
    or (scope in ('company', 'mixed'))
  )
);

create unique index if not exists master_catalogs_global_code_unique
on public.master_catalogs (code)
where company_id is null;

create unique index if not exists master_catalogs_company_code_unique
on public.master_catalogs (company_id, code)
where company_id is not null;

create table if not exists public.master_catalog_items (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.master_catalogs(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  active boolean not null default true,
  sort_order int not null default 100,
  parent_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists master_catalog_items_catalog_code_unique
on public.master_catalog_items (catalog_id, code);

create index if not exists idx_master_catalogs_company_active
on public.master_catalogs (company_id, active, sort_order);

create index if not exists idx_master_catalog_items_catalog_active
on public.master_catalog_items (catalog_id, active, sort_order);

create or replace function public.touch_master_catalog_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_master_catalogs_updated_at on public.master_catalogs;
create trigger trg_master_catalogs_updated_at
before update on public.master_catalogs
for each row execute function public.touch_master_catalog_updated_at();

drop trigger if exists trg_master_catalog_items_updated_at on public.master_catalog_items;
create trigger trg_master_catalog_items_updated_at
before update on public.master_catalog_items
for each row execute function public.touch_master_catalog_updated_at();

alter table public.master_catalogs enable row level security;
alter table public.master_catalog_items enable row level security;

drop policy if exists master_catalogs_select_scoped on public.master_catalogs;
create policy master_catalogs_select_scoped on public.master_catalogs
for select to authenticated
using (
  company_id is null
  or app_private.is_company_member(company_id)
);

drop policy if exists master_catalogs_write_admin on public.master_catalogs;
create policy master_catalogs_write_admin on public.master_catalogs
for all to authenticated
using (
  company_id is not null
  and app_private.is_company_admin(company_id)
)
with check (
  company_id is not null
  and app_private.is_company_admin(company_id)
);

drop policy if exists master_catalog_items_select_scoped on public.master_catalog_items;
create policy master_catalog_items_select_scoped on public.master_catalog_items
for select to authenticated
using (
  company_id is null
  or app_private.is_company_member(company_id)
);

drop policy if exists master_catalog_items_write_admin on public.master_catalog_items;
create policy master_catalog_items_write_admin on public.master_catalog_items
for all to authenticated
using (
  company_id is not null
  and app_private.is_company_admin(company_id)
)
with check (
  company_id is not null
  and app_private.is_company_admin(company_id)
);

with catalogs(code, name, description, scope, sort_order) as (
  values
    ('user_types', 'Tipos de usuario', 'Clasificacion funcional del usuario.', 'mixed', 10),
    ('document_types', 'Tipos de documento', 'Tipos de identificacion.', 'global', 20),
    ('third_party_types', 'Tipos de tercero', 'Clasificacion de terceros.', 'global', 30),
    ('vehicle_types', 'Tipos de vehiculo', 'Clasificacion vehicular.', 'mixed', 40),
    ('activity_types', 'Tipos de actividad operativa', 'Actividades operativas reutilizables.', 'mixed', 50),
    ('service_types', 'Tipos de servicio', 'Clasificacion de servicios.', 'mixed', 60),
    ('product_categories', 'Categorias de producto', 'Familias/categorias de item.', 'mixed', 70),
    ('units_of_measure', 'Unidades de medida', 'Unidades base de productos y referencias.', 'global', 80),
    ('payment_methods', 'Metodos de pago', 'Metodos de pago disponibles.', 'global', 90),
    ('banks', 'Bancos', 'Entidades financieras.', 'global', 100)
)
insert into public.master_catalogs (code, name, description, scope, sort_order)
select code, name, description, scope, sort_order
from catalogs
on conflict do nothing;

with catalog_items(catalog_code, code, name, sort_order) as (
  values
    ('user_types', 'admin', 'Administrador', 10),
    ('user_types', 'supervisor', 'Supervisor', 20),
    ('user_types', 'operario', 'Operario', 30),
    ('user_types', 'conductor', 'Conductor', 40),
    ('document_types', 'CC', 'Cedula de ciudadania', 10),
    ('document_types', 'CE', 'Cedula de extranjeria', 20),
    ('document_types', 'NIT', 'NIT', 30),
    ('document_types', 'PAS', 'Pasaporte', 40),
    ('third_party_types', 'customer', 'Cliente', 10),
    ('third_party_types', 'supplier', 'Proveedor', 20),
    ('third_party_types', 'employee', 'Empleado', 30),
    ('vehicle_types', 'camioneta', 'Camioneta', 10),
    ('vehicle_types', 'furgon', 'Furgon', 20),
    ('vehicle_types', 'camion', 'Camion', 30),
    ('service_types', 'montaje', 'Montaje', 10),
    ('service_types', 'desmontaje', 'Desmontaje', 20),
    ('service_types', 'ambos', 'Montaje y desmontaje', 30),
    ('product_categories', 'muebles', 'Muebles', 10),
    ('product_categories', 'oficina', 'Oficina', 20),
    ('product_categories', 'servicios', 'Servicios', 30),
    ('units_of_measure', 'UND', 'Unidad', 10),
    ('units_of_measure', 'KG', 'Kilogramo', 20),
    ('units_of_measure', 'HORA', 'Hora', 30),
    ('payment_methods', 'cash', 'Efectivo', 10),
    ('payment_methods', 'transfer', 'Transferencia', 20),
    ('payment_methods', 'card', 'Tarjeta', 30)
)
insert into public.master_catalog_items (catalog_id, code, name, sort_order)
select c.id, i.code, i.name, i.sort_order
from catalog_items i
join public.master_catalogs c on c.code = i.catalog_code and c.company_id is null
on conflict do nothing;
