// Certificacion REMOTA del reporte PYG por Vehiculo (transport-pyg) en DEVELOP (QA) con el
// USUARIO ADMIN REAL del ambiente.
//
// Inicia sesion como el administrador real de QA via Supabase Auth (password grant) y consume
// la API desplegada en Railway (rama develop) con el Bearer de Supabase. Puebla los tres canales
// reales del reporte con datos visibles en la herramienta:
//   - Ingresos: flujo completo de liquidacion por transporte (periodo -> paquete -> items con
//     placa -> validate -> precalculate -> adjustments -> submit -> decision aprobada).
//   - Gastos de caja menor: conceptos, caja, arbol organizacional con cada placa como centro de
//     costo y comprobantes con lineas por placa (incluida una linea sin mapear PYG para la fila
//     dinamica "GASTOS SIN CLASIFICAR").
//   - Canal conductor: nomina (liquidacion), PILA (aportes sociales) y provision de prestaciones
//     sociales de Talento Humano, imputados al vehiculo por su conductor autorizado.
// Ademas carga presupuestos por vehiculo/concepto, valida la configuracion del impuesto de
// regimen simple y verifica el consolidado corporativo, el cumplimiento y la salud del dato.
//
// Todo es idempotente por codigo/descripcion: puede reejecutarse sobre el mismo tenant.
// No toca produccion: aborta si la URL de API no es el host HTTPS de QA en Railway. La
// contrasena del administrador se toma de QA_ADMIN_PASSWORD (variable de entorno); nunca se
// escribe en el repo.

const fs = require("node:fs");
const path = require("node:path");

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
require("../load-env")(path.resolve(String(args["env-file"] || "config/qa.env")));

const API_URL = String(args["api-url"] || process.env.QA_API_URL || "https://apexos-api-qa-production.up.railway.app").replace(/\/$/, "");
if (!/^https:\/\/apexos-api-qa-production\.up\.railway\.app$/.test(API_URL)) {
  console.error("BLOQUEADO: la certificacion remota solo corre contra la API de QA en Railway (HTTPS).");
  process.exit(1);
}
const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const ANON_KEY = String(process.env.SUPABASE_ANON_KEY || "");
const ADMIN_EMAIL = String(process.env.QA_ADMIN_EMAIL || "admin@apexos.qa");
const ADMIN_PASSWORD = String(process.env.QA_ADMIN_PASSWORD || "");
if (!SUPABASE_URL || !ANON_KEY) {
  console.error("BLOQUEADO: se requiere SUPABASE_URL y SUPABASE_ANON_KEY (config/qa.env).");
  process.exit(1);
}
if (!ADMIN_PASSWORD) {
  console.error("BLOQUEADO: define QA_ADMIN_PASSWORD (contrasena del administrador real de QA) antes de ejecutar.");
  process.exit(1);
}

const EXPECTED_COMMIT = String(args["expected-commit"] || process.env.EXPECTED_COMMIT || "");
const COMPANY_ID = String(args["company-id"] || "c56bc5df-c807-4deb-83f8-fbb4751be613"); // Cliente Piloto QA
const REQUEST_TIMEOUT_MS = Number(args["request-timeout-ms"] || 30000);
const OUTPUT = path.resolve(String(args.output || "docs/qa/evidence/transport-pyg-20261013/develop-admin-certification.json"));
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);

const PERIOD = "2026-10";
const PERIOD_START = "2026-10-01";
const PERIOD_END = "2026-10-31";
const HR_PERIOD_TYPE = "mes";
const UNMAPPED_AMOUNT = 120000;
const CUSTODIAN_PARTY_ID = Number(args["custodian-party-id"] || 7); // Proveedor CERT-QA

// Gastos de caja menor del vehiculo ancla (canal clasificado + fila sin clasificar).
const ANCHOR_EXPENSES = [
  ["COMBUSTIBLE", 3323769.1],
  ["PEAJES", 2013600],
  ["VIATICOS", 755000],
  ["GASTO_QA_SINMAPA", UNMAPPED_AMOUNT]
];
const ANCHOR_EXPENSE_BUDGETS = [
  ["GASTOS_PERSONAL", 8085596],
  ["PROVISION_PRESTACIONES", 1214848],
  ["SEGURIDAD_SOCIAL", 830750],
  ["COMBUSTIBLE", 3386582],
  ["VIATICOS", 986456],
  ["PEAJES", 1011909]
];

