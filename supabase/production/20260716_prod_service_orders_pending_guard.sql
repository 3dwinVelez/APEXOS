-- Production guard: service orders can only become pending when they are operable.
-- Apply after the agendado status migration.

update public.service_orders
set
  status = 'agendado',
  metadata = coalesce(metadata, '{}'::jsonb)
    || jsonb_build_object(
      'requires_admin_completion', true,
      'preorder_status', 'agendado',
      'pending_guard_repaired_at', now()::text
    )
where status = 'pendiente'
  and (reference_id is null or technician_employee_id is null)
  and (
    lower(coalesce(metadata ->> 'public_request', '')) in ('true', '1', 'yes')
    or lower(coalesce(metadata ->> 'requires_admin_completion', '')) in ('true', '1', 'yes')
    or metadata ->> 'preorder_status' = 'agendado'
  );

create or replace function public.guard_service_order_pending_ready()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.metadata := coalesce(new.metadata, '{}'::jsonb);

  if new.status = 'pendiente' then
    if new.reference_id is null then
      raise exception 'Selecciona una referencia activa antes de pasar la preorden a pendiente.';
    end if;

    if new.technician_employee_id is null then
      raise exception 'Asigna un tecnico responsable antes de pasar la preorden a pendiente.';
    end if;

    new.metadata := new.metadata || jsonb_build_object(
      'requires_admin_completion', false,
      'preorder_status', '',
      'scheduled_from_public_request_at', coalesce(new.metadata ->> 'scheduled_from_public_request_at', now()::text)
    );
  elsif new.status = 'agendado' then
    new.metadata := new.metadata || jsonb_build_object(
      'requires_admin_completion', true,
      'preorder_status', 'agendado'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_service_order_pending_ready on public.service_orders;
create trigger trg_guard_service_order_pending_ready
before insert or update of status, reference_id, technician_employee_id, metadata
on public.service_orders
for each row
execute function public.guard_service_order_pending_ready();
