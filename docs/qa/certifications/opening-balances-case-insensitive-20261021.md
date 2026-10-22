# Saldos iniciales: cuentas, sucursales y centros de costo sin distincion de mayusculas

Fecha: 2026-10-21
Rama de implementacion: `desarrollo`
Alcance: importacion de saldos iniciales historicos en Contabilidad.

## Cambio

La importacion de saldos iniciales ahora resuelve cuentas, sucursales y centros de costo asi:

1. Recorta espacios del valor de entrada (`trim`).
2. Busca primero una coincidencia exacta contra el codigo almacenado.
3. Solo si no existe coincidencia exacta, busca de forma insensible a mayusculas/minusculas
   (`ILIKE`/`mode: "insensitive"` en PostgreSQL para cuentas).
4. Si la busqueda insensible encuentra mas de un codigo almacenado, falla con
   `OPENING_BALANCE_AMBIGUOUS_CODE` (HTTP 422) en vez de elegir el primero.
5. Conserva la validacion de cuenta activa y transaccional, sucursal activa y centro activo
   perteneciente a la sucursal resuelta.
6. Persiste y agrupa usando los codigos canonicos almacenados (`account.code`, `branch.code`,
   `center.code`), no el texto original del Excel. Esto aplica a la vista previa, a las lineas
   de `cnt_cuedoc`, a la descripcion del asiento y a la clave de agrupacion.
7. La relacion sucursal-centro compara el `branch_code` almacenado contra el codigo canonico
   de la sucursal resuelta de forma exacta (solo `trim`). La sociedad almacenada se compara
   igual: exacta con `trim`. La insensibilidad a mayusculas aplica unicamente a la busqueda
   del codigo escrito en el Excel, nunca a la identidad de la relacion almacenada.

La busqueda de terceros por NIT permanece exacta y sin cambios. Tampoco se modifico
`normalizeCode` global, que sigue siendo solo `trim` para no alterar otros modulos.

## Archivos modificados

- `apps/api/src/modules/accounting/service.js`
- `apps/api/test/accounting-opening-balances.test.js`
- `scripts/certifications/opening-balances-nit-browser-local.js`
- `docs/qa/certifications/opening-balances-case-insensitive-20261021.md` (este archivo)

No se modificaron configuraciones, esquema Prisma, migraciones, UI web ni secretos.

## Pruebas unitarias

Comando:

```bash
node --test apps/api/test/accounting-opening-balances.test.js
```

Cobertura agregada:

- Coincidencia exacta de cuenta con prioridad sobre variantes de mayusculas.
- Fallback insensible con `mode: "insensitive"` y uso del codigo canonico almacenado.
- Ambiguedad de cuenta por mayusculas: falla 422 sin elegir la primera.
- Cuenta exacta inactiva o no transaccional: se rechaza sin caer a una variante activa.
- Sucursal/centro con entrada en minusculas o mixta: resuelve al codigo almacenado.
- Coincidencia exacta de sucursal con prioridad sobre otra variante.
- Ambiguedad de sucursal/centro: falla 422.
- Relacion almacenada exacta: sucursal `Bodega` no puede tomar un centro enlazado solo a
  la sucursal `BODEGA`, aunque el codigo del centro se escriba en minusculas.
- Sucursal `BODEGA` si resuelve su centro cuando la relacion almacenada coincide exactamente.
- Centro de costo ambiguo por mayusculas: falla 422.
- Sociedad almacenada distinta: el centro se rechaza.
- Persistencia y agrupacion con codigos canonicos.
- Guardia de regresion: `normalizeCode` global sigue siendo solo `trim`.

## Certificacion local real

El script existente de navegador/API local se extendio sin retirar ni debilitar comprobaciones.
Requiere PostgreSQL loopback migrado, API parcheada en `LOCAL_API_URL`, web parcheada en
`LOCAL_WEB_URL`, Google Chrome y `DATABASE_URL` exportado solo en la shell de ejecucion.

Comando desde la raiz:

```bash
node scripts/certifications/opening-balances-nit-browser-local.js
```

Salida por defecto:

```text
docs/qa/evidence/opening-balances-error-20261020/browser-local.json
```

Tambien se puede redirigir con `BROWSER_EVIDENCE_PATH`. No se deben commitear fixtures,
capturas ni evidencia generada.

Cobertura nueva de la certificacion:

- Sucursal alfabetica `NORTE` y centro `CC-ADMIN` creados via API real.
- Excel con `sucursal: nOrTe`, `centro_costo: cc-admin` y cuentas en minusculas.
- Vista previa API y UI mostrando y agrupando codigos canonicos `NORTE`, `CC-ADMIN`,
  `130505HEART`, `220505HEART`.
- Post real por UI, dialogo real y persistencia en `cnt_cabdoc`/`cnt_cuedoc`.
- Verificacion de `ledger_entry` balanceado y con periodo correcto.
- Guardia de duplicado: el mismo archivo no se contabiliza dos veces (409).
- Rechazo de cuenta inexistente, cuenta inactiva, sucursal inactiva, centro inexistente,
  centro inactivo y centro de otra sucursal.
- Rechazo de cuenta y sucursal de otro tenant.
- Rechazo de cuenta y sucursal ambiguas por mayusculas.
- Dos sucursales existentes que solo difieren en mayusculas (`Bodega` y `BODEGA`), con el
  centro `CC-BODEGA` enlazado unicamente a `BODEGA`. La entrada exacta `Bodega` se rechaza
  con `OPENING_BALANCE_COST_CENTER_NOT_FOUND`; la entrada exacta `BODEGA` valida y conserva
  los codigos canonicos.

## Estado de ejecucion

Verificacion root de la implementacion previa a esta correccion:

- 41 pruebas unitarias/regresion: aprobadas.
- Certificacion local real: 78 comprobaciones aprobadas.
- Evidencia: `docs/qa/evidence/opening-balances-case-insensitive-20261021/browser-local.json`.

Correccion actual (relacion almacenada exacta y regresiones nuevas):

- Re-ejecucion final por root: 44 pruebas unitarias y de regresion aprobadas, sin fallos.
- Certificacion final real de navegador, API y Prisma: 80 comprobaciones aprobadas, a las
  `2026-10-22T02:39:15.656Z`.
- Evidencia final: `docs/qa/evidence/opening-balances-case-insensitive-20261021/final/browser-local.json`.
- Los hashes del servicio y del script coinciden con los archivos finales revisados.
- La prueba incluye contabilizacion balanceada, codigos canonicos persistidos, duplicados,
  aislamiento entre empresas y rechazo de centros asociados a otra sucursal aun cuando los
  codigos de las sucursales solo difieran por mayusculas.
- El frontend no cambio; se uso la compilacion de produccion existente del mismo formulario.
- Cambio implementado en `desarrollo`; sin commit, push, promocion, migraciones ni despliegue
  remoto de este ajuste. Una futura publicacion requiere sus manifiestos y gates propios.
