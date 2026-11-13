# Certificación local y de QA del candidato por paquetes sobre `main` — 2026-11-13

Cambio: `promocion-paquetes-main-20261113`
Candidato: 12 commits reconstruidos sobre `origin/main 4659292f`, tip `01e9b8f6`.
Origen del contenido: `origin/develop beff5132` (el árbol que pasó la puerta de QA de la capa visual).
Destino: `main` (producción). **Este documento certifica el árbol local y el contraste en QA; no
autoriza por sí solo el despliegue ni las migraciones.**

## 1. Mecánica: commits aislados, no una fusión

`develop` tiene 466 commits que `main` no tiene y `main` tiene 105 que `develop` no tiene; un merge
arrastraría el experimento de facturas recibidas, los assets demo de Comercio y 21 migraciones ajenas
al pedido. El candidato se reconstruyó sobre el tip de `origin/main` con un commit por origen. Cada
commit fue armado con las rutas exactas de su paquete tomadas de `origin/develop`; los archivos
compartidos (`schema.prisma`, `server.js`, `core/prisma.js`, `modules.ts`, `moduleFunctions.ts`,
`lib/api.ts`, `modules/admin/service.js`) se recortaron al bloque que cada paquete consume y se
revisaron uno por uno.

Inventario neto contra `origin/main`: **464 entradas A/M/D, 299 A / 164 M / 1 D**, con el rename
`SearchSelect.tsx` desdoblado en D+A. La única eliminación es
`apps/web/components/ui/SearchSelect.tsx` → `apps/web/components/ui/search-select.tsx`, declarada en
`allowed_deletions`.

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
| P12 | `01e9b8f6` | `feat(hr): nomina, prestaciones y evidencia movil llegan a main como paquete aislado` | 114 | 17.433 | 1.028 | 14 (`20260918100000`…`20260919130000`, incluida `time_route_kind_descanso`) | 14 espejos SQL de las mismas migraciones |

El orden de despliegue recomendado es P0 → P4 → P3 → P1 → P2 → P12 (P2 al final: depende de M-29; P12
después de aplicar sus migraciones). Cada commit es independiente y reversible con `git revert` puntual.

### 1.1 Paquete 12 — Talento Humano (decisión del propietario)

El brief original dejaba Talento Humano fuera por el veredicto **NO APTO** de la auditoría del
2026-10-30 (13 hallazgos abiertos, sin reauditoría). El propietario pidió expresamente incluirlo como
commit aislado. Se transporta el árbol de `develop` sin reescribir su lógica: motor de nómina,
prestaciones, aportes, libranzas, liquidación de trabajador, asociación empleado-usuario, identidad
móvil, evidencia fotográfica y las cinco pantallas nuevas del hub (`aportes-sociales`, `libranzas`,
`liquidacion-trabajador`, `prestaciones-pagos`, `provisiones`), con las 5 entradas `fn-*` de
`moduleFunctions.ts` y el interruptor `scheduleMonitorUsesOperationalSource` de `lib/api.ts`.

**Este paquete no certifica la exactitud del cálculo de nómina ni cierra la auditoría.** El veredicto
NO APTO sigue abierto y se declara así para que nadie lo confunda con una aprobación funcional. La
certificación de este documento es de transporte, compilación y regresión técnica.

Se corrigió además un contrato de prueba que quedaba rojo en `develop`:
`apps/web/test/hr-route-write-fallback.test.mjs` ahora declara el guard
`scheduleMonitorUsesOperationalSource` que ya vive en `lib/api.ts`, y agrega la prueba de que las
lecturas del monitor tampoco caen al respaldo Supabase.

## 2. Esquema y seguridad de los datos de clientes

`schema.prisma` pasa de 166 a 176 modelos: **+11 modelos nuevos y −1 reemplazado** (`TransportOrigin`
→ `Sede`). Los modelos nuevos son `Sede`, `TransportPlan`, `TransportPygConcept`,
`TransportPygBudget`, `TransportPygSourceMap`, `TransportPygConfig`, `PettyCashConcept`,
`PettyCashBox`, `PettyCashAdvance`, `PettyCashVoucher` y `PettyCashVoucherLine`. Talento Humano no
agrega modelos Prisma: su esquema vive en SQL crudo, por lo que el paquete 12 no varía `schema.prisma`.

