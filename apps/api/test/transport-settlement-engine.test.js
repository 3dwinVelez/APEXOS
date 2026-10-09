const test = require("node:test"), assert = require("node:assert/strict");
const E = require("../src/modules/transport/settlement-engine");

const rate = (over = {}) => ({ id: 1, code: "TAR-1", version: 2, carrier_id: 9, status: "activa", active: true, priority: 100, currency: "COP", valid_from: "2026-01-01T00:00:00.000Z", valid_to: "2026-12-31T00:00:00.000Z", base_rate: 500000, minimum_charge: 600000, price_per_km: 2500, price_per_kg: 25, price_per_m3: 1000, price_per_stop: 50000, fuel_surcharge_pct: 10, tolls_flat: 30000, ...over });

test("state machine allows documented transitions and blocks the rest", () => {
  assert.deepEqual(E.PACKAGE_TRANSITIONS.borrador, ["validando", "cancelada"]);
  assert.doesNotThrow(() => E.assertPackageTransition("en_revision", "aprobada"));
  assert.doesNotThrow(() => E.assertPackageTransition("contabilizada", "reversada"));
  assert.throws(() => E.assertPackageTransition("borrador", "aprobada"), (e) => e.code === "TMS_SETTLEMENT_INVALID_TRANSITION");
  assert.throws(() => E.assertPackageTransition("liquidada", "borrador"), (e) => e.code === "TMS_SETTLEMENT_INVALID_TRANSITION");
});

test("RB-11 immutability: approved/accounted packages are not editable", () => {
  assert.equal(E.isEditable("borrador"), true);
  assert.equal(E.isEditable("preliquidada"), true);
  assert.equal(E.isEditable("aprobada"), false);
  assert.throws(() => E.assertEditable("contabilizada"), (e) => e.code === "TMS_SETTLEMENT_NOT_EDITABLE");
  assert.doesNotThrow(() => E.assertEditable("con_novedad"));
});

test("RB-12 optimistic locking detects concurrent overwrite", () => {
  assert.doesNotThrow(() => E.assertVersionMatch(3, 3));
  assert.doesNotThrow(() => E.assertVersionMatch(undefined, 7));
  assert.throws(() => E.assertVersionMatch(3, 4), (e) => e.code === "TMS_SETTLEMENT_VERSION_CONFLICT");
});

test("RB-01 carrier eligibility blocks inactive/suspended carriers", () => {
  assert.equal(E.carrierEligibility({ active: true, status: "activo" }).eligible, true);
  assert.equal(E.carrierEligibility({ active: false, status: "activo" }).eligible, false);
  assert.equal(E.carrierEligibility({ active: true, status: "bloqueado" }).eligible, false);
  assert.throws(() => E.assertCarrierEligible({ active: true, status: "suspendido" }), (e) => e.code === "TMS_SETTLEMENT_CARRIER_INELIGIBLE");
});

test("RB-02 documentary eligibility honours bloqueo vs alerta policy", () => {
  const required = ["RUT", "POLIZA"];
  const refDate = "2026-06-15T00:00:00.000Z";
  const expired = [{ type: "RUT", status: "vigente", valid_to: "2026-01-01T00:00:00.000Z" }, { type: "POLIZA", status: "vigente", valid_to: "2027-01-01T00:00:00.000Z" }];
  const alert = E.documentaryEligibility({ policy: "alerta", required, documents: expired, referenceDate: refDate });
  assert.equal(alert.blocking, false);
  assert.deepEqual(alert.expired, ["RUT"]);
  const block = E.documentaryEligibility({ policy: "bloqueo", required, documents: expired, referenceDate: refDate });
  assert.equal(block.ok, false);
  assert.equal(block.blocking, true);
  const missing = E.documentaryEligibility({ policy: "bloqueo", required, documents: [{ type: "RUT", status: "vigente", valid_to: "2027-01-01T00:00:00.000Z" }], referenceDate: refDate });
  assert.deepEqual(missing.missing, ["POLIZA"]);
  assert.equal(missing.blocking, true);
  const expiring = E.documentaryEligibility({ policy: "alerta", required, documents: [{ type: "RUT", status: "vigente", valid_to: "2026-07-01T00:00:00.000Z" }, { type: "POLIZA", status: "vigente", valid_to: "2027-01-01T00:00:00.000Z" }], referenceDate: refDate });
  assert.deepEqual(expiring.expiring, ["RUT"]);
  assert.equal(expiring.blocking, false);
});

