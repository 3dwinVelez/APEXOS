-- Allow the server-side Platform Initialization flow to mirror the first
-- SuperAdmin into public tables through Supabase REST using service_role.
-- This does not grant access to anon or authenticated.

grant usage on schema public to service_role;

grant select, insert, update on table public.profiles to service_role;
grant select, insert, update on table public.platform_admins to service_role;
