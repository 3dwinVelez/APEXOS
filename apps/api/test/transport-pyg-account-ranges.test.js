const assert = require("node:assert/strict");
const test = require("node:test");

const config = require("../src/modules/transport-pyg/account-config");
const engine = require("../src/modules/transport-pyg/account-engine");

const { EXCEL_PROPOSAL, cloneProposal, validateAccountConfig, matchAccountCode, orderConcepts } = config;
const { buildAccountingReport, UNASSIGNED_BUCKET } = engine;

const concept = (code, name, kind, section, order, ranges = [], exclusions = []) => ({
  code, name, kind, section, order, ranges, exclusions
});

const VEHICLES = [
  { id: 1, plate: "ABC123", brand: "KIA", line: "PICANTO", authorized_driver_id: null },
  { id: 2, plate: "XYZ789", brand: "CHEVROLET", line: "N300", authorized_driver_id: null }
];

const TREE = {
  societies: [{ code: "SOC-01", name: "Sociedad principal" }],
  branches: [{ code: "B1", name: "Sucursal Norte" }],
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

function rowOf(report, scope, code) {
  const rows = scope === "corporate" ? report.corporate.rows : scope === "unassigned" ? report.unassigned.rows : report.vehicles.find((item) => item.plate === scope).rows;
  return rows.find((item) => item.code === code);
}

test("validacion: propuesta del Excel valida y sin solapes", () => {
  const result = validateAccountConfig(cloneProposal());
  assert.equal(result.ok, true, JSON.stringify(result.errors, null, 2));
  assert.equal(result.normalized.source, "accounting");
  assert.equal(result.normalized.concepts.length, EXCEL_PROPOSAL.concepts.length);
});

test("validacion: codigos de concepto unicos, normalizados a mayusculas y obligatorios", () => {
  const proposal = cloneProposal();
  proposal.concepts[0].code = "ingresos";
  assert.equal(validateAccountConfig(proposal).ok, true);
  proposal.concepts[1].code = "INGRESOS";
  const result = validateAccountConfig(proposal);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((item) => item.code === "CONCEPT_CODE_DUPLICATE"));
  const missing = cloneProposal();
  delete missing.concepts[0].code;
  assert.ok(validateAccountConfig(missing).errors.some((item) => item.code === "CONCEPT_CODE_REQUIRED"));
  const bad = cloneProposal();
  bad.concepts[0].code = "concepto con espacios";
  assert.ok(validateAccountConfig(bad).errors.some((item) => item.code === "CONCEPT_CODE_INVALID"));
});

test("validacion: nombre, tipo/seccion, orden y fuente", () => {
  const base = cloneProposal();
  base.concepts[0].name = "";
  assert.ok(validateAccountConfig(base).errors.some((item) => item.code === "CONCEPT_NAME_REQUIRED"));
  const mismatch = cloneProposal();
  mismatch.concepts[0].section = "impuestos";
  assert.ok(validateAccountConfig(mismatch).errors.some((item) => item.code === "CONCEPT_KIND_SECTION_MISMATCH"));
  const badKind = cloneProposal();
  badKind.concepts[0].kind = "ingreso";
  assert.ok(validateAccountConfig(badKind).errors.some((item) => item.code === "CONCEPT_KIND_INVALID"));
  const badOrder = cloneProposal();
  badOrder.concepts[0].order = 0;
  assert.ok(validateAccountConfig(badOrder).errors.some((item) => item.code === "CONCEPT_ORDER_INVALID"));
  assert.ok(validateAccountConfig({ source: "nada", concepts: [] }).errors.some((item) => item.code === "SOURCE_INVALID"));
  assert.ok(validateAccountConfig({ source: "accounting", concepts: [] }).errors.some((item) => item.code === "CONCEPTS_REQUIRED"));
  // Volver a la fuente operativa no exige conceptos.
  assert.equal(validateAccountConfig({ source: "operational", concepts: [] }).ok, true);
});

