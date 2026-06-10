require("./load-env")();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEMO_PASSWORD = "ApexOS-QA-2026!";

const ORGS = [
  { name: "SCJ", prefix: "SCJ", city: "Bogota", lat: 4.711, lon: -74.0721 },
  { name: "Puebla Operaciones", prefix: "PUEBLA", city: "Puebla", lat: 19.0414, lon: -98.2063 }
];

function requireEnv() {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Configura NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.");
}

async function request(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(`Supabase ${response.status}: ${body.message || body.error || JSON.stringify(body)}`);
  }
  if (response.status === 204) return null;
  return response.json().catch(() => null);
}

async function upsert(table, rows, conflict) {
  if (!rows.length) return [];
  return request(`/rest/v1/${table}?on_conflict=${conflict}&select=*`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(rows)
  });
}

async function list(path) {
  return request(path, { method: "GET" });
}

async function findAuthUser(email) {
  const page = await request("/auth/v1/admin/users?page=1&per_page=1000", { method: "GET" });
  return (page?.users || []).find((user) => String(user.email).toLowerCase() === email.toLowerCase()) || null;
}

async function ensureAuthUser(email, fullName, companyId, role) {
  const existing = await findAuthUser(email);
  if (existing) return existing;
  return request("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({
      email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: fullName, company_id: companyId, role }
    })
  });
}

async function ensureProfileAndMembership(companyId, user, fullName, role) {
  await upsert("profiles", [{
    id: user.id,
    full_name: fullName,
    email: user.email,
    status: "active"
  }], "id");
  await upsert("company_users", [{
    company_id: companyId,
    user_id: user.id,
    role,
    status: "active"
  }], "company_id,user_id");
}

async function ensureEnabledModules(companyId) {
  const modules = await list("/rest/v1/modules?select=id,code&code=in.(talento_humano,servicios,transporte,administracion_apex,configuracion,inventario,compras,contabilidad)");
  await upsert("company_modules", modules.map((module) => ({
    company_id: companyId,
    module_id: module.id,
    enabled: true,
    source: "manual"
  })), "company_id,module_id");
}

function dateOffset(offset) {
  const date = new Date("2026-05-18T05:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function iso(date, hhmm) {
  return `${date}T${hhmm}:00-05:00`;
}

async function companyByName(name) {
  const rows = await list(`/rest/v1/companies?select=id,name&name=eq.${encodeURIComponent(name)}&limit=1`);
  if (rows?.[0]) return rows[0];
  const created = await request("/rest/v1/companies?select=*", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ name, legal_name: name, status: "active" })
  });
  return created[0];
}

