const assert = require("node:assert/strict");
const test = require("node:test");
const { calculateSocialContributionSegments, commercialDaysBetween } = require("../src/modules/hr/socialContributionSegments");

const rates = {
  salud: { employee: 4, employer: 8.5 },
  pension: { employee: 4, employer: 12 },
  arl: { employee: 0, employer: 1 },
  parafiscales: { employer: 4 }
};
const ref = { monthlyAmount: 2400000, sourcePeriod: "2026-08" };
const baseInput = (adjustments, extra = {}) => ({
  periodStart: "2026-01-01", periodEnd: "2026-01-30", periodKey: "mes:2026-01-01:2026-01-30",
  currentWorkedCotizableRemuneration: 2000000, workedDays: 20, adjustments, contributionRates: rates, ...extra
});

test("licencias remuneradas conservan política ARL independiente por evento", () => {
  const result = calculateSocialContributionSegments(baseInput([
    { type: "LICENCIA_REMUNERADA", start: "2026-01-21", end: "2026-01-25", days: 5, frozenHistoricalReference: ref, recognizedValue: 500000, metadata: { lr_arl_policy: "cotiza" } },
    { type: "LICENCIA_REMUNERADA", start: "2026-01-26", end: "2026-01-30", days: 5, frozenHistoricalReference: ref, recognizedValue: 500000, metadata: { lr_arl_policy: "no_cotiza" } }
  ]));
  const licenses = result.segments.filter((segment) => segment.type === "LICENCIA_REMUNERADA");
  assert.equal(licenses[0].ibcAfter.arl, 400000);
  assert.equal(licenses[1].ibcAfter.arl, 0);
  assert.equal(result.totals.basesAfter.arl, 2400000);
  assert.equal(result.totals.basesAfter.parafiscales, 3000000);
});

test("conteo compartido conserva quincenas de febrero y días originales de eventos periodizados", () => {
  assert.equal(commercialDaysBetween(new Date("2026-02-16T05:00:00Z"), new Date("2026-02-28T05:00:00Z")), 15);
  assert.equal(commercialDaysBetween(new Date("2028-02-16T00:00:00Z"), new Date("2028-02-29T00:00:00Z")), 15);
  const result = calculateSocialContributionSegments(baseInput([{
    type: "VAC_DISFRUTADAS", start: "2026-05-25", end: "2026-05-31", days: 6, originalDays: 11,
    originalEventStart: "2026-05-25", originalEventEnd: "2026-06-05", frozenHistoricalReference: ref, recognizedValue: 480000
  }], { periodStart: "2026-05-01", periodEnd: "2026-05-31", workedDays: 24, currentWorkedCotizableRemuneration: 2400000 }));
  assert.equal(result.segments.find((segment) => segment.type === "VAC_DISFRUTADAS").days, 6);
  assert.equal(result.totals.basesAfter.salud, 2880000);
  const febSecondHalf = calculateSocialContributionSegments(baseInput([], {
    periodStart: "2026-02-16", periodEnd: "2026-02-28", workedDays: 15, currentWorkedCotizableRemuneration: 1500000
  }));
  assert.equal(febSecondHalf.period.normalizedDays, 15);
  const febFullVacation = calculateSocialContributionSegments(baseInput([{
    type: "VAC_DISFRUTADAS", start: "2026-02-01", end: "2026-02-28", days: 28, frozenHistoricalReference: ref, recognizedValue: 2400000
  }], { periodStart: "2026-02-01", periodEnd: "2026-02-28", workedDays: 0, currentWorkedCotizableRemuneration: 0 }));
  assert.equal(febFullVacation.segments[0].days, 30);
  assert.equal(febFullVacation.totals.basesAfter.salud, 2400000);
});

