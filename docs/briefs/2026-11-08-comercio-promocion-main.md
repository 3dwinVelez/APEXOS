# Brief 2026-11-08 — Comercio (M-30): promoción completa a `main`, exclusivamente el módulo

## Origen

Ronda 8 del módulo Comercio. Instrucción vigente del dueño, literal:

> como el modulo fue exitoso en el ambiente de develop, vamos a proceder a enviar el modulo completo de comercio hacia el main de manera controlada sin afectar ninguna otra funcion de la herramienta solo se debe migrar exclusivamente el modulo de comercio nada mas

Y su acotación de cierre, también vigente: *solo terminar las tareas referentes a migrar el módulo de Comercio, sin tocar nada más.*

## Detonante

`origin/develop` ya servía el módulo certificado (`2cb064e2`, pre-QA en verde, 79/48/33 en QA). `origin/main` estaba en `938fc2b6` y **no contenía Comercio**: ni las 15 tablas, ni el catálogo de plataforma, ni el bucket, ni las rutas del API. Un merge de rama completa de `develop` a `main` habría arrastrado todo lo ajeno (Transporte, caja menor, facturas recibidas, torre, nómina) y está explícitamente prohibido por `AGENTS.md`.

## Decisiones del dueño (cuatro, todas «Recomendado»)

1. **Mecanismo: commits puntuales + push a `main`.** Reconstruir el candidato exclusivamente Comercio sobre `origin/main` en una rama auxiliar `codex/qa-comercio-main-20261108`, validar las dos puertas y hacer `git push origin HEAD:main` con `APEXOS_PROMOTION_AUTH=AUTORIZO_PROMOVER_DEVELOP_A_MAIN`. No se abre PR de la rama auxiliar a `main`: `.github/workflows/ci-promotion.yml` exige `github.base_ref == 'develop'`, así que un PR a `main` se ejecutaría en modo `ci` y fallaría por la forma, no por el contenido. Precedentes del mismo mecanismo: `f4aff8e3` y `938fc2b6`.
2. **Esquema en producción: solo el DDL de Comercio + registro en el ledger.** Se aplican a mano las 6 migraciones Prisma del módulo y se registran en `_prisma_migrations`; la deuda de migraciones no-Comercio queda exactamente como estaba.
3. **Compuerta funcional: NYVORA habilitada en QA, y certificar ahí.** La certificación end-to-end de producto se ejecutó contra el ambiente QA desplegado, no contra un árbol local.
4. **Activos: bucket sí, fotos de demo no.** Se crea `comercio-assets` en producción con sus topes; las 131 JPG de la semilla demo quedan fuera del candidato productivo.

## Qué se hizo

| # | Cambio | Archivo / referencia |
|---|---|---|
| 1 | Inventario hunk por hunk del módulo en los archivos compartidos, con la prueba de que el comportamiento no-Comercio de `main` no cambia | `docs/qa/certifications/comercio-main-20261108.md` |
| 2 | Candidato exclusivamente Comercio reconstruido sobre `938fc2b6` | `1a8b4a75` (rama auxiliar `codex/qa-comercio-main-20261108`) |
| 3 | Manifiestos de alcance y de aprobación QA versionados dentro del candidato | `docs/qa/evidence/comercio-main-20261108/main-scope-manifest.json`, `…/qa-approval-evidence.json` (`cd35ecf7`) |
| 4 | Evidencia de gates y de rojos previos del target | `…/gates-candidato.txt`, `…/baseline-reds-main-938fc2b6.txt` (`1b76376c`) |
| 5 | Push a `main` con la autorización de promoción; `main` quedó en `1b76376c` | `git push origin HEAD:main` |
| 6 | DDL de Comercio aplicado en producción por pooler de sesión y registrado en el ledger con checksum normalizado a LF | 6 migraciones + 15 tablas; ver `prod-post-deploy.json` |
| 7 | Migración de catálogo `20261107120000_comercio_module_catalog.sql` aplicada en producción (fila `comercio` en `public.modules`) | catálogo de plataforma |
| 8 | Bucket `comercio-assets` creado en producción con lectura anónima y los topes del módulo | `public=true`, 5 MiB, `png/jpeg/webp` |
| 9 | Gate post-despliegue versionada y ejecutable por ambiente | `scripts/audit-comercio-postdeploy.js`, `npm run audit:comercio:postdeploy:prod`, `npm run audit:comercio:postdeploy:qa` |
| 10 | Defecto real corregido: `ensure-comercio-assets-bucket.js` abortaba ante el `400 NoSuchBucket` de Supabase porque solo reconocía el `404` | `scripts/ensure-comercio-assets-bucket.js` + `apps/api/test/comercio-bucket-provisioning.test.js` |

## Criterios de aceptación y medida

