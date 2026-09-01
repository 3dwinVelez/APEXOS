import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const admin = fs.readFileSync(new URL("../app/dashboard/administracion/page.tsx", import.meta.url), "utf8");
const home = fs.readFileSync(new URL("../app/dashboard/gestion-comercial/page.tsx", import.meta.url), "utf8");
const budgets = fs.readFileSync(new URL("../app/dashboard/gestion-comercial/presupuestos/page.tsx", import.meta.url), "utf8");
const masters = fs.readFileSync(new URL("../app/dashboard/gestion-comercial/maestros/page.tsx", import.meta.url), "utf8");

test("Administration links an APEX user to a commercial advisor", () => {
  assert.match(admin, /Vincular este usuario como asesor/);
  assert.match(admin, /user_id: Number\(savedUser\.id\)/);
  assert.match(admin, /commercial-management\/advisors/);
  assert.match(admin, /El rol seleccionado debe tener permiso de entrada/);
});

test("advisor UI hides masters and budget configuration", () => {
  assert.match(home, /access\?\.can_manage_masters/);
  assert.match(budgets, /access\?\.can_manage_budgets/);
  assert.match(masters, /if \(!accessData\.can_manage_masters\) setMaster\("customers"\)/);
});
