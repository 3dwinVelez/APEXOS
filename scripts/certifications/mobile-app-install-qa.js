#!/usr/bin/env node

// Arnes de navegador contra el QA DESPLEGADO: la guia del acceso ofrece un boton que ABRE la URL
// administrada, en celular y en computador.
//
// Por que existe: `mobile-app-install-browser-local.js` corre contra el artefacto del puesto con la
// API simulada por intercepcion de peticiones, y `mobile-app-url-admin-qa.js` corre contra el ambiente
// pero solo habla con el API. Ninguno de los dos afirma lo que hay que afirmar antes de llevar esto a
// Produccion: que el portal servido en QA, con su propio proxy, pinta en el acceso un enlace cuyo
// destino es el valor guardado en la base de QA. Esta pata estaba medida a mano; aqui queda versionada.
//
// No elige ambiente por defecto: el origen tiene que ser exactamente el host web de QA y se aborta si
// alguien le pasa el dominio de Produccion. No deja el enlace movido: restaura el respaldo siempre, y la
// cuenta efimera la cierra `mobile-app-url-admin-qa.js --retire=<fixture>`.
//
// Uso:
//   node scripts/certifications/mobile-app-url-admin-qa.js --seed-only \
//     --env-file=config/qa.env --output=docs/qa/evidence/<dir>/siembra.json
//   node scripts/certifications/mobile-app-install-qa.js \
//     --fixture=.tmp/qa-ephemeral-<run>.json \
//     --output=docs/qa/evidence/<dir>/qa-navegador-arnes.json
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const ROOT = path.resolve(__dirname, "..", "..");
const QA_WEB_HOST = "https://apexos-web-qa-production.up.railway.app";
const PRODUCCION_HOSTES = ["app.apexos.com.co", "apexos.com.co", "jzbwzmkidfthknsohhnr"];
const FALLBACK = "https://appapexos-production.up.railway.app";
// URL real y viva del propio API de QA: si el ancla apuntara a otra parte, el destino no coincide.
const MARCADOR = "https://apexos-api-qa-production.up.railway.app";

