// Motor puro del PYG por vehiculo: agrega los valores por placa y calcula
// presupuesto vs ejecutado, % sobre ingresos, cumplimiento y resultados.
// Sin dependencias de Prisma: el servicio le entrega los datos crudos y este
// modulo devuelve el DTO del reporte (facil de probar unitariamente).

const { UNMAPPED_CONCEPT } = require("./concept-catalog");

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

// Suma monetaria en centavos para evitar deriva de coma flotante en subtotales.
function sumCents(values) {
  let total = 0;
  for (const value of values) total += Math.round(Number(value || 0) * 100);
  return total / 100;
}

// Las placas se normalizan sin espacios: el maestro vehicular las guarda compactas
// ("ESQ294") y la liquidacion/adquisiciones pueden digitarse con espacios ("ESQ 294").
function normalizePlate(value) {
  return String(value || "").toUpperCase().replace(/\s+/g, "");
}

// Fechas del periodo YYYY-MM (iniicio y fin de mes en formato YYYY-MM-DD).
function periodBounds(period) {
  const [year, month] = String(period).split("-").map(Number);
  const start = `${period}-01`;
  const endDate = new Date(Date.UTC(year, month, 0));
  const end = `${period}-${String(endDate.getUTCDate()).padStart(2, "0")}`;
  return { start, end };
}

function pct(numerator, denominator) {
  if (!denominator || Math.abs(denominator) < 1e-9) return null;
  return Math.round((numerator / denominator) * 10000) / 10000;
}

function indexBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows || []) {
    const key = keyFn(row);
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + Number(row.total || 0));
  }
  return map;
}

