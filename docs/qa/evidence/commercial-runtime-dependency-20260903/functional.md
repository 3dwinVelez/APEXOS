# Certificación funcional del runtime comercial

- El workspace `apps/api` declara `prom-client` como dependencia de producción.
- La dependencia se resuelve desde el contexto del API utilizado por su Dockerfile.
- El servidor monta `commitments` y `visits`; ambas rutas rechazan acceso anónimo con `401`, no `404`.
- El flujo integral de visitas, compromisos, cotizaciones, pedidos, RBAC y aislamiento tenant pasó en PostgreSQL 16 temporal.

Resultado local: aprobado. La promoción y el redeploy de este ajuste adicional requieren autorización independiente.
