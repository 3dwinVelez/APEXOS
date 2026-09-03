# Ejecucion controlada

## Gates locales

```powershell
npm run agent:test -- --profile safe
node --test apps/api/test/hr-marking-concurrency.test.js apps/api/test/hr-marking-concurrency-certificate.test.js apps/web/test/hr-marking-only-access.test.mjs
```

## Certificacion masiva QA

Requiere el commit candidato ya desplegado, migraciones aplicadas y variables QA suministradas fuera del repositorio.

```powershell
$env:CERTIFICATION_TARGET='qa'
$env:CERTIFICATION_EXPECTED_COMMIT='<sha-develop>'
npm --workspace apps/api run certify:hr-marking-concurrency:qa -- --output docs/qa/evidence/hr-marking-concurrency-20260902/mass-certification.json
```

El certificador bloquea hosts distintos al API QA, valida el SHA y ejecuta niveles 20/50/100. No usa endpoints productivos.

El mismo artefacto admite una precertificacion `CERTIFICATION_TARGET=local` únicamente contra loopback y PostgreSQL local. Este modo crea/reutiliza una empresa Nyvora local marcada para certificación; nunca acepta una URL o base remota.
