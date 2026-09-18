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

try {
  await first.setViewport({ width: 1440, height: 900 });
  await first.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await first.waitForSelector('input[name="email"]');
  await first.type('input[name="email"]', email);
  await first.type('input[name="password"]', password);
  await first.click('button[type="submit"]');
  await first.waitForFunction(() => window.location.pathname.startsWith("/dashboard"), { timeout: 30_000 });
  await first.waitForSelector('button[aria-label="Colaboración en tiempo real"]');
  await first.goto(`${baseUrl}/dashboard/inventario/productos/nuevo`, { waitUntil: "domcontentloaded" });
  await first.waitForSelector('button[aria-label="Colaboración en tiempo real"]');
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  await first.waitForSelector('button[aria-label="Colaboración en tiempo real"]');
  await first.click('button[aria-label="Colaboración en tiempo real"]');
  record("presence_panel_available", await first.$('[role="dialog"][aria-label="Colaboración en tiempo real"]') !== null);
  record("privacy_notice_visible", await first.evaluate(() => document.body.innerText.includes("no comparte el contenido de los formularios")));
  await first.click('button[aria-label="Colaboración en tiempo real"]');

  const second = await browser.newPage();
  await second.setViewport({ width: 1440, height: 900 });
  await second.goto(`${baseUrl}/dashboard/inventario/productos/nuevo`, { waitUntil: "domcontentloaded" });
  await second.waitForSelector("input");
  await first.waitForSelector('[aria-label="2 sesiones activas"]', { timeout: 5_000 });
  record("second_session_detected", true);

  await second.focus("input");
  await first.waitForFunction(() => document.body.innerText.includes("Edición concurrente"), { timeout: 5_000 });
  record("concurrent_edit_warning", await first.evaluate(() => document.body.innerText.includes("Verifica los cambios antes de guardar")));
  await second.close();
  await first.waitForFunction(() => !document.body.innerText.includes("Edición concurrente"), { timeout: 5_000 });
  record("session_leave_propagated", true);
} finally {
  await browser.close();
}

const result = { certification: "ui-ux-phase-three-collaboration-local", environment: "LOCAL", baseUrl, generatedAt: new Date().toISOString(), status: checks.every((check) => check.passed) ? "passed" : "failed", checks };
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(`CERTIFICACIÓN COLABORACIÓN FASE 3 ${result.status.toUpperCase()}: ${checks.length} comprobaciones`);
