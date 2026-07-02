-- Grants required by the controlled default service technician initialization.
-- Scope: global role catalog used to ensure tecnico_servicios.

grant select, insert, update on table public.master_catalogs to service_role;
grant select, insert, update on table public.master_catalog_items to service_role;
