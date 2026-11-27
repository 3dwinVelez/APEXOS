import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("nomina page exposes the Davivienda flat-file download", () => {
  const source = read("../app/dashboard/talento-humano/nomina/page.tsx");
  assert.match(source, /Plano Davivienda/);
  assert.match(source, /liquidaciones\/plano-davivienda/);
  assert.match(source, /application_date/);
  assert.match(source, /type="date"/);
});

test("configuracion laboral edits the bank_file company fields", () => {
  const source = read("../app/dashboard/talento-humano/configuracion-laboral/page.tsx");
  for (const key of ["company_nit", "company_dv", "debit_account", "debit_account_type"]) assert.match(source, new RegExp(key));
  assert.match(source, /Archivo plano Davivienda/);
});

test("employee form edits bank_account_type", () => {
  const source = read("../app/dashboard/talento-humano/empleados/page.tsx");
  assert.match(source, /bank_account_type/);
  assert.match(source, /Tipo de cuenta/);
});
