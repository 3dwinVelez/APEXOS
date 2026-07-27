# Certificacion funcional de Fase 3

Fecha: 2026-07-27  
Resultado final: **APROBADO**

La implementacion tecnica de Fase 3 no se modifica ni se invalida. La
certificacion funcional real no pudo comenzar porque no existe un contexto
development compatible que contenga inequvocamente Nyvora.

## Preflight ejecutado

| Control | Resultado |
| --- | --- |
| Rama | `feature/offline-first-technicians` |
| Arbol inicial | limpio |
| Commits Fase 0-3 | presentes, sin reescritura |
| `main` local/origin | ambos en `135a665` |
| `config/local.env` | guarda correcta, PostgreSQL `localhost:54320` |
| PostgreSQL declarado | no disponible |
| PostgreSQL Docker local | disponible en `localhost:55432` |
| Referencias remotas en DB usada | ninguna; conexion solo localhost |
| Tenant exacto `Nyvora` | 0 coincidencias |
| Tenant exacto `nyvora.offline.local` | 0 coincidencias |
| Esquema requerido | falta `Tenant.authorization_version` |

La base alternativa local contiene tenants de demo y QA, pero ninguno es
Nyvora. No se selecciono el primero ni una coincidencia aproximada.

## Punto de detencion

Se preparo `scripts/certify-offline-readonly-local.js` para crear fixtures por
los servicios autoritativos existentes. El preflight aborta antes de cualquier
escritura porque `auth.registerTenant`, sesiones y revocacion requieren
`Tenant.authorization_version`, ausente en la base local activa.

La orden prohibe migraciones Prisma/Supabase y escritura directa de registros
parciales. Por ello no se creo tenant, usuario, rol, orden, allowlist ni sesion.
Capabilities, bootstrap, navegador offline, TTL, aislamiento y logout reales
quedan sin ejecutar.

## Condicion para reintento

Proveer un PostgreSQL de development ya compatible con el schema aprobado y
actualizar `config/local.env` para apuntar a ese servicio. El reintento debe
comenzar con `npm run env:doctor:local` y:

```powershell
node scripts/certify-offline-readonly-local.js inspect
node scripts/certify-offline-readonly-local.js prepare
```

No se solicita autorizar una migracion dentro de esta fase.

## Recuperacion posterior

Fase 3.2 preparo `127.0.0.1:54320/apexos_offline_cert_local` con schema
compatible, ocho migraciones registradas y cero datos. El bloqueo estructural
queda resuelto. La certificacion sigue pendiente porque el seed no fue
ejecutado, conforme a la restriccion de Fase 3.2.

## Cierre Fase 3.3

Resultado: `APROBADA CON OBSERVACIONES`. La persistencia fisica y limpieza de
IndexedDB quedan pendientes del checklist manual en Chrome o Edge real.

## Cierre Fase 3.4

La observacion fue retirada mediante Google Chrome 150.0.7871.182 real y un
perfil temporal aislado. Se comprobaron creacion y persistencia fisica de
IndexedDB, lectura sin API, detalle, actividades, checklist, TTL, reemplazo
manual, ausencia de escrituras, limpieza por logout y aislamiento de dos
usuarios sin capacidad offline.

Durante la corrida se corrigieron defectos acotados de Fase 3: identidad
tecnico/empleado, colision de checklist entre ordenes, proteccion de versiones,
persistencia de metadata, entorno reproducible del lanzador y cleanup fisico
de fixtures. Resultado consolidado de Fase 3: **APROBADO**.
