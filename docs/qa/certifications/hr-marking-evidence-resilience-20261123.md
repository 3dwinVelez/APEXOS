# Certificación local de la pierna API del frente "marcación con evidencia resiliente"

Frente versionado en `docs/briefs/2026-11-19-marcacion-evidencia-resiliente.md`.
Este documento certifica únicamente el replay a `develop`: la pierna de API. La pierna web
(cola que desprende evidencia, reportador con `code`/`failure_cause`/`device_id`) se reconcilia por
separado porque la página de marcación la tiene en curso otra promoción de Talento Humano.

## Qué se promociona

| Campo | Valor |
|---|---|
| Implementación canónica en `desarrollo` | `4776b8fdcf75b9397c8ae0f4096354b67ba81312` |
| Replay puntual certificado sobre `origin/develop` | el `certified_commit` de `docs/qa/manifests/hr-marca-ladder-develop-20261123-scope.json` (este documento viaja dentro de ese commit) |
| Baseline del destino | `6a393e673f9b4480e1fe004bec210cb3ce89f428` |
| Rama auxiliar | `codex/qa-hr-marking-ladder-develop-20261123` |
| Migraciones | 0 |
| Eliminaciones | 0 |

Replay puntual por cherry-pick, nunca por merge de rama: `desarrollo` lleva cientos de
commits de otros frentes y un merge arrastraría rutas fuera del alcance aprobado.

## Qué cambia en el producto (pierna API)

1. Una foto degradada o ilegible **nunca destruye la jornada**: el rechazo de evidencia se degrada a
   marcador sin verificar y la marcación se escribe (empalme con el reenvío del `self-heal`).
2. El rechazo 4xx/5xx **dice su causa**: `apps/api/src/fabric/platformLogs.js` compacta claves
   seguras (`evidence_failure_code`, `reason`, `field`, `declared_mime`, `sniffed_mime`, `byte_length`,
   `max_bytes`, `expected_type`, `punch_type`, `max_age_hours`) en el `detail` del log. Nunca cuerpo,
   imagen ni secreto.
3. La escalera `entrada → inicio_almuerzo → fin_almuerzo → salida` admite la excepción administrativa
   `resolvePunchLadder`: exige `correccion_administrativa` y `motivo_correccion` (si no, 422
   `MOTIVO_CORRECCION_REQUERIDO`) y reporta el salto (`jornada_completa`, `esperada:<tipo>`, `en_orden`)
   en vez de un 409 plano.
4. Identidad móvil y firma de archivo (`mobile-identity.js`, `fileSignature.js`, `policy.js`) dejan de
   rechazar por etiqueta declarada: se decide por contenido sniffed y tamaño real.
5. El frente público de telemetría (`admin/public-routes.js`) acepta el intento sin sesión para que la
   ruta pública del cliente pueda reportar el fallo.

## Instrumentos versionados

- `scripts/certifications/hr-marking-evidence-resilience-local.js` — certificación del frente en local.
- `scripts/certifications/hr-marking-blocked-workers.js` — censo de operarios bloqueados (solo lectura).
- `scripts/certifications/hr-marking-rescue-apply.js` — rescate con par ANTES/DESPUÉS obligatorio.

## Mediciones

### Foco sobre el candidato — verde

```
node --test apps/api/test/hr-administrative-punch-correction.test.js \
  apps/api/test/hr-evidence-resilience.test.js apps/api/test/hr-mobile-identity.test.js \
  apps/api/test/platform-log-rejection-detail.test.js apps/api/test/telemetry-client-logs-public.test.js
# tests 79  # pass 79  # fail 0
```

### ANTES sobre el baseline de `develop` — rojo demostrado

Las mismas 79 pruebas, ejecutadas contra las fuentes de `origin/develop` sin el parche:

```
# tests 79  # pass 36  # fail 43
```

El rojo existe: el arnés puede fallar y mide el comportamiento ausente (43 fallas), no el contenedor.

### Suite API completa — candidato vs baseline limpio

| Ejecución | tests | pass | fail | skipped |
|---|---|---|---|---|
| Candidato `3082af45` | 1232 | 1225 | 5 | 2 |
| Baseline `origin/develop` `6a393e67` | 1194 | 1187 | 5 | 2 |

El conjunto de rojos es **idéntico** en las dos corridas; el candidato añade 38 pruebas verdes.

### Atribución de los 5 rojos

Cuatro son del ambiente del worktree, no del producto. El directorio auxiliar no tiene `config/`, así
que `requireEnv(["DATABASE_URL","JWT_SECRET"])` y `REDIS_URL` abortan el arranque del servidor:

- `accounting-routes-contract.test.js` → `REDIS_URL is required when Redis is enabled`
- `authorization-status-codes.test.js`
- `offline-bootstrap.test.js`
- `transport-tms-foundation.test.js` → `Faltan variables de entorno requeridas: DATABASE_URL`

Re-ejecutados sobre el mismo candidato con el ambiente que la máquina de desarrollo sí aporta
(`DATABASE_URL`/`DIRECT_URL` inertes, `JWT_SECRET` de prueba, Redis deshabilitado):

```
node --test apps/api/test/accounting-routes-contract.test.js \
  apps/api/test/authorization-status-codes.test.js apps/api/test/offline-bootstrap.test.js
# tests 22  # pass 21  # fail 0
```

`transport-tms-foundation.test.js` pasó en la misma corrida con ambiente. Ningún rojo es de negocio.

El quinto rojo es deuda preexistente del destino, ajena a este alcance:

- `fix concurrencia: ninguna escritura de Talento Humano deja un lock bloqueante`
  (`apps/api/test/hr-marking-concurrency.test.js:224`). Invariante textual sobre
  `apps/api/src/modules/hr/service.js`: la prueba prohíbe `pg_advisory_xact_lock` y `develop` tiene 6
  llamadas (líneas 6174, 7049, 7127, 7848, 7963, 8040 en el baseline; idénticas en el candidato, solo
  desplazadas por las líneas del parche). `desarrollo` tiene 0. La convergencia de esos seis bloqueos
  es el alcance de la contención P2028, no de esta pierna, y se declara como pendiente del destino.

## Seguridad de la evidencia

Los nueve artefactos de campo bajo `docs/qa/evidence/hr-marca-evidence-resilience-20261119/` se
escanearon contra `nombre|empleado_codigo|codigo|user_email|email|data:image|base64|Bearer |eyJ`:
cero coincidencias. Ninguna sesión token ni contraseña viaja en argumentos, manifiestos o evidencia;
los manifiestos de rescate con nombres de operario viven fuera del repositorio.

## Alcance excluido a propósito

- `apps/web/**`: la página de marcación la tiene en curso la promoción hermana de Talento Humano;
  llevar la pierna web aquí produciría un cruce de alcance no certificado. Va en un segundo candidato
  reconciliado con `bd94354d`.
- `agents/**` y `.qoder/skills/**`: los espejos de agentes no viajan a `develop`.
- Migraciones: la pierna API no toca esquema.

## Autorización

Promoción `desarrollo → develop` autorizada por el owner el 2026-11-23 ("procede") con sus puertas de
alcance, evidencia pre-QA, rama auxiliar y PR. No autoriza `main`, force push, merge de rama completa,
borrado de ramas ni cambios de infraestructura.
