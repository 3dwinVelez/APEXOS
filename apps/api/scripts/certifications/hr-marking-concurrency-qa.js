const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const bcrypt = require("bcrypt");
const prisma = require("../../src/core/prisma");

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

const API_URL = String(process.env.CERTIFICATION_API_URL || "").replace(/\/$/, "");
const EXPECTED_COMMIT = String(process.env.CERTIFICATION_EXPECTED_COMMIT || "");
const OUTPUT = path.resolve(String(args.output || process.env.CERTIFICATION_OUTPUT || `docs/qa/evidence/hr-marking-concurrency-20260902/mass-certification.json`));
const LEVELS = String(process.env.CERTIFICATION_CONCURRENCY_LEVELS || "20,50,100").split(",").map(Number).filter((value) => Number.isInteger(value) && value > 0 && value <= 200);
const RUN_ID = `hr_marking_concurrency_${Date.now()}`;
const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const YESTERDAY = new Date(`${TODAY}T12:00:00-05:00`);
YESTERDAY.setDate(YESTERDAY.getDate() - 1);

function requireEnvironment() {
  const target = String(process.env.CERTIFICATION_TARGET || "").toLowerCase();
  assert.ok(["local", "qa"].includes(target), "CERTIFICATION_TARGET debe ser local o qa.");
  if (target === "qa") assert.match(API_URL, /apexos-api-qa-production\.up\.railway\.app$/, "El API debe ser QA.");
  if (target === "local") assert.match(API_URL, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/, "El API local debe usar loopback.");
  assert.ok(EXPECTED_COMMIT, "CERTIFICATION_EXPECTED_COMMIT es obligatorio.");
  if (target === "qa") assert.ok(String(process.env.DATABASE_URL || "").includes("jbirkghkekuifgfsgquq"), "DATABASE_URL debe corresponder a Supabase QA.");
  if (target === "local") assert.match(String(process.env.DATABASE_URL || ""), /@(127\.0\.0\.1|localhost):/, "DATABASE_URL debe ser local.");
  assert.deepEqual(LEVELS, [20, 50, 100], "La certificacion oficial exige niveles 20,50,100.");
  return target;
}

function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] || 0;
}

function at(hour, minute = 0) {
  return new Date(`${TODAY}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-05:00`).toISOString();
}

async function timed(task) {
  const started = Date.now();
  try {
    const value = await task();
    return { ok: true, value, latency_ms: Date.now() - started };
  } catch (error) {
    return { ok: false, latency_ms: Date.now() - started, error: { code: error.code || error.name, message: error.message } };
  }
}

