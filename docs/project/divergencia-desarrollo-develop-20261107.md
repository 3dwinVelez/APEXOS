# Divergencia `desarrollo` ↔ `develop` — auditoría por contenido (2026-11-07)

## Objeto y alcance

Medir, **por contenido y no por historia**, qué distingue a las dos ramas de trabajo, y separar el riesgo de producto real del ruido que produce la promoción reconstruida. El disparador es la ronda 7 del Comercio: para poder promocionar un módulo hubo que reconstruir el candidato tres veces porque las ramas ya no son comparables. El Comercio queda **fuera** de este documento: verificado por blob, cero rutas de producto con diferencia entre `desarrollo` y `develop`.

## Método (y las dos trampas que invalidan una medición ingenua)

Punto de referencia único: `git merge-base origin/develop origin/desarrollo` = **`0b03f3fd`** (2026-10-24). Desde ahí: 97 commits propios en `desarrollo`, 89 propios en `develop`.

1. **Clasificación por blob a tres bandas.** Para cada ruta con diferencia: `git ls-tree <ref> -- <ruta>` sobre la base, `origin/develop` y `origin/desarrollo`, y comparar los sha. Si `base == develop` → el contenido nuevo está solo en `desarrollo` (sin promocionar). Si `base == desarrollo` → está liberado en `develop` y nunca se retrointegró. Si los tres difieren → conflicto bilateral.
2. **Trampa corregida en esta misma medición:** `git rev-parse <ref>:<ruta>` **no es fiable desde este shell de Windows** — el entorno reescribe `:` y `/` y devuelve `fatal: ambiguous argument 'origin\desarrollo;.gitignore'`, que con `2>/dev/null` se convierte en cadena vacía y **inventa** conflictos bilaterales. La primera pasada con ese comando clasificó mal los 8 skills y 4 rutas más. `git ls-tree` no se mutila.
3. **Los timestamps de commit no prueban qué rama manda.** Con promociones reconstruidas (`cherry-pick` / normalización de árbol), el commit de `develop` es posterior al de `desarrollo` para el mismo cambio. Clasificar por `log -1 --format=%ct` habría dicho que `develop` es autoritativo en 8 archivos que en realidad están congelados en la base.
4. **Conflicto de fusión real** (no de inventario): `git merge-tree --write-tree origin/develop origin/desarrollo` → exit 1.

## Mapa medido

| Medida | Valor |
|---|---|
| Rutas distintas entre las dos ramas | **508** |
| Solo en `desarrollo` (`A`) | 337 |
| Solo en `develop` (`D` al ir de develop a desarrollo) | 92 |
| Modificadas en ambas | 79 |
| — de las 79: nuevo solo en `desarrollo` (sin promocionar) | **29** |
| — liberado solo en `develop` (sin retrointegrar) | **17** |
| — **bilaterales (conflicto real)** | **17** |
| — creados con contenido distinto en ambas | 16 |
| Conflictos que produciría un merge de rama completa | **25** (11 de código, 14 de documentación de QA) |

Los 11 conflictos de código: `apps/api/prisma/schema.prisma`, `apps/api/src/core/prisma.js`, `apps/api/src/middleware/rbac.js`, `apps/api/src/modules/accounting/routes.js`, `apps/api/src/modules/hr/mobile-identity.js`, `apps/api/src/modules/hr/service.js`, `apps/api/test/hr-payroll-adjustment-permission.test.js`, `apps/web/lib/api.ts`, `apps/web/lib/modules.ts`, `apps/web/app/dashboard/talento-humano/reportes/page.tsx`, `apps/web/app/dashboard/talento-humano/rutas/page.tsx`.

## Hallazgos por gravedad

### P0 — La nómina de QA y de producción no tiene los parámetros laborales de vigencia 2026

No es un problema de git: es dinero y ley.