| Criterio | Medida (contra el target remoto vigente, no contra el baseline local) |
|---|---|
| El diff neto es exactamente el inventario | `git diff --name-status 938fc2b6..origin/main` → **66 `A` / 20 `M` / 0 `D`** = 86 rutas del manifiesto; `+27.965 / -42` líneas |
| Ninguna ruta ajena se borró | `allowed_deletions: []` y 0 `D` en el diff neto; las 42 líneas que salen son líneas únicas de 12 archivos compartidos, justificadas hunk por hunk |
| Nada de otros módulos entró de contrabando | `schema.prisma`: 368 inserciones, 0 borrados, 15 modelos `Comercio*`; el modelo de facturas recibidas que viajaba en el árbol de `develop` quedó fuera |
| Puerta de alcance | `ALCANCE DE PROMOCION VALIDO: comercio-main-20261108 (86 rutas)` |
| Puerta de aprobación QA | `APROBACION QA VALIDA: comercio-main-20261108` |
| Suites del candidato | API 494 pruebas: 490 pasan, 2 fallan, 2 saltadas · Web 438: 437 pasan, 1 falla |
| Los 3 rojos no los causó el candidato | reproducidos con el mismo nombre sobre `938fc2b6` limpio (`baseline-reds-main-938fc2b6.txt`); regresión atribuible: **cero** |
| Build y tipos | `typecheck` exit 0 · `next build` exit 0 con las 11 rutas de Comercio y `/tienda/[code]` · `prisma validate` exit 0 |
| Certificación end-to-end del módulo | QA desplegada: 79/79 API+flujos, 48/48 NYVORA, 33/33 navegador, sobre el commit desplegado `2cb064e2a896` |
| Producción alineada con lo desplegado | 15 tablas `comercio%` · 6 migraciones en `_prisma_migrations` con `finished_at` · `comercio` publicado (`is_active=true`, `/dashboard/comercio`, `visibility_scope=tenant`) |
| Producción sirve el módulo | `/health` → `commit=1b76376c0c37` · ruta protegida sin token → **401 `TOKEN_INVALIDO`** · vitrina pública → **404 `CATALOG_NOT_FOUND`** (llegó a la tabla; sin DDL sería 500 `P2022`) |
| Gate post-despliegue | `audit:comercio:postdeploy:prod` **9/9 en verde** · la misma gate `audit:comercio:postdeploy:qa` **9/9 en verde** |
| Prueba de la corrección del bucket | `node --test apps/api/test/comercio-bucket-provisioning.test.js` → 2/2: el `400 NoSuchBucket` cuenta como ausente; `200`, `401` y un `400` de otra causa no |

## La convención de ledger que hizo segura la escritura en producción

- El `checksum` que Prisma compara es el **SHA-256 del `migration.sql` normalizado a LF**, no el del archivo en el árbol de trabajo con CRLF. Medido: el hash del blob de git coincide con el `checksum` ya registrado en QA para las 6 migraciones; la hipótesis del hash de disco (CRLF) falló en las 6.
- `_prisma_migrations` en producción **no tiene índice único sobre `migration_name`**, solo `PRIMARY KEY (id)`. Por eso la inserción se precede de una comprobación de existencia y se fija `applied_steps_count = 1`, `logs = NULL`, `id = gen_random_uuid()::text`.
- Las migraciones de catálogo under `supabase/migrations/` **no** se registran en el ledger Prisma; así está en QA y así se replicó.
- `prisma migrate deploy` se descartó a conciencia: producción tiene migraciones pendientes de otros módulos y el comando las habría aplicado, violando «solo Comercio».
- Todo script de escritura declaró el guard del project ref (`jzbwzmkidfthknsohhnr`) antes de abrir conexión.

## Deudas y hallazgos que este cierre deja escritos

1. **No hay certificación funcional en producción.** Las dos empresas reales (`IMPORTADORA SCJ SAS`, `NYVORA`) tienen `comercio` con `enabled=false`. Habilitar un módulo en un tenant productivo es decisión del dueño; sin esa autorización la recertificación end-to-end queda pendiente y se reporta como pendiente, no como resuelta. Lo que sí se verificó es el despliegue y el esquema (9/9).
2. **El selector de Comercio en producción es `components/ui/SearchSelect`, no `components/transport/TransportSearchSelect`.** `desarrollo` hizo ese rename (`49dc0a2c`, `aa06c5a0`) después de cortado el candidato, y `develop`/`main` siguen con la versión certificada en QA. La próxima promoción `desarrollo → develop` debe llevar el rename con su `D` explícito en `allowed_deletions`; no es un defecto de esta promoción, es una diferencia de árbol medida (3 rutas de Comercio distintas entre `1a8b4a75` y `desarrollo`).
3. **Deuda de esquema no-Comercio en producción, intacta a propósito.** `audit:production:schema` contra el árbol desplegado (`1b76376c`, 166 modelos) devuelve 8 tablas faltantes, todas `TransportSettlement*`, y 0 columnas faltantes. El mismo guard contra el esquema de `desarrollo` (191 modelos) marca 34 tablas y 5 columnas: es cuánto va `desarrollo` por delante de producción, no una falla de esta promoción.
4. **`ensure-comercio-assets-bucket.js` tenía un falso bloqueo.** Supabase responde un bucket inexistente con `400` y `code: "NoSuchBucket"`; el script solo miraba `404` y abortaba con `GET bucket -> 400`. Se corrigió y se fijó con prueba unitaria; en su momento obligó a crear el bucket por otro camino, con el mismo payload.
5. **`/health` reporta 18 módulos en producción y 19 en QA.** Diferencia de catálogo entre ambientes, no del módulo Comercio (cuya fila existe y está activa en ambos).
6. **Las 131 fotos de la semilla demo no subieron a producción.** Decisión 4. La vitrina funciona sin ellas; el banner propio se sube por el bucket ya habilitado.

## Fuera de alcance

Cualquier otro módulo; force push; reescritura de historia compartida; `develop` (no se tocó); Railway/Vercel (no se modificó infraestructura ni secretos); la torre de control; las migraciones pendientes de Transporte; habilitar el módulo en una empresa productiva.

## Autorizaciones pendientes

1. **Habilitar `comercio` en una empresa de producción** (o confirmar que ningún tenant debe verlo todavía) para poder correr la recertificación funcional end-to-end en PROD.
2. **Decisión sobre la rama auxiliar `codex/qa-comercio-main-20261108` y su worktree**: borrarla o conservarla como respaldo. Ninguna rama se elimina sin orden expresa.
3. Rollback disponible sin autorización nueva: `controlled_revert` del par de commits documentales y del comite funcional sobre `938fc2b6`, conservando las tablas `comercio_*` y la fila del catálogo para no destruir datos de tenant.
