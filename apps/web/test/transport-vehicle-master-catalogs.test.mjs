import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const apiSource = fs.readFileSync(path.resolve(directory, "../lib/api.ts"), "utf8");
const transportSource = fs.readFileSync(path.resolve(directory, "../app/dashboard/transporte/page.tsx"), "utf8");
const adminSource = fs.readFileSync(path.resolve(directory, "../app/dashboard/administracion/page.tsx"), "utf8");

test("los maestros vehiculares viven en los defaults persistentes de user-master-data", () => {
  for (const catalog of ["vehicle_types", "vehicle_categories", "vehicle_brands", "vehicle_lines", "vehicle_colors", "vehicle_fuels", "vehicle_body_types", "units_of_measure"]) {
    assert.match(apiSource, new RegExp(`\\b${catalog}:`), `${catalog} debe existir en defaultUserMasterData`);
  }
  assert.match(apiSource, /vehicle_lines: \[[\s\S]+?\]\.map\(\(\[code, name, parent_code\]\) => \(\{ code, name, parent_code \}\)\)/);
  assert.match(apiSource, /\["toyota", "Toyota"\]/);
  assert.match(apiSource, /\["hilux", "Hilux", "toyota"\]/);
});

test("la carga y escritura Supabase transportan parent_code para la jerarquia marca-linea", () => {
  assert.match(apiSource, /select=catalog_id,company_id,code,name,description,active,sort_order,parent_code/);
  assert.match(apiSource, /\.\.\.\(item\.parent_code \? \{ parent_code: item\.parent_code \} : \{\}\)/);
  assert.match(apiSource, /parent_code: typeof body\.parent_code === "string" && body\.parent_code\.trim\(\) \? body\.parent_code\.trim\(\) : null/);
  assert.match(apiSource, /parent_code: item\.parent_code/);
});

test("loadVehicleMasterCatalogs expone los catálogos que consume la ficha vehicular", () => {
  assert.match(apiSource, /export type VehicleMasterCatalogs = \{[\s\S]+?\};/);
  assert.match(apiSource, /export async function loadVehicleMasterCatalogs\(\): Promise<VehicleMasterCatalogs>/);
  for (const key of ["types", "categories", "brands", "lines", "colors", "fuels", "bodyTypes", "locations", "costCenters", "capacityUnits"]) {
    assert.match(apiSource, new RegExp(`\\b${key}: pick\\("`), `${key} debe mapearse en loadVehicleMasterCatalogs`);
  }
  assert.match(apiSource, /export function isActiveMasterItem/);
});

test("la ficha vehicular consume los maestros con selects nativos y cascada marca-linea", () => {
  assert.match(transportSource, /import \{ api, isActiveMasterItem, loadVehicleMasterCatalogs \} from "@\/lib\/api";/);
  assert.match(transportSource, /loadVehicleMasterCatalogs\(\)/);
  assert.doesNotMatch(transportSource, /ComboInput|<datalist/);
  assert.match(transportSource, /function selectProps\(pairs: Array<\[string, string\]>\)/);
  assert.match(transportSource, /function lineItemsForBrand\(brandValue: string\)/);
  assert.match(transportSource, /const linePairs: Array<\[string, string\]> = \[\["", "Sin linea"\], \.\.\.catalogPairs\(lineItemsForBrand\(form\.brand\), form\.line\)\]/);
  assert.match(transportSource, /<Select label="Tipo de vehiculo \*"/);
  assert.match(transportSource, /<Select[\s\S]+?label="Marca \*"/);
  assert.match(transportSource, /<Select label="Linea \/ referencia"/);
  assert.match(transportSource, /const keepLine = lineItemsForBrand\(value\)\.some/);
});

