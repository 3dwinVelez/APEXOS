# Pruebas de error

- Respuestas de catalogos vacias o envueltas no provocan llamadas `.find` sobre valores indefinidos.
- Ordenes sin `incidents`, `photos` o `items` se normalizan antes de renderizar o fusionar el monitor.
- La regresion transversal comprobo que solicitudes sin autenticacion son rechazadas.
- El script de certificacion detiene la aprobacion ante SHA distinto, credenciales invalidas, falta de maestros o perdida de datos al reabrir.
