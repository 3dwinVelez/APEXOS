const fs = require("fs");

const DEMO_BATCH = "apexos_initial_demo";
const DEMO_PASSWORD = "ApexOS-Demo-2026!";
const TARGET_COMPANY_NAME = process.env.SUPABASE_DEMO_COMPANY || "SCJ";
const MODULES_TO_ENABLE = ["configuracion", "administracion_apex", "talento_humano", "transporte", "servicios"];
const OPTIONAL_OPERATIONAL_TABLES = [
  "service_references",
  "service_reference_parts",
  "vehicles",
  "vehicle_documents",
  "operational_routes",
  "route_assignments",
  "time_punches",
  "gps_pings",
  "service_orders",
  "service_incidents",
  "service_evidence",
  "route_preoperational_checklists",
  "route_preoperational_checklist_answers",
  "route_preoperational_findings",
  "route_start_authorizations",
  "route_block_events"
];

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
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Configura NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.");
}

const headers = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json"
};

function demoMeta(extra = {}) {
  return { is_demo: true, demo_batch: DEMO_BATCH, ...extra };
}

async function request(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) }
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    const detail = body?.message || body?.error_description || body?.error || text || response.statusText;
    throw new Error(`${options.method || "GET"} ${path} -> ${response.status}: ${detail}`);
  }
  return body;
}

async function maybeRequest(path, options = {}) {
  try {
    return await request(path, options);
  } catch {
    return null;
  }
}

function eq(value) {
  return encodeURIComponent(value);
}

async function tableExists(table) {
  try {
    await request(`/rest/v1/${table}?select=id&limit=1`);
    return true;
  } catch (error) {
    return !String(error.message).includes("Could not find the table");
  }
}

async function findOne(table, filter, select = "*") {
  const rows = await request(`/rest/v1/${table}?select=${select}&${filter}&limit=1`);
  return rows[0] || null;
}

async function insert(table, rows) {
  return request(`/rest/v1/${table}?select=*`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(rows)
  });
}

async function update(table, filter, values) {
  const rows = await request(`/rest/v1/${table}?${filter}&select=*`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(values)
  });
  return rows[0] || null;
}

async function upsert(table, rows, conflict) {
  return request(`/rest/v1/${table}?on_conflict=${conflict}&select=*`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(rows)
  });
}

async function ensureBucket(id, allowedMimeTypes) {
  const current = await maybeRequest(`/storage/v1/bucket/${id}`);
  if (current) return current;
  return request("/storage/v1/bucket", {
    method: "POST",
    body: JSON.stringify({
      id,
      name: id,
      public: false,
      file_size_limit: 10 * 1024 * 1024,
      allowed_mime_types: allowedMimeTypes
    })
  });
}

async function getAuthUsers() {
  const body = await request("/auth/v1/admin/users?page=1&per_page=200");
  return Array.isArray(body?.users) ? body.users : [];
}

async function ensureAuthUser(user, existingUsers) {
  const found = existingUsers.find((item) => item.email?.toLowerCase() === user.email.toLowerCase());
  if (found) return found;
  return request("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({
      email: user.email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: {
        full_name: user.name,
        is_demo: true,
        demo_batch: DEMO_BATCH,
        demo_role: user.roleLabel
      }
    })
  });
}

async function ensureCompany() {
  const target = await findOne("companies", `name=eq.${eq(TARGET_COMPANY_NAME)}`);
  if (target) return target;

  const name = "Empresa Demo APEX-OS";
  const existing = await findOne("companies", `name=eq.${eq(name)}`);
  if (existing) {
    return update("companies", `id=eq.${existing.id}`, {
      legal_name: "Empresa Demo APEX-OS S.A.S.",
      tax_id: "900000000-0",
      email: "contacto@demo.apexos.local",
      phone: "+57 300 000 0000",
      status: "active"
    });
  }
  const rows = await insert("companies", [{
    name,
    legal_name: "Empresa Demo APEX-OS S.A.S.",
    tax_id: "900000000-0",
    email: "contacto@demo.apexos.local",
    phone: "+57 300 000 0000",
    status: "active"
  }]);
  return rows[0];
}

