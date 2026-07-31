const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const http = require("node:http");
const { performance } = require("node:perf_hooks");
const bcrypt = require("bcrypt");
require("./load-env")();

const databaseName = decodeURIComponent(new URL(process.env.DATABASE_URL || "postgresql://invalid/invalid").pathname.slice(1));
if (!/^apexos_correction_cert_[a-z0-9_]+$/i.test(databaseName)) {
  throw new Error("La certificacion solo puede ejecutarse sobre una base temporal apexos_correction_cert_*");
}

const prisma = require("../apps/api/src/core/prisma");
const corrections = require("../apps/api/src/modules/services/administrativeCorrections");
const evidenceUploads = require("../apps/api/src/modules/services/evidenceUploads");

const RUN_ID = `correction-cert-${Date.now()}`;

function permissions(actions) {
  return actions.map((action) => ({ module: "services.orders", action }));
}

function input(version, reasonCode, description, changes) {
  return { reason_code: reasonCode, description, confirmed: true, expected_version: version, idempotency_key: `${RUN_ID}-${version}-${reasonCode}`, changes };
}

async function averageMs(callback, iterations = 30) {
  const values = [];
  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now();
    await callback();
    values.push(performance.now() - started);
  }
  values.sort((a, b) => a - b);
  return {
    average_ms: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3)),
    p95_ms: Number(values[Math.floor(values.length * 0.95)].toFixed(3)),
    samples: values.length
  };
}

async function localStorageServer() {
  const objects = new Map();
  const server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    if (request.method === "POST" && request.url.startsWith("/storage/v1/object/upload/sign/service-images/")) {
      const key = decodeURIComponent(request.url.slice("/storage/v1/object/upload/sign/service-images/".length));
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ url: `http://127.0.0.1:${server.address().port}/signed/${encodeURIComponent(key)}` }));
      return;
    }
    if (request.method === "PUT" && request.url.startsWith("/signed/")) {
      objects.set(decodeURIComponent(request.url.slice(8)), body);
      response.writeHead(200).end();
      return;
    }
    if (request.method === "GET" && request.url.startsWith("/storage/v1/object/service-images/")) {
      const item = objects.get(decodeURIComponent(request.url.slice("/storage/v1/object/service-images/".length)));
      if (!item) return response.writeHead(404).end();
      response.writeHead(200, { "Content-Type": "application/octet-stream" }).end(item);
      return;
    }
    if (request.method === "POST" && request.url === "/storage/v1/object/copy") {
      const payload = JSON.parse(body.toString("utf8"));
      objects.set(payload.destinationKey, objects.get(payload.sourceKey));
      response.writeHead(200, { "Content-Type": "application/json" }).end("{}");
      return;
    }
    if (request.method === "DELETE" && request.url.startsWith("/storage/v1/object/service-images/")) {
      objects.delete(decodeURIComponent(request.url.slice("/storage/v1/object/service-images/".length)));
      response.writeHead(200).end();
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, objects, url: `http://127.0.0.1:${server.address().port}` };
}

