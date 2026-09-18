# Normalización visual ERP

Estado: **candidata para QA en develop**.

Se normalizaron Inventario, Contabilidad, Tesorería y Ventas usando los componentes y clases visuales vigentes de APEXOS. El cambio elimina contenido narrativo, accesos duplicados y referencias a funciones futuras, dejando únicamente herramientas con ruta y operación implementadas.

## Cambios

- Inventario: portada reducida a nueve acciones activas; navegación diferencia alta y consulta de productos.
- Contabilidad: se eliminaron tarjetas duplicadas de reportes y la referencia DIAN futura; IVA y retenciones tienen accesos independientes.
- Tesorería: encabezado, pestañas y selección de documentos reorganizados sin cambiar pagos, bancos, anticipos, filtros o anulaciones.
- Ventas: accesos activos uniformes; clientes y nueva orden usan formularios etiquetados, compactos y con estados visibles.

No se modificaron endpoints, payloads, reglas contables, permisos, modelos, migraciones ni módulos fuera del alcance.

## Resultado previo

- Contratos funcionales y visuales: 23/23.
- TypeScript: aprobado.
- ESLint: 0 errores; 6 advertencias preexistentes fuera del alcance.
- Build de la candidata develop: aprobado, 73 rutas.
- Inspección navegador: el diseño anterior fue reproducido en QA; la vista local nueva quedó bloqueada por ausencia de sesión local y debe recorrerse tras el despliegue del commit exacto.
