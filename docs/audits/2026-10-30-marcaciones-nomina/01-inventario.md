# Inventario — Marcaciones y Nómina

| Campo | Valor |
|---|---|
| Fecha | 2026-10-30 |
| Rama | `desarrollo` |
| Commit | `e25e177f8954d1c2c846046fade1275ebbeb6b21` |
| Uso | Insumo de F1/F2; no es un inventario funcional completo del ERP |
| Modo | Solo lectura |

## 1. Superficie de API

El archivo `apps/api/src/modules/hr/routes.js` registra **195 rutas**. Las familias relevantes para esta auditoría:

| Familia | Rutas | Ejemplos |
|---|---|---|
| `/hr/payroll` | 34 | validar, preview, liquidaciones, ajustes, aportes, cierres, provisiones, retiro, libranzas |
| `/talento-humano/nomina` | 16 | alias de nómina, ajustes, jornadas externas, reportes |
| `/hr/self` | 10 | rutas propias, asistencia, GPS, marcación, actividades, preoperacional |
| `/hr/routes` | 12 | mallas, asignaciones, eventos, borrado físico |
| `/hr/labor-configuration` | 11 | parámetros, deducciones, conceptos de recargo |
| `/talento-humano/configuracion-laboral` | 12 | alias de configuración |
| `/talento-humano/mallas` | 6 | mallas y asignaciones |
| `/talento-humano/aportes-sociales` | 4 | previsualizar, listar, ejecutar, borrar |
| `/talento-humano/provisiones` | 2 | previsualizar y ejecutar |
| `/talento-humano/prestaciones` | 3 | pagos de prestaciones |
| `/talento-humano/liquidacion-trabajador` | 5 | preview, listado, ejecución, PDF |
| `/talento-humano/libranzas` | 4 | conceptos y empleados |
| `/hr/workdays` | 2 | procesar y listar jornadas |
| `/hr/schedules` | 2 | horarios |
| `/hr/time-punches` | 1 | marca administrativa |
| `/hr/novelties` / `/talento-humano/novedades` | 3 | solo lectura de novedades |

Rutas clave:

- `POST /hr/self/time-punches` — marcación autoservicio (`routes.js:59`).
- `POST /hr/time-punches` — marcación administrativa (`routes.js:112`).
- `POST /hr/workdays/process` — procesamiento manual de jornada (`routes.js:113`).
- `GET /hr/workdays` — consulta de jornadas (`routes.js:114`).
- `POST /hr/payroll/liquidations` — liquidación (`routes.js:190`).
- `POST /hr/payroll/period-closures/close` — cierre (`routes.js:218`).
- `POST /hr/payroll/period-closures/reopen` — reapertura (`routes.js:219`).
- `POST /hr/payroll/process` — motor legacy (`routes.js:271`).

Observaciones:

1. **Superficie duplicada:** `/hr/*` y `/talento-humano/*` exponen la misma capacidad con distinto nombre; pueden divergir.
2. **Sin rutas de aprobación/pago** de documentos de nómina.
3. **Sin rutas de corrección/anulación** de marcas.
4. **Sin rutas de aprobación/rechazo** de novedades.

## 2. Servicio principal

`apps/api/src/modules/hr/service.js` concentra el dominio. Funciones relevantes:

| Área | Función | Línea aproximada |
|---|---|---|
| Marcación | `createPunch`, `createOwnPunch` | 2814, 3068 |
| Jornada | `processDay`, `processWorkday` | 3599 (service), 162 (timeLogic) |
| Clasificación | `classifyMinute` | 118 (timeLogic) |
| Nómina | `buildPayrollLiquidationRows` | 5193 |
| Nómina | `runPayrollLiquidation` | 5646 |
| Nómina | `validatePayrollPeriod` | 5620 |
| Aportes | `buildSocialContributionRows` | 7024 |
| IBC | `configuredSegmentRules`, `pensionSolidarityRate` | 6993, 6867 |
| Provisión | `previewSocialBenefitProvisions`, `runSocialBenefitProvisions` | 7391, 7442 |
| Cierre | `closePayrollPeriod`, `reopenPayrollPeriod` | 7674, 7717 |
| Ajustes | `createPayrollAdjustment`, `deletePayrollAdjustment` | 6074, 6387 |
| Libranzas | `applyPayrollLibranzaMovements`, `reversePayrollLibranzaMovements` | 4584, 4615 |
| Retiro | `indemnizationDaysForTermination` | 5073 |
| Legacy | `processPayrollRange` | 4783 |

## 3. Modelos y tablas

Modelos Prisma relevantes:

- `Employee` (`schema.prisma:844`)
- `WorkSchedule` (`:1081`)
- `TimeRoute` (`:1097`)
- `RoutePreoperationalChecklist` (`:1119`)
- `GpsPing` (`:1259`)
- `WorkSession` (`:1279`)
- `WorkActivity` (`:1321`)
- `TimePunch` (`:2285`)
- `ProcessedWorkday` (`:2314`)
- `Payroll` (`:2608`)
- `AuditLog` (`:88`)

Tablas SQL del dominio (migraciones HR):