async function ensureModules(companyId) {
  const modules = await request(`/rest/v1/modules?select=id,code&code=in.(${MODULES_TO_ENABLE.join(",")})`);
  const rows = modules.map((module) => ({
    company_id: companyId,
    module_id: module.id,
    enabled: true,
    source: "manual"
  }));
  await upsert("company_modules", rows, "company_id,module_id");
  return modules;
}

async function ensureUsers(companyId) {
  const users = [
    { email: "admin.demo@demo.apexos.local", name: "Admin Demo APEX-OS", role: "owner", roleLabel: "admin" },
    { email: "coordinador.logistico@demo.apexos.local", name: "Coordinador Logistico Demo", role: "admin", roleLabel: "coordinador_logistico" },
    { email: "conductor.demo@demo.apexos.local", name: "Conductor Demo", role: "member", roleLabel: "conductor" },
    { email: "operador.demo@demo.apexos.local", name: "Operador Demo", role: "member", roleLabel: "operador" },
    { email: "auditor.demo@demo.apexos.local", name: "Auditor Demo", role: "viewer", roleLabel: "auditor" },
    { email: "sst.demo@demo.apexos.local", name: "SST Demo", role: "member", roleLabel: "sst" },
    { email: "piloto.norte@demo.apexos.local", name: "Piloto Demo Norte", role: "member", roleLabel: "conductor" },
    { email: "piloto.centro@demo.apexos.local", name: "Piloto Demo Centro", role: "member", roleLabel: "conductor" },
    { email: "auxiliar.conductor@demo.apexos.local", name: "Auxiliar Conductor Demo", role: "member", roleLabel: "auxiliar_conductor" }
  ];
  const authUsers = await getAuthUsers();
  const ensured = [];
  for (const user of users) {
    const authUser = await ensureAuthUser(user, authUsers);
    const [firstName, ...lastName] = user.name.split(" ");
    await upsert("profiles", [{
      id: authUser.id,
      full_name: user.name,
      email: user.email,
      status: "active"
    }], "id");
    await upsert("company_users", [{
      company_id: companyId,
      user_id: authUser.id,
      role: user.role,
      status: "active"
    }], "company_id,user_id");
    ensured.push({ ...user, id: authUser.id, firstName, lastName: lastName.join(" ") || "Demo" });
  }
  return ensured;
}

async function ensureEmployees(companyId, users) {
  const rows = users.map((user, index) => ({
    company_id: companyId,
    user_id: user.id,
    first_name: user.firstName,
    last_name: user.lastName,
    document_type: "CC",
    document_number: index < 6
      ? `DEMO-${String(index + 1).padStart(4, "0")}`
      : `${user.roleLabel === "auxiliar_conductor" ? "AUX" : "PIL"}-${String(index - 5).padStart(4, "0")}`,
    email: user.email,
    phone: `30000000${index}`,
    position: user.roleLabel,
    department: user.roleLabel === "conductor" ? "Operacion" : "Administracion",
    hire_date: "2026-05-01",
    status: "active",
    user_type: user.roleLabel === "conductor" ? "conductor" : "operario",
    metadata: demoMeta({
      code: `${user.roleLabel === "conductor" ? "PIL" : user.roleLabel === "auxiliar_conductor" ? "AUX" : "USR"}-DEMO-${String(index + 1).padStart(3, "0")}`,
      name: `${user.firstName} ${user.lastName}`.trim(),
      document: index < 6
        ? `DEMO-${String(index + 1).padStart(4, "0")}`
        : `${user.roleLabel === "auxiliar_conductor" ? "AUX" : "PIL"}-${String(index - 5).padStart(4, "0")}`,
      role_label: user.roleLabel,
      user_type: user.roleLabel === "conductor" || user.roleLabel === "auxiliar_conductor" ? user.roleLabel : "operario",
      classification: user.roleLabel
    })
  }));
  return upsert("employees", rows, "company_id,document_number");
}

