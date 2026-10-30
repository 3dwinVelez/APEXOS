# Ejecución de remediación — Marcaciones y Nómina

| Campo | Valor |
|---|---|
| Fecha | 2026-10-30 |
| Rama de trabajo | `desarrollo` |
| Commit base | `e25e177f8954d1c2c846046fade1275ebbeb6b21` |
| Paquete | R-01 a R-05 |
| Estado | Implementado y probado en `desarrollo` (commit `41ad5684`); **sin promoción, sin migración aplicada en nube** |
| Alcance | Solo cálculo y datos de vigencia; no se tocaron endpoints ni UI |

## 1. Brecha entre producción (`main`) y la rama auditada

`origin/main` está en `938fc2b6f42cc54957b23c37446e0ad3f7560074`. La producción **no tiene el motor nuevo de nómina**:

- `apps/api/src/modules/hr/service.js` de `main` tiene 3.907 líneas; no existe `buildPayrollLiquidationRows`, ni documentos de nómina, ni aportes segmentados, ni provisiones, ni cierre de periodo.
- La liquidación de producción es `processPayrollRange` (legacy): hora ordinaria `salario / 240`, recargo plano `1.25` para toda hora extra, `deductions = 0`, `employer_cost = gross`.
- Marcaciones de producción sí comparten los defectos auditados: `DEFAULT_PARAMS.night_start = "21:00"`, `processDay` usa `schedules[0]` y no hay generación automática de jornada.

Conclusión: R-01 (marcaciones) existe hoy en producción; R-02/R-03 (nómina) solo llegan a producción cuando se promueva el motor nuevo. La promoción debe retirar el motor legacy (R-09) para que producción no siga liquidando con tarifa plana.

## 2. Cambios aplicados

### R-01 — Hora nocturna 19:00 con parámetro por tenant

- `apps/api/src/modules/hr/service.js`
  - `DEFAULT_PARAMS.night_start`: `21:00` → `19:00`.
  - `processDay` lee `JORNADA_NOCTURNA_INICIO` y `JORNADA_NOCTURNA_FIN` vigentes en `th_parametros_laborales`; el parámetro manda y la constante solo cubre tenants sin fila vigente.
  - Helper `clockTimeFromParameter` acepta `19` o `"19:00"`.
- `apps/api/src/modules/hr/timeLogic.js`
  - Fallback de `classifyMinute`: `21:00` → `19:00` (`1140` minutos).

### R-02 — HEDD/HEND 2026-H2

- `DEFAULT_PAYROLL_CONFIG`: HEDD 105/2.05 → **115/2.15**; HEND 155/2.55 → **165/2.65**.
- Nueva migración `20261030120000_hr_labor_rates_vigencia_2026`:
  - Corrige filas HEDD/HEND con vigencia ≥ 2026-07-01 solo si siguen en el valor sembrado (no sobrescribe configuración propia).
  - Siembra la línea de tiempo 2026 por tenant: H1 (01-ene a 30-jun) y H2 (desde 01-jul) para DOM_FEST_DIURNO, DOM_FEST_NOCTURNO, HEDD y HEND; conceptos base HED/HEN/RECARGO_NOCTURNO desde 01-ene.
  - Cierra el vacío de vigencia: antes los conceptos solo existían desde 2026-09-01, por lo que enero–agosto se liquidaba sin factor.

### R-03 — Divisor 220/210 por periodo

- Helper `monthlyOrdinaryHoursForDate`: 220 antes del 15-jul-2026, 210 desde esa fecha.
- Se usa como fallback en `buildPayrollLiquidationRows` y en `processPayrollRange`; el parámetro `HORAS_MENSUALES_ORDINARIAS` sigue teniendo prioridad.
- Migración siembra `HORAS_MENSUALES_ORDINARIAS = 220` con vigencia 2026-01-01 (el tramo 210 desde 2026-07-15 ya existía).

### R-04 — Topes y pisos de IBC en nómina y aportes

