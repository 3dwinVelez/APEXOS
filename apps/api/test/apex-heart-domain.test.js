const test = require("node:test");
const assert = require("node:assert/strict");
process.env.REDIS_DISABLED = "true";
const { buildAging, classifyProducts, evaluateRules, cleanReportSchedule, nextReportRun } = require("../src/modules/apex-heart/service");

test("Apex Heart clasifica productos por Pareto y calcula rentabilidad", () => {
  const item = (id, code, subtotal, cost) => ({ item_id: id, description: code, qty: 1, subtotal, cost_value: cost, item: { code, name: code, category: { name: "Categoría" } } });
  const rows = classifyProducts([item(1, "A", 800, 400), item(2, "B", 150, 100), item(3, "C", 50, 45)], new Map([[1, { quantity: 4, value: 200 }], [2, { quantity: 3, value: 120 }], [3, { quantity: 2, value: 90 }]]), 30);
  assert.equal(rows[0].abc_class, "A");
  assert.equal(rows[2].abc_class, "C");
  assert.equal(rows[0].gross_profit, 400);
  assert.equal(rows[0].gmroi, 2);
  assert.ok(rows[0].score > rows[2].score);
});

test("Apex Heart valida y calcula la siguiente entrega semanal", () => {
  const clean = cleanReportSchedule({ name: "Pulso lunes", view: "abc", frequency: "weekly", weekday: 1, send_hour: 8, recipients: ["gerencia@apex.test", "gerencia@apex.test"] });
  assert.deepEqual(clean.recipients, ["gerencia@apex.test"]);
  assert.equal(clean.view, "abc");
  assert.equal(nextReportRun(clean, new Date("2026-09-09T12:00:00Z")).toISOString(), "2026-09-14T08:00:00.000Z");
});

test("Apex Heart rechaza programaciones sin destinatarios válidos", () => {
  assert.throws(() => cleanReportSchedule({ name: "Sin correo", recipients: ["incorrecto"] }), /correo válido/);
});

test("Apex Heart eleva alertas configurables por severidad", () => {
  const alerts = evaluateRules({ gross_margin_pct: 10, cash_cycle_days: 80 }, [
    { id: 1, code: "margin", name: "Margen", metric: "gross_margin_pct", operator: "lt", warning_threshold: 25, critical_threshold: 15, enabled: true },
    { id: 2, code: "cash", name: "Caja", metric: "cash_cycle_days", operator: "gt", warning_threshold: 60, critical_threshold: 100, enabled: true }
  ]);
  assert.deepEqual(alerts.map((alert) => alert.severity), ["critical", "warning"]);
});

test("Apex Heart distribuye cartera y proveedores en cinco edades", () => {
  const at = new Date("2026-09-06T23:59:59Z");
  const aging = buildAging([
    { due_date: new Date("2026-09-20"), balance: 100 },
    { due_date: new Date("2026-08-20"), balance: 200 },
    { due_date: new Date("2026-07-20"), balance: 300 },
    { due_date: new Date("2026-06-20"), balance: 400 },
    { due_date: new Date("2026-05-20"), balance: 500 }
  ], at);
  assert.deepEqual(aging.map((row) => row.value), [100, 200, 300, 400, 500]);
});
