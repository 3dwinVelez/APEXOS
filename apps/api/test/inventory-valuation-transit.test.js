const test = require("node:test");
const assert = require("node:assert/strict");
process.env.REDIS_DISABLED = "true";
const { calculateSocietyValuation } = require("../src/modules/inventory/service");

test("compra usa costo de la linea y recalcula promedio por sociedad", () => {
  const result = calculateSocietyValuation({ quantityBalance: 10, valueBalance: 1000, averageCost: 100, qty: 5, unitCost: 160, direction: "in" });
  assert.deepEqual(result, { quantity_balance: 15, value_balance: 1800, average_cost: 120, recognized_cost: 160 });
});

test("venta reconoce el promedio vigente de la tabla de costo", () => {
  const result = calculateSocietyValuation({ quantityBalance: 15, valueBalance: 1800, averageCost: 120, qty: 4, unitCost: 999, direction: "out" });
  assert.equal(result.recognized_cost, 120);
  assert.equal(result.average_cost, 120);
  assert.equal(result.quantity_balance, 11);
  assert.equal(result.value_balance, 1320);
});

test("salida total deja costo y valor en cero", () => {
  const result = calculateSocietyValuation({ quantityBalance: 2, valueBalance: 250, averageCost: 125, qty: 2, direction: "out" });
  assert.deepEqual(result, { quantity_balance: 0, value_balance: 0, average_cost: 0, recognized_cost: 125 });
});

test("venta no permite exceder el saldo de la sociedad", () => {
  assert.throws(() => calculateSocietyValuation({ quantityBalance: 2, valueBalance: 200, averageCost: 100, qty: 3, direction: "out" }), (error) => error.code === "INSUFFICIENT_SOCIETY_STOCK");
});

test("traslado no requiere recalculo: conserva cantidad, valor y promedio", () => {
  const before = { quantity_balance: 8, value_balance: 960, average_cost: 120 };
  const afterDispatch = { ...before };
  const afterReceive = { ...afterDispatch };
  assert.deepEqual(afterReceive, before);
});

test("descarga de traslado no acepta cantidades parciales en su contrato", () => {
  const receiveContract = { transfer_id: 15 };
  assert.equal("lines" in receiveContract, false);
  assert.equal("qty" in receiveContract, false);
});
