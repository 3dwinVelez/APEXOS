# Regresión

- Sesión, órdenes, referencias, empleados, inventario y contabilidad respondieron en QA.
- Roles autorizado, limitado y otro tenant conservaron sus límites.
- El cambio está aislado en la vista de operación, el formulario externo, el adaptador de Servicios y tres pruebas.
- No contiene cambios de esquema, migraciones, infraestructura ni contratos ERP.
- Solicitudes múltiples conservan estado, inspección y evidencia independientes.
- La numeración automática ahora deriva el siguiente consecutivo del mayor identificador canónico `OS-<dígitos>` y no de la última fila insertada.
- La creación real en QA confirmó que los registros `NYV-stress-*` ya no provocan colisión con `OS-00001`.

Resultado: aprobado.
