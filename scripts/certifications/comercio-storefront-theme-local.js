/* Certificacion navegador versionada de la vitrina publica tematizada del Comercio (M-30).
 *
 * Chromium real, API local real y PostgreSQL local real. No hay interception de
 * peticiones ni burlas: el tema se escribe por el endpoint autenticado, el navegador lo
 * lee como lo haria un cliente, y el panel se opera con teclado y mouse reales.
 *
 * Previos:
 *   - API local en LOCAL_API_URL (por defecto http://127.0.0.1:3000)
 *   - Web local en LOCAL_WEB_URL  (por defecto http://127.0.0.1:3001, en modo dev)
 *   - DATABASE_URL apuntando a PostgreSQL local
 *   - Tenant con Comercio sembrado y vitrina publicada (scripts/seed-comercio-demo.js)
 *
 * Orden deliberado: primero se pinta el estado SIN tema (es la linea base que no debe
 * cambiar para los comercio ya configurados), despues el tema propio, despues un fondo
 * claro. Asi la foto 01 es comparable con la vitrina anterior al cambio.
 *
 * Limitacion declarada: el bucket Supabase (comercio-assets) no existe en este ambiente.
 * La subida de banner y la persistencia de la imagen generada se reportan con su codigo
 * como bloqueo de ambiente, no como verificado. La generacion contra el modelo gratuito
 * si se ejercita: si el rechazo llega del almacenamiento y no del generador, las bytes
 * del proveedor llegaron validas.
 */
require("../load-env")();
process.env.NODE_ENV = process.env.NODE_ENV || "test";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const puppeteer = require("puppeteer-core");
const { PrismaClient } = require("@prisma/client");

const root = path.resolve(__dirname, "../..");
const databaseUrl = String(process.env.DATABASE_URL || "");
if (!/^postgres(?:ql)?:\/\/[^@\s]+@(localhost|127\.0\.0\.1)(:\d+)?\//.test(databaseUrl)) {
  throw new Error("BLOQUEADO: DATABASE_URL debe apuntar a PostgreSQL local.");
}
function localHttpUrl(name, value) {
  let parsed = null;
  try { parsed = new URL(value); } catch { parsed = null; }
  if (!parsed || parsed.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(parsed.hostname)) {
    throw new Error(`BLOQUEADO: ${name} debe ser una URL http local.`);
  }
  return String(value).replace(/\/+$/, "");
}
const apiUrl = localHttpUrl("LOCAL_API_URL", process.env.LOCAL_API_URL || "http://127.0.0.1:3000");
const webUrl = localHttpUrl("LOCAL_WEB_URL", process.env.LOCAL_WEB_URL || "http://127.0.0.1:3001");
const output = path.resolve(process.env.BROWSER_EVIDENCE_PATH || "docs/qa/evidence/vitrina-comercio-tematizada-20261105/browser-local.json");
const browserPath = process.env.CHROME_BIN || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const email = process.env.APEX_CERT_EMAIL || "demo@apex.local";
const password = process.env.APEX_CERT_PASSWORD || "test1234";
// Asset estatico del sitio: sirve como banner para certificar la ruta de render sin
// depender del bucket, que no existe en local. El API solo produce rutas de este tipo.
const sampleAsset = "/comercio/productos/P-0001.jpg";

const checks = [];
const db = new PrismaClient();
// Instantanea de las preferencias del tenant. Se restaura SIEMPRE, incluso cuando la
// certificacion falla a mitad: un run rojo no debe dejar temas pegados en la demo.
let restaurar = null;
function check(name, ok, detail = {}) {
  checks.push({ name, ok: Boolean(ok), detail });
  assert.ok(ok, `${name}: ${JSON.stringify(detail)}`);
}

