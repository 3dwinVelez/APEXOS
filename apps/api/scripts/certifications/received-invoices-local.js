/*
 * Certificacion local end-to-end del modulo de recepcion y asignacion de
 * facturas electronicas. Ejercita el flujo completo por HTTP real de Fastify:
 * ZIP -> extraccion XML/PDF -> deduplicacion -> bandeja -> visor -> asignacion
 * -> aprobacion, con evidencia versionada.
 */
process.env.NODE_ENV = "test";
process.env.DISABLE_BACKGROUND_WORKERS = "true";
process.env.REDIS_DISABLED = "true";
process.env.REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
process.env.JWT_SECRET = process.env.JWT_SECRET || "received-invoices-certification-secret-2026";
require("../../src/core/loadEnv")();

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const JSZip = require("jszip");
const { PrismaClient } = require("@prisma/client");
const { sign } = require("../../src/security/jwt");
const { buildInvoiceXml, buildInvoicePdf } = require("../../test/fixtures/received-invoices/demo-archive");

const suffix = crypto.randomBytes(5).toString("hex");
const tenantId = `invoices-cert-${suffix}`;
const otherTenantId = `invoices-cert-other-${suffix}`;
const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "apexos-invoices-cert-"));
process.env.INVOICE_LOCAL_STORAGE_DIR = storageDir;

const db = new PrismaClient();
const checks = [];
const evidencePath = process.env.RECEIVED_INVOICES_EVIDENCE_PATH
  || path.resolve(__dirname, "../../../../docs/qa/evidence/received-invoices-20261028/certification.json");

function check(name, ok, details = {}) {
  checks.push({ ...details, name, status: ok ? "passed" : "failed" });
  if (!ok) throw new Error(`Certificacion fallida: ${name}`);
}

function auth(tenant = tenantId, userId, roleName = "APEX_ADMIN", actions = ["read", "write", "approve"]) {
  return `Bearer ${sign({
    id: userId,
    tenant_id: tenant,
    role: {
      name: roleName,
      permissions: actions.map((action) => ({ module: "accounting", action }))
    }
  })}`;
}

