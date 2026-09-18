# Escenarios negativos

Fecha: 2026-08-24

- Las rutas administrativas `/hr/employees`, `/hr/routes`, `/hr/operations-map` y `/hr/attendance` devolvieron `403 PERMISO_DENEGADO`.
- El intento de marcar un horario asignado a otro empleado devolvió `403 HORARIO_AJENO_DENEGADO`.
- Los campos falsificados `employee_id` y `user_name` fueron reemplazados por la identidad autenticada al crear marcaciones, actividad y GPS.
- Las URL visibles de Dashboard, Servicios y mapa de Talento Humano fueron redirigidas a Marcaciones.
- La consola del navegador no registró errores durante el flujo autenticado.

No se probaron indisponibilidad ni latencia artificial en esta fase porque el cambio no agrega transporte, reintentos ni contrato de red. Esos casos permanecen dentro del barrido transversal obligatorio antes de `main`.
