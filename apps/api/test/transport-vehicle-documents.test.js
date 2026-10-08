const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  BUCKET,
  MAX_BYTES,
  MAX_DIMENSION,
  SIGNED_URL_TTL_SECONDS,
  storageConfig,
  objectKey,
  validateVehicleDocument,
  uploadVehicleDocument,
  signedViewUrl
} = require("../src/modules/transport/vehicle-document-storage");

const STORAGE_ENV_KEYS = ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"];

function withEnv(values, run) {
  const previous = new Map(STORAGE_ENV_KEYS.map((key) => [key, process.env[key]]));
  const restore = () => {
    for (const key of STORAGE_ENV_KEYS) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  for (const key of STORAGE_ENV_KEYS) delete process.env[key];
  Object.assign(process.env, values);
  let result;
  try {
    result = run();
  } catch (error) {
    restore();
    throw error;
  }
  if (result && typeof result.then === "function") return result.finally(restore);
  restore();
  return result;
}

async function withFetch(handler, run) {
  const originalFetch = global.fetch;
  global.fetch = handler;
  try {
    return await run();
  } finally {
    global.fetch = originalFetch;
  }
}

function pngBytes(width, height, length = 32) {
  const bytes = Buffer.alloc(length);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

test("valida PNG por firma con dimensiones y huella", () => {
  const result = validateVehicleDocument(pngBytes(640, 480), "image/png");
  assert.equal(result.mime, "image/png");
  assert.equal(result.extension, "png");
  assert.equal(result.width, 640);
  assert.equal(result.height, 480);
  assert.match(result.checksum_sha256, /^[0-9a-f]{64}$/);
});

test("valida PDF por firma sin exigir dimensiones", () => {
  const result = validateVehicleDocument(Buffer.from("%PDF-1.7\n%%EOF"), "application/pdf");
  assert.equal(result.mime, "application/pdf");
  assert.equal(result.extension, "pdf");
  assert.equal(result.width, null);
  assert.equal(result.height, null);
});

test("rechaza contenido HTML aunque se declare imagen", () => {
  assert.throws(
    () => validateVehicleDocument(Buffer.from("<html><script>alert(1)</script></html>"), "image/png"),
    (error) => error.statusCode === 415
  );
});

test("rechaza archivos vacios, sobredimensionados y truncados", () => {
  assert.throws(() => validateVehicleDocument(Buffer.alloc(0), "image/png"), (error) => error.statusCode === 400);
  assert.throws(() => validateVehicleDocument(Buffer.alloc(MAX_BYTES + 1), "image/png"), (error) => error.statusCode === 413);
  const truncated = Buffer.alloc(10);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(truncated);
  assert.throws(() => validateVehicleDocument(truncated, "image/png"), (error) => error.statusCode === 415);
});

test("rechaza dimensiones fuera del limite y tipo declarado inconsistente", () => {
  assert.throws(() => validateVehicleDocument(pngBytes(5000, 100, 24), "image/png"), (error) => error.statusCode === 413);
  assert.throws(() => validateVehicleDocument(pngBytes(640, 480), "application/pdf"), (error) => error.statusCode === 415);
  const tolerant = validateVehicleDocument(pngBytes(640, 480), "application/octet-stream");
  assert.equal(tolerant.mime, "image/png");
});

test("objectKey sanea el tenant, acota extensiones y exige identificadores", () => {
  const key = objectKey({ tenantId: "ten/../ant<>", vehicleId: "7", extension: "png" });
  assert.match(key, /^tenant\/vehicles\/7\/[0-9a-f-]{36}\.png$/);
  const fallback = objectKey({ tenantId: "tenant", vehicleId: "7", extension: "exe" });
  assert.match(fallback, /\.bin$/);
  assert.throws(() => objectKey({ tenantId: "", vehicleId: "7", extension: "png" }), (error) => error.statusCode === 400);
  assert.throws(() => objectKey({ tenantId: "tenant", vehicleId: "", extension: "png" }), (error) => error.statusCode === 400);
});

test("storageConfig exige url y clave de servicio", () => {
  withEnv({}, () => {
    assert.throws(() => storageConfig(), (error) => error.statusCode === 503);
  });
  withEnv({ SUPABASE_URL: "https://storage.test/", SUPABASE_SERVICE_ROLE_KEY: "test-service-key" }, () => {
    assert.deepEqual(storageConfig(), { url: "https://storage.test", key: "test-service-key" });
  });
});

test("la carga sube el objeto con cabeceras de servicio y devuelve la ruta del bucket", async () => {
  await withEnv({ SUPABASE_URL: "https://storage.test", SUPABASE_SERVICE_ROLE_KEY: "test-service-key" }, async () => {
    const calls = [];
    await withFetch(async (url, options) => {
      calls.push({ url, options });
      return { ok: true, text: async () => "" };
    }, async () => {
      const bytes = pngBytes(640, 480);
      const storedPath = await uploadVehicleDocument({ objectPath: "tenant/vehicles/7/x.png", bytes, contentType: "image/png" });
      assert.equal(storedPath, "vehicle-documents/tenant/vehicles/7/x.png");
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://storage.test/storage/v1/object/vehicle-documents/tenant/vehicles/7/x.png");
    assert.equal(calls[0].options.method, "POST");
    assert.equal(calls[0].options.headers.apikey, "test-service-key");
    assert.equal(calls[0].options.headers.Authorization, "Bearer test-service-key");
    assert.equal(calls[0].options.headers["x-upsert"], "false");
    assert.equal(calls[0].options.headers["Content-Type"], "image/png");
  });
});

test("signedViewUrl convierte rutas relativas y respeta URLs absolutas", async () => {
  await withEnv({ SUPABASE_URL: "https://storage.test", SUPABASE_SERVICE_ROLE_KEY: "test-service-key" }, async () => {
    const calls = [];
    const relative = await withFetch(async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ signedURL: "/object/sign/vehicle-documents/a/b.png?token=xyz" }) };
    }, () => signedViewUrl("vehicle-documents/a/b.png"));
    assert.equal(relative, "https://storage.test/storage/v1/object/sign/vehicle-documents/a/b.png?token=xyz");
    assert.equal(calls[0].url, "https://storage.test/storage/v1/object/sign/vehicle-documents/a/b.png");
    assert.equal(calls[0].options.body, JSON.stringify({ expiresIn: SIGNED_URL_TTL_SECONDS }));

    const absolute = await withFetch(async () => ({ ok: true, json: async () => ({ signedURL: "https://cdn.test/x.png?sig=1" }) }), () => signedViewUrl("vehicle-documents/a/b.png"));
    assert.equal(absolute, "https://cdn.test/x.png?sig=1");
  });
});

