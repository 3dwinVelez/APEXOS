# Estado de promocion: mallas y sincronizacion de marcaciones

Fecha: 2026-11-23. Estado: BLOQUEADA. No se publico ni modifico produccion.

## Solicitud y referencias revisadas

El usuario autorizo desplegar a produccion mallas y sincronizacion de marcaciones. Esa autorizacion no amplía el alcance a otros modulos ni acredita una prueba funcional en QA.

- Destino actual `origin/main`: `432f65aae7df42efab08e77df477ac4bbd501a9f`.
- QA actual `origin/develop`: `6a393e673f9b4480e1fe004bec210cb3ce89f428`.
- Implementacion de sincronizacion: `6fd7c5a2`.
- Implementacion de origen unico de empleados: `e3e6165f`.
- Entregas QA: PR 104 (sincronizacion y selfies web) y PR 108 (maestro unico de empleados).

## Alcance inspeccionado

La diferencia completa `main..develop` contiene 1624 archivos y cambios en varios modulos. Una integracion completa excede la solicitud. No se considera autorizada.

Se extrajeron, solo para analisis local y sobre el main vigente, los hunks de producto de sincronizacion y del origen de empleados. Su inventario previsto es:

| Estado esperado | Archivo |
| --- | --- |
| M | apps/web/app/dashboard/talento-humano/marcacion/page.tsx |
| A | apps/web/lib/hrAttendanceState.ts |
| M | apps/web/app/dashboard/talento-humano/rutas/page.tsx |
| M | apps/web/lib/api.ts |
| M | apps/web/lib/hrScheduleMonitor.ts |

Este inventario es una propuesta de analisis, no un manifiesto de alcance aprobado. Faltan resolver las dependencias y agregar el inventario exacto de pruebas, certificados y evidencia. La aplicacion de hunks presenta conflictos en las dos paginas y en hrScheduleMonitor.ts; no existe un candidato productivo resuelto o certificado. No se copio el arbol completo de develop ni se alteraron ramas compartidas.

## Compuertas pendientes

1. Resolver y revisar un candidato limitado a las capacidades solicitadas, conservando el main vigente. Las reglas actuales solo permiten PR hacia main desde develop; no se puede sustituir por una rama auxiliar sin autorizacion y ajuste explicitos de la gobernanza. Tampoco se puede reponer un arbol antiguo sobre develop para eliminar su diferencia.
2. Certificado versionado de navegador/API en QA autenticado, sobre el commit exacto desplegado y datos controlados NYVORA, incluyendo permiso autorizado, permiso insuficiente, tenant distinto, indisponibilidad, persistencia, sincronizacion entre clientes y compatibilidad de horarios historicos.
3. Certificado transversal independiente de autenticacion, sesion, navegacion y funciones adyacentes, con resultados estructurados y sanitizados. Los certificados locales actuales no sustituyen esta evidencia.
4. Aprobacion funcional explicita, responsable y fecha para el candidato evaluado. La autorizacion de despliegue del usuario esta recibida; no se ha declarado ni fabricado aprobacion funcional.
5. Plan de reversa controlled_revert contra el ultimo main estable, manifiesto de alcance v2 exacto y validaciones qa:promotion:scope y qa:approval:evidence.
6. Verificacion posterior en NYVORA de produccion y certificado transversal. Cualquier falla debe detener publicaciones y seguir la reversa autorizada y trazable.

Los manifiestos `hr-web-four-selfies-sync-20261120-preqa.json` y `hr-schedule-employee-source-20261123-preqa.json` declaran LOCAL y qa_status pending. Certifican entrada a QA, no salida a produccion.

Referencias: AGENTS.md, docs/CHANGE_APPROVAL_QA_POLICY.md y scripts/git-governance-guard.js (PR a main exclusivamente desde develop).
