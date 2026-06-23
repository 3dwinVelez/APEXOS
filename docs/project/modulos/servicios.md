# Modulo Servicios

## Cambios aplicados

- El panel principal se reorganizo con acciones principales claras: nueva orden y referencias.
- Las acciones usan `ActionCard` para mantener consistencia visual y tactil.
- El listado de ordenes queda separado del acceso a creacion/configuracion.
- La pantalla operativa de servicio mantiene flujo de una sola orden con formularios anexos por boton.
- El historial de servicio conserva linea de tiempo, evidencias, GPS y descarga de reporte PDF.
- El cierre de servicio ahora replica el patron legacy de firma digital: canvas tactil para que el cliente firme sobre el celular, boton de confirmar y opcion de limpiar antes de guardar.
- Se elimino la opcion visual de cargar archivos en evidencias; las evidencias fotograficas se capturan desde camara usando `capture="environment"`.
- La firma del cliente se guarda como evidencia `firma_cliente` en PNG base64 con metadata de firmante y fecha.
- Se retiro la foto de fachada del inicio; el tecnico confirma su presencia y la plataforma registra el GPS automaticamente.
- Se reemplazo la foto final del cliente por una encuesta tactil de satisfaccion con tres preguntas calificadas de 1 a 5 estrellas.
- El cierre guiado muestra el avance de la encuesta, usa controles grandes para movil y conserva la firma digital como aceptacion final.
- El backend bloquea el cierre normal si faltan producto abierto, producto cerrado, las tres respuestas de satisfaccion o la firma del cliente.
- El backend bloquea el cierre no ejecutado si falta motivo, evidencia fotografica o firma del cliente.
- La creacion/edicion de referencias queda como ficha tecnica: datos base, marca/modelo, tiempos, piezas de inspeccion y documentos tecnicos.
- Las referencias permiten adjuntar manuales o guias en PDF/imagen usando `ServiceReference.metadata.manuals`, sin migracion de base de datos.
- Los manuales/guias aparecen para el tecnico dentro de la inspeccion de piezas, antes de marcar OK, averiada o faltante.
- Se agrega plantilla CSV para carga masiva de referencias; filas con el mismo codigo se agrupan como una referencia con varias piezas.
- El backend expone importacion masiva por `/api/v1/services/references/import` y hace upsert por codigo.
- El lobby de ordenes incorpora busqueda instantanea por orden, cliente, telefono, direccion y referencia.
- La consulta de ordenes permite combinar filtros dinamicos por estado, agenda, tipo de servicio, evidencia y novedades sin recargar la pagina.
- Se agregaron ordenamiento por prioridad operativa o fecha, indicadores de ordenes vencidas/hoy, limpieza de filtros y vistas de tarjetas o lista compacta.
- La cabecera del lobby concentra solo contexto y acciones; los KPIs se retiraron para reservar la pantalla a prioridades, filtros y ordenes.
- El hook global de auditoria acepta operaciones sin cuerpo, evitando respuestas `400` posteriores a cambios de estado validos como pasar una orden a ejecucion.
- El cliente API deja de declarar contenido JSON en solicitudes sin cuerpo, evitando el rechazo `FST_ERR_CTP_EMPTY_JSON_BODY` en transiciones operativas.
- El listado principal usa una tabla profesional en escritorio para comparar orden, cliente, servicio, agenda, soportes y accion; en movil conserva tarjetas tactiles.
- El lobby de referencias replica el patron operativo de Servicios: busqueda inmediata, filtros combinables, ordenamiento, tabla comparativa en escritorio y tarjetas tactiles en movil.
- La consulta de referencias permite comparar estado, categoria, marca/modelo, piezas, documentos y tiempo estimado antes de abrir la ficha tecnica.
- La creacion de orden exige referencia, tipo, fecha del servicio, fecha de entrega CEDI, nombre, cedula, telefono, direccion y observaciones; factura/pedido queda opcional y cedula/entrega CEDI se conservan en metadata para compatibilidad.
- La creacion de orden exige asignar un tecnico activo. No se permite crear una orden sin responsable operativo.
- El rol exacto `Tecnico` solo puede consultar y operar Servicios; no puede crear ordenes, administrar referencias ni abrir reportes globales.
- Cada tecnico solo visualiza ordenes activas asignadas a su ficha (`pendiente`, `en_curso`, `inspeccion` o `ejecucion`). Las preordenes `agendado`, las ordenes de otros tecnicos y las cerradas quedan fuera de su sesion.
- Los usuarios administrativos conservan la consulta total, asignacion de tecnicos, creacion de ordenes, referencias y reportes.
- El seed local mantiene diez cuentas operativas demo, desde `tecnico01@apex.local` hasta `tecnico10@apex.local`, con clave inicial `Tecnico2026!`.
- El tecnico inicia sesion directamente en `Mis servicios activos`, sin pasar por el dashboard empresarial.
- El perfil tecnico usa un shell operativo exclusivo: sin menu modular, inteligencia administrativa ni accesos secundarios; conserva identidad de sesion, salida visible y enfoque en la siguiente orden.
- Cualquier intento del perfil tecnico de navegar hacia otra ruta del dashboard lo devuelve automaticamente a Servicios.
- Reportes de Servicios se organiza en tres vistas administrativas: consolidado operativo, evaluacion/satisfaccion del cliente y piezas requeridas por novedades.
- El consolidado Excel genera un libro con hojas separadas para Servicios, Satisfaccion del cliente y Piezas requeridas.
- Cada vista administrativa puede descargarse como PDF y cada registro permite generar un reporte individual.
- Las piezas averiadas o faltantes registradas durante la inspeccion alimentan automaticamente el reporte de requerimientos con orden, tecnico, cliente, referencia, cantidad, accion, observacion y proveedor sugerido.
- El tecnico puede registrar un proveedor sugerido para una pieza problematica; si no se conoce, el reporte la identifica como `Por definir` para gestion posterior.
- Se agrega formulario publico de solicitud de servicios en `/servicios/solicitar`, sin login, pensado para clientes finales desde cualquier dispositivo.
- El formulario publico guia al cliente por pasos: datos de contacto, direccion, informacion del servicio y confirmacion final.
- La captura de direccion deja de ser un campo abierto y se estructura para contexto de Medellin y Valle de Aburra: tipo de via, numero de la via, via o calle que cruza, numero de casa o apartamento, tipo de lugar, interior o indicacion, barrio/sector, municipio, departamento y sena para llegar.
- La direccion se normaliza en una vista previa antes de enviar, reduciendo ambiguedad para el operador administrativo y el tecnico.
- La solicitud publica crea una preorden en `service_orders` con estado `agendado`, sin tecnico asignado, marcada en metadata como `public_request` y `requires_admin_completion`.
- La solicitud publica conserva en metadata cedula, correo, referencia/producto, fecha tentativa, direccion estructurada con lenguaje local y fecha de recepcion.
- La API publica `/api/public/service-requests` valida campos obligatorios, cedula numerica, telefono, fecha tentativa y empresa activa antes de crear la orden.
- La factura o pedido es opcional en el formulario publico, creacion administrativa, edicion de orden y API/fallback Supabase.
- La empresa destino del formulario publico se resuelve por `APEXOS_PUBLIC_SERVICE_COMPANY_ID` o `NEXT_PUBLIC_APEXOS_PUBLIC_COMPANY_ID`; si no existe, puede buscar una empresa activa por parametro `empresa`.
- La API publica acepta configuracion server-side con `SUPABASE_URL`/`SUPABASE_ANON_KEY` o sus equivalentes `NEXT_PUBLIC_*`, siempre con `SUPABASE_SERVICE_ROLE_KEY` solo en servidor; en desarrollo tambien puede leer el `.env` raiz aunque Next se ejecute desde `apps/web`.
- Al finalizar, el formulario muestra una pantalla amplia de confirmacion con el numero de seguimiento y accion principal para realizar otra solicitud.
- El estado `agendado` representa preordenes creadas desde el link publico. Administracion puede conservarlas sin tecnico mientras valida datos; al cambiarlas a `pendiente`, la asignacion de tecnico responsable se vuelve obligatoria.
- La migracion `20260623173000_service_orders_agendado_status.sql` amplia el constraint de Supabase para permitir `agendado` antes de `pendiente`.
- Mientras esa migracion no este aplicada en el proyecto Supabase remoto, la API publica reintenta la creacion como `pendiente` con metadata `preorder_status=agendado`; el monitor lo normaliza visualmente como `Agendado` para no bloquear solicitudes.
- El enlace administrativo de Servicios se llama `Solicitudes de servicios externas` y abre `/servicios/solicitar?empresa=<empresa>`, evitando que solicitudes nuevas caigan en una empresa activa distinta a la del monitor.
- Si una solicitud externa fue creada antes de este ajuste en una empresa equivocada, debe reasignarse explicitamente con aprobacion operativa porque es una mutacion cross-tenant.
- El monitor incorpora filtro `Solicitudes externas / agendado` para ubicar rapidamente preordenes originadas desde el link publico.
- Promocion controlada: estos cambios viven en `desarrollo`; antes de mover a `develop` y luego `main`, aplicar/validar la migracion `20260623173000_service_orders_agendado_status.sql` en el ambiente objetivo y ejecutar la validacion deterministica indicada en `BRANCHING_WORKFLOW.md`.
- Por seguridad, el endpoint publico no acepta `company_id` arbitrario desde el navegador.
- El lobby de Servicios incorpora acceso a `Formulario publico` para que administracion pueda copiar o abrir el enlace rapidamente.
- Las ordenes creadas desde el formulario publico aparecen en el lobby como `Por completar` o `Completar solicitud`, indicando que administracion debe completar referencia, fecha CEDI o tecnico antes de pasar a operacion.
- La creacion publica no reemplaza la creacion administrativa interna: administracion sigue usando `/dashboard/servicios/nuevo` cuando ya conoce referencia, tecnico y fechas operativas completas.