test("validacion: rangos invertidos, longitudes mixtas, duplicados y exclusiones", () => {
  const base = cloneProposal();
  const c = base.concepts[0];
  c.ranges = [{ start: "41999999", end: "41450101" }];
  assert.ok(validateAccountConfig(base).errors.some((item) => item.code === "RANGE_INVERTED"));

  const mixed = cloneProposal();
  mixed.concepts[0].ranges = [{ start: "4145", end: "41450101" }];
  assert.ok(validateAccountConfig(mixed).errors.some((item) => item.code === "RANGE_LENGTH_MISMATCH"));

  const threeDigits = cloneProposal();
  threeDigits.concepts[0].ranges = [{ start: "414", end: "414" }];
  assert.ok(validateAccountConfig(threeDigits).errors.some((item) => item.code === "RANGE_START_INVALID"));

  const dup = cloneProposal();
  dup.concepts[0].ranges = [{ start: "41450101", end: "41450101" }, { start: "41450101", end: "41450101" }];
  assert.ok(validateAccountConfig(dup).errors.some((item) => item.code === "RANGE_DUPLICATE"));

  const outside = cloneProposal();
  outside.concepts[0].exclusions = [{ start: "52000000", end: "52000000" }];
  assert.ok(validateAccountConfig(outside).errors.some((item) => item.code === "EXCLUSION_OUTSIDE_RANGE"));

  const exclInv = cloneProposal();
  exclInv.concepts[0].exclusions = [{ start: "41450501", end: "41450500" }];
  assert.ok(validateAccountConfig(exclInv).errors.some((item) => item.code === "EXCLUSION_INVERTED"));
});

test("validacion: subtotales protegidos sin cuentas", () => {
  const base = cloneProposal();
  base.concepts[1].ranges = [{ start: "41450101", end: "41999999" }];
  const result = validateAccountConfig(base);
  assert.ok(result.errors.some((item) => item.code === "SUBTOTAL_WITH_RANGES"));
});

test("validacion: solape efectivo entre conceptos se rechaza y la exclusion lo desambigua", () => {
  const overlapping = [
    concept("A", "A", "expense", "gastos_operativos", 1, [{ start: "52050601", end: "52059999" }]),
    concept("B", "B", "expense", "gastos_operativos", 2, [{ start: "52059501", end: "52059999" }])
  ];
  const result = validateAccountConfig({ source: "accounting", concepts: overlapping });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((item) => item.code === "CONCEPT_OVERLAP"));

  const disambiguated = [
    concept("A", "A", "expense", "gastos_operativos", 1, [{ start: "52050601", end: "52059999" }]),
    concept("B", "B", "expense", "gastos_operativos", 2, [{ start: "52059501", end: "52059999" }], [{ start: "52059501", end: "52059999" }])
  ];
  assert.equal(validateAccountConfig({ source: "accounting", concepts: disambiguated }).ok, true);
});

test("validacion: la exclusion puntual desambigua solo esa cuenta, no el solape completo", () => {
  const punto = [
    concept("A", "A", "expense", "gastos_operativos", 1, [{ start: "52050601", end: "52059999" }]),
    concept("B", "B", "expense", "gastos_operativos", 2, [{ start: "52059501", end: "52059999" }], [{ start: "52059501", end: "52059501" }])
  ];
  const result = validateAccountConfig({ source: "accounting", concepts: punto });
  assert.equal(result.ok, false);
  const overlap = result.errors.find((item) => item.code === "CONCEPT_OVERLAP");
  assert.ok(overlap);
  assert.deepEqual(overlap.detail.overlap, [52059502, 52059999]);
});

