# PR hacia `develop` — listo para pegar

**Base:** `develop` (`22fdf222`) ← **Head:** `codex/qa-comercio-develop-20261107`
**Crear en:** https://github.com/3dwinVelez/APEXOS/compare/develop...codex/qa-comercio-develop-20261107?expand=1

El sha del comité certificado y el del comité de manifiestos quedan estampados en
`docs/qa/manifests/comercio-modulo-completo-20261107-scope.json` (`certified_commit`). Aquí no se repiten a
propósito: este archivo viaja dentro del comité certificado y un archivo no puede contener el sha del comité que
lo contiene.

## Título

    Promoción controlada del módulo Comercio a develop (210 A / 22 M, 0 borrados)

## Cuerpo

~~~~markdown
## Por qué esta rama y no `desarrollo`

La puerta `Git Governance Guard` de la CI solo admite un PR a `develop` desde `desarrollo`, y un PR desde `desarrollo` arrastraría la torre de control (`apex-control` / `control-tower`), el buzón de correo y facturas recibidas — expresamente fuera de este alcance. El repositorio ya tiene la ruta alterna para promociones acotadas: una rama `codex/qa-*` hace que el guard valide los manifiestos contra el candidato (`node scripts/git-governance-guard.js ci-promotion`) en vez de mirar el flujo de ramas. Es la misma forma por la que entraron las promociones anteriores; `origin` conserva diez de esas ramas, entre ellas `codex/qa-hr-employee-user-link-20261104` (la promoción #81 que hoy es la base de este PR) y `codex/qa-pyg-window-centers-20261029`.

Este PR reemplaza al #80 y al #82. El árbol de producto es idéntico en los tres (medido por hash de blob: 0 diferencias), pero ninguno de los dos pasaba la puerta: el #80 porque `develop` avanzó debajo de su línea base, el #82 porque su rama auxiliar no tenía la forma que la CI de una rama auxiliar valida.

## Por qué el candidato se reconstruyó

`develop` avanzó de `21ef1a6f` a `22fdf222` (merge #81: nómina-marcaciones, 9 rutas nuevas de RRHH) mientras se cerraba la ronda anterior. El candidato viejo montaba sobre la línea base anterior, así que su diff contra el target vigente marcaba esas 9 rutas como **borrados**: el gate de alcance las habría rechazado y un merge descuidado las habría revertido. Se reconstruyó el cambio neto sobre la base vigente en lugar de forzar el historial (no hay autorización de force push). Medido por hash de blob, inmune al ruido CRLF del checkout:

    $ for p in $(git diff --name-only 21ef1a6f..22fdf222); do rev-parse HEAD:$p vs 22fdf222:$p; done
    IGUAL × 9      # las 9 rutas de la promoción #81 quedan byte a byte como están en develop

## Qué entra

El módulo Comercio completo: vitrina pública tematizable por tenant (colores, banner, tonos, patrón, esquinas, textos y catálogo curado), mostrador con descuentos y cuotas, cartera, compras con costo promedio ponderado, gastos de caja, promociones por segmento y vigencia, reportes con gráficos, y su pasada UX medida en Chromium.

`origin/develop` no contenía ni una ruta del módulo, así que **esto no es un merge de `desarrollo`**. Los comités de la torre de control, del buzón de correo y de facturas recibidas **no** están aquí, tampoco `agents/`, `.qoder/skills`, gobernanza ni briefs.

## Inventario

| | |
|---|---|
| Neto contra `develop` | 210 `A` / 22 `M` / **0 `D`** (232 rutas) |
| Baseline | `origin/develop` = `22fdf222` |
| Commits sobre el baseline | 2: el certificado (producto + evidencia) y los dos manifiestos |
| Producto | 201 rutas: 173 con `comercio`/`tienda` en el path + 28 compartidas (plumbing, contratos y middleware) |
| Evidencia versionada | 29 archivos que los manifiestos referencian (la CI los exige dentro del candidato) |
| Manifiestos | `comercio-modulo-completo-20261107-scope.json` (v2) y `…-preqa.json` |

**Auditoría bidireccional** (la ronda 6 perdió un archivo por cotejar en una sola dirección):

    comm -23 <(ls-tree certificado | grep -i comercio) <(ls-tree candidato | grep -i comercio)  → vacío
    comm -13 …                                                                                 → vacío
    HEAD:<p> vs el tip del candidato anterior, por las 201 rutas de producto                    → 0 diferencias
    git diff --name-status desarrollo HEAD -- apps scripts | grep -iE 'comercio|tienda'         → vacío

## Puertas ejecutadas sobre el propio candidato

- `node scripts/git-governance-guard.js ci-promotion HEAD origin/develop develop codex/qa-comercio-develop-20261107` → `PROMOCION CI ALCANZADA: comercio-modulo-completo-20261107`
- `npm run qa:promotion:scope -- <scope.json> <candidato> origin/develop` → `ALCANCE DE PROMOCION VALIDO` (corre dentro del guard)
- `npm run qa:preqa:evidence -- <preqa.json>` → `AUTORIZACION PRE-QA VALIDA: comercio-modulo-completo-20261107` (corre dentro del guard)
- `node scripts/certifications/scoped-qa-governance-local.js` → `passed`, 20 checks, 0 fallidos (el paso que la CI corre para estas ramas)
- `prisma validate` → schema válido · `governance:ci` → exit 0
- Aislamiento multi-tenant y RBAC: **53/53**, `LIMPIEZA {"empresas":4,"residuales":[]}`, con el commit estampado en la evidencia
- Suite API completa: **1050 pruebas, 1048 pasan, 0 fallan, 2 saltadas**
- API Comercio: **69/69** · contratos de fuente Comercio: **49/49**
- Suite web completa: **749 pruebas, 746 verdes**, 3 rojos del destino (abajo)
- Typecheck: 0 errores · lint: 0 errores / 22 avisos preexistentes
- **Certificaciones de navegador corridas sobre este candidato** en un stack aislado (API `3310`, web `3311`): vitrina tematizada **78 checks, 0 fallidos** y pasada UX **287 checks, 0 fallidos**
- Gates de agentes en `desarrollo`: `agents:sync`, `agents:check`, `test:agents` 42/42, `agents:preflight`, `agents:coverage` → verde

## Un toque cross-module declarado

`apps/api/test/hr-payroll-adjustment-lock.test.js` buscaba el contrato del 503 con la regex `if (error.statusCode === 503 && error.code) {` dentro de `server.js`. Ese bloque se mudó a `apps/api/src/core/api-error.js` con el fix del banner del Comercio (`70bc7338`) y **la prueba estaba en rojo en `desarrollo` desde entonces**; también lo está en el candidato. Se reubica la aserción: lee la tabla donde vive y exige el `require` en `server.js`. El contrato no cambia; cambia dónde se mide. Verde 3/3.

## Los 3 rojos web son de `develop`, no de este PR

Reproducidos sobre `origin/develop` limpio extraído con `git archive` (`# tests 19 / pass 16 / fail 3`):

- `hr-route-write-fallback.test.mjs` (2): contrato de fuente que exige `if (supabaseSession && !shouldBlockHrWriteFallback(path, method))` mientras `api.ts` de `develop` ya añadió `&& !scheduleMonitorUsesOperationalSource(path, method)`. Ambos archivos viajan byte a byte como en `develop` (`git diff origin/develop HEAD -- <esos dos>` = 0 líneas).
- `command-palette-module-functions.test.mjs` (1): `/dashboard/contabilidad/pyg/ampliado` no está registrado en la paleta de `develop`.

Arreglarlos es alcance de Contabilidad/Talento Humano y quedó deliberadamente fuera. Nota de arnés: las pruebas de `apps/web` resuelven rutas contra `process.cwd()`; hay que correrlas desde `apps/web` (desde la raíz aparecen 4 falsos rojos en `ibc-nomina-ui.test.mjs`, que miden 4/4 en verde).

## Riesgo compartido que sí deben mirar

9 de los 22 archivos compartidos son componentes y middleware que usan **otros** módulos: `TransportSearchSelect` (Transporte), `button`, `ModalFrame`, `data-table`, `CommandPalette`, `ContextBreadcrumbs`, `globals.css`, el middleware `rbac`/`prisma` y `core/api-error.js` (que reemplaza el manejador de error inline de `server.js` conservando P2002→409, P2025→404, 4xx con `details`, 502/503/504 con código, 400, 429 y 500, y ampliando 502/504). La red de seguridad es la suite completa de `develop` corriendo sobre el candidato: cero fallos nuevos, y las dos certificaciones de navegador del candidato cubriendo la pintura real.

## Límites declarados (esto no está certificado aquí)

1. **Migraciones.** Las seis (`20261026120000` … `20261028190000`) no se aplicaron en ninguna nube: por decisión del dueño las aplica Railway al hacer el merge.
2. **Bucket `comercio-assets`** en el Supabase de QA: el alta idempotente y con guardas queda versionada en `scripts/ensure-comercio-assets-bucket.js` (exige `SUPABASE_URL` + service role y `CONFIRM_COMERCIO_BUCKET=true`, no imprime la clave), pero ejecutarla contra la nube requiere la sesión del dueño. En local la subida real del banner **sí** está certificada (driver MinIO, dentro de los 78 checks).
3. **Regresión visual en QA** de Transporte, tablas, modales y paleta: la fuente pasa, la pintura en el ambiente QA no se midió aquí.
4. `qa:deterministic-validation` aborta en `POST /api/v1/accounting/chart/init` por `schema "apexos_accounting_private" does not exist` en la base local: límite del ambiente, sin rutas de Comercio involucradas.
5. Las salidas de suite viajan como `*-salida.txt`, no como `.log`: la convención del repositorio deja `*.log` fuera del control de versiones (`.gitignore:17`).
6. La evidencia de navegador y de RBAC está estampada con el sha del candidato predecesor (`b676ebad`), no con el de este comité, porque un archivo no puede llevar el sha del comité que lo contiene. Las 201 rutas de producto están byte a byte idénticas (hash de blob, 0 diferencias) y el sha final queda en los manifiestos, que viajan encima del comité certificado.
~~~~

## Autorización registrada

El dueño autorizó: promover solo el módulo Comercio a `develop` de manera controlada, por rama auxiliar + PR, con las migraciones aplicadas por Railway al merged, y tras cerrar la brecha de aislamiento multi-tenant y RBAC; y "terminar de validar lo que haga falta… sin detenerse salvo algo muy crítico que requiera autorización". Queda fuera de esa autorización: `main`, force push, migraciones remotas aplicadas desde esta estación, secretos e infraestructura.
