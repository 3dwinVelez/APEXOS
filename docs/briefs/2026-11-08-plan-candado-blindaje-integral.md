# Brief 2026-11-08 — Plan candado: blindaje integral de APEXOS medido, no declarado

- **ID**: `2026-11-08-plan-candado-blindaje-integral`
- **Fecha**: `2026-11-08`
- **Rama activa**: `desarrollo` (HEAD `d90aa4c9`, árbol limpio, `origin/desarrollo` en sync)
- **Prompt crudo**: "Vamos a realizar un plan candado aplicando toda la normativa de seguridad que sea adaptable para el proyecto y blindarlo frente a cuaquier ataque que se pueda presentar, necesito que montes un plan candado blindando toda la herramienta con los recursos que tenemos disponibles, revisa cada rama del proyecto, analisa cada parte de la infraestructura y aplica los protocolos necesarios sin romper nada de lo que tenemos actualmente construido..."

## 1. Objetivo

Cerrar las fugas y escaladas que **hoy son alcanzables** en APEXOS, y convertir los controles de seguridad que el repo proclama en gates que puedan fallar de verdad. Verificable en dos cifras: el inventario de hallazgos críticos de la sección 2 pasa de 8 abiertos a 0 abiertos, y `security:inspect-rls` + `certify:dependency-security` + la certificación de sesión pasan de "siempre verde" a "rojo si el control se rompe".

No es objetivo "cumplir una normativa" como fin: la normativa (OWASP Top 10, STRIDE) se usa como rejilla de cobertura para no dejar superficies sin medir.

## 2. Estado medido (línea base, no afirmación)

Método: lectura de código con archivo:línea + `npm audit` ejecutado + `git ls-tree` por rama + parser propio del allowlist contra `schema.prisma`. Sin ejecución de la API (no hay ambiente con secretos levantado en esta pasada); lo que no se pudo ejecutar se marca.

### 2.1 Las siete cifras que describen el sistema

| Medida | Valor | Fuente |
|---|---|---|
| Rutas HTTP/WS en el API | **757** | `apps/api/src/modules/**/routes*.js` + `apps/api/server.js:289,337,366` |
| Rutas con guarda RBAC | 742 (98.0%) | 15 sin guarda; 13 legítimas (login/refresh/health/métricas/público) |
| Llamadas de lectura Prisma | 1107 | `findMany/findFirst/findUnique/count/aggregate/groupBy` |
| …con `tenant_id` explícito | 278 (25%) | el 75% restante depende de la inyección ALS |
| Modelos con `tenant_id` en schema | 175 de 191 | parseo de `apps/api/prisma/schema.prisma` |
| …**fuera** de `TENANT_MODELS` | **29** | `apps/api/src/core/prisma.js:8-46` vs schema |
| Raw SQL que evade el middleware | **190** | `grep -rn '\$queryRaw\|$executeRaw' apps/api/src` |

### 2.2 Hallazgos críticos (alcanzables hoy)

| ID | Severidad | archivo:línea | Qué | Prueba |
|---|---|---|---|---|
| **C-01** | Crítica | `apps/web/app/api/public/service-requests/route.ts:484-515`, `:410-420`, `:232-233` | GET **anónimo** que enumera empresas (`/rest/v1/companies?select=id&status=eq.active&limit=10`) y catálogos **sin filtro de empresa** usando `SUPABASE_SERVICE_ROLE_KEY`. El service role no conoce RLS: es un bypass de aislamiento expuesto en una ruta pública. | `apikey: serviceRoleKey` en `supabaseRequest`; `activeReferencesWithoutCompany()` sin predicado de empresa |
| **C-02** | Crítica | `apps/web/app/api/public/service-requests/route.ts:637-698`, `:343`, `:259-261`, `:392` | PUT cuya autorización **no está ligada al tenant**: `hasAdministrativeSession` pregunta "¿admin en *alguna* empresa?" con `user_id=eq.X` sin `company_id`, y escribe en `companyIds[0]`; `body.company_id` entra primero. `isAdministrativeRole` es un substring `role.includes("admin")`. | lectura directa de las 4 líneas |
| **C-03** | Crítica | `apps/api/src/core/prisma.js:8-46,108` | `if (!tenantId \|\| !TENANT_MODELS.has(params.model)) return await next(params)` — el aislamiento es una **allowlist mantenida a mano**. 29 modelos con `tenant_id` están fuera: `TreasuryBank`, `TreasuryAdvance`, `TreasuryPayment`, `PurchaseImport`, `PurchaseImportCost`, los 17 `Commercial*` del Comercio y los 4 `TransportPyg*`. Y 5 modelos están en la allowlist **sin** `tenant_id` en schema (`Movement`, `SkuValuation`, `WarehouseTransfer`, `WarehouseTransferLine`, `ApexReportRun`) → el filtro se inyecta sobre una columna que no existe. | diff programático allowlist↔schema; `listBanks` en `modules/treasury/service.js:31-37` usa `runWithTenant(...)` creyendo que filtra |
| **C-04** | Crítica | `apps/api/src/modules/admin/service.js:1212,1220-1221` y `:1241-1243` | `PUT /admin/users/:id` con solo el permiso `users:edit` permite (a) fijar `role_id` al rol `APEX_ADMIN` del tenant —el candado de rol que sí existe para editar roles (`:929-931,949`) no aplica aquí— y (b) escribir `password` de **otro** usuario sin `current_password` ni re-autenticación. | lectura directa |
| **C-05** | Crítica | `config/production.env` + `config/qa.env` (usuario de cadena) y `grep FORCE` = 0 en 142 archivos SQL | RLS **no protege el tráfico de la API**: conecta como `postgres` (owner/bypass), no hay `FORCE ROW LEVEL SECURITY` en ninguna migración, `SET LOCAL ROLE` no aparece en `apps/api/src`, y `app.tenant_id` —que es lo que leen las 4 policies existentes— **nunca se fija** (grep = 0). El overlay de Supabase (`supabase/migrations/**`) da policies sobre `company_id uuid` para 34 tablas que ya no existen en el schema vivo (`tenant_id String`). Blindaje RLS real: **1 tabla**. | `20261013120000_transport_pyg/migration.sql:65-85`; `apps/api/src/security/supabaseAuth.js` sin `set_config` |
| **C-06** | Crítica | `apps/api/src/security/authorizationState.js:4,46` + `config/.env.example:37`, `config/qa.env.example:23` | `AUTHORIZATION_VERSION_ENFORCEMENT_ENABLED` default `false`. Con `false`, la línea 46 **no lanza** para `SESSION_REVOKED` ni `USER_VERSION_STALE`: solo loguea. Consecuencia: logout, expulsión de sesión y degradación de permisos **no surten efecto** hasta que expire el access token (8 h). | `enforce()` lee el env; `revokeSession` (`:58-64`) escribe `revoked_at` que la línea 46 ignora |
| **C-07** | Crítica | `apps/api/server.js:12` + `:93` | `trustProxy: true` (booleano = cualquier proxy) con `keyGenerator: (req) => req.user?.tenant_id \|\| req.ip`. `@fastify/rate-limit` corre en `onRequest`, antes del `preHandler` de auth, así que `req.user` **nunca** existe y la clave siempre es `req.ip`, que el cliente controla por `X-Forwarded-For`. El bloqueo de login 5/15 min arma `email|ip` (`security/authGuard.js:12`) → rotar XFF crea una clave nueva por request. | `node_modules/@fastify/rate-limit/index.js` defaultHook `onRequest` |
| **C-08** | Crítica | `infra/docker-compose.yml:203-207` | Redis `--appendonly yes` **sin `requirepass`**, **sin `protected-mode`**, **sin bind**, publicado `"6379:6379"` → `0.0.0.0`. Contiene sesiones y colas BullMQ. RCE clásico por `CONFIG SET dir` + `module load` desde cualquier red alcanzable. Único `requirepass` del repo: 0 coincidencias. | lectura del compose |

