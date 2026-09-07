# Evidencia de errores y seguridad

- Usuario autenticado sin permiso Apex Heart: HTTP 403.
- Usuario administrador de otro tenant intentando reconocer una alerta: HTTP 404.
- Petición sin autenticación: HTTP 401.
- Periodo invertido: protegido por validación HTTP 400 en el servicio.
- La certificación limpia usuarios, sesiones y empresa temporal aun cuando falla.
- La cadena histórica de migraciones de la base local principal tiene una falla previa ajena; no se reinició ni destruyó esa base. La migración aditiva se probó en `apexos_heart_cert`.