async function request(pathname, { token = "", method = "GET", body } = {}) {
  const response = await fetch(`${API_URL}${pathname}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`${method} ${pathname}: ${response.status} ${payload.error || payload.message || "error"}`);
    error.code = payload.code || `HTTP_${response.status}`;
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function fixtures(tenant, role, count) {
  const password = `Qa-Hr-Mass-${RUN_ID}#26`;
  const passwordHash = await bcrypt.hash(password, 12);
  const actors = [];
  for (let index = 1; index <= count; index += 1) {
    const slot = String(index).padStart(3, "0");
    const email = `qa.hr.mass.${slot}@internal.apexos.local`;
    const existing = await prisma.user.findUnique({ where: { tenant_id_email: { tenant_id: tenant.id, email } } });
    if (existing && existing.preferences?.source !== "hr_marking_concurrency_qa") throw new Error(`La identidad reservada ${email} tiene otro origen.`);
    const user = await prisma.user.upsert({
      where: { tenant_id_email: { tenant_id: tenant.id, email } },
      update: { active: true, role_id: role.id, password: passwordHash, preferences: { source: "hr_marking_concurrency_qa", slot } },
      create: { tenant_id: tenant.id, role_id: role.id, name: `QA HR Mass ${slot}`, email, password: passwordHash, active: true, preferences: { source: "hr_marking_concurrency_qa", slot } },
      include: { role: { include: { permissions: true } } }
    });
    const employee = await prisma.employee.upsert({
      where: { tenant_id_code: { tenant_id: tenant.id, code: `QA-HR-MASS-${slot}` } },
      update: { user_id: user.id, active: true, metadata: { source: "hr_marking_concurrency_qa", slot, name: user.name } },
      create: { tenant_id: tenant.id, user_id: user.id, code: `QA-HR-MASS-${slot}`, user_type: "operario", position: "Certificacion concurrencia", department: "QA", salary_base: 1, hire_date: new Date(`${TODAY}T00:00:00-05:00`), active: true, metadata: { source: "hr_marking_concurrency_qa", slot, name: user.name } }
    });
    actors.push({ user, employee, email, password, token: "" });
  }
  return actors;
}

async function authenticateActors(actors) {
  for (let offset = 0; offset < actors.length; offset += 10) {
    const batch = actors.slice(offset, offset + 10);
    await Promise.all(batch.map(async (item) => {
      const login = await request("/api/v1/auth/login", { method: "POST", body: { email: item.email, password: item.password } });
      item.token = login.token || login.access_token;
      assert.ok(item.token, `Login sin token para ${item.email}.`);
    }));
  }
}

async function certificationTenant(target) {
  if (target === "qa") {
    const tenant = await prisma.tenant.findFirst({ where: { name: { equals: "NYVORA", mode: "insensitive" }, active: true } });
    assert.ok(tenant, "Tenant NYVORA no encontrado.");
    return tenant;
  }
  return prisma.tenant.upsert({
    where: { domain: "nyvora-hr-cert.local" },
    update: { active: true, active_modules: ["M-17"], timezone: "America/Bogota" },
    create: { name: "NYVORA QA LOCAL", domain: "nyvora-hr-cert.local", active: true, active_modules: ["M-17"], timezone: "America/Bogota", config: { source: "hr_marking_concurrency_qa" } }
  });
}

async function certificationRole(tenant) {
  const role = await prisma.role.upsert({
    where: { tenant_id_name: { tenant_id: tenant.id, name: "Empleado marcaciones" } },
    update: { metadata: { access_profile: "marking_only", source: "hr_marking_concurrency_qa" } },
    create: { tenant_id: tenant.id, name: "Empleado marcaciones", description: "Rol local controlado para certificar marcaciones", metadata: { access_profile: "marking_only", source: "hr_marking_concurrency_qa" } }
  });
  for (const action of ["read", "write"]) {
    await prisma.permission.upsert({
      where: { role_id_module_action: { role_id: role.id, module: "time_tracking", action } },
      update: {},
      create: { role_id: role.id, module: "time_tracking", action }
    });
  }
  return prisma.role.findUnique({ where: { id: role.id }, include: { permissions: true } });
}

async function runLevel(tenant, actors, concurrency) {
  const selected = actors.slice(0, concurrency);
  const routeIds = [];
  const punchIds = [];
  const sessionIds = [];
  try {
    for (const item of selected) {
      const route = await prisma.timeRoute.create({ data: { tenant_id: tenant.id, date: new Date(`${TODAY}T00:00:00-05:00`), employees: [item.employee.code], start_time: "00:01", end_time: "23:59", tolerance_minutes: 15, notes: `Control de marcacion: punch_only\n${RUN_ID}`, status: "active" } });
      routeIds.push(route.id);
      item.route = route;
    }
    const pastRoute = await prisma.timeRoute.create({ data: { tenant_id: tenant.id, date: YESTERDAY, employees: [selected[0].employee.code], start_time: "08:00", end_time: "17:00", notes: RUN_ID, status: "active" } });
    routeIds.push(pastRoute.id);
    const visibleRoutes = await request("/api/v1/hr/self/routes?fecha_inicio=2000-01-01&fecha_fin=2100-01-01", { token: selected[0].token });
    assert.deepEqual(visibleRoutes.map((route) => route.id), [selected[0].route.id], "self/routes expuso un horario fuera del dia actual.");

    const phases = [
      ["entrada", at(8)],
      ["inicio_almuerzo", at(12)],
      ["fin_almuerzo", at(13)],
      ["salida", at(17)]
    ];
    const phaseResults = [];
    let entryPayloads = [];
    for (const [type, punchedAt] of phases) {
      const payloads = selected.map((item, index) => ({ employee_id: item.employee.id, user_name: item.employee.code, route_id: item.route.id, type, punched_at: punchedAt, idempotency_key: `${RUN_ID}:${concurrency}:${index}:${type}`, metadata: { source: RUN_ID, level: concurrency } }));
      if (type === "entrada") entryPayloads = payloads;
      const results = await Promise.all(payloads.map((payload, index) => timed(() => request("/api/v1/hr/self/time-punches", { token: selected[index].token, method: "POST", body: payload }))));
      phaseResults.push({ type, results });
      for (const result of results) if (result.ok && result.value?.punch?.id) punchIds.push(result.value.punch.id);
    }
    const replayResults = await Promise.all(entryPayloads.map((payload, index) => timed(() => request("/api/v1/hr/self/time-punches", { token: selected[index].token, method: "POST", body: payload }))));
    const all = phaseResults.flatMap((phase) => phase.results);
    const latencies = all.map((result) => result.latency_ms);
    const errors = all.filter((result) => !result.ok);
    const persisted = await prisma.timePunch.findMany({ where: { tenant_id: tenant.id, route_id: { in: routeIds } }, select: { id: true, route_id: true, type: true, idempotency_key: true } });
    const expected = concurrency * 4;
    const uniqueKeys = new Set(persisted.map((row) => row.idempotency_key));
    const replayedSame = replayResults.every((result, index) => result.ok && result.value.replayed === true && result.value.punch.id === phaseResults[0].results[index].value.punch.id);
    assert.equal(errors.length, 0, `Nivel ${concurrency} tuvo errores.`);
    assert.equal(persisted.length, expected, `Nivel ${concurrency} perdio o duplico marcaciones.`);
    assert.equal(uniqueKeys.size, expected, `Nivel ${concurrency} repitio claves idempotentes.`);
    assert.equal(replayedSame, true, `Nivel ${concurrency} no reprodujo idempotencia estable.`);
    return { concurrency, requests: expected + concurrency, persisted: persisted.length, errors: errors.length, duplicates: persisted.length - uniqueKeys.size, lost: expected - persisted.length, idempotent_replays: replayResults.length, p50_ms: percentile(latencies, 0.5), p95_ms: percentile(latencies, 0.95), p99_ms: percentile(latencies, 0.99), max_ms: Math.max(...latencies), route_visibility_today_only: true };
  } finally {
    const sessions = await prisma.workSession.findMany({ where: { tenant_id: tenant.id, route_id: { in: routeIds } }, select: { id: true } }).catch(() => []);
    sessionIds.push(...sessions.map((row) => row.id));
    if (sessionIds.length) await prisma.workActivity.deleteMany({ where: { session_id: { in: sessionIds } } }).catch(() => undefined);
    await prisma.gpsPing.deleteMany({ where: { tenant_id: tenant.id, route_id: { in: routeIds } } }).catch(() => undefined);
    await prisma.timePunch.deleteMany({ where: { tenant_id: tenant.id, route_id: { in: routeIds } } }).catch(() => undefined);
    await prisma.workSession.deleteMany({ where: { tenant_id: tenant.id, route_id: { in: routeIds } } }).catch(() => undefined);
    await prisma.timeRoute.deleteMany({ where: { tenant_id: tenant.id, id: { in: routeIds } } }).catch(() => undefined);
  }
}

async function main() {
  const target = requireEnvironment();
  const evidence = { certification: "hr-marking-concurrency-qa", environment: target.toUpperCase(), company: "NYVORA", run_id: RUN_ID, expected_commit: EXPECTED_COMMIT, deployed_commit: "", levels: [], cleanup: "pending", status: "running", generated_at: new Date().toISOString() };
  let actors = [];
  try {
    const healthResponse = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(15000) });
    const health = await healthResponse.json();
    assert.equal(healthResponse.status, 200);
    evidence.deployed_commit = String(health.commit || "");
    assert.equal(evidence.deployed_commit, EXPECTED_COMMIT.slice(0, 12), "QA no ejecuta el commit esperado.");
    const tenant = await certificationTenant(target);
    const role = await certificationRole(tenant);
    actors = await fixtures(tenant, role, Math.max(...LEVELS));
    await authenticateActors(actors);
    for (const level of LEVELS) evidence.levels.push(await runLevel(tenant, actors, level));
    evidence.status = "passed";
  } catch (error) {
    evidence.status = "failed";
    evidence.error = { code: error.code || error.name, message: error.message };
    throw error;
  } finally {
    if (actors.length) {
      await prisma.user.updateMany({ where: { id: { in: actors.map((item) => item.user.id) } }, data: { active: false } });
      await prisma.employee.updateMany({ where: { id: { in: actors.map((item) => item.employee.id) } }, data: { active: false } });
    }
    evidence.cleanup = "events_and_routes_deleted_certification_identities_deactivated";
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, `${JSON.stringify(evidence, null, 2)}\n`);
  }
  console.log(`CERTIFICACION MASIVA HR QA APROBADA: ${OUTPUT}`);
}

main().catch((error) => {
  console.error(`CERTIFICACION MASIVA HR QA BLOQUEADA: ${error.stack || error.message}`);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
