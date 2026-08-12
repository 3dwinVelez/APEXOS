const assert = require("node:assert/strict");
const fs = require("node:fs");
const { performance } = require("node:perf_hooks");
require("./load-env")();
process.env.NODE_ENV = "test";

const databaseUrl = new URL(process.env.DATABASE_URL || "postgresql://invalid/invalid");
if (!["localhost", "127.0.0.1"].includes(databaseUrl.hostname)) {
  throw new Error(`Certificacion rechazada: ${databaseUrl.hostname} no es un host local.`);
}

const prisma = require("../apps/api/src/core/prisma");
const service = require("../apps/api/src/modules/services/service");
const CERTIFICATION_VERSION = "service-order-items-local-v3";
const RUN_ID = `multi-item-${Date.now()}`;
let tenantId;
let otherTenantId;

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

function photo(itemId, type) {
  return {
    item_id: itemId,
    type,
    base64_data: `data:image/png;base64,${png.toString("base64")}`,
    file_name: `${RUN_ID}-${itemId}-${type}.png`,
    mime_type: "image/png",
    size_bytes: png.length,
    metadata: { client_upload_id: `${RUN_ID}-${itemId}-${type}` }
  };
}

async function setup() {
  const tenant = await prisma.tenant.create({ data: { name: `Certificacion ${RUN_ID}`, active_modules: ["M-26"] } });
  const other = await prisma.tenant.create({ data: { name: `Tenant aislado ${RUN_ID}`, active_modules: ["M-26"] } });
  tenantId = tenant.id;
  otherTenantId = other.id;
  return prisma.runWithTenant(tenantId, async () => {
    const adminRole = await prisma.role.create({ data: { name: `Administrador ${RUN_ID}` } });
    const technicianRole = await prisma.role.create({ data: { name: "Tecnico" } });
    const admin = await prisma.user.create({ data: { name: "Admin Certificacion", email: `${RUN_ID}-admin@local.test`, password: "local", role_id: adminRole.id } });
    const technician = await prisma.user.create({ data: { name: "Tecnico Certificacion", email: `${RUN_ID}-tech@local.test`, password: "local", role_id: technicianRole.id } });
    const employee = await prisma.employee.create({ data: { user_id: technician.id, code: RUN_ID, user_type: "tecnico", position: "Tecnico", department: "Servicios", salary_base: 1, hire_date: new Date() } });
    const references = [];
    for (let index = 1; index <= 3; index += 1) {
      references.push(await prisma.serviceReference.create({ data: { code: `${RUN_ID}-${index}`, name: `Referencia certificada ${index}`, parts: { create: [{ tenant_id: tenantId, name: `Pieza ${index}`, quantity: index, display_order: 1 }] } } }));
    }
    return { admin: { ...admin, role: adminRole }, technician: { ...technician, role: technicianRole }, employee, references };
  });
}

async function cleanup() {
  if (tenantId) {
    await prisma.$executeRaw`DELETE FROM "ServiceOrder" WHERE tenant_id = ${tenantId} AND number LIKE 'CERT-%'`;
    await prisma.employee.deleteMany({ where: { tenant_id: tenantId, code: RUN_ID } });
    await prisma.user.deleteMany({ where: { tenant_id: tenantId, email: { contains: RUN_ID } } });
    await prisma.role.deleteMany({ where: { tenant_id: tenantId, name: { contains: RUN_ID } } });
    await prisma.role.deleteMany({ where: { tenant_id: tenantId, name: "Tecnico" } });
    await prisma.serviceReference.updateMany({ where: { tenant_id: tenantId, code: { startsWith: RUN_ID } }, data: { active: false } });
  }
  if (otherTenantId) await prisma.tenant.update({ where: { id: otherTenantId }, data: { active: false } });
  if (tenantId) await prisma.tenant.update({ where: { id: tenantId }, data: { active: false } });
}

