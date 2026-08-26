# Reporte de estado — Referencias de servicio por Excel

Fecha: 2026-08-26  
Rama de implementación: `desarrollo`  
Commit funcional: `a09bbe9`  
Destino autorizado: `develop`  
Producción (`main`): fuera de alcance

## Estado

La implementación está completa, el candidato aislado fue reconstruido sobre `origin/develop@990a85d` y las validaciones locales están aprobadas. La promoción remota a `develop` permanece bloqueada por política porque no están disponibles en este entorno las credenciales de QA necesarias para ejecutar el certificado end-to-end versionado.

No se realizó ninguna inserción real ni se modificó `develop` o `main` durante el intento de certificación bloqueado.

La nueva verificación remota del 2026-08-26 confirmó que el API QA ya ejecuta `990a85dc5dba`, el mismo SHA de `origin/develop`. Ese despliegue contiene actualizaciones posteriores de Inventario y Ventas, pero no contiene el candidato Excel; por ello no puede mostrar todavía el cambio solicitado. El candidato se reconstruyó sobre ese SHA sin reemplazar ni retirar dichas actualizaciones.

## Cambios implementados

- Descarga de plantilla OOXML `.xlsx`; se eliminó el flujo CSV de esta pantalla.
- Hojas `Referencias`, `Ejemplo` e `Instrucciones` con 15 columnas, listas de selección y reglas de formato.
- Lectura del Excel en el navegador solamente al seleccionar un archivo, evitando cargar el lector en el flujo inicial.
- Validación previa por fila y campo: estructura, encabezados, códigos, categorías, tiempos, estado, piezas, cantidades, unidades, duplicados y URLs.
- Mensajes accionables con fila, campo y corrección requerida; el botón permanece deshabilitado si existe un error.
- Validación defensiva equivalente en el API.
- Importación transaccional: un error revierte el lote completo y elimina el comportamiento anterior de omitir fallos silenciosamente.
- Conservación de autenticación, permisos de escritura y aislamiento por tenant.

## Observaciones de corrección

1. El flujo anterior aceptaba CSV y omitía silenciosamente filas sin código o nombre.
2. El backend podía confirmar algunas referencias y contabilizar otras como omitidas, dejando resultados parciales.
3. La plantilla anterior no comunicaba tipos, límites ni dependencias entre título y URL del manual.
4. La primera exportación OOXML del generador de diseño no era interoperable con el lector web. Fue normalizada y verificada nuevamente con los dos motores antes de incorporarla.

## Bloqueo de promoción

Para completar la certificación y habilitar la promoción controlada deben existir, como variables seguras del entorno (no en el repositorio):

- `QA_API_URL`
- `QA_WEB_URL`
- `QA_SUPABASE_URL`
- `QA_SUPABASE_ANON_KEY`
- `QA_SERVICE_ADMIN_EMAIL`
- `QA_SERVICE_ADMIN_PASSWORD`
- Recomendadas para el control RBAC: `QA_SERVICE_READONLY_EMAIL` y `QA_SERVICE_READONLY_PASSWORD`

Con estas variables, el certificado `scripts/certifications/service-reference-excel-qa.js` descarga y abre la plantilla desplegada, rechaza un lote inválido sin inyección, crea y recarga una referencia válida, actualiza la misma referencia, comprueba piezas/manuales/permisos y finalmente desactiva el registro temporal.

Antes de certificar también debe confirmarse que `/health` de QA reporte el SHA candidato final desplegado.

## Reintento de certificación

El reintento solicitado el 2026-08-26 confirmó lo siguiente:

- `origin/desarrollo` y `origin/develop` continúan en `990a85dc5dba`.
- El candidato controlado continúa en `92277899a336` y su manifiesto conserva 17 rutas exactas sin eliminaciones.
- `/health` de QA responde con `990a85dc5dba`; por tanto, el candidato aún no está desplegado.
- La plantilla `.xlsx` remota responde HTTP 404 en esa versión.
- El navegador QA redirige la ruta de referencias a `/login`; no existe una sesión QA autenticada disponible para el certificado visual.
- El entorno local no contiene las variables seguras requeridas y Railway no está autenticado ni vinculado.
- El workflow remoto `release-check.yml` no ejecuta el certificado de referencias ni provee sus variables específicas.

Resultado: certificación end-to-end **no ejecutable** y promoción **bloqueada**. Las pruebas locales aprobadas no se presentan como sustituto de la certificación funcional en QA.