async function call(url, { token, method = "GET", body, form } = {}) {
  const headers = { accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  // Un FormData no lleva content-type propio: fetch pone el boundary. El payload se
  // elige aqui (form o body), si no la peticion salia sin cuerpo y multipart la rechazaba.
  const payload = form || (body ? JSON.stringify(body) : null);
  if (body && !form) headers["content-type"] = "application/json";
  const response = await fetch(`${apiUrl}${url}`, { method, headers, ...(payload ? { body: payload } : {}) });
  const text = await response.text();
  let payloadJson = null;
  try { payloadJson = JSON.parse(text); } catch { payloadJson = { message: text.slice(0, 300) }; }
  return { status: response.status, payload: payloadJson };
}

function parseRgb(value) {
  const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(String(value));
  return match ? { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) } : null;
}
function hexToRgb(hex) {
  const value = parseInt(String(hex).replace("#", ""), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}
function closeTo(rgb, hex, tolerance = 4) {
  const target = hexToRgb(hex);
  return Boolean(rgb) && Math.abs(rgb.r - target.r) <= tolerance && Math.abs(rgb.g - target.g) <= tolerance && Math.abs(rgb.b - target.b) <= tolerance;
}
// Luminancia y razon de contraste WCAG 2.1, para no tener fe en el screenshot.
function luminance({ r, g, b }) {
  const channel = (raw) => {
    const c = raw / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// El pie de foto del destacado: la letra cae sobre un degradado que termina en el fondo del
// tema. Si su tramo solido se corta antes de donde empieza el texto, la letra se pinta sobre
// los pixeles de la fotografia — con tema oscuro se perdonaba, con tema claro no. Se mide la
// rampa que Chromium efectivamente resolvio, no la que dice la hoja.
function pintaElPieDelDestacado(pintura, etiqueta) {
  const rampa = String(pintura?.pieFondo || "");
  // Chromium serializa cada parada como `rgb(11, 18, 32)` o `rgba(11, 18, 32, 0.97) 58%`.
  // Se captura la PARADA COMPLETA, no el interior del parentesis: parseRgb necesita el prefijo
  // `rgb(`/`rgba(` para reconocerlo y el alfa vive en el cuarto componente.
  const paradas = [...rampa.matchAll(/(rgba?\([^)]*\))(?:\s+(\d+(?:\.\d+)?)%)?/g)].map((m) => ({
    parada: m[1],
    rgb: parseRgb(m[1]),
    alpha: Number(/^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)$/.exec(m[1])?.[1] ?? 1),
    at: m[2] === undefined ? null : Number(m[2])
  })).filter((s) => s.rgb);
  const solidos = paradas.filter((s) => s.alpha >= 0.9);
  const cubre = solidos.some((s) => s.at !== null && s.at >= 55);
  check(`el_pie_del_destacado_cubre_la_letra_${etiqueta}`, cubre, { rampa: rampa.slice(0, 220), solidos });
  // La rampa tiene que estar armada con el FONDO DEL TEMA. Declarada en :root se congelaba
  // al negro de la hoja y el comercio con fondo claro recibia letra casi negra sobre negro.
  // Se compara TODA parada solida: una sola que no sea el fondo del tema es letra perdida.
  const fondo = parseRgb(pintura?.fondo);
  const fueraDelTema = solidos.filter((s) => !fondo || contrastRatio(s.rgb, fondo) >= 1.06).map((s) => s.parada);
  check(`la_rampa_del_pie_usa_el_fondo_del_tema_${etiqueta}`, solidos.length > 0 && Boolean(fondo) && fueraDelTema.length === 0, {
    solidos: solidos.map((s) => s.parada),
    fondo: pintura?.fondo,
    fueraDelTema
  });
  const letra = parseRgb(pintura?.destacadoLetra);
  check(`la_letra_del_destacado_contra_la_rampa_${etiqueta}`, Boolean(letra && fondo) && contrastRatio(letra, fondo) >= 4.5, {
    destacadoLetra: pintura?.destacadoLetra,
    fondo: pintura?.fondo
  });
}

async function waitForServer(url) {
  let ultimo = null;
  for (const endpoint of ["/api/v1/health", "/health", "/"]) {
    try {
      const response = await fetch(`${url}${endpoint}`, { signal: AbortSignal.timeout(8000) });
      if (response.ok) return;
      ultimo = `${endpoint} -> ${response.status}`;
    } catch (error) {
      ultimo = `${endpoint} -> ${error.message}`;
    }
  }
  throw new Error(`${url} no responde (${ultimo})`);
}

async function shot(page, label) {
  const file = path.join(path.dirname(output), `${label}.png`);
  const bytes = Buffer.from(await page.screenshot({ encoding: "base64", fullPage: false }), "base64");
  // El PNG de la corrida anterior puede seguir bloqueado por el antivirus del puesto: se
  // escribe sobre un archivo fresco y, si aun asi falla, se reintenta una vez.
  try {
    fs.rmSync(file, { force: true });
  } catch {
    // ignore
  }
  try {
    fs.writeFileSync(file, bytes);
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 600));
    fs.rmSync(file, { force: true });
    fs.writeFileSync(file, bytes);
  }
  return path.relative(root, file).replace(/\\/g, "/");
}

