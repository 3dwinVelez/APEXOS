// Tema de la vitrina publica Comercio: saneamiento del payload publico, escritura del
// tema en preferences_json.theme, banner (upload/generacion) y el cliente Pollinations.
// Mismo arnes que comercio-service.test.js: Prisma falso inyectado en require.cache.
const test = require("node:test");
const assert = require("node:assert/strict");

process.env.DISABLE_REDIS = "true";

const TENANT = "t-1";

// === Almacenamiento falso: registra llamadas y sirve URLs deterministas ===

function fakeStorage() {
  const calls = [];
  return {
    calls,
    MAX_BYTES: 5 * 1024 * 1024,
    storageConfig() {
      if (this.configured === false) {
        throw Object.assign(new Error("Almacenamiento no configurado."), { statusCode: 503 });
      }
      return { url: "https://storage.test", key: "fake" };
    },
    configured: true,
    validateProductImage(bytes) {
      if (!bytes?.length) throw Object.assign(new Error("vacia"), { statusCode: 400 });
      calls.push({ op: "validate" });
      return { mime: "image/jpeg", extension: "jpg", checksum_sha256: "x" };
    },
    storefrontObjectKey({ tenantId, extension }) {
      calls.push({ op: "storefrontObjectKey", tenantId, extension });
      return `${tenantId}/comercio/storefront/banner-test.${extension}`;
    },
    async uploadProductPhoto({ objectPath, bytes, contentType }) {
      calls.push({ op: "upload", objectPath, bytes: bytes.length, contentType });
      return `comercio-assets/${objectPath}`;
    },
    async removeProductPhoto(path) {
      calls.push({ op: "remove", path });
      return true;
    },
    async signedViewUrl(path) {
      return `https://signed.test/${path}`;
    },
    publicViewUrl(path) {
      if (!path) return null;
      if (String(path).startsWith("/")) return path;
      return `https://public.test/${path}`;
    }
  };
}

function fakeImageGen(bytes) {
  const calls = [];
  return {
    calls,
    bytes,
    async generateBannerImage(prompt) {
      calls.push(prompt);
      return this.bytes;
    }
  };
}

// Prisma falso minimo: comercioSettings con la semantica que usan las rutas nuevas,
// mas productos/promociones para leer el catalogo publico completo.
function fakePrisma() {
  const settings = [];
  const products = [];
  const promotions = [];
  const prisma = {
    settings,
    products,
    promotions,
    runWithTenant: (_tenantId, callback) => callback(),
    comercioSettings: {
      findFirst: async ({ where = {} } = {}) => {
        const row = settings.find((item) => item.catalog_code === (where.catalog_code ?? item.catalog_code));
        return row ? structuredClone(row) : null;
      },
      create: async ({ data = {} } = {}) => {
        const row = { id: 1, tenant_id: TENANT, store_name: "Mi comercio", currency: "COP", preferences_json: {}, ...data };
        settings.push(row);
        return structuredClone(row);
      },
      update: async ({ where = {}, data = {} } = {}) => {
        const row = settings.find((item) => item.id === where.id);
        if (!row) throw Object.assign(new Error("P2025"), { code: "P2025" });
        Object.assign(row, structuredClone(data), { updated_at: new Date() });
        return structuredClone(row);
      }
    },
    comercioProduct: {
      findMany: async () => products.map((row) => structuredClone(row))
    },
    comercioPromotion: {
      findMany: async () => promotions.map((row) => structuredClone(row))
    }
  };
  return prisma;
}

function loadComercioService(prisma, storage, imagegen) {
  const prismaPath = require.resolve("../src/core/prisma");
  const storagePath = require.resolve("../src/modules/comercio/storage");
  const imagegenPath = require.resolve("../src/modules/comercio/imagegen");
  const servicePath = require.resolve("../src/modules/comercio/service");
  const previous = {
    prisma: require.cache[prismaPath],
    storage: require.cache[storagePath],
    imagegen: require.cache[imagegenPath],
    service: require.cache[servicePath]
  };
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prisma };
  require.cache[storagePath] = { id: storagePath, filename: storagePath, loaded: true, exports: storage };
  require.cache[imagegenPath] = { id: imagegenPath, filename: imagegenPath, loaded: true, exports: imagegen };
  delete require.cache[servicePath];
  const service = require(servicePath);
  const restore = () => {
    for (const [key, path] of Object.entries({ prisma: prismaPath, storage: storagePath, imagegen: imagegenPath, service: servicePath })) {
      if (previous[key]) require.cache[path] = previous[key];
      else delete require.cache[path];
    }
  };
  return { service, restore };
}