- `th_nomina_documentos`, `th_nomina_ajustes`, `th_nomina_conceptos`
- `th_nomina_cierres_periodo`
- `th_parametros_laborales`, `th_conceptos_recargo`, `th_calendario_dias`
- `th_empleado_contratos`, `th_empleado_afiliaciones`, `th_entidades_laborales`
- `th_aportes_sociales_documentos`, `th_aportes_sociales_lineas`
- `th_prestaciones_saldos`, `th_prestaciones_pagos`
- `th_libranza_conceptos`, `th_libranza_empleados`, `th_libranza_movimientos`
- `th_liquidaciones_trabajador`

Observaciones estructurales:

1. `TimePunch` no tiene `created_by`, `corrects_punch_id` ni estado.
2. `Employee` no tiene asignación de horario; `WorkSchedule` no tiene empleados.
3. `th_nomina_documentos` no tiene `total_provisions`; el cierre sí.
4. `Payroll` y `th_nomina_documentos` se escriben en paralelo; el estado siempre es `draft`.

## 4. Frontend

Páginas en `apps/web/app/dashboard/talento-humano/`:

- `marcacion` — autoservicio y cola offline.
- `reportes` — reporte de asistencia y extras.
- `nomina` — liquidación, cierre y reapertura.
- `configuracion-laboral` — parámetros y conceptos.
- `mallas`, `rutas`, `mapa` — mallas, rutas y monitoreo.
- `empleados`, `novedades`, `libranzas`.
- `aportes-sociales`, `provisiones`, `prestaciones-pagos`, `liquidacion-trabajador`.
- `entidades` — entidades laborales.

Cliente API: `apps/web/lib/api.ts`.

- `shouldPreferOperationalApi` privilegia la API operativa para HR.
- `shouldBlockHrWriteFallback` bloquea escrituras críticas.
- Fallbacks problemáticos: `/hr/schedules` y `/hr/workdays` devuelven `[]`; `/hr/attendance` lee `time_punches` de Supabase.

## 5. Pruebas existentes

API (`apps/api/test`):

- Marcación: `hr-marking-concurrency*`, `hr-marking-declared-employee`, `hr-marking-only-rbac`, `hr-marking-kilometraje-conflict`, `hr-deferred-marking-offline`.
- Jornada: `hr-workday-novelties-contract`, `hr-workday-novelties-policy`.
- Nómina: `hr-payroll-adjustment-lock`, `hr-payroll-adjustment-permission`, `hr-payroll-social-contributions-bulk`, `hr-social-contribution-segments`, `payroll-module-alias`.
- Mallas/rutas: `hr-route-assignment-lock`, `hr-route-event-summaries`, `hr-route-physical-deletion*`, `hr-single-active-schedule-certificate`.
- Monitor: `hr-monitor-evidence-demand`, `hr-monitor-silent-failures`, `nyvora-hr-monitor-dynamic-certificate`.

Web (`apps/web/test`):

- `ibc-nomina-ui.test.mjs`
- `payroll-employee-entity-ui.test.mjs`

Brechas de cobertura:

- No hay prueba de `processDay` ni de `buildPayrollLiquidationRows`.
- No hay prueba de cierre, reapertura, provisión ni retiro.
- No hay E2E marcación → jornada → nómina → cierre.

## 6. Datos maestros y semillas

| Semilla | Vigencia | Observación |
|---|---|---|
| `SMMLV` 1.750.905; `AUX_TRANSPORTE` 249.095 | 2026-01-01 | Correctos para 2026 |
| `EXONERACION_APORTES_TOPE_SMMLV` 10 | 2026-01-01 | Correcto |
| `JORNADA_ORDINARIA_SEMANAL` 42; `MAX_HE_DIARIO` 2; `MAX_HE_SEMANAL` 12 | 2026-09-01 | El motor no lee los topes |
| `HORAS_MENSUALES_ORDINARIAS` 210 | 2026-07-15 | Falta 220 para el periodo anterior |
| Recargos HED/HEN/DOM_FEST/HEDD/HEND | 2026-09-01 | HEDD/HEND con 105/155; periodos previos sin concepto |
| Conceptos de nómina (`SALARIO_BASICO`, `AUX_TRANSPORTE`, etc.) | 2026-09-01 | `AUX_TRANSPORTE` marcado como base de prestaciones |
| `IBC_TOPE_SMMLV` / `IBC_CAPS_FLOORS` | Sin semilla | Default 25 en código |

## 7. Ausencias de infraestructura

- No hay job, cron ni cola que ejecute `processDay`.
- No hay RLS en tablas HR; el filtro es el middleware de Prisma o el `tenant_id` explícito en SQL crudo.
- No hay auditoría de dominio para nómina; el único `AuditLog` de HR está en el borrado físico de malla.
- No hay generador de archivo PILA, retención en la fuente ni asiento contable.
- No hay endpoint de aprobación, pago o contabilización de nómina.

## 8. Conclusión del inventario

El módulo tiene una superficie amplia y una base funcional real, pero la cadena crítica **marcación → jornada → nómina → cierre** no está cerrada de extremo a extremo: falta el disparador de jornada, faltan controles de aprobación y trazabilidad, y el cierre no provisiona. El inventario sustenta los hallazgos de `hallazgos-marcaciones.md` y `hallazgos-nomina.md`.
