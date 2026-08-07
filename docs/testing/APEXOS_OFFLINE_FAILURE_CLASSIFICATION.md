# APEXOS Offline Failure Classification

## Metodo

Se ejecuto la misma suite en la rama local `codex/operational-ui-v3-local` y en un worktree detached local sobre `develop` en `26b1331`.

No se hizo `fetch`, `pull`, `push`, merge ni despliegue. Para el worktree detached de comparacion se uso un junction local a `node_modules` existente; no se instalaron dependencias.

## Resultado Comparado

| Rama | Resultado |
| ---- | --------- |
| `codex/operational-ui-v3-local` | 40 aprobadas, 9 fallidas |
| `develop` detached `26b1331` | 40 aprobadas, 9 fallidas |

## Clasificacion

| Prueba | Clasificacion |
| ------ | ------------- |
| `hidrata y consulta ordenes, actividades, checklist, catalogo y metadata` | Preexistente |
| `conserva el mismo item de checklist cuando pertenece a ordenes distintas` | Preexistente |
| `persiste tras cerrar y reabrir el navegador simulado` | Preexistente |
| `aumenta snapshot por serverVersion y rechaza una revision inferior` | Preexistente |
| `rechaza snapshot de otra empresa, usuario o esquema` | Preexistente |
| `migra v1 a v3 conservando datos, retencion y estado de schema` | Preexistente |
| `una transaccion abortada conserva el snapshot anterior` | Preexistente |
| `contrato bootstrap valido hidrata la base correcta y queda solo lectura` | Preexistente |
| `snapshot bootstrap inferior no reemplaza revision local superior` | Preexistente |

No hay evidencia de regresion offline introducida por la transformacion visual. La estabilidad total no puede declararse hasta corregir o rebaselinar `offline-storage.test.mjs`.
