// Certificacion LOCAL del rol Accionista sincronizado desde Supabase.
//
// Flujo certificado de punta a punta contra la API real (server.js) y un
// Postgres LOCAL con el esquema de Prisma:
//   1. Un usuario de Supabase con rol "Accionistas" en la web inicia sesion.
//   2. La API lo espeja con el rol "Accionista" y SOLO accounting:read y
//      transport:read, aunque el rol de la web traiga muchos modulos marcados.
//   3. Lee todos los reportes que usa la app movil (contabilidad y transporte).
//   4. Se le niega escribir, aprobar, ver servicios, RRHH y administracion.
//   5. Un permiso de mas agregado al rol se retira en el siguiente ingreso.
//   6. Casos de error: un nombre parecido NO es accionista y un admin de la
//      empresa con el rol asignado conserva la administracion.
//
// Supabase se sustituye por un servidor HTTP local que responde las mismas
// rutas que consulta supabaseAuth.js (auth/v1/user, company_users, companies,
// v_company_module_status, employees). Nunca toca Supabase QA ni PROD: aborta
// si DATABASE_URL no apunta a localhost/127.0.0.1.
//
// Uso:
//   DATABASE_URL=postgresql://apex:apex_dev_password@localhost:55432/apexos \
//     node scripts/certifications/shareholder-role-local.js --output <json>
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

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
const ROOT = path.resolve(__dirname, "../..");
const DATABASE_URL = String(args["database-url"] || process.env.DATABASE_URL || "").trim();
if (!/^postgres(?:ql)?:\/\/[^@\s]+@(localhost|127\.0\.0\.1)(:\d+)?\//.test(DATABASE_URL)) {
  console.error("BLOQUEADO: la certificacion solo corre contra una base LOCAL (localhost/127.0.0.1).");
  process.exit(2);
}
const OUTPUT = path.resolve(String(args.output || "docs/qa/evidence/shareholder-role-20261013/local-certification.json"));
const API_PORT = Number(args["api-port"] || 3197);
const API = `http://127.0.0.1:${API_PORT}/api/v1`;
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const PERIOD = new Date().toISOString().slice(0, 7);
const COMPANY_ID = crypto.randomUUID();
const COMPANY_NAME = `CERT ACCIONISTA ${RUN_ID}`;

// Permisos "de mas" que trae el rol en la web: el API debe ignorarlos todos.
const WEB_ROLE_PERMISSIONS = {
  contabilidad: { access: true, view: true, create: true, edit: true, approve: true, export: true },
  transporte: { access: true, view: true, create: true, edit: true, approve: true, export: true },
  servicios: { access: true, view: true, create: true, edit: true },
  talento_humano: { access: true, view: true, create: true },
  usuarios: { access: true, view: true, manage_users: true }
};

function persona(key, { membership = "member", roleName, accessProfile } = {}) {
  const id = crypto.randomUUID();
  return {
    key,
    id,
    email: `cert.${key}.${RUN_ID}@apexos.local`,
    token: `cert-${key}-${RUN_ID}-${crypto.randomBytes(6).toString("hex")}`,
    membership,
    employee: {
      id: crypto.randomUUID(),
      user_id: id,
      email: `cert.${key}.${RUN_ID}@apexos.local`,
      metadata: {
        role_id: `role_${key}`,
        role_name: roleName,
        ...(accessProfile ? { access_profile: accessProfile } : {}),
        permissions: WEB_ROLE_PERMISSIONS
      }
    }
  };
}

const people = [
  persona("accionista", { roleName: "Accionistas" }),
  persona("perfil", { roleName: "Socio inversionista", accessProfile: "accionista" }),
  persona("parecido", { roleName: "Asistente de accionistas" }),
  persona("admin", { membership: "admin", roleName: "Accionista" })
];
const byToken = new Map(people.map((p) => [p.token, p]));
const byId = new Map(people.map((p) => [p.id, p]));

// Segundo token del accionista: la API cachea la autenticacion por token, asi
// que un token nuevo obliga a resincronizar el rol (paso 5).
const accionista = people[0];
const accionistaSecondToken = `${accionista.token}-relogin`;
byToken.set(accionistaSecondToken, accionista);

function bearer(req) {
  return String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
}

