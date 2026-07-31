# APEXOS Visual Performance Functional Validation

## Validaciones Ejecutadas

| Comando | Resultado |
| ------- | --------- |
| `npm --workspace apps/web run typecheck` | Aprobado |
| `npm --workspace apps/web run lint` | Aprobado |
| `npm --workspace apps/web run build` | Aprobado |
| `npm --workspace apps/web run test:offline` | Fallo parcial: 40 aprobadas, 9 fallidas; igual en `develop` |

## Evidencia De Build

`/dashboard` paso de `264 kB` a `158 kB` First Load JS en build productivo local. `/dashboard/servicios` paso de `157 kB` a `156 kB`.

## Validaciones Pendientes

- E2E disponible por rol.
- Smoke test autenticado de `/dashboard`.
- Desktop y mobile con navegador local.
- Tema claro y oscuro con capturas.
- DOM nodes y requests con sesion local.
- Offline First en flujos tecnicos.

## Fallos Existentes Observados

`test:offline` falla en 9 aserciones de `apps/web/test/offline-storage.test.mjs` relacionadas con hidratacion/persistencia de snapshot IndexedDB:

- `hidrata y consulta ordenes, actividades, checklist, catalogo y metadata`
- `conserva el mismo item de checklist cuando pertenece a ordenes distintas`
- `persiste tras cerrar y reabrir el navegador simulado`
- `aumenta snapshot por serverVersion y rechaza una revision inferior`
- `rechaza snapshot de otra empresa, usuario o esquema`
- `migra v1 a v3 conservando datos, retencion y estado de schema`
- `una transaccion abortada conserva el snapshot anterior`
- `contrato bootstrap valido hidrata la base correcta y queda solo lectura`
- `snapshot bootstrap inferior no reemplaza revision local superior`

Los archivos modificados en esta fase son visuales/documentales y no alteran almacenamiento offline. La comparacion contra `develop` detached produjo el mismo resultado: 40 aprobadas y 9 fallidas.

## Dictamen

NO APROBADO - TRANSFORMACION PARCIAL. Hay avances reales en dashboard, administracion, servicios y detalle tecnico, pero falta migracion transversal completa y evidencia visual con capturas.
