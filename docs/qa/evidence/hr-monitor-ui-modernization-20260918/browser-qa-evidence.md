# Evidencia de navegador QA — modernización del monitor de mallas horarias

- **Fecha:** 2026-09-19
- **Ambiente:** QA (`https://apexos-web-qa-production.up.railway.app`)
- **API desplegado:** commit `a45aa6cfe733cdf0a75e1d46ce7b8d95b9e88c1b` (verificado vía `/health`)
- **Usuario:** administrador de certificación desechable en el tenant SCJ QA (eliminado al terminar la verificación)

## Flujo verificado

1. **Login** en el frontend QA como administrador del tenant SCJ — exitoso.
2. **Lista de horarios** (`/dashboard/talento-humano/rutas`) con filtro de fecha `18/09/2026`:
   - 3 rutas del día listadas con métricas (3 de 88, 67 activos, 424 personas).
   - **KPI de evidencias corregido:** las tarjetas de ruta muestran `3 evidencia(s)` para las rutas certificadas
     (antes de la corrección el badge contaba solo evidencias de actividades y mostraba `1 evidencia(s)`
     mientras el drawer renderizaba 3 fotos). Captura: `qa-lista-horarios-kpi-evidencia.png`.
3. **Monitor administrativo** (drawer de la ruta 271, certificada con 14 controles en QA):
   - Equipo asignado con chips de marcación por persona (Entrada / Almuerzo / Retorno / Cierre) y chip de actividad.
   - Persona sin marcar identificada con `Sin marca registrada` + `Sin GPS`.
   - `Última marca: Cierre · 16:05` con coordenadas y precisión.
   - Trazabilidad cronológica con badges `4 marcaciones · 1 actividades · 3 evidencias`,
     puntualidad (`Dentro de tolerancia (+10 min)`, `Salida temprana 115 min`) y GPS con precisión.
   - **3 miniaturas fotográficas base64** renderizadas desde el endpoint batch
     (`/api/v1/hr/monitor-evidence/route/:routeId`). Captura: `qa-monitor-drawer.png`.
4. **Consola del navegador:** 0 errores.

## Verificación DOM (programática)

- `3 evidencia(s)` presente en las tarjetas del listado (3 elementos).
- `[role=dialog] img` = 3 imágenes `data:image/png;base64` en el drawer.
- Texto del drawer incluye `4 marcaciones | 1 actividades | 3 evidencias`.

## Limpieza

- Usuario administrador de verificación `qa.browser.20260919@scj.test` eliminado de la base QA al finalizar.
- Usuarios de certificación SCJ y NYVORA desactivados por sus respectivos scripts.