async function expectError(promise, code) {
  try {
    await promise;
  } catch (error) {
    assert.equal(error.code ?? error.statusCode, code, `esperaba ${code} pero fallo con ${error.code}: ${error.message}`);
    return error;
  }
  assert.fail(`se esperaba un error ${code}`);
}

function harness({ preferences = {} } = {}) {
  const prisma = fakePrisma();
  const storage = fakeStorage();
  const imagegen = fakeImageGen(Buffer.from("jpeg-bytes"));
  prisma.settings.push({
    id: 1, tenant_id: TENANT, store_name: "La Estacion", currency: "COP",
    catalog_enabled: true, catalog_code: "estacion", preferences_json: preferences
  });
  const { service, restore } = loadComercioService(prisma, storage, imagegen);
  return { prisma, storage, imagegen, service, restore };
}

// === publicTheme: saneamiento defensivo ===

test("publicTheme: sin preferencias devuelve la paleta esmeralda/rosa vigente", () => {
  const { service, restore } = harness();
  try {
    const theme = service.publicTheme({});
    assert.equal(theme.accent, "#10b981");
    assert.equal(theme.promo, "#e11d48");
    assert.equal(theme.base, "#0a0a0a");
    assert.equal(theme.headline, null);
    assert.equal(theme.banner_url, null);
  } finally { restore(); }
});

test("publicTheme: descarta hex invalidos y valores maliciosos sin romper la vitrina", () => {
  const { service, restore } = harness();
  try {
    const theme = service.publicTheme({ theme: {
      accent: "javascript:alert(1)",
      promo: "#zzzzzz",
      base: "#ABCDEF",
      headline: "  Mucho texto que desborda el cartel  ".padEnd(200, "x"),
      banner_path: 42
    } });
    assert.equal(theme.accent, "#10b981", "un hex falso no llega a la vitrina");
    assert.equal(theme.promo, "#e11d48");
    assert.equal(theme.base, "#abcdef", "un hex valido se normaliza a minusculas");
    assert.ok(theme.headline.length <= 80, "el cartel se recorta al maximo");
    assert.equal(theme.banner_url, null, "un path no-strings no produce URL");
  } finally { restore(); }
});

test("publicTheme: un asset estatico del sitio se conserva tal cual", () => {
  const { service, restore } = harness();
  try {
    const theme = service.publicTheme({ theme: { banner_path: "/comercio/storefront/demo.jpg" } });
    assert.equal(theme.banner_url, "/comercio/storefront/demo.jpg");
  } finally { restore(); }
});

// === publicCatalog: el tema viaja sanitizado y sin fugas ===

test("publicCatalog: expone el tema del tenant junto al catalogo, sin costo, stock ni tenant", async () => {
  const prisma = fakePrisma();
  const storage = fakeStorage();
  const imagegen = fakeImageGen(Buffer.from("x"));
  const { service, restore } = loadComercioService(prisma, storage, imagegen);
  try {
    prisma.settings.push({
      id: 1, tenant_id: TENANT, store_name: "La Estacion", currency: "COP", catalog_enabled: true, catalog_code: "estacion",
      preferences_json: { theme: { accent: "#f59e0b", base: "no-es-hex", banner_path: "comercio-assets/storefront/banner.jpg", headline: "Semana del cafe" } }
    });
    prisma.products.push({
      id: 1, tenant_id: TENANT, code: "P-0001", name: "Cafe", category: "Bebidas", unit: "unidad",
      price: 18000, discount_percent: 0, cost: 9000, stock: 5, min_stock: 0, active: true, notes: null, photo_path: null, catalog_featured: false
    });
    const catalog = await service.publicCatalog("estacion");
    assert.equal(catalog.theme.accent, "#f59e0b", "el color propio del comercio llega a la vitrina");
    assert.equal(catalog.theme.base, "#0a0a0a", "un valor basura cae al default, no se publica");
    assert.equal(catalog.theme.headline, "Semana del cafe");
    assert.equal(catalog.theme.banner_url, "https://public.test/comercio-assets/storefront/banner.jpg");
    assert.equal(catalog.items.length, 1);
    const raw = JSON.stringify(catalog);
    assert.ok(!raw.includes("cost"), "el catalogo publico no revela costos");
    assert.ok(!raw.includes("stock"), "el catalogo publico no revela existencias");
    assert.ok(!raw.includes(TENANT), "el catalogo publico no revela el tenant");
    assert.ok(!raw.includes("banner_path"), "el path interno del bucket no viaja a la vitrina");
  } finally { restore(); }
});

