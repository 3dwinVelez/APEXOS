# Certificación de la pierna `develop → main`: el piso de autenticación en una sentencia llega a Producción

- **Rama auxiliar:** `codex/qa-auth-latency-single-statement-main-20261123`
- **Baseline del destino:** `origin/main` en `4be0dd5a3262fa165b861d2ae1e9fc63c6e31235`, que es además
  **lo que Producción sirve hoy**: `GET /health` respondió `commit = 4be0dd5a3262` en el momento de
  tomar el ANTES. Medido, no asumido.
- **Commit certificado del candidato:** `c42c8d061d816891d68a1405286e38da9617d2a1` (hijo directo de
  `4be0dd5a`). Es el árbol donde corrieron las mediciones de esta pierna, y las dos diferenciales lo
  llevan estampado en su campo `commit`; este documento de gobernanza y los dos manifiestos entran
  en el commit siguiente, que no mueve ni un byte de producto.
- **Origen promocionado:** `a6a5d73e` (contenido) + `76d36692` (manifiestos) dentro de la fusión
  `de7af667` del PR #107 en `develop`.
- **Por qué no es merge de rama:** `origin/main..a6a5d73e` es un diff de **1 064 archivos**. Entre el
  tip de `main` y el de `develop` hay frentes ajenos a esta corrección (buzón, facturas recibidas,
  comercio, torre, maestros bancarios), así que el corte se replayeó puntual sobre el destino.
- **Árbol donde se ejecutó:** worktree aislado del puesto, con `node_modules` **enlazado por junction**
  (nunca copiado: copiarlo ya borró 1 173 archivos del repositorio el 2026-11-20) y `.env` copiado,
  que está ignorado y nunca se commitea.

## Identidad del replay: medida ruta por ruta

`git cherry-pick -n a6a5d73e` aplicó sin un solo conflicto. Las **siete rutas de producto, pruebas,
instrumento y documentación** del candidato son, hash contra hash, el blob que QA evaluó:

| Ruta | Blob igual al corte `a6a5d73e` |
| --- | --- |
| `apps/api/src/security/authorizationState.js` | sí |
| `apps/api/test/security-authorization-revocation.test.js` | sí |
| `apps/api/test/auth-session-hardening.test.js` | sí |
| `apps/api/test/authorization-observe.test.js` | sí |
| `scripts/certifications/hr-auth-latency-differential.js` | sí |
| `docs/AUTHORIZATION_REVOCATION_DESIGN.md`, `docs/PERFORMANCE_ANTI_PATTERNS.md` | sí |
| `docs/briefs/2026-11-19-piso-de-latencia-autenticacion.md` y la certificación de la pierna a `develop` | sí |

`package.json` es la única ruta funcional que **no** puede ser idéntica porque su base es distinta: el
delta sobre `main` es exactamente **2 líneas agregadas, 0 eliminadas** (los scripts
`certify:hr-auth-latency:qa` y `:production`), verificado con `git diff 4be0dd5a..HEAD -- package.json`.

Detalle ruta por ruta, con los doce hashes:
`../evidence/auth-latency-single-statement-main-20261123/equivalencia-blob-main-desarrollo.txt`.

### Los consumidores del camino común también son los mismos

La función que cambia decide por **toda** petición autenticada, así que no basta con que el módulo sea
el mismo: hay que probar que en `main` lo llaman los mismos bytes. Los llamadores reales de
`validateAuthorization`, comparados entre el tip de `main` y el padre del corte certificado:

| Llamador | `main` antes | base certificada | veredicto |
| --- | --- | --- | --- |
| `apps/api/src/core/prisma.js` (el cliente que recibe las sentencias) | `157fb6ffe3a2` | `157fb6ffe3a2` | igual |
| `apps/api/src/fabric/metrics.js` | `75227814ea2d` | `75227814ea2d` | igual |
| `apps/api/src/modules/admin/service.js` | `3f12886496a0` | `3f12886496a0` | igual |
| `apps/api/src/modules/auth/service.js` | `41c4269af443` | `41c4269af443` | igual |
| `apps/api/src/modules/collaboration/routes.js` | `b81e4a288be1` | `b81e4a288be1` | igual |
| `apps/api/src/modules/apex-control/routes.js` | **ausente** | existe | ver excepción |

