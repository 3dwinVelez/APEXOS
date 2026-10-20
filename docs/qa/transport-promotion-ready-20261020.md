# Candidato de Transporte para QA

El bloqueo local de Chromium se resuelve con el perfil seccomp versionado de Microsoft Playwright, conservando usuario no root, sandbox Chromium y denegacion predeterminada de syscalls. El documento completo se certifica con el API real en Docker y el frontend compilado en produccion. La certificacion del servidor de desarrollo por hostname privado no se reutiliza como aprobacion: no hidrataba la vista de impresion. El build y el arranque desde el directorio del workspace de produccion funcionan.

El PDF Linux revisado tiene tres paginas, dos imagenes de la etapa 4, rutas/clientes/tiendas y total 525.000 COP. Conserva la tarifa de 500.000 tras una version posterior de 700.000. El validador `verify-transport-settlement-pdf.py` comprueba texto, valores, imagenes y orientacion de los anexos.

La regresion protegida HTTP de Servicios crea usuarios, roles, referencias, tecnicos y ordenes sinteticas en dos empresas. Cubre creacion e inicio interno y de orden externa sincronizada, tecnico asignado, correccion de observacion, persistencia de items y estado, auditoria, denegacion anonima, rol limitado y acceso cruzado. Sus 35 comprobaciones se ejecutan sobre el API y PostgreSQL reales, sin mock de autenticacion, permisos o persistencia. No certifica la importacion externa de Supabase ni un UUID externo aun no sincronizado, contratos no modificados por esta entrega.

Los resultados definitivos, SHA candidato, inventario exacto, hashes y evidencias sanitizadas se registran en los manifiestos de promocion. El informe `transport-promotion-blocked-20261020.md` conserva el diagnostico anterior y no es el dictamen vigente del candidato recertificado.

## Condiciones de QA

Esta certificacion local no implica que Railway este usando el perfil requerido. El despliegue del PDF exige un runtime que permita el perfil descrito en `infra/pdf-renderer/README.md`, el origen privado correcto del frontend y la imagen Chromium certificada. No se autorizan `--no-sandbox`, seccomp unconfined, `SYS_ADMIN` o contenedores privilegiados como alternativa. Un runtime administrado que no permita este perfil necesita un renderizador separado compatible antes de activar el PDF.

La CLI local esta vinculada a APEXOS PROD. La inspeccion de QA se hizo por identificadores explicitos de APEXOS QA, sin cambiar el vinculo, variables, secretos, infraestructura ni datos remotos. No se afirma certificacion funcional remota. El QA funcional del candidato permanece pendiente hasta desplegarlo con ese contrato de runtime.

La revision de seguridad se limita a cambios de Transporte, Administracion, contexto Prisma y runtime PDF. Las alertas anteriores de dependencias se conservan como observaciones y no se presentan como corregidas. Las vulnerabilidades de next/og e Image Optimization examinadas requieren superficies no configuradas en esta aplicacion. No se publica una garantia absoluta de seguridad.
