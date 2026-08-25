# Reporte de preparación QA — Maestro de Transporte

## Estado

- Rama de implementación: `desarrollo`.
- Referencia funcional inspeccionada: `develop` en `51d41e98b69fcddf9eec3b68961277c040e403eb`.
- Promoción `desarrollo -> develop`: autorizada por el solicitante el 2026-08-25; pendiente de reconstrucción puntual, validación de alcance y ejecución.
- Certificación web corregida: pendiente de despliegue en QA y aprobación funcional del solicitante.

## Correcciones implementadas

1. El listado solicita `include_retired=true`, por lo que el filtro **Retirados** puede recuperar fichas con baja lógica; permanecen ocultas en la vista predeterminada.
2. La pantalla evalúa `transport:read` antes de consultar la API y presenta una explicación de acceso en lugar de un error genérico.
3. Crear, editar y adjuntar se habilitan únicamente con `transport:write`; el perfil de consulta abre fichas en modo solo lectura.
4. La consulta de empleados se ejecuta solo con `hr:read`. Su ausencia no bloquea la flota y permanece disponible el conductor manual.
5. Los errores 403 se diferencian de problemas de empresa activa o conectividad.

## Certificador versionado

`scripts/certifications/transport-master-qa.js` cubre:

- commit desplegado y guardas contra producción;
- autenticación obligatoria;
- lectura y denegación de escritura por RBAC;
- creación, normalización de placa y edición;
- obligatorios, fechas inconsistentes y VIN duplicado;
- adjuntos y versionado documental;
- detalle y auditoría;
- contrato de Planeación y métricas;
- aislamiento entre empresas;
- retiro lógico, exclusión predeterminada y recuperación con `include_retired=true`;
- limpieza mediante retiro lógico aun si la ejecución falla después de crear la ficha.

## Dictamen

La implementación local está preparada para promoción controlada hacia `develop`, pero **no está funcionalmente certificada en la web corregida** hasta completar el despliegue efectivo, ejecutar el certificador y realizar la revisión manual del solicitante sobre QA. La autorización de promoción no sustituye el resultado funcional.
