const test = require("node:test");
const assert = require("node:assert/strict");
process.env.DISABLE_REDIS = "true";
const { planVehicleCenter } = require("../src/modules/transport/vehicle-accounting");
const { groupSettlementIncome } = require("../src/modules/transport/settlement-posting");
const tree = { societies: [{ code: "SCJ" }], branches: [{ code: "200720", society_code: "SCJ" }], cost_centers: [] };
const vehicle = { id: 1, plate: "ABC123", base_site: "CEDI CALDAS", metadata: { accounting_branch_code: "200720" } };
test("vehicle centre belongs to its accounting branch and preserves operational site", () => {
  const center = planVehicleCenter(tree, vehicle);
  assert.equal(center.code, "ABC123");
  assert.equal(center.branch_code, "200720");
  assert.equal(vehicle.base_site, "CEDI CALDAS");
});
test("unknown branch and centres owned by other vehicles are rejected", () => {
  assert.throws(() => planVehicleCenter(tree, { ...vehicle, metadata: {} }), { code: "VEHICLE_ACCOUNTING_BRANCH_REQUIRED" });
  assert.throws(() => planVehicleCenter({ ...tree, cost_centers: [{ code: "ABC123", vehicle_id: 99, branch_code: "200720", society_code: "SCJ" }] }, vehicle), { code: "VEHICLE_ACCOUNTING_CENTER_CONFLICT" });
});

test("legacy exact and spaced plate centres recover their actual branch without renaming", () => {
  for (const code of ["ABC123", "ABC 123"]) {
    const legacy = { ...tree, cost_centers: [{ code, name: "Centro historico", branch_code: "200720", society_code: "SCJ", active: true }] };
    const center = planVehicleCenter(legacy, { ...vehicle, metadata: {} });
    assert.equal(center.code, code); assert.equal(center.branch_code, "200720"); assert.equal(center.society_code, "SCJ"); assert.equal(center.vehicle_id, 1);
  }
});

test("ambiguous, inactive and inconsistent legacy centres do not choose a default branch", () => {
  assert.throws(() => planVehicleCenter({ ...tree, cost_centers: [{ code: "0001", branch_code: "200720", society_code: "SCJ" }] }, { ...vehicle, cost_center: "0001" }), { code: "VEHICLE_ACCOUNTING_CENTER_CONFLICT" });
  const legacy = { code: "ABC 123", branch_code: "200720", society_code: "SCJ" };
  for (const centres of [[{ ...legacy, active: false }], [legacy, { ...legacy, code: "AB C123" }], [{ ...legacy, society_code: "OTHER" }]]) {
    assert.throws(() => planVehicleCenter({ ...tree, cost_centers: centres }, { ...vehicle, metadata: {} }), { code: "VEHICLE_ACCOUNTING_CENTER_CONFLICT" });
  }
  assert.throws(() => planVehicleCenter({ ...tree, branches: [{ ...tree.branches[0], active: false }], cost_centers: [legacy] }, { ...vehicle, metadata: {} }), { code: "VEHICLE_ACCOUNTING_BRANCH_REQUIRED" });
});
test("plate edits preserve the historical centre; moving its branch is rejected", () => {
  const owned = { ...tree, cost_centers: [planVehicleCenter(tree, vehicle)] };
  assert.equal(planVehicleCenter(owned, { ...vehicle, plate: "XYZ999" }, vehicle).code, "ABC123");
  assert.throws(() => planVehicleCenter({ ...owned, branches: [...tree.branches, { code: "OTHER", society_code: "SCJ" }] }, { ...vehicle, metadata: { accounting_branch_code: "OTHER" } }, vehicle), { code: "VEHICLE_ACCOUNTING_CENTER_CONFLICT" });
});
test("retired vehicles retain an inactive historical centre", () => {
  assert.equal(planVehicleCenter(tree, { ...vehicle, status: "retirado", active: false }).active, false);
});
function pkg() { return { currency: "COP", approved_total: 30.03, items: [{ id: 1, approved_amount: 10.01, metadata: { customer_id: 11 } }, { id: 2, approved_amount: 10.01, metadata: { customer_id: 22 } }, { id: 3, approved_amount: 10.01, metadata: { customer_id: 11 } }] }; }
test("income is grouped by actual service customer with exact cents", () => {
  assert.deepEqual(groupSettlementIncome(pkg()), [{ customer_id: 11, cents: 2002, items: [1, 3] }, { customer_id: 22, cents: 1001, items: [2] }]);
});
test("missing customer, negative amounts, unsupported currency and unapportioned adjustments block posting", () => {
  for (const mutate of [p => { p.items[0].metadata = {}; }, p => { p.items[0].approved_amount = -1; }, p => { p.currency = "USD"; }, p => { p.approved_total = 31; }, p => { p.approved_total = 0; }]) {
    const p = pkg(); mutate(p); assert.throws(() => groupSettlementIncome(p));
  }
});