### 2.3 Hallazgos altos (abiertos, con evidencia)

- **A-01** `apps/api/src/security/supabaseAuth.js:365`: `if (!existing.active) patch.active = true` **reactiva** al usuario desactivado en cada cache-miss; anula `admin/service.js:1349`. Desactivar no cierra el acceso por Supabase.
- **A-02** `apps/api/src/modules/auth/service.js:181-183`: `/auth/refresh` emite `token` y **nunca rota ni invalida** el refresh (30 días, `:145`). El cliente ya espera la rotación (`apps/web/lib/api.ts:304`). Refresh robado vive 30 días sin detección de reuso.
- **A-03** `apps/api/src/modules/auth/service.js:127`:短路 de bcrypt (`!user || await compare`) → usuario inexistente no paga el costo; más 403 `"Usuario desactivado"` (`:133-136`) vs 401 (`:129`). Oráculo de enumeración de cuentas.
- **A-04** `next.config.ts:22-23,51`: `script-src 'self' 'unsafe-inline'` **sin nonce ni hash**, `connect-src ... https: wss:` comodín de esquema. Un XSS puede inyectar y exfiltrar a cualquier origen. `apps/web/test/offline-csp.test.mjs` no aserta sobre `connect-src`.
- **A-05** `apps/web/app/dashboard/contabilidad/facturas-recibidas/[id]/page.tsx:617-620,649-652,734` (y `:493,523`, `transporte/page.tsx:960`): blob de un adjunto **de tercero** → `URL.createObjectURL` sin validar `blob.type` → `<iframe>` permitido por `frame-src 'self' blob:`. El blob hereda el origen del frontend: XSS same-origin que lee el token de `localStorage`. Se casa con A-04 y con C-09.
- **A-06** `apps/api/src/middleware/rbac.js:268,307-309` + `:75-102`: `requirePermission` es **bypass administrativo** y `isAdministrativeRole` casa contra 5 campos normalizados (`role.name`, `metadata.role_name`, `role_type`, `profile_kind`, `scope`). 550 usos de `requirePermission` contra **16** de `requireExplicitPermission`: un rol cuyo metadata contenga "admin"/"owner" salta la matriz en el 97.8% de las rutas.
- **A-07** `infra/nginx/nginx.conf:15-19,28-32,13`: nginx **nunca fija `X-Forwarded-For`** (solo `X-Real-IP`), así que la XFF del cliente se reenvía tal cual → C-07 no se cierra poniendo nginx delante. Sin TLS (solo `listen 80`), sin `server_tokens off`, sin HSTS: JWT y contraseñas viajan en claro.
- **A-08** `infra/docker-compose.yml:126,178,227-228,288`: credenciales con default laxo (`${DB_PASS:-apex_dev_password}`, `${MINIO_SECRET_KEY:-change_me_minio_secret}`, `${GRAFANA_PASS:-change_me_grafana}`). Si falta la variable, el stack **arranca igual** con la contraseña conocida. No hay bloque `secrets:`. Consola MinIO 9001 pública con root débil. 10 servicios publicados en `0.0.0.0` (api, web, brain, postgres, pgbouncer, redis, minio×2, grafana, prometheus).
- **A-09** `.github/workflows/ci.yml:118-120`: el job `security-audit` usa `npm audit --audit-level=high` con **`continue-on-error: true`** → 3 críticas y 17 altas pasan CI sin bloquear.
- **A-10** `npm audit` ejecutado hoy: **34** (3 críticas / 17 altas / 13 medias / 1 baja). Críticas: `next 16.3.5` (RCE en `next/og` ImageResponse, rango 16.0.0–16.4.0), `shell-quote 1.9.0` (command injection), `concurrently`. Altas relevantes para producción: `sharp 0.35.4`, `nodemailer 10.2.1`, `fast-uri 3.1.6`, `node-forge 1.4.0`, `zod 3.25.76`, `@fastify/busboy`, `minio`. El override de `brace-expansion 1.1.18` sigue **dentro** del rango vulnerable (≤1.1.20).
- **A-11** `docs/qa/evidence/dependency-security-20260824/certification.json` dice `status: passed` con `next 16.3.2`/`sharp 0.35.3`; re-ejecutarlo hoy **fallaría**. El piso del gate (`scripts/certifications/dependency-security.js:67-69`) es más débil que las versiones corregidas reales.
- **A-12** `scripts/security/inspect-rls-deployment.js:250-266`: calcula `missingRls`, `missingPolicies`, `logicDifferences`, `tablesWithRlsWithoutPolicies` y **solo los loguea**; `process.exitCode = 1` únicamente en el `catch` de errores de config/conexión (`:215-236`). Además `repositoryState` recorre solo `supabase/` (`:75`) — las policies Prisma son invisibles — y nunca mira `relforcerowsecurity` ni el `owner`. **Es un inspector, no un gate.**
- **A-13** `apps/api/src/security/supabaseAuth.js:317-322`: `ensureTenantMirror` escribe `active: true` en el update del tenant → renombrar la empresa en Supabase levanta una suspensión.
- **A-14** Deriva de ramas medida con `git ls-tree`: migraciones Prisma `desarrollo` 72 / `develop` 62 / `main` 41 → **10 ausentes en develop y 31 en main**, incluida `20261013120000_transport_pyg` (la única con RLS) y las de vigencia laboral 2026. Overlay Supabase 70/69/51. `main` además **elimina** `docker-compose.pdf-sandbox.yml` y `seccomp.json`. Consecuencia: el ambiente liberado de producción no tiene las migraciones de nómina ni el perfil seccomp.
- **A-15** `apps/api/prisma/schema.prisma:3450-3462`: `EInvoiceConfig` guarda `sat_key_b64` (clave privada), `sat_cert_pass`, `cert_pkcs12_b64`, `cert_password`, `sunat_pass` como `String` en claro. `apps/api/src/security/policy.js:4-16` solo enmascara al responder; no cifra en reposo. Contradice `docs/DATABASE_SECURITY.md:5`.

