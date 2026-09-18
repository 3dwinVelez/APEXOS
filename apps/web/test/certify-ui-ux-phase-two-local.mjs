import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import puppeteer from "puppeteer-core";

const baseUrl = process.env.APEX_LOCAL_WEB_URL || "http://127.0.0.1:3001";
const email = process.env.APEX_LOCAL_UI_EMAIL || "demo@apex.local";
const password = process.env.APEX_LOCAL_UI_PASSWORD || "test1234";
const output = process.argv.find((value) => value.startsWith("--output="))?.slice(9) || "docs/qa/evidence/ui-ux-phase-two-20260908/browser-certification.json";
const executablePath = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", `${process.env.LOCALAPPDATA || ""}/Google/Chrome/Application/chrome.exe`].find((candidate) => candidate && fs.existsSync(candidate));
if (!executablePath) throw new Error("Chrome no está disponible para la certificación local");

const browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
const checks = [];
const record = (name, passed, detail = {}) => { checks.push({ name, passed, detail }); assert.equal(passed, true, `${name}: ${JSON.stringify(detail)}`); };

try {
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle0" });
  await page.type('input[name="email"]', email);
  await page.type('input[name="password"]', password);
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click('button[type="submit"]')]);
  record("authenticated_dashboard", page.url().includes("/dashboard"));
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.toLocaleLowerCase().includes("panel contextual"), { timeout: 10000 }).catch(async (error) => {
    const visibleText = await page.evaluate(() => document.body.innerText.slice(0, 1200));
    throw new Error(`No apareció el dashboard contextual en ${page.url()}: ${visibleText}`, { cause: error });
  });
  record("role_context_dashboard", await page.evaluate(() => document.body.innerText.toLocaleLowerCase().includes("panel contextual")));

  await page.keyboard.down("Control"); await page.keyboard.press("KeyK"); await page.keyboard.up("Control");
  await page.waitForSelector('[role="dialog"] input', { timeout: 5000 });
  record("command_palette_keyboard", await page.$('[role="dialog"]') !== null);
  await page.type('[role="dialog"] input', "orden de compra");
  record("command_palette_search", await page.evaluate(() => document.body.innerText.includes("Nueva orden de compra")));
  await page.keyboard.press("Escape");

  await page.goto(`${baseUrl}/dashboard/inventario/productos`, { waitUntil: "networkidle0" });
  record("advanced_breadcrumbs", await page.$('nav[aria-label="Ruta de navegación"]') !== null);
  record("traceability_control", await page.evaluate(() => document.body.innerText.includes("Trazabilidad")));

  await page.select('select[aria-label="Idioma"]', "en");
  record("locale_en", await page.evaluate(() => document.documentElement.lang === "en" && document.body.innerText.includes("Command center")));
  await page.select('select[aria-label="Language"]', "pt").catch(async () => page.select('select[aria-label="Idioma"]', "pt"));
  record("locale_pt", await page.evaluate(() => document.documentElement.lang === "pt" && document.body.innerText.includes("Central de comandos")));
  await page.select('select[aria-label="Idioma"]', "es");
  record("locale_es", await page.evaluate(() => document.documentElement.lang === "es"));

  await page.setOfflineMode(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  record("offline_status", await page.evaluate(() => document.body.innerText.includes("Sin conexión")));
  await page.setOfflineMode(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));

  await page.goto(`${baseUrl}/dashboard/apex-ai`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => {
    const text = document.body.innerText.toLocaleLowerCase();
    return text.includes("senales y recomendaciones") || text.includes("señales y recomendaciones");
  }, { timeout: 10000 });
  const apexAiView = await page.evaluate(() => {
    const text = document.body.innerText.toLocaleLowerCase();
    return { text, operational: text.includes("senales y recomendaciones") || text.includes("señales y recomendaciones") };
  });
  record("apex_ai_operational", apexAiView.operational, { url: page.url(), excerpt: apexAiView.text.slice(0, 600) });

  await page.setViewport({ width: 390, height: 844 });
  for (const route of ["/dashboard", "/dashboard/inventario/productos", "/dashboard/apex-ai"]) {
    await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle0" });
    record(`mobile_no_overflow:${route}`, await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  }
} finally {
  await browser.close();
}

const result = { certification: "ui-ux-phase-two-local", environment: "LOCAL", baseUrl, generatedAt: new Date().toISOString(), status: checks.every((check) => check.passed) ? "passed" : "failed", checks };
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(`CERTIFICACIÓN FASE 2 LOCAL ${result.status.toUpperCase()}: ${checks.length} comprobaciones`);
