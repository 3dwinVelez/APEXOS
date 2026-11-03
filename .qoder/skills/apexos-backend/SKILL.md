---
name: apexos-backend
description: Experto de backend del Equipo APEXOS: Fastify, Node.js 22, BullMQ, Prisma, servicios, autenticación JWT, RBAC/ABAC y aislamiento multi-tenant. Usar para endpoints nuevos o modificados, lógica de módulos (Servicios, Talento Humano, etc.), correcciones administrativas, hooks de auditoría, colas de trabajo o sincronización con Supabase.
when_to_use: Cambios en apps/api, endpoints, lógica de servicios, auditoría, colas BullMQ, sincronización Supabase, RBAC, jobs y contextos de tenant.
version: 2.4.0
updated_at: 2026-11-03
contract: 2
---

# Experto de backend — Equipo APEXOS

## Alcance

- Decide sobre: `apps/api/src/**`, `apps/api/server.js`, `apps/api/worker.js`, contratos de endpoints, validación de entrada, lógica de módulos, colas BullMQ, hooks de auditoría, contexto de tenant y RBAC/ABAC de aplicación.
- No decide sobre: esquema y migraciones (`apexos-db-nube`), políticas de seguridad profundas o secretos (`apexos-seguridad`), UI (`apexos-frontend`), certificación funcional (`apexos-qa`).
- Archivos que le pertenecen: `apps/api/src/**`, `apps/api/server.js`, `apps/api/worker.js`, `packages/types/**` y sus pruebas en `apps/api/test/`.
- Es dueño del contexto de `apps/api/src/**` en la cobertura de agentes.

## Lecturas obligatorias

Antes de actuar, leer en este orden:

1. `docs/project/CONTRATO_EQUIPO_APEXOS.md`
2. `docs/MULTITENANT_DATA_ISOLATION.md` y `docs/NYVORA_RBAC_ABAC_MATRIX.md`
3. `docs/END_TO_END_PERFORMANCE_TRACING.md`
4. `apps/api/server.js` (hooks globales, rate limit, CORS, headers)
5. La ruta, el servicio y el esquema del módulo que se va a tocar
6. `apps/api/test/` del dominio, incluida una prueba existente como referencia

Si el cambio toca HR, leer además `docs/audits/2026-10-30-marcaciones-nomina/07-ejecucion-remediacion.md`.

## Reglas duras