async function main() {
  const tenant = await prisma.tenant.create({ data: { name: `Correction Cert ${RUN_ID}`, active_modules: ["M-26"], config: { service_order_corrections: { double_approval: true } } } });
  const otherTenant = await prisma.tenant.create({ data: { name: `Other ${RUN_ID}`, active_modules: ["M-26"] } });
  const requesterRole = await prisma.role.create({ data: { tenant_id: tenant.id, name: `Correction requester ${RUN_ID}`, permissions: { create: permissions(["administrative_correction", "correct_information", "change_state", "add_observation", "manage_evidence", "force_close", "view_correction_history"]) } }, include: { permissions: true } });
  const approverRole = await prisma.role.create({ data: { tenant_id: tenant.id, name: `Correction approver ${RUN_ID}`, permissions: { create: permissions(["approve_correction", "view_correction_history"]) } }, include: { permissions: true } });
  const localPasswordHash = await bcrypt.hash(randomUUID(), 12);
  const requester = await prisma.user.create({ data: { tenant_id: tenant.id, name: "Solicitante QA", email: `${RUN_ID}-requester@local.test`, password: localPasswordHash, role_id: requesterRole.id } });
  const approver = await prisma.user.create({ data: { tenant_id: tenant.id, name: "Aprobador QA", email: `${RUN_ID}-approver@local.test`, password: localPasswordHash, role_id: approverRole.id } });
  requester.role = requesterRole;
  approver.role = approverRole;

  const order = await prisma.serviceOrder.create({ data: { tenant_id: tenant.id, number: `OS-${Date.now()}`, status: "cerrada", customer_name: "Cliente controlado", customer_address: "Direccion local", customer_phone: "3000000000", service_type: "montaje", notes: "Observacion original", closed_at: new Date(), version: 1, metadata: { inspection: { items: [{ name: "Pieza A", status: "ok" }] } } } });
  const photo = await prisma.servicePhoto.create({ data: { tenant_id: tenant.id, order_id: order.id, type: "producto_abierto", storage_path: "local/certification/original.webp", active: true, metadata: { source: RUN_ID } } });

  const note = await corrections.createCorrection(tenant.id, requester, order.id, input(1, "DATA_ENTRY_ERROR", "Se corrige la observacion digitada por el tecnico", [{ type: "FIELD_UPDATED", field: "notes", value: "Observacion administrativa corregida" }]), { session_id: RUN_ID, ip: "127.0.0.1" });
  assert.equal(note.status, "DRAFT");
  await corrections.apply(tenant.id, requester, order.id, note.id, { session_id: RUN_ID, ip: "127.0.0.1" });

  const removal = await corrections.createCorrection(tenant.id, requester, order.id, input(2, "INCORRECT_EVIDENCE", "La evidencia corresponde a otro momento del servicio", [{ type: "EVIDENCE_REMOVED", evidence_id: photo.id }]), { session_id: RUN_ID });
  assert.equal(removal.status, "PENDING_APPROVAL");
  await corrections.approve(tenant.id, approver, order.id, removal.id);
  await corrections.apply(tenant.id, requester, order.id, removal.id, { session_id: RUN_ID });

  const storage = await localStorageServer();
  process.env.AUTHORIZED_EVIDENCE_UPLOADS_ENABLED = "true";
  process.env.SUPABASE_URL = storage.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = randomUUID();
  const png = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png, 0);
  png.writeUInt32BE(1, 16);
  png.writeUInt32BE(1, 20);
  const authorization = await evidenceUploads.authorize(tenant.id, requester, order.id, { mime_type: "image/png", size_bytes: png.length, purpose: "administrative_support", client_upload_id: `${RUN_ID}-evidence` });
  await fetch(authorization.signed_upload_url, { method: "PUT", headers: { "Content-Type": "image/png" }, body: png });
  const validated = await evidenceUploads.confirm(tenant.id, requester, authorization.authorization_id);
  assert.equal(validated.status, "validated");
  assert.equal(storage.objects.has(validated.final_path), true);
  assert.equal(storage.objects.has(authorization.path), false);
  const addition = await corrections.createCorrection(tenant.id, requester, order.id, input(3, "MISSING_EVIDENCE", "Se agrega soporte validado omitido durante el cierre", [{ type: "EVIDENCE_ADDED", value: "administrative_support" }]), { session_id: RUN_ID });
  await corrections.addEvidence(tenant.id, requester, order.id, addition.id, { authorization_id: authorization.authorization_id, type: "administrative_support" }, { session_id: RUN_ID });
  await new Promise((resolve, reject) => storage.server.close((error) => error ? reject(error) : resolve()));

  const reopen = await corrections.reopen(tenant.id, requester, order.id, { reason_code: "INCOMPLETE_CLOSURE", description: "Se requiere completar informacion antes de facturacion", confirmed: true, expected_version: 4, idempotency_key: `${RUN_ID}-reopen` }, { session_id: RUN_ID });
  await corrections.approve(tenant.id, approver, order.id, reopen.id);
  await corrections.apply(tenant.id, requester, order.id, reopen.id, { session_id: RUN_ID });

  const forceClose = await corrections.forceClose(tenant.id, requester, order.id, { reason_code: "INCOMPLETE_CLOSURE", description: "Cierre administrativo controlado con pendiente visible", confirmed: true, expected_version: 5, idempotency_key: `${RUN_ID}-close`, observation: "Cierre revisado por administracion", pending_requirements: ["Firma del cliente pendiente"], evidence_reviewed: true }, { session_id: RUN_ID });
  await corrections.approve(tenant.id, approver, order.id, forceClose.id);
  await corrections.apply(tenant.id, requester, order.id, forceClose.id, { session_id: RUN_ID });

  const finalOrder = await prisma.serviceOrder.findFirst({ where: { tenant_id: tenant.id, id: order.id } });
  const retiredPhoto = await prisma.servicePhoto.findFirst({ where: { tenant_id: tenant.id, id: photo.id } });
  const administrativePhoto = await prisma.servicePhoto.findFirst({ where: { tenant_id: tenant.id, order_id: order.id, administratively_added: true } });
  const history = await corrections.listHistory(tenant.id, requester, order.id);
  const detailRows = await prisma.serviceOrderCorrectionChange.findMany({ where: { tenant_id: tenant.id, correction_id: note.id } });
  assert.equal(finalOrder.version, 6);
  assert.equal(finalOrder.status, "cerrada");
  assert.equal(finalOrder.billing_blocked, true);
  assert.equal(finalOrder.notes, "Observacion administrativa corregida");
  assert.equal(retiredPhoto.active, false);
  assert.equal(history.length, 5);
  assert.equal(administrativePhoto.added_by_correction_id, addition.id);
  assert.equal(detailRows[0].old_value, "Observacion original");
  assert.equal(detailRows[0].new_value, "Observacion administrativa corregida");
  await assert.rejects(() => corrections.listHistory(otherTenant.id, { ...requester, tenant_id: otherTenant.id }, order.id), (error) => error.statusCode === 404);
  await assert.rejects(() => prisma.serviceOrderCorrectionChange.update({ where: { id: detailRows[0].id }, data: { field_name: "tampered" } }));

  const baseline = await averageMs(() => prisma.serviceOrder.findFirst({ where: { tenant_id: tenant.id, id: order.id }, include: { photos: { where: { active: true } }, incidents: true } }));
  const withHistory = await averageMs(() => Promise.all([
    prisma.serviceOrder.findFirst({ where: { tenant_id: tenant.id, id: order.id }, include: { photos: { where: { active: true } }, incidents: true } }),
    prisma.serviceOrderCorrection.findMany({ where: { tenant_id: tenant.id, order_id: order.id }, include: { changes: true }, take: 100 })
  ]));

  console.log(JSON.stringify({
    ok: true,
    run_id: RUN_ID,
    tenant_id: tenant.id,
    order_id: order.id,
    final_version: finalOrder.version,
    history_entries: history.length,
    evidence_retained_in_audit: Boolean(retiredPhoto.withdrawn_by_correction_id),
    evidence_quarantine_validated_and_promoted: Boolean(administrativePhoto.added_by_correction_id),
    immutable_history_trigger: true,
    cross_tenant_access_blocked: true,
    performance: { order_detail_baseline: baseline, order_detail_with_parallel_history: withHistory }
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
