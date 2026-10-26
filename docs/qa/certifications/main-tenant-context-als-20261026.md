# Certificación `main-tenant-context-als-20261026` — contexto del tenant en el núcleo de `main`

Rama destino: `main`. Baseline productivo: `3ebe71f7a611409e3cbe853a513ed6847dd2d9f2` (tip vigente de `origin/main`).
Candidato: `f6308325edc2b5cf7c3e57d05e6193a1e8ffb12e` (tip final), sobre el commit funcional `6f564426e5582db083ddaa5b0bcf43b28d25643d`, reconstruidos puntualmente sobre ese baseline en la rama auxiliar `aux-promo-main-tenant`.
Entorno de certificación: LOCAL (PostgreSQL real `127.0.0.1:55432`, API Fastify real `127.0.0.1:3212`).

## Qué se corrigió

`apps/api/src/core/prisma.js:161` envolvía el callback del tenant así:

```js
tenantStorage.run({ tenantId: normalizeTenantId(tenantId) }, fn)
```

`desarrollo` y `develop` llevan años usando la forma `async () => await fn()`. La diferencia no es de estilo. Con la forma de `main`, cuando el callback devuelve una promesa de Prisma de forma sincrónica (`() => prisma.employee.create({...})`), `AsyncLocalStorage` sale del contexto en cuanto el callback retorna — es decir antes de que el middleware de inyección de tenant (`client.$use`) se ejecute en el microtask de Prisma. El middleware ya no ve el tenant y entonces no inyecta `data.tenant_id` en las escrituras ni el filtro `where.tenant_id` en las lecturas.

La corrección es una línea:

```diff
-    if (property === "runWithTenant") return (tenantId, fn) => tenantStorage.run({ tenantId: normalizeTenantId(tenantId) }, fn);
+    if (property === "runWithTenant") return (tenantId, fn) => tenantStorage.run({ tenantId: normalizeTenantId(tenantId) }, async () => await fn());
```

## Por qué importa (medido, no supuesto)

1. **Exposición en el árbol de `main`**: 389 sitios de `runWithTenant(<tenant>, ...)` en `apps/api/src` y `server.js`; 281 con callback asíncrono y **103 con callback sincrónico** (`() => ...`). Ese centenar largo incluye lecturas (`findMany`, `findFirstOrThrow`) y escrituras, en Transporte, Comercial, Inventario, Ventas, Facturación, Contabilidad, Fabric y el propio Talento Humano.
2. **Row Level Security no respalda el hueco**: se consultó `pg_class`/`pg_policy` sobre `Employee`, `TimePunch`, `Tenant` y `AuditLog` en la base local — `relrowsecurity = false`, `relforcerowsecurity = false`, **0 políticas** en las cuatro. La búsqueda en `apps/api/prisma/migrations` de `ROW LEVEL SECURITY` o `CREATE POLICY` no devuelve archivos. El middleware de Prisma es el único filtro de tenant de las lecturas y el único que fija `data.tenant_id` en las escrituras.
3. Consecuencia para el operario y para el cliente: una lectura con callback sincrónico en `main` queda **sin filtro entre empresas**, y una escritura solo funciona si el llamador declaró el tenant a mano. Esto último es exactamente lo que obligó a parchear el arnés de certificación en `main` (commit `150a2248` de la ronda anterior) con un `Argument 'tenant_id' is missing` que en `desarrollo` y `develop` nunca ocurrió.

### La fuga, medida en vivo (no supuesta)

Se ejecutó la misma lectura contra la base local —clon del esquema productivo, con 51 empresas con empleados— usando únicamente `SELECT`, sin escribir ni alterar datos. La consulta pedida fue `runWithTenant(<una empresa>, () => prisma.employee.findMany({ where: { active: true } }))`, es decir con callback sincrónico y sin declarar el tenant:

| Núcleo | Filas devueltas | Empresas distintas en la respuesta |
|---|---|---|
| `main` actual (`3ebe71f7`) | 168 | **29** (28 ajenas) |
| Candidato (`f6308325`) | 71 | **1** (solo la pedida) |

Una sola lectura de la pantalla equivocada ya está mezclando empresas. Con eso dimensionado, el arnés quedó modificado para que esta comprobación no vuelva a pasar desapercibida: el chequeo 12 `sync_read_stays_inside_tenant` hace la misma pregunta dentro de la certificación, y por eso la corrida subió de 42 a 43 controles.

El hallazgo se registró como deuda abierta en la certificación anterior (`main-scope-manifest.json` → `core_prisma_difference_not_ported`). Esta ronda la cierra.

## Pruebas y evidencia

