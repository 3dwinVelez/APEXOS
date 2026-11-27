# Horarios y mallas: programacion y seguimiento

## Alcance

Una sola entrada en Talento Humano, **Horarios y mallas**, con navegacion por pestanas:

- Programacion (`/dashboard/talento-humano/rutas`): crear, editar, clonar y consultar el seguimiento del horario. Conserva la eliminacion con sus permisos e impacto dentro del detalle abierto desde Programacion.
- Seguimiento (`/dashboard/talento-humano/mallas`): consultar equipo, marcaciones, actividades, GPS y evidencias; sin controles de crear, editar, clonar o eliminar, tanto en listado como detalle y movil.

Los enlaces anteriores siguen siendo validos y seleccionan la vista por URL. Las pestanas usan enlaces accesibles (`aria-current`) y el historial del navegador, sin mantener un segundo estado de seleccion ni duplicar registros. Ambas vistas comparten la misma implementacion y las mismas APIs. No hay cambios de backend, esquema o datos existentes.

El buscador unifica la funcion de horarios y distingue el mapa geografico como **Ver mapa operativo**. Se actualizan el acceso guiado y la navegacion movil. El certificado previo del hub refleja ahora una sola entrada y conserva el maestro de bancos que ya existia.

## Pruebas

- 25 pruebas focalizadas aprobadas: `hr-unified-schedules`, `hr-monitor-modal-per-user`, `hr-monitor-refresh` y `hr-route-write-feedback`.
- TypeScript de las paginas, navegacion y sus dependencias: aprobado (`npx tsc --noEmit -p .local/hr-unified-schedules/tsconfig.json --types node`).
- Certificado del repositorio ampliado: `scripts/certifications/hr-punch-mobile-evidence-local.js` mediante `hr-employee-user-association-isolated-local.js`. PostgreSQL local aislado, API real y Chrome, sin respuestas simuladas. Comprueba entrada unica, pestanas, alta/edicion/clonacion, persistencia tras recarga, historial, movil, fotos de marcaciones y actividades, ampliacion y reporte de jornada, permisos y otro tenant.
- Resultado integral final: **aprobado, 6/6 recorridos**, del 2026-11-19T20:17:20.354Z al 2026-11-19T20:18:46.491Z, base aislada `apexos_cert_hr_assoc_1795119423289`, sin modificar la base origen. Cero respuestas 5xx y cero errores HTTP en el recorrido visual. Artefactos locales no versionados en `.local/hr-punch-mobile-evidence/`: `certification.json`, `isolated-certification.json`, `unified-programming.png`, `unified-followup-mobile.png` y capturas de las evidencias ampliadas.
- Un primer intento detecto que el certificado solo admitia el contrato nuevo de evidencias; ahora comprueba explicitamente ambos contratos (fotos unificadas o identidad separada), conservando validacion binaria de las imagenes. El entorno de prueba habilita Transporte para el catalogo opcional de vehiculos; la ultima ejecucion exige cero errores HTTP durante el recorrido visual.

## Fallos previos de validaciones generales

Se ejecutaron tambien `command-palette-module-functions`, `hr-route-write-fallback` y `hr-workday-novelties-ui`.

- El registro global del buscador ya omitia `/talento-humano/bancos` y `/contabilidad/pyg/ampliado` en el HEAD anterior.
- Dos aserciones de `hr-route-write-fallback` esperan una condicion exacta que no contempla el guard adicional de origen operativo que ya contiene `api.ts`, archivo sin cambios en esta tarea.
- La asercion de texto de rango en la pagina de nomina falla con el arreglo independiente, aun sin promover, que movio ese mensaje al validador de periodos. No corresponde a esta unificacion.

Se reprodujeron los tres primeros fallos ejecutando los tests originales sobre un `git archive HEAD apps/web` aislado en `.local/hr-unified-schedules/baseline`; resultado en `baseline-tests.txt`.

### Correccion autorizada posterior: «corrige las fallas»

Se agregaron al registro del buscador los accesos reales a Bancos y PYG ampliado, sin alterar el calculo contable. Las pruebas de fallback ahora comprueban ambos guards vigentes y ejecutan una matriz de casos: las escrituras criticas y las lecturas del monitor nunca se desvian a Supabase; otros catalogos mantienen su fallback permitido. No se modifico `api.ts` ni se debilitaron sus controles.

La prueba de nomina comprueba el mensaje de fechas invertidas en el validador que use la pagina: inline en la version publicada o compartido en el arreglo independiente de periodos. Si usa `payrollPeriodError`, comprueba tambien que reciba tipo y fechas. Esta entrega no requiere ni incorpora el cambio independiente del motor de periodos. La prueba del hub exige ahora una sola entrada de Horarios y mallas, en vez del acceso duplicado anterior.

Resultado: **59/59 pruebas web aprobadas, 13/13 del validador de periodos aprobadas, TypeScript aprobado**. Estos fallos dejaron de bloquear las validaciones.

El certificado completo ampliado aprobo **7/7 recorridos** del 2026-11-19T20:36:09.717Z al 2026-11-19T20:37:53.148Z sobre `apexos_cert_hr_assoc_1795120552397`, sin modificar la base origen. Incluye busqueda y apertura real de Bancos y PYG ampliado desde el centro de comandos. Cero errores HTTP durante el recorrido visual y cero 5xx inesperados. Capturas adicionales: `fn-hr-bancos-navigation.png` y `fn-contab-pyg-ampliado-navigation.png` en la carpeta local del certificado.

## Entrega

Implementacion local en `desarrollo`. Sin push, merge ni despliegue. Cualquier futura promocion exige certificacion completa, autorizacion independiente, alcance exacto y pre-QA segun `desarrollo -> develop -> main`.
