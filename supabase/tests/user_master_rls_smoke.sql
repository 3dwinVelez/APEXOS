-- User master RLS smoke tests.
-- Run manually in Supabase SQL editor after replacing the placeholder UUIDs
-- with real QA users from two different companies.

begin;

-- Replace before running:
-- company_a_admin_user_id: admin/owner of company A.
-- company_a_member_user_id: regular user of company A.
-- company_b_member_user_id: regular user of company B.
-- company_a_id/company_b_id: tenant ids.

-- Example:
-- select set_config('request.jwt.claim.sub', 'company_a_admin_user_id', true);
-- select set_config('request.jwt.claim.role', 'authenticated', true);

-- 1. Company admin can see documents for its company.
select set_config('request.jwt.claim.sub', 'company_a_admin_user_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select count(*) as company_a_admin_visible_documents
from public.user_master_documents
where company_id = 'company_a_id';

-- 2. Member can only see own documents.
select set_config('request.jwt.claim.sub', 'company_a_member_user_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select count(*) as member_other_company_documents_should_be_zero
from public.user_master_documents
where company_id = 'company_b_id';

-- 3. Member from another company must not see company A documents.
select set_config('request.jwt.claim.sub', 'company_b_member_user_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select count(*) as company_b_member_company_a_documents_should_be_zero
from public.user_master_documents
where company_id = 'company_a_id';

-- 4. Non-admin insert must fail.
insert into public.user_master_documents (
  company_id,
  user_id,
  document_type,
  file_name,
  storage_path
) values (
  'company_a_id',
  'company_a_member_user_id',
  'identity',
  'should-fail.pdf',
  'user-documents/company_a_id/company_a_member_user_id/identity/should-fail.pdf'
);

rollback;