- `apps/api/src/modules/hr/service.js`
  - `configuredSegmentRules` ahora toma `IBC_TOPE_SMMLV` como fuente explícita (si vale 0 se desactiva el tope), conserva el respaldo por `socialSecurity.ibc_cap_smmlv` y **prorratea el tope por los días del periodo** (`capDays`: 15 en quincena, 30 en mes).
  - Nuevo `clampIbcBase(amount, rules, subsystem)`: aplica piso y tope por subsistema. Es la única función que ajusta IBC, usada por nómina y por aportes.
  - `buildPayrollLiquidationRows`: calcula `ibcSalud`, `ibcPension` e `ibcArl` con tope/piso **aunque no existan novedades segmentadas**. Las deducciones de salud y pensión usan esas bases; la solidaridad pensional usa la base de pensión topada. `source_summary` expone `ibc_sin_topes`, `ibc_subsistemas` e `ibc_reglas` para auditar el ajuste.
  - `buildSocialContributionRows`: mismo clamp sobre la base reportada. **Se eliminó el fallback silencioso al salario**: sin IBC de nómina el cálculo responde `409 IBC_REPORTADO_REQUERIDO` con el empleado afectado. La única excepción es el cierre, que usa `allowMissingPayroll` porque liquida la nómina unas líneas después.
  - Los parafiscales quedan fuera del tope en esta intervención (decisión explícita de alcance; el tope legal aplica a salud, pensión y ARL).
- Migración `20261030130000_hr_ibc_caps_floors_2026`:
  - Siembra `IBC_TOPE_SMMLV = 25` (vigencia 2026-01-01) e `IBC_CAPS_FLOORS` vacío por tenant con `WHERE NOT EXISTS` (idempotente).

### R-05 — Cierre con provisiones reales

- `closePayrollPeriod` ejecuta `runSocialBenefitProvisions` **después** de liquidar la nómina y antes de aportes, y guarda `total_provisions` calculado (antes leía un campo inexistente y siempre registraba 0). El `source_summary` del cierre incluye `social_benefit_provisions` (líneas, total, `skipped`).
- Sin nómina (`documents = 0`) no se inventan provisiones: se marca `skipped: "SIN_NOMINA"` con total 0.
- `validatePayrollPeriodClosure` distingue dos momentos: en la validación pública la falta de nómina es un error `NOMINA_SIN_LIQUIDAR`; dentro del cierre es una advertencia porque el paso siguiente es liquidar.

## 3. Evidencia ejecutada

### Pruebas automatizadas

`apps/api/test/hr-labor-rates-vigencia.test.js` (4 casos funcionales):

1. `processWorkday` clasifica como nocturno desde las 19:00 por defecto.
2. `processDay` lee `JORNADA_NOCTURNA_INICIO = 19` y produce 180 min nocturnos en un turno 19:00–22:00.
3. `processDay` con parámetro 21:00 produce 120 min diurnos + 60 nocturnos (el parámetro manda).
4. Divisor: 220 el 2026-01-01, 2026-06-30 y 2026-07-14; 210 el 2026-07-15 y 2026-08-01.

Resultado: **4/4 OK**.

`apps/api/test/hr-ibc-caps-floors.test.js` (7 casos funcionales de R-04):

1. La migración siembra `IBC_TOPE_SMMLV` y `IBC_CAPS_FLOORS` con vigencia 2026 e idempotencia.
2. Aportes eleva al piso de 1 SMMLV: base 1.400.000 → 1.750.905; `DED_SALUD` = 70.036,20; parafiscales intactos.
3. Aportes aplica el tope de 25 SMMLV: base 30 SMMLV → 43.772.625; solidaridad sobre la misma base topada.
4. Quincena prorratea ambos límites: 12,5 SMMLV de tope y 0,5 SMMLV de piso.
5. Sin nómina liquidada, aportes rechaza con `409 IBC_REPORTADO_REQUERIDO`; el modo tolerante reporta `missing_payroll`.
6. Nómina deduce salud y pensión sobre el piso de IBC (70.036,20 cada una) y deja `ibc_sin_topes` auditado.
7. Nómina deduce sobre el tope y calcula la solidaridad con la misma base de pensión.

`apps/api/test/hr-payroll-close-provisions.test.js` (2 casos funcionales de R-05):

1. El cierre liquida la nómina, inserta 4 provisiones (prima, cesantías, intereses, vacaciones) en `th_prestaciones_saldos`, guarda `total_provisions > 0` y la secuencia `validacion → nomina → provisiones → aportes_sociales → cierre`.
2. Sin nómina el cierre no provisiona: `skipped = SIN_NOMINA`, total 0 y ningún INSERT en saldos.

Resultado: **9/9 OK**.

Regresión del módulo: `node --test apps/api/test/hr-*.test.js` → **175/175 OK**.
Alias de nómina: `node --test apps/api/test/payroll-module-alias.test.js` → **1/1 OK**.

### Migración

Ambas migraciones (`20261030120000` y `20261030130000`) se validaron sobre la cadena real `20260917120000 → 20260918190000 → 20261030120000 → 20261030130000` en un clúster Postgres 16 desechable (puerto 55433). La de IBC se aplicó **dos veces**: la segunda ejecución insertó 0 filas.

Corte de vigencia de tarifas:

| Fecha de corte | DOM_FEST_DIURNO | DOM_FEST_NOCTURNO | HEDD | HEND |
|---|---|---|---|---|
| 2026-06-15 | 80% / 1.80 | 115% / 2.15 | 105% / 2.05 | 155% / 2.55 |
| 2026-07-20 | 90% / 1.90 | 125% / 2.25 | 115% / 2.15 | 165% / 2.65 |
| 2026-10-15 | 90% / 1.90 | 125% / 2.25 | 115% / 2.15 | 165% / 2.65 |

Divisor: 220 desde 2026-01-01 y 210 desde 2026-07-15.

## 4. Delta económico corregido

Base: SMMLV 2026 = $1.750.905.

| Concepto | Antes | Después | Delta |
|---|---|---|---|
| Hora nocturna 19:00–21:00 | pagada como diurna | 35% nocturno | 2 h/día × 0.35 × hora |
| Hora ordinaria H1 (junio) | divisor 210 (heredado) | divisor 220 | −4.76% en el valor hora |
| Hora ordinaria H2 | divisor 210 | divisor 210 | sin cambio |
| Hora extra dominical diurna | 2.05 × hora | 2.15 × hora | +0.10 × hora |
| Hora extra dominical nocturna | 2.55 × hora | 2.65 × hora | +0.10 × hora |

Con divisor 210, 0.10 × hora = $833.76; con divisor 220, $795.87.

Advertencia: el cambio de divisor en H1 reduce el valor de extras y recargos de periodos enero–julio. Es la corrección legal, pero exige definir si se reprocesan periodos ya emitidos (ver riesgo en `05-plan-remediacion.md`).

## 5. Pendiente y bloqueos

- [ ] Reproducción con datos QA (Fase 0 no se ejecutó; la evidencia es unitaria e independiente, no E2E).
- [ ] Aplicar la migración en la base local/QA y verificar tenants con configuración propia.
- [x] R-04 IBC con topes/pisos en ambas ramas.
- [x] R-05 cierre con provisiones.
- [ ] R-06 libranza idempotente.
- [ ] R-07 auxilio fuera de la base de prestaciones.
- [ ] R-08 indemnización sin `SMLV_CO`.
- [ ] R-09 retirar el motor legacy.
- [ ] R-10 conciliación reporte/nómina y R-10A topes de extras.
- [ ] Firma jurídica/contable de la matriz normativa.
- [ ] Certificación E2E y manifiestos de promoción.

La suite completa de API (`node --test apps/api/test/*.test.js`) se intentó como control adicional, pero se detuvo tras varios minutos sin salida: algún archivo del conjunto queda colgado en este entorno. El control de regresión válido es la suite HR (175/175), que cubre todos los archivos `hr-*`.

## 6. Viabilidad de habilitar la intervención en `main`

La intervención **no se puede portar como parche puntual a `main`**:

- `main` (`938fc2b6`) conserva el motor legacy de nómina: `apps/api/src/modules/hr/service.js` tiene 3.907 líneas y no existen `buildPayrollLiquidationRows`, documentos de nómina, aportes segmentados, provisiones ni cierre de periodo. `desarrollo` tiene 8.015 líneas.
- `origin/develop` (`a505e97f`) sí tiene el motor (7.892 líneas), pero también está divergente: 61 commits que no están en `desarrollo` y 52 de `desarrollo` que no están en él. Un intento de llevar solo el commit de la intervención produce conflictos en `apps/api/src/modules/hr/service.js` (verificado con `git merge-tree`), porque la base del parche no incluye esos 61 commits.
- R-01 (hora nocturna 19:00) sí aplica hoy a producción. R-02, R-03, R-04 y R-05 dependen del motor nuevo y solo llegan a `main` con la promoción completa del módulo.
- A la fecha, `main...desarrollo` difiere en **864 archivos / 374 commits**. No es una promoción puntual: requiere el flujo `desarrollo → develop → main` con manifiesto de alcance completo, `qa:preqa:evidence`, `qa:approval:evidence` y QA funcional en ambiente desplegado.
- Sin esa certificación E2E, forzar el cambio en `main` violaría `AGENTS.md` y `docs/CHANGE_APPROVAL_QA_POLICY.md`. El bloqueo debe declararse explícitamente; no se puede afirmar que producción quedó habilitada.

Estado actual: cambios y pruebas en `desarrollo` (commits `41ad5684` y `a4e18f01`); migraciones validadas solo en clúster desechable, **no aplicadas en nube**. La suite HTTP completa no es ejecutable en este entorno (los tests de integración esperan Postgres en `localhost:55432` y el runner queda colgado); el control válido es la suite HR y los tests adyacentes.
