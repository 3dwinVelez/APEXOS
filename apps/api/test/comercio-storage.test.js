// Las fotos del catalogo demo viven en apps/web/public y se referencian con una ruta
// de sitio ("/comercio/productos/..."). Sin almacen configurado el storage debe
// devolver esa ruta tal cual en lugar de fallar o armar una URL del almacen.
const test = require("node:test");
const assert = require("node:assert/strict");

const ENV_NAMES = [
  "COMERCIO_STORAGE_DRIVER",
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY",
  "MINIO_ENDPOINT",
  "MINIO_PORT",
  "MINIO_ACCESS_KEY",
  "MINIO_SECRET_KEY",
  "COMERCIO_STORAGE_PUBLIC_URL"
];

// El conductor y el config se leen por llamada (no al cargar el modulo), pero el cliente
// de MinIO y el marcador de bucket viven en memoria del modulo: cada caso necesita su
// propia instancia para no heredar el estado del caso anterior.
function loadStorage(env) {
  const storagePath = require.resolve("../src/modules/comercio/storage");
  const previous = require.cache[storagePath];
  const saved = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));
  for (const name of ENV_NAMES) delete process.env[name];
  for (const [name, value] of Object.entries(env)) {
    if (value !== undefined) process.env[name] = String(value);
  }
  delete require.cache[storagePath];
  const storage = require(storagePath);
  const restore = () => {
    if (previous) require.cache[storagePath] = previous;
    else delete require.cache[storagePath];
    for (const name of ENV_NAMES) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  };
  return { storage, restore };
}

function loadStorageWithoutSupabase() {
  return loadStorage({});
}

async function withRejectedFetch(code, run) {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw Object.assign(new Error("fetch failed"), { code }); };
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

test("storage: una ruta de sitio se devuelve intacta sin Supabase", async () => {
  const { storage, restore } = loadStorageWithoutSupabase();
  try {
    const staticPath = "/comercio/productos/P-0016.jpg";
    assert.equal(storage.publicViewUrl(staticPath), staticPath, "la vitrina recibe la ruta estatica");
    assert.equal(await storage.signedViewUrl(staticPath), staticPath, "el maestro la muestra sin firmar");
    assert.equal(await storage.removeProductPhoto(staticPath), false, "no intenta borrar en Storage un asset del sitio");
  } finally { restore(); }
});

test("storage: sin Supabase una clave del bucket no produce URL ni se puede firmar", async () => {
  const { storage, restore } = loadStorageWithoutSupabase();
  try {
    assert.equal(storage.publicViewUrl("comercio-assets/tenant/comercio/products/1/foto.png"), null);
    await assert.rejects(storage.signedViewUrl("comercio-assets/tenant/comercio/products/1/foto.png"), /no configurado/);
  } finally { restore(); }
});

test("storage: el default de conductor es Supabase y solo se cambia por variable explicita", () => {
  const defecto = loadStorageWithoutSupabase();
  try { assert.equal(defecto.storage.storageDriver(), "supabase"); } finally { defecto.restore(); }
  const minio = loadStorage({ COMERCIO_STORAGE_DRIVER: "minio" });
  try { assert.equal(minio.storage.storageDriver(), "minio"); } finally { minio.restore(); }
});

test("storage: un conductor que no existe se rechaza nombrando los validos", () => {
  const { storage, restore } = loadStorage({ COMERCIO_STORAGE_DRIVER: "s3-freepik" });
  try {
    assert.throws(() => storage.storageConfig(), (error) => error.statusCode === 503 && /supabase o minio/.test(error.message));
  } finally { restore(); }
});

test("storage: el MinIO sin credenciales dice exactamente que falta", () => {
  const { storage, restore } = loadStorage({ COMERCIO_STORAGE_DRIVER: "minio", MINIO_ENDPOINT: "localhost" });
  try {
    assert.throws(() => storage.storageConfig(), (error) => error.statusCode === 503
      && /MINIO_ENDPOINT, MINIO_ACCESS_KEY y MINIO_SECRET_KEY/.test(error.message));
  } finally { restore(); }
});