async function main() {
  const operationPage = fs.readFileSync(require.resolve("../apps/web/app/dashboard/servicios/[id]/page.tsx"), "utf8");
  assert.match(operationPage, /disabled=\{working \|\| !executionPhotosReady\(\)\}/);
  assert.match(operationPage, /data\.items\.find\(\(item\) => !itemIsFinished\(item\.status\)\)/);
  assert.match(operationPage, /selectedItem\?\.metadata\?\.inspection\?\.items/);
  assert.match(operationPage, /if \(order\.item_progress\?\.all_completed\) setClosureMode\(true\)/);
  assert.match(operationPage, /setCaptures\(\{\}\);\s+setUploading\(\{\}\);\s+setUploadStatus\(\{\}\);/);
  assert.match(operationPage, /items: targetItemId \? current\.items\.map/);
  console.error("[cert] preparando datos locales");
  const { admin, technician, employee, references } = await setup();
  console.error("[cert] creando orden con tres solicitudes");
  const started = performance.now();
  const created = await service.createOrder(tenantId, admin, {
    number: `CERT-${Date.now()}`,
    technician_id: employee.id,
    service_type: "montaje",
    customer_name: "Cliente prueba local",
    customer_document: "123456789",
    customer_address: "Direccion controlada",
    customer_phone: "3000000000",
    scheduled_date: new Date().toISOString(),
    notes: "Certificacion funcional de tres solicitudes",
    items: references.map((reference, index) => ({ reference_id: reference.id, service_type: ["montaje", "desmontaje", "ambos"][index], quantity: 1, observation: `Solicitud ${index + 1}`, idempotency_key: `${RUN_ID}-${index + 1}` }))
  });
  assert.equal(created.items.length, 3);
  assert.deepEqual(created.items.map((item) => item.quantity), [1, 1, 1]);

  console.error("[cert] guardando edicion administrativa multi-solicitud");
  const edited = await service.updateOrder(tenantId, admin, created.id, {
    customer_name: "Cliente prueba local editado",
    items: created.items.map((item) => ({
      reference_id: item.reference_id,
      service_type: item.service_type,
      quantity: 1,
      observation: `${item.observation} editada`,
      idempotency_key: item.idempotency_key
    })),
    metadata: { certification_version: CERTIFICATION_VERSION }
  });
  assert.equal(edited.customer_name, "Cliente prueba local editado");
  assert.equal(edited.items.length, 3);
  assert.equal(edited.items.every((item) => item.observation.endsWith(" editada")), true);
  assert.equal(edited.metadata.certification_version, CERTIFICATION_VERSION);

  const listed = await service.listOrders(tenantId, technician, { limit: 10 });
  assert.equal(listed.data.some((order) => order.id === edited.id && order.items.length === 3), true);
  await assert.rejects(() => service.getOrder(otherTenantId, { ...admin, tenant_id: otherTenantId }, created.id), (error) => error.statusCode === 404);

  for (const item of edited.items) {
    console.error(`[cert] ejecutando solicitud ${item.display_order + 1}`);
    let current = await service.transitionOrderItem(tenantId, technician, created.id, item.id, { status: "en_curso", expected_version: item.version });
    const inspection = await service.moveToInspection(tenantId, technician, created.id, { item_id: item.id, decision: "armable", items: [{ part_id: item.reference.parts[0].id, name: item.reference.parts[0].name, quantity: item.reference.parts[0].quantity, status: "ok" }] });
    const inspectedItem = inspection.items.find((candidate) => candidate.id === item.id);
    assert.equal(inspectedItem.metadata.inspection.items.length, 1);
    await service.moveToExecution(tenantId, technician, created.id, { item_id: item.id });
    const beforeEvidence = await service.getOrder(tenantId, technician, created.id);
    await assert.rejects(
      () => service.transitionOrderItem(tenantId, technician, created.id, item.id, { status: "completada", expected_version: beforeEvidence.items.find((candidate) => candidate.id === item.id).version }),
      (error) => error.statusCode === 422 && error.code === "SERVICE_ITEM_EVIDENCE_REQUIRED"
    );
    await service.addPhoto(tenantId, technician, created.id, photo(item.id, "producto_abierto"));
    await service.addPhoto(tenantId, technician, created.id, photo(item.id, "producto_cerrado"));
    await service.addIncident(tenantId, technician, created.id, {
      item_id: item.id,
      type: "validacion_referencia",
      description: `Novedad certificada solicitud ${item.display_order + 1}`,
      action: `Accion solicitud ${item.display_order + 1}`
    });
    const refreshed = await service.getOrder(tenantId, technician, created.id);
    current = await service.transitionOrderItem(tenantId, technician, created.id, item.id, { status: "completada", expected_version: refreshed.items.find((candidate) => candidate.id === item.id).version });
    assert.equal(current.item.status, "completada");
  }

  const final = await service.getOrder(tenantId, technician, created.id);
  assert.equal(final.item_progress.completed, 3);
  assert.equal(final.item_progress.all_completed, true);
  assert.equal(final.items.every((item) => item.photos.length === 2), true);
  assert.equal(final.items.every((item) => item.incidents.length === 1), true);
  const report = await service.getOrderReport(tenantId, admin, created.id);
  assert.equal(report.request_groups.length, 3);
  assert.deepEqual(report.request_groups.map((group) => group.evidence.length), [2, 2, 2]);
  assert.equal(report.request_groups.every((group) => group.inspection_items.length === 1), true);
  assert.deepEqual(report.request_groups.map((group) => group.incidents.length), [1, 1, 1]);
  assert.equal(report.general_evidence.length, 0);
  const pdf = await service.getOrderReportPdf(tenantId, admin, created.id);
  const pdfText = pdf.buffer.toString("latin1");
  assert.match(pdfText, /Producto 1 de 3/);
  assert.match(pdfText, /Producto 2 de 3/);
  assert.match(pdfText, /Evidencias del Producto 1/);
  assert.match(pdfText, /Producto 1 \| Producto abierto/);
  assert.ok(pdfText.indexOf("Producto 1 de 3") < pdfText.indexOf("Producto 2 de 3"));
  assert.match(pdfText, /\/Subtype \/Image/);
  assert.doesNotMatch(pdfText, /Indice de servicios/);
  assert.match(pdfText, /Cierre del contenedor/);
  for (const [index, reference] of references.entries()) {
    assert.match(pdfText, new RegExp(reference.code));
    assert.match(pdfText, new RegExp(`Novedad certificada solicitud ${index + 1}`));
  }
  await assert.rejects(() => service.transitionOrderItem(tenantId, technician, created.id, final.items[0].id, { status: "bloqueada", expected_version: 1 }), (error) => error.statusCode === 409);

  const elapsedMs = Number((performance.now() - started).toFixed(2));
  assert.ok(elapsedMs < 5000, `El flujo local excedio 5 s: ${elapsedMs} ms`);
  console.log(JSON.stringify({ certification_version: CERTIFICATION_VERSION, ok: true, run_id: RUN_ID, order_id: created.id, requests: 3, administrative_edit_save: true, technician_multi_item_flow: true, grouped_supports_and_piece_validation: true, incidents_grouped_by_reference: true, pdf_grouped_by_reference: true, evidence_required_error: true, evidence: 6, incidents: 3, tenant_isolation: true, optimistic_concurrency: true, elapsed_ms: elapsedMs }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await cleanup().catch((error) => console.error("No fue posible limpiar toda la data local:", error.message));
  await prisma.$disconnect();
  process.exit(process.exitCode || 0);
});
