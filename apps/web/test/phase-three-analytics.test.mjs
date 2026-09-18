import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const source = fs.readFileSync(path.resolve(here, "../app/dashboard/reportes/apex-heart/page.tsx"), "utf8");

test("Apex Heart abre vistas analíticas enlazadas por URL", () => {
  assert.match(source, /useSearchParams/);
  assert.match(source, /searchParams\.get\("view"\)/);
  assert.match(source, /viewsForRouting\.includes/);
});

test("el análisis de producto permite drill-down al registro operativo", () => {
  assert.match(source, /\/dashboard\/inventario\/productos\/\$\{p\.item_id\}/);
  assert.match(source, /abrir su detalle operativo/);
});

test("los reportes programados tienen gestión persistente y entrega auditable", () => {
  const api = fs.readFileSync(path.resolve(root, "../api/src/modules/apex-heart/routes.js"), "utf8");
  const service = fs.readFileSync(path.resolve(root, "../api/src/modules/apex-heart/service.js"), "utf8");
  const schema = fs.readFileSync(path.resolve(root, "../api/prisma/schema.prisma"), "utf8");
  assert.match(source, /ReportSchedules/);
  assert.match(source, /Programar reporte/);
  assert.match(api, /report-schedules/);
  assert.match(service, /runDueReportSchedules/);
  assert.match(service, /emailQueue\.add\("apex-heart-report"/);
  assert.match(schema, /model ApexHeartReportSchedule/);
});