test("IBC redondea al peso superior antes del aporte y concilia las bases segmentadas", () => {
  const result = calculateSocialContributionSegments(baseInput([], {
    workedDays: 30, currentWorkedCotizableRemuneration: 3000000.25,
    roundingPila: { ibc: { step: 1, mode: "ceil" }, default: { step: 100, mode: "ceil" } }
  }));
  assert.equal(result.totals.basesBefore.salud, 3000000.25);
  assert.equal(result.totals.basesAfter.salud, 3000001);
  assert.equal(result.totals.employeeAmounts.salud, 120000.04);
  assert.equal(result.totals.pilaAmounts.salud, 375100);

  const split = calculateSocialContributionSegments(baseInput([
    { type: "VAC_DISFRUTADAS", start: "2026-01-10", end: "2026-01-10", days: 1, frozenHistoricalReference: ref, recognizedValue: 80000 },
    { type: "VAC_DISFRUTADAS", start: "2026-01-20", end: "2026-01-20", days: 1, frozenHistoricalReference: ref, recognizedValue: 80000 }
  ], { workedDays: 28, capsFloors: { salud: { cap: 100.01 } } }));
  const sum = split.segments.reduce((total, segment) => total + segment.ibcAfter.salud, 0);
  assert.equal(Math.round(sum * 100), 10001);
  assert.equal(Math.round(split.totals.basesAfter.salud * 100), 10001);
});

test("caso A: trabajo y vacaciones disfrutadas separan IBC y excluyen ARL VAC", () => {
  const result = calculateSocialContributionSegments(baseInput([{ type: "VAC_DISFRUTADAS", start: "2026-01-21", end: "2026-01-30", days: 10, frozenHistoricalReference: ref, recognizedValue: 900000 }]));
  assert.equal(result.totals.basesAfter.salud, 2800000);
  assert.equal(result.totals.basesAfter.pension, 2800000);
  assert.equal(result.totals.basesAfter.arl, 2000000);
  assert.equal(result.totals.employeeAmounts.salud, 112000);
  assert.equal(result.totals.employeeAmounts.pension, 112000);
  assert.equal(result.segments[1].pila_code, "VAC-LR");
  assert.equal(result.segments[1].ibcAfter.arl, 0);
  assert.equal(result.segments[1].reference.monthlyAmount, 2400000);
});

test("caso B: SLN no descuenta empleado y conserva aportes patronales parametrizados", () => {
  const result = calculateSocialContributionSegments({
    ...baseInput([{ type: "SLN", start: "2026-01-16", end: "2026-01-30", days: 15, frozenHistoricalReference: { monthlyAmount: 3000000, sourcePeriod: "2025-12" } }]),
    currentWorkedCotizableRemuneration: 1500000, workedDays: 15
  });
  const sln = result.segments.find((segment) => segment.type === "SLN");
  assert.equal(sln.pila_code, "SLN");
  assert.equal(sln.employeeAmounts.salud, 0);
  assert.equal(sln.employeeAmounts.pension, 0);
  assert.equal(sln.employerAmounts.salud, 127500);
  assert.equal(sln.employerAmounts.pension, 180000);
  assert.equal(sln.ibcAfter.arl, 0);
  assert.equal(sln.ibcAfter.parafiscales, 0);
});

test("caso C: vacaciones compensadas no generan días SS y sí base parafiscal reconocida", () => {
  const result = calculateSocialContributionSegments({
    ...baseInput([{ type: "VAC_COMPENSADAS", start: "2026-01-30", end: "2026-01-30", days: 0, recognizedValue: 1000000 }]),
    currentWorkedCotizableRemuneration: 3000000, workedDays: 30
  });
  const compensation = result.segments.find((segment) => segment.type === "VAC_COMPENSADAS");
  assert.equal(compensation.days, 0);
  assert.equal(compensation.pila_code, null);
  assert.equal(compensation.ibcAfter.salud, 0);
  assert.equal(compensation.ibcAfter.parafiscales, 1000000);
  assert.equal(result.totals.basesAfter.salud, 3000000);
  assert.equal(result.totals.basesAfter.parafiscales, 4000000);
});

