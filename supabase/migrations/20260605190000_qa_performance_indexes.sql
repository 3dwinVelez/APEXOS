-- Non-destructive indexes for PostgREST/RLS paths observed in Supabase QA.
create index if not exists idx_company_users_user_status_company
on public.company_users(user_id, status, company_id);

create index if not exists idx_employees_user_company_status
on public.employees(user_id, company_id, status)
where user_id is not null;

create index if not exists idx_service_evidence_company_order_created
on public.service_evidence(company_id, order_id, created_at desc);

create index if not exists idx_service_incidents_company_order
on public.service_incidents(company_id, order_id);

create index if not exists idx_route_assignments_employee_status_route
on public.route_assignments(company_id, employee_id, status, route_id);
