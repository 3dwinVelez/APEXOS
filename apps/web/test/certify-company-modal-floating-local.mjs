import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const webPort = Number(process.env.APEX_MODAL_CERT_PORT || 3311);
const stubPort = Number(process.env.APEX_MODAL_CERT_STUB_PORT || 3312);
const outputFlag = process.argv.find((value) => value.startsWith("--output="));
const OUTPUT = path.resolve(ROOT, outputFlag?.slice("--output=".length) || "docs/qa/evidence/modal-empresa-flotante-20261109/modal-empresa-flotante-local.json");
const EVIDENCE_DIR = path.dirname(OUTPUT);
const baseUrl = `http://localhost:${webPort}`;
const USER_ID = "11111111-2222-3333-4444-555555555555";
const COMPANY_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const payload = Buffer.from(JSON.stringify({ sub: USER_ID, iss: "https://cert.supabase.co/auth/v1", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
const token = `eyJhbGciOiJub25lIn0.${payload}.certificacion`;

const COMPANY = {
  company_id: COMPANY_ID,
  company_name: "Impordata Certificacion",
  legal_name: "Impordata Certificacion SAS",
  tax_id: "900123456-7",
  email: "cert@apex.local",
  phone: "+57 300 000 0000",
  company_type: "company",
  parent_company_id: null,
  parent_company_name: null,
  business_line: "Distribucion",
  country: "Colombia",
  city: "Medellin",
  address: "Calle 1 # 2-3",
  status: "active",
  plan_id: null,
  plan_code: null,
  plan_name: "Suscripcion manual",
  enabled_modules: 3,
  blocked_modules: 1
};

const MODULES = [
  { company_module_id: "m1", company_id: COMPANY_ID, company_name: COMPANY.company_name, module_id: "mod-1", module_code: "administracion", module_name: "Administracion", description: "Empresas, roles y maestros.", route: "/dashboard/administracion", icon: "shield", sort_order: 1, enabled: true, source: "manual", plan_code: null, plan_name: null },
  { company_module_id: "m2", company_id: COMPANY_ID, company_name: COMPANY.company_name, module_id: "mod-2", module_code: "inventario", module_name: "Inventario", description: "Control de articulos y existencias.", route: "/dashboard/inventario", icon: "box", sort_order: 2, enabled: false, source: "plan", plan_code: null, plan_name: null },
  { company_module_id: "m3", company_id: COMPANY_ID, company_name: COMPANY.company_name, module_id: "mod-3", module_code: "ventas", module_name: "Ventas", description: "Cotizaciones y pedidos.", route: "/dashboard/ventas", icon: "cart", sort_order: 3, enabled: true, source: "plan", plan_code: null, plan_name: null }
];

const checks = [];
function record(name, detail, passed) {
  checks.push({ name, passed, detail });
  assert.equal(passed, true, `${name}: ${JSON.stringify(detail)}`);
}

function startStub() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", `http://127.0.0.1:${stubPort}`);
    const headers = {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "*"
    };
    if (req.method === "OPTIONS") {
      res.writeHead(204, headers);
      res.end();
      return;
    }
    const json = (status, body) => {
      res.writeHead(status, headers);
      res.end(JSON.stringify(body));
    };
    const route = url.pathname;
    if (route === "/rest/v1/platform_admins") return json(200, [{ user_id: USER_ID, status: "active" }]);
    if (route === "/rest/v1/v_user_companies") return json(200, [{ company_id: COMPANY_ID, company_name: COMPANY.company_name, role: "owner" }]);
    if (route === "/rest/v1/v_company_module_status") return json(200, []);
    if (route === "/rest/v1/employees") return json(200, []);
    if (route === "/rest/v1/v_platform_companies") return json(200, [COMPANY]);
    if (route === "/rest/v1/v_platform_company_module_access") return json(200, MODULES);
    if (route.startsWith("/api/platform/company-sessions")) return json(503, { message: "stub sin sesiones" });
    return json(404, { message: "stub" });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(stubPort, "127.0.0.1", () => resolve(server));
  });
}