### 2.4 Los gates que hoy no pueden fallar

| Script | ¿Bloquea? | Evidencia |
|---|---|---|
| `certify:dependency-security` | Sí | `:66,22` lanza si `total!==0`; `:91-93` exit 1 |
| `git-governance-guard.js` | Sí | `fail()`→`process.exit(1)` `:18-21,190-213` |
| `.github/workflows/ci.yml` security-audit | **No** → **Sí desde Fase 0** | `continue-on-error: true` `:118-120` sustituido por `node scripts/security/ci-audit-gate.js` (allowlist con vencimiento) |
| `security:inspect-rls` | **No** → **Sí con `--gate`** | hallazgos solo se logueaban `:259-260`; el modo gate lanza con `rls_without_force` / `owner_bypass_tables` > 0 |
| `certify:auth-session` | **No** → **mide rechazos** | `:42` descartaba la respuesta de `/services/orders` y `:50` fijaba `session:"passed"`. Ahora prueba 5 rechazos y mide revocación con `CERT_REQUIRE_REVOCATION` |
| `apps/api/test/security-authorization-revocation.test.js` | **No cierra C-06** | aserta sobre `authorizationDecision()` (función pura de decisión) `:11-22`, nunca sobre `validateAuthorization()` que es la que decide **lanzar o no** según el flag. Además solo lo corre `scripts/certifications/controlled-release-local.js:70`, no `npm test`. |

### 2.5 Lo que sí está bien (para no romperlo)

JWT HS256 único con rechazo de `alg` distinto (`security/jwt.js:39`) y `timingSafeEqual` (`:41`), sin default de secreto (`:19,34`). Sesiones en BD con revocación cableada y guardas duras `USER_REVOKED`/`TENANT_REVOKED` que sí se tiran con el flag apagado (`authorizationState.js:46`). Arranque `requireEnv` fail-closed (`server.js:60`). Caché Supabase 30 s con clave SHA-256, sin bcrypt por request (`supabaseAuth.js:6,51-53`). CORS con allowlist en producción (`server.js:61-77`). Cabeceras del API correctas (`security/headers.js`: `nosniff`, `X-Frame-Options DENY`, `Referrer-Policy`, `Permissions-Policy`, `CORP`, HSTS condicionado a https). Errores 500 sin traza (`core/api-error.js:41-52`). `/metrics` fail-closed (`metricsAuth.js:10,17-20`). En el frontend **no hay ni un** `dangerouslySetInnerHTML`, `innerHTML`, `eval` ni `new Function`; el XML de factura se trata como texto, no como documento (sin XXE); los 19 `NEXT_PUBLIC_*` son URLs y timeouts, ningún service role llega al bundle; `.dockerignore` excluye `.env`. **No hay secretos reales versionados** (barrido de patrones fuertes = 0 hits; `config/*.env` están cubiertos por `.gitignore:22-24`).

## 3. Principio rector: el candado se tensa por fase, con puerta de no-ruptura

El pedido dice "sin romper nada de lo que tenemos actualmente construido". En seguridad eso no es un adjetivo: es la restricción que ordena el plan, porque **los cinco controles de mayor valor son los cinco que más fácil rompen**. Cada fase fija su propia puerta:

| Control | Qué rompe si se aplica a ciegas | Puerta de no-ruptura exigida |
|---|---|---|
| `AUTHORIZATION_VERSION_ENFORCEMENT_ENABLED=true` (C-06) | Expulsa sesiones si `uv`/`tv` no coinciden por un dato mal poblado | modo `observe` primero, medir la tasa de `authorization_version_mismatch` real, y activar solo con la tasa explicada |
| Allowlist → denylist de tenant (C-03) | 29 módulos pasan de ver todo a ver solo lo suyo: si un flujo legítimo dependía del alcance amplio, se corta | test de dos tenants por módulo, con el caso "antes veía N filas, ahora ve solo las mías" medido |
| Quitar service role del frontend (C-01/C-02) | El formulario público de solicitudes deja de cargar catálogo | endpoint equivalente en el API + certificación del flujo público completo |
| Redis con `requirepass` + bind loopback (C-08, A-08) | El API y BullMQ no arrancan sin la contraseña en todos los consumidores | cambio atómico de compose + env + `redisConfig.js`, medido en el puesto local |
| CSP con nonce y `connect-src` cerrado (A-04) | Next inlina scripts de arranque: pantalla en blanco | nonce verificado en navegador real, no solo en el test unitario |
| Arreglar dependencias (A-10) | `next 16.3.5 → 16.4.x` toca el build; hay antecedente de bloqueo por rutas tipadas | `next build` + `next start` + suite web completa contra el candidato |
| `trustProxy` con lista de proxies (C-07, A-07) | Mal puesto, todo el rate limit se aplica a una sola IP compartida y se auto-DoS el ambiente | prueba con y sin XFF spoofeada, y con la IP real del proxy de Railway |

Regla de orden: primero lo que el ambiente liberado hace mal (regla 25 del orquestador), no lo que cuesta fusionar.

## 4. Las siete fases

### Fase 0 — Que la medición pueda fallar (antes de tocar conducta)

