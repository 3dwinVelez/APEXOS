// Certificacion de navegador de la ventana de marcacion: el estado "sin horario asignado" se ve
// como un panel grande, no como cuatro tarjetas de "Fallo tecnico detectado".
//
// Corre Next dev real + Chromium real. Unica sustitucion: las lecturas /api/v1/hr/self* se
// resuelven desde un guion local (404 de ficha, dia sin horarios, dia con horario, caida) y
// /api/v1/auth/me entrega el contexto de tenant y rol que el guard de rutas exige para montar
// la pantalla. El estado que se certifica es el de la pantalla, no el del negocio; el flujo
// autenticado contra API y base reales sigue cubierto por certify:hr-monitor-evidence:qa y por
// la regresion de HR.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { spawn, execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const PORT = Number(process.env.CERT_BROWSER_PORT || 3319);
const ARTIFACT = "hr-marking-unassigned-gate-20261117";
const DIST_DIR = ".next-hr-marking-gate";
const OUT = path.join(ROOT, "docs", "qa", "evidence", ARTIFACT);

const args = process.argv.slice(2);
const keepOpen = args.includes("--keep-open");

function todayBogota() {
  // La pantalla compara contra su propia fecha local (Intl America/Bogota); el horario del guion
  // tiene que caer en el mismo dia o el filtro "solo el horario de hoy" lo descarta y el
  // escenario miente. Se calcula con la misma expresion, no con un desplazamiento asumido.
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}

const FICHA = { id: "emp-cert-1", code: "CERT-1", name: "Prueba Sin Horario", email: "cert.sinhorario@apex.local" };
const HORARIO = { id: 900117, code: "CERT-H", date: todayBogota(), start_time: "08:00", end_time: "17:00", employees: [FICHA.code], employee_ids: [FICHA.code], employee_names: [FICHA.name], gps_required: false, tracking_mode: "punch_only", status: "activa" };

// Contexto de sesion que el guard de rutas (`RouteAccessGuard` -> `loadModuleAccess`) necesita
// para montar la pantalla: sin `active_modules` con `talento_humano` y un permiso `hr`, el guard
// pinta "Acceso no autorizado" y la certificacion se pone roja contra una pantalla correcta.
const SESSION_CONTEXT = {
  tenant: { active_modules: ["talento_humano"] },
  user: { role: "Operario de planta", role_metadata: { role_type: "member" }, role_permissions: [{ module: "hr", action: "read" }, { module: "hr", action: "write" }] }
};

const SCENARIOS = {
  // 404 con el codigo real del API: usuario sin ficha laboral asociada.
  sin_ficha: {
    "/api/v1/hr/self": { status: 404, body: { error: "El usuario conectado no tiene una ficha laboral asociada.", code: "EMPLEADO_NO_ASOCIADO" } },
    "/api/v1/hr/self/routes": { status: 404, body: { error: "sin ficha", code: "EMPLEADO_NO_ASOCIADO" } },
    "/api/v1/hr/self/attendance": { status: 404, body: { error: "sin ficha", code: "EMPLEADO_NO_ASOCIADO" } },
    "/api/v1/hr/self/activity-types": { status: 404, body: { error: "sin ficha", code: "EMPLEADO_NO_ASOCIADO" } },
    "/api/v1/hr/self/work-session": { status: 404, body: { error: "sin ficha", code: "EMPLEADO_NO_ASOCIADO" } }
  },
  con_ficha_sin_horario: {
    "/api/v1/hr/self": { status: 200, body: FICHA },
    "/api/v1/hr/self/routes": { status: 200, body: [] },
    "/api/v1/hr/self/attendance": { status: 200, body: [] },
    "/api/v1/hr/self/activity-types": { status: 200, body: [] },
    "/api/v1/hr/self/work-session": { status: 200, body: null },
    // La lectura de pre-partada va despues del corte: sin regla propia caeria en el 500 del guion
    // y la pantalla levantaria la tarjeta de fallo tecnico que esta certificacion niega.
    "/api/v1/hr/self/preop/active": { status: 200, body: null }
  },
  con_ficha_con_horario: {
    "/api/v1/hr/self": { status: 200, body: FICHA },
    "/api/v1/hr/self/routes": { status: 200, body: [HORARIO] },
    "/api/v1/hr/self/attendance": { status: 200, body: [] },
    "/api/v1/hr/self/activity-types": { status: 200, body: [] },
    "/api/v1/hr/self/work-session": { status: 200, body: null },
    "/api/v1/hr/self/preop/active": { status: 200, body: null }
  },
  // Cadida real: ninguna lectura responde (sin senal). Con respaldo local del dia la pantalla
  // NO debe bloquear; el operario sigue marcando.
  sin_conexion: {
    "/api/v1/hr/self": { abort: true },
    "/api/v1/hr/self/routes": { abort: true },
    "/api/v1/hr/self/attendance": { abort: true },
    "/api/v1/hr/self/activity-types": { abort: true },
    "/api/v1/hr/self/work-session": { abort: true },
    "/api/v1/hr/self/preop/active": { abort: true }
  }
};

