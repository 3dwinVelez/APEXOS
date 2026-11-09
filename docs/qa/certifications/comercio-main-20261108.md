# Certificacion del modulo Comercio (M-30) — variante `main` — 2026-11-08

Cambio: `comercio-main-20261108`
Promocion certificada: `develop -> main` (candidato reconstruido, sin merge de rama).
Baseline productivo: `938fc2b6f42c...` (tip vigente de `origin/main` al momento del despacho).
Commit funcional certificado: `1a8b4a75` — exclusivamente M-30 sobre ese baseline.
Evidencia cruda: `../evidence/comercio-main-20261108/`.

Esta hoja certifica **la variante que corre en main**. El modulo completo esta certificado contra
el ambiente QA desplegado de `develop` (`docs/qa/certifications/` de esas ramas); la diferencia no
es un hueco de esta rama: son funcionalidades que en main todavia no existen (ver "Que NO hay").

## Novedad que se libera

Comercio (M-30) es una herramienta autonoma para tiendas y pequenos comercios que convive con el
ERP sin mezclarse con el: 15 modelos `comercio_*`, punto de venta, credito con cuotas, cartera,
compras de mercancia, gastos de caja, promociones, vitrina publica por codigo y tematizacion por
tenant. Sus tablas no tienen FK hacia modelos de otros modulos y el aislamiento lo aplica
`core/prisma.js` con `runWithTenant`.

## Que NO existe en main y como se demostro en vez de suponerse

El commit de `develop` traia pegado trabajo de otros modulos. Nada de eso entra en este candidato:

| Pieza del commit de develop | Decision | Prueba |
| --- | --- | --- |
| `PettyCash*` (Gastos Menores), `InventoryAdjustment*`, `TransportPlan` | excluidas de `TENANT_MODELS`, `SOFT_DELETE` y `PHYSICAL_DELETE_ALLOWED` | `git diff origin/main -- apps/api/src/core/prisma.js` solo anade lineas `Comercio*` |
| 8 modelos `ReceivedInvoice*` / `Invoice*` en `schema.prisma` | excluidos | el hunk de schema queda en 15 modelos `Comercio*` y 0 eliminaciones |
| `apps/api/test/hr-payroll-adjustment-lock.test.js` | no se puerto | certifica `createPayrollAdjustment`, que no esta en el arbol de main (precedente: `hr-contention-p2028-20261026.md` en `docs/qa/certifications/` de esta misma rama) |
| `apps/web/components/transport/TransportSearchSelect.tsx` | sustituido | en main no existe ese archivo; Comercio usa su propia copia en `apps/web/components/ui/SearchSelect.tsx`, misma implementacion y mismo contrato de foco |
| 131 JPG de demo en `apps/web/public/comercio/**` y los seeders `seed:comercio-demo` / `seed:comercio-photos` | excluidos | el almacen real de fotos y banners es el bucket `comercio-assets`; los certificadores locales que dependen de datos falsos (`comercio-ux-local.js`, `comercio-storefront-theme-local.js`) tampoco se puerto para no dejar scripts rotos |
| Evidencia de las rondas `20261106` / `20261107` | excluida | se conserva solo la ronda `comercio-main-20261108`, que es la que sustentan los manifiestos |

## Hunks compartidos que Comercio si necesita

Se llevaron unicamente los que el codigo de Comercio consume, verificados uno por uno:

- `apps/api/src/core/api-error.js` + su prueba: el upload de banner/foto declara 502
  `ALMACEN_NO_RESPONDE` / `ALMACEN_RECHAZO`. Main solo traducia 503 con codigo, asi que el comercio
  con el almacen caido leia "Error interno". El resto de main conserva el mismo resultado: los dos
  unicos 502 que existen en la rama (`services/evidenceUploads.js`,
  `security/supabaseAdminCredentials.js`) no declaran `code`, y por la rama de la tabla caen igual
  que antes al 500 generico con log.
- `apps/api/server.js`: registra `comercio` y el scope aparte `comercio-public`.
- `apps/api/src/core/prisma.js`, `middleware/rbac.js`, `modules/admin/service.js`: alta de los
  modelos, el permiso `comercio` y el codigo de modulo M-30.
- `apps/web/app/globals.css` + `tailwind.config.ts`: tintas semanticas de texto (`*-ink`) que las
  pantallas de Comercio pintan en los dos temas, la animacion de backdrop y la clase `.apex-select`
  (el popup nativo lo pinta el SO y salia blanco sobre tema oscuro). Ningun otro componente de main
  usa `.apex-select`.
- `apps/web/components/ui/`: `SearchField.tsx`, `SearchSelect.tsx`, `useOverlayA11y.ts`,
  `buttonClasses` en `button.tsx`, `scope="col"` en `data-table.tsx` y la animacion en `ModalFrame.tsx`.
- `apps/web/components/system/CommandPalette.tsx`: Escape solo actua cuando el palette esta abierto.
  Cerrado, se robaba el foco de cualquier dialogo que el usuario acababa de cerrar con Escape.
- `apps/web/lib/security/csp.ts` + `next.config.ts` + su prueba: `img-src` acepta el almacen local
  **solo** en `NODE_ENV=development`, solo loopback y sin credenciales; en produccion la politica
  queda exactament igual que antes.
- `apps/web/lib/modules.ts`, `moduleAccess.ts`, `moduleFunctions.ts`,
  `ContextBreadcrumbs.tsx`: alta de M-30 en el catalogo, los permisos y la paleta de comandos.

## Certificaciones en el ambiente QA (compuerta antes de promover)

Ejecutadas contra el commit desplegado `2cb064e2a896` de `develop`, con NYVORA habilitada:

| Arnes | Comprobaciones | Veredicto |
| --- | --- | --- |
| `scripts/certifications/comercio-develop-remote.js` (flujo E2E del modulo) | 79 | passed |
| `scripts/certifications/comercio-nyvora-qa.js` (empresa modelo NYVORA) | 48 | passed |
| `scripts/certifications/comercio-qa-browser.js` (navegador real sobre el deploy) | 33 | passed |
| `scripts/certifications/platform-regression-qa.js` (regresion de plataforma) | — | passed |

La certificacion de navegador es la que cierra la duda de la compuerta: el menu muestra Comercio
para la empresa piloto, las 11 rutas del panel pintan su encabezado real, la vitrina respeta el
tema del tenant con la tinta exacta y su contraste, la foto del producto se carga desde el bucket,
movil no desborda, una sesion anonima no ve ni un dato del tenant y explica el bloqueo, y al
terminar no queda residuo en las 15 tablas `comercio_*`, ni en el bucket, ni en `User`/`Role`.

## Gates y suites sobre el candidato

- Suites de API y web del arbol candidato: ver `../evidence/comercio-main-20261108/` (salidas TAP).
- `npm run qa:promotion:scope -- docs/qa/evidence/comercio-main-20261108/main-scope-manifest.json HEAD origin/main`
- `npm run qa:approval:evidence -- docs/qa/evidence/comercio-main-20261108/qa-approval-evidence.json`

## Fuera del alcance de esta certificacion

- El DDL de Comercio en la base productiva y su registro en `_prisma_migrations` (7 migraciones
  propias + la fila de catalogo M-30) se aplican con autorizacion expresa de migracion remota.
- El bucket `comercio-assets` y sus politicas en el proyecto productivo.
- La verificacion post-despliegue en produccion: los mismos dos certificadores de QA se ejecutan
  contra el ambiente productivo apenas Railway publique el build de main; hasta entonces el veredicto
  de produccion es **pendiente**, no inferido.
