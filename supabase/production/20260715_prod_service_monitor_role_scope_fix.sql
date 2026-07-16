-- PROD fix: service monitor visibility for admin users.
-- Keeps the server-side monitor able to read service rows and aligns existing
-- company membership roles with admin employee metadata.

grant select on table
  public.service_orders,
  public.service_incidents,
  public.service_evidence
to service_role;

update public.company_users cu
set role = 'admin'
from public.employees e
where e.company_id = cu.company_id
  and e.user_id = cu.user_id
  and cu.status = 'active'
  and cu.role not in ('owner', 'admin')
  and (
    lower(coalesce(e.metadata->>'role_name', '')) like '%admin%'
    or lower(coalesce(e.metadata->>'role_name', '')) like '%administrador%'
    or lower(coalesce(e.metadata#>>'{access,role_name}', '')) like '%admin%'
    or lower(coalesce(e.metadata#>>'{access,role_name}', '')) like '%administrador%'
  );