test("un rechazo de Storage se propaga como 502 y una ruta ajena al bucket como 404", async () => {
  await withEnv({ SUPABASE_URL: "https://storage.test", SUPABASE_SERVICE_ROLE_KEY: "test-service-key" }, async () => {
    await withFetch(async () => ({ ok: false, status: 400, text: async () => "invalid" }), async () => {
      await assert.rejects(
        () => uploadVehicleDocument({ objectPath: "tenant/vehicles/7/x.png", bytes: pngBytes(640, 480), contentType: "image/png" }),
        (error) => error.statusCode === 502 && /Storage rechazo la operacion \(400\)/.test(error.message)
      );
    });
    await assert.rejects(
      () => signedViewUrl("other-bucket/a.png"),
      (error) => error.statusCode === 404
    );
  });
});

test("los limites autoritativos permanecen acotados", () => {
  assert.equal(BUCKET, "vehicle-documents");
  assert.equal(MAX_BYTES, 10 * 1024 * 1024);
  assert.equal(MAX_DIMENSION, 4096);
  assert.equal(SIGNED_URL_TTL_SECONDS, 600);
});

test("rutas, servicio y migracion sostienen la cadena de adjuntos vehiculares", () => {
  const routes = fs.readFileSync(path.resolve(__dirname, "../src/modules/transport/routes.js"), "utf8");
  const service = fs.readFileSync(path.resolve(__dirname, "../src/modules/transport/service.js"), "utf8");
  const migration = fs.readFileSync(path.resolve(__dirname, "../../../supabase/migrations/20261008130000_vehicle_documents_storage.sql"), "utf8");
  assert.match(routes, /fastify\.get\("\/transport\/vehicles\/:id\/documents\/:documentId\/view"/);
  assert.match(routes, /fastify\.post\("\/transport\/vehicles\/:id\/documents", \{ preHandler: requirePermission\("transport", "write"\) \}/);
  assert.match(routes, /for await \(const part of request\.parts\(\)\)/);
  assert.match(service, /uploadVehicleDocument\(\{ objectPath, bytes: file\.bytes, contentType: validated\.mime \}\)/);
  assert.match(service, /signedViewUrl\(storagePath\)/);
  assert.match(service, /storage_provider: "supabase"/);
  assert.match(service, /objectKey\(\{ tenantId: user\?\.company_id \|\| tenantId, vehicleId: vehicle\.id, extension: validated\.extension \}\)/);
  assert.match(migration, /\('vehicle-documents', 'vehicle-documents', false, 10485760, array\['application\/pdf', 'image\/png', 'image\/jpeg', 'image\/webp'\]\)/);
  assert.match(migration, /create policy vehicle_documents_storage_select on storage\.objects for select to authenticated/);
  assert.match(migration, /create policy vehicle_documents_storage_admin_write on storage\.objects for all to authenticated/);
});
