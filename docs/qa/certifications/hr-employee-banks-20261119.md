# Talento Humano: bancos y cuenta del empleado

## Alcance en desarrollo

- Maestro `/dashboard/talento-humano/bancos`: alta, edicion y desactivacion de bancos por empresa; acceso desde Talento Humano y la ficha del empleado.
- Codigo nacional ACH de tres digitos como identificador estable de texto. SWIFT/BIC opcional e independiente (8 u 11 caracteres). Bancos iniciales: Banco de Bogota `001`, Bancolombia `007`, Davivienda `051`.
- Ficha del empleado: selector Banco y Cuenta bancaria de texto libre (hasta 100 caracteres), disponibles en creacion, edicion y consulta. Ambos opcionales, completos conjuntamente. Se conservan ceros iniciales y caracteres de texto; no se convierte la cuenta a numero.
- Validacion en servidor: banco del propio tenant, activo al asignarlo, rechazo de codigos duplicados o inconsistentes. Un banco inactivo permanece en las fichas existentes; no se puede asignar nuevamente.
- Permisos `hr/read` y `hr/write` en los endpoints del maestro y de la ficha del empleado.

## Persistencia e integracion

Catalogo persistente en `Tenant.config.hr_banks`, con actualizacion JSONB puntual y bloqueo por tenant para proteger altas concurrentes. Conserva la configuracion contable y demas claves. No requiere migraciones.

La ficha usa `Employee.metadata.bank_code`, `bank_entity_name`, `bank_account_code`. Se reutilizan los campos bancarios que ya lee y enmascara el comprobante de nomina. El codigo permite resolver el banco del maestro en un futuro plano de pagos; este alcance no genera archivos ni ejecuta pagos.

Referencias de codigos nacionales consultadas el 2026-11-19: [PayU: codigos de bancos de Colombia](https://developers.payulatam.com/latam/es/docs/getting-started/response-codes-and-variables.html), [Bancolombia: anexo tecnico que usa 007](https://www.bancolombia.com/wcm/connect/www.bancolombia.com-26918/780e3bd3-cfa2-46e9-9e82-e361a41983a6/F2099AnexoTecnicoOperativoBoton.pdf?CVID=phbe3Dc&MOD=AJPERES). El formato concreto del futuro archivo bancario debera definir el relleno y tipo de cuenta correspondientes al convenio.

## Validacion

- Pruebas unitarias de bancos y regresion del vinculo usuario-empleado y periodos: 23/23 aprobadas.
- TypeScript de las tres paginas modificadas y sus dependencias: aprobado con configuracion temporal local (`npx tsc --noEmit -p .local/hr-employee-banks/tsconfig.json --types node`).
- Certificacion versionada: `scripts/certifications/hr-employee-banks-local.js`; PostgreSQL local aislado + HTTP real + Chrome. Prueba maestros, permisos, aislamiento, creacion y edicion de empleado, valores parciales invalidos, limpieza, preservacion del salario/organizacion, banco inactivo, persistencia y recorrido visual.
- Certificacion integral: **aprobada, 5/5 recorridos**, del 2026-11-19T15:53:55.671Z al 2026-11-19T15:55:03.942Z. Base aislada `apexos_cert_hr_assoc_1795103619107`; base origen sin modificar; cero respuestas HTTP 5xx inesperadas. La persistencia final se verifico desde un proceso Node nuevo, sin estado en memoria compartido.
- Artefactos locales no versionados: `.local/hr-employee-banks/certification.json`, `isolated-certification.json`, `bank-master.png`, `employee-bank-view.png`. La captura de la ficha conserva visible la cuenta de prueba `0000456789` despues de recargar.
- Se corrigieron problemas del arnes durante los intentos previos: reemplazo incompleto del nombre en la automatizacion, rol privilegiado aplicado por error al caso negativo, configuracion del pool local y reutilizacion no admitida de la instancia Fastify para probar reinicio. Esos intentos no constituyen aprobacion; el resultado aprobado corresponde al recorrido completo posterior.

## Entrega

Sin modificaciones remotas, migraciones, push o despliegue. Una futura promocion requiere autorizacion independiente y manifiestos exactos de alcance y pre-QA para desarrollo -> develop -> main. Los cambios previos del rango quincenal y los cambios ajenos del workspace permanecen separados de este alcance.
