# Certificación de la pierna `desarrollo → develop`: el piso de autenticación en una sentencia

- **Rama auxiliar:** `codex/qa-auth-latency-single-statement-20261119`
- **Baseline del destino:** `origin/develop` en `06baf9c8` (merge del PR #106, reactivación de
  cuenta inactiva desde Administración). Medido, no asumido: las rutas netas de ese merge
  (`apps/api/src/modules/admin/service.js` y su contrato) **no comparten ninguna ruta** con este
  inventario, así que la pierna es un replay limpio sobre el destino vigente.
- **Commit certificado del candidato:** el `certified_commit` que declaran
  `docs/qa/manifests/auth-latency-single-statement-20261119-scope.json` y su `-preqa.json`. Es hijo
  directo de `06baf9c8`; las compuertas lo verifican ancestro del candidato y **no contenido** en el
  destino. Este documento no escribe ese sha: se recontó una vez para meter la evidencia dentro del
  propio commit certificado, y volver a citarlo aquí lo volvería a mover.
- **Árbol donde se corrieron las mediciones:** `61b41fd1`, el HEAD de la rama auxiliar antes de ese
  reconteo documental. La equivalencia se comprueba, no se afirma:
  `git diff 61b41fd1..<certificado> -- apps/api scripts package.json` devuelve **vacío**, así que
  producto, pruebas, instrumento y `package.json` son los mismos bytes que se midieron.
- **Origen en `desarrollo`:** `19df3ca2` (replay puntual de sus blobs, no merge de rama).
- **Ambiente donde se ejecutó el candidato:** puesto de trabajo, worktree aislado, con
  `node_modules` enlazado por junction al árbol certificado y `@prisma/client` 5.22.0 idéntico en
  los dos `package-lock.json`.

## Por qué esta pierna se rehizo dos veces