function arg(name) {
  const eq = process.argv.find((item) => item.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--") ? process.argv[index + 1] : index >= 0;
}

const FIXTURE = String(arg("fixture") || "");
const OUTPUT = String(arg("output") || "");
const ORIGIN = String(arg("origin") || process.env.QA_WEB_URL || QA_WEB_HOST).replace(/\/+$/, "");

if (!FIXTURE) throw new Error("Falta --fixture=<ruta del json que dejo --seed-only>: la clave no se pasa por la linea de comandos.");
if (!OUTPUT) throw new Error("Falta --output con la ruta de evidencia.");
const absoluteOutput = path.resolve(ROOT, OUTPUT);
if (!absoluteOutput.startsWith(path.join(ROOT, "docs", "qa", "evidence") + path.sep)) {
  throw new Error("--output debe escribir dentro de docs/qa/evidence/.");
}
if (fs.existsSync(absoluteOutput)) throw new Error(`--output apunta a evidencia existente (${OUTPUT}): use una ruta nueva.`);
if (ORIGIN !== QA_WEB_HOST) throw new Error(`BLOQUEADO: solo se puede correr contra ${QA_WEB_HOST}.`);
if (PRODUCCION_HOSTES.some((host) => ORIGIN.includes(host))) throw new Error("BLOQUEADO: el origen apunta a Produccion.");

const fixturePath = path.resolve(ROOT, FIXTURE);
if (!fs.existsSync(fixturePath)) throw new Error(`No existe el fixture ${FIXTURE}`);
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const cuenta = fixture.superadmin || {};
if (!cuenta.email || !cuenta.clave) throw new Error("El fixture no trae la cuenta superadmin con su clave.");

// El copy se lee de la misma libreria que pinta la pantalla: si alguien reescribe el rotulo, el arnes
// cambia con ella y no queda afirmando una cadena que ya no existe.
const libSource = fs.readFileSync(path.join(ROOT, "apps", "web", "lib", "mobileAppInstall.ts"), "utf8");
function libString(name) {
  const found = libSource.match(new RegExp(`${name}: "((?:[^"\\\\]|\\\\.)*)"`));
  assert.ok(found, `falta la cadena ${name} en apps/web/lib/mobileAppInstall.ts`);
  return JSON.parse(`"${found[1]}"`);
}
const LABELS = {
  bandAction: libString("bandAction"),
  guideTitle: libString("guideTitle"),
  openApp: libString("openApp"),
  desktopNotice: libString("desktopNotice")
};

const UA_MOVIL = "Mozilla/5.0 (Linux; Android 14; SM-A155G Build/UP1A.231005.007) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.100 Mobile Safari/537.36";
const UA_ESCRITORIO = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

const doc = {
  instrumento: "mobile-app-install-qa",
  ejecutado_en: new Date().toISOString(),
  ambiente: "QA (despliegue de develop)",
  origen: ORIGIN,
  cuenta_efimera: cuenta.email,
  checks: [],
  notas: []
};

function registrar(nombre, afirma, detalle) {
  let ok = false;
  let error = null;
  try {
    afirma();
    ok = true;
  } catch (e) {
    error = e.message;
  }
  doc.checks.push({ nombre, ok, detalle: { ...(detalle || {}), ...(error ? { motivo: error } : {}) } });
  console.log(`${ok ? "PASS" : "ROTO"} ${nombre}${error ? ` :: ${error}` : ""}`);
  return ok;
}

async function paso(method, route, token, body) {
  const res = await fetch(`${ORIGIN}${route}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const texto = await res.text();
  let parsed = {};
  try { parsed = JSON.parse(texto); } catch { parsed = { crudo: texto.slice(0, 200) }; }
  return { status: res.status, body: parsed };
}

async function abrirGuia(browser, userAgent, esMovil, ventanillas) {
  const page = await browser.newPage();
  page.on("dialog", async (dialog) => { ventanillas.push(dialog.type()); await dialog.dismiss().catch(() => {}); });
  await page.setUserAgent(userAgent);
  await page.setViewport(esMovil ? { width: 412, height: 915, isMobile: true, hasTouch: true } : { width: 1366, height: 900 });
  await page.goto(`${ORIGIN}/login`, { waitUntil: "networkidle2", timeout: 90000 });
  const antes = await page.evaluate((needle) => (document.body.innerText || "").includes(needle), LABELS.guideTitle);
  const pulsado = await page.evaluate((needle) => {
    const boton = [...document.querySelectorAll("button")].find((node) => (node.innerText || "").includes(needle) && node.getClientRects().length > 0);
    if (!boton) return false;
    boton.click();
    return true;
  }, LABELS.bandAction);
  await page.waitForSelector("[role='dialog']", { timeout: 25000 }).catch(() => undefined);
  const leer = () => page.evaluate(() => {
    const dialog = document.querySelector("[role='dialog']");
    const enlaces = dialog ? [...dialog.querySelectorAll("a")] : [];
    const destino = enlaces.filter((node) => /^https?:/.test(node.getAttribute("href") || ""));
    const pintado = (node) => {
      if (!node) return false;
      const caja = node.getBoundingClientRect();
      const estilo = getComputedStyle(node);
      return caja.width > 0 && caja.height > 0 && estilo.visibility !== "hidden" && estilo.display !== "none";
    };
    return {
      guia_abierta: Boolean(dialog),
      texto: dialog ? (dialog.innerText || "") : "",
      rotulo_boton: dialog ? ([...dialog.querySelectorAll("button")].map((node) => (node.innerText || "").trim()).filter(Boolean).join("|")) : "",
      enlaces: destino.length,
      href: destino[0] ? destino[0].href : "",
      target: destino[0] ? destino[0].target : "",
      rel: destino[0] ? destino[0].rel : "",
      accion_pintada: pintado(destino[0])
    };
  });
  // El enlace solo existe cuando la lectura publica del ambiente resuelve: muestrear en cuanto abre el
  // dialogo produce un rojo del arnes, no del producto. Se espera acotado y se consigna cuanto tardo.
  const inicio = Date.now();
  let leido = await leer();
  while (!leido.href && Date.now() - inicio < 15000) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    leido = await leer();
  }
  leido.espera_enlace_ms = Date.now() - inicio;
  return { page, antes, pulsado, leido };
}

async function main() {
  let browser = null;
  let token = null;
  let guardado = false;
  try {
    const publicoAntes = await paso("GET", "/api/v1/public/platform/mobile-app", null, undefined);
    registrar("el_portal_de_qa_proxyeia_la_lectura_publica", () => {
      assert.equal(publicoAntes.status, 200, `HTTP ${publicoAntes.status} desde el host web`);
      assert.ok(String(publicoAntes.body.url || "").startsWith("https"), `url leida: ${publicoAntes.body.url}`);
    }, { status: publicoAntes.status, url: publicoAntes.body.url });

    const sesión = await paso("POST", "/api/v1/auth/login", null, { email: cuenta.email, password: cuenta.clave });
    token = sesión.body.token || sesión.body.access_token;
    registrar("la_cuenta_efimera_entra_por_el_portal", () => {
      assert.ok(token, `login HTTP ${sesión.status} sin token`);
    }, { status: sesión.status });

    const escritura = await paso("PUT", "/api/v1/admin/platform/mobile-app", token, { url: MARCADOR });
    guardado = escritura.status === 200;
    registrar("guardar_por_el_portal_cambia_el_valor_de_qa", () => {
      assert.equal(escritura.status, 200, `HTTP ${escritura.status}: ${JSON.stringify(escritura.body).slice(0, 160)}`);
      assert.equal(escritura.body.environment, "qa", `el servidor declaro ${escritura.body.environment}`);
      assert.equal(escritura.body.url, MARCADOR);
    }, { status: escritura.status, environment: escritura.body.environment, url: escritura.body.url });

    const puppeteer = require("puppeteer-core");
    const executablePath = [
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
      "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
    ].find((file) => fs.existsSync(file));
    assert.ok(executablePath, "no hay Chrome ni Edge instalados");
    browser = await puppeteer.launch({ executablePath, headless: true });

    const popups = [];
    browser.on("targetcreated", (target) => { if (target.type() === "page") popups.push(target); });
    const ventanillas = [];

    const movil = await abrirGuia(browser, UA_MOVIL, true, ventanillas);
    registrar("antes_de_pulsar_no_hay_guia", () => {
      assert.equal(movil.antes, false, "la guia ya estaba en pantalla: el arnes estaria ciego");
      assert.equal(movil.pulsado, true, "el boton de la banda no existe o no esta pintado");
    }, { antes: movil.antes, pulsado: movil.pulsado });
    registrar("celular_un_solo_enlace_directo_en_la_guia", () => {
      assert.equal(movil.leido.guia_abierta, true, "no abrio la guia");
      assert.equal(movil.leido.enlaces, 1, `hay ${movil.leido.enlaces} enlaces al servicio`);
      assert.equal(movil.leido.accion_pintada, true, "el enlace no esta pintado");
    }, { enlaces: movil.leido.enlaces, href: movil.leido.href });
    registrar("celular_abre_el_valor_administrado_en_qa", () => {
      assert.equal(movil.leido.href, `${MARCADOR}/`, `href servido en QA: ${movil.leido.href}`);
    }, { href: movil.leido.href, esperado: `${MARCADOR}/` });
    registrar("celular_en_pestananueva_y_sin_exponer_la_ventana", () => {
      assert.equal(movil.leido.target, "_blank");
      assert.match(movil.leido.rel, /(^|\s)noopener(\s|$)/);
    }, { target: movil.leido.target, rel: movil.leido.rel });
    registrar("la_guia_no_ofrece_copiar", () => {
      assert.ok(!/copiar/i.test(movil.leido.rotulo_boton), `rotulos de botones: ${movil.leido.rotulo_boton}`);
      assert.ok(!/clipboard/i.test(movil.leido.texto), "el portapapeles volvio a la pantalla");
    }, { rotulos: movil.leido.rotulo_boton });
    await movil.page.close();

    const escritorio = await abrirGuia(browser, UA_ESCRITORIO, false, ventanillas);
    registrar("computador_tambien_tiene_el_boton_directo", () => {
      assert.equal(escritorio.leido.guia_abierta, true, "no abrio la guia en computador");
      assert.equal(escritorio.leido.enlaces, 1, `en computador hay ${escritorio.leido.enlaces} enlaces: debe haber exactamente el de la guia`);
      assert.equal(escritorio.leido.href, `${MARCADOR}/`, `href del computador: ${escritorio.leido.href}`);
    }, { enlaces: escritorio.leido.enlaces, href: escritorio.leido.href });
    registrar("computador_mantiene_el_aviso_de_exclusividad", () => {
      assert.ok(escritorio.leido.texto.includes(LABELS.desktopNotice), "se perdio el aviso de que la app es de celulares");
      assert.ok(/exclusiva para celulares/i.test(escritorio.leido.texto));
    }, { trozo: escritorio.leido.texto.slice(0, 120) });
    registrar("computador_deja_el_enlace_escrito_como_respaldo", () => {
      assert.ok(escritorio.leido.texto.includes(MARCADOR), "el enlace escrito desaparecio de la pantalla");
    }, { incluye_marcador: escritorio.leido.texto.includes(MARCADOR) });

    const pestanasAntes = popups.length;
    const abrio = await escritorio.page.evaluate(() => {
      const enlace = [...document.querySelectorAll("[role='dialog'] a")].find((node) => /^https?:/.test(node.getAttribute("href") || ""));
      if (!enlace) return false;
      enlace.click();
      return true;
    });
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const nuevas = popups.slice(pestanasAntes);
    const destinos = nuevas.map((target) => target.url()).filter(Boolean);
    registrar("pulsar_el_boton_abre_una_ventana_a_la_url", () => {
      assert.equal(abrio, true, "no hay enlace que pulsar en la guia");
      assert.equal(nuevas.length, 1, `el navegador abrio ${nuevas.length} ventanas`);
      assert.ok(destinos.length === 1 && destinos[0].startsWith(MARCADOR), `destinos: ${JSON.stringify(destinos)}`);
    }, { abrio, creadas: nuevas.length, destinos });
    for (const target of nuevas) {
      const opened = await target.page().catch(() => null);
      if (opened) await opened.close().catch(() => undefined);
    }
    registrar("abrir_no_dejo_ventanilla_nativa", () => {
      assert.deepEqual(ventanillas, [], `ventanillas: ${JSON.stringify(ventanillas)}`);
    }, { vistas: ventanillas.length });
    await escritorio.page.close();

    const restaurado = await paso("PUT", "/api/v1/admin/platform/mobile-app", token, { url: FALLBACK });
    registrar("restaurar_devuelve_el_destino_quemado", () => {
      assert.equal(restaurado.status, 200, `HTTP ${restaurado.status}`);
      assert.equal(restaurado.body.restaurada, true, `restaurada: ${restaurado.body.restaurada}`);
    }, { status: restaurado.status, restaurada: restaurado.body.restaurada });
    guardado = false;
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    if (guardado && token) {
      // Si el arnes se cae a mitad, el enlace no puede quedar apuntando al marcador de prueba.
      const limpio = await paso("PUT", "/api/v1/admin/platform/mobile-app", token, { url: FALLBACK }).catch(() => null);
      doc.notas.push(`restauracion de emergencia en el bloque finally: HTTP ${limpio ? limpio.status : "sin respuesta"}`);
    }
    doc.veredicto = { passed: doc.checks.filter((item) => item.ok).length, total: doc.checks.length };
    fs.mkdirSync(path.dirname(absoluteOutput), { recursive: true });
    fs.writeFileSync(absoluteOutput, `${JSON.stringify(doc, null, 2)}\n`);
    const rojos = doc.checks.filter((item) => !item.ok).length;
    console.log(`VEREDICTO ${doc.veredicto.passed}/${doc.veredicto.total} · ${rojos} rojos · evidencia en ${OUTPUT}`);
    if (rojos) process.exitCode = 1;
  }
}

main().catch((error) => {
  doc.checks.push({ nombre: "aborte", ok: false, detalle: { motivo: error.message } });
  doc.veredicto = { passed: doc.checks.filter((item) => item.ok).length, total: doc.checks.length };
  fs.mkdirSync(path.dirname(absoluteOutput), { recursive: true });
  fs.writeFileSync(absoluteOutput, `${JSON.stringify(doc, null, 2)}\n`);
  console.error(`ABORTO: ${error.message}`);
  process.exit(1);
});