// Construye el reporte completo a partir de los agregados crudos del servicio.
// vehicles: [{id, plate, authorized_driver_id}]
// budgets: [{vehicle_id, concept_code, amount}]
// incomeRows/pettyRows: [{plate, total}] / [{plate, concept_code, total}]
// payrollRows/pilaRows/provisionRows: [{employee_id, total}]
// sourceMaps: [{source_type, source_code, pyg_concept_code}]
function buildReport({ period, concepts, vehicles, budgets, incomeRows, pettyRows, payrollRows, pilaRows, provisionRows, sourceMaps, taxPercent }) {
  const { start, end } = periodBounds(period);
  const taxRate = Number(taxPercent || 0) / 100;
  const incomeByPlate = indexBy(incomeRows, (row) => normalizePlate(row.plate));
  const payrollByEmployee = indexBy(payrollRows, (row) => String(row.employee_id));
  const pilaByEmployee = indexBy(pilaRows, (row) => String(row.employee_id));
  const provisionByEmployee = indexBy(provisionRows, (row) => String(row.employee_id));
  const pettyByPlateConcept = new Map();
  for (const row of pettyRows || []) {
    const plate = normalizePlate(row.plate);
    if (!plate) continue;
    const key = `${plate}||${String(row.concept_code || "").toUpperCase().trim()}`;
    pettyByPlateConcept.set(key, (pettyByPlateConcept.get(key) || 0) + Number(row.total || 0));
  }
  const mapBySourceCode = new Map();
  for (const map of sourceMaps || []) {
    if (map.source_type !== "petty_cash_concept" || map.active === false) continue;
    mapBySourceCode.set(String(map.source_code).toUpperCase().trim(), map.pyg_concept_code);
  }

  const corporateIncome = vehicles.reduce((acc, vehicle) => acc + (incomeByPlate.get(normalizePlate(vehicle.plate)) || 0), 0);

  const expenseCodes = new Set(concepts.filter((concept) => concept.kind === "expense").map((concept) => concept.code));

  const vehicleReports = vehicles.map((vehicle) => {
    const plate = normalizePlate(vehicle.plate);
    const driverId = vehicle.authorized_driver_id != null ? String(vehicle.authorized_driver_id) : null;
    const expenses = {};
    let unmappedTotal = 0;

    for (const concept of concepts) {
      if (concept.kind === "expense") expenses[concept.code] = 0;
    }

    // Canal personal: nómina bruta, PILA (empleado + empleador) y provisión de prestaciones
    // se imputan al vehículo a través de su conductor autorizado.
    if (driverId) {
      expenses.GASTOS_PERSONAL = (expenses.GASTOS_PERSONAL || 0) + (payrollByEmployee.get(driverId) || 0);
      expenses.SEGURIDAD_SOCIAL = (expenses.SEGURIDAD_SOCIAL || 0) + (pilaByEmployee.get(driverId) || 0);
      expenses.PROVISION_PRESTACIONES = (expenses.PROVISION_PRESTACIONES || 0) + (provisionByEmployee.get(driverId) || 0);
    }

    // Canal caja menor: lineas con centro de costo = placa, clasificadas por mapping.
    for (const [key, total] of pettyByPlateConcept) {
      const [rowPlate, conceptCode] = key.split("||");
      if (rowPlate !== plate) continue;
      const pygCode = mapBySourceCode.get(conceptCode);
      if (pygCode && expenseCodes.has(pygCode)) {
        expenses[pygCode] = (expenses[pygCode] || 0) + total;
      } else {
        unmappedTotal += total;
      }
    }
    if (unmappedTotal > 0) expenses[UNMAPPED_CONCEPT.code] = unmappedTotal;

    const incomeActual = round2(incomeByPlate.get(plate) || 0);
    const budgetByCode = {};
    for (const budget of budgets || []) {
      if (Number(budget.vehicle_id) !== Number(vehicle.id)) continue;
      budgetByCode[budget.concept_code] = round2(Number(budget.amount || 0));
    }

    const gastosOperativos = round2(sumCents(Object.entries(expenses)
      .filter(([code]) => code !== "INGRESOS_NO_OPERACIONALES" && code !== "GASTOS_FINANCIEROS" && code !== "GASTOS_NO_FINANCIEROS")
      .map(([, value]) => value)));
    const utilidadOperacional = round2(incomeActual - gastosOperativos);
    const noOperativosNeto = round2(sumCents([expenses.INGRESOS_NO_OPERACIONALES || 0, -(expenses.GASTOS_FINANCIEROS || 0), -(expenses.GASTOS_NO_FINANCIEROS || 0)]));
    const utilidadAntesDeImpuestos = round2(utilidadOperacional + noOperativosNeto);
    const impuesto = round2(incomeActual * taxRate);
    const utilidadNeta = round2(utilidadAntesDeImpuestos - impuesto);

    const rows = concepts.map((concept) => {
      let actual = 0;
      switch (concept.kind) {
        case "income": actual = concept.code === "INGRESOS" ? incomeActual : round2(expenses[concept.code] || 0); break;
        case "expense": actual = round2(expenses[concept.code] || 0); break;
        case "subtotal_gastos_operativos": actual = gastosOperativos; break;
        case "subtotal_utilidad_operacional": actual = utilidadOperacional; break;
        case "subtotal_antes_de_impuestos": actual = utilidadAntesDeImpuestos; break;
        case "tax": actual = impuesto; break;
        case "subtotal_utilidad_neta": actual = utilidadNeta; break;
        default: actual = 0;
      }
      let budget;
      if (concept.kind === "tax") {
        budget = round2((budgetByCode.INGRESOS || 0) * taxRate);
      } else if (concept.kind === "income" || concept.kind === "expense") {
        budget = budgetByCode[concept.code] || 0;
      } else {
        const components = concepts.filter((candidate) => (
          (concept.kind === "subtotal_gastos_operativos" && candidate.section === "gastos_operativos" && candidate.kind === "expense")
          || (concept.kind === "subtotal_utilidad_operacional" && (candidate.code === "INGRESOS" || (candidate.section === "gastos_operativos" && candidate.kind === "expense")))
          || (concept.kind === "subtotal_antes_de_impuestos" && (candidate.code === "INGRESOS" || (candidate.kind === "expense")))
          || (concept.kind === "subtotal_utilidad_neta" && (candidate.code === "INGRESOS" || candidate.kind === "expense" || candidate.kind === "tax"))
        ));
        const signFor = (candidate) => {
          if (concept.kind !== "subtotal_utilidad_operacional" && concept.kind !== "subtotal_antes_de_impuestos" && concept.kind !== "subtotal_utilidad_neta") return 1;
          if (candidate.code === "INGRESOS" || candidate.code === "INGRESOS_NO_OPERACIONALES") return 1;
          if (candidate.kind === "expense" || candidate.kind === "tax") return -1;
          return 1;
        };
        budget = round2(components.reduce((acc, candidate) => acc + signFor(candidate) * (budgetByCode[candidate.code] || (candidate.kind === "tax" ? round2((budgetByCode.INGRESOS || 0) * taxRate) : 0)), 0));
      }
      return {
        code: concept.code,
        name: concept.name,
        section: concept.section,
        kind: concept.kind,
        budget,
        actual,
        pct: pct(actual, concept.code === "INGRESOS" ? corporateIncome : incomeActual),
        cump: budget > 0 ? pct(actual, budget) : null
      };
    });

    return {
      vehicle_id: vehicle.id,
      plate: vehicle.plate,
      vehicle_label: [vehicle.brand, vehicle.line].filter(Boolean).join(" ") || null,
      driver_id: vehicle.authorized_driver_id || null,
      income_actual: incomeActual,
      unmapped_expense: round2(unmappedTotal),
      rows
    };
  });

  // Fila dinamica de gastos sin clasificar: se agrega al final de los gastos operativos
  // cuando al menos un vehiculo tiene valores sin mapping (salud del dato).
  const anyUnmapped = vehicleReports.some((vehicle) => vehicle.unmapped_expense > 0);
  let reportConcepts = concepts;
  if (anyUnmapped) {
    reportConcepts = [];
    for (const concept of concepts) {
      reportConcepts.push(concept);
      if (concept.code === "GASTOS_LEGALES") reportConcepts.push({ ...UNMAPPED_CONCEPT, order: concept.order + 0.5, dynamic: true });
    }
    for (const vehicle of vehicleReports) {
      const insertAt = vehicle.rows.findIndex((row) => row.code === "TOTAL_GASTOS_OPERACIONALES");
      const row = {
        code: UNMAPPED_CONCEPT.code,
        name: UNMAPPED_CONCEPT.name,
        section: UNMAPPED_CONCEPT.section,
        kind: "expense",
        dynamic: true,
        budget: 0,
        actual: vehicle.unmapped_expense,
        pct: pct(vehicle.unmapped_expense, vehicle.income_actual),
        cump: null
      };
      vehicle.rows.splice(insertAt < 0 ? vehicle.rows.length : insertAt, 0, row);
    }
  }

  // Consolidado corporativo: suma por concepto en vehiculos, % y cumplimiento contra
  // los totales corporativos (mismo criterio que la hoja DETALLE del Excel).
  const corporateIncomeTotal = round2(vehicleReports.reduce((acc, vehicle) => acc + vehicle.income_actual, 0));
  const corporateRows = reportConcepts.map((concept) => {
    const budget = round2(vehicleReports.reduce((acc, vehicle) => {
      const row = vehicle.rows.find((item) => item.code === concept.code);
      return acc + (row ? row.budget : 0);
    }, 0));
    const actual = round2(vehicleReports.reduce((acc, vehicle) => {
      const row = vehicle.rows.find((item) => item.code === concept.code);
      return acc + (row ? row.actual : 0);
    }, 0));
    return {
      code: concept.code,
      name: concept.name,
      section: concept.section,
      kind: concept.kind,
      dynamic: Boolean(concept.dynamic),
      budget,
      actual,
      pct: pct(actual, corporateIncomeTotal),
      cump: budget > 0 ? pct(actual, budget) : null
    };
  });

  return {
    period,
    period_start: start,
    period_end: end,
    tax_percent: Number(taxPercent || 0),
    concepts: reportConcepts.map((concept) => ({ code: concept.code, name: concept.name, section: concept.section, kind: concept.kind, display_order: concept.order, dynamic: Boolean(concept.dynamic) })),
    vehicles: vehicleReports,
    corporate: {
      income_actual: corporateIncomeTotal,
      unmapped_expense: round2(vehicleReports.reduce((acc, vehicle) => acc + vehicle.unmapped_expense, 0)),
      rows: corporateRows
    },
    data_status: {
      vehicle_count: vehicleReports.length,
      vehicles_with_income: vehicleReports.filter((vehicle) => vehicle.income_actual > 0).length,
      unmapped_total: round2(vehicleReports.reduce((acc, vehicle) => acc + vehicle.unmapped_expense, 0))
    }
  };
}

module.exports = { buildReport, periodBounds, normalizePlate, round2 };
