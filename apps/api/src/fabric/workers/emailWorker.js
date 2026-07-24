const { isRedisDisabled } = require("../redisConfig");

if (isRedisDisabled()) {
  console.info("[emailWorker] Redis disabled - worker disabled");
  module.exports = null;
  return;
}

const { Worker } = require("bullmq");
const { connection } = require("../queues");
const nodemailer = require("nodemailer");

if (!connection) {
  console.info("[emailWorker] Redis disabled - worker disabled");
  module.exports = null;
  return;
}

const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const FROM_ADDRESS = process.env.SMTP_FROM || SMTP_USER || "noreply@apexos.com";

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.warn("[emailWorker] SMTP no configurado. Los emails no se enviaran.");
    return null;
  }
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
  return transporter;
}

module.exports = new Worker("apex-email", async (job) => {
  try {
    const t = getTransporter();
    if (!t) {
      console.warn(`[emailWorker] job ${job.id}: email no enviado (SMTP no configurado)`);
      return { sent: false, reason: "SMTP_NOT_CONFIGURED", tenant_id: job.data?.tenant_id };
    }
    const { to, subject, html, text, attachments } = job.data || {};
    if (!to || !subject) {
      throw new Error("Faltan campos requeridos: to, subject");
    }
    const info = await t.sendMail({
      from: FROM_ADDRESS,
      to,
      subject,
      text,
      html: html || text,
      attachments
    });
    console.info(`[emailWorker] job ${job.id}: email enviado a ${to} (messageId: ${info.messageId})`);
    return { sent: true, messageId: info.messageId, tenant_id: job.data?.tenant_id };
  } catch (error) {
    console.error(`[emailWorker] job ${job.id} failed:`, error.message);
    throw error;
  }
}, { connection });
