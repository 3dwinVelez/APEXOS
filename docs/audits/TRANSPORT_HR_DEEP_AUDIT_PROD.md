# Auditoria profunda productiva - Transporte y Talento Humano

## Resumen ejecutivo

- Fecha de revision: 2026-07-05.
- Rama base revisada: `main`.
- Rama de trabajo: `fix/deep-audit-transport-hr-prod`.
- Commit base: `47b7803 fix: compact service references header`.
- Modulos auditados: Transporte, Talento Humano, Marcaciones, Rutas, Mapa GPS, Reportes HR y Nomina.
- Resultado final: apto con observaciones.

La revision encontro riesgos reales en validaciones de API, manejo de errores y filtros. Se corrigieron sin cambiar el modelo de negocio ni aplicar refactors grandes. Las validaciones estaticas, lint, build frontend, Prisma validate y sintaxis backend pasaron. La validacion deterministica completa quedo bloqueada por infraestructura local: la base `localhost:54320` y Docker Desktop no estaban disponibles.

## Roles aplicados

- Desarrollador senior: revision de servicios API, esquemas, permisos, estado de datos, validaciones, secuencia de marcaciones, payloads frontend y filtros.
- Director de calidad y pruebas: ejecucion de lint, typecheck, build, Prisma validate, sintaxis backend, bootstrap API y validacion deterministica hasta el bloqueo de base local.
- Especialista UX/UI: revision de pantallas de Transporte, Talento Humano, Rutas, Marcacion movil, Mapa GPS, Reportes y Nomina bajo criterios de eficiencia operativa.

## Superficies revisadas

- Frontend Transporte: `apps/web/app/dashboard/transporte/page.tsx`.
- Frontend Talento Humano: `apps/web/app/dashboard/talento-humano/page.tsx`.
- Rutas: `apps/web/app/dashboard/talento-humano/rutas/page.tsx`.
- Marcacion movil: `apps/web/app/dashboard/talento-humano/marcacion/page.tsx`.
- Mapa GPS: `apps/web/app/dashboard/talento-humano/mapa/page.tsx`.
- Reportes: `apps/web/app/dashboard/talento-humano/reportes/page.tsx`.
- Nomina: `apps/web/app/dashboard/talento-humano/nomina/page.tsx`.
- API Transporte: `apps/api/src/modules/transport/routes.js`, `schema.js`, `service.js`.
- API HR: `apps/api/src/modules/hr/routes.js`, `schema.js`, `service.js`, `timeLogic.js`.
- Permisos: `apps/web/lib/moduleAccess.ts`, `apps/api/src/modules/*/routes.js`.

## Hallazgos y correcciones

| ID | Modulo | Severidad | Hallazgo | Resultado esperado | Resultado obtenido | Correccion aplicada | Validacion posterior |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AUD-TH-001 | Rutas / API HR | Alta | La API permitia crear o actualizar horarios sin personas asignadas si se llamaba directo al endpoint. | Todo horario debe tener al menos una persona asignada. | La UI validaba, pero backend no lo exigia. | Se agrego `validateRouteInput` para `createRoute`, `updateRoute` y `createRoutesBulk`. | `node --check`, typecheck, lint y build en verde. |
| AUD-TH-002 | Rutas / API HR | Media | La API aceptaba horas invalidas o fin anterior a inicio. | Horario operativo coherente y rechazado en API si es invalido. | UI podia bloquear algunos casos, pero API quedaba expuesta. | Se valida formato `HH:mm`, fin posterior a inicio, tolerancia no negativa y viatico no negativo. | `node --check`, typecheck, lint y build en verde. |
| AUD-TH-003 | Marcaciones / API HR | Alta | Acciones repetidas o fuera de secuencia podian entrar por API aunque la UI deshabilitara botones. | Secuencia unica: entrada, almuerzo, retorno, salida. | Riesgo de duplicados o jornada inconsistente por llamada directa/repetida. | Se valida la siguiente marcacion permitida con `latestPunchesForUser` y `nextPunchType`; se rechaza con `409`. | Sintaxis backend y build en verde. |
| AUD-TR-001 | Transporte | Alta | Crear vehiculo con datos minimos podia fallar por `capacity_value = 0`, aunque la capacidad no es campo requerido. | Crear ficha minima con placa, tipo, marca, propiedad y sede. | El valor por defecto `0` era enviado y backend lo rechazaba. | Frontend omite capacidad/volumen cuando son cero; backend trata cero como no informado y solo rechaza negativos. | Typecheck, lint y build en verde. |
| AUD-TR-002 | Transporte / Adjuntos | Media | Error al adjuntar documento podia no mostrarse al usuario. | Error visible y accionable. | Promesa sin `try/catch` local. | Se agrego manejo de error visible en `saveDocument`. | Typecheck, lint y build en verde. |
| AUD-TH-004 | Mapa GPS | Media | Filtro por ruta podia fallar si `route_id` llegaba numerico y el selector lo comparaba como texto. | Filtrar por ruta debe funcionar con IDs numericos o string. | Comparacion estricta podia ocultar datos existentes. | Se normalizan comparaciones con `String(route_id)`. | Typecheck, lint y build en verde. |
| AUD-TH-005 | Reportes HR | Baja | Errores de carga podian verse como tabla vacia sin causa. | Mensaje visible ante falla de consulta. | `catch` externo silencioso en carga inicial. | Se agrego `message` visible para errores de carga. | Typecheck, lint y build en verde. |

## Hallazgos tecnicos sin cambio

