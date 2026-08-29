const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const puppeteer = require("puppeteer-core");
const ExcelJS = require("exceljs");

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith("--")) continue;
    const key = argv[index].slice(2);
    args[key] = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : true;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (args["env-file"]) require("../load-env")(String(args["env-file"]));

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} es obligatorio.`);
  return value;
}

function qaUrl(value) {
  const url = new URL(value);
  if (process.env.TARGET_ENV !== "qa") throw new Error("TARGET_ENV debe ser qa.");
  if (url.protocol !== "https:") throw new Error("QA_WEB_URL debe usar HTTPS.");
  const qaHost = /(^|[.-])qa([.-]|$)/i.test(url.hostname);
  if (/prod|production/i.test(value) && !qaHost) throw new Error("QA_WEB_URL parece productiva; certificacion cancelada.");
  return value.replace(/\/$/, "");
}

function qaApiUrl(value) {
  const url = new URL(value);
  if (process.env.TARGET_ENV !== "qa") throw new Error("TARGET_ENV debe ser qa.");
  if (url.protocol !== "https:") throw new Error("QA_API_URL debe usar HTTPS.");
  const qaHost = /(^|[.-])qa([.-]|$)/i.test(url.hostname);
  if (/prod|production/i.test(value) && !qaHost) throw new Error("QA_API_URL parece productiva; certificacion cancelada.");
  return value.replace(/\/$/, "");
}

function chromePath() {
  const candidates = [
    process.env.QA_CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
  ].filter(Boolean);
  const selected = candidates.find((candidate) => fs.existsSync(candidate));
  if (!selected) throw new Error("Google Chrome no esta disponible para la certificacion QA.");
  return selected;
}

function railwayDeployment(projectId, service, deploymentId, expectedCommit) {
  const output = execFileSync("railway", [
    "deployment", "list", "-p", projectId, "-e", "production", "-s", service, "--json"
  ], { encoding: "utf8", windowsHide: true });
  const deployments = JSON.parse(output);
  const current = deployments[0];
  assert.equal(current?.id, deploymentId, `${service} no conserva el despliegue QA certificado como activo.`);
  assert.equal(current?.status, "SUCCESS", `${service} no esta desplegado correctamente.`);
  assert.match(String(current?.meta?.cliMessage || ""), new RegExp(expectedCommit.slice(0, 7), "i"), `${service} no esta ligado al SHA candidato.`);
  return { id: current.id, status: current.status, message: current.meta.cliMessage };
}

async function clickButton(page, label) {
  const clicked = await page.evaluate((text) => {
    const button = [...document.querySelectorAll("button")].find((item) => item.textContent?.trim().startsWith(text));
    if (!button) return false;
    button.click();
    return true;
  }, label);
  assert.equal(clicked, true, `No se encontro el boton ${label}.`);
}

async function login(page, webUrl, email, password) {
  await page.goto(`${webUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[name="email"]');
  await page.type('input[name="email"]', email);
  await page.type('input[name="password"]', password);
  await clickButton(page, "Entrar");
  await page.waitForFunction(() => location.pathname !== "/login", { timeout: 20_000 });
}

async function logout(page) {
  const button = await page.$('button[aria-label="Cerrar sesion"]');
  assert.ok(button, "No se encontro el control de cierre de sesion.");
  await button.click();
  await page.waitForFunction(() => location.pathname === "/login", { timeout: 15_000 });
}

async function openReports(page, webUrl) {
  await page.goto(`${webUrl}/dashboard/talento-humano/reportes`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.innerText.includes("Horas laboradas y trazabilidad"), { timeout: 20_000 });
  await page.waitForFunction(() => !document.body.innerText.includes("Validando permisos..."), { timeout: 20_000 });
  assert.equal(await page.evaluate(() => document.body.innerText.includes("Acceso no autorizado")), false, "El rol autorizado no puede abrir reportes.");
}

async function reportState(page) {
  return page.evaluate(() => {
    const exportButton = [...document.querySelectorAll("button")].find((item) => item.textContent?.includes("Descargar Excel"));
    const employeeOptions = [...document.querySelectorAll("select")]
      .find((item) => item.parentElement?.textContent?.includes("Empleado"));
    const countText = [...document.querySelectorAll("p")].find((item) => /de \d+ registro\(s\) encontrados/.test(item.textContent || ""))?.textContent || "";
    return {
      exportEnabled: Boolean(exportButton && !exportButton.disabled),
      employeeIds: employeeOptions ? [...employeeOptions.querySelectorAll("option")].map((option) => option.value).filter((value) => value !== "all") : [],
      count: Number(countText.match(/^(\d+)/)?.[1] || 0),
      appliedSevenDays: document.body.innerText.includes("Rango aplicado:")
    };
  });
}

