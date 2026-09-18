-- HR workday objects and seed data are owned exclusively by the Prisma
-- migration with the same timestamp. Supabase only applies the client-access
-- security overlay after validating that the canonical objects exist.

do $hr_contract$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'th_tipos_novedad',
    'th_novedades_jornada',
    'th_novedad_historial',
    'th_jornada_kilometrajes',
    'th_entidades_laborales',
    'th_empleado_salarios',
    'th_empleado_afiliaciones',
    'th_parametros_laborales',
    'th_conceptos_recargo',
    'th_calendario_dias'
  ]
  loop
    if pg_catalog.to_regclass(format('public.%I', relation_name)) is null then
      raise exception
        'HR contract prerequisite missing: run Prisma migration 20260917120000 before the Supabase security overlay (public.%)',
        relation_name;
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = relation_name
        and column_name = 'tenant_id'
        and data_type = 'text'
    ) then
      raise exception 'HR contract mismatch on public.%: expected tenant_id text', relation_name;
    end if;

    execute format('alter table public.%I enable row level security', relation_name);
    execute format(
      'revoke all privileges on table public.%I from anon, authenticated',
      relation_name
    );
  end loop;
end
$hr_contract$;
