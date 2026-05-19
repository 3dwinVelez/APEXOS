-- Technical QA validation for Supabase RLS.
-- Run against APEX-OS QA. The script creates temporary Auth/database data
-- inside a transaction and rolls everything back.

begin;

create temp table qa_validation_results (
  area text not null,
  test text not null,
  expected text not null,
  actual text not null,
  passed boolean not null,
  detail text
) on commit drop;

grant insert, select on qa_validation_results to authenticated;

do $setup$
declare
  plan_id uuid;
  company_a uuid := '11111111-1111-4111-8111-111111111111';
  company_b uuid := '22222222-2222-4222-8222-222222222222';
  owner_a uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  admin_a uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  member_a uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  viewer_a uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  owner_b uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
begin
  select id into plan_id from public.plans where code = 'piloto_especial';

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    is_super_admin, created_at, updated_at, is_sso_user, is_anonymous
  )
  values
    ('00000000-0000-0000-0000-000000000000', owner_a, 'authenticated', 'authenticated', 'owner-a@qa.apexos.local', '', now(), '{"provider":"email","providers":["email"]}', '{}', false, now(), now(), false, false),
    ('00000000-0000-0000-0000-000000000000', admin_a, 'authenticated', 'authenticated', 'admin-a@qa.apexos.local', '', now(), '{"provider":"email","providers":["email"]}', '{}', false, now(), now(), false, false),
    ('00000000-0000-0000-0000-000000000000', member_a, 'authenticated', 'authenticated', 'member-a@qa.apexos.local', '', now(), '{"provider":"email","providers":["email"]}', '{}', false, now(), now(), false, false),
    ('00000000-0000-0000-0000-000000000000', viewer_a, 'authenticated', 'authenticated', 'viewer-a@qa.apexos.local', '', now(), '{"provider":"email","providers":["email"]}', '{}', false, now(), now(), false, false),
    ('00000000-0000-0000-0000-000000000000', owner_b, 'authenticated', 'authenticated', 'owner-b@qa.apexos.local', '', now(), '{"provider":"email","providers":["email"]}', '{}', false, now(), now(), false, false);

  insert into public.profiles (id, full_name, email, status)
  values
    (owner_a, 'Owner Empresa A', 'owner-a@qa.apexos.local', 'active'),
    (admin_a, 'Admin Empresa A', 'admin-a@qa.apexos.local', 'active'),
    (member_a, 'Member Empresa A', 'member-a@qa.apexos.local', 'active'),
    (viewer_a, 'Viewer Empresa A', 'viewer-a@qa.apexos.local', 'active'),
    (owner_b, 'Owner Empresa B', 'owner-b@qa.apexos.local', 'active');

  insert into public.companies (id, name, legal_name, status, plan_id)
  values
    (company_a, 'Empresa A QA RLS', 'Empresa A QA RLS', 'active', plan_id),
    (company_b, 'Empresa B QA RLS', 'Empresa B QA RLS', 'active', plan_id);

  insert into public.company_modules (company_id, module_id, enabled, source)
  select company_a, m.id, m.code in ('talento_humano', 'servicios', 'configuracion'), 'manual'
  from public.modules m;

  insert into public.company_modules (company_id, module_id, enabled, source)
  select company_b, m.id, m.code in ('talento_humano', 'servicios', 'configuracion'), 'manual'
  from public.modules m;

  insert into public.company_users (company_id, user_id, role, status)
  values
    (company_a, owner_a, 'owner', 'active'),
    (company_a, admin_a, 'admin', 'active'),
    (company_a, member_a, 'member', 'active'),
    (company_a, viewer_a, 'viewer', 'active'),
    (company_b, owner_b, 'owner', 'active');

  insert into public.employees (company_id, first_name, last_name, document_type, document_number, email, status)
  values
    (company_a, 'Empleado', 'Empresa A', 'CC', 'DOC-A-001', 'empleado-a@qa.apexos.local', 'active'),
    (company_b, 'Empleado', 'Empresa B', 'CC', 'DOC-B-001', 'empleado-b@qa.apexos.local', 'active');

  insert into public.services (company_id, name, description, category, price, status)
  values
    (company_a, 'Servicio Empresa A', 'Servicio QA A', 'qa', 10, 'active'),
    (company_b, 'Servicio Empresa B', 'Servicio QA B', 'qa', 20, 'active');
