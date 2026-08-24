# Comandos reproducibles

Certificación funcional contra la API aislada:

```powershell
npm run certify:admin-role-capabilities:qa -- --api-url http://127.0.0.1:3112 --output docs/qa/evidence/admin-role-capabilities-20260824/certification.json --fixture-output $env:TEMP\apexos-admin-role-capabilities-fixture.json
```

Pruebas focalizadas:

```powershell
node --test apps/api/test/admin-role-capabilities.test.js apps/api/test/admin-service.test.js apps/web/test/admin-role-capabilities.test.mjs apps/web/test/module-access-policy.test.mjs
```

Regresión completa:

```powershell
$env:DATABASE_URL='postgresql://apex:apex@127.0.0.1:55433/postgres?schema=public'
$env:JWT_SECRET='qa-full-suite-role-capabilities-20260824'
$env:REDIS_DISABLED='true'
$env:DISABLE_BACKGROUND_WORKERS='true'
$env:TARGET_ENV='test'
node --test apps/api/test/*.test.js apps/web/test/*.test.mjs scripts/test/*.test.js
npx tsc -p apps/web/tsconfig.json --noEmit
npm run lint
npm --workspace apps/web run build
npm audit --json
```

Las credenciales, el PostgreSQL temporal y los artefactos de compilación locales fueron eliminados después de capturar la evidencia.
