# Metrics Endpoint Protection

`/health` permanece público para health checks. `/metrics` requiere un secreto exclusivo de monitoreo.

## Configuración

1. Genere un valor aleatorio de al menos 32 bytes.
2. Configure `METRICS_AUTH_TOKEN` solamente en API/Railway y en el colector.
3. Envíe `Authorization: Bearer <token>` o `X-Metrics-Token: <token>`.
4. Rote el valor coordinando primero el colector y luego la API.

El token no debe reutilizar `JWT_SECRET`, service role ni credenciales de base de datos. El endpoint limita cada origen a 30 solicitudes por minuto y responde con un error genérico cuando la credencial falta o es incorrecta.

## Rollback

Revertir el commit restaura el endpoint anterior. No debe eliminarse `METRICS_AUTH_TOKEN` antes del rollback porque el endpoint falla cerrado cuando no está configurado.
