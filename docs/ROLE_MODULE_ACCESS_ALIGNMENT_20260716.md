# Role, module and data-access alignment - 2026-07-16

## Root cause

User assignment had two independent sources of truth:

- `employees.metadata` stored the selected role and permissions.
- `company_users.role` stored the membership scope used by RLS and service-monitor logic.

When a user was edited, the Next API could preserve the old membership role from
`company_users` instead of recalculating it from the selected role. A user could
therefore have the same visible role and permissions as an administrator while
RLS/backend scope still treated the account as `member`.

Some module tables also depended on RLS policies but did not consistently have
the base SQL `select` grant for `authenticated`/`service_role`. In that state,
valid module access can degrade into empty data or 403 responses.

## Fix

- Membership role is now derived from role name, role type and permission flags
  every time a Supabase user is created or updated.
- Existing production rows are repaired by SQL from `employees.metadata`.
- Current module tables with RLS receive the table grants required for RLS to
  evaluate. Future module migrations must include the same explicit grant block
  for their tables; no blanket future-table grant is applied.
- `delete_physical_records` is now present in every role permission module and
  stays disabled by default unless explicitly granted.
- Users can change their own password from the session panel. Supabase users
  verify the current password before update; API users are verified against the
  stored bcrypt hash.

## Production patch

Apply:

```powershell
psql -v ON_ERROR_STOP=1 -d $DATABASE_URL -f supabase\production\20260716_prod_role_module_data_access_alignment.sql
```

Validation queries:

```sql
select cu.company_id, cu.user_id, cu.role, e.email, e.metadata ->> 'role_name' as role_name
from public.company_users cu
join public.employees e on e.company_id = cu.company_id and e.user_id = cu.user_id
where coalesce(e.status, 'active') = 'active'
order by e.email;

select has_table_privilege('authenticated', 'public.service_orders', 'select') as auth_service_orders_select,
       has_table_privilege('service_role', 'public.service_orders', 'select') as service_role_service_orders_select;
```
