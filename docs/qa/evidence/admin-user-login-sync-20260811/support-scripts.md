# Support scripts

```powershell
node --test apps/api/test/supabase-admin-credentials.test.js
npm run prisma:validate
npm run governance:guard
npm run lint
npm --workspace apps/web run build
```

Do not record passwords, service-role keys, access tokens, or complete Auth responses in QA evidence.
