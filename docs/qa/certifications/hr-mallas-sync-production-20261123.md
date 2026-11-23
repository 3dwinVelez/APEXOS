# Mallas y sincronizacion entre dispositivos: entrega puntual

QA desplegado: `914d1721965d727a14c7e836039e2334678ca2de`. Fuente web aprobada previamente: `6a393e673f9b4480e1fe004bec210cb3ce89f428`. Empresa modelo autorizada por el usuario: Cliente Piloto QA.

El candidato conserva el `main` actual `a0fb7e05b65d84e619b80cb30790b27f3b940fb3` y cambia seis archivos funcionales: maestro canonico en mallas, sincronizacion de marcaciones y pertenencia del horario al tenant antes de editar. Conserva las reglas productivas de selfie y las validaciones de jornada, GPS y kilometraje. No agrega migraciones ni cambia datos existentes.

La certificacion QA real termino el 2026-11-23 a las 16:04:18 UTC. Chrome autenticado encontro un empleado sintetico por documento completo, asigno su malla, guardo, reabrio y recargo. Una lectura interrumpida mantuvo el maestro y permitio reintentar. Un dispositivo independiente registro entrada, almuerzo y retorno; el navegador actualizo el estado, evito la escritura duplicada y recupero una salida pendiente tras volver en linea. La secuencia persistio una sola vez.

La regresion transversal independiente comprobo sesion, navegacion, administracion, transporte y seleccion desde la sesion Supabase real de QA. Un rol sin permiso obtuvo 403 y otra empresa obtuvo 404 al leer el empleado o modificar el horario. Los fixtures se cancelaron y las cuentas temporales se desactivaron. Los JSON sanitizados estan en `../evidence/hr-mallas-sync-production-20261123/`.

La prueba de aislamiento inicial encontro una edicion entre tenants y bloqueo esta entrega. La correccion se implemento en desarrollo (`cd3a88e5`), paso certificacion local con el dueno y un usuario extranjero, y se integro a QA mediante PR 110. Los certificados actuales repiten el flujo completo con la correccion desplegada; no se reutiliza el resultado fallido anterior.

El candidato puntual tambien paso Chrome, API y PostgreSQL locales con datos sinteticos, preservando la identidad, horarios y marcaciones anteriores. Se ejecutaron 39 regresiones web y 17 controles de gobernanza. ESLint no tuvo errores, con dos advertencias anteriores en api.ts. El contenedor local requirio ajustes de esquema solo en bases desechables, documentados en los resultados; no se aplicaron migraciones remotas.

La excepcion de rama y empresa modelo fue autorizada expresamente por el usuario. El usuario aprobo explicitamente QA `914d1721` para produccion; la decision y fecha estan registradas en el manifiesto. No se ha desplegado este candidato en produccion. La publicacion requiere ademas inventario exacto, compuertas completas y CI verde. La verificacion posterior ejecutara ambos certificados en un tenant sintetico separado de los clientes. Cualquier falla rechaza la version y activa el procedimiento de reversa controlada declarado en el manifiesto, respetando las autorizaciones y el flujo de ramas.
