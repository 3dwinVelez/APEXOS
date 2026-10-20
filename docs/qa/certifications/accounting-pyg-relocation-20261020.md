# PYG por vehiculo dentro de Contabilidad

Solicitud autorizada: trasladar el reporte desde Transporte a Contabilidad, implementar en desarrollo y actualizar develop por las ramas existentes. No se crean ramas auxiliares. Produccion queda fuera del alcance.

## Comportamiento

Ruta principal `/dashboard/contabilidad/pyg`, tarjeta en la portada contable, pestana en la navegacion contable y funcion del buscador asignada a Contabilidad. Se retira la tarjeta de Transporte. La ruta anterior `/dashboard/transporte/pyg` conserva compatibilidad mediante redireccion del servidor.

Lectura requiere accounting:read y presupuestos, mapeos e impuesto requieren accounting:write, tanto en interfaz como en API. Las URLs API existentes se conservan para consumidores. La configuracion obtiene un catalogo minimo de conceptos de gasto del tenant con permiso contable; no concede permisos generales de caja menor. La auditoria nueva se registra en accounting, preservando eventos historicos.

Se conserva el motor, fuentes operativas, importes, periodos, consolidado, detalle por placa, presupuestos, configuracion y exportacion Excel. No se transforma este reporte operativo en otro estado calculado desde el mayor. No hay cambios de esquema, migraciones ni correcciones remotas de datos.

## Certificacion reproducible

`node scripts/certifications/accounting-pyg-relocation-local.js <salida-ignorada>` crea una base PostgreSQL local aislada y ejecuta Fastify real con registro de dos sociedades. Carga un vehiculo, ingreso aprobado y concepto de gasto; prueba presupuestos, mapeo, impuesto y lectura posterior. Verifica ingreso 1000, presupuesto 2000 y cumplimiento 0,5; auditoria contable; lectura sin permisos de Transporte; catalogo minimo; lectura y escritura denegadas segun rol; aislamiento entre sociedades; periodo invalido y anonimo. Los datos sinteticos son locales. Las salidas crudas quedan fuera de Git.

El script concluyo con 29 verificaciones aprobadas sobre commit funcional `1ede8992`. La regresion del motor PYG aprobo sus nueve pruebas. El script de certificacion previo se actualiza para reconocer la nueva ubicacion y permisos; no se sustituye su bateria por una simple comprobacion HTTP.

La regresion de navegacion y permisos aprobo 12 casos y detecto un fallo preexistente de cobertura global del buscador: faltan las rutas importar-saldos-iniciales y gastos-menores/gastos/nuevo. La misma prueba ejecutada en el checkout del target `74440d97` falla exactamente por esas dos rutas. No hay regresion nueva; PYG tiene un unico destino contable y el alias anterior se comprueba como redireccion. Este defecto de cobertura ajeno no invalida la certificacion funcional del traslado, que aprobo completa.

La prueba CUA en compilacion local de produccion ingreso con usuario sintetico exclusivamente contable, abrio la tarjeta de Contabilidad y comprobo el detalle PYG123 (ingreso 1000, presupuesto 2000, cumplimiento 50%, utilidad 975), la navegacion contable y Configuracion con el concepto de caja menor sin necesitar permisos generales de caja menor. La primera validacion encontro que el guard cliente de Transporte impedia la redireccion de la pagina antigua; se corrigio mediante redireccion Next anterior al guard. La repeticion aprobo: HTTP 307 a la nueva ruta, usuario exclusivamente contable accede desde URL antigua y aparece el reporte real. Captura PNG e instantaneas DOM conservadas fuera de Git en `.tmp/accounting-pyg-local.png` y `.tmp/accounting-pyg-browser-*.txt`. No se afirma validacion movil.

Compilacion de produccion webpack y TypeScript aprobados. Lint de todos los archivos frontend afectados aprobado con cero errores y una advertencia preexistente de img en Transporte. El intento de lint desde la raiz no encontro configuracion; se repitio desde apps/web, su directorio configurado. Las modificaciones automaticas de next-env y tsconfig del build se excluyen de la entrega. QA Gate y Security Gate: APTO CON OBSERVACIONES por las dos rutas preexistentes sin registro y el limite de validacion movil; no hay bloqueante funcional del traslado.

## Seguridad y recuperacion

Security Gate limitado a las rutas y permisos cambiados: pruebas reales de usuario contable sin Transporte, Transporte sin Contabilidad, lector sin escritura, anonimo y otra sociedad. El catalogo devuelve solo id, codigo, nombre y activo del tenant; no expone cuentas o notas. No se identificaron vulnerabilidades explotables en estas superficies. No se modifican secretos, infraestructura, dependencias ni permisos de usuarios reales. Sin prueba de carga o auditoria global.

Recuperacion mediante revert revisado de los commits puntuales siguiendo desarrollo -> develop; no restaurar snapshots antiguos ni eliminar datos. Los accesos de Transporte al PYG pasan intencionalmente a depender de permisos de Contabilidad existentes.
