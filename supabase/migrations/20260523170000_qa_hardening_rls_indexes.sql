-- QA hardening: narrow operational RLS to admin/full-company or self/assigned rows.
-- This migration intentionally avoids broad refactors and only touches active Supabase QA tables.

grant usage on schema app_private to authenticated, service_role;

create or replace function app_private.current_company_role(company_uuid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select cu.role
  from public.company_users cu
  where cu.company_id = company_uuid
    and cu.user_id = auth.uid()
    and cu.status = 'active'
  order by case cu.role when 'owner' then 1 when 'admin' then 2 when 'member' then 3 else 4 end
  limit 1;
$$;

create or replace function app_private.current_employee_id(company_uuid uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select e.id
  from public.employees e
  where e.company_id = company_uuid
    and e.user_id = auth.uid()
    and coalesce(e.status, 'active') = 'active'
  limit 1;
$$;

create or replace function app_private.is_company_operator(company_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_private.current_company_role(company_uuid) in ('member', 'viewer');
$$;

create or replace function app_private.can_access_employee(company_uuid uuid, employee_uuid uuid)
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
      from public.employees e
      where e.id = employee_uuid
        and e.company_id = company_uuid
        and e.user_id = auth.uid()
        and coalesce(e.status, 'active') = 'active'
    );
$$;

create or replace function app_private.can_access_route(company_uuid uuid, route_uuid uuid)
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
      from public.route_assignments ra
      join public.employees e on e.id = ra.employee_id
      where ra.company_id = company_uuid
        and ra.route_id = route_uuid
        and ra.status = 'active'
        and e.user_id = auth.uid()
        and coalesce(e.status, 'active') = 'active'
    );
$$;

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
      left join public.employees e on e.id = so.technician_employee_id
      where so.id = order_uuid
        and so.company_id = company_uuid
        and (so.technician_user_id = auth.uid() or e.user_id = auth.uid())
    );
$$;

