import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import puppeteer from "puppeteer-core";

const baseUrl = process.env.APEX_LOCAL_WEB_URL || "http://127.0.0.1:3001";
const apiUrl = process.env.APEX_LOCAL_API_URL || "http://127.0.0.1:3000";
const email = process.env.APEX_LOCAL_UI_EMAIL || "demo@apex.local";
const password = process.env.APEX_LOCAL_UI_PASSWORD || "test1234";
const output = process.argv.find((value) => value.startsWith("--output="))?.slice(9) || "docs/qa/evidence/ui-ux-phase-three-accessibility-20260909/browser-certification.json";
const executablePath = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", `${process.env.LOCALAPPDATA || ""}/Google/Chrome/Application/chrome.exe`].find((value) => value && fs.existsSync(value));
if (!executablePath) throw new Error("Chrome no disponible");

const browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
const checks = [];
const record = (name, passed, detail = {}) => { checks.push({ name, passed, detail }); assert.equal(passed, true, `${name}: ${JSON.stringify(detail)}`); };
let storageKey = "";
let previous = null;

try {
  await page.setViewport({ width: 1440, height: 900 });
  const authResponse = await fetch(`${apiUrl}/api/v1/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  assert.equal(authResponse.ok, true, `No fue posible autenticar la certificación: ${authResponse.status}`);
  const auth = await authResponse.json();
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.evaluate(({ loginEmail, data }) => {
    localStorage.setItem("token", data.token);
    localStorage.setItem("refresh", data.refresh || "");
    localStorage.setItem("auth_provider", "local");
    localStorage.setItem("user_email", loginEmail);
    localStorage.setItem("role_name", data.user?.role || "");
    localStorage.setItem("role_permissions", JSON.stringify(data.user?.role_permissions || []));
    localStorage.setItem("tenant_active_modules", JSON.stringify(data.tenant?.active_modules || []));
    localStorage.setItem("apexos_company_id", data.tenant?.company_id || data.tenant?.id || "");
  }, { loginEmail: email, data: auth });
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('button[aria-label="Preferencias de experiencia"]', { timeout: 30_000 });
  ({ storageKey, previous } = await page.evaluate(() => { const key = `apex_experience_v1:${(localStorage.getItem("user_email") || "anonymous").toLocaleLowerCase()}`; return { storageKey: key, previous: localStorage.getItem(key) }; }));

  await page.click('button[aria-label="Preferencias de experiencia"]');
  await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Alto contraste")?.click());
  await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Reducir movimiento")?.click());
  record("accessible_preferences_applied", await page.evaluate(() => document.documentElement.dataset.contrast === "high" && document.documentElement.dataset.reducedMotion === "true"));

  const routes = ["/dashboard/inventario/productos", "/dashboard/compras", "/dashboard/ventas", "/dashboard/reportes/apex-heart"];
  for (const route of routes) {
    await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("main h1", { timeout: 20_000 });
    const audit = await page.evaluate(() => ({
      h1: document.querySelectorAll("main h1").length,
      main: document.querySelectorAll("main").length,
      skip: document.querySelectorAll('.apex-skip-link[href="#apex-main-content"]').length,
      unnamedButtons: [...document.querySelectorAll("button")].filter((element) => !element.getAttribute("aria-label") && !element.textContent?.trim()).length,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      contrast: document.documentElement.dataset.contrast,
      reducedMotion: document.documentElement.dataset.reducedMotion,
    }));
    record(`landmarks_${route.split("/").pop()}`, audit.main === 1 && audit.h1 === 1 && audit.skip === 1, audit);
    record(`labels_and_layout_${route.split("/").pop()}`, audit.unnamedButtons === 0 && !audit.horizontalOverflow && audit.contrast === "high" && audit.reducedMotion === "true", audit);
  }

  await page.keyboard.down("Control"); await page.keyboard.press("KeyK"); await page.keyboard.up("Control");
  await page.waitForSelector('[role="dialog"][aria-modal="true"]');
  record("keyboard_shortcut_focuses_palette", await page.evaluate(() => document.activeElement?.getAttribute("role") === "combobox"));
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector('[role="dialog"][aria-modal="true"]'));
  await new Promise((resolve) => setTimeout(resolve, 50));
  record("escape_restores_trigger_focus", await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Centro de comandos" && !document.querySelector('[role="dialog"][aria-modal="true"]')));
} finally {
  if (storageKey) await page.evaluate(({ key, value }) => { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); }, { key: storageKey, value: previous }).catch(() => undefined);
  await browser.close();
}

const result = { certification: "ui-ux-phase-three-accessibility-local", environment: "LOCAL", baseUrl, generatedAt: new Date().toISOString(), status: checks.every((check) => check.passed) ? "passed" : "failed", checks };
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(`CERTIFICACIÓN ACCESIBILIDAD FASE 3 ${result.status.toUpperCase()}: ${checks.length} comprobaciones`);