test("validacion: rangos y exclusiones fuera de las clases PUC 4-7 se rechazan", () => {
  const asset = cloneProposal();
  asset.concepts[0].ranges = [{ start: "14050101", end: "14050101" }];
  const assetResult = validateAccountConfig(asset);
  assert.equal(assetResult.ok, false);
  assert.ok(assetResult.errors.some((item) => item.code === "RANGE_CLASS_NOT_PYG" && item.concept_code === "INGRESOS"));

  const liability = cloneProposal();
  liability.concepts[2].ranges = [{ start: "22050101", end: "22050101" }];
  assert.ok(validateAccountConfig(liability).errors.some((item) => item.code === "RANGE_CLASS_NOT_PYG"));

  const exclusionAsset = cloneProposal();
  exclusionAsset.concepts[0].exclusions = [{ start: "41450501", end: "41450501" }];
  assert.equal(validateAccountConfig(exclusionAsset).ok, true, "exclusion de clase 4 debe aceptarse");

  // Un rango que atraviesa clases (3..5) tambien se rechaza, la clase se
  // valida en inicio y fin.
  const crossing = cloneProposal();
  crossing.concepts[0].ranges = [{ start: "39999999", end: "49999999" }];
  assert.ok(validateAccountConfig(crossing).errors.some((item) => item.code === "RANGE_CLASS_NOT_PYG"));

  // La exclusion se valida con su propia clase, aunque tambien quede fuera del rango.
  const assetExclusion = cloneProposal();
  assetExclusion.concepts[0].exclusions = [{ start: "14050101", end: "14050101" }];
  const assetExclusionResult = validateAccountConfig(assetExclusion);
  assert.ok(assetExclusionResult.errors.some((item) => item.code === "EXCLUSION_CLASS_NOT_PYG"));
});

test("matching: inclusivo exacto por longitud, sin ampliacion por prefijo", () => {
  const proposal = cloneProposal().concepts;
  assert.equal(matchAccountCode("41450101", proposal), "INGRESOS");
  assert.equal(matchAccountCode("41999999", proposal), "INGRESOS");
  assert.equal(matchAccountCode("42000000", proposal), null);
  assert.equal(matchAccountCode("4145", proposal), null);
  assert.equal(matchAccountCode("4145010", proposal), null);

  // Rango de 2 digitos solo coincide con codigos de 2 digitos.
  const custom = [concept("CORTO", "CORTO", "income", "ingresos", 1, [{ start: "41", end: "49" }])];
  assert.equal(matchAccountCode("41", custom), "CORTO");
  assert.equal(matchAccountCode("49", custom), "CORTO");
  assert.equal(matchAccountCode("41450501", custom), null);

  // La exclusion puntual quita la cuenta exacta del rango.
  const withExclusion = [concept("ING", "ING", "income", "ingresos", 1, [{ start: "41450101", end: "41999999" }], [{ start: "41450501", end: "41450501" }])];
  assert.equal(matchAccountCode("41450501", withExclusion), null);
  assert.equal(matchAccountCode("41450502", withExclusion), "ING");
});

test("orden estable: order ascendente y empate por codigo", () => {
  const ordered = orderConcepts([
    concept("B", "B", "expense", "gastos_operativos", 2),
    concept("Z", "Z", "expense", "gastos_operativos", 1),
    concept("A", "A", "expense", "gastos_operativos", 2)
  ]);
  assert.deepEqual(ordered.map((item) => item.code), ["Z", "A", "B"]);
});

