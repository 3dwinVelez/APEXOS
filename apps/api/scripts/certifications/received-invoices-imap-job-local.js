/*
 * Certificacion LOCAL del job de extraccion de XML de facturas desde el buzon
 * IMAP. El unico limite simulado es el transporte de red: se inyecta un cliente
 * IMAP falso que entrega un correo MIME real con su ZIP (XML + PDF). El
 * planificador node-cron, la seleccion por intervalo, el parseo, el
 * almacenamiento y la insercion en base de datos son los de produccion.
 *
 * El reloj es real: el certificado espera dos ticks de la expresion de
 * produccion (`RECEIVED_INVOICE_CRON`) y mide su separacion.
 *
 * Requiere Postgres local y no arranca servidores. No usa el buzon real.
 * Uso: node scripts/certifications/received-invoices-imap-job-local.js
 */
process.env.NODE_ENV = "test";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const API = path.resolve(__dirname, "../..");
const ROOT = path.resolve(API, "../..");
require("../../src/core/loadEnv")(path.join(ROOT, ".env"));

const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "apexos-invoice-job-"));
process.env.INVOICE_LOCAL_STORAGE_DIR = storageDir;

const { PrismaClient } = require("@prisma/client");
const cron = require("node-cron");
const { syncMailbox, runScheduled, DEFAULT_POLLING_SECONDS } = require("../../src/modules/accounting/received-invoices/mailbox");
const { RECEIVED_INVOICE_CRON } = require("../../src/fabric/crons");
const storage = require("../../src/modules/accounting/received-invoices/storage");
const { buildDemoZip, CUFE } = require("../../test/fixtures/received-invoices/demo-archive");

const evidenceDir = path.resolve(ROOT, "docs/qa/evidence/received-invoices-imap-job-20261029");
const suffix = crypto.randomBytes(5).toString("hex");
const tenantId = `job-invoices-${suffix}`;
const passwordKey = "INVOICE_IMAP_CERT_PASSWORD";
const uidValidity = 9001;
const messageUid = 41;
const checks = [];
const ticks = [];
const runs = [];
const fetched = [];
const db = new PrismaClient();
let task = null;

