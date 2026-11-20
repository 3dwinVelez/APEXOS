# Sincronizacion de marcaciones entre clientes

Implementacion local en desarrollo. No se modifico ni desplego produccion.

## Comportamiento

- La web consulta marcaciones y horario en la API operativa cada 12 segundos mientras esta visible y conectada, y al recuperar foco, visibilidad o conexion. Las consultas omiten cache y las solicitudes simultaneas comparten una misma lectura.
- Antes de encolar una marca estando online, vuelve a leer el estado. Si otro cliente ya registro ese paso o cambio el horario, actualiza la pantalla e informa la siguiente marca sin enviar otra copia.
- Une los grupos de nombre/codigo de la misma identidad y horario; deduplica por tipo. No mezcla empleados explicitos distintos, otros horarios ni registros sin horario con uno asignado.
- Conserva el ultimo estado conocido si falla la lectura y muestra la falta de confirmacion. La cola offline conserva su politica, fecha, hora e idempotencia. No elimina una marca optimista mientras se esta persistiendo ni presenta como guardada una marca que no entro en la cola.
- Mantiene estables los objetos de horario sin cambios para no reiniciar los intervalos GPS. Las sesiones/actividades se consultan en cambios de estado; las fotografias no se descargan en cada sondeo de marcaciones. La lectura periodica no reinicia formularios preoperacionales.

## Selfies web en las cuatro marcaciones

La web requiere una foto frontal nueva para entrada, salida a almuerzo, retorno y cierre. Una foto tomada para un paso anterior no valida el siguiente si otro dispositivo avanzo la jornada. El servidor rechaza fotos ausentes, MIME no permitido, contenido que no es imagen y archivos mayores de 2 MB. La foto persiste como evidencia de TimePunch y conserva el transporte offline por IndexedDB. Las reglas de firma y fotos de la app nativa se conservan.

La certificacion versionada incluye un cuarto recorrido completo en Chrome: los cuatro rechazos sin foto y con contenido invalido no escriben, cada boton exige selfie y cada captura valida persiste en la API real; la jornada queda cerrada tras recargar. La evidencia definitiva de este candidato se registra en el manifiesto pre-QA.

## Evidencia anterior de sincronizacion

- 65 pruebas aprobadas: 35 de estado de asistencia y modo offline/diferido, mas 30 de acceso de marcacion, aislamiento de rutas y monitor. TypeScript de pagina/dependencias y ESLint aprobados, sin errores ni advertencias.
- Certificacion versionada: scripts/certifications/hr-cross-device-sync-local.js mediante wrapper aislado. Tres recorridos completos aprobados del 2026-11-20T17:38:41.492Z al 2026-11-20T17:39:54.662Z, base sintetica apexos_cert_hr_assoc_1795196304302. Base origen sin modificar; cero 5xx inesperados.
- API/PostgreSQL/Chrome reales: un cliente HTTP independiente registra entrada; la web la descubre por sondeo sin cola local. Un almuerzo bajo otro alias se descubre con foco/visibilidad; eventos simultaneos comparten una lectura. Un retorno registrado fuera de la web se detecta al pulsar su boton atrasado y no se reenvia.
- Interrupcion real de GET (sin respuestas HTTP fabricadas): conserva cierre como siguiente paso y muestra sincronizacion pendiente. Recuperacion de conexion limpia el aviso. Un cierre offline se persiste localmente, se envia al recuperar conexion, queda una sola vez en TimePunch y conserva estado cerrado tras recarga.
- Otro tenant no recibe esas marcas y la consulta anonima devuelve 401. Cuatro marcas finales, sin duplicados. Artefactos locales: .local/hr-cross-device/certification.json y capturas entry-from-other-device.png, stale-click-refresh.png, read-failure-preserves-state.png, offline-pending.png, closed-and-reloaded.png.

## Limites y entrega

La prueba usa dos clientes de la API operativa, no el binario Android cuyo repositorio no estuvo disponible. No se puentean tablas heredadas ni se reasignan marcaciones historicas sin horario: esos casos requieren identificar el origen y un vinculo seguro. QA funcional, autorizacion de despliegue y compuertas de promocion siguen pendientes.
