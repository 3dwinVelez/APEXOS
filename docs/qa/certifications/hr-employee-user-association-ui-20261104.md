# Empleado y usuario APEX desde Talento Humano

Fecha local: 2026-11-04 (America/Bogota). Implementacion y validacion en desarrollo.

## Comportamiento final

El formulario incluye la seccion Usuario APEX tanto al crear como al editar. No exige ingresar correo del empleado.

- Al escribir tipo y numero de documento, consulta cuentas de la misma empresa cuya ficha laboral coincide; normaliza puntos, espacios y guiones y respeta el tipo de documento.
- Si la cuenta ya tiene ficha, ofrece Abrir ficha existente para completarla. No crea otra ficha ni traslada el usuario, conservando identidad e historial.
- Permite buscar por nombre o correo y seleccionar una cuenta que no tenga empleado. La seleccion se aplica solamente al guardar; puede retirarse antes del guardado.
- Un empleado sin cuenta puede guardarse y vincularse posteriormente. Un vinculo existente se muestra y no se reemplaza desde este flujo.
- La API valida user_id dentro del tenant, impide ocupar vinculos ajenos o reemplazar un vinculo existente y no admite desvinculaciones implicitas.
- La consulta de candidatos exige hr:write y devuelve solo identidad basica, disponibilidad y referencia de ficha. Abrir una ficha exige hr:read y limita la busqueda al tenant, incluidos registros inactivos.

Los documentos de los usuarios se almacenan en sus fichas laborales, no en User. La coincidencia documental reutiliza la ficha mediante su apertura; no inventa documentos ni asocia por nombre sin seleccion explicita.

## Verificacion ejecutada

35 pruebas API y 4 pruebas web aprobadas (39 en total):

```powershell
node --test apps/api/test/hr-user-association.test.js apps/api/test/hr-employee-user-link.test.js apps/api/test/hr-employee-organization.test.js apps/api/test/hr-marking-declared-employee.test.js apps/api/test/admin-user-status-regression.test.js apps/api/test/admin-role-capabilities.test.js
node --test apps/web/test/payroll-employee-entity-ui.test.mjs
npx tsc --noEmit --project apps/web/tsconfig.json --incremental false
```

TypeScript sin errores. Sintaxis Node de los servicios, rutas, esquemas y certificadores aprobada. git diff --check del cambio sin errores.

Certificacion reproducible de extremo a extremo:

```powershell
node scripts/certifications/hr-employee-user-association-isolated-local.js
```

Resultado final: passed, exit_code=0 y unexpected_5xx=[] en PostgreSQL real y navegador Chrome sin respuestas simuladas. Diez grupos aprobados, incluidos dos recorridos de pantalla:

1. Escribir el documento, localizar el usuario y abrir su ficha original; comprobar en base que no aumento el numero de empleados.
2. Crear empleado sin campo de correo, buscar y seleccionar la cuenta, guardar y verificar user_id, salario de 1500000 y una unica ficha nueva en la base.

Tambien se verificaron autenticacion, 401 anonimo, 403 sin escritura, 404 de ficha ajena, 409 de cuenta de otra empresa o vinculo ocupado, consulta self-service, conservacion salarial/contractual y reutilizacion al crear el usuario.

Ejecucion final: 2026-11-05T02:21:10Z a 2026-11-05T02:22:09Z (noche del 4 de noviembre en Bogota). Reportes y capturas locales: .local/hr-employee-user-association/certification.json, isolated-certification.json, certification.log, document-match.png, selected-user.png y saved-user.png. Son artefactos generados locales y no se incluyen en commits.

## Entorno y trazabilidad

Las primeras pruebas identificaron un selector de navegador que apuntaba a la casilla de visibilidad de la columna Salario mensual. Se corrigio para limitarlo al dialogo y verificar el valor escrito y el payload enviado. No se modifico la logica salarial.

La base local compartida carece de sedes y los catalogos administrativos respondian 500. El runner crea una base vacia aislada mediante copia del esquema local, sin datos, y aplica exclusivamente las secciones 1-2 revisadas de la migracion existente 20261016123000_sedes_replace_origins. No reproduce los cambios destructivos de Transporte; no modifica la base fuente, infraestructura ni servicios remotos. La ejecucion final completa no registro respuestas 5xx. La base y los datos sinteticos de certificacion se conservan para inspeccion.

La certificacion evalua los archivos del worktree sobre el HEAD 137a6bf; el commit de entrega guarda esos mismos archivos funcionales y la presente evidencia. Los cambios ajenos que ya estaban en el workspace quedan fuera de la entrega.

Esta correccion de interfaz permanece en desarrollo. No se hizo push, promocion, despliegue ni migracion remota. QA y produccion no se modificaron en esta intervencion.
