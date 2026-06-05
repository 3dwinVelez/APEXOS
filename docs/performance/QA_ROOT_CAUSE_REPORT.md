# QA Root Cause Performance Report

Fecha: 2026-06-05
Rama: `performance/qa-root-cause-analysis`
Base: `origin/develop` commit `acc9de1`
Ambiente intervenido: codigo aislado y Supabase QA en operaciones de lectura. Produccion no fue consultada ni modificada.

## 1. Resumen ejecutivo

La lentitud de QA no se explica principalmente por falta de CPU, RAM o plan contratado. Se confirmaron dos causas raiz criticas:

1. `service_evidence.file_url` almacena fotografias completas como `data:image/...;base64`. Solo 28 registros ocupan 43 MB. El frontend solicitaba esas imagenes en bloque al abrir Servicios y el dashboard.
2. El bundle publico de QA contiene `http://127.0.0.1:3000` como API y no contiene una URL Railway API. En sesiones Supabase, gran parte del frontend ejecuta consultas directas mediante `supabaseApiFallback`; los flujos sin fallback intentan localhost. El backend Railway no participa consistentemente en la navegacion QA.

Tambien se confirmaron causas altas:

- Cargas globales duplicadas de permisos y presencia de usuario.
- `GET /admin/users` podia crear roles y permisos durante una lectura. En un tenant sin roles base, registro 18 queries y 15,9 segundos.
- Administracion solicitaba roles dos veces: `/admin/roles` y nuevamente dentro de `/admin/user-master-data`.
- Existen 50 `findMany` potencialmente sin limite cercano y 24 con `include` sin limite cercano. Son riesgos de crecimiento, aunque varias consultas internas estan acotadas por relaciones.

Dictamen actualizado: **QA ESTABLE CON RIESGOS CONTROLADOS**. Las evidencias fueron migradas a Storage privado y los uploads nuevos ya no persisten base64. No se recomienda produccion hasta configurar y verificar la ruta API Railway y completar medicion autenticada por pantalla.

## 2. Causa raiz confirmada

### Evidencias fotograficas embebidas

| Medicion | Resultado |
|---|---:|
| Registros `service_evidence` | 28 |
| Tamano total de tabla | 43 MB |
| Tamano logico de `file_url` | 41 MB |
| Promedio por registro | 1.498 KB |
| Registro mayor | 5.788 KB |
| Registros `file_url` base64 | 19 |
| Objetos Storage de servicios | 0 |

Comparacion real Supabase REST:

| Consulta | Tiempo | Respuesta |
|---|---:|---:|
| Evidencias incluyendo `file_url` | 148.642 ms | 40,95 MB |
| Evidencias sin `file_url` | 1.018 ms en medicion aislada; 310 ms en benchmark caliente | 7,54 KB |

Validacion posterior a migracion:

| Consulta | Antes | Despues |
|---|---:|---:|
| Evidencias incluyendo `file_url` | 148.642 ms / 40,95 MB | 184,66 ms / 17,36 KB |

La reduccion potencial del payload de listas es superior a 99,98%.

`pg_stat_statements` confirma el impacto historico:

- Consulta PostgREST de `service_evidence`: 138 llamadas.
- Media: 2.220,91 ms.
- Tiempo acumulado: 306.485,92 ms.

El `EXPLAIN ANALYZE` directo no identifica un scan costoso: la consulta SQL completa ejecuta en 1,32 ms y la consulta de metadatos en 0,064 ms. El costo dominante es deserializar, transferir y procesar el contenido base64.

### API Railway no conectada al frontend QA

Inspeccion del bundle publico:

- Contiene `127.0.0.1:3000`.
- Contiene el proyecto Supabase QA.
- No contiene URL `railway.app` para API.

`api()` prioriza `supabaseApiFallback` para sesiones Supabase. Por tanto, pagar o escalar el backend Railway no mejora la mayoria de estos flujos mientras el frontend no lo utilice.

## 3. Medicion por pantalla

Los siguientes tiempos son del documento HTML servido por Railway, no del tiempo hasta datos visibles. El navegador autenticado no pudo instrumentarse porque la conexion de automatizacion no estuvo disponible y no existe `QA_SUPABASE_SCJ_PASSWORD` en variables.

