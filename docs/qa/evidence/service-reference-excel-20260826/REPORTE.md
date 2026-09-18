# Reporte de estado — Referencias de servicio por Excel

Fecha: 2026-08-26  
Rama de implementación: `desarrollo`  
Commit funcional: `a09bbe9`  
Destino autorizado: `develop`  
Producción (`main`): fuera de alcance

## Estado

La implementación está completa y el candidato aislado `4a08f995b076` fue desplegado en el entorno temporal Railway `xlsx-preview-20260826`. El certificado end-to-end versionado finalizó con 14 controles aprobados y limpieza del registro temporal. `develop` y `main` permanecieron sin cambios durante la certificación.

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

## Certificación remota

- `/health` confirmó el SHA `4a08f995b076`.
- La plantilla respondió HTTP 200, MIME OOXML y 19.804 bytes.
- Se verificaron las hojas `Referencias`, `Ejemplo` e `Instrucciones` y los 15 encabezados.
- Un lote inválido fue rechazado con HTTP 400 sin inyección parcial.
- Un lote válido creó la referencia, persistió piezas y manual, y una segunda importación actualizó sin duplicar piezas.
- La importación sin autenticación fue rechazada con HTTP 401.
- La referencia temporal se desactivó y el usuario temporal fue eliminado al finalizar.
- La regresión protegida creó e inició una orden, aplicó siete correcciones auditables, bloqueó el rol limitado y el acceso entre tenants, y dejó la orden cancelada.
- La regresión transversal aprobó sesión, Servicios, Talento Humano, Inventario y Contabilidad; los cuatro usuarios técnicos quedaron desactivados.
- La evidencia no contiene credenciales: `certification.json`.

## Reintento de certificación

El reintento solicitado el 2026-08-26 confirmó lo siguiente:

- `origin/desarrollo` y `origin/develop` continúan en `990a85dc5dba`.
- El candidato controlado continúa en `92277899a336` y su manifiesto conserva 17 rutas exactas sin eliminaciones.
- `/health` de QA responde con `990a85dc5dba`; por tanto, el candidato aún no está desplegado.
- La plantilla `.xlsx` remota responde HTTP 404 en esa versión.
- El navegador QA redirige la ruta de referencias a `/login`; no existe una sesión QA autenticada disponible para el certificado visual.
- El entorno local no contiene las variables seguras requeridas y Railway no está autenticado ni vinculado.
- El workflow remoto `release-check.yml` no ejecuta el certificado de referencias ni provee sus variables específicas.

Este registro histórico de bloqueo fue resuelto con el despliegue temporal y la ejecución certificada indicada arriba. La promoción sigue sujeta al manifiesto de alcance y a la aprobación controlada hacia `develop`; `main` continúa fuera de alcance.