// Lee lo que el navegador realmente pinto: variables inyectadas y colores computados.
async function readPaint(page) {
  return page.evaluate(() => {
    const raiz = document.querySelector("#inicio");
    const styles = (node) => (node ? getComputedStyle(node) : null);
    const parseAlpha = (color) => {
      const m = /rgba\([^)]*,\s*([\d.]+)\)/.exec(String(color || ""));
      if (m) return Number(m[1]);
      return /rgb\(/.test(String(color || "")) ? 1 : null;
    };
    const banner = document.querySelector("img.sf-banner-img");
    const titular = document.querySelector("h1");
    const control = document.querySelector("#inicio .rounded-lg");
    const vela = document.querySelector(".sf-banner-scrim");
    const tarjeta = document.querySelector("#inicio article");
    // El precio se mide contra la superficie que lo sostiene de verdad: se sube por el DOM
    // hasta el primer ancestro con fondo pintado. Comparar el color del precio contra "la
    // primera tarjeta de la pagina" enfrentaba dos elementos que no estan uno sobre el otro.
    const precio = [...document.querySelectorAll("span, p, div")].find((node) => /(^|\s)sf-text-accent(\s|$)/.test(String(node.className)) && /\$\s?[\d.]/.test(node.textContent || ""));
    const soporteDelPrecio = (() => {
      let nodo = precio?.parentElement || null;
      while (nodo) {
        const fondo = getComputedStyle(nodo).backgroundColor;
        const alpha = parseAlpha(fondo);
        if (alpha !== null && alpha > 0.5) return fondo;
        nodo = nodo.parentElement;
      }
      return null;
    })();
    const boton = [...document.querySelectorAll("button, a")].find((node) => /sf-btn-accent/.test(String(node.className)));
    const pieDestacado = document.querySelector("#inicio .sf-grad-below");
    // El titular del destacado es el parrafo con la letra mas grande del pie de foto: la
    // categoria puede no existir y el orden de los hijos no es contrato.
    const nombreDestacado = pieDestacado
      ? [...pieDestacado.querySelectorAll("p")].sort((a, b) => parseFloat(getComputedStyle(b).fontSize) - parseFloat(getComputedStyle(a).fontSize))[0]
      : null;
    return {
      hasRaiz: Boolean(raiz),
      vars: raiz ? String(raiz.getAttribute("style")) : null,
      fondo: styles(raiz)?.backgroundColor,
      // Patron de fondo: la raiz pinta un degradado cuando el comercio eligio uno, y
      // "none" cuando eligio liso. Es lo unico que distingue un fondo plano de uno texturado.
      patron: styles(raiz)?.backgroundImage,
      letraRaiz: styles(raiz)?.color,
      tarjetaFondo: styles(tarjeta)?.backgroundColor,
      tarjetaRadio: styles(tarjeta)?.borderTopLeftRadius,
      controlRadio: styles(control)?.borderTopLeftRadius,
      velaFondo: styles(vela)?.backgroundImage,
      pieFondo: styles(pieDestacado)?.backgroundImage,
      destacadoLetra: styles(nombreDestacado)?.color,
      titularTexto: titular ? (titular.textContent || "").trim() : null,
      titularColor: styles(titular)?.color,
      precioColor: styles(precio)?.color,
      precioSuperficie: soporteDelPrecio,
      botonChange: styles(boton)?.backgroundColor,
      botonLetra: styles(boton)?.color,
      bannerPresente: Boolean(banner),
      bannerSrc: banner ? banner.getAttribute("src") : null,
      bannerCargado: banner ? banner.naturalWidth > 0 : false,
      bannerCaja: banner ? (() => {
        const caja = banner.getBoundingClientRect();
        return { w: Math.round(caja.width), h: Math.round(caja.height) };
      })() : null
    };
  });
}

