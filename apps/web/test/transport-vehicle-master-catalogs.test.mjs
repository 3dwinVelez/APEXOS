import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const apiSource = fs.readFileSync(path.resolve(directory, "../lib/api.ts"), "utf8");
const transportSource = fs.readFileSync(path.resolve(directory, "../app/dashboard/transporte/page.tsx"), "utf8");
const ratesSource = fs.readFileSync(path.resolve(directory, "../app/dashboard/transporte/tarifas/page.tsx"), "utf8");
const adminSource = fs.readFileSync(path.resolve(directory, "../app/dashboard/administracion/page.tsx"), "utf8");

test("los maestros vehiculares y de tarifas viven en los defaults persistentes de user-master-data", () => {
  for (const catalog of ["vehicle_types", "vehicle_categories", "vehicle_brands", "vehicle_lines", "vehicle_colors", "vehicle_fuels", "vehicle_body_types", "units_of_measure", "service_levels", "departments", "cities", "municipalities", "currencies"]) {
    assert.match(apiSource, new RegExp(`\\b${catalog}:`), `${catalog} debe existir en defaultUserMasterData`);
  }
  assert.match(apiSource, /vehicle_lines: \[[\s\S]+?\]\.map\(\(\[code, name, parent_code\]\) => \(\{ code, name, parent_code \}\)\)/);
  assert.match(apiSource, /\["toyota", "Toyota"\]/);
  assert.match(apiSource, /\["hilux", "Hilux", "toyota"\]/);
  assert.match(apiSource, /service_levels: \[\["normal", "Normal"\]/);
  assert.match(apiSource, /cities: \[\s*\["bogota", "Bogota", "bogota_dc"\]/);
  assert.match(apiSource, /municipalities: \[\s*\["bogota", "Bogota", "bogota"\]/);
  assert.match(apiSource, /\["envigado", "Envigado", "medellin"\]/);
  assert.match(apiSource, /\["medellin", "Medellin", "antioquia"\]/);
  assert.match(apiSource, /currencies: \[\["COP", "Peso colombiano \(COP\)"\], \["USD", "Dolar estadounidense \(USD\)"\], \["EUR", "Euro \(EUR\)"\]\]/);
  assert.match(apiSource, /service_levels: "Niveles de servicio",\s*\n\s*departments: "Departamentos",\s*\n\s*cities: "Ciudades",\s*\n\s*municipalities: "Municipios",\s*\n\s*currencies: "Monedas"/);
});

test("la carga y escritura Supabase transportan parent_code para la jerarquia marca-linea", () => {
  assert.match(apiSource, /select=catalog_id,company_id,code,name,description,active,sort_order,parent_code/);
  assert.match(apiSource, /\.\.\.\(item\.parent_code \? \{ parent_code: item\.parent_code \} : \{\}\)/);
  assert.match(apiSource, /parent_code: typeof body\.parent_code === "string" && body\.parent_code\.trim\(\) \? body\.parent_code\.trim\(\) : null/);
  assert.match(apiSource, /parent_code: item\.parent_code/);
});

test("la escritura de maestros va a un catalogo por empresa y nunca pisa el global", () => {
  assert.match(apiSource, /async function ensureSupabaseCompanyMasterCatalog\(companyId: string, catalogCode: string\)/);
  assert.match(apiSource, /COMPANY_MASTER_CATALOG_NAMES/);
  assert.match(apiSource, /metadata: \{ source: "apexos_company_masters" \}/);
  assert.match(apiSource, /const catalogId = await ensureSupabaseCompanyMasterCatalog\(membership\.company_id, catalogCode\)/);
  assert.doesNotMatch(apiSource, /or=\(and\(code\.eq\.\$\{encodeURIComponent\(catalogCode\)\},company_id\.eq\.\$\{encodeURIComponent\(membership\.company_id\)\}\),and\(code\.eq\.\$\{encodeURIComponent\(catalogCode\)\},company_id\.is\.null\)\)/);
});

test("la carga fusiona catalogos global y de empresa por codigo", () => {
  assert.match(apiSource, /const catalogsByCode = new Map<string, Array<\(typeof catalogs\)\[number\]>>\(\)/);
  assert.match(apiSource, /const catalogIds = new Set\(codeCatalogs\.map\(\(catalog\) => catalog\.id\)\)/);
  assert.match(apiSource, /catalogItems\.filter\(\(item\) => item\.company_id == null\)/);
  assert.match(apiSource, /catalogItems\.filter\(\(item\) => item\.company_id === membership\.company_id\)/);
  assert.match(apiSource, /active: false,\s*\n\s*sort_order: Number\(previous\.sort_order \|\| 100\)/);
});

test("loadVehicleMasterCatalogs expone los catálogos que consumen la ficha vehicular y el tarifario", () => {
  assert.match(apiSource, /export type VehicleMasterCatalogs = \{[\s\S]+?\};/);
  assert.match(apiSource, /export async function loadVehicleMasterCatalogs\(\): Promise<VehicleMasterCatalogs>/);
  for (const key of ["types", "categories", "brands", "lines", "colors", "fuels", "bodyTypes", "locations", "costCenters", "capacityUnits", "departments", "cities", "municipalities", "serviceLevels", "currencies"]) {
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

test("administracion administra los catálogos vehiculares y de tarifas con jerarquía padre-hijo", () => {
  for (const [code, label] of [
    ["vehicle_types", "Tipos de vehiculo"],
    ["vehicle_categories", "Categorias de vehiculo"],
    ["vehicle_brands", "Marcas de vehiculo"],
    ["vehicle_lines", "Lineas de vehiculo"],
    ["vehicle_colors", "Colores de vehiculo"],
    ["vehicle_fuels", "Combustibles de vehiculo"],
    ["vehicle_body_types", "Carrocerias de vehiculo"],
    ["units_of_measure", "Unidades de medida"],
    ["service_levels", "Niveles de servicio"],
    ["departments", "Departamentos"],
    ["cities", "Ciudades"],
    ["municipalities", "Municipios"],
    ["currencies", "Monedas"]
  ]) {
    assert.match(adminSource, new RegExp(`\\["${code}", "${label}"\\]`), `${label} debe estar en catalogOptions`);
  }
  assert.match(adminSource, /useState\(\{ catalog: "positions", code: "", name: "", description: "", parent_code: "" \}\)/);
  assert.match(adminSource, /const CATALOG_PARENT_CONFIG: Record<string, \{ parentCatalog[^}]+\}> = \{/);
  assert.match(adminSource, /vehicle_lines: \{ parentCatalog: "vehicle_brands", fieldLabel: "Marca \(padre\)", emptyLabel: "Sin marca \(uso general\)", columnLabel: "Marca" \}/);
  assert.match(adminSource, /cities: \{ parentCatalog: "departments", fieldLabel: "Departamento \(padre\)", emptyLabel: "Sin departamento \(uso general\)", columnLabel: "Departamento" \}/);
  assert.match(adminSource, /municipalities: \{ parentCatalog: "cities", fieldLabel: "Ciudad \(padre\)", emptyLabel: "Sin ciudad \(uso general\)", columnLabel: "Ciudad" \}/);
  assert.match(adminSource, /\{ code: "envigado", name: "Envigado", parent_code: "medellin" \}/);
  assert.match(adminSource, /const parentConfig = CATALOG_PARENT_CONFIG\[catalogDraft\.catalog\];/);
  assert.match(adminSource, /for \(const parent of \(masterData\[parentConfig\.parentCatalog\] \|\| \[\]\)\)/);
  assert.match(adminSource, /\.\.\.\(CATALOG_PARENT_CONFIG\[catalogDraft\.catalog\] \? \{ parent_code: catalogDraft\.parent_code\.trim\(\) \} : \{\}\)/);
  assert.match(adminSource, /\{parentConfig \? <SelectField label=\{parentConfig\.fieldLabel\} value=\{catalogDraft\.parent_code\}/);
  assert.match(adminSource, /\{parentConfig \? <th className="px-3 py-2">\{parentConfig\.columnLabel\}<\/th> : null\}/);
  assert.match(adminSource, /colSpan=\{\(isOperationalCatalog \? 4 : 5\) \+ \(parentConfig \? 1 : 0\)\}/);
  assert.match(adminSource, /parent_code: item\.parent_code \|\| ""/);
});

test("el tarifario usa ModalFrame y selects alimentados por los maestros del módulo", () => {
  assert.match(ratesSource, /import \{ api, isActiveMasterItem, loadVehicleMasterCatalogs \} from "@\/lib\/api";/);
  assert.match(ratesSource, /import type \{ VehicleMasterCatalogs \} from "@\/lib\/api";/);
  assert.match(ratesSource, /import \{ ModalFrame \} from "@\/components\/ui\/ModalFrame";/);
  assert.match(ratesSource, /<ModalFrame maxWidth="md:max-w-3xl" onClose=\{\(\) => setOpen\(false\)\} title="Nueva versión tarifaria">/);
  assert.doesNotMatch(ratesSource, /fixed inset-0 z-50 grid place-items-center/);
  assert.match(ratesSource, /loadVehicleMasterCatalogs\(\)/);
  assert.match(ratesSource, /<RateForm carriers=\{carriers\} origins=\{origins\} masters=\{masters\} onSubmit=\{createRate\} \/>/);
  assert.match(ratesSource, /const code = departments\.find\(\(item\) => item\.name === departmentName\)\?\.code;/);
  assert.match(ratesSource, /item\.parent_code === code/);
  assert.match(ratesSource, /codes\.has\(item\.parent_code\)/);
  assert.match(ratesSource, /onChange=\{\(value\) => \{ setOriginDepartment\(value\); setOriginCity\(""\); setOriginMunicipality\(""\); \}\}/);
  assert.match(ratesSource, /onChange=\{\(value\) => \{ setDestinationDepartment\(value\); setDestinationCity\(""\); setDestinationMunicipality\(""\); \}\}/);
  for (const name of ["origin_department", "origin_city", "origin_municipality", "destination_department", "destination_city", "destination_municipality", "service_level", "vehicle_type", "currency"]) {
    assert.match(ratesSource, new RegExp(`<Select name="${name}"`), `${name} debe ser un select de maestros`);
  }
  assert.match(ratesSource, /label="Origen operativo \(sede\)"/);
  assert.match(ratesSource, /label="Municipio origen"/);
  assert.match(ratesSource, /label="Municipio destino"/);
  assert.match(ratesSource, /empty="Cualquier departamento"/);
  assert.match(ratesSource, /empty="Cualquier ciudad"/);
  assert.match(ratesSource, /empty="Cualquier municipio"/);
  assert.match(ratesSource, /empty="Cualquier servicio"/);
  assert.match(ratesSource, /empty="Cualquier vehículo"/);
  assert.match(ratesSource, /origin_department: data\.get\("origin_department"\), origin_city: data\.get\("origin_city"\), origin_municipality: data\.get\("origin_municipality"\)/);
  assert.match(ratesSource, /destination_municipality: data\.get\("destination_municipality"\)/);
  assert.match(ratesSource, /function rateOriginLabel\(rate: RateCard\)/);
  assert.match(ratesSource, /function rateDestinationLabel\(rate: RateCard\)/);
  assert.match(ratesSource, /los campos vacíos aplican a cualquier valor/);
});

test("los maestros se agrupan por modulo para no perder al usuario", () => {
  assert.match(adminSource, /const catalogGroups: Array<\[string, Array<\[string, string\]>\]> = \[/);
  for (const group of ["Usuarios y acceso", "Organizacion", "Vehiculos y transporte", "Servicios", "Financiero"]) {
    assert.match(adminSource, new RegExp(`\\["${group}", \\[`), `${group} debe ser un grupo de catalogos`);
  }
  for (const code of ["vehicle_categories", "vehicle_brands", "vehicle_lines", "units_of_measure", "service_levels", "departments", "cities", "municipalities", "currencies", "banks", "positions", "service_types"]) {
    assert.match(adminSource, new RegExp(`\\["${code}", `), `${code} debe pertenecer a un grupo`);
  }
  assert.match(adminSource, /<SelectField label="Catalogo maestro"[\s\S]+?optionGroups=\{catalogGroups\}/);
  assert.match(adminSource, /<optgroup key=\{group\} label=\{group\}>/);
  assert.match(adminSource, /const selectedCatalogGroup = catalogGroups\.find/);
});