function startSupabaseStub() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://stub");
    const send = (status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (url.pathname === "/auth/v1/user") {
      const who = byToken.get(bearer(req));
      return who ? send(200, { id: who.id, email: who.email, user_metadata: { full_name: `Cert ${who.key}` } }) : send(401, { msg: "invalid" });
    }
    const userFilter = String(url.searchParams.get("user_id") || "").replace(/^eq\./, "");
    if (url.pathname === "/rest/v1/company_users") {
      const who = byId.get(userFilter);
      return send(200, who ? [{ company_id: COMPANY_ID, role: who.membership, status: "active" }] : []);
    }
    if (url.pathname === "/rest/v1/companies") return send(200, [{ id: COMPANY_ID, name: COMPANY_NAME }]);
    if (url.pathname === "/rest/v1/v_company_module_status") {
      // Contabilidad, transporte, servicios y RRHH activos: asi un 403 en
      // servicios o RRHH prueba falta de PERMISO y no modulo deshabilitado.
      return send(200, ["M-07", "M-14", "M-26", "M-17", "M-22"].map((module_code) => ({ module_code, enabled: true })));
    }
    if (url.pathname === "/rest/v1/employees") {
      const or = String(url.searchParams.get("or") || "");
      const who = people.find((p) => or.includes(`user_id.eq.${p.id}`));
      return send(200, who ? [who.employee] : []);
    }
    return send(404, { message: `ruta no simulada: ${url.pathname}` });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function startApi(supabaseUrl) {
  const env = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    APPDATA: process.env.APPDATA,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    NODE_ENV: "development",
    APP_ENV: "local",
    PORT: String(API_PORT),
    DATABASE_URL,
    DIRECT_URL: DATABASE_URL,
    DISABLE_REDIS: "true",
    REDIS_DISABLED: "true",
    WORKERS_DISABLED: "true",
    JWT_SECRET: crypto.randomBytes(32).toString("hex"),
    SUPABASE_URL: supabaseUrl,
    SUPABASE_ANON_KEY: "cert-anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "cert-service-key",
    SUPABASE_AUTH_CACHE_TTL_MS: "60000"
  };
  const child = spawn(process.execPath, ["server.js"], { cwd: path.join(ROOT, "apps/api"), env, stdio: ["ignore", "pipe", "pipe"] });
  const logs = [];
  child.stdout.on("data", (chunk) => logs.push(String(chunk)));
  child.stderr.on("data", (chunk) => logs.push(String(chunk)));
  return { child, logs };
}

async function waitForApi(api) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (api.child.exitCode !== null) throw new Error(`la API termino antes de arrancar:\n${api.logs.join("").slice(-3000)}`);
    try {
      const response = await fetch(`http://127.0.0.1:${API_PORT}/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`la API no respondio /health en 90 s:\n${api.logs.join("").slice(-3000)}`);
}

async function call(token, method, pathname, body) {
  const response = await fetch(`${API}${pathname}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, code: payload?.code || null, payload };
}

const result = {
  certification: "shareholder-role-local",
  run_id: RUN_ID,
  environment: "LOCAL",
  database: DATABASE_URL.replace(/\/\/[^@]+@/, "//***@"),
  period: PERIOD,
  started_at: new Date().toISOString(),
  checks: []
};

