// PYG por centro de costo (hoja TODOSCC del Excel): columnas por centro con la
// misma estructura de conceptos del PYG por vehiculo. Las pruebas fijan que la
// lectura paralela no altera el consolidado ni la asignacion por placa.
const assert = require("node:assert/strict");
const test = require("node:test");

const { cloneProposal } = require("../src/modules/transport-pyg/account-config");
const { buildAccountingReport } = require("../src/modules/transport-pyg/account-engine");

const VEHICLES = [
  { id: 1, plate: "ABC123", brand: "KIA", line: "PICANTO", authorized_driver_id: null },
  { id: 2, plate: "XYZ789", brand: "CHEVROLET", line: "N300", authorized_driver_id: null }
];

const TREE = {
  societies: [{ code: "SOC-01", name: "Sociedad principal" }],
  branches: [{ code: "B1", name: "Sucursal Norte" }, { code: "B2", name: "Sucursal Sur" }],
  cost_centers: [
    { code: "ABC123", name: "Vehiculo ABC123", branch_code: "B1", vehicle_id: 1, active: true },
    { code: "XYZ789", name: "Vehiculo XYZ789", branch_code: "B1", vehicle_id: 2, active: true }
  ]
};

const leaf = (account_id, account_code, center, actual_cents, budget_cents = null, extra = {}) => ({
  account_id,
  account_code,
  account_name: `Cuenta ${account_code}`,
  branch: "B1",
  branch_name: "Sucursal Norte",
  center,
  center_name: center === "ABC123" ? "Vehiculo ABC123" : center === "XYZ789" ? "Vehiculo XYZ789" : `Centro ${center}`,
  actual_cents,
  budget_cents,
  budget_months: [],
  ...extra
});

function buildReport(leaves) {
  return buildAccountingReport({
    period: "2026-08",
    concepts: cloneProposal().concepts,
    vehicles: VEHICLES,
    tree: TREE,
    leaves,
    interactive: { warnings: [], linkage: {} },
    taxPercent: 2.25
  });
}

const centerOf = (report, code) => report.centers.find((center) => center.center_code === code);
const rowOf = (center, code) => center.rows.find((row) => row.code === code);

test("motor: una columna por centro de costo con presupuesto, ejecutado, % y cumplimiento", () => {
  const report = buildReport([
    leaf(1, "41450501", "ABC123", 250000000, 200000000),
    leaf(2, "52050601", "ABC123", -80000000, -100000000),
    leaf(3, "54100501", "ABC123", -5625000, null),
    leaf(4, "41450501", "ADM01", 100000000, null),
    leaf(5, "52050601", "ADM01", -30000000, null),
    leaf(6, "54100501", "ADM01", -2250000, null)
  ]);

  const abc = centerOf(report, "ABC123");
  assert.ok(abc, "falta la columna del centro ABC123 (vehiculo)");
  assert.equal(abc.center_name, "Vehiculo ABC123");
  assert.equal(abc.plate, "ABC123");
  assert.equal(abc.income_actual, 2500000);
  assert.equal(rowOf(abc, "INGRESOS").budget, 2000000);
  assert.equal(rowOf(abc, "INGRESOS").budget_coverage, "full");
  // En el Excel el % de INGRESOS de cada centro es 100% de su propio ingreso.
  assert.equal(rowOf(abc, "INGRESOS").pct, 1);
  assert.equal(rowOf(abc, "GASTOS_PERSONAL").actual, 800000);
  assert.equal(rowOf(abc, "GASTOS_PERSONAL").budget, 1000000);
  assert.equal(rowOf(abc, "GASTOS_PERSONAL").pct, 0.32);
  assert.equal(rowOf(abc, "GASTOS_PERSONAL").cump, 0.8);
  assert.equal(rowOf(abc, "TOTAL_GASTOS_OPERACIONALES").actual, 800000);
  assert.equal(rowOf(abc, "UTILIDAD_OPERACIONAL").actual, 1700000);
  assert.equal(rowOf(abc, "UTILIDAD_NETA").actual, 1643750);

  const adm = centerOf(report, "ADM01");
  assert.ok(adm, "falta la columna del centro sin vehiculo");
  assert.equal(adm.center_name, "Centro ADM01");
  assert.equal(adm.plate, null);
  assert.equal(rowOf(adm, "INGRESOS").actual, 1000000);
  // Sin presupuesto en el libro: null, nunca cero implicito.
  assert.equal(rowOf(adm, "INGRESOS").budget, null);
  assert.equal(rowOf(adm, "INGRESOS").budget_coverage, "none");
  assert.equal(rowOf(adm, "INGRESOS").pct, 1);
  assert.equal(rowOf(adm, "GASTOS_PERSONAL").pct, 0.3);
  assert.equal(rowOf(adm, "GASTOS_PERSONAL").cump, null);
  assert.equal(rowOf(adm, "UTILIDAD_NETA").actual, 677500);
});

