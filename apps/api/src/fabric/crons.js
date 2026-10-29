const cron = require("node-cron");
let started = false;
const running = {};

// Extraccion de XML de facturas desde el buzon IMAP. Cada buzon aplica su
// propio intervalo (por defecto 30 s); el tick es la cadencia maxima.
const RECEIVED_INVOICE_CRON = "*/30 * * * * *";

async function runOnce(name, fn) {
  if (running[name]) {
    console.warn(`[cron] ${name} skipped — previous execution still running`);
    return;
  }
  running[name] = true;
  const startedAt = Date.now();
  console.info(`[cron] ${name} started`);
  try {
    await fn();
    console.info(`[cron] ${name} completed in ${Date.now() - startedAt}ms`);
  } catch (error) {
    console.error(`[cron] ${name} failed after ${Date.now() - startedAt}ms:`, error.message);
  } finally {
    running[name] = false;
  }
}

function start() {
  if (started) return;
  started = true;

  cron.schedule("0 6 * * *", () => {
    runOnce("scheduleDailyAnalysis", () => require("../modules/brain/brain").scheduleDailyAnalysis());
  });

  cron.schedule("30 5 * * *", () => {
    runOnce("refreshApexHeart", () => require("../modules/apex-heart/service").refreshAllTenants());
  });

  cron.schedule("5 * * * *", () => {
    runOnce("sendApexHeartReports", () => require("../modules/apex-heart/service").runDueReportSchedules());
  });

  cron.schedule("0 2 * * *", () => {
    runOnce("processBilling", async () => {
      const admin = require("../modules/admin/service");
      if (admin.processBilling) await admin.processBilling();
    });
  });

  if (String(process.env.MAILBOX_INGEST_ENABLED || "").toLowerCase() === "true") {
    const configured = Number(process.env.MAILBOX_INGEST_INTERVAL_MINUTES || 15);
    const minutes = Number.isInteger(configured) && configured >= 1 && configured <= 59 ? configured : 15;
    cron.schedule(`*/${minutes} * * * *`, () => {
      runOnce("ingestMailboxAttachments", () => require("../modules/mailbox/ingest-runner").runScheduled());
    });
  }

  // Sincronización de facturas desde carpeta a la base de datos: opt-in.
  if (String(process.env.MAILBOX_INVOICE_SYNC_ENABLED || "").toLowerCase() === "true") {
    const configured = Number(process.env.MAILBOX_INVOICE_SYNC_INTERVAL_MINUTES || 30);
    const minutes = Number.isInteger(configured) && configured >= 1 && configured <= 59 ? configured : 30;
    cron.schedule(`*/${minutes} * * * *`, () => {
      runOnce("syncMailboxInvoiceFolder", () => require("../modules/mailbox/invoice-folder-sync").syncFolder());
    });
  }

  // Recepcion de facturas por IMAP: el buzon se consulta cada 30 s.
  startReceivedInvoiceExtraction();
}

let invoiceStarted = false;

// La consulta IMAP no usa Redis ni colas: debe correr aunque los workers de
// BullMQ esten deshabilitados en el entorno.
function startReceivedInvoiceExtraction() {
  if (invoiceStarted) return;
  invoiceStarted = true;
  cron.schedule(RECEIVED_INVOICE_CRON, () => {
    runOnce("extractReceivedInvoiceXml", () => require("../modules/accounting/received-invoices/mailbox").runScheduled());
  });
}

module.exports = { start, startReceivedInvoiceExtraction, RECEIVED_INVOICE_CRON };

