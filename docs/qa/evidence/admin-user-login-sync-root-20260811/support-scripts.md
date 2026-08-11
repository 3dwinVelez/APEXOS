# Scripts de soporte

Resultados aprobados antes del despliegue QA:

```text
node --test apps/api/test/supabase-admin-credentials.test.js  # 5/5
npm run prisma:validate                                      # passed
npm run governance:guard                                     # passed
npm run lint                                                 # passed
npm --workspace apps/web run build                           # passed
```

Certificador funcional: `scripts/certifications/admin-user-login-sync.js`.