La primera versión de este bloque se escribió con tres rutas inventadas (`src/lib/prisma.js`,
`src/lib/metrics.js`, `src/middleware/auth.js`). Las tres estaban ausentes en las dos ramas, y el
comparador, tal como quedó, declaraba `IGUAL` un vacío contra otro vacío: un control que no podía
fallar. Se rehizo con las rutas reales obtenidas de `grep validateAuthorization` y con guarda
falla-cerrada (hash vacío o ruta ausente = `DIFIERE`). El hallazgo del control inválido es de
evidencia, no de producto, y queda contado aquí en lugar de borrado.

## Qué lleva la pierna

Lo mismo que evaluó QA: la decisión de autorización deja de pagar cinco viajes al pooler (usuario, rol,
permisos, tenant, sesión) y pasa a **una sola sentencia parametrizada**. Prisma parte cada `include` en
un viaje propio, así que el costo era por viaje y no por trabajo.

## Inventario de la pierna

Commit certificado `c42c8d06` (**25 rutas**, replay del corte) + commit de gobernanza (**15 rutas**),
**40 en total**:

| Estado | Rutas | Qué es |
| --- | --- | --- |
| `M` | 4 en `apps/api/**` | el módulo de autorización y sus tres pruebas de contrato |
| `M` | 2 en `docs/` | `AUTHORIZATION_REVOCATION_DESIGN.md`, `PERFORMANCE_ANTI_PATTERNS.md` |
| `M` | 1 | `package.json`: +2 líneas de scripts de medición, −0 |
| `A` | 1 | `scripts/certifications/hr-auth-latency-differential.js` |
| `A` | 13 | `docs/qa/evidence/hr-auth-latency-20261119/**` de la pierna a `develop` (veredicto + 12 JSON) |
| `A` | 2 | `docs/qa/evidence/auth-latency-single-statement-20261119/**` (suite y regresión de `develop`) |
| `A` | 2 | brief y certificación de la pierna a `develop` |
| `A` | 2 | `docs/qa/evidence/hr-auth-latency-20261119/diferencial-{qa,production}-17954450*.json`: las dos corridas tomadas **desde este árbol** |
| `A` | 8 | `docs/qa/evidence/auth-latency-single-statement-main-20261123/**`: foco, suite, regresión protegida, equivalencia de blobs, la medición de campo en QA desplegada y los tres ANTES de Producción (uno descartado del arnés) |
| `A` | 1 | `scripts/certifications/protected-regression-local.js` |
| `A` | 1 | `scripts/certifications/hr-marking-blocked-workers.js` |
| `A` | 1 | este documento |
| `A` | 2 | `docs/qa/manifests/auth-latency-single-statement-main-20261123-scope.json` y `-approval.json` |

Borrados: **ninguno** (`allowed_deletions: []`).

## Excepciones declaradas, no relejadas

1. **Dos certificadores viajan aunque `main` no los tenía**, porque sin ellos la evidencia de esta pierna
   queda huérfana: `protected-regression-local.js` es el `regression_certification.script` que cita el
   manifiesto de aprobación, y `hr-marking-blocked-workers.js` es la sonda que generó el ANTES de rechazos
   y que hay que volver a correr **igual** para el DESPUÉS. Ninguno de los dos es producto ni migración.
   `protected-regression-local.js` es blob-idéntico al de `develop`; `hr-marking-blocked-workers.js` solo
   existe en `desarrollo` (`origin/develop` no lo tiene), y el blob que viaja —`f276972ce0d1`— es
   exactamente el que produjo `triage-rechazos-produccion-antes.json`, verificado con `git hash-object`.
   Es el mismo patrón por el que la ronda del 2026-11-07 tuvo que llevar los manifiestos que el contrato
   del destino exigía.
2. **`agents/**` y `.qoder/skills/**` no se promocionan.** El contexto vivo del equipo reposa en
   `desarrollo`; `main` y `develop` no hospedan `agents/` ni `.qoder/`.
3. **`apps/control-tower/**` no viaja** (regla de gobernanza: herramienta de puesto de trabajo).
4. **`apps/api/src/modules/apex-control/**` no está en `main`.** El llamador ausente en la tabla de
   arriba no es una regresión: ese módulo todavía no se promocionó, así que en Producción quedan tres
   consumidores del camino común y los tres son blob-idénticos a los certificados.
5. **Ninguna migración.** Esta pierna no toca `apps/api/prisma/**`; las 72 migraciones alineadas de QA
   y Producción quedan intactas y no hay paso que aplicar ni revertir.

## Mediciones ejecutadas sobre el árbol del candidato (`c42c8d06`)

