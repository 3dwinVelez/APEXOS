-- Tighten service technician access: assigned orders must point to an active employee
-- in the same company, while admins keep full company visibility.

create or replace function app_private.can_access_service_order(company_uuid uuid, order_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    app_private.is_company_admin(company_uuid)
    or exists (
      select 1
      from public.service_orders so
      left join public.employees e
        on e.id = so.technician_employee_id
       and e.company_id = so.company_id
       and coalesce(e.status, 'active') = 'active'
      where so.id = order_uuid
        and so.company_id = company_uuid
        and (
          so.technician_user_id = auth.uid()
          or e.user_id = auth.uid()
        )
    );
$$;

revoke all on function app_private.can_access_service_order(uuid, uuid) from public, anon;
grant execute on function app_private.can_access_service_order(uuid, uuid) to authenticated, service_role;
