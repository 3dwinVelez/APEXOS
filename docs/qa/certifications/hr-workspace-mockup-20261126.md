# Talento humano: maqueta de los espacios de trabajo

Referencia: `Maqueta Talento Humano APEX OS.pdf`, seis páginas suministradas el 26 de noviembre de 2026. Implementación en `desarrollo`.

## Alcance

- Libranzas: tarjetas numeradas para trabajador, concepto y condiciones; controles segmentados; resumen por frecuencia; reporte compacto, indicadores, detalle seleccionable, progreso real y exportación existente.
- Liquidación de trabajador: datos del retiro y revisión en la columna principal; desglose y acciones en el lateral; se conservan revisión de días, conceptos manuales, contrato vigente, autorizaciones, modal, PDF y documentos.
- Aportes sociales: indicadores, diferencia conceptual/PILA cuando está informada, pestañas de documentos, resumen y novedades; totales por subsistema calculados desde las líneas reales.
- Provisiones: etapas, indicadores por concepto, búsqueda, base máxima de referencia y total del periodo; saldo anual de provisiones y pagos reales, consultado con una agregación por empresa y año y acceso al pago de prestaciones.
- Pago de prestaciones: tarjetas de selección, tabla con totales visibles y resumen del documento completo. Cambiar las fechas descarta la previsualización anterior. El buscador conserva su función de filtro visual y de Excel; el resumen explica que crear el documento incluye la previsualización completa.
- Estilos compartidos y adaptación a pantalla estrecha. Se conservan el menú global y los cálculos del servidor.

Los nombres, cantidades, tasas y fechas ilustrativas del PDF no son datos de configuración. No se crean historiales de cuotas ni fechas futuras ficticias. El rediseño utiliza las operaciones financieras existentes; no agrega una edición monetaria de pagos sin soporte del servidor.

La consulta anual es de solo lectura, requiere permiso `payroll:read` y agrega exclusivamente los registros de provisión del año solicitado, sin límites de paginación. No modifica fórmulas ni movimientos. Se certifican el aislamiento entre empresas, el año solicitado y el efecto de pago/anulación sobre el resumen.

## Verificación reproducible

```powershell
$env:CERT_BROWSER_PORT='3321'
node scripts/certifications/hr-employee-user-association-isolated-local.js --certificate=hr-workspace-mockup-local.js
```

El certificado ejecuta primero la regresión completa de liquidación de trabajador y prestaciones. Después prueba los espacios rediseñados con API, PostgreSQL y Chrome reales: asociación de libranza, búsqueda, exportación XLSX, aportes, provisión, pago y anulación, persistencia tras recarga, permisos, aislamiento y adaptación móvil. Usa una copia desechable del esquema local; no escribe en QA ni en producción.

```powershell
# Desde apps/web
node --test test/hr-workday-novelties-ui.test.mjs test/ibc-nomina-ui.test.mjs
node ../../node_modules/eslint/bin/eslint.js app/dashboard/talento-humano/libranzas/page.tsx app/dashboard/talento-humano/liquidacion-trabajador/page.tsx app/dashboard/talento-humano/aportes-sociales/page.tsx app/dashboard/talento-humano/provisiones/page.tsx app/dashboard/talento-humano/prestaciones-pagos/page.tsx components/hr/HrWorkspace.tsx
```

## Resultado

Certificación local completada el 26 de noviembre de 2026: **passed**, 19 comprobaciones completas con PostgreSQL, API y Chrome reales. El ejecutor aislado también terminó en **passed**, sin respuestas 5xx inesperadas y sin modificar la base de origen.

- Se comprobó que pagar prima aumenta el importe pagado y reduce el saldo anual exactamente por el total del documento; anularlo restaura el resumen anterior.
- Se verificaron autenticación, permisos de escritura, permiso de lectura del resumen anual, aislamiento entre empresas y validación del año.
- Cinco vistas móviles a 390 px sin desbordamiento de la página, sin errores de ejecución del navegador y sin respuestas de error en las operaciones de talento humano de la prueba.
- Las 18 pruebas de interfaz pasaron. `npm --workspace apps/web run typecheck`, ESLint de los archivos modificados, comprobación de sintaxis de servidor/certificadores y `git diff --check` terminaron sin errores.
- Inspección visual de las seis vistas del PDF, incluyendo las dos vistas de libranzas, y de las capturas móviles. Las tablas conservan desplazamiento interno para detalles extensos.

Resultados completos y capturas locales reproducibles: `.local/hr-workspace-mockup/`; captura del retiro: `.local/hr-termination-complete/workspace-termination.png`. Los logs, descargas XLSX y capturas generadas permanecen fuera del commit.

SHA-256 de `certification.json`: `23CBE1B2FF2F60B8E61F177F1D69E82FE746B18B9289E1B7533BDD373E2C1766`.

No se ha desplegado ni promovido este cambio. La publicación requiere autorización independiente, alcance exacto y las compuertas correspondientes del flujo `desarrollo -> develop -> main`.
