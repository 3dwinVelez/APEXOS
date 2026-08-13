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

La comprobación usa una consulta indexada por `session.id` que incluye usuario y
empresa. Se evita cualquier caché de autorización entre solicitudes. El objetivo
es p95 menor de 80 ms para la fase completa de autenticación y autorización.
