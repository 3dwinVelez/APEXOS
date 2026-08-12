const test = require("node:test");
const assert = require("node:assert/strict");
const { assertSafeFile } = require("../src/security/policy");
const { detectFileMime } = require("../src/security/fileSignature");

const samples = {
  "image/jpeg": Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
  "image/png": Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  "image/webp": Buffer.from("RIFF0000WEBP", "ascii"),
  "application/pdf": Buffer.from("%PDF-1.7", "ascii")
};

test("detecta las firmas binarias permitidas", () => {
  for (const [mime, bytes] of Object.entries(samples)) assert.equal(detectFileMime(bytes), mime);
});

test("acepta contenido valido que coincide con MIME y tamano", () => {
  for (const [mime, bytes] of Object.entries(samples)) {
    assert.doesNotThrow(() => assertSafeFile({ mime_type: mime, size_bytes: bytes.length, base64_data: bytes.toString("base64") }));
  }
});

test("rechaza MIME falso, HTML disfrazado, ejecutable, vacio y truncado", () => {
  const invalid = [
    { mime_type: "image/jpeg", size_bytes: 13, base64_data: Buffer.from("<html></html>").toString("base64") },
    { mime_type: "application/pdf", size_bytes: 4, base64_data: Buffer.from("MZ90").toString("base64") },
    { mime_type: "image/png", size_bytes: samples["image/jpeg"].length, base64_data: samples["image/jpeg"].toString("base64") },
    { mime_type: "image/png", size_bytes: 0, base64_data: "data:image/png;base64," },
    { mime_type: "image/png", size_bytes: 3, base64_data: Buffer.from([0x89, 0x50, 0x4e]).toString("base64") }
  ];
  for (const input of invalid) assert.throws(() => assertSafeFile(input));
});

test("rechaza archivos demasiado grandes", () => {
  assert.throws(() => assertSafeFile({
    mime_type: "image/jpeg",
    size_bytes: 2_000,
    base64_data: samples["image/jpeg"].toString("base64")
  }, { maxBytes: 1_000 }));
});