create or replace function app_private.storage_service_order_id(object_name text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if split_part(object_name, '/', 1) = 'company' then
    return app_private.uuid_or_null(split_part(object_name, '/', 4));
  end if;

  return app_private.uuid_or_null(split_part(object_name, '/', 2));
end;
$$;

create or replace function app_private.storage_route_id(object_name text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if split_part(object_name, '/', 1) = 'company' then
    return app_private.uuid_or_null(split_part(object_name, '/', 4));
  end if;

  return app_private.uuid_or_null(split_part(object_name, '/', 2));
end;
$$;

revoke all on function app_private.current_company_role(uuid) from public, anon;
revoke all on function app_private.current_employee_id(uuid) from public, anon;
revoke all on function app_private.is_company_operator(uuid) from public, anon;
revoke all on function app_private.can_access_employee(uuid, uuid) from public, anon;
revoke all on function app_private.can_access_route(uuid, uuid) from public, anon;
revoke all on function app_private.can_access_service_order(uuid, uuid) from public, anon;
revoke all on function app_private.storage_service_order_id(text) from public, anon;
revoke all on function app_private.storage_route_id(text) from public, anon;
grant execute on function app_private.current_company_role(uuid) to authenticated, service_role;
grant execute on function app_private.current_employee_id(uuid) to authenticated, service_role;
grant execute on function app_private.is_company_operator(uuid) to authenticated, service_role;
grant execute on function app_private.can_access_employee(uuid, uuid) to authenticated, service_role;
grant execute on function app_private.can_access_route(uuid, uuid) to authenticated, service_role;
grant execute on function app_private.can_access_service_order(uuid, uuid) to authenticated, service_role;
grant execute on function app_private.storage_service_order_id(text) to authenticated, service_role;
grant execute on function app_private.storage_route_id(text) to authenticated, service_role;

drop policy if exists employees_select_member_enabled on public.employees;
drop policy if exists employees_select_scoped on public.employees;
create policy employees_select_scoped on public.employees for select to authenticated
using (
  app_private.has_company_module(company_id, 'talento_humano')
  and (
    app_private.is_company_admin(company_id)
    or user_id = auth.uid()
  )
);

drop policy if exists employees_insert_admin_enabled on public.employees;
drop policy if exists employees_insert_scoped on public.employees;
create policy employees_insert_admin_enabled on public.employees for insert to authenticated
with check (app_private.is_company_admin(company_id) and app_private.has_company_module(company_id, 'talento_humano'));

drop policy if exists employees_update_admin_enabled on public.employees;
drop policy if exists employees_update_scoped on public.employees;
create policy employees_update_admin_enabled on public.employees for update to authenticated
using (app_private.is_company_admin(company_id) and app_private.has_company_module(company_id, 'talento_humano'))
with check (app_private.is_company_admin(company_id) and app_private.has_company_module(company_id, 'talento_humano'));

drop policy if exists time_punches_select_member on public.time_punches;
drop policy if exists time_punches_select_scoped on public.time_punches;
create policy time_punches_select_scoped on public.time_punches for select to authenticated
using (
  app_private.has_company_module(company_id, 'talento_humano')
  and (
    app_private.is_company_admin(company_id)
    or user_id = auth.uid()
    or (employee_id is not null and app_private.can_access_employee(company_id, employee_id))
  )
);

drop policy if exists time_punches_insert_member on public.time_punches;
drop policy if exists time_punches_insert_self on public.time_punches;
create policy time_punches_insert_self on public.time_punches for insert to authenticated
with check (
  app_private.has_company_module(company_id, 'talento_humano')
  and app_private.is_company_member(company_id)
  and user_id = auth.uid()
  and (
    employee_id is null
    or exists (
      select 1 from public.employees e
      where e.id = employee_id
        and e.company_id = company_id
        and e.user_id = auth.uid()
        and coalesce(e.status, 'active') = 'active'
    )
  )
);

drop policy if exists gps_pings_select_member on public.gps_pings;
drop policy if exists gps_pings_select_scoped on public.gps_pings;
create policy gps_pings_select_scoped on public.gps_pings for select to authenticated
using (
  app_private.has_company_module(company_id, 'talento_humano')
  and (
    app_private.is_company_admin(company_id)
    or user_id = auth.uid()
    or (employee_id is not null and app_private.can_access_employee(company_id, employee_id))
  )
);

drop policy if exists gps_pings_insert_member on public.gps_pings;
drop policy if exists gps_pings_insert_self on public.gps_pings;
create policy gps_pings_insert_self on public.gps_pings for insert to authenticated
with check (
  app_private.has_company_module(company_id, 'talento_humano')
  and app_private.is_company_member(company_id)
  and user_id = auth.uid()
  and (
    employee_id is null
    or exists (
      select 1 from public.employees e
      where e.id = employee_id
        and e.company_id = company_id
        and e.user_id = auth.uid()
        and coalesce(e.status, 'active') = 'active'
    )
  )
);

drop policy if exists operational_routes_select_member on public.operational_routes;
drop policy if exists operational_routes_select_scoped on public.operational_routes;
create policy operational_routes_select_scoped on public.operational_routes for select to authenticated
using (
  app_private.has_company_module(company_id, 'talento_humano')
  and (app_private.is_company_admin(company_id) or app_private.can_access_route(company_id, id))
);

drop policy if exists route_assignments_select_member on public.route_assignments;
drop policy if exists route_assignments_select_scoped on public.route_assignments;
create policy route_assignments_select_scoped on public.route_assignments for select to authenticated
using (
  app_private.has_company_module(company_id, 'talento_humano')
  and (
    app_private.is_company_admin(company_id)
    or app_private.can_access_employee(company_id, employee_id)
  )
);

drop policy if exists service_orders_select_member on public.service_orders;
drop policy if exists service_orders_select_scoped on public.service_orders;
create policy service_orders_select_scoped on public.service_orders for select to authenticated
using (
  app_private.has_company_module(company_id, 'servicios')
  and (app_private.is_company_admin(company_id) or app_private.can_access_service_order(company_id, id))
);

drop policy if exists service_orders_insert_member on public.service_orders;
drop policy if exists service_orders_insert_scoped on public.service_orders;
create policy service_orders_insert_scoped on public.service_orders for insert to authenticated
with check (
  app_private.has_company_module(company_id, 'servicios')
  and (
    app_private.is_company_admin(company_id)
    or (
      app_private.is_company_member(company_id)
      and (
        technician_user_id = auth.uid()
        or (
          technician_employee_id is not null
          and exists (
            select 1 from public.employees e
            where e.id = technician_employee_id
              and e.company_id = company_id
              and e.user_id = auth.uid()
              and coalesce(e.status, 'active') = 'active'
          )
        )
      )
    )
  )
);

drop policy if exists service_orders_update_member on public.service_orders;
drop policy if exists service_orders_update_scoped on public.service_orders;
create policy service_orders_update_scoped on public.service_orders for update to authenticated
using (
  app_private.has_company_module(company_id, 'servicios')
  and (app_private.is_company_admin(company_id) or app_private.can_access_service_order(company_id, id))
)
with check (
  app_private.has_company_module(company_id, 'servicios')
  and (app_private.is_company_admin(company_id) or app_private.can_access_service_order(company_id, id))
);

drop policy if exists service_incidents_select_member on public.service_incidents;
drop policy if exists service_incidents_select_scoped on public.service_incidents;
create policy service_incidents_select_scoped on public.service_incidents for select to authenticated
using (
  app_private.has_company_module(company_id, 'servicios')
  and (app_private.is_company_admin(company_id) or app_private.can_access_service_order(company_id, order_id))
);

drop policy if exists service_incidents_write_member on public.service_incidents;
drop policy if exists service_incidents_write_scoped on public.service_incidents;
create policy service_incidents_write_scoped on public.service_incidents for all to authenticated
using (
  app_private.has_company_module(company_id, 'servicios')
  and (app_private.is_company_admin(company_id) or app_private.can_access_service_order(company_id, order_id))
)
with check (
  app_private.has_company_module(company_id, 'servicios')
  and (app_private.is_company_admin(company_id) or app_private.can_access_service_order(company_id, order_id))
);

drop policy if exists service_evidence_select_member on public.service_evidence;
drop policy if exists service_evidence_select_scoped on public.service_evidence;
create policy service_evidence_select_scoped on public.service_evidence for select to authenticated
using (
  app_private.has_company_module(company_id, 'servicios')
  and (app_private.is_company_admin(company_id) or app_private.can_access_service_order(company_id, order_id))
);

drop policy if exists service_evidence_write_member on public.service_evidence;
drop policy if exists service_evidence_write_scoped on public.service_evidence;
create policy service_evidence_write_scoped on public.service_evidence for all to authenticated
using (
  app_private.has_company_module(company_id, 'servicios')
  and (app_private.is_company_admin(company_id) or app_private.can_access_service_order(company_id, order_id))
)
with check (
  app_private.has_company_module(company_id, 'servicios')
  and (app_private.is_company_admin(company_id) or app_private.can_access_service_order(company_id, order_id))
);

drop policy if exists service_images_select_member_enabled on storage.objects;
drop policy if exists service_images_select_scoped on storage.objects;
create policy service_images_select_scoped on storage.objects for select to authenticated
using (
  bucket_id = 'service-images'
  and app_private.has_company_module(app_private.storage_company_id(name), 'servicios')
  and (
    app_private.is_company_admin(app_private.storage_company_id(name))
    or app_private.can_access_service_order(app_private.storage_company_id(name), app_private.storage_service_order_id(name))
  )
);

drop policy if exists service_images_insert_admin_enabled on storage.objects;
drop policy if exists service_images_insert_scoped on storage.objects;
create policy service_images_insert_scoped on storage.objects for insert to authenticated
with check (
  bucket_id = 'service-images'
  and app_private.has_company_module(app_private.storage_company_id(name), 'servicios')
  and (
    app_private.is_company_admin(app_private.storage_company_id(name))
    or app_private.can_access_service_order(app_private.storage_company_id(name), app_private.storage_service_order_id(name))
  )
);

drop policy if exists service_images_update_admin_enabled on storage.objects;
drop policy if exists service_images_update_scoped on storage.objects;
create policy service_images_update_scoped on storage.objects for update to authenticated
using (
  bucket_id = 'service-images'
  and app_private.has_company_module(app_private.storage_company_id(name), 'servicios')
  and (
    app_private.is_company_admin(app_private.storage_company_id(name))
    or app_private.can_access_service_order(app_private.storage_company_id(name), app_private.storage_service_order_id(name))
  )
)
with check (
  bucket_id = 'service-images'
  and app_private.has_company_module(app_private.storage_company_id(name), 'servicios')
  and (
    app_private.is_company_admin(app_private.storage_company_id(name))
    or app_private.can_access_service_order(app_private.storage_company_id(name), app_private.storage_service_order_id(name))
  )
);

drop policy if exists service_images_delete_admin_enabled on storage.objects;
drop policy if exists service_images_delete_scoped on storage.objects;
create policy service_images_delete_scoped on storage.objects for delete to authenticated
using (
  bucket_id = 'service-images'
  and app_private.has_company_module(app_private.storage_company_id(name), 'servicios')
  and (
    app_private.is_company_admin(app_private.storage_company_id(name))
    or app_private.can_access_service_order(app_private.storage_company_id(name), app_private.storage_service_order_id(name))
  )
);

drop policy if exists route_evidence_storage_member_access on storage.objects;
drop policy if exists route_evidence_storage_scoped_access on storage.objects;
create policy route_evidence_storage_scoped_access on storage.objects for all to authenticated
using (
  bucket_id = 'route-evidence'
  and app_private.has_company_module(app_private.storage_company_id(name), 'talento_humano')
  and (
    app_private.is_company_admin(app_private.storage_company_id(name))
    or app_private.can_access_route(app_private.storage_company_id(name), app_private.storage_route_id(name))
  )
)
with check (
  bucket_id = 'route-evidence'
  and app_private.has_company_module(app_private.storage_company_id(name), 'talento_humano')
  and (
    app_private.is_company_admin(app_private.storage_company_id(name))
    or app_private.can_access_route(app_private.storage_company_id(name), app_private.storage_route_id(name))
  )
);

create index if not exists idx_gps_pings_company_captured_desc on public.gps_pings(company_id, captured_at desc);
create index if not exists idx_time_punches_company_date_punched_desc on public.time_punches(company_id, punch_date, punched_at desc);
create index if not exists idx_service_orders_company_created_desc on public.service_orders(company_id, created_at desc);
create index if not exists idx_operational_routes_company_status_created_desc on public.operational_routes(company_id, status, created_at desc);
create index if not exists idx_route_assignments_company_route_employee on public.route_assignments(company_id, route_id, employee_id);
create index if not exists idx_service_evidence_company_created_desc on public.service_evidence(company_id, created_at desc);
