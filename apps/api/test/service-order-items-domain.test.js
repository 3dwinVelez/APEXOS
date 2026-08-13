const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeItem, validateItems, aggregateItemProgress, legacyItem } = require("../src/modules/services/orderItems");

function items(count, statuses = []) {
  return Array.from({ length: count }, (_, index) => ({
    reference_id: index + 1,
    service_type: index % 2 ? "desmontaje" : "montaje",
    quantity: index + 1,
    status: statuses[index] || "pendiente"
  }));
}

for (const count of [1, 3, 10, 20]) {
  test(`accepts ${count} service request(s) without changing query shape`, () => {
    const rows = items(count);
    assert.equal(validateItems(rows), "");
    assert.equal(rows.map(normalizeItem).length, count);
  });
}

test("rejects empty, oversized and invalid requests", () => {
  assert.match(validateItems([]), /entre 1 y 20/);
  assert.match(validateItems(items(21)), /entre 1 y 20/);
  assert.match(validateItems([{ reference_id: 0, service_type: "montaje", quantity: 1 }]), /referencia valida/);
  assert.match(validateItems([{ reference_id: 1, service_type: "", quantity: 1 }]), /tipo de servicio/);
  assert.match(validateItems([{ reference_id: 1, service_type: "montaje", quantity: 0 }]), /cantidad/);
});

test("aggregates pending, active, partial and complete states without a new global status", () => {
  assert.deepEqual(aggregateItemProgress(items(3)), { total: 3, pending: 3, active: 0, completed: 0, blocked: 0, all_completed: false, partial: false, order_status: "pendiente" });
  assert.equal(aggregateItemProgress(items(3, ["completada", "en_curso", "pendiente"])).order_status, "ejecucion");
  assert.equal(aggregateItemProgress(items(3, ["completada", "completada", "pendiente"])).partial, true);
  assert.equal(aggregateItemProgress(items(3, ["completada", "completada", "no_ejecutada"])).all_completed, true);
  assert.equal(aggregateItemProgress(items(1, ["bloqueada"])).blocked, 1);
});

test("legacy orders remain readable as one synthetic request", () => {
  const order = { id: 7, reference_id: 9, reference: { id: 9, code: "LEGACY" }, service_type: "montaje", status: "ejecucion", version: 3, notes: "Orden previa", photos: [{ id: 1 }], incidents: [] };
  const result = legacyItem(order);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "legacy-7");
  assert.equal(result[0].legacy, true);
  assert.equal(result[0].photos.length, 1);
});

test("normalization keeps independent references, service types and quantities", () => {
  const rows = items(3).map(normalizeItem);
  assert.deepEqual(rows.map((row) => row.reference_id), [1, 2, 3]);
  assert.deepEqual(rows.map((row) => row.service_type), ["montaje", "desmontaje", "montaje"]);
  assert.deepEqual(rows.map((row) => row.quantity), [1, 2, 3]);
});
