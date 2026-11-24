# Performance Anti-patterns

| Prohibido | Corrección obligatoria |
| --- | --- |
| Listado sin límite | Cursor o límite explícito |
| Consulta dentro de un ciclo | Consulta agrupada y mapa en memoria |
| `select *` en ruta crítica | Selección mínima por pantalla |
| Refetch completo después de una mutación | Actualización local e invalidación específica |
| Base64 en respuesta o base de datos | Storage privado y ruta firmada |
| Auth o permisos repetidos | Contexto por solicitud y caché acotada. Medido y corregido 2026-11-24: `/auth/me` pagaba 4 sentencias (`include` de rol+permisos + tenant aparte) sobre el `Server-Timing` `db` de 3.273 ms, cuando la única sentencia del snapshot de autorización ya trae usuario, rol, permisos y tenant — y el middleware la ejecuta en cada petición autenticada. El handler ahora reusa esa lectura (`readAuthorizationSnapshot`), no una caché |
| `include` de Prisma en la decisión de autorización | Una sola sentencia: el costo es por viaje al pooler, no por trabajo |
| Fan-out de sentencias para pintar una pantalla | Un viaje por necesidad de datos: agregar con `GROUP BY` compuesto y derivar en memoria (medido 2026-11-24: ≈9 sentencias y 8,0 s de SQL para responder 7 KB; cada viaje ≈660 ms) |
| Optimizar sin leer `Server-Timing` | Descomponer `app` / `auth` / `db` del encabezado que ya emite el API antes de tocar la consulta |
| Maestro solicitado por cada componente | Lectura compartida con TTL |
| Procesamiento de imagen en el hilo principal | Compresión controlada y subida no bloqueante |
| Polling sin visibilidad ni backoff | Evento, refresh manual o polling adaptativo |
| Métrica sin escenario reproducible | Runner, entorno, concurrencia y reporte JSON |
| Declarar lint exitoso sin ejecutarlo | `npm run lint` obligatorio en CI |

Las excepciones requieren medición antes/después, justificación, propietario y fecha de revisión.
