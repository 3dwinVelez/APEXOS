// Fotografia del catalogo demo de Comercio (M-30).
//
// Busca en Wikimedia Commons una imagen libre por producto, la recorta a un cuadrado
// sobre fondo blanco, la guarda en apps/web/public/comercio/productos y apunta
// photo_path a esa ruta estatica. Asi la vitrina publica y el maestro de productos
// muestran fotos reales sin depender de Supabase Storage en local.
//
// Uso:
//   node scripts/seed-comercio-photos.js --dry-run           # solo muestra que elegiria
//   node scripts/seed-comercio-photos.js                     # descarga faltantes y actualiza BD
//   node scripts/seed-comercio-photos.js --force             # rehace todas
//   node scripts/seed-comercio-photos.js --only P-0016,P-0025
//   node scripts/seed-comercio-photos.js --no-db             # solo descarga archivos
//   node scripts/seed-comercio-photos.js --sheet 6           # hojas de contacto para revisar
//
// Idempotente: si el archivo ya existe y la fila ya apunta a el, el producto se omite.
// El catalogo de busquedas vive en scripts/data/comercio-photo-queries.json (clave =
// nombre normalizado) para poder ajustar la consulta de un producto sin tocar codigo.
require("./load-env")();

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");
const prisma = require("../apps/api/src/core/prisma");

const OUTPUT_DIR = path.resolve(__dirname, "../apps/web/public/comercio/productos");
const QUERIES_FILE = path.resolve(__dirname, "data/comercio-photo-queries.json");
const CREDITS_FILE = path.join(OUTPUT_DIR, "credits.json");
const STATIC_PREFIX = "/comercio/productos";
const TILE = 640;
const DEFAULT_EMAIL = "demo@apex.local";
const USER_AGENT = "APEXOS-ComercioDemo/1.0 (prototipo local; demo@apex.local)";
const REQUEST_DELAY_MS = 150;

// Titulos con estas palabras suelen ser fotos de contexto (museos, avisos, mapas) y no
// el objeto del catalogo. Restarlas evita elegir una vitrina de supermercado por error.
const BAD_WORDS = [
  "logo", "map", "diagram", "drawing", "illustration", "cartoon", "painting",
  "statue", "monument", "museum", "exhibition", "collection", "poster", "advertisement",
  "sign", "signage", "banknote", "coin", "stamp", "screenshot", "document", "chart",
  "portrait", "woman", "man", "people", "person", "hand", "shop", "store", "market",
  "shelf", "supermarket", "restaurant", "menu", "street", "building", "festival"
];

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const valueOf = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : null;
};
const onlyCodes = new Set(String(valueOf("only") || "").split(",").map((value) => value.trim().toUpperCase()).filter(Boolean));

function normalizeName(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function loadQueries() {
  const parsed = JSON.parse(fs.readFileSync(QUERIES_FILE, "utf8"));
  return parsed.queries || {};
}

function loadCredits() {
  if (!fs.existsSync(CREDITS_FILE)) return { source: "Wikimedia Commons", items: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(CREDITS_FILE, "utf8"));
    return { source: parsed.source || "Wikimedia Commons", items: parsed.items || {} };
  } catch {
    return { source: "Wikimedia Commons", items: {} };
  }
}

function scoreCandidate(candidate, query) {
  const title = String(candidate.title || "").replace(/^File:/i, "").toLowerCase();
  const tokens = query.toLowerCase().split(/\s+/).filter((token) => token.length > 2);
  let score = 0;
  const matched = tokens.filter((token) => title.includes(token)).length;
  score += matched * 3;
  if (tokens.length && matched === tokens.length) score += 4;
  const words = title.split(/[^a-z0-9]+/).filter(Boolean);
  if (words.length > 9) score -= words.length - 9;
  for (const bad of BAD_WORDS) {
    if (words.includes(bad)) score -= 6;
  }
  const mime = String(candidate.mime || "").toLowerCase();
  if (mime === "image/jpeg") score += 2;
  else if (mime === "image/png") score += 1;
  else if (mime === "image/svg+xml") score -= 25;
  else if (mime !== "image/webp") score -= 3;
  const width = Number(candidate.width || 0);
  const height = Number(candidate.height || 0);
  if (width >= 800 && height >= 600) score += 2;
  if (Math.min(width, height) < 300) score -= 5;
  if (width && height) {
    const ratio = width / height;
    if (ratio > 0.75 && ratio < 1.34) score += 1;
  }
  return score;
}

