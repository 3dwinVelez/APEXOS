# Security Changelog

## 2026-11-08 — Plan candado, Fase 2 en modo observar (C-06, C-07, A-02, A-03, A-06)

- La revocación de sesiones dejó de ser invisible: `apps/api/src/security/authorizationState.js` tiene modos `off`/`observe`/`enforce`, cuenta cada motivo (`SESSION_REVOKED`, `USER_VERSION_STALE`, `TENANT_VERSION_STALE`, `USER_REVOKED`, `TENANT_REVOKED`) y lo publica en `apex_authorization_mismatch_total{reason}` (`apps/api/src/fabric/metrics.js`). Se cuenta **siempre**, aunque el flag esté apagado; el log por request solo aparece en `observe`/`enforce`. Con `AUTHORIZATION_VERSION_ENFORCEMENT_ENABLED` apagado (default versionado) nada se expulsa: la fase mide para decidir.
- `/auth/refresh` rota la sesión: crea una nueva, revoca la anterior con `revoke_reason = "refresh_rotated"` y devuelve `refresh` nuevo. Reutilizar un refresh rotado se registra como `REFRESH_TOKEN_REUSED` y el de una sesión cerrada como `REFRESH_SESSION_REVOKED`; una sesión ya revocada **no** se rota, para no lavar el logout. `apps/web/lib/sessionSecurity.ts` guarda el refresh rotado.
- Login sin oráculo: `bcrypt.compare` corre siempre (hash señuelo si el correo no existe) y correo inexistente, clave incorrecta y usuario desactivado comparten un único `401 "No fue posible iniciar sesion con esas credenciales."`; desaparece el `403 "Usuario desactivado"`.
- `trustProxy` deja de ser `true`: `apps/api/src/security/trustProxy.js` solo confía en `X-Forwarded-For` cuando `TRUST_PROXY` declara saltos, IP/CIDR o palabras de proxy-addr; `true` se rechaza a propósito. Sin declaración, un XFF falsificado no cambia `request.ip` y el bloqueo de login no se esquiva rotando la cabecera. Variable documentada en `config/.env.example`.
- A-06 se cierra con pruebas: `isAdministrativeRole` ya comparaba exacto en API y web; `apps/api/test/rbac-administrative-role.test.js` y `apps/web/test/module-access-role.test.mjs` fijan que parecidos, subcadenas y `metadata` no abren Administración.
- Pruebas: 21/21 API (`authorization-observe`, `auth-session-hardening`, `trust-proxy`, `rbac-administrative-role`) y 3/3 web. Evidencia en `docs/qa/evidence/plan-candado-20261108/security-fase-2.txt`.
- Bloqueos declarados: certificación E2E de login/refresh no ejecutada (stack local caído); `TRUST_PROXY` sin declarar en Railway, de modo que detrás del proxy el límite global agrupa a los anónimos por la IP del proxy hasta que se declare con autorización propia. Residual abierto: A-01/A-13 (`supabaseAuth.js` reactiva usuario y empresa).

## 2026-11-08 — Plan candado, Fase 1 (C-01..C-04)

