const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..", "..", "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("hr routes expose talento humano aliases and route prevalidation", () => {
  const source = read("apps/api/src/modules/hr/routes.js");
  assert.match(source, /\/talento-humano\/mallas\/prevalidar/);
  assert.match(source, /\/talento-humano\/novedades/);
  assert.match(source, /\/talento-humano\/configuracion-laboral/);
  assert.match(source, /\/talento-humano\/configuracion-laboral\/parametros/);
  assert.match(source, /\/talento-humano\/configuracion-laboral\/conceptos/);
  assert.match(source, /\/talento-humano\/entidades/);
  assert.match(source, /\/talento-humano\/empleados\/:id\/afiliaciones/);
  assert.match(source, /\/talento-humano\/empleados\/:id\/contratos/);
  assert.match(source, /\/talento-humano\/empleados\/:id\/contratos\/otrosi/);
  assert.match(source, /\/talento-humano\/empleados\/:id\/recontratar/);
  assert.match(source, /\/talento-humano\/entidades\/:id\/vincular-tercero/);
  assert.match(source, /prevalidateRoutes/);
});

test("transport allowance payment mode is configurable per quincena", () => {
  const service = read("apps/api/src/modules/hr/service.js");
  const routes = read("apps/api/src/modules/hr/routes.js");
  assert.match(service, /transport_allowance_payment: "ambas"/);
  assert.match(service, /transportAllowancePayment/);
  assert.match(service, /transportQuincenaIsFirstHalf/);
  // Solo se admite "ambas" o "ultima"; "primera" fue retirado y se normaliza a "ambas".
  assert.match(service, /transportAllowancePaymentRaw === "ultima" \? "ultima" : "ambas"/);
  assert.match(service, /transportAllowancePayment === "ultima"/);
  assert.doesNotMatch(service, /transportAllowancePayment === "primera"/);
  // En pago por una sola quincena el auxilio se prorratea con los dias trabajados del mes completo.
  assert.match(service, /transportMonthWorkedDaysByEmployee/);
  assert.match(service, /transportNeedsMonthScope/);
  assert.match(service, /Math\.min\(effectiveMonthDays, 30\)/);
  // El conteo mensual del auxilio tambien suma jornadas externas (ajustes sin marcacion).
  assert.match(service, /externalDaysByEmployee/);
  assert.match(service, /isExternalWorkday\(adjustment\) && normalizeLaborCode\(adjustment\.concept_code \|\| ""\) === "JORNADA_ORDINARIA"/);
  assert.match(routes, /\/talento-humano\/configuracion-laboral\/nomina/);
});

test("surcharge value_type drives pay: percentage-only for recargos, full factor for overtime", () => {
  const service = read("apps/api/src/modules/hr/service.js");
  // El multiplicador depende del value_type configurable, no de reglas quemadas.
  assert.match(service, /const surchargeMultiplierFor = \(code\) =>/);
  assert.match(service, /valueType === "informativo"\) return 0/);
  assert.match(service, /valueType === "porcentaje_adicional"\) return Number\(concept\.percent \|\| 0\) \/ 100/);
  assert.match(service, /valueType === "factor_total"\) return Number\(concept\.factor \|\| 1\)/);
  // Mismo helper en marcaciones y en jornadas externas.
  assert.match(service, /const factor = surchargeMultiplierFor\(code\);/);
  assert.match(service, /const factor = surchargeMultiplierFor\(calendarConceptCode\);/);
  // La hora extra/recargo externo usa el valor hora (hourly * factor) por hora liquidada.
  assert.match(service, /unitRate = hourly \* factor;/);
  assert.match(service, /amount = Number\(adjustment\.amount \|\| 0\) \|\| \(quantity \* unitRate\)/);
  assert.doesNotMatch(service, /surchargeFactorFor/);
});