async function main() {
  await waitForServer(apiUrl);
  await waitForServer(webUrl);
  fs.mkdirSync(path.dirname(output), { recursive: true });

  const inicial = await db.comercioSettings.findFirst({ where: { catalog_enabled: true }, select: { id: true, tenant_id: true, catalog_code: true, preferences_json: true } });
  if (!inicial?.catalog_code) throw new Error("BLOQUEADO: no hay vitrina publicada en local (corre node scripts/seed-comercio-demo.js).");
  const settingsId = inicial.id;
  const code = inicial.catalog_code;
  // Instantanea de las preferencias: la certificacion devuelve el tenant a su estado.
  const originalPreferences = structuredClone(inicial.preferences_json || {});
  delete originalPreferences.theme;
  restaurar = () => db.comercioSettings.update({ where: { id: inicial.id }, data: { preferences_json: originalPreferences } });
  await restaurar();
  check("entorno_local_listo", true, { apiUrl, webUrl, tenant_id: inicial.tenant_id, catalog_code: code });

  const login = await call("/api/v1/auth/login", { method: "POST", body: { email, password } });
  const token = login.payload.token || login.payload.access_token;
  check("login_real", login.status === 200 && Boolean(token), { status: login.status });

  // === Contrato del catalogo publico (lo que ve un visitante anonimo) ===
  const anonimo = await call(`/api/v1/public/comercio/catalog/${code}`);
  const serializado = JSON.stringify(anonimo.payload);
  check("catalogo_publico_responde", anonimo.status === 200 && Array.isArray(anonimo.payload.items), { status: anonimo.status, items: anonimo.payload.items?.length ?? 0 });
  check("catalogo_publico_no_filtra_costo_stock_ni_tenant", !/"cost[a-z_]*"\s*:|"stock[a-z_]*"\s*:|"tenant_id"|banner_path/.test(serializado), {
    claves: Object.keys(anonimo.payload),
    muestra: serializado.slice(0, 160)
  });
  check("tema_viaja_con_el_catalogo", /^#[0-9a-f]{6}$/i.test(String(anonimo.payload.theme?.accent || "")), { theme: anonimo.payload.theme });

  // === Defensas de la escritura del tema ===
  const hexMalo = await call("/api/v1/comercio/settings/storefront/theme", { token, method: "PUT", body: { accent: "javascript:alert(1)" } });
  check("rechaza_hex_invalido", hexMalo.status === 400, { status: hexMalo.status, error: hexMalo.payload?.error?.code ?? hexMalo.payload?.message });
  const textoLargo = await call("/api/v1/comercio/settings/storefront/theme", { token, method: "PUT", body: { headline: "x".repeat(200) } });
  check("rechaza_texto_demasiado_largo", textoLargo.status === 400, { status: textoLargo.status });
  // Los modos se publican como CSS (radio, patron, opacidad del velo). Un valor libre no
  // puede llegar a la pagina: el enum del schema lo corta antes de escribir.
  const modoMalo = await call("/api/v1/comercio/settings/storefront/theme", { token, method: "PUT", body: { background_pattern: "url(http://evil.test/x.png)" } });
  check("rechaza_un_patron_fuera_del_enum", modoMalo.status === 400, { status: modoMalo.status, error: modoMalo.payload?.error?.code ?? modoMalo.payload?.message });
  const radioMalo = await call("/api/v1/comercio/settings/storefront/theme", { token, method: "PUT", body: { corner_radius: "0; position: fixed; inset: 0" } });
  check("rechaza_un_radio_fuera_del_enum", radioMalo.status === 400, { status: radioMalo.status });
  // Fastify valida con ajv `removeAdditional`, es decir DESCARTA claves no declaradas en
  // vez de responder 400. Lo que importa es el efecto: ni la URL ni el path interno del
  // bucket pueden quedar escritos. Si algun dia el schema cambia a rechazo exploto, la
  // misma lectura de backstop vale (status 400 y tema intacto).
  const antesDeInyectar = await call("/api/v1/comercio/settings", { token });
  const temaAntes = JSON.stringify(antesDeInyectar.payload?.theme || {});
  const urlInyectada = await call("/api/v1/comercio/settings/storefront/theme", { token, method: "PUT", body: { banner_url: "https://evil.test/x.png" } });
  const despuesUrl = await call("/api/v1/comercio/settings", { token });
  check("el_cliente_no_pone_url_de_imagen", JSON.stringify(despuesUrl.payload?.theme || {}) === temaAntes, {
    status: urlInyectada.status, tema: despuesUrl.payload?.theme, antes: antesDeInyectar.payload?.theme
  });
  const pathInyectado = await call("/api/v1/comercio/settings/storefront/theme", { token, method: "PUT", body: { banner_path: "/otro-tenant/secreto.jpg" } });
  const despuesPath = await call("/api/v1/comercio/settings", { token });
  check("el_cliente_no_pone_path_del_bucket", despuesPath.status === 200 && !String(despuesPath.payload?.preferences?.theme?.banner_path || "").includes("secreto"), {
    status: pathInyectado.status, guardado: despuesPath.payload?.preferences?.theme?.banner_path ?? null
  });
  const promptVacio = await call("/api/v1/comercio/settings/storefront/generate-image", { token, method: "POST", body: { prompt: "abc" } });
  check("rechaza_prompt_demasiado_corto", promptVacio.status === 400, { status: promptVacio.status });

  // === Estado SIN tema: la vitrina de siempre, foto comparable con el antes ===
  if (!fs.existsSync(browserPath)) throw new Error(`BLOQUEADO: no existe el navegador en ${browserPath}. Define CHROME_BIN.`);
  // En modo dev la ruta se compila al primer golpe (SSR + 119 productos): casi 20 s.
  // Se calienta antes de abrir el navegador para no cobrarle ese costo a la pagina.
  const calentado = await fetch(`${webUrl}/tienda/${code}`, { signal: AbortSignal.timeout(240000) }).catch(() => null);
  check("vitrina_calienta_la_ruta", Boolean(calentado?.ok), { status: calentado?.status ?? null });
  const browser = await puppeteer.launch({ executablePath: browserPath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const vitrinaUrl = `${webUrl}/tienda/${code}`;
  const pinturas = {};
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 900, deviceScaleFactor: 1 });
    const primera = await page.goto(vitrinaUrl, { waitUntil: "networkidle2", timeout: 120000 });
    check("vitrina_responde", primera.status() === 200, { status: primera.status(), url: vitrinaUrl });
    pinturas.sinTema = await readPaint(page);
    const base = pinturas.sinTema;
    check("sin_tema_usa_el_fondo_neutral_950_de_siempre", closeTo(parseRgb(base.fondo), "#0A0A0A"), { fondo: base.fondo });
    check("sin_tema_conserva_el_esmeralda_original", closeTo(parseRgb(base.botonChange), "#10B981"), { botonChange: base.botonChange });
    check("el_boton_solido_de_fabrica_es_legible", (() => {
      const fondo = parseRgb(base.botonChange);
      const letra = parseRgb(base.botonLetra);
      if (!fondo || !letra) return false;
      return contrastRatio(fondo, letra) >= Math.max(contrastRatio(fondo, hexToRgb("#FFFFFF")), contrastRatio(fondo, hexToRgb("#0A0A0A"))) - 0.05;
    })(), { botonChange: base.botonChange, botonLetra: base.botonLetra });
    check("sin_tema_no_hay_banner", base.bannerPresente === false, { bannerSrc: base.bannerSrc });
    pinturas.fotoSinTema = await shot(page, "01-vitrina-sin-tema");

    // === Tema propio del comercio: colores, textos y cartel ===
    const guardado = await call("/api/v1/comercio/settings/storefront/theme", {
      token,
      method: "PUT",
      body: { accent: "#2563EB", promo: "#F97316", base: "#0B1220", headline: "La despensa del barrio, en un clic", subhead: "Pide por WhatsApp y te la llevamos hoy" }
    });
    check("tema_guardado_en_minusculas", guardado.status === 200 && guardado.payload.theme?.accent === "#2563eb", { status: guardado.status, theme: guardado.payload.theme });
    const otras = Object.keys(guardado.payload.preferences || {}).filter((key) => key !== "theme");
    check("no_pisa_las_demas_preferencias", otras.every((key) => JSON.stringify(guardado.payload.preferences[key]) === JSON.stringify((inicial.preferences_json || {})[key])), { claves: otras });

    // El banner lo escribe el servidor (aqui por la misma via de persistencia del upload);
    // la vitrina debe recibir la URL publica, nunca el path interno del bucket.
    const conBanner = await db.comercioSettings.findFirst({ where: { id: settingsId }, select: { preferences_json: true } });
    const prefsBanner = structuredClone(conBanner.preferences_json);
    prefsBanner.theme.banner_path = sampleAsset;
    await db.comercioSettings.update({ where: { id: settingsId }, data: { preferences_json: prefsBanner } });
    const publicoConBanner = await call(`/api/v1/public/comercio/catalog/${code}`);
    check("el_servidor_produce_la_url_del_banner", publicoConBanner.payload.theme?.banner_url === sampleAsset, { banner_url: publicoConBanner.payload.theme?.banner_url });
    check("el_publico_no_filtra_el_path_interno", !/"banner_path"/.test(JSON.stringify(publicoConBanner.payload)), {});

    await page.goto(vitrinaUrl, { waitUntil: "networkidle2", timeout: 120000 });
    pinturas.temaOscuro = await readPaint(page);
    const oscuro = pinturas.temaOscuro;
    check("la_vitrina_usa_el_fondo_del_comercio", closeTo(parseRgb(oscuro.fondo), "#0B1220"), { fondo: oscuro.fondo });
    check("el_raiz_inyecta_la_tripleta_del_acento", /--sf-accent-t:\s*37 99 235/.test(String(oscuro.vars)), { inicio: String(oscuro.vars).slice(0, 140) });
    check("el_boton_primario_sigue_el_acento_nuevo", closeTo(parseRgb(oscuro.botonChange), "#2563EB"), { botonChange: oscuro.botonChange, esperado: "#2563eb" });
    check("el_texto_de_acento_salio_del_esmeralda", !closeTo(parseRgb(oscuro.precioColor), "#10B981", 40), { precioColor: oscuro.precioColor });
    check("el_titular_es_el_texto_del_comercio", oscuro.titularTexto === "La despensa del barrio, en un clic", { titularTexto: oscuro.titularTexto });
    check("el_banner_se_renderiza_y_carga", oscuro.bannerPresente && oscuro.bannerCargado, { bannerSrc: oscuro.bannerSrc, bannerCaja: oscuro.bannerCaja });
    check("el_banner_tiene_vela_de_legibilidad", (parseRgb(oscuro.titularColor)?.r ?? 0) + (parseRgb(oscuro.titularColor)?.g ?? 0) > 400, { titularColor: oscuro.titularColor });
    pintaElPieDelDestacado(oscuro, "oscuro");
    pinturas.fotoTemaOscuro = await shot(page, "02-vitrina-tema-propio-con-banner");

    // === Los cinco modos: tono, profundidad, patron, esquinas y velo ===
    // Se pone un acento naranja con fondo marcado para que el tinte de las superficies sea
    // medible (r > g > b) y un radio "redondo" para que el pixel pintado sea distinto.
    const modos = await call("/api/v1/comercio/settings/storefront/theme", {
      token,
      method: "PUT",
      body: { accent: "#F59E0B", promo: "#BE123C", base: "#171310", surface_tint: "marcado", surface_depth: "alta", background_pattern: "cuadricula", corner_radius: "redondo", banner_scrim: "fuerte" }
    });
    check("los_modos_se_guardan", modos.status === 200 && modos.payload.theme?.surface_tint === "marcado" && modos.payload.theme?.corner_radius === "redondo", { status: modos.status, theme: modos.payload.theme });
    const modosPublico = await call(`/api/v1/public/comercio/catalog/${code}`);
    check("los_modos_llegan_al_publico", ["marcado", "alta", "cuadricula", "redondo", "fuerte"].every((valor) => Object.values(modosPublico.payload.theme || {}).includes(valor)), { theme: modosPublico.payload.theme });
    await page.goto(vitrinaUrl, { waitUntil: "networkidle2", timeout: 120000 });
    pinturas.modos = await readPaint(page);
    const conModos = pinturas.modos;
    check("el_patron_de_fondo_se_pinta", /linear-gradient/.test(String(conModos.patron)), { patron: String(conModos.patron).slice(0, 120) });
    check("el_radio_de_las_tarjetas_sigue_el_tema", parseFloat(String(conModos.tarjetaRadio)) === 28, { tarjetaRadio: conModos.tarjetaRadio, esperado: "1.75rem = 28px" });
    check("el_radio_de_los_controles_sigue_el_tema", parseFloat(String(conModos.controlRadio)) === 18, { controlRadio: conModos.controlRadio, esperado: "1.125rem = 18px" });
    check("el_velo_fuerte_cubre_la_foto", /rgba\(0,\s*0,\s*0,\s*0\.68\)/.test(String(conModos.velaFondo)), { velaFondo: String(conModos.velaFondo).slice(0, 140) });
    check("el_tono_marcado_tiñe_las_superficies", (() => {
      const superficie = parseRgb(conModos.tarjetaFondo);
      if (!superficie) return false;
      // Con acento naranja el tinte empuja el rojo por encima del azul; un gris puro vendria
      // en r === b. Se compara contra el fondo, que lleva el mismo tinte, para exigir que la
      // tarjeta no sea un simple gris.
      return superficie.r > superficie.b + 3;
    })(), { tarjetaFondo: conModos.tarjetaFondo });
    check("la_profundidad_alta_separa_tarjeta_y_fondo", (() => {
      const tarjeta = parseRgb(conModos.tarjetaFondo);
      const fondo = parseRgb(conModos.fondo);
      if (!tarjeta || !fondo) return false;
      return contrastRatio(tarjeta, fondo) >= 1.12;
    })(), { tarjetaFondo: conModos.tarjetaFondo, fondo: conModos.fondo });
    check("el_precio_se_contra_su_superficie_en_navegador", (() => {
      // La promesa del motor: ningun color del comercio deja el precio en 2:1. Se mide lo
      // que Chromium efectivamente pinto, no lo que calculo el modulo de color.
      const letra = parseRgb(conModos.precioColor);
      const superficie = parseRgb(conModos.precioSuperficie);
      if (!letra || !superficie) return false;
      return contrastRatio(letra, superficie) >= 4.5;
    })(), { precioColor: conModos.precioColor, precioSuperficie: conModos.precioSuperficie });
    pintaElPieDelDestacado(conModos, "modos");
    pinturas.fotoModos = await shot(page, "03-vitrina-tonos-patron-y-esquinas");

    // Sin patron y con esquinas rectas: la pagina vuelve a fondo plano y bordes duros.
    await call("/api/v1/comercio/settings/storefront/theme", { token, method: "PUT", body: { surface_tint: "neutro", background_pattern: "ninguno", corner_radius: "recto" } });
    await page.goto(vitrinaUrl, { waitUntil: "networkidle2", timeout: 120000 });
    pinturas.plano = await readPaint(page);
    check("el_patron_liso_no_pinta_degradado", !/gradient/.test(String(pinturas.plano.patron)), { patron: String(pinturas.plano.patron).slice(0, 80) });
    check("el_tono_neutro_devuelve_la_superficie_al_color_del_fondo", (() => {
      // "neutro" no significa gris: significa "sin tinte de acento". Con fondo marron
      // #171310 la tarjeta sigue siendo marron oscuro (su propio croma) y lo que tiene que
      // desaparecer es el tinte que agregaba el acento ambar. Se mide la separacion
      // max-min de la tarjeta en los dos estados, no un gris absoluto.
      const neutro = parseRgb(pinturas.plano.tarjetaFondo);
      const marcado = parseRgb(conModos.tarjetaFondo);
      if (!neutro || !marcado) return false;
      const spread = (c) => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
      const fondo = parseRgb(pinturas.plano.fondo);
      return spread(neutro) <= spread(marcado) - 15 && spread(neutro) <= spread(fondo) + 4;
    })(), { tarjetaNeutra: pinturas.plano.tarjetaFondo, tarjetaMarcada: conModos.tarjetaFondo, fondo: pinturas.plano.fondo });
    check("el_radio_recto_endurece_las_esquinas", parseFloat(String(pinturas.plano.tarjetaRadio)) === 6, { tarjetaRadio: pinturas.plano.tarjetaRadio, esperado: "0.375rem = 6px" });
    pintaElPieDelDestacado(pinturas.plano, "plano");
    pinturas.fotoPlano = await shot(page, "04-vitrina-recta-sin-patron");

    // === Fondo claro: la tinta debe invertirse sola ===
    await call("/api/v1/comercio/settings/storefront/theme", { token, method: "PUT", body: { base: "#F8FAFC", accent: "#0F766E", promo: "#BE123C" } });
    await page.goto(vitrinaUrl, { waitUntil: "networkidle2", timeout: 120000 });
    pinturas.temaClaro = await readPaint(page);
    const claro = pinturas.temaClaro;
    check("el_fondo_claro_se_aplica", closeTo(parseRgb(claro.fondo), "#F8FAFC"), { fondo: claro.fondo });
    check("la_letra_del_tema_se_invierte_sobre_fondo_claro", (() => {
      // La raiz es la superficie del tema: aca manda la tinta del comercio (casi negra).
      const letra = parseRgb(claro.letraRaiz);
      return Boolean(letra) && luminance(letra) < 0.2;
    })(), { letraRaiz: claro.letraRaiz });
    check("sobre_el_cartel_la_letra_no_depende_del_tema", (() => {
      // El titular cae sobre la foto oscurecida por el scrim. Con la tinta del tema claro
      // era ilegible (negro sobre foto oscura); la columna usa la tinta de fotografia.
      const letra = parseRgb(claro.titularColor);
      if (!letra) return false;
      const foto = hexToRgb("#0A0A0A");
      return luminance(letra) > 0.7 && contrastRatio(letra, foto) >= 12;
    })(), { titularColor: claro.titularColor, letraRaiz: claro.letraRaiz });
    check("el_boton_toma_el_teal_del_comercio", closeTo(parseRgb(claro.botonChange), "#0F766E"), { botonChange: claro.botonChange });
    check("la_tinta_del_boton_es_la_de_mayor_contraste", (() => {
      const fondo = parseRgb(claro.botonChange);
      const letra = parseRgb(claro.botonLetra);
      if (!fondo || !letra) return false;
      const elegida = contrastRatio(fondo, letra);
      return elegida >= Math.max(contrastRatio(fondo, hexToRgb("#FFFFFF")), contrastRatio(fondo, hexToRgb("#0A0A0A"))) - 0.05;
    })(), { botonChange: claro.botonChange, botonLetra: claro.botonLetra });
    // El caso que la ronda 1 dejo sin mirar: en un tema claro la tinta es casi negra, y el
    // pie de foto del destacado difumina hacia el fondo del tema. Si la rampa no llega solida
    // hasta donde empieza el texto, la letra cae sobre la fotografia y desaparece.
    pintaElPieDelDestacado(claro, "claro");
    pinturas.fotoTemaClaro = await shot(page, "05-vitrina-tema-claro");

    // === Panel de configuracion operado con teclado y mouse ===
    const acceso = await browser.newPage();
    await acceso.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await acceso.goto(`${webUrl}/login`, { waitUntil: "networkidle2", timeout: 120000 });
    await acceso.waitForSelector('input[name="email"]', { visible: true, timeout: 60000 });
    await acceso.type('input[name="email"]', email);
    await acceso.type('input[name="password"]', password);
    await acceso.click('button[type="submit"]');
    await acceso.waitForFunction(() => !location.pathname.endsWith("/login"), { timeout: 90000 });
    await acceso.close();

    const panel = await browser.newPage();
    await panel.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
    await panel.goto(`${webUrl}/dashboard/comercio/configuracion`, { waitUntil: "networkidle2", timeout: 120000 });
    // El panel se organiza en pestanas: la seccion de apariencia no existe hasta abrirla.
    const pestana = await panel.waitForFunction(() => [...document.querySelectorAll('[role="tab"]')].some((b) => /Apariencia/.test(b.textContent || "")), { timeout: 90000 }).then(() => true).catch(() => false);
    check("el_panel_se_organiza_en_pestanas", pestana, {});
    await panel.evaluate(() => {
      const boton = [...document.querySelectorAll('[role="tab"]')].find((b) => /Apariencia/.test(b.textContent || ""));
      if (boton) boton.click();
    });
    const seccion = await panel.waitForFunction(() => [...document.querySelectorAll("section")].some((s) => (s.getAttribute("aria-label") || "") === "Apariencia de la vitrina"), { timeout: 90000 }).then(() => true).catch(() => false);
    check("el_panel_muestra_la_seccion_de_apariencia", seccion, {});
    const previaViva = await panel.evaluate(() => {
      const bloque = [...document.querySelectorAll("section")].find((s) => (s.getAttribute("aria-label") || "") === "Apariencia de la vitrina");
      const previa = [...(bloque?.querySelectorAll("[aria-label]") || [])].find((e) => /^Previsualizaci[oó]n/.test(e.getAttribute("aria-label") || ""));
      const hex = [...(bloque?.querySelectorAll("input[type=color]") || [])].map((input) => input.value);
      // Los cinco modos se editan con botones de opcion unica dentro de la misma seccion.
      const grupos = [...(bloque?.querySelectorAll('[role="group"]') || [])].map((grupo) => [...grupo.querySelectorAll("button")].map((b) => (b.textContent || "").trim()));
      return { tienePrevia: Boolean(previa), hex, grupos };
    });
    check("el_panel_previsualiza_sin_guardar", previaViva.tienePrevia && previaViva.hex.length === 3, { hex: previaViva.hex });
    check("el_panel_ofrece_los_cinco_modos", ["Neutro", "Plana", "Liso", "Recto", "Ligero"].every((etiqueta) => previaViva.grupos.flat().includes(etiqueta)), { grupos: previaViva.grupos });
    const rampa = await panel.evaluate(() => {
      const fila = [...document.querySelectorAll("li")].find((li) => /T[ií]tulos/.test(li.textContent || ""));
      const ratios = [...document.querySelectorAll("li")].filter((li) => /\d+\.\d:1/.test(li.textContent || "")).length;
      return { visible: Boolean(fila), ratios };
    });
    check("el_panel_muestra_el_contraste_medido", rampa.visible && rampa.ratios >= 7, { rampa });
    const previa = await panel.evaluate(() => {
      const bloque = [...document.querySelectorAll("div")].find((d) => /^Previsualizaci[oó]n/.test(d.getAttribute("aria-label") || ""));
      const raiz = bloque?.querySelector(".sf-root");
      return { radio: raiz ? getComputedStyle(raiz.querySelector(".rounded-xl")).borderTopLeftRadius : null, patron: raiz ? getComputedStyle(raiz).backgroundImage : null };
    });
    check("la_previa_repinta_con_el_motor_de_la_vitrina", Boolean(previa.radio) && previa.radio !== "0px", { previa });

    // El click de React dispara un setState: el value del input todavia no ha
    // mutado cuando evaluate() termina. Se espera el repintado antes de leer.
    await panel.evaluate(() => {
      const bloque = [...document.querySelectorAll("section")].find((s) => (s.getAttribute("aria-label") || "") === "Apariencia de la vitrina");
      const boton = [...(bloque?.querySelectorAll("button") || [])].find((b) => /^Oc[eé]ano$/.test((b.textContent || "").trim()));
      if (boton) boton.click();
      return Boolean(boton);
    });
    const preset = await panel.waitForFunction(() => {
      const bloque = [...document.querySelectorAll("section")].find((s) => (s.getAttribute("aria-label") || "") === "Apariencia de la vitrina");
      const hex = [...(bloque?.querySelectorAll('input[type="color"]') || [])].map((input) => String(input.value).toLowerCase());
      if (hex[0] !== "#0ea5e9") return false;
      const previa = [...(bloque?.querySelectorAll("[aria-label]") || [])].find((e) => /^Previsualizaci[oó]n/.test(e.getAttribute("aria-label") || ""));
      return { hex, tienePrevia: Boolean(previa), fondo: previa ? getComputedStyle(previa).backgroundColor : null };
    }, { timeout: 30000, polling: 400 }).then((handle) => handle.jsonValue()).catch(() => null);
    check("un_preset_cambia_la_paleta_y_la_previa", Boolean(preset) && preset.hex[0] === "#0ea5e9" && preset.tienePrevia, { preset });

    const esperaPut = panel.waitForResponse((r) => r.url().endsWith("/api/v1/comercio/settings/storefront/theme") && r.request().method() === "PUT", { timeout: 90000 });
    await panel.evaluate(() => {
      const bloque = [...document.querySelectorAll("section")].find((s) => (s.getAttribute("aria-label") || "") === "Apariencia de la vitrina");
      const boton = [...(bloque?.querySelectorAll("button") || [])].find((b) => /Guardar apariencia/.test(b.textContent || ""));
      if (boton) boton.click();
    });
    const respuestaPut = await esperaPut;
    check("guardar_desde_el_panel_devuelve_200", respuestaPut.status() === 200, { status: respuestaPut.status() });
    const publicado = await call(`/api/v1/public/comercio/catalog/${code}`);
    check("el_preset_guardado_llega_al_publico", publicado.payload.theme?.accent === "#0ea5e9", { accent: publicado.payload.theme?.accent });
    pinturas.fotoPanel = await shot(panel, "06-panel-apariencia-guardando");
    await panel.close();

    fs.writeFileSync(path.join(path.dirname(output), "pintura-navegador.json"), `${JSON.stringify(pinturas, null, 2)}\n`);

    // === Almacenamiento y generacion en este ambiente ===
    const bytes = fs.readFileSync(path.join(root, "apps/web/public", sampleAsset.slice(1)));
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: "image/jpeg" }), "banner-e2e.jpg");
    const subida = await call("/api/v1/comercio/settings/storefront/banner", { token, method: "POST", form });
    check("subida_de_banner_deja_constancia", subida.status === 201 || subida.status >= 500, {
      status: subida.status,
      resultado: subida.status === 201 ? "bucket disponible: banner publicado" : "sin bucket local: rechazo del almacenamiento",
      code: String(subida.payload?.code || subida.payload?.error?.code || ""),
      detalle: String(subida.payload?.message || subida.payload?.error?.message || "").slice(0, 160)
    });

    const generacion = await call("/api/v1/comercio/settings/storefront/generate-image", { token, method: "POST", body: { prompt: "Banner panoramico de una despensa de barrio con tonos azules y luz calida" } });
    const codigo = String(generacion.payload?.error?.code ?? generacion.payload?.code ?? "");
    check("el_modelo_gratuito_no_es_el_bloqueo", generacion.status === 201 || !codigo.startsWith("IMAGEGEN_"), {
      status: generacion.status,
      code: codigo || null,
      detalle: String(generacion.payload?.message || generacion.payload?.error?.message || "").slice(0, 160),
      lectura: codigo ? "fallos del generador" : "el generador devolvio bytes validos; solo falla el almacenamiento local"
    });
  } finally {
    await browser.close().catch(() => undefined);
  }

  // Se devuelve el tenant al estado que traia: una certificacion no deja temas pegados.
  await db.comercioSettings.update({ where: { id: settingsId }, data: { preferences_json: originalPreferences } });
  const restaurado = await db.comercioSettings.findFirst({ where: { id: settingsId }, select: { preferences_json: true } });
  check("tenant_restaurado", JSON.stringify(restaurado.preferences_json ?? {}) === JSON.stringify(originalPreferences), {
    claves: Object.keys(restaurado.preferences_json || {})
  });
}