Las **21 migraciones Prisma nuevas** del candidato (7 de los paquetes 1–4 y 14 de Talento Humano) se
revisaron sentencia por sentencia:

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
- **Talento Humano**: 12 de las 14 migraciones solo crean tablas `th_*` nuevas (`IF NOT EXISTS`), sus
  índices y catálogos de parámetros/conceptos. Dos ajustes tocan objetos existentes sin borrar datos:
  `20260919100000_hr_overtime_concept_value_type` fija `value_type='factor_total'` en cuatro conceptos
  de hora extra (`HED`, `HEN`, `HEDD`, `HEND`), y `20260919110000_time_route_kind_descanso` agrega
  `TimeRoute.kind TEXT NOT NULL DEFAULT 'trabajo'`. No hay `DROP`, `TRUNCATE` ni `DELETE`.

Brecha preexistente que la promoción debe cerrar, no heredar: `main` declara 47 migraciones y
producción tiene 44 aplicadas. Faltan en producción
`20260919130000_align_kilometraje_unique_index_shape`, `20260921000000_gps_inactivo_sin_senal_novelty_type`
y `20261001120000_transport_settlement_packages`; la tercera es la seria: el código de `main` usa
`TransportSettlementPackage` y la base productiva no tiene esas tablas. En total son **24 migraciones
Prisma** (3 preexistentes + 21 del candidato) más dos objetos Supabase:
`apexos_accounting_private.standard_chart` (sin él, Contabilidad no puede arrancar empresas nuevas) y
el catálogo M-29 (sin él, Gastos Menores no se licencia). Inventario y hashes en
`../evidence/promocion-paquetes-main-20261113/migraciones-inventario.txt`.

## 3. Qué NO viaja (aunque esté vivo en `develop`)

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

Y una corrección de contrato que `develop` tenía en rojo: `apps/web/test/hr-route-write-fallback.test.mjs`
afirmaba la condición de respaldo sin el guard `scheduleMonitorUsesOperationalSource` que `lib/api.ts`
ya aplica. El candidato actualiza la aserción y agrega la prueba de que las lecturas del monitor de
horarios tampoco caen al respaldo Supabase.

## 4. Evidencia de la certificación local

Corrida sobre el árbol del candidato `01e9b8f6`, en el worktree aislado:

| Control | Comando | Resultado | Evidencia |
|---|---|---|---|
| Suite API | `node --env-file=../../.env --test test/*.test.js` en `apps/api` | **1.104 pruebas: 1.101 pass, 0 fail, 3 skipped** | `api-suite.txt` |
| Suite web | `node --test test/*.test.mjs` en `apps/web` | **802 pruebas: 801 pass, 1 fail de arnés** | `web-suite.txt` |
| Prisma | `npx prisma validate` | **esquema válido** | `prisma-validate.txt` |
| TypeScript web | `npx tsc --noEmit` | **exit 0, sin salida** | `web-typecheck.txt` |
| Build producción | `npx next build --webpack` (`NEXT_DIST_DIR=.next-main-packages`) | **Compiled successfully, exit 0**, tabla de rutas completa con `/privacidad`, `/print/transport-settlement`, `/dashboard/talento-humano/{aportes-sociales,libranzas,liquidacion-trabajador,prestaciones-pagos,provisiones}` y todo el dashboard | `next-build.txt` |

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
A/M/D de las 464 entradas, `base_commit 4659292f`, `certified_commit 01e9b8f6`, `allowed_deletions`
con `apps/web/components/ui/SearchSelect.tsx` y cinco capacidades protegidas con evidencia existente.
La corrida de `npm run qa:promotion:scope -- <manifiesto> HEAD origin/main` y su salida quedan en
`../evidence/promocion-paquetes-main-20261113/scope-gate.txt`.

Los inventarios por commit (padre..commit) quedan en `../manifests/promocion-paquetes-main-20261113-inventarios/`
para auditar que ningún commit mezcla módulos; la compuerta de promoción se corre sobre el candidato
completo, que es el diff que realmente aterrizaría en `main`.

## 6. Certificación en QA con la empresa modelo NYVORA