async function commonsSearch(query, limit = 15) {
  // Una consulta "File:Algo.jpg" fija el archivo exacto: sirve cuando la busqueda por
  // palabras devuelve objetos parecidos pero equivocados (museo, cartel, animal).
  const pinned = /^File:/i.test(query);
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.search = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    ...(pinned
      ? { titles: query }
      : { generator: "search", gsrsearch: `${query} filetype:bitmap`, gsrnamespace: "6", gsrlimit: String(limit) }),
    prop: "imageinfo",
    iiprop: "url|mime|size|extmetadata",
    iiurlwidth: "900"
  }).toString();
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  if (!response.ok) throw new Error(`Commons respondio ${response.status} para "${query}"`);
  const payload = await response.json();
  const pages = payload?.query?.pages;
  if (!Array.isArray(pages)) return [];
  return pages.flatMap((page) => {
    const info = Array.isArray(page.imageinfo) ? page.imageinfo[0] : null;
    if (!info) return [];
    return [{
      title: page.title,
      mime: info.mime,
      width: info.width,
      height: info.height,
      url: String(info.thumburl || info.url || "").split("?")[0],
      page: info.descriptionurl || "",
      license: info.extmetadata?.LicenseShortName?.value || "Ver pagina del archivo",
      artist: String(info.extmetadata?.Artist?.value || "").replace(/<[^>]+>/g, "").trim() || null
    }];
  }).filter((candidate) => candidate.url);
}

function fallbackQueries(query) {
  const words = query.split(/\s+/).filter(Boolean);
  const candidates = [];
  if (words.length > 2) candidates.push(words.slice(0, 2).join(" "));
  if (words.length > 1) candidates.push(words[0]);
  return candidates;
}

async function pickImage(query) {
  const attempts = [query, ...fallbackQueries(query)];
  let best = null;
  for (const attempt of attempts) {
    const candidates = await commonsSearch(attempt);
    // Un archivo fijado a mano se acepta tal cual: no hay nada que puntuar.
    if (/^File:/i.test(attempt) && candidates.length) {
      return { ...candidates[0], score: 50, query: attempt };
    }
    for (const candidate of candidates) {
      const score = scoreCandidate(candidate, attempt);
      if (!best || score > best.score) best = { ...candidate, score, query: attempt };
    }
    // Una coincidencia solida evita gastar otra busqueda con la consulta recortada.
    if (best && best.score >= 10) break;
    await sleep(REQUEST_DELAY_MS);
  }
  return best;
}

