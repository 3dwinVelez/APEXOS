# Fase 5 - Informe de ejecucion

Fecha: 2026-07-29. Rama: `feature/offline-manual-sync`.

## Alcance ejecutado

Se implemento sincronizacion manual e idempotente exclusivamente para
`TEST_OPERATION`, protegida por flags, ambiente, empresa, identidad, rol
tecnico, permiso de lectura de Servicios y rate limit.

- Migracion aditiva y modelo `OfflineSyncReceipt`.
- Contrato estricto `POST /api/v1/offline/sync/push`.
- Procesador con un unico handler `TEST_OPERATION`.
- Cliente y servicio manual desacoplado de Dexie.
- Adaptacion de resultados a la maquina de estados local.
- Boton manual visible solo con `syncEnabled=true`.

## Linea base

Antes de editar, API paso 46/46; contratos, Prisma y guard de rendimiento
aprobaron. Web no resolvia `dexie` ni `fake-indexeddb` porque las dependencias
declaradas no estaban instaladas fisicamente. Lint excedio 180 segundos.
`npm install --ignore-scripts` recupero las dependencias sin cambios versionados.

## Validacion automatizada

- API completa: 52/52.
- Pruebas nuevas backend: 6/6.
- Pruebas nuevas web: 2/2.
- Typecheck web: aprobado.
- Prisma format, generate y validate: aprobados.
- Guard de rendimiento: aprobado.

La suite web de almacenamiento ejecuta 42/51. Sus 9 fallos corresponden a
fixtures con expiracion del 27 de julio de 2026 ejecutadas el 29 de julio: la
politica de retencion las descarta y las aserciones esperan datos vigentes. No
se extendieron TTL ni fechas para ocultar ese desfase ajeno a Fase 5.

## Certificacion PostgreSQL local

Destino exclusivo:

```text
contenedor: infra-offline-cert-postgres-1
host: 127.0.0.1
puerto: 54320
base: apexos_offline_cert_local
```

El primer `prisma migrate deploy` tomo la URL general de `.env` y Prisma se
detuvo con `P3005` antes de aplicar SQL. La migracion se aplico despues mediante
`psql` dentro del contenedor dedicado, con `ON_ERROR_STOP=1`.

Resultado real:

```json
{"statuses":["APPLIED","ALREADY_APPLIED","REJECTED"],"receiptCount":1}
```

El tercer resultado corresponde al replay deliberado desde otra instalacion.

## Seguridad y rollback

Los flags siguen apagados por defecto. El apagado inmediato consiste en
desactivar `OFFLINE_SYNC_ENABLED`; la cola queda local y el flujo conectado no
cambia.

No se realizaron push, merge a `develop` o `main`, despliegues, migraciones
remotas, cambios de empresas cliente ni escrituras funcionales de Servicios.
