require("./load-env")();

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:3000";
const LOGIN_EMAIL = process.env.QA_LOGIN_EMAIL || "demo@apex.local";
const LOGIN_PASSWORD = process.env.QA_LOGIN_PASSWORD || "test1234";

function nowStamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
}

function normalizeUsernameEmail(value, fallbackDomain = "apex.local") {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  return text.includes("@") ? text : `${text}@${fallbackDomain}`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, init = {}, token = "") {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.body ? { "Content-Type": "application/json" } : {})
    }
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!response.ok) {
    const detail = body?.message || body?.error || body?.code || response.statusText;
    throw new Error(`${init.method || "GET"} ${path} -> ${response.status}: ${detail}`);
  }
  return body;
}

async function login() {
  const fallbackToken = process.env.QA_ACCESS_TOKEN || process.env.APEX_TEST_TOKEN || "";
  if (fallbackToken) return fallbackToken;

  const result = await request("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: LOGIN_EMAIL, password: LOGIN_PASSWORD })
  });
  assert(result?.token, "Login exitoso sin token.");
  return result.token;
}

async function getRoles(token) {
  const roles = await request("/api/v1/admin/roles", { method: "GET" }, token);
  assert(Array.isArray(roles), "La respuesta de roles no es una lista.");
  return roles;
}

function pickRole(roles, preferredPatterns) {
  for (const pattern of preferredPatterns) {
    const match = roles.find((role) => pattern.test(String(role.name || "")) && role.active !== false);
    if (match) return match;
  }
  return roles.find((role) => role.active !== false) || roles[0];
}

function pickExactRole(roles, exactName, fallbackPatterns) {
  const exact = roles.find((role) => String(role.name || "").trim().toLowerCase() === String(exactName || "").trim().toLowerCase() && role.active !== false);
  return exact || pickRole(roles, fallbackPatterns);
}

async function listUsers(token) {
  const users = await request("/api/v1/admin/users", { method: "GET" }, token);
  assert(Array.isArray(users), "La respuesta de usuarios no es una lista.");
  return users;
}

async function createUser(token, payload) {
  return request("/api/v1/admin/users", {
    method: "POST",
    body: JSON.stringify(payload)
  }, token);
}

async function updateUser(token, id, payload) {
  return request(`/api/v1/admin/users/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  }, token);
}

async function setStatus(token, id, active) {
  return request(`/api/v1/admin/users/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ active })
  }, token);
}

