// Certifies the authenticated marking flow against a disposable local database.
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const bcrypt = require("bcrypt");
assert.match(new URL(process.env.DATABASE_URL).hostname, /^(localhost|127\.0\.0\.1)$/);
process.env.JWT_SECRET = randomUUID() + randomUUID();
const db = require("../../apps/api/src/core/prisma");

async function certify() {
  const tenant = await db.tenant.create({ data: { name: "QA vínculo de marcaciones", active_modules: ["M-17", "M-22"] } });
  const role = await db.role.create({ data: {
    tenant_id: tenant.id, name: "QA marcaciones",
    permissions: { create: [{ module: "hr", action: "read" }, { module: "hr", action: "write" }] }
  } });
  const password = randomUUID() + "Qa!9";
  const user = await db.user.create({ data: {
    tenant_id: tenant.id, role_id: role.id, name: "Operario QA", email: randomUUID() + "@example.invalid",
    password: await bcrypt.hash(password, 10)
  } });
  const existing = await db.employee.create({ data: {
    tenant_id: tenant.id, code: "QA-EXISTENTE", position: "operario", department: "Operacion",
    salary_base: 2000000, hire_date: new Date(), metadata: { name: user.name }
  } });
  const app = await require("../../apps/api/server")();
  try {
    const origin = await app.listen({ host: "127.0.0.1", port: 0 });
    async function request(route, body, token) {
      const response = await fetch(origin + "/api/v1" + route, {
        method: body ? "POST" : "GET",
        headers: { ...(body && { "content-type": "application/json" }), ...(token && { authorization: "Bearer " + token }) },
        body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000)
      });
      return { status: response.status, body: await response.json() };
    }
    const login = await request("/auth/login", { email: user.email, password });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    const token = login.body.token;
    const punch = { user_name: user.name, employee_id: existing.id, type: "entrada" };
    assert.equal((await request("/hr/self")).status, 401);
    for (const [route, body] of [["/hr/self"], ["/hr/self/time-punches", punch], ["/hr/time-punches", { user_name: "No existe", type: "entrada" }]]) {
      const result = await request(route, body, token);
      assert.equal(result.status, 404, JSON.stringify(result.body));
      assert.equal(result.body.code, "EMPLEADO_NO_ASOCIADO");
    }
    assert.equal(await db.employee.count({ where: { tenant_id: tenant.id } }), 1);
    assert.equal(await db.timePunch.count({ where: { tenant_id: tenant.id } }), 0);
    await db.employee.update({ where: { id: existing.id }, data: { user_id: user.id } });
    const profile = await request("/hr/self", null, token);
    assert.equal(profile.status, 200, JSON.stringify(profile.body));
    assert.equal(profile.body.id, existing.id);
    const marked = await request("/hr/self/time-punches", punch, token);
    assert.equal(marked.status, 200, JSON.stringify(marked.body));
    assert.equal(await db.timePunch.count({ where: { tenant_id: tenant.id, employee_id: existing.id } }), 1);
    assert.equal(await db.employee.count({ where: { tenant_id: tenant.id } }), 1);
  } finally {
    await app.close();
  }
}

const output = process.argv.find(arg => arg.startsWith("--output="))?.slice(9);
certify().then(() => {
  const result = { status: "passed", checks: ["authenticated unlinked profile and punches reject without writes", "existing linked employee can mark"], finished_at: new Date().toISOString() };
  if (output) fs.writeFileSync(output, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => db.$disconnect());