- `20261030120000_hr_labor_rates_vigencia_2026` y `20261030130000_hr_ibc_caps_floors_2026` **solo existen en `desarrollo`** (verificado con `git ls-tree` en las tres ramas: `main` 0, `develop` 0, `desarrollo` 1). No crean tablas: insertan/actualizan filas de vigencia (recargo nocturno 35 %, HEND 155 % hasta 30-jun-2026 y 165 % desde 01-jul, topes y pisos de IBC). Sin ellas, `develop` (QA) y `main` (producción) liquidan con el juego de parámetros anterior a la Ley 2466/2025.
- El valor de arranque del recargo nocturno **difiere por rama**: `DEFAULT_PARAMS.night_start` y el respaldo de `classifyMinute` son `"19:00" / 1140` en `desarrollo` y `"21:00" / 1260` en `develop` **y en `main`** (`apps/api/src/modules/hr/timeLogic.js:119` en las tres). Ojo con la lectura: el parámetro por tenant `JORNADA_NOCTURNA_INICIO` sí está sembrado a 19 en las tres ramas (migración `20260917120000_hr_workday_novelties_foundation`), así que la diferencia de código aplica cuando el tenant no tiene la fila activa — y ahí `main` cobra como si el nocturno empezara a las 21:00.
- Detalle que hay que arreglar de paso: en `develop` y `main` el archivo quedó **inconsistente** — `night_start: "21:00"` en `DEFAULT_PARAMS` pero `"19:00"` en el bloque de parámetros 2026 (líneas 19 y 28 de `apps/api/src/modules/hr/service.js`). Alguien promocionó media corrección.

### P1 — Funcionalidad liberada en `develop` que `desarrollo` no tiene

17 archivos con contenido solo-en-`develop`, más 16 rutas `apps/api` y 24 rutas `apps/web` que `desarrollo` no tiene. Se agrupan en tres capacidades vivas en QA:

- **Contabilidad**: reversos controlados e importación de presupuesto (`accounting/schema.js`, `service.js`, `asientos/page.tsx` 641→827 líneas, `pyg/page.tsx` reescrito, `AccountingPygBudget.tsx`), con sus tests (`accounting-opening-balances.test.js` +144 líneas en develop).
- **Transporte PYG**: configuración de cuentas por centro (`transport-pyg/engine|routes|schema|service`, `transport-pyg-report.test.js` +683 líneas en develop).
- **RRHH**: evidencia de marcación y vínculo usuario-empleado (`hr/routeEventSummaries.js`, `admin/service.js` `findEmployeeForUser` con transacción Serializable, `hr/mobile-identity.js` add/add, `DashboardChrome.tsx` con `PYG_EXPANDED_PATH`, `lib/hrScheduleMonitor.ts` con `scheduleMonitorUsesOperationalSource`).

La convención registrada de «la contabilidad de release no se retrointegra a `desarrollo`» no cubre esto: `AGENTS.md` exige retrointegrar, y aquí lo que falta es functionality de tres módulos. Quien programe hoy sobre `desarrollo` está programando sobre código que no tiene esas funciones.

### P1 — El origen exacto de los 3 rojos que `develop` arrastra

Medidos en la suite del candidato (ronda 7) y reproducidos en el destino:

- `not ok 88 — el registro de funciones cubre todas las rutas del dashboard`: `/pyg/ampliado` existe como página en `develop` pero **ninguna rama lo registra** en la paleta; el registro vive en `lib/modules.ts` / `moduleFunctions.ts`, que son bilaterales.
- `not ok 301/303 — apiInternal consulta el guard antes de intentar el respaldo`: `apps/web/lib/api.ts` es bilateral. Las 46 líneas que aportan `getTransportPygAccountConfiguration` / `saveTransportPygAccountConfiguration` y los tipos del PYG están **solo en develop**; el refactor de `requestErrorMessage` es idéntico en ambas. Un candidato desde `desarrollo` revierte esas 46 líneas.

### P2 — Los skills de equipo están congelados en `develop` y los gates no lo ven

