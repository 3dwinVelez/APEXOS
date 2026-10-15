import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { branchesForSociety, costCentersForBranch, organizationAssignmentChanged, organizationSelection } from "../lib/payrollOrganization.ts";
import { commonPartyFields, findPartyByDocument, normalizePartyDocument } from "../lib/payrollEntities.ts";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const tree = {
  societies: [{ code: "SOC-1", name: "Principal", active: true }],
  branches: [{ code: "BR-1", name: "Bogota", society_code: "SOC-1", active: true }, { code: "BR-X", name: "Inactiva", society_code: "SOC-1", active: false }],
  cost_centers: [{ code: "CC-1", name: "Operacion", society_code: "SOC-1", branch_code: "BR-1", active: true }, { code: "CC-X", name: "Otra", society_code: "SOC-1", branch_code: "BR-X", active: true }]
};

test("employee organization selectors only expose active branch-linked accounting centers", () => {
  assert.deepEqual(branchesForSociety(tree, "SOC-1").map((row) => row.code), ["BR-1"]);
  assert.deepEqual(costCentersForBranch(tree, "SOC-1", "BR-1").map((row) => row.code), ["CC-1"]);
  assert.deepEqual(organizationSelection(tree, { society_code: "SOC-1", branch_code: "BR-1", cost_center_code: "CC-1" }), {
    society_code: "SOC-1", branch_code: "BR-1", cost_center_code: "CC-1", cost_center: "CC-1"
  });
  assert.match(organizationSelection(tree, { society_code: "SOC-1", branch_code: "BR-1", cost_center_code: "" }, { requireAssignment: true }).error, /centro/i);
  assert.equal(organizationAssignmentChanged({ society_code: "SOC-1", branch_code: "BR-1", cost_center_code: "CC-INACTIVE" }, { society_code: "SOC-1", branch_code: "BR-1", cost_center_code: "CC-INACTIVE" }), false);
  assert.equal(organizationAssignmentChanged({ society_code: "SOC-1", branch_code: "BR-1", cost_center_code: "CC-1" }, { society_code: "SOC-1", branch_code: "BR-1", cost_center_code: "CC-2" }), true);
});

test("entity party matching normalizes NIT and prefill requires explicit selection", () => {
  const parties = [{ id: 7, tax_id: "900.123.456", verification_digit: 7, legal_name: "Tercero Salud" }];
  assert.equal(normalizePartyDocument("900.123.456-7"), "9001234567");
  assert.equal(findPartyByDocument(parties, "9001234567")?.id, 7);
  assert.deepEqual(commonPartyFields(parties[0]), { nit: "900.123.456", verification_digit: "7", legal_name: "Tercero Salud" });
  assert.equal(findPartyByDocument(parties, "900.123.456-8"), null);
});

test("employee page exposes explicit accounting dimensions and legacy preservation", () => {
  const source = read("app/dashboard/talento-humano/empleados/page.tsx");
  assert.match(source, /Sucursal contable/);
  assert.match(source, /Centro de costos contable/);
  assert.match(source, /empleados\/organization-options/);
  assert.doesNotMatch(source, /accounting\/organization-tree/);
  assert.match(source, /Selecciona la sucursal y el centro de costo contable/);
  assert.match(source, /empleado es legado/);
  assert.match(source, /aria-label/);
});

test("entity page uses HR-readable party lookup and explicit prefill selection", () => {
  const source = read("app/dashboard/talento-humano/entidades/page.tsx");
  assert.match(source, /entidades\/terceros/);
  assert.doesNotMatch(source, /accounting\/third-parties/);
  assert.match(source, /Buscar tercero contable/);
  assert.match(source, /partyLoading/);
  assert.match(source, /findPartyByDocument/);
  assert.match(source, /selectAccountingParty/);
  assert.match(source, /Seleccionar tercero contable/);
  assert.match(source, /Encontramos un tercero contable/);
  assert.match(source, /commonPartyFields/);
});