Sin esto, las fases 1-6 son irrepetibles: hoy ningún gate se pone rojo.

1. Nuevo `scripts/security/candado-gates.js`: mide y **bloquea** — modelos con `tenant_id` fuera de la allowlist, modelos en allowlist sin columna, rutas sin guarda, raw SQL sin predicado de empresa, advisories sobre umbral, cabeceras ausentes, `FORCE`/`owner` de RLS. Publica `docs/qa/evidence/plan-candado-20261108/baseline.json` con el numerador de hoy.
2. `certify:auth-session` deja de ser decorativo: se le añaden los rechazos que no tiene (token revocado → 401, `alg:none` → 401, firma alterada → 401, expirado → 401, cross-tenant → 403) y `session:"passed"` pasa de literal a medición.
3. `security:inspect-rls` consulta `relforcerowsecurity` y el `role` dueño, recorre también las migraciones Prisma, y lanza con `missing_rls > 0`.
4. `.gitignore`: cubrir artefactos locales con riesgo real (copias de conflicto, material criptográfico y volcados de base). **Corrección respecto del plan inicial**: no se ignoran `data/`, `docs_extracted/`, `memory/`, `reports/` ni `tmp/` en bloque porque **24 archivos legítimos ya están versionados** ahí (`data/service-references-initial.json`, los `memory/*/MEMORY.md`, los reportes de `reports/`, el benchmark de `tmp/codex-runtime/`); ignorar el directorio habría ocultado trabajo nuevo sin borrar el tracked, que es la peor combinación.

Ruptura esperada: ninguna en producto (son scripts y CI). **No requiere autorización de infra.**

### Fase 1 — Fugas cross-tenant activas (C-01, C-02, C-03, C-04)

La allowlist se reemplaza por lista de exclusión derivada de `schema.prisma` al arrancar, con `GLOBAL_MODELS` explícita y corta; los 5 modelos sin columna salen del filtro y se corrigen por separado. El `PUT /admin/users/:id` recibe el candado de rol que ya existe para editar roles, y exige re-autenticación para cambiar clave ajena. El service role del frontend se retira y su lectura se delega al API con guardas.

### Fase 2 — Sesión, credenciales y accesos (C-06, C-07, A-01, A-02, A-03, A-06, A-13)

Revocación surte efecto. Se quita la reactivación automática de usuario y tenant. El refresh rota con detección de reuso. `bcrypt.compare` corre siempre (usuario fantasma) y las respuestas de login se uniforman. `isAdministrativeRole` deja de ser un substring sobre 5 campos. `trustProxy` con la lista del proxy real del ambiente.

### Fase 3 — Perímetro de red e infraestructura (C-08, A-07, A-08, INF-02, INF-05)

Redis con `requirepass` y bind loopback; puertos publicados a `127.0.0.1`; defaults de credenciales eliminados (el servicio **no arranca** sin secreto, como ya hace `OFFLINE_CERT_DB_PASSWORD:?`); nginx con TLS+HSTS+`X-Forwarded-For` fijado y `server_tokens off`; `/health` deja de publicar `schema.missing`; Prometheus y consola MinIO tras auth. **`pgbouncer.ini` con `auth_type = trust` y `listen_addr = 0.0.0.0` está muerto —no lo monta el compose— pero se corrige igual.**

### Fase 4 — Cliente endurecido (A-04, A-05, C-09, F-06..F-13)

CSP con nonce, `connect-src` a orígenes concretos, `object-src 'none'`, `frame-src` sin `blob:`, HSTS/COOP/COEP/CORP, `report-to`. El iframe de adjuntos cambia a visor con tipo validado. Logout limpia las claves que hoy deja (`profile_kind`, `apexos_company_role`, snapshots, IndexedDB condicional). El proxy `x-forwarded-host` deja de poder rebotar el token propio a la API de otro ambiente.

### Fase 5 — Cadena de suministro (A-09, A-10, A-11)

`continue-on-error` fuera del job de seguridad; `next`, `shell-quote`, `sharp`, `nodemailer`, `fast-uri`, `node-forge`, `zod`, `minio`, `brace-expansion` a versiones corregidas; certificación de dependencias re-ejecitada; acciones de CI pineadas a SHA y `permissions:` explícito en los workflows.

### Fase 6 — Base de datos de verdad (C-05, A-12, A-15)

Rol de conexión con privilegios mínimos (no owner) para el tráfico de la API, o —si el ambiente nube no lo permite— retirar del threat model la afirmación de RLS y dejar por escrito que el único filtro es el middleware. Cifrado en reposo de `EInvoiceConfig`. Los 190 raw SQL reciben predicado de empresa explícito.

### Fase 7 — Deriva de ramas (A-14)

`main` sin 31 migraciones incluidas la única con RLS y la vigencia laboral 2026; sin overlay de nómina/comercio; sin perfil seccomp. **No es trabajo de código: es promoción y exige autorización independiente por rama.**

## 5. Fuera de alcance

- No se toca `apps/control-tower/**` más allá de lectura: reposa solo en `desarrollo` y no se promociona.
- No se modifican Railway, Supabase, firewall ni cloud security groups. No hay migraciones remotas.
- No se rotan secretos en esta pasada (no se halló ningún secreto real versionado; la rotación que fase 3 sugiere para credenciales de compose es decisión del dueño).
- No se renumera la matriz RBAC ni se cambian permisos sembrados: los datos de `Role`/`Permission` no se pudieron leer sin base viva, y tocar la matriz sin medirla es exactamente el tipo de cambio que rompe producción.
- No se promueve a `develop` ni `main`. Nada de este brief llega a un ambiente liberado sin su puerta.
- No se debilita ningún control existente para que pase una prueba.

## 6. Criterios de aceptación

