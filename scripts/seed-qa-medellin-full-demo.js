const fs = require("fs");

const DEMO_BATCH = "apexos_medellin_full_qa";
const DEMO_PASSWORD = "ApexOS-Medellin-2026!";
const COMPANY_NAME = process.env.SUPABASE_DEMO_COMPANY || "SCJ";

function loadEnv() {
  const env = {};
  const raw = fs.readFileSync(".env", "utf8");
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    env[line.slice(0, index)] = line.slice(index + 1).replace(/^"|"$/g, "");
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error("Configura NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.");

const headers = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };
const demoMeta = (extra = {}) => ({ is_demo: true, demo_batch: DEMO_BATCH, city: "Medellin", ...extra });
const eq = (value) => encodeURIComponent(String(value));

async function request(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) throw new Error(`${options.method || "GET"} ${path} -> ${response.status}: ${body?.message || body?.error || text}`);
  return body;
}
async function maybe(path, options = {}) { try { return await request(path, options); } catch { return null; } }
async function insert(table, rows) {
  return request(`/rest/v1/${table}?select=*`, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(rows) });
}
async function insertTimePunches(rows) {
  try {
    return await insert("time_punches", rows);
  } catch (error) {
    if (!String(error.message).includes("extra_evidence")) throw error;
    const fallbackRows = rows.map(({ extra_evidence, ...row }) => row);
    return insert("time_punches", fallbackRows);
  }
}
async function upsert(table, rows, conflict) {
  return request(`/rest/v1/${table}?on_conflict=${conflict}&select=*`, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(rows) });
}
async function patch(table, filter, values) {
  const rows = await request(`/rest/v1/${table}?${filter}&select=*`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(values) });
  return rows[0] || null;
}
async function findOne(table, filter, select = "*") {
  const rows = await request(`/rest/v1/${table}?select=${select}&${filter}&limit=1`);
  return rows[0] || null;
}
function sameKeys(rows) {
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return rows.map((row) => Object.fromEntries(keys.map((key) => [key, row[key] ?? null])));
}
async function cleanup(companyId) {
  const demoRoutes = await maybe(`/rest/v1/operational_routes?select=id&company_id=eq.${companyId}&metadata->>demo_batch=eq.${DEMO_BATCH}`) || [];
  for (const route of demoRoutes) await maybe(`/rest/v1/route_assignments?route_id=eq.${route.id}`, { method: "DELETE" });

  const demoReferences = await maybe(`/rest/v1/service_references?select=id&company_id=eq.${companyId}&metadata->>demo_batch=eq.${DEMO_BATCH}`) || [];
  for (const reference of demoReferences) await maybe(`/rest/v1/service_reference_parts?reference_id=eq.${reference.id}`, { method: "DELETE" });

  const filters = [
    ["service_evidence", `company_id=eq.${companyId}&metadata->>demo_batch=eq.${DEMO_BATCH}`],
    ["service_incidents", `company_id=eq.${companyId}&metadata->>demo_batch=eq.${DEMO_BATCH}`],
    ["service_orders", `company_id=eq.${companyId}&metadata->>demo_batch=eq.${DEMO_BATCH}`],
    ["gps_pings", `company_id=eq.${companyId}&metadata->>demo_batch=eq.${DEMO_BATCH}`],
    ["time_punches", `company_id=eq.${companyId}&metadata->>demo_batch=eq.${DEMO_BATCH}`],
    ["operational_routes", `company_id=eq.${companyId}&metadata->>demo_batch=eq.${DEMO_BATCH}`],
    ["service_references", `company_id=eq.${companyId}&metadata->>demo_batch=eq.${DEMO_BATCH}`],
    ["vehicle_documents", `company_id=eq.${companyId}&metadata->>demo_batch=eq.${DEMO_BATCH}`],
    ["vehicles", `company_id=eq.${companyId}&metadata->>demo_batch=eq.${DEMO_BATCH}`],
    ["employees", `company_id=eq.${companyId}&metadata->>demo_batch=eq.${DEMO_BATCH}`]
  ];
  for (const [table, filter] of filters) await maybe(`/rest/v1/${table}?${filter}`, { method: "DELETE" });
}

