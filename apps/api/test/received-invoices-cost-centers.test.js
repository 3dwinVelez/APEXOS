const test = require("node:test");
const assert = require("node:assert/strict");
const { buildCostCenterOptions, resolveCostCenterCode } = require("../src/modules/accounting/received-invoices/cost-centers");

const tree = {
  societies: [{ code: "SOC-01", name: "Sociedad principal" }],
  branches: [
    { code: "SUC-10", name: "Sede norte" },
    { code: "SUC-20", name: "Sede sur" }
  ],
  cost_centers: [
    { code: "CC-02", name: "Mantenimiento", branch_code: "SUC-20", society_code: "SOC-01" },
    { code: "CC-01", name: "Bodega", branch_code: "SUC-10", society_code: "SOC-01" },
    { code: "CC-03", name: "Inactivo", branch_code: "SUC-10", society_code: "SOC-01", active: false },
    { code: "JYX 457", name: "Vehiculo TITAN", branch_code: "SUC-10", society_code: "SOC-01", vehicle_id: 12 },
    { code: "", name: "Sin codigo", branch_code: "SUC-10", society_code: "SOC-01" }
  ]
};

test("buildCostCenterOptions expone solo centros activos con sucursal y sociedad", () => {
  const options = buildCostCenterOptions(tree);

  assert.deepEqual(options.map((item) => item.code), ["CC-01", "JYX 457", "CC-02"]);
  const bodega = options.find((item) => item.code === "CC-01");
  assert.equal(bodega.name, "Bodega");
  assert.equal(bodega.branch_name, "Sede norte");
  assert.equal(bodega.society_name, "Sociedad principal");
  assert.equal(options.some((item) => item.code === "CC-03"), false);
});

test("resolveCostCenterCode devuelve el codigo canonico del maestro", () => {
  const options = buildCostCenterOptions(tree);

  assert.equal(resolveCostCenterCode(options, "cc-01"), "CC-01");
  assert.equal(resolveCostCenterCode(options, "  CC-02  "), "CC-02");
  assert.equal(resolveCostCenterCode(options, "JYX 457"), "JYX 457");
});

test("resolveCostCenterCode distingue sin cambio, vacio y ausente", () => {
  const options = buildCostCenterOptions(tree);

  assert.equal(resolveCostCenterCode(options, undefined), undefined);
  assert.equal(resolveCostCenterCode(options, null), null);
  assert.equal(resolveCostCenterCode(options, "   "), null);
});

test("resolveCostCenterCode rechaza centros fuera de la estructura", () => {
  const options = buildCostCenterOptions(tree);

  assert.throws(
    () => resolveCostCenterCode(options, "CC-99"),
    (error) => error.code === "INVOICE_COST_CENTER_INVALID" && error.statusCode === 422
  );
  assert.throws(
    () => resolveCostCenterCode(options, "CC-03"),
    (error) => error.code === "INVOICE_COST_CENTER_INVALID" && error.statusCode === 422
  );
});

test("resolveCostCenterCode conserva un valor heredado que el usuario no cambia", () => {
  const options = buildCostCenterOptions(tree);

  assert.equal(resolveCostCenterCode(options, "Centro viejo", "Centro viejo"), "Centro viejo");
  assert.throws(
    () => resolveCostCenterCode(options, "Centro viejo", "CC-01"),
    (error) => error.code === "INVOICE_COST_CENTER_INVALID"
  );
});