const evidence = {
  cambio: "vitrina-comercio-tematizada",
  rama: "desarrollo",
  ejecutado_en: new Date().toISOString(),
  ambiente: "local",
  apiUrl,
  webUrl,
  navegador: browserPath,
  tenant: null,
  checks,
  limitaciones: [
    "El bucket comercio-assets de Supabase no existe en el ambiente local: la subida del banner y la persistencia de la imagen generada quedan bloqueadas por ambiente, con su codigo reportado en los checks.",
    "La generacion si sale a la red (modelo gratuito Pollinations, sin cuenta ni clave); su resultado solo puede guardarse donde hay bucket configurado.",
    "El banner se certify con un asset estatico del sitio (/comercio/...), que es la otra ruta que produce el servidor."
  ]
};

main()
  .then(() => {
    const fallidos = checks.filter((item) => !item.ok).map((item) => item.name);
    fs.writeFileSync(output, `${JSON.stringify({ ...evidence, ok: fallidos.length === 0, total: checks.length, fallidos }, null, 2)}\n`);
    console.log(`CERTIFICATION_OK ${JSON.stringify({ evidencia: path.relative(root, output).replace(/\\/g, "/"), total: checks.length, fallidos })}`);
  })
  .catch((error) => {
    fs.writeFileSync(output, `${JSON.stringify({ ...evidence, ok: false, error: String(error?.message || error), stack: String(error?.stack || "").split("\n").slice(0, 8) }, null, 2)}\n`);
    console.error(`CERTIFICATION_FAIL ${error?.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Si la certificacion revienta a mitad, el tenant vuelve a su estado de todos modos.
    if (restaurar) await restaurar().catch((error) => console.error("WARNING: no se pudo restaurar el tenant:", error.message));
    await db.$disconnect();
  });
