-- APEXOS / NYVORA production structural cleanup.
-- Run only after applying repository migrations to a new PROD Supabase project.
-- Purpose: keep schema, functions, RLS, policies, triggers, indexes and technical catalogs,
-- but remove QA/demo companies, users and operational data.

begin;

-- Operational data.
delete from public.service_evidence;
delete from public.service_incidents;
delete from public.service_orders;
delete from public.service_reference_parts;
delete from public.service_references;

delete from public.route_preoperational_checklist_evidence;
delete from public.route_preoperational_checklist_answers;
delete from public.route_preoperational_findings;
delete from public.route_start_authorizations;
delete from public.route_block_events;
delete from public.route_preoperational_checklists;
delete from public.route_assignments;
delete from public.operational_routes;

delete from public.gps_pings;
delete from public.time_punches;
delete from public.vehicle_master_audit_log;
delete from public.vehicle_documents;
delete from public.vehicles;

delete from public.user_master_audit_events;
delete from public.user_master_documents;
delete from public.employees;

-- Company/user data created by QA seed migrations.
delete from public.company_admin_onboarding;
delete from public.company_modules;
delete from public.company_users;
delete from public.platform_admins;
delete from public.profiles;
delete from public.companies;

-- Prisma/API mirror tables. They should be empty in a fresh structural PROD,
-- but this keeps the cleanup idempotent if a validation seed was accidentally run.
do $$
declare
  table_name text;
  table_names text[] := array[
    'ActivityEvidence',
    'ActivityType',
    'AuditLog',
    'BrainEvent',
    'BrainMetric',
    'Employee',
    'GpsPing',
    'Permission',
    'ProjectAlert',
    'ProjectComment',
    'ProjectEvidence',
    'ProjectLog',
    'ProjectResourceAssignment',
    'ProjectRisk',
    'ProjectDeliverable',
    'ProjectCommitment',
    'Project',
    'Role',
    'ServiceIncident',
    'ServicePhoto',
    'ServiceOrder',
    'ServiceReferencePart',
    'ServiceReference',
    'Tenant',
    'TimePunch',
    'User',
    'VehicleDocument',
    'VehicleMasterAuditLog',
    'Vehicle',
    'WorkActivity',
    'WorkSession'
  ];
begin
  foreach table_name in array table_names loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('truncate table public.%I cascade', table_name);
    end if;
  end loop;
end $$;

-- QA-specific plan, if present. Keep generic plans/modules as technical catalogs.
delete from public.plan_modules
where plan_id in (
  select id from public.plans where code in ('scj_operacion_inicial')
);
delete from public.plans
where code in ('scj_operacion_inicial');

-- Remove QA auth users inserted by migrations.
delete from auth.identities
where user_id in (
  '10000000-0000-4000-8000-000000000001'::uuid,
  '10000000-0000-4000-8000-000000000002'::uuid
)
or provider_id in (
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002'
);

delete from auth.users
where id in (
  '10000000-0000-4000-8000-000000000001'::uuid,
  '10000000-0000-4000-8000-000000000002'::uuid
)
or email in ('admin@apexos.qa', 'scj@apexos.qa');

-- Clean storage objects only; keep buckets and policies.
delete from storage.objects;

commit;
