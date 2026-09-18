# Certificación funcional del esquema comercial

- La cadena de diez migraciones comerciales se ejecutó, en orden, sobre PostgreSQL 16 temporal y vacío salvo por las dependencias mínimas versionadas.
- Se crearon las 18 tablas `commercial_*` esperadas y las semillas de configuración, motivos y resultados para dos compañías aisladas.
- Un flujo mínimo persistió asesor, cliente, visita y compromiso sin mezclar información de la segunda compañía.
- El flujo integral existente de Gestión Comercial pasó contra una segunda base temporal construida desde el esquema Prisma vigente.
- Las rutas `GET /api/v1/commercial-management/commitments` y `GET /api/v1/commercial-management/visits` quedaron montadas: sin credenciales responden `401`, no `404`.

Resultado local: aprobado. La migración y el despliegue remotos de QA no fueron ejecutados y requieren autorización independiente.
