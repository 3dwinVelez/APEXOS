/* Certificacion navegador versionada de la pasada UX del modulo Comercio.
 *
 * Chromium real, API local real y base de datos local real. No hay interception de
 * peticiones ni burlas: se entra con las credenciales del demo, se navega como un usuario
 * y se mide lo que el navegador pinto (desbordes, nombres accesibles, objetivos tactiles,
 * contraste WCAG, foco en dialogos, ventanado, transiciones y tema).
 *
 * Previos:
 *   - API local en LOCAL_API_URL (por defecto http://127.0.0.1:3000)
 *   - Web local en LOCAL_WEB_URL  (por defecto http://127.0.0.1:3001, en modo dev)
 *   - DATABASE_URL apuntando a PostgreSQL local
 *   - Tenant con Comercio sembrado y vitrina publicada (node scripts/seed-comercio-demo.js)
 *
 * Regla duradera: un 5xx nunca es conformidad. Si una ruta responde 500 se calienta una vez
 * y, si vuelve a fallar, el check se declara rojo.
 */
require("../load-env")();

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
const evidenceDir = path.resolve(process.env.BROWSER_EVIDENCE_PATH || "docs/qa/evidence/comercio-ux-pasada-20261106");
const browserPath = process.env.CHROME_BIN || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const email = process.env.APEX_CERT_EMAIL || "demo@apex.local";
const password = process.env.APEX_CERT_PASSWORD || "test1234";
const NAV_TIMEOUT = 180000;

const RUTAS = [
  { slug: "portada", url: "/dashboard/comercio" },
  { slug: "productos", url: "/dashboard/comercio/productos" },
  { slug: "vender", url: "/dashboard/comercio/vender" },
  { slug: "ventas", url: "/dashboard/comercio/ventas" },
  { slug: "cartera", url: "/dashboard/comercio/cartera" },
  { slug: "clientes", url: "/dashboard/comercio/clientes" },
  { slug: "compras", url: "/dashboard/comercio/compras" },
  { slug: "gastos", url: "/dashboard/comercio/gastos" },
  { slug: "promociones", url: "/dashboard/comercio/promociones" },
  { slug: "reportes", url: "/dashboard/comercio/reportes" },
  { slug: "configuracion", url: "/dashboard/comercio/configuracion" }
];
const PANTALLAS = { escritorio: { height: 900, width: 1440 }, movil: { height: 844, width: 390 } };

const checks = [];
const db = new PrismaClient();
function check(nombre, ok, detalle = {}) {
  checks.push({ name: nombre, ok: Boolean(ok), detail: detalle });
  assert.ok(ok, `${nombre}: ${JSON.stringify(detalle)}`);
}
const avisar = (nombre, ok, detalle = {}) => checks.push({ name: nombre, ok: Boolean(ok), detail: detalle });

async function call(url, { token, method = "GET", body } = {}) {
  const headers = { accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const payload = body ? JSON.stringify(body) : null;
  if (body) headers["content-type"] = "application/json";
  const response = await fetch(`${apiUrl}${url}`, { method, headers, ...(payload ? { body: payload } : {}) });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = { message: text.slice(0, 200) }; }
  return { status: response.status, payload: json };
}

