import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import puppeteer from "puppeteer-core";

const baseUrl = process.env.APEX_LOCAL_WEB_URL || "http://127.0.0.1:3001";
const email = process.env.APEX_LOCAL_UI_EMAIL || "demo@apex.local";
const password = process.env.APEX_LOCAL_UI_PASSWORD || "test1234";
const output = process.argv.find((value) => value.startsWith("--output="))?.slice(9) || "docs/qa/evidence/ui-ux-phase-three-personalization-20260909/browser-certification.json";
const executablePath = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", `${process.env.LOCALAPPDATA || ""}/Google/Chrome/Application/chrome.exe`].find((candidate) => candidate && fs.existsSync(candidate));
if (!executablePath) throw new Error("Chrome no está disponible para la certificación local");

const browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
const checks = [];
const record = (name, passed, detail = {}) => { checks.push({ name, passed, detail }); assert.equal(passed, true, `${name}: ${JSON.stringify(detail)}`); };
let storageKey = "";
let previous = null;

try {
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle0" });
  await page.type('input[name="email"]', email);
  await page.type('input[name="password"]', password);
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click('button[type="submit"]')]);
  await page.goto(`${baseUrl}/dashboard/inventario/productos?estado=activo`, { waitUntil: "networkidle0" });
  ({ storageKey, previous } = await page.evaluate(() => { const key = `apex_experience_v1:${(localStorage.getItem("user_email") || "anonymous").toLocaleLowerCase()}`; return { storageKey: key, previous: localStorage.getItem(key) }; }));

  await page.click('button[aria-label="Preferencias de experiencia"]');
  await page.waitForSelector('[role="dialog"][aria-label="Preferencias de experiencia"]');
  await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Compacta")?.click());
  record("compact_density_applied", await page.evaluate(() => document.documentElement.dataset.density === "compact"));
  await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Grande")?.click());
  record("large_font_applied", await page.evaluate(() => document.documentElement.dataset.fontScale === "large"));
  await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Favorito")?.click());
  await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Guardar vista")?.click());
  record("favorite_and_view_saved", await page.evaluate(() => document.body.innerText.includes("Accesos personales") && document.body.innerText.includes("Vista guardada")));

  await page.reload({ waitUntil: "networkidle0" });
  record("preferences_persist_after_reload", await page.evaluate(() => document.documentElement.dataset.density === "compact" && document.documentElement.dataset.fontScale === "large"));
  await page.click('button[aria-label="Preferencias de experiencia"]');
  record("personal_access_persisted", await page.evaluate(() => document.body.innerText.includes("Accesos personales")));
} finally {
  if (storageKey) await page.evaluate(({ key, value }) => { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); document.documentElement.dataset.density = "comfortable"; document.documentElement.dataset.fontScale = "medium"; }, { key: storageKey, value: previous }).catch(() => undefined);
  await browser.close();
}

const result = { certification: "ui-ux-phase-three-personalization-local", environment: "LOCAL", baseUrl, generatedAt: new Date().toISOString(), status: checks.every((check) => check.passed) ? "passed" : "failed", checks };
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(`CERTIFICACIÓN PERSONALIZACIÓN FASE 3 ${result.status.toUpperCase()}: ${checks.length} comprobaciones`);
