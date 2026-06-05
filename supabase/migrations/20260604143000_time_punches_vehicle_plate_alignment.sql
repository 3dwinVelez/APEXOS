-- Align Supabase operational time punches with the mobile/API map contract.
-- Non-destructive: required by frontend operations map queries.

alter table public.time_punches
add column if not exists vehicle_plate text;

create index if not exists idx_time_punches_company_vehicle_date
on public.time_punches(company_id, vehicle_plate, punch_date)
where vehicle_plate is not null;