// === setStorefrontTheme: merge validado en preferences_json.theme ===

test("setStorefrontTheme: mezcla colores validas y conserva otras preferencias", async () => {
  const { prisma, service, restore } = harness({ preferences: { densidad: "compacta", theme: { accent: "#10b981" } } });
  try {
    const dto = await service.setStorefrontTheme(TENANT, { accent: "#F59E0B", headline: "  Gran liquidacion  ", subhead: "" });
    const stored = prisma.settings[0].preferences_json;
    assert.equal(stored.densidad, "compacta", "no pisa otras preferencias");
    assert.equal(stored.theme.accent, "#f59e0b");
    assert.equal(stored.theme.headline, "Gran liquidacion");
    assert.equal(stored.theme.subhead, null, "vacio = se quita del cartel");
    assert.equal(dto.preferences.theme.accent, "#f59e0b", "el DTO devuelve las preferencias completas");
  } finally { restore(); }
});

test("setStorefrontTheme: ignora los campos que no le pertenecen (banner y compania)", async () => {
  // Doble defensa: el schema declara solo 5 claves y el servicio reconstruye campo por
  // campo. Si un llamada interna pasa banner_url o banner_path, no llegan a la fila:
  // la URL del cartel solo la producen las rutas de subida/generacion.
  const { prisma, service, restore } = harness({ preferences: { theme: { accent: "#10b981" } } });
  try {
    const dto = await service.setStorefrontTheme(TENANT, {
      accent: "#22c55e",
      banner_url: "https://evil.test/x.png",
      banner_path: "otro-tenant/secreto.jpg",
      promo_oficial: "colocar aqui el RUC"
    });
    const stored = prisma.settings[0].preferences_json.theme;
    assert.equal(stored.accent, "#22c55e", "el color si se escribe");
    assert.ok(!("banner_url" in stored), "la URL del banner no se escribe desde el tema");
    assert.ok(!("banner_path" in stored), "el path del bucket no se escribe desde el tema");
    assert.ok(!("promo_oficial" in stored), "ningun campo suelto entra al tema");
    assert.equal(dto.theme.banner_url, null, "y la vitrina no recibe imagen nueva");
  } finally { restore(); }
});

test("setStorefrontTheme: hex invalido se rechaza antes de escribir", async () => {
  const { prisma, service, restore } = harness();
  try {
    await expectError(service.setStorefrontTheme(TENANT, { promo: "rojo" }), "THEME_COLOR_INVALID");
    await expectError(service.setStorefrontTheme(TENANT, { base: "#12345" }), "THEME_COLOR_INVALID");
    assert.ok(!prisma.settings[0].preferences_json.theme, "el rechazo no deja tema a medias");
  } finally { restore(); }
});

test("setStorefrontTheme: null devuelve un color a la paleta por defecto", async () => {
  const { prisma, service, restore } = harness({ preferences: { theme: { accent: "#f59e0b" } } });
  try {
    await service.setStorefrontTheme(TENANT, { accent: null });
    assert.equal(prisma.settings[0].preferences_json.theme.accent, null);
    const theme = service.publicTheme(prisma.settings[0].preferences_json);
    assert.equal(theme.accent, "#10b981", "sin valor propio la vitrina vuelve al esmeralda");
  } finally { restore(); }
});