test("caso D: referencia congelada cruza meses y anticipos no superan la retención", () => {
  const result = calculateSocialContributionSegments({
    periodStart: "2026-02-01", periodEnd: "2026-02-28", periodKey: "mes:2026-02-01:2026-02-28",
    currentWorkedCotizableRemuneration: 1500000, workedDays: 13,
    adjustments: [{ type: "VAC_DISFRUTADAS", start: "2026-02-01", end: "2026-02-15", days: 15, continuityKey: "vac-1", frozenHistoricalReference: { monthlyAmount: 2400000, sourcePeriod: "2026-01" } }],
    contributionRates: rates, advancesRetentions: { "salud:mes:2026-02-01:2026-02-28": 100000 }
  });
  assert.equal(result.segments.find((segment) => segment.type === "VAC_DISFRUTADAS").reference.sourcePeriod, "2026-01");
  assert.equal(result.totals.retentionsApplied.salud, 100000);
  assert.equal(result.totals.employeeAmounts.salud, 108000);
  assert.equal(result.period.normalizedDays, 30);
});

test("cap y piso se aplican sobre el agregado, nunca sobre cada segmento", () => {
  const result = calculateSocialContributionSegments(baseInput([{ type: "VAC_DISFRUTADAS", start: "2026-01-21", end: "2026-01-30", days: 10, frozenHistoricalReference: ref }], { capsFloors: { salud: { cap: 2500000 } } }));
  assert.equal(result.totals.basesAfter.salud, 2500000);
  assert.equal(result.warnings[0].code, "IBC_AGGREGATE_CAP_FLOOR");
  assert.ok(result.segments.every((segment) => segment.ibcAfter.salud <= segment.ibcBefore.salud));
});

test("rechaza referencia faltante, novedades no soportadas y solapamientos", () => {
  assert.throws(() => calculateSocialContributionSegments(baseInput([{ type: "SLN", start: "2026-01-21", end: "2026-01-30", days: 10 }])), { code: "IBC_HISTORICAL_REFERENCE_REQUIRED" });
  assert.throws(() => calculateSocialContributionSegments(baseInput([{ type: "INCAPACIDAD_GENERAL", start: "2026-01-21", end: "2026-01-30", days: 10 }])), { code: "IBC_UNSUPPORTED_NOVELTY" });
  assert.throws(() => calculateSocialContributionSegments(baseInput([
    { type: "SLN", start: "2026-01-11", end: "2026-01-20", days: 10, frozenHistoricalReference: ref },
    { type: "VAC_DISFRUTADAS", start: "2026-01-20", end: "2026-01-25", days: 6, frozenHistoricalReference: ref }
  ])), { code: "IBC_OVERLAPPING_NOVELTIES" });
});

test("rechaza cambio de referencia dentro de una novedad continua", () => {
  assert.throws(() => calculateSocialContributionSegments(baseInput([
    { type: "SLN", start: "2026-01-01", end: "2026-01-05", days: 5, continuityKey: "sln-1", frozenHistoricalReference: ref },
    { type: "SLN", start: "2026-01-06", end: "2026-01-10", days: 5, continuityKey: "sln-1", frozenHistoricalReference: { monthlyAmount: 2500000, sourcePeriod: "2026-08" } }
  ])), { code: "IBC_HISTORICAL_REFERENCE_CHANGED" });
});

test("redondea por subsistema y separa días reportados de días aportantes", () => {
  const result = calculateSocialContributionSegments({
    ...baseInput([{ type: "VAC_DISFRUTADAS", start: "2026-01-21", end: "2026-01-30", days: 10, frozenHistoricalReference: ref }]),
    roundingPila: { salud: { employee: { decimals: 0, mode: "ceil" } }, pension: { employee: { decimals: 0, mode: "floor" } } }
  });
  const vacation = result.segments.find((segment) => segment.type === "VAC_DISFRUTADAS");
  assert.equal(vacation.daysReportBySubsystem.arl, 10);
  assert.equal(vacation.daysContributing.arl, 0);
  assert.equal(vacation.pilaAmounts.employee.salud, 32000);
  assert.equal(vacation.pilaAmounts.employee.pension, 32000);
  assert.equal(vacation.ibcBeforeAfterBySubsystem.after.salud, 800000);
});

