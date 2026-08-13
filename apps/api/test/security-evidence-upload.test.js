const test = require("node:test");
const assert = require("node:assert/strict");
const { detectedMime, dimensions, localOrderWhere, assertOrderAccess, MAX_BYTES, MAX_DIMENSION } = require("../src/modules/services/evidenceUploads");

test("detecta PNG por firma y extrae dimensiones", () => {
  const bytes = Buffer.alloc(32);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
  bytes.writeUInt32BE(640, 16);
  bytes.writeUInt32BE(480, 20);
  assert.equal(detectedMime(bytes), "image/png");
  assert.deepEqual(dimensions(bytes, "image/png"), { width: 640, height: 480 });
});

test("rechaza contenido HTML aunque se declare como imagen", () => {
  const bytes = Buffer.from("<html><script>alert(1)</script></html>");
  assert.equal(detectedMime(bytes), null);
});

test("los limites autoritativos permanecen acotados", () => {
  assert.equal(MAX_BYTES, 2 * 1024 * 1024);
  assert.equal(MAX_DIMENSION, 4096);
});

test("la evidencia vincula identidades locales y externas al tenant", () => {
  assert.deepEqual(localOrderWhere("tenant-nyvora", "27"), { tenant_id: "tenant-nyvora", id: 27 });
  const external = "59c29060-b581-405d-a4b0-ed9ae910da24";
  const where = localOrderWhere("tenant-nyvora", external);
  assert.equal(where.tenant_id, "tenant-nyvora");
  assert.equal(where.OR[0].metadata.equals, external);
  assert.equal(where.OR[1].metadata.equals, external);
});

test("la autorizacion numerica devuelve la identidad canonica local", async () => {
  const queries = [];
  const db = { serviceOrder: { findFirst: async (query) => { queries.push(query); return { id: 27 }; } } };
  const result = await assertOrderAccess("tenant-nyvora", { id: 9, company_id: "company-nyvora" }, "27", db);
  assert.deepEqual(result, { companyId: "company-nyvora", localOrderId: 27 });
  assert.equal(queries[0].where.tenant_id, "tenant-nyvora");
});

test("la autorizacion UUID tambien devuelve la identidad canonica local", async () => {
  const external = "59c29060-b581-405d-a4b0-ed9ae910da24";
  const db = { serviceOrder: { findFirst: async ({ where }) => {
    assert.equal(where.tenant_id, "tenant-nyvora");
    assert.equal(where.OR[0].metadata.equals, external);
    return { id: 54 };
  } } };
  const result = await assertOrderAccess("tenant-nyvora", { id: 9, company_id: "company-nyvora" }, external, db);
  assert.deepEqual(result, { companyId: "company-nyvora", localOrderId: 54 });
});

test("una orden de otro tenant no puede autorizar evidencia", async () => {
  const db = { serviceOrder: { findFirst: async () => null } };
  await assert.rejects(
    () => assertOrderAccess("tenant-ajeno", { id: 9 }, "54", db),
    (error) => error.statusCode === 404
  );
});
