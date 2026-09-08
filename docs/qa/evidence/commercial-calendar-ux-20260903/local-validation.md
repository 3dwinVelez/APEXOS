# Validación local — calendario y navegación de Gestión Comercial

Fecha: 2026-09-03
Rama de implementación: `desarrollo`

## Alcance

- Calendario de visitas presentado en una ventana modal accesible.
- Vistas de día, semana y mes con navegación por períodos reales.
- Etiquetas inteligentes para eventos programados, de hoy, en curso, completados, vencidos y cancelados.
- Resumen tabular compacto antes de abrir el calendario.
- Navegación horizontal homogénea y compartida por todas las pantallas de Gestión Comercial.
- Agrupación de eventos por fecha en tiempo lineal y carga separada de maestros para evitar solicitudes repetidas.

## Evidencia automatizada

- `npm --workspace apps/web run typecheck`: aprobado.
- ESLint dirigido a los cinco archivos del cambio: aprobado.
- `node --test apps/web/test/commercial-calendar-experience.test.mjs apps/web/test/commercial-visit-selection.test.mjs apps/web/test/commercial-module-catalog.test.mjs`: 29/29 pruebas aprobadas.
- `npm --workspace apps/web run build`: aprobado; las rutas de Gestión Comercial se generaron correctamente.
- `git diff --check`: aprobado.

## Evidencia interactiva

Se validó en navegador local autenticado:

- apertura directa con `?calendario=1`;
- modal identificado como `dialog` y cierre accesible;
- cambio entre Día, Semana y Mes;
- rangos `03/09/2026`, `31/08/2026—06/09/2026` y `01/09/2026—30/09/2026`;
- leyenda de estados y navegación persistente del módulo;
- tabla compacta y estado vacío sin deformar la pantalla.

La consulta de datos remotos desde `localhost` fue bloqueada por la política CORS del ambiente QA. La certificación visual con eventos reales debe ejecutarse después de una promoción autorizada a `develop`; esta evidencia local no se presenta como aprobación de despliegue.
