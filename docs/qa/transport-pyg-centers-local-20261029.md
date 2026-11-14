# PYG por centro de costo (vista Por CC) — certificación local

## Alcance

Se agregó al PYG por vehículo una tercera vista, **Por CC**, que replica la hoja `TODOSCC` del PYG corporativo: los centros de costo en las columnas y la misma estructura de conceptos del PYG en las filas. Cada centro expone cuatro métricas por concepto: presupuesto, ejecutado, % del ingreso propio y cumplimiento presupuestal.

- `apps/api/src/modules/transport-pyg/account-engine.js` agrega `buildCenterBuckets` y publica `report.centers[]` más `data_status.centers_count`; los importes siguen saliendo del libro (asientos publicados), no se recalculan en el cliente.
- `apps/web/components/accounting/PygCentersMatrix.tsx` renderiza la matriz con la columna Concepto fija y encabezados agrupados (`colSpan=4`).
- `apps/web/app/dashboard/contabilidad/pyg/page.tsx` agrega la pestaña `Por CC` y la hoja **Matriz CC** del Excel (cuatro columnas por centro).
- La matriz lleva `data-table-layout="detail"` para excluirse del configurador global de columnas (`StandardTableExperience`), que indexa columnas por la primera fila de encabezados y con `colSpan` ocultaba las métricas desde la quinta columna. Las tablas operativas conservan el configurador.

## Evidencia

- `node scripts/certifications/transport-pyg-centers-browser-local.js` con API y web locales reales, Chrome real, Prisma real y sin mocks: **42/42 comprobaciones aprobadas**, finalizado `2026-10-29T14:31:57.204Z`. Evidencia en `docs/qa/evidence/transport-pyg-centers-20261029/browser-local.json`, con SHA256 de motor, rutas, página, matriz, lecturas compartidas, opt-out, pruebas y script; todos coinciden con los archivos actuales.
- Capturas locales, fuera de los commits: `pyg-centers-matrix-6f9dfcc06c.png`, `pyg-centers-page-6f9dfcc06c.png` y `pyg-centers-narrow-6f9dfcc06c.png` (390×844).
- La certificación registra dos tenants aislados por API, crea la estructura SOC-CC/SUC-CC con CC-ALFA, CC-BETA y CC-GAMMA, publica asientos y presupuestos del periodo 2026-08 y verifica:
  - tres centros en el reporte, reconciliación contra el libro con diferencia `$0` y utilidad neta `$21.000.000`;
  - suma de centros igual al consolidado en INGRESOS, GASTOS DE PERSONAL, COMBUSTIBLE, PEAJES, MANTENIMIENTO VEHICULO y UTILIDAD NETA;
  - aislamiento entre tenants (el segundo tenant no ve centros ni movimientos);
  - matriz con 12 columnas de métricas visibles, sin celdas ocultas ni de ancho cero, 26 filas iguales a los conceptos del consolidado y columna Concepto fija;
  - valores por centro, incluido GAMMA con presupuesto `—` en ingresos y utilidad negativa en rojo;
  - Excel descargado (`pyg-transporte-2026-08.xlsx`) con hojas `Consolidado`, `Matriz placas` y `Matriz CC`, título y las 12 etiquetas de centro;
  - sin errores de página ni peticiones API fallidas durante la navegación.

## Pruebas automatizadas

- Web PYG: **98/98** (`transport-pyg-centers-matrix`, `accounting-pyg-interactive`, `pyg-expanded*`, `transport-pyg-account-config*`, `transport-pyg-vehicle-page`), sin fallos ni omisiones. Se conserva la aserción que exige `data-table-layout="detail"` en la matriz y el opt-out existente en `StandardTableExperience`.
- Backend PYG: **62/62** (`transport-pyg-centers-matrix`, `transport-pyg-report`, `transport-pyg-account-ranges`), sin fallos ni omisiones.
- Build de producción y TypeScript aprobados con `next build --webpack`, distribución `.next-pyg-combined-20261029`. Once archivos web modificados coinciden por SHA-256 con sus fuentes compiladas. La certificación de navegador se ejecutó en la web local de desarrollo con las fuentes actuales.
- ESLint de los componentes y auxiliares del cambio: cero errores y advertencias.

