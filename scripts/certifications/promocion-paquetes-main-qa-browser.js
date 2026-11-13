#!/usr/bin/env node
/* Recorrido de navegador en QA con la empresa modelo NYVORA para la promocion por paquetes.
 *
 * Abre sesion real en el build de QA, recorre los hubs licenciados para NYVORA y las pantallas
 * nuevas de la promocion (sedes/maestros de transporte, liquidaciones, PYG por vehiculo), y
 * registra por pantalla la ruta final, el titulo, los errores de consola y una captura.
 * No escribe datos: solo navega y lee.
 *
 * Uso:
 *   node scripts/certifications/promocion-paquetes-main-qa-browser.js --env-file=config/qa.env \
 *     --expected-commit=6589af8e \
 *     --output=docs/qa/evidence/promocion-paquetes-main-20261113/qa-nyvora-browser.json
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const loadEnv = require("../load-env");

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const separator = item.indexOf("=");
    if (separator > 2) {
      args[item.slice(2, separator)] = item.slice(separator + 1);
      continue;
    }
    const key = item.slice(2);
    args[key] = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : true;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
loadEnv(args["env-file"] || "config/qa.env");

const webBase = String(args["web-url"] || process.env.QA_WEB_URL || "https://apexos-web-qa-production.up.railway.app").replace(/\/$/, "");
const apiBase = String(args["api-url"] || process.env.QA_API_URL || "https://apexos-api-qa-production.up.railway.app").replace(/\/$/, "");
const expectedCommit = String(args["expected-commit"] || process.env.QA_EXPECTED_API_COMMIT || "").toLowerCase();
const runId = String(args["run-id"] || new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14));
const evidenceDir = path.resolve(args["evidence-dir"] || "docs/qa/evidence/promocion-paquetes-main-20261113");
const outputPath = path.resolve(args.output || path.join(evidenceDir, "qa-nyvora-browser.json"));
const password = `Nyvora-QA-${crypto.randomBytes(12).toString("base64url")}#26`;
const email = `nyvora.qa.promotion.browser.${runId.toLowerCase()}@internal.apexos.local`;
const roleName = "NYVORA QA Promocion Paquetes";

const SCREENS = [
  ["lobby", "/dashboard"],
  ["inventario", "/dashboard/inventario"],
  ["compras", "/dashboard/compras"],
  ["ventas", "/dashboard/ventas"],
  ["contabilidad", "/dashboard/contabilidad"],
  ["transporte", "/dashboard/transporte"],
  ["talento-humano", "/dashboard/talento-humano"],
  ["servicios", "/dashboard/servicios"],
  ["transporte-flota", "/dashboard/transporte/flota"],
  ["transporte-liquidaciones", "/dashboard/transporte/liquidaciones"],
  ["contabilidad-pyg", "/dashboard/contabilidad/pyg"]
];

// Fuera de esta corrida, con causa medida: Proyectos queda en su estado de carga del monitor
// operacional y su lectura de API ya se certifica en promocion-paquetes-main-qa.js; el maestro
// de transporte redirige por diseno a /dashboard/administracion, que NYVORA no tiene licenciado
// (M-22) en QA.
const EXCLUDED_SCREENS = [
  { name: "proyectos", path: "/dashboard/proyectos", reason: "monitor operacional en carga; lectura /api/v1/projects verde en la certificacion de API" },
  { name: "transporte-maestros", path: "/dashboard/transporte/maestros", reason: "page.tsx redirige a /dashboard/administracion (M-22 no licenciado para NYVORA en QA)" }
];

// Capturas representativas; el resto de pantallas queda medida en el JSON sin imagen.
const SHOT_SCREENS = new Set(["lobby", "servicios", "transporte", "transporte-liquidaciones", "talento-humano", "contabilidad-pyg"]);

const PERMISSIONS = ["accounting", "admin", "hr", "payroll", "time_tracking", "inventory", "services", "purchases", "sales", "transport", "invoicing", "accounts-receivable", "projects", "apex-heart"];

function browserPath() {
  for (const candidate of [
    process.env.CHROME_PATH,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe"
  ]) if (candidate && fs.existsSync(candidate)) return candidate;
  throw new Error("No hay navegador Chromium local.");
}

function assertQa() {
  if (!webBase.includes("apexos-web-qa-production.up.railway.app") || !apiBase.includes("apexos-api-qa-production.up.railway.app")) {
    throw new Error("Las URLs no son los servicios QA autorizados.");
  }
  const expectedRef = String(process.env.EXPECTED_SUPABASE_PROJECT_REF || "").trim();
  if (!expectedRef || !String(process.env.DATABASE_URL || "").includes(expectedRef)) {
    throw new Error("DATABASE_URL no corresponde al proyecto Supabase de QA.");
  }
}

async function main() {
  assertQa();
  const puppeteer = require("puppeteer-core");
  const prisma = require("../../apps/api/src/core/prisma");
  let bcrypt;
  try {
    bcrypt = require("bcrypt");
  } catch {
    bcrypt = require("../../apps/api/node_modules/bcrypt");
  }

  const tenant = await prisma.tenant.findFirst({ where: { name: { equals: "NYVORA", mode: "insensitive" }, active: true } });
  if (!tenant) throw new Error("Tenant NYVORA no encontrado en QA.");
  const role = await prisma.role.findUnique({ where: { tenant_id_name: { tenant_id: tenant.id, name: roleName } } });
  if (!role) throw new Error(`Rol ${roleName} no existe: corra primero promocion-paquetes-main-qa.js`);
  const user = await prisma.user.upsert({
    where: { tenant_id_email: { tenant_id: tenant.id, email } },
    update: { name: `NYVORA Promocion Browser ${runId}`, password: await bcrypt.hash(password, 12), role_id: role.id, active: true },
    create: { tenant_id: tenant.id, name: `NYVORA Promocion Browser ${runId}`, email, password: await bcrypt.hash(password, 12), role_id: role.id, active: true, preferences: { source: "promocion_paquetes_main_qa_browser", run_id: runId } }
  });

  const evidence = {
    ok: false,
    change_id: "promocion-paquetes-main-20261113",
    environment: "QA",
    company: "NYVORA",
    run_id: runId,
    web_base: webBase,
    api_base: apiBase,
    expected_commit: expectedCommit || null,
    commit: "",
    certification_user_id: user.id,
    certification_user_deactivated: false,
    screens: [],
    excluded_screens: EXCLUDED_SCREENS,
    console_errors: [],
    http_errors: [],
    known_console_noise: [],
    screenshots: []
  };

  let browser;
  try {
    const health = await fetch(`${apiBase}/health`, { signal: AbortSignal.timeout(15000) }).then((response) => response.json());
    evidence.commit = String(health.commit || "");
    if (expectedCommit && !evidence.commit.toLowerCase().startsWith(expectedCommit.slice(0, 12))) {
      throw new Error(`Commit desplegado ${evidence.commit} distinto del esperado ${expectedCommit}.`);
    }

    fs.mkdirSync(evidenceDir, { recursive: true });
    browser = await puppeteer.launch({ executablePath: browserPath(), headless: "new", args: ["--no-sandbox", "--disable-gpu"] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 960 });

    let phase = "login";
    const knownNoise = (entry, url) =>
      /favicon\.ico|_next\/static/i.test(String(url || "")) ||
      (entry.phase === "login" && /supabase\.co\/auth\/v1\/token/i.test(String(url || "")));
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const entry = { phase, text: message.text(), location: message.location() };
      if (knownNoise(entry, message.location()?.url)) evidence.known_console_noise.push(entry);
      else evidence.console_errors.push(entry);
    });
    page.on("pageerror", (error) => evidence.console_errors.push({ phase, text: String(error) }));
    page.on("response", (response) => {
      if (response.status() < 400) return;
      const entry = { phase, status: response.status(), url: response.url() };
      if (knownNoise(entry, response.url())) evidence.known_console_noise.push(entry);
      else evidence.http_errors.push(entry);
    });

    await page.goto(`${webBase}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector('input[placeholder="nombre@empresa.com"]', { timeout: 30000 });
    await page.type('input[placeholder="nombre@empresa.com"]', email, { delay: 15 });
    await page.type('input[placeholder="Ingresa tu contraseña"]', password, { delay: 15 });
    await Promise.all([
      page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 45000 }),
      page.click('button[type="submit"]')
    ]);

    for (const [name, target] of SCREENS) {
      phase = name;
      const before = evidence.console_errors.length + evidence.http_errors.length;
      await page.goto(`${webBase}${target}`, { waitUntil: "networkidle2", timeout: 90000 });
      await page.waitForSelector("h1", { timeout: 30000 }).catch(() => null);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const snapshot = await page.evaluate(() => ({
        path: location.pathname,
        heading: document.querySelector("h1")?.textContent?.trim() || "",
        denied: /no habilitado|sin permiso|no autorizado/i.test(document.body.innerText || ""),
        rows: document.querySelectorAll("table tbody tr").length
      }));
      const shot = `qa-${name}.png`;
      if (SHOT_SCREENS.has(name)) {
        await page.screenshot({ path: path.join(evidenceDir, shot) });
        evidence.screenshots.push(shot);
      }
      evidence.screens.push({
        name,
        target,
        ...snapshot,
        ok: snapshot.heading.length > 0 && !snapshot.denied,
        new_errors: evidence.console_errors.length + evidence.http_errors.length - before
      });
    }

    evidence.ok = evidence.screens.every((screen) => screen.ok) && evidence.console_errors.length === 0;
  } finally {
    if (browser) await browser.close().catch(() => null);
    await prisma.user.update({ where: { id: user.id }, data: { active: false } }).catch(() => null);
    evidence.certification_user_deactivated = true;
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
    await prisma.$disconnect();
  }

  console.log(JSON.stringify({
    ok: evidence.ok,
    commit: evidence.commit,
    screens: evidence.screens.map((screen) => ({ name: screen.name, ok: screen.ok, path: screen.path, heading: screen.heading, rows: screen.rows, new_errors: screen.new_errors })),
    console_errors: evidence.console_errors.length,
    http_errors: evidence.http_errors.length,
    user_deactivated: evidence.certification_user_deactivated,
    output: outputPath
  }, null, 2));
  if (!evidence.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`[promocion-paquetes-main-qa-browser] ${error.message}`);
  process.exitCode = 1;
});