test("separa valor reconocido de IBC histórico y rechaza fechas imposibles", () => {
  const result = calculateSocialContributionSegments(baseInput([{ type: "VAC_DISFRUTADAS", start: "2026-01-21", end: "2026-01-30", days: 10, amount: 9999999, frozenHistoricalReference: ref, recognizedValue: 123456 }]));
  const vacation = result.segments.find((segment) => segment.type === "VAC_DISFRUTADAS");
  assert.equal(vacation.amount, 800000);
  assert.equal(vacation.ibcBefore.salud, 800000);
  assert.equal(vacation.ibcBefore.parafiscales, 123456);
  assert.throws(() => calculateSocialContributionSegments(baseInput([{ type: "SLN", start: "2026-02-31", end: "2026-02-31", days: 1, frozenHistoricalReference: ref }])), /Fecha inválida/);
});

test("eventos independientes admiten referencias diferentes; continuidad explícita las congela", () => {
  const result = calculateSocialContributionSegments(baseInput([
    { type: "SLN", start: "2026-01-01", end: "2026-01-05", days: 5, frozenHistoricalReference: { monthlyAmount: 2000000 } },
    { type: "SLN", start: "2026-01-06", end: "2026-01-10", days: 5, frozenHistoricalReference: { monthlyAmount: 2500000 } }
  ]));
  assert.equal(result.segments.filter((segment) => segment.type === "SLN").length, 2);
  assert.throws(() => calculateSocialContributionSegments(baseInput([{ type: "LICENCIA_REMUNERADA", start: "2026-01-01", end: "2026-01-05", days: 5, frozenHistoricalReference: ref }])), { code: "IBC_LR_ARL_POLICY_REQUIRED" });
  assert.throws(() => calculateSocialContributionSegments(baseInput([], { employee: { regime: "integral", sector: "private" } })), { code: "IBC_UNSUPPORTED_REGIME" });
});

test("retención anticipada exige periodo exacto", () => {
  assert.throws(() => calculateSocialContributionSegments({ periodStart: "2026-01-01", periodEnd: "2026-01-30", currentWorkedCotizableRemuneration: 100, workedDays: 1, contributionRates: rates, advancesRetentions: { salud: 1000 } }), { code: "IBC_ADVANCE_PERIOD_REQUIRED" });
});

test("normaliza febrero completo a 30, vacaciones completas a 30 y no falla en mes de 31", () => {
  const common = { contributionRates: rates, currentWorkedCotizableRemuneration: 3000000, workedDays: 30 };
  const febWork = calculateSocialContributionSegments({ ...common, periodStart: "2026-02-01", periodEnd: "2026-02-28", periodKey: "feb" });
  assert.equal(febWork.period.normalizedDays, 30);
  assert.equal(febWork.segments[0].days, 30);
  const febVac = calculateSocialContributionSegments({ periodStart: "2026-02-01", periodEnd: "2026-02-28", periodKey: "feb-vac", currentWorkedCotizableRemuneration: 0, workedDays: 0, contributionRates: rates, adjustments: [{ type: "VAC_DISFRUTADAS", start: "2026-02-01", end: "2026-02-28", frozenHistoricalReference: ref }] });
  assert.equal(febVac.segments.find((segment) => segment.type === "VAC_DISFRUTADAS").days, 30);
  const jan31 = calculateSocialContributionSegments({ ...common, periodStart: "2026-01-01", periodEnd: "2026-01-31", periodKey: "jan31" });
  assert.equal(jan31.period.normalizedDays, 30);
  assert.equal(jan31.segments[0].days, 30);
  const quincena = calculateSocialContributionSegments({ ...common, periodStart: "2026-02-01", periodEnd: "2026-02-15", periodType: "quincena", periodKey: "q1" , workedDays: 15, currentWorkedCotizableRemuneration: 1500000 });
  assert.equal(quincena.period.normalizedDays, 15);
  assert.equal(quincena.segments[0].days, 15);
});

test("entrada y retiro recortan el periodo y redondeo puede ser sobre obligación total", () => {
  const result = calculateSocialContributionSegments({ periodStart: "2026-01-01", periodEnd: "2026-01-31", entryDate: "2026-01-10", exitDate: "2026-01-20", currentWorkedCotizableRemuneration: 1100000, workedDays: 11, contributionRates: rates, roundingPila: { salud: { total: { decimals: -2, mode: "ceil" } } } });
  assert.equal(result.period.start, "2026-01-10");
  assert.equal(result.period.end, "2026-01-20");
  assert.equal(result.period.normalizedDays, 11);
  assert.equal(result.segments[0].days, 11);
  assert.equal(result.totals.pilaAmounts.salud, 137500);
});