async function waitForUrl(url, timeoutMs = 180000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) return true;
    } catch {
      // El servidor todavia no escucha.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  child.kill("SIGTERM");
}

const executablePath = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", `${process.env.LOCALAPPDATA || ""}/Google/Chrome/Application/chrome.exe`].find((value) => value && fs.existsSync(value));
if (!executablePath) throw new Error("Chrome no disponible");

const evidence = {
  certification: "modal-empresa-flotante-local",
  environment: "LOCAL",
  baseUrl,
  target: "/dashboard/administracion/suscripciones",
  generatedAt: new Date().toISOString(),
  checks: []
};

let stub;
let dev;
let browser;
let failure;
let serverLog = "";

try {
  stub = await startStub();
  dev = spawn(process.execPath, [path.join(ROOT, "scripts", "dev-web.js"), String(webPort)], {
    cwd: ROOT,
    env: {
      ...process.env,
      WEB_HOST: "localhost",
      WEB_PORT: String(webPort),
      NEXT_DIST_DIR: ".next-dev-company-modal",
      NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${stubPort}`,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "certificacion-anon-key",
      NEXT_PUBLIC_API_URL: `http://127.0.0.1:${stubPort}`
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  dev.stdout.on("data", (chunk) => { serverLog = `${serverLog}${chunk}`.slice(-8000); });
  dev.stderr.on("data", (chunk) => { serverLog = `${serverLog}${chunk}`.slice(-8000); });
  record("servidor_web_levantado", { url: baseUrl }, await waitForUrl(`${baseUrl}/login`));

  browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.evaluate((data) => {
    localStorage.setItem("token", data.token);
    localStorage.setItem("auth_provider", "supabase");
    localStorage.setItem("user_email", "cert@apex.local");
    localStorage.setItem("role_name", "superadmin");
    localStorage.setItem("apex_theme", "light");
  }, { token });

  await page.goto(`${baseUrl}/dashboard/administracion/suscripciones`, { waitUntil: "domcontentloaded", timeout: 120000 });
  const denied = await page.waitForFunction(() => {
    const heading = document.querySelector("h1");
    if (heading?.textContent?.includes("Acceso no autorizado")) return "denied";
    if (document.querySelector('button[title="Crear empresa"]')) return "ready";
    return false;
  }, { timeout: 90000 }).then((handle) => handle.jsonValue()).catch(() => "timeout");
  record("pantalla_de_empresas_disponible", { estado: denied }, denied === "ready");

  await page.evaluate(() => {
    document.documentElement.classList.remove("dark");
    document.documentElement.dataset.theme = "light";
    localStorage.setItem("apex_theme", "light");
  });

  await page.evaluate(() => window.scrollTo(0, 400));
  const before = await page.evaluate(() => {
    const trigger = document.querySelector('button[title="Crear empresa"]');
    const box = trigger.getBoundingClientRect();
    return { scrollY: window.scrollY, trigger: { x: box.x, y: box.y } };
  });

  await page.click('button[title="Crear empresa"]');
  await page.waitForSelector('[role="dialog"]', { timeout: 15000 });
  await page.waitForFunction(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const backdrop = dialog?.parentElement;
    if (!dialog || !backdrop) return false;
    return [...dialog.getAnimations(), ...backdrop.getAnimations()].every((animation) => animation.playState !== "running");
  }, { timeout: 10000 }).catch(() => null);

  const opened = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const backdrop = dialog?.parentElement;
    const dialogBox = dialog.getBoundingClientRect();
    const backdropBox = backdrop.getBoundingClientRect();
    const trigger = document.querySelector('button[title="Crear empresa"]');
    const triggerBox = trigger.getBoundingClientRect();
    const backdropStyle = getComputedStyle(backdrop);
    return {
      title: dialog.querySelector("h2")?.textContent?.trim(),
      portaled: backdrop.parentElement === document.body,
      insideTransition: Boolean(dialog.closest(".apex-page-enter")),
      insideMain: Boolean(document.getElementById("apex-main-content")?.contains(dialog)),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      backdrop: { x: backdropBox.x, y: backdropBox.y, width: backdropBox.width, height: backdropBox.height, background: backdropStyle.backgroundColor },
      dialog: { x: dialogBox.x, y: dialogBox.y, width: dialogBox.width, height: dialogBox.height, top: dialogBox.top, bottom: dialogBox.bottom, right: dialogBox.right, scrollOverflow: dialog.scrollWidth - dialog.clientWidth },
      bodyOverflow: getComputedStyle(document.body).overflow,
      scrollY: window.scrollY,
      trigger: { x: triggerBox.x, y: triggerBox.y }
    };
  });

  record("el_modal_abre_como_dialogo", { title: opened.title }, opened.title === "Crear empresa");
  record("el_modal_se_porta_al_body", { portaled: opened.portaled, insideTransition: opened.insideTransition, insideMain: opened.insideMain }, opened.portaled === true && opened.insideTransition === false && opened.insideMain === false);
  record("el_velo_cubre_toda_la_ventana", opened.backdrop, Math.abs(opened.backdrop.x) <= 1 && Math.abs(opened.backdrop.y) <= 1 && Math.abs(opened.backdrop.width - opened.viewport.width) <= 1 && Math.abs(opened.backdrop.height - opened.viewport.height) <= 1);
  record("el_velo_pinta_fondo_oscuro", { background: opened.backdrop.background }, !opened.backdrop.background.includes("rgba(0, 0, 0, 0)") && opened.backdrop.background !== "transparent");
  const centeredX = Math.abs((opened.dialog.x + opened.dialog.right) / 2 - opened.viewport.width / 2);
  const centeredY = Math.abs((opened.dialog.y + opened.dialog.bottom) / 2 - opened.viewport.height / 2);
  record("el_modal_flota_centrado_en_el_viewport", { centeredX, centeredY, dialog: opened.dialog, viewport: opened.viewport, scrollY: opened.scrollY }, centeredX <= 2 && centeredY <= 12);
  record("el_modal_no_se_recorta", { top: opened.dialog.top, bottom: opened.dialog.bottom, right: opened.dialog.right, height: opened.viewport.height, scrollOverflow: opened.dialog.scrollOverflow }, opened.dialog.top >= 0 && opened.dialog.bottom <= opened.viewport.height + 1 && opened.dialog.right <= opened.viewport.width + 1 && opened.dialog.scrollOverflow <= 1);
  record("el_modal_abre_como_panel_acotado", { width: opened.dialog.width, viewport: opened.viewport.width }, opened.dialog.width >= 600 && opened.dialog.width <= 760 && opened.dialog.width <= opened.viewport.width - 200);
  record("el_fondo_bloquea_el_scroll", { bodyOverflow: opened.bodyOverflow }, opened.bodyOverflow === "hidden");

  await fs.promises.mkdir(EVIDENCE_DIR, { recursive: true });

  const field = 'input[form="company-create-form"], #company-create-form input';
  await page.click(field);
  await page.keyboard.type("A");
  await page.keyboard.type("B");
  const typing = await page.evaluate((selector) => {
    const input = document.querySelector(selector);
    return { value: input?.value, focused: document.activeElement === input };
  }, field);
  record("el_foco_se_mantiene_al_escribir", typing, typing.focused === true && typing.value === "AB");

  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), { timeout: 10000 });
  const afterEscape = await page.evaluate(() => ({ focused: document.activeElement?.getAttribute("title") || "", bodyOverflow: getComputedStyle(document.body).overflow }));
  record("escape_cierra_y_devuelve_el_foco", afterEscape, afterEscape.focused === "Crear empresa" && afterEscape.bodyOverflow !== "hidden");

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.click('button[title="Crear empresa"]');
  await page.waitForSelector('[role="dialog"]', { timeout: 15000 });
  await page.waitForFunction(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const backdrop = dialog?.parentElement;
    if (!dialog || !backdrop) return false;
    return [...dialog.getAnimations(), ...backdrop.getAnimations()].every((animation) => animation.playState !== "running");
  }, { timeout: 10000 }).catch(() => null);
  const reopenedTop = await page.evaluate(() => document.querySelector('[role="dialog"]').getBoundingClientRect().top);
  record("el_modal_conserva_la_posicion_con_la_pagina_desplazada", { topConLaPaginaDesplazada: opened.dialog.top, topArribaDelTodo: reopenedTop, scrollAlAbrir: before.scrollY }, Math.abs(opened.dialog.top - reopenedTop) <= 2 && before.scrollY > 0);
  const lightBackground = await page.evaluate(() => getComputedStyle(document.querySelector('[role="dialog"]')).backgroundColor);
  record("el_modal_pinta_la_superficie_clara", { background: lightBackground }, lightBackground === "rgb(255, 255, 255)");
  await page.screenshot({ path: path.join(EVIDENCE_DIR, "company-modal-light.png") });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[role="dialog"]')).backgroundColor !== "rgb(255, 255, 255)", { timeout: 5000 }).catch(() => null);
  const darkTheme = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const title = dialog.querySelector("h2");
    const parse = (value) => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const luminance = (rgb) => rgb.map((channel) => {
      const value = channel / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    }).reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0);
    const background = parse(getComputedStyle(dialog).backgroundColor);
    const ink = parse(getComputedStyle(title).color);
    const light = luminance(background);
    const dark = luminance(ink);
    return {
      background: getComputedStyle(dialog).backgroundColor,
      ink: getComputedStyle(title).color,
      contrast: (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05)
    };
  });
  record("el_modal_respeta_el_tema_oscuro", { lightBackground, ...darkTheme }, darkTheme.background !== "rgb(255, 255, 255)" && darkTheme.background !== lightBackground && darkTheme.contrast >= 4.5);
  await page.screenshot({ path: path.join(EVIDENCE_DIR, "company-modal-dark.png") });

  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), { timeout: 10000 });

  await page.click('button[title="Crear empresa"]');
  await page.waitForSelector('[role="dialog"]', { timeout: 15000 });
  const cancelButton = await page.$('[role="dialog"] button[type="button"]');
  assert.notEqual(cancelButton, null, "boton Cancelar no encontrado");
  await page.$$eval('[role="dialog"] button[type="button"]', (buttons) => {
    const cancel = buttons.find((button) => button.textContent?.trim() === "Cancelar");
    cancel?.click();
  });
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), { timeout: 10000 });
  record("cancelar_cierra_el_modal", { cerrado: true }, true);
} catch (error) {
  failure = error;
} finally {
  evidence.checks = checks;
  evidence.status = failure ? "failed" : checks.every((check) => check.passed) ? "passed" : "failed";
  if (failure) evidence.error = String(failure.message || failure);
  evidence.serverLogTail = serverLog.split(/\r?\n/).filter(Boolean).slice(-20).join("\n");
  await fs.promises.mkdir(EVIDENCE_DIR, { recursive: true });
  await fs.promises.writeFile(OUTPUT, `${JSON.stringify(evidence, null, 2)}\n`);
  if (browser) await browser.close().catch(() => null);
  stopProcess(dev);
  if (stub) stub.close();
}

if (failure) {
  console.error(`CERTIFICACION MODAL EMPRESA FALLIDA: ${failure.message}`);
  process.exit(1);
}
console.log(`CERTIFICACION MODAL EMPRESA ${evidence.status.toUpperCase()}: ${checks.length} comprobaciones`);
