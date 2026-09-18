# Depuración de accesos duplicados ERP

Estado: **candidata para integración QA en develop**.

La captura suministrada confirmó tres accesos repetidos en la portada de Inventario: acción destacada, navegación secundaria y tarjetas. Se aplicó la misma revisión a Inventario, Contabilidad, Tesorería y Ventas.

## Ajuste

- Inventario, Contabilidad y Ventas: las portadas conservan únicamente las tarjetas de tareas activas.
- Las navegaciones contextuales permanecen en las pantallas internas de cada módulo.
- Tesorería conserva sus tres pestañas funcionales y un único enlace a Anticipos.
- No se cambiaron rutas, endpoints, payloads, permisos, modelos ni migraciones.

## Resultado previo

- Contratos y regresión seleccionada: 10/10.
- TypeScript: aprobado.
- ESLint: aprobado, 0 errores.
- Build Next.js: aprobado, 73 rutas.
- Eliminaciones de archivos: ninguna.