test("la ficha enlaza sucursal y crea el centro de costo en la estructura contable", () => {
  assert.match(transportSource, /type OrgTree = \{ societies: OrgSociety\[\]; branches: OrgBranch\[\]; cost_centers: OrgCostCenter\[\] \}/);
  assert.match(transportSource, /api<OrgTree>\("\/api\/v1\/accounting\/organization-tree"\)/);
  assert.match(transportSource, /function orgUnitPairs\(/);
  assert.match(transportSource, /orgUnitPairs\(branchesForSite, form\.base_site, "Seleccionar sucursal"\)/);
  assert.match(transportSource, /const keepCost = orgTree \? orgTree\.cost_centers\.some\(\(center\) => center\.code === current\.cost_center && center\.branch_code === value\) : true/);
  assert.match(transportSource, /\[\["", "Seleccionar sede base"\], \.\.\.catalogPairs\(vehicleCatalogs\?\.locations, form\.base_site\)\]/);
  assert.match(transportSource, /const \[newCostCenter, setNewCostCenter\] = useState\(\{ code: "", name: "" \}\)/);
  assert.match(transportSource, /label="Codigo centro de costo"/);
  assert.match(transportSource, /label="Nombre centro de costo"/);
  assert.match(transportSource, /disabled=\{!form\.base_site\}/);
  assert.match(transportSource, /Completa codigo y nombre del centro de costo o deja ambos vacios\./);
  assert.match(transportSource, /const branch = orgTree\.branches\.find\(\(item\) => item\.code === form\.base_site && item\.active !== false\)/);
  assert.match(transportSource, /body: JSON\.stringify\(\{ type: "cost_center", society_code: branch\.society_code, branch_code: branch\.code, code: newCode, name: newName \}\)/);
  assert.match(transportSource, /const payload = \{ \.\.\.vehiclePayload\(form\), cost_center: costCenterCode \|\| null \}/);
  assert.match(transportSource, /body: JSON\.stringify\(\{ type: "branch", society_code: societyCode, code, name \}\)/);
  assert.match(transportSource, /\+ Nueva sucursal/);
  assert.match(transportSource, /se reemplaza solo si digitas uno nuevo/);
});

test("año y unidad son seleccionables en la ficha", () => {
  assert.match(transportSource, /for \(let year = 1980; year <= currentYear \+ 1; year \+= 1\)/);
  assert.match(transportSource, /<Select label="Modelo \/ ano"/);
  assert.match(transportSource, /<Select[\s\S]+?label="Sucursal base \*"/);
  assert.match(transportSource, /<Select label="Unidad"/);
});

test("administracion administra los catálogos vehiculares con jerarquía marca-linea", () => {
  for (const [code, label] of [
    ["vehicle_types", "Tipos de vehiculo"],
    ["vehicle_categories", "Categorias de vehiculo"],
    ["vehicle_brands", "Marcas de vehiculo"],
    ["vehicle_lines", "Lineas de vehiculo"],
    ["vehicle_colors", "Colores de vehiculo"],
    ["vehicle_fuels", "Combustibles de vehiculo"],
    ["vehicle_body_types", "Carrocerias de vehiculo"],
    ["units_of_measure", "Unidades de medida"]
  ]) {
    assert.match(adminSource, new RegExp(`\\["${code}", "${label}"\\]`), `${label} debe estar en catalogOptions`);
  }
  assert.match(adminSource, /useState\(\{ catalog: "positions", code: "", name: "", description: "", parent_code: "" \}\)/);
  assert.match(adminSource, /catalogDraft\.catalog === "vehicle_lines" \? \{ parent_code: catalogDraft\.parent_code\.trim\(\) \} : \{\}/);
  assert.match(adminSource, /<SelectField label="Marca \(padre\)"/);
  assert.match(adminSource, /\{isLineCatalog \? <th className="px-3 py-2">Marca<\/th> : null\}/);
  assert.match(adminSource, /colSpan=\{\(isOperationalCatalog \? 4 : 5\) \+ \(isLineCatalog \? 1 : 0\)\}/);
  assert.match(adminSource, /parent_code: item\.parent_code \|\| ""/);
});

test("los maestros se agrupan por modulo para no perder al usuario", () => {
  assert.match(adminSource, /const catalogGroups: Array<\[string, Array<\[string, string\]>\]> = \[/);
  for (const group of ["Usuarios y acceso", "Organizacion", "Vehiculos y transporte", "Servicios", "Financiero"]) {
    assert.match(adminSource, new RegExp(`\\["${group}", \\[`), `${group} debe ser un grupo de catalogos`);
  }
  for (const code of ["vehicle_categories", "vehicle_brands", "vehicle_lines", "units_of_measure", "banks", "positions", "service_types"]) {
    assert.match(adminSource, new RegExp(`\\["${code}", `), `${code} debe pertenecer a un grupo`);
  }
  assert.match(adminSource, /<SelectField label="Catalogo maestro"[\s\S]+?optionGroups=\{catalogGroups\}/);
  assert.match(adminSource, /<optgroup key=\{group\} label=\{group\}>/);
  assert.match(adminSource, /const selectedCatalogGroup = catalogGroups\.find/);
});