1. `node scripts/security/candado-gates.js` → sale **1** con el baseline de hoy y sale **0** al cerrar cada fase; el numerador no sube entre fases.
2. `npm run certify:auth-session` con un token revocado → **401**. Hoy devuelve 2xx (la línea 42 descarta la respuesta).
3. Llamada a `/api/v1/treasury/banks` como tenant A mientras B tiene bancos → devuelve **solo** los de A. Prueba nueva de dos tenants.
4. `PUT /admin/users/<otro-id>` con `role_id` de `APEX_ADMIN` y permiso `users:edit` → **403**. Cambio de clave ajena sin re-auth → **428/403**.
5. `GET /api/public/service-requests` sin credenciales → **ninguna** empresa ajena a la allowlist pública aparece en la respuesta, y `SUPABASE_SERVICE_ROLE_KEY` no se lee en el proceso web.
6. `curl -H "X-Forwarded-For: 1.2.3.4" .../auth/login` 6 veces con el mismo email → **429 en el intento 5** hoy; hoy es eludible.
7. Redis: `redis-cli -h <host> ping` sin credencial → error de autenticación. Ningún puerto del compose escucha en `0.0.0.0` salvo el proxy.
8. CSP en navegador real: `script-src` con nonce y **sin** `'unsafe-inline'`; `connect-src` rechaza un origen no listado (probado con fetch real, no con test unitario); `report-to` llega al endpoint.
9. `npm audit --omit=dev` → 0 críticas y 0 altas, o allowlist versionada con fecha y motivo por cada excepción.
10. `next build && next start` + suite web verde contra el candidato de la fase 5.
11. Regresión: las suites que ya existen (`test:agents`, certificación local del módulo tocado, suite API y web) siguen verdes en cada fase.

## 7. Evidencia y certificación exigida

- `docs/qa/evidence/plan-candado-20261108/` con `baseline.json`, `gate-fase-<n>.json`, `security-<superficie>.txt` por fase, sin tokens ni PII.
- Prueba de **rechazo** (401/403/429/428) documentada por cada control afirmado; un control sin su prueba de rechazo no se cuenta como cerrado.
- `certify:dependency-security` re-ejecutado; `security:inspect-rls` ya en modo gate.
- Certificación de navegador para la fase 4 (la CSP solo se demuestra en Chromium real).

## 8. Capacidades protegidas

Tesorería (`treasury`), Compras (`purchases`), Comercio (los 17 modelos `Commercial*`), `transport-pyg`, `apex-control`, contabilidad/facturas recibidas, administración de usuarios/roles, autenticación y sesión, subida y entrega de evidencias, aislamiento multi-tenant, formulario público de solicitudes. Cada fase certifica sus capacidades protegidas, no solo la función que toca.

## 9. Riesgos y rollback

- **Riesgo alto**: la fase 1 (denylist de tenant) cambia el alcance de lectura de 29 modelos. Mitigación: denylist derivada del schema + `GLOBAL_MODELS` corta + test de dos tenants por módulo. Rollback: revert del commit, no reset.
- **Riesgo alto**: la fase 2 (enforcement de revocación) puede expulsar sesiones. Mitigación: `observe` → medir → activar. Rollback: apagar el flag (es un env, no un commit).
- **Riesgo medio**: la fase 5 (dependencias) con historial conocido de bloqueo por build. Mitigación: `next build`+`start`+suite web como puerta previa, bump de un solo paquete a la vez.
- **Riesgo medio**: la fase 3 (puertos/Redis) rompe el puesto de desarrollo local. Mitigación: change atómico compose+env+código, probado en el puesto antes de cerrar; la topología local ya registrada (`infra-postgres-1:55432`) se respeta.
- **Riesgo bajo**: fase 0. Ninguna conducta de producto se toca.

## 10. Supuestos, decisiones e incógnitas

### 10.1 Decisiones tomadas por el dueño (2026-11-08)

| # | Decisión | Consecuencia en el plan |
|---|---|---|
| D-1 | Ejecutar **solo Fase 0** en esta ronda; fases 1-7 quedan escritas y no se tocan | El alcance real de esta intervención es scripts, CI, `.gitignore`, threat model, brief y agentes. Cero cambio de conducta de producto. |
| D-2 | Aislamiento: **el middleware es el único filtro, dicho con honestidad** | La Fase 6 no crea un rol de conexión nuevo. Su trabajo es tensar el middleware (Fase 1) y **retirar del threat model la afirmación de RLS**, que ya está corregida en `docs/SECURITY_THREAT_MODEL.md`. |
| D-3 | Autorizado **leer solo flags** de Railway/Supabase (valores no se registran ni se citan) | Sirve para graduar C-05/C-06. No se abre sesión de escritura ni se ejecuta migración remota. |

### 10.2 Supuestos abiertos

- **Supuesto**: `AUTHORIZATION_VERSION_ENFORCEMENT_ENABLED` está apagado también en Railway. En el repo no se fija (`grep` vacío en `infra/` y `railway.json`) y el default versionado es `false`; si Railway lo fijó en `true`, C-06 baja a media. La lectura de flags (D-3) queda como tarea de la Fase 2.
- **Supuesto**: `postgres.<ref>` es rol con bypass en Supabase. Se apoya en el usuario de la cadena + ausencia de `FORCE`, no en `pg_roles` (no se consultó la base real).
- **Sin reproducir todavía**: C-07 (spoofing XFF), A-03 (timing de bcrypt) y la fuga de `listBanks` entre tenants son estáticos; cada fase exige su prueba E2E con dos tenants antes de declararse cerrada.


## 11. Autorizaciones requeridas

Ninguna fase 1-7 toca conducta de auth, permisos, RLS, configuración global, infraestructura o dependencias sin autorización expresa (regla 11 de `apexos-seguridad`). Estado:

- [x] **Fase 0** — gates, CI, `.gitignore`, threat model. Autorizada y ejecutada el 2026-11-08 (detalle en la sección 13).
- [x] **Fase 1** — cerrar C-01..C-04 en código. Autorizada y ejecutada el 2026-11-08 (detalle en la sección 14). Decisión tomada: `GLOBAL_MODELS` corta y explícita en `apps/api/src/core/tenantModels.js`, con el resto derivado del schema; el service role del frontend se retira de la ruta pública y su lectura se delega al API. La certificación E2E del formulario público se ejecutó el 2026-11-08 con el stack local y la allowlist de empresa configurada (detalle en la sección 14 y en la evidencia).
- [x] **Fase 2 — C-06, C-07, A-02, A-03, A-06** — autorizada en **modo observar** el 2026-11-08 (detalle en la sección 15): la revocación se mide y no expulsa, el refresh rota con detección de reuso, `bcrypt.compare` corre siempre, el login responde uniforme, `isAdministrativeRole` queda exacto y `trustProxy` pasa a allowlist. La certificación E2E de login, refresh y logout se ejecutó el 2026-11-08 con el stack local levantado. El encendido de `AUTHORIZATION_VERSION_ENFORCEMENT_ENABLED` queda para una corrida medida con autorización aparte.
- [ ] **Fase 2 — residual A-01, A-13** — la reactivación automática de usuario y empresa en `apps/api/src/security/supabaseAuth.js` sigue abierta: desactivar en el API no cierra el acceso por Supabase y renombrar en Supabase levanta una suspensión. No estaba incluida en la opción autorizada y toca autenticación global por otro camino; requiere autorización expresa.
- [ ] **Fase 3** — `infra/**` (Redis, puertos, nginx, credenciales de compose). Requiere autorización de infraestructura; no se toca Railway/Supabase desde aquí.
- [ ] **Fase 4** — CSP y cabeceras del web con nonce (cambia el bundle entregado).
- [ ] **Fase 5** — actualización de dependencias (next, sharp, nodemailer, zod, minio, shell-quote).
- [ ] **Fase 6** — con D-2 aplicada, se reduce a tensar el middleware y cifrar `EInvoiceConfig`; el rol de conexión mínimo sale del plan.
- [ ] **Fase 7** — promoción a `develop` y `main` de las 31 migraciones ausentes. Autorización independiente por rama.
- [ ] Leer el env real de Railway/Supabase para graduar C-06 (solo lectura de flags, D-3; los valores no se registran).