El destino se movió bajo los pies de la medición: la primera corrida fue sobre `5ff1440f`, la
segunda sobre `fd407e81` (PR #96, maestros bancarios) y la vigente sobre `06baf9c8` (PR #106). La
regla de gobernanza es medir contra el tip del destino, no contra el baseline con el que se tomó
la primera lectura, así que cada movimiento obligó a recalcular el candidato y **re-volver a
correr** el foco, la suite, la regresión protegida y las dos certificaciones diferenciales en la
nube. No se transplantó ninguna cifra antigua al árbol nuevo; los números de este documento son
del árbol de `61b41fd1`.

## Qué lleva la pierna

La decisión de autorización de **toda** petición autenticada dejó de pagar cinco sentencias al
pooler (usuario, rol, permisos, tenant, sesión) y pasó a una sola sentencia parametrizada. Prisma
parte cada `include` en un viaje propio, así que el costo era por viaje y no por trabajo: por eso
el arreglo no es un índice ni un caché, es una sentencia menos cuatro.

El riesgo de este cambio no vive en Talento Humano sino en el camino común: la misma función
decide hoy por los endpoints de contabilidad, caja menor, compras, inventario, rutas y marcación.
Por eso la pata de regresión incluye las suites de esos módulos contra una base real, no solo las
pruebas de `authorizationState.js`.

## Inventario de la pierna (25 rutas netas, más los 2 manifiestos de esta pierna)

| Estado | Rutas | Qué es |
| --- | --- | --- |
| `M` | 4 en `apps/api/**` | `src/security/authorizationState.js` (producto) + sus tres pruebas de contrato |
| `M` | 2 en `docs/` | `AUTHORIZATION_REVOCATION_DESIGN.md`, `PERFORMANCE_ANTI_PATTERNS.md` |
| `M` | 1 | `package.json`: conserva el contenido propio de `develop` y **agrega 2 líneas de scripts, 0 eliminadas** (`certify:hr-auth-latency:qa` y `:production`) |
| `A` | 1 | `scripts/certifications/hr-auth-latency-differential.js` (el instrumento versionado) |
| `A` | 1 | `docs/briefs/2026-11-19-piso-de-latencia-autenticacion.md` |
| `A` | 13 | `docs/qa/evidence/hr-auth-latency-20261119/**`: `00-veredicto.md`, las 8 JSON de la corrida de `desarrollo` (2 citables + 6 descartadas del arnés), las 2 JSON tomadas **desde el candidato sobre `fd407e81`** y las 2 JSON tomadas **desde este árbol sobre `06baf9c8`** |
| `A` | 2 | `docs/qa/evidence/auth-latency-single-statement-20261119/`: `suite-api-candidato.txt` y `regresion-protegida-local.json` |
| `A` | 1 | `docs/qa/certifications/auth-latency-single-statement-20261119.md` (este documento) |
| `A` | 2 | `docs/qa/manifests/auth-latency-single-statement-20261119-scope.json` y `-preqa.json` |

Borrados: **ninguno** (`allowed_deletions: []`).

## Identidad medida por blob (no se vuelve a medir lo mismo)

De las **25 rutas** del commit certificado, **17 son byte a byte el blob de `19df3ca2`** en
`desarrollo` (comparación ruta por ruta: blob del candidato contra
`git rev-parse 19df3ca2:<ruta>`). Las 8 restantes difieren por decisión declarada:

| Ruta | Blob igual al de `desarrollo` | Motivo de la diferencia |
| --- | --- | --- |
| `apps/api/src/security/authorizationState.js` | sí | el cambio de producto |
| `apps/api/test/security-authorization-revocation.test.js` | sí | contrato de una sentencia + presupuesto reespecificado |
| `apps/api/test/auth-session-hardening.test.js`, `authorization-observe.test.js` | sí | mock de `$queryRawUnsafe` con las condiciones de verdad |
| `scripts/certifications/hr-auth-latency-differential.js` | sí | el instrumento versionado |
| `docs/AUTHORIZATION_REVOCATION_DESIGN.md`, `docs/PERFORMANCE_ANTI_PATTERNS.md` | sí | diseño y anti-patrones |
| `docs/briefs/2026-11-19-piso-de-latencia-autenticacion.md` | sí | brief de alcance |
| `docs/qa/evidence/hr-auth-latency-20261119/00-veredicto.md` + 8 JSON de la corrida de `desarrollo` | sí | incluidas las seis corridas descartadas del arnés |
| `package.json` | **no** | delta mínimo sobre el destino: 2 líneas agregadas, 0 eliminadas |
| este documento, `suite-api-candidato.txt`, `regresion-protegida-local.json` | **no existe en `desarrollo`** | son la documentación y las corridas de esta pierna sobre el árbol de `develop` |
| los 4 JSON `diferencial-{qa,production}-1795104*.json` y `-1795441*.json` | **no existe en `desarrollo`** | corridas tomadas desde la rama auxiliar, no desde `desarrollo`: prueban el árbol promocionado |

El producto, sus tres pruebas de contrato y el instrumento versionado son exactamente lo que ya se
certificó en `desarrollo`. No se re-escribió lógica para que cupiera en `develop`.

## Lo que la pierna no lleva, declarado como excepción

`agents/**` y `.qoder/skills/**` **no se promocionan**: las ramas liberadas no hospedan el contexto
vivo del equipo. Medido, no asumido — `git ls-tree -r origin/develop` devuelve **0** rutas bajo
`agents/` (tampoco bajo `.qoder/`), y la pierna anterior a `develop` no llevó ninguna. El bump de
los agentes queda en `desarrollo`, que es donde vive `agents/registry.json` como fuente de versión;
`agents:coverage` y `agents:preflight` comparan solo contra `origin/desarrollo`, así que la
exclusión no rompe ninguna compuerta.

Tampoco viajan `apps/control-tower/**` (reposa solo en `desarrollo` por regla de gobernanza) ni
migración alguna: esta pierna no toca `apps/api/prisma/**`.

## Mediciones ejecutadas sobre el árbol del candidato

Con el mismo instrumento y la guarda de `project ref` (aborta sin conectar si el ambiente declarado
no coincide con el proyecto del `DATABASE_URL`):

| Ambiente | Cinco sentencias | Una sentencia | Factor | Casos | Divergencias | Anomalías 401 | Cobertura |
| --- | --- | --- | --- | --- | --- | --- | --- |
| QA (`jbirkghkekuifgfsgquq`) | 1 690 ms | **446 ms** | 0,26 | 18 | 0 | 0 | 6 acepta / 9 mide / 3 rechaza |
| Producción (`jzbwzmkidfthknsohhnr`) | 527 ms | **133 ms** | 0,25 | 18 | 0 | 0 | 6 acepta / 9 mide / 3 rechaza |

Evidencia: `../evidence/hr-auth-latency-20261119/diferencial-qa-1795441669327.json` y
`../evidence/hr-auth-latency-20261119/diferencial-production-1795441688976.json`, ambas con
`rama: codex/qa-auth-latency-single-statement-20261119` y `commit: 61b41fd1`.

El presupuesto del factor es ≤ 0,60 y se cumple con margen en los dos ambientes. La decisión de una
sentencia coincide con la de cinco en los 18 casos de cada ambiente, incluidos los rechazos por
`USER_REVOKED`, `TENANT_REVOKED`, `AUTHORIZATION_STATE_MISSING` y `SESSION_REVOKED`; los 3 casos
que rechazan siguen rechazando por el mismo motivo, y ningún caso terminó en 401 inesperado.

Las corridas tomadas sobre el candidato anterior (`515 ms` en QA con factor 0,27 y `139 ms` en
Producción con factor 0,25) quedan versionadas y se declaran **superadas por el cambio de
baseline**, no invalidadas: midieron el mismo blob de producto. Su valor es mostrar que el piso no
depende del árbol de integración.

## Pruebas

- **Foco de autenticación** (`security-authorization-revocation`, `auth-session-hardening`,
  `authorization-observe`): **18/18** en el árbol del candidato.
- **Suite completa del API en el candidato** (`DISABLE_REDIS=true`, `--test-force-exit`):
  1 213 pruebas, **1 209 pasan, 1 falla, 3 saltadas**.
- **Atribución del único rojo:** `hr-marking-concurrency.test.js` «fix concurrencia: ninguna
  escritura de Talento Humano deja un lock bloqueante» falla **idéntico en el baseline limpio de
  `develop`** (`06baf9c8` en un worktree aparte, sin este replay: mismo `not ok 7` sobre el mismo
  trío de archivos, 26/27 en los dos árboles). Es la deuda ya declarada de concurrencia de Talento
  Humano en `develop`; no la produce este cambio y no se corrige aquí porque sería alcance de otro
  módulo dentro de una promoción puntual.
- **Regresión protegida local** (`scripts/certifications/protected-regression-local.js`) sobre
  PostgreSQL 16 del `compose infra` (`127.0.0.1:55432`): **10 suites, 10 en verde, 0 ausentes** —
  contabilidad con saldos iniciales y numeración, contrato de rutas contables, maestros y
  comprobantes de caja menor con reversión, reportes de caja menor, flujo de proveedores, factura
  de compra, ajustes de inventario, transferencias entre tenants y acceso por módulo RBAC. En el
  intento anterior de esta pierna el daemon de Docker estaba apagado y el guard devolvió
  `blocked / DATABASE_URL no configurada`; se levantó el ambiente del puesto y se volvió a correr,
  en vez de citar el archivo bloqueado como evidencia.
- **Dos rojos iniciales que eran del worktree:** `accounting-routes-contract` («Faltan variables de
  entorno requeridas: `DATABASE_URL`, `JWT_SECRET`») y `transport-tms-foundation` («las rutas TMS
  se registran y exigen autenticación») se reproducen solo porque un worktree nuevo no trae los
  archivos ignorados `.env`. Copiado el `.env` (ignorado por `*.env`, nunca commiteado), ambos
  quedan verdes en candidato y en baseline. Se corrigió el ambiente del puesto, no el check.
- Conteo esperado distinto al de `desarrollo` (1 213 contra 1 278): el destino aún no contiene
  módulos de desarrollo (buzón, facturas recibidas, comercio, torre). Un conteo menor no es
  regresión; es un árbol menor.

Detalle crudo de cada corrida, con los comandos exactos y las tres pruebas saltadas nombradas una
por una: `../evidence/auth-latency-single-statement-20261119/suite-api-candidato.txt`.

## Qué sigue siendo verdad después de esta pierna

1. **El build publicado en QA sigue sin este código.** `06baf9c8` es lo que corre hoy en el
   ambiente; la compuerta `certify:hr-monitor-budget:qa` mide el build publicado, no el candidato.
   Su rojo de latencia se cierra remidiendo **después** del despliegue, y esa medición es la que
   autoriza la pierna a `main`.
2. **Los 321 rechazos de transporte no se dan por cerrados con esta corrida.** Lo que esta pierna
   certifica es que el piso que paga cada petición autenticada baja ~4× sin cambiar ninguna
   decisión de permiso. Que eso se traduzca en que dejen de caer los rechazos por «el backend no
   respondió» se comprueba en campo: volver a contar los eventos de `platform_logs` con
   `code`/`message` de transporte en Producción contra la misma ventana de días, después del
   despliegue, y reportar el antes/después con la misma sonda que generó el hallazgo.
3. **La pierna a `main` exige su propio manifiesto**, `npm run qa:approval:evidence` y aprobación
   funcional explícita; el alcance de `develop` no autoriza `main`.
4. Quedan pendientes de esta intervención, ajenos al alcance de la pierna: habilitar
   `HR_EVIDENCE_STORAGE_ENABLED` en QA y Producción, purgar las filas de `GpsPing` con selfie en
   línea, y la rotación de la credencial de base de datos que quedó expuesta en una salida de
   `railway variables --json`.
