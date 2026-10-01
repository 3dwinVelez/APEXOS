# Platform regression - hr-report-alerts-dedup-20261001

RESULTADO: passed para regresion local proporcional.

El cambio limita el resumen visible de alertas a las marcaciones efectivas de entrada y cierre de la jornada. No modifica APIs, permisos, Supabase, almacenamiento, autenticacion, autorizacion ni infraestructura.

La regresion local proporcional cubrio:

- Renderizado de Alertas con maximo entrada/cierre.
- Exportacion XLSX de alertas.
- Detalle de trazabilidad conservando eventos.
- Typecheck completo de `apps/web`.
- Lint completo de `apps/web` sin errores.

La certificacion en QA vivo para `develop -> main` queda pendiente y no se declara aprobada aqui.

