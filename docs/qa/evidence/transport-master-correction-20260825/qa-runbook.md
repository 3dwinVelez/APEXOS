# Ejecución certificable en QA

## Precondiciones

1. Promoción puntual y autorizada `desarrollo -> develop`.
2. Confirmar que `/health` publica el SHA exacto desplegado.
3. Disponer de tres cuentas QA controladas:
   - administrador de Transporte con `transport:read/write`;
   - consulta de Transporte con `transport:read` y sin `transport:write`;
   - usuario de una empresa QA distinta para comprobar aislamiento.
4. No usar credenciales ni URLs de producción.

## Variables requeridas

```text
TARGET_ENV=qa
QA_API_URL=https://apexos-api-qa-production.up.railway.app
QA_SUPABASE_URL=<url-supabase-qa>
QA_SUPABASE_ANON_KEY=<anon-key-qa>
QA_EXPECTED_COMMIT=<sha-desplegado>
QA_TRANSPORT_ADMIN_EMAIL=<cuenta-admin-qa>
QA_TRANSPORT_ADMIN_PASSWORD=<secreto>
QA_TRANSPORT_READONLY_EMAIL=<cuenta-consulta-qa>
QA_TRANSPORT_READONLY_PASSWORD=<secreto>
QA_OTHER_TENANT_EMAIL=<cuenta-otra-empresa-qa>
QA_OTHER_TENANT_PASSWORD=<secreto>
```

## Ejecución

```powershell
node scripts/certifications/transport-master-qa.js --output docs/qa/evidence/transport-master-correction-20260825/transport-master-certification.json
```

La salida válida debe terminar en `CERTIFICACION TRANSPORTE QA COMPLETA` y contener todos los checks en `passed`. Después se realiza la revisión manual del solicitante, se agregan capturas y se construye el manifiesto definitivo. Solo entonces puede ejecutarse:

```powershell
npm run qa:approval:evidence -- docs/qa/evidence/transport-master-correction-20260825/manifest.json
```

No se debe marcar `approval.status=approved` antes de la aprobación funcional real.