test("motor: ingresos, gastos, subtotales, impuesto y neta reconciliable", () => {
  const proposal = cloneProposal();
  const leaves = [
    leaf(1, "41450501", "ABC123", 250000000, 200000000),
    leaf(2, "52050601", "ABC123", -80000000, 100000000),
    leaf(3, "54100501", "ABC123", -1000000, null),
    leaf(4, "42100501", "ABC123", 2500000, null)
  ];
  const report = buildAccountingReport({
    period: "2026-03",
    concepts: proposal.concepts,
    vehicles: VEHICLES,
    tree: TREE,
    leaves,
    interactive: { warnings: [], linkage: {} },
    taxPercent: 2.25
  });

  assert.equal(report.source, "accounting");
  assert.equal(report.period_start, "2026-03-01");
  assert.equal(report.period_end, "2026-03-31");

  const vehicle = report.vehicles.find((item) => item.plate === "ABC123");
  const ingresos = rowOf(report, "ABC123", "INGRESOS");
  assert.equal(ingresos.actual, 2500000);
  assert.equal(ingresos.budget, 2000000);
  assert.equal(ingresos.budget_coverage, "full");

  assert.equal(rowOf(report, "ABC123", "GASTOS_PERSONAL").actual, 800000);
  assert.equal(rowOf(report, "ABC123", "TOTAL_INGRESOS").actual, 2500000);
  assert.equal(rowOf(report, "ABC123", "TOTAL_GASTOS_OPERACIONALES").actual, 800000);
  assert.equal(rowOf(report, "ABC123", "UTILIDAD_OPERACIONAL").actual, 1700000);
  assert.equal(rowOf(report, "ABC123", "INGRESOS_NO_OPERACIONALES").actual, 25000);
  assert.equal(rowOf(report, "ABC123", "UTILIDAD_ANTES_DE_IMPUESTOS").actual, 1725000);
  assert.equal(rowOf(report, "ABC123", "IMPUESTO_REGIMEN_SIMPLE").actual, 10000);
  assert.equal(rowOf(report, "ABC123", "UTILIDAD_NETA").actual, 1715000);

  // Presupuesto del impuesto null (nunca cero implicito).
  assert.equal(rowOf(report, "ABC123", "IMPUESTO_REGIMEN_SIMPLE").budget, null);

  const corporate = report.corporate;
  assert.equal(corporate.totals.neta.actual, 1715000);
  assert.equal(corporate.income_actual, 2500000);
  assert.equal(report.reconciliation.ledger_net, 1715000);
  assert.equal(report.reconciliation.difference, 0);
  assert.equal(report.data_status.source, "accounting");
  assert.equal(report.data_status.vehicles_with_income, 1);
  assert.equal(vehicle.center_code, "ABC123");
  assert.equal(vehicle.branch_name, "Sucursal Norte");
});

test("motor: vehiculo sin datos conserva todas las filas en cero ordenadas", () => {
  const proposal = cloneProposal();
  const report = buildAccountingReport({
    period: "2026-03",
    concepts: proposal.concepts,
    vehicles: VEHICLES,
    tree: TREE,
    leaves: [leaf(1, "41450501", "ABC123", 100000)],
    interactive: { warnings: [], linkage: {} }
  });
  const empty = report.vehicles.find((item) => item.plate === "XYZ789");
  assert.equal(empty.rows.length, proposal.concepts.length);
  assert.ok(empty.rows.every((item) => item.actual === 0 || item.kind.startsWith("subtotal")));
  const codes = empty.rows.map((item) => item.code);
  const expected = config.orderConcepts(proposal.concepts).map((item) => item.code);
  assert.deepEqual(codes, expected);
});

test("motor: bloques sin vehiculo, cuentas sin clasificar y duplicados con aviso", () => {
  const proposal = cloneProposal();
  const leaves = [
    leaf(1, "41450501", "ABC123", 100000000),
    leaf(2, "42000501", "ABC123", 5000000),
    leaf(3, "51999999", "ABC123", -3000000),
    leaf(4, "52050601", "DESCONOCIDO", -2000000),
    leaf(4, "52050601", "DESCONOCIDO", -2000000)
  ];
  const report = buildAccountingReport({
    period: "2026-03",
    concepts: proposal.concepts,
    vehicles: VEHICLES,
    tree: TREE,
    leaves,
    interactive: { warnings: [], linkage: {} }
  });

  assert.ok(rowOf(report, "ABC123", "INGRESOS_SIN_CLASIFICAR"));
  assert.equal(rowOf(report, "ABC123", "INGRESOS_SIN_CLASIFICAR").actual, 50000);
  assert.equal(rowOf(report, "ABC123", "GASTOS_SIN_CLASIFICAR").actual, 30000);
  assert.equal(rowOf(report, "ABC123", "TOTAL_INGRESOS").actual, 1050000);

  assert.ok(report.unassigned);
  assert.equal(report.unassigned.rows.find((item) => item.code === "GASTOS_PERSONAL").actual, 20000);

  // El duplicado se cuenta una sola vez con aviso; los centros sin vehiculo
  // nunca desaparecen del consolidado.
  assert.ok(report.warnings.some((item) => item.code === "DUPLICATE_LEAF_TUPLE"));
  assert.ok(report.warnings.some((item) => item.code === "UNASSIGNED_CENTERS_PRESENT"));
  assert.ok(report.warnings.some((item) => item.code === "UNCLASSIFIED_LEDGER_ACCOUNTS"));
  assert.equal(report.corporate.totals.totalGastos.actual, 50000);
});

