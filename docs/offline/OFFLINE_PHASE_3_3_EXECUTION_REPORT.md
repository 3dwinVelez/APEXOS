# Fase 3.3 - Ejecucion y cierre

Fecha: 2026-07-27. Rama: `feature/offline-first-technicians`.
Resultado: `APROBADA CON OBSERVACIONES`.

Se uso exclusivamente PostgreSQL 16.14 local en
`127.0.0.1:54320/apexos_offline_cert_local`. No hubo acceso remoto, migracion,
merge, despliegue ni push.

## Defectos y correcciones

1. El formato legacy del rol no produjo `services:read`. Se uso el contrato
   anidado del servicio y se verifico que el rol conserva solo ese permiso.
2. Se asumio una forma incorrecta para IDs numericos. Se contrastaron con
   PostgreSQL, se guardaron como cadenas y el validador compara archivo y filas.
   Ejecuciones repetidas conservaron IDs, cuatro usuarios y cuatro ordenes.
3. El registro autoritativo creo una sesion basal del administrador sintetico.
   Se permite exactamente esa sesion inicial; cualquier adicional falla.
4. El panel solo listaba ordenes. Ahora abre detalle, actividades y checklist
   mediante el servicio de lectura, sin controles ni tablas de escritura.
5. CSP bloqueaba la API separada. `connect-src` incorpora solo el origen http o
   https normalizado de `NEXT_PUBLIC_API_URL`, sin ruta, query, credenciales,
   comodines ni cambios en `script-src`.
6. React Refresh es incompatible con la CSP estricta. No se relajo la politica;
   la certificacion valida usa `next build` y `next start`.
7. Detener el padre de Next no cerraba hijos. El lanzador termina recursivamente
   solo el arbol cuyo PID administra y elimina sus archivos PID.

## Evidencia

- Post-seed: los cuatro indicadores de compatibilidad estan en `true`.
- HTTP real: login de tres usuarios, RBAC, tenancy, capabilities, bootstrap,
  query manipulada ignorada, aislamiento y revocacion.
- Snapshot: 2 ordenes, 6 actividades, 4 checklists, 2 catalogos, 4.229 bytes,
  TTL 86.400 segundos y 2 consultas Prisma.
- UI productiva: login, rol tecnico, capabilities y bootstrap recibidos.
- Las pruebas de almacenamiento cubren transaccion, reapertura, dos pestanas,
  TTL, manipulacion, rollback, limpieza y logout.

## Observacion obligatoria

La persistencia fisica de IndexedDB mediante cierre y reapertura completa del
navegador, asi como la limpieza fisica posterior a logout, no pudieron
observarse directamente en el navegador embebido utilizado para la
certificacion. Estas capacidades fueron verificadas mediante 21 pruebas
automatizadas con fake-indexeddb, incluyendo reapertura, multiples pestanas,
TTL, manipulacion, rollback, limpieza y logout. Se requiere una validacion
manual final en Chrome o Edge real antes de habilitar el piloto para usuarios
de campo.

Los fixtures se conservan para esa prueba: son locales, sinteticos, sin PII
real, sin credenciales versionadas y con cleanup idempotente.

## Regresion y bundle

- API: 46 pruebas unicas. La corrida paralela dio 45/46 por el umbral temporal
  de 100.000 decisiones (284,82 ms); repetida aislada paso en 125,91 ms.
- Web offline: 30/30, compuestas por 21 de almacenamiento, 6 CSP y 3 panel.
- Total unico: 76 pruebas.
- Prisma, TypeScript web/compartido, ESLint, performance guard, build y
  `git diff --check`: correctos.
- JS compartido: 103 kB; Servicios: 155 kB; detalle: 163 kB.
- Chunks JS: 99. Chunk offline diferido: 16.350 bytes.
- Dexie permanece fuera del JS compartido; la busqueda de bundle lo ubica solo
  en chunks diferidos.
- Capabilities: 17,33 ms. Bootstrap: 75,86 ms, 4.229 bytes y 2 consultas.

El lanzador paso `start`, `status` y `stop`; los puertos 3001 y 3100 quedaron
libres. PostgreSQL permanece saludable y enlazado solo a `127.0.0.1:54320`.
