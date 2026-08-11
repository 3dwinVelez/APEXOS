# Pruebas de error

- El monitor conserva el ultimo resumen valido si falla temporalmente `event-summaries`.
- El detalle conserva el ultimo mapa valido si falla `operations-map`.
- El agregador acepta horarios sin eventos y fechas de evento invalidas sin romper la respuesta.
- El validador de aprobacion rechaza manifiestos pendientes o incompletos.
- Los eventos sin `route_id` se asocian por fecha de Bogota e identidad; una ruta explicita en metadata evita asociaciones duplicadas.