test("motor: conceptos pendientes visibles con mensaje y sin romper la neta", () => {
  const proposal = cloneProposal();
  const report = buildAccountingReport({
    period: "2026-03",
    concepts: proposal.concepts,
    vehicles: VEHICLES,
    tree: TREE,
    leaves: [leaf(1, "41450501", "ABC123", 100000000)],
    interactive: { warnings: [], linkage: {} }
  });
  const creditos = rowOf(report, "ABC123", "CREDITOS");
  assert.equal(creditos.actual, 0);
  assert.equal(creditos.pending, true);
  assert.equal(creditos.pending_message, "Pendiente de asociar cuenta");
  assert.ok(report.warnings.some((item) => item.code === "CONCEPT_PENDING_ACCOUNT" && item.message.includes("CREDITOS")));
});

test("motor: depreciacion informativa no se resta y la reconciliacion la declara", () => {
  const proposal = cloneProposal();
  const conceptos = proposal.concepts.map((item) =>
    item.code === "DEPRECIACION"
      ? { ...item, ranges: [{ start: "52991501", end: "52991501" }] }
      : item
  );
  const leaves = [
    leaf(1, "41450501", "ABC123", 100000000),
    leaf(2, "52991501", "ABC123", -500000)
  ];
  const report = buildAccountingReport({
    period: "2026-03",
    concepts: conceptos,
    vehicles: VEHICLES,
    tree: TREE,
    leaves,
    interactive: { warnings: [], linkage: {} }
  });
  assert.equal(rowOf(report, "ABC123", "DEPRECIACION").actual, 5000);
  assert.equal(rowOf(report, "ABC123", "DEPRECIACION").informational, true);
  assert.equal(rowOf(report, "ABC123", "UTILIDAD_NETA").actual, 1000000);
  assert.equal(report.reconciliation.ledger_net, 995000);
  assert.equal(report.reconciliation.difference, 5000);
  assert.equal(report.reconciliation.informational_actual, 5000);
  assert.ok(report.warnings.some((item) => item.code === "RECONCILIATION_DIFFERENCE"));
});

test("motor: presupuesto cero conserva cobertura y cump nulo por presupuesto no positivo", () => {
  const proposal = cloneProposal();
  const leaves = [
    leaf(1, "41450501", "ABC123", 100000000, 0),
    leaf(2, "52050601", "ABC123", -50000000, -10000000)
  ];
  const report = buildAccountingReport({
    period: "2026-03",
    concepts: proposal.concepts,
    vehicles: VEHICLES,
    tree: TREE,
    leaves,
    interactive: { warnings: [], linkage: {} }
  });
  const ingresos = rowOf(report, "ABC123", "INGRESOS");
  assert.equal(ingresos.budget, 0);
  assert.equal(ingresos.budget_coverage, "full");
  assert.equal(ingresos.cump, null);
  const gastos = rowOf(report, "ABC123", "GASTOS_PERSONAL");
  assert.equal(gastos.actual, 500000);
  assert.equal(gastos.budget, 100000);
  assert.equal(gastos.cump, 5);
});

test("motor: drill por cuenta y centro con nombres, y asignacion por placa unica", () => {
  const proposal = cloneProposal();
  // Sin fila de organizacion para el centro: el respaldo por placa normalizada
  // asigna el centro si la coincidencia es unica.
  const treeSinVehiculo = { societies: [], branches: [{ code: "B1", name: "Sucursal Norte" }], cost_centers: [] };
  const leaves = [
    leaf(1, "41450501", "abc 123", 100000000),
    leaf(1, "41450501", "abc123", 50000000)
  ];
  const report = buildAccountingReport({
    period: "2026-03",
    concepts: proposal.concepts,
    vehicles: VEHICLES,
    tree: treeSinVehiculo,
    leaves,
    interactive: { warnings: [], linkage: {} }
  });
  const vehicle = report.vehicles.find((item) => item.plate === "ABC123");
  const ingresos = vehicle.rows.find((item) => item.code === "INGRESOS");
  assert.equal(ingresos.actual, 1500000);
  assert.equal(ingresos.children.length, 1);
  const account = ingresos.children[0];
  assert.equal(account.account_code, "41450501");
  assert.equal(account.account_name, "Cuenta 41450501");
  assert.equal(account.centers.length, 2);
  assert.ok(account.centers.every((item) => item.branch_name === "Sucursal Norte"));
  assert.ok(report.warnings.some((item) => item.code === "CENTER_VEHICLE_NOT_IN_FLEET") === false);
});

