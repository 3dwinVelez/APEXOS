# Validacion local

- `node --check scripts/certifications/commercial-management-population-qa.js`: aprobado.
- Pruebas comerciales, RBAC, autenticacion Supabase y contrato de poblacion: 37 pruebas, 35 aprobadas, 0 fallidas y 2 integraciones omitidas por no existir `DATABASE_URL` local de certificacion.
- `git diff --check`: aprobado despues de normalizar el reporte.
- Certificacion local de esquema y dependencia runtime: aprobada en `../commercial-runtime-dependency-20260903/certification.json`.
- Certificacion remota funcional: dos pasadas aprobadas en `run.json` y `rerun.json`.
- `qa:promotion:scope`: aprobado para 20 rutas exactas contra `origin/develop`.
- `qa:approval:evidence`: bloqueado; exige certificacion de `NYVORA` y trayecto `develop -> main`, fuera de la autorizacion QA actual.

El despliegue QA actual aun no contiene `prom-client` en el workspace API. La promocion y el redeploy permanecen pendientes de autorizacion independiente.
