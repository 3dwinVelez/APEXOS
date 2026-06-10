# Auditoria de latencia QA - APEXOS / NYVORA

Fecha: 2026-06-05
Rama: `performance/qa-latency-audit`
Base: `origin/develop` commit `496a649`
Ambiente intervenido: Supabase QA y codigo local de la rama. Produccion no fue consultada ni modificada.

## 1. Resumen ejecutivo

La lentitud percibida no se explica principalmente por falta de CPU o memoria. El frontend Railway caliente responde con rapidez, pero varias pantallas agregan demasiadas consultas y viajes de red hacia Supabase. El dashboard y Servicios son los casos mas visibles.

Hallazgos principales:

- Railway frontend presento un primer acceso de aproximadamente 510 ms y accesos calientes de 83-89 ms. Hay cold start o calentamiento inicial visible, pero no es el cuello de botella dominante.
- Las lecturas directas Supabase tienen una base de red aproximada de 230-280 ms por request.
- La carga Supabase de Servicios realizaba cuatro consultas dependientes de forma secuencial despues de consultar ordenes. El tramo medido paso de 930 ms secuencial a 423 ms al ejecutarlo en paralelo.
- `loadModuleAccess` realizaba hasta tres consultas secuenciales por navegacion. Ahora las dos primeras corren en paralelo y el resultado se conserva 60 segundos por pestana.
- El mapa operativo podia traer hasta 7.000 GPS, 2.000 marcaciones y 2.000 actividades en una sola carga. Se redujeron los defaults, conservando limites superiores configurables.
- Existian listados API sin limite obligatorio en usuarios, roles, referencias, vehiculos, compras, ventas, facturacion y cuentas contables.
- `pg_stat_statements` mostro como consulta historicamente mas costosa una lectura de `service_evidence` por multiples ordenes: 134 llamadas, media 2.149 ms y 287.990 ms acumulados.
- Supabase QA tiene poco volumen actual; el problema es el patron de consulta y RLS repetitiva, no el tamaño presente de las tablas.

Dictamen: **QA ACEPTABLE CON OBSERVACIONES**. Puede continuar con pruebas controladas. Antes de produccion se debe confirmar la configuracion Railway backend, region y pooler, y reducir las consultas agregadas restantes.

## 2. Linea base medida

### Railway frontend

| Prueba | Resultado |
|---|---:|
| `/login` primer acceso observado | 510 ms |
| `/login` acceso caliente | 83 ms |
| `/dashboard` HTML caliente | 89 ms |

### Supabase QA, lectura individual

| Recurso | Latencia observada |
|---|---:|
| Auth SCJ | 1.223 ms |
| `v_user_companies` primer acceso | 1.501 ms |
| Servicios | 264 ms |
| Empleados | 259 ms |
| Vehiculos | 258 ms |
| Marcaciones | 264 ms |
| GPS | 246 ms |

### Concurrencia posterior a indices QA

No se presentaron errores ni timeouts en 10, 50 o 100 solicitudes concurrentes.

| Recurso, 100 concurrentes | Promedio | p95 | Errores |
|---|---:|---:|---:|
| Railway `/dashboard` | 199 ms | 263 ms | 0 |
| Railway `/login` | 310 ms | 451 ms | 0 |
| Supabase empresas del usuario | 407 ms | 478 ms | 0 |
| Supabase servicios | 688 ms | 821 ms | 0 |
| Supabase empleados | 715 ms | 864 ms | 0 |
| Supabase vehiculos | 410 ms | 501 ms | 0 |
| Supabase marcaciones | 672 ms | 1.017 ms | 0 |
| Supabase GPS | 438 ms | 623 ms | 0 |

Evidencia: `reports/performance/qa-latency-2026-06-05T17-42-59-769Z.json`.

## 3. Endpoints y pantallas con mayor costo

### Dashboard

El dashboard inicia cinco flujos funcionales en paralelo, ademas de resolver acceso a modulos. En sesion Supabase, cada flujo puede convertirse en varias lecturas REST:

- Servicios: ordenes + referencias + piezas + incidentes + evidencias.
- Mapa operativo: rutas + empleados + asignaciones + GPS + marcaciones.
- Asistencia.
- Metricas de vehiculos.
- Metricas preoperacionales.

La carga HTML es rapida; la espera ocurre al hidratar datos.

### Servicios

Antes, referencias, piezas, incidentes y evidencias se consultaban secuencialmente. Se paralelizaron sin modificar la respuesta. El listado Supabase ahora respeta el `limit` solicitado y usa 50 por defecto.

### Talento Humano / mapa

`/api/v1/hr/operations-map` ejecuta seis consultas. En prueba funcional local registro 98-199 ms y seis queries. Los defaults fueron reducidos:

- GPS del dia: 2.000 a 1.000.
- Ultimas huellas: 5.000 a 2.000.
- Marcaciones: 2.000 a 1.000.
- Actividades: 2.000 a 1.000.

Los limites maximos anteriores siguen disponibles mediante query params.

### Compras

La recepcion de compra alcanzo 16 queries en una operacion. Es consistente con validacion linea a linea y movimientos; no se refactorizo por riesgo funcional. Debe revisarse con lotes grandes.

### Contabilidad