test("motor: concepto con codigo personalizado y varios rangos", () => {
  const custom = [
    concept("INGRESOS_CUSTOM", "INGRESOS PROPIOS", "income", "ingresos", 1,
      [{ start: "41450101", end: "41450101" }, { start: "41750501", end: "41750501" }]),
    concept("TOTAL_INGRESOS", "TOTAL INGRESOS", "subtotal_ingresos", "resultados", 2)
  ];
  const leaves = [
    leaf(1, "41450101", "ABC123", 100000),
    leaf(2, "41750501", "ABC123", 25000)
  ];
  const report = buildAccountingReport({
    period: "2026-03",
    concepts: custom,
    vehicles: VEHICLES,
    tree: TREE,
    leaves,
    interactive: { warnings: [], linkage: {} }
  });
  assert.equal(rowOf(report, "ABC123", "INGRESOS_CUSTOM").actual, 1250);
  assert.equal(rowOf(report, "ABC123", "TOTAL_INGRESOS").actual, 1250);
});

test("motor: el mapeo por organization_tree.vehicle_id tiene prioridad", () => {
  const proposal = cloneProposal();
  const report = buildAccountingReport({
    period: "2026-03",
    concepts: proposal.concepts,
    vehicles: VEHICLES,
    tree: TREE,
    leaves: [leaf(1, "41450501", "ABC123", 100000)],
    interactive: { warnings: [], linkage: {} }
  });
  const vehicle = report.vehicles.find((item) => item.plate === "ABC123");
  assert.equal(vehicle.center_code, "ABC123");
  assert.equal(UNASSIGNED_BUCKET, "SIN_VEHICULO");
});

test("motor: el estado de enlace del PYG interactivo se propaga como avisos", () => {
  const proposal = cloneProposal();
  const report = buildAccountingReport({
    period: "2026-03",
    concepts: proposal.concepts,
    vehicles: VEHICLES,
    tree: TREE,
    leaves: [],
    interactive: { warnings: [], linkage: { orphan: 2, ambiguous: 1 } }
  });
  assert.ok(report.warnings.some((item) => item.code === "LEDGER_WITHOUT_METADATA"));
  assert.ok(report.warnings.some((item) => item.code === "LEDGER_AMBIGUOUS_METADATA"));
});

