const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const bcrypt = require("bcrypt");
const prisma = require("../../src/core/prisma");
const hr = require("../../src/modules/hr/service");

const targets = {
  qa: {
    apiHost: "apexos-api-qa-production.up.railway.app",
    databaseProject: "jbirkghkekuifgfsgquq"
  },
  production: {
    apiHost: "apexos-api-prod-production.up.railway.app",
    databaseProject: "jzbwzmkidfthknsohhnr"
  }
};

const target = String(process.env.CERTIFICATION_TARGET || "").toLowerCase();
const config = targets[target];
const apiUrl = String(process.env.CERTIFICATION_API_URL || "").replace(/\/$/, "");
const expectedCommit = String(process.env.CERTIFICATION_EXPECTED_COMMIT || "");
const runId = String(process.env.CERTIFICATION_RUN_ID || Date.now());
const date = String(process.env.CERTIFICATION_DATE || new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).format(new Date()));
const outputPath = path.resolve(process.env.CERTIFICATION_OUTPUT || `/tmp/nyvora-hr-monitor-${target}-${runId}.json`);
const tag = `nyvora_hr_monitor_${target}_${runId}`;
const code = `NYV-MON-${runId}`.slice(0, 48);
const email = `nyvora.monitor.${target}.${runId.toLowerCase()}@internal.apexos.local`;
const password = `Nyvora-Monitor-${crypto.randomBytes(10).toString("base64url")}#26`;
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

function assertTarget() {
  if (!config) throw new Error("CERTIFICATION_TARGET debe ser qa o production.");
  if (!apiUrl.includes(config.apiHost)) throw new Error(`CERTIFICATION_API_URL no corresponde a ${target}.`);
  if (!String(process.env.DATABASE_URL || "").includes(config.databaseProject)) throw new Error(`DATABASE_URL no corresponde a ${target}.`);
  if (!expectedCommit) throw new Error("CERTIFICATION_EXPECTED_COMMIT es obligatorio.");
}

function at(time) {
  return new Date(`${date}T${time}:00-05:00`).toISOString();
}

function summaryFor(result, routeId) {
  return result.routes.find((item) => Number(item.route_id) === Number(routeId));
}

