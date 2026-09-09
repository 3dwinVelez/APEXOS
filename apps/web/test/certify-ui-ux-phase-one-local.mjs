import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import puppeteer from "puppeteer-core";

const baseUrl = process.env.APEX_LOCAL_WEB_URL || "http://127.0.0.1:3001";
const email = process.env.APEX_LOCAL_UI_EMAIL || "demo@apex.local";
const password = process.env.APEX_LOCAL_UI_PASSWORD || "test1234";
const output = process.argv.find((value) => value.startsWith("--output="))?.slice(9) || "docs/qa/evidence/ui-ux-phase-one-20260908/browser-certification.json";
const executablePath = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", `${process.env.LOCALAPPDATA || ""}/Google/Chrome/Application/chrome.exe`].find((candidate) => candidate && fs.existsSync(candidate));

if (!executablePath) throw new Error("Chrome no está disponible para la certificación local");

const browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
const checks = [];
const record = (name, passed, detail = {}) => { checks.push({ name, passed, detail }); assert.equal(passed, true, name); };

try {
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle0" });
  await page.waitForSelector('input[name="email"]', { timeout: 10000 }).catch(async () => {
    throw new Error(`Login no disponible en ${page.url()}: ${(await page.evaluate(() => document.body.innerText)).slice(0, 300)}`);
  });
  await page.type('input[name="email"]', email);
  await page.type('input[name="password"]', password);
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click('button[type="submit"]')]);
  record("authenticated_dashboard", page.url().includes("/dashboard"));

  await page.goto(`${baseUrl}/dashboard/inventario/productos`, { waitUntil: "networkidle0" });
  record("products_datatable", await page.$('[aria-label="Tabla de datos"]') !== null);
  record("products_column_configuration", await page.$('button[aria-expanded]') !== null);
  record("products_no_horizontal_overflow", await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));

  await page.goto(`${baseUrl}/dashboard/inventario/productos/nuevo`, { waitUntil: "networkidle0" });
  record("product_three_steps", await page.$$eval('[aria-label="Progreso del formulario"] li', (items) => items.length) === 3);
  await page.type('input[placeholder^="Ej: Cafe molido"]', "Certificación temporal");
  const continueButtons = await page.$$("button");
  const continueButton = (await Promise.all(continueButtons.map(async (button) => ({ button, text: await button.evaluate((node) => node.textContent?.trim()) })))).find(({ text }) => text === "Continuar")?.button;
  assert.ok(continueButton, "Continuar debe estar disponible");
  await continueButton.click();
  record("product_continue_not_obstructed_by_ai_help", await page.$('[aria-label="Cerrar guia"]') === null);
  record("product_step_navigation", await page.evaluate(() => document.body.textContent?.includes("Existencias y dimensiones") === true));

  await page.goto(`${baseUrl}/dashboard/compras/ordenes/nueva`, { waitUntil: "networkidle0" });
  const unlabelledPurchases = await page.evaluate(() => [...document.querySelectorAll("input,select,textarea")].filter((element) => !element.getAttribute("aria-label") && !element.getAttribute("aria-labelledby") && !(element.id && document.querySelector(`label[for="${element.id}"]`)) && !element.closest("label")).length);
  record("purchases_controls_named", unlabelledPurchases === 0, { unlabelledPurchases });

  await page.goto(`${baseUrl}/dashboard/ventas/ordenes/nueva`, { waitUntil: "networkidle0" });
  const customer = await page.$('select[required]');
  await customer?.focus();
  await page.keyboard.press("Tab");
  record("sales_onblur_validation", await page.evaluate(() => document.body.textContent?.includes("Selecciona un cliente") === true));

  await page.setViewport({ width: 390, height: 844 });
  const routes = ["/dashboard/inventario/productos", "/dashboard/inventario/productos/nuevo", "/dashboard/compras/ordenes/nueva", "/dashboard/ventas/ordenes/nueva"];
  for (const route of routes) {
    await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle0" });
    record(`mobile_no_overflow:${route}`, await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  }
} finally {
  await browser.close();
}

const result = { certification: "ui-ux-phase-one-local", environment: "LOCAL", baseUrl, generatedAt: new Date().toISOString(), status: checks.every((check) => check.passed) ? "passed" : "failed", checks };
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(`CERTIFICACIÓN UI/UX LOCAL ${result.status.toUpperCase()}: ${checks.length} comprobaciones`);
