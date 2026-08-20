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
  const permissionSource = read("lib/rolePermissions.ts");

  assert.match(panelSource, /SPECIAL_EDIT_PERMISSION = "edit_any_state"/);
  assert.match(panelSource, /hasStoredRolePermission\("services\.orders", SPECIAL_EDIT_PERMISSION\)/);
  assert.match(permissionSource, /servicios_correcciones: "services\.orders"/);
  assert.doesNotMatch(panelSource, /administrador de empresa.*return true/);
  assert.match(panelSource, /El estado de pago no bloquea esta edicion/);
  assert.match(panelSource, /Nueva novedad/);
  assert.match(panelSource, /Reportar pieza/);
  assert.match(panelSource, /Anexar soporte/);
  assert.match(panelSource, /Guardar y aplicar corrección/);
  assert.match(panelSource, /Falta completar/);
  assert.match(panelSource, /Reintentar aplicación/);
  assert.match(panelSource, /PIECE_ISSUE_ADDED/);
  assert.match(panelSource, /Foto de soporte/);
  assert.match(panelSource, /Array\.isArray\(order\.photos\)/);
  assert.match(panelSource, /Array\.isArray\(correction\.changes\)/);
  assert.match(panelSource, /clientUploadId = `admin:\$\{order\.id\}:\$\{correction\.id\}:\$\{crypto\.randomUUID\(\)\}`/);
});

test("el monitor expone la correccion especial y abre el panel directamente", () => {
  const monitorSource = read("app/dashboard/servicios/page.tsx");
  const detailSource = read("app/dashboard/servicios/[id]/page.tsx");

  assert.match(monitorSource, /hasStoredRolePermission\("services\.orders", "edit_any_state"\)/);
  assert.match(monitorSource, /Corregir y anexar/);
  assert.match(monitorSource, /ShieldCheck size=\{14\} \/> Corregir/);
  assert.match(monitorSource, /corregir=1/);
  assert.match(monitorSource, /href\.includes\("\?"\) \? "&" : "\?"/);
  assert.match(monitorSource, /correctionAvailable\(order\)/);
  assert.match(detailSource, /initiallyOpen=\{searchParams\.get\("corregir"\) === "1"\}/);
});

test("al guardar un rol se propagan sus permisos a los usuarios asignados", () => {
  const routeSource = read("app/api/admin/roles/route.ts");

  assert.match(routeSource, /async function propagateRolePermissions/);
  assert.match(routeSource, /synchronized_users: synchronizedUsers/);
});

test("el detalle de servicio divide componentes pesados y usa ancho operativo", () => {
  const detailSource = read("app/dashboard/servicios/[id]/page.tsx");

  assert.match(detailSource, /dynamic\(\(\) => import\("@\/components\/operations\/PhotoCapture"\)/);
  assert.match(detailSource, /await import\("@\/lib\/serviceReportPdf"\)/);
  assert.match(detailSource, /max-w-\[1440px\]/);
  assert.match(detailSource, /lg:grid-cols-3/);
});
