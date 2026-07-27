# Security Audit Report — Diagnóstico inicial

Fecha: 2026-07-26. Estado: fase 1 de diagnóstico; no constituye una certificación absoluta de seguridad.

## Alcance y evidencia

- 150 archivos de API, backend y Supabase inventariados.
- 213 declaraciones de rutas Fastify revisadas por patrón y módulos críticos inspeccionados manualmente.
- 101 sentencias versionadas para habilitar RLS, 231 políticas y 21 funciones `security definer`.
- Pruebas negativas sin token contra Administración y Servicios: `401`.
- CORS local: origen permitido reflejado con credenciales; origen malicioso no reflejado.
- `/metrics` desde la fuente actual: `200`, 7.421 bytes, sin token.
- Escaneo de secretos versionados: sin claves privadas ni tokens reales detectados; solo ejemplos/placeholders.
- `npm audit`: 2 críticas, 9 altas, 0 moderadas/bajas.
- No se ejecutaron ataques destructivos ni cambios productivos.

## Controles comprobados

- Login con mensaje genérico y límites específicos.
- JWT firmado, algoritmo restringido y expiración.
- Refresh consulta nuevamente usuario activo y rol.
- Middleware de empresa activa y RBAC en módulos críticos.
- Servicios filtra por tenant y aplica alcance del técnico en servicio.
- Rutas administrativas inspeccionadas exigen autenticación, empresa y permiso.
- Buckets principales privados, MIME/tamaño configurados y rutas prefijadas por empresa.
- Evidencias Base64 rechazadas en base de datos; URLs firmadas para lectura.
- CORS de producción opera con lista explícita.
- Errores 500 enviados sin stack al cliente.

## Hallazgos priorizados

| ID | Hallazgo | Severidad | Evidencia | Impacto | Corrección propuesta | Riesgo funcional | Riesgo performance |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SEC-001 | Dependencias con advisories | Alta | 2 críticas y 9 altas; incluye Next, `find-my-way`, Nodemailer y tooling | DoS, SSRF o exposición según ruta afectada | actualización selectiva con pruebas | Medio | Bajo/Medio |
| SEC-002 | Métricas sin autenticación | Corregida localmente | Commit `5e1ca20`: token dedicado, comparación segura, límite 30/min; no desplegado | reconocimiento y fuga operacional | configurar secreto independiente antes de desplegar | Bajo | Bajo |
| SEC-003 | Token local conserva rol/permisos hasta 8 h | Alta | `authenticate` valida firma/empresa pero no usuario/rol actual | usuario desactivado o degradado conserva acceso temporal | versión de sesión o caché de usuario activo con invalidación | Medio | Bajo si se cachea |
| SEC-004 | Archivo validado por MIME declarado, no firma real | Parcialmente corregida localmente | firma–MIME en navegador y Base64 API; no desplegado | contenido activo o archivo incompatible en bucket | queda pendiente confirmación/quarantena servidor para clientes directos de Storage | Medio | Bajo |

## Remediación local de fase 2

- `/metrics`: las solicitudes sin token o con token incorrecto reciben una respuesta genérica `401`; el token válido conserva Prometheus y `/health` continúa público.
- Archivos: JPEG, PNG, WebP, PDF, MP4 y WebM se identifican por firma cuando sus bytes atraviesan la aplicación. Se rechazan HTML/ejecutable disfrazado, MIME inconsistente, contenido vacío/truncado y exceso de tamaño.
- Cargas directas web: además de firma, las imágenes deben decodificar correctamente, no superar 4096 px por lado y reciben un nombre con UUID bajo la ruta de empresa/entidad.
- Riesgo residual: Supabase Storage todavía no ejecuta una confirmación binaria autoritativa después de una llamada directa que evite la aplicación. Resolverlo exige el flujo posterior de autorización/quarantena/confirmación coordinado con RLS.

## Fase 3

- Dependencias: 2 críticas eliminadas; Next core, Fastify, Nodemailer y transitivas alcanzables actualizadas. Permanecen tres advisories subyacentes de tooling/copias internas de Next, documentados sin forzar migración mayor.
- RLS producción: 99/99 recursos esperados con RLS y 165/165 policies vigentes por nombre; ninguna policy faltante o adicional.
- QA: la conexión SQL configurada no corresponde al proyecto remoto, por lo que el catálogo no pudo certificarse. Las pruebas REST cross-tenant de lectura devolvieron cero filas/objetos.
- Storage: confirmado en QA que una carga directa puede presentar HTML como PNG. RLS protege empresa/orden, pero no contenido. Se requiere cuarentena y validación autoritativa.
| SEC-005 | Estado RLS desplegado no verificado contra catálogo vivo | Alta | migraciones extensas; sin conexión SQL productiva segura en esta fase | drift puede abrir acceso cruzado | auditor SQL de `pg_class/pg_policies` en QA/release | Bajo | Bajo |
| SEC-006 | Token en `localStorage` aumenta impacto de XSS | Media | cliente obtiene token desde almacenamiento local | secuestro de sesión ante XSS | evaluar cookie HttpOnly por flag; primero CSP | Alto | Bajo |
| SEC-007 | CSP no comprobada en frontend | Media | respuesta local de Next sin CSP | menor defensa frente a XSS/clickjacking | CSP report-only progresiva | Medio | Bajo |
| SEC-008 | Rate limit global no es distribuido | Media | plugin local por proceso/tenant o IP | bypass horizontal entre réplicas | store Redis para rutas de abuso | Medio | Bajo/Medio |
| SEC-009 | Registro público permite creación de tenants | Media | `/auth/register`, 5/IP/hora | spam y consumo de recursos | invitación/captcha/flag según modelo comercial | Alto | Bajo |
| SEC-010 | Scripts operativos usan `$queryRawUnsafe` | Baja | solo scripts, algunos nombres dinámicos | inyección si reciben entrada no confiable | whitelist y consultas parametrizadas | Bajo | Nulo |

## Matriz mínima comprobada

| Rol/contexto | Acción no permitida | Frontend | Backend | RLS |
| --- | --- | --- | --- | --- |
| Sin sesión | listar usuarios | no confiable | bloqueada `401` | sin evaluación directa |
| Sin sesión | listar servicios | no confiable | bloqueada `401` | sin evaluación directa |
| Usuario sin módulo | acceder al módulo | guard visual | `MODULO_NO_HABILITADO` | policies por empresa/módulo versionadas |
| Técnico | orden no asignada | filtrado visual | alcance aplicado en service | función/policy versionada |
| Empresa A | registro de empresa B | no confiable | tenant derivado del token | policies versionadas |

## Riesgos y pruebas pendientes

- Verificación viva de todas las tablas/policies RLS en QA y producción.
- Dos usuarios reales de empresas distintas para pruebas IDOR de lectura/escritura/Storage.
- Roles reales: administrador, supervisor, técnico, consulta y desactivado.
- Recuperación de contraseña, sesiones concurrentes y revocación.
- Archivo con MIME falso y magic bytes inválidos.
- Configuración Railway, backups, restauración, MFA y accesos del equipo.
- Escaneo del historial Git y secretos de plataforma con una herramienta dedicada.

No se corrigieron todavía SEC-001 a SEC-009 porque la instrucción limita esta fase a presentar el diagnóstico antes de cambios críticos.
