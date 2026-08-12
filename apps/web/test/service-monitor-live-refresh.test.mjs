import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../app/dashboard/servicios/page.tsx", import.meta.url), "utf8");
const routeSource = fs.readFileSync(new URL("../app/api/services/monitor-orders/route.ts", import.meta.url), "utf8");

test("el monitor consulta y combina ambas fuentes sin depender del proveedor de sesion", () => {
  assert.match(source, /Promise\.allSettled\(\[/);
  assert.match(source, /mergeOrders\(\[\.\.\.monitorOrders, \.\.\.apiOrders\]\)/);
  assert.match(source, /monitorResult\.status === "rejected" && apiResult\.status === "rejected"/);
  assert.doesNotMatch(source, /const supabaseSession = localStorage\.getItem\("auth_provider"\)/);
});

test("el monitor refresca periodicamente y al recuperar el foco", () => {
  assert.match(source, /window\.setInterval/);
  assert.match(source, /document\.visibilityState === "visible"/);
  assert.match(source, /5_000/);
  assert.match(source, /window\.addEventListener\("focus", refreshOnFocus\)/);
  assert.match(source, /window\.removeEventListener\("focus", refreshOnFocus\)/);
});

test("el endpoint del monitor consulta PostgreSQL cuando el entorno es local", () => {
  assert.match(routeSource, /function localDatabase\(\)/);
  assert.match(routeSource, /async function localMonitorOrders/);
  assert.match(routeSource, /where: \{ tenant_id: tenant\.id \}/);
  assert.match(routeSource, /if \(localDatabase\(\)\)/);
});