async function main() {
  assertTarget();
  const healthResponse = await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(15000) });
  const health = await healthResponse.json();
  assert.equal(healthResponse.status, 200);
  assert.equal(String(health.commit || ""), expectedCommit.slice(0, 12), "El API no ejecuta el commit certificado.");

  const tenant = await prisma.tenant.findFirst({ where: { name: { equals: "NYVORA", mode: "insensitive" }, active: true } });
  assert.ok(tenant, "Tenant Nyvora no encontrado.");
  const role = await prisma.role.findUnique({ where: { tenant_id_name: { tenant_id: tenant.id, name: "APEX_ADMIN" } } });
  assert.ok(role, "Rol APEX_ADMIN de Nyvora no encontrado.");

  const user = await prisma.user.create({
    data: {
      tenant_id: tenant.id,
      role_id: role.id,
      name: `Nyvora Monitor Certificate ${runId}`,
      email,
      password: await bcrypt.hash(password, 12),
      active: true,
      preferences: { source: tag }
    },
    include: { role: { include: { permissions: true } } }
  });
  const result = {
    ok: false,
    environment: target,
    company: "NYVORA",
    run_id: runId,
    commit: String(health.commit || ""),
    date,
    route_id: null,
    punch_ids: [],
    activity_id: null,
    evidence_id: null,
    before: null,
    after: null,
    certification_user_id: user.id,
    certification_user_deactivated: false
  };

  try {
    const employee = await prisma.employee.create({
      data: {
        tenant_id: tenant.id,
        user_id: user.id,
        code,
        user_type: "operario",
        position: "Operario certificacion monitor",
        department: "Talento Humano",
        salary_base: 1,
        hire_date: new Date(`${date}T00:00:00-05:00`),
        active: true,
        metadata: { source: tag, name: user.name, company: "NYVORA" }
      }
    });
    const actor = { id: user.id, tenant_id: tenant.id, role: user.role, role_id: user.role_id, name: user.name, email: user.email };
    const route = await hr.createRoute(tenant.id, {
      date,
      vehicle_plate: "",
      employees: [employee.code],
      start_time: "08:00",
      end_time: "17:00",
      tolerance_minutes: 15,
      notes: `Certificacion dinamica Nyvora ${tag}`,
      status: "active"
    });
    result.route_id = route.id;
    result.before = summaryFor(await hr.listRouteEventSummaries(tenant.id), route.id) || null;
    assert.equal(Number(result.before?.event_count || 0), 0, "La ruta nueva debe iniciar sin eventos.");

    const punchSpecs = [
      ["entrada", "08:00"],
      ["inicio_almuerzo", "12:00"],
      ["fin_almuerzo", "13:00"],
      ["salida", "17:00"]
    ];
    for (const [type, time] of punchSpecs) {
      const response = await hr.createPunch(tenant.id, {
        type,
        punched_at: at(time),
        route_id: route.id,
        latitude: 4.711 + result.punch_ids.length * 0.001,
        longitude: -74.072 - result.punch_ids.length * 0.001,
        accuracy_meters: 8,
        metadata: { source: tag, certification_step: type }
      }, actor);
      assert.equal(response.ok, true, `La marcacion ${type} no fue aceptada.`);
      result.punch_ids.push(response.punch.id);
      if (type === "entrada") {
        const activity = await hr.createWorkActivity(tenant.id, actor, {
          route_id: route.id,
          employee_id: employee.id,
          activity_type_id: "certificacion_monitor",
          occurred_at: at("09:00"),
          latitude: 4.712,
          longitude: -74.073,
          accuracy_meters: 8,
          observation: "Actividad tangible para comprobar actualizacion dinamica del monitor.",
          metadata: { source: tag, activity_type_name: "Certificacion monitor Nyvora" },
          photo: { name: `monitor-${runId}.png`, type: "image/png", size: png.length, base64: png.toString("base64") }
        });
        result.activity_id = activity.id;
        result.evidence_id = activity.evidence?.[0]?.id || null;
      }
    }

    const routes = await hr.listRoutes(tenant.id, { date });
    result.after = summaryFor(await hr.listRouteEventSummaries(tenant.id), route.id) || null;
    assert.ok(routes.some((item) => Number(item.id) === Number(route.id)), "La ruta no aparece en el monitor.");
    assert.equal(result.punch_ids.length, 4);
    assert.ok(result.activity_id && result.evidence_id, "La actividad fotografica no quedo persistida.");
    assert.ok(Number(result.after?.event_count || 0) >= 5, "El resumen no refleja marcaciones y actividad.");
    assert.ok(Number(result.after?.evidence_count || 0) >= 1, "El resumen no refleja la evidencia fotografica.");
    assert.ok(Number(result.after?.closed_count || 0) >= 1, "El resumen no refleja el cierre de jornada.");
    result.ok = true;
  } finally {
    await prisma.user.update({ where: { id: user.id }, data: { active: false } });
    result.certification_user_deactivated = true;
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  }

  console.log(JSON.stringify({
    ok: result.ok,
    environment: result.environment,
    company: result.company,
    commit: result.commit,
    run_id: result.run_id,
    route_id: result.route_id,
    punch_ids: result.punch_ids,
    activity_id: result.activity_id,
    evidence_id: result.evidence_id,
    before: result.before,
    after: result.after,
    certification_user_deactivated: result.certification_user_deactivated,
    output: outputPath
  }, null, 2));
}

main().catch((error) => {
  console.error(`[nyvora-hr-monitor-dynamic] ${error.stack || error.message}`);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