test("RB-03 duplicate guide detection across and within scope", () => {
  const existing = ["GUIA-1"];
  const items = [{ guide_reference: "GUIA-1" }, { guide_reference: "GUIA-2" }, { guide_reference: "guia-2" }];
  const result = E.detectDuplicateGuides(items, existing);
  assert.deepEqual(result.duplicates.sort(), ["GUIA-1", "guia-2"]);
  assert.equal(result.count, 2);
  assert.equal(E.detectDuplicateGuides([{ guide_reference: "A" }, { guide_reference: "B" }], []).count, 0);
});

test("RB-04 resolveRate filters out-of-vigor tariffs", () => {
  const context = { carrier_id: 9, service_date: "2026-06-15T00:00:00.000Z", destination_city: "Bogota", vehicle_type: "camion", service_level: "normal" };
  const expired = rate({ id: 5, code: "OLD", valid_from: "2025-01-01T00:00:00.000Z", valid_to: "2025-12-31T00:00:00.000Z" });
  const current = rate({ id: 6, code: "NOW" });
  const { rate: picked, trace } = E.resolveRate([expired, current], context);
  assert.equal(picked.id, 6);
  assert.ok(trace.rejected.some((r) => r.id === 5 && r.reason === "fuera_de_vigencia"));
});

test("RB-05 equal-priority tariffs raise an ambiguity error, never a silent pick", () => {
  const context = { carrier_id: 9, service_date: "2026-06-15T00:00:00.000Z" };
  const a = rate({ id: 1, code: "A", priority: 10 });
  const b = rate({ id: 2, code: "B", priority: 10 });
  assert.throws(() => E.resolveRate([a, b], context), (e) => e.code === "TMS_SETTLEMENT_RATE_AMBIGUOUS");
});

test("resolveRate picks the single highest-priority (lowest number) tariff", () => {
  const context = { carrier_id: 9, service_date: "2026-06-15T00:00:00.000Z" };
  const low = rate({ id: 1, code: "LOW", priority: 50 });
  const high = rate({ id: 2, code: "HIGH", priority: 5 });
  const { rate: picked, trace } = E.resolveRate([low, high], context);
  assert.equal(picked.id, 2);
  assert.equal(trace.selected.matched_by, "vigencia+contexto+prioridad");
});

test("geographic scope: origin and municipality participate in rate matching", () => {
  const scoped = rate({ id: 1, code: "GEO", origin_department: "Antioquia", origin_city: "Medellin", origin_municipality: "Envigado", destination_municipality: "Barbosa" });
  const context = { origin_department: "antioquia", origin_city: "MEDELLIN ", origin_municipality: "envigado", destination_city: "Bogota", destination_municipality: "barbosa" };
  assert.equal(E.rateMatchesContext(scoped, context), true);
  assert.equal(E.rateMatchesContext(scoped, { ...context, origin_municipality: "itagui" }), false);
  assert.equal(E.rateMatchesContext(scoped, { ...context, origin_city: "Cali" }), false);
  assert.equal(E.rateMatchesContext(scoped, { ...context, destination_municipality: "soacha" }), false);
});

