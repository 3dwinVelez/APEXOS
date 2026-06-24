-- Allow the external service request form to read only active catalog data.
-- Inserts and updates remain restricted to authenticated administrative flows.

drop policy if exists service_references_public_catalog_select on public.service_references;
create policy service_references_public_catalog_select
on public.service_references
for select
to anon
using (
  active = true
  or code = '__SERVICE_TYPES__'
);