## 12. Documentación, agentes y publicación

- **Preflight final**: `OK` (sin advertencias). La advertencia inicial sobre rutas sin dueño se corrigió añadiendo en `scripts/agents/lib/agent-routing.js` la regla `security` (`scripts/security/**`, `docs/SECURITY_*`, `.github/workflows/**`, `.gitignore` → `apexos-seguridad` dueño + `apexos-qa`), con prueba en `scripts/test/agents-preflight.test.js`.
- **Ruteo devuelto**: `apexos-seguridad` (api/src, prisma, infra) · `apexos-backend` (api/src, prisma) · `apexos-db-nube` (prisma) · `apexos-frontend` (web) · `apexos-performance` (infra) · `apexos-qa` (api, web, prisma) · `equipo-apexos` + `apexos-brief` + `apexos-git-guardian` (agents). Advertencia: `docs/SECURITY_THREAT_MODEL.md` no tiene dueño asignado en `scripts/agents/lib/agent-routing.js` → hace falta entrada de ruteo para `docs/SECURITY_*`.
- **Agentes consultados**: `equipo-apexos` 2.13.0, `apexos-seguridad` 2.11.0 (lecturas obligatorias 1-6 cumplidas), `apexos-brief` 2.18.0, `apexos-git-guardian` 2.9.0, `apexos-backend` 2.8.0, `apexos-db-nube` 2.0.0, `apexos-frontend` 2.9.0, `apexos-performance` 2.9.0, `apexos-qa` 2.25.0.
- **Documentación a actualizar**: este brief, `docs/SECURITY_THREAT_MODEL.md` (riesgos y controls reales, cifras 101/231 → medidas), `docs/RLS_SECURITY_MATRIX.md`, `docs/DEPENDENCY_SECURITY_REPORT.md`, `docs/DEPENDENCY_REMEDIATION_PLAN.md`, `docs/SECURITY_CHANGELOG.md`, `docs/FILE_SECURITY_STANDARD.md`, `docs/project/divergencia-*`.
- **Agentes a actualizar** (ejecutado en la Fase 0): `apexos-seguridad` 2.11.0 → 2.12.0 (reglas 25 y 26) · `apexos-qa` 2.25.0 → 2.26.0 (regla 39) · `apexos-brief` 2.18.0 → 2.19.0 (regla 31) · `equipo-apexos` 2.13.0 → 2.14.0 (regla 27). Las fases 1-7, cuando se autoricen, bumpean `apexos-backend`, `apexos-frontend`, `apexos-db-nube` y `apexos-performance` en su propio cierre.
- **Registro**: `agents/registry.json` actualizado por `agents:sync` (`version`, `updated_at`, `sha256` de los cuatro agentes) y entrada fechada en `agents/CHANGELOG.md`. Los `SKILL.md` se editaron en `.qoder/skills/**`, nunca en el espejo `agents/**` (regla 26).
- **Secuencia de cierre**: `agents:sync` ✔ → `agents:check` ✔ → `test:agents` 46/46 ✔ → `agents:preflight` ✔ `OK` → `agents:coverage` ✔ → pruebas de la sección 6 → commit → `git push origin desarrollo`.
- [x] Preflight sin `INTEGRAR_REMOTO` ni `CONFLICTO`
- [x] Cobertura de contexto en verde
- [x] Sin secretos ni artefactos locales en el diff
- [x] Documentación y agentes actualizados en el mismo commit

## 13. Ejecución de la Fase 0 (2026-11-08)