function check(name, ok, detail = {}) {
  result.checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "OK  " : "FALLA"} ${name}`);
  if (!ok) throw new Error(`Fallo de certificacion: ${name} ${JSON.stringify(detail)}`);
}

function grants(me) {
  return (me.payload?.user?.role_permissions || []).map((p) => `${p.module}:${p.action}`).sort();
}

// Lo que consulta la app movil del accionista (lib/config/api_config.dart).
const READS = [
  ["accounting", `/accounting/reports/balance-sheet?period=${PERIOD}`],
  ["accounting", `/accounting/reports/income-statement?period=${PERIOD}`],
  ["accounting", `/accounting/reports/trial-balance?period=${PERIOD}`],
  ["accounting", `/accounting/reports/taxes?period=${PERIOD}`],
  ["accounting", "/accounting/reports/receivables"],
  ["accounting", "/accounting/reports/payables"],
  ["accounting", "/accounting/periods"],
  ["accounting", "/accounting/accounts?active=true"],
  ["accounting", `/accounting/documents?period=${PERIOD}&limit=100`],
  ["transport", "/transport/vehicles/metrics/dashboard"],
  ["transport", `/transport-pyg/report?period=${PERIOD}`],
  ["transport", "/transport-pyg/config"],
  ["transport", "/transport/settlement-control-tower?limit=300"],
  ["transport", "/transport/settlement-periods"],
  ["transport", "/transport/settlement-types"]
];

// Rutas de escritura sin esquema de cuerpo (o con cuerpo valido): Fastify
// valida el cuerpo antes del preHandler, y un 400 no probaria nada de RBAC.
const WRITES = [
  ["POST", "/accounting/chart/init", undefined],
  ["PATCH", `/accounting/periods/${PERIOD}`, { status: "closed" }],
  ["POST", "/transport/packing/profiles", { name: "cert" }],
  ["POST", "/transport/orders/sync", undefined],
  ["POST", "/transport/settlements/1/approve", undefined]
];

const OTHER_MODULES = ["/services/orders", "/hr/employees", "/admin/users"];

async function main() {
  const stub = await startSupabaseStub();
  const supabaseUrl = `http://127.0.0.1:${stub.address().port}`;
  const api = startApi(supabaseUrl);
  try {
    await waitForApi(api);
    check("la API real arranca contra el Postgres local", true, { api: API });

    // 1-2. Ingreso del accionista y rol espejado.
    const me = await call(accionista.token, "GET", "/auth/me");
    check("el accionista inicia sesion con su token de Supabase", me.status === 200, { status: me.status, code: me.code });
    check("el API lo espeja con el rol Accionista", me.payload?.user?.role?.name === "Accionista" || me.payload?.user?.role_name === "Accionista" || me.payload?.user?.role === "Accionista", { user: me.payload?.user && { role: me.payload.user.role, role_name: me.payload.user.role_name } });
    check("solo recibe accounting:read y transport:read", JSON.stringify(grants(me)) === JSON.stringify(["accounting:read", "transport:read"]), { permissions: grants(me) });
    const activeModules = me.payload?.tenant?.active_modules || [];
    check("la empresa espejada trae contabilidad y transporte activos", activeModules.includes("M-07") && activeModules.includes("M-14"), { active_modules: activeModules });

    // 3. Lecturas de la app movil.
    for (const [module, pathname] of READS) {
      const response = await call(accionista.token, "GET", pathname);
      check(`lee ${pathname}`, response.status === 200, { module, status: response.status, code: response.code, error: response.status === 200 ? undefined : response.payload?.error });
    }
    const ledger = await call(accionista.token, "GET", `/accounting/ledger/1305?period=${PERIOD}`);
    check("el auxiliar responde por datos (200/404) y no por permiso", [200, 404].includes(ledger.status) && ledger.code !== "PERMISO_DENEGADO", { status: ledger.status, code: ledger.code });

    // 4. Todo lo que no es lectura de esos dos modulos se niega.
    for (const [method, pathname, body] of WRITES) {
      const response = await call(accionista.token, method, pathname, body);
      check(`se le niega ${method} ${pathname}`, response.status === 403 && response.code === "PERMISO_DENEGADO", { status: response.status, code: response.code });
    }
    for (const pathname of OTHER_MODULES) {
      const response = await call(accionista.token, "GET", pathname);
      check(`no ve ${pathname}`, response.status === 403, { status: response.status, code: response.code });
    }

    // 5. Un permiso de mas en el rol se retira al volver a ingresar.
    const { PrismaClient } = require(require.resolve("@prisma/client", { paths: [path.join(ROOT, "apps/api"), ROOT] }));
    const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
    try {
      const tenant = await prisma.tenant.findFirst({ where: { name: COMPANY_NAME } });
      const role = await prisma.role.findFirst({ where: { tenant_id: tenant.id, name: "Accionista" } });
      await prisma.permission.create({ data: { role_id: role.id, module: "accounting", action: "write" } });
      const reLogin = await call(accionistaSecondToken, "GET", "/auth/me");
      check("un permiso agregado a mano se retira en el siguiente ingreso", JSON.stringify(grants(reLogin)) === JSON.stringify(["accounting:read", "transport:read"]), { permissions: grants(reLogin) });
      const stored = await prisma.permission.findMany({ where: { role_id: role.id }, select: { module: true, action: true } });
      check("la base conserva solo los dos permisos de lectura", stored.length === 2 && !stored.some((p) => p.action !== "read"), { stored });
    } finally {
      await prisma.$disconnect();
    }

    // Perfil por access_profile, con otro nombre de rol.
    const perfil = await call(people[1].token, "GET", "/auth/me");
    check("access_profile accionista tambien produce el rol Accionista", JSON.stringify(grants(perfil)) === JSON.stringify(["accounting:read", "transport:read"]), { permissions: grants(perfil) });

    // 6. Errores y regresion.
    const parecido = await call(people[2].token, "GET", "/auth/me");
    const parecidoReport = await call(people[2].token, "GET", `/accounting/reports/balance-sheet?period=${PERIOD}`);
    check("un rol con nombre parecido no se trata como accionista", !grants(parecido).includes("accounting:read") && parecidoReport.status === 403, { permissions: grants(parecido), balance_status: parecidoReport.status });
    const admin = await call(people[3].token, "GET", "/auth/me");
    check("un admin de la empresa con rol Accionista conserva APEX_ADMIN", grants(admin).includes("*:*"), { permissions: grants(admin) });
    const adminWrite = await call(people[3].token, "GET", "/services/orders");
    check("el admin sigue accediendo a otros modulos", adminWrite.status === 200, { status: adminWrite.status, code: adminWrite.code });
    const noToken = await fetch(`${API}/accounting/reports/payables`);
    check("sin token la API responde 401", noToken.status === 401, { status: noToken.status });
  } finally {
    api.child.kill();
    stub.close();
    result.finished_at = new Date().toISOString();
    result.passed = result.checks.length > 0 && result.checks.every((item) => item.ok);
    // Si algo fallo, el final del registro de la API explica el porque.
    if (!result.passed) result.api_log_tail = api.logs.join("").slice(-40000);
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, `${JSON.stringify(result, null, 2)}\n`);
    console.log(`Evidencia: ${OUTPUT}`);
  }
}

main().then(() => {
  console.log(`CERTIFICACION ${result.passed ? "APROBADA" : "FALLIDA"}: ${result.checks.filter((c) => c.ok).length}/${result.checks.length}`);
  process.exit(result.passed ? 0 : 1);
}).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
