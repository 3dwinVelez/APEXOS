# Fase 3.4 - Validacion final en navegador real

Fecha: 2026-07-27. Rama: `feature/offline-first-technicians`.
Resultado: **APROBADO**.

## Ambiente

- Sistema operativo: Windows.
- Navegador: Google Chrome 150.0.7871.182.
- Perfil: temporal, aislado, sin extensiones ni datos previos.
- Runtime: `next build` + `next start`, web `127.0.0.1:3001`, API
  `127.0.0.1:3100`.
- Datos: PostgreSQL 16.14 local en loopback, base dedicada, ocho migraciones.
- Service Workers iniciales: 0.

## Resultado por recorrido

| Recorrido | Resultado |
|---|---|
| Login, rol, empresa y capabilities de solo lectura | Aprobado |
| IndexedDB real y nombre sin IDs legibles | Aprobado |
| Metadata requerida, incluida identidad de instalacion | Aprobado |
| 2 ordenes, 6 actividades, 4 checklists y 2 catalogos | Aprobado |
| API realmente inaccesible y recarga local | Aprobado |
| Detalle, actividades y checklist sin escrituras | Aprobado |
| Cierre total y reapertura con el mismo perfil | Aprobado |
| TTL expirado y advertencia visible | Aprobado |
| Actualizacion manual y proteccion contra downgrade | Aprobado |
| Logout y eliminacion fisica persistente | Aprobado |
| Tecnico excluido y usuario no autorizado | Aprobado |

El navegador se cerro completamente y se relanzo conservando el perfil. La
base, la fecha de generacion y el contenido local persistieron. Tras logout,
IndexedDB quedo vacio y no reaparecio en una segunda reapertura.

## Defectos corregidos

1. El bootstrap identifica al tecnico por empleado y no por usuario. Se retiro
   la comparacion incorrecta sin debilitar el contexto tenant/usuario.
2. Checklists de ordenes distintas compartian ID de referencia. La clave local
   y la proteccion de versiones ahora incluyen la orden.
3. `snapshotId` y `serverCheckpoint` se descartaban. Ahora se validan y
   persisten; `installationId` se verifica en el almacen de schema existente.
4. El lanzador no compilaba con su entorno productivo y mezclaba el entorno
   web/API. Ahora construye y arranca cada proceso de forma determinista.
5. El cleanup atravesaba una politica de soft-delete y abortaba. Ahora elimina
   solo el tenant sintetico verificado mediante SQL parametrizado transaccional.

Cada defecto quedo reproducido y cubierto por prueba o por el certificador real.
No se agregaron capacidades de Fase 4.

## Evidencias

- `evidence/phase3-4/01-prepared.png`: snapshot preparado.
- `evidence/phase3-4/02-offline-detail.png`: lista, detalle y lectura local.
- `evidence/phase3-4/03-expired.png`: advertencia TTL.
- `evidence/phase3-4/04-after-logout.png`: regreso a login sin base.
- `evidence/phase3-4/05-exclusion-user.png`: usuario excluido sin panel.
- `evidence/phase3-4/result.json`: resultado estructurado sin secretos.

Los avisos de red visibles en modo offline corresponden al bloqueo deliberado
de la API y no impiden la lectura local. Las capturas usan fixtures sinteticos
y no incluyen credenciales, tokens, cookies, IDs completos o conexiones.

## Regresion

- API: 46/46.
- Web offline: 31/31.
- Prisma validate, TypeScript web, ESLint y performance guard: correctos.
- Schema local vacio, cleanup, prepare repetido, inspect y HTTP: correctos.
- Bootstrap final: 2 ordenes, 6 actividades, 4 checklists, 2 catalogos,
  4.229 bytes y 2 consultas.
- Bundle: JS compartido 103 kB, Servicios 155 kB, detalle 163 kB y chunk
  offline diferido 16.487 bytes.

Los fixtures se conservan para revision tecnica reproducible. PostgreSQL
permanece solo en loopback y el cleanup corregido queda disponible.
