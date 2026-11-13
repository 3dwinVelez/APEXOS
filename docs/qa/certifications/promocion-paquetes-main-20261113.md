# Certificación local del candidato por paquetes sobre `main` — 2026-11-13

Cambio: `promocion-paquetes-main-20261113`
Candidato: 11 commits reconstruidos sobre `origin/main 4659292f`, tip `aadbb688`.
Origen del contenido: `origin/develop beff5132` (el árbol que pasó la puerta de QA de la capa visual).
Destino: `main` (producción). **Este documento certifica el árbol local; no autoriza ni ejecuta el
despliegue ni las migraciones.**

## 1. Mecánica: commits aislados, no una fusión

`develop` tiene 466 commits que `main` no tiene y `main` tiene 105 que `develop` no tiene; un merge
arrastraría Talento Humano, el experimento de facturas recibidas, los assets demo de Comercio y 21
migraciones ajenas al pedido. El candidato se reconstruyó sobre el tip de `origin/main` con un commit
por origen. Cada commit fue armado con las rutas exactas de su paquete tomadas de `origin/develop`;
los archivos compartidos (`schema.prisma`, `server.js`, `core/prisma.js`, `modules.ts`,
`moduleFunctions.ts`) se recortaron al bloque que cada paquete consume y se revisaron uno por uno.

Inventario neto contra `origin/main`: **328 rutas, 191 A / 136 M / 1 rename (`R050`)** y **cero
eliminaciones**. El rename es `apps/web/components/ui/SearchSelect.tsx` →
`apps/web/components/ui/search-select.tsx`; la compuerta lo desdobla en D+A y la eliminación está
declarada en `allowed_deletions`.

| # | Commit | Paquete | Rutas | + | − | Migraciones Prisma | Supabase |
|---|---|---|---|---|---|---|---|
| P0 | `99313874` | `feat(web): la capa visual completa llega a main como paquete aislado` | 86 | 1.596 | 307 | — | — |
| P1 | `34d0e23f` | `feat(transport): sedes, planes, tarifario, PYG y liquidación por vehículo` | 109 | 15.516 | 1.025 | `20261007120000` planes, `20261009120000` geografía, `20261013120000` PYG, `20261016123000` sedes, `20261019134505` liquidación-vehículo | `vehicle_master_catalogs`, `vehicle_documents_storage` |
| P3 | `fdd73d7c` | `feat(accounting): PYG por vehículo, aperturas, reverso y plan de cuentas` | 50 | 35.916 | 393 | `20261014120000` party_id nullable | `standard_chart_piloto` |
| P2 | `240e73d6` | `feat(petty-cash): cajas menores con comprobantes, anticipos y reportes` | 31 | 13.042 | 11 | `20261009180000` fundación | `petty_cash_module_catalog` (M-29) |
| P4a | `571d613e` | `fix(inventory,purchases): normalización visual y correcciones de operación` | 46 | 1.076 | 765 | — | — |
| P4b | `0562c5ab` | `fix(services): el monitor consulta Supabase con la clave de servicio` | 3 | 3 | 3 | — | — |
| P4c | `ea786c92` | `fix(commercial,sales): selects con búsqueda homologados y registro de rutas` | 5 | 97 | 18 | — | — |
| P4d | `201dcc83` | `feat(security): el accionista se sincroniza con lectura de contabilidad y transporte` | 2 | 117 | 0 | — | — |
| P4e | `a0f15f10` | `feat(web): página de privacidad y tratamiento de datos` | 1 | 254 | 0 | — | — |
| P4f | `97c939ae` | `feat(api): handler serverless para desplegar el API en Vercel` | 3 | 70 | 1 | — | — |
| T | `aadbb688` | `test(web): contrato de la piel operativa de gráficos, tablas y estados vacíos` | 1 | 54 | 0 | — | — |

El orden de despliegue recomendado es P0 → P4 → P3 → P1 → P2 (P2 al final: depende de M-29). Cada
commit es independiente y reversible con `git revert` puntual.

## 2. Esquema y seguridad de los datos de clientes

