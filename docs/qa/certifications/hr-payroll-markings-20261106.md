# Conexion de marcaciones a la liquidacion de nomina

Implementado en desarrollo. Reportes leia TimePunch, pero la liquidacion solo leia ProcessedWorkday; no existia procesamiento automatico entre ambos. El constructor compartido por preview, validacion y liquidacion definitiva ahora proyecta las jornadas actuales de TimePunch en memoria. No escribe ProcessedWorkday ni documentos al generar la prueba. La liquidacion definitiva conserva el guardado y bloqueo de periodos existentes.

Se prioriza employee_id. Para registros antiguos sin ID, el nombre/codigo/alias solo se acepta si identifica un unico empleado en toda la empresa, incluso con filtro individual. Todas las lecturas declaran tenant y rango. No se leen selfies. Las horas se clasifican con timeLogic y configuracion vigente de nomina/calendario; se usa la malla cuando existe, el horario procesado/activo o la jornada configurada como respaldo. Se conserva la compatibilidad con jornadas procesadas sin marcaciones fuente; cuando hay marcaciones, reemplazan la cache para evitar duplicados y datos obsoletos. Las jornadas sin cierre o con menos de un minuto pagable no se incluyen como dias pagados. Las correcciones administrativas de jornada tienen prioridad sobre las horas crudas del mismo dia. El auxilio con alcance mensual usa la misma proyeccion.

## Certificacion local completa

Comando: CERT_BROWSER_PORT=3321 node scripts/certifications/hr-employee-user-association-isolated-local.js --certificate=hr-payroll-markings-local.js

Ejecucion final: 2026-11-07T02:32:40.633Z a 2026-11-07T02:33:55.996Z (UTC; noche del 6 de noviembre en Bogota). Estado passed, exit_code 0, unexpected_5xx=[]. PostgreSQL local aislado, API HTTP real y Chrome real; ninguna respuesta simulada. Base compartida y entornos remotos sin cambios. Se prepararon solo los hunks de esquema local existentes enumerados por el wrapper; ninguna migracion remota.

Se comprobo la quincena 2026-11-01 a 2026-11-15 con un empleado sintetico y tres jornadas de ocho horas: la pantalla de Liquidacion de prueba muestra 3 dias y 24 horas, y la liquidacion definitiva guarda los mismos valores y devengado. Repetir la prueba no duplica horas ni escribe jornadas. Se comprobaron limites de fechas, dia sin salida, 401/403, aislamiento entre empresas, sustitucion de cache obsoleta sin modificarla y prioridad de correcciones administrativas (3 dias, 18 horas al sustituir una jornada de 8 horas por una correccion de 2 horas). Captura inspeccionada: .local/hr-payroll-markings/payroll-linked-trial.png. Logs, imagenes y bases sinteticas quedan fuera del commit.

Una ejecucion inicial detecto P1001 transitorio del PostgreSQL local y fue rechazada por el wrapper aunque el flujo funcional terminara. Se repitio; la certificacion final arriba indicada no contiene errores 500.

## Regresion

49/49 pruebas aprobadas con node --test: hr-payroll-workdays, hr-payroll-adjustment-lock, hr-payroll-adjustment-permission, hr-payroll-social-contributions-bulk, hr-workday-novelties-policy, hr-workday-novelties-contract y payroll-module-alias (apps/api/test/*.test.js). Los scripts y archivos JS modificados pasan node --check; git diff --check sin errores.

La auditoria estatica de permisos tenia un falso positivo preexistente: ignoraba preHandler cuando la declaracion de una ruta ocupaba varias lineas. Se corrigio el analizador del test usando el AST de TypeScript, sin cambiar rutas ni permisos de producto. El helper del navegador admite un puerto configurable y solo termina su propio proceso activo.

## Entrega

Sin push, promocion ni despliegue; QA funcional y validacion con los registros reales de Edwar pendientes. No se modificaron la base ni las liquidaciones de QA. Esta evidencia local no constituye autorizacion de produccion.

## Recertificacion del candidato integrado para QA

Destino 21ef1a6f494c4f0f78fecc0c5bc50ad42f79c277. Se reconstruyeron solo los cambios 618cdd9b y 1f1fa718 de desarrollo. El helper de puerto ya existia en el destino, por lo que no forma parte del diferencial.

La primera ejecucion integrada detecto P2022 para TimeRoute.kind en el esquema local legado. Se agrego un respaldo limitado a esa columna faltante; otros errores de base siguen reportandose. La ejecucion final mantiene ese esquema sin kind para verificar la compatibilidad. No se ejecuta ni requiere migracion remota.

Resultado: 50/50 pruebas seleccionadas y los seis grupos del certificado HTTP/PostgreSQL/Chrome aprobados, exit_code 0, unexpected_5xx=[]. Inicio 2026-11-07T02:42:29.672Z; fin 2026-11-07T02:43:37.253Z. La pantalla de prueba muestra 3 dias y 24 horas con datos sinteticos; la liquidacion guardada conserva las horas y el devengado. Pendiente validar el registro real en QA tras publicar.
