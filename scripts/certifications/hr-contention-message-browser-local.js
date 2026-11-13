// Certificacion LOCAL en navegador real del aviso de concurrencia de Talento Humano.
//
// Que queda probado aqui y no antes: la ronda hr-contention-p2028-20261026 certifico por HTTP que la
// API responde 503 con codigo reintentable cuando otra escritura sostiene el advisory lock. Nunca se
// abrio un navegador. Esta corrida cierra ese hueco: un operario real, autenticado por la pantalla de
// login, contra el build de produccion del frontend (`next start`), ve como el intento guardado
// choca contra la contencion y que el aviso que aparece en pantalla es accionable ("Otra persona esta
// guardando... tu informacion no se perdio") y NO una caida del backend.
//
// No se simula ni se intercepta la respuesta: el 503 lo produce el servidor Fastify real porque una
// conexion PostgreSQL independiente sostiene `pg_advisory_xact_lock` sobre el mismo ambito
// (`hr-ibc-adjustment:<tenant>:<empleado>`) mas alla del deadline de 15s del try-lock acotado.
//
// Chequeos:
//  A. arranque: API local + frontend servido desde el build de produccion, ambos loopback.
//  B. login real por navegador con el usuario de certificacion.
//  C. con el lock sostenido, el POST real del formulario responde 503 con el codigo propio (nunca 500).
//  D. el banner visible es el mensaje amable; la pantalla no anuncia caida ni muestra JSON crudo.
//  E. el formulario conserva la seleccion: el aviso dice que el trabajo no se perdio, y es cierto.
//  F. control positivo: liberado el lock, el mismo clic del operario guarda y el aviso de exito aparece.
//  G. persistencia real: el ajuste queda en th_nomina_ajustes y solo uno (no duplico por el reintento).
//  H. cero errores de consola/ pagina y cero respuestas 500 o P2028 durante toda la sesion.
//
// Sale con codigo distinto de cero ante cualquier comprobacion fallida o parcial.

