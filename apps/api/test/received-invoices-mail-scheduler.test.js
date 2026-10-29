const test = require("node:test");
const assert = require("node:assert/strict");

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://apex@localhost:55432/apexos";

const { dueConfigs, pollingSecondsFor, processedUidSet, SCHEDULE_GRACE_MS } = require("../src/modules/accounting/received-invoices/mailbox");
const { RECEIVED_INVOICE_CRON } = require("../src/fabric/crons");
const cron = require("node-cron");

const NOW = Date.parse("2026-10-29T12:00:00.000Z");
const secondsAgo = (seconds) => new Date(NOW - seconds * 1000).toISOString();

test("el job de facturas se programa cada 30 segundos con una expresion valida", () => {
  assert.equal(RECEIVED_INVOICE_CRON, "*/30 * * * * *");
  assert.equal(cron.validate(RECEIVED_INVOICE_CRON), true);
});

test("la extraccion arranca sin Redis y no duplica el temporizador", async () => {
  const crons = require("../src/fabric/crons");
  assert.equal(typeof crons.startReceivedInvoiceExtraction, "function");
  crons.startReceivedInvoiceExtraction();
  crons.startReceivedInvoiceExtraction();
  const scheduled = [...cron.getTasks().values()].filter((task) => task.cronExpression === RECEIVED_INVOICE_CRON);
  assert.equal(scheduled.length, 1);
  for (const task of scheduled) await task.destroy();
});

test("un buzon sin sincronizar queda pendiente en el primer tick", () => {
  const due = dueConfigs([{ enabled: true, polling_seconds: 30, last_synced_at: null }], NOW);
  assert.equal(due.length, 1);
});

test("el intervalo se respeta con gracia para el desfase del planificador", () => {
  assert.equal(dueConfigs([{ enabled: true, polling_seconds: 30, last_synced_at: secondsAgo(30) }], NOW).length, 1);
  assert.equal(dueConfigs([{ enabled: true, polling_seconds: 30, last_synced_at: secondsAgo(10) }], NOW).length, 0);
  assert.equal(dueConfigs([{ enabled: true, polling_seconds: 60, last_synced_at: secondsAgo(50) }], NOW).length, 0);
  assert.equal(dueConfigs([{ enabled: true, polling_seconds: 60, last_synced_at: secondsAgo(56) }], NOW).length, 1);
  assert.equal(dueConfigs([{ enabled: true, polling_seconds: 30, last_synced_at: new Date(NOW - 30000 + SCHEDULE_GRACE_MS).toISOString() }], NOW).length, 1);
});

test("los buzones deshabilitados nunca entran al job", () => {
  assert.equal(dueConfigs([{ enabled: false, polling_seconds: 30, last_synced_at: null }], NOW).length, 0);
});

test("el intervalo en segundos se limita al rango operativo", () => {
  assert.equal(pollingSecondsFor({ polling_seconds: 30 }), 30);
  assert.equal(pollingSecondsFor({ polling_seconds: 5 }), 10);
  assert.equal(pollingSecondsFor({ polling_seconds: 7200 }), 3600);
  assert.equal(pollingSecondsFor({}), 30);
  assert.equal(pollingSecondsFor({ polling_seconds: "no-numero" }), 30);
});

test("los UID ya procesados se omiten y los fallos recientes no se martillan", () => {
  const rows = [
    { message_key: "imap:77:7:aaa", status: "processed", processed_at: secondsAgo(120) },
    { message_key: "imap:77:8:bbb", status: "error", processed_at: secondsAgo(60) },
    { message_key: "imap:77:9:ccc", status: "error", processed_at: secondsAgo(3600) },
    { message_key: "imap:77:10:ddd", status: "processing", processed_at: null },
    { message_key: "imap:66:11:eee", status: "processed", processed_at: secondsAgo(120) }
  ];
  const skip = processedUidSet(rows, "77", NOW);
  assert.equal(skip.has("7"), true);
  assert.equal(skip.has("8"), true);
  assert.equal(skip.has("9"), false);
  assert.equal(skip.has("10"), false);
  assert.equal(skip.has("11"), false);
});
