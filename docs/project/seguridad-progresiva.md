# Seguridad progresiva APEX-OS

Esta capa define controles transversales de bajo impacto para proteger datos, accesos, documentos y auditoria sin frenar la operacion.

## Controles implementados

- Headers HTTP seguros: `nosniff`, `DENY` en frames, `Referrer-Policy`, `Permissions-Policy` y HSTS cuando aplica HTTPS.
- Limite central de body en API y limites especificos para evidencias y documentos.
- Rate limit especifico para login y bloqueo temporal por intentos fallidos.
- Politica minima de contrasena: 8 caracteres con letras y numeros.
- Mensajes de login genericos para evitar enumeracion de usuarios.
- Validacion de tenant activo al autenticar JWT.
- JWT local firmado con HS256 mediante `crypto`, sin dependencia directa de `@fastify/jwt`.
- RBAC reforzado con validacion de modulo habilitado por tenant.
- Auditoria con redaccion de campos sensibles: contrasenas, tokens, firmas y payloads base64.
- Rutas de almacenamiento documental normalizadas: `company/{tenant_id}/{module}/{entity}/{id}/{file}`.
- Validacion de MIME y tamano para documentos/evidencias.
- Cierre de sesion por inactividad configurable en frontend.

## Variables relevantes

- `API_BODY_LIMIT_BYTES`: limite maximo del JSON recibido por API.
- `LOGIN_MAX_ATTEMPTS`: intentos fallidos antes de bloqueo temporal.
- `LOGIN_WINDOW_MINUTES`: ventana para contar intentos fallidos.
- `LOGIN_LOCK_MINUTES`: duracion del bloqueo.
- `MAX_EVIDENCE_BYTES`: tamano maximo para evidencias operativas.
- `MAX_DOCUMENT_BYTES`: tamano maximo para documentos legales.
- `NEXT_PUBLIC_SESSION_TIMEOUT_MINUTES`: inactividad antes de cerrar sesion en frontend.
- `JWT_SECRET`: minimo 24 caracteres en desarrollo, recomendado 64 caracteres aleatorios en ambientes reales.

## Principios

- Nunca registrar contrasenas, tokens, firmas digitales o archivos base64 completos.
- No confiar en validaciones del frontend.
- Todo endpoint autenticado debe validar tenant, rol y modulo habilitado.
- Los documentos sensibles no deben depender de buckets publicos.
- Toda descarga sensible futura debe validar permisos antes de generar URL firmada.

## Pendiente recomendado

- Migrar evidencias base64 a storage privado con URL firmada de corta duracion.
- Persistir intentos fallidos y sesiones en Redis para despliegues multi-instancia.
- Agregar MFA opcional por rol o por empresa.
- Crear tabla formal de consentimientos y aceptaciones legales por usuario.
- Agregar rotacion/revocacion de refresh tokens.
- Incorporar analisis de dependencias en CI.
- Revisar reemplazo/actualizacion de `nodemailer`, `bcrypt`, `xmlbuilder2`, `@fastify/websocket`, `puppeteer-core` y `next` cuando publiquen versiones corregidas para los advisories vigentes.

## Referencias legales base

- Ley 1581 de 2012, proteccion de datos personales en Colombia: https://normograma.mintic.gov.co/mintic/compilacion/docs/ley_1581_2012.htm
- Preguntas frecuentes de proteccion de datos personales, Superintendencia de Industria y Comercio: https://www.sic.gov.co/preguntas-frecuentes-pdp

Esta documentacion no reemplaza revision juridica formal; traduce principios de confidencialidad, finalidad, acceso restringido, trazabilidad y control de tratamiento en controles tecnicos progresivos para APEX-OS.
