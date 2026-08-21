-- Extend service order statuses to support administrative corrections.
-- The administrative correction module (services) can transition orders to
-- 'reabierta' (reopened), 'revision' and 'lista_facturacion' through the
-- controlled correction flow. Those states already exist in the Prisma/API
-- model but were missing from the Supabase check constraint, causing
-- HTTP 400 "violates check constraint service_orders_status_check" when
-- applying a correction that targets them.

alter table public.service_orders
drop constraint if exists service_orders_status_check;

alter table public.service_orders
add constraint service_orders_status_check
check (status in ('agendado', 'pendiente', 'en_curso', 'inspeccion', 'ejecucion', 'cerrada', 'no_ejecutada', 'cancelada', 'revision', 'reabierta', 'lista_facturacion'));