El ambiente QA vive con el contenido que el candidato empaqueta: `apexos-api-qa` corre
`develop 6589af8e` (sin ningún commit de `apps/api` posterior en `develop`) y `apexos-web-qa`
corre `develop beff5132`, ambos `SUCCESS` del 2026-11-13. El contraste medido entre ese build y el
árbol del candidato está en `../evidence/promocion-paquetes-main-20261113/equivalencia-candidato-qa.txt`:
fuera de los 132 assets demo de Comercio, las nueve tablas `Invoice*` que `develop` trae sin API ni
migración, tres scripts de certificación y las tres pruebas web ajustadas de forma deliberada
(documentadas en §1.1), el código de producto es el mismo.

| Control | Script versionado | Resultado | Evidencia |
|---|---|---|---|
| Lecturas por módulo con NYVORA | `scripts/certifications/promocion-paquetes-main-qa.js` | **96/96 en verde** en 15 grupos (administración, inventario, compras, ventas, facturación, cartera, contabilidad, proyectos, servicios, talento humano, transporte, transporte PYG, cajas menores, sesión, salud) + 2 negativos: sin token 401 y credencial inválida 401 | `qa-nyvora-certification.json`, `qa-nyvora-certification-salida.txt` |
| Recorrido de navegador con NYVORA | `scripts/certifications/promocion-paquetes-main-qa-browser.js` | **11/11 pantallas** con título y sin denegación, 0 errores de consola y 0 respuestas HTTP ≥400: lobby, inventario, compras, ventas, contabilidad, transporte, talento humano, servicios, flota, torre de liquidaciones y PYG contable | `qa-nyvora-browser.json`, `qa-nyvora-browser-salida.txt`, 6 capturas `qa-*.png` |
| Regresión transversal | `apps/api/scripts/certifications/platform-regression-qa.js` con fixture NYVORA | **6 controles + bloqueo de no autorizados en verde** contra `6589af8e1d32` | `platform-regression-qa.txt` |

Los dos certificadores crean un usuario efímero de NYVORA con un rol propio de la corrida, no
escriben documentos ni asientos, y lo **desactivan al terminar** (`certification_user_deactivated:
true`). Ninguna credencial, correo o token queda en la evidencia.

Dos denegaciones se miden como contrato, no como fallo: NYVORA en QA no tiene M-22 (Administración)
licenciado — los tres endpoints `/api/v1/admin/*` devuelven `403 MODULO_NO_HABILITADO` y el maestro de
transporte, que redirige por diseño a `/dashboard/administracion`, queda fuera de la corrida de
navegador. Gastos Menores (M-29) tampoco está licenciado para la cuenta modelo en QA ni en producción:
sus lecturas se certifican por API con permiso de contabilidad, y la pantalla no se recorre porque el
licenciamiento la oculta. Proyectos queda en su estado de carga del monitor operacional y también se
excluye del navegador; su lectura `/api/v1/projects` sí está verde en la certificación de API.

## 7. Lo que este documento NO certifica

- **Certificación funcional NYVORA en producción**: pendiente. Debe hacerse con `NYVORA_REAL_READONLY`
  (GET + navegador), sin crear usuarios ni datos de prueba, sobre el ambiente desplegado con el commit
  exacto. La cuenta modelo no tiene licencia de Gastos Menores (M-29).
- **Aprobación funcional de QA**: la corrida de QA está hecha y su evidencia es la de §6; la
  aprobación registrada en `../manifests/promocion-paquetes-main-20261113-approval.json` se apoya en
  la autorización expresa del propietario del 2026-11-13 y en esas mediciones, no en una sesión de
  terceros.
- **Aplicación de migraciones y despliegue**: 24 migraciones Prisma, el plan de cuentas estándar y la
  decisión sobre M-29. Requieren ventana y autorización independientes del dueño.
- **Exactitud del cálculo de nómina**: expresamente fuera de este certificado. El paquete 12 viaja por
  decisión del propietario, pero la auditoría del 2026-10-30 sigue **NO APTO** con sus 13 hallazgos
  abiertos y no hay reauditoría. Certificar que la pantalla carga no es certificar que el pago es
  correcto.
- **Regresión de datos en producción**: snapshot/PITR previo, conteo base de tablas de NYVORA y
  comparación posterior; se ejecuta en la ventana, no antes.

Veredicto: **APTO en local y en QA con NYVORA** (96 lecturas, 11 pantallas y la regresión transversal
en verde sobre `6589af8e1d32`). La publicación en `main` queda condicionada a la ventana autorizada:
resolver la migración colgada, aplicar las 24 migraciones con el backup ya verificado, desplegar y
repetir el smoke NYVORA de solo lectura en producción.
