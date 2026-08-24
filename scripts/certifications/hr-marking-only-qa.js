const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function argsFrom(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    result[value.slice(2)] = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : true;
  }
  return result;
}

const args = argsFrom(process.argv.slice(2));
const envFile = path.resolve(String(args["env-file"] || "config/qa.env"));
require("../load-env")(envFile);

const prisma = require("../../apps/api/src/core/prisma");
const admin = require("../../apps/api/src/modules/admin/service");

const API_URL = String(args["api-url"] || "http://127.0.0.1:3100").replace(/\/$/, "");
const OUTPUT = path.resolve(String(args.output || "docs/qa/evidence/hr-marking-only-20260824/certification.json"));
const FIXTURE_OUTPUT = args["fixture-output"] ? path.resolve(String(args["fixture-output"])) : "";
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const EMAIL = `qa.marking.${RUN_ID}@nyvora.test`;
const PASSWORD = `Qa-Marking-${crypto.randomBytes(6).toString("hex")}#26`;
const CODE = `QA-MARK-${RUN_ID}`;
const TODAY = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function check(result, name, ok, detail = {}) {
  result.checks.push({ name, ok: Boolean(ok), detail });
  if (!ok) throw new Error(`Fallo de certificacion: ${name}`);
}

async function request(pathname, { token = "", method = "GET", body, expected = 200 } = {}) {
  const response = await fetch(`${API_URL}${pathname}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status !== expected) {
    const error = new Error(`${method} ${pathname}: esperado ${expected}, obtenido ${response.status}`);
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function nyvoraTenant() {
  const companies = await prisma.$queryRawUnsafe("select id,name,legal_name from public.companies order by name");
  const company = companies.find((item) => normalize(item.name).includes("nyvora") || normalize(item.legal_name).includes("nyvora"));
  if (!company) throw new Error("No existe la empresa modelo Nyvora en QA.");
  const tenant = await prisma.tenant.findFirst({
    where: {
      OR: [
        { name: { contains: "NYVORA", mode: "insensitive" } },
        { config: { path: ["company_id"], equals: String(company.id) } }
      ]
    }
  });
  if (!tenant) throw new Error("No existe tenant operativo Nyvora en QA.");
  return { company, tenant };
}

async function main() {
  if (![process.env.APP_ENV, process.env.TARGET_ENV].some((value) => normalize(value) === "qa")) {
    throw new Error("La certificacion solo puede ejecutarse con configuracion QA.");
  }
  const health = await request("/health");
  const { company, tenant } = await nyvoraTenant();
  const roles = await admin.listRoles(tenant.id, {}, "APEX_ADMIN");
  const role = roles.find((item) => item.name === "Empleado marcaciones");
  if (!role) throw new Error("No se creo el rol Empleado marcaciones.");

  const created = await admin.createUser(tenant.id, {
    name: `Certificacion Marcaciones ${RUN_ID}`,
    first_names: "Certificacion Marcaciones",
    last_names: RUN_ID,
    email: EMAIL,
    password: PASSWORD,
    role_id: role.id,
    company: "Nyvora",
    document: `QA${RUN_ID}`,
    code: CODE,
    department: "QA",
    position: "Empleado de pruebas",
    operational_classification: "operario",
    can_punch_time: true,
    can_be_assigned_routes: true,
    require_password_change: false
  });

  const ownRoute = await prisma.runWithTenant(tenant.id, () => prisma.timeRoute.create({
    data: {
      tenant_id: tenant.id,
      date: new Date(`${TODAY}T05:00:00.000Z`),
      vehicle_plate: "",
      employees: [EMAIL],
      start_time: "00:01",
      end_time: "23:59",
      tolerance_minutes: 15,
      per_diem: 0,
      notes: "Control de marcacion: punch_only\nCertificacion marking_only",
      status: "active"
    }
  }));
  const foreignRoute = await prisma.runWithTenant(tenant.id, () => prisma.timeRoute.create({
    data: {
      tenant_id: tenant.id,
      date: new Date(`${TODAY}T05:00:00.000Z`),
      vehicle_plate: "",
      employees: [`qa.other.${RUN_ID}@nyvora.test`],
      start_time: "00:01",
      end_time: "23:59",
      tolerance_minutes: 15,
      per_diem: 0,
      notes: "Control de marcacion: punch_only\nRuta ajena certificacion",
      status: "active"
    }
  }));

  const result = {
    change_id: "hr-marking-only-20260824",
    environment: "QA",
    company: "NYVORA",
    generated_at: new Date().toISOString(),
    api_commit: health.commit || "unknown",
    fixture: { user_id: created.id, employee_id: created.employee_id, own_route_id: ownRoute.id, foreign_route_id: foreignRoute.id },
    checks: [],
    status: "running"
  };

  try {
    const login = await request("/api/v1/auth/login", {
      method: "POST",
      body: { email: EMAIL, password: PASSWORD }
    });
    const token = login.token;
    check(result, "login_role", login.user?.role === "Empleado marcaciones", { role: login.user?.role });
    check(result, "access_profile", login.user?.role_metadata?.access_profile === "marking_only", { access_profile: login.user?.role_metadata?.access_profile });
    check(result, "permission_isolation", login.user?.role_permissions?.every((permission) => permission.module === "time_tracking"), { permissions: login.user?.role_permissions });

    const me = await request("/api/v1/hr/self", { token });
    const routes = await request("/api/v1/hr/self/routes", { token });
    check(result, "self_identity", Number(me.id) === Number(created.employee_id), { employee_id: me.id });
    check(result, "assigned_routes_only", routes.length === 1 && Number(routes[0].id) === Number(ownRoute.id), { route_ids: routes.map((route) => route.id) });

    for (const pathname of ["/api/v1/hr/employees", "/api/v1/hr/routes", "/api/v1/hr/operations-map", "/api/v1/hr/attendance"]) {
      const denied = await request(pathname, { token, expected: 403 });
      check(result, `denied_${pathname.split("/").pop()}`, denied.code === "PERMISO_DENEGADO", { code: denied.code });
    }

    const foreignDenied = await request("/api/v1/hr/self/time-punches", {
      token,
      method: "POST",
      expected: 403,
      body: { employee_id: 999999, user_name: "otro", type: "entrada", route_id: foreignRoute.id, punched_at: new Date().toISOString() }
    });
    check(result, "foreign_route_denied", foreignDenied.code === "HORARIO_AJENO_DENEGADO", { code: foreignDenied.code });

    const entry = await request("/api/v1/hr/self/time-punches", {
      token,
      method: "POST",
      body: { employee_id: 999999, user_name: "usuario-ajeno", type: "entrada", route_id: ownRoute.id, punched_at: new Date().toISOString(), metadata: { certification: RUN_ID } }
    });
    check(result, "spoofed_identity_replaced", Number(entry.punch?.employee_id) === Number(created.employee_id), { employee_id: entry.punch?.employee_id });

    const types = await request("/api/v1/hr/self/activity-types", { token });
    const activity = await request("/api/v1/hr/self/work-activities", {
      token,
      method: "POST",
      body: {
        activity_type_id: types[0].id,
        employee_id: 999999,
        user_name: "usuario-ajeno",
        route_id: ownRoute.id,
        gps_required: false,
        gps_skipped: true,
        observation: "Evidencia real de certificacion de rol exclusivo",
        photo: {
          base64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2n8sAAAAASUVORK5CYII=",
          name: `marking-${RUN_ID}.png`,
          type: "image/png",
          size: 68
        }
      }
    });
    check(result, "own_activity_created", Number(activity.employee_id) === Number(created.employee_id), { activity_id: activity.id, employee_id: activity.employee_id });

    const gps = await request("/api/v1/hr/self/gps/ping", {
      token,
      method: "POST",
      body: { employee_id: 999999, user_name: "usuario-ajeno", route_id: ownRoute.id, latitude: 4.711, longitude: -74.0721, accuracy_meters: 10, source: "qa_certification" }
    });
    check(result, "own_gps_created", Number(gps.employee_id) === Number(created.employee_id), { gps_id: gps.id, employee_id: gps.employee_id });

    for (const type of ["inicio_almuerzo", "fin_almuerzo", "salida"]) {
      const punch = await request("/api/v1/hr/self/time-punches", {
        token,
        method: "POST",
        body: { employee_id: 999999, user_name: "usuario-ajeno", type, route_id: ownRoute.id, punched_at: new Date().toISOString(), metadata: { certification: RUN_ID } }
      });
      check(result, `punch_${type}`, Number(punch.punch?.employee_id) === Number(created.employee_id), { punch_id: punch.punch?.id, next: punch.next });
    }

    const attendance = await request("/api/v1/hr/self/attendance", { token });
    const ownPunches = attendance.flatMap((row) => row.punches || []);
    check(result, "complete_marking_flow", ownPunches.length === 4 && ownPunches.every((punch) => Number(punch.employee_id) === Number(created.employee_id)), { punch_types: ownPunches.map((punch) => punch.type) });

    result.status = "passed";
    if (FIXTURE_OUTPUT) {
      fs.mkdirSync(path.dirname(FIXTURE_OUTPUT), { recursive: true });
      fs.writeFileSync(FIXTURE_OUTPUT, JSON.stringify({ email: EMAIL, password: PASSWORD, tenant_id: tenant.id, user_id: created.id, route_ids: [ownRoute.id, foreignRoute.id] }));
    } else {
      await admin.setUserActive(tenant.id, created.id, false);
      await prisma.runWithTenant(tenant.id, () => prisma.timeRoute.updateMany({ where: { id: { in: [ownRoute.id, foreignRoute.id] } }, data: { status: "inactive" } }));
    }
  } catch (error) {
    result.status = "failed";
    result.error = { message: error.message, payload: error.payload || null };
    throw error;
  } finally {
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, `${JSON.stringify(result, null, 2)}\n`);
  }

  console.log(`CERTIFICACION HR MARKING ONLY QA APROBADA: ${result.checks.length} controles`);
}

main()
  .catch((error) => {
    console.error(`CERTIFICACION HR MARKING ONLY QA FALLIDA: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
