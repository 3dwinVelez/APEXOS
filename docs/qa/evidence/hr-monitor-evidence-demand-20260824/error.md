# Casos de error y seguridad

- Un usuario con rol exclusivo de marcaciones recibio `403 PERMISO_DENEGADO` al intentar leer evidencia del monitor.
- Un identificador inexistente devolvio `404 EVIDENCIA_MONITOR_NO_ENCONTRADA`.
- Una consulta con el tenant alterno no pudo recuperar la evidencia de NYVORA.
- La interfaz conserva un estado de carga independiente por evidencia y ofrece `Reintentar evidencia` ante un fallo controlado.
- No se registraron errores en la consola del navegador durante la carga de las dos imagenes.
