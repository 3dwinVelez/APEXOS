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
| `findFirst` por correo sobre un índice `(tenant_id, email)` | El correo no es único entre empresas: leer **todas** las filas en una sentencia y decidir sobre el conjunto. Medido 2026-11-24 con `scripts/security/auth-email-collision-census.js`: QA tiene **7 correos en 2 o 4 empresas** (uno activo en 4), Producción 0. Elegir una fila al azar mete al usuario en la empresa equivocada con una sesión válida |
| Repetir en el handler la lectura que `validateAuthorization` ya pagó | Reusar el payload del snapshot: `refresh()` volvía a traer usuario+rol+empresa con `include` (3 sentencias extra) y `fingerprintLogin()` otras 4, sobre los mismos datos que la sentencia de autorización ya devolvió (medido 2026-11-24 con `node --test apps/api/test/auth-session-hardening.test.js`: 4→1 y 5→1 sentencias por operación) |
| Copiar el SQL en el fixture en vez de capturarlo del código | El guard carga el módulo con `core/prisma` stubbeado y **atrapa las sentencias que el código manda** (`capturarSentencias`), para que una edición futura del SQL cambie lo que se verifica. Un `SQL_COPIA` en el test se oxida sin avisar |
| Aceptar `0 filas` como verde en un instrumento de base | Un guard que no puede fallar no guarda: `\gdesc` fija las cuatro columnas del snapshot y la corrida contra datos vivos exige `filas > 0` (QA devolvió 2 filas con un correo de colisión real; Producción 1) |
| Maestro solicitado por cada componente | Lectura compartida con TTL |
| Procesamiento de imagen en el hilo principal | Compresión controlada y subida no bloqueante |
| Polling sin visibilidad ni backoff | Evento, refresh manual o polling adaptativo |
| Métrica sin escenario reproducible | Runner, entorno, concurrencia y reporte JSON |
| Declarar lint exitoso sin ejecutarlo | `npm run lint` obligatorio en CI |

Las excepciones requieren medición antes/después, justificación, propietario y fecha de revisión.