1. **Sin contexto de tenant no hay consulta.** Toda operación corre dentro de `runWithTenant` (o `prisma.runWithTenant`), y el `tenant_id` sale de `request.user`, nunca del cuerpo. Por qué: se midió una fuga de 168 filas de 29 tenants por una lectura sincrónica sin contexto; el middleware es el único filtro en tablas sin RLS.
2. **Permiso explícito en cada mutación.** Usar `requirePermission`, `requireExplicitPermission`, `requireAnyPermission` o `requireAnyAdminCapability`/`requireAdminCapability`; no comparar strings de rol a mano. Los borrados físicos exigen `requirePhysicalDeleteGrant`.
3. **JWT y sesión.** Solo HS256 con `JWT_SECRET` de al menos 24 caracteres; verificar con `timingSafeEqual` y rechazar otros algoritmos y tokens expirados. Nunca registrar tokens, contraseñas ni cabeceras de autorización.
4. **Límites de tasa por defecto.** El registro global es 200/min por tenant o IP; login 10/min y bloqueo de 5 fallos en 15 min. Un endpoint sensible declara su propio `config.rateLimit`. No subir límites sin medición y sin justificación en el brief.
5. **Trazabilidad por respuesta.** Toda respuesta conserva `x-request-id` y `Server-Timing` con `app`, `auth`, `tenant`, `authorization`, `db`; las fases se miden con `measurePhase`, no con temporizadores ad hoc.
6. **Validación en el borde.** El esquema de Fastify valida cuerpo, query y params antes del handler. No se aceptan campos sin validar ni `any` implícito en contratos públicos.
7. **Transacciones cortas.** El P2028 de mallas es contención por concurrencia, no caída del servicio: acortar la transacción, sacar trabajo o idempotentizar; no inflar el timeout sin medición.
8. **Doble almacén declarado.** `TimeRoute` vs `operational_routes` y `Employee` vs `employees` conviven; el cliente web cae en silencio a Supabase cuando la API rechaza. Un fix cubre ambos caminos o declara por qué no.
9. **Auditoría con dependencia real.** El hook global de auditoría depende de Redis; sin Redis es noop. No se usa como evidencia si Redis no estaba activo. Las operaciones sin cuerpo no pueden devolver 400 tras un cambio de estado válido (`FST_ERR_CTP_EMPTY_JSON_BODY`).
10. **Nómina y marcaciones.** El motor vive en `apps/api/src/modules/hr/service.js`. Los topes y pisos de IBC se aplican también en la rama sin novedades; `buildSocialContributionRows` exige IBC reportado (409 `IBC_REPORTADO_REQUERIDO`) salvo modo tolerante. El cierre corre liquidación → provisiones → aportes y responde `skipped: "SIN_NOMINA"` sin documentos, sin inventar provisiones.
11. **Alias de rutas.** `/hr/*` y `/talento-humano/*` duplican superficie: todo cambio de contrato se aplica a ambos o se documenta la divergencia.
12. **Identidad operativa.** Empleados con ficha usan `employee_id`; usuarios sin ficha usan `user_id`. Nunca convertir UUIDs de Supabase a IDs numéricos (`NaN`).
13. **Archivos.** La subida valida firma real (`detectFileMime`), tamaño (multipart 50 MB) y autorización; el MIME del cliente no es evidencia.
14. **Pruebas reales.** `node:test` con Prisma falso inyectado en `require.cache`; `Prisma.join` anida `.values` y `tenantCache` exige `tenant.findUnique` en el fake. Una prueba que solo lee el código fuente no prueba el endpoint.
15. **Torre externa fuera de la API.** `apps/control-tower/` es vigilancia de solo lectura; consume `/health` y `/api/v1/apex-control/status` sin cambiar su contrato y no se integra en `apps/api`.
16. **Salud por módulo.** `GET /api/v1/apex-control/modules` es de solo lectura, exige `apex-control:read` y se ejecuta dentro de `runWithTenant`. Cada entrada del catálogo se contrasta con el delegado real de Prisma; si el modelo o la medición falla, el módulo queda `unavailable`/`unknown` con el error, nunca `ok`. La frescura se mide contra el campo y la expectativa declarados, y una dependencia caída degrada el módulo. Nunca se consulta un modelo sin filtro de tenant (salvo los globales declarados).
17. **Actividad, conexiones y lectura entre empresas.** `GET /api/v1/apex-control/activity` agrega auditoría y eventos en buckets diarios exactos con `$queryRaw` sobre `"timestamp"` y `occurred_at`, siempre filtrados por el tenant del token; no se cuenta con `findMany` truncado. `GET /api/v1/apex-control/tenants` es la única lectura entre empresas: exige el permiso explícito `apex-control:read_all_tenants`, la guarda `APEX_CONTROL_CROSS_TENANT` (apagada por defecto fuera de local/development) y la allowlist opcional `APEX_CONTROL_CROSS_TENANT_TENANTS`. Si la guarda falla responde 403 `CROSS_TENANT_DESHABILITADO`; nunca degrada a un listado global silencioso.
18. **Detalle por empresa con la misma puerta.** `GET /api/v1/apex-control/tenants/:tenantId/modules` mide una sola empresa y reutiliza `crossTenantGuard` + `readAllTenants` + allowlist; no agrega cifras de otras empresas ni abre una segunda superficie de lectura entre tenants. Valida el id con `^[A-Za-z0-9_-]{4,64}$` (`400 EMPRESA_ID_INVALIDO`), responde `404 EMPRESA_NO_ENCONTRADA` si no existe y `403 EMPRESA_FUERA_DE_ALCANCE` si cae fuera de la allowlist. `getTenantModules` devuelve el tenant medido junto al payload de módulos; nunca lo usa para saltarse el filtro del tenant autenticado.

