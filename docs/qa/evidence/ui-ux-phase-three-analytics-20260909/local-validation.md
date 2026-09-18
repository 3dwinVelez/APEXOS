# Validación local — Analytics y reportes programados

Fecha: 2026-09-09 · Rama: `desarrollo`

## Alcance

- Apex Heart abre directamente la vista solicitada mediante `?view=`.
- Drill-down desde rentabilidad hasta el producto operativo.
- Programaciones semanales o mensuales, hora, zona y destinatarios.
- Persistencia multi-tenant y CRUD protegido por permisos de reporte/configuración.
- Cron horario que procesa vencimientos y encola el correo gerencial.
- Cálculo y persistencia de última y próxima ejecución.
- Migración aditiva versionada.

## Resultados

- Esquema Prisma: válido y sincronizado en PostgreSQL local.
- Certificación CRUD y ejecución real: **4/4** en `api-certification.json`.
- Pruebas de dominio y contratos: **8/8**.
- TypeScript aprobado; ESLint sin errores en el alcance.

No se aplicó ninguna migración remota ni se enviaron correos externos; la certificación usó la cola local deshabilitada y eliminó su programación temporal.
