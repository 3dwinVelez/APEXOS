# Validación local — cargue Excel de pedidos de Transporte

Fecha: 2026-09-15

Rama: `desarrollo`

Commit funcional: `0d2a36cbbc9d2c1f26fcdd4d8202ad4e52d75bb9`

## Alcance validado

- La pantalla elimina la edición manual de CSV y presenta un flujo de tres pasos.
- La plantilla Excel contiene las hojas `Pedidos`, `Instructivo` y `Listas`.
- Los siete campos obligatorios están diferenciados de ocho campos opcionales.
- La plantilla incluye fechas y números tipados, listas desplegables y 200 filas disponibles.
- El lector encuentra la fila de encabezados, omite filas vacías y muestra archivo y cantidad de pedidos.
- Las columnas adicionales se conservan como campos personalizados en los metadatos del pedido.
- Los errores se presentan por fila y en lenguaje operativo.

## Resultados

| Validación | Resultado |
| --- | --- |
| Inspección del libro `Pedidos!A1:O8` | Aprobada |
| Búsqueda de errores de fórmula | Cero coincidencias |
| Render visual de las tres hojas | Aprobado; contenido legible y sin recortes relevantes |
| Pruebas API de Transporte y cubicaje | Aprobado, 25/25 |
| Pruebas web de Transporte y acceso | Aprobado, 20/20 |
| TypeScript | Aprobado |
| ESLint | Cero errores; nueve advertencias preexistentes fuera del alcance |
| Build web | Aprobado, 103 rutas |

## Límite

Esta evidencia es local. La carga de un archivo contra datos funcionales del tenant debe ejecutarse en QA antes de promover el cambio. No autoriza push, despliegue ni promoción.
