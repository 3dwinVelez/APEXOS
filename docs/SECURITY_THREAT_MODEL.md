# Security Threat Model

Fecha: 2026-07-26. Metodología: STRIDE, revisión estática y pruebas negativas no destructivas en local/QA.

## Activos y actores

| Activo | Datos o capacidad | Actores legítimos |
| --- | --- | --- |
| Identidad y sesión | access tokens, refresh tokens, roles y permisos | usuarios, administradores, Supabase Auth |
| Empresas | configuración, módulos, membresías y sedes | SuperAdmin y administradores de empresa |
| Servicios | órdenes, estados, ubicación, firma y evidencias | administradores, supervisores y técnicos asignados |
| Storage privado | fotografías, documentos, avatares y firmas | propietario, empresa y roles autorizados |
| Administración | usuarios, roles, permisos, logs y exportaciones | administradores autorizados |
| Datos operativos | vehículos, marcaciones, rutas, inventario y finanzas | roles operativos con alcance |
| Infraestructura | Railway, Supabase, PostgreSQL, Redis y MinIO | procesos internos y operadores |
| Observabilidad | métricas, logs técnicos y AuditLog | operadores autorizados |
| Secretos | DB, JWT, SMTP y service role | procesos servidor y CI/CD |

## Amenazas priorizadas

| Activo | Amenaza STRIDE | Actor | Impacto | Probabilidad | Riesgo | Control actual |
| --- | --- | --- | --- | --- | --- | --- |
| Sesión local | Elevación por permisos obsoletos dentro del JWT | usuario desactivado o degradado | Alto | Media | Alto | firma HS256, expiración de 8 h, empresa activa |
| Métricas | Exposición de topología y comportamiento interno | atacante sin sesión | Medio | Alta | Alto | headers y rate limit global; sin autenticación |
| Storage | Archivo malicioso con MIME declarado falso | usuario autenticado | Alto | Media | Alto | bucket privado, RLS, tamaño y MIME declarado |
| Dependencias | Explotación de advisories en Next/Fastify/tooling | atacante remoto o cadena de suministro | Alto | Media | Alto | lockfile y auditoría manual |
| Multiempresa | IDOR por ID conocido o companyId manipulado | usuario de otra empresa | Crítico | Media | Alto | tenant derivado del token, filtros tenant, RLS |
| Roles | Escalación administrativa | administrador de empresa | Crítico | Baja/Media | Alto | RBAC backend y alcance por tenant |
| Frontend | Robo de token mediante XSS | atacante que inyecte contenido | Alto | Media | Medio/Alto | React escapa texto; token en localStorage; sin CSP verificada |
| RLS | Drift entre migraciones y estado desplegado | error operativo | Crítico | Media | Alto | 101 sentencias RLS y 231 políticas versionadas |
| Disponibilidad | abuso de login, registro, archivos o rutas costosas | bot | Medio/Alto | Media | Medio | rate limit global y límites específicos de login/registro |
| Logs | exposición de PII o stack interno | operador no autorizado | Medio | Media | Medio | respuestas 500 genéricas; logs administrativos protegidos |
| Repudiación | cambios críticos sin evidencia suficiente | usuario privilegiado | Alto | Baja | Medio | AuditLog y logs correlacionados por request |

## Límites de confianza

1. Navegador ↔ Next.js.
2. Navegador ↔ Supabase Auth/Storage.
3. Next.js/Fastify ↔ Supabase mediante service role.
4. Fastify ↔ PostgreSQL/Prisma.
5. Empresa A ↔ empresa B.
6. Usuario operativo ↔ administración.
7. Código versionado ↔ CI/CD ↔ despliegue.

La autorización definitiva debe permanecer en backend/RLS. Ningún `company_id`, rol o permiso enviado por el navegador se considera fuente de verdad.
