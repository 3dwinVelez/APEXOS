# Revocación efectiva de acceso

## Decisión

Los JWT siguen siendo credenciales firmadas, pero dejan de ser la fuente vigente de
roles, módulos y estado de acceso. Cada sesión recibe un identificador aleatorio y
captura dos versiones monotónicas:

- `User.authorization_version`: cambia ante rol, permisos, estado, contraseña o
  revocación global del usuario.
- `Tenant.authorization_version`: cambia ante módulos activos, suspensión o cambios
  globales de autorización de la empresa.

Cada solicitud autenticada compara las versiones y el estado de la sesión con la
base autoritativa. La consulta se realiza una vez por solicitud. No se usa un TTL
como condición de seguridad; por tanto, una revocación confirmada en base de datos
es efectiva en cualquier réplica en la siguiente solicitud.

## Sesiones

`AuthorizationSession` contiene solamente identificadores y estado de revocación;
no almacena JWT ni refresh tokens. El `sid` del access/refresh token identifica la
sesión. Revocar una sesión actualiza `revoked_at`; revocar todas incrementa la
versión del usuario y marca sus sesiones activas.

## Despliegue progresivo

- `AUTHORIZATION_VERSION_OBSERVATION_ENABLED=true`: registra divergencias sin
  bloquear.
- `AUTHORIZATION_VERSION_ENFORCEMENT_ENABLED=true`: responde `401` ante sesión
  revocada o versión obsoleta.

La observación debe preceder a la activación. Los eventos no incluyen tokens,
contraseñas, correos ni secretos; solamente códigos de causa e identificadores
internos.

## Rendimiento

La decisión se toma en **una sola sentencia** (`AUTHORIZATION_SNAPSHOT` en
`apps/api/src/security/authorizationState.js`): usuario, rol con sus permisos,
empresa y sesión viajan juntos en un `to_jsonb` por relación, con `sid` y `user id`
como parámetros `$1`/`$2`. El tenant autoritativo es el del usuario, nunca el que
declara el bearer.

Medido el 2026-11-19 con datos reales, comparando la ruta de una sentencia contra la
de cinco (`npm run certify:hr-auth-latency:qa` y `:production`):

| Ambiente | Cinco sentencias (mediana) | Una sentencia (mediana) | Factor |
| --- | --- | --- | --- |
| QA | 2 009 ms | 532 ms | 0,26 |
| Producción | 572 ms | 144 ms | 0,25 |

Las 18 decisiones revisadas por ambiente coincidieron en las dos rutas: 6 aceptadas,
9 medidas sin expulsar (`SESSION_REVOKED`, `USER_VERSION_STALE`,
`TENANT_VERSION_STALE`) y 3 rechazadas (`USER_REVOKED`). Cero divergencias.

Lo que se llevó el piso no fue el trabajo sino el número de viajes: cada sentencia
contra el pooler cuesta su latencia de ida y vuelta y Prisma parte cada `include` en
una sentencia propia, así que paralelizar o afinar el `include` no baja nada. El
objetivo histórico de p95 < 80 ms para la fase completa de autenticación no era
alcanzable sobre pooler remoto; el presupuesto vigente es el que mide la compuerta de
latencia del monitor por ambiente.

Dos invariantes que sostienen la decisión y están cubiertas por pruebas en
`apps/api/test/`:

- Las fechas de la sesión salen como texto desde `jsonb` y se normalizan a `Date`
  antes de comparar; sin ese paso una sesión vencida no se vería vencida.
- Un `sid` mal formado hace fallar el `cast` y el middleware responde `401`, igual
  que antes de la optimización.
