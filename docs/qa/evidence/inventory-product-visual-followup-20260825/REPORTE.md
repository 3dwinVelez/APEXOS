# Simplificación visual del maestro de productos

Estado: **candidata para integración QA en develop**.

El formulario de productos conserva creación, edición, directorio, trazabilidad, perfiles operativos, impuestos, costos, existencias y controles de lote, vencimiento y serial. Se retiraron métricas duplicadas, plantillas rápidas, centro de control, enlaces conectados y el selector de costeo no editable.

No se modificaron endpoints, payloads, permisos, modelos, migraciones ni archivos de otros módulos.

## Resultado previo

- Contrato visual y funcional ERP: 5/5.
- Regresión seleccionada: 9/9.
- TypeScript: aprobado.
- ESLint: 0 errores; 6 advertencias preexistentes fuera del alcance.
- Build Next.js: aprobado, 73 rutas.
- Inspección web: la versión previa desplegada permitió reproducir el exceso visual. La candidata exacta requiere despliegue en `develop` para el recorrido autenticado final en QA.
