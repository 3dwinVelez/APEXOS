# Mallas y maestro de empleados: una fuente operativa

Implementado en desarrollo. Esta entrega no publica cambios en QA ni produccion.

## Cambio

La programacion consulta `/api/v1/talento-humano/empleados?active=true` sin cache, igual que el maestro. El alias `/api/v1/hr/employees` tambien conserva la API operativa como origen. Las dos lecturas bloquean el respaldo preventivo y el respaldo por error que consultaban `public.employees` y usuarios administrativos.

La seleccion conserva codigo, nombre y documento de la ficha. Si falla la consulta, mantiene la ultima lista conocida y muestra un aviso con reintento dentro de la ventana de asignacion. Actualizar vuelve a consultar el maestro. No se migran datos ni se modifican fichas, horarios o marcaciones existentes.

## Certificacion

Script versionado: `scripts/certifications/hr-schedule-employee-source-local.js`, ejecutado mediante `hr-employee-user-association-isolated-local.js --certificate=hr-schedule-employee-source-local.js`.

API Fastify, PostgreSQL y Chrome reales. Recorrido completo aprobado del 2026-11-20T18:45:09.511Z al 2026-11-20T18:46:13.823Z, base sintetica `apexos_cert_hr_assoc_1795200289182`. Base origen sin modificar; cero respuestas 5xx inesperadas.

- Maestro y alias devuelven las mismas fichas activas. Incluye una ficha sin usuario; excluye inactivos y empleados de otro tenant. Consulta anonima rechazada con 401.
- El navegador usa la seleccion de proveedor Supabase con un token valido de la API local. Busca `10005709840`, encuentra la ficha completa, selecciona tambien una ficha sin usuario y guarda ambos codigos mediante POST real. La asignacion permanece tras recargar.
- Una interrupcion real de la lectura del maestro conserva la ficha visible, muestra el error y permite recuperarse mediante Actualizar empleados. No se fabrican respuestas HTTP.
- Conserva exactamente la marcacion previa y su employee_id, el horario anterior y el numero de fichas. El otro tenant no recibe las mallas creadas.
- 42 pruebas de regresion aprobadas. TypeScript de pagina y dependencias aprobado. ESLint sin errores, con dos advertencias preexistentes de navegacion en api.ts.

Artefactos locales: `.local/hr-schedule-employee-source/certification.json`, `isolated-certification.json`, `unit.log`, `complete-document-found.png`, `assigned-and-reloaded.png` y `read-failure-retains-master.png`.

Limite: la certificacion ejercita la seleccion de origen en el navegador y una API local real; no valida la emision de tokens por un proveedor Supabase externo ni modifica el documento real del empleado en QA. La autorizacion y certificacion puntual de una futura promocion se preparan por separado contra su target vigente.