## Regla de experiencia

Servicios debe operar como una experiencia de campo: pocas decisiones visibles a la vez, botones tactiles y evidencia disponible al consultar una orden cerrada.

El formulario publico debe funcionar como una solicitud guiada para personas sin entrenamiento en APEXOS: lenguaje simple, pasos cortos, validacion inmediata y direccion estructurada. La orden resultante entra a revision administrativa antes de convertirse en trabajo operativo del tecnico.

## Enlace publico

- Local: `http://localhost:3001/servicios/solicitar`
- Produccion: `https://<dominio-apexos>/servicios/solicitar`

## Variables de entorno relacionadas

- `APEXOS_PUBLIC_SERVICE_COMPANY_ID`: empresa por defecto para registrar solicitudes publicas desde el servidor.
- `NEXT_PUBLIC_APEXOS_PUBLIC_COMPANY_ID`: alternativa compatible con despliegues donde se expone el identificador publico de empresa.
- `SUPABASE_URL` o `NEXT_PUBLIC_SUPABASE_URL`: URL del proyecto Supabase usado por la ruta server-side.
- `SUPABASE_ANON_KEY` o `NEXT_PUBLIC_SUPABASE_ANON_KEY`: llave anonima usada junto con service role desde servidor.
- `SUPABASE_SERVICE_ROLE_KEY`: llave server-only requerida para que la API publica inserte solicitudes sin sesion de usuario.
- Si ninguna variable esta configurada, el endpoint intenta resolver empresa activa con el parametro `empresa`, por ejemplo `/servicios/solicitar?empresa=SCJ`.