test("salary base follows the 30-day commercial month paying only covered days", () => {
  const service = read("apps/api/src/modules/hr/service.js");
  const schema = read("apps/api/src/modules/hr/schema.js");
  assert.match(service, /const commercialBaseDays = periodType === "mes" \? 30 : 15;/);
  // Descanso explicito desde la malla (kind='descanso').
  assert.match(service, /prisma\.timeRoute\.findMany/);
  assert.match(service, /normalizeRouteKind\(route\.kind\) !== "descanso"/);
  assert.match(service, /restDatesByEmployee/);
  // Dias cubiertos = marcacion + correccion + descanso + licencia remunerada; el resto no se paga.
  assert.match(service, /const coveredDates = new Set\(\);/);
  assert.match(service, /const uncoveredDays = Math\.max\(0, periodDays - coveredDates\.size\);/);
  assert.match(service, /const computableAbsenceDays = Math\.max\(0, uncoveredDays - freeCommercialDays\);/);
  assert.match(service, /payrollLine\("SALARIO_BASICO", "Salario basico", paidBaseDays/);
  assert.match(service, /PAID_LEAVE_CODES/);
  assert.match(service, /"AJUSTE_MES_COMERCIAL"/);
  // La malla admite el tipo descanso.
  assert.match(schema, /kind: \{ type: "string", enum: \["trabajo", "descanso"\] \}/);
});

test("external ordinary workday is shown as salary and the empty base line is hidden", () => {
  const service = read("apps/api/src/modules/hr/service.js");
  assert.match(service, /const isOrdinaryWorkedDay = calendarConceptCode === "JORNADA_ORDINARIA";/);
  assert.match(service, /const displayCode = isOrdinaryWorkedDay \? "SALARIO_BASICO" : calendarConceptCode;/);
  assert.match(service, /const displayName = isOrdinaryWorkedDay \? "Salario"/);
  assert.match(service, /const lines = base > 0/);
  // El salario ordinario externo se paga por dia (salario/30), no por hora.
  assert.match(service, /unitRate = salaryBase \/ 30;/);
  assert.match(service, /amount = Number\(adjustment\.amount \|\| 0\) \|\| money\(ordinaryDays \* unitRate\)/);
});

test("invalid payroll period ranges are rejected", () => {
  const service = read("apps/api/src/modules/hr/service.js");
  assert.match(service, /function assertValidPeriodKey\(periodKey\)/);
  assert.match(service, /PERIODO_RANGO_INVALIDO/);
  assert.match(service, /PERIODO_RANGO_EXCEDIDO/);
  // periodFromRange valida orden y tope de un mes.
  assert.match(service, /if \(endDate < startDate\)/);
  // import y ajuste manual validan el period_key.
  const occurrences = (service.match(/assertValidPeriodKey\(periodKey\)/g) || []).length;
  assert.ok(occurrences >= 2, "assertValidPeriodKey debe usarse en import y en ajuste manual");
});

test("external workday import skips duplicate rows", () => {
  const service = read("apps/api/src/modules/hr/service.js");
  assert.match(service, /const dedupKey = \(employeeId, conceptCode, workDate, days, minutes\)/);
  assert.match(service, /const seenKeys = new Set\(existingActive\.map/);
  assert.match(service, /if \(seenKeys\.has\(rowKey\)\)/);
  assert.match(service, /code: "JORNADA_DUPLICADA"/);
});

test("ordinary hour divisor is configurable (210 for the 42-hour workweek, not hardcoded 240)", () => {
  const service = read("apps/api/src/modules/hr/service.js");
  assert.match(service, /HORAS_MENSUALES_ORDINARIAS: 210/);
  assert.match(service, /const monthlyOrdinaryHours = Number\(legalParameterRows\.HORAS_MENSUALES_ORDINARIAS\?\.value/);
  assert.match(service, /const hourly = salaryBase \? salaryBase \/ monthlyOrdinaryHours : 0;/);
  assert.doesNotMatch(service, /salaryBase \/ 240/);
  const migration = read("apps/api/prisma/migrations/20260919120000_hr_monthly_ordinary_hours_param/migration.sql");
  assert.match(migration, /HORAS_MENSUALES_ORDINARIAS/);
  assert.match(migration, /210/);
  assert.match(migration, /DATE '2026-07-15'/);
});

test("payroll concept report aggregates earnings and deductions by employee over a free range", () => {
  const service = read("apps/api/src/modules/hr/service.js");
  const routes = read("apps/api/src/modules/hr/routes.js");
  assert.match(service, /async function payrollConceptReport\(tenantId, query = \{\}\)/);
  // Incluye todos los periodos que se solapan con el rango.
  assert.match(service, /d\.date_start <= \$\{startOfDay\(to\)\}/);
  assert.match(service, /d\.date_end >= \$\{startOfDay\(from\)\}/);
  // Usa el nombre del concepto por codigo, no la descripcion del movimiento.
  assert.match(service, /conceptReportLabel\(code, line\.name\)/);
  assert.match(service, /const type = amount < 0 \? "deduccion" : "devengo"/);
  assert.match(service, /by_concept: totalsByConcept/);
  assert.match(routes, /\/talento-humano\/nomina\/reportes\/conceptos/);
});

test("social benefit provisions take documents by date range and aggregate by concept", () => {
  const service = read("apps/api/src/modules/hr/service.js");
  // Toma documentos por rango (solapamiento), no por period_key exacto.
  assert.match(service, /listPayrollDocuments\(tenantId, \{ date_from: fromKey, date_to: toKey/);
  assert.match(service, /d\.date_start <= \$\{dateTo/);
  // Agrega por empleado\+concepto para no sobrescribir al guardar el saldo.
  assert.match(service, /const aggregated = new Map\(\);/);
  assert.match(service, /existing\.amount = money\(Number\(existing\.amount \|\| 0\) \+ Number\(line\.amount/);
  // Los intereses a las cesantias se recalculan sobre el acumulado (no suma de quincenas).
  assert.match(service, /intereses\.amount = money\(\(Number\(cesantias\.amount \|\| 0\) \* Number\(cesantias\.quantity \|\| 0\) \* 0\.12\) \/ 360\)/);
});

test("social benefit balance report aggregates accrued, paid and balance by concept", () => {
  const service = read("apps/api/src/modules/hr/service.js");
  const routes = read("apps/api/src/modules/hr/routes.js");
  assert.match(service, /async function benefitBalanceReport\(tenantId, query = \{\}\)/);
  assert.match(service, /FROM th_prestaciones_saldos b/);
  assert.match(service, /b\.date_start >= \$\{from\}::date/);
  assert.match(service, /b\.date_start <= \$\{to\}::date/);
  assert.match(service, /b\.source_document_type <> 'nomina'/);
  assert.match(service, /b\.source_document_type/);
  assert.match(service, /e\.metadata->>'document' AS employee_document/);
  assert.match(service, /row\.source_document_type === "provision" \? 0 : Number\(row\.paid_amount/);
  assert.match(service, /row\.source_document_type === "provision" \? causedAmount : Number\(row\.balance_amount/);
  assert.match(service, /current\.dias_pendientes = money/);
  assert.match(service, /\.\.\.SOCIAL_BENEFIT_REPORT_ORDER/);
  assert.match(routes, /\/talento-humano\/nomina\/reportes\/prestaciones/);
});

test("payroll auxiliary report exports payroll, benefits, social contributions and libranzas", () => {
  const service = read("apps/api/src/modules/hr/service.js");
  const routes = read("apps/api/src/modules/hr/routes.js");
  assert.match(service, /async function payrollAuxiliaryReport\(tenantId, query = \{\}\)/);
  assert.match(service, /PAYROLL_AUXILIARY_TYPES/);
  assert.match(service, /th_nomina_documentos/);
  assert.match(service, /d\.net/);
  assert.match(service, /Nomina por pagar/);
  assert.match(service, /conceptReportLabel\(line\.code, line\.name \|\| "Concepto nomina"\)/);
  assert.match(service, /th_prestaciones_saldos/);
  assert.match(service, /th_aportes_sociales_lineas/);
  assert.match(service, /th_libranza_movimientos/);
  assert.match(service, /th_prestaciones_pagos_lineas/);
  assert.match(service, /Pago \$\{AUXILIARY_BENEFIT_NAMES/);
  assert.match(service, /entity_nit/);
  assert.match(service, /cost_center/);
  assert.match(routes, /\/talento-humano\/nomina\/reportes\/auxiliar/);
});

test("payroll adjustments list hides cancelled adjustments by default", () => {
  const service = read("apps/api/src/modules/hr/service.js");
  assert.match(service, /const requestedStatus = String\(query\.status \|\| "activo"\)/);
  assert.match(service, /AND \(\$\{includeAllStatuses\} OR a\.status = \$\{statusFilter\}\)/);
});

test("rest-day marker migration adds the kind column to the malla", () => {
  const migration = read("apps/api/prisma/migrations/20260919110000_time_route_kind_descanso/migration.sql");
  assert.match(migration, /ALTER TABLE "TimeRoute" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'trabajo'/);
});

test("migration keeps overtime concepts as full factor while recargos stay percentage-only", () => {
  const migration = read("apps/api/prisma/migrations/20260919100000_hr_overtime_concept_value_type/migration.sql");
  assert.match(migration, /UPDATE th_conceptos_recargo/);
  assert.match(migration, /SET value_type = 'factor_total'/);
  assert.match(migration, /code IN \('HED', 'HEN', 'HEDD', 'HEND'\)/);
});

test("hr service blocks overlapping employee schedules without vehicle exclusivity", () => {
  const source = read("apps/api/src/modules/hr/service.js");
  assert.match(source, /findRouteAssignmentConflicts/);
  assert.match(source, /MALLA_SOLAPADA/);
  assert.doesNotMatch(source, /vehicle_plate[^;\n]+unique/i);
});

test("closing punch with vehicle requires day mileage and writes novelty when unusual", () => {
  const source = read("apps/api/src/modules/hr/service.js");
  assert.match(source, /validateMileage/);
  assert.match(source, /kilometraje_dia/);
  assert.match(source, /KILOMETRAJE_INCONSISTENTE/);
  assert.match(source, /th_jornada_kilometrajes/);
});

test("migration seeds novelty types and labor parameters as editable data", () => {
  const migration = read("apps/api/prisma/migrations/20260917120000_hr_workday_novelties_foundation/migration.sql");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS th_tipos_novedad/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS th_parametros_laborales/);
  assert.match(migration, /JORNADA_NOCTURNA_INICIO/);
  assert.match(migration, /MAX_HE_DIARIO/);
  assert.match(migration, /KILOMETRAJE_INCONSISTENTE/);
});

test("hr service supports labor entity CRUD and non-overlapping employee affiliations", () => {
  const source = read("apps/api/src/modules/hr/service.js");
  assert.match(source, /async function listLaborEntities/);
  assert.match(source, /async function createLaborEntity/);
  assert.match(source, /async function updateLaborEntity/);
  assert.match(source, /async function linkLaborEntityAccountingParty/);
  assert.match(source, /async function createEmployeeAffiliation/);
  assert.match(source, /FONDO_CESANTIAS/);
  assert.match(source, /AFILIACION_SUPERPUESTA/);
  assert.match(source, /nit_mismatch/);
});

test("hr service stores labor configuration by validity instead of hardcoding rates", () => {
  const source = read("apps/api/src/modules/hr/service.js");
  const routes = read("apps/api/src/modules/hr/routes.js");
  assert.match(source, /createLaborParameter/);
  assert.match(source, /updateLaborParameter/);
  assert.match(source, /createLaborDeduction/);
  assert.match(source, /updateLaborDeduction/);
  assert.match(source, /createSurchargeConcept/);
  assert.match(source, /updateSurchargeConcept/);
  assert.match(source, /VIGENCIA_LABORAL_SUPERPUESTA/);
  assert.match(source, /daterange\(valid_from, COALESCE\(valid_to, 'infinity'::date\), '\[\]'\) && daterange/);
  assert.match(routes, /configuracion-laboral\/deducciones/);
});

test("hr labor deductions are seeded as editable parameters", () => {
  const migration = read("apps/api/prisma/migrations/20260918100000_hr_labor_deductions_parameters/migration.sql");
  assert.match(migration, /DED_SALUD/);
  assert.match(migration, /DED_PENSION/);
  assert.match(migration, /APORTE_SALUD/);
  assert.match(migration, /category', 'deduction/);
});

test("hr employee master validates contracts and syncs monthly salary history", () => {
  const source = read("apps/api/src/modules/hr/service.js");
  const schema = read("apps/api/src/modules/hr/schema.js");
  assert.match(source, /validateEmployeeLaborInput/);
  assert.match(source, /FECHA_FIN_CONTRATO_REQUERIDA/);
  assert.match(source, /contractType === "fixed"/);
  assert.match(source, /assertEmployeeDocumentAvailable/);
  assert.match(source, /DOCUMENTO_EMPLEADO_DUPLICADO/);
  assert.match(source, /employeeCodeFromDocument/);
  assert.match(source, /syncEmployeeSalaryHistory/);
  assert.match(source, /ensureEmployeeContractFoundation/);
  assert.match(source, /createEmployeeContractAddendum/);
  assert.match(source, /createEmployeeRehire/);
  assert.match(source, /th_empleado_contratos/);
  assert.match(source, /termination_document_id/);
  assert.match(source, /recontratacion/);
  assert.match(source, /otrosi/);
  assert.match(source, /th_empleado_salarios/);
  assert.match(schema, /end_date/);
  assert.match(schema, /employeeContractAddendumSchema/);
  assert.match(schema, /employeeRehireSchema/);
  const contractMigration = read("apps/api/prisma/migrations/20260918220000_hr_employee_contract_history/migration.sql");
  assert.match(contractMigration, /CREATE TABLE IF NOT EXISTS th_empleado_contratos/);
  assert.match(contractMigration, /th_empleado_contratos_one_active_idx/);
  assert.match(contractMigration, /continuity_group_id/);
});

test("payroll process consumes parameterized labor deductions", () => {
  const source = read("apps/api/src/modules/hr/service.js");
  assert.match(source, /activeLaborDeductions/);
  assert.match(source, /metadata->>'category'/);
  assert.match(source, /deducciones_parametrizadas/);
  assert.doesNotMatch(source, /const deductions = 0;/);
});

test("payroll liquidation creates employee documents, adjustments and pdf vouchers", () => {
  const source = read("apps/api/src/modules/hr/service.js");
  const routes = read("apps/api/src/modules/hr/routes.js");
  const schema = read("apps/api/src/modules/hr/schema.js");
  const migration = read("apps/api/prisma/migrations/20260918140000_hr_payroll_liquidation_documents/migration.sql");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS th_nomina_documentos/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS th_nomina_ajustes/);
  assert.match(source, /previewPayrollLiquidation/);
  assert.match(source, /runPayrollLiquidation/);
  assert.match(source, /deletePayrollLiquidation/);
  assert.match(source, /DELETE FROM "Payroll"/);
  assert.doesNotMatch(source, /tx\.payroll\.deleteMany/);
  assert.match(source, /createPayrollAdjustment/);
  assert.match(source, /JORNADA_ORDINARIA/);
  assert.match(source, /PRIMA_SERVICIOS/);
  assert.match(source, /CESANTIAS/);
  assert.match(source, /INTERESES_CESANTIAS/);
  assert.match(source, /previewSocialBenefitProvisions/);
  assert.match(source, /runSocialBenefitProvisions/);
  assert.match(source, /PROVISION_SIN_NOMINA/);
  assert.match(source, /source_document_type = 'provision'/);
  assert.match(source, /base: socialBenefitsBase/);
  assert.match(source, /base: vacationBase/);
  assert.match(source, /formula: "base \* dias \/ 360"/);
  assert.match(source, /function payrollReceiptLines/);
  assert.match(source, /SOCIAL_BENEFIT_CODES\.has\(code\)/);
  assert.match(source, /const receiptLines = payrollReceiptLines\(document\.lines\)/);
  assert.doesNotMatch(source, /\$\{line\.code\} \$\{line\.name\} \(\$\{line\.source\}\)/);
  assert.match(source, /socialBenefitBaseFromLines/);
  assert.match(source, /SOCIAL_BENEFIT_CODES/);
  assert.match(source, /exclude_from_social_benefits_base/);
  assert.match(source, /include_in_social_benefits_base/);
  assert.match(source, /include_in_vacation_base/);
  assert.match(source, /isVacationAdjustment/);
  assert.match(source, /dias_vacaciones_excluidos/);
  assert.match(source, /base_prestaciones_sociales/);
  assert.match(source, /"AUX_TRANSPORTE", "AUX_TRANSPORTE_TOPE_SMMLV"/);
  assert.match(source, /LEGAL_PARAMETER_FALLBACKS_CO_2026/);
  assert.match(source, /AUX_TRANSPORTE:\s*249095/);
  assert.match(source, /qualifiesForTransportAllowance/);
  assert.match(source, /payrollLine\("AUX_TRANSPORTE"/);
  assert.match(source, /include_in_social_benefits_base: true/);
  assert.match(source, /include_in_vacation_base: false/);
  assert.match(source, /indemnizationDaysForTermination/);
  assert.match(source, /buildEmployeeTerminationLiquidation/);
  assert.match(source, /th_prestaciones_saldos/);
  assert.match(source, /th_liquidaciones_trabajador/);
  assert.match(source, /INDEMNIZACION_SIN_JUSTA_CAUSA/);
  assert.match(source, /CST art\. 64/);
  assert.match(source, /previewSocialContributions/);
  assert.match(source, /runSocialContributions/);
  assert.match(source, /closePayrollPeriod/);
  assert.match(source, /reopenPayrollPeriod/);
  assert.match(source, /recalculatePayrollPeriodClosure/);
  assert.match(source, /assertPayrollPeriodOpen/);
  assert.match(source, /th_nomina_cierres_periodo/);
  assert.match(source, /th_aportes_sociales_documentos/);
  assert.match(source, /th_aportes_sociales_lineas/);
  assert.match(source, /APORTE_ARL_RIESGO_1/);
  assert.match(source, /APORTE_ARL_RIESGO_5/);
  assert.match(source, /pilaNoveltyFromAdjustment/);
  assert.match(source, /automatic_by_ibc_threshold/);
  assert.match(source, /EXONERACION_APORTES_TOPE_SMMLV/);
  assert.match(source, /arl_risk_class/);
  assert.match(source, /LICENCIA_NO_REMUNERADA/);
  assert.match(source, /INCAPACIDAD_GENERAL/);
  assert.match(source, /APORTE_CAJA/);
  assert.match(source, /APORTE_ICBF/);
  assert.match(source, /APORTE_SENA/);
  assert.match(source, /pensionSolidarityRate/);
  assert.match(source, /DED_FONDO_SOLIDARIDAD_PENSIONAL/);
  assert.match(source, /activeEmployeeLibranzas/);
  assert.match(source, /inactiveAt/);
  assert.match(source, /employee_document/);
  assert.match(source, /listEmployeeSalaryHistory/);
  assert.match(source, /createEmployeeSalaryHistory/);
  assert.match(source, /salarySnapshotsForEmployees/);
  assert.match(source, /weightedSalaryForPeriod/);
  assert.match(source, /activeCalendarDaysByDate/);
  assert.match(source, /calendarDayTypeForDate/);
  assert.match(source, /calendarRestDayMinutes/);
  assert.match(source, /DOM_FEST_DIURNO/);
  assert.match(source, /DOM_FEST_NOCTURNO/);
  assert.match(source, /calendario_laboral/);
  assert.match(source, /base_prestaciones_retiro/);
  assert.match(source, /historial_salarial_retiro/);
  assert.match(source, /createCalendarDay/);
  assert.match(source, /updateCalendarDay/);
  assert.match(source, /applyPayrollLibranzaMovements/);
  assert.match(source, /reversePayrollLibranzaMovements/);
  assert.match(source, /importExternalWorkdays/);
  assert.match(source, /adjustmentPayrollMinutes/);
  assert.match(source, /isExternalWorkday/);
  assert.match(source, /days \* 480/);
  assert.match(source, /deleteExternalWorkdays/);
  assert.match(source, /JORNADAS_EXTERNAS_CON_NOMINA/);
  assert.match(source, /SET status = 'anulado'/);
  assert.doesNotMatch(source, /th_nomina_ajustes[\s\S]{0,120}updated_at/);
  assert.match(source, /jornada_externa/);
  assert.match(source, /720/);
  assert.match(source, /correctionMinutesFromInput/);
  assert.match(source, /JORNADA_DUPLICADA/);
  assert.match(source, /getPayrollDocumentPdf/);
  assert.match(source, /validatePayrollPeriod/);
  assert.match(source, /activePayrollConcepts/);
  assert.match(source, /salary_constitutive/);
  assert.match(source, /affects_ibc/);
  assert.match(source, /assertPayrollConceptAccounts/);
  assert.match(source, /debit_account_code/);
  assert.match(source, /credit_account_code/);
  assert.match(source, /ordinary_night_minutes/);
  assert.match(source, /RECARGO_NOCTURNO/);
  assert.match(source, /simplePayrollPdf/);
  assert.match(source, /Firma empleado/);
  assert.match(routes, /\/talento-humano\/nomina\/preview/);
  assert.match(routes, /\/talento-humano\/nomina\/validar/);
  assert.match(routes, /\/talento-humano\/nomina\/liquidaciones\/:id\/pdf/);
  assert.match(routes, /\/talento-humano\/nomina\/ajustes/);
  assert.match(routes, /\/talento-humano\/nomina\/jornadas-externas\/importar/);
  assert.match(routes, /\/talento-humano\/nomina\/jornadas-externas/);
  assert.match(routes, /\/talento-humano\/empleados\/:id\/salarios/);
  assert.match(routes, /\/talento-humano\/configuracion-laboral\/calendario/);
  assert.match(routes, /\/talento-humano\/libranzas\/conceptos/);
  assert.match(routes, /deleteLibranzaConcept/);
  assert.match(routes, /\/talento-humano\/libranzas\/empleados/);
  assert.match(routes, /liquidacion-trabajador\/preview/);
  assert.match(routes, /liquidacion-trabajador\/saldos/);
  assert.match(routes, /liquidacion-trabajador\/documentos/);
  assert.match(routes, /aportes-sociales\/preview/);
  assert.match(routes, /aportes-sociales\/documentos/);
  assert.match(routes, /aportes-sociales\/documentos\/:id\/lineas/);
  assert.match(routes, /nomina\/cierres\/validar/);
  assert.match(routes, /nomina\/cierres\/cerrar/);
  assert.match(routes, /provisiones\/prestaciones-sociales\/preview/);
  assert.match(routes, /provisiones\/prestaciones-sociales\/documentos/);
  assert.match(routes, /prestaciones\/pagos\/preview/);
  assert.match(routes, /prestaciones\/pagos\/documentos/);
  assert.match(routes, /nomina\/cierres\/reabrir/);
  assert.match(routes, /nomina\/cierres\/recalcular/);
  assert.match(routes, /configuracion-laboral\/conceptos-nomina/);
  assert.match(schema, /payrollLiquidationSchema/);
  assert.match(schema, /payrollAdjustmentSchema/);
  assert.match(schema, /payrollExternalWorkdaysImportSchema/);
  assert.match(schema, /libranzaConceptSchema/);
  assert.match(schema, /employeeLibranzaSchema/);
  assert.match(schema, /employeeSalarySchema/);
  assert.match(schema, /calendarDaySchema/);
  assert.match(schema, /work_date/);
  assert.match(schema, /start_time/);
  assert.match(schema, /end_time/);
  assert.match(schema, /payrollConceptSchema/);
  assert.match(schema, /socialContributionSchema/);
  assert.match(schema, /socialBenefitPaymentSchema/);
  assert.match(schema, /payrollPeriodClosureSchema/);
  assert.match(schema, /payrollPeriodReopenSchema/);
  assert.match(schema, /arl_risk_class/);
  assert.doesNotMatch(schema, /exonerated_health_employer/);
  assert.doesNotMatch(schema, /exonerated_icbf/);
  assert.doesNotMatch(schema, /exonerated_sena/);
  assert.match(schema, /debit_account_code/);
  assert.match(schema, /credit_account_code/);
  const conceptMigration = read("apps/api/prisma/migrations/20260918150000_hr_payroll_concepts_detail/migration.sql");
  assert.match(conceptMigration, /CREATE TABLE IF NOT EXISTS th_nomina_conceptos/);
  assert.match(conceptMigration, /COMISION/);
  assert.match(conceptMigration, /BONIFICACION_NO_SALARIAL/);
  assert.match(conceptMigration, /JORNADA_ORDINARIA/);
  assert.match(conceptMigration, /AUX_TRANSPORTE/);
  assert.match(conceptMigration, /'automatico'/);
  assert.match(conceptMigration, /PRIMA_SERVICIOS/);
  assert.match(conceptMigration, /INTERESES_CESANTIAS/);
  assert.match(conceptMigration, /exclude_from_social_benefits_base/);
  assert.match(conceptMigration, /include_in_social_benefits_base/);
  assert.match(conceptMigration, /include_in_vacation_base/);
  assert.match(conceptMigration, /debit_account_code/);
  assert.match(conceptMigration, /credit_account_code/);
  const terminationMigration = read("apps/api/prisma/migrations/20260918160000_hr_employee_termination_liquidations/migration.sql");
  assert.match(terminationMigration, /CREATE TABLE IF NOT EXISTS th_prestaciones_saldos/);
  assert.match(terminationMigration, /CREATE TABLE IF NOT EXISTS th_liquidaciones_trabajador/);
  assert.match(terminationMigration, /benefit_balance_amount/);
  const contributionsMigration = read("apps/api/prisma/migrations/20260918170000_hr_social_contributions/migration.sql");
  assert.match(contributionsMigration, /CREATE TABLE IF NOT EXISTS th_aportes_sociales_documentos/);
  assert.match(contributionsMigration, /CREATE TABLE IF NOT EXISTS th_aportes_sociales_lineas/);
  assert.match(contributionsMigration, /APORTE_ARL_RIESGO_1/);
  assert.match(contributionsMigration, /APORTE_ARL_RIESGO_5/);
  assert.match(contributionsMigration, /APORTE_CAJA/);
  assert.match(contributionsMigration, /APORTE_ICBF/);
  assert.match(contributionsMigration, /APORTE_SENA/);
  const pensionSolidarityMigration = read("apps/api/prisma/migrations/20260918200000_hr_pension_solidarity_parameter/migration.sql");
  assert.match(pensionSolidarityMigration, /DED_FONDO_SOLIDARIDAD_PENSIONAL/);
  assert.match(pensionSolidarityMigration, /from_smmlv/);
  assert.match(pensionSolidarityMigration, /percent/);
  const closureMigration = read("apps/api/prisma/migrations/20260918180000_hr_payroll_period_closures/migration.sql");
  assert.match(closureMigration, /CREATE TABLE IF NOT EXISTS th_nomina_cierres_periodo/);
  assert.match(closureMigration, /total_social_contributions/);
  assert.match(closureMigration, /total_provisions/);
  const libranzaMigration = read("apps/api/prisma/migrations/20260918210000_hr_payroll_libranzas/migration.sql");
  assert.match(libranzaMigration, /CREATE TABLE IF NOT EXISTS th_libranza_conceptos/);
  assert.match(libranzaMigration, /CREATE TABLE IF NOT EXISTS th_libranza_empleados/);
  assert.match(libranzaMigration, /inactive_at TIMESTAMPTZ/);
  assert.match(libranzaMigration, /CREATE TABLE IF NOT EXISTS th_libranza_movimientos/);
  const benefitPaymentMigration = read("apps/api/prisma/migrations/20260919130000_hr_social_benefit_payments/migration.sql");
  assert.match(benefitPaymentMigration, /CREATE TABLE IF NOT EXISTS th_prestaciones_pagos_documentos/);
  assert.match(benefitPaymentMigration, /CREATE TABLE IF NOT EXISTS th_prestaciones_pagos_lineas/);
  assert.match(source, /previewSocialBenefitPayments/);
  assert.match(source, /runSocialBenefitPayments/);
  assert.match(source, /deleteSocialBenefitPaymentDocument/);
  assert.match(source, /missing_entity/);
});