## Correcciones tras revisión independiente

Los centros se identifican por la tupla código + sucursal. Si un vehículo pertenece a B1 y solo existen movimientos del centro homónimo en B2, se conserva B2 sin rotularlo con ese vehículo y se agrega la columna B1 en cero. Dos vehículos con el mismo código de centro en sucursales diferentes conservan columnas independientes. Las pruebas también verifican conciliación de sus importes.

El porcentaje de los ingresos configurados y sin clasificar usa el ingreso total propio del centro. Caso certificado por regresión: $1.000.000 configurados + $200.000 sin clasificar producen 83,33% y 16,67%, con subtotal 100%; el denominador cero conserva porcentajes vacíos. No cambia la semántica de la vista normal por vehículo ni el consolidado.

La sucursal aparece como subtítulo en pantalla y en las etiquetas de la hoja Matriz CC. El auxiliar real `apps/web/lib/pyg-center-labels.mjs` es compartido por ambos usos y sus pruebas; SHA-256 `2e4c708c8a483b052dfa4622f27908b64d813ceb593ca1d3b1f9cc547df99842`. El nuevo check de navegador exige el nombre real de sucursal en cada encabezado, y la descarga se contrasta con las etiquetas completas.

SHA-256 del artefacto aprobado: `03a37e74b0dc04f316f6b46efaefa3e5fe5516fdac5bca9d96fce84ecdeef35b`.

SHA-256 del guion: `b666c8b5d596affc8bf17df85560babf68c24b16d0ad81770623be0817ccc129`.

La revisión independiente reprodujo y confirmó corregidos los tres hallazgos: asociación entre sucursales, porcentajes de ingreso propio y etiquetas de sucursal. La ventana ampliada pasó adicionalmente sus 97 comprobaciones integrales en `docs/qa/certifications/transport-pyg-window-20261029.md`.

## Entorno y efectos secundarios

- API local en `http://127.0.0.1:3000` con `DATABASE_URL` al PostgreSQL de docker (`127.0.0.1:55432/apexos`) y `DISABLE_REDIS=1`; web en `http://127.0.0.1:3001`.
- `prisma db push` abortó por sí mismo (`--accept-data-loss`) porque el esquema del repo eliminaría 11 tablas `th_*` con datos. No se aplicó ningún cambio destructivo: las cuatro tablas `transport_pyg_*` se crearon con DDL aditivo (`CREATE TABLE IF NOT EXISTS` + índices + FK).
- El registro de tenants depende de `apexos_accounting_private.ensure_standard_chart`; la migración de Supabase se aplicó localmente de forma transaccional (esquema, tabla, funciones y trigger). El backfill agregó el plan estándar a los tenants existentes (inserts aditivos e idempotentes).
- Cada corrida de la certificación deja dos tenants de QA en la base local; `/auth/register` limita a cinco registros por hora por IP (contador en memoria al desactivar Redis).
- La preparación del esquema anterior corresponde al entorno local existente de Qoder; esta recertificación no aplicó migraciones ni alteraciones de esquema. Un intento venció al registrar la empresa de prueba (transacción local de 5 segundos) y otro encontró el límite de registros por hora; después de reiniciar la API local se repitió el recorrido completo con resultado aprobado. No se modificó la autenticación ni se relajaron sus límites.
- El trabajo permanece en `desarrollo`, sin cambios en Railway ni Supabase remotos. JSON, capturas y registros se conservan localmente. La publicación del conjunto requiere manifiestos pre-QA y de alcance exacto contra el destino vigente, dentro del flujo `desarrollo -> develop -> main`; esta evidencia no autoriza producción ni acredita una prueba funcional autenticada en QA.