### Pruebas

| Corrida | Resultado |
| --- | --- |
| Foco de autenticación (`security-authorization-revocation`, `auth-session-hardening`, `authorization-observe`) | **18 / 18** |
| Suite completa del API (`DISABLE_REDIS=true`, `--test-force-exit`, 148 archivos) | **1 175 pruebas: 1 172 pasan, 0 fallan, 3 saltadas** |
| Regresión protegida local (10 suites de contabilidad, caja menor, compras, inventario y RBAC) | **10 / 10, 0 ausentes** |

Las tres saltadas, nombradas una por una (ninguna toca autorización):

- `el decorador real responde 403 al usuario Supabase sin empresa y 401 al token basura`
- `cotizacion, cancelacion con motivo, pedido, visita y 360 en base local`
- `commitments y visits estan montadas en /api/v1 y bloquean acceso anonimo`

Dos aclaraciones que valen más que el número:

- **Atribución de los siete rojos del primer intento.** La primera corrida completa de la suite dio
  1 175 → **7 fallas**. No eran del candidato: la worktree nueva no tenía `apps/api/node_modules` ni
  `apps/web/node_modules`, así que cinco archivos de prueba reventaban con `Cannot find module
  'fastify'` y `Faltan variables de entorno requeridas`. Se corrigió el ambiente del puesto (junctions
  por enlace, nunca copia; y los `config/*.env` ignorados) y la misma corrida quedó **0 fallas**. Se
  arregló el arnés, no el check.
- **La regresión protegida no toca ninguna base de datos.** Su propio `coverage_mode` dice
  `versioned_contract_and_service_harness` y los cargadores de esas suites usan un *prisma falso* en
  memoria. La primera vez se corrió con un `DATABASE_URL` apuntando a `localhost:54320`, que estaba
  **apagado**, y salió 10/10 igual: el guard del certificador solo comprueba que el host sea local, no
  que haya base detrás. Queda declarado como **defecto de arnés con dueño** (tarea pendiente): un
  control que no puede fallar no es evidencia de nada. Por eso la prueba de base real de esta pierna
  **no** es esa corrida, son las dos diferenciales contra los datos de QA y Producción.

### Latencia medida contra datos reales, en los dos ambientes de la nube

Con el mismo instrumento versionado, con guarda de `project ref` (aborta sin conectar si el ambiente
declarado no coincide con el proyecto del `DATABASE_URL`) y estampado con `rama` y `commit` del
candidato:

| Ambiente | Cinco sentencias | Una sentencia | Factor | Casos | Divergencias | Anomalías 401 | Cobertura |
| --- | --- | --- | --- | --- | --- | --- | --- |
| QA (`jbirkghkekuifgfsgquq`) | 1 472 ms | **389 ms** | 0,26 | 18 | 0 | 0 | 6 acepta / 9 mide / 3 rechaza |
| Producción (`jzbwzmkidfthknsohhnr`) | 560 ms | **141 ms** | 0,25 | 18 | 0 | 0 | 6 acepta / 9 mide / 3 rechaza |

Evidencia: `diferencial-qa-1795445034395.json` y `diferencial-production-1795445054659.json`, ambas con
`rama: codex/qa-auth-latency-single-statement-main-20261123`, `commit: c42c8d06`. El presupuesto del
factor es ≤ 0,60 y se cumple con margen en los dos ambientes. La decisión de una sentencia coincide con
la de cinco en los 18 casos, incluidos los rechazos por `USER_REVOKED`, `TENANT_REVOKED`,
`AUTHORIZATION_STATE_MISSING` y `SESSION_REVOKED`.

En Producción la corrida se hizo **contra las filas reales de Producción**, no contra un semillero: el
factor 0,25 repite el 0,25 de la pierna a `develop` sobre otro árbol y otro día.

### El compromiso ya probado en el ambiente desplegado (QA)

`campo-qa-sesion-autenticada.json`: **14 / 14** con sesión HTTP auténtica contra el API de QA ya
desplegado (`api_host: apexos-api-qa-production.up.railway.app`), empresa modelo **NYVORA**, anclado por
`GET /health` al commit servido `de7af667786a` — que es la fusión del PR #107, es decir **este mismo
contenido** — y con el control `codigo_servido_contiene_el_fix = "arreglo"`. La cuenta con la que se
midió es efímera y creada por el propio arnés.

