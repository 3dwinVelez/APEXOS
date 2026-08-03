import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("el editor de roles expone el permiso unico de edicion especial", () => {
  const apiSource = read("lib/api.ts");
  const adminSource = read("app/dashboard/administracion/page.tsx");

  assert.match(apiSource, /servicios_correcciones/);
  assert.match(apiSource, /edit_any_state/);
  assert.match(apiSource, /allowPhysicalDelete: false/);
  assert.match(adminSource, /edit_any_state: "Edicion especial"/);
});

test("el panel administrativo exige permiso explicito y no usa bypass por nombre", () => {
  const panelSource = read("components/services/AdministrativeCorrectionPanel.tsx");

  assert.match(panelSource, /SPECIAL_EDIT_PERMISSION = "edit_any_state"/);
  assert.doesNotMatch(panelSource, /administrador de empresa.*return true/);
  assert.match(panelSource, /El estado de pago no bloquea esta edicion/);
});

test("el detalle de servicio divide componentes pesados y usa ancho operativo", () => {
  const detailSource = read("app/dashboard/servicios/[id]/page.tsx");

  assert.match(detailSource, /dynamic\(\(\) => import\("@\/components\/operations\/PhotoCapture"\)/);
  assert.match(detailSource, /await import\("@\/lib\/serviceReportPdf"\)/);
  assert.match(detailSource, /max-w-\[1440px\]/);
  assert.match(detailSource, /lg:grid-cols-3/);
});
