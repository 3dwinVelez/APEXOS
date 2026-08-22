# Evidencia de errores y negativas

Controles aprobados en QA:

- peticion administrativa sin sesion: `401`;
- operacion cross-tenant: `403`;
- correo duplicado: rechazado con codigo contractual;
- contraseña anterior despues de rotacion: rechazada;
- login del usuario inactivado: rechazado;
- cualquier resultado parcial del certificado produce codigo de salida distinto de cero y ejecuta limpieza en `finally`.