async function ensureVehicles(companyId) {
  const vehicles = await upsert("vehicles", [
    {
      company_id: companyId,
      plate: "DEM001",
      brand: "Chevrolet",
      model: "NPR Demo",
      type: "camion",
      year: 2024,
      color: "Blanco",
      mileage: 12500,
      owner: "Empresa Demo APEX-OS",
      status: "active",
      document_status: "vigente",
      master_status: "activo",
      metadata: demoMeta({ scenario: "documentalmente_apto" })
    },
    {
      company_id: companyId,
      plate: "DEM002",
      brand: "Renault",
      model: "Kangoo Demo",
      type: "van",
      year: 2023,
      color: "Gris",
      mileage: 21300,
      owner: "Empresa Demo APEX-OS",
      status: "active",
      document_status: "proximo_vencer",
      master_status: "activo",
      metadata: demoMeta({ scenario: "documento_proximo_vencer" })
    },
    {
      company_id: companyId,
      plate: "DEM003",
      brand: "Hino",
      model: "Dutro Demo",
      type: "camion",
      year: 2022,
      color: "Azul",
      mileage: 39800,
      owner: "Empresa Demo APEX-OS",
      status: "maintenance",
      document_status: "vencido",
      master_status: "bloqueado",
      metadata: demoMeta({ scenario: "bloqueado_documento_vencido" })
    }
  ], "company_id,plate");

  const documentRows = vehicles.map((vehicle, index) => ({
    company_id: companyId,
    vehicle_id: vehicle.id,
    plate: vehicle.plate,
    document_type: index === 0 ? "soat" : index === 1 ? "tecnomecanica" : "poliza",
    file_name: `${vehicle.plate}-documento-demo.pdf`,
    issued_at: "2026-01-01",
    expires_at: index === 0 ? "2026-12-31" : index === 1 ? "2026-06-15" : "2026-04-30",
    document_status: index === 0 ? "vigente" : index === 1 ? "proximo_vencer" : "vencido",
    storage_path: `company/${companyId}/module/vehicles/entity/${vehicle.id}/files/${vehicle.plate}-placeholder.pdf`,
    observations: "Documento dummy demo. No contiene archivo real.",
    metadata: demoMeta({ placeholder: true })
  }));
  await maybeRequest(`/rest/v1/vehicle_documents?company_id=eq.${companyId}&metadata->>demo_batch=eq.${DEMO_BATCH}`, { method: "DELETE" });
  await insert("vehicle_documents", documentRows);
  return vehicles;
}

async function ensureServiceReferences(companyId) {
  const refs = await upsert("service_references", [
    {
      company_id: companyId,
      code: "REF-DEMO-001",
      name: "Instalacion kit estandar demo",
      category: "instalacion",
      description: "Referencia demo con lista de piezas y guias tecnicas.",
      estimated_minutes: 90,
      brand: "APEX Demo",
      model: "KIT-STD",
      active: true,
      metadata: demoMeta({
        manuals: [
          {
            name: "Guia instalacion KIT-STD.pdf",
            storage_path: `company/${companyId}/module/services/entity/REF-DEMO-001/files/guia-kit-std-placeholder.pdf`,
            mime_type: "application/pdf",
            placeholder: true
          }
        ]
      })
    },
    {
      company_id: companyId,
      code: "REF-DEMO-002",
      name: "Revision tecnica demo",
      category: "revision",
      description: "Referencia demo para validacion de piezas antes del cierre.",
      estimated_minutes: 45,
      brand: "APEX Demo",
      model: "REV-01",
      active: true,
      metadata: demoMeta()
    }
  ], "company_id,code");

  await maybeRequest(`/rest/v1/service_reference_parts?company_id=eq.${companyId}`, { method: "DELETE" });
  await insert("service_reference_parts", [
    { company_id: companyId, reference_id: refs[0].id, name: "Modulo principal", quantity: 1, unit: "und", display_order: 1 },
    { company_id: companyId, reference_id: refs[0].id, name: "Cableado certificado", quantity: 2, unit: "und", display_order: 2 },
    { company_id: companyId, reference_id: refs[1].id, name: "Checklist visual", quantity: 1, unit: "und", display_order: 1 }
  ]);
  return refs;
}

