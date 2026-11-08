# Security Threat Model

Fecha: 2026-07-26. Metodología: STRIDE, revisión estática y pruebas negativas no destructivas en local/QA.
Actualización 2026-11-08: cifras de aislamiento medidas (ver «Estado medido del aislamiento»).

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
| Métricas | Exposición de topología y comportamiento interno | atacante sin sesión | Medio | Baja tras desplegar | Bajo | token dedicado con comparación segura y límite específico; cambio aún local |
| Storage | Archivo malicioso con MIME declarado falso | usuario autenticado | Alto | Baja desde la aplicación | Medio residual | firma binaria, tamaño, dimensiones, bucket privado y RLS; falta verificación autoritativa post-carga |
| Dependencias | Explotación de advisories en Next/Fastify/tooling | atacante remoto o cadena de suministro | Alto | Media | Alto | lockfile y auditoría manual |
| Multiempresa | IDOR por ID conocido o companyId manipulado | usuario de otra empresa | Crítico | Media | Alto | tenant derivado del token y middleware de tenant; 29 modelos con `tenant_id` fuera del allowlist (ver abajo) |
| Roles | Escalación administrativa | administrador de empresa | Crítico | Baja/Media | Alto | RBAC backend y alcance por tenant |
| Frontend | Robo de token mediante XSS | atacante que inyecte contenido | Alto | Media | Medio/Alto | React escapa texto; token en localStorage; sin CSP verificada |
| RLS | Drift entre migraciones y estado desplegado | error operativo | Crítico | Media | Alto | RLS declarada pero **no efectiva** para el rol del API: 0 `FORCE ROW LEVEL SECURITY`, 0 `set_config('app.tenant_id')` en código |
| Disponibilidad | abuso de login, registro, archivos o rutas costosas | bot | Medio/Alto | Media | Medio | rate limit global y límites específicos de login/registro |
| Logs | exposición de PII o stack interno | operador no autorizado | Medio | Media | Medio | respuestas 500 genéricas; logs administrativos protegidos |
| Repudiación | cambios críticos sin evidencia suficiente | usuario privilegiado | Alto | Baja | Medio | AuditLog y logs correlacionados por request |

## Validación de fase 3

- No se detectó drift nominal de policies en producción.
- Las tablas RLS sin policy quedan deny-by-default **solo para roles no propietarios**; el propietario de la tabla las ignora sin `FORCE`.
- El principal riesgo residual de Storage no es cross-tenant: es contenido no validado en una ruta legítimamente autorizada.
- Una URL firmada respeta expiración, pero no convierte un objeto pendiente/no validado en evidencia confiable.

## Estado medido del aislamiento (2026-11-08)

Cifras tomadas de `scripts/security/candado-gates.js` sobre `desarrollo`; la referencia está en
`docs/qa/evidence/plan-candado-20261108/baseline.json` y el gate que bloquea regresiones es
`npm run security:candado:block`.

| Indicador | Medición | Lectura |
| --- | --- | --- |
| Sentencias `ENABLE ROW LEVEL SECURITY` en migraciones | 41 | La RLS está declarada |
| Políticas `CREATE POLICY` declaradas | 176 | Cubren parte del esquema, no todo |
| Sentencias `FORCE ROW LEVEL SECURITY` | 0 | El propietario de la tabla la ignora |
| `set_config('app.tenant_id', …)` en código del API | 0 | Ninguna consulta fija el tenant para RLS |
| Modelos con `tenant_id` fuera del allowlist `TENANT_MODELS` | 29 | Sin inyección automática del middleware |
| Modelos en el allowlist sin columna `tenant_id` | 5 | Inyección apunta a una columna inexistente |

**Conclusión operativa:** el API de APEXOS conecta con un rol que es propietario de las tablas y nunca
fija `app.tenant_id`, de modo que la RLS **no filtra** sus consultas. Mientras eso no cambie, el
middleware de tenant con `AsyncLocalStorage` es el **único** filtro de aislamiento y toda lectura debe
demostrarlo. La afirmación "RLS protege el aislamiento" queda retirada de este documento hasta que exista
un rol de aplicación sin privilegios sobre las tablas y las consultas fijen el tenant.

Detalle y plan por fases: `docs/briefs/2026-11-08-plan-candado-blindaje-integral.md`.


## Límites de confianza

1. Navegador ↔ Next.js.
2. Navegador ↔ Supabase Auth/Storage.
3. Next.js/Fastify ↔ Supabase mediante service role.
4. Fastify ↔ PostgreSQL/Prisma.
5. Empresa A ↔ empresa B.
6. Usuario operativo ↔ administración.
7. Código versionado ↔ CI/CD ↔ despliegue.

La autorización definitiva permanece en el backend: el tenant sale del token y se aplica por el
middleware de tenant. Ningún `company_id`, rol o permiso enviado por el navegador se considera fuente de
verdad, y la RLS no se cuenta como control mientras el API conecte como propietario.
