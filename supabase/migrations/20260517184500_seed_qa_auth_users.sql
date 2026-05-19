-- Seed QA Auth users for functional login testing.
-- Passwords are stored as bcrypt hashes only; plain temporary passwords are documented separately.

do $$
declare
  admin_user_id uuid := '10000000-0000-4000-8000-000000000001';
  scj_user_id uuid := '10000000-0000-4000-8000-000000000002';
  admin_email text := 'admin@apexos.qa';
  scj_email text := 'scj@apexos.qa';
  admin_password_hash text := '$2a$10$03i6ZrFaISRUemoY7HlAD.1cjN6K6e/13rxSd.Tgxgv0yNSMcWNUy';
  scj_password_hash text := '$2a$10$6mkTVYUmlGd4Cwzr2FRoueuLE/oJS6t0l/fKiEmRi86biCrnNd.s.';
begin
  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    created_at,
    updated_at,
    phone,
    phone_confirmed_at,
    phone_change,
    phone_change_token,
    email_change_token_current,
    email_change_confirm_status,
    reauthentication_token,
    is_sso_user,
    is_anonymous
  )
  values
    (
      '00000000-0000-0000-0000-000000000000',
      admin_user_id,
      'authenticated',
      'authenticated',
      admin_email,
      admin_password_hash,
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Administrador APEX OS QA","qa_role":"platform_admin"}'::jsonb,
      false,
      now(),
      now(),
      null,
      null,
      '',
      '',
      '',
      0,
      '',
      false,
      false
    ),
    (
      '00000000-0000-0000-0000-000000000000',
      scj_user_id,
      'authenticated',
      'authenticated',
      scj_email,
      scj_password_hash,
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Administrador SCJ QA","qa_role":"company_admin"}'::jsonb,
      false,
      now(),
      now(),
      null,
      null,
      '',
      '',
      '',
      0,
      '',
      false,
      false
    )
  on conflict (id) do update set
    aud = excluded.aud,
    role = excluded.role,
    email = excluded.email,
    encrypted_password = excluded.encrypted_password,
    email_confirmed_at = excluded.email_confirmed_at,
    raw_app_meta_data = excluded.raw_app_meta_data,
    raw_user_meta_data = excluded.raw_user_meta_data,
    updated_at = now(),
    is_sso_user = false,
    is_anonymous = false;

  insert into auth.identities (
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  )
  values
    (
      admin_user_id::text,
      admin_user_id,
      jsonb_build_object('sub', admin_user_id::text, 'email', admin_email, 'email_verified', true, 'phone_verified', false),
      'email',
      null,
      now(),
      now()
    ),
    (
      scj_user_id::text,
      scj_user_id,
      jsonb_build_object('sub', scj_user_id::text, 'email', scj_email, 'email_verified', true, 'phone_verified', false),
      'email',
      null,
      now(),
      now()
    )
  on conflict (provider_id, provider) do update set
    user_id = excluded.user_id,
    identity_data = excluded.identity_data,
    updated_at = now();

  insert into public.profiles (id, full_name, email, status)
  values
    (admin_user_id, 'Administrador APEX OS QA', admin_email, 'active'),
    (scj_user_id, 'Administrador SCJ QA', scj_email, 'active')
  on conflict (id) do update set
    full_name = excluded.full_name,
    email = excluded.email,
    status = excluded.status,
    updated_at = now();

  insert into public.platform_admins (user_id, status)
  values (admin_user_id, 'active')
  on conflict (user_id) do update set
    status = 'active',
    updated_at = now();

  insert into public.company_users (company_id, user_id, role, status)
  select c.id, admin_user_id, 'owner', 'active'
  from public.companies c
  on conflict (company_id, user_id) do update set
    role = excluded.role,
    status = excluded.status,
    updated_at = now();

  insert into public.company_users (company_id, user_id, role, status)
  select c.id, scj_user_id, 'admin', 'active'
  from public.companies c
  where c.name = 'SCJ'
  on conflict (company_id, user_id) do update set
    role = excluded.role,
    status = excluded.status,
    updated_at = now();
end $$;