test("SLN permite override patronal de pensión solo en SLN y redondeo por múltiplos de 100", () => {
  const result = calculateSocialContributionSegments({
    periodStart: "2026-07-01", periodEnd: "2026-07-30", currentWorkedCotizableRemuneration: 0, workedDays: 0,
    contributionRates: rates, overrideSLN: { pensionEmployerPercent: 16 },
    roundingPila: { pension: { total: { decimals: 2, mode: "ceil", step: 100 } } },
    adjustments: [{ type: "SLN", start: "2026-07-01", end: "2026-07-30", days: 30, frozenHistoricalReference: { monthlyAmount: 125001, sourcePeriod: "2026-06" } }]
  });
  const segment = result.segments[0];
  assert.equal(segment.employerAmounts.pension, 20000.16);
  assert.equal(segment.pilaAmounts.total.pension, 20100);
  assert.throws(() => calculateSocialContributionSegments({ periodStart: "2026-07-01", periodEnd: "2026-07-30", contributionRates: rates, overrideSLN: { pensionEmployerPercent: 15 }, adjustments: [{ type: "SLN", start: "2026-07-01", end: "2026-07-30", days: 30, frozenHistoricalReference: ref }] }), { code: "IBC_SLN_PENSION_RATE_INVALID" });
});

test("PILA conserva 15 días SLN en la segunda mitad de febrero y no reduce la base a 13 días", () => {
  const result = calculateSocialContributionSegments({ periodStart: "2026-02-01", periodEnd: "2026-02-28", periodType: "mes", currentWorkedCotizableRemuneration: 1500000, workedDays: 15, contributionRates: rates, adjustments: [{ type: "SLN", start: "2026-02-16", end: "2026-02-28", days: 15, frozenHistoricalReference: { monthlyAmount: 3000000, sourcePeriod: "2026-01" } }] });
  const sln = result.segments.find((segment) => segment.type === "SLN");
  assert.equal(sln.days, 15);
  assert.equal(result.totals.basesAfter.salud, 3000000);
  assert.equal(result.totals.employeeAmounts.salud, 60000);
  assert.equal(result.totals.employeeAmounts.pension, 60000);
});

test("enero 2 a 29 es periodo parcial de 28 días, no mes comercial completo", () => {
  const result = calculateSocialContributionSegments({ periodStart: "2026-01-02", periodEnd: "2026-01-29", periodType: "mes", currentWorkedCotizableRemuneration: 2800000, workedDays: 28, contributionRates: rates });
  assert.equal(result.period.normalizedDays, 28);
  assert.equal(result.segments[0].days, 28);
});

test("fecha de ingreso anterior al periodo no convierte febrero completo en parcial", () => {
  const result = calculateSocialContributionSegments({ periodStart: "2026-02-01", periodEnd: "2026-02-28", entryDate: "2025-01-01", currentWorkedCotizableRemuneration: 3000000, workedDays: 30, contributionRates: rates });
  assert.equal(result.period.normalizedDays, 30);
  assert.equal(result.segments[0].days, 30);
});

test("evento cruzado usa fechas originales para prorratear días comerciales por mes", () => {
  const common = { periodType: "mes", currentWorkedCotizableRemuneration: 0, workedDays: 0, contributionRates: rates, adjustments: [{ type: "VAC_DISFRUTADAS", originalEventStart: "2026-05-25", originalEventEnd: "2026-06-05", start: "2026-05-25", end: "2026-06-05", days: 11, frozenHistoricalReference: { monthlyAmount: 2400000, sourcePeriod: "2026-04" } }] };
  const may = calculateSocialContributionSegments({ ...common, periodStart: "2026-05-01", periodEnd: "2026-05-30" });
  const june = calculateSocialContributionSegments({ ...common, periodStart: "2026-06-01", periodEnd: "2026-06-30" });
  assert.equal(may.segments.find((segment) => segment.type === "VAC_DISFRUTADAS").days, 6);
  assert.equal(june.segments.find((segment) => segment.type === "VAC_DISFRUTADAS").days, 5);
});
