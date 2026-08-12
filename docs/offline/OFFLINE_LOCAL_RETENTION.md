# Retencion y limpieza local

## TTL

El TTL inicial es configurable y vale 24 horas:

```text
OFFLINE_LOCAL_TTL_MS = 86400000
```

No se expone como permiso y no extiende la capacidad servidor. El TTL definitivo
se ajustara con pruebas de campo y requisitos legales.

La fecha `expiresAt` proviene del snapshot controlado. Un dato vencido se
clasifica como `EXPIRED_RETAINED` y no se devuelve como vigente salvo que la
consulta solicite explicitamente incluir expirados. La limpieza posterior lo
elimina; no se usa la hora del dispositivo para comparar versiones.

## Identidad de instalacion

`installationId` es un UUID aleatorio local con `createdAt`, `lastSeenAt` y
`schemaVersion`. Sirve para diagnostico y se regenera al eliminar completamente
la base. No es hardware, fingerprint, prueba de posesion ni autorizacion.

## Operaciones de limpieza

- `clearCurrentUserData`: elimina la base del contexto abierto.
- `clearCurrentCompanyData`: elimina bases cuyos hashes de ambiente y empresa
  coinciden.
- `clearCurrentEnvironmentData`: elimina bases del ambiente.
- `clearExpiredData`: borra registros vencidos solo dentro del contexto.
- `clearAllOfflineData`: elimina todas las bases con prefijo APEXOS offline.

Cada resultado contiene conteos y codigos, nunca payloads o PII. La limpieza
cierra primero la instancia. Un cierre de sesion elimina completamente la base
del usuario porque en esta fase no existen operaciones pendientes.

## Cambios de contexto

Un adaptador abierto queda ligado a un contexto inmutable. Cualquier consulta o
escritura con contexto distinto produce `CONTEXT_MISMATCH`. Cambiar ambiente,
empresa o usuario exige cerrar el adaptador anterior y abrir una base distinta.

La eliminacion manual del navegador equivale a una base nueva y genera otro
`installationId`. Una sesion expirada o revocada bloquea inicializacion y
provoca limpieza cuando el flujo conectado comunique esa decision en una fase
posterior.

