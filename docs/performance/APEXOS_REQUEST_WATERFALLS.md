# Cascadas de solicitudes

## Pantalla autenticada fría

La lectura del código demuestra esta cascada máxima para permisos:

1. documento + chunks;
2. en paralelo: `platform_admins` y `user_companies`;
3. después de escoger empresa: `role_context_api` y `employee_role_context` (en el código se esperan secuencialmente);
4. después: `company_module_status`;
5. el guard libera la página;
6. la página inicia sus propias consultas.

Esto equivale a hasta cinco llamadas remotas en tres/cuatro olas antes o alrededor del contenido útil. `Sidebar` y `RouteAccessGuard` comparten la promesa en vuelo, pero la página permanece bajo el guard.

## Evidencia QA histórica

El benchmark no autenticado/configurado sin API del 27 de julio (10 solicitudes concurrentes por objetivo) midió:

| Capa/objetivo | Promedio | p95 | Payload medio |
|---|---:|---:|---:|
| documento Dashboard | 110.45 ms | 120.93 ms | 36.0 kB |
| documento Usuarios/Roles | 115.07 ms | 125.07 ms | 36.4 kB |
| documento Servicios | 122.14 ms | 134.96 ms | 32.85 kB |
| Supabase órdenes | 308.97 ms | 371.69 ms | 8.10 kB |
| Supabase evidencias metadata | 200.18 ms | 399.75 ms | 34.05 kB |
| Supabase empleados | 176.56 ms | 354.39 ms | 7.47 kB |
| Supabase vehículos | 154.79 ms | 157.36 ms | 2.22 kB |

La respuesta del documento no es el cuello único. Las consultas Supabase presentan mayor latencia y dispersión, y una cascada de tres olas puede dominar el tiempo útil aunque cada payload sea pequeño.

## Límites de la medición

No había credenciales QA en el entorno, por lo que no fue posible capturar una traza autenticada por ruta, React Profiler, caché caliente/fría, foco, Fast/Slow 4G o detalle API→DB. No se atribuye a base de datos lo que solo se midió como REST. Para cerrar esta brecha se requiere una cuenta QA por rol y trazas `Server-Timing`/OpenTelemetry con fases middleware, auth, servicio y SQL.
