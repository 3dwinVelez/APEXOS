# Estandarización de tablas APEX OS

Fecha de corte: 2026-09-09

## Patrón compartido

- [x] Contador de registros visible en listados principales.
- [x] Contador de seleccionados cuando la tabla ya ofrece selección.
- [x] Selector de columnas con persistencia por ruta y estructura.
- [x] Encabezado fijo, contenedor desplazable, bordes y estados hover uniformes.
- [x] Compatibilidad con tema claro y oscuro mediante tokens del sistema.
- [x] Protección contra ocultar la última columna visible.
- [x] Actualización automática para datos cargados o filtrados dinámicamente.
- [x] Limpieza de observadores al cambiar de ruta.
- [x] Exclusión de tablas editoras, formularios, diálogos y detalles.
- [x] Exclusión de `SmartDataTable` para evitar controles duplicados.

## Cobertura por módulo

El adaptador se monta en `DashboardChrome` y cubre automáticamente todo listado operativo que cumpla las reglas anteriores. El inventario contiene 112 tablas en 64 archivos.

- [x] Administración — 2 archivos.
- [x] Compras — 7 archivos.
- [x] Contabilidad — 7 archivos.
- [x] Cuentas por cobrar — 4 archivos.
- [x] Gestión comercial — 14 archivos.
- [x] Inventario — 9 archivos; Productos conserva `SmartDataTable` nativo.
- [x] Proyectos — 1 archivo.
- [x] Reportes / APEX Heart — 1 archivo.
- [x] Servicios — 3 archivos.
- [x] Talento humano — 3 archivos.
- [x] Tesorería — 2 archivos.
- [x] Transporte — 4 archivos.
- [x] Ventas — 5 archivos.

## Excepciones intencionales

- [x] Tablas dentro de formularios: conservan su estructura de captura.
- [x] Tablas dentro de diálogos: conservan su estructura compacta contextual.
- [x] Tablas marcadas `data-table-layout="editor"` o `data-table-layout="detail"`: no reciben controles de listado.
- [x] Listados vacíos que no renderizan una tabla: conservan su estado vacío; el patrón se activa cuando existan filas y la tabla sea montada.
