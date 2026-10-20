// Certificacion LOCAL (en vivo) del reporte PYG por Vehiculo (transport-pyg).
//
// Alcance certificado:
//   - Estado de resultados por placa (centro de costo = vehiculo) con las 23 lineas del
//     catalogo corporativo (ingresos, gastos operativos, subtotales, impuesto regimen
//     simple y utilidad neta), presupuesto por vehiculo/concepto, cumplimiento y %.
//   - Canales reales de la plataforma: ingresos de items de liquidacion aprobados
//     (TransportSettlementItem con placa), gastos de caja menor con centro de costo
//     (petty_cash_voucher_lines), nomina/PILA/prestaciones imputadas por conductor
//     autorizado (Vehicle.authorized_driver_id -> Employee).
//   - Fila dinamica "GASTOS SIN CLASIFICAR" como salud del dato (conceptos de caja
//     menor sin mapeo al catalogo PYG).
//
// Poblacion con datos reales del workbook "PYG_CORPORATIVO_Logistica Agosto- 2026":
// las 9 placas del Excel (GOLIAT como ancla estricta: ingresos 19.150.000, cump 0.766,
// gastos operativos 22.653.852,39, utilidad neta -3.934.727,39), flujo completo de
// liquidacion por transporte (borrador -> validando -> preliquidada -> ajustes ->
// en_revision -> aprobada), comprobantes de caja menor por placa, presupuestos via
// PUT /transport-pyg/budgets y canal conductor (empleado real + nomina + PILA +
// provision en las tablas de resultado de TH).
//
// Arranca la API Fastify contra la base LOCAL y aborta si DATABASE_URL no apunta a
// localhost/127.0.0.1. Sale con codigo distinto de cero ante cualquier fallo.

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function argsFrom(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const v = argv[i];
    if (!v.startsWith("--")) continue;
    out[v.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
  }
  return out;
}
const args = argsFrom(process.argv.slice(2));
require("../load-env")(path.resolve(String(args["env-file"] || ".env")));

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
if (!/^postgres(?:ql)?:\/\/[^@\s]+@(localhost|127\.0\.0\.1)(:\d+)?\//.test(DATABASE_URL)) {
  console.error("BLOQUEADO: la certificacion solo corre contra una base LOCAL (localhost/127.0.0.1). Define DATABASE_URL local antes de ejecutar.");
  process.exit(1);
}
process.env.DISABLE_REDIS = process.env.DISABLE_REDIS || "true";

const ROOT = path.resolve(__dirname, "..", "..");
const API = path.join(ROOT, "apps/api");
const PORT = Number(args.port || 3212);
const API_URL = `http://127.0.0.1:${PORT}`;
const REQUEST_TIMEOUT_MS = Number(args["request-timeout-ms"] || 25000);
const OUTPUT = path.resolve(String(args.output || "docs/qa/evidence/transport-pyg-20261013/local-certification.json"));
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const EMAIL = process.env.LOCAL_TMS_EMAIL || "demo@apex.local";
const PASSWORD = process.env.LOCAL_TMS_PASSWORD || "test1234";
const CERT_ID = "transport-pyg-20261013";
const PERIOD = "2026-08";
const PERIOD_START = "2026-08-01";
const PERIOD_END = "2026-08-31";
const HR_PERIOD_KEY = `mes:${PERIOD_START}:${PERIOD_END}`;

// Datos reales del Excel "PYG_CORPORATIVO_Logistica Agosto- 2026" (hoja TODOSCC).
const VEHICLES = [
  { plate: "ESQ 294", name: "GOLIAT", income: 19150000.0, incomeBudget: 25000000 },
  { plate: "ESQ 742", name: "MARCOPOLO", income: 12659364.0, incomeBudget: 17790000 },
  { plate: "GTX 052", name: "MAXIMO", income: 16548624.0, incomeBudget: 20340000 },
  { plate: "JYX 457", name: "TITAN", income: 23163333.33, incomeBudget: 18640000 },
  { plate: "LKN 995", name: "PERSEO", income: 17841605.0, incomeBudget: 18890000 },
  { plate: "JYY 249", name: "ZEUS", income: 27744000.0, incomeBudget: 20400000 },
  { plate: "PUN 276", name: "FENIX", income: 9494420.0, incomeBudget: 13780000 },
  { plate: "NNM 737", name: "HERMES", income: 50752980.0, incomeBudget: 31860000 },
  { plate: "PUN 774", name: "ORION", income: 23566205.0, incomeBudget: 21710000 }
];
const GOLIAT_EXPENSES = [
  ["COMBUSTIBLE", 3323769.1],
  ["PEAJES", 2013600],
  ["VIATICOS", 755000],
  ["MANTENIMIENTO_VEHICULO", 4082037],
  ["SEGURO_POLIZA", 715511],
  ["HONORARIOS", 397666.67],
  ["DOTACION", 814842.78],
  ["OTROS", 385544.78]
];
const GOLIAT_EXPENSE_BUDGETS = [
  ["GASTOS_PERSONAL", 8085596],
  ["PROVISION_PRESTACIONES", 1214848],
  ["DOTACION", 238000],
  ["SEGURIDAD_SOCIAL", 830750],
  ["HONORARIOS_CONTABLES_SST", 584360],
  ["COMBUSTIBLE", 3386582],
  ["VIATICOS", 986456],
  ["MANTENIMIENTO_VEHICULO", 3147200],
  ["SEGURO_POLIZA", 894740],
  ["PARQUEADERO", 35000],
  ["PEAJES", 1011909],
  ["SEGURIDAD_MONITOREO", 92649],
  ["OTROS", 700000]
];
const DRIVER_PAYROLL_GROSS = 7803733;
const DRIVER_PILA_EMPLOYEE = 455000;
const DRIVER_PILA_EMPLOYER = 736588.11;
const DRIVER_PROVISION = 1170559.95;
const UNMAPPED_AMOUNT = 120000;