async function waitForDownload(directory, timeoutMs = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const match = fs.readdirSync(directory).find((name) => name.endsWith(".xlsx") && !name.endsWith(".crdownload"));
    if (match) return path.join(directory, match);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("La descarga XLSX no termino dentro del tiempo esperado.");
}

async function main() {
  const webUrl = qaUrl(required("QA_WEB_URL"));
  const apiUrl = qaApiUrl(required("QA_API_URL"));
  const expectedCommit = required("QA_EXPECTED_COMMIT");
  const outputPath = path.resolve(String(args.output || `hr-reports-export-qa-${Date.now()}.json`));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "apexos-hr-reports-qa-"));
  const downloads = fs.mkdtempSync(path.join(os.tmpdir(), "apexos-hr-reports-xlsx-"));
  const evidence = { certification: "hr-reports-export-qa", environment: "QA", expected_commit: expectedCommit, checks: [], certified_at: new Date().toISOString() };
  let browser;
  const check = (name, ok, detail = {}) => {
    evidence.checks.push({ name, status: ok ? "passed" : "failed", detail });
    if (!ok) throw new Error(`${name} fallo.`);
  };

  try {
    const healthResponse = await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(15_000) });
    const health = await healthResponse.json().catch(() => ({}));
    const healthCommit = String(health.commit || "");
    if (healthCommit === "unknown") {
      const projectId = required("QA_RAILWAY_PROJECT_ID");
      const apiDeployment = railwayDeployment(projectId, "apexos-api-qa", required("QA_API_DEPLOYMENT_ID"), expectedCommit);
      const webDeployment = railwayDeployment(projectId, "apexos-web-qa", required("QA_WEB_DEPLOYMENT_ID"), expectedCommit);
      check("deployed_commit", healthResponse.ok, { status: healthResponse.status, commit: healthCommit, proof: "railway_cli_deployments", apiDeployment, webDeployment });
    } else {
      check("deployed_commit", healthResponse.ok && healthCommit.startsWith(expectedCommit.slice(0, 12)), {
        status: healthResponse.status,
        commit: healthCommit || "missing",
        proof: "health_commit"
      });
    }

    browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, userDataDir: profile, args: ["--no-first-run", "--no-default-browser-check", "--disable-extensions"] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000 });
    const client = await page.createCDPSession();
    await client.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads });

    await login(page, webUrl, required("QA_ADMIN_EMAIL"), required("QA_ADMIN_PASSWORD"));
    await openReports(page, webUrl);
    await clickButton(page, "Ultimos 7 dias");
    await page.waitForFunction(() => document.body.innerText.includes("Rango aplicado:") && !document.body.innerText.includes("Consultando..."), { timeout: 20_000 });
    const adminState = await reportState(page);
    check("authorized_report_visible", adminState.exportEnabled && adminState.count > 0, { rows: adminState.count });
    check("smart_range_applied", adminState.appliedSevenDays, {});
    const adminEmployeeId = adminState.employeeIds[0];
    check("controlled_hr_data_available", Boolean(adminEmployeeId), { employee_count: adminState.employeeIds.length });

    await clickButton(page, "Descargar Excel");
    const downloaded = await waitForDownload(downloads);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(downloaded);
    const sheetNames = workbook.worksheets.map((sheet) => sheet.name);
    const journeys = workbook.getWorksheet("Jornadas");
    check("xlsx_structure", ["Resumen", "Jornadas", "Trazabilidad"].every((name) => sheetNames.includes(name)) && Boolean(journeys?.getTable("ApexosJornadasTable")), { sheets: sheetNames, journey_rows: Math.max(0, Number(journeys?.rowCount || 5) - 5) });

    await logout(page);
    await login(page, webUrl, required("QA_HR_NO_EXPORT_EMAIL"), required("QA_HR_NO_EXPORT_PASSWORD"));
    await openReports(page, webUrl);
    const restrictedState = await reportState(page);
    check("export_permission_enforced", !restrictedState.exportEnabled, {});

    await logout(page);
    await login(page, webUrl, required("QA_OTHER_TENANT_EMAIL"), required("QA_OTHER_TENANT_PASSWORD"));
    await openReports(page, webUrl);
    const otherTenantState = await reportState(page);
    check("tenant_isolation", !otherTenantState.employeeIds.includes(adminEmployeeId), { other_tenant_employee_count: otherTenantState.employeeIds.length });
    evidence.status = "passed";
  } catch (error) {
    evidence.status = "failed";
    evidence.error = error.message;
    throw error;
  } finally {
    await browser?.close().catch(() => undefined);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
    fs.rmSync(profile, { recursive: true, force: true });
    fs.rmSync(downloads, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
