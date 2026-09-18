# Validación local M-27

- Candidato certificado sobre `origin/develop` `8a5501682dd16ad4da98069c488e2b253d87884b`.
- Flujo transaccional real aprobado: visita, cliente 360, cotización, cancelación justificada y pedido; los datos QA se revierten al finalizar.
- Contratos API y frontend aprobados, incluido M-27 en la barra lateral.
- ESLint, TypeScript, Prisma y build de producción aprobados.
- Regresiones estables de RBAC, autenticación, Compras, Inventarios y Servicios aprobadas.
- El test histórico `purchase-invoice-transaction.test.js` falla también sin cambios de M-27 por una exportación contable ausente en el baseline; el diff M-27 no modifica Compras ni Contabilidad.

No autoriza `main`, despliegues ni migraciones remotas.