test("motor: columnas ordenadas y centro con vehiculo sin movimiento conserva su lugar en cero", () => {
  const report = buildReport([
    leaf(1, "41450501", "ABC123", 250000000, 200000000),
    leaf(2, "41450501", "ADM01", 100000000, null)
  ]);

  assert.deepEqual(report.centers.map((center) => center.center_code), ["ADM01", "ABC123", "XYZ789"]);
  const empty = centerOf(report, "XYZ789");
  assert.equal(empty.plate, "XYZ789");
  assert.equal(empty.income_actual, 0);
  assert.equal(rowOf(empty, "INGRESOS").actual, 0);
  assert.equal(rowOf(empty, "INGRESOS").pct, null);
  assert.equal(rowOf(empty, "UTILIDAD_NETA").actual, 0);
  assert.equal(empty.rows.length, report.corporate.rows.length, "todas las columnas comparten la misma estructura de conceptos");
  assert.equal(report.data_status.centers_count, 3);
});

test("motor: la matriz por centro no duplica importes ni altera el consolidado", () => {
  const leaves = [
    leaf(1, "41450501", "ABC123", 250000000, 200000000),
    leaf(2, "52050601", "ABC123", -80000000, 100000000),
    leaf(3, "54100501", "ABC123", -5625000, null),
    leaf(4, "41450501", "ADM01", 100000000, null),
    leaf(5, "52050601", "ADM01", -30000000, null),
    leaf(6, "54100501", "ADM01", -2250000, null)
  ];
  const report = buildReport(leaves);

  const centerIncome = report.centers.reduce((sum, center) => sum + center.income_actual, 0);
  const centerNeta = report.centers.reduce((sum, center) => sum + rowOf(center, "UTILIDAD_NETA").actual, 0);
  assert.equal(centerIncome, report.corporate.income_actual);
  assert.equal(centerNeta, report.corporate.totals.neta.actual);
  assert.equal(centerNeta, report.reconciliation.neta_actual);
  assert.equal(report.reconciliation.difference, 0);

  // La asignacion por placa sigue intacta: solo el centro del vehiculo.
  const vehicle = report.vehicles.find((item) => item.plate === "ABC123");
  assert.equal(vehicle.rows.find((row) => row.code === "INGRESOS").actual, 2500000);
  assert.equal(report.unassigned.rows.find((row) => row.code === "INGRESOS").actual, 1000000);
});

