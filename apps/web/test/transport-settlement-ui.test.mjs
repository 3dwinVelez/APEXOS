import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../../..");
const page = fs.readFileSync(path.join(root, "apps/web/app/dashboard/transporte/liquidaciones/page.tsx"), "utf8");
const home = fs.readFileSync(path.join(root, "apps/web/app/dashboard/transporte/page.tsx"), "utf8");
const moduleFunctions = fs.readFileSync(path.join(root, "apps/web/lib/moduleFunctions.ts"), "utf8");

test("la torre de liquidaciones consume los endpoints del dominio de liquidacion", () => {
  assert.match(page, /\/api\/v1\/transport\/settlement-control-tower/);
  assert.match(page, /\/api\/v1\/transport\/settlement-packages/);
  assert.match(page, /\/api\/v1\/transport\/settlement-types/);
  assert.match(page, /\/api\/v1\/transport\/settlement-periods/);
  assert.match(page, /\/items`/);
  assert.match(page, /\/adjustments`/);
});

test("la pagina expone el flujo de estados completo del paquete", () => {
  for (const action of ["validate", "precalculate", "submit", "decision", "account", "close", "cancel"]) {
    assert.ok(page.includes(`"${action}"`) || page.includes(`'${action}'`) || page.includes(action), `falta accion ${action}`);
  }
  assert.match(page, /STATUS_LABEL/);
  assert.match(page, /preliquidada/);
  assert.match(page, /contabilizada/);
});

test("la pagina respeta permisos RBAC de lectura, escritura y aprobacion", () => {
  assert.match(page, /hasStoredRolePermission\("transport", "read"\)/);
  assert.match(page, /hasStoredRolePermission\("transport", "write"\)/);
  assert.match(page, /hasStoredRolePermission\("transport", "approve"\)/);
});

test("los KPI de la torre cubren las cuatro etapas de valor", () => {
  assert.match(page, /draft_value/);
  assert.match(page, /pending_approval_value/);
  assert.match(page, /approved_value/);
  assert.match(page, /accounted_value/);
  assert.match(page, /blocked_packages/);
});

test("el ajuste exige motivo y muestra antes/despues (trazabilidad)", () => {
  assert.match(page, /name="reason"/);
  assert.match(page, /name="delta"/);
  assert.match(page, /before_value/);
  assert.match(page, /after_value/);
});

test("el rechazo requiere comentario obligatorio", () => {
  assert.match(page, /El rechazo requiere un motivo/);
});

test("la pagina esta registrada en el indice de funciones y en el home de transporte", () => {
  assert.match(moduleFunctions, /fn-transp-liquidaciones/);
  assert.match(moduleFunctions, /\/dashboard\/transporte\/liquidaciones/);
  assert.match(home, /\/dashboard\/transporte\/liquidaciones/);
  assert.match(home, /Torre de liquidaciones/);
});