async function ensureOperations(companyId, employees, vehicles, refs) {
  const conductor = employees.find((employee) => employee.metadata?.code === "PIL-DEMO-007")
    || employees.find((employee) => employee.position === "conductor")
    || employees[2];
  const segundoConductor = employees.find((employee) => employee.metadata?.code === "PIL-DEMO-008") || conductor;
  const operador = employees.find((employee) => employee.metadata?.code === "AUX-DEMO-009")
    || employees.find((employee) => employee.position === "operador")
    || employees[3];
  const routes = await upsert("operational_routes", [
    { company_id: companyId, code: "RUTA-DEMO-001", route_date: "2026-05-20", vehicle_id: vehicles[0].id, vehicle_plate: vehicles[0].plate, start_time: "08:00", end_time: "17:00", status: "planned", notes: "Ruta demo programada", metadata: demoMeta() },
    { company_id: companyId, code: "RUTA-DEMO-002", route_date: "2026-05-20", vehicle_id: vehicles[1].id, vehicle_plate: vehicles[1].plate, start_time: "09:00", end_time: "18:00", status: "active", notes: "Ruta demo en proceso", metadata: demoMeta() },
    { company_id: companyId, code: "RUTA-DEMO-003", route_date: "2026-05-19", vehicle_id: vehicles[0].id, vehicle_plate: vehicles[0].plate, start_time: "07:30", end_time: "16:30", status: "closed", notes: "Ruta demo finalizada", metadata: demoMeta() },
    { company_id: companyId, code: "RUTA-DEMO-004", route_date: "2026-05-20", vehicle_id: vehicles[2].id, vehicle_plate: vehicles[2].plate, start_time: "10:00", end_time: "16:00", status: "cancelled", notes: "Ruta demo bloqueada por documento", metadata: demoMeta({ blocked: true }) }
  ], "company_id,code");

  await maybeRequest(`/rest/v1/route_assignments?company_id=eq.${companyId}`, { method: "DELETE" });
  await insert("route_assignments", [
    { company_id: companyId, route_id: routes[0].id, employee_id: conductor.id, role: "conductor", status: "active" },
    { company_id: companyId, route_id: routes[0].id, employee_id: operador.id, role: "auxiliar", status: "active" },
    { company_id: companyId, route_id: routes[1].id, employee_id: segundoConductor.id, role: "conductor", status: "active" },
    { company_id: companyId, route_id: routes[1].id, employee_id: operador.id, role: "auxiliar", status: "active" },
    { company_id: companyId, route_id: routes[2].id, employee_id: conductor.id, role: "conductor", status: "active" },
    { company_id: companyId, route_id: routes[2].id, employee_id: segundoConductor.id, role: "conductor", status: "active" }
  ]);

  await maybeRequest(`/rest/v1/time_punches?company_id=eq.${companyId}&metadata->>demo_batch=eq.${DEMO_BATCH}`, { method: "DELETE" });
  await insert("time_punches", [
    { company_id: companyId, employee_id: conductor.id, user_id: conductor.user_id, route_id: routes[1].id, vehicle_id: vehicles[1].id, user_name: `${conductor.first_name} ${conductor.last_name}`, punch_type: "entrada", punched_at: "2026-05-20T13:00:00Z", punch_date: "2026-05-20", punch_time: "08:00:00", latitude: 4.711, longitude: -74.072, extra_minutes: 0, extra_reason: null, extra_detail: null, metadata: demoMeta() },
    { company_id: companyId, employee_id: conductor.id, user_id: conductor.user_id, route_id: routes[1].id, vehicle_id: vehicles[1].id, user_name: `${conductor.first_name} ${conductor.last_name}`, punch_type: "salida", punched_at: "2026-05-20T22:15:00Z", punch_date: "2026-05-20", punch_time: "17:15:00", extra_minutes: 15, extra_reason: "novedad_operativa", extra_detail: "Demora demo por validacion de servicio.", latitude: 4.711, longitude: -74.072, metadata: demoMeta({ novelty: true }) }
  ]);

  await maybeRequest(`/rest/v1/gps_pings?company_id=eq.${companyId}&metadata->>demo_batch=eq.${DEMO_BATCH}`, { method: "DELETE" });
  await insert("gps_pings", [
    { company_id: companyId, employee_id: conductor.id, user_id: conductor.user_id, route_id: routes[1].id, vehicle_id: vehicles[1].id, user_name: `${conductor.first_name} ${conductor.last_name}`, latitude: 4.711, longitude: -74.072, captured_at: "2026-05-20T14:00:00Z", metadata: demoMeta() }
  ]);

  const orders = await upsert("service_orders", [
    { company_id: companyId, number: "SER-DEMO-001", reference_id: refs[0].id, technician_employee_id: conductor.id, technician_user_id: conductor.user_id, service_type: "instalacion", status: "pendiente", customer_name: "Cliente Demo Norte", customer_address: "Calle Demo 123", customer_phone: "3000000001", scheduled_date: "2026-05-20", started_at: null, closed_at: null, duration_minutes: null, metadata: demoMeta() },
    { company_id: companyId, number: "SER-DEMO-002", reference_id: refs[0].id, technician_employee_id: conductor.id, technician_user_id: conductor.user_id, service_type: "instalacion", status: "en_curso", customer_name: "Cliente Demo Centro", customer_address: "Carrera Demo 45", customer_phone: "3000000002", scheduled_date: "2026-05-20", started_at: "2026-05-20T14:30:00Z", closed_at: null, duration_minutes: null, metadata: demoMeta() },
    { company_id: companyId, number: "SER-DEMO-003", reference_id: refs[1].id, technician_employee_id: operador.id, technician_user_id: operador.user_id, service_type: "revision", status: "cerrada", customer_name: "Cliente Demo Sur", customer_address: "Avenida Demo 78", customer_phone: "3000000003", scheduled_date: "2026-05-19", started_at: "2026-05-19T14:00:00Z", closed_at: "2026-05-19T15:00:00Z", duration_minutes: 60, metadata: demoMeta() }
  ], "company_id,number");

  await maybeRequest(`/rest/v1/service_evidence?company_id=eq.${companyId}&metadata->>demo_batch=eq.${DEMO_BATCH}`, { method: "DELETE" });
  await insert("service_evidence", [{
    company_id: companyId,
    order_id: orders[2].id,
    evidence_type: "producto_cerrado",
    file_url: `seed://${DEMO_BATCH}/SER-DEMO-003/producto-cerrado.webp`,
    storage_bucket: "service-images",
    storage_path: `${companyId}/${orders[2].id}/producto-cerrado-placeholder.webp`,
    mime_type: "image/webp",
    size_bytes: 0,
    metadata: demoMeta({ placeholder: true })
  }]);

  await maybeRequest(`/rest/v1/service_incidents?company_id=eq.${companyId}&metadata->>demo_batch=eq.${DEMO_BATCH}`, { method: "DELETE" });
  await insert("service_incidents", [{
    company_id: companyId,
    order_id: orders[1].id,
    type: "novedad",
    description: "Novedad demo para validar tablero y trazabilidad.",
    action: "Pendiente validacion coordinador",
    metadata: demoMeta()
  }]);

  await seedPreoperational(companyId, conductor, vehicles[2], routes[3]);
  return { routes, orders };
}

