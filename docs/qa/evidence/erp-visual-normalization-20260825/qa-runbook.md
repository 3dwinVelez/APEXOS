# Runbook visual QA

1. Confirmar que QA ejecuta el commit exacto promovido a `develop`.
2. Iniciar sesión en NYVORA con un rol autorizado y recorrer las portadas de Inventario, Contabilidad, Tesorería y Ventas.
3. Verificar que cada tarjeta abre la ruta indicada y que no aparecen funciones futuras, tarjetas sin acción ni accesos duplicados.
4. Abrir Nuevo cliente y Nueva orden; comprobar etiquetas, navegación por teclado, validaciones, cancelación y guardado.
5. En Tesorería cambiar entre Recaudos y pagos, Bancos y Movimientos; comprobar filtros, selección y mensajes sin efectuar registros no autorizados.
6. Recargar cada ruta y comprobar que navegación, datos y permisos se conservan.
7. Repetir con rol solo lectura y validar que el rediseño no expone acciones prohibidas.
8. Adjuntar capturas sanitizadas y aprobación funcional antes de cualquier propuesta hacia `main`.
