# Poblacion y estabilidad de Gestion Comercial en QA

Fecha: 2026-09-03

Ambiente: QA (`develop`)

Compania: `Cliente Piloto QA`
Lote deterministico: `QA-CM-STABILITY-V1`

## Resultado funcional

La poblacion se ejecuto dos veces mediante `scripts/certifications/commercial-management-population-qa.js`. Ambas ejecuciones finalizaron correctamente contra el commit QA `1a414a8a8cb8` y conservaron los mismos conteos:

- 4 zonas, 4 categorias, 4 motivos y 4 resultados de visita.
- 5 asesores y 20 clientes.
- 16 productos creados en Inventarios y sincronizados con Gestion Comercial.
- 20 compromisos.
- 21 registros de visita: 20 visitas base y 1 reemplazo generado por la reprogramacion controlada.
- 10 cotizaciones y 6 pedidos.

Se validaron catalogos, clientes, productos, presupuestos, disponibilidad y solapamiento de agenda, inicio/cierre/reprogramacion de visitas, compromisos, cotizaciones, conversion a pedido, estados de pedido, reportes, dashboard, RBAC y rechazo de acceso entre companias.

Los archivos `run.json` y `rerun.json` prueban la repetibilidad sin crecimiento de los conteos del lote.

## Hallazgos

1. El primer intento de productos devolvio `409` porque Inventarios esta habilitado en la compania. El script se corrigio para poblar primero el maestro de Inventarios y consumir la sincronizacion oficial del modulo comercial.
2. Los flujos comerciales no devolvieron errores funcionales no esperados durante las dos pasadas completas.
3. Los logs de Railway registran `MODULE_NOT_FOUND: prom-client` en el hook transversal de metricas, incluso cuando las respuestas comerciales terminan en `200` o `201`. La correccion ya existe y esta certificada localmente en los commits `ee38534` y `3951e5b`, pero no esta en el commit desplegado de QA. Por politica, este incidente permanece abierto hasta que se autorice y complete la promocion puntual `desarrollo -> develop` y el redeploy de QA.

## Seguridad y alcance

- El script bloquea APIs diferentes de `apexos-api-qa-production.up.railway.app`.
- El script bloquea proyectos Supabase diferentes de `jbirkghkekuifgfsgquq`.
- Solo usa `Cliente Piloto QA`, unica compania con `gestion_comercial` habilitado durante la ejecucion.
- La cuenta tecnica no imprime ni persiste su contrasena.
- No se modificaron las otras companias ni se promovio codigo a ramas remotas.