| Pantalla | HTML QA | Requests literales de pagina | Endpoint/costo dominante confirmado | Diagnostico |
|---|---:|---:|---|---|
| Login | 485 ms | 1 auth esperado | Auth no medido con credencial real | HTML/cold start visible |
| Dashboard | 85 ms | 5 + cargas globales | `service_evidence` 40,95 MB | Critico: hidratacion, no HTML |
| Usuarios/Roles | 82 ms | 4 iniciales | `/admin/users` hasta 15,9 s | Bootstrap de roles en GET |
| Servicios | 85 ms | 1 logico, expandido a 5 Supabase | `service_evidence` 148,6 s aislado | Critico: fotos en lista |
| Marcaciones | 122 ms | 5 iniciales, 11 flujos totales | Punches 233 ms; GPS 207 ms | Multiples viajes de red |
| Vehiculos | 85 ms | 2 iniciales | Employees 239 ms; vehicles 210 ms | Aceptable con volumen actual |
| Proyectos | 88 ms | 1 inicial | API local contra QA: 2.067 ms | Includes y multiples queries |
| Inventario | 85 ms | 1 inicial | API local contra QA: 925 ms | Riesgo por listados/includes |
| Compras | 88 ms | 1 inicial | API local contra QA: 1.477 ms | Includes y queries auxiliares |
| Contabilidad | 155 ms | 8 iniciales | Reportes paralelos | Arquitectura de carga pesada |
| Nomina/configuracion | 99 ms | 2 iniciales | API local contra QA: 482 ms | Aceptable con volumen actual |

## 4. Requests duplicados y arquitectura frontend

Confirmado por codigo:

- `Sidebar`, `RouteAccessGuard` y `DashboardPage` pueden llamar `loadModuleAccess` simultaneamente.
- El cache en `sessionStorage` no deduplicaba solicitudes ya iniciadas.
- El layout monta dos instancias de `UserSessionBadge`; ambas consultaban `v_user_companies` y registraban presencia.
- Dashboard realiza cinco llamadas logicas. La llamada de Servicios se expande a ordenes, referencias, partes, incidentes y evidencias.
- Contabilidad Reportes inicia ocho consultas en paralelo.
- `AiExperienceLayer` se monta globalmente. Para sesiones Prisma puede solicitar insights en cada cambio de modulo.

Cambios aplicados:

- Deduplicacion en vuelo de `loadModuleAccess`.
- Deduplicacion de consulta de empresa y heartbeat de presencia por 60 segundos.
- Las listas de Servicios ya no solicitan `file_url`; el detalle conserva las fotos.

## 5. Backend y Prisma

La instrumentacion temporal ahora registra de forma segura:

- method, endpoint, status, duration, response size;
- query count, query total, query maxima y queries mayores al umbral;
- user y company cuando existen.

Prueba API local conectada al pooler QA:

| Endpoint | Tiempo cliente | Server timing | Queries observadas | Respuesta |
|---|---:|---:|---:|---:|
| `/health` | 467 ms | 423 ms | 1 | 44 B |
| `/admin/users` antes | 16.003 ms | 15.944 ms | 18 | 1,7 KB |
| `/admin/users` despues, caliente | 897 ms | 826 ms | 1 lectura + auth/cache | 1,7 KB |
| `/admin/roles` | 1.222-1.685 ms | 821-1.307 ms | 2 en primera lectura | 89 KB |
| `/admin/user-master-data` despues | 76 ms | 1,5 ms | 0 | 2,6 KB |
| `/services/orders` despues | 1.163 ms | 1.130 ms | 1 Prisma principal | 1,5 KB |
| `/projects/operational-center` | 2.067 ms | 1.948 ms | 2 principales + includes Prisma | 5,7 KB |
| `/purchases/orders` | 1.477 ms | 1.405 ms | 2 principales + includes Prisma | 2,3 KB |

La prueba local incluye latencia Colombia hacia Supabase `us-east-2`; no representa la latencia exacta de Railway backend. Su utilidad es separar DB/Prisma de render y verificar query count/response size.

Hallazgo de Administracion:

- `ensureSystemRoles()` estaba dentro de endpoints GET.
- Podia crear secuencialmente roles y permisos en la primera lectura.
- Se agrego deduplicacion/cache por tenant.
- `/admin/user-master-data` dejo de consultar y devolver roles que el frontend ya solicita por `/admin/roles`.
- Pendiente estructural: mover el seed de roles base a onboarding/migracion, no a endpoints GET.

## 6. Supabase, RLS e indices

Estado observado:

- PostgreSQL 17.6.
- 1 conexion activa, 14 idle y 8 sin estado en el momento de medicion.
- No hay evidencia de saturacion de conexiones.
- Pooler QA: `aws-1-us-east-2.pooler.supabase.com:6543`.
- Railway frontend responde desde `railway/us-east4-eqdc4a`.
- La region exacta del backend Railway no pudo confirmarse.

RLS:

