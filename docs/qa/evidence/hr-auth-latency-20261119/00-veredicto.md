# Piso de latencia de la fase de autenticación — medición 2026-11-19

## Qué se cambió y por qué

Toda petición autenticada pagaba un impuesto fijo antes de leer una sola fila de
negocio: la decisión de autorización viajaba en cinco sentencias Prisma (usuario,
rol, permisos, empresa y sesión). Como el costo real es por viaje al pooler y no por
trabajo, cinco viajes se suman. La decisión ahora toma **una** sentencia
parametrizada (`AUTHORIZATION_SNAPSHOT`) que devuelve usuario, rol con permisos,
empresa y sesión juntos.

Ruta modificada: `apps/api/src/security/authorizationState.js` (`validateAuthorization`).
Invocador sin cambios: `apps/api/server.js` (decorador `authenticate`).

## Instrumento versionado

`scripts/certifications/hr-auth-latency-differential.js`, expuesto como:

```text
npm run certify:hr-auth-latency:qa
npm run certify:hr-auth-latency:production
```

Qué hace, por ambiente:

1. Aborta sin conectar si el `DATABASE_URL` del archivo de ambiente no apunta al
   proyecto Supabase esperado (QA `jbirkghkekuifgfsgquq`, Producción
   `jzbwzmkidfthknsohhnr`). No se puede medir QA creyendo medir Producción.
2. Elige usuarios **activos** de empresas **activas** con marcaciones de los últimos
   15 días y sesión viva.
3. Por muestra corre seis casos — vivo, `sid` inexistente, `sid` nulo, versión de
   usuario vieja, versión de empresa vieja y usuario inactivo (tomado ya inactivo,
   nunca se desactiva a nadie) — por las dos rutas, la antigua replicada textualmente
   y la vigente del módulo.
4. Compara decisión normalizada (acepta / mide y deja pasar / rechaza) y el detalle
   completo (tenant, rol, número de permisos, versiones, motivo de revocación).
5. Exige cobertura: al menos un caso aceptado y dos con motivo. Sin eso la corrida es
   ROJA aunque no haya divergencias, porque medir solo rechazos idénticos no demuestra
   nada.
6. Presupuesto de latencia: mediana nueva ≤ 0,6 × mediana antigua.
7. Evidencia JSON por corrida. Solo lleva hash de tenant (12 caracteres), enteros y
   milisegundos: ni correos, ni identificadores crudos, ni cadenas de conexión.

## Resultado

| Ambiente | Cinco sentencias (mediana) | Una sentencia (mediana) | Factor | Divergencias | Cobertura | Veredicto |
| --- | --- | --- | --- | --- | --- | --- |
| QA | 2 009 ms | 532 ms | 0,26 | 0 de 18 | 6 acepta / 9 mide / 3 rechaza | VERDE |
| Producción | 572 ms | 144 ms | 0,25 | 0 de 18 | 6 acepta / 9 mide / 3 rechaza | VERDE |

Archivos: `diferencial-qa-1795101503295.json`,
`diferencial-production-1795101527356.json`.

Motivos efectivos observados en ambas rutas: `SESSION_REVOKED`,
`USER_VERSION_STALE`, `TENANT_VERSION_STALE` (miden y dejan pasar con los flags
vigentes) y `USER_REVOKED` (rechaza con 401 en los dos caminos). Cero anomalías de
401 interno: ningún caso terminó con un código Prisma distinto entre rutas.

## Seis corridas descartadas: todas del arnés, ninguna del producto

Cinco de las seis salieron **verdes que no medían lo que decían medir** y una salió roja
por un defecto de forma; ninguna se debió al cambio de una línea de producto. Quedan en
el directorio con sufijo `descartada-*` y no se citan como evidencia. Las
únicas corridas citables son `diferencial-qa-1795101503295.json` y
`diferencial-production-1795101527356.json`:

| Archivo descartado | Lo que muestra su JSON | Defecto del instrumento | Corrección |
| --- | --- | --- | --- |
| `diferencial-production-…101013473.descartada-por-arnes.json` | ROJO, 18 casos, **15 divergencias**, factor 0,25 | La réplica de la ruta antigua devolvía `{reason, uv, tv}` y el lector esperaba `authorization_reason`, `authorization_user_version`…: la ruta vieja siempre salía como «acepta», así que las divergencias eran del medidor | Réplica textual del cuerpo antiguo, con la misma forma de retorno y de rechazo (`deny()` con `statusCode`/`code`) |
| `diferencial-qa-…100959367.descartada-por-arnes.json` | VERDE, 12 casos, 0 divergencias, factor 0,36 | El mismo defecto de forma, pero en QA no producía rojos: producía un **verde que no medía nada** | Idem |
| `diferencial-qa-…101173303.descartada-cobertura-vacia.json` | VERDE, 12 casos, 0 divergencias, factor 0,36, sin campo `cobertura` | La muestra tomaba empresas inactivas: los 12 casos rechazaban igual por el mismo motivo y el contador de divergencias no podía crecer | Filtro `u.active` y `t.active` en la muestra, `t.authorization_version as tv_real` y **gate de cobertura obligatoria** (≥1 `ACEPTA` y ≥2 con motivo), con el campo `cobertura` impreso en el JSON |
| `diferencial-production-…101133595.descartada-sin-gate-de-cobertura.json` | VERDE, 18 casos, 0 divergencias, factor 0,25, sin campo `cobertura` | Corrida con latencia válida pero tomada antes de que existiera el gate: no garantizaba ni un caso aceptado | Mismo gate aplicado a Producción |
| `diferencial-qa-…101386852.descartada-clasificacion-arnes.json` | VERDE, 18 casos, cobertura `{ACEPTA 9, MIDE 9, RECHAZA 0}` | `clasifica()` leía `lanza` donde `segura()` registraba `lanz`, así que los rechazos se contaban como aceptados: una cobertura que reporta **cero rechazos** en una muestra con sesiones y versiones adulteradas es imposible | Campo corregido; la corrida citable marca 6/9/3 |
| `diferencial-production-…101412324.descartada-clasificacion-arnes.json` | VERDE, 18 casos, cobertura `{ACEPTA 9, MIDE 9, RECHAZA 0}` | Idem en Producción | Idem |

