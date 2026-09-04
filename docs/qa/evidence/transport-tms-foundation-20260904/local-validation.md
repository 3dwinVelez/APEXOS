# Validación local — Fundación Transporte/TMS

Fecha: 2026-09-04  
Rama: `desarrollo`  
Ambiente: desarrollo local

| Validación | Resultado |
|---|---|
| `npx prisma validate --schema apps/api/prisma/schema.prisma` | Aprobado |
| Generación del cliente Prisma | Aprobado |
| Pruebas TMS, UI y regresión de Transporte | Aprobado, 20/20 |
| TypeScript de `apps/web` | Aprobado |
| ESLint del alcance TMS | Aprobado, sin hallazgos |
| Build de `apps/web` | Aprobado, 93 rutas |
| `npm run certify:transport-tms:local` | Aprobado, 24/24 |

La certificación funcional final aprobada está en `run-20260904154104.json`. Verifica autenticación, maestros, origen georreferenciado, versiones tarifarias, sustitución de la versión vigente, vehículo apto, demanda incompleta, secuenciación, distancia, capacidad, cotización, confirmación del plan, asignación, transiciones controladas, entrega con POD, liquidación, aprobación, cierre y trazabilidad.

La primera ejecución (`local-certification.json`) falló únicamente al enviar la aprobación de liquidación con un cuerpo HTTP vacío. El certificador fue corregido para enviar un objeto JSON válido y se repitió completo. Los datos maestros temporales de ambas ejecuciones quedaron inactivos o retirados; los registros transaccionales se conservaron como trazabilidad.

## Límites conocidos del ambiente

- El lint global conserva un error preexistente y ajeno a este alcance en `apps/web/app/dashboard/compras/proveedores/[id]/page.tsx` por uso de `any`. El lint específico de los archivos TMS sí aprueba.
- PostgreSQL, Redis y MinIO están disponibles localmente. El servicio BRAIN no inicia porque `bitnami/pgbouncer:latest` ya no puede descargarse; corregir la composición de infraestructura requiere autorización independiente.
- El tablero general muestra dos respuestas 500 preexistentes de RR. HH. (`operations-map` y `attendance`) asociadas a desalineación histórica del esquema local. No afectan las rutas TMS certificadas.
- La base local no tenía historial de Prisma Migrate aunque ya contenía tablas. Para evitar pérdida de datos no se usó `--accept-data-loss`; se aplicó exclusivamente la migración SQL aditiva de TMS sobre PostgreSQL local.

No se ejecutaron push, merge, promoción, despliegue, migraciones remotas ni cambios de infraestructura.