test("geographic scope: null means wildcard on either side", () => {
  const unscoped = rate({ id: 1, code: "FREE" });
  const context = { origin_city: "Bogota", destination_municipality: "Soacha" };
  assert.equal(E.rateMatchesContext(unscoped, context), true);
  const scoped = rate({ id: 2, code: "GEO", destination_municipality: "Soacha" });
  assert.equal(E.rateMatchesContext(scoped, {}), true);
  assert.equal(E.rateMatchesContext(scoped, { destination_municipality: "soacha" }), true);
  assert.equal(E.rateMatchesContext(scoped, { destination_municipality: "chia" }), false);
});

test("resolveRate prefers the municipality-scoped rate and reports the context it used", () => {
  const generic = rate({ id: 1, code: "GEN", priority: 200 });
  const scoped = rate({ id: 2, code: "GEO", priority: 10, destination_municipality: "Envigado" });
  const context = { carrier_id: 9, service_date: "2026-06-15T00:00:00.000Z", destination_city: "Medellin", destination_municipality: "envigado" };
  const { rate: picked, trace } = E.resolveRate([generic, scoped], context);
  assert.equal(picked.id, 2);
  assert.equal(trace.context.destination_municipality, "envigado");
  assert.equal(trace.context.origin_municipality, null);
  assert.throws(() => E.resolveRate([scoped], { carrier_id: 9, destination_municipality: "itagui" }), (e) => e.code === "TMS_SETTLEMENT_RATE_NOT_FOUND");
});

test("resolveRate never silently picks between municipality-scoped rates of equal priority", () => {
  const a = rate({ id: 1, code: "A", priority: 10, destination_municipality: "Envigado" });
  const b = rate({ id: 2, code: "B", priority: 10, destination_municipality: "Itagui" });
  assert.throws(() => E.resolveRate([a, b], { carrier_id: 9, service_date: "2026-06-15T00:00:00.000Z" }), (e) => e.code === "TMS_SETTLEMENT_RATE_AMBIGUOUS");
});


test("missing tariff never yields a silent zero value", () => {
  const context = { carrier_id: 9, service_date: "2026-06-15T00:00:00.000Z" };
  assert.throws(() => E.resolveRate([], context), (e) => e.code === "TMS_SETTLEMENT_RATE_NOT_FOUND");
  assert.throws(() => E.resolveRate([rate({ carrier_id: 999 })], context), (e) => e.code === "TMS_SETTLEMENT_RATE_NOT_FOUND");
});

test("resolveRate ignores inactive tariffs and reports them in the trace", () => {
  const context = { carrier_id: 9, service_date: "2026-06-15T00:00:00.000Z" };
  const inactive = rate({ id: 3, code: "INA", status: "inactiva" });
  assert.throws(() => E.resolveRate([inactive], context), (e) => e.code === "TMS_SETTLEMENT_RATE_NOT_FOUND");
  const { trace } = E.resolveRate([inactive, rate({ id: 4, code: "OK" })], context);
  assert.ok(trace.rejected.some((r) => r.id === 3 && r.reason === "inactiva"));
});

test("RB-06 calculateItemAmount is explainable, applies fuel + minimum and freezes a snapshot", () => {
  const item = { quantity: 1, distance_km: 100, weight_kg: 1000, volume_m3: 8, stop_count: 2 };
  const result = E.calculateItemAmount(rate(), item);
  const expectedBeforeFuel = 500000 + 2500 * 100 + 25 * 1000 + 1000 * 8 + 50000 * 2 + 30000;
  const expectedFuel = Math.round(expectedBeforeFuel * 0.10);
  assert.equal(result.amount, expectedBeforeFuel + expectedFuel);
  assert.equal(result.minimum_applied, false);
  assert.equal(result.snapshot.rate_card_id, 1);
  assert.equal(result.snapshot.rate_version, 2);
  assert.deepEqual(Object.keys(result.components).sort(), ["base", "distance", "fuel", "stops", "tolls", "volume", "weight"]);
});

