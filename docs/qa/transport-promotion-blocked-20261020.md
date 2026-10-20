# Promocion de Transporte a develop: bloqueada

Resultado QA: **NO APTO para publicar o promover**. Respaldo local conservado en `desarrollo`. No se ejecutaron push, PR, merge hacia develop, despliegues ni migraciones remotas.

## Alcance y trazabilidad

Baseline remoto inspeccionado: `origin/develop` = `6bae143dd454473ff53e86328756faa848a89da8`. Codigo evaluado al cierre: `f0e3a9b92cfcb36e338d349cc557e24d2c42cb3a` en desarrollo. Se sincronizaron los cambios vigentes de develop conservando Talento Humano y CI. El usuario autorizo la rama temporal `codex/qa-transporte-20261020` y su PR, excluyendo privacidad e iniciador local; tambien autorizo preparar Chromium y configuracion privada para PDF en QA. La rama temporal permanece local y requiere actualizar/recertificar su candidato antes de publicarlo.

Se respaldaron tarifas, sedes y maestros centrales, permisos por etapa, vehiculo/centro de costos, consecutivo, periodo contable y PYG, clientes, rutas con varias tiendas informativas, precios inmutables y PDF con anexos del tarifario.

## Pruebas ejecutadas

- Regresion del API completo y pruebas web de Transporte: **805 passed, 0 failed, 2 skipped**, 807 casos. Comando: `DISABLE_REDIS=true node --test --test-concurrency=1 apps/api/test/*.test.js apps/web/test/transport-*.test.mjs`. Evidencia externa: `<TEMP>/apexos-transport-security-final-regression.log`. Se declaran las dos omisiones existentes; no se presentan como aprobadas.
- `transport-settlement-four-stages-local.js`: **120 controles aprobados**, datos sinteticos persistidos y llamadas HTTP reales sobre base local. Incluye tarifas compuestas, clientes, tiendas, consecutivos concurrentes, periodo/PYG, cuatro etapas, inmutabilidad, autenticacion y PDF con dos anexos. Evidencia `<TEMP>/apexos-transport-security-final-functional.json` y PDF del mismo nombre base.
- `transport-platform-regression-local.js`: **17 controles aprobados** sobre el mismo codigo; lectura autorizada y rechazo anonimo en sesion, Servicios, referencias, HR, inventario, contabilidad, roles y transporte. Es smoke transversal; no sustituye la certificacion completa de inicio/correcciones/RBAC/tenant de Servicios requerida antes de promover la correccion compartida de Prisma.
- Compatibilidad anterior: `transport-settlement-packages-local.js` **69/69** antes de la ultima correccion de contexto. No se atribuye esta ejecucion a un commit posterior.
- Migraciones en tablas sinteticas sobre PostgreSQL real: **7/7**, con rollback de la transaccion. Se conservan origenes en metadata, sedes, actividad, empresas y relaciones; se admite paquete por vehiculo sin transportadora historica. No se aplicaron migraciones remotas.
- UI local: tres etiquetas agregadas por teclado conservan 500.000; periodo, precio y ruta readonly, sin selector Tipo. Seis comprobaciones y captura `<TEMP>/apexos-candidate-browser.json` / `.png`. Borrador temporal cerrado sin guardar.
- Lint completo: 0 errores, 22 advertencias anteriores. Typecheck y Prisma validate aprobados antes de los ultimos cambios exclusivamente backend/Docker. Los nueve tests del arnes del formulario pasaron tras corregir su variable reservada.

## Hallazgo de aislamiento corregido

Se reprodujeron **34 paquetes sinteticos de otras empresas visibles en el listado**. La causa fue devolver una PrismaPromise diferida sin consumirla dentro del AsyncLocalStorage de empresa. Se corrige `runWithTenant` para esperar la promesa dentro del contexto, ademas de los helpers de lectura de liquidacion y PYG. Retest del listado: **0 registros ajenos**.

`transport-tenant-context-local.js`: **12/12** sobre dos empresas sinteticas, listados de paquetes/periodos/transportadores, lectura propia y rechazo de lectura/modificacion ajena. Dos tests adicionales verifican promesas diferidas y concurrencia. Antes de promover el cambio compartido falta completar el flujo protegido de Servicios; no basta el smoke ni los tests unitarios.

## Bloqueo confirmado del PDF Linux

La imagen `apexos-transport-qa-local` construye e incluye Chromium, fuentes y chromium-sandbox, con usuario no root. `transport-pdf-runtime-local.js` falla realmente al iniciar el navegador:

`Failed to move to new namespace ... errno = Operation not permitted`.

Evidencia `<TEMP>/apexos-pdf-runtime-sandbox.json`; construccion en `<TEMP>/apexos-transport-docker-sandbox-build.log`. Se corrigio previamente la ausencia de chromium-sandbox, pero la restriccion de namespaces persiste. No se anadio `--no-sandbox`, modo privilegiado ni capacidades elevadas. El PDF esta aprobado en Windows local, **no en el contenedor de QA**.

La configuracion preparada acepta exclusivamente origenes locales o dominios privados `.railway.internal`, sin credenciales, rutas, query ni fragmentos en la URL. La plantilla QA documenta configurar nombre y puerto privado reales del frontend. No se modificaron variables remotas ni secretos. Es necesario definir un runtime de renderizado aislado compatible con el sandbox y certificar alli el PDF completo antes de publicar/promover.

## Security gate

Resultado: **NO APTO para la promocion completa**, por certificacion de runtime fallida y regresion funcional protegida pendiente tras el cambio compartido de contexto. El aislamiento detectado se corrigio y se retesteo; no se afirma seguridad absoluta de toda la herramienta.

Auditoria npm adicional: 24 alertas (1 critica, 16 altas, 7 moderadas). Son senales del scanner y no 24 vulnerabilidades explotables confirmadas. No se modificaron dependencias fuera de alcance. La alerta critica de Next 16.3.5 requiere entrada controlada por atacante en `next/og ImageResponse`; no se encontraron esos usos en app/components/lib. La alerta SSRF de optimizacion requiere remotePatterns; no se encontro esa configuracion. Referencias oficiales: https://github.com/advisories/GHSA-vcvr-r3jv-pc5j y https://github.com/advisories/GHSA-cjq9-62q9-8jv4. Las demas alertas requieren triage antes de una certificacion global de seguridad; no se marcan como resueltas.

## Gates y recuperacion

El manifiesto pre-QA registra el estado fallido; debe ser rechazado. AGENTS.md exige: «A failed, pending, partial, simulated-only, or unexecuted end-to-end certification blocks publication and promotion». No se ejecuta una publicacion para eludir este control.

Los commits locales permiten recuperar cada cambio sin reescribir historial. La migracion de sedes se preparo para preservar datos en metadata; antes de aplicarla en QA deben comprobarse baseline, backup y compatibilidad. No se restaura un arbol historico sobre develop. La proxima promocion exige actualizar candidato y alcance exacto, recertificar capacidades protegidas, pasar `qa:preqa:evidence` y `qa:promotion:scope`, y solo entonces publicar el PR autorizado.