test("motor: codigo de centro repetido entre sucursales rotula solo la columna de la sucursal del vehiculo", () => {
  const tree = {
    branches: [{ code: "B1", name: "Sucursal Norte" }, { code: "B2", name: "Sucursal Sur" }],
    cost_centers: [
      { code: "CC01", name: "Centro CC01 Norte", branch_code: "B1", vehicle_id: 1, active: true },
      { code: "CC01", name: "Centro CC01 Sur", branch_code: "B2", vehicle_id: null, active: true }
    ]
  };
  const build = (leaves) => buildAccountingReport({
    period: "2026-08",
    concepts: cloneProposal().concepts,
    vehicles: [VEHICLES[0]],
    tree,
    leaves,
    interactive: { warnings: [], linkage: {} },
    taxPercent: 2.25
  });
  const leafB2 = (account_id, account_code, actual_cents) => ({
    account_id,
    account_code,
    account_name: `Cuenta ${account_code}`,
    branch: "B2",
    branch_name: "Sucursal Sur",
    center: "CC01",
    center_name: "Centro CC01 Sur",
    actual_cents,
    budget_cents: null,
    budget_months: []
  });
  const ccByBranch = (report, branch) => report.centers.filter((center) => center.center_code === "CC01" && center.branch_code === branch);
  const single = (report, branch) => {
    const matches = ccByBranch(report, branch);
    assert.equal(matches.length, 1, `se esperaba una unica columna CC01 en ${branch}`);
    return matches[0];
  };

  // ABC123 esta vinculado solo a CC01/B1, pero el libro solo trae movimientos CC01/B2.
  const crossReport = build([leafB2(1, "41450501", 50000000), leafB2(2, "52050601", -20000000)]);
  // La columna B1 en cero se crea ADEMAS de la B2 existente; no la reemplaza.
  assert.equal(crossReport.centers.length, 2, "las columnas B1 (cero) y B2 (movimiento) coexisten");
  const b1Empty = single(crossReport, "B1");
  const b2Movement = single(crossReport, "B2");
  assert.equal(b1Empty.plate, "ABC123", "la columna B1 del vehiculo debe existir en cero");
  assert.equal(b1Empty.vehicle_label, "KIA PICANTO");
  assert.equal(b1Empty.income_actual, 0);
  assert.equal(rowOf(b1Empty, "INGRESOS").actual, 0);
  assert.equal(rowOf(b1Empty, "UTILIDAD_NETA").actual, 0);
  assert.equal(b1Empty.rows.length, crossReport.corporate.rows.length);
  assert.equal(b2Movement.plate, null, "la columna B2 no puede rotularse con la placa de B1");
  assert.equal(b2Movement.vehicle_label, null);
  assert.equal(rowOf(b2Movement, "INGRESOS").actual, 500000);
  assert.equal(rowOf(b2Movement, "GASTOS_PERSONAL").actual, 200000);
  assert.equal(rowOf(b2Movement, "UTILIDAD_NETA").actual, 300000);
  // Sumas independientes: cada columna conserva solo sus propios movimientos.
  assert.equal(b1Empty.income_actual + b2Movement.income_actual, crossReport.corporate.income_actual);
  assert.equal(rowOf(b1Empty, "UTILIDAD_NETA").actual + rowOf(b2Movement, "UTILIDAD_NETA").actual, crossReport.corporate.totals.neta.actual);
  assert.equal(crossReport.reconciliation.difference, 0);
  const crossVehicle = crossReport.vehicles.find((item) => item.plate === "ABC123");
  assert.equal(crossVehicle.rows.find((row) => row.code === "INGRESOS").actual, 0, "la placa de B1 no hereda el movimiento de B2");

  // Con movimiento en ambas sucursales, cada columna queda rotulada por su cuenta.
  const bothReport = build([
    leafB2(3, "41450501", 50000000),
    leaf(4, "41450501", "CC01", 90000000, null, { center_name: "Centro CC01 Norte" })
  ]);
  const bothB1 = single(bothReport, "B1");
  const bothB2 = single(bothReport, "B2");
  assert.equal(bothB1.plate, "ABC123");
  assert.equal(rowOf(bothB1, "INGRESOS").actual, 900000);
  assert.equal(bothB2.plate, null);
  assert.equal(rowOf(bothB2, "INGRESOS").actual, 500000);
  assert.equal(rowOf(bothB1, "INGRESOS").actual + rowOf(bothB2, "INGRESOS").actual, bothReport.corporate.income_actual);
});

