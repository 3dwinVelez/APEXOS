# Intervencion pendiente de QA: Transporte y PDF

Estado: NO APTO PARA PROMOCION. Plan preparado en desarrollo; no ejecutado remotamente.

## Evidencia y alcance

El candidato funcional certificado es `5bbba836c6e98577d77eff1812c4e3a7f5e4b2ab`, aislado de privacidad e iniciador local. La evidencia esta en `manifests/transport-settlement-20261020-preqa.json`. La inspeccion del 20 de octubre de 2026 del API de APEXOS QA devolvio `unshare: unshare failed: Permission denied`. Esto bloquea el contrato de runtime certificado localmente; no acredita por si solo el resultado de un navegador remoto que aun no se ha desplegado.

Proyecto QA: `33726923-021d-47a7-a263-b8b287f164f1`. Ambiente: `97b0366d-a965-4356-88fd-f66dc45e83b9`. API: `15c25be0-4ecd-49c8-87c1-da675c2b9d01`. Aunque el ambiente se llama `production`, estos identificadores pertenecen al proyecto APEXOS QA. La CLI local esta vinculada a otro proyecto; toda accion remota debe indicar los tres identificadores explicitamente.

## Runtime propuesto

Preparar un generador dedicado en un host Linux con Docker que admita el perfil de `../../infra/pdf-renderer/seccomp.json`. El despliegue requiere primero identificar el host, su propietario, acceso administrativo, red y costo autorizado. No existe actualmente un servicio remoto de renderizado implementado ni un destino seleccionado.

La separacion del generador exige un cambio de aplicacion en desarrollo, no solamente una variable: el codigo actual abre Chromium dentro del API y el frontend privado de Railway no es accesible automaticamente desde otro host. Antes de implementar se debe definir la conectividad. El contrato minimo de la solucion sera:

- El API mantiene autenticacion, permiso, empresa y estado liquidado; construye la instantanea del informe antes de solicitar el PDF.
- El generador no recibe acceso a PostgreSQL, Supabase ni sesiones del usuario. Recibe solamente la instantanea autorizada del documento y devuelve el PDF.
- El canal API-generador requiere autenticacion de servicio y transporte cifrado o una red privada autenticada. Credenciales exclusivas de QA se ingresan mediante el gestor de secretos, nunca en Git.
- El generador carga una copia compilada de la vista de impresion y de la etapa 4, de la misma revision que el API, desde su propio origen local. No acepta URLs, HTML o ejecutables arbitrarios del solicitante.
- Chromium se ejecuta sin root y con sandbox activo. Se usa el perfil seccomp versionado; quedan excluidos no-sandbox, seccomp unconfined, SYS_ADMIN y modo privilegiado.
- Solicitudes y respuestas tienen limites de tamano, concurrencia y tiempo. El documento no se registra ni se almacena permanentemente. Fallos del generador devuelven un error controlado sin modificar la liquidacion.
- La certificacion completa debe ejercer el API, el canal real y el generador separados; una prueba del worker aislado no basta.

El overlay existente `../../infra/docker-compose.pdf-sandbox.yml` certifica el API con Chromium integrado en Docker. Es una base probada del requisito de sandbox, pero NO implementa la arquitectura separada anterior ni constituye un despliegue listo para Railway.

## Alternativa sin servidor propio

El usuario confirmo que no tiene servidor y solicito preparar una alternativa de infraestructura. Se propone una VM Basic de DigitalOcean exclusiva para el generador QA, manteniendo API, base de datos y aplicacion actuales en Railway. Esto evita trasladar todos los servicios y limita el nuevo acceso a las instantaneas de los PDF solicitados.

Precios oficiales consultados el 20 de octubre de 2026 en https://www.digitalocean.com/pricing/droplets:

| Configuracion Regular | Precio base mensual | Uso propuesto |
| --- | --- | --- |
| 1 vCPU, 2 GiB RAM, 50 GiB SSD | USD 12 | Alternativa economica para probar una generacion a la vez; capacidad aun no medida |
| 2 vCPU, 4 GiB RAM, 80 GiB SSD | USD 24 | Punto de partida recomendado para QA; capacidad aun no certificada |

Los importes son del recurso de computo, antes de impuestos y extras. No incluyen dominio, backups, almacenamiento adicional ni exceso de transferencia. El plan Regular de 4 GiB incluye 4.000 GiB de transferencia segun la tabla consultada. El tamano propuesto es una hipotesis operativa, no un resultado de pruebas de rendimiento. No se ha creado una cuenta, contratado recursos ni generado cargos.

Especificacion revisable del recurso recomendado:

- Nombre: `apexos-qa-pdf`; Linux x86_64, Ubuntu LTS soportado, Docker Engine con Compose y perfil seccomp versionado. Elegir region junto al ambiente QA tras confirmar disponibilidad y latencia.
- Una generacion simultanea al inicio. Probar el documento certificado de tres paginas y dos capturas de tarifario, medir memoria/CPU y tiempo antes de fijar limites definitivos o reducir recursos.
- Publicar solamente HTTPS del endpoint autenticado del generador. SSH restringido al origen administrativo aprobado; no exponer puertos de Chromium/CDP, Docker ni la vista Next interna. HTTPS requiere un nombre DNS controlado y certificado valido antes de enviar datos.
- Compilar la vista de impresion fuera de la VM y distribuir el mismo artefacto versionado que el generador. No ejecutar builds como root con credenciales de produccion.
- Crear un secreto de servicio exclusivo de QA mediante el gestor de secretos al autorizar la intervencion. El API de Railway necesitara configuracion del endpoint y credencial; la VM no recibira DATABASE_URL, JWT_SECRET ni claves Supabase.
- Registrar solo identificador de solicitud, resultado, duracion y version; no registrar cuerpo, PDF ni datos de cliente. Mantener los documentos en memoria durante la solicitud y cerrar el navegador al finalizar o fallar.
- Criterio inicial de aceptacion del host: ejecutar Chromium sin root, comprobar sandbox, namespaces y Seccomp-BPF; despues ejecutar la certificacion del PDF completo. La compra de una VM no garantiza que estas pruebas pasen.
- Recursos adicionales autorizables: una VM y su firewall, un registro DNS bajo dominio controlado, certificado HTTPS, credencial QA y variables del API QA. No incluye migraciones, cambios de produccion ni nuevos accesos a datos de la VM.

La siguiente decision humana es aceptar proveedor/costo y facilitar una cuenta y dominio controlados por el propietario. No se deben pegar claves, passwords ni tokens en el chat. Aprobar este documento por si solo no debe interpretarse como que el recurso ya existe o fue certificado.

## Migraciones exactas pendientes

1. `20261016123000_sedes_replace_origins`: renombra TransportOrigin como sedes y las referencias de necesidades, planes y viajes. Antes de retirar los cuatro campos de origen de TransportRateCard, archiva sus valores en metadata. Conserva IDs, actividad y relaciones existentes. Agrega sedes predeterminadas para las empresas con sedes existentes.
2. `20261019134505_transport_settlement_vehicle`: permite carrier_id nulo en TransportSettlementPackage para paquetes asociados al vehiculo.

La primera migracion cambia contratos que consume el API anterior. Requiere una ventana coordinada de QA: detener escrituras de Transporte y consumidores antiguos, aplicar el cambio y desplegar API/frontend compatibles antes de reabrir. No es seguro aplicar SQL y dejar operando la version anterior.

Antes de ejecutar, realizar respaldo recuperable de la base QA y comprobar restauracion en una base aislada. Verificar inventario real, columnas, constraints, indices y registro Prisma contra la revision candidata; abortar ante divergencia o migraciones ajenas pendientes. No ejecutar `prisma migrate deploy` indiscriminadamente ni marcar migraciones como aplicadas sin haberlas ejecutado. La autorizacion de infraestructura no sustituye la autorizacion independiente de estas dos migraciones.

Despues del cambio: verificar archivo de origen en metadata, conteos e IDs por empresa, claves foraneas, actividad de sedes y paquetes sin transportadora historica; ejecutar auditoria completa del schema publicado y certificacion funcional con datos sinteticos. No guardar datos ni credenciales de QA en la evidencia versionada.

## Recuperacion

Ante fallo de migracion o integridad, mantener QA cerrado a escrituras. Recuperar el respaldo verificado dentro de la ventana y restaurar las versiones compatibles anteriores; no desplegar el API anterior contra el esquema nuevo. Esta operacion tambien requiere autorizacion. Una vez reabiertas las escrituras, no restaurar un respaldo antiguo sin reconciliar los datos posteriores. La prueba transaccional local de migraciones no equivale a una restauracion remota certificada.

Ante fallo exclusivo del generador, conservar las liquidaciones y su trazabilidad; bloquear la promocion hasta corregir y repetir la certificacion del PDF. No habilitar una variante sin sandbox.

## Secuencia de cierre

1. Identificar host y aprobar alcance remoto y costo, si corresponde.
2. Implementar y certificar el generador separado en desarrollo con el frontend de la misma revision; revisar seguridad y repetir los flujos protegidos afectados.
3. Reconstruir el candidato puntual sobre el develop remoto vigente y versionar inventario exacto v2; repetir alcance y pre-QA. No reutilizar el SHA certificado si cambia el codigo.
4. Con autorizaciones independientes, preparar runtime y credenciales exclusivas QA, respaldo y ventana para las dos migraciones.
5. Abrir PR del candidato autorizado, verificar CI y completar la integracion controlada a develop con despliegue coordinado. Nunca push directo a develop.
6. Ejecutar QA de navegador: crear, editar, aprobar con otro usuario, contabilizar, liquidar, descargar PDF y reabrir. Probar permisos, otra empresa, errores del generador y persistencia; verificar detalle y dos capturas reales de etapa 4 con precios historicos.
7. Registrar commit desplegado y dictamen. Main y produccion siguen fuera del alcance.

Las pruebas locales ya ejecutadas no necesitan repetirse por este documento; cualquier nueva implementacion del canal o runtime si requiere nueva certificacion. La clave SSH temporal de la inspeccion fue retirada y sus archivos locales eliminados.

Verificacion del plan el 20 de octubre de 2026: se repitio `node scripts/certifications/transport-sedes-migration-local.js <salida-temporal>`; sus siete controles pasaron y la transaccion fue revertida. No se ejecutaron migraciones remotas. `git diff --check` sin errores antes del commit del documento.
