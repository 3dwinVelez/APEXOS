import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import puppeteer from "puppeteer-core";

const baseUrl = process.env.APEX_LOCAL_WEB_URL || "http://127.0.0.1:3001";
const email = process.env.APEX_LOCAL_UI_EMAIL || "demo@apex.local";
const password = process.env.APEX_LOCAL_UI_PASSWORD || "test1234";
const output = process.argv.find((value) => value.startsWith("--output="))?.slice(9) || "docs/qa/evidence/ui-ux-phase-three-foundation-20260909/browser-certification.json";
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
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: "networkidle0" });

  await page.keyboard.press("Tab");
  record("skip_link_first_focus", await page.evaluate(() => document.activeElement?.textContent?.includes("Saltar al contenido principal") === true));
  await page.keyboard.press("Enter");
  record("skip_link_targets_main", await page.evaluate(() => document.activeElement?.id === "apex-main-content" || location.hash === "#apex-main-content"));

  await page.keyboard.down("Control"); await page.keyboard.press("KeyK"); await page.keyboard.up("Control");
  await page.waitForSelector('[role="dialog"] [role="combobox"]', { timeout: 5000 });
  record("palette_semantics", await page.evaluate(() => Boolean(document.querySelector('[role="dialog"][aria-labelledby="apex-command-title"] [role="listbox"]'))));
  await page.keyboard.press("Escape");
  await new Promise((resolve) => setTimeout(resolve, 50));
  record("palette_focus_return", await page.evaluate(() => document.activeElement?.getAttribute("aria-keyshortcuts")?.includes("Control+K") === true));

  record("page_transition_active", await page.evaluate(() => getComputedStyle(document.querySelector(".apex-page-enter")).animationName === "apexPageEnter"));
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  record("reduced_motion_disables_transition", await page.evaluate(() => getComputedStyle(document.querySelector(".apex-page-enter")).animationName === "none"));

  await page.goto(`${baseUrl}/dashboard/inventario/productos`, { waitUntil: "networkidle0" });
  await new Promise((resolve) => setTimeout(resolve, 180));
  record("route_announced", await page.evaluate(() => document.body.innerText.toLocaleLowerCase().includes("productos") && Boolean(document.querySelector('[aria-live="polite"]'))));
} finally {
  await browser.close();
}

const result = { certification: "ui-ux-phase-three-foundation-local", environment: "LOCAL", baseUrl, generatedAt: new Date().toISOString(), status: checks.every((check) => check.passed) ? "passed" : "failed", checks };
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(`CERTIFICACIÓN FASE 3 BASE LOCAL ${result.status.toUpperCase()}: ${checks.length} comprobaciones`);