test("motor: dos vehiculos en sucursales distintas con el mismo codigo de centro", () => {
  const tree = {
    branches: [{ code: "B1", name: "Sucursal Norte" }, { code: "B2", name: "Sucursal Sur" }],
    cost_centers: [
      { code: "CC01", name: "Vehiculo ABC123", branch_code: "B1", vehicle_id: 1, active: true },
      { code: "CC01", name: "Vehiculo XYZ789", branch_code: "B2", vehicle_id: 2, active: true }
    ]
  };
  const report = buildAccountingReport({
    period: "2026-08",
    concepts: cloneProposal().concepts,
    vehicles: VEHICLES,
    tree,
    leaves: [
      { ...leaf(3, "41450501", "CC01", 70000000, null), branch: "B2", branch_name: "Sucursal Sur", center_name: "Vehiculo XYZ789" },
      leaf(4, "41450501", "CC01", 30000000, null, { center_name: "Vehiculo ABC123" })
    ],
    interactive: { warnings: [], linkage: {} },
    taxPercent: 2.25
  });
  const b1 = report.centers.find((center) => center.center_code === "CC01" && center.branch_code === "B1");
  const b2 = report.centers.find((center) => center.center_code === "CC01" && center.branch_code === "B2");
  assert.ok(b1 && b2, "debe haber una columna por sucursal");
  assert.equal(b1.plate, "ABC123");
  assert.equal(b1.vehicle_label, "KIA PICANTO");
  assert.equal(b2.plate, "XYZ789");
  assert.equal(b2.vehicle_label, "CHEVROLET N300");
  assert.equal(rowOf(b1, "INGRESOS").actual, 300000);
  assert.equal(rowOf(b2, "INGRESOS").actual, 700000);
  assert.equal(report.centers.filter((center) => center.center_code === "CC01").length, 2);
  assert.equal(report.corporate.income_actual, 1000000);
  assert.equal(report.reconciliation.difference, 0);
});

test("motor: ingresos del centro configurados y sin clasificar usan el ingreso total propio como denominador", () => {
  const report = buildReport([
    // 1.000.000 configurado en INGRESOS + 200.000 sin clasificar (clase 4, fuera de rangos).
    leaf(1, "41450501", "ADM01", 100000000, null),
    leaf(2, "41350101", "ADM01", 20000000, null),
    leaf(3, "52050601", "ADM01", -30000000, null),
    // El motor es solo libro: el impuesto existe unicamente si viene publicado.
    leaf(4, "54100501", "ADM01", -2700000, null)
  ]);
  const adm = centerOf(report, "ADM01");
  assert.ok(adm, "falta la columna ADM01");
  const ingresos = rowOf(adm, "INGRESOS");
  const unclassified = rowOf(adm, "INGRESOS_SIN_CLASIFICAR");
  // 1.200.000 de ingreso propio: INGRESOS 83.3333%, sin clasificar 16.6667%.
  assert.equal(ingresos.actual, 1000000);
  assert.equal(unclassified.actual, 200000);
  assert.ok(unclassified.dynamic, "el ingreso fuera de rango se presenta como fila dinamica");
  assert.equal(ingresos.pct, 0.8333);
  assert.equal(unclassified.pct, 0.1667);
  assert.equal(Math.round((ingresos.pct + unclassified.pct) * 10000) / 10000, 1, "los porcentajes de ingreso suman 100%");
  assert.equal(rowOf(adm, "TOTAL_INGRESOS").actual, 1200000);
  assert.equal(rowOf(adm, "TOTAL_INGRESOS").pct, 1);
  assert.equal(adm.income_actual, 1200000);
  // Gastos y subtotales siguen midiendose contra el ingreso propio completo.
  assert.equal(rowOf(adm, "GASTOS_PERSONAL").pct, 0.25);
  assert.equal(rowOf(adm, "TOTAL_GASTOS_OPERACIONALES").pct, 0.25);
  assert.equal(rowOf(adm, "UTILIDAD_OPERACIONAL").actual, 900000);
  assert.equal(rowOf(adm, "UTILIDAD_OPERACIONAL").pct, 0.75);
  assert.equal(rowOf(adm, "IMPUESTO_REGIMEN_SIMPLE").actual, 27000);
  assert.equal(rowOf(adm, "UTILIDAD_NETA").actual, 873000);
  // El consolidado no cambia y sigue reconciliando.
  assert.equal(report.corporate.income_actual, 1200000);
  assert.equal(report.reconciliation.difference, 0);
  // Solo lectura por centro: la semantica por vehiculo no cambia.
  const unassigned = report.unassigned;
  assert.ok(unassigned, "los centros sin vehiculo siguen en el bloque sin asignar");
  assert.equal(unassigned.rows.find((row) => row.code === "INGRESOS").actual, 1000000);
  assert.equal(unassigned.rows.find((row) => row.code === "INGRESOS").pct, 0.8333, "por vehiculo el denominador sigue siendo el ingreso corporativo (1.200.000)");
  assert.equal(unassigned.rows.find((row) => row.code === "INGRESOS_SIN_CLASIFICAR").pct, null, "por vehiculo el % sigue siendo contra el ingreso corporativo");
  assert.equal(report.vehicles.every((item) => item.rows.find((row) => row.code === "INGRESOS").pct === 0), true);
  // Vehiculo sin movimiento: el bucle corporativo usa el denominador global, no null.
  const emptyVehicle = report.vehicles.find((item) => item.plate === "XYZ789");
  assert.equal(emptyVehicle.rows.find((row) => row.code === "INGRESOS").actual, 0);
  assert.equal(emptyVehicle.rows.find((row) => row.code === "INGRESOS").pct, 0);
});