async function seedOrg(org) {
  const company = await companyByName(org.name);
  const company_id = company.id;
  await ensureEnabledModules(company_id);

  const adminEmail = `admin@${org.prefix.toLowerCase()}.qa`;
  const adminUser = await ensureAuthUser(adminEmail, `Admin ${org.name}`, company_id, "admin");
  await ensureProfileAndMembership(company_id, adminUser, `Admin ${org.name}`, "admin");

  const employeeUsers = [];
  for (let index = 0; index < 10; index += 1) {
    const n = index + 1;
    const code = `${org.prefix}-${String(n).padStart(3, "0")}`;
    const fullName = `${n <= 5 ? "Tecnico" : "Empleado"} ${org.name} ${n}`;
    const email = `${code.toLowerCase()}@${org.prefix.toLowerCase()}.qa`;
    const user = await ensureAuthUser(email, fullName, company_id, n <= 5 ? "tecnico" : "empleado");
    await ensureProfileAndMembership(company_id, user, fullName, n <= 5 ? "member" : "member");
    employeeUsers.push({ n, code, email, user, fullName });
  }

  const employees = await upsert("employees", employeeUsers.map(({ n, code, email, user, fullName }) => {
    return {
      company_id,
      user_id: user.id,
      first_name: n <= 5 ? "Tecnico" : "Empleado",
      last_name: `${org.name} ${n}`,
      document_type: "CC",
      document_number: code,
      email,
      phone: `300555${String(n).padStart(4, "0")}`,
      position: n <= 5 ? "tecnico" : "operario",
      department: n <= 5 ? "Servicios" : "Operacion",
      hire_date: "2026-01-15",
      status: "active",
      metadata: { demo_seed: true, full_name: fullName }
    };
  }), "company_id,document_number");

  const vehicles = await upsert("vehicles", Array.from({ length: 5 }, (_, index) => ({
    company_id,
    plate: `${org.prefix}-${100 + index + 1}`,
    brand: ["Toyota", "Renault", "Nissan", "Chevrolet", "Ford"][index],
    model: ["Hilux", "Kangoo", "Frontier", "NHR", "Transit"][index],
    type: index < 3 ? "camioneta" : "van",
    year: 2021 + index,
    color: ["Blanco", "Gris", "Azul", "Rojo", "Negro"][index],
    mileage: 18000 + index * 2400,
    owner: org.name,
    status: "active",
    metadata: { demo_seed: true, city: org.city }
  })), "company_id,plate");

  const references = await upsert("service_references", Array.from({ length: 100 }, (_, index) => {
    const n = index + 1;
    return {
      company_id,
      code: `${org.prefix}-REF-${String(n).padStart(3, "0")}`,
      name: `Referencia operativa ${n}`,
      category: n % 3 === 0 ? "electrodomesticos" : "muebles",
      description: `Referencia demo ${n} para validar servicios end to end.`,
      estimated_minutes: 35 + (n % 8) * 10,
      brand: ["Apex", "Nova", "Andes", "Metro"][n % 4],
      model: `M-${2000 + n}`,
      active: true,
      metadata: { demo_seed: true }
    };
  }), "company_id,code");

  await upsert("service_reference_parts", references.flatMap((ref, index) => [
    { company_id, reference_id: ref.id, name: "Kit principal", quantity: 1, unit: "und", display_order: 1 },
    { company_id, reference_id: ref.id, name: "Tornilleria", quantity: 4 + (index % 6), unit: "und", display_order: 2 }
  ]), "reference_id,name");

  const routes = await upsert("operational_routes", Array.from({ length: 5 }, (_, index) => ({
    company_id,
    code: `${org.prefix}-RUTA-${index + 1}`,
    route_date: dateOffset(index - 4),
    vehicle_id: vehicles[index % vehicles.length].id,
    vehicle_plate: vehicles[index % vehicles.length].plate,
    start_time: "08:00",
    end_time: index === 3 ? "16:30" : "17:00",
    tolerance_minutes: 15,
    status: index < 4 ? "closed" : "active",
    notes: "seed-supabase-ops",
    metadata: { demo_seed: true }
  })), "company_id,code");

  await upsert("route_assignments", routes.flatMap((route) => employees.slice(0, 5).map((employee) => ({
    company_id,
    route_id: route.id,
    employee_id: employee.id,
    role: "technician",
    status: "active"
  }))), "route_id,employee_id");

  const punches = [];
  const gps = [];
  for (const [routeIndex, route] of routes.entries()) {
    const isExtra = routeIndex === 3;
    const punchPlan = [["entrada", "08:00"], ["inicio_almuerzo", "12:00"], ["fin_almuerzo", "13:00"], ["salida", isExtra ? "18:10" : "17:03"]];
    for (const [employeeIndex, employee] of employees.slice(0, 5).entries()) {
      for (const [punchIndex, [punch_type, hour]] of punchPlan.entries()) {
        const extra = punch_type === "salida" && isExtra ? 85 : 0;
        punches.push({
          company_id,
          employee_id: employee.id,
          route_id: route.id,
          vehicle_id: route.vehicle_id,
          user_name: employee.document_number,
          punch_type,
          punched_at: iso(route.route_date, hour),
          punch_date: route.route_date,
          punch_time: hour,
          latitude: org.lat + punchIndex * 0.004 + employeeIndex * 0.0001,
          longitude: org.lon - punchIndex * 0.004 - employeeIndex * 0.0001,
          accuracy_meters: 12 + punchIndex,
          extra_minutes: extra,
          extra_reason: extra ? "Cierre extendido con autorizacion del cliente" : null,
          metadata: { demo_seed: true, scenario: extra ? "overtime_justified" : "regular" }
        });
      }
    }
    for (let point = 0; point < 6; point += 1) {
      gps.push({
        company_id,
        employee_id: employees[point % 5].id,
        route_id: route.id,
        vehicle_id: route.vehicle_id,
        user_name: employees[point % 5].document_number,
        latitude: org.lat + point * 0.006,
        longitude: org.lon - point * 0.006,
        accuracy_meters: 10 + point,
        source: point === 5 ? "offline_sync" : "mobile_live_presence",
        captured_at: iso(route.route_date, `1${point}:20`),
        metadata: { demo_seed: true, offline_recovered: point === 5 }
      });
    }
  }
  await request(`/rest/v1/time_punches?company_id=eq.${company_id}&metadata->>demo_seed=eq.true`, { method: "DELETE" }).catch(() => null);
  await request(`/rest/v1/gps_pings?company_id=eq.${company_id}&metadata->>demo_seed=eq.true`, { method: "DELETE" }).catch(() => null);
  await upsert("time_punches", punches, "id");
  await upsert("gps_pings", gps, "id");

  const statuses = ["pendiente", "en_curso", "inspeccion", "ejecucion", "cerrada", "no_ejecutada", "cerrada", "cancelada"];
  const orders = await upsert("service_orders", statuses.map((status, index) => ({
    company_id,
    number: `${org.prefix}-OS-${String(index + 1).padStart(3, "0")}`,
    reference_id: references[index].id,
    technician_employee_id: employees[index % 5].id,
    service_type: index % 3 === 0 ? "ambos" : index % 2 === 0 ? "desmontaje" : "montaje",
    status,
    customer_name: `Cliente ${org.name} ${index + 1}`,
    customer_address: `${org.city} Calle ${20 + index} # ${10 + index}-${30 + index}`,
    customer_phone: `30055510${String(index).padStart(2, "0")}`,
    invoice_number: `FAC-${org.prefix}-${1000 + index}`,
    scheduled_date: dateOffset(index - 4),
    started_at: ["en_curso", "inspeccion", "ejecucion", "cerrada", "no_ejecutada"].includes(status) ? iso(dateOffset(index - 4), "09:10") : null,
    closed_at: ["cerrada", "no_ejecutada"].includes(status) ? iso(dateOffset(index - 4), "16:40") : null,
    start_latitude: org.lat + index * 0.01,
    start_longitude: org.lon - index * 0.01,
    close_latitude: org.lat + index * 0.012,
    close_longitude: org.lon - index * 0.012,
    duration_minutes: ["cerrada", "no_ejecutada"].includes(status) ? 450 : null,
    no_execution_reason: status === "no_ejecutada" ? "Cliente ausente en sitio" : null,
    metadata: { demo_seed: true, scenario: status }
  })), "company_id,number");

  await request(`/rest/v1/service_incidents?company_id=eq.${company_id}&metadata->>demo_seed=eq.true`, { method: "DELETE" }).catch(() => null);
  await request(`/rest/v1/service_evidence?company_id=eq.${company_id}&metadata->>demo_seed=eq.true`, { method: "DELETE" }).catch(() => null);

  const incidents = [];
  const evidence = [];
  for (const order of orders) {
    if (["inspeccion", "ejecucion", "cerrada", "no_ejecutada"].includes(order.status)) {
      incidents.push({
        company_id,
        order_id: order.id,
        type: order.status === "no_ejecutada" ? "no_ejecucion" : "novedad_operativa",
        description: order.status === "no_ejecutada" ? "No fue posible ejecutar por ausencia del cliente." : "Se valida estado del producto y piezas requeridas.",
        action: order.status === "no_ejecutada" ? "Reprogramar" : "Continuar con evidencia fotografica",
        metadata: { demo_seed: true }
      });
    }
    const types = order.status === "no_ejecutada" ? ["no_ejecutada"] : ["fachada", "producto_abierto", "producto_cerrado", "cliente", "firma_cliente"];
    for (const type of types.slice(0, order.status === "cerrada" ? 5 : 2)) {
      evidence.push({
        company_id,
        order_id: order.id,
        evidence_type: type,
        file_url: `seed://${org.prefix.toLowerCase()}/${order.number}/${type}.webp`,
        storage_bucket: "service-images",
        storage_path: `${company_id}/${order.id}/${type}.webp`,
        mime_type: "image/webp",
        size_bytes: 120000,
        metadata: { demo_seed: true, file_name: `${order.number}-${type}.webp` }
      });
    }
  }
  await upsert("service_incidents", incidents, "id");
  await upsert("service_evidence", evidence, "id");

  return {
    company: org.name,
    admin: adminEmail,
    password: DEMO_PASSWORD,
    employees: employees.length,
    technicians: employees.filter((employee) => employee.position === "tecnico").length,
    vehicles: vehicles.length,
    references: references.length,
    routes: routes.length,
    punches: punches.length,
    gps: gps.length,
    orders: orders.length
  };
}

async function main() {
  requireEnv();
  const results = [];
  for (const org of ORGS) results.push(await seedOrg(org));
  console.log(JSON.stringify({ ok: true, environment: "Supabase QA", results }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
