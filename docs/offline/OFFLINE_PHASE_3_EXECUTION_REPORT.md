# Informe de ejecucion de Fase 3

Fecha: 2026-07-27  
Rama: `feature/offline-first-technicians`  
Base aprobada: `277962b` sobre `origin/develop` en `31d52e5`

## Resultado

Se implementaron `GET /api/v1/offline/capabilities` y
`GET /api/v1/offline/bootstrap`. Ambos reutilizan autenticacion, tenancy y RBAC;
el backend deriva empresa y usuario de la sesion y exige flag, ambiente, tenant,
identidad y rol exacto `Tecnico`. Sync, evidencia y auto-sync permanecen falsas.

El bootstrap incluye ordenes asignadas activas y pendientes programadas hasta
siete dias, actividades derivadas, checklist de partes y catalogos utilizados.
Excluye objetos completos de cliente, finanzas, contabilidad, documentos,
auditoria, otros tecnicos y otros tenants.

Limites por defecto: 100 ordenes, 500 actividades, 1000 checklists, 100
catalogos, 1 MiB, TTL 24 horas y timeout cinco segundos. Hay rate limit de 6
bootstrap por minuto por tenant/usuario y 20 consultas de capacidad.

`serverVersion` es temporalmente el milisegundo de `updated_at`; no se declara
monotono ni apto para conflictos. El checkpoint es un SHA-256 opaco del snapshot
y sus revisiones. Fase 4/5 requiere una version autoritativa persistida.

## Cliente y sesion

La UI se integra de forma minima en Servicios y se carga dinamicamente bajo
`NEXT_PUBLIC_OFFLINE_DISCOVERY_ENABLED`. La capacidad del navegador no autoriza:
el backend vuelve a validar cada bootstrap. El cliente valida contrato, schema,
ambiente, empresa, tenant, usuario y vencimiento antes de hidratar.

`OfflineTechnicianReadService` solo lista y consulta. No expone create, update,
delete ni cambios de estado. Logout elimina descriptor y base; cambio de cuenta
queda aislado; JWT o snapshot vencido bloquean la consulta.

## Validacion

| Control | Resultado |
| --- | --- |
| Suite API completa | 46/46 |
| Harness offline web | 21/21 |
| Prisma validate | correcto |
| TypeScript | correcto |
| ESLint | correcto |
| Next production build | correcto |
| Performance guard | 17 objetivos, 0 fallos |
| `git diff --check` | correcto |

Las pruebas nuevas cubren autorizacion, filtros, limites, datos sensibles, dos
consultas sin N+1, timeout, errores, rate limit, validacion cruzada de contexto,
revision no regresiva, transaccion, persistencia, solo lectura y logout.

## Bundle y rendimiento

Base Fase 2: JS compartido 103 kB, Servicios 153 kB, detalle 163 kB, 94 chunks
y 2,640,721 bytes de chunks.

Fase 3: JS compartido 103 kB, Servicios 155 kB, detalle 163 kB, 99 chunks y
2,773,348 bytes de chunks. La carga inicial de Servicios aumenta 2 kB. Una
compilacion efimera con descubrimiento habilitado conserva esos valores; Dexie
aparece solo en chunks diferidos. Con flags apagadas, las pruebas confirman cero
fetch, cero apertura de IndexedDB y cero inicializacion.

La consulta Prisma del bootstrap es fija: una para resolver el tecnico y una
para ordenes con relaciones minimas. Los tests verificaron limite, `hasMore`,
payload de 1 MiB y timeout. No se midio latencia, hidratacion, memoria o payload
promedio con datos reales porque no se activo QA.

## Piloto y limitaciones

El tenant historico de Nyvora fue identificado, pero no se encontro evidencia
suficiente para escoger sin ambiguedad uno o dos usuarios QA activos con rol
exacto `Tecnico` y ordenes asignadas. Usuarios utilizados: ninguno. Las
allowlists quedaron vacias y todas las flags falsas.

Por esa razon la prueba funcional real de desconexion, cierre de navegador,
reasignacion, cancelacion y revocacion queda pendiente. La fase tecnica queda
implementada y automatizada, pero la certificacion del piloto requiere que el
responsable confirme esas identidades.

## Intento de certificacion Fase 3.1

El preflight posterior confirmo que `config/local.env` apunta a PostgreSQL
local `54320`, no disponible. El PostgreSQL Docker local en `55432` responde,
pero no contiene un tenant Nyvora exacto y carece de
`Tenant.authorization_version`. La certificacion se detuvo antes de escribir
datos porque las migraciones estan prohibidas. Ver
`OFFLINE_PHASE_3_FUNCTIONAL_CERTIFICATION.md`.

`npm audit --omit=dev` mantiene tres vulnerabilidades altas preexistentes:
PostCSS y Sharp transitivos de Next. La correccion sugerida usa `--force` y
propone un downgrade rompiente a Next 9.3.3, por lo que no se aplico. Debe
evaluarse una actualizacion controlada de Next; PostCSS participa en build y
Sharp puede participar en procesamiento de imagenes del runtime.

## Restricciones confirmadas

No se creo cola, edicion, evidencia, push, pull incremental, conflictos,
Service Worker, Background Sync ni tablas backend. No hubo migraciones, merge,
push, despliegue, activacion de produccion, uso de empresas cliente ni cambios
en `main`.
