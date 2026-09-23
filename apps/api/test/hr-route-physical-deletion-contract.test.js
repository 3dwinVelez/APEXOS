const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), "utf8");

const routesSource = read("../src/modules/hr/routes.js");
const schemaSource = read("../src/modules/hr/schema.js");
const prismaSource = read("../src/core/prisma.js");
const apiClientSource = read("../../web/lib/api.ts");
const pageSource = read("../../web/app/dashboard/talento-humano/rutas/page.tsx");

test("el borrado fisico de horarios se registra con la puerta dedicada y no con el permiso generico", () => {
  const deleteRoutes = routesSource.match(/fastify\.delete\("\/[^"]*\/:id", \{[^}]*\}[^)]*\)/g) || [];
  assert.equal(deleteRoutes.filter((line) => line.includes("routeDeleteSchema") && line.includes("requirePhysicalDeleteGrant(\"hr\")")).length, 2);
  assert.match(routesSource, /requirePhysicalDeleteGrant/);
  assert.doesNotMatch(routesSource, /fastify\.delete\("\/hr\/routes\/:id", \{[^}]*preHandler: requirePermission\("hr", "write"\)/);
});

test("la vista previa del impacto solo informa y el DELETE vuelve a autorizar", () => {
  assert.match(routesSource, /async function routeDeletionImpactForRequest/);
  assert.match(routesSource, /permissions: \{ can_physical_delete: hasPhysicalDeleteGrant\(request\.user\?\.role, "hr"\) \}/);
  assert.match(routesSource, /fastify\.get\("\/hr\/routes\/:id\/deletion-impact", \{ preHandler: requirePermission\("hr", "read"\) \}, routeDeletionImpactForRequest\)/);
  assert.match(routesSource, /fastify\.delete\("\/hr\/routes\/:id", \{ schema: schemas\.routeDeleteSchema, preHandler: requirePhysicalDeleteGrant\("hr"\) \}/);
  assert.match(routesSource, /fastify\.get\("\/talento-humano\/mallas\/:id\/deletion-impact", \{ preHandler: requirePermission\("hr", "read"\) \}, routeDeletionImpactForRequest\)/);
  assert.match(routesSource, /fastify\.delete\("\/talento-humano\/mallas\/:id", \{ schema: schemas\.routeDeleteSchema, preHandler: requirePhysicalDeleteGrant\("hr"\) \}/);
});

test("el esquema del borrado exige motivo y confirmacion explicita", () => {
  const schemaBlock = schemaSource.match(/const routeDeleteSchema = \{[\s\S]*?\n\};/)?.[0] || "";
  assert.match(schemaBlock, /required: \["reason", "confirmed"\]/);
  assert.match(schemaBlock, /minLength: 12/);
  assert.match(schemaBlock, /const: true/);
  assert.match(schemaBlock, /acknowledge_trace: \{ type: "boolean" \}/);
});

test("Prisma permite el borrado fisico de la malla y su arbol preoperacional", () => {
  const allowed = prismaSource.match(/PHYSICAL_DELETE_ALLOWED = new Set\(\[[\s\S]*?\]\)/)?.[0] || "";
  for (const model of ["TimeRoute", "RoutePreoperationalChecklist", "RoutePreoperationalChecklistAnswer", "RoutePreoperationalChecklistEvidence", "RoutePreoperationalFinding", "RouteStartAuthorization", "RouteBlockEvent"]) {
    assert.ok(allowed.includes(`"${model}"`), `${model} debe permitir borrado fisico`);
  }
});

test("el DELETE de la malla nunca cae al respaldo Supabase", () => {
  assert.match(apiClientSource, /const hrRouteDetailWrite = \/\^\\\/api\\\/v1\\\/hr\\\/routes\\\/\[\^\/\]\+\$\/\.test\(pathname\);/);
  assert.match(apiClientSource, /\/api\/v1\/hr\/routes/);
  assert.match(apiClientSource, /function shouldBlockHrWriteFallback\(path(?:: string)?, method(?:: string)?\)/);
});

test("la pantalla de horarios elimina solo tras revisar el impacto y dejar motivo", () => {
  assert.match(pageSource, /deletion-impact/);
  assert.match(pageSource, /const DELETE_REASON_MIN = 12;/);
  assert.match(pageSource, /method: "DELETE"/);
  assert.match(pageSource, /confirmed: true/);
  assert.match(pageSource, /acknowledge_trace: deleteTraceAck/);
  assert.match(pageSource, /can_physical_delete/);
  assert.match(pageSource, /function impactRequiresTraceAck/);
  // Con la confirmacion abierta el monitor no debe reaccionar al teclado: el modal de
  // borrado maneja su propio Escape y su propia trampa de foco.
  assert.match(pageSource, /if \(deleteTarget\) return;/);
});

test("la tolerancia de la vista previa viaja al servidor para detectar cambios", () => {
  assert.match(pageSource, /expected_employees: deleteImpact\?\.route\.employee_count/);
  assert.match(pageSource, /expected_date: deleteImpact\?\.route\.date/);
});