## Validaciones esperadas

- Crear orden.
- Crear una orden solo despues de seleccionar un tecnico activo.
- Crear y editar una orden sin factura/pedido.
- Crear solicitud publica desde `/servicios/solicitar` sin iniciar sesion.
- Crear solicitud publica sin factura/pedido y verificar que Supabase guarde `invoice_number` como `null` y `status` como `agendado`.
- Confirmar que la pantalla final muestre el servicio creado con exito y permita realizar otra solicitud.
- Verificar que la solicitud publica genere una preorden `agendado` marcada como `public_request` y `requires_admin_completion`.
- Verificar que una solicitud publica aparezca en el lobby de Servicios como `Agendado` / `Por completar`.
- Verificar que el boton `Solicitudes de servicios externas` incluya el parametro `empresa` y que las nuevas solicitudes queden en la misma empresa del monitor.
- Usar el filtro `Solicitudes externas / agendado` para validar la visibilidad de preordenes.
- Verificar que una preorden `agendado` pueda guardarse sin tecnico responsable.
- Verificar que una preorden solo pueda pasar a `pendiente` despues de asignar tecnico responsable.
- Editar la solicitud publica desde administracion para asignar tecnico, referencia, fecha CEDI y observaciones operativas antes de ejecutarla.
- Verificar que el endpoint publico no permita seleccionar `company_id` libremente desde el cliente.
- Verificar que un tecnico solo vea sus servicios activos y que no pueda crear ordenes ni consultar servicios ajenos.
- Iniciar servicio con GPS.
- Registrar inspeccion, ejecucion, novedades y fotos.
- Capturar firma digital del cliente sobre el dispositivo movil.
- Completar las tres preguntas de satisfaccion y verificar su inclusion en el reporte PDF.
- Adjuntar manuales o guias a una referencia y visualizarlos durante la inspeccion del servicio.
- Descargar plantilla CSV e importar referencias con piezas.
- Cerrar solo con evidencias tecnicas, encuesta y firma completas; marcar no ejecutada solo con motivo, evidencia y firma.
- Consultar historial y descargar PDF.
- Descargar consolidados administrativos en PDF y Excel.
- Consultar evaluacion por servicio y satisfaccion promedio del cliente.
- Generar reporte de piezas requeridas por tecnico, orden, referencia y proveedor sugerido.