Los 8 `.qoder/skills/*/SKILL.md` de `origin/develop` son **byte a byte el blob de la base `0b03f3fd`** (`git log 0b03f3fd..origin/develop -- .qoder/skills/` = 0 commits; `AGENTS.md` igual). `agents/registry.json`, `agents/CHANGELOG.md` y los espejos `agents/**` **no existen** en `develop`. Consecuencia: la línea de promoción opera con un contrato de equipo de 30-40 reglas menos que el de la rama de trabajo, y `npm run agents:preflight` no puede detectarlo porque **solo compara contra `origin/desarrollo`** — cero menciones a `origin/develop` en `scripts/agents/`. Comando que sí lo mide: `git diff --numstat origin/develop origin/desarrollo -- .qoder/skills agents AGENTS.md`.

### P2 — Documentos de QA divergentes: marca de agua contra resultado distinto

16 rutas creadas con contenido en ambas ramas. La mayoría es marca de agua esperable de una reconstrucción (`certified_commit`, `api_commit`, `generated_at`, ids de fixture, una recaptura PNG cuyo `browser-certification.json` dice PASSED 22/22 en las dos). **Una no lo es:** `docs/qa/manifests/hr-route-p2028-20261026-preqa.json` declara `approval.status` = `pending` en `desarrollo` y `approved` en `develop`. El resultado live en un lado y el registro local quedó atrás, junto con las secciones de recertificación que `develop` sí documentó.

### P2 — Asimetría esquema/migración que hoy es inocua pero no debe crecer

`desarrollo` declara 191 modelos de Prisma, `develop` 185, la base 161. Los 6 exclusivos de `desarrollo` son `Apex*` (migración `20261102120000_apex_control_foundation`, residencia declarada de la torre). Los 9 `Invoice*`/`ReceivedInvoice*` están en **ambas** ramas, pero la migración `20261028160000_received_invoices` solo en `desarrollo`. Verificado que **ningún código de `develop` consulta esas tablas** (`git grep prisma.invoice… origin/develop -- apps/api/src` vacío), así que no hay `P2022` en QA hoy; es deuda latente para cuando el módulo de facturas recibidas se promocione.

## Plan de reconciliación (orden por riesgo, no por facilidad)

1. **Saldar la vigencia laboral 2026 hacia adelante.** Brief propio para promocionar `41ad5684` y sus dos migraciones a `develop` con certificación de nómina (`apexos-auditor-nomina` solo dictamen, `apexos-backend`, `apexos-qa`); después `develop → main` con autorización. Mientras eso no esté, cualquier liquidación en QA/producción es con tarifas viejas.
2. **Retrointegrar a `desarrollo` lo liberado en `develop`** (Contabilidad reversos/importación, Transporte PYG cuentas, RRHH evidencia/vínculo), hunk por hunk, empezando por `lib/api.ts` y `lib/modules.ts`: los 3 rojos declarados se cierran aquí, no «de paso» en otra promoción.
3. **Resolver los 17 bilaterales con decisión explícita**, no con el lado más cómodo: `schema.prisma`, `core/prisma.js` (listas TENANT/SOFT/PHYSICAL_DELETE = aislamiento multi-tenant), `middleware/rbac.js` (`MODULE_CODES`), `hr/service.js` (41 hunks), `mobile-identity.js` (add/add).
4. **Llevar el contrato de equipo a la línea de promoción**: skills + `AGENTS.md` + `agents/registry.json` de `desarrollo` a `develop` como promoción propia (es estrictamente aditivo sobre blobs idénticos a la base, sin conflicto).
5. **Cerrar el punto ciego del gate**: una comprobación que compare los skills contra `origin/<target>` además de `origin/desarrollo`.

## Lo que este documento NO afirma

- No se corrieron las suites de `develop` ni de `main` para esta medición; los 3 rojos son los que ya estaban medidos en la ronda 7 y su causa se confirma por fuente.
- No se accedió a ninguna base de datos: las afirmaciones sobre parámetros laborales son de migraciones versionadas y de código, no del contenido de la tabla.
- La clasificación bilateral es de las 79 rutas modificadas; las 337 `A` y 92 `D` se cuentan pero no se abrieron archivo por archivo.
- La reconciliación de `hr/service.js` (41 hunks) requiere lectura de negocio y no puede planificarse desde este documento.