async function seedPreoperational(companyId, driver, vehicle, route) {
  await maybeRequest(`/rest/v1/route_preoperational_checklists?company_id=eq.${companyId}&metadata->>demo_batch=eq.${DEMO_BATCH}`, { method: "DELETE" });
  const [checklist] = await insert("route_preoperational_checklists", [{
    company_id: companyId,
    route_id: route.id,
    driver_id: driver.id,
    driver_name: `${driver.first_name} ${driver.last_name}`,
    user_id: driver.user_id,
    vehicle_id: vehicle.id,
    plate: vehicle.plate,
    sede: "Sede Demo Principal",
    checklist_status: "bloqueado",
    risk_level: "alto",
    started_at: "2026-05-20T13:30:00Z",
    blocked_at: "2026-05-20T13:45:00Z",
    observations: "Checklist demo bloqueado por documento vencido.",
    metadata: demoMeta()
  }]);

  await insert("route_preoperational_checklist_answers", [
    { company_id: companyId, checklist_id: checklist.id, section: "documentos", item_key: "soat", label: "SOAT vigente", answer: "no", severity: "alta", blocks_route: true, evidence_required: true, observations: "Documento demo vencido." },
    { company_id: companyId, checklist_id: checklist.id, section: "seguridad", item_key: "luces", label: "Luces funcionales", answer: "si", severity: "baja", blocks_route: false, evidence_required: false, observations: null }
  ]);
  await insert("route_preoperational_findings", [{
    company_id: companyId,
    checklist_id: checklist.id,
    route_id: route.id,
    plate: vehicle.plate,
    driver_id: driver.id,
    item_key: "soat",
    finding_type: "documental",
    severity: "alta",
    description: "Hallazgo demo: documento vencido bloquea inicio de ruta.",
    action_taken: "Bloquear ruta demo.",
    status: "abierta"
  }]);
  await insert("route_start_authorizations", [{
    company_id: companyId,
    route_id: route.id,
    checklist_id: checklist.id,
    driver_id: driver.id,
    plate: vehicle.plate,
    status: "bloqueada",
    reason: "Documento demo vencido.",
    metadata: demoMeta()
  }]);
  await insert("route_block_events", [{
    company_id: companyId,
    route_id: route.id,
    checklist_id: checklist.id,
    driver_id: driver.id,
    plate: vehicle.plate,
    reason: "Documento demo vencido.",
    severity: "alta",
    created_by: driver.user_id,
    metadata: demoMeta()
  }]);
}