Las dos corridas de QA con 12 casos son gemelas en cifras (factor 0,36, verde vacío); lo
que las distingue es el defecto que estaba corregido cuando se descartaron, y eso es lo
que registra el sufijo de cada archivo.

Ninguno de los seis cambió una línea de producto. Es la atribución que exige la
política: un rojo de medición se atribuye antes de tocar nada, y se conserva para que
la siguiente ronda no repita el mismo falso verde.

## Límite honesto de esta medición

Las medianas son desde la máquina de puesto hacia el pooler de cada ambiente. El
camino del usuario real sale más caro por sentencia: la compuerta desplegada midió en
Producción **mapa del día p50 3 955 ms / p95 5 557 ms** sobre un cuerpo de 299 B y
cero binarios inline (`docs/qa/evidence/hr-monitor-byte-budget-production/presupuesto.json`,
`generated_at` 2026-11-19T14:26), es decir el rojo que queda es viaje por sentencia,
no volumen. Desde Railway ese viaje se pagó en torno a 500-600 ms por sentencia. Lo
portable de esta tabla es la **relación** (cuatro sentencias menos ≈ 4× menos piso),
no la cifra absoluta. El efecto end-to-end sobre la pantalla —`Server-Timing:
auth;dur=…`— se certifica cuando el cambio esté desplegado, con:

```text
npm run certify:hr-monitor-budget:qa
npm run certify:hr-monitor-budget:production
```

Hasta ese despliegue esos gates siguen midiendo el código antiguo y su rojo de
latencia es esperado.

## Pruebas unitarias que fijan el contrato

- `apps/api/test/security-authorization-revocation.test.js`: la lectura cuesta **una**
  sentencia, viaja con marcadores `$1`/`$2`, el `sid` hostil y el tenant declarado por
  el token nunca entran en el texto SQL, el tenant resuelto es el del usuario y RBAC
  sigue recibiendo los permisos del rol.
- `apps/api/test/authorization-observe.test.js` y
  `apps/api/test/auth-session-hardening.test.js`: mocks de `$queryRawUnsafe` que
  reproducen las condiciones de verdad de la sentencia (sesión admitida solo si es del
  mismo usuario), para que la revocación selectiva, el reuso de refresh y el
  enforcement sigan probándose contra la ruta real.

- **El guardarrail de CPU del costo local quedó reespecificado y demostró discriminar.**
  La aserción exigía < 250 ms por 100 000 decisiones puras; medido sin carga el costo real
  es 135-164 ms, así que el margen de 1,5x hacía roja la corrida cada vez que la suite
  completa acompañaba —fallaba también sobre `HEAD` intacto, 267-410 ms—. Ahora son tres
  pasadas y manda la mínima contra **600 ms** (4x el peor caso limpio). El rojo provocado
  viaja con la evidencia: decisión real `134.64 ms → VERDE`, y la misma aserción con 5 µs
  de espera inyectada por llamada `714.22 ms → ROJO`. No se aflojó un umbral a ciegas: se
  cambió un reloj absoluto de una pasada por una medida estable que aún puede fallar.
- **Suite completa del API, con `DISABLE_REDIS=true` y `--test-force-exit` (build de esta
  intervención): 1278 pruebas, 1275 pasan, 0 fallan, 3 saltadas.** El rojo que quedaba en
  la corrida anterior era precisamente el microbenchmark de arriba. Foco de autenticación
  (`security-authorization-revocation` + `auth-session-hardening` + `authorization-observe`):
  18/18.

## Sin ejecutar / pendiente

- Despliegue en QA y Producción de esta ruta (autorización de promoción aparte).
- Suite web y E2E del monitor después del despliegue.
- 45 filas de `GpsPing` con selfie inline (33 MB en `metadata`) siguen en la base: la
  purga exige primero probar que el lector desplegado reconstruye la evidencia GPS por
  referencia.