const result = {
  change_id: CERT_ID,
  certification: "transport-pyg-local",
  environment: "LOCAL",
  database_url_host: DATABASE_URL.replace(/\/\/[^@]*@/, "//***@"),
  generated_at: new Date().toISOString(),
  api_commit: "unknown",
  api_url: API_URL,
  scope: {
    capability: "Reporte PYG por vehiculo (centro de costo = placa) para el modulo de transporte: catalogo corporativo de 23 lineas, presupuesto por vehiculo/concepto, ingresos de liquidaciones aprobadas, gastos de caja menor con centro de costo, nomina/PILA/prestaciones por conductor autorizado, impuesto de regimen simple configurable, cumplimiento y porcentajes, fila dinamica de gastos sin clasificar, exportacion del reporte y auditoria de cambios de presupuesto/mapeo/configuracion.",
    proven_by_live_execution: [
      "GET /transport-pyg/report?period=2026-08 reproduce el PYG GOLIAT del Excel (ingresos 19.150.000, cump 0.766, gastos operativos 22.653.852,39, impuesto 430.875, utilidad neta -3.934.727,39) con datos poblados por las APIs reales",
      "POST /transport/vehicles crea las 9 placas del Excel y PUT /transport-pyg/budgets carga el presupuesto por vehiculo/concepto",
      "Flujo completo de liquidacion (items con placa -> validate -> precalculate -> adjustments -> submit -> decision aprobada) alimenta el canal de ingresos",
      "POST /petty-cash/vouchers con centro de costo por placa alimenta los canales de gasto clasificados y la fila dinamica sin clasificar",
      "Empleado real + nomina/PILA/prestaciones en tablas de resultado de TH alimentan el canal conductor por authorized_driver_id",
      "PUT /transport-pyg/config valida la tarifa del impuesto y PUT /transport-pyg/mapping valida el catalogo destino",
      "GET anonimo responde 401 y periodo invalido responde 400"
    ],
    proven_by_versioned_unit_suite: [
      "apps/api/test/transport-pyg-report.test.js (motor puro + servicio con prisma falso: 9 controles)"
    ]
  },
  checks: [],
  status: "running"
};

function check(name, ok, detail = {}) {
  result.checks.push({ name, ok: Boolean(ok), detail });
  console.error(`[cert] ${String(result.checks.length).padStart(2, "0")} ${ok ? "OK  " : "FALLA"} ${name}`);
  if (!ok) throw new Error(`Fallo de certificacion: ${name}`);
}

