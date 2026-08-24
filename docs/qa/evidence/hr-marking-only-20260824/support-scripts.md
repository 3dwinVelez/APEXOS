# Validaciones de soporte

Fecha: 2026-08-24

| Control | Resultado |
| --- | --- |
| Certificado E2E API `scripts/certifications/hr-marking-only-qa.js` | Aprobado, 17/17 |
| Certificación navegador autenticado | Aprobado, 7/7 |
| Pruebas Node API/web/RBAC | Aprobado, 28/28 específicas y 252/252 en regresión completa |
| TypeScript web | Aprobado |
| Build Next.js web | Aprobado con Next.js 16.3.2, 63 páginas |
| ESLint | Aprobado, 0 errores y 6 advertencias históricas |
| Auditoría de dependencias | Aprobado, 0 vulnerabilidades |

`npm ci` reprodujo el lockfile actualizado sin cambios. La corrección de las 11 vulnerabilidades altas fue autorizada antes de cualquier traslado y está certificada en `../dependency-security-20260824/certification.json`.

Los datos de certificación se alojaron en un clúster PostgreSQL temporal y aislado. Las credenciales del usuario QA no forman parte de esta evidencia ni del repositorio.