const result = {
  change_id: "transport-pyg-20261013",
  certification: "transport-pyg-develop-admin",
  environment: "QA",
  target_environment: "develop",
  api_url: API_URL,
  supabase_url: SUPABASE_URL,
  api_commit: "unknown",
  expected_commit: EXPECTED_COMMIT ? EXPECTED_COMMIT.slice(0, 12) : "unset",
  generated_at: new Date().toISOString(),
  admin: { email: ADMIN_EMAIL, auth: "supabase-password-grant" },
  tenant: { company_id: COMPANY_ID, name: "Cliente Piloto QA" },
  scope: {
    capability: "Reporte PYG por vehiculo (centro de costo = placa) en develop con el administrador real de QA: catalogo corporativo de 23 lineas, presupuesto por vehiculo/concepto con cumplimiento, ingresos de liquidaciones aprobadas, gastos de caja menor por placa con fila dinamica sin clasificar, canal conductor (nomina/PILA/provisiones de TH), impuesto de regimen simple configurable y consolidado corporativo, poblando datos reales visibles en la herramienta.",
    proven_by_live_execution: [
      "Sesion del administrador real de QA via Supabase Auth consumiendo la API con el Bearer de Supabase",
      "Flujo completo de liquidacion por transporte (items con placa -> validate -> precalculate -> adjustments -> submit -> decision aprobada) alimenta el canal de ingresos por placa",
      "Comprobantes de caja menor con centro de costo por placa alimentan los canales de gasto clasificados y la fila dinamica de gastos sin clasificar",
      "Liquidacion de nomina, aportes sociales (PILA) y provision de prestaciones sociales de TH imputados al vehiculo por su conductor autorizado",
      "Presupuestos por vehiculo/concepto, configuracion del impuesto de regimen simple y consolidado corporativo con cumplimiento",
      "Los datos quedan activos en el tenant piloto QA para inspeccion en la interfaz"
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

async function supabaseLogin() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  const payload = await res.json().catch(() => ({}));
  return { status: res.status, payload };
}

function normalizePlate(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

async function main() {
  try {
    const health = await capture("/health", { auth: false });
    result.api_commit = health.payload?.commit || "unknown";
    check("develop_health", health.status === 200 && health.payload?.status === "OK", { status: health.status, commit: result.api_commit });
    if (EXPECTED_COMMIT) check("develop_commit_matches_candidate", result.api_commit === EXPECTED_COMMIT.slice(0, 12), { commit: result.api_commit, expected: EXPECTED_COMMIT.slice(0, 12) });

    const anon = await capture(`/api/v1/transport-pyg/report?period=${PERIOD}`, { auth: false });
    check("anonymous_blocked_401", anon.status === 401, { status: anon.status });

    const login = await supabaseLogin();
    check("admin_supabase_login", login.status === 200 && Boolean(login.payload?.access_token), { status: login.status, error: login.payload?.error_description || login.payload?.msg });
    TOKEN = login.payload.access_token;

    const me = await capture("/api/v1/auth/me");
    check("admin_tenant_resolved", me.status === 200 && me.payload?.user?.email === ADMIN_EMAIL && me.payload?.tenant?.id === COMPANY_ID, { status: me.status, tenant: me.payload?.tenant?.id });

    // ---- Catalogo PYG (siembra idempotente al leer) ----
    const concepts = await capture("/api/v1/transport-pyg/concepts");
    check("catalog_seeded_23_concepts", concepts.status === 200 && concepts.payload.length === 23 && concepts.payload[0].code === "INGRESOS" && concepts.payload[22].code === "UTILIDAD_NETA", { status: concepts.status, count: concepts.payload?.length });

    // ---- Flota real del tenant piloto QA ----
    const vehiclesRes = await capture("/api/v1/transport/vehicles?limit=500");
    const fleet = (vehiclesRes.payload || []).filter((row) => row.plate);
    check("fleet_available", vehiclesRes.status === 200 && fleet.length >= 3, { status: vehiclesRes.status, vehicles: fleet.length });

    // Empleados de TH: se necesita uno con devengado > 0 para el canal conductor.
    const employeesRes = await capture("/api/v1/hr/employees?limit=500");
    const employeeRows = employeesRes.payload || [];
    check("employees_available", employeesRes.status === 200 && employeeRows.length >= 1, { status: employeesRes.status, employees: employeeRows.length });

    // ---- Canal conductor: nomina del periodo (preview para elegir conductor con devengado > 0) ----
    const payrollPreview = await capture("/api/v1/hr/payroll/preview", { method: "POST", body: { fecha_inicio: PERIOD_START, fecha_fin: PERIOD_END, period_type: HR_PERIOD_TYPE } });
    check("payroll_preview_runs", payrollPreview.status === 200 && Array.isArray(payrollPreview.payload?.documents), { status: payrollPreview.status, error: payrollPreview.payload?.message });
    const previewRows = payrollPreview.payload.documents || [];
    const withGross = previewRows.filter((row) => Number(row.gross) > 0).sort((a, b) => Number(b.gross) - Number(a.gross));
    check("payroll_preview_has_gross", withGross.length >= 1, { with_gross: withGross.length, employees: previewRows.length });

    // Persistir la nomina antes de elegir conductor: la cobertura PILA exige afiliaciones
    // activas (no todo empleado con devengado tiene lineas de aportes), asi que el conductor
    // se elige entre los empleados que cubren los tres canales (nomina + PILA + provision).
    const liquidation = await capture("/api/v1/hr/payroll/liquidations", { method: "POST", body: { fecha_inicio: PERIOD_START, fecha_fin: PERIOD_END, period_type: HR_PERIOD_TYPE, recalculate: true } });
    check("payroll_liquidated", liquidation.status === 200 && liquidation.payload.documents >= 1, { status: liquidation.status, documents: liquidation.payload?.documents, error: liquidation.payload?.message });

    const pilaPreviewForDriver = await capture("/api/v1/hr/payroll/social-contributions/preview", { method: "POST", body: { fecha_inicio: PERIOD_START, fecha_fin: PERIOD_END, period_type: HR_PERIOD_TYPE } });
    check("pila_preview_runs", pilaPreviewForDriver.status === 200 && Array.isArray(pilaPreviewForDriver.payload?.document?.lines), { status: pilaPreviewForDriver.status, error: pilaPreviewForDriver.payload?.message });
    const pilaLinesAll = pilaPreviewForDriver.payload.document.lines || [];
    const pilaCoveredIds = new Set(pilaLinesAll.map((line) => Number(line.employee_id)));
    check("pila_preview_covers_employees", pilaLinesAll.length > 0 && pilaCoveredIds.size >= 1, { lines: pilaLinesAll.length, covered: pilaCoveredIds.size });
    const driverRow = withGross.find((row) => pilaCoveredIds.has(Number(row.employee_id)));
    check("driver_candidate_with_pila", Boolean(driverRow), { covered: pilaCoveredIds.size });
    const driverEmployeeId = driverRow.employee_id;
    const driverGross = Number(driverRow.gross);
    const driverPila = pilaLinesAll.filter((line) => Number(line.employee_id) === Number(driverEmployeeId)).reduce((acc, line) => acc + Number(line.employee_amount || 0) + Number(line.employer_amount || 0), 0);
    check("driver_pila_computed", driverPila > 0, { driver_pila: Math.round(driverPila * 100) / 100 });

    // Vehiculo ancla: el primero de la flota; se (re)enlaza siempre al conductor elegido para
    // mantener un unico vehiculo con canal conductor por ejecucion.
    const anchorVehicle = fleet[0];
    const anchorKey = normalizePlate(anchorVehicle.plate);
    if (!anchorVehicle.authorized_driver_id || Number(anchorVehicle.authorized_driver_id) !== Number(driverEmployeeId)) {
      const linked = await capture(`/api/v1/transport/vehicles/${anchorVehicle.id}`, { method: "PUT", body: { plate: anchorVehicle.plate, type: anchorVehicle.type || "camion", brand: anchorVehicle.brand || "QA", line: anchorVehicle.line || "PYG", ownership_type: anchorVehicle.ownership_type || "propio", base_site: anchorVehicle.base_site || "QA", authorized_driver_id: driverEmployeeId } });
      check("anchor_vehicle_driver_linked", linked.status === 200 && Number(linked.payload?.authorized_driver_id) === Number(driverEmployeeId), { status: linked.status, error: linked.payload?.message });
      anchorVehicle.authorized_driver_id = driverEmployeeId;
    } else {
      check("anchor_vehicle_driver_linked", true, { reused: driverEmployeeId });
    }

    // ---- Presupuestos por vehiculo/concepto ----
    const incomeTargets = {};
    const budgetRows = [];
    fleet.forEach((row, index) => {
      incomeTargets[normalizePlate(row.plate)] = 12000000 + index * 2500000;
      budgetRows.push({ vehicle_id: row.id, concept_code: "INGRESOS", amount: 20000000 + index * 1000000 });
    });
    for (const [conceptCode, amount] of ANCHOR_EXPENSE_BUDGETS) budgetRows.push({ vehicle_id: anchorVehicle.id, concept_code: conceptCode, amount });
    const budgetsSaved = await capture("/api/v1/transport-pyg/budgets", { method: "PUT", body: { period: PERIOD, rows: budgetRows } });
    check("budgets_saved", budgetsSaved.status === 200 && budgetsSaved.payload.upserted === budgetRows.length, { status: budgetsSaved.status, upserted: budgetsSaved.payload?.upserted, expected: budgetRows.length });

    // ---- Canal de ingresos: periodo + paquete de liquidacion aprobado (maquina de estados reanudable) ----
    const periods = await capture("/api/v1/transport/settlement-periods?limit=200");
    let periodRow = (periods.payload || []).find((row) => row.code === `PYG-SEM-${PERIOD}`);
    if (!periodRow) {
      const created = await capture("/api/v1/transport/settlement-periods", { method: "POST", body: { code: `PYG-SEM-${PERIOD}`, name: `PYG ${PERIOD}`, start_date: PERIOD_START, end_date: PERIOD_END } });
      check("settlement_period_ready", created.status === 201 && created.payload.status === "abierto", { status: created.status });
      periodRow = created.payload;
    } else {
      check("settlement_period_ready", true, { reused: periodRow.id, status: periodRow.status });
    }

    const packages = await capture("/api/v1/transport/settlement-packages?limit=200");
    let pkg = (packages.payload || []).find((row) => row.code === `PYG-PKG-${PERIOD}`);
    if (pkg && pkg.status === "aprobada") {
      check("package_approved", true, { reused: pkg.id, approved_total: pkg.approved_total });
    } else {
      const carriers = await capture("/api/v1/transport/carriers?limit=200");
      let carrier = (carriers.payload || []).find((row) => row.code === `PYG-CAR-${PERIOD}`);
      if (!carrier) {
        const createdCarrier = await capture("/api/v1/transport/carriers", { method: "POST", body: { code: `PYG-CAR-${PERIOD}`, legal_name: `Transportadora PYG ${PERIOD}`, tax_id: `PYG-${PERIOD}`, status: "activo", service_levels: ["normal"], operating_zones: ["local"], vehicle_types: ["camion"] } });
        check("carrier_ready", createdCarrier.status === 201 && Boolean(createdCarrier.payload.id), { status: createdCarrier.status });
        carrier = createdCarrier.payload;
      }
      const rate = await capture("/api/v1/transport/rate-cards", { method: "POST", body: { code: `PYG-TAR-${PERIOD}-${RUN_ID}`, name: `Tarifa PYG ${PERIOD}`, carrier_id: carrier.id, destination_city: "Bogota", service_level: "normal", vehicle_type: "camion", valid_from: "2026-01-01T00:00:00.000Z", valid_to: "2026-12-31T00:00:00.000Z", currency: "COP", base_rate: 500000, minimum_charge: 600000, price_per_km: 2500, price_per_kg: 25, price_per_m3: 1000, price_per_stop: 50000, fuel_surcharge_pct: 10, tolls_flat: 30000, priority: 10, status: "activa" } });
      check("rate_card_activated", rate.status === 201 && rate.payload.status === "activa", { status: rate.status });

      if (!pkg) {
        const created = await capture("/api/v1/transport/settlement-packages", { method: "POST", body: { code: `PYG-PKG-${PERIOD}`, carrier_id: carrier.id, period_id: periodRow.id, type_code: "TRANSPORTADOR", currency: "COP", observation: `Paquete PYG ${PERIOD} (certificacion admin)` } });
        check("package_created_borrador", created.status === 201 && created.payload.status === "borrador", { status: created.status });
        pkg = created.payload;
      }
      if (pkg.status === "borrador") {
        const itemsPayload = fleet.map((row, index) => ({ guide_reference: `PYG-${normalizePlate(row.plate)}-${PERIOD}`, service: "carga_general", destination_city: "Bogota", vehicle_type: "camion", service_level: "normal", vehicle_plate: row.plate, service_date: `${PERIOD.slice(0, 7)}-15T00:00:00.000Z`, base_type: "unidad", quantity: 1, distance_km: 100 + index, weight_kg: 1000, volume_m3: 8, stop_count: 1 }));
        const items = await capture(`/api/v1/transport/settlement-packages/${pkg.id}/items`, { method: "POST", body: { items: itemsPayload, version: pkg.version } });
        check("items_added_with_plate", items.status === 201 && items.payload.items.length === fleet.length && items.payload.items.every((item) => item.vehicle_plate), { status: items.status, items: items.payload?.items?.length });
        pkg = items.payload;
      }
      if (pkg.status === "borrador") {
        const validated = await capture(`/api/v1/transport/settlement-packages/${pkg.id}/validate`, { method: "POST", body: { version: pkg.version } });
        check("package_validated", validated.status === 200 && validated.payload.status === "validando", { status: validated.status, state: validated.payload?.status });
        pkg = validated.payload;
      }
      if (pkg.status === "validando") {
        const precalc = await capture(`/api/v1/transport/settlement-packages/${pkg.id}/precalculate`, { method: "POST", body: { version: pkg.version } });
        check("package_preliquidated", precalc.status === 200 && ["preliquidada", "con_novedad"].includes(precalc.payload.status), { status: precalc.status, state: precalc.payload?.status });
        pkg = precalc.payload;
      }
      if (["preliquidada", "con_novedad"].includes(pkg.status)) {
        let version = pkg.version;
        for (const item of pkg.items || []) {
          const target = incomeTargets[normalizePlate(item.vehicle_plate)];
          if (target == null) continue;
          const delta = Math.round((target - Number(item.calculated_amount)) * 100) / 100;
          if (Math.abs(delta) < 0.005) continue;
          const adjusted = await capture(`/api/v1/transport/settlement-packages/${pkg.id}/adjustments`, { method: "POST", body: { item_id: item.id, delta, reason: `Conciliacion PYG ${PERIOD}`, version } });
          if (adjusted.status !== 201) throw new Error(`Ajuste rechazado para ${item.vehicle_plate}: ${JSON.stringify(adjusted.payload)}`);
          version = adjusted.payload.version;
        }
        pkg = (await capture(`/api/v1/transport/settlement-packages/${pkg.id}`)).payload;
      }
      if (pkg.status === "preliquidada" || pkg.status === "con_novedad") {
        const submitted = await capture(`/api/v1/transport/settlement-packages/${pkg.id}/submit`, { method: "POST", body: { version: pkg.version } });
        check("package_submitted", submitted.status === 200 && submitted.payload.status === "en_revision", { status: submitted.status, state: submitted.payload?.status });
        pkg = submitted.payload;
      }
      if (pkg.status === "en_revision") {
        const approved = await capture(`/api/v1/transport/settlement-packages/${pkg.id}/decision`, { method: "POST", body: { decision: "aprobada", comment: `PYG ${PERIOD} conforme`, version: pkg.version } });
        check("package_approved", approved.status === 200 && approved.payload.status === "aprobada" && approved.payload.approved_total > 0, { status: approved.status, state: approved.payload?.status, approved_total: approved.payload?.approved_total });
        pkg = approved.payload;
      }
      if (pkg.status !== "aprobada") throw new Error(`Paquete PYG en estado no recuperable: ${pkg.status}`);
    }

    // ---- Canal de gasto: caja menor con centro de costo por placa ----
    const conceptList = await capture("/api/v1/petty-cash/concepts?limit=500");
    const conceptByCode = new Map((conceptList.payload || []).map((row) => [String(row.code).toUpperCase(), row]));
    const neededConcepts = ["COMBUSTIBLE", "PEAJES", "VIATICOS", "GASTO_QA_SINMAPA"];
    for (const code of neededConcepts) {
      if (conceptByCode.has(code)) continue;
      const created = await capture("/api/v1/petty-cash/concepts", { method: "POST", body: { code, name: code === "GASTO_QA_SINMAPA" ? "Gasto QA sin mapear PYG" : `Gasto PYG ${code}`, account_code: "5195", requires_supplier: false, requires_invoice_reference: false, active: true, notes: `Concepto PYG ${PERIOD}` } });
      if (created.status !== 201) throw new Error(`No fue posible crear el concepto ${code}: ${JSON.stringify(created.payload)}`);
      conceptByCode.set(code, created.payload);
    }
    check("petty_concepts_ready", neededConcepts.every((code) => conceptByCode.has(code)), { count: neededConcepts.length });

    const boxes = await capture("/api/v1/petty-cash/boxes?limit=500");
    let box = (boxes.payload || []).find((row) => row.code === `PYG-BOX-${PERIOD}`);
    if (!box) {
      const created = await capture("/api/v1/petty-cash/boxes", { method: "POST", body: { code: `PYG-BOX-${PERIOD}`, name: `Caja PYG ${PERIOD}`, account_code: "1105", advance_account_code: "1330", custodian_party_id: CUSTODIAN_PARTY_ID, monthly_limit: 500000000, require_advance: false, block_unliquidated_advance: false, active: true, notes: "Caja de certificacion PYG" } });
      check("petty_box_ready", created.status === 201 && created.payload.active === true, { status: created.status, error: created.payload?.message });
      box = created.payload;
    } else {
      check("petty_box_ready", true, { reused: box.id });
    }

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
    const existingCostCenters = new Set(activeUnits(tree.cost_centers).map((row) => normalizePlate(row.code)));
    for (const row of fleet) {
      if (existingCostCenters.has(normalizePlate(row.plate))) continue;
      const created = await capture("/api/v1/accounting/organization-tree", { method: "POST", body: { type: "cost_center", code: row.plate, name: `Vehiculo placa ${row.plate}`, society_code: society.code, branch_code: branch.code } });
      if (created.status !== 201) throw new Error(`No fue posible crear el centro de costo ${row.plate}: ${JSON.stringify(created.payload)}`);
    }
    check("cost_centers_per_plate_ready", true, { plates: fleet.length });

    const vouchers = await capture("/api/v1/petty-cash/vouchers?limit=1000");
    const existingDescriptions = new Set((vouchers.payload || []).map((row) => row.description));
    async function ensureVoucher(description, plate, lines) {
      if (existingDescriptions.has(description)) return;
      const created = await capture("/api/v1/petty-cash/vouchers", { method: "POST", body: { box_id: box.id, date: PERIOD_END, description, lines: lines.map(([conceptCode, baseAmount], index) => ({ concept_code: conceptCode, description: `${description} · ${conceptCode}`, base_amount: baseAmount, cost_center_code: plate, supplier_party_id: CUSTODIAN_PARTY_ID, invoice_reference: `PYG-${PERIOD.replace("-", "")}-${index + 1}` })) } });
      if (created.status !== 201) throw new Error(`No fue posible crear el comprobante ${description}: ${JSON.stringify(created.payload)}`);
    }
    await ensureVoucher(`PYG ${anchorKey} gastos ${PERIOD}`, anchorVehicle.plate, ANCHOR_EXPENSES);
    for (const row of fleet) {
      if (normalizePlate(row.plate) === anchorKey) continue;
      await ensureVoucher(`PYG ${normalizePlate(row.plate)} gastos ${PERIOD}`, row.plate, [["COMBUSTIBLE", 900000], ["PEAJES", 150000]]);
    }
    check("petty_vouchers_ready", true, { note: "ancla(4 lineas, 1 sin mapear) + resto de la flota" });

    // ---- Canal conductor: persistir PILA y provision de prestaciones ----
    const pila = await capture("/api/v1/hr/payroll/social-contributions", { method: "POST", body: { fecha_inicio: PERIOD_START, fecha_fin: PERIOD_END, period_type: HR_PERIOD_TYPE, recalculate: true } });
    check("pila_persisted", pila.status === 200 && pila.payload.lines > 0, { status: pila.status, lines: pila.payload?.lines, error: pila.payload?.message });

    const provision = await capture("/api/v1/talento-humano/provisiones/prestaciones-sociales/documentos", { method: "POST", body: { fecha_inicio: PERIOD_START, fecha_fin: PERIOD_END, period_type: HR_PERIOD_TYPE, recalculate: true } });
    const provisionLines = provision.payload?.lines || [];
    const driverProvision = provisionLines.filter((line) => Number(line.employee_id) === Number(driverEmployeeId)).reduce((acc, line) => acc + Number(line.amount || 0), 0);
    check("provision_persisted", provision.status === 200 && provisionLines.length > 0 && driverProvision > 0, { status: provision.status, lines: provisionLines.length, driver_provision: Math.round(driverProvision * 100) / 100, error: provision.payload?.message });

    // ---- Configuracion del impuesto y mapeo de conceptos ----
    const configSaved = await capture("/api/v1/transport-pyg/config", { method: "PUT", body: { tax_percent: 2.25 } });
    check("config_roundtrip", configSaved.status === 200 && Number(configSaved.payload.tax_percent) === 2.25, { status: configSaved.status, tax: configSaved.payload?.tax_percent });
    const mappingRead = await capture("/api/v1/transport-pyg/mapping");
    check("mapping_default_seeded", mappingRead.status === 200 && mappingRead.payload.rows.length >= 10 && mappingRead.payload.rows.some((row) => row.source_code === "COMBUSTIBLE" && row.pyg_concept_code === "COMBUSTIBLE"), { rows: mappingRead.payload?.rows?.length });

    // ---- Reporte del periodo poblado ----
    const report = await capture(`/api/v1/transport-pyg/report?period=${PERIOD}`);
    check("report_200", report.status === 200 && report.payload.period === PERIOD, { status: report.status });
    const data = report.payload;
    const anchor = data.vehicles.find((row) => normalizePlate(row.plate) === anchorKey);
    check("anchor_vehicle_in_report", Boolean(anchor), { plate: anchorKey, vehicles: data.vehicles.length });
    const anchorRow = (code) => anchor.rows.find((row) => row.code === code);

    const expectedCorporateIncome = Object.values(incomeTargets).reduce((acc, value) => acc + value, 0);
    check("anchor_income_matches_target", near(anchor.income_actual, incomeTargets[anchorKey]), { income: anchor.income_actual, target: incomeTargets[anchorKey] });
    check("anchor_income_budget_cump", anchorRow("INGRESOS").budget === 20000000 + fleet.indexOf(anchorVehicle) * 1000000 && near(anchorRow("INGRESOS").cump, anchor.income_actual / anchorRow("INGRESOS").budget), { budget: anchorRow("INGRESOS").budget, cump: anchorRow("INGRESOS").cump });
    check("anchor_payroll_channel", near(anchorRow("GASTOS_PERSONAL").actual, driverGross), { actual: anchorRow("GASTOS_PERSONAL").actual, expected: driverGross });
    check("anchor_pila_channel", near(anchorRow("SEGURIDAD_SOCIAL").actual, driverPila), { actual: anchorRow("SEGURIDAD_SOCIAL").actual, expected: Math.round(driverPila * 100) / 100 });
    check("anchor_provision_channel", near(anchorRow("PROVISION_PRESTACIONES").actual, driverProvision), { actual: anchorRow("PROVISION_PRESTACIONES").actual, expected: Math.round(driverProvision * 100) / 100 });
    check("anchor_combustible", near(anchorRow("COMBUSTIBLE").actual, 3323769.1), { actual: anchorRow("COMBUSTIBLE").actual });
    check("anchor_peajes", near(anchorRow("PEAJES").actual, 2013600), { actual: anchorRow("PEAJES").actual });
    check("anchor_viaticos", near(anchorRow("VIATICOS").actual, 755000), { actual: anchorRow("VIATICOS").actual });

    const anchorGastos = anchorRow("TOTAL_GASTOS_OPERACIONALES").actual;
    const expectedGastos = driverGross + driverPila + driverProvision + 3323769.1 + 2013600 + 755000 + UNMAPPED_AMOUNT;
    check("anchor_total_gastos", near(anchorGastos, expectedGastos), { actual: anchorGastos, expected: Math.round(expectedGastos * 100) / 100 });
    const anchorImpuesto = anchorRow("IMPUESTO_REGIMEN_SIMPLE").actual;
    check("anchor_impuesto_regimen_simple", near(anchorImpuesto, incomeTargets[anchorKey] * 0.0225), { actual: anchorImpuesto, expected: Math.round(incomeTargets[anchorKey] * 0.0225 * 100) / 100, tax_percent: data.tax_percent });
    const anchorUtilidadNeta = anchorRow("UTILIDAD_NETA").actual;
    check("anchor_utilidad_neta", near(anchorUtilidadNeta, anchor.income_actual - anchorGastos - anchorImpuesto), { actual: anchorUtilidadNeta, expected: Math.round((anchor.income_actual - anchorGastos - anchorImpuesto) * 100) / 100 });

    const anchorUnmapped = anchor.rows.find((row) => row.code === "GASTOS_SIN_CLASIFICAR");
    check("unmapped_dynamic_row_present", Boolean(anchorUnmapped) && near(anchorUnmapped.actual, UNMAPPED_AMOUNT) && anchorUnmapped.dynamic === true, { actual: anchorUnmapped?.actual });
    check("unmapped_total_in_data_status", near(data.data_status.unmapped_total, UNMAPPED_AMOUNT), { total: data.data_status.unmapped_total });
    const anchorCodes = anchor.rows.map((row) => row.code);
    check("unmapped_row_before_subtotal", anchorCodes.indexOf("TOTAL_GASTOS_OPERACIONALES") > anchorCodes.indexOf("GASTOS_LEGALES"), {});

    // ---- Consolidado corporativo ----
    check("corporate_income_matches_targets", near(data.corporate.income_actual, expectedCorporateIncome), { corporate: data.corporate.income_actual, expected: Math.round(expectedCorporateIncome * 100) / 100 });
    const corpNeta = data.corporate.rows.find((row) => row.code === "UTILIDAD_NETA");
    check("corporate_net_margin_pct", typeof corpNeta.pct === "number" && near(corpNeta.pct, corpNeta.actual / data.corporate.income_actual), { pct: corpNeta.pct });

    // ---- Periodo sin datos: estructura intacta, sin 500 ----
    const empty = await capture("/api/v1/transport-pyg/report?period=2024-01");
    check("empty_period_no_crash", empty.status === 200 && empty.payload.corporate.income_actual === 0 && empty.payload.data_status.vehicles_with_income === 0, { status: empty.status, income: empty.payload?.corporate?.income_actual });

    result.fixture = {
      company_id: COMPANY_ID,
      period: PERIOD,
      anchor_plate: anchorVehicle.plate,
      anchor_vehicle_id: anchorVehicle.id,
      driver_employee_id: driverEmployeeId,
      package_code: `PYG-PKG-${PERIOD}`,
      box_code: `PYG-BOX-${PERIOD}`,
      note: "Datos dejados activos en el tenant piloto QA para inspeccion en la interfaz"
    };
    result.status = "passed";
    result.checks_passed = result.checks.filter((c) => c.ok).length;
    result.checks_total = result.checks.length;
  } catch (error) {
    result.status = "failed";
    result.error = error.message;
    console.error("[cert] ERROR:", error.message);
  } finally {
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    result.finished_at = new Date().toISOString();
    fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
    console.error(`[cert] evidencia: ${path.relative(path.resolve(__dirname, "..", ".."), OUTPUT)} status=${result.status} (${result.checks.filter((c) => c.ok).length}/${result.checks.length})`);
    process.exit(result.status === "passed" ? 0 : 1);
  }
}

main();
