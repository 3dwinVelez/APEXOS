import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import puppeteer from "puppeteer-core";

const baseUrl = process.env.APEX_LOCAL_WEB_URL || "http://127.0.0.1:3001";
const apiUrl = process.env.APEX_LOCAL_API_URL || "http://127.0.0.1:3000";
const email = process.env.APEX_LOCAL_UI_EMAIL || "demo@apex.local";
const password = process.env.APEX_LOCAL_UI_PASSWORD || "test1234";
const output = process.argv.find((value) => value.startsWith("--output="))?.slice(9) || "docs/qa/evidence/supplier-create-button-visibility-20260909/browser-certification.json";
const executablePath = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", `${process.env.LOCALAPPDATA || ""}/Google/Chrome/Application/chrome.exe`].find((value) => value && fs.existsSync(value));
if (!executablePath) throw new Error("Chrome no disponible");

const response = await fetch(`${apiUrl}/api/v1/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
assert.equal(response.ok, true, `Login local no disponible: ${response.status}`);
const auth = await response.json();
const browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
const checks = [];
const record = (name, passed, detail = {}) => { checks.push({ name, passed, detail }); assert.equal(passed, true, `${name}: ${JSON.stringify(detail)}`); };

try {
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.evaluate(({ loginEmail, data }) => {
    localStorage.setItem("token", data.token);
    localStorage.setItem("auth_provider", "local");
    localStorage.setItem("user_email", loginEmail);
    localStorage.setItem("role_name", data.user?.role || "");
    localStorage.setItem("role_permissions", JSON.stringify(data.user?.role_permissions || []));
    localStorage.setItem("tenant_active_modules", JSON.stringify(data.tenant?.active_modules || []));
    localStorage.setItem("apexos_company_id", data.tenant?.company_id || data.tenant?.id || "");
  }, { loginEmail: email, data: auth });
  await page.goto(`${baseUrl}/dashboard/compras/proveedores`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("button.btn-primary", { timeout: 30_000 });
  const visual = await page.$eval("button.btn-primary", (element) => { const style = getComputedStyle(element); const box = element.getBoundingClientRect(); return { text: element.textContent?.trim(), background: style.backgroundColor, color: style.color, width: box.width, height: box.height }; });
  record("new_supplier_action_identified", visual.text === "Nuevo proveedor", visual);
  record("primary_background_visible", !visual.background.includes("rgba(0, 0, 0, 0)") && visual.background !== "transparent", visual);
  record("button_has_operable_size", visual.width >= 120 && visual.height >= 40, visual);
  await page.click("button.btn-primary");
  await page.waitForSelector('[role="dialog"]');
  record("create_supplier_dialog_opens", await page.evaluate(() => document.querySelector('[role="dialog"]')?.textContent?.includes("Crear proveedor") === true));
  const nameInput = 'input[required]';
  await page.click(nameInput);
  await page.keyboard.type("A");
  record("focus_stays_after_first_character", await page.evaluate((selector) => document.activeElement === document.querySelector(selector) && document.querySelector(selector)?.value === "A", nameInput));
  await page.keyboard.type("B");
  await page.keyboard.type("C");
  record("typing_accumulates_without_focus_loss", await page.evaluate((selector) => document.activeElement === document.querySelector(selector) && document.querySelector(selector)?.value === "ABC", nameInput));
} finally {
  await browser.close();
}

const result = { certification: "supplier-create-button-visibility-local", environment: "LOCAL", baseUrl, generatedAt: new Date().toISOString(), status: checks.every((check) => check.passed) ? "passed" : "failed", checks };
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(`CERTIFICACIÓN BOTÓN PROVEEDOR ${result.status.toUpperCase()}: ${checks.length} comprobaciones`);