test("motor: centro solo con ingresos sin clasificar deja la fila INGRESOS mapeada sin movimiento ni porcentaje", () => {
  const report = buildReport([
    leaf(1, "41350101", "ADM01", 20000000, null),
    leaf(2, "52050601", "ADM01", -5000000, null)
  ]);
  const adm = centerOf(report, "ADM01");
  const ingresos = rowOf(adm, "INGRESOS");
  // La fila INGRESOS sigue mapeada porque existen rangos configurados, pero sin
  // movimiento agregado de ese concepto no hay importe ni porcentaje.
  assert.equal(ingresos.actual, 0);
  assert.equal(ingresos.pending, false);
  assert.equal(ingresos.pct, null);
  // El ingreso no clasificado es dinamico, cubre el ingreso propio y los gastos
  // se miden contra el ingreso total del centro.
  const unclassified = rowOf(adm, "INGRESOS_SIN_CLASIFICAR");
  assert.equal(unclassified.dynamic, true);
  assert.equal(unclassified.actual, 200000);
  assert.equal(unclassified.pct, 1);
  assert.equal(rowOf(adm, "TOTAL_INGRESOS").actual, 200000);
  assert.equal(rowOf(adm, "TOTAL_INGRESOS").pct, 1);
  assert.equal(rowOf(adm, "GASTOS_PERSONAL").actual, 50000);
  assert.equal(rowOf(adm, "GASTOS_PERSONAL").pct, 0.25);
  assert.equal(report.reconciliation.difference, 0);
});

test("motor: centro con denominador de ingreso cero no inventa porcentajes", () => {
  const report = buildReport([
    leaf(1, "52050601", "ADM01", -5000000, null)
  ]);
  const adm = centerOf(report, "ADM01");
  assert.equal(rowOf(adm, "INGRESOS").actual, 0);
  assert.equal(rowOf(adm, "INGRESOS").pct, null);
  assert.equal(rowOf(adm, "GASTOS_PERSONAL").pct, null);
  assert.equal(rowOf(adm, "TOTAL_GASTOS_OPERACIONALES").pct, null);
  assert.equal(adm.income_actual, 0);
  assert.equal(report.reconciliation.difference, 0);
});

test("motor: hoja sin centro de costo aparece como columna propia, una sola vez", () => {
  const report = buildReport([
    leaf(1, "41450501", "ABC123", 250000000, null),
    leaf(2, "52050601", "", -5000000, null, { center_name: "Sin centro de costo" })
  ]);

  const sinCentro = centerOf(report, "");
  assert.ok(sinCentro, "falta la columna sin centro de costo");
  assert.equal(sinCentro.center_name, "Sin centro de costo");
  assert.equal(sinCentro.income_actual, 0);
  assert.equal(rowOf(sinCentro, "GASTOS_PERSONAL").actual, 50000);
  assert.equal(report.centers.filter((center) => !center.center_code).length, 1);
});

test("motor: sin centros en el libro ni en el arbol la matriz queda vacia", () => {
  const report = buildAccountingReport({
    period: "2026-08",
    concepts: cloneProposal().concepts,
    vehicles: [],
    tree: { branches: [], cost_centers: [] },
    leaves: [],
    interactive: { warnings: [], linkage: {} }
  });
  assert.deepEqual(report.centers, []);
  assert.equal(report.data_status.centers_count, 0);
});