Queda versionada además una corrida **descartada** del arnés
(`campo-qa-monitor-1795440000000.descartado-selfie-requerida.json`): el certificador de monitor por
referencia respondió `400 SELFIE_REQUERIDA` sobre el build desplegado porque su fixture de selfie de 68
bytes ya no pasa la compuerta de cuatro pasos. No se relajó el check ni se tocó el instrumento para que
cupiera: se cambió de instrumento y el descarte queda publicado.

## El ANTES en Producción, que es lo que esta pierna va a cambiar

Dos mediciones independentes, tomadas con el ambiente sirviendo todavía `4be0dd5a3262` (sin el arreglo):

**1. Presupuesto del monitor (`presupuesto-produccion-antes.json`) → `status: failed`.** Día 2026-11-20,
5 muestras por endpoint, presupuestos `listing_bytes 4 MiB`, `p95_ms 3 000`, `inline_base64_chars 8 192`:

| Lectura | p50 | p95 | Bytes servidos | Binarios en línea |
| --- | --- | --- | --- | --- |
| Mapa del día (`operations_map`) | 3 625 ms | **5 000 ms** | 299 B | 0 |
| Contadores de eventos (`event_summaries`) | 4 807 ms | **5 511 ms** | 6 693 B | 0 |
| Asistencia (`attendance`) | 2 878 ms | 2 994 ms | 2 B | 0 |

El rojo es de latencia, no de bytes: respuestas de 299 bytes y de 2 bytes tardando cinco segundos dicen
que el costo está **antes** del transporte, en el piso que paga cada petición autenticada. Justo el piso
que esta pierna baja 4×.

**2. Censo de rechazos (`triage-rechazos-produccion-antes.json`) → `total_rechazos: 527`** en la ventana
de 3 días (2026-11-21 05:00Z a 2026-11-24 05:00Z, jornada colombiana), leídos de `AuditLog` con
`action = 'frontend.error'`:

- **488 error desde el frontend** y 39 warning desde el backend.
- **466 fallas de transporte** con la firma «Backend no disponible desde frontend», sin código y sin
  estado HTTP: la petición murió sin respuesta. Su causa cruda se parte en tres:
  **259 × `Load failed`**, **127 × «La plataforma no respondió a tiempo. Reintenta en unos segundos.»**,
  **80 × `Failed to fetch`**.
- Reparto por ruta (todas `null` = sin código): `hr/self/time-punches` 94, `work-session` 58,
  `attendance` 56, `routes` 54, `activity-types` 54, `preop/active` 46, `hr/self` 32, `gps/ping` 28,
  `event-summaries` 10, más las variantes `work-session?route_id=…`.
- **Denominador: 19 trabajadores marcaron en la ventana**, y a 11 jornadas no les quedó registro. Los
  rechazos no son ruido de un solo dispositivo: afectan a 13–14 cuentas distintas por ruta.
- Los rechazos con motivo de negocio legítimo (409 `MARCACION_FUERA_DE_SECUENCIA`,
  `MARCACION_DIFERIDA_EXPIRADA`, 400 de formato) siguen ahí y **no** los toca esta pierna: son conducta
  correcta del producto.

## Qué sigue siendo verdad después de esta pierna

1. **El factor medido no es la promesa cumplida.** Que el piso baje 4× está probado. Que los 466
   rechazos de transporte desaparezcan **solo se sabe midiéndolo después del despliegue**, en Producción,
   con la misma sonda versionada y la misma ventana. Ese DESPUÉS se versiona en cuanto Railway sirva el
   commit promocionado; mientras no exista, la compuerta de Producción está abierta.
2. **El rojo del presupuesto en Producción** se cierra (o no) con la misma remedienda posterior.
3. **Deuda del arnés recién descubierta:** `protected-regression-local.js` declara `database: passed`
   sin conectar. Su dueño es `apexos-performance`/`apexos-qa` y se corrige en `desarrollo`, no dentro de
   esta promoción.
4. **Cuentas efímeras dejadas activas en QA** por la medición de campo
   (`cert.reactivacion.3849419@internal.apexos.local` y su par `cert.inactiva.*`): se retiran por el
   endpoint de estado, no con un `UPDATE`, y se certifica el retiro.
5. Siguen pendientes, ajenos a esta pierna: habilitar `HR_EVIDENCE_STORAGE_ENABLED` en QA y Producción,
   purgar las filas de `GpsPing` con selfie en línea, y rotar la credencial de base de datos que quedó
   expuesta en una salida de `railway variables --json`.
