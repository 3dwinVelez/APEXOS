const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const bcrypt = require("bcrypt");
const prisma = require("../../src/core/prisma");
const { endpoints, expectedValidationErrors } = require("./nyvora-mass-endpoints");

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
const targetConfig = targets[target];
const apiUrl = String(process.env.CERTIFICATION_API_URL || "").replace(/\/$/, "");
const expectedCommit = String(process.env.CERTIFICATION_EXPECTED_COMMIT || "");
const runId = String(process.env.CERTIFICATION_RUN_ID || new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14));
const outputPath = path.resolve(process.env.CERTIFICATION_OUTPUT || `/tmp/nyvora-mass-regression-${target || "invalid"}-${runId}.json`);
const email = `nyvora.mass.cert.${target}.${runId.toLowerCase()}@internal.apexos.local`;
const password = `Nyvora-Mass-${crypto.randomBytes(12).toString("base64url")}#26`;

function assertTarget() {
  if (!targetConfig) throw new Error("CERTIFICATION_TARGET debe ser qa o production.");
  if (!apiUrl.includes(targetConfig.apiHost)) throw new Error(`CERTIFICATION_API_URL no corresponde a ${target}.`);
  if (!String(process.env.DATABASE_URL || "").includes(targetConfig.databaseProject)) {
    throw new Error(`DATABASE_URL no corresponde a ${target}.`);
  }
  if (!expectedCommit) throw new Error("CERTIFICATION_EXPECTED_COMMIT es obligatorio.");
}

function responseShape(body) {
  if (Array.isArray(body)) return { type: "array", count: body.length };
  if (body && typeof body === "object") return { type: "object", keys: Object.keys(body).slice(0, 12) };
  return { type: typeof body };
}

async function request(endpoint, token) {
  const started = Date.now();
  const response = await fetch(`${apiUrl}${endpoint}`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(35000)
  });
  const text = await response.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // The HTTP contract remains authoritative for non-JSON responses.
  }
  const expectedError = expectedValidationErrors[endpoint];
  const contractOk = expectedError
    ? response.status === expectedError.status && body && typeof body === "object" && body.code === expectedError.code
    : response.ok;
  return {
    endpoint,
    status: response.status,
    ok: contractOk,
    expected: expectedError || { status: 200 },
    latency_ms: Date.now() - started,
    shape: responseShape(body),
    ...(contractOk ? {} : { detail: String(typeof body === "string" ? body : JSON.stringify(body)).slice(0, 500) })
  };
}

async function main() {
  assertTarget();
  const tenant = await prisma.tenant.findFirst({ where: { name: { contains: "NYVORA", mode: "insensitive" }, active: true } });
  if (!tenant) throw new Error("Tenant Nyvora no encontrado.");
  const role = await prisma.role.findUnique({ where: { tenant_id_name: { tenant_id: tenant.id, name: "APEX_ADMIN" } } });
  if (!role) throw new Error("Rol APEX_ADMIN de Nyvora no encontrado.");

  const user = await prisma.user.upsert({
    where: { tenant_id_email: { tenant_id: tenant.id, email } },
    update: { password: await bcrypt.hash(password, 12), role_id: role.id, active: true },
    create: {
      tenant_id: tenant.id,
      name: `Nyvora Mass Certificate ${target} ${runId}`,
      email,
      password: await bcrypt.hash(password, 12),
      role_id: role.id,
      active: true,
      preferences: { source: "nyvora_mass_regression", target, run_id: runId }
    }
  });

  const result = {
    ok: false,
    environment: target,
    company: "NYVORA",
    run_id: runId,
    commit: "",
    checks: [],
    failures: [],
    certification_user_id: user.id,
    certification_user_deactivated: false
  };
  try {
    const healthResponse = await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(15000) });
    const health = await healthResponse.json();
    result.commit = String(health.commit || "");
    if (!healthResponse.ok || result.commit !== expectedCommit.slice(0, 12)) {
      throw new Error(`El artefacto desplegado ${result.commit || "sin commit"} no coincide con ${expectedCommit.slice(0, 12)}.`);
    }
    const loginResponse = await fetch(`${apiUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(20000)
    });
    const login = await loginResponse.json();
    if (!loginResponse.ok || !login.token) throw new Error(`Login certificado fallo con HTTP ${loginResponse.status}.`);
    for (const endpoint of endpoints) result.checks.push(await request(endpoint, login.token));
    result.failures = result.checks.filter((check) => !check.ok);
    result.ok = result.failures.length === 0;
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
    run_id: result.run_id,
    commit: result.commit,
    checks: result.checks.length,
    failures: result.failures,
    output: outputPath,
    certification_user_deactivated: result.certification_user_deactivated
  }, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`[nyvora-mass-regression] ${error.message}`);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