- `service_evidence` usa `has_company_module`, `is_company_admin` y `can_access_service_order`.
- Los helpers son `STABLE SECURITY DEFINER`, pero ejecutan verificaciones por fila.
- `company_users` acumula 213.731 seq scans con solo 46 filas.
- Los indices creados existen; `idx_company_users_user_status_company` ya registra 30.945 usos.
- Los indices de varias tablas pequenas presentan poco uso porque el optimizador prefiere seq scan con volumen actual.

RLS agrega costo, pero no explica los 40,95 MB ni los 148 segundos de evidencias.

## 7. Concurrencia 1/10/50/100

Benchmarks:

- Antes: `reports/performance/qa-root-cause-2026-06-05T20-18-16-319Z.json`.
- Despues: `reports/performance/qa-root-cause-2026-06-05T21-06-06-788Z.json`.

No hubo errores ni timeouts.

| Objetivo, 100 concurrentes | Promedio | p95 |
|---|---:|---:|
| HTML dashboard | 505 ms | 842 ms |
| HTML usuarios/roles | 743 ms | 1.617 ms |
| HTML servicios | 809 ms | 1.463 ms |
| HTML marcaciones | 704 ms | 1.336 ms |
| HTML proyectos | 694 ms | 1.197 ms |
| Supabase service orders | 1.629 ms | 1.735 ms |
| Supabase evidencias sin foto | 309 ms | 457 ms |
| Supabase employees | 304 ms | 452 ms |
| Supabase vehicles | 287 ms | 367 ms |
| Supabase punches | 274 ms | 373 ms |
| Supabase GPS | 294 ms | 384 ms |

No se ejecuto concurrencia sobre evidencias completas: hacerlo transferiria gigabytes y seria una prueba innecesariamente agresiva para QA.

## 8. Bundle frontend

Build productivo:

- Shared First Load JS: 102 KB.
- Dashboard: 250 KB.
- Proyectos: 239 KB.
- Administracion: 148 KB.
- Servicios: 129 KB.

Dashboard y Proyectos son los bundles mas grandes, pero siguen siendo secundarios frente al payload base64 y la multiplicacion de requests.

## 9. Cambios aplicados en la rama

- Telemetria API con response size y resumen Prisma.
- Deteccion segura de queries lentas mayor a `PERFORMANCE_SLOW_QUERY_MS`.
- Listado frontend de Servicios sin contenido fotografico base64.
- Listado backend de Servicios con resumen de fotos, sin `file_url/base64_data`.
- Uploads nuevos de evidencia enviados al bucket privado `service-images`.
- URLs firmadas normalizadas y verificadas para lectura privada.
- Migracion controlada de 19 evidencias base64 existentes a Storage; quedan 0 data URI.
- Trigger de base de datos que rechaza nuevas evidencias `data:*;base64`.
- Deduplicacion de permisos y presencia global.
- Cache/deduplicacion del bootstrap de roles.
- Eliminacion de roles duplicados en `user-master-data`.
- Scripts:
  - `npm run qa:root-cause`
  - `npm run qa:request-map`

No se modifico produccion.

## 10. Pendientes obligatorios

### Antes de produccion

1. Configurar y verificar `NEXT_PUBLIC_API_URL` con la URL real de Railway API QA.
2. Configurar `QA_API_URL` para medir API Railway directamente.
3. Ejecutar medicion autenticada de tiempo hasta datos visibles y errores de consola.
4. Mover roles base a onboarding/migracion.
5. Revisar los 50 `findMany` potencialmente sin limite y los reportes contables.

### Railway

- Confirmar region del backend, CPU/RAM, restarts y always-on desde Railway.
- Mantener backend cerca de Supabase `us-east-2`.
- Usar transaction pooler en runtime con connection limit bajo.
- No aumentar recursos hasta medir API Railway con la telemetria agregada.

## 11. Validaciones

- `npm run lint`: OK, 0 errores y 55 warnings existentes.
- `npm --workspace apps/web run typecheck`: OK.
- `npm --workspace apps/web run build`: OK.
- `npx prisma validate`: OK.
- Sintaxis Node y `git diff --check`: OK.
- API local conectada a Supabase QA: OK.
- Benchmark 1/10/50/100: cero errores.
- Storage QA: 19 evidencias migradas, 0 data URI y 19 objetos persistentes.
- Smoke autenticado Storage: login, upload, metadata, URL firmada, lectura y limpieza OK.
- Proteccion base64: insercion autenticada rechazada por trigger.

## 12. Dictamen final

**QA ESTABLE CON RIESGOS CONTROLADOS**

La causa principal fue corregida sin aumentar plan: las listas ya no descargan evidencias base64, las 19 evidencias existentes residen en Storage privado y la base rechaza nuevas data URI. QA puede desplegar esta rama para validacion controlada. No debe promoverse a produccion hasta configurar la API Railway real y completar medicion autenticada por pantalla.