test("calculateItemAmount enforces the minimum charge and multiplies by quantity", () => {
  const tiny = E.calculateItemAmount(rate({ base_rate: 0, price_per_km: 0, price_per_kg: 0, price_per_m3: 0, price_per_stop: 0, tolls_flat: 0, fuel_surcharge_pct: 0, minimum_charge: 600000 }), { quantity: 1 });
  assert.equal(tiny.amount, 600000);
  assert.equal(tiny.minimum_applied, true);
  const three = E.calculateItemAmount(rate({ minimum_charge: 0, tolls_flat: 0 }), { quantity: 3, stop_count: 0, distance_km: 0, weight_kg: 0, volume_m3: 0 });
  assert.equal(three.amount, E.round2(500000 * 1.10 * 3));
});

test("money never drifts through float: 0.1 x 3 stays exact in cents", () => {
  assert.equal(E.round2(0.1 * 3), 0.3);
  assert.equal(E.cents(1234.56), 123456);
  assert.equal(E.fromCents(E.cents(0.1) * 3), 0.3);
});

test("RB-07 totals separate calculated from adjusted values", () => {
  const items = [
    { calculated_amount: 1000.00, adjusted_amount: 950.00 },
    { calculated_amount: 500.50, adjusted_amount: null },
    { calculated_amount: 200.25 }
  ];
  const totals = E.computeTotals(items);
  assert.equal(totals.calculated_total, 1700.75);
  assert.equal(totals.adjusted_total, 1650.75);
  assert.equal(totals.adjustment_delta, -50);
  assert.equal(totals.line_count, 3);
});

test("RB-08 open blocking issues gate transitions", () => {
  const issues = [{ id: 1, blocking: true, status: "abierta", category: "tarifa_inexistente" }, { id: 2, blocking: true, status: "resuelta" }, { id: 3, blocking: false, status: "abierta" }];
  const open = E.openBlockingIssues(issues);
  assert.equal(open.length, 1);
  assert.throws(() => E.assertNoOpenBlockingIssues(issues, "contabilizar"), (e) => e.code === "TMS_SETTLEMENT_BLOCKING_ISSUE_OPEN");
  assert.doesNotThrow(() => E.assertNoOpenBlockingIssues([{ blocking: true, status: "cerrada" }]));
});

test("RB-09 segregation prevents the creator from approving their own package", () => {
  assert.throws(() => E.assertSegregation({ createdBy: 7, actorId: 7, enforce: true }), (e) => e.code === "TMS_SETTLEMENT_SEGREGATION_VIOLATION");
  assert.doesNotThrow(() => E.assertSegregation({ createdBy: 7, actorId: 8, enforce: true }));
  assert.doesNotThrow(() => E.assertSegregation({ createdBy: 7, actorId: 7, enforce: false }));
});

test("RB-10 accounting idempotency key is deterministic and gated by status", () => {
  const k1 = E.accountingIdempotencyKey("PAQ-1", "2026-06");
  assert.equal(k1, E.accountingIdempotencyKey("paq-1", "2026-06"));
  assert.notEqual(k1, E.accountingIdempotencyKey("PAQ-1", "2026-07"));
  assert.throws(() => E.assertAccountingAllowed({ status: "preliquidada", issues: [] }), (e) => e.code === "TMS_SETTLEMENT_NOT_APPROVED");
  assert.throws(() => E.assertAccountingAllowed({ status: "aprobada", issues: [{ blocking: true, status: "abierta" }] }), (e) => e.code === "TMS_SETTLEMENT_BLOCKING_ISSUE_OPEN");
  assert.doesNotThrow(() => E.assertAccountingAllowed({ status: "aprobada", issues: [] }));
});

test("rejection requires a comment", () => {
  assert.throws(() => E.assertDecisionComment("rechazada", "  "), (e) => e.code === "TMS_SETTLEMENT_REJECTION_REQUIRES_COMMENT");
  assert.doesNotThrow(() => E.assertDecisionComment("rechazada", "Tarifa mal aplicada"));
  assert.doesNotThrow(() => E.assertDecisionComment("aprobada", undefined));
});