function check(name, ok, details = {}) {
  checks.push({ name, status: ok ? "passed" : "failed", ...(ok ? { details } : { failure: details }) });
  console.log(`${ok ? "OK  " : "FAIL"} ${name}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(probe, timeoutMs, label) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await probe();
    if (value) return value;
    await sleep(500);
  }
  throw new Error(`Tiempo de espera agotado esperando: ${label}`);
}

// Correo MIME real con el ZIP de demostracion como adjunto en base64.
async function buildMessageSource() {
  const zip = await buildDemoZip();
  const base64 = zip.toString("base64").replace(/(.{76})/g, "$1\r\n");
  return Buffer.from([
    "From: Proveedor Certificado <proveedor@cert.local>",
    "To: facturas@cert.local",
    "Subject: Factura electronica certificada",
    "Date: Thu, 29 Oct 2026 12:00:00 -0500",
    `Message-ID: <job-cert-${suffix}@cert.local>`,
    "MIME-Version: 1.0",
    'Content-Type: multipart/mixed; boundary="apexos-cert"',
    "",
    "--apexos-cert",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "Adjunto la factura electronica del periodo.",
    "--apexos-cert",
    'Content-Type: application/zip; name="FV-JOB-000123.zip"',
    'Content-Disposition: attachment; filename="FV-JOB-000123.zip"',
    "Content-Transfer-Encoding: base64",
    "",
    base64,
    "--apexos-cert--",
    ""
  ].join("\r\n"), "utf8");
}

function fakeClientFactory(source) {
  return () => ({
    mailbox: null,
    async connect() {},
    async getMailboxLock(folder) {
      this.mailbox = { path: folder, uidValidity };
      return { release() {} };
    },
    async search() {
      return [messageUid];
    },
    async fetchOne(uid) {
      fetched.push(uid);
      return Number(uid) === messageUid ? { source } : null;
    },
    async logout() {}
  });
}

async function seed() {
  await db.tenant.create({
    data: {
      id: tenantId,
      name: "Job facturas IMAP",
      active_modules: ["M-07"],
      config: {},
      country: "CO",
      currency: "COP"
    }
  });
  process.env[passwordKey] = "cert-secret";
  return db.invoiceMailConfig.create({
    data: {
      tenant_id: tenantId,
      provider: "imap",
      host: "imap.cert.local",
      port: 993,
      secure: true,
      username: "facturas@cert.local",
      password_env_key: passwordKey,
      folder: "Facturas",
      polling_seconds: DEFAULT_POLLING_SECONDS,
      enabled: true,
      last_synced_at: new Date(Date.now() - 31000)
    }
  });
}

async function cleanup() {
  if (task) task.stop();
  const tables = [
    "receivedInvoiceDocument", "receivedInvoiceAssignment", "receivedInvoiceChangeLog",
    "invoiceProcessingError", "receivedInvoice", "invoiceProcessedEmail",
    "invoiceSupplier", "invoiceRecipient", "invoiceMailConfig"
  ];
  for (const model of tables) await db[model].deleteMany({ where: { tenant_id: tenantId } }).catch(() => {});
  await db.tenant.deleteMany({ where: { id: tenantId } }).catch(() => {});
  await db.$disconnect().catch(() => {});
  fs.rmSync(storageDir, { recursive: true, force: true });
}

async function main() {
  const startedAt = new Date().toISOString();
  const source = await buildMessageSource();
  await seed();

  check("El job usa la expresion de produccion cada 30 segundos",
    RECEIVED_INVOICE_CRON === "*/30 * * * * *" && cron.validate(RECEIVED_INVOICE_CRON) === true,
    { expression: RECEIVED_INVOICE_CRON, valid: cron.validate(RECEIVED_INVOICE_CRON) });

  // El callback del cron usa el mismo runScheduled de produccion; solo se
  // sustituye el cliente IMAP por uno local que entrega el MIME preparado.
  const createClient = fakeClientFactory(source);
  task = cron.schedule(RECEIVED_INVOICE_CRON, async () => {
    const at = new Date().toISOString();
    ticks.push(at);
    try {
      const results = await runScheduled({
        tenantId,
        sync: (options) => syncMailbox({ ...options, createClient })
      });
      runs.push({ at, results });
    } catch (error) {
      runs.push({ at, error: error.message });
    }
  });

  const invoice = await waitFor(
    () => db.receivedInvoice.findFirst({ where: { tenant_id: tenantId } }),
    45000,
    "primera corrida del job"
  );
  await waitFor(() => db.invoiceProcessedEmail.findFirst({ where: { tenant_id: tenantId, status: "processed" } }), 15000, "correo procesado");
  const firstRun = runs.find((entry) => entry.results?.length)?.results[0] || {};
  check("La primera corrida del job extrae el XML del correo e inserta la factura",
    invoice.full_number === "FV-2026-000123"
    && invoice.cufe === CUFE
    && Number(invoice.total) === 1190000
    && firstRun.created === 1
    && firstRun.pending === 1,
    { invoice: { full_number: invoice.full_number, total: invoice.total, cufe: invoice.cufe }, firstRun, ticks });

  const documents = await db.receivedInvoiceDocument.findMany({ where: { invoice_id: invoice.id } });
  const storedReadable = [];
  for (const document of documents) {
    try {
      const read = await storage.readDocument(tenantId, document.storage_reference);
      storedReadable.push({ type: document.document_type, bytes: read.bytes.length });
    } catch (error) {
      storedReadable.push({ type: document.document_type, error: error.message });
    }
  }
  check("La factura conserva el XML y el PDF extraidos del ZIP del correo",
    documents.length === 2
    && documents.some((document) => document.document_type === "xml")
    && documents.some((document) => document.document_type === "pdf")
    && invoice.xml_available === true && invoice.pdf_available === true
    && storedReadable.every((entry) => !entry.error && entry.bytes > 0),
    { documents: documents.map((document) => ({ type: document.document_type, name: document.file_name })), storedReadable });

  // Se fuerza que el buzon vuelva a quedar vencido para observar el siguiente
  // tick real del cron, sin esperar al intervalo completo.
  await db.invoiceMailConfig.update({ where: { tenant_id: tenantId }, data: { last_synced_at: new Date(Date.now() - 31000) } });
  await waitFor(() => runs.length >= 2, 45000, "segunda corrida del job");
  // Ojo: count() devuelve una promesa; comparar sin await siempre seria false.
  await waitFor(async () => (await db.invoiceProcessedEmail.count({ where: { tenant_id: tenantId } })) >= 1, 5000, "correo en base");

  const gapMs = ticks.length >= 2 ? Date.parse(ticks[1]) - Date.parse(ticks[0]) : 0;
  check("El job vuelve a consultar el buzon en el siguiente ciclo de 30 segundos",
    ticks.length >= 2 && gapMs >= 25000 && gapMs <= 40000,
    { ticks, gapMs });

  const secondRun = runs[1]?.results?.[0] || {};
  const invoiceCount = await db.receivedInvoice.count({ where: { tenant_id: tenantId } });
  const config = await db.invoiceMailConfig.findUnique({ where: { tenant_id: tenantId } });
  check("La segunda consulta no duplica la factura ni vuelve a descargar el correo",
    invoiceCount === 1
    && fetched.length === 1
    && secondRun.pending === 0
    && secondRun.created === 0,
    { invoiceCount, fetched, secondRun });

  check("El buzon registra la ultima consulta sin errores",
    Boolean(config?.last_synced_at) && config.last_error === null,
    { last_synced_at: config?.last_synced_at, last_error: config?.last_error });

  const passed = checks.filter((item) => item.status === "passed").length;
  const results = {
    suite: "received-invoices-imap-job",
    mode: "local",
    executed_at: startedAt,
    tenant_id: tenantId,
    cron_expression: RECEIVED_INVOICE_CRON,
    polling_seconds: DEFAULT_POLLING_SECONDS,
    transport: "imap simulado en el cliente de red; planificador, parseo, almacenamiento e insercion reales",
    total: checks.length,
    passed,
    failed: checks.length - passed,
    ticks,
    runs,
    fetched_uids: fetched,
    checks
  };
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, "job-certification.json"), JSON.stringify(results, null, 2));
  console.log(`Certificacion job IMAP facturas: ${passed}/${checks.length} verificaciones.`);
  console.log(`Evidencia: ${path.relative(ROOT, path.join(evidenceDir, "job-certification.json"))}`);
  if (passed !== checks.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    const passed = checks.filter((item) => item.status === "passed").length;
    const results = {
      suite: "received-invoices-imap-job",
      executed_at: new Date().toISOString(),
      tenant_id: tenantId,
      cron_expression: RECEIVED_INVOICE_CRON,
      total: checks.length,
      passed,
      failed: checks.length - passed,
      error: String(error && error.message || error),
      ticks,
      runs,
      fetched_uids: fetched,
      checks
    };
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(path.join(evidenceDir, "job-certification.json"), JSON.stringify(results, null, 2));
    console.error(error);
    process.exitCode = 1;
  })
  .finally(cleanup);