test("getSettings: el panel autenticado recibe el tema saneado y la URL publica del banner", async () => {
  // El panel de configuracion pinta su previa con este DTO: necesita los colores ya
  // validados y la URL que producira el servidor, no el preferences_json crudo.
  const { service, restore } = harness({
    preferences: { theme: { accent: "javascript:alert(1)", promo: "#0EA5E9", base: "#f8fafc", headline: "Frescos todos los dias", banner_path: "comercio-assets/t-1/comercio/storefront/banner.jpg" } }
  });
  try {
    const dto = await service.getSettings(TENANT);
    assert.equal(dto.theme.accent, "#10b981", "el hex corrupto cae al default");
    assert.equal(dto.theme.promo, "#0ea5e9", "valido se conserva, en minusculas");
    assert.equal(dto.theme.base, "#f8fafc");
    assert.equal(dto.theme.headline, "Frescos todos los dias");
    assert.equal(dto.theme.banner_url, "https://public.test/comercio-assets/t-1/comercio/storefront/banner.jpg");
    assert.ok(!("banner_path" in dto.theme), "el path interno del bucket no sale al cliente");
  } finally { restore(); }
});

// === Banner: subida, generacion y retiro ===
test("attachStorefrontBanner: valida, sube al bucket y persiste el path interno", async () => {
  const { prisma, storage, service, restore } = harness();
  try {
    const saved = await service.attachStorefrontBanner(TENANT, { bytes: Buffer.from("img"), declaredMime: "image/jpeg" });
    const upload = storage.calls.find((call) => call.op === "upload");
    assert.match(upload.objectPath, /^t-1\/comercio\/storefront\/banner-test\.jpg$/);
    assert.equal(prisma.settings[0].preferences_json.theme.banner_path, "comercio-assets/t-1/comercio/storefront/banner-test.jpg");
    assert.equal(saved.banner_url, "https://signed.test/comercio-assets/t-1/comercio/storefront/banner-test.jpg");
  } finally { restore(); }
});

test("attachStorefrontBanner: reemplazar borra el objeto anterior (best-effort)", async () => {
  const { prisma, storage, service, restore } = harness({ preferences: { theme: { banner_path: "comercio-assets/viejo.jpg" } } });
  try {
    await service.attachStorefrontBanner(TENANT, { bytes: Buffer.from("img"), declaredMime: "image/jpeg" });
    assert.ok(storage.calls.some((call) => call.op === "remove" && call.path === "comercio-assets/viejo.jpg"));
  } finally { restore(); }
});

test("detachStorefrontBanner: quita el path y elimina el objeto", async () => {
  const { prisma, storage, service, restore } = harness({ preferences: { theme: { banner_path: "comercio-assets/actual.jpg" } } });
  try {
    await service.detachStorefrontBanner(TENANT);
    assert.equal(prisma.settings[0].preferences_json.theme.banner_path, null);
    assert.ok(storage.calls.some((call) => call.op === "remove" && call.path === "comercio-assets/actual.jpg"));
  } finally { restore(); }
});

test("generateStorefrontBanner: sin Supabase configurado falla antes de gastar la generacion", async () => {
  const { service, restore, imagegen, storage } = harness();
  try {
    storage.configured = false;
    const error = await expectError(service.generateStorefrontBanner(TENANT, "panaderia caliente al amanecer"), 503);
    assert.equal(error.statusCode, 503);
    assert.equal(imagegen.calls.length, 0, "no se llama al generador si no hay donde guardar");
  } finally { restore(); }
});

test("generateStorefrontBanner: la imagen generada entra por el mismo validador que una subida", async () => {
  const { prisma, service, restore, imagegen } = harness();
  try {
    const saved = await service.generateStorefrontBanner(TENANT, "vitrina de cafe colombiano");
    assert.deepEqual(imagegen.calls, ["vitrina de cafe colombiano"], "el servicio pasa el prompt al generador");
    assert.equal(prisma.settings[0].preferences_json.theme.banner_path, "comercio-assets/t-1/comercio/storefront/banner-test.jpg");
    assert.ok(saved.banner_url.startsWith("https://signed.test/"));
  } finally { restore(); }
});

// === Esquema Fastify: el borde rechaza lo que el servicio no debe ver ===