test("motor: las filas dinamicas entran antes de su subtotal y no quedan pendientes", () => {
  const proposal = cloneProposal();
  const leaves = [
    leaf(1, "41450501", "ABC123", 100000000),
    leaf(2, "42000501", "ABC123", 5000000),
    leaf(3, "51999999", "ABC123", -3000000),
    leaf(4, "52999999", "XYZ789", -700000)
  ];
  const report = buildAccountingReport({
    period: "2026-03",
    concepts: proposal.concepts,
    vehicles: VEHICLES,
    tree: TREE,
    leaves,
    interactive: { warnings: [], linkage: {} }
  });

  // El catalogo dinamico es global: todos los bloques muestran las mismas
  // filas, en cero donde no hay importe.
  for (const scope of ["ABC123", "XYZ789", "corporate"]) {
    const rows = scope === "corporate" ? report.corporate.rows : report.vehicles.find((item) => item.plate === scope).rows;
    const codes = rows.map((item) => item.code);
    assert.ok(codes.indexOf("INGRESOS_SIN_CLASIFICAR") > codes.indexOf("INGRESOS"), scope);
    assert.ok(codes.indexOf("INGRESOS_SIN_CLASIFICAR") < codes.indexOf("TOTAL_INGRESOS"), scope);
    assert.ok(codes.indexOf("GASTOS_SIN_CLASIFICAR") > codes.indexOf("GASTOS_PERSONAL"), scope);
    assert.ok(codes.indexOf("GASTOS_SIN_CLASIFICAR") < codes.indexOf("TOTAL_GASTOS_OPERACIONALES"), scope);
    for (const code of ["INGRESOS_SIN_CLASIFICAR", "GASTOS_SIN_CLASIFICAR"]) {
      const row = rows.find((item) => item.code === code);
      assert.equal(row.pending, false, `${scope} ${code}`);
      assert.equal(row.dynamic, true, `${scope} ${code}`);
    }
  }

  assert.equal(rowOf(report, "ABC123", "TOTAL_INGRESOS").actual, 1050000);
  assert.equal(rowOf(report, "ABC123", "TOTAL_GASTOS_OPERACIONALES").actual, 30000);
  assert.equal(rowOf(report, "ABC123", "UTILIDAD_OPERACIONAL").actual, 1020000);
  assert.equal(rowOf(report, "XYZ789", "INGRESOS_SIN_CLASIFICAR").actual, 0);
  assert.equal(rowOf(report, "XYZ789", "INGRESOS_SIN_CLASIFICAR").children.length, 0);
  assert.equal(rowOf(report, "XYZ789", "TOTAL_GASTOS_OPERACIONALES").actual, 7000);
  assert.equal(rowOf(report, "XYZ789", "GASTOS_SIN_CLASIFICAR").actual, 7000);
  assert.equal(rowOf(report, "corporate", "TOTAL_INGRESOS").actual, 1050000);
  assert.equal(rowOf(report, "corporate", "TOTAL_GASTOS_OPERACIONALES").actual, 37000);
  assert.equal(rowOf(report, "corporate", "UTILIDAD_NETA").actual, 1013000);
  assert.equal(report.reconciliation.difference, 0);
  assert.equal(report.data_status.unmapped_total, 37000);

  const dynamicIncome = rowOf(report, "ABC123", "INGRESOS_SIN_CLASIFICAR");
  const dynamicExpense = rowOf(report, "ABC123", "GASTOS_SIN_CLASIFICAR");
  assert.equal(dynamicIncome.children.length, 1);
  assert.equal(dynamicIncome.children[0].account_code, "42000501");
  // ABC123 solo aporta 51999999; 52999999 pertenece a XYZ789.
  assert.equal(dynamicExpense.children.length, 1);
  assert.equal(dynamicExpense.children[0].account_code, "51999999");
  const corporateExpense = rowOf(report, "corporate", "GASTOS_SIN_CLASIFICAR");
  assert.deepEqual(corporateExpense.children.map((item) => item.account_code), ["51999999", "52999999"]);
  assert.equal(corporateExpense.actual, 37000);
});

test("motor: sin clasificar decide por clase PUC, no por el signo del movimiento", () => {
  const proposal = cloneProposal();
  const leaves = [
    leaf(1, "41450501", "ABC123", 100000000),
    // Gasto revertido: credito mayor que debito deja contribucion positiva.
    leaf(2, "52999999", "ABC123", 400000),
    // Gasto presupuestado sin ejecucion: actual 0 y presupuesto negativo.
    leaf(3, "52999998", "ABC123", 0, -1000000),
    // Ingreso con nota credito (contribucion negativa) sigue siendo ingreso.
    leaf(4, "42000888", "ABC123", -200000)
  ];
  const report = buildAccountingReport({
    period: "2026-03",
    concepts: proposal.concepts,
    vehicles: VEHICLES,
    tree: TREE,
    leaves,
    interactive: { warnings: [], linkage: {} }
  });

  const gastos = rowOf(report, "ABC123", "GASTOS_SIN_CLASIFICAR");
  assert.ok(gastos, "las cuentas 5-7 sin concepto son gasto aunque su contribucion sea positiva o cero");
  assert.equal(gastos.actual, -4000);
  assert.equal(gastos.budget, 10000);
  assert.equal(gastos.budget_coverage, "partial");
  assert.equal(gastos.children.length, 2);

  const ingresos = rowOf(report, "ABC123", "INGRESOS_SIN_CLASIFICAR");
  assert.equal(ingresos.actual, -2000);
  assert.equal(report.data_status.unclassified_expense, -4000);
  assert.equal(report.data_status.unclassified_income, -2000);
  assert.equal(rowOf(report, "ABC123", "TOTAL_GASTOS_OPERACIONALES").actual, -4000);
  assert.equal(rowOf(report, "corporate", "TOTAL_GASTOS_OPERACIONALES").actual, -4000);
  assert.equal(report.reconciliation.difference, 0);
});

