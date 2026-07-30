# Informe de ejecucion - Fase 2

Fecha: 2026-07-27
Rama: `feature/offline-first-technicians`
Base verificada: `31d52e5` (`origin/develop`)
Alcance: almacenamiento local aislado de solo lectura.

## Estado inicial

- Fases 0 y 1 intactas.
- Arbol inicial limpio.
- Node 22.23.1 y npm 10.9.8.
- Next declarado en lock 15.5.22; el `node_modules` inicial conservaba 15.5.18
  de una instalacion anterior.
- React declarado `^19.0.0`; instalado 19.2.6.
- TypeScript declarado/lock 5.8.2; el `node_modules` inicial tenia 5.9.3.
- La instalacion acotada alineo `node_modules` con el lock sin cambiar versiones
  no relacionadas en archivos controlados.
- No existia matriz formal de navegadores o certificacion movil.

## Dependencias

- `dexie` 4.4.4 en `apps/web`, version exacta, cero dependencias transitivas.
- `fake-indexeddb` 6.2.5 como devDependency para el harness Node.
- `@apex-os/types` 2.0.0 como workspace compartido, sin paquete externo nuevo.

Dexie 4 se eligio por transacciones, indices, migraciones y tipos incluidos. La
documentacion oficial recomienda Dexie 4 para estabilidad en Safari moderno:
[Dexie TypeScript](https://dexie.org/docs/Typescript) y
[IndexedDB en Safari](https://dexie.org/docs/IndexedDB-on-Safari).

No se agregaron hooks React, librerias de sync ni wrappers adicionales.

## Particion y esquema

Cada combinacion de `environmentId + companyId + userId` recibe una base
independiente. Los tres segmentos se transforman mediante SHA-256 para evitar
identificadores legibles en el nombre.

Tablas:

- `offlineOrders`
- `offlineActivities`
- `offlineChecklists`
- `offlineCatalogs`
- `offlineMetadata`
- `offlineSchemaState`

No existen `offlineOperations`, `offlineEvidence`, `offlineConflicts` ni colas.
Los fixtures son sinteticos y no contienen datos de empresas reales.

Los registros incluyen contexto, `serverVersion`, `serverUpdatedAt`,
`storedAt`, `expiresAt` y version local. El comparador rechaza una revision
servidor inferior y nunca usa la hora del dispositivo como autoridad.

## Adaptadores y servicios

- `DexieOfflineOrderRepository`
- `DexieOfflineActivityRepository`
- `DexieOfflineChecklistRepository`
- `DexieOfflineCatalogRepository`
- `DexieOfflineMetadataRepository`
- `DexieOfflineStorageAdapter`
- `OfflineSnapshotHydrator`
- `initializeOfflineReadStorage`

React no importa Dexie. Los repositorios no llaman API o Supabase. La fabrica
usa `import()` dinamico solo despues de recibir capacidad servidor y contexto
coincidente. Como la fabrica aun no esta integrada en pantallas o layouts, el
build productivo no genera siquiera el lazy chunk; la prueba inyectada confirma
que el loader no se ejecuta con la bandera apagada.

## TTL, identidad y limpieza

- TTL inicial configurable: 24 horas.
- Vencido: no se devuelve como vigente y metadata indica
  `EXPIRED_RETAINED`.
- `installationId`: UUID local de instalacion, no hardware ni autorizacion.
- Se regenera al eliminar completamente la base.
- Limpieza: usuario actual, empresa, ambiente, expirados y todas las bases.
- Logout futuro debe llamar limpieza completa del usuario; no se conecto al
  flujo real en esta fase.

## Migraciones

- V1 crea las seis tablas.
- V2 agrega `retentionState` e indice en metadata.
- La prueba abre una base v1, migra a v2 y conserva metadata.
- Un fallo inyectado aborta la transaccion, se informa como
  `MIGRATION_FAILED` y no crea bucles de apertura.
- No se realizaron migraciones backend.

## Manejo de errores

Se clasifican contexto/esquema/snapshot, cuota, disponibilidad, bloqueo, base
cerrada, transaccion abortada, migracion y corrupcion. Un fallo de apertura
devuelve modo conectado. Diagnosticos aceptan solo codigo, operacion,
reintento y version; no payload ni PII.

Casos simulados: `QuotaExceededError`, `InvalidStateError`, base bloqueada,
abort transaccional, migracion fallida y registro manipulado.

## Pruebas

El harness automatizado contiene 17 casos:

- crear, abrir, cerrar, eliminar y reabrir;
- hidratar y consultar todas las tablas permitidas;
- persistir tras reapertura y compartir lectura entre dos pestanas;
- aceptar version superior y rechazar inferior;
- aislar ambiente, empresa, usuario y tecnico;
- rechazar esquema/campos prohibidos y registros corruptos;
- TTL y limpieza selectiva/total;
- regenerar instalacion;
- migrar v1 a v2 y abortar migracion;
- rollback transaccional;
- cuota, restriccion y bloqueo;
- bandera apagada sin loader, base ni fetch;
- degradacion conectada ante contexto o almacenamiento fallido.

Resultados:

| Validacion | Resultado |
| --- | --- |
| Prisma validate | Correcto |
| TypeScript compartido estricto | Correcto |
| TypeScript web | Correcto |
| ESLint | Correcto |
| Harness offline | 17/17 |
| Suite API existente | 31/31 |
| Performance guard | 17 objetivos, 0 fallos |
| Build produccion | Correcto, 64 paginas |
| `git diff --check` | Correcto |

En `fake-indexeddb`, una apertura fria con creacion tomo aproximadamente 89 ms
y una hidratacion/consulta de fixture aproximadamente 36 ms. Son referencias de
test Node, no una medicion de dispositivo movil real.

## Bundle

| Metrica | Fase 1 | Fase 2 | Variacion |
| --- | ---: | ---: | ---: |
| JS compartido inicial | 103 kB | 103 kB | 0 kB |
| `/dashboard/servicios` | 153 kB | 153 kB | 0 kB |
| `/dashboard/servicios/[id]` | 163 kB | 163 kB | 0 kB |
| Archivos chunk | 94 | 94 | 0 |
| Bytes fisicos de chunks | 2,640,570 | 2,640,721 | +151 |

La variacion fisica es 0,006% y coincide con la alineacion local de Next
15.5.18 a la version 15.5.22 ya fijada en lock. No hay coincidencias
`Dexie`, `dexie` o `indexedDB` en chunks estaticos. No se genero lazy chunk
porque ningun entrypoint productivo referencia aun la fabrica. Llamadas
adicionales con flags apagadas: 0.

## Revision de dependencias

`npm audit --omit=dev` reporta tres vulnerabilidades altas transitivas:
PostCSS y Sharp a traves de Next. No aparecen Dexie ni fake-indexeddb. El arreglo
automatico propuesto requiere `--force` y un cambio rompiente, por lo que queda
fuera de esta fase y no se aplico.

## Riesgos pendientes

- Validar IndexedDB, cuota, bloqueo y limpieza en Chrome/Edge/Firefox/Safari
  reales, especialmente iOS y navegacion privada.
- Formalizar la matriz de navegadores y soporte movil.
- La enumeracion de bases y hashes no protege frente a control completo del
  perfil del navegador.
- La capacidad cliente no es autorizacion; el backend debe revalidar datos en
  bootstrap y sync futuros.
- Integrar logout/expiracion solo cuando se autorice tocar el ciclo de sesion.
- Medir el lazy chunk cuando exista una integracion productiva autorizada.
- Resolver por separado las alertas transitivas de npm audit.

## Garantias

- Sin datos productivos o de empresas cliente.
- Sin cambios visuales o funcionales en Servicios.
- Sin endpoints offline.
- Sin bootstrap, pull, push o cola.
- Sin fotos, GPS, operaciones o Service Worker.
- Sin migraciones Prisma/Supabase.
- Sin despliegue, push o merge.
- Sin cambios en `main`.