async function loginAs(email, password) {
  const result = await request("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  assert(result?.token, `Login sin token para ${email}.`);
  return result.token;
}

function findByEmail(users, email) {
  return users.find((user) => String(user.email || "").toLowerCase() === String(email || "").toLowerCase());
}

function ensureUserShape(user, expectations) {
  assert(user, `No se encontro el usuario ${expectations.email}.`);
  assert(String(user.profile_kind || "") === expectations.profileKind, `profile_kind incorrecto para ${expectations.email}.`);
  assert(String(user.email || "") === expectations.email, `email incorrecto para ${expectations.email}.`);
  assert(String(user.access_email || "") === expectations.email, `access_email incorrecto para ${expectations.email}.`);
  assert(String(user.role_name || ""), `role_name vacio para ${expectations.email}.`);
  assert(String(user.contract_type || "") === expectations.contractType, `contract_type incorrecto para ${expectations.email}.`);
  assert(String(user.engagement_type || "") === expectations.engagementType, `engagement_type incorrecto para ${expectations.email}.`);
}

async function main() {
  const token = await login();
  const roles = await getRoles(token);
  const initialUsers = await listUsers(token);
  const stamp = nowStamp();
  const techUsername = `qa.tech.${stamp}`;
  const employeeUsername = `qa.emp.${stamp}`;
  const techEmail = normalizeUsernameEmail(techUsername);
  const employeeEmail = normalizeUsernameEmail(employeeUsername);

  const techRole = pickExactRole(roles, "Tecnico", [/tecnico/i, /operativo/i, /auxiliar/i]);
  const employeeRole = pickExactRole(roles, "Empleado", [/empleado/i, /operativo/i, /auxiliar/i]);

  const techPayload = {
    profile_kind: "tecnico",
    user_kind: "tecnico",
    tipo_usuario: "tecnico",
    name: techUsername,
    first_names: techUsername,
    last_names: "Tecnico",
    document: `CC-${stamp}-TEC`,
    position: "Tecnico de servicios",
    email: techUsername,
    access_email: techUsername,
    password: "ApexQa2026!",
    role_id: techRole?.id,
    role_name: techRole?.name || "Tecnico",
    company: "APEX",
    user_status: "activo",
    operational_classification: "tecnico",
    engagement_type: "contratista",
    contract_type: "service",
    site: "SEDE-PRINCIPAL",
    base_site: "SEDE-PRINCIPAL",
    area: "SERV",
    department: "Servicios",
    phone: "3000000001",
    can_receive_services: true,
    can_be_assigned_routes: false,
    can_manage_inventory: false,
    can_approve_documents: false,
    can_authorize_exceptions: false,
    session_status: "sin_sesion"
  };

  const employeePayload = {
    profile_kind: "empleado",
    user_kind: "empleado",
    tipo_usuario: "empleado",
    name: `${employeeUsername} User`,
    first_names: employeeUsername,
    last_names: "User",
    email: employeeUsername,
    access_email: employeeUsername,
    password: "ApexQa2026!",
    role_id: employeeRole?.id,
    role_name: employeeRole?.name || "Empleado",
    company: "APEX",
    user_status: "activo",
    operational_classification: "administrativo",
    engagement_type: "empleado",
    contract_type: "indefinite",
    site: "SEDE-PRINCIPAL",
    base_site: "SEDE-PRINCIPAL",
    area: "OPER",
    department: "Operacion",
    phone: "3000000002",
    document: `CC-${stamp}-EMP`,
    position: "Auxiliar operativo",
    cost_center: "CC-OPER",
    base_shift: "DIURNO",
    hire_date: new Date().toISOString().slice(0, 10),
    can_receive_services: false,
    can_be_assigned_routes: false,
    can_manage_inventory: false,
    can_approve_documents: false,
    can_authorize_exceptions: false,
    session_status: "sin_sesion"
  };

  const techCreated = await createUser(token, techPayload);
  const employeeCreated = await createUser(token, employeePayload);

  const techListAfterCreate = await listUsers(token);
  const tech = findByEmail(techListAfterCreate, techEmail);
  const employee = findByEmail(techListAfterCreate, employeeEmail);

  ensureUserShape(tech, { email: techEmail, profileKind: "tecnico", contractType: "service", engagementType: "contratista" });
  ensureUserShape(employee, { email: employeeEmail, profileKind: "empleado", contractType: "indefinite", engagementType: "empleado" });

  assert(String(tech?.phone || "") === "3000000001", "El telefono del tecnico no quedo guardado.");
  assert(String(employee?.phone || "") === "3000000002", "El telefono del empleado no quedo guardado.");
  assert(String(tech?.role_name || "") === String(techRole?.name || tech?.role_name || ""), "El rol del tecnico no coincide con el esperado.");
  assert(String(employee?.role_name || "") === String(employeeRole?.name || employee?.role_name || ""), "El rol del empleado no coincide con el esperado.");

  const techUpdated = await updateUser(token, tech.id, {
    phone: "3110000001",
    operation_zone: "NORTE",
    base_site: "SEDE-PRINCIPAL",
    access_email: techUsername,
    email: techUsername
  });
  assert(String(techUpdated.access_email || "") === techEmail, "El tecnico actualizado perdio la normalizacion de correo.");

  const employeeUpdated = await updateUser(token, employee.id, {
    phone: "3110000002",
    email: employeeUsername,
    access_email: employeeUsername
  });
  assert(String(employeeUpdated.cost_center || "") === "CC-OPER", "El centro de costo del empleado se perdio al actualizar.");
  assert(String(employeeUpdated.base_shift || "") === "DIURNO", "El turno base del empleado se perdio al actualizar.");

  const employeeInactive = await setStatus(token, employee.id, false);
  assert(employeeInactive?.activo === false || employeeInactive?.active === false, "No se pudo inactivar al empleado.");
  const employeeActive = await setStatus(token, employee.id, true);
  assert(employeeActive?.activo === true || employeeActive?.active === true, "No se pudo reactivar al empleado.");

  const finalUsers = await listUsers(token);
  const finalTech = findByEmail(finalUsers, techEmail);
  const finalEmployee = findByEmail(finalUsers, employeeEmail);

  const technicianToken = await loginAs(techEmail, "ApexQa2026!");
  const employeeToken = await loginAs(employeeEmail, "ApexQa2026!");
  const technicianServices = await request("/api/v1/services/orders", { method: "GET" }, technicianToken);
  const employeeWorkdays = await request("/api/v1/hr/workdays", { method: "GET" }, employeeToken);

  ensureUserShape(finalTech, { email: techEmail, profileKind: "tecnico", contractType: "service", engagementType: "contratista" });
  ensureUserShape(finalEmployee, { email: employeeEmail, profileKind: "empleado", contractType: "indefinite", engagementType: "empleado" });
  assert(String(finalTech.role_name || "") === "Tecnico", `El tecnico quedo con rol incorrecto: ${finalTech.role_name || ""}.`);
  assert(Array.isArray(technicianServices?.data || technicianServices), "El tecnico no puede consultar servicios correctamente.");
  assert(Array.isArray(employeeWorkdays), "El empleado no puede consultar jornadas correctamente.");
  assert(finalUsers.length >= initialUsers.length + 2, "No aumentó el total de usuarios como se esperaba.");

  console.log(JSON.stringify({
    ok: true,
    token_source: process.env.QA_ACCESS_TOKEN || process.env.APEX_TEST_TOKEN ? "env" : "login",
    initial_users: initialUsers.length,
    final_users: finalUsers.length,
    created: [
      { id: techCreated.id, email: techEmail, role: techRole?.name || techCreated.role_name },
      { id: employeeCreated.id, email: employeeEmail, role: employeeRole?.name || employeeCreated.role_name }
    ],
    validated: {
      tecnico: { id: finalTech.id, access_email: finalTech.access_email, profile_kind: finalTech.profile_kind },
      empleado: { id: finalEmployee.id, access_email: finalEmployee.access_email, profile_kind: finalEmployee.profile_kind }
    },
    runtime_access: {
      tecnico_services_ok: true,
      empleado_workdays_ok: true
    }
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