async function downloadBytes(url) {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`Descarga fallo con ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 1024) throw new Error("La imagen descargada esta vacia");
  return buffer;
}

async function normalizeImage(bytes) {
  return sharp(bytes, { failOn: "none" })
    .rotate()
    .resize(TILE, TILE, { fit: "contain", background: "#ffffff", withoutEnlargement: false })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveTenant(email) {
  const user = await prisma.user.findFirst({ where: { email } });
  if (!user) throw new Error(`No hay usuario local con el correo ${email}.`);
  const tenant = await prisma.tenant.findFirst({ where: { id: user.tenant_id } });
  if (!tenant) throw new Error(`El usuario ${email} no tiene tenant asociado.`);
  return tenant;
}

async function buildSheets(perSheet) {
  const files = fs.readdirSync(OUTPUT_DIR).filter((name) => /^P-\d+\.jpg$/i.test(name)).sort();
  const cols = 6;
  const tile = 220;
  const sheets = [];
  for (let start = 0; start < files.length; start += perSheet) {
    const slice = files.slice(start, start + perSheet);
    const rows = Math.ceil(slice.length / cols);
    const composites = await Promise.all(slice.map(async (file, index) => ({
      input: await sharp(path.join(OUTPUT_DIR, file)).resize(tile, tile, { fit: "cover" }).jpeg().toBuffer(),
      left: (index % cols) * tile,
      top: Math.floor(index / cols) * tile
    })));
    const buffer = await sharp({
      create: { width: cols * tile, height: rows * tile, channels: 3, background: "#ffffff" }
    }).composite(composites).jpeg({ quality: 78 }).toBuffer();
    const out = path.join(os.tmpdir(), `comercio-sheet-${sheets.length + 1}.jpg`);
    fs.writeFileSync(out, buffer);
    sheets.push({ out, files: slice });
  }
  sheets.forEach((sheet, index) => {
    console.log(`Hoja ${index + 1}: ${sheet.out}`);
    console.log(`  ${sheet.files.join(" ")}`);
  });
}

async function main() {
  const email = valueOf("email") || DEFAULT_EMAIL;
  const dryRun = flag("dry-run");
  const force = flag("force");
  const noDb = flag("no-db");

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  if (flag("sheet")) {
    await buildSheets(Number(valueOf("sheet")) || 24);
    return;
  }

  const queries = loadQueries();
  const tenant = await resolveTenant(email);
  const products = await prisma.runWithTenant(tenant.id, () => prisma.comercioProduct.findMany({
    where: { __includeInactive: true },
    orderBy: [{ category: "asc" }, { name: "asc" }]
  }));
  const targets = products.filter((product) => !onlyCodes.size || onlyCodes.has(String(product.code).toUpperCase()));
  console.log(`Tenant ${tenant.name}: ${targets.length} productos por revisar.`);

  const credits = loadCredits();
  const missingQueries = [];
  const failures = [];
  let downloaded = 0;
  let skipped = 0;
  let linked = 0;

  for (const [index, product] of targets.entries()) {
    const label = `[${index + 1}/${targets.length}] ${product.code} ${product.name}`;
    const query = queries[normalizeName(product.name)];
    if (!query) {
      missingQueries.push(`${product.code} ${product.name}`);
      console.log(`${label} -> sin consulta configurada`);
      continue;
    }
    const file = `${product.code}.jpg`;
    const absolute = path.join(OUTPUT_DIR, file);
    const staticPath = `${STATIC_PREFIX}/${file}`;
    const alreadyLinked = product.photo_path === staticPath;

    if (!dryRun && !force && fs.existsSync(absolute) && alreadyLinked) {
      skipped += 1;
      continue;
    }

    try {
      const picked = await pickImage(query);
      if (!picked || picked.score < 4) {
        failures.push(`${product.code} ${product.name} -> sin candidato util ("${query}")`);
        console.log(`${label} -> sin candidato ("${query}")`);
        continue;
      }
      if (dryRun) {
        console.log(`${label} -> ${picked.title} (puntaje ${picked.score}) ${picked.url}`);
        await sleep(REQUEST_DELAY_MS);
        continue;
      }
      const bytes = await downloadBytes(picked.url);
      const normalized = await normalizeImage(bytes);
      fs.writeFileSync(absolute, normalized);
      downloaded += 1;
      credits.items[product.code] = {
        name: product.name,
        file: staticPath,
        query: picked.query,
        title: picked.title,
        page: picked.page,
        license: picked.license,
        artist: picked.artist,
        sha256: crypto.createHash("sha256").update(normalized).digest("hex")
      };
      if (!noDb) {
        await prisma.runWithTenant(tenant.id, () => prisma.comercioProduct.update({
          where: { id: product.id },
          data: { photo_path: staticPath, photo_mime: "image/jpeg" }
        }));
        linked += 1;
      }
      console.log(`${label} -> ${picked.title} (puntaje ${picked.score}, ${Math.round(normalized.length / 1024)} KB)`);
      await sleep(REQUEST_DELAY_MS);
    } catch (error) {
      failures.push(`${product.code} ${product.name} -> ${error.message}`);
      console.log(`${label} -> ERROR ${error.message}`);
    }
  }

  if (!dryRun) {
    fs.writeFileSync(CREDITS_FILE, `${JSON.stringify({
      source: credits.source,
      note: "Imagenes libres de Wikimedia Commons, recortadas a 640x640 para el catalogo demo.",
      updated_at: new Date().toISOString(),
      items: credits.items
    }, null, 2)}\n`);
  }

  console.log(`\nResumen: ${downloaded} descargadas, ${linked} vinculadas, ${skipped} ya estaban, ${failures.length} fallos.`);
  if (missingQueries.length) {
    console.log(`\nSin consulta (${missingQueries.length}):`);
    missingQueries.forEach((line) => console.log(`  - ${line}`));
  }
  if (failures.length) {
    console.log(`\nFallos (${failures.length}):`);
    failures.forEach((line) => console.log(`  - ${line}`));
  }
  if (failures.length || missingQueries.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("La semilla de fotos fallo:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect().catch(() => {}));
