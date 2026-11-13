import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import puppeteer from "puppeteer-core";

const baseUrl = process.env.APEX_LOCAL_WEB_URL || "http://127.0.0.1:3001";
const email = process.env.APEX_LOCAL_UI_EMAIL || "demo@apex.local";
const password = process.env.APEX_LOCAL_UI_PASSWORD || "test1234";
const output = process.argv.find((value) => value.startsWith("--output="))?.slice(9) || "docs/qa/evidence/ui-ux-phase-three-collaboration-20260909/browser-certification.json";
const executablePath = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", `${process.env.LOCALAPPDATA || ""}/Google/Chrome/Application/chrome.exe`].find((candidate) => candidate && fs.existsSync(candidate));
if (!executablePath) throw new Error("Chrome no está disponible para la certificación local");

const browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
const first = await browser.newPage();
const checks = [];
const record = (name, passed, detail = {}) => { checks.push({ name, passed, detail }); assert.equal(passed, true, `${name}: ${JSON.stringify(detail)}`); };
async function waitHydration(target) {
  await target.waitForFunction(() => Boolean(document.documentElement.dataset.density), { timeout: 20000 });
}
async function openWorkspaceTools(target) {
  await waitHydration(target);
  await target.waitForSelector('button[aria-label="Herramientas"]', { timeout: 5000 });
  await target.evaluate(() => document.querySelector('button[aria-label="Herramientas"]')?.click());
  await target.waitForFunction(() => [...document.querySelectorAll('[role="dialog"]')].some((dialog) => dialog.textContent?.includes("Ventanas de trabajo del escritorio APEX")), { timeout: 5000 });
}
async function openPresence(target) {
  await openWorkspaceTools(target);
  await target.evaluate(() => document.querySelector('button[aria-label="Abrir equipo"]')?.click());
  await target.waitForFunction(() => [...document.querySelectorAll('[role="dialog"]')].some((dialog) => dialog.textContent?.includes("Equipo activo")), { timeout: 5000 });
}
// El envio solo existe cuando el formulario hidrato: en dev el primer clic puede llegar antes
// y la hidratacion limpia lo tecleado. Se rellena y se envia de nuevo, acotado, para medir la
// entrada al dashboard y no la ventana de hidratacion.
async function submitLogin(target) {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await target.evaluate(() => document.querySelectorAll("input").forEach((input) => { input.value = ""; })).catch(() => {});
    await target.type('input[name="email"]', email).catch(() => {});
    await target.type('input[name="password"]', password).catch(() => {});
    await target.click('button[type="submit"]').catch(() => {});
    const landed = await target.waitForFunction(() => window.location.pathname.startsWith("/dashboard"), { timeout: 5000 }).then(() => true).catch(() => false);
    if (landed) return;
  }
  throw new Error(`No fue posible entrar al dashboard desde ${target.url()}`);
}

try {
  await first.setViewport({ width: 1440, height: 900 });
  await first.goto(`${baseUrl}/login`, { waitUntil: "networkidle0" });
  await first.waitForSelector('input[name="email"]');
  await submitLogin(first);
  await first.waitForSelector('button[aria-label="Herramientas"]');
  await first.goto(`${baseUrl}/dashboard/inventario/productos/nuevo`, { waitUntil: "domcontentloaded" });
  await first.waitForSelector('button[aria-label="Herramientas"]');
  await openPresence(first);
  record("presence_panel_available", await first.evaluate(() => document.body.innerText.includes("Equipo activo")));
  record("privacy_notice_visible", await first.evaluate(() => document.body.innerText.includes("no comparte el contenido de los formularios")));

  const second = await browser.newPage();
  await second.setViewport({ width: 1440, height: 900 });
  await second.goto(`${baseUrl}/dashboard/inventario/productos/nuevo`, { waitUntil: "domcontentloaded" });
  await second.waitForSelector("input");
  await waitHydration(second);
  await first.waitForSelector('[aria-label="2 sesiones activas"]', { timeout: 8_000 });
  record("second_session_detected", true);

  // La pestaña de fondo no dispara focusin con focus() programatico; se entra al campo y se
  // teclea como un usuario, que es la conducta que el aviso debe detectar.
  await second.click("input");
  await second.keyboard.type("x");
  await first.waitForFunction(() => document.body.innerText.includes("Edición concurrente"), { timeout: 8_000 });
  record("concurrent_edit_warning", await first.evaluate(() => document.body.innerText.includes("Verifica los cambios antes de guardar")));
  await second.close();
  await first.waitForFunction(() => !document.body.innerText.includes("Edición concurrente"), { timeout: 8_000 });
  record("session_leave_propagated", true);
} finally {
  await browser.close();
}

const result = { certification: "ui-ux-phase-three-collaboration-local", environment: "LOCAL", baseUrl, generatedAt: new Date().toISOString(), status: checks.every((check) => check.passed) ? "passed" : "failed", checks };
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(`CERTIFICACIÓN COLABORACIÓN FASE 3 ${result.status.toUpperCase()}: ${checks.length} comprobaciones`);
