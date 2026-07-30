import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const panel = fs.readFileSync(
  new URL("../components/offline/OfflineTechnicianPanel.tsx", import.meta.url),
  "utf8"
);

test("panel abre detalle mediante el servicio abstracto de consulta", () => {
  assert.match(panel, /openPrepared\(\)/);
  assert.match(panel, /listActivities\(order\.orderId\)/);
  assert.match(panel, /listChecklist\(order\.orderId\)/);
  assert.doesNotMatch(panel, /from ["']dexie["']/);
});

test("panel presenta lectura local, actividad, checklist, expiracion y fecha", () => {
  for (const text of [
    "Consulta local de solo lectura",
    "Actividades",
    "Checklist",
    "Ultima actualizacion",
    "informacion guardada esta desactualizada"
  ]) assert.ok(panel.includes(text));
});

test("panel no incorpora controles operativos offline", () => {
  for (const action of [
    "Iniciar servicio",
    "Completar actividad",
    "Editar checklist",
    "Agregar observacion",
    "Agregar evidencia",
    "Tomar fotografia"
  ]) assert.equal(panel.includes(action), false);
});