test("storefrontThemeSchema: solo hex de 6 digitos y textos acotados", () => {
  const schema = require("../src/modules/comercio/schema").storefrontThemeSchema.body;
  assert.equal(schema.additionalProperties, false, "el body no admite campos sueltos");
  for (const key of ["accent", "promo", "base"]) {
    assert.match(schema.properties[key].pattern, /\[0-9a-fA-F\]\{6\}/, `${key} debe exigir un hex de 6 digitos`);
  }
  assert.equal(schema.properties.headline.maxLength, 80);
  assert.equal(schema.properties.subhead.maxLength, 140);
  const generate = require("../src/modules/comercio/schema").storefrontGenerateSchema.body;
  assert.deepEqual(generate.required, ["prompt"]);
  assert.equal(generate.properties.prompt.maxLength, 300);
});

// === imagegen: contrato del proveedor gratuito ===

function streamingBody(buffer, chunkSize = 1024) {
  return {
    async *[Symbol.asyncIterator]() {
      for (let i = 0; i < buffer.length; i += chunkSize) yield buffer.subarray(i, i + chunkSize);
    }
  };
}

test("imagegen: genera contra el host fijo con prompt codificado y nologo", async () => {
  const imagegen = require("../src/modules/comercio/imagegen");
  const calls = [];
  const previousFetch = global.fetch;
  global.fetch = async (url, options) => {
    calls.push({ url, signal: Boolean(options?.signal) });
    return { ok: true, status: 200, body: streamingBody(Buffer.from("jpeg")) };
  };
  try {
    const bytes = await imagegen.generateBannerImage("panaderia artesanal, luz calida");
    assert.equal(bytes.toString(), "jpeg");
    assert.equal(calls.length, 1);
    const url = new URL(calls[0].url);
    assert.equal(url.host, "image.pollinations.ai");
    assert.equal(decodeURIComponent(url.pathname), "/prompt/panaderia artesanal, luz calida");
    assert.equal(url.searchParams.get("nologo"), "true");
    assert.ok(calls[0].signal, "la llamada sale con senal de cancelacion");
  } finally {
    global.fetch = previousFetch;
  }
});

test("imagegen: prompt corto o larguisimo se rechaza sin salir a la red", async () => {
  const imagegen = require("../src/modules/comercio/imagegen");
  const previousFetch = global.fetch;
  let touched = 0;
  global.fetch = async () => { touched += 1; return { ok: true, body: streamingBody(Buffer.from("x")) }; };
  try {
    await expectError(imagegen.generateBannerImage("sol"), "IMAGEGEN_PROMPT_INVALID");
    await expectError(imagegen.generateBannerImage("x".repeat(400)), "IMAGEGEN_PROMPT_INVALID");
    assert.equal(touched, 0);
  } finally {
    global.fetch = previousFetch;
  }
});

test("imagegen: cleanPrompt compacta espacios y rechaza fuera de los limites", () => {
  const { cleanPrompt } = require("../src/modules/comercio/imagegen");
  assert.equal(cleanPrompt("  vitrina   de\tcafe  "), "vitrina de cafe");
  assert.throws(() => cleanPrompt("sol"), (error) => error.code === "IMAGEGEN_PROMPT_INVALID");
  assert.throws(() => cleanPrompt("x".repeat(301)), (error) => error.code === "IMAGEGEN_PROMPT_INVALID");
});

test("imagegen: proveedor caido, respuesta vacía o gigante devuelven códigos propios", async () => {
  const imagegen = require("../src/modules/comercio/imagegen");
  const previousFetch = global.fetch;
  try {
    global.fetch = async () => ({ ok: false, status: 503, body: streamingBody(Buffer.from("")) });
    await expectError(imagegen.generateBannerImage("vitrina de flores"), "IMAGEGEN_UNAVAILABLE");
    global.fetch = async () => ({ ok: true, status: 200, body: streamingBody(Buffer.alloc(0)) });
    await expectError(imagegen.generateBannerImage("vitrina de flores"), "IMAGEGEN_EMPTY");
    global.fetch = async () => ({ ok: true, status: 200, body: streamingBody(Buffer.alloc(imagegen.MAX_BYTES + 1), 64 * 1024) });
    await expectError(imagegen.generateBannerImage("vitrina de flores"), "IMAGEGEN_TOO_LARGE");
    global.fetch = async () => { throw Object.assign(new Error("aborted"), { name: "AbortError" }); };
    await expectError(imagegen.generateBannerImage("vitrina de flores"), "IMAGEGEN_TIMEOUT");
  } finally {
    global.fetch = previousFetch;
  }
});
