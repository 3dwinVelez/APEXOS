-- Production companion for supabase/migrations/20260720090000_prod_read_performance_indexes.sql.
-- Run during a low-traffic window. It is additive and does not modify data or RLS policies.
set lock_timeout = '5s';
set statement_timeout = '10min';

create extension if not exists pg_trgm;

create index if not exists idx_employees_company_status_created_desc
on public.employees(company_id, status, created_at desc);

create index if not exists idx_employees_company_type_status
on public.employees(company_id, user_type, status);

create index if not exists idx_company_users_company_status_user
on public.company_users(company_id, status, user_id);

create index if not exists idx_service_orders_company_status_created_desc
on public.service_orders(company_id, status, created_at desc);

create index if not exists idx_service_orders_company_technician_status_created
on public.service_orders(company_id, technician_employee_id, status, created_at desc)
where technician_employee_id is not null;

create index if not exists idx_service_references_company_active_code
on public.service_references(company_id, active, code);

create index if not exists idx_service_references_company_category_active_code
on public.service_references(company_id, category, active, code);

create index if not exists idx_service_references_code_trgm
on public.service_references using gin (code gin_trgm_ops);

create index if not exists idx_service_references_name_trgm
on public.service_references using gin (name gin_trgm_ops);

create index if not exists idx_service_references_brand_trgm
on public.service_references using gin (brand gin_trgm_ops)
where brand is not null;

create index if not exists idx_service_references_model_trgm
on public.service_references using gin (model gin_trgm_ops)
where model is not null;

create index if not exists idx_service_reference_parts_reference_display
on public.service_reference_parts(reference_id, display_order);

create index if not exists idx_service_evidence_order_created_desc
on public.service_evidence(order_id, created_at desc);

create index if not exists idx_service_incidents_order_id
on public.service_incidents(order_id);

create index if not exists idx_operational_routes_company_date_start
on public.operational_routes(company_id, route_date, start_time);

create index if not exists idx_gps_pings_company_source_captured_desc
on public.gps_pings(company_id, source, captured_at desc);

create index if not exists idx_time_punches_company_date_punched_asc
on public.time_punches(company_id, punch_date, punched_at);

analyze public.employees;
analyze public.company_users;
analyze public.service_orders;
analyze public.service_references;
analyze public.service_reference_parts;
analyze public.service_evidence;
analyze public.service_incidents;
analyze public.operational_routes;
analyze public.gps_pings;
analyze public.time_punches;
