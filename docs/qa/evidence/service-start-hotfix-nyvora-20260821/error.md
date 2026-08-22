# Escenarios negativos

- El certificado Nyvora bloqueó al rol sin permiso especial.
- Un usuario de otro tenant no pudo intervenir la orden Nyvora.
- El estado de la segunda solicitud no cambió al iniciar la primera.
- Antes del hotfix, una solicitud externa `legacy` terminaba silenciosamente sin petición; la prueba automatizada exige que esa guarda no exista.
- No se incorporaron migraciones ni módulos del tren ERP revertido.

Resultado: aprobado.