| Artefacto | Estado | Qué mide o garantiza |
|---|---|---|
| `scripts/security/candado-gates.js` | Nuevo | 17 indicadores contra `baseline.json`. `--block` sale 1 ante regresión; `--update` es el único modo que reescribe la baseline; un modo pasivo **nunca** la sobrescribe. Sin dependencia de `grep` (recorrido en Node puro), corre igual en Windows y en Linux. |
| `docs/qa/evidence/plan-candado-20261108/baseline.json` | Nuevo | Numerador de hoy: 29 / 5 / 190 / 4 / 20 / 1 / 1 / 1 / 0 / 41 / 176 / 0 / 11 / 1 / 9 / 1 / 2. Informacional: 198 rutas autenticadas sin guarda de permiso explícita sobre 753. |
| `scripts/security/ci-audit-gate.js` + `audit-allowlist.json` | Nuevos | Bloquea critical/high fuera de allowlist. Las 20 entradas actuales llevan motivo y `expires: 2026-12-15`; vencida, el gate vuelve a bloquear. |
| `.github/workflows/ci.yml` | Modificado | `permissions: contents: read` a nivel de workflow y el paso `continue-on-error: true` sustituido por el gate bloqueante. |
| `scripts/certifications/auth-session-readiness.js` | Modificado | `session` deja de ser literal; 5 rechazos medidos (`sin_token`, `token_basura`, `alg_none`, `clave_incorrecta`, `firma_alterada`) y revocación por logout con `CERT_REQUIRE_REVOCATION`. |
| `scripts/security/inspect-rls-deployment.js` | Modificado | Recorre también `apps/api/prisma/migrations`; compara `rls_forced`, `owner` y `FORCE`; `--gate` falla con `missing_rls`, `rls_without_force` u `owner_bypass_tables`. |
| `.gitignore` | Modificado | `*.bak`, `*.orig`, `*.rej`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.dump`, `*.sql.gz`, `*.backup` (0 archivos versionados afectados). |
| `docs/SECURITY_THREAT_MODEL.md` | Modificado | Retira la afirmación de RLS, publica la tabla medida (41 ENABLE / 176 políticas / 0 FORCE / 0 GUC) y declara el middleware como único filtro. |

Comandos de cierre de esta fase:

```bash
npm run security:candado        # reporte, no reescribe la baseline
npm run security:candado:block  # bloqueante, mismo criterio
node scripts/security/ci-audit-gate.js
npm run security:inspect-rls:gate
```

`security:inspect-rls:gate` **requiere base viva**; en el puesto sin base sale con error de conexión, y eso es un `BLOQUEO` declarado, no un verde.

## 14. Ejecución de la Fase 1 (2026-11-08)

Decisión de alcance aplicada (D-2): el middleware de tenant sigue siendo el único filtro; esta fase lo tensa pero no crea un rol de conexión nuevo.

| Hallazgo | Cierre | Artefacto |
|---|---|---|
| C-01 service role en el formulario público | El BFF de `apps/web/app/api/public/service-requests` ya no usa `SUPABASE_SERVICE_ROLE_KEY` ni `PrismaClient`; la lectura anónima va con `company_id=eq.<allowlist>` y la escritura de catálogos exige JWT del administrador y deja decidir a RLS. | `apps/web/app/api/public/service-requests/route.ts` (reescrito) |
| C-02 empresa elegida por el cliente | La empresa sale solo de `APEXOS_PUBLIC_SERVICE_COMPANY_ID` (alias `NEXT_PUBLIC_...`); `company_id`, `company_name` y `?empresa=` son cosméticos. Sin allowlist: 503 `EMPRESA_PUBLICA_NO_CONFIGURADA`, sin consultar la base. En local, lectura y escritura se delegan al API operativo (`/api/v1/public/services/*`) que aplica RBAC. | `apps/api/src/modules/services/public-service.js`, `public-routes.js`, `apps/api/server.js` |
| C-03 allowlist de tenant mantenida a mano | `TENANT_MODELS` se deriva de `Prisma.dmmf` (179 modelos con columna) y `GLOBAL_MODELS` queda corta y explícita (12 sin columna); el módulo lanza al arrancar si un global tiene `tenant_id`. | `apps/api/src/core/tenantModels.js`, `apps/api/src/core/prisma.js:5,70` |
| C-04 escalada por `PUT /admin/users/:id` | El candado de rol que ya protegía `updateRole` se aplica a `createUser`/`updateUser`, y cambiar la clave de otro usuario exige la clave actual del administrador (428 sin prueba, 403 si no coincide), también en `/access`. | `apps/api/src/modules/admin/service.js:29,40,1123,1261,1265,1437`, `admin/routes.js:71,74` |

Mediciones (gate `scripts/security/candado-gates.js`, baseline refrescada con `--update` y `--block` en verde):

| Indicador | Antes | Después |
|---|---|---|
| `models_with_tenant_id_outside_allowlist` | 29 | **0** |
| `models_in_allowlist_without_tenant_id_column` | 5 | **0** |
| `public_web_routes_using_service_role` | 0 | **0** |
| `public_web_routes_using_prisma_client` | 0 | **0** |
| `routes_without_auth` | 4 | 4 (login/register/refresh/onboarding, intencionales) |
| (info) `public_routes_declared` | no medido | **3** |

El gate también se corrigió: el hook de autenticación de `services/routes.js` se heredaba al archivo hermano `public-routes.js`, y eso clasificaba como autenticadas tres rutas públicas y ensuciaba el informacional de 198. Ahora el hook se evalúa por archivo y los archivos públicos no heredan el de su directorio.

Pruebas ejecutadas:

```bash
node --test apps/api/test/core-tenant-models.test.js apps/api/test/admin-role-escalation.test.js apps/api/test/public-service-allowlist.test.js
# 22/22 pass
cd apps/web && npm run test:security      # 10/10 pass
cd apps/web && npm run typecheck          # limpio
npm run security:candado:block            # exit 0
```

Evidencia versionada: `docs/qa/evidence/plan-candado-20261108/gate-fase-1.txt` y `security-fase-1.txt` (pruebas de rechazo 401/403/428/503 y hallazgos residuales).

**Decisiones registradas**

- El `PUT /api/public/service-requests?empresa=...` que la pantalla de administración usa como sincronía heredada **se conserva**: en nube el API operativo escribe Prisma y el formulario público lee Supabase, así que retirarlo desincronizaría el catálogo. Queda endurecido (JWT + allowlist + RLS), no eliminado.
- `APEXOS_PUBLIC_SERVICE_COMPANY_ID` se añade a `config/.env.example` como prerrequisito de despliegue. El arranque local (`scripts/dev-web.js` y el API) carga el `.env` de la raíz, así que la allowlist se configuró ahí —archivo gitignored— con la empresa demo; `config/local.env` no participa del arranque local.

**Bloqueos declarados**

- `BLOQUEO` (cerrado 2026-11-08): el stack local estaba caído y la allowlist sin configurar. Se levantó el stack con autorización del propietario, se configuró la empresa demo en el `.env` local y la certificación E2E se ejecutó: catálogo público 200 por API y por el BFF, y una orden creada por el formulario con `company_id` y `?empresa=` falsificados quedó en la empresa de la allowlist (`ServiceOrder` 96 → `c0d70738-…`), con su ítem asociado. Salida en `docs/qa/evidence/plan-candado-20261108/security-fase-1.txt`.
- `BLOQUEO`: la política RLS anón `service_references_public_catalog_select` no filtra por empresa. La ruta web ya consulta con la empresa de la allowlist, pero la lectura directa por REST con la llave anón permitiría leer etiquetas de tipos de servicio de otras empresas. Corregir RLS es cambio de nube y exige autorización propia (fase posterior).

**Hallazgos residuales abiertos**

- R-01 (Media): 7 rutas BFF administrativas de `apps/web` siguen usando service role (`/api/admin/users`, `/api/admin/roles`, `/api/platform/companies`, `/api/platform/company-modules`, `/api/platform/company-sessions`, `/api/services/monitor-orders`, `/api/v1/services/orders/[id]`). Es la misma clase de superficie que C-01, fuera del alcance de la ruta pública.
- R-02 (Media): `routes_authenticated_without_permission_guard` sigue en 198 de 753 rutas autenticadas (informacional, sin regresión en esta fase).


## 15. Ejecución de la Fase 2 — modo observar (2026-11-08)

Alcance ejecutado: C-06, C-07, A-02, A-03 y A-06 en `desarrollo`, con la revocación **instrumentada y medida, sin expulsar sesiones**. A-01 y A-13 siguen abiertos (ver checklist de la sección 11). El encendido de `AUTHORIZATION_VERSION_ENFORCEMENT_ENABLED` no forma parte de esta ejecución: exige una corrida medida y autorización independiente.

**Cambios**

| Archivo | Cambio |
|---|---|
| `apps/api/src/security/authorizationState.js` | Modos `off`/`observe`/`enforce` (`authorizationMode`), contadores por motivo (`authorizationMetrics`), `noteAuthEvent` y `rotateSession`. `validateAuthorization` siempre registra el motivo y devuelve `authorization_session_revoke_reason`. |
| `apps/api/src/fabric/metrics.js` | Contador Prometheus `apex_authorization_mismatch_total{reason}`, sin ids ni payloads. |
| `apps/api/src/modules/auth/service.js` | Login uniforme: `bcrypt.compare` corre siempre (hash señuelo para correo inexistente) y un único 401 para correo inexistente, clave incorrecta y usuario desactivado. Refresh rota la sesión y detecta reuso (`REFRESH_TOKEN_REUSED` vs `REFRESH_SESSION_REVOKED`). |
| `apps/api/src/security/trustProxy.js` (nuevo) + `apps/api/server.js:16` | `trustProxy` deja de ser `true`: sin `TRUST_PROXY` no se confía en `X-Forwarded-For`; se aceptan saltos (`1`), listas de IP/CIDR y palabras reconocidas por proxy-addr. `true` se rechaza a propósito. |
| `apps/web/lib/sessionSecurity.ts` | `keepSessionAlive` guarda el refresh rotado; sin eso el cliente conservaría uno viejo y la detección de reuso mediría un artefacto del cliente. |
| `config/.env.example` | Se documentan `TRUST_PROXY` y el significado de los flags de observación/enforcement. |

**Medición (lo que permite decidir si se enciende)**

- `authorizationMetrics()` publica `mode`, `total` y `reasons`; `apex_authorization_mismatch_total` sale por `/metrics` (autenticado). Se cuenta **siempre**, aunque el flag esté apagado, y el log por request solo aparece en `observe`/`enforce`.
- Un refresh reutilizado sobre una sesión rotada se registra como `REFRESH_TOKEN_REUSED`; sobre una sesión revocada por logout, como `REFRESH_SESSION_REVOKED`. Rotar una sesión ya revocada **no** ocurre: eso lavaría el logout en una sesión fresca. En ese caso se devuelve el mismo refresh presentado, sin extender su expiración a otros 30 días.

**Pruebas ejecutadas**

```bash
cd apps/api && node --test test/authorization-observe.test.js test/auth-session-hardening.test.js \
  test/trust-proxy.test.js test/rbac-administrative-role.test.js   # 21/21 pass
cd apps/web && node --experimental-strip-types --test test/module-access-role.test.mjs  # 3/3 pass
```

Evidencia versionada: `docs/qa/evidence/plan-candado-20261108/security-fase-2.txt`.

**Decisiones registradas**

- Modo observar elegido por el dueño: el enforcement global de autenticación no se enciende sin una corrida medida. La conducta visible al usuario cambia solo en lo seguro: login uniforme y rotación de refresh.
- `isAdministrativeRole` ya era comparación exacta en API y web; A-06 se cierra **fijándolo con pruebas** (parecidos como `admín` se normalizan a `admin` y se aceptan; subcadenas y `metadata` no), sin reescribir código que ya estaba bien.
- La detección de reuso se apoya en `revoke_reason` de `AuthorizationSession` porque no hay tabla de cadena de refrescos; no se añadió migración en esta fase.

**Límites conocidos de la rotación**

- Dos pestañas pueden presentar el mismo refresh: una rota y la otra aparece como `REFRESH_TOKEN_REUSED` aunque no haya ataque. En modo observar solo se mide; con enforcement encendido obligaría a re-login, por eso la activación necesita esa medición previa.
- Los access tokens emitidos antes de la rotación conservan el `sid` anterior: al encender enforcement caducan por revocación. La ventana se mide antes de activar.

**Certificación E2E local (2026-11-08)**

El propietario autorizó Docker y `config/local.env`; el stack se levantó (postgres 16, pgbouncer, redis, minio y brain en Docker; API :3000 y web :3001) y la base local presentó 216 tablas con 72 migraciones aplicadas. Resultados sobre el API real:

- `npm run certify:auth-session` en verde: login, consulta autenticada y cinco rechazos 401 (sin token, token basura, `alg none`, clave incorrecta, firma alterada); revocación **medida** y no expulsada, que es la conducta de modo observar.
- Sesión E2E: el refresh sano rota el `sid` y emite refresh nuevo; el reuso del refresh rotado conserva el mismo valor, no abre sesión y suma `REFRESH_TOKEN_REUSED`; el logout deja `/auth/me` en 200 (medido) y el refresh de esa sesión suma `REFRESH_SESSION_REVOKED`. El login es uniforme (mismo 401 y mismo mensaje para usuario inexistente y clave errónea, con costo bcrypt comparable) y un `X-Forwarded-For` falsificado no altera la sesión.
- La expulsión real sigue cubierta por prueba y solo depende de `AUTHORIZATION_VERSION_ENFORCEMENT_ENABLED`, que no se encendió.

**Bloqueos declarados**

- `BLOQUEO` (cerrado 2026-11-08): la certificación E2E que faltaba por stack local caído ya se ejecutó; su salida queda en `docs/qa/evidence/plan-candado-20261108/security-fase-2.txt`.
- `BLOQUEO`: `TRUST_PROXY` no está declarado en Railway desde esta intervención. Mientras no se declare en el ambiente desplegado, detrás del proxy toda petición anónima comparte la IP del proxy en el límite global (200/min) y en el bloqueo de login. Declararlo es cambio de ambiente y exige autorización propia; `config/.env.example` deja la instrucción.
