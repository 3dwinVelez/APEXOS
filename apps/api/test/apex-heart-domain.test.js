const test = require("node:test");
const assert = require("node:assert/strict");
process.env.REDIS_DISABLED = "true";
const { classifyProducts, evaluateRules } = require("../src/modules/apex-heart/service");

test("Apex Heart clasifica productos por Pareto y calcula rentabilidad", () => {
  const item = (id, code, subtotal, cost) => ({ item_id: id, description: code, qty: 1, subtotal, cost_value: cost, item: { code, name: code, category: { name: "Categoría" } } });
  const rows = classifyProducts([item(1, "A", 800, 400), item(2, "B", 150, 100), item(3, "C", 50, 45)], new Map([[1, { quantity: 4, value: 200 }], [2, { quantity: 3, value: 120 }], [3, { quantity: 2, value: 90 }]]), 30);
  assert.equal(rows[0].abc_class, "A");
  assert.equal(rows[2].abc_class, "C");
  assert.equal(rows[0].gross_profit, 400);
  assert.equal(rows[0].gmroi, 2);
  assert.ok(rows[0].score > rows[2].score);
});

test("Apex Heart eleva alertas configurables por severidad", () => {
  const alerts = evaluateRules({ gross_margin_pct: 10, cash_cycle_days: 80 }, [
    { id: 1, code: "margin", name: "Margen", metric: "gross_margin_pct", operator: "lt", warning_threshold: 25, critical_threshold: 15, enabled: true },
    { id: 2, code: "cash", name: "Caja", metric: "cash_cycle_days", operator: "gt", warning_threshold: 60, critical_threshold: 100, enabled: true }
  ]);
  assert.deepEqual(alerts.map((alert) => alert.severity), ["critical", "warning"]);
});