`schema.prisma` pasa de 166 a 176 modelos: **+11 modelos nuevos y −1 reemplazado** (`TransportOrigin`
→ `Sede`). Los modelos nuevos son `Sede`, `TransportPlan`, `TransportPygConcept`,
`TransportPygBudget`, `TransportPygSourceMap`, `TransportPygConfig`, `PettyCashConcept`,
`PettyCashBox`, `PettyCashAdvance`, `PettyCashVoucher` y `PettyCashVoucherLine`.

Las 7 migraciones del candidato se revisaron sentencia por sentencia:

- **Aditivas puras**: planes, geografía tarifaria, PYG y fundación de cajas menores crean tablas,
  índices y llaves foráneas nuevas; no tocan filas existentes.
- **Compatible hacia atrás**: `20261014120000` deja `cnt_cuedoc.party_id` nullable (`DROP NOT NULL`),
  no borra ni reescribe datos.
- **No aditiva, con datos resguardados**: `20261016123000_sedes_replace_origins` renombra la tabla
  `TransportOrigin` a `sedes` (conserva filas y secuencia), archiva `origin_id` y los campos de origen
  de cada `TransportRateCard` en `metadata.legacy_origin_before_sedes` **antes** de retirar las
  columnas, y siembra tres sedes administrativas por tenant sin duplicar códigos existentes.
  Producción tiene **0 filas** en `TransportOrigin` (medido en el brief): el riesgo de datos es nulo.
  El riesgo operativo es la ventana del rename: el código anterior deja de encontrar la tabla en el
  instante de la migración, por lo que se aplica y se despliega el API en la misma ventana, con vista
  de compatibilidad `TransportOrigin` como red de seguridad hasta confirmar el despliegue.

Brecha preexistente que la promoción debe cerrar, no heredar: `main` declara 47 migraciones y
producción tiene 44 aplicadas. Faltan en producción
`20260919130000_align_kilometraje_unique_index_shape`, `20260921000000_gps_inactivo_sin_senal_novelty_type`
y `20261001120000_transport_settlement_packages`; la tercera es la seria: el código de `main` usa
`TransportSettlementPackage` y la base productiva no tiene esas tablas. En total son **10 migraciones
Prisma** (3 preexistentes + 7 del candidato) más dos objetos Supabase:
`apexos_accounting_private.standard_chart` (sin él, Contabilidad no puede arrancar empresas nuevas) y
el catálogo M-29 (sin él, Gastos Menores no se licencia). Inventario y hashes en
`../evidence/promocion-paquetes-main-20261113/migraciones-inventario.txt`.

## 3. Qué NO viaja (aunque esté vivo en `develop`)

- **Talento Humano / nómina y marcaciones**: motor, páginas, componentes, librerías, sus 14
  migraciones Prisma y sus migraciones Supabase, pruebas, las 5 entradas `fn-*` de
  `moduleFunctions.ts`, el interruptor de `apps/web/lib/api.ts` y el acople de administración. La
  auditoría del 2026-10-30 lo dejó **NO APTO** con 13 hallazgos abiertos y sin reauditoría. Sigue en
  `desarrollo` y `develop`, no en `main`.
- **9 modelos `Invoice*` / `ReceivedInvoice*`**: el `schema.prisma` de `develop` los trae sin API, sin
  UI y sin migración. El candidato se compara contra `develop` y la única diferencia del esquema es
  exactamente ese bloque; no viaja.
- **Assets demo de Comercio**: 132 JPG de `apps/web/public/comercio/**` y seeders de demostración.
- **APEX Control Tower** (`apps/control-tower/**`) y la evidencia intermedia de rondas y manifiestos
  de `develop` que no sustenta este candidato (321 archivos en `docs/qa/evidence`, 79 manifiestos y
  23 hojas de certificación ajenas a esta promoción). Conteo por directorio en
  `../evidence/promocion-paquetes-main-20261113/exclusiones-verificadas.txt`.

Dos desviaciones de prueba, deliberadas y documentadas:

