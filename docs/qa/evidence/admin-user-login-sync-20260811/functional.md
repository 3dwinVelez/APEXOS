# Functional validation

## Root cause reproduced

The administration form sends edits to `/api/v1/admin/users/:id`. That API updated the Prisma password and email but did not update Supabase Auth, while the QA login attempts Supabase Auth first.

## QA scenario required after deployment

1. Edit an active QA user and set a temporary password.
2. Confirm that the response includes `credential_sync.provider = supabase`.
3. Close the administrator session.
4. Sign in through `/login` with the edited email and temporary password.
5. Confirm dashboard access and the expected role.

Main promotion remains blocked until this scenario has explicit evidence.
