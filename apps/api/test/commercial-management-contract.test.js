const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("rutas comerciales exigen autenticacion, tenancy y permisos propios", () => {
  const routes = read("src/modules/commercial-management/routes.js");
  assert.match(routes, /fastify\.authenticate/);
  assert.match(routes, /tenancy/);
  assert.match(routes, /requirePermission\("commercial-management", "read"\)/);
  assert.match(routes, /requirePermission\("commercial-management", "write"\)/);
});

test("el modulo se licencia con M-27 y no reutiliza modelos ERP", () => {
  const rbac = read("src/middleware/rbac.js");
  const schema = read("prisma/schema.prisma");
  assert.match(rbac, /"commercial-management": \["M-27"/);
  assert.match(schema, /model CommercialCustomer/);
  assert.match(schema, /model CommercialProduct/);
  assert.doesNotMatch(schema.slice(schema.indexOf("model CommercialAdvisor")), /@relation\([^\n]*(Party|Item|Transaction)/);
});

test("las visitas conservan programacion, ejecucion y reprogramacion trazables", () => {
  const routes = read("src/modules/commercial-management/routes.js");
  const schema = read("prisma/schema.prisma");
  const service = read("src/modules/commercial-management/service.js");
  assert.match(routes, /visits\/:id\/start/);
  assert.match(routes, /visits\/:id\/complete/);
  assert.match(routes, /visits\/:id\/reschedule/);
  assert.match(routes, /visits\/report/);
  assert.match(schema, /started_at\s+DateTime\?/);
  assert.match(schema, /rescheduled_from_id\s+Int\?/);
  assert.match(service, /status: "RESCHEDULED"/);
  assert.match(service, /outcome_notes.*trim/);
});

test("asesores, zonas y categorias tienen mantenimiento sin borrado fisico", () => {
  const routes = read("src/modules/commercial-management/routes.js");
  const schema = read("prisma/schema.prisma");
  assert.match(routes, /advisors\/:id/);
  assert.match(routes, /commercial-management\/zones/);
  assert.match(routes, /commercial-management\/customer-categories/);
  assert.match(routes, /customers\/:id/);
  assert.match(routes, /products\/:id/);
  assert.match(routes, /commercial-management\/budgets/);
  assert.doesNotMatch(routes, /fastify\.delete\("\/commercial-management\/(advisors|zones|customer-categories)/);
  assert.match(schema, /model CommercialZone/);
  assert.match(schema, /model CommercialCustomerCategory/);
});

test("la consulta de visitas admite filtros operativos", () => {
  const service = read("src/modules/commercial-management/service.js");
  assert.match(service, /query\.customer_id/);
  assert.match(service, /query\.advisor_id/);
  assert.match(service, /query\.date_from/);
  assert.match(service, /query\.date_to/);
  assert.match(service, /query\.status/);
});

test("motivos y resultados de visita son maestros editables y se usan en el flujo", () => {
  const routes = read("src/modules/commercial-management/routes.js");
  const schema = read("prisma/schema.prisma");
  const service = read("src/modules/commercial-management/service.js");
  assert.match(routes, /commercial-management\/visit-reasons/);
  assert.match(routes, /commercial-management\/visit-results/);
  assert.match(routes, /visit-reasons\/:id/);
  assert.match(routes, /visit-results\/:id/);
  assert.match(schema, /model CommercialVisitReason/);
  assert.match(schema, /model CommercialVisitResult/);
  assert.match(service, /reason_id: reason\.id/);
  assert.match(service, /result_id: result\.id/);
  assert.match(service, /requires_observation/);
  assert.doesNotMatch(routes, /fastify\.delete\("\/commercial-management\/visit-(reasons|results)/);
});

test("el cliente expone cupo, compromisos y perfil 360 comercial", () => {
  const routes = read("src/modules/commercial-management/routes.js");
  const schema = read("prisma/schema.prisma");
  const service = read("src/modules/commercial-management/service.js");
  assert.match(schema, /credit_capacity\s+Decimal/);
  assert.match(schema, /model CommercialCustomerCommitment/);
  assert.match(routes, /commercial-management\/commitments/);
  assert.match(routes, /customers\/:id\/commitments/);
  assert.match(service, /suggested_products/);
  assert.match(service, /commitments: \{ where: \{ status: "PENDING"/);
  assert.match(service, /input\.commitments/);
});

test("las visitas bloquean solapamientos y guardan lead time con duracion", () => {
  const routes = read("src/modules/commercial-management/routes.js");
  const schema = read("prisma/schema.prisma");
  const service = read("src/modules/commercial-management/service.js");
  assert.match(schema, /planned_duration_minutes\s+Int/);
  assert.match(schema, /scheduled_end_at\s+DateTime\?/);
  assert.match(schema, /model CommercialVisitEvent/);
  assert.match(schema, /model CommercialSettings/);
  assert.match(routes, /commercial-management\/settings/);
  assert.match(routes, /visits\/:id\/timeline/);
  assert.match(service, /assertAdvisorAvailability/);
  assert.match(service, /event_type: eventType/);
  assert.match(service, /duration_deviation_minutes/);
});

test("Mi dia prioriza trabajo y la agenda expone una validacion preventiva", () => {
  const routes = read("src/modules/commercial-management/routes.js");
  const service = read("src/modules/commercial-management/service.js");
  assert.match(routes, /commercial-management\/my-day/);
  assert.match(routes, /visits\/check-availability/);
  assert.match(service, /async function myDay/);
  assert.match(service, /overdue_commitments/);
  assert.match(service, /async function checkVisitAvailability/);
  assert.match(service, /findAdvisorConflict/);
});

test("el catalogo comercial se integra con inventarios sin diferencias de precio", () => {
  const routes = read("src/modules/commercial-management/routes.js");
  const schema = read("prisma/schema.prisma");
  const service = read("src/modules/commercial-management/service.js");
  assert.match(schema, /inventory_item_id\s+Int\?/);
  assert.match(schema, /subcategory\s+String\?/);
  assert.match(schema, /line\s+String\?/);
  assert.match(service, /inventoryLicensed/);
  assert.match(service, /unit_price: row\.inventory_item \? row\.inventory_item\.unit_price/);
  assert.match(service, /El precio debe coincidir con Inventarios/);
  assert.match(routes, /products\/import/);
});

test("cotizaciones tienen vigencia, pdf operativo y conversion opcional a pedido", () => {
  const routes = read("src/modules/commercial-management/routes.js");
  const schema = read("prisma/schema.prisma");
  const service = read("src/modules/commercial-management/service.js");
  assert.match(schema, /model CommercialQuotation/);
  assert.match(schema, /model CommercialQuotationLine/);
  assert.match(schema, /default_quote_validity_days\s+Int/);
  assert.match(schema, /quotation_id\s+Int\?/);
  assert.match(routes, /commercial-management\/quotations/);
  assert.match(routes, /convert-to-order/);
  assert.match(service, /without_order/);
  assert.match(service, /status: "CONVERTED"/);
  assert.match(service, /validityDays/);
});

test("los pedidos se consultan con detalle, alcance y filtros operativos", () => {
  const routes = read("src/modules/commercial-management/routes.js");
  const service = read("src/modules/commercial-management/service.js");
  assert.match(routes, /get\("\/commercial-management\/orders"/);
  assert.match(routes, /get\("\/commercial-management\/orders\/:id"/);
  assert.match(service, /async function listOrders/);
  assert.match(service, /async function getOrder/);
  assert.match(service, /include: \{ customer: true, advisor: true, lines: true/);
  assert.match(service, /query\.advisor_id/);
  assert.match(service, /query\.customer_id/);
  assert.match(service, /query\.status/);
  assert.match(service, /quotation: \{ include: \{ lines: true \} \}/);
});

test("presupuestos soportan frecuencia mensual y diaria sin mezclar fechas", () => {
  const schema = read("prisma/schema.prisma");
  const validation = read("src/modules/commercial-management/schema.js");
  const service = read("src/modules/commercial-management/service.js");
  assert.match(schema, /budget_type\s+String/);
  assert.match(schema, /budget_date\s+DateTime/);
  assert.match(validation, /"MONTHLY", "DAILY"/);
  assert.match(service, /La fecha diaria debe pertenecer al periodo seleccionado/);
});
