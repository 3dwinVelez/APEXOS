# Validaciones de soporte

Fecha: 2026-08-24

| Control | Resultado |
| --- | --- |
| Certificado E2E API `scripts/certifications/hr-marking-only-qa.js` | Aprobado, 17/17 |
| Certificación navegador autenticado | Aprobado, 7/7 |
| Pruebas Node API/web/RBAC | Aprobado, 28/28 |
| TypeScript web | Aprobado |
| Build Next.js web | Aprobado, 64 rutas |
| ESLint directo | No ejecutable: el repositorio no contiene configuración plana requerida por ESLint 9 |

`npm ci` no modificó el lockfile. El audit de dependencias reportó 11 vulnerabilidades altas preexistentes; no se aplicó `npm audit fix` porque implicaría cambios de dependencias fuera del alcance autorizado.

Los datos de certificación se alojaron en un clúster PostgreSQL temporal y aislado. Las credenciales del usuario QA no forman parte de esta evidencia ni del repositorio.