- La validacion deterministica depende de base local en `localhost:54320`. En esta estacion no estaba disponible y Docker Desktop tampoco estaba activo.
- La pantalla de Reportes HR consume Supabase directo. Es consistente con el patron existente, pero requiere que `apexos_company_id` y credenciales Supabase esten correctas en sesion.
- El mapa GPS usa tiles de OpenStreetMap. En redes restringidas puede cargar la UI sin mapa base; la trazabilidad sigue dependiendo de puntos GPS internos.
- Nomina conserva una pantalla administrativa densa. No se modifico porque no habia bug funcional claro en el alcance productivo inmediato.

## Hallazgos UX/UI

- Transporte mantiene una estructura profesional: KPIs compactos, tabla comparativa, filtros utiles y ficha por etapas.
- Rutas esta orientada a operacion real: filtros, asignacion masiva, selector de personas y modal estructurado.
- Marcacion movil prioriza campo: una columna, botones tactiles, GPS, evidencia y barra fija de accion.
- Mapa GPS es funcionalmente denso y adecuado para supervision; el filtro por ruta corregido evita friccion critica.
- Reportes HR es administrativo y eficiente; se agrego mensaje de error para evitar diagnosticos falsos por tablas vacias.
- Se recomienda reducir textos largos de ayuda en Rutas cuando se confirme adopcion operativa; no se cambio ahora para no afectar entrenamiento de usuarios.

## Archivos modificados

- `apps/api/src/modules/hr/service.js`
- `apps/api/src/modules/transport/service.js`
- `apps/web/app/dashboard/transporte/page.tsx`
- `apps/web/app/dashboard/talento-humano/rutas/page.tsx`
- `apps/web/app/dashboard/talento-humano/mapa/page.tsx`
- `apps/web/app/dashboard/talento-humano/reportes/page.tsx`
- `docs/audits/TRANSPORT_HR_DEEP_AUDIT_PROD.md`
- `docs/design/UX_UI_SCREEN_PREMISES.md`

## Pruebas ejecutadas

| Prueba | Resultado | Evidencia |
| --- | --- | --- |
| `git status --short --branch` antes de modificar | Paso | `main` estaba limpio y sincronizado con `origin/main`. |
| Creacion de rama `fix/deep-audit-transport-hr-prod` | Paso | Se trabajo fuera de `main`. |
| `node --check apps/api/src/modules/hr/service.js` | Paso | Sin errores de sintaxis. |
| `node --check apps/api/src/modules/transport/service.js` | Paso | Sin errores de sintaxis. |
| `npm --workspace apps/web run typecheck` | Paso | TypeScript sin errores. |
| `npm.cmd run lint` | Paso | ESLint completo del frontend sin errores. |
| `npm.cmd run prisma:validate` | Paso | Schema Prisma valido. |
| `npm.cmd --workspace apps/web run build` | Paso | Next build exitoso; rutas Transporte y Talento Humano compiladas. |
| `npm.cmd run qa:deterministic-validation` | Bloqueada | API arranco y registro modulos; fallo `/health` por DB local inaccesible `localhost:54320`. |
| `docker compose -f infra/docker-compose.yml up -d postgres redis` | Bloqueada | Docker Desktop no estaba activo: no existe pipe `dockerDesktopLinuxEngine`. |
| Validacion visual por navegador local | Bloqueada | El servidor local no se mantuvo accesible para el navegador integrado en este entorno. Build productivo si compilo. |

## Validacion de permisos

- Transporte exige `transport:read` y `transport:write` en API.
- Talento Humano exige `hr:read` y `hr:write`.
- Nomina exige `payroll:read` y `payroll:write`.
- El menu frontend reconoce `talento-humano` como `hr`, `time_tracking`, `payroll`; y `transporte` como `transport`, `logistics`, `last_mile`.
- No se detectaron cambios necesarios en RBAC.

## Diagnostico por modulo

### Transporte

Estado final: apto con observaciones.

Correcciones aplicadas:
- Creacion de ficha minima no queda bloqueada por capacidad opcional en cero.
- Capacidad negativa sigue bloqueada.
- Error de adjuntos se muestra al usuario.

Riesgo pendiente:
- Validar manualmente con base real la carga de documentos y calculo de score documental.

### Talento Humano

Estado final: apto con observaciones.

Correcciones aplicadas:
- API de rutas valida persona asignada, horas, tolerancia y viatico.
- Marcaciones quedan protegidas contra repeticion o secuencia invalida.
- Filtro de mapa por ruta funciona con IDs numericos/string.
- Reportes muestran error visible de carga.

Riesgo pendiente:
- Validar extremo a extremo con base local o QA levantada: crear horario, marcar entrada, checklist conductor, registrar actividad, cerrar jornada, consultar mapa y exportar reporte.

## Recomendacion final

Apto con observaciones para produccion.

La razon de la observacion no es un fallo de build o sintaxis, sino que la validacion end-to-end con base local no pudo ejecutarse por infraestructura apagada en la estacion. Las correcciones son acotadas, defensivas y coherentes con los flujos existentes.

## Proximos pasos sugeridos

1. Levantar ambiente local/QA con Postgres disponible y ejecutar `npm.cmd run qa:deterministic-validation`.
2. Validar manualmente con usuario administrador: Transporte, crear vehiculo minimo, adjuntar documento, filtrar tabla.
3. Validar manualmente con usuario HR: crear horario individual y masivo, editar, clonar y filtrar.
4. Validar manualmente con usuario operativo/conductor: marcacion completa, bloqueo por secuencia repetida, checklist preoperacional y cierre tardio con evidencia.
5. Validar en movil real o emulador: `/dashboard/talento-humano/marcacion` y `/dashboard/talento-humano/mapa`.
