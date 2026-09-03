# Validación local de Gestión Comercial en Administración APEX

- Causa raíz: M-27 estaba publicado en navegación y RBAC, pero faltaba en `public.modules`, fuente del listado administrativo.
- PostgreSQL real: alta de catálogo, matriz de planes, matriz de compañías, habilitación para NYVORA e idempotencia aprobadas.
- Contratos web de Gestión Comercial: 25 aprobados.
- Contratos API/RBAC/autenticación: 18 aprobados.
- TypeScript: aprobado.
- Build de producción Next.js: aprobado.
- Regresiones protegidas de Compras, Inventarios y Servicios: aprobadas.
- Dependencias locales fueron reinstaladas desde `package-lock.json`; no hubo cambios versionados de dependencias.

No autoriza `main`, despliegues ni migraciones remotas.