function multipart(buffer, filename = "facturas.zip", contentType = "application/zip") {
  const boundary = `----apex-invoices-${suffix}`;
  const head = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`;
  return {
    body: Buffer.concat([Buffer.from(head), buffer, Buffer.from(`\r\n--${boundary}--\r\n`)]),
    contentType: `multipart/form-data; boundary=${boundary}`
  };
}

async function upload(app, token, buffer, filename = "facturas.zip") {
  const form = multipart(buffer, filename);
  return app.inject({
    method: "POST",
    url: "/api/v1/accounting/received-invoices/upload",
    headers: { authorization: token, "content-type": form.contentType },
    payload: form.body
  });
}

async function json(app, token, method, url, payload) {
  const response = await app.inject({
    method,
    url: `/api/v1${url}`,
    headers: { authorization: token, ...(payload ? { "content-type": "application/json" } : {}) },
    payload: payload ? JSON.stringify(payload) : undefined
  });
  let body = null;
  try { body = response.json(); } catch { body = response.body; }
  return { status: response.statusCode, body, headers: response.headers, raw: response.rawPayload };
}

async function buildArchive(name, { xml = true, pdf = true, pdfOverrides = {}, xmlOverrides = {}, extra = {} } = {}) {
  const zip = new JSZip();
  if (xml) zip.file(`${name}.xml`, buildInvoiceXml(xmlOverrides));
  if (pdf) zip.file(`${name}.pdf`, buildInvoicePdf(pdfOverrides));
  for (const [entry, content] of Object.entries(extra)) zip.file(entry, content);
  return zip.generateAsync({ type: "nodebuffer" });
}

async function seed() {
  const config = { accounting: { organization_tree: { societies: [], branches: [], cost_centers: [] } } };
  await db.tenant.createMany({
    data: [
      { id: tenantId, name: "Cert facturas recibidas", active_modules: ["M-07"], config, country: "CO", currency: "COP" },
      { id: otherTenantId, name: "Cert facturas otra empresa", active_modules: ["M-07"], config, country: "CO", currency: "COP" }
    ]
  });
  const role = await db.role.create({ data: { tenant_id: tenantId, name: "APEX_ADMIN", is_system: true } });
  const analystRole = await db.role.create({ data: { tenant_id: tenantId, name: "ANALISTA_CONTABLE" } });
  await db.permission.createMany({
    data: ["read", "write"].map((action) => ({ role_id: analystRole.id, module: "accounting", action }))
  });
  const otherRole = await db.role.create({ data: { tenant_id: otherTenantId, name: "APEX_ADMIN", is_system: true } });
  const user = await db.user.create({
    data: { tenant_id: tenantId, name: "Lider Contabilidad", email: `leader-${suffix}@cert.local`, password: "unused", role_id: role.id }
  });
  const responsible = await db.user.create({
    data: { tenant_id: tenantId, name: "Analista de cuentas", email: `analyst-${suffix}@cert.local`, password: "unused", role_id: role.id }
  });
  const analyst = await db.user.create({
    data: { tenant_id: tenantId, name: "Analista sin aprobacion", email: `clerk-${suffix}@cert.local`, password: "unused", role_id: analystRole.id }
  });
  const otherUser = await db.user.create({
    data: { tenant_id: otherTenantId, name: "Otro tenant", email: `other-${suffix}@cert.local`, password: "unused", role_id: otherRole.id }
  });
  return { userId: user.id, responsibleId: responsible.id, analystId: analyst.id, otherUserId: otherUser.id };
}

async function cleanup() {
  const tables = [
    "receivedInvoiceDocument", "receivedInvoiceAssignment", "receivedInvoiceChangeLog",
    "invoiceProcessingError", "receivedInvoice", "invoiceProcessedEmail",
    "invoiceSupplier", "invoiceRecipient", "invoiceMailConfig"
  ];
  for (const tenant of [tenantId, otherTenantId]) {
    for (const model of tables) {
      await db[model].deleteMany({ where: { tenant_id: tenant } }).catch(() => {});
    }
    await db.user.deleteMany({ where: { tenant_id: tenant } });
    await db.role.deleteMany({ where: { tenant_id: tenant } });
    await db.tenant.deleteMany({ where: { id: tenant } });
  }
  fs.rmSync(storageDir, { recursive: true, force: true });
}

async function main() {
  const users = await seed();
  const running = await require("../../server")();
  await running.ready();
  try {
    const token = auth(tenantId, users.userId);
    const otherToken = auth(otherTenantId, users.otherUserId);

    const archiveA = await buildArchive("FV-2026-000123");
    const uploaded = await upload(running, token, archiveA);
    check("ZIP con XML y PDF se procesa y crea la factura", uploaded.statusCode === 201, { status: uploaded.statusCode, body: uploaded.json() });
    const uploadBody = uploaded.json();
    assert.equal(uploadBody.summary.created, 1);
    const invoiceId = uploadBody.invoices[0].id;
    check("El resumen reporta una factura creada sin errores", uploadBody.summary.created === 1 && uploadBody.errors.length === 0);

    const list = await json(running, token, "GET", "/accounting/received-invoices?page=1&page_size=25");
    check("La bandeja lista la factura con numero, proveedor, NIT y total", list.status === 200 && list.body.meta.total === 1
      && list.body.data[0].full_number === "FV-2026-000123"
      && list.body.data[0].issuer_name === "Distribuciones Andinas SAS"
      && list.body.data[0].issuer_tax_id === "900123456"
      && list.body.data[0].total === 1190000, { status: list.status, body: list.body });

    const filtered = await json(running, token, "GET", "/accounting/received-invoices?nit=900123456&number=000123&supplier=Andinas");
    check("Los filtros por NIT, numero y proveedor encuentran la factura", filtered.body.meta.total === 1);

    const summary = await json(running, token, "GET", "/accounting/received-invoices/summary");
    check("Los indicadores reflejan recibidas y pendientes", summary.body.received === 1 && summary.body.pending_assignment === 1 && summary.body.processed === 0, summary.body);

    const detail = await json(running, token, "GET", `/accounting/received-invoices/${invoiceId}`);
    const invoice = detail.body;
    check("El detalle expone datos fiscales extraidos del XML", detail.status === 200
      && invoice.cufe.startsWith("3f1c9a2b")
      && invoice.issuer_tax_id === "900123456"
      && invoice.receiver_tax_id === "901555777"
      && invoice.subtotal === 1000000
      && invoice.iva === 190000
      && invoice.total === 1190000
      && invoice.currency === "COP"
      && invoice.issue_date.slice(0, 10) === "2026-10-20"
      && invoice.needs_review === false, { invoice: { full_number: invoice.full_number, total: invoice.total, issues: invoice.validation_issues } });
    check("El detalle incluye documentos XML y PDF mas el historial", invoice.documents.length === 2
      && invoice.documents.some((doc) => doc.document_type === "xml" && doc.mime_type === "application/xml")
      && invoice.documents.some((doc) => doc.document_type === "pdf" && doc.mime_type === "application/pdf")
      && invoice.change_logs.some((log) => log.action === "received"));

    const xmlDoc = invoice.documents.find((doc) => doc.document_type === "xml");
    const pdfDoc = invoice.documents.find((doc) => doc.document_type === "pdf");
    const xmlFile = await json(running, token, "GET", `/accounting/received-invoices/${invoiceId}/documents/${xmlDoc.id}/file`);
    check("El XML original se descarga con su tipo y contenido", xmlFile.status === 200
      && String(xmlFile.headers["content-type"]).includes("xml")
      && Buffer.from(xmlFile.raw).toString("utf8").includes("FV-2026-000123"), {
      status: xmlFile.status,
      contentType: xmlFile.headers["content-type"],
      head: Buffer.from(xmlFile.raw || []).subarray(0, 120).toString("utf8")
    });
    const pdfFile = await json(running, token, "GET", `/accounting/received-invoices/${invoiceId}/documents/${pdfDoc.id}/file`);
    check("El PDF original se descarga para el visor", pdfFile.status === 200
      && String(pdfFile.headers["content-type"]).includes("pdf")
      && Buffer.from(pdfFile.raw).subarray(0, 5).toString("ascii") === "%PDF-");

    const responsableList = await json(running, token, "GET", "/accounting/received-invoices/responsibles?q=Analista");
    check("La busqueda de responsables devuelve usuarios activos", responsableList.status === 200
      && responsableList.body.some((user) => user.id === users.responsibleId));

    const assigned = await json(running, token, "POST", `/accounting/received-invoices/${invoiceId}/assign`, {
      responsible_user_id: users.responsibleId,
      segment: "Contable",
      group_name: "Cuentas por pagar",
      cost_center: "CC-ADMIN",
      assignment_detail: "Verificar soporte antes del pago",
      notification_emails: ["pagos@apex.local"]
    });
    check("La asignacion actualiza estado, responsable y bitacora", assigned.status === 200
      && assigned.body.responsible_user_id === users.responsibleId
      && assigned.body.assignment_status === "assigned"
      && assigned.body.processing_status === "assigned"
      && assigned.body.leader_assignment_status === "pending"
      && assigned.body.change_logs.some((log) => log.action === "assigned"), { status: assigned.body.processing_status });

    const deniedApprove = await json(running, auth(tenantId, users.analystId, "ANALISTA_CONTABLE", ["read", "write"]), "POST", `/accounting/received-invoices/${invoiceId}/approve`, {});
    check("Aprobar exige el permiso contable de aprobacion", deniedApprove.status === 403, { status: deniedApprove.status, body: deniedApprove.body });

    const approved = await json(running, token, "POST", `/accounting/received-invoices/${invoiceId}/approve`, { observations: "Soporte validado" });
    check("La aprobacion del lider deja la factura procesada", approved.status === 200
      && approved.body.processing_status === "processed"
      && approved.body.leader_assignment_status === "approved"
      && approved.body.approved_at, { status: approved.body.processing_status });

    const approvedAgain = await json(running, token, "POST", `/accounting/received-invoices/${invoiceId}/approve`, {});
    check("Una factura ya aprobada no se aprueba dos veces", approvedAgain.status === 409, { status: approvedAgain.status });

    const duplicate = await upload(running, token, archiveA);
    check("El mismo ZIP no se procesa dos veces", duplicate.statusCode === 200 && duplicate.json().duplicate === true);
    const countAfterDuplicate = await db.receivedInvoice.count({ where: { tenant_id: tenantId } });
    check("El reintento no duplica la factura en la base", countAfterDuplicate === 1, { count: countAfterDuplicate });

    const archiveB = await buildArchive("FV-2026-000124", {
      xmlOverrides: { number: "FV-2026-000124", cufe: "b".repeat(64), total: 1190000 },
      pdfOverrides: { number: "FV-2026-000124", cufe: "b".repeat(64), total: 1090000 }
    });
    const uploadedB = await upload(running, token, archiveB);
    const invoiceB = uploadedB.json().invoices[0];
    const detailB = await json(running, token, "GET", `/accounting/received-invoices/${invoiceB.id}`);
    check("Una diferencia XML/PDF deja la factura en revision con alerta critica", uploadedB.statusCode === 201
      && detailB.body.processing_status === "review"
      && detailB.body.needs_review === true
      && detailB.body.validation_issues.some((issue) => issue.code === "PDF_TOTAL_DIFERENTE"), {
      status: detailB.body.processing_status,
      comparison: detailB.body.extraction_metadata?.pdf_comparison,
      issues: detailB.body.validation_issues
    });

    const assignedB = await json(running, token, "POST", `/accounting/received-invoices/${invoiceB.id}/assign`, { responsible_user_id: users.responsibleId, segment: "Financiero" });
    const returnedB = await json(running, token, "POST", `/accounting/received-invoices/${invoiceB.id}/return`, { reason: "Falta soporte de la diferencia" });
    check("El lider puede devolver una asignacion con motivo", assignedB.status === 200
      && returnedB.status === 200
      && returnedB.body.assignment_status === "returned"
      && returnedB.body.leader_assignment_status === "returned"
      && returnedB.body.change_logs.some((log) => log.action === "returned"));

    const reassignedB = await json(running, token, "POST", `/accounting/received-invoices/${invoiceB.id}/assign`, {
      responsible_user_id: users.responsibleId,
      segment: "Financiero",
      observations: "Se reviso la diferencia contra el XML"
    });
    check("Una factura devuelta se puede reasignar", reassignedB.status === 200 && reassignedB.body.assignment_status === "assigned");

    const reviewB = await json(running, token, "POST", `/accounting/received-invoices/${invoiceB.id}/review`, { decision: "accept", observations: "Diferencia justificada por nota credito" });
    check("La revision aceptada habilita la asignacion", reviewB.status === 200 && reviewB.body.needs_review === false);

    const pdfOnlyZip = new JSZip();
    pdfOnlyZip.file("FV-2026-000125.pdf", buildInvoicePdf({ number: "FV-2026-000125", cufe: "c".repeat(64), total: 500000, subtotal: 420168.07, iva: 79831.93 }));
    const uploadedC = await upload(running, token, await pdfOnlyZip.generateAsync({ type: "nodebuffer" }), "solo-pdf.zip");
    const invoiceC = uploadedC.json().invoices[0];
    const detailC = invoiceC ? await json(running, token, "GET", `/accounting/received-invoices/${invoiceC.id}`) : null;
    check("Un ZIP solo con PDF extrae datos y los marca para revision", uploadedC.statusCode === 201
      && detailC.body.extraction_source === "pdf"
      && detailC.body.needs_review === true
      && detailC.body.xml_available === false
      && detailC.body.pdf_available === true, { status: uploadedC.statusCode, body: uploadedC.json() });

    const badZip = await upload(running, token, Buffer.from("no es un zip"), "roto.zip");
    check("Un archivo que no es ZIP se rechaza con error claro", badZip.statusCode === 415 && badZip.json().code === "ZIP_NO_ES_ZIP", { body: badZip.json() });

    const textZip = new JSZip();
    textZip.file("notas.txt", "sin facturas");
    const noDocs = await upload(running, token, await textZip.generateAsync({ type: "nodebuffer" }), "sin-documentos.zip");
    check("Un ZIP sin XML o PDF se rechaza y explica el motivo", noDocs.statusCode === 422 && noDocs.json().code === "ZIP_SIN_DOCUMENTOS", { body: noDocs.json() });

    const emails = await json(running, token, "GET", "/accounting/received-invoices/emails");
    check("La bitacora de correos registra cada lote procesado", emails.status === 200 && emails.body.meta.total >= 4);

    const errors = await json(running, token, "GET", "/accounting/received-invoices/errors");
    check("La bitacora de errores registra los lotes rechazados", errors.status === 200 && errors.body.meta.total >= 1);

    const history = await json(running, token, "GET", "/accounting/received-invoices/history?limit=10");
    check("El historial global conserva usuario, accion y fecha", history.status === 200
      && history.body.length > 0
      && history.body.every((log) => log.action && log.created_at && log.invoice_id));

    const isolated = await json(running, otherToken, "GET", `/accounting/received-invoices/${invoiceId}`);
    check("Otra empresa no puede ver la factura", isolated.status === 404, { status: isolated.status });
    const otherList = await json(running, otherToken, "GET", "/accounting/received-invoices");
    check("La bandeja de otra empresa queda vacia", otherList.status === 200 && otherList.body.meta.total === 0);

    const invalidConfig = await json(running, token, "PUT", "/accounting/received-invoices/mail-config", { host: "imap.example.com", username: "facturas@example.com", password_env_key: "clave-invalida" });
    check("La configuracion IMAP valida el nombre de la variable secreta", invalidConfig.status === 400, { status: invalidConfig.status });
    const savedConfig = await json(running, token, "PUT", "/accounting/received-invoices/mail-config", {
      host: "imap.example.com", port: 993, secure: true, username: "facturas@example.com",
      password_env_key: "INVOICE_IMAP_PASSWORD", folder: "INBOX", polling_minutes: 15, enabled: false
    });
    check("La configuracion IMAP se guarda sin exponer la contrasena", savedConfig.status === 200
      && savedConfig.body.host === "imap.example.com"
      && savedConfig.body.password_env_key === "INVOICE_IMAP_PASSWORD"
      && savedConfig.body.password === undefined
      && savedConfig.body.configured === true
      && savedConfig.body.password_configured === false, { body: savedConfig.body });
    const syncWithoutPassword = await json(running, token, "POST", "/accounting/received-invoices/mail-config/sync", { limit: 5 });
    check("Sincronizar sin contrasena falla con un mensaje accionable", syncWithoutPassword.status === 503
      && syncWithoutPassword.body.code === "INVOICE_MAIL_PASSWORD_MISSING", { body: syncWithoutPassword.body });

    const reprocessed = await json(running, token, "POST", `/accounting/received-invoices/${invoiceId}/reprocess`);
    check("Reprocesar conserva una sola factura y reporta el duplicado", reprocessed.status === 200
      && reprocessed.body.summary.duplicates === 1
      && reprocessed.body.summary.created === 0, { body: reprocessed.body });

    const finalCount = await db.receivedInvoice.count({ where: { tenant_id: tenantId } });
    const finalDocs = await db.receivedInvoiceDocument.count({ where: { tenant_id: tenantId } });
    check("La base queda sin duplicados y conserva todos los originales", finalCount === 3 && finalDocs === 5, { invoices: finalCount, documents: finalDocs });

    const supplier = await db.invoiceSupplier.findFirst({ where: { tenant_id: tenantId, tax_id: "900123456" } });
    const supplierInvoice = await db.receivedInvoice.findFirst({ where: { tenant_id: tenantId, supplier_id: supplier?.id } });
    check("El proveedor se reutiliza por NIT", Boolean(supplier) && supplier.name === "Distribuciones Andinas SAS", {
      supplier,
      supplier_invoice_id: supplierInvoice?.id,
      supplier_count: await db.invoiceSupplier.count({ where: { tenant_id: tenantId } })
    });
  } catch (error) {
    checks.push({ name: "excepcion", status: "failed", message: error.message, stack: error.stack });
    throw error;
  } finally {
    await running.close().catch(() => {});
    await cleanup();
  }
}

main()
  .then(() => {
    const passed = checks.filter((item) => item.status === "passed").length;
    const failed = checks.filter((item) => item.status === "failed").length;
    fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
    fs.writeFileSync(evidencePath, `${JSON.stringify({
      suite: "received-invoices-local",
      executed_at: new Date().toISOString(),
      tenant_id: tenantId,
      total: checks.length,
      passed,
      failed,
      checks
    }, null, 2)}\n`);
    console.log(`Certificacion facturas recibidas: ${passed}/${checks.length} verificaciones, ${failed} fallidas`);
    console.log(`Evidencia: ${evidencePath}`);
    if (failed) process.exitCode = 1;
  })
  .catch(async (error) => {
    console.error("CERTIFICACION FALLIDA:", error.message);
    fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
    fs.writeFileSync(evidencePath, `${JSON.stringify({
      suite: "received-invoices-local",
      executed_at: new Date().toISOString(),
      tenant_id: tenantId,
      total: checks.length,
      passed: checks.filter((item) => item.status === "passed").length,
      failed: checks.filter((item) => item.status === "failed").length,
      checks
    }, null, 2)}\n`);
    process.exitCode = 1;
  });
