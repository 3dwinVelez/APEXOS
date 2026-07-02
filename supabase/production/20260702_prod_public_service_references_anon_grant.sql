-- Allow the external public service request form to read active service references.
-- RLS policy service_references_public_catalog_select still restricts visible rows.

grant select on table public.service_references to anon;
