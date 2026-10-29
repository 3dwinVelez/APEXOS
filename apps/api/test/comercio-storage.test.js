// Las fotos del catalogo demo viven en apps/web/public y se referencian con una ruta
// de sitio ("/comercio/productos/..."). Sin Supabase configurado el storage debe
// devolver esa ruta tal cual en lugar de fallar o armar una URL de Storage.
const test = require("node:test");
const assert = require("node:assert/strict");

function loadStorageWithoutSupabase() {
  const storagePath = require.resolve("../src/modules/comercio/storage");
  const previous = require.cache[storagePath];
  const env = { url: process.env.SUPABASE_URL, publicUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  delete process.env.SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete require.cache[storagePath];
  const storage = require(storagePath);
  const restore = () => {
    if (previous) require.cache[storagePath] = previous;
    else delete require.cache[storagePath];
    for (const [name, value] of [["SUPABASE_URL", env.url], ["NEXT_PUBLIC_SUPABASE_URL", env.publicUrl], ["SUPABASE_SERVICE_ROLE_KEY", env.key]]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
  return { storage, restore };
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
