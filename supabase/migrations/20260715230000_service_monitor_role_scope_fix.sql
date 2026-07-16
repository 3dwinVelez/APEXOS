-- Fix service monitor access for Supabase-backed production sessions.
-- Root causes:
-- 1) The Next.js service monitor reads service_orders/incidents/evidence with service_role,
--    but PROD missed SELECT grants for those tables.
-- 2) Some users had employee metadata role_name = Administrador de empresa while
--    company_users.role remained member, which made RLS/backend scope treat them as non-admin.

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
