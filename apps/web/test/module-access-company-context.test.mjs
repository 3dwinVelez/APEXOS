import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../lib/moduleAccess.ts", import.meta.url),
  "utf8"
);

test("auth/me recibe la empresa seleccionada", () => {
  assert.match(source, /localStorage\.getItem\("apexos_company_id"\)/);
  assert.match(source, /"x-company-id": companyId/);
});

test("la empresa se persiste antes de refrescar el contexto RBAC", () => {
  const persistIndex = source.indexOf('localStorage.setItem("apexos_company_id", companyId)');
  const refreshIndex = source.indexOf("await refreshRoleContextFromApi().catch", persistIndex);

  assert.ok(persistIndex >= 0, "debe persistir la empresa seleccionada");
  assert.ok(refreshIndex > persistIndex, "auth/me debe ejecutarse despues de seleccionar la empresa");
});
