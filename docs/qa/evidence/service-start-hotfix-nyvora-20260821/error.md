# Escenarios negativos

- El certificado Nyvora bloqueó al rol sin permiso especial.
- Un usuario de otro tenant no pudo intervenir la orden Nyvora.
- El estado de la segunda solicitud no cambió al iniciar la primera.
- Antes del hotfix, una solicitud externa `legacy` terminaba silenciosamente sin petición; la prueba automatizada exige que esa guarda no exista.
- No se incorporaron migraciones ni módulos del tren ERP revertido.
- La primera certificación productiva detectó un `409 DUPLICADO`: el generador de consecutivos elegía la última fila y fallaba cuando su número era de estrés (`NYV-stress-*`). La corrección ignora identificadores no canónicos y calcula el máximo `OS-<dígitos>` del tenant.
- La regresión reproduce números canónicos, importados y de estrés; QA volvió a crear la orden Nyvora sin conflicto.

Resultado: aprobado.