- El formulario público de Servicios dejó de usar el service role: `apps/web/app/api/public/service-requests/route.ts` solo configura `SUPABASE_URL`/`SUPABASE_ANON_KEY`, lee con `company_id=eq.<allowlist>` y, para editar catálogos, exige JWT del administrador y deja decidir a RLS (`42501`/401/403 → 403). Sin `PrismaClient` en toda la superficie pública.
- La empresa destino ya no la elige el cliente: sale de `APEXOS_PUBLIC_SERVICE_COMPANY_ID` (nueva variable en `config/.env.example`). Sin allowlist válida el API responde `503 EMPRESA_PUBLICA_NO_CONFIGURADA` sin consultar la base; en local el BFF delega en `/api/v1/public/services/*` y su RBAC.
- El aislamiento de empresa dejó de depender de una lista manual: `apps/api/src/core/tenantModels.js` deriva `TENANT_MODELS` de `Prisma.dmmf` (179 modelos) y declara `GLOBAL_MODELS` explícita (12); el módulo lanza al arrancar si un global tiene `tenant_id`. Los 29 modelos que quedaban fuera (Treasury*, PurchaseImport*, Subscription, ApexHeartReportSchedule, TransportPyg*, los 17 Commercial*) entran al filtro; los 5 sin columna salen.
- `PUT /admin/users/:id` y `/admin/users` aplican el candado de rol que ya protegía la edición de roles (nadie que no sea `APEX_ADMIN` asigna `APEX_ADMIN`, tampoco por `metadata.role_type`), y cambiar la clave de otro usuario exige la clave actual del administrador (`428` sin prueba, `403` si no coincide), también en `/admin/users/:id/access`.
- Gate corregido: el hook de autenticación de un `routes.js` se heredaba a su hermano público y clasificaba mal las rutas; ahora se evalúa por archivo. Baseline refrescada con `--update`: 29→0 y 5→0, `public_routes_declared: 3`, `--block` en verde.
- Evidencia en `docs/qa/evidence/plan-candado-20261108/gate-fase-1.txt` y `security-fase-1.txt` (22/22 API, 10/10 web, pruebas de rechazo 401/403/428/503).
- Bloqueos declarados: certificación E2E del formulario no ejecutada (stack local caído y allowlist sin configurar en `config/local.env`); la política RLS anón `service_references_public_catalog_select` no filtra por empresa y su corrección exige autorización de nube. Residuales: 7 rutas BFF administrativas aún usan service role.

## 2026-11-08 — Plan candado, Fase 0 (gates medibles)

- Tres gates dejaron de ser decorativos: `certify:auth-session` mide cinco rechazos y la revocación por logout; `security:inspect-rls --gate` bloquea por `missing_rls`, `rls_without_force` y `owner_bypass_tables`; el job de CI de auditoría ejecuta un gate con allowlist y vencimiento en lugar de `continue-on-error: true`.
- Nueva baseline medida en `docs/qa/evidence/plan-candado-20261108/baseline.json` (17 indicadores) con `scripts/security/candado-gates.js`; solo `--update` la reescribe y `--block` sale `1` ante regresión.
- Retirada la afirmación de RLS como control de multiempresa en `docs/SECURITY_THREAT_MODEL.md`: 41 `ENABLE`, 176 políticas, 0 `FORCE`, 0 `set_config('app.tenant_id')` y conexión con rol propietario; el middleware de tenant es el único filtro mientras eso no cambie.
- `.gitignore` cubre copias de conflicto, material criptográfico y volcados de base (`*.bak`, `*.pem`, `*.key`, `*.dump`, `*.sql.gz`, …).
- No se ejecutó ninguna fase 1-7: el plan sigue abierto en `docs/briefs/2026-11-08-plan-candado-blindaje-integral.md`.

## 2026-07-26 — Fase 3, RLS y Storage

- Añadido inspector reproducible de catálogo RLS en modo read-only.
- Verificado producción: 99 recursos RLS y 165 policies vigentes coinciden por nombre con el repositorio.
- Añadidas pruebas cross-tenant REST y smoke QA de Storage con limpieza.
- Confirmado y documentado el bypass de validación de bytes mediante carga directa.
- Diseñada arquitectura de autorización, cuarentena, validación y promoción; no implementada en esta fase.

## 2026-07-26 — Fase 3, dependencias

- Eliminados los dos hallazgos críticos del árbol de desarrollo.
- Actualizados de forma puntual Next, Fastify, Nodemailer, PostCSS y transitivas vulnerables.
- Eliminado `adm-zip` sin uso.
- Conservados y documentados los advisories internos de tooling/Next que no tienen una actualización compatible de bajo riesgo.

## 2026-07-26 — Fase 2

- Protección de `/metrics` mediante secreto dedicado y rate limiting.
- Validación de archivos por firma binaria, tamaño, integridad y dimensiones.
