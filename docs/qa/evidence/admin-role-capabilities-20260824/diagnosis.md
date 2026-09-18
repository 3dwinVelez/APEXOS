# Diagnóstico de roles y usuarios

Se reprodujeron cuatro causas distintas sobre el flujo administrativo:

1. El backend reconocía al administrador por nombres exactos. Un rol con `role_type=admin_empresa` y nombre personalizado de Nyvora recibía 403 al administrar usuarios.
2. El permiso agregado `admin:write` permitía operaciones no concedidas en la matriz histórica. Un rol de soporte con capacidad de edición podía llegar a crear usuarios.
3. La ruta de edición respondía 200, pero omitía silenciosamente cargo, área y otros campos operativos enviados.
4. Varias búsquedas administrativas por identificador dependían del contexto implícito y no expresaban `tenant_id`, por lo que no había una barrera local verificable contra identidades de otra empresa.

La interfaz Next y la API principal tampoco evaluaban exactamente la misma capacidad y operación. La corrección unifica ambas decisiones con capacidades granulares de consultar, crear, editar e inactivar usuarios, y consultar, crear, editar o eliminar roles.

No se modificaron datos productivos. La reproducción y la certificación usaron PostgreSQL y servicios locales aislados con una empresa sintética llamada Nyvora.