const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.011;
let TOKEN = "";
async function capture(pathname, { method = "GET", body, auth = true } = {}) {
  const started = Date.now();
  let status = 0;
  let payload = {};
  let transportError = null;
  try {
    const res = await fetch(`${API_URL}${pathname}`, {
      method,
      headers: { ...(auth && TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    status = res.status;
    payload = await res.json().catch(() => ({}));
  } catch (error) {
    transportError = error.message;
  }
  return { status, payload, transportError, latency_ms: Date.now() - started };
}

function normalizePlate(value) {
  // El API guarda las placas sin espacios; se normaliza igual para comparar.
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

async function main() {
  let app = null;
  try {
    const build = require(path.join(API, "server.js"));
    app = await build();
    await app.listen({ port: PORT, host: "127.0.0.1" });

    const health = await capture("/health", { auth: false });
    result.api_commit = health.payload?.commit || "unknown";
    check("health_ok", health.status === 200 && health.payload?.status === "OK", { status: health.status, commit: result.api_commit });

    const anon = await capture("/api/v1/transport-pyg/report?period=2026-08", { auth: false });
    check("anonymous_blocked_401", anon.status === 401, { status: anon.status });

    const login = await capture("/api/v1/auth/login", { method: "POST", auth: false, body: { email: EMAIL, password: PASSWORD } });
    check("admin_login", login.status === 200 && Boolean(login.payload?.token), { status: login.status });
    TOKEN = login.payload.token;

    const whoami = await capture("/api/v1/auth/me");
    const TENANT = whoami.payload?.tenant?.id || whoami.payload?.tenant_id || whoami.payload?.tenantId || "";
    check("tenant_resolved", Boolean(TENANT), { tenant: TENANT ? `${TENANT.slice(0, 8)}…` : "" });

    // ---- Catalogo PYG (siembra idempotente al leer) ----
    const concepts = await capture("/api/v1/transport-pyg/concepts");
    check("catalog_seeded_23_concepts", concepts.status === 200 && concepts.payload.length === 23 && concepts.payload[0].code === "INGRESOS" && concepts.payload[22].code === "UTILIDAD_NETA", { status: concepts.status, count: concepts.payload?.length });

    // ---- Validaciones de entrada ----
    const badPeriod = await capture("/api/v1/transport-pyg/report?period=08-2026");
    check("invalid_period_rejected", badPeriod.status === 400 && badPeriod.payload.code === "PYG_PERIOD_INVALID", { status: badPeriod.status, code: badPeriod.payload.code });
    const badBudgetVehicle = await capture("/api/v1/transport-pyg/budgets", { method: "PUT", body: { period: PERIOD, rows: [{ vehicle_id: 999999, concept_code: "INGRESOS", amount: 1000 }] } });
    check("budget_unknown_vehicle_rejected", badBudgetVehicle.status === 404 && badBudgetVehicle.payload.code === "PYG_VEHICLE_NOT_FOUND", { status: badBudgetVehicle.status, code: badBudgetVehicle.payload.code });
    const badBudgetConcept = await capture("/api/v1/transport-pyg/budgets", { method: "PUT", body: { period: PERIOD, rows: [{ vehicle_id: 1, concept_code: "NO_EXISTE", amount: 1000 }] } });
    check("budget_unknown_concept_rejected", badBudgetConcept.status === 400 && badBudgetConcept.payload.code === "PYG_BUDGET_CONCEPT_INVALID", { status: badBudgetConcept.status, code: badBudgetConcept.payload.code });
    const badTax = await capture("/api/v1/transport-pyg/config", { method: "PUT", body: { tax_percent: 150 } });
    // El schema Fastify (rango 0..100) rechaza en la frontera con FST_ERR_VALIDATION; el servicio
    // conserva PYG_TAX_INVALID como defensa interna. Ambos son rechazo 400 valido.
    check("config_tax_out_of_range_rejected", badTax.status === 400 && ["FST_ERR_VALIDATION", "PYG_TAX_INVALID"].includes(badTax.payload.code), { status: badTax.status, code: badTax.payload.code });
    const badMapping = await capture("/api/v1/transport-pyg/mapping", { method: "PUT", body: { rows: [{ source_type: "petty_cash_concept", source_code: "COMBUSTIBLE", pyg_concept_code: "NO_EXISTE" }] } });
    check("mapping_unknown_concept_rejected", badMapping.status === 400 && badMapping.payload.code === "PYG_MAPPING_CONCEPT_INVALID", { status: badMapping.status, code: badMapping.payload.code });

    // ---- Empleado conductor (canal nomina/PILA/provisiones) ----
    const employees = await capture("/api/v1/hr/employees?limit=500");
    const employeeDocument = (row) => row.document || (row.metadata && row.metadata.document) || "";
    let driver = (employees.payload || []).find((row) => employeeDocument(row) === "900100200");
    if (!driver) {
      const created = await capture("/api/v1/hr/employees", { method: "POST", body: { name: "Conductor GOLIAT PYG", first_name: "Conductor", last_name: "GOLIAT PYG", document: "900100200", document_type: "CC", position: "Conductor", salary_base: DRIVER_PAYROLL_GROSS, salary_type: "mensual", hire_date: "2026-01-15", labor_status: "activo" } });
      check("driver_employee_created", created.status === 201 && Boolean(created.payload?.id), { status: created.status, error: created.payload?.error });
      driver = created.payload;
    } else {
      check("driver_employee_created", true, { reused: driver.id });
    }
    const driverId = driver.id;

    // ---- Vehiculos: las 9 placas del Excel ----
    const existingVehicles = await capture("/api/v1/transport/vehicles?limit=500");
    const byPlate = new Map((existingVehicles.payload || []).map((row) => [normalizePlate(row.plate), row]));
    const vehicleIds = {};
    for (const spec of VEHICLES) {
      const key = normalizePlate(spec.plate);
      let row = byPlate.get(key);
      if (!row) {
        const created = await capture("/api/v1/transport/vehicles", { method: "POST", body: { plate: spec.plate, type: "camion", brand: "PYG", line: spec.name, ownership_type: "propio", base_site: "Principal", ...(spec.name === "GOLIAT" ? { authorized_driver_id: driverId } : {}) } });
        if (created.status !== 200 && created.status !== 201) throw new Error(`No fue posible crear el vehiculo ${spec.plate}: ${JSON.stringify(created.payload)}`);
        row = created.payload;
      } else if (spec.name === "GOLIAT" && !row.authorized_driver_id) {
        const updated = await capture(`/api/v1/transport/vehicles/${row.id}`, { method: "PUT", body: { plate: spec.plate, type: row.type || "camion", brand: row.brand || "PYG", line: spec.name, ownership_type: row.ownership_type || "propio", base_site: row.base_site || "Principal", authorized_driver_id: driverId } });
        if (updated.status === 200) row = updated.payload;
      }
      vehicleIds[spec.plate] = row.id;
    }
    check("vehicles_9_plates_ready", VEHICLES.every((spec) => vehicleIds[spec.plate] > 0), { plates: Object.keys(vehicleIds).length });

    // ---- Presupuestos por vehiculo/concepto ----
    const budgetRows = [];
    for (const spec of VEHICLES) {
      budgetRows.push({ vehicle_id: vehicleIds[spec.plate], concept_code: "INGRESOS", amount: spec.incomeBudget });
      if (spec.name === "GOLIAT") for (const [conceptCode, amount] of GOLIAT_EXPENSE_BUDGETS) budgetRows.push({ vehicle_id: vehicleIds[spec.plate], concept_code: conceptCode, amount });
    }
    const budgetsSaved = await capture("/api/v1/transport-pyg/budgets", { method: "PUT", body: { period: PERIOD, rows: budgetRows } });
    check("budgets_saved_for_9_vehicles", budgetsSaved.status === 200 && budgetsSaved.payload.upserted === budgetRows.length, { status: budgetsSaved.status, upserted: budgetsSaved.payload?.upserted });
    const budgetsRead = await capture(`/api/v1/transport-pyg/budgets?period=${PERIOD}`);
    check("budgets_roundtrip", budgetsRead.status === 200 && budgetsRead.payload.rows.length === budgetRows.length, { status: budgetsRead.status, rows: budgetsRead.payload?.rows?.length });

    // ---- Canal de ingresos: periodo + paquete de liquidacion aprobado ----
    const periods = await capture("/api/v1/transport/settlement-periods?limit=200");
    let periodRow = (periods.payload || []).find((row) => row.code === `PYG-SEM-${PERIOD}`);
    if (!periodRow) {
      const created = await capture("/api/v1/transport/settlement-periods", { method: "POST", body: { code: `PYG-SEM-${PERIOD}`, name: `PYG ${PERIOD}`, start_date: PERIOD_START, end_date: PERIOD_END } });
      check("settlement_period_created", created.status === 201 && created.payload.status === "abierto", { status: created.status });
      periodRow = created.payload;
    } else {
      check("settlement_period_created", true, { reused: periodRow.id });
    }
    const periodId = periodRow.id;

    const packages = await capture("/api/v1/transport/settlement-packages?limit=200");
    let pkg = (packages.payload || []).find((row) => row.code === `PYG-PKG-${PERIOD}`);
    if (!pkg) {
      const carriers = await capture("/api/v1/transport/carriers?limit=200");
      let carrier = (carriers.payload || []).find((row) => row.code === `PYG-CAR-${PERIOD}`);
      if (!carrier) {
        const createdCarrier = await capture("/api/v1/transport/carriers", { method: "POST", body: { code: `PYG-CAR-${PERIOD}`, legal_name: `Transportadora PYG ${PERIOD}`, tax_id: `PYG-${PERIOD}`, status: "activo", service_levels: ["normal"], operating_zones: ["local"], vehicle_types: ["camion"] } });
        check("carrier_created", createdCarrier.status === 201 && Boolean(createdCarrier.payload.id), { status: createdCarrier.status });
        carrier = createdCarrier.payload;
      }
      const rate = await capture("/api/v1/transport/rate-cards", { method: "POST", body: { code: `PYG-TAR-${PERIOD}-${RUN_ID}`, name: `Tarifa PYG ${PERIOD}`, carrier_id: carrier.id, destination_city: "Bogota", service_level: "normal", vehicle_type: "camion", valid_from: "2026-01-01T00:00:00.000Z", valid_to: "2026-12-31T00:00:00.000Z", currency: "COP", base_rate: 500000, minimum_charge: 600000, price_per_km: 2500, price_per_kg: 25, price_per_m3: 1000, price_per_stop: 50000, fuel_surcharge_pct: 10, tolls_flat: 30000, priority: 10, status: "activa" } });
      check("rate_card_activated", rate.status === 201 && rate.payload.status === "activa", { status: rate.status });

      const created = await capture("/api/v1/transport/settlement-packages", { method: "POST", body: { code: `PYG-PKG-${PERIOD}`, carrier_id: carrier.id, period_id: periodId, type_code: "TRANSPORTADOR", currency: "COP", observation: "Paquete PYG agosto 2026 (9 placas Excel)" } });
      check("package_created_borrador", created.status === 201 && created.payload.status === "borrador", { status: created.status });
      pkg = created.payload;

      const itemsPayload = VEHICLES.map((spec, index) => ({ guide_reference: `PYG-${spec.name}-${PERIOD}`, service: "carga_general", destination_city: "Bogota", vehicle_type: "camion", service_level: "normal", vehicle_plate: spec.plate, service_date: "2026-08-15T00:00:00.000Z", base_type: "unidad", quantity: 1, distance_km: 100 + index, weight_kg: 1000, volume_m3: 8, stop_count: 1 }));
      const items = await capture(`/api/v1/transport/settlement-packages/${pkg.id}/items`, { method: "POST", body: { items: itemsPayload, version: pkg.version } });
      check("items_added_with_plate", items.status === 201 && items.payload.items.length === 9 && items.payload.items.every((item) => item.vehicle_plate), { status: items.status, items: items.payload?.items?.length });
      pkg = items.payload;

      const validated = await capture(`/api/v1/transport/settlement-packages/${pkg.id}/validate`, { method: "POST", body: { version: pkg.version } });
      check("package_validated", validated.status === 200 && validated.payload.status === "validando", { status: validated.status, state: validated.payload?.status });
      const precalc = await capture(`/api/v1/transport/settlement-packages/${pkg.id}/precalculate`, { method: "POST", body: { version: validated.payload.version } });
      check("package_preliquidated", precalc.status === 200 && ["preliquidada", "con_novedad"].includes(precalc.payload.status), { status: precalc.status, state: precalc.payload?.status });
      pkg = precalc.payload;

      let version = pkg.version;
      for (const item of pkg.items) {
        const spec = VEHICLES.find((row) => normalizePlate(row.plate) === normalizePlate(item.vehicle_plate));
        const delta = Math.round((spec.income - Number(item.calculated_amount)) * 100) / 100;
        if (Math.abs(delta) < 0.005) continue;
        const adjusted = await capture(`/api/v1/transport/settlement-packages/${pkg.id}/adjustments`, { method: "POST", body: { item_id: item.id, delta, reason: `Conciliacion a valor aprobado Excel ${spec.name}`, version } });
        if (adjusted.status !== 201) throw new Error(`Ajuste rechazado para ${spec.plate}: ${JSON.stringify(adjusted.payload)}`);
        version = adjusted.payload.version;
      }
      pkg = (await capture(`/api/v1/transport/settlement-packages/${pkg.id}`)).payload;

      const submitted = await capture(`/api/v1/transport/settlement-packages/${pkg.id}/submit`, { method: "POST", body: { version: pkg.version } });
      check("package_submitted", submitted.status === 200 && submitted.payload.status === "en_revision", { status: submitted.status, state: submitted.payload?.status });
      const approved = await capture(`/api/v1/transport/settlement-packages/${pkg.id}/decision`, { method: "POST", body: { decision: "aprobada", comment: "PYG agosto 2026 conforme al Excel corporativo", version: submitted.payload.version } });
      check("package_approved", approved.status === 200 && approved.payload.status === "aprobada" && approved.payload.approved_total > 0, { status: approved.status, state: approved.payload?.status, approved_total: approved.payload?.approved_total });
    } else {
      check("package_created_borrador", true, { reused: pkg.id, status: pkg.status });
    }

    // ---- Canal de gasto: caja menor con centro de costo por placa ----
    const conceptList = await capture("/api/v1/petty-cash/concepts?limit=500");
    const conceptByCode = new Map((conceptList.payload || []).map((row) => [String(row.code).toUpperCase(), row]));
    const neededConcepts = ["COMBUSTIBLE", "PEAJES", "VIATICOS", "MANTENIMIENTO_VEHICULO", "SEGURO_POLIZA", "HONORARIOS", "DOTACION", "OTROS", "GASTO_QA_SINMAPA"];
    for (const code of neededConcepts) {
      if (conceptByCode.has(code)) continue;
      const created = await capture("/api/v1/petty-cash/concepts", { method: "POST", body: { code, name: code === "GASTO_QA_SINMAPA" ? "Gasto QA sin mapear PYG" : `Gasto PYG ${code}`, account_code: "5195", requires_supplier: false, requires_invoice_reference: false, active: true, notes: "Concepto PYG agosto 2026" } });
      if (created.status !== 201) throw new Error(`No fue posible crear el concepto ${code}: ${JSON.stringify(created.payload)}`);
      conceptByCode.set(code, created.payload);
    }
    check("petty_concepts_ready", neededConcepts.every((code) => conceptByCode.has(code)), { count: neededConcepts.length });

    const boxes = await capture("/api/v1/petty-cash/boxes?limit=500");
    let box = (boxes.payload || []).find((row) => row.code === `PYG-BOX-${PERIOD}`);
    if (!box) {
      const created = await capture("/api/v1/petty-cash/boxes", { method: "POST", body: { code: `PYG-BOX-${PERIOD}`, name: `Caja PYG ${PERIOD}`, account_code: "1105", advance_account_code: "1330", custodian_party_id: 9, monthly_limit: 500000000, require_advance: false, block_unliquidated_advance: false, active: true, notes: "Caja de certificacion PYG" } });
      check("petty_box_created", created.status === 201 && created.payload.active === true, { status: created.status, error: created.payload?.message });
      box = created.payload;
    } else {
      check("petty_box_created", true, { reused: box.id });
    }

    // ---- Estructura organizacional: cada placa como centro de costo (exigencia de gastos menores) ----
    const activeUnits = (list) => (Array.isArray(list) ? list.filter((row) => row.active !== false) : []);
    async function loadTree() {
      const res = await capture("/api/v1/accounting/organization-tree");
      if (res.status !== 200) throw new Error(`No fue posible leer el arbol organizacional: ${JSON.stringify(res.payload)}`);
      return res.payload;
    }
    let tree = await loadTree();
    let society = activeUnits(tree.societies)[0];
    if (!society) {
      const created = await capture("/api/v1/accounting/organization-tree", { method: "POST", body: { type: "society", code: "PYG-SOC", name: "Sociedad PYG certificacion" } });
      if (created.status !== 201) throw new Error(`No fue posible crear la sociedad PYG: ${JSON.stringify(created.payload)}`);
      tree = await loadTree();
      society = activeUnits(tree.societies)[0];
    }
    let branch = activeUnits(tree.branches)[0];
    if (!branch) {
      const created = await capture("/api/v1/accounting/organization-tree", { method: "POST", body: { type: "branch", code: "PYG-BR", name: "Sucursal PYG certificacion", society_code: society.code } });
      if (created.status !== 201) throw new Error(`No fue posible crear la sucursal PYG: ${JSON.stringify(created.payload)}`);
      tree = await loadTree();
      branch = activeUnits(tree.branches)[0];
    }
    const existingCostCenters = new Set(activeUnits(tree.cost_centers).map((row) => row.code));
    for (const spec of VEHICLES) {
      if (existingCostCenters.has(spec.plate)) continue;
      const created = await capture("/api/v1/accounting/organization-tree", { method: "POST", body: { type: "cost_center", code: spec.plate, name: `Vehiculo ${spec.name} placa ${spec.plate}`, society_code: society.code, branch_code: branch.code } });
      if (created.status !== 201) throw new Error(`No fue posible crear el centro de costo ${spec.plate}: ${JSON.stringify(created.payload)}`);
    }

    const vouchers = await capture("/api/v1/petty-cash/vouchers?limit=1000");
    const existingGuides = new Set((vouchers.payload || []).map((row) => row.description));
    async function ensureVoucher(description, plate, lines) {
      if (existingGuides.has(description)) return;
      const created = await capture("/api/v1/petty-cash/vouchers", { method: "POST", body: { box_id: box.id, date: PERIOD_END, description, lines: lines.map(([conceptCode, baseAmount], index) => ({ concept_code: conceptCode, description: `${description} · ${conceptCode}`, base_amount: baseAmount, cost_center_code: plate, supplier_party_id: 9, invoice_reference: `PYG-${PERIOD.replace("-", "")}-${index + 1}` })) } });
      if (created.status !== 201) throw new Error(`No fue posible crear el comprobante ${description}: ${JSON.stringify(created.payload)}`);
    }
    await ensureVoucher(`PYG GOLIAT gastos ${PERIOD}`, "ESQ 294", GOLIAT_EXPENSES);
    for (const spec of VEHICLES) {
      if (spec.name === "GOLIAT") continue;
      await ensureVoucher(`PYG ${spec.name} gastos ${PERIOD}`, spec.plate, [["COMBUSTIBLE", Math.round(spec.income * 0.15)], ["PEAJES", 150000]]);
    }
    await ensureVoucher(`PYG TITAN sin mapear ${PERIOD}`, "JYX 457", [["GASTO_QA_SINMAPA", UNMAPPED_AMOUNT]]);
    check("petty_vouchers_created", true, { seeded: "GOLIAT(8 lineas) + 8 placas + sin mapear" });

    // ---- Canal conductor: nomina + PILA + provision en tablas de resultado de TH ----
    const prisma = require(path.join(API, "src/core/prisma"));
    await prisma.runWithTenant(TENANT, async () => {
      await prisma.$executeRaw`DELETE FROM "Payroll" WHERE tenant_id = ${TENANT} AND employee_id = ${driverId} AND period = ${HR_PERIOD_KEY}`;
      await prisma.$executeRaw`INSERT INTO "Payroll" (tenant_id, employee_id, period, days_worked, overtime_hrs, absences, gross, deductions, net, employer_cost, detail, status)
        VALUES (${TENANT}, ${driverId}, ${HR_PERIOD_KEY}, 30, 0, 0, ${DRIVER_PAYROLL_GROSS}, 0, ${DRIVER_PAYROLL_GROSS}, ${DRIVER_PAYROLL_GROSS}, ${JSON.stringify({ fuente: "certificacion PYG agosto 2026" })}::jsonb, 'approved')`;
      await prisma.$executeRaw`DELETE FROM th_aportes_sociales_lineas WHERE tenant_id = ${TENANT} AND employee_id = ${driverId} AND document_id IN (SELECT id FROM th_aportes_sociales_documentos WHERE tenant_id = ${TENANT} AND period_key = ${HR_PERIOD_KEY})`;
      await prisma.$executeRaw`DELETE FROM th_aportes_sociales_documentos WHERE tenant_id = ${TENANT} AND period_key = ${HR_PERIOD_KEY}`;
      await prisma.$executeRaw`INSERT INTO th_aportes_sociales_documentos (tenant_id, period_key, period_type, date_start, date_end, status, total_ibc, total_employee, total_employer, total_payable, source_summary, created_by)
        VALUES (${TENANT}, ${HR_PERIOD_KEY}, 'mes', ${PERIOD_START}::date, ${PERIOD_END}::date, 'approved', ${DRIVER_PAYROLL_GROSS}, ${DRIVER_PILA_EMPLOYEE}, ${DRIVER_PILA_EMPLOYER}, ${DRIVER_PILA_EMPLOYEE + DRIVER_PILA_EMPLOYER}, ${JSON.stringify({ fuente: "certificacion PYG agosto 2026" })}::jsonb, ${login.payload.user?.id || null})`;
      await prisma.$executeRaw`INSERT INTO th_aportes_sociales_lineas (tenant_id, document_id, employee_id, entity_type, entity_id, concept_code, concept_name, ibc, employee_percent, employer_percent, employee_amount, employer_amount, total_amount, metadata)
        SELECT ${TENANT}, d.id, ${driverId}, 'pension', NULL, 'PILA_QA', 'PILA certificacion PYG', ${DRIVER_PAYROLL_GROSS}, 0, 0, ${DRIVER_PILA_EMPLOYEE}, ${DRIVER_PILA_EMPLOYER}, ${DRIVER_PILA_EMPLOYEE + DRIVER_PILA_EMPLOYER}, '{}'::jsonb
        FROM th_aportes_sociales_documentos d WHERE d.tenant_id = ${TENANT} AND d.period_key = ${HR_PERIOD_KEY}`;
      await prisma.$executeRaw`DELETE FROM th_prestaciones_saldos WHERE tenant_id = ${TENANT} AND employee_id = ${driverId} AND concept_code = 'PRIMA' AND period_key = ${HR_PERIOD_KEY}`;
      await prisma.$executeRaw`INSERT INTO th_prestaciones_saldos (tenant_id, employee_id, concept_code, period_key, date_start, date_end, accrued_amount, paid_amount, balance_amount, source_document_type, metadata)
        VALUES (${TENANT}, ${driverId}, 'PRIMA', ${HR_PERIOD_KEY}, ${PERIOD_START}::date, ${PERIOD_END}::date, ${DRIVER_PROVISION}, 0, ${DRIVER_PROVISION}, 'nomina', ${JSON.stringify({ fuente: "certificacion PYG agosto 2026" })}::jsonb)`;
    });
    check("driver_channel_seeded", true, { employee_id: driverId, period: HR_PERIOD_KEY });

    // ---- Reporte: ancla estricta GOLIAT del Excel ----
    const report = await capture(`/api/v1/transport-pyg/report?period=${PERIOD}`);
    check("report_200", report.status === 200 && report.payload.period === PERIOD, { status: report.status });
    const data = report.payload;
    const goliat = data.vehicles.find((row) => normalizePlate(row.plate) === "ESQ294");
    const goliatRow = (code) => goliat.rows.find((row) => row.code === code);
    check("goliat_income_19150000", near(goliat.income_actual, 19150000), { income: goliat.income_actual });
    check("goliat_income_budget_and_cump", goliatRow("INGRESOS").budget === 25000000 && near(goliatRow("INGRESOS").cump, 0.766), { budget: goliatRow("INGRESOS").budget, cump: goliatRow("INGRESOS").cump });
    check("goliat_payroll_channel", near(goliatRow("GASTOS_PERSONAL").actual, DRIVER_PAYROLL_GROSS), { actual: goliatRow("GASTOS_PERSONAL").actual });
    check("goliat_pila_channel", near(goliatRow("SEGURIDAD_SOCIAL").actual, DRIVER_PILA_EMPLOYEE + DRIVER_PILA_EMPLOYER), { actual: goliatRow("SEGURIDAD_SOCIAL").actual });
    check("goliat_provision_channel", near(goliatRow("PROVISION_PRESTACIONES").actual, DRIVER_PROVISION), { actual: goliatRow("PROVISION_PRESTACIONES").actual });
    check("goliat_combustible", near(goliatRow("COMBUSTIBLE").actual, 3323769.1), { actual: goliatRow("COMBUSTIBLE").actual });
    check("goliat_peajes", near(goliatRow("PEAJES").actual, 2013600), { actual: goliatRow("PEAJES").actual });
    check("goliat_total_gastos_22653852_39", near(goliatRow("TOTAL_GASTOS_OPERACIONALES").actual, 22653852.39), { actual: goliatRow("TOTAL_GASTOS_OPERACIONALES").actual });
    check("goliat_utilidad_operacional", near(goliatRow("UTILIDAD_OPERACIONAL").actual, -3503852.39), { actual: goliatRow("UTILIDAD_OPERACIONAL").actual });
    check("goliat_impuesto_430875", near(goliatRow("IMPUESTO_REGIMEN_SIMPLE").actual, 430875), { actual: goliatRow("IMPUESTO_REGIMEN_SIMPLE").actual, tax_percent: data.tax_percent });
    check("goliat_utilidad_neta", near(goliatRow("UTILIDAD_NETA").actual, -3934727.39), { actual: goliatRow("UTILIDAD_NETA").actual });

    // ---- Fila dinamica de gastos sin clasificar (salud del dato) ----
    const titan = data.vehicles.find((row) => normalizePlate(row.plate) === "JYX457");
    const titanUnmapped = titan.rows.find((row) => row.code === "GASTOS_SIN_CLASIFICAR");
    check("unmapped_dynamic_row_present", Boolean(titanUnmapped) && near(titanUnmapped.actual, UNMAPPED_AMOUNT) && titanUnmapped.dynamic === true, { actual: titanUnmapped?.actual });
    check("unmapped_total_in_data_status", near(data.data_status.unmapped_total, UNMAPPED_AMOUNT), { total: data.data_status.unmapped_total });
    const goliatCodes = goliat.rows.map((row) => row.code);
    check("unmapped_row_before_subtotal", goliatCodes.indexOf("TOTAL_GASTOS_OPERACIONALES") > goliatCodes.indexOf("GASTOS_LEGALES"), {});

    // ---- Consolidado corporativo ----
    const expectedCorporate = VEHICLES.reduce((acc, spec) => acc + spec.income, 0);
    check("corporate_income_matches_excel_plates", near(data.corporate.income_actual, expectedCorporate), { corporate: data.corporate.income_actual, expected: Math.round(expectedCorporate * 100) / 100 });
    const corpGastos = data.corporate.rows.find((row) => row.code === "TOTAL_GASTOS_OPERACIONALES");
    check("corporate_expenses_positive", corpGastos.actual > 22653852.39, { actual: corpGastos.actual });
    const corpNeta = data.corporate.rows.find((row) => row.code === "UTILIDAD_NETA");
    // El % neto corporativo es utilidad_neta / ingreso corporativo (positivo: las otras 8
    // placas solo tienen combustible+peajes, no el canal completo de GOLIAT).
    check("corporate_net_margin_pct", typeof corpNeta.pct === "number" && near(corpNeta.pct, corpNeta.actual / data.corporate.income_actual), { pct: corpNeta.pct, expected: Math.round((corpNeta.actual / data.corporate.income_actual) * 10000) / 10000 });

    // ---- Periodo sin datos: estructura intacta, sin 500 ----
    const empty = await capture("/api/v1/transport-pyg/report?period=2024-01");
    check("empty_period_no_crash", empty.status === 200 && empty.payload.corporate.income_actual === 0 && empty.payload.data_status.vehicles_with_income === 0, { status: empty.status, income: empty.payload?.corporate?.income_actual });

    // ---- Configuracion y mapeo: roundtrip valido ----
    const configSaved = await capture("/api/v1/transport-pyg/config", { method: "PUT", body: { tax_percent: 2.25 } });
    check("config_roundtrip", configSaved.status === 200 && Number(configSaved.payload.tax_percent) === 2.25, { status: configSaved.status, tax: configSaved.payload?.tax_percent });
    const mappingRead = await capture("/api/v1/transport-pyg/mapping");
    check("mapping_default_seeded", mappingRead.status === 200 && mappingRead.payload.rows.length >= 10 && mappingRead.payload.rows.some((row) => row.source_code === "COMBUSTIBLE" && row.pyg_concept_code === "COMBUSTIBLE"), { rows: mappingRead.payload?.rows?.length });

    // ---- Des-mapeo desde la UI: fila vacia desactiva el mapping (el concepto vuelve a "sin clasificar") ----
    const unmapSave = await capture("/api/v1/transport-pyg/mapping", { method: "PUT", body: { rows: [{ source_type: "petty_cash_concept", source_code: "HONORARIOS", pyg_concept_code: "" }] } });
    check("mapping_empty_row_deactivates", unmapSave.status === 200 && unmapSave.payload.ok === true, { status: unmapSave.status, code: unmapSave.payload?.code });
    const mappingUnmapped = await capture("/api/v1/transport-pyg/mapping");
    const honorariosRow = (mappingUnmapped.payload.rows || []).find((row) => row.source_code === "HONORARIOS");
    check("mapping_row_inactive_after_empty", Boolean(honorariosRow) && honorariosRow.active === false && honorariosRow.pyg_concept_code === "", { row: honorariosRow });
    const remapSave = await capture("/api/v1/transport-pyg/mapping", { method: "PUT", body: { rows: [{ source_type: "petty_cash_concept", source_code: "HONORARIOS", pyg_concept_code: "HONORARIOS_CONTABLES_SST" }] } });
    const mappingRemapped = await capture("/api/v1/transport-pyg/mapping");
    const honorariosRemapped = (mappingRemapped.payload.rows || []).find((row) => row.source_code === "HONORARIOS");
    check("mapping_remap_reactivates", remapSave.status === 200 && Boolean(honorariosRemapped) && honorariosRemapped.active === true && honorariosRemapped.pyg_concept_code === "HONORARIOS_CONTABLES_SST", { status: remapSave.status, row: honorariosRemapped });

    // ---- Auditoria funcional de presupuesto (AuditLog) ----
    const auditRows = await prisma.runWithTenant(TENANT, () => prisma.$queryRaw`SELECT action, count(*)::int AS n FROM "AuditLog" WHERE tenant_id = ${TENANT} AND action LIKE 'transport.pyg.%' GROUP BY action ORDER BY action`);
    check("functional_audit_written", auditRows.length >= 2 && auditRows.some((row) => row.action === "transport.pyg.budgets.updated") && auditRows.some((row) => row.action === "transport.pyg.config.updated"), { actions: auditRows.map((row) => row.action) });

    // ---- Suites unitarias versionadas ----
    const unit = spawnSync(process.execPath, ["--test", "test/transport-pyg-report.test.js"], { cwd: API, encoding: "utf8" });
    const unitOut = `${unit.stdout || ""}${unit.stderr || ""}`;
    check("unit_suite_pass", unit.status === 0 && /# pass 9\b/.test(unitOut) && /# fail 0\b/.test(unitOut), { status: unit.status, pass: (unitOut.match(/# pass (\d+)/) || [])[1], fail: (unitOut.match(/# fail (\d+)/) || [])[1] });

    // ---- Aserciones a nivel de codigo (estructura versionada) ----
    const engineSrc = fs.readFileSync(path.join(API, "src/modules/transport-pyg/engine.js"), "utf8");
    check("engine_contract", /function buildReport/.test(engineSrc) && /sumCents/.test(engineSrc) && /UNMAPPED_CONCEPT/.test(engineSrc), {});
    const serviceSrc = fs.readFileSync(path.join(API, "src/modules/transport-pyg/service.js"), "utf8");
    check("service_guards_tenant_and_lock", /runWithTenant/.test(serviceSrc) && /pg_advisory_xact_lock/.test(serviceSrc) && /auditLog\.create/.test(serviceSrc) && /split_part\(period/.test(serviceSrc), {});
    const routesSrc = fs.readFileSync(path.join(API, "src/modules/transport-pyg/routes.js"), "utf8");
    const guardedRoutes = (routesSrc.match(/preHandler: (view|manage)/g) || []).length;
    check("routes_guarded_by_rbac", /requirePermission\("accounting", "read"\)/.test(routesSrc) && /requirePermission\("accounting", "write"\)/.test(routesSrc) && guardedRoutes >= 9, { guards: guardedRoutes });
    const schemaSrc = fs.readFileSync(path.join(API, "prisma/schema.prisma"), "utf8");
    check("schema_has_pyg_models", ["TransportPygConcept", "TransportPygBudget", "TransportPygSourceMap", "TransportPygConfig"].every((model) => schemaSrc.includes(`model ${model} `)), {});
    check("migration_file_present", fs.existsSync(path.join(API, "prisma/migrations/20261013120000_transport_pyg/migration.sql")), {});
    check("web_page_present", fs.existsSync(path.join(ROOT, "apps/web/app/dashboard/contabilidad/pyg/page.tsx")), {});

    result.status = "passed";
    result.checks_passed = result.checks.filter((c) => c.ok).length;
    result.checks_total = result.checks.length;
  } catch (error) {
    result.status = "failed";
    result.error = error.message;
    console.error("[cert] ERROR:", error.message);
  } finally {
    if (app) { try { await app.close(); } catch { /* noop */ } }
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    result.finished_at = new Date().toISOString();
    fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
    console.error(`[cert] evidencia: ${path.relative(ROOT, OUTPUT)} status=${result.status} (${result.checks.filter((c) => c.ok).length}/${result.checks.length})`);
    process.exit(result.status === "passed" ? 0 : 1);
  }
}

main();
