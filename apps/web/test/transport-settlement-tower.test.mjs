import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../../..");
const page = fs.readFileSync(path.join(root, "apps/web/app/dashboard/transporte/liquidaciones/page.tsx"), "utf8");
const masters = fs.readFileSync(path.join(root, "apps/web/app/dashboard/transporte/maestros/page.tsx"), "utf8");

test("la torre ofrece tres vistas: paquetes, semanas y vehiculos", () => {
  assert.match(page, /useState<"paquetes" \| "semanas" \| "vehiculos">\("paquetes"\)/);
  assert.match(page, /\["semanas", "Semanas"\]/);
  assert.match(page, /\["vehiculos", "Vehiculos"\]/);
  assert.match(page, /view === "semanas"/);
  assert.match(page, /view === "vehiculos"/);
});

test("la vista semanal gestiona periodos con apertura y cierre", () => {
  assert.match(page, /Gestion de periodos/);
  assert.match(page, /\/api\/v1\/transport\/settlement-periods/);
  assert.match(page, /Nuevo periodo/);
  assert.match(page, /Cerrar periodo/);
  assert.match(page, /Reabrir periodo/);
});

test("la vista de vehiculos consume la consolidacion de ingresos", () => {
  assert.match(page, /\/api\/v1\/transport\/settlement-vehicle-consolidation/);
  assert.match(page, /Consolidacion de ingresos por vehiculo/);
  assert.match(page, /Ver detalle/);
  assert.match(page, /Consolidacion por vehiculo/);
  assert.match(page, /vehicle_plate/);
  assert.match(page, /guide_count/);
});

test("la escalera de etapas del prototipo se conserva", () => {
  assert.match(page, /const PACKAGE_STEPS = \["Generado", "Validado", "Preliquidado", "Autorizado", "Contabilizado"\]/);
  assert.match(page, /const STEP_BUCKETS/);
  assert.match(page, /packageSteps/);
});

test("el detalle del paquete expone trazabilidad de auditoria", () => {
  assert.match(page, /\/audit`/);
  assert.match(page, /Linea de tiempo/);
  assert.match(page, /Aprobaciones/);
  assert.match(page, /Contabilizaciones/);
  assert.match(page, /ACTION_LABEL/);
});

test("las decisiones exigen version optimista y motivo de rechazo", () => {
  assert.match(page, /Aprobar paquete/);
  assert.match(page, /Rechazar paquete/);
  assert.match(page, /El rechazo requiere un motivo/);
  assert.match(page, /version: selected\.version/);
});

test("la contabilizacion advierte el bloqueo y captura el pago", () => {
  assert.match(page, /Contabilizar paquete/);
  assert.match(page, /no podra modificarse/);
  assert.match(page, /idempotente/);
  assert.match(page, /payment_date/);
  assert.match(page, /Referencia contable/);
});

test("las transiciones criticas viajan con version del paquete", () => {
  assert.match(page, /version: pkg\.version/);
  assert.match(page, /transition\("close", \{ version: selected\.version \}/);
});

test("maestros expone la tarjeta de tipos de liquidacion con politica documental", () => {
  assert.match(masters, /title="Tipos de liquidacion"/);
  assert.match(masters, /\/api\/v1\/transport\/settlement-types/);
  assert.match(masters, /documentary_policy/);
  assert.match(masters, /value="alerta"/);
  assert.match(masters, /value="bloqueo"/);
  assert.match(masters, /requires_reinforced_approval/);
  assert.match(masters, /row\.reserved \? "base" : "personalizado"/);
});
