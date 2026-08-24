# Certificación funcional: rol Empleado marcaciones

Fecha: 2026-08-24

Rama evaluada: `desarrollo`

Empresa modelo: `NYVORA`

Entorno: PostgreSQL y aplicaciones API/web reales en infraestructura QA local aislada.

## Resultado

El rol `Empleado marcaciones` quedó limitado al perfil `marking_only` y a los permisos `time_tracking:read` y `time_tracking:write`. El usuario autenticado aterriza exclusivamente en `/dashboard/talento-humano/marcacion` y solo visualiza su jornada, su historial y el control de su cuenta.

El certificado versionado creó un usuario, un empleado y dos horarios controlados en NYVORA. Ejecutó el flujo completo de `entrada -> inicio_almuerzo -> fin_almuerzo -> salida`, creó actividad y GPS propios, y confirmó la persistencia de las cuatro marcaciones mediante la consulta de asistencia del propio usuario.

Evidencia estructurada: `certification.json` (17/17 controles) y `browser-certification.json` (7/7 controles).

## Aislamiento visible

La sesión no mostró Sidebar, navegación móvil ni asistente IA. Las navegaciones directas a `/dashboard`, `/dashboard/servicios` y `/dashboard/talento-humano/mapa` fueron redirigidas a la pantalla exclusiva de marcaciones.

## Compuerta pendiente

Esta es evidencia previa a integración. De acuerdo con la política del proyecto, el mismo certificado debe repetirse sobre el commit exacto desplegado en `develop`; esta evidencia local por sí sola no autoriza publicación ni promoción a `main`.
