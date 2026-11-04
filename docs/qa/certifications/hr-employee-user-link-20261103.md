# Asociacion automatica empleado–usuario

Implementacion: 2026-11-03. Certificacion local: 2026-11-04. Rama: desarrollo.

## Comportamiento

- Crear empleado o editar uno sin vinculo busca por correo de usuario, ignorando mayusculas, dentro del mismo tenant.
- Crear usuario busca una ficha laboral por documento normalizado o correo. Reutiliza esa ficha y conserva salario, datos personales laborales, organizacion e historial contractual.
- No hay vinculacion por nombre ni creacion automatica de credenciales desde Talento Humano.
- Coincidencias multiples, documentos/tipos contradictorios y vinculos ocupados producen HTTP 409 (EMPLEADO_USUARIO_CONFLICTO). Un documento laboral duplicado conserva su validacion previa.
- Usuarios y empleados inactivos participan en la deteccion para evitar duplicados; no se reactivan por asociarlos.
- Las escrituras de creacion y asociacion usan transacciones Serializable. Un conflicto concurrente puede exigir reintentar la operacion; no se reasignan vinculos ocupados.
- No se modifican retrospectivamente registros existentes sin una operacion de guardado.

## Evidencia ejecutada

Comando:

```powershell
node --test apps/api/test/hr-employee-user-link.test.js apps/api/test/hr-employee-organization.test.js apps/api/test/hr-marking-declared-employee.test.js apps/api/test/admin-user-status-regression.test.js apps/api/test/admin-role-capabilities.test.js
```

Resultado: 32 pruebas aprobadas, 0 fallidas. Incluye pruebas de servicios con dependencias simuladas, persistencia de los campos enviados a Prisma, reutilizacion sin sobreescribir salario y contabilidad, rechazo previo a escrituras, permisos y aislamiento del tenant.

Comprobaciones de sintaxis Node de los servicios y git diff --check: aprobadas.

## Certificacion local completada el 2026-11-04

Script versionado: scripts/certifications/hr-employee-user-link-local.js.

La base configurada inicialmente en localhost:54320 estaba inactiva. Se ejecuto contra PostgreSQL local Docker en 127.0.0.1:55432/apexos, utilizando credenciales locales sin exponerlas ni modificar configuracion o secretos.

Resultado: 8 grupos aprobados, con autenticacion HTTP real, servidor Fastify en loopback y persistencia PostgreSQL real. Inicio 2026-11-04T18:41:51Z; fin 2026-11-04T18:42:22Z.

1. Crear empleado sin usuario conserva user_id nulo.
2. Crear usuario reutiliza el empleado; conserva salario, organizacion e historial contractual y evita duplicados.
3. Otro usuario no puede ocupar una ficha vinculada; no se crea el usuario rechazado.
4. Identidad igual en otro tenant no genera enlace entre empresas.
5. Crear empleado enlaza al usuario previo sin ficha laboral, con correo en mayusculas.
6. Editar correo de empleado sin vinculo enlaza al usuario existente.
7. Documentos contradictorios responden conflicto sin crear usuario.
8. Flujo HTTP autenticado: login, 401 anonimo, 403 lectura, alta empleado, alta usuario, lectura de la asociacion, conflicto 409, alta empleado para usuario previo y consulta /hr/self sin duplicar fichas. Se verifica la persistencia y el salario en base; no solo respuestas HTTP.

Reportes locales reproducibles (no se incluyen logs generados ni credenciales en commits): .local/hr-employee-user-link/local-certification.json y local-certification.log. El script acepta --output=<archivo> para repetir la certificacion y registrar SHA, fecha, resultado y controles.

Regresion: 32/32 pruebas del comando anterior, 0 fallidas; npm run performance:guard reporto targets=17 failures=0. Sintaxis Node y git diff --check del cambio aprobados.

## Alcance y autorizacion

El propietario solicito: "Puedes desplegar esto en qa" (2026-11-04). Autoriza promocion puntual desarrollo -> develop para QA funcional; no autoriza produccion.

El arbol del HEAD local previo al cambio (c3eb8b49) coincide exactamente con origin/develop a505e97f962276e9b7f432cf7f5982dd73eee923. origin/desarrollo incluye trabajo adicional fuera de este alcance; queda prohibida su promocion completa. La entrega debe preservar el baseline actual de develop y transportar exclusivamente los archivos enumerados por el manifiesto de alcance.

QA funcional en el ambiente desplegado: pendiente. No se ha publicado ni promovido el cambio al redactar esta evidencia. No se requieren migraciones ni cambios de infraestructura.