const RESUL = { format: "apexos-hr-marking-unassigned-gate-v1", started_at: new Date().toISOString(), port: PORT, scenarios: {}, checks: [] };

function check(name, ok, payload = {}) {
  RESUL.checks.push({ name, ok: Boolean(ok), ...(Object.keys(payload).length ? { payload } : {}) });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${Object.keys(payload).length ? ` ${JSON.stringify(payload)}` : ""}`);
  if (!ok) throw new Error(`Check fallido: ${name}`);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  // Next dev reescribe next-env.d.ts y el `include` del tsconfig con su carpeta de tipos aislada.
  // Se guarda el contenido previo para devolverlo en el `finally`: si no, el diff de la
  // intervencion sale con artefactos del arnes.
  const nextEnvPath = path.join(ROOT, "apps", "web", "next-env.d.ts");
  const tsconfigPath = path.join(ROOT, "apps", "web", "tsconfig.json");
  const previousNextEnv = fs.readFileSync(nextEnvPath, "utf8");
  const previousIncludes = JSON.parse(fs.readFileSync(tsconfigPath, "utf8")).include || [];
  const logHandle = fs.openSync(path.join(OUT, "next-dev.log"), "w");
  const web = spawn(process.execPath, [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "dev", "--webpack", "-H", "127.0.0.1", "-p", String(PORT)], {
    cwd: path.join(ROOT, "apps", "web"), windowsHide: true, stdio: ["ignore", logHandle, logHandle],
    env: { ...process.env, NODE_ENV: "development", NEXT_PUBLIC_API_URL: `http://127.0.0.1:${PORT}`, NEXT_DIST_DIR: DIST_DIR }
  });
  const base = `http://127.0.0.1:${PORT}`;
  let browser;
  let scenario = "sin_ficha";
  try {
    const deadline = Date.now() + 240000;
    for (;;) {
      try { if ((await fetch(`${base}/login`, { signal: AbortSignal.timeout(3000) })).status < 500) break; } catch {}
      if (Date.now() > deadline) throw new Error("El frontend local no levanto en 240 s");
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    const puppeteer = require("puppeteer-core");
    const executablePath = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((file) => fs.existsSync(file));
    assert.ok(executablePath, "no hay Chrome ni Edge instalados para certificar en navegador");
    browser = await puppeteer.launch({ executablePath, headless: true });
    const page = await browser.newPage();
    page.setDefaultTimeout(120000);
    await page.setViewport({ width: 430, height: 932 });
    await page.setBypassServiceWorker(true);
    // Autenticacion cosmetica: el token vive en localStorage y todas las lecturas se resuelven
    // aqui mismo, asi que ningun endpoint real se-invoca con el.
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem("token", "cert-marking-gate-token");
      localStorage.setItem("apex_last_activity", String(Date.now()));
      localStorage.setItem("apex_theme", "light");
    });
    await page.setRequestInterception(true);
    const requests = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      const pathname = url.pathname;
      if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") return void request.abort();
      if (!pathname.startsWith("/api/v1/")) return void request.continue();
      requests.push(pathname);
      if (pathname.startsWith("/api/v1/hr/self")) {
        const rule = SCENARIOS[scenario][pathname] || { status: 500, body: { error: "escenario sin regla" } };
        if (rule.abort) return void request.abort("failed");
        return void request.respond({ status: rule.status, contentType: "application/json", body: JSON.stringify(rule.body) });
      }
      if (pathname === "/api/v1/auth/me") {
        return void request.respond({ status: 200, contentType: "application/json", body: JSON.stringify(SESSION_CONTEXT) });
      }
      return void request.respond({ status: 200, contentType: "application/json", body: "{}" });
    });
    const consoleErrors = [];
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });

    async function open(name, { fresh = false } = {}) {
      scenario = name;
      requests.length = 0;
      if (fresh) await page.evaluate(() => localStorage.removeItem("apexos_hr_mobile_snapshot"));
      await page.goto(`${base}/dashboard/talento-humano/marcacion`, { waitUntil: "domcontentloaded", timeout: 180000 });
      try {
        await page.waitForFunction(() => document.body.innerText.includes("Mi jornada"), { timeout: 120000 });
      } catch (error) {
        // Un tiempo de espera sin estado visible no dice de quien es la culpa. Se guarda lo que el
        // navegador realmente pinto (url, texto y lecturas) para atribuir arnes vs pantalla antes
        // de tocar el producto; el guard de rutas negando el modulo se vio aqui como un 120 s.
        RESUL.diagnostic = {
          scenario: name,
          url: page.url(),
          requests: [...requests],
          text: await page.evaluate(() => document.body.innerText.slice(0, 1500)).catch(() => "")
        };
        await page.screenshot({ path: path.join(OUT, `00-diagnostico-${name}.png`) }).catch(() => undefined);
        fs.writeFileSync(path.join(OUT, "certification.json"), JSON.stringify(RESUL, null, 2));
        throw error;
      }
      // Un tick de React para que el estado del arranque termine de pintar.
      await page.waitForFunction(() => !document.body.innerText.includes("Cargando"), { timeout: 30000 }).catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 2500));
      return {
        text: await page.evaluate(() => document.body.innerText),
        dom: await page.evaluate(() => ({
          tabs: [...document.querySelectorAll("button")].map((node) => node.textContent.trim()).filter((label) => label === "Marcar" || label === "Historial"),
          statuses: [...document.querySelectorAll('[role="status"]')].map((node) => node.textContent.trim().slice(0, 220)),
          alerts: [...document.querySelectorAll('[role="alert"]')].map((node) => node.textContent.trim().slice(0, 220)),
          // El panel de bloqueo es el `h2` de una seccion `role="status"`. No puede buscarse por
          // el texto suelto: la ficha del horario en la ventana normal (`page.tsx:1142`) tambien
          // dice "Sin horario asignado" cuando no hay ruta, y mezclar los dos convierte un estado
          // correcto de respaldo en un falso rojo (medido el 2026-11-17 en la caida sin respaldo).
          sinHorarioPanel: [...document.querySelectorAll('section[role="status"] h2')].some((node) => node.textContent.trim() === "Sin horario asignado")
        }))
      };
    }

    // 1) Usuario sin ficha laboral: un solo panel, ninguna tarjeta de fallo tecnico y ninguna
    //    de las otras cuatro lecturas lanzada.
    const sinFicha = await open("sin_ficha");
    RESUL.scenarios.sin_ficha = { dom: sinFicha.dom, requests };
    check("sin_ficha_muestra_el_panel_grande", sinFicha.dom.sinHorarioPanel && sinFicha.text.includes("ficha laboral asociada"), { panel: sinFicha.dom.sinHorarioPanel });
    check("sin_ficha_sin_tarjeta_de_fallo_tecnico", !sinFicha.text.includes("Fallo tecnico detectado") && !sinFicha.text.includes("Fallo técnico detectado"), { alerts: sinFicha.dom.alerts });
    check("sin_ficha_no_monta_la_ventana_de_marcado", sinFicha.dom.tabs.length === 0, { tabs: sinFicha.dom.tabs });
    const selfCalls = requests.filter((route) => route.startsWith("/api/v1/hr/self"));
    check("sin_ficha_detiene_las_lecturas_dependientes", selfCalls.length === 1 && selfCalls[0] === "/api/v1/hr/self", { selfCalls });
    await page.screenshot({ path: path.join(OUT, "01-sin-ficha.png") });

    // 2) Con ficha pero sin horario hoy: el mismo panel, con la accion de Talento Humano.
    const sinHorario = await open("con_ficha_sin_horario");
    RESUL.scenarios.con_ficha_sin_horario = { dom: sinHorario.dom, requests };
    check("sin_horario_muestra_el_panel_grande", sinHorario.dom.sinHorarioPanel && sinHorario.text.includes("publique tu horario"), { panel: sinHorario.dom.sinHorarioPanel });
    check("sin_horario_no_monta_las_pestanas", sinHorario.dom.tabs.length === 0, { tabs: sinHorario.dom.tabs });
    check("sin_horario_sin_tarjeta_de_fallo_tecnico", !sinHorario.text.includes("Fallo técnico detectado"));
    await page.screenshot({ path: path.join(OUT, "02-sin-horario.png") });

    // 3) Regresion: con horario del dia la pantalla sigue siendo la de siempre.
    const conHorario = await open("con_ficha_con_horario");
    RESUL.scenarios.con_ficha_con_horario = { dom: conHorario.dom, requests };
    check("con_horario_no_muestra_el_panel", !conHorario.dom.sinHorarioPanel, { panel: conHorario.dom.sinHorarioPanel });
    check("con_horario_conserva_ventana_y_historial", conHorario.dom.tabs.length === 2, { tabs: conHorario.dom.tabs });
    await page.screenshot({ path: path.join(OUT, "03-con-horario.png") });

    // 4) Caida real CON el respaldo del dia en el dispositivo (lo escribio el escenario anterior):
    //    el operario sigue marcando y el aviso que ve es el de conexion, nunca "sin horario".
    const respaldo = await page.evaluate(() => localStorage.getItem("apexos_hr_mobile_snapshot"));
    check("el_escenario_previo_deja_respaldo_del_dia", Boolean(respaldo), { snapshot_chars: respaldo ? respaldo.length : 0 });
    const sinConexion = await open("sin_conexion");
    RESUL.scenarios.sin_conexion_con_respaldo = { dom: sinConexion.dom, requests, consoleErrors: consoleErrors.slice(0, 8) };
    check("caida_con_respaldo_no_anuncia_sin_horario", !sinConexion.dom.sinHorarioPanel, { panel: sinConexion.dom.sinHorarioPanel, statuses: sinConexion.dom.statuses });
    check("caida_con_respaldo_avisa_de_conexion_y_sigue_marcando",
      /Sin conexi[oó]n/.test(sinConexion.text) && sinConexion.dom.tabs.length === 2,
      { tabs: sinConexion.dom.tabs, statuses: sinConexion.dom.statuses });
    await page.screenshot({ path: path.join(OUT, "04-sin-conexion-con-respaldo.png") });

    // 5) Caida real SIN respaldo: tampoco se inventa "sin horario asignado" (el dispositivo no
    //    tiene horario que mostrar), pero el estado que se dice es el de conexion. La ventana se
    //    monta igual: en respaldo la marcacion nunca se bloquea.
    const sinRespaldo = await open("sin_conexion", { fresh: true });
    RESUL.scenarios.sin_conexion_sin_respaldo = { dom: sinRespaldo.dom, requests };
    check("caida_sin_respaldo_no_anuncia_sin_horario", !sinRespaldo.dom.sinHorarioPanel, { panel: sinRespaldo.dom.sinHorarioPanel });
    check("caida_sin_respaldo_avisa_de_conexion_sin_respaldo",
      /Sin conexion y sin horario guardado/.test(sinRespaldo.text) && sinRespaldo.dom.tabs.length === 2,
      { tabs: sinRespaldo.dom.tabs, alerts: sinRespaldo.dom.alerts.slice(-1) });
    await page.screenshot({ path: path.join(OUT, "05-sin-conexion-sin-respaldo.png") });

    RESUL.verdict = { passed: RESUL.checks.filter((item) => item.ok).length, failed: RESUL.checks.filter((item) => !item.ok).length };
    RESUL.finished_at = new Date().toISOString();
    fs.writeFileSync(path.join(OUT, "certification.json"), JSON.stringify(RESUL, null, 2));
    console.log(`VEREDICTO ${RESUL.verdict.passed}/${RESUL.checks.length} · evidencia en ${OUT}`);
    if (!keepOpen) { await browser.close(); browser = null; }
  } catch (error) {
    RESUL.status = "failed";
    RESUL.error = { message: error.message, checks: RESUL.checks };
    fs.writeFileSync(path.join(OUT, "certification.json"), JSON.stringify(RESUL, null, 2));
    throw error;
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    if (process.platform === "win32" && web.pid && web.exitCode === null) {
      try { execFileSync("taskkill", ["/PID", String(web.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }); } catch {}
    } else web.kill();
    fs.closeSync(logHandle);
    if (fs.readFileSync(nextEnvPath, "utf8").includes(DIST_DIR)) fs.writeFileSync(nextEnvPath, previousNextEnv);
    const config = JSON.parse(fs.readFileSync(tsconfigPath, "utf8"));
    const includes = (config.include || []).filter((item) => !item.includes(`${DIST_DIR}/`) || previousIncludes.includes(item));
    if (includes.length !== (config.include || []).length) fs.writeFileSync(tsconfigPath, JSON.stringify({ ...config, include: includes }, null, 2) + "\n");
  }
}

main().catch((error) => { console.error(`BLOQUEO: ${error.message}`); process.exitCode = 1; });