// El defecto que llegaba al usuario como "Error interno": la caida del almacen subia
// como TypeError sin statusCode y el handler global la convertia en 500.
test("storage: almacen apagado responde 502 con causa legible, no 500", async () => {
  const { storage, restore } = loadStorage({
    SUPABASE_URL: "http://localhost:54321",
    SUPABASE_SERVICE_ROLE_KEY: "clave-de-prueba"
  });
  try {
    await withRejectedFetch("ECONNREFUSED", async () => {
      await assert.rejects(
        storage.uploadProductPhoto({ objectPath: "t/comercio/storefront/banner.png", bytes: Buffer.from("x"), contentType: "image/png" }),
        (error) => {
          assert.equal(error.statusCode, 502, "el usuario ve un fallo de dependencias, no un bug interno");
          assert.match(error.message, /no responde/);
          assert.match(error.message, /apagado|configuración/);
          return true;
        }
      );
    });
  } finally { restore(); }
});

test("storage: un DNS que no resuelve tampoco se disfraza de error interno", async () => {
  const { storage, restore } = loadStorage({
    SUPABASE_URL: "https://proyecto-inexistente.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "clave-de-prueba"
  });
  try {
    await withRejectedFetch("ENOTFOUND", async () => {
      await assert.rejects(storage.signedViewUrl("comercio-assets/t/comercio/products/1/f.png"),
        (error) => error.statusCode === 502 && /no se resuelve/.test(error.message));
    });
  } finally { restore(); }
});

test("storage: la peticion al almacen sale con senal de tiempo limite", async () => {
  const { storage, restore } = loadStorage({
    SUPABASE_URL: "http://localhost:54321",
    SUPABASE_SERVICE_ROLE_KEY: "clave-de-prueba"
  });
  try {
    const original = globalThis.fetch;
    let senal = null;
    globalThis.fetch = async (_url, options) => {
      senal = options?.signal;
      return { ok: true, json: async () => ({}), text: async () => "" };
    };
    try {
      await storage.uploadProductPhoto({ objectPath: "t/comercio/storefront/banner.png", bytes: Buffer.from("x"), contentType: "image/png" });
    } finally {
      globalThis.fetch = original;
    }
    assert.ok(senal instanceof AbortSignal, "sin senal de cancelacion un almacen colgado deja la peticion colgada");
    assert.equal(senal.aborted, false, "la senal no puede salir ya expirada");
  } finally { restore(); }
});

test("storage: con MinIO la URL publica sale por el origen que ve el navegador", () => {
  const { storage, restore } = loadStorage({
    COMERCIO_STORAGE_DRIVER: "minio",
    MINIO_ENDPOINT: "minio",
    MINIO_PORT: "9000",
    MINIO_ACCESS_KEY: "ak",
    MINIO_SECRET_KEY: "sk",
    COMERCIO_STORAGE_PUBLIC_URL: "http://localhost:9000"
  });
  try {
    assert.equal(
      storage.publicViewUrl("comercio-assets/t/comercio/storefront/banner-1.png"),
      "http://localhost:9000/comercio-assets/t/comercio/storefront/banner-1.png"
    );
  } finally { restore(); }
});

// La vitrina es publica y se pinta aunque el almacen este caido: las rutas de lectura
// no lanzan, devuelven null y la pagina usa el degradado del tema.
test("storage: MinIO mal configurado no rompe la lectura de la vitrina", () => {
  const { storage, restore } = loadStorage({ COMERCIO_STORAGE_DRIVER: "minio" });
  try {
    assert.equal(storage.publicViewUrl("comercio-assets/t/comercio/storefront/banner-1.png"), null);
  } finally { restore(); }
});
