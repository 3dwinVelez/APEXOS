# Diagnostico de marcaciones bajo concurrencia

## Causas confirmadas

1. Las pruebas historicas registraron agotamiento del pool/sesion (`EMAXCONNSESSION`) durante rafagas de usuarios.
2. La transaccion de marcacion tenia `timeout` de ejecucion, pero conservaba una espera de adquisicion demasiado corta para cargas masivas.
3. Las carreras de secuencia se reintentaban junto con rechazos funcionales y podian terminar como falsos `JORNADA_COMPLETA` o `MARCACION_FUERA_DE_SECUENCIA`.
4. El cliente no enviaba una clave idempotente; una respuesta perdida podia provocar un segundo intento indistinguible y duplicar o desordenar la secuencia.
5. La cola optimista reintentaba permanentemente cualquier `4xx`, dejando una solicitud invalida al frente y bloqueando eventos posteriores.
6. La consulta autocontenida aceptaba rangos del cliente y exponia horarios asignados fuera del dia actual.
7. La primera correccion con aislamiento `Serializable` fue rechazada por la precertificacion: las consultas de identidad/metadatos generaban conflictos de predicado entre empleados diferentes. Se retiro ese aislamiento y se mantuvo el bloqueo asesor granular por empleado, que protege la secuencia sin serializar toda la carga.

## Correccion aplicada

- Bloqueo transaccional granular por empleado/horario/dia, aislamiento serializable y reintento limitado a errores transitorios.
- Idempotencia persistida y unica en Prisma y Supabase.
- Clasificacion cliente de fallos permanentes y transitorios.
- Restriccion del horario del dia en API, mutaciones autocontenidas y UI.

La certificacion remota solo puede declararse aprobada después de desplegar el commit exacto en QA, aplicar ambas migraciones y ejecutar la prueba masiva y el flujo real de navegador.
