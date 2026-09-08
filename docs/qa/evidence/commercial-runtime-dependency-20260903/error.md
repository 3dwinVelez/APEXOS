# Diagnóstico del runtime API

- El despliegue QA `85e0d183` arrancó y publicó las rutas comerciales correctamente.
- Railway registró `MODULE_NOT_FOUND: prom-client` desde `src/fabric/metrics.js` al finalizar solicitudes.
- La causa es que el Dockerfile del API instala `apps/api/package.json`, pero `prom-client` estaba declarado únicamente en el `package.json` raíz.
- La corrección agrega la misma versión ya bloqueada por el repositorio al workspace del API; no modifica lógica, esquema ni otros módulos.

Resultado: defecto corregido en código; el contenedor remoto vigente continúa operativo pero con ese error hasta un nuevo despliegue autorizado.
