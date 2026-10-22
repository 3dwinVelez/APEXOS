# Auditoría de pantallas, campos y reportes de Inventario

Entorno exclusivo: desarrollo local, rama desarrollo. Se preservaron todos los cambios anteriores de Transporte. No hay migraciones, despliegues, cambios de permisos, stock ni contabilización.

## Inventario de revisión

17 rutas: portada, directorio de productos, producto nuevo, ficha de producto, familias, clasificación, bodegas, Stock, cargue inicial, traslados, nuevo traslado, ajustes, nuevo ajuste, reportes generales, Kardex, costos y WMS. Se revisó también InventoryPanel como componente auxiliar (sin consumidor activo encontrado). La auditoría inicial encontró 50 selectores simples repartidos en 14 archivos de páginas/componentes.

## Hallazgos y ajustes

| Hallazgo | Ajuste realizado |
| --- | --- |
| Listas simples de sociedades, sucursales, familias, clasificaciones, productos, unidades, estados y bodegas | InventorySearchSelect reutiliza el control ya validado de búsqueda, iniciales, Enter y teclado. Conserva el select original oculto como autoridad para value, eventos, required, disabled y FormData. |
| Superficies blancas/textos neutrales fijos entre pantallas | Tokens semánticos de superficie, texto y bordes; layout/CSS propios de Inventario, sin sobrescribir otros módulos. Se conservan colores semánticos de estado y capas gráficas de WMS. Los menús en portal mantienen contraste de opción activa en ambos temas. |
| Navegación móvil ocupa gran parte de la primera pantalla | Dominios en dos columnas, subnavegación plegada bajo demanda y pasos de producto compactos. La coincidencia más específica evita activar Productos y Nuevo producto simultáneamente; reportes generales pertenece a Existencias. |
| Stock solo cargaba la primera página del API y presentaba sus conteos como catálogo | Consulta all=true compatible con API existente; aviso si total supera las referencias cargadas. Paginación de 25, etiquetas interactivas Todas/Críticas/Agotadas, estados de carga y vacío. |
| Kardex inicia sin rango y despliega hasta 300 filas | Mes actual inicial, consulta histórica explícita, fechas relacionadas/validadas, paginación de 25 y aviso si el servidor devuelve un conjunto parcial. El extremo Hasta se envía como fin del día en ISO, acorde con el horario de presentación del navegador. |
| Respuestas antiguas pueden reemplazar el producto/bodega recién elegidos | Secuencias de consulta para Kardex/costos; limpiar Kardex al cambiar SKU y descartar respuestas obsoletas. Se retiró la consulta duplicada inicial de costos. |
| El acumulado del rango puede confundirse con stock actual | Columna/exportación Variación acumulada y explicación junto al Kardex. Las métricas superiores siguen representando stock/costo actuales; no se presenta valorización histórica. |
| Reporte de costos extenso y sin resumen operativo | Costos y valorización con etiquetas Todos/Con existencias/Sin existencias/En tránsito; resumen conciliado con cantidades de las bodegas y costo promedio, y páginas de 25 productos. El estado de existencias respeta la bodega seleccionada. |
| Exportar solo una página podría ocultar datos | Excel conserva todos los productos/ubicaciones del resultado filtrado cargado, independientemente de la página. Aviso de consulta parcial cuando corresponde. |
| Detalles de existencias/documentos con overlays propios | ModalFrame compartido, título accesible, cierre y contenido con desplazamiento interno. |

## Alcance de validación

Certificación versionada: `node scripts/certifications/inventory-modern-ui-local.cjs`. Usa API y navegador reales locales; bloquea escrituras de negocio y destinos HTTP remotos. Recorre las 17 rutas, controles con búsqueda/Enter, temas y móvil. Verifica etiquetas de Stock/costos, correspondencia del catálogo cargado, valor del resumen de costos contra cantidades por bodega, exportación completa, detalle por bodega, rango actual/histórico/error de Kardex y asistente de producto hasta revisión, incluyendo las restricciones de servicios sin inventario. No guarda el producto de ensayo.

Resultado final: **114/114 comprobaciones funcionales aprobadas**. Evidencia y hashes en `C:/Users/mq1/AppData/Local/Temp/apex-inventory-modern-Yu1SnO/evidence.json`. Capturas de escritorio/móvil, claro/oscuro, detalle y revisión del producto en esa carpeta; revisadas visualmente.

ESLint del alcance y TypeScript web aprobados; las seis pruebas de inventory-improvements-roadmap y git diff --check también aprobaron. Las ejecuciones iniciales de la prueba identificaron un selector que intentaba pulsar un botón oculto y una lectura directa de costos no comprobada antes de usar sus datos; se corrigieron en el certificado y se completó una nueva ejecución integral, sin omitir controles ni rutas.

## Límites y continuidad

- La certificación es de interfaz/campos/reportes; no ejecuta entradas, salidas, traslados, cargas iniciales ni asientos. Sus servicios y permisos no se modificaron.
- El catálogo local probado tiene nueve referencias. Los límites de montaje están implementados; no es una certificación de rendimiento con miles de SKU ni de paginación de grandes volúmenes.
- all=true y los límites de Kardex/costos conservan los topes del servidor. Los avisos indican cuando la consulta/exportación es parcial; no se promete un histórico ilimitado.
- Se preserva el cálculo existente de movimientos acumulados; no se implementó saldo inicial histórico ni valorización por fecha. Las etiquetas distinguen esos datos de las existencias actuales.
- WMS se revisó como interfaz existente; no se añadió a la navegación ni se certificaron sus operaciones de almacén.
- No se ejecutaron gates de promoción. Los dos fallos generales preexistentes de Transporte documentados anteriormente siguen como bloqueo de publicación/promoción; esta auditoría no los modifica ni certifica una liberación global.

Para la revisión visual del usuario: Inventario → Stock; Existencias → Kardex/Costos; Maestros → Nuevo producto. Reversión puntual mediante hunks del alcance Inventario sobre la base actual, preservando el trabajo anterior.
