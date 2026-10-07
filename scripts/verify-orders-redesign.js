const fs = require("node:fs");
const path = require("node:path");
const puppeteer = require("puppeteer-core");

const ROOT = path.resolve(__dirname, "..");
const BASE = process.env.VERIFY_BASE || "http://127.0.0.1:3001";
const EVIDENCE = path.join(ROOT, "docs", "project", "evidence");
const CHROME_CANDIDATES = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe"
];
const EMAIL = process.env.APEX_DEMO_EMAIL || "demo@apex.local";
const PASSWORD = process.env.APEX_DEMO_PASSWORD || "test1234";

const checks = {};
const consoleErrors = [];
const badResponses = [];

function mark(name, ok, detail) {
  checks[name] = ok;
  console.log(`${ok ? "OK " : "FAIL "} ${name}${detail ? ` — ${detail}` : ""}`);
}

const KNOWN_NOISE = /localhost:54321|Content Security Policy|auth\/v1\/token|favicon\.ico/;
function relevantConsoleErrors() {
  const relevant = consoleErrors.filter((text) => !KNOWN_NOISE.test(text));
  if (relevantBadResponses().length) return relevant;
  return relevant.filter((text) => !/Failed to load resource/.test(text));
}
function relevantBadResponses() {
  return badResponses.filter((entry) => !entry.includes("localhost:54321") && !entry.includes("favicon.ico"));
}

async function clickButtonByText(page, text, { last = false } = {}) {
  return page.evaluate((text, last) => {
    const buttons = [...document.querySelectorAll("button")].filter((b) => b.innerText.includes(text) && !b.disabled);
    if (!buttons.length) return false;
    (last ? buttons[buttons.length - 1] : buttons[0]).click();
    return true;
  }, text, last);
}

async function main() {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  const executablePath = CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate));
  if (!executablePath) throw new Error("No se encontro navegador instalado para la verificacion.");

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 850 });
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err.message || err)));
  page.on("response", (res) => {
    if (res.status() >= 400) badResponses.push(`${res.status()} ${res.url()}`);
  });

  try {
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle0", timeout: 60000 });
    mark("loginVisible", !!(await page.$('input[name="email"]')));
    await page.type('input[name="email"]', EMAIL);
    await page.type('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: "networkidle0", timeout: 60000 }).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 1500));
    mark("autenticado", page.url().includes("/dashboard"), page.url());

    await page.goto(`${BASE}/dashboard/transporte/ordenes`, { waitUntil: "networkidle0", timeout: 60000 });
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const bodyText = await page.evaluate(() => document.body.innerText || "");
    mark("monitorTitulo", /Monitor de pedidos/.test(bodyText));
    mark("botonSubirExcel", /Subir Excel/.test(bodyText));
    mark("botonNuevoPlan", /Nuevo plan/.test(bodyText));
    mark("resumenPedidos", /\d+\s+pedido/.test(bodyText), (bodyText.match(/\d+\s+pedido[^\n]*/i) || [""])[0].slice(0, 90));

    await page.screenshot({ path: path.join(EVIDENCE, "transport-orders-monitor-redesign.png"), fullPage: true });

    mark("hayBotonNuevoPlan", await clickButtonByText(page, "Nuevo plan"));
    if (checks.hayBotonNuevoPlan) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      const dialog = await page.$('[role="dialog"]');
      mark("modalPlanAbierto", !!dialog);
      const dialogText = dialog ? await dialog.evaluate((el) => el.innerText || "") : "";
      const lowerDialog = dialogText.toLowerCase();
      mark("modalPlanCampos", ["Nombre del plan", "Origen", "Crear plan", "Cancelar"].every((txt) => lowerDialog.includes(txt.toLowerCase())));
      await page.screenshot({ path: path.join(EVIDENCE, "transport-orders-modal-nuevo-plan.png") });

      const originSelected = await page.evaluate(() => {
        const dialogEl = document.querySelector('[role="dialog"]');
        const selects = dialogEl ? [...dialogEl.querySelectorAll("select")] : [];
        const sel = selects[0];
        if (!sel || sel.options.length < 2) return false;
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
        nativeSetter.call(sel, sel.options[1].value);
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      });
      await page.type('input[placeholder="Ej. Plan 1"]', "Plan prueba modal");
      if (originSelected) {
        await clickButtonByText(page, "Crear plan");
        await new Promise((resolve) => setTimeout(resolve, 1200));
        mark("modalPlanCierra", !(await page.$('[role="dialog"]')));
        const postText = await page.evaluate(() => document.body.innerText || "");
        mark("planCreado", postText.includes("Plan creado") || postText.includes("Plan prueba modal"));
        page.once("dialog", (d) => d.accept());
        const clickedDelete = await clickButtonByText(page, "Eliminar", { last: true });
        if (clickedDelete) {
          await new Promise((resolve) => setTimeout(resolve, 1200));
          const afterDelete = await page.evaluate(() => document.body.innerText || "");
          mark("planEliminado", !afterDelete.includes("Plan prueba modal"), afterDelete.includes("eliminado") ? "mensaje de eliminacion presente" : "");
        } else {
          mark("planEliminado", false, "no hay boton Eliminar");
        }
      } else {
        mark("modalPlanCierra", false, "no se pudo seleccionar origen");
        mark("planCreado", false, "no se pudo seleccionar origen");
        mark("planEliminado", false, "no se pudo seleccionar origen");
      }
    }

    mark("hayBotonSubirExcel", await clickButtonByText(page, "Subir Excel"));
    if (checks.hayBotonSubirExcel) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      const dialog = await page.$('[role="dialog"]');
      mark("modalExcelAbierto", !!dialog);
      const dialogText = dialog ? await dialog.evaluate((el) => el.innerText || "") : "";
      mark("modalExcelPasos", ["Descargar plantilla Excel", "Validar archivo", "Agregar a Transporte", "Ver campos y ejemplos"].every((txt) => dialogText.includes(txt)));
      await page.screenshot({ path: path.join(EVIDENCE, "transport-orders-modal-subir-excel.png") });
      await page.keyboard.press("Escape");
      await new Promise((resolve) => setTimeout(resolve, 600));
      mark("modalExcelCierraEscape", !(await page.$('[role="dialog"]')));
    }

    const relErrors = relevantConsoleErrors();
    const relResponses = relevantBadResponses();
    mark("sinErroresConsola", relErrors.length === 0 && relResponses.length === 0,
      [...relErrors.slice(0, 2), ...relResponses.slice(0, 2)].join(" | ") || `ruido conocido Supabase fallback: ${consoleErrors.length} entrada(s)`);
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify({ checks }, null, 2));
  const failed = Object.entries(checks).filter(([, ok]) => !ok);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
