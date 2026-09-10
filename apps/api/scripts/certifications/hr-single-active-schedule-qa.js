const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const bcrypt = require("bcrypt");
const prisma = require("../../src/core/prisma");

const API_URL = String(process.env.CERTIFICATION_API_URL || "").replace(/\/$/, "");
const EXPECTED_COMMIT = String(process.env.CERTIFICATION_EXPECTED_COMMIT || "");
const OUTPUT = path.resolve(process.env.CERTIFICATION_OUTPUT || "docs/qa/evidence/hr-single-active-schedule-20260910/qa-certification.json");
const TENANT_ID = "cbbf3627-4336-4f23-95c6-1077414bcd17";
const EMAIL = "qa.hr.single.schedule@internal.apexos.local";
const RUN_ID = `hr_single_active_schedule_${Date.now()}`;
const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

async function api(pathname, { token = "", method = "GET", body } = {}) {
  const response = await fetch(`${API_URL}${pathname}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30000)
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function main() {
  assert.match(API_URL, /apexos-api-qa-production\.up\.railway\.app$/, "El API debe ser QA.");
  assert.ok(EXPECTED_COMMIT, "CERTIFICATION_EXPECTED_COMMIT es obligatorio.");
  assert.ok(String(process.env.DATABASE_URL || "").includes("jbirkghkekuifgfsgquq"), "DATABASE_URL debe corresponder a Supabase QA.");
  const evidence = { certification: "hr-single-active-schedule-qa", run_id: RUN_ID, environment: "QA", tenant: "SCJ", expected_commit: EXPECTED_COMMIT, status: "running", generated_at: new Date().toISOString() };
  const routeIds = [];
  let user;
  let employee;
  try {
    const health = await api("/health");
    assert.equal(health.response.status, 200);
    assert.equal(String(health.payload.commit), EXPECTED_COMMIT.slice(0, 12), "QA no ejecuta el commit esperado.");
    evidence.deployed_commit = health.payload.commit;
    const tenant = await prisma.tenant.findUnique({ where: { id: TENANT_ID } });
    assert.ok(tenant?.active, "Tenant SCJ no disponible.");
    const role = await prisma.role.findFirst({ where: { tenant_id: TENANT_ID, permissions: { some: { module: "time_tracking", action: "write" } } } });
    assert.ok(role, "SCJ no tiene rol autorizado para marcaciones.");
    const password = `Qa-Single-${RUN_ID}#26`;
    const passwordHash = await bcrypt.hash(password, 12);
    const existing = await prisma.user.findUnique({ where: { tenant_id_email: { tenant_id: TENANT_ID, email: EMAIL } } });
    if (existing && existing.preferences?.source !== "hr_single_active_schedule_qa") throw new Error("La identidad reservada tiene otro origen.");
    user = await prisma.user.upsert({
      where: { tenant_id_email: { tenant_id: TENANT_ID, email: EMAIL } },
      update: { active: true, role_id: role.id, password: passwordHash, preferences: { source: "hr_single_active_schedule_qa" } },
      create: { tenant_id: TENANT_ID, role_id: role.id, name: "QA Horario Diario Unico", email: EMAIL, password: passwordHash, active: true, preferences: { source: "hr_single_active_schedule_qa" } }
    });
    employee = await prisma.employee.upsert({
      where: { tenant_id_code: { tenant_id: TENANT_ID, code: "QA-HR-SINGLE" } },
      update: { user_id: user.id, active: true, metadata: { source: "hr_single_active_schedule_qa" } },
      create: { tenant_id: TENANT_ID, user_id: user.id, code: "QA-HR-SINGLE", user_type: "operario", position: "Certificacion QA", department: "QA", salary_base: 1, hire_date: new Date(`${TODAY}T00:00:00-05:00`), active: true, metadata: { source: "hr_single_active_schedule_qa" } }
    });
    for (const [start_time, end_time] of [["06:00", "14:00"], ["08:00", "17:00"]]) {
      const route = await prisma.timeRoute.create({ data: { tenant_id: TENANT_ID, date: new Date(`${TODAY}T00:00:00-05:00`), employees: [employee.code], start_time, end_time, tolerance_minutes: 15, notes: RUN_ID, status: "active" } });
      routeIds.push(route.id);
    }
    const login = await api("/api/v1/auth/login", { method: "POST", body: { email: EMAIL, password } });
    assert.equal(login.response.status, 200, "Login QA rechazado.");
    const token = login.payload.token || login.payload.access_token;
    assert.ok(token, "Login QA sin token.");
    const ownRoutes = await api("/api/v1/hr/self/routes", { token });
    assert.equal(ownRoutes.response.status, 200);
    assert.deepEqual(ownRoutes.payload.map((route) => route.id), [routeIds[1]], "El usuario recibio mas de un horario o no recibio el mas reciente.");
    const alternate = await api("/api/v1/hr/self/time-punches", { token, method: "POST", body: { employee_id: employee.id, user_name: employee.code, route_id: routeIds[0], type: "entrada", punched_at: new Date().toISOString(), idempotency_key: `${RUN_ID}:alternate` } });
    assert.equal(alternate.response.status, 409, "El horario alterno no fue rechazado.");
    assert.equal(alternate.payload.code, "HORARIO_NO_ACTIVO");
    const active = await api("/api/v1/hr/self/time-punches", { token, method: "POST", body: { employee_id: employee.id, user_name: employee.code, route_id: routeIds[1], type: "entrada", punched_at: new Date().toISOString(), idempotency_key: `${RUN_ID}:active`, metadata: { source: RUN_ID } } });
    assert.equal(active.response.status, 200, "El horario activo no permitio marcar.");
    const persisted = await prisma.timePunch.findMany({ where: { tenant_id: TENANT_ID, employee_id: employee.id, metadata: { path: ["source"], equals: RUN_ID } } });
    assert.equal(persisted.length, 1, "La marcacion activa no quedo persistida exactamente una vez.");
    evidence.routes_created = 2;
    evidence.routes_visible = ownRoutes.payload.length;
    evidence.visible_route_id = ownRoutes.payload[0].id;
    evidence.alternate_route_rejected = true;
    evidence.active_route_marked = true;
    evidence.status = "passed";
  } catch (error) {
    evidence.status = "failed";
    evidence.error = { code: error.code || error.name, message: error.message };
    throw error;
  } finally {
    if (employee) {
      const sessions = await prisma.workSession.findMany({ where: { tenant_id: TENANT_ID, employee_id: employee.id, route_id: { in: routeIds } }, select: { id: true } }).catch(() => []);
      if (sessions.length) await prisma.workActivity.deleteMany({ where: { session_id: { in: sessions.map((item) => item.id) } } }).catch(() => undefined);
      await prisma.timePunch.deleteMany({ where: { tenant_id: TENANT_ID, employee_id: employee.id, route_id: { in: routeIds } } }).catch(() => undefined);
      await prisma.workSession.deleteMany({ where: { tenant_id: TENANT_ID, employee_id: employee.id, route_id: { in: routeIds } } }).catch(() => undefined);
      await prisma.timeRoute.deleteMany({ where: { tenant_id: TENANT_ID, id: { in: routeIds } } }).catch(() => undefined);
      await prisma.employee.update({ where: { id: employee.id }, data: { active: false } }).catch(() => undefined);
    }
    if (user) await prisma.user.update({ where: { id: user.id }, data: { active: false } }).catch(() => undefined);
    evidence.cleanup = "routes_events_removed_identity_deactivated";
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, `${JSON.stringify(evidence, null, 2)}\n`);
  }
  console.log(`CERTIFICACION HORARIO UNICO QA APROBADA: ${OUTPUT}`);
}

main().catch((error) => { console.error(`CERTIFICACION HORARIO UNICO QA BLOQUEADA: ${error.stack || error.message}`); process.exitCode = 1; }).finally(() => prisma.$disconnect());