Los reportes incluyen movimientos por cuenta y pueden crecer de forma proporcional al volumen. Los indices actuales cubren varios filtros, pero los reportes deben evolucionar a agregaciones SQL o vistas materializadas cuando exista volumen real.

## 4. Cambios aplicados

- Middleware QA de performance para API:
  - endpoint, metodo, status, duracion, usuario, empresa y conteo de queries.
  - header `Server-Timing`.
  - activacion con `PERFORMANCE_LOG_ENABLED=true` o `APP_ENV=qa`.
- Conteo de queries Prisma por request usando contexto asincrono.
- Paginacion y limites conservadores en listados API.
- Paralelizacion de consultas Supabase de Servicios.
- Cache de acceso a modulos por 60 segundos en `sessionStorage`.
- Limites reducidos y configurables para mapa operativo.
- Script reproducible `npm run qa:performance`.
- Migraciones no destructivas de indices Prisma y Supabase.

## 5. Indices creados en Supabase QA

Aplicados y verificados el 2026-06-05:

- `company_users(user_id, status, company_id)`
- `employees(user_id, company_id, status)` parcial para usuarios asociados
- `service_evidence(company_id, order_id, created_at desc)`
- `service_incidents(company_id, order_id)`
- `route_assignments(company_id, employee_id, status, route_id)`

Indices Prisma versionados:

- terceros por tenant/tipo/activo/nombre
- transacciones por tenant/tipo/fecha
- CxP por clase/fecha y proveedor/vencimiento
- GPS por tenant/fecha
- servicios por tenant/fecha
- nomina por tenant/fecha

No se borraron tablas, datos, constraints ni policies.

## 6. Supabase y RLS

Supabase QA usa el transaction pooler `aws-1-us-east-2.pooler.supabase.com:6543`. La conexion fue estable durante la auditoria.

Estado observado:

- 15 conexiones idle y una activa durante la consulta.
- `pg_stat_statements` habilitado.
- `company_users` presenta un numero alto de scans por las policies y vistas de acceso.
- Las policies llaman helpers `app_private` por fila; los indices agregados reducen el costo de esas verificaciones sin relajar seguridad.

Recomendacion Railway + Prisma:

- Usar el transaction pooler en runtime.
- Configurar `pgbouncer=true`, `connection_limit` bajo y `pool_timeout`.
- Usar conexion directa solo para migraciones controladas.
- Mantener Railway y Supabase en regiones cercanas. Supabase QA esta en `us-east-2`; la region Railway debe confirmarse manualmente.

## 7. Railway

Confirmado:

- Frontend responde correctamente bajo 100 solicitudes concurrentes.
- Existe calentamiento inicial visible.

No verificable desde el repositorio:

- plan y recursos CPU/RAM actuales;
- region exacta del servicio Railway;
- always-on/sleep;
- variables reales del backend Railway;
- URL publica del backend QA y su healthcheck remoto.

Antes de aumentar infraestructura:

1. Confirmar region Railway cercana a `us-east-2`.
2. Confirmar `DATABASE_URL` usando pooler 6543, no direct connection.
3. Configurar `PERFORMANCE_LOG_ENABLED=true` en backend QA.
4. Confirmar `NEXT_PUBLIC_API_URL` del frontend QA.
5. Observar p95 y query count por 48 horas.
6. Activar always-on solo si se confirma suspension/cold start frecuente.

## 8. Riesgos restantes

### Alto

- Identidad dividida Supabase Auth / usuarios Prisma. La auditoria funcional sigue detectando que un token Supabase no funciona en todos los endpoints Prisma.
- No se pudo medir la API Railway remota porque su URL publica/configuracion no esta disponible en el repositorio ni en el ambiente local.

### Medio

- Dashboard todavia agrega muchos recursos; requiere un endpoint de resumen o RPC agregada en una fase posterior.
- Reportes contables pueden cargar demasiados movimientos a medida que crezcan.
- Recepcion de compras ejecuta hasta 16 queries por operacion.
- `v_user_companies` sigue siendo una lectura relativamente costosa; el cache reduce impacto percibido.

### Bajo

- Persisten 55 warnings de lint no bloqueantes.
- Algunas imagenes frontend no usan optimizacion de Next.

## 9. Pruebas ejecutadas

- `npm run lint`: OK, 0 errores, 55 warnings.
- `npm --workspace apps/web run build`: OK.
- Typecheck: OK mediante build y ejecucion directa de `tsc --noEmit`.
- `npx prisma validate`: OK.
- API `/health` instrumentada: 200, `Server-Timing` presente, una query.
- Auditoria funcional integral: todos los flujos API pasaron; persiste falla conocida de autenticacion dual.
- Estrés lineal: 10 escenarios Talento Humano y 10 Servicios, todos correctos.
- Concurrencia: 10/50/100, cero errores.
- Migraciones de indices: validadas con rollback, aplicadas solo en QA y verificadas.

## 10. Decision

**QA ACEPTABLE CON OBSERVACIONES**

No se recomienda aumentar infraestructura aun. Primero se debe desplegar esta rama en QA, habilitar logging de performance y confirmar la configuracion real Railway/API. El siguiente cuello de botella a resolver, si la latencia persiste, es crear endpoints agregados para dashboard/reportes y cerrar la identidad dividida Supabase/Prisma.