| # | Qué se ejercitó | Baseline `3ebe71f7` | Candidato `f6308325` |
|---|---|---|---|
| 1 | Prueba de contrato versionada `apps/api/test/core-tenant-context-propagation.test.js` (4 casos, sin base de datos) | 2 pass / **2 fail** (el caso síncrono recibe `tenant_id` `undefined`; la aserción sobre la línea del núcleo falla) | **4 pass / 0 fail** |
| 2 | Arnés en vivo de Talento Humano `scripts/certifications/hr-contention-p2028-local.js`, **con el `tenant_id` declarado a mano eliminado** de las dos escrituras de callback sincrónico | **BLOQUEADO**: 10/10 chequeos estáticos y aborta en el sembrado con `Invalid prisma.employee.create() ... Argument 'tenant_id' is missing.` (API Fastify real ya arriba y login 200) | **43/43 APROBADO**, corrida `20261026224752`, `api_commit` clavado en el tip final `f6308325`, limpieza con 0 errores y empleado espejo purgado |
| 3 | Verificación directa en base de datos del tenant inyectado | — | Empleados QA 644/645/646 con `tenant_id = 5ef4cb7d-…c4abd` (el del run) sin que el llamador lo declarara; la malla `375` sembrada igual quedó purgada al cerrar la corrida y `th_jornada_kilometrajes` en 0 filas para ese tenant |
| 4 | Regresión de plataforma completa sobre el árbol de `main`, dos veces con el mismo corredor | API 421 pruebas / 2 fallas; Web 384 / 1 falla | API **425** / **las mismas 2** fallas; Web **384** / **la misma 1** falla → **+4 pruebas, 0 fallas nuevas** |
| 5 | Suites enfocados de Talento Humano en el candidato | — | API `hr-*.test.js` **102/102** |
| 7 | Lectura sincrónica entre empresas contra datos reales multi-tenant (solo `SELECT`) | **168 filas de 29 empresas distintas** (28 ajenas) pidiendo una sola | 71 filas, **1 empresa** (la pedida), 0 ajenas |
| 6 | Compatibilidad del valor de retorno (riesgo: la forma nueva siempre devuelve promesa) | — | Sin consumos sincrónicos: no hay `= prisma.runWithTenant(...)` sin `await` en todo el árbol, y los 389 callbacks devuelven una promesa de Prisma o una `$transaction` (incluido el `.then()` de `settlement-service.js:193`). El único efecto observable es un microtask adicional. |

Evidencia versionada:

- `docs/qa/evidence/main-tenant-context-als-20261026/als-probe.json` — los tres sondeos con comandos, conteos y salida exacta del error de Prisma.
- `docs/qa/evidence/main-tenant-context-als-20261026/harness-no-workaround.json` y `harness-no-workaround-fixture.json` — el 43/43 del arnés sin el atajo de tenant, producido sobre el propio candidato.
- `docs/qa/evidence/main-tenant-context-als-20261026/platform-regression.json` — corredor del candidato y del baseline con su delta.
- `docs/qa/evidence/main-tenant-context-als-20261026/main-scope-manifest.json` y `qa-approval-evidence.json` — inventario exacto y puerta de aprobación.

## El arnés ahora es guardián, no testigo

Se levantó el workaround del arnés: las dos escrituras de callback sincrónico ya no declaran `tenant_id`. Con el núcleo corregido el arnés queda pidiendo el tenant al middleware, así que una futura regresión de `runWithTenant` vuelve a bloquear la certificación en lugar de pasar desapercibida. Este cambio está en el inventario de alcance como `M scripts/certifications/hr-contention-p2028-local.js` y alineó la variante de `main` con la de `desarrollo`, que nunca declaró el tenant en esos sitios.

No se tocó ninguna ruta de producto además de la línea del núcleo, y no se modificó la evidencia versionada del cambio anterior (`docs/qa/evidence/hr-contention-p2028-20261026/`): esa corrida sigue relatando su propio commit.

## Limitaciones declaradas

- No hay migración: este cambio no agrega ni aplica migración y no toca esquema, Railway, Supabase ni secretos.
- El corredor transversal de `main` se midió con la réplica del script versionado, porque `scripts/certifications/release-local-regression.cjs` no existe en el árbol de `main`; el comando, los flags y el entorno son los mismos y se corrió dos veces (candidato y baseline).
- Las 3 fallas preexistentes de Inventario/Compras y Transporte no se corrigieron aquí: son de otros módulos, fallan idénticas en el baseline y sus archivos no aparecen en el diff del candidato.
- La exposición de las lecturas sin filtro se midió en la base local, clon del esquema productivo, que no tiene RLS ni políticas; como el esquema versionado tampoco declara RLS en ninguna migración, la conclusión aplica igual al ambiente nube.
- No se verificó en navegador la pantalla de marcación contra este candidato de `main`: la verificación en navegador de esta ronda se certificó del lado de `desarrollo`/`develop` (22/22) y el árbol de `main` no trae esa funcionalidad de nómina.
