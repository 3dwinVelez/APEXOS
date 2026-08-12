const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const service = fs.readFileSync(path.join(__dirname, "../src/modules/services/service.js"), "utf8");
const routes = fs.readFileSync(path.join(__dirname, "../src/modules/services/routes.js"), "utf8");
const schema = fs.readFileSync(path.join(__dirname, "../prisma/schema.prisma"), "utf8");
const serviceSchema = fs.readFileSync(path.join(__dirname, "../src/modules/services/schema.js"), "utf8");
const prismaCore = fs.readFileSync(path.join(__dirname, "../src/core/prisma.js"), "utf8");

test("item lookup binds tenant, order and item to prevent manipulated ids", () => {
  assert.match(service, /id: Number\(itemId\), tenant_id: tenantId, order_id: order\.id/);
  assert.match(service, /SERVICE_ORDER_ITEM_NOT_AVAILABLE/);
});

test("photos and incidents validate item membership before persistence", () => {
  assert.match(service, /if \(itemId != null\) await orderItem\(tenantId, user, order\.id, itemId\)/);
  assert.match(service, /item_id: itemId/);
  assert.match(service, /order_id: order\.id, item_id: itemId, type: input\.type, active: true/);
});

test("a non-executed closure keeps its incident on the selected request", () => {
  assert.match(service, /const itemId = input\.item_id == null \? null : Number\(input\.item_id\);/);
  assert.match(service, /type: "no_ejecutada",[\s\S]*item_id: itemId/);
  assert.match(serviceSchema, /no_execution_reason: \{ type: "string" \},[\s\S]*item_id: \{ type: "integer" \}/);
  assert.match(service, /requireEvidence\(id, \["no_ejecutada"\], itemId\)/);
});

test("concurrent and replayed status changes are protected", () => {
  assert.match(service, /version: expectedVersion/);
  assert.match(service, /SERVICE_ITEM_VERSION_CONFLICT/);
  assert.match(schema, /ServiceOrderItem_tenant_order_idempotency_key/);
});

test("item mutations preserve RBAC and audit coverage", () => {
  assert.match(routes, /requirePermission\("services", "write"\)/);
  assert.match(service, /service_order\.item\.updated/);
  assert.match(service, /service_order\.item\.deleted/);
  assert.match(service, /service_order\.item\.status_changed/);
});

test("migration is additive and evidence relations are optional", () => {
  assert.match(schema, /model ServiceOrderItem/);
  assert.match(schema, /item_id\s+Int\?/);
  assert.match(schema, /onDelete: Restrict/);
});

test("service order items participate in tenant enforcement and controlled deletion", () => {
  assert.match(prismaCore, /TENANT_MODELS[\s\S]*"ServiceOrderItem"/);
  assert.match(prismaCore, /PHYSICAL_DELETE_ALLOWED[\s\S]*"ServiceOrderItem"/);
});

test("item inspection and execution synchronize the owning order", () => {
  assert.doesNotMatch(service, /syncOrderProgress\(tenantId,\s*order\.id\)/);
  assert.match(service, /syncOrderProgress\(order\.id\)/);
});

test("administrative editing replaces only requests that have not started", () => {
  assert.match(service, /Array\.isArray\(input\.items\)/);
  assert.match(service, /SERVICE_ORDER_ITEMS_ALREADY_STARTED/);
  assert.match(service, /data\.items = \{[\s\S]*deleteMany: \{\}[\s\S]*create:/);
  assert.match(service, /data\.reference_id = normalizedItems\[0\]\.reference_id/);
  assert.match(service, /data\.service_type = normalizedItems\[0\]\.service_type/);
});