test("motor: centro repetido en sucursales distintas se asigna por sucursal exacta", () => {
  const proposal = cloneProposal();
  const tree = {
    societies: [],
    branches: [{ code: "B1", name: "Sucursal Norte" }, { code: "B2", name: "Sucursal Sur" }],
    cost_centers: [
      { code: "ABC123", name: "Vehiculo ABC123", branch_code: "B1", vehicle_id: 1, active: true },
      { code: "ABC123", name: "Vehiculo XYZ789", branch_code: "B2", vehicle_id: 2, active: true }
    ]
  };
  const leaves = [
    { ...leaf(1, "41450501", "ABC123", 100000000), branch: "B2", branch_name: "Sucursal Sur" }
  ];
  const report = buildAccountingReport({
    period: "2026-03",
    concepts: proposal.concepts,
    vehicles: VEHICLES,
    tree,
    leaves,
    interactive: { warnings: [], linkage: {} }
  });
  assert.equal(rowOf(report, "XYZ789", "INGRESOS").actual, 1000000);
  assert.equal(rowOf(report, "ABC123", "INGRESOS").actual, 0);
  assert.equal(report.unassigned, null);
});

test("motor: centro ambiguo sin sucursal que lo resuelva queda sin vehiculo con aviso", () => {
  const proposal = cloneProposal();
  const tree = {
    societies: [],
    branches: [{ code: "B1", name: "Sucursal Norte" }, { code: "B2", name: "Sucursal Sur" }],
    cost_centers: [
      { code: "ABC123", name: "Vehiculo ABC123", branch_code: "B1", vehicle_id: 1, active: true },
      { code: "ABC123", name: "Vehiculo XYZ789", branch_code: "B2", vehicle_id: 2, active: true }
    ]
  };
  const leaves = [
    { ...leaf(1, "41450501", "ABC123", 100000000), branch: "B9", branch_name: "Sucursal ajena" }
  ];
  const report = buildAccountingReport({
    period: "2026-03",
    concepts: proposal.concepts,
    vehicles: VEHICLES,
    tree,
    leaves,
    interactive: { warnings: [], linkage: {} }
  });
  assert.equal(rowOf(report, "ABC123", "INGRESOS").actual, 0);
  assert.equal(rowOf(report, "XYZ789", "INGRESOS").actual, 0);
  assert.ok(report.unassigned);
  assert.equal(rowOf(report, "unassigned", "INGRESOS").actual, 1000000);
  assert.ok(report.warnings.some((item) => item.code === "CENTER_BRANCH_AMBIGUOUS"));
});

test("motor: el respaldo por placa no asigna a un vehiculo de otra sucursal", () => {
  const proposal = cloneProposal();
  const tree = {
    societies: [],
    branches: [{ code: "B1", name: "Sucursal Norte" }, { code: "B2", name: "Sucursal Sur" }],
    cost_centers: [
      { code: "ABC123", name: "Vehiculo ABC123", branch_code: "B2", vehicle_id: 1, active: true }
    ]
  };
  const leaves = [
    { ...leaf(1, "41450501", "abc 123", 100000000), branch: "B1", branch_name: "Sucursal Norte" }
  ];
  const report = buildAccountingReport({
    period: "2026-03",
    concepts: proposal.concepts,
    vehicles: VEHICLES,
    tree,
    leaves,
    interactive: { warnings: [], linkage: {} }
  });
  assert.equal(rowOf(report, "ABC123", "INGRESOS").actual, 0);
  assert.equal(rowOf(report, "unassigned", "INGRESOS").actual, 1000000);
});