1. `apps/web/test/module-portfolio.test.mjs` fija 31 fichas y 12 módulos visibles porque P2 restaura
   Gastos Menores en el catálogo; el resto del portafolio mantiene la curaduría de `develop`.
2. `apps/web/test/command-palette-module-functions.test.mjs` excluye con `NESTED_VIEWS` la vista
   `/dashboard/contabilidad/pyg/ampliado`: se abre desde su pantalla padre con la selección en la URL
   y no es un destino propio del centro de comandos.

## 4. Evidencia de la certificación local

Corrida sobre el árbol del candidato `aadbb688`, en el worktree aislado:

| Control | Comando | Resultado | Evidencia |
|---|---|---|---|
| Suite API | `node --env-file=../../.env --test test/*.test.js` en `apps/api` | **987 pruebas: 984 pass, 0 fail, 3 skipped** | `api-suite.txt` |
| Suite web | `node --test test/*.test.mjs` en `apps/web` | **770 pruebas: 769 pass, 1 fail de arnés** | `web-suite.txt` |
| Prisma | `npx prisma validate` | **esquema válido** | `prisma-validate.txt` |
| TypeScript web | `npx tsc --noEmit` | **exit 0, sin salida** | `web-typecheck.txt` |
| Build producción | `npx next build --webpack` (`NEXT_DIST_DIR=.next-main-packages`) | **Compiled successfully in 95s, exit 0**, tabla de rutas completa con `/privacidad`, `/print/transport-settlement` y todo el dashboard | `next-build.txt` |

El único rojo de la suite web es `apps/web/test/transport-pyg-account-config.component.test.mjs:93`
(«react y react-dom/server salen de la misma instalación de node_modules»), artefacto del
`node_modules` enlazado por junction fuera del worktree; react resuelve a
`C:\Users\mq1\Documents\Proyectos\APEXOS\node_modules\react\index.js`, no al árbol candidato. No es
un defecto de producto y no se oculta la cifra.

`next build` usa webpack porque Turbopack rechaza el junction («Symlink [project]/apps/web/node_modules
is invalid»), no por una falla del código. El build reescribió `apps/web/tsconfig.json` y
`next-env.d.ts`; ambas escrituras se revirtieron y el árbol candidato quedó idéntico a los commits
certificados.

## 5. Puerta de alcance

El manifiesto `../manifests/promocion-paquetes-main-20261113-scope.json` declara el inventario exacto
A/M/D de las 328 rutas, `base_commit 4659292f`, `certified_commit aadbb688`, `allowed_deletions` con
`apps/web/components/ui/SearchSelect.tsx` y cuatro capacidades protegidas con evidencia existente.
La corrida de `npm run qa:promotion:scope -- <manifiesto> HEAD origin/main` y su salida quedan en
`../evidence/promocion-paquetes-main-20261113/scope-gate.txt`.

Los inventarios por commit (padre..commit) quedan en `../manifests/promocion-paquetes-main-20261113-inventarios/`
para auditar que ningún commit mezcla módulos; la compuerta de promoción se corre sobre el candidato
completo, que es el diff que realmente aterrizaría en `main`.

## 6. Lo que este documento NO certifica

- **Certificación funcional NYVORA en producción**: pendiente. Debe hacerse con `NYVORA_REAL_READONLY`
  (GET + navegador), sin crear usuarios ni datos de prueba, sobre el ambiente desplegado con el commit
  exacto. La cuenta modelo no tiene licencia de Gastos Menores (M-29).
- **Aprobación funcional de QA** y `qa:approval:evidence`: exigen ambiente QA con el candidato
  desplegado y aprobación explícita del dueño; no se fabrican.
- **Aplicación de migraciones y despliegue**: 10 migraciones Prisma, el plan de cuentas estándar y la
  decisión sobre M-29. Requieren ventana y autorización independientes del dueño.
- **Regresión de datos en producción**: snapshot/PITR previo, conteo base de tablas de NYVORA y
  comparación posterior; se ejecuta en la ventana, no antes.

Veredicto local: **APTO para solicitar la certificación funcional**. No apto todavía para tocar
producción: falta la compuerta de aprobación con NYVORA y la autorización de ventana.