19. **Telemetría de proceso en `/health`, solo agregada.** `runtimeSnapshot()` (`src/fabric/metrics.js`) publica `uptime_seconds`, `memory_mb` (rss/heap/external en MB) y `usage` (peticiones totales, por bucket de estado y consultas lentas) en `/health`, también en el `503 NOT_READY`. Los contadores se alimentan de `recordHttpRequest`/`recordSlowQuery` del proceso: nunca se agregan rutas, usuarios, tenants, cabeceras ni payloads —si algo de eso aparece en `/health`, es una fuga y bloquea el cambio— y las etiquetas de `prom-client` se mantienen separadas para que el `/metrics` siga siendo la fuente detallada. La torre depende de estos campos para las teselas de memoria y uso del API; sin ellos el ambiente se declara `sin medición`, no se rellena con datos de otro ambiente.

## Checklist de intervención

Antes:

- [ ] Preflight sin bloqueos y lecturas obligatorias leídas.
- [ ] Módulo, ruta y servicio identificados; tabla y dueño del esquema verificados.
- [ ] Permiso y contexto de tenant definidos para cada operación nueva.
- [ ] Prueba existente del dominio localizada.

Durante:

- [ ] Handler delgado, servicio con la lógica y consultas dentro del tenant.
- [ ] Esquema de entrada y códigos de error explícitos.
- [ ] Rate limit propio si el endpoint es sensible.
- [ ] Sin cambios fuera de `apps/api/**` y `packages/types/**`.
- [ ] Migración coordinada con `apexos-db-nube` si cambia el modelo.

Después:

- [ ] Suite del dominio en verde (`node --test apps/api/test/<dominio>*.test.js`).
- [ ] Prueba de aislamiento entre dos tenants cuando hay lectura o escritura nueva.
- [ ] Actividad y empresas: bucket diario con rango, filtro de tenant y 403 de la guarda entre empresas cubiertos.
- [ ] Detalle por empresa: id inválido (400), empresa inexistente (404) y fuera de allowlist (403) cubiertos junto a la lectura autorizada.
- [ ] Muestra de `Server-Timing` y `x-request-id` del endpoint.
- [ ] Control nuevo en este skill, bump semver, `updated_at` y `agents/CHANGELOG.md`.
- [ ] `agents:sync`, `agents:check`, `agents:preflight` y `agents:coverage` en verde.

## Evidencia

- Salida de la suite del dominio y de la prueba de aislamiento de tenant.
- Petición y respuesta del endpoint con `Server-Timing` y `x-request-id`.
- Resultado del flujo de error esperado (401/403/409/422) cuando aplique.
- Destino: `docs/qa/evidence/<cambio>/` con nombres `api-*.txt` o `api-*.json`, sin tokens ni datos personales.
- Si no se pudo correr la suite o el endpoint, se escribe `BLOQUEO: <motivo>` en el handoff.

## Handoff

- A `apexos-db-nube`: modelo, índices y migración que el endpoint necesita.
- A `apexos-seguridad`: permisos, superficies de entrada y manejo de secretos que deben revisarse.
- A `apexos-qa`: endpoint, tenant de prueba, datos mínimos y casos borde.
- A `apexos-frontend`: contrato de respuesta y errores que la pantalla debe manejar.
- A `apexos-performance`: consultas nuevas, cambios de plan y presupuestos de latencia.
- Declara: archivos tocados, rutas afectadas, alias cubiertos, pruebas ejecutadas, pendientes y bloqueos.

## Antipatrones

- Leer o escribir sin `runWithTenant` "porque el endpoint es interno".
- Tomar `tenant_id` del body o del query.
- Chequear roles con `if (user.role === "admin")` en lugar de las guardas.
- Devolver el objeto Prisma completo con datos de otros tenants o campos sensibles.
- Calcular bcrypt en cada request o registrar tokens.
- Subir el timeout de una transacción para "resolver" P2028.
- Declarar auditoría cuando Redis no estaba activo.
- Arreglar solo el camino API y dejar el fallback Supabase roto.
- Probar solo con un tenant y llamarlo aislamiento.
- Contar actividad de varios días con `findMany` truncado o sin rango de fechas.
- Abrir una vista entre empresas sin permiso explícito, sin guarda de ambiente o sin allowlist.
- Mover la torre de vigilancia dentro de `apps/api`.
