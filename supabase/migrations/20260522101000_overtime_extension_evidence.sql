-- Overtime extension evidence for QA and mobile attendance.

alter table public.time_punches
add column if not exists extra_evidence jsonb not null default '{}'::jsonb;

create index if not exists idx_time_punches_company_extra
on public.time_punches(company_id, punch_date)
where extra_minutes > 0;
