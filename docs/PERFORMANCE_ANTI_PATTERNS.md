# Performance Anti-patterns

| Prohibido | Corrección obligatoria |
| --- | --- |
| Listado sin límite | Cursor o límite explícito |
| Consulta dentro de un ciclo | Consulta agrupada y mapa en memoria |
| `select *` en ruta crítica | Selección mínima por pantalla |
| Refetch completo después de una mutación | Actualización local e invalidación específica |
| Base64 en respuesta o base de datos | Storage privado y ruta firmada |
| Auth o permisos repetidos | Contexto por solicitud y caché acotada |
| Maestro solicitado por cada componente | Lectura compartida con TTL |
| Procesamiento de imagen en el hilo principal | Compresión controlada y subida no bloqueante |
| Polling sin visibilidad ni backoff | Evento, refresh manual o polling adaptativo |
| Métrica sin escenario reproducible | Runner, entorno, concurrencia y reporte JSON |
| Declarar lint exitoso sin ejecutarlo | `npm run lint` obligatorio en CI |

Las excepciones requieren medición antes/después, justificación, propietario y fecha de revisión.