async function ensureCompany() {
  const existing = await findOne("companies", `name=eq.${eq(COMPANY_NAME)}`).catch(() => null);
  if (existing) return existing;
  return (await insert("companies", [{ name: COMPANY_NAME, legal_name: "SCJ QA Medellin Demo S.A.S.", tax_id: "901777777-1", email: "qa.medellin@demo.apexos.local", phone: "+57 604 555 0101", status: "active" }]))[0];
}
async function ensureUsers(companyId) {
  const users = [
    ["coord.medellin@demo.apexos.local", "Camila Restrepo", "Coordinadora logistica", "coordinador"],
    ["conductor.norte.med@demo.apexos.local", "Juan David Perez", "Conductor Norte", "conductor"],
    ["conductor.sur.med@demo.apexos.local", "Mateo Gomez", "Conductor Sur", "conductor"],
    ["conductor.oriente.med@demo.apexos.local", "Andres Marin", "Conductor Oriente", "conductor"],
    ["operaria.belen.med@demo.apexos.local", "Laura Henao", "Operaria Servicios", "operario"],
    ["tecnico.poblado.med@demo.apexos.local", "Sebastian Cano", "Tecnico Servicios", "tecnico"]
  ];
  const auth = await request("/auth/v1/admin/users?page=1&per_page=200");
  const ensured = [];
  for (const [email, name, roleLabel, classification] of users) {
    let user = (auth.users || []).find((item) => item.email?.toLowerCase() === email);
    if (!user) {
      user = await request("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email, password: DEMO_PASSWORD, email_confirm: true, user_metadata: demoMeta({ full_name: name, role_label: roleLabel }) }) });
    }
    await upsert("profiles", [{ id: user.id, full_name: name, email, status: "active" }], "id");
    await upsert("company_users", [{ company_id: companyId, user_id: user.id, role: classification === "coordinador" ? "admin" : "member", status: "active" }], "company_id,user_id");
    const [first_name, ...lastParts] = name.split(" ");
    ensured.push({ id: user.id, email, first_name, last_name: lastParts.join(" "), name, roleLabel, classification });
  }
  return ensured;
}

function tinyPhoto(label) {
  return `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="100%" height="100%" fill="#0f766e"/><text x="32" y="190" fill="white" font-size="34" font-family="Arial">${label}</text></svg>`).toString("base64")}`;
}
const points = {
  bodega: [6.2442, -75.5812],
  estadio: [6.2569, -75.5887],
  poblado: [6.2099, -75.5677],
  envigado: [6.1719, -75.5917],
  laureles: [6.2447, -75.5990],
  bello: [6.3373, -75.5579],
  itagui: [6.1714, -75.6110],
  aeropuerto: [6.1645, -75.4231],
  centro: [6.2518, -75.5636]
};
function gpsPoint([lat, lng], delta = 0) { return { latitude: lat + delta, longitude: lng - delta, accuracy_meters: 12 + Math.round(delta * 1000) }; }
function iso(date, time) { return `${date}T${time}:00-05:00`; }
function localDateOffset(days = 0) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

async function main() {
  const company = await ensureCompany();
  await cleanup(company.id);
  const users = await ensureUsers(company.id);
  const employees = await upsert("employees", users.map((user, index) => ({
    company_id: company.id,
    user_id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    document_type: "CC",
    document_number: `QA-MED-${String(index + 1).padStart(4, "0")}`,
    email: user.email,
    phone: `30055${String(index + 1).padStart(5, "0")}`,
    position: user.classification,
    department: user.classification === "conductor" ? "Operacion Medellin" : "Servicios Medellin",
    hire_date: "2026-05-01",
    status: "active",
    user_type: user.classification,
    metadata: demoMeta({ code: `${user.classification.toUpperCase().slice(0, 3)}-MED-${String(index + 1).padStart(3, "0")}`, name: user.name, base_city: "Medellin", eps: "EPS Demo", arl: "ARL Demo", cost_center: "MED-OPS", bank: "Banco Demo", account_type: "ahorros", license_category: user.classification === "conductor" ? "C2" : null, license_expires_at: user.classification === "conductor" ? "2026-07-15" : null })
  })), "company_id,document_number");

  const vehicles = await upsert("vehicles", [
    { company_id: company.id, plate: "MED101", brand: "Chevrolet", model: "NPR", type: "camion", year: 2024, color: "Blanco", mileage: 18000, owner: company.name, status: "active", document_status: "vigente", master_status: "activo", metadata: demoMeta({ scenario: "ruta_normal" }) },
    { company_id: company.id, plate: "MED202", brand: "Renault", model: "Kangoo", type: "van", year: 2023, color: "Gris", mileage: 26500, owner: company.name, status: "active", document_status: "proximo_vencer", master_status: "activo", metadata: demoMeta({ scenario: "horas_extra" }) },
    { company_id: company.id, plate: "MED303", brand: "Hino", model: "Dutro", type: "camion", year: 2022, color: "Azul", mileage: 41200, owner: company.name, status: "maintenance", document_status: "vencido", master_status: "bloqueado", metadata: demoMeta({ scenario: "bloqueado" }) }
  ], "company_id,plate");

  await insert("vehicle_documents", vehicles.map((vehicle, index) => ({ company_id: company.id, vehicle_id: vehicle.id, plate: vehicle.plate, document_type: index === 2 ? "soat" : "tecnomecanica", file_name: `${vehicle.plate}-demo.pdf`, issued_at: "2026-01-01", expires_at: index === 0 ? "2026-12-31" : index === 1 ? "2026-06-10" : "2026-04-30", document_status: index === 0 ? "vigente" : index === 1 ? "proximo_vencer" : "vencido", storage_path: `company/${company.id}/vehicles/${vehicle.id}/demo.pdf`, observations: "Documento demo QA Medellin", metadata: demoMeta() })));

  const refs = await upsert("service_references", [
    { company_id: company.id, code: "MED-REF-001", name: "Instalacion punto frio Medellin", category: "instalacion", estimated_minutes: 90, brand: "APEX", model: "PF-MED", active: true, metadata: demoMeta({ manuals: [{ name: "Manual punto frio Medellin.pdf", placeholder: true }] }) },
    { company_id: company.id, code: "MED-REF-002", name: "Revision equipo exhibicion", category: "revision", estimated_minutes: 45, brand: "APEX", model: "EXH-MED", active: true, metadata: demoMeta() },
    { company_id: company.id, code: "MED-REF-003", name: "Mantenimiento correctivo demo", category: "mantenimiento", estimated_minutes: 120, brand: "APEX", model: "MTTO-MED", active: true, metadata: demoMeta() }
  ], "company_id,code");
  await insert("service_reference_parts", refs.flatMap((ref, index) => [
    { company_id: company.id, reference_id: ref.id, name: index === 0 ? "Modulo frio" : "Checklist tecnico", quantity: 1, unit: "und", display_order: 1 },
    { company_id: company.id, reference_id: ref.id, name: "Kit tornilleria y sellos", quantity: 1, unit: "kit", display_order: 2 }
  ]));

  const [conNorte, conSur, conOriente, operaria, tecnico] = [employees[1], employees[2], employees[3], employees[4], employees[5]];
  const date = localDateOffset(0);
  const routes = await upsert("operational_routes", [
    { company_id: company.id, code: "MED-RUTA-001", route_date: date, vehicle_id: vehicles[0].id, vehicle_plate: "MED101", start_time: "07:30", end_time: "16:30", status: "active", notes: "Bodega - Estadio - Laureles", metadata: demoMeta({ scenario: "normal_completa" }) },
    { company_id: company.id, code: "MED-RUTA-002", route_date: date, vehicle_id: vehicles[1].id, vehicle_plate: "MED202", start_time: "08:00", end_time: "17:00", status: "active", notes: "Poblado - Envigado - Itagui con extra", metadata: demoMeta({ scenario: "hora_extra_con_evidencia" }) },
    { company_id: company.id, code: "MED-RUTA-003", route_date: date, vehicle_id: vehicles[2].id, vehicle_plate: "MED303", start_time: "09:00", end_time: "15:00", status: "cancelled", notes: "Bloqueada por documento vencido", metadata: demoMeta({ scenario: "bloqueada" }) },
    { company_id: company.id, code: "MED-RUTA-004", route_date: date, vehicle_id: vehicles[0].id, vehicle_plate: "MED101", start_time: "10:00", end_time: "18:00", status: "planned", notes: "Ruta sin marcaciones para control", metadata: demoMeta({ scenario: "sin_marcaciones" }) }
  ], "company_id,code");
  await insert("route_assignments", [
    { company_id: company.id, route_id: routes[0].id, employee_id: conNorte.id, role: "conductor", status: "active" },
    { company_id: company.id, route_id: routes[0].id, employee_id: operaria.id, role: "auxiliar", status: "active" },
    { company_id: company.id, route_id: routes[1].id, employee_id: conSur.id, role: "conductor", status: "active" },
    { company_id: company.id, route_id: routes[1].id, employee_id: tecnico.id, role: "tecnico", status: "active" },
    { company_id: company.id, route_id: routes[2].id, employee_id: conOriente.id, role: "conductor", status: "active" }
  ]);

  const punchRows = [];
  const addPunch = (employee, route, vehicle, type, time, point, extra = {}) => {
    const evidence = extra.evidence ? { name: "soporte-extension-medellin.svg", type: "image/svg+xml", size: 1200, base64_data: tinyPhoto("Soporte extension Medellin") } : {};
    punchRows.push({ company_id: company.id, employee_id: employee.id, user_id: employee.user_id, route_id: route.id, vehicle_id: vehicle.id, user_name: `${employee.first_name} ${employee.last_name}`, punch_type: type, punched_at: iso(date, time), punch_date: date, punch_time: `${time}:00`, ...gpsPoint(point, extra.delta || 0), extra_minutes: extra.minutes || 0, extra_reason: extra.reason || null, extra_detail: extra.detail || null, extra_evidence: evidence, metadata: demoMeta({ scenario: extra.scenario || "marcacion", overtime_required: Boolean(extra.minutes), extra_evidence: evidence }) });
  };
  addPunch(conNorte, routes[0], vehicles[0], "entrada", "07:28", points.bodega);
  addPunch(conNorte, routes[0], vehicles[0], "inicio_almuerzo", "12:02", points.estadio);
  addPunch(conNorte, routes[0], vehicles[0], "fin_almuerzo", "12:42", points.estadio);
  addPunch(conNorte, routes[0], vehicles[0], "salida", "16:25", points.laureles);
  addPunch(conSur, routes[1], vehicles[1], "entrada", "08:03", points.poblado);
  addPunch(conSur, routes[1], vehicles[1], "inicio_almuerzo", "12:30", points.envigado);
  addPunch(conSur, routes[1], vehicles[1], "fin_almuerzo", "13:10", points.envigado);
  addPunch(conSur, routes[1], vehicles[1], "salida", "18:35", points.itagui, { minutes: 95, reason: "congestion_vial", detail: "Cierre extendido por congestion en Avenida Regional y reintento de entrega autorizado por coordinacion.", evidence: true, scenario: "hora_extra" });
  addPunch(tecnico, routes[1], vehicles[1], "entrada", "08:15", points.poblado);
  addPunch(tecnico, routes[1], vehicles[1], "salida", "17:45", points.itagui, { minutes: 45, reason: "servicio_critico", detail: "Servicio critico finalizado despues del horario por validacion de piezas con cliente.", evidence: true, scenario: "hora_extra_servicio" });
  await insertTimePunches(punchRows);

  const gpsRows = [];
  const addActivity = (employee, route, vehicle, time, point, type, observation, i) => gpsRows.push({ company_id: company.id, employee_id: employee.id, user_id: employee.user_id, route_id: route.id, vehicle_id: vehicle.id, user_name: `${employee.first_name} ${employee.last_name}`, ...gpsPoint(point, i * 0.0007), source: "work_activity", captured_at: iso(date, time), metadata: demoMeta({ activity_type_name: type, observation, photo: tinyPhoto(type), photo_name: `${type.toLowerCase().replace(/\s+/g, "-")}.svg` }) });
  [
    [conNorte, routes[0], vehicles[0], "08:10", points.bodega, "Cargue de mercancia en bodega", "Cargue inicial en bodega Medellin."],
    [conNorte, routes[0], vehicles[0], "09:05", points.estadio, "Entrega en tienda", "Entrega completa sector Estadio."],
    [operaria, routes[0], vehicles[0], "10:20", points.laureles, "Apoyo operativo", "Validacion de piezas y evidencia de entrega."],
    [conSur, routes[1], vehicles[1], "08:45", points.poblado, "Inicio de ruta", "Salida hacia Poblado."],
    [conSur, routes[1], vehicles[1], "11:15", points.envigado, "Entrega en cliente", "Entrega parcial con novedad de espera."],
    [conSur, routes[1], vehicles[1], "17:30", points.itagui, "Novedad en ruta", "Congestion vial y reintento autorizado."],
    [tecnico, routes[1], vehicles[1], "16:55", points.itagui, "Validacion de piezas", "Revision tecnica extendida por pieza critica."]
  ].forEach((item, index) => addActivity(...item, index));
  await insert("gps_pings", gpsRows);

  const orders = await upsert("service_orders", sameKeys([
    { company_id: company.id, number: "MED-SER-001", reference_id: refs[0].id, technician_employee_id: tecnico.id, technician_user_id: tecnico.user_id, service_type: "instalacion", status: "pendiente", customer_name: "Tienda Demo Laureles", customer_address: "Circular 74A #39B-20, Medellin", customer_phone: "3005550101", scheduled_date: date, metadata: demoMeta({ route_code: "MED-RUTA-001" }) },
    { company_id: company.id, number: "MED-SER-002", reference_id: refs[1].id, technician_employee_id: conSur.id, technician_user_id: conSur.user_id, service_type: "revision", status: "en_curso", customer_name: "Cliente Demo Poblado", customer_address: "Cra 43A #10-45, Medellin", customer_phone: "3005550102", scheduled_date: date, started_at: iso(date, "09:00"), start_latitude: points.poblado[0], start_longitude: points.poblado[1], metadata: demoMeta({ route_code: "MED-RUTA-002" }) },
    { company_id: company.id, number: "MED-SER-003", reference_id: refs[2].id, technician_employee_id: tecnico.id, technician_user_id: tecnico.user_id, service_type: "mantenimiento", status: "cerrada", customer_name: "Cliente Demo Envigado", customer_address: "Calle 36 Sur #43-80, Envigado", customer_phone: "3005550103", scheduled_date: date, started_at: iso(date, "14:30"), closed_at: iso(date, "16:20"), duration_minutes: 110, close_latitude: points.envigado[0], close_longitude: points.envigado[1], metadata: demoMeta({ route_code: "MED-RUTA-002" }) },
    { company_id: company.id, number: "MED-SER-004", reference_id: refs[1].id, technician_employee_id: operaria.id, technician_user_id: operaria.user_id, service_type: "revision", status: "no_ejecutada", customer_name: "Cliente Demo Bello", customer_address: "Cra 50 #50-20, Bello", customer_phone: "3005550104", scheduled_date: date, no_execution_reason: "Cliente no disponible en punto.", metadata: demoMeta({ route_code: "MED-RUTA-004" }) }
  ]), "company_id,number");
  await insert("service_evidence", orders.map((order, index) => ({ company_id: company.id, order_id: order.id, evidence_type: index === 3 ? "no_ejecutada" : "producto_cerrado", file_url: "", storage_bucket: "service-images", storage_path: `company/${company.id}/services/${order.id}/evidencia-${index}.svg`, mime_type: "image/svg+xml", size_bytes: 1200, metadata: demoMeta({ base64_data: tinyPhoto(`Servicio ${order.number}`) }) })));
  await insert("service_incidents", [{ company_id: company.id, order_id: orders[1].id, type: "novedad", description: "Espera por autorizacion de ingreso en porteria.", action: "Coordinador valida y autoriza extension.", photo_url: "", metadata: demoMeta({ route_code: "MED-RUTA-002" }) }]);

  console.log(JSON.stringify({ status: "ok", company: company.name, company_id: company.id, demo_batch: DEMO_BATCH, demo_password: DEMO_PASSWORD, users: users.map((u) => u.email), employees: employees.length, vehicles: vehicles.length, routes: routes.length, punches: punchRows.length, activities: gpsRows.length, service_orders: orders.length, scenarios: ["ruta normal completa", "hora extra con motivo y foto", "ruta bloqueada", "ruta sin marcaciones", "servicios pendiente/en curso/cerrado/no ejecutado"] }, null, 2));
}

main().catch((error) => { console.error(error.message); process.exit(1); });
