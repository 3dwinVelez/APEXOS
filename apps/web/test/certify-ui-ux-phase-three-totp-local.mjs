import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import puppeteer from "puppeteer-core";

const baseUrl = process.env.APEX_LOCAL_WEB_URL || "http://127.0.0.1:3001";
const apiUrl = process.env.APEX_LOCAL_API_URL || "http://127.0.0.1:3000";
const email = process.env.APEX_LOCAL_UI_EMAIL || "demo@apex.local";
const password = process.env.APEX_LOCAL_UI_PASSWORD || "test1234";
const output = process.argv.find((value) => value.startsWith("--output="))?.slice(9) || "docs/qa/evidence/ui-ux-phase-three-totp-20260909/browser-certification.json";
const executablePath = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", `${process.env.LOCALAPPDATA || ""}/Google/Chrome/Application/chrome.exe`].find((value) => value && fs.existsSync(value));
if (!executablePath) throw new Error("Chrome no disponible");

const authResponse = await fetch(`${apiUrl}/api/v1/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
assert.equal(authResponse.ok, true, `No fue posible autenticar la certificación: ${authResponse.status}`);
const auth = await authResponse.json();
const browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
const checks = [];
const record = (name, passed, detail = {}) => { checks.push({ name, passed, detail }); assert.equal(passed, true, `${name}: ${JSON.stringify(detail)}`); };

try {
  await page.evaluateOnNewDocument(() => {
    const originalFetch = window.fetch.bind(window);
    window.__apexTotpCertificationCalls = [];
    window.fetch = async (input, init) => {
      const url = String(typeof input === "string" ? input : input.url);
      if (!url.includes("/auth/v1/factors")) return originalFetch(input, init);
      window.__apexTotpCertificationCalls.push({ url, method: init?.method || "GET", body: String(init?.body || "") });
      const headers = { "Content-Type": "application/json" };
      if (url.endsWith("/auth/v1/factors")) return new Response(JSON.stringify({ id: "factor-local-cert", totp: { qr_code: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='144' height='144'%3E%3Crect width='144' height='144' fill='white'/%3E%3Cpath d='M16 16h48v48H16zm64 0h48v48H80zM16 80h48v48H16zm64 0h16v16H80zm24 0h24v48h-24zM80 104h16v24H80z' fill='black'/%3E%3C/svg%3E", secret: "LOCAL-CERT", uri: "otpauth://totp/APEX" } }), { status: 200, headers });
      if (url.endsWith("/challenge")) return new Response(JSON.stringify({ id: "challenge-local-cert" }), { status: 200, headers });
      if (url.endsWith("/verify")) return new Response(JSON.stringify({ id: "factor-local-cert", status: "verified" }), { status: 200, headers });
      return new Response(JSON.stringify({ message: "Ruta TOTP no esperada" }), { status: 404, headers });
    };
  });
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
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('button[aria-label="Centro de productividad"]', { timeout: 30_000 });
  await page.evaluate(() => localStorage.setItem("auth_provider", "supabase"));
  await page.click('button[aria-label="Centro de productividad"]');
  await page.waitForFunction(() => document.body.innerText.includes("Activar 2FA"));
  await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Activar 2FA")?.click());
  await page.waitForSelector('input[autocomplete="one-time-code"]');
  record("totp_qr_and_code_field_visible", await page.evaluate(() => Boolean(document.querySelector('img[alt="Código QR para configurar 2FA"]') && document.querySelector('input[inputmode="numeric"][maxlength="6"]'))));
  await page.type('input[autocomplete="one-time-code"]', "123456");
  await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Verificar y activar")?.click());
  await page.waitForFunction(() => document.body.innerText.includes("2FA activado y verificado."));
  record("totp_verified_feedback", await page.evaluate(() => document.body.innerText.includes("2FA verificado")));
  const calls = await page.evaluate(() => window.__apexTotpCertificationCalls);
  record("totp_three_step_contract", calls.length === 3 && calls[0].url.endsWith("/auth/v1/factors") && calls[1].url.endsWith("/challenge") && calls[2].url.endsWith("/verify"), { requests: calls.map((call) => call.url.split("/auth/v1")[1]) });
  record("totp_code_sent_to_verify_only", !calls[0].body.includes("123456") && !calls[1].body.includes("123456") && calls[2].body.includes("123456"));
} finally {
  await browser.close();
}

const result = { certification: "ui-ux-phase-three-totp-local-simulated-provider", environment: "LOCAL", provider: "simulated-supabase-contract", generatedAt: new Date().toISOString(), status: checks.every((check) => check.passed) ? "passed" : "failed", checks };
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(`CERTIFICACIÓN TOTP FASE 3 ${result.status.toUpperCase()}: ${checks.length} comprobaciones`);