async function waitForServer(url) {
  let ultimo = null;
  for (let intento = 0; intento < 3; intento++) {
    for (const endpoint of ["/api/v1/health", "/health", "/"]) {
      try {
        const response = await fetch(`${url}${endpoint}`, { signal: AbortSignal.timeout(20000) });
        if (response.ok) return;
        ultimo = `${endpoint} -> ${response.status}`;
      } catch (error) { ultimo = `${endpoint} -> ${error.message}`; }
    }
    await sleep(2000);
  }
  throw new Error(`BLOQUEADO: ${url} no responde (${ultimo}).`);
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

// Todo lo que se lee en el navegador sale de una sola funcion inyectada: desborde horizontal
// (la medida autorizada es scrollWidth del documento, no un elemento suelto), nombres
// accesibles, objetivos tactiles y contraste sobre el fondo realmente pintado.
const MEDIDA_EN_PAGINA = () => {
  // page.evaluate serializa solo esta funcion: cualquier ayudante tiene que vivir aqui
  // dentro, no en el proceso de Node que la invita.
  const luminosidad = ({ g, b, r }) => {
    const canal = (crudo) => { const c = crudo / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
  };
  const razon = (a, b) => {
    const la = luminosidad(a);
    const lb = luminosidad(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };
  const visibles = (elemento) => {
    const caja = elemento.getBoundingClientRect();
    // Un objetivo de 2 px es un input oculto que alguna primitiva conserva como autoridad de
    // formulario (el <select> de TransportSearchSelect) o un separador: no es un blanco tactil
    // ni texto legible, medirlo seria inventarse un defecto.
    if (caja.width <= 2 || caja.height <= 2) return false;
    const estilo = getComputedStyle(elemento);
    return estilo.visibility !== "hidden" && estilo.display !== "none" && Number(estilo.opacity) > 0.05;
  };
  const nombre = (elemento) => {
    const texto = (elemento.innerText || elemento.textContent || "").trim();
    if (texto) return texto;
    const etiqueta = (elemento.getAttribute("aria-label") || "").trim();
    if (etiqueta) return etiqueta;
    const referido = (elemento.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean)
      .map((id) => (document.getElementById(id)?.innerText || "").trim()).filter(Boolean).join(" ");
    if (referido) return referido;
    if (elemento.labels && elemento.labels.length) return [...elemento.labels].map((l) => l.innerText.trim()).filter(Boolean).join(" ");
    const titulo = (elemento.getAttribute("title") || "").trim();
    if (titulo) return titulo;
    return (elemento.getAttribute("placeholder") || "").trim();
  };
  // Se mide el contenido de la pantalla, no el armazon de la plataforma: la barra lateral y el
  // buscador global de Next tampoco son de Comercio y sus blancos no deben contaminar el corte.
  // La vitrina publica no usa <main> (su raiz es .sf-root), por eso el respaldo.
  const alcance = document.querySelector("main") || document.querySelector(".sf-root") || document.body;
  // El armazon del shell (conmutador de idioma, miga «Inicio», campana) vive dentro de <main>
  // pero fuera del contenedor del modulo. No es de Comercio: se reporta aparte para que la
  // gate del modulo no se preste con defectos de otra superficie ni se escondan.
  const delModulo = (elemento) => Boolean(elemento.closest(".apex-workspace-shell, .sf-root, [role='dialog']"));
  const blancoDe = (elemento) => {
    // Una casilla se pulsa por su etiqueta: el <input> de 16 px no es el objetivo real. Medir
    // el cuadrito declararia un defecto donde el usuario tiene una fila entera para tocar.
    const objetivo = (elemento.tagName === "INPUT" || elemento.tagName === "SELECT") && elemento.closest("label")
      ? elemento.closest("label") : elemento;
    const caja = objetivo.getBoundingClientRect();
    return { alto: Math.round(caja.height), ancho: Math.round(caja.width) };
  };
  const interactivos = [...alcance.querySelectorAll("a[href], button, input, select, textarea, [role='button'], [role='combobox'], [role='tab']")]
    .filter((elemento) => !elemento.closest("[inert]") && !(elemento.type === "hidden") && visibles(elemento));
  const delModuloSolo = interactivos.filter(delModulo);
  const armazon = interactivos.filter((elemento) => !delModulo(elemento)).map((elemento) => {
    const caja = blancoDe(elemento);
    return { alto: caja.alto, ancho: caja.ancho, nombre: nombre(elemento).replace(/\s+/g, " ").slice(0, 26) };
  }).filter((fila) => fila.alto < 24 || fila.ancho < 24);
  const sinNombre = delModuloSolo.filter((elemento) => !nombre(elemento)).map((elemento) => ({
    atributos: [...elemento.attributes].map((a) => `${a.name}="${String(a.value).slice(0, 40)}"`).join(" "),
    etiqueta: elemento.tagName.toLowerCase()
  }));
  const tactiles = delModuloSolo
    .filter((elemento) => !(elemento.tagName === "A"
      && getComputedStyle(elemento).display.startsWith("inline")
      && elemento.closest("p, li, td, dd, h1, h2, h3, h4")))
    .map((elemento) => {
      const caja = blancoDe(elemento);
      return { alto: caja.alto, ancho: caja.ancho, nombre: nombre(elemento).replace(/\s+/g, " ").slice(0, 40) };
    });
  const soporteDe = (elemento) => {
    // El fondo de un nodo se pinta DELANTE del fondo de sus ancestros, asi que el recorrido
    // hacia arriba acumula la pila y la mezcla con source-over, dividendo por el alfa
    // resultante. Con la mezcla invertida, un chip translucente (la insignia de descuento
    // sobre la tarjeta) se media contra la tarjeta y el ratio salia inventado: 1,25:1 donde
    // el navegador pintaba 5,7:1.
    let pila = { a: 0, b: 0, g: 0, r: 0 };
    let nodo = elemento;
    while (nodo && nodo.nodeType === 1) {
      const fondo = getComputedStyle(nodo).backgroundColor;
      const rgb = fondo ? /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(fondo) : null;
      if (rgb) {
        const detras = { a: rgb[4] === undefined ? 1 : Number(rgb[4]), b: Number(rgb[3]), g: Number(rgb[2]), r: Number(rgb[1]) };
        const alfa = pila.a + detras.a * (1 - pila.a);
        const canal = (delante, atras) => (alfa === 0 ? 0 : (delante * pila.a + atras * detras.a * (1 - pila.a)) / alfa);
        pila = { a: alfa, b: canal(pila.b, detras.b), g: canal(pila.g, detras.g), r: canal(pila.r, detras.r) };
        if (pila.a >= 0.999) break;
      }
      nodo = nodo.parentElement;
    }
    if (pila.a < 0.999) {
      // Sin fondo opaco en toda la cadena el navegador pinta sobre blanco (el fondo de la
      // ventana), no sobre negro: medir contra negro inflaria el contraste de todo el sitio.
      const resto = 1 - pila.a;
      pila = { a: 1, b: pila.b * pila.a + 255 * resto, g: pila.g * pila.a + 255 * resto, r: pila.r * pila.a + 255 * resto };
    }
    return pila;
  };
  const coloreados = [];
  const reserva = new Set();
  const conTexto = [...alcance.querySelectorAll("p, h1, h2, h3, h4, span, a, button, label, li, td, th, strong, em, legend")]
    .filter((elemento) => visibles(elemento) && delModulo(elemento))
    .filter((elemento) => [...elemento.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1));
  for (const elemento of conTexto) {
    if (coloreados.length >= 220) break;
    const estilo = getComputedStyle(elemento);
    const letra = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(estilo.color);
    if (!letra) continue;
    const texto = (elemento.innerText || "").trim().slice(0, 40);
    if (!texto || reserva.has(texto)) continue;
    reserva.add(texto);
    const px = Number.parseFloat(estilo.fontSize) || 16;
    const peso = Number(estilo.fontWeight) || 400;
    const grande = px >= 24 || (px >= 18.66 && peso >= 700);
    coloreados.push({
      letra: { a: letra[4] === undefined ? 1 : Number(letra[4]), b: Number(letra[3]), g: Number(letra[2]), r: Number(letra[1]) },
      minimo: grande ? 3 : 4.5,
      texto,
      valor: razon(
        { a: 1, b: Number(letra[3]), g: Number(letra[2]), r: Number(letra[1]) },
        soporteDe(elemento)
      )
    });
  }
  const desborden = [];
  for (const elemento of alcance.querySelectorAll("*")) {
    const caja = elemento.getBoundingClientRect();
    if (caja.width === 0) continue;
    if (caja.right > window.innerWidth + 1 || caja.left < -1) desborden.push(`${elemento.tagName.toLowerCase()}.${String(elemento.className).slice(0, 40)}`);
    if (desborden.length >= 6) break;
  }
  return {
    altoViewport: window.innerHeight,
    armazon,
    desborden,
    documento: { ancho: document.documentElement.scrollWidth, viewport: window.innerWidth },
    sinNombre,
    tactiles,
    textos: coloreados.map((fila) => ({ minimo: fila.minimo, ratio: Number(fila.valor.toFixed(2)), texto: fila.texto }))
  };
};

async function abrir(page, url, etiqueta) {
  // Next dev compila la ruta al primer golpe: si cae 500 se calienta por HTTP y se reintenta
  // una sola vez. Un segundo 5xx es fallo de producto, no demora.
  let respuesta = null;
  let errores = [];
  for (let intento = 0; intento < 2; intento++) {
    errores = [];
    const colector = (error) => errores.push(String(error.message || error).slice(0, 200));
    page.on("pageerror", colector);
    try {
      respuesta = await page.goto(`${webUrl}${url}`, { waitUntil: "networkidle2", timeout: NAV_TIMEOUT });
    } catch (error) {
      respuesta = null;
      errores.push(String(error.message).slice(0, 200));
    }
    page.off("pageerror", colector);
    if (respuesta && respuesta.status() < 500 && !errores.length) break;
    await fetch(`${webUrl}${url}`, { signal: AbortSignal.timeout(NAV_TIMEOUT) }).catch(() => null);
    await sleep(1500);
  }
  await sleep(900);
  const estado = { etiqueta, errores, status: respuesta ? respuesta.status() : null };
  check(`la_ruta_responde_sin_error_${etiqueta}`, Boolean(respuesta) && respuesta.status() < 500 && estado.errores.length === 0, estado);
  return estado;
}

async function medir(page, etiqueta, { tactil = false } = {}) {
  const medida = await page.evaluate(MEDIDA_EN_PAGINA);
  avisar(`sin_desbordes_${etiqueta}`, medida.documento.ancho <= medida.documento.viewport + 1, medida.documento);
  avisar(`nombres_accesibles_${etiqueta}`, medida.sinNombre.length === 0, { sin_nombre: medida.sinNombre.slice(0, 8) });
  const bajos = medida.textos.filter((fila) => fila.ratio < fila.minimo);
  avisar(`contraste_suficiente_${etiqueta}`, bajos.length === 0, { por_debajo: bajos.slice(0, 8) });
  if (tactil) {
    const menores = medida.tactiles.filter((caja) => caja.alto < 44 || caja.ancho < 44);
    const criticos = medida.tactiles.filter((caja) => caja.alto < 24 || caja.ancho < 24);
    avisar(`objetivos_tactiles_ok_${etiqueta}`, criticos.length === 0, { menores_de_24: criticos.slice(0, 10), muestra_bajos: menores.slice(0, 6) });
  }
  return medida;
}

async function shot(page, nombre) {
  const archivo = path.join(evidenceDir, `${nombre}.png`);
  const bytes = Buffer.from(await page.screenshot({ encoding: "base64", fullPage: false }), "base64");
  try { fs.rmSync(archivo, { force: true }); } catch { /* ignore */ }
  fs.writeFileSync(archivo, bytes);
  return path.relative(root, archivo).replace(/\\/g, "/");
}

async function main() {
  await waitForServer(apiUrl);
  await waitForServer(webUrl);
  fs.mkdirSync(evidenceDir, { recursive: true });
  if (!fs.existsSync(browserPath)) throw new Error(`BLOQUEADO: no existe el navegador en ${browserPath}. Define CHROME_BIN.`);

  const inicial = await db.comercioSettings.findFirst({ where: { catalog_enabled: true }, select: { catalog_code: true, tenant_id: true } });
  if (!inicial?.catalog_code) throw new Error("BLOQUEADO: no hay vitrina publicada en local (corre node scripts/seed-comercio-demo.js).");
  const vitrinaUrl = `/tienda/${inicial.catalog_code}`;

  // La busqueda se certifica con terminos que existen en la misma base: una cadena inventada
  // da cero filas antes y despues y convierte el check en humo.
  const muestraProductos = await db.comercioProduct.findMany({
    select: { code: true, name: true },
    take: 500,
    where: { active: true, tenant_id: inicial.tenant_id }
  });
  const productoGuia = muestraProductos.find((row) => /^P-\d{4}$/.test(row.code)) || muestraProductos[0] || null;
  const palabraAcentuada = muestraProductos.map((row) => (row.name.match(/\S+/g) || []).find((palabra) => /[áéíóúñÁÉÍÓÚÑ]/.test(palabra)))
    .find((palabra) => Boolean(palabra)) || null;
  const palabraSinAcento = palabraAcentuada
    ? palabraAcentuada.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}]/gu, "").toLowerCase()
    : null;

  const login = await call("/api/v1/auth/login", { method: "POST", body: { email, password } });
  const token = login.payload.token || login.payload.access_token;
  check("login_real", login.status === 200 && Boolean(token), { status: login.status });

  // Calentar todas las rutas antes de abrir el navegador: en dev la primera visita compila.
  for (const ruta of [...RUTAS, { url: vitrinaUrl }]) {
    const caliente = await fetch(`${webUrl}${ruta.url}`, { signal: AbortSignal.timeout(NAV_TIMEOUT) }).catch(() => null);
    if (!caliente || caliente.status >= 500) {
      const reintento = await fetch(`${webUrl}${ruta.url}`, { signal: AbortSignal.timeout(NAV_TIMEOUT) }).catch(() => null);
      check(`calienta_${String(ruta.url).replace(/[^a-z0-9]+/gi, "_").slice(0, 40)}`, Boolean(reintento) && reintento.status < 500, { status: reintento?.status ?? null });
    }
  }

  const browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"], executablePath: browserPath, headless: true });
  const page = await browser.newPage();
  await page.setViewport({ ...PANTALLAS.escritorio, deviceScaleFactor: 1 });

  try {
    // === Acceso real por la interfaz (no se inyecta token) ===
    await abrir(page, "/login", "login");
    await page.waitForSelector('input[name="email"]', { visible: true, timeout: 60000 });
    await page.type('input[name="email"]', email);
    await page.type('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => !location.pathname.endsWith("/login"), { timeout: 90000 });
    check("acceso_por_la_interfaz", true, { ruta: page.url() });

    // === Tema: el control real del shell cambia y persiste; se devuelve al valor inicial ===
    const temaInicial = await page.evaluate(() => localStorage.getItem("apex_theme"));
    await page.evaluate(() => { localStorage.setItem("apex_theme", "light"); });
    await abrir(page, RUTAS[1].url, "productos_light");
    check("tema_claro_sin_clase_dark", await page.evaluate(() => !document.documentElement.classList.contains("dark")), {});
    await page.evaluate(() => { localStorage.setItem("apex_theme", "dark"); });
    await abrir(page, RUTAS[1].url, "productos_dark");
    const oscuro = await page.evaluate(() => ({
      clases: document.documentElement.className,
      oscuro: document.documentElement.classList.contains("dark"),
      superficie: getComputedStyle(document.querySelector("main .apex-section-card, main section") || document.body).backgroundColor
    }));
    check("tema_oscuro_aplica_la_clase", oscuro.oscuro, { clases: oscuro.clases });
    const superficieClara = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
    avisar("el_tema_oscuro_oscurece_la_superficie", (Number(/rgba?\((\d+)/.exec(superficieClara)?.[1] ?? 255)) < 128, { fondo: superficieClara });

    // === Recorrido completo: 11 pantallas x 2 pantallas fisicas x 2 temas ===
    const resumen = [];
    for (const [nombreTema, clase] of [["claro", "light"], ["oscuro", "dark"]]) {
      for (const [nombrePantalla, pantalla] of Object.entries(PANTALLAS)) {
        await page.evaluate((valor) => localStorage.setItem("apex_theme", valor), clase);
        for (const ruta of RUTAS) {
          const etiqueta = `${ruta.slug}_${nombrePantalla}_${nombreTema}`;
          await page.setViewport({ ...pantalla, deviceScaleFactor: 1 });
          await abrir(page, ruta.url, etiqueta);
          const medida = await medir(page, etiqueta, { tactil: nombrePantalla === "movil" });
          const brujula = await page.evaluate(() => {
            const nav = document.querySelector('nav[aria-label="Ubicación en Comercio"]');
            return {
              actual: nav?.querySelector("[aria-current='page']")?.innerText?.trim() || null,
              esta: Boolean(nav),
              jerga: /M-\d+/.test(document.querySelector("main")?.innerText || "")
            };
          });
          // La portada es el centro del modulo: ahi no hay de donde volver, asi que no lleva
          // brujula. Toda pantalla hija si debe decir donde esta el usuario.
          if (ruta.slug !== "portada") {
            avisar(`orientacion_visible_${etiqueta}`, brujula.esta && Boolean(brujula.actual) && !brujula.jerga, brujula);
          }
          resumen.push({
            armazon_menor_de_24: medida.armazon,
            contraste_minimo: Math.min(...medida.textos.map((fila) => fila.ratio)),
            etiqueta,
            tactiles_menores: medida.tactiles.filter((caja) => caja.alto < 44 || caja.ancho < 44).length
          });
          if (nombrePantalla === "escritorio" && nombreTema === "oscuro" && ["portada", "clientes", "reportes"].includes(ruta.slug)) await shot(page, `${ruta.slug}-1440-oscuro`);
          if (nombrePantalla === "movil" && nombreTema === "claro" && ["clientes", "productos"].includes(ruta.slug)) await shot(page, `${ruta.slug}-390-claro`);
        }
      }
    }
    check("el_recorrido_mide_44_pantallas", resumen.length === RUTAS.length * 2 * 2, { medidas: resumen.length });

    // === Busqueda moderna: campo etiquetado, con icono y limpieza, que filtra de verdad ===
    await page.setViewport({ ...PANTALLAS.escritorio, deviceScaleFactor: 1 });
    await page.evaluate(() => localStorage.setItem("apex_theme", "light"));
    await abrir(page, "/dashboard/comercio/productos", "busqueda_productos");
    const busqueda = await page.evaluate(() => {
      const campo = document.querySelector('main input[type="search"]');
      if (!campo) return { presente: false };
      return {
        asociada: Boolean(campo.labels && campo.labels.length),
        // El boton de limpiar solo existe con texto escrito: a campo vacio no hay nada que limpiar.
        limpiar_en_vacio: Boolean(campo.closest("div")?.querySelector('button[aria-label^="Limpiar"]')),
        etiqueta: campo.labels?.[0]?.innerText?.trim() || null,
        presente: true,
        tipo: campo.type
      };
    });
    check("la_busqueda_es_un_campo_etiquetado", busqueda.presente && busqueda.asociada && busqueda.tipo === "search", busqueda);
    // El recuadro filtra con estado de React: despues de 44 pantallas medidas la maquina esta
    // cargada y el boton puede tardar mas que sueno fijo. Se espera el hecho, no el reloj.
    const inicioTecleo = Date.now();
    await page.type('main input[type="search"]', "silla de oficina");
    const boton_pinto = await page.waitForFunction(() => {
      const campo = document.querySelector('main input[type="search"]');
      return Boolean(campo?.closest("div")?.querySelector('button[aria-label^="Limpiar"]'));
    }, { polling: 100, timeout: 15000 }).then(() => true).catch(() => false);
    const conTexto = await page.evaluate(() => {
      const campo = document.querySelector('main input[type="search"]');
      const boton = campo?.closest("div")?.querySelector('button[aria-label^="Limpiar"]');
      boton?.click();
      return { boton: Boolean(boton), escrito: campo?.value ?? null };
    });
    const vacio = await page.waitForFunction(() => document.querySelector('main input[type="search"]')?.value === "", { polling: 100, timeout: 10000 }).then(() => true).catch(() => false);
    const despuesDeLimpiar = await page.evaluate(() => document.querySelector('main input[type="search"]')?.value ?? null);
    check("el_boton_de_limpiar_vacia_el_campo", conTexto.boton && vacio && despuesDeLimpiar === "", { boton: conTexto.boton, tecleado: conTexto.escrito, valor: despuesDeLimpiar, ms_hasta_boton: Date.now() - inicioTecleo });

    // Escribir en el campo como lo haria el usuario (setter nativo + evento input) y leer el recuento.
    const escribeYLee = async (texto) => {
      await page.evaluate((valor) => {
        const campo = document.querySelector('main input[type="search"]');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(campo, valor);
        campo.dispatchEvent(new Event("input", { bubbles: true }));
      }, texto);
      // El recuento es lo ultimo que pinta el filtrado: se lee hasta que se estabiliza dos
      // lecturas seguidas, no al cabo de un tiempo fijo que en esta maquina no siempre alcanza.
      let anterior = null;
      for (let intento = 0; intento < 30; intento++) {
        await sleep(150);
        const actual = await page.evaluate(() => document.querySelector("main #conteo-resultados")?.innerText?.trim() || "");
        if (actual && actual === anterior) return actual;
        anterior = actual;
      }
      return anterior ?? "";
    };
    const filas = (recuento) => Number(String(recuento).match(/^\d+/)?.[0] ?? -1);
    const conteoSinFiltro = await escribeYLee("");
    check("el_recuento_anuncia_las_filas_vistas", /^\d+ de \d+ productos$/.test(conteoSinFiltro), { recuento: conteoSinFiltro });
    const codigoGuia = productoGuia?.code || "";
    const conteoCodigo = await escribeYLee(`  ${codigoGuia}  `);
    check("la_busqueda_filtra_y_ignora_sobrantes", Boolean(codigoGuia) && filas(conteoCodigo) === 1, { codigo: codigoGuia, antes: conteoSinFiltro, despues: conteoCodigo });
    const conteoSinAcento = palabraSinAcento ? await escribeYLee(palabraSinAcento) : "";
    const conteoConAcento = palabraAcentuada ? await escribeYLee(palabraAcentuada) : "";
    check("la_busqueda_ignora_acentos_y_mayusculas",
      Boolean(palabraSinAcento) && filas(conteoSinAcento) > 0 && conteoSinAcento === conteoConAcento,
      { sin_acento: palabraSinAcento, con_acento: palabraAcentuada, recuento_sin_acento: conteoSinAcento, recuento_con_acento: conteoConAcento });
    await escribeYLee("");

    // === Ventanado en movil: la lista larga no se pinta entera, se ampli con un boton ===
    await page.setViewport({ ...PANTALLAS.movil, deviceScaleFactor: 1 });
    await abrir(page, "/dashboard/comercio/productos", "ventanado_movil");
    const ventana = await page.evaluate(() => {
      const tarjetas = document.querySelectorAll("main ul.grid > li, main ul.grid > *").length;
      const boton = [...document.querySelectorAll("button")].find((b) => /Ver \d+ m/.test(b.innerText || ""));
      return { ampli: Boolean(boton), texto_boton: boton?.innerText?.trim() || null, tarjetas };
    });
    check("la_lista_movil_va_ventaneada", ventana.tarjetas > 0 && ventana.tarjetas <= 24 && ventana.ampli, ventana);
    if (ventana.ampli) {
      await page.evaluate(() => { [...document.querySelectorAll("button")].find((b) => /Ver \d+ m/.test(b.innerText || ""))?.click(); });
      await sleep(600);
      const despues = await page.evaluate(() => document.querySelectorAll("main ul.grid > li, main ul.grid > *").length);
      check("ampliar_ventana_muestra_mas", despues > ventana.tarjetas, { antes: ventana.tarjetas, despues });
      await shot(page, "clientes-390-ventanado");
    }

    // === Dialogo ModalFrame: foco atrapado, Escape cierra y el foco vuelve al disparador ===
    await page.setViewport({ ...PANTALLAS.escritorio, deviceScaleFactor: 1 });
    await abrir(page, "/dashboard/comercio/clientes", "dialogo_clientes");
    const disparador = await page.evaluate(() => {
      const boton = [...document.querySelectorAll("button")].find((b) => /Nuevo cliente/.test(b.innerText || ""));
      if (!boton) return false;
      boton.focus();
      boton.click();
      return true;
    });
    check("el_alta_de_cliente_abre_un_dialogo", disparador, {});
    await page.waitForSelector('[role="dialog"]', { visible: true, timeout: 30000 });
    await sleep(500);
    const dentro = await page.evaluate(() => {
      const capa = document.querySelector('[role="dialog"]');
      const dentroDelDialogo = document.querySelector('.apex-dialog-enter, [role="dialog"] section, [role="dialog"] > div');
      return { animada: Boolean(dentroDelDialogo && getComputedStyle(dentroDelDialogo).animationName !== "none"), presente: Boolean(capa), clase: dentroDelDialogo ? getComputedStyle(dentroDelDialogo).animationName : null };
    });
    check("el_dialogo_anima_su_entrada", dentro.presente && dentro.animada, dentro);
    const focoIncial = await page.evaluate(() => ({ dentro: Boolean(document.activeElement?.closest('[role="dialog"]')), etiqueta: document.activeElement?.tagName }));
    check("el_dialogo_recibe_el_foco", focoIncial.dentro, focoIncial);
    let seEscapo = false;
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press("Tab");
      if (!(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))))) { seEscapo = true; break; }
    }
    check("el_tab_no_se_escapa_del_dialogo", !seEscapo, { se_escapo_en: seEscapo ? "tab" : null });
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), { timeout: 30000 }).catch(() => null);
    const cerrada = await page.evaluate(() => ({
      dialogos: document.querySelectorAll('[role="dialog"]').length,
      foco: document.activeElement?.innerText?.trim().slice(0, 20) || document.activeElement?.tagName,
      scroll: document.body.style.overflow
    }));
    check("escape_cierra_el_dialogo", cerrada.dialogos === 0, cerrada);
    check("el_foco_vuelve_al_disparador", /Nuevo cliente/.test(String(cerrada.foco)), cerrada);
    check("el_scroll_del_fondo_se_devuelve", cerrada.scroll !== "hidden", cerrada);

    // === Selector tecleable dentro de una capa con scroll (no se queda pegado arriba) ===
    await abrir(page, "/dashboard/comercio/compras", "selector_compras");
    const selector = await page.evaluate(() => {
      const campo = [...document.querySelectorAll('input[role="combobox"], [role="combobox"]')][0];
      if (!campo) return { presente: false };
      campo.scrollIntoView({ block: "center" });
      campo.click();
      return { presente: true };
    });
    if (selector.presente) {
      await sleep(500);
      const antes = await page.evaluate(() => {
        const lista = [...document.querySelectorAll('[role="listbox"], [role="dialog"]')].find((n) => n.getBoundingClientRect().height > 0);
        const caja = lista?.getBoundingClientRect();
        return caja ? { alto: Math.round(caja.height), tope: Math.round(caja.top) } : null;
      });
      await page.evaluate(() => window.scrollBy(0, 160));
      await sleep(400);
      const despues = await page.evaluate(() => {
        const lista = [...document.querySelectorAll('[role="listbox"], [role="dialog"]')].find((n) => n.getBoundingClientRect().height > 0);
        const caja = lista?.getBoundingClientRect();
        return caja ? { alto: Math.round(caja.height), tope: Math.round(caja.top) } : null;
      });
      check("el_selector_sigue_al_scroll", Boolean(antes) && Boolean(despues) && Math.abs(antes.tope - despues.tope) > 40, { antes, despues });
      await page.keyboard.press("Escape");
    } else {
      avisar("el_selector_sigue_al_scroll", false, { nota: "no habia un combobox visible en compras" });
    }

    // === Vitrina: carrito y vista rapida con su aro de accesibilidad propio ===
    await page.setViewport({ ...PANTALLAS.movil, deviceScaleFactor: 1 });
    await abrir(page, vitrinaUrl, "vitrina_movil");
    const vitrina = await medir(page, "vitrina_movil", { tactil: true });
    await shot(page, "vitrina-390");
    const agregado = await page.evaluate(() => {
      // El boton de agregar de la tarjeta es un «+» con solo aria-label: buscarlo por innerText
      // lo volvía invisible y la gate declaraba que la vitrina no deja pedir.
      const boton = [...document.querySelectorAll("button")].find((b) => /Agregar/.test(`${b.innerText || ""} ${b.getAttribute("aria-label") || ""}`));
      if (!boton) return false;
      boton.click();
      return { nombre: (boton.getAttribute("aria-label") || boton.innerText || "").trim().slice(0, 40) };
    });
    avisar("la_vitrina_permite_agregar_al_pedido", Boolean(agregado), agregado || {});
    if (agregado) {
      await sleep(500);
      await page.evaluate(() => {
        const abrir = [...document.querySelectorAll("button")].find((b) => /Pedido \(/.test(b.innerText || ""));
        abrir?.click();
      });
      await page.waitForFunction(() => document.querySelector('[aria-label="Pedido"]'), { timeout: 20000 }).catch(() => null);
      const carrito = await page.evaluate(() => {
        const capa = document.querySelector('[aria-label="Pedido"]');
        return {
          animada: capa ? getComputedStyle(capa.firstElementChild || capa).animationName !== "none" : false,
          modal: capa?.getAttribute("aria-modal") === "true",
          focoDentro: Boolean(capa?.contains(document.activeElement))
        };
      });
      check("el_carrito_es_una_capa_accesible", carrito.modal && carrito.focoDentro && carrito.animada, carrito);
      let escapo = false;
      for (let i = 0; i < 12; i++) {
        await page.keyboard.press("Tab");
        if (!(await page.evaluate(() => Boolean(document.querySelector('[aria-label="Pedido"]')?.contains(document.activeElement))))) { escapo = true; break; }
      }
      check("el_tab_no_se_escapa_del_carrito", !escapo, {});
      await page.keyboard.press("Escape");
      await sleep(400);
      check("escape_cierra_el_carrito", await page.evaluate(() => !document.querySelector('[aria-label="Pedido"]')), {});

      const rapida = await page.evaluate(() => {
        const ojo = [...document.querySelectorAll("button")].find((b) => /Ver detalle|Detalle de/.test(b.getAttribute("aria-label") || ""));
        if (!ojo) return false;
        ojo.click();
        return true;
      });
      if (rapida) {
        await page.waitForFunction(() => Boolean(document.querySelector('[role="dialog"][aria-modal="true"]')), { timeout: 20000 }).catch(() => null);
        const vista = await page.evaluate(() => {
          const capa = document.querySelector('[role="dialog"][aria-modal="true"]');
          return { foco: Boolean(capa?.contains(document.activeElement)), nombre: capa?.getAttribute("aria-label") || null, rol: capa?.getAttribute("role") };
        });
        check("la_vista_rapida_es_accesible", vista.rol === "dialog" && vista.foco && Boolean(vista.nombre), vista);
        await page.keyboard.press("Escape");
        await sleep(400);
        check("escape_cierra_la_vista_rapida", await page.evaluate(() => !document.querySelector('[role="dialog"][aria-modal="true"]')), {});
      } else {
        avisar("la_vista_rapida_es_accesible", false, { nota: "no hubo boton de detalle a la vista" });
      }
    }
    const desbordeVitrina = vitrina.documento;
    check("la_vitrina_no_desborda_en_movil", desbordeVitrina.ancho <= desbordeVitrina.viewport + 1, desbordeVitrina);

    // === Movimiento reducido: las transiciones se apagan, la pantalla sigue usable ===
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
    await abrir(page, "/dashboard/comercio/clientes", "movimiento_reducido");
    await page.evaluate(() => { [...document.querySelectorAll("button")].find((b) => /Nuevo cliente/.test(b.innerText || ""))?.click(); });
    await page.waitForSelector('[role="dialog"]', { visible: true, timeout: 30000 });
    const quieta = await page.evaluate(() => {
      const nodo = document.querySelector('.apex-dialog-enter');
      const fondo = document.querySelector('.apex-backdrop-enter');
      return {
        dialogo: nodo ? getComputedStyle(nodo).animationName : null,
        duracion: nodo ? getComputedStyle(nodo).animationDuration : null,
        fondo: fondo ? getComputedStyle(fondo).animationName : null
      };
    });
    check("el_movimiento_reducido_apaga_entradas", quieta.dialogo === "none" && quieta.fondo === "none", quieta);
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }]);
    await page.keyboard.press("Escape");

    // === Preferencias del usuario: el control real cambia el tema y se devuelve el valor ===
    await page.setViewport({ ...PANTALLAS.escritorio, deviceScaleFactor: 1 });
    await abrir(page, "/dashboard/comercio", "preferencias");
    // El control de tema no esta en la barra: vive en el dialogo «Mi cuenta y preferencias» del
    // shell (UserSessionBadge). Buscarlo sin abrir el panel devolvía null y la gate se ponía roja
    // contra una pantalla correcta. Se abre por su nombre accesible y ahi se mide.
    const abreCuenta = await page.evaluate(() => {
      const boton = document.querySelector('button[aria-label="Mi cuenta"]');
      if (!boton) return false;
      boton.click();
      return true;
    });
    const panel = await page.waitForFunction(() => Boolean(document.querySelector('[aria-label="Tema de la plataforma"]')), { polling: 100, timeout: 20000 }).then(() => true).catch(() => false);
    check("el_shell_abre_las_preferencias_del_usuario", abreCuenta && panel, { abreCuenta, panel });
    const control = await page.evaluate(() => {
      const grupo = document.querySelector('[aria-label="Tema de la plataforma"]');
      const antes = document.documentElement.classList.contains("dark");
      const objetivo = [...grupo.querySelectorAll("button")].find((b) => (antes ? /claro/i : /oscuro/i).test(b.innerText || b.getAttribute("aria-label") || ""));
      objetivo?.click();
      return { antes, presente: Boolean(objetivo), nombre: objetivo?.innerText?.trim() || null };
    });
    // El conmutador aplica la clase en el mismo render: se espera el hecho, no un sueno fijo.
    const cambio = await page.waitForFunction((valor) => document.documentElement.classList.contains("dark") !== valor, { polling: 100, timeout: 15000 }, control.antes).then(() => true).catch(() => false);
    const despues = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    check("el_control_de_tema_cambia_la_pantalla", control.presente && cambio && control.antes !== despues, { antes: control.antes, boton: control.nombre, despues });
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), { polling: 100, timeout: 15000 }).catch(() => null);
    await page.evaluate((valor) => { if (valor === null) localStorage.removeItem("apex_theme"); else localStorage.setItem("apex_theme", valor); }, temaInicial);
    await abrir(page, "/dashboard/comercio", "tema_restaurado");
    check("la_certificacion_deja_el_tema_como_estaba", await page.evaluate((valor) => (localStorage.getItem("apex_theme") ?? null) === valor, temaInicial), { tema_inicial: temaInicial });

    const resumenArchivo = path.join(evidenceDir, "recorrido.json");
    fs.writeFileSync(resumenArchivo, `${JSON.stringify({ ambiente: "local", ejecutado: new Date().toISOString(), resumen }, null, 2)}\n`);
    checks.push({ name: "evidencia_de_recorrido_escrita", ok: fs.existsSync(resumenArchivo), detail: { archivo: path.relative(root, resumenArchivo).replace(/\\/g, "/") } });
  } finally {
    await browser.close().catch(() => null);
    await db.$disconnect();
  }

  const fallidos = checks.filter((item) => !item.ok).map((item) => item.name);
  fs.writeFileSync(path.join(evidenceDir, "browser-local.json"), `${JSON.stringify({
    ambiente: "local",
    apiUrl,
    browser: browserPath,
    cambio: "comercio-ux-pasada",
    checks,
    ejecutado_en: new Date().toISOString(),
    fallidos,
    limitaciones: [
      "Se mide con el tenant demo local (catalogo sembrado). Un tenant real con otros textos o mas columnas puede cambiar el numero de objetivos tactiles por debajo de 44 px; la cota dura exigida es 24 px (WCAG 2.5.8) y todo lo menor a 44 px se reporta como muestra para decidir.",
      "El contraste se calcula sobre el fondo pintado por los propios padres (sin pixel sampling): un texto sobre una fotografia del banner de la vitrina no se puede medir aqui; esa ruta se cubre en certify:comercio-storefront-theme:local."
    ],
    ok: fallidos.length === 0,
    rama: "desarrollo",
    total: checks.length,
    webUrl
  }, null, 2)}\n`);
  if (fallidos.length) {
    console.error(`CERTIFICATION_FAIL ${JSON.stringify({ fallidos, total: checks.length })}`);
    process.exitCode = 1;
    return;
  }
  console.log(`CERTIFICATION_OK ${JSON.stringify({ evidencia: path.relative(root, evidenceDir).replace(/\\/g, "/"), total: checks.length })}`);
}

main().catch((error) => {
  console.error(`CERTIFICATION_FAIL ${error?.message}`);
  try {
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(path.join(evidenceDir, "browser-local.json"), `${JSON.stringify({ checks, error: String(error?.message || error), ok: false }, null, 2)}\n`);
  } catch { /* la evidencia puede no estar escribible */ }
  process.exitCode = 1;
});
