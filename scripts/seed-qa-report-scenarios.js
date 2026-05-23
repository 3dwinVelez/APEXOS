const fs = require("fs");

const BATCH = "apexos_reports_demo";

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index > 0) env[line.slice(0, index)] = line.slice(index + 1).replace(/^"|"$/g, "");
  }
  return env;
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");

const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
const meta = (extra = {}) => ({ is_demo: true, demo_batch: BATCH, city: "Medellin", ...extra });

async function request(path, options = {}) {
  const response = await fetch(`${url}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) throw new Error(`${options.method || "GET"} ${path} -> ${response.status}: ${body?.message || body?.error || text}`);
  return body;
}

async function maybe(path, options = {}) {
  try { return await request(path, options); } catch { return null; }
}

async function insert(table, rows) {
  return request(`/rest/v1/${table}?select=*`, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(rows) });
}

async function upsert(table, rows, conflict) {
  return request(`/rest/v1/${table}?on_conflict=${conflict}&select=*`, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(rows) });
}

function sameKeys(rows) {
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return rows.map((row) => Object.fromEntries(keys.map((key) => [key, row[key] ?? null])));
}

function tinyPhoto(label) {
  return `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="100%" height="100%" fill="#146c63"/><text x="32" y="190" fill="white" font-size="32" font-family="Arial">${label}</text></svg>`).toString("base64")}`;
}

function iso(date, time) {
  return `${date}T${time}:00-05:00`;
}

function localDateOffset(days = 0) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

async function main() {
  const companies = await request("/rest/v1/companies?select=id,name&name=eq.SCJ&limit=1");
  const company = companies[0];
  if (!company) throw new Error("No encontre company SCJ.");

  await maybe(`/rest/v1/service_evidence?company_id=eq.${company.id}&metadata->>demo_batch=eq.${BATCH}`, { method: "DELETE" });
  await maybe(`/rest/v1/service_incidents?company_id=eq.${company.id}&metadata->>demo_batch=eq.${BATCH}`, { method: "DELETE" });
  await maybe(`/rest/v1/service_orders?company_id=eq.${company.id}&metadata->>demo_batch=eq.${BATCH}`, { method: "DELETE" });
  await maybe(`/rest/v1/gps_pings?company_id=eq.${company.id}&metadata->>demo_batch=eq.${BATCH}`, { method: "DELETE" });
  await maybe(`/rest/v1/time_punches?company_id=eq.${company.id}&metadata->>demo_batch=eq.${BATCH}`, { method: "DELETE" });

  const [employees, refs, routes, vehicles] = await Promise.all([
    request(`/rest/v1/employees?select=*&company_id=eq.${company.id}`),
    request(`/rest/v1/service_references?select=*&company_id=eq.${company.id}`),
    request(`/rest/v1/operational_routes?select=*&company_id=eq.${company.id}`),
    request(`/rest/v1/vehicles?select=*&company_id=eq.${company.id}`)
  ]);
  const tech = employees.find((e) => e.user_type === "tecnico") || employees[0];
  const operator = employees.find((e) => e.user_type === "operario") || employees[1] || tech;
  const conductor = employees.find((e) => e.user_type === "conductor") || employees[2] || tech;
  const route = routes[0];
  const vehicle = vehicles[0];
  const ref1 = refs[0];
  const ref2 = refs[1] || refs[0];
  const ref3 = refs[2] || refs[0];
  const today = localDateOffset(0);
  const yesterday = localDateOffset(-1);
  const twoDaysAgo = localDateOffset(-2);

  const orders = await upsert("service_orders", sameKeys([
    { company_id: company.id, number: "MED-REP-001", reference_id: ref1.id, technician_employee_id: tech.id, technician_user_id: tech.user_id, service_type: "instalacion", status: "cerrada", customer_name: "Supermercado Demo Centro", customer_address: "Av Oriental #52-18, Medellin", customer_phone: "3005550201", scheduled_date: yesterday, started_at: iso(yesterday, "08:20"), closed_at: iso(yesterday, "10:05"), duration_minutes: 105, close_latitude: 6.2476, close_longitude: -75.5658, metadata: meta({ scenario: "servicio_cerrado_con_hallazgo", product_family: "punto frio" }) },
    { company_id: company.id, number: "MED-REP-002", reference_id: ref2.id, technician_employee_id: operator.id, technician_user_id: operator.user_id, service_type: "revision", status: "cerrada", customer_name: "Tienda Demo Belen", customer_address: "Cra 76 #30A-44, Medellin", customer_phone: "3005550202", scheduled_date: yesterday, started_at: iso(yesterday, "11:10"), closed_at: iso(yesterday, "12:00"), duration_minutes: 50, close_latitude: 6.2261, close_longitude: -75.6034, metadata: meta({ scenario: "servicio_rapido_sin_hallazgo", product_family: "exhibicion" }) },
    { company_id: company.id, number: "MED-REP-003", reference_id: ref3.id, technician_employee_id: tech.id, technician_user_id: tech.user_id, service_type: "mantenimiento", status: "no_ejecutada", customer_name: "Cliente Demo Robledo", customer_address: "Calle 65 #88-20, Medellin", customer_phone: "3005550203", scheduled_date: twoDaysAgo, started_at: iso(twoDaysAgo, "14:00"), closed_at: iso(twoDaysAgo, "14:25"), duration_minutes: 25, no_execution_reason: "Cliente no autorizo ingreso por cierre de local.", metadata: meta({ scenario: "no_ejecutada_cliente", product_family: "mantenimiento" }) },
    { company_id: company.id, number: "MED-REP-004", reference_id: ref1.id, technician_employee_id: conductor.id, technician_user_id: conductor.user_id, service_type: "validacion", status: "inspeccion", customer_name: "Cliente Demo Sabaneta", customer_address: "Cra 45 #70 Sur-10, Sabaneta", customer_phone: "3005550204", scheduled_date: today, started_at: iso(today, "15:10"), duration_minutes: 0, start_latitude: 6.1515, start_longitude: -75.6162, metadata: meta({ scenario: "inspeccion_en_curso", product_family: "punto frio" }) }
  ]), "company_id,number");

  await insert("service_incidents", [
    { company_id: company.id, order_id: orders[0].id, type: "hallazgo", description: "Empaque de sello deteriorado y vibracion en unidad.", action: "Se reemplaza sello y se ajusta soporte.", metadata: meta() },
    { company_id: company.id, order_id: orders[2].id, type: "no_ejecucion", description: "Cliente no disponible para autorizacion.", action: "Reprogramar con ventana confirmada.", metadata: meta() },
    { company_id: company.id, order_id: orders[3].id, type: "inspeccion", description: "Validacion de piezas pendiente por confirmar referencia.", action: "Tecnico espera aprobacion de coordinacion.", metadata: meta() }
  ]);
  await insert("service_evidence", orders.map((order) => ({ company_id: company.id, order_id: order.id, evidence_type: order.status === "no_ejecutada" ? "no_ejecutada" : "producto_cerrado", file_url: "", storage_bucket: "service-images", storage_path: `company/${company.id}/services/${order.id}/reporte-demo.svg`, mime_type: "image/svg+xml", size_bytes: 1200, metadata: meta({ base64_data: tinyPhoto(`Reporte ${order.number}`) }) })));

  const punchRows = [
    { employee: conductor, date: yesterday, entry: "06:55", lunch1: "12:10", lunch2: "12:45", exit: "17:50", extra: 50, reason: "entrega_cliente_extendida", detail: "Entrega extendida por validacion de recibido en cliente." },
    { employee: operator, date: twoDaysAgo, entry: "07:05", lunch1: "12:00", lunch2: "12:35", exit: "16:58", extra: 0, reason: "", detail: "" }
  ].flatMap((row) => [
    ["entrada", row.entry, 0], ["inicio_almuerzo", row.lunch1, 0], ["fin_almuerzo", row.lunch2, 0], ["salida", row.exit, row.extra]
  ].map(([type, time, extra], index) => ({
    company_id: company.id,
    employee_id: row.employee.id,
    user_id: row.employee.user_id,
    route_id: route?.id || null,
    vehicle_id: vehicle?.id || null,
    user_name: `${row.employee.first_name} ${row.employee.last_name}`.trim(),
    punch_type: type,
    punched_at: iso(row.date, time),
    punch_date: row.date,
    punch_time: `${time}:00`,
    latitude: 6.2442 + index * 0.01,
    longitude: -75.5812 - index * 0.01,
    accuracy_meters: 14 + index,
    extra_minutes: extra,
    extra_reason: extra ? row.reason : null,
    extra_detail: extra ? row.detail : null,
    metadata: meta({ extra_evidence: extra ? { base64_data: tinyPhoto("Soporte hora extra reporte"), name: "soporte-hora-extra.svg" } : {} })
  })));
  await insert("time_punches", punchRows);

  console.log(JSON.stringify({ status: "ok", batch: BATCH, service_orders: orders.length, punches: punchRows.length }, null, 2));
}

main().catch((error) => { console.error(error.message); process.exit(1); });
