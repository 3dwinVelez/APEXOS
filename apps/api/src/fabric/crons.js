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
    await recordRun(name, "ok", Date.now() - startedAt);
  } catch (error) {
    console.error(`[cron] ${name} failed after ${Date.now() - startedAt}ms:`, error.message);
    await recordRun(name, "failed", Date.now() - startedAt);
  } finally {
    running[name] = false;
  }
}

async function recordRun(name, status, durationMs) {
  try {
    await require("../modules/apex-control/events").recordCronRun(name, status, durationMs);
  } catch (error) {
    console.warn(`[cron] no se pudo registrar ${name} en APEX Control: ${error.message}`);
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

const APEX_CONTROL_PULSE_CRON = "*/15 * * * * *";
let apexControlStarted = false;

function envInteger(name, fallback, min, max) {
  const value = Number(process.env[name]);
  if (!Number.isInteger(value) || value < min || value > max) return fallback;
  return value;
}

// El pulso corre en proceso (no en la ruta de una peticion). El envio del
// briefing y la limpieza usan la zona horaria de la empresa matriz.
function startApexControl() {
  if (apexControlStarted) return null;
  apexControlStarted = true;
  if (String(process.env.APEX_CONTROL_ENABLED || "true").toLowerCase() === "false") {
    console.info("[apex-control] deshabilitado por APEX_CONTROL_ENABLED=false");
    return null;
  }

  const pulse = require("../modules/apex-control/pulse").createPulse({
    intervalMs: Number(process.env.APEX_CONTROL_PULSE_MS || 15000)
  });
  const report = require("../modules/apex-control/report");
  const timezone = process.env.APEX_CONTROL_REPORT_TZ || "America/Bogota";
  const reportHour = envInteger("APEX_CONTROL_REPORT_HOUR", 7, 0, 23);
  const reportMinute = envInteger("APEX_CONTROL_REPORT_MINUTE", 0, 0, 59);
  const cleanupMinute = envInteger("APEX_CONTROL_CLEANUP_MINUTE", 30, 0, 59);

  cron.schedule(APEX_CONTROL_PULSE_CRON, () => {
    runOnce("apexControlPulse", () => pulse.runOnce());
  });

  cron.schedule(`${reportMinute} ${reportHour} * * *`, () => {
    runOnce("apexControlDailyReport", () => report.sendDailyBriefing());
  }, { timezone });

  cron.schedule(`${cleanupMinute} 3 * * *`, () => {
    runOnce("apexControlCleanup", () => report.cleanupRetention());
  }, { timezone });

  console.info(`[apex-control] pulso cada 15 s; reporte diario ${String(reportHour).padStart(2, "0")}:${String(reportMinute).padStart(2, "0")} ${timezone}`);
  return pulse;
}

module.exports = {
  start,
  startReceivedInvoiceExtraction,
  startApexControl,
  RECEIVED_INVOICE_CRON,
  APEX_CONTROL_PULSE_CRON
};

