const test = require("node:test");
const assert = require("node:assert/strict");
const { detectedMime, dimensions, MAX_BYTES, MAX_DIMENSION } = require("../src/modules/services/evidenceUploads");

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
