# Security Review — hr-report-modal-scroll-lock-20261001

RESULTADO: passed.

El cambio es exclusivamente frontend en la vista del reporte de Talento Humano. No modifica APIs, autenticacion, autorizacion, RLS, multiempresa, secretos, variables de entorno, infraestructura, migraciones ni persistencia de datos.

Riesgo revisado: bloqueo de scroll del documento mientras existe un dialogo modal. El cleanup restaura el valor previo de `document.body.style.overflow`, evitando dejar la aplicacion bloqueada despues de cerrar.

