# Error validation

- Missing Supabase administrative configuration returns `503` before Prisma is changed.
- Missing Supabase Auth identity returns `409` and no administrative success is shown.
- Rejected or unconfirmed Auth update returns an error and blocks the Prisma update.
- Password policy remains enforced before synchronization.
