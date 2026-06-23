-- Add pre-order state for public service requests before operational pending assignment.

alter table public.service_orders
drop constraint if exists service_orders_status_check;

alter table public.service_orders
add constraint service_orders_status_check
check (status in ('agendado', 'pendiente', 'en_curso', 'inspeccion', 'ejecucion', 'cerrada', 'no_ejecutada', 'cancelada'));
