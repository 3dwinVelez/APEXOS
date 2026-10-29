const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { missingDocuments } = require("../src/modules/accounting/received-invoices/ingest");

const sha = (value) => crypto.createHash("sha256").update(Buffer.from(value)).digest("hex");

function file(name, kind, content) {
  return { file_name: name, kind, bytes: Buffer.from(content) };
}

test("missingDocuments adjunta todo cuando la factura heredada no tiene documentos", () => {
  const files = [file("factura.xml", "xml", "<Invoice/>"), file("factura.pdf", "pdf", "%PDF-1.4")];

  const missing = missingDocuments([], files);

  assert.deepEqual(missing.map((item) => item.file_name), ["factura.xml", "factura.pdf"]);
});

test("missingDocuments solo completa el archivo que falta", () => {
  const files = [file("factura.xml", "xml", "<Invoice/>"), file("factura.pdf", "pdf", "%PDF-1.4")];

  const missing = missingDocuments([{ checksum_sha256: sha("<Invoice/>") }], files);

  assert.deepEqual(missing.map((item) => item.file_name), ["factura.pdf"]);
});

test("missingDocuments es idempotente cuando los documentos ya estan vinculados", () => {
  const files = [file("factura.xml", "xml", "<Invoice/>"), file("factura.pdf", "pdf", "%PDF-1.4")];
  const existing = files.map((item) => ({ checksum_sha256: sha(item.bytes.toString()) }));

  assert.deepEqual(missingDocuments(existing, files), []);
});

test("missingDocuments ignora documentos repetidos dentro del mismo archivo", () => {
  const files = [
    file("copia/factura.xml", "xml", "<Invoice/>"),
    file("factura.xml", "xml", "<Invoice/>")
  ];

  const missing = missingDocuments([], files);

  assert.equal(missing.length, 1);
});
