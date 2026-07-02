-- Grants required by the controlled service reference import flow.
-- Scope: service reference catalog and parts only.

grant select, insert, update, delete on table public.service_references to service_role;
grant select, insert, update, delete on table public.service_reference_parts to service_role;
