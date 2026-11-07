const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

// Cierre del hallazgo de seguridad registrado en la ronda hr-contention-p2028-20261026: las dos
// rutas de alta de ajuste de nomina (IBC) se dejaron sin preHandler de permiso, asi que cualquier
// usuario autenticado del tenant podia crear un ajuste aunque su rol no tuviera permisos de nomina.
// Las rutas hermanas (listar y borrar) si los tenian, por eso el hoyo solo estaba en la escritura.

const ROUTES = path.resolve(__dirname, "../src/modules/hr/routes.js");
const ts = require("typescript");

function routeLines(source) {
  const file = ts.createSourceFile("routes.js", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const routes = [];
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.expression.getText(file) === "fastify"
      && ["get", "post", "put", "patch", "delete"].includes(node.expression.name.text)
      && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      const options = node.arguments[1];
      // Inspect the options object, including multiline declarations; never accept
      // an unrelated permission check inside a handler as a route guard.
      routes.push({ method: node.expression.name.text, url: node.arguments[0].text,
        line: options && ts.isObjectLiteralExpression(options) ? options.getText(file) : "" });
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return routes;
}

test("el alta de ajuste de nomina exige el permiso de escritura de nomina en sus dos rutas", () => {
  const source = fs.readFileSync(ROUTES, "utf8");
  for (const url of ["/hr/payroll/adjustments", "/talento-humano/nomina/ajustes"]) {
    const line = routeLines(source).find((route) => route.method === "post" && route.url === url);
    assert.ok(line, `debe existir POST ${url}`);
    assert.match(
      line.line,
      /preHandler: requirePermission\("payroll", "write"\)/,
      `POST ${url} debe exigir el mismo permiso que su DELETE: sin el preHandler, cualquier usuario autenticado del tenant crea novedades IBC`
    );
  }
});

test("ninguna ruta de Talento Humano queda sin guarda de autorizacion", () => {
  const source = fs.readFileSync(ROUTES, "utf8");
  const unprotected = routeLines(source).filter((route) => !/preHandler:/.test(route.line));
  assert.deepEqual(
    unprotected.map((route) => `${route.method.toUpperCase()} ${route.url}`),
    [],
    "una ruta sin preHandler propio depende solo del login: el RBAC del modulo nunca se ejecuta"
  );
});

test("el permiso exigido rechaza de verdad a un rol sin permisos de nomina", async () => {
  process.env.DISABLE_REDIS = "true";
  const { requirePermission } = require("../src/middleware/rbac");
  const guard = requirePermission("payroll", "write");
  const tenant = { active_modules: ["m-17", "talento-humano"] };

  const sent = [];
  const reply = { code(status) { this.status = status; return this; }, send(payload) { sent.push({ status: this.status, payload }); return this; } };
  const operario = {
    method: "POST", url: "/api/v1/talento-humano/nomina/ajustes", tenant,
    user: { role: { id: 9, name: "Operario de planta", permissions: [{ module: "hr", action: "read" }] } },
    body: {}, params: {}, query: {}
  };
  await guard(operario, reply);
  assert.equal(sent[0]?.status, 403, "sin permiso de nomina el alta debe rechazarse antes de tocar la base");
  assert.equal(sent[0]?.payload?.code, "PERMISO_DENEGADO");

  const contador = {
    method: "POST", url: "/api/v1/talento-humano/nomina/ajustes", tenant,
    user: { role: { id: 10, name: "Contador", permissions: [{ module: "payroll", action: "write" }] } },
    body: {}, params: {}, query: {}
  };
  const contadorReply = { code(status) { this.status = status; return this; }, send(payload) { throw new Error(`no debe rechazar: ${payload?.error}`); } };
  await guard(contador, contadorReply);
  assert.equal(contador.rbacScope?.role_name, "Contador", "el rol con permiso pasa y queda auditado en el scope RBAC");
});
