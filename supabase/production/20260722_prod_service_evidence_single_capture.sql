-- Production companion for supabase/migrations/20260722173000_service_evidence_single_capture.sql.
-- Keeps the first valid capture for each workflow step before enforcing uniqueness.
set lock_timeout = '5s';
set statement_timeout = '10min';

with ranked as (
  select
    id,
    row_number() over (
      partition by
        order_id,
        coalesce(metadata->>'original_type', evidence_type),
        case
          when coalesce(metadata->>'original_type', evidence_type) = 'pieza_averiada'
            then coalesce(metadata->>'part_id', '')
          else ''
        end
      order by created_at asc, id asc
    ) as capture_number
  from public.service_evidence
  where coalesce(metadata->>'original_type', evidence_type) in (
    'fachada',
    'pieza_averiada',
    'producto_abierto',
    'producto_cerrado',
    'cliente',
    'firma_cliente',
    'no_ejecutada'
  )
)
delete from public.service_evidence evidence
using ranked
where evidence.id = ranked.id
  and ranked.capture_number > 1;

create unique index if not exists uq_service_evidence_single_capture
on public.service_evidence (
  order_id,
  (coalesce(metadata->>'original_type', evidence_type)),
  (
    case
      when coalesce(metadata->>'original_type', evidence_type) = 'pieza_averiada'
        then coalesce(metadata->>'part_id', '')
      else ''
    end
  )
)
where coalesce(metadata->>'original_type', evidence_type) in (
  'fachada',
  'pieza_averiada',
  'producto_abierto',
  'producto_cerrado',
  'cliente',
  'firma_cliente',
  'no_ejecutada'
);

analyze public.service_evidence;