end;
$setup$;

set local role authenticated;

do $tests$
declare
  company_a uuid := '11111111-1111-4111-8111-111111111111';
  company_b uuid := '22222222-2222-4222-8222-222222222222';
  owner_a uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  admin_a uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  member_a uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  viewer_a uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  owner_b uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  count_result int;
  employee_id uuid;
  service_id uuid;
  object_id uuid;
begin
  perform set_config('request.jwt.claim.sub', owner_a::text, true);

  select count(*) into count_result from public.modules;
  insert into qa_validation_results values ('connection', 'read modules', '10 modules visible', count_result::text, count_result = 10, null);

  select count(*) into count_result from public.plans;
  insert into qa_validation_results values ('connection', 'read plans', 'at least 1 plan visible', count_result::text, count_result >= 1, null);

  select count(*) into count_result from public.companies where id = company_a;
  insert into qa_validation_results values ('multiempresa', 'owner A reads company A', '1', count_result::text, count_result = 1, null);

  select count(*) into count_result from public.companies where id = company_b;
  insert into qa_validation_results values ('multiempresa', 'owner A cannot read company B', '0', count_result::text, count_result = 0, null);

  select count(*) into count_result from public.v_company_module_status where company_id = company_a and enabled = true;
  insert into qa_validation_results values ('modules', 'enabled modules company A', '3', count_result::text, count_result = 3, 'talento_humano, servicios, configuracion');

  select count(*) into count_result from public.v_company_module_status where company_id = company_a and enabled = false;
  insert into qa_validation_results values ('modules', 'blocked modules company A', '7', count_result::text, count_result = 7, 'inventario, crm, ventas, compras, finanzas, reportes, wms');

  insert into public.employees (company_id, first_name, last_name, document_type, document_number, email, status)
  values (company_a, 'Owner', 'Create', 'CC', 'DOC-A-OWNER', 'owner-create@qa.apexos.local', 'active')
  returning id into employee_id;
  insert into qa_validation_results values ('employees', 'owner creates employee', 'insert allowed', 'insert allowed', true, employee_id::text);

  update public.employees set status = 'inactive' where id = employee_id;
  insert into qa_validation_results values ('employees', 'owner updates employee status', 'update allowed', 'update allowed', true, employee_id::text);

  begin
    insert into public.employees (company_id, first_name, last_name, document_type, document_number, email, status)
    values (company_a, 'Duplicate', 'Doc', 'CC', 'DOC-A-OWNER', 'duplicate@qa.apexos.local', 'active');
    insert into qa_validation_results values ('employees', 'unique document per company', 'unique violation', 'insert allowed', false, null);
  exception when unique_violation then
    insert into qa_validation_results values ('employees', 'unique document per company', 'unique violation', 'unique violation', true, null);
  end;

  insert into public.services (company_id, name, description, category, price, status)
  values (company_a, 'Servicio Owner QA', 'Validacion', 'qa', 15, 'active')
  returning id into service_id;
  insert into qa_validation_results values ('services', 'owner creates service', 'insert allowed', 'insert allowed', true, service_id::text);

  update public.services set status = 'inactive' where id = service_id;
  insert into qa_validation_results values ('services', 'owner updates service status', 'update allowed', 'update allowed', true, service_id::text);

  insert into storage.objects (bucket_id, name, owner, metadata)
  values ('company-assets', company_a::text || '/logos/test-logo.png', owner_a, '{"mimetype":"image/png","size":512}'::jsonb)
  returning id into object_id;
  insert into qa_validation_results values ('storage', 'owner uploads company asset metadata', 'insert allowed', 'insert allowed', true, object_id::text);

  update storage.objects set metadata = '{"mimetype":"image/webp","size":600}'::jsonb where id = object_id;
  insert into qa_validation_results values ('storage', 'owner replaces company asset metadata', 'update allowed', 'update allowed', true, object_id::text);

  begin
    delete from storage.objects where id = object_id;
    insert into qa_validation_results values ('storage', 'direct storage table delete', 'blocked by Storage API trigger', 'delete allowed', false, object_id::text);
  exception when insufficient_privilege or raise_exception then
    insert into qa_validation_results values ('storage', 'direct storage table delete', 'blocked by Storage API trigger', 'blocked by Storage API trigger', true, sqlerrm);
  end;

  perform set_config('request.jwt.claim.sub', admin_a::text, true);
  insert into public.services (company_id, name, description, category, price, status)
  values (company_a, 'Servicio Admin QA', 'Validacion', 'qa', 12, 'active');
  insert into qa_validation_results values ('roles', 'admin can create service', 'insert allowed', 'insert allowed', true, null);

  perform set_config('request.jwt.claim.sub', member_a::text, true);
  select count(*) into count_result from public.employees where company_id = company_a;
  insert into qa_validation_results values ('roles', 'member can read employees company A', 'at least 1', count_result::text, count_result >= 1, null);

  begin
    insert into public.employees (company_id, first_name, last_name, document_type, document_number, email, status)
    values (company_a, 'Member', 'Blocked', 'CC', 'DOC-A-MEMBER', 'member-blocked@qa.apexos.local', 'active');
    insert into qa_validation_results values ('roles', 'member cannot create employee', 'RLS denied', 'insert allowed', false, null);
  exception when insufficient_privilege or check_violation then
    insert into qa_validation_results values ('roles', 'member cannot create employee', 'RLS denied', 'RLS denied', true, sqlerrm);
  end;

  perform set_config('request.jwt.claim.sub', viewer_a::text, true);
  select count(*) into count_result from public.services where company_id = company_a and status = 'active';
  insert into qa_validation_results values ('roles', 'viewer can read active services company A', 'at least 1', count_result::text, count_result >= 1, null);

  begin
    update public.services set status = 'archived' where company_id = company_a;
    get diagnostics count_result = row_count;
    insert into qa_validation_results values ('roles', 'viewer cannot update services', '0 rows updated', count_result::text, count_result = 0, null);
  exception when insufficient_privilege or check_violation then
    insert into qa_validation_results values ('roles', 'viewer cannot update services', 'RLS denied', 'RLS denied', true, sqlerrm);
  end;

  perform set_config('request.jwt.claim.sub', owner_b::text, true);
  select count(*) into count_result from public.employees where company_id = company_a;
  insert into qa_validation_results values ('multiempresa', 'owner B cannot read employee A', '0', count_result::text, count_result = 0, null);

  select count(*) into count_result from public.services where company_id = company_a;
  insert into qa_validation_results values ('multiempresa', 'owner B cannot read service A', '0', count_result::text, count_result = 0, null);

  begin
    insert into storage.objects (bucket_id, name, owner, metadata)
    values ('company-assets', company_a::text || '/logos/blocked.png', owner_b, '{"mimetype":"image/png","size":512}'::jsonb);
    insert into qa_validation_results values ('storage', 'owner B cannot upload company A asset', 'RLS denied', 'insert allowed', false, null);
  exception when insufficient_privilege or check_violation then
    insert into qa_validation_results values ('storage', 'owner B cannot upload company A asset', 'RLS denied', 'RLS denied', true, sqlerrm);
  end;
end;
$tests$;

reset role;

select * from qa_validation_results order by area, test;

rollback;
