-- Create public service requests without exposing service role credentials to the web runtime.
-- The function validates active catalog data, generates a short OS number, and only inserts preorders.

create or replace function public.create_public_service_order(
  p_reference_id uuid,
  p_service_type text,
  p_customer_name text,
  p_customer_address text,
  p_customer_phone text,
  p_invoice_number text default null,
  p_notes text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table(id uuid, number text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
  v_service_type text := lower(trim(coalesce(p_service_type, '')));
  v_next_number text;
  v_max_number int := 0;
  v_types jsonb;
begin
  if p_reference_id is null then
    raise exception 'Selecciona una referencia activa para el producto que se va a instalar.';
  end if;
  if coalesce(trim(p_customer_name), '') = '' then
    raise exception 'Completa el nombre completo.';
  end if;
  if coalesce(trim(p_customer_address), '') = '' then
    raise exception 'Completa la direccion.';
  end if;
  if coalesce(trim(p_customer_phone), '') = '' then
    raise exception 'Completa el telefono.';
  end if;

  select sr.company_id
    into v_company_id
  from public.service_references sr
  where sr.id = p_reference_id
    and sr.active = true
    and sr.code <> '__SERVICE_TYPES__'
  limit 1;

  if v_company_id is null then
    raise exception 'Selecciona una referencia activa para el producto que se va a instalar.';
  end if;

  select metadata -> 'service_types'
    into v_types
  from public.service_references
  where company_id = v_company_id
    and code = '__SERVICE_TYPES__'
  limit 1;

  if jsonb_typeof(v_types) = 'array'
    and not exists (
      select 1
      from jsonb_array_elements(v_types) item
      where lower(trim(coalesce(item ->> 'code', item ->> 'label', ''))) = v_service_type
        and coalesce((item ->> 'active')::boolean, true) = true
    )
  then
    raise exception 'Selecciona un tipo de servicio activo para esta empresa.';
  end if;

  if v_service_type = '' then
    raise exception 'Selecciona un tipo de servicio activo para esta empresa.';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_company_id::text));

  select coalesce(max(substring(so.number from '^OS-([0-9]{1,5})$')::int), 0)
    into v_max_number
  from public.service_orders so
  where so.company_id = v_company_id
    and so.number ~ '^OS-[0-9]{1,5}$';

  v_next_number := 'OS-' || lpad((v_max_number + 1)::text, 5, '0');

  insert into public.service_orders (
    company_id,
    number,
    reference_id,
    technician_employee_id,
    technician_user_id,
    service_type,
    status,
    customer_name,
    customer_address,
    customer_phone,
    invoice_number,
    scheduled_date,
    notes,
    metadata
  )
  values (
    v_company_id,
    v_next_number,
    p_reference_id,
    null,
    null,
    v_service_type,
    'agendado',
    trim(p_customer_name),
    trim(p_customer_address),
    trim(p_customer_phone),
    nullif(trim(coalesce(p_invoice_number, '')), ''),
    null,
    nullif(trim(coalesce(p_notes, '')), ''),
    coalesce(p_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'created_from', 'public_service_request',
        'public_request', true,
        'requires_admin_completion', true,
        'preorder_status', 'agendado',
        'received_at', coalesce(p_metadata ->> 'received_at', now()::text)
      )
  )
  returning service_orders.id, service_orders.number
    into id, number;

  return next;
end;
$$;

revoke all on function public.create_public_service_order(uuid, text, text, text, text, text, text, jsonb) from public;
grant execute on function public.create_public_service_order(uuid, text, text, text, text, text, text, jsonb) to anon, authenticated, service_role;