const assert = require("node:assert/strict");
const child = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const args = (() => {
  const out = {};
  for (let i = 0; i < process.argv.length; i += 1) {
    const v = process.argv[i];
    if (!v.startsWith("--")) continue;
    out[v.slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[++i] : true;
  }
  return out;
})();

const ROOT = path.resolve(__dirname, "..", "..");
require(path.join(ROOT, "scripts/load-env"))(path.resolve(ROOT, String(args["env-file"] || ".env")));

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
if (!/^postgres(?:ql)?:\/\/[^@\s]+@(localhost|127\.0\.0\.1)(:\d+)?\//.test(DATABASE_URL)) {
  console.error("BLOQUEADO: esta certificacion solo corre contra PostgreSQL local. Define DATABASE_URL local.");
  process.exit(1);
}

const API = path.join(ROOT, "apps/api");
const WEB = path.join(ROOT, "apps/web");
const puppeteer = require(path.join(API, "node_modules/puppeteer-core"));
const prisma = require(path.join(API, "src/core/prisma"));
const admin = require(path.join(API, "src/modules/admin/service"));

const API_PORT = Number(args["api-port"] || 3218);
const WEB_PORT = Number(args["web-port"] || 3219);
const API_URL = `http://127.0.0.1:${API_PORT}`;
const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;
const CHROME = String(args.chrome || process.env.CHROME_BIN || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe");
const EVIDENCE_DIR = path.resolve(ROOT, String(args.output || "docs/qa/evidence/hr-contention-message-browser-20261026"));
// Los stdout de los dos servicios son log de depuracion, no evidencia versionada (la convencion del
// repositorio versiona JSON y capturas, nunca .log).
const LOG_DIR = path.resolve(ROOT, String(args["log-dir"] || path.join(require("node:os").tmpdir(), "apexos-cert-contention-browser")));
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const PASSWORD = `Qa-Brs-${crypto.randomBytes(6).toString("hex")}#26`;
const EMAIL = `qa.brs28.admin.${RUN_ID}@apex.test`;
const CODE_PREFIX = "QA-BRS-";

const CONTENTION_DEADLINE_MS = 15_000; // contentionLockWaitMs en apps/api/src/modules/hr/service.js
const HOLD_OVER_DEADLINE_MS = 18_000; // sostiene el lock mas alla del deadline -> 503 garantizado
const LEADER_DELAY_MS = 800; // margen para que el titular tome el lock antes del clic
const BROWSER_NAV_TIMEOUT = 45_000;
const BUSY_WAIT_MS = CONTENTION_DEADLINE_MS + 12_000; // el 503 llega al cumplir el deadline

const TODAY = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const HR_CODES = ["m-17", "talento-humano", "talento_humano", "hr"];

const result = {
  change_id: "hr-contention-message-browser-20261026",
  certification: "hr-contention-message-browser-local",
  environment: "LOCAL",
  browser: "chrome-headless",
  frontend_served_by: "next start (produccion)",
  database_url_host: DATABASE_URL.replace(/\/\/[^@]*@/, "//***@"),
  api_url: API_URL,
  web_url: WEB_URL,
  generated_at: new Date().toISOString(),
  certified_commit: "unknown",
  operating_date: TODAY,
  scope: {
    defect:
      "La contencion P2028 ya devolvia 503 reintentable por HTTP, pero nunca se abrio un navegador para confirmar que el operario ve un aviso accionable y no una caida del backend.",
    product_decision:
      "No se modifico ninguna regla de negocio: se sostiene el advisory lock desde una conexion PostgreSQL independiente para provocar la misma contencion real que el fix ya sabe atender, y se lee el texto que la pantalla muestra.",
    proven_by_live_browser: [
      "login real por pantalla con el usuario de certificacion",
      "POST real de ajuste de nomina bajo lock sostenido: 503 AJUSTE_NOMINA_CONCURRENCIA_TEMPORAL, nunca 500",
      "banner visible: mensaje amable de edicion simultanea, sin 'Backend no disponible' y sin JSON crudo",
      "el formulario conserva la seleccion despues del rechazo",
      "liberado el lock, el mismo clic guarda y el aviso de exito aparece",
      "el ajuste queda persistido una sola vez en th_nomina_ajustes",
      "cero errores de consola y cero respuestas 500 o P2028 en la sesion"
    ]
  },
  checks: [],
  observations: {},
  network: [],
  console_errors: [],
  page_errors: [],
  status: "running"
};

function check(name, ok, detail = {}) {
  result.checks.push({ name, ok: Boolean(ok), detail });
  console.error(`[cert] ${String(result.checks.length).padStart(2, "0")} ${ok ? "OK  " : "FALLA"} ${name}`);
  assert.ok(ok, `Fallo de certificacion: ${name} ${JSON.stringify(detail)}`);
}

function payrollScope(tenantId, employeeId) {
  return `hr-ibc-adjustment:${tenantId}:${employeeId}`;
}

// Sostiene el advisory lock desde esta conexion, igual que el otro escritor de la incidencia.
async function holdScope(scope, holdMs) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))`;
    await tx.$executeRaw`SELECT pg_sleep(${holdMs / 1000}::double precision)`;
    return true;
  }, { maxWait: 5_000, timeout: holdMs + 30_000 });
}

async function countAdjustments(tenantId, employeeId) {
  return prisma.runWithTenant(tenantId, async () => {
    const rows = await prisma.$queryRaw`
      SELECT COUNT(*)::int AS total FROM th_nomina_ajustes
      WHERE tenant_id = ${tenantId} AND employee_id = ${employeeId} AND status = 'activo'
    `;
    return Number(rows?.[0]?.total || 0);
  });
}

async function waitForHttp(url, attempts = 60) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (response.ok) return response.status;
    } catch {
      /* aun arrancando */
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`El servicio en ${url} no quedo disponible`);
}

function currentCommit() {
  try {
    return child.execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", cwd: ROOT }).trim();
  } catch {
    return "unknown";
  }
}

async function clickButtonByText(page, label, timeout = 30_000) {
  try {
    await page.waitForFunction((text) => {
      return [...document.querySelectorAll("button")].some((item) => (item.textContent || "").trim().startsWith(text) && !item.disabled);
    }, { timeout, polling: 500 }, label);
  } catch (error) {
    const seen = await page.evaluate(() => ({
      path: location.pathname,
      headline: (document.body.innerText || "").slice(0, 700),
      buttons: [...document.querySelectorAll("button")].map((item) => `${(item.textContent || "").trim().slice(0, 40)}${item.disabled ? " [deshabilitado]" : ""}`).slice(0, 40)
    })).catch(() => ({ path: "desconocido", headline: "", buttons: [] }));
    await page.screenshot({ path: path.join(EVIDENCE_DIR, `fallo-boton-${label.replace(/\s+/g, "-").slice(0, 24)}.png`), fullPage: true }).catch(() => undefined);
    throw new Error(`no se habilito el boton "${label}" en ${timeout}ms: ${JSON.stringify(seen).slice(0, 1200)}`);
  }
  await page.evaluate((text) => {
    const button = [...document.querySelectorAll("button")].find((item) => (item.textContent || "").trim().startsWith(text) && !item.disabled);
    button.click();
  }, label);
}

async function main() {
  let apiProcess = null;
  let webProcess = null;
  let browser = null;
  const cleanup = { tenantId: null, userId: null, roleId: null, employeeIds: [] };

  if (!fs.existsSync(CHROME)) throw new Error(`PREREQUISITO: no existe Chrome en ${CHROME}`);
  if (!fs.existsSync(path.join(WEB, ".next", "BUILD_ID"))) {
    throw new Error("PREREQUISITO: apps/web/.next/BUILD_ID no existe. Ejecuta `npm run build` en apps/web antes que `next start`.");
  }
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.mkdirSync(LOG_DIR, { recursive: true });

  try {
    result.certified_commit = currentCommit();

    // ---- A. Arranque de los dos servicios reales ----
    apiProcess = child.spawn(process.execPath, ["server.js"], {
      cwd: API,
      env: { ...process.env, PORT: String(API_PORT), DISABLE_REDIS: "true" },
      stdio: ["ignore", fs.openSync(path.join(LOG_DIR, "api.log"), "a"), fs.openSync(path.join(LOG_DIR, "api.log"), "a")]
    });
    await waitForHttp(`${API_URL}/health`);
    const health = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(5000) }).then((r) => r.json());
    check("api_health_ok", health?.status === "OK", { commit: result.certified_commit, modules: health?.modules });

    const nextBin = [path.join(WEB, "node_modules/next/dist/bin/next"), path.join(ROOT, "node_modules/next/dist/bin/next")]
      .find((candidate) => fs.existsSync(candidate));
    if (!nextBin) throw new Error("PREREQUISITO: no se encontro el binario de next en apps/web ni en la raiz del monorepo.");
    webProcess = child.spawn(process.execPath, [nextBin, "start", "-p", String(WEB_PORT), "-H", "127.0.0.1"], {
      cwd: WEB,
      env: { ...process.env, API_URL, NEXT_PUBLIC_API_URL: "", NODE_ENV: "production" },
      stdio: ["ignore", fs.openSync(path.join(LOG_DIR, "web.log"), "a"), fs.openSync(path.join(LOG_DIR, "web.log"), "a")]
    });
    await waitForHttp(`${WEB_URL}/login`);
    check("web_served_from_production_build", fs.existsSync(path.join(WEB, ".next", "BUILD_ID")), {
      build_id: fs.readFileSync(path.join(WEB, ".next", "BUILD_ID"), "utf8").trim(),
      web_url: WEB_URL
    });

    // ---- Fixtures: tenant con Talento Humano, rol con nomina editable, usuario y empleado ----
    const tenants = await prisma.tenant.findMany({ where: { active: true }, select: { id: true, name: true, active_modules: true } });
    const withHr = tenants.filter((tenant) => (Array.isArray(tenant.active_modules) ? tenant.active_modules.map((c) => String(c || "").trim().toLowerCase()) : []).some((code) => HR_CODES.includes(code)));
    const tenant = withHr.find((item) => /puebla|operaciones/i.test(String(item.name || ""))) || withHr[0];
    if (!tenant) throw new Error("No hay tenant con modulo Talento Humano en la base local.");
    cleanup.tenantId = tenant.id;

    const role = await admin.createRole(tenant.id, {
      name: `QA Aviso Concurrencia ${RUN_ID}`,
      description: "Rol temporal de certificacion de navegador con nomina editable (se desactiva al final).",
      permissions: { talento_humano: { view: true, edit: true }, nomina: { view: true, edit: true } }
    });
    cleanup.roleId = role.id;
    const user = await admin.createUser(tenant.id, {
      name: `Admin Aviso ${RUN_ID}`, first_names: "Admin", last_names: `Aviso ${RUN_ID}`,
      email: EMAIL, password: PASSWORD, role_id: role.id, company: "QA",
      document: `QABRS${RUN_ID}`.slice(0, 20), code: `${CODE_PREFIX}U${RUN_ID}`.slice(0, 24),
      department: "QA", position: "Administrador de pruebas", operational_classification: "administrativo",
      can_punch_time: false, can_be_assigned_routes: false, require_password_change: false
    });
    cleanup.userId = user.id;

    const employee = await prisma.runWithTenant(tenant.id, () => prisma.employee.create({
      data: {
        code: `${CODE_PREFIX}NOM${RUN_ID.slice(-8)}`.slice(0, 24),
        position: "Operario QA", department: "QA", salary_base: 1_300_000,
        hire_date: new Date(`${TODAY}T05:00:00.000Z`)
      }
    }));
    cleanup.employeeIds.push(employee.id);
    result.fixture = {
      tenant: { id: tenant.id, name: tenant.name },
      role: { id: role.id, name: role.name },
      admin_user: { id: user.id, email: EMAIL },
      employee: { id: employee.id, code: employee.code }
    };

    // El permiso que la ronda anterior dejo sin candado: sin payroll:write el POST debe dar 403.
    const anonymousPost = await fetch(`${API_URL}/api/v1/talento-humano/nomina/ajustes`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employee_id: employee.id, period_key: `mensual:${TODAY.slice(0, 8)}01:${TODAY.slice(0, 8)}31`, concept_code: "AJUSTE_MANUAL" })
    });
    check("adjustment_post_requires_session", [401, 403].includes(anonymousPost.status), { status: anonymousPost.status });

    // ---- B. Login real en navegador ----
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1100 });
    page.setDefaultTimeout(BROWSER_NAV_TIMEOUT);
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const text = String(message.text());
      // "Failed to load resource" es el eco del navegador ante cualquier HTTP >=400 ya registrado en
      // result.network; no es un error de la aplicacion.
      if (/^Failed to load resource/i.test(text)) return;
      result.console_errors.push(text.slice(0, 300));
    });
    page.on("pageerror", (error) => result.page_errors.push(String(error.message).slice(0, 300)));
    page.on("response", (response) => {
      const url = response.url();
      if (!url.includes("/api/v1/")) return;
      result.network.push({ method: response.request().method(), path: url.replace(/^https?:\/\/[^/]+/, ""), status: response.status() });
    });

    await page.goto(`${WEB_URL}/login`, { waitUntil: "domcontentloaded", timeout: BROWSER_NAV_TIMEOUT });
    await page.waitForSelector('input[name="email"]', { timeout: BROWSER_NAV_TIMEOUT });
    await page.type('input[name="email"]', EMAIL);
    await page.type('input[name="password"]', PASSWORD);
    await page.click('form button[type="submit"]');
    await page.waitForFunction(() => !location.pathname.endsWith("/login"), { timeout: BROWSER_NAV_TIMEOUT });
    check("real_browser_login", true, { path: await page.evaluate(() => location.pathname) });

    await page.goto(`${WEB_URL}/dashboard/talento-humano/nomina`, { waitUntil: "domcontentloaded", timeout: BROWSER_NAV_TIMEOUT });
    await clickButtonByText(page, "Consultar periodo");
    await page.waitForSelector('[data-testid="ibc-adjustment-employee"]', { timeout: BROWSER_NAV_TIMEOUT });
    await page.waitForFunction(
      (id) => [...document.querySelectorAll('[data-testid="ibc-adjustment-employee"] option')].some((option) => option.value === String(id)),
      { timeout: 30_000 },
      employee.id
    );
    check("browser_novelties_form_ready", true, { employee_id: employee.id });

    const adjustmentsPath = "/api/v1/talento-humano/nomina/ajustes";
    async function addAdjustmentAndWaitForPost() {
      // Nunca se lanza desde dentro del handler: un error en un listener de puppeteer mata el proceso
      // y dejaria los fixtures de certificacion activos en la base.
      const responsePromise = new Promise((resolve, reject) => {
        const onResponse = (response) => {
          if (!response.url().includes(adjustmentsPath) || response.request().method() !== "POST") return;
          page.off("response", onResponse);
          resolve(response);
        };
        const timer = setTimeout(() => {
          page.off("response", onResponse);
          reject(new Error(`el POST a ${adjustmentsPath} no respondio en ${BUSY_WAIT_MS}ms`));
        }, BUSY_WAIT_MS);
        page.on("response", onResponse);
      });
      await page.click('[data-testid="ibc-add-adjustment"]');
      return responsePromise;
    }

    async function bannerText() {
      await page.waitForFunction(() => {
        const nodes = [...document.querySelectorAll("p")].filter((node) => /Otra persona|No fue posible|caido|Error interno|Backend/i.test(node.textContent || ""));
        return nodes.length > 0;
      }, { timeout: 15_000 }).catch(() => undefined);
      return page.evaluate(() => document.body.innerText);
    }

    // ---- C/D/E. Contencion real: el lock sostenido mas alla del deadline ----
    const scope = payrollScope(tenant.id, employee.id);
    await page.select('[data-testid="ibc-adjustment-employee"]', String(employee.id));
    check("browser_employee_selected", (await page.$eval('[data-testid="ibc-adjustment-employee"]', (node) => node.value)) === String(employee.id), {
      selected: await page.$eval('[data-testid="ibc-adjustment-employee"]', (node) => node.value)
    });

    const holder = holdScope(scope, HOLD_OVER_DEADLINE_MS);
    await new Promise((resolve) => setTimeout(resolve, LEADER_DELAY_MS));
    const startedAt = Date.now();
    const busyResponse = await addAdjustmentAndWaitForPost();
    const busyBody = await busyResponse.json().catch(() => ({}));
    const busyLatency = Date.now() - startedAt;
    const busyScreen = await bannerText();
    await page.screenshot({ path: path.join(EVIDENCE_DIR, "01-aviso-concurrencia.png"), fullPage: true });
    await holder;

    result.observations.contencion = {
      status: busyResponse.status(), code: busyBody?.code || null, request_id: busyBody?.request_id || null,
      latency_ms: busyLatency, server_message: busyBody?.error || null
    };
    check("contention_post_returns_503", busyResponse.status() === 503, { status: busyResponse.status(), code: busyBody?.code });
    check("contention_busy_code", busyBody?.code === "AJUSTE_NOMINA_CONCURRENCIA_TEMPORAL", { code: busyBody?.code });
    check("contention_never_500", busyResponse.status() !== 500 && !/P2028/i.test(JSON.stringify(busyBody)), { body: busyBody });
    check("contention_gives_up_within_budget", busyLatency >= CONTENTION_DEADLINE_MS - 1_000 && busyLatency < CONTENTION_DEADLINE_MS + 8_000, {
      latency_ms: busyLatency, deadline_ms: CONTENTION_DEADLINE_MS
    });
    check("browser_shows_friendly_busy_message", /Otra persona está guardando ese mismo registro/.test(busyScreen), {
      fragmento: (busyScreen.match(/[^\n]*Otra persona[^\n]*/) || [""])[0].slice(0, 220)
    });
    check("browser_message_reassures_work_is_kept", /tu información no se perdió/.test(busyScreen), {});
    check("browser_never_announces_backend_crash", !/Backend no disponible|caida del backend|El backend está caído|Error interno del servidor/i.test(busyScreen), {});
    check("browser_never_shows_raw_json", !/\{"error"\s*:/.test(busyScreen), {});
    check("browser_keeps_form_selection", (await page.$eval('[data-testid="ibc-adjustment-employee"]', (node) => node.value)) === String(employee.id), {
      selected: await page.$eval('[data-testid="ibc-adjustment-employee"]', (node) => node.value)
    });
    check("contention_persisted_nothing", (await countAdjustments(tenant.id, employee.id)) === 0);

    // ---- F/G. Control positivo: el mismo clic, ya sin contencion ----
    const okResponse = await addAdjustmentAndWaitForPost();
    const okBody = await okResponse.json().catch(() => ({}));
    // El aviso de exito llega despues de recargar el listado base, no con la cabecera de la respuesta.
    await page.waitForFunction(() => /Ajuste agregado/.test(document.body.innerText || ""), { timeout: 30_000, polling: 500 }).catch(() => undefined);
    const okScreen = await page.evaluate(() => document.body.innerText);
    await page.screenshot({ path: path.join(EVIDENCE_DIR, "02-guardado-tras-reintento.png"), fullPage: true });
    result.observations.reintento = { status: okResponse.status(), id: okBody?.id ?? null };
    check("retry_after_release_succeeds", [200, 201].includes(okResponse.status()), { status: okResponse.status(), body: okBody });
    check("browser_shows_success_after_retry", /Ajuste agregado/.test(okScreen), {
      fragmento: (okScreen.match(/[^\n]*Ajuste agregado[^\n]*/) || [""])[0].slice(0, 160)
    });
    check("adjustment_persisted_exactly_once", (await countAdjustments(tenant.id, employee.id)) === 1, { employee_id: employee.id });

    // ---- H. Higiene de la sesion ----
    const statusCodes = result.network.map((entry) => entry.status);
    check("session_had_no_500", !statusCodes.includes(500) && !statusCodes.includes(502) && !statusCodes.includes(504), {
      statuses_vistos: Array.from(new Set(statusCodes)).sort((a, b) => a - b)
    });
    check("session_had_no_page_errors", result.page_errors.length === 0, { page_errors: result.page_errors.slice(0, 5) });
    check("session_had_no_console_errors", result.console_errors.length === 0, { console_errors: result.console_errors.slice(0, 5) });

    result.status = "passed";
  } finally {
    const cleanupErrors = [];
    const purged = [];
    for (const employeeId of cleanup.employeeIds) {
      const removed = await prisma.runWithTenant(cleanup.tenantId, async () => {
        await prisma.$executeRawUnsafe(`DELETE FROM th_nomina_ajustes WHERE tenant_id = $1 AND employee_id = $2`, cleanup.tenantId, employeeId).catch(() => undefined);
        return prisma.employee.delete({ where: { id: employeeId } }).catch((e) => { cleanupErrors.push(`empleado ${employeeId}: ${e.message}`); return null; });
      }).catch((e) => { cleanupErrors.push(`purge ${employeeId}: ${e.message}`); return null; });
      purged.push({ employee_id: employeeId, removed: Boolean(removed) });
    }
    const mirrorId = cleanup.userId ? await prisma.runWithTenant(cleanup.tenantId, () => prisma.employee.findFirst({
      where: { tenant_id: cleanup.tenantId, user_id: cleanup.userId }, select: { id: true }
    })).then((row) => (row ? row.id : null)).catch((e) => { cleanupErrors.push(`empleado espejo: ${e.message}`); return null; }) : null;
    if (cleanup.userId) await admin.setUserActive(cleanup.tenantId, cleanup.userId, false).catch((e) => cleanupErrors.push(`user: ${e.message}`));
    if (cleanup.roleId) await admin.setRoleActive(cleanup.tenantId, cleanup.roleId, false).catch((e) => cleanupErrors.push(`role: ${e.message}`));
    if (mirrorId) {
      await prisma.runWithTenant(cleanup.tenantId, () => prisma.employee.delete({ where: { id: mirrorId } })).catch((e) => cleanupErrors.push(`espejo ${mirrorId}: ${e.message}`));
    }
    result.cleanup = {
      employees_purged: purged,
      mirror_employee_removed: Boolean(mirrorId),
      user_deactivated: Boolean(cleanup.userId),
      role_deactivated: Boolean(cleanup.roleId),
      errors: cleanupErrors
    };
    if (result.status !== "passed") result.status = "failed";
    result.finished_at = new Date().toISOString();
    if (browser) await browser.close().catch(() => undefined);
    for (const proc of [webProcess, apiProcess]) {
      if (!proc || proc.killed) continue;
      proc.kill("SIGTERM");
    }
    fs.writeFileSync(path.join(EVIDENCE_DIR, "browser-certification.json"), `${JSON.stringify(result, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2)}\n`);
    await prisma.$disconnect().catch(() => undefined);
  }

  process.exitCode = result.status === "passed" ? 0 : 1;
}

main().catch((error) => {
  result.status = "failed";
  result.failure = String(error?.message || error).slice(0, 800);
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE_DIR, "browser-certification.json"), `${JSON.stringify(result, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2)}\n`);
  console.error(`[cert] FALLO: ${result.failure}`);
  process.exitCode = 1;
});