async function main() {
  const missing = [];
  for (const table of OPTIONAL_OPERATIONAL_TABLES) {
    if (!(await tableExists(table))) missing.push(table);
  }

  const company = await ensureCompany();
  await ensureModules(company.id);
  const users = await ensureUsers(company.id);

  await ensureBucket("vehicle-documents", ["application/pdf", "image/png", "image/jpeg", "image/webp"]);
  await ensureBucket("user-documents", ["application/pdf", "image/png", "image/jpeg", "image/webp"]);
  await ensureBucket("route-evidence", ["application/pdf", "image/png", "image/jpeg", "image/webp"]);
  await ensureBucket("general-attachments", ["application/pdf", "image/png", "image/jpeg", "image/webp", "text/csv"]);
  await ensureBucket("accounting-documents", ["application/pdf", "image/png", "image/jpeg", "image/webp", "text/csv", "application/xml"]);

  if (missing.length) {
    console.log(JSON.stringify({
      status: "partial",
      message: "Se crearon/validaron empresa objetivo, modulos, usuarios demo y buckets. Aplica las migraciones operativas antes de sembrar operaciones.",
      company_id: company.id,
      company_name: company.name,
      demo_users: users.map((user) => user.email),
      demo_password: DEMO_PASSWORD,
      missing_tables: missing
    }, null, 2));
    process.exitCode = 2;
    return;
  }

  const employees = await ensureEmployees(company.id, users);
  const vehicles = await ensureVehicles(company.id);
  const refs = await ensureServiceReferences(company.id);
  const operations = await ensureOperations(company.id, employees, vehicles, refs);

  console.log(JSON.stringify({
    status: "ok",
    company_id: company.id,
    company_name: company.name,
    demo_batch: DEMO_BATCH,
    demo_users: users.map((user) => user.email),
    demo_password: DEMO_PASSWORD,
    employees: employees.length,
    vehicles: vehicles.length,
    service_references: refs.length,
    routes: operations.routes.length,
    service_orders: operations.orders.length
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
