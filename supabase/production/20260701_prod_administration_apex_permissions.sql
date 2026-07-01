-- Administration APEX production permissions.
-- Purpose: allow the official server-side company/user administration flow
-- after application code validates the caller as Platform SuperAdmin.
--
-- Safety:
-- - No data writes.
-- - No DROP/TRUNCATE statements.
-- - RLS remains enabled on all touched tables.

grant usage on schema public to authenticated, service_role;

do $$
declare
  table_name text;
  read_tables text[] := array[
    'companies',
    'company_admin_onboarding',
    'company_modules',
    'company_users',
    'employees',
    'platform_admins',
    'profiles',
    'modules'
  ];
  service_tables text[] := array[
    'companies',
    'company_admin_onboarding',
    'company_modules',
    'company_users',
    'employees',
    'modules',
    'platform_admins',
    'profiles'
  ];
begin
  foreach table_name in array read_tables loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('revoke truncate on table public.%I from anon, authenticated, service_role', table_name);
      execute format('revoke insert, update, delete on table public.%I from authenticated', table_name);
      execute format('grant select on table public.%I to authenticated', table_name);
      execute format('alter table public.%I enable row level security', table_name);
    end if;
  end loop;

  foreach table_name in array service_tables loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('revoke truncate on table public.%I from anon, authenticated, service_role', table_name);
      execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
      execute format('alter table public.%I enable row level security', table_name);
    end if;
  end loop;
end $$;

grant select on table public.v_platform_companies to authenticated, service_role;
grant select on table public.v_platform_company_module_access to authenticated, service_role;
grant select on table public.v_company_module_status to authenticated, service_role;

do $$
declare
  table_name text;
  column_name text;
  sequence_name text;
begin
  for table_name, column_name in
    select c.table_name, c.column_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name in (
        'companies',
        'company_admin_onboarding',
        'company_modules',
        'company_users',
        'employees',
        'modules',
        'platform_admins',
        'profiles'
      )
      and c.column_default like 'nextval%'
  loop
    sequence_name := pg_get_serial_sequence(format('public.%I', table_name), column_name);
    if sequence_name is not null then
      execute format('grant usage, select on sequence %s to authenticated, service_role', sequence_name);
    end if;
  end loop;
end $$;
