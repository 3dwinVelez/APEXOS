const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://apex@localhost:55432/apexos";
const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "apexos-invoice-storage-test-"));
process.env.INVOICE_LOCAL_STORAGE_DIR = storageDir;

const { validateMailConfig, messageKeyFor, isZipAttachment, zipAttachments } = require("../src/modules/accounting/received-invoices/mailbox");
const storage = require("../src/modules/accounting/received-invoices/storage");

test.after(() => fs.rmSync(storageDir, { recursive: true, force: true }));

test("la configuracion IMAP aplica valores seguros por defecto", () => {
  const config = validateMailConfig({ host: "IMAP.Empresa.COM", username: "facturas@empresa.com" });
  assert.equal(config.provider, "imap");
  assert.equal(config.host, "imap.empresa.com");
  assert.equal(config.port, 993);
  assert.equal(config.secure, true);
  assert.equal(config.folder, "INBOX");
  assert.equal(config.password_env_key, "INVOICE_IMAP_PASSWORD");
  assert.equal(config.polling_seconds, 30);
  assert.equal(config.enabled, false);
});

test("la configuracion IMAP solo acepta el nombre de una variable de entorno valida", () => {
  assert.throws(
    () => validateMailConfig({ host: "imap.empresa.com", username: "facturas@empresa.com", password_env_key: "clave-invalida" }),
    (error) => error.code === "INVOICE_MAIL_CONFIG_INVALID"
  );
  assert.throws(
    () => validateMailConfig({ host: "imap.empresa.com", username: "facturas@empresa.com", password_env_key: "" }),
    (error) => error.code === "INVOICE_MAIL_CONFIG_INVALID"
  );
});

test("la configuracion IMAP rechaza host, puerto, carpeta e intervalo invalidos", () => {
  assert.throws(() => validateMailConfig({ username: "facturas@empresa.com" }), (error) => error.code === "INVOICE_MAIL_CONFIG_INVALID");
  assert.throws(() => validateMailConfig({ host: "imap empresa", username: "facturas@empresa.com" }), (error) => error.code === "INVOICE_MAIL_CONFIG_INVALID");
  assert.throws(() => validateMailConfig({ host: "imap.empresa.com", username: "facturas@empresa.com", port: 70000 }), (error) => error.code === "INVOICE_MAIL_CONFIG_INVALID");
  assert.throws(() => validateMailConfig({ host: "imap.empresa.com", username: "facturas@empresa.com", folder: "INBOX\u0001" }), (error) => error.code === "INVOICE_MAIL_CONFIG_INVALID");
  assert.throws(() => validateMailConfig({ host: "imap.empresa.com", username: "facturas@empresa.com", polling_seconds: 5 }), (error) => error.code === "INVOICE_MAIL_CONFIG_INVALID");
  assert.throws(() => validateMailConfig({ host: "imap.empresa.com", username: "facturas@empresa.com", polling_seconds: 3601 }), (error) => error.code === "INVOICE_MAIL_CONFIG_INVALID");
});

test("el modulo solo lee correo por IMAP y no por SMTP ni Graph", () => {
  assert.throws(
    () => validateMailConfig({ provider: "graph", host: "graph.microsoft.com", username: "facturas@empresa.com" }),
    (error) => error.code === "INVOICE_MAIL_CONFIG_INVALID"
  );
});

test("la clave de mensaje IMAP es estable y no depende del contenido del ZIP", () => {
  const key = messageKeyFor({ uidValidity: "42", uid: "7", checksum: "abcdef0123456789ffff" });
  assert.equal(key, "imap:42:7:abcdef0123456789");
  assert.equal(messageKeyFor({ uidValidity: "42", uid: "7", checksum: "abcdef0123456789ffff" }), key);
  assert.notEqual(messageKeyFor({ uidValidity: "42", uid: "8", checksum: "abcdef0123456789ffff" }), key);
  assert.equal(messageKeyFor({}), "imap:0::");
});

test("solo se consideran ZIP los adjuntos por nombre, tipo o firma", () => {
  assert.equal(isZipAttachment({ filename: "facturas.ZIP" }), true);
  assert.equal(isZipAttachment({ filename: "datos.bin", contentType: "application/x-zip-compressed" }), true);
  assert.equal(isZipAttachment({ filename: "datos.bin", content: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14]) }), true);
  assert.equal(isZipAttachment({ filename: "factura.pdf", contentType: "application/pdf", content: Buffer.from("%PDF-") }), false);
  assert.equal(isZipAttachment({ filename: "imagen.png", content: Buffer.from([0x89, 0x50, 0x4e, 0x47]) }), false);
});

test("los adjuntos ZIP se normalizan y descartan los que no lo son", () => {
  const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]);
  const attachments = zipAttachments([
    { filename: "..\\facturas/facturas.zip", contentType: "application/zip", content: zip, size: zip.length },
    { filename: "factura.pdf", content: Buffer.from("%PDF-1.4") },
    null
  ]);
  assert.equal(attachments.length, 1);
  assert.equal(attachments[0].fileName, ".._facturas_facturas.zip");
  assert.ok(Buffer.isBuffer(attachments[0].bytes));
  assert.equal(attachments[0].size, zip.length);
});

test("la referencia de almacenamiento acepta solo el tenant activo y tipos permitidos", () => {
  const reference = "invoice-documents/acme/2026/10/0123456789abcdef-FV-2026-000123.xml";
  assert.equal(storage.referencedObjectName("acme", reference), "acme/2026/10/0123456789abcdef-FV-2026-000123.xml");
  assert.throws(() => storage.referencedObjectName("otra", reference), (error) => error.code === "INVOICE_STORAGE_FORBIDDEN");
  assert.throws(() => storage.referencedObjectName("acme", "invoice-documents/acme/2026/../../secreto.xml"), (error) => error.code === "INVOICE_STORAGE_FORBIDDEN");
  assert.throws(() => storage.referencedObjectName("acme", "invoice-documents/acme/2026/10/archivo.exe"), (error) => error.code === "INVOICE_STORAGE_FORBIDDEN");
});

test("los documentos se guardan y leen desde el almacenamiento del tenant", async () => {
  const xml = Buffer.from("<Invoice><ID>FV-1</ID></Invoice>", "utf8");
  const stored = await storage.putDocument({ tenantId: "acme", fileName: "FV-1.xml", bytes: xml, kind: "xml" });
  assert.ok(stored.storage_reference.startsWith("invoice-documents/acme/"));
  assert.equal(stored.mime_type, "application/xml");
  assert.equal(stored.size_bytes, xml.length);
  assert.equal(await storage.documentExists("acme", stored.storage_reference), true);
  const read = await storage.readDocument("acme", stored.storage_reference);
  assert.equal(read.mime_type, "application/xml");
  assert.equal(read.bytes.toString("utf8"), xml.toString("utf8"));
  await assert.rejects(storage.readDocument("otro", stored.storage_reference), (error) => error.code === "INVOICE_STORAGE_FORBIDDEN");
});
