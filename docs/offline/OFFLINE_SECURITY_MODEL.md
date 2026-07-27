# Modelo de seguridad offline

## Fronteras de aislamiento

Cada registro local lleva `tenantId` y `userId`, pero esos valores no conceden
acceso. El nombre de base fisica se deriva de identificadores opacos recibidos
del servidor y toda consulta de repositorio exige el contexto activo. Al
cambiar tenant o usuario se cierra el adaptador y se elimina el espacio anterior
segun la politica de retencion.

El backend ignora tenant, usuario, rol y tecnico declarados por el cliente:
deriva identidad de la sesion, revalida `AuthorizationSession`, versiones de
usuario/tenant, rol, permiso y asignacion.

## Cifrado y limite del navegador

IndexedDB no ofrece cifrado controlado por APEXOS. Puede beneficiarse del cifrado
del sistema operativo, pero un atacante con acceso al perfil desbloqueado puede
leer o manipular datos. El piloto acepta este riesgo residual solo para
dispositivos administrados, datos minimizados y retencion corta. No se afirmara
que la aplicacion cifra IndexedDB.

## Datos, expiracion y retencion

Solo se almacenan las clases permitidas en
`OFFLINE_DATA_CLASSIFICATION.md`. La proyeccion operacional expira a las 24
horas sin validacion de servidor. Evidencias pendientes tienen maximo 24 horas;
recibos y logs locales minimizados, 7 dias. Una politica remota mas restrictiva
prevalece.

## Sesion, revocacion y cambios de identidad

- Cierre de sesion online: cerrar adaptador, cancelar tareas, borrar datos del
  usuario/tenant y revocar la sesion con el mecanismo existente.
- Cierre sin red: borrar material local y credenciales del cliente; la
  revocacion remota queda pendiente para la proxima conexion.
- Sesion vencida offline: bloquear lectura, nuevas operaciones y sincronizacion.
  La Fase 3 exige JWT local no vencido y snapshot dentro del TTL.
- Usuario/tenant revocado, rol cambiado o empresa cambiada: el siguiente
  contacto bloquea sync, invalida capacidad y ordena limpieza. El backend no
  acepta operaciones por haber sido creadas antes de la revocacion.
- Dispositivo extraviado: revocar sesiones y dispositivo en servidor. La
  limpieza remota no puede garantizarse sin que el dispositivo vuelva a
  conectarse.

## Amenazas y controles

| Amenaza | Control |
| --- | --- |
| Manipulacion de IndexedDB | Validacion completa de esquema, identidad, version y reglas en Fastify |
| Manipulacion de flag del navegador | Capacidad firmada/servida por backend; variables cliente no autorizan |
| Replay | `operationId` UUID, recibo unico por tenant y dispositivo, retencion de idempotencia |
| Suplantacion de dispositivo | Identidad opaca registrada y vinculada a sesion; nunca sustituye autenticacion |
| Cruce de empresa/tecnico | Indices y filtros locales mas comprobacion autoritativa servidor |
| Robo de token | Tokens fuera de registros operativos, TTL de sesion y revocacion existente |
| Exfiltracion de fotos | Blob temporal, cuota/TTL y cuarentena privada |
| Log con PII | Lista permitida de campos y hashes para referencias sensibles |

## Idempotencia, dispositivo y auditoria

`operationId` es estable por intento logico. El servidor impone unicidad futura
por tenant/dispositivo/operationId y devuelve el recibo anterior para replay.
`DeviceIdentity` contiene un UUID opaco, fecha de registro y capacidades; no
incluye fingerprint invasivo ni secreto reutilizable.

Cada decision servidor registra resultado, regla, version anterior/nueva,
tenant, usuario, dispositivo, request ID y marca temporal. El contenido binario
y los tokens nunca entran en auditoria.

## Limpieza

La limpieza debe ser transaccional y verificable por usuario/tenant, al cerrar
sesion, vencer TTL, revocar capacidad, cambiar esquema de forma incompatible o
superar cuota. Si falla, se bloquea nueva operacion y se informa; no se cambia
silenciosamente a otro almacenamiento.

Fase 4 no cambia el logout productivo. La politica futura bloquea una limpieza
silenciosa cuando existan pendientes y exige decision explicita. Los payloads
rechazan claves de secretos, tienen limites estrictos y nunca se escriben en
logs o metadata. Los tipos funcionales permanecen deshabilitados.

## Riesgo residual aceptado

El piloto acepta que un dispositivo desbloqueado puede exponer PII temporal y
que la revocacion no llega sin red. Se mitiga con dispositivos controlados,
minimizacion, TTL corto, bloqueo de sync, auditoria y alcance exclusivo a
ordenes asignadas. Datos de alta sensibilidad permanecen solo en servidor.
